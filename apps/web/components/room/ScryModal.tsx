"use client";

import { useEffect, useState } from "react";
import type { ClientEvent, GameStateView, PlayerId } from "@sim/shared";
import { GameCardFace } from "@/components/room/cardCatalog";

export default function ScryModal(props: {
  playerId: PlayerId;
  state: GameStateView;
  onClose: () => void;
  sendEvent: (event: ClientEvent) => void;
}) {
  const deckId = `${props.playerId}:mainDeck`;
  const handId = `${props.playerId}:hand`;
  const discardId = `${props.playerId}:discard`;
  const baseId = `${props.playerId}:base`;
  const deck = props.state.zones[deckId];
  const allTop = deck?.cards ?? [];
  const [viewCount, setViewCount] = useState(1);
  const visibleIds = allTop.slice(-viewCount).reverse();

  useEffect(() => {
    props.sendEvent({ t: "set_scry_session", active: true });
    return () => {
      props.sendEvent({ t: "set_scry_session", active: false });
    };
  }, []);

  function close() {
    props.onClose();
  }

  return (
    <div className="absolute inset-0 z-[120] bg-black/60 flex items-center justify-center">
      <div className="bg-white text-slate-900 rounded-xl shadow-xl max-w-2xl w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">查看牌库顶</h3>
          <button type="button" onClick={close} className="text-sm text-slate-500 hover:text-slate-800">
            关闭
          </button>
        </div>
        <div className="flex flex-wrap gap-4 mb-4 min-h-[140px]">
          {visibleIds.map((cardId) => {
            const card = props.state.cards[cardId];
            if (!card) return null;
            return (
              <div key={cardId} className="flex flex-col items-center gap-2">
                <div className="w-20 h-28 rounded-lg overflow-hidden border border-slate-300">
                  <GameCardFace defId={card.defId} />
                </div>
                <div className="flex flex-wrap gap-1 justify-center max-w-[120px]">
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded hover:bg-slate-200"
                    onClick={() => {
                      props.sendEvent({ t: "move_card", cardId, toZoneId: baseId });
                    }}
                  >
                    打出
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded hover:bg-slate-200"
                    onClick={() => {
                      props.sendEvent({ t: "move_card", cardId, toZoneId: handId });
                    }}
                  >
                    入手
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded hover:bg-slate-200"
                    onClick={() => {
                      props.sendEvent({ t: "move_card_bottom", cardId, toZoneId: deckId });
                    }}
                  >
                    回收
                  </button>
                  <button
                    type="button"
                    className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded hover:bg-slate-200"
                    onClick={() => {
                      props.sendEvent({ t: "move_card", cardId, toZoneId: discardId });
                    }}
                  >
                    弃置
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {viewCount < allTop.length && (
          <button
            type="button"
            className="text-sm text-primary hover:underline"
            onClick={() => setViewCount((c) => Math.min(c + 1, allTop.length))}
          >
            继续查看下一张
          </button>
        )}
      </div>
    </div>
  );
}
