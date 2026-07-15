import Link from "next/link";

const PASSOS = [
  {
    href: "/pessoas",
    titulo: "Configurar pessoas",
    descricao:
      "Adicione as pessoas da sua casa e definam quem cuida do quê no dia a dia — seja um casal, uma família ou uma república.",
  },
  {
    href: "/bancos",
    titulo: "Conectar contas",
    descricao:
      "Cadastre bancos e cartões para ter uma visão automática e clara do saldo do grupo.",
  },
  {
    href: "/categorias",
    titulo: "Definir categorias",
    descricao:
      "Personalize as categorias de gastos e o percentual sugerido do orçamento.",
  },
];

export default function OnboardingPage() {
  return (
    <main className="gap-xl p-lg mx-auto flex w-full max-w-2xl flex-col">
      <div className="flex flex-col gap-1">
        <h1 className="text-on-surface text-2xl font-bold">
          Bem-vindos ao REVANTO! Vamos começar?
        </h1>
        <p className="text-on-surface-variant text-sm">
          Estamos aqui para ajudar a construir uma harmonia financeira
          duradoura, do jeito que a sua casa funciona. Siga os passos abaixo
          para configurar seu espaço compartilhado.
        </p>
      </div>

      <div className="gap-md flex flex-col">
        {PASSOS.map((passo, i) => (
          <Link
            key={passo.href}
            href={passo.href}
            className="gap-md border-outline-variant bg-surface-container-lowest p-lg hover:border-primary flex items-center rounded-xl border transition-colors"
          >
            <span className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold">
              {i + 1}
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-on-surface text-base font-semibold">
                {passo.titulo}
              </span>
              <span className="text-on-surface-variant text-sm">
                {passo.descricao}
              </span>
            </span>
          </Link>
        ))}
      </div>

      <div className="gap-md flex items-center">
        <Link
          href="/pessoas"
          className="bg-primary px-md text-on-primary rounded-full py-1.5 text-xs font-semibold hover:opacity-90"
        >
          Começar configuração
        </Link>
        <Link
          href="/importacao"
          className="text-primary text-xs font-semibold hover:underline"
        >
          Importar dados de outro app
        </Link>
      </div>
    </main>
  );
}
