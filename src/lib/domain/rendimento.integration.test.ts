import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { limparBanco, prismaTest } from "@/test/prisma";
import { criarPessoa } from "./pessoas";
import { criarBanco } from "./bancos";
import { criarPosicaoPatrimonio } from "./patrimonio";
import { buscarHistoricoRendimento } from "./rendimento";

async function criarHousehold(nome = "Isa & Gabi") {
  return prismaTest.household.create({ data: { nome } });
}

beforeAll(async () => {
  await limparBanco();
});

afterEach(async () => {
  await limparBanco();
  vi.unstubAllGlobals();
});

afterAll(async () => {
  await prismaTest.$disconnect();
});

describe("buscarHistoricoRendimento", () => {
  it("agrega posições de múltiplos bancos por mês e cruza com o CDI cacheado", async () => {
    const household = await criarHousehold();
    const isa = await criarPessoa(prismaTest, household.id, {
      nome: "Isa",
      tipo: "INDIVIDUAL",
    });
    const xp = await criarBanco(prismaTest, household.id, {
      nome: "XP",
      tipo: "CORRETORA",
    });
    const itau = await criarBanco(prismaTest, household.id, {
      nome: "Itaú",
      tipo: "CONTA_CORRENTE",
    });

    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: xp.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 600_000_00,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: itau.id,
      pessoaId: isa.id,
      mes: new Date("2026-01-01"),
      valorCentavos: 20_000_00,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: xp.id,
      pessoaId: isa.id,
      mes: new Date("2026-02-01"),
      valorCentavos: 610_000_00,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: itau.id,
      pessoaId: isa.id,
      mes: new Date("2026-02-01"),
      valorCentavos: 24_000_00,
    });

    // Pré-populando o CDI para não depender de rede no teste.
    await prismaTest.cdiMensal.createMany({
      data: [
        { mes: new Date(Date.UTC(2026, 0, 1)), percentual: 0.96 },
        { mes: new Date(Date.UTC(2026, 1, 1)), percentual: 0.95 },
      ],
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const historico = await buscarHistoricoRendimento(
      prismaTest,
      household.id,
      {
        ano: 2026,
        pessoaId: isa.id,
      },
    );

    // Não deveria bater na API externa: todos os meses já estavam em cache.
    expect(fetchMock).not.toHaveBeenCalled();

    expect(historico).toHaveLength(2);
    expect(historico[0].posicaoCentavos).toBe(620_000_00);
    expect(historico[1].posicaoCentavos).toBe(634_000_00);
    expect(historico[1].variacaoCentavos).toBe(14_000_00);
    expect(historico[1].cdiMensalPercentual).toBe(0.95);
    // esperado(Fev) = posição(Jan) × CDI(Fev) × 100% = 620_000_00 × 0,95% = 589.000
    expect(historico[1].rendimentoMensalEsperadoCentavos).toBe(589_000);
  });

  it("omite meses sem posição lançada, em vez de assumir zero", async () => {
    const household = await criarHousehold();
    const banco = await criarBanco(prismaTest, household.id, {
      nome: "XP",
      tipo: "CORRETORA",
    });

    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      mes: new Date("2026-03-01"),
      valorCentavos: 100_000_00,
    });
    await criarPosicaoPatrimonio(prismaTest, household.id, {
      bancoId: banco.id,
      mes: new Date("2026-06-01"),
      valorCentavos: 110_000_00,
    });
    await prismaTest.cdiMensal.createMany({
      data: [
        { mes: new Date(Date.UTC(2026, 2, 1)), percentual: 0.9 },
        { mes: new Date(Date.UTC(2026, 3, 1)), percentual: 0.9 },
        { mes: new Date(Date.UTC(2026, 4, 1)), percentual: 0.9 },
        { mes: new Date(Date.UTC(2026, 5, 1)), percentual: 0.9 },
      ],
    });
    vi.stubGlobal("fetch", vi.fn());

    const historico = await buscarHistoricoRendimento(
      prismaTest,
      household.id,
      {
        ano: 2026,
      },
    );

    expect(historico).toHaveLength(2);
    expect(historico[0].mes.getUTCMonth()).toBe(2);
    expect(historico[1].mes.getUTCMonth()).toBe(5);
    expect(historico[1].variacaoCentavos).toBe(10_000_00);
  });
});
