import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { createAuth } from "../auth/routes.mjs";
import { createMemoryStore } from "../auth/users-store.mjs";
import { createRateLimiter } from "../auth/rate-limit.mjs";
import { newSession } from "../auth/session.mjs";

const SECRET = "test-secret-0123456789abcdef";

async function boot({ tmd, isHttps = false, clock, localAdmin } = {}) {
  const root = mkdtempSync(join(tmpdir(), "vl-auth-"));
  writeFileSync(join(root, "gallery.html"), "<h1>galeri</h1>");
  writeFileSync(join(root, "login.html"), "<h1>giris</h1>");
  for (const n of ["logo.png", "logo-mark.png", "favicon.png", "favicon.ico", "apple-touch-icon.png"]) writeFileSync(join(root, n), "img");
  const store = createMemoryStore();
  await store.create({ email: "ali@x.com", role: "user" });
  await store.create({ email: "pasif@x.com", role: "user" });
  const pasif = await store.findByEmail("pasif@x.com");
  await store.update(pasif.id, { isActive: false });
  const now = clock ?? (() => Date.now());
  const tmdauth = tmd ?? { isEnabled: () => true, check: async (e, p) => (p === "dogru" ? { ok: true } : { ok: false, unavailable: false }) };
  const limiter = createRateLimiter({ max: 5, windowMs: 900_000, now });
  const auth = createAuth({ root, store, tmdauth, secret: SECRET, limiter, isHttps, now, localAdmin });
  const server = http.createServer(createApp(root, { auth }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => { server.closeAllConnections(); server.close(); rmSync(root, { recursive: true, force: true }); };
  return { base, store, close, root };
}

const post = (url, body, headers = {}) =>
  fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
const cookieOf = (res) => (res.headers.get("set-cookie") ?? "").split(";")[0];
const login = (base, email = "ali@x.com", password = "dogru", extra = {}) => post(base + "/_api/login", { email, password, ...extra });

test("cerezsiz istek /giris'e yonlenir, /giris acik, API 401", async () => {
  const { base, close } = await boot();
  try {
    const r = await fetch(base + "/", { redirect: "manual" });
    assert.equal(r.status, 302);
    assert.equal(r.headers.get("location"), "/giris?next=%2F");
    const sub = await fetch(base + "/a/b.html?x=1", { redirect: "manual" });
    assert.equal(sub.headers.get("location"), "/giris?next=%2Fa%2Fb.html%3Fx%3D1");
    const g = await fetch(base + "/giris");
    assert.equal(g.status, 200);
    assert.match(await g.text(), /giris/);
    assert.equal((await fetch(base + "/_api/me")).status, 401);
  } finally { close(); }
});

test("kayitli + aktif + AD dogru: giris olur, sayfa acilir, /_api/me kim oldugunu soyler", async () => {
  const { base, close } = await boot();
  try {
    const r = await login(base, "  ALI@x.com ");
    assert.equal(r.status, 200);
    const ck = cookieOf(r);
    assert.match(ck, /^vl_session=/);
    const flags = r.headers.get("set-cookie");
    assert.match(flags, /HttpOnly/i);
    assert.match(flags, /SameSite=Lax/i);
    assert.doesNotMatch(flags, /Secure/i);
    const page = await fetch(base + "/", { headers: { cookie: ck } });
    assert.equal(page.status, 200);
    assert.match(await page.text(), /galeri/);
    const me = await (await fetch(base + "/_api/me", { headers: { cookie: ck } })).json();
    assert.equal(me.email, "ali@x.com");
    assert.equal(me.role, "user");
  } finally { close(); }
});

test("kayitsiz, pasif ve yanlis parola: ayni 401 govdesi; kayitsiz icin AD'ye sorulmaz", async () => {
  let asked = 0;
  const tmd = { isEnabled: () => true, check: async (e, p) => { asked++; return p === "dogru" ? { ok: true } : { ok: false, unavailable: false }; } };
  const { base, close } = await boot({ tmd });
  try {
    const bodies = [];
    for (const [e, p] of [["yok@x.com", "dogru"], ["pasif@x.com", "dogru"], ["ali@x.com", "yanlis"]]) {
      const r = await login(base, e, p);
      assert.equal(r.status, 401);
      bodies.push(await r.text());
    }
    assert.equal(new Set(bodies).size, 1);
    assert.equal(asked, 1);
  } finally { close(); }
});

test("AD ulasilamazsa 503; 5 yanlistan sonra dogru parola bile 429", async () => {
  const down = { isEnabled: () => true, check: async () => ({ ok: false, unavailable: true }) };
  const a = await boot({ tmd: down });
  try {
    const r = await login(a.base);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, "unavailable");
  } finally { a.close(); }

  const b = await boot();
  try {
    for (let i = 0; i < 5; i++) assert.equal((await login(b.base, "ali@x.com", "yanlis")).status, 401);
    const locked = await login(b.base, "ali@x.com", "dogru");
    assert.equal(locked.status, 429);
    assert.equal((await locked.json()).error, "locked");
  } finally { b.close(); }
});

test("next: yalnizca site ici yollar kabul edilir", async () => {
  const { base, close } = await boot();
  try {
    for (const [next, want] of [["/a/b", "/a/b"], ["//evil.com", "/"], ["https://evil.com", "/"], ["/\\evil.com", "/"], ["", "/"]]) {
      const r = await login(base, "ali@x.com", "dogru", { next });
      assert.equal((await r.json()).next, want, next);
    }
  } finally { close(); }
});

test("yanlis Origin ile giris ve cikis 403", async () => {
  const { base, close } = await boot();
  try {
    assert.equal((await post(base + "/_api/login", { email: "ali@x.com", password: "dogru" }, { origin: "http://evil.com" })).status, 403);
    const host = new URL(base).host;
    assert.equal((await post(base + "/_api/login", { email: "ali@x.com", password: "dogru" }, { origin: `http://${host}` })).status, 200);
    assert.equal((await post(base + "/_api/logout", {}, { origin: "http://evil.com" })).status, 403);
  } finally { close(); }
});

test("bozulmus ya da suresi dolmus cerez /giris'e yonlenir; cikis cerezi siler", async () => {
  const { base, close } = await boot();
  try {
    const ck = cookieOf(await login(base));
    const bad = ck.slice(0, -2) + "xx";
    assert.equal((await fetch(base + "/", { headers: { cookie: bad }, redirect: "manual" })).status, 302);
    const expired = `vl_session=${newSession(SECRET, "ali@x.com", Date.now() - 40 * 86_400_000)}`;
    assert.equal((await fetch(base + "/", { headers: { cookie: expired }, redirect: "manual" })).status, 302);
    const out = await post(base + "/_api/logout", {}, { cookie: ck });
    assert.equal(out.status, 200);
    assert.match(out.headers.get("set-cookie"), /Max-Age=0/i);
  } finally { close(); }
});

test("pasife alinan kullanicinin acik oturumu onbellek dolunca duser", async () => {
  let t = Date.now();
  const { base, store, close } = await boot({ clock: () => t });
  try {
    const ck = cookieOf(await login(base));
    assert.equal((await fetch(base + "/", { headers: { cookie: ck } })).status, 200);
    const ali = await store.findByEmail("ali@x.com");
    await store.update(ali.id, { isActive: false });
    assert.equal((await fetch(base + "/", { headers: { cookie: ck } })).status, 200); // onbellek henuz gecerli
    t += 61_000;
    assert.equal((await fetch(base + "/", { headers: { cookie: ck }, redirect: "manual" })).status, 302);
  } finally { close(); }
});

test("kabul edilen istekte cerez yenilenir; isHttps iken Secure", async () => {
  const { base, close } = await boot({ isHttps: true });
  try {
    const r = await login(base);
    assert.match(r.headers.get("set-cookie"), /Secure/i);
    const again = await fetch(base + "/", { headers: { cookie: cookieOf(r) } });
    assert.match(again.headers.get("set-cookie") ?? "", /^vl_session=/);
  } finally { close(); }
});

test("SESSION_SECRET bos ya da DEGISTIR ise createAuth firlatir", () => {
  const base = { root: ".", store: createMemoryStore(), tmdauth: {}, limiter: createRateLimiter({}), isHttps: false };
  for (const secret of ["", "DEGISTIR", "kisa"]) assert.throws(() => createAuth({ ...base, secret }), /SESSION_SECRET/);
});

const LOCAL = { email: "yerel@yerel", password: "cok-uzun-yerel-parola" };
const explodingTmd = { isEnabled: () => true, check: async () => { throw new Error("AD'ye sorulmamali"); } };

test("yerel yonetici: AD'ye ve tabloya bakmadan girer, rolu admin", async () => {
  const { base, close } = await boot({ localAdmin: LOCAL, tmd: explodingTmd });
  try {
    const r = await login(base, "  YEREL@yerel ", LOCAL.password);
    assert.equal(r.status, 200);
    const ck = cookieOf(r);
    assert.equal((await fetch(base + "/", { headers: { cookie: ck } })).status, 200);
    const me = await (await fetch(base + "/_api/me", { headers: { cookie: ck } })).json();
    assert.equal(me.email, "yerel@yerel");
    assert.equal(me.role, "admin");
  } finally { close(); }
});

test("yerel yonetici: yanlis parola 401, 5 yanlistan sonra 429, AD'ye sorulmaz", async () => {
  const { base, close } = await boot({ localAdmin: LOCAL, tmd: explodingTmd });
  try {
    for (let i = 0; i < 5; i++) assert.equal((await login(base, LOCAL.email, "yanlis-parola-xx")).status, 401);
    assert.equal((await login(base, LOCAL.email, LOCAL.password)).status, 429);
  } finally { close(); }
});

test("yerel yonetici: tablodaki normal kullanici etkilenmez, yerel hesap kapaliyken yerel e-posta reddedilir", async () => {
  const on = await boot({ localAdmin: LOCAL });
  try {
    assert.equal((await login(on.base, "ali@x.com", "dogru")).status, 200);
    assert.equal((await login(on.base, "ali@x.com", LOCAL.password)).status, 401);
  } finally { on.close(); }
  const off = await boot();
  try {
    assert.equal((await login(off.base, LOCAL.email, LOCAL.password)).status, 401);
  } finally { off.close(); }
});

test("localAdmin: kisa parola ya da eksik alan createAuth'u firlatir", () => {
  const base = { root: ".", store: createMemoryStore(), tmdauth: {}, limiter: createRateLimiter({}), isHttps: false, secret: SECRET };
  assert.throws(() => createAuth({ ...base, localAdmin: { email: "a@b", password: "kisa" } }), /LOCAL_ADMIN/);
  assert.throws(() => createAuth({ ...base, localAdmin: { email: "", password: "cok-uzun-yerel-parola" } }), /LOCAL_ADMIN/);
  assert.doesNotThrow(() => createAuth({ ...base, localAdmin: { email: "a@b", password: "cok-uzun-yerel-parola" } }));
});
test("logo ve ikon dosyalari giris yapmadan acilir, diger dosyalar acilmaz", async () => {
  const { base, close } = await boot();
  try {
    for (const p of ["/logo.png", "/logo-mark.png", "/favicon.png", "/favicon.ico", "/apple-touch-icon.png"]) {
      const r = await fetch(base + p, { redirect: "manual" });
      assert.equal(r.status, 200, p);
      assert.match(r.headers.get("content-type"), /^image\//, p);
    }
    assert.equal((await fetch(base + "/library.js", { redirect: "manual" })).status, 302);
    assert.equal((await fetch(base + "/logo.png", { method: "POST", redirect: "manual" })).status, 401);
  } finally { close(); }
});