// Spanish (Español) translation for the Sofabaton Virtual Remote card.
//
// Complete mirror of REMOTE_CARD_STRINGS_EN, written in neutral international
// Spanish. Product and feature names such as Home Assistant, Automation Assist,
// MQTT Discovery, Lovelace, and Sofabaton are intentionally preserved.

import {
  registerRemoteCardTranslation,
  type RemoteCardStrings,
} from "../remote-card-strings";

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm;

export const REMOTE_CARD_STRINGS_ES = {
  card: {
    selectEntityError: "Selecciona una entidad de control remoto Sofabaton",
    remoteUnavailable:
      "El control remoto no está disponible (posiblemente porque la aplicación Sofabaton está conectada).",
    noActivitiesWarning:
      "No se encontraron actividades en los atributos del control remoto.",
    noMacros: "No hay macros disponibles",
    noFavorites: "No hay favoritos disponibles",
    macrosTab: "Macros >",
    favoritesTab: "Favoritos >",
    activitySelectLabel: "Actividad",
    poweredOff: "Apagado",
    defaultLayout: "Diseño predeterminado",
    activityFallback: (id: number | string) => `Actividad ${id}`,
  },
  assist: {
    label: "Captura de botones",
    start: "Iniciar",
    waiting: "Esperando que se pulse un botón",
    exitEditMode: "Sal del modo de edición para comenzar",
    captured: (label: string) => `Capturado: ${label}`,
    notCaptured: "Sin capturar.",
    working: "Procesando…",
    triggersReady: "Desencadenantes listos para usar",
    createTriggers: "Crear desencadenantes de MQTT Discovery",
    startCapturing: "Iniciar la captura de comandos",
    deviceDetectedTitle: "Dispositivo de Home Assistant detectado.",
    close: "Cerrar",
    alsoActivityTriggers:
      "Crear también desencadenantes para los cambios de actividad.",
    seeDocs: "Consulta la documentación de esta función.",
    dontShowAgain:
      "No volver a mostrar esto para este dispositivo (durante esta sesión).",
    detectedDevice: (name: string) => `Dispositivo MQTT detectado: ${name}.`,
    lastCommand: (name: string) => `Último comando: ${name}.`,
    existingTriggers:
      "Se encontraron desencadenantes existentes de automatización MQTT.",
    noMqttCommands: "Aún no se han detectado comandos MQTT",
    deviceFallback: (id: number | string) => `Dispositivo ${id}`,
    unknownDevice: "Dispositivo desconocido",
    commandFallback: (id: number | string) => `Comando ${id}`,
    createdTriggers: (count: number, deviceLabel: string) =>
      `${count} ${plural(count, "desencadenante")} de MQTT Discovery ${plural(count, "creado")} para ${deviceLabel}`,
    createdActivityTriggers: (count: number) =>
      `${count} ${plural(count, "desencadenante")} de actividad ${plural(count, "creado")} para X2 → Activities`,
    plusActivityTriggers: (count: number) =>
      `; además, ${count} ${plural(count, "desencadenante")} de actividad ${plural(count, "creado")}`,
    allTriggersExist: (deviceLabel: string) =>
      `Ya existen todos los desencadenantes de MQTT Discovery para ${deviceLabel}`,
    buttonFallback: "Botón",
    activityFallbackLabel: "Actividad",
    unknown: "Desconocido",
    automationAssistName: "Automation Assist",
    notification: {
      title: "🛠️ Automation Assist",
      eventButton: (label: string) => `Botón: ${label}`,
      eventActivity: (label: string) => `Cambio de actividad: ${label}`,
      eventOther: (label: string) => `Evento: ${label}`,
      header: (activityName: string, eventLabel: string) =>
        `**Actividad: ${activityName} | ${eventLabel}**`,
      lovelaceHeading: "📋 **Código del botón de Lovelace**",
      lovelaceCopy: "*Copia esto en el YAML de tu panel:*",
      serviceHeading: "⚙️ **Llamada de servicio (automatización)**",
      serviceCopy: "*Usa esto en tus scripts o automatizaciones:*",
    },
  },
  editor: {
    fieldLabels: {
      entity: "Seleccionar una entidad de control remoto Sofabaton",
      theme: "Aplicar un tema a la tarjeta",
      use_background_override: "Personalizar el color de fondo",
      background_override: "Seleccionar el color de fondo",
      show_activity: "Selector de actividad",
      show_dpad: "Control direccional",
      show_nav: "Botones Atrás/Inicio/Menú",
      show_mid: "Controles de volumen y canal",
      show_media: "Controles de reproducción multimedia",
      show_colors: "Rojo/Verde/Amarillo/Azul",
      show_abc: "Botones A/B/C",
      show_macros_button: "Botón de macros",
      show_favorites_button: "Botón de favoritos",
      max_width: "Ancho máximo de la tarjeta (px)",
      group_order: "Orden de los grupos",
    },
    automationAssistTitle: "Asistente de automatización",
    keyCapture: "Captura de botones",
    keyCaptureDescription:
      "Envía pulsaciones de botones al hub para generar YAML listo para usar en botones del panel y automatizaciones.",
    keyCaptureLearnMore: "Más información sobre la captura de botones",
    keyCaptureDocsAria: "Documentación sobre la captura de botones",
    stylingOptions: "Opciones de estilo",
    layoutOptions: "Opciones de diseño",
    layoutSelectLabel: "Diseño",
    defaultLayoutOption: "Diseño predeterminado",
    macrosFavoritesAsRows: "Macros/favoritos como filas",
    visibleRows: "Filas visibles",
    moveGroupUp: (groupLabel: string) => `Mover ${groupLabel} hacia arriba`,
    moveGroupDown: (groupLabel: string) => `Mover ${groupLabel} hacia abajo`,
    macros: "Macros",
    favorites: "Favoritos",
    volume: "Volumen",
    channel: "Canal",
    mediaControls: "Controles multimedia",
    dvr: "DVR",
    resetCardDefault: "Restablecer al valor predeterminado de la tarjeta",
    resetDefaultLayout: "Restablecer el diseño predeterminado",
    noteDefaultLayout: "Se usa para actividades sin un diseño propio",
    noteCustomLayout: "Se está usando un diseño personalizado",
    noteUsingDefault: "Se está usando el diseño predeterminado",
  },
  groups: {
    activity: "Selector de actividad",
    macro_favorites: "Macros/favoritos",
    macros_row: "Fila de macros",
    favorites_row: "Fila de favoritos",
    dpad: "Control direccional",
    nav: "Atrás/Inicio/Menú",
    mid: "Volumen/Canal",
    media: "Controles multimedia",
    colors: "Botones de colores",
    abc: "A/B/C",
  },
  keys: {
    up: "Arriba",
    down: "Abajo",
    left: "Izquierda",
    right: "Derecha",
    ok: "OK",
    back: "Atrás",
    home: "Inicio",
    menu: "Menú",
    volup: "Volumen +",
    voldn: "Volumen -",
    mute: "Silencio",
    chup: "Canal +",
    chdn: "Canal -",
    guide: "Guía de programas",
    dvr: "DVR",
    play: "Reproducir",
    exit: "Salir",
    rew: "Retroceder",
    pause: "Pausa",
    fwd: "Avance rápido",
    red: "Rojo",
    green: "Verde",
    yellow: "Amarillo",
    blue: "Azul",
    a: "A",
    b: "B",
    c: "C",
  },
} satisfies RemoteCardStrings;

registerRemoteCardTranslation("es", REMOTE_CARD_STRINGS_ES);
