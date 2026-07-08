import { describe, expect, it } from "vitest";
import {
  calcularSaldoDivisaoGrupo,
  type LancamentoParaDivisao,
  type ParticipanteDivisao,
} from "./split";

const ISA = "isa";
const GABI = "gabi";
const JADER = "jader"; // terceiro (tipo OUTRO), fora do acerto

function lancamento(
  parcial: Partial<LancamentoParaDivisao>,
): LancamentoParaDivisao {
  return {
    valorCentavos: 0,
    descontoCentavos: 0,
    pessoaDivisaoId: ISA,
    pessoaDivisaoTipo: "INDIVIDUAL",
    pessoaPagouId: ISA,
    ...parcial,
  };
}

function grupo(
  grupoId: string,
  integrantes: ParticipanteDivisao[],
): Map<string, ParticipanteDivisao[]> {
  return new Map([[grupoId, integrantes]]);
}

function saldoDe(
  saldo: ReturnType<typeof calcularSaldoDivisaoGrupo>,
  pessoaId: string,
): number {
  return (
    saldo.saldosPorPessoa.find((s) => s.pessoaId === pessoaId)?.saldoCentavos ??
    0
  );
}

describe("calcularSaldoDivisaoGrupo — casal (2 pessoas)", () => {
  it("gasto compartilhado pago por um: quem pagou pagou metade em nome do outro", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 10_000,
        pessoaDivisaoId: "casal",
        pessoaDivisaoTipo: "CASAL",
        pessoaPagouId: ISA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ISA, GABI],
      grupo("casal", [
        { pessoaId: ISA, peso: 100 },
        { pessoaId: GABI, peso: 100 },
      ]),
    );

    expect(saldoDe(saldo, ISA)).toBe(5_000);
    expect(saldoDe(saldo, GABI)).toBe(-5_000);
    expect(saldo.transferenciasSugeridas).toEqual([
      { deId: GABI, paraId: ISA, valorCentavos: 5_000 },
    ]);
  });

  it("gasto individual pago pelo outro: quem pagou pagou 100% em nome do dono", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 8_000,
        pessoaDivisaoId: ISA,
        pessoaDivisaoTipo: "INDIVIDUAL",
        pessoaPagouId: GABI,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(lancamentos, [ISA, GABI]);

    expect(saldoDe(saldo, GABI)).toBe(8_000);
    expect(saldoDe(saldo, ISA)).toBe(-8_000);
    expect(saldo.transferenciasSugeridas).toEqual([
      { deId: ISA, paraId: GABI, valorCentavos: 8_000 },
    ]);
  });

  it("gasto individual pago pelo próprio dono não gera débito", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 5_000,
        pessoaDivisaoId: ISA,
        pessoaDivisaoTipo: "INDIVIDUAL",
        pessoaPagouId: ISA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(lancamentos, [ISA, GABI]);

    expect(saldoDe(saldo, ISA)).toBe(0);
    expect(saldoDe(saldo, GABI)).toBe(0);
    expect(saldo.transferenciasSugeridas).toEqual([]);
  });

  it("saldo líquido combina vários lançamentos e chega à diferença final", () => {
    const lancamentos = [
      // Isa paga aluguel compartilhado (R$1.000) -> Isa pagou R$500 pela Gabi
      lancamento({
        valorCentavos: 100_000,
        pessoaDivisaoId: "casal",
        pessoaDivisaoTipo: "CASAL",
        pessoaPagouId: ISA,
      }),
      // Gabi paga um gasto individual da Isa (R$80) -> Gabi pagou R$80 pela Isa
      lancamento({
        valorCentavos: 8_000,
        pessoaDivisaoId: ISA,
        pessoaDivisaoTipo: "INDIVIDUAL",
        pessoaPagouId: GABI,
      }),
      // Isa paga um gasto de família (R$200), com desconto de R$20 -> líquido R$180, metade R$90
      lancamento({
        valorCentavos: 20_000,
        descontoCentavos: 2_000,
        pessoaDivisaoId: "familia",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ISA,
      }),
    ];

    const integrantesPorGrupo = new Map([
      ["casal", [{ pessoaId: ISA, peso: 100 }, { pessoaId: GABI, peso: 100 }]],
      ["familia", [{ pessoaId: ISA, peso: 100 }, { pessoaId: GABI, peso: 100 }]],
    ]);

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ISA, GABI],
      integrantesPorGrupo,
    );

    // Isa pagou pela Gabi: 50.000 (metade do aluguel) + 9.000 (metade do gasto de família líquido) = 59.000
    // Menos o que Gabi pagou pela Isa (8.000) => saldo líquido de Isa = 59.000 - 8.000 = 51.000
    expect(saldoDe(saldo, ISA)).toBe(51_000);
    expect(saldoDe(saldo, GABI)).toBe(-51_000);
    expect(saldo.transferenciasSugeridas).toEqual([
      { deId: GABI, paraId: ISA, valorCentavos: 51_000 },
    ]);
  });

  it("divisão tipo OUTRO (terceiro) não entra no acerto", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 15_000,
        pessoaDivisaoId: JADER,
        pessoaDivisaoTipo: "OUTRO",
        pessoaPagouId: ISA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(lancamentos, [ISA, GABI]);

    expect(saldoDe(saldo, ISA)).toBe(0);
    expect(saldoDe(saldo, GABI)).toBe(0);
    expect(saldo.transferenciasSugeridas).toEqual([]);
  });

  it("valor ímpar dividido entre o casal não perde centavo (metades somam o total)", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 101, // R$1,01 -> metades de 51 e 50
        pessoaDivisaoId: "casal",
        pessoaDivisaoTipo: "CASAL",
        pessoaPagouId: GABI,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ISA, GABI],
      grupo("casal", [
        { pessoaId: ISA, peso: 100 },
        { pessoaId: GABI, peso: 100 },
      ]),
    );

    expect(saldoDe(saldo, GABI)).toBe(51);
    expect(saldoDe(saldo, ISA)).toBe(-51);
  });
});

describe("calcularSaldoDivisaoGrupo — grupo sem integrantes cadastrados", () => {
  it("lançamento de um grupo sem integrantes é ignorado, sem erro", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 10_000,
        pessoaDivisaoId: "familia",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ISA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(lancamentos, [ISA, GABI]);

    expect(saldoDe(saldo, ISA)).toBe(0);
    expect(saldoDe(saldo, GABI)).toBe(0);
    expect(saldo.transferenciasSugeridas).toEqual([]);
  });

  it("lançamento de um grupo com lista de integrantes vazia também é ignorado", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 10_000,
        pessoaDivisaoId: "familia",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ISA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ISA, GABI],
      grupo("familia", []),
    );

    expect(saldoDe(saldo, ISA)).toBe(0);
    expect(saldoDe(saldo, GABI)).toBe(0);
  });
});

describe("calcularSaldoDivisaoGrupo — dois grupos distintos no mesmo household", () => {
  const ISA_ID = "isa";
  const GABI_ID = "gabi";
  const CAIO_ID = "caio";

  it("cada grupo usa sua própria composição e peso, sem contaminação cruzada", () => {
    const lancamentos = [
      // "casal" (Isa/Gabi, 100/100) paga aluguel de R$1.000 -> metade cada
      lancamento({
        valorCentavos: 100_000,
        pessoaDivisaoId: "casal",
        pessoaDivisaoTipo: "CASAL",
        pessoaPagouId: ISA_ID,
      }),
      // "republica" (Isa/Caio, 70/30) paga internet de R$100 -> 70/30
      lancamento({
        valorCentavos: 10_000,
        pessoaDivisaoId: "republica",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: CAIO_ID,
      }),
    ];

    const integrantesPorGrupo = new Map([
      [
        "casal",
        [{ pessoaId: ISA_ID, peso: 100 }, { pessoaId: GABI_ID, peso: 100 }],
      ],
      [
        "republica",
        [{ pessoaId: ISA_ID, peso: 70 }, { pessoaId: CAIO_ID, peso: 30 }],
      ],
    ]);

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ISA_ID, GABI_ID, CAIO_ID],
      integrantesPorGrupo,
    );

    // Casal: Isa pagou 100.000, Gabi deve 50.000 a Isa. Gabi não participa da república.
    // República: Caio pagou 10.000, Isa deve 70% (7.000) a Caio.
    expect(saldoDe(saldo, GABI_ID)).toBe(-50_000);
    expect(saldoDe(saldo, ISA_ID)).toBe(50_000 - 7_000);
    expect(saldoDe(saldo, CAIO_ID)).toBe(7_000);
  });
});

describe("calcularSaldoDivisaoGrupo — grupos maiores que 2 pessoas", () => {
  const ANA = "ana";
  const BIA = "bia";
  const CAIO = "caio";

  it("gasto compartilhado por 3 pessoas é dividido em 3 partes iguais", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 9_000,
        pessoaDivisaoId: "casa",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ANA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ANA, BIA, CAIO],
      grupo("casa", [
        { pessoaId: ANA, peso: 100 },
        { pessoaId: BIA, peso: 100 },
        { pessoaId: CAIO, peso: 100 },
      ]),
    );

    expect(saldoDe(saldo, ANA)).toBe(6_000); // pagou pelos outros 2 (3.000 cada)
    expect(saldoDe(saldo, BIA)).toBe(-3_000);
    expect(saldoDe(saldo, CAIO)).toBe(-3_000);
  });

  it("valor não divisível por N distribui o resto sem perder centavos", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 100, // 100 / 3 = 33,33 -> partes 34/33/33
        pessoaDivisaoId: "casa",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ANA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ANA, BIA, CAIO],
      grupo("casa", [
        { pessoaId: ANA, peso: 100 },
        { pessoaId: BIA, peso: 100 },
        { pessoaId: CAIO, peso: 100 },
      ]),
    );

    // Ana pagou 100 no total; deve receber a parte de Bia (33) e Caio (33) = 66
    expect(saldoDe(saldo, ANA)).toBe(66);
    expect(saldoDe(saldo, BIA)).toBe(-33);
    expect(saldoDe(saldo, CAIO)).toBe(-33);
  });

  it("simplifica transferências para o mínimo de pagamentos entre 3 pessoas", () => {
    const lancamentos = [
      // Ana paga aluguel compartilhado de R$900 -> cobra 300 de cada um dos outros 2
      lancamento({
        valorCentavos: 90_000,
        pessoaDivisaoId: "casa",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ANA,
      }),
      // Bia paga um gasto individual do Caio de R$100
      lancamento({
        valorCentavos: 10_000,
        pessoaDivisaoId: CAIO,
        pessoaDivisaoTipo: "INDIVIDUAL",
        pessoaPagouId: BIA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ANA, BIA, CAIO],
      grupo("casa", [
        { pessoaId: ANA, peso: 100 },
        { pessoaId: BIA, peso: 100 },
        { pessoaId: CAIO, peso: 100 },
      ]),
    );

    // Ana: +60.000 (300 de Bia + 300 de Caio, em centavos: 30.000 cada)
    // Bia: -30.000 (aluguel) + 10.000 (recebeu de volta pelo gasto do Caio) = -20.000
    // Caio: -30.000 (aluguel) - 10.000 (gasto individual pago pela Bia) = -40.000
    expect(saldoDe(saldo, ANA)).toBe(60_000);
    expect(saldoDe(saldo, BIA)).toBe(-20_000);
    expect(saldoDe(saldo, CAIO)).toBe(-40_000);

    const total = saldo.transferenciasSugeridas.reduce(
      (s, t) => s + t.valorCentavos,
      0,
    );
    expect(total).toBe(60_000); // soma de tudo que é devido no grupo

    // Caio (maior devedor) paga primeiro para Ana (maior credora)
    expect(saldo.transferenciasSugeridas[0]).toEqual({
      deId: CAIO,
      paraId: ANA,
      valorCentavos: 40_000,
    });
    expect(saldo.transferenciasSugeridas[1]).toEqual({
      deId: BIA,
      paraId: ANA,
      valorCentavos: 20_000,
    });
  });

  it("uma única pessoa (mora sozinha) não gera saldo nem transferências", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 5_000,
        pessoaDivisaoId: ANA,
        pessoaDivisaoTipo: "INDIVIDUAL",
        pessoaPagouId: ANA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(lancamentos, [ANA]);

    expect(saldoDe(saldo, ANA)).toBe(0);
    expect(saldo.transferenciasSugeridas).toEqual([]);
  });
});

describe("calcularSaldoDivisaoGrupo — split customizado por peso", () => {
  const ANA = "ana";
  const BIA = "bia";
  const CAIO = "caio";

  it("divide proporcionalmente a pesos diferentes (60/40)", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 100_00,
        pessoaDivisaoId: "casal",
        pessoaDivisaoTipo: "CASAL",
        pessoaPagouId: ISA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ISA, GABI],
      grupo("casal", [
        { pessoaId: ISA, peso: 60 },
        { pessoaId: GABI, peso: 40 },
      ]),
    );

    // Isa paga o total; Gabi deve a fração correspondente ao seu peso (40%).
    expect(saldoDe(saldo, GABI)).toBe(-4_000);
    expect(saldoDe(saldo, ISA)).toBe(4_000);
  });

  it("pesos iguais (não só 100) continuam dividindo em partes iguais, sem perder centavos", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 100, // pesos iguais 1/1/1: 33,33 cada -> resto 1
        pessoaDivisaoId: "casa",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ANA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ANA, BIA, CAIO],
      grupo("casa", [
        { pessoaId: ANA, peso: 1 },
        { pessoaId: BIA, peso: 1 },
        { pessoaId: CAIO, peso: 1 },
      ]),
    );

    expect(saldoDe(saldo, BIA)).toBe(-33);
    expect(saldoDe(saldo, CAIO)).toBe(-33);
    expect(saldoDe(saldo, ANA)).toBe(66);
  });

  it("peso zero para uma pessoa faz com que ela não pague nada do gasto compartilhado", () => {
    const lancamentos = [
      lancamento({
        valorCentavos: 10_000,
        pessoaDivisaoId: "casa",
        pessoaDivisaoTipo: "FAMILIA",
        pessoaPagouId: ANA,
      }),
    ];

    const saldo = calcularSaldoDivisaoGrupo(
      lancamentos,
      [ANA, BIA, CAIO],
      grupo("casa", [
        { pessoaId: ANA, peso: 100 },
        { pessoaId: BIA, peso: 100 },
        { pessoaId: CAIO, peso: 0 },
      ]),
    );

    expect(saldoDe(saldo, CAIO)).toBe(0);
    expect(saldoDe(saldo, BIA)).toBe(-5_000);
    expect(saldoDe(saldo, ANA)).toBe(5_000);
  });
});
