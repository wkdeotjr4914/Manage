// Symmetric encryption for stored OAuth tokens (Google refresh/access tokens).
//
// Kept dependency-free (only node:crypto) like password.ts / session-crypto.ts.
// The key is DERIVED from AUTH_SECRET via scrypt with a fixed, purpose-specific
// salt so it can't collide with the session HMAC use of the same secret. Set an
// optional GOOGLE_TOKEN_KEY to rotate the token key independently of AUTH_SECRET.
//
// Output is self-describing (mirrors password.ts): `v1$<ivB64>$<tagB64>$<cipherB64>`.
// AES-256-GCM gives confidentiality + integrity (authTag detects tampering).
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";

const IV_BYTES = 12; // GCM standard nonce length
const KEY_BYTES = 32; // AES-256
// Bumping this salt (or the "v1" prefix) invalidates all existing ciphertexts,
// forcing users to reconnect — do so only on a deliberate key rotation.
const KEY_SALT = "google-oauth-v1";

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const material = process.env.GOOGLE_TOKEN_KEY || process.env.AUTH_SECRET;
  if (!material || material.length < 16) {
    throw new Error(
      "AUTH_SECRET(또는 GOOGLE_TOKEN_KEY) 환경변수가 없거나 너무 짧습니다(16자 이상). 구글 토큰 암호화에 필요합니다.",
    );
  }
  // Pin scrypt cost params explicitly: Node's defaults could change across
  // versions, which would silently break decryption of every stored token.
  cachedKey = scryptSync(material, KEY_SALT, KEY_BYTES, { N: 16384, r: 8, p: 1 });
  return cachedKey;
}

/** Encrypt a token string into `v1$<iv>$<tag>$<cipher>` (all base64). */
export function encryptToken(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join("$");
}

/** Decrypt a `v1$...` token ciphertext. Throws on malformed/tampered input. */
export function decryptToken(stored: string): string {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("토큰 복호화 실패: 형식이 올바르지 않습니다.");
  }
  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const data = Buffer.from(parts[3], "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
