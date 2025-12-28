// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import "./SoulBoundRole.sol";
import "./CertificateNFT.sol";

contract MaterialNFT is ERC721, Ownable {
    using Strings for uint256;

    SoulBoundRole   public soulBoundToken;
    CertificateNFT  public certificateNFT;

    uint256 private _tokenIdCounter;

    enum Status { Available, InTransit, Delivered, Assembled }
    //Structure that represents material
    struct Material {
        string id;
        Status status;
        uint256 expirationTimestamp;
        string metadataURI;     // IPFS link to full JSON
    }

    mapping(uint256 => Material) public materials;

    // Default: 6 months = 180 days
    uint256 public constant DEFAULT_EXPIRATION_TIMESTAMP = 180 days;

    constructor(
        address _soulBoundToken,
        address _certificateNFT
    ) ERC721("MaterialNFT", "MNFT") Ownable(msg.sender) {
        soulBoundToken  = SoulBoundRole(_soulBoundToken);
        certificateNFT  = CertificateNFT(_certificateNFT);
    }

    //Mint with default expiration time
    function mint(string calldata _metadataURI) external returns (uint256) {
        require(
            soulBoundToken.getRole(msg.sender) == SoulBoundRole.Role.Supplier,
            "Only suppliers can mint"
        );
        require(
            certificateNFT.isCertificateValid(msg.sender),
            "Invalid or missing certificate"
        );
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        _safeMint(msg.sender, newTokenId);
        materials[newTokenId] = Material({
            id:                  newTokenId.toString(),
            status:              Status.Available,
            expirationTimestamp: block.timestamp + DEFAULT_EXPIRATION_TIMESTAMP,
            metadataURI:         _metadataURI
        });
        return newTokenId;
    }

    //Mint with custom timestamp
    function mint(string calldata _metadataURI, uint256 expirationTimestamp) external returns (uint256) {
        require(
            soulBoundToken.getRole(msg.sender) == SoulBoundRole.Role.Supplier,
            "Only suppliers can mint"
        );
        require(
            certificateNFT.isCertificateValid(msg.sender),
            "Invalid or missing certificate"
        );
        require(
            expirationTimestamp > block.timestamp,
            "Expiration can not be in the past"
        );
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;
        _safeMint(msg.sender, newTokenId);

        materials[newTokenId] = Material({
            id:                  newTokenId.toString(),
            status:              Status.Available,
            expirationTimestamp: expirationTimestamp,
            metadataURI:         _metadataURI
        });
        return newTokenId;
    }

    function getExpiration(uint256 tokenId) public view returns (uint256) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        return materials[tokenId].expirationTimestamp;
    }

    function updateStatus(uint256 tokenId, Status _newStatus) external {
        require(ownerOf(tokenId) == msg.sender, "Only owner can update status");
        materials[tokenId].status = _newStatus;
    }

    function tokenURI(uint256 tokenId)
    public
    view
    virtual
    override
    returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "URI query for nonexistent token");
        return materials[tokenId].metadataURI;
    }
}