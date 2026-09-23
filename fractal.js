// Fractal Explorer — GPU (WebGL) Edition
// All fractal math runs per-pixel on the GPU via a fragment shader,
// which is what makes real-time smooth zoom/pan possible.

const canvas = document.getElementById("glcanvas");
const gl = canvas.getContext("webgl", { preserveDrawingBuffer: true }) ||
           canvas.getContext("experimental-webgl", { preserveDrawingBuffer: true });

if (!gl) {
  document.body.innerHTML = "<p style='color:#fff;padding:40px;font-family:sans-serif'>" +
    "Your browser doesn't support WebGL, which this fractal renderer needs. " +
    "Try a recent Chrome, Firefox, or Edge.</p>";
  throw new Error("WebGL not supported");
}

const VERTEX_SRC = `
  attribute vec2 a_pos;
  void main() {
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAGMENT_SRC = `
  precision highp float;

  uniform vec2 u_resolution;
  uniform vec2 u_center;
  uniform float u_scale;
  uniform int u_maxIter;
  uniform int u_type;       // 0 mandelbrot, 1 julia, 2 burning ship, 3 tricorn
  uniform vec2 u_juliaC;
  uniform int u_palette;
  uniform float u_time;     // for color cycling
  uniform float u_rotation; // camera rotation, radians
  uniform float u_vignette; // 0..1 extra darkening at edges (autopilot flourish)

  vec3 palette(float t, int p) {
    t = clamp(t, 0.0, 1.0);
    if (p == 0) {
      // Twilight
      float r = 0.16 + 0.7 * sin(3.14159 * t + 0.5);
      float g = 0.08 + 0.6 * t;
      float b = 0.35 + 0.55 * cos(3.14159 * t * 0.7);
      return clamp(vec3(r, g, b), 0.0, 1.0);
    } else if (p == 1) {
      // Fire
      return clamp(vec3(min(1.0, t * 2.0), max(0.0, t * 2.0 - 0.5) * 1.6, 0.25 * t), 0.0, 1.0);
    } else if (p == 2) {
      // Ocean
      return clamp(vec3(0.08 * t, 0.47 * t + 0.15, 0.7 * t + 0.27), 0.0, 1.0);
    } else if (p == 3) {
      // Rainbow (HSV)
      float h = t * 6.0;
      float c = 1.0;
      float x = 1.0 - abs(mod(h, 2.0) - 1.0);
      vec3 col;
      if (h < 1.0) col = vec3(c, x, 0.0);
      else if (h < 2.0) col = vec3(x, c, 0.0);
      else if (h < 3.0) col = vec3(0.0, c, x);
      else if (h < 4.0) col = vec3(0.0, x, c);
      else if (h < 5.0) col = vec3(x, 0.0, c);
      else col = vec3(c, 0.0, x);
      return col;
    } else if (p == 4) {
      // Neon (magenta/cyan glow)
      float r = 0.5 + 0.5 * sin(6.2832 * t + 0.0);
      float g = 0.5 + 0.5 * sin(6.2832 * t + 2.1);
      float b = 0.5 + 0.5 * sin(6.2832 * t + 4.2);
      return vec3(r, g, b);
    } else {
      // Monochrome
      return vec3(t);
    }
  }

  vec2 rotate(vec2 v, float a) {
    float c = cos(a), s = sin(a);
    return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / u_resolution.y;
    uv = rotate(uv, u_rotation);
    vec2 c0 = u_center + uv * u_scale;

    vec2 z;
    vec2 c;
    if (u_type == 1) {
      // Julia: z starts at the pixel, c is fixed
      z = c0;
      c = u_juliaC;
    } else {
      z = vec2(0.0);
      c = c0;
    }

    float iter = 0.0;
    const int MAX_STEPS = 1500;
    bool escaped = false;
    for (int i = 0; i < MAX_STEPS; i++) {
      if (i >= u_maxIter) break;
      vec2 zAbs = z;
      if (u_type == 2) {
        // Burning Ship uses abs(x), abs(y) before squaring
        zAbs = abs(z);
      }
      float x2 = zAbs.x * zAbs.x - zAbs.y * zAbs.y;
      float y2;
      if (u_type == 3) {
        // Tricorn: conjugate iteration z -> conj(z)^2 + c
        y2 = -2.0 * zAbs.x * zAbs.y;
      } else {
        y2 = 2.0 * zAbs.x * zAbs.y;
      }
      z = vec2(x2, y2) + c;

      float mag2 = dot(z, z);
      if (mag2 > 4.0) {
        // smooth iteration count
        float logZn = log(mag2) * 0.5;
        float nu = log(logZn / log(2.0)) / log(2.0);
        iter = float(i) + 1.0 - nu;
        escaped = true;
        break;
      }
    }

    if (!escaped) {
      gl_FragColor = vec4(0.01, 0.01, 0.03, 1.0);
      return;
    }

    float t = iter / float(u_maxIter);
    t = fract(t * 2.4 + u_time);
    vec3 col = palette(t, u_palette);

    if (u_vignette > 0.0) {
      float vig = 1.0 - u_vignette * smoothstep(0.4, 1.3, length(uv));
      col *= vig;
    }

    gl_FragColor = vec4(col, 1.0);
  }
`;

function compileShader(src, type) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(shader));
    throw new Error("Shader compile failed");
  }
  return shader;
}

const program = gl.createProgram();
gl.attachShader(program, compileShader(VERTEX_SRC, gl.VERTEX_SHADER));
gl.attachShader(program, compileShader(FRAGMENT_SRC, gl.FRAGMENT_SHADER));
gl.linkProgram(program);
if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
  console.error(gl.getProgramInfoLog(program));
  throw new Error("Program link failed");
}
gl.useProgram(program);

// Fullscreen quad
const posBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
  -1, -1, 1, -1, -1, 1,
  -1, 1, 1, -1, 1, 1,
]), gl.STATIC_DRAW);
const posLoc = gl.getAttribLocation(program, "a_pos");
gl.enableVertexAttribArray(posLoc);
gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

const uniforms = {};
["u_resolution", "u_center", "u_scale", "u_maxIter", "u_type", "u_juliaC", "u_palette",
 "u_time", "u_rotation", "u_vignette"]
  .forEach((name) => (uniforms[name] = gl.getUniformLocation(program, name)));

// ---- App state ----
const state = {
  type: 0,
  centerRe: -0.5,
  centerIm: 0,
  scale: 3.0, // vertical extent of the view in complex-plane units
  maxIter: 300,
  juliaRe: -0.7,
  juliaIm: 0.27,
  palette: 0,
  cycleSpeed: 0,
  autopilot: false,
  rotation: 0,
  vignette: 0,
};

let userMaxIter = 300;   // the slider's own value, preserved across autopilot
let userCycleSpeed = 0;  // ditto for color-cycle speed

const typeDefaults = {
  0: { centerRe: -0.5, centerIm: 0, scale: 3.0 },
  1: { centerRe: 0, centerIm: 0, scale: 3.0 },
  2: { centerRe: -0.4, centerIm: -0.5, scale: 3.0 },
  3: { centerRe: 0, centerIm: 0, scale: 3.0 },
};

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(window.innerWidth * dpr);
  const h = Math.floor(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}
window.addEventListener("resize", resize);
resize();

let startTime = performance.now();

function draw() {
  gl.uniform2f(uniforms.u_resolution, canvas.width, canvas.height);
  gl.uniform2f(uniforms.u_center, state.centerRe, state.centerIm);
  gl.uniform1f(uniforms.u_scale, state.scale);
  gl.uniform1i(uniforms.u_maxIter, state.maxIter);
  gl.uniform1i(uniforms.u_type, state.type);
  gl.uniform2f(uniforms.u_juliaC, state.juliaRe, state.juliaIm);
  gl.uniform1i(uniforms.u_palette, state.palette);
  const t = ((performance.now() - startTime) / 1000) * (state.cycleSpeed / 100) * 0.3;
  gl.uniform1f(uniforms.u_time, t);
  gl.uniform1f(uniforms.u_rotation, state.rotation);
  gl.uniform1f(uniforms.u_vignette, state.vignette);
  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// ---- Autopilot: cinematic breathing dive with rotation, per fractal type ----
// Each leg: dive in (with a slow camera rotation and rising detail/color drift),
// hold briefly at max depth, then retreat back out before jumping to the next spot.
const autopilotTargetsByType = {
  0: [ // Mandelbrot — classic deep-zoom landmarks
    { re: -0.743643887037151, im: 0.13182590420533, name: "Seahorse Valley" },
    { re: -0.16070135, im: 1.0375665, name: "Spiral Junction" },
    { re: -1.401155, im: 0, name: "Feigenbaum Point" },
    { re: 0.28693186889504513, im: 0.014286693904085048, name: "Elephant Valley" },
    { re: -0.7746806106269039, im: -0.1374168856037867, name: "Double Spiral" },
  ],
  1: [ // Julia set — orbits within its own bounded region
    { re: 0.1, im: -0.02 },
    { re: -0.55, im: 0.05 },
    { re: 0.35, im: 0.3 },
    { re: -0.2, im: 0.55 },
  ],
  2: [ // Burning Ship — jagged detail lives along its edges
    { re: -1.7580856, im: -0.0253 },
    { re: -1.7396807, im: -0.0288 },
    { re: -1.62917, im: -0.0203 },
  ],
  3: [ // Tricorn
    { re: -0.5, im: 0.5 },
    { re: 0.25, im: 0.45 },
    { re: -1.1, im: 0.2 },
  ],
};
let autopilotIdx = 0;
let autopilotStart = 0;
let autopilotBaseScale = 3.0;
const DIVE_DURATION = 7000;   // ms diving inward
const HOLD_DURATION = 1400;   // ms lingering at depth
const RETREAT_DURATION = 2600; // ms zooming back out before the jump
const LEG_DURATION = DIVE_DURATION + HOLD_DURATION + RETREAT_DURATION;
const ROTATION_SPEED = 0.05; // radians/sec, continuous throughout

function currentAutopilotTargets() {
  return autopilotTargetsByType[state.type] || autopilotTargetsByType[0];
}

function autopilotStep(now) {
  if (!state.autopilot) return;
  const targets = currentAutopilotTargets();
  const elapsed = now - autopilotStart;
  const legPos = elapsed % LEG_DURATION;
  const legIdx = Math.floor(elapsed / LEG_DURATION) % targets.length;
  if (legIdx !== autopilotIdx) autopilotIdx = legIdx;
  const target = targets[autopilotIdx];

  const startScale = autopilotBaseScale;
  const endScale = startScale * 0.00002;

  let depth; // 0 = zoomed out, 1 = zoomed in fully
  if (legPos < DIVE_DURATION) {
    const p = legPos / DIVE_DURATION;
    depth = p * p * (3 - 2 * p); // smoothstep ease
  } else if (legPos < DIVE_DURATION + HOLD_DURATION) {
    depth = 1;
  } else {
    const p = (legPos - DIVE_DURATION - HOLD_DURATION) / RETREAT_DURATION;
    depth = 1 - p * p * (3 - 2 * p);
  }

  state.scale = startScale * Math.pow(endScale / startScale, depth);
  state.centerRe = target.re;
  state.centerIm = target.im;

  // continuous slow rotation for a "flying through space" feel
  state.rotation = (elapsed / 1000) * ROTATION_SPEED;

  // the deeper we dive, the more detail we need to keep it crisp
  state.maxIter = Math.min(1800, Math.round(userMaxIter + depth * 900));

  // color drifts faster at depth, and a vignette breathes in during the dive
  state.cycleSpeed = userCycleSpeed + depth * 55;
  state.vignette = 0.35 * depth;

  syncControlsFromState();
  updateHud(target.name);
}

function syncControlsFromState() {
  maxIterEl.value = state.maxIter;
  iterValEl.textContent = state.maxIter;
  cycleSpeedEl.value = Math.min(100, Math.round(state.cycleSpeed));
  cycleValEl.textContent = cycleSpeedEl.value;
}

function loop() {
  const now = performance.now();
  autopilotStep(now);
  draw();
  requestAnimationFrame(loop);
}

// ---- UI wiring ----
const fractalTypeEl = document.getElementById("fractalType");
const juliaGroupEl = document.getElementById("juliaGroup");
const juliaReEl = document.getElementById("juliaRe");
const juliaImEl = document.getElementById("juliaIm");
const maxIterEl = document.getElementById("maxIter");
const iterValEl = document.getElementById("iterVal");
const paletteEl = document.getElementById("palette");
const cycleSpeedEl = document.getElementById("cycleSpeed");
const cycleValEl = document.getElementById("cycleVal");
const autopilotBtn = document.getElementById("autopilotBtn");
const hudEl = document.getElementById("hud");

function updateHud(landmarkName) {
  const zoom = 3.0 / state.scale;
  const zoomStr = `zoom: ${zoom.toFixed(zoom > 100 ? 0 : 2)}x`;
  const centerStr = `center: (${state.centerRe.toFixed(6)}, ${state.centerIm.toFixed(6)})`;
  hudEl.textContent = landmarkName
    ? `${zoomStr} · ${landmarkName} · ${centerStr}`
    : `${zoomStr} · ${centerStr}`;
}

fractalTypeEl.addEventListener("change", () => {
  if (state.autopilot) stopAutopilot();
  state.type = parseInt(fractalTypeEl.value, 10);
  juliaGroupEl.style.display = state.type === 1 ? "block" : "none";
  const d = typeDefaults[state.type];
  state.centerRe = d.centerRe;
  state.centerIm = d.centerIm;
  state.scale = d.scale;
  updateHud();
});

maxIterEl.addEventListener("input", () => {
  userMaxIter = parseInt(maxIterEl.value, 10);
  if (!state.autopilot) {
    state.maxIter = userMaxIter;
    iterValEl.textContent = state.maxIter;
  }
});

paletteEl.addEventListener("change", () => {
  state.palette = parseInt(paletteEl.value, 10);
});

cycleSpeedEl.addEventListener("input", () => {
  userCycleSpeed = parseInt(cycleSpeedEl.value, 10);
  if (!state.autopilot) {
    state.cycleSpeed = userCycleSpeed;
    cycleValEl.textContent = state.cycleSpeed;
  }
});

[juliaReEl, juliaImEl].forEach((el) =>
  el.addEventListener("change", () => {
    state.juliaRe = parseFloat(juliaReEl.value);
    state.juliaIm = parseFloat(juliaImEl.value);
  })
);

function stopAutopilot() {
  state.autopilot = false;
  autopilotBtn.classList.remove("active");
  autopilotBtn.innerHTML = "&#9654; Autopilot";
  state.rotation = 0;
  state.vignette = 0;
  state.maxIter = userMaxIter;
  state.cycleSpeed = userCycleSpeed;
  syncControlsFromState();
}

autopilotBtn.addEventListener("click", () => {
  if (state.autopilot) {
    stopAutopilot();
  } else {
    state.autopilot = true;
    autopilotBtn.classList.add("active");
    autopilotBtn.innerHTML = "&#9632; Stop Autopilot";
    autopilotBaseScale = typeDefaults[state.type].scale;
    autopilotStart = performance.now();
    autopilotIdx = -1; // force landmark name to refresh on first frame
  }
});

document.getElementById("resetBtn").addEventListener("click", () => {
  stopAutopilot();
  const d = typeDefaults[state.type];
  state.centerRe = d.centerRe;
  state.centerIm = d.centerIm;
  state.scale = d.scale;
  updateHud();
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  draw(); // ensure latest frame is in the buffer
  const link = document.createElement("a");
  link.download = "fractal.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// ---- Mouse interaction: wheel to zoom, drag to pan ----
let isDragging = false;
let lastX = 0, lastY = 0;

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (state.autopilot) stopAutopilot();

  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;
  const aspect = canvas.width / canvas.height;
  const worldX = state.centerRe + (mx - 0.5) * state.scale * aspect;
  const worldY = state.centerIm - (my - 0.5) * state.scale;

  const zoomFactor = Math.exp(e.deltaY * 0.0015);
  state.scale = Math.max(1e-9, Math.min(6, state.scale * zoomFactor));

  // keep the point under the cursor fixed
  state.centerRe = worldX - (mx - 0.5) * state.scale * aspect;
  state.centerIm = worldY + (my - 0.5) * state.scale;
  updateHud();
}, { passive: false });

canvas.addEventListener("mousedown", (e) => {
  isDragging = true;
  canvas.classList.add("dragging");
  lastX = e.clientX;
  lastY = e.clientY;
  if (state.autopilot) stopAutopilot();
});
window.addEventListener("mouseup", () => {
  isDragging = false;
  canvas.classList.remove("dragging");
});
window.addEventListener("mousemove", (e) => {
  if (!isDragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  const aspect = canvas.width / canvas.height;
  state.centerRe -= (dx / canvas.height) * state.scale * aspect;
  state.centerIm += (dy / canvas.height) * state.scale;
  updateHud();
});

// Touch support (basic pan + pinch)
let lastTouchDist = null;
canvas.addEventListener("touchstart", (e) => {
  if (e.touches.length === 1) {
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
  }
}, { passive: true });
canvas.addEventListener("touchmove", (e) => {
  if (state.autopilot) stopAutopilot();
  if (e.touches.length === 1) {
    const dx = e.touches[0].clientX - lastX;
    const dy = e.touches[0].clientY - lastY;
    lastX = e.touches[0].clientX;
    lastY = e.touches[0].clientY;
    const aspect = canvas.width / canvas.height;
    state.centerRe -= (dx / canvas.height) * state.scale * aspect;
    state.centerIm += (dy / canvas.height) * state.scale;
    updateHud();
  } else if (e.touches.length === 2) {
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    if (lastTouchDist != null) {
      const zoomFactor = lastTouchDist / dist;
      state.scale = Math.max(1e-9, Math.min(6, state.scale * zoomFactor));
      updateHud();
    }
    lastTouchDist = dist;
  }
}, { passive: true });
canvas.addEventListener("touchend", () => { lastTouchDist = null; });

updateHud();
loop();
