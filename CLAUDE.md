@AGENTS.md

# Finance Manager — CLAUDE.md

Gestão financeira compartilhada, configurável para qualquer composição de convivência (pessoa morando sozinha, casal, família ou república dividindo a casa). Substitui planilha Numbers. Ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md) e [docs/REQUISITOS.md](docs/REQUISITOS.md).

## Stack

| Camada     | Tecnologia                             |
| ---------- | -------------------------------------- |
| Framework  | Next.js 16 (App Router, TypeScript)    |
| Estilo     | Tailwind CSS v4                        |
| ORM        | Prisma 7 + PostgreSQL (Neon/Supabase)  |
| Authn      | Auth.js (NextAuth)                     |
| Validação  | Zod                                    |
| Testes     | Vitest + Testing Library               |
| Lint/fmt   | ESLint (eslint-config-next) + Prettier |
| Hospedagem | Vercel + Neon/Supabase                 |

## Variáveis de ambiente

Copie `.env` para `.env.local` e preencha:

```
DATABASE_URL="postgresql://..."   # Neon/Supabase connection string
AUTH_SECRET="..."                 # gerado com: openssl rand -base64 32
```

Nunca commitar `.env.local` (já no .gitignore).

## Rodando localmente

```bash
npm install
cp .env .env.local   # edite DATABASE_URL e AUTH_SECRET
npx prisma migrate dev
npm run dev          # http://localhost:3000
```

Health check disponível em `GET /api/health` → `{ "status": "ok" }`.

## Estrutura de pastas

```
src/
  app/                   # Next.js App Router (páginas e route handlers)
    api/health/          # GET /api/health — smoke test
    layout.tsx
    page.tsx
  lib/
    domain/              # Lógica de negócio pura (sem React, sem Next)
      lancamentos.ts     # (a criar)
      split.ts           # (a criar)
      orcamento.ts       # (a criar)
      rendimento.ts      # (a criar)
      ...
prisma/
  schema.prisma          # Modelo de dados (Household, User, etc.)
docs/
  ARQUITETURA.md
  REQUISITOS.md
  planilha-origem/       # Export HTML da planilha original (referência)
```

## Scripts

| Comando                  | O que faz                             |
| ------------------------ | ------------------------------------- |
| `npm run dev`            | Dev server em http://localhost:3000   |
| `npm run build`          | Build de produção                     |
| `npm run lint`           | ESLint em todo o projeto              |
| `npm run format`         | Prettier (reescreve arquivos)         |
| `npm run format:check`   | Prettier (só valida, não reescreve)   |
| `npm test`               | Vitest (one-shot, CI)                 |
| `npm run test:watch`     | Vitest em modo watch                  |
| `npx prisma migrate dev` | Aplica migrations ao banco dev        |
| `npx prisma studio`      | GUI do banco em http://localhost:5555 |

## Padrões de código

### Geral

- TypeScript strict (`strict: true` no tsconfig).
- Nenhuma lógica de negócio em componentes React — fica em `src/lib/domain/`.
- Toda query Prisma obrigatoriamente filtra por `householdId` do usuário autenticado.
- Valores monetários em **centavos** (integer) no banco — sem `float` para dinheiro.
- Datas em UTC no banco; conversão para fuso só na UI.

### Nomenclatura

- Arquivos de componente: `PascalCase.tsx`.
- Arquivos de módulo/util: `camelCase.ts`.
- Variáveis/funções: `camelCase`; tipos/interfaces: `PascalCase`.
- Rotas API: `src/app/api/<recurso>/route.ts`.

### Testes

- Testes de domínio ficam ao lado do módulo: `src/lib/domain/split.test.ts`.
- Testes de API ficam ao lado da rota: `src/app/api/health/route.test.ts`.
- Não mockar o banco em testes de integração — usar banco de teste real com transaction rollback.
- Rodar `npm test` antes de qualquer PR.

### Commits

- Mensagens em português.
- Formato: `<tipo>: <descrição curta>` (ex.: `feat: adiciona CRUD de categorias`).
- Tipos: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.

### PR / Review

- PR pequeno por funcionalidade — sem bundlar features não relacionadas.
- Lint, format e testes devem passar no CI antes do merge.
