require('dotenv').config();
const mongoose = require('mongoose');
const WalletMonitor = require('./src/services/wallet/WalletMonitor');
const winston = require('winston');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'test.log' })
    ]
});

async function runTest() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGO_DB_NAME || 'crypto'
        });
        console.log('Connected to MongoDB');

        // Initialize WalletMonitor
        const walletMonitor = new WalletMonitor(logger);
        await walletMonitor.start();
        console.log('Wallet monitor started');

        // Test wallet address
        const testWallet = {
            address: 'Az5a69RQdxXxxDqfQCKwY3LPcUEDYCdXpQ4EiZRsLEa8',
            name: 'Test Wallet'
        };

        // Add test wallet
        await walletMonitor.addWallet(testWallet.address, testWallet.name);
        console.log('Test wallet added');

        // Simulate receiving different tokens
        const testTransactions = [
            {
                type: 'receive',
                amount: 20,
                tokenSymbol: 'BLINK',
                signature: 'test_blink_' + Date.now()
            },
            {
                type: 'receive',
                amount: 1000,
                tokenSymbol: 'BONK',
                signature: 'test_bonk_' + Date.now()
            },
            {
                type: 'swap', // This should be ignored
                amount: 500,
                tokenSymbol: 'SHITCOIN',
                signature: 'test_swap_' + Date.now()
            }
        ];

        console.log('\nSimulating transactions...');
        for (const tx of testTransactions) {
            console.log(`\nProcessing ${tx.type} transaction for ${tx.tokenSymbol}`);
            await walletMonitor.handleTransaction(testWallet.address, tx);
            // Wait a bit between transactions
            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        console.log('\nTest completed. Please check:');
        console.log('1. Your Telegram for notifications (should see BLINK and BONK, but not SHITCOIN)');
        console.log('2. The dashboard at http://localhost:3000 for the new transactions');
        console.log('\nPress Ctrl+C to exit');

    } catch (error) {
        console.error('Test failed:', error);
    }
}

runTest(); 