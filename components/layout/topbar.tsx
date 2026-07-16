import Link from "next/link";

type TopbarProps = {
  usuario: string;
  rol: string;
};

export function Topbar({ usuario, rol }: TopbarProps) {
  return (
    <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-700">Dashboard CM&amp;M</p>
          <h1 className="text-lg font-semibold text-slate-950">Base de migracion Next.js</h1>
        </div>
        <nav className="flex items-center gap-3 text-sm text-slate-600">
          <Link href="/arl" className="rounded-full px-3 py-2 transition hover:bg-slate-100 hover:text-slate-950">
            ARL
          </Link>
          <Link href="/cartera" className="rounded-full px-3 py-2 transition hover:bg-slate-100 hover:text-slate-950">
            Cartera
          </Link>
          <Link href="/seguros" className="rounded-full px-3 py-2 transition hover:bg-slate-100 hover:text-slate-950">
            Seguros
          </Link>
          <div className="rounded-full bg-slate-100 px-4 py-2 text-slate-700">
            {usuario} · {rol}
          </div>
        </nav>
      </div>
    </header>
  );
}
