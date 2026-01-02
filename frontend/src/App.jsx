import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { formatEther, parseEther } from 'ethers'
import QRCode from "qrcode"
import { BrowserRouter as Router, Route, Routes, Link, useParams, useNavigate } from 'react-router-dom'
import { ConnectButton } from '@rainbow-me/rainbowkit'
import { useAccount, useWalletClient } from 'wagmi'

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
    const { address: wagmiAddress, isConnected } = useAccount()
    const { data: walletClient } = useWalletClient()
    
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

    // Convert wagmi walletClient to ethers signer/provider
    useEffect(() => {
        if (isConnected && wagmiAddress && window.ethereum) {
            const provider = new ethers.BrowserProvider(window.ethereum)
            provider.getSigner().then(sig => {
                setProvider(provider)
                setSigner(sig)
                setAddress(wagmiAddress)
            }).catch(err => {
                console.error('Error getting signer:', err)
            })
        } else {
            setProvider(null)
            setSigner(null)
            setAddress('')
        }
    }, [isConnected, wagmiAddress])

    const soulboundContract = signer ? new ethers.Contract(SOULBOUND_ADDR, SoulBoundABI.abi, signer) : null
    const certificateContract = signer ? new ethers.Contract(CERTIFICATE_ADDR, CertificateABI.abi, signer) : null
    const materialContract = signer ? new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, signer) : null
    const marketContract = signer ? new ethers.Contract(MARKETPLACE_ADDR, MarketplaceABI.abi, signer) : null

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

    // Tooltip component
    const Tooltip = ({ text, children }) => {
        const [show, setShow] = useState(false)
        return (
            <div className="tooltip-container">
                <span 
                    className="tooltip-icon"
                    onMouseEnter={() => setShow(true)}
                    onMouseLeave={() => setShow(false)}
                >
                    {children || '?'}
                </span>
                {show && (
                    <div className="tooltip-content">
                        {text}
                    </div>
                )}
            </div>
        )
    }

    // Form field wrapper with label and tooltip
    const FormField = ({ label, name, type = "text", placeholder, required, tooltip, value, readOnly, onChange, className, children }) => {
        const isDateField = type === "date"
        return (
            <div className="form-field-wrapper">
                <label className="form-label">
                    {label}
                    {tooltip && <Tooltip text={tooltip} />}
                </label>
                {children || (
                    <input
                        type={type}
                        name={name}
                        placeholder={placeholder}
                        required={required}
                        value={value}
                        readOnly={readOnly}
                        onChange={onChange}
                        className={`form-input ${isDateField ? 'date-input' : ''} ${className || ''}`}
                    />
                )}
            </div>
        )
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
                certificationId: certificationId, // Use state value instead of form
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
            <div className="mint-form-container">
                <Link to="/">Back</Link>
                <h1>Mint New Material NFT</h1>

                {/* Info Section */}
                <div className="info-section">
                    <div className="info-item">
                        <span className="info-label">
                            NFT Status: <Tooltip text="All newly minted NFTs start with status 'Available'. This status will change as the material moves through logistics, delivery, and installation.">
                                <span className="info-icon">?</span>
                            </Tooltip>
                        </span>
                        <span className="info-value">Available</span>
                    </div>
                    {certificationId && (
                        <div className="info-item">
                            <span className="info-label">
                                Certificate ID: <Tooltip text={`Your certificate ID is automatically set to: ${certificationId}. This links your material to your supplier certificate.`}>
                                    <span className="info-icon">?</span>
                                </Tooltip>
                            </span>
                            <span className="info-value">{certificationId}</span>
                        </div>
                    )}
                </div>

                <form onSubmit={handleMintSubmit}>
                    <FormField
                        label="Product Name"
                        name="name"
                        placeholder="Enter the name of the product/material"
                        required
                        tooltip="The name of the construction material or product. Example: 'Steel Beam Type A', 'Concrete Mix C30'"
                    />

                    <FormField
                        label="Supplier Name"
                        name="supplierName"
                        placeholder="Enter your supplier name"
                        required
                        tooltip="Your registered supplier name. This will be displayed on the NFT and used for provenance tracking."
                    />

                    <FormField
                        label="Manufacture Date"
                        name="manufactureDate"
                        type="date"
                        required
                        tooltip="The date when the material was manufactured. Select a date in MM/DD/YYYY format. This is important for tracking material age and compliance."
                    />

                    <FormField
                        label="Batch Number"
                        name="batchNumber"
                        placeholder="Enter batch number"
                        required
                        tooltip="A unique identifier for the production batch. This helps track materials from the same production run. Example: 'BATCH-2024-001'"
                    />

                    <FormField
                        label="Quantity"
                        name="count"
                        type="number"
                        placeholder="Enter quantity"
                        required
                        tooltip="The number of units in this batch. Must be a positive whole number. Example: 100, 50, 1000"
                    />

                    <FormField
                        label="Weight"
                        name="weight"
                        type="number"
                        placeholder="Enter weight"
                        required
                        tooltip="The total weight of the material. Enter a positive number. Example: 500, 1250.5"
                    />

                    <FormField
                        label="Unit"
                        name="measureUnit"
                        placeholder="Enter unit of measurement"
                        tooltip="The unit of measurement for weight. Common units: kg, lbs, tons, grams. Example: 'kg', 'lbs'"
                    />

                    <div className="form-section">
                        <h3>Dimensions (Optional)</h3>
                        <div className="dimensions-grid">
                            <FormField
                                label="Length"
                                name="length"
                                type="number"
                                placeholder="Length"
                                tooltip="Length of the material in your preferred unit (meters, feet, etc.). Leave empty if not applicable."
                            />
                            <FormField
                                label="Width"
                                name="width"
                                type="number"
                                placeholder="Width"
                                tooltip="Width of the material in your preferred unit. Leave empty if not applicable."
                            />
                            <FormField
                                label="Height"
                                name="height"
                                type="number"
                                placeholder="Height"
                                tooltip="Height of the material in your preferred unit. Leave empty if not applicable."
                            />
                        </div>
                    </div>

                    <FormField
                        label="Description"
                        name="description"
                        required
                        tooltip="A detailed description of the material, including specifications, quality standards, and any relevant information for buyers and auditors."
                    >
                        <textarea 
                            name="description" 
                            placeholder="Enter detailed description"
                            className="form-input"
                            required
                        />
                    </FormField>

                    <FormField
                        label="Custom Expiration (Optional)"
                        name="customExpiration"
                        type="number"
                        placeholder="Unix timestamp (optional)"
                        tooltip="Optional: Unix timestamp for custom expiration. If not provided, default expiration will be used. Must be a future timestamp."
                        className="input input-bordered"
                    />

                    <div className="form-section">
                        <h3>
                            Select materials to assemble (optional)
                            <Tooltip text="If you want to create a composite material by assembling multiple existing materials, select them here. The selected materials will be marked as 'Assembled' and cannot be used again.">
                                <span className="info-icon">?</span>
                            </Tooltip>
                        </h3>
                        <div className="assemble-list">
                            {assembleTokens.length === 0 ? (
                                <p>No materials available for assembly</p>
                            ) : (
                                assembleTokens.map(id => (
                                    <div key={id} className="assemble-item">
                                        <input
                                            type="checkbox"
                                            checked={selectedTokens.includes(id)}
                                            onChange={() => toggleSelect(id)}
                                        />
                                        <label>Material #{id}</label>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    <button type="submit" className="submit-button">
                        {selectedTokens.length > 0 ? 'Assemble and Mint' : 'Mint NFT'}
                    </button>
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

        // Helper function to get valid status transitions based on current status
        const getValidStatusTransitions = (currentStatus) => {
            const status = Number(currentStatus)
            // Available (0) can transition to InTransit (1) or Assembled (3)
            if (status === 0) {
                return [
                    { value: 1, label: 'In Transit' }
                ]
            }
            // InTransit (1) can transition to Delivered (2)
            if (status === 1) {
                return [
                    { value: 2, label: 'Delivered' }
                ]
            }
            // Delivered (2) can transition to Assembled (3) or Available (0)
            if (status === 2) {
                return [
                    { value: 3, label: 'Assembled' },
                    { value: 0, label: 'Available' }
                ]
            }
            // Assembled (3) is terminal - no transitions
            return []
        }

        useEffect(() => {
            if (!provider) return
            const fetchData = async () => {
                const contract = new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, provider)
                try {
                    const mat = await contract.materials(tokenId)
                    setMaterial(mat)
                    
                    // Set initial status to first valid transition option
                    const validTransitions = getValidStatusTransitions(mat.status)
                    if (validTransitions.length > 0) {
                        setNewStatus(validTransitions[0].value)
                    } else {
                        setNewStatus(Number(mat.status))
                    }

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
            
            // Validate transition on frontend before sending
            const validTransitions = getValidStatusTransitions(material.status)
            const isValid = validTransitions.some(t => t.value === newStatus)
            if (!isValid) {
                return alert('Invalid status transition. Please select a valid status.')
            }
            
            try {
                const tx = await materialContract.updateStatus(tokenId, newStatus)
                await tx.wait()
                // Refresh data
                const mat = await materialContract.materials(tokenId)
                setMaterial(mat)
                // Set newStatus to first valid transition option for the updated status
                const validTransitions = getValidStatusTransitions(mat.status)
                if (validTransitions.length > 0) {
                    setNewStatus(validTransitions[0].value)
                } else {
                    setNewStatus(Number(mat.status))
                }
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
                        <select 
                            value={newStatus} 
                            onChange={(e) => setNewStatus(Number(e.target.value))}
                        >
                            {getValidStatusTransitions(material.status).map(option => (
                                <option key={option.value} value={option.value}>
                                    {option.label}
                                </option>
                            ))}
                        </select>
                        <button onClick={handleUpdateStatus}>Update</button>
                        {getValidStatusTransitions(material.status).length === 0 && (
                            <p style={{ color: '#d32f2f', fontSize: '14px', marginTop: '8px' }}>
                                No valid status transitions available
                            </p>
                        )}
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
        const [filtersOpen, setFiltersOpen] = useState(false);
        const [filters, setFilters] = useState({
            name: '',
            supplierName: '',
            batchNumber: '',
            description: ''
        });
        const [materialsMetadata, setMaterialsMetadata] = useState({}); // tokenId -> metadata mapping

        // Load metadata for all materials (owned and marketplace)
        useEffect(() => {
            const loadAllMetadata = async () => {
                if (!provider || !materialContract) return
                
                const allTokenIds = new Set([...ownedTokens, ...marketListings.map(l => l.tokenId)])
                const metadataMap = {}
                
                for (const tokenId of allTokenIds) {
                    try {
                        const mat = await materialContract.materials(tokenId)
                        if (mat.metadataURI && mat.metadataURI.startsWith(PINATA_GATEWAY)) {
                            const cid = mat.metadataURI.replace(PINATA_GATEWAY + '/', '')
                            const res = await fetch(`${PINATA_GATEWAY}/${cid}`)
                            if (res.ok) {
                                const metadata = await res.json()
                                metadataMap[tokenId] = metadata
                            }
                        }
                    } catch (err) {
                        console.error(`Error loading metadata for token ${tokenId}:`, err)
                    }
                }
                
                setMaterialsMetadata(metadataMap)
            }
            
            loadAllMetadata()
        }, [provider, materialContract, ownedTokens, marketListings])

        // Filter function - checks if material matches all active filters
        const matchesFilters = (tokenId, metadata) => {
            if (!metadata) return false
            
            // Check each filter - all must match (AND logic)
            if (filters.name && !metadata.name?.toLowerCase().includes(filters.name.toLowerCase())) {
                return false
            }
            if (filters.supplierName && !metadata.supplierName?.toLowerCase().includes(filters.supplierName.toLowerCase())) {
                return false
            }
            if (filters.batchNumber && !metadata.batchNumber?.toLowerCase().includes(filters.batchNumber.toLowerCase())) {
                return false
            }
            if (filters.description && !metadata.description?.toLowerCase().includes(filters.description.toLowerCase())) {
                return false
            }
            
            return true
        }

        // Get filtered tokens for My Materials view
        const getFilteredOwnedTokens = () => {
            if (Object.keys(filters).every(key => !filters[key])) {
                return ownedTokens // No filters active, return all
            }
            return ownedTokens.filter(tokenId => {
                const metadata = materialsMetadata[tokenId]
                return matchesFilters(tokenId, metadata)
            })
        }

        // Get filtered listings for Marketplace view
        const getFilteredMarketListings = () => {
            if (Object.keys(filters).every(key => !filters[key])) {
                return marketListings // No filters active, return all
            }
            return marketListings.filter(listing => {
                const metadata = materialsMetadata[listing.tokenId]
                return matchesFilters(listing.tokenId, metadata)
            })
        }

        const handleFilterChange = (field, value) => {
            setFilters(prev => ({
                ...prev,
                [field]: value
            }))
        }

        const clearFilters = () => {
            setFilters({
                name: '',
                supplierName: '',
                batchNumber: '',
                description: ''
            })
        }

        return (
            <div className="dashboard">
                <div className="header">
                    <div className="menu">
                        <button 
                            className={view === 'myMaterials' ? 'active' : ''}
                            onClick={() => setView('myMaterials')}
                        >
                            My Materials
                        </button>
                        <button 
                            className={view === 'marketplace' ? 'active' : ''}
                            onClick={() => setView('marketplace')}
                        >
                            Marketplace
                        </button>
                    </div>
                    <div className="user-info">
                        <p>Registered as: {role}</p>
                        {role === 'Supplier' && <p>Certificate: {certValid ? "Valid" : "Not valid"}</p>}
                    </div>
                </div>
                <div className="main-content">
                    <div className="large-container">
                        {/* Filter Toggle Button */}
                        <div className="filter-toggle-container">
                            <button 
                                className="filter-toggle-btn"
                                onClick={() => setFiltersOpen(!filtersOpen)}
                            >
                            
                                <span>Filters</span>
                                {Object.keys(filters).some(key => filters[key]) && (
                                    <span className="filter-badge">{Object.values(filters).filter(f => f).length}</span>
                                )}
                                <span className={`filter-arrow ${filtersOpen ? 'open' : ''}`}>▼</span>
                            </button>
                            {Object.keys(filters).some(key => filters[key]) && (
                                <button 
                                    className="clear-filters-btn-inline"
                                    onClick={clearFilters}
                                >
                                    Clear All
                                </button>
                            )}
                        </div>

                        {/* Filter Section */}
                        {filtersOpen && (
                            <div className="filter-section">
                                <div className="filter-grid">
                                <div className="filter-field">
                                    <label>Name</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by name"
                                        value={filters.name}
                                        onChange={(e) => handleFilterChange('name', e.target.value)}
                                    />
                                </div>
                                <div className="filter-field">
                                    <label>Supplier Name</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by supplier"
                                        value={filters.supplierName}
                                        onChange={(e) => handleFilterChange('supplierName', e.target.value)}
                                    />
                                </div>
                                <div className="filter-field">
                                    <label>Batch Number</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by batch number"
                                        value={filters.batchNumber}
                                        onChange={(e) => handleFilterChange('batchNumber', e.target.value)}
                                    />
                                </div>
                                <div className="filter-field">
                                    <label>Description</label>
                                    <input
                                        type="text"
                                        placeholder="Filter by description"
                                        value={filters.description}
                                        onChange={(e) => handleFilterChange('description', e.target.value)}
                                    />
                                </div>
                                </div>
                                {Object.keys(filters).some(key => filters[key]) && (
                                    <p className="filter-info">
                                        Showing filtered results ({view === 'myMaterials' 
                                            ? getFilteredOwnedTokens().length 
                                            : getFilteredMarketListings().length} of {view === 'myMaterials' 
                                            ? ownedTokens.length 
                                            : marketListings.length})
                                    </p>
                                )}
                            </div>
                        )}

                        {view === 'myMaterials' ? (
                            <>
                                <h2>My Materials</h2>
                                {ownedTokens.length === 0 ? (
                                    <p>No materials owned</p>
                                ) : getFilteredOwnedTokens().length === 0 ? (
                                    <p>No materials match the current filters</p>
                                ) : (
                                    <div className="card-grid">
                                        {getFilteredOwnedTokens().map(id => (
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
                                ) : getFilteredMarketListings().length === 0 ? (
                                    <p>No listings match the current filters</p>
                                ) : (
                                    <div className="card-grid">
                                        {getFilteredMarketListings().map(l => (
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
                {/* Connect/Disconnect Button at top left */}
                <div style={{ position: 'fixed', top: '20px', left: '20px', zIndex: 1000 }}>
                    <ConnectButton />
                </div>

                {loading && <div>Loading...</div>}

                {!isConnected || !address ? (
                    <div style={{ paddingTop: '80px', textAlign: 'center' }}>
                        <h1>Construction Material Provenance</h1>
                        <p>Please connect your wallet to continue</p>
                    </div>
                ) : role === 'Not registered' ? (
                    <div style={{ paddingTop: '80px' }}>
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