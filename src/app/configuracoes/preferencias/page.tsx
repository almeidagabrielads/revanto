import { SettingsShell } from "../../components/SettingsShell";
import { PreferenciasClient } from "./PreferenciasClient";

export default function PreferenciasPage() {
  return (
    <SettingsShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            Preferências
          </h2>
          <p className="text-sm text-on-surface-variant">
            Personalize sua experiência e configurações regionais.
          </p>
        </div>
        <PreferenciasClient />
      </div>
    </SettingsShell>
  );
}
