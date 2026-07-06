import { SettingsShell } from "../components/SettingsShell";
import { PessoasClient } from "./PessoasClient";
import { AcessoClient } from "./AcessoClient";

export default function PessoasPage() {
  return (
    <SettingsShell>
      <div className="flex flex-col gap-xl">
        <div className="flex flex-col gap-lg">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">
              Acesso ao sistema
            </h2>
            <p className="text-sm text-on-surface-variant">
              Gerencie quem tem permissão para acessar e editar este household.
            </p>
          </div>
          <AcessoClient />
        </div>

        <div className="flex flex-col gap-lg border-t border-outline-variant pt-xl">
          <div>
            <h2 className="text-lg font-semibold text-on-surface">
              Pessoas para divisão
            </h2>
            <p className="text-sm text-on-surface-variant">
              Quem faz parte do household e como a divisão de gastos é
              calculada.
            </p>
          </div>
          <PessoasClient />
        </div>
      </div>
    </SettingsShell>
  );
}
