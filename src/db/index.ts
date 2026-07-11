import Dexie, { type Table } from 'dexie';

export interface Message {
  id?: number;
  chatId: string;
  senderId: string;
  content: string;
  contentType: 'text' | 'image' | 'file' | 'voice' | 'video';
  fileData?: { name: string; size: number; mimeType: string; data: ArrayBuffer };
  timestamp: number;
  read: boolean;
  delivered: boolean;
  pending?: boolean;
  selfDestruct?: number;
  encrypted?: boolean;
  replyTo?: number;
}

export interface Chat {
  id: string;
  peerId: string;
  displayName: string;
  lastMessage?: string;
  lastMessageTime?: number;
  unread: number;
  createdAt: number;
  typing: boolean;
  online: boolean;
  publicKey?: string;
}

export interface StoredKey {
  id: string;
  keyData: string;
  username?: string;
  createdAt: number;
}

class MessengerDB extends Dexie {
  messages!: Table<Message>;
  chats!: Table<Chat>;
  keys!: Table<StoredKey>;

  constructor() {
    super('P2PMessenger');
    this.version(3).stores({
      messages: '++id, chatId, timestamp, pending',
      chats: 'id, peerId, lastMessageTime',
      keys: 'id',
    });
  }
}

export const db = new MessengerDB();
