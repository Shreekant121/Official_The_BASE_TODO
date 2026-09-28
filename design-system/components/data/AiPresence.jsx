import React from 'react';

/* AiPresence — Atlas's character mark. A matte blue sphere that turns
   slowly while bands of ripple travel across its surface. Not glass:
   soft diffuse light, violet in the creases, a faint cool rim so it
   sits on the dark ground. WebGL, one quad, raymarched.

   state   "idle" | "thinking" | "speaking"   — ripple energy
   size    px (default 160)
   level   0–1, optional live voice level while speaking             */

const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
const FRAG = `
precision highp float;
uniform vec2 R; uniform float T; uniform float A; uniform float F; uniform float S; uniform float V;
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0.,-s,0.,1.,0.,s,0.,c);}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1.,0.,0.,0.,c,s,0.,-s,c);}
float disp(vec3 q){
  vec3 ax=normalize(vec3(.35,1.,.2));
  float h=dot(q,ax);
  float env=smoothstep(-.9,.2,sin(T*.55+h*1.3));             // bands come and go
  float band=sin(h*F-T*2.2)*env;
  float wob=sin(q.x*2.3+T*.7)*sin(q.z*2.1-T*.6)*.5;           // slow lumpy body
  return A*band*.075+wob*.045;
}
float map(vec3 p){
  vec3 q=rotY(T*.35)*rotX(sin(T*.23)*.35)*p;
  // speaking: rings radiate from the face toward the viewer, and the body breathes with the voice
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
  float dif=clamp(dot(n,L)*.5+.5,0.,1.); dif*=dif;             // wrapped, matte
  float ao=clamp(.5+.5*(length(p)-.97)/.05,0.,1.);              // creases darker
  float rim=pow(1.-clamp(dot(n,-rd),0.,1.),3.);
  vec3 deep=vec3(.06,.10,.52), mid=vec3(.20,.34,.98), lift=vec3(.52,.66,1.), crease=vec3(.42,.20,.86);
  vec3 col=mix(deep,mid,smoothstep(.0,.6,dif));
  col=mix(col,lift,smoothstep(.65,1.,dif)*.55);
  col=mix(crease,col,.55+.45*ao);
  col+=vec3(.25,.45,.85)*rim*(.35+S*V*.5);
  gl_FragColor=vec4(col,1.);
}`;

const TARGET = { idle: [0.4, 9], thinking: [0.8, 11], speaking: [0.9, 13] };

export function AiPresence({ state = 'idle', size = 160, level, style, ...rest }) {
  const ref = React.useRef(null);
  const live = React.useRef({ state, level });
  live.current = { state, level };
  const [fallback, setFallback] = React.useState(false);

  React.useEffect(() => {
    const cv = ref.current;
    const gl = cv && cv.getContext('webgl', { premultipliedAlpha: false, antialias: true, alpha: true });
    if (!gl) { setFallback(true); return undefined; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) { setFallback(true); return undefined; }
    gl.useProgram(pr);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uR = gl.getUniformLocation(pr, 'R'), uT = gl.getUniformLocation(pr, 'T'), uA = gl.getUniformLocation(pr, 'A'), uF = gl.getUniformLocation(pr, 'F'), uS = gl.getUniformLocation(pr, 'S'), uV = gl.getUniformLocation(pr, 'V');
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf, last = performance.now(), clock = 0, amp = 0.4, freq = 9, sp = 0, vl = 0;
    const frame = (now) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const px = Math.round(cv.clientWidth * dpr);
      if (cv.width !== px) { cv.width = px; cv.height = px; gl.viewport(0, 0, px, px); }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const { state: st, level: lv } = live.current;
      const tg = TARGET[st] || TARGET.idle;
      const speaking = st === 'speaking';
      const ta = tg[0];
      const tv = speaking ? (lv != null ? lv : 0.5 + 0.5 * Math.sin(now / 140) * Math.sin(now / 370)) : 0;
      const k = 1 - Math.exp(-dt * 2.5);                      // ease between states, never snap
      amp += (ta - amp) * k; freq += (tg[1] - freq) * k;
      sp += ((speaking ? 1 : 0) - sp) * k;
      vl += (tv - vl) * (1 - Math.exp(-dt * 14));             // voice follows fast, but smoothed
      clock += dt * (st === 'thinking' ? 1.35 : speaking ? 1.6 : 0.8);
      gl.uniform2f(uR, cv.width, cv.height);
      gl.uniform1f(uT, reduce ? 2 : clock);
      gl.uniform1f(uA, amp); gl.uniform1f(uF, freq); gl.uniform1f(uS, sp); gl.uniform1f(uV, vl);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div role="img" aria-label={'Atlas, ' + state} style={Object.assign({ position: 'relative', width: size, height: size }, style)} {...rest}>
      {/* soft cast light on the ground, not a glow */}
      <span aria-hidden="true" style={{
        position: 'absolute', left: '15%', right: '15%', bottom: '-6%', height: '14%', borderRadius: '50%',
        background: 'radial-gradient(closest-side, oklch(0.55 0.18 265 / 0.28), transparent)', filter: 'blur(6px)',
      }} />
      {fallback
        ? <span style={{ position: 'absolute', inset: '6%', borderRadius: '50%', background: 'radial-gradient(circle at 35% 30%, oklch(0.72 0.14 262), oklch(0.45 0.22 266) 60%, oklch(0.28 0.16 270))' }} />
        : <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />}
    </div>
  );
}
