-- Preenche a divisão das linhas de orçamento já existentes com a Pessoa
-- tipo FAMILIA do household, quando existir uma. Households sem Pessoa
-- FAMILIA (ou sem nenhum orçamento ainda) ficam com divisaoId nulo, que
-- também é o comportamento padrão para linhas novas daqui pra frente.
UPDATE "OrcamentoPlanejado" o
SET "divisaoId" = f.id
FROM "Pessoa" f
WHERE f."householdId" = o."householdId"
  AND f."tipo" = 'FAMILIA'
  AND o."divisaoId" IS NULL;
