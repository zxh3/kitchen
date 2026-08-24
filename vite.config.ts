import adapter from "@sveltejs/adapter-node";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    sveltekit({
      csp: {
        directives: {
          "default-src": ["self"],
          "script-src": ["self"],
          "script-src-attr": ["none"],
          "style-src": ["self", "unsafe-inline", "https://fonts.googleapis.com"],
          "font-src": ["self", "https://fonts.gstatic.com"],
          "img-src": ["self", "data:", "blob:"],
          "connect-src": ["self"],
          "frame-src": ["https:"],
          "object-src": ["none"],
          "base-uri": ["none"],
          "form-action": ["self"],
          "frame-ancestors": ["none"],
        },
      },
      compilerOptions: {
        // Force runes mode for the project, except for libraries. Can be removed in svelte 6.
        runes: ({ filename }) =>
          filename.split(/[/\\]/).includes("node_modules") ? undefined : true,
      },

      // Node build — deployed on Modal as an @app.server (see deploy.py).
      adapter: adapter(),
    }),
  ],
  server: {
    port: 3000,
  },
  preview: {
    port: 3000,
  },
});
