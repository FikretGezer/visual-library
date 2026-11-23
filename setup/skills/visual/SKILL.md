---
name: visual
description: Use the user's visual library (animated visuals / wallpapers). Triggers on /visual, or when the user asks for a visual, animation, wallpaper, or to recreate something from an Instagram/video link. List, search, open, reuse or add entries.
---

# visual library

Library root: `{{LIB}}\`
- `library.js` — manifest (`window.LIBRARY = [...]`), single source of truth.
- `gallery.html` — searchable gallery with live previews.
- `<id>/index.html` + `<id>/NOTES.md` per entry.

## Commands
- `/visual` or `/visual list` — read `library.js`, print a short table: id, title, tags. Offer to open the gallery.
- `/visual gallery` — open `gallery.html` (built-in browser pane via navigate to the file URL, or `Start-Process` it in the user's default browser).
- `/visual <id or search words>` — match against id/title/tags/description. One match: open its `index.html` and say its path. Several: list them and ask which.
- `/visual add <name>` — save the current visual: create `<id>/index.html` + `NOTES.md` (technique, tunables, source), append an object to `library.js` (id, title, folder, tags, source, added date, description). Keep `README.md` short; do not duplicate the index there.

## Before building any new visual
1. Read `library.js`. If something similar exists, copy its folder to the target and adapt — read its `NOTES.md` first.
2. Only write from scratch if nothing fits. Afterwards run the `add` step.

The library is a git repo (private): https://github.com/FikretGezer/visual-library . After `add`, offer to run the `ship` skill from the library folder (update `CHANGELOG.md`, tag, push).

Keep entries single HTML files with no network dependencies. Every entry's `index.html` must include `<script src="../back-button.js"></script>` right after its canvas/body markup (glass "Library" button that returns to `gallery.html`; Esc also works). Never skip it when adding a new entry.
