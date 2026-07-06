import { DivisaoClient } from "./DivisaoClient";

export default function DivisaoPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-lg p-lg">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Acerto de Contas</h1>
        <p className="text-sm text-on-surface-variant">
          Veja quem pagou o quê no período e o que falta acertar entre a casa.
        </p>
      </div>
      <DivisaoClient />
    </main>
  );
}
