"use client";

import { useState } from "react";

async function parseErro(response: Response): Promise<string> {
  const body = await response.json().catch(() => null);
  if (typeof body?.error === "string") return body.error;
  return "Não foi possível criar a conta.";
}

export function CadastroClient() {
  const [household, setHousehold] = useState("");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function cadastrar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    const response = await fetch("/api/auth/cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ household, nome, email, password: senha }),
    });
    setEnviando(false);
    if (!response.ok) {
      setErro(await parseErro(response));
      return;
    }
    window.location.href = "/onboarding";
  }

  const inputClass =
    "w-full rounded-xl border border-outline-variant bg-surface-container-lowest px-md py-md text-sm focus:border-primary focus:outline-none";

  return (
    <form onSubmit={cadastrar} className="gap-md flex flex-col">
      {erro && (
        <p className="border-danger/30 bg-danger-container p-sm text-on-danger-container rounded-lg border text-sm">
          {erro}
        </p>
      )}

      <div className="gap-xs flex flex-col">
        <label
          className="text-on-surface-variant text-xs font-semibold"
          htmlFor="household"
        >
          Nome da casa
        </label>
        <input
          id="household"
          type="text"
          placeholder="Ex.: República da Rua Azul"
          className={inputClass}
          value={household}
          onChange={(e) => setHousehold(e.target.value)}
          required
        />
      </div>

      <div className="gap-xs flex flex-col">
        <label
          className="text-on-surface-variant text-xs font-semibold"
          htmlFor="nome"
        >
          Seu nome
        </label>
        <input
          id="nome"
          type="text"
          className={inputClass}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          required
        />
      </div>

      <div className="gap-xs flex flex-col">
        <label
          className="text-on-surface-variant text-xs font-semibold"
          htmlFor="email"
        >
          E-mail
        </label>
        <input
          id="email"
          type="email"
          className={inputClass}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="gap-xs flex flex-col">
        <label
          className="text-on-surface-variant text-xs font-semibold"
          htmlFor="senha"
        >
          Senha
        </label>
        <input
          id="senha"
          type="password"
          className={inputClass}
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          minLength={8}
          required
        />
      </div>

      <button
        type="submit"
        disabled={enviando}
        className="bg-primary px-md py-md text-on-primary rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {enviando ? "Criando conta…" : "Criar conta"}
      </button>
    </form>
  );
}
