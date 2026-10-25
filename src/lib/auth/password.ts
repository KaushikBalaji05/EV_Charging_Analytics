import "server-only";
import { hash, verify } from "@node-rs/argon2";

// Argon2id (the library default) with the OWASP-recommended minimum cost:
// 19 MiB memory, 2 iterations, 1 lane. The salt is random per hash and stored inside the PHC string.
const ARGON2 = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (plain: string) => hash(plain, ARGON2);

/** Returns false (never throws) for a wrong password OR a malformed stored hash. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | null = null;

/**
 * Burns the same CPU time as a real check, so "unknown email" and "wrong password"
 * cannot be told apart by response time.
 */
export async function verifyAgainstDummy(plain: string): Promise<void> {
  dummy ??= hashPassword("timing-equaliser-not-a-real-password");
  await verifyPassword(await dummy, plain);
}
