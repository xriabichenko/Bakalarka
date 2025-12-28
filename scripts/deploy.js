// import { uploadNFTOnIPFS } from './uploadNFTOnIPFS.js';
// import hre from "hardhat";
// const { ethers } = hre;
//
// async function main() {
//     const [owner, supplier] = await ethers.getSigners();
//
//     const SoulBoundRole = await ethers.getContractFactory("SoulBoundRole");
//     const soulBoundRole = await SoulBoundRole.deploy();
//     await soulBoundRole.waitForDeployment();
//
//     const CertificateNFT = await ethers.getContractFactory("CertificateNFT");
//     const certificateNFT = await CertificateNFT.deploy();
//     await certificateNFT.waitForDeployment();
//
//     const MaterialNFT = await ethers.getContractFactory("MaterialNFT");
//     const materialNFT = await MaterialNFT.deploy(await soulBoundRole.getAddress(), await certificateNFT.getAddress());
//     await materialNFT.waitForDeployment();
//
//     // Upload metadata, get URL
//     const ipfsUrl = uploadNFTOnIPFS({
//         supplierName: "ACME Construction Ltd",
//         certificationId: "CERT-2025-002",
//         manufactureDate: "2025-11-02",
//         batchNumber: "BN-1089",
//         name: "Steel Beams",
//         count: 120,
//         weight: 3500,
//         measureUnit: "kg",
//         description: "High-quality structural steel beams.",
//         length: 3.5,
//         width: 0.3,
//         height: 0.25
//     });
//
//     await soulBoundRole.connect(supplier).registerUser(1);
//     await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
//     await materialNFT.connect(supplier).mint(ipfsUrl);
//
//     console.log("Minted material NFT with URI:", ipfsUrl);
// }
//
// main().catch(console.error);

import hre from "hardhat";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
    console.log("Deploying contracts...");

    const [owner, supplier, buyer] = await hre.ethers.getSigners();

    // Deploy contracts in correct order
    const SoulBoundRole = await hre.ethers.getContractFactory("SoulBoundRole");
    const soulBoundRole = await SoulBoundRole.deploy();
    await soulBoundRole.waitForDeployment();
    console.log("SoulBoundRole deployed to:", await soulBoundRole.getAddress());

    const CertificateNFT = await hre.ethers.getContractFactory("CertificateNFT");
    const certificateNFT = await CertificateNFT.deploy();
    await certificateNFT.waitForDeployment();
    console.log("CertificateNFT deployed to:", await certificateNFT.getAddress());

    const MaterialNFT = await hre.ethers.getContractFactory("MaterialNFT");
    const materialNFT = await MaterialNFT.deploy(
        await soulBoundRole.getAddress(),
        await certificateNFT.getAddress()
    );
    await materialNFT.waitForDeployment();
    console.log("MaterialNFT deployed to:", await materialNFT.getAddress());

    const Marketplace = await hre.ethers.getContractFactory("Marketplace");
    const marketplace = await Marketplace.deploy();
    await marketplace.waitForDeployment();
    console.log("Marketplace deployed to:", await marketplace.getAddress());

    //Save contract addresses to JSON
    const addresses = {
        SoulBoundRole: await soulBoundRole.getAddress(),
        CertificateNFT: await certificateNFT.getAddress(),
        MaterialNFT: await materialNFT.getAddress(),
        Marketplace: await marketplace.getAddress(),
    };

    const frontendPath = path.join(__dirname, "../frontend/src/contractAddresses.json");
    fs.writeFileSync(frontendPath, JSON.stringify(addresses, null, 2));

    console.log("Addresses saved to frontend/src/contractAddresses.json");
    console.log(addresses);

    console.log("Deployment completed successfully!");
    console.log("Now run: cd frontend && npm run dev");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
