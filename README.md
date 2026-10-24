# Fr8Bid · Bid Room de MARKSMAN

Concepto A, Mesa del evento: un evento, una página, y el recorrido de 11 pasos como navegación. Especificación en `docs/`.

## Qué hay

- `src/dominio/recorrido.ts`: función pura que calcula los 11 pasos, los candados (I3, I4, I7, I8, D4) y el siguiente paso con su responsable.
- `src/servidor/proxy.ts` + `api/`: funciones de Vercel que reenvían a `rateware-api` y `rfx-bid-api` con el token del usuario. Lista cerrada de acciones, ninguna escritura a Rateware real sin `FR8BID_ESCRITURAS_REALES=si` (con `borradores` solo pasan los borradores de la Cola, que no envían), candados de adjudicación comprobados del lado del servidor, `operation_id` válido para la entrega, HDships fuera (I12), tokens de liga fuera de las respuestas, sin respuesta = 504 «incierta».
- `src/simulado/`: Rateware simulado con la forma cruda de b11991f8 y el evento «PRUEBA CONTROLADA» de D5.
- `src/ui/`: inicio (`/eventos`), mesa (`/eventos/:id`) y liga del carrier (`/bid/:token`) con los tokens de marca MARKSMAN.
- `test/recorrido.test.ts`: las pruebas del §9 de `docs/recorrido-rfx-v0.md`.

## Módulos traídos de Bidware

Fr8Bid reemplaza a Bidware (bidware.heymarksman.com). Su código vive en `src/bidware/` (alias `@`) y sus pantallas abren dentro del marco de Fr8Bid (`src/ui/bidware.tsx`, rutas en `src/ui/App.tsx`): QuoteDesk, Shipper intake, Carrier CRM, listas de carriers, Carrier fit, plantillas de correo, shippers, revisión de tarifas, tarifario, archivos, panel, integraciones y las páginas públicas (Bid Room del carrier, tablero, perfiles, RFI del shipper). La lista de eventos y la Mesa reemplazan a la mesa de RFx de Bidware: `/rfx` y `/rfx/:id` abren la Mesa.

- Una sola sesión: `src/bidware/lib/supabase.ts` es el único cliente; la Mesa usa el mismo `AuthProvider` (solo cuentas de xbfreight.com y heymarksman.com, rol leído del servidor).
- Llamadas: `src/bidware/lib/api-client.ts` va a `/api/funcion?fn=…` (`api/funcion.ts` + `src/servidor/paso.ts`), que reenvía a la Edge Function desde el servidor. Reglas: solo las funciones de estos módulos; sin `FR8BID_ESCRITURAS_REALES=si`, solo lecturas; HDships fuera; adjudicar, entregar a Rateware y avisar solo desde la Mesa; `closed` nunca por `update_rfx_event`. Los archivos de tarifas suben hasta 4 MB (límite de Vercel).
- Ligas para carriers y shippers: siguen saliendo con el dominio de Bidware (`VITE_APP_ORIGIN` lo cambia) hasta que ese dominio apunte a Fr8Bid.
- Estilos: `src/estilos/aislar.ts` deja las hojas de Bidware bajo `.bw` y saca de ahí las de Fr8Bid; `src/estilos/puente.css` es lo único que toca a los dos.
- Pruebas: `npm run test:bidware` (las de Node de Bidware). Las del Excel necesitan `xlsx` de cdn.sheetjs.com.

## Uso local

```bash
npm install
npm test
npm run test:bidware
npm run dev
```

`npm run dev` abre el modo simulado: nada sale del navegador. El selector «Ver como» cambia entre Administrador, Operador, Consulta y otra organización. Los módulos de Bidware no tienen datos en el simulado: avisan y muestran su pantalla vacía.

El modo `rateware` (`VITE_FR8BID_MODO=rateware`, ver `.env.example`) apunta a rateware-prod. No está desplegado ni probado contra producción; cada escritura real necesita la aprobación del propietario por acción.
