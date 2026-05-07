# Testing the devin Farcaster Mini App

## Overview
This is a Vite + React app deployed on Vercel that runs as a Farcaster Frame/Mini App. It uses `@farcaster/miniapp-sdk` for in-app wallet connection and `@farcaster/auth-kit` for browser QR code sign-in.

## Environments
- **Production:** https://devin-pi.vercel.app
- **Preview:** Vercel generates preview URLs for each PR branch (check PR comments from vercel[bot])
- **Local dev:** `npm run dev` starts Vite dev server on port 5173

## Build & Dev Commands
- `npm install` — install dependencies
- `npm run dev` — start local dev server (Vite, port 5173)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview production build locally

## Testing Constraints
- **Farcaster mini-app mode** (auto-connect, haptics, wallet provider via SDK) can ONLY be tested inside Warpcast on a phone. The `sdk.isInMiniApp()` check will always return false in a regular browser.
- **QR code scanning** requires the Warpcast mobile app. In browser testing, you can verify the QR code renders and the SIWF URL is valid, but cannot complete the sign-in flow.
- **Transaction signing** requires a connected wallet. In browser mode without completing QR sign-in, transaction buttons are disabled (`!address` check).
- **Transaction QR modals** (shown in browser mode for Step 1/Step 2) can only be triggered after a wallet is connected via Farcaster sign-in.

## What CAN Be Tested in Browser
1. Page loads correctly with terminal-style UI
2. "Connect via Farcaster" button appears (not old "Connect Wallet")
3. No MetaMask/Rabby options exist in the DOM
4. QR modal opens with correct title, QR code SVG, and valid `farcaster.xyz/~/siwf` URL
5. Modal close behavior works correctly
6. Step 1 button is correctly disabled without wallet connection
7. Terminal panel shows `frame: browser` in browser mode
8. Notice text shows appropriate browser mode message

## Key Architecture
- `src/main.jsx` — Single-file React app with all components
- `AuthKitProvider` wraps the app for Farcaster auth (relay: `https://relay.farcaster.xyz`)
- `FarcasterSignInModal` — Uses `useSignIn` hook from auth-kit, renders QR via `qrcode.react`
- `TransactionQRModal` — Shows Warpcast deep link QR for transaction approval
- Browser detection: `sdk.isInMiniApp()` determines mini-app vs browser mode
- API routes in `api/` directory (Vercel serverless functions)

## Devin Secrets Needed
No secrets are needed for frontend testing. The app's API routes require:
- `SEED_PHRASE` — HD wallet seed for generating destination addresses (backend only)
- `NEYNAR_API_KEY` — Optional, for FID/username lookup (backend only)
