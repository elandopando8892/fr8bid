import { BrowserRouter, Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { AuthProvider } from "@/auth/AuthContext";
import { ConfirmHost } from "@/components/confirm";
import { AIntegraciones, AMesa, Bw, P } from "./bidware";
import { Eventos } from "./Eventos";
import { LigaCarrier } from "./LigaCarrier";
import { Mesa } from "./Mesa";
import { Marco, NavegadorGlobal } from "./comun";
import { ProveedorSesion, useSesion } from "./sesion";

export function App() {
  return (
    <BrowserRouter>
      <NavegadorGlobal />
      <AuthProvider>
        <ProveedorSesion>
          <div className="bw bw-dialogos">
            <ConfirmHost />
          </div>
          <Rutas />
        </ProveedorSesion>
      </AuthProvider>
    </BrowserRouter>
  );
}

const publica = (x: JSX.Element) => <Bw publica>{x}</Bw>;
const modulo = (x: JSX.Element) => <Bw>{x}</Bw>;

function Rutas() {
  return (
    <Routes>
      {/* Públicas: carriers y shippers entran con su liga, sin sesión. */}
      <Route path="/bid/:token" element={<LigaDelCarrier />} />
      <Route path="/rfx-bid.html" element={publica(<P.BidRoom />)} />
      <Route path="/callback" element={publica(<P.Callback />)} />
      <Route path="/board" element={publica(<P.Tablero />)} />
      <Route path="/bid-room-board.html" element={publica(<P.Tablero />)} />
      <Route path="/carrier-profile.html" element={publica(<P.PerfilCarrier />)} />
      <Route path="/shipper-profile.html" element={publica(<P.PerfilShipper />)} />
      <Route path="/customer-rfi.html" element={publica(<P.SolicitudShipper />)} />
      <Route path="/rfi/:token" element={publica(<P.SolicitudShipper />)} />
      <Route path="/settings.html" element={<AIntegraciones />} />

      {/* El equipo, dentro del marco de Fr8Bid. */}
      <Route element={<Equipo />}>
        <Route path="/" element={<Eventos />} />
        <Route path="/eventos" element={<Eventos />} />
        <Route path="/eventos/:id" element={<MesaDelEvento />} />
        <Route path="/rfx" element={<Navigate to="/eventos" replace />} />
        <Route path="/rfx/new" element={modulo(<P.NuevoEvento />)} />
        <Route path="/rfx/new/:id" element={modulo(<P.NuevoEvento />)} />
        <Route path="/rfx/:id" element={<AMesa />} />
        <Route path="/rfx/:id/detalle" element={modulo(<P.DetalleEvento />)} />
        <Route path="/rfx/:id/message" element={modulo(<P.Mensaje />)} />
        <Route path="/rfx/:id/delivery" element={modulo(<P.Cola />)} />
        <Route path="/rfx/:id/review" element={modulo(<P.RevisionContactos />)} />
        {/* Los avisos de adjudicación salen solo de la página del evento. */}
        <Route path="/rfx/:id/notices" element={<AMesa />} />
        <Route path="/rfx/:id/chat" element={modulo(<P.Chat />)} />
        <Route path="/panel" element={modulo(<P.Panel />)} />
        <Route path="/intake" element={modulo(<P.Intake />)} />
        <Route path="/plantillas" element={modulo(<P.Plantillas />)} />
        <Route path="/plantillas/:id" element={modulo(<P.Plantilla />)} />
        <Route path="/templates" element={modulo(<P.Listas />)} />
        <Route path="/templates/review" element={modulo(<P.Evidencia />)} />
        <Route path="/templates/new" element={modulo(<P.Lista />)} />
        <Route path="/templates/:id/edit" element={modulo(<P.Lista />)} />
        <Route path="/carrier-fit" element={modulo(<P.CarrierFit />)} />
        <Route path="/crm" element={modulo(<P.Crm />)} />
        <Route path="/crm/higiene" element={modulo(<P.Higiene />)} />
        <Route path="/crm/rebotes" element={modulo(<P.Rebotes />)} />
        <Route path="/quotedesk" element={modulo(<P.QuoteDesk />)} />
        <Route path="/quotedesk/:id" element={modulo(<P.Cotizacion />)} />
        <Route path="/quotedesk/:id/delivery" element={modulo(<P.ColaCotizacion />)} />
        <Route path="/tarifas" element={modulo(<P.Tarifas />)} />
        <Route path="/tarifario" element={modulo(<P.Tarifario />)} />
        <Route path="/archivos" element={modulo(<P.Archivos />)} />
        <Route path="/shippers" element={modulo(<P.Shippers />)} />
        <Route path="/shippers/:id" element={modulo(<P.Shipper />)} />
        <Route path="/integraciones" element={modulo(<P.Integraciones />)} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

// En el simulado, la liga del carrier es la de la Mesa; con Rateware real, el
// Bid Room de Bidware (el que reciben los carriers en sus invitaciones).
function LigaDelCarrier() {
  const s = useSesion();
  const { token = "" } = useParams();
  if (s.modo === "rateware") return publica(<P.BidRoom />);
  return (
    <main className="contenido solo">
      <LigaCarrier token={token} />
    </main>
  );
}

function MesaDelEvento() {
  const { id = "" } = useParams();
  return <Mesa key={id} id={id} />;
}

function Equipo() {
  const s = useSesion();
  if (s.modo === "rateware" && s.listo && !s.correo) return <Entrar />;
  return (
    <Marco>
      <Outlet />
    </Marco>
  );
}

function Entrar() {
  const s = useSesion();
  return (
    <main className="contenido solo">
      <div className="tarjeta entrar">
        <h1>Bid Room</h1>
        {s.error ? (
          <div className="estado estado-error">{s.error}</div>
        ) : (
          <>
            {s.correoRechazado !== null && (
              <div className="estado estado-permiso" role="alert">
                Fr8Bid es solo para cuentas de xbfreight.com y heymarksman.com
                {s.correoRechazado ? ` (entraste con ${s.correoRechazado})` : ""}. Elige tu cuenta del equipo.
              </div>
            )}
            <button className="btn-primario" onClick={s.entrar}>
              Entrar con Google
            </button>
          </>
        )}
      </div>
    </main>
  );
}
