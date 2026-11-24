// Imzali oturum jetonu: base64url(yuk).base64url(HMAC-SHA256). Sunucuda oturum durumu tutulmaz.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SLIDING_MS = 14 * 24 * 60 * 60 * 1000;
export const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

const mac = (secret, data) => createHmac("sha256", secret).update(data).digest("base64url");

function sign(secret, payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** Yeni oturum: 14 gun kayan, 30 gun mutlak. */
export function newSession(secret, email, now = Date.now()) {
  return sign(secret, { email, iat: now, exp: now + SLIDING_MS, abs: now + ABSOLUTE_MS });
}

/** Gecerliyse yuku, degilse null doner (bozuk bicim, kotu imza, suresi dolmus). */
export function verifySession(secret, token, now = Date.now()) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = Buffer.from(mac(secret, body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let p;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!p || typeof p.email !== "string" || ![p.iat, p.exp, p.abs].every(Number.isFinite)) return null;
  if (p.exp <= now || p.abs <= now) return null;
  return p;
}

/** Ayni oturumu kaydirir: yeni exp = min(now + 14 gun, mutlak son). */
export function slideSession(secret, payload, now = Date.now()) {
  return sign(secret, { ...payload, exp: Math.min(now + SLIDING_MS, payload.abs) });
}
