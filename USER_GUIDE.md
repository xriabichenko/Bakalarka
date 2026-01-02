# User Guide: Platform for verifying the origin and trading of building materials and products using Blockchain and NFT technology

## Table of Contents
1. [Introduction](#introduction)
2. [Getting Started](#getting-started)
3. [User Roles](#user-roles)
4. [Platform Features](#platform-features)
5. [Step-by-Step Workflows](#step-by-step-workflows)
6. [Troubleshooting](#troubleshooting)

---

## Introduction

This platform enables transparent, verifiable tracking and trading of construction materials using blockchain technology. Each physical material is linked to a digital NFT certificate stored on the blockchain, ensuring authenticity, provenance, and compliance throughout the supply chain.

### Key Concepts
- **NFTs (Non-Fungible Tokens)**: Digital certificates representing physical materials
- **IPFS**: Decentralized storage for material metadata
- **QR Codes**: Physical-digital linking mechanism
- **Blockchain**: Immutable record of all transactions and status changes

---

## Getting Started

### 1. Connect Your Wallet

1. Click the **wallet connection button** in the top-left corner of the page
2. Select your preferred wallet (MetaMask, WalletConnect, Coinbase Wallet, etc.)
3. Approve the connection request in your wallet
4. Ensure you're connected to the correct network (Hardhat Local for development, or your target network)

### 2. Register Your Role

Upon first connection, you'll see registration options:

#### Register as Buyer
- Click **"Register as Buyer"**
- You can browse the marketplace and purchase materials
- Cannot mint new materials

#### Register as Supplier
- Click **"Register as Supplier"**
- You can mint materials and sell them
- **Note**: You need a valid certificate to mint materials (see Certificate Management below)

---

## User Roles

### Buyer
- Browse marketplace materials
- Filter materials by various attributes
- Purchase materials with ETH
- View owned materials
- Update material status (if owner)
- View complete transaction history

### Supplier
- All Buyer capabilities, plus:
- Mint new Material NFTs
- List materials for sale
- Assemble materials into composite products
- Requires valid certificate from certificate provider
---

## Platform Features

### 1. Home Page

The home page provides an overview of how the platform works:
- **5 Key Sections**: Registration, Tokenization, Tracking, Marketplace, Verification
- **Navigation**: Use the "Go to Dashboard" button (when wallet is connected) to access main features

### 2. Dashboard

The main dashboard provides two views:

#### My Materials
- View all materials you own
- Filter by: name, supplier, batch number, description, status
- Click "View Details" to see full information
- Update material status
- List materials for sale

#### Marketplace
- Browse all materials listed for sale
- Filter by various attributes
- Purchase materials directly with ETH
- View seller information and material details

### 3. Filtering System

Both "My Materials" and "Marketplace" views support filtering:

1. Click the **"Filters"** button to expand filter options
2. Filter by:
   - **Name**: Material name (partial match)
   - **Supplier Name**: Supplier company name
   - **Batch Number**: Specific batch identifier
   - **Description**: Search in descriptions
   - **Status**: Available, In Transit, Delivered, Assembled
3. Multiple filters work together (AND logic)
4. Click **"Clear All"** to reset filters
5. Filter badge shows active filter count

### 4. Material Status Lifecycle

Materials progress through these statuses:

1. **Available** (Initial)
   - Material is ready for use
   - Can transition to: In Transit or Assembled

2. **In Transit**
   - Material is being shipped
   - Can transition to: Delivered

3. **Delivered**
   - Material has arrived at destination
   - Can transition to: Assembled or back to Available

4. **Assembled**
   - Material has been used in creating other NFT 
   - Final status (status can not be further updated)

**Note**: Status transitions are enforced by smart contract logic to ensure data integrity.

---

## Step-by-Step Workflows

### Workflow 1: Supplier - Mint a New Material NFT

1. **Ensure Certificate is Valid**
   - Check your user info panel (top-left)
   - Certificate status should show "Valid"
   - If invalid, contact a certificate provider

2. **Navigate to Mint Page**
   - Click **"Create Material NFT"** button in the header (visible when certificate is valid)
   - Or go to `/mint` route

3. **Fill in Material Information**
   - **Name**: Material name
   - **Description**: Detailed description
   - **Supplier Name**: Your company name
   - **Manufacture Date**: Date of manufacture 
   - **Batch Number**: Batch identifier
   - **Count**: Number of units
   - **Weight**: Weight value
   - **Measure Unit**: kg, lbs, etc.
   - **Dimensions**: Length, Width, Height (optional)
   - **Custom Expiration**: Set hours, days, months expiration(defaults to 6 months)(optional)
   - NFT Status and Certificate ID can not be changed and they are preset when minted

4. **Add Tooltips Information**
   - Hover over **"?"** icons next to fields for guidance

5. **Optional: Assemble from Existing Materials**
   - Select materials with status "Available" or "Delivered"
   - These will be consumed to create a composite product
   - Selected materials' status will change to "Assembled"

6. **Submit**
   - Click **"Mint NFT"**
   - Approve transaction in your wallet
   - Wait for confirmation
   - You'll be redirected to the dashboard

### Workflow 2: Supplier - List Material for Sale

1. **Navigate to Dashboard**
   - Go to "My Materials" view

2. **Select Material**
   - Click **"View Details"** on the material you want to sell

3. **Set Price**
   - Enter price in ETH
   - Click **"List for Sale"**
   - Approve transaction in wallet

4. **Material Appears in Marketplace**
   - Your material is now visible to all buyers
   - You can cancel the listing anytime

### Workflow 3: Buyer - Purchase Material

1. **Browse Marketplace**
   - Go to Dashboard -> Marketplace view
   - Use filters to find specific materials

2. **View Material Details**
   - Click on a material card or "View Details"
   - Review all metadata and current status

3. **Purchase**
   - Click **"Buy"** button
   - Approve transaction in wallet
   - Ensure you have sufficient ETH balance

4. **Material Ownership Transferred**
   - Material appears in your "My Materials" view
   - You can now update its status or resell it

### Workflow 4: Update Material Status

1. **Navigate to Material Details**
   - Go to "My Materials" -> Click "View Details"

2. **Select New Status**
   - Dropdown shows only valid transitions based on current status
   - For example:
     - Available -> In Transit or Assembled
     - In Transit -> Delivered
     - Delivered -> Assembled or Available

3. **Update**
   - Click **"Update Status"**
   - Approve transaction
   - Status change is permanently recorded on blockchain

### Workflow 5: View Transaction History

1. **Open Material Details**
   - Navigate to any material's detail page

2. **View History**
   - Click **"Show Transaction History"** button

3. **Review Events**
   - **Creation**: When NFT was minted
   - **Transfers**: Ownership changes
   - **Listed**: When material was listed for sale
   - **Sold**: Purchase transactions
   - **Cancelled**: Listing cancellations
   - **Status Updates**: All status changes with timestamps
   - **Assembled**: If material was created from other materials

4. **Transaction Details**
   - Each event shows:
     - Type and label
     - Timestamp
     - Transaction hash 
     - Additional details

### Workflow 6: Certificate Provider - Issue Certificate

1. **Verify Owner Status**
   - Check if you're the certificate contract owner
   - Owner panel appears automatically if you're the owner

2. **Issue Certificate**
   - Enter supplier's wallet address
   - Select expiration period
   - Enter metadata URI (IPFS link to certificate data)
   - Click **"Issue Certificate"**
   - Approve transaction

3. **Certificate Active**
   - Supplier can now mint materials
   - Certificate validity shown in their user info

### Workflow 7: Certificate Provider - Revoke Certificate

1. **Navigate to Certificate Panel**
   - Owner panel visible in dashboard sidebar

2. **Revoke Certificate**
   - Click **"Revoke Certificate"** button
   - Confirm in popup warning
   - Enter supplier's address
   - Approve transaction

3. **Warning**
   - Popup warns: "After revocation, this supplier will not be able to issue a certificate again"
   - This action is permanent

---

## Material Detail Page Features

### Static Metadata (from IPFS)
- Name, Description, Supplier Name
- Certification ID, Manufacture Date
- Batch Number, Count, Weight, Dimensions

### Dynamic Metadata (On-Chain)
- Current Status
- Expiration Timestamp
- Current Owner

### Status Update
- Dropdown with valid transitions only
- Update button to change status

### Marketplace Actions
- **List for Sale**: Set price and list
- **Cancel Listing**: Remove from marketplace
- **Buy**: Purchase if listed by another user

### QR Code
- Automatically generated QR code
- Links to material detail page
- Can be printed and attached to physical material

### Transaction History
- Complete audit trail
- All events with timestamps
- Clickable transaction hashes

---

## Advanced Features

### Material Assembly

Suppliers can create composite materials:

1. When minting, select existing materials from "Assembled from" section
2. Only materials with status "Available" or "Delivered" can be selected
3. Selected materials are consumed (status → Assembled)
4. New material's metadata includes `nfts_consumed` array
5. Transaction history shows assembly relationships

### Filtering and Search

- **Real-time filtering**: Results update as you type
- **Multiple criteria**: Combine filters for precise searches
- **Status filtering**: Filter by material lifecycle stage
- **Filter persistence**: Filters remain active when switching views

### QR Code Integration

- Each material has a unique QR code
- QR code links to material detail page
- Can be scanned with any QR reader
- Provides instant access to blockchain-verified information

---

## Troubleshooting

### Wallet Connection Issues

**Problem**: Cannot connect wallet
- **Solution**: 
  - Ensure wallet extension is installed
  - Check if wallet is unlocked
  - Verify correct network is selected
  - Try refreshing the page

**Problem**: Wrong network
- **Solution**: 
  - Switch to correct network in wallet
  - For local development: Use "Hardhat Local" network (Chain ID: 31337)

### Transaction Issues

**Problem**: Transaction fails
- **Solution**:
  - Check ETH balance (need gas fees)
  - Verify you have required permissions (e.g., supplier role for minting)
  - Check certificate validity (for suppliers)
  - Review error message in wallet

**Problem**: "Insufficient funds"
- **Solution**: 
  - Add ETH to your wallet
  - For local development: Import test account from Hardhat node

### Material Minting Issues

**Problem**: Cannot mint material
- **Solution**:
  - Verify you're registered as Supplier
  - Check certificate is valid (should show "Valid" in user info)
  - Ensure all required fields are filled
  - Check Pinata JWT is configured (for IPFS uploads)

**Problem**: IPFS upload fails
- **Solution**:
  - Verify `VITE_PINATA_JWT` environment variable is set
  - Check Pinata API key has correct permissions
  - Ensure internet connection is stable

### Status Update Issues

**Problem**: Cannot update status
- **Solution**:
  - Verify you own the material
  - Check if transition is valid (dropdown only shows allowed transitions)
  - Ensure material hasn't expired
  - Check transaction isn't pending

### Filtering Issues

**Problem**: Filters not working
- **Solution**:
  - Clear all filters and reapply
  - Check if metadata is loaded (may take a moment)
  - Refresh the page

### Display Issues

**Problem**: Materials not showing
- **Solution**:
  - Check wallet is connected
  - Verify contracts are deployed
  - Check browser console for errors
  - Ensure `contractAddresses.json` has correct addresses

---

## Security Notes

- **Private Keys**: Never share your wallet private key
- **Transactions**: Always verify transaction details before approving
- **Status Transitions**: Smart contract enforces valid transitions only
- **Ownership**: Only material owners can update status or list for sale

---

## Support

For technical issues:
1. Check browser console for error messages
2. Review transaction history on blockchain explorer
3. Verify all environment variables are set correctly
4. Ensure contracts are deployed to correct network
---

## Glossary

- **NFT**: Non-Fungible Token - unique digital certificate
- **IPFS**: InterPlanetary File System - decentralized storage
- **Metadata**: Information about the material (stored on IPFS)
- **Provenance**: Complete history of ownership and status changes
- **SoulBound Token**: Non-transferable token representing user role
- **Certificate NFT**: Token proving supplier certification
- **Material NFT**: Token representing a physical construction material
- **Status**: Current lifecycle stage of material (Available, In Transit, Delivered, Assembled)

---

