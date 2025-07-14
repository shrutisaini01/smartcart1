// File: walmart-ai-backend/data/products.js
const products = [
    { id: 'milk-gal-whole', name: 'Whole Milk', brand: 'Great Value', price: 4.50, category: 'dairy' },
    { id: 'milk-gal-skim', name: 'Skim Milk', brand: 'Great Value', price: 4.20, category: 'dairy' },
    { id: 'milk-gal-local', name: 'Local Brand Milk', brand: 'Local Dairy', price: 3.50, category: 'dairy' },
    { id: 'bread-white', name: 'White Bread', brand: 'Wonder', price: 2.80, category: 'bakery' },
    { id: 'bread-wheat', name: 'Wheat Bread', brand: 'Nature\'s Own', price: 3.20, category: 'bakery' },
    { id: 'apples-red', name: 'Red Apples', brand: 'Generic', price: 1.50, unit: 'lb', category: 'produce' },
    { id: 'apples-green', name: 'Green Apples', brand: 'Generic', price: 1.60, unit: 'lb', category: 'produce' },
    { id: 'chicken-breast', name: 'Chicken Breast', brand: 'Tyson', price: 8.00, unit: 'lb', category: 'meat' },
    { id: 'rice-basmati', name: 'Basmati Rice', brand: 'Tilda', price: 12.00, unit: 'bag', category: 'pantry' },
    { id: 'eggs-dozen', name: 'Eggs (Dozen)', brand: 'Nellie\'s Free Range', price: 5.00, category: 'dairy' },
    { id: 'cereal-corn', name: 'Corn Flakes Cereal', brand: 'Kellogg\'s', price: 4.00, category: 'pantry' },
    { id: 'soda-coke', name: 'Coca-Cola (12-pack)', brand: 'Coke', price: 7.00, category: 'beverages' },
    { id: 'detergent-tide', name: 'Laundry Detergent', brand: 'Tide', price: 15.00, category: 'household' },
    { id: 'shampoo-dove', name: 'Shampoo', brand: 'Dove', price: 6.50, category: 'personal care' },
];

module.exports = products; // Export the products array