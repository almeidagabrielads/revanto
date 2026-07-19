import { SettingsShell } from "../../components/SettingsShell";
import { PreferenciasClient } from "./PreferenciasClient";

export default function PreferenciasPage() {
  return (
    <SettingsShell>
      <div className="gap-lg flex flex-col">
        <div>
          <h2 className="text-on-surface text-2xl font-semibold">
            Preferências
          </h2>
          <p className="text-on-surface-variant text-sm">
            Personalize sua experiência e configurações regionais.
          </p>
        </div>
        <PreferenciasClient />
      </div>
    </SettingsShell>
  );
}
