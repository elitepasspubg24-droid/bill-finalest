import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { 
      entry: "src/server.ts",
    },
  },
  // This tells Vite where to find the browser entry point
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
      },
    },
  },
});
