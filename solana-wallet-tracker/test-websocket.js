require('dotenv').config();
const { Keypair } = require('@solana/web3.js');
const winston = require('winston');
const WebSocketManager = require('./src/services/websocket/WebSocketManager');

// Configure logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'websocket-test.log' })
  ]
});

// Test configuration
const NUM_TEST_WALLETS = 250; // Test with 250 wallets
const TEST_DURATION = 300000; // Run test for 5 minutes
const STATS_INTERVAL = 10000; // Log stats every 10 seconds

// Generate test wallets
function generateTestWallets(count) {
  return Array.from({ length: count }, () => {
    const keypair = Keypair.generate();
    return keypair.publicKey.toBase58();
  });
}

// Track statistics
const stats = {
  totalWallets: 0,
  activeConnections: 0,
  successfulSubscriptions: 0,
  failedSubscriptions: 0,
  accountUpdates: 0,
  rateLimitHits: 0,
  errors: 0
};

// Log statistics
function logStats() {
  logger.info('WebSocket Test Statistics:', {
    totalWallets: stats.totalWallets,
    activeConnections: stats.activeConnections,
    successfulSubscriptions: stats.successfulSubscriptions,
    failedSubscriptions: stats.failedSubscriptions,
    accountUpdates: stats.accountUpdates,
    rateLimitHits: stats.rateLimitHits,
    errors: stats.errors,
    walletsPerConnection: stats.activeConnections > 0 
      ? (stats.totalWallets / stats.activeConnections).toFixed(2) 
      : 0
  });
}

// Run the test
async function runTest() {
  // Initialize WebSocket manager
  const wsManager = new WebSocketManager(logger);

  // Generate test wallets
  const testWallets = generateTestWallets(NUM_TEST_WALLETS);
  stats.totalWallets = testWallets.length;

  // Start statistics logging
  const statsInterval = setInterval(logStats, STATS_INTERVAL);

  // Subscribe to all test wallets
  logger.info(`Starting subscription for ${testWallets.length} wallets...`);
  
  const subscribePromises = testWallets.map(walletAddress => {
    return wsManager.subscribeToWallet(
      walletAddress,
      (accountInfo) => {
        stats.accountUpdates++;
        logger.debug(`Account update for ${walletAddress}`);
      }
    ).then(() => {
      stats.successfulSubscriptions++;
    }).catch(error => {
      stats.failedSubscriptions++;
      if (error.message?.includes('429') || error.message?.includes('Too Many Requests')) {
        stats.rateLimitHits++;
      } else {
        stats.errors++;
      }
      logger.error(`Failed to subscribe to ${walletAddress}:`, error);
    });
  });

  // Wait for all subscriptions to complete
  await Promise.allSettled(subscribePromises);

  // Update connection stats
  stats.activeConnections = wsManager.sharedConnections.size;

  // Run test for specified duration
  logger.info(`All subscriptions attempted. Running test for ${TEST_DURATION / 1000} seconds...`);
  
  await new Promise(resolve => setTimeout(resolve, TEST_DURATION));

  // Cleanup
  clearInterval(statsInterval);
  
  // Log final statistics
  logger.info('Test completed. Final statistics:');
  logStats();

  // Cleanup connections
  logger.info('Cleaning up connections...');
  for (const walletAddress of testWallets) {
    await wsManager.removeConnection(walletAddress);
  }

  logger.info('Test completed successfully');
  process.exit(0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  logger.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the test
runTest().catch(error => {
  logger.error('Test failed:', error);
  process.exit(1);
}); 