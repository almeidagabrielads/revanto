"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const ITENS = [
  {
    href: "/pessoas",
    label: "Pessoas & Acesso",
    icon: (
      <>
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </>
    ),
  },
  {
    href: "/configuracoes/preferencias",
    label: "Preferências",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
      </>
    ),
  },
  {
    href: "/bancos",
    label: "Contas & Bancos",
    icon: (
      <>
        <path d="M3 21h18" />
        <path d="M4 21V9l8-6 8 6v12" />
        <path d="M9 21v-6h6v6" />
      </>
    ),
  },
  {
    href: "/categorias",
    label: "Categorias & Orçamento",
    icon: (
      <>
        <rect x="4" y="14" width="4" height="7" />
        <rect x="10" y="9" width="4" height="12" />
        <rect x="16" y="4" width="4" height="17" />
      </>
    ),
  },
  {
    href: "/configuracoes/exportar-dados",
    label: "Exportar & Dados",
    icon: (
      <>
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <path d="M7 10l5 5 5-5" />
        <path d="M12 15V3" />
      </>
    ),
  },
] as const;

export function SettingsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-lg p-lg">
      <div>
        <h1 className="text-2xl font-bold text-on-surface">Configurações do Sistema</h1>
        <p className="text-sm text-on-surface-variant">
          Gerencie o acesso, preferências e estrutura da sua vida financeira
          compartilhada.
        </p>
      </div>

      <div className="flex flex-col gap-lg rounded-xl border border-outline-variant bg-surface-container-lowest sm:flex-row">
        <nav className="flex shrink-0 flex-row gap-1 overflow-x-auto p-md sm:w-64 sm:flex-col sm:overflow-visible sm:border-r sm:border-outline-variant">
          {ITENS.map((item) => {
            const ativo = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  ativo
                    ? "flex items-center gap-2 whitespace-nowrap rounded-lg bg-primary/10 px-md py-2 text-sm font-semibold text-primary"
                    : "flex items-center gap-2 whitespace-nowrap rounded-lg px-md py-2 text-sm text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                }
              >
                <svg
                  className="h-4 w-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  {item.icon}
                </svg>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex-1 p-lg">{children}</div>
      </div>
    </main>
  );
}
