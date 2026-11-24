// GitHub'dan guncelleme: .git varsa `git pull`, yoksa repo'nun zip arsivini indirip uzerine acar.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const run = promisify(execFile);
const ZIP_SKIP = [".env", ".git", "paketler", "data", "node_modules"];
const SELF_FILES = new Set(["server.mjs", "updater.mjs"]);
const DEP_FILES = new Set(["package.json", "package-lock.json"]);

/** src'yi dst'ye kopyalar; yalnizca yeni/degisen dosyalari yazar. skip: ust duzey adlar. */
export function copyTree(src, dst, skip = []) {
  const changed = [];
  const walk = (rel) => {
    const dir = join(src, rel);
    for (const name of readdirSync(dir)) {
      if (rel === "" && skip.includes(name)) continue;
      const relPath = rel === "" ? name : `${rel}/${name}`;
      const from = join(src, relPath);
      const to = join(dst, relPath);
      if (statSync(from).isDirectory()) {
        mkdirSync(to, { recursive: true });
        walk(relPath);
      } else {
        const data = readFileSync(from);
        if (!existsSync(to) || !readFileSync(to).equals(data)) {
          mkdirSync(join(to, ".."), { recursive: true });
          writeFileSync(to, data);
          changed.push(relPath);
        }
      }
    }
  };
  walk("");
  return changed;
}

async function defaultFetchZip(url, dest) {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`Zip indirilemedi: HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function updateViaGit(root, branch) {
  const opts = { cwd: root, timeout: 60_000, windowsHide: true };
  await run("git", ["fetch", "origin", branch], opts);
  const diff = await run("git", ["diff", "--name-only", "HEAD", `origin/${branch}`], opts);
  const changedFiles = diff.stdout.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (changedFiles.length) await run("git", ["merge", "--ff-only", `origin/${branch}`], opts);
  return { method: "git", changedFiles };
}

async function updateViaZip(root, repo, branch, fetchZip) {
  const work = mkdtempSync(join(tmpdir(), "vl-zip-"));
  try {
    const zip = join(work, "main.zip");
    await fetchZip(`https://codeload.github.com/${repo}/zip/refs/heads/${branch}`, zip);
    const out = join(work, "out");
    // PSModulePath temizlenir: ust surec PowerShell 7 ise Windows PowerShell yanlis Archive modulunu yukler.
    const env = { ...process.env };
    delete env.PSModulePath;
    await run(
      "powershell",
      ["-NoProfile", "-Command", `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath '${zip}' -DestinationPath '${out}' -Force`],
      { timeout: 120_000, windowsHide: true, env },
    );
    const tops = readdirSync(out);
    if (tops.length === 0) throw new Error("Zip bos ya da acilamadi");
    const top = tops.length === 1 && statSync(join(out, tops[0])).isDirectory() ? join(out, tops[0]) : out;
    return { method: "zip", changedFiles: copyTree(top, root, ZIP_SKIP) };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** Tek guncelleme turu. Hata olursa reject eder. */
export async function updateOnce({ root, repo, branch, fetchZip = defaultFetchZip }) {
  return existsSync(join(root, ".git")) ? updateViaGit(root, branch) : updateViaZip(root, repo, branch, fetchZip);
}

async function defaultInstall(root) {
  await run("npm", ["install", "--omit=dev"], { cwd: root, shell: process.platform === "win32", timeout: 300_000, windowsHide: true });
}

/**
 * Periyodik + elle tetiklenebilir guncelleyici. Turlar ust uste binmez.
 * minutes <= 0 ise zamanlayici kurulmaz (yalniz trigger calisir).
 */
export function startUpdater({
  root, repo, branch, minutes, onSelfChange, log = console.info,
  update = updateOnce, runInstall = defaultInstall,
}) {
  let running = false;
  let last = null;

  async function trigger() {
    if (running) {
      const e = new Error("Guncelleme zaten calisiyor");
      e.code = "BUSY";
      throw e;
    }
    running = true;
    try {
      const r = await update({ root, repo, branch });
      last = { at: new Date().toISOString(), method: r.method, changedFiles: r.changedFiles };
      if (r.changedFiles.length) log(`Guncelleme (${r.method}): ${r.changedFiles.length} dosya degisti`);
      if (r.changedFiles.some((f) => DEP_FILES.has(f))) await runInstall(root);
      if (r.changedFiles.some((f) => SELF_FILES.has(f))) onSelfChange();
      return last;
    } catch (e) {
      last = { at: new Date().toISOString(), error: e.message };
      throw e;
    } finally {
      running = false;
    }
  }

  const tick = () => trigger().catch((e) => { if (e.code !== "BUSY") log(`Guncelleme hatasi: ${e.message}`); });
  let timer = null;
  if (minutes > 0) {
    setImmediate(tick);
    timer = setInterval(tick, minutes * 60_000);
  }
  return { trigger, status: () => last, stop: () => timer && clearInterval(timer) };
}
