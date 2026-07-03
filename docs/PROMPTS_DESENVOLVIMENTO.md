# Roteiro de Prompts para Claude Code — Sistema de Controle Financeiro

Cada bloco abaixo é pensado para **um chat novo** no Claude Code (contexto limpo), na ordem em
que devem ser executados. Cole o prompt como está, ajustando o que estiver entre `< >`.
Sempre que abrir um chat novo, comece pedindo para o Claude ler `docs/REQUISITOS.md`
e o `README.md`/`CLAUDE.md` do projeto antes de agir.

Pré-requisito: stack ainda não definida. O primeiro prompt resolve isso antes de qualquer código.

---

## Checklist geral

- [x] 1. Definição de stack e arquitetura
- [x] 2. Setup do projeto (scaffold, lint, CI básico)
- [x] 3. Modelagem de dados e migrations
- [x] 4. Autenticação e cadastro de Pessoas
- [x] 5. CRUD de Categorias/Subcategorias
- [x] 6. CRUD de Bancos/meios de pagamento
- [x] 7. CRUD de Lançamentos (manual)
- [x] 8. Importação de extrato/fatura (CSV/OFX)
- [ ] 9. Orçamento planejado (cadastro por pessoa/categoria/mês)
- [ ] 10. Cálculo planejado vs. real + dashboards de categoria/subcategoria
- [ ] 11. Divisão de despesas do casal (split e saldo a acertar)
- [ ] 12. Módulo de Investimentos (CRUD + posição atual)
- [ ] 13. Histórico de patrimônio e rendimento (real vs. esperado vs. CDI)
- [ ] 14. Relatórios anuais consolidados (equivalente às abas Sum)
- [ ] 15. Importação dos dados históricos da planilha (migração única)
- [ ] 16. Testes end-to-end dos fluxos críticos
- [ ] 17. Hardening de segurança (auth, dados financeiros sensíveis)
- [ ] 18. Deploy em produção
- [ ] 19. Validação em produção com dados reais (Isa e Gabi usando em paralelo à planilha)
- [ ] 20. Descomissionamento da planilha

---

## Prompt 1 — Definição de stack e arquitetura

```
Leia docs/REQUISITOS.md neste repositório. Ele descreve os requisitos de um sistema
para substituir uma planilha de controle financeiro de casal (orçamento, lançamentos,
divisão de despesas, investimentos).

Quero decidir a stack antes de escrever qualquer código. Me ajude a escolher, considerando:
- Vai ser usado por 2 pessoas (Isa e Gabi), acesso via navegador (web), idealmente também
  utilizável no celular (responsivo).
- Hospedagem barata/simples (somos só nós dois usando).
- Eu (Gabi) sou quem vai dar manutenção no código depois.
- Dados financeiros sensíveis: precisa de autenticação.

Não escreva código ainda. Proponha 2-3 opções de stack (frontend, backend, banco de dados,
hospedagem) com prós/contras, e recomende uma. Depois de eu confirmar, crie um arquivo
docs/ARQUITETURA.md no repositório documentando a decisão final e o desenho de alto nível
(camadas, como os módulos do REQUISITOS.md mapeiam para a arquitetura).
```

## Prompt 2 — Setup do projeto

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md.

Faça o scaffold inicial do projeto conforme a stack decidida: estrutura de pastas, gerenciador
de pacotes, lint/formatter, scripts de dev (rodar local), e um CLAUDE.md no repositório com
convenções do projeto (como rodar, como testar, padrões de código).
Não implemente nenhuma funcionalidade de negócio ainda — apenas o esqueleto funcionando
(uma página/rota "hello world" de health-check) e testes/lint passando.
Ao final, rode o projeto localmente e confirme que sobe sem erro.
```

## Prompt 3 — Modelagem de dados e migrations

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (seção "Entidades de dados" e RF01-RF15).

Modele o banco de dados: Pessoa, Categoria, Subcategoria, Banco, Lançamento, Receita,
OrçamentoPlanejado, Investimento, PosicaoPatrimonio. Preste atenção em:
- Lançamento precisa registrar "divisão" (dono do gasto) e "quem pagou" como referências
  separadas a Pessoa, para suportar o split de despesas (RF11).
- Valores monetários: usar tipo decimal/inteiro em centavos, nunca float.
- Subcategoria pertence a uma Categoria.

Crie as migrations e os models/schemas. Não crie endpoints ou UI ainda. Escreva testes de
schema (constraints, relacionamentos) e rode as migrations localmente para confirmar que
funcionam.
```

## Prompt 4 — Autenticação e cadastro de Pessoas

```
Leia docs/ARQUITETURA.md. O banco de dados já existe (rodei as migrations do prompt anterior).

Implemente:
1. Autenticação simples (login com e-mail/senha, ou o método que você recomendou em
   docs/ARQUITETURA.md) — só 2 usuários vão existir, não precisa de cadastro público nem
   "esqueci senha" sofisticado, mas precisa ser seguro (senha com hash, sessão/token).
2. CRUD de Pessoa (RF03): nome, tipo de titularidade (individual, casal, família, outro).
3. Seed inicial com Isa e Gabi como pessoas e usuários.

Escreva testes para autenticação (login válido/inválido, rota protegida sem sessão) e para o
CRUD de Pessoa. Rode os testes e confirme que passam antes de finalizar.
```

## Prompt 5 — CRUD de Categorias/Subcategorias

```
Leia docs/ARQUITETURA.md. Auth e cadastro de Pessoa já existem e funcionam.

Implemente CRUD de Categoria e Subcategoria (RF01): hierarquia de 2 níveis, % de orçamento
padrão por categoria. Inclua tela/rota para listar, criar, editar e inativar (não excluir
fisicamente, já que lançamentos antigos podem referenciar).

Popule com as categorias e subcategorias reais identificadas na planilha (estão em
docs/REQUISITOS.md e nos exports HTML em docs/planilha-origem/Financas-2026/*.html, ex. ALIMENTAÇÃO
(Café, Restaurante, Supermercado, Delivery), CASA, DIVERSOS, EDUCAÇÃO/TRABALHO, HIGIENE
PESSOAL, LAZER, PET, SAÚDE, TAXAS, TRANSPORTE, VESTIMENTA, VIAGEM — confirme a lista completa
lendo os arquivos antes de popular).

Escreva e rode testes do CRUD.
```

## Prompt 6 — CRUD de Bancos/meios de pagamento

```
Leia docs/ARQUITETURA.md. Implemente CRUD de Banco/meio de pagamento (RF02): nome, tipo
(cartão de crédito, conta corrente, etc). Popule com os bancos reais usados na planilha
(ver coluna "Banco" em docs/planilha-origem/Financas-2026/Lançamentos.html, ex. "BB Crédito", "Itaú Crédito").
Escreva e rode testes.
```

## Prompt 7 — CRUD de Lançamentos

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF04, RF05, RF07). Categoria, Subcategoria,
Banco e Pessoa já existem.

Implemente CRUD de Lançamento: data, descrição (origem e própria), valor (aceitar negativo
para estorno), desconto, categoria, subcategoria, banco, divisão (pessoa/grupo dono do gasto),
quem pagou. Inclua filtros por período, categoria, pessoa, banco. Implemente também o
lançamento de Receita (RF07): pessoa, subtipo de fonte, valor, mês.

Garanta validação: subcategoria selecionada deve pertencer à categoria selecionada.
Escreva testes (criação, edição, filtros, validação) e rode antes de finalizar.
```

## Prompt 8 — Importação de extrato/fatura

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF06).

Implemente importação de extrato/fatura em CSV (formato a definir — pergunte-me qual banco
exportar primeiro como exemplo, ou use um CSV de exemplo que eu fornecer). A importação deve:
- Fazer parsing e preview antes de confirmar.
- Sugerir categoria/subcategoria automaticamente com base em lançamentos anteriores com
  descrição parecida.
- Evitar duplicar lançamentos já importados (ex. por hash de data+descrição+valor+banco).

Escreva testes com um CSV de exemplo (pode ser fictício) cobrindo: importação nova,
detecção de duplicado, sugestão de categoria.
```

## Prompt 9 — Orçamento planejado

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF08).

Implemente cadastro de Orçamento Planejado: valor por pessoa/grupo (Isa, Gabi, Família),
categoria/subcategoria, mês ou ano. Inclua tela para definir/ajustar o orçamento do ano,
similar ao bloco "Despesas / Planejado" das abas Isa/Gabi/Anual da planilha
(ver docs/planilha-origem/Financas-2026/Isa.html linhas com "Planejado").

Escreva e rode testes do CRUD de orçamento.
```

## Prompt 10 — Cálculo planejado vs. real + dashboards

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF09, RF10). Orçamento planejado e
Lançamentos já existem.

Implemente:
1. Cálculo de planejado vs. real por categoria/subcategoria, mês a mês e acumulado, com
   indicador de dentro/fora do planejado (%) — equivalente às abas Isa/Gabi/Anual.
2. Dashboard agregado por categoria e subcategoria: total, % do total, média mensal,
   breakdown mês a mês — equivalente às abas "Sum (Categoria)" e "Sum (Subcategoria)".
3. Visão de saldo mensal/anual (receita total - despesa total).

Escreva testes de cálculo com dados conhecidos (monte um cenário fixo de lançamentos +
orçamento e confirme os totais esperados manualmente).
```

## Prompt 11 — Divisão de despesas do casal

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF11).

Implemente o cálculo de divisão de despesas: a partir do campo "divisão" (dono do gasto) e
"quem pagou" de cada Lançamento, calcule quanto cada pessoa pagou em nome da outra/da família
e o saldo final a acertar entre Isa e Gabi — equivalente ao bloco "Controle pagamento" da aba
Isa (ver docs/planilha-origem/Financas-2026/Isa.html, linhas com "Quanto Isa pagou pela Gabi" /
"Quanto Gabi pagou pela Isa" / "Diferença").

Mostre isso numa tela clara de "quem deve quem" por período.
Escreva testes de cálculo cobrindo cenários: gasto de família pago por um, gasto individual
pago pelo outro, e o saldo líquido resultante.
```

## Prompt 12 — Módulo de Investimentos

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF12, RF15).

Implemente CRUD de Investimento: banco, tipo (Renda Fixa, Fundo de Investimento, FGTS etc.),
nome do produto, valor atual, vencimento/liquidez (D+n ou data), observação, titular (pessoa).
Implemente visão de liquidez consolidada: total disponível agrupado por prazo de resgate
(equivalente à aba "Liquidez investimentos").

Escreva e rode testes do CRUD e da agregação por liquidez.
```

## Prompt 13 — Histórico de patrimônio e rendimento

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md (RF13, RF14).

Implemente registro mensal de posição de patrimônio por banco/titular, e o cálculo de:
- Rendimento real vs. esperado vs. CDI (mensal e acumulado).
- Projeção de patrimônio futuro.
Use como referência o conteúdo de docs/planilha-origem/Financas-2026/Histórico Patrimônio.html para entender as
fórmulas (variação de patrimônio, rendimento acumulado real, diferença real vs. esperado,
rendimento mensal esperado).

IMPORTANTE: pergunte-me antes de implementar como o CDI deve ser obtido (input manual mensal
ou integração com fonte externa) — isso ainda está em aberto no REQUISITOS.md.

Escreva testes de cálculo com dados fixos.
```

## Prompt 14 — Relatórios anuais consolidados

```
Leia docs/ARQUITETURA.md e docs/REQUISITOS.md.

Monte as telas de relatório anual consolidado, reunindo: orçamento planejado vs. real do ano
(Isa, Gabi, Família), saldo final do ano, evolução de patrimônio total, divisão de despesas
acumulada do ano — equivalente à visão geral que hoje está espalhada entre as abas Anual,
Sum (Categoria) e Sum (Subcategoria).

Escreva testes para os agregados anuais.
```

## Prompt 15 — Migração dos dados históricos da planilha

```
Leia docs/ARQUITETURA.md. Todas as funcionalidades de cadastro e cálculo já existem e têm testes
passando.

Preciso migrar os dados reais da planilha financas.numbers (docs/planilha-origem/Financas-2026/) para o novo
sistema, em vez de recomeçar do zero. Os exports HTML em docs/planilha-origem/Financas-2026/*.html têm os dados
de referência (lançamentos, orçamento, investimentos, histórico de patrimônio).

Escreva um script de migração único (não faz parte do produto, é ferramenta de uso único)
que:
1. Extrai os lançamentos, orçamento planejado, investimentos e histórico de patrimônio dos
   HTMLs (ou do .numbers, se você conseguir abri-lo).
2. Faz o mapeamento de categoria/banco/pessoa para os cadastros já existentes no sistema.
3. Importa tudo para o banco de produção/staging, com um modo --dry-run que só mostra o que
   seria importado sem gravar.

Rode em --dry-run primeiro e me mostre um resumo (quantos lançamentos, qual período, algum
dado que não bateu) antes de gravar de verdade.
```

## Prompt 16 — Testes end-to-end dos fluxos críticos

```
Leia docs/ARQUITETURA.md. O sistema está funcionalmente completo e com dados migrados em staging.

Escreva testes end-to-end (UI) cobrindo os fluxos mais críticos:
1. Login.
2. Criar um lançamento manual e ver refletido no dashboard de categoria.
3. Importar um CSV de extrato e confirmar que aparece corretamente.
4. Ajustar orçamento planejado e ver o indicador de dentro/fora do planejado mudar.
5. Conferir o saldo de divisão de despesas após um lançamento de família pago por uma pessoa.

Rode a suíte completa e garanta que está verde.
```

## Prompt 17 — Hardening de segurança

```
Leia docs/ARQUITETURA.md. Quero uma revisão de segurança antes de ir para produção, já que o
sistema lida com dados financeiros sensíveis (saldos, investimentos, salário).

Use a skill /security-review para revisar o código. Trate especialmente:
- Autenticação e controle de sessão.
- Autorização (cada usuário só deve ver/editar o que faz sentido — confirme comigo a regra:
  provavelmente Isa e Gabi veem tudo, mas confirme).
- Proteção contra injection nos endpoints de filtro/busca.
- Segredos (chaves de banco, sessão) fora do código-fonte.

Aplique as correções necessárias e rode os testes novamente.
```

## Prompt 18 — Deploy em produção

```
Leia docs/ARQUITETURA.md. Testes e revisão de segurança já passaram.

Me ajude a configurar o deploy em produção conforme a hospedagem decidida no docs/ARQUITETURA.md:
variáveis de ambiente, banco de produção, processo de deploy (manual ou CI/CD), domínio/HTTPS,
backup do banco de dados. Documente o processo em DEPLOY.md.

Antes de qualquer ação irreversível em produção (criar banco real, configurar domínio,
deploy efetivo), confirme comigo cada passo.
```

## Prompt 19 — Validação em produção com dados reais

```
O sistema está em produção com os dados migrados. Vamos (eu e a Isa) usar em paralelo à
planilha por um período para validar.

Me ajude a:
1. Levantar uma checklist de comparação: para um mês fechado, os totais do sistema novo
   batem com os da planilha (docs/planilha-origem/Financas-2026/financas.numbers)?
2. Registrar e priorizar divergências/bugs encontrados durante o uso real.
Não corrija nada ainda sem eu confirmar o que priorizar.
```

## Prompt 20 — Descomissionamento da planilha

```
A validação em paralelo terminou e o sistema novo está confiável. Vamos encerrar o uso da
planilha.

Me ajude a:
1. Confirmar que todos os dados até a data de corte estão no sistema novo (comparação final).
2. Arquivar financas.numbers e os exports HTML em docs/planilha-origem/Financas-2026/ (não apagar — mover para uma
   pasta de arquivo morto/backup, ex. docs/planilha-origem/Financas-2026/_arquivado/).
3. Atualizar o README.md do repositório explicando que a planilha não é mais a fonte de
   verdade.
```

---

## Observações de uso

- Se um prompt gerar um chat muito longo (ex. o sistema cresceu e o Claude já não tem mais
  contexto suficiente), divida em sub-prompts menores (ex. separar "criar endpoint" de
  "criar UI").
- Sempre rode testes/lint antes de considerar um prompt concluído.
- Os prompts 12-14 (Investimentos) podem ser adiados para depois de validar o módulo de
  orçamento/lançamentos em produção, se preferir entregar em fases.
