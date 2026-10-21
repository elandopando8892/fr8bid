import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./estilos/marksman-brand-tokens.css";
import "./estilos/app.css";
import { App } from "./ui/App";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
