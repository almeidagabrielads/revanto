import Link from "next/link";
import { DashboardClient } from "./DashboardClient";

export default function Home() {
  return (
    <main className="flex w-full flex-col">
      <div className="gap-lg p-lg mx-auto flex w-full max-w-6xl flex-col">
        <DashboardClient />
      </div>

      <Link
        href="/lancamentos"
        aria-label="Nova transação"
        className="bottom-lg right-lg bg-primary text-on-primary fixed flex h-14 w-14 items-center justify-center rounded-full text-2xl font-bold shadow-lg hover:opacity-90 sm:hidden"
      >
        +
      </Link>
    </main>
  );
}
