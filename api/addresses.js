// ═══════════════════════════════════════════════════════════
//  /api/addresses — handles both POST (generate) and GET (list)
//
//  POST: Generates a destination address from HD wallet using the FID as index.
//  GET:  Returns all generated addresses.
//
//  Required env var: SEED_PHRASE
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';

// ─── Inline DB helpers (self-contained, no external imports) ───
const DB_PATH = path.join(process.cwd(), 'db', 'data.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) return { addresses: [], logs: [] };
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.addresses)) parsed.addresses = [];
    if (!Array.isArray(parsed.logs)) parsed.logs = [];
    return parsed;
  } catch { return { addresses: [], logs: [] }; }
}

function writeDB(data) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
  } catch (err) { console.error('[db] Write error:', err.message); }
}

function saveAddress(entry) {
  try {
    const db = readDB();
    const idx = db.addresses.findIndex(a => a.index === entry.index);
    if (idx >= 0) db.addresses[idx] = entry;
    else db.addresses.push(entry);
    writeDB(db);
  } catch (err) { console.error('[db] saveAddress error:', err.message); }
}

function getAddressByFid(fid) {
  const db = readDB();
  return db.addresses.find(a => String(a.fid) === String(fid)) || null;
}

function getAllAddresses() {
  return readDB().addresses;
}

// ─── Contracts ───
const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const OPTIMISM_RPC = 'https://mainnet.optimism.io';

const EIP712_DOMAIN = {
  name: 'Farcaster IdRegistry',
  version: '1',
  chainId: 10,
  verifyingContract: ID_REGISTRY,
};

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

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ─── POST: Generate address for a FID ───
  if (req.method === 'POST') {
    const SEED_PHRASE = process.env.SEED_PHRASE;
    if (!SEED_PHRASE) {
      return res.status(500).json({
        error: 'Server configuration error. SEED_PHRASE not set.',
      });
    }

    try {
      const { fid, senderAddress } = req.body || {};
      if (!fid) {
        return res.status(400).json({ error: 'FID is required.' });
      }

      const index = parseInt(fid);
      const derivationPath = `m/44'/60'/0'/0/${index}`;
      const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);
      const childNode = hdNode.derivePath(derivationPath);
      const wallet = new ethers.Wallet(childNode);

      const idRegistry = getIdRegistryContract();

      // Validate: destination must NOT already own an FID
      const destFid = await idRegistry.idOf(wallet.address);
      if (!destFid.isZero()) {
        return res.status(400).json({
          error: `Destination already owns FID ${destFid.toString()}. Each address can only hold one FID.`,
        });
      }

      // Get recipient nonce from IdRegistry on Optimism
      const nonce = await idRegistry.nonces(wallet.address);

      // Deadline: 2 minutes from now
      const deadline = Math.floor(Date.now() / 1000) + 120;

      // Generate EIP-712 Transfer signature
      const transferSignature = await wallet._signTypedData(EIP712_DOMAIN, TRANSFER_TYPE, {
        fid: ethers.BigNumber.from(fid),
        to: wallet.address,
        nonce: nonce,
        deadline: ethers.BigNumber.from(deadline),
      });

      // Sign receipt message
      const receiptMessage = [
        `devin: FID Transfer Receipt`,
        `FID: ${fid}`,
        `From: ${senderAddress || 'unknown'}`,
        `To: ${wallet.address}`,
        `Index: ${index}`,
        `Time: ${new Date().toISOString()}`,
      ].join('\n');
      const recipientSignature = await wallet.signMessage(receiptMessage);

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

      // Check if already generated — update with fresh signature
      const existing = getAddressByFid(fid);
      if (existing) {
        existing.transferSignature = transferSignature;
        existing.transferDeadline = deadline;
        existing.transferNonce = nonce.toString();
        saveAddress(existing);
        return res.status(200).json({ success: true, ...existing });
      }

      saveAddress(entry);
      return res.status(200).json({ success: true, ...entry });

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
