import * as z from "zod";
import type { PrismaClient } from "@/generated/prisma/client";
import { hashPassword } from "@/lib/auth/password";

export const PapelUsuarioSchema = z.enum([
  "PROPRIETARIO",
  "ADMIN",
  "EDITOR",
  "VISUALIZADOR",
]);

export type PapelUsuario = z.infer<typeof PapelUsuarioSchema>;

// Papéis com permissão para convidar/editar/remover outros membros.
export const PAPEIS_GESTORES: PapelUsuario[] = ["PROPRIETARIO", "ADMIN"];

export const ConvidarMembroSchema = z.object({
  nome: z.string().trim().min(1, "Nome é obrigatório."),
  email: z.email(),
  password: z.string().min(8, "A senha precisa de pelo menos 8 caracteres."),
  role: PapelUsuarioSchema.exclude(["PROPRIETARIO"]).default("EDITOR"),
});

export const AtualizarMembroSchema = z.object({
  role: PapelUsuarioSchema.exclude(["PROPRIETARIO"]),
});

export type ConvidarMembroInput = z.infer<typeof ConvidarMembroSchema>;
export type AtualizarMembroInput = z.infer<typeof AtualizarMembroSchema>;

const SELECT_MEMBRO = {
  id: true,
  nome: true,
  email: true,
  role: true,
  lastLoginAt: true,
  lastSeenAt: true,
  lastDevice: true,
  createdAt: true,
} as const;

export function listarMembros(prisma: PrismaClient, householdId: string) {
  return prisma.user.findMany({
    where: { householdId },
    select: SELECT_MEMBRO,
    orderBy: { createdAt: "asc" },
  });
}

export function buscarMembro(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  return prisma.user.findFirst({ where: { id, householdId } });
}

export async function convidarMembro(
  prisma: PrismaClient,
  householdId: string,
  input: ConvidarMembroInput,
) {
  const emailExiste = await prisma.user.findUnique({
    where: { email: input.email },
  });
  if (emailExiste) return "EMAIL_EM_USO" as const;

  const passwordHash = await hashPassword(input.password);
  return prisma.user.create({
    data: {
      nome: input.nome,
      email: input.email,
      passwordHash,
      role: input.role,
      householdId,
    },
    select: SELECT_MEMBRO,
  });
}

export async function atualizarPapelMembro(
  prisma: PrismaClient,
  householdId: string,
  id: string,
  input: AtualizarMembroInput,
) {
  const existente = await buscarMembro(prisma, householdId, id);
  if (!existente) return null;
  if (existente.role === "PROPRIETARIO") return "PROPRIETARIO_FIXO" as const;

  return prisma.user.update({
    where: { id },
    data: { role: input.role },
    select: SELECT_MEMBRO,
  });
}

export async function removerMembro(
  prisma: PrismaClient,
  householdId: string,
  id: string,
) {
  const existente = await buscarMembro(prisma, householdId, id);
  if (!existente) return null;
  if (existente.role === "PROPRIETARIO") return "PROPRIETARIO_FIXO" as const;

  return prisma.user.delete({ where: { id } });
}
