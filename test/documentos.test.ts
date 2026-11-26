// Perfiles y solicitud que leen documentos (prioridad 8, 26-nov-2026). La IA
// propone desde la liga privada; aquí se prueba lo que Fr8Bid acepta y cuándo
// se niega a leer.

import { describe, expect, it } from "vitest";
import { aceptarDocumentos, camposValidos, citaEnTexto, citaRespalda, mismoValor, opcionDe, type CampoDocumento } from "../src/dominio/documentos";
import { dentroDelLimite, leerDocumentos, ligaActiva, MAX_LECTURAS_POR_HORA, type ConsultaDocumentos, type LeerDocumentos, type ValidarLiga } from "../src/servidor/documentos";
import { documentFields as camposCarrier, fieldByKey } from "../src/bidware/features/carrier-profile/profile.schema";
import { addReadLanes, laneFields, laneFrom, laneSummary, untouched } from "../src/bidware/features/shipper-request/lectura";
import { emptyDraft } from "../src/bidware/features/shipper-request/request.model";

const campos: CampoDocumento[] = [
  { clave: "identity.rfc", etiqueta: "RFC", tipo: "texto" },
  { clave: "general.company_type", etiqueta: "Tipo de empresa", tipo: "opcion", opciones: ["Persona Fisica", "Persona Moral"] },
  { clave: "carrier_profile.certifications", etiqueta: "Certificaciones", tipo: "lista", opciones: ["CTPAT", "OEA", "SmartWay"] }
];

const pdf = { nombre: "csf.pdf", tipo: "application/pdf", base64: "JVBERi0xLjQK" };
const base = (extra: Record<string, unknown> = {}) => ({ origen: "perfil_carrier", token: "tok-123", idioma: "es", adjuntos: [pdf], campos, ...extra });
const valida: ValidarLiga = async () => true;
const leeIgual = (cruda: unknown): LeerDocumentos => async () => cruda;

describe("lo que se acepta de la IA", () => {
  it("solo claves del formulario y opciones que existen", () => {
    const l = aceptarDocumentos(
      {
        resumen: "Constancia de Transportes del Norte",
        campos: [
          { clave: "identity.rfc", valores: ["TNO 010101 AB1"], cita: "csf.pdf: RFC TNO010101AB1" },
          { clave: "general.company_type", valores: ["persona moral"], cita: "Régimen: Persona Moral" },
          { clave: "carrier_profile.certifications", valores: ["ctpat", "ISO 27001", "OEA"], cita: "Certificaciones: CTPAT, OEA" },
          { clave: "payments.clabe_number", valores: ["0123"], cita: "inventado" },
          { clave: "general.company_type", valores: ["Persona Fisica"], cita: "repetido" }
        ],
        rutas: [{ campos: [] }],
        dudas: ["La constancia es de 2023", ""]
      },
      campos,
      []
    );
    expect(l.campos).toEqual([
      { clave: "identity.rfc", valores: ["TNO 010101 AB1"], cita: "csf.pdf: RFC TNO010101AB1" },
      { clave: "general.company_type", valores: ["Persona Moral"], cita: "Régimen: Persona Moral" },
      { clave: "carrier_profile.certifications", valores: ["CTPAT", "OEA"], cita: "Certificaciones: CTPAT, OEA" }
    ]);
    expect(l.rutas).toEqual([]);
    expect(l.dudas).toEqual(["La constancia es de 2023"]);
  });

  it("un valor sin cita no se presenta como leído", () => {
    const l = aceptarDocumentos({ campos: [{ clave: "identity.rfc", valores: ["XAXX010101000"], cita: " " }] }, campos, []);
    expect(l.campos).toEqual([]);
  });

  it("con solo texto, una cita que no aparece en él se descarta", () => {
    const fuente = "Razón social: Transportes del Norte\nRFC: TNO-010101-AB1\nCertificaciones CTPAT y OEA";
    expect(citaEnTexto("RFC TNO010101AB1", fuente)).toBe(true);
    expect(citaEnTexto("correo.txt: RFC: TNO-010101-AB1", fuente)).toBe(true);
    expect(citaEnTexto("Razón social … RFC", fuente)).toBe(true);
    expect(citaEnTexto("RFC: XAXX010101000", fuente)).toBe(false);
    const l = aceptarDocumentos(
      {
        campos: [
          { clave: "identity.rfc", valores: ["TNO010101AB1"], cita: "RFC: TNO-010101-AB1" },
          { clave: "general.company_type", valores: ["Persona Moral"], cita: "Régimen: Persona Moral" }
        ]
      },
      campos,
      [],
      fuente
    );
    expect(l.campos.map((c) => c.clave)).toEqual(["identity.rfc"]);
    // La cita existe, pero no respalda el valor: no entra.
    const otro = aceptarDocumentos({ campos: [{ clave: "identity.rfc", valores: ["XAXX010101000"], cita: "RFC: TNO-010101-AB1" }] }, campos, [], fuente);
    expect(otro.campos).toEqual([]);
    expect(citaRespalda("40,000", "Peso 40000 lbs")).toBe(true);
    expect(citaRespalda("2026-12-01", "carga el 1 de diciembre")).toBe(true);
    expect(citaRespalda("Laredo, TX, US", "de Monterrey a Laredo")).toBe(true);
    expect(citaRespalda("Querétaro", "de Monterrey a Laredo")).toBe(false);
    expect(citaRespalda("5", "5 cargas por semana")).toBe(true);
    expect(citaRespalda("9", "5 cargas por semana")).toBe(false);
    expect(citaRespalda("5", "15 cargas por semana")).toBe(false);
    expect(citaRespalda("40000", "peso de 40,000 lbs")).toBe(true);
    expect(citaRespalda("1.5", "15 cargas")).toBe(false);
    expect(citaRespalda("15", "1.5 cargas")).toBe(false);
    expect(citaRespalda("1,5", "1.5 cargas")).toBe(true);
    // Cita con varios números: ambigua, el valor no entra.
    expect(citaRespalda("5", "Ruta 5: 15 cargas por semana")).toBe(false);
    expect(citaRespalda("5 cargas", "15 cargas")).toBe(false);
    expect(citaRespalda("5 cargas", "Ruta 5: 15 cargas")).toBe(false);
    expect(citaRespalda("TNO 010101 AB1", "correo.txt: RFC TNO010101AB1")).toBe(true);
    expect(citaRespalda("Av. Constitución 100, Monterrey, NL 64000", "Domicilio: Av. Constitución 100, Monterrey, NL 64000")).toBe(true);
  });

  it("una opción que no existe no se inventa", () => {
    expect(opcionDe(campos[1], "Sociedad Anónima")).toBeNull();
    const l = aceptarDocumentos({ campos: [{ clave: "general.company_type", valores: ["S.A. de C.V."], cita: "Régimen: S.A. de C.V." }] }, campos, []);
    expect(l.campos).toEqual([]);
  });

  it("compara sin mayúsculas, acentos ni orden", () => {
    expect(mismoValor("Persona Moral", ["persona moral"])).toBe(true);
    expect(mismoValor(["OEA", "CTPAT"], ["CTPAT", "OEA"])).toBe(true);
    expect(mismoValor("", ["X"])).toBe(false);
  });

  it("rechaza campos mal formados que lleguen del navegador", () => {
    expect(camposValidos([{ clave: "../x", etiqueta: "x", tipo: "texto" }])).toBeNull();
    expect(camposValidos([{ clave: "a.b", etiqueta: "x", tipo: "opcion" }])).toBeNull();
    expect(camposValidos([{ clave: "a.b", etiqueta: "x", tipo: "texto" }, { clave: "a.b", etiqueta: "y", tipo: "texto" }])).toBeNull();
    expect(camposValidos(campos)).toHaveLength(3);
  });
});

describe("POST /api/documentos", () => {
  it("lee con una liga válida y devuelve solo lo aceptado", async () => {
    let visto: ConsultaDocumentos | null = null;
    const r = await leerDocumentos(base(), valida, async (c) => {
      visto = c;
      return { resumen: "ok", campos: [{ clave: "identity.rfc", valores: ["ABC010101XYZ"], cita: "csf.pdf: RFC ABC010101XYZ" }], rutas: [], dudas: [] };
    });
    expect(r.status).toBe(200);
    expect((r.body as any).lectura.campos).toHaveLength(1);
    expect(visto!.adjuntos[0].nombre).toBe("csf.pdf");
    expect(visto!.camposRuta).toEqual([]);
  });

  it("sin liga activa no llama a la IA", async () => {
    let llamada = false;
    const r = await leerDocumentos(base({ token: "tok-viejo" }), async () => false, async () => {
      llamada = true;
      return {};
    });
    expect(r.status).toBe(401);
    expect(llamada).toBe(false);
  });

  it("valida archivos, texto y campos antes de gastar", async () => {
    const nunca: LeerDocumentos = async () => {
      throw new Error("no debía llamarse");
    };
    expect((await leerDocumentos(base({ origen: "otro" }), valida, nunca)).status).toBe(400);
    expect((await leerDocumentos(base({ adjuntos: [{ ...pdf, tipo: "application/zip" }] }), valida, nunca)).status).toBe(400);
    expect((await leerDocumentos(base({ adjuntos: [], texto: "" }), valida, nunca)).status).toBe(400);
    expect((await leerDocumentos(base({ texto: "x".repeat(30_001) }), valida, nunca)).status).toBe(400);
    // Un perfil no pide rutas y una solicitud sí.
    expect((await leerDocumentos(base({ origen: "solicitud" }), valida, nunca)).status).toBe(400);
    expect((await leerDocumentos(base({ camposRuta: laneFields("rfq", "es") }), valida, nunca)).status).toBe(400);
  });

  it("habla el idioma de la persona", async () => {
    const r = await leerDocumentos(base({ idioma: "en", token: "tok-en" }), async () => false, null);
    expect((r.body as any).error).toMatch(/link/);
  });

  it("sin clave de IA lo dice en palabras de la persona", async () => {
    const r = await leerDocumentos(base({ token: "tok-sin-ia" }), valida, null);
    expect(r.status).toBe(503);
    expect((r.body as any).error).toMatch(/a mano/);
  });

  it("un fallo de la IA no deja la página rota", async () => {
    const r = await leerDocumentos(base({ token: "tok-falla" }), valida, async () => {
      throw new Error("x");
    });
    expect(r.status).toBe(502);
  });

  it("un 200 sin la liga activa no abre la lectura", () => {
    const ahora = Date.parse("2026-11-26T12:00:00Z");
    const carrier = { request: { id: "r1", status: "sent", expires_at: "2026-12-31T00:00:00Z" }, vendor: { id: "v1" } };
    expect(ligaActiva("perfil_carrier", carrier, ahora)).toBe(true);
    expect(ligaActiva("perfil_carrier", { error: "invalid token" }, ahora)).toBe(false);
    expect(ligaActiva("perfil_carrier", { ok: true }, ahora)).toBe(false);
    expect(ligaActiva("perfil_carrier", { ...carrier, request: { ...carrier.request, status: "revoked" } }, ahora)).toBe(false);
    expect(ligaActiva("perfil_carrier", { ...carrier, request: { ...carrier.request, expires_at: "2026-11-01T00:00:00Z" } }, ahora)).toBe(false);
    expect(ligaActiva("perfil_shipper", { request: { id: "r2", status: "sent", expires_at: null }, shipper: { id: "s1" } }, ahora)).toBe(true);
    expect(ligaActiva("perfil_shipper", carrier, ahora)).toBe(false);
    const solicitud = { project: { id: "p1" }, link: { id: "l1", status: "active", expires_at: null } };
    expect(ligaActiva("solicitud", solicitud, ahora)).toBe(true);
    expect(ligaActiva("solicitud", { ...solicitud, link: { ...solicitud.link, status: "expired" } }, ahora)).toBe(false);
    expect(ligaActiva("solicitud", { project: { id: "p1" } }, ahora)).toBe(false);
  });

  it("frena una liga que lee de más", () => {
    const ahora = 1_000_000;
    for (let i = 0; i < MAX_LECTURAS_POR_HORA; i += 1) expect(dentroDelLimite("tok-frenado", ahora + i)).toBe(true);
    expect(dentroDelLimite("tok-frenado", ahora + 100)).toBe(false);
    expect(dentroDelLimite("tok-frenado", ahora + 3_600_001)).toBe(true);
  });

  it("la solicitud devuelve rutas", async () => {
    const r = await leerDocumentos(
      { origen: "solicitud", token: "tok-sol", idioma: "es", texto: "Monterrey a Laredo, 5 por semana, caja seca", campos: [], camposRuta: laneFields("rfq", "es") },
      valida,
      leeIgual({
        resumen: "",
        campos: [],
        rutas: [
          {
            campos: [
              { clave: "origin", valores: ["Monterrey, NL, MX"], cita: "Monterrey a Laredo, 5 por semana, caja seca" },
              { clave: "destination", valores: ["Laredo, TX, US"], cita: "Monterrey a Laredo, 5 por semana, caja seca" },
              { clave: "equipment", valores: ["dry van"], cita: "Monterrey a Laredo, 5 por semana, caja seca" },
              { clave: "loads", valores: ["5"], cita: "Monterrey a Laredo, 5 por semana, caja seca" }
            ]
          },
          { campos: [] }
        ],
        dudas: []
      })
    );
    expect(r.status).toBe(200);
    expect((r.body as any).lectura.rutas).toHaveLength(1);
  });
});

describe("el perfil del carrier ofrece sus campos", () => {
  it("con las mismas claves que guarda el formulario", () => {
    const lista = camposCarrier("es");
    expect(camposValidos(lista)).not.toBeNull();
    expect(lista.find((c) => c.clave === "identity.rfc")?.tipo).toBe("texto");
    expect(lista.find((c) => c.clave === "insurance_infrastructure.equipment_types")?.tipo).toBe("lista");
    // Las notas propias del carrier y su canal no salen de un documento.
    expect(lista.some((c) => c.clave === "general.carrier_notes" || c.clave === "company.preferred_channel")).toBe(false);
    expect(fieldByKey("identity.usdot_number")?.field.key).toBe("usdot_number");
  });
});

describe("la solicitud arma rutas con lo leído", () => {
  const leida = [
    { clave: "origin", valores: ["Monterrey, NL, MX"], cita: "" },
    { clave: "destination", valores: ["Laredo, TX"], cita: "" },
    { clave: "equipment", valores: ["Dry Van"], cita: "" },
    { clave: "loads", valores: ["5"], cita: "" },
    { clave: "weight", valores: ["40,000"], cita: "" },
    { clave: "hazmat", valores: ["No"], cita: "" }
  ];

  it("traduce cada campo al formulario", () => {
    const lane = laneFrom("rfq", leida);
    expect(lane.origin?.city).toBe("Monterrey");
    expect(lane.origin?.country).toBe("MX");
    expect(lane.destination?.country).toBe("US");
    // Una ciudad sola no toma el país de la liga: se queda en blanco y se avisa.
    const sola = laneFrom("rfq", [{ clave: "origin", valores: ["Monterrey, NL, MX"], cita: "x" }, { clave: "destination", valores: ["Laredo"], cita: "x" }]);
    expect(sola.destination?.country ?? "").toBe("");
    expect(laneSummary("rfq", [...leida.filter((v) => v.clave !== "destination"), { clave: "destination", valores: ["Laredo"], cita: "x" }], "es").faltan).toContain("Falta país");
    expect(laneSummary("rfq", leida, "es").titulo).toMatch(/\(MX\).*\(US\)/);
    expect(lane.equipment).toBe("Dry Van");
    expect(lane.loads).toBe("5");
    expect(lane.weight).toBe("40000");
    expect(lane.hazmat).toBe(false);
  });

  it("el resumen enseña cada valor que tomará la ruta", () => {
    const mas = [
      ...leida,
      { clave: "service", valores: ["FTL"], cita: "x" },
      { clave: "border_crossing", valores: ["Laredo"], cita: "x" },
      { clave: "notes", valores: ["Cita previa"], cita: "x" }
    ];
    const { datos } = laneSummary("rfq", mas, "es");
    expect(datos).toContain("Sin hazmat");
    expect(datos.some((d) => d.includes("Cita previa"))).toBe(true);
    expect(datos.some((d) => d.startsWith("Cruce"))).toBe(true);
    expect(datos.length).toBeGreaterThanOrEqual(7);
  });

  it("una ruta con solo la fecha tecleada no cede su lugar", () => {
    const draft = emptyDraft("spot", { name: "", company: "", country: "MX" } as any);
    expect(untouched(draft.lanes[0], "spot")).toBe(true);
    const conFecha = { ...draft, lanes: [{ ...draft.lanes[0], pickup_date: "2026-12-01" }] };
    expect(untouched(conFecha.lanes[0], "spot")).toBe(false);
    expect(addReadLanes(conFecha, [leida]).lanes).toHaveLength(2);
    expect(addReadLanes(draft, [leida]).lanes).toHaveLength(1);
  });

  it("sin volumen en el documento, la ruta spot no se queda con un «1» supuesto", () => {
    const sin = leida.filter((v) => v.clave !== "loads");
    expect(laneFrom("spot", sin).loads).toBe("");
    expect(laneFrom("spot", leida).loads).toBe("5");
  });

  it("dice lo que falta en el resumen", () => {
    const sin = leida.filter((v) => v.clave !== "loads");
    expect(laneSummary("rfq", sin, "es").faltan).toEqual(["Falta volumen"]);
    expect(laneSummary("rfq", leida, "es")).toMatchObject({ titulo: expect.stringContaining("→") });
  });

  it("las rutas en blanco ceden su lugar y las llenas se quedan", () => {
    const draft = emptyDraft("rfq", { name: "", company: "", country: "MX" } as any);
    const lleno = addReadLanes(draft, [leida, leida]);
    expect(lleno.lanes).toHaveLength(2);
    const conservada = addReadLanes(lleno, [leida]);
    expect(conservada.lanes).toHaveLength(3);
    expect(conservada.lanes[0].key).toBe(lleno.lanes[0].key);
  });
});
