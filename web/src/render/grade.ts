import type { VideoFilters } from '../types';
import { HSL_BANDS } from '../lib/videoFx';

/**
 * Colour-grade pass: light, colour, levels, curve, HSL, colour wheels, fade, grain and sharpen in one WebGL shader.
 * CSS filters cannot do any of this, and the same pass serves preview, tiles and export.
 */

const SCALARS = [
  'exposure', 'temperature', 'tint', 'highlights', 'shadows', 'whites', 'blacks', 'vibrance', 'fade', 'sharpen', 'grain', 'clarity',
  'lvInBlack', 'lvInWhite', 'lvGamma', 'lvOutBlack', 'lvOutWhite', 'gainR', 'gainG', 'gainB',
  'curveShadows', 'curveDarks', 'curveLights', 'curveHighlights',
  'shadowHue', 'shadowAmt', 'midHue', 'midAmt', 'highHue', 'highAmt',
] as const;

/** Band centres in degrees. */
const CENTRES = [0, 30, 60, 120, 180, 240, 275, 320];

const FRAG = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_tex;
uniform vec2 u_px;
uniform float u_seed;
${SCALARS.map((k) => `uniform float u_${k};`).join('\n')}
uniform vec3 u_hsl[8];
uniform float u_hslOn;
uniform float u_centres[8];

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 hueRgb(float h) {
  h = fract(h / 360.0) * 6.0;
  return clamp(vec3(abs(h - 3.0) - 1.0, 2.0 - abs(h - 2.0), 2.0 - abs(h - 4.0)), 0.0, 1.0);
}
vec3 rgb2hsl(vec3 c) {
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float l = (mx + mn) * 0.5, d = mx - mn, h = 0.0, s = 0.0;
  if (d > 1e-5) {
    s = d / (1.0 - abs(2.0 * l - 1.0) + 1e-5);
    if (mx == c.r) h = mod((c.g - c.b) / d, 6.0);
    else if (mx == c.g) h = (c.b - c.r) / d + 2.0;
    else h = (c.r - c.g) / d + 4.0;
    h *= 60.0;
  }
  return vec3(h, clamp(s, 0.0, 1.0), l);
}
vec3 hsl2rgb(vec3 hsl) {
  vec3 base = hueRgb(hsl.x);
  float c = (1.0 - abs(2.0 * hsl.z - 1.0)) * hsl.y;
  return (base - 0.5) * c + hsl.z;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }

void main() {
  vec4 t = texture2D(u_tex, v_uv);
  vec3 c = t.rgb;

  if (u_sharpen > 0.0 || u_clarity != 0.0) {
    vec3 n = texture2D(u_tex, v_uv + vec2(u_px.x, 0.0)).rgb + texture2D(u_tex, v_uv - vec2(u_px.x, 0.0)).rgb
           + texture2D(u_tex, v_uv + vec2(0.0, u_px.y)).rgb + texture2D(u_tex, v_uv - vec2(0.0, u_px.y)).rgb;
    c += (c - n * 0.25) * (u_sharpen / 100.0) * 2.0;
    if (u_clarity != 0.0) {
      vec2 w = u_px * 6.0;
      vec3 b = (texture2D(u_tex, v_uv + vec2(w.x, 0.0)).rgb + texture2D(u_tex, v_uv - vec2(w.x, 0.0)).rgb
              + texture2D(u_tex, v_uv + vec2(0.0, w.y)).rgb + texture2D(u_tex, v_uv - vec2(0.0, w.y)).rgb) * 0.25;
      float mid = 1.0 - abs(luma(c) * 2.0 - 1.0);
      c += (c - b) * (u_clarity / 100.0) * 1.6 * mid;
    }
  }

  c *= exp2(u_exposure / 50.0);
  c.r += u_temperature * 0.0012; c.b -= u_temperature * 0.0012;
  c.r *= 1.0 + u_temperature * 0.0016; c.b *= 1.0 - u_temperature * 0.0016;
  c.g *= 1.0 - u_tint * 0.0015; c.r *= 1.0 + u_tint * 0.0007; c.b *= 1.0 + u_tint * 0.0007;
  c *= vec3(1.0 + u_gainR * 0.005, 1.0 + u_gainG * 0.005, 1.0 + u_gainB * 0.005);

  // Levels
  float ib = u_lvInBlack / 255.0, iw = max(u_lvInWhite / 255.0, ib + 0.004);
  c = clamp((c - ib) / (iw - ib), 0.0, 1.0);
  c = pow(c, vec3(100.0 / max(u_lvGamma, 5.0)));
  c = mix(vec3(u_lvOutBlack / 255.0), vec3(u_lvOutWhite / 255.0), c);

  // Tone
  float l = clamp(luma(c), 0.0, 1.0);
  float shW = pow(1.0 - l, 2.0), hiW = l * l;
  c += u_shadows * 0.0035 * shW + u_highlights * 0.0030 * hiW;
  c *= 1.0 + u_whites * 0.003 * smoothstep(0.5, 1.0, l);
  c += u_blacks * 0.0016 * (1.0 - smoothstep(0.0, 0.5, l));
  float zs = 1.0 - smoothstep(0.0, 0.3, l), zd = smoothstep(0.0, 0.3, l) * (1.0 - smoothstep(0.3, 0.6, l));
  float zl = smoothstep(0.3, 0.6, l) * (1.0 - smoothstep(0.6, 0.9, l)), zh = smoothstep(0.6, 0.9, l);
  c += (u_curveShadows * zs + u_curveDarks * zd + u_curveLights * zl + u_curveHighlights * zh) * 0.002;

  // Vibrance
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = mx - mn;
  c = mix(vec3(luma(c)), c, 1.0 + u_vibrance * 0.01 * (1.0 - sat));

  // HSL bands
  if (u_hslOn > 0.5) {
    vec3 hsl = rgb2hsl(clamp(c, 0.0, 1.0));
    float dh = 0.0, ds = 0.0, dl = 0.0;
    for (int i = 0; i < 8; i++) {
      float d = abs(hsl.x - u_centres[i]);
      d = min(d, 360.0 - d);
      float w = max(0.0, 1.0 - d / 50.0) * smoothstep(0.02, 0.2, hsl.y);
      dh += w * u_hsl[i].x; ds += w * u_hsl[i].y; dl += w * u_hsl[i].z;
    }
    hsl.x = mod(hsl.x + dh * 0.3 + 360.0, 360.0);
    hsl.y = clamp(hsl.y * (1.0 + ds * 0.01), 0.0, 1.0);
    hsl.z = clamp(hsl.z + dl * 0.0025, 0.0, 1.0);
    c = hsl2rgb(hsl);
  }

  // Colour wheels
  l = clamp(luma(c), 0.0, 1.0);
  vec3 ts = hueRgb(u_shadowHue), tm = hueRgb(u_midHue), th = hueRgb(u_highHue);
  ts -= luma(ts); tm -= luma(tm); th -= luma(th);
  c += ts * (u_shadowAmt * 0.004) * pow(1.0 - l, 2.0)
     + tm * (u_midAmt * 0.004) * (4.0 * l * (1.0 - l))
     + th * (u_highAmt * 0.004) * l * l;

  // Fade lifts the blacks
  float f = u_fade * 0.01;
  c = c * (1.0 - f * 0.25) + f * 0.25 * 0.92;

  if (u_grain > 0.0) {
    float n = hash(v_uv / u_px + u_seed) - 0.5;
    c += n * (u_grain * 0.003) * (1.0 - abs(luma(c) - 0.5));
  }

  c = clamp(c, 0.0, 1.0);
  gl_FragColor = vec4(c * t.a, t.a);
}`;

const VERT = `
attribute vec2 p; varying vec2 v_uv;
void main() { v_uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

interface GL { c: OffscreenCanvas; gl: WebGLRenderingContext; tex: WebGLTexture; loc: Record<string, WebGLUniformLocation | null> }
let ctxGl: GL | null | undefined;

function init(): GL | null {
  if (ctxGl !== undefined) return ctxGl;
  ctxGl = null;
  try {
    if (typeof OffscreenCanvas === 'undefined') return null;
    const c = new OffscreenCanvas(2, 2);
    const gl = c.getContext('webgl', { premultipliedAlpha: true, preserveDrawingBuffer: true, alpha: true }) as WebGLRenderingContext | null;
    if (!gl) return null;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(p);
    gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    const loc: GL['loc'] = {};
    for (const n of ['u_tex', 'u_px', 'u_seed', 'u_hsl', 'u_hslOn', 'u_centres', ...SCALARS.map((k) => `u_${k}`)]) loc[n] = gl.getUniformLocation(prog, n);
    gl.uniform1i(loc.u_tex, 0);
    gl.uniform1fv(loc.u_centres, new Float32Array(CENTRES));
    ctxGl = { c, gl, tex, loc };
  } catch (e) {
    console.warn('Colour grade unavailable:', e);
    ctxGl = null;
  }
  return ctxGl;
}

/** Re-draw `src` through the grade onto `out`, replacing what `out` holds. Returns false when WebGL is unavailable. */
export function drawGraded(out: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D, src: CanvasImageSource & { width: number; height: number }, f: VideoFilters, seed = 0): boolean {
  const g = init();
  if (!g) return false;
  const { gl, c, tex, loc } = g;
  const W = src.width, H = src.height;
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  gl.viewport(0, 0, W, H);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src as TexImageSource);
  gl.uniform2f(loc.u_px, 1 / W, 1 / H);
  gl.uniform1f(loc.u_seed, (seed * 37.7) % 100);
  for (const k of SCALARS) gl.uniform1f(loc[`u_${k}`], f[k]);
  const hsl: number[] = [];
  let on = false;
  for (const b of HSL_BANDS) {
    const h = f[`hue${b}` as keyof VideoFilters], s = f[`sat${b}` as keyof VideoFilters], l = f[`lum${b}` as keyof VideoFilters];
    if (h || s || l) on = true;
    hsl.push(h, s, l);
  }
  gl.uniform3fv(loc.u_hsl, new Float32Array(hsl));
  gl.uniform1f(loc.u_hslOn, on ? 1 : 0);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  out.save();
  out.setTransform(1, 0, 0, 1, 0, 0);
  out.globalAlpha = 1;
  out.globalCompositeOperation = 'source-over';
  out.filter = 'none';
  out.drawImage(c, 0, 0);
  out.restore();
  return true;
}
