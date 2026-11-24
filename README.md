# Visual Library

Reusable animated visuals / wallpapers (self-contained single-file HTML).

- **Browse:** open `gallery.html` — search, tag filters, live previews.
- **Call from Claude:** `/visual` (list), `/visual <name>` (open), `/visual gallery`, `/visual add <name>` (save current work).
- **Index:** `library.js` is the only list. Each entry lives in `<id>/index.html` + `<id>/NOTES.md`.

## Server hosting (Windows, company network)

The library can run on a server and be opened at `http://SERVER-IP:4099`. Login is required: an e-mail must be an **active** row in `visuallibrary.users` (RPA_DB) **and** the TmdAuth (AD) password must be correct.

First install (the server only needs Node 22+ and internet):
1. On the dev machine run `Paketle.bat`; copy `paketler\VisualLibrary_<date>.zip` to the server and unzip it.
2. On the server run `Kur.bat` (as administrator, once). It creates `.env` and opens it: set `SESSION_SECRET` (16+ random chars), `DATABASE_URL`, `ADMIN_EMAILS` (first admin) and the `TMDAUTH_*` values (copy them from AiMonitoring's `infra\.env`). It also installs the dependency (`tedious`) and opens the firewall port.
3. Run `Baslat.bat`. The table `visuallibrary.users` is created on first start (new schema only; nothing existing is touched).

Updates: push to GitHub. The server checks every `UPDATE_MINUTES` (default 30; `0` = off) and pulls by `git pull`, or by downloading the repo zip when Git is not installed. To update right away: admin page `/yonetim` -> "Şimdi güncelle" (works from anywhere you are logged in), or `Guncelle.bat` on the server.

Users: admins manage who may log in at `/yonetim`. Sessions stay open (14 days sliding, 30 days max) and survive restarts and updates.

Network note: no HTTPS, so the AD password travels as plain HTTP. Use inside the company network only. Do not expose the port to the internet.

Development (no database, fake users): set `DEV_MEMORY_STORE=true` in `.env`. Users then live in memory only. Tests: `npm test`.

Emergency account: set `LOCAL_ADMIN_EMAIL` and `LOCAL_ADMIN_PASSWORD` (12+ chars) in `.env` to get an admin that logs in without TmdAuth and without the database (works when AD or RPA_DB is down). It has no table row, never shows in the user list, and is rate limited like any login. Leave both empty to disable.
