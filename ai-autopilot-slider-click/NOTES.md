# AI Autopilot Slider (click version)

Recreated from Instagram reel https://www.instagram.com/reel/DgFKoAWvFq6/ (thebotfather.ai). Second take next to `ai-autopilot-slider`; this one is simpler and adds click-to-snap.

## What it shows
Pixel-art room in a pill track. Glass lens splits the scene: left of lens = bright "full autopilot", right of lens = dark "manual chaos".
- Chaos: night window with stars, post-its, red error monitors, tired person at desk, three sleeping robots (z), dim lamp, empty couch.
- Autopilot: day window, green charts, hovering robots, person relaxing on couch with laptop, lit lamp, red bot on cabinet, music notes.
- Whole page changes with the slider: background, track rim, shadow, header label (`05 MANUAL CHAOS` red to `100% FULL AUTOPILOT` green).

## Technique
- Two 256x48 offscreen canvases (`cAuto`, `cChaos`) redrawn each frame by `drawRoom(g, auto, t)` with `fillRect`. Composite: chaos full, then autopilot clipped to `x < pos*256`. Upscaled with `image-rendering: pixelated`.
- Lens: DOM capsule taller than the track, `backdrop-filter` glass, plus its own canvas that re-samples the composite at `MAG = 1.35`. Stretches with velocity (squash and stretch).
- `pos` follows `target` with exponential smoothing: `pos += (target-pos) * (1 - exp(-dt*rate))`. `rate = 16` while dragging, `rate = 4` for click glide.
- Theme: `applyTheme(pos)` lerps CSS variables (`--bg1 --bg2 --rimA --rimB --status --shadow`).
- Sound (Web Audio, starts on first input): bandpass noise whoosh scaled by velocity, tick every 1/24, chime up when crossing 50% to autopilot, glitch down to chaos. Mute button bottom-right.

## Modes
Switch with the pill at the bottom centre (Otomatik / Tikla) or the M key; the choice is remembered (localStorage key `vl-slider-click-mode`). Default is click.
- **Click:** click empty track left of lens: glide to full chaos. Right of lens: glide to full autopilot.
- **Auto:** lens drifts left and right by itself (12 s per round trip, lingers at both ends). Dragging the lens or using the keys pauses it for 2.5 s; clicking empty track does nothing.
- **Preview:** opening the page with `?preview=1` (the gallery thumbnails do this) forces auto mode, hides the mode pill, hint and mute button, and starts no sound.

## Interaction
- Press the lens and drag: scrub. Arrow keys / Home / End also work.

## Tunables
`AUTO_PERIOD = 12` (seconds per auto round trip), `AUTO_RESUME_MS = 2500`, `rate = 4` (click glide speed), `MAG`, `--lens-w`, `THEME` colours, sprite coordinates inside `drawRoom`.

## Not included
Reel's exact sprites (redrawn by eye from 12 s of video) and its watermark.
