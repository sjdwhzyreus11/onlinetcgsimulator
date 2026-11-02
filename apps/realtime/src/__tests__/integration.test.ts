import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";

const PORT = 8788;
const WS_URL = `ws://localhost:${PORT}`;

// Start the server in a separate process or we can just assume the server is running for this test.
// For Vitest, we will just start the server inline if possible, but server.ts automatically listens on process.env.REALTIME_PORT.
// Let's dynamically import the server to start it.

describe("Realtime Server Integration & Sync", () => {
  let wss: import("ws").WebSocketServer;
  
  beforeAll(async () => {
    process.env.REALTIME_PORT = String(PORT);
    // Dynamically load server to start it
    await import("../server.js");
    // wait a moment for server to bind
    await new Promise(r => setTimeout(r, 500));
  });

  it("should handle host permission recovery and idempotent match mode switching", async () => {
    const hostWs = new WebSocket(WS_URL);
    const hostClientId = "host-client-id-123";
    
    // Connect host
    await new Promise<void>((resolve) => {
      hostWs.on("open", () => {
        hostWs.send(JSON.stringify({
          t: "join_room",
          roomId: "test-room-1",
          clientId: hostClientId,
          lastSeenSeq: 0,
          displayName: "Host"
        }));
        resolve();
      });
    });

    let latestSeq = 0;
    
    // Wait for room_state
    await new Promise<void>((resolve) => {
      hostWs.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "room_state") {
          latestSeq = msg.latestSeq;
          expect(msg.snapshot.state.hostId).toBe(hostClientId);
          resolve();
        }
      });
    });

    // Test Idempotent mode change and Optimistic Lock
    hostWs.send(JSON.stringify({
      t: "submit_event",
      roomId: "test-room-1",
      clientEventId: "evt1",
      expectedSeq: latestSeq,
      event: { t: "set_match_mode", mode: "BO3" }
    }));

    await new Promise<void>((resolve) => {
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "event_committed" && msg.event.event.t === "set_match_mode") {
          latestSeq = msg.latestSeq;
          hostWs.off("message", listener);
          resolve();
        }
      };
      hostWs.on("message", listener);
    });

    // Test Conflict (optimistic lock failure)
    hostWs.send(JSON.stringify({
      t: "submit_event",
      roomId: "test-room-1",
      clientEventId: "evt2",
      expectedSeq: latestSeq - 1, // Wrong seq
      event: { t: "set_match_mode", mode: "BO1" }
    }));

    await new Promise<void>((resolve) => {
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "error" && msg.code === "conflict") {
          hostWs.off("message", listener);
          resolve();
        }
      };
      hostWs.on("message", listener);
    });

    // Disconnect host
    hostWs.close();
    
    // Wait 600ms to ensure server processes the disconnect
    await new Promise(r => setTimeout(r, 600));

    // Reconnect host
    const hostWs2 = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      hostWs2.on("open", () => {
        hostWs2.send(JSON.stringify({
          t: "join_room",
          roomId: "test-room-1",
          clientId: hostClientId,
          lastSeenSeq: latestSeq,
          displayName: "Host"
        }));
        resolve();
      });
    });

    // Verify host permission is recovered
    await new Promise<void>((resolve) => {
      hostWs2.on("message", (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "room_state") {
          expect(msg.snapshot.state.hostId).toBe(hostClientId);
          hostWs2.close();
          resolve();
        }
      });
    });

  }, 10000);
});
