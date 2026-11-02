import { readFile } from "fs/promises";
import path from "path";
import type { SavedDeck } from "@sim/shared";
import type { CardDefinition } from "@sim/shared";

const DECKS_DIR = path.resolve(process.cwd(), "../../data/decks");
const CARDS_PATH = path.resolve(process.cwd(), "../../data/gamepacks/riftbound/cards.json");

let cardCatalogCache: Map<string, CardDefinition> | null = null;

export async function loadCardCatalog(): Promise<Map<string, CardDefinition>> {
  if (cardCatalogCache) return cardCatalogCache;
  try {
    const raw = await readFile(CARDS_PATH, "utf8");
    const cards = JSON.parse(raw) as CardDefinition[];
    cardCatalogCache = new Map(cards.map((c) => [c.id, c]));
    return cardCatalogCache;
  } catch {
    return new Map();
  }
}

function assertSafeDeckId(id: string) {
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error("Invalid deck id");
  }
}

export async function loadSavedDeck(deckId: string): Promise<SavedDeck | null> {
  try {
    assertSafeDeckId(deckId);
    const filePath = path.resolve(DECKS_DIR, `${deckId}.json`);
    if (!filePath.startsWith(DECKS_DIR)) return null;
    const raw = await readFile(filePath, "utf8");
    return JSON.parse(raw) as SavedDeck;
  } catch {
    return null;
  }
}

function shuffle<T>(items: T[]): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export { shuffle };
