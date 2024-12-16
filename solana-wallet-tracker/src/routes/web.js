const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const { Wallet } = require('../models/Wallet');
const { Transaction } = require('../models/Transaction');
const coinGeckoService = require('../services/market/CoinGeckoService');

module.exports = function(walletMonitor) {
    // Get market data
    router.get('/api/market/solana', async (req, res) => {
        try {
            const marketData = await coinGeckoService.getSolanaMarketData();
            res.json(marketData);
        } catch (error) {
            console.error('Error fetching market data:', error);
            res.status(500).json({ error: 'Failed to fetch market data' });
        }
    });

    // Get all wallets
    router.get('/api/wallets', async (req, res) => {
        try {
            const wallets = await walletMonitor.getWallets();
            res.json(wallets);
        } catch (error) {
            console.error('Error fetching wallets:', error);
            res.status(500).json({ error: 'Failed to fetch wallets' });
        }
    });

    // Hide transaction
    router.post('/api/transactions/:signature/hide', async (req, res) => {
        try {
            const { signature } = req.params;
            await Transaction.findOneAndUpdate(
                { signature },
                { hidden: true }
            );
            res.json({ success: true });
        } catch (error) {
            console.error('Error hiding transaction:', error);
            res.status(500).json({ error: 'Failed to hide transaction' });
        }
    });

    // Get recent transactions
    router.get('/api/transactions/recent', async (req, res) => {
        try {
            // Get current market data for P/L calculation
            const currentMarketData = await coinGeckoService.getSolanaMarketData();

            // Get the 20 most recent non-hidden transactions
            const transactions = await Transaction.find({ hidden: false })
                .sort({ timestamp: -1 })
                .limit(20)
                .lean()
                .catch(err => {
                    // If collection doesn't exist yet, return empty array
                    if (err.name === 'MissingSchemaError' || err.message.includes('collection does not exist')) {
                        return [];
                    }
                    throw err;
                });

            if (!transactions || transactions.length === 0) {
                return res.json([]);
            }

            // Get wallet names for the transactions
            const walletAddresses = [...new Set(transactions.map(tx => tx.walletAddress))];
            const wallets = await Wallet.find({ address: { $in: walletAddresses } })
                .select('address name')
                .lean();

            // Create a map of wallet addresses to names
            const walletNames = new Map(wallets.map(w => [w.address, w.name]));

            // Add wallet names and P/L data to transactions
            const enrichedTransactions = transactions.map(tx => {
                const currentValue = tx.amount * currentMarketData.price;
                const originalValue = tx.amount * (tx.priceAtTransaction || currentMarketData.price);
                const profitLoss = currentValue - originalValue;
                const profitLossPercentage = (profitLoss / originalValue) * 100;

                return {
                    ...tx,
                    walletName: walletNames.get(tx.walletAddress) || 'Unknown',
                    currentPrice: currentMarketData.price,
                    currentValue,
                    originalValue,
                    profitLoss,
                    profitLossPercentage
                };
            });

            res.json(enrichedTransactions);
        } catch (error) {
            console.error('Error fetching recent transactions:', error);
            // Return empty array instead of error for a smoother UX
            res.json([]);
        }
    });

    // Add new wallet
    router.post('/api/wallets', async (req, res) => {
        try {
            const { address, name } = req.body;

            // Validate address
            try {
                new PublicKey(address);
            } catch (error) {
                return res.status(400).json({ error: 'Invalid wallet address' });
            }

            // Check if wallet exists in MongoDB
            const existingWallet = await Wallet.findOne({ address });
            if (existingWallet) {
                return res.status(409).json({ 
                    error: `Wallet ${address} already exists in the database`,
                    wallet: existingWallet
                });
            }

            // Add the new wallet
            const wallet = await walletMonitor.addWallet(address, name);
            res.json(wallet);
        } catch (error) {
            console.error('Error adding wallet:', error);
            res.status(500).json({ error: 'Failed to add wallet' });
        }
    });

    // Remove wallet
    router.delete('/api/wallets/:address', async (req, res) => {
        try {
            const { address } = req.params;
            await walletMonitor.removeWallet(address);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ error: 'Failed to remove wallet' });
        }
    });

    // Serve static files
    router.use(express.static('public'));

    return router;
}; 