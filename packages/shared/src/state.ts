import type {
  CardId,
  CommittedEventView,
  GameConfig,
  GameStateView,
  PlayerId,
  ZoneId
} from "./protocol.js";

function isTrustedActor(actorId: PlayerId): boolean {
  return actorId === "server";
}

function shuffleArray<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function canAccessZone(actorId: PlayerId, zone: { ownerId?: PlayerId; privacy: string } | undefined): boolean {
  if (!zone) return false;
  if (isTrustedActor(actorId)) return true;
  if (!zone.ownerId) return true;
  if (zone.ownerId === actorId) return true;
  return zone.privacy === "public";
}

export function createInitialState(params: {
  roomId: string;
  config: GameConfig;
}): GameStateView {
  return {
    roomId: params.roomId,
    config: params.config,
    phase: "lobby",
    players: {},
    spectators: [],
    zones: {},
    cards: {},
    log: []
  };
}

export function applyCommittedEvent(
  prev: GameStateView,
  committed: CommittedEventView
): GameStateView {
  let state: GameStateView = {
    ...prev,
    players: { ...prev.players },
    zones: { ...prev.zones },
    cards: { ...prev.cards },
    log: prev.log.slice()
  };

  const logText = describeEvent(committed);
  if (logText) state.log.push({ seq: committed.seq, text: logText });

  switch (committed.event.t) {
    case "init_game": {
      const e = committed.event;
      state.config = e.config;
      state.phase = "wakeup";
      state.players = {};
      for (const p of e.players) {
        state.players[p.id] = { id: p.id, displayName: p.displayName, counters: {} };
      }
      state.zones = {};
      for (const z of e.zones) {
        state.zones[z.id] = { ...z, cards: z.cards.slice() };
      }
      state.cards = {};
      for (const c of e.cards) {
        state.cards[c.id] = { ...c };
      }
      state.log = [];
      if (e.note) state.log.push({ seq: committed.seq, text: e.note });
      return state;
    }
    case "set_phase": {
      state.phase = committed.event.phase;
      return state;
    }
    case "move_card": {
      const e = committed.event;
      const card = state.cards[e.cardId];
      if (!card) return state;
      const fromZone = state.zones[card.zoneId];
      if (
        !isTrustedActor(committed.actorId) &&
        fromZone &&
        fromZone.ownerId &&
        fromZone.ownerId !== committed.actorId &&
        (fromZone.privacy === "private" || fromZone.privacy === "secret")
      ) {
        return state;
      }
      state = moveCard(state, e.cardId, e.toZoneId, e.pos);

      const toZone = state.zones[e.toZoneId];
      if (toZone?.privacy === "public") {
        const cardAfter = state.cards[e.cardId];
        const face = { ...cardAfter.face, rotation: 90 as const };
        if (fromZone?.privacy === "private") {
          face.faceUp = cardAfter.face.faceUp;
        }
        state.cards[e.cardId] = { ...cardAfter, face };
      } else if (e.toZoneId.endsWith(":hand")) {
        state.cards[e.cardId] = {
          ...state.cards[e.cardId],
          face: { ...state.cards[e.cardId].face, faceUp: true }
        };
      }
      return state;
    }
    case "move_card_bottom": {
      const e = committed.event;
      const card = state.cards[e.cardId];
      if (!card) return state;
      const fromZone = state.zones[card.zoneId];
      if (
        !isTrustedActor(committed.actorId) &&
        fromZone &&
        fromZone.ownerId &&
        fromZone.ownerId !== committed.actorId &&
        (fromZone.privacy === "private" || fromZone.privacy === "secret")
      ) {
        return state;
      }
      return moveCardToBottom(state, e.cardId, e.toZoneId);
    }
    case "return_rune": {
      const e = committed.event;
      const card = state.cards[e.cardId];
      if (!card) return state;
      const runeZoneId = `${committed.actorId}:runeZone`;
      const runeDeckId = `${committed.actorId}:runeDeck`;
      if (card.zoneId !== runeZoneId) return state;
      state = moveCardToBottom(state, e.cardId, runeDeckId);
      state.cards[e.cardId] = {
        ...state.cards[e.cardId],
        face: { faceUp: false, rotation: 0 }
      };
      return state;
    }
    case "set_scry_session": {
      if (committed.event.active) {
        state.scrySession = { playerId: committed.actorId, active: true };
      } else if (state.scrySession?.playerId === committed.actorId) {
        state.scrySession = undefined;
      }
      return state;
    }
    case "rewind": {
      return state;
    }
    case "draw_top": {
      const e = committed.event;
      const from = state.zones[e.fromZoneId];
      if (!from || from.cards.length === 0) return state;
      if (
        !isTrustedActor(committed.actorId) &&
        from.ownerId &&
        from.ownerId !== committed.actorId &&
        (from.privacy === "private" || from.privacy === "secret")
      ) {
        return state;
      }
      const cardId = from.cards[from.cards.length - 1];
      state = moveCardFromZone(state, cardId, e.fromZoneId, e.toZoneId);
      const moved = state.cards[cardId];
      if (!moved) return state;

      if (e.toZoneId.endsWith(":runeZone")) {
        state.cards[cardId] = {
          ...moved,
          face: { faceUp: true, rotation: 0 }
        };
      } else if (e.toZoneId.endsWith(":hand")) {
        state.cards[cardId] = {
          ...moved,
          face: { ...moved.face, faceUp: true }
        };
      }
      return state;
    }
    case "flip_card": {
      const e = committed.event;
      const card = state.cards[e.cardId];
      if (!card) return state;
      const fromZone = state.zones[card.zoneId];
      if (
        !isTrustedActor(committed.actorId) &&
        fromZone &&
        fromZone.ownerId &&
        fromZone.ownerId !== committed.actorId &&
        (fromZone.privacy === "private" || fromZone.privacy === "secret")
      ) {
        return state;
      }
      state.cards[e.cardId] = { ...card, face: { ...card.face, faceUp: e.faceUp } };
      return state;
    }
    case "rotate_card": {
      const e = committed.event;
      const card = state.cards[e.cardId];
      if (!card) return state;
      const fromZone = state.zones[card.zoneId];
      if (
        !isTrustedActor(committed.actorId) &&
        fromZone &&
        fromZone.ownerId &&
        fromZone.ownerId !== committed.actorId &&
        (fromZone.privacy === "private" || fromZone.privacy === "secret")
      ) {
        return state;
      }
      state.cards[e.cardId] = { ...card, face: { ...card.face, rotation: e.rotation } };
      return state;
    }
    case "set_counter": {
      const e = committed.event;
      if (e.target.kind === "player") {
        if (!isTrustedActor(committed.actorId) && e.target.id !== committed.actorId) return state;
        const p = state.players[e.target.id];
        if (!p) return state;
        const next = { ...(p.counters ?? {}) };
        next[e.key] = (next[e.key] ?? 0) + e.delta;
        state.players[e.target.id] = { ...p, counters: next };
        return state;
      }
      const card = state.cards[e.target.id];
      if (!card) return state;
      const fromZone = state.zones[card.zoneId];
      if (
        !isTrustedActor(committed.actorId) &&
        fromZone &&
        fromZone.ownerId &&
        fromZone.ownerId !== committed.actorId &&
        (fromZone.privacy === "private" || fromZone.privacy === "secret")
      ) {
        return state;
      }
      const next = { ...(card.counters ?? {}) };
      next[e.key] = (next[e.key] ?? 0) + e.delta;
      state.cards[e.target.id] = { ...card, counters: next };
      return state;
    }
    case "shuffle_pile": {
      const zone = state.zones[committed.event.zoneId];
      if (!zone) return state;
      if (!canAccessZone(committed.actorId, zone)) return state;
      state.zones[committed.event.zoneId] = {
        ...zone,
        cards: shuffleArray(zone.cards)
      };
      return state;
    }
    case "stack_note": {
      return state;
    }
    case "wake_all": {
      for (const id of Object.keys(state.cards)) {
        const card = state.cards[id];
        state.cards[id] = { ...card, face: { ...card.face, rotation: 0 } };
      }
      return state;
    }
    case "set_active_player": {
      state.activePlayer = committed.event.playerId;
      return state;
    }
    case "end_turn": {
      return state;
    }
    case "select_battlefield": {
      const e = committed.event;
      if (state.phase !== "setup_battlefield") return state;
      if (state.battlefieldsSelected?.[committed.actorId]) return state;

      const card = state.cards[e.cardId];
      if (!card) return state;

      const isBO3 = state.config.matchMode === "BO3";
      if (isBO3) {
        const ownUnselected = `${committed.actorId}:unselectedBattlefields`;
        if (card.zoneId !== ownUnselected) return state;
        const used = state.usedBattlefieldIds?.[committed.actorId] ?? [];
        if (card.defId && used.includes(card.defId)) return state;
      } else {
        const opponentId: PlayerId = committed.actorId === "p1" ? "p2" : "p1";
        const oppUnselected = `${opponentId}:unselectedBattlefields`;
        if (card.zoneId !== oppUnselected) return state;
      }

      const expectedTarget =
        committed.actorId === "p1" ? "shared:battlefield_left" : "shared:battlefield_right";
      if (e.targetZoneId !== expectedTarget) return state;

      state = moveCard(state, e.cardId, e.targetZoneId);
      state.cards[e.cardId] = {
        ...state.cards[e.cardId],
        face: { faceUp: false, rotation: 0 }
      };
      state.battlefieldsSelected = {
        ...(state.battlefieldsSelected ?? {}),
        [committed.actorId]: true
      };
      if (isBO3 && card.defId) {
        state.usedBattlefieldIds = {
          ...(state.usedBattlefieldIds ?? {}),
          [committed.actorId]: [...(state.usedBattlefieldIds?.[committed.actorId] ?? []), card.defId]
        };
      }
      return state;
    }
    case "take_seat":
    case "set_match_mode":
    case "start_game":
    case "roll_dice": {
      if (committed.event.t === "set_match_mode") {
        state.config.matchMode = committed.event.mode;
      }
      return state;
    }
    case "sync_seats": {
      state.players = committed.event.players;
      state.spectators = committed.event.spectators;
      if (committed.event.hostId !== undefined) {
        state.hostId = committed.event.hostId;
      }
      return state;
    }
    case "leave_seat":
    case "kick_player":
    case "select_deck":
    case "set_lobby_ready":
      // Handled entirely by server and reflected via `sync_seats`
      return state;
    case "choose_first_player": {
      state.firstPlayer = committed.event.firstPlayer;
      // Do not mutate phase here, server handles it to emit an explicit set_phase event
      return state;
    }
    case "dice_rolled": {
      state.diceRolls = committed.event.rolls;
      return state;
    }
    case "mulligan": {
      const e = committed.event;
      const pId = committed.actorId;
      const handId = `${pId}:hand`;
      const mainDeckId = `${pId}:mainDeck`;
      
      const handZone = state.zones[handId];
      const mainDeckZone = state.zones[mainDeckId];
      
      if (!handZone || !mainDeckZone) return state;
      if (e.cardIds.length > 2) return state;
      const cardsToReturn = e.cardIds.filter(id => handZone.cards.includes(id));
      state.zones[handId] = {
        ...handZone,
        cards: handZone.cards.filter(id => !cardsToReturn.includes(id))
      };

      // 2. Put them at the bottom of the main deck (start of array)
      // Assuming index 0 is bottom, length-1 is top
      state.zones[mainDeckId] = {
        ...mainDeckZone,
        cards: [...cardsToReturn, ...mainDeckZone.cards]
      };
      
      // Update zoneId for returned cards
      for (const cId of cardsToReturn) {
        state.cards[cId] = { ...state.cards[cId], zoneId: mainDeckId };
      }

      // 3. Draw new cards from top
      const newMainDeckZone = state.zones[mainDeckId];
      const drawCount = cardsToReturn.length;
      const drawnCards = newMainDeckZone.cards.slice(-drawCount);
      
      state.zones[mainDeckId] = {
        ...newMainDeckZone,
        cards: newMainDeckZone.cards.slice(0, -drawCount)
      };
      
      state.zones[handId] = {
        ...state.zones[handId],
        cards: [...state.zones[handId].cards, ...drawnCards]
      };

      for (const cId of drawnCards) {
        state.cards[cId] = {
          ...state.cards[cId],
          zoneId: handId,
          face: { ...state.cards[cId].face, faceUp: true }
        };
      }

      state.mulliganReady = state.mulliganReady || {};
      state.mulliganReady[pId] = true;

      // If both players are ready, we could auto transition here,
      // but like choose_first_player, it's safer for server to do it.

      return state;
    }
    case "propose_match_result": {
      const e = committed.event;
      state.matchProposal = {
        proposerId: committed.actorId,
        winnerId: e.winnerId,
        kind: e.kind
      };
      return state;
    }
    case "respond_match_proposal": {
      if (!committed.event.accept) {
        state.matchProposal = undefined;
      }
      return state;
    }
    case "match_result_confirmed": {
      const e = committed.event;
      state.matchProposal = undefined;
      const loser: PlayerId = e.winnerId === "p1" ? "p2" : "p1";
      if (e.kind === "end_match") {
        state.matchWinner = e.winnerId;
        state.phase = "game_over";
        return state;
      }
      state.gamesWon = {
        ...(state.gamesWon ?? { p1: 0, p2: 0 }),
        [e.winnerId]: (state.gamesWon?.[e.winnerId] ?? 0) + 1
      };
      state.lastGameLoser = loser;
      const wins = state.gamesWon[e.winnerId] ?? 0;
      if (wins >= 2) {
        state.matchWinner = e.winnerId;
        state.phase = "game_over";
      }
      return state;
    }
    case "return_to_lobby": {
      const players = state.players;
      const spectators = state.spectators;
      const hostId = state.hostId;
      const config = state.config;
      state.phase = "lobby";
      state.matchProposal = undefined;
      state.matchWinner = undefined;
      state.activePlayer = undefined;
      state.firstPlayer = undefined;
      state.diceRolls = undefined;
      state.mulliganReady = undefined;
      state.battlefieldsSelected = undefined;
      state.scrySession = undefined;
      state.turnCounts = undefined;
      state.gameIndex = undefined;
      state.zones = {};
      state.cards = {};
      state.players = players;
      state.spectators = spectators;
      state.hostId = hostId;
      state.gamesWon = undefined;
      state.usedBattlefieldIds = undefined;
      state.config = config;
      return state;
    }
    case "leave_room":
      return state;
    default: {
      const _exhaustive: never = committed.event;
      return state;
    }
  }
}

function moveCardToBottom(
  prev: GameStateView,
  cardId: CardId,
  toZoneId: ZoneId
): GameStateView {
  const state: GameStateView = {
    ...prev,
    zones: { ...prev.zones },
    cards: { ...prev.cards }
  };
  const card = state.cards[cardId];
  if (!card) return prev;
  const fromZoneId = card.zoneId;
  const from = state.zones[fromZoneId];
  const to = state.zones[toZoneId];
  if (!to) return prev;

  removeCardFromAllZones(state, cardId);
  state.zones[toZoneId] = { ...state.zones[toZoneId], cards: [cardId, ...state.zones[toZoneId].cards] };
  state.cards[cardId] = { ...card, zoneId: toZoneId };
  return state;
}

function removeCardFromAllZones(state: GameStateView, cardId: CardId): GameStateView {
  for (const [zoneId, zone] of Object.entries(state.zones)) {
    if (zone.cards.includes(cardId)) {
      state.zones[zoneId] = { ...zone, cards: zone.cards.filter((id) => id !== cardId) };
    }
  }
  return state;
}

function moveCardFromZone(
  prev: GameStateView,
  cardId: CardId,
  fromZoneId: ZoneId,
  toZoneId: ZoneId
): GameStateView {
  const state: GameStateView = {
    ...prev,
    zones: { ...prev.zones },
    cards: { ...prev.cards }
  };
  const card = state.cards[cardId];
  const from = state.zones[fromZoneId];
  const to = state.zones[toZoneId];
  if (!card || !from || !to) return prev;
  if (!from.cards.includes(cardId)) return prev;

  removeCardFromAllZones(state, cardId);
  state.zones[toZoneId] = { ...state.zones[toZoneId], cards: [...state.zones[toZoneId].cards, cardId] };
  state.cards[cardId] = { ...card, zoneId: toZoneId };
  return state;
}

function moveCard(
  prev: GameStateView,
  cardId: CardId,
  toZoneId: ZoneId,
  pos?: { x: number; y: number }
): GameStateView {
  const state: GameStateView = {
    ...prev,
    zones: { ...prev.zones },
    cards: { ...prev.cards }
  };

  const card = state.cards[cardId];
  if (!card) return prev;

  const fromZoneId = card.zoneId;
  const from = state.zones[fromZoneId];

  if (fromZoneId === toZoneId) {
    // If moving within the same zone, just update position (or move to top of pile)
    if (from) {
      state.zones[fromZoneId] = { 
        ...from, 
        cards: from.cards.filter(id => id !== cardId).concat(cardId) 
      };
    }
    state.cards[cardId] = { ...card, pos: pos ?? card.pos };
    return state;
  }

  const to = state.zones[toZoneId];
  if (!to) return prev;

  removeCardFromAllZones(state, cardId);
  state.zones[toZoneId] = { ...state.zones[toZoneId], cards: [...state.zones[toZoneId].cards, cardId] };

  state.cards[cardId] = {
    ...card,
    zoneId: toZoneId,
    pos: pos ?? card.pos
  };

  return state;
}

export function getPlayerZoneIds(params: {
  playerId: PlayerId;
}): {
  hand: ZoneId;
  mainDeck: ZoneId;
  runeDeck: ZoneId;
  discard: ZoneId;
  exile: ZoneId;
  heroLegend: ZoneId;
  base: ZoneId;
  runeZone: ZoneId;
  unselectedBattlefields: ZoneId;
} {
  const p = params.playerId;
  return {
    hand: `${p}:hand`,
    mainDeck: `${p}:mainDeck`,
    runeDeck: `${p}:runeDeck`,
    discard: `${p}:discard`,
    exile: `${p}:exile`,
    heroLegend: `${p}:heroLegend`,
    base: `${p}:base`,
    runeZone: `${p}:runeZone`,
    unselectedBattlefields: `${p}:unselectedBattlefields`
  };
}

export function getSharedZoneIds(): {
  battlefieldLeft: ZoneId;
  battlefieldRight: ZoneId;
} {
  return {
    battlefieldLeft: "shared:battlefield_left",
    battlefieldRight: "shared:battlefield_right"
  };
}

export function describeEvent(committed: CommittedEventView): string | null {
  const e = committed.event;
  switch (e.t) {
    case "init_game":
      return "对局已初始化";
    case "set_phase":
      return `阶段：${e.phase}`;
    case "move_card":
      return `移动卡牌`;
    case "draw_top":
      return committed.actorId === "server" ? null : "抽牌";
    case "flip_card":
      return e.faceUp ? "翻为正面" : "翻为背面";
    case "rotate_card":
      return `旋转：${e.rotation}°`;
    case "set_counter":
      return `计数器：${e.key} ${e.delta >= 0 ? "+" : ""}${e.delta}`;
    case "shuffle_pile":
      return "洗牌";
    case "stack_note":
      return e.text;
    case "sync_seats":
      return "更新席位状态";
    case "take_seat":
      return `入座：${e.seat}`;
    case "leave_seat":
      return `离开座位`;
    case "kick_player":
      return `踢出玩家`;
    case "set_match_mode":
      return `设置模式：${e.mode}`;
    case "start_game":
      return "开始游戏";
    case "roll_dice":
      return "掷骰子";
    case "dice_rolled":
      return `掷骰结果：${Object.entries(e.rolls).map(([p, r]) => `${p}(${r})`).join(", ")}`;
    case "choose_first_player":
      return `选择先手：${e.firstPlayer}`;
    case "select_battlefield":
      return "选择战场";
    case "mulligan":
      return `调度 ${e.cardIds.length} 张牌`;
    case "select_deck":
      return `选择牌组：${e.deckName}`;
    case "set_lobby_ready":
      return e.ready ? "准备就绪" : "取消准备";
    case "end_turn":
      return "结束回合";
    case "wake_all":
      return "唤醒所有卡牌";
    case "set_active_player":
      return `当前回合：${e.playerId}`;
    case "return_rune":
      return "回收符文";
    case "move_card_bottom":
      return "卡牌移至牌库底";
    case "set_scry_session":
      return e.active ? "查看牌库" : "结束查看牌库";
    case "rewind":
      return "回溯";
    case "propose_match_result":
      return e.kind === "next_game"
        ? `提议下一局胜者：${e.winnerId}`
        : `提议结束对局，胜者：${e.winnerId}`;
    case "respond_match_proposal":
      return e.accept ? "确认对局结果" : "拒绝对局结果";
    case "match_result_confirmed":
      return e.kind === "next_game" ? `小局结束，胜者：${e.winnerId}` : `对局结束，胜者：${e.winnerId}`;
    case "return_to_lobby":
      return "返回房间大厅";
    case "leave_room":
      return "离开房间";
    default: {
      const _exhaustive: never = e;
      return null;
    }
  }
}
