import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // Testes de integração truncam o banco de teste inteiro em beforeAll/afterEach;
    // rodar arquivos em paralelo causa truncagem cruzada entre suites concorrentes.
    fileParallelism: false,
    // Evita rodar cópias duplicadas/desatualizadas dos testes que vivem em
    // worktrees git isoladas de outras sessões (.claude/worktrees/**).
    exclude: ["**/node_modules/**", "**/.claude/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          exclude: [
            "**/node_modules/**",
            "**/.claude/**",
            "src/**/*.integration.test.ts",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.integration.test.ts"],
        },
      },
    ],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
