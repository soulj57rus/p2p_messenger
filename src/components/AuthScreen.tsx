import { useState } from 'preact/hooks';

interface Props {
  onAuth: (kp: { publicKey: Uint8Array; secretKey: Uint8Array }) => void;
  onImport: (encoded: string) => void;
  onGenerate: () => void;
}

export function AuthScreen({ onAuth, onImport, onGenerate }: Props) {
  const [importMode, setImportMode] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [error, setError] = useState('');

  const handleImport = () => {
    if (!importKey.trim()) {
      setError('Введите ключ');
      return;
    }
    onImport(importKey.trim());
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
          <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>P2P Messenger</h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Полностью децентрализованный мессенджер со сквозным шифрованием
          </p>
        </div>

        {!importMode ? (
          <>
            <button onClick={onGenerate} style={{
              width: '100%', padding: '12px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', marginBottom: 12, transition: 'opacity 0.15s',
            }}
              onMouseOver={e => (e.currentTarget.style.opacity = '0.9')}
              onMouseOut={e => (e.currentTarget.style.opacity = '1')}
            >
              Создать новый аккаунт
            </button>
            <button onClick={() => setImportMode(true)} style={{
              width: '100%', padding: '12px 24px', borderRadius: 8, border: '1px solid var(--border-color)',
              background: 'transparent', color: 'var(--text-primary)', fontSize: 15, fontWeight: 500,
              cursor: 'pointer',
            }}>
              Восстановить из ключа
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Введите ваш приватный ключ
              </label>
              <textarea
                value={importKey}
                onChange={e => { setImportKey((e.target as HTMLTextAreaElement).value); setError(''); }}
                style={{
                  width: '100%', height: 100, padding: 12, borderRadius: 8,
                  border: `1px solid ${error ? 'var(--danger)' : 'var(--border-color)'}`,
                  background: 'var(--bg-input)', color: 'var(--text-primary)',
                  fontSize: 13, resize: 'none', fontFamily: 'monospace',
                }}
                placeholder="Вставьте ключ..."
              />
              {error && <p style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>{error}</p>}
            </div>
            <button onClick={handleImport} style={{
              width: '100%', padding: '12px 24px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 600,
              cursor: 'pointer', marginBottom: 12,
            }}>
              Восстановить
            </button>
            <button onClick={() => { setImportMode(false); setError(''); }} style={{
              width: '100%', padding: '12px 24px', borderRadius: 8, border: '1px solid var(--border-color)',
              background: 'transparent', color: 'var(--text-primary)', fontSize: 15, fontWeight: 500,
              cursor: 'pointer',
            }}>
              Назад
            </button>
          </>
        )}

        <div style={{ marginTop: 24, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'center' }}>
          Ваши ключи хранятся только на вашем устройстве
        </div>
      </div>
    </div>
  );
}
