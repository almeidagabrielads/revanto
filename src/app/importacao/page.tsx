import { ImportacaoClient } from "./ImportacaoClient";

export default function ImportacaoPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Importar extrato/fatura</h1>
      <ImportacaoClient />
    </main>
  );
}
