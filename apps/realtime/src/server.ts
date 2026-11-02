import { WebSocketServer } from "ws";
import {
  applyCommittedEvent,
  createInitialState,
  getPlayerZoneIds,
  type ClientMessage,
  type ClientEvent,
  type CommittedEvent,
  type CommittedEventView,
  type GameConfig,
  type GameStateView,
  type PlayerId,
  type PlayerState,
  type   SavedDeck,
  type CardDefinition,
  type ServerMessage,
  type ZoneId,
  type ZoneState
} from "@sim/shared";
import { loadSavedDeck, shuffle, loadCardCatalog } from "./deckLoader.js";

function isCardDefVisibleToViewer(
  card: { face: { faceUp: boolean }; controllerId: PlayerId },
  zone: ZoneState | undefined,
  viewerId: PlayerId
): boolean {
  if (!zone) return false;
  if (zone.privacy === "public") return true;
  const isOwner = zone.ownerId === viewerId;

  if (zone.privacy === "secret") {
    return isOwner;
  }
  if (zone.privacy === "private") {
    return isOwner && (card.face.faceUp || card.controllerId === viewerId);
  }
  return card.face.faceUp || card.controllerId === viewerId;
}

function getOpponent(playerId: PlayerId): PlayerId {
  return playerId === "p1" ? "p2" : "p1";
}

function battlefieldTargetForSelector(selectorId: PlayerId): ZoneId {
  return selectorId === "p1" ? "shared:battlefield_left" : "shared:battlefield_right";
}

function hasUnitHoldOnBattlefield(
  state: GameStateView,
  playerId: PlayerId,
  catalog: Map<string, CardDefinition>
): boolean {
  for (const zoneId of ["shared:battlefield_left", "shared:battlefield_right"] as ZoneId[]) {
    const zone = state.zones[zoneId];
    if (!zone) continue;
    for (const cardId of zone.cards) {
      const card = state.cards[cardId];
      if (!card || card.controllerId !== playerId || !card.defId) continue;
      const def = catalog.get(card.defId);
      if (def?.type === "unit") return true;
    }
  }
  return false;
}

function completeBattlefieldSetup(room: Room) {
  for (const zoneId of ["shared:battlefield_left", "shared:battlefield_right"] as ZoneId[]) {
    const zone = room.state.zones[zoneId];
    for (const cardId of zone?.cards ?? []) {
      commitEvent(room, "server", { t: "flip_card", cardId, faceUp: true }, "public");
    }
  }

  if (room.config.matchMode === "BO1") {
    for (const p of ["p1", "p2"] as PlayerId[]) {
      const bfZone = `${p}:unselectedBattlefields`;
      const exile = `${p}:exile`;
      const zone = room.state.zones[bfZone];
      if (!zone) continue;
      for (const cardId of [...zone.cards]) {
        commitEvent(room, "server", { t: "move_card", cardId, toZoneId: exile }, "public");
      }
    }
  }

  room.state.battlefieldsSelected = {};

  if (room.config.matchMode === "BO1") {
    beginMulliganPhase(room);
    return;
  }

  const gameIndex = room.state.gameIndex ?? 1;
  if (gameIndex > 1) {
    commitEvent(room, "server", { t: "set_phase", phase: "setup_first_player" }, "public");
    return;
  }

  const p1Roll = Math.floor(Math.random() * 12) + 1;
  const p2Roll = Math.floor(Math.random() * 12) + 1;
  commitEvent(room, "server", { t: "dice_rolled", rolls: { p1: p1Roll, p2: p2Roll } }, "public");
  commitEvent(room, "server", { t: "set_phase", phase: "setup_dice" }, "public");
}

function beginMulliganPhase(room: Room) {
  for (const p of ["p1", "p2"] as PlayerId[]) {
    commitEvent(room, "server", { t: "shuffle_pile", zoneId: `${p}:mainDeck` }, "public");
    commitEvent(room, "server", { t: "shuffle_pile", zoneId: `${p}:runeDeck` }, "public");
    for (let i = 0; i < 4; i++) {
      commitEvent(
        room,
        "server",
        { t: "draw_top", fromZoneId: `${p}:mainDeck`, toZoneId: `${p}:hand` },
        "public"
      );
    }
  }
  room.state.mulliganReady = {};
  commitEvent(room, "server", { t: "set_phase", phase: "setup_mulligan" }, "public");
  broadcastStateResync(room);
}

function runTurnStart(room: Room, playerId: PlayerId) {
  const catalog = room.cardCatalog ?? new Map<string, CardDefinition>();
  commitEvent(room, "server", { t: "set_active_player", playerId }, "public");
  commitEvent(room, "server", { t: "wake_all" }, "public");

  const mainDeck = `${playerId}:mainDeck`;
  const hand = `${playerId}:hand`;
  if ((room.state.zones[mainDeck]?.cards.length ?? 0) > 0) {
    commitEvent(room, "server", { t: "draw_top", fromZoneId: mainDeck, toZoneId: hand }, "public");
  }

  const runeDeck = `${playerId}:runeDeck`;
  const runeZone = `${playerId}:runeZone`;
  const firstPlayer = room.state.firstPlayer ?? "p1";
  const secondPlayer = getOpponent(firstPlayer);
  const turnCount = room.state.turnCounts?.[playerId] ?? 0;
  const isSecondPlayerFirstTurn = playerId === secondPlayer && turnCount === 0;
  const runeCount = isSecondPlayerFirstTurn ? 3 : 2;
  for (let i = 0; i < runeCount; i++) {
    if ((room.state.zones[runeDeck]?.cards.length ?? 0) > 0) {
      commitEvent(room, "server", { t: "draw_top", fromZoneId: runeDeck, toZoneId: runeZone }, "public");
    }
  }

  if (hasUnitHoldOnBattlefield(room.state, playerId, catalog)) {
    commitEvent(
      room,
      "server",
      { t: "set_counter", target: { kind: "player", id: playerId }, key: "score", delta: 1 },
      "public"
    );
  }

  commitEvent(room, "server", { t: "set_phase", phase: "main" }, "public");
  room.state.turnCounts = {
    ...(room.state.turnCounts ?? {}),
    [playerId]: turnCount + 1
  };
  broadcastStateResync(room);
}

function rebuildStateFromEvents(room: Room) {
  const base = createInitialState({ roomId: room.roomId, config: room.config });
  let state = base;
  for (const e of room.events) {
    state = applyCommittedEvent(state, e as CommittedEventView);
  }
  room.state = state;
}

function broadcastStateResync(room: Room) {
  for (const c of room.clients) {
    safeSend(c.ws, {
      t: "state_resync",
      roomId: room.roomId,
      latestSeq: room.latestSeq,
      state: filterStateForViewer(room.state, room, c.playerId)
    });
  }
}

function rewindRoom(room: Room) {
  if (room.events.length <= 1) return false;
  const last = room.events[room.events.length - 1];
  if (last.event.t === "init_game" || last.event.t === "sync_seats") return false;
  room.events.pop();
  room.latestSeq = room.events[room.events.length - 1].seq;
  rebuildStateFromEvents(room);
  broadcastStateResync(room);
  return true;
}

function isMainPhaseAction(event: ClientEvent): boolean {
  return (
    event.t === "move_card" ||
    event.t === "draw_top" ||
    event.t === "flip_card" ||
    event.t === "rotate_card" ||
    event.t === "set_counter" ||
    event.t === "shuffle_pile" ||
    event.t === "stack_note" ||
    event.t === "return_rune" ||
    event.t === "move_card_bottom" ||
    event.t === "set_scry_session"
  );
}

function filterCardForViewer<T extends { face: { faceUp: boolean }; controllerId: PlayerId; defId?: string }>(
  card: T,
  zone: ZoneState | undefined,
  viewerId: PlayerId
): T {
  return isCardDefVisibleToViewer(card, zone, viewerId) ? card : { ...card, defId: undefined };
}

function getCardRevealsForViewer(state: GameStateView, viewerId: PlayerId): Record<string, string> {
  const reveals: Record<string, string> = {};
  for (const [id, c] of Object.entries(state.cards)) {
    if (!c.defId) continue;
    const zone = state.zones[c.zoneId];
    if (isCardDefVisibleToViewer(c, zone, viewerId)) {
      reveals[id] = c.defId;
    }
  }
  return reveals;
}

type ClientConn = {
  ws: import("ws").WebSocket;
  roomId: string;
  playerId: PlayerId;
  displayName: string;
  lastSeenSeq: number;
  clientId: string;
};

type RoomSeat = {
  playerId: PlayerId;
  displayName: string;
  clientId: string;
  selectedDeckId?: string;
  selectedDeckName?: string;
  lobbyReady?: boolean;
};

type Room = {
  roomId: string;
  config: GameConfig;
  state: GameStateView;
  latestSeq: number;
  events: CommittedEvent[];
  clients: Set<ClientConn>;
  seats: RoomSeat[];
  started: boolean;
  ownerClientId?: string;
  cardCatalog?: Map<string, CardDefinition>;
  savedDecks?: Record<PlayerId, SavedDeck>;
};

const rooms = new Map<string, Room>();

function playerFromSeat(seat: RoomSeat): PlayerState {
  return {
    id: seat.playerId,
    displayName: seat.displayName,
    counters: {},
    selectedDeckId: seat.selectedDeckId,
    selectedDeckName: seat.selectedDeckName,
    lobbyReady: seat.lobbyReady ?? false
  };
}

function rebuildPlayersFromSeats(room: Room) {
  room.state.players = {};
  for (const s of room.seats) {
    room.state.players[s.playerId] = playerFromSeat(s);
  }
}

function syncSeats(room: Room) {
  rebuildPlayersFromSeats(room);
  commitEvent(
    room,
    "server",
    {
      t: "sync_seats",
      players: room.state.players,
      spectators: room.state.spectators,
      hostId: room.state.hostId
    },
    "public"
  );
}

function transferHost(room: Room, leavingPlayerId: PlayerId) {
  if (room.state.hostId !== leavingPlayerId) return;
  const remainingSeat = room.seats.find((s) => s.playerId !== leavingPlayerId);
  if (remainingSeat) {
    room.state.hostId = remainingSeat.playerId;
    return;
  }
  const remainingSpec = room.state.spectators.find((s) => s.id !== leavingPlayerId);
  room.state.hostId = remainingSpec?.id;
}

function startNextGame(room: Room) {
  if (!room.savedDecks) return;
  room.state.gameIndex = (room.state.gameIndex ?? 1) + 1;
  room.state.turnCounts = { p1: 0, p2: 0 };
  room.state.mulliganReady = {};
  room.state.battlefieldsSelected = {};
  room.state.activePlayer = undefined;
  room.state.firstPlayer = undefined;
  room.state.diceRolls = undefined;
  room.state.scrySession = undefined;

  const init = buildInitialGame(room.seats, room.config, room.savedDecks);
  commitEvent(room, "server", init, "public");
  commitEvent(room, "server", { t: "set_phase", phase: "setup_battlefield" }, "public");
  broadcastStateResync(room);
}

function finalizeMatchProposal(room: Room) {
  const prop = room.state.matchProposal;
  if (!prop) return;

  commitEvent(
    room,
    "server",
    { t: "match_result_confirmed", winnerId: prop.winnerId, kind: prop.kind },
    "public"
  );

  if (room.state.phase === "game_over") {
    broadcastStateResync(room);
    return;
  }

  if (prop.kind === "next_game") {
    startNextGame(room);
  }
}

function returnToLobby(room: Room) {
  for (const seat of room.seats) {
    seat.lobbyReady = false;
  }
  room.started = false;
  commitEvent(room, "server", { t: "return_to_lobby" }, "public");
  rebuildPlayersFromSeats(room);
  syncSeats(room);
  broadcastStateResync(room);
}

function clearSeatLobby(seat: RoomSeat) {
  seat.selectedDeckId = undefined;
  seat.selectedDeckName = undefined;
  seat.lobbyReady = false;
}

function getOrCreateRoom(roomId: string): Room {
  const existing = rooms.get(roomId);
  if (existing) return existing;

  const config: GameConfig = { battlefieldCount: 3, matchMode: "BO1" };
  const room: Room = {
    roomId,
    config,
    state: createInitialState({ roomId, config }),
    latestSeq: 0,
    events: [],
    clients: new Set(),
    seats: [],
    started: false
  };
  rooms.set(roomId, room);
  return room;
}

function safeSend(ws: import("ws").WebSocket, msg: ServerMessage) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function commitEvent(room: Room, actorId: PlayerId, event: any, visibility: "public" | "ownerOnly" | "hidden" = "public") {
  const committed: CommittedEvent = {
    seq: room.latestSeq + 1,
    at: Date.now(),
    actorId,
    visibility,
    event
  };
  room.latestSeq = committed.seq;
  room.events.push(committed);
  room.state = applyCommittedEvent(room.state, committed as CommittedEventView);

  for (const c of room.clients) {
    const view = toCommittedEventView(committed, room, c.playerId);
    safeSend(c.ws, {
      t: "event_committed",
      roomId: room.roomId,
      latestSeq: room.latestSeq,
      event: view,
      cardReveals: getCardRevealsForViewer(room.state, c.playerId)
    });
  }
}

function toCommittedEventView(
  committed: CommittedEvent,
  room: Room,
  viewerId: PlayerId
): CommittedEventView {
  if (committed.event?.t === "init_game") {
    return {
      ...committed,
      event: toInitGameView(committed.event, viewerId, room.config)
    };
  }
  return committed as CommittedEventView;
}

function toInitGameView(init: any, viewerId: PlayerId, config: GameConfig) {
  const zonesById = new Map<string, ZoneState>();
  for (const z of init.zones as ZoneState[]) zonesById.set(z.id, z);

  const cards = (init.cards as any[]).map((c) => {
    const zone = zonesById.get(c.zoneId);
    return filterCardForViewer(c, zone, viewerId);
  });

  return { ...init, config, cards };
}

function buildInitialGame(
  seats: Array<{ playerId: PlayerId; displayName: string }>,
  config: GameConfig,
  decks: Record<PlayerId, SavedDeck>
) {
  const zones: ZoneState[] = [];
  const cards: any[] = [];
  let cardSeq = 1;

  function addZone(id: string, name: string, privacy: "public" | "private" | "secret", ownerId?: PlayerId) {
    zones.push({ id, name, privacy, ownerId, cards: [] });
    return id;
  }

  function addCardInstance(
    defId: string,
    ownerId: PlayerId,
    zoneId: string,
    faceUp: boolean
  ): string {
    const cId = `c${cardSeq++}`;
    cards.push({
      id: cId,
      defId,
      ownerId,
      controllerId: ownerId,
      zoneId,
      face: { faceUp, rotation: 0 },
      counters: {}
    });
    return cId;
  }

  addZone("shared:battlefield_left", "左侧战场", "public");
  addZone("shared:battlefield_right", "右侧战场", "public");

  for (const s of seats) {
    const p = s.playerId;
    const deck = decks[p];
    const zHand = addZone(`${p}:hand`, "手牌", "private", p);
    const zMain = addZone(`${p}:mainDeck`, "主牌堆", "secret", p);
    const zRune = addZone(`${p}:runeDeck`, "符文牌堆", "secret", p);
    addZone(`${p}:discard`, "废牌堆", "public", p);
    addZone(`${p}:exile`, "放逐区域", "public", p);
    const zHeroLegend = addZone(`${p}:heroLegend`, "传奇/英雄", "public", p);
    addZone(`${p}:base`, "基地区", "public", p);
    addZone(`${p}:runeZone`, "符文区", "public", p);
    const zUnselectedBF = addZone(`${p}:unselectedBattlefields`, "未选战场", "secret", p);

    if (deck.legendCardId) {
      const legendId = addCardInstance(deck.legendCardId, p, zHeroLegend, true);
      zones.find((z) => z.id === zHeroLegend)!.cards.push(legendId);
    }
    if (deck.heroCardId) {
      const heroId = addCardInstance(deck.heroCardId, p, zHeroLegend, true);
      zones.find((z) => z.id === zHeroLegend)!.cards.push(heroId);
    }

    const mainDefIds = deck.mainDeck.filter((id) => id !== deck.heroCardId);
    const mainInstanceIds: string[] = [];
    for (const defId of mainDefIds) {
      mainInstanceIds.push(addCardInstance(defId, p, zMain, false));
    }

    zones.find((z) => z.id === zMain)!.cards.push(...mainInstanceIds);

    for (const defId of deck.runeDeck) {
      const cId = addCardInstance(defId, p, zRune, false);
      zones.find((z) => z.id === zRune)!.cards.push(cId);
    }

    for (const defId of deck.battlefields ?? []) {
      const cId = addCardInstance(defId, p, zUnselectedBF, false);
      zones.find((z) => z.id === zUnselectedBF)!.cards.push(cId);
    }
  }

  return {
    t: "init_game",
    config,
    players: seats.map((seat) => ({ id: seat.playerId, displayName: seat.displayName, counters: {} })),
    zones,
    cards,
    note: "双方准备完毕，进入选择先后手环节"
  };
}

const port = Number(process.env.REALTIME_PORT ?? "8787");
const wss = new WebSocketServer({ port });

wss.on("connection", (ws) => {
  let conn: ClientConn | null = null;

  ws.on("message", (raw) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString("utf8"));
    } catch {
      safeSend(ws, { t: "error", code: "bad_json", message: "Invalid JSON" });
      return;
    }

    if (msg.t === "ping") {
      safeSend(ws, { t: "pong" });
      return;
    }

    if (msg.t === "join_room") {
      const room = getOrCreateRoom(msg.roomId);
      
      if (!room.ownerClientId) {
        room.ownerClientId = msg.clientId;
      }

      // We need a stable ID for the connection
      let playerId = msg.clientId || msg.displayName;

      // Find if they are already in seats or spectators using clientId
      const existingSeat = room.seats.find((s) => s.clientId === msg.clientId);
      const existingSpec = room.state.spectators.find((s) => s.id === msg.clientId);

      let roleId = existingSeat?.playerId ?? existingSpec?.id ?? playerId;

      if (existingSeat) {
        existingSeat.displayName = msg.displayName;
        if (room.state.players[existingSeat.playerId]) {
          room.state.players[existingSeat.playerId].displayName = msg.displayName;
        }
      }
      if (existingSpec) {
        existingSpec.displayName = msg.displayName;
      }

      // Auto-recover host permission if this client is the original owner
      if (room.ownerClientId === msg.clientId) {
        room.state.hostId = roleId;
      } else if (!room.state.hostId) {
        room.state.hostId = roleId;
      }

      // If they are new and room hasn't started, add them to spectators by default
      if (!existingSeat && !existingSpec) {
        // Double check if roleId is truly unique, if not add a suffix
        const isNameTaken = room.state.spectators.find(s => s.id === roleId) || room.seats.find(s => s.playerId === roleId);
        if (isNameTaken) {
           roleId = `${roleId}_${Math.floor(Math.random() * 1000)}`;
        }
        room.state.spectators.push({ id: roleId, displayName: msg.displayName });
        commitEvent(room, "server", { t: "sync_seats", players: room.state.players, spectators: room.state.spectators, hostId: room.state.hostId }, "public");
      }

      for (const c of room.clients) {
        if (c.clientId === msg.clientId) c.ws.close();
      }

      conn = { ws, roomId: room.roomId, playerId: roleId, displayName: msg.displayName, lastSeenSeq: msg.lastSeenSeq, clientId: msg.clientId };
      room.clients.add(conn);

      // Trigger a sync seats specifically for this client as part of connection initialization
      // so they immediately know who the host is and their own state
      commitEvent(room, "server", { t: "sync_seats", players: room.state.players, spectators: room.state.spectators, hostId: room.state.hostId }, "public");

      const snapshot = { seq: room.latestSeq, state: filterStateForViewer(room.state, room, roleId) };

      safeSend(ws, {
        t: "room_state",
        roomId: room.roomId,
        yourPlayerId: roleId,
        latestSeq: room.latestSeq,
        snapshot,
        events: []
      });

      return;
    }

    if (!conn) {
      safeSend(ws, { t: "error", code: "not_joined", message: "Join room first" });
      return;
    }

    if (msg.t === "submit_event") {
      const room = rooms.get(conn.roomId);
      if (!room) {
        safeSend(ws, { t: "error", code: "room_missing", message: "Room not found" });
        return;
      }

      const event = msg.event;

      // Handle Lobby Events
      if (event.t === "take_seat") {
        if (room.started) return;
        const targetSeat = event.seat;
        if (targetSeat === "spec") {
          room.seats = room.seats.filter(s => s.clientId !== conn!.clientId);
          if (!room.state.spectators.find(s => s.id === conn!.clientId)) {
             room.state.spectators.push({ id: conn!.clientId, displayName: conn!.displayName });
          }
          if (room.state.hostId === conn!.playerId) {
            room.state.hostId = conn!.clientId;
          }
          conn!.playerId = conn!.clientId;
          safeSend(conn!.ws, { t: "identity_update", yourPlayerId: conn!.playerId });
        } else {
          const isTaken = room.seats.find(s => s.playerId === targetSeat);
          if (!isTaken) {
            room.seats = room.seats.filter(s => s.clientId !== conn!.clientId);
            room.state.spectators = room.state.spectators.filter(s => s.id !== conn!.clientId && s.id !== conn!.playerId);
            room.seats.push({ playerId: targetSeat, displayName: conn!.displayName, clientId: conn!.clientId });
            
            if (room.state.hostId === conn!.playerId) {
              room.state.hostId = targetSeat;
            }
            conn!.playerId = targetSeat; // update connection player id
            safeSend(conn!.ws, { t: "identity_update", yourPlayerId: conn!.playerId });
          }
        }

        // Rebuild players state
        syncSeats(room);
        return;
      }

      if (event.t === "select_deck") {
        if (room.started) return;
        const seat = room.seats.find((s) => s.clientId === conn!.clientId);
        if (!seat) {
          safeSend(ws, { t: "error", code: "not_seated", message: "请先入座对战席" });
          return;
        }
        void (async () => {
          const deck = await loadSavedDeck(event.deckId);
          if (!deck) {
            safeSend(ws, { t: "error", code: "deck_not_found", message: "牌组不存在" });
            return;
          }
          seat.selectedDeckId = deck.id;
          seat.selectedDeckName = deck.name;
          seat.lobbyReady = false;
          commitEvent(
            room,
            conn!.playerId,
            { t: "select_deck", deckId: deck.id, deckName: deck.name },
            "public"
          );
          syncSeats(room);
        })();
        return;
      }

      if (event.t === "set_lobby_ready") {
        if (room.started) return;
        const seat = room.seats.find((s) => s.clientId === conn!.clientId);
        if (!seat) {
          safeSend(ws, { t: "error", code: "not_seated", message: "请先入座对战席" });
          return;
        }
        if (event.ready && !seat.selectedDeckId) {
          safeSend(ws, { t: "error", code: "no_deck", message: "请先选择牌组" });
          return;
        }
        seat.lobbyReady = event.ready;
        commitEvent(room, conn!.playerId, event, "public");
        syncSeats(room);
        return;
      }

      if (event.t === "leave_seat") {
        if (room.started) return;
        const leavingPlayerId = conn!.playerId;
        const leavingSeat = room.seats.find((s) => s.clientId === conn!.clientId);
        if (leavingSeat) clearSeatLobby(leavingSeat);
        room.seats = room.seats.filter(s => s.clientId !== conn!.clientId);
        if (!room.state.spectators.find(s => s.id === conn!.clientId)) {
          room.state.spectators.push({ id: conn!.clientId, displayName: conn!.displayName });
        }
        transferHost(room, leavingPlayerId);
        conn!.playerId = conn!.clientId;
        safeSend(conn!.ws, { t: "identity_update", yourPlayerId: conn!.playerId });
        syncSeats(room);
        return;
      }

      if (event.t === "leave_room") {
        const leavingPlayerId = conn!.playerId;
        const leavingSeat = room.seats.find((s) => s.clientId === conn!.clientId);
        if (leavingSeat) clearSeatLobby(leavingSeat);
        room.seats = room.seats.filter((s) => s.clientId !== conn!.clientId);
        if (!room.state.spectators.find((s) => s.id === conn!.clientId)) {
          room.state.spectators.push({ id: conn!.clientId, displayName: conn!.displayName });
        }
        transferHost(room, leavingPlayerId);
        conn!.playerId = conn!.clientId;
        safeSend(conn!.ws, { t: "identity_update", yourPlayerId: conn!.playerId });
        commitEvent(room, leavingPlayerId, { t: "leave_room" }, "public");
        syncSeats(room);
        return;
      }

      if (event.t === "kick_player") {
        if (room.started || conn!.playerId !== room.state.hostId) return;
        const targetId = event.targetId;
        const kickedSeat = room.seats.find((s) => s.playerId === targetId);
        if (kickedSeat) clearSeatLobby(kickedSeat);
        room.seats = room.seats.filter(s => s.playerId !== targetId);
        room.state.spectators = room.state.spectators.filter(s => s.id !== targetId);
        syncSeats(room);
        
        // Disconnect the kicked client
        for (const c of room.clients) {
          if (c.playerId === targetId) c.ws.close();
        }
        return;
      }

      if (event.t === "set_match_mode") {
        if (room.started || conn.playerId !== room.state.hostId) return;
        
        // Optimistic locking / Version check
        if (msg.expectedSeq !== undefined && msg.expectedSeq !== room.latestSeq) {
          safeSend(ws, { t: "error", code: "conflict", message: "State conflict, please retry" });
          return;
        }

        // Idempotent operation
        if (room.config.matchMode === event.mode) {
          // Already in the requested mode, just return success without bumping seq
          return;
        }

        room.config.matchMode = event.mode;
        
        // Broadcast the full room state sync or just the event
        commitEvent(room, conn.playerId, event, "public");
        return;
      }

      if (event.t === "mulligan") {
        if (room.state.phase !== "setup_mulligan") return;
        
        // Prevent double mulligan
        if (room.state.mulliganReady?.[conn.playerId]) {
          safeSend(ws, { t: "error", code: "already_submitted", message: "You have already completed mulligan." });
          return;
        }

        if (event.cardIds.length > 2) {
          safeSend(ws, { t: "error", code: "invalid_mulligan", message: "最多调度 2 张手牌" });
          return;
        }

        commitEvent(room, conn.playerId, event, "public");

        const p1Ready = room.state.mulliganReady?.p1;
        const p2Ready = room.state.mulliganReady?.p2;

        if (p1Ready && p2Ready) {
          runTurnStart(room, room.state.firstPlayer ?? "p1");
        }
        return;
      }

      if (event.t === "select_battlefield") {
        if (room.state.phase !== "setup_battlefield") return;
        if (room.state.battlefieldsSelected?.[conn.playerId]) {
          safeSend(ws, { t: "error", code: "already_selected", message: "你已经选择过战场" });
          return;
        }

        const card = room.state.cards[event.cardId];
        if (!card) return;

        const isBO3 = room.config.matchMode === "BO3";
        if (isBO3) {
          const ownBF = `${conn.playerId}:unselectedBattlefields`;
          if (card.zoneId !== ownBF) {
            safeSend(ws, { t: "error", code: "invalid_card", message: "请选择自己的一张战场牌" });
            return;
          }
          const used = room.state.usedBattlefieldIds?.[conn.playerId] ?? [];
          if (card.defId && used.includes(card.defId)) {
            safeSend(ws, { t: "error", code: "already_used", message: "该战场在本系列赛中已使用过" });
            return;
          }
        } else {
          const opponent = getOpponent(conn.playerId);
          const oppBF = `${opponent}:unselectedBattlefields`;
          if (card.zoneId !== oppBF) {
            safeSend(ws, { t: "error", code: "invalid_card", message: "请选择对手的一张战场牌" });
            return;
          }
        }

        if (event.targetZoneId !== battlefieldTargetForSelector(conn.playerId)) {
          safeSend(ws, { t: "error", code: "invalid_target", message: "无效的战场区域" });
          return;
        }

        commitEvent(room, conn.playerId, event, "public");

        if (room.state.battlefieldsSelected?.p1 && room.state.battlefieldsSelected?.p2) {
          completeBattlefieldSetup(room);
        }
        return;
      }

      if (event.t === "end_turn") {
        if (room.state.phase !== "main") {
          safeSend(ws, { t: "error", code: "wrong_phase", message: `当前阶段无法结束回合（${room.state.phase}）` });
          return;
        }
        if (conn.playerId !== room.state.activePlayer) {
          safeSend(ws, { t: "error", code: "not_your_turn", message: "未到你的回合" });
          return;
        }
        const next = getOpponent(conn.playerId);
        commitEvent(room, conn.playerId, { t: "end_turn" }, "public");
        runTurnStart(room, next);
        return;
      }

      if (event.t === "rewind") {
        if (!rewindRoom(room)) {
          safeSend(ws, { t: "error", code: "cannot_rewind", message: "无法回溯" });
        }
        return;
      }

      if (event.t === "return_rune") {
        if (room.state.phase !== "main" || conn.playerId !== room.state.activePlayer) return;
        commitEvent(room, conn.playerId, event, "public");
        return;
      }

      if (event.t === "move_card_bottom") {
        if (room.state.phase !== "main" || conn.playerId !== room.state.activePlayer) return;
        commitEvent(room, conn.playerId, event, "public");
        return;
      }

      if (event.t === "set_scry_session") {
        if (room.state.phase !== "main" || conn.playerId !== room.state.activePlayer) return;
        commitEvent(room, conn.playerId, event, "public");
        return;
      }

      if (event.t === "start_game") {
        if (room.started || conn.playerId !== room.state.hostId) {
          safeSend(ws, { t: "error", code: "unauthorized", message: "Only the host can start the game." });
          return;
        }

        void (async () => {
          rebuildPlayersFromSeats(room);
          const filledSeatsCount = room.seats.length;
          if (filledSeatsCount !== 2) {
            safeSend(ws, { t: "error", code: "not_enough_players", message: "Need 2 players to start" });
            return;
          }

          const p1Seat = room.seats.find((s) => s.playerId === "p1");
          const p2Seat = room.seats.find((s) => s.playerId === "p2");
          if (!p1Seat || !p2Seat) {
            safeSend(ws, { t: "error", code: "seats_incomplete", message: "需要两名玩家分别入座 p1 和 p2" });
            return;
          }

          if (!p1Seat.lobbyReady || !p2Seat.lobbyReady || !p1Seat.selectedDeckId || !p2Seat.selectedDeckId) {
            safeSend(ws, { t: "error", code: "not_ready", message: "两名对战玩家都需选择牌组并准备就绪" });
            return;
          }

          const deckP1 = await loadSavedDeck(p1Seat.selectedDeckId);
          const deckP2 = await loadSavedDeck(p2Seat.selectedDeckId);
          if (!deckP1 || !deckP2) {
            safeSend(ws, { t: "error", code: "deck_not_found", message: "牌组加载失败" });
            return;
          }

          room.started = true;
          room.savedDecks = { p1: deckP1, p2: deckP2 };
          room.cardCatalog = await loadCardCatalog();
          room.state.gameIndex = 1;
          room.state.gamesWon = { p1: 0, p2: 0 };
          room.state.usedBattlefieldIds = { p1: [], p2: [] };
          room.state.turnCounts = { p1: 0, p2: 0 };
          commitEvent(room, conn.playerId, event, "public");
          const init = buildInitialGame(room.seats, room.config, { p1: deckP1, p2: deckP2 });
          commitEvent(room, "server", init, "public");

          if (room.config.matchMode === "BO3") {
            commitEvent(room, "server", { t: "set_phase", phase: "setup_battlefield" }, "public");
          } else {
            const p1Roll = Math.floor(Math.random() * 12) + 1;
            const p2Roll = Math.floor(Math.random() * 12) + 1;
            commitEvent(room, "server", { t: "dice_rolled", rolls: { p1: p1Roll, p2: p2Roll } }, "public");
            commitEvent(room, "server", { t: "set_phase", phase: "setup_dice" }, "public");
          }
        })();
        return;
      }

      if (!room.started) {
        safeSend(ws, { t: "error", code: "not_started", message: "Room not started" });
        return;
      }

      if (event.t === "propose_match_result") {
        if (room.state.phase !== "main") {
          safeSend(ws, { t: "error", code: "wrong_phase", message: "当前阶段无法提交对局结果" });
          return;
        }
        if (room.state.matchProposal) {
          safeSend(ws, { t: "error", code: "proposal_pending", message: "已有待确认的对局结果" });
          return;
        }
        const isSeated = room.seats.some((s) => s.playerId === conn!.playerId);
        if (!isSeated) {
          safeSend(ws, { t: "error", code: "not_seated", message: "仅对战玩家可提交结果" });
          return;
        }
        if (event.winnerId !== "p1" && event.winnerId !== "p2") {
          safeSend(ws, { t: "error", code: "invalid_winner", message: "无效的胜者" });
          return;
        }
        if (room.config.matchMode === "BO1" && event.kind !== "end_match") {
          safeSend(ws, { t: "error", code: "invalid_kind", message: "BO1 模式只能结束对局" });
          return;
        }
        commitEvent(room, conn.playerId, event, "public");
        return;
      }

      if (event.t === "respond_match_proposal") {
        const prop = room.state.matchProposal;
        if (!prop) {
          safeSend(ws, { t: "error", code: "no_proposal", message: "没有待确认的对局结果" });
          return;
        }
        if (conn.playerId === prop.proposerId) {
          safeSend(ws, { t: "error", code: "cannot_self_confirm", message: "不能确认自己提交的结果" });
          return;
        }
        const opponent = getOpponent(prop.proposerId);
        if (conn.playerId !== opponent) {
          safeSend(ws, { t: "error", code: "not_opponent", message: "仅对手可确认结果" });
          return;
        }
        commitEvent(room, conn.playerId, event, "public");
        if (event.accept) {
          finalizeMatchProposal(room);
        }
        return;
      }

      if (event.t === "return_to_lobby") {
        if (room.state.phase !== "game_over") {
          safeSend(ws, { t: "error", code: "wrong_phase", message: "对局尚未结束" });
          return;
        }
        returnToLobby(room);
        return;
      }

      // Inside game events
      if (event.t === "choose_first_player") {
        if (room.state.phase !== "setup_dice" && room.state.phase !== "setup_first_player") return;
        
        if (msg.expectedSeq !== undefined && msg.expectedSeq !== room.latestSeq) {
          safeSend(ws, { t: "error", code: "conflict", message: "State conflict, please retry" });
          return;
        }

        if (room.state.phase === "setup_dice") {
          const p1Roll = room.state.diceRolls?.p1 ?? 0;
          const p2Roll = room.state.diceRolls?.p2 ?? 0;
          let winner: PlayerId = "p1";
          if (p2Roll > p1Roll) winner = "p2";
          if (conn.playerId !== winner) {
            safeSend(ws, { t: "error", code: "unauthorized", message: "Only the dice winner can choose first player" });
            return;
          }
        } else {
          const chooser = room.state.lastGameLoser;
          if (!chooser || conn.playerId !== chooser) {
            safeSend(ws, { t: "error", code: "unauthorized", message: "仅上一局败者可选择先后攻" });
            return;
          }
        }

        commitEvent(room, conn.playerId, event, "public");
        if (room.config.matchMode === "BO1") {
          commitEvent(room, "server", { t: "set_phase", phase: "setup_battlefield" }, "public");
        } else {
          beginMulliganPhase(room);
        }
        return;
      }

      if (event.t === "set_phase") {
        return;
      }

      if (event.t === "set_counter") {
        commitEvent(room, conn.playerId, event, "public");
        return;
      }

      if (isMainPhaseAction(event)) {
        if (room.state.phase !== "main") {
          safeSend(ws, { t: "error", code: "wrong_phase", message: "当前阶段无法执行该操作" });
          return;
        }
        if (conn.playerId !== room.state.activePlayer) {
          safeSend(ws, { t: "error", code: "not_your_turn", message: "未到你的回合" });
          return;
        }
      }

      commitEvent(room, conn.playerId, event, "public");
      return;
    }
  });

  ws.on("close", () => {
    if (!conn) return;
    const room = rooms.get(conn.roomId);
    if (!room) return;
    room.clients.delete(conn);

    if (!room.started) {
      // Don't remove players immediately on disconnect, they might just be refreshing.
      const clientId = conn.clientId;
      const disconnectedPlayerId = conn.playerId;

      setTimeout(() => {
        const stillConnected = Array.from(room.clients).find(c => c.clientId === clientId);
        if (!stillConnected) {
          room.seats = room.seats.filter(s => s.clientId !== clientId);
          room.state.spectators = room.state.spectators.filter(s => s.id !== clientId);
          transferHost(room, disconnectedPlayerId);
          syncSeats(room);
        }
      }, 500);
    } else {
      const clientId = conn.clientId;
      const disconnectedPlayerId = conn.playerId;

      setTimeout(() => {
        const stillConnected = Array.from(room.clients).find((c) => c.clientId === clientId);
        if (!stillConnected) {
          transferHost(room, disconnectedPlayerId);
          syncSeats(room);
        }
      }, 500);
    }
  });
});

function filterStateForViewer(state: GameStateView, room: Room, viewerId: PlayerId): GameStateView {
  const zones = state.zones;
  const cards: GameStateView["cards"] = {};
  for (const [id, c] of Object.entries(state.cards)) {
    const zone = zones[c.zoneId];
    cards[id] = filterCardForViewer(c, zone, viewerId);
  }
  return { ...state, cards };
}

console.log(`[realtime] ws://localhost:${port}`);
