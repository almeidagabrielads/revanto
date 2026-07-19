import { SettingsShell } from "../components/SettingsShell";
import { BancosClient } from "./BancosClient";

export default function BancosPage() {
  return (
    <SettingsShell>
      <div className="gap-lg flex flex-col">
        <div>
          <h2 className="text-on-surface text-2xl font-semibold">
            Contas & Bancos
          </h2>
          <p className="text-on-surface-variant text-sm">
            Bancos, cartões e corretoras usados nos lançamentos.
          </p>
        </div>
        <BancosClient />
      </div>
    </SettingsShell>
  );
}
