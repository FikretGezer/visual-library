import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { copyTree, updateOnce, startUpdater } from "../updater.mjs";

const tmp = () => mkdtempSync(join(tmpdir(), "vl-up-"));
const git = (cwd, ...args) =>
  execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd, stdio: "pipe" }).toString();

test("copyTree: yalnizca yeni/degisen dosyalari yazar, skip listesine dokunmaz", () => {
  const src = tmp(), dst = tmp();
  writeFileSync(join(src, "a.txt"), "yeni");
  writeFileSync(join(src, "b.txt"), "degisti");
  writeFileSync(join(src, "c.txt"), "ayni");
  writeFileSync(join(src, ".env"), "KAYNAK");
  mkdirSync(join(src, "paketler"));
  writeFileSync(join(src, "paketler", "z"), "z");
  writeFileSync(join(dst, "b.txt"), "eski");
  writeFileSync(join(dst, "c.txt"), "ayni");
  writeFileSync(join(dst, ".env"), "HEDEF");
  const changed = copyTree(src, dst, [".env", "paketler", ".git"]).sort();
  assert.deepEqual(changed, ["a.txt", "b.txt"]);
  assert.equal(readFileSync(join(dst, ".env"), "utf8"), "HEDEF");
  assert.equal(existsSync(join(dst, "paketler")), false);
});

function gitFixture() {
  const origin = join(tmp(), "origin.git");
  mkdirSync(origin);
  git(origin, "init", "--bare", "-b", "main");
  const work = tmp();
  git(work, "clone", origin, ".");
  git(work, "checkout", "-b", "main");
  writeFileSync(join(work, "ilk.txt"), "1");
  git(work, "add", "."); git(work, "commit", "-m", "ilk"); git(work, "push", "origin", "main");
  const root = tmp();
  git(root, "clone", origin, ".");
  return { origin, work, root };
}

test("updateOnce(git): yeni commit'i ceker, ikinci tur bos doner", async () => {
  const { work, root } = gitFixture();
  writeFileSync(join(work, "yeni.txt"), "2");
  git(work, "add", "."); git(work, "commit", "-m", "yeni"); git(work, "push", "origin", "main");
  const r1 = await updateOnce({ root, repo: "x/y", branch: "main" });
  assert.equal(r1.method, "git");
  assert.deepEqual(r1.changedFiles, ["yeni.txt"]);
  assert.equal(readFileSync(join(root, "yeni.txt"), "utf8"), "2");
  const r2 = await updateOnce({ root, repo: "x/y", branch: "main" });
  assert.deepEqual(r2.changedFiles, []);
});

test("updateOnce(git): erisilemeyen origin reject eder", async () => {
  const { root } = gitFixture();
  git(root, "remote", "set-url", "origin", join(tmp(), "yok.git"));
  await assert.rejects(() => updateOnce({ root, repo: "x/y", branch: "main" }));
});

test("updateOnce(zip): .git yoksa arsivi indirip acar, .env korunur", { skip: process.platform !== "win32" }, async () => {
  const stage = tmp();
  const top = join(stage, "visual-library-main");
  mkdirSync(top);
  writeFileSync(join(top, "yeni.txt"), "zip");
  writeFileSync(join(top, ".env"), "ARSIV");
  const zip = join(tmp(), "main.zip");
  execFileSync("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${top}' -DestinationPath '${zip}'`]);
  const root = tmp();
  writeFileSync(join(root, ".env"), "SUNUCU");
  const urls = [];
  const fetchZip = async (url, dest) => { urls.push(url); copyFileSync(zip, dest); };
  const r = await updateOnce({ root, repo: "FikretGezer/visual-library", branch: "main", fetchZip });
  assert.equal(r.method, "zip");
  assert.deepEqual(r.changedFiles, ["yeni.txt"]);
  assert.equal(readFileSync(join(root, ".env"), "utf8"), "SUNUCU");
  assert.equal(urls[0], "https://codeload.github.com/FikretGezer/visual-library/zip/refs/heads/main");
});

test("startUpdater: hata loglanir ve sunucu dusmez", async () => {
  const logs = [];
  const u = startUpdater({
    root: ".", repo: "x/y", branch: "main", minutes: 0.001,
    update: async () => { throw new Error("ag yok"); },
    onSelfChange: () => assert.fail("cagrilmamali"),
    log: (m) => logs.push(m),
  });
  await new Promise((r) => setTimeout(r, 150));
  u.stop();
  assert.ok(logs.some((m) => m.includes("ag yok")));
});

test("startUpdater: server.mjs degisince onSelfChange cagrilir", async () => {
  let called = 0;
  const u = startUpdater({
    root: ".", repo: "x/y", branch: "main", minutes: 1000,
    update: async () => ({ method: "git", changedFiles: ["server.mjs", "a.txt"] }),
    onSelfChange: () => { called++; },
    log: () => {},
  });
  await new Promise((r) => setTimeout(r, 100));
  u.stop();
  assert.equal(called, 1);
});

test("startUpdater: elle tetiklenen tur sonucu doner, es zamanli ikinci tur busy", async () => {
  let release;
  const u = startUpdater({
    root: ".", repo: "x/y", branch: "main", minutes: 1000,
    update: () => new Promise((r) => { release = () => r({ method: "git", changedFiles: [] }); }),
    onSelfChange: () => {}, log: () => {},
  });
  const first = u.trigger();
  await new Promise((r) => setTimeout(r, 20));
  await assert.rejects(() => u.trigger(), (e) => e.code === "BUSY");
  release();
  const res = await first;
  assert.equal(res.method, "git");
  u.stop();
});

test("startUpdater: package.json degisince bagimliliklari yeniden kurar", async () => {
  let installs = 0;
  const u = startUpdater({
    root: ".", repo: "x/y", branch: "main", minutes: 1000,
    update: async () => ({ method: "git", changedFiles: ["package.json"] }),
    runInstall: async () => { installs++; },
    onSelfChange: () => {}, log: () => {},
  });
  await new Promise((r) => setTimeout(r, 100));
  u.stop();
  assert.equal(installs, 1);
});
