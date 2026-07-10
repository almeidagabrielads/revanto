import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import {
  atualizarPessoa,
  buscarPessoa,
  criarPessoa,
  definirIntegrantes,
  listarPessoas,
  removerPessoa,
  resolverPessoasEfetivas,
} from "./pessoas";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

beforeAll(async () => {
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("criarPessoa", () => {
  it("cria pessoa vinculada ao household", async () => {
    const h = await criarHousehold();
    const pessoa = await criarPessoa(prismaTest, h.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });

    expect(pessoa.householdId).toBe(h.id);
    expect(pessoa.tipo).toBe("INDIVIDUAL");
  });
});

describe("listarPessoas", () => {
  it("lista apenas pessoas do household informado", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    await criarPessoa(prismaTest, h1.id, { nome: "Gabi", tipo: "INDIVIDUAL" });
    await criarPessoa(prismaTest, h2.id, { nome: "Isa", tipo: "INDIVIDUAL" });

    const pessoasH1 = await listarPessoas(prismaTest, h1.id);
    expect(pessoasH1).toHaveLength(1);
    expect(pessoasH1[0].nome).toBe("Gabi");
  });

  it("ordena por nome", async () => {
    const h = await criarHousehold();
    await criarPessoa(prismaTest, h.id, { nome: "Zeca", tipo: "OUTRO" });
    await criarPessoa(prismaTest, h.id, { nome: "Ana", tipo: "OUTRO" });

    const pessoas = await listarPessoas(prismaTest, h.id);
    expect(pessoas.map((p) => p.nome)).toEqual(["Ana", "Zeca"]);
  });
});

describe("buscarPessoa", () => {
  it("não retorna pessoa de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const pessoa = await criarPessoa(prismaTest, h1.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });

    const resultado = await buscarPessoa(prismaTest, h2.id, pessoa.id);
    expect(resultado).toBeNull();
  });
});

describe("atualizarPessoa", () => {
  it("atualiza tipo de titularidade", async () => {
    const h = await criarHousehold();
    const pessoa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const atualizado = await atualizarPessoa(prismaTest, h.id, pessoa.id, {
      tipo: "CASAL",
    });

    expect(atualizado?.tipo).toBe("CASAL");
  });

  it("retorna null ao tentar atualizar pessoa de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const pessoa = await criarPessoa(prismaTest, h1.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });

    const resultado = await atualizarPessoa(prismaTest, h2.id, pessoa.id, {
      nome: "Invasor",
    });
    expect(resultado).toBeNull();
  });
});

describe("removerPessoa", () => {
  it("remove pessoa do household", async () => {
    const h = await criarHousehold();
    const pessoa = await criarPessoa(prismaTest, h.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });

    const removida = await removerPessoa(prismaTest, h.id, pessoa.id);
    expect(removida?.id).toBe(pessoa.id);

    const pessoas = await listarPessoas(prismaTest, h.id);
    expect(pessoas).toHaveLength(0);
  });

  it("retorna null ao tentar remover pessoa de outro household", async () => {
    const h1 = await criarHousehold("Casa A");
    const h2 = await criarHousehold("Casa B");
    const pessoa = await criarPessoa(prismaTest, h1.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });

    const resultado = await removerPessoa(prismaTest, h2.id, pessoa.id);
    expect(resultado).toBeNull();

    const pessoas = await listarPessoas(prismaTest, h1.id);
    expect(pessoas).toHaveLength(1);
  });
});

describe("definirIntegrantes", () => {
  async function montarGrupo() {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const gabi = await criarPessoa(prismaTest, h.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });
    const familia = await criarPessoa(prismaTest, h.id, {
      nome: "Família",
      tipo: "FAMILIA",
    });
    return { h, isa, gabi, familia };
  }

  it("substitui a composição por completo ao ser chamada de novo", async () => {
    const { h, isa, gabi, familia } = await montarGrupo();

    await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 100 },
    ]);
    const primeira = await listarPessoas(prismaTest, h.id);
    expect(
      primeira.find((p) => p.id === familia.id)?.integrantesDoGrupo,
    ).toEqual([{ pessoaId: isa.id, peso: 100 }]);

    await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 60 },
      { pessoaId: gabi.id, peso: 40 },
    ]);
    const segunda = await listarPessoas(prismaTest, h.id);
    const integrantes = segunda.find((p) => p.id === familia.id)?.integrantesDoGrupo;
    expect(integrantes).toHaveLength(2);
    expect(integrantes).toEqual(
      expect.arrayContaining([
        { pessoaId: isa.id, peso: 60 },
        { pessoaId: gabi.id, peso: 40 },
      ]),
    );
  });

  it("rejeita grupo de outro household", async () => {
    const { isa, familia } = await montarGrupo();
    const outraCasa = await criarHousehold("Outra casa");

    const resultado = await definirIntegrantes(
      prismaTest,
      outraCasa.id,
      familia.id,
      [{ pessoaId: isa.id, peso: 100 }],
    );
    expect(resultado).toBeNull();
  });

  it("rejeita pessoa de outro household na lista de integrantes", async () => {
    const { h, familia } = await montarGrupo();
    const outraCasa = await criarHousehold("Outra casa");
    const forasteiro = await criarPessoa(prismaTest, outraCasa.id, {
      nome: "Forasteiro",
      tipo: "INDIVIDUAL",
    });

    const resultado = await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: forasteiro.id, peso: 100 },
    ]);
    expect(resultado).toBeNull();
  });

  it("rejeita pessoaId que não é INDIVIDUAL", async () => {
    const { h, familia } = await montarGrupo();
    const outroGrupo = await criarPessoa(prismaTest, h.id, {
      nome: "Casal",
      tipo: "CASAL",
    });

    const resultado = await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: outroGrupo.id, peso: 100 },
    ]);
    expect(resultado).toBeNull();
  });

  it("rejeita grupoId que é uma pessoa INDIVIDUAL", async () => {
    const { h, isa, gabi } = await montarGrupo();

    const resultado = await definirIntegrantes(prismaTest, h.id, isa.id, [
      { pessoaId: gabi.id, peso: 100 },
    ]);
    expect(resultado).toBeNull();
  });

  it("aceita grupo tipo OUTRO (ex.: república) com múltiplos integrantes", async () => {
    const { h, isa, gabi } = await montarGrupo();
    const republica = await criarPessoa(prismaTest, h.id, {
      nome: "República",
      tipo: "OUTRO",
    });

    const resultado = await definirIntegrantes(prismaTest, h.id, republica.id, [
      { pessoaId: isa.id, peso: 50 },
      { pessoaId: gabi.id, peso: 50 },
    ]);

    expect(resultado).toHaveLength(2);
    expect(resultado).toEqual(
      expect.arrayContaining([
        { pessoaId: isa.id, peso: 50 },
        { pessoaId: gabi.id, peso: 50 },
      ]),
    );
  });

  it("rejeita pessoaId duplicado na lista", async () => {
    const { h, isa, familia } = await montarGrupo();

    const resultado = await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 60 },
      { pessoaId: isa.id, peso: 40 },
    ]);
    expect(resultado).toBeNull();
  });
});

describe("resolverPessoasEfetivas", () => {
  it("retorna a própria pessoa quando ela é INDIVIDUAL", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });

    const resultado = await resolverPessoasEfetivas(prismaTest, h.id, isa.id);
    expect(resultado).toEqual([isa.id]);
  });

  it("retorna o grupo e seus integrantes quando a pessoa é CASAL/FAMILIA", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const gabi = await criarPessoa(prismaTest, h.id, {
      nome: "Gabi",
      tipo: "INDIVIDUAL",
    });
    const familia = await criarPessoa(prismaTest, h.id, {
      nome: "Família",
      tipo: "FAMILIA",
    });
    await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 100 },
      { pessoaId: gabi.id, peso: 100 },
    ]);

    const resultado = await resolverPessoasEfetivas(
      prismaTest,
      h.id,
      familia.id,
    );
    expect(resultado.sort()).toEqual(
      [familia.id, isa.id, gabi.id].sort(),
    );
  });
});

describe("atualizarPessoa — limpeza de composição ao trocar o tipo", () => {
  it("apaga os integrantes ao retipar um grupo para INDIVIDUAL", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const familia = await criarPessoa(prismaTest, h.id, {
      nome: "Família",
      tipo: "FAMILIA",
    });
    await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 100 },
    ]);

    await atualizarPessoa(prismaTest, h.id, familia.id, {
      tipo: "INDIVIDUAL",
    });

    const restantes = await prismaTest.integranteGrupo.findMany({
      where: { grupoId: familia.id },
    });
    expect(restantes).toHaveLength(0);
  });

  it("apaga a participação ao retipar uma pessoa INDIVIDUAL para OUTRO", async () => {
    const h = await criarHousehold();
    const isa = await criarPessoa(prismaTest, h.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const familia = await criarPessoa(prismaTest, h.id, {
      nome: "Família",
      tipo: "FAMILIA",
    });
    await definirIntegrantes(prismaTest, h.id, familia.id, [
      { pessoaId: isa.id, peso: 100 },
    ]);

    await atualizarPessoa(prismaTest, h.id, isa.id, { tipo: "OUTRO" });

    const restantes = await prismaTest.integranteGrupo.findMany({
      where: { pessoaId: isa.id },
    });
    expect(restantes).toHaveLength(0);
  });
});
