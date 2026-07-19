import Link from "next/link";
import { LoginClient } from "./LoginClient";

export default function LoginPage() {
  return (
    <main className="flex flex-1">
      <section className="bg-primary p-xl text-on-primary hidden flex-1 flex-col justify-between lg:flex">
        <div className="gap-sm flex items-center">
          <svg
            className="h-6 w-6 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
          <div>
            <h1 className="text-5xl leading-tight font-bold">Revanto</h1>
          </div>
        </div>
        <p className="text-on-primary/90 max-w-[28rem] text-base leading-relaxed">
          &ldquo;Onde o planejamento encontra a parceria. Transformamos a gestão
          financeira em um diálogo leve e transparente para quem divide a
          casa.&rdquo;
        </p>
      </section>

      <section className="bg-surface p-md lg:p-xl flex flex-1 items-center justify-center">
        <div className="space-y-lg w-full max-w-[28rem]">
          <div className="flex flex-col items-center gap-1 lg:hidden">
            <h1 className="text-primary text-4xl font-bold">Revanto</h1>
          </div>
          <header className="space-y-xs">
            <h2 className="text-on-surface text-4xl font-bold">
              Bem-vindos de volta
            </h2>
            <p className="text-on-surface-variant text-sm">
              Acesse sua gestão compartilhada
            </p>
          </header>
          <LoginClient />
          <p className="text-on-surface-variant text-center text-sm">
            Ainda não têm uma conta?{" "}
            <Link href="/cadastro" className="text-primary font-semibold">
              Comecem agora
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
