# BASE promo video

A 90-second, 1080p, 60fps launch video for BASE, written as code with
[Remotion](https://www.remotion.dev). Every frame is React, built from the
app's own Aurora Glass tokens (`src/theme.ts` mirrors `src/ui/tokens/`), and
the soundtrack is synthesised from scratch by `scripts/soundtrack.mjs`. There
are no stock assets and nothing to license.

This folder is separate from the app: it has its own `package.json`, and
nothing in the app imports it.

## Render it

You need Node.js 18 or newer.

```bash
cd promo
npm install
npm run render        # → out/base-promo.mp4, using your GPU (--gl=angle)
```

The first run downloads Remotion's headless Chrome (about 100 MB).

| Command | What it does |
|---|---|
| `npm run studio` | Opens Remotion Studio in the browser: scrub the timeline, preview and tweak live. |
| `npm run render` | The final video: 1920×1080, 60fps, H.264 with sound, rendered on the GPU. |
| `npm run render:cpu` | The same, using software GL. Use it if `render` fails on your machine. |
| `npm run render:draft` | A quick 960×540, 30fps draft. |
| `npm run audio` | Regenerates `public/soundtrack.wav` only. `studio` and the renders run it for you. |
| `npm run stills 9.6 29.5 53.8` | Writes preview JPEGs at those timestamps (seconds) to `out/stills/`. |

Rendering is heavy (glass, glow, blur and particles on every frame), so 60fps
1080p takes a while even on a laptop GPU. For a faster render, add
`--concurrency=8` (or about the number of CPU cores you have) to the render
command.

## The cut

| Time | Scene | File |
|---|---|---|
| 0:00 | Chaos: 128 open tasks, everything urgent, then a vortex collapse | `scenes/Chaos.tsx` |
| 0:08 | Gel droplets fuse, burst, and the BASE mark appears on liquid glass | `scenes/Logo.tsx` |
| 0:14 | The project board flies in in 3D; a drag and drop; a "waiting on" link | `scenes/Board.tsx` |
| 0:24 | The priority score: seven factors, the danger zone, the task rising to the top | `scenes/ScoreScene.tsx` |
| 0:36 | Smart Start → Select → Deadlines: the day builds itself | `scenes/SmartStart.tsx` |
| 0:47 | Focus: one task and a timer, subtasks, Mark done | `scenes/Focus.tsx` |
| 0:57 | The AI agent: tool calls, live board edits, an approval card, Revert, local models | `scenes/Agent.tsx` |
| 1:13 | Share links (a liquid split), Calendar, push, phone / tablet / desktop | `scenes/Everywhere.tsx` |
| 1:23 | Score. Plan. Focus. Done. Then the logo lockup and the call to action | `scenes/Finale.tsx` |

`src/Promo.tsx` holds the timeline. Scenes are timed in seconds, so changing
the frame rate in `src/Root.tsx` changes nothing else.

## Changing things

- **End-card copy** (tagline, CTA, link): the `CTA` object in `src/components/app.tsx`.
- **Music**: replace `public/soundtrack.wav` with your own track, and drop
  `npm run audio &&` from the scripts so it isn't regenerated. The sound
  effects are cued to the timeline in `scripts/soundtrack.mjs`, in seconds.
- **Device screens** use the real screenshots in `public/shots/` (copied from
  `docs/screenshots/`).
- **Materials**: `components/primitives.tsx` has the glass (with the app's
  lens refraction filter), gel, kinetic type, cursor, particles and shockwaves.

## Licence note

Remotion is free for individuals and companies of up to three people; larger
companies need a [company licence](https://www.remotion.dev/license).
