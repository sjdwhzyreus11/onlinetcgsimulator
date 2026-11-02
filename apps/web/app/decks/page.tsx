import Link from "next/link";
import { listDecks } from "@/lib/deckStorage";
import DecksListClient from "@/components/decks/DecksListClient";

export const dynamic = "force-dynamic";

export default async function DecksPage() {
  const decks = await listDecks();

  return (
    <main className="min-h-screen pt-24 pb-12 px-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <Link className="text-sky-600 hover:underline" href="/">
          返回主页
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">牌组</h1>

      <DecksListClient initialDecks={decks} />
    </main>
  );
}
