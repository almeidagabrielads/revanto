import { SettingsShell } from "../../components/SettingsShell";
import { ExportarDadosClient } from "./ExportarDadosClient";

export default function ExportarDadosPage() {
  return (
    <SettingsShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            Exportar & Dados
          </h2>
          <p className="text-sm text-on-surface-variant">
            Gerencie a portabilidade dos seus dados.
          </p>
        </div>
        <ExportarDadosClient />
      </div>
    </SettingsShell>
  );
}
