const axios = require('axios');

class CoinGeckoService {
    constructor() {
        this.baseUrl = 'https://api.coingecko.com/api/v3';
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    async getSolanaMarketData() {
        try {
            // Check cache first
            if (this.cache.has('solana')) {
                const cachedData = this.cache.get('solana');
                if (Date.now() - cachedData.timestamp < this.cacheTimeout) {
                    return cachedData.data;
                }
            }

            // Fetch fresh data
            const response = await axios.get(`${this.baseUrl}/simple/price`, {
                params: {
                    ids: 'solana',
                    vs_currencies: 'usd',
                    include_market_cap: true,
                    include_24hr_vol: true,
                    include_24hr_change: true
                }
            });

            const marketData = {
                price: response.data.solana.usd,
                marketCap: response.data.solana.usd_market_cap,
                volume24h: response.data.solana.usd_24h_vol,
                priceChange24h: response.data.solana.usd_24h_change
            };

            // Update cache
            this.cache.set('solana', {
                timestamp: Date.now(),
                data: marketData
            });

            return marketData;
        } catch (error) {
            console.error('Error fetching Solana market data:', error);
            // Return cached data if available, even if expired
            if (this.cache.has('solana')) {
                return this.cache.get('solana').data;
            }
            throw error;
        }
    }
}

module.exports = new CoinGeckoService(); 