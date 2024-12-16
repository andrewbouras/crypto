const { Connection, clusterApiUrl, PublicKey } = require('@solana/web3.js');
const EventEmitter = require('events');

class WebSocketManager extends EventEmitter {
  constructor(logger) {
    super();
    this.logger = logger;
    
    // Initialize endpoint pools with both HTTP and WS URLs
    const mainnetBeta = clusterApiUrl('mainnet-beta');
    this.endpoints = [
      {
        http: mainnetBeta,
        ws: mainnetBeta.replace('https', 'wss'),
        priority: 1,
        rateLimit: { requests: 0, lastReset: Date.now() }
      },
      {
        http: 'https://api.mainnet-beta.solana.com',
        ws: 'wss://api.mainnet-beta.solana.com',
        priority: 1,
        rateLimit: { requests: 0, lastReset: Date.now() }
      },
      {
        http: 'https://solana-api.projectserum.com',
        ws: 'wss://solana-api.projectserum.com',
        priority: 2,
        rateLimit: { requests: 0, lastReset: Date.now() }
      }
    ];

    // Shared connection management
    this.sharedConnections = new Map(); // endpoint -> connection
    this.walletsPerConnection = new Map(); // connection -> Set of wallets
    this.maxWalletsPerConnection = 100; // Maximum wallets per shared connection

    // Batch processing
    this.initializationQueue = [];
    this.processingBatch = false;
    this.batchSize = 25; // Increased batch size for shared connections
    this.batchInterval = 5000; // Process batch every 5 seconds

    // Rate limiting - adjusted for shared connections
    this.maxRequestsPerSecond = 25;
    this.rateLimitWindowMs = 1000;
    this.rateLimitQueue = [];
    this.processingQueue = false;
    this.minRequestDelay = 40;

    // Connection management
    this.subscriptions = new Map();
    this.currentEndpointIndex = 0;

    // Health monitoring
    this.healthChecks = new Map();
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    this.connectionTimeout = 15000;

    // Initialize health checks
    this.endpoints.forEach(endpoint => {
      this.healthChecks.set(endpoint.http, {
        lastCheck: Date.now(),
        failures: 0,
        priority: endpoint.priority
      });
    });

    // Start health monitoring
    this.startHealthMonitoring();
    
    // Start rate limit window reset
    setInterval(() => this.resetRateLimits(), this.rateLimitWindowMs);

    // Start batch processing
    setInterval(() => this.processBatch(), this.batchInterval);

    // Start connection health checks
    setInterval(() => this.checkSharedConnections(), 30000);
  }

  // Get or create a shared connection
  async getSharedConnection(endpoint) {
    let connection = this.sharedConnections.get(endpoint.http);
    
    if (!connection) {
      connection = await this.createConnection(endpoint);
      this.sharedConnections.set(endpoint.http, connection);
      this.walletsPerConnection.set(connection, new Set());
    }
    
    return connection;
  }

  // Check if connection can accept more wallets
  canAcceptMoreWallets(connection) {
    const wallets = this.walletsPerConnection.get(connection);
    return wallets && wallets.size < this.maxWalletsPerConnection;
  }

  // Process batch of wallet initializations with shared connections
  async processBatch() {
    if (this.processingBatch || this.initializationQueue.length === 0) return;
    this.processingBatch = true;

    try {
      const batch = this.initializationQueue.splice(0, this.batchSize);
      const endpointBatches = new Map();

      // Group wallets by endpoint
      for (const { walletAddress, callback } of batch) {
        const endpoint = this.getBestEndpoint();
        if (!endpointBatches.has(endpoint)) {
          endpointBatches.set(endpoint, []);
        }
        endpointBatches.get(endpoint).push({ walletAddress, callback });
      }

      // Process each endpoint's batch
      for (const [endpoint, wallets] of endpointBatches) {
        let connection = await this.getSharedConnection(endpoint);
        const walletsForConnection = this.walletsPerConnection.get(connection);

        // If current connection is full, create a new one
        if (!this.canAcceptMoreWallets(connection)) {
          connection = await this.createConnection(endpoint);
          this.sharedConnections.set(endpoint.http, connection);
          this.walletsPerConnection.set(connection, new Set());
        }

        // Subscribe wallets in parallel
        await Promise.all(
          wallets.map(async ({ walletAddress, callback }) => {
            try {
              const subscriptionId = await this.queueRequest(
                endpoint,
                async () => {
                  return connection.onAccountChange(
                    new PublicKey(walletAddress),
                    callback,
                    'confirmed'
                  );
                }
              );

              // Track subscription and wallet
              const walletSubs = this.subscriptions.get(walletAddress) || [];
              walletSubs.push(subscriptionId);
              this.subscriptions.set(walletAddress, walletSubs);
              walletsForConnection.add(walletAddress);

              this.logger.info(`Initialized wallet: ${walletAddress} on shared connection ${endpoint.http}`);
            } catch (error) {
              this.logger.error(`Failed to initialize wallet: ${walletAddress}`, error);
              this.initializationQueue.push({ walletAddress, callback });
            }
          })
        );
      }
    } finally {
      this.processingBatch = false;
    }
  }

  // Modified health monitoring for efficiency
  startHealthMonitoring() {
    setInterval(async () => {
      // Only check endpoints that have active connections
      const activeEndpoints = new Set(
        Array.from(this.sharedConnections.keys())
          .map(http => this.endpoints.find(e => e.http === http))
          .filter(Boolean)
      );

      for (const endpoint of activeEndpoints) {
        if (endpoint.priority > 1 && Math.random() > 0.3) {
          continue; // Reduced health checks for backup endpoints
        }

        try {
          const connection = await this.createConnection(endpoint);
          await connection.getSlot();
          
          const health = this.healthChecks.get(endpoint.http);
          health.lastCheck = Date.now();
          health.failures = 0;
          this.healthChecks.set(endpoint.http, health);
        } catch (error) {
          if (error.message !== 'Rate limited') {
            const health = this.healthChecks.get(endpoint.http);
            health.failures++;
            this.healthChecks.set(endpoint.http, health);
            
            this.logger.error(`Health check failed for ${endpoint.http}:`, error);
          }
        }
      }
    }, 60000); // Reduced to once per minute
  }

  // Get the best endpoint based on health, priority and load
  getBestEndpoint() {
    // First try high priority endpoints
    let healthyEndpoints = this.endpoints.filter(endpoint => {
      const health = this.healthChecks.get(endpoint.http);
      const connection = this.sharedConnections.get(endpoint.http);
      const wallets = connection ? this.walletsPerConnection.get(connection) : new Set();
      
      return health.failures < 3 && 
             endpoint.priority === 1 && 
             endpoint.rateLimit.requests < this.maxRequestsPerSecond &&
             (!wallets || wallets.size < this.maxWalletsPerConnection);
    });

    // If no healthy high priority endpoints, try lower priority ones
    if (healthyEndpoints.length === 0) {
      healthyEndpoints = this.endpoints.filter(endpoint => {
        const health = this.healthChecks.get(endpoint.http);
        const connection = this.sharedConnections.get(endpoint.http);
        const wallets = connection ? this.walletsPerConnection.get(connection) : new Set();
        
        return health.failures < 3 && 
               endpoint.rateLimit.requests < this.maxRequestsPerSecond &&
               (!wallets || wallets.size < this.maxWalletsPerConnection);
      });
    }

    // If all endpoints are at capacity, create new connection on least loaded endpoint
    if (healthyEndpoints.length === 0) {
      healthyEndpoints = this.endpoints.filter(endpoint => {
        const health = this.healthChecks.get(endpoint.http);
        return health.failures < 3;
      });
    }

    if (healthyEndpoints.length === 0) {
      this.logger.warn('No healthy endpoints available, resetting health checks');
      this.resetHealthChecks();
      return this.endpoints.find(e => e.priority === 1);
    }

    // Find endpoint with least load
    return healthyEndpoints.reduce((best, current) => {
      const bestConnection = this.sharedConnections.get(best.http);
      const currentConnection = this.sharedConnections.get(current.http);
      const bestWallets = bestConnection ? this.walletsPerConnection.get(bestConnection) : new Set();
      const currentWallets = currentConnection ? this.walletsPerConnection.get(currentConnection) : new Set();
      
      const bestLoad = bestWallets ? bestWallets.size : 0;
      const currentLoad = currentWallets ? currentWallets.size : 0;
      
      if (bestLoad !== currentLoad) {
        return bestLoad < currentLoad ? best : current;
      }
      
      return best.priority <= current.priority ? best : current;
    });
  }

  // Create a new connection with timeout and rate limiting
  async createConnection(endpoint) {
    return this.queueRequest(endpoint, async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.connectionTimeout);

        const connection = new Connection(endpoint.http, {
          commitment: 'confirmed',
          wsEndpoint: endpoint.ws,
          fetch: (url, options) => {
            return fetch(url, { ...options, signal: controller.signal });
          }
        });

        // Test connection
        await connection.getSlot();
        clearTimeout(timeoutId);
        
        return connection;
      } catch (error) {
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
          this.logger.warn(`Rate limited on endpoint ${endpoint.http}, waiting ${this.rateLimitWindowMs}ms`);
          await new Promise(resolve => setTimeout(resolve, this.rateLimitWindowMs));
          throw new Error('Rate limited');
        }
        throw error;
      }
    });
  }

  // Reset rate limits periodically
  resetRateLimits() {
    const now = Date.now();
    for (const endpoint of this.endpoints) {
      if (now - endpoint.rateLimit.lastReset >= this.rateLimitWindowMs) {
        endpoint.rateLimit.requests = 0;
        endpoint.rateLimit.lastReset = now;
      }
    }
    
    // Process any queued requests
    if (this.rateLimitQueue.length > 0 && !this.processingQueue) {
      this.processRateLimitQueue();
    }
  }

  // Process rate limit queue with delay
  async processRateLimitQueue() {
    if (this.processingQueue) return;
    this.processingQueue = true;

    while (this.rateLimitQueue.length > 0) {
      const { endpoint, promise } = this.rateLimitQueue[0];
      
      // Check if we can process this request
      if (endpoint.rateLimit.requests >= this.maxRequestsPerSecond) {
        // Wait for next reset
        await new Promise(resolve => setTimeout(resolve, this.rateLimitWindowMs));
        continue;
      }

      // Add minimum delay between requests
      await new Promise(resolve => setTimeout(resolve, this.minRequestDelay));

      // Process request
      try {
        endpoint.rateLimit.requests++;
        await promise();
      } catch (error) {
        if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
          // If rate limited, increase the delay
          this.minRequestDelay = Math.min(this.minRequestDelay * 1.5, 1000);
          this.logger.warn(`Increased request delay to ${this.minRequestDelay}ms`);
        } else {
          this.logger.error('Error processing queued request:', error);
        }
      }

      // Remove from queue
      this.rateLimitQueue.shift();
    }

    this.processingQueue = false;
  }

  // Queue a rate-limited request
  async queueRequest(endpoint, requestFn) {
    return new Promise((resolve, reject) => {
      const promise = async () => {
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      };

      this.rateLimitQueue.push({ endpoint, promise });
      
      if (!this.processingQueue) {
        this.processRateLimitQueue();
      }
    });
  }

  // Check health of shared connections
  async checkSharedConnections() {
    for (const [endpoint, connection] of this.sharedConnections) {
      try {
        await this.queueRequest(
          this.endpoints.find(e => e.http === endpoint),
          async () => await connection.getSlot()
        );
      } catch (error) {
        this.logger.error(`Shared connection health check failed for ${endpoint}:`, error);
        
        // Recreate connection and resubscribe wallets
        const wallets = Array.from(this.walletsPerConnection.get(connection));
        this.sharedConnections.delete(endpoint);
        this.walletsPerConnection.delete(connection);

        // Requeue affected wallets
        for (const walletAddress of wallets) {
          const subs = this.subscriptions.get(walletAddress);
          if (subs) {
            for (const subId of subs) {
              try {
                await connection.removeAccountChangeListener(subId);
              } catch (e) {
                // Ignore cleanup errors
              }
            }
          }
          this.subscriptions.delete(walletAddress);
          this.initializationQueue.push({
            walletAddress,
            callback: this.callbacks.get(walletAddress)
          });
        }
      }
    }
  }

  // Store callback for reconnection
  storeCallback(walletAddress, callback) {
    if (!this.callbacks) {
      this.callbacks = new Map();
    }
    this.callbacks.set(walletAddress, callback);
  }

  // Subscribe to account changes using shared connections
  async subscribeToWallet(walletAddress, callback) {
    this.storeCallback(walletAddress, callback);
    this.queueWalletInitialization(walletAddress, callback);
  }

  // Add wallet to initialization queue
  queueWalletInitialization(walletAddress, callback) {
    this.initializationQueue.push({ walletAddress, callback });
    if (!this.processingBatch) {
      this.processBatch();
    }
  }

  // Reset health checks
  resetHealthChecks() {
    for (const endpoint of this.endpoints) {
      this.healthChecks.set(endpoint.http, {
        lastCheck: Date.now(),
        failures: 0,
        priority: endpoint.priority
      });
    }
  }

  // Memory management
  async cleanupUnusedConnections() {
    const activeWallets = new Set(
      Array.from(this.walletsPerConnection.values())
        .flatMap(wallets => Array.from(wallets))
    );

    for (const walletAddress of activeWallets) {
      if (!this.subscriptions.has(walletAddress)) {
        await this.removeConnection(walletAddress);
      }
    }
  }

  // Handle connection cleanup
  async removeConnection(walletAddress) {
    for (const [endpoint, connection] of this.sharedConnections) {
      const wallets = this.walletsPerConnection.get(connection);
      if (wallets?.has(walletAddress)) {
        try {
          // Cleanup subscriptions
          const subs = this.subscriptions.get(walletAddress) || [];
          for (const subId of subs) {
            await connection.removeAccountChangeListener(subId);
          }
          this.subscriptions.delete(walletAddress);
          wallets.delete(walletAddress);

          // If no more wallets, cleanup connection
          if (wallets.size === 0) {
            this.sharedConnections.delete(endpoint);
            this.walletsPerConnection.delete(connection);
          }

          this.logger.info(`Removed wallet ${walletAddress} from shared connection ${endpoint}`);
        } catch (error) {
          this.logger.error(`Error cleaning up wallet ${walletAddress}:`, error);
        }
      }
    }
  }
}

module.exports = WebSocketManager; 