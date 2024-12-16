const { Connection } = require('@solana/web3.js');

class RPCManager {
    constructor() {
        // Primary and fallback RPC endpoints
        this.endpoints = [
            'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana'
        ];
        
        this.connections = {};
        this.requestCounts = {};
        this.MAX_REQUESTS_PER_MINUTE = 60; // Adjust based on RPC limits
        
        // Initialize connections
        this.endpoints.forEach(endpoint => {
            this.connections[endpoint] = new Connection(endpoint, 'confirmed');
            this.requestCounts[endpoint] = {
                count: 0,
                lastReset: Date.now()
            };
        });
        
        this.currentEndpointIndex = 0;
    }

    async getConnection() {
        const endpoint = this.endpoints[this.currentEndpointIndex];
        const stats = this.requestCounts[endpoint];
        
        // Reset counter if a minute has passed
        if (Date.now() - stats.lastReset > 60000) {
            stats.count = 0;
            stats.lastReset = Date.now();
        }

        // If current endpoint is rate limited, try next one
        if (stats.count >= this.MAX_REQUESTS_PER_MINUTE) {
            this.currentEndpointIndex = (this.currentEndpointIndex + 1) % this.endpoints.length;
            console.log(`Switching to RPC endpoint: ${this.endpoints[this.currentEndpointIndex]}`);
            return this.getConnection(); // Recursive call with new endpoint
        }

        stats.count++;
        return this.connections[endpoint];
    }

    // Retry mechanism for failed requests
    async executeWithRetry(operation, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const connection = await this.getConnection();
                return await operation(connection);
            } catch (error) {
                if (attempt === maxRetries) throw error;
                console.log(`Attempt ${attempt} failed, retrying...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }
    }
}

module.exports = new RPCManager();
