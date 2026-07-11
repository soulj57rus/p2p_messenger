import { useEffect, useState, useRef } from 'preact/hooks';
import { useStore } from '@/store/useStore';
import { publicKeyToId } from '@/crypto/keys';
import { connectToSignal, waitForConnection, sendResolveUsername } from '@/p2p/connection';
import { AuthScreen } from './AuthScreen';
import { MainLayout } from './MainLayout';
import QRCode from 'qrcode';

export function App() {
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeQr, setWelcomeQr] = useState('');
  const [copied, setCopied] = useState(false);
  const loadKeys = useStore((s) => s.loadKeys);
  const setMyId = useStore((s) => s.setMyId);
  const myId = useStore((s) => s.myId);
  const myUsername = useStore((s) => s.myUsername);
  const pendingAddRef = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const addParam = new URLSearchParams(window.location.search).get('add');
        if (addParam) pendingAddRef.current = addParam;

        const hasKeys = await loadKeys();
        setLoading(false);
        if (hasKeys) {
          const id = useStore.getState().myId;
          if (id) connectToSignal(id);

          if (addParam) {
            const state = useStore.getState();
            if (state.myUsername && addParam === state.myUsername) {
              pendingAddRef.current = null;
              window.history.replaceState({}, '', window.location.pathname);
            } else {
              await waitForConnection(8000);
              await processAddUsername(addParam);
            }
          }
        }
      } catch (e) {
        setInitError('Failed to load keys');
        setLoading(false);
      }
    })();
  }, []);

  const processAddUsername = async (addParam: string) => {
    const clean = addParam.startsWith('@') ? addParam.slice(1) : addParam;
    const result = await sendResolveUsername(clean);
    if (result.peerId) {
      const createChat = useStore.getState().createChat;
      await createChat(result.peerId, `@${clean}`);
      useStore.getState().setActiveChat(result.peerId);
    }
    pendingAddRef.current = null;
    window.history.replaceState({}, '', window.location.pathname);
  };

  const handleAuth = async () => {
    const id = useStore.getState().myId;
    if (!id) return;

    const addParam = pendingAddRef.current;
    if (addParam) {
      const state = useStore.getState();
      if (state.myUsername && addParam === state.myUsername) {
        pendingAddRef.current = null;
        window.history.replaceState({}, '', window.location.pathname);
      } else {
        await processAddUsername(addParam);
        return;
      }
    }

    const inviteUrl = `${window.location.origin}${window.location.pathname}?add=${useStore.getState().myUsername}`;
    QRCode.toDataURL(inviteUrl, { width: 200, margin: 2, color: { dark: '#ffffff', light: '#00000000' } })
      .then(setWelcomeQr)
      .catch(() => {});
    setShowWelcome(true);
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
    return <AuthScreen onAuth={handleAuth} />;
  }

  if (showWelcome) {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?add=${myUsername}`;
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
            Добро пожаловать!
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
