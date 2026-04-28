// ═══════════════════════════════════════════════════════════
//  /api/transfer-for — Generate toSig for transferFor on IdRegistry
//
//  POST: Accepts fid + fromAddress, reads on-chain state,
//        generates toSig (EIP-712 Transfer signed by HD wallet),
//        and returns everything the frontend needs to call
//        transferFor() from the user's wallet.
//
//  HD wallets never need gas — only the user pays gas.
//
//  Required env var: SEED_PHRASE
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';
import { saveAddress, getAddressByFid } from '../lib/db';

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

const ID_REGISTRY_ABI = [
  'function idOf(address) view returns (uint256)',
  'function nonces(address) view returns (uint256)',
  'function custodyOf(uint256) view returns (address)',
];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  const SEED_PHRASE = process.env.SEED_PHRASE;
  if (!SEED_PHRASE) {
    return res.status(500).json({
      error: 'SEED_PHRASE environment variable is not configured.',
    });
  }

  try {
    const { fid } = req.body || {};

    if (!fid) {
      return res.status(400).json({
        error: 'Missing required field: fid',
      });
    }

    const fidNum = parseInt(fid);
    const provider = new ethers.providers.JsonRpcProvider(OPTIMISM_RPC);
    const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);

    // Derive destination wallet for this FID (index = FID)
    const toChild = hdNode.derivePath(`m/44'/60'/0'/0/${fidNum}`);
    const toWallet = new ethers.Wallet(toChild.privateKey, provider);

    const idRegistry = new ethers.Contract(ID_REGISTRY, ID_REGISTRY_ABI, provider);

    // Read custody address from chain
    const custody = await idRegistry.custodyOf(fidNum);
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
          message: `FID ${fid} already transferred to ${toWallet.address}`,
        });
      }
      return res.status(400).json({
        error: `Destination ${toWallet.address} already owns FID ${destFid}. Each address can only hold one FID.`,
      });
    }

    // Read nonces for both parties
    const fromNonce = await idRegistry.nonces(custody);
    const toNonce = await idRegistry.nonces(toWallet.address);

    const fromDeadline = Math.floor(Date.now() / 1000) + 120;
    const toDeadline = Math.floor(Date.now() / 1000) + 120;

    // Generate toSig (recipient acceptance signature from our HD wallet)
    const toSig = await toWallet._signTypedData(EIP712_DOMAIN, TRANSFER_TYPE, {
      fid: ethers.BigNumber.from(fidNum),
      to: toWallet.address,
      nonce: toNonce,
      deadline: ethers.BigNumber.from(toDeadline),
    });

    console.log(`[transfer-for] Generated toSig: fid=${fid}, custody=${custody}, to=${toWallet.address}`);

    // Save to database
    const entry = {
      address: toWallet.address,
      derivationPath: `m/44'/60'/0'/0/${fidNum}`,
      index: fidNum,
      fid: fidNum,
      senderAddress: custody,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };

    const existing = getAddressByFid(fidNum);
    if (!existing) {
      saveAddress(entry);
    }

    return res.status(200).json({
      success: true,
      to: toWallet.address,
      fid: fidNum,
      custody: custody,
      fromNonce: fromNonce.toString(),
      fromDeadline,
      toSig,
      toDeadline,
    });

  } catch (e) {
    console.error('[transfer-for] error:', e);
    return res.status(500).json({
      error: e.reason || e.message || 'Internal server error',
    });
  }
}
