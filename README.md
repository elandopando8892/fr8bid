# Fr8Bid · Bid Room de MARKSMAN

Concepto A, Mesa del evento: un evento, una página, y el recorrido de 11 pasos como navegación. Especificación en `docs/`.

## Qué hay

- `src/dominio/recorrido.ts`: función pura que calcula los 11 pasos, los candados (I3, I4, I7, I8, D4) y el siguiente paso con su responsable.
- `src/servidor/proxy.ts` + `api/`: funciones de Vercel que reenvían a `rateware-api` y `rfx-bid-api` con el token del usuario. Lista cerrada de acciones, ninguna escritura a Rateware real sin `FR8BID_ESCRITURAS_REALES=si`, candados de adjudicación comprobados del lado del servidor, `operation_id` válido para la entrega, HDships fuera (I12), tokens de liga fuera de las respuestas, sin respuesta = 504 «incierta».
- `src/simulado/`: Rateware simulado con la forma cruda de b11991f8 y el evento «PRUEBA CONTROLADA» de D5.
- `src/ui/`: inicio (`/eventos`), mesa (`/eventos/:id`) y liga del carrier (`/bid/:token`) con los tokens de marca MARKSMAN.
- `test/recorrido.test.ts`: las pruebas del §9 de `docs/recorrido-rfx-v0.md`.

## Uso local

```bash
npm install
npm test
npm run dev
```

`npm run dev` abre el modo simulado: nada sale del navegador. El selector «Ver como» cambia entre Administrador, Operador, Consulta y otra organización.

El modo `rateware` (`VITE_FR8BID_MODO=rateware`, ver `.env.example`) apunta a rateware-prod. No está desplegado ni probado contra producción; cada escritura real necesita la aprobación del propietario por acción.
