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
        
        Status currentStatus = materials[tokenId].status;
        
        // Validate state transitions based on lifecycle diagram
        require(isValidTransition(currentStatus, _newStatus), "Invalid status transition");
        
        materials[tokenId].status = _newStatus;
    }

    /**
     * @dev Validates if a status transition is allowed 
     * Valid transitions:
     * - Available -> InTransit
     * - Available -> Assembled
     * - InTransit -> Delivered
     * - Delivered -> Assembled
     * - Delivered -> Available
     */
    function isValidTransition(Status _currentStatus, Status _newStatus) internal pure returns (bool) {
        // Cannot transition to the same status
        if (_currentStatus == _newStatus) {
            return false;
        }

        // Available (0) can transition to InTransit (1) or Assembled (3)
        if (_currentStatus == Status.Available) {
            return _newStatus == Status.InTransit || _newStatus == Status.Assembled;
        }

        // InTransit (1) can transition to Delivered (2) or back to Available (0)
        if (_currentStatus == Status.InTransit) {
            return _newStatus == Status.Delivered;
        }

        // Delivered (2) can transition to Assembled (3) or back to Available (0)
        if (_currentStatus == Status.Delivered) {
            return _newStatus == Status.Assembled || _newStatus == Status.Available;
        }

        // Assembled (3) is a terminal state - no transitions allowed
        if (_currentStatus == Status.Assembled) {
            return false;
        }

        return false;
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