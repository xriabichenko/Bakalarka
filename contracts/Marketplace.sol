// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface IMaterialNFT is IERC721 {
    function ownerOf(uint256 tokenId) external view returns (address);
}

contract Marketplace is Ownable {
    struct tokenListing {
        address seller;
        address nftContract;
        uint256 tokenId;
        uint256 price;
        bool active;
    }

    mapping(address => mapping(uint256 => tokenListing)) public listings;

    event Listed(address indexed seller, address indexed nftContract, uint256 indexed tokenId, uint256 price);
    event Sold(address indexed buyer, address indexed nftContract, uint256 indexed tokenId, uint256 price);
    event Cancelled(address indexed seller, address indexed nftContract, uint256 indexed tokenId);

    constructor() Ownable(msg.sender) {}
    
    function listNFT(address nftContract, uint256 tokenId, uint256 price) external {
        require(price > 0, "Price must be more than 0");
        IMaterialNFT nft = IMaterialNFT(nftContract);
        require(nft.ownerOf(tokenId) == msg.sender, "Not the owner");
        
        require(
            IERC721(nftContract).getApproved(tokenId) == address(this) ||
            IERC721(nftContract).isApprovedForAll(msg.sender, address(this)),
            "Marketplace not approved"
        );

        listings[nftContract][tokenId] = tokenListing({
            seller: msg.sender,
            nftContract: nftContract,
            tokenId: tokenId,
            price: price,
            active: true
        });

        emit Listed(msg.sender, nftContract, tokenId, price);
    }
    
    function buyNFT(address nftContract, uint256 tokenId) external payable {

        tokenListing storage listing = listings[nftContract][tokenId];
        require(listing.active, "Not listed");
        require(msg.value >= listing.price, "Insufficient funds");

        listing.active = false;

        // Transfer funds to seller
        payable(listing.seller).transfer(listing.price);

        // Transfer NFT to buyer
        IERC721(nftContract).safeTransferFrom(listing.seller, msg.sender, tokenId);
        emit Sold(msg.sender, nftContract, tokenId, listing.price);
    }

    function cancelListing(address nftContract, uint256 tokenId) external {
        tokenListing storage listing = listings[nftContract][tokenId];
        require(listing.seller == msg.sender, "Not your listing");
        require(listing.active, "Already inactive");
        listing.active = false;
        emit Cancelled(msg.sender, nftContract, tokenId);
    }

    function getListing(address nftContract, uint256 tokenId)
    external
    view
    returns (tokenListing memory)
    {
        return listings[nftContract][tokenId];
    }
}
