// ═══════════════════════════════════════════════════════════
//  /api/logs — handles both POST (save) and GET (retrieve)
//
//  POST: Saves an operation log entry to db/data.json
//  GET:  Returns all stored log entries.
//
//  Uses local JSON file database (persistent).
//  No external database needed (Vercel KV removed).
// ═══════════════════════════════════════════════════════════

import { addLog, getAllLogs } from '../lib/db';

export default async function handler(req, res) {
  // ─── POST: Save log ───
  if (req.method === 'POST') {
    try {
      const body = req.body;
      const { type, fid, from, to, txHash, address, block, timestamp, network, amount } = body;

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
        network: network || null,
        amount: amount || null,
        timestamp: timestamp || new Date().toISOString(),
      };

      addLog(entry);

      console.log(`[logs] POST type=${entry.type} fid=${entry.fid || '-'} tx=${entry.txHash || '-'}`);

      return res.status(200).json({ success: true, id: entry.id });
    } catch (e) {
      console.error('[logs] POST error:', e);
      return res.status(500).json({ error: e.message || 'Internal server error' });
    }
  }

  // ─── GET: Retrieve logs ───
  if (req.method === 'GET') {
    const logs = getAllLogs();
    return res.status(200).json({
      success: true,
      count: logs.length,
      logs,
    });
  }

  return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
}
