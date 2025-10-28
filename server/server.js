import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { v4 as uuid } from "uuid";
import path from "path";
import { fileURLToPath } from "url";

import { GameRoom } from "./gameRoom.js";
import { TICK_RATE } from "./gameConstants.js";

const PORT = process.env.PORT || 3000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientPath = path.resolve(__dirname, "../client");

const app = express();
app.use(express.static(clientPath));

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: "/game" });

const rooms = new Map();
const connections = new Map();
let roomSequence = 0;

function createRoom() {
  roomSequence += 1;
  const roomId = `R-${roomSequence.toString().padStart(3, "0")}`;
  const room = new GameRoom(roomId);
  rooms.set(roomId, room);
  return room;
}

function getOrCreateAvailableRoom() {
  for (const room of rooms.values()) {
    if (room.players.size < 2) {
      return room;
    }
  }
  return createRoom();
}

function getRoomSummaries() {
  return Array.from(rooms.values()).map((room) => ({
    id: room.id,
    players: room.players.size,
    capacity: 2,
  }));
}

function broadcastRoomList() {
  const payload = { type: "rooms", payload: { rooms: getRoomSummaries() } };
  const data = JSON.stringify(payload);
  connections.forEach((connection) => {
    if (connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.send(data);
    }
  });
}

function moveConnectionToRoom(connection, room) {
  if (connection.room) {
    const previousRoom = connection.room;
    previousRoom.removePlayer(connection.id);
    if (previousRoom.players.size === 0) {
      rooms.delete(previousRoom.id);
    }
  }

  connection.room = room;
  connection.roomId = room.id;
  room.addPlayer(connection);
  const welcomePayload = { playerId: connection.id, roomId: room.id };
  connection.send(JSON.stringify({ type: "welcome", payload: welcomePayload }));
  connection.send(JSON.stringify({ type: "state", payload: room.serialize() }));
  broadcastRoomList();
}

wss.on("connection", (ws) => {
  const connection = {
    id: uuid(),
    ws,
    send: (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    },
  };

  connections.set(connection.id, connection);

  const room = getOrCreateAvailableRoom();
  moveConnectionToRoom(connection, room);

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (error) {
      console.warn("Invalid JSON from client", error);
      return;
    }

    const activeRoom = connection.room;
    switch (message.type) {
      case "input":
        activeRoom?.handleInput(connection.id, message.payload || {});
        break;
      case "skill":
        activeRoom?.handleSkill(connection.id);
        break;
      case "grenade":
        activeRoom?.handleGrenade(connection.id);
        break;
      case "homing":
        activeRoom?.handleHoming(connection.id);
        break;
      case "restart":
        activeRoom?.handleRestart(connection.id);
        break;
      case "ready": {
        const ready = Boolean(message.payload?.ready);
        activeRoom?.handleReady(connection.id, ready);
        break;
      }
      case "joinRoom": {
        const targetId = message.payload?.roomId;
        if (!targetId) return;
        if (connection.room?.id === targetId) {
          connection.send(
            JSON.stringify({
              type: "notification",
              payload: { level: "info", message: "すでにこのルームに参加しています" },
            })
          );
          return;
        }
        const targetRoom = rooms.get(targetId);
        if (!targetRoom || targetRoom.players.size >= 2) {
          connection.send(
            JSON.stringify({
              type: "notification",
              payload: {
                level: "error",
                message: targetRoom ? "ルームが満員です" : "ルームが存在しません",
              },
            })
          );
          return;
        }
        moveConnectionToRoom(connection, targetRoom);
        break;
      }
      case "createRoom": {
        const newRoom = createRoom();
        moveConnectionToRoom(connection, newRoom);
        break;
      }
      default:
        console.warn("Unknown message type", message.type);
    }
  });

  ws.on("close", () => {
    connections.delete(connection.id);
    if (connection.room) {
      const currentRoom = connection.room;
      currentRoom.removePlayer(connection.id);
      if (currentRoom.players.size === 0) {
        rooms.delete(currentRoom.id);
      }
    }
    broadcastRoomList();
  });

  broadcastRoomList();
});

setInterval(() => {
  rooms.forEach((room) => room.update());
}, 1000 / TICK_RATE);

httpServer.listen(PORT, () => {
  console.log(`ドッカン戦車バトル Online サーバー起動: http://localhost:${PORT}`);
});
