// ═══════════════════════════════════════════════════════════
//  /api/frame — Farcaster Frame server endpoint
//
//  Required for Farcaster to validate and render the frame
//  when shared as a cast. Returns the frame HTML metadata.
// ═══════════════════════════════════════════════════════════

const FRAME_IMAGE = 'https://devin-pi.vercel.app/embed-preview.png';
const FRAME_URL = 'https://devin-pi.vercel.app';

function buildFrameHTML() {
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
<body>Frame validated</body>
</html>`;
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(buildFrameHTML());
  }

  if (req.method === 'POST') {
    // Farcaster sends a POST with untrustedData when button is clicked
    const body = req.body || {};
    const untrustedData = body.untrustedData || {};

    console.log('[frame] POST:', JSON.stringify({
      fid: untrustedData.fid,
      buttonIndex: untrustedData.buttonIndex,
      inputText: untrustedData.inputText,
      castId: untrustedData.castId,
    }));

    // Return frame HTML that redirects to the app
    res.setHeader('Content-Type', 'text/html');
    return res.status(200).send(buildFrameHTML());
  }

  return res.status(405).json({ error: 'Method not allowed.' });
}
