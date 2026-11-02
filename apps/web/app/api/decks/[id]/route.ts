import { NextResponse } from "next/server";
import { deleteDeck, getDeck, saveDeck } from "@/lib/deckStorage";
import type { SavedDeck } from "@sim/shared";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const deck = await getDeck(id);
  if (!deck) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }
  return NextResponse.json({ deck });
}

export async function PUT(req: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const body = (await req.json()) as SavedDeck;
    if (body.id !== id) {
      return NextResponse.json({ error: "Deck id mismatch" }, { status: 400 });
    }
    const existing = await getDeck(id);
    if (!existing) {
      return NextResponse.json({ error: "Deck not found" }, { status: 404 });
    }
    const deck = await saveDeck({
      ...body,
      createdAt: existing.createdAt
    });
    return NextResponse.json({ deck });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save deck" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  const { id } = await context.params;
  const ok = await deleteDeck(id);
  if (!ok) {
    return NextResponse.json({ error: "Deck not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
