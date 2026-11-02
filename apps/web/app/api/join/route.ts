import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const form = await req.formData();
  const roomId = String(form.get("roomId") ?? "").trim();
  const displayName = String(form.get("displayName") ?? "").trim().slice(0, 24) || "Guest";
  if (!roomId) return NextResponse.redirect(new URL("/play", req.url), { status: 303 });
  const url = new URL(`/room/${encodeURIComponent(roomId)}`, req.url);
  url.searchParams.set("displayName", displayName);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set("displayName", displayName, { path: "/", sameSite: "lax" });
  return res;
}

