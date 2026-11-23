# Changelog

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
