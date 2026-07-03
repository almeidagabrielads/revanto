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
import { obterCdiMensal } from "./cdi";

function stubFetchBCB(resposta: { data: string; valor: string }[]) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => resposta,
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

describe("obterCdiMensal", () => {
  it("busca da API do BCB e grava em cache quando não há dado local", async () => {
    const fetchMock = stubFetchBCB([
      { data: "01/01/2026", valor: "0.96" },
      { data: "01/02/2026", valor: "0.95" },
    ]);

    const resultado = await obterCdiMensal(
      prismaTest,
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 1, 1)),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado.map((r) => Number(r.percentual))).toEqual([0.96, 0.95]);

    const emCache = await prismaTest.cdiMensal.findMany();
    expect(emCache).toHaveLength(2);
  });

  it("não chama a API do BCB quando todos os meses já estão em cache", async () => {
    await prismaTest.cdiMensal.create({
      data: { mes: new Date(Date.UTC(2026, 0, 1)), percentual: 0.96 },
    });
    const fetchMock = stubFetchBCB([]);

    const resultado = await obterCdiMensal(
      prismaTest,
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 0, 1)),
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(resultado).toHaveLength(1);
    expect(Number(resultado[0].percentual)).toBe(0.96);
  });

  it("busca só os meses faltantes quando parte do período já está em cache", async () => {
    await prismaTest.cdiMensal.create({
      data: { mes: new Date(Date.UTC(2026, 0, 1)), percentual: 0.96 },
    });
    const fetchMock = stubFetchBCB([
      { data: "01/01/2026", valor: "0.96" },
      { data: "01/02/2026", valor: "0.95" },
    ]);

    const resultado = await obterCdiMensal(
      prismaTest,
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 1, 1)),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resultado).toHaveLength(2);
  });
});
