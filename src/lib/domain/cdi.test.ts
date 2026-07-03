import { afterEach, describe, expect, it, vi } from "vitest";
import { buscarCdiMensalBCB } from "./cdi";

describe("buscarCdiMensalBCB", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("converte a resposta da API do BCB (série 4391) para CDI mensal por mês", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { data: "01/01/2026", valor: "0.96" },
        { data: "01/02/2026", valor: "0.95" },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const resultado = await buscarCdiMensalBCB(
      new Date(Date.UTC(2026, 0, 1)),
      new Date(Date.UTC(2026, 1, 1)),
    );

    expect(resultado).toEqual([
      { mes: new Date(Date.UTC(2026, 0, 1)), percentual: 0.96 },
      { mes: new Date(Date.UTC(2026, 1, 1)), percentual: 0.95 },
    ]);

    const urlChamada = new URL(fetchMock.mock.calls[0][0] as string);
    expect(urlChamada.origin + urlChamada.pathname).toBe(
      "https://api.bcb.gov.br/dados/serie/bcdata.sgs.4391/dados",
    );
    expect(urlChamada.searchParams.get("dataInicial")).toBe("01/01/2026");
    expect(urlChamada.searchParams.get("dataFinal")).toBe("01/02/2026");
  });

  it("lança erro quando a API do BCB responde com status de erro", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(
      buscarCdiMensalBCB(
        new Date(Date.UTC(2026, 0, 1)),
        new Date(Date.UTC(2026, 1, 1)),
      ),
    ).rejects.toThrow(/BCB/);
  });
});
