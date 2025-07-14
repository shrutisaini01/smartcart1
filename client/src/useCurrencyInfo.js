import { useEffect, useState } from "react";

function useCurrencyInfo(currency) {
    const [data, setData] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        const url = `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${currency}.json`;        
        fetch(url)
            .then((response) => {
                if (!response.ok) {
                    throw new Error('Failed to fetch currency data');
                }
                return response.json();
            })
            .then((responseData) => {
                if (responseData && responseData[currency]) {
                    setData(responseData[currency]);
                } else {
                    throw new Error('Invalid data format');
                }
                setIsLoading(false);
            })
            .catch((err) => {
                console.error("Error fetching currency data:", err);
                setError(err.message);
                setIsLoading(false);
                if (currency === 'usd') {
                    setData({
                        'inr': 74.5,
                        'eur': 0.85,
                        'gbp': 0.72,
                        'jpy': 110.14,
                        'cad': 1.25
                    });
                } else {
                    setData({});
                }
            });
    }, [currency]);

    return { data, isLoading, error };
}

export default useCurrencyInfo; 