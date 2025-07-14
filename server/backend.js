// File: walmart-ai-backend/server.js
// Import necessary modules
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors'); // For handling CORS if frontend and backend are on different ports

// Import simulated data
const products = require('./data/products');
const exchangeRates = require('./data/exchangeRates');

// Initialize Express app
const app = express();
const port = 3001; // Port for the backend server

// Middleware
app.use(bodyParser.json()); // To parse JSON request bodies
app.use(cors()); // Enable CORS for all origins (for development)

// --- Gemini API Configuration ---
// IMPORTANT: Replace with your actual API key. In a real application,
// this should be stored securely (e.g., environment variables) and not hardcoded.
const API_KEY = "AIzaSyBusoOM8B8c0WV5EgE50-5AC0GEzFyQurw"; // Replace this with your valid key
const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// --- Simulated Coupon/Offer Logic ---
// In a real application, this would be a more complex system.
const applyOffers = (cart) => {
    let discount = 0;
    let message = '';

    // Example 1: 10% off if total is over 50
    const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
    // Assuming prices are in a base currency (e.g., USD) for offer calculation, then converted for display
    // For simplicity in this prototype, let's assume offers apply to the base price unit (USD equivalent)
    // If your product prices are in INR, adjust the threshold accordingly.
    // Let's assume the products prices are in INR for now, as per the frontend display.
    if (subtotal > 500) { // Example: 10% off if total is over 500 INR
        const offerAmount = subtotal * 0.10;
        discount += offerAmount;
        message += `Applied 10% off for orders over ₹${(500).toFixed(2)}: -₹${offerAmount.toFixed(2)}. `;
    }

    // Example 2: Buy 2 Great Value milks, get 50 INR off
    const greatValueMilks = cart.filter(item => item.brand === 'Great Value' && item.category === 'dairy');
    if (greatValueMilks.length >= 2) {
        discount += 50.00; // 50 INR off
        message += `Applied ₹50 off for buying 2 Great Value milks. `;
    }

    return { discount, message };
};

// --- Helper function to convert currency ---
const convertCurrencyAmount = (amount, fromCurrency, toCurrency) => {
    if (fromCurrency === toCurrency) {
        return amount;
    }
    // Convert to USD first (assuming USD is the base for exchangeRates)
    const amountInUSD = amount / exchangeRates[fromCurrency];
    // Then convert from USD to target currency
    return amountInUSD * exchangeRates[toCurrency];
};

// --- API Endpoint: Process User Request (Voice/Text) ---
app.post('/api/process-request', async (req, res) => {
    const { command, currentCart = [], currentBudget } = req.body;

    if (!command) {
        return res.status(400).json({ message: 'No command provided.' });
    }

    let updatedCart = [...currentCart];
    let userBudget = parseFloat(currentBudget) || 0; // Initialize with current budget or 0

    try {
        // Step 1: Use Gemini to extract items, quantities, and budget from the command
        const chat = model.startChat({
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: "OBJECT",
                    properties: {
                    items: {
                        type: "ARRAY",
                        items: {
                        type: "OBJECT",
                        properties: {
                            name: { type: "STRING" },
                            quantity: { type: "NUMBER" } // ✅ removed invalid format
                        }
                        }
                    },
                    budget: { type: "NUMBER" }
                    },
                    required: ["items"]
                }
                }

        });

        const prompt = `
            Analyze the following shopping request.
            Extract the list of items with their quantities.
            If a budget is mentioned, extract it as a number.
            If no quantity is specified for an item, assume 1.
            If no budget is specified, do not include the budget field.

            Example 1: "I need 2 gallons of milk, a loaf of bread, and some apples. My budget is 500 rupees."
            Output: { "items": [{ "name": "milk", "quantity": 2 }, { "name": "bread", "quantity": 1 }, { "name": "apples", "quantity": 1 }], "budget": 500 }

            Example 2: "Add 3 bottles of coke and a bag of rice."
            Output: { "items": [{ "name": "coke", "quantity": 3 }, { "name": "rice", "quantity": 1 }] }

            Example 3: "I want to buy shampoo and laundry detergent."
            Output: { "items": [{ "name": "shampoo", "quantity": 1 }, { "name": "laundry detergent", "quantity": 1 }] }

            User request: "${command}"
        `;

        const result = await chat.sendMessage(prompt);
        const responseText = result.response.candidates[0].content.parts[0].text;
        const responseJson = JSON.parse(responseText);


        const requestedItems = responseJson.items || [];
        if (responseJson.budget) {
            userBudget = responseJson.budget; // Update budget if new one is provided
        }

        let message = '';
        let itemsAddedCount = 0;

        // Step 2: Match requested items to the simulated product database
        requestedItems.forEach(reqItem => {
            const foundProduct = products.find(p =>
                p.name.toLowerCase().includes(reqItem.name.toLowerCase()) ||
                reqItem.name.toLowerCase().includes(p.name.toLowerCase())
            );

            if (foundProduct) {
                // Check if item already exists in cart, then update quantity
                const existingItemIndex = updatedCart.findIndex(item => item.id === foundProduct.id);
                if (existingItemIndex > -1) {
                    updatedCart[existingItemIndex].quantity += reqItem.quantity;
                } else {
                    updatedCart.push({
                        id: foundProduct.id,
                        name: foundProduct.name,
                        brand: foundProduct.brand,
                        price: foundProduct.price, // Assuming product prices are in INR for simplicity
                        quantity: reqItem.quantity,
                    });
                }
                itemsAddedCount++;
            } else {
                message += `Could not find "${reqItem.name}". `;
            }
        });

        if (itemsAddedCount > 0) {
            message = `Added ${itemsAddedCount} item(s) to your cart. ` + message;
        } else if (!message) {
            message = "No recognizable items found in your request. Please try again.";
        }

        // Step 3: Calculate total bill and apply offers
        let subtotal = updatedCart.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const { discount, message: offerMessage } = applyOffers(updatedCart);
        let totalBill = subtotal - discount;
        if (totalBill < 0) totalBill = 0; // Ensure total doesn't go negative

        message += offerMessage;

        // Step 4: Check budget and provide suggestions if exceeded
        let suggestions = [];
        if (userBudget > 0 && totalBill > userBudget) {
            const budgetExceededBy = totalBill - userBudget;
            message += `Your current total of ₹${totalBill.toFixed(2)} exceeds your budget of ₹${userBudget.toFixed(2)} by ₹${budgetExceededBy.toFixed(2)}. `;

            // Use Gemini to suggest cheaper alternatives based on the current cart and budget constraint
            const suggestionPrompt = `
                The user's current shopping cart total is ₹${totalBill.toFixed(2)}, which exceeds their budget of ₹${userBudget.toFixed(2)}.
                The current items in their cart are: ${updatedCart.map(item => `${item.quantity} x ${item.name} (${item.brand})`).join(', ')}.
                Suggest ways to bring the total closer to the budget, focusing on cheaper alternatives from the following available products:
                ${products.map(p => `${p.name} (${p.brand}) at ₹${p.price.toFixed(2)}`).join('; ')}.
                The difference should be as minimum as possible. If the user told 500 then it must collect <=500 even if the amount exceeds it must not become more than 600.
                Provide suggestions in a structured JSON format, listing item and a brief reason.
                Output example:
                {
                    "suggestions": [
                        { "item": "Milk", "reason": "Choose the ₹3.50 Local Brand Milk instead of Great Value Whole Milk to save ₹1.00 per gallon." },
                        { "item": "Apples", "reason": "Consider buying a slightly cheaper variety of apples to save a few rupees." }
                    ]
                }
            `;
            const suggestionChat = model.startChat({
                generationConfig: {
                    responseMimeType: "application/json",
                    responseSchema: {
                        type: "OBJECT",
                        properties: {
                            suggestions: {
                                type: "ARRAY",
                                items: {
                                    type: "OBJECT",
                                    properties: {
                                        item: { type: "STRING" },
                                        reason: { type: "STRING" }
                                    }
                                }
                            }
                        }
                    }
                }
            });
            const suggestionResult = await suggestionChat.sendMessage(suggestionPrompt);
            const suggestionResponseText = suggestionResult.response.candidates[0].content.parts[0].text;
            const suggestionResponseJson = JSON.parse(suggestionResponseText);
            suggestions = suggestionResponseJson.suggestions || [];
        }

        res.json({
            updatedCart,
            budget: userBudget,
            totalBill,
            message,
            suggestions,
        });

    } catch (error) {
        console.error('Error processing request with Gemini:', error);
        res.status(500).json({ message: 'Error processing your request with AI. Please try again.' });
    }
});

// --- API Endpoint: Finalize Order ---
app.post('/api/finalize-order', (req, res) => {
    const { shoppingList, totalBill, budget } = req.body;

    if (!shoppingList || shoppingList.length === 0) {
        return res.status(400).json({ message: 'Cart is empty. Nothing to finalize.' });
    }

    // In a real application, this would involve:
    // 1. Saving the order to a database
    // 2. Processing payment
    // 3. Sending order confirmation emails/notifications
    // 4. Updating inventory

    console.log('--- Order Finalized ---');
    console.log('Shopping List:', shoppingList);
    console.log('Final Bill:', totalBill);
    console.log('User Budget:', budget);
    console.log('-----------------------');

    res.json({ message: 'Order successfully finalized! Thank you for shopping with Walmart AI.' });
});

// --- API Endpoint: Currency Conversion ---
app.post('/api/currency-convert', (req, res) => {
    const { amount, targetCurrency } = req.body;

    if (typeof amount !== 'number' || !targetCurrency) {
        return res.status(400).json({ message: 'Invalid amount or target currency provided.' });
    }

    // Assuming the 'amount' received from the frontend is always in INR (₹)
    const convertedAmount = convertCurrencyAmount(amount, 'INR', targetCurrency);
    res.json({ convertedAmount });
});

app.get('/', (req, res) => {
  res.send('✅ Walmart AI Backend is running!');
});



// Start the server
app.listen(port, () => {
    console.log(`Walmart AI Backend listening at http://localhost:${port}`);
});
