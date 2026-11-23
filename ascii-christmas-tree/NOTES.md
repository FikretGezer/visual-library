# ASCII Christmas Tree

Port of the `agac.py` tree from Instagram post https://www.instagram.com/p/DfmBvgUNizn/ (@999.2006.01.19).

## Technique
- 3D point cloud (~100k points) rendered to a character grid with a per-cell z-buffer.
- Character from luminance ramp ` .:-=+*#%@`; colour from shaded point colour; bloom via 1/4-res blurred copy drawn with `lighter`.
- Tree: 24 tiers of drooping branches between Y0=0.42 and Y1=2.55, `envelope(y)=0.03+0.84*(1-f)^1.08`,
  `nb=7+11*(1-hf)` branches per tier, golden-angle tier offset, droop `0.07*s*L-0.22*(s*L)^2`, AO `0.35+0.65*s^1.3`.
- Garland: 3.6 turns, swag `-0.06*|sin(2.5*ag)|`. Trunk radius 0.085.
- Timeline: needles grow bottom-up with white flash (t0=1.3+5*hf+0.45*s), balls ~6s, garland ~7s,
  170 lights 8–11.6s, gifts 10–11.6s, star 11s. Rotation 18°/s.

## Tunables (top of script)
- `DENS` — needle density (0.5 = half original; lower if slow).
- Camera `CAMY`, `CAMZ`; focal `H*1.62`; grid `CH = H/86`.
- Gift list, `BALLCOL`, `LIGHTCOL`, HUD text.

## Not included
Video's code panel and music.
