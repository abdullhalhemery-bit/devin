// ═══════════════════════════════════════════════════════════
//  /api/addresses — handles both POST (generate) and GET (list)
//
//  POST: Generates a destination address from HD wallet using the FID as index.
//        Each FID deterministically maps to the same address.
//        Data is saved to db/data.json (persistent local database).
//
//  GET:  Returns all generated addresses.
//
//  Required env var: SEED_PHRASE
//  No external database needed (Vercel KV removed).
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';
import { saveAddress, getAddressByFid, getAllAddresses } from '../lib/db';

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

      // Check if already generated for this FID (idempotent)
      const existing = getAddressByFid(fid);
      if (existing) {
        console.log(`[addresses] Existing index=${existing.index} fid=${fid} addr=${existing.address}`);
        return res.status(200).json({
          success: true,
          ...existing,
        });
      }

      // Use FID directly as derivation index
      const index = parseInt(fid);
      const derivationPath = `m/44'/60'/0'/0/${index}`;
      const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);
      const childNode = hdNode.derivePath(derivationPath);
      const wallet = new ethers.Wallet(childNode);

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

      // Save to database
      const entry = {
        address: wallet.address,
        derivationPath,
        index,
        fid,
        senderAddress: senderAddress || null,
        recipientSignature,
        timestamp: new Date().toISOString(),
        status: 'pending',
      };

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
