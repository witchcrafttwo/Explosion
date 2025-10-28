const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 600;
const TANK_RADIUS = 22;
const BULLET_RADIUS = 6;

function colorWithAlpha(hex, alpha) {
  const sanitized = hex.replace("#", "");
  const value = parseInt(sanitized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export class Renderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.lastTimestamp = 0;
    this.boundRender = (timestamp) => this.render(timestamp);
  }

  start() {
    requestAnimationFrame(this.boundRender);
  }

  render(timestamp) {
    const ctx = this.ctx;
    this.lastTimestamp = timestamp;
    ctx.clearRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    this.drawBackground(ctx);
    this.drawPaint(ctx);
    this.drawObstacles(ctx);
    this.drawPlayers(ctx);
    this.drawBullets(ctx);
    requestAnimationFrame(this.boundRender);
  }

  drawBackground(ctx) {
    ctx.save();
    ctx.fillStyle = "#0a1423";
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);
    ctx.strokeStyle = "rgba(89, 205, 255, 0.2)";
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, ARENA_WIDTH - 40, ARENA_HEIGHT - 40);

    const gridSize = 60;
    ctx.strokeStyle = "rgba(84, 145, 230, 0.12)";
    ctx.lineWidth = 1;
    for (let x = 40; x < ARENA_WIDTH - 40; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 40);
      ctx.lineTo(x, ARENA_HEIGHT - 40);
      ctx.stroke();
    }
    for (let y = 40; y < ARENA_HEIGHT - 40; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(40, y);
      ctx.lineTo(ARENA_WIDTH - 40, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPaint(ctx) {
    ctx.save();
    this.state.paintPatches.forEach((patch) => {
      const color = this.getPlayerColor(patch.owner);
      if (!color) return;
      const radius = patch.radius || 40;
      const gradient = ctx.createRadialGradient(patch.x, patch.y, radius * 0.2, patch.x, patch.y, radius);
      gradient.addColorStop(0, colorWithAlpha(color, 0.45));
      gradient.addColorStop(1, colorWithAlpha(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(patch.x, patch.y, radius, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  drawObstacles(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(22, 33, 52, 0.88)";
    ctx.strokeStyle = "rgba(90, 140, 220, 0.35)";
    ctx.lineWidth = 2;
    this.state.obstacles.forEach((obstacle) => {
      if (typeof ctx.roundRect === "function") {
        ctx.beginPath();
        ctx.roundRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height, 12);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        ctx.strokeRect(obstacle.x, obstacle.y, obstacle.width, obstacle.height);
      }
    });
    ctx.restore();
  }

  drawPlayers(ctx) {
    const players = this.state.players;
    const localId = this.state.playerId;
    players.forEach((player) => {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.bodyAngle);
      const bodyGradient = ctx.createLinearGradient(-TANK_RADIUS, 0, TANK_RADIUS, 0);
      const baseColor = player.id === localId ? "#5fffd7" : "#58a7ff";
      bodyGradient.addColorStop(0, `${baseColor}99`);
      bodyGradient.addColorStop(1, `${baseColor}`);
      ctx.fillStyle = bodyGradient;
      ctx.strokeStyle = "rgba(7, 26, 39, 0.6)";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-TANK_RADIUS, -TANK_RADIUS, TANK_RADIUS * 2, TANK_RADIUS * 2, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(12, 22, 33, 0.85)";
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.rotate(player.turretAngle - player.bodyAngle);
      ctx.fillStyle = baseColor;
      ctx.fillRect(-6, -6, TANK_RADIUS + 14, 12);

      ctx.restore();

      ctx.save();
      ctx.fillStyle = "rgba(15, 32, 52, 0.7)";
      ctx.fillRect(player.x - 26, player.y - TANK_RADIUS - 16, 52, 8);
      ctx.fillStyle = "#3ff0ff";
      const hpWidth = Math.max(0, (player.hp / 100) * 52);
      ctx.fillRect(player.x - 26, player.y - TANK_RADIUS - 16, hpWidth, 8);
      ctx.restore();

      if (player.isSkillActive) {
        ctx.save();
        ctx.strokeStyle = `${player.id === localId ? "#47ffd1" : "#5c91ff"}`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        const radius = TANK_RADIUS + 18 + 6 * Math.sin(performance.now() / 100);
        ctx.arc(player.x, player.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    });
  }

  drawBullets(ctx) {
    ctx.save();
    this.state.bullets.forEach((bullet) => {
      let radius = BULLET_RADIUS;
      if (bullet.type === "grenade") {
        radius += 2;
      } else if (bullet.type === "homing") {
        radius += 1;
      }
      const color = this.getPlayerColor(bullet.owner) ?? "#ff995c";
      if (bullet.type === "grenade") {
        ctx.fillStyle = colorWithAlpha("#ffbe55", 0.95);
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colorWithAlpha("#ff7a2e", 0.8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, radius + 2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (bullet.type === "homing") {
        const gradient = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, radius);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(1, colorWithAlpha("#b884ff", 0.9));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = colorWithAlpha("#e8c2ff", 0.7);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, radius + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        const gradient = ctx.createRadialGradient(bullet.x, bullet.y, 0, bullet.x, bullet.y, radius);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(1, colorWithAlpha(color, 0.9));
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(bullet.x, bullet.y, radius, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  getPlayerColor(playerId) {
    if (!playerId) return null;
    if (playerId === this.state.playerId) {
      return "#5fffd7";
    }
    const index = this.state.players.findIndex((p) => p.id === playerId);
    if (index === -1) {
      return "#58a7ff";
    }
    if (this.state.players.length <= 2) {
      return playerId === this.state.playerId ? "#5fffd7" : "#58a7ff";
    }
    const palette = ["#58a7ff", "#ff8fa2", "#ffd966", "#7cf0ff"];
    const offset = playerId === this.state.playerId ? 0 : 1;
    return palette[(index + offset) % palette.length];
  }
}
