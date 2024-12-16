require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs').promises;
const ConfigLoader = require('./src/services/config/ConfigLoader');

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: process.env.MONGO_DB_NAME
    });
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error.message);
    process.exit(1);
  }
}

const config = new ConfigLoader();

// Function to validate Solana address (basic check)
function isValidSolanaAddress(address) {
  return /^[A-HJ-NP-Za-km-z1-9]{32,44}$/.test(address);
}

// Function to handle bulk import
async function importWallets(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const lines = content.split('\n');
    
    const results = {
      success: [],
      existing: [],
      invalid: []
    };

    for (const line of lines) {
      const address = line.trim();
      
      // Skip empty lines and comments
      if (!address || address.startsWith('#')) continue;

      // Validate address format
      if (!isValidSolanaAddress(address)) {
        results.invalid.push(address);
        continue;
      }

      try {
        await config.addWallet(address);
        results.success.push(address);
      } catch (error) {
        if (error.message.includes('already exists')) {
          results.existing.push(address);
        } else {
          console.error(`Error adding wallet ${address}:`, error.message);
        }
      }
    }

    // Print results
    console.log('\nImport Results:');
    if (results.success.length > 0) {
      console.log('\n✅ Successfully added:');
      results.success.forEach(addr => console.log(`  ${addr}`));
    }
    if (results.existing.length > 0) {
      console.log('\n⚠️  Already existing:');
      results.existing.forEach(addr => console.log(`  ${addr}`));
    }
    if (results.invalid.length > 0) {
      console.log('\n❌ Invalid addresses:');
      results.invalid.forEach(addr => console.log(`  ${addr}`));
    }

    console.log(`\nSummary: Added ${results.success.length}, Skipped ${results.existing.length}, Invalid ${results.invalid.length}`);
  } catch (error) {
    console.error('Error reading file:', error.message);
  }
}

async function main() {
  await connectDB();

  const command = process.argv[2];
  const arg1 = process.argv[3];
  const arg2 = process.argv[4];

  try {
    switch (command) {
      case 'import':
        await importWallets(arg1 || 'wallets.txt');
        break;

      case 'add':
      case 'add-wallet':
        if (!arg1) throw new Error('Wallet address required');
        await config.addWallet(arg1);
        console.log(`Added wallet: ${arg1}`);
        console.log('Wallet has been added to both config and database');
        break;

      case 'remove':
      case 'remove-wallet':
        if (!arg1) throw new Error('Wallet address required');
        await config.removeWallet(arg1);
        console.log(`Removed wallet: ${arg1}`);
        console.log('Wallet has been removed from both config and database');
        break;

      case 'token':
        if (!arg1 || !arg2) throw new Error('Token mint and symbol required');
        await config.addToken(arg1, arg2);
        console.log(`Added token: ${arg2} (${arg1})`);
        break;

      case 'remove-token':
        if (!arg1) throw new Error('Token mint required');
        await config.removeToken(arg1);
        console.log(`Removed token: ${arg1}`);
        break;

      case 'mode':
        if (arg1 === undefined) throw new Error('Mode required (true/false)');
        const mode = arg1.toLowerCase() === 'true';
        await config.setTokenTrackingMode(mode);
        console.log(`Set token tracking mode to: ${mode}`);
        break;

      case 'list':
        const currentConfig = await config.listWallets();
        console.log('\nWallets:');
        currentConfig.wallets.forEach(wallet => {
          console.log(`\nAddress: ${wallet.address}`);
          console.log(`Status: ${wallet.inDatabase ? 'In Database' : 'Not in Database'}`);
          console.log(`Active: ${wallet.isActive}`);
          if (wallet.lastChecked) {
            console.log(`Last Checked: ${new Date(wallet.lastChecked).toLocaleString()}`);
          }
        });

        console.log('\nToken Tracking:');
        console.log(`Mode: ${currentConfig.tokenTracking.trackOnlyListed ? 'Listed Tokens Only' : 'All Tokens'}`);
        console.log('Tracked Tokens:');
        currentConfig.tokenTracking.trackedTokens.forEach(token => {
          console.log(`- ${token.symbol} (${token.mint})`);
        });
        break;

      default:
        console.log(`
Usage:
  node manage-wallets.js import [file]     Import wallets from file (default: wallets.txt)
  node manage-wallets.js add <address>     Add a single wallet
  node manage-wallets.js remove <address>  Remove a wallet
  node manage-wallets.js token <mint> <symbol>   Add a token to track
  node manage-wallets.js remove-token <mint>     Remove a token
  node manage-wallets.js mode <true/false>       Set token-only mode
  node manage-wallets.js list                    Show current config
        `);
    }
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

main(); 