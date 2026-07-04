#!/usr/bin/env python3
"""
Ferramenta de USO ÚNICO — extrai os dados da planilha financas.numbers
(docs/planilha-origem/Financas-2026/financas.numbers) para um JSON intermediário
que é consumido por scripts/migracao/importar.ts.

Não faz parte do produto. Depende de `numbers-parser` (pip install numbers-parser).

Uso:
    python3 scripts/migracao/extrair.py

Gera: scripts/migracao/dados-extraidos.json
"""

import json
import sys
from datetime import date, datetime
from pathlib import Path

try:
    import numbers_parser
except ImportError:
    print(
        "Dependência faltando. Rode: pip3 install numbers-parser",
        file=sys.stderr,
    )
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[2]
NUMBERS_PATH = ROOT / "docs/planilha-origem/Financas-2026/financas.numbers"
OUTPUT_PATH = Path(__file__).resolve().parent / "dados-extraidos.json"

MESES = [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
]


def cell(row, i):
    return row[i].value if i < len(row) else None


def as_number(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    return None


def serialize(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return v


def extrair_lancamentos(doc):
    sheet = next(s for s in doc.sheets if s.name == "Lançamentos")
    table = sheet.tables[0]
    rows = table.rows()

    out = []
    anomalias = []

    for i, row in enumerate(rows):
        data = cell(row, 1)
        if data is None:
            continue
        if not isinstance(data, (datetime, date)):
            continue  # cabeçalhos e linhas de total não têm data real

        registro = {
            "linha": i + 1,
            "data": serialize(data),
            "descricaoOrigem": cell(row, 4),
            "descricaoPropria": cell(row, 5),
            "divisao": cell(row, 6),
            "valor": as_number(cell(row, 7)),
            "desconto": as_number(cell(row, 8)),
            "categoria": cell(row, 9),
            "subcategoria": cell(row, 10),
            "banco": cell(row, 11),
            "quemPagou": cell(row, 12),
        }

        # Linha-fora-do-período: sinalizada na própria planilha como "ver como
        # lançar isso direito" (data 2000-01-01, sem banco). Não descartamos
        # aqui — deixamos para o script de importação decidir/reportar.
        if isinstance(data, (datetime, date)) and data.year < 2020:
            anomalias.append({"linha": i + 1, "motivo": "data suspeita (< 2020)", **registro})

        if registro["banco"] is None:
            anomalias.append({"linha": i + 1, "motivo": "sem banco", **registro})

        out.append(registro)

    return out, anomalias


def extrair_liquidez(doc):
    sheet = next(s for s in doc.sheets if s.name == "Liquidez investimentos")
    table = sheet.tables[0]
    rows = table.rows()

    out = []
    for i, row in enumerate(rows):
        banco = cell(row, 1)
        if banco is None or banco in ("Total", "Renda Fixa"):
            continue
        if i == 0:
            continue  # cabeçalho

        tipo = cell(row, 2)
        produto = cell(row, 3)
        valor = as_number(cell(row, 4))
        vencimento = cell(row, 5)
        observacao = cell(row, 6)

        if valor is None:
            continue

        out.append(
            {
                "linha": i + 1,
                "banco": banco,
                "tipo": tipo,
                "produto": produto,
                "valor": valor,
                "vencimento": serialize(vencimento)
                if isinstance(vencimento, (datetime, date))
                else vencimento,
                "observacao": observacao,
            }
        )

    return out


def extrair_patrimonio(doc):
    """
    Sheet "Histórico Patrimônio" é um dashboard calculado (não uma tabela
    normalizada). Extraímos apenas os dois blocos de posição por banco/mês
    ("INVESTIMENTOS ISA" e "INVESTIMENTOS GABI"), localizando-os por título em
    vez de por índice fixo de linha (mais resiliente a pequenas edições).
    """
    sheet = next(s for s in doc.sheets if s.name == "Histórico Patrimônio")
    table = sheet.tables[0]
    rows = [[cell(r, i) for i in range(len(r))] for r in table.rows()]

    out = []

    def bloco_pessoa(titulo, pessoa):
        try:
            inicio = next(
                idx for idx, r in enumerate(rows) if r and r[1] == titulo
            )
        except StopIteration:
            return
        # linha seguinte = cabeçalho dos meses; segue até achar "Posição na data"
        header_row = rows[inicio + 1]
        meses_cols = {}
        for col_idx, val in enumerate(header_row):
            if isinstance(val, str) and val in MESES:
                meses_cols[col_idx] = val

        r = inicio + 3  # pula título, cabeçalho de mês e cabeçalho "Banco"
        while r < len(rows):
            row = rows[r]
            nome_banco = row[1] if len(row) > 1 else None
            if nome_banco == "Posição na data" or nome_banco is None:
                break
            for col_idx, mes_nome in meses_cols.items():
                valor = as_number(cell_from(row, col_idx))
                if valor is not None:
                    out.append(
                        {
                            "pessoa": pessoa,
                            "banco": nome_banco,
                            "mes": mes_nome,
                            "valor": valor,
                        }
                    )
            r += 1

    def cell_from(row, idx):
        return row[idx] if idx < len(row) else None

    bloco_pessoa("INVESTIMENTOS ISA", "Isa")
    bloco_pessoa("INVESTIMENTOS GABI", "Gabi")

    return out


def main():
    if not NUMBERS_PATH.exists():
        print(f"Arquivo não encontrado: {NUMBERS_PATH}", file=sys.stderr)
        sys.exit(1)

    doc = numbers_parser.Document(str(NUMBERS_PATH))

    lancamentos, anomalias = extrair_lancamentos(doc)
    liquidez = extrair_liquidez(doc)
    patrimonio = extrair_patrimonio(doc)

    dados = {
        "lancamentos": lancamentos,
        "lancamentosAnomalias": anomalias,
        "investimentos": liquidez,
        "patrimonio": patrimonio,
    }

    OUTPUT_PATH.write_text(
        json.dumps(dados, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"Lançamentos extraídos: {len(lancamentos)} (anomalias: {len(anomalias)})")
    print(f"Investimentos extraídos: {len(liquidez)}")
    print(f"Posições de patrimônio extraídas: {len(patrimonio)}")
    print(f"Escrito em: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
