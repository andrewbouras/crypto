const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        index: true
    },
    type: {
        type: String,
        enum: ['send', 'receive'],
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    signature: {
        type: String,
        required: true,
        unique: true
    },
    notified: {
        type: Boolean,
        default: false
    },
    priceAtTransaction: {
        type: Number,
        required: false
    },
    hidden: {
        type: Boolean,
        default: false
    }
});

// Create compound index for efficient queries
transactionSchema.index({ walletAddress: 1, timestamp: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = {
    Transaction
}; 