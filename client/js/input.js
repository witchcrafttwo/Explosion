// input.js
// 役割：入力・HUD を提供（副作用なし）

export const KEY_BINDINGS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "shoot",
  Space: "skill",
  KeyR: "readyToggle",
  KeyF: "grenade",
  KeyG: "homing",
};

export class InputController {
  constructor(
    canvas,
    { onInputChange, onSkill, onToggleReady, onGrenade, onHoming, onShoot, invertY = false } = {}
  ) {
    this.canvas = canvas;
    this.mousePos = { x: 0, y: 0 };
    this.mouseDown = false;
    this.pointerId = null;

    this.playerPos = { x: 0, y: 0 };
    this.hasPlayerPos = false;
    this.playerPosProvider = null;

    this.mouseDeadzone = 2;
    this.eps = 1e-3;
    this.invertY = invertY;

    this.onInputChange = onInputChange;
    this.onSkill = onSkill;
    this.onToggleReady = onToggleReady;
    this.onGrenade = onGrenade;
    this.onHoming = onHoming;
    this.onShoot = onShoot;
    this.shootHeld = false;

    this._lastInput = null;
    this._rafId = null;
    this._started = false;

    this.boundKeydown = (e) => this.handleKeydown(e);
    this.boundKeyup = (e) => this.handleKeyup(e);
    this.boundPointerMove = (e) => this.handlePointerMove(e);
    this.boundPointerDown = (e) => this.handlePointerDown(e);
    this.boundPointerUp = (e) => this.handlePointerUp(e);
    this.boundContextMenu = (e) => e.preventDefault();
  }

  start() {
    if (this._started) return;
    this._started = true;

    window.addEventListener("keydown", this.boundKeydown, { passive: false });
    window.addEventListener("keyup", this.boundKeyup, { passive: true });
    this.canvas.addEventListener("pointermove", this.boundPointerMove, { passive: true });
    this.canvas.addEventListener("pointerdown", this.boundPointerDown, { passive: false });
    window.addEventListener("pointerup", this.boundPointerUp, { passive: true });
    this.canvas.addEventListener("contextmenu", this.boundContextMenu);

    this._rafId = requestAnimationFrame(() => this._update());
  }

  stop() {
    if (!this._started) return;
    this._started = false;

    window.removeEventListener("keydown", this.boundKeydown);
    window.removeEventListener("keyup", this.boundKeyup);
    this.canvas.removeEventListener("pointermove", this.boundPointerMove);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    window.removeEventListener("pointerup", this.boundPointerUp);
    this.canvas.removeEventListener("contextmenu", this.boundContextMenu);

    if (this._rafId) cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }

  setPlayerPositionProvider(getterFn) { this.playerPosProvider = getterFn; }
  setPlayerPosition(x, y) { this.playerPos.x = x; this.playerPos.y = y; this.hasPlayerPos = true; }

  handleKeydown(event) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;

    if (action === "shoot") {
      if (!this.shootHeld && !event.repeat) this.onShoot?.();
      this.shootHeld = true;
    } else if (action === "skill") this.onSkill?.();
    else if (action === "readyToggle") this.onToggleReady?.();
    else if (action === "grenade") this.onGrenade?.();
    else if (action === "homing") this.onHoming?.();

    event.preventDefault();
  }

  handleKeyup(event) {
    const action = KEY_BINDINGS[event.code];
    if (action === "shoot") this.shootHeld = false;
  }

  handlePointerDown(e) {
    if (!e.isPrimary || e.button !== 0) return;
    this.pointerId = e.pointerId;
    this.mouseDown = true;
    this.canvas.setPointerCapture?.(this.pointerId);
    this.mousePos = this._eventToCanvasXY(e);
    e.preventDefault();
  }

  handlePointerUp(e) {
    if (!e.isPrimary) return;
    if (this.pointerId === e.pointerId) {
      this.mouseDown = false;
      this.pointerId = null;
      try { this.canvas.releasePointerCapture?.(e.pointerId); } catch {}
    }
  }

  handlePointerMove(e) {
    if (this.pointerId !== null && e.pointerId !== this.pointerId) return;
    this.mousePos = this._eventToCanvasXY(e);
  }

  _update() {
    if (typeof this.playerPosProvider === "function") {
      const p = this.playerPosProvider();
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        this.playerPos.x = p.x; this.playerPos.y = p.y; this.hasPlayerPos = true;
      }
    }

    const origin = this.hasPlayerPos
      ? { x: this.playerPos.x, y: this.playerPos.y }
      : { x: this.canvas.width / 2, y: this.canvas.height / 2 };

    let dx = this.mousePos.x - origin.x;
    let dy = this.mousePos.y - origin.y;
    if (this.invertY) dy = -dy;

    const dist = Math.hypot(dx, dy);
    let moveX = 0, moveY = 0;
    if (this.mouseDown && dist > this.mouseDeadzone) {
      const inv = 1 / dist;
      moveX = dx * inv;
      moveY = dy * inv;
    }

    const input = {
      up:   moveY < -this.eps,
      down: moveY >  this.eps,
      left: moveX < -this.eps,
      right:moveX >  this.eps,
      moveX, moveY,
      shooting: !!this.shootHeld,
      aimX: this.mousePos.x,
      aimY: this.invertY ? (this.canvas.height - this.mousePos.y) : this.mousePos.y,
    };

    if (!this._approxEqualInput(input, this._lastInput)) {
      this.onInputChange?.(input);
      this._lastInput = input;
    }

    if (this._started) this._rafId = requestAnimationFrame(() => this._update());
  }

  _eventToCanvasXY(event) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.canvas.width  / Math.max(1, rect.width);
    const sy = this.canvas.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * sx,
      y: (event.clientY - rect.top)  * sy,
    };
  }

  _approxEqualInput(a, b) {
    if (!a || !b) return false;
    const near = (x, y) => Math.abs(x - y) <= this.eps;
    return (
      a.up === b.up && a.down === b.down && a.left === b.left && a.right === b.right &&
      near(a.moveX, b.moveX) && near(a.moveY, b.moveY) &&
      a.shooting === b.shooting &&
      near(a.aimX, b.aimX) && near(a.aimY, b.aimY)
    );
  }
}

export const HUD = {
  _labelWidthCache: new Map(), // "font|text" -> width

  draw(ctx, canvas, hpL, maxL, hpR = hpL, maxR = maxL) {
    ctx.save();
    // 他描画の影響を受けないように安全リセット
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    // transform を上位で使っている場合のみ有効化
    // ctx.setTransform(1, 0, 0, 1, 0, 0);

    const margin = 16;
    const barW = Math.min(260, canvas.width * 0.28);
    const barH = 16;
    const y = canvas.height - margin - barH;

    const leftX  = margin;
    const rightX = canvas.width - margin - barW;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    maxL = Math.max(1, maxL|0);
    maxR = Math.max(1, maxR|0);
    hpL  = clamp(hpL, 0, maxL);
    hpR  = clamp(hpR, 0, maxR);

    const ratioL = hpL / maxL;
    const ratioR = hpR / maxR;

    ctx.font = "12px ui-monospace, Menlo, monospace";
    ctx.textBaseline = "middle";

    const roundRect = (x, y, w, h, r) => {
      const rr = Math.min(r, h * 0.5, w * 0.5);
      ctx.beginPath();
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + w, y,     x + w, y + h, rr);
      ctx.arcTo(x + w, y + h, x,     y + h, rr);
      ctx.arcTo(x,     y + h, x,     y,     rr);
      ctx.arcTo(x,     y,     x + w, y,     rr);
      ctx.closePath();
    };

    // 左下：自分（緑）
    ctx.fillStyle = "#2c2f39"; roundRect(leftX, y, barW, barH, 6); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#3b4050"; roundRect(leftX, y, barW, barH, 6); ctx.stroke();
    const fillWL = Math.round(barW * ratioL);
    ctx.fillStyle = "#6ee7a8"; roundRect(leftX, y, fillWL, barH, 6); ctx.fill();
    ctx.fillStyle = "#e6e8f3"; ctx.fillText(`HP ${hpL}/${maxL}`, leftX + 8, y + barH / 2);

    // 右下：相手（赤、右詰め）
    ctx.fillStyle = "#2c2f39"; roundRect(rightX, y, barW, barH, 6); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "#3b4050"; roundRect(rightX, y, barW, barH, 6); ctx.stroke();
    const fillWR = Math.round(barW * ratioR);
    ctx.fillStyle = "#fca5a5"; roundRect(rightX + (barW - fillWR), y, fillWR, barH, 6); ctx.fill();
    ctx.fillStyle = "#e6e8f3";

    const labelR = `HP ${hpR}/${maxR}`;
    const cacheKey = `${ctx.font}|${labelR}`;
    let tw = this._labelWidthCache.get(cacheKey);
    if (tw == null) {
      tw = ctx.measureText(labelR).width;
      this._labelWidthCache.set(cacheKey, tw);
    }
    ctx.fillText(labelR, rightX + barW - 8 - tw, y + barH / 2);

    ctx.restore();
  },
};
