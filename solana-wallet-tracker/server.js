const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { PublicKey } = require('@solana/web3.js');
require('dotenv').config();
const rpcManager = require('./utils/rpc-manager');

const app = express();
app.use(express.json());

// Telegram Bot Token and Chat ID from environment variables
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Function to monitor a wallet
async function monitorWallet(address) {
  try {
    const publicKey = new PublicKey(address);
    
    // Get connection from RPC manager
    const connection = await rpcManager.getConnection();
    
    connection.onLogs(
      publicKey.toString(),
      async (logs) => {
        try {
          // Use executeWithRetry for fetching transaction details
          const transaction = await rpcManager.executeWithRetry(async (conn) => {
            return await conn.getParsedTransaction(logs.signature);
          });

          // Process transaction and send notification
          if (transaction) {
            const { meta, transaction: txn } = transaction;
            const preBalances = meta.preBalances;
            const postBalances = meta.postBalances;
            const accountKeys = txn.message.accountKeys;

            // Determine the amount of SOL sent or received
            let amountChange = 0;
            for (let i = 0; i < accountKeys.length; i++) {
              if (accountKeys[i].pubkey.toBase58() === address) {
                amountChange = (postBalances[i] - preBalances[i]) / solanaWeb3.LAMPORTS_PER_SOL;
                break;
              }
            }

            // Format the message
            const message = `🚨 *Transaction Alert* 🚨\n
*Wallet:* \`${address}\`
*Amount Change:* ${amountChange} SOL
*Signature:* [${logs.signature}](https://explorer.solana.com/tx/${logs.signature})
*Time:* ${new Date().toLocaleString()}

View on [Solana Explorer](https://explorer.solana.com/tx/${logs.signature})`;

            // Send to Telegram
            await axios.post(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
              chat_id: process.env.TELEGRAM_CHAT_ID,
              text: message,
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
          }
        } catch (error) {
          console.error(`Error processing transaction: ${error.message}`);
        }
      },
      'confirmed'
    );

    console.log(`Monitoring wallet: ${address}`);
  } catch (error) {
    console.error(`Error monitoring wallet ${address}:`, error);
  }
}

// Start monitoring wallets
async function startWalletMonitoring() {
  const walletsPath = path.join(__dirname, 'config', 'wallets.json');
  const data = await fs.readFile(walletsPath, 'utf8');
  const config = JSON.parse(data);

  // Monitor each wallet
  for (const wallet of config.wallets) {
    monitorWallet(wallet.address);
  }
}

// Add debug logging to webhook endpoint
app.post('/webhook', async (req, res) => {
  console.log('Received webhook payload:', JSON.stringify(req.body, null, 2));
  try {
    const transactions = Array.isArray(req.body) ? req.body : [req.body];
    
    for (const tx of transactions) {
      // Enhanced logging for debugging
      console.log('Received transaction:', JSON.stringify(tx, null, 2));

      // Extract relevant transaction data with fallbacks
      const signature = tx.signature || tx.transaction?.signatures?.[0] || 'Unknown';
      const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toLocaleString() : new Date().toLocaleString();
      const type = tx.type || tx.description || 'Transaction';
      const sourceAddress = tx.sourceAddress || tx.fromAddress || 'Unknown';
      const amount = tx.amount || tx.nativeTransfers?.[0]?.amount || '0';
      
      // Format the message with more details
      const message = `🚨 *New Solana Transaction* 🚨\n
*Type:* ${type}
*From:* \`${sourceAddress}\`
*Amount:* ${amount} SOL
*Signature:* \`${signature}\`
*Time:* ${timestamp}

View on Solana Explorer:
https://explorer.solana.com/tx/${signature}`;

      // Send to Telegram
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        chat_id: TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown',
        disable_web_page_preview: true
      });
    }
    
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Error processing webhook:', error.response?.data || error);
    res.status(500).send('Error processing webhook');
  }
});

// Test endpoint
app.get('/test-telegram', async (req, res) => {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: TELEGRAM_CHAT_ID,
      text: '🔔 Test notification: Your bot is working!',
      parse_mode: 'Markdown',
    });
    res.send('Test message sent successfully!');
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).send('Failed to send test message');
  }
});

// Endpoint to receive messages from Telegram
app.post('/telegram_webhook', async (req, res) => {
  const message = req.body.message;
  if (message) {
    const chatId = message.chat.id;
    console.log('Chat ID:', chatId);
    // Optionally, send the chat ID back to the user
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `Your chat ID is: ${chatId}`,
    });
  }
  res.sendStatus(200);
});

// Initialize config function
async function initializeConfig() {
  const configDir = path.join(__dirname, 'config');
  const walletsPath = path.join(configDir, 'wallets.json');
  
  try {
    // Check if config directory exists, if not create it
    try {
      await fs.access(configDir);
    } catch {
      await fs.mkdir(configDir, { recursive: true });
    }
    
    // Check if wallets.json exists, if not create it
    try {
      await fs.access(walletsPath);
    } catch {
      await fs.writeFile(walletsPath, JSON.stringify({ wallets: [] }, null, 2));
    }
  } catch (error) {
    console.error('Error initializing config:', error);
  }
}

// Helper functions for webhook management
async function listWebhooks() {
  try {
    const url = `https://api.helius.xyz/v0/webhooks?api-key=${process.env.HELIUS_API_KEY}`;
    const response = await axios.get(url);
    console.log('Current webhooks:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error listing webhooks:', error.response?.data || error.message);
    return [];
  }
}

async function deleteWebhook(webhookId) {
  try {
    const url = `https://api.helius.xyz/v0/webhooks/${webhookId}?api-key=${process.env.HELIUS_API_KEY}`;
    await axios.delete(url);
    console.log(`Deleted webhook ${webhookId}`);
  } catch (error) {
    console.error(`Error deleting webhook ${webhookId}:`, error.response?.data || error.message);
  }
}

async function cleanupWebhooks() {
  const webhooks = await listWebhooks();
  for (const webhook of webhooks) {
    await deleteWebhook(webhook.webhookID);
  }
  console.log('Cleaned up all existing webhooks');
}

async function getExistingWebhook() {
  try {
    const url = `https://api.helius.xyz/v0/webhooks?api-key=${process.env.HELIUS_API_KEY}`;
    const response = await axios.get(url);
    console.log('Current webhooks:', response.data);
    return response.data[0]; // Get the first webhook
  } catch (error) {
    console.error('Error getting webhooks:', error.response?.data || error.message);
    return null;
  }
}

// Modified updateHeliusWebhook function
async function updateHeliusWebhook(addresses) {
  try {
    const uniqueAddresses = [...new Set(addresses)];
    
    // Get existing webhook
    const existingWebhook = await getExistingWebhook();
    
    const webhookData = {
      webhookURL: `${process.env.SERVER_URL}/webhook`,
      accountAddresses: uniqueAddresses,
      transactionTypes: ["Any"], // Changed from "ALL" to "Any"
      webhookType: "enhanced"    // Added explicit webhookType
    };

    if (existingWebhook) {
      const updateUrl = `https://api.helius.xyz/v0/webhooks/${existingWebhook.webhookID}?api-key=${process.env.HELIUS_API_KEY}`;
      const response = await axios.put(updateUrl, webhookData);
      console.log('Updated webhook:', response.data);
      return response.data;
    } else {
      const createUrl = `https://api.helius.xyz/v0/webhooks?api-key=${process.env.HELIUS_API_KEY}`;
      const response = await axios.post(createUrl, webhookData);
      console.log('Created webhook:', response.data);
      return response.data;
    }
  } catch (error) {
    console.error('Webhook operation failed:', error.response?.data || error.message);
    throw error;
  }
}

// Call initialize when server starts
initializeConfig()
  .then(startWalletMonitoring)
  .then(() => {
    app.listen(process.env.PORT || 3000, () => {
      console.log(`Server is running on port ${process.env.PORT || 3000}`);
    });
  })
  .catch(console.error);

// Add a basic health check endpoint
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});