# Changelog

## v0.5.2 - 2026-11-24
AI autopilot slider (click): two modes.

### Added
- Mode switch inside the page (pill at the bottom, or the M key): auto (lens drifts left and right on its own) and click (click either side to go there). The choice is remembered.
- Gallery preview of this entry now shows the auto drift (page opened with `?preview=1`, which hides the controls and sound).

## v0.5.1 - 2026-11-24
Logo and tab icon.

### Added
- Library logo on the login page, gallery and admin page; skull icon as the tab icon on every page (`favicon.png`, `favicon.ico`, `apple-touch-icon.png`). Logo and icon files open without login.
- Admin page: "Ana sayfaya dön" button back to the gallery.

## v0.5.0 - 2026-11-24
Server hosting with login.

### Added
- `server.mjs` serves the library on port 4099 (`PORT` in `.env`). `Kur.bat`, `Baslat.bat`, `Paketle.bat`, `Guncelle.bat` follow the AiMonitoring pattern.
- Login: e-mail must be an active row in `visuallibrary.users` (RPA_DB) and TmdAuth must accept the password. Signed-cookie sessions (14 days sliding, 30 max) survive restarts.
- `/yonetim` admin page: manage users (add, activate/deactivate, role, delete) and trigger an update from anywhere.
- Auto update from GitHub every `UPDATE_MINUTES` (default 30): `git pull`, or repo zip when Git is missing.
- Emergency admin account (`LOCAL_ADMIN_EMAIL` / `LOCAL_ADMIN_PASSWORD`) that logs in without TmdAuth or the database.
- New library entry: AI Autopilot Slider (click).
- `/visual github` skill command to commit, tag and push so the server pulls the change.

## v0.4.3 - 2026-11-23
Slider now stays night and messy until the far end.

### Changed
- AI autopilot slider: the night-to-day change follows a late curve (position^2.6). At 50% and 75% the room is still dark and messy; the final day look arrives only near 100%.

## v0.4.2 - 2026-11-23
Skill setup moved to its own repo.

### Changed
- The `setup/` skills, rules and install script now live in the private repo `FikretGezer/claude-setup`, with detailed instructions the other computer's Claude can follow alone. This repo keeps only the visuals and a pointer.

## v0.4.1 - 2026-11-23
Slider timing: the night-to-day change now starts later and finishes at the end.

### Changed
- AI Autopilot Slider: the room starts changing when the lens is near 30% and reaches the full daytime look only close to 100%. Before, it was already fully day at about 50%. Robots, the person, the check mark and the music notes were re-timed to match.

## v0.4.0 - 2026-11-23
One-command setup for another computer.

### Added
- `setup/` folder with the `visual` and `ship` skills, the CLAUDE.md rules (caveman always on, use skills proactively, check the library first) and `install.ps1`. Clone the repo, run the script, start a new session.
- `setup/README.md` with the steps and the plugins that must be installed by hand (superpowers, caveman).

## v0.3.1 - 2026-11-23
Fix the back button when pages are opened as local files.

### Fixed
- The "Library" button went one folder too high and showed "file not found" when a visual was opened by double-clicking. It now returns to `gallery.html` correctly.

## v0.3.0 - 2026-11-23
Back button on every visual, and a fisheye lens for the slider.

### Added
- A glass "Library" button on every visual that returns to the gallery. It fades out when the mouse is still so wallpapers stay clean; Esc works too. One shared file, `back-button.js`, so new visuals get it with a single line.

### Changed
- AI Autopilot Slider: the lens now magnifies and bends what is under it like the original video, instead of being a plain glass overlay. Lens size and travel range match the video.

## v0.2.0 - 2026-11-23
Second entry: an interactive pixel-art slider.

### Added
- AI Autopilot Slider: a pixel-art room in a capsule. A glass lens moves from dark manual chaos to bright full autopilot, and you can drag it yourself.
- `NOTES.md` for it, with the technique, timings and tunable values.

## v0.1.0 - 2026-11-23
First release: a reusable library of animated visuals with a searchable gallery.

### Added
- ASCII Christmas Tree: rotating 3D tree drawn with ASCII characters, ported from the `agac.py` video. It grows in, then lights, garland, ornaments, gifts and the star appear.
- `gallery.html`: searchable gallery with tag filters and live previews.
- `library.js`: single list of all entries; the gallery and the `/visual` skill both read it.
- Per-entry `NOTES.md` explaining the technique and tunable values.

### Why
- Visuals are saved once and reused instead of being rewritten each time.
- One manifest file keeps the library organised as it grows.

