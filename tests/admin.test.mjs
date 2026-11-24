import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server.mjs";
import { createAuth } from "../auth/routes.mjs";
import { createAdmin } from "../auth/admin-routes.mjs";
import { createMemoryStore } from "../auth/users-store.mjs";
import { createUsersService } from "../auth/users-service.mjs";
import { createRateLimiter } from "../auth/rate-limit.mjs";
import { startUpdater } from "../updater.mjs";

async function boot(onUpdate) {
  const root = mkdtempSync(join(tmpdir(), "vl-adm-"));
  writeFileSync(join(root, "gallery.html"), "<h1>galeri</h1>");
  writeFileSync(join(root, "login.html"), "<h1>giris</h1>");
  writeFileSync(join(root, "yonetim.html"), "<h1>yonetim</h1>");
  const store = createMemoryStore();
  await store.create({ email: "admin@x.com", role: "admin" });
  await store.create({ email: "user@x.com", role: "user" });
  const tmdauth = { isEnabled: () => true, check: async () => ({ ok: true }) };
  const auth = createAuth({ root, store, tmdauth, secret: "test-secret-0123456789abcdef", limiter: createRateLimiter({}), isHttps: false });
  const updater = startUpdater({ root, repo: "x/y", branch: "main", minutes: 0, update: onUpdate, onSelfChange: () => {}, log: () => {} });
  const admin = createAdmin({ service: createUsersService(store), onUpdate: updater.trigger, getStatus: updater.status, sameOrigin: auth.sameOrigin, root });
  const server = http.createServer(createApp(root, { auth, admin }));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const loginAs = async (email) => {
    const r = await fetch(base + "/_api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "x" }) });
    return (r.headers.get("set-cookie") ?? "").split(";")[0];
  };
  const api = (cookie, method, path, body, headers = {}) =>
    fetch(base + path, { method, redirect: "manual", headers: { cookie, "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { base, store, api, adminCk: await loginAs("admin@x.com"), userCk: await loginAs("user@x.com"), close: () => { server.closeAllConnections(); server.close(); rmSync(root, { recursive: true, force: true }); } };
}

test("user rolu yonetim sayfasi ve kullanici uclarina giremez; oturumsuz 302/401", async () => {
  const s = await boot(async () => ({ method: "git", changedFiles: [] }));
  try {
    assert.equal((await s.api(s.userCk, "GET", "/yonetim")).status, 403);
    assert.equal((await s.api(s.userCk, "GET", "/yonetim.html")).status, 403);
    assert.equal((await s.api(s.userCk, "GET", "/_api/users")).status, 403);
    assert.equal((await s.api(s.userCk, "POST", "/_api/update", {})).status, 403);
    assert.equal((await s.api("", "GET", "/yonetim")).status, 302);
    assert.equal((await s.api("", "GET", "/_api/users")).status, 401);
    const page = await s.api(s.adminCk, "GET", "/yonetim");
    assert.equal(page.status, 200);
    assert.match(await page.text(), /yonetim/);
  } finally { s.close(); }
});

test("admin: listele, ekle, rol degistir, pasife al, sil", async () => {
  const s = await boot(async () => ({}));
  try {
    const list = await (await s.api(s.adminCk, "GET", "/_api/users")).json();
    assert.equal(list.length, 2);
    const add = await s.api(s.adminCk, "POST", "/_api/users", { email: " Yeni@X.com ", displayName: "Yeni", role: "user" });
    assert.equal(add.status, 201);
    const created = await add.json();
    assert.equal(created.email, "yeni@x.com");
    assert.equal(created.createdBy, "admin@x.com");
    assert.equal((await (await s.api(s.adminCk, "PATCH", `/_api/users/${created.id}`, { role: "admin" })).json()).role, "admin");
    assert.equal((await (await s.api(s.adminCk, "PATCH", `/_api/users/${created.id}`, { isActive: false })).json()).isActive, false);
    assert.equal((await s.api(s.adminCk, "DELETE", `/_api/users/${created.id}`)).status, 200);
    assert.equal(await s.store.findByEmail("yeni@x.com"), null);
  } finally { s.close(); }
});

test("hata kodlari: DUPLICATE 409, INVALID_EMAIL 400, SELF_ACTION/LAST_ADMIN 409, NOT_FOUND 404", async () => {
  const s = await boot(async () => ({}));
  try {
    assert.equal((await s.api(s.adminCk, "POST", "/_api/users", { email: "USER@x.com", role: "user" })).status, 409);
    assert.equal((await s.api(s.adminCk, "POST", "/_api/users", { email: "abc", role: "user" })).status, 400);
    const adm = await s.store.findByEmail("admin@x.com");
    const self = await s.api(s.adminCk, "DELETE", `/_api/users/${adm.id}`);
    assert.equal(self.status, 409);
    assert.equal((await self.json()).error, "SELF_ACTION");
    assert.equal((await s.api(s.adminCk, "DELETE", "/_api/users/9999")).status, 404);
    const usr = await s.store.findByEmail("user@x.com");
    await s.api(s.adminCk, "PATCH", `/_api/users/${usr.id}`, { role: "admin" });
    const second = await s.store.findByEmail("user@x.com");
    await s.api(s.adminCk, "PATCH", `/_api/users/${second.id}`, { isActive: false });
    // admin tek basina aktif: baskasi olmadigindan kendi islemleri SELF_ACTION; son admin korumasi servis testinde.
    assert.equal((await s.api(s.adminCk, "PATCH", `/_api/users/${adm.id}`, { role: "user" })).status, 409);
  } finally { s.close(); }
});

test("uzaktan guncelleme: admin sonucu alir, es zamanli 409, yanlis Origin 403, durum", async () => {
  let release;
  let calls = 0;
  const s = await boot(() => new Promise((r) => { calls++; release = () => r({ method: "zip", changedFiles: ["a.html"], at: "t" }); }));
  try {
    assert.equal((await s.api(s.adminCk, "POST", "/_api/update", {}, { origin: "http://evil.com" })).status, 403);
    const first = s.api(s.adminCk, "POST", "/_api/update", {});
    await new Promise((r) => setTimeout(r, 50));
    const second = await s.api(s.adminCk, "POST", "/_api/update", {});
    assert.equal(second.status, 409);
    assert.equal(calls, 1);
    release();
    const res = await (await first).json();
    assert.deepEqual(res.changedFiles, ["a.html"]);
    const st = await (await s.api(s.adminCk, "GET", "/_api/update/status")).json();
    assert.equal(st.method, "zip");
    assert.equal((await s.api(s.userCk, "GET", "/_api/update/status")).status, 403);
  } finally { s.close(); }
});

test("kullanici ekleme/silme yanlis Origin ile 403", async () => {
  const s = await boot(async () => ({}));
  try {
    assert.equal((await s.api(s.adminCk, "POST", "/_api/users", { email: "z@x.com", role: "user" }, { origin: "http://evil.com" })).status, 403);
    assert.equal((await s.api(s.adminCk, "DELETE", "/_api/users/1", undefined, { origin: "http://evil.com" })).status, 403);
  } finally { s.close(); }
});
