require('dotenv').config();
const express = require('express');
const winston = require('winston');
const { connectToMongoDB } = require('./services/db/mongodb');
const WalletMonitor = require('./services/wallet/WalletMonitor');
const webRoutes = require('./routes/web');

// Configure logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'app.log' })
    ]
});

// Initialize Express app
const app = express();
app.use(express.json());

// Initialize wallet monitor
const walletMonitor = new WalletMonitor(logger);

// Use web routes
app.use(webRoutes(walletMonitor));

// Error handling middleware
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    try {
        // Verify environment variables
        console.log('Verifying environment configuration...');
        console.log('MongoDB URI:', process.env.MONGODB_URI ? 'Set' : 'Not set');
        console.log('MongoDB DB Name:', process.env.MONGO_DB_NAME ? 'Set' : 'Not set');
        console.log('Port:', process.env.PORT || 3000);

        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await connectToMongoDB();
        logger.info('Connected to MongoDB');

        // Start wallet monitoring
        console.log('Starting wallet monitor...');
        await walletMonitor.start();
        logger.info('Wallet monitoring started');

        // Start HTTP server
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            console.log(`Server is running at http://localhost:${PORT}`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        console.error('Startup error:', error);
        process.exit(1);
    }
}

// Handle shutdown
process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM signal. Shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('Received SIGINT signal. Shutting down gracefully...');
    process.exit(0);
});

// Start the server
startServer(); 