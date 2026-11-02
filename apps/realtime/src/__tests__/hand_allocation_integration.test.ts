import { describe, it, expect, beforeAll } from "vitest";
import WebSocket from "ws";

const PORT = 8805;
process.env.REALTIME_PORT = String(PORT);
const WS_URL = `ws://localhost:${PORT}`;

describe("Server buildInitialGame starting hand", () => {
  beforeAll(async () => {
    await import("../server.js");
    await new Promise(r => setTimeout(r, 500));
  });

  it("should deal exactly 4 cards to hand and leave 36 in main deck", async () => {
    const roomId = "hand-allocation-room";
    
    // Connect Host
    const hostWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      hostWs.on("open", () => {
        hostWs.send(JSON.stringify({ t: "join_room", roomId, clientId: "host", lastSeenSeq: 0, displayName: "Host" }));
        resolve();
      });
    });

    await new Promise(r => setTimeout(r, 100));
    hostWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "evt1", event: { t: "take_seat", seat: "p1" } }));
    await new Promise(r => setTimeout(r, 100));

    // Connect Guest
    const guestWs = new WebSocket(WS_URL);
    await new Promise<void>((resolve) => {
      guestWs.on("open", () => {
        guestWs.send(JSON.stringify({ t: "join_room", roomId, clientId: "guest", lastSeenSeq: 0, displayName: "Guest" }));
        resolve();
      });
    });

    await new Promise(r => setTimeout(r, 100));
    guestWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "evt2", event: { t: "take_seat", seat: "p2" } }));
    await new Promise(r => setTimeout(r, 100));

    const deckId = "3f32d491-a71a-48ba-89d3-17d553e9486d";

    hostWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt_select1",
      event: { t: "select_deck", deckId, deckName: "test-deck" }
    }));
    await new Promise(r => setTimeout(r, 200));
    hostWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt_ready1",
      event: { t: "set_lobby_ready", ready: true }
    }));
    await new Promise(r => setTimeout(r, 100));

    guestWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt_select2",
      event: { t: "select_deck", deckId, deckName: "test-deck" }
    }));
    await new Promise(r => setTimeout(r, 200));
    guestWs.send(JSON.stringify({
      t: "submit_event",
      roomId,
      clientEventId: "evt_ready2",
      event: { t: "set_lobby_ready", ready: true }
    }));
    await new Promise(r => setTimeout(r, 100));

    // Start Game
    hostWs.send(JSON.stringify({ t: "submit_event", roomId, clientEventId: "evt3", event: { t: "start_game" } }));

    // Wait for init_game
    await new Promise<void>((resolve) => {
      const listener = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.t === "event_committed" && msg.event.event.t === "init_game") {
          const init = msg.event.event;
          
          const p1Hand = init.zones.find((z: any) => z.id === "p1:hand");
          const p1Deck = init.zones.find((z: any) => z.id === "p1:mainDeck");
          expect(p1Hand.cards.length).toBe(0);
          expect(p1Deck.cards.length).toBe(40);

          const p2Hand = init.zones.find((z: any) => z.id === "p2:hand");
          const p2Deck = init.zones.find((z: any) => z.id === "p2:mainDeck");
          expect(p2Hand.cards.length).toBe(0);
          expect(p2Deck.cards.length).toBe(40);

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