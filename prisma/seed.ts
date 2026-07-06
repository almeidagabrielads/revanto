import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type TipoBanco } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL não definida");

const pool = new Pool({ connectionString: url });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const household = await prisma.household.upsert({
    where: { nome: "Isa & Gabi" },
    update: {},
    create: { nome: "Isa & Gabi" },
  });

  const pessoas = [
    {
      nome: "Isa",
      email: "isa@example.com",
      senha: process.env.SEED_SENHA_ISA ?? "isa-senha-provisoria",
      role: "PROPRIETARIO" as const,
    },
    {
      nome: "Gabi",
      email: "gabi@example.com",
      senha: process.env.SEED_SENHA_GABI ?? "gabi-senha-provisoria",
      role: "ADMIN" as const,
    },
  ];

  for (const p of pessoas) {
    await prisma.pessoa.upsert({
      where: { householdId_nome: { householdId: household.id, nome: p.nome } },
      update: {},
      create: { nome: p.nome, tipo: "INDIVIDUAL", householdId: household.id },
    });

    const passwordHash = await hashPassword(p.senha);
    await prisma.user.upsert({
      where: { email: p.email },
      update: { role: p.role },
      create: {
        email: p.email,
        nome: p.nome,
        passwordHash,
        householdId: household.id,
        role: p.role,
      },
    });
  }

  for (const c of categoriasSeed) {
    const categoria = await prisma.categoria.upsert({
      where: { householdId_nome: { householdId: household.id, nome: c.nome } },
      update: {},
      create: {
        nome: c.nome,
        householdId: household.id,
      },
    });

    for (const nomeSubcategoria of c.subcategorias) {
      await prisma.subcategoria.upsert({
        where: {
          categoriaId_nome: {
            categoriaId: categoria.id,
            nome: nomeSubcategoria,
          },
        },
        update: {},
        create: {
          nome: nomeSubcategoria,
          categoriaId: categoria.id,
          householdId: household.id,
        },
      });
    }
  }

  for (const b of bancosSeed) {
    await prisma.banco.upsert({
      where: { householdId_nome: { householdId: household.id, nome: b.nome } },
      update: { tipo: b.tipo },
      create: { nome: b.nome, tipo: b.tipo, householdId: household.id },
    });
  }

  console.log(`Seed concluído para o household "${household.nome}".`);
}

// Categorias e subcategorias reais, extraídas de docs/planilha-origem/Financas-2026/Orçamento.html
// e docs/planilha-origem/Financas-2026/Sum (Categoria).html.
const categoriasSeed: {
  nome: string;
  subcategorias: string[];
}[] = [
  {
    nome: "Alimentação",
    subcategorias: [
      "Assinaturas-Alimentação",
      "Café",
      "Restaurante",
      "Supermercado",
      "Delivery",
    ],
  },
  {
    nome: "Casa",
    subcategorias: [
      "Aluguel/Condomínio",
      "Energia",
      "Gás",
      "Internet",
      "Faxina",
      "Utensílios/Móveis",
      "Celular",
      "Outros-Catete",
    ],
  },
  {
    nome: "Diversos",
    subcategorias: [
      "Presentes",
      "Contribuições",
      "Casamento",
      "Outros-Diversos",
    ],
  },
  {
    nome: "Educação/Trabalho",
    subcategorias: [
      "Livros",
      "Cursos",
      "Assinaturas-Trabalho/educ",
      "Infraestrutura",
    ],
  },
  {
    nome: "Higiene Pessoal",
    subcategorias: [
      "Cabelo",
      "Sabonete",
      "Depilação",
      "Outros-Higiene Pessoal",
    ],
  },
  {
    nome: "Lazer",
    subcategorias: [
      "Bar",
      "Passeio-Lazer",
      "Bebida",
      "Ingresso",
      "Streaming",
      "Outros-Lazer",
    ],
  },
  {
    nome: "Pet",
    subcategorias: [
      "Passeio/Hospedagem",
      "Ração",
      "Banho",
      "Saúde-Pet",
      "Tapete",
      "Outros-Pet",
    ],
  },
  {
    nome: "Saúde",
    subcategorias: [
      "Plano de Saúde",
      "Assinatura-Saúde",
      "Futebol",
      "Farmácia",
      "Médico",
      "Outros-Saúde",
    ],
  },
  {
    nome: "Taxas",
    subcategorias: ["Imposto de renda", "Seguros", "Anuidade/Multas"],
  },
  {
    nome: "Transporte",
    subcategorias: [
      "Uber/99/Taxi",
      "Assinatura-Transporte",
      "Combustível",
      "Estacionamento",
      "Gorjeta",
      "Coletivo",
      "Manutenção",
      "Limpeza",
      "Pedágio/Sem Parar",
      "IPVA",
      "Seguro",
    ],
  },
  {
    nome: "Vestimenta",
    subcategorias: ["Sapatos", "Acessórios", "Roupas"],
  },
  {
    nome: "Viagem",
    subcategorias: [
      "Assinatura-Viagem",
      "Passagem",
      "Transporte",
      "Hospedagem",
      "Passeio-Viagem",
      "Alimentação-Viagem",
      "Outros-Viagem",
    ],
  },
];

// Bancos/meios de pagamento reais, extraídos da coluna "Banco" de
// docs/planilha-origem/Financas-2026/Lançamentos.html (cartões usados nos
// lançamentos) e das colunas "Banco" de Histórico Patrimônio.html /
// Liquidez investimentos.html (instituições usadas para investimentos).
const bancosSeed: { nome: string; tipo: TipoBanco }[] = [
  { nome: "BB Crédito", tipo: "CARTAO_CREDITO" },
  { nome: "Itaú Crédito", tipo: "CARTAO_CREDITO" },
  { nome: "Nubank Crédito", tipo: "CARTAO_CREDITO" },
  { nome: "Itaú", tipo: "CONTA_CORRENTE" },
  { nome: "Nubank", tipo: "CONTA_CORRENTE" },
  { nome: "XP", tipo: "CORRETORA" },
];

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
