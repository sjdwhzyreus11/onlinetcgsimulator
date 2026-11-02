"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { CardDefinition } from "@sim/shared";

const CardCatalogContext = createContext<Map<string, CardDefinition>>(new Map());

export function CardCatalogProvider(props: { packId?: string; children: ReactNode }) {
  const packId = props.packId ?? "riftbound";
  const [catalog, setCatalog] = useState<Map<string, CardDefinition>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/gamepack/${packId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { cards?: CardDefinition[] }) => {
        if (cancelled) return;
        const map = new Map<string, CardDefinition>();
        for (const card of data.cards ?? []) {
          map.set(card.id, card);
        }
        setCatalog(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [packId]);

  return <CardCatalogContext.Provider value={catalog}>{props.children}</CardCatalogContext.Provider>;
}

export function useCardCatalog() {
  return useContext(CardCatalogContext);
}

export function GameCardFace(props: {
  defId?: string;
  hidden?: boolean;
  className?: string;
}) {
  const catalog = useCardCatalog();

  if (props.hidden) {
    return (
      <div
        className={`w-full h-full bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center ${props.className ?? ""}`}
      >
        <span className="font-serif text-slate-500 text-[10px] sm:text-xs select-none">Rift</span>
      </div>
    );
  }

  const def = props.defId ? catalog.get(props.defId) : undefined;
  if (def?.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={def.imageUrl}
        alt={def.name}
        draggable={false}
        className={`w-full h-full object-cover ${props.className ?? ""}`}
      />
    );
  }

  return (
    <div
      className={`w-full h-full bg-slate-200 flex items-center justify-center text-[8px] text-slate-600 font-bold px-0.5 text-center leading-tight ${props.className ?? ""}`}
    >
      {def?.name ?? props.defId ?? "?"}
    </div>
  );
}
