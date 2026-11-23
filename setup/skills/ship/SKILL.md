---
name: ship
description: Push the current project to GitHub with a version number and clear release notes. Use when the user says "/ship", "push to github", "release this", "version it", or "publish this project". Commits changes, bumps a semver tag, writes notes to CHANGELOG.md, pushes, and creates a GitHub release.
---

# ship

Push the current project to GitHub, version it, and write clear notes for each push. Optional input from the user: bump type (`patch`, `minor`, `major`) or a note about what changed.

## Steps

1. **Inspect state** (run in parallel): `git status --short`, `git log --oneline -10`, `git tag --sort=-v:refname | head -5`, `git remote -v`, `gh auth status`.
   - If not a git repo: `git init -b main`, and tell the user.
   - If `gh` is not authenticated, stop and tell the user to run `! gh auth login`.

2. **Ensure a remote.** If no `origin` exists, ask the user (AskUserQuestion) for the repo name (default: the folder name, lowercased and hyphenated) and visibility (default: **private**). Creating a repo is outward-facing, so never do it without that confirmation. Then `gh repo create <name> --private|--public --source=. --remote=origin`.

3. **Check for secrets before anything is committed.** Scan changed/untracked files for `.env`, `*.key`, `*.pem`, credentials, tokens. If found, add to `.gitignore` or stop and warn. Do commit `.claude/handoff/latest.md` (the session record of what was done and why); because it is overwritten each session, git history keeps every version. Do not commit other local files under `.claude/` (e.g. `settings.local.json`); add them to `.gitignore` if missing. If the repo is public, warn the user that the handoff note will be public too.

4. **Choose the version.** Semver `vMAJOR.MINOR.PATCH`.
   - No tags yet: `v0.1.0`.
   - Otherwise bump the latest tag: user-specified type if given; else `minor` for new features, `patch` for fixes/tweaks, `major` only for breaking changes (and confirm with the user before choosing major).
   - If there is nothing to commit and HEAD is already tagged, say so and stop.

5. **Write the notes.** If `.claude/handoff/latest.md` exists and is newer than the last tag, treat it as the primary source for the *why* (goal, decisions, state). If it looks stale or missing, suggest the user run `/handoff` first, then continue. Also read the actual diff (`git diff HEAD`, or `git diff <last-tag>..HEAD` for earlier commits) so notes reflect real changes, not guesses. Prepend a new section to `CHANGELOG.md` (create it if missing, with a `# Changelog` header):

   ```
   ## vX.Y.Z - YYYY-MM-DD
   One-sentence summary of this release.

   ### Added
   - ...
   ### Changed
   - ...
   ### Fixed
   - ...
   ```

   ### Why
   - Key decisions from the handoff note, in one or two bullets.

   Omit empty sections. Each bullet says what changed *for the user*, in plain words, not file names alone.

6. **Commit and tag.** Stage specific files (not blindly `git add -A` if anything suspicious showed up in step 3). Commit message: `vX.Y.Z: <summary>` with a short body of the key bullets, ending with the Co-Authored-By line from the session's attribution reminder if one is present. Then `git tag -a vX.Y.Z -m "<summary>"`.

7. **Push.** `git push -u origin HEAD` then `git push origin vX.Y.Z`. Never force-push. If the push is rejected, report why and stop.

8. **Create the GitHub release.** `gh release create vX.Y.Z --title "vX.Y.Z - <summary>" --notes-file <the new changelog section>` (write the section to a temp file in the scratchpad).

9. **Report** in 3-4 lines: version, commit hash, repo URL, release URL. Nothing else.

## Rules
- Never rewrite history, force-push, or delete tags/releases unless the user explicitly asks.
- If the diff is empty and there is nothing new to release, say so instead of making an empty release.
- Keep notes factual and short; no marketing language.
- Run `graphify update .` afterward only if `graphify-out/` exists.
