import { NetworkClient } from "./network.js";
import { ClientState } from "./state.js";
import { Renderer } from "./renderer.js";
import { InputController } from "./input.js";
import { UIController } from "./ui.js";

const canvas = document.getElementById("game");
const state = new ClientState();
const renderer = new Renderer(canvas, state);
const ui = new UIController(state);
let network = null;
let input = null;

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
}

function ensureInput() {
  if (!input) {
    input = new InputController(canvas, {
      onInputChange: (data) => network?.sendInput(data),
      onSkill: () => network?.sendSkill(),
      onToggleReady: toggleReady,
    });
    input.start();
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
      state.outcome = message.payload.result;
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
