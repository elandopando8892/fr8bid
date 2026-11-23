---
name: fr8bid-carta-oferta
description: Prepara una carta oferta en PDF para el shipper («arma la carta oferta de [evento]») con la tarifa de venta por ruta y la cobertura de mercado, sin costos ni carriers; pide aprobar el criterio estadístico antes de calcular y nunca la envía.
---

# Carta oferta para el shipper

1. Usa el MCP **Fr8Bid** (OAuth). Resuelve el evento con `eventos(buscar=...)` y confirma folio y shipper. Lee `evento(event_id)` (rutas, caja, moneda, plazo, condiciones) y `ofertas_evento(event_id)` siguiendo `siguiente_offset` hasta cubrir todas las rutas. Para mercado fuera del evento usa `tarifas_ruta(...)` o `consultar_tarifario(...)`. No adjudica, no reserva capacidad ni envía. HDships está fuera; Prima (RFx-1021-PRIMAPro) sigue abierto y no recibe carta ni avisos.
2. Diseño: Jose eligió la **dirección B (tabla de rutas)** el 17-nov-2026. Usa `references/carta-oferta-b.html` y no vuelvas a preguntar. Solo si Jose pide otra cosa, muestra `references/carta-oferta-direcciones.html` (A carta comercial, B tabla de rutas, C propuesta y alcance). Son wireframes con datos sintéticos y Arial declarada; usa los activos oficiales MARKSMAN XBF y no inventes logo. Si faltan, pídelos antes de llamar «final» al PDF.
3. Fuentes de mercado de O-I (en las Descargas de Jose, no en el repo): «MARKSMAN_OI_R2_Market Test_Incumbent Carriers.xlsx» (R2, 2-oct), «Resultado_OI_49_carriers_Colombia.xlsx» (2-nov) y las ofertas del RFx del 9 al 13-nov. Si una falta, declara cobertura parcial. Los percentiles escritos a mano en el market test no son percentiles calculados: recalcúlalos con los datos.
4. Antes de calcular, pide el visto bueno de Jose al criterio, con una propuesta concreta:
   - población comparable por ruta, caja, moneda, modelo y fecha;
   - sin duplicados (la misma oferta no cuenta en el Excel y en el RFx);
   - una sola versión por carrier (la vigente);
   - percentil por interpolación lineal inclusiva;
   - por ruta, número de datos y origen; «evidencia limitada» si n ≤ 5; n = 0 es «sin evidencia» y n = 1 no describe un mercado.
   Pedir la carta no aprueba el criterio.
5. Separa el **estudio interno** de la **carta del shipper**. El interno conserva datos fuente, exclusiones, fórmulas y trazabilidad. No mezcles monedas, ofertas con pagos ni percentiles de costo con tarifa de venta. No recomiendes un percentil objetivo sin aprobación.
6. Tarifa de venta (Board price): cost/fee plus = costo base × 1.03; brokerage = costo base × 1.12; sell share = all-in. Comprueba qué campo es costo y cuál ya es venta para no aplicar el margen dos veces. Si falta el modelo o la base, pregunta. Redondea solo al presentar y conserva moneda y unidad.
7. La carta del shipper lleva solo ruta y caja, tarifa de venta, moneda y unidad, vigencia, condiciones, fuente agregada y la cobertura aprobada. **Nunca**: nombres o IDs de carriers, costo, margen, fee o share, percentiles de costo, correos, notas internas ni ligas privadas (tampoco la de la página del evento). No adjuntes el estudio interno.
8. Con las aprobaciones, genera el PDF con una herramienta local. Revisa cada página a la vista y extrae su texto para confirmar que solo trae lo permitido; revisa también metadatos, adjuntos y capas ocultas. Ocultar columnas no basta.
9. Entrega el PDF para revisión de Jose, con fuentes faltantes y rutas con evidencia limitada. No lo envíes por correo ni lo presentes como adjudicación o tarifa confirmada por un carrier.

Ejemplos: «Arma la carta oferta de O-I», «Muéstrame el diseño antes del PDF», «Incluye respaldo de mercado sin revelar nuestros costos».
