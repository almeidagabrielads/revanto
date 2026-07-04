// Ferramenta de USO ÚNICO — importa os dados extraídos de financas.numbers
// (ver scripts/migracao/extrair.py) para o banco do Finance Manager.
//
// Não faz parte do produto: depois da migração real, este diretório pode ser
// removido.
//
// Uso:
//   python3 scripts/migracao/extrair.py         # gera dados-extraidos.json
//   npx tsx scripts/migracao/importar.ts --dry-run
//   npx tsx scripts/migracao/importar.ts --commit
import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type TipoBanco,
  type TipoInvestimento,
} from "../../src/generated/prisma/client";
import { calcularHashImportacao } from "../../src/lib/domain/import/hash";

const HOUSEHOLD_NOME = "Isa & Gabi";
// A aba "Histórico Patrimônio" só tem nome do mês (sem ano); a planilha é a
// de 2026 (docs/planilha-origem/Financas-2026) e a data "de hoje" no momento
// da migração também é 2026 — então assumimos ano-referência 2026 para as
// posições de patrimônio.
const ANO_REFERENCIA_PATRIMONIO = 2026;

const MESES_PT: Record<string, number> = {
  Janeiro: 1,
  Fevereiro: 2,
  Março: 3,
  Abril: 4,
  Maio: 5,
  Junho: 6,
  Julho: 7,
  Agosto: 8,
  Setembro: 9,
  Outubro: 10,
  Novembro: 11,
  Dezembro: 12,
};

type LancamentoExtraido = {
  linha: number;
  data: string;
  descricaoOrigem: string | null;
  descricaoPropria: string | null;
  divisao: string | null;
  valor: number | null;
  desconto: number | null;
  categoria: string | null;
  subcategoria: string | null;
  banco: string | null;
  quemPagou: string | null;
};

type InvestimentoExtraido = {
  linha: number;
  banco: string;
  tipo: string | null;
  produto: string | null;
  valor: number;
  vencimento: string | null; // "D+N" ou data ISO
  observacao: string | null;
};

type PatrimonioExtraido = {
  pessoa: string;
  banco: string;
  mes: string;
  valor: number;
};

type DadosExtraidos = {
  lancamentos: LancamentoExtraido[];
  lancamentosAnomalias: Record<string, unknown>[];
  investimentos: InvestimentoExtraido[];
  patrimonio: PatrimonioExtraido[];
};

function normalizar(s: string | null | undefined): string | null {
  if (s == null) return null;
  const trimmed = s.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function centavos(valorReais: number): number {
  return Math.round(valorReais * 100);
}

// Heurística de classificação de bancos novos (nomes vistos nos dados que não
// existem ainda no cadastro `bancosSeed` do prisma/seed.ts).
function inferirTipoBanco(nome: string): TipoBanco {
  const n = nome.toLowerCase();
  if (n.includes("crédito") || n.includes("credito")) return "CARTAO_CREDITO";
  if (n.includes("conta")) return "CONTA_CORRENTE";
  if (n === "voucher") return "OUTRO";
  if (n === "fgts") return "OUTRO";
  return "OUTRO";
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const commit = args.includes("--commit");

  if (dryRun === commit) {
    console.error(
      "Especifique exatamente um modo: --dry-run (só mostra o que seria importado) ou --commit (grava de verdade).",
    );
    process.exit(1);
  }

  return run(commit);
}

async function run(commit: boolean) {
  const dadosPath = join(__dirname, "dados-extraidos.json");
  let dados: DadosExtraidos;
  try {
    dados = JSON.parse(readFileSync(dadosPath, "utf-8"));
  } catch {
    console.error(
      `Não achei ${dadosPath}. Rode antes: python3 scripts/migracao/extrair.py`,
    );
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  const pool = new Pool({ connectionString: url });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const household = await prisma.household.findUnique({
      where: { nome: HOUSEHOLD_NOME },
    });
    if (!household) {
      throw new Error(
        `Household "${HOUSEHOLD_NOME}" não existe. Rode "npm run seed" primeiro.`,
      );
    }

    const [pessoasDb, categoriasDb, bancosDb] = await Promise.all([
      prisma.pessoa.findMany({ where: { householdId: household.id } }),
      prisma.categoria.findMany({
        where: { householdId: household.id },
        include: { subcategorias: true },
      }),
      prisma.banco.findMany({ where: { householdId: household.id } }),
    ]);

    const pessoaPorNome = new Map(pessoasDb.map((p) => [p.nome, p]));
    const categoriaPorNome = new Map(categoriasDb.map((c) => [c.nome, c]));
    const bancoPorNome = new Map(bancosDb.map((b) => [b.nome, b]));

    // ─── Pessoa "Família" (tipo FAMILIA) — usada como pessoaDivisao quando a
    // planilha marca "Família" na coluna Divisão. Não existe no seed atual. ──
    let pessoaFamilia = pessoaPorNome.get("Família") ?? null;
    const precisaCriarFamilia = !pessoaFamilia;
    if (commit && precisaCriarFamilia) {
      pessoaFamilia = await prisma.pessoa.create({
        data: { nome: "Família", tipo: "FAMILIA", householdId: household.id },
      });
      pessoaPorNome.set("Família", pessoaFamilia);
    }

    function resolverPessoa(nome: string): {
      id: string;
      tipo: string;
    } | null {
      const p = pessoaPorNome.get(nome);
      if (p) return p;
      if (nome === "Família" && commit && pessoaFamilia)
        return pessoaFamilia;
      if (nome === "Família" && !commit)
        return { id: "(nova) Família", tipo: "FAMILIA" };
      return null;
    }

    // ─── Bancos novos vistos nos dados (lançamentos + investimentos +
    // patrimônio) que não existem no cadastro. ──────────────────────────────
    const nomesBancosVistos = new Set<string>();
    for (const l of dados.lancamentos) {
      const nome = normalizar(l.banco);
      if (nome) nomesBancosVistos.add(nome);
    }
    for (const i of dados.investimentos) nomesBancosVistos.add(i.banco);
    for (const p of dados.patrimonio) nomesBancosVistos.add(p.banco);

    const bancosNovos: { nome: string; tipo: TipoBanco }[] = [];
    for (const nome of nomesBancosVistos) {
      if (!bancoPorNome.has(nome)) {
        bancosNovos.push({ nome, tipo: inferirTipoBanco(nome) });
      }
    }

    if (commit) {
      for (const b of bancosNovos) {
        const criado = await prisma.banco.create({
          data: { nome: b.nome, tipo: b.tipo, householdId: household.id },
        });
        bancoPorNome.set(b.nome, criado);
      }
    }

    function resolverBanco(nome: string): { id: string } | null {
      const b = bancoPorNome.get(nome);
      if (b) return b;
      if (!commit) return { id: `(novo) ${nome}` };
      return null;
    }

    // ─── Lançamentos ────────────────────────────────────────────────────────
    const subcategoriaNaoMapeada = new Map<string, number>();
    const lancamentosParaImportar: {
      data: Date;
      descricaoOrigem: string | null;
      descricaoPropria: string | null;
      valorCentavos: number;
      descontoCentavos: number;
      categoriaId: string | null;
      subcategoriaId: string | null;
      bancoId: string;
      pessoaDivisaoId: string;
      pessoaPagouId: string;
      hashImportacao: string;
      linhaOrigem: number;
    }[] = [];
    const lancamentosIgnorados: { linha: number; motivo: string }[] = [];
    const lancamentosConvertidosDeDesconto: number[] = [];

    for (const l of dados.lancamentos) {
      const motivos: string[] = [];

      const categoriaNome = normalizar(l.categoria);
      const categoria = categoriaNome
        ? categoriaPorNome.get(categoriaNome)
        : undefined;
      if (categoriaNome && !categoria) {
        motivos.push(`categoria desconhecida "${categoriaNome}"`);
      }

      let subcategoriaId: string | null = null;
      const subcategoriaNome = normalizar(l.subcategoria);
      if (subcategoriaNome && categoria) {
        const sub = categoria.subcategorias.find(
          (s) => s.nome === subcategoriaNome,
        );
        if (sub) {
          subcategoriaId = sub.id;
        } else {
          const chave = `${categoria.nome} / ${subcategoriaNome}`;
          subcategoriaNaoMapeada.set(
            chave,
            (subcategoriaNaoMapeada.get(chave) ?? 0) + 1,
          );
        }
      }

      const bancoNome = normalizar(l.banco);
      const banco = bancoNome ? resolverBanco(bancoNome) : null;
      if (!banco) motivos.push("sem banco");

      const divisaoNome = normalizar(l.divisao);
      const pessoaDivisao = divisaoNome ? resolverPessoa(divisaoNome) : null;
      if (!pessoaDivisao)
        motivos.push(`pessoa (divisão) desconhecida "${divisaoNome}"`);

      const quemPagouNome = normalizar(l.quemPagou);
      const pessoaPagou = quemPagouNome
        ? resolverPessoa(quemPagouNome)
        : null;
      if (!pessoaPagou)
        motivos.push(`pessoa (quem pagou) desconhecida "${quemPagouNome}"`);

      // Padrão recorrente na planilha: estornos/créditos de cartão (ex.:
      // "ESTORNO IOF", "DESC ANTECIPA PARCELAS", "Crédito de ...") foram
      // lançados só na coluna Desconto, com Valor vazio — em vez de um
      // valor positivo próprio. Tratamos como lançamento de valor negativo
      // (crédito), zerando o desconto, em vez de descartar a linha.
      const valorFaltandoComDesconto = l.valor == null && l.desconto != null;
      if (l.valor == null && l.desconto == null) {
        motivos.push("sem valor (campo Valor vazio)");
      }

      if (motivos.length > 0 || !banco || !pessoaDivisao || !pessoaPagou) {
        lancamentosIgnorados.push({
          linha: l.linha,
          motivo: motivos.join("; "),
        });
        continue;
      }

      if (valorFaltandoComDesconto) {
        lancamentosConvertidosDeDesconto.push(l.linha);
      }

      const valorCentavos = valorFaltandoComDesconto
        ? -centavos(l.desconto as number)
        : centavos(l.valor as number);
      const descontoCentavos = valorFaltandoComDesconto
        ? 0
        : l.desconto
          ? centavos(l.desconto)
          : 0;

      lancamentosParaImportar.push({
        data: new Date(l.data),
        descricaoOrigem: normalizar(l.descricaoOrigem),
        descricaoPropria: normalizar(l.descricaoPropria),
        valorCentavos,
        descontoCentavos,
        categoriaId: categoria?.id ?? null,
        subcategoriaId,
        bancoId: banco.id,
        pessoaDivisaoId: pessoaDivisao.id,
        pessoaPagouId: pessoaPagou.id,
        hashImportacao: calcularHashImportacao({
          data: new Date(l.data),
          descricaoOrigem: normalizar(l.descricaoOrigem) ?? "",
          valorCentavos,
          bancoId: banco.id,
        }),
        linhaOrigem: l.linha,
      });
    }

    // ─── Investimentos (Liquidez investimentos) ────────────────────────────
    const investimentosParaImportar: {
      bancoId: string;
      tipo: TipoInvestimento;
      produto: string;
      valorAtualCentavos: number;
      vencimento: Date | null;
      liquidezDias: number | null;
      observacao: string | null;
      pessoaId: string;
      pessoaInferida: string;
      linhaOrigem: number;
    }[] = [];
    const investimentosIgnorados: { linha: number; motivo: string }[] = [];

    for (const inv of dados.investimentos) {
      const linha = inv.linha;

      // Linhas de FGTS: a planilha usa a coluna "produto" para guardar o
      // nome da pessoa titular (não há coluna de titular própria).
      if (inv.banco === "FGTS") {
        const nomePessoa = normalizar(inv.produto);
        const pessoa = nomePessoa ? resolverPessoa(nomePessoa) : null;
        const banco = resolverBanco("FGTS");
        if (!pessoa || !banco) {
          investimentosIgnorados.push({
            linha,
            motivo: `FGTS sem titular reconhecido ("${nomePessoa}")`,
          });
          continue;
        }
        investimentosParaImportar.push({
          bancoId: banco.id,
          tipo: "FGTS",
          produto: "FGTS",
          valorAtualCentavos: centavos(inv.valor),
          vencimento: null,
          liquidezDias: null,
          observacao: null,
          pessoaId: pessoa.id,
          pessoaInferida: `explícito (coluna produto = "${nomePessoa}")`,
          linhaOrigem: linha,
        });
        continue;
      }

      const texto = `${inv.produto ?? ""} ${inv.observacao ?? ""}`.toLowerCase();
      let nomePessoaInferida: string;
      let comoInferiu: string;
      if (texto.includes("gabi")) {
        nomePessoaInferida = "Gabi";
        comoInferiu = "texto do produto/observação menciona Gabi";
      } else if (texto.includes("isa")) {
        nomePessoaInferida = "Isa";
        comoInferiu = "texto do produto/observação menciona Isa";
      } else if (["XP", "Itaú", "BMG"].includes(inv.banco)) {
        // Histórico Patrimônio só lista XP/Itaú/BMG na seção "INVESTIMENTOS
        // ISA" (nenhum desses bancos aparece na seção da Gabi) — assumimos
        // Isa como titular por padrão. CONFERIR antes do --commit.
        nomePessoaInferida = "Isa";
        comoInferiu =
          "inferido por banco (aparece só na seção Isa de Histórico Patrimônio) — CONFERIR";
      } else {
        investimentosIgnorados.push({
          linha,
          motivo: `não foi possível inferir titular para banco "${inv.banco}" / produto "${inv.produto}"`,
        });
        continue;
      }

      const pessoa = resolverPessoa(nomePessoaInferida);
      const banco = resolverBanco(inv.banco);
      if (!pessoa || !banco) {
        investimentosIgnorados.push({
          linha,
          motivo: "banco ou pessoa não resolvido",
        });
        continue;
      }

      let vencimento: Date | null = null;
      let liquidezDias: number | null = null;
      if (inv.vencimento) {
        const m = /^D\+(\d+)$/.exec(inv.vencimento);
        if (m) {
          liquidezDias = Number(m[1]);
        } else {
          vencimento = new Date(inv.vencimento);
        }
      }

      const tipo: TipoInvestimento =
        inv.tipo === "Renda Fixa"
          ? "RENDA_FIXA"
          : inv.tipo === "Fundo de Investimento"
            ? "FUNDO"
            : "OUTRO";

      investimentosParaImportar.push({
        bancoId: banco.id,
        tipo,
        produto: normalizar(inv.produto) ?? "(sem nome)",
        valorAtualCentavos: centavos(inv.valor),
        vencimento,
        liquidezDias,
        observacao: normalizar(inv.observacao),
        pessoaId: pessoa.id,
        pessoaInferida: `${nomePessoaInferida} (${comoInferiu})`,
        linhaOrigem: linha,
      });
    }

    // ─── Posições de patrimônio (Histórico Patrimônio) ─────────────────────
    const posicoesParaImportar: {
      bancoId: string;
      pessoaId: string;
      mes: Date;
      valorCentavos: number;
    }[] = [];
    const posicoesIgnoradas: { motivo: string }[] = [];

    for (const p of dados.patrimonio) {
      const pessoa = resolverPessoa(p.pessoa);
      const banco = resolverBanco(p.banco);
      const mesNumero = MESES_PT[p.mes];
      if (!pessoa || !banco || !mesNumero) {
        posicoesIgnoradas.push({
          motivo: `${p.pessoa}/${p.banco}/${p.mes} não resolvido`,
        });
        continue;
      }
      posicoesParaImportar.push({
        bancoId: banco.id,
        pessoaId: pessoa.id,
        mes: new Date(
          Date.UTC(ANO_REFERENCIA_PATRIMONIO, mesNumero - 1, 1),
        ),
        valorCentavos: centavos(p.valor),
      });
    }

    // ─── Relatório (sempre impresso, dry-run ou commit) ────────────────────
    const datas = lancamentosParaImportar.map((l) => l.data.getTime());
    const dataMin = datas.length ? new Date(Math.min(...datas)) : null;
    const dataMax = datas.length ? new Date(Math.max(...datas)) : null;

    console.log("\n=== RESUMO DA MIGRAÇÃO ===\n");
    console.log(`Modo: ${commit ? "COMMIT (grava no banco)" : "DRY-RUN (nada será gravado)"}`);
    console.log(`Household: ${household.nome}\n`);

    console.log(`Lançamentos a importar: ${lancamentosParaImportar.length}`);
    if (dataMin && dataMax) {
      console.log(
        `  Período: ${dataMin.toISOString().slice(0, 10)} a ${dataMax.toISOString().slice(0, 10)}`,
      );
    }
    console.log(`  Ignorados (dados incompletos): ${lancamentosIgnorados.length}`);
    for (const ig of lancamentosIgnorados) {
      console.log(`    linha ${ig.linha}: ${ig.motivo}`);
    }
    if (lancamentosConvertidosDeDesconto.length > 0) {
      console.log(
        `  Atenção: ${lancamentosConvertidosDeDesconto.length} lançamento(s) com "Valor" vazio e só "Desconto"` +
          ` preenchido (padrão de estorno/crédito de cartão na planilha original) —` +
          ` importados com valor NEGATIVO (= -Desconto) e desconto zerado: linhas ${lancamentosConvertidosDeDesconto.join(", ")}`,
      );
    }
    if (subcategoriaNaoMapeada.size > 0) {
      console.log(
        `  Atenção: subcategoria não encontrada no cadastro (importados com subcategoria em branco):`,
      );
      for (const [chave, count] of subcategoriaNaoMapeada) {
        console.log(`    ${chave}: ${count} lançamento(s)`);
      }
    }

    console.log(`\nInvestimentos a importar: ${investimentosParaImportar.length}`);
    for (const inv of investimentosParaImportar) {
      console.log(
        `  linha ${inv.linhaOrigem}: ${inv.produto} — R$ ${(inv.valorAtualCentavos / 100).toFixed(2)} — titular: ${inv.pessoaInferida}`,
      );
    }
    console.log(`  Ignorados: ${investimentosIgnorados.length}`);
    for (const ig of investimentosIgnorados) {
      console.log(`    linha ${ig.linha}: ${ig.motivo}`);
    }

    console.log(`\nPosições de patrimônio a importar: ${posicoesParaImportar.length}`);
    console.log(`  Ignoradas: ${posicoesIgnoradas.length}`);
    for (const ig of posicoesIgnoradas) console.log(`    ${ig.motivo}`);

    console.log(
      `\nOrçamento planejado: NENHUM dado importado. A planilha não tem valores mensais de` +
        ` orçamento planejado por categoria — só percentuais estáticos (já presentes em` +
        ` prisma/seed.ts, categoriasSeed[].percentualOrcamento). Se quiser gerar linhas` +
        ` OrcamentoPlanejado (mês/ano/categoria/valor), preciso de um valor de referência` +
        ` (ex.: renda mensal esperada) que não está na planilha — decisão do usuário.`,
    );

    if (bancosNovos.length > 0) {
      console.log(`\nBancos novos ${commit ? "criados" : "que seriam criados"}:`);
      for (const b of bancosNovos) console.log(`  ${b.nome} (${b.tipo})`);
    }
    if (precisaCriarFamilia) {
      console.log(
        `\nPessoa "Família" (tipo FAMILIA) ${commit ? "criada" : "seria criada"} — usada nos lançamentos com Divisão = "Família".`,
      );
    }

    console.log(
      `\nLançamento excluído por anomalia conhecida na planilha original (linha 6,` +
        ` data 2000-01-01, comentário "ver como lançar isso direito... tem lançamentos em` +
        ` 2025", campo Valor vazio e Desconto com R$ 2.836,09): não importado.` +
        ` Revisar manualmente na planilha antes de lançar à mão.`,
    );

    if (!commit) {
      console.log("\nNada foi gravado (--dry-run). Rode com --commit para gravar.");
      return;
    }

    // ─── Gravação ───────────────────────────────────────────────────────────
    console.log("\nGravando lançamentos...");
    const resultadoLancamentos = await prisma.lancamento.createMany({
      data: lancamentosParaImportar.map((l) => ({
        data: l.data,
        descricaoOrigem: l.descricaoOrigem,
        descricaoPropria: l.descricaoPropria,
        valorCentavos: l.valorCentavos,
        descontoCentavos: l.descontoCentavos,
        categoriaId: l.categoriaId,
        subcategoriaId: l.subcategoriaId,
        bancoId: l.bancoId,
        pessoaDivisaoId: l.pessoaDivisaoId,
        pessoaPagouId: l.pessoaPagouId,
        hashImportacao: l.hashImportacao,
        householdId: household.id,
      })),
      skipDuplicates: true,
    });
    console.log(`  ${resultadoLancamentos.count} lançamentos gravados (duplicados pelo hash foram pulados).`);

    // ── Reconciliação: alguns lançamentos são duplicatas legítimas na
    // planilha original (mesma data + descrição + valor + banco — ex.: duas
    // passagens de metrô compradas no mesmo dia). O hash de deduplicação
    // (mesma lógica do RF06, pensada pra evitar reimportar extrato repetido)
    // colide entre elas, então createMany+skipDuplicates descarta a segunda.
    // Aqui reinserimos as que ficaram de fora com hashImportacao = null
    // (não participam do dedup de futuras importações de CSV/OFX, mas não
    // perdemos o lançamento).
    const gravadosPorHash = new Map<string, number>();
    for (const r of await prisma.lancamento.findMany({
      where: { householdId: household.id, hashImportacao: { not: null } },
      select: { hashImportacao: true },
    })) {
      const hash = r.hashImportacao as string;
      gravadosPorHash.set(hash, (gravadosPorHash.get(hash) ?? 0) + 1);
    }
    // Contagem esperada por hash (duplicatas legítimas geram o mesmo hash
    // mais de uma vez) — comparamos com o que já está gravado para achar só
    // as que realmente faltam, e não todas as que compartilham hash.
    const restantePorHash = new Map(gravadosPorHash);
    const faltantes = lancamentosParaImportar.filter((l) => {
      const restante = restantePorHash.get(l.hashImportacao) ?? 0;
      if (restante > 0) {
        restantePorHash.set(l.hashImportacao, restante - 1);
        return false;
      }
      return true;
    });
    for (const l of faltantes) {
      await prisma.lancamento.create({
        data: {
          data: l.data,
          descricaoOrigem: l.descricaoOrigem,
          descricaoPropria: l.descricaoPropria,
          valorCentavos: l.valorCentavos,
          descontoCentavos: l.descontoCentavos,
          categoriaId: l.categoriaId,
          subcategoriaId: l.subcategoriaId,
          bancoId: l.bancoId,
          pessoaDivisaoId: l.pessoaDivisaoId,
          pessoaPagouId: l.pessoaPagouId,
          hashImportacao: null,
          householdId: household.id,
        },
      });
    }
    if (faltantes.length > 0) {
      console.log(
        `  ${faltantes.length} lançamento(s) duplicata legítima (mesma data/descrição/valor/banco de outro lançamento) gravados sem hash de dedup: linhas ${faltantes.map((l) => l.linhaOrigem).join(", ")}`,
      );
    }

    console.log("Gravando investimentos...");
    let investimentosGravados = 0;
    for (const inv of investimentosParaImportar) {
      const jaExiste = await prisma.investimento.findFirst({
        where: {
          householdId: household.id,
          bancoId: inv.bancoId,
          pessoaId: inv.pessoaId,
          produto: inv.produto,
        },
      });
      if (jaExiste) continue;
      await prisma.investimento.create({
        data: {
          bancoId: inv.bancoId,
          tipo: inv.tipo,
          produto: inv.produto,
          valorAtualCentavos: inv.valorAtualCentavos,
          vencimento: inv.vencimento,
          liquidezDias: inv.liquidezDias,
          observacao: inv.observacao,
          pessoaId: inv.pessoaId,
          householdId: household.id,
        },
      });
      investimentosGravados++;
    }
    console.log(`  ${investimentosGravados} investimentos gravados.`);

    console.log("Gravando posições de patrimônio...");
    let posicoesGravadas = 0;
    for (const pos of posicoesParaImportar) {
      await prisma.posicaoPatrimonio.upsert({
        where: {
          householdId_bancoId_pessoaId_mes: {
            householdId: household.id,
            bancoId: pos.bancoId,
            pessoaId: pos.pessoaId,
            mes: pos.mes,
          },
        },
        update: { valorCentavos: pos.valorCentavos },
        create: {
          bancoId: pos.bancoId,
          pessoaId: pos.pessoaId,
          mes: pos.mes,
          valorCentavos: pos.valorCentavos,
          householdId: household.id,
        },
      });
      posicoesGravadas++;
    }
    console.log(`  ${posicoesGravadas} posições de patrimônio gravadas (upsert).`);

    console.log("\nMigração concluída.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
