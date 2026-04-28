// ═══════════════════════════════════════════════════════════
//  /api/logs — handles both POST (save) and GET (retrieve)
//
//  POST: Saves an operation log entry
//  GET:  Returns all stored log entries.
// ═══════════════════════════════════════════════════════════

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

function addLog(entry) {
  try {
    const db = readDB();
    db.logs.push(entry);
    if (db.logs.length > 1000) db.logs = db.logs.slice(-1000);
    writeDB(db);
  } catch (err) { console.error('[db] addLog error:', err.message); }
}

function getAllLogs() {
  return readDB().logs;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ─── POST: Save log ───
  if (req.method === 'POST') {
    try {
      const body = req.body || {};
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
