---
name: fr8bid-carta-oferta
description: Prepara una carta oferta PDF para el shipper, con tarifa de venta y evidencia de mercado, sin costo ni identidad de carriers; primero propone diseños y obtiene aprobación del criterio estadístico.
---

# Carta oferta para el shipper

1. Identifica shipper, evento, rutas, caja, moneda, vigencia y condiciones mediante el MCP Fr8Bid y archivos autorizados. No adjudica, reserva capacidad ni envía. HDships está fuera; PRIMA permanece abierto y sin avisos.
2. Primero presenta las alternativas visuales de `references/carta-oferta-direcciones.html`. Jose eligió B (tabla de rutas) el 17-nov-2026 para este encargo: usa `references/carta-oferta-b.html`; no vuelvas a pedir esa elección. Para otro encargo sin dirección elegida, pide elegir A, B o C antes del PDF final. Usa los activos oficiales MARKSMAN XBF; no inventes logo. Las alternativas son wireframes con datos sintéticos y tipografías de sistema declaradas, no certificación de marca.
3. El estudio de O-I toma como fuentes autorizadas «MARKSMAN_OI_R2_Market Test_Incumbent Carriers.xlsx», «Resultado_OI_49_carriers_Colombia.xlsx» y las ofertas RFx del 9 al 13 de noviembre. Localiza y lee las fuentes; si falta una, declara cobertura parcial. No tomes los umbrales manuales como percentiles calculados.
4. Antes de calcular, somete al visto bueno de Jose: población comparable por ruta/caja/moneda/modelo/fecha, eliminación de duplicados (no contar la misma oferta en Excel y RFx), selección de versión y método de percentil (propuesta: interpolación lineal inclusiva). Propón mostrar número de observaciones y origen por ruta, y «evidencia limitada» si n ≤ 5; L3–L8 son una advertencia a comprobar, no conteos asumidos. No declares aprobado este criterio por la solicitud de la carta.
5. Separa un estudio interno de la carta del shipper. En el interno conserva datos fuente, exclusiones, fórmulas y trazabilidad. No combines monedas, ni ofertas con pagos, ni percentiles de costo con tarifa de venta. No recomiendes un percentil objetivo sin aprobación; n=0 implica sin evidencia y n=1 no permite concluir un mercado.
6. Tarifa de venta (Board price): cost/fee plus = costo base × 1.03; brokerage = costo base × 1.12; sell share = all-in. Verifica qué campo es costo base y qué campo ya es venta; no apliques dos veces el margen. Si falta modelo o base, pregunta. Redondea solo al presentar y conserva moneda y unidad.
7. El PDF del shipper contiene solo ruta/caja, tarifa de venta, moneda/unidad, vigencia, condiciones, fuente agregada y cobertura aprobada. **Nunca** nombres/IDs de carriers, costo, margen, fee/share, correos, notas internas ni enlaces privados. Los percentiles de costos son internos: no los incluyas en texto, gráficos o anexos. No adjuntes el estudio interno.
8. Tras las aprobaciones, genera el PDF con herramienta local disponible. Revisa visualmente todas las páginas y extrae texto para comprobar la lista permitida; revisa también metadatos, adjuntos y capas ocultas. No basta ocultar columnas. Si faltan logo/fuentes oficiales, solicita los activos antes de afirmar entrega final de marca.
9. Entrega el archivo para revisión, sin correo ni envío automático, y declara fuentes faltantes y evidencia limitada. No presentes la propuesta como adjudicación ni tarifa confirmada del carrier.

Ejemplos: «Arma una carta oferta para O-I», «Muéstrame diseños antes del PDF», «Incluye respaldo de mercado sin revelar nuestros costos».
