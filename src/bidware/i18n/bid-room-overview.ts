import { translator } from "./language";

/**
 * Bid Room del carrier, etapa 2: «El negocio» y «Mi ranking» (más la franja de
 * privacidad y el modo de visibilidad de la cabecera). Los datos del evento y
 * los nombres de carriers no se traducen.
 */
export const overviewCopy = {
  // Modo de visibilidad (cabecera y «Qué ves de los demás»)
  "mode.private.label": { es: "Privado", en: "Private" },
  "mode.private.text": {
    es: "solo ves tu propia oferta; MARKSMAN compara todas.",
    en: "you only see your own offer; MARKSMAN compares them all.",
  },
  "mode.anonymous_rank.label": { es: "Ranking anónimo", en: "Anonymous ranking" },
  "mode.anonymous_rank.text": {
    es: "ves tu lugar, tu score y tu distancia a la mejor oferta; nunca quién cotizó ni a cuánto.",
    en: "you see your place, your score and your distance to the best offer; never who quoted or how much.",
  },
  "mode.open_leaderboard.label": { es: "Tablero abierto", en: "Open leaderboard" },
  "mode.open_leaderboard.text": {
    es: "ves la posición y la oferta de todos los carriers de cada ruta.",
    en: "you see the position and the offer of every carrier on each lane.",
  },

  // Franja de privacidad de Mi ranking
  "band.anonymous_rank.tag": { es: "LO QUE NUNCA VERÁS", en: "WHAT YOU WILL NEVER SEE" },
  "band.anonymous_rank.text": {
    es: "Ni quién más cotizó ni sus tarifas. Solo tu lugar, tu score y tu distancia a la mejor oferta, en rango.",
    en: "Neither who else quoted nor their rates. Only your place, your score and your distance to the best offer, as a range.",
  },
  "band.private.tag": { es: "EVENTO PRIVADO", en: "PRIVATE EVENT" },
  "band.private.text": {
    es: "Solo ves tu propia oferta. MARKSMAN ve todas, pero no se comparte ninguna posición.",
    en: "You only see your own offer. MARKSMAN sees them all, but no position is shared.",
  },
  "band.open_leaderboard.tag": { es: "TABLERO ABIERTO", en: "OPEN LEADERBOARD" },
  "band.open_leaderboard.text": {
    es: "Ves la posición, el nombre y la oferta de los carriers de cada ruta, y ellos ven la tuya.",
    en: "You see the position, name and offer of the carriers on each lane, and they see yours.",
  },

  // El negocio
  "biz.invitation": { es: "Tu invitación", en: "Your invitation" },
  "biz.close": { es: "Cierre", en: "Closing" },
  "biz.start": { es: "Arranque", en: "Start" },
  "biz.startText": { es: "{0} · inicio estimado de la operación", en: "{0} · estimated start of operations" },
  "biz.lanes": { es: "Rutas", en: "Lanes" },
  "biz.lanesText": { es: "{0} en tu invitación · {1} segmento(s)", en: "{0} in your invitation · {1} segment(s)" },
  "biz.visibility": { es: "Qué ves de los demás", en: "What you see of the others" },
  "biz.howTitle": { es: "Cómo se cotiza", en: "How quoting works" },
  "biz.step1Bold": { es: "Cotiza cada ruta", en: "Quote each lane" },
  "biz.step1Text": {
    es: " con su tarifa all-in, en el orden que quieras. Cada ruta se guarda sola y la puedes corregir mientras la ventana siga abierta; cotizar una no te compromete con las demás.",
    en: " with its all-in rate, in any order. Each lane is saved on its own and you can fix it while the window is open; quoting one does not commit you to the others.",
  },
  "biz.step2Bold": { es: "Confirma los términos", en: "Confirm the terms" },
  "biz.step2Text": {
    es: " de cada segmento, debajo de tus rutas. Decir «con excepción» o «no puedo» no te saca del bid: nos dice dónde negociar.",
    en: " of each segment, below your lanes. Saying “with exception” or “can't” does not take you out of the bid: it tells us where to negotiate.",
  },
  "biz.step3Bold": { es: "Sigue tu posición", en: "Follow your position" },
  "biz.step3Text": {
    es: " en Mi ranking: se actualiza sola mientras otros cotizan.",
    en: " in My ranking: it updates on its own while others quote.",
  },
  "biz.fixedTitle": { es: "XBF compra-venta · Modelo fijo", en: "XBF buy-sell · Fixed model" },
  "biz.fixedText": {
    es: "Cotiza tu tarifa de venta a XBF. Las demás modalidades no aplican en esta etapa.",
    en: "Quote your sell rate to XBF. The other models do not apply at this stage.",
  },
  "biz.modelOne": { es: "Tu modelo comercial", en: "Your commercial model" },
  "biz.modelMany": { es: "Modelos comerciales", en: "Commercial models" },
  "biz.colModel": { es: "Modelo", en: "Model" },
  "biz.colWhat": { es: "Qué capturas y qué pasa", en: "What you enter and what happens" },
  "biz.colPct": { es: "Porcentaje", en: "Percentage" },
  "biz.pctRange": { es: "{0}–{1} % · vacío {2} %", en: "{0}–{1} % · blank {2} %" },
  "biz.others": { es: "Tus otras invitaciones abiertas", en: "Your other open invitations" },
  "biz.event": { es: "Evento", en: "Event" },
  "biz.laneCount": { es: "{0} ruta(s)", en: "{0} lane(s)" },
  "biz.open": { es: "Abrir", en: "Open" },
  "biz.notInvited": { es: "Rutas abiertas a las que no te invitaron", en: "Open lanes you were not invited to" },
  "biz.notInvitedNote": {
    es: "Si los cubres, pide acceso: el equipo revisa y te invita.",
    en: "If you cover them, ask for access: the team reviews and invites you.",
  },
  "biz.requested": { es: "SOLICITADO", en: "REQUESTED" },
  "biz.askAccess": { es: "Pedir acceso", en: "Ask for access" },
  "biz.more": {
    es: "Y {0} más. Pregunta al equipo en Mensajes si buscas una ruta en particular.",
    en: "And {0} more. Ask the team in Messages if you are looking for a particular lane.",
  },
  "biz.progress": { es: "Tu avance", en: "Your progress" },
  "biz.count": { es: "{0} de {1}", en: "{0} of {1}" },
  "biz.lanesQuoted": { es: "rutas cotizadas", en: "lanes quoted" },
  "biz.termsConfirmed": { es: "rubros confirmados", en: "items confirmed" },
  "biz.windowCloses": {
    es: "La ventana cierra el {0} a las 23:59, hora del centro de México.",
    en: "The window closes on {0} at 11:59 pm, Central Mexico time.",
  },
  "biz.noDeadline": { es: "Este evento no tiene fecha de cierre.", en: "This event has no closing date." },
  "biz.goQuote": { es: "Ir a cotizar", en: "Go to quote" },

  // Mi ranking: señal
  "sig.awarded": { es: "Adjudicado", en: "Awarded" },
  "sig.awardedSub": { es: "la ruta es tuya", en: "the lane is yours" },
  "sig.backup": { es: "Respaldo", en: "Backup" },
  "sig.backupSub": { es: "quedaste como respaldo", en: "you are the backup" },
  "sig.notAwarded": { es: "No adjudicado", en: "Not awarded" },
  "sig.notAwardedSub": { es: "se adjudicó a otro carrier", en: "it was awarded to another carrier" },
  "sig.declined": { es: "No participo", en: "Not bidding" },
  "sig.declinedSub": { es: "marcaste que no participas", en: "you marked that you are not bidding" },
  "sig.unquoted": { es: "Sin cotizar", en: "Not quoted" },
  "sig.unquotedSub": { es: "cotiza para ver tu posición", en: "quote to see your position" },
  "sig.loadingSub": { es: "cargando tu posición", en: "loading your position" },
  "sig.sent": { es: "Enviada", en: "Sent" },
  "sig.sentSub": { es: "evento privado, sin ranking", en: "private event, no ranking" },
  "sig.place": { es: "lugar {0}", en: "place {0}" },
  "sig.placeOf": { es: "lugar {0} de {1}", en: "place {0} of {1}" },
  "sig.leader": { es: "Líder", en: "Leader" },
  "sig.leaderSub": { es: "vas primero", en: "you are first" },
  "sig.far": { es: "Lejos", en: "Behind" },
  "sig.farSub": { es: "hay ofertas mejor armadas", en: "there are better-built offers" },
  "sig.competitive": { es: "Competitivo", en: "Competitive" },
  "sig.competitiveSub": { es: "estás dentro del rango", en: "you are within range" },

  // Mi ranking: distancia y score
  "dist.noOffer": { es: "sin oferta", en: "no offer" },
  "dist.notShared": { es: "no se comparte", en: "not shared" },
  "dist.lowest": { es: "tienes la más baja", en: "yours is the lowest" },
  "dist.pctAbove": { es: "{0} % arriba", en: "{0} % above" },
  "dist.above": { es: "arriba de la más baja", en: "above the lowest" },
  "dist.fromLowest": { es: "de la oferta más baja", en: "from the lowest offer" },
  "dist.nobody": { es: "aún sin con quién comparar", en: "nobody to compare with yet" },
  "dist.unavailable": { es: "no disponible", en: "not available" },
  "score.private": { es: "sin score en eventos privados", en: "no score in private events" },
  "score.best": { es: "la mejor de esta ruta", en: "the best on this lane" },
  "score.leaderAt": { es: "la mejor está en {0}", en: "the best is at {0}" },

  // Mi ranking: indicadores y tablas
  "rank.lane": { es: "Ruta {0} · ", en: "Lane {0} · " },
  "rank.signal": { es: "Tu señal", en: "Your signal" },
  "rank.distance": { es: "Distancia a la mejor", en: "Distance to the best" },
  "rank.score": { es: "Tu score", en: "Your score" },
  "rank.quoted": { es: "Rutas cotizadas", en: "Lanes quoted" },
  "rank.unquotedCount": { es: "{0} sin oferta", en: "{0} without an offer" },
  "rank.colLane": { es: "Ruta", en: "Lane" },
  "rank.colOffer": { es: "Tu oferta", en: "Your offer" },
  "rank.colVsBest": { es: "Vs mejor", en: "Vs best" },
  "rank.colScore": { es: "Score", en: "Score" },
  "rank.colSignal": { es: "Señal", en: "Signal" },
  "rank.updated": {
    es: "Actualizado {0} · se actualiza solo cada {1} s",
    en: "Updated {0} · refreshes on its own every {1} s",
  },
  "rank.loading": { es: "Cargando tu posición…", en: "Loading your position…" },
  "rank.refreshing": { es: "Actualizando…", en: "Refreshing…" },
  "rank.refresh": { es: "Actualizar", en: "Refresh" },
  "rank.colPlace": { es: "Lugar", en: "Place" },
  "rank.colCarrier": { es: "Carrier · {0}", en: "Carrier · {0}" },
  "rank.colBid": { es: "Oferta", en: "Offer" },
  "rank.you": { es: "Tú", en: "You" },

  // Mi ranking: qué sube el score
  "raise.title": { es: "Qué sube tu score sin bajar tu tarifa", en: "What raises your score without lowering your rate" },
  "raise.pendingOne": { es: "{0} PENDIENTE", en: "{0} PENDING" },
  "raise.pendingMany": { es: "{0} PENDIENTES", en: "{0} PENDING" },
  "raise.complete": { es: "COMPLETO", en: "COMPLETE" },
  "raise.rate": { es: "Tarifa all-in declarada", en: "All-in rate declared" },
  "raise.rateOk": { es: "ya la tienes", en: "you already have it" },
  "raise.rateMissing": { es: "sin tarifa no hay score", en: "no rate, no score" },
  "raise.completeOffer": { es: "Completar mi oferta", en: "Complete my offer" },
  "raise.quoteLane": { es: "Cotizar esta ruta", en: "Quote this lane" },
  "raise.noChanges": { es: "Esta ruta ya no admite cambios.", en: "This lane no longer accepts changes." },
  "factor.capacity.label": { es: "Capacidad semanal", en: "Weekly capacity" },
  "factor.capacity.hint": { es: "cuántas cargas sostienes de verdad", en: "how many loads you can really sustain" },
  "factor.equipment.label": { es: "Equipo disponible", en: "Equipment available" },
  "factor.equipment.hint": {
    es: "decir que no resta; no decirlo casi no suma",
    en: "saying no takes points away; not saying adds almost nothing",
  },
  "factor.transit.label": { es: "Tránsito en días", en: "Transit in days" },
  "factor.transit.hint": { es: "menos días, más puntos", en: "fewer days, more points" },
  "factor.mirror.label": { es: "Cuenta espejo de GPS", en: "GPS mirror account" },
  "factor.mirror.hint": { es: "valida tu unidad sin llamadas", en: "validates your unit without phone calls" },
  "factor.deadhead.label": { es: "Distancia en vacío", en: "Deadhead distance" },
  "factor.deadhead.hint": { es: "qué tan cerca está tu unidad", en: "how close your unit is" },
  "factor.eta.label": { es: "ETA de recolección", en: "Pickup ETA" },
  "factor.eta.hint": { es: "el cliente planea con esto", en: "the customer plans with this" },

  // Mi ranking: lateral
  "side.privateEyebrow": { es: "Evento privado", en: "Private event" },
  "side.privateTitle": { es: "No hay ranking en este evento", en: "There is no ranking in this event" },
  "side.privateText": {
    es: "MARKSMAN compara todas las ofertas; tú solo ves la tuya. Lo que pesa es lo mismo: tarifa, capacidad, tránsito, equipo y validación.",
    en: "MARKSMAN compares all the offers; you only see yours. What counts is the same: rate, capacity, transit, equipment and validation.",
  },
  "side.unquotedEyebrow": { es: "Si no has cotizado", en: "If you have not quoted" },
  "side.lockedTitle": { es: "Tu score está bloqueado", en: "Your score is locked" },
  "side.lockedText": {
    es: "Envía tu tarifa all-in con capacidad, ETA y datos de validación para desbloquearlo.",
    en: "Send your all-in rate with capacity, ETA and validation data to unlock it.",
  },
  "side.notOnlyPrice": { es: "El score no es solo precio", en: "The score is not only price" },
  "side.notOnlyPriceText": {
    es: "Una tarifa más alta con capacidad firme, ETA clara y equipo confirmado puede ganarle a una más barata sin respaldo. Por eso ves el score junto a la distancia, y no solo la distancia.",
    en: "A higher rate with firm capacity, a clear ETA and confirmed equipment can beat a cheaper one with nothing behind it. That is why you see the score next to the distance, and not the distance alone.",
  },
  "side.closeTitle": { es: "Cuando la ventana cierra", en: "When the window closes" },
  "side.closeText": {
    es: "El tablero se congela con tu última posición y la oferta ya no se puede corregir.",
    en: "The board freezes with your last position and the offer can no longer be corrected.",
  },
} as const;

export const o = translator(overviewCopy);
