import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { aislarEstilos } from "./src/estilos/aislar";

// Las pantallas traídas de Bidware viven en src/bidware con su alias «@».
// Sus estilos quedan bajo .bw y los de Fr8Bid no entran ahí (src/estilos/aislar.ts).
const hojaDe = (archivo: string) =>
  /[\\/]src[\\/]bidware[\\/]/.test(archivo) ? "bidware" : /[\\/]src[\\/]estilos[\\/]app\.css$/.test(archivo) ? "fr8bid" : null;

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src/bidware", import.meta.url)) } },
  css: { postcss: { plugins: [aislarEstilos(hojaDe)] } },
  test: { environment: "node", include: ["test/**/*.test.ts"] }
} as any);
