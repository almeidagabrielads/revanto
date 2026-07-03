"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Usuario = { id: string; email: string; nome: string };

export function Nav() {
  const router = useRouter();
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);

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

  async function sair() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUsuario(null);
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="flex items-center justify-between border-b border-zinc-200 px-8 py-3 dark:border-zinc-800">
      <div className="flex gap-4 text-sm font-medium">
        <Link href="/">Início</Link>
        <Link href="/categorias">Categorias</Link>
        <Link href="/bancos">Bancos</Link>
        <Link href="/importacao">Importar</Link>
      </div>
      <div className="text-sm">
        {usuario === undefined ? null : usuario ? (
          <div className="flex items-center gap-3">
            <span className="text-zinc-500">{usuario.nome}</span>
            <button
              onClick={sair}
              className="font-medium text-amber-700 dark:text-amber-500"
            >
              Sair
            </button>
          </div>
        ) : (
          <Link
            href="/login"
            className="font-medium text-blue-700 dark:text-blue-400"
          >
            Entrar
          </Link>
        )}
      </div>
    </nav>
  );
}
