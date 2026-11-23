# Changelog

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
