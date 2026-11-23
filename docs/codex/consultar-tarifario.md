# Consulta del tarifario general de Rateware en Codex

En un chat de Codex con el proyecto Fr8Bid y el conector Fr8Bid MCP, pide «Consulta el tarifario general de Rateware, incluyendo históricas y vencidas, de Laredo, TX, US a Monterrey, NL, MX para Truck Trailer Reefer de 53 pies, servicio FTL». Para Nuevo Laredo, consulta por separado con Tamaulipas y México como estado y país.

```json
{
  "origen": {"ciudad": "Laredo", "estado": "TX", "pais": "US"},
  "destino": {"ciudad": "Monterrey", "estado": "NL", "pais": "MX"},
  "equipo": "Truck Trailer Reefer 53'",
  "tipo_servicio": "FTL",
  "incluir_historicas": true,
  "incluir_vencidas": true,
  "limit": 50
}
```

La fuente operativa es `public.rate_staging` de Rateware. La pantalla de tarifas aprobadas usa `list_rateware` sobre la misma tabla con filtro de aprobación. La consulta general conserva la procedencia de filas históricas y el ámbito de la organización. Las fuentes de ofertas, adjudicaciones y targets de eventos tienen otra semántica. Para comparar eventos específicos, la herramienta existente `tarifas_ruta` admite `event_ids`.

Mantén los mismos filtros y pasa `siguiente_cursor` como `cursor` hasta recibir `completa: true`. Una página puede tener cero coincidencias y todavía tener continuación. `limit` admite de 1 a 200 candidatas por página (50 por defecto). Cada lectura consulta el estado de Rateware en ese momento. Si hay un error o se interrumpe el recorrido, informa cobertura parcial. Cuenta por separado los registros y los transportistas únicos.

Para restringir a un transportista, usa `carrier_id` de Rateware. `operacion` permite acotar la modalidad registrada. Ambos indicadores de inclusión están activos por defecto. `incluir_historicas=false` solicita sólo vigencia comprobable en la fecha de consulta. `incluir_vencidas=false` excluye las vencidas identificables; una fecha desconocida conserva esa etiqueta. La fecha de cotización y la fecha de importación no acreditan el inicio de vigencia.

Cada elemento de `tarifas` identifica `tarifa_id`, `carrier_id`, nombre comercial, razón social disponible, corredor y equipo. Para responder «¿quién cotizó?» comprueba `fuente.tipo`. Para «¿cuál está vigente?» comprueba `vigencia`. Usa `tipo_importe`, `importe_original` y `moneda_original` juntos. Si sólo existen `importe_registrado` y `moneda_registrada`, identifícalos como valores del tarifario y deja desconocidos los originales. La fecha del embarque en una referencia histórica se devuelve como `fecha_referencia`. Condiciones, restricciones y capacidad sólo sirven como evidencia cuando constan en la fila. `candidatas_examinadas` y `descartadas` corresponden a esa página.

## Ejemplo verificado el 20-nov-2026

En el workspace consultado no hubo coincidencias que acreditaran simultáneamente 53 pies y FTL para esos dos corredores. Al buscar por Truck Trailer y Reefer sin exigir longitud ni FTL, Laredo → Monterrey tuvo siete costos históricos de cuatro carriers y Nuevo Laredo → Monterrey tuvo cero. Los siete procedían de embarques de la hoja `MX Southbound` con `Shipment ID`, `Incumbent Cost` e `Incumbent Currency`. El servicio estaba registrado como `One Way`, la configuración como `Single` y la operación como `MX Southbound`. Ninguno tenía fecha final de vigencia.

Los registros identificados como costos incumbentes se presentan con su importe y moneda originales, el periodo del embarque y la vigencia desconocida. La verificación también identificó un target real del corredor mexicano en `rfx_lanes.target_rate`. Su exclusión se comprobó por identificador y por procedencia.

La comprobación usó lecturas SQL en la organización de Rateware. El primer filtro geográfico abarcó 1,036 filas en 27 combinaciones de ubicación, equipo y servicio. Se contrastaron esas combinaciones con los filtros exactos y se llamó al MCP local por HTTP con la proyección de los siete registros recuperados. En páginas de dos se obtuvieron 2, 2, 2 y 1 registros con siete identificadores distintos. Para habilitar esta consulta en el conector de Codex, primero publica la acción de lectura de Rateware y luego Fr8Bid. Comprueba que `tools/list` anuncie `consultar_tarifario` y haz una lectura con la sesión OAuth de Codex.
