import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, "popup-react"),
  build: {
    outDir: resolve(__dirname, "popup-dist"),
    emptyOutDir: true
  }
});
