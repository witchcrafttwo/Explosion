const ARENA_WIDTH = 960;
const ARENA_HEIGHT = 600;
const TANK_RADIUS = 22;
const BULLET_RADIUS = 6;

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
      const gradient = ctx.createRadialGradient(
        bullet.x,
        bullet.y,
        0,
        bullet.x,
        bullet.y,
        BULLET_RADIUS
      );
      gradient.addColorStop(0, "#fff");
      gradient.addColorStop(1, "#ff995c");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, BULLET_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }
}
