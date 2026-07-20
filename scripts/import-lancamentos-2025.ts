import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type TipoBanco,
  type TipoPessoa,
} from "../src/generated/prisma/client";
import { parseCsv, linhasParaObjetos } from "../src/lib/domain/import/csv";

const CSV_PATH =
  process.argv
    .find((arg) => arg.startsWith("--file="))
    ?.slice("--file=".length) ??
  "/Users/isalodi/Downloads/Finanças 2025 - Lançamentos.csv";
const APPLY = process.argv.includes("--apply");
const HOUSEHOLD_NOME =
  process.argv
    .find((arg) => arg.startsWith("--household="))
    ?.slice("--household=".length) ?? "Isa & Gabi";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type CsvLinha = Record<string, string>;

type LinhaValida = {
  numeroLinha: number;
  data: Date;
  descricaoOrigem: string | null;
  descricaoPropria: string | null;
  valorCentavos: number;
  descontoCentavos: number;
  categoria: string | null;
  subcategoria: string | null;
  banco: string;
  divisao: string;
  pagador: string;
  hashImportacao: string;
};

// O arquivo-fonte veio com acentuação corrompida (UTF-8 relido como
// Latin-1, ex: "ç" -> "Ã§"). Reencodar como Latin-1 e decodificar como
// UTF-8 recupera o texto original.
function corrigirMojibake(texto: string): string {
  return Buffer.from(texto, "latin1").toString("utf8");
}

function campo(linha: CsvLinha, nome: string): string {
  return (linha[nome] ?? "").trim();
}

function parseCentavos(valor: string): number | null {
  const bruto = valor.trim();
  const negativo = bruto.startsWith("-");
  const limpo = bruto
    .replace(/^-/, "")
    .replace(/^R\$\s*/i, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!limpo) return null;
  const numero = Number(limpo);
  if (!Number.isFinite(numero)) return null;
  return Math.round((negativo ? -numero : numero) * 100);
}

function parseDataBr(valor: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(valor.trim());
  if (!match) return null;
  const [, dia, mes, ano] = match;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

function tipoBanco(nome: string): TipoBanco {
  const normalizado = nome.toLowerCase();
  if (normalizado.includes("crédito") || normalizado.includes("credito")) {
    return "CARTAO_CREDITO";
  }
  if (normalizado.includes("conta") || normalizado === "voucher") {
    return "CONTA_CORRENTE";
  }
  return "OUTRO";
}

function tipoPessoa(nome: string): TipoPessoa {
  return nome.toLowerCase() === "família" ? "FAMILIA" : "INDIVIDUAL";
}

function gerarHash(linha: Omit<LinhaValida, "hashImportacao">): string {
  return createHash("sha256")
    .update(
      [
        "financas-2025-lancamentos-v1",
        linha.numeroLinha,
        linha.data.toISOString().slice(0, 10),
        linha.descricaoOrigem ?? "",
        linha.descricaoPropria ?? "",
        linha.valorCentavos,
        linha.descontoCentavos,
        linha.categoria ?? "",
        linha.subcategoria ?? "",
        linha.banco,
        linha.divisao,
        linha.pagador,
      ].join("|"),
    )
    .digest("hex");
}

function montarLinhas(csvTexto: string): {
  validas: LinhaValida[];
  ignoradas: { numeroLinha: number; motivo: string }[];
} {
  const linhas = linhasParaObjetos(parseCsv(csvTexto, ";"));
  const validas: LinhaValida[] = [];
  const ignoradas: { numeroLinha: number; motivo: string }[] = [];

  linhas.forEach((linha, indice) => {
    const numeroLinha = indice + 2;
    const data = parseDataBr(campo(linha, "Data"));
    const valorCentavos = parseCentavos(campo(linha, "Valor"));
    const descontoCentavos = parseCentavos(campo(linha, "Desconto")) ?? 0;
    const banco = campo(linha, "Banco");
    const divisao = campo(linha, "Divisão");
    const pagador = campo(linha, "Quem pagou");
    const descricaoOrigem = campo(linha, "Descrição Cartão") || null;
    const descricaoPropria = campo(linha, "Descrição Própria") || null;

    const motivos = [
      !data ? "data inválida" : null,
      valorCentavos === null ? "valor vazio/inválido" : null,
      !banco ? "banco vazio" : null,
      !divisao ? "divisão vazia" : null,
      !pagador ? "pagador vazio" : null,
      !descricaoOrigem && !descricaoPropria ? "descrição vazia" : null,
    ].filter((m): m is string => !!m);

    if (motivos.length > 0) {
      ignoradas.push({ numeroLinha, motivo: motivos.join(", ") });
      return;
    }

    const base = {
      numeroLinha,
      data: data!,
      descricaoOrigem,
      descricaoPropria,
      valorCentavos: valorCentavos!,
      descontoCentavos,
      categoria: campo(linha, "Categoria") || null,
      subcategoria: campo(linha, "Subcategoria") || null,
      banco,
      divisao,
      pagador,
    };
    validas.push({ ...base, hashImportacao: gerarHash(base) });
  });

  return { validas, ignoradas };
}

async function main() {
  const household = await prisma.household.findUnique({
    where: { nome: HOUSEHOLD_NOME },
  });
  if (!household)
    throw new Error(`Household não encontrado: ${HOUSEHOLD_NOME}`);

  const csvTextoBruto = readFileSync(CSV_PATH, "utf8");
  const csvTexto = corrigirMojibake(csvTextoBruto);
  const { validas, ignoradas } = montarLinhas(csvTexto);

  const bancos = [...new Set(validas.map((l) => l.banco))].sort();
  const pessoas = [
    ...new Set(validas.flatMap((l) => [l.divisao, l.pagador])),
  ].sort();
  const categorias = [
    ...new Set(
      validas.map((l) => l.categoria).filter((c): c is string => Boolean(c)),
    ),
  ].sort();

  console.log(`Arquivo: ${CSV_PATH}`);
  console.log(`Household: ${household.nome}`);
  console.log(`Linhas válidas: ${validas.length}`);
  console.log(`Linhas ignoradas: ${ignoradas.length}`);
  console.log(`Bancos: ${bancos.join(", ")}`);
  console.log(`Pessoas/grupos: ${pessoas.join(", ")}`);
  console.log(`Categorias: ${categorias.join(", ")}`);

  if (!APPLY) {
    console.log("Modo simulação. Rode com --apply para gravar.");
    if (ignoradas.length > 0) {
      console.log("Linhas ignoradas:");
      for (const linha of ignoradas) {
        console.log(`- ${linha.numeroLinha}: ${linha.motivo}`);
      }
    }
    return;
  }

  const bancoPorNome = new Map<string, string>();
  for (const nome of bancos) {
    const banco = await prisma.banco.upsert({
      where: { householdId_nome: { householdId: household.id, nome } },
      update: { ativo: true },
      create: {
        nome,
        tipo: tipoBanco(nome),
        householdId: household.id,
      },
    });
    bancoPorNome.set(nome, banco.id);
  }

  const pessoaPorNome = new Map<string, string>();
  for (const nome of pessoas) {
    const pessoa = await prisma.pessoa.upsert({
      where: { householdId_nome: { householdId: household.id, nome } },
      update: {},
      create: {
        nome,
        tipo: tipoPessoa(nome),
        householdId: household.id,
      },
    });
    pessoaPorNome.set(nome, pessoa.id);
  }

  const individuais = await prisma.pessoa.findMany({
    where: { householdId: household.id, tipo: "INDIVIDUAL" },
    select: { id: true },
  });
  const familiaId = pessoaPorNome.get("Família");
  if (familiaId) {
    for (const pessoa of individuais) {
      await prisma.integranteGrupo.upsert({
        where: {
          grupoId_pessoaId: { grupoId: familiaId, pessoaId: pessoa.id },
        },
        update: {},
        create: {
          grupoId: familiaId,
          pessoaId: pessoa.id,
          householdId: household.id,
          peso: 100,
        },
      });
    }
  }

  const categoriaPorNome = new Map<string, string>();
  const subcategoriaPorChave = new Map<string, string>();
  for (const nome of categorias) {
    const categoria = await prisma.categoria.upsert({
      where: { householdId_nome: { householdId: household.id, nome } },
      update: { ativo: true },
      create: { nome, householdId: household.id },
    });
    categoriaPorNome.set(nome, categoria.id);
  }

  const paresSubcategoria = [
    ...new Set(
      validas
        .filter((l) => l.categoria && l.subcategoria)
        .map((l) => `${l.categoria}::${l.subcategoria}`),
    ),
  ].sort();
  for (const par of paresSubcategoria) {
    const [categoriaNome, subcategoriaNome] = par.split("::");
    const categoriaId = categoriaPorNome.get(categoriaNome);
    if (!categoriaId) continue;
    const subcategoria = await prisma.subcategoria.upsert({
      where: {
        categoriaId_nome: {
          categoriaId,
          nome: subcategoriaNome,
        },
      },
      update: { ativo: true },
      create: {
        nome: subcategoriaNome,
        categoriaId,
        householdId: household.id,
      },
    });
    subcategoriaPorChave.set(par, subcategoria.id);
  }

  const dados = validas.map((linha) => ({
    data: linha.data,
    descricaoOrigem: linha.descricaoOrigem,
    descricaoPropria: linha.descricaoPropria,
    valorCentavos: linha.valorCentavos,
    descontoCentavos: linha.descontoCentavos,
    categoriaId: linha.categoria
      ? (categoriaPorNome.get(linha.categoria) ?? null)
      : null,
    subcategoriaId:
      linha.categoria && linha.subcategoria
        ? (subcategoriaPorChave.get(
            `${linha.categoria}::${linha.subcategoria}`,
          ) ?? null)
        : null,
    bancoId: bancoPorNome.get(linha.banco)!,
    pessoaDivisaoId: pessoaPorNome.get(linha.divisao)!,
    pessoaPagouId: pessoaPorNome.get(linha.pagador)!,
    householdId: household.id,
    hashImportacao: linha.hashImportacao,
  }));

  const resultado = await prisma.lancamento.createMany({
    data: dados,
    skipDuplicates: true,
  });

  console.log(`Lançamentos criados: ${resultado.count}`);
  console.log(`Duplicados ignorados: ${dados.length - resultado.count}`);
  if (ignoradas.length > 0) {
    console.log("Primeiras linhas ignoradas:");
    for (const linha of ignoradas.slice(0, 10)) {
      console.log(`- ${linha.numeroLinha}: ${linha.motivo}`);
    }
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
