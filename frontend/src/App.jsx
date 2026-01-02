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
        const confirmed = window.confirm(
            "WARNING: After revoking this certificate, this supplier will NOT be able to issue a certificate again.\n\n" +
            "This action cannot be undone. Are you sure you want to revoke this certificate?"
        )
        
        if (!confirmed) return
        
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
        const [customExpiration, setCustomExpiration] = useState({
            hours: 0,
            days: 0,
            months: 0
        })

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
                    const status = Number(mat.status)
                    // Only include tokens with status Available (0) or Delivered (2)
                    if (status === 0 || status === 2) {
                        available.push(id)
                    }
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

                // Calculate expiration timestamp from hours, days, and months
                let exp = 0
                if (customExpiration.hours > 0 || customExpiration.days > 0 || customExpiration.months > 0) {
                    const now = Math.floor(Date.now() / 1000)
                    const hoursInSeconds = customExpiration.hours * 3600
                    const daysInSeconds = customExpiration.days * 86400
                    const monthsInSeconds = customExpiration.months * 30 * 86400 // Approximate: 30 days per month
                    exp = now + hoursInSeconds + daysInSeconds + monthsInSeconds
                }

                // Explicitly call the correct mint function to avoid ambiguity
                let tx
                if (exp > 0) {
                    // Call mint(string,uint256) - with custom expiration
                    tx = await materialContract["mint(string,uint256)"](tokenURI, exp)
                } else {
                    // Call mint(string) - with default expiration
                    tx = await materialContract["mint(string)"](tokenURI)
                }

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
                setCustomExpiration({ hours: 0, days: 0, months: 0 })
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

                    <div className="form-section">
                        <h3>
                            Custom Expiration (Optional)
                            <Tooltip text="Set a custom expiration time for this material. Leave all fields at 0 to use the default 6-month expiration. The values will be converted to a Unix timestamp automatically.">
                                <span className="info-icon">?</span>
                            </Tooltip>
                        </h3>
                        <div className="expiration-inputs">
                            <div className="expiration-field">
                                <label>Months</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={customExpiration.months}
                                    onChange={(e) => setCustomExpiration(prev => ({ ...prev, months: Math.max(0, parseInt(e.target.value) || 0) }))}
                                    placeholder="0"
                                />
                            </div>
                            <div className="expiration-field">
                                <label>Days</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={customExpiration.days}
                                    onChange={(e) => setCustomExpiration(prev => ({ ...prev, days: Math.max(0, parseInt(e.target.value) || 0) }))}
                                    placeholder="0"
                                />
                            </div>
                            <div className="expiration-field">
                                <label>Hours</label>
                                <input
                                    type="number"
                                    min="0"
                                    value={customExpiration.hours}
                                    onChange={(e) => setCustomExpiration(prev => ({ ...prev, hours: Math.max(0, parseInt(e.target.value) || 0) }))}
                                    placeholder="0"
                                />
                            </div>
                        </div>
                        {(customExpiration.hours > 0 || customExpiration.days > 0 || customExpiration.months > 0) && (
                            <p className="expiration-preview">
                                Expiration: {new Date((Math.floor(Date.now() / 1000) + 
                                    customExpiration.hours * 3600 + 
                                    customExpiration.days * 86400 + 
                                    customExpiration.months * 30 * 86400) * 1000).toLocaleString()}
                            </p>
                        )}
                    </div>

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
        const [transactionHistory, setTransactionHistory] = useState([])
        const [historyLoading, setHistoryLoading] = useState(false)
        const [showHistory, setShowHistory] = useState(false)

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

        const loadTransactionHistory = async () => {
            if (!provider || !materialContract || !marketContract) return
            
            setHistoryLoading(true)
            const history = []

            try {
                // 1. Get Transfer events (creation and transfers)
                const material = new ethers.Contract(MATERIAL_ADDR, MaterialABI.abi, provider)
                const transferFilter = material.filters.Transfer(null, null, tokenId)
                const transferEvents = await material.queryFilter(transferFilter, 0)

                // Track status changes by querying material status at each block
                const statusHistory = []
                let previousStatus = null
                let previousBlockNumber = null

                for (const event of transferEvents) {
                    const { from, to, tokenId: eventTokenId } = event.args
                    const block = await provider.getBlock(event.blockNumber)
                    
                    // Get material status at this block
                    try {
                        const matAtBlock = await material.materials(tokenId, { blockTag: event.blockNumber })
                        const currentStatus = Number(matAtBlock.status)
                        const statusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][currentStatus]
                        
                        // If status changed since last event, record it
                        if (previousStatus !== null && previousBlockNumber !== null && previousStatus !== currentStatus) {
                            const prevStatusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][previousStatus]
                            // Status update happened between previous block and this block
                            // Use the current block as approximation
                            statusHistory.push({
                                type: 'status_update',
                                fromStatus: prevStatusLabel,
                                toStatus: statusLabel,
                                timestamp: block.timestamp,
                                blockNumber: event.blockNumber,
                                txHash: event.transactionHash,
                                label: `Status Updated: ${prevStatusLabel} ->${statusLabel}`
                            })
                        }
                        previousStatus = currentStatus
                        previousBlockNumber = event.blockNumber
                    } catch (err) {
                        console.error('Error querying status at block:', err)
                    }
                    
                    const zeroAddress = '0x0000000000000000000000000000000000000000'
                    if (from.toLowerCase() === zeroAddress) {
                        // Creation (minting)
                        try {
                            const matAtBlock = await material.materials(tokenId, { blockTag: event.blockNumber })
                            const initialStatus = ['Available', 'InTransit', 'Delivered', 'Assembled'][Number(matAtBlock.status)]
                            history.push({
                                type: 'creation',
                                from: from,
                                to: to,
                                status: initialStatus,
                                timestamp: block.timestamp,
                                blockNumber: event.blockNumber,
                                txHash: event.transactionHash,
                                label: `NFT Created (Minted) - Status: ${initialStatus}`
                            })
                        } catch (err) {
                            history.push({
                                type: 'creation',
                                from: from,
                                to: to,
                                timestamp: block.timestamp,
                                blockNumber: event.blockNumber,
                                txHash: event.transactionHash,
                                label: 'NFT Created (Minted)'
                            })
                        }
                    } else {
                        // Transfer/Purchase
                        history.push({
                            type: 'transfer',
                            from: from,
                            to: to,
                            timestamp: block.timestamp,
                            blockNumber: event.blockNumber,
                            txHash: event.transactionHash,
                            label: 'Transferred'
                        })
                    }
                }

                // 2. Get Marketplace Listed events and check for status changes
                const listedFilter = marketContract.filters.Listed(null, MATERIAL_ADDR, tokenId)
                const listedEvents = await marketContract.queryFilter(listedFilter, 0)
                
                for (const event of listedEvents) {
                    const { seller, price } = event.args
                    const block = await provider.getBlock(event.blockNumber)
                    
                    // Check status at this block
                    try {
                        const matAtBlock = await material.materials(tokenId, { blockTag: event.blockNumber })
                        const currentStatus = Number(matAtBlock.status)
                        const statusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][currentStatus]
                        
                        if (previousStatus !== null && previousStatus !== currentStatus) {
                            const prevStatusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][previousStatus]
                            statusHistory.push({
                                type: 'status_update',
                                fromStatus: prevStatusLabel,
                                toStatus: statusLabel,
                                timestamp: block.timestamp,
                                blockNumber: event.blockNumber,
                                txHash: event.transactionHash,
                                label: `Status Updated: ${prevStatusLabel} ->${statusLabel}`
                            })
                        }
                        previousStatus = currentStatus
                        previousBlockNumber = event.blockNumber
                    } catch (err) {
                        console.error('Error querying status at listed block:', err)
                    }
                    
                    history.push({
                        type: 'listed',
                        seller: seller,
                        price: formatEther(price),
                        timestamp: block.timestamp,
                        blockNumber: event.blockNumber,
                        txHash: event.transactionHash,
                        label: 'Listed on Marketplace'
                    })
                }

                // 3. Get Marketplace Sold events and check for status changes
                const soldFilter = marketContract.filters.Sold(null, MATERIAL_ADDR, tokenId)
                const soldEvents = await marketContract.queryFilter(soldFilter, 0)
                
                for (const event of soldEvents) {
                    const { buyer, price } = event.args
                    const block = await provider.getBlock(event.blockNumber)
                    
                    // Check status at this block
                    try {
                        const matAtBlock = await material.materials(tokenId, { blockTag: event.blockNumber })
                        const currentStatus = Number(matAtBlock.status)
                        const statusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][currentStatus]
                        
                        if (previousStatus !== null && previousStatus !== currentStatus) {
                            const prevStatusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][previousStatus]
                            statusHistory.push({
                                type: 'status_update',
                                fromStatus: prevStatusLabel,
                                toStatus: statusLabel,
                                timestamp: block.timestamp,
                                blockNumber: event.blockNumber,
                                txHash: event.transactionHash,
                                label: `Status Updated: ${prevStatusLabel} ->${statusLabel}`
                            })
                        }
                        previousStatus = currentStatus
                        previousBlockNumber = event.blockNumber
                    } catch (err) {
                        console.error('Error querying status at sold block:', err)
                    }
                    
                    history.push({
                        type: 'sold',
                        buyer: buyer,
                        price: formatEther(price),
                        timestamp: block.timestamp,
                        blockNumber: event.blockNumber,
                        txHash: event.transactionHash,
                        label: 'Sold on Marketplace'
                    })
                }

                // 4. Get Marketplace Cancelled events and check for status changes
                const cancelledFilter = marketContract.filters.Cancelled(null, MATERIAL_ADDR, tokenId)
                const cancelledEvents = await marketContract.queryFilter(cancelledFilter, 0)
                
                for (const event of cancelledEvents) {
                    const { seller } = event.args
                    const block = await provider.getBlock(event.blockNumber)
                    
                    // Check status at this block
                    try {
                        const matAtBlock = await material.materials(tokenId, { blockTag: event.blockNumber })
                        const currentStatus = Number(matAtBlock.status)
                        const statusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][currentStatus]
                        
                        if (previousStatus !== null && previousStatus !== currentStatus) {
                            const prevStatusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][previousStatus]
                            statusHistory.push({
                                type: 'status_update',
                                fromStatus: prevStatusLabel,
                                toStatus: statusLabel,
                                timestamp: block.timestamp,
                                blockNumber: event.blockNumber,
                                txHash: event.transactionHash,
                                label: `Status Updated: ${prevStatusLabel} ->${statusLabel}`
                            })
                        }
                        previousStatus = currentStatus
                        previousBlockNumber = event.blockNumber
                    } catch (err) {
                        console.error('Error querying status at cancelled block:', err)
                    }
                    
                    history.push({
                        type: 'cancelled',
                        seller: seller,
                        timestamp: block.timestamp,
                        blockNumber: event.blockNumber,
                        txHash: event.transactionHash,
                        label: 'Listing Cancelled'
                    })
                }

                // 5. Check for status updates between last event and current state
                // Also scan recent blocks to find status updates that happened without other events
                try {
                    const currentMat = await material.materials(tokenId)
                    const currentStatus = Number(currentMat.status)
                    const currentStatusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][currentStatus]
                    const currentBlock = await provider.getBlock('latest')
                    
                    // If we have a previous status and it's different, there was a status update
                    if (previousStatus !== null && previousStatus !== currentStatus) {
                        const prevStatusLabel = ['Available', 'InTransit', 'Delivered', 'Assembled'][previousStatus]
                        
                        // Try to find the exact block where status changed by scanning backwards
                        let statusChangeBlock = currentBlock.number
                        let foundExactBlock = false
                        
                        // Scan last 100 blocks to find when status changed (if not too expensive)
                        if (previousBlockNumber && currentBlock.number - previousBlockNumber < 100) {
                            for (let blockNum = previousBlockNumber + 1; blockNum <= currentBlock.number; blockNum++) {
                                try {
                                    const matAtBlock = await material.materials(tokenId, { blockTag: blockNum })
                                    const statusAtBlock = Number(matAtBlock.status)
                                    if (statusAtBlock !== previousStatus) {
                                        statusChangeBlock = blockNum
                                        const changeBlock = await provider.getBlock(blockNum)
                                        statusHistory.push({
                                            type: 'status_update',
                                            fromStatus: prevStatusLabel,
                                            toStatus: currentStatusLabel,
                                            timestamp: changeBlock.timestamp,
                                            blockNumber: blockNum,
                                            txHash: 'found', // Found in block scan
                                            label: `Status Updated: ${prevStatusLabel} ->${currentStatusLabel}`
                                        })
                                        foundExactBlock = true
                                        break
                                    }
                                } catch (err) {
                                    // Continue scanning
                                }
                            }
                        }
                        
                        // If we couldn't find exact block, use current block
                        if (!foundExactBlock) {
                            statusHistory.push({
                                type: 'status_update',
                                fromStatus: prevStatusLabel,
                                toStatus: currentStatusLabel,
                                timestamp: currentBlock.timestamp,
                                blockNumber: currentBlock.number,
                                txHash: 'recent', // Status updated recently
                                label: `Status Updated: ${prevStatusLabel} ->${currentStatusLabel}`
                            })
                        }
                    }
                } catch (err) {
                    console.error('Error checking current status:', err)
                }

                // Add status updates to history
                history.push(...statusHistory)

                // 5. Check for assembling (if metadata has nfts_consumed)
                if (metadata?.nfts_consumed && metadata.nfts_consumed.length > 0) {
                    // Calculate consumed token IDs for this specific NFT using allTokens from parent scope
                    const currentConsumedIds = []
                    try {
                        // Use allTokens from parent scope for efficiency
                        for (let id of allTokens) {
                            try {
                                const mat = await material.materials(id)
                                const cid = mat.metadataURI.replace(PINATA_GATEWAY + '/', '')
                                if (metadata.nfts_consumed.includes(cid)) {
                                    currentConsumedIds.push(id)
                                }
                            } catch (err) {
                                // Token doesn't exist or error, skip
                            }
                        }
                    } catch (err) {
                        console.error('Error finding consumed token IDs:', err)
                    }
                    
                    // Find the block where this NFT was created to approximate assembly time
                    const zeroAddress = '0x0000000000000000000000000000000000000000'
                    const creationEvent = transferEvents.find(e => e.args.from.toLowerCase() === zeroAddress)
                    if (creationEvent && currentConsumedIds.length > 0) {
                        const block = await provider.getBlock(creationEvent.blockNumber)
                        history.push({
                            type: 'assembled',
                            consumedTokens: currentConsumedIds,
                            timestamp: block.timestamp,
                            blockNumber: creationEvent.blockNumber,
                            txHash: creationEvent.transactionHash,
                            label: 'Assembled from Materials'
                        })
                    }
                }

                // Sort by block number (oldest first)
                history.sort((a, b) => a.blockNumber - b.blockNumber)
                setTransactionHistory(history)
            } catch (err) {
                console.error('Error loading transaction history:', err)
            } finally {
                setHistoryLoading(false)
            }
        }

        useEffect(() => {
            // Reset transaction history when tokenId changes
            setTransactionHistory([])
            setShowHistory(false)
        }, [tokenId])

        useEffect(() => {
            if (showHistory && transactionHistory.length === 0 && !historyLoading) {
                loadTransactionHistory()
            }
        }, [showHistory, provider, materialContract, marketContract, tokenId, metadata])

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

                <h2>Transaction History</h2>
                <button 
                    className="history-toggle-btn"
                    onClick={() => {
                        setShowHistory(!showHistory)
                        if (!showHistory && transactionHistory.length === 0) {
                            loadTransactionHistory()
                        }
                    }}
                >
                    {showHistory ? '▼ Hide History' : '▶ Show History'}
                </button>

                {showHistory && (
                    <div className="transaction-history">
                        {historyLoading ? (
                            <p>Loading transaction history...</p>
                        ) : transactionHistory.length === 0 ? (
                            <p>No transaction history found.</p>
                        ) : (
                            <div className="history-list">
                                {transactionHistory.map((item, index) => (
                                    <div key={`${item.txHash}-${index}`} className="history-item">
                                        <div className="history-item-header">
                                            <span className="history-type">{item.label}</span>
                                            <span className="history-date">
                                                {new Date(item.timestamp * 1000).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="history-item-details">
                                            {item.type === 'creation' && (
                                                <p>Minted to: {item.to.slice(0, 6)}...{item.to.slice(-4)}</p>
                                            )}
                                            {item.type === 'transfer' && (
                                                <>
                                                    <p>From: {item.from.slice(0, 6)}...{item.from.slice(-4)}</p>
                                                    <p>To: {item.to.slice(0, 6)}...{item.to.slice(-4)}</p>
                                                </>
                                            )}
                                            {item.type === 'listed' && (
                                                <p>Listed by: {item.seller.slice(0, 6)}...{item.seller.slice(-4)} for {item.price} ETH</p>
                                            )}
                                            {item.type === 'sold' && (
                                                <p>Sold to: {item.buyer.slice(0, 6)}...{item.buyer.slice(-4)} for {item.price} ETH</p>
                                            )}
                                            {item.type === 'cancelled' && (
                                                <p>Cancelled by: {item.seller.slice(0, 6)}...{item.seller.slice(-4)}</p>
                                            )}
                                            {item.type === 'status_update' && (
                                                <p>Status changed from <strong>{item.fromStatus}</strong> to <strong>{item.toStatus}</strong></p>
                                            )}
                                            {item.type === 'assembled' && (
                                                <div>
                                                    <p>Assembled from {item.consumedTokens.length} material(s):</p>
                                                    <ul>
                                                        {item.consumedTokens.map(id => (
                                                            <li key={id}><Link to={`/nft/${id}`}>Material #{id}</Link></li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}
                                            <p className="history-tx">
                                                Block: {item.blockNumber} | 
                                                {item.txHash && item.txHash !== 'recent' && item.txHash !== 'pending' && item.txHash !== 'found' ? (
                                                    <>
                                                        TX: <a 
                                                            href={`#`} 
                                                            onClick={(e) => {
                                                                e.preventDefault()
                                                                navigator.clipboard.writeText(item.txHash)
                                                                alert('Transaction hash copied to clipboard!')
                                                            }}
                                                        >
                                                            {item.txHash.slice(0, 10)}...{item.txHash.slice(-8)}
                                                        </a>
                                                    </>
                                                ) : (
                                                    <span style={{ color: '#666', fontStyle: 'italic' }}>
                                                        {item.txHash === 'recent' ? 'Recent update (approximate)' : 
                                                         item.txHash === 'found' ? 'Status change detected' : 
                                                         item.txHash === 'pending' ? 'Pending' : 'No transaction hash'}
                                                    </span>
                                                )}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
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
            description: '',
            status: ''
        });
        const [materialsMetadata, setMaterialsMetadata] = useState({}); // tokenId -> metadata mapping
        const [materialsStatus, setMaterialsStatus] = useState({}); // tokenId -> status mapping

        // Load metadata and status for all materials (owned and marketplace)
        useEffect(() => {
            const loadAllMetadata = async () => {
                if (!provider || !materialContract) return
                
                const allTokenIds = new Set([...ownedTokens, ...marketListings.map(l => l.tokenId)])
                const metadataMap = {}
                const statusMap = {}
                
                for (const tokenId of allTokenIds) {
                    try {
                        const mat = await materialContract.materials(tokenId)
                        statusMap[tokenId] = Number(mat.status) // Store status
                        
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
                setMaterialsStatus(statusMap)
            }
            
            loadAllMetadata()
        }, [provider, materialContract, ownedTokens, marketListings])

        // Filter function - checks if material matches all active filters
        const matchesFilters = (tokenId, metadata, materialStatus) => {
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
            if (filters.status && materialStatus !== undefined) {
                const statusLabels = ['Available', 'InTransit', 'Delivered', 'Assembled']
                const currentStatusLabel = statusLabels[Number(materialStatus)]
                if (currentStatusLabel.toLowerCase() !== filters.status.toLowerCase()) {
                    return false
                }
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
                const status = materialsStatus[tokenId]
                return matchesFilters(tokenId, metadata, status)
            })
        }

        // Get filtered listings for Marketplace view
        const getFilteredMarketListings = () => {
            if (Object.keys(filters).every(key => !filters[key])) {
                return marketListings // No filters active, return all
            }
            return marketListings.filter(listing => {
                const metadata = materialsMetadata[listing.tokenId]
                const status = materialsStatus[listing.tokenId]
                return matchesFilters(listing.tokenId, metadata, status)
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
                description: '',
                status: ''
            })
        }

        return (
            <div className="dashboard">
                <div className="header">
                    <div className="user-info">
                        <p>Registered as: {role}</p>
                        {role === 'Supplier' && <p>Certificate: {certValid ? "Valid" : "Not valid"}</p>}
                    </div>
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
                        {role === 'Supplier' && certValid && (
                            <Link to="/mint" className="create-nft-btn">
                                Create Material NFT
                            </Link>
                        )}
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
                                <div className="filter-field">
                                    <label>Status</label>
                                    <select
                                        value={filters.status}
                                        onChange={(e) => handleFilterChange('status', e.target.value)}
                                    >
                                        <option value="">All Statuses</option>
                                        <option value="Available">Available</option>
                                        <option value="InTransit">In Transit</option>
                                        <option value="Delivered">Delivered</option>
                                        <option value="Assembled">Assembled</option>
                                    </select>
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
                        {isOwner && (
                            <div className="certificate-panel">
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
                                <div className="revoke-certificate-container">
                                    <button onClick={revokeCertificate} className="revoke-certificate-btn">
                                        Revoke Certificate
                                    </button>
                                </div>
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