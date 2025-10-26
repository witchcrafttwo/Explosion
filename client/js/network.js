const RECONNECT_DELAY = 2000;

function normalizeOverride(value) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Allow a complete WebSocket URL. Append the default path if necessary.
  if (/^wss?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      if (url.pathname === "/" || url.pathname === "") {
        url.pathname = "/game";
      }
      return url.toString();
    } catch (error) {
      console.warn("Invalid WebSocket URL override", error);
      return null;
    }
  }

  // Treat the override as host (and optional path) without protocol.
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const sanitized = trimmed.replace(/^\/+/, "").replace(/\s+/g, "");
  const needsPath = !sanitized.includes("/");
  const path = needsPath ? "/game" : "";
  return `${protocol}://${sanitized}${path}`;
}

function resolveWebSocketUrl() {
  const params = new URLSearchParams(window.location.search);
  const override = window.GAME_SERVER_URL || params.get("server");
  const normalized = normalizeOverride(override);
  if (normalized) {
    return normalized;
  }

  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const host = location.host || "localhost:3000";
  return `${protocol}://${host}/game`;
}

export class NetworkClient {
  constructor({ onOpen, onClose, onError, onMessage }) {
    this.ws = null;
    this.onOpen = onOpen;
    this.onClose = onClose;
    this.onError = onError;
    this.onMessage = onMessage;
    this.shouldReconnect = true;
    this.endpoint = resolveWebSocketUrl();
    this.connect();
  }

  connect() {
    this.ws = new WebSocket(this.endpoint);

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

  requestRestart() {
    this.send("restart");
  }

  dispose() {
    this.shouldReconnect = false;
    this.ws?.close();
  }
}
