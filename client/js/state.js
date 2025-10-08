export class ClientState {
  constructor() {
    this.playerId = null;
    this.roomId = null;
    this.players = [];
    this.bullets = [];
    this.skillReady = false;
    this.outcome = null;
  }

  applyServerState({ players, bullets, outcome }) {
    this.players = players;
    this.bullets = bullets;
    this.outcome = outcome ?? null;
  }

  setIdentity({ playerId, roomId }) {
    this.playerId = playerId;
    this.roomId = roomId;
  }
}
