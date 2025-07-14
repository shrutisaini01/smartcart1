import React, { useState, useEffect, useRef } from 'react';
import useCurrencyInfo from './useCurrencyInfo'; // Assuming useCurrencyInfo.js is in the same directory

function App() {
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [shoppingList, setShoppingList] = useState([]);
    const [budget, setBudget] = useState(''); // This will now store the budget in INR
    const [currentTotal, setCurrentTotal] = useState(0); // Assumed to be in INR
    const [suggestions, setSuggestions] = useState([]);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [currency, setCurrency] = useState('USD'); // Target display currency for total bill
    const [convertedTotal, setConvertedTotal] = useState(0);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({});

    // New states for budget input
    const [rawBudgetInput, setRawBudgetInput] = useState(''); // User's typed budget amount
    const [budgetInputCurrency, setBudgetInputCurrency] = useState('INR'); // Currency of the user's budget input

    const recognitionRef = useRef(null);
    const fileInputRef = useRef(null);

    // Fetch exchange rates based on INR as the base currency
    const { data: exchangeRates, isLoading: ratesLoading, error: ratesError } = useCurrencyInfo('inr');

    useEffect(() => {
        if ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            const recognition = new SpeechRecognition();
            recognition.lang = 'en-US';
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onresult = (event) => {
                const speechResult = event.results[0][0].transcript;
                processCommand({ command: speechResult });
            };

            recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                setMessage(`Speech recognition error: ${event.error}. Please try again.`);
                setListening(false);
                setLoading(false);
            };

            recognition.onend = () => {
                setListening(false);
            };

            recognitionRef.current = recognition;
        } else {
            setMessage('Speech Recognition not supported in this browser.');
        }
    }, []);

    const toggleListening = () => {
        if (listening) {
            recognitionRef.current.stop();
            setListening(false);
        } else {
            setTranscript('');
            setMessage('');
            setSuggestions([]);
            setLoading(true);
            try {
                recognitionRef.current.start();
                setListening(true);
                setMessage('Listening...');
            } catch (error) {
                console.error('Error starting speech recognition:', error);
                setMessage('Error starting microphone. Please ensure microphone access is granted.');
                setLoading(false);
                setListening(false);
            }
        }
    };

    // Unified function to process commands (text or image)
    const processCommand = async ({ command, image }) => {
        setLoading(true);
        setMessage('Processing your request...');
        try {
            const payload = {
                currentCart: shoppingList,
                currentBudget: budget
            };

            if (command) {
                payload.command = command;
            } else if (image) {
                payload.image = image; // Base64 image data
                setMessage('Processing image...');
            }

            const response = await fetch('http://localhost:3001/api/process-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            const data = await response.json();

            if (response.ok) {
                setShoppingList(data.updatedCart || []);
                if (data.budgetAmount && data.budgetCurrencyCode) {
                    const convertedBudget = convertAmountToINR(parseFloat(data.budgetAmount), data.budgetCurrencyCode);
                    setBudget(convertedBudget);
                    setRawBudgetInput(data.budgetAmount.toString());
                    setBudgetInputCurrency(data.budgetCurrencyCode.toUpperCase());
                } else {
                    setBudget(data.budget || budget);
                }
                setCurrentTotal(data.totalBill || 0);
                setSuggestions(data.suggestions || []);
                setMessage(data.message || 'Items added to cart.');
            } else {
                setMessage(`Error: ${data.message || 'Failed to process request.'}`);
            }
        } catch (error) {
            console.error('Error sending command to backend:', error);
            setMessage('Network error. Could not connect to the AI assistant.');
        } finally {
            setLoading(false);
        }
    };

    const handleTextInputSubmit = (e) => {
        e.preventDefault();
        if (transcript.trim()) {
            processCommand({ command: transcript });
        } else {
            setMessage('Please enter a command or speak into the microphone.');
        }
    };

    const handleFileUpload = (event) => {
        const files = event.target.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (!file.type.startsWith('image/')) {
                setMessage('Please upload an image file (e.g., JPG, PNG, GIF).');
                event.target.value = null;
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const fileContent = e.target.result;
                setTranscript('');
                processCommand({ image: fileContent });
            };
            reader.onerror = (e) => {
                console.error('FileReader error:', reader.error, e);
                setMessage(`Error reading file: ${reader.error?.message || 'Unknown error'}. Please try a different file.`);
            };
            try {
                reader.readAsDataURL(file);
                setMessage(`Processing image file: ${file.name}...`);
            } catch (error) {
                console.error('Error initiating FileReader:', error);
                setMessage(`Could not read file: ${error.message}.`);
            }
        } else {
            setMessage('No file selected or file selection cancelled.');
        }
        event.target.value = null;
    };

    const triggerFileUpload = () => {
        fileInputRef.current.click();
    };

    const convertCurrency = (targetCurrencyCode, amountInINR) => {
        if (typeof amountInINR !== 'number' || isNaN(amountInINR)) {
            setConvertedTotal(0);
            return;
        }

        if (amountInINR === 0) {
            setConvertedTotal(0);
            return;
        }

        if (ratesLoading || ratesError || !exchangeRates || Object.keys(exchangeRates).length === 0) {
            setConvertedTotal(amountInINR);
            return;
        }

        const lowerTargetCurrency = targetCurrencyCode.toLowerCase();

        if (!exchangeRates[lowerTargetCurrency]) {
            console.warn(`Exchange rate from INR to ${targetCurrencyCode} not found.`);
            setConvertedTotal(amountInINR);
            return;
        }

        const rate = exchangeRates[lowerTargetCurrency];
        const converted = amountInINR * rate;

        setConvertedTotal(parseFloat(converted.toFixed(2)));
    };

    const convertAmountToINR = (amount, fromCurrencyCode) => {
        if (typeof amount !== 'number' || isNaN(amount) || amount === 0) {
            return 0;
        }
        if (ratesLoading || ratesError || !exchangeRates || Object.keys(exchangeRates).length === 0) {
            console.warn("Exchange rates not loaded for budget conversion, returning original amount.");
            return amount;
        }

        const lowerFromCurrency = fromCurrencyCode.toLowerCase();

        if (lowerFromCurrency === 'inr') {
            return parseFloat(amount.toFixed(2));
        }

        const rateFromINR = exchangeRates[lowerFromCurrency];

        if (typeof rateFromINR !== 'number' || rateFromINR === 0) {
            console.error(`Rate for ${fromCurrencyCode} not found or is zero for conversion to INR.`);
            return amount;
        }

        const convertedToINR = amount / rateFromINR;
        return parseFloat(convertedToINR.toFixed(2));
    };

    useEffect(() => {
        const parsedAmount = parseFloat(rawBudgetInput);
        if (!isNaN(parsedAmount) && parsedAmount > 0) {
            const convertedBudgetInINR = convertAmountToINR(parsedAmount, budgetInputCurrency);
            setBudget(convertedBudgetInINR);
        } else {
            setBudget('');
        }
    }, [rawBudgetInput, budgetInputCurrency, exchangeRates, ratesLoading, ratesError]);

    useEffect(() => {
        const normalizedCurrency = currency.toLowerCase();
        if (typeof currentTotal === 'number' && !isNaN(currentTotal)) {
            convertCurrency(normalizedCurrency, currentTotal);
        } else {
            setConvertedTotal(0);
        }
    }, [currency, currentTotal, exchangeRates, ratesLoading, ratesError]);

    const handleCancel = () => {
        setModalContent({
            title: "Confirm Cancellation",
            message: "Are you sure you want to cancel your current shopping list and start over?",
            onConfirm: () => {
                setShoppingList([]);
                setBudget('');
                setCurrentTotal(0);
                setSuggestions([]);
                setTranscript('');
                setMessage('Shopping list cleared. You can start a new order.');
                setShowModal(false);
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    const handleFinalize = async () => {
        if (shoppingList.length === 0) {
            setMessage('Your cart is empty. Please add items before finalizing.');
            return;
        }

        setModalContent({
            title: "Confirm Order Finalization",
            message: "Are you sure you want to finalize your order? This will simulate placing the order.",
            onConfirm: async () => {
                setLoading(true);
                setMessage('Finalizing your order...');
                try {
                    const response = await fetch('http://localhost:3001/api/finalize-order', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ shoppingList, totalBill: currentTotal, budget }),
                    });
                    const data = await response.json();

                    if (response.ok) {
                        setMessage(data.message || 'Order finalized successfully!');
                        setShoppingList([]);
                        setBudget('');
                        setCurrentTotal(0);
                        setSuggestions([]);
                        setTranscript('');
                    } else {
                        setMessage(`Error finalizing order: ${data.message || 'Please try again.'}`);
                    }
                } catch (error) {
                    console.error('Error finalizing order:', error);
                    setMessage('Network error. Could not finalize order.');
                } finally {
                    setLoading(false);
                    setShowModal(false);
                }
            },
            onCancel: () => setShowModal(false)
        });
        setShowModal(true);
    };

    const ConfirmationModal = ({ title, message, onConfirm, onCancel }) => {
        return (
            <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                    <h3 className="text-xl font-semibold mb-4 text-gray-800">{title}</h3>
                    <p className="mb-6 text-gray-700">{message}</p>
                    <div className="flex justify-end space-x-3">
                        <button
                            onClick={onCancel}
                            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors duration-200"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="fixed inset-0 bg-blue-700 text-white overflow-auto">
            <header className="bg-blue-700 shadow-sm py-3 px-6 flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <img src="https://www.pngplay.com/wp-content/uploads/9/Walmart-Logo-Transparent-Free-PNG.png" alt="Walmart Logo" className="h-8" />
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search everything at Walmart online and in store"
                            className="pl-10 pr-4 py-2 rounded-full border-2 bg-white text-black focus:outline-none focus:ring-2 focus:ring-blue-500 w-96"
                        />
                        <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                </div>
                <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-1 text-sm">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"></path></svg>
                        <span>Reorder</span>
                    </div>
                    <div className="flex items-center space-x-1 text-sm">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                        <span>Sign In</span>
                        <span className="font-semibold">Account</span>
                    </div>
                    <div className="flex items-center space-x-1 text-sm">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"></path></svg>
                        <span>$0.00</span>
                    </div>
                </div>
            </header>

            <main className="container mx-auto p-6">
                <div className="bg-white rounded-lg shadow-lg p-8">
                    <h1 className="text-3xl font-bold text-center text-blue-700 mb-6">
                        Walmart AI Shopping Assistant
                    </h1>

                    <div className="flex flex-col items-center mb-6">
                        <button
                            onClick={toggleListening}
                            className={`bg-blue-800 hover:bg-blue-700 p-5 rounded-full shadow-lg transition-all duration-300 text-white focus:outline-none focus:ring-4 focus:ring-blue-300 ${
                                loading ? 'opacity-50 cursor-not-allowed' : ''
                            }`}
                            disabled={loading}
                        >
                            <svg
                                className={`h-8 w-8 ${listening ? 'animate-pulse' : ''}`}
                                fill="currentColor"
                                viewBox="0 0 20 20"
                                xmlns="http://www.w3.org/2000/svg"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0 5 5 0 01-5 5v1.071a1 1 0 00.707 1.707l3.536 3.536a1 1 0 001.414-1.414L13.414 15H15a1 1 0 100-2h-1.586l-.707-.707A1 1 0 0011 11.93V14z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </button>

                        <p className="mt-3 text-lg font-medium text-gray-700">
                            {loading ? 'AI is thinking...' : listening ? 'Speak now...' : 'Click to speak your shopping list & budget'}
                        </p>
                        <p className="text-sm text-gray-500 mt-1">
                            Example: "I need 2 gallons of milk, a loaf of bread, and some apples. My budget is 500 rupees."
                        </p>
                    </div>

                    <form onSubmit={handleTextInputSubmit} className="mb-6">
                        <textarea
                            className="w-full p-3 border border-gray-300 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                            rows="3"
                            placeholder="Or type your request here..."
                            value={transcript}
                            onChange={(e) => setTranscript(e.target.value)}
                            disabled={loading}
                        ></textarea>
                        <div className="flex justify-between mt-3">
                            <button
                                type="submit"
                                className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors duration-200"
                                disabled={loading}
                            >
                                Process Text
                            </button>
                            {/* <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                                accept="image/*" // Changed to accept only image files
                            />
                            <button
                                type="button"
                                onClick={triggerFileUpload}
                                className="px-6 py-2 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 transition-colors duration-200"
                                disabled={loading}
                            >
                                Upload Bill (Image)
                            </button> */}
                        </div>
                    </form>

                    {message && (
                        <div className={`p-4 rounded-md mb-6 ${message.includes('Error') ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                            <p>{message}</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div className="bg-blue-50 p-5 rounded-lg shadow-sm">
                            <h2 className="text-xl font-semibold text-blue-800 mb-3">Your Budget</h2>
                            <div className="flex items-center space-x-2 mb-2">
                                <input
                                    type="number"
                                    placeholder="Enter budget"
                                    value={rawBudgetInput}
                                    onChange={(e) => setRawBudgetInput(e.target.value)}
                                    className="p-2 border border-gray-300 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 w-32"
                                />
                                <select
                                    value={budgetInputCurrency}
                                    onChange={(e) => setBudgetInputCurrency(e.target.value)}
                                    className="p-2 border border-gray-300 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="INR">INR (₹)</option>
                                    <option value="USD">USD ($)</option>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="GBP">GBP (£)</option>
                                </select>
                            </div>
                            <p className="text-2xl font-bold text-blue-900">
                                {budget ? `Budget (INR): ₹ ${parseFloat(budget).toFixed(2)}` : 'Budget Not Specified'}
                            </p>
                            {budget && currentTotal > parseFloat(budget) && (
                                <p className="text-red-600 font-semibold mt-2">
                                    Budget Exceeded by ₹ {(currentTotal - parseFloat(budget)).toFixed(2)}!
                                </p>
                            )}
                        </div>
                        <div className="bg-green-50 p-5 rounded-lg shadow-sm">
                            <h2 className="text-xl font-semibold text-green-800 mb-3">Current Total Bill</h2>
                            <p className="text-2xl font-bold text-green-900">
                                ₹ {currentTotal.toFixed(2)}
                            </p>
                            <div className="mt-2 flex items-center space-x-2">
                                <label htmlFor="currency-select" className="text-gray-700">Convert to:</label>
                                <select
                                    id="currency-select"
                                    value={currency}
                                    onChange={(e) => setCurrency(e.target.value)}
                                    className="p-2 border border-gray-300 text-black rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="USD">USD ($)</option>
                                    <option value="INR">INR (₹)</option>
                                    <option value="EUR">EUR (€)</option>
                                    <option value="GBP">GBP (£)</option>
                                </select>
                                <p className="text-xl font-bold text-black">
                                    {ratesLoading ? 'Loading...' : ratesError ? 'Error fetching rates' :
                                        (currency.toLowerCase() === 'usd' && `$ ${convertedTotal.toFixed(2)}`) ||
                                        (currency.toLowerCase() === 'inr' && `₹ ${convertedTotal.toFixed(2)}`) ||
                                        (currency.toLowerCase() === 'eur' && `€ ${convertedTotal.toFixed(2)}`) ||
                                        (currency.toLowerCase() === 'gbp' && `£ ${convertedTotal.toFixed(2)}`) ||
                                        `${currency} ${convertedTotal.toFixed(2)}`
                                    }
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-semibold text-gray-800 mb-4">Your Cart</h2>
                        {shoppingList.length === 0 ? (
                            <p className="text-gray-600">Your cart is empty. Speak or type to add items!</p>
                        ) : (
                            <ul className="space-y-3">
                                {shoppingList.map((item, index) => (
                                    <li key={index} className="flex justify-between items-center bg-gray-50 p-3 rounded-md shadow-sm">
                                        <span className="text-lg text-gray-800">{item.quantity} x {item.name} ({item.brand})</span>
                                        <span className="font-semibold text-gray-900">₹ {item.price.toFixed(2)}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {suggestions.length > 0 && (
                        <div className="mb-8 p-6 bg-yellow-50 rounded-lg shadow-md">
                            <h2 className="text-2xl font-semibold text-yellow-800 mb-4">AI Suggestions</h2>
                            <ul className="space-y-3">
                                {suggestions.map((suggestion, index) => (
                                    <li key={index} className="text-gray-700">
                                        <span className="font-medium">{suggestion.item}:</span> {suggestion.reason}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div className="flex justify-center space-x-4">
                        <button
                            onClick={handleCancel}
                            className="px-8 py-3 bg-red-600 text-white rounded-lg shadow-md hover:bg-red-700 transition-colors duration-200 text-lg font-semibold"
                            disabled={loading || shoppingList.length === 0}
                        >
                            Cancel / Shortlist Again
                        </button>
                        <button
                            onClick={handleFinalize}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors duration-200 text-lg font-semibold"
                            disabled={loading || shoppingList.length === 0}
                        >
                            Finalize Order
                        </button>
                    </div>
                </div>
            </main>

            {showModal && (
                <ConfirmationModal
                    title={modalContent.title}
                    message={modalContent.message}
                    onConfirm={modalContent.onConfirm}
                    onCancel={modalContent.onCancel}
                />
            )}
        </div>
    );
}

const ConfirmationModal = ({ title, message, onConfirm, onCancel }) => {
    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl max-w-sm w-full">
                <h3 className="text-xl font-semibold mb-4 text-gray-800">{title}</h3>
                <p className="mb-6 text-gray-700">{message}</p>
                <div className="flex justify-end space-x-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 bg-gray-200 text-gray-800 rounded-md hover:bg-gray-300 transition-colors duration-200"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors duration-200"
                    >
                        Confirm
                    </button>
                </div>
            </div>
            </div>
        );
    };

export default App;
