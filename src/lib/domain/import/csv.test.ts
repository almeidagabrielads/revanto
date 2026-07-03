import { describe, expect, it } from "vitest";
import { linhasParaObjetos, parseCsv } from "./csv";

describe("parseCsv", () => {
  it("faz parsing de CSV simples separado por vírgula", () => {
    const linhas = parseCsv("a,b,c\n1,2,3");
    expect(linhas).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("respeita delimitador customizado", () => {
    const linhas = parseCsv("a;b;c\n1;2;3", ";");
    expect(linhas).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("lida com campos entre aspas contendo o delimitador", () => {
    const linhas = parseCsv(
      'data,descricao,valor\n2026-01-01,"Mercado, ABC",100',
    );
    expect(linhas[1]).toEqual(["2026-01-01", "Mercado, ABC", "100"]);
  });

  it("lida com aspas escapadas dentro de campo citado", () => {
    const linhas = parseCsv('a\n"ele disse ""oi"""');
    expect(linhas[1]).toEqual(['ele disse "oi"']);
  });

  it("ignora linhas totalmente vazias", () => {
    const linhas = parseCsv("a,b\n1,2\n\n");
    expect(linhas).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("linhasParaObjetos", () => {
  it("indexa linhas pelo cabeçalho", () => {
    const objetos = linhasParaObjetos([
      ["data", "valor"],
      ["2026-01-01", "10"],
    ]);
    expect(objetos).toEqual([{ data: "2026-01-01", valor: "10" }]);
  });

  it("retorna vazio para CSV sem linhas", () => {
    expect(linhasParaObjetos([])).toEqual([]);
  });
});
