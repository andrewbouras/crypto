const mongoose = require('mongoose');

async function connectToMongoDB() {
    try {
        console.log('Checking MongoDB configuration...');
        if (!process.env.MONGODB_URI) {
            throw new Error('MONGODB_URI environment variable is not set');
        }

        console.log('Attempting to connect to MongoDB...');
        console.log(`Database Name: ${process.env.MONGO_DB_NAME || 'crypto'}`);
        
        await mongoose.connect(process.env.MONGODB_URI, {
            dbName: process.env.MONGO_DB_NAME || 'crypto',
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        console.log('Successfully connected to MongoDB');
        
        // Test the connection by listing collections
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));

        mongoose.connection.on('error', (err) => {
            console.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            console.warn('MongoDB disconnected');
        });

    } catch (error) {
        console.error('MongoDB connection error:', error);
        throw new Error(`MongoDB connection error: ${error.message}`);
    }
}

module.exports = {
    connectToMongoDB
}; 