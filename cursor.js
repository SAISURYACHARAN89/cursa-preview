// cursor.js — pure vector rendering. No state, no decisions.
// Reads a flat `model` and draws the arrow body, face, glasses, arms + props.

const ARROW = [
  [0, 0], [0, 26], [6, 20], [10, 30], [14.5, 28], [10.5, 18.5], [18.5, 18],
];

const LEFT_EYE  = { x: 4.2, y: 12.0, r: 2.7 };
const RIGHT_EYE = { x: 9.2, y: 11.0, r: 2.5 };
const MOUTH     = { x: 6.4, y: 17.2 };
const L_ARM_ROOT = { x: 0.8, y: 17.5 };
const R_ARM_ROOT = { x: 13.2, y: 15.2 };

const COL = {
  body: "#f4f5f7", stroke: "#9aa0b0", outline: "#16181d",
  iris: "#3a7afe", pupil: "#101218", lid: "#eceae6",
  sweat: "#5ec6ff", read: "#2a2d33", browDark: "#2a2d33", browWhite: "#f3f3f3",
  cane: "#6b4a2b", bag: "#9a7870", wrinkle: "rgba(90,65,55,0.52)",
  arm: "#c0c8da", hand: "#d4d8e2",
};

const lerpColor = (a, b, t) => {
  const pa = [parseInt(a.slice(1,3),16),parseInt(a.slice(3,5),16),parseInt(a.slice(5,7),16)];
  const pb = [parseInt(b.slice(1,3),16),parseInt(b.slice(3,5),16),parseInt(b.slice(5,7),16)];
  const c = pa.map((v,i)=>Math.round(v+(pb[i]-v)*t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
};

function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function drawArrow(ctx, pale) {
  tracePath(ctx, ARROW);
  ctx.fillStyle = pale > 0.02 ? lerpColor(COL.body, "#dfe2ea", pale) : COL.body;
  ctx.fill();
  ctx.lineWidth = 0.85;
  ctx.strokeStyle = pale > 0.02 ? lerpColor(COL.stroke, "#b7bcc8", pale) : COL.stroke;
  ctx.stroke();
}

function drawEye(ctx, eye, model, openness) {
  const bs = 1 + model.babyEyes * 0.42;
  const { x: cx, y: cy } = eye;
  const rb = eye.r * bs;
  const ry = rb * (1 - model.squint * 0.4 + model.wide * 0.25);
  const rx = rb * (1 + model.wide * 0.08);

  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff"; ctx.fill();
  ctx.lineWidth = 0.4; ctx.strokeStyle = COL.outline; ctx.stroke();
  ctx.clip();

  const lookMax = rb * 0.42;
  const ix = cx + model.lookX * lookMax, iy = cy + model.lookY * lookMax;
  ctx.beginPath(); ctx.arc(ix, iy, rb * 0.62, 0, Math.PI * 2);
  ctx.fillStyle = model.pale > 0.02 ? lerpColor(COL.iris, "#7d8aa8", model.pale * 0.6) : COL.iris;
  ctx.fill();
  ctx.beginPath(); ctx.arc(ix, iy, rb * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = COL.pupil; ctx.fill();
  ctx.beginPath(); ctx.arc(ix - rb * 0.14, iy - rb * 0.16, rb * 0.12, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.9)"; ctx.fill();

  const top = cy - ry, lidH = (1 - openness) * (2 * ry);
  if (lidH > 0.01) {
    ctx.beginPath();
    ctx.moveTo(cx - rx, top); ctx.lineTo(cx + rx, top);
    ctx.lineTo(cx + rx, top + lidH);
    ctx.quadraticCurveTo(cx, top + lidH + ry * 0.35, cx - rx, top + lidH);
    ctx.closePath(); ctx.fillStyle = COL.lid; ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - rx, top + lidH);
    ctx.quadraticCurveTo(cx, top + lidH + ry * 0.35, cx + rx, top + lidH);
    ctx.lineWidth = 0.35; ctx.strokeStyle = COL.outline; ctx.stroke();
  }
  ctx.restore();
}

function drawEyebrow(ctx, eye, model, raise) {
  const bs = 1 + model.babyEyes * 0.3;
  const w = eye.r * 1.7 * bs, y = eye.y - eye.r * bs * 1.5 - raise;
  ctx.beginPath();
  ctx.moveTo(eye.x - w / 2, y + 0.4);
  ctx.quadraticCurveTo(eye.x, y - 0.7, eye.x + w / 2, y + 0.2);
  ctx.lineWidth = 0.9 + model.browWhite * 0.5;
  ctx.strokeStyle = model.browWhite > 0.5 ? COL.browWhite : COL.browDark;
  ctx.lineCap = "round"; ctx.stroke();
}

function drawBlush(ctx, amount) {
  if (amount < 0.02) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount) * 0.6;
  ctx.fillStyle = "#ff8aa3";
  ctx.beginPath(); ctx.ellipse(1.3, 15.3, 2.0, 1.35, -0.15, 0, Math.PI * 2); ctx.fill();  // left cheek
  ctx.beginPath(); ctx.ellipse(11.9, 14.4, 1.9, 1.25, 0.15, 0, Math.PI * 2); ctx.fill();  // right cheek
  ctx.restore();
}

function drawDarkBags(ctx, amount) {
  if (amount < 0.02) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount) * 0.92;
  for (const eye of [LEFT_EYE, RIGHT_EYE]) {
    const cy = eye.y + eye.r * 1.02;
    ctx.beginPath();                                   // puffy tired bag below the eye
    ctx.ellipse(eye.x, cy, eye.r * 1.06, eye.r * 0.52, 0, 0, Math.PI);
    ctx.fillStyle = "#8f6f86"; ctx.fill();
    ctx.beginPath();                                   // darker line to define it
    ctx.moveTo(eye.x - eye.r * 0.95, cy - eye.r * 0.12);
    ctx.quadraticCurveTo(eye.x, cy + eye.r * 0.55, eye.x + eye.r * 0.95, cy - eye.r * 0.12);
    ctx.lineWidth = 0.45; ctx.strokeStyle = "#6e5168"; ctx.lineCap = "round"; ctx.stroke();
  }
  ctx.restore();
}

function drawWrinkles(ctx, amount) {
  if (amount < 0.02) return;
  ctx.save(); ctx.globalAlpha = amount * 0.6;
  ctx.strokeStyle = COL.wrinkle; ctx.lineWidth = 0.38; ctx.lineCap = "round";
  for (const [e, s] of [[LEFT_EYE,-1],[RIGHT_EYE,1]]) {
    ctx.beginPath(); ctx.moveTo(e.x + s*e.r, e.y - 0.4);
    ctx.quadraticCurveTo(e.x + s*e.r*1.7, e.y - 1.2, e.x + s*e.r*2.0, e.y - 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.x + s*e.r, e.y + 0.4);
    ctx.quadraticCurveTo(e.x + s*e.r*1.7, e.y + 1.1, e.x + s*e.r*2.0, e.y + 0.9); ctx.stroke();
  }
  ctx.restore();
}

function drawReadingGlasses(ctx, alpha) {
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = COL.read; ctx.lineWidth = 0.5;
  for (const eye of [LEFT_EYE, RIGHT_EYE]) { ctx.beginPath(); ctx.arc(eye.x, eye.y, eye.r * 1.35, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.moveTo(LEFT_EYE.x + LEFT_EYE.r * 1.2, LEFT_EYE.y - 0.2);
  ctx.quadraticCurveTo((LEFT_EYE.x + RIGHT_EYE.x)/2, (LEFT_EYE.y + RIGHT_EYE.y)/2 - 1.4, RIGHT_EYE.x - RIGHT_EYE.r*1.2, RIGHT_EYE.y - 0.2);
  ctx.stroke(); ctx.restore();
}

function glassesFrame(ctx, slide, lensFill, frame) {
  const dy = -13 * (1 - slide);
  ctx.save(); ctx.translate(0, dy); ctx.globalAlpha = Math.min(1, slide);
  const lenses = Array.isArray(lensFill)
    ? [{x:LEFT_EYE.x,y:LEFT_EYE.y,rw:LEFT_EYE.r*1.42,rh:LEFT_EYE.r*1.18,c:lensFill[0]},
       {x:RIGHT_EYE.x,y:RIGHT_EYE.y,rw:RIGHT_EYE.r*1.42,rh:RIGHT_EYE.r*1.18,c:lensFill[1]}]
    : [{x:LEFT_EYE.x,y:LEFT_EYE.y,rw:LEFT_EYE.r*1.42,rh:LEFT_EYE.r*1.18,c:lensFill},
       {x:RIGHT_EYE.x,y:RIGHT_EYE.y,rw:RIGHT_EYE.r*1.42,rh:RIGHT_EYE.r*1.18,c:lensFill}];
  for (const l of lenses) { ctx.beginPath(); ctx.ellipse(l.x,l.y,l.rw,l.rh,0,0,Math.PI*2); ctx.fillStyle=l.c; ctx.fill(); }
  ctx.strokeStyle = frame; ctx.lineWidth = 0.9;
  for (const l of lenses) { ctx.beginPath(); ctx.ellipse(l.x,l.y,l.rw,l.rh,0,0,Math.PI*2); ctx.stroke(); }
  const [A,B] = lenses;
  ctx.beginPath(); ctx.moveTo(A.x+A.rw*0.78,A.y-0.2);
  ctx.quadraticCurveTo((A.x+B.x)/2,(A.y+B.y)/2-2.1,B.x-B.rw*0.78,B.y-0.2);
  ctx.lineWidth=0.8; ctx.stroke();
  ctx.lineWidth=0.75; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(A.x-A.rw,A.y-0.25); ctx.lineTo(A.x-A.rw-4.5,A.y+0.9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(B.x+B.rw,B.y-0.25); ctx.lineTo(B.x+B.rw+4.5,B.y+0.9); ctx.stroke();
  ctx.restore();
}
const drawSunglasses = (ctx, s) => glassesFrame(ctx, s, "rgba(6,10,22,0.88)", "#14161c");
const draw3DGlasses  = (ctx, s) => glassesFrame(ctx, s, ["rgba(195,15,15,0.78)","rgba(12,45,215,0.78)"], "#1a1c24");

function drawMouth(ctx, open) {
  if (open < 0.02) return;
  ctx.beginPath(); ctx.ellipse(MOUTH.x, MOUTH.y, 2.4, 1.2 + open * 3.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = "#2a1d1d"; ctx.fill();
  ctx.lineWidth = 0.3; ctx.strokeStyle = COL.outline; ctx.stroke();
}

function drawSweat(ctx, amount, t) {
  if (amount < 0.05) return;
  const drip = (t % 1600) / 1600;
  const x = RIGHT_EYE.x + RIGHT_EYE.r * 1.4, y = RIGHT_EYE.y - RIGHT_EYE.r + drip * 6;
  ctx.save(); ctx.globalAlpha = amount * (1 - drip * 0.6);
  ctx.beginPath(); ctx.moveTo(x, y - 1.6);
  ctx.quadraticCurveTo(x + 1.3, y + 0.4, x, y + 1.4);
  ctx.quadraticCurveTo(x - 1.3, y + 0.4, x, y - 1.6);
  ctx.fillStyle = COL.sweat; ctx.fill(); ctx.restore();
}

function drawCane(ctx, amount) {
  // Walking cane held in the LEFT hand (top sits where the left hand rests).
  if (amount < 0.05) return;
  ctx.save(); ctx.globalAlpha = amount;
  ctx.strokeStyle = COL.cane; ctx.lineWidth = 1.45; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(-1.5,19.5); ctx.lineTo(0.7,33); ctx.stroke();       // shaft
  ctx.beginPath(); ctx.moveTo(-1.5,19.5); ctx.quadraticCurveTo(-4.4,18.0,-3.5,21.2); ctx.stroke(); // crook handle
  ctx.restore();
}
function drawHeadphones(ctx, amount) {
  if (amount < 0.02) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount);
  ctx.strokeStyle = "#2b2e3a"; ctx.lineWidth = 1.3; ctx.lineCap = "round";        // band over the head
  ctx.beginPath(); ctx.moveTo(-1.0,12.0); ctx.quadraticCurveTo(6.4,-2.6,13.3,11.4); ctx.stroke();
  for (const [cx, cy, rot] of [[-1.0,12.0,-0.12],[13.3,11.4,0.12]]) {             // ear cups
    ctx.beginPath(); ctx.ellipse(cx,cy,1.75,2.45,rot,0,Math.PI*2); ctx.fillStyle="#333744"; ctx.fill();
    ctx.lineWidth=0.4; ctx.strokeStyle="#1c1e26"; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx,cy,0.85,1.55,rot,0,Math.PI*2); ctx.fillStyle="#4a4f60"; ctx.fill();
  }
  ctx.restore();
}
function drawFan(ctx, x, y) {
  // folded paper hand fan (high-CPU: fanning itself)
  ctx.save(); ctx.translate(x, y); ctx.rotate(-0.3);
  const n = 6, R = 5.0, spread = Math.PI * 0.72;
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI/2 - spread/2 + spread * (i / n);
    const a1 = -Math.PI/2 - spread/2 + spread * ((i + 1) / n);
    ctx.beginPath(); ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(a0)*R, Math.sin(a0)*R); ctx.lineTo(Math.cos(a1)*R, Math.sin(a1)*R);
    ctx.closePath(); ctx.fillStyle = i % 2 ? "#ffd9a0" : "#ffc878"; ctx.fill();
    ctx.strokeStyle = "#c99450"; ctx.lineWidth = 0.3; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0,0,0.7,0,Math.PI*2); ctx.fillStyle="#8a5a2a"; ctx.fill();
  ctx.restore();
}
function drawLightning(ctx, x, y) {
  // one clean lightning bolt held up (charging)
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0.8,-5); ctx.lineTo(-1.7,0.4); ctx.lineTo(0.2,0.4);
  ctx.lineTo(-1.1,5); ctx.lineTo(2.6,-1.1); ctx.lineTo(0.6,-1.1); ctx.closePath();
  ctx.fillStyle = "#ffd23a"; ctx.fill();
  ctx.strokeStyle = "#e0a200"; ctx.lineWidth = 0.4; ctx.lineJoin = "round"; ctx.stroke();
  ctx.restore();
}

// ---- held prop items -------------------------------------------------------
// mouth + teeth centred under the eyes (eye centres are x≈4.2 and x≈9.2)
const TEETH = { x: 6.7, y: 16.4 };
function drawTeeth(ctx) {
  const { x, y } = TEETH;
  ctx.save();
  ctx.fillStyle = "#7a2230";                           // dark mouth interior
  ctx.beginPath();
  ctx.moveTo(x-3.4,y-1.4); ctx.quadraticCurveTo(x,y-2.3,x+3.4,y-1.4);
  ctx.lineTo(x+3.4,y+1.7); ctx.quadraticCurveTo(x,y+2.7,x-3.4,y+1.7);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#ffffff";                           // white teeth row
  ctx.beginPath(); ctx.rect(x-3.1,y-1.2,6.2,2.2); ctx.fill();
  ctx.strokeStyle = "#c2c6d0"; ctx.lineWidth = 0.3; ctx.stroke();
  for (let i=1;i<6;i++){ const gx=x-3.1+i*(6.2/6); ctx.beginPath(); ctx.moveTo(gx,y-1.2); ctx.lineTo(gx,y+1.0); ctx.stroke(); }
  ctx.restore();
}
function drawToothbrush(ctx, x, y) {
  // (x,y) = the hand at the mouth. Blue head sits on the teeth, handle runs out
  // to the right toward the wrist; white bristles + foam press DOWN (hand ↔).
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle="#3a8afc"; ctx.beginPath(); ctx.rect(-1.9,0.2,2.3,1.0); ctx.fill(); // blue head on the teeth
  ctx.strokeStyle="#2566c8"; ctx.lineWidth=0.3; ctx.stroke();
  ctx.strokeStyle="#2f6fe0"; ctx.lineWidth=1.2; ctx.lineCap="round";          // blue handle out to the right
  ctx.beginPath(); ctx.moveTo(0.4,0.7); ctx.lineTo(5.2,1.0); ctx.stroke();
  ctx.strokeStyle="#ffffff"; ctx.lineWidth=0.42; ctx.lineCap="round";         // white bristles pressing down
  for (let i=0;i<5;i++){ const bx=-1.7+i*0.48; ctx.beginPath(); ctx.moveTo(bx,1.2); ctx.lineTo(bx,2.2); ctx.stroke(); }
  ctx.fillStyle="rgba(255,255,255,0.92)";                                     // foam dabs
  ctx.beginPath(); ctx.arc(-1.2,2.3,0.5,0,Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(0.3,2.4,0.4,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawController(ctx, lx, ly, rx, ry) {
  ctx.save(); ctx.translate((lx+rx)/2,(ly+ry)/2);
  ctx.fillStyle="#1a1b28"; ctx.beginPath();
  ctx.moveTo(-6,1); ctx.quadraticCurveTo(-6,3.5,-3.5,3.5); ctx.lineTo(3.5,3.5);
  ctx.quadraticCurveTo(6,3.5,6,1); ctx.lineTo(6,-1.8);
  ctx.quadraticCurveTo(4.5,-3.5,0,-3.5); ctx.quadraticCurveTo(-4.5,-3.5,-6,-1.8); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#2e2f42"; ctx.lineWidth=0.5; ctx.stroke();
  ctx.fillStyle="#383850"; ctx.fillRect(-4.8,-0.9,2.4,0.6); ctx.fillRect(-4.1,-1.7,0.6,2.2);
  for (const [bx,by,c] of [[3.2,-1.6,"#ff4070"],[4.5,0,"#ffcc00"],[2,0,"#44aaff"],[3.2,1.4,"#55dd88"]]) { ctx.beginPath(); ctx.arc(bx,by,0.65,0,Math.PI*2); ctx.fillStyle=c; ctx.fill(); }
  ctx.restore();
}
function drawPopcornBucket(ctx, x, y) {
  ctx.save(); ctx.translate(x,y);
  ctx.beginPath(); ctx.moveTo(-2.8,0);ctx.lineTo(-2.1,-6);ctx.lineTo(2.1,-6);ctx.lineTo(2.8,0);ctx.closePath();
  ctx.fillStyle="#cc2222"; ctx.fill();
  ctx.strokeStyle="#fff"; ctx.lineWidth=0.65;
  ctx.beginPath();ctx.moveTo(-0.5,0);ctx.lineTo(-0.4,-6);ctx.stroke();
  ctx.beginPath();ctx.moveTo(0.9,0);ctx.lineTo(0.9,-6);ctx.stroke();
  ctx.fillStyle="#f5df5a";
  for (const [px,py,pr] of [[-2,-7.3,1],[-0.7,-7.9,1.1],[0.7,-7.6,1],[1.9,-7.1,0.95],[0.1,-6.7,0.85]]) { ctx.beginPath();ctx.arc(px,py,pr,0,Math.PI*2);ctx.fill(); }
  ctx.restore();
}
function drawBasket(ctx, hx, hy) {
  // shopping basket hanging from ONE hand at (hx,hy)
  ctx.save(); ctx.translate(hx, hy);
  ctx.strokeStyle="#7a6020"; ctx.lineWidth=0.6; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(-2.6,3.2); ctx.quadraticCurveTo(0,-0.4,2.6,3.2); ctx.stroke(); // handle from the hand
  const top=3.2;
  ctx.beginPath();
  ctx.moveTo(-3.6,top); ctx.lineTo(3.6,top); ctx.lineTo(2.9,top+4.6); ctx.lineTo(-2.9,top+4.6); ctx.closePath();
  ctx.fillStyle="#caa85e"; ctx.fill();
  ctx.strokeStyle="#8b7025"; ctx.lineWidth=0.6; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-3.9,top); ctx.lineTo(3.9,top); ctx.lineWidth=0.85; ctx.stroke();   // rim
  ctx.strokeStyle="#9c7c3a"; ctx.lineWidth=0.32;
  ctx.beginPath(); ctx.moveTo(-3.3,top+1.8); ctx.lineTo(3.3,top+1.8); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-3.1,top+3.3); ctx.lineTo(3.1,top+3.3); ctx.stroke();
  for (let i=-1;i<=1;i++){ ctx.beginPath(); ctx.moveTo(i*2,top); ctx.lineTo(i*1.6,top+4.6); ctx.stroke(); }
  ctx.restore();
}
function drawWallet(ctx, mx, my) {
  ctx.save(); ctx.translate(mx,my);
  ctx.fillStyle="#7b4f28"; ctx.fillRect(-3.5,-2,7,4);
  ctx.strokeStyle="#5a3518"; ctx.lineWidth=0.5; ctx.strokeRect(-3.5,-2,7,4);
  ctx.beginPath();ctx.moveTo(-3.5,0);ctx.lineTo(3.5,0);ctx.lineWidth=0.35;ctx.stroke();
  ctx.fillStyle="#d4a84a"; ctx.fillRect(-0.5,-1.6,2.5,1.2);
  ctx.restore();
}
function drawBriefcase(ctx, x, y) {
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#6b4520"; ctx.fillRect(-3.8,-2.5,7.6,5);
  ctx.strokeStyle="#4a2e10"; ctx.lineWidth=0.6; ctx.strokeRect(-3.8,-2.5,7.6,5);
  ctx.fillStyle="#c8a050"; ctx.fillRect(-0.7,-0.5,1.4,1);
  ctx.strokeStyle="#4a2e10"; ctx.lineWidth=0.8; ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(-2,-2.5);ctx.quadraticCurveTo(-2,-4.5,0,-4.5);ctx.quadraticCurveTo(2,-4.5,2,-2.5);ctx.stroke();
  ctx.restore();
}
function drawEnvelope(ctx, mx, my) {
  ctx.save(); ctx.translate(mx,my);
  ctx.fillStyle="#f8f8f4"; ctx.fillRect(-3.8,-2.5,7.6,5);
  ctx.strokeStyle="#aaa"; ctx.lineWidth=0.5; ctx.strokeRect(-3.8,-2.5,7.6,5);
  ctx.beginPath();ctx.moveTo(-3.8,-2.5);ctx.lineTo(0,-0.2);ctx.lineTo(3.8,-2.5);ctx.stroke();
  ctx.beginPath();ctx.moveTo(-3.8,2.5);ctx.lineTo(0,0.5);ctx.lineTo(3.8,2.5);ctx.stroke();
  ctx.restore();
}
function drawNewspaper(ctx, lx, ly, rx, ry) {
  ctx.save(); ctx.translate((lx+rx)/2,(ly+ry)/2);
  ctx.fillStyle="#e8e6e0"; ctx.beginPath();                       // bigger sheet
  ctx.moveTo(-9,0.5);ctx.lineTo(-9,7);ctx.lineTo(9,7);ctx.lineTo(9,0.5);
  ctx.quadraticCurveTo(7,-3,0,-3.5);ctx.quadraticCurveTo(-7,-3,-9,0.5);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#aaa"; ctx.lineWidth=0.4; ctx.stroke();
  ctx.beginPath();ctx.moveTo(0,-3.5);ctx.lineTo(0,7);ctx.lineWidth=0.5;ctx.strokeStyle="#c0bdb8";ctx.stroke();
  // masthead band + columns
  ctx.fillStyle="#cfccc4"; ctx.fillRect(-7.8,-2.6,15.6,1.1);
  ctx.strokeStyle="#b0b0a8"; ctx.lineWidth=0.35;
  for (const [a,b,c,d] of [[-7.8,0.6,-0.6,0.6],[-7.8,1.8,-0.6,1.8],[-7.8,3.0,-0.6,3.0],[-7.8,4.2,-0.6,4.2],[-7.8,5.4,-0.6,5.4],
                           [0.6,0.6,7.8,0.6],[0.6,1.8,7.8,1.8],[0.6,3.0,7.8,3.0],[0.6,4.2,7.8,4.2],[0.6,5.4,7.8,5.4]]) { ctx.beginPath();ctx.moveTo(a,b);ctx.lineTo(c,d);ctx.stroke(); }
  ctx.restore();
}
function drawCloth(ctx, x, y) {
  // small crumpled cloth/rag for wiping sweat
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle="#eef2f7"; ctx.beginPath();
  ctx.moveTo(-2.6,-1.1); ctx.quadraticCurveTo(-1,-2.1,0.6,-1.3);
  ctx.quadraticCurveTo(2.6,-0.7,2.9,1.0); ctx.quadraticCurveTo(1.1,2.3,-1,1.7);
  ctx.quadraticCurveTo(-2.9,1.1,-2.6,-1.1); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#c2cdd9"; ctx.lineWidth=0.3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1.6,-0.5); ctx.lineTo(1.9,0.3); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1.9,0.7); ctx.lineTo(1.5,1.3); ctx.stroke();
  ctx.restore();
}
function drawBlanket(ctx, anim) {
  // a red blanket pulled up over the lower body (screen sleep)
  ctx.save();
  const top = 20 - (anim || 0) * 3;                 // pulled up as it tucks in
  ctx.fillStyle = "#c0392b";
  ctx.beginPath();
  ctx.moveTo(-4, top + 1);
  ctx.quadraticCurveTo(6.5, top - 1.5, 17, top + 1);
  ctx.lineTo(18, 31); ctx.lineTo(-5, 31); ctx.closePath(); ctx.fill();
  ctx.strokeStyle="#8e2820"; ctx.lineWidth=0.5; ctx.stroke();
  ctx.strokeStyle="#f0cfca"; ctx.lineWidth=0.7;     // hem stripe
  ctx.beginPath(); ctx.moveTo(-3.5, top + 0.4); ctx.quadraticCurveTo(6.5, top - 2.0, 16.5, top + 0.4); ctx.stroke();
  ctx.strokeStyle="#a83025"; ctx.lineWidth=0.4;     // folds
  ctx.beginPath(); ctx.moveTo(2, top + 2); ctx.lineTo(3, 30); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(9, top + 1.5); ctx.lineTo(10.5, 30); ctx.stroke();
  ctx.restore();
}
function drawCompass(ctx, x, y) {
  ctx.save(); ctx.translate(x,y);
  const R = 4.6;
  ctx.beginPath();ctx.arc(0,0,R,0,Math.PI*2);ctx.fillStyle="#e8e0d0";ctx.fill();
  ctx.strokeStyle="#888";ctx.lineWidth=0.7;ctx.stroke();
  ctx.strokeStyle="#ccc";ctx.lineWidth=0.3;
  for (let a=0;a<Math.PI*2;a+=Math.PI/4){ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(Math.cos(a)*(R-0.4),Math.sin(a)*(R-0.4));ctx.stroke();}
  ctx.save();
  ctx.rotate(Math.sin(performance.now() * 0.0006) * 0.6);     // needle slowly drifts (alive)
  ctx.beginPath();ctx.moveTo(0,-R*0.74);ctx.lineTo(-0.75,0.7);ctx.lineTo(0.75,0.7);ctx.closePath();ctx.fillStyle="#e03020";ctx.fill();
  ctx.beginPath();ctx.moveTo(0,R*0.74);ctx.lineTo(-0.75,-0.7);ctx.lineTo(0.75,-0.7);ctx.closePath();ctx.fillStyle="#f4f4f4";ctx.fill();
  ctx.restore();
  ctx.beginPath();ctx.arc(0,0,0.55,0,Math.PI*2);ctx.fillStyle="#555";ctx.fill();
  ctx.restore();
}
function drawClipboard(ctx, x, y) {
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#d4b88a"; ctx.beginPath();ctx.rect(-2.5,-4.5,5,7);ctx.fill();
  ctx.strokeStyle="#a88050";ctx.lineWidth=0.5;ctx.stroke();
  ctx.fillStyle="#888"; ctx.beginPath();ctx.rect(-1.2,-5.5,2.4,1.5);ctx.fill();
  ctx.strokeStyle="#a0806a";ctx.lineWidth=0.3;
  for (const yy of [-3,-2,-1,0,1]){ctx.beginPath();ctx.moveTo(-1.8,yy);ctx.lineTo(1.8,yy);ctx.stroke();}
  ctx.restore();
}
function drawCamera(ctx, x, y, flash) {
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#2a2d3a"; ctx.beginPath();ctx.rect(-5,-3.2,10,6.6);ctx.fill();      // body
  ctx.strokeStyle="#15171e"; ctx.lineWidth=0.5; ctx.stroke();
  ctx.fillStyle="#23252f"; ctx.beginPath();ctx.rect(-2.2,-4.5,4.4,1.5);ctx.fill();   // viewfinder hump
  ctx.beginPath();ctx.arc(0,0.4,2.9,0,Math.PI*2);ctx.fillStyle="#3a3f4d";ctx.fill();  // lens barrel
  ctx.strokeStyle="#555b6a";ctx.lineWidth=0.45;ctx.stroke();
  ctx.beginPath();ctx.arc(0,0.4,2.2,0,Math.PI*2);ctx.fillStyle="#16203a";ctx.fill();  // glass
  ctx.beginPath();ctx.arc(0,0.4,1.2,0,Math.PI*2);ctx.fillStyle="#0a1020";ctx.fill();  // aperture
  ctx.beginPath();ctx.arc(-0.8,-0.4,0.55,0,Math.PI*2);ctx.fillStyle="rgba(255,255,255,0.75)";ctx.fill(); // glint
  ctx.fillStyle = flash > 0.4 ? "#ffffff" : "#ffe98a"; ctx.beginPath();ctx.rect(-4.3,-2.6,1.7,1.3);ctx.fill(); // flash
  ctx.fillStyle="#cc4455"; ctx.beginPath();ctx.rect(3.0,-4.4,1.4,1.2);ctx.fill();     // shutter button
  ctx.restore();
}
function drawCoffeeCup(ctx, x, y, tilt = 0) {
  ctx.save(); ctx.translate(x,y); if (tilt) ctx.rotate(tilt);   // tilt toward the mouth while drinking
  ctx.fillStyle="#f5efe8"; ctx.beginPath();ctx.moveTo(-2,0);ctx.lineTo(-1.7,-4);ctx.lineTo(1.7,-4);ctx.lineTo(2,0);ctx.closePath();ctx.fill();
  ctx.strokeStyle="#c8a890";ctx.lineWidth=0.5;ctx.stroke();
  ctx.fillStyle="#7b4520"; ctx.fillRect(-1.5,-3.8,3,-1.2);
  ctx.strokeStyle="#c8a890";ctx.lineWidth=0.7;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(2,-2.5);ctx.quadraticCurveTo(4,-2.5,4,-1);ctx.quadraticCurveTo(4,0.5,2,0.5);ctx.stroke();
  // rising steam — two wisps that waver and climb from the rim, fading as they go
  const t = performance.now() / 1000;
  ctx.lineCap = "round"; ctx.lineWidth = 0.45;
  for (let i = 0; i < 2; i++) {
    const rise = (t * 0.85 + i * 0.5) % 1;          // 0→1 climb, then reset
    const sway = Math.sin(t * 1.7 + i * Math.PI) * 0.95;
    const baseX = -0.6 + i * 1.3;
    const topY  = -4.2 - rise * 4.8;                 // climbs ~5 units above the rim
    ctx.globalAlpha = Math.sin(rise * Math.PI) * 0.6;// fade in then out over the climb
    ctx.strokeStyle = "#dcdce2";
    ctx.beginPath();
    ctx.moveTo(baseX, -4.2);
    ctx.quadraticCurveTo(baseX + sway, topY + 2.4, baseX - sway * 0.6, topY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
function drawPen(ctx, x, y, tilt) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(-0.35 + tilt);
  ctx.strokeStyle="#2244cc";ctx.lineWidth=1.1;ctx.lineCap="round";
  ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-5.5);ctx.stroke();
  ctx.strokeStyle="#111";ctx.lineWidth=0.5;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,1);ctx.stroke();
  ctx.restore();
}
function drawCard(ctx, x, y) { // right-click menu card
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#fbfbfd"; ctx.beginPath();ctx.rect(0,-4,6.5,8);ctx.fill();
  ctx.strokeStyle="#b9bdc9";ctx.lineWidth=0.5;ctx.stroke();
  ctx.strokeStyle="#cbd0db";ctx.lineWidth=0.4;
  for (const yy of [-2.6,-1.4,-0.2,1,2.2]){ctx.beginPath();ctx.moveTo(0.9,yy);ctx.lineTo(5.6,yy);ctx.stroke();}
  ctx.restore();
}
function drawPaper(ctx, x, y) {
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#fafaf6"; ctx.beginPath();ctx.rect(-2.6,-3.4,5.2,6.8);ctx.fill();
  ctx.strokeStyle="#bbb";ctx.lineWidth=0.4;ctx.stroke();
  ctx.strokeStyle="#cfcfc8";ctx.lineWidth=0.3;
  for (const yy of [-2,-1,0,1,2]){ctx.beginPath();ctx.moveTo(-1.9,yy);ctx.lineTo(1.9,yy);ctx.stroke();}
  ctx.restore();
}
function drawHighlighter(ctx, x, y) {
  ctx.save(); ctx.translate(x,y); ctx.rotate(0.5);
  ctx.fillStyle="#ffe44d"; ctx.beginPath();ctx.rect(-1.1,-4,2.2,5);ctx.fill();
  ctx.fillStyle="#e8b800"; ctx.beginPath();ctx.moveTo(-1.1,1);ctx.lineTo(1.1,1);ctx.lineTo(0,2.6);ctx.closePath();ctx.fill();
  ctx.restore();
}
function drawBox(ctx, lx, ly, rx, ry) {
  ctx.save(); ctx.translate((lx+rx)/2, Math.min(ly,ry)-0.5);
  ctx.fillStyle="#c79a5e"; ctx.beginPath();ctx.rect(-5.5,-1,11,7);ctx.fill();
  ctx.strokeStyle="#9c7639";ctx.lineWidth=0.6;ctx.stroke();
  ctx.beginPath();ctx.moveTo(-5.5,1.5);ctx.lineTo(5.5,1.5);ctx.stroke();      // flap line
  ctx.beginPath();ctx.moveTo(0,-1);ctx.lineTo(0,1.5);ctx.stroke();
  ctx.strokeStyle="#b98c4f";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(-1.4,-1);ctx.lineTo(1.4,-1);ctx.stroke();
  ctx.restore();
}
function drawWatch(ctx, x, y) { // on the resting wrist
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#2a2d3a"; ctx.beginPath();ctx.arc(0,0,1.7,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle="#5a5e70";ctx.lineWidth=0.4;ctx.stroke();
  ctx.strokeStyle="#cfe";ctx.lineWidth=0.35;ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-1);ctx.moveTo(0,0);ctx.lineTo(0.8,0.3);ctx.stroke();
  ctx.restore();
}
function drawCalculator(ctx, x, y) {
  ctx.save(); ctx.translate(x,y);
  ctx.fillStyle="#3a3d48"; ctx.beginPath();ctx.rect(-3.4,-4.6,6.8,9.2);ctx.fill();
  ctx.strokeStyle="#23252e"; ctx.lineWidth=0.5; ctx.stroke();
  ctx.fillStyle="#bfe6a6"; ctx.fillRect(-2.5,-3.9,5,2);              // green display
  ctx.strokeStyle="#1c1e24"; ctx.lineWidth=0.3; ctx.strokeRect(-2.5,-3.9,5,2);
  ctx.fillStyle="#2b2e38"; ctx.beginPath();ctx.moveTo(2.5,-3.6);ctx.lineTo(2.0,-2.2);ctx.lineTo(2.5,-2.2);ctx.closePath();ctx.fill();
  ctx.fillStyle="#d9dce4";                                          // 3x3 key grid
  for (let r=0;r<3;r++) for (let c=0;c<3;c++){ ctx.beginPath();ctx.rect(-2.5+c*1.75,-1.1+r*1.75,1.25,1.25);ctx.fill(); }
  ctx.fillStyle="#ff9f43"; ctx.beginPath();ctx.rect(2.05,-1.1,1.25,3.0);ctx.fill();  // orange "=" column
  ctx.restore();
}
function drawTie(ctx, amount) { // professional necktie on the body (linkedin / meet)
  if (amount < 0.02) return;
  ctx.save(); ctx.globalAlpha = Math.min(1, amount);
  const x = 7.2;
  ctx.fillStyle = "#b3243a";
  ctx.beginPath(); ctx.moveTo(x-1.0,18.0); ctx.lineTo(x+1.0,18.0);
  ctx.lineTo(x+0.7,19.5); ctx.lineTo(x-0.7,19.5); ctx.closePath(); ctx.fill(); // knot
  ctx.beginPath(); ctx.moveTo(x-0.7,19.7); ctx.lineTo(x+0.7,19.7);
  ctx.lineTo(x+1.5,24.6); ctx.lineTo(x,26.4); ctx.lineTo(x-1.5,24.6); ctx.closePath();
  ctx.fillStyle = "#c93049"; ctx.fill();                                       // blade
  ctx.strokeStyle = "#7e1828"; ctx.lineWidth = 0.3; ctx.stroke();
  ctx.restore();
}

// ---- arm system ------------------------------------------------------------
// Each pose maps to left/right hand target positions in arrow design space.
// phase = 0..1 cyclic (loops); anim = 0..1 one-shot progress.
function getHandTargets(pose, phase, anim, punchDouble) {
  const pulse = Math.sin(anim * Math.PI); // 0→1→0
  switch (pose) {
    // page props
    case "toothbrush": return { lx:-4, ly:20, rx:6.7+Math.sin(phase*Math.PI*4)*2.0, ry:15.2 };
    case "controller": return { lx:-9, ly:23, rx:24, ry:23 };
    case "popcorn":    { const up=Math.sin(Math.max(0,Math.min(1,phase))*Math.PI); return {lx:-3,ly:23,rx:6,ry:22-up*7}; } // L holds bucket, R rises to mouth
    case "basket":     return { lx:-1, ly:20, rx:14, ry:17 };   // basket hangs from the left hand
    case "wallet":     return { lx:1, ly:21, rx:10, ry:21 };
    case "briefcase":  return { lx:-6, ly:22, rx:22, ry:22 };
    case "scan":       return { lx:-5, ly:6, rx:16, ry:23 };
    case "envelope":   return { lx:3, ly:16, rx:14, ry:17 };   // held in the left hand
    case "newspaper":  return { lx:-9, ly:19, rx:20, ry:19 };   // lower so the eyes show above the paper
    case "glasses-place": return { lx:-1.5, ly:11.5, rx:15.5, ry:10.5 };
    case "compass":    return { lx:-8, ly:22, rx:22, ry:15 };
    case "clipboard":  return { lx:-6, ly:22, rx:21, ry:17 - Math.sin(phase*Math.PI*6)*2 };
    case "belly-thumbs": return { lx:4, ly:25 + Math.sin(phase*Math.PI*4)*1.5, rx:17, ry:18 };
    case "cover-eyes": { let p=0; if(phase<0.12)p=phase/0.12; else if(phase<0.30)p=1; else if(phase<0.45)p=1-(phase-0.30)/0.15; return {lx:2,ly:8+p*5,rx:8,ry:8+p*5}; }
    case "blazer":     return { lx:-6, ly:23, rx:7, ry:12 + Math.sin(phase*Math.PI*4)*3 };
    case "camera":     return { lx:-2, ly:19, rx:12, ry:17 };   // held up in front of the face
    case "coffee-pen": return { lx:-8 + pulse*14, ly:20, rx:17, ry:16 }; // cup slides to the mouth on a sip (rim → mouth)
    case "calculator": return { lx:-2, ly:23, rx:12, ry:23 - Math.abs(Math.sin(phase*Math.PI*8))*1.8 };
    case "pen":        return { lx:-6, ly:23, rx:20 + Math.sin(phase*Math.PI*8)*2.5, ry:15 + Math.sin(phase*Math.PI*6)*1.5 };
    case "confetti-throw": return { lx:-9, ly:7 - pulse*2, rx:23, ry:7 - pulse*2 };

    // transient input poses
    case "head-pat": { const tap = punchDouble ? Math.abs(Math.sin(anim*Math.PI*2)) : pulse; return { lx:-3, ly:20, rx:6.5, ry:9 - tap*4.5 }; } // click → taps own head
    case "lightning": return { lx:-4, ly:20, rx:13, ry:5 };   // charging → holds a bolt up
    case "punch": { const ext = punchDouble ? Math.abs(Math.sin(anim*Math.PI*2)) : pulse; return { lx:-3, ly:20, rx:14 + ext*16, ry:6 - ext*2 }; }
    case "menu-card":   return { lx:-3, ly:20, rx:20, ry:6 };
    case "drop-release":return { lx:-4 - pulse*3, ly:24 + pulse*4, rx:18 + pulse*3, ry:24 + pulse*4 };
    case "paper-grab":  return { lx:-3, ly:20, rx:9, ry:16 };
    case "paper-slap":  return { lx:-3, ly:20, rx:13, ry:18 + pulse*6 };
    case "wave":        return { lx:-4, ly:20, rx:18 + Math.sin(anim*Math.PI*4)*4, ry:4 };
    case "highlighter": return { lx:-4, ly:20, rx:8 + anim*12, ry:16 };
    case "peace":       return { lx:-4, ly:20, rx:16, ry:3 };
    case "print-present": return { lx:-2, ly:14, rx:15, ry:13 };
    case "fist-pump":   return { lx:-4, ly:22, rx:13, ry:6 - pulse*6 };
    case "celebrate":   return { lx:-9 - Math.sin(anim*Math.PI*6)*2, ly:6, rx:23 + Math.sin(anim*Math.PI*6)*2, ry:6 };
    case "chest-hand":  return { lx:-3, ly:20, rx:9, ry:16 };
    case "grip-sides":  return { lx:-6, ly:14, rx:20, ry:14 };
    case "spark-reach": return { lx:-7, ly:5, rx:21, ry:5 };
    case "ears-cover":  return { lx:-3, ly:9, rx:18, ry:9 };
    case "blanket":     return { lx:-4, ly:20 - anim*3, rx:16, ry:20 - anim*3 }; // grips the blanket top edge
    case "awe-spread":  return { lx:-12, ly:12, rx:26, ry:12 };
    case "shush":       return { lx:-4, ly:22, rx:7, ry:15 };
    case "clutch-chest":{ const pp=Math.sin(phase*Math.PI*2); return { lx:-3, ly:20, rx:8, ry:16 - pp*0.8 }; }
    case "fan":         return { lx:-4, ly:22, rx:12 + Math.sin(phase*Math.PI*8)*2.5, ry:11 };
    case "wipe":        return { lx:-4, ly:22, rx:5.5 + Math.sin(phase*Math.PI*4)*3.5, ry:7 }; // wipe brow with a cloth
    case "watch-tap":   return { lx:2, ly:18, rx:9 + Math.sin(phase*Math.PI*10)*1.5, ry:17 };

    // motion / idle poses
    case "box-carry":   return { lx:-6, ly:22, rx:20, ry:22 };
    case "drag-strain": return { lx:-5, ly:18, rx:19, ry:18 };
    case "grip-hold":   return { lx:-3, ly:16, rx:17, ry:16 };
    case "under-face":  return { lx:-2, ly:18, rx:8, ry:16 };  // hand props under the face
    case "limp":        return { lx:-3, ly:27, rx:16, ry:27 };
    case "rest":        return { lx:-2, ly:19, rx:15, ry:18 };
    case "tuck":
    default:            return { lx:L_ARM_ROOT.x-2, ly:L_ARM_ROOT.y+2, rx:R_ARM_ROOT.x+2, ry:R_ARM_ROOT.y+2 };
  }
}

function drawArm(ctx, ox, oy, tx, ty, out) {
  if (out < 0.01) return null;
  const ex = ox + (tx - ox) * out, ey = oy + (ty - oy) * out;
  const cpx = (ox + ex) / 2 - (ey - oy) * 0.18;
  const cpy = (oy + ey) / 2 + (ex - ox) * 0.12;
  ctx.save(); ctx.globalAlpha = Math.min(1, out * 3);
  ctx.strokeStyle = COL.arm; ctx.lineWidth = 1.65; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(ox,oy); ctx.quadraticCurveTo(cpx,cpy,ex,ey); ctx.stroke();
  ctx.beginPath(); ctx.arc(ex,ey,1.35,0,Math.PI*2);
  ctx.fillStyle = COL.hand; ctx.fill();
  ctx.lineWidth=0.4; ctx.strokeStyle=COL.outline; ctx.stroke();
  ctx.restore();
  return { x: ex, y: ey };
}

function drawHandDot(ctx, x, y) {
  ctx.beginPath(); ctx.arc(x, y, 1.35, 0, Math.PI * 2);
  ctx.fillStyle = COL.hand; ctx.fill();
  ctx.lineWidth = 0.4; ctx.strokeStyle = COL.outline; ctx.stroke();
}

function drawArmsAndProp(ctx, model) {
  const { handsOut, prop, propPhase, propAnim } = model;
  if (handsOut < 0.01 || !prop) return;

  const t = getHandTargets(prop, propPhase, propAnim, model.punchDouble);
  // movement physics offset + periodic prop "fidget" lift
  const dx = model.handDX, dy = model.handDY - (model.propBob || 0) * 4.2;
  const out = Math.min(1, handsOut);
  const handL = drawArm(ctx, L_ARM_ROOT.x, L_ARM_ROOT.y, t.lx + dx, t.ly + dy, out);
  const handR = drawArm(ctx, R_ARM_ROOT.x, R_ARM_ROOT.y, t.rx + dx, t.ry + dy, out);
  if (out < 0.5 || !handL || !handR) return;
  const mid = { x: (handL.x+handR.x)/2, y: (handL.y+handR.y)/2 };

  switch (prop) {
    case "toothbrush":    drawTeeth(ctx); drawToothbrush(ctx, handR.x, handR.y); drawHandDot(ctx, handR.x, handR.y); break; // hand in front, brush behind
    case "controller":    drawController(ctx, handL.x, handL.y, handR.x, handR.y); break;
    case "popcorn":       drawPopcornBucket(ctx, handL.x, handL.y - 2.5); break;
    case "basket":        drawBasket(ctx, handL.x, handL.y); break;
    case "wallet":        drawWallet(ctx, mid.x, mid.y); break;
    case "briefcase":     drawBriefcase(ctx, handR.x, handR.y); break;
    case "envelope":      drawEnvelope(ctx, handL.x, handL.y); break;
    case "newspaper":     drawNewspaper(ctx, handL.x, handL.y, handR.x, handR.y); break;
    case "compass":       drawCompass(ctx, handR.x, handR.y); break;
    case "clipboard":     drawClipboard(ctx, handR.x, handR.y); break;
    case "camera":        drawCamera(ctx, mid.x, mid.y - 0.5, model.screenshotFlash); break;
    case "coffee-pen":    drawCoffeeCup(ctx, handL.x, handL.y, Math.sin((model.propAnim||0)*Math.PI)*0.55); drawPen(ctx, handR.x, handR.y, 0); break;
    case "calculator":    drawCalculator(ctx, handL.x + 4.5, handL.y - 1); break;
    case "pen":           drawPen(ctx, handR.x, handR.y, Math.sin(propPhase*Math.PI*8)*0.3); break;
    case "menu-card":     drawCard(ctx, handR.x, handR.y); break;
    case "paper-grab":    drawPaper(ctx, handR.x, handR.y); break;
    case "paper-slap":    drawPaper(ctx, handR.x, handR.y); break;
    case "print-present": drawPaper(ctx, handR.x, handR.y); break;
    case "highlighter":   drawHighlighter(ctx, handR.x, handR.y); break;
    case "box-carry":     drawBox(ctx, handL.x, handL.y, handR.x, handR.y); break;
    case "watch-tap":     drawWatch(ctx, handL.x, handL.y); break;
    case "fan":           drawFan(ctx, handR.x, handR.y); break;
    case "wipe":          drawCloth(ctx, handR.x, handR.y); break;
    case "lightning":     drawLightning(ctx, handR.x, handR.y); break;
    case "blanket":       drawBlanket(ctx, propAnim); break;
    // scan, belly-thumbs, cover-eyes, blazer, confetti-throw, glasses-place,
    // punch, drop-release, wave, peace, fist-pump, celebrate, chest-hand,
    // grip-sides, spark-reach, ears-cover, blanket, awe-spread, shush,
    // clutch-chest, fan, drag-strain, grip-hold, under-face, limp, rest: arms only
  }
}

// ---- main entry ------------------------------------------------------------
export function drawCursor(ctx, px, py, model) {
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(model.scale, model.scale);

  if (model.hunched > 0.01) { ctx.translate(model.hunched * 1.5, model.hunched * 1.2); ctx.rotate(model.hunched * 0.07); }

  ctx.shadowColor = "rgba(0,0,0,0.28)"; ctx.shadowBlur = 3; ctx.shadowOffsetX = 0.8; ctx.shadowOffsetY = 1.5;
  drawArrow(ctx, model.pale);
  ctx.shadowColor = "transparent"; ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;

  const browRaise = model.wide * 0.8;
  drawEyebrow(ctx, LEFT_EYE,  model, browRaise);
  drawEyebrow(ctx, RIGHT_EYE, model, browRaise);
  drawEye(ctx, LEFT_EYE,  model, model.openL);
  drawEye(ctx, RIGHT_EYE, model, model.openR);

  drawBlush(ctx, model.blush);
  drawDarkBags(ctx, model.darkBags);
  drawWrinkles(ctx, model.wrinkles);

  if (model.glassesRead > 0.02) drawReadingGlasses(ctx, model.glassesRead);
  if (model.glassesSun  > 0.02) drawSunglasses(ctx, model.glassesSun);
  if (model.glasses3D   > 0.02) draw3DGlasses(ctx, model.glasses3D);
  if (model.headphones  > 0.02) drawHeadphones(ctx, model.headphones);

  drawSweat(ctx, model.sweat, performance.now());
  drawCane(ctx, model.cane);
  drawTie(ctx, model.tie);
  drawMouth(ctx, model.mouthOpen);

  drawArmsAndProp(ctx, model);

  ctx.restore();
}
