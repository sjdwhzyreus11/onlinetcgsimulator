"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  filterCards,
  validateDeck,
  type CardDefinition,
  type CardType,
  type DeckValidationIssue,
  type GamePackMeta,
  type SavedDeck
} from "@sim/shared";

const MAIN_TYPES: CardType[] = ["unit", "equipment", "spell"];
const SIDEBOARD_MAX = 8;
const RUNE_MAX = 12;
const BATTLEFIELD_MAX = 3;
const MAIN_NON_HERO_MAX = 39;

type PoolTab = "legend" | "hero" | "main" | "rune" | "battlefield" | "sideboard";

const POOL_TABS: { value: PoolTab; label: string }[] = [
  { value: "legend", label: "传奇" },
  { value: "hero", label: "英雄" },
  { value: "main", label: "主牌" },
  { value: "rune", label: "符文" },
  { value: "battlefield", label: "战场" },
  { value: "sideboard", label: "备牌" }
];

type Props = {
  initialDeck: SavedDeck;
  pack: GamePackMeta;
  cards: CardDefinition[];
};

function countById(ids: string[]) {
  const map = new Map<string, number>();
  for (const id of ids) {
    map.set(id, (map.get(id) ?? 0) + 1);
  }
  return map;
}

function countByName(ids: string[], catalog: Map<string, CardDefinition>) {
  const map = new Map<string, number>();
  for (const id of ids) {
    const card = catalog.get(id);
    if (!card) continue;
    map.set(card.name, (map.get(card.name) ?? 0) + 1);
  }
  return map;
}

function filterDeckIdsByLegend(ids: string[], catalog: Map<string, CardDefinition>, legendTags: string[]) {
  if (!legendTags.length) return ids;
  return ids.filter((id) => {
    const card = catalog.get(id);
    if (!card?.runeTags?.length) return true;
    return card.runeTags.some((tag) => legendTags.includes(tag));
  });
}

function CardImage(props: {
  card?: CardDefinition;
  empty?: boolean;
  size?: "pool" | "deck";
  count?: number;
  onClick?: () => void;
  title?: string;
}) {
  const poolClass = "aspect-[5/7] w-full";
  const deckClass = "aspect-[5/7] w-[72px] sm:w-[80px]";
  const className = props.size === "pool" ? poolClass : deckClass;

  if (!props.card) {
    return (
      <div
        className={`${className} rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center text-xs text-slate-300`}
        title={props.title}
      >
        {props.empty ? "" : "空"}
      </div>
    );
  }

  return (
    <button
      type="button"
      title={props.title ?? props.card.name}
      onClick={props.onClick}
      className={`${className} relative rounded-lg overflow-hidden border-2 border-slate-200 hover:border-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40`}
    >
      {props.card.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={props.card.imageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full bg-slate-100" />
      )}
      {props.count !== undefined && props.count > 1 && (
        <span className="absolute top-1 right-1 min-w-[20px] h-5 px-1 rounded-full bg-black/70 text-white text-xs flex items-center justify-center">
          x{props.count}
        </span>
      )}
    </button>
  );
}

function ValidationPanel(props: { issues: DeckValidationIssue[] }) {
  if (props.issues.length === 0) return null;
  return (
    <div className="space-y-1 max-h-32 overflow-y-auto">
      {props.issues.slice(0, 5).map((issue) => (
        <div
          key={`${issue.code}-${issue.message}`}
          className={`text-xs rounded px-2 py-1 ${
            issue.level === "error" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"
          }`}
        >
          {issue.message}
        </div>
      ))}
    </div>
  );
}

function DeckSection(props: {
  title: string;
  count: number;
  target: number;
  ids: string[];
  catalog: Map<string, CardDefinition>;
  onRemove: (id: string) => void;
}) {
  const counts = countById(props.ids);
  const entries = [...counts.entries()];

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-on-surface">{props.title}</h3>
        <span className="text-xs text-on-surface-variant">
          {props.count}/{props.target}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        {entries.map(([id, n]) => {
          const card = props.catalog.get(id);
          if (!card) return null;
          return (
            <CardImage
              key={id}
              card={card}
              size="deck"
              count={n}
              onClick={() => props.onRemove(id)}
              title={`${card.name}（点击移除）`}
            />
          );
        })}
        {entries.length === 0 && (
          <span className="text-xs text-on-surface-variant py-4">暂无卡牌</span>
        )}
      </div>
    </div>
  );
}

export default function DeckEditor(props: Props) {
  const [deck, setDeck] = useState<SavedDeck>(() => ({
    ...props.initialDeck,
    sideboard: props.initialDeck.sideboard ?? []
  }));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [poolTab, setPoolTab] = useState<PoolTab>("legend");

  const catalog = useMemo(
    () => new Map(props.cards.map((c) => [c.id, c])),
    [props.cards]
  );

  const legend = deck.legendCardId ? catalog.get(deck.legendCardId) : undefined;
  const legendTags = legend?.runeTags ?? [];
  const hasLegend = Boolean(deck.legendCardId);

  const mainWithoutHero = useMemo(
    () => deck.mainDeck.filter((id) => id !== deck.heroCardId),
    [deck.mainDeck, deck.heroCardId]
  );

  const issues = useMemo(
    () => validateDeck(deck, props.cards, props.pack),
    [deck, props.cards, props.pack]
  );

  const poolCards = useMemo(() => {
    if (!hasLegend) {
      return filterCards(props.cards, { type: "legend", query, limit: query ? undefined : 100 });
    }

    const tab = poolTab === "legend" ? "legend" : poolTab;
    return filterCards(props.cards, {
      type: tab,
      legendTags,
      query,
      limit: query ? undefined : 120
    });
  }, [props.cards, hasLegend, poolTab, legendTags, query]);

  function setLegend(legendCardId: string) {
    setDeck((prev) => {
      const nextLegend = catalog.get(legendCardId);
      const tags = nextLegend?.runeTags ?? [];
      const filterIds = (ids: string[]) => filterDeckIdsByLegend(ids, catalog, tags);

      let heroCardId = prev.heroCardId;
      let mainDeck = filterIds(prev.mainDeck);
      if (heroCardId) {
        const hero = catalog.get(heroCardId);
        const heroOk =
          !hero?.runeTags?.length || hero.runeTags.some((t) => tags.includes(t));
        if (!heroOk) {
          heroCardId = "";
          mainDeck = mainDeck.filter((id) => id !== prev.heroCardId);
        }
      }

      return {
        ...prev,
        legendCardId,
        heroCardId,
        mainDeck,
        runeDeck: filterIds(prev.runeDeck),
        battlefields: prev.battlefields,
        sideboard: filterIds(prev.sideboard ?? [])
      };
    });
    if (legendCardId) setPoolTab("hero");
  }

  function setHero(heroCardId: string) {
    setDeck((prev) => {
      let mainDeck = prev.mainDeck.filter((id) => id !== prev.heroCardId);
      if (heroCardId) mainDeck = [...mainDeck, heroCardId];
      return { ...prev, heroCardId, mainDeck };
    });
  }

  function canAddCopy(ids: string[], card: CardDefinition, maxTotal: number, maxCopies = 3) {
    if (ids.length >= maxTotal) return false;
    const nameCount = countByName(ids, catalog).get(card.name) ?? 0;
    return nameCount < maxCopies;
  }

  function addCard(card: CardDefinition) {
    if (card.type === "legend") {
      setLegend(card.id);
      return;
    }
    if (!hasLegend) return;

    setDeck((prev) => {
      if (card.type === "hero") {
        if (prev.heroCardId === card.id) return prev;
        let mainDeck = prev.mainDeck.filter((id) => id !== prev.heroCardId);
        mainDeck = [...mainDeck, card.id];
        return { ...prev, heroCardId: card.id, mainDeck };
      }

      if (card.type === "rune") {
        if (prev.runeDeck.length >= RUNE_MAX) return prev;
        return { ...prev, runeDeck: [...prev.runeDeck, card.id] };
      }

      if (card.type === "battlefield") {
        if (prev.battlefields.length >= BATTLEFIELD_MAX) return prev;
        return { ...prev, battlefields: [...prev.battlefields, card.id] };
      }

      if (MAIN_TYPES.includes(card.type)) {
        if (poolTab === "sideboard") {
          const sideboard = prev.sideboard ?? [];
          if (!canAddCopy(sideboard, card, SIDEBOARD_MAX)) return prev;
          return { ...prev, sideboard: [...sideboard, card.id] };
        }

        const nonHero = prev.mainDeck.filter((id) => id !== prev.heroCardId);
        if (!canAddCopy(nonHero, card, MAIN_NON_HERO_MAX)) return prev;
        return { ...prev, mainDeck: [...prev.mainDeck, card.id] };
      }

      return prev;
    });
  }

  function removeOne(ids: string[], id: string) {
    const idx = ids.lastIndexOf(id);
    if (idx === -1) return ids;
    const next = ids.slice();
    next.splice(idx, 1);
    return next;
  }

  function removeFromDeck(cardId: string, zone: "legend" | "hero" | "main" | "rune" | "battlefield" | "sideboard") {
    if (zone === "legend") setPoolTab("legend");
    setDeck((prev) => {
      switch (zone) {
        case "legend":
          return {
            ...prev,
            legendCardId: "",
            heroCardId: "",
            mainDeck: prev.mainDeck.filter((id) => id !== prev.heroCardId)
          };
        case "hero":
          return {
            ...prev,
            heroCardId: "",
            mainDeck: prev.mainDeck.filter((id) => id !== cardId)
          };
        case "main":
          return { ...prev, mainDeck: removeOne(prev.mainDeck, cardId) };
        case "rune":
          return { ...prev, runeDeck: removeOne(prev.runeDeck, cardId) };
        case "battlefield":
          return { ...prev, battlefields: removeOne(prev.battlefields, cardId) };
        case "sideboard":
          return { ...prev, sideboard: removeOne(prev.sideboard ?? [], cardId) };
        default:
          return prev;
      }
    });
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/decks/${deck.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(deck)
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "保存失败");
      }
      const data = await res.json();
      setDeck({ ...data.deck, sideboard: data.deck.sideboard ?? [] });
      setMessage("已保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] min-h-[640px]">
      <div className="flex items-center justify-between mb-4 gap-4">
        <Link className="text-sky-600 hover:underline text-sm shrink-0" href="/decks">
          返回列表
        </Link>
        {message && <span className="text-sm text-on-surface-variant">{message}</span>}
      </div>

      <div className="flex flex-1 min-h-0 gap-4 flex-col lg:flex-row">
        {/* 左侧：卡牌库 */}
        <div className="flex flex-col min-h-0 lg:w-[58%] bg-white border border-slate-100 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-4 border-b border-slate-100 space-y-3 shrink-0">
            {!hasLegend ? (
              <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                请先选择一张传奇卡牌，之后将只显示该传奇对应色组的卡牌。
              </p>
            ) : (
              <p className="text-xs text-on-surface-variant">
                当前传奇色组：
                {legendTags.length > 0 ? legendTags.join(" / ") : "无"}
              </p>
            )}
            {hasLegend && (
              <div className="flex flex-wrap gap-2">
                {POOL_TABS.map((tab) => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`px-3 py-1 text-xs rounded-full border ${
                      poolTab === tab.value
                        ? "bg-primary text-on-primary border-primary"
                        : "border-slate-200 hover:bg-slate-50"
                    }`}
                    onClick={() => setPoolTab(tab.value)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
            <input
              className="w-full rounded-lg border-slate-200 focus:border-primary focus:ring-primary text-sm"
              placeholder="搜索卡牌..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={!hasLegend && poolTab !== "legend"}
            />
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {poolCards.length === 0 ? (
              <div className="text-center text-sm text-on-surface-variant py-12">无匹配卡牌</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                {poolCards.map((card) => (
                  <CardImage
                    key={card.id}
                    card={card}
                    size="pool"
                    onClick={() => addCard(card)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右侧：卡组内容 */}
        <div className="flex flex-col min-h-0 lg:w-[42%] bg-white border border-slate-100 rounded-xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="p-4 border-b border-slate-100 shrink-0 space-y-3">
            <input
              className="w-full rounded-lg border-slate-200 focus:border-primary focus:ring-primary text-lg font-semibold"
              placeholder="牌组名称"
              value={deck.name}
              onChange={(e) => setDeck({ ...deck, name: e.target.value.slice(0, 64) })}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm hover:opacity-90 disabled:opacity-50"
                onClick={save}
              >
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
            <ValidationPanel issues={issues} />
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div>
              <h3 className="text-sm font-semibold mb-2">传奇 · 英雄</h3>
              <div className="flex flex-wrap gap-2">
                {legend ? (
                  <CardImage
                    card={legend}
                    size="deck"
                    onClick={() => removeFromDeck(legend.id, "legend")}
                    title={`${legend.name}（点击移除）`}
                  />
                ) : (
                  <CardImage empty size="deck" title="传奇" />
                )}
                {deck.heroCardId && catalog.get(deck.heroCardId) ? (
                  <CardImage
                    card={catalog.get(deck.heroCardId)!}
                    size="deck"
                    onClick={() => removeFromDeck(deck.heroCardId, "hero")}
                    title={`${catalog.get(deck.heroCardId)!.name}（点击移除）`}
                  />
                ) : (
                  <CardImage empty size="deck" title="英雄" />
                )}
              </div>
            </div>

            <DeckSection
              title="主牌堆（不含英雄）"
              count={mainWithoutHero.length}
              target={MAIN_NON_HERO_MAX}
              ids={mainWithoutHero}
              catalog={catalog}
              onRemove={(id) => removeFromDeck(id, "main")}
            />

            <DeckSection
              title="符文牌堆"
              count={deck.runeDeck.length}
              target={RUNE_MAX}
              ids={deck.runeDeck}
              catalog={catalog}
              onRemove={(id) => removeFromDeck(id, "rune")}
            />

            <DeckSection
              title="战场"
              count={deck.battlefields.length}
              target={BATTLEFIELD_MAX}
              ids={deck.battlefields}
              catalog={catalog}
              onRemove={(id) => removeFromDeck(id, "battlefield")}
            />

            <DeckSection
              title="备牌（可选）"
              count={(deck.sideboard ?? []).length}
              target={SIDEBOARD_MAX}
              ids={deck.sideboard ?? []}
              catalog={catalog}
              onRemove={(id) => removeFromDeck(id, "sideboard")}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
