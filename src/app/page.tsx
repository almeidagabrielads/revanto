export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 p-8">
      <h1 className="text-2xl font-semibold">Sistema de Controle Financeiro</h1>
      <p className="text-zinc-600 dark:text-zinc-400">
        Scaffold inicial — sem funcionalidades de negócio ainda.
      </p>
      <p className="text-sm text-zinc-500">
        Health check: <code>/api/health</code>
      </p>
    </main>
  );
}
