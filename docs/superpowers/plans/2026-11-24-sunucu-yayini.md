# Sunucu Yayını Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Visual Library'yi Windows sunucuda `http://IP:4099` üzerinden sunmak, GitHub'daki değişiklikleri sunucunun çekmesini sağlamak (otomatik, elle ve yönetim sayfasından uzaktan) ve girişi RPA_DB kullanıcı tablosu + TmdAuth ile korumak.

**Architecture:** Bağımlılıksız iki Node modülü: `server.mjs` (statik dosya sunucusu) ve `updater.mjs` (GitHub'dan periyodik çekme). AiMonitoring desenindeki `Kur.bat`, `Baslat.bat`, `Paketle.bat` bunları sarar. Ayarlar `.env` dosyasında. Giriş: e-posta `visuallibrary.users` tablosunda aktif VE TmdAuth parolayı doğrular; oturum imzalı çerezde (sunucu durumsuz). Yönetim sayfası kullanıcıları ve uzaktan güncellemeyi yönetir.

**Tech Stack:** Node 22+ (`node:*` yerleşik modüller, `node:test`), tek npm bağımlılığı `tedious` (SQL Server), Windows batch, PowerShell (`Expand-Archive`).

**Spec:** `docs/superpowers/specs/2026-11-24-sunucu-yayini-design.md`

## Global Constraints

- Sunucuda Node 22+ yeter; tek bağımlılık `tedious`, `Kur.bat` `npm install --omit=dev` çalıştırır, derleme yok. `package-lock.json` repo'da.
- Varsayılan port `4099`, `.env` içindeki `PORT` ile değişir. Giriş zorunlu: tablo kaydı (aktif) **ve** TmdAuth birlikte; yalnızca `/giris` ve `POST /_api/login` oturumsuz açık.
- `0.0.0.0` dinlenir. Sunulmaz: adı `.` ile başlayan her şey, `*.mjs`, `*.bat`, `*.sql`, `package*.json`, `docs/`, `tests/`, `paketler/`, `auth/`, `sql/`, `node_modules/`.
- Güncelleme varsayılan aralığı `UPDATE_MINUTES=30` (`.env`'den ayarlanır, `0` otomatiği kapatır); elle tetikleme `POST /_guncelle` yalnızca 127.0.0.1'den kabul edilir, uzaktan gelen 404 alır; repo `FikretGezer/visual-library`, dal `main`.
- Git yoksa zip yedeği: GitHub `main.zip` arşivi, `.env` ve `paketler/` korunur.
- Veritabanına yalnızca yeni şema `visuallibrary` ve `visuallibrary.users` yazılır; migrasyon `IF NOT EXISTS`, hiçbir veriyi silmez/değiştirmez. Geliştirme sırasında RPA_DB'ye bağlanılmaz; testler bellek içi depo ve sahte TmdAuth ile koşar.`n- `SESSION_SECRET` boş ya da `DEGISTIR` ise sunucu başlamaz. Çerez: `vl_session`, `HttpOnly`, `SameSite=Lax`, kayan 14 gün / mutlak 30 gün, `Secure` yalnızca `PUBLIC_URL` https ise.`n- Güncelleme hatası sunucuyu düşürmez. `server.mjs` ya da `updater.mjs` değişirse süreç çıkar, `Baslat.bat` döngüsü 5 sn sonra yeniden başlatır.
- Bat dosyalarında Türkçe karakter kullanılmaz (AiMonitoring'deki gibi ASCII), kodlama sorunu çıkmasın.

## Review Focus

- Kodlanmış yol geçişi ve bozuk yüzde kodu (`/%2e%2e/x`, `/..%5cx`, `/%E0%A4%A`): 403/404/400, asla dosya içeriği dönmez, süreç çökmez.
- E-posta biçimi: `  Ali@X.com ` ile kayıt ve giriş aynı kişidir (küçük harf, kırpılmış); aynı e-posta ikinci kez eklenemez.
- Çerez durumu: imzası bozulmuş ya da süresi dolmuş çerez `/giris`'e yönlenir; pasife alınan/silinen kullanıcının açık oturumu en geç 60 sn sonra düşer.
- Kimlik servisi kapalı ya da ağ yok: giriş 503 "kimlik servisine ulaşılamıyor" döner (yanlış parola denmez), güncelleme turu hata loglar, sunucu cevap vermeye devam eder.
- Giriş sonrası yönlendirme (`next`): yalnızca site içi yollar kabul edilir (`//evil.com`, `https://evil.com` reddedilir); `POST` yerine `GET`, yanlış `Origin` 403.
---

### Task 1: Statik dosya sunucusu

**Files:**
- Create: `server.mjs`
- Test: `tests/server.test.mjs`

**Interfaces:**
- Produces: `export function resolveSafe(root: string, urlPath: string): string | null` (çözülmüş mutlak dosya yolu; yasaklı/geçersizse `null`)
- Produces: `export function createApp(root: string): (req, res) => void`
- Produces: `export function readPort(env: Record<string,string|undefined>): number` (geçersiz/boşsa 4099)
- Main-guard: dosya doğrudan çalıştırılınca `.env`'i `process.loadEnvFile` ile (varsa) yükler, `readPort(process.env)` ile dinler, açılışta `http://<yerel IPv4>:PORT` adreslerini yazar.

- [ ] **Step 1: Write the failing tests** (`node:test`, geçici klasörde örnek `gallery.html`, `a/index.html`, `.env`, `server.mjs`, `docs/x.md`)
  - `resolveSafe` testleri: `/` → `gallery.html`; `/a/` → `a/index.html`; `/.env`, `/.git/config`, `/server.mjs`, `/x.bat`, `/docs/x.md`, `/tests/server.test.mjs` → `null`; `/%2e%2e/secret`, `/..%5csecret`, `/a/../../secret` → `null`; `/%E0%A4%A` → `null`.
  - `createApp` ile gerçek `http.createServer` + `fetch`: `/` 200 ve `content-type` `text/html`; `/a/index.html` 200; `/yok` 404; `/.env` 404; `/%E0%A4%A` 400; `POST /` 405; `HEAD /` 200 ve gövde boş; her cevapta `x-content-type-options: nosniff`.
  - `readPort` testleri: `{}` → 4099, `{PORT:"abc"}` → 4099, `{PORT:"70000"}` → 4099, `{PORT:"5000"}` → 5000.

- [ ] **Step 2: Run to verify it fails**
  Run: `node --test tests/server.test.mjs`
  Expected: FAIL, `server.mjs` bulunamıyor.

- [ ] **Step 3: Implement `server.mjs`**
  MIME tablosu: html, js, css, json, png, jpg, svg, ico, mp3, wav, mp4, webm, woff2, md/txt (`text/plain; charset=utf-8`), bilinmeyen için `application/octet-stream`. Yasaklıları segment bazlı denetle (`.` ile başlayan segment, ilk segment `docs|tests|paketler`, uzantı `.bat|.mjs`... `.env`). Yol çözümü `path.resolve` sonrası `root` önekiyle doğrulanır. `EADDRINUSE` durumunda anlaşılır mesaj + `process.exit(1)`.

- [ ] **Step 4: Run to verify it passes**
  Run: `node --test tests/server.test.mjs`
  Expected: PASS (tüm testler)

- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse)
  `git add server.mjs tests/server.test.mjs` · mesaj: `feat: static file server for the library`

---

### Task 2: Otomatik güncelleyici

**Files:**
- Create: `updater.mjs`
- Test: `tests/updater.test.mjs`

**Interfaces:**
- Produces: `export async function updateOnce(opts: { root: string; repo: string; branch: string }): Promise<{ method: 'git' | 'zip'; changedFiles: string[] }>`
- Produces: `export function copyTree(src: string, dst: string, skip: string[]): string[]` (hedefte değişen/yeni dosyaların göreli yolları; aynı içerikli dosya yeniden yazılmaz; `skip` üst düzey ad listesi)
- Produces: `export function startUpdater(opts: { root: string; repo: string; branch: string; minutes: number; onSelfChange: () => void; log?: (msg: string) => void }): { stop(): void }`
- Consumes: yok (Task 1'den bağımsız; `server.mjs` main-guard'ı `startUpdater`'ı çağırır, bkz. Task 3).

- [ ] **Step 1: Write the failing tests**
  - `copyTree`: kaynakta `a.txt` (yeni), `b.txt` (değişmiş), `c.txt` (aynı), `.env`, `paketler/z`; `skip=[".env","paketler",".git"]` → dönen liste yalnızca `a.txt` ve `b.txt`; hedefteki `.env` bozulmaz.
  - `updateOnce` git yolu: geçici bir "origin" repo + onun klonu oluştur, origin'e yeni dosya commit'le, `updateOnce({root: klon, ...})` → `method:"git"`, `changedFiles` yeni dosyayı içerir; ikinci çağrı `changedFiles: []`.
  - `updateOnce` erişilemeyen origin (var olmayan yol) → `reject` eder (çağıran loglar); `startUpdater` bunu yakalayıp `log`'a yazar ve çökmez (`log` çağrıldı mı testi, `minutes` küçük sahte zamanlayıcıyla).
  - `startUpdater`: `changedFiles` içinde `server.mjs` varsa `onSelfChange` çağrılır.

- [ ] **Step 2: Run to verify it fails**
  Run: `node --test tests/updater.test.mjs`
  Expected: FAIL, `updater.mjs` bulunamıyor.

- [ ] **Step 3: Implement `updater.mjs`**
  Git yolu: `<root>/.git` varsa `git fetch` + `git diff --name-only HEAD origin/<branch>` ile değişenleri al, sonra `git pull --ff-only` (`child_process.execFile`, zaman aşımı 60 sn). Zip yolu: `https://codeload.github.com/<repo>/zip/refs/heads/<branch>` adresini `fetch` ile geçici dosyaya indir, PowerShell `Expand-Archive` ile geçici klasöre aç, tek üst klasörü `copyTree(..., [".env","paketler",".git"])` ile `root`'a kopyala, geçici dosyaları sil. `startUpdater`: ilk turu hemen, sonra her `minutes` dakikada çalıştırır, turlar üst üste binmez, `setInterval` `unref` edilmez (süreci canlı tutmaz gerekmez; sunucu zaten canlı).

- [ ] **Step 4: Run to verify it passes**
  Run: `node --test tests/updater.test.mjs`
  Expected: PASS

- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse)
  `git add updater.mjs tests/updater.test.mjs` · mesaj: `feat: periodic updater via git pull with zip fallback`

---

### Task 3: Kurulum betikleri, ayar dosyası, entegrasyon

**Files:**
- Create: `.env.example`, `Kur.bat`, `Baslat.bat`, `Guncelle.bat`, `Paketle.bat`
- Modify: `server.mjs` (main-guard: `UPDATE_MINUTES>0` ise `startUpdater` başlat, `onSelfChange` → `process.exit(0)`), `.gitignore` (`paketler/` ekle), `README.md` ("Sunucuya kurulum" bölümü), `.gitattributes` (yeni: `*.bat text eol=crlf`)
- Test: `tests/server.test.mjs` (main-guard için tek smoke testi)

**Interfaces:**
- Consumes: `startUpdater` (Task 2), `readPort` / main-guard (Task 1)
- `.env.example` anahtarları: `PORT=4099`, `PUBLIC_URL=`, `UPDATE_MINUTES=30`, `REPO=FikretGezer/visual-library`, `BRANCH=main`

- [ ] **Step 1: Write the failing smoke test**
  `node server.mjs` alt süreç olarak geçici `.env` (`PORT=<boş port>`, `UPDATE_MINUTES=0`) ile başlatılır; `fetch("/")` 200 döner; süreç sonlandırılır.
  Ek testler: yerelden `POST /_guncelle` 200 ve JSON `{changedFiles:[...]}` döner; `GET /_guncelle` 404; `createApp` `x-forwarded`/uzak adres simülasyonuyla (uzak adres = 127.0.0.1 dışı) `POST /_guncelle` 404 döner. `createApp(root, { onUpdate })`: `onUpdate: () => Promise<{changedFiles:string[]}>` verilirse bu uç etkin olur.

- [ ] **Step 2: Run to verify it fails**
  Run: `node --test tests/server.test.mjs`
  Expected: smoke testi FAIL (main-guard henüz yok ya da güncelleyici bağlı değil).

- [ ] **Step 3: Wire main-guard and write the .bat files**
  - `Kur.bat`: Node 22+ kontrolü (hata mesajı + `pause`), `npm install --omit=dev` (tedious; Task 4'ten sonra anlamlı, öncesinde atlanır), `.env`'deki `DATABASE_URL`/`SESSION_SECRET`/`ADMIN_EMAILS` boşsa uyarı, `.env` yoksa `.env.example`'dan kopyala, `PORT`'u `.env`'den oku (varsayılan 4099), yönetici ise `netsh advfirewall firewall` ile "Visual Library" kuralını sil-ve-ekle, değilse AiMonitoring'deki gibi uyarı + elle komut, sonunda erişim adresini yaz. Tekrar çalıştırılabilir.
  - `Guncelle.bat`: Node ile `http://127.0.0.1:<PORT>/_guncelle` adresine `POST` atar, dönen JSON'daki değişen dosyaları veya hatayı yazar; sunucu kapalıysa anlaşılır mesaj verir.
  - `Baslat.bat`: Node/`.env` kontrolü; `:loop` içinde `node server.mjs`, çıkışta 5 sn bekleyip tekrar (Ctrl+C ile durdurulur).
  - `Paketle.bat`: `paketler\VisualLibrary_<yyyy-MM-dd_HH-mm>.zip`; PowerShell ile kökteki öğeleri (`.git`, `.env`, `paketler`, `tests`, `docs` hariç) listeleyip öneksiz zip'ler (AiMonitoring'deki "boş zip" hatasından ders: girişlerde `./` öneki olmamalı).
  - `README.md`: sunucuya kurulum adımları (zip'i aç → `Kur.bat` → `Baslat.bat`; sonrası otomatik güncelleme; domain için `PUBLIC_URL`).

- [ ] **Step 4: Run to verify it passes**
  Run: `node --test tests/`
  Expected: PASS (Task 1 + 2 + smoke)

- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse)
  mesaj: `feat: Kur/Baslat/Paketle scripts and env config for server hosting`

---

### Task 4: Kullanıcı deposu ve migrasyon

**Files:**
- Create: `sql/0001_users.sql`, `auth/users-store.mjs`, `package.json`, `package-lock.json` (bağımlılık: `tedious`)
- Test: `tests/users-store.test.mjs`

**Interfaces:**
- Produces: `normalizeEmail(s: string): string` (kırp + küçük harf)
- Produces: `parseDatabaseUrl(url: string): { server, port, database, user, password, encrypt, trustServerCertificate }` (`sqlserver://host:1433;database=RPA_DB;user=..;password=..;encrypt=true` biçimi)
- Produces: `type User = { id: number; email: string; displayName: string | null; role: 'admin' | 'user'; isActive: boolean; createdAt: string; createdBy: string | null; lastLoginAt: string | null }`
- Produces: `interface UserStore { migrate(): Promise<void>; findByEmail(email): Promise<User | null>; list(): Promise<User[]>; create(input: { email; displayName?; role; createdBy? }): Promise<User>; update(id, patch: { displayName?; role?; isActive? }): Promise<User>; remove(id): Promise<void>; touchLogin(id): Promise<void>; count(): Promise<number> }`
- Produces: `createMemoryStore(): UserStore` (testler ve geliştirme için), `createSqlStore(databaseUrl: string): UserStore` (`tedious`, parametreli sorgular)

- [ ] **Step 1: Write the failing tests**
  - `normalizeEmail("  Ali@X.com ")` → `"ali@x.com"`.
  - `parseDatabaseUrl` örnek adres (sahte `sqlserver://h:1433;database=RPA_DB;user=u;password=p;encrypt=true`) → alanlar doğru; `database` yoksa fırlatır.
  - Bellek deposu sözleşmesi: `create` sonrası `findByEmail` büyük/küçük harf farkına bakmaz; aynı e-posta ikinci `create` hata verir (`code: "DUPLICATE"`); `update` `isActive:false` kalıcı; `remove` sonrası `findByEmail` `null`; `touchLogin` `lastLoginAt` doldurur; `count`.
  - `sql/0001_users.sql` statik denetim: `CREATE SCHEMA`/`CREATE TABLE` ve `IF NOT EXISTS` içerir; `DROP`, `TRUNCATE`, `DELETE`, `UPDATE`, `ALTER` içermez; yalnızca `visuallibrary.` nesnelerine dokunur; spec'teki kolon adlarının hepsi var.

- [ ] **Step 2: Run to verify it fails**
  Run: `node --test tests/users-store.test.mjs` · Expected: FAIL, modül yok.

- [ ] **Step 3: Implement**
  Migrasyon: spec'teki tablo (`email` UNIQUE, `role` CHECK `admin|user`, `is_active` varsayılan 1, tarihler `datetime2(3)` UTC). `createSqlStore.migrate()` `sql/0001_users.sql` dosyasını çalıştırır; sorgular parametreli, e-posta her zaman `normalizeEmail`'dan geçer. SQL deposu yalnızca sözleşme testiyle değil gerçek DB ile **denenmez** (Task 9'da kullanıcı sunucuda doğrular).

- [ ] **Step 4: Run to verify it passes** · Run: `node --test tests/users-store.test.mjs` · Expected: PASS
- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse) · `feat: users store (SQL + memory) and migration`

---

### Task 5: Kullanıcı kuralları ve ilk yönetici

**Files:**
- Create: `auth/users-service.mjs`
- Test: `tests/users-service.test.mjs`

**Interfaces:**
- Consumes: `UserStore`, `normalizeEmail` (Task 4)
- Produces: `createUsersService(store: UserStore): { add(actor: string, input): Promise<User>; setActive(actor: string, id: number, active: boolean): Promise<User>; setRole(actor: string, id: number, role): Promise<User>; remove(actor: string, id: number): Promise<void>; list(): Promise<User[]> }`
- Produces: hatalar `class ServiceError extends Error { code: 'SELF_ACTION' | 'LAST_ADMIN' | 'INVALID_EMAIL' | 'DUPLICATE' | 'NOT_FOUND' }`
- Produces: `seedAdmins(store: UserStore, adminEmails: string): Promise<number>` (yalnızca `count()===0` iken `ADMIN_EMAILS` listesini `admin` olarak ekler, eklenen sayıyı döner)

- [ ] **Step 1: Write the failing tests**
  Kendini pasife alma/silme/rolünü düşürme `SELF_ACTION`; son aktif admini silme/pasife alma/rol düşürme `LAST_ADMIN`; `add` geçersiz e-posta (`"abc"`, boş) `INVALID_EMAIL`; `add` aynı e-posta `DUPLICATE`; `seedAdmins` boş depoda 2 admin ekler, dolu depoda 0 ekler, virgüllü listede boşlukları kırpar.
- [ ] **Step 2: Run to verify it fails** · `node --test tests/users-service.test.mjs` · FAIL
- [ ] **Step 3: Implement** the interfaces above; kurallar spec'teki "Yönetim sayfası" bölümündeki gibi.
- [ ] **Step 4: Run to verify it passes** · PASS
- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse) · `feat: user rules and first-admin seeding`

---

### Task 6: TmdAuth, oturum jetonu, deneme sınırı

**Files:**
- Create: `auth/tmdauth.mjs`, `auth/session.mjs`, `auth/rate-limit.mjs`
- Test: `tests/tmdauth.test.mjs`, `tests/session.test.mjs`, `tests/rate-limit.test.mjs`

**Interfaces:**
- Produces: `createTmdAuth(settings: { enabled; domain; apiKey; apiPass; userMode: 'email' | 'localpart'; insecureSsl; timeoutMs }, fetchImpl = fetch): { isEnabled(): boolean; check(email: string, password: string): Promise<{ ok: true } | { ok: false; unavailable: boolean }> }` (uçlar: `POST {domain}/api/login` → `token`, `POST {domain}/api/checkAdUser`; "Unauthenticated." cevabında bir kez token yenile; servis tokeni bellekte)
- Produces: `signSession(secret: string, payload: { email: string; iat: number; exp: number }): string` ve `verifySession(secret: string, token: string, now?: number): { email: string; iat: number; exp: number } | null`
- Produces: `slideSession(secret, payload, now): string` (yeni jeton: `exp = min(now + 14 gün, mutlak son)`), `ABSOLUTE_MS = 30 gün`, `SLIDING_MS = 14 gün`; mutlak son jetonda `abs` alanında taşınır
- Produces: `createRateLimiter({ max: 5, windowMs: 15 dakika }): { hit(key): void; blocked(key): boolean; reset(key): void }`

- [ ] **Step 1: Write the failing tests**
  - `check`: sahte `fetch` ile doğru parola → `{ok:true}`; yanlış parola (`result` ≠ `success`) → `{ok:false, unavailable:false}`; fetch fırlatır → `unavailable:true`; ilk cevap `message:"Unauthenticated."` ise `/api/login` yeniden çağrılır ve ikinci deneme geçerse `ok:true`; `enabled:false` ya da alan eksik → `unavailable:true`; boş parola → `unavailable:false` ve fetch çağrılmaz; `userMode:'localpart'` iken gönderilen `user` `@` öncesidir; parola hiçbir log çıktısında geçmez.
  - `session`: `verifySession(sign(...))` yük döner; son harfi değiştirilmiş imza `null`; `exp` geçmiş `null`; farklı `secret` `null`; `slideSession` mutlak sınırı aşmaz.
  - `rate-limit`: 5. yanlıştan sonra `blocked` true; pencere dolunca false; `reset` temizler.
- [ ] **Step 2: Run to verify it fails** · `node --test tests/tmdauth.test.mjs tests/session.test.mjs tests/rate-limit.test.mjs` · FAIL
- [ ] **Step 3: Implement** the interfaces; HMAC-SHA256 `node:crypto`, karşılaştırma `timingSafeEqual`.
- [ ] **Step 4: Run to verify it passes** · PASS
- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse) · `feat: TmdAuth client, signed session token, login rate limit`

---

### Task 7: Giriş akışı ve erişim koruması

**Files:**
- Create: `auth/routes.mjs`, `login.html`
- Modify: `server.mjs` (`createApp(root, deps)`: `deps = { store, users, tmdauth, secret, limiter, onUpdate, isHttps }`; tüm istekler çerez kontrolünden geçer), `Baslat.bat` (açılışta `node auth/migrate.mjs` benzeri adım gerekmez: sunucu açılışta `store.migrate()` + `seedAdmins` çalıştırır), `.env.example` (`DATABASE_URL`, `SESSION_SECRET=DEGISTIR`, `ADMIN_EMAILS=`, `TMDAUTH_*`)
- Test: `tests/auth-flow.test.mjs`

**Interfaces:**
- Consumes: `UserStore` (Task 4), `seedAdmins` (Task 5), `createTmdAuth`, `verifySession`, `slideSession`, `signSession`, `createRateLimiter` (Task 6)
- Produces: `POST /_api/login` gövde `{ email, password }` → 200 + `Set-Cookie: vl_session` + `{ next }`; 401 `{ error: "invalid" }` (kayıtsız, pasif ve yanlış parola aynı cevap); 503 `{ error: "unavailable" }`; 429 `{ error: "locked" }`
- Produces: `POST /_api/logout` → çerezi siler; `GET /_api/me` → `{ email, role }` ya da 401
- Produces: çerezsiz/geçersiz çerezli her `GET` (statik dosyalar dahil, `/giris` ve `/_api/login` hariç) → 302 `/giris?next=<yol>`; API istekleri 401
- Produces: yerel `POST /_guncelle` (Task 3) çerezsiz kalır, yalnızca 127.0.0.1

- [ ] **Step 1: Write the failing tests** (bellek deposu + sahte TmdAuth ile gerçek `http` sunucusu)
  Çerezsiz `/` → 302 `/giris?next=%2F`; `/giris` 200 (oturumsuz); kayıtlı+aktif+AD doğru → 200 ve çerez, sonra `/` 200; kayıtsız e-posta, pasif kullanıcı, AD yanlış parola → hepsi aynı 401 gövdesi; AD `unavailable` → 503; 5 yanlıştan sonra doğru parolayla bile 429; `next=//evil.com` ve `next=https://evil.com` → `next` `/` olarak düzeltilir; yanlış `Origin` ile `POST /_api/login` 403; pasife alınan kullanıcının çerezi 60 sn önbellek dolunca (sahte saat) 302 olur; her kabul edilen istekte çerez kayan süreyle yenilenir; `SESSION_SECRET=DEGISTIR` ile `createApp` fırlatır; `Secure` yalnızca `isHttps` iken çerezde.
- [ ] **Step 2: Run to verify it fails** · `node --test tests/auth-flow.test.mjs` · FAIL
- [ ] **Step 3: Implement** `auth/routes.mjs` ve `server.mjs` bağlantısını; `login.html` e-posta + parola formu (Türkçe metin, hata mesajları "Giriş başarısız" ve "Kimlik servisine ulaşılamıyor"), "oturumu açık tut" kutusu yok, oturum her zaman kalıcı (spec). Kullanıcı önbelleği 60 sn.
- [ ] **Step 4: Run to verify it passes** · `node --test tests/` · PASS
- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse) · `feat: login flow and access guard`

---

### Task 8: Yönetim sayfası ve uzaktan güncelleme

**Files:**
- Create: `yonetim.html`, `auth/admin-routes.mjs`
- Modify: `gallery.html` (admin'e "Yönetim" bağlantısı, herkese "Çıkış"), `server.mjs` (admin uçlarını bağla)
- Test: `tests/admin.test.mjs`

**Interfaces:**
- Consumes: `createUsersService` (Task 5), oturum çözümü (Task 7), `onUpdate: () => Promise<{ method; changedFiles: string[] }>` (Task 2/3)
- Produces: `GET/POST /_api/users`, `PATCH/DELETE /_api/users/:id` (yalnızca `admin`; `ServiceError.code` → 409 `SELF_ACTION`/`LAST_ADMIN`/`DUPLICATE`, 400 `INVALID_EMAIL`, 404 `NOT_FOUND`)
- Produces: `POST /_api/update` (yalnızca `admin` + doğru `Origin`; çalışıyorsa 409 `{ error: "busy" }`) → `{ method, changedFiles, at }`; `GET /_api/update/status` → son turun `{ at, method, changedFiles, error? }`

- [ ] **Step 1: Write the failing tests**
  `user` rolü `/_api/users` ve `/yonetim` için 403; oturumsuz 401; admin liste/ekle/rol değiştir/pasife al/sil çalışır; hata kodları yukarıdaki gibi; `POST /_api/update` admin ile sahte `onUpdate` çağırır ve sonucu döner; ikinci eşzamanlı çağrı 409; `user` rolü 403; yanlış `Origin` 403; `GET /_api/update/status` son sonucu verir.
- [ ] **Step 2: Run to verify it fails** · `node --test tests/admin.test.mjs` · FAIL
- [ ] **Step 3: Implement**; `yonetim.html`: kullanıcı tablosu (e-posta, ad, rol, aktif, son giriş), ekle formu, satır işlemleri, "Şimdi güncelle" düğmesi + "Son güncelleme" satırı. Metinler Türkçe; `back-button.js` ile galeriye dönüş.
- [ ] **Step 4: Run to verify it passes** · `node --test tests/` · PASS
- [ ] **Step 5: Commit** (yalnızca kullanıcı "commit" derse) · `feat: admin page for users and remote update`

---
### Task 9: Gerçek kullanım yolu ile doğrulama

**Files:** yok (kod değişmez; hata çıkarsa ilgili task'a dönülür)

- [ ] **Step 1: Paketle ve kur**
  `Paketle.bat` çalıştır → zip üretildi, Gezgin'de üst öğeler görünüyor, `.env`/`.git` yok. Zip'i boş bir geçici klasöre aç, `PORT` için boş bir port ile `Kur.bat`'tan `.env` oluştur.

- [ ] **Step 2: Başlat ve tarayıcıdan aç**
  `Baslat.bat` ile aç; tarayıcıda `http://localhost:<port>/` galeriyi gösteriyor, bir görsel açılıyor, "geri" düğmesi galeriye dönüyor. `/.env`, `/.git/config`, `/server.mjs` 404.

- [ ] **Step 3: Güncelleme turunu gerçek GitHub ile dene**
  Zip kurulumunda (Git'siz klasör) bir güncelleme turu `main.zip`'i indirip uygular, hata yok. `.env` bozulmadı.

- [ ] **Step 4: Girişi sahte servislerle dene**
  Geliştirme makinesinde sahte TmdAuth (yerel küçük HTTP sahtesi) ve bellek deposuyla sunucuyu aç: tarayıcıda `/` → `/giris`; kayıtlı e-posta + doğru parola ile giriş, tarayıcıyı kapatıp açınca oturum duruyor; kayıtsız e-posta reddediliyor; admin ile `/yonetim`'de kullanıcı eklenip pasife alınıyor, "Şimdi güncelle" düğmesi sonuç gösteriyor; `user` rolü `/yonetim`'e giremiyor.

- [ ] **Step 5: Sonucu raporla**
  Sunucuda `Kur.bat`, gerçek RPA_DB tablosu ve gerçek TmdAuth ile girişin denenmediğini açıkça yaz; o kısmı kullanıcı sunucuda doğrular.
