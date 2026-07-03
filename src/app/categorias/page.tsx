import { CategoriasClient } from "./CategoriasClient";

export default function CategoriasPage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Categorias e subcategorias</h1>
      <CategoriasClient />
    </main>
  );
}
