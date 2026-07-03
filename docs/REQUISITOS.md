# Levantamento de Requisitos — Sistema de Controle Financeiro

Baseado na análise de `financas.numbers` (abas: Isa, Gabi, Anual, Lançamentos, Sum (Categoria),
Sum (Subcategoria), Histórico Patrimônio, Liquidez investimentos).

## 1. Contexto

Planilha usada por um casal (Isa e Gabi) para controlar orçamento mensal/anual individual e
conjunto, registrar lançamentos de cartão/conta, calcular divisão de despesas entre os dois e
acompanhar patrimônio investido. Escopo do sistema: substituir toda a planilha, incluindo o
módulo de investimentos e o split de despesas do casal.

## 2. Entidades de dados

- **Pessoa**: nome, tipo de titularidade (individual, casal, família, outro/terceiro — ex. "Jader").
- **Categoria**: nome, % padrão de orçamento.
- **Subcategoria**: nome, categoria pai.
- **Banco/Meio de pagamento**: nome (ex. "BB Crédito", "Itaú Crédito", "Nubank").
- **Lançamento**: data, descrição (origem/extrato e descrição própria), valor (aceita negativo
  p/ estorno), desconto, categoria, subcategoria, banco, divisão (pessoa/grupo dono do gasto),
  quem pagou (pessoa que efetivamente desembolsou).
- **Receita**: pessoa, subtipo de fonte (salário, voucher, outros), valor, mês.
- **Orçamento planejado**: pessoa/grupo, categoria, subcategoria, mês ou ano, valor planejado.
- **Investimento**: banco, tipo (Renda Fixa, Fundo, FGTS...), produto, valor atual, vencimento/
  liquidez (D+n ou data), observação, pessoa/titular.
- **Posição de patrimônio**: banco, mês, valor, usado para série histórica e cálculo de rendimento.

## 3. Requisitos Funcionais

### Cadastros

- RF01 — CRUD de Categorias e Subcategorias (hierarquia 2 níveis), com % de orçamento padrão.
- RF02 — CRUD de Bancos/meios de pagamento.
- RF03 — CRUD de Pessoas, com tipo de titularidade (individual, casal, família, outro).

### Lançamentos

- RF04 — Criar/editar/excluir lançamento com todos os campos do modelo acima.
- RF05 — Suportar valores negativos (estornos) que compensam lançamentos anteriores.
- RF06 — Importação de extrato/fatura (CSV/OFX), com sugestão automática de categoria por
  descrição histórica.
- RF07 — Lançamentos de receita, vinculados a pessoa e subtipo de fonte.

### Orçamento e acompanhamento

- RF08 — Definir orçamento planejado mensal/anual por categoria/subcategoria, por pessoa e por
  casal/família.
- RF09 — Cálculo automático de planejado vs. real (mês a mês e acumulado), saldo mensal/anual,
  e indicador de dentro/fora do planejado (%).
- RF10 — Relatórios agregados por categoria e subcategoria: total, % do total, média mensal,
  breakdown mês a mês.

### Divisão de despesas (casal) — obrigatório

- RF11 — Calcular, a partir de "divisão" (dono do gasto) x "quem pagou", quanto cada pessoa
  pagou em nome da outra/da família, e o saldo final a acertar entre as duas — equivalente ao
  bloco "Controle de pagamento" hoje na aba Isa.

### Investimentos/Patrimônio — incluído no escopo

- RF12 — CRUD de Investimentos: banco, tipo, produto, valor, vencimento/liquidez, observação,
  titular.
- RF13 — Histórico mensal de posição de patrimônio por banco/titular.
- RF14 — Cálculo de rendimento real vs. esperado vs. CDI (mensal e acumulado), com projeção de
  patrimônio futuro.
- RF15 — Visão de liquidez consolidada (total disponível por prazo de resgate).

## 4. Requisitos não-funcionais (a validar)

- Multiusuário com pelo menos 2 perfis (Isa, Gabi) e visão consolidada do casal.
- Histórico auditável de lançamentos (quem criou/editou, quando).
- Valores monetários em BRL, com tratamento correto de centavos/arredondamento.

## 5. Pontos em aberto

- Fonte do CDI para RF14: input manual ou integração com índice externo?
- Importação de extrato (RF06): quais bancos/formatos prioritários?
- Multi-moeda? (gastos em viagem internacional já aparecem na planilha, ex. IOF/compra
  internacional)
