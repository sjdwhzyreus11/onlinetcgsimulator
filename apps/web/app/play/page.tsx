import Link from "next/link";

export default function PlayPage() {
  return (
    <main className="min-h-screen pt-24 pb-12 px-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <Link className="text-sky-600 hover:underline" href="/">
          返回主页
        </Link>
      </div>

      <h1 className="text-3xl font-bold tracking-tight text-on-surface mb-2">联机对战</h1>
      <p className="text-on-surface-variant mb-8">
        创建房间后复制链接发给对手即可开始。
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <form
          className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
          action="/api/rooms"
          method="post"
        >
          <h2 className="text-lg font-semibold mb-4">创建房间</h2>
          <label className="block text-sm text-on-surface-variant mb-2">你的昵称</label>
          <input
            name="displayName"
            className="w-full rounded-lg border-slate-200 focus:border-primary focus:ring-primary"
            placeholder="Guest"
          />
          <button
            className="mt-4 w-full py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all active:scale-[0.98]"
            type="submit"
          >
            创建并进入
          </button>
          <p className="mt-3 text-xs text-on-surface-variant">
            进入房间后在对战席选择牌组并准备就绪，双方就绪后房主可开始游戏。
          </p>
        </form>

        <form
          className="bg-white border border-slate-100 rounded-xl p-6 shadow-[0_4px_20px_rgba(0,0,0,0.04)]"
          action="/api/join"
          method="post"
        >
          <h2 className="text-lg font-semibold mb-4">加入房间</h2>
          <label className="block text-sm text-on-surface-variant mb-2">房间 ID</label>
          <input
            name="roomId"
            className="w-full rounded-lg border-slate-200 focus:border-primary focus:ring-primary"
            placeholder="例如：b7c0..."
          />
          <label className="block text-sm text-on-surface-variant mt-4 mb-2">你的昵称</label>
          <input
            name="displayName"
            className="w-full rounded-lg border-slate-200 focus:border-primary focus:ring-primary"
            placeholder="Guest"
          />
          <button
            className="mt-4 w-full py-2 bg-primary text-on-primary rounded-lg hover:opacity-90 transition-all active:scale-[0.98]"
            type="submit"
          >
            加入并进入
          </button>
        </form>
      </div>
    </main>
  );
}

