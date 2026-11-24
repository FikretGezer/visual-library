# Visual Library: sunucu yayını (tasarım)

Tarih: 2026-11-24 · Durum: onay bekliyor (şirket içi kullanım, HTTPS kapsam dışı, 2026-11-24)

## Amaç ve neden

Visual Library bir Windows sunucuda 7/24 çalışacak. Kullanıcı `http://SUNUCU-IP:4099` ile açacak, ileride IP yerine domain yazacak. Yeni bir görsel eklediğinde (`/visual add` + GitHub'a push) sunucuya elle dosya taşımak zorunda kalmayacak; sunucu değişikliği kendisi çekecek. Görsellerin kodları zaten repo'da (`<id>/index.html` + `NOTES.md`, liste `library.js`), yani "kodlar da olsun" isteği sunucu repo'yu çekince kendiliğinden karşılanır.

Desen, kullanıcının AiMonitoring projesindeki akışla aynı: `Kur.bat` bir kez kurar, `Baslat.bat` çalıştırır, port/domain/şifre bir `.env` dosyasında durur, güvenlik duvarı kuralını Kur ekler, `Paketle.bat` küçük bir zip üretir.

## Hedefler

- Tek port, varsayılan 4099 (`.env` içindeki `PORT`).
- Sunucuda Node 22+ yeter, ek program yok. Tek npm bağımlılığı: SQL Server sürücüsü `tedious` (AiMonitoring'dekiyle aynı); `Kur.bat` `npm install --omit=dev` çalıştırır, derleme yok.
- Giriş zorunlu: e-posta hem RPA_DB'deki kullanıcı tablosunda (aktif) kayıtlı hem de TmdAuth (AD) ile doğrulanmış olmalı. Oturum açık kalır, tekrar tekrar giriş istenmez.
- Yönetim sayfasında yönetici, kimin girebileceğini (e-posta listesi) yönetir.
- Güncelleme otomatik ve elle tetiklenebilir: GitHub'a push, sonraki turda (varsayılan 30 dk) yayında; beklemek istemezsen `Guncelle.bat` ile anında.
- Domain gelince `.env`'e `PUBLIC_URL` yazmak yeter.
- AiMonitoring ile aynı alışkanlık: Kur, Baslat, Paketle.

## Hedef olmayanlar

- HTTPS sonlandırma (domain gelince ayrıca, ters vekil ile; AiMonitoring'de de öyle).
- Birden fazla yerel hesap, rol ayrıntısı (yalnızca `admin` ve `user`), parola sıfırlama, kayıt ekranı.
- Görselleri sunucudan düzenleme. Düzenleme geliştirme makinesinde, sunucu salt okunur.

## Yaklaşımlar

- **A) Aynı desen, içinde küçük Node sunucusu (seçildi).** Bağımlılıksız `server.mjs` dosyaları sunar, aynı süreç GitHub'ı periyodik kontrol eder. Artısı: AiMonitoring ile aynı alışkanlık, sunucuda zaten Node var, ek kurulum yok. Eksisi: HTTPS sonra ayrı iş.
- **B) Caddy + Görev Zamanlayıcı.** HTTPS otomatik, ama yeni program ve ayrı zamanlanmış görev gerekir, AiMonitoring ile ortak yanı yok. Seçilmedi.

Kullanıcı A'yı seçti.

## Tasarım (A)

Repo köküne eklenecek dosyalar:

- `server.mjs`: `node:http` ile statik dosya sunucusu. `0.0.0.0:PORT` dinler. `/` adresi `gallery.html`'e gider. Sunulmaz: adı `.` ile başlayan her şey (`.env`, `.git`, `.gitignore`), `server.mjs`, `.bat` dosyaları, `docs/`, `paketler/`. Yol geçişi (`..`) engellenir. Güvenlik başlıkları: `X-Content-Type-Options: nosniff`. Kapatma: Ctrl+C.
- Otomatik güncelleme (aynı süreçte, `UPDATE_MINUTES` dakikada bir, varsayılan 30; `.env`'den değişir, `0` otomatiği kapatır): klasörde `.git` varsa `git pull --ff-only`; yoksa GitHub'ın `main.zip` arşivini indirip PowerShell `Expand-Archive` ile klasörün üzerine açar (`.env` ve `paketler/` korunur). Dosyalar her istekte diskten okunduğu için görsel değişikliği için yeniden başlatma gerekmez. `server.mjs` değiştiyse süreç çıkar, `Baslat.bat` döngüsü 5 sn sonra yeniden başlatır. Güncelleme hatası sunucuyu düşürmez, loga yazılır, bir sonraki turda tekrar denenir.
- `Guncelle.bat`: elle tetikleme. Çalışan sunucuya yalnızca yerel makineden (127.0.0.1) kabul edilen `POST /_guncelle` isteği atar; sunucu hemen bir güncelleme turu yapar ve sonucu (değişen dosyalar / hata) ekrana yazar. Bu uç oturumsuzdur ve bu yüzden yalnızca yerel makineye açıktır; dışarıdan gelen istek 404 alır. Uzaktan tetikleme için yönetim sayfasındaki düğme kullanılır (aşağıda). `server.mjs` değiştiyse sunucu kendini yeniden başlatır.
- `Baslat.bat`: Node kontrolü, `.env` kontrolü, `node server.mjs` döngüsü (çökerse 5 sn sonra yeniden). Açılışta erişim adreslerini yazar (`http://10.x.x.x:4099`).
- `Kur.bat`: Node 22+ kontrolü, `.env` yoksa `.env.example`'dan oluşturur, güvenlik duvarında TCP `PORT` için kural ekler (yönetici gerekir, yoksa uyarı verir). Tekrar çalıştırılabilir, `.env` korunur.
- `Paketle.bat`: `paketler\VisualLibrary_<tarih>.zip` üretir. Hariç: `.git`, `.env`, `paketler`. Sunucuya ilk kez zip ile taşımak için. Sonrası otomatik güncelleme.
- `.env.example`: `PORT=4099`, `PUBLIC_URL=` (boş), `UPDATE_MINUTES=30`, `REPO=FikretGezer/visual-library`, `BRANCH=main`.
- `.gitignore`'a `paketler/` eklenir. `README.md`'ye "Sunucuya kurulum" bölümü eklenir.

### Benim kararlarım (düzeltebilirsin)

- **Oturum durumu veritabanında değil, imzalı çerezde** (aşağıda). Gerekçe: ikinci bir tablo ve oturum temizliği gerekmez; sunucu yeniden başlasa da giriş kalır.
- **Veritabanına yazma yalnızca yeni şema/tablo:** `visuallibrary` şeması ve `visuallibrary.users`. AiMonitoring'in tablolarına dokunulmaz. Migrasyon `IF NOT EXISTS` ile tekrar çalıştırılabilir, hiçbir veriyi silmez/değiştirmez. Ben geliştirme sırasında RPA_DB'ye bağlanmam; testler sahte (bellek içi) depoyla koşar. Tablo, sunucuda `Kur.bat` ilk çalışınca (ya da SQL dosyasını elle çalıştırınca) oluşur.
- **Güncelleme için Git'e bağımlılık yok** (zip yedeği var), çünkü sunucuda Git kurulu olmayabilir.
- **Salt okunur sunum:** sunucudan yazma/yükleme ucu yok.

## Giriş ve kullanıcılar

**Kural:** Bir kişi yalnızca (1) e-postası `visuallibrary.users` tablosunda var ve `is_active=1` ise **ve** (2) TmdAuth parolasını doğruluyorsa girer. İkisinden biri eksikse giriş reddedilir. Tablo kontrolü önce yapılır; kayıtsız e-posta için TmdAuth'a hiç sorulmaz. Kullanıcıya her iki durumda da aynı "giriş başarısız" mesajı gösterilir, böylece bir e-postanın listede olup olmadığı sızmaz. TmdAuth erişilemiyorsa ayrı bir "kimlik servisine ulaşılamıyor" (503) mesajı verilir.

**Tablo** `visuallibrary.users`:

| Kolon | Tür | Not |
|---|---|---|
| `id` | bigint IDENTITY PK | |
| `email` | nvarchar(320) UNIQUE | küçük harfe çevrilmiş, boşluksuz |
| `display_name` | nvarchar(200) NULL | |
| `role` | nvarchar(10) | `admin` veya `user` (CHECK), varsayılan `user` |
| `is_active` | bit | varsayılan 1 |
| `created_at` | datetime2(3) | varsayılan `SYSUTCDATETIME()` |
| `created_by` | nvarchar(320) NULL | ekleyen yönetici |
| `last_login_at` | datetime2(3) NULL | |

Migrasyon dosyası `sql/0001_users.sql`. Bağlantı: `.env` içindeki `DATABASE_URL` (AiMonitoring ile aynı biçim: `sqlserver://host:port;database=RPA_DB;user=...;password=...`), sürücü `tedious`.

**İlk yönetici:** `.env` `ADMIN_EMAILS=a@x.com,b@x.com`. Tablo boşken (hiç kayıt yokken) bu e-postalar `admin` olarak eklenir; sonra liste yönetim sayfasından yönetilir.

**TmdAuth:** AiMonitoring'deki `tmdauth.ts`'in aynı iki ucu (`/api/login` ile servis tokeni, `/api/checkAdUser` ile doğrulama), aynı ayar adları: `TMDAUTH_ENABLED`, `TMDAUTH_API_DOMAIN`, `TMDAUTH_API_KEY`, `TMDAUTH_API_PASS`, `TMDAUTH_USER_MODE`, `TMDAUTH_INSECURE_SSL`, `TMDAUTH_TIMEOUT_MS`. Değerleri kullanıcı AiMonitoring sunucusundaki `infra\.env` dosyasından kendi `.env`'ine kopyalar. Alanlar eksikse giriş güvenli tarafta kapalı kalır. Parolalar loglanmaz.

**Yerel acil durum yöneticisi (kullanıcı isteği, sonradan eklendi):** `.env` içinde `LOCAL_ADMIN_EMAIL` ve `LOCAL_ADMIN_PASSWORD` (en az 12 karakter) birlikte doluysa tek bir yerel hesap açılır. Giriş sırasında TmdAuth'a ve tabloya sorulmaz, oturum doğrulamasında veritabanı aranmaz; böylece AD ya da RPA_DB kapalıyken de girilir. Rolü `admin`, tabloda satırı yok, kullanıcı listesinde görünmez, aynı deneme sınırına tabidir. Yalnızca biri doluysa ya da parola kısaysa sunucu ayar hatasıyla (kod 78) açılmaz. Parola düz metin olarak `.env`'de durur (veritabanı parolasıyla aynı güven düzeyi). İkisi boşsa özellik kapalıdır.

**Oturum (açık kalır):** `vl_session` çerezi = imzalı jeton (`email`, `iat`, mutlak `exp`; HMAC-SHA256, anahtar `.env` `SESSION_SECRET`). Süre kayar: her istekte 14 gün, mutlak üst sınır 30 gün; `HttpOnly`, `SameSite=Lax`, `Secure` yalnızca `PUBLIC_URL` `https://` ise. Her istekte kullanıcının hâlâ tabloda aktif olduğu kontrol edilir (60 sn önbellekli): pasife alınan ya da silinen kişi en geç 1 dakikada oturumdan düşer. `SESSION_SECRET` boş ya da `DEGISTIR` ise sunucu başlamaz. Çıkış çerezi siler. Aynı e-posta için 5 yanlış denemeden sonra 15 dakika kilit (bellekte).

**Erişim:** Çerezsiz her istek `/giris` sayfasına yönlenir (statik dosyalar dahil). `/giris` sayfası ve `POST /_api/login` açık. `/_guncelle` yalnızca 127.0.0.1'den. CSRF: değiştirici isteklerde `Origin` ana makine adıyla eşleşmeli.

**Yönetim sayfası** `/yonetim` (yalnızca `admin`): kullanıcı listesi, e-posta ekle (ad ve rol ile), pasife al/aktif et, rol değiştir, sil. Kendini silemez ve pasife alamaz; son aktif `admin` silinemez/pasife alınamaz. Uçlar `/_api/users` (GET, POST, PATCH, DELETE). Galeriye "Yönetim" bağlantısı yalnızca admin'e görünür; çıkış düğmesi herkese.

**Uzaktan güncelleme (platformdan, her yerden):** Yönetim sayfasında "Şimdi güncelle" düğmesi ve "Son güncelleme" satırı (zaman, yöntem `git`/`zip`, değişen dosyalar ya da hata). Düğme `POST /_api/update` çağırır; yalnızca geçerli `admin` oturumu ve doğru `Origin` ile kabul edilir, aksi halde 401/403. Aynı anda tek güncelleme turu çalışır (çalışıyorsa 409). Böylece sunucuya bağlanmadan, giriş yaptığın her yerden tetiklersin. Güncelleme `server.mjs`'i değiştirdiyse sunucu yeniden başlar ve sayfa kısa süre yanıt vermez. Yerel `Guncelle.bat` ve 127.0.0.1 ucu yedek olarak kalır (sunucu girişi bozuk/AD kapalıyken de çalışır).

**Erişim kapsamı (kullanıcı kararı):** Yalnızca şirket ağı içinde kullanılacak, internetten erişim yok. Bu yüzden HTTPS kurulmuyor; AiMonitoring ile aynı durum (``http://IP:4099``). Bilinen sonuç: AD parolası şirket ağında düz HTTP ile gider. Dışarıya açılması istenirse önce domain + HTTPS gerekir; bu tasarımın kapsamı dışındadır. Sunucu internet yönlendirmesiyle dışarı açılmamalı.

## Doğrulama (yapılınca)

Geliştirme makinesinde boş bir portta çalıştırılıp denenecek: `/` ve bir görsel sayfası 200, `/.env` ve `/.git/config` ve `/../` denemeleri 404/403, `server.mjs` ve `.bat` dosyaları sunulmuyor, güncelleme turu hata vermeden çalışıyor; çerezsiz istek `/giris`'e yönleniyor; kayıtsız e-posta, pasif kullanıcı ve yanlış parola reddediliyor (sahte TmdAuth ve sahte kullanıcı deposu ile); kayıtlı + AD doğru ise giriş oluyor ve yeniden başlatmadan sonra oturum duruyor; yönetim sayfası yalnızca admin'e açık, son admin silinemiyor. Gerçek RPA_DB ve gerçek TmdAuth ile giriş geliştirme makinesinde denenmez; kullanıcı sunucuda doğrular. Gerçek sunucuda `Kur.bat` denenmeden "çalışıyor" denmeyecek; bu kısmı sunucuda kullanıcı doğrular.

## Builder'a kalanlar

Kod ayrıntıları (MIME tablosu, log biçimi, zip açma sırası) uygulayıcının kararı.
