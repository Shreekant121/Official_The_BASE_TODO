/**
 * Aurora Glass — AiPresence (V3-8)
 * Ported from design-system/components/data/AiPresence.jsx (v4).
 * Specimen: design-system/components/data/ai-presence.card.html
 *
 * Atlas's character mark: a matte blue sphere that turns slowly while bands
 * of ripple travel across it. WebGL, one triangle, raymarched — the only
 * genuinely new rendering technique in the v4 bundle, and NOT the glass
 * system (the rest of V3's material is still CSS).
 *
 *   state   idle | thinking | speaking   — ripple energy, eased, never snapped
 *   level   0–1, a live voice level while speaking (optional)
 *
 * The shader, the three state targets and the easing constants are the
 * source's, unchanged. What this file adds is everything the prototype left
 * to luck, because the queue's instruction for it is **"it must degrade, not
 * fail"**:
 *
 *   1. **A drawn fallback that looks meant.** The source falls back to a flat
 *      gradient disc, and only when `getContext('webgl')` returns nothing.
 *      Here the fallback is the same sphere in CSS — the source's gradient,
 *      a faint rim, and a band layer that turns slowly (faster while
 *      thinking), so a device that cannot run the shader still gets a mark
 *      that is alive rather than a sticker.
 *   2. **More ways in to it.** No WebGL at all, a program that will not link,
 *      a context the browser takes back (`webglcontextlost` — Android does
 *      this under memory pressure), and **a device too slow to draw it**. The
 *      last is the one that matters on his tablet, which has a phone's GPU:
 *      every twelfth frame the loop times its OWN draw to completion (a
 *      one-pixel `readPixels` waits for the GPU to finish it), and if that
 *      costs more than `BUDGET_MS` it steps the canvas resolution down once,
 *      then hands over to the fallback. A stuttering orb is worse than a
 *      still one. **It times the draw, not the frame rate**, and that is a
 *      measurement: with software GL at tablet size, dock mode ran at 29fps
 *      with WebGL switched off altogether — the page's own glass is that
 *      heavy there — so a frame-rate test blames the orb for the page and
 *      turns it off on a device where it costs almost nothing.
 *   3. **It only draws while it can be seen.** Off screen (an
 *      `IntersectionObserver`), `paused` by its screen (dock mode covers the
 *      chat, so the chat's orbs stop), or a hidden tab (the browser stops
 *      `requestAnimationFrame` itself). The source animated for ever.
 *   4. **Reduced motion draws one frame and stops**, the source's own rule.
 *
 * The loop's clock is the sum of `requestAnimationFrame`'s own deltas, never
 * the wall clock. **That alone does not make `npm run shots` reproducible**:
 * the harness's fake clock drives rAF but keeps flowing in real time between
 * its jumps, so a live orb had turned a different amount at every capture.
 * Under the harness it draws one settled frame instead —
 * `lib/devStillPresence.ts` has the measurement.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { devStillPresence } from '../../lib/devStillPresence';
import { useMedia } from '../useMedia';

export type AiPresenceState = 'idle' | 'thinking' | 'speaking';

export interface AiPresenceProps {
  state?: AiPresenceState;
  /** Width and height. A number is px; a string is any CSS length (`clamp(…)`). */
  size?: number | string;
  /** Live voice level 0–1 while speaking. Without it, speaking synthesises one. */
  level?: number;
  /** Stop drawing — the screen is covered. The last frame stays up. */
  paused?: boolean;
  /** Greyed and still: the thing it stands for cannot work (dock mode, microphone blocked). */
  dim?: boolean;
  /** Hide from assistive tech when a visible label beside it already says "Atlas". */
  decorative?: boolean;
  style?: CSSProperties;
}

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `
precision highp float;
uniform vec2 R; uniform float T; uniform float A; uniform float F; uniform float S; uniform float V;
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
float disp(vec3 q){
  vec3 ax=normalize(vec3(.35,1.,.2));
  float h=dot(q,ax);
  float env=smoothstep(-.9,.2,sin(T*.55+h*1.3));
  float band=sin(h*F-T*2.2)*env;
  float wob=sin(q.x*2.3+T*.7)*sin(q.z*2.1-T*.6)*.5;
  return A*band*.075+wob*.045;
}
float map(vec3 p){
  vec3 q=rotY(T*.35)*rotX(sin(T*.23)*.35)*p;
  float ang=acos(clamp(normalize(p).z,-1.,1.));
  float ring=sin(ang*9.-T*7.)*smoothstep(2.4,.2,ang);
  float voice=S*(ring*(.025+V*.07)-V*.06);
  return length(p)-1.+disp(q)*(1.-S*.45)+voice;
}
void main(){
  vec2 uv=(gl_FragCoord.xy*2.-R)/min(R.x,R.y);
  vec3 ro=vec3(0.,0.,3.4), rd=normalize(vec3(uv*1.45,-2.6));
  float t=0.,d; bool hit=false;
  for(int i=0;i<96;i++){d=map(ro+rd*t);if(d<.001){hit=true;break;}t+=d*.6;if(t>6.)break;}
  if(!hit){gl_FragColor=vec4(0.);return;}
  vec3 p=ro+rd*t; vec2 e=vec2(.0015,0.);
  vec3 n=normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));
  vec3 L=normalize(vec3(-.5,.75,.6));
  float dif=clamp(dot(n,L)*.5+.5,0.,1.); dif*=dif;
  float ao=clamp(.5+.5*(length(p)-.97)/.05,0.,1.);
  float rim=pow(1.-clamp(dot(n,-rd),0.,1.),3.);
  vec3 deep=vec3(.06,.10,.52), mid=vec3(.20,.34,.98), lift=vec3(.52,.66,1.), crease=vec3(.42,.20,.86);
  vec3 col=mix(deep,mid,smoothstep(.0,.6,dif));
  col=mix(col,lift,smoothstep(.65,1.,dif)*.55);
  col=mix(crease,col,.55+.45*ao);
  col+=vec3(.25,.45,.85)*rim*(.35+S*V*.5);
  gl_FragColor=vec4(col,1.);
}`;

/** [ripple amplitude, band frequency] per state — the source's numbers. */
const TARGET: Record<AiPresenceState, [number, number]> = {
  idle: [0.4, 9],
  thinking: [0.8, 11],
  speaking: [0.9, 13],
};

/**
 * The slow-device ladder: canvas resolution as a share of the device's pixel
 * ratio. Each rung is tried for one verdict before the next; past the last
 * one the orb hands over to CSS. **Two rungs, not three**: a 0.45 rung was
 * tried and its upscaled silhouette came out visibly stair-stepped (the
 * shader's edge is a hard alpha cut), which looked more broken than the CSS
 * sphere does. At 0.7 of the tablet's 1.5x cap the canvas is still ~1:1 with
 * CSS pixels.
 */
const RESOLUTION_STEPS = [1, 0.7];
/** Frames ignored after a start or a rung change — shader compile, first layout. */
const WARMUP_FRAMES = 20;
/** Time one draw in this many. Each timing stalls the GPU once, so not every frame. */
const SAMPLE_EVERY = 12;
/** Timings per verdict; the verdict is their median, so one hiccup cannot decide it. */
const SAMPLES = 6;
/**
 * What one draw of one orb may cost, in ms, measured to completion. Half a
 * 60fps frame: the page's own glass needs the rest. Measured 2026-09-24 on
 * the laptop's Radeon 780M: 0.8–1.1ms for the header and empty-chat orbs,
 * 6.7ms for the largest (dock mode at tablet size, a 518px canvas) — inside
 * it, but not by much, so a phone-class GPU should expect to step down.
 */
const BUDGET_MS = 8;
/** Frame intervals are clamped to this for the animation, so a pause resumes smoothly. */
const MAX_STEP_S = 0.05;

/**
 * Whether this browser will give a WebGL context at all. Asked once per page
 * load on a throwaway canvas whose context is released at once — browsers cap
 * live contexts at around sixteen, and a probe per mounted orb would spend them.
 */
let webglProbe: boolean | null = null;
function canUseWebGL(): boolean {
  if (webglProbe !== null) return webglProbe;
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    webglProbe = gl !== null;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    webglProbe = false;
  }
  return webglProbe;
}

export function AiPresence({
  state = 'idle',
  size = 160,
  level,
  paused = false,
  dim = false,
  decorative = false,
  style,
}: AiPresenceProps) {
  const reduce = useMedia('(prefers-reduced-motion: reduce)');
  /* A coarse pointer is the tablet: its GPU is a phone's, so the canvas is
     never drawn above 1.5x there, however dense the screen. */
  const coarse = useMedia('(pointer: coarse)');
  const [mode, setMode] = useState<'gl' | 'css'>(() => (canUseWebGL() ? 'gl' : 'css'));

  const canvasRef = useRef<HTMLCanvasElement>(null);
  /* What the running loop reads each frame. Written after render, never
     during it, and read only inside the loop. */
  const live = useRef({ state, level, halted: paused || dim });
  /** Set by the effect below: wakes the loop when the orb may draw again. */
  const wake = useRef<() => void>(() => {});

  useEffect(() => {
    live.current = { state, level, halted: paused || dim };
    wake.current();
  }, [state, level, paused, dim]);

  useEffect(() => {
    if (mode !== 'gl') return undefined;
    const cv = canvasRef.current;
    if (cv === null) return undefined;
    const toCss = () => setMode('css');

    const gl = cv.getContext('webgl', { premultipliedAlpha: false, antialias: true, alpha: true });
    if (gl === null) {
      queueMicrotask(toCss);
      return undefined;
    }
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (s === null) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };
    const program = gl.createProgram();
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (program === null || vs === null || fs === null) {
      queueMicrotask(toCss);
      return undefined;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      queueMicrotask(toCss);
      return undefined;
    }
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const u = (name: string) => gl.getUniformLocation(program, name);
    const uR = u('R'), uT = u('T'), uA = u('A'), uF = u('F'), uS = u('S'), uV = u('V');
    /* The screenshot harness: one settled frame, never timed, then stop, as
       reduced motion does — a loop redrawing that frame ~560 times a shot
       timed out `tablet/dock-speaking` in four runs of five. Always false in
       production. */
    const pinned = import.meta.env.DEV && devStillPresence();

    /* Android takes contexts back under memory pressure. The CSS sphere is
       the answer; trying to restore would flicker between the two. */
    const onLost = (event: Event) => {
      event.preventDefault();
      toCss();
    };
    cv.addEventListener('webglcontextlost', onLost);

    let raf = 0;
    let running = false;
    let onScreen = true;
    let last = -1;
    let clock = 0, amp = TARGET.idle[0], freq = TARGET.idle[1], sp = 0, vl = 0;
    let rung = 0, frames = 0;
    let costs: number[] = [];
    const pixel = new Uint8Array(4);

    /* Returns what the draw cost, to completion, when asked to time it. */
    const draw = (now: number, dt: number, timed: boolean): number => {
      const dpr = Math.min(coarse ? 1.5 : 2, window.devicePixelRatio || 1) * RESOLUTION_STEPS[rung];
      const px = Math.max(1, Math.round(cv.clientWidth * dpr));
      if (cv.width !== px) {
        cv.width = px;
        cv.height = px;
        gl.viewport(0, 0, px, px);
      }
      const { state: st, level: lv } = live.current;
      const tg = TARGET[st];
      const speaking = st === 'speaking';
      if (pinned) {
        /* Where the easing below comes to rest, the synthesised voice at its
           mean, and `clock` left at zero: the frame a paused orb draws. */
        amp = tg[0];
        freq = tg[1];
        sp = speaking ? 1 : 0;
        vl = speaking ? (lv ?? 0.5) : 0;
      } else {
        const tv = speaking ? (lv ?? 0.5 + 0.5 * Math.sin(now / 140) * Math.sin(now / 370)) : 0;
        const k = 1 - Math.exp(-dt * 2.5); // ease between states, never snap
        amp += (tg[0] - amp) * k;
        freq += (tg[1] - freq) * k;
        sp += ((speaking ? 1 : 0) - sp) * k;
        vl += (tv - vl) * (1 - Math.exp(-dt * 14)); // the voice follows fast, but smoothed
        clock += dt * (st === 'thinking' ? 1.35 : speaking ? 1.6 : 0.8);
      }
      gl.uniform2f(uR, cv.width, cv.height);
      gl.uniform1f(uT, reduce ? 2 : clock);
      gl.uniform1f(uA, amp);
      gl.uniform1f(uF, freq);
      gl.uniform1f(uS, sp);
      gl.uniform1f(uV, vl);
      const t0 = timed ? performance.now() : 0;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!timed) return 0;
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return performance.now() - t0;
    };

    /* The watchdog. Returns false when the orb has handed over to CSS. */
    const judge = (cost: number): boolean => {
      costs.push(cost);
      if (costs.length < SAMPLES) return true;
      const median = [...costs].sort((a, b) => a - b)[Math.floor(SAMPLES / 2)];
      costs = [];
      /* Left on the canvas for whoever opens DevTools on the tablet. */
      cv.dataset.costMs = median.toFixed(1);
      if (median <= BUDGET_MS) return true;
      if (rung < RESOLUTION_STEPS.length - 1) {
        rung += 1;
        frames = 0; // a fresh warm-up at the new size
        cv.dataset.scale = String(RESOLUTION_STEPS[rung]);
        return true;
      }
      toCss();
      return false;
    };

    const frame = (now: number) => {
      raf = 0;
      const gap = last < 0 ? 0 : now - last;
      last = now;
      frames += 1;
      const timed = !reduce && !pinned && frames > WARMUP_FRAMES && frames % SAMPLE_EVERY === 0;
      const cost = draw(now, Math.min(MAX_STEP_S, gap / 1000), timed);
      if (timed && !judge(cost)) {
        running = false;
        return;
      }
      if (reduce || pinned || live.current.halted || !onScreen) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running) return;
      if (!onScreen) return;
      /* A halted orb still gets one frame, so it is never an empty canvas. */
      running = true;
      last = -1;
      raf = requestAnimationFrame(frame);
    };
    wake.current = start;

    const io = new IntersectionObserver((entries) => {
      onScreen = entries[entries.length - 1]?.isIntersecting ?? true;
      if (onScreen) start();
    });
    io.observe(cv);
    start();

    return () => {
      wake.current = () => {};
      io.disconnect();
      cancelAnimationFrame(raf);
      cv.removeEventListener('webglcontextlost', onLost);
      gl.deleteProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      /* Give the context back only when the canvas has really left the page.
         A canvas has ONE context for life: `getContext` on it again returns
         the same object, lost for good — so releasing it on a cleanup that is
         followed by a re-run (React's development double-mount, or `reduce` /
         `coarse` changing) hands the next run a dead context, and every orb
         falls back to CSS on a machine that draws the shader perfectly well.
         That is exactly what the first cut of this file did. On a real unmount
         React has already removed the node by the time this runs. */
      if (!cv.isConnected) gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [mode, reduce, coarse]);

  const box = typeof size === 'number' ? `${size}px` : size;
  /* The fallback's band layer turns once per this many ms. */
  const turn = state === 'thinking' ? 6000 : state === 'speaking' ? 9000 : 26000;
  const still = reduce || dim;

  return (
    <div
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : `Atlas, ${state}`}
      aria-hidden={decorative ? true : undefined}
      /* Which of the two it is drawing. For a test, or DevTools on the tablet:
         there is no other way to tell from outside that it fell back. */
      data-presence={mode}
      style={{
        position: 'relative', width: box, height: box, flex: '0 0 auto',
        filter: dim ? 'grayscale(1) brightness(0.55)' : undefined,
        transition: 'filter var(--dur-slow) var(--ease-glass)',
        ...style,
      }}
    >
      {/* Soft cast light on the ground, not a glow — the source's own. */}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute', left: '15%', right: '15%', bottom: '-6%', height: '14%', borderRadius: '50%',
          backgroundImage: 'radial-gradient(closest-side, oklch(0.55 0.18 265 / 0.28), transparent)',
          filter: 'blur(6px)',
        }}
      />
      {mode === 'gl' ? (
        <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      ) : (
        /* THE FALLBACK. The shader's sphere sits in the middle ~62% of its
           square (camera at 3.4, field 1.45/2.6), so this disc takes the same
           share, lit from the same upper left, with the same violet creases
           toward the lower right. */
        <span
          aria-hidden="true"
          style={{
            position: 'absolute', inset: '19%', borderRadius: '50%', overflow: 'hidden',
            backgroundImage:
              'radial-gradient(circle at 74% 80%, oklch(0.36 0.2 295 / 0.55), transparent 42%),' +
              ' radial-gradient(circle at 34% 28%, oklch(0.80 0.10 262) 0%, oklch(0.56 0.21 265) 34%, oklch(0.36 0.19 268) 68%, oklch(0.30 0.17 285) 100%)',
            boxShadow: 'inset 0 0 0 1px oklch(0.75 0.12 262 / 0.35)',
          }}
        >
          {/* The ripple, drawn: faint bands across the face, turning slowly,
              faster while it thinks. What makes it read as alive rather than
              as a sticker of the orb. */}
          <span
            style={{
              position: 'absolute', inset: '-40%',
              backgroundImage:
                'repeating-linear-gradient(115deg, oklch(1 0 0 / 0) 0 9%, oklch(0.85 0.08 262 / 0.16) 13%, oklch(1 0 0 / 0) 17%)',
              animation: still ? 'none' : `ag-spin ${turn}ms linear infinite`,
            }}
          />
          {state !== 'idle' && !still && (
            <span
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                backgroundImage: 'radial-gradient(circle, transparent 58%, oklch(0.78 0.12 255 / 0.5) 100%)',
                animation: 'var(--kf-pulse) 1400ms var(--ease-in-out) infinite',
              }}
            />
          )}
        </span>
      )}
    </div>
  );
}
