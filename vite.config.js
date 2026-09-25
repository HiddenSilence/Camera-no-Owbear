import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  // O projeto é publicado em /Camera-no-Owbear/ no GitHub Pages.
  base: "./",
  build: {
    assetsDir: "assets",
    rollupOptions: {
      input: {
        main: resolve(rootDir, "index.html"),
        background: resolve(rootDir, "background.html"),
        overlay: resolve(rootDir, "overlay.html"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo",
    },
  },
});
