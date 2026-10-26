import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    // Os testes de integração rodam `git` de verdade; com muitos arquivos em paralelo no Windows, o `beforeEach` (git init + config) passa fácil de 10 s.
    hookTimeout: 60_000,
  },
});
