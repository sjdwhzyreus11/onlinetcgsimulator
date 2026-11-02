import { describe, it, expect } from "vitest";
import { applyCommittedEvent, createInitialState } from "../state";
import type { GameConfig, CommittedEventView } from "../protocol";

describe("Game Logic Defects Fixes", () => {
  const config: GameConfig = { battlefieldCount: 3, matchMode: "BO1" };
  
  it("should play hand cards to battlefield face down", () => {
    let state = createInitialState({ roomId: "test", config });
    
    state = applyCommittedEvent(state, {
      seq: 1, at: Date.now(), actorId: "server", visibility: "public",
      event: {
        t: "init_game", config,
        players: [{ id: "p1", displayName: "P1" }],
        zones: [
          { id: "p1:hand", name: "Hand", privacy: "private", ownerId: "p1", cards: ["c1"] },
          { id: "shared:battlefield_left", name: "BF", privacy: "public", cards: [] }
        ],
        cards: [
          { id: "c1", defId: "m1", ownerId: "p1", controllerId: "p1", zoneId: "p1:hand", face: { faceUp: true, rotation: 0 }, counters: {} }
        ]
      }
    });

    // Move to battlefield
    state = applyCommittedEvent(state, {
      seq: 2, at: Date.now(), actorId: "p1", visibility: "public",
      event: { t: "move_card", cardId: "c1", toZoneId: "shared:battlefield_left" }
    });
    
    expect(state.cards["c1"].zoneId).toBe("shared:battlefield_left");
    expect(state.cards["c1"].face.faceUp).toBe(false);
  });

  it("should summon runes face up", () => {
    let state = createInitialState({ roomId: "test", config });
    
    state = applyCommittedEvent(state, {
      seq: 1, at: Date.now(), actorId: "server", visibility: "public",
      event: {
        t: "init_game", config,
        players: [{ id: "p1", displayName: "P1" }],
        zones: [
          { id: "p1:runeDeck", name: "Rune Deck", privacy: "secret", ownerId: "p1", cards: ["r1"] },
          { id: "p1:runeZone", name: "Rune Zone", privacy: "public", ownerId: "p1", cards: [] }
        ],
        cards: [
          { id: "r1", defId: "r1", ownerId: "p1", controllerId: "p1", zoneId: "p1:runeDeck", face: { faceUp: false, rotation: 0 }, counters: {} }
        ]
      }
    });

    // Draw top to rune zone
    state = applyCommittedEvent(state, {
      seq: 2, at: Date.now(), actorId: "p1", visibility: "public",
      event: { t: "draw_top", fromZoneId: "p1:runeDeck", toZoneId: "p1:runeZone" }
    });
    
    expect(state.cards["r1"].zoneId).toBe("p1:runeZone");
    expect(state.cards["r1"].face.faceUp).toBe(true);
  });
});