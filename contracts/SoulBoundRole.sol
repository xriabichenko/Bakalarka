// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";


contract SoulBoundRole is ERC721, Ownable {
    enum Role { Buyer, Supplier }

    mapping(address => Role) public userRoles;
    mapping(address => bool) public hasToken;

    uint256 public nextTokenId = 1;
    constructor() ERC721("ConstructionIdentity", "CIDENT") Ownable(msg.sender) {}
    function registerUser(Role role) external {
        require(!hasToken[msg.sender], "Already registered");

        uint256 tokenId = nextTokenId++;
        _safeMint(msg.sender, tokenId);
        hasToken[msg.sender] = true;
        userRoles[msg.sender] = role;
    }
    // Make tokens non-transferable
    function _update(address to, uint256 tokenId, address auth)
    internal
    override
    returns (address)
    {
        address from = _ownerOf(tokenId);
        require(from == address(0) || to == address(0), "Soulbound: cannot transfer");
        return super._update(to, tokenId, auth);
    }

    function getRole(address user) public view returns (Role) {
        require(hasToken[user], "User not registered");
        return userRoles[user];
    }
}
