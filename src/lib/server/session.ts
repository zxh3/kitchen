import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { dev } from "$app/environment";
import { env } from "$env/dynamic/private";
import type { Cookies } from "@sveltejs/kit";
import type { ModalCredentials } from "$lib/server/modal";

const PRODUCTION_COOKIE = "__Host-kitchen-session";
const DEVELOPMENT_COOKIE = "kitchen-session";
const COOKIE_VERSION = "v1";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_CREDENTIAL_LENGTH = 512;
const devKey = randomBytes(32);

export type CredentialSession =
  | ({ kind: "modal" } & ModalCredentials)
  | { kind: "server" };

interface SessionEnvelope {
  expiresAt: number;
  session: CredentialSession;
}

export class SessionConfigurationError extends Error {}

function cookieName(): string {
  return dev ? DEVELOPMENT_COOKIE : PRODUCTION_COOKIE;
}

function encryptionKey(): Buffer {
  const secret = env.KITCHEN_SESSION_SECRET;
  if (!secret) {
    if (dev) return devKey;
    throw new SessionConfigurationError(
      "KITCHEN_SESSION_SECRET must be configured before browser sessions can be created.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

function encodePart(value: Buffer): string {
  return value.toString("base64url");
}

function decodePart(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function cookieValue(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== cookieName()) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function validModalSession(
  value: unknown,
): value is Extract<CredentialSession, { kind: "modal" }> {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return (
    session.kind === "modal" &&
    typeof session.tokenId === "string" &&
    session.tokenId.length > 0 &&
    session.tokenId.length <= MAX_CREDENTIAL_LENGTH &&
    typeof session.tokenSecret === "string" &&
    session.tokenSecret.length > 0 &&
    session.tokenSecret.length <= MAX_CREDENTIAL_LENGTH &&
    (session.environment === undefined ||
      (typeof session.environment === "string" &&
        session.environment.length <= MAX_CREDENTIAL_LENGTH))
  );
}

function validSession(value: unknown): value is CredentialSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;
  return session.kind === "server" || validModalSession(value);
}

function seal(session: CredentialSession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(COOKIE_VERSION));
  const envelope: SessionEnvelope = {
    expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000,
    session,
  };
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(envelope), "utf8"),
    cipher.final(),
  ]);
  return [
    COOKIE_VERSION,
    encodePart(iv),
    encodePart(ciphertext),
    encodePart(cipher.getAuthTag()),
  ].join(".");
}

function open(value: string): CredentialSession | null {
  try {
    const [version, ivPart, ciphertextPart, tagPart, extra] = value.split(".");
    if (
      version !== COOKIE_VERSION ||
      !ivPart ||
      !ciphertextPart ||
      !tagPart ||
      extra
    ) {
      return null;
    }
    const iv = decodePart(ivPart);
    const tag = decodePart(tagPart);
    if (iv.length !== 12 || tag.length !== 16) return null;
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
    decipher.setAAD(Buffer.from(COOKIE_VERSION));
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(decodePart(ciphertextPart)),
      decipher.final(),
    ]).toString("utf8");
    const envelope = JSON.parse(plaintext) as Partial<SessionEnvelope>;
    if (
      typeof envelope.expiresAt !== "number" ||
      envelope.expiresAt <= Date.now() ||
      !validSession(envelope.session)
    ) {
      return null;
    }
    return envelope.session;
  } catch {
    return null;
  }
}

export function credentialSessionFrom(
  request: Request,
): CredentialSession | null {
  const value = cookieValue(request);
  return value ? open(value) : null;
}

export function setCredentialSession(
  cookies: Cookies,
  session: CredentialSession,
): void {
  cookies.set(cookieName(), seal(session), {
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
    sameSite: "strict",
    secure: !dev,
  });
}

export function clearCredentialSession(cookies: Cookies): void {
  cookies.delete(cookieName(), { path: "/" });
  cookies.delete(dev ? PRODUCTION_COOKIE : DEVELOPMENT_COOKIE, { path: "/" });
}

export function serverAccessAllowed(candidate: string): boolean {
  const expected = env.KITCHEN_ACCESS_TOKEN;
  if (!expected || !candidate) return false;
  const expectedHash = createHash("sha256").update(expected).digest();
  const candidateHash = createHash("sha256").update(candidate).digest();
  return timingSafeEqual(expectedHash, candidateHash);
}
