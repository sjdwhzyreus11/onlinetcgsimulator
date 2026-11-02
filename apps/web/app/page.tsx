import Link from "next/link";

export default function HomePage() {
  return (
    <>
      <nav className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-8 h-16 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-100 dark:border-slate-800 shadow-[0_4px_20px_rgba(0,0,0,0.04)] tracking-tight">
        <div className="flex items-center gap-8">
          <span className="text-lg font-semibold tracking-tighter text-slate-900 dark:text-slate-50">
            TCG Sim
          </span>
          <div className="hidden md:flex items-center gap-6">
            <Link
              className="text-sky-500 dark:text-sky-400 font-medium border-b-2 border-sky-500 pb-1 transition-all duration-200 ease-in-out active:scale-[0.98]"
              href="/"
            >
              Games
            </Link>
            <Link
              className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all hover:bg-slate-50/50 dark:hover:bg-slate-900/50 rounded-md px-2 py-1"
              href="/decks"
            >
              Decks
            </Link>
            <a className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all hover:bg-slate-50/50 dark:hover:bg-slate-900/50 rounded-md px-2 py-1">
              Market
            </a>
            <a className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-all hover:bg-slate-50/50 dark:hover:bg-slate-900/50 rounded-md px-2 py-1">
              Profile
            </a>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <button className="p-2 text-slate-500 hover:bg-slate-50/50 rounded-md transition-all">
            <span className="material-symbols-outlined">notifications</span>
          </button>
          <button className="p-2 text-slate-500 hover:bg-slate-50/50 rounded-md transition-all">
            <span className="material-symbols-outlined">settings</span>
          </button>
        </div>
      </nav>

      <main className="pt-24 pb-12">
        <section className="max-w-7xl mx-auto px-8 mb-section-margin">
          <div className="relative overflow-hidden bg-white rounded-xl p-12 shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-slate-100">
            <div className="relative z-10 max-w-2xl">
              <h1 className="text-display-lg text-on-surface mb-4 font-bold tracking-tight">
                符文战场在线模拟器。
                <br />
                <span className="text-primary-container">双人联机，手动模拟。</span>
              </h1>
              <Link
                className="px-8 py-4 bg-primary text-on-primary rounded-lg text-body-base hover:opacity-90 transition-all active:scale-95 inline-flex items-center"
                href="/play"
              >
                开始对战
              </Link>
            </div>
            <div className="absolute top-0 right-0 w-1/2 h-full hidden lg:block opacity-10">
              <img
                className="w-full h-full object-cover"
                alt="abstract modernist shapes"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuBdVHnVsolJqNRAcCvJn7bwba9frUViM8xkPEoZFU_XNL2M3FMIVJ07MTAlYS2MSXORaT51wIDZM4J5GDjkAeYkmpBYzpVbS1h_ab17g_gcBSoyMXJfA9Jy_giT-KRKu7geeh1kUQbRDwlG0eLDtcok5ZQ-VcspckiW401oIhnMNLIYmsR93CsD7USQlg3FUV6w8kgptMDZxhITv1-47zp5G-hRelte4NJwqBlANe6Nqk0fExT5T22OEe2vc4xhIal2XIPr16tU_g"
              />
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 mt-24">
        <div className="w-full py-12 px-8 flex flex-col md:flex-row justify-between items-center max-w-7xl mx-auto text-xs uppercase tracking-widest text-slate-400">
          <div className="mb-6 md:mb-0">© 2026 Riftbound Simulator</div>
          <div className="flex items-center gap-8">
            <a className="hover:text-sky-500 transition-colors hover:underline">Privacy</a>
            <a className="hover:text-sky-500 transition-colors hover:underline">Terms</a>
            <a className="hover:text-sky-500 transition-colors hover:underline">Support</a>
          </div>
        </div>
      </footer>
    </>
  );
}

