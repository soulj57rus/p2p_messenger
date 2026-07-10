import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@/store/useStore';
import { generateKeyPair, publicKeyToId } from '@/crypto/keys';
import { connectToSignal } from '@/p2p/connection';
import { AuthScreen } from './AuthScreen';
import { MainLayout } from './MainLayout';

export function App() {
  const [loading, setLoading] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);
  const loadKeys = useStore((s) => s.loadKeys);
  const saveKeys = useStore((s) => s.saveKeys);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);
  const setMyId = useStore((s) => s.setMyId);
  const myId = useStore((s) => s.myId);

  useEffect(() => {
    (async () => {
      try {
        const hasKeys = await loadKeys();
        if (!hasKeys) {
          setLoading(false);
          return;
        }
        setLoading(false);
      } catch (e) {
        setInitError('Failed to load keys');
        setLoading(false);
      }
    })();
  }, []);

  const handleAuth = async (kp: { publicKey: Uint8Array; secretKey: Uint8Array }) => {
    const id = publicKeyToId(kp.publicKey);
    setMyId(id);
    setMyKeyPair(kp);
    await saveKeys();
    connectToSignal(id);
  };

  const handleImport = async (encoded: string) => {
    const { importKeyPair } = await import('@/crypto/keys');
    const kp = importKeyPair(encoded);
    await handleAuth(kp);
  };

  const handleGenerate = async () => {
    const kp = generateKeyPair();
    await handleAuth(kp);
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

  return <MainLayout />;
}
