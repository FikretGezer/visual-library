// Giris akisi: /giris sayfasi, POST /_api/login, /_api/logout, /_api/me ve oturum dogrulama.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { normalizeEmail } from "./users-store.mjs";
import { newSession, verifySession, slideSession, ABSOLUTE_MS } from "./session.mjs";

export const COOKIE = "vl_session";
const USER_CACHE_MS = 60_000;
const MAX_BODY = 4096;

function parseCookies(header) {
  const out = {};
  for (const part of String(header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function sendJson(res, status, body, extraHeaders = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff", ...extraHeaders });
  res.end(JSON.stringify(body));
}

export async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY) throw Object.assign(new Error("too large"), { code: "TOO_LARGE" });
    chunks.push(c);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** Yalnizca site ici yollara izin verir (acik yonlendirmeyi engeller). */
function safeNext(next) {
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/";
}

const sha = (s) => createHash("sha256").update(String(s)).digest();

/**
 * localAdmin: { email, password } verilirse, AD'ye ve veritabanina bagli olmayan bir "acil durum yoneticisi"
 * tanimlanir (AD ya da veritabani kapaliyken de giris yapabilmek icin). Tabloda satiri olmaz.
 */
export function createAuth({ root, store, tmdauth, secret, limiter, isHttps = false, now = Date.now, localAdmin = null }) {
  if (typeof secret !== "string" || secret.length < 16 || secret === "DEGISTIR") {
    throw new Error("SESSION_SECRET tanimli degil ya da cok kisa (en az 16 karakter, 'DEGISTIR' olamaz). .env dosyasini duzenleyin.");
  }
  const userCache = new Map();
  let localUser = null;
  let localPasswordDigest = null;
  if (localAdmin) {
    const email = normalizeEmail(localAdmin.email);
    if (!email || typeof localAdmin.password !== "string" || localAdmin.password.length < 12) {
      throw new Error("LOCAL_ADMIN_EMAIL ve LOCAL_ADMIN_PASSWORD (en az 12 karakter) birlikte tanimlanmali.");
    }
    localUser = { id: 0, email, displayName: "Yerel yonetici", role: "admin", isActive: true, createdAt: null, createdBy: null, lastLoginAt: null };
    localPasswordDigest = sha(localAdmin.password);
  }

  const cookieHeader = (token, maxAgeSec) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${isHttps ? "; Secure" : ""}`;

  function sameOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  async function lookup(email) {
    if (localUser && email === localUser.email) return localUser;
    const hit = userCache.get(email);
    if (hit && now() - hit.at < USER_CACHE_MS) return hit.user;
    const user = await store.findByEmail(email);
    userCache.set(email, { user, at: now() });
    return user;
  }

  /** Gecerli oturum varsa { user, cookie } (cookie: kaydirilmis yeni Set-Cookie degeri), yoksa null. */
  async function authenticate(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const payload = verifySession(secret, token, now());
    if (!payload) return null;
    const user = await lookup(payload.email);
    if (!user || !user.isActive) return null;
    const remainingSec = Math.max(1, Math.floor((payload.abs - now()) / 1000));
    return { user, cookie: cookieHeader(slideSession(secret, payload, now()), remainingSec) };
  }

  async function handleLogin(req, res) {
    if (!sameOrigin(req)) return sendJson(res, 403, { error: "origin" });
    let body;
    try {
      body = await readJson(req);
    } catch {
      return sendJson(res, 413, { error: "too-large" });
    }
    const email = normalizeEmail(body.email);
    const password = typeof body.password === "string" ? body.password : "";
    const key = `${email}|${req.socket.remoteAddress ?? ""}`;
    if (limiter.blocked(key)) return sendJson(res, 429, { error: "locked" });

    // Yerel yonetici: AD'ye ve tabloya sorulmaz.
    if (localUser && email === localUser.email) {
      if (!timingSafeEqual(sha(password), localPasswordDigest)) {
        limiter.hit(key);
        return sendJson(res, 401, { error: "invalid" });
      }
      limiter.reset(key);
      return sendJson(res, 200, { next: safeNext(body.next), email: localUser.email, role: localUser.role }, {
        "set-cookie": cookieHeader(newSession(secret, email, now()), Math.floor(ABSOLUTE_MS / 1000)),
      });
    }

    const user = email ? await store.findByEmail(email) : null;
    if (!user || !user.isActive) {
      limiter.hit(key);
      return sendJson(res, 401, { error: "invalid" });
    }
    const r = await tmdauth.check(email, password);
    if (r.unavailable) return sendJson(res, 503, { error: "unavailable" });
    if (!r.ok) {
      limiter.hit(key);
      return sendJson(res, 401, { error: "invalid" });
    }
    limiter.reset(key);
    await store.touchLogin(user.id);
    userCache.set(email, { user, at: now() });
    sendJson(res, 200, { next: safeNext(body.next), email: user.email, role: user.role }, {
      "set-cookie": cookieHeader(newSession(secret, email, now()), Math.floor(ABSOLUTE_MS / 1000)),
    });
  }

  /** Oturumsuz erisilebilen uclari isler; islediyse true doner. */
  async function handle(req, res) {
    const path = (req.url ?? "/").split("?")[0];
    if (path === "/giris" && (req.method === "GET" || req.method === "HEAD")) {
      const html = readFileSync(join(root, "login.html"));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-length": html.length, "x-content-type-options": "nosniff", "cache-control": "no-store" });
      res.end(req.method === "HEAD" ? undefined : html);
      return true;
    }
    if (path === "/_api/login" && req.method === "POST") {
      await handleLogin(req, res);
      return true;
    }
    if (path === "/_api/logout" && req.method === "POST") {
      if (!sameOrigin(req)) sendJson(res, 403, { error: "origin" });
      else sendJson(res, 200, { ok: true }, { "set-cookie": cookieHeader("", 0) });
      return true;
    }
    if (path === "/_api/me" && req.method === "GET") {
      const s = await authenticate(req);
      if (!s) sendJson(res, 401, { error: "auth" });
      else sendJson(res, 200, { email: s.user.email, role: s.user.role, displayName: s.user.displayName });
      return true;
    }
    return false;
  }

  return { authenticate, handle, sameOrigin };
}
