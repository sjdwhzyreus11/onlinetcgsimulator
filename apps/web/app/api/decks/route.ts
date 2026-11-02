import { NextResponse } from "next/server";
import { createDeck, listDecks } from "@/lib/deckStorage";

export const dynamic = "force-dynamic";

export async function GET() {
  const decks = await listDecks();
  return NextResponse.json({ decks });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const deck = await createDeck({
      name: typeof body.name === "string" ? body.name.slice(0, 64) : undefined,
      gamePackId: typeof body.gamePackId === "string" ? body.gamePackId : undefined
    });
    return NextResponse.json({ deck }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create deck" },
      { status: 500 }
    );
  }
}
