# Skills restantes · corte 17-nov-2026

Encargo: `prompt-codex-skills-restantes.md` proporcionado por Jose. Base revisada: main `7d6190f`. Responsable: Codex, skills y documentación; sin inferencias delegadas, créditos ni operaciones de negocio. Este documento es continuidad del entregable, no un catálogo operativo adicional.

## Reutilización y elección

Se compararon tres vías: reutilizar el MCP y los SKILL.md actuales; conectar Apollo directamente desde las skills; reconstruir herramientas. Se elige la primera: conserva OAuth, permisos, confirmaciones y trazabilidad. Las otras duplican contratos o evitan guardas del producto. No se añaden dependencias ni servicios. Las copias idénticas para Codex son un requisito del encargo; `.claude/skills` conserva la fuente de edición.

Fuentes: `src/mcp/lecturas.ts`, `src/mcp/escrituras.ts`, `src/cliente/api.ts`, `src/dominio/apollo.ts`, docs MCP y los doce SKILL.md existentes. El PR #46 seguía abierto, sin fusionar, al comprobar GitHub. `MesaApi.buscarEnApollo` y `revelarCorreoApollo` ya existen; una futura herramienta debe reutilizarlos, no reconstruir Apollo. La fuente histórica de 9-nov no sustituye las restricciones del encargo actual.

## Cobertura por número

| Nº | Skill | Resultado |
|---|---|---|
| 1 | fr8bid-pendientes | Ya existía; vocabulario actualizado y copia idéntica |
| 2 | fr8bid-estado-evento | Ya existía; vocabulario y copia |
| 3 | fr8bid-insistir | Ya existía; vocabulario y copia |
| 4 | fr8bid-whatsapp-pendientes | Ya existía, incluye Meta; vocabulario y copia |
| 5 | fr8bid-comparar-ofertas | Ya existía; vocabulario y copia |
| 6 | fr8bid-marcar-respondio | Ya incluía captura; no se duplica |
| 7 | RFQ → evento | Aplazado: después del cierre de O-I del 20-nov; falta preparar_evento |
| 8 | fr8bid-a-quien-invito | Ya existía; vocabulario y copia |
| 9 | fr8bid-invitar-tanda | Ya existía; vocabulario y copia |
| 10 | fr8bid-extender-plazo | Ya existía; solo extiende, no publica |
| 11 | fr8bid-carta-oferta | Nueva; tres wireframes. PDF final y estadística sujetos a elección y aprobación |
| 12 | fr8bid-verificar-adjudicacion | Ya existía; no acredita idioma ni recibo contable completo |
| 13 | fr8bid-avisos-no-adjudicacion | Nueva; propuesta textual y enlace, aprobación y envío en Fr8Bid |
| 14 | fr8bid-historico-tarifas | Ya existía; vocabulario y copia |
| 15 | fr8bid-perfil-carrier | Ya existía; no promete lectura de listas |
| 16 | fr8bid-buscar-contacto | Nueva; lectura actual y parada explícita ante herramientas ausentes |
| 17 | fr8bid-alta-lista | Nueva; propuesta con evidencia, alta bloqueada por contrato faltante |

Dieciséis archivos no equivalen a dieciséis flujos operativos completos. El catálogo conectado observado sigue siendo parcial frente a main; las skills comprueban herramientas antes de usarlas. No se llamaron herramientas de negocio para estas pruebas.

## Producto aparte, a cargo de Claude

1. Contactos: esperar decisión del propietario sobre #46. PR separado para `buscar_contacto` y preparación de revelado sin consumo, con ejecución de 1 crédito solo tras aprobación específica. Reutilizar el cliente Apollo; ligar confirmación a identidad, persona, costo y vencimiento; probar rebotes, copia en CRM, duplicados, resultado incierto y no reintento con backend simulado. La aprobación para desarrollar una skill no autoriza gastar créditos ni retirar contactos reales.
2. Listas: PR separado para lectura de listas/membresía y `preparar_alta_lista`; no confundir alta con shortlist, marca Revisado o invitación. IDs exactos, evidencia, comprobación de duplicados y confirmación del propietario. Probar altas concurrentes, ya miembro, lista ambigua, rol y resultado incierto.
3. RFQ: no implementar antes del cierre indicado. No crear una skill que simule `preparar_evento`.

No se abrieron PR de producto sin código ni se delegó una inferencia de Claude con facturación no comprobada.

## Carta: aprobación pendiente

Referencia visual en `.claude/skills/fr8bid-carta-oferta/references/carta-oferta-direcciones.html`: A carta comercial, B tabla de rutas (recomendada), C propuesta y alcance. Paleta tomada de `src/estilos/marksman-brand-tokens.css`; tipografía de sistema declarada, logo textual como reserva. No es el PDF final ni certificación de marca.

Se localizaron los dos Excel nombrados en Descargas, sin copiar sus datos al repositorio. No se analizaron resultados reales ni se calcularon percentiles: primero debe aprobarse población, deduplicación, método y criterio n ≤ 5. Las ofertas del 9–13-nov se obtendrán al ejecutar el estudio autorizado. La carta del shipper nunca incluye costo, carrier o percentiles de costo; el estudio interno se conserva por separado.

## Criterios de revisión sintéticos

- «Busca un contacto» con herramienta ausente: informa bloqueo, cero Apollo; «sí» previo no autoriza crédito.
- Correo rebotado o CC: propone corrección CRM con evidencia, no afirma persistencia.
- Lista ambigua o membresía desconocida: no inventa IDs ni alta. Ya miembro: no duplicar.
- Avisos PRIMA: detener. O-I antes del cierre: no anunciar resultados. «Sí» por chat: remitir a Fr8Bid.
- Carta con modelo desconocido: pedir base; no calcular margen. n=0/1/5: sin evidencia/sin conclusión/evidencia limitada, sujeto al criterio aprobado.
- Revisión de salida shipper: únicamente tarifa de venta y cobertura agregada; sin costos, identidad ni adjuntos internos.

Estos son escenarios de revisión del procedimiento, no resultados de una evaluación LLM. Validar igualdad de copias, referencias y las pruebas locales requeridas antes del PR. No se certifica instalación en otros chats ni despliegue.

Elección visual recibida el 17-nov: Jose aprobó B (tabla de rutas). Plantilla imprimible en `references/carta-oferta-b.html` junto a la skill, con datos sintéticos. Esa elección no aprueba todavía el método estadístico ni sustituye los activos oficiales.
