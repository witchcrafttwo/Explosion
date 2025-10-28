import { v4 as uuid } from "uuid";
import {
  ARENA,
  BULLET_RADIUS,
  BULLET_SPEED,
  GRENADE_COOLDOWN,
  GRENADE_SPEED,
  HOMING_COOLDOWN,
  HOMING_SPEED,
  MATCH_DURATION,
  MAX_HP,
  PAINT_GRID_COLS,
  PAINT_GRID_ROWS,
  PAINT_RADIUS_GRENADE,
  PAINT_RADIUS_HOMING,
  PAINT_RADIUS_NORMAL,
  PLAYER_SPEED,
  SKILL_COOLDOWN,
  SKILL_DURATION,
  TANK_RADIUS,
} from "./gameConstants.js";

const TWO_PI = Math.PI * 2;
const MAX_BULLET_BOUNCES = 1;
const PAINT_PATCH_LIMIT = 320;

export class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.bullets = new Map();
    this.lastTick = Date.now();
    this.skillReady = new Set();
    this.matchOver = false;
    this.countdownHandles = [];
    this.readyPlayers = new Set();
    this.phase = "waiting";
    this.paintGrid = createPaintGrid();
    this.paintCounts = new Map();
    this.paintPatches = [];
    this.totalPaintCells = PAINT_GRID_COLS * PAINT_GRID_ROWS;
    this.obstacles = [];
    this.matchStartTime = 0;
    this.paintCellWidth = (ARENA.width - ARENA.padding * 2) / PAINT_GRID_COLS;
    this.paintCellHeight = (ARENA.height - ARENA.padding * 2) / PAINT_GRID_ROWS;
  }

  addPlayer(connection) {
    const player = {
      id: connection.id,
      connection,
      x: this.players.size === 0 ? ARENA.padding + 100 : ARENA.width - ARENA.padding - 100,
      y: ARENA.height / 2,
      bodyAngle: 0,
      turretAngle: 0,
      hp: MAX_HP,
      input: createEmptyInput(),
      lastShot: 0,
      isSkillActive: false,
      skillActivatedAt: 0,
      lastSkillUse: 0,
      lastGrenade: 0,
      lastHoming: 0,
    };
    this.players.set(connection.id, player);
    this.readyPlayers.delete(connection.id);
    this.cancelCountdown();
    if (this.players.size >= 2) {
      this.prepareLobby();
      this.phase = "ready";
    } else {
      this.phase = "waiting";
      this.matchOver = false;
      this.skillReady.clear();
    }
    this.broadcastMatchStatus();
  }

  removePlayer(id) {
    this.players.delete(id);
    this.bullets.clear();
    this.matchOver = false;
    this.readyPlayers.delete(id);
    this.cancelCountdown();
    if (this.players.size >= 2) {
      this.phase = "ready";
      this.prepareLobby();
    } else {
      this.phase = "waiting";
      this.prepareLobby();
    }
    this.broadcastMatchStatus();
  }

  handleInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player) return;
    player.input = { ...player.input, ...sanitizeInput(input) };
  }

  handleSkill(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== "active") return;
    const now = Date.now();
    const ready = this.skillReady.has(playerId) || now - player.lastSkillUse >= SKILL_COOLDOWN;
    if (!ready) return;
    player.isSkillActive = true;
    player.skillActivatedAt = now;
    player.lastSkillUse = now;
    this.skillReady.delete(playerId);
    this.send(playerId, { type: "skillConsumed" });
  }

  handleGrenade(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== "active") return;
    const now = Date.now();
    if (now - player.lastGrenade < GRENADE_COOLDOWN) return;
    player.lastGrenade = now;
    this.spawnGrenade(player);
  }

  handleHoming(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.phase !== "active") return;
    const now = Date.now();
    if (now - player.lastHoming < HOMING_COOLDOWN) return;
    player.lastHoming = now;
    this.spawnHoming(player);
  }

  handleRestart(playerId) {
    if (this.players.size < 2) return;
    if (this.phase !== "finished" && this.phase !== "ready") return;
    this.handleReady(playerId, true);
  }

  handleReady(playerId, ready) {
    if (!this.players.has(playerId)) return;
    if (this.players.size < 2) return;
    if (this.phase === "countdown") return;
    if (this.phase !== "ready" && this.phase !== "finished") return;
    if (!ready) {
      this.readyPlayers.delete(playerId);
    } else {
      this.readyPlayers.add(playerId);
    }
    this.broadcastMatchStatus();
    if (this.readyPlayers.size === this.players.size && this.players.size === 2) {
      this.startCountdown();
    }
  }

  startCountdown() {
    if (this.countdownHandles.length > 0) return;
    this.phase = "countdown";
    this.broadcastMatchStatus();
    const steps = [3, 2, 1, "START!"];
    this.countdownHandles = steps.map((step, index) =>
      setTimeout(() => {
        this.broadcast({ type: "countdown", payload: { value: step } });
        if (step === "START!") {
          this.beginMatch();
          const hideHandle = setTimeout(() => {
            this.broadcast({ type: "countdown", payload: { value: null } });
            this.countdownHandles = [];
          }, 800);
          this.countdownHandles.push(hideHandle);
        }
      }, index * 1000)
    );
  }

  beginMatch() {
    this.obstacles = generateObstacles();
    this.resetPlayersToSpawn();
    this.bullets.clear();
    this.skillReady.clear();
    this.matchOver = false;
    this.phase = "active";
    this.readyPlayers.clear();
    this.resetPaintField();
    this.matchStartTime = Date.now();
    this.players.forEach((player) => {
      this.send(player.id, { type: "skillConsumed" });
    });
    this.broadcast({ type: "state", payload: this.serialize() });
    this.broadcastMatchStatus();
  }

  cancelCountdown() {
    if (!this.countdownHandles.length) return;
    this.countdownHandles.forEach((handle) => clearTimeout(handle));
    this.countdownHandles = [];
    this.broadcast({ type: "countdown", payload: { value: null } });
  }

  prepareLobby() {
    this.resetPlayersToSpawn();
    this.bullets.clear();
    this.readyPlayers.clear();
    this.skillReady.clear();
    this.matchStartTime = 0;
    this.resetPaintField();
    this.obstacles = [];
    this.players.forEach((player) => {
      this.send(player.id, { type: "skillConsumed" });
    });
    this.broadcast({ type: "state", payload: this.serialize() });
  }

  update() {
    const now = Date.now();
    const delta = Math.min((now - this.lastTick) / 1000, 0.05);
    this.lastTick = now;
    if (this.players.size < 1) return;

    this.players.forEach((player) => {
      this.applyInput(player, delta);
      this.cooldownSkill(player);
    });

    this.updateBullets(delta);
    this.checkCollisions();
    this.checkOutcome();
    this.broadcast({ type: "state", payload: this.serialize() });
  }

  applyInput(player, delta) {
    const { up, down, left, right, shooting, aimX, aimY } = player.input;
    const moveX = (right ? 1 : 0) - (left ? 1 : 0);
    const moveY = (down ? 1 : 0) - (up ? 1 : 0);
    const length = Math.hypot(moveX, moveY) || 1;
    const prevX = player.x;
    const prevY = player.y;
    player.x += (moveX / length) * PLAYER_SPEED * delta;
    player.y += (moveY / length) * PLAYER_SPEED * delta;

    const dx = aimX - player.x;
    const dy = aimY - player.y;
    const angle = Math.atan2(dy, dx);
    player.turretAngle = normalizeAngle(angle);
    if (moveX !== 0 || moveY !== 0) {
      player.bodyAngle = Math.atan2(moveY, moveX);
    }

    this.constrainPlayer(player);
    if (this.collidesWithObstacles(player.x, player.y, TANK_RADIUS)) {
      player.x = prevX;
      player.y = prevY;
    }

    const now = Date.now();
    const fireDelay = player.isSkillActive ? 150 : 350;
    if (this.phase === "active" && shooting && now - player.lastShot > fireDelay) {
      this.spawnBullet(player);
      player.lastShot = now;
    }
  }

  constrainPlayer(player) {
    const minX = ARENA.padding + TANK_RADIUS;
    const maxX = ARENA.width - ARENA.padding - TANK_RADIUS;
    const minY = ARENA.padding + TANK_RADIUS;
    const maxY = ARENA.height - ARENA.padding - TANK_RADIUS;
    player.x = clamp(player.x, minX, maxX);
    player.y = clamp(player.y, minY, maxY);
  }

  collidesWithObstacles(x, y, radius) {
    return this.obstacles.some((obstacle) => circleRectCollision(x, y, radius, obstacle));
  }

  cooldownSkill(player) {
    if (!player.isSkillActive) {
      const now = Date.now();
      if (now - player.lastSkillUse >= SKILL_COOLDOWN) {
        if (!this.skillReady.has(player.id)) {
          this.skillReady.add(player.id);
          this.send(player.id, { type: "skillReady" });
        }
      }
      return;
    }

    if (Date.now() - player.skillActivatedAt > SKILL_DURATION) {
      player.isSkillActive = false;
    }
  }

  spawnBullet(player) {
    const speed = player.isSkillActive ? BULLET_SPEED * 1.4 : BULLET_SPEED;
    const vx = Math.cos(player.turretAngle) * speed;
    const vy = Math.sin(player.turretAngle) * speed;
    const bullet = {
      id: uuid(),
      owner: player.id,
      x: player.x + Math.cos(player.turretAngle) * (TANK_RADIUS + 10),
      y: player.y + Math.sin(player.turretAngle) * (TANK_RADIUS + 10),
      vx,
      vy,
      bounces: 0,
      createdAt: Date.now(),
      type: "normal",
      pendingPaintAt: null,
      lastBounceAt: 0,
    };
    this.bullets.set(bullet.id, bullet);
  }

  spawnGrenade(player) {
    const vx = Math.cos(player.turretAngle) * GRENADE_SPEED;
    const vy = Math.sin(player.turretAngle) * GRENADE_SPEED;
    const bullet = {
      id: uuid(),
      owner: player.id,
      x: player.x + Math.cos(player.turretAngle) * (TANK_RADIUS + 12),
      y: player.y + Math.sin(player.turretAngle) * (TANK_RADIUS + 12),
      vx,
      vy,
      bounces: 0,
      createdAt: Date.now(),
      type: "grenade",
      explodeAt: Date.now() + 1400,
    };
    this.bullets.set(bullet.id, bullet);
  }

  spawnHoming(player) {
    const target = Array.from(this.players.values()).find((p) => p.id !== player.id);
    const angle = target ? Math.atan2(target.y - player.y, target.x - player.x) : player.turretAngle;
    const vx = Math.cos(angle) * HOMING_SPEED;
    const vy = Math.sin(angle) * HOMING_SPEED;
    const bullet = {
      id: uuid(),
      owner: player.id,
      x: player.x + Math.cos(angle) * (TANK_RADIUS + 10),
      y: player.y + Math.sin(angle) * (TANK_RADIUS + 10),
      vx,
      vy,
      bounces: 0,
      createdAt: Date.now(),
      type: "homing",
      targetId: target?.id || null,
    };
    this.bullets.set(bullet.id, bullet);
  }

  updateBullets(delta) {
    const bounds = {
      minX: ARENA.padding,
      maxX: ARENA.width - ARENA.padding,
      minY: ARENA.padding,
      maxY: ARENA.height - ARENA.padding,
    };
    const now = Date.now();

    this.bullets.forEach((bullet, id) => {
      const prevX = bullet.x;
      const prevY = bullet.y;

      if (bullet.type === "homing") {
        this.adjustHomingVelocity(bullet, delta);
      }

      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;

      let bounced = false;

      if (bullet.x <= bounds.minX + BULLET_RADIUS || bullet.x >= bounds.maxX - BULLET_RADIUS) {
        if (bullet.type === "grenade") {
          this.explodeGrenade(id, bullet);
          return;
        }
        if (bullet.type === "normal" && bullet.bounces >= MAX_BULLET_BOUNCES) {
          this.bullets.delete(id);
          return;
        }
        bullet.vx *= -1;
        bullet.x = clamp(bullet.x, bounds.minX + BULLET_RADIUS, bounds.maxX - BULLET_RADIUS);
        if (bullet.type === "normal") {
          bullet.bounces += 1;
          bounced = true;
        }
      }
      if (bullet.y <= bounds.minY + BULLET_RADIUS || bullet.y >= bounds.maxY - BULLET_RADIUS) {
        if (bullet.type === "grenade") {
          this.explodeGrenade(id, bullet);
          return;
        }
        if (bullet.type === "normal" && bullet.bounces >= MAX_BULLET_BOUNCES) {
          this.bullets.delete(id);
          return;
        }
        bullet.vy *= -1;
        bullet.y = clamp(bullet.y, bounds.minY + BULLET_RADIUS, bounds.maxY - BULLET_RADIUS);
        if (bullet.type === "normal") {
          bullet.bounces += 1;
          bounced = true;
        }
      }

      if (bullet.type !== "grenade") {
        for (const obstacle of this.obstacles) {
          if (!circleRectCollision(bullet.x, bullet.y, BULLET_RADIUS, obstacle)) {
            continue;
          }
          if (bullet.type === "normal" && bullet.bounces >= MAX_BULLET_BOUNCES) {
            this.bullets.delete(id);
            return;
          }
          if (bullet.type === "grenade") {
            this.explodeGrenade(id, bullet);
            return;
          }
          const reflected = reflectBulletFromRect(bullet, obstacle, prevX, prevY);
          if (!reflected) {
            this.bullets.delete(id);
            return;
          }
          if (bullet.type === "normal") {
            bullet.bounces += 1;
            bounced = true;
          }
          break;
        }
      } else {
        for (const obstacle of this.obstacles) {
          if (circleRectCollision(bullet.x, bullet.y, BULLET_RADIUS, obstacle)) {
            this.explodeGrenade(id, bullet);
            return;
          }
        }
      }

      if (bullet.type === "normal") {
        if (bounced && !bullet.pendingPaintAt) {
          bullet.pendingPaintAt = now + 1500;
        }
        if (bullet.pendingPaintAt && now >= bullet.pendingPaintAt) {
          this.applyPaint(bullet.owner, bullet.x, bullet.y, PAINT_RADIUS_NORMAL);
          this.bullets.delete(id);
          return;
        }
        if (now - bullet.createdAt > 7000) {
          this.bullets.delete(id);
        }
      } else if (bullet.type === "grenade") {
        if (now >= bullet.explodeAt) {
          this.explodeGrenade(id, bullet);
        }
      } else if (bullet.type === "homing") {
        if (now - bullet.createdAt > 6000) {
          this.bullets.delete(id);
        }
      }
    });
  }

  adjustHomingVelocity(bullet, delta) {
    let target = bullet.targetId ? this.players.get(bullet.targetId) : null;
    if (!target || target.hp <= 0) {
      target = Array.from(this.players.values()).find((p) => p.id !== bullet.owner && p.hp > 0);
      bullet.targetId = target?.id ?? null;
    }
    if (!target) return;

    const desiredAngle = Math.atan2(target.y - bullet.y, target.x - bullet.x);
    const currentAngle = Math.atan2(bullet.vy, bullet.vx);
    const diff = shortestAngleDiff(desiredAngle, currentAngle);
    const maxTurn = Math.PI * delta * 1.2;
    const turn = clamp(diff, -maxTurn, maxTurn);
    const newAngle = currentAngle + turn;
    bullet.vx = Math.cos(newAngle) * HOMING_SPEED;
    bullet.vy = Math.sin(newAngle) * HOMING_SPEED;
  }

  explodeGrenade(id, bullet) {
    if (!this.bullets.has(id)) return;
    this.bullets.delete(id);
    this.applyPaint(bullet.owner, bullet.x, bullet.y, PAINT_RADIUS_GRENADE);
    const damage = 34;
    this.players.forEach((player) => {
      if (player.id === bullet.owner || player.hp <= 0) return;
      const dist = Math.hypot(player.x - bullet.x, player.y - bullet.y);
      if (dist <= PAINT_RADIUS_GRENADE) {
        const falloff = clamp(1 - dist / PAINT_RADIUS_GRENADE, 0.3, 1);
        player.hp = Math.max(0, player.hp - Math.round(damage * falloff));
      }
    });
  }

  applyPaint(ownerId, x, y, radius) {
    if (!ownerId) return;
    this.recordPaintPatch(ownerId, x, y, radius);
    const cellHalfWidth = this.paintCellWidth / 2;
    const cellHalfHeight = this.paintCellHeight / 2;
    const minX = ARENA.padding;
    const minY = ARENA.padding;
    const maxCol = PAINT_GRID_COLS - 1;
    const maxRow = PAINT_GRID_ROWS - 1;
    const startCol = clamp(Math.floor((x - radius - minX) / this.paintCellWidth), 0, maxCol);
    const endCol = clamp(Math.floor((x + radius - minX) / this.paintCellWidth), 0, maxCol);
    const startRow = clamp(Math.floor((y - radius - minY) / this.paintCellHeight), 0, maxRow);
    const endRow = clamp(Math.floor((y + radius - minY) / this.paintCellHeight), 0, maxRow);

    for (let row = startRow; row <= endRow; row += 1) {
      for (let col = startCol; col <= endCol; col += 1) {
        const centerX = minX + col * this.paintCellWidth + cellHalfWidth;
        const centerY = minY + row * this.paintCellHeight + cellHalfHeight;
        if (Math.hypot(centerX - x, centerY - y) > radius) continue;
        const prevOwner = this.paintGrid[row][col];
        if (prevOwner === ownerId) continue;
        if (prevOwner) {
          const prevCount = this.paintCounts.get(prevOwner) || 0;
          this.paintCounts.set(prevOwner, Math.max(0, prevCount - 1));
        }
        this.paintGrid[row][col] = ownerId;
        this.paintCounts.set(ownerId, (this.paintCounts.get(ownerId) || 0) + 1);
      }
    }
  }

  recordPaintPatch(ownerId, x, y, radius) {
    this.paintPatches.push({
      id: uuid(),
      owner: ownerId,
      x: round(x),
      y: round(y),
      radius: round(radius),
      createdAt: Date.now(),
    });
    if (this.paintPatches.length > PAINT_PATCH_LIMIT) {
      this.paintPatches.splice(0, this.paintPatches.length - PAINT_PATCH_LIMIT);
    }
  }

  resetPaintField() {
    this.paintGrid = createPaintGrid();
    this.paintCounts.clear();
    this.paintPatches = [];
  }

  getPaintStats() {
    return Array.from(this.players.values()).map((player) => ({
      playerId: player.id,
      coverage: this.totalPaintCells
        ? (this.paintCounts.get(player.id) || 0) / this.totalPaintCells
        : 0,
    }));
  }

  checkCollisions() {
    for (const [id, bullet] of Array.from(this.bullets.entries())) {
      for (const player of this.players.values()) {
        if (player.id === bullet.owner || player.hp <= 0) continue;
        const dist = Math.hypot(player.x - bullet.x, player.y - bullet.y);
        if (dist >= TANK_RADIUS + BULLET_RADIUS) continue;

        if (bullet.type === "grenade") {
          this.explodeGrenade(id, bullet);
          break;
        }

        if (bullet.type === "homing") {
          player.hp = Math.max(0, player.hp - 26);
          this.applyPaint(bullet.owner, bullet.x, bullet.y, PAINT_RADIUS_HOMING);
          this.bullets.delete(id);
          break;
        }

        const owner = this.players.get(bullet.owner);
        const damage = owner?.isSkillActive ? 35 : 20;
        player.hp = Math.max(0, player.hp - damage);
        this.bullets.delete(id);
        break;
      }
    }
  }

  checkOutcome() {
    if (this.phase !== "active" || this.matchOver) return;
    const now = Date.now();
    const timeElapsed = this.matchStartTime ? now - this.matchStartTime : 0;
    const livingPlayers = Array.from(this.players.values()).filter((p) => p.hp > 0);
    if (timeElapsed >= MATCH_DURATION || livingPlayers.length <= 1) {
      this.finishMatch();
    }
  }

  finishMatch() {
    if (this.matchOver) return;
    this.matchOver = true;
    this.phase = "finished";
    this.readyPlayers.clear();
    this.bullets.clear();
    const results = this.calculateResults();
    this.matchStartTime = 0;
    this.players.forEach((player) => {
      let result = "draw";
      if (results.winner) {
        result = results.winner === player.id ? "win" : "lose";
      }
      this.send(player.id, {
        type: "outcome",
        payload: { result, scores: results.scores },
      });
    });
    this.broadcast({ type: "state", payload: this.serialize() });
    this.broadcastMatchStatus();
  }

  calculateResults() {
    const stats = this.getPaintStats();
    const coverageMap = new Map(stats.map((entry) => [entry.playerId, entry.coverage]));
    const scores = [];
    let bestScore = -Infinity;
    let winner = null;
    let tie = false;

    this.players.forEach((player) => {
      const coverage = coverageMap.get(player.id) || 0;
      const hpRatio = Math.max(0, player.hp) / MAX_HP;
      const total = coverage + hpRatio;
      scores.push({ playerId: player.id, coverage, hpRatio, total });
      if (total > bestScore + 1e-3) {
        bestScore = total;
        winner = player.id;
        tie = false;
      } else if (Math.abs(total - bestScore) <= 1e-3) {
        tie = true;
      }
    });

    if (tie) {
      winner = null;
    }

    return { winner, scores };
  }

  serialize() {
    const now = Date.now();
    return {
      roomId: this.id,
      players: Array.from(this.players.values()).map((player) => ({
        id: player.id,
        x: round(player.x),
        y: round(player.y),
        bodyAngle: round(player.bodyAngle),
        turretAngle: round(player.turretAngle),
        hp: Math.round(player.hp),
        isSkillActive: player.isSkillActive,
        grenadeCooldown: Math.max(0, GRENADE_COOLDOWN - (now - player.lastGrenade)),
        homingCooldown: Math.max(0, HOMING_COOLDOWN - (now - player.lastHoming)),
        grenadeMax: GRENADE_COOLDOWN,
        homingMax: HOMING_COOLDOWN,
      })),
      bullets: Array.from(this.bullets.values()).map((bullet) => ({
        id: bullet.id,
        x: round(bullet.x),
        y: round(bullet.y),
        owner: bullet.owner,
        type: bullet.type,
      })),
      paint: {
        patches: this.paintPatches.slice(),
        stats: this.getPaintStats(),
      },
      obstacles: this.obstacles.map((obstacle) => ({
        x: round(obstacle.x),
        y: round(obstacle.y),
        width: round(obstacle.width),
        height: round(obstacle.height),
      })),
      matchTimeRemaining:
        this.phase === "active" && this.matchStartTime
          ? Math.max(0, MATCH_DURATION - (now - this.matchStartTime))
          : 0,
    };
  }

  broadcast(message) {
    this.players.forEach((player) => this.send(player.id, message));
  }

  send(playerId, message) {
    const player = this.players.get(playerId);
    player?.connection.send(JSON.stringify(message));
  }

  broadcastMatchStatus() {
    const players = Array.from(this.players.values()).map((player) => ({
      id: player.id,
      ready: this.readyPlayers.has(player.id),
    }));
    this.broadcast({ type: "matchStatus", payload: { phase: this.phase, players } });
  }

  resetPlayersToSpawn() {
    const positions = [
      { x: ARENA.padding + 100, y: ARENA.height / 2 },
      { x: ARENA.width - ARENA.padding - 100, y: ARENA.height / 2 },
    ];
    let index = 0;
    this.players.forEach((player) => {
      Object.assign(player, {
        x: positions[index % positions.length].x,
        y: positions[index % positions.length].y,
        bodyAngle: 0,
        turretAngle: 0,
        hp: MAX_HP,
        input: createEmptyInput(),
        lastShot: 0,
        isSkillActive: false,
        skillActivatedAt: 0,
        lastGrenade: Date.now() - GRENADE_COOLDOWN,
        lastHoming: Date.now() - HOMING_COOLDOWN,
      });
      index += 1;
    });
  }
}

function createEmptyInput() {
  return {
    up: false,
    down: false,
    left: false,
    right: false,
    shooting: false,
    aimX: ARENA.width / 2,
    aimY: ARENA.height / 2,
  };
}

function createPaintGrid() {
  return Array.from({ length: PAINT_GRID_ROWS }, () => Array(PAINT_GRID_COLS).fill(null));
}

function sanitizeInput(input) {
  return {
    up: Boolean(input.up),
    down: Boolean(input.down),
    left: Boolean(input.left),
    right: Boolean(input.right),
    shooting: Boolean(input.shooting),
    aimX: clamp(Number(input.aimX) || 0, 0, ARENA.width),
    aimY: clamp(Number(input.aimY) || 0, 0, ARENA.height),
  };
}

function circleRectCollision(cx, cy, radius, rect) {
  const nearestX = clamp(cx, rect.x, rect.x + rect.width);
  const nearestY = clamp(cy, rect.y, rect.y + rect.height);
  const dx = cx - nearestX;
  const dy = cy - nearestY;
  return dx * dx + dy * dy <= radius * radius;
}

function reflectBulletFromRect(bullet, rect, prevX, prevY) {
  const expanded = {
    left: rect.x - BULLET_RADIUS,
    right: rect.x + rect.width + BULLET_RADIUS,
    top: rect.y - BULLET_RADIUS,
    bottom: rect.y + rect.height + BULLET_RADIUS,
  };
  let reflected = false;

  if (prevX <= expanded.left && bullet.x > expanded.left) {
    bullet.vx = Math.abs(bullet.vx);
    bullet.x = expanded.left;
    reflected = true;
  } else if (prevX >= expanded.right && bullet.x < expanded.right) {
    bullet.vx = -Math.abs(bullet.vx);
    bullet.x = expanded.right;
    reflected = true;
  }

  if (prevY <= expanded.top && bullet.y > expanded.top) {
    bullet.vy = Math.abs(bullet.vy);
    bullet.y = expanded.top;
    reflected = true;
  } else if (prevY >= expanded.bottom && bullet.y < expanded.bottom) {
    bullet.vy = -Math.abs(bullet.vy);
    bullet.y = expanded.bottom;
    reflected = true;
  }

  if (!reflected) {
    const centerX = rect.x + rect.width / 2;
    const centerY = rect.y + rect.height / 2;
    const dx = bullet.x - centerX;
    const dy = bullet.y - centerY;
    if (Math.abs(dx) * rect.height > Math.abs(dy) * rect.width) {
      if (dx > 0) {
        bullet.vx = Math.abs(bullet.vx);
        bullet.x = expanded.right;
      } else {
        bullet.vx = -Math.abs(bullet.vx);
        bullet.x = expanded.left;
      }
    } else {
      if (dy > 0) {
        bullet.vy = Math.abs(bullet.vy);
        bullet.y = expanded.bottom;
      } else {
        bullet.vy = -Math.abs(bullet.vy);
        bullet.y = expanded.top;
      }
    }
    reflected = true;
  }

  return reflected;
}

function shortestAngleDiff(target, source) {
  let diff = target - source;
  while (diff < -Math.PI) diff += TWO_PI;
  while (diff > Math.PI) diff -= TWO_PI;
  return diff;
}

const FIELD_WIDTH = ARENA.width - ARENA.padding * 2;
const FIELD_HEIGHT = ARENA.height - ARENA.padding * 2;

const OBSTACLE_TEMPLATES = [
  [
    { x: 0.5, y: 0.3, width: 0.42, height: 0.07 },
    { x: 0.5, y: 0.55, width: 0.08, height: 0.38 },
    { x: 0.25, y: 0.55, width: 0.08, height: 0.32 },
    { x: 0.75, y: 0.55, width: 0.08, height: 0.32 },
  ],
  [
    { x: 0.5, y: 0.35, width: 0.5, height: 0.06 },
    { x: 0.3, y: 0.55, width: 0.09, height: 0.36 },
    { x: 0.7, y: 0.55, width: 0.09, height: 0.36 },
    { x: 0.5, y: 0.7, width: 0.18, height: 0.08 },
  ],
  [
    { x: 0.5, y: 0.5, width: 0.08, height: 0.46 },
    { x: 0.32, y: 0.5, width: 0.08, height: 0.4 },
    { x: 0.68, y: 0.5, width: 0.08, height: 0.4 },
    { x: 0.5, y: 0.32, width: 0.26, height: 0.08 },
    { x: 0.5, y: 0.68, width: 0.26, height: 0.08 },
  ],
];

function generateObstacles() {
  const template = OBSTACLE_TEMPLATES[Math.floor(Math.random() * OBSTACLE_TEMPLATES.length)];
  const mirror = Math.random() < 0.5;
  return template.map((rect) => rectFromTemplate(rect, mirror));
}

function rectFromTemplate(rect, mirror) {
  const width = rect.width * FIELD_WIDTH;
  const height = rect.height * FIELD_HEIGHT;
  const xNorm = mirror ? 1 - rect.x : rect.x;
  const x = ARENA.padding + xNorm * FIELD_WIDTH - width / 2;
  const y = ARENA.padding + rect.y * FIELD_HEIGHT - height / 2;
  return { x, y, width, height };
}

function normalizeAngle(angle) {
  let normalized = angle % TWO_PI;
  if (normalized < 0) normalized += TWO_PI;
  return normalized;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
