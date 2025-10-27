export class ClientState {
  constructor() {
    this.playerId = null;
    this.roomId = null;
    this.players = [];
    this.bullets = [];
    this.skillReady = false;
    this.outcome = null;
    this.ready = false;
    this.opponentReady = false;
    this.matchPhase = "waiting";
  }

  applyServerState({ players, bullets, outcome, roomId }) {
    this.players = players;
    this.bullets = bullets;
    this.outcome = outcome ?? null;
    if (roomId) {
      this.roomId = roomId;
    }
  }

  setIdentity({ playerId, roomId }) {
    this.playerId = playerId;
    this.roomId = roomId;
  }

  updateMatchStatus({ phase, players }) {
    this.matchPhase = phase;
    if (!Array.isArray(players)) {
      this.ready = false;
      this.opponentReady = false;
      return;
    }
    const self = players.find((p) => p.id === this.playerId);
    const opponent = players.find((p) => p.id !== this.playerId);
    this.ready = Boolean(self?.ready);
    this.opponentReady = Boolean(opponent?.ready);
  }
}
