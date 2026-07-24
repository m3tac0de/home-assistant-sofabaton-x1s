// French (Français) translation for the Sofabaton Virtual Remote card.
//
// Complete mirror of REMOTE_CARD_STRINGS_EN. Product and feature names such
// as Home Assistant, Automation Assist, MQTT Discovery, Lovelace, and
// Sofabaton are intentionally preserved.

import {
  registerRemoteCardTranslation,
  type RemoteCardStrings,
} from "../remote-card-strings";

const plural = (count: number, singular: string, pluralForm = `${singular}s`) =>
  count === 1 ? singular : pluralForm;

export const REMOTE_CARD_STRINGS_FR = {
  card: {
    selectEntityError: "Sélectionnez une entité de télécommande Sofabaton",
    remoteUnavailable:
      "La télécommande n’est pas disponible (peut-être parce que l’application Sofabaton est connectée).",
    noActivitiesWarning:
      "Aucune activité trouvée dans les attributs de la télécommande.",
    noMacros: "Aucune macro disponible",
    noFavorites: "Aucun favori disponible",
    macrosTab: "Macros >",
    favoritesTab: "Favoris >",
    activitySelectLabel: "Activité",
    poweredOff: "Éteinte",
    defaultLayout: "Disposition par défaut",
    activityFallback: (id: number | string) => `Activité ${id}`,
  },
  assist: {
    label: "Capture de touches",
    start: "Démarrer",
    waiting: "En attente d’une pression sur une touche",
    exitEditMode: "Quittez le mode d’édition pour commencer",
    captured: (label: string) => `Capture : ${label}`,
    notCaptured: "Aucune capture.",
    working: "Traitement en cours…",
    triggersReady: "Déclencheurs prêts à l’emploi",
    createTriggers: "Créer les déclencheurs MQTT Discovery",
    startCapturing: "Commencer la capture des commandes",
    deviceDetectedTitle: "Appareil MQTT Sofabaton détecté.",
    close: "Fermer",
    alsoActivityTriggers:
      "Créer également des déclencheurs pour les changements d’activité.",
    seeDocs: "Consultez la documentation de cette fonctionnalité.",
    dontShowAgain:
      "Ne plus afficher ce message pour cet appareil pendant cette session.",
    detectedDevice: (name: string) => `Appareil MQTT détecté : ${name}.`,
    lastCommand: (name: string) => `Dernière commande : ${name}.`,
    existingTriggers:
      "Des déclencheurs d’automatisation MQTT existants ont été trouvés.",
    noMqttCommands: "Aucune commande MQTT découverte pour le moment",
    deviceFallback: (id: number | string) => `Appareil ${id}`,
    unknownDevice: "Appareil inconnu",
    commandFallback: (id: number | string) => `Commande ${id}`,
    createdTriggers: (count: number, deviceLabel: string) =>
      `${count} ${plural(count, "déclencheur")} MQTT Discovery ${plural(count, "créé")} pour ${deviceLabel}`,
    createdActivityTriggers: (count: number) =>
      `${count} ${plural(count, "déclencheur")} d’activité ${plural(count, "créé")} pour X2 → Activities`,
    plusActivityTriggers: (count: number) =>
      ` ; ${count} ${plural(count, "déclencheur")} d’activité également ${plural(count, "créé")}`,
    allTriggersExist: (deviceLabel: string) =>
      `Tous les déclencheurs MQTT Discovery existent déjà pour ${deviceLabel}`,
    buttonFallback: "Touche",
    activityFallbackLabel: "Activité",
    unknown: "Inconnu",
    automationAssistName: "Automation Assist",
    notification: {
      title: "🛠️ Automation Assist",
      eventButton: (label: string) => `Touche : ${label}`,
      eventActivity: (label: string) => `Changement d’activité : ${label}`,
      eventOther: (label: string) => `Événement : ${label}`,
      header: (activityName: string, eventLabel: string) =>
        `**Activité : ${activityName} | ${eventLabel}**`,
      lovelaceHeading: "📋 **Code de bouton Lovelace**",
      lovelaceCopy: "*Copiez ceci dans le YAML de votre tableau de bord :*",
      serviceHeading: "⚙️ **Appel de service (automatisation)**",
      serviceCopy: "*Utilisez ceci dans vos scripts ou automatisations :*",
    },
  },
  editor: {
    fieldLabels: {
      entity: "Sélectionner une entité de télécommande Sofabaton",
      theme: "Appliquer un thème à la carte",
      use_background_override: "Personnaliser la couleur d’arrière-plan",
      background_override: "Sélectionner la couleur d’arrière-plan",
      show_activity: "Sélecteur d’activité",
      show_dpad: "Pavé directionnel",
      show_nav: "Touches Retour/Accueil/Menu",
      show_mid: "Touches de volume et de chaîne",
      show_media: "Commandes de lecture multimédia",
      show_colors: "Rouge/Vert/Jaune/Bleu",
      show_abc: "Touches A/B/C",
      show_macros_button: "Bouton des macros",
      show_favorites_button: "Bouton des favoris",
      max_width: "Largeur maximale de la carte (px)",
      group_order: "Ordre des groupes",
    },
    automationAssistTitle: "Assistant d’automatisation",
    keyCapture: "Capture de touches",
    keyCaptureDescription:
      "Envoyez les pressions sur les touches au hub afin de générer du YAML prêt à l’emploi pour les boutons du tableau de bord et les automatisations.",
    keyCaptureLearnMore: "En savoir plus sur la capture de touches",
    keyCaptureDocsAria: "Documentation sur la capture de touches",
    stylingOptions: "Options de style",
    layoutOptions: "Options de disposition",
    layoutSelectLabel: "Disposition",
    defaultLayoutOption: "Disposition par défaut",
    macrosFavoritesAsRows: "Macros/favoris sous forme de lignes",
    visibleRows: "Lignes visibles",
    moveGroupUp: (groupLabel: string) =>
      `Déplacer ${groupLabel} vers le haut`,
    moveGroupDown: (groupLabel: string) =>
      `Déplacer ${groupLabel} vers le bas`,
    macros: "Macros",
    favorites: "Favoris",
    volume: "Volume",
    channel: "Chaîne",
    mediaControls: "Commandes multimédias",
    dvr: "DVR",
    resetCardDefault: "Réinitialiser la carte",
    resetDefaultLayout: "Réinitialiser",
    noteDefaultLayout: "Utilisée pour les activités sans disposition propre",
    noteCustomLayout: "Disposition personnalisée utilisée",
    noteUsingDefault: "Disposition par défaut utilisée",
  },
  groups: {
    activity: "Sélecteur d’activité",
    macro_favorites: "Macros/favoris",
    macros_row: "Ligne des macros",
    favorites_row: "Ligne des favoris",
    dpad: "Pavé directionnel",
    nav: "Retour/Accueil/Menu",
    mid: "Volume/Chaîne",
    media: "Commandes multimédias",
    colors: "Touches de couleur",
    abc: "A/B/C",
  },
  keys: {
    up: "Haut",
    down: "Bas",
    left: "Gauche",
    right: "Droite",
    ok: "OK",
    back: "Retour",
    home: "Accueil",
    menu: "Menu",
    volup: "Volume +",
    voldn: "Volume -",
    mute: "Couper le son",
    chup: "Chaîne +",
    chdn: "Chaîne -",
    guide: "Guide des programmes",
    dvr: "DVR",
    play: "Lecture",
    exit: "Quitter",
    rew: "Retour rapide",
    pause: "Pause",
    fwd: "Avance rapide",
    red: "Rouge",
    green: "Vert",
    yellow: "Jaune",
    blue: "Bleu",
    a: "A",
    b: "B",
    c: "C",
  },
} satisfies RemoteCardStrings;

registerRemoteCardTranslation("fr", REMOTE_CARD_STRINGS_FR);
