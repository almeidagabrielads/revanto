import { SettingsShell } from "../components/SettingsShell";
import { CategoriasClient } from "./CategoriasClient";

export default function CategoriasPage() {
  return (
    <SettingsShell>
      <div className="gap-lg flex flex-col">
        <div>
          <h2 className="text-on-surface text-2xl font-semibold">Categorias</h2>
          <p className="text-on-surface-variant text-sm">
            Categorias e subcategorias — ative ou inative conforme o uso.
          </p>
        </div>
        <CategoriasClient />
      </div>
    </SettingsShell>
  );
}
