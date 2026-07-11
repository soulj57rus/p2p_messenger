import { create } from 'zustand';
import { db, type Message, type Chat } from '@/db';
import { generateKeyPair, publicKeyToId, generateBoxKeyPair, exportBoxKeyPair, importBoxKeyPair, decryptMessage, boxKeyPairToId } from '@/crypto/keys';
import { disconnectAll } from '@/p2p/connection';
import type { BoxKeyPair } from '@/crypto/keys';

let sendMessageToPeer: ((peerId: string, data: any) => 'direct' | 'relay' | 'none') | null = null;

export function setSendMessage(fn: typeof sendMessageToPeer) {
  sendMessageToPeer = fn;
}

function decodeBase64Key(key: string): Uint8Array {
  const binary = atob(key);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface PeerStore {
  myId: string | null;
  myUsername: string | null;
  myKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array } | null;
  myBoxKeyPair: BoxKeyPair | null;
  online: boolean;
  onlinePeers: string[];
  activeChat: string | null;
  chats: Chat[];
  peerUsernames: Record<string, string>;

  setOnline: (v: boolean) => void;
  setOnlinePeers: (peers: string[]) => void;
  setMyId: (id: string) => void;
  setMyUsername: (username: string | null) => void;
  setMyKeyPair: (kp: { publicKey: Uint8Array; secretKey: Uint8Array }) => void;
  setMyBoxKeyPair: (kp: BoxKeyPair) => void;
  setActiveChat: (id: string | null) => void;
  addOnlinePeer: (id: string) => void;
  removeOnlinePeer: (id: string) => void;
  setPeerOnline: (id: string, online: boolean) => void;
  setChats: (chats: Chat[]) => void;
  setPeerUsernames: (usernames: Record<string, string>) => void;
  setPeerUsername: (peerId: string, username: string) => void;

  loadKeys: () => Promise<boolean>;
  saveKeys: () => Promise<void>;
  saveUsername: (username: string) => Promise<void>;
  resolveUsername: (username: string) => Promise<string | null>;
  logout: () => Promise<void>;

  createChat: (peerId: string, displayName?: string) => Promise<string>;
  deleteChat: (chatId: string) => Promise<void>;
  sendTextMessage: (peerId: string, text: string, replyTo?: number) => Promise<void>;
  sendFileMessage: (peerId: string, file: File) => Promise<void>;
  sendVoiceMessage: (peerId: string, blob: Blob) => Promise<void>;
  sendVideoMessage: (peerId: string, blob: Blob) => Promise<void>;
  flushPendingMessages: (peerId: string) => Promise<void>;

  handleIncomingMessage: (peerId: string, data: any) => Promise<void>;
  handleRelayMessage: (peerId: string, data: any) => void;

  markAsRead: (chatId: string) => Promise<void>;
  setTyping: (chatId: string, typing: boolean) => void;

  exportHistory: (chatId: string) => Promise<string>;
}

export const useStore = create<PeerStore>((set, get) => ({
  myId: null,
  myUsername: null,
  myKeyPair: null,
  myBoxKeyPair: null,
  online: false,
  onlinePeers: [],
  activeChat: null,
  chats: [],
  peerUsernames: {},

  setOnline: (v) => set({ online: v }),
  setOnlinePeers: (peers) => set({ onlinePeers: peers }),
  setMyId: (id) => set({ myId: id }),
  setMyUsername: (username) => set({ myUsername: username }),
  setMyKeyPair: (kp) => set({ myKeyPair: kp }),
  setMyBoxKeyPair: (kp) => set({ myBoxKeyPair: kp }),
  setActiveChat: (id) => set({ activeChat: id }),
  setChats: (chats) => set({ chats }),
  setPeerUsernames: (usernames) => set({ peerUsernames: usernames }),
  setPeerUsername: (peerId, username) => set((s) => ({
    peerUsernames: { ...s.peerUsernames, [peerId]: username },
  })),
  addOnlinePeer: (id) => set((s) => ({ onlinePeers: s.onlinePeers.includes(id) ? s.onlinePeers : [...s.onlinePeers, id] })),
  removeOnlinePeer: (id) => set((s) => ({ onlinePeers: s.onlinePeers.filter(p => p !== id) })),
  setPeerOnline: (id, online) => {
    set((s) => ({
      onlinePeers: online
        ? (s.onlinePeers.includes(id) ? s.onlinePeers : [...s.onlinePeers, id])
        : s.onlinePeers.filter(p => p !== id),
    }));
  },

  loadKeys: async () => {
    const stored = await db.keys.get('identity');
    if (stored) {
      const kp = JSON.parse(stored.keyData);
      const pub = new Uint8Array(kp.publicKey);
      const sec = new Uint8Array(kp.secretKey);

      let boxKp: BoxKeyPair;
      if (stored.boxKeyData) {
        boxKp = importBoxKeyPair(stored.boxKeyData);
      } else {
        boxKp = generateBoxKeyPair();
      }

      set({
        myKeyPair: { publicKey: pub, secretKey: sec },
        myBoxKeyPair: boxKp,
        myId: publicKeyToId(pub),
        myUsername: stored.username || null,
      });
      return true;
    }
    return false;
  },

  saveKeys: async () => {
    const { myKeyPair, myBoxKeyPair, myUsername } = get();
    if (!myKeyPair) return;
    await db.keys.put({
      id: 'identity',
      keyData: JSON.stringify({
        publicKey: Array.from(myKeyPair.publicKey),
        secretKey: Array.from(myKeyPair.secretKey),
      }),
      boxKeyData: myBoxKeyPair ? exportBoxKeyPair(myBoxKeyPair) : undefined,
      username: myUsername || undefined,
      createdAt: Date.now(),
    });
    set({ myId: publicKeyToId(myKeyPair.publicKey) });
  },

  saveUsername: async (username) => {
    const { myId } = get();
    if (!myId) return;
    await db.keys.update('identity', { username });
    set({ myUsername: username });
  },

  resolveUsername: async (username) => {
    const { peerUsernames } = get();
    const reverse = Object.entries(peerUsernames);
    for (const [pid, uname] of reverse) {
      if (uname === username.toLowerCase()) return pid;
    }
    return null;
  },

  logout: async () => {
    disconnectAll();
    await db.keys.clear();
    await db.chats.clear();
    await db.messages.clear();
    set({
      myId: null,
      myUsername: null,
      myKeyPair: null,
      myBoxKeyPair: null,
      online: false,
      onlinePeers: [],
      activeChat: null,
      chats: [],
      peerUsernames: {},
    });
  },

  createChat: async (peerId, displayName) => {
    const existing = await db.chats.get(peerId);
    if (existing) return existing.id;
    const chat: Chat = {
      id: peerId,
      peerId,
      displayName: displayName || peerId.slice(0, 16) + '...',
      lastMessage: '',
      lastMessageTime: Date.now(),
      unread: 0,
      createdAt: Date.now(),
      typing: false,
      online: false,
    };
    await db.chats.put(chat);
    const all = await db.chats.orderBy('lastMessageTime').reverse().toArray();
    set({ chats: all });
    return peerId;
  },

  deleteChat: async (chatId) => {
    await db.messages.where({ chatId }).delete();
    await db.chats.delete(chatId);
    const { activeChat } = get();
    if (activeChat === chatId) set({ activeChat: null });
    const all = await db.chats.orderBy('lastMessageTime').reverse().toArray();
    set({ chats: all });
  },

  sendTextMessage: async (peerId, text, replyTo) => {
    const { myId, myKeyPair } = get();
    if (!myId || !myKeyPair) return;

    const msg: Omit<Message, 'id'> = {
      chatId: peerId,
      senderId: myId,
      content: text,
      contentType: 'text',
      timestamp: Date.now(),
      read: false,
      delivered: false,
      pending: true,
      replyTo,
    };
    const id = await db.messages.add(msg as Message);

    if (sendMessageToPeer) {
      const result = sendMessageToPeer(peerId, { type: 'text', content: text, timestamp: msg.timestamp, id, replyTo });
      if (result === 'direct') {
        await db.messages.update(id!, { pending: false });
      }
    }

    await db.chats.update(peerId, { lastMessage: text, lastMessageTime: msg.timestamp });
    const all = await db.chats.orderBy('lastMessageTime').reverse().toArray();
    set({ chats: all });
  },

  sendFileMessage: async (peerId, file) => {
    const { myId, myKeyPair } = get();
    if (!myId || !myKeyPair) return;

    const buffer = await file.arrayBuffer();
    const msg: Omit<Message, 'id'> = {
      chatId: peerId,
      senderId: myId,
      content: file.name,
      contentType: file.type.startsWith('video') ? 'video' : file.type.startsWith('audio') ? 'voice' : 'file',
      timestamp: Date.now(),
      read: false,
      delivered: false,
      fileData: { name: file.name, size: file.size, mimeType: file.type, data: buffer },
    };
    const id = await db.messages.add(msg as Message);

    if (sendMessageToPeer) {
      sendMessageToPeer(peerId, {
        type: 'file', name: file.name, size: file.size, mimeType: file.type,
        data: Array.from(new Uint8Array(buffer)), timestamp: msg.timestamp, id,
      });
    }
  },

  sendVoiceMessage: async (peerId, blob) => {
    const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
    return get().sendFileMessage(peerId, file);
  },

  sendVideoMessage: async (peerId, blob) => {
    const file = new File([blob], `video_${Date.now()}.webm`, { type: 'audio/webm' });
    return get().sendFileMessage(peerId, file);
  },

  flushPendingMessages: async (peerId) => {
    const pending = await db.messages.where({ chatId: peerId, pending: true }).toArray();
    if (!pending.length) return;

    if (!sendMessageToPeer) {
      const { myId } = get();
      if (myId) {
        const { connectToSignal } = await import('@/p2p/connection');
        connectToSignal(myId);
      }
    }

    if (!sendMessageToPeer) return;

    for (const msg of pending) {
      let payload: any;
      if (msg.contentType === 'text') {
        payload = { type: 'text', content: msg.content, timestamp: msg.timestamp, id: msg.id, replyTo: msg.replyTo };
      } else if (msg.fileData) {
        payload = {
          type: 'file', name: msg.fileData.name, size: msg.fileData.size,
          mimeType: msg.fileData.mimeType, data: Array.from(new Uint8Array(msg.fileData.data)),
          timestamp: msg.timestamp, id: msg.id,
        };
      } else {
        continue;
      }

      try {
        const result = sendMessageToPeer(peerId, payload);
        if (result !== 'none') {
          await db.messages.update(msg.id!, { pending: false, delivered: result === 'direct' });
        }
      } catch (e) {
        console.error('[FLUSH] Failed to send:', e);
      }
    }
  },

  handleIncomingMessage: async (peerId, data) => {
    const { myId, myBoxKeyPair } = get();
    if (!myId) return;

    if (data.type === 'encrypted' && myBoxKeyPair) {
      try {
        const nonce = decodeBase64Key(data.nonce);
        const ciphertext = decodeBase64Key(data.ciphertext);
        const senderBoxKey = decodeBase64Key(data.senderBoxKey);
        const plaintext = decryptMessage(senderBoxKey, myBoxKeyPair.secretKey, nonce, ciphertext);
        if (plaintext) {
          data = JSON.parse(new TextDecoder().decode(plaintext));
        } else {
          console.error('[CRYPTO] Failed to decrypt message from', peerId.slice(0, 16));
          return;
        }
      } catch (e) {
        console.error('[CRYPTO] Decrypt error:', e);
        return;
      }
    }

    await get().createChat(peerId);

    if (data.type === 'text') {
      await db.messages.add({
        chatId: peerId,
        senderId: peerId,
        content: data.content,
        contentType: 'text',
        timestamp: data.timestamp,
        read: true,
        delivered: true,
      });
      await db.chats.update(peerId, { lastMessage: data.content, lastMessageTime: data.timestamp });
    } else if (data.type === 'typing') {
      await db.chats.update(peerId, { typing: data.isTyping });
      const all = await db.chats.orderBy('lastMessageTime').reverse().toArray();
      set({ chats: all });
      return;
    } else if (data.type === 'file') {
      await db.messages.add({
        chatId: peerId,
        senderId: peerId,
        content: data.name,
        contentType: data.mimeType?.startsWith('video') ? 'video' : data.mimeType?.startsWith('audio') ? 'voice' : 'file',
        timestamp: data.timestamp,
        read: true,
        delivered: true,
        fileData: {
          name: data.name,
          size: data.size,
          mimeType: data.mimeType,
          data: new Uint8Array(data.data).buffer,
        },
      });
    }
    const all = await db.chats.orderBy('lastMessageTime').reverse().toArray();
    set({ chats: all });
  },

  handleRelayMessage: (peerId, data) => {
    get().handleIncomingMessage(peerId, data);
  },

  markAsRead: async (chatId) => {
    const { myId } = get();
    if (!myId) return;
    await db.messages.where({ chatId }).and(msg => msg.senderId !== myId).modify({ read: true });
    await db.chats.update(chatId, { unread: 0 });
  },

  setTyping: (chatId, typing) => {
    if (sendMessageToPeer) {
      sendMessageToPeer(chatId, { type: 'typing', isTyping: typing });
    }
  },

  exportHistory: async (chatId) => {
    const messages = await db.messages.where({ chatId }).toArray();
    return JSON.stringify(messages, null, 2);
  },
}));
