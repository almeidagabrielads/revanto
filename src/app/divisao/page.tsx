import { DivisaoClient } from "./DivisaoClient";

export default function DivisaoPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-lg p-lg">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Divisão</h1>
        <p className="text-sm text-on-surface-variant">
          Veja quem pagou o que e o que falta acertar entre os membros.
        </p>
      </div>
      <DivisaoClient />
    </main>
  );
}
