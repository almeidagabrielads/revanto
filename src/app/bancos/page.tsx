import { SettingsShell } from "../components/SettingsShell";
import { BancosClient } from "./BancosClient";

export default function BancosPage() {
  return (
    <SettingsShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h2 className="text-lg font-semibold text-on-surface">
            Contas & Bancos
          </h2>
          <p className="text-sm text-on-surface-variant">
            Bancos, cartões e corretoras usados nos lançamentos.
          </p>
        </div>
        <BancosClient />
      </div>
    </SettingsShell>
  );
}
