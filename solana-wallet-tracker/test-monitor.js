require('dotenv').config();
const axios = require('axios');

const walletAddress = '4NcmptCFMTK3VWNyEhTETiQLvEcrmLtNtQVvtAqjXAZ4';

async function testMonitoring() {
  try {
    // Start monitoring the wallet
    console.log('Starting wallet monitoring...');
    const response = await axios.post('http://localhost:3000/api/wallet/monitor', {
      address: walletAddress,
      label: 'My Main Wallet'
    });

    console.log('Response:', response.data);

    // Wait for 5 seconds
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get wallet details
    console.log('\nFetching wallet details...');
    const details = await axios.get(`http://localhost:3000/api/wallet/${walletAddress}`);
    console.log('Wallet Details:', details.data);

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testMonitoring(); 