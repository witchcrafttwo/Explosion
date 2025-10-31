// renderer.js（1台目=犬、2台目=猫／障害物と塗りも修正対応版＋芝生背景）

const TWO_PI = Math.PI * 2;
function normalize(a) {
  a %= TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

export class Renderer {
  constructor(canvas, state) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.state = state;
    this.lastTimestamp = 0;
    this.boundRender = (timestamp) => this.render(timestamp);

    // === 背景（芝生）をプリロードしてパターン化 ===
    this.bgImage = null;
    this.bgPattern = null;
    (() => {
      const img = new Image();
      img.onload = () => {
        this.bgImage = img;
        this.bgPattern = this.ctx.createPattern(img, "repeat");
      };
      img.onerror = (e) => console.error("背景の読み込みに失敗", e);
      // renderer.js からの相対パスを確実に解決
      img.src = new URL("./siba.png", import.meta.url).href;
    })();

    // === 犬 & 猫スプライト読込 ===
    // front/back の扱いは「前＝後ろ姿」「後＝正面」をユーザー要望どおりに反転
    this.sprites = {
      dog: { front: null, back: null, left: null, right: null },
      cat: { front: null, back: null, left: null, right: null },
    };
    this.spritesReady = false;

    const load = (rel) =>
      new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = () => rej(`failed to load: ${rel}`);
        img.src = new URL(rel, import.meta.url).href; // /client/js/ 相対
      });

    Promise.all([
      // --- 犬（前=後ろ画像／後=正面画像） ---
      load("./inu_usiro.png").then((i) => (this.sprites.dog.front = i)),
      load("./inu_syoumen.png").then((i) => (this.sprites.dog.back = i)),
      load("./inu_yoko_hidari.png").then((i) => (this.sprites.dog.left = i)),
      load("./inu_yoko_migi.png").then((i) => (this.sprites.dog.right = i)),

      // --- 猫（ファイル名は mae/usiro）---
      load("./neko_usiro.png").then((i) => (this.sprites.cat.front = i)), // 前=後ろ姿
      load("./neko_mae.png").then((i) => (this.sprites.cat.back = i)),    // 後=正面
      load("./neko_yoko_hidari.png").then((i) => (this.sprites.cat.left = i)),
      load("./neko_yoko_migi.png").then((i) => (this.sprites.cat.right = i)),
    ])
      .then(() => {
        this.spritesReady = true;
        console.log("🐶🐱 スプライト読み込み完了（犬&猫）");
      })
      .catch((e) => console.error(e));

    // 最初に見つけた2人を「犬」「猫」に固定するためのマップ
    this.avatarById = new Map(); // id -> 'dog' | 'cat'
  }

  // idごとにアバターを決める（既に指定があればそれを尊重）
  getAvatarFor(player, indexInList) {
    // もしサーバ側で player.avatar が来ていたらそれを使う
    if (player && (player.avatar === "dog" || player.avatar === "cat")) {
      this.avatarById.set(player.id, player.avatar);
      return player.avatar;
    }
    // 既に割当済みならそのまま
    if (this.avatarById.has(player.id)) return this.avatarById.get(player.id);

    // まだなら、参加順（同じ描画順）で 0:dog, 1:cat にする
    // 以降のプレイヤーは dog で埋める（必要なら拡張）
    const known = this.avatarById.size;
    const decision =
      known === 0 ? "dog" : known === 1 ? "cat" : "dog";
    this.avatarById.set(player.id, decision);
    return decision;
  }

  start() {
    requestAnimationFrame(this.boundRender);
  }

  render(timestamp) {
    const ctx = this.ctx;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // リセット
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, width, height);

    this.lastTimestamp = timestamp;

    // 背景 → 障害物（実体）→ 塗り → プレイヤー → 弾 → 障害物アウトライン
    this.drawBackground(ctx);
    this.drawObstacles(ctx);           // 実体（塗りの前）
    this.drawPaint(ctx);               // グリッド塗り
    this.drawPlayers(ctx);             // 犬/猫
    this.drawBullets(ctx);
    this.drawObstaclesOutline(ctx);    // 最前面に枠

    requestAnimationFrame(this.boundRender);
  }

  // === 芝生背景 ===
  drawBackground(ctx) {
    if (this.bgPattern) {
      ctx.fillStyle = this.bgPattern;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    } else {
      // 読み込み前のフォールバック（見失わないよう緑）
      ctx.fillStyle = "#2e8b57";
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // === 障害物（実体） ===
  drawObstacles(ctx) {
    const obs = this.state.obstacles || [];
    ctx.fillStyle = "#172a42";
    for (const o of obs) {
      const w = o.w ?? o.width;
      const h = o.h ?? o.height;
      ctx.fillRect(o.x, o.y, w, h);
    }
  }

  // === 塗り（サーバからのグリッドを可視化） ===
  // === 塗り（サーバからのグリッドを可視化） ===
drawPaint(ctx) {
  const grid = this.state.paintGrid || [];
  const rows = grid.length;
  const cols = rows ? grid[0].length : 0;
  if (!rows || !cols) return;

  const cellW = this.canvas.width / cols;
  const cellH = this.canvas.height / rows;

  const players = this.state.players || [];

  const colorOf = (ownerId) => {
    if (!ownerId) return null;
    const player = players.find((p) => p.id === ownerId);
    if (!player) return null;
    const avatar = this.getAvatarFor(player);
    // 🐶犬→オレンジ、🐱猫→紫
    if (avatar === "dog") return "#ff8c00";
    if (avatar === "cat") return "#b266ff";
    return "#cccccc"; // fallback
  };

  for (let r = 0; r < rows; r++) {
    const row = grid[r];
    for (let c = 0; c < cols; c++) {
      const owner = row[c];
      const color = colorOf(owner);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(c * cellW, r * cellH, Math.ceil(cellW), Math.ceil(cellH));
    }
  }
}


  // === プレイヤー（犬/猫） ===
  drawPlayers(ctx) {
    if (!this.spritesReady) return;

    const SIZE = 56;
    const HALF = SIZE / 2;
    const players = this.state.players || [];
    const localId = this.state.playerId;

    players.forEach((p, i) => {
      const avatar = this.getAvatarFor(p, i); // 'dog' or 'cat'
      const set = this.sprites[avatar];

      const a = normalize(p.turretAngle || 0);
      let img = set.right; // 0rad 付近＝右
      if (a >= Math.PI * 0.25 && a < Math.PI * 0.75) img = set.back;      // 下
      else if (a >= Math.PI * 0.75 && a < Math.PI * 1.25) img = set.left;  // 左
      else if (a >= Math.PI * 1.25 && a < Math.PI * 1.75) img = set.front; // 上

      const x = p.x, y = p.y;

      // 影
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.ellipse(x, y + 12, HALF, HALF * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // 本体
      ctx.drawImage(img, x - HALF, y - HALF, SIZE, SIZE);

      // HPバー
      ctx.fillStyle = "rgba(15,32,52,0.7)";
      ctx.fillRect(x - 26, y - HALF - 16, 52, 8);
      ctx.fillStyle = p.id === localId ? "#3ff0ff" : "#7ea7ff";
      const hpW = Math.max(0, (p.hp / 100) * 52);
      ctx.fillRect(x - 26, y - HALF - 16, hpW, 8);

      // 任意：スキルオーラ
      if (p.isSkillActive) {
        ctx.strokeStyle = p.id === localId ? "#47ffd1" : "#5c91ff";
        ctx.lineWidth = 4;
        ctx.beginPath();
        const r = HALF + 18 + 6 * Math.sin(performance.now() / 100);
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    });
  }

  drawBullets(ctx) {
    const bullets = this.state.bullets || [];
    if (!bullets.length) return;

    const players = this.state.players || [];
    const playerMap = new Map(players.map((p) => [p.id, p]));

    const specials = [];
    const normals = [];
    bullets.forEach((bullet) => {
      if (bullet.type === "grenade" || bullet.type === "homing") {
        specials.push(bullet);
      } else {
        normals.push(bullet);
      }
    });

    const colorForOwner = (ownerId) => {
      const owner = ownerId ? playerMap.get(ownerId) : null;
      const avatar = owner ? this.getAvatarFor(owner) : null;
      if (avatar === "dog") return "#ff8c00";
      if (avatar === "cat") return "#b266ff";
      return "#61f6e5";
    };

    normals.forEach((bullet) => {
      ctx.fillStyle = colorForOwner(bullet.owner);
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    const specialStyles = {
      grenade: {
        radius: 9,
        fill: "#ff6ad5",
        glow: "rgba(255, 122, 222, 0.55)",
      },
      homing: {
        radius: 7,
        fill: "#ffb347",
        glow: "rgba(255, 179, 71, 0.5)",
      },
    };

    specials.forEach((bullet) => {
      const style = specialStyles[bullet.type];
      if (!style) return;

      ctx.save();
      ctx.shadowColor = style.glow;
      ctx.shadowBlur = 18;
      ctx.fillStyle = style.fill;
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, style.radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, style.radius - 1, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, style.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    });
  }


  // === 障害物の見やすい枠（最前面） ===
  drawObstaclesOutline(ctx) {
    const obs = this.state.obstacles || [];
    ctx.strokeStyle = "rgba(100,220,255,0.9)";
    ctx.lineWidth = 2;
    for (const o of obs) {
      const w = o.w ?? o.width;
      const h = o.h ?? o.height;
      ctx.strokeRect(o.x + 0.5, o.y + 0.5, w - 1, h - 1);
    }
  }
}
