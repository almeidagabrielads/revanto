import { DivisaoClient } from "./DivisaoClient";

export default function DivisaoPage() {
  return (
    <main className="gap-lg p-lg mx-auto flex w-full max-w-6xl flex-col">
      <div>
        <h1 className="text-on-surface text-4xl font-bold">Divisão</h1>
        <p className="text-on-surface-variant text-sm">
          Veja quem pagou o que e o que falta acertar entre os membros.
        </p>
      </div>
      <DivisaoClient />
    </main>
  );
}
