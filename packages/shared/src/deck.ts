import type { CardDefId, Deck } from "./protocol.js";

export type CardType =
  | "legend"
  | "hero"
  | "unit"
  | "equipment"
  | "spell"
  | "rune"
  | "battlefield";

export type CardDefinition = {
  id: CardDefId;
  name: string;
  type: CardType;
  runeTags?: string[];
  isExclusive?: boolean;
  imageUrl?: string;
  cardNo?: string;
  cardCategory?: string;
  rarity?: string;
  sourceImageUrl?: string;
};

/** Raw card record from playloltcg API (`searchCardCraftWeb`). */
export type PlayloltcgCardRecord = {
  id: number;
  cardCategory: string;
  cardNo?: string;
  cardName: string;
  cardColorList?: string[];
  frontImage?: string;
  rarity?: string;
  cardGroupLimit?: number | null;
};

export function mapCardCategoryToType(category: string): CardType {
  switch (category) {
    case "legendary":
      return "legend";
    case "hero_unit":
      return "hero";
    case "rune":
      return "rune";
    case "battlefield":
    case "indicator_battlefield":
      return "battlefield";
    case "spell":
    case "exclusive_spell":
      return "spell";
    case "equipment":
    case "exclusive_equipment":
    case "indicator_equipment":
      return "equipment";
    default:
      return "unit";
  }
}

export function isExclusiveCardCategory(category: string): boolean {
  return category.startsWith("exclusive_");
}

export function mapPlayloltcgCard(raw: PlayloltcgCardRecord): CardDefinition {
  const imageUrl = raw.frontImage || undefined;
  return {
    id: String(raw.id),
    name: raw.cardName,
    type: mapCardCategoryToType(raw.cardCategory),
    runeTags: raw.cardColorList?.length ? [...raw.cardColorList] : undefined,
    isExclusive: isExclusiveCardCategory(raw.cardCategory),
    imageUrl,
    sourceImageUrl: imageUrl,
    cardNo: raw.cardNo || undefined,
    cardCategory: raw.cardCategory,
    rarity: raw.rarity || undefined
  };
}

export function filterCards(
  cards: CardDefinition[],
  options: {
    type?: CardType | "all" | "main" | "sideboard";
    color?: string;
    legendTags?: string[];
    query?: string;
    limit?: number;
  }
): CardDefinition[] {
  const q = options.query?.trim().toLowerCase() ?? "";
  let result = cards;

  if (options.type && options.type !== "all") {
    if (options.type === "main") {
      result = result.filter((c) => ["unit", "equipment", "spell"].includes(c.type));
    } else if (options.type === "sideboard") {
      result = result.filter((c) => ["unit", "equipment", "spell"].includes(c.type));
    } else {
      result = result.filter((c) => c.type === options.type);
    }
  }

  if (options.color) {
    result = result.filter((c) => c.runeTags?.includes(options.color!));
  }

  if (options.legendTags?.length) {
    result = result.filter(
      (c) =>
        c.type === "battlefield" ||
        !c.runeTags?.length ||
        c.runeTags.some((tag) => options.legendTags!.includes(tag))
    );
  }

  if (q) {
    result = result.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.cardNo?.toLowerCase().includes(q)
    );
  }

  if (options.limit && !q) {
    result = result.slice(0, options.limit);
  }

  return result;
}

export type GamePackMeta = {
  id: string;
  name: string;
  defaultBattlefieldCount: number;
};

export type SavedDeck = {
  id: string;
  name: string;
  gamePackId: string;
  legendCardId: CardDefId;
  heroCardId: CardDefId;
  mainDeck: CardDefId[];
  runeDeck: CardDefId[];
  battlefields: CardDefId[];
  sideboard?: CardDefId[];
  createdAt: string;
  updatedAt: string;
};

export type DeckValidationIssue = {
  level: "error" | "warning";
  code: string;
  message: string;
};

export type DeckListItem = {
  id: string;
  name: string;
  gamePackId: string;
  mainCount: number;
  runeCount: number;
  battlefieldCount: number;
  updatedAt: string;
};

function countById(ids: CardDefId[]): Map<CardDefId, number> {
  const counts = new Map<CardDefId, number>();
  for (const id of ids) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

function countByName(
  ids: CardDefId[],
  catalog: Map<CardDefId, CardDefinition>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const id of ids) {
    const card = catalog.get(id);
    if (!card) continue;
    counts.set(card.name, (counts.get(card.name) ?? 0) + 1);
  }
  return counts;
}

function collectUnknownIds(
  ids: CardDefId[],
  catalog: Map<CardDefId, CardDefinition>
): CardDefId[] {
  return [...new Set(ids.filter((id) => !catalog.has(id)))];
}

function collectWrongTypeIds(
  ids: CardDefId[],
  catalog: Map<CardDefId, CardDefinition>,
  expectedType: CardType
): CardDefId[] {
  return [...new Set(ids.filter((id) => catalog.get(id)?.type !== expectedType))];
}

export function deckToRuntimeDeck(saved: SavedDeck): Deck {
  return {
    mainDeck: saved.mainDeck,
    runeDeck: saved.runeDeck,
    legendCardId: saved.legendCardId,
    heroCardId: saved.heroCardId,
    sideboard: saved.sideboard,
    battlefields: saved.battlefields
  };
}

export function toDeckListItem(deck: SavedDeck): DeckListItem {
  return {
    id: deck.id,
    name: deck.name,
    gamePackId: deck.gamePackId,
    mainCount: deck.mainDeck.length,
    runeCount: deck.runeDeck.length,
    battlefieldCount: deck.battlefields.length,
    updatedAt: deck.updatedAt
  };
}

export function validateDeck(
  deck: SavedDeck,
  cards: CardDefinition[],
  pack?: Pick<GamePackMeta, "defaultBattlefieldCount">
): DeckValidationIssue[] {
  const issues: DeckValidationIssue[] = [];
  const catalog = new Map(cards.map((c) => [c.id, c]));
  const battlefieldTarget = pack?.defaultBattlefieldCount ?? 3;

  const allReferencedIds = [
    deck.legendCardId,
    deck.heroCardId,
    ...deck.mainDeck,
    ...deck.runeDeck,
    ...deck.battlefields,
    ...(deck.sideboard ?? [])
  ].filter(Boolean);

  for (const id of collectUnknownIds(allReferencedIds, catalog)) {
    issues.push({
      level: "error",
      code: "unknown_card",
      message: `卡牌 ID "${id}" 不存在于卡牌库中`
    });
  }

  if (!deck.legendCardId) {
    issues.push({ level: "error", code: "missing_legend", message: "请选择传奇卡牌" });
  } else if (catalog.get(deck.legendCardId)?.type !== "legend") {
    issues.push({ level: "error", code: "invalid_legend", message: "传奇槽位必须是传奇类型卡牌" });
  }

  if (!deck.heroCardId) {
    issues.push({ level: "error", code: "missing_hero", message: "请选择英雄卡牌" });
  } else if (catalog.get(deck.heroCardId)?.type !== "hero") {
    issues.push({ level: "error", code: "invalid_hero", message: "英雄槽位必须是英雄类型卡牌" });
  }

  if (deck.heroCardId) {
    const heroCount = deck.mainDeck.filter((id) => id === deck.heroCardId).length;
    if (heroCount === 0) {
      issues.push({
        level: "error",
        code: "hero_not_in_main",
        message: "选定英雄必须包含在主牌堆中"
      });
    } else if (heroCount > 1) {
      issues.push({
        level: "warning",
        code: "hero_multiple",
        message: `主牌堆中包含 ${heroCount} 张选定英雄（应为 1 张）`
      });
    }
  }

  for (const id of collectWrongTypeIds(deck.runeDeck, catalog, "rune")) {
    issues.push({
      level: "warning",
      code: "invalid_rune_type",
      message: `符文堆中的 "${id}" 不是符文类型卡牌`
    });
  }

  for (const id of collectWrongTypeIds(deck.battlefields, catalog, "battlefield")) {
    issues.push({
      level: "warning",
      code: "invalid_battlefield_type",
      message: `战场中的 "${id}" 不是战场类型卡牌`
    });
  }

  const mainNonHeroTypes: CardType[] = ["unit", "equipment", "spell", "hero"];
  for (const id of deck.mainDeck) {
    const card = catalog.get(id);
    if (!card) continue;
    if (!mainNonHeroTypes.includes(card.type)) {
      issues.push({
        level: "warning",
        code: "invalid_main_type",
        message: `主牌堆中的 "${card.name}" 类型为 ${card.type}，不应放入主牌堆`
      });
    }
  }

  if (deck.mainDeck.length < 40) {
    issues.push({
      level: "warning",
      code: "main_deck_size",
      message: `主牌堆当前 ${deck.mainDeck.length} 张，规则要求至少 40 张`
    });
  }

  if (deck.runeDeck.length !== 12) {
    issues.push({
      level: "warning",
      code: "rune_deck_size",
      message: `符文堆当前 ${deck.runeDeck.length} 张，规则要求恰好 12 张`
    });
  }

  if (deck.battlefields.length !== battlefieldTarget) {
    issues.push({
      level: "warning",
      code: "battlefield_count",
      message: `战场当前 ${deck.battlefields.length} 张，建议 ${battlefieldTarget} 张`
    });
  }

  for (const [name, count] of countByName(deck.mainDeck, catalog)) {
    if (count > 3) {
      issues.push({
        level: "warning",
        code: "copy_limit",
        message: `主牌堆中 "${name}" 有 ${count} 张，同名卡牌最多 3 张`
      });
    }
  }

  let exclusiveCount = 0;
  for (const [id, count] of countById(deck.mainDeck)) {
    if (catalog.get(id)?.isExclusive) {
      exclusiveCount += count;
    }
  }
  if (exclusiveCount > 3) {
    issues.push({
      level: "warning",
      code: "exclusive_limit",
      message: `专属卡牌合计 ${exclusiveCount} 张，最多 3 张`
    });
  }

  const legend = deck.legendCardId ? catalog.get(deck.legendCardId) : undefined;
  if (legend?.runeTags && legend.runeTags.length > 0) {
    const requiredTags = new Set(legend.runeTags);
    const checkPool = [...deck.mainDeck, ...deck.runeDeck];
    for (const id of checkPool) {
      const card = catalog.get(id);
      if (!card?.runeTags || card.runeTags.length === 0) continue;
      const matches = card.runeTags.some((tag) => requiredTags.has(tag));
      if (!matches) {
        issues.push({
          level: "warning",
          code: "rune_affinity_mismatch",
          message: `"${card.name}" 的符文特性与传奇 "${legend.name}" 不匹配`
        });
      }
    }
  }

  return issues;
}

export function createEmptyDeck(params: {
  id: string;
  name?: string;
  gamePackId?: string;
  legendCardId?: CardDefId;
  heroCardId?: CardDefId;
}): SavedDeck {
  const now = new Date().toISOString();
  return {
    id: params.id,
    name: params.name ?? "新牌组",
    gamePackId: params.gamePackId ?? "riftbound",
    legendCardId: params.legendCardId ?? "",
    heroCardId: params.heroCardId ?? "",
    mainDeck: params.heroCardId ? [params.heroCardId] : [],
    runeDeck: [],
    battlefields: [],
    sideboard: [],
    createdAt: now,
    updatedAt: now
  };
}
