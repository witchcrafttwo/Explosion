export class UIController {
  constructor(state) {
    this.state = state;
    this.hpBar = document.getElementById("hp-bar");
    this.enemyHpBar = document.getElementById("enemy-hp-bar");
    this.skillBar = document.getElementById("skill-bar");
    this.statusText = document.getElementById("status-text");
    this.matchmakingOverlay = document.getElementById("matchmaking-overlay");
    this.resultOverlay = document.getElementById("result-overlay");
    this.resultText = document.getElementById("result-text");
    this.restartButton = document.getElementById("restart-button");
    this.roomSelect = document.getElementById("room-select");
    this.joinRoomButton = document.getElementById("join-room-button");
    this.createRoomButton = document.getElementById("create-room-button");
    this.countdownOverlay = document.getElementById("countdown-overlay");
    this.countdownText = document.getElementById("countdown-text");
    this.readyButton = document.getElementById("ready-button");
    this.matchStatusDetail = document.getElementById("match-status-detail");
    this.statusResetTimer = null;
    this.matchStatus = { phase: "waiting", ready: false, opponentReady: false };
    this.notificationActive = false;
    if (this.joinRoomButton) {
      this.joinRoomButton.disabled = true;
    }
    this.renderMatchStatus();
  }

  bindRestart(handler) {
    this.restartButton.addEventListener("click", handler);
  }

  bindReady(handler) {
    this.readyButton?.addEventListener("click", handler);
  }

  bindRoomActions({ onJoin, onCreate }) {
    this.roomSelect?.addEventListener("change", () => {
      if (!this.joinRoomButton) return;
      const selected = this.roomSelect.value;
      this.joinRoomButton.disabled = !selected || selected === this.state.roomId;
    });
    this.joinRoomButton?.addEventListener("click", () => {
      const selected = this.roomSelect?.value;
      if (!selected || selected === this.state.roomId) return;
      onJoin?.(selected);
    });
    this.createRoomButton?.addEventListener("click", () => {
      onCreate?.();
    });
  }

  setStatus(text, { error = false, lock = false } = {}) {
    clearTimeout(this.statusResetTimer);
    this.statusText.textContent = text;
    this.statusText.classList.toggle("status--error", error);
    this.notificationActive = lock;
  }

  showMatchmaking(show) {
    this.matchmakingOverlay.classList.toggle("hidden", !show);
  }

  showResult(outcome) {
    if (!outcome) {
      this.resultOverlay.classList.add("hidden");
      return;
    }
    this.resultText.textContent = outcome === "win" ? "勝利！" : "敗北...";
    this.resultOverlay.classList.remove("hidden");
  }

  showCountdown(value) {
    if (!this.countdownOverlay) return;
    if (!value) {
      this.countdownOverlay.classList.add("hidden");
      return;
    }
    this.showMatchmaking(false);
    this.resultOverlay.classList.add("hidden");
    this.countdownText.textContent = value;
    this.countdownOverlay.classList.remove("hidden");
  }

  showNotification({ level, message }) {
    if (!message) return;
    const isError = level === "error";
    this.setStatus(message, { error: isError, lock: true });
    this.statusResetTimer = setTimeout(() => {
      this.notificationActive = false;
      this.renderMatchStatus();
    }, isError ? 3500 : 2000);
  }

  showRoomStatus(roomId) {
    if (!roomId) return;
    if (this.roomSelect) {
      this.roomSelect.value = roomId;
    }
    this.renderMatchStatus();
  }

  updateRooms(rooms) {
    if (!this.roomSelect) return;
    const currentValue = this.state.roomId;
    const optionsHtml = rooms
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((room) => {
        const label = `${room.id} (${room.players}/${room.capacity})`;
        const disabled = room.players >= room.capacity && room.id !== currentValue ? "disabled" : "";
        return `<option value="${room.id}" ${disabled}>${label}</option>`;
      })
      .join("");
    this.roomSelect.innerHTML = optionsHtml;
    if (currentValue) {
      this.roomSelect.value = currentValue;
    }
    if (!this.roomSelect.value && rooms.length > 0) {
      this.roomSelect.selectedIndex = 0;
    }
    if (this.joinRoomButton) {
      const selected = this.roomSelect.value;
      this.joinRoomButton.disabled =
        rooms.length === 0 || !selected || selected === this.state.roomId;
    }
  }

  updateBars() {
    const local = this.state.players.find((p) => p.id === this.state.playerId);
    const enemy = this.state.players.find((p) => p.id !== this.state.playerId);
    this.hpBar.value = local ? local.hp : 0;
    this.enemyHpBar.value = enemy ? enemy.hp : 0;
    this.skillBar.value = this.state.skillReady ? 100 : 0;
  }

  updateMatchStatus({ phase, ready, opponentReady }) {
    this.matchStatus = { phase, ready, opponentReady };
    this.renderMatchStatus();
  }

  renderMatchStatus() {
    const { phase, ready, opponentReady } = this.matchStatus;
    let summary = "待機中";
    let detail = "対戦相手を待っています";
    let readyDisabled = true;
    let readyLabel = ready ? "準備解除" : "準備完了";

    switch (phase) {
      case "waiting":
        summary = "対戦相手待ち";
        detail = "対戦相手が参加するまで自由に練習できます";
        readyDisabled = true;
        break;
      case "ready":
        summary = ready ? "相手の準備待ち" : "準備待ち";
        detail = ready
          ? "相手の準備完了を待っています"
          : "「準備完了」を押して対戦開始を待ちましょう";
        readyDisabled = false;
        break;
      case "countdown":
        summary = "開始準備中";
        detail = "カウントダウンが終了すると試合が始まります";
        readyDisabled = true;
        break;
      case "active":
        summary = "バトル中";
        detail = "現在試合中です";
        readyDisabled = true;
        break;
      case "finished":
        summary = ready
          ? opponentReady
            ? "開始待ち"
            : "相手の準備待ち"
          : "再戦待ち";
        detail = ready
          ? opponentReady
            ? "まもなく再戦が始まります"
            : "相手の準備完了を待っています"
          : "再戦するには「準備完了」を押してください";
        readyDisabled = false;
        break;
      default:
        break;
    }

    if (this.matchStatusDetail) {
      this.matchStatusDetail.textContent = detail;
    }
    if (this.readyButton) {
      this.readyButton.textContent = readyLabel;
      this.readyButton.disabled = readyDisabled;
      this.readyButton.classList.toggle("ready-button--active", ready && !readyDisabled);
    }

    if (!this.notificationActive) {
      const roomText = this.state.roomId ? `ルーム ${this.state.roomId} | ` : "";
      this.statusText.textContent = `${roomText}${summary}`;
      this.statusText.classList.remove("status--error");
    }
  }
}
