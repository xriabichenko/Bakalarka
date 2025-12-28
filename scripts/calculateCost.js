// scripts/calculateCost.js  (ethers v6 + ESM compatible)

import pkg from "hardhat";
const { ethers } = pkg;

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    const [owner, buyer] = await ethers.getSigners();  // owner and a fixed buyer

    // Load contract addresses
    const addressesPath = path.join(__dirname, "../frontend/src/contractAddresses.json");
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));

    const SoulBound = await ethers.getContractFactory("SoulBoundRole");
    const soulBound = SoulBound.attach(addresses.SoulBoundRole);

    const Certificate = await ethers.getContractFactory("CertificateNFT");
    const certificate = Certificate.attach(addresses.CertificateNFT);

    const Material = await ethers.getContractFactory("MaterialNFT");
    const material = Material.attach(addresses.MaterialNFT);

    const Marketplace = await ethers.getContractFactory("Marketplace");
    const marketplace = Marketplace.attach(addresses.Marketplace);

    const numRuns = 5; // You can increase to 20
    const gasPriceGwei = 0.029; // Current real gas price (Dec 28, 2025)
    const ethPriceUSD = 2937;   // Current ETH price ≈ $2,937 USD

    let results = {
        registration: [],
        issuance: [],
        minting: [],
        listing: [],
        purchase: []
    };

    console.log(`Measuring gas over ${numRuns} runs on localhost...\n`);

    for (let i = 0; i < numRuns; i++) {
        console.log(`Run ${i + 1}/${numRuns}`);

        // Create a fresh random supplier wallet for each run
        const supplierWallet = ethers.Wallet.createRandom().connect(ethers.provider);

        // Fund the new supplier with some ETH from owner (needed for future mainnet, harmless locally)
        await owner.sendTransaction({
            to: supplierWallet.address,
            value: ethers.parseEther("1")
        });

        // 1. Register as Supplier
        const tx1 = await soulBound.connect(supplierWallet).registerUser(1);
        const receipt1 = await tx1.wait();
        results.registration.push(Number(receipt1.gasUsed));

        // 2. Issue Certificate (owner → new supplier)
        const expiration = Math.floor(Date.now() / 1000) + 180 * 24 * 3600;
        const tx2 = await certificate.connect(owner).issueCertificate(supplierWallet.address, expiration, "");
        const receipt2 = await tx2.wait();
        results.issuance.push(Number(receipt2.gasUsed));

        // 3. Mint Material
        const metadataURI = "ipfs://QmExampleMetadataCID123456789";
        const tx3 = await material.connect(supplierWallet).mint(metadataURI);
        const receipt3 = await tx3.wait();
        results.minting.push(Number(receipt3.gasUsed));

        // Get the minted tokenId (last Transfer to supplier)
        const transferEvents = await material.queryFilter(
            material.filters.Transfer(null, supplierWallet.address)
        );
        const tokenId = transferEvents[transferEvents.length - 1].args.tokenId;

        // Approve marketplace
        await (await material.connect(supplierWallet).approve(addresses.Marketplace, tokenId)).wait();

        // 4. List on Marketplace
        const price = ethers.parseEther("0.01");
        const tx4 = await marketplace.connect(supplierWallet).listNFT(addresses.MaterialNFT, tokenId, price);
        const receipt4 = await tx4.wait();
        results.listing.push(Number(receipt4.gasUsed));

        // 5. Purchase (using fixed buyer)
        const tx5 = await marketplace.connect(buyer).buyNFT(addresses.MaterialNFT, tokenId, { value: price });
        const receipt5 = await tx5.wait();
        results.purchase.push(Number(receipt5.gasUsed));
    }

    const avg = (arr) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);

    const averages = {
        registration: avg(results.registration),
        issuance: avg(results.issuance),
        minting: avg(results.minting),
        listing: avg(results.listing),
        purchase: avg(results.purchase)
    };

    console.log("\n=== Average Gas Usage ===");
    Object.entries(averages).forEach(([op, gas]) => {
        console.log(`${op.charAt(0).toUpperCase() + op.slice(1)}: ${gas.toLocaleString()} gas`);
    });

    const totalGas = Object.values(averages).reduce((a, b) => a + b, 0);
    const costETH = (gas) => (gas * gasPriceGwei) / 1e9;
    const costUSD = (gas) => costETH(gas) * ethPriceUSD;

    console.log("\n=== Estimated Mainnet Costs (December 28, 2025) ===");
    console.log(`Gas Price: ${gasPriceGwei} Gwei | ETH Price: $${ethPriceUSD}\n`);

    Object.entries(averages).forEach(([op, gas]) => {
        const eth = costETH(gas).toFixed(8);
        const usd = costUSD(gas).toFixed(4);
        console.log(`${op.charAt(0).toUpperCase() + op.slice(1)}: ~${eth} ETH (≈ $${usd} USD)`);
    });

    const fullETH = costETH(totalGas).toFixed(8);
    const fullUSD = costUSD(totalGas).toFixed(4);
    console.log(`\nFull flow total gas: ${totalGas.toLocaleString()}`);
    console.log(`Full flow cost: ~${fullETH} ETH (≈ $${fullUSD} USD)`);
}

main().catch((error) => {
    console.error("Error:", error);
    process.exit(1);
});