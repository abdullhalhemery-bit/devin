// ═══════════════════════════════════════════════════════════
//  /api/addresses — handles both POST (generate) and GET (list)
//
//  POST: Generates a destination address from HD wallet using the FID as index.
//        Each FID deterministically maps to the same address.
//        Also generates EIP-712 Transfer signature for IdRegistry.
//        Data is saved to db/data.json (persistent local database).
//
//  GET:  Returns all generated addresses.
//
//  Required env var: SEED_PHRASE
//  No external database needed (Vercel KV removed).
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';
import { saveAddress, getAddressByFid, getAllAddresses } from '../lib/db';

// IdRegistry contract on Optimism
const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const OPTIMISM_RPC = 'https://mainnet.optimism.io';

// EIP-712 domain for IdRegistry
const EIP712_DOMAIN = {
  name: 'Farcaster IdRegistry',
  version: '1',
  chainId: 10,
  verifyingContract: ID_REGISTRY,
};

// EIP-712 Transfer type
const TRANSFER_TYPE = {
  Transfer: [
    { name: 'fid', type: 'uint256' },
    { name: 'to', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

function getIdRegistryContract() {
  const provider = new ethers.providers.JsonRpcProvider(OPTIMISM_RPC);
  return new ethers.Contract(ID_REGISTRY, [
    'function nonces(address) view returns (uint256)',
    'function idOf(address) view returns (uint256)',
    'function custodyOf(uint256) view returns (address)',
  ], provider);
}

async function generateTransferSignature(wallet, fid, toAddress, nonce, deadline) {
  const message = {
    fid: ethers.BigNumber.from(fid),
    to: toAddress,
    nonce: nonce,
    deadline: ethers.BigNumber.from(deadline),
  };

  // ethers v5 _signTypedData
  const signature = await wallet._signTypedData(EIP712_DOMAIN, TRANSFER_TYPE, message);
  return signature;
}

export default async function handler(req, res) {
  // ─── POST: Generate address for a FID ───
  if (req.method === 'POST') {
    const SEED_PHRASE = process.env.SEED_PHRASE;
    if (!SEED_PHRASE) {
      return res.status(500).json({
        error: 'SEED_PHRASE environment variable is not configured.',
        hint: 'Set it in Vercel Dashboard > Settings > Environment Variables.',
      });
    }

    try {
      const { fid, senderAddress } = req.body || {};
      if (!fid) {
        return res.status(400).json({ error: 'FID is required.' });
      }

      // Use FID directly as derivation index
      const index = parseInt(fid);
      const derivationPath = `m/44'/60'/0'/0/${index}`;
      const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);
      const childNode = hdNode.derivePath(derivationPath);
      const wallet = new ethers.Wallet(childNode);

      const idRegistry = getIdRegistryContract();

      // Validate: sender must own this FID on-chain
      if (senderAddress) {
        const onChainFid = await idRegistry.idOf(senderAddress);
        if (onChainFid.isZero()) {
          return res.status(400).json({
            error: `Address ${senderAddress} does not own any FID on-chain. Make sure you are using the correct custody wallet.`,
            onChainFid: 0,
          });
        }
        if (onChainFid.toNumber() !== index) {
          return res.status(400).json({
            error: `FID mismatch: Farcaster says FID ${fid}, but on-chain ${senderAddress} owns FID ${onChainFid.toString()}. Using on-chain FID.`,
            onChainFid: onChainFid.toNumber(),
            requestedFid: fid,
          });
        }
      }

      // Validate: destination must NOT already own an FID
      const destFid = await idRegistry.idOf(wallet.address);
      if (!destFid.isZero()) {
        return res.status(400).json({
          error: `Destination address ${wallet.address} already owns FID ${destFid.toString()}. Each address can only hold one FID.`,
        });
      }

      // Get recipient nonce from IdRegistry on Optimism
      const nonce = await idRegistry.nonces(wallet.address);

      // Deadline: 2 minutes from now (near-instant execution)
      const deadline = Math.floor(Date.now() / 1000) + 120;

      // Generate EIP-712 Transfer signature from the receiving address
      const transferSignature = await generateTransferSignature(
        wallet, fid, wallet.address, nonce, deadline
      );

      // Sign receipt message (existing behavior)
      const receiptMessage = [
        `devin: FID Transfer Receipt`,
        `FID: ${fid}`,
        `From: ${senderAddress || 'unknown'}`,
        `To: ${wallet.address}`,
        `Index: ${index}`,
        `Time: ${new Date().toISOString()}`,
      ].join('\n');
      const recipientSignature = await wallet.signMessage(receiptMessage);

      // Save to database
      const entry = {
        address: wallet.address,
        derivationPath,
        index,
        fid,
        senderAddress: senderAddress || null,
        recipientSignature,
        transferSignature,
        transferDeadline: deadline,
        transferNonce: nonce.toString(),
        timestamp: new Date().toISOString(),
        status: 'pending',
      };

      // Check if already generated for this FID — update with fresh signature
      const existing = getAddressByFid(fid);
      if (existing) {
        // Return fresh signature even for existing addresses
        existing.transferSignature = transferSignature;
        existing.transferDeadline = deadline;
        existing.transferNonce = nonce.toString();
        saveAddress(existing);
        console.log(`[addresses] Updated sig for fid=${fid} addr=${existing.address}`);
        return res.status(200).json({
          success: true,
          ...existing,
        });
      }

      saveAddress(entry);

      console.log(`[addresses] POST index=${index} fid=${fid} addr=${wallet.address} from=${senderAddress}`);

      return res.status(200).json({
        success: true,
        ...entry,
      });

    } catch (e) {
      console.error('[addresses] POST error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  // ─── GET: List all generated addresses ───
  if (req.method === 'GET') {
    const addresses = getAllAddresses();
    return res.status(200).json({
      success: true,
      total: addresses.length,
      addresses,
    });
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
}
