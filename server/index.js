import express from 'express';
import { createServer as createHttpServer } from 'http';
import { createServer as createHttpsServer } from 'https';
import { readFileSync, existsSync } from 'fs';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const sslKey = process.env.SSL_KEY || join(__dirname, 'certs', 'key.pem');
const sslCert = process.env.SSL_CERT || join(__dirname, 'certs', 'cert.pem');
let server;

if (existsSync(sslKey) && existsSync(sslCert)) {
  server = createHttpsServer({
    key: readFileSync(sslKey),
    cert: readFileSync(sslCert),
  }, app);
  console.log('[!] HTTPS mode');
} else {
  server = createHttpServer(app);
  console.log('[!] HTTP mode (generate certs in server/certs/ for HTTPS)');
}
const wss = new WebSocketServer({ server });

const peers = new Map();
const usernames = new Map();
const boxKeys = new Map();

wss.on('connection', (ws, req) => {
  let peerId = null;
  let registeredUsername = null;

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'register': {
          peerId = msg.peerId;
          peers.set(peerId, ws);

          if (msg.boxPublicKey) {
            boxKeys.set(peerId, msg.boxPublicKey);
          }

          if (msg.username) {
            const lower = msg.username.toLowerCase();
            if (!usernames.has(lower)) {
              usernames.set(lower, peerId);
              registeredUsername = lower;
            }
          }

          ws.send(JSON.stringify({ type: 'registered', peerId, username: registeredUsername }));
          console.log(`[+] Peer registered: ${registeredUsername ? '@' + registeredUsername : peerId.slice(0, 16) + '...'}`);

          const online = Array.from(peers.keys()).filter(id => id !== peerId);
          const peerUsernames = {};
          const peerBoxKeys = {};
          for (const [uname, pid] of usernames) {
            if (pid !== peerId) peerUsernames[pid] = uname;
          }
          for (const [pid, key] of boxKeys) {
            if (pid !== peerId) peerBoxKeys[pid] = key;
          }
          ws.send(JSON.stringify({ type: 'online_peers', peers: online, usernames: peerUsernames, boxKeys: peerBoxKeys }));
          broadcast({ type: 'peer_online', peerId, username: registeredUsername, boxPublicKey: msg.boxPublicKey || null }, peerId);
          break;
        }

        case 'set_username': {
          const newUsername = (msg.username || '').toLowerCase().trim();
          const usernameRegex = /^[a-z][a-z0-9_]{2,31}$/;

          if (!usernameRegex.test(newUsername)) {
            ws.send(JSON.stringify({
              type: 'username_result',
              ok: false,
              error: 'Имя должно: 3-32 символа, начинаться с буквы, содержать только a-z, 0-9, _',
            }));
            break;
          }

          if (registeredUsername) {
            usernames.delete(registeredUsername);
          }

          if (usernames.has(newUsername)) {
            ws.send(JSON.stringify({
              type: 'username_result',
              ok: false,
              error: 'Это имя уже занято',
            }));
            if (registeredUsername) usernames.set(registeredUsername, peerId);
            break;
          }

          usernames.set(newUsername, peerId);
          registeredUsername = newUsername;
          ws.send(JSON.stringify({ type: 'username_result', ok: true, username: newUsername }));
          console.log(`[@] Username set: @${newUsername} -> ${peerId.slice(0, 16)}...`);
          broadcast({ type: 'username_changed', peerId, username: newUsername, boxPublicKey: boxKeys.get(peerId) || null }, peerId);
          break;
        }

        case 'resolve_username': {
          const target = (msg.username || '').toLowerCase().trim();
          const targetPeerId = usernames.get(target);
          if (targetPeerId) {
            ws.send(JSON.stringify({
              type: 'username_resolved',
              username: target,
              peerId: targetPeerId,
              online: peers.has(targetPeerId),
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'username_resolved',
              username: target,
              peerId: null,
              error: 'Пользователь не найден',
            }));
          }
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
      boxKeys.delete(peerId);
      if (registeredUsername) {
        usernames.delete(registeredUsername);
      }
      console.log(`[-] Peer disconnected: ${registeredUsername ? '@' + registeredUsername : peerId.slice(0, 16) + '...'}`);
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

app.get('/health', (_, res) => res.json({ ok: true, peers: peers.size, usernames: usernames.size }));
app.get('/peers', (_, res) => res.json({ peers: Array.from(peers.keys()) }));
app.get('/usernames', (_, res) => {
  const result = {};
  for (const [name, pid] of usernames) result[name] = pid;
  res.json(result);
});

server.listen(PORT, () => {
  console.log(`[!] Signaling server running on port ${PORT}`);
});
