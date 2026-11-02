"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import type { DeckListItem } from "@sim/shared";

export default function DecksListClient(props: { initialDecks: DeckListItem[] }) {
  const router = useRouter();
  const [decks, setDecks] = useState(props.initialDecks);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function createDeck() {
    setCreating(true);
    try {
      const res = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "新牌组" })
      });
      if (!res.ok) throw new Error("创建失败");
      const data = await res.json();
      router.push(`/decks/${data.deck.id}`);
    } catch {
      setCreating(false);
    }
  }

  async function deleteDeck(id: string) {
    if (!confirm("确定删除这个牌组吗？")) return;
    setDeletingId(id);
    try {
      const res = await fetch(`/api/decks/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("删除失败");
      setDecks((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-on-surface-variant">
          管理你的牌组：主牌堆 40+、符文 12、传奇与英雄。卡牌库来自官方图鉴。
        </p>
        <button
          type="button"
          disabled={creating}
          className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm hover:opacity-90 disabled:opacity-50"
          onClick={createDeck}
        >
          {creating ? "创建中..." : "新建牌组"}
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-xl p-8 shadow-[0_4px_20px_rgba(0,0,0,0.04)] text-center">
          <p className="text-on-surface-variant mb-4">还没有牌组，创建你的第一副牌组吧。</p>
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm"
            onClick={createDeck}
          >
            新建牌组
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {decks.map((deck) => (
            <div
              key={deck.id}
              className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
            >
              <h2 className="text-lg font-semibold text-on-surface mb-1">{deck.name}</h2>
              <p className="text-xs text-on-surface-variant uppercase mb-3 tracking-tighter">
                主牌 {deck.mainCount} · 符文 {deck.runeCount} · 战场 {deck.battlefieldCount}
              </p>
              <p className="text-xs text-on-surface-variant mb-4">
                更新于 {new Date(deck.updatedAt).toLocaleString("zh-CN")}
              </p>
              <div className="flex gap-2">
                <Link
                  href={`/decks/${deck.id}`}
                  className="flex-1 text-center py-2 bg-primary-container/10 text-on-primary-container border border-primary-container/20 rounded-lg text-sm hover:bg-primary-container hover:text-white transition-all"
                >
                  编辑
                </Link>
                <button
                  type="button"
                  disabled={deletingId === deck.id}
                  className="px-4 py-2 rounded-lg border border-red-200 text-red-700 text-sm hover:bg-red-50 disabled:opacity-50"
                  onClick={() => deleteDeck(deck.id)}
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
