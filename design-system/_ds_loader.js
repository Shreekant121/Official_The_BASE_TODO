/* Aurora Glass — card bootstrap.
   Cards prefer the compiled design-system bundle on window. When it is
   not present (authoring, or opening a card straight off disk) this
   falls back to fetching the component sources and transforming them
   with Babel standalone, so every card renders either way.

   Usage inside a card:
     AG_LOAD(['../material/GlassSurface.jsx', '../actions/Button.jsx'])
       .then(function (AG) { ...mount... });
   Paths must be listed in dependency order. */
(function () {
  var SKIP = { React: 1, ReactDOM: 1, Babel: 1, AG_LOAD: 1 };

  function findBundle(probe) {
    for (var i = 0, keys = Object.keys(window); i < keys.length; i++) {
      var k = keys[i];
      if (SKIP[k]) continue;
      try {
        var v = window[k];
        if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
        if (v.window === v || typeof v.postMessage === 'function') continue; // frames
        var ok = true;
        for (var j = 0; j < probe.length; j++) {
          if (typeof v[probe[j]] !== 'function') { ok = false; break; }
        }
        if (ok) return v;
      } catch (e) { continue; }
    }
    return null;
  }

  async function fromSource(paths) {
    var ns = {};
    for (var i = 0; i < paths.length; i++) {
      var src = await (await fetch(paths[i])).text();
      var names = [];
      src = src.replace(/export\s+(function|const|class)\s+([A-Za-z0-9_$]+)/g, function (m, kind, name) {
        names.push(name);
        return kind + ' ' + name;
      });
      src = src.replace(/^[ \t]*import[^;\n]*;?[ \t]*$/gm, '');
      var code = Babel.transform(src, {
        presets: [['react', { runtime: 'classic' }]],
      }).code.replace(/^[ \t]*import[^;\n]*;?[ \t]*$/gm, '');
      var inject = Object.keys(ns).map(function (k) { return 'var ' + k + ' = __AG.' + k + ';'; }).join('\n');
      var body = inject + '\n' + code + '\nreturn {' + names.map(function (n) { return n + ':' + n; }).join(',') + '};';
      Object.assign(ns, new Function('React', '__AG', body)(window.React, ns));
    }
    return ns;
  }

  /* Cards put their JSX in <script type="text/ag-jsx"> rather than
     text/babel: Babel standalone defaults the react preset to the
     automatic JSX runtime, which injects a bare "react/jsx-runtime"
     import that a classic script cannot execute. This transforms with
     the classic runtime and runs it. */
  function runInline() {
    var nodes = document.querySelectorAll('script[type="text/ag-jsx"]');
    for (var i = 0; i < nodes.length; i++) {
      try {
        var out = Babel.transform(nodes[i].textContent, {
          presets: [['react', { runtime: 'classic' }]],
        }).code;
        (0, eval)(out);
      } catch (e) {
        console.error('[ag] card script failed', e);
      }
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runInline);
  } else {
    runInline();
  }

  window.AG_LOAD = function (paths, probe) {
    var names = (probe && probe.length) ? probe : paths.map(function (p) {
      return p.split('/').pop().replace(/\.jsx?$/, '');
    });
    var found = findBundle(names);
    return found ? Promise.resolve(found) : fromSource(paths);
  };
})();

/* Liquid-glass lens. Injects one SVG filter whose displacement map bends
   the backdrop strongest at the edges, then — on Chromium only, the one
   engine that honours SVG filters in backdrop-filter — points every
   --glass-bd-* token at it. Safari/Firefox keep the plain blur. */
(function () {
  function lens() {
    if (document.getElementById('ag-lens')) return;
    var N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    var ctx = cv.getContext('2d'), img = ctx.createImageData(N, N);
    function ss(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
    for (var y = 0; y < N; y++) for (var x = 0; x < N; x++) {
      var nx = x / (N - 1) * 2 - 1, ny = y / (N - 1) * 2 - 1, i = (y * N + x) * 4;
      var ex = Math.sign(nx) * (ss(0.45, 1, Math.abs(nx)) * 0.85 + Math.abs(nx) * 0.15), ey = Math.sign(ny) * (ss(0.45, 1, Math.abs(ny)) * 0.85 + Math.abs(ny) * 0.15);
      img.data[i] = 128 - ex * 127;
      img.data[i + 1] = 128 - ey * 127;
      img.data[i + 2] = 128; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    var url = cv.toDataURL();
    var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.innerHTML = '<filter id="ag-lens" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB"><feImage href="' + url + '" x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="m"/><feDisplacementMap in="SourceGraphic" in2="m" scale="0.075" xChannelSelector="R" yChannelSelector="G" result="dr"/><feColorMatrix in="dr" type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" result="r"/><feDisplacementMap in="SourceGraphic" in2="m" scale="0.065" xChannelSelector="R" yChannelSelector="G" result="dg"/><feColorMatrix in="dg" type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 0 0 0 0 0 0 1 0" result="g"/><feDisplacementMap in="SourceGraphic" in2="m" scale="0.055" xChannelSelector="R" yChannelSelector="G" result="db"/><feColorMatrix in="db" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 1 0 0 0 0 0 1 0" result="b"/><feBlend in="r" in2="g" mode="screen" result="rg"/><feBlend in="rg" in2="b" mode="screen"/></filter>';
    document.body.appendChild(svg);
    var chromium = !!window.chrome && /Chrom/.test(navigator.userAgent) && !/Firefox/.test(navigator.userAgent);
    if (chromium) {
      var r = document.documentElement.style, t = 'saturate(var(--glass-sat)) brightness(var(--glass-bright))';
      ['xs', 'sm', 'md', 'lg', 'xl'].forEach(function (k) {
        r.setProperty('--glass-bd-' + k, 'url(#ag-lens) blur(var(--glass-blur-' + k + ')) ' + t);
      });
      ['sm', 'md', 'lg'].forEach(function (k) { r.setProperty('--glass-bd-' + k + '-refract', 'url(#ag-lens) blur(var(--glass-blur-' + k + ')) ' + t); });
    }
  }
  if (document.body) lens(); else document.addEventListener('DOMContentLoaded', lens);
})();
