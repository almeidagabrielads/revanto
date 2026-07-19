import { SettingsShell } from "../../components/SettingsShell";
import { ExportarDadosClient } from "./ExportarDadosClient";

export default function ExportarDadosPage() {
  return (
    <SettingsShell>
      <div className="gap-lg flex flex-col">
        <div>
          <h2 className="text-on-surface text-2xl font-semibold">
            Exportar & Dados
          </h2>
          <p className="text-on-surface-variant text-sm">
            Gerencie a portabilidade dos seus dados.
          </p>
        </div>
        <ExportarDadosClient />
      </div>
    </SettingsShell>
  );
}
