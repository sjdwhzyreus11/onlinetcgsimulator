import { describe, it, expect } from "vitest";
import {
  mapCardCategoryToType,
  isExclusiveCardCategory,
  mapPlayloltcgCard,
  filterCards,
  type CardDefinition
} from "../deck";

describe("playloltcg card mapping", () => {
  it("maps card categories to deck types", () => {
    expect(mapCardCategoryToType("legendary")).toBe("legend");
    expect(mapCardCategoryToType("hero_unit")).toBe("hero");
    expect(mapCardCategoryToType("rune")).toBe("rune");
    expect(mapCardCategoryToType("exclusive_unit")).toBe("unit");
    expect(mapCardCategoryToType("indicator_battlefield")).toBe("battlefield");
  });

  it("detects exclusive categories", () => {
    expect(isExclusiveCardCategory("exclusive_spell")).toBe(true);
    expect(isExclusiveCardCategory("unit")).toBe(false);
  });

  it("maps API record to CardDefinition", () => {
    const card = mapPlayloltcgCard({
      id: 34734,
      cardCategory: "legendary",
      cardNo: "UNL-181/219",
      cardName: "测试传奇",
      cardColorList: ["red", "blue"],
      frontImage: "https://cdn.playloltcg.com/lol/card/test.webp",
      rarity: "rune_shard"
    });
    expect(card.id).toBe("34734");
    expect(card.type).toBe("legend");
    expect(card.runeTags).toEqual(["red", "blue"]);
    expect(card.imageUrl).toContain("cdn.playloltcg.com");
  });

  it("filters cards by query and type", () => {
    const cards: CardDefinition[] = [
      { id: "1", name: "亚索", type: "hero", cardNo: "OGN-H01" },
      { id: "2", name: "火焰符文", type: "rune", cardNo: "OGN-R01" }
    ];
    expect(filterCards(cards, { type: "hero", query: "亚" })).toHaveLength(1);
    expect(filterCards(cards, { type: "all", limit: 1 })).toHaveLength(1);
  });

  it("does not filter battlefields by legend color tags", () => {
    const cards: CardDefinition[] = [
      { id: "u1", name: "红单位", type: "unit", runeTags: ["red"] },
      { id: "u2", name: "绿单位", type: "unit", runeTags: ["green"] },
      { id: "bf1", name: "中立战场", type: "battlefield", runeTags: ["colorless"] }
    ];
    const filtered = filterCards(cards, { type: "battlefield", legendTags: ["red"] });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("bf1");
  });
});
