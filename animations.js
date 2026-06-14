// animations.js — floating particle effects around the cursor.
// Handles: sleeping Zzz, music notes, success/download confetti, notification "!".

class Particle {
  constructor(x, y, opts) {
    this.x    = x;
    this.y    = y;
    this.vx   = opts.vx;
    this.vy   = opts.vy;
    this.life = 0;
    this.ttl  = opts.ttl;
    this.text = opts.text;
    this.size = opts.size;
    this.color= opts.color;
    this.spin = opts.spin || 0;
    this.rot  = (Math.random() - 0.5) * 0.6;
  }

  get dead() { return this.life >= this.ttl; }

  update(dt) {
    this.life += dt;
    const s = dt / 16.67;
    this.x  += this.vx * s;
    this.y  += this.vy * s;
    this.vy += 0.012 * s;
    this.rot += this.spin * s;
  }

  draw(ctx) {
    const p = this.life / this.ttl;
    const alpha = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85;
    ctx.save();
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.font = `700 ${this.size}px -apple-system, "Segoe UI Emoji", system-ui, sans-serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = this.color;
    ctx.fillText(this.text, 0, 0);
    ctx.restore();
  }
}

export class Effects {
  constructor() {
    this.particles       = [];
    this._zzzCooldown    = 0;
    this._musicCooldown  = 0;
    this._confettiTimer  = 0;
    this._notifCooldown  = 0;
    this._heartCooldown  = 0;
  }

  update(dt, model, px, py) {
    this._zzzCooldown   -= dt;
    this._musicCooldown -= dt;

    // Sleeping: Zzz
    if (model.sleeping && this._zzzCooldown <= 0) {
      this._zzzCooldown = 900 + Math.random() * 400;
      this.particles.push(new Particle(px + 16, py - 4, {
        vx: 0.25, vy: -0.5,
        ttl: 1800,
        text: "z",
        size: 12 + Math.random() * 8,
        color: "#cdd6e6",
        spin: 0,
      }));
    }

    // Music: ♪ / ♫ float out every 8–10s, only when cursor is idle
    if (model.playingMusic && !model.moving && this._musicCooldown <= 0) {
      this._musicCooldown = 8000 + Math.random() * 2000;
      const notes = ["♪", "♫", "♩", "♬"];
      for (let i = 0; i < 2; i++) {
        this.particles.push(new Particle(
          px + 10 + Math.random() * 10,
          py - 2  + (Math.random() - 0.5) * 6, {
          vx:   0.25 + Math.random() * 0.4,
          vy:  -0.75 - Math.random() * 0.5,
          ttl: 1600 + Math.random() * 600,
          text: notes[Math.floor(Math.random() * notes.length)],
          size: 13 + Math.random() * 7,
          color: "#1ed760",
          spin: (Math.random() - 0.5) * 0.012,
        }));
      }
    }

    // Confetti burst — payment success (29) or download complete (54).
    if (model.throwingConfetti || model.celebrating) {
      this._confettiTimer -= dt;
      if (this._confettiTimer <= 0) {
        this._confettiTimer = 180;
        const shapes = ["✦", "★", "●", "▲", "■"];
        const colors = ["#ff4060", "#44dd88", "#4488ff", "#ffcc00", "#ff8844", "#dd44ff"];
        const n = model.throwingConfetti ? 6 : 4;
        for (let i = 0; i < n; i++) {
          this.particles.push(new Particle(
            px + (Math.random() - 0.5) * 30, py + (Math.random() - 0.5) * 10, {
            vx: (Math.random() - 0.5) * 2.2,
            vy: -1.8 - Math.random() * 1.5,
            ttl: 900 + Math.random() * 600,
            text: shapes[Math.floor(Math.random() * shapes.length)],
            size: 9 + Math.random() * 9,
            color: colors[Math.floor(Math.random() * colors.length)],
            spin: (Math.random() - 0.5) * 0.05,
          }));
        }
      }
    } else {
      this._confettiTimer = 0;
    }

    // Dating: little hearts drift up while the cursor is on a dating site.
    this._heartCooldown -= dt;
    if (model.context === "dating" && this._heartCooldown <= 0) {
      this._heartCooldown = 3200 + Math.random() * 1600;
      this.particles.push(new Particle(px + (Math.random() - 0.5) * 16, py - 1, {
        vx: (Math.random() - 0.5) * 0.5, vy: -0.6 - Math.random() * 0.45,
        ttl: 1700 + Math.random() * 600,
        text: "♥",
        size: 10 + Math.random() * 7,
        color: Math.random() < 0.5 ? "#ff5277" : "#ff86a8",
        spin: (Math.random() - 0.5) * 0.012,
      }));
    }

    // Notification pop (63): a single "!" startles up briefly.
    if (model.notifPop > 0.85 && this._notifCooldown <= 0) {
      this._notifCooldown = 400;
      this.particles.push(new Particle(px + 14, py - 8, {
        vx: 0.1, vy: -0.7, ttl: 800, text: "!", size: 18, color: "#ff5277", spin: 0,
      }));
    }
    this._notifCooldown -= dt;

    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter((p) => !p.dead);
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }
}
