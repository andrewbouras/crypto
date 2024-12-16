const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');
const Wallet = require('../../models/Wallet');

class ConfigLoader {
  constructor(logger) {
    this.configPath = path.join(process.cwd(), 'config', 'wallets.json');
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [new winston.transports.Console()]
    });
  }

  // Load configuration from file
  async loadConfig() {
    try {
      const configData = await fs.readFile(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      this.logger.error('Error loading config:', error);
      return {
        wallets: [],
        tokenTracking: {
          trackOnlyListed: false,
          trackedTokens: []
        }
      };
    }
  }

  // Save configuration to file
  async saveConfig(config) {
    try {
      await fs.writeFile(
        this.configPath,
        JSON.stringify(config, null, 2),
        'utf8'
      );
    } catch (error) {
      this.logger.error('Error saving config:', error);
      throw error;
    }
  }

  // Add a new wallet to config and MongoDB
  async addWallet(address) {
    // First check MongoDB for existing wallet
    const existingWallet = await Wallet.findOne({ address });
    if (existingWallet) {
      throw new Error(`Wallet ${address} already exists in database`);
    }

    const config = await this.loadConfig();
    
    // Check if wallet exists in config
    if (config.wallets.some(w => w.address === address)) {
      throw new Error(`Wallet ${address} already exists in config file`);
    }

    // Add to MongoDB first
    try {
      await Wallet.create({
        address,
        isActive: true,
        solBalance: '0',
        tokenBalances: [],
        lastChecked: new Date(),
        createdAt: new Date()
      });
    } catch (error) {
      throw new Error(`Failed to add wallet to database: ${error.message}`);
    }

    // Then add to config file
    config.wallets.push({
      address
    });

    await this.saveConfig(config);
    return config;
  }

  // Remove a wallet from config and MongoDB
  async removeWallet(address) {
    // Remove from MongoDB first
    try {
      await Wallet.findOneAndDelete({ address });
    } catch (error) {
      this.logger.error(`Error removing wallet from database: ${error.message}`);
    }

    // Then remove from config
    const config = await this.loadConfig();
    config.wallets = config.wallets.filter(w => w.address !== address);
    await this.saveConfig(config);
    return config;
  }

  // List all wallets with their MongoDB status
  async listWallets() {
    const config = await this.loadConfig();
    const dbWallets = await Wallet.find({}, 'address isActive lastChecked');
    
    const dbWalletsMap = new Map(
      dbWallets.map(w => [w.address, w])
    );

    return {
      ...config,
      wallets: config.wallets.map(w => ({
        ...w,
        inDatabase: dbWalletsMap.has(w.address),
        isActive: dbWalletsMap.get(w.address)?.isActive || false,
        lastChecked: dbWalletsMap.get(w.address)?.lastChecked || null
      }))
    };
  }

  // Add a token to track
  async addToken(mint, symbol) {
    const config = await this.loadConfig();
    
    if (!config.tokenTracking) {
      config.tokenTracking = {
        trackOnlyListed: false,
        trackedTokens: []
      };
    }

    // Check if token already exists
    if (config.tokenTracking.trackedTokens.some(t => t.mint === mint)) {
      throw new Error('Token already exists in config');
    }

    config.tokenTracking.trackedTokens.push({
      mint,
      symbol
    });

    await this.saveConfig(config);
    return config;
  }

  // Remove a token from tracking
  async removeToken(mint) {
    const config = await this.loadConfig();
    if (config.tokenTracking) {
      config.tokenTracking.trackedTokens = config.tokenTracking.trackedTokens.filter(
        t => t.mint !== mint
      );
    }
    await this.saveConfig(config);
    return config;
  }

  // Set token tracking mode
  async setTokenTrackingMode(trackOnlyListed) {
    const config = await this.loadConfig();
    if (!config.tokenTracking) {
      config.tokenTracking = {
        trackOnlyListed,
        trackedTokens: []
      };
    } else {
      config.tokenTracking.trackOnlyListed = trackOnlyListed;
    }
    await this.saveConfig(config);
    return config;
  }
}

module.exports = ConfigLoader; 