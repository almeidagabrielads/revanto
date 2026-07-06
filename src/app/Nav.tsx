"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { corPessoa } from "./components/PessoaBadge";
import { unicosPorId } from "@/lib/dedupe";

type Usuario = { id: string; email: string; nome: string };
type Pessoa = { id: string; nome: string; tipo: string };

const LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/lancamentos", label: "Lançamentos" },
  { href: "/receitas", label: "Receitas" },
  { href: "/investimentos", label: "Investimentos" },
  { href: "/divisao", label: "Divisão" },
  { href: "/relatorios", label: "Relatórios" },
  { href: "/importacao", label: "Importar" },
];

const MAX_AVATARES = 4;

export function Nav() {
  const router = useRouter();
  const pathname = usePathname();
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);

  useEffect(() => {
    let cancelado = false;
    fetch("/api/auth/me")
      .then(async (response) => {
        if (cancelado) return;
        setUsuario(response.ok ? await response.json() : null);
      })
      .catch(() => {
        if (!cancelado) setUsuario(null);
      });
    return () => {
      cancelado = true;
    };
  }, [router]);

  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    fetch("/api/pessoas")
      .then(async (response) => {
        if (cancelado || !response.ok) return;
        const dados: Pessoa[] = await response.json();
        setPessoas(unicosPorId(dados).filter((p) => p.tipo === "INDIVIDUAL"));
      })
      .catch(() => { });
    return () => {
      cancelado = true;
    };
  }, [usuario]);

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUsuario(null);
    router.push("/");
    router.refresh();
  }

  if (pathname === "/login" || pathname === "/cadastro") {
    return null;
  }

  return (
    <header className="border-outline-variant bg-surface sticky top-0 z-50 w-full border-b shadow-sm">
      <div className="px-lg mx-auto flex h-16 max-w-[1400px] items-center justify-between">
        <div className="gap-xl flex items-center">
          <Link href="/" className="flex items-baseline gap-1.5">
            <span className="text-primary text-lg font-bold">FINANCO</span>
          </Link>
          <nav className="gap-xs hidden items-center md:flex">
            {LINKS.map((link) => {
              const ativo =
                link.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={
                    ativo
                      ? "bg-primary/10 px-md text-primary rounded-full py-1.5 text-xs font-bold"
                      : "px-md text-on-surface-variant hover:text-primary rounded-full py-1.5 text-xs font-medium transition-colors"
                  }
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="gap-md flex items-center text-sm">
          {usuario === undefined ? null : usuario ? (
            <>
              <Link
                href="/lancamentos"
                className="bg-primary px-md text-on-primary hidden items-center gap-1.5 rounded-full py-1.5 text-xs font-semibold hover:opacity-90 sm:flex"
              >
                <span className="text-base leading-none">+</span> Transação
              </Link>
              <Link
                href="/configuracoes"
                aria-label="Configurações"
                className="text-on-surface-variant hover:bg-surface-container hover:text-primary rounded-full p-1.5 transition-colors"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
              </Link>
              <div className="flex items-center -space-x-2">
                {pessoas.slice(0, MAX_AVATARES).map((p) => (
                  <span
                    key={p.id}
                    title={p.nome}
                    className={`border-surface flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${corPessoa(p.id)}`}
                  >
                    {p.nome.charAt(0).toUpperCase()}
                  </span>
                ))}
                {pessoas.length > MAX_AVATARES && (
                  <span
                    title={`+${pessoas.length - MAX_AVATARES}`}
                    className="border-surface bg-surface-container text-on-surface-variant flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold"
                  >
                    +{pessoas.length - MAX_AVATARES}
                  </span>
                )}
              </div>
              <button
                onClick={sair}
                title="Sair"
                aria-label="Sair"
                className="text-on-surface-variant hover:bg-surface-container hover:text-danger rounded-full p-1.5 transition-colors"
              >
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <path d="M16 17l5-5-5-5" />
                  <path d="M21 12H9" />
                </svg>
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90"
            >
              Entrar
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
