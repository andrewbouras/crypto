const axios = require('axios');
require('dotenv').config();

async function verifyWebhookSetup() {
  try {
    // Get current webhooks (single API call)
    console.log('Checking webhook configuration...');
    const response = await axios.get(
      `https://api.helius.xyz/v0/webhooks?api-key=${process.env.HELIUS_API_KEY}`
    );
    
    if (response.data && response.data.length > 0) {
      const webhook = response.data[0];
      console.log('\nActive webhook configuration:');
      console.log('----------------------------');
      console.log('Webhook ID:', webhook.webhookID);
      console.log('URL:', webhook.webhookURL);
      console.log('Addresses:', webhook.accountAddresses);
      console.log('Transaction Types:', webhook.transactionTypes);
      console.log('Type:', webhook.webhookType);
      console.log('\nSetup looks good! The webhook is configured and active.');
    } else {
      console.log('No active webhooks found - this is unexpected.');
    }
  } catch (error) {
    console.error('Verification failed:', error.response?.data || error.message);
  }
}

// Only run the verification
verifyWebhookSetup();
