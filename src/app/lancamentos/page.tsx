import { LancamentosClient } from "./LancamentosClient";

export default function LancamentosPage() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-lg p-lg">
      <LancamentosClient />
    </main>
  );
}
