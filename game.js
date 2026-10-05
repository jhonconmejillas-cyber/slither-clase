'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const miniCanvas = document.getElementById('minimap');
const mctx = miniCanvas.getContext('2d');

const startScreen = document.getElementById('startScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud = document.getElementById('hud');
const nicknameInput = document.getElementById('nickname');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const scoreValue = document.getElementById('scoreValue');
const finalScore = document.getElementById('finalScore');
const leaderList = document.getElementById('leaderList');
const boostBtn = document.getElementById('boostBtn');

const TAU = Math.PI * 2;
const WORLD_RADIUS = 3000;
const FOOD_COUNT = 1000;
const MAX_FOOD = 2500;
const BOT_COUNT = 15;
const START_MASS = 20;
const BASE_SPEED = 3.3;
const BOOST_SPEED = 6.6;
const TURN_RATE = 0.08;

const COLORS = ['#ff4d6d', '#ffb703', '#4cc9f0', '#80ed99', '#c77dff', '#f72585', '#fb8500', '#2ec4b6', '#ffd60a', '#4361ee'];
const BOT_NAMES = ['Viborín', 'Sssandra', 'Zigzag', 'Mamba', 'Cobra', 'Pitón', 'Anaconda', 'Culebrón', 'Serpentina',
  'Kaa', 'Slinky', 'Fideo', 'Gusanito', 'Turbo', 'Neón', 'Tallarín', 'Chispa', 'Espagueti'];

let W = 0;
let H = 0;
let dpr = 1;
let food = [];
let snakes = [];
let player = null;
let state = 'menu';
let boostHeld = false;
let frame = 0;
let lastTime = performance.now();
const camera = { x: 0, y: 0, zoom: 0.8 };
const pointer = { x: 0, y: 0 };

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function angleDiff(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

function randomPointInWorld(f) {
  const a = Math.random() * TAU;
  const r = WORLD_RADIUS * f * Math.sqrt(Math.random());
  return { x: Math.cos(a) * r, y: Math.sin(a) * r };
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = 1 + amount;
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
}

let bgPattern;
function buildPattern() {
  const h = 60;
  const s = h / Math.sqrt(3);
  const tile = document.createElement('canvas');
  tile.width = Math.round(3 * s);
  tile.height = h;
  const t = tile.getContext('2d');
  t.fillStyle = '#0a0e1b';
  t.fillRect(0, 0, tile.width, tile.height);
  t.fillStyle = '#151c32';
  const centers = [[0, 0], [3 * s, 0], [0, h], [3 * s, h], [1.5 * s, h / 2]];
  for (const [cx, cy] of centers) {
    t.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i;
      const px = cx + Math.cos(a) * (s - 2.5);
      const py = cy + Math.sin(a) * (s - 2.5);
      if (i === 0) t.moveTo(px, py);
      else t.lineTo(px, py);
    }
    t.closePath();
    t.fill();
  }
  bgPattern = ctx.createPattern(tile, 'repeat');
}

// ---------- Comida ----------

function makeFood(x, y, value, color) {
  return { x, y, value, r: 3 + value * 1.6, color: color || pick(COLORS), phase: Math.random() * TAU };
}

function spawnNaturalFood() {
  const p = randomPointInWorld(0.97);
  food.push(makeFood(p.x, p.y, rand(0.6, 1.6)));
}

// ---------- Serpientes ----------

class Snake {
  constructor(name, color, x, y, isPlayer, mass) {
    this.name = name;
    this.color = color;
    this.dark = shade(color, -0.3);
    this.isPlayer = isPlayer;
    this.mass = mass;
    this.angle = Math.random() * TAU;
    this.targetAngle = this.angle;
    this.alive = true;
    this.boosting = false;
    this.isBoosting = false;
    this.dropTimer = 0;
    this.thinkTimer = 0;
    this.boostTimer = 0;
    this.segments = [];
    const sp = this.spacing;
    for (let i = 0; i < this.targetSegments; i++) {
      this.segments.push({ x: x - Math.cos(this.angle) * i * sp, y: y - Math.sin(this.angle) * i * sp });
    }
  }

  get radius() { return 8 + Math.sqrt(this.mass) * 0.7; }
  get spacing() { return this.radius * 0.55; }
  get targetSegments() { return Math.floor(8 + this.mass * 0.5); }
  get head() { return this.segments[0]; }

  update(dt) {
    const agility = Math.max(0.5, Math.min(1.2, 13 / this.radius));
    const maxTurn = TURN_RATE * dt * agility;
    this.angle += Math.max(-maxTurn, Math.min(maxTurn, angleDiff(this.angle, this.targetAngle)));

    this.isBoosting = this.boosting && this.mass > START_MASS + 2;
    const speed = (this.isBoosting ? BOOST_SPEED : BASE_SPEED) * dt;
    if (this.isBoosting) {
      this.mass -= 0.09 * dt;
      this.dropTimer += dt;
      if (this.dropTimer > 5) {
        this.dropTimer = 0;
        const tail = this.segments[this.segments.length - 1];
        food.push(makeFood(tail.x + rand(-4, 4), tail.y + rand(-4, 4), 0.45, this.color));
      }
    }

    const head = this.segments[0];
    head.x += Math.cos(this.angle) * speed;
    head.y += Math.sin(this.angle) * speed;

    const sp = this.spacing;
    for (let i = 1; i < this.segments.length; i++) {
      const prev = this.segments[i - 1];
      const seg = this.segments[i];
      const dx = prev.x - seg.x;
      const dy = prev.y - seg.y;
      const dist = Math.hypot(dx, dy);
      if (dist > sp) {
        const k = (dist - sp) / dist;
        seg.x += dx * k;
        seg.y += dy * k;
      }
    }

    const target = this.targetSegments;
    while (this.segments.length < target) {
      const tail = this.segments[this.segments.length - 1];
      this.segments.push({ x: tail.x, y: tail.y });
    }
    while (this.segments.length > target && this.segments.length > 2) this.segments.pop();
  }
}

function eatFood(snake, dt) {
  const h = snake.head;
  const r = snake.radius;
  const attract = r + 35;
  for (let i = food.length - 1; i >= 0; i--) {
    const f = food[i];
    const dx = h.x - f.x;
    const dy = h.y - f.y;
    if (Math.abs(dx) > attract || Math.abs(dy) > attract) continue;
    const d2 = dx * dx + dy * dy;
    if (d2 < (r + f.r) * (r + f.r)) {
      snake.mass += f.value;
      food[i] = food[food.length - 1];
      food.pop();
    } else if (d2 < attract * attract) {
      f.x += dx * 0.18 * dt;
      f.y += dy * 0.18 * dt;
    }
  }
}

function kill(snake) {
  snake.alive = false;
  const segs = snake.segments;
  const pellets = Math.max(1, Math.ceil(segs.length / 2));
  const value = Math.min(6, Math.max(1, (snake.mass * 0.8) / pellets));
  for (let i = 0; i < segs.length; i += 2) {
    const p = segs[i];
    food.push(makeFood(p.x + rand(-8, 8), p.y + rand(-8, 8), value, snake.color));
  }
  if (snake.isPlayer) onPlayerDeath();
}

function checkCollisions() {
  for (const a of snakes) {
    if (!a.alive) continue;
    const h = a.head;
    const limit = WORLD_RADIUS - a.radius;
    if (h.x * h.x + h.y * h.y > limit * limit) {
      kill(a);
      continue;
    }
    for (const b of snakes) {
      if (b === a || !b.alive) continue;
      const reach = b.segments.length * b.spacing + b.radius + a.radius;
      const rx = h.x - b.head.x;
      const ry = h.y - b.head.y;
      if (rx * rx + ry * ry > reach * reach) continue;
      const rr = a.radius * 0.7 + b.radius * 0.85;
      const rr2 = rr * rr;
      let hit = false;
      for (const s of b.segments) {
        const dx = h.x - s.x;
        const dy = h.y - s.y;
        if (dx * dx + dy * dy < rr2) {
          hit = true;
          break;
        }
      }
      if (hit) {
        kill(a);
        break;
      }
    }
  }
}

// ---------- Inteligencia de los bots ----------

function botThink(b) {
  const h = b.head;

  if (Math.hypot(h.x, h.y) > WORLD_RADIUS - 350) {
    b.targetAngle = Math.atan2(-h.y, -h.x) + rand(-0.4, 0.4);
    b.boostTimer = 0;
    return;
  }

  const look = b.radius * 4 + 50;
  const lx = h.x + Math.cos(b.angle) * look;
  const ly = h.y + Math.sin(b.angle) * look;
  for (const o of snakes) {
    if (o === b || !o.alive) continue;
    const reach = o.segments.length * o.spacing + look;
    const ox = lx - o.head.x;
    const oy = ly - o.head.y;
    if (ox * ox + oy * oy > reach * reach) continue;
    const danger = (o.radius + b.radius + 25) ** 2;
    for (let i = 0; i < o.segments.length; i += 2) {
      const s = o.segments[i];
      const dx = lx - s.x;
      const dy = ly - s.y;
      if (dx * dx + dy * dy < danger) {
        const side = Math.sign(angleDiff(b.angle, Math.atan2(s.y - h.y, s.x - h.x))) || 1;
        b.targetAngle = b.angle - side * Math.PI / 2;
        b.boostTimer = 0;
        return;
      }
    }
  }

  if (player && player.alive && b.mass > player.mass * 0.8) {
    const ph = player.head;
    const d = Math.hypot(ph.x - h.x, ph.y - h.y);
    if (d < 500 && Math.random() < 0.3) {
      const tx = ph.x + Math.cos(player.angle) * 140;
      const ty = ph.y + Math.sin(player.angle) * 140;
      b.targetAngle = Math.atan2(ty - h.y, tx - h.x);
      if (b.mass > 40) b.boostTimer = 40;
      return;
    }
  }

  let best = null;
  let bestScore = 420 * 420;
  for (const f of food) {
    const dx = f.x - h.x;
    const dy = f.y - h.y;
    if (Math.abs(dx) > 420 || Math.abs(dy) > 420) continue;
    const score = (dx * dx + dy * dy) / f.value;
    if (score < bestScore) {
      bestScore = score;
      best = f;
    }
  }
  if (best) b.targetAngle = Math.atan2(best.y - h.y, best.x - h.x);
  else if (Math.random() < 0.1) b.targetAngle = b.angle + rand(-1.2, 1.2);

  if (b.boostTimer <= 0 && b.mass > 45 && Math.random() < 0.015) b.boostTimer = rand(30, 90);
}

function spawnBot() {
  let p = randomPointInWorld(0.8);
  for (let tries = 0; tries < 20; tries++) {
    if (!player || !player.alive) break;
    if (Math.hypot(p.x - player.head.x, p.y - player.head.y) > 900) break;
    p = randomPointInWorld(0.8);
  }
  snakes.push(new Snake(pick(BOT_NAMES), pick(COLORS), p.x, p.y, false, rand(20, 160)));
}

// ---------- Estados del juego ----------

function startGame() {
  const name = nicknameInput.value.trim() || 'Tú';
  const p = randomPointInWorld(0.5);
  player = new Snake(name, pick(COLORS), p.x, p.y, true, START_MASS);
  snakes.push(player);
  camera.x = p.x;
  camera.y = p.y;
  boostHeld = false;
  state = 'playing';
  startScreen.classList.add('hidden');
  gameOverScreen.classList.add('hidden');
  hud.classList.remove('hidden');
}

function onPlayerDeath() {
  state = 'dead';
  boostHeld = false;
  finalScore.textContent = Math.floor(player.mass);
  setTimeout(() => {
    hud.classList.add('hidden');
    gameOverScreen.classList.remove('hidden');
  }, 900);
}

// ---------- Controles ----------

function setPointer(x, y) {
  pointer.x = x;
  pointer.y = y;
}

window.addEventListener('mousemove', (e) => setPointer(e.clientX, e.clientY));
canvas.addEventListener('mousedown', (e) => { if (e.button === 0) boostHeld = true; });
window.addEventListener('mouseup', () => { boostHeld = false; });

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && state === 'playing') {
    boostHeld = true;
    e.preventDefault();
  }
  if (e.code === 'Enter') {
    const menuOpen = !startScreen.classList.contains('hidden');
    const overOpen = !gameOverScreen.classList.contains('hidden');
    if (menuOpen || overOpen) startGame();
  }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') boostHeld = false; });

canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.targetTouches[0];
  setPointer(t.clientX, t.clientY);
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.targetTouches[0];
  setPointer(t.clientX, t.clientY);
}, { passive: false });

function setBoost(on) {
  boostHeld = on;
  boostBtn.classList.toggle('active', on);
}
boostBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setBoost(true); }, { passive: false });
boostBtn.addEventListener('touchend', (e) => { e.preventDefault(); setBoost(false); }, { passive: false });
boostBtn.addEventListener('touchcancel', () => setBoost(false));

startBtn.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);

// ---------- Actualización ----------

function update(dt) {
  if (state === 'playing' && player.alive) {
    const hx = W / 2 + (player.head.x - camera.x) * camera.zoom;
    const hy = H / 2 + (player.head.y - camera.y) * camera.zoom;
    const dx = pointer.x - hx;
    const dy = pointer.y - hy;
    if (dx * dx + dy * dy > 16) player.targetAngle = Math.atan2(dy, dx);
    player.boosting = boostHeld;
  }

  for (const s of snakes) {
    if (!s.alive) continue;
    if (!s.isPlayer) {
      s.thinkTimer -= dt;
      if (s.thinkTimer <= 0) {
        botThink(s);
        s.thinkTimer = rand(4, 8);
      }
      s.boostTimer -= dt;
      s.boosting = s.boostTimer > 0;
    }
    s.update(dt);
    eatFood(s, dt);
  }

  checkCollisions();
  snakes = snakes.filter((s) => s.alive);

  let bots = snakes.filter((s) => !s.isPlayer).length;
  while (bots < BOT_COUNT) {
    spawnBot();
    bots++;
  }
  while (food.length < FOOD_COUNT) spawnNaturalFood();
  if (food.length > MAX_FOOD) food.splice(0, food.length - MAX_FOOD);

  let tx;
  let ty;
  let tz;
  if (player && state !== 'menu') {
    tx = player.head.x;
    ty = player.head.y;
    tz = Math.max(0.5, 1 - (player.mass - START_MASS) / 1200);
  } else {
    const t = performance.now() * 0.00006;
    tx = Math.cos(t) * 900;
    ty = Math.sin(t * 1.3) * 900;
    tz = 0.8;
  }
  if (W < 700) tz *= 0.72;
  camera.x += (tx - camera.x) * Math.min(1, 0.15 * dt);
  camera.y += (ty - camera.y) * Math.min(1, 0.15 * dt);
  camera.zoom += (tz - camera.zoom) * Math.min(1, 0.03 * dt);
}

// ---------- Dibujo ----------

function drawSnake(s, left, top, vw, vh, now) {
  const r = s.radius;
  const segs = s.segments;
  const m = r * 2;
  const visible = (p) => p.x > left - m && p.x < left + vw + m && p.y > top - m && p.y < top + vh + m;

  if (s.isBoosting) {
    ctx.globalAlpha = 0.25 + 0.1 * Math.sin(now * 0.02);
    ctx.fillStyle = s.color;
    for (let i = segs.length - 1; i >= 0; i -= 2) {
      const p = segs[i];
      if (!visible(p)) continue;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 1.6, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  for (let i = segs.length - 1; i >= 0; i--) {
    const p = segs[i];
    if (!visible(p)) continue;
    ctx.fillStyle = Math.floor(i / 3) % 2 === 0 ? s.color : s.dark;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, TAU);
    ctx.fill();
  }

  const h = segs[0];
  if (!visible(h)) return;
  for (const side of [-1, 1]) {
    const ea = s.angle + side * 0.55;
    const ex = h.x + Math.cos(ea) * r * 0.55;
    const ey = h.y + Math.sin(ea) * r * 0.55;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(ex, ey, r * 0.38, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(ex + Math.cos(s.targetAngle) * r * 0.15, ey + Math.sin(s.targetAngle) * r * 0.15, r * 0.2, 0, TAU);
    ctx.fill();
  }

  const fontSize = 14 / camera.zoom;
  ctx.font = `600 ${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(s.name, h.x, h.y - r - 8 / camera.zoom);
}

function render(now) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#1c0a14';
  ctx.fillRect(0, 0, W, H);

  const z = camera.zoom;
  ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (W / 2 - camera.x * z), dpr * (H / 2 - camera.y * z));
  const vw = W / z;
  const vh = H / z;
  const left = camera.x - vw / 2;
  const top = camera.y - vh / 2;

  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, WORLD_RADIUS, 0, TAU);
  ctx.clip();
  ctx.fillStyle = bgPattern;
  ctx.fillRect(left, top, vw, vh);
  ctx.restore();

  ctx.lineWidth = 18;
  ctx.strokeStyle = 'rgba(255,60,90,0.6)';
  ctx.beginPath();
  ctx.arc(0, 0, WORLD_RADIUS, 0, TAU);
  ctx.stroke();

  const margin = 60;
  for (const f of food) {
    if (f.x < left - margin || f.x > left + vw + margin || f.y < top - margin || f.y > top + vh + margin) continue;
    const r = f.r * (1 + Math.sin(now * 0.004 + f.phase) * 0.15);
    ctx.fillStyle = f.color;
    ctx.globalAlpha = 0.22;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r * 2.3, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(f.x, f.y, r, 0, TAU);
    ctx.fill();
  }

  for (const s of snakes) if (s !== player) drawSnake(s, left, top, vw, vh, now);
  if (player && player.alive) drawSnake(player, left, top, vw, vh, now);
}

function drawMinimap() {
  const size = miniCanvas.width;
  const c = size / 2;
  const k = (c - 4) / WORLD_RADIUS;
  mctx.clearRect(0, 0, size, size);
  mctx.fillStyle = 'rgba(10,14,28,0.7)';
  mctx.strokeStyle = 'rgba(255,255,255,0.25)';
  mctx.lineWidth = 2;
  mctx.beginPath();
  mctx.arc(c, c, c - 2, 0, TAU);
  mctx.fill();
  mctx.stroke();
  for (const s of snakes) {
    if (s === player) continue;
    mctx.fillStyle = s.color;
    mctx.globalAlpha = 0.7;
    mctx.beginPath();
    mctx.arc(c + s.head.x * k, c + s.head.y * k, 1.5 + s.radius / 20, 0, TAU);
    mctx.fill();
  }
  mctx.globalAlpha = 1;
  if (player && player.alive) {
    mctx.fillStyle = '#fff';
    mctx.beginPath();
    mctx.arc(c + player.head.x * k, c + player.head.y * k, 4, 0, TAU);
    mctx.fill();
  }
}

function updateLeaderboard() {
  const ranking = [...snakes].sort((a, b) => b.mass - a.mass).slice(0, 8);
  leaderList.replaceChildren();
  for (const s of ranking) {
    const li = document.createElement('li');
    li.textContent = `${s.name} · ${Math.floor(s.mass)}`;
    if (s === player) li.className = 'me';
    leaderList.appendChild(li);
  }
}

function loop(now) {
  const dt = Math.min((now - lastTime) / 16.667, 3);
  lastTime = now;
  frame++;

  update(dt);
  render(now);

  if (state === 'playing') {
    scoreValue.textContent = Math.floor(player.mass);
    if (frame % 6 === 0) drawMinimap();
    if (frame % 20 === 0) updateLeaderboard();
  }

  requestAnimationFrame(loop);
}

window.addEventListener('resize', resize);
resize();
buildPattern();
for (let i = 0; i < FOOD_COUNT; i++) spawnNaturalFood();
for (let i = 0; i < BOT_COUNT; i++) spawnBot();
requestAnimationFrame(loop);
