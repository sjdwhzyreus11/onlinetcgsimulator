import { describe, it, expect, beforeAll } from "vitest";
import WebSocket from "ws";

const PORT = 8798;
process.env.REALTIME_PORT = String(PORT);
const WS_URL = `ws://localhost:${PORT}`;

describe("Start Game Logic and Identity Update", () => {
  beforeAll(async () => {
    await import("../server.js");
    await new Promise(r => setTimeout(r, 500));
  });

  it("should update yourPlayerId when taking a seat and allow host to start game", async () => {
    const roomId = "start-game-room";
    
    // Client 1 (Host)
    const hostWs = new WebSocket(WS_URL);
    
    await new Promise<void>((resolve) => {
      hostWs.on("open", () => {
        hostWs.send(JSON.stringify({
          t: "join_room",
          roomId,
          clientId: "host-client",
          lastSeenSeq: 0,
          displayName: "Host"
        }));
        resolve();
      });
    });

    let hostPlayerId = "";
    await new Promise<void>((resolve) => {
      hostWs.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "room_state") {
          hostPlayerId = msg.yourPlayerId;
          resolve();
        }
      });
    });

    // Host takes seat p1
    hostWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt-seat-p1",
      event: { t: "take_seat", seat: "p1" }
    }));

    // Host should receive an identity_update
    await new Promise<void>((resolve) => {
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "identity_update") {
          expect(msg.yourPlayerId).toBe("p1");
          hostPlayerId = msg.yourPlayerId; // "p1"
          hostWs.off("message", listener);
          resolve();
        }
      };
      hostWs.on("message", listener);
    });

    // Client 2 (Guest) takes seat p2
    const guestWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      guestWs.on("open", () => {
        guestWs.send(JSON.stringify({
          t: "join_room",
          roomId,
          clientId: "guest-client",
          lastSeenSeq: 0,
          displayName: "Guest"
        }));
        resolve();
      });
    });

    guestWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt-seat-p2",
      event: { t: "take_seat", seat: "p2" }
    }));

    // Wait for guest to take seat
    await new Promise<void>((resolve) => {
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "identity_update" && msg.yourPlayerId === "p2") {
          guestWs.off("message", listener);
          resolve();
        }
      };
      guestWs.on("message", listener);
    });

    // Host starts game
    hostWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt-start",
      event: { t: "start_game" }
    }));

    // Should receive init_game event
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for init_game")), 2000);
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "event_committed" && msg.event.event.t === "init_game") {
          clearTimeout(timeout);
          hostWs.off("message", listener);
          resolve();
        }
      };
      hostWs.on("message", listener);
    });

    hostWs.close();
    guestWs.close();
  });
});