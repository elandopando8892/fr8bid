import { Eventos } from "./Eventos";
import { LigaCarrier } from "./LigaCarrier";
import { Mesa } from "./Mesa";
import { Marco, useRuta } from "./comun";
import { ProveedorSesion, useSesion } from "./sesion";

export function App() {
  return (
    <ProveedorSesion>
      <Rutas />
    </ProveedorSesion>
  );
}

function Rutas() {
  const ruta = useRuta();
  const s = useSesion();
  const liga = ruta.match(/^\/bid\/([^/]+)$/);
  if (liga) return <main className="contenido solo"><LigaCarrier token={decodeURIComponent(liga[1])} /></main>;
  if (s.modo === "rateware" && s.listo && !s.correo)
    return (
      <main className="contenido solo">
        <div className="tarjeta entrar">
          <h1>Bid Room</h1>
          {s.error ? <div className="estado estado-error">{s.error}</div> : <button className="btn-primario" onClick={s.entrar}>Entrar con Google</button>}
        </div>
      </main>
    );
  const evento = ruta.match(/^\/eventos\/([^/]+)$/);
  return <Marco>{evento ? <Mesa key={evento[1]} id={evento[1]} /> : <Eventos />}</Marco>;
}
