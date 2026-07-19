import { ImportacaoClient } from "./ImportacaoClient";

export default function ImportacaoPage() {
  return (
    <main className="gap-lg p-lg mx-auto flex w-full max-w-5xl flex-col">
      <h1 className="text-on-surface text-4xl font-bold">
        Importar extrato/fatura
      </h1>
      <ImportacaoClient />
    </main>
  );
}
