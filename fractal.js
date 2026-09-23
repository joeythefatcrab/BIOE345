// Fractal Explorer — Mandelbrot & Julia set renderer
// All math runs on the client; canvas pixels are colored per-point
// by how many iterations it took to "escape".

const canvas = document.getElementById("fractalCanvas");
const ctx = canvas.getContext("2d");
const coordsEl = document.getElementById("coords");

const state = {
  type: "mandelbrot",
  maxIter: 200,
  centerRe: -0.5,
  centerIm: 0,
  scale: 2.5, // width of view in the complex plane
  juliaRe: -0.7,
  juliaIm: 0.27,
  palette: "twilight",
};

// ---- Color palettes ----
// Each takes a normalized value t in [0,1] and returns [r,g,b]
const palettes = {
  twilight(t) {
    const r = 40 + 180 * Math.sin(Math.PI * t + 0.5);
    const g = 20 + 60 * t;
    const b = 90 + 140 * Math.cos(Math.PI * t * 0.7);
    return [clamp(r), clamp(g + 90 * t), clamp(b)];
  },
  fire(t) {
    return [clamp(255 * Math.min(1, t * 2)), clamp(255 * Math.max(0, t * 2 - 0.5) * 1.6), clamp(60 * t)];
  },
  ocean(t) {
    return [clamp(20 * t), clamp(120 * t + 40), clamp(180 * t + 70)];
  },
  rainbow(t) {
    const hue = t * 360;
    return hsvToRgb(hue, 0.8, 1);
  },
  mono(t) {
    const v = clamp(255 * t);
    return [v, v, v];
  },
};

function clamp(v) {
  return Math.max(0, Math.min(255, v));
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [clamp((r + m) * 255), clamp((g + m) * 255), clamp((b + m) * 255)];
}

// ---- Core escape-time calculation ----
function escapeIterations(cRe, cIm, maxIter, type, juliaRe, juliaIm) {
  let zRe, zIm, addRe, addIm;
  if (type === "mandelbrot") {
    zRe = 0; zIm = 0;
    addRe = cRe; addIm = cIm;
  } else {
    // Julia set: z starts at the pixel's own coordinate,
    // and the added constant is fixed for the whole image.
    zRe = cRe; zIm = cIm;
    addRe = juliaRe; addIm = juliaIm;
  }
  for (let i = 0; i < maxIter; i++) {
    const zRe2 = zRe * zRe - zIm * zIm + addRe;
    const zIm2 = 2 * zRe * zIm + addIm;
    zRe = zRe2; zIm = zIm2;
    if (zRe * zRe + zIm * zIm > 4) {
      // smooth coloring: fractional escape count reduces banding
      const log_zn = Math.log(zRe * zRe + zIm * zIm) / 2;
      const nu = Math.log(log_zn / Math.log(2)) / Math.log(2);
      return i + 1 - nu;
    }
  }
  return maxIter; // never escaped -> inside the set
}

function render() {
  const w = canvas.width, h = canvas.height;
  const imgData = ctx.createImageData(w, h);
  const data = imgData.data;

  const { maxIter, centerRe, centerIm, scale, type, juliaRe, juliaIm, palette } = state;
  const paletteFn = palettes[palette] || palettes.twilight;
  const aspect = h / w;
  const halfW = scale / 2;
  const halfH = scale * aspect / 2;

  for (let py = 0; py < h; py++) {
    const imag = centerIm + (py / h - 0.5) * 2 * halfH;
    for (let px = 0; px < w; px++) {
      const real = centerRe + (px / w - 0.5) * 2 * halfW;
      const iter = escapeIterations(real, imag, maxIter, type, juliaRe, juliaIm);
      const idx = (py * w + px) * 4;

      if (iter >= maxIter) {
        data[idx] = 5; data[idx + 1] = 5; data[idx + 2] = 10; data[idx + 3] = 255;
      } else {
        const t = iter / maxIter;
        const [r, g, b] = paletteFn(t);
        data[idx] = r; data[idx + 1] = g; data[idx + 2] = b; data[idx + 3] = 255;
      }
    }
  }
  ctx.putImageData(imgData, 0, 0);
}

// ---- UI wiring ----
const fractalTypeEl = document.getElementById("fractalType");
const juliaControlsEl = document.getElementById("juliaControls");
const juliaReEl = document.getElementById("juliaRe");
const juliaImEl = document.getElementById("juliaIm");
const maxIterEl = document.getElementById("maxIter");
const iterValEl = document.getElementById("iterVal");
const paletteEl = document.getElementById("palette");
const zoomSliderEl = document.getElementById("zoomSlider");
const zoomValEl = document.getElementById("zoomVal");
const centerReEl = document.getElementById("centerRe");
const centerImEl = document.getElementById("centerIm");

function syncStateFromUI() {
  state.type = fractalTypeEl.value;
  state.maxIter = parseInt(maxIterEl.value, 10);
  state.palette = paletteEl.value;
  state.juliaRe = parseFloat(juliaReEl.value);
  state.juliaIm = parseFloat(juliaImEl.value);
  state.centerRe = parseFloat(centerReEl.value);
  state.centerIm = parseFloat(centerImEl.value);

  const zoomT = parseFloat(zoomSliderEl.value); // 0..1
  const zoomFactor = Math.pow(2000, zoomT); // up to ~2000x
  state.scale = 2.5 / zoomFactor;
  zoomValEl.textContent = zoomFactor.toFixed(zoomFactor > 10 ? 0 : 1) + "x";

  juliaControlsEl.style.display = state.type === "julia" ? "block" : "none";
}

function renderNow() {
  syncStateFromUI();
  render();
}

document.getElementById("renderBtn").addEventListener("click", renderNow);
fractalTypeEl.addEventListener("change", renderNow);
paletteEl.addEventListener("change", renderNow);
maxIterEl.addEventListener("input", () => {
  iterValEl.textContent = maxIterEl.value;
});
maxIterEl.addEventListener("change", renderNow);
zoomSliderEl.addEventListener("input", () => {
  syncStateFromUI();
});
zoomSliderEl.addEventListener("change", renderNow);
[juliaReEl, juliaImEl, centerReEl, centerImEl].forEach((el) =>
  el.addEventListener("change", renderNow)
);

document.getElementById("resetBtn").addEventListener("click", () => {
  centerReEl.value = state.type === "julia" ? 0 : -0.5;
  centerImEl.value = 0;
  zoomSliderEl.value = 0;
  renderNow();
});

document.getElementById("downloadBtn").addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = `${state.type}-fractal.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// Click to zoom in/out, centered on the clicked point
canvas.addEventListener("click", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;

  const aspect = canvas.height / canvas.width;
  const halfW = state.scale / 2;
  const halfH = state.scale * aspect / 2;
  const clickedRe = state.centerRe + (px / canvas.width - 0.5) * 2 * halfW;
  const clickedIm = state.centerIm + (py / canvas.height - 0.5) * 2 * halfH;

  centerReEl.value = clickedRe.toFixed(6);
  centerImEl.value = clickedIm.toFixed(6);

  const currentT = parseFloat(zoomSliderEl.value);
  const step = e.shiftKey ? -0.08 : 0.08;
  zoomSliderEl.value = Math.max(0, Math.min(1, currentT + step));

  renderNow();
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = ((e.clientX - rect.left) / rect.width) * canvas.width;
  const py = ((e.clientY - rect.top) / rect.height) * canvas.height;
  const aspect = canvas.height / canvas.width;
  const halfW = state.scale / 2;
  const halfH = state.scale * aspect / 2;
  const re = state.centerRe + (px / canvas.width - 0.5) * 2 * halfW;
  const im = state.centerIm + (py / canvas.height - 0.5) * 2 * halfH;
  coordsEl.textContent = `real: ${re.toFixed(4)}, imag: ${im.toFixed(4)}`;
});

// Initial render
renderNow();
