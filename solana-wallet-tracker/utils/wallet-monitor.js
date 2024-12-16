const { PublicKey } = require('@solana/web3.js');

class WalletMonitor {
    constructor(rpcManager) {
        this.rpcManager = rpcManager;
        this.wallets = new Map(); // Store last signature for each wallet
    }

    async pollWallets(addresses, interval = 30000) { // 30 seconds
        setInterval(async () => {
            for (const address of addresses) {
                try {
                    const connection = await this.rpcManager.getConnection();
                    const signatures = await connection.getSignaturesForAddress(
                        new PublicKey(address),
                        { limit: 1 }
                    );

                    if (signatures.length > 0) {
                        const lastKnownSignature = this.wallets.get(address);
                        if (lastKnownSignature !== signatures[0].signature) {
                            // New transaction found
                            this.wallets.set(address, signatures[0].signature);
                            // Process transaction...
                        }
                    }
                } catch (error) {
                    console.error(`Error polling wallet ${address}:`, error);
                }
            }
        }, interval);
    }
}

module.exports = WalletMonitor;
