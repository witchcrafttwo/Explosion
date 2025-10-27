const RECONNECT_DELAY = 2000;

export class NetworkClient {
  constructor({ onOpen, onClose, onError, onMessage }) {
    this.ws = null;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.onMessage = onMessage;
    this.shouldReconnect = true;
    this.connect();
  }

  connect() {
    const protocol = location.protocol === "https:" ? "wss" : "ws";
    const url = `${protocol}://${location.host}/game`;
    this.ws = new WebSocket(url);

    this.ws.addEventListener("open", () => {
      this.onOpen?.();
    });

    this.ws.addEventListener("close", () => {
      this.onClose?.();
      if (this.shouldReconnect) {
        setTimeout(() => this.connect(), RECONNECT_DELAY);
      }
    });

    this.ws.addEventListener("error", (event) => {
      console.error("WebSocket error", event);
      this.onError?.(event);
    });

    this.ws.addEventListener("message", (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage?.(data);
      } catch (err) {
        console.error("Failed to parse message", err);
      }
    });
  }

  send(type, payload = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify({ type, payload }));
  }

  sendInput(input) {
    this.send("input", input);
  }

  sendSkill() {
    this.send("skill");
  }

  joinRoom(roomId) {
    this.send("joinRoom", { roomId });
  }

  createRoom() {
    this.send("createRoom");
  }

  sendReady(ready) {
    this.send("ready", { ready });
  }

  dispose() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}
