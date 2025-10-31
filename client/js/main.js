import { NetworkClient } from "./network.js";
import { ClientState } from "./state.js";
import { Renderer } from "./renderer.js";
import { InputController, CONTROL_MODES } from "./input.js";
import { UIController } from "./ui.js";

const canvas = document.getElementById("game");
const state = new ClientState();
const renderer = new Renderer(canvas, state);
const ui = new UIController(state);
const ctx = canvas.getContext("2d"); // ★ HUDの描画先（保険で取得）
let network = null;
let input = null;

const CONTROL_MODE_STORAGE_KEY = "dtb-control-mode";
let desiredControlMode = loadSavedControlMode();

// ★ Rendererの描画の「直後」にHUDを重ねる仕掛け
function attachHUDOverlay() {
  // 1) renderer.render が毎フレーム呼ばれるなら、後処理としてHUDを描画
  if (typeof renderer.render === "function") {
    const orig = renderer.render.bind(renderer);
    renderer.render = function (...args) {
      const ret = orig(...args); // まず本来の描画を実行
      ui.drawHUD(this.ctx ?? ctx, this.canvas ?? canvas); // その後にHUDを重ねる
      return ret;
    };
    return;
  }

  // 2) renderが見当たらない場合のフォールバック：毎フレームHUDを重ね描き
  //    renderer.start() の後で開始することで、通常は本体描画→HUD の順になりやすい
  const loop = () => {
    ui.drawHUD(ctx, canvas);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function setReady(desired) {
  const allowedPhases = new Set(["ready", "finished"]);
  if (!allowedPhases.has(state.matchPhase)) {
    return;
  }
  if (desired && state.outcome) {
    state.outcome = null;
    ui.showResult(null);
  }
  network?.sendReady(desired);
  state.ready = desired;
  ui.updateMatchStatus({
    phase: state.matchPhase,
    ready: state.ready,
    opponentReady: state.opponentReady,
  });
}

function toggleReady() {
  setReady(!state.ready);
}

function init() {
  ui.setStatus("サーバー接続中...");
  ui.bindRestart(() => setReady(true));
  ui.bindReady(toggleReady);
  ui.bindRoomActions({
    onJoin: (roomId) => {
      network?.joinRoom(roomId);
    },
    onCreate: () => {
      network?.createRoom();
    },
  });

  ui.bindControlModeToggle(() => {
    desiredControlMode = flipControlMode(desiredControlMode);
    if (input) {
      input.setControlMode(desiredControlMode);
    }
    ui.updateControlMode(desiredControlMode);
    persistControlMode(desiredControlMode);
  });
  ui.updateControlMode(desiredControlMode);

  network = new NetworkClient({
    onOpen: () => {
      ui.setStatus("マッチング待機中");
    },
    onClose: () => {
      ui.setStatus("サーバー切断。再接続中...");
    },
    onError: () => {
      ui.setStatus("通信エラー");
    },
    onMessage: handleServerMessage,
  });

  renderer.start();

  attachHUDOverlay(); // ★ ← ここでHUDの重ね描きを有効化（超重要）
}

function ensureInput() {
  if (!input) {
    input = new InputController(canvas, {
      onInputChange: (data) => network?.sendInput(data),
      onSkill: () => network?.sendSkill(),
      onToggleReady: toggleReady,
      onGrenade: () => network?.sendGrenade(),
      onHoming: () => network?.sendHoming(),
      controlMode: desiredControlMode,
    });
    input.setPlayerPositionProvider(() => {
      const player = state.getLocalPlayer?.();
      if (player && Number.isFinite(player.x) && Number.isFinite(player.y)) {
        return { x: player.x, y: player.y };
      }
      return null;
    });
    input.start();
  } else if (input.getControlMode() !== desiredControlMode) {
    input.setControlMode(desiredControlMode);
  }
}

function handleServerMessage(message) {
  switch (message.type) {
    case "welcome":
      state.setIdentity(message.payload);
      ui.showRoomStatus(message.payload.roomId);
      break;
    case "state":
      state.applyServerState(message.payload);
      ui.updateBars();
      ensureInput();
      break;
    case "skillReady":
      state.skillReady = true;
      ui.skillBar.value = 100;
      break;
    case "skillConsumed":
      state.skillReady = false;
      ui.skillBar.value = 0;
      break;
    case "outcome":
      state.outcome = message.payload;
      ui.showResult(state.outcome);
      break;
    case "rooms":
      ui.updateRooms(message.payload.rooms);
      break;
    case "notification":
      ui.showNotification(message.payload);
      break;
    case "countdown":
      if (message.payload.value) {
        state.outcome = null;
        ui.showResult(null);
      }
      ui.showCountdown(message.payload.value);
      break;
    case "matchStatus":
      state.updateMatchStatus(message.payload);
      ui.updateMatchStatus({
        phase: state.matchPhase,
        ready: state.ready,
        opponentReady: state.opponentReady,
      });
      break;
    default:
      console.warn("Unknown message", message);
  }
}

init();

function loadSavedControlMode() {
  if (typeof window === "undefined") {
    return CONTROL_MODES.CLICK_MOVE;
  }
  try {
    const stored = window.localStorage.getItem(CONTROL_MODE_STORAGE_KEY);
    if (stored === CONTROL_MODES.CLASSIC || stored === CONTROL_MODES.CLICK_MOVE) {
      return stored;
    }
  } catch (error) {
    console.warn("Failed to load control mode from storage", error);
  }
  return CONTROL_MODES.CLICK_MOVE;
}

function persistControlMode(mode) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONTROL_MODE_STORAGE_KEY, mode);
  } catch (error) {
    console.warn("Failed to save control mode", error);
  }
}

function flipControlMode(mode) {
  return mode === CONTROL_MODES.CLICK_MOVE ? CONTROL_MODES.CLASSIC : CONTROL_MODES.CLICK_MOVE;
}
