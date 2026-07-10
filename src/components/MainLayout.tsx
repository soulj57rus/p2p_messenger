import { useStore } from '@/store/useStore';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { WelcomeScreen } from './WelcomeScreen';
import { useEffect, useState } from 'preact/hooks';
import { db } from '@/db';
import { initiateConnection } from '@/p2p/connection';

export function MainLayout() {
  const activeChat = useStore((s) => s.activeChat);
  const setActiveChat = useStore((s) => s.setActiveChat);
  const onlinePeers = useStore((s) => s.onlinePeers);
  const storeChats = useStore((s) => s.chats);
  const setChats = useStore((s) => s.setChats);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');

  useEffect(() => {
    const load = async () => {
      const all = await db.chats.orderBy('lastMessageTime').reverse().toArray();
      setChats(all);
    };
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
    };
    if (!document.documentElement.getAttribute('data-theme')) {
      document.documentElement.setAttribute('data-theme', mq.matches ? 'dark' : 'light');
    }
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    if (activeChat) setMobileView('chat');
  }, [activeChat]);

  const handleSelectChat = (peerId: string) => {
    setActiveChat(peerId);
    if (onlinePeers.includes(peerId)) initiateConnection(peerId);
  };

  const handleBack = () => {
    setActiveChat(null);
    setMobileView('list');
  };

  const showList = mobileView === 'list' || storeChats.length === 0;

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      <div style={{
        width: showList ? 360 : 0,
        minWidth: showList ? 360 : 0,
        borderRight: '1px solid var(--border-color)',
        background: 'var(--bg-secondary)',
        overflow: 'hidden',
        transition: 'width 0.2s, min-width 0.2s',
        display: 'flex', flexDirection: 'column',
      }}>
        <ChatList />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-chat)' }}>
        {activeChat ? (
          <ChatView chatId={activeChat} onBack={handleBack} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  );
}
