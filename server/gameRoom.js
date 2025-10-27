import { v4 as uuid } from "uuid";
import {
  ARENA,
  BULLET_RADIUS,
  BULLET_SPEED,
  MAX_HP,
  PLAYER_SPEED,
  SKILL_COOLDOWN,
  SKILL_DURATION,
  TANK_RADIUS,
} from "./gameConstants.js";

const TWO_PI = Math.PI * 2;

export class GameRoom {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.bullets = new Map();
    this.lastTick = Date.now();
    this.skillReady = new Set();
    this.matchOver = false;
    this.countdownHandles = [];
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
    };
    this.players.set(connection.id, player);
    this.broadcast({ type: "matchmaking", payload: { waiting: this.players.size < 2 } });
    if (this.players.size === 2) {
      this.skillReady.clear();
      this.players.forEach((p) => (p.hp = MAX_HP));
      this.matchOver = false;
    }
  }

  removePlayer(id) {
    this.players.delete(id);
    this.bullets.clear();
    this.matchOver = false;
    this.cancelCountdown();
    this.broadcast({ type: "matchmaking", payload: { waiting: true } });
    this.broadcast({ type: "state", payload: this.serialize() });
  }

  handleInput(playerId, input) {
    const player = this.players.get(playerId);
    if (!player || this.matchOver) return;
    player.input = { ...player.input, ...sanitizeInput(input) };
  }

  handleSkill(playerId) {
    const player = this.players.get(playerId);
    if (!player || this.matchOver) return;
    const now = Date.now();
    const ready = this.skillReady.has(playerId) || now - player.lastSkillUse >= SKILL_COOLDOWN;
    if (!ready) return;
    player.isSkillActive = true;
    player.skillActivatedAt = now;
    player.lastSkillUse = now;
    this.skillReady.delete(playerId);
    this.send(playerId, { type: "skillConsumed" });
  }

  handleRestart(playerId) {
    if (this.players.size < 2) return;
    if (!this.matchOver) return;
    if (this.countdownHandles.length > 0) return;
    this.startRestartCountdown();
  }

  resetMatch() {
    const positions = [
      { x: ARENA.padding + 100, y: ARENA.height / 2 },
      { x: ARENA.width - ARENA.padding - 100, y: ARENA.height / 2 },
    ];
    let index = 0;
    this.players.forEach((player) => {
      Object.assign(player, {
        x: positions[index].x,
        y: positions[index].y,
        bodyAngle: 0,
        turretAngle: 0,
        hp: MAX_HP,
        input: createEmptyInput(),
        lastShot: 0,
        isSkillActive: false,
        skillActivatedAt: 0,
      });
      index += 1;
    });
    this.bullets.clear();
    this.matchOver = false;
    this.skillReady.clear();
    this.broadcast({ type: "state", payload: this.serialize() });
    this.broadcast({ type: "matchmaking", payload: { waiting: false } });
  }

  startRestartCountdown() {
    const steps = [3, 2, 1, "START!"];
    this.countdownHandles = steps.map((step, index) =>
      setTimeout(() => {
        this.broadcast({ type: "countdown", payload: { value: step } });
        if (step === "START!") {
          this.resetMatch();
          const hideHandle = setTimeout(() => {
            this.broadcast({ type: "countdown", payload: { value: null } });
            this.countdownHandles = [];
          }, 800);
          this.countdownHandles.push(hideHandle);
        }
      }, index * 1000)
    );
  }

  cancelCountdown() {
    if (!this.countdownHandles.length) return;
    this.countdownHandles.forEach((handle) => clearTimeout(handle));
    this.countdownHandles = [];
    this.broadcast({ type: "countdown", payload: { value: null } });
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

    const now = Date.now();
    const fireDelay = player.isSkillActive ? 150 : 350;
    if (shooting && now - player.lastShot > fireDelay) {
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

    this.bullets.forEach((bullet, id) => {
      bullet.x += bullet.vx * delta;
      bullet.y += bullet.vy * delta;

      let bounced = false;
      if (bullet.x <= bounds.minX + BULLET_RADIUS || bullet.x >= bounds.maxX - BULLET_RADIUS) {
        if (bullet.bounces >= 1) {
          this.bullets.delete(id);
          return;
        }
        bullet.vx *= -1;
        bullet.x = clamp(bullet.x, bounds.minX + BULLET_RADIUS, bounds.maxX - BULLET_RADIUS);
        bullet.bounces += 1;
        bounced = true;
      }
      if (bullet.y <= bounds.minY + BULLET_RADIUS || bullet.y >= bounds.maxY - BULLET_RADIUS) {
        if (bullet.bounces >= 1) {
          this.bullets.delete(id);
          return;
        }
        bullet.vy *= -1;
        bullet.y = clamp(bullet.y, bounds.minY + BULLET_RADIUS, bounds.maxY - BULLET_RADIUS);
        bullet.bounces += 1;
        bounced = true;
      }

      if (!bounced && (Date.now() - bullet.createdAt > 7000)) {
        this.bullets.delete(id);
      }
    });
  }

  checkCollisions() {
    this.bullets.forEach((bullet, id) => {
      this.players.forEach((player) => {
        if (player.id === bullet.owner) return;
        if (player.hp <= 0) return;
        const dist = Math.hypot(player.x - bullet.x, player.y - bullet.y);
        if (dist < TANK_RADIUS + BULLET_RADIUS) {
          const damage = this.players.get(bullet.owner)?.isSkillActive ? 35 : 20;
          player.hp = Math.max(0, player.hp - damage);
          this.bullets.delete(id);
        }
      });
    });
  }

  checkOutcome() {
    if (this.matchOver) return;
    const livingPlayers = Array.from(this.players.values()).filter((p) => p.hp > 0);
    if (livingPlayers.length >= 2) return;
    this.matchOver = true;
    this.bullets.clear();
    this.players.forEach((player) => {
      const result = player.hp > 0 ? "win" : "lose";
      this.send(player.id, { type: "outcome", payload: { result } });
    });
  }

  serialize() {
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
      })),
      bullets: Array.from(this.bullets.values()).map((bullet) => ({
        id: bullet.id,
        x: round(bullet.x),
        y: round(bullet.y),
      })),
    };
  }

  broadcast(message) {
    this.players.forEach((player) => this.send(player.id, message));
  }

  send(playerId, message) {
    const player = this.players.get(playerId);
    player?.connection.send(JSON.stringify(message));
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
