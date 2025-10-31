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

export const CONTROL_MODES = Object.freeze({
  CLICK_MOVE: "clickMove",
  CLASSIC: "classic",
});

export class InputController {
  constructor(
    canvas,
    {
      onInputChange,
      onSkill,
      onToggleReady,
      onGrenade,
      onHoming,
      onShoot,
      invertY = false,
      controlMode = CONTROL_MODES.CLICK_MOVE,
    } = {}
  ) {
    this.canvas = canvas;
    this.mousePos = { x: 0, y: 0 };

    this.playerPos = { x: 0, y: 0 };
    this.hasPlayerPos = false;
    this.playerPosProvider = null;

    this.eps = 1e-3;
    this.invertY = invertY;

    this.keyState = { up: false, down: false, left: false, right: false };
    this.controlMode = CONTROL_MODES.CLICK_MOVE;
    this.moveTarget = null;
    this.arrivalThreshold = 12;
    this.movePointerId = null;
    this.shootingPointerId = null;

    this.onInputChange = onInputChange;
    this.onSkill = onSkill;
    this.onToggleReady = onToggleReady;
    this.onGrenade = onGrenade;
    this.onHoming = onHoming;
    this.onShoot = onShoot;
    this.shootPointerHeld = false;
    this.shootKeyHeld = false;

    this._lastInput = null;
    this._rafId = null;
    this._started = false;

    this.boundKeydown = (e) => this.handleKeydown(e);
    this.boundKeyup = (e) => this.handleKeyup(e);
    this.boundPointerMove = (e) => this.handlePointerMove(e);
    this.boundPointerDown = (e) => this.handlePointerDown(e);
    this.boundPointerUp = (e) => this.handlePointerUp(e);
    this.boundContextMenu = (e) => e.preventDefault();

    this.setControlMode(controlMode);
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

    this._resetMovementState();
  }

  setPlayerPositionProvider(getterFn) { this.playerPosProvider = getterFn; }
  setPlayerPosition(x, y) { this.playerPos.x = x; this.playerPos.y = y; this.hasPlayerPos = true; }

  handleKeydown(event) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;

    switch (action) {
      case "shoot":
        if (!this.shootKeyHeld && !event.repeat) this.onShoot?.();
        this.shootKeyHeld = true;
        break;
      case "skill":
        this.onSkill?.();
        break;
      case "readyToggle":
        this.onToggleReady?.();
        break;
      case "grenade":
        this.onGrenade?.();
        break;
      case "homing":
        this.onHoming?.();
        break;
      case "up":
      case "down":
      case "left":
      case "right":
        this.keyState[action] = true;
        break;
      default:
        break;
    }

    event.preventDefault();
  }

  handleKeyup(event) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;

    let handled = false;
    if (action === "shoot") {
      this.shootKeyHeld = false;
      handled = true;
    } else if (action === "up" || action === "down" || action === "left" || action === "right") {
      this.keyState[action] = false;
      handled = true;
    }

    if (handled) event.preventDefault();
  }

  handlePointerDown(e) {
    if (!e.isPrimary) return;
    this.mousePos = this._eventToCanvasXY(e);

    if (e.button === 2) {
      if (this.controlMode === CONTROL_MODES.CLICK_MOVE) {
        this._beginClickMove(e.pointerId, this.mousePos);
      } else {
        this._startPointerShooting(e);
      }
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      this._startPointerShooting(e);
      e.preventDefault();
    }
  }

  handlePointerUp(e) {
    if (!e.isPrimary) return;

    if (this.movePointerId === e.pointerId) {
      this.movePointerId = null;
      try { this.canvas.releasePointerCapture?.(e.pointerId); } catch {}
    }

    if (this.shootingPointerId === e.pointerId) {
      this.shootingPointerId = null;
      this.shootPointerHeld = false;
      try { this.canvas.releasePointerCapture?.(e.pointerId); } catch {}
    }
  }

  handlePointerMove(e) {
    if (!e.isPrimary) return;
    const pos = this._eventToCanvasXY(e);
    this.mousePos = pos;

    if (this.controlMode === CONTROL_MODES.CLICK_MOVE && this.movePointerId === e.pointerId) {
      this.moveTarget = { ...pos };
    }
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

    const keyboard = this.keyState;
    const manualInput = keyboard.up || keyboard.down || keyboard.left || keyboard.right;

    let moveX = 0;
    let moveY = 0;
    let up = false;
    let down = false;
    let left = false;
    let right = false;

    if (this.controlMode === CONTROL_MODES.CLASSIC || manualInput) {
      const rawX = (keyboard.right ? 1 : 0) - (keyboard.left ? 1 : 0);
      const rawY = (keyboard.down ? 1 : 0) - (keyboard.up ? 1 : 0);
      const length = Math.hypot(rawX, rawY) || 1;
      if (rawX !== 0 || rawY !== 0) {
        moveX = rawX / length;
        moveY = rawY / length;
      }
      up = keyboard.up;
      down = keyboard.down;
      left = keyboard.left;
      right = keyboard.right;
      if (this.controlMode === CONTROL_MODES.CLICK_MOVE && manualInput) {
        this.moveTarget = null;
      }
    } else if (this.controlMode === CONTROL_MODES.CLICK_MOVE && this.moveTarget) {
      const dx = this.moveTarget.x - origin.x;
      const dy = this.moveTarget.y - origin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > this.arrivalThreshold) {
        const inv = 1 / dist;
        moveX = dx * inv;
        moveY = dy * inv;
        up = moveY < -this.eps;
        down = moveY > this.eps;
        left = moveX < -this.eps;
        right = moveX > this.eps;
      } else {
        this.moveTarget = null;
      }
    }

    const aimY = this.invertY ? this.canvas.height - this.mousePos.y : this.mousePos.y;
    const input = {
      up,
      down,
      left,
      right,
      moveX,
      moveY,
      shooting: this.shootPointerHeld || this.shootKeyHeld,
      aimX: this.mousePos.x,
      aimY,
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

  getControlMode() {
    return this.controlMode;
  }

  setControlMode(mode) {
    const normalized =
      mode === CONTROL_MODES.CLASSIC ? CONTROL_MODES.CLASSIC : CONTROL_MODES.CLICK_MOVE;
    if (this.controlMode === normalized) {
      return this.controlMode;
    }
    this.controlMode = normalized;
    this._resetMovementState();
    return this.controlMode;
  }

  toggleControlMode() {
    const next =
      this.controlMode === CONTROL_MODES.CLICK_MOVE
        ? CONTROL_MODES.CLASSIC
        : CONTROL_MODES.CLICK_MOVE;
    return this.setControlMode(next);
  }

  _beginClickMove(pointerId, target) {
    this.moveTarget = { ...target };
    this.movePointerId = pointerId;
    try {
      this.canvas.setPointerCapture?.(pointerId);
    } catch {}
  }

  _startPointerShooting(e) {
    if (this.shootingPointerId !== null && this.shootingPointerId !== e.pointerId) {
      try { this.canvas.releasePointerCapture?.(this.shootingPointerId); } catch {}
    }
    this.shootingPointerId = e.pointerId;
    this.shootPointerHeld = true;
    try {
      this.canvas.setPointerCapture?.(e.pointerId);
    } catch {}
    if (!this.shootKeyHeld) {
      this.onShoot?.();
    }
  }

  _resetMovementState() {
    if (this.movePointerId !== null) {
      try { this.canvas.releasePointerCapture?.(this.movePointerId); } catch {}
    }
    if (this.shootingPointerId !== null) {
      try { this.canvas.releasePointerCapture?.(this.shootingPointerId); } catch {}
    }
    this.movePointerId = null;
    this.moveTarget = null;
    this.keyState = { up: false, down: false, left: false, right: false };
    this.shootingPointerId = null;
    this.shootPointerHeld = false;
    this.shootKeyHeld = false;
    this._lastInput = null;
  }
}

InputController.CONTROL_MODES = CONTROL_MODES;

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
