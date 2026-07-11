import { useState } from 'preact/hooks';
import { generateKeyPair, generateBoxKeyPair } from '@/crypto/keys';
import { sendSetUsername } from '@/p2p/connection';
import { useStore } from '@/store/useStore';
import { db } from '@/db';

interface Props {
  onAuth: () => void;
}

export function AuthScreen({ onAuth }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const saveKeys = useStore((s) => s.saveKeys);
  const saveUsername = useStore((s) => s.saveUsername);
  const setMyKeyPair = useStore((s) => s.setMyKeyPair);
  const setMyBoxKeyPair = useStore((s) => s.setMyBoxKeyPair);
  const setMyId = useStore((s) => s.setMyId);

  const validate = (val: string): string | null => {
    if (val.length < 3) return 'Минимум 3 символа';
    if (val.length > 32) return 'Максимум 32 символа';
    if (!/^[a-z]/.test(val)) return 'Должно начинаться с буквы';
    if (!/^[a-z][a-z0-9_]*$/.test(val)) return 'Только a-z, 0-9 и _';
    return null;
  };

  const handleChange = (val: string) => {
    const lower = val.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(lower);
    setError('');
  };

  const handleSubmit = async () => {
    const v = validate(username);
    if (v) { setError(v); return; }

    setLoading(true);
    const result = await sendSetUsername(username);
    setLoading(false);

    if (result.ok && result.username) {
      const kp = generateKeyPair();
      const boxKp = generateBoxKeyPair();
      setMyKeyPair(kp);
      setMyBoxKeyPair(boxKp);
      await saveKeys();
      await saveUsername(result.username);
      onAuth();
    } else {
      setError(result.error || 'Ошибка');
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', padding: 24, background: 'var(--bg-primary)',
    }}>
      <div style={{
        maxWidth: 400, width: '100%', padding: 32, borderRadius: 16,
        background: 'var(--bg-secondary)', boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28, fontWeight: 700,
            color: 'var(--avatar-text)',
          }}>P</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Secure Chat</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Введите имя пользователя для входа
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{
            display: 'flex', alignItems: 'center', padding: '10px 14px', borderRadius: 8,
            border: `1px solid ${error ? 'var(--danger)' : 'var(--border-color)'}`,
            background: 'var(--bg-input)',
          }}>
            <span style={{ fontSize: 16, color: 'var(--text-secondary)', marginRight: 4 }}>@</span>
            <input
              value={username}
              onInput={(e) => handleChange((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
              placeholder="username"
              maxLength={32}
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: 'var(--text-primary)', fontSize: 15, fontFamily: 'monospace',
              }}
            />
          </div>
          {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{error}</p>}
        </div>

        <button onClick={handleSubmit} disabled={loading || !username} style={{
          width: '100%', padding: '12px 24px', borderRadius: 8, border: 'none',
          background: loading || !username ? 'var(--text-secondary)' : 'var(--accent)',
          color: '#fff', fontSize: 15, fontWeight: 600,
          cursor: loading || !username ? 'default' : 'pointer',
        }}>
          {loading ? 'Вход...' : 'Войти'}
        </button>

        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Ваши ключи хранятся только на вашем устройстве
        </div>
      </div>
    </div>
  );
}
