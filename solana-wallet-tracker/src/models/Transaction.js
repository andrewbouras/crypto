const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    walletAddress: {
        type: String,
        required: true,
        index: true
    },
    timestamp: {
        type: Date,
        default: Date.now,
        index: true
    },
    amount: {
        type: Number,
        required: true
    },
    type: {
        type: String,
        enum: ['receive', 'send'],
        default: 'receive'
    }
});

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = {
    Transaction
}; 