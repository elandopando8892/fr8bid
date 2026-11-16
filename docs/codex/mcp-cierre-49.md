# Cierre del PR #49 y continuidad

Corte: 16-nov-2026. Base: `ee34b5ab873ffa3407ee306aef466dcd4515fb8c`.

El PR #50 incorporó la implementación de lectura del #49 y la corrigió. Los PR #59 y #63 añadieron las preparaciones y confirmaciones. El #49 queda sustituido, sin fusionar su backend antiguo. Su rama y commit `29934386ab1cd01344669f0b53e73b772d389b57` se conservan como recuperación.

## Material preservado

- `skills-80-20-fr8bid.md`: diseño original, referencia histórica; no acredita despliegue ni autoriza fases posteriores.
- `prompt-codex-mcp-skills.md`: encargo original, histórico; no reemplaza las instrucciones vigentes.
- `mcp-evaluacion.xml`: diez casos sintéticos; no se ejecutaron inferencias ni existen necesariamente esos eventos en producción. Revalidar sus respuestas contra el fixture antes de una evaluación futura.
- Las cuatro entradas `.agents/skills/fr8bid-*/SKILL.md` remiten a `.claude/skills`, fuente canónica del procedimiento. No se duplican los cuerpos.

No se rescata el backend, dependencias, reglas de push ni configuración de Vercel del #49. El recibo inicial sigue disponible en su commit; sus pendientes OAuth son históricos, no instrucciones para reconfigurar producción.

## Evidencia y límites

El MCP conectado expuso once lecturas y cuatro herramientas de preparación/confirmación. Listado, detalle y ofertas respondieron en la sesión real; no se invocó ninguna preparación ni confirmación. Las cuatro suites locales de lectura y autenticación pasan: 22 pruebas, con backend e identidades sintéticos. No equivalen a probar revocación o cambio de cuenta reales.

Las cuatro skills operativas sí aparecen en el catálogo de este chat desde el worktree anterior. Eso corrige la incertidumbre del informe previo sobre Codex. Las referencias nuevas están preparadas localmente; el descubrimiento tras recarga y su instalación en otros clientes no están certificados.

## Pendientes concretos

1. Revisar e integrar por PR este rescate documental y las entradas de descubrimiento. No se fusiona ni despliega desde este trabajo.
2. El código de main incluye `preparar_captura`, `preparar_ya_respondio` y `preparar_cambio_evento`, ausentes del catálogo conectado observado. Reconciliar release servida y catálogo del conector mediante metadatos, sin ejecutar escrituras como prueba. No reimplementarlas.
3. Rateware #213 está fusionado (15-nov), pero su descripción dice que no desplegó. La fusión no acredita el despliegue de `rateware-api`; queda pendiente evidencia del responsable de producción. No desplegar para cerrar esta revisión.
4. Aceptación de revocación, vencimiento y aislamiento real entre cuentas requiere identidades de prueba autorizadas. No cambiar la cuenta actual ni crear usuarios para simularla. Las pruebas locales cubren estos límites sin tocar producción.
5. La comparación mantiene limitaciones documentadas en #50 (rol/adjudicación/entrega y tratamiento conservador de tarifas). Cualquier cambio de producto corresponde a Claude y requiere una tarea acotada; no es necesario reconstruir el MCP.

No hay publicación automática ni sincronización de skills entre Codex, Claude y ChatGPT. Las notas iniciales de `docs/mcp-lectura.md` describen su sesión histórica; consultar este corte junto con `docs/mcp-escrituras.md` para continuidad.
