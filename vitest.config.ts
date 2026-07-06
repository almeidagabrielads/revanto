import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    environmentMatchGlobs: [
      // Testes de integração com banco rodam em Node, não em jsdom
      ["src/**/*.integration.test.ts", "node"],
    ],
    // Testes de integração truncam o banco de teste inteiro em beforeAll/afterEach;
    // rodar arquivos em paralelo causa truncagem cruzada entre suites concorrentes.
    fileParallelism: false,
    // Evita rodar cópias duplicadas/desatualizadas dos testes que vivem em
    // worktrees git isoladas de outras sessões (.claude/worktrees/**).
    exclude: ["**/node_modules/**", "**/.claude/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
