import nacl from 'tweetnacl';
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util';

export interface KeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateKeyPair(): KeyPair {
  const kp = nacl.sign.keyPair();
  return { publicKey: kp.publicKey, secretKey: kp.secretKey };
}

export function publicKeyToId(pubKey: Uint8Array): string {
  return encodeBase64(pubKey);
}

export function idToPublicKey(id: string): Uint8Array {
  return decodeBase64(id);
}

export function exportKeyPair(kp: KeyPair): string {
  const data = { pub: encodeBase64(kp.publicKey), sec: encodeBase64(kp.secretKey) };
  return encodeBase64(decodeUTF8(JSON.stringify(data)));
}

export function importKeyPair(encoded: string): KeyPair {
  const raw = JSON.parse(encodeUTF8(decodeBase64(encoded)));
  return { publicKey: decodeBase64(raw.pub), secretKey: decodeBase64(raw.sec) };
}

export function signMessage(secretKey: Uint8Array, message: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

export function verifyMessage(publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}

export function encryptMessage(
  recipientPublicKey: Uint8Array,
  senderSecretKey: Uint8Array,
  message: Uint8Array
): { nonce: Uint8Array; ciphertext: Uint8Array } {
  const shared = nacl.box.before(recipientPublicKey, senderSecretKey);
  const nonce = nacl.randomBytes(nacl.box.nonceLength);
  const ciphertext = nacl.box.after(message, nonce, shared);
  return { nonce, ciphertext };
}

export function decryptMessage(
  senderPublicKey: Uint8Array,
  recipientSecretKey: Uint8Array,
  nonce: Uint8Array,
  ciphertext: Uint8Array
): Uint8Array | null {
  const shared = nacl.box.before(senderPublicKey, recipientSecretKey);
  const plaintext = nacl.box.open.after(ciphertext, nonce, shared);
  return plaintext || null;
}

export interface BoxKeyPair {
  publicKey: Uint8Array;
  secretKey: Uint8Array;
}

export function generateBoxKeyPair(): BoxKeyPair {
  return nacl.box.keyPair();
}

export function boxKeyPairToId(kp: BoxKeyPair): string {
  return encodeBase64(kp.publicKey);
}

export function exportBoxKeyPair(kp: BoxKeyPair): string {
  const data = { pub: encodeBase64(kp.publicKey), sec: encodeBase64(kp.secretKey) };
  return encodeBase64(decodeUTF8(JSON.stringify(data)));
}

export function importBoxKeyPair(encoded: string): BoxKeyPair {
  const raw = JSON.parse(encodeUTF8(decodeBase64(encoded)));
  return { publicKey: decodeBase64(raw.pub), secretKey: decodeBase64(raw.sec) };
}
