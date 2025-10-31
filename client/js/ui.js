// ui.js
import { HUD, CONTROL_MODES } from "./input.js";

export class UIController {
  constructor(state) {
    this.state = state;

    // 必要なDOMだけ保持（HPバーDOMには触れない）
    this.skillBar = document.getElementById("skill-bar");
    this.statusText = document.getElementById("status-text");
    this.matchmakingOverlay = document.getElementById("matchmaking-overlay");
    this.resultOverlay = document.getElementById("result-overlay");
    this.resultText = document.getElementById("result-text");
    this.resultDetails = document.getElementById("result-details");
    this.restartButton = document.getElementById("restart-button");
    this.roomSelect = document.getElementById("room-select");
    this.joinRoomButton = document.getElementById("join-room-button");
    this.createRoomButton = document.getElementById("create-room-button");
    this.countdownOverlay = document.getElementById("countdown-overlay");
    this.countdownText = document.getElementById("countdown-text");
    this.readyButton = document.getElementById("ready-button");
    this.matchStatusDetail = document.getElementById("match-status-detail");
    this.matchTimer = document.getElementById("match-timer");
    this.inkMeterSelf = document.getElementById("ink-meter-self");
    this.inkMeterOpponent = document.getElementById("ink-meter-opponent");
    this.inkMeterSelfLabel = document.getElementById("ink-meter-self-label");
    this.inkMeterOpponentLabel = document.getElementById("ink-meter-opponent-label");
    this.grenadeMeter = document.getElementById("grenade-meter");
    this.homingMeter = document.getElementById("homing-meter");
    this.grenadeTimer = document.getElementById("grenade-timer");
    this.homingTimer = document.getElementById("homing-timer");
    this.controlModeToggle = document.getElementById("control-mode-toggle");
    this.controlModeStatus = document.getElementById("control-mode-status");
    this.controlInstructionMove = document.getElementById("control-instruction-move");
    this.controlInstructionShoot = document.getElementById("control-instruction-shoot");

    this.defaultMatchSeconds = 45;
    this.statusResetTimer = null;
    this.matchStatus = { phase: "waiting", ready: false, opponentReady: false };
    this.notificationActive = false;
    this.userSelectedRoomId = null;

    if (this.joinRoomButton) this.joinRoomButton.disabled = true;
    this.renderMatchStatus();
  }

  // ===== イベントバインド（解除できる形） =====
  bindRestart(handler) {
    this._onRestart = () => handler?.();
    this.restartButton?.addEventListener("click", this._onRestart);
  }
  bindReady(handler) {
    this._onReady = () => handler?.();
    this.readyButton?.addEventListener("click", this._onReady);
  }
  bindRoomActions({ onJoin, onCreate }) {
    this._onRoomChange = () => {
      const selected = this.roomSelect.value;
      this.userSelectedRoomId = selected && selected !== this.state.roomId ? selected : null;
      this.updateJoinButtonState();
    };
    this._onRoomBlur = () => this.updateJoinButtonState();
    this._onJoin = () => {
      const selected = this.roomSelect?.value;
      if (!selected || selected === this.state.roomId) return;
      onJoin?.(selected);
    };
    this._onCreate = () => onCreate?.();

    this.roomSelect?.addEventListener("change", this._onRoomChange);
    this.roomSelect?.addEventListener("blur", this._onRoomBlur);
    this.joinRoomButton?.addEventListener("click", this._onJoin);
    this.createRoomButton?.addEventListener("click", this._onCreate);
  }

  bindControlModeToggle(handler) {
    this._onControlModeToggle = () => handler?.();
    this.controlModeToggle?.addEventListener("click", this._onControlModeToggle);
  }

  destroy() {
    clearTimeout(this.statusResetTimer);
    this.restartButton?.removeEventListener("click", this._onRestart);
    this.readyButton?.removeEventListener("click", this._onReady);
    this.roomSelect?.removeEventListener("change", this._onRoomChange);
    this.roomSelect?.removeEventListener("blur", this._onRoomBlur);
    this.joinRoomButton?.removeEventListener("click", this._onJoin);
    this.createRoomButton?.removeEventListener("click", this._onCreate);
    this.controlModeToggle?.removeEventListener("click", this._onControlModeToggle);
  }

  // ===== HUD呼び出し =====
  drawHUD(ctx, canvas) {
    const local = this.state.players.find((p) => p.id === this.state.playerId);
    const enemy = this.state.players.find((p) => p.id !== this.state.playerId);
    const myHp  = local?.hp    ?? 0;
    const myMax = local?.maxHp ?? 100;
    const enHp  = enemy?.hp    ?? 0;
    const enMax = enemy?.maxHp ?? 100;
    HUD.draw(ctx, canvas, myHp, myMax, enHp, enMax);
  }

  // ===== ステータスUI =====
  setStatus(text, { error = false, lock = false } = {}) {
    clearTimeout(this.statusResetTimer);
    if (this.statusText) {
      this.statusText.textContent = text;
      this.statusText.classList.toggle("status--error", error);
    }
    this.notificationActive = lock;
  }

  updateControlMode(mode) {
    const isClickMove = mode === CONTROL_MODES.CLICK_MOVE;
    if (this.controlModeStatus) {
      this.controlModeStatus.textContent = isClickMove
        ? "現在: クリック移動モード"
        : "現在: クラシックモード (WASD + 右クリック射撃)";
    }
    if (this.controlModeToggle) {
      this.controlModeToggle.textContent = isClickMove
        ? "クラシック操作に切り替え"
        : "クリック移動に切り替え";
    }
    if (this.controlInstructionMove) {
      this.controlInstructionMove.textContent = isClickMove
        ? "移動: 右クリックで移動先を指定（もう一度で更新）"
        : "移動: WASD / 矢印キー";
    }
    if (this.controlInstructionShoot) {
      this.controlInstructionShoot.textContent = isClickMove
        ? "射撃: 左クリック（右クリックは移動）"
        : "射撃: 右クリック（左クリックでも可）";
    }
  }

  showMatchmaking(show) {
    this.matchmakingOverlay?.classList.toggle("hidden", !show);
  }

  showResult(outcome) {
    if (!outcome) {
      this.resultOverlay?.classList.add("hidden");
      if (this.resultDetails) this.resultDetails.innerHTML = "";
      return;
    }
    const heading = outcome.result === "win" ? "勝利！"
                  : outcome.result === "lose" ? "敗北..."
                  : "引き分け";
    if (this.resultText) this.resultText.textContent = heading;
    this.renderResultDetails(outcome.scores);
    this.resultOverlay?.classList.remove("hidden");
  }

  showCountdown(value) {
    if (!this.countdownOverlay) return;
    if (!value) {
      this.countdownOverlay.classList.add("hidden");
      return;
    }
    this.showMatchmaking(false);
    this.resultOverlay?.classList.add("hidden");
    if (this.countdownText) this.countdownText.textContent = value;
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
    if (!this.roomSelect) return;
    if (roomId && (!this.userSelectedRoomId || this.userSelectedRoomId === roomId)) {
      this.roomSelect.value = roomId;
      this.userSelectedRoomId = null;
    }
    this.updateJoinButtonState();
    this.renderMatchStatus();
  }

  updateRooms(rooms) {
    if (!this.roomSelect) return;
    const currentValue = this.state.roomId;
    const preferredValue = this.userSelectedRoomId ?? currentValue ?? "";
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

    if (preferredValue) {
      const option = this.roomSelect.querySelector(`option[value="${preferredValue}"]`);
      if (option) this.roomSelect.value = preferredValue;
    }
    if (!this.roomSelect.value && rooms.length > 0) {
      this.roomSelect.selectedIndex = 0;
      const selected = this.roomSelect.value;
      this.userSelectedRoomId = selected && selected !== this.state.roomId ? selected : null;
    }
    if (rooms.length === 0) this.userSelectedRoomId = null;

    this.updateJoinButtonState();
  }

  updateBars() {
    // HPバーDOMは使わない（Canvas HUD 表示）
    if (this.skillBar) this.skillBar.value = this.state.skillReady ? 100 : 0;
    this.updateTimer();
    this.updateInkMeter();
    this.updateAbilityMeters();
  }

  updateTimer() {
    if (!this.matchTimer) return;
    const remaining = Math.max(0, this.state.matchTimeRemaining);
    const phase = this.state.matchPhase;
    if (phase === "finished") {
      this.matchTimer.textContent = "0.0s";
      return;
    }
    const seconds = (remaining > 0 || phase === "active" || phase === "countdown")
      ? remaining / 1000
      : this.defaultMatchSeconds;
    this.matchTimer.textContent = `${seconds.toFixed(1)}s`;
  }

  updateInkMeter() {
    if (!this.inkMeterSelf || !this.inkMeterOpponent) return;
    const stats = Array.isArray(this.state.paintStats) ? this.state.paintStats : [];
    const localEntry = stats.find((e) => e.playerId === this.state.playerId);
    const opponentEntry = stats.find((e) => e.playerId && e.playerId !== this.state.playerId);

    const clampPercent = (value) => Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
    const lp = clampPercent(localEntry?.coverage || 0);
    const op = clampPercent(opponentEntry?.coverage || 0);

    this.inkMeterSelf.style.width = `${lp}%`;
    this.inkMeterOpponent.style.width = `${op}%`;
    if (this.inkMeterSelfLabel) this.inkMeterSelfLabel.textContent = `${lp}%`;
    if (this.inkMeterOpponentLabel) this.inkMeterOpponentLabel.textContent = `${op}%`;
  }

  updateAbilityMeters() {
    this.updateAbilityMeter(
      this.grenadeMeter, this.grenadeTimer,
      this.state.cooldowns?.grenade, this.state.cooldownMax?.grenade
    );
    this.updateAbilityMeter(
      this.homingMeter, this.homingTimer,
      this.state.cooldowns?.homing, this.state.cooldownMax?.homing
    );
  }

  updateAbilityMeter(fillEl, labelEl, remaining, total) {
    if (!fillEl || !labelEl || !total) return;
    const clamped = Math.max(0, Math.min(total, remaining || 0));
    const progress = total > 0 ? 1 - clamped / total : 1;
    fillEl.style.width = `${Math.max(0, Math.min(100, Math.round(progress * 100)))}%`;
    if (clamped <= 0) {
      labelEl.textContent = "READY";
      labelEl.classList.add("is-ready");
      labelEl.classList.remove("is-counting");
    } else {
      labelEl.textContent = `${(clamped / 1000).toFixed(1)}s`;
      labelEl.classList.add("is-counting");
      labelEl.classList.remove("is-ready");
    }
  }

  renderResultDetails(scores) {
    if (!this.resultDetails) return;
    if (!Array.isArray(scores) || scores.length === 0) {
      this.resultDetails.innerHTML = "";
      return;
    }
    const local = scores.find((e) => e.playerId === this.state.playerId);
    const opponent = scores.find((e) => e.playerId && e.playerId !== this.state.playerId);
    const blocks = [];
    if (local)   blocks.push(this.buildResultGroup(local,   "あなた", "self"));
    if (opponent) blocks.push(this.buildResultGroup(opponent, "相手",   "opponent"));
    this.resultDetails.innerHTML = blocks.join("");
  }

  buildResultGroup(entry, label, modifier) {
    const coverage = Math.round((entry.coverage || 0) * 100);
    const hp = Math.round((entry.hpRatio || 0) * 100);
    const total = (coverage + hp).toFixed(1).replace(/\.0$/, "");
    return `
      <div class="result-details__group result-details__row--${modifier}">
        <div class="result-details__row result-details__row--${modifier}">
          <span class="result-details__label">${label}</span>
          <span class="result-details__value">${total}%</span>
        </div>
        <div class="result-details__row result-details__row--${modifier}">
          <span class="result-details__label">塗り</span>
          <span class="result-details__value">${coverage}%</span>
        </div>
        <div class="result-details__row result-details__row--${modifier}">
          <span class="result-details__label">HP</span>
          <span class="result-details__value">${hp}%</span>
        </div>
      </div>
    `;
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
          ? (opponentReady ? "開始待ち" : "相手の準備待ち")
          : "再戦待ち";
        detail = ready
          ? (opponentReady ? "まもなく再戦が始まります" : "相手の準備完了を待っています")
          : "再戦するには「準備完了」を押してください";
        readyDisabled = false;
        break;
    }

    if (this.matchStatusDetail) this.matchStatusDetail.textContent = detail;
    if (this.readyButton) {
      this.readyButton.textContent = readyLabel;
      this.readyButton.disabled = readyDisabled;
      this.readyButton.classList.toggle("ready-button--active", ready && !readyDisabled);
    }

    if (!this.notificationActive && this.statusText) {
      const roomText = this.state.roomId ? `ルーム ${this.state.roomId} | ` : "";
      this.statusText.textContent = `${roomText}${summary}`;
      this.statusText.classList.remove("status--error");
    }
  }

  updateJoinButtonState() {
    if (!this.joinRoomButton || !this.roomSelect) return;
    const selected = this.roomSelect.value;
    this.joinRoomButton.disabled =
      !selected || selected === this.state.roomId || this.roomSelect.options.length === 0;
  }
}
