require('dotenv').config();
const mongoose = require('mongoose');
const { Transaction } = require('./src/models/Transaction');
const coinGeckoService = require('./src/services/market/CoinGeckoService');

async function createTestTransaction() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGO_DB_NAME || 'crypto'
        });
        console.log('Connected to MongoDB');

        // Get current SOL price for comparison
        const currentMarketData = await coinGeckoService.getSolanaMarketData();
        console.log('Current SOL price:', currentMarketData.price);

        // Create test transaction
        const testTransaction = new Transaction({
            walletAddress: 'C2sx4zoiqvfbdztM7c2FYDCebt8zykCCP3UfN6Vi56yh',
            type: 'receive',
            amount: 100, // Test with 100 SOL
            timestamp: new Date('2024-12-14T04:10:00Z'),
            signature: 'test_transaction_' + Date.now(),
            priceAtTransaction: 75.23, // Historical price from Dec 14
            notified: true
        });

        await testTransaction.save();
        console.log('Test transaction created');

        // Calculate P/L
        const originalValue = testTransaction.amount * testTransaction.priceAtTransaction;
        const currentValue = testTransaction.amount * currentMarketData.price;
        const profitLoss = currentValue - originalValue;
        const profitLossPercentage = (profitLoss / originalValue) * 100;

        console.log('\nProfit/Loss Analysis:');
        console.log('Original Value:', originalValue.toFixed(2), 'USD');
        console.log('Current Value:', currentValue.toFixed(2), 'USD');
        console.log('P/L:', profitLoss.toFixed(2), 'USD');
        console.log('P/L %:', profitLossPercentage.toFixed(2), '%');

        await mongoose.connection.close();
        console.log('\nTest completed');
    } catch (error) {
        console.error('Error:', error);
        if (mongoose.connection.readyState === 1) {
            await mongoose.connection.close();
        }
    }
}

createTestTransaction(); 