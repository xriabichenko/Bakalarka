# Platform for verifying the origin and trading of building materials and products using Blockchain and NFT technology

This repository contains a decentralized application for verifying the origin, certification, and trading of construction materials using **Blockchain**, **NFTs**, and **QR Code-based physical–digital linkage**. The system combines Ethereum smart contracts, IPFS-based metadata storage, and a React frontend to provide transparent provenance tracking and a decentralized marketplace.

## Repo Structure

- `contracts/` – Solidity smart contracts (SoulBoundRole, CertificateNFT, MaterialNFT, Marketplace)
- `scripts/` – Deployment and utility scripts
- `test/` – Smart contract tests (Hardhat/Chai)
- `frontend/` – Vite + React frontend with RainbowKit wallet integration
- `hardhat.config.cjs` – Hardhat configuration
- `package.json` – Backend/Hardhat dependencies and scripts

## Requirements

- Node.js 
- npm 
- MetaMask or any EVM-compatible wallet (RainbowKit supports multiple wallets)
- Pinata account (for IPFS storage) - [Sign up at pinata.cloud](https://pinata.cloud)

## Installation

### 1) Install backend (Hardhat) dependencies
From the project root:
```bash
npm install
```

### 2) Install frontend dependencies
```bash
cd frontend
npm install
cd ..
```

### 3) Configure Environment Variables
Create a `.env` file in the `frontend/` directory:
```bash
cd frontend
touch .env
```

Add your Pinata JWT token:
```
VITE_PINATA_JWT=your_pinata_jwt_token_here
```

To get your Pinata JWT:
1. Sign up at [pinata.cloud](https://pinata.cloud)
2. Go to API Keys section
3. Create a new key with "pinJSONToIPFS" permission
4. Copy the JWT token

## Run Locally (2 terminals)

### Terminal 1: Start local Hardhat blockchain
From the project root:

```bash
npx hardhat node
```

Keep this running. It provides test accounts with pre-funded ETH. 

**Note**: Copy one of the private keys from the terminal output for MetaMask import.

### Terminal 2: Deploy contracts to localhost
Deploy the contracts to the local Hardhat node. From the project root:

```bash
npx hardhat run scripts/deploy.js --network localhost
```

This will:
- Deploy contracts in the correct order (SoulBoundRole -> CertificateNFT -> MaterialNFT -> Marketplace)
- Automatically update `frontend/src/contractAddresses.json` with deployed addresses

### Terminal 2 (continued): Start React frontend

```bash
cd frontend
npm run dev
```

Open the URL shown in the terminal (by default `http://localhost:5173`). 

## MetaMask Setup (localhost)

1. **Add a network in MetaMask:**
   - Network name: `Hardhat Local`
   - RPC URL: `http://127.0.0.1:8545`
   - Chain ID: `31337`
   - Currency symbol: `ETH`

2. **Import a test account:**
   - Copy a private key from the `npx hardhat node` terminal output
   - In MetaMask: Settings -> Security & Privacy -> Show Private Key (or use Import Account)
   - Paste the private key

3. **Fund the account:**
   - Test accounts from Hardhat node are pre-funded with 10,000 ETH

## Wallet Connection

The application uses **RainbowKit** for wallet connection, which supports:
- MetaMask
- WalletConnect
- Coinbase Wallet
- And other EVM-compatible wallets

Click the wallet button in the top-left corner to connect your wallet.

## Testing

Run smart contract tests:
```bash
npx hardhat test test/TestContracts.cjs
```

## Key Features

- **Role-based Access**: Suppliers and Buyers with SoulBound tokens
- **Certificate Management**: Certificate NFTs for supplier verification
- **Material Tokenization**: Material NFTs with IPFS metadata
- **Status Tracking**: Available; In Transit; Delivered; Assembled
- **Decentralized Marketplace**: Buy/sell materials with ETH
- **QR Code Integration**: Physical-digital linking via QR codes
- **Provenance Tracking**: Complete transaction and status history
