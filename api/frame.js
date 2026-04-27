// ═══════════════════════════════════════════════════════════
//  /api/frame — Farcaster Frame validation endpoint
//
//  Farcaster sends a POST here when the frame button is clicked.
//  Must return HTML with fc:frame meta tags.
// ═══════════════════════════════════════════════════════════

const FRAME_IMAGE = 'https://devin-pi.vercel.app/embed-preview.png';
const FRAME_URL = 'https://devin-pi.vercel.app';

function frameHTML() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta property="fc:frame" content="vNext" />
  <meta property="fc:frame:image" content="${FRAME_IMAGE}" />
  <meta property="fc:frame:image:aspect_ratio" content="1.91:1" />
  <meta property="fc:frame:button:1" content="Claim $DEV" />
  <meta property="fc:frame:button:1:action" content="link" />
  <meta property="fc:frame:button:1:target" content="${FRAME_URL}" />
  <meta property="fc:frame:post_url" content="${FRAME_URL}/api/frame" />
  <meta property="og:title" content="devin - Claim $DEV" />
  <meta property="og:image" content="${FRAME_IMAGE}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="${FRAME_IMAGE}" />
</head>
</html>`;
}

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'POST') {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(frameHTML());
  }
  return res.status(405).send('Method not allowed');
}
