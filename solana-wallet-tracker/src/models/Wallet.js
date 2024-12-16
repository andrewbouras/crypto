const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema({
    address: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    name: {
        type: String,
        default: 'Unknown'
    },
    balance: {
        type: Number,
        default: 0
    },
    addedAt: {
        type: Date,
        default: Date.now
    },
    lastUpdate: {
        type: Date,
        default: Date.now
    }
});

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = {
    Wallet
}; 