const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const startButton = document.getElementById('start');
const restartButton = document.getElementById('restart');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayMessage = document.getElementById('overlay-message');
const scoreLabel = document.getElementById('score');
const enemiesLabel = document.getElementById('enemies');
const lifeLabel = document.getElementById('life');
const skillLabel = document.getElementById('skill');

const ARENA_PADDING = 40;
const PLAYER_COLOR = '#38bdf8';
const ENEMY_COLOR = '#f87171';
const BULLET_COLOR = '#facc15';
const SKILL_COLOR = '#fb923c';

const input = {
  up: false,
  down: false,
  left: false,
  right: false,
  shoot: false,
  skill: false,
};

const keys = new Map([
  ['KeyW', 'up'],
  ['ArrowUp', 'up'],
  ['KeyS', 'down'],
  ['ArrowDown', 'down'],
  ['KeyA', 'left'],
  ['ArrowLeft', 'left'],
  ['KeyD', 'right'],
  ['ArrowRight', 'right'],
  ['Space', 'shoot'],
  ['KeyJ', 'shoot'],
  ['KeyK', 'skill'],
]);

window.addEventListener('keydown', (event) => {
  const key = keys.get(event.code);
  if (!key) return;
  event.preventDefault();
  input[key] = true;
});

window.addEventListener('keyup', (event) => {
  const key = keys.get(event.code);
  if (!key) return;
  event.preventDefault();
  input[key] = false;
});

class Tank {
  constructor(x, y, options) {
    this.x = x;
    this.y = y;
    this.width = 42;
    this.height = 48;
    this.speed = options.speed ?? 170;
    this.turnSpeed = options.turnSpeed ?? 5;
    this.color = options.color ?? PLAYER_COLOR;
    this.isPlayer = options.isPlayer ?? false;
    this.maxHp = options.maxHp ?? 100;
    this.hp = this.maxHp;
    this.reload = 0;
    this.reloadTime = options.reloadTime ?? 0.6;
    this.angle = -Math.PI / 2;
    this.turretAngle = this.angle;
    this.ai = options.ai ?? null;
    this.skillCharge = 0;
    this.skillReady = false;
    this.isExploding = false;
  }

  update(dt, state) {
    if (this.isPlayer) {
      this.updatePlayer(dt, state);
    } else if (this.ai) {
      this.ai(this, dt, state);
    }

    this.reload = Math.max(0, this.reload - dt);

    if (this.skillCharge >= 100) {
      this.skillCharge = 100;
      this.skillReady = true;
    }
  }

  updatePlayer(dt, state) {
    const { arena } = state;
    let vx = 0;
    let vy = 0;
    if (input.left) vx -= 1;
    if (input.right) vx += 1;
    if (input.up) vy -= 1;
    if (input.down) vy += 1;

    if (vx !== 0 || vy !== 0) {
      const length = Math.hypot(vx, vy);
      vx = (vx / length) * this.speed;
      vy = (vy / length) * this.speed;
      this.angle = Math.atan2(vy, vx);
      this.turretAngle = this.angle;
    } else {
      vx = 0;
      vy = 0;
    }

    this.x += vx * dt;
    this.y += vy * dt;

    const halfW = this.width / 2;
    const halfH = this.height / 2;
    this.x = Math.min(Math.max(this.x, arena.left + halfW), arena.right - halfW);
    this.y = Math.min(Math.max(this.y, arena.top + halfH), arena.bottom - halfH);

    if (input.shoot) {
      this.tryShoot(state);
    }

    if (input.skill && this.skillReady) {
      this.activateSkill(state);
    }
  }

  takeDamage(amount, state) {
    if (this.isExploding) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.isExploding = true;
      state.addExplosion(this.x, this.y, 120, this.color);
      if (this.isPlayer) {
        state.playerDown = true;
      } else {
        state.score += 150;
        state.player.skillCharge = Math.min(100, state.player.skillCharge + 35);
      }
    }
  }

  tryShoot(state, targetAngle) {
    if (this.reload > 0 || this.isExploding) return;
    const angle = targetAngle ?? this.turretAngle;
    const muzzleDistance = this.height / 2;
    const bulletSpeed = 420;
    const bullet = new Bullet(
      this.x + Math.cos(angle) * muzzleDistance,
      this.y + Math.sin(angle) * muzzleDistance,
      angle,
      bulletSpeed,
      this
    );
    state.bullets.push(bullet);
    this.reload = this.reloadTime;
  }

  activateSkill(state) {
    this.skillCharge = 0;
    this.skillReady = false;
    state.addShockwave(this.x, this.y, 210, SKILL_COLOR, this);
  }
}

class Bullet {
  constructor(x, y, angle, speed, owner) {
    this.x = x;
    this.y = y;
    this.angle = angle;
    this.speed = speed;
    this.owner = owner;
    this.radius = 6;
    this.life = 2.2;
    this.damage = owner.isPlayer ? 34 : 20;
    this.color = owner.isPlayer ? BULLET_COLOR : '#f97316';
  }

  update(dt, state) {
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;
    this.life -= dt;

    const { arena } = state;
    if (
      this.x < arena.left ||
      this.x > arena.right ||
      this.y < arena.top ||
      this.y > arena.bottom
    ) {
      this.life = 0;
    }
  }
}

class Explosion {
  constructor(x, y, radius, color) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.life = 0.45;
    this.elapsed = 0;
    this.color = color;
  }

  update(dt) {
    this.elapsed += dt;
  }

  get progress() {
    return Math.min(1, this.elapsed / this.life);
  }
}

class Shockwave {
  constructor(x, y, radius, color, owner) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.color = color;
    this.owner = owner;
    this.duration = 0.5;
    this.elapsed = 0;
    this.applied = new Set();
  }

  update(dt, state) {
    this.elapsed += dt;
    const r = this.radius * (this.elapsed / this.duration);

    for (const enemy of state.enemies) {
      if (enemy.isExploding || this.applied.has(enemy)) continue;
      const distance = Math.hypot(enemy.x - this.x, enemy.y - this.y);
      if (distance <= r + enemy.width * 0.5) {
        enemy.takeDamage(999, state);
        this.applied.add(enemy);
      }
    }
  }

  get progress() {
    return Math.min(1, this.elapsed / this.duration);
  }
}

const gameState = {
  running: false,
  lastTimestamp: 0,
  player: null,
  enemies: [],
  bullets: [],
  explosions: [],
  shockwaves: [],
  score: 0,
  wave: 0,
  playerDown: false,
  gameOverAnnounced: false,
  waveCleared: false,
  arena: {
    left: ARENA_PADDING,
    top: ARENA_PADDING,
    right: canvas.width - ARENA_PADDING,
    bottom: canvas.height - ARENA_PADDING,
  },

  addExplosion(x, y, radius, color) {
    this.explosions.push(new Explosion(x, y, radius, color));
  },

  addShockwave(x, y, radius, color, owner) {
    const shock = new Shockwave(x, y, radius, color, owner);
    this.shockwaves.push(shock);
    this.addExplosion(x, y, radius * 0.75, color);
  },
};

function resetState() {
  gameState.running = true;
  gameState.lastTimestamp = performance.now();
  gameState.score = 0;
  gameState.wave = 0;
  gameState.enemies.length = 0;
  gameState.bullets.length = 0;
  gameState.explosions.length = 0;
  gameState.shockwaves.length = 0;
  gameState.playerDown = false;
  gameState.gameOverAnnounced = false;
  gameState.waveCleared = false;

  gameState.player = new Tank(canvas.width / 2, canvas.height - 120, {
    isPlayer: true,
    color: PLAYER_COLOR,
    reloadTime: 0.42,
    speed: 240,
  });
  updateHud();
  spawnNextWave();
}

function spawnNextWave() {
  gameState.wave += 1;
  const waves = [4, 6, 7];
  const enemyCount = waves[Math.min(gameState.wave - 1, waves.length - 1)];

  for (let i = 0; i < enemyCount; i += 1) {
    const spawnX = ARENA_PADDING + 70 + (i % 4) * 120;
    const spawnY = ARENA_PADDING + 80 + Math.floor(i / 4) * 120;
    const enemy = new Tank(spawnX, spawnY, {
      color: ENEMY_COLOR,
      speed: 140,
      reloadTime: 1.4 - Math.min(0.6, gameState.wave * 0.15),
      ai: enemyAI,
      maxHp: 80 + gameState.wave * 15,
    });
    enemy.turretAngle = Math.PI / 2;
    gameState.enemies.push(enemy);
  }

  updateHud();
}

function enemyAI(enemy, dt, state) {
  const { player } = state;
  if (!player || player.isExploding) return;
  const dx = player.x - enemy.x;
  const dy = player.y - enemy.y;
  const distance = Math.hypot(dx, dy);

  const desiredAngle = Math.atan2(dy, dx);
  enemy.turretAngle += (desiredAngle - enemy.turretAngle) * Math.min(1, dt * 3.5);

  if (distance > 180) {
    enemy.x += Math.cos(desiredAngle) * enemy.speed * dt * 0.7;
    enemy.y += Math.sin(desiredAngle) * enemy.speed * dt * 0.7;
  } else if (distance < 130) {
    enemy.x -= Math.cos(desiredAngle) * enemy.speed * dt * 0.6;
    enemy.y -= Math.sin(desiredAngle) * enemy.speed * dt * 0.6;
  }

  const halfW = enemy.width / 2;
  const halfH = enemy.height / 2;
  enemy.x = Math.min(Math.max(enemy.x, state.arena.left + halfW), state.arena.right - halfW);
  enemy.y = Math.min(Math.max(enemy.y, state.arena.top + halfH), state.arena.bottom - halfH);

  enemy.angle = enemy.turretAngle;

  if (enemy.reload <= 0 && distance < 380) {
    enemy.tryShoot(state, enemy.turretAngle);
  }
}

function update(timestamp) {
  if (!gameState.running) {
    requestAnimationFrame(update);
    return;
  }

  const dt = Math.min(0.033, (timestamp - gameState.lastTimestamp) / 1000);
  gameState.lastTimestamp = timestamp;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawArena();

  const { player } = gameState;
  player.update(dt, gameState);
  drawTank(player);

  for (const enemy of gameState.enemies) {
    enemy.update(dt, gameState);
    drawTank(enemy);
  }

  for (const bullet of gameState.bullets) {
    bullet.update(dt, gameState);
  }

  handleCollisions();

  gameState.bullets = gameState.bullets.filter((bullet) => bullet.life > 0);

  for (const explosion of gameState.explosions) {
    explosion.update(dt);
  }
  gameState.explosions = gameState.explosions.filter((explosion) => explosion.progress < 1);

  for (const shock of gameState.shockwaves) {
    shock.update(dt, gameState);
  }
  gameState.shockwaves = gameState.shockwaves.filter((shock) => shock.progress < 1);

  drawEffects();
  cleanupEnemies();
  checkGameState();
  updateHud();

  requestAnimationFrame(update);
}

function drawArena() {
  const { arena } = gameState;
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 16]);
  ctx.strokeRect(
    arena.left + 8,
    arena.top + 8,
    arena.right - arena.left - 16,
    arena.bottom - arena.top - 16
  );
  ctx.restore();
}

function drawTank(tank) {
  if (tank.isExploding) return;
  const { width, height } = tank;
  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.rotate(tank.angle);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
  ctx.fillRect(-width / 2, -height / 2, width, height);
  ctx.fillStyle = tank.color;
  ctx.fillRect(-width / 2 + 6, -height / 2 + 8, width - 12, height - 16);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
  ctx.fillRect(-width / 4, -height / 2 - 8, width / 2, height / 1.2);

  ctx.restore();

  ctx.save();
  ctx.translate(tank.x, tank.y);
  ctx.rotate(tank.turretAngle);
  ctx.fillStyle = tank.color;
  ctx.fillRect(-6, -10, 12, 34);
  ctx.fillStyle = 'rgba(241, 245, 249, 0.9)';
  ctx.fillRect(-4, -10, 8, 38);
  ctx.restore();

  drawHealthBar(tank);
}

function drawHealthBar(tank) {
  const barWidth = 50;
  const barHeight = 6;
  const x = tank.x - barWidth / 2;
  const y = tank.y - tank.height / 2 - 14;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.fillRect(x, y, barWidth, barHeight);
  ctx.fillStyle = tank.isPlayer ? '#22c55e' : '#ef4444';
  ctx.fillRect(x, y, (barWidth * tank.hp) / tank.maxHp, barHeight);
}

function handleCollisions() {
  const { bullets, player, enemies } = gameState;

  for (const bullet of bullets) {
    if (bullet.owner.isPlayer) {
      for (const enemy of enemies) {
        if (enemy.isExploding) continue;
        if (rectCircleCollision(enemy, bullet)) {
          enemy.takeDamage(bullet.damage, gameState);
          bullet.life = 0;
          gameState.addExplosion(bullet.x, bullet.y, 70, ENEMY_COLOR);
          break;
        }
      }
    } else if (!player.isExploding && rectCircleCollision(player, bullet)) {
      player.takeDamage(bullet.damage, gameState);
      bullet.life = 0;
      gameState.addExplosion(bullet.x, bullet.y, 60, PLAYER_COLOR);
    }
  }
}

function rectCircleCollision(tank, bullet) {
  const halfW = tank.width / 2;
  const halfH = tank.height / 2;
  const closestX = clamp(bullet.x, tank.x - halfW, tank.x + halfW);
  const closestY = clamp(bullet.y, tank.y - halfH, tank.y + halfH);
  const dx = bullet.x - closestX;
  const dy = bullet.y - closestY;
  return dx * dx + dy * dy <= bullet.radius * bullet.radius;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function drawEffects() {
  for (const bullet of gameState.bullets) {
    ctx.save();
    ctx.fillStyle = bullet.color;
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, bullet.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const explosion of gameState.explosions) {
    const alpha = 1 - explosion.progress;
    ctx.save();
    ctx.globalAlpha = alpha;
    const radius = explosion.radius * explosion.progress;
    const gradient = ctx.createRadialGradient(
      explosion.x,
      explosion.y,
      radius * 0.1,
      explosion.x,
      explosion.y,
      radius
    );
    gradient.addColorStop(0, explosion.color);
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(explosion.x, explosion.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const shock of gameState.shockwaves) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = shock.color;
    ctx.lineWidth = 4;
    const radius = shock.radius * shock.progress;
    ctx.beginPath();
    ctx.arc(shock.x, shock.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function cleanupEnemies() {
  gameState.enemies = gameState.enemies.filter((enemy) => {
    if (!enemy.isExploding) return true;
    if (enemy.hp <= 0 && enemy.isExploding) {
      if (!enemy._removed) {
        gameState.addExplosion(enemy.x, enemy.y, 150, ENEMY_COLOR);
        enemy._removed = true;
      }
      return false;
    }
    return true;
  });
}

function checkGameState() {
  const { player, enemies, wave } = gameState;
  if (gameState.playerDown && !gameState.gameOverAnnounced) {
    gameState.gameOverAnnounced = true;
    gameState.running = false;
    setTimeout(() => {
      showOverlay('任務失敗', '敵の猛攻により部隊は撤退。再編成して再挑戦せよ！');
    }, 600);
    return;
  }

  if (enemies.length === 0 && !gameState.gameOverAnnounced) {
    if (wave >= 3) {
      gameState.gameOverAnnounced = true;
      gameState.running = false;
      setTimeout(() => {
        showOverlay('完全勝利！', `最終ウェーブ撃破！スコア: ${gameState.score}`);
      }, 500);
    } else if (!gameState.waveCleared) {
      gameState.waveCleared = true;
      setTimeout(() => {
        if (!gameState.running) return;
        gameState.waveCleared = false;
        spawnNextWave();
      }, 1200);
    }
  }
}

function updateHud() {
  scoreLabel.textContent = Math.floor(gameState.score);
  enemiesLabel.textContent = gameState.enemies.length.toString();
  const lifeValue = gameState.player ? Math.max(0, Math.floor(gameState.player.hp)) : 100;
  lifeLabel.textContent = lifeValue.toString();
  const skillCharge = Math.floor(gameState.player?.skillCharge ?? 0);
  skillLabel.textContent = `${skillCharge}%`;
  const ready = Boolean(gameState.player?.skillReady);
  document.body.classList.toggle('skill-ready', ready);

  startButton.disabled = gameState.running;
}

function showOverlay(title, message) {
  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  if (title.includes('完全勝利')) {
    restartButton.textContent = '再出撃する';
  } else if (title.includes('任務失敗')) {
    restartButton.textContent = '再挑戦する';
  } else {
    restartButton.textContent = '出撃する';
  }
  overlay.classList.remove('hidden');
}

function hideOverlay() {
  overlay.classList.add('hidden');
}

startButton.addEventListener('click', () => {
  hideOverlay();
  resetState();
});

restartButton.addEventListener('click', () => {
  hideOverlay();
  resetState();
});

overlay.classList.remove('hidden');
updateHud();
requestAnimationFrame((timestamp) => {
  gameState.lastTimestamp = timestamp;
  update(timestamp);
});
