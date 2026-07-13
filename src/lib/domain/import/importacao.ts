import type { PrismaClient } from "@/generated/prisma/client";
import { parseImportacao, type ErroImportacao } from "./parser";
import { buscarTemplate } from "./templates";
import { calcularHashImportacao } from "./hash";
import { buscarCandidatosSugestao, melhorCandidato } from "./sugestaoCategoria";

export type LinhaPreview = {
  numeroLinha: number;
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  descontoCentavos: number;
  descricaoPropria: string | null;
  hash: string;
  duplicado: boolean;
  // categoriaSugeridaId/subcategoriaSugeridaId vêm do texto explícito do
  // arquivo (categoriaOrigem/subcategoriaOrigem) quando casa com um
  // cadastro, ou de um lançamento anterior parecido como fallback.
  categoriaSugeridaId: string | null;
  subcategoriaSugeridaId: string | null;
  // Textos brutos lidos do arquivo (quando o modelo declara a coluna
  // correspondente), ainda não casados com os cadastros do household.
  bancoOrigem: string | null;
  categoriaOrigem: string | null;
  subcategoriaOrigem: string | null;
  divisaoOrigem: string | null;
  pagouOrigem: string | null;
  // Valores resolvidos para a linha: o texto do arquivo casado com um
  // cadastro, ou o padrão informado em `opts`. Null quando nenhum dos dois
  // está disponível — o usuário precisa escolher na revisão.
  bancoSugeridoId: string | null;
  pessoaDivisaoSugeridaId: string | null;
  pessoaPagouSugeridaId: string | null;
};

export type ResultadoPreview =
  | {
      ok: true;
      linhas: LinhaPreview[];
      erros: ErroImportacao[];
      // Linhas anteriores ao período inicial informado — descartadas antes
      // mesmo de entrar na revisão (não contam como erro).
      ignoradasAntesDoPeriodo: number;
    }
  | { ok: false; erro: string };

// "AAAA-MM-DD" (valor de <input type="date">) para Date em UTC 00:00.
function parseDataLimite(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (!match) return null;
  const [, ano, mes, dia] = match;
  return new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
}

// Faz o parsing do CSV e monta o preview de importação (RF06): marca linhas
// já importadas anteriormente (mesmo hash de data+descrição+valor+banco) e
// sugere categoria/subcategoria com base em lançamentos anteriores
// parecidos. Não grava nada no banco.
export async function gerarPreviewImportacao(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    // bancoId é opcional: alguns modelos de arquivo já trazem o banco por
    // linha (colunaBanco) — nesse caso o usuário só precisa de um banco
    // padrão para as linhas em que o arquivo não indicar nada.
    bancoId?: string | null;
    templateId: string;
    csvTexto: string;
    // Quando informado, linhas com data anterior a este período são
    // ignoradas antes da revisão (ex.: reimportar só o mês corrente de um
    // extrato que cobre o ano inteiro).
    dataInicial?: string | null;
  },
): Promise<ResultadoPreview> {
  const template = buscarTemplate(opts.templateId);
  if (!template) return { ok: false, erro: "Modelo de importação inválido." };

  if (opts.dataInicial && !parseDataLimite(opts.dataInicial)) {
    return { ok: false, erro: "Período inicial inválido." };
  }

  const [bancos, pessoas, categorias] = await Promise.all([
    prisma.banco.findMany({ where: { householdId } }),
    prisma.pessoa.findMany({ where: { householdId } }),
    prisma.categoria.findMany({
      where: { householdId },
      include: { subcategorias: true },
    }),
  ]);
  const bancoPorId = new Map(bancos.map((b) => [b.id, b]));
  const bancoPorNome = new Map(
    bancos.map((b) => [b.nome.trim().toLowerCase(), b]),
  );
  const pessoaPorNome = new Map(
    pessoas.map((p) => [p.nome.trim().toLowerCase(), p]),
  );
  const categoriaPorNome = new Map(
    categorias.map((c) => [c.nome.trim().toLowerCase(), c]),
  );

  if (opts.bancoId && !bancoPorId.has(opts.bancoId)) {
    return { ok: false, erro: "Banco inválido." };
  }

  const { linhas: todasLinhas, erros } = parseImportacao(
    opts.csvTexto,
    template,
  );

  const dataLimite = opts.dataInicial
    ? parseDataLimite(opts.dataInicial)
    : null;
  const linhas = dataLimite
    ? todasLinhas.filter((linha) => linha.data >= dataLimite)
    : todasLinhas;
  const ignoradasAntesDoPeriodo = todasLinhas.length - linhas.length;

  const bancosResolvidos = linhas.map((linha) => {
    if (linha.bancoOrigem) {
      const encontrado = bancoPorNome.get(linha.bancoOrigem.toLowerCase());
      if (encontrado) return encontrado.id;
    }
    return opts.bancoId ?? null;
  });
  const divisoesResolvidas = linhas.map((linha) =>
    linha.divisaoOrigem
      ? (pessoaPorNome.get(linha.divisaoOrigem.toLowerCase())?.id ?? null)
      : null,
  );
  const pagadoresResolvidos = linhas.map((linha) =>
    linha.pagouOrigem
      ? (pessoaPorNome.get(linha.pagouOrigem.toLowerCase())?.id ?? null)
      : null,
  );

  const hashes = linhas.map((linha, indice) =>
    calcularHashImportacao({
      data: linha.data,
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      // Sem banco resolvido ainda, usamos um valor provisório único por
      // linha só para identificá-la na tela de revisão — o hash definitivo
      // (usado para deduplicar de verdade) é recalculado ao confirmar, já
      // com o banco final escolhido pelo usuário.
      bancoId: bancosResolvidos[indice] ?? `__linha_${linha.numeroLinha}__`,
    }),
  );

  const existentes = await prisma.lancamento.findMany({
    where: { householdId, hashImportacao: { in: hashes } },
    select: { hashImportacao: true },
  });
  const hashesExistentes = new Set(existentes.map((e) => e.hashImportacao));

  const candidatos = await buscarCandidatosSugestao(prisma, householdId);

  const previewLinhas: LinhaPreview[] = linhas.map((linha, indice) => {
    const hash = hashes[indice];
    const bancoSugeridoId = bancosResolvidos[indice];
    // A checagem de duplicado só é confiável quando já sabemos o banco da
    // linha — sem isso, a proteção definitiva acontece ao confirmar (índice
    // único no banco de dados).
    const duplicado = bancoSugeridoId !== null && hashesExistentes.has(hash);
    const sugestao = duplicado
      ? null
      : melhorCandidato(linha.descricaoOrigem, candidatos);

    // Categoria/subcategoria explícitas no arquivo têm prioridade sobre a
    // sugestão heurística baseada em lançamentos anteriores parecidos.
    const categoriaExplicita = linha.categoriaOrigem
      ? categoriaPorNome.get(linha.categoriaOrigem.toLowerCase())
      : undefined;
    let categoriaSugeridaId: string | null = null;
    let subcategoriaSugeridaId: string | null = null;
    if (categoriaExplicita) {
      categoriaSugeridaId = categoriaExplicita.id;
      const subcategoriaExplicita = linha.subcategoriaOrigem
        ? categoriaExplicita.subcategorias.find(
            (s) =>
              s.nome.trim().toLowerCase() ===
              linha.subcategoriaOrigem!.toLowerCase(),
          )
        : undefined;
      subcategoriaSugeridaId = subcategoriaExplicita?.id ?? null;
    } else if (sugestao) {
      categoriaSugeridaId = sugestao.categoriaId;
      subcategoriaSugeridaId = sugestao.subcategoriaId;
    }

    return {
      numeroLinha: linha.numeroLinha,
      data: linha.data.toISOString().slice(0, 10),
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      descontoCentavos: linha.descontoCentavos,
      descricaoPropria: linha.descricaoPropria,
      hash,
      duplicado,
      categoriaSugeridaId,
      subcategoriaSugeridaId,
      bancoOrigem: linha.bancoOrigem,
      categoriaOrigem: linha.categoriaOrigem,
      subcategoriaOrigem: linha.subcategoriaOrigem,
      divisaoOrigem: linha.divisaoOrigem,
      pagouOrigem: linha.pagouOrigem,
      bancoSugeridoId,
      pessoaDivisaoSugeridaId: divisoesResolvidas[indice],
      pessoaPagouSugeridaId: pagadoresResolvidos[indice],
    };
  });

  return { ok: true, linhas: previewLinhas, erros, ignoradasAntesDoPeriodo };
}

export type LinhaConfirmacao = {
  data: string;
  descricaoOrigem: string;
  valorCentavos: number;
  descricaoPropria?: string | null;
  descontoCentavos?: number;
  categoriaId?: string | null;
  subcategoriaId?: string | null;
  // Sobrescreve, só nessa linha, o banco/dono/pagador padrão do lote (RF:
  // revisão de importação permite ajustar cada lançamento antes de
  // confirmar — útil quando o arquivo mistura mais de um banco/cartão).
  bancoId?: string | null;
  pessoaDivisaoId?: string | null;
  pessoaPagouId?: string | null;
};

export type ResultadoConfirmacao =
  | { ok: true; criados: number; duplicadosIgnorados: number }
  | { ok: false; erro: string };

// Grava as linhas selecionadas pelo usuário na tela de preview. Linhas cujo
// hash já exista para o household são ignoradas silenciosamente (proteção
// extra além da checagem feita no preview, contra corrida entre telas).
export async function confirmarImportacao(
  prisma: PrismaClient,
  householdId: string,
  opts: {
    // Banco/divisão/pagador padrão do lote — todos opcionais porque,
    // dependendo do modelo do arquivo, cada linha pode já trazer (ou o
    // usuário pode definir na revisão) seus próprios valores.
    bancoId?: string | null;
    pessoaDivisaoId?: string | null;
    pessoaPagouId?: string | null;
    linhas: LinhaConfirmacao[];
  },
): Promise<ResultadoConfirmacao> {
  const [banco, pessoaDivisao, pessoaPagou] = await Promise.all([
    opts.bancoId
      ? prisma.banco.findFirst({ where: { id: opts.bancoId, householdId } })
      : null,
    opts.pessoaDivisaoId
      ? prisma.pessoa.findFirst({
          where: { id: opts.pessoaDivisaoId, householdId },
        })
      : null,
    opts.pessoaPagouId
      ? prisma.pessoa.findFirst({
          where: { id: opts.pessoaPagouId, householdId },
        })
      : null,
  ]);
  if (
    (opts.bancoId && !banco) ||
    (opts.pessoaDivisaoId && !pessoaDivisao) ||
    (opts.pessoaPagouId && !pessoaPagou)
  ) {
    return { ok: false, erro: "Banco ou pessoa inválidos." };
  }
  if (opts.linhas.length === 0) {
    return { ok: false, erro: "Nenhuma linha para importar." };
  }

  const categoriaIds = [
    ...new Set(
      opts.linhas.map((l) => l.categoriaId).filter((v): v is string => !!v),
    ),
  ];
  const subcategoriaIds = [
    ...new Set(
      opts.linhas.map((l) => l.subcategoriaId).filter((v): v is string => !!v),
    ),
  ];
  const [categorias, subcategorias] = await Promise.all([
    prisma.categoria.findMany({
      where: { id: { in: categoriaIds }, householdId },
    }),
    prisma.subcategoria.findMany({
      where: { id: { in: subcategoriaIds }, householdId },
    }),
  ]);
  const categoriasValidas = new Set(categorias.map((c) => c.id));
  const subcategoriasPorId = new Map(subcategorias.map((s) => [s.id, s]));

  const pessoaOverrideIds = [
    ...new Set(
      opts.linhas
        .flatMap((l) => [l.pessoaDivisaoId, l.pessoaPagouId])
        .filter((v): v is string => !!v),
    ),
  ];
  const bancoOverrideIds = [
    ...new Set(
      opts.linhas.map((l) => l.bancoId).filter((v): v is string => !!v),
    ),
  ];
  const [pessoasOverridePermitidas, bancosOverridePermitidos] =
    await Promise.all([
      prisma.pessoa
        .findMany({
          where: { id: { in: pessoaOverrideIds }, householdId },
          select: { id: true },
        })
        .then((pessoas) => new Set(pessoas.map((p) => p.id))),
      prisma.banco
        .findMany({
          where: { id: { in: bancoOverrideIds }, householdId },
          select: { id: true },
        })
        .then((bancos) => new Set(bancos.map((b) => b.id))),
    ]);

  const dados = [];
  for (const linha of opts.linhas) {
    if (linha.categoriaId && !categoriasValidas.has(linha.categoriaId)) {
      return {
        ok: false,
        erro: `Categoria inválida na linha "${linha.descricaoOrigem}".`,
      };
    }
    if (linha.subcategoriaId) {
      const subcategoria = subcategoriasPorId.get(linha.subcategoriaId);
      if (!subcategoria || subcategoria.categoriaId !== linha.categoriaId) {
        return {
          ok: false,
          erro: `Subcategoria inválida na linha "${linha.descricaoOrigem}".`,
        };
      }
    }
    if (
      (linha.pessoaDivisaoId &&
        !pessoasOverridePermitidas.has(linha.pessoaDivisaoId)) ||
      (linha.pessoaPagouId &&
        !pessoasOverridePermitidas.has(linha.pessoaPagouId))
    ) {
      return {
        ok: false,
        erro: `Dono/pagador inválido na linha "${linha.descricaoOrigem}".`,
      };
    }
    if (linha.bancoId && !bancosOverridePermitidos.has(linha.bancoId)) {
      return {
        ok: false,
        erro: `Banco inválido na linha "${linha.descricaoOrigem}".`,
      };
    }

    const bancoFinal = linha.bancoId ?? opts.bancoId;
    const pessoaDivisaoFinal = linha.pessoaDivisaoId ?? opts.pessoaDivisaoId;
    const pessoaPagouFinal = linha.pessoaPagouId ?? opts.pessoaPagouId;
    if (!bancoFinal || !pessoaDivisaoFinal || !pessoaPagouFinal) {
      return {
        ok: false,
        erro: `Defina banco, divisão e quem pagou para a linha "${linha.descricaoOrigem}".`,
      };
    }

    const data = new Date(linha.data);
    const hash = calcularHashImportacao({
      data,
      descricaoOrigem: linha.descricaoOrigem,
      valorCentavos: linha.valorCentavos,
      bancoId: bancoFinal,
    });

    dados.push({
      data,
      descricaoOrigem: linha.descricaoOrigem,
      descricaoPropria: linha.descricaoPropria ?? null,
      valorCentavos: linha.valorCentavos,
      descontoCentavos: linha.descontoCentavos ?? 0,
      categoriaId: linha.categoriaId ?? null,
      subcategoriaId: linha.subcategoriaId ?? null,
      bancoId: bancoFinal,
      pessoaDivisaoId: pessoaDivisaoFinal,
      pessoaPagouId: pessoaPagouFinal,
      householdId,
      hashImportacao: hash,
    });
  }

  const resultado = await prisma.lancamento.createMany({
    data: dados,
    skipDuplicates: true,
  });

  return {
    ok: true,
    criados: resultado.count,
    duplicadosIgnorados: dados.length - resultado.count,
  };
}
