// // scripts/uploadNFTOnIPFS.js [Light house version]
//
// import lighthouse from '@lighthouse-web3/sdk';
// import fs from 'fs';
// import path from 'path';
// import 'dotenv/config';
//
// export async function uploadNFTOnIPFS(material) {
//     const metadata = {
//         name: material.name,
//         description: material.description,
//         attributes: [
//             { trait_type: "Supplier Name", value: material.supplierName },
//             { trait_type: "Certification ID", value: material.certificationId },
//             { trait_type: "Manufacture Date", value: material.manufactureDate },
//             { trait_type: "Batch Number", value: material.batchNumber },
//             { trait_type: "Count", value: material.count },
//             { trait_type: "Weight", value: material.weight },
//             { trait_type: "Measure Unit", value: material.measureUnit },
//             { trait_type: "Length (m)", value: material.length },
//             { trait_type: "Width (m)", value: material.width },
//             { trait_type: "Height (m)", value: material.height }
//         ]
//     };
//     const tempFilePath = path.resolve(`./temp_metadata_${Date.now()}.json`);
//     fs.writeFileSync(tempFilePath, JSON.stringify(metadata, null, 2));
//
//     const response = await lighthouse.upload(
//         tempFilePath,
//         process.env.LIGHTHOUSE_KEY
//     );
//     fs.unlinkSync(tempFilePath);
//     const ipfsHash = response.data.Hash;
//     const ipfsUrl = `https://gateway.lighthouse.storage/ipfs/${ipfsHash}`;
//     console.log("Metadata uploaded to Lighthouse IPFS:", ipfsUrl);
//
//     return ipfsUrl;
// }
//
// if (process.argv[1].includes("uploadNFTOnIPFS.js")) {
//     (async () => {
//         const ipfsUrl = uploadNFTOnIPFS({
//             supplierName: "ACME Construction",
//             certificationId: "CERT-001",
//             manufactureDate: "2025-11-02",
//             batchNumber: "BN-1089",
//             name: "Wooden planks",
//             count: 120,
//             weight: 3500,
//             measureUnit: "kg",
//             description: "Wooden planks",
//             length: 3.5,
//             width: 0.3,
//             height: 0.25
//         });
//         console.log("Metadata URI:", ipfsUrl);
//     })();
// }

// scripts/uploadNFTOnIPFS.js

import { NFTStorage, File } from 'nft.storage';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

const client = new NFTStorage({ token: process.env.NFT_STORAGE_KEY });

export async function uploadNFTOnIPFS(material) {
    const metadata = {
        name: material.name,
        description: material.description,
        attributes: [
            { trait_type: "Supplier Name", value: material.supplierName },
            { trait_type: "Certification ID", value: material.certificationId },
            { trait_type: "Manufacture Date", value: material.manufactureDate },
            { trait_type: "Batch Number", value: material.batchNumber },
            { trait_type: "Count", value: material.count },
            { trait_type: "Weight", value: material.weight },
            { trait_type: "Measure Unit", value: material.measureUnit },
            { trait_type: "Length (m)", value: material.length },
            { trait_type: "Width (m)", value: material.width },
            { trait_type: "Height (m)", value: material.height }
        ]
    };

    // Convert to a Blob-like object for NFT.Storage
    const file = new File(
        [JSON.stringify(metadata, null, 2)],
        "metadata.json",
        { type: "application/json" }
    );

    // Upload to IPFS + Filecoin
    const cid = await client.storeBlob(file);

    const ipfsUrl = `https://ipfs.io/ipfs/${cid}`;
    console.log("Metadata uploaded to NFT.Storage:", ipfsUrl);

    return ipfsUrl;
}

if (process.argv[1].includes("uploadNFTOnIPFS.js")) {
    (async () => {
        const ipfsUrl = await uploadNFTOnIPFS({
            supplierName: "ACME Construction",
            certificationId: "CERT-001",
            manufactureDate: "2025-11-02",
            batchNumber: "BN-1089",
            name: "Wooden planks",
            count: 120,
            weight: 3500,
            measureUnit: "kg",
            description: "Wooden planks",
            length: 3.5,
            width: 0.3,
            height: 0.25
        });
        console.log("Metadata URI:", ipfsUrl);
    })();
}
