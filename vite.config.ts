import path from "node:path";
import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  fmt: {
    ignorePatterns: [
      "docs/**",
      ".superpowers/**",
      "*.md",
      "flake.nix",
      "flake.lock",
      "src/web/routeTree.gen.ts",
    ],
  },
  lint: {
    ignorePatterns: ["docs/**", ".superpowers/**", "src/web/routeTree.gen.ts"],
    plugins: ["react", "typescript", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  test: {
    passWithNoTests: true,
  },
  appType: "spa",
  plugins: lazyPlugins(() => [
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/web/routes",
      generatedRouteTree: "./src/web/routeTree.gen.ts",
    }),
    react(),
  ]),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist/web",
    emptyOutDir: true,
  },
  pack: {
    entry: "src/server/index.ts",
    outDir: "dist/server",
    format: "esm",
    platform: "node",
    target: "node22",
    tsconfig: "tsconfig.server.json",
    dts: false,
    fixedExtension: false,
    deps: {
      neverBundle: true,
    },
  },
});
