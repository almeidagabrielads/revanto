import { config } from "dotenv";
config({ path: ".env.local", override: true });
config({ path: ".env" });

import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
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
    },
    {
      nome: "Gabi",
      email: "gabi@example.com",
      senha: process.env.SEED_SENHA_GABI ?? "gabi-senha-provisoria",
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
      update: {},
      create: {
        email: p.email,
        nome: p.nome,
        passwordHash,
        householdId: household.id,
      },
    });
  }

  for (const c of categoriasSeed) {
    const categoria = await prisma.categoria.upsert({
      where: { householdId_nome: { householdId: household.id, nome: c.nome } },
      update: { percentualOrcamento: c.percentualOrcamento },
      create: {
        nome: c.nome,
        percentualOrcamento: c.percentualOrcamento,
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

  console.log(`Seed concluído para o household "${household.nome}".`);
}

// Categorias e subcategorias reais, extraídas de docs/planilha-origem/Financas-2026/Orçamento.html
// e docs/planilha-origem/Financas-2026/Sum (Categoria).html.
const categoriasSeed: {
  nome: string;
  percentualOrcamento: number;
  subcategorias: string[];
}[] = [
  {
    nome: "Alimentação",
    percentualOrcamento: 20,
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
    percentualOrcamento: 25,
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
    percentualOrcamento: 2,
    subcategorias: [
      "Presentes",
      "Contribuições",
      "Casamento",
      "Outros-Diversos",
    ],
  },
  {
    nome: "Educação/Trabalho",
    percentualOrcamento: 4,
    subcategorias: [
      "Livros",
      "Cursos",
      "Assinaturas-Trabalho/educ",
      "Infraestrutura",
    ],
  },
  {
    nome: "Higiene Pessoal",
    percentualOrcamento: 2,
    subcategorias: [
      "Cabelo",
      "Sabonete",
      "Depilação",
      "Outros-Higiene Pessoal",
    ],
  },
  {
    nome: "Lazer",
    percentualOrcamento: 5,
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
    percentualOrcamento: 3,
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
    percentualOrcamento: 7,
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
    percentualOrcamento: 2,
    subcategorias: ["Imposto de renda", "Seguros", "Anuidade/Multas"],
  },
  {
    nome: "Transporte",
    percentualOrcamento: 12,
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
    percentualOrcamento: 3,
    subcategorias: ["Sapatos", "Acessórios", "Roupas"],
  },
  {
    nome: "Viagem",
    percentualOrcamento: 15,
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
