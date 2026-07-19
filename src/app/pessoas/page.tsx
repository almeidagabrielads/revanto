import { SettingsShell } from "../components/SettingsShell";
import { PessoasClient } from "./PessoasClient";
import { AcessoClient } from "./AcessoClient";

export default function PessoasPage() {
  return (
    <SettingsShell>
      <div className="gap-xl flex flex-col">
        <div className="gap-lg flex flex-col">
          <div>
            <h2 className="text-on-surface text-2xl font-semibold">
              Acesso ao sistema
            </h2>
            <p className="text-on-surface-variant text-sm">
              Gerencie quem tem permissão para acessar e editar este household.
            </p>
          </div>
          <AcessoClient />
        </div>

        <div className="gap-lg border-outline-variant pt-xl flex flex-col border-t">
          <div>
            <h2 className="text-on-surface text-2xl font-semibold">
              Pessoas para divisão
            </h2>
            <p className="text-on-surface-variant text-sm">
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
