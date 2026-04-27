// ═══════════════════════════════════════════════════════════
//  POST /api/generate-address
//
//  Generates a NEW destination address from the HD wallet seed phrase.
//  Each FID transfer gets a unique address so no address exceeds 2 FIDs.
//
//  The generated address also signs a "receipt" message containing
//  the sender's FID and custody address.
//
//  Required env var:  SEED_PHRASE
//  Optional env var:  KV_REST_API_URL + KV_REST_API_TOKEN (Vercel KV)
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';

let memoryIndex = 0;
let memoryAddresses = [];

async function getKV() {
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const SEED_PHRASE = process.env.SEED_PHRASE;
  if (!SEED_PHRASE) {
    return res.status(500).json({
      error: 'SEED_PHRASE environment variable is not configured.',
      hint: 'Set it in Vercel Dashboard → Settings → Environment Variables.',
    });
  }

  try {
    const { fid, senderAddress } = req.body || {};

    // ── Get next derivation index ──
    let index = memoryIndex;
    const kv = await getKV();

    if (kv) {
      try {
        index = (await kv.get('devin_next_index')) || 0;
      } catch { /* use memory fallback */ }
    }

    // ── Derive address from HD wallet ──
    const derivationPath = `m/44'/60'/0'/0/${index}`;
    const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);
    const childNode = hdNode.derivePath(derivationPath);
    const wallet = new ethers.Wallet(childNode);

    // ── Recipient signs a message containing sender's FID + address ──
    const receiptMessage = [
      `devin: FID Transfer Receipt`,
      `FID: ${fid || 'N/A'}`,
      `From: ${senderAddress || 'unknown'}`,
      `To: ${wallet.address}`,
      `Index: ${index}`,
      `Time: ${new Date().toISOString()}`,
    ].join('\n');

    const recipientSignature = await wallet.signMessage(receiptMessage);

    // ── Store mapping ──
    const entry = {
      address: wallet.address,
      derivationPath,
      index,
      fid: fid || null,
      senderAddress: senderAddress || null,
      recipientSignature,
      receiptMessage,
      timestamp: new Date().toISOString(),
      status: 'pending',  // pending → transferred → claimed
    };

    if (kv) {
      try {
        await kv.set(`devin_addr_${index}`, entry);
        await kv.set('devin_next_index', index + 1);
      } catch (e) {
        console.warn('KV write failed, using memory:', e.message);
      }
    } else {
      memoryAddresses.push(entry);
      memoryIndex = index + 1;
    }

    console.log(`[generate-address] index=${index} fid=${fid} addr=${wallet.address} from=${senderAddress}`);

    return res.status(200).json({
      success: true,
      address: wallet.address,
      derivationPath,
      index,
      fid,
      senderAddress,
      recipientSignature,
      receiptMessage,
    });

  } catch (e) {
    console.error('[generate-address] Error:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
