import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  // Importante para GitHub Pages: o projeto fica em /Camera-no-Owbear/
  // e não na raiz do domínio.
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "background.html"),
        overlay: resolve(__dirname, "overlay.html"),
      },
    },
  },
  server: {
    cors: {
      origin: "https://www.owlbear.rodeo"
    }
  }
});
