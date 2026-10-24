// Pantallas traídas de Bidware (src/bidware). Cada una carga aparte, dentro de
// .bw para que sus estilos no choquen con los de la Mesa.

import { lazy, Suspense, type ComponentType, type ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import "@/styles/global.css";
import { MODO } from "./sesion";

function pantalla<K extends string>(cargar: () => Promise<Record<K, ComponentType>>, nombre: K) {
  return lazy(() => cargar().then((m) => ({ default: m[nombre] })));
}

export const P = {
  Panel: pantalla(() => import("@/pages/DashboardPage"), "DashboardPage"),
  Callback: pantalla(() => import("@/pages/CallbackPage"), "CallbackPage"),
  NuevoEvento: pantalla(() => import("@/features/rfx-admin/NewEventPage"), "NewEventPage"),
  DetalleEvento: pantalla(() => import("@/features/rfx-admin/RfxDetailPage"), "RfxDetailPage"),
  Mensaje: pantalla(() => import("@/features/outreach/MessagePage"), "MessagePage"),
  Cola: pantalla(() => import("@/features/outreach/DeliveryQueuePage"), "DeliveryQueuePage"),
  RevisionContactos: pantalla(() => import("@/features/outreach/ContactReviewPage"), "ContactReviewPage"),
  Avisos: pantalla(() => import("@/features/rfx-admin/AwardNoticesPage"), "AwardNoticesPage"),
  Chat: pantalla(() => import("@/features/rfx-admin/EventChatPage"), "EventChatPage"),
  Plantillas: pantalla(() => import("@/features/outreach/TemplatesPage"), "TemplatesPage"),
  Plantilla: pantalla(() => import("@/features/outreach/TemplateEditorPage"), "TemplateEditorPage"),
  Listas: pantalla(() => import("@/features/carrier-templates/CarrierTemplatesPage"), "CarrierTemplatesPage"),
  Evidencia: pantalla(() => import("@/features/carrier-templates/EvidenceReviewPage"), "EvidenceReviewPage"),
  Lista: pantalla(() => import("@/features/carrier-templates/TemplateBuilderPage"), "TemplateBuilderPage"),
  CarrierFit: pantalla(() => import("@/features/carrier-fit/CarrierFitPage"), "CarrierFitPage"),
  Crm: pantalla(() => import("@/features/carrier-crm/CarrierCrmPage"), "CarrierCrmPage"),
  Higiene: pantalla(() => import("@/features/carrier-crm/HygienePage"), "HygienePage"),
  Rebotes: pantalla(() => import("@/features/carrier-crm/BouncesPage"), "BouncesPage"),
  QuoteDesk: pantalla(() => import("@/features/quotedesk/QuoteDeskPage"), "QuoteDeskPage"),
  Cotizacion: pantalla(() => import("@/features/quotedesk/QuoteDetailPage"), "QuoteDetailPage"),
  ColaCotizacion: pantalla(() => import("@/features/quotedesk/QuoteDeliveryQueuePage"), "QuoteDeliveryQueuePage"),
  Tarifas: pantalla(() => import("@/features/rate-review/RateReviewPage"), "RateReviewPage"),
  Tarifario: pantalla(() => import("@/features/rate-base/RateBasePage"), "RateBasePage"),
  Archivos: pantalla(() => import("@/features/rate-uploads/UploadsPage"), "UploadsPage"),
  Shippers: pantalla(() => import("@/features/shippers/ShippersPage"), "ShippersPage"),
  Shipper: pantalla(() => import("@/features/shippers/ShipperDetailPage"), "ShipperDetailPage"),
  Intake: pantalla(() => import("@/features/shipper-intake/ShipperIntakeAdminPage"), "ShipperIntakeAdminPage"),
  Integraciones: pantalla(() => import("@/features/integrations/IntegrationsPage"), "IntegrationsPage"),
  // Públicas: carriers y shippers entran con su liga, sin sesión.
  BidRoom: pantalla(() => import("@/features/bid-room/BidRoomPage"), "BidRoomPage"),
  Tablero: pantalla(() => import("@/features/public-board/PublicBoardPage"), "PublicBoardPage"),
  PerfilCarrier: pantalla(() => import("@/features/carrier-profile/CarrierProfilePage"), "CarrierProfilePage"),
  PerfilShipper: pantalla(() => import("@/features/shipper-profile/ShipperProfilePage"), "ShipperProfilePage"),
  SolicitudShipper: pantalla(() => import("@/features/shipper-request/ShipperRequestPage"), "ShipperRequestPage")
};

// Contenedor de una pantalla de Bidware: dentro del marco de Fr8Bid, o a página
// completa en las públicas.
export function Bw({ children, publica = false }: { children: ReactNode; publica?: boolean }) {
  return (
    <div className={publica ? "bw bw-publica" : "bw"}>
      {MODO === "simulado" && !publica && (
        <div className="bw-simulado" role="note">
          Modo simulado: este módulo trabaja con Rateware real y aquí no tiene datos. La Mesa sí funciona con el evento de prueba.
        </div>
      )}
      <Suspense fallback={<div className="bw-cargando">Cargando…</div>}>{children}</Suspense>
    </div>
  );
}

// Las ligas viejas del evento abren la Mesa.
export function AMesa() {
  const { id } = useParams();
  return <Navigate to={`/eventos/${id}`} replace />;
}

// rateware's settings page: the Google callback still falls back to it.
export function AIntegraciones() {
  const { search } = useLocation();
  return <Navigate to={`/integraciones${search}`} replace />;
}
