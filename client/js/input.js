const KEY_BINDINGS = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  KeyW: "up",
  KeyS: "down",
  KeyA: "left",
  KeyD: "right",
  Space: "skill",
  KeyR: "readyToggle",
  KeyF: "grenade",
  KeyG: "homing",
};

export class InputController {
  constructor(canvas, { onInputChange, onSkill, onToggleReady, onGrenade, onHoming }) {
    this.canvas = canvas;
    this.pressed = new Set();
    this.mousePos = { x: 0, y: 0 };
    this.mouseDown = false;
    this.onInputChange = onInputChange;
    this.onSkill = onSkill;
    this.onToggleReady = onToggleReady;
    this.onGrenade = onGrenade;
    this.onHoming = onHoming;
    this.boundKeydown = (event) => this.handleKeydown(event);
    this.boundKeyup = (event) => this.handleKeyup(event);
    this.boundMouseMove = (event) => this.handleMouseMove(event);
    this.boundMouseDown = () => this.handleMouseDown();
    this.boundMouseUp = () => this.handleMouseUp();
  }

  start() {
    window.addEventListener("keydown", this.boundKeydown);
    window.addEventListener("keyup", this.boundKeyup);
    this.canvas.addEventListener("mousemove", this.boundMouseMove);
    this.canvas.addEventListener("mousedown", this.boundMouseDown);
    window.addEventListener("mouseup", this.boundMouseUp);
    this.interval = setInterval(() => this.emitInput(), 1000 / 30);
  }

  stop() {
    window.removeEventListener("keydown", this.boundKeydown);
    window.removeEventListener("keyup", this.boundKeyup);
    this.canvas.removeEventListener("mousemove", this.boundMouseMove);
    this.canvas.removeEventListener("mousedown", this.boundMouseDown);
    window.removeEventListener("mouseup", this.boundMouseUp);
    clearInterval(this.interval);
  }

  handleKeydown(event) {
    const action = KEY_BINDINGS[event.code];
    if (!action) return;
    if (action === "skill") {
      this.onSkill?.();
    } else if (action === "readyToggle") {
      this.onToggleReady?.();
    } else if (action === "grenade") {
      this.onGrenade?.();
    } else if (action === "homing") {
      this.onHoming?.();
    } else {
      this.pressed.add(action);
      this.emitInput();
    }
    event.preventDefault();
  }

  handleKeyup(event) {
    const action = KEY_BINDINGS[event.code];
    if (
      !action ||
      action === "skill" ||
      action === "readyToggle" ||
      action === "grenade" ||
      action === "homing"
    ) {
      return;
    }
    this.pressed.delete(action);
    this.emitInput();
  }

  handleMouseMove(event) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    this.mousePos = {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
    this.emitInput();
  }

  handleMouseDown() {
    this.mouseDown = true;
    this.emitInput();
  }

  handleMouseUp() {
    this.mouseDown = false;
    this.emitInput();
  }

  emitInput() {
    const input = {
      up: this.pressed.has("up"),
      down: this.pressed.has("down"),
      left: this.pressed.has("left"),
      right: this.pressed.has("right"),
      shooting: this.mouseDown,
      aimX: this.mousePos.x,
      aimY: this.mousePos.y,
    };
    this.onInputChange?.(input);
  }
}
