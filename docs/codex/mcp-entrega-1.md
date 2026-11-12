# MCP y skills de lectura — entrega 1

12-nov-2026. Base revisada: `2d6561a` (PR #44). Diseño canónico del encargo: [skills-80-20-fr8bid.md](skills-80-20-fr8bid.md); alcance: [prompt-codex-mcp-skills.md](prompt-codex-mcp-skills.md). Las fases posteriores del diseño no se implementan aquí.

## Decisión y comparación previa

La capacidad diferencial es traducir consultas cotidianas en lecturas del recorrido Fr8Bid, preservando sus fronteras. MCP, transporte y OAuth son capacidades estándar; se reutilizan.

| Alternativa | Ajuste, seguridad e integración | Tiempo, costo y mantenimiento |
|---|---|---|
| SDK MCP TypeScript oficial, dentro del Vercel actual | Streamable HTTP sin sesiones persistentes; once herramientas cerradas; mismo `/api/rateware`; encaja con TS/Node y Vitest existentes. SDK MIT. | Menor adaptación; no añade proveedor ni servicio. Sigue consumiendo ejecuciones Vercel y lecturas/Auth Supabase del plan vigente; costo incremental no medido. |
| FastMCP en un runtime separado | OAuth y herramientas preconstruidas; requiere adaptar el acceso a `/api` y sostener otro runtime. | Más infraestructura y operación para este proyecto; no aporta una necesidad exclusiva en esta entrega. |
| Protocolo propio | Control completo, pero obliga a mantener negociación, validación, transporte y errores frente a clientes. | Menos dependencias directas, mayor riesgo/retrabajo. Descartado. |

Se elige el SDK oficial v2 disponible en npm (`@modelcontextprotocol/server` 2.4.0, adaptador Node 2.1.2), Zod 4.6.7 y JOSE 6.2.17, fijados en lockfile. La rama v1 está en mantenimiento; no se inicia una implementación nueva en ella. No se contratan servicios ni se ejecutan modelos por API.

Referencias consultadas el 12-nov-2026: [SDK y licencia](https://github.com/modelcontextprotocol/typescript-sdk), [línea v1 en mantenimiento](https://raw.githubusercontent.com/modelcontextprotocol/typescript-sdk/v1.x/README.md), [OAuth MCP](https://modelcontextprotocol.io/specification/2025-11-25/basic/authorization), [MCP con Supabase Auth](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [cambios Supabase](https://supabase.com/changelog.md). La comparación no acredita configuración productiva. Kognoz no dio acceso al módulo con la credencial disponible; cobertura documental local.

## Sprint y contrato

Responsable: Codex nativo, herramientas de agentes/skills/arnés; sin inferencias delegadas de Claude, sin cambiar selector ni asumir esfuerzo efectivo. Método: mcp-builder, TDD, skill-creator y verificación local. Recomendación de ejecución: Sol/Medium para implementación; elección efectiva del host no certificada. Unidad de cierre: un PR en borrador, sin merge ni despliegue. Duración prevista: una sesión de implementación y verificación, condicionada por dependencias y configuración OAuth; sin reintentos automáticos de consultas. Correcciones locales dirigidas por pruebas.

Flujo: frase → skill → resolver ID del evento → herramientas → `/api/rateware` → proxy existente → Rateware como usuario. No acceso directo a tablas/Edge Functions desde el MCP. Fr8Bid conserva `MesaApi`, mapeadores, seguimiento/cadencia, modelos comerciales, candados/recorrido y lectura de cierre. No se cambian pantallas ni reglas de producto. Salida visual: resumen de prioridades o tabla de ruta/carrier, con evidencia, corte y liga a la Mesa; no nueva UI ni branding.

Criterios: once lecturas, cuatro skills con ejemplos, sin herramientas de escritura; bloqueo de protegidos y cuentas ajenas; sin tokens de liga; límite de salida/paginación; sin reintentos; pruebas simuladas reproducibles; typecheck, Vitest, pruebas Bidware y build. No basta con esos checks para certificar login real, roles productivos o instalación en ChatGPT/Claude.

## Archivos y uso

- `api/mcp.ts`: endpoint Streamable HTTP, servidor nuevo por petición; no caché de datos ni sesión compartida.
- `api/mcp-metadata.ts` y rewrites well-known: descubrimiento OAuth, sin datos de negocio.
- `src/mcp/`: catálogo/esquemas, composición de lecturas, validación de identidad y transporte HTTP fijo a la misma aplicación.
- `.agents/skills/fr8bid-{pendientes,estado-evento,comparar-ofertas,historico-tarifas}/SKILL.md`: operaciones trazadas. Codex puede descubrirlas en el repo. Su presencia **no instala ni activa** skills en ChatGPT/Claude; importar esos archivos por el mecanismo soportado del cliente elegido y conectar el MCP después del despliegue autorizado. No se promete sincronización entre hosts.
- `test/mcp*.test.ts`: identidad sintética, protocolo HTTP y Rateware simulado. El fixture toma `sembrarDemo`, fija reloj en 29-oct y cambia solo en memoria el folio a `RFx-FR8BID-PRUEBA-01`.

Herramientas: `eventos`, `evento`, `seguimiento_evento`, `respuestas_evento`, `ofertas_evento`, `historial_oferta`, `candados_ruta`, `carriers_sugeridos`, `tarifas_ruta`, `carrier`, `historial_carrier`.

## OAuth: configuración y validación pendientes del propietario

El código implementa el **recurso protegido**, no un servidor OAuth casero. Usa Supabase Auth como emisor, con su Google login. No lee archivos `.env` ni utiliza service-role. No se ha activado OAuth Server, registrado clientes, creado usuarios ni modificado Vercel desde este trabajo.

Antes de habilitar:

1. Confirmar soporte/configuración de OAuth Server en el Supabase existente y su pantalla de consentimiento. Pre-registrar el cliente de ChatGPT o Claude con callbacks exactos y PKCE; no habilitar registro público por defecto. Consentimiento con acceso de lectura y revocación visible. Si falta UI de consentimiento, es dependencia de producto que debe resolver Claude por PR; no está implementada por este cambio.
2. Verificar que el JWT emitido tenga `iss=<Supabase>/auth/v1`, firma asimétrica ES256/RS256, `exp`, `sub`, `role=authenticated`, `client_id` permitido y **audiencia que incluya exactamente la URL del MCP**. El JWT genérico de la sesión del navegador (`aud=authenticated` únicamente) se rechaza. No relajar esta verificación para “hacerlo funcionar”.
3. Validar con la autoridad de Auth/Rateware el uso de ese token de usuario en el backend integrado `/api/rateware`. El MCP valida destino y emisor antes de reenviar al `/api` de la misma app; no acepta tokens para servicios ajenos. **Compatibilidad de audiencia y autorización downstream pendiente de comprobar**. Si el emisor/backend no admite este contrato, hará falta un intercambio/delegación de tokens explícito, con decisión arquitectónica previa; no agregar un bypass ni service-role. El servidor permanece cerrado mientras falte configuración.
4. En una acción posterior expresamente autorizada, configurar `FR8BID_MCP_RESOURCE=https://fr8bid.heymarksman.com/api/mcp` y `FR8BID_MCP_CLIENT_IDS=<IDs pre-registrados, separados por coma>`. Reutiliza `RATEWARE_SUPABASE_URL` y `RATEWARE_SUPABASE_ANON_KEY` del servidor. No son archivos que deba copiar el agente; ningún valor real se guarda aquí. Configuración incompleta responde 503.
5. Proponer cuenta nominal de agente en dominio del equipo, rol **Operador** administrado desde `app_metadata.roles`, sin admin/service-role. Jose aprueba creación/asignación. Para usos exclusivamente de consulta, Viewer también funciona. La cuenta no se crea en este PR. Verificar acceso por organización en Rateware; un dominio permitido no sustituye su autorización.
6. Después de despliegue autorizado: probar login/consentimiento/negación, refresh y expiración, revocación, cambio de cuenta, rol reducido, acceso ajeno y desconexión desde el cliente real. No se certifican aquí con pruebas sintéticas. Deshabilitar clientes y quitar configuración MCP sirve para retirar acceso; no hace falta tocar tablas de negocio.

La metadata expone el emisor, no credenciales. Cada petición autentica de nuevo y consulta `/auth/v1/user`; el rol se toma de `app_metadata` actualizado, nunca de `user_metadata`. No persiste tokens ni refresh tokens; el cliente OAuth gestiona su sesión. Los errores no devuelven texto externo ni tokens. El transporte bloquea redirecciones y usa el origen configurado, nunca Host enviado por el cliente. La rama está excluida de despliegues Git de Vercel para subir el PR sin preview.

## Cobertura y límites reales

- No incluye `preparar_*` ni `confirmar`. Ninguna consulta adjudica, limpia, cierra, entrega o envía. Prima permanece abierta; HDships se bloquea también antes del transporte de detalle.
- La liga verificada es `/eventos/:id`. No se inventa un fragmento de botón; enlaces a botones específicos son trabajo de producto pendiente.
- Historial de ofertas: conserva todas las versiones que entregue la fuente; Rateware real puede entregar solo la vigente. No se afirma historial completo.
- Respuestas: canal y fechas, sin interpretar mensajes como nuevas ofertas; fallo de revisión se distingue de cero respuestas. Las aperturas posibles no prueban lectura humana.
- Tarifas: solo D2D y familias de caja admitidas por el proxy. Cada llamada examina una página de 1000 tarifas; devuelve siguiente offset incluso si no hubo coincidencias. Coincidencia por ciudad requiere comprobar estado/país. RFx histórico se limita a hasta cinco eventos seleccionados por llamada y con operación disponible. No se amplía la lista de acciones del proxy.
- `carrier`: perfil ligero; `historial_carrier`: hasta 300 registros de contacto. No promete listas, todas las ofertas ni historial contable. Solo campos seleccionados, sin datos arbitrarios de perfil/metadata.
- Tarifas y ofertas **no son pagos**. La autoridad contable es ERP. Sin conversiones de moneda ni estimaciones tratadas como hechos.
- Listado de eventos paginado sobre lo recibido: no acredita que el origen entregue toda la base. Salidas de más de 200000 caracteres fallan con indicación de acotar.
- No se almacena estado entre consultas: “ofertas nuevas” significa fecha de registro disponible, no “no vistas por Jose”.

## Continuidad

Objetivo: entregar PR de lectura, sin producción. Verificación local final: typecheck correcto, 288 pruebas Vitest aprobadas, 507 pruebas Bidware aprobadas y 2 omitidas, build correcto (advertencia de chunks mayores de 500 kB) y cuatro skills válidos. 19 pruebas MCP incluidas en Vitest; identidad y backend sintéticos, no OAuth real. No se ejecutaron evaluaciones LLM.

El primer intento de commit del 12-nov-2026 fue rechazado por la revisión automática (aprobación requerida con política Never, sin razón adicional). Tras autorización explícita del propietario para commit, push y PR en borrador, el nuevo intento de commit fue admitido. Rama de entrega: `codex/fr8bid-mcp-skills`; descripción preparada localmente en `.agentes/mcp-pr.md` (ignorada). Consultar el PR para el estado remoto; la autorización excluye fusionar y desplegar.

Pendiente real para uso operativo: contrato/configuración OAuth y consentimiento, usuario/cliente aprobados, revisión de Claude/Jose, merge/despliegue autorizado e instalación en el cliente elegido. El futuro PR en borrador no autoriza ninguna de esas acciones.
