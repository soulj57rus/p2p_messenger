import { useState } from 'preact/hooks';
import { sendSetUsername } from '@/p2p/connection';
import { useStore } from '@/store/useStore';

interface Props {
  onComplete: () => void;
  onSkip: () => void;
}

export function UsernameSetup({ onComplete, onSkip }: Props) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const saveUsername = useStore((s) => s.saveUsername);

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
      await saveUsername(result.username);
      onComplete();
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
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28, fontWeight: 700,
            color: 'var(--avatar-text)',
          }}>@</div>
          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
            Выберите имя пользователя
          </h2>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Ваше уникальное имя для поиска в мессенджере
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
          cursor: loading || !username ? 'default' : 'pointer', marginBottom: 12,
        }}>
          {loading ? 'Проверка...' : 'Установить'}
        </button>
        <button onClick={onSkip} style={{
          width: '100%', padding: '12px 24px', borderRadius: 8,
          border: '1px solid var(--border-color)', background: 'transparent',
          color: 'var(--text-secondary)', fontSize: 14, fontWeight: 500, cursor: 'pointer',
        }}>
          Пропустить
        </button>
        <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Имя можно будет изменить позже в настройках
        </div>
      </div>
    </div>
  );
}
