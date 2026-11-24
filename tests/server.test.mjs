import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveSafe, createApp, readPort } from "../server.mjs";

let root;
let server;
let base;

before(async () => {
  root = mkdtempSync(join(tmpdir(), "vl-"));
  writeFileSync(join(root, "gallery.html"), "<h1>galeri</h1>");
  mkdirSync(join(root, "a"));
  writeFileSync(join(root, "a", "index.html"), "<h1>a</h1>");
  writeFileSync(join(root, ".env"), "SECRET=1");
  writeFileSync(join(root, "server.mjs"), "x");
  writeFileSync(join(root, "x.bat"), "x");
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "x.md"), "x");
  mkdirSync(join(root, "tests"));
  writeFileSync(join(root, "tests", "t.mjs"), "x");
  writeFileSync(join(root, "..secret"), "x");
  server = http.createServer(createApp(root));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  rmSync(root, { recursive: true, force: true });
});

test("resolveSafe: / ve klasor adresleri index dosyasina gider", () => {
  assert.equal(resolveSafe(root, "/"), resolve(root, "gallery.html"));
  assert.equal(resolveSafe(root, "/a/"), resolve(root, "a", "index.html"));
});

test("resolveSafe: yasakli dosyalar null doner", () => {
  for (const p of ["/.env", "/.git/config", "/server.mjs", "/x.bat", "/docs/x.md", "/tests/t.mjs", "/package.json", "/auth/x.js", "/sql/0001_users.sql", "/node_modules/x/index.js"]) {
    assert.equal(resolveSafe(root, p), null, p);
  }
});

test("resolveSafe: yol gecisi ve bozuk yuzde kodu null doner", () => {
  for (const p of ["/%2e%2e/secret", "/..%5csecret", "/a/../../secret", "/%E0%A4%A", "/a/%2e%2e/%2e%2e/x"]) {
    assert.equal(resolveSafe(root, p), null, p);
  }
});

test("HTTP: / 200 html, alt sayfa 200, yok 404", async () => {
  const r = await fetch(base + "/");
  assert.equal(r.status, 200);
  assert.match(r.headers.get("content-type"), /text\/html/);
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await fetch(base + "/a/index.html")).status, 200);
  assert.equal((await fetch(base + "/yok")).status, 404);
});

test("HTTP: .env 404, bozuk yuzde kodu 400, POST 405", async () => {
  assert.equal((await fetch(base + "/.env")).status, 404);
  assert.equal((await fetch(base + "/%E0%A4%A")).status, 400);
  assert.equal((await fetch(base + "/", { method: "POST" })).status, 405);
});

test("HTTP: HEAD 200 govdesiz", async () => {
  const r = await fetch(base + "/", { method: "HEAD" });
  assert.equal(r.status, 200);
  assert.equal((await r.text()), "");
});

test("readPort: gecersiz deger 4099'a duser", () => {
  assert.equal(readPort({}), 4099);
  assert.equal(readPort({ PORT: "abc" }), 4099);
  assert.equal(readPort({ PORT: "70000" }), 4099);
  assert.equal(readPort({ PORT: "5000" }), 5000);
});

test("/_guncelle: yerelden POST sonucu doner, GET 404, uzak adres 404, mesgulse 409", async () => {
  const mk = async (deps) => {
    const s = http.createServer(createApp(root, deps));
    await new Promise((r) => s.listen(0, "127.0.0.1", r));
    return { s, url: `http://127.0.0.1:${s.address().port}` };
  };
  const ok = await mk({ onUpdate: async () => ({ method: "git", changedFiles: ["a.txt"], at: "t" }) });
  const r = await fetch(ok.url + "/_guncelle", { method: "POST" });
  assert.equal(r.status, 200);
  assert.deepEqual((await r.json()).changedFiles, ["a.txt"]);
  assert.equal((await fetch(ok.url + "/_guncelle")).status, 404);
  ok.s.close();

  const remote = await mk({ onUpdate: async () => ({}), isLocal: () => false });
  assert.equal((await fetch(remote.url + "/_guncelle", { method: "POST" })).status, 404);
  remote.s.close();

  const busy = await mk({ onUpdate: async () => { const e = new Error("x"); e.code = "BUSY"; throw e; } });
  assert.equal((await fetch(busy.url + "/_guncelle", { method: "POST" })).status, 409);
  busy.s.close();
});

async function freePort() {
  const net = await import("node:net");
  return new Promise((res) => {
    const s = net.createServer().listen(0, () => { const p = s.address().port; s.close(() => res(p)); });
  });
}
const serverPath = fileURLToPath(new URL("../server.mjs", import.meta.url));

test("server.mjs dogrudan calisinca PORT'tan dinler: /giris 200, / giris ister", async () => {
  const { spawn } = await import("node:child_process");
  const port = await freePort();
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, VL_ENV_FILE: "yok-test.env", PORT: String(port), UPDATE_MINUTES: "0", DEV_MEMORY_STORE: "true", SESSION_SECRET: "smoke-secret-0123456789", ADMIN_EMAILS: "a@x.com" },
    stdio: "ignore",
  });
  try {
    let status = 0;
    for (let i = 0; i < 40 && !status; i++) {
      try { status = (await fetch(`http://127.0.0.1:${port}/giris`)).status; } catch { await new Promise((r) => setTimeout(r, 100)); }
    }
    assert.equal(status, 200);
    assert.equal((await fetch(`http://127.0.0.1:${port}/`, { redirect: "manual" })).status, 302);
  } finally {
    child.kill();
  }
});

test("server.mjs SESSION_SECRET olmadan baslamaz (guvenli taraf)", async () => {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(process.execPath, [serverPath], {
    env: { ...process.env, VL_ENV_FILE: "yok-test.env", PORT: String(await freePort()), UPDATE_MINUTES: "0", DEV_MEMORY_STORE: "true", SESSION_SECRET: "DEGISTIR" },
    encoding: "utf8", timeout: 15000,
  });
  assert.equal(r.status, 78); // 78 = ayar hatasi: Baslat.bat yeniden denemez
  assert.match(r.stderr, /SESSION_SECRET/);
});

test("server.mjs DATABASE_URL yoksa baslamaz", async () => {
  const { spawnSync } = await import("node:child_process");
  const env = { ...process.env, VL_ENV_FILE: "yok-test.env", PORT: String(await freePort()), UPDATE_MINUTES: "0", SESSION_SECRET: "smoke-secret-0123456789" };
  delete env.DATABASE_URL; delete env.DEV_MEMORY_STORE;
  const r = spawnSync(process.execPath, [serverPath], { env, encoding: "utf8", timeout: 15000 });
  assert.equal(r.status, 78); // 78 = ayar hatasi: Baslat.bat yeniden denemez
  assert.match(r.stderr, /DATABASE_URL/);
});