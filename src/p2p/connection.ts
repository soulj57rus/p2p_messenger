import { useStore, setSendMessage } from '@/store/useStore';
import { publicKeyToId } from '@/crypto/keys';

const SIGNAL_URL = import.meta.env.VITE_SIGNAL_URL || 'ws://localhost:3001';

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
const peerConnections = new Map<string, RTCPeerConnection>();
const dataChannels = new Map<string, RTCDataChannel>();
const pendingCandidates = new Map<string, RTCIceCandidate[]>();

let reconnectTimer: any = null;

export function connectToSignal(peerId: string) {
  setSendMessage(sendMessage);
  if (ws && ws.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(SIGNAL_URL);

  ws.onopen = () => {
    console.log('[WS] Connected to signaling server');
    ws!.send(JSON.stringify({ type: 'register', peerId }));
    if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
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
      break;

    case 'online_peers':
      store.setOnlinePeers(msg.peers);
      break;

    case 'peer_online': {
      store.addOnlinePeer(msg.peerId);
      break;
    }

    case 'peer_offline':
      store.removeOnlinePeer(msg.peerId);
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

export async function initiateConnection(peerId: string) {
  if (peerConnections.has(peerId)) return;

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
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      cleanupConnection(peerId);
    }
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    sendSignal({ type: 'offer', to: peerId, data: pc.localDescription?.toJSON() });
  } catch (e) {
    console.error('[ICE] Offer error:', e);
  }
}

async function handleOffer(from: string, data: any) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  peerConnections.set(from, pc);

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      sendSignal({ type: 'ice_candidate', to: from, data: e.candidate.toJSON() });
    }
  };

  pc.ondatachannel = (e) => setupDataChannel(e.channel, from);

  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
      cleanupConnection(from);
    }
  };

  await pc.setRemoteDescription(new RTCSessionDescription(data));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  sendSignal({ type: 'answer', to: from, data: pc.localDescription?.toJSON() });

  const pendings = pendingCandidates.get(from) || [];
  for (const c of pendings) {
    await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
  }
  pendingCandidates.delete(from);
}

async function handleAnswer(from: string, data: any) {
  const pc = peerConnections.get(from);
  if (!pc) return;
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
  dataChannels.set(peerId, dc);

  dc.onopen = () => {
    console.log(`[DC] Open with ${peerId.slice(0, 16)}...`);
    useStore.getState().setPeerOnline(peerId, true);
  };

  dc.onclose = () => {
    console.log(`[DC] Close with ${peerId.slice(0, 16)}...`);
    cleanupConnection(peerId);
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

export function sendMessage(peerId: string, data: any) {
  const dc = dataChannels.get(peerId);
  if (dc?.readyState === 'open') {
    dc.send(JSON.stringify(data));
    return true;
  }
  return false;
}

function cleanupConnection(peerId: string) {
  dataChannels.delete(peerId);
  const pc = peerConnections.get(peerId);
  if (pc) {
    pc.close();
    peerConnections.delete(peerId);
  }
  useStore.getState().setPeerOnline(peerId, false);
}

export function disconnectAll() {
  for (const [id] of peerConnections) cleanupConnection(id);
  if (ws) { ws.close(); ws = null; }
}
