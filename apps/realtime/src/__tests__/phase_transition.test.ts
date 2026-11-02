import { describe, it, expect, beforeAll } from "vitest";
import WebSocket from "ws";

const PORT = 8802;
process.env.REALTIME_PORT = String(PORT);
const WS_URL = `ws://localhost:${PORT}`;

describe("Phase Transition from Setup Dice to Setup Mulligan", () => {
  beforeAll(async () => {
    await import("../server.js");
    await new Promise(r => setTimeout(r, 500));
  });

  it("should successfully transition to setup_mulligan after dice winner chooses first player", async () => {
    const roomId = "phase-transition-room";
    
    // Client 1 (Host - P1)
    const hostWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      hostWs.on("open", () => {
        hostWs.send(JSON.stringify({ t: "join_room", roomId, clientId: "host-1", lastSeenSeq: 0, displayName: "Host" }));
        resolve();
      });
    });

    await new Promise(r => setTimeout(r, 100));
    hostWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "evt-seat-p1", event: { t: "take_seat", seat: "p1" } }));
    await new Promise(r => setTimeout(r, 100));

    // Client 2 (Guest - P2)
    const guestWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      guestWs.on("open", () => {
        guestWs.send(JSON.stringify({ t: "join_room", roomId, clientId: "guest-2", lastSeenSeq: 0, displayName: "Guest" }));
        resolve();
      });
    });

    await new Promise(r => setTimeout(r, 100));
    guestWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "evt-seat-p2", event: { t: "take_seat", seat: "p2" } }));
    await new Promise(r => setTimeout(r, 100));

    // Start Game
    hostWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "evt-start", event: { t: "start_game" } }));

    // Wait for setup_dice
    let p1Roll = 0;
    let p2Roll = 0;
    let latestSeq = 0;

    await new Promise<void>((resolve) => {
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "event_committed") {
          latestSeq = msg.latestSeq;
          if (msg.event.event.t === "dice_rolled") {
            p1Roll = msg.event.event.rolls.p1;
            p2Roll = msg.event.event.rolls.p2;
          }
          if (msg.event.event.t === "set_phase" && msg.event.event.phase === "setup_dice") {
            hostWs.off("message", listener);
            resolve();
          }
        }
      };
      hostWs.on("message", listener);
    });

    // Winner chooses
    const winnerWs = (p1Roll >= p2Roll) ? hostWs : guestWs;
    
    winnerWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt-choose",
      expectedSeq: latestSeq,
      event: { t: "choose_first_player", firstPlayer: "p1" }
    }));

    // Assert Phase transitioned to setup_mulligan
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for setup_mulligan")), 2000);
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "event_committed" && msg.event.event.t === "set_phase" && msg.event.event.phase === "setup_mulligan") {
          clearTimeout(timeout);
          winnerWs.off("message", listener);
          resolve();
        }
      };
      winnerWs.on("message", listener);
    });

    hostWs.close();
    guestWs.close();
  });
});