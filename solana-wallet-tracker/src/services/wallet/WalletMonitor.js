const { PublicKey } = require('@solana/web3.js');
const WebSocketManager = require('../websocket/WebSocketManager');
const TelegramService = require('../notification/TelegramService');
const { Wallet } = require('../../models/Wallet');
const { Transaction } = require('../../models/Transaction');

class WalletMonitor {
  constructor(logger) {
    this.logger = logger;
    this.wsManager = new WebSocketManager(logger);
    this.telegramService = new TelegramService();
    this.monitoredWallets = new Map();
  }

  async start() {
    try {
      // Load all wallets from MongoDB
      const wallets = await Wallet.find({});
      this.logger.info(`Loading ${wallets.length} wallets from database...`);

      // Subscribe to each wallet
      for (const wallet of wallets) {
        await this.addWallet(wallet.address, wallet.name || 'Unknown');
      }

      this.logger.info('Wallet monitoring started successfully');
    } catch (error) {
      this.logger.error('Failed to start wallet monitoring:', error);
      throw error;
    }
  }

  async addWallet(address, name = 'Unknown') {
    try {
      this.logger.info(`Attempting to add wallet: ${address} with name: ${name}`);

      // Validate the wallet address
      new PublicKey(address);

      // Check if wallet already exists in DB
      let wallet = await Wallet.findOne({ address });
      this.logger.info(`Database check result: ${wallet ? 'Wallet exists' : 'Wallet does not exist'}`);

      if (!wallet) {
        this.logger.info('Creating new wallet document...');
        wallet = new Wallet({
          address,
          name,
          addedAt: new Date(),
          lastUpdate: new Date()
        });
        
        this.logger.info('Saving wallet to MongoDB...');
        await wallet.save();
        this.logger.info('Wallet saved successfully');
      }

      // Only subscribe if not already monitoring
      if (!this.monitoredWallets.has(address)) {
        this.logger.info('Setting up WebSocket subscription...');
        await this.wsManager.subscribeToWallet(
          address,
          async (accountInfo) => {
            await this.handleAccountUpdate(address, accountInfo);
          }
        );
        this.monitoredWallets.set(address, wallet);
        this.logger.info(`Started monitoring wallet: ${address} (${name})`);
      }

      return wallet;
    } catch (error) {
      this.logger.error(`Failed to add wallet ${address}:`, error);
      throw error;
    }
  }

  async removeWallet(address) {
    try {
      // Remove from MongoDB
      await Wallet.deleteOne({ address });

      // Remove from monitoring
      if (this.monitoredWallets.has(address)) {
        await this.wsManager.removeConnection(address);
        this.monitoredWallets.delete(address);
        this.logger.info(`Stopped monitoring wallet: ${address}`);
      }
    } catch (error) {
      this.logger.error(`Failed to remove wallet ${address}:`, error);
      throw error;
    }
  }

  async handleAccountUpdate(address, accountInfo) {
    try {
      const wallet = this.monitoredWallets.get(address);
      if (!wallet) return;

      // Update wallet in MongoDB
      await Wallet.updateOne(
        { address },
        { 
          $set: { 
            lastUpdate: new Date(),
            balance: accountInfo.lamports / 10**9 // Convert lamports to SOL
          }
        }
      );

      // Create transaction record
      const transaction = new Transaction({
        walletAddress: address,
        timestamp: new Date(),
        amount: accountInfo.lamports / 10**9,
        type: 'receive'
      });
      await transaction.save();

      // Send Telegram notification
      const message = `💰 Incoming transaction detected!\n\n` +
                     `Wallet: ${wallet.name} (${address})\n` +
                     `New Balance: ${(accountInfo.lamports / 10**9).toFixed(4)} SOL`;
      
      await this.telegramService.sendMessage(message);
      
      this.logger.info(`Processed account update for ${address}`);
    } catch (error) {
      this.logger.error(`Failed to handle account update for ${address}:`, error);
    }
  }

  async getWallets() {
    try {
      return await Wallet.find({}).sort({ addedAt: -1 });
    } catch (error) {
      this.logger.error('Failed to get wallets:', error);
      throw error;
    }
  }

  async getWalletTransactions(address) {
    try {
      return await Transaction.find({ walletAddress: address })
        .sort({ timestamp: -1 })
        .limit(100);
    } catch (error) {
      this.logger.error(`Failed to get transactions for ${address}:`, error);
      throw error;
    }
  }
}

module.exports = WalletMonitor; 