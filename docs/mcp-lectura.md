# MCP de Fr8Bid · entrega 1, segunda ronda

2026-11-12. Base de esta tarea: `77408197`, rama `codex/mcp-lectura-2`.
Estado: código y pruebas preparados; no ejecutados en esta sesión, no desplegados ni utilizados con datos reales.

La entrega 2 (cambios con vista previa y «sí»: `preparar_*` y `confirmar`) está en [mcp-escrituras.md](mcp-escrituras.md).

## Alcance y comparación reutilizada

La primera ronda (`31919ab`, rama local `codex/mcp-lectura`) preparó dos herramientas y un subconjunto manual de MCP, sin OAuth. El alcance documental de entrega 1 pide once lecturas y cuatro skills. Existe una implementación local de ese alcance en `8404dbb`, consultada mediante Git sin modificar su checkout. Se reutilizan sus módulos, pruebas, skills y dependencias fijadas; esta sesión no acredita sus resultados históricos como pruebas de este cambio.

| Alternativa | Ajuste y mantenimiento | Costo e integración |
| --- | --- | --- |
| Ampliar el adaptador manual de la ronda 1 | Obliga a mantener negociación, transporte y errores; OAuth y nueve lecturas seguían pendientes. | Sin SDK, mayor retrabajo de capacidades estándar. |
| Reutilizar el servidor SDK existente localmente | Once lecturas sobre `MesaApi`, reglas de dominio y `/api/rateware`; no duplica backend. SDK y adaptador Apache-2.0 según lockfile; JOSE/Zod MIT. | Recomendado. Dependencias ya documentadas y fijadas; sin proveedor o servicio nuevo. Consumo incremental de Vercel/Auth/Rateware desconocido. |
| Servidor stdio separado | Válido para clientes locales, pero añade distribución y arranque por equipo. | No resuelve el endpoint remoto solicitado. |

Se adopta la segunda alternativa: `@modelcontextprotocol/server` 2.4.0, `@modelcontextprotocol/node` 2.1.2, JOSE 6.2.17 y Zod 4.6.7, con el lockfile local existente. No se instalaron dependencias ni se verificó su disponibilidad o documentación en línea: la sesión prohíbe red. El orquestador debe revisar estos paquetes antes de instalarlos. Referencias documentales heredadas para su revisión: [SDK oficial](https://github.com/modelcontextprotocol/typescript-sdk), [autorización MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization) y [Supabase OAuth MCP](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication). No se atribuye vigencia ni compatibilidad real a esas referencias por haberlas listado.

Método: `mcp-builder`, pruebas preparadas antes de los ajustes; su ejecución queda al orquestador. Ejecutor: Codex delegado en este checkout, sin inferencias externas ni cambio de modelo. Recomendación para este alcance: Sol/Medium; modelo/esfuerzo efectivos no certificados. Cierre: revisión del mismo commit y verificación local por Claude, sin despliegue, con correcciones dirigidas y sin reintentos automáticos de lecturas.

## Recorrido y criterios

Frase del usuario → skill → resolver evento → herramienta MCP → `/api/rateware` del origen configurado → proxy → Rateware con identidad del usuario. La autoridad financiera sigue en ERP. No hay pantalla nueva: la salida es un resumen o tabla con fecha, cobertura y enlace `/eventos/:id` a la Mesa.

Herramientas: `eventos`, `evento`, `seguimiento_evento`, `respuestas_evento`, `ofertas_evento`, `historial_oferta`, `candados_ruta`, `carriers_sugeridos`, `tarifas_ruta`, `carrier`, `historial_carrier`.

- Contratos estrictos, sin `action` arbitraria. Solo lecturas, incluso con la bandera global de escrituras habilitada. Sin `preparar_*`, `confirmar`, adjudicación, entrega o envío. Prima se conserva abierta; HDships se rechaza antes de consultar sus IDs y se filtra de resultados.
- Se reutilizan seguimiento/cadencia, modelo comercial, recorrido/candados, mapeadores y lectura de cierre existente. Comparación por moneda sin sumarle share al all-in. Historial: solo versiones disponibles, nunca promesa de exhaustividad.
- Cada petición crea servidor y transporte nuevos. Sin caché de usuarios, cookies, persistencia, redirecciones ni reintentos. Origen HTTP permitido mediante lista cerrada; no se usa Host del cliente para elegir destino.
- OAuth valida firma, emisor, audiencia del MCP, cliente permitido, expiración, identidad y rol actualizado en Auth. Nunca service-role ni JWT genérico de navegador. Sin configuración devuelve 503. Descubrimiento en `/.well-known/oauth-protected-resource/api/mcp` y `/api/mcp-metadata`.
- Los fallos se devuelven sin copiar mensajes externos. Respuestas malformadas no se presentan como resultados vacíos; un detalle de otro evento falla. Si respuestas/revisiones no pudieron consultarse, se conserva su cobertura parcial y sus bloqueos.
- Listados paginados sobre lo recibido, no sobre toda la base. Tarifas D2D por familias admitidas en el proxy; hasta 1000 registros examinados por página y cinco eventos seleccionados. Seguir el offset incluso sin coincidencias. Comparar ciudad exige verificar estado/país. Tarifas y ofertas no prueban pagos. Historial de contacto: hasta 300 registros. Salida mayor de 200000 caracteres falla sin truncar JSON.
- Skills 1, 2, 5 y 14: `.claude/skills/fr8bid-{pendientes,estado-evento,comparar-ofertas,historico-tarifas}/SKILL.md`. Preparados para descubrimiento de Claude; `.agents` es de solo lectura en este entorno y no se modificó. No están instalados en ChatGPT ni se afirma sincronización con otros hosts.

## OAuth y activación pendientes

Este código implementa un recurso protegido; no crea un servidor OAuth ni una pantalla de consentimiento. Antes de habilitarlo, el propietario y Claude deben comprobar:

1. OAuth Server en el Supabase existente, login Google, consentimiento y clientes prerregistrados con callbacks exactos y PKCE. Si falta consentimiento UI, es trabajo de producto pendiente.
2. Token de usuario con audiencia exacta del MCP y cliente permitido. Confirmar su autorización en `/api/rateware` downstream: si requiere intercambio de tokens, decidir el contrato antes de implementarlo. No relajar audiencia ni introducir service-role para sortearlo.
3. En otra acción autorizada: configurar `FR8BID_MCP_RESOURCE`, `FR8BID_MCP_CLIENT_IDS` y reutilizar configuración de servidor de Rateware. No se leyeron ni cambiaron secretos o variables reales.
4. Proponer cuenta nominal **Operador** del equipo (Viewer sirve para consulta), sin crearla ni asignarle permisos en esta tarea.
5. Tras aprobación y despliegue: login, consentimiento/negación, refresh, revocación, vencimiento, cambio de cuenta, organización ajena y desconexión en el cliente elegido. Las pruebas sintéticas no acreditan estos recorridos reales.

## Verificación y continuidad

Pruebas preparadas: once lecturas repetidas sin mutaciones, aislamiento de cuentas, fallos sin reintentos, tarifas paginadas, condiciones y versiones, exclusión de protegidos/tokens, negociación HTTP SDK, OAuth sintético y endpoint con identidad simulada. Se añadieron regresiones para respuestas inválidas, detalle con ID distinto y bloqueo previo de IDs protegidos del histórico. La sesión no ejecutó pruebas, builds ni instalaciones.

Después de revisar código, scripts y dependencias, el orquestador ejecuta `npm test -- test/mcp.test.ts test/mcp-auth.test.ts test/mcp-http.test.ts test/mcp-endpoint.test.ts test/mcp-fronteras.test.ts`, y después `npm run agentes:verificar -- --nombre mcp-lectura-2 --revision <id>` desde el checkout de origen sobre el mismo commit revisado. Mantener separadas preparación, pruebas locales y uso real.

Siguiente acción: revisión escéptica, verificación por Claude y resolución de hallazgos. No se hizo commit, push, merge, despliegue ni acceso real a Rateware. Rollback: retirar módulos MCP, pruebas y skills, revertir sus dependencias y rewrites; no hay datos migrados. `vercel.json` prepara rewrites y exclusión de despliegue para esta rama; no prueba configuración aplicada en Vercel.
