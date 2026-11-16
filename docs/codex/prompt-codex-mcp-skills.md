Codex, contexto y tarea: MCP de Fr8Bid y primeros skills operativos.

CONTEXTO
- Jose opera Fr8Bid conversando (ChatGPT o Claude). Quiere skills cotidianos: él escribe una frase («¿Qué tengo pendiente hoy?») y el skill ya sabe qué herramientas llamar para lograrlo.
- Diseño completo en D:\andre\repos\fr8bid\docs\codex\skills-80-20-fr8bid.md (copia local; no está en git) (17 skills, herramientas del MCP, orden). Léelo primero.
- Repo: elandopando8892/fr8bid (main). Reglas en AGENTS.md: todo por PR a main, un hilo por carpeta, tú haces skills y harnessing; el código de producto de la app lo hace Claude por PR.
- Decidido por Jose (9-nov): los envíos se confirman con un «sí» en el chat vía confirmar(); adjudicar, limpiar adjudicación, entregar a Rateware y avisos de adjudicación quedan FUERA del MCP (el MCP devuelve la liga al botón en la página del evento).

ENTREGA 1 (solo lectura, sin escribir nada en Rateware)
1. Servidor MCP remoto en el mismo proyecto de Vercel: fr8bid.heymarksman.com/api/mcp. Cada herramienta llama a la /api de Fr8Bid que ya existe (src/servidor/proxy.ts), así hereda sus guardas: lista cerrada de acciones, HDships fuera, tokens de liga fuera, sin reintentos. No hables directo con Rateware ni uses llaves de servicio.
2. Herramientas de lectura: eventos, evento, seguimiento_evento, respuestas_evento, ofertas_evento, historial_oferta, candados_ruta, carriers_sugeridos, tarifas_ruta, carrier, historial_carrier. Reusa la lógica de src/dominio (seguimiento.ts, modelo.ts, recorrido.ts, cierre.ts); no la copies.
3. Skills 1 («¿Qué tengo pendiente hoy?»), 2 («¿Cómo va O-I?»), 5 («Compárame las ofertas») y 14 («¿Cuánto hemos pagado en esta ruta?»). Cada skill con su operación paso a paso y 3 a 5 frases de ejemplo.
4. Inicio de sesión: OAuth con el login de Google/Supabase de Fr8Bid, para que Rateware siga aplicando el rol de quien se conecta. Propón un usuario Operador para agentes.
5. Pruebas con el modo simulado (src/simulado) y el evento RFx-FR8BID-PRUEBA-01. Antes de abrir el PR: npm run typecheck, npm test y npx vite build en verde.

LÍMITES
- No toques HDships (EVENTOS_PROTEGIDOS) ni cierres, rechaces o avises en Prima (RFx-1021-PRIMAPro): queda abierto como ruta abierta.
- No despliegues, no cambies variables de Vercel ni apliques migraciones. PR en borrador; Jose lo fusiona.
- Las herramientas preparar_* y confirmar() NO van en esta entrega.

ENTREGA
Un resumen en español: qué construiste, qué pruebas pasan, qué necesitas que Jose apruebe o configure (OAuth, usuario Operador).
