// Vercel Serverless Function — POST /api/logs
// Stores an operation log entry using Vercel KV (Redis).
//
// Setup (one-time):
//   1. Install:          npm i @vercel/kv
//   2. Create KV store:  vercel kv new
//   3. Link to project:  vercel link
//   4. (env vars KV_REST_API_URL and KV_REST_API_TOKEN are set automatically by Vercel)
//
// If Vercel KV is not configured, this falls back to a simple in-memory store
// (data is lost on cold starts — suitable for dev only).

import { kv } from '@vercel/kv';

// In-memory fallback for dev
let memoryStore = [];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  try {
    const body = req.body;
    const { type, fid, from, to, txHash, address, block, timestamp } = body;

    if (!type) {
      return res.status(400).json({ error: 'Missing required field: type' });
    }

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type: type || 'verify',
      fid: fid || null,
      from: from || null,
      to: to || address || null,
      txHash: txHash || null,
      block: block || null,
      timestamp: timestamp || new Date().toISOString(),
    };

    // Try Vercel KV first
    try {
      const existing = await kv.get('devin_logs') || [];
      existing.push(entry);
      // Keep max 1000 entries
      if (existing.length > 1000) {
        existing.splice(0, existing.length - 1000);
      }
      await kv.set('devin_logs', existing, { ex: 86400 * 30 }); // 30 day TTL
    } catch (kvErr) {
      // Fallback to memory
      console.warn('Vercel KV not available, using in-memory store:', kvErr.message);
      memoryStore.push(entry);
      if (memoryStore.length > 1000) memoryStore.splice(0, memoryStore.length - 1000);
    }

    return res.status(200).json({ success: true, id: entry.id });
  } catch (e) {
    console.error('Error saving log:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
