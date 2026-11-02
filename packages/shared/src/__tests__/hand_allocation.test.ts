import { describe, it, expect } from "vitest";
import { applyCommittedEvent, createInitialState } from "../state";
import type { GameConfig, CommittedEventView, InitGameEvent } from "../protocol";

describe("Hand Allocation & Move Card Idempotency", () => {
  const config: GameConfig = { battlefieldCount: 3, matchMode: "BO1" };
  
  it("should prevent duplicate cards when moving a card to its current zone", () => {
    let state = createInitialState({ roomId: "test", config });
    
    // Setup a dummy initial game
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
          { id: "p1:hand", name: "Hand", privacy: "private", ownerId: "p1", cards: ["c1"] }
        ],
        cards: [
          { id: "c1", defId: "m1", ownerId: "p1", controllerId: "p1", zoneId: "p1:hand", face: { faceUp: true, rotation: 0 }, counters: {} }
        ]
      }
    };
    
    state = applyCommittedEvent(state, initEvent);
    expect(state.zones["p1:hand"].cards).toEqual(["c1"]);

    // Move c1 to p1:hand (same zone)
    const moveEvent: CommittedEventView = {
      seq: 2,
      at: Date.now(),
      actorId: "p1",
      visibility: "public",
      event: { t: "move_card", cardId: "c1", toZoneId: "p1:hand" }
    };

    state = applyCommittedEvent(state, moveEvent);
    
    // Cards array should still only have one "c1", not ["c1", "c1"]
    expect(state.zones["p1:hand"].cards).toEqual(["c1"]);
  });
});
