import adapter from "@sveltejs/adapter-cloudflare";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    sveltekit({
      compilerOptions: {
        // Runes everywhere except dependencies, which may still ship Svelte 4 syntax.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },
      adapter: adapter(),
    }),
  ],
  test: {
    include: ["src/**/*.{test,spec}.{js,ts}"],
    environment: "node",
  },
});
