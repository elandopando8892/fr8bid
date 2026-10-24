type Message = Record<string,unknown>;
const date = (value:unknown) => typeof value==='string' && Number.isFinite(Date.parse(value)) ? value : null;
export function gmailReceipt(message:Message) {
 const id=typeof message.provider_message_id==='string' && /^[A-Za-z0-9_-]{1,128}$/.test(message.provider_message_id)?message.provider_message_id:null;
 return {id,sentAt:date(message.sent_at),manual:Boolean(message.manual_sent_at)||message.status==='manual_sent',manualAt:date(message.manual_sent_at),canVerify:message.channel==='email'&&(!message.provider||message.provider==='gmail')&&Boolean(id)};
}
