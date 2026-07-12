"use client";

import { useEffect, useId, useRef, useState } from "react";

export type SugestaoDescricao = {
  descricao: string;
  categoriaId: string | null;
  subcategoriaId: string | null;
  pessoaDivisaoId: string;
  tipoGasto: string;
};

type Props = {
  id?: string;
  className?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelecionar: (sugestao: SugestaoDescricao) => void;
};

/**
 * Input de descrição com sugestões vindas do histórico de lançamentos do
 * household (RF — busca não diferencia maiúsculas/minúsculas nem acentos, ver
 * normalizarDescricaoParaBusca). Ao escolher uma sugestão, o chamador recebe
 * os dados do último lançamento com aquela descrição para preencher o resto
 * do formulário.
 */
export function DescricaoAutocomplete({
  id,
  className = "",
  placeholder,
  value,
  onChange,
  onSelecionar,
}: Props) {
  const [sugestoes, setSugestoes] = useState<SugestaoDescricao[]>([]);
  const [aberto, setAberto] = useState(false);
  const [indiceAtivo, setIndiceAtivo] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  useEffect(() => {
    const termo = value.trim();
    if (!termo) return;
    let cancelado = false;
    const timer = setTimeout(() => {
      fetch(`/api/lancamentos/descricoes?q=${encodeURIComponent(termo)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((dados: SugestaoDescricao[]) => {
          if (cancelado) return;
          setSugestoes(dados);
          setIndiceAtivo(-1);
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelado = true;
      clearTimeout(timer);
    };
  }, [value]);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setAberto(false);
      }
    }
    function aoPressionarTecla(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoPressionarTecla);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoPressionarTecla);
    };
  }, [aberto]);

  function selecionar(sugestao: SugestaoDescricao) {
    onChange(sugestao.descricao);
    onSelecionar(sugestao);
    setSugestoes([]);
    setAberto(false);
  }

  const mostrarLista = aberto && sugestoes.length > 0;

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        id={id}
        className={`w-full ${className}`}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={mostrarLista}
        aria-autocomplete="list"
        aria-controls={listboxId}
        onChange={(e) => {
          const novoValor = e.target.value;
          onChange(novoValor);
          setAberto(true);
          if (!novoValor.trim()) setSugestoes([]);
        }}
        onFocus={() => setAberto(true)}
        onKeyDown={(e) => {
          if (!mostrarLista) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setIndiceAtivo((i) => Math.min(i + 1, sugestoes.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setIndiceAtivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter" && indiceAtivo >= 0) {
            e.preventDefault();
            selecionar(sugestoes[indiceAtivo]);
          }
        }}
      />

      {mostrarLista && (
        <div
          id={listboxId}
          role="listbox"
          className="border-outline-variant bg-surface-container-lowest absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border py-1 shadow-lg"
        >
          {sugestoes.map((s, i) => (
            <button
              key={s.descricao}
              type="button"
              role="option"
              aria-selected={i === indiceAtivo}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => selecionar(s)}
              className={`px-md w-full py-2 text-left text-sm transition-colors ${
                i === indiceAtivo
                  ? "bg-primary/10 text-primary font-semibold"
                  : "text-on-surface hover:bg-surface-container-low"
              }`}
            >
              {s.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
