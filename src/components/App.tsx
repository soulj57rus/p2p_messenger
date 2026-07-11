import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@/store/useStore';
import { generateKeyPair, publicKeyToId } from '@/crypto/keys';
import { connectToSignal } from '@/p2p/connection';
import { AuthScreen } from './AuthScreen';
import { MainLayout } from './MainLayout';
import { UsernameSetup } from './UsernameSetup';
import QRCode from 'qrcode';

export function App() {
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [showUsernameSetup, setShowUsernameSetup] = useState(false);
  const [welcomeQr, setWelcomeQr] = useState('');
  const [copied, setCopied] = useState(false);
  const loadKeys = useStore((s) => s.loadKeys);
  const saveKeys = useStore((s) => s.saveKeys);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);
  const setMyId = useStore((s) => s.setMyId);
  const myId = useStore((s) => s.myId);

  useEffect(() => {
    (async () => {
      try {
        const hasKeys = await loadKeys();
        setLoading(false);
        if (hasKeys) {
          const id = useStore.getState().myId;
          if (id) connectToSignal(id);
        }
      } catch (e) {
        setInitError('Failed to load keys');
        setLoading(false);
      }
    })();
  }, []);

  const handleAuth = async (kp: { publicKey: Uint8Array; secretKey: Uint8Array }, isNew = false) => {
    const id = publicKeyToId(kp.publicKey);
    setMyId(id);
    setMyKeyPair(kp);
    await saveKeys();
    connectToSignal(id);
    if (isNew) {
      setShowUsernameSetup(true);
    }
  };

  const handleUsernameComplete = async () => {
    setShowUsernameSetup(false);
    const id = useStore.getState().myId;
    if (id) {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?add=${id}`;
      QRCode.toDataURL(inviteUrl, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#00000000' } })
        .then(setWelcomeQr)
        .catch(() => {});
      setShowWelcome(true);
    }
  };

  const handleUsernameSkip = () => {
    setShowUsernameSetup(false);
    const id = useStore.getState().myId;
    if (id) {
      const inviteUrl = `${window.location.origin}${window.location.pathname}?add=${id}`;
      QRCode.toDataURL(inviteUrl, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#00000000' } })
        .then(setWelcomeQr)
        .catch(() => {});
      setShowWelcome(true);
    }
  };

  const handleImport = async (encoded: string) => {
    const { importKeyPair } = await import('@/crypto/keys');
    const kp = importKeyPair(encoded);
    await handleAuth(kp, false);
  };

  const handleGenerate = async () => {
    const kp = generateKeyPair();
    await handleAuth(kp, true);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', background: 'var(--bg-primary)' }}>
        <div style={{ textAlign: 'center' }}>
          <div class="skeleton" style={{ width: 48, height: 48, borderRadius: '50%', margin: '0 auto 16px' }} />
          <div class="skeleton" style={{ width: 160, height: 16, margin: '0 auto 8px' }} />
          <div class="skeleton" style={{ width: 120, height: 12, margin: '0 auto' }} />
        </div>
      </div>
    );
  }

  if (initError) {
    return <div style={{ padding: 24, textAlign: 'center', color: 'var(--danger)' }}>{initError}</div>;
  }

  if (!myId) {
    return <AuthScreen onAuth={handleAuth} onImport={handleImport} onGenerate={handleGenerate} />;
  }

  if (showUsernameSetup) {
    return <UsernameSetup onComplete={handleUsernameComplete} onSkip={handleUsernameSkip} />;
  }

  if (showWelcome) {
    const myUsername = useStore.getState().myUsername;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?add=${myId}`;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        height: '100%', padding: 24, background: 'var(--bg-primary)',
      }}>
        <div style={{
          maxWidth: 400, width: '100%', padding: 32, borderRadius: 16,
          background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            Аккаунт создан!
          </h2>
          {myUsername && (
            <div style={{
              fontSize: 16, fontWeight: 600, color: 'var(--accent)', marginBottom: 8,
            }}>
              @{myUsername}
            </div>
          )}
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 20 }}>
            Отправьте этот QR-код или ссылку собеседнику
          </p>
          {welcomeQr && (
            <img src={welcomeQr} alt="QR" style={{
              width: 200, height: 200, borderRadius: 12, background: 'var(--bg-input)', marginBottom: 16,
            }} />
          )}
          <div style={{
            padding: 10, borderRadius: 8, background: 'var(--bg-input)',
            fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all',
            maxHeight: 80, overflow: 'auto', marginBottom: 16, textAlign: 'left',
            color: 'var(--text-primary)',
          }}>
            {inviteUrl}
          </div>
          <button onClick={async () => {
            await navigator.clipboard.writeText(inviteUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }} style={{
            width: '100%', padding: '10px 24px', borderRadius: 8, border: 'none',
            background: copied ? 'var(--online)' : 'var(--accent)', color: '#fff',
            fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 12,
          }}>
            {copied ? 'Скопировано!' : 'Копировать ссылку'}
          </button>
          <button onClick={() => setShowWelcome(false)} style={{
            width: '100%', padding: '10px 24px', borderRadius: 8,
            border: '1px solid var(--border-color)', background: 'transparent',
            color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
          }}>
            Продолжить
          </button>
        </div>
      </div>
    );
  }

  return <MainLayout />;
}
