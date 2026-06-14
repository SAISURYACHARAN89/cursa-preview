// main.js — wiring + the 60fps render loop.
//
// Input channels:
//   Tauri "cursor"/"fg-window"/"media"/"enabled"   — overlay basics
//   Tauri "input"  {t:down|up|rightclick|scroll|typing|key, …}  — global tap
//   Tauri "sys"    {t:battery|cpu|audio|willsleep|didwake, …}   — monitors
//   DOM events (browser preview only) mirror the same model API for testing.

import { Personality } from "./state.js";
import { drawCursor }  from "./cursor.js";
import { Effects }     from "./animations.js";

const canvas = document.getElementById("stage");
const ctx    = canvas.getContext("2d");

const model   = new Personality();
const effects = new Effects();

const cursor = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let lastPos        = { x: cursor.x, y: cursor.y };
let vel            = { x: 0, y: 0 };
let movedThisFrame = false;
let enabled        = true;

let mediaActive = false;
let lastMoveT   = performance.now();
let eyesAlpha   = 1;
const IDLE_HIDE_MS = 3000;
const FADE_MS      = 220;

let dpr = window.devicePixelRatio || 1;
function resize() {
  dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.round(window.innerWidth  * dpr);
  canvas.height = Math.round(window.innerHeight * dpr);
  canvas.style.width  = window.innerWidth  + "px";
  canvas.style.height = window.innerHeight + "px";
}
resize();
window.addEventListener("resize", resize);

function setCursor(x, y) {
  if (x !== cursor.x || y !== cursor.y) lastMoveT = performance.now();
  cursor.x = x;
  cursor.y = y;
  movedThisFrame = true;
  // Drag detection: held button + meaningful travel from the press point.
  if (mdown && downAt) {
    const d = Math.hypot(cursor.x - downAt.x, cursor.y - downAt.y);
    if (d > 6 && !dragging) { dragging = true; model.setHeld("dragging", true); }
  }
}

window.cursaForce = {};

// ---- shared input/system handlers (Tauri + DOM both call these) -----------
let mdown = false, dragging = false, downAt = null, pendingSingle = null;
let lastCharging = null, lastVol = 100;

function onDown() {
  mdown = true; dragging = false; downAt = { x: cursor.x, y: cursor.y };
  model.setHeld("mouseDown", true);
}
function onUp(clicks) {
  model.setHeld("mouseDown", false);
  if (dragging) {
    model.fireEvent("drop");
    model.setHeld("dragging", false);
    dragging = false; mdown = false; downAt = null;
    return;
  }
  mdown = false; downAt = null;
  if (clicks >= 2) {
    if (pendingSingle) { clearTimeout(pendingSingle); pendingSingle = null; }
    model.fireEvent("dblclick");
  } else {
    if (pendingSingle) clearTimeout(pendingSingle);
    pendingSingle = setTimeout(() => { model.fireEvent("click"); pendingSingle = null; }, 250);
  }
}
const KEY_EVENT = {
  copy: "copy", paste: "paste", undo: "undo", print: "print",
  screenshot: "screenshot", zoomin: "zoomin", zoomout: "zoomout", selectall: "highlight",
};
function applyInput(p) {
  switch (p.t) {
    case "down":       onDown(); break;
    case "up":         onUp(p.clicks || 1); break;
    case "rightclick": model.fireEvent("rightclick"); break;
    case "scroll":     model.onScroll(p.dy || 0); break;
    case "typing":     model.onTyping(); break;
    case "key":        if (KEY_EVENT[p.a]) model.fireEvent(KEY_EVENT[p.a]); break;
  }
}
function applySys(p) {
  switch (p.t) {
    case "battery":
      if (p.charging && lastCharging === false) model.fireEvent("spark");
      lastCharging = p.charging;
      model.setHeld("lowBattery", p.level <= 20 && !p.charging);
      break;
    case "cpu":   model.setHeld("highCpu", !!p.high); break;
    case "audio":
      model.setHeld("muted", !!p.muted);
      if (p.vol >= 100 && lastVol < 100) model.fireEvent("volmax");
      lastVol = p.vol;
      break;
    case "willsleep": model.fireEvent("blanket"); break;
    case "didwake":   model.resumeFromSleep(); break;
    case "fullscreen": if (p.on) model.fireEvent("awe"); break;
  }
}

const tauri = window.__TAURI__;
if (tauri && tauri.event) {
  const { listen } = tauri.event;
  listen("cursor",      (e) => setCursor(e.payload.x, e.payload.y));
  listen("fg-window",   (e) => model.setTitle(e.payload));
  listen("media",       (e) => (mediaActive = e.payload));
  listen("enabled",     (e) => { enabled = e.payload; if (!enabled) effects.particles.length = 0; });
  listen("input",       (e) => applyInput(e.payload));
  listen("sys",         (e) => applySys(e.payload));
  listen("force-stage", (e) => { window.cursaForce.stage   = e.payload || null; });
  listen("force-ctx",   (e) => { window.cursaForce.context = e.payload || null; });
} else {
  initBrowserPreview();
  initDevPanel();
  console.info("Cursa: browser preview mode — dev panel active.");
}

// ---------------------------------------------------------------------------
// Browser preview: map DOM events onto the same model API.
// ---------------------------------------------------------------------------
function initBrowserPreview() {
  // A visible backdrop so the (light) cursor stands out — preview-only, so the
  // real Tauri overlay stays transparent.
  document.documentElement.style.background =
    "radial-gradient(circle at 50% 36%, #363b48 0%, #23262f 68%, #1b1d24 100%)";

  window.addEventListener("mousemove", (e) => setCursor(e.clientX, e.clientY));
  window.addEventListener("mousedown", (e) => { if (e.button === 0) onDown(); });
  window.addEventListener("mouseup",   (e) => { if (e.button === 0) onUp(e.detail >= 2 ? 2 : 1); });

  // ---- mobile / touch: drag a finger to move the cursor; tap = click --------
  const devEl = document.getElementById("dev");
  const onPanel = (target) => !!(devEl && devEl.contains(target));
  let tStart = null, tMoved = 0;
  window.addEventListener("touchstart", (e) => {
    if (onPanel(e.target)) return;
    const t = e.touches[0]; tStart = { x: t.clientX, y: t.clientY }; tMoved = 0;
    setCursor(t.clientX, t.clientY);
  }, { passive: true });
  window.addEventListener("touchmove", (e) => {
    if (onPanel(e.target) || !tStart) return;
    const t = e.touches[0];
    tMoved = Math.max(tMoved, Math.hypot(t.clientX - tStart.x, t.clientY - tStart.y));
    setCursor(t.clientX, t.clientY);
    e.preventDefault();              // drag the cursor instead of scrolling the page
  }, { passive: false });
  window.addEventListener("touchend", () => {
    if (tStart && tMoved < 8) { onDown(); setTimeout(() => onUp(1), 24); } // a real tap → click
    tStart = null;
  }, { passive: true });

  // little usage hint
  const hint = document.createElement("div");
  hint.className = "dev-hint";
  hint.textContent = "drag to move · tap = click · open the panel for every case";
  document.body.appendChild(hint);
  window.addEventListener("contextmenu", (e) => { e.preventDefault(); model.fireEvent("rightclick"); });
  window.addEventListener("wheel", (e) => model.onScroll(e.deltaY), { passive: true });
  document.addEventListener("copy",  () => model.fireEvent("copy"));
  document.addEventListener("paste", () => model.fireEvent("paste"));
  document.addEventListener("selectionchange", () => {
    const s = window.getSelection();
    if (s && s.toString().length > 0) model.fireEvent("highlight");
  });
  document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) model.fireEvent("awe");
  });
  window.addEventListener("keydown", (e) => {
    const meta = e.metaKey || e.ctrlKey;
    if (meta) {
      const k = e.key.toLowerCase();
      if (k === "z") model.fireEvent("undo");
      else if (k === "p") model.fireEvent("print");
      else if (k === "a") model.fireEvent("highlight");
      else if (k === "=" || k === "+") model.fireEvent("zoomin");
      else if (k === "-" || k === "_") model.fireEvent("zoomout");
      // copy/paste handled by the dedicated events above
    } else if (e.key.length === 1) {
      model.onTyping();
    }
  });
  // Battery API (where available) → live low-battery + charging.
  if (navigator.getBattery) {
    navigator.getBattery().then((b) => {
      const push = () => applySys({ t: "battery", level: Math.round(b.level * 100), charging: b.charging });
      push();
      b.addEventListener("levelchange", push);
      b.addEventListener("chargingchange", push);
    });
  }
}

// ---------------------------------------------------------------------------
// Dev panel — a control for every one of the 66 cases.
// ---------------------------------------------------------------------------
function initDevPanel() {
  const panel = document.getElementById("dev");
  if (!panel) return;
  panel.hidden = false;

  // Tap the title to collapse/expand (keeps the panel out of the way on phones).
  const title = panel.querySelector(".dev-title");
  if (title) {
    title.textContent = "Cursa Dev  ▾";
    title.style.cursor = "pointer";
    title.onclick = () => {
      const c = panel.classList.toggle("collapsed");
      title.textContent = c ? "Cursa Dev  ▸" : "Cursa Dev  ▾";
    };
  }

  const STAGES   = ["baby", "adult", "mature", "old", "very-tired", "grandpa"];
  const CONTEXTS = [
    "idle","shopping","checkout","success","video","music","gaming","social",
    "banking","search","email","news","wiki","maps","calendar","food","dating",
    "nsfw","linkedin","instagram","meet","form","chatting","coding","calculator","typing",
  ];
  const PROPS = [
    "toothbrush","controller","popcorn","basket","wallet","briefcase","scan",
    "envelope","newspaper","compass","clipboard","belly-thumbs","cover-eyes",
    "blazer","camera","coffee-pen","calculator","pen","confetti-throw","head-pat","lightning","punch","menu-card",
    "paper-grab","paper-slap","wave","highlighter","peace","print-present",
    "fist-pump","celebrate","chest-hand","grip-sides","spark-reach","ears-cover",
    "blanket","awe-spread","shush","clutch-chest","fan","wipe","watch-tap","box-carry",
    "drag-strain","grip-hold","under-face","limp","rest",
  ];
  const EVENTS = [
    "click","dblclick","rightclick","drop","copy","paste","undo","highlight",
    "screenshot","print","fistpump","downloadcomplete","success","zoomin",
    "zoomout","notif","newwindow","fastscroll","spark","volmax","blanket","awe",
  ];
  const HELD = [
    "moving","scrolling","typing","mouseDown","dragging","fileDragging",
    "lowBattery","highCpu","muted","downloading",
  ];
  const FORCE_TOGGLES = [
    "bags","wrinkles","babyEyes","slowBlink","hunched","blush","pale","tie",
    "headphones","forceSun","force3D","forceRead",
  ];

  const make = (id) => document.getElementById(id);

  // radio group writing window.cursaForce[key]
  function radio(containerId, items, key) {
    const c = make(containerId);
    const btns = items.map((label) => {
      const b = document.createElement("button");
      b.className = "dev-btn"; b.textContent = label;
      b.onclick = () => { window.cursaForce[key] = window.cursaForce[key] === label ? null : label; sync(); };
      c.appendChild(b); return b;
    });
    function sync() { btns.forEach((b, i) => b.classList.toggle("active", window.cursaForce[key] === items[i])); }
    return sync;
  }
  // trigger group: one-shot model.fireEvent(name)
  function triggers(containerId, items) {
    const c = make(containerId);
    items.forEach((name) => {
      const b = document.createElement("button");
      b.className = "dev-btn"; b.textContent = name;
      b.onclick = () => {
        model.fireEvent(name);
        b.classList.add("flash"); setTimeout(() => b.classList.remove("flash"), 200);
      };
      c.appendChild(b);
    });
  }
  // held toggle group: model.setHeld(name, bool)
  function helds(containerId, items) {
    const c = make(containerId);
    items.forEach((name) => {
      const b = document.createElement("button");
      b.className = "dev-btn"; b.textContent = name;
      b.onclick = () => {
        const on = !b.classList.contains("active");
        b.classList.toggle("active", on); model.setHeld(name, on);
      };
      c.appendChild(b);
    });
  }
  // force toggle group: window.cursaForce[name] bool
  function forces(containerId, items) {
    const c = make(containerId);
    items.forEach((name) => {
      const b = document.createElement("button");
      b.className = "dev-btn"; b.textContent = name;
      b.onclick = () => {
        window.cursaForce[name] = !window.cursaForce[name];
        b.classList.toggle("active", !!window.cursaForce[name]);
      };
      c.appendChild(b);
    });
  }

  const syncStages   = radio("dev-stages",   STAGES,   "stage");
  const syncContexts = radio("dev-contexts", CONTEXTS, "context");
  const syncProps    = radio("dev-props",    PROPS,    "prop");
  triggers("dev-events", EVENTS);
  helds("dev-held", HELD);
  forces("dev-force", FORCE_TOGGLES);

  const startupBtn = make("dev-startup-btn");
  if (startupBtn) startupBtn.onclick = () => { window.cursaForce.retriggerStartup = true; };

  const readout = make("dev-readout");
  setInterval(() => {
    syncStages(); syncContexts(); syncProps();
    if (readout) {
      readout.textContent = [
        `stage   ${model.stageName}   ctx ${model.context}`,
        `pose    ${model.prop ?? "—"}  hands ${model.handsOut.toFixed(2)}`,
        `anim ${model.propAnim.toFixed(2)}  phase ${model.propPhase.toFixed(2)}`,
        `open    ${model.openL.toFixed(2)}/${model.openR.toFixed(2)}  wide ${model.wide.toFixed(2)}  sq ${model.squint.toFixed(2)}`,
        `3D ${model.glasses3D.toFixed(1)} sun ${model.glassesSun.toFixed(1)} read ${model.glassesRead.toFixed(1)}`,
        `blush ${model.blush.toFixed(1)} pale ${model.pale.toFixed(1)} bags ${model.darkBags.toFixed(1)}`,
        `held    ${Object.entries(model.held).filter(([,v])=>v).map(([k])=>k).join(",") || "—"}`,
      ].join("\n");
    }
  }, 150);
}

// ---------------------------------------------------------------------------
// Render loop
// ---------------------------------------------------------------------------
let lastT = performance.now();
function frame(now) {
  let dt = now - lastT;
  lastT  = now;
  if (dt > 1000) { model.resumeFromSleep(); dt = 16.67; }

  const rawVX = cursor.x - lastPos.x, rawVY = cursor.y - lastPos.y;
  vel.x = vel.x * 0.7 + rawVX * 0.3;
  vel.y = vel.y * 0.7 + rawVY * 0.3;
  const speed = Math.hypot(rawVX, rawVY) / Math.max(dt, 1);
  lastPos.x = cursor.x; lastPos.y = cursor.y;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (enabled) {
    model.update(dt, { vx: vel.x, vy: vel.y, speed, moved: movedThisFrame, now });
    effects.update(dt, model, cursor.x, cursor.y);

    const idleMs = now - lastMoveT;
    const targetAlpha = mediaActive && idleMs > IDLE_HIDE_MS ? 0 : 1;
    eyesAlpha += (targetAlpha - eyesAlpha) * Math.min(1, dt / FADE_MS);

    if (eyesAlpha > 0.01) {
      ctx.save();
      ctx.globalAlpha = eyesAlpha;
      effects.draw(ctx);
      drawCursor(ctx, cursor.x, cursor.y, model);
      ctx.restore();
    }
  }

  movedThisFrame = false;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
