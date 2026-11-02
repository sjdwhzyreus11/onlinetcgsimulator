/**
 * Import card catalog from playloltcg official API.
 *
 * Data source: https://playloltcg.com/card.html
 * API: https://lol-api.playloltcg.com/xcx/card/searchCardCraftWeb
 *
 * Card images are stored as CDN URLs only (not downloaded locally).
 * Run: npm run import:cards
 */
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { mapPlayloltcgCard, type CardDefinition, type PlayloltcgCardRecord } from "../packages/shared/dist/deck.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const OUTPUT_DIR = path.join(REPO_ROOT, "data", "gamepacks", "riftbound");
const CARDS_PATH = path.join(OUTPUT_DIR, "cards.json");
const META_PATH = path.join(OUTPUT_DIR, "import-meta.json");

const API_BASE = "https://lol-api.playloltcg.com";
const PAGE_SIZE = 100;
const PAGE_DELAY_MS = 200;
const MAX_RETRIES = 3;

type SearchResponse = {
  code: number;
  result?: {
    total: number;
    list: PlayloltcgCardRecord[];
  };
};

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function fetchPage(pageNum: number): Promise<PlayloltcgCardRecord[]> {
  const body = {
    pageNum,
    pageSize: PAGE_SIZE,
    searchContent: "",
    cardCategoryList: [],
    cardColorList: [],
    rarityList: [],
    productCodeList: []
  };

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(`${API_BASE}/xcx/card/searchCardCraftWeb`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as SearchResponse;
      if (data.code !== 0 || !data.result) throw new Error(`API code ${data.code}`);
      return data.result.list ?? [];
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.warn(`Page ${pageNum} attempt ${attempt} failed, retrying...`, err);
      await sleep(500 * attempt);
    }
  }
  return [];
}

async function fetchAllCards(): Promise<PlayloltcgCardRecord[]> {
  const all: PlayloltcgCardRecord[] = [];
  let pageNum = 1;

  while (true) {
    console.log(`Fetching page ${pageNum}...`);
    const list = await fetchPage(pageNum);
    if (list.length === 0) break;
    all.push(...list);
    if (list.length < PAGE_SIZE) break;
    pageNum++;
    await sleep(PAGE_DELAY_MS);
  }

  return all;
}

function countByType(cards: CardDefinition[]) {
  const counts: Record<string, number> = {};
  for (const c of cards) {
    counts[c.type] = (counts[c.type] ?? 0) + 1;
  }
  return counts;
}

async function main() {
  const rawCards = await fetchAllCards();
  console.log(`Fetched ${rawCards.length} cards`);

  const cards = rawCards.map(mapPlayloltcgCard);
  cards.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(CARDS_PATH, `${JSON.stringify(cards, null, 2)}\n`, "utf8");

  const meta = {
    importedAt: new Date().toISOString(),
    source: "https://playloltcg.com/card.html",
    apiBase: API_BASE,
    total: cards.length,
    byType: countByType(cards)
  };
  await fs.writeFile(META_PATH, `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  console.log("Import complete:");
  console.log(`  cards.json: ${cards.length} cards`);
  console.log("  by type:", meta.byType);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
