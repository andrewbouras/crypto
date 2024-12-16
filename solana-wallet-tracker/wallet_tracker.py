import requests
import time
from datetime import datetime

# Replace with your Helius API key
HELIUS_KEY = "your_helius_api_key"

# Add your wallet addresses to track
WALLETS_TO_TRACK = [
    "wallet_address_1",
    "wallet_address_2",
    # Add more wallets as needed
]

def check_transactions(wallet):
    url = f'https://api.helius.xyz/v0/addresses/{wallet}/transactions?api-key={HELIUS_KEY}'
    try:
        response = requests.get(url)
        return response.json()
    except Exception as e:
        print(f"Error checking wallet {wallet}: {e}")
        return None

def main():
    # Store last known transaction signature for each wallet
    last_known_tx = {wallet: None for wallet in WALLETS_TO_TRACK}
    
    print("Starting wallet tracker...")
    print(f"Tracking wallets: {', '.join(WALLETS_TO_TRACK)}")
    
    while True:
        for wallet in WALLETS_TO_TRACK:
            transactions = check_transactions(wallet)
            
            if transactions and len(transactions) > 0:
                latest_tx = transactions[0]['signature']
                
                # If this is a new transaction
                if last_known_tx[wallet] != latest_tx:
                    tx_type = transactions[0].get('type', 'Unknown')
                    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    print(f"\n{timestamp}")
                    print(f"New transaction for wallet {wallet[:4]}...{wallet[-4:]}")
                    print(f"Type: {tx_type}")
                    print(f"Signature: {latest_tx}")
                    print(f"View on Solscan: https://solscan.io/tx/{latest_tx}")
                    
                    last_known_tx[wallet] = latest_tx
        
        # Wait 10 seconds before next check
        time.sleep(10)

if __name__ == "__main__":
    main() 