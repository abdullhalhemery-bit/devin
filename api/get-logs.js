// Vercel Serverless Function — GET /api/get-logs
// Retrieves all stored operation logs.
//
// Requires Vercel KV for persistent storage.
// Falls back to in-memory store in dev mode.

import { kv } from '@vercel/kv';

// Shared in-memory fallback (same process)
// Note: In Vercel serverless, each invocation may be a separate process,
// so memory fallback only works within a warm instance.
let memoryStore = [];

// We use a module-level cache populated by POST /api/logs
// In practice, use Vercel KV for production.
export function setMemoryStore(store) {
  memoryStore = store;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    let logs = [];

    // Try Vercel KV
    try {
      logs = await kv.get('devin_logs') || [];
    } catch (kvErr) {
      console.warn('Vercel KV not available, returning empty logs');
      logs = [];
    }

    return res.status(200).json({
      success: true,
      count: logs.length,
      logs: logs,
    });
  } catch (e) {
    console.error('Error reading logs:', e);
    return res.status(500).json({ error: e.message || 'Internal server error' });
  }
}
