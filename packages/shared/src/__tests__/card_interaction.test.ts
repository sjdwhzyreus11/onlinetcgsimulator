import { describe, it, expect } from "vitest";
import { applyCommittedEvent, createInitialState } from "../state";
import type { GameConfig, CommittedEventView } from "../protocol";

describe("Card Interaction on Board", () => {
  const config: GameConfig = { battlefieldCount: 3, matchMode: "BO1" };
  
  it("should smoothly toggle card rotation state between 0 and 90 degrees", () => {
    let state = createInitialState({ roomId: "test", config });
    
    // Setup initial game with a card on board
    const initEvent: CommittedEventView = {
      seq: 1,
      at: Date.now(),
      actorId: "server",
      visibility: "public",
      event: {
        t: "init_game",
        config,
        players: [{ id: "p1", displayName: "P1" }, { id: "p2", displayName: "P2" }],
        zones: [
          { id: "shared:battlefield_left", name: "BF", privacy: "public", cards: ["c1"] }
        ],
        cards: [
          { id: "c1", defId: "m1", ownerId: "p1", controllerId: "p1", zoneId: "shared:battlefield_left", face: { faceUp: true, rotation: 0 }, counters: {} }
        ]
      }
    };
    
    state = applyCommittedEvent(state, initEvent);
    expect(state.cards["c1"].face.rotation).toBe(0);

    // Tap card (0 -> 90)
    const tapEvent: CommittedEventView = {
      seq: 2,
      at: Date.now(),
      actorId: "p1",
      visibility: "public",
      event: { t: "rotate_card", cardId: "c1", rotation: 90 }
    };

    state = applyCommittedEvent(state, tapEvent);
    expect(state.cards["c1"].face.rotation).toBe(90);

    // Untap card (90 -> 0)
    const untapEvent: CommittedEventView = {
      seq: 3,
      at: Date.now(),
      actorId: "p1",
      visibility: "public",
      event: { t: "rotate_card", cardId: "c1", rotation: 0 }
    };

    state = applyCommittedEvent(state, untapEvent);
    expect(state.cards["c1"].face.rotation).toBe(0);
  });
});
