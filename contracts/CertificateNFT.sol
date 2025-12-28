// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract CertificateNFT is ERC721, Ownable {
    struct Certificate {
        uint256 expirationTimestamp;
        bool    revoked;
        string  metadataURI;
    }

    mapping(uint256 => Certificate) public certificates;
    mapping(address => uint256)    public userToCertId;

    uint256 private _tokenIdCounter;

    constructor() ERC721("SupplierCertificate", "SCERT") Ownable(msg.sender) {}

    function issueCertificate(
        address recipient,
        uint256 expirationTimestamp,
        string calldata metadataURI
    ) external onlyOwner {
        require(userToCertId[recipient] == 0, "User already has a certificate");

        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        _safeMint(recipient, newTokenId);

        certificates[newTokenId] = Certificate({
            expirationTimestamp: expirationTimestamp,
            revoked:             false,
            metadataURI:         metadataURI
        });

        userToCertId[recipient] = newTokenId;
    }

    function revokeCertificate(address user) external onlyOwner {
        uint256 tokenId = userToCertId[user];
        require(tokenId != 0, "No certificate found");
        certificates[tokenId].revoked = true;
    }

    function isCertificateValid(address user) public view returns (bool) {
        uint256 tokenId = userToCertId[user];
        if (tokenId == 0) return false;

        Certificate memory cert = certificates[tokenId];

        if (cert.revoked) return false;
        if (cert.expirationTimestamp > 0 && block.timestamp > cert.expirationTimestamp) return false;

        return true;
    }

    function _update(address to, uint256 tokenId, address auth)
    internal
    override
    returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "Certificate: soulbound, cannot transfer");
        return super._update(to, tokenId, auth);
    }

    function tokenURI(uint256 tokenId)
    public
    view
    virtual
    override
    returns (string memory)
    {
        require(_ownerOf(tokenId) != address(0), "URI query for nonexistent token");
        return certificates[tokenId].metadataURI;
    }
}