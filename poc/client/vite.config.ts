import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      // Em dev, o backend roda em localhost:8080; em produção é same-origin.
      "/api": "http://localhost:8080",
    },
  },
});
