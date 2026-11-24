import { translator } from "./language";

/**
 * Bid Room del carrier, etapa 3: «Mensajes» y el asistente. Lo que escriben las
 * personas y lo que contesta el asistente no se traduce aquí: el asistente
 * recibe el idioma elegido y contesta en él.
 */
export const messagesCopy = {
  // Conversación
  "thread.carrier_private": { es: "Privado con MARKSMAN", en: "Private with MARKSMAN" },
  "thread.lane_group": { es: "Todos los carriers de tu ruta", en: "All carriers on your lane" },
  "thread.event_group": { es: "Todos los carriers del evento", en: "All carriers in the event" },
  "chat.title": { es: "Conversación con MARKSMAN", en: "Conversation with MARKSMAN" },
  "chat.loading": { es: "Cargando…", en: "Loading…" },
  "chat.refresh": { es: "Actualizar", en: "Refresh" },
  "chat.loadingMessages": { es: "Cargando mensajes…", en: "Loading messages…" },
  "chat.thread": { es: "Conversación", en: "Conversation" },
  "chat.yourCompany": { es: "Tu empresa", en: "Your company" },
  "chat.empty": {
    es: "Sin mensajes todavía. Escribe el primero si tienes dudas del evento.",
    en: "No messages yet. Write the first one if you have questions about the event.",
  },
  "chat.placeholder": { es: "Tu mensaje, privado con MARKSMAN", en: "Your message, private with MARKSMAN" },
  "chat.sending": { es: "Enviando…", en: "Sending…" },
  "chat.send": { es: "Enviar", en: "Send" },
  "chat.whoReads": { es: "Quién lee esto", en: "Who reads this" },
  "chat.privateText": {
    es: ": lo que escribas aquí solo lo ven tu empresa y el equipo de MARKSMAN, y queda ligado a tu invitación.",
    en: ": what you write here is only seen by your company and the MARKSMAN team, and it stays linked to your invitation.",
  },
  "chat.groupBold": { es: "Carriers de tu ruta o del evento:", en: "Carriers on your lane or in the event:" },
  "chat.groupText": {
    es: " avisos del equipo para todos los invitados. Lo que tú escribes no se publica ahí.",
    en: " notices from the team for everyone invited. What you write is not posted there.",
  },
  "chat.betterTitle": { es: "Mejor que un correo suelto", en: "Better than a loose email" },
  "chat.betterText": {
    es: "Para dudas de precio o alcance, la respuesta queda junto a tu oferta.",
    en: "For questions about price or scope, the answer stays next to your offer.",
  },

  // Asistente
  "ai.starterSummary": { es: "Resumen de la oportunidad", en: "Opportunity summary" },
  "ai.starterRoute": { es: "¿Qué detalles tiene {0}?", en: "What details does {0} have?" },
  "ai.starterThisRoute": { es: "¿Qué detalles tiene esta ruta?", en: "What details does this lane have?" },
  "ai.starterRanking": { es: "¿Cómo mejoro mi ranking?", en: "How do I improve my ranking?" },
  "ai.starterModel": { es: "¿Qué modelo comercial debo elegir?", en: "Which commercial model should I choose?" },
  "ai.starterAlternative": { es: "¿Cómo subo una alternativa?", en: "How do I submit an alternative?" },
  "ai.ticketConfirm": {
    es: "Tu pregunta se enviará al equipo de MARKSMAN como ticket de soporte:\n\n\"{0}\"\n\nTe darán seguimiento y podrás verlo en la bitácora de tu perfil de carrier. ¿Enviar?",
    en: "Your question will be sent to the MARKSMAN team as a support ticket:\n\n\"{0}\"\n\nThey will follow up and you will be able to see it in the log of your carrier profile. Send it?",
  },
  "ai.barTitle": { es: "Asistente de la sala", en: "Room assistant" },
  "ai.barText": {
    es: "Dudas de acceso, fechas, alcance de rutas o cómo cotizar. Si hace falta una persona, envía tu pregunta al equipo.",
    en: "Questions about access, dates, lane scope or how to quote. If a person is needed, send your question to the team.",
  },
  "ai.close": { es: "Cerrar", en: "Close" },
  "ai.ask": { es: "Preguntar", en: "Ask" },
  "ai.dialog": { es: "Asistente del Bid Room", en: "Bid Room assistant" },
  "ai.eyebrow": { es: "Asistente de puja", en: "Bid assistant" },
  "ai.heading": { es: "Pregunta sobre esta oportunidad", en: "Ask about this opportunity" },
  "ai.help": {
    es: "Responde con el evento, tus rutas, las reglas visibles y tu ranking. Si hace falta una persona, envía tu pregunta al equipo.",
    en: "It answers from the event, your lanes, the visible rules and your ranking. If a person is needed, send your question to the team.",
  },
  "ai.closeAria": { es: "Cerrar asistente", en: "Close assistant" },
  "ai.yourQuestion": { es: "Tu pregunta", en: "Your question" },
  "ai.needsPerson": { es: "Requiere seguimiento de una persona", en: "Needs follow-up from a person" },
  "ai.answer": { es: "Respuesta", en: "Answer" },
  "ai.sent": {
    es: "Enviado al equipo de MARKSMAN. Verás su seguimiento en la bitácora de tu perfil de carrier.",
    en: "Sent to the MARKSMAN team. You will see their follow-up in the log of your carrier profile.",
  },
  "ai.needsTeam": { es: "Esta pregunta necesita a una persona del equipo.", en: "This question needs a person from the team." },
  "ai.notSolved": { es: "¿No resolvió tu duda?", en: "Didn't it answer your question?" },
  "ai.sending": { es: "Enviando…", en: "Sending…" },
  "ai.sendToTeam": { es: "Enviar al equipo", en: "Send to the team" },
  "ai.placeholder": { es: "Escribe tu pregunta…", en: "Type your question…" },
} as const;

export const msg = translator(messagesCopy);
