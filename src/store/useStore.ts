import { create } from 'zustand';
import { db, type Message, type Chat } from '@/db';
import { generateKeyPair, publicKeyToId, idToPublicKey, encryptMessage, decryptMessage, signMessage } from '@/crypto/keys';

let sendMessageToPeer: ((peerId: string, data: any) => boolean) | null = null;

export function setSendMessage(fn: typeof sendMessageToPeer) {
  sendMessageToPeer = fn;
}

interface PeerStore {
  myId: string | null;
  myKeyPair: { publicKey: Uint8Array; secretKey: Uint8Array } | null;
  online: boolean;
  onlinePeers: string[];
  activeChat: string | null;
  chats: Chat[];

  setOnline: (v: boolean) => void;
  setOnlinePeers: (peers: string[]) => void;
  setMyId: (id: string) => void;
  setMyKeyPair: (kp: { publicKey: Uint8Array; secretKey: Uint8Array }) => void;
  setActiveChat: (id: string | null) => void;
  addOnlinePeer: (id: string) => void;
  removeOnlinePeer: (id: string) => void;
  setPeerOnline: (id: string, online: boolean) => void;
  setChats: (chats: Chat[]) => void;

  loadKeys: () => Promise<boolean>;
  saveKeys: () => Promise<void>;

  createChat: (peerId: string, displayName?: string) => Promise<string>;
  sendTextMessage: (peerId: string, text: string, replyTo?: number) => Promise<void>;
  sendFileMessage: (peerId: string, file: File) => Promise<void>;
  sendVoiceMessage: (peerId: string, blob: Blob) => Promise<void>;
  sendVideoMessage: (peerId: string, blob: Blob) => Promise<void>;

  handleIncomingMessage: (peerId: string, data: any) => Promise<void>;
  handleRelayMessage: (peerId: string, data: any) => void;

  markAsRead: (chatId: string) => Promise<void>;
  setTyping: (chatId: string, typing: boolean) => void;

  exportHistory: (chatId: string) => Promise<string>;
}

export const useStore = create<PeerStore>((set, get) => ({
  myId: null,
  myKeyPair: null,
  online: false,
  onlinePeers: [],
  activeChat: null,
  chats: [],

  setOnline: (v) => set({ online: v }),
  setOnlinePeers: (peers) => set({ onlinePeers: peers }),
  setMyId: (id) => set({ myId: id }),
  setMyKeyPair: (kp) => set({ myKeyPair: kp }),
  setActiveChat: (id) => set({ activeChat: id }),
  setChats: (chats) => set({ chats }),
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
      set({ myKeyPair: { publicKey: pub, secretKey: sec }, myId: publicKeyToId(pub) });
      return true;
    }
    return false;
  },

  saveKeys: async () => {
    const { myKeyPair } = get();
    if (!myKeyPair) return;
    await db.keys.put({
      id: 'identity',
      keyData: JSON.stringify({
        publicKey: Array.from(myKeyPair.publicKey),
        secretKey: Array.from(myKeyPair.secretKey),
      }),
      createdAt: Date.now(),
    });
    set({ myId: publicKeyToId(myKeyPair.publicKey) });
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
      replyTo,
    };
    const id = await db.messages.add(msg as Message);

    if (sendMessageToPeer) {
      sendMessageToPeer(peerId, { type: 'text', content: text, timestamp: msg.timestamp, id, replyTo });
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
    const file = new File([blob], `video_${Date.now()}.webm`, { type: 'video/webm' });
    return get().sendFileMessage(peerId, file);
  },

  handleIncomingMessage: async (peerId, data) => {
    const { myId } = get();
    if (!myId) return;

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
    await db.messages.where({ chatId }).modify({ read: true });
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
