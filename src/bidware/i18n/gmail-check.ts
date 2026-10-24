import { translator } from './language';
export const gmailCheckText = translator({
 title:{es:'Comprobación actual de Gmail',en:'Current Gmail check'},
 button:{es:'Comprobar Gmail',en:'Check Gmail'},busy:{es:'Comprobando Gmail…',en:'Checking Gmail…'},
 note:{es:'Consulta el perfil de Google y puede renovar el token existente. Una respuesta correcta no confirma que se pueda enviar correo ni la entrega de mensajes.',en:'Reads the Google profile and may renew the existing token. A successful response does not confirm email sending or message delivery.'},
 initial:{es:'El estado conectado es configuración guardada; aún no se ha comprobado el perfil en esta vista.',en:'Connected is stored configuration; the profile has not yet been checked in this view.'},
 available:{es:'Google confirmó acceso al perfil del remitente autorizado en esta comprobación.',en:'Google confirmed access to the profile of the authorized sender in this check.'},
 not_connected:{es:'No hay una conexión activa para el remitente autorizado. Revisa la configuración con el administrador.',en:'There is no active connection for the authorized sender. Review the configuration with the administrator.'},
 scope_missing:{es:'La conexión guardada no declara un permiso compatible con consultar el perfil. Revisa los permisos existentes con el administrador.',en:'The stored connection does not declare a scope compatible with reading the profile. Review existing permissions with the administrator.'},
 credentials_unavailable:{es:'No se pudo obtener una credencial vigente. Revisa la conexión; una renovación iniciada puede terminar después de esta comprobación.',en:'A current credential could not be obtained. Review the connection; a renewal already started may finish after this check.'},
 provider_rejected:{es:'Google rechazó la consulta del perfil. Revisa el HTTP y los motivos disponibles antes de decidir otra acción.',en:'Google rejected the profile request. Review the HTTP and available reasons before deciding on another action.'},
 identity_unconfirmed:{es:'La respuesta de Google no confirmó el perfil del remitente autorizado. Revisa la conexión con el administrador.',en:'The Google response did not confirm the authorized sender profile. Review the connection with the administrator.'},
 unavailable:{es:'No se obtuvo un resultado concluyente de esta comprobación. Revisa la etapa y vuelve a comprobar manualmente cuando corresponda.',en:'This check did not obtain a conclusive result. Review the stage and check again manually when appropriate.'},
 failure:{es:'No se pudo completar la comprobación. Revisa la sesión y vuelve a intentarlo manualmente.',en:'The check could not be completed. Review the session and try again manually.'},
 noSend:{es:'La conexión guardada no declara un permiso de envío. El acceso al perfil no lo sustituye.',en:'The stored connection does not declare a send scope. Access to the profile does not replace it.'},
 date:{es:'Comprobado al',en:'Checked at'},stage:{es:'Etapa',en:'Stage'},stored:{es:'Conexión guardada',en:'Stored connection'},credentials:{es:'Credencial',en:'Credential'},profile:{es:'Perfil de Google',en:'Google profile'},http:{es:'HTTP de Google',en:'Google HTTP'},reasons:{es:'Motivos disponibles',en:'Available reasons'},missing:{es:'Sin dato disponible',en:'Not available'},
});
