// ═══════════════════════════════════════════════════════════
//  GET /api/get-addresses
//
//  Returns all generated HD wallet addresses and their FID mappings.
//  Used by the admin dashboard.
// ═══════════════════════════════════════════════════════════

async function getKV() {
  try {
    const { kv } = await import('@vercel/kv');
    return kv;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    const kv = await getKV();
    const addresses = [];

    if (kv) {
      const index = (await kv.get('devin_next_index')) || 0;

      for (let i = 0; i < index; i++) {
        try {
          const entry = await kv.get(`devin_addr_${i}`);
          if (entry) addresses.push(entry);
        } catch {}
      }
    }

    return res.status(200).json({
      success: true,
      total: addresses.length,
      addresses,
    });

  } catch (e) {
    console.error('[get-addresses] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
