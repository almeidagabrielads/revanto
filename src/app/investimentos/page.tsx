import { InvestimentosClient } from "./InvestimentosClient";

export default function InvestimentosPage() {
  return (
    <main className="gap-lg p-lg mx-auto flex w-full max-w-6xl flex-col">
      <h1 className="text-on-surface text-4xl font-bold">Investimentos</h1>
      <InvestimentosClient />
    </main>
  );
}
