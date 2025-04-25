# Solana Token Sniper and Trader Bot

This app is the open source content of a larger trading bot it can work as a stand alone trading bot it automates the process of finding, validating, and trading newly listed Solana tokens using public APIs from Raydium, DexScreener, RugCheck, and CoinGecko. It's designed as the backend logic for a future wallet protection and token auto-trading tool.

---

## 🔧 Features

- Fetch latest token listings from DexScreener
- Validate tokens using:
  - Age (min/max)
  - Raydium liquidity
  - Market cap and FDV ratio
  - RugCheck risk score
- Fetch real-time SOL and token prices
- Fetch Raydium swap and sell quotes
- Serialize, deserialize, sign, and send transactions using Raydium SDK
- Graceful retry logic for transactions

---

## 📁 Project Structure

```
project/
├── trade.js                # Main logic
├── config.js                # Wallet, connection, helper functions
├── package.json             # Dependencies
```

---

## 🧪 Validation Criteria

Each token is filtered using:

- **Age:** Between 10 minutes and 6000 minutes old
- **Liquidity:** > $100
- **Market Cap:** > $100
- **Market Cap/FDV Ratio:** > 0.5
- **RugCheck Risk Score:** ≤ 1

---

## ⚙️ How It Works

### 1. Fetch New Tokens

Uses `https://api.dexscreener.com/token-profiles/latest/v1` to get new Solana tokens.

### 2. Validate Each Token

Cross-checks token data with:

- DexScreener Raydium pairs
- RugCheck API
- Market metrics

### 3. Get SOL Price

Fetches SOL/USD from CoinGecko.

### 4. Get Token Price

Gets token USD price from DexScreener.

### 5. Fetch Swap Quote

Uses Raydium SDK to simulate a $0.10 buy in SOL.

### 6. Fetch Sell Quote

Estimates return for full token sell to SOL.

### 7. Serialize & Send Transactions

- Serializes Raydium transaction from swap quote
- Signs and sends transaction with retry and confirmation logic

---

## ✅ Requirements

- Node.js >= 18
- `@solana/web3.js`
- `@solana/spl-token`
- `@raydium-io/raydium-sdk-v2`
- `axios`

---

## 📦 Installation

```bash
npm install
```

Update your `.env` with:

- RPC connection
- Wallet keypair (`owner`)
- Optional: Token account helpers

---

## 🚀 Usage

```bash
node trade.js
```

---

## 📌 Notes

- Not all tokens listed are safe. This script filters, but does not guarantee safety.
- For CLI use or browser extensions.
- Raydium SDK uses lamports (1e9 = 1 SOL).

---

## 🛡️ Disclaimer

This tool is provided for educational and research purposes. Always do your own due diligence before trading new tokens.

---

## 📬 Contact

Open an issue or reach out if you want to collaborate, integrate this into your bot, or turn this into a full UI.