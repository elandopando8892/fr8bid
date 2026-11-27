import { pedirLiga, type MarcaLiga, type PaginaLiga } from "@/lib/pedirLiga";

/** Botones para pedir una liga nueva por correo (y WhatsApp, cuando el equipo tenga número). */
export function PedirLigaNueva({ pagina, lang, marca = "marksman" }: { pagina: PaginaLiga; lang: "es" | "en"; marca?: MarcaLiga }) {
  const liga = pedirLiga(pagina, lang, marca);
  if (!liga) return null;
  const en = lang === "en";
  return (
    <p className="pedir-liga" style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
      <a className="btn primary" href={liga.correo}>{en ? "Ask for a new link by email" : "Pedir una liga nueva por correo"}</a>
      {liga.whatsapp && (
        <a className="btn" href={liga.whatsapp} target="_blank" rel="noreferrer">{en ? "Ask on WhatsApp" : "Pedirla por WhatsApp"}</a>
      )}
    </p>
  );
}
