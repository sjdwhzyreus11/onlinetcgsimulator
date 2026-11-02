import Link from "next/link";
import { notFound } from "next/navigation";
import { getDeck, getGamePack } from "@/lib/deckStorage";
import DeckEditor from "@/components/decks/DeckEditor";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function DeckEditorPage(props: PageProps) {
  const { id } = await props.params;
  const deck = await getDeck(id);
  if (!deck) notFound();

  const gamePack = await getGamePack(deck.gamePackId);
  if (!gamePack) notFound();

  return (
    <main className="min-h-screen pt-20 pb-4 px-4 lg:px-6 max-w-[1600px] mx-auto">
      <DeckEditor initialDeck={deck} pack={gamePack.pack} cards={gamePack.cards} />
    </main>
  );
}
