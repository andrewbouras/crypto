# Solana Wallet Tracker

A robust system for monitoring Solana wallets and their transactions, with support for both SOL and SPL tokens.

## Wallet Management

There are two ways to add wallets to the tracking system:

### 1. Single Wallet Addition

To add a single wallet, use the following command:

```bash
node manage-wallets.js add <wallet-address>
```

Example:
```bash
node manage-wallets.js add 4NcmptCFMTK3VWNyEhTETiQLvEcrmLtNtQVvtAqjXAZ4
```

### 2. Bulk Import

1. Edit the `wallets.txt` file and add wallet addresses (one per line)
2. Run the import command:

```bash
node manage-wallets.js import
```

The `wallets.txt` format:
```plaintext
# Lines starting with # are comments
# Empty lines are ignored
4NcmptCFMTK3VWNyEhTETiQLvEcrmLtNtQVvtAqjXAZ4
HygwK1KmCt6vPg9Y3mWc5VD8psUey9hLpvdJXGFydAcR
```

### Additional Wallet Management Commands

```bash
# Remove a wallet
node manage-wallets.js remove <wallet-address>

# List all tracked wallets and their status
node manage-wallets.js list

# Add a token to track
node manage-wallets.js token <token-mint> <token-symbol>

# Remove a tracked token
node manage-wallets.js remove-token <token-mint>

# Set token tracking mode (true = track only listed tokens, false = track all tokens)
node manage-wallets.js mode <true/false>
```

## Import Results

When using the bulk import feature, you'll receive a detailed report:

- ✅ Successfully added wallets
- ⚠️ Already existing wallets (skipped)
- ❌ Invalid addresses (skipped)

## Notes

- Both single addition and bulk import can be used interchangeably
- Duplicate wallets are automatically detected and skipped
- Invalid wallet addresses are filtered out
- The system maintains wallet status in both the configuration and database
