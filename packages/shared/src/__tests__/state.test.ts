import { describe, it, expect } from "vitest";
import { applyCommittedEvent, createInitialState } from "../state";
import type { GameConfig, CommittedEventView } from "../protocol";

describe("GameState Sync & Conflict Resolution", () => {
  const config: GameConfig = { battlefieldCount: 3, matchMode: "BO1" };
  
  it("should initialize state correctly", () => {
    const state = createInitialState({ roomId: "test", config });
    expect(state.roomId).toBe("test");
    expect(state.config.matchMode).toBe("BO1");
  });

  it("should update match mode idempotently", () => {
    let state = createInitialState({ roomId: "test", config });
    
    // First change to BO3
    const event1: CommittedEventView = {
      seq: 1,
      at: Date.now(),
      actorId: "host",
      visibility: "public",
      event: { t: "set_match_mode", mode: "BO3" }
    };
    state = applyCommittedEvent(state, event1);
    expect(state.config.matchMode).toBe("BO3");

    // Second change to BO3 (idempotent check at state reducer level)
    const event2: CommittedEventView = {
      seq: 2,
      at: Date.now(),
      actorId: "host",
      visibility: "public",
      event: { t: "set_match_mode", mode: "BO3" }
    };
    const newState = applyCommittedEvent(state, event2);
    expect(newState.config.matchMode).toBe("BO3");
  });

  it("should synchronize seats and hostId accurately", () => {
    let state = createInitialState({ roomId: "test", config });
    
    const syncEvent: CommittedEventView = {
      seq: 1,
      at: Date.now(),
      actorId: "server",
      visibility: "public",
      event: {
        t: "sync_seats",
        players: {
          p1: { id: "p1", displayName: "Player 1", counters: {} }
        },
        spectators: [],
        hostId: "p1"
      }
    };
    
    state = applyCommittedEvent(state, syncEvent);
    expect(state.players["p1"]).toBeDefined();
    expect(state.hostId).toBe("p1");
  });
});
