type ModuleShellProps = {
  title: string;
  description: string;
};

export function ModuleShell({ title, description }: ModuleShellProps) {
  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-panel">
      <p className="text-sm font-semibold uppercase tracking-[0.24em] text-brand-700">Migracion en progreso</p>
      <h2 className="mt-4 text-3xl font-semibold text-slate-950">{title}</h2>
      <p className="mt-4 max-w-2xl text-slate-600">{description}</p>
    </section>
  );
}
