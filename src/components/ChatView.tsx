import { useEffect, useRef, useState } from 'preact/hooks';
import { useStore } from '@/store/useStore';
import { db, type Message } from '@/db';

interface Props {
  chatId: string;
  onBack: () => void;
  isMobile: boolean;
}

export function ChatView({ chatId, onBack, isMobile }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [chatName, setChatName] = useState('');
  const myId = useStore((s) => s.myId);
  const sendTextMessage = useStore((s) => s.sendTextMessage);
  const sendFileMessage = useStore((s) => s.sendFileMessage);
  const markAsRead = useStore((s) => s.markAsRead);
  const setTyping = useStore((s) => s.setTyping);
  const onlinePeers = useStore((s) => s.onlinePeers);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeout = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const msgs = await db.messages.where({ chatId }).sortBy('timestamp');
      if (!cancelled) setMessages(msgs);
      await markAsRead(chatId);
    };
    load();

    (async () => {
      const chat = await db.chats.get(chatId);
      if (chat && !cancelled) setChatName(chat.displayName);
    })();

    const id = setInterval(load, 1500);
    return () => { cancelled = true; clearInterval(id); };
  }, [chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    await sendTextMessage(chatId, input.trim());
    setInput('');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInputChange = (e: Event) => {
    const val = (e.target as HTMLTextAreaElement).value;
    setInput(val);
    if (val.length > 0) setTyping(chatId, true);
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => setTyping(chatId, false), 2000);
  };

  const handleFileSelect = async (e: Event) => {
    const files = (e.target as HTMLInputElement).files;
    if (!files || !files[0]) return;
    await sendFileMessage(chatId, files[0]);
  };

  const formatContent = (text: string) => {
    const parts = text.split(/(\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith('***') && part.endsWith('***')) return <strong key={i}><em>{part.slice(3, -3)}</em></strong>;
      if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
      if (part.startsWith('*') && part.endsWith('*')) return <em key={i}>{part.slice(1, -1)}</em>;
      if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={{ background: 'rgba(0,0,0,0.1)', padding: '2px 6px', borderRadius: 4, fontSize: 13 }}>{part.slice(1, -1)}</code>;
      return part;
    });
  };

  const groupByDate = (msgs: Message[]) => {
    const groups: { date: string; messages: Message[] }[] = [];
    let currentDate = '';
    for (const msg of msgs) {
      const d = new Date(msg.timestamp).toLocaleDateString();
      if (d !== currentDate) {
        groups.push({ date: d, messages: [] });
        currentDate = d;
      }
      groups[groups.length - 1].messages.push(msg);
    }
    return groups;
  };

  const grouped = groupByDate(messages);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid var(--border-color)',
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--bg-secondary)',
      }}>
        <button onClick={onBack} style={{
          display: isMobile ? 'inline-flex' : 'none', background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', fontSize: 18, padding: 4,
        }}>
          <i class="fas fa-arrow-left" />
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'var(--avatar-bg)', color: 'var(--avatar-text)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, fontWeight: 600, flexShrink: 0,
        }}>
          {(chatName || chatId)[0].toUpperCase()}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 500 }}>{chatName}</div>
          <div style={{ fontSize: 12, color: onlinePeers.includes(chatId) ? 'var(--online)' : 'var(--text-secondary)' }}>
            {onlinePeers.includes(chatId) ? 'в сети' : 'не в сети'}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {grouped.map(group => (
          <div key={group.date}>
            <div style={{
              textAlign: 'center', margin: '16px 0 8px', fontSize: 12,
              color: 'var(--text-time)',
            }}>
              <span style={{ background: 'var(--bg-chat)', padding: '4px 12px', borderRadius: 6 }}>
                {group.date === new Date().toLocaleDateString() ? 'Сегодня' : group.date}
              </span>
            </div>
            {group.messages.map(msg => (
              <div key={msg.id} class="fade-in" style={{
                display: 'flex', justifyContent: msg.senderId === myId ? 'flex-end' : 'flex-start',
                marginBottom: 4,
              }}>
                <div style={{
                  maxWidth: '70%', padding: '8px 12px', borderRadius: 12,
                  background: msg.senderId === myId ? 'var(--bg-message-sent)' : 'var(--bg-message-received)',
                  color: 'var(--text-message)', fontSize: 14, lineHeight: 1.4,
                  wordBreak: 'break-word',
                  borderBottomRightRadius: msg.senderId === myId ? 4 : 12,
                  borderBottomLeftRadius: msg.senderId === myId ? 12 : 4,
                  position: 'relative',
                }}>
                  {msg.contentType === 'text' && (
                    <div>{formatContent(msg.content)}</div>
                  )}
                  {msg.contentType === 'file' && msg.fileData && (
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <i class="fas fa-file" style={{ fontSize: 24, color: 'var(--accent-light)' }} />
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{msg.fileData.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-time)' }}>
                            {(msg.fileData.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                      </div>
                      <button onClick={() => {
                        const blob = new Blob([msg.fileData!.data], { type: msg.fileData!.mimeType });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = msg.fileData!.name;
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                        style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid var(--border-color)', background: 'transparent', cursor: 'pointer', fontSize: 12, color: 'var(--text-primary)' }}>
                        Скачать
                      </button>
                    </div>
                  )}
                  {msg.contentType === 'voice' && msg.fileData && (
                    <div>
                      <i class="fas fa-microphone" style={{ marginRight: 8, color: 'var(--accent-light)' }} />
                      <audio controls src={URL.createObjectURL(new Blob([msg.fileData.data], { type: msg.fileData.mimeType }))}
                        style={{ width: 200, height: 32 }} />
                    </div>
                  )}
                  {msg.contentType === 'video' && msg.fileData && (
                    <div>
                      <video controls style={{ maxWidth: '100%', maxHeight: 300, borderRadius: 8 }}
                        src={URL.createObjectURL(new Blob([msg.fileData.data], { type: msg.fileData.mimeType }))} />
                    </div>
                  )}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
                    marginTop: 2, fontSize: 11, color: 'var(--text-time)',
                  }}>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {msg.senderId === myId && (
                      <i class={`fas fa-check${msg.read ? '-double' : ''}`}
                        style={{ color: msg.read ? 'var(--accent-light)' : 'var(--text-time)', fontSize: 10 }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '12px 16px', borderTop: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <label style={{ cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 20, padding: '4px 8px' }}>
            <i class="fas fa-paperclip" />
            <input ref={fileInputRef} type="file" onChange={handleFileSelect} style={{ display: 'none' }} />
          </label>
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Сообщение..."
            rows={1}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 24, border: '1px solid var(--border-color)',
              background: 'var(--bg-input)', color: 'var(--text-primary)',
              fontSize: 14, resize: 'none', outline: 'none', lineHeight: 1.4,
              maxHeight: 120, fontFamily: 'inherit',
            }}
          />
          <button onClick={handleSend} disabled={!input.trim()}
            style={{
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: input.trim() ? 'var(--accent)' : 'var(--text-secondary)',
              color: '#fff', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
            <i class="fas fa-paper-plane" />
          </button>
        </div>
      </div>
    </div>
  );
}
