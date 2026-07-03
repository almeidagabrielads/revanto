# Arquitetura — Sistema de Controle Financeiro

Decisão de stack e desenho de alto nível para substituir a planilha descrita em
[REQUISITOS.md](REQUISITOS.md).

## 1. Stack escolhida

| Camada         | Escolha                                                 |
| -------------- | ------------------------------------------------------- |
| Frontend       | Next.js (React, App Router) + Tailwind CSS              |
| Backend        | Next.js Server Actions / Route Handlers (mesmo projeto) |
| ORM            | Prisma                                                  |
| Banco de dados | PostgreSQL gerenciado (Neon ou Supabase, free tier)     |
| Autenticação   | Auth.js (NextAuth) — credenciais ou magic link          |
| Hospedagem     | Vercel (frontend + backend) + Neon/Supabase (banco)     |

### Por que essa stack

- **Uma linguagem só (TypeScript)** do banco à UI — reduz o custo de manutenção solo (Gabi).
- **CRUDs dominam os requisitos** (RF01-RF10, RF12-RF13): Prisma + Server Actions tornam isso
  repetitivo e simples de escrever/testar.
- **Cálculos (RF11 split, RF14 rendimento vs. CDI)** são aritmética financeira (juros compostos,
  proporções, séries temporais) — não exigem bibliotecas científicas (NumPy/Pandas), então não há
  ganho em separar um backend Python.
- **Hospedagem gratuita/quase grátis** para o uso de 2 pessoas (Vercel + Neon/Supabase free tier),
  sem servidor para operar.
- **Caminho de crescimento para produto**: Next.js + Postgres + Prisma + Auth.js é a stack mais
  comum hoje para SaaS multi-tenant em TS — migrar de "app para 2 pessoas" para "produto
  multiusuário" é extensão do mesmo projeto, não reescrita.

## 2. Multi-tenancy desde o início

Mesmo com escopo inicial de uma única "casa" (Isa + Gabi), o modelo de dados é desenhado em torno
de **Household** (agregado casal/família) como unidade de isolamento, em vez de assumir 2 usuários
fixos no código. Isso evita migração de dados/schema caso o produto seja aberto para outros casais
no futuro.

- `Household`: representa o "tenant" (ex.: "Isa & Gabi").
- `User`: pessoa com login, pertence a um `Household`.
- Todas as entidades de domínio (Pessoa, Lançamento, Orçamento, Investimento, etc.) carregam
  `householdId` e são sempre filtradas por ele nas queries — nenhuma query global sem esse filtro.
- No MVP, autorização é feita na camada de aplicação (toda query do Prisma passa por
  `householdId` do usuário autenticado). Não há RLS no banco neste momento; pode ser adicionado
  depois sem mudar o modelo lógico.

## 3. Camadas

```
┌─────────────────────────────────────────────┐
│  UI (Next.js App Router, React + Tailwind)   │  páginas, formulários, dashboards, responsivo
├─────────────────────────────────────────────┤
│  Server Actions / Route Handlers             │  validação de entrada (zod), orquestração
├─────────────────────────────────────────────┤
│  Domain / Services (lib/)                    │  regras de negócio: split, orçamento, rendimento
├─────────────────────────────────────────────┤
│  Prisma (ORM)                                │  acesso a dados, sempre escopado por householdId
├─────────────────────────────────────────────┤
│  PostgreSQL (Neon/Supabase)                  │  persistência
└─────────────────────────────────────────────┘
        Auth.js (sessão/JWT) atravessa todas as camadas acima da UI
```

Regra de organização: nenhuma lógica de cálculo financeiro vive em componentes React ou em Server
Actions diretamente — fica em `lib/domain/*`, testável isoladamente e reutilizável entre telas.

## 4. Mapeamento dos módulos de REQUISITOS.md para a arquitetura

| Requisitos                                                    | Módulo                   | Onde vive                                                                                                                                 |
| ------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| RF01-RF03 (Cadastros: Categoria, Subcategoria, Banco, Pessoa) | Cadastros                | CRUD simples via Prisma, telas de admin                                                                                                   |
| RF04-RF05 (Lançamentos, estornos)                             | Lançamentos              | Server Actions + `lib/domain/lancamentos.ts`                                                                                              |
| RF06 (Importação CSV/OFX + sugestão de categoria)             | Importação               | Route Handler de upload + `lib/domain/import/` (parser + matcher por histórico)                                                           |
| RF07 (Receitas)                                               | Lançamentos (receita)    | Mesma tabela de lançamento, `tipo = receita`, ou tabela própria `Receita`                                                                 |
| RF08-RF09 (Orçamento planejado x real)                        | Orçamento                | `lib/domain/orcamento.ts` — agregações planejado vs. real                                                                                 |
| RF10 (Relatórios por categoria/subcategoria)                  | Relatórios               | Queries agregadas (Prisma `groupBy`) + `lib/domain/relatorios.ts`                                                                         |
| RF11 (Split de despesas do casal)                             | Divisão de despesas      | `lib/domain/split.ts` — calcula saldo a acertar entre Pessoas de um Household                                                             |
| RF12-RF13 (Investimentos, histórico de patrimônio)            | Investimentos/Patrimônio | CRUD + `lib/domain/patrimonio.ts` para série histórica                                                                                    |
| RF14 (Rendimento real vs. esperado vs. CDI, projeção)         | Investimentos            | `lib/domain/rendimento.ts` (cálculo puro) + `lib/domain/cdi.ts` (busca e cacheia o CDI mensal via API do BCB, série SGS 4391) |
| RF15 (Liquidez consolidada)                                   | Investimentos            | Query agregada por prazo de resgate sobre `Investimento`                                                                                  |
| Multiusuário/Household, auditoria (NFR)                       | Transversal              | Auth.js (sessão), `householdId` em todas as entidades, campos `createdBy`/`updatedBy`/timestamps em Lançamento                            |

## 5. Modelo de dados (alto nível)

Entidades principais (detalhamento de campos em REQUISITOS.md §2), todas com `householdId` exceto
`Household` e `User`:

```
Household 1───* User
Household 1───* Pessoa
Household 1───* Categoria 1───* Subcategoria
Household 1───* Banco
Household 1───* Lancamento (categoria, subcategoria, banco, pessoaDivisao, pessoaPagou)
Household 1───* Receita (pessoa, subtipoFonte)
Household 1───* OrcamentoPlanejado (pessoa/grupo, categoria, subcategoria, mes/ano)
Household 1───* Investimento (banco, pessoa/titular)
Household 1───* PosicaoPatrimonio (banco, mes)
```

## 6. Pontos em aberto (carregados de REQUISITOS.md §5)

- RF06: bancos/formatos prioritários de importação a definir antes de implementar o parser.
- Multi-moeda: não coberto no MVP; se necessário, adicionar campo `moeda` + tabela de câmbio em
  `Lancamento`.
