// Render preview stills at given timestamps (seconds): node scripts/stills.mjs 1.5 9 12.25
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const times = process.argv.slice(2).map(Number);
const outDir = process.env.STILLS_DIR ?? 'out/stills';
const browserExecutable = process.env.REMOTION_BROWSER ?? null;
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts') });
const comp = await selectComposition({ serveUrl, id: 'BasePromo', browserExecutable, chromiumOptions: { gl: (process.env.REMOTION_GL ?? 'swangle') } });
for (const s of times) {
  const frame = Math.min(comp.durationInFrames - 1, Math.round(s * comp.fps));
  const output = path.join(outDir, `t${s.toFixed(2)}.jpg`);
  const t0 = Date.now();
  await renderStill({ composition: comp, serveUrl, frame, output, imageFormat: 'jpeg', jpegQuality: 85, scale: 0.5, browserExecutable, chromiumOptions: { gl: (process.env.REMOTION_GL ?? 'swangle') } });
  console.log(output, `${Date.now() - t0}ms`);
}
