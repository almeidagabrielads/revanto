"use client";

import { useCallback, useState } from "react";

type ConfirmOptions = {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
};

type PendingConfirm = ConfirmOptions & {
  message: string;
  resolve: (valor: boolean) => void;
};

/**
 * Substitui window.confirm por um diálogo que respeita a identidade visual
 * do sistema. Uso: const { confirmar, dialog } = useConfirmDialog(); depois
 * `if (!(await confirmar("..."))) return;` e renderizar {dialog} no JSX.
 */
export function useConfirmDialog() {
  const [pendente, setPendente] = useState<PendingConfirm | null>(null);

  const confirmar = useCallback((message: string, options?: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setPendente({ message, ...options, resolve });
    });
  }, []);

  function responder(valor: boolean) {
    pendente?.resolve(valor);
    setPendente(null);
  }

  const dialog = pendente ? (
    <div className="bg-on-surface/40 p-lg fixed inset-0 z-[110] flex items-center justify-center">
      <div className="gap-md border-outline-variant bg-surface-container-lowest p-lg flex w-full max-w-[24rem] flex-col rounded-2xl border shadow-lg">
        <h2 className="text-on-surface text-xl font-bold">
          {pendente.title ?? "Confirmar ação"}
        </h2>
        <p className="text-on-surface-variant text-sm">{pendente.message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => responder(false)}
            className="border-outline-variant px-md text-on-surface hover:bg-surface-container-low rounded-full border py-1.5 text-xs font-semibold"
          >
            {pendente.cancelLabel ?? "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => responder(true)}
            className="bg-danger px-md text-on-danger rounded-full py-1.5 text-xs font-semibold hover:opacity-90"
          >
            {pendente.confirmLabel ?? "Remover"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirmar, dialog };
}
