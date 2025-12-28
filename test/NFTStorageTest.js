import { NFTStorage } from 'nft.storage';
import 'dotenv/config';

const client = new NFTStorage({ token: process.env.NFT_STORAGE_KEY });

(async () => {
    try {
        const res = await client.status("baf..."); // random CID check
        console.log("Token works!");
    } catch (err) {
        console.error("Token is invalid:", err.message);
    }
})();