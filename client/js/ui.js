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
    this.statusResetTimer = null;
    if (this.joinRoomButton) {
      this.joinRoomButton.disabled = true;
    }
  }

  bindRestart(handler) {
    this.restartButton.addEventListener("click", handler);
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

  setStatus(text, { error = false } = {}) {
    clearTimeout(this.statusResetTimer);
    this.statusText.textContent = text;
    this.statusText.classList.toggle("status--error", error);
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
    this.setStatus(message, { error: isError });
    this.statusResetTimer = setTimeout(() => {
      this.showRoomStatus(this.state.roomId);
    }, isError ? 3500 : 2000);
  }

  showRoomStatus(roomId) {
    if (!roomId) return;
    this.setStatus(`ルーム ${roomId} 参加`);
    if (this.roomSelect) {
      this.roomSelect.value = roomId;
    }
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
}
