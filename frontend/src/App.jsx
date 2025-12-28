import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { formatEther, parseEther } from 'ethers'
import QRCode from "qrcode"
import { BrowserRouter as Router, Route, Routes, Link, useParams, useNavigate } from 'react-router-dom'

import contractAddresses from "./contractAddresses.json";

const SOULBOUND_ADDR = contractAddresses.SoulBoundRole;
const CERTIFICATE_ADDR = contractAddresses.CertificateNFT;
const MATERIAL_ADDR = contractAddresses.MaterialNFT;
const MARKETPLACE_ADDR = contractAddresses.Marketplace;

const PINATA_GATEWAY = "https://blue-tricky-stingray-954.mypinata.cloud/ipfs";

import SoulBoundABI from './abi/SoulBoundRole.json'
import CertificateABI from './abi/CertificateNFT.json'
import MaterialABI from './abi/MaterialNFT.json'
import MarketplaceABI from './abi/Marketplace.json'

function App() {
    const [provider, setProvider] = useState(null)
    const [signer, setSigner] = useState(null)
    const [address, setAddress] = useState('')
    const [role, setRole] = useState('')
    const [isOwner, setIsOwner] = useState(false)
    const [certValid, setCertValid] = useState(false)
    const [ownedTokens, setOwnedTokens] = useState([])
    const [marketListings, setMarketListings] = useState([])
    const [loading, setLoading] = useState(false)
    const [allTokens, setAllTokens] = useState([])

    const soulboundContract = signer ? new ethers.Contract(SOULBOUND_ADDR, SoulBoundABI.abi, signer) : null
    const certificateContract = signer ? new ethers.Contract(CERTIFICATE_ADDR, CertificateABI.abi, signer) : null
    const materialContract = signer ? new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, signer) : null
    const marketContract = signer ? new ethers.Contract(MARKETPLACE_ADDR, MarketplaceABI.abi, signer) : null

    const connectWallet = async () => {
        if (!window.ethereum) return alert('Please install MetaMask')
        const prov = new ethers.BrowserProvider(window.ethereum)
        await prov.send("eth_requestAccounts", [])
        const sig = await prov.getSigner()
        const addr = await sig.getAddress()
        setProvider(prov)
        setSigner(sig)
        setAddress(addr)
        loadUserData(addr, sig)
    }

    const loadUserData = async (addr, sig) => {
        setLoading(true)
        try {
            const r = await new ethers.Contract(SOULBOUND_ADDR, SoulBoundABI.abi, sig).getRole(addr)
            setRole(r === 0n ? 'Buyer' : 'Supplier')
        } catch {
            setRole('Not registered')
        }

        try {
            const owner = await new ethers.Contract(CERTIFICATE_ADDR, CertificateABI.abi, sig.provider).owner()
            setIsOwner(owner.toLowerCase() === addr.toLowerCase())
        } catch {}

        try {
            const currentRole = await new ethers.Contract(SOULBOUND_ADDR, SoulBoundABI.abi, sig).getRole(addr)
            if (currentRole === 1n) {
                const valid = await certificateContract.isCertificateValid(addr)
                setCertValid(valid)
            }
        } catch { setCertValid(false) }

        await loadOwnedMaterials()
        await loadMarketplace()
        setLoading(false)
    }

    useEffect(() => {
        if (address && signer) {
            loadUserData(address, signer)
        }
    }, [address, signer])

    const loadOwnedMaterials = async () => {
        if (!provider || !address) return
        const contract = new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, provider)
        const transferFilter = contract.filters.Transfer()
        const events = await contract.queryFilter(transferFilter, 0)

        const owned = new Set()
        const all = new Set()
        for (const e of events) {
            const { from, to, tokenId } = e.args
            all.add(tokenId.toString())
            if (to.toLowerCase() === address.toLowerCase()) owned.add(tokenId.toString())
            if (from.toLowerCase() === address.toLowerCase()) owned.delete(tokenId.toString())
        }
        setOwnedTokens(Array.from(owned))
        setAllTokens(Array.from(all))
    }

    const loadMarketplace = async () => {
        if (!provider) return
        const market = new ethers.Contract(MARKETPLACE_ADDR, MarketplaceABI.abi, provider)
        const listedEvents = await market.queryFilter(market.filters.Listed())

        const listings = []
        const material = new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, provider)

        for (const ev of listedEvents) {
            const { nftContract, tokenId, price, seller } = ev.args
            if (nftContract.toLowerCase() !== MATERIAL_ADDR.toLowerCase()) continue

            const listing = await market.getListing(nftContract, tokenId)
            if (!listing.active) continue

            const mat = await material.materials(tokenId)
            listings.push({
                tokenId: tokenId.toString(),
                price: formatEther(price),
                seller,
                metadataURI: mat.metadataURI,
                status: ['Available', 'InTransit', 'Delivered', 'Assembled'][mat.status],
            })
        }
        setMarketListings(listings)
    }

    const registerRole = async (isSupplier) => {
        const tx = await soulboundContract.registerUser(isSupplier ? 1 : 0)
        await tx.wait(1)
        setRole(isSupplier ? 'Supplier' : 'Buyer')
        loadUserData(address, signer)
    }

    const buyMaterial = async (tokenId, priceEth) => {
        const tx = await marketContract.buyNFT(MATERIAL_ADDR, tokenId, { value: parseEther(priceEth) })
        await tx.wait()
        await loadMarketplace()
        await loadOwnedMaterials()
    }

    const issueCertificate = async (e) => {
        e.preventDefault()
        const form = e.target
        const recipient = address
        const expiration_m = form.expiration.value
        const metadataURI = form.metadataURI.value || ""

        const seconds = expiration_m * 30 * 24 * 60 * 60
        const expiration_unix = BigInt(Math.floor(Date.now() / 1000) + seconds)

        const tx = await certificateContract.issueCertificate(recipient, expiration_unix, metadataURI)
        await tx.wait()

        const valid = await certificateContract.isCertificateValid(address)
        setCertValid(valid)

        alert("Certificate issued")
        form.reset()
    }

    const revokeCertificate = async () => {
        const addr = address
        const tx = await certificateContract.revokeCertificate(addr)
        await tx.wait()
        alert("Certificate revoked")
        setCertValid(false)
    }

    const MintForm = () => {
        const navigate = useNavigate()
        const [assembleTokens, setAssembleTokens] = useState([])
        const [selectedTokens, setSelectedTokens] = useState([])
        const [certificationId, setCertificationId] = useState('')

        useEffect(() => {
            const loadAssembleTokens = async () => {
                if (!provider || !address || !materialContract) return
                const contract = new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, provider)
                const transferFilter = contract.filters.Transfer()
                const events = await contract.queryFilter(transferFilter, 0)

                const owned = new Set()
                for (const e of events) {
                    const { from, to, tokenId } = e.args
                    if (to.toLowerCase() === address.toLowerCase()) owned.add(tokenId.toString())
                    if (from.toLowerCase() === address.toLowerCase()) owned.delete(tokenId.toString())
                }
                const tokens = Array.from(owned)
                const available = []
                for (let id of tokens) {
                    const mat = await materialContract.materials(id)
                    if (Number(mat.status) !== 3) available.push(id)
                }
                setAssembleTokens(available)
            }
            if (signer) loadAssembleTokens()
        }, [signer, materialContract])

        useEffect(() => {
            const fetchCertId = async () => {
                if (!provider || !address) return
                try {
                    const contract = new ethers.Contract(CERTIFICATE_ADDR, CertificateABI.abi, provider)
                    const filter = contract.filters.Transfer(null, address)
                    const events = await contract.queryFilter(filter, 0)
                    if (events.length > 0) {
                        const tokenId = events[events.length - 1].args.tokenId.toString()
                        setCertificationId(tokenId)
                    }
                } catch (err) {
                    console.error(err)
                }
            }
            fetchCertId()
        }, [provider, address])

        const toggleSelect = (id) => {
            setSelectedTokens(prev =>
                prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
            )
        }

        const handleMintSubmit = async (e) => {
            e.preventDefault()
            if (!signer) return alert("Connect wallet")

            const form = e.target

            let metadata = {
                name: form.name.value,
                description: form.description.value,
                supplierName: form.supplierName.value,
                certificationId: form.certificationId.value,
                manufactureDate: form.manufactureDate.value,
                batchNumber: form.batchNumber.value,
                count: Number(form.count.value),
                weight: Number(form.weight.value),
                measureUnit: form.measureUnit.value,
                dimensions: {
                    length: Number(form.length.value) || null,
                    width: Number(form.width.value) || null,
                    height: Number(form.height.value) || null,
                },
            }

            try {
                if (selectedTokens.length > 0) {
                    const nfts_consumed = []
                    for (const id of selectedTokens) {
                        const mat = await materialContract.materials(id)
                        const cid = mat.metadataURI.replace(PINATA_GATEWAY + '/', '')
                        nfts_consumed.push(cid)
                    }
                    metadata.nfts_consumed = nfts_consumed
                }

                const uploadResult = await fetch(
                    "https://api.pinata.cloud/pinning/pinJSONToIPFS",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${import.meta.env.VITE_PINATA_JWT}`,
                        },
                        body: JSON.stringify(metadata),
                    }
                ).then(res => res.json());

                if (!uploadResult.IpfsHash) throw new Error("Pinata upload failed")

                const cid = uploadResult.IpfsHash
                const tokenURI = `${PINATA_GATEWAY}/${cid}`

                const exp = form.customExpiration.value
                    ? Number(form.customExpiration.value)
                    : 0

                const tx = exp ? await materialContract.mint(tokenURI, exp) : await materialContract.mint(tokenURI)

                await tx.wait()

                if (selectedTokens.length > 0) {
                    for (const id of selectedTokens) {
                        const txStatus = await materialContract.updateStatus(id, 3)
                        await txStatus.wait()
                    }
                }

                await loadOwnedMaterials()
                form.reset()
                setSelectedTokens([])
                alert("Minted!")
                navigate('/')
            } catch (err) {
                console.error(err)
                alert("Error: " + err.message)
            }
        }

        return (
            <div>
                <Link to="/">Back</Link>
                <h1>Mint New Material NFT</h1>

                <form onSubmit={handleMintSubmit}>
                    <input name="name" placeholder="Product Name" required/>
                    <input name="supplierName" placeholder="Supplier Name" required/>
                    <input name="certificationId" value={certificationId} readOnly required/>
                    <input type="date" name="manufactureDate" required/>
                    <input name="batchNumber" placeholder="Batch Number" required/>
                    <input type="number" name="count" placeholder="Quantity" required/>
                    <input type="number" name="weight" placeholder="Weight" required/>
                    <input name="measureUnit" placeholder="Unit"/>

                    <input type="number" name="length" placeholder="Length"/>
                    <input type="number" name="width" placeholder="Width"/>
                    <input type="number" name="height" placeholder="Height"/>
                    <input type="number" name="customExpiration"
                           placeholder="Expiration Unix timestamp (optional)"
                           className="input input-bordered"/>
                    <textarea name="description" placeholder="Description" required/>

                    <input type="text" value="Available" readOnly />

                    <h3>Select materials to assemble (optional)</h3>
                    <div className="assemble-list">
                        {assembleTokens.length === 0 ? (
                            <p>No materials available for assembly</p>
                        ) : (
                            assembleTokens.map(id => (
                                <div key={id}>
                                    <input
                                        type="checkbox"
                                        checked={selectedTokens.includes(id)}
                                        onChange={() => toggleSelect(id)}
                                    />
                                    Material #{id}
                                </div>
                            ))
                        )}
                    </div>

                    <button type="submit">{selectedTokens.length > 0 ? 'Assemble and Mint' : 'Mint'}</button>
                </form>
            </div>
        )
    }

    const SupplierNFTCard = ({ tokenId }) => {
        const [metadata, setMetadata] = useState(null)
        const [status, setStatus] = useState('Loading...')

        useEffect(() => {
            if (!materialContract) return
            const fetchData = async () => {
                try {
                    const mat = await materialContract.materials(tokenId)
                    setStatus(['Available', 'InTransit', 'Delivered', 'Assembled'][Number(mat.status)])

                    if (mat.metadataURI.startsWith(PINATA_GATEWAY)) {
                        const cid = mat.metadataURI.replace(PINATA_GATEWAY + '/', '')
                        const res = await fetch(`${PINATA_GATEWAY}/${cid}`)
                        if (res.ok) setMetadata(await res.json())
                    }
                } catch (err) {}
            }
            fetchData()
        }, [tokenId, materialContract])

        return (
            <div className="nft-card">
                <h3>{metadata?.name || `Material #${tokenId}`}</h3>
                <p>Token ID: {tokenId}</p>
                <p>Status: {status}</p>
                <Link to={`/nft/${tokenId}`}>View Details</Link>
            </div>
        )
    }

    const NFTCard = ({ tokenId }) => {
        const [metadata, setMetadata] = useState(null)

        useEffect(() => {
            if (!materialContract) return
            const fetchMetadata = async () => {
                try {
                    const uri = await materialContract.tokenURI(tokenId)
                    if (uri.startsWith(PINATA_GATEWAY)) {
                        const cid = uri.replace(PINATA_GATEWAY + '/', '')
                        const res = await fetch(`${PINATA_GATEWAY}/${cid}`)
                        if (res.ok) setMetadata(await res.json())
                    }
                } catch (err) {}
            }
            fetchMetadata()
        }, [tokenId, materialContract])

        if (!metadata) return <div>Loading...</div>

        return (
            <div className="nft-card">
                <h3>{metadata.name || `Material #${tokenId}`}</h3>
                <p>{metadata.supplierName}</p>
                <p>{metadata.batchNumber}</p>
                <p>{metadata.weight} {metadata.measureUnit}</p>
                <Link to={`/nft/${tokenId}`}>View Details</Link>
            </div>
        )
    }

    const NFTDetail = () => {
        const { tokenId } = useParams()
        const [metadata, setMetadata] = useState(null)
        const [material, setMaterial] = useState(null)
        const [owner, setOwner] = useState('')
        const [newStatus, setNewStatus] = useState(0)
        const [listing, setListing] = useState(null)
        const [price, setPrice] = useState('')
        const [consumedTokenIds, setConsumedTokenIds] = useState([])

        useEffect(() => {
            if (!provider) return
            const fetchData = async () => {
                const contract = new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, provider)
                try {
                    const mat = await contract.materials(tokenId)
                    setMaterial(mat)
                    setNewStatus(Number(mat.status))

                    const own = await contract.ownerOf(tokenId)
                    setOwner(own.toLowerCase())

                    const uri = await contract.tokenURI(tokenId)
                    if (uri.startsWith(PINATA_GATEWAY)) {
                        const cid = uri.replace(PINATA_GATEWAY + '/', '')
                        const res = await fetch(`${PINATA_GATEWAY}/${cid}`)
                        if (res.ok) setMetadata(await res.json())
                    }

                    if (marketContract) {
                        const list = await marketContract.getListing(MATERIAL_ADDR, tokenId)
                        setListing(list)
                    }

                    const qrUrl = `${window.location.origin}/nft/${tokenId}`
                    const canvas = document.getElementById('qrCanvas')
                    if (canvas) {
                        QRCode.toCanvas(canvas, qrUrl, { width: 256 })
                    }
                } catch (err) {
                    console.error(err)
                }
            }
            fetchData()
        }, [tokenId, provider, marketContract])

        useEffect(() => {
            const findConsumedIds = async () => {
                if (!metadata?.nfts_consumed || !allTokens.length || !materialContract) return
                const ids = []
                for (let cid of metadata.nfts_consumed) {
                    for (let id of allTokens) {
                        try {
                            const mat = await materialContract.materials(id)
                            if (mat.metadataURI === `${PINATA_GATEWAY}/${cid}`) {
                                ids.push(id)
                                break
                            }
                        } catch {}
                    }
                }
                setConsumedTokenIds(ids)
            }
            findConsumedIds()
        }, [metadata, allTokens, materialContract])

        const handleUpdateStatus = async () => {
            if (!signer || owner !== address.toLowerCase()) return alert('Not owner or not connected')
            if (Number(material.status) === 3) return alert('Assembled NFT status cannot be updated')
            try {
                const tx = await materialContract.updateStatus(tokenId, newStatus)
                await tx.wait()
                // Refresh data
                const mat = await materialContract.materials(tokenId)
                setMaterial(mat)
                alert('Status updated')
            } catch (err) {
                alert('Error: ' + err.message)
            }
        }

        const handleList = async () => {
            if (!signer || owner !== address.toLowerCase()) return alert('Not owner or not connected')
            if (Number(material.status) === 3) return alert('Assembled NFT cannot be listed')
            if (!price || parseFloat(price) <= 0) return alert('Enter valid price')
            try {
                const approved = await materialContract.getApproved(tokenId)
                const isApprovedAll = await materialContract.isApprovedForAll(address, MARKETPLACE_ADDR)
                if (approved.toLowerCase() !== MARKETPLACE_ADDR.toLowerCase() && !isApprovedAll) {
                    const txApprove = await materialContract.approve(MARKETPLACE_ADDR, tokenId)
                    await txApprove.wait()
                }
                const tx = await marketContract.listNFT(MATERIAL_ADDR, tokenId, parseEther(price))
                await tx.wait()
                const newList = await marketContract.getListing(MATERIAL_ADDR, tokenId)
                setListing(newList)
                setPrice('')
                alert('Listed')
            } catch (err) {
                alert('Error: ' + err.message)
            }
        }

        const handleCancel = async () => {
            if (!signer || owner !== address.toLowerCase()) return alert('Not owner or not connected')
            try {
                const tx = await marketContract.cancelListing(MATERIAL_ADDR, tokenId)
                await tx.wait()
                setListing({ ...listing, active: false })
                alert('Cancelled')
            } catch (err) {
                alert('Error: ' + err.message)
            }
        }

        if (!material || !metadata) return <div>Loading...</div>

        return (
            <div>
                <Link to="/">Back to Dashboard</Link>
                <h1>Material NFT #{tokenId}</h1>
                <h2>Static Metadata (from IPFS)</h2>
                <p>Name: {metadata.name}</p>
                <p>Description: {metadata.description}</p>
                <p>Supplier Name: {metadata.supplierName}</p>
                <p>Certification ID: {metadata.certificationId}</p>
                <p>Manufacture Date: {metadata.manufactureDate}</p>
                <p>Batch Number: {metadata.batchNumber}</p>
                <p>Count: {metadata.count}</p>
                <p>Weight: {metadata.weight} {metadata.measureUnit}</p>
                <p>Dimensions: {metadata.dimensions.length} x {metadata.dimensions.width} x {metadata.dimensions.height}</p>

                {metadata.nfts_consumed && consumedTokenIds.length > 0 && (
                    <div>
                        <h2>Assembled from:</h2>
                        <ul>
                            {consumedTokenIds.map(id => (
                                <li key={id}><Link to={`/nft/${id}`}>Material #{id}</Link></li>
                            ))}
                        </ul>
                    </div>
                )}

                <h2>Dynamic Metadata (On-Chain)</h2>
                <p>Current Status: {['Available', 'InTransit', 'Delivered', 'Assembled'][Number(material.status)]}</p>
                <p>Expiration: {new Date(Number(material.expirationTimestamp) * 1000).toLocaleString()}</p>
                <p>Owner: {owner}</p>

                {owner === address.toLowerCase() && Number(material.status) !== 3 && (
                    <div>
                        <h3>Update Status</h3>
                        <select value={newStatus} onChange={(e) => setNewStatus(Number(e.target.value))}>
                            <option value={0}>Available</option>
                            <option value={1}>In Transit</option>
                            <option value={2}>Delivered</option>
                            <option value={3}>Assembled</option>
                        </select>
                        <button onClick={handleUpdateStatus}>Update</button>
                    </div>
                )}

                <h2>Marketplace Listing</h2>
                {listing && listing.active ? (
                    <p>Listed for: {formatEther(listing.price)} ETH</p>
                ) : (
                    <p>Not listed</p>
                )}

                {owner === address.toLowerCase() && Number(material.status) !== 3 && (!listing || !listing.active) && (
                    <div>
                        <h3>List for Sale</h3>
                        <input
                            type="number"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            placeholder="Price in ETH"
                        />
                        <button onClick={handleList}>List</button>
                    </div>
                )}

                {listing && listing.active && listing.seller.toLowerCase() === address.toLowerCase() && (
                    <button onClick={handleCancel}>Cancel Listing</button>
                )}

                {listing && listing.active && listing.seller.toLowerCase() !== address.toLowerCase() && (
                    <button onClick={() => buyMaterial(tokenId, formatEther(listing.price))}>
                        Buy for {formatEther(listing.price)} ETH
                    </button>
                )}

                <h2>QR Code for this NFT Page</h2>
                <canvas id="qrCanvas"></canvas>
            </div>
        )
    }

    const Dashboard = () => {
        const [view, setView] = useState('myMaterials');

        return (
            <div className="dashboard">
                <div className="header">
                    <div className="menu">
                        <button onClick={() => setView('myMaterials')}>My Materials</button>
                        <button onClick={() => setView('marketplace')}>Marketplace</button>
                    </div>
                    <div className="user-info">
                        <p>Registered as: {role}</p>
                        {role === 'Supplier' && <p>Certificate: {certValid ? "Valid" : "Not valid"}</p>}
                        <p>Address: {address}</p>
                    </div>
                </div>
                <div className="main-content">
                    <div className="large-container">
                        {view === 'myMaterials' ? (
                            <>
                                <h2>My Materials</h2>
                                {ownedTokens.length === 0 ? (
                                    <p>No materials owned</p>
                                ) : (
                                    <div className="card-grid">
                                        {ownedTokens.map(id => (
                                            <SupplierNFTCard key={id} tokenId={id} />
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <>
                                <h2>Marketplace</h2>
                                {marketListings.length === 0 ? (
                                    <p>No listings</p>
                                ) : (
                                    <div className="card-grid">
                                        {marketListings.map(l => (
                                            <div key={l.tokenId} className="nft-card">
                                                <NFTCard tokenId={l.tokenId} />
                                                <p>{l.price} ETH</p>
                                                <button
                                                    onClick={() => buyMaterial(l.tokenId, l.price)}
                                                    disabled={l.seller.toLowerCase() === address.toLowerCase()}
                                                >
                                                    Buy
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="side-panel">
                        {role === 'Supplier' && certValid && (
                            <Link to="/mint">Create Material NFT</Link>
                        )}
                        {isOwner && (
                            <div>
                                <h2>Certificate Panel</h2>
                                <form onSubmit={issueCertificate}>
                                    <select name="expiration" defaultValue="6">
                                        <option value="6">6 months</option>
                                        <option value="12">12 months</option>
                                        <option value="18">18 months</option>
                                        <option value="24">24 months</option>
                                    </select>
                                    <input name="metadataURI" placeholder="metadata URI" />
                                    <button type="submit">Issue Certificate</button>
                                </form>
                                <button onClick={revokeCertificate}>Revoke Certificate</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <Router>
            <div>
                {loading && <div>Loading...</div>}

                {!address ? (
                    <div>
                        <h1>Construction Material Provenance</h1>
                        <button onClick={connectWallet}>Connect Wallet</button>
                    </div>
                ) : role === 'Not registered' ? (
                    <div>
                        <div>
                            <h2>Register as Buyer</h2>
                            <p>You will be able to browse and buy materials</p>
                            <button onClick={() => registerRole(false)}>Register as Buyer</button>
                        </div>

                        <div>
                            <h2>Register as Supplier</h2>
                            <p>You will be able to mint and sell materials</p>
                            <button onClick={() => registerRole(true)}>Register as Supplier</button>
                        </div>
                    </div>
                ) : (
                    <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/mint" element={<MintForm />} />
                        <Route path="/nft/:tokenId" element={<NFTDetail />} />
                    </Routes>
                )}
            </div>
        </Router>
    )
}

export default App