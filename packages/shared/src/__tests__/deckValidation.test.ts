import { describe, it, expect } from "vitest";
import { createEmptyDeck, validateDeck, type CardDefinition } from "../deck";

const catalog: CardDefinition[] = [
  { id: "legend1", name: "示例传奇", type: "legend", runeTags: ["fire"] },
  { id: "hero1", name: "示例英雄", type: "hero", runeTags: ["fire"] },
  { id: "m0", name: "示例单位 A", type: "unit", runeTags: ["fire"] },
  { id: "m1", name: "示例单位 B", type: "unit", runeTags: ["fire"] },
  { id: "m2", name: "示例单位 C", type: "unit", runeTags: ["fire"] },
  { id: "m3", name: "示例单位 D", type: "unit", runeTags: ["fire"] },
  { id: "m4", name: "示例单位 E", type: "unit", runeTags: ["fire"] },
  { id: "m5", name: "示例单位 F", type: "unit", runeTags: ["fire"] },
  { id: "m6", name: "示例单位 G", type: "unit", runeTags: ["fire"] },
  { id: "m7", name: "示例单位 H", type: "unit", runeTags: ["fire"] },
  { id: "m8", name: "示例单位 I", type: "unit", runeTags: ["fire"] },
  { id: "m9", name: "示例单位 J", type: "unit", runeTags: ["fire"] },
  { id: "m10", name: "示例单位 K", type: "unit", runeTags: ["fire"] },
  { id: "m11", name: "示例单位 L", type: "unit", runeTags: ["fire"] },
  { id: "m12", name: "示例单位 M", type: "unit", runeTags: ["fire"] },
  { id: "m13", name: "示例法术", type: "spell", runeTags: ["fire"] },
  { id: "exclusive1", name: "专属牌", type: "unit", isExclusive: true, runeTags: ["fire"] },
  { id: "r0", name: "火焰符文", type: "rune", runeTags: ["fire"] },
  { id: "bf0", name: "示例战场", type: "battlefield" }
];

function buildValidDeck() {
  const deck = createEmptyDeck({
    id: "deck-1",
    name: "测试牌组",
    legendCardId: "legend1",
    heroCardId: "hero1"
  });
  const fillerIds = ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "m9", "m10", "m11", "m12", "m13"];
  const mainDeck: string[] = ["hero1"];
  let idx = 0;
  while (mainDeck.length < 40) {
    for (let copy = 0; copy < 3 && mainDeck.length < 40; copy++) {
      mainDeck.push(fillerIds[idx % fillerIds.length]);
    }
    idx++;
  }
  deck.mainDeck = mainDeck;
  return deck;
}

describe("validateDeck", () => {
  it("reports error when legend or hero is missing", () => {
    const deck = createEmptyDeck({ id: "d1" });
    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === "missing_legend")).toBe(true);
    expect(issues.some((i) => i.code === "missing_hero")).toBe(true);
  });

  it("reports error when hero is not in main deck", () => {
    const deck = createEmptyDeck({
      id: "d1",
      legendCardId: "legend1",
      heroCardId: "hero1"
    });
    deck.mainDeck = [];
    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === "hero_not_in_main")).toBe(true);
  });

  it("warns when main deck has fewer than 40 cards", () => {
    const deck = buildValidDeck();
    deck.mainDeck = ["hero1", "m0"];
    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === "main_deck_size")).toBe(true);
  });

  it("warns when rune deck is not exactly 12", () => {
    const deck = buildValidDeck();
    deck.runeDeck = Array(10).fill("r0");
    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === "rune_deck_size")).toBe(true);
  });

  it("warns when same-name cards exceed 3 in main deck", () => {
    const deck = buildValidDeck();
    deck.mainDeck = ["hero1", ...Array(4).fill("m0"), ...Array(35).fill("m1")];
    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === "copy_limit")).toBe(true);
  });

  it("warns when exclusive cards exceed 3 total", () => {
    const deck = buildValidDeck();
    deck.mainDeck = ["hero1", ...Array(4).fill("exclusive1"), ...Array(35).fill("m0")];
    const issues = validateDeck(deck, catalog);
    expect(issues.some((i) => i.code === "exclusive_limit")).toBe(true);
  });

  it("passes with a rule-compliant deck", () => {
    const deck = buildValidDeck();
    deck.runeDeck = Array(12).fill("r0");
    deck.battlefields = ["bf0", "bf0", "bf0"];
    const issues = validateDeck(deck, catalog);
    expect(issues.filter((i) => i.level === "error")).toHaveLength(0);
    expect(issues.filter((i) => i.level === "warning")).toHaveLength(0);
  });
});
