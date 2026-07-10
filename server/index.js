import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server });

const peers = new Map();

wss.on('connection', (ws, req) => {
  let peerId = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'register': {
          peerId = msg.peerId;
          peers.set(peerId, ws);
          ws.send(JSON.stringify({ type: 'registered', peerId }));
          console.log(`[+] Peer registered: ${peerId.slice(0, 16)}...`);

          const online = Array.from(peers.keys()).filter(id => id !== peerId);
          ws.send(JSON.stringify({ type: 'online_peers', peers: online }));
          broadcast({ type: 'peer_online', peerId }, peerId);
          break;
        }

        case 'offer':
        case 'answer':
        case 'ice_candidate': {
          const target = peers.get(msg.to);
          if (target && target.readyState === ws.OPEN) {
            target.send(JSON.stringify({
              type: msg.type,
              from: peerId,
              data: msg.data,
            }));
          } else {
            ws.send(JSON.stringify({ type: 'error', message: 'Peer not available' }));
          }
          break;
        }

        case 'relay': {
          const target = peers.get(msg.to);
          if (target && target.readyState === ws.OPEN) {
            target.send(JSON.stringify({
              type: 'relay',
              from: peerId,
              data: msg.data,
            }));
          }
          break;
        }

        default:
          ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid message' }));
    }
  });

  ws.on('close', () => {
    if (peerId) {
      peers.delete(peerId);
      console.log(`[-] Peer disconnected: ${peerId.slice(0, 16)}...`);
      broadcast({ type: 'peer_offline', peerId }, null);
    }
  });
});

function broadcast(msg, exclude) {
  const data = JSON.stringify(msg);
  for (const [id, ws] of peers) {
    if (id !== exclude && ws.readyState === ws.OPEN) {
      ws.send(data);
    }
  }
}

app.get('/health', (_, res) => res.json({ ok: true, peers: peers.size }));
app.get('/peers', (_, res) => res.json({ peers: Array.from(peers.keys()) }));

server.listen(PORT, () => {
  console.log(`[!] Signaling server running on port ${PORT}`);
});
