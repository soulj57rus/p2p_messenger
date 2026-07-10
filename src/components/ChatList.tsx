import { useEffect, useState } from 'preact/hooks';
import { useStore } from '@/store/useStore';
import { type Chat } from '@/db';
import { exportKeyPair } from '@/crypto/keys';

export function ChatList() {
  const myId = useStore((s) => s.myId);
  const activeChat = useStore((s) => s.activeChat);
  const setActiveChat = useStore((s) => s.setActiveChat);
  const onlinePeers = useStore((s) => s.onlinePeers);
  const myKeyPair = useStore((s) => s.myKeyPair);
  const createChat = useStore((s) => s.createChat);
  const storeChats = useStore((s) => s.chats);
  const [addPeerInput, setAddPeerInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [exportedKey, setExportedKey] = useState('');

  useEffect(() => {
    if (myKeyPair) {
      setExportedKey(exportKeyPair(myKeyPair));
    }
  }, [myKeyPair]);

  const handleAddPeer = async () => {
    if (!addPeerInput.trim()) return;
    const peerId = addPeerInput.trim();
    await createChat(peerId, peerId.slice(0, 16) + '...');
    setAddPeerInput('');
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(exportedKey);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-secondary)',
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)' }}>P2P Chat</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: useStore.getState().online ? 'var(--online)' : 'var(--text-secondary)',
          }} />
          <button onClick={() => {
            const current = document.documentElement.getAttribute('data-theme');
            const next = current === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
          }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 16 }}
            title="Переключить тему"
          >
            <i class="fas fa-moon" />
          </button>
          <button onClick={() => setShowSettings(!showSettings)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 18 }}
            title="Настройки"
          >
            <i class="fas fa-cog" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div style={{ padding: 16, borderBottom: '1px solid var(--border-color)', fontSize: 13 }}>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Ваш публичный ключ (ID)</div>
            <div style={{
              padding: 8, borderRadius: 6, background: 'var(--bg-input)',
              fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all',
              maxHeight: 60, overflow: 'auto',
              color: 'var(--text-primary)',
            }}>
              {myId}
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Приватный ключ (для импорта)</div>
            <textarea readOnly value={exportedKey}
              style={{
                width: '100%', height: 60, padding: 8, borderRadius: 6,
                border: '1px solid var(--border-color)',
                background: 'var(--bg-input)', color: 'var(--text-primary)',
                fontFamily: 'monospace', fontSize: 10, resize: 'none',
              }}
            />
          </div>
          <button onClick={handleCopyKey}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 12, cursor: 'pointer',
            }}
          >
            Копировать ключ
          </button>
        </div>
      )}

      {/* Add peer */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border-color)' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={addPeerInput}
            onChange={e => setAddPeerInput((e.target as HTMLInputElement).value)}
            placeholder="Введите ID собеседника..."
            style={{
              flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)',
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              fontSize: 13, outline: 'none',
            }}
            onKeyDown={e => { if (e.key === 'Enter') handleAddPeer(); }}
          />
          <button onClick={handleAddPeer}
            style={{
              padding: '8px 16px', borderRadius: 8, border: 'none',
              background: 'var(--accent)', color: '#fff', fontSize: 13, cursor: 'pointer',
            }}
          >
            +
          </button>
        </div>
      </div>

      {/* Chat list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {storeChats.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14,
          }}>
            Введите ID собеседника выше, чтобы начать чат
          </div>
        ) : (
          storeChats.map(chat => (
            <div
              key={chat.id}
              onClick={() => setActiveChat(chat.peerId)}
              style={{
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
                cursor: 'pointer', background: chat.peerId === activeChat ? 'var(--bg-active)' : 'transparent',
                transition: 'background 0.1s',
                borderBottom: '1px solid var(--border-color)',
              }}
              onMouseOver={e => { if (chat.peerId !== activeChat) e.currentTarget.style.background = 'var(--bg-hover)'; }}
              onMouseOut={e => { if (chat.peerId !== activeChat) e.currentTarget.style.background = 'transparent'; }}
            >
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--avatar-bg)', color: 'var(--avatar-text)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 600, flexShrink: 0,
                position: 'relative',
              }}>
                {(chat.displayName || chat.peerId)[0].toUpperCase()}
                {onlinePeers.includes(chat.peerId) && (
                  <div style={{
                    position: 'absolute', bottom: 0, right: 0, width: 12, height: 12,
                    borderRadius: '50%', background: 'var(--online)', border: '2px solid var(--bg-secondary)',
                  }} />
                )}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>
                    {chat.displayName}
                  </span>
                  {chat.lastMessageTime && (
                    <span style={{ fontSize: 11, color: 'var(--text-time)' }}>
                      {new Date(chat.lastMessageTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  {chat.typing ? (
                    <span style={{ fontSize: 13, color: 'var(--typing)', fontStyle: 'italic' }}>печатает...</span>
                  ) : (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {chat.lastMessage || 'Нет сообщений'}
                    </span>
                  )}
                </div>
              </div>
              {chat.unread > 0 && (
                <div style={{
                  background: 'var(--unread-badge)', color: '#fff',
                  borderRadius: 12, padding: '2px 8px', fontSize: 11, fontWeight: 600,
                  minWidth: 20, textAlign: 'center',
                }}>
                  {chat.unread}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
