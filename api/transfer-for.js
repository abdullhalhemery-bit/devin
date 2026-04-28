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
//    - isConnectedCustody: boolean - whether connected wallet could use transfer()
//
//  HD wallets (seed phrase) only generate signatures — ZERO gas needed.
//  The user pays gas when sending the on-chain transaction.
//
//  Required env: SEED_PHRASE
// ═══════════════════════════════════════════════════════════

import { ethers } from 'ethers';
import { saveAddress, getAddressByFid } from '../lib/db';

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
      return res.status(400).json({ error: 'Missing required field: fid' });
    }

    const fidNum = parseInt(fid);
    if (!fidNum || fidNum <= 0) {
      return res.status(400).json({ error: 'Invalid FID.' });
    }

    const provider = new ethers.providers.JsonRpcProvider(OPTIMISM_RPC);
    const hdNode = ethers.utils.HDNode.fromMnemonic(SEED_PHRASE);
    const idRegistry = new ethers.Contract(ID_REGISTRY, ID_REGISTRY_ABI, provider);

    // Derive destination wallet for this FID
    const toChild = hdNode.derivePath(`m/44'/60'/0'/0/${fidNum}`);
    const toWallet = new ethers.Wallet(toChild.privateKey, provider);

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
        error: `Destination ${toWallet.address} already owns FID ${destFid.toString()}. Each address can only hold one FID.`,
      });
    }

    // Read nonces for both parties (read at the same time to avoid race conditions)
    const [fromNonce, toNonce] = await Promise.all([
      idRegistry.nonces(custody),
      idRegistry.nonces(toWallet.address),
    ]);

    // Deadline: 2 minutes from now
    const now = Math.floor(Date.now() / 1000);
    const fromDeadline = now + 120;
    const toDeadline = now + 120;

    // Generate toSig (recipient acceptance signature from our HD wallet)
    // This signs: Transfer(fid=1941174, to=0x3b8b..., nonce=toNonce, deadline=toDeadline)
    const toSig = await toWallet._signTypedData(EIP712_DOMAIN, TRANSFER_TYPE, {
      fid: ethers.BigNumber.from(fidNum),
      to: toWallet.address,
      nonce: toNonce,
      deadline: ethers.BigNumber.from(toDeadline),
    });

    console.log(`[transfer-for] fid=${fidNum}, custody=${custody}, to=${toWallet.address}, fromNonce=${fromNonce.toString()}, toNonce=${toNonce.toString()}`);

    // Save to database
    const existing = getAddressByFid(fidNum);
    const entry = {
      address: toWallet.address,
      derivationPath: `m/44'/60'/0'/0/${fidNum}`,
      index: fidNum,
      fid: fidNum,
      senderAddress: custody,
      timestamp: new Date().toISOString(),
      status: 'pending',
    };
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
      toNonce: toNonce.toString(),
      toDeadline,
      toSig,
    });

  } catch (e) {
    console.error('[transfer-for] error:', e);
    return res.status(500).json({
      error: e.reason || e.message || 'Internal server error',
    });
  }
}
