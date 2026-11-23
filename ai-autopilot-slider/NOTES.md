# AI Autopilot Slider

Recreated from Instagram post https://www.instagram.com/p/DgFKoAWvFq6/ (12.8 s, 1916x1078 landscape).

## What it shows
Pixel-art room inside a pill-shaped capsule. A glass lens slides left to right.
- 0% "MANUAL CHAOS": night, stars, person typing at two red-code monitors, floating post-its, three sleeping robots, empty couch, lamp off.
- 100% "FULL AUTOPILOT": day, green code and bar chart, robots work and hover, person on the couch with sunglasses, music notes, lamp on.
- Header label changes with the value: `00 MANUAL CHAOS` (red), `NN% AI ASSISTED` (orange to yellow), `100% FULL AUTOPILOT` (green).

## Technique
- Scene is drawn at 264x80 pixels on an offscreen canvas with `fillRect`, then scaled up with smoothing off and clipped to the pill.
- One value `v` (0..1) drives everything. `g = smoothstep(v, 0.28, 0.6)` blends night to day palettes; objects fade or move on their own thresholds (post-its out at 0.1–0.38, robots wake and fly 0.3–0.72, person moves to couch 0.55–0.82).
- Glass lens: translucent gradient, white rim, specular ellipse, drop shadow.
- Timeline matches the video: hold 1.4 s, ease to 100% over 3.6 s, hold 4 s, return in about 1.8 s.

## Interaction
Drag the lens to scrub. It snaps to the nearer end and the auto loop resumes after about 3 s of no input.

## Tunables
`SW/SH` scene size; thresholds inside `drawScene`; timings in `stepAuto`; lens size in `layout()`.

## Not included
Video's exact pixel sprites (redrawn by eye) and the original creator's watermark (replaced with a small "visual-library" label).
