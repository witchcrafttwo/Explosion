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
  }

  bindRestart(handler) {
    this.restartButton.addEventListener("click", handler);
  }

  setStatus(text) {
    this.statusText.textContent = text;
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

  updateBars() {
    const local = this.state.players.find((p) => p.id === this.state.playerId);
    const enemy = this.state.players.find((p) => p.id !== this.state.playerId);
    this.hpBar.value = local ? local.hp : 0;
    this.enemyHpBar.value = enemy ? enemy.hp : 0;
    this.skillBar.value = this.state.skillReady ? 100 : 0;
  }
}
