// Visual Library sunucusu: bagimliliksiz statik dosya sunucusu.
// Calistirma: node server.mjs  (ayarlar .env dosyasindan: PORT, ...)
import http from "node:http";
import { existsSync, statSync, createReadStream } from "node:fs";
import { networkInterfaces } from "node:os";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { startUpdater } from "./updater.mjs";
import { createAuth } from "./auth/routes.mjs";
import { createMemoryStore, createSqlStore } from "./auth/users-store.mjs";
import { createTmdAuth, tmdSettingsFromEnv } from "./auth/tmdauth.mjs";
import { createRateLimiter } from "./auth/rate-limit.mjs";
import { seedAdmins, createUsersService } from "./auth/users-service.mjs";
import { createAdmin } from "./auth/admin-routes.mjs";

const DEFAULT_PORT = 4099;
const DENIED_TOP_DIRS = new Set(["docs", "tests", "paketler", "auth", "sql", "node_modules", "data"]);
const DENIED_EXTS = new Set([".mjs", ".bat", ".sql"]);
const DENIED_NAMES = new Set(["package.json", "package-lock.json"]);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".woff2": "font/woff2",
  ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

/** PORT degerini dogrular; gecersizse 4099. */
export function readPort(env) {
  const n = Number(env.PORT);
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : DEFAULT_PORT;
}

/**
 * URL yolunu kok klasor icindeki guvenli bir dosya yoluna cevirir.
 * Yasakli, gecersiz ya da kok disina cikan her sey icin null doner.
 */
export function resolveSafe(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0") || decoded.includes("\\") || decoded.includes(":")) return null;

  const segments = decoded.split("/").filter((s) => s !== "");
  if (segments.some((s) => s.startsWith("."))) return null;
  if (segments.length && DENIED_TOP_DIRS.has(segments[0].toLowerCase())) return null;

  const wantsDir = decoded.endsWith("/") || segments.length === 0;
  let target = segments.length === 0 ? "gallery.html" : segments.join("/");
  if (wantsDir && segments.length > 0) target += "/index.html";

  const rootAbs = resolve(root);
  let full = resolve(rootAbs, target);
  if (full !== rootAbs && !full.startsWith(rootAbs + sep)) return null;

  // /klasor (sonda / yok) bir klasorse index.html'ine git.
  if (existsSync(full) && statSync(full).isDirectory()) full = join(full, "index.html");

  const name = full.slice(full.lastIndexOf(sep) + 1).toLowerCase();
  if (DENIED_NAMES.has(name) || DENIED_EXTS.has(extname(name))) return null;
  return full;
}

function send(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "x-content-type-options": "nosniff" });
  res.end(text);
}

// Giris sayfasinin de kullandigi logo/ikon dosyalari: oturum olmadan acilir (baska hicbir dosya acilmaz).
const PUBLIC_FILES = new Set(["/logo.png", "/logo-mark.png", "/favicon.png", "/favicon.ico", "/apple-touch-icon.png"]);
const LOCAL_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const defaultIsLocal = (req) => LOCAL_ADDRESSES.has(req.socket.remoteAddress ?? "");

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(body));
}

/** Yalnizca yerel makineden kabul edilen elle guncelleme ucu (Guncelle.bat). */
async function handleLocalUpdate(res, onUpdate) {
  try {
    sendJson(res, 200, await onUpdate());
  } catch (e) {
    sendJson(res, e.code === "BUSY" ? 409 : 500, { error: e.message });
  }
}

function serveStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("allow", "GET, HEAD");
    return send(res, 405, "Method Not Allowed");
  }
  const urlPath = (req.url ?? "/").split("?")[0].split("#")[0];
  try {
    decodeURIComponent(urlPath);
  } catch {
    return send(res, 400, "Bad Request");
  }
  const file = resolveSafe(this.root, urlPath);
  if (!file || !existsSync(file) || !statSync(file).isFile()) return send(res, 404, "Not Found");

  res.writeHead(200, {
    "content-type": MIME[extname(file).toLowerCase()] ?? "application/octet-stream",
    "content-length": statSync(file).size,
    "x-content-type-options": "nosniff",
    "cache-control": "no-cache",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}

/**
 * Istek isleyicisi. deps: { onUpdate?, isLocal?, auth? }
 * auth verilirse /giris ve giris uclari disindaki her istek gecerli oturum ister.
 */
export function createApp(root, deps = {}) {
  const isLocal = deps.isLocal ?? defaultIsLocal;
  const serve = serveStatic.bind({ root });

  async function handle(req, res) {
    const pathOnly = (req.url ?? "/").split("?")[0];
    if (pathOnly === "/_guncelle") {
      if (req.method !== "POST" || !deps.onUpdate || !isLocal(req)) return send(res, 404, "Not Found");
      return handleLocalUpdate(res, deps.onUpdate);
    }
    if (deps.auth) {
      if ((req.method === "GET" || req.method === "HEAD") && PUBLIC_FILES.has(pathOnly)) return serve(req, res);
      if (await deps.auth.handle(req, res)) return;
      const session = await deps.auth.authenticate(req);
      if (!session) {
        if (pathOnly.startsWith("/_api/") || (req.method !== "GET" && req.method !== "HEAD")) return sendJson(res, 401, { error: "auth" });
        res.writeHead(302, { location: `/giris?next=${encodeURIComponent(req.url ?? "/")}`, "cache-control": "no-store" });
        return res.end();
      }
      req.user = session.user;
      res.setHeader("set-cookie", session.cookie);
      if (deps.admin && (await deps.admin.handle(req, res, session.user))) return;
    }
    serve(req, res);
  }

  return (req, res) => {
    handle(req, res).catch((e) => {
      console.error("Istek hatasi:", e.message);
      if (!res.headersSent) send(res, 500, "Internal Server Error");
      else res.end();
    });
  };
}
function lanAddresses(port) {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) out.push(`http://${i.address}:${port}`);
  }
  return out;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const root = fileURLToPath(new URL(".", import.meta.url));
  // VL_ENV_FILE yalnizca testler icin: gercek .env dosyasina dokunmadan calistirmayi saglar.
  const envFile = process.env.VL_ENV_FILE || join(root, ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const port = readPort(process.env);
  if (process.env.PORT && String(port) !== process.env.PORT) console.warn(`[UYARI] PORT gecersiz, ${port} kullaniliyor.`);

  const minutes = Number(process.env.UPDATE_MINUTES ?? 30);
  const updater = startUpdater({
    root,
    repo: process.env.REPO || "FikretGezer/visual-library",
    branch: process.env.BRANCH || "main",
    minutes: Number.isFinite(minutes) ? minutes : 30,
    onSelfChange: () => {
      console.info("Sunucu dosyalari guncellendi, yeniden baslatiliyor...");
      process.exit(0);
    },
  });
  // Giris zorunlu: ayarlar eksikse sunucu acilmaz (guvenli taraf).
  let auth;
  let admin;
  let configOk = false; // true olunca sonraki hatalar gecici sayilir (ag/veritabani)
  try {
    let store;
    if (String(process.env.DEV_MEMORY_STORE).toLowerCase() === "true") {
      console.warn("[UYARI] DEV_MEMORY_STORE acik: kullanicilar bellekte, kalici DEGIL. Yalnizca gelistirme icin.");
      store = createMemoryStore();
    } else if (process.env.DATABASE_URL?.trim()) {
      store = createSqlStore(process.env.DATABASE_URL);
    } else {
      throw new Error("DATABASE_URL tanimli degil. .env dosyasina RPA_DB baglanti adresini yazin.");
    }
    auth = createAuth({
      root,
      store,
      tmdauth: createTmdAuth(tmdSettingsFromEnv(process.env)),
      secret: process.env.SESSION_SECRET ?? "",
      limiter: createRateLimiter({ max: 5, windowMs: 15 * 60 * 1000 }),
      isHttps: /^https:\/\//i.test(process.env.PUBLIC_URL ?? ""),
      localAdmin: process.env.LOCAL_ADMIN_EMAIL || process.env.LOCAL_ADMIN_PASSWORD
        ? { email: process.env.LOCAL_ADMIN_EMAIL ?? "", password: process.env.LOCAL_ADMIN_PASSWORD ?? "" }
        : null,
    });
    admin = createAdmin({ service: createUsersService(store), onUpdate: updater.trigger, getStatus: updater.status, sameOrigin: auth.sameOrigin, root });
    configOk = true;
    await store.migrate();
    const seeded = await seedAdmins(store, process.env.ADMIN_EMAILS);
    if (seeded) console.info(`ADMIN_EMAILS: ${seeded} yonetici eklendi.`);
    if (!(await store.count())) console.warn("[UYARI] Kullanici tablosu bos ve ADMIN_EMAILS tanimli degil: kimse giris yapamaz.");
  } catch (e) {
    const msg = e.message || (e.errors ?? []).map((x) => x.message || x.code).filter(Boolean).join("; ") || e.code || String(e);
    console.error(`[HATA] ${msg}`);
    // 78 = ayar hatasi: Baslat.bat yeniden denemez. Gecici hatalar (veritabani ulasilamaz) 1 ile yeniden denenir.
    process.exit(configOk ? 1 : 78);
  }
  const server = http.createServer(createApp(root, { onUpdate: updater.trigger, auth, admin }));
  server.on("error", (e) => {
    console.error(e.code === "EADDRINUSE" ? `[HATA] Port ${port} dolu. Baska bir program kullaniyor olabilir.` : `[HATA] ${e.message}`);
    process.exit(1);
  });
  server.listen(port, "0.0.0.0", () => {
    console.info(`Visual Library calisiyor: http://localhost:${port}`);
    for (const a of lanAddresses(port)) console.info(`  Ag adresi: ${a}`);
  });
}
