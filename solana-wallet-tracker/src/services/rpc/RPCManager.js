const { Connection, clusterApiUrl } = require('@solana/web3.js');
const winston = require('winston');
const NodeCache = require('node-cache');

class RPCManager {
  constructor(logger) {
    this.logger = logger || winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [new winston.transports.Console()]
    });

    // Initialize RPC endpoints with proper URLs
    this.endpoints = [
      clusterApiUrl('mainnet-beta'),
      'https://api.mainnet-beta.solana.com',
      'https://solana-api.projectserum.com'
    ];

    // Add custom RPC if provided
    if (process.env.CUSTOM_RPC_URL && process.env.CUSTOM_RPC_URL.startsWith('http')) {
      this.endpoints.unshift(process.env.CUSTOM_RPC_URL);
    }

    // Initialize connections with proper configs
    this.connections = [];
    for (const endpoint of this.endpoints) {
      try {
        const connection = new Connection(endpoint, {
          commitment: 'confirmed',
          disableRetryOnRateLimit: false,
          confirmTransactionInitialTimeout: 60000
        });
        this.connections.push(connection);
      } catch (error) {
        this.logger.error(`Failed to initialize connection for endpoint ${endpoint}:`, error);
      }
    }

    if (this.connections.length === 0) {
      throw new Error('No valid RPC endpoints available');
    }
    
    // Track request counts and errors
    this.requestCounts = new NodeCache({ stdTTL: 60 }); // Reset counts every minute
    this.errorCounts = new NodeCache({ stdTTL: 300 }); // Track errors for 5 minutes
    
    this.currentEndpointIndex = 0;
    this.maxRequestsPerMinute = process.env.MAX_REQUESTS_PER_MINUTE || 60;
    this.rateLimitDelays = new Map(); // Track rate limit delays per endpoint
    this.maxRetries = 3;
    this.baseDelay = 1000; // Start with 1 second delay
  }

  // Get the next available connection
  getConnection() {
    return new Connection(
      this.endpoints[this.currentEndpointIndex],
      'confirmed'
    );
  }

  // Switch to next endpoint with rate limit tracking
  switchEndpoint() {
    this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
    this.logger?.info(`Switched to RPC endpoint: ${this.endpoints[this.currentEndpointIndex]}`);
    return this.getConnection();
  }

  // Get delay for current endpoint
  getDelay() {
    const currentDelay = this.rateLimitDelays.get(this.currentEndpointIndex) || 0;
    return currentDelay;
  }

  // Update rate limit delay with exponential backoff
  updateDelay() {
    const currentDelay = this.getDelay();
    const newDelay = currentDelay ? currentDelay * 2 : this.baseDelay;
    this.rateLimitDelays.set(this.currentEndpointIndex, newDelay);
    return newDelay;
  }

  // Reset delay for current endpoint
  resetDelay() {
    this.rateLimitDelays.set(this.currentEndpointIndex, 0);
  }

  // Wrapper for RPC calls with automatic retry and rate limit handling
  async makeRequest(requestFn) {
    let lastError;
    
    for (let retry = 0; retry <= this.maxRetries; retry++) {
      try {
        // Check if we need to wait due to rate limiting
        const delay = this.getDelay();
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const connection = this.getConnection();
        const result = await requestFn(connection);
        
        // Success - reset delay for this endpoint
        this.resetDelay();
        return result;

      } catch (error) {
        lastError = error;
        
        // Handle rate limiting
        if (error.message.includes('429') || error.message.includes('Too many requests')) {
          const delay = this.updateDelay();
          this.logger?.warn(`Rate limited on endpoint ${this.currentEndpointIndex}, waiting ${delay}ms`);
          
          // If we've hit the max delay on this endpoint, switch to next one
          if (delay > 8000) {
            this.switchEndpoint();
            this.resetDelay();
          }
          
          continue;
        }

        // For other errors, switch endpoint and retry
        if (retry < this.maxRetries) {
          this.switchEndpoint();
          continue;
        }
      }
    }

    // If we've exhausted all retries, throw the last error
    throw lastError;
  }

  // Handle failed requests
  handleError(endpoint) {
    const errorCount = (this.errorCounts.get(endpoint) || 0) + 1;
    this.errorCounts.set(endpoint, errorCount);
    
    if (errorCount >= 3) { // If endpoint fails 3 times in 5 minutes
      this.logger.warn(`RPC endpoint ${endpoint} showing high error rate`);
      this.switchEndpoint();
    }
  }

  // Reset error count for successful requests
  handleSuccess(endpoint) {
    this.errorCounts.set(endpoint, 0);
  }

  // Get account info with retry logic
  async getAccountInfo(pubkey, commitment = 'confirmed') {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const connection = this.getConnection();
        const endpoint = this.endpoints[this.currentEndpointIndex];
        
        const accountInfo = await connection.getAccountInfo(pubkey, commitment);
        this.handleSuccess(endpoint);
        return accountInfo;
      } catch (error) {
        attempts++;
        const endpoint = this.endpoints[this.currentEndpointIndex];
        this.handleError(endpoint);
        
        if (attempts === maxAttempts) {
          this.logger.error(`Failed to get account info after ${maxAttempts} attempts`, {
            pubkey: pubkey.toString(),
            error: error.message
          });
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }

  // Get multiple accounts info
  async getMultipleAccounts(pubkeys, commitment = 'confirmed') {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      try {
        const connection = this.getConnection();
        const endpoint = this.endpoints[this.currentEndpointIndex];
        
        const accounts = await connection.getMultipleAccountsInfo(pubkeys, commitment);
        this.handleSuccess(endpoint);
        return accounts;
      } catch (error) {
        attempts++;
        const endpoint = this.endpoints[this.currentEndpointIndex];
        this.handleError(endpoint);
        
        if (attempts === maxAttempts) {
          this.logger.error(`Failed to get multiple accounts after ${maxAttempts} attempts`, {
            pubkeys: pubkeys.map(pk => pk.toString()),
            error: error.message
          });
          throw error;
        }
        
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
      }
    }
  }
}

module.exports = RPCManager; 