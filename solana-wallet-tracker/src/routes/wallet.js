const express = require('express');
const router = express.Router();
const Wallet = require('../models/Wallet');
const { PublicKey } = require('@solana/web3.js');

// Initialize router with wallet monitor
const initializeRouter = (walletMonitor) => {
  // Add a new wallet to monitor
  router.post('/monitor', async (req, res) => {
    try {
      const { address, label } = req.body;

      // Validate Solana address
      try {
        new PublicKey(address);
      } catch (error) {
        return res.status(400).json({
          error: 'Invalid Solana address'
        });
      }

      // Start monitoring
      await walletMonitor.startMonitoring(address);

      // Update label if provided
      if (label) {
        await Wallet.findOneAndUpdate(
          { address },
          { label }
        );
      }

      res.status(200).json({
        message: 'Wallet monitoring started',
        address
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to start wallet monitoring',
        details: error.message
      });
    }
  });

  // Stop monitoring a wallet
  router.post('/stop', async (req, res) => {
    try {
      const { address } = req.body;

      await walletMonitor.stopMonitoring(address);

      res.status(200).json({
        message: 'Wallet monitoring stopped',
        address
      });
    } catch (error) {
      res.status(500).json({
        error: 'Failed to stop wallet monitoring',
        details: error.message
      });
    }
  });

  // Get all monitored wallets
  router.get('/list', async (req, res) => {
    try {
      const wallets = await Wallet.find(
        { isActive: true },
        'address label lastKnownBalance lastChecked'
      );

      res.status(200).json(wallets);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch wallet list',
        details: error.message
      });
    }
  });

  // Update wallet settings
  router.put('/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const { label, minNotificationAmount } = req.body;

      const wallet = await Wallet.findOneAndUpdate(
        { address },
        {
          ...(label && { label }),
          ...(minNotificationAmount && { minNotificationAmount })
        },
        { new: true }
      );

      if (!wallet) {
        return res.status(404).json({
          error: 'Wallet not found'
        });
      }

      res.status(200).json(wallet);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to update wallet settings',
        details: error.message
      });
    }
  });

  // Get wallet details
  router.get('/:address', async (req, res) => {
    try {
      const { address } = req.params;
      const wallet = await Wallet.findOne({ address });

      if (!wallet) {
        return res.status(404).json({
          error: 'Wallet not found'
        });
      }

      res.status(200).json(wallet);
    } catch (error) {
      res.status(500).json({
        error: 'Failed to fetch wallet details',
        details: error.message
      });
    }
  });

  return router;
};

module.exports = initializeRouter; 