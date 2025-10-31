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
    this.paintPatches = [];
    this.paintStats = [];
    this.paintGrid = []; // ★ 追加：サーバーから受け取る塗りグリッド
    this.obstacles = [];
    this.matchTimeRemaining = 0;
    this.cooldowns = { grenade: 0, homing: 0 };
    this.cooldownMax = { grenade: 1, homing: 1 };
  }

  applyServerState({ players, bullets, outcome, roomId, paint, obstacles, matchTimeRemaining }) {
    this.players = players;
    this.bullets = bullets;
    if (typeof outcome !== "undefined") {
      this.outcome = outcome ?? null;
    }
    if (roomId) {
      this.roomId = roomId;
    }
    this.paintPatches = paint?.patches ?? [];
    this.paintStats = paint?.stats ?? [];
    this.paintGrid = paint?.grid ?? []; // ★ 追加
    this.obstacles = obstacles ?? [];
    this.matchTimeRemaining = matchTimeRemaining ?? 0;

    const local = this.players.find((p) => p.id === this.playerId);
    this.cooldowns = {
      grenade: local ? Math.max(0, local.grenadeCooldown) : 0,
      homing: local ? Math.max(0, local.homingCooldown) : 0,
    };
    this.cooldownMax = {
      grenade: local?.grenadeMax ?? this.cooldownMax.grenade,
      homing: local?.homingMax ?? this.cooldownMax.homing,
    };
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
