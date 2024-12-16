const express = require('express');
const router = express.Router();
const { PublicKey } = require('@solana/web3.js');
const { Wallet } = require('../models/Wallet');

module.exports = function(walletMonitor) {
    // Get all wallets
    router.get('/api/wallets', async (req, res) => {
        try {
            const wallets = await walletMonitor.getWallets();
            res.json(wallets);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch wallets' });
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

            // Check if wallet exists in MongoDB (regardless of monitoring status)
            const existingWallet = await Wallet.findOne({ address });
            if (existingWallet) {
                return res.status(409).json({ 
                    error: `Wallet ${address} already exists in the database`,
                    wallet: existingWallet,
                    details: {
                        name: existingWallet.name || 'Unnamed Wallet',
                        addedAt: existingWallet.addedAt,
                        lastUpdate: existingWallet.lastUpdate
                    }
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

    // Get wallet transactions
    router.get('/api/wallets/:address/transactions', async (req, res) => {
        try {
            const { address } = req.params;
            const transactions = await walletMonitor.getWalletTransactions(address);
            res.json(transactions);
        } catch (error) {
            res.status(500).json({ error: 'Failed to fetch transactions' });
        }
    });

    // Serve static files
    router.use(express.static('public'));

    return router;
}; 