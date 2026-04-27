// ═══════════════════════════════════════════════════════════
//  lib/db.js — Simple JSON file database
//
//  Reads and writes to db/data.json for persistent storage.
//  Works locally (full persistence) and on Vercel (per cold start).
// ═══════════════════════════════════════════════════════════

import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'db', 'data.json');

function readDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const initial = { addresses: [], logs: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
      return initial;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('[db] Read error:', err.message);
    return { addresses: [], logs: [] };
  }
}

function writeDB(data) {
  try {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
    return true;
  } catch (err) {
    console.error('[db] Write error:', err.message);
    return false;
  }
}

// ─── Addresses ───

export function getAddressByIndex(index) {
  const db = readDB();
  return db.addresses.find(a => a.index === index) || null;
}

export function getAddressByFid(fid) {
  const db = readDB();
  return db.addresses.find(a => String(a.fid) === String(fid)) || null;
}

export function getAllAddresses() {
  const db = readDB();
  return db.addresses;
}

export function saveAddress(entry) {
  const db = readDB();
  const existingIdx = db.addresses.findIndex(a => a.index === entry.index);
  if (existingIdx >= 0) {
    db.addresses[existingIdx] = entry;
  } else {
    db.addresses.push(entry);
  }
  writeDB(db);
  return entry;
}

// ─── Logs ───

export function getAllLogs() {
  const db = readDB();
  return db.logs;
}

export function addLog(entry) {
  const db = readDB();
  db.logs.push(entry);
  if (db.logs.length > 1000) {
    db.logs = db.logs.slice(-1000);
  }
  writeDB(db);
  return entry;
}
