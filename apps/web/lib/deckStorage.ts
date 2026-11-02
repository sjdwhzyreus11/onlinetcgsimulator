import { promises as fs } from "fs";
import path from "path";
import type {
  CardDefinition,
  GamePackMeta,
  SavedDeck,
  DeckListItem
} from "@sim/shared";
import { createEmptyDeck, toDeckListItem } from "@sim/shared";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const DATA_DIR = path.join(REPO_ROOT, "data");
const DECKS_DIR = path.join(DATA_DIR, "decks");
const GAMEPACKS_DIR = path.join(DATA_DIR, "gamepacks");

function assertSafeSegment(segment: string, label: string) {
  if (!segment || segment.includes("..") || segment.includes("/") || segment.includes("\\")) {
    throw new Error(`Invalid ${label}`);
  }
}

function deckFilePath(id: string) {
  assertSafeSegment(id, "deck id");
  const resolved = path.resolve(DECKS_DIR, `${id}.json`);
  if (!resolved.startsWith(DECKS_DIR)) {
    throw new Error("Invalid deck path");
  }
  return resolved;
}

function gamePackDir(packId: string) {
  assertSafeSegment(packId, "game pack id");
  const resolved = path.resolve(GAMEPACKS_DIR, packId);
  if (!resolved.startsWith(GAMEPACKS_DIR)) {
    throw new Error("Invalid game pack path");
  }
  return resolved;
}

async function ensureDirs() {
  await fs.mkdir(DECKS_DIR, { recursive: true });
}

async function readJson<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function writeJson(filePath: string, value: unknown) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listDecks(): Promise<DeckListItem[]> {
  await ensureDirs();
  let files: string[];
  try {
    files = await fs.readdir(DECKS_DIR);
  } catch {
    return [];
  }

  const items: DeckListItem[] = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const deck = await readJson<SavedDeck>(path.join(DECKS_DIR, file));
      items.push(toDeckListItem(deck));
    } catch {
      // skip invalid files
    }
  }

  return items.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDeck(id: string): Promise<SavedDeck | null> {
  await ensureDirs();
  try {
    return await readJson<SavedDeck>(deckFilePath(id));
  } catch {
    return null;
  }
}

export async function createDeck(input?: { name?: string; gamePackId?: string }): Promise<SavedDeck> {
  await ensureDirs();
  const id = crypto.randomUUID();
  const deck = createEmptyDeck({
    id,
    name: input?.name,
    gamePackId: input?.gamePackId
  });
  await writeJson(deckFilePath(id), deck);
  return deck;
}

export async function saveDeck(deck: SavedDeck): Promise<SavedDeck> {
  await ensureDirs();
  const updated: SavedDeck = {
    ...deck,
    updatedAt: new Date().toISOString()
  };
  await writeJson(deckFilePath(deck.id), updated);
  return updated;
}

export async function deleteDeck(id: string): Promise<boolean> {
  await ensureDirs();
  try {
    await fs.unlink(deckFilePath(id));
    return true;
  } catch {
    return false;
  }
}

export async function getGamePack(packId: string): Promise<{
  pack: GamePackMeta;
  cards: CardDefinition[];
} | null> {
  const dir = gamePackDir(packId);
  try {
    const pack = await readJson<GamePackMeta>(path.join(dir, "pack.json"));
    const cards = await readJson<CardDefinition[]>(path.join(dir, "cards.json"));
    return { pack, cards };
  } catch {
    return null;
  }
}

export function getDataPaths() {
  return { DATA_DIR, DECKS_DIR, GAMEPACKS_DIR };
}
