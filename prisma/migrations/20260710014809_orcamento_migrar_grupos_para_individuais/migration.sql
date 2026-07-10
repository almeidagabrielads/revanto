-- Orçamento passa a ser sempre de uma Pessoa INDIVIDUAL. Antes de tornar
-- "pessoaId" obrigatório (próxima migration), migramos os dados existentes:
--
-- 1. Duplicar orçamentos hoje presos a um grupo (Pessoa CASAL/FAMILIA/OUTRO)
--    para cada integrante INDIVIDUAL desse grupo, sem sobrescrever um valor
--    que o integrante já tenha na mesma posição (categoria/subcategoria/mês/
--    ano) — o índice único já é NULLS NOT DISTINCT (ver migration
--    20260702010200_orcamento_nulls_not_distinct), então ON CONFLICT DO
--    NOTHING cobre corretamente também os casos com subcategoriaId/mes nulos.
--    Não há default de "id" no banco (é gerado pelo Prisma Client), por isso
--    geramos um id aqui com gen_random_uuid().
INSERT INTO "OrcamentoPlanejado" (
  "id", "pessoaId", "categoriaId", "subcategoriaId", "mes", "ano",
  "valorCentavos", "householdId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  ig."pessoaId",
  o."categoriaId",
  o."subcategoriaId",
  o."mes",
  o."ano",
  o."valorCentavos",
  o."householdId",
  now(),
  now()
FROM "OrcamentoPlanejado" o
JOIN "Pessoa" p ON p."id" = o."pessoaId"
JOIN "IntegranteGrupo" ig ON ig."grupoId" = o."pessoaId"
WHERE p."tipo" <> 'INDIVIDUAL'
ON CONFLICT ("householdId", "pessoaId", "categoriaId", "subcategoriaId", "mes", "ano")
DO NOTHING;

-- 2. Remover os orçamentos que pertenciam a grupos (já duplicados acima para
--    quem tinha integrantes; descartados de vez para grupos sem integrantes).
DELETE FROM "OrcamentoPlanejado" o
USING "Pessoa" p
WHERE o."pessoaId" = p."id" AND p."tipo" <> 'INDIVIDUAL';

-- 3. Remover orçamentos "Compartilhado (casa toda)" (pessoaId nulo) — essa
--    opção deixou de existir na tela de orçamento.
DELETE FROM "OrcamentoPlanejado" WHERE "pessoaId" IS NULL;
