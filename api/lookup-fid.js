// ═══════════════════════════════════════════════════════════
//  /api/lookup-fid — Look up FID and user info by wallet address
//
//  Uses Neynar API as primary source, blockchain as fallback.
//  Returns FID, username, display name, and custody address.
//
//  GET /api/lookup-fid?address=0x...
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';

const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const OPTIMISM_RPC = 'https://mainnet.optimism.io';
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || '';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  const { address } = req.query;
  if (!address || !address.startsWith('0x')) {
    return res.status(400).json({ error: 'Valid Ethereum address is required.' });
  }

  const checksumAddr = address.toLowerCase();

  try {
    // ─── Method 1: Neynar API (primary) ───
    if (NEYNAR_API_KEY) {
      try {
        const neynarResp = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${checksumAddr}`,
          {
            headers: {
              'api_key': NEYNAR_API_KEY,
              'Accept': 'application/json',
            },
          }
        );

        if (neynarResp.ok) {
          const neynarData = await neynarResp.json();

          // Neynar returns { address: [ { fid, username, ... } ] }
          const userEntries = neynarData[checksumAddr] || neynarData[address] || [];

          if (userEntries.length > 0) {
            const user = userEntries[0];
            console.log(`[lookup-fid] Neynar: address=${checksumAddr} fid=${user.fid} username=${user.username}`);

            return res.status(200).json({
              success: true,
              source: 'neynar',
              fid: user.fid,
              username: user.username || null,
              displayName: user.display_name || null,
              pfpUrl: user.pfp_url || null,
              custodyAddress: user.custody_address || address,
              address: checksumAddr,
            });
          }
        }
      } catch (neynarErr) {
        console.warn('[lookup-fid] Neynar API error:', neynarErr.message);
      }
    }

    // ─── Method 2: Blockchain (fallback) ───
    const provider = new ethers.providers.JsonRpcProvider(OPTIMISM_RPC);
    const idRegistry = new ethers.Contract(ID_REGISTRY, [
      'function idOf(address owner) view returns (uint256)',
    ], provider);

    const fid = await idRegistry.idOf(checksumAddr);
    const fidNum = fid.toNumber();

    if (fidNum && fidNum > 0) {
      console.log(`[lookup-fid] Blockchain: address=${checksumAddr} fid=${fidNum}`);
      return res.status(200).json({
        success: true,
        source: 'blockchain',
        fid: fidNum,
        username: null,
        displayName: null,
        pfpUrl: null,
        custodyAddress: checksumAddr,
        address: checksumAddr,
      });
    }

    // No FID found
    return res.status(200).json({
      success: false,
      source: 'none',
      fid: null,
      address: checksumAddr,
      message: 'No FID found for this address.',
    });

  } catch (e) {
    console.error('[lookup-fid] Error:', e.message);
    return res.status(500).json({ error: e.message || 'Failed to lookup FID.' });
  }
}
