import { NextResponse } from "next/server";
import { getGamePack } from "@/lib/deckStorage";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ packId: string }> };

export async function GET(_req: Request, context: RouteContext) {
  const { packId } = await context.params;
  const data = await getGamePack(packId);
  if (!data) {
    return NextResponse.json({ error: "Game pack not found" }, { status: 404 });
  }
  return NextResponse.json(data);
}
