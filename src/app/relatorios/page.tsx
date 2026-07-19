import { RelatoriosClient } from "./RelatoriosClient";

export default function RelatoriosPage() {
  return (
    <main className="gap-lg p-lg mx-auto flex w-full max-w-5xl flex-col">
      <div>
        <h1 className="text-on-surface text-4xl font-bold">
          Relatórios financeiros
        </h1>
        <p className="text-on-surface-variant text-sm">
          Analise o desempenho financeiro do Revanto.
        </p>
      </div>
      <RelatoriosClient />
    </main>
  );
}
