import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";

const PORT = 8795;
process.env.REALTIME_PORT = String(PORT);
const WS_URL = `ws://localhost:${PORT}`;

describe("Multi-User Identity Isolation", () => {
  let wss: any;

  beforeAll(async () => {
    await import("../server.js");
    await new Promise(r => setTimeout(r, 500));
  });

  it("should assign host only to the first client and isolate identities", async () => {
    const roomId = "isolation-room";
    
    // Client 1 (Host)
    const hostWs = new WebSocket(WS_URL);
    const hostClientId = "host-client-1";
    
    await new Promise<void>((resolve) => {
      hostWs.on("open", () => {
        hostWs.send(JSON.stringify({
          t: "join_room",
          roomId,
          clientId: hostClientId,
          lastSeenSeq: 0,
          displayName: "Host Player"
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
          expect(msg.snapshot.state.hostId).toBe(hostPlayerId);
          resolve();
        }
      });
    });

    // Client 2 (Guest)
    const guestWs = new WebSocket(WS_URL);
    const guestClientId = "guest-client-2";
    
    await new Promise<void>((resolve) => {
      guestWs.on("open", () => {
        guestWs.send(JSON.stringify({
          t: "join_room",
          roomId,
          clientId: guestClientId,
          lastSeenSeq: 0,
          displayName: "Guest Player"
        }));
        resolve();
      });
    });

    let guestPlayerId = "";
    await new Promise<void>((resolve) => {
      guestWs.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "room_state") {
          guestPlayerId = msg.yourPlayerId;
          // Guest should NOT be host
          expect(msg.snapshot.state.hostId).toBe(hostPlayerId);
          expect(guestPlayerId).not.toBe(hostPlayerId);
          resolve();
        }
      });
    });

    // Verify Guest cannot change match mode
    guestWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "guest-evt-1",
      event: { t: "set_match_mode", mode: "BO3" }
    }));

    // Wait a bit to ensure it wasn't processed
    await new Promise(r => setTimeout(r, 200));

    // Verify state hasn't changed to BO3
    hostWs.send(JSON.stringify({ t: "ping" }));
    let isBO3 = false;
    const listener = (data: any) => {
      const msg = JSON.parse(data.toString());
      if (msg.t === "event_committed" && msg.event.event.t === "set_match_mode") {
        isBO3 = true;
      }
    };
    hostWs.on("message", listener);
    
    await new Promise(r => setTimeout(r, 200));
    expect(isBO3).toBe(false); // Guest attempt was ignored
    
    hostWs.close();
    guestWs.close();
  });
});
