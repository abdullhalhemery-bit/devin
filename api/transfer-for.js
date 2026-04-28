// ═══════════════════════════════════════════════════════════
//  /api/transfer-for — Prepare data for FID transfer
//
//  POST { fid: number }
//
//  Returns:
//    - custody: the on-chain custody address of the FID
//    - to: the HD wallet destination address
//    - toSig: EIP-712 Transfer signature from destination (server-side)
//    - toNonce, toDeadline: params used for toSig
//    - fromNonce, fromDeadline: params for frontend to sign fromSig
//
//  HD wallets (seed phrase) only generate signatures — ZERO gas needed.
//  The user pays gas when sending the on-chain transaction.
//
//  Required env: SEED_PHRASE
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';

const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const OPTIMISM_RPC = 'https://mainnet.optimism.io';

// EIP-712 domain — MUST match the contract's constructor: EIP712("Farcaster IdRegistry", "1")
const EIP712_DOMAIN = {
  name: 'Farcaster IdRegistry',
  version: '1',
  chainId: 10,
  verifyingContract: ID_REGISTRY,
};

// EIP-712 Transfer type — must match: keccak256("Transfer(uint256 fid,address to,uint256 nonce,uint256 deadline)")
const TRANSFER_TYPE = {
  Transfer: [
    { name: 'fid', type: 'uint256' },
    { name: 'to', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

const ID_REGISTRY_ABI = [
  'function idOf(address) view returns (uint256)',
  'function nonces(address) view returns (uint256)',
  'function custodyOf(uint256) view returns (address)',
];

// Simple db helpers — inline to avoid import issues on Vercel
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'db', 'data.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      return { addresses: [], logs: [] };
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Ensure arrays exist
    if (!Array.isArray(parsed.addresses)) parsed.addresses = [];
    if (!Array.isArray(parsed.logs)) parsed.logs = [];
    return parsed;
  } catch {
    return { addresses: [], logs: [] };
  }
}

function writeDB(data) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('[db] Write error:', err.message);
  }
}

function saveAddress(entry) {
  try {
    const db = readDB();
    const existingIdx = db.addresses.findIndex(a => a.index === entry.index);
    if (existingIdx >= 0) {
      db.addresses[existingIdx] = entry;
    } else {
      db.addresses.push(entry);
    }
    writeDB(db);
  } catch (err) {
    console.error('[db] saveAddress error:', err.message);
  }
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const SEED_PHRASE = process.env.SEED_PHRASE;
  if (!SEED_PHRASE) {
    return res.status(500).json({
      error: 'Server configuration error. SEED_PHRASE not set.',
    });
  }

  try {
    const { fid } = req.body || {};
    if (!fid) {
      return res.status(400).json({ error: 'Missing required field: fid' });
    }

    const fidNum = parseInt(fid);
    if (!fidNum || fidNum <= 0) {
      return res.status(400).json({ error: 'Invalid FID.' });
    }

    console.log(`[transfer-for] Starting for FID ${fidNum}...`);

    const provider = new ethers.providers.JsonRpcProvider(OPTIMISM_RPC);
    const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);
    const idRegistry = new ethers.Contract(ID_REGISTRY, ID_REGISTRY_ABI, provider);

    // Derive destination wallet for this FID
    const toChild = hdNode.derivePath(`m/44'/60'/0'/0/${fidNum}`);
    const toWallet = new ethers.Wallet(toChild.privateKey, provider);

    // Read custody address from chain
    let custody;
    try {
      custody = await idRegistry.custodyOf(fidNum);
    } catch (chainErr) {
      console.error('[transfer-for] custodyOf failed:', chainErr.message);
      return res.status(500).json({ error: 'Failed to read custody address from chain.' });
    }

    if (custody === ethers.constants.AddressZero) {
      return res.status(400).json({
        error: `FID ${fid} does not exist or has no custody address.`,
      });
    }

    // Check destination doesn't already own an FID
    const destFid = await idRegistry.idOf(toWallet.address);
    if (!destFid.isZero()) {
      if (destFid.eq(fidNum)) {
        return res.status(200).json({
          success: true,
          alreadyTransferred: true,
          to: toWallet.address,
          fid: fidNum,
          custody: custody,
          message: `FID ${fid} already transferred to ${toWallet.address}`,
        });
      }
      return res.status(400).json({
        error: `Destination already owns FID ${destFid.toString()}. Each address can only hold one FID.`,
      });
    }

    // Read nonces for both parties
    const [fromNonce, toNonce] = await Promise.all([
      idRegistry.nonces(custody),
      idRegistry.nonces(toWallet.address),
    ]);

    // Deadline: 2 minutes from now
    const now = Math.floor(Date.now() / 1000);
    const fromDeadline = now + 120;
    const toDeadline = now + 120;

    // Generate toSig (recipient acceptance signature from our HD wallet)
    const toSig = await toWallet._signTypedData(EIP712_DOMAIN, TRANSFER_TYPE, {
      fid: ethers.BigNumber.from(fidNum),
      to: toWallet.address,
      nonce: toNonce,
      deadline: ethers.BigNumber.from(toDeadline),
    });

    console.log(`[transfer-for] fid=${fidNum}, custody=${custody}, to=${toWallet.address}`);

    // Build response FIRST
    const responseData = {
      success: true,
      to: toWallet.address,
      fid: fidNum,
      custody: custody,
      fromNonce: fromNonce.toString(),
      fromDeadline,
      toNonce: toNonce.toString(),
      toDeadline,
      toSig,
    };

    // Save to database AFTER building response (don't block on db errors)
    try {
      saveAddress({
        address: toWallet.address,
        derivationPath: `m/44'/60'/0'/0/${fidNum}`,
        index: fidNum,
        fid: fidNum,
        senderAddress: custody,
        timestamp: new Date().toISOString(),
        status: 'pending',
      });
    } catch (dbErr) {
      console.warn('[transfer-for] DB save failed (non-critical):', dbErr.message);
    }

    // Always return the response
    return res.status(200).json(responseData);

  } catch (e) {
    console.error('[transfer-for] fatal error:', e);
    return res.status(500).json({
      error: e.reason || e.message || 'Internal server error',
    });
  }
}
