import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64 } from 'tweetnacl-util';

interface ChainKey {
  key: Uint8Array;
  index: number;
}

interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

function hmacSha256(key: Uint8Array, data: Uint8Array): Uint8Array {
  const blockSize = 64;
  const keyLen = key.length;
  let k0 = key;
  if (keyLen > blockSize) {
    k0 = nacl.hash(key).slice(0, blockSize);
  }
  if (k0.length < blockSize) {
    const pad = new Uint8Array(blockSize);
    pad.set(k0);
    k0 = pad;
  }
  const opad = new Uint8Array(blockSize);
  const ipad = new Uint8Array(blockSize);
  for (let i = 0; i < blockSize; i++) {
    opad[i] = k0[i] ^ 0x5c;
    ipad[i] = k0[i] ^ 0x36;
  }
  const inner = nacl.hash(new Uint8Array([...ipad, ...data]));
  const outer = nacl.hash(new Uint8Array([...opad, ...inner.slice(0, 32)]));
  return nacl.hash(new Uint8Array([...opad, ...inner.slice(0, 32)])).slice(0, 32);
}

function deriveKeys(secret: Uint8Array): { chainKey: Uint8Array; messageKey: Uint8Array } {
  const chainKey = hmacSha256(new Uint8Array([0x01]), secret);
  const messageKey = hmacSha256(new Uint8Array([0x02]), secret);
  return { chainKey, messageKey };
}

function kdf(ck: Uint8Array, dhOut: Uint8Array): { rootKey: Uint8Array; chainKey: Uint8Array } {
  const secret = new Uint8Array(ck.length + dhOut.length);
  secret.set(ck);
  secret.set(dhOut, ck.length);
  const h = nacl.hash(secret);
  return { rootKey: h.slice(0, 32), chainKey: h.slice(32, 64) };
}

export class DoubleRatchet {
  private dhRatchet: KeyPair;
  private sendingChain: ChainKey | null;
  private receivingChain: ChainKey | null;
  private previousSendingChain: ChainKey | null;
  private rootKey: Uint8Array;
  private messageKeys: Map<number, Uint8Array>;

  constructor(
    sharedSecret: Uint8Array,
    ourKeyPair: KeyPair,
    isInitiator: boolean
  ) {
    this.dhRatchet = ourKeyPair;
    this.sendingChain = null;
    this.receivingChain = null;
    this.previousSendingChain = null;
    this.rootKey = sharedSecret;
    this.messageKeys = new Map();
  }

  encrypt(plaintext: Uint8Array): { header: any; ciphertext: Uint8Array } {
    let chain = this.sendingChain;
    if (!chain) {
      throw new Error('No sending chain');
    }
    const mk = hmacSha256(new Uint8Array([0x01]), chain.key);
    const nextCk = hmacSha256(new Uint8Array([0x02]), chain.key);
    chain.key = nextCk;
    chain.index++;
    const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
    const ciphertext = nacl.secretbox(plaintext, nonce, mk.slice(0, 32));
    const header = {
      dh: encodeBase64(this.dhRatchet.publicKey),
      pn: this.receivingChain?.index ?? 0,
      n: chain.index,
      nonce: encodeBase64(nonce),
    };
    return { header, ciphertext: ciphertext! };
  }

  decrypt(header: any, ciphertext: Uint8Array): Uint8Array | null {
    const dhPub = decodeBase64(header.dh);
    const nonce = decodeBase64(header.nonce);
    const msgNum = header.n;

    if (encodeBase64(dhPub) !== encodeBase64(this.dhRatchet.publicKey)) {
      this.skipMessageKeys(header.pn);
      this.doDhRatchet(dhPub);
    }
    this.skipMessageKeys(msgNum - 1);
    const mk = this.receivingChain?.key
      ? hmacSha256(new Uint8Array([0x01]), this.receivingChain.key)
      : null;
    if (mk && this.receivingChain) {
      this.receivingChain.key = hmacSha256(
        new Uint8Array([0x02]),
        this.receivingChain.key
      );
      this.receivingChain.index++;
    }
    if (!mk) return null;
    return nacl.secretbox.open(ciphertext, nonce, mk.slice(0, 32)) || null;
  }

  private doDhRatchet(dhPub: Uint8Array) {
    const shared = nacl.box.before(dhPub, this.dhRatchet.secretKey);
    const { rootKey, chainKey } = kdf(this.rootKey, shared);
    this.rootKey = rootKey;
    this.previousSendingChain = this.sendingChain;
    this.sendingChain = { key: chainKey, index: 0 };
    this.receivingChain = { key: chainKey, index: 0 };
  }

  private skipMessageKeys(until: number) {
    const chain = this.receivingChain;
    if (!chain) return;
    while (chain.index < until) {
      const mk = hmacSha256(new Uint8Array([0x01]), chain.key);
      chain.key = hmacSha256(new Uint8Array([0x02]), chain.key);
      this.messageKeys.set(chain.index, mk);
      chain.index++;
    }
  }
}
