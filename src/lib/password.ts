// Password hashing with Node's built-in scrypt — no native/3rd-party deps
// (bcrypt/argon2 would need a native build that can break on Vercel).
//
// Deliberately NOT `server-only`: prisma/seed.ts (run via tsx, outside Next) and
// scripts/seed-admin.ts import this to hash the bootstrap admin password.
import {
  scrypt,
  randomBytes,
  timingSafeEqual,
  type BinaryLike,
  type ScryptOptions,
} from "node:crypto";

// promisify(scrypt) can't infer the options overload, so wrap it by hand.
function scryptAsync(
  password: BinaryLike,
  salt: BinaryLike,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey as Buffer);
    });
  });
}

// scrypt cost parameters. N must be a power of two; 16384 is a sane interactive default.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;

/** Hash a plaintext password into a self-describing string: `scrypt$N$r$p$<salt>$<hash>`. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(plain, salt, KEYLEN, { N, r: R, p: P })) as Buffer;
  return [
    "scrypt",
    N,
    R,
    P,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * Verify a plaintext password against a stored `scrypt$...` hash in constant time.
 * Returns false for any malformed/empty stored value (never throws) so callers can
 * feed it a dummy hash to equalize timing when the user doesn't exist.
 */
export async function verifyPassword(plain: string, stored: string | null): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let saltBuf: Buffer;
  let hashBuf: Buffer;
  try {
    saltBuf = Buffer.from(parts[4], "base64");
    hashBuf = Buffer.from(parts[5], "base64");
  } catch {
    return false;
  }

  let derived: Buffer;
  try {
    derived = (await scryptAsync(plain, saltBuf, hashBuf.length, { N: n, r, p })) as Buffer;
  } catch {
    return false;
  }
  if (derived.length !== hashBuf.length) return false;
  return timingSafeEqual(derived, hashBuf);
}

// A real hashPassword() output (same N/r/p and 32-byte keylen), used to spend
// ~equal CPU when the looked-up user is missing — verifyPassword runs scrypt to
// completion, mitigating user-enumeration via response timing.
export const DUMMY_HASH =
  "scrypt$16384$8$1$KQDo020fUocuz9B6uQe2CA==$irNvxxmMg0ZCF0a2f3E57DQeNN95640azx3Tr+aPGYc=";
