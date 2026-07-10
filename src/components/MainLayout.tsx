import { useStore } from '@/store/useStore';
import { ChatList } from './ChatList';
import { ChatView } from './ChatView';
import { WelcomeScreen } from './WelcomeScreen';
import { useEffect, useState, useRef } from 'preact/hooks';
import { db } from '@/db';
import { initiateConnection } from '@/p2p/connection';

export function MainLayout() {
  const activeChat = useStore((s) => s.activeChat);
  const setActiveChat = useStore((s) => s.setActiveChat);
  const onlinePeers = useStore((s) => s.onlinePeers);
  const storeChats = useStore((s) => s.chats);
  const setChats = useStore((s) => s.setChats);
  const createChat = useStore((s) => s.createChat);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const processedInvite = useRef(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
    if (processedInvite.current) return;
    const params = new URLSearchParams(window.location.search);
    const addPeer = params.get('add');
    if (addPeer && addPeer.trim()) {
      processedInvite.current = true;
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
      (async () => {
        await createChat(addPeer.trim(), addPeer.trim().slice(0, 16) + '...');
        setActiveChat(addPeer.trim());
      })();
    }
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

  useEffect(() => {
    for (const chat of storeChats) {
      if (onlinePeers.includes(chat.peerId)) {
        initiateConnection(chat.peerId);
      }
    }
  }, [onlinePeers]);

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
        <ChatList onSelectChat={handleSelectChat} />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-chat)' }}>
        {activeChat ? (
          <ChatView chatId={activeChat} onBack={handleBack} isMobile={isMobile} />
        ) : (
          <WelcomeScreen />
        )}
      </div>
    </div>
  );
}
