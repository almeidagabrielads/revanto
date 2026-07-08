import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";

export const TipoPessoaSchema = z.enum([
  "INDIVIDUAL",
  "CASAL",
  "FAMILIA",
  "OUTRO",
]);

// Tipos de Pessoa que podem ter integrantes (composição de grupo).
const TIPOS_GRUPO = ["CASAL", "FAMILIA"] as const;

export const CriarPessoaSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  tipo: TipoPessoaSchema,
});

export const AtualizarPessoaSchema = CriarPessoaSchema.partial();

export type CriarPessoaInput = z.infer<typeof CriarPessoaSchema>;
export type AtualizarPessoaInput = z.infer<typeof AtualizarPessoaSchema>;

export const IntegranteInputSchema = z.object({
  pessoaId: z.string().trim().min(1, "Pessoa é obrigatória."),
  peso: z.number().int("Peso deve ser um inteiro.").positive("Peso deve ser positivo."),
});

export const DefinirIntegrantesSchema = z.array(IntegranteInputSchema);

export type IntegranteInput = z.infer<typeof IntegranteInputSchema>;
export type DefinirIntegrantesInput = z.infer<typeof DefinirIntegrantesSchema>;

export function listarPessoas(prisma: PrismaClient, householdId: string) {
  return prisma.pessoa.findMany({
    where: { householdId },
    orderBy: { nome: "asc" },
    include: { integrantes: { select: { pessoaId: true, peso: true } } },
  });
}

export function buscarPessoa(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.pessoa.findFirst({ where: { id, householdId } });
}

export function criarPessoa(
  prisma: PrismaClient,
  householdId: string,
  input: CriarPessoaInput,
) {
  return prisma.pessoa.create({
    data: { ...input, householdId },
  });
}

export async function atualizarPessoa(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarPessoaInput,
) {
  const existente = await buscarPessoa(prisma, householdId, id);
  if (!existente) return null;

  // Mudar o tipo pode invalidar composições de grupo já cadastradas: uma
  // pessoa que deixa de ser CASAL/FAMILIA não pode mais ter integrantes; uma
  // pessoa que deixa de ser INDIVIDUAL não pode mais integrar outros grupos.
  const tipoVirouIndividual =
    input.tipo === "INDIVIDUAL" && existente.tipo !== "INDIVIDUAL";
  const tipoDeixouDeSerIndividual =
    !!input.tipo && input.tipo !== "INDIVIDUAL" && existente.tipo === "INDIVIDUAL";

  if (!tipoVirouIndividual && !tipoDeixouDeSerIndividual) {
    return prisma.pessoa.update({ where: { id }, data: input });
  }

  const [pessoa] = await prisma.$transaction([
    prisma.pessoa.update({ where: { id }, data: input }),
    prisma.integranteGrupo.deleteMany({
      where: tipoVirouIndividual ? { grupoId: id } : { pessoaId: id },
    }),
  ]);
  return pessoa;
}

export async function removerPessoa(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarPessoa(prisma, householdId, id);
  if (!existente) return null;

  return prisma.pessoa.delete({ where: { id } });
}

export function listarIntegrantes(
  prisma: PrismaClient,
  householdId: string,
  grupoId: string,
) {
  return prisma.integranteGrupo.findMany({
    where: { grupoId, householdId },
    select: { pessoaId: true, peso: true },
  });
}

/**
 * Substitui por completo a composição de um grupo (CASAL/FAMILIA). Retorna
 * `null` se o grupo não existir, não for do tipo CASAL/FAMILIA, se algum
 * `pessoaId` não for uma pessoa INDIVIDUAL do mesmo household, ou se houver
 * `pessoaId` duplicado na lista.
 */
export async function definirIntegrantes(
  prisma: PrismaClient,
  householdId: string,
  grupoId: string,
  integrantes: DefinirIntegrantesInput,
) {
  const grupo = await prisma.pessoa.findFirst({
    where: { id: grupoId, householdId },
  });
  if (!grupo || !(TIPOS_GRUPO as readonly string[]).includes(grupo.tipo)) {
    return null;
  }

  const pessoaIds = integrantes.map((i) => i.pessoaId);
  if (new Set(pessoaIds).size !== pessoaIds.length) return null;

  if (pessoaIds.length > 0) {
    const individuais = await prisma.pessoa.findMany({
      where: { householdId, tipo: "INDIVIDUAL", id: { in: pessoaIds } },
      select: { id: true },
    });
    if (individuais.length !== pessoaIds.length) return null;
  }

  await prisma.$transaction([
    prisma.integranteGrupo.deleteMany({ where: { grupoId, householdId } }),
    ...(integrantes.length > 0
      ? [
          prisma.integranteGrupo.createMany({
            data: integrantes.map((i) => ({
              grupoId,
              pessoaId: i.pessoaId,
              peso: i.peso,
              householdId,
            })),
          }),
        ]
      : []),
  ]);

  return listarIntegrantes(prisma, householdId, grupoId);
}

/**
 * Resolve uma referência de Pessoa para o conjunto de pessoas INDIVIDUAL por
 * trás dela: ela mesma, se já for INDIVIDUAL (ou não for encontrada); ou ela
 * e todos os seus integrantes, se for um grupo (CASAL/FAMILIA). Usado para
 * agregar métricas (ex.: renda) de um grupo a partir de seus integrantes.
 */
export async function resolverPessoasEfetivas(
  prisma: PrismaClient,
  householdId: string,
  pessoaId: string,
): Promise<string[]> {
  const pessoa = await prisma.pessoa.findFirst({
    where: { id: pessoaId, householdId },
    select: { tipo: true, integrantes: { select: { pessoaId: true } } },
  });
  if (!pessoa || pessoa.tipo === "INDIVIDUAL") return [pessoaId];
  return [pessoaId, ...pessoa.integrantes.map((i) => i.pessoaId)];
}

/**
 * Para uma pessoa INDIVIDUAL, retorna a fração (0–1) que ela representa em
 * cada grupo (CASAL/FAMILIA) do qual participa — peso dela sobre a soma dos
 * pesos do grupo. Usado para atribuir a cada pessoa sua parte proporcional de
 * um gasto lançado no grupo (ex.: "Gastos totais" de alguém = seus gastos
 * diretos + a fração que lhe cabe dos gastos do grupo), o mesmo peso usado no
 * acerto de contas (ver split.ts).
 */
export async function resolverFracaoPorGrupo(
  prisma: PrismaClient,
  householdId: string,
  pessoaId: string,
): Promise<Map<string, number>> {
  const participacoes = await prisma.integranteGrupo.findMany({
    where: { householdId, pessoaId },
    select: {
      grupoId: true,
      peso: true,
      grupo: { select: { integrantes: { select: { peso: true } } } },
    },
  });

  const fracaoPorGrupo = new Map<string, number>();
  for (const p of participacoes) {
    const somaPesos = p.grupo.integrantes.reduce((s, i) => s + i.peso, 0);
    if (somaPesos > 0) {
      fracaoPorGrupo.set(p.grupoId, p.peso / somaPesos);
    }
  }
  return fracaoPorGrupo;
}
