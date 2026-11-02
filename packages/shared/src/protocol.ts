export type RoomId = string;
export type UserId = string;
export type ClientId = string;
export type PlayerId = string;
export type CardId = string;
export type CardDefId = string;
export type ZoneId = string;

export type Visibility = "public" | "ownerOnly" | "hidden";

export type Phase =
  | "lobby"
  | "setup_battlefield"
  | "setup_dice"
  | "setup_first_player"
  | "setup_mulligan"
  | "wakeup"
  | "begin"
  | "score"
  | "summon_runes"
  | "draw"
  | "main"
  | "end"
  | "game_over";

export type GameConfig = {
  battlefieldCount: number;
  matchMode: "BO1" | "BO3";
};

export type Vector2 = { x: number; y: number };

export type CardFace = {
  faceUp: boolean;
  rotation: 0 | 90 | 180 | 270;
};

export type CounterMap = Record<string, number>;

export type CardInstance = {
  id: CardId;
  defId: CardDefId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zoneId: ZoneId;
  face: CardFace;
  counters: CounterMap;
  pos?: Vector2;
  stackIndex?: number;
};

export type PlayerState = {
  id: PlayerId;
  displayName: string;
  counters: CounterMap;
  selectedDeckId?: string;
  selectedDeckName?: string;
  lobbyReady?: boolean;
};

export type ZonePrivacy = "public" | "private" | "secret";

export type ZoneState = {
  id: ZoneId;
  name: string;
  privacy: ZonePrivacy;
  ownerId?: PlayerId;
  cards: CardId[];
};

export type Deck = {
  mainDeck: CardDefId[];
  runeDeck: CardDefId[];
  legendCardId?: CardDefId;
  heroCardId?: CardDefId;
  sideboard?: CardDefId[];
  battlefields?: CardDefId[];
};

export type GameState = {
  roomId: RoomId;
  config: GameConfig;
  phase: Phase;
  hostId?: PlayerId;
  players: Record<PlayerId, PlayerState>;
  spectators: Array<{ id: PlayerId; displayName: string }>;
  zones: Record<ZoneId, ZoneState>;
  cards: Record<CardId, CardInstance>;
  log: Array<{ seq: number; text: string }>;
  
  diceRolls?: Record<PlayerId, number>;
  firstPlayer?: PlayerId;
  activePlayer?: PlayerId;
  mulliganReady?: Record<PlayerId, boolean>;
  battlefieldsSelected?: Record<PlayerId, boolean>;
  gameIndex?: number;
  usedBattlefieldIds?: Record<PlayerId, CardDefId[]>;
  lastGameLoser?: PlayerId;
  gamesWon?: Record<PlayerId, number>;
  turnCounts?: Record<PlayerId, number>;
  scrySession?: { playerId: PlayerId; active: boolean };
  matchProposal?: {
    proposerId: PlayerId;
    winnerId: PlayerId;
    kind: "end_match" | "next_game";
  };
  matchWinner?: PlayerId;
};

export type ClientHello = {
  t: "join_room";
  roomId: RoomId;
  clientId: ClientId;
  lastSeenSeq: number;
  displayName: string;
};

export type ClientPing = { t: "ping" };

export type SubmitEvent = {
  t: "submit_event";
  roomId: RoomId;
  clientEventId: string;
  expectedSeq?: number;
  event: ClientEvent;
};

export type ClientMessage = ClientHello | ClientPing | SubmitEvent;

export type ServerRoomState = {
  t: "room_state";
  roomId: RoomId;
  yourPlayerId: PlayerId;
  latestSeq: number;
  snapshot?: { seq: number; state: GameStateView };
  events?: Array<CommittedEventView>;
};

export type ServerEventCommitted = {
  t: "event_committed";
  roomId: RoomId;
  latestSeq: number;
  event: CommittedEventView;
  /** 对该客户端可见的卡牌 defId（例如从 secret 区进入 public 区后） */
  cardReveals?: Record<CardId, CardDefId>;
};

export type ServerPong = { t: "pong" };

export type ServerError = {
  t: "error";
  code: string;
  message: string;
};

export type ServerIdentityUpdate = {
  t: "identity_update";
  yourPlayerId: PlayerId;
};

export type ServerStateResync = {
  t: "state_resync";
  roomId: RoomId;
  latestSeq: number;
  state: GameStateView;
};

export type ServerMessage =
  | ServerRoomState
  | ServerEventCommitted
  | ServerStateResync
  | ServerPong
  | ServerError
  | ServerIdentityUpdate;

export type ClientEvent =
  | InitGameEvent
  | MoveCardEvent
  | FlipCardEvent
  | RotateCardEvent
  | SetCounterEvent
  | SetPhaseEvent
  | StackNoteEvent
  | DrawTopEvent
  | ShufflePileEvent
  | TakeSeatEvent
  | LeaveSeatEvent
  | KickPlayerEvent
  | SetMatchModeEvent
  | StartGameEvent
  | RollDiceEvent
  | ChooseFirstPlayerEvent
  | SelectBattlefieldEvent
  | MulliganEvent
  | DiceRolledEvent
  | SyncSeatsEvent
  | SelectDeckEvent
  | SetLobbyReadyEvent
  | EndTurnEvent
  | WakeAllEvent
  | SetActivePlayerEvent
  | ReturnRuneEvent
  | MoveCardBottomEvent
  | SetScrySessionEvent
  | RewindEvent
  | ProposeMatchResultEvent
  | RespondMatchProposalEvent
  | MatchResultConfirmedEvent
  | ReturnToLobbyEvent
  | LeaveRoomEvent;

export type TakeSeatEvent = { t: "take_seat"; seat: "p1" | "p2" | "spec" };
export type LeaveSeatEvent = { t: "leave_seat" };
export type KickPlayerEvent = { t: "kick_player"; targetId: PlayerId };
export type SetMatchModeEvent = { t: "set_match_mode"; mode: "BO1" | "BO3" };
export type StartGameEvent = { t: "start_game" };
export type RollDiceEvent = { t: "roll_dice" };
export type DiceRolledEvent = { t: "dice_rolled"; rolls: Record<PlayerId, number> };
export type ChooseFirstPlayerEvent = { t: "choose_first_player"; firstPlayer: PlayerId };
export type SelectBattlefieldEvent = { t: "select_battlefield"; cardId: CardId; targetZoneId: ZoneId };
export type MulliganEvent = { t: "mulligan"; cardIds: CardId[] };
export type SyncSeatsEvent = { t: "sync_seats"; players: Record<PlayerId, PlayerState>; spectators: Array<{ id: PlayerId; displayName: string }>; hostId?: PlayerId };
export type SelectDeckEvent = { t: "select_deck"; deckId: string; deckName: string };
export type SetLobbyReadyEvent = { t: "set_lobby_ready"; ready: boolean };
export type EndTurnEvent = { t: "end_turn" };
export type WakeAllEvent = { t: "wake_all" };
export type SetActivePlayerEvent = { t: "set_active_player"; playerId: PlayerId };
export type ReturnRuneEvent = { t: "return_rune"; cardId: CardId };
export type MoveCardBottomEvent = { t: "move_card_bottom"; cardId: CardId; toZoneId: ZoneId };
export type SetScrySessionEvent = { t: "set_scry_session"; active: boolean };
export type RewindEvent = { t: "rewind" };
export type ProposeMatchResultEvent = {
  t: "propose_match_result";
  winnerId: PlayerId;
  kind: "end_match" | "next_game";
};
export type RespondMatchProposalEvent = { t: "respond_match_proposal"; accept: boolean };
export type MatchResultConfirmedEvent = {
  t: "match_result_confirmed";
  winnerId: PlayerId;
  kind: "end_match" | "next_game";
};
export type ReturnToLobbyEvent = { t: "return_to_lobby" };
export type LeaveRoomEvent = { t: "leave_room" };

export type InitGameEvent = {
  t: "init_game";
  config: GameConfig;
  players: Array<{ id: PlayerId; displayName: string }>;
  zones: ZoneState[];
  cards: CardInstance[];
  note?: string;
};

export type MoveCardEvent = {
  t: "move_card";
  cardId: CardId;
  toZoneId: ZoneId;
  pos?: Vector2;
};

export type FlipCardEvent = {
  t: "flip_card";
  cardId: CardId;
  faceUp: boolean;
};

export type RotateCardEvent = {
  t: "rotate_card";
  cardId: CardId;
  rotation: 0 | 90 | 180 | 270;
};

export type SetCounterEvent = {
  t: "set_counter";
  target: { kind: "player"; id: PlayerId } | { kind: "card"; id: CardId };
  key: string;
  delta: number;
};

export type SetPhaseEvent = { t: "set_phase"; phase: Phase };

export type StackNoteEvent = {
  t: "stack_note";
  text: string;
};

export type DrawTopEvent = {
  t: "draw_top";
  fromZoneId: ZoneId;
  toZoneId: ZoneId;
};

export type ShufflePileEvent = {
  t: "shuffle_pile";
  zoneId: ZoneId;
};

export type CommittedEvent = {
  seq: number;
  at: number;
  actorId: PlayerId;
  visibility: Visibility;
  event: ClientEvent;
};

export type CardInstanceView = Omit<CardInstance, "defId"> & {
  defId?: CardDefId;
};

export type GameStateView = Omit<GameState, "cards"> & {
  cards: Record<CardId, CardInstanceView>;
};

export type CommittedEventView = Omit<CommittedEvent, "event"> & {
  event: ClientEvent;
};

