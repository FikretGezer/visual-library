# Setup on another computer

Skills and rules live in `~/.claude` on each machine, so they do not follow you automatically.
This folder carries them in the repo.

## 1. Clone and install

```powershell
git clone https://github.com/FikretGezer/visual-library "$HOME\Desktop\Claude Projects\visual-library"
powershell -ExecutionPolicy Bypass -File "$HOME\Desktop\Claude Projects\visual-library\setup\install.ps1"
```

Needs `git` and `gh auth login` (the repo is private). Any folder works instead of Desktop.
Start a **new** Claude Code session afterwards.

What it installs:
- skill `visual` (`/visual`, `/visual add`, `/visual gallery`), with the library path of that machine filled in
- skill `ship` (push + version + release notes)
- a marked block in `~/.claude/CLAUDE.md`: caveman always on, use skills proactively, check the library first

Re-running is safe: it replaces its own block, nothing else.

## 2. Plugins (manual, they are not files in this repo)

- **superpowers** (debugging, verification, brainstorming skills):
  `/plugin marketplace add obra/superpowers-marketplace` then `/plugin install superpowers@superpowers-marketplace`
- **caveman**: comes from the Claude desktop app's plugin list for the account. Sign in with the same account in the desktop app; if it is not there, install it from the app's plugin directory.

## Keeping both machines in sync

After changing a skill here, copy the new `SKILL.md` into `setup/skills/<name>/` (keep `{{LIB}}` where the library path was), commit and push. On the other machine: `git pull`, then run `install.ps1` again.
