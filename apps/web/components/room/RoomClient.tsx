"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  applyCommittedEvent,
  createInitialState,
  getPlayerZoneIds,
  type ClientEvent,
  type ClientMessage,
  type CommittedEventView,
  type DeckListItem,
  type GameStateView,
  type Phase,
  type PlayerState,
  type ServerMessage,
  type ZoneId
} from "@sim/shared";
import { GameCardFace, useCardCatalog } from "@/components/room/cardCatalog";
import ScryModal from "@/components/room/ScryModal";

const WS_URL = process.env.NEXT_PUBLIC_REALTIME_WS_URL ?? "ws://localhost:8787";

export default function RoomClient(props: { roomId: string; displayName: string }) {
  const [yourPlayerId, setYourPlayerId] = useState<string | null>(null);
  const [latestSeq, setLatestSeq] = useState(0);
  const [state, setState] = useState<GameStateView>(() =>
    createInitialState({ roomId: props.roomId, config: { battlefieldCount: 3, matchMode: "BO1" } })
  );
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [savedDecks, setSavedDecks] = useState<DeckListItem[]>([]);
  const [decksLoading, setDecksLoading] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const cardCatalog = useCardCatalog();
  const [scryOpen, setScryOpen] = useState(false);
  const [matchResultModal, setMatchResultModal] = useState<"end_match" | "next_game" | null>(null);
  const router = useRouter();
  const [clientId] = useState(() => {
    if (typeof window !== "undefined") {
      let id = sessionStorage.getItem("clientId");
      if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem("clientId", id);
      }
      return id;
    }
    return crypto.randomUUID();
  });
  const clientIdRef = useRef<string>(clientId);

  // Avoid infinite loops by keeping reconnect logic out of main render dependency cycle if possible
  // Using refs for latestSeq and state to avoid recreating WebSocket on every state update
  const latestSeqRef = useRef(latestSeq);
  latestSeqRef.current = latestSeq;

  useEffect(() => {
    if (props.displayName && props.displayName !== "Guest") {
      sessionStorage.setItem("displayName", props.displayName);
    }
  }, [props.displayName]);

  const isSeated = yourPlayerId === "p1" || yourPlayerId === "p2";

  useEffect(() => {
    if (state.phase !== "lobby" || !isSeated) return;
    let cancelled = false;
    setDecksLoading(true);
    fetch("/api/decks")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { decks?: DeckListItem[] }) => {
        if (!cancelled) setSavedDecks(data.decks ?? []);
      })
      .catch(() => {
        if (!cancelled) setSavedDecks([]);
      })
      .finally(() => {
        if (!cancelled) setDecksLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [state.phase, isSeated]);
  
  useEffect(() => {
    let ws: WebSocket | null = null;
    let isConnecting = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let disposed = false;

    function connect() {
      if (disposed) return;
      if (isConnecting || (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING))) return;
      isConnecting = true;
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        isConnecting = false;
        const displayName =
          props.displayName !== "Guest"
            ? props.displayName
            : sessionStorage.getItem("displayName") ?? props.displayName;
        const msg: ClientMessage = {
          t: "join_room",
          roomId: props.roomId,
          clientId: clientIdRef.current,
          lastSeenSeq: latestSeqRef.current,
          displayName
        };
        ws!.send(JSON.stringify(msg));
      });

      const onClose = () => {
        isConnecting = false;
        if (disposed) return;
        reconnectTimer = setTimeout(connect, 2000);
      };

      ws.addEventListener("close", onClose);

      ws.addEventListener("message", (evt) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(evt.data));
        } catch {
          return;
        }

        if (msg.t === "room_state") {
          setYourPlayerId(msg.yourPlayerId);
          latestSeqRef.current = msg.latestSeq;
          setLatestSeq(msg.latestSeq);

          // Trust the server snapshot on (re)connect.
          let next = msg.snapshot?.state;
          if (!next) return;

          if (msg.events?.length) {
            for (const e of msg.events) next = applyCommittedEvent(next, e as CommittedEventView);
          }
          setState(next);
          return;
        }

        if (msg.t === "event_committed") {
          const eventSeq = msg.latestSeq;
          if (eventSeq <= latestSeqRef.current) return;
          latestSeqRef.current = eventSeq;
          setLatestSeq(eventSeq);
          const ev = msg.event as CommittedEventView;
          setState((prev) => {
            let next = applyCommittedEvent(prev, ev);
            if (msg.cardReveals) {
              const cards = { ...next.cards };
              for (const [id, defId] of Object.entries(msg.cardReveals)) {
                if (cards[id]) cards[id] = { ...cards[id], defId };
              }
              next = { ...next, cards };
            }
            return next;
          });
          return;
        }

        if (msg.t === "state_resync") {
          latestSeqRef.current = msg.latestSeq;
          setLatestSeq(msg.latestSeq);
          setState(msg.state);
          return;
        }

        if (msg.t === "identity_update") {
          setYourPlayerId(msg.yourPlayerId);
          return;
        }
      });
    }

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.close();
      }
      wsRef.current = null;
    };
  }, [props.displayName, props.roomId]);

  const players = useMemo(() => Object.keys(state.players), [state.players]);
  const opponentId = useMemo(() => {
    if (!yourPlayerId) return null;
    return players.find((p) => p !== yourPlayerId) ?? null;
  }, [players, yourPlayerId]);

  const zones = useMemo(() => {
    if (!yourPlayerId) return null;
    return {
      you: getPlayerZoneIds({ playerId: yourPlayerId }),
      opp: opponentId ? getPlayerZoneIds({ playerId: opponentId }) : null
    };
  }, [opponentId, yourPlayerId]);

  function sendEvent(event: ClientEvent, expectedSeq?: number) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const msg: ClientMessage = {
      t: "submit_event",
      roomId: props.roomId,
      clientEventId: crypto.randomUUID(),
      expectedSeq,
      event
    };
    ws.send(JSON.stringify(msg));
  }

  const selectedCard = selectedCardId ? state.cards[selectedCardId] : undefined;
  
  // Hover Preview State
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const hoverTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const updateMousePos = (ev: MouseEvent) => {
      setMousePos({ x: ev.clientX, y: ev.clientY });
    };
    window.addEventListener('mousemove', updateMousePos);
    return () => window.removeEventListener('mousemove', updateMousePos);
  }, []);

  const handleHoverCard = (cardId: string | null) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (cardId) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredCardId(cardId);
      }, 200);
    } else {
      setHoveredCardId(null);
    }
  };

  // Render Lobby
  if (state.phase === "lobby") {
    const isHost = state.hostId === yourPlayerId;
    const specList = state.spectators;
    const p1 = state.players["p1"];
    const p2 = state.players["p2"];
    const canStartGame =
      isHost &&
      !!p1 &&
      !!p2 &&
      !!p1.selectedDeckId &&
      !!p2.selectedDeckId &&
      !!p1.lobbyReady &&
      !!p2.lobbyReady;

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="bg-white border border-slate-100 rounded-xl p-8 shadow-lg max-w-lg w-full">
          <h2 className="text-2xl font-bold mb-6 text-center">房间大厅</h2>
          <div className="mb-6 bg-slate-50 p-3 rounded-lg flex items-center justify-between border border-slate-200">
            <div>
              <div className="text-xs text-slate-500 mb-1">房间 ID / 邀请码</div>
              <div className="font-mono text-sm font-medium select-all text-slate-800">{props.roomId}</div>
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(props.roomId);
              }}
              className="px-3 py-1.5 bg-white border border-slate-200 rounded text-xs font-medium text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
            >
              复制
            </button>
          </div>
          <div className="mb-4">
            <div className="text-sm text-slate-500 mb-1">对战模式</div>
            <div className="flex gap-2">
              <button
                disabled={!isHost}
                onClick={() => sendEvent({ t: "set_match_mode", mode: "BO1" }, latestSeq)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  state.config.matchMode === "BO1" ? "bg-primary text-white border-primary" : "bg-white text-slate-700"
                }`}
              >
                BO1
              </button>
              <button
                disabled={!isHost}
                onClick={() => sendEvent({ t: "set_match_mode", mode: "BO3" }, latestSeq)}
                className={`px-4 py-2 rounded-lg border text-sm font-medium ${
                  state.config.matchMode === "BO3" ? "bg-primary text-white border-primary" : "bg-white text-slate-700"
                }`}
              >
                BO3
              </button>
            </div>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-4">
            <LobbySeatCard
              seatLabel="对战席 1"
              seatId="p1"
              player={p1}
              isHostSeat={state.hostId === "p1"}
              isRoomHost={isHost}
              yourPlayerId={yourPlayerId}
              savedDecks={savedDecks}
              decksLoading={decksLoading}
              onTakeSeat={() => sendEvent({ t: "take_seat", seat: "p1" })}
              onLeaveSeat={() => sendEvent({ t: "leave_seat" })}
              onKick={() => sendEvent({ t: "kick_player", targetId: "p1" })}
              onSelectDeck={(deckId) => {
                const deck = savedDecks.find((d) => d.id === deckId);
                if (deck) sendEvent({ t: "select_deck", deckId, deckName: deck.name });
              }}
              onToggleReady={(ready) => sendEvent({ t: "set_lobby_ready", ready })}
            />
            <LobbySeatCard
              seatLabel="对战席 2"
              seatId="p2"
              player={p2}
              isHostSeat={state.hostId === "p2"}
              isRoomHost={isHost}
              yourPlayerId={yourPlayerId}
              savedDecks={savedDecks}
              decksLoading={decksLoading}
              onTakeSeat={() => sendEvent({ t: "take_seat", seat: "p2" })}
              onLeaveSeat={() => sendEvent({ t: "leave_seat" })}
              onKick={() => sendEvent({ t: "kick_player", targetId: "p2" })}
              onSelectDeck={(deckId) => {
                const deck = savedDecks.find((d) => d.id === deckId);
                if (deck) sendEvent({ t: "select_deck", deckId, deckName: deck.name });
              }}
              onToggleReady={(ready) => sendEvent({ t: "set_lobby_ready", ready })}
            />
          </div>

          <div className="mb-6 border rounded-lg p-4">
            <div className="text-sm font-bold mb-2 flex justify-between items-center">
              <span>观战席</span>
              <button
                onClick={() => sendEvent({ t: "take_seat", seat: "spec" })}
                className="text-xs px-2 py-1 border rounded bg-slate-50 hover:bg-slate-100"
              >
                加入观战
              </button>
            </div>
            <div className="text-sm text-slate-600 flex flex-col gap-1">
              {specList.length > 0 ? specList.map((s) => (
                <div key={s.id} className="flex justify-between items-center">
                  <span>{s.displayName} {state.hostId === s.id && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">房主</span>}</span>
                  {isHost && s.id !== yourPlayerId && (
                    <button onClick={() => sendEvent({ t: "kick_player", targetId: s.id })} className="text-[10px] text-red-500 hover:underline">踢出</button>
                  )}
                </div>
              )) : "暂无观战者"}
            </div>
          </div>

          <button
            disabled={!canStartGame}
            onClick={() => sendEvent({ t: "start_game" })}
            className={`w-full py-3 rounded-lg font-bold transition-all ${
              canStartGame
                ? "bg-primary text-white hover:bg-primary/90"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            开始游戏
          </button>
          {isHost && !canStartGame && (
            <p className="text-xs text-slate-500 text-center mt-2">
              {!p1 || !p2
                ? "需要两名玩家分别入座"
                : !p1.selectedDeckId || !p2.selectedDeckId
                ? "等待双方选择牌组"
                : !p1.lobbyReady || !p2.lobbyReady
                ? "等待双方准备就绪"
                : ""}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Setup / In-game Layout
  const isSpectator = !yourPlayerId || !players.includes(yourPlayerId);
  const bottomPlayerId = isSpectator ? "p1" : yourPlayerId;
  const topPlayerId = players.find((p) => p !== bottomPlayerId) ?? "p2";

  const bottomScore = state.players[bottomPlayerId]?.counters?.score ?? 0;
  const topScore = state.players[topPlayerId]?.counters?.score ?? 0;
  const isGameOver = state.phase === "game_over";
  const matchWinnerId = state.matchWinner ?? null;
  const pendingProposal = state.matchProposal;
  const isProposalTarget =
    pendingProposal &&
    yourPlayerId &&
    yourPlayerId !== pendingProposal.proposerId &&
    (yourPlayerId === "p1" || yourPlayerId === "p2");
  const p1GamesWon = state.gamesWon?.p1 ?? 0;
  const p2GamesWon = state.gamesWon?.p2 ?? 0;

  const hoveredCard = hoveredCardId ? state.cards[hoveredCardId] : null;
  const hoveredCardDef = hoveredCard?.defId ? cardCatalog.get(hoveredCard.defId) : undefined;

  // Calculate dynamic preview position to stay within screen bounds
  const previewWidth = 288;
  const previewHeight = 403;
  const padding = 20;
  
  let previewX = mousePos.x + 20; // Default: slightly right of mouse
  let previewY = mousePos.y - previewHeight / 2; // Default: centered vertically with mouse

  if (typeof window !== "undefined") {
    // Prevent clipping right edge
    if (previewX + previewWidth + padding > window.innerWidth) {
      previewX = mousePos.x - previewWidth - 20; // Show on left of mouse instead
    }
    // Prevent clipping bottom edge
    if (previewY + previewHeight + padding > window.innerHeight) {
      previewY = window.innerHeight - previewHeight - padding;
    }
    // Prevent clipping top edge
    if (previewY < padding) {
      previewY = padding;
    }
  }

  return (
    <div className="min-h-screen grid grid-cols-[1fr_320px] bg-slate-900 text-slate-200 relative">
      {/* Interactive Preview System */}
      <div 
        className={`fixed z-[100] transition-all duration-300 pointer-events-none origin-center ${hoveredCard ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        style={{ 
          left: `${previewX}px`, 
          top: `${previewY}px`,
          // Add a subtle ease out when tracking the mouse
          transitionProperty: 'opacity, transform' 
        }}
      >
        {hoveredCard && (
          <div
            className="w-[288px] h-[403px] bg-slate-100 rounded-2xl shadow-2xl border-4 border-primary/50 relative overflow-hidden"
            style={{ boxShadow: "0 0 30px rgba(59, 130, 246, 0.6)" }}
          >
            {hoveredCardDef?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={hoveredCardDef.imageUrl}
                alt={hoveredCardDef.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center">
                <span className="font-serif text-slate-400 text-2xl">Rift</span>
              </div>
            )}
            <div className="absolute top-3 left-3 right-3 flex justify-between items-start pointer-events-none">
              <div className="bg-black/60 text-white text-xs px-2 py-1 rounded max-w-[70%] truncate">
                {hoveredCardDef?.name ?? (hoveredCard.defId ? hoveredCard.defId : "卡背")}
              </div>
              <div className="text-[10px] font-mono text-white/70 bg-black/40 px-1.5 py-0.5 rounded">
                {hoveredCard.id}
              </div>
            </div>
            {Object.keys(hoveredCard.counters ?? {}).length > 0 && (
              <div className="absolute bottom-3 left-3 right-3 bg-black/60 text-white text-xs rounded-lg p-2">
                {Object.entries(hoveredCard.counters).map(([k, v]) => (
                  <span key={k} className="mr-2">
                    {k}: {v}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Game Over Modal */}
      {isGameOver && matchWinnerId && (
        <div className="absolute inset-0 z-[200] bg-black/80 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-12 rounded-2xl shadow-2xl text-center max-w-lg w-full">
            <h2 className="text-5xl font-black mb-6 bg-gradient-to-r from-amber-200 to-yellow-500 bg-clip-text text-transparent">
              对局结束
            </h2>
            <div className="text-2xl text-slate-300 mb-8">
              胜者：
              <span className="font-bold text-white ml-1">
                {state.players[matchWinnerId]?.displayName ?? matchWinnerId}
              </span>
            </div>
            {state.config.matchMode === "BO3" && (
              <div className="text-sm text-slate-400 mb-6">
                系列赛比分：{p1GamesWon} - {p2GamesWon}
              </div>
            )}
            <div className="flex justify-center gap-8 mb-10">
              <div className="text-center">
                <div className="text-sm text-slate-400 mb-2">{state.players[bottomPlayerId]?.displayName}</div>
                <div className={`text-4xl font-mono font-bold ${matchWinnerId === bottomPlayerId ? "text-amber-400" : "text-slate-500"}`}>
                  {bottomScore}
                </div>
              </div>
              <div className="text-4xl font-black text-slate-700 self-end">-</div>
              <div className="text-center">
                <div className="text-sm text-slate-400 mb-2">{state.players[topPlayerId]?.displayName}</div>
                <div className={`text-4xl font-mono font-bold ${matchWinnerId === topPlayerId ? "text-amber-400" : "text-slate-500"}`}>
                  {topScore}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => sendEvent({ t: "return_to_lobby" })}
                className="px-8 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold transition-colors w-full"
              >
                留在房间
              </button>
              <button
                onClick={() => {
                  sendEvent({ t: "leave_room" });
                  router.push("/");
                }}
                className="px-8 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-colors w-full"
              >
                返回主页
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Result Proposal - opponent confirmation */}
      {pendingProposal && isProposalTarget && !isGameOver && (
        <div className="absolute inset-0 z-[190] bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold mb-4 text-white">确认对局结果</h3>
            <p className="text-sm text-slate-300 mb-6">
              {state.players[pendingProposal.proposerId]?.displayName ?? pendingProposal.proposerId}{" "}
              提议
              {pendingProposal.kind === "next_game" ? "本局" : "对局"}
              胜者：
              <span className="font-semibold text-amber-300 ml-1">
                {state.players[pendingProposal.winnerId]?.displayName ?? pendingProposal.winnerId}
              </span>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => sendEvent({ t: "respond_match_proposal", accept: true })}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium"
              >
                确认
              </button>
              <button
                onClick={() => sendEvent({ t: "respond_match_proposal", accept: false })}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium"
              >
                拒绝
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Match Result Proposal - pick winner */}
      {matchResultModal && !isSpectator && yourPlayerId && !pendingProposal && (
        <div className="absolute inset-0 z-[190] bg-black/60 flex items-center justify-center backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-md w-full">
            <h3 className="text-xl font-bold mb-2 text-white">
              {matchResultModal === "next_game" ? "下一局" : "结束对局"}
            </h3>
            <p className="text-sm text-slate-400 mb-6">请选择胜者（需对手确认后生效）</p>
            <div className="flex flex-col gap-3">
              {(["p1", "p2"] as const).map((pid) => (
                <button
                  key={pid}
                  onClick={() => {
                    sendEvent({
                      t: "propose_match_result",
                      winnerId: pid,
                      kind: matchResultModal
                    });
                    setMatchResultModal(null);
                  }}
                  className="py-3 px-4 rounded-lg border border-slate-600 hover:border-primary hover:bg-slate-800 text-left transition-colors"
                >
                  <span className="font-medium text-white">
                    {state.players[pid]?.displayName ?? pid}
                  </span>
                </button>
              ))}
              <button
                onClick={() => setMatchResultModal(null)}
                className="py-2 text-sm text-slate-400 hover:text-slate-200"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Modals */}
      {state.phase === "setup_dice" && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white text-slate-900 p-8 rounded-xl shadow-xl max-w-sm w-full text-center">
            <h3 className="text-xl font-bold mb-4">掷骰子比大小</h3>
            <div className="flex justify-around mb-6">
              <div>
                <div className="text-sm text-slate-500">{state.players["p1"]?.displayName}</div>
                <div className="text-4xl font-mono mt-2">{state.diceRolls?.["p1"] ?? "?"}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">{state.players["p2"]?.displayName}</div>
                <div className="text-4xl font-mono mt-2">{state.diceRolls?.["p2"] ?? "?"}</div>
              </div>
            </div>
            {state.diceRolls && (
              <div className="text-sm mb-4 font-semibold">
                {state.diceRolls["p1"] === state.diceRolls["p2"]
                  ? "平局！(暂时假设房主先手)"
                  : state.diceRolls["p1"] > state.diceRolls["p2"]
                  ? `${state.players["p1"]?.displayName} 胜出！`
                  : `${state.players["p2"]?.displayName} 胜出！`}
              </div>
            )}
            {!isSpectator &&
              state.diceRolls &&
              ((state.diceRolls["p1"] >= state.diceRolls["p2"] && yourPlayerId === "p1") ||
                (state.diceRolls["p2"] > state.diceRolls["p1"] && yourPlayerId === "p2")) && (
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => sendEvent({ t: "choose_first_player", firstPlayer: yourPlayerId }, latestSeq)}
                    className="px-4 py-2 bg-primary text-white rounded"
                  >
                    我先攻
                  </button>
                  <button
                    onClick={() => sendEvent({ t: "choose_first_player", firstPlayer: topPlayerId }, latestSeq)}
                    className="px-4 py-2 bg-slate-200 text-slate-800 rounded"
                  >
                    对方先攻
                  </button>
                </div>
              )}
            {(isSpectator || !state.diceRolls || (state.diceRolls["p1"] >= state.diceRolls["p2"] && yourPlayerId !== "p1") || (state.diceRolls["p2"] > state.diceRolls["p1"] && yourPlayerId !== "p2")) && (
              <div className="text-sm text-slate-500">等待胜者选择先后攻...</div>
            )}
          </div>
        </div>
      )}

      {state.phase === "setup_battlefield" && !isSpectator && yourPlayerId && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white text-slate-900 p-8 rounded-xl shadow-xl max-w-lg w-full">
            <h3 className="text-xl font-bold mb-2">选择战场</h3>
            <p className="text-sm text-slate-600 mb-6">
              {state.config.matchMode === "BO3"
                ? "请从自己的 3 张战场牌中选择 1 张（本系列赛已使用的战场不可再选）。"
                : "请从对手的 3 张战场牌中选择 1 张（背面朝上放置，双方选完后揭示）。"}
            </p>
            {state.battlefieldsSelected?.[yourPlayerId] ? (
              <div className="text-center text-slate-500 py-8">已选择，等待对手…</div>
            ) : (
              <BattlefieldSelector
                cardIds={(
                  state.zones[
                    state.config.matchMode === "BO3"
                      ? `${yourPlayerId}:unselectedBattlefields`
                      : `${yourPlayerId === "p1" ? "p2" : "p1"}:unselectedBattlefields`
                  ]?.cards ?? []
                ).filter((id) => {
                  if (state.config.matchMode !== "BO3") return true;
                  const defId = state.cards[id]?.defId;
                  if (!defId) return true;
                  const used = state.usedBattlefieldIds?.[yourPlayerId] ?? [];
                  return !used.includes(defId);
                })}
                state={state}
                onSelect={(cardId) =>
                  sendEvent({
                    t: "select_battlefield",
                    cardId,
                    targetZoneId:
                      yourPlayerId === "p1" ? "shared:battlefield_left" : "shared:battlefield_right"
                  })
                }
              />
            )}
          </div>
        </div>
      )}

      {state.phase === "setup_first_player" && !isSpectator && yourPlayerId && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white text-slate-900 p-8 rounded-xl shadow-xl max-w-sm w-full text-center">
            <h3 className="text-xl font-bold mb-4">选择先后攻</h3>
            <p className="text-sm text-slate-600 mb-6">上一局败者决定本局先后攻。</p>
            {yourPlayerId === state.lastGameLoser ? (
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => sendEvent({ t: "choose_first_player", firstPlayer: yourPlayerId }, latestSeq)}
                  className="px-4 py-2 bg-primary text-white rounded"
                >
                  我先攻
                </button>
                <button
                  onClick={() =>
                    sendEvent(
                      { t: "choose_first_player", firstPlayer: yourPlayerId === "p1" ? "p2" : "p1" },
                      latestSeq
                    )
                  }
                  className="px-4 py-2 bg-slate-200 text-slate-800 rounded"
                >
                  对方先攻
                </button>
              </div>
            ) : (
              <div className="text-sm text-slate-500">等待败者选择先后攻…</div>
            )}
          </div>
        </div>
      )}

      {state.phase === "setup_mulligan" && !isSpectator && !state.mulliganReady?.[yourPlayerId!] && (
        <div className="absolute inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-white text-slate-900 p-8 rounded-xl shadow-xl max-w-2xl w-full">
            <h3 className="text-xl font-bold mb-4">手牌调度 (Mulligan)</h3>
            <p className="text-sm text-slate-600 mb-4">请选择最多 2 张手牌洗回牌库底，并重新抽取同等数量的牌。</p>
            <MulliganSelector
              handCards={state.zones[`${yourPlayerId}:hand`]?.cards ?? []}
              state={state}
              onConfirm={(selectedIds) => sendEvent({ t: "mulligan", cardIds: selectedIds })}
            />
          </div>
        </div>
      )}

      <div className="relative overflow-hidden flex flex-col p-4 gap-4 h-screen">
        {state.scrySession?.active && state.scrySession.playerId !== yourPlayerId && (
          <div className="shrink-0 bg-amber-900/40 border border-amber-700/50 rounded-lg px-4 py-2 text-sm text-amber-200">
            {state.players[state.scrySession.playerId]?.displayName ?? state.scrySession.playerId} 正在查看牌库…
          </div>
        )}
        {state.phase === "main" && state.activePlayer && (
          <div className="shrink-0 flex items-center justify-between bg-slate-800/80 border border-slate-700 rounded-lg px-4 py-2">
            <div className="text-sm">
              当前回合：
              <span className="font-semibold text-white ml-1">
                {state.players[state.activePlayer]?.displayName ?? state.activePlayer}
              </span>
              {!isSpectator && yourPlayerId === state.activePlayer && (
                <span className="ml-2 text-emerald-400 text-xs">（你的回合）</span>
              )}
            </div>
            {!isSpectator && yourPlayerId === state.activePlayer && (
              <button
                onClick={() => sendEvent({ t: "end_turn" })}
                className="px-4 py-1.5 bg-primary text-white text-sm rounded-lg hover:bg-primary/90"
              >
                结束回合
              </button>
            )}
          </div>
        )}
        {/* Opponent Area */}
        <div className="flex-1 min-h-0 bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
          <PlayerBoard
            title={`对手：${state.players[topPlayerId]?.displayName ?? topPlayerId}`}
            zoneIds={getPlayerZoneIds({ playerId: topPlayerId })}
            state={state}
            onSelect={setSelectedCardId}
            onDrop={(cardId, toZoneId) => sendEvent({ t: "move_card", cardId, toZoneId })}
            onDraw={(fromZoneId, toZoneId) => sendEvent({ t: "draw_top", fromZoneId, toZoneId })}
            isOpponent
            onHoverCard={handleHoverCard}
            sendEvent={sendEvent}
          />
        </div>

        {/* Shared Battlefield */}
        <div className="h-64 shrink-0 bg-slate-800/80 rounded-xl p-4 border border-slate-700 flex justify-center gap-12 items-center">
          <div className="w-48 h-full">
            <ZoneArea
              title="左侧战场"
              zoneId="shared:battlefield_left"
              state={state}
              onSelect={setSelectedCardId}
              onDrop={(cardId, toZoneId) => sendEvent({ t: "move_card", cardId, toZoneId })}
              onHoverCard={handleHoverCard}
              isOnBoard
              sendEvent={sendEvent}
            />
          </div>
          <div className="w-48 h-full">
            <ZoneArea
              title="右侧战场"
              zoneId="shared:battlefield_right"
              state={state}
              onSelect={setSelectedCardId}
              onDrop={(cardId, toZoneId) => sendEvent({ t: "move_card", cardId, toZoneId })}
              onHoverCard={handleHoverCard}
              isOnBoard
              sendEvent={sendEvent}
            />
          </div>
        </div>

        {/* Your Area */}
        <div className="flex-1 min-h-0 bg-slate-800/50 rounded-xl p-2 border border-slate-700/50">
          <PlayerBoard
            title={`你：${state.players[bottomPlayerId]?.displayName ?? bottomPlayerId}`}
            zoneIds={getPlayerZoneIds({ playerId: bottomPlayerId })}
            state={state}
            onSelect={setSelectedCardId}
            onDrop={(cardId, toZoneId) => sendEvent({ t: "move_card", cardId, toZoneId })}
            onDraw={(fromZoneId, toZoneId) => sendEvent({ t: "draw_top", fromZoneId, toZoneId })}
            isOpponent={false}
            onHoverCard={handleHoverCard}
            sendEvent={sendEvent}
            onScryMainDeck={() => setScryOpen(true)}
          />
        </div>
      </div>

      {scryOpen && !isSpectator && yourPlayerId && (
        <ScryModal
          playerId={yourPlayerId}
          state={state}
          sendEvent={sendEvent}
          onClose={() => setScryOpen(false)}
        />
      )}

      <aside className="border-l border-slate-700 bg-slate-800 p-4 flex flex-col h-screen">
        <div className="mb-4 shrink-0">
          <div className="text-xs text-on-surface-variant">Room</div>
          <div className="font-mono text-sm break-all">{props.roomId}</div>
          <div className="text-xs text-on-surface-variant mt-1">Seq: {latestSeq}</div>
          {state.phase !== "main" && (
            <div className="text-xs text-amber-400 mt-1">
              阶段：{describePhaseLabel(state.phase)}
            </div>
          )}
        </div>

        <div className="mb-6 shrink-0">
          <div className="text-sm font-semibold mb-2">计分板</div>
          {state.config.matchMode === "BO3" && (
            <div className="text-xs text-slate-400 mb-2 text-center">
              系列赛 {p1GamesWon} : {p2GamesWon}
              {state.gameIndex ? ` · 第 ${state.gameIndex} 局` : ""}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">{state.players[bottomPlayerId]?.displayName ?? "你"}</div>
              <div className="text-2xl font-mono font-bold text-emerald-400">
                {state.players[bottomPlayerId]?.counters?.score ?? 0}
              </div>
              {!isSpectator && (
                <div className="flex gap-2 mt-2 justify-center">
                  <button
                    onClick={() =>
                      sendEvent({
                        t: "set_counter",
                        target: { kind: "player", id: bottomPlayerId },
                        key: "score",
                        delta: 1
                      })
                    }
                    className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-sm font-bold"
                  >
                    +
                  </button>
                  <button
                    onClick={() =>
                      sendEvent({
                        t: "set_counter",
                        target: { kind: "player", id: bottomPlayerId },
                        key: "score",
                        delta: -1
                      })
                    }
                    className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-sm font-bold"
                  >
                    -
                  </button>
                </div>
              )}
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 text-center">
              <div className="text-xs text-slate-400 mb-1">{state.players[topPlayerId]?.displayName ?? "对手"}</div>
              <div className="text-2xl font-mono font-bold text-rose-400">
                {state.players[topPlayerId]?.counters?.score ?? 0}
              </div>
              {!isSpectator && (
                <div className="flex gap-2 mt-2 justify-center">
                  <button
                    onClick={() =>
                      sendEvent({
                        t: "set_counter",
                        target: { kind: "player", id: topPlayerId },
                        key: "score",
                        delta: 1
                      })
                    }
                    className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-sm font-bold"
                  >
                    +
                  </button>
                  <button
                    onClick={() =>
                      sendEvent({
                        t: "set_counter",
                        target: { kind: "player", id: topPlayerId },
                        key: "score",
                        delta: -1
                      })
                    }
                    className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-sm font-bold"
                  >
                    -
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isSpectator && (
          <div className="mb-4 shrink-0 space-y-2">
            <button
              onClick={() => sendEvent({ t: "rewind" })}
              className="w-full py-2 rounded-lg border border-slate-600 text-sm text-slate-200 hover:bg-slate-700"
            >
              回溯
            </button>
            {state.phase === "main" && !pendingProposal && (
              <>
                <button
                  onClick={() => setMatchResultModal("end_match")}
                  className="w-full py-2 rounded-lg border border-amber-600/60 bg-amber-900/30 text-sm text-amber-200 hover:bg-amber-900/50"
                >
                  结束对局
                </button>
                {state.config.matchMode === "BO3" && (
                  <button
                    onClick={() => setMatchResultModal("next_game")}
                    className="w-full py-2 rounded-lg border border-sky-600/60 bg-sky-900/30 text-sm text-sky-200 hover:bg-sky-900/50"
                  >
                    下一局
                  </button>
                )}
              </>
            )}
            {pendingProposal && yourPlayerId === pendingProposal.proposerId && (
              <div className="text-xs text-amber-300 bg-amber-900/30 border border-amber-700/40 rounded-lg px-3 py-2">
                等待对手确认：
                {state.players[pendingProposal.winnerId]?.displayName ?? pendingProposal.winnerId} 胜
              </div>
            )}
          </div>
        )}

        <div className="mb-6 shrink-0">
          <div className="text-sm font-semibold mb-2">选中卡牌</div>
          <div className="text-xs text-slate-400 mb-2">
            {selectedCard ? selectedCard.id : "未选择"}
          </div>
          <div className="grid grid-cols-1 gap-2">
            <button
              disabled={!selectedCard}
              onClick={() =>
                selectedCard &&
                sendEvent({ t: "flip_card", cardId: selectedCard.id, faceUp: !selectedCard.face.faceUp })
              }
              className="py-2 rounded-lg border border-slate-600 hover:bg-slate-700 disabled:opacity-50 text-slate-200"
            >
              翻面
            </button>
          </div>
          {selectedCard && (
            <div className="mt-3 text-xs text-slate-400">
              <div>zone: {selectedCard.zoneId}</div>
              <div>
                counters:{" "}
                {Object.entries(selectedCard.counters ?? {}).length
                  ? Object.entries(selectedCard.counters).map(([k, v]) => `${k}:${v}`).join(" ")
                  : "-"}
              </div>
              <div>def: {selectedCard.defId ?? "??"}</div>
            </div>
          )}
        </div>

        <div className="flex-1 flex flex-col min-h-0">
          <div className="text-sm font-semibold mb-2 shrink-0">日志</div>
          <div className="flex-1 overflow-y-auto space-y-1 text-xs text-slate-400 bg-slate-900/50 rounded-lg p-2 border border-slate-700 flex flex-col-reverse">
            <div className="flex flex-col justify-end">
              {state.log.map((l) => (
                <div key={l.seq} className="flex gap-2 py-0.5 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/50 px-1 rounded transition-colors">
                  <span className="font-mono text-[10px] text-slate-500 w-10 shrink-0 select-none">[{l.seq}]</span>
                  <span className="break-words text-slate-300">{l.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function describePhaseLabel(phase: Phase): string {
  const labels: Partial<Record<Phase, string>> = {
    setup_dice: "掷骰选先后攻",
    setup_first_player: "败者选先后攻",
    setup_battlefield: "选择战场",
    setup_mulligan: "手牌调度",
    main: "主阶段",
    wakeup: "回合开始"
  };
  return labels[phase] ?? phase;
}

function BattlefieldSelector(props: {
  cardIds: string[];
  state: GameStateView;
  onSelect: (cardId: string) => void;
}) {
  return (
    <div className="flex justify-center gap-4">
      {props.cardIds.map((id) => (
        <button
          key={id}
          type="button"
          onClick={() => props.onSelect(id)}
          className="w-24 h-32 rounded-xl overflow-hidden border-2 border-slate-300 hover:border-primary transition-colors"
        >
          <GameCardFace hidden />
        </button>
      ))}
    </div>
  );
}

function LobbySeatCard(props: {
  seatLabel: string;
  seatId: "p1" | "p2";
  player?: PlayerState;
  isHostSeat: boolean;
  isRoomHost: boolean;
  yourPlayerId: string | null;
  savedDecks: DeckListItem[];
  decksLoading: boolean;
  onTakeSeat: () => void;
  onLeaveSeat: () => void;
  onKick: () => void;
  onSelectDeck: (deckId: string) => void;
  onToggleReady: (ready: boolean) => void;
}) {
  const isYou = props.player?.id === props.yourPlayerId;

  return (
    <div className="border rounded-lg p-4 relative flex flex-col">
      <div className="text-sm font-bold mb-2 flex justify-between items-center">
        <span>
          {props.seatLabel}{" "}
          {props.isHostSeat && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">房主</span>
          )}
        </span>
        {props.isRoomHost && props.player && !isYou && (
          <button onClick={props.onKick} className="text-[10px] text-red-500 hover:underline">
            踢出
          </button>
        )}
      </div>
      <div className="mb-2 text-sm">{props.player ? props.player.displayName : "空缺"}</div>

      {props.player && (
        <div className="text-xs text-slate-500 mb-2">
          牌组：{props.player.selectedDeckName ?? "未选择"}
          {props.player.lobbyReady && (
            <span className="ml-2 text-emerald-600 font-medium">已准备</span>
          )}
        </div>
      )}

      {!props.player ? (
        <button
          onClick={props.onTakeSeat}
          className="w-full text-xs py-1 border rounded bg-slate-50 hover:bg-slate-100 mt-auto"
        >
          坐下
        </button>
      ) : isYou ? (
        <div className="space-y-2 mt-auto">
          <select
            value={props.player.selectedDeckId ?? ""}
            onChange={(e) => {
              if (e.target.value) props.onSelectDeck(e.target.value);
            }}
            disabled={props.decksLoading || props.player.lobbyReady}
            className="w-full text-xs py-1.5 px-2 border rounded bg-white disabled:opacity-50"
          >
            <option value="">{props.decksLoading ? "加载牌组..." : "选择牌组..."}</option>
            {props.savedDecks.map((deck) => (
              <option key={deck.id} value={deck.id}>
                {deck.name}
              </option>
            ))}
          </select>
          {props.savedDecks.length === 0 && !props.decksLoading && (
            <p className="text-[10px] text-amber-600">请先在「牌组」页面创建牌组</p>
          )}
          {props.player.selectedDeckId && (
            <button
              onClick={() => props.onToggleReady(!props.player!.lobbyReady)}
              className={`w-full text-xs py-1.5 rounded font-medium ${
                props.player.lobbyReady
                  ? "border border-slate-300 text-slate-600 bg-slate-50 hover:bg-slate-100"
                  : "bg-emerald-600 text-white hover:bg-emerald-700"
              }`}
            >
              {props.player.lobbyReady ? "取消准备" : "准备就绪"}
            </button>
          )}
          <button
            onClick={props.onLeaveSeat}
            className="w-full text-xs py-1 border border-red-200 text-red-600 rounded bg-red-50 hover:bg-red-100"
          >
            离开座位
          </button>
        </div>
      ) : null}
    </div>
  );
}

function MulliganSelector(props: {
  handCards: string[];
  state: GameStateView;
  onConfirm: (selectedIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <div>
      <div className="flex flex-wrap gap-4 mb-6">
        {props.handCards.map(id => {
          const isSelected = selected.includes(id);
          return (
            <div
              key={id}
              onClick={() => {
                if (isSelected) setSelected(selected.filter(x => x !== id));
                else if (selected.length < 2) setSelected([...selected, id]);
              }}
              className={`cursor-pointer border-4 rounded-xl ${isSelected ? "border-primary" : "border-transparent"}`}
            >
              <CardHand cardId={id} state={props.state} onSelect={() => {}} showFace />
            </div>
          );
        })}
      </div>
      <div className="flex justify-end gap-4">
        <button
          onClick={() => props.onConfirm([])}
          className="px-6 py-2 border rounded-lg hover:bg-slate-50"
        >
          保留全部
        </button>
        <button
          disabled={selected.length === 0}
          onClick={() => props.onConfirm(selected)}
          className="px-6 py-2 bg-primary text-white rounded-lg disabled:opacity-50"
        >
          确认调度 ({selected.length})
        </button>
      </div>
    </div>
  );
}

function PlayerBoard(props: {
  title: string;
  zoneIds: ReturnType<typeof getPlayerZoneIds>;
  state: GameStateView;
  isOpponent: boolean;
  onSelect: (cardId: string) => void;
  onDrop: (cardId: string, toZoneId: ZoneId) => void;
  onDraw: (fromZoneId: ZoneId, toZoneId: ZoneId) => void;
  onHoverCard?: (cardId: string | null) => void;
  sendEvent?: (event: ClientEvent) => void;
  onScryMainDeck?: () => void;
}) {
  const { state, zoneIds } = props;

  return (
    <div className={`h-full flex flex-col text-slate-200 ${props.isOpponent ? 'flex-col-reverse rotate-180' : ''}`}>
      <div className={`flex items-center justify-between mb-2 px-2 ${props.isOpponent ? 'rotate-180 mt-2 mb-0' : ''}`}>
        <div className="font-semibold">{props.title}</div>
        <div className="text-xs text-slate-400">手牌：{state.zones[zoneIds.hand]?.cards.length ?? 0}</div>
      </div>

      <div className="flex-1 flex flex-col gap-2 min-h-0">
        {/* Top: Zones */}
        <div className="grid grid-cols-4 gap-2 flex-1 min-h-0">
          {/* Col 1: Rune Zone + Rune Deck */}
          <div className="flex flex-col gap-2">
            <div className="flex-1 min-h-0">
              <ZoneArea title="符文区" zoneId={zoneIds.runeZone} state={state} onSelect={props.onSelect} onDrop={props.onDrop} onHoverCard={props.onHoverCard} isOpponent={props.isOpponent} isOnBoard allowRuneReturn sendEvent={props.sendEvent} />
            </div>
            <div className="h-24 shrink-0">
              <ZonePile title="符文堆" zoneId={zoneIds.runeDeck} state={state} onSelect={props.onSelect} onDrop={props.onDrop} onDraw={() => props.onDraw(zoneIds.runeDeck, zoneIds.runeZone)} stackOnly isOpponent={props.isOpponent} />
            </div>
          </div>
          {/* Col 2: Base Zone */}
          <div className="col-span-1">
            <ZoneArea title="基地区" zoneId={zoneIds.base} state={state} onSelect={props.onSelect} onDrop={props.onDrop} onHoverCard={props.onHoverCard} isOpponent={props.isOpponent} isOnBoard sendEvent={props.sendEvent} />
          </div>
          {/* Col 3: Hero & Legend */}
          <div className="col-span-1">
            <ZoneArea title="传奇与英雄" zoneId={zoneIds.heroLegend} state={state} onSelect={props.onSelect} onDrop={props.onDrop} onHoverCard={props.onHoverCard} isOpponent={props.isOpponent} isOnBoard sendEvent={props.sendEvent} />
          </div>
          {/* Col 4: Discard & Exile */}
          <div className="flex flex-col gap-2">
            <div className="flex-1 min-h-0">
              <ZonePile title="废牌" zoneId={zoneIds.discard} state={state} onSelect={props.onSelect} onDrop={props.onDrop} stackOnly isOpponent={props.isOpponent} />
            </div>
            <div className="flex-1 min-h-0">
              <ZonePile title="放逐" zoneId={zoneIds.exile} state={state} onSelect={props.onSelect} onDrop={props.onDrop} stackOnly isOpponent={props.isOpponent} />
            </div>
          </div>
        </div>

        {/* Bottom: Hand + Main Deck */}
        <div className="flex gap-2 h-32 shrink-0">
          <div className="flex-1 min-w-0">
            <ZoneHand zoneId={zoneIds.hand} state={state} onSelect={props.onSelect} onDrop={props.onDrop} isOpponent={props.isOpponent} onHoverCard={props.onHoverCard} sendEvent={props.sendEvent} />
          </div>
          <div className="w-32 shrink-0">
            <ZonePile title="主牌堆" zoneId={zoneIds.mainDeck} state={state} onSelect={props.onSelect} onDrop={props.onDrop} onDraw={() => props.onDraw(zoneIds.mainDeck, zoneIds.hand)} onScryMainDeck={props.onScryMainDeck} stackOnly isOpponent={props.isOpponent} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ZoneArea(props: {
  title: string;
  zoneId: ZoneId;
  state: GameStateView;
  onSelect: (cardId: string) => void;
  onDrop: (cardId: string, toZoneId: ZoneId) => void;
  onHoverCard?: (cardId: string | null) => void;
  isOpponent?: boolean;
  compact?: boolean;
  isOnBoard?: boolean;
  allowRuneReturn?: boolean;
  sendEvent?: (event: ClientEvent) => void;
}) {
  const zone = props.state.zones[props.zoneId];
  const cards = zone?.cards ?? [];
  return (
    <div
      className={`rounded-lg border border-slate-700 bg-slate-800/60 ${
        props.compact ? "p-2" : "p-3"
      } h-full flex flex-col`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) props.onDrop(cardId, props.zoneId);
      }}
    >
      <div className={`flex items-center justify-between mb-2 ${props.isOpponent ? 'rotate-180' : ''}`}>
        <div className="text-xs text-slate-400">{props.title}</div>
        <div className="text-[10px] text-slate-500">{cards.length}</div>
      </div>
      <div className="flex flex-wrap gap-2 overflow-auto flex-1 min-h-0 content-start">
        {cards.slice(-12).map((id) => (
          <CardMini key={id} cardId={id} state={props.state} onSelect={props.onSelect} onHoverCard={props.onHoverCard} isOpponent={props.isOpponent} isOnBoard={props.isOnBoard} allowRuneReturn={props.allowRuneReturn} sendEvent={props.sendEvent} />
        ))}
      </div>
    </div>
  );
}

function ZonePile(props: {
  title: string;
  zoneId: ZoneId;
  state: GameStateView;
  onSelect: (cardId: string) => void;
  onDrop: (cardId: string, toZoneId: ZoneId) => void;
  onDraw?: () => void;
  onScryMainDeck?: () => void;
  stackOnly?: boolean;
  isOpponent?: boolean;
  onHoverCard?: (cardId: string | null) => void;
}) {
  const zone = props.state.zones[props.zoneId];
  const count = zone?.cards.length ?? 0;
  const top = zone?.cards[zone.cards.length - 1];

  return (
    <div
      className="rounded-xl border border-slate-700 bg-slate-800/80 p-3 h-full flex flex-col"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) props.onDrop(cardId, props.zoneId);
      }}
      onContextMenu={(e) => {
        if (props.onScryMainDeck && !props.isOpponent) {
          e.preventDefault();
          props.onScryMainDeck();
        }
      }}
    >
      <div className={`text-xs text-slate-400 mb-2 ${props.isOpponent ? 'rotate-180' : ''}`}>{props.title}</div>
      <button
        type="button"
        onClick={props.onDraw}
        className={`w-full rounded-lg border border-slate-600 bg-slate-700/50 hover:bg-slate-700 transition-all py-2 text-sm flex-1 ${props.isOpponent ? 'rotate-180' : ''}`}
      >
        {props.title} ({count})
      </button>
      
      {/* Render the deck visual if stackOnly is true and count > 0 */}
      {props.stackOnly && count > 0 && (
        <div className="mt-2 shrink-0 flex justify-center cursor-pointer" onClick={props.onDraw}>
          <div className="relative w-10 sm:w-12 aspect-[5/7] rounded-lg border-2 border-slate-600 bg-slate-800 shadow-sm flex items-center justify-center text-xs text-slate-500 hover:ring-2 hover:ring-primary transition-all hover:-translate-y-1">
            <span className="font-serif">Rift</span>
          </div>
        </div>
      )}
      
      {top && !props.stackOnly && (
        <div className="mt-2 shrink-0">
          <CardMini cardId={top} state={props.state} onSelect={props.onSelect} onHoverCard={props.onHoverCard} isOpponent={props.isOpponent} />
        </div>
      )}
    </div>
  );
}

function ZoneHand(props: {
  zoneId: ZoneId;
  state: GameStateView;
  onSelect: (cardId: string) => void;
  onDrop: (cardId: string, toZoneId: ZoneId) => void;
  isOpponent?: boolean;
  onHoverCard?: (cardId: string | null) => void;
  sendEvent?: (event: ClientEvent) => void;
}) {
  const zone = props.state.zones[props.zoneId];
  const cards = zone?.cards ?? [];
  const count = cards.length;

  return (
    <div
      className={`rounded-xl border border-dashed border-slate-700 bg-slate-800/40 p-3 h-full flex flex-col relative overflow-hidden`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        const cardId = e.dataTransfer.getData("text/plain");
        if (cardId) props.onDrop(cardId, props.zoneId);
      }}
    >
      <div className={`text-xs text-slate-400 mb-2 ${props.isOpponent ? 'rotate-180 absolute bottom-3 left-3' : 'absolute top-3 left-3'} z-10 pointer-events-none`}>
        手牌
      </div>
      <div className={`flex-1 relative w-full h-full flex justify-center items-end pb-4 ${props.isOpponent ? 'rotate-180' : ''}`}>
        {props.isOpponent ? (
          count > 0 ? (
            <div className="flex flex-col items-center justify-center gap-1">
              <div className="relative w-16 h-22">
                {Array.from({ length: Math.min(count, 7) }).map((_, i) => (
                  <div
                    key={i}
                    className="absolute w-12 aspect-[5/7] rounded-lg border border-slate-600 bg-gradient-to-br from-slate-800 to-slate-900 shadow-sm"
                    style={{ left: i * 3, bottom: i * 2, zIndex: i }}
                  >
                    <span className="absolute inset-0 flex items-center justify-center font-serif text-slate-500 text-[8px] select-none">
                      Rift
                    </span>
                  </div>
                ))}
              </div>
              <span className="text-xs text-slate-400">{count} 张</span>
            </div>
          ) : null
        ) : (
        cards.map((id, i) => {
          // Dynamic fan layout
          const maxAngle = Math.min(30, count * 3); 
          const startAngle = count > 1 ? -maxAngle / 2 : 0;
          const step = count > 1 ? maxAngle / (count - 1) : 0;
          const angle = startAngle + step * i;
          
          // Arc Y offset (Creates the curved shape)
          const yOffset = Math.abs(angle) * 0.8;
          
          // Adaptive scaling and spacing
          const scale = count > 8 ? Math.max(0.6, 1 - (count - 8) * 0.04) : 1;
          // Dynamically adjust spacing from 5 to 15 cards
          const baseSpacing = 50; // generous base spacing for few cards
          const spacing = count > 5 ? Math.max(15, baseSpacing - (count - 5) * 3) : baseSpacing;
          const xOffset = (i - (count - 1) / 2) * (spacing * scale);
          
          return (
            <div 
              key={id} 
              className={`absolute bottom-2 transition-transform duration-300 origin-bottom ${props.isOpponent ? 'hover:translate-y-4' : 'hover:-translate-y-4'}`}
              style={{
                transform: `translateX(${xOffset}px) translateY(${yOffset}px) rotate(${angle}deg) scale(${scale})`,
                zIndex: i
              }}
            >
              <CardHand 
                cardId={id} 
                state={props.state} 
                onSelect={props.onSelect} 
                hidden={props.isOpponent} 
                onHoverCard={props.onHoverCard} 
                isOpponent={props.isOpponent}
                sendEvent={props.sendEvent}
              />
            </div>
          );
        })
        )}
      </div>
    </div>
  );
}

function CardMini(props: { cardId: string; state: GameStateView; onSelect: (id: string) => void; onHoverCard?: (id: string | null) => void; isOpponent?: boolean; isOnBoard?: boolean; allowRuneReturn?: boolean; sendEvent?: (event: ClientEvent) => void }) {
  const card = props.state.cards[props.cardId];
  const [optimisticRotation, setOptimisticRotation] = useState<number | null>(null);

  // Automatically clear optimistic state when the server state catches up
  useEffect(() => {
    setOptimisticRotation(null);
  }, [card?.face.rotation]);

  if (!card) return null;

  const currentRotation = optimisticRotation !== null ? optimisticRotation : card.face.rotation;

  return (
    <div className="relative w-10 sm:w-12 aspect-[5/7] shrink-0">
      <div
        draggable
        onDragStart={(e) => e.dataTransfer.setData("text/plain", props.cardId)}
        onClick={(e) => {
          e.stopPropagation();
          if (props.isOnBoard && props.sendEvent) {
            if (!card.face.faceUp) {
              props.sendEvent({ t: "flip_card", cardId: props.cardId, faceUp: true });
            } else {
              const nextRot = currentRotation === 0 ? 90 : 0;
              setOptimisticRotation(nextRot);
              props.sendEvent({ t: "rotate_card", cardId: props.cardId, rotation: nextRot as 0 | 90 });
            }
          }
          props.onSelect(props.cardId);
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (props.allowRuneReturn && props.sendEvent && !props.isOpponent) {
            props.sendEvent({ t: "return_rune", cardId: props.cardId });
          }
        }}
        onMouseEnter={() => props.onHoverCard && props.onHoverCard(props.cardId)}
        onMouseLeave={() => props.onHoverCard && props.onHoverCard(null)}
        className={`absolute inset-0 rounded-lg border border-slate-600 shadow-sm overflow-hidden select-none cursor-pointer transform transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:shadow-lg z-0 hover:z-10 ${props.isOnBoard ? "hover:-translate-y-2 hover:ring-2 hover:ring-primary/50" : ""}`}
        style={{ transform: `rotate(${currentRotation}deg)` }}
      >
        {props.isOnBoard && (
          <div className="absolute -top-2 -right-2 bg-amber-500 text-white text-[8px] px-1 rounded shadow-sm z-10 scale-75 origin-bottom-left">
            {currentRotation === 0 ? "活跃" : "休眠"}
          </div>
        )}
        <GameCardFace
          defId={card.defId}
          hidden={!card.face.faceUp}
          className={props.isOpponent ? "rotate-180" : ""}
        />
      </div>
    </div>
  );
}

function CardHand(props: { cardId: string; state: GameStateView; onSelect: (id: string) => void; hidden?: boolean; showFace?: boolean; onHoverCard?: (id: string | null) => void; isOpponent?: boolean; sendEvent?: (event: ClientEvent) => void }) {
  const card = props.state.cards[props.cardId];
  if (!card) return null;
  return (
    <div
      draggable={!props.hidden}
      onDragStart={(e) => {
        if (!props.hidden) e.dataTransfer.setData("text/plain", props.cardId);
      }}
      onClick={() => props.onSelect(props.cardId)}
      onContextMenu={(e) => {
        e.preventDefault();
        if (!props.hidden && props.sendEvent) {
          props.sendEvent({ t: "flip_card", cardId: props.cardId, faceUp: !card.face.faceUp });
        }
      }}
      onMouseEnter={() => props.onHoverCard && props.onHoverCard(props.cardId)}
      onMouseLeave={() => props.onHoverCard && props.onHoverCard(null)}
      className="w-20 h-28 shrink-0 rounded-xl border border-slate-600 shadow-sm overflow-hidden cursor-pointer"
      style={{ transform: `rotate(${card.face.rotation}deg)` }}
    >
      <GameCardFace defId={card.defId} hidden={props.hidden || (!props.showFace && !card.face.faceUp)} className={props.isOpponent ? "rotate-180" : ""} />
    </div>
  );
}

