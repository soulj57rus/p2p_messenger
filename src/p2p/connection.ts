import { useStore, setSendMessage } from '@/store/useStore';
import { encryptMessage, decryptMessage, boxKeyPairToId } from '@/crypto/keys';

const SIGNAL_HOST = import.meta.env.VITE_SIGNAL_HOST || location.host;
const SIGNAL_PATH = import.meta.env.VITE_SIGNAL_PATH || (import.meta.env.VITE_SIGNAL_HOST ? '' : '/ws');
const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${SIGNAL_HOST}${SIGNAL_PATH}`;

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

let ws: WebSocket | null = null;
let myPeerId: string | null = null;
const peerConnections = new Map<string, RTCPeerConnection>();
const dataChannels = new Map<string, RTCDataChannel>();
const pendingCandidates = new Map<string, RTCIceCandidate[]>();
const peerBoxKeys = new Map<string, Uint8Array>();

let reconnectTimer: any = null;
let pendingUsernameResolve: ((msg: any) => void) | null = null;

function shouldInitiate(remoteId: string): boolean {
  if (!myPeerId) return false;
  return myPeerId < remoteId;
}

export function connectToSignal(peerId: string) {
  myPeerId = peerId;
  setSendMessage(sendMessage);
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  ws = new WebSocket(SIGNAL_URL);

  ws.onopen = () => {
    console.log('[WS] Connected to signaling server');
    const store = useStore.getState();
    const boxPublicKey = store.myBoxKeyPair ? boxKeyPairToId(store.myBoxKeyPair) : null;
    ws!.send(JSON.stringify({ type: 'register', peerId, username: store.myUsername, boxPublicKey }));
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
    setTimeout(async () => {
      const state = useStore.getState();
      for (const chat of state.chats) {
        await state.flushPendingMessages(chat.peerId);
      }
    }, 500);
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleSignalMessage(msg);
    } catch (e) { /* ignore */ }
  };

  ws.onclose = () => {
    console.log('[WS] Disconnected');
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => connectToSignal(peerId), 3000);
    }
  };

  ws.onerror = () => ws?.close();
}

function handleSignalMessage(msg: any) {
  const store = useStore.getState();

  switch (msg.type) {
    case 'registered':
      store.setOnline(true);
      if (msg.username) store.setMyUsername(msg.username);
      break;

    case 'online_peers':
      store.setOnlinePeers(msg.peers);
      if (msg.usernames) store.setPeerUsernames(msg.usernames);
      if (msg.boxKeys) {
        for (const [pid, key] of Object.entries(msg.boxKeys)) {
          peerBoxKeys.set(pid, decodeBase64Key(key as string));
        }
      }
      break;

    case 'peer_online': {
      store.addOnlinePeer(msg.peerId);
      if (msg.username) store.setPeerUsername(msg.peerId, msg.username);
      if (msg.boxPublicKey) {
        peerBoxKeys.set(msg.peerId, decodeBase64Key(msg.boxPublicKey));
      }
      break;
    }

    case 'peer_offline':
      store.removeOnlinePeer(msg.peerId);
      break;

    case 'username_result':
      if (pendingUsernameResolve) {
        pendingUsernameResolve(msg);
        pendingUsernameResolve = null;
      }
      break;

    case 'username_resolved':
      if (pendingUsernameResolve) {
        pendingUsernameResolve(msg);
        pendingUsernameResolve = null;
      }
      break;

    case 'username_changed':
      if (msg.peerId) store.setPeerUsername(msg.peerId, msg.username);
      if (msg.boxPublicKey) {
        peerBoxKeys.set(msg.peerId, decodeBase64Key(msg.boxPublicKey));
      }
      break;

    case 'offer':
      handleOffer(msg.from, msg.data);
      break;

    case 'answer':
      handleAnswer(msg.from, msg.data);
      break;

    case 'ice_candidate':
      handleIceCandidate(msg.from, msg.data);
      break;

    case 'relay':
      store.handleRelayMessage(msg.from, msg.data);
      break;
  }
}

function sendSignal(data: any) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function decodeBase64Key(key: string): Uint8Array {
  const binary = atob(key);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64Key(key: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < key.length; i++) binary += String.fromCharCode(key[i]);
  return btoa(binary);
}

export function encryptPayload(data: any, peerId: string): any {
  const store = useStore.getState();
  if (!store.myBoxKeyPair) return data;
  const peerKey = peerBoxKeys.get(peerId);
  if (!peerKey) return data;

  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  const { nonce, ciphertext } = encryptMessage(peerKey, store.myBoxKeyPair.secretKey, plaintext);
  return {
    type: 'encrypted',
    nonce: encodeBase64Key(nonce),
    ciphertext: encodeBase64Key(ciphertext),
    senderBoxKey: boxKeyPairToId(store.myBoxKeyPair),
  };
}

export async function initiateConnection(peerId: string) {
  if (!shouldInitiate(peerId)) return;
  if (peerConnections.has(peerId)) return;

  console.log(`[ICE] Initiating connection to ${peerId.slice(0, 16)}...`);
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections.set(peerId, pc);

  const dc = pc.createDataChannel('chat', { ordered: true });
  setupDataChannel(dc, peerId);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal({ type: 'ice_candidate', to: peerId, data: e.candidate.toJSON() });
    }
  };

  pc.ondatachannel = (e) => {
    setupDataChannel(e.channel, peerId);
  };

  pc.onconnectionstatechange = () => {
    console.log(`[ICE] State with ${peerId.slice(0, 16)}...: ${pc.connectionState}`);
    if (pc.connectionState === 'failed') {
      cleanupConnection(peerId);
      scheduleReconnect(peerId);
    } else if (pc.connectionState === 'connected') {
      reconnectAttempts.delete(peerId);
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'offer', to: peerId, data: pc.localDescription?.toJSON() });
    console.log(`[ICE] Offer sent to ${peerId.slice(0, 16)}...`);
  } catch (e) {
    console.error('[ICE] Offer error:', e);
  }
}

async function handleOffer(from: string, data: any) {
  console.log(`[ICE] Received offer from ${from.slice(0, 16)}...`);

  const existingPc = peerConnections.get(from);
  if (existingPc) {
    existingPc.close();
    peerConnections.delete(from);
    dataChannels.delete(from);
  }

  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections.set(from, pc);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal({ type: 'ice_candidate', to: from, data: e.candidate.toJSON() });
    }
  };

  pc.ondatachannel = (e) => setupDataChannel(e.channel, from);

  pc.onconnectionstatechange = () => {
    console.log(`[ICE] State with ${from.slice(0, 16)}...: ${pc.connectionState}`);
    if (pc.connectionState === 'failed') {
      cleanupConnection(from);
      scheduleReconnect(from);
    } else if (pc.connectionState === 'connected') {
      reconnectAttempts.delete(from);
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(data));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal({ type: 'answer', to: from, data: pc.localDescription?.toJSON() });
  console.log(`[ICE] Answer sent to ${from.slice(0, 16)}...`);

  const pendings = pendingCandidates.get(from) || [];
  for (const c of pendings) {
    await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  }
  pendingCandidates.delete(from);
}

async function handleAnswer(from: string, data: any) {
  const pc = peerConnections.get(from);
  if (!pc) return;
  console.log(`[ICE] Received answer from ${from.slice(0, 16)}...`);
  await pc.setRemoteDescription(new RTCSessionDescription(data));
  const pendings = pendingCandidates.get(from) || [];
  for (const c of pendings) {
    await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  }
  pendingCandidates.delete(from);
}

async function handleIceCandidate(from: string, data: any) {
  const pc = peerConnections.get(from);
  if (!pc || !pc.remoteDescription) {
    const pendings = pendingCandidates.get(from) || [];
    pendings.push(data);
    pendingCandidates.set(from, pendings);
    return;
  }
  try {
    await pc.addIceCandidate(new RTCIceCandidate(data));
  } catch (e) { /* ignore */ }
}

function setupDataChannel(dc: RTCDataChannel, peerId: string) {
  console.log(`[DC] Setting up channel with ${peerId.slice(0, 16)}... (state: ${dc.readyState})`);
  dataChannels.set(peerId, dc);

  dc.onopen = () => {
    console.log(`[DC] OPEN with ${peerId.slice(0, 16)}...`);
    useStore.getState().setPeerOnline(peerId, true);
  };

  dc.onclose = () => {
    console.log(`[DC] CLOSE with ${peerId.slice(0, 16)}...`);
    dataChannels.delete(peerId);
  };

  dc.onerror = (e) => {
    console.error(`[DC] ERROR with ${peerId.slice(0, 16)}...`, e);
  };

  dc.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      useStore.getState().handleIncomingMessage(peerId, data);
    } catch (e) {
      console.error('[DC] parse error', e);
    }
  };
}

export function sendMessage(peerId: string, data: any): 'direct' | 'relay' | 'none' {
  const encrypted = encryptPayload(data, peerId);

  const dc = dataChannels.get(peerId);
  if (dc?.readyState === 'open') {
    dc.send(JSON.stringify(encrypted));
    return 'direct';
  }

  if (ws?.readyState === WebSocket.OPEN && myPeerId) {
    console.log(`[RELAY] Fallback to server for ${peerId.slice(0, 16)}...`);
    ws.send(JSON.stringify({ type: 'relay', to: peerId, data: encrypted }));
    return 'relay';
  }

  console.warn(`[DC] No channel and no WS for ${peerId.slice(0, 16)}...`);
  return 'none';
}

const reconnectAttempts = new Map<string, number>();

function scheduleReconnect(peerId: string) {
  const attempts = reconnectAttempts.get(peerId) || 0;
  if (attempts >= 10) {
    console.warn(`[ICE] Giving up reconnect to ${peerId.slice(0, 16)}... after ${attempts} attempts`);
    return;
  }
  reconnectAttempts.set(peerId, attempts + 1);
  const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
  console.log(`[ICE] Reconnecting to ${peerId.slice(0, 16)}... in ${delay}ms (attempt ${attempts + 1})`);
  setTimeout(() => {
    peerConnections.delete(peerId);
    dataChannels.delete(peerId);
    initiateConnection(peerId);
  }, delay);
}

function cleanupConnection(peerId: string) {
  dataChannels.delete(peerId);
  const pc = peerConnections.get(peerId);
  if (pc) {
    pc.close();
    peerConnections.delete(peerId);
  }
}

export function disconnectAll() {
  for (const [id] of peerConnections) cleanupConnection(id);
  if (ws) { ws.close(); ws = null; }
}

export function sendSetUsername(username: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ ok: false, error: 'Нет подключения к серверу' });
      return;
    }
    pendingUsernameResolve = (msg) => {
      resolve({ ok: msg.ok, username: msg.username, error: msg.error });
    };
    ws.send(JSON.stringify({ type: 'set_username', username }));
    setTimeout(() => {
      if (pendingUsernameResolve) {
        pendingUsernameResolve = null;
        resolve({ ok: false, error: 'Таймаут сервера' });
      }
    }, 5000);
  });
}

export function sendResolveUsername(username: string): Promise<{ peerId: string | null; error?: string }> {
  return new Promise((resolve) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      resolve({ peerId: null, error: 'Нет подключения к серверу' });
      return;
    }
    pendingUsernameResolve = (msg) => {
      resolve({ peerId: msg.peerId, error: msg.error });
    };
    ws.send(JSON.stringify({ type: 'resolve_username', username }));
    setTimeout(() => {
      if (pendingUsernameResolve) {
        pendingUsernameResolve = null;
        resolve({ peerId: null, error: 'Таймаут сервера' });
      }
    }, 5000);
  });
}
