import { cookies } from "next/headers";
import Link from "next/link";
import RoomClient from "@/components/room/RoomClient";
import { CardCatalogProvider } from "@/components/room/cardCatalog";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ displayName?: string }>;
};

export default async function RoomPage({ params, searchParams }: PageProps) {
  const { roomId } = await params;
  const query = await searchParams;
  const cookieStore = await cookies();

  const displayName =
    query.displayName?.trim().slice(0, 24) ||
    cookieStore.get("displayName")?.value?.trim().slice(0, 24) ||
    "Guest";

  return (
    <main className="min-h-screen bg-background">
      <div className="absolute top-4 left-4 z-50">
        <Link className="text-sky-600 hover:underline text-sm" href="/play">
          返回 / 退出
        </Link>
      </div>
      <CardCatalogProvider>
        <RoomClient roomId={roomId} displayName={displayName} />
      </CardCatalogProvider>
    </main>
  );
}
