const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Tests", function () {
    let soulBoundRole, certificateNFT, materialNFT, marketplace;
    let owner, supplier, buyer, randomUser;

    beforeEach(async function () {
        [owner, supplier, buyer, randomUser] = await ethers.getSigners();
        const deployedAddresses = {};

        const contractsToDeploy = [
            { name: "SoulBoundRole", dependencies: [] },
            { name: "CertificateNFT", dependencies: [] },
            { name: "MaterialNFT", dependencies: ["SoulBoundRole", "CertificateNFT"] },
            { name: "Marketplace", dependencies: [] }
        ];

        for (const c of contractsToDeploy) {
            const Factory = await ethers.getContractFactory(c.name);
            const args = c.dependencies.map(dep => deployedAddresses[dep]);
            const instance = await Factory.deploy(...args);
            await instance.waitForDeployment();
            deployedAddresses[c.name] = await instance.getAddress();

            if (c.name === "SoulBoundRole") soulBoundRole = instance;
            if (c.name === "CertificateNFT") certificateNFT = instance;
            if (c.name === "MaterialNFT") materialNFT = instance;
            if (c.name === "Marketplace") marketplace = instance;
        }
    });

    // ------------------------------------------------------------------------
    // SoulBoundRole
    // ------------------------------------------------------------------------
    describe("SoulBoundRole smart contract", function () {
        it("Should deploy SoulBoundRole correctly", async function () {
            expect(await soulBoundRole.name()).to.equal("ConstructionIdentity");
            expect(await soulBoundRole.symbol()).to.equal("CIDENT");
        });

        it("Should register users as Buyer and Supplier correctly", async function () {
            await soulBoundRole.connect(buyer).registerUser(0);
            await soulBoundRole.connect(supplier).registerUser(1);

            expect(await soulBoundRole.hasToken(buyer.address)).to.be.true;
            expect(await soulBoundRole.hasToken(supplier.address)).to.be.true;
            expect(await soulBoundRole.userRoles(buyer.address)).to.equal(0);
            expect(await soulBoundRole.userRoles(supplier.address)).to.equal(1);
        });

        it("Should prevent re-registration", async function () {
            await soulBoundRole.connect(buyer).registerUser(0);
            await expect(soulBoundRole.connect(buyer).registerUser(0))
                .to.be.revertedWith("Already registered");
        });

        it("Should prevent token transfers (soulbound enforcement)", async function () {
            await soulBoundRole.connect(buyer).registerUser(0);
            await expect(
                soulBoundRole.connect(buyer).transferFrom(buyer.address, supplier.address, 1)
            ).to.be.revertedWith("Soulbound: cannot transfer");
        });
    });
    // ------------------------------------------------------------------------
    // CertificateNFT
    // ------------------------------------------------------------------------
    describe("CertificateNFT", function () {
        it("Should deploy CertificateNFT correctly", async function () {
            expect(await certificateNFT.name()).to.equal("SupplierCertificate");
            expect(await certificateNFT.symbol()).to.equal("SCERT");
        });

        it("Should allow owner to issue a certificate to supplier", async function () {
            const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
            await certificateNFT.connect(owner).issueCertificate(supplier.address, exp, "ipfs://cert1");
            expect(await certificateNFT.ownerOf(1)).to.equal(supplier.address);
        });

        it("Should prevent non-owner from issuing certificate", async function () {
            await expect(
                certificateNFT.connect(supplier).issueCertificate(supplier.address, 0, "ipfs://x")
            ).to.be.revertedWithCustomError(certificateNFT, "OwnableUnauthorizedAccount");
        });

        it("Should prevent issuing multiple certificates to same user", async function () {
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://a");
            await expect(
                certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://b")
            ).to.be.revertedWith("User already has a certificate");
        });

        it("Should allow owner to revoke a certificate", async function () {
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://a");
            await certificateNFT.connect(owner).revokeCertificate(supplier.address);
            expect(await certificateNFT.isCertificateValid(supplier.address)).to.be.false;
        });

        it("Should make certificate invalid after expiration", async function () {
            const past = Math.floor(Date.now() / 1000) - 100;
            await certificateNFT.connect(owner).issueCertificate(supplier.address, past, "ipfs://a");
            expect(await certificateNFT.isCertificateValid(supplier.address)).to.be.false;
        });

        it("Should return false for isCertificateValid() if user has no cert", async function () {
            expect(await certificateNFT.isCertificateValid(randomUser.address)).to.be.false;
        });

        it("Should prevent transfer of certificate (soulbound)", async function () {
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://a");
            await expect(
                certificateNFT.connect(supplier).transferFrom(supplier.address, buyer.address, 1)
            ).to.be.revertedWith("Certificate: soulbound, cannot transfer");
        });

        it("Should return correct metadata URI", async function () {
            const uri = "ipfs://QmCert123";
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, uri);
            expect(await certificateNFT.tokenURI(1)).to.equal(uri);
        });
    });

    // ------------------------------------------------------------------------
    // MaterialNFT + Certificate
    // ------------------------------------------------------------------------
    describe("MaterialNFT + CertificateNFT", function () {
        it("Should deploy MaterialNFT correctly", async function () {
            expect(await materialNFT.name()).to.equal("MaterialNFT");
            expect(await materialNFT.symbol()).to.equal("MNFT");
        });

        it("Should restrict minting to suppliers only", async function () {
            await soulBoundRole.connect(buyer).registerUser(0);
            await expect(
                materialNFT.connect(buyer).mint("ipfs://x")
            ).to.be.revertedWith("Only suppliers can mint");
        });

        it("Should allow supplier to mint a MaterialNFT", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            // Provide a valid certificate
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");

            await materialNFT.connect(supplier).mint("ipfs://mat1");

            const mat = await materialNFT.materials(1);
            expect(mat.id).to.equal("1");
            expect(mat.status).to.equal(0);
            expect(mat.metadataURI).to.equal("ipfs://mat1");
        });

        it("Should return correct metadata URI", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
            await materialNFT.connect(supplier).mint("ipfs://bricks");

            expect(await materialNFT.tokenURI(1)).to.equal("ipfs://bricks");
        });

        it("Should revert tokenURI query for nonexistent token", async function () {
            await expect(materialNFT.tokenURI(999))
                .to.be.revertedWith  ("URI query for nonexistent token");
        });

        it("Should FAIL to mint if supplier has no valid certificate", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            await expect(
                materialNFT.connect(supplier).mint("ipfs://c")
            ).to.be.revertedWith("Invalid or missing certificate");
        });

        it("Should ALLOW minting after valid certificate is issued", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            const exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60;
            await certificateNFT.connect(owner).issueCertificate(supplier.address, exp, "ipfs://cert");

            await materialNFT.connect(supplier).mint("ipfs://mat2");
            expect(await materialNFT.ownerOf(1)).to.equal(supplier.address);
        });

        it("Should FAIL to mint after certificate is revoked", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
            await materialNFT.connect(supplier).mint("ipfs://s"); // works once

            await certificateNFT.connect(owner).revokeCertificate(supplier.address);

            await expect(
                materialNFT.connect(supplier).mint("ipfs://b")
            ).to.be.revertedWith("Invalid or missing certificate");
        });

        it("Should FAIL to mint after certificate expires", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            const past = Math.floor(Date.now() / 1000) - 100;
            await certificateNFT.connect(owner).issueCertificate(supplier.address, past, "ipfs://cert");

            await expect(
                materialNFT.connect(supplier).mint("ipfs://c")
            ).to.be.revertedWith("Invalid or missing certificate");
        });
        it("Should allow owner to update material status", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
            await materialNFT.connect(supplier).mint("ipfs://mat-status");

            // status enum: Available = 0, InTransit = 1, Delivered = 2, Assembled = 3

            //(tokenId, newStatus)
            await materialNFT.connect(supplier).updateStatus(1, 1); // set to InTransit

            const mat = await materialNFT.materials(1);
            expect(mat.status).to.equal(1);
        });

        it("Should prevent non-owner from updating status", async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
            await materialNFT.connect(supplier).mint("ipfs://mat-status2");

            await expect(
                materialNFT.connect(buyer).updateStatus(1, 1)
            ).to.be.revertedWith("Only owner can update status");
        });

        it("Should revert getExpiration for nonexistent token", async function () {
            await expect(materialNFT.getExpiration(999)).to.be.revertedWith("Token does not exist");
        });
        describe("Expiration", () => {
            const SIX_MONTHS = 180 * 24 * 60 * 60;

            it("Should set default 6-month expiration when not provided", async function () {
                await soulBoundRole.connect(supplier).registerUser(1);
                await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
                const tx = await materialNFT.connect(supplier).mint("ipfs://exp1");
                const receipt = await tx.wait();
                const block = await ethers.provider.getBlock(receipt.blockNumber);
                const expected = block.timestamp + SIX_MONTHS;

                const exp = await materialNFT.getExpiration(1);
                expect(exp).to.be.closeTo(expected, 10); // ±10s tolerance
            });

            it("Should allow custom expiration timestamp", async function () {
                await soulBoundRole.connect(supplier).registerUser(1);
                await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
                const custom = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60; // 1 year

                //specifying a 'mint' FC with 2 function parameters to avoid overload error in ethers.js
                await materialNFT.connect(supplier)["mint(string,uint256)"]("ipfs://exp2", custom);
                expect(await materialNFT.getExpiration(1)).to.equal(custom);
            });

            it("Should reject expiration in the past", async function () {
                await soulBoundRole.connect(supplier).registerUser(1);
                await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
                const past = Math.floor(Date.now() / 1000) - 100;
                await expect(
                    //specifying a 'mint' FC with 2 function parameters to avoid overload error in ethers.js
                    materialNFT.connect(supplier)["mint(string,uint256)"]("ipfs://bad", past)
                ).to.be.revertedWith("Expiration can not be in the past");
            });

            it("Should allow mint with 1 argument", async function () {
                await soulBoundRole.connect(supplier).registerUser(1);
                await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
                await materialNFT.connect(supplier).mint("ipfs://old");
                expect(await materialNFT.tokenURI(1)).to.equal("ipfs://old");
            });
        });
    });
    describe("Marketplace(buying and transferring)", function () {
        beforeEach(async function () {
            await soulBoundRole.connect(supplier).registerUser(1);
            await certificateNFT.connect(owner).issueCertificate(supplier.address, 0, "ipfs://cert");
            await materialNFT.connect(supplier).mint("ipfs://mat1");
            await materialNFT.connect(supplier).approve(marketplace.target, 1);
        });

        it("Should deploy Marketplace correctly", async function () {
            expect(await marketplace.owner()).to.equal(owner.address);
        });

        it("Should allow supplier to list NFT", async function () {
            const price = ethers.parseEther("1");
            await expect(
                marketplace.connect(supplier).listNFT(materialNFT.target, 1, price)
            )
                .to.emit(marketplace, "Listed")
                .withArgs(supplier.address, materialNFT.target, 1, price);

            const listing = await marketplace.getListing(materialNFT.target, 1);
            expect(listing.seller).to.equal(supplier.address);
            expect(listing.price).to.equal(price);
            expect(listing.active).to.be.true;
        });

        it("Should prevent listing by non-owner", async function () {
            const price = ethers.parseEther("1");
            await expect(
                marketplace.connect(buyer).listNFT(materialNFT.target, 1, price)
            ).to.be.revertedWith("Not the owner");
        });

        it("Should prevent listing without approval", async function () {
            // revoke approval
            await materialNFT.connect(supplier).approve(ethers.ZeroAddress, 1);
            const price = ethers.parseEther("1");
            await expect(
                marketplace.connect(supplier).listNFT(materialNFT.target, 1, price)
            ).to.be.revertedWith("Marketplace not approved");
        });

        it("Should allow buyer to buy listed NFT", async function () {
            const price = ethers.parseEther("1");
            await marketplace.connect(supplier).listNFT(materialNFT.target, 1, price);

            await expect(
                marketplace.connect(buyer).buyNFT(materialNFT.target, 1, { value: price })
            )
                .to.emit(marketplace, "Sold")
                .withArgs(buyer.address, materialNFT.target, 1, price);

            expect(await materialNFT.ownerOf(1)).to.equal(buyer.address);

            const listing = await marketplace.getListing(materialNFT.target, 1);
            expect(listing.active).to.be.false;
        });

        it("Should fail to buy unlisted NFT", async function () {
            await expect(
                marketplace.connect(buyer).buyNFT(materialNFT.target, 99, { value: ethers.parseEther("1") })
            ).to.be.revertedWith("Not listed");
        });

        it("Should fail to buy with insufficient funds", async function () {
            const price = ethers.parseEther("1");
            await marketplace.connect(supplier).listNFT(materialNFT.target, 1, price);

            await expect(
                marketplace.connect(buyer).buyNFT(materialNFT.target, 1, { value: ethers.parseEther("0.5") })
            ).to.be.revertedWith("Insufficient funds");
        });

        it("Should allow seller to cancel listing", async function () {
            const price = ethers.parseEther("1");
            await marketplace.connect(supplier).listNFT(materialNFT.target, 1, price);

            await expect(
                marketplace.connect(supplier).cancelListing(materialNFT.target, 1)
            )
                .to.emit(marketplace, "Cancelled")
                .withArgs(supplier.address, materialNFT.target, 1);

            const listing = await marketplace.getListing(materialNFT.target, 1);
            expect(listing.active).to.be.false;
        });

        it("Should prevent non-seller from cancelling listing", async function () {
            const price = ethers.parseEther("1");
            await marketplace.connect(supplier).listNFT(materialNFT.target, 1, price);

            await expect(
                marketplace.connect(buyer).cancelListing(materialNFT.target, 1)
            ).to.be.revertedWith("Not your listing");
        });

        it("Should prevent cancelling already inactive listing", async function () {
            const price = ethers.parseEther("1");
            await marketplace.connect(supplier).listNFT(materialNFT.target, 1, price);
            await marketplace.connect(supplier).cancelListing(materialNFT.target, 1);

            await expect(
                marketplace.connect(supplier).cancelListing(materialNFT.target, 1)
            ).to.be.revertedWith("Already inactive");
        });
    });


});
