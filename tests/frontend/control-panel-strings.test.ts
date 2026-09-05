import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  TOOLS_CARD_STRINGS,
  TOOLS_CARD_STRINGS_EN,
  hasToolsCardTranslation,
  registerToolsCardTranslation,
  setToolsCardLanguage,
  toolsCardLanguage,
  toolsStr,
} from "../../custom_components/sofabaton_x1s/www/src/strings";
import { TOOLS_CARD_LOCALES } from "../../custom_components/sofabaton_x1s/www/src/control-panel-language-loader";
import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";

test("control-panel strings default to the complete English table", () => {
  setToolsCardLanguage("en");
  assert.equal(toolsCardLanguage(), "en");
  assert.equal(toolsStr().tabs.cache, TOOLS_CARD_STRINGS_EN.tabs.cache);
  assert.equal(TOOLS_CARD_STRINGS.common.activityFallback(7), "Activity 7");
});

test("every emitted Control Panel locale is registered by the eager test helper", () => {
  for (const locale of TOOLS_CARD_LOCALES) {
    assert.equal(hasToolsCardTranslation(locale), true, locale);
  }
});

test("partial translations overlay English and regional locales use their base language", () => {
  const cachedBackupTable = TOOLS_CARD_STRINGS.backup;
  registerToolsCardTranslation("xx", {
    tabs: { cache: "Centrale" },
    backup: { complete: "Klaar" },
  });

  setToolsCardLanguage("xx-BE");
  assert.equal(TOOLS_CARD_STRINGS.tabs.cache, "Centrale");
  assert.equal(cachedBackupTable.complete, "Klaar");
  assert.equal(TOOLS_CARD_STRINGS.tabs.logs, TOOLS_CARD_STRINGS_EN.tabs.logs);

  setToolsCardLanguage("en");
  assert.equal(cachedBackupTable.complete, TOOLS_CARD_STRINGS_EN.backup.complete);
});

test("unknown control-panel languages fall back to English", () => {
  setToolsCardLanguage("zz-ZZ");
  assert.equal(TOOLS_CARD_STRINGS.card.pickerName, TOOLS_CARD_STRINGS_EN.card.pickerName);
  assert.equal(TOOLS_CARD_STRINGS.errors.noHubSelected, TOOLS_CARD_STRINGS_EN.errors.noHubSelected);
  setToolsCardLanguage("en");
});

test("bundled English (en-GB) uses proper English spelling and American English fallback", () => {
  setToolsCardLanguage("en-GB");

  assert.equal(TOOLS_CARD_STRINGS.cache.favorites, "Favourites");
  assert.equal(TOOLS_CARD_STRINGS.common.favoriteFallback(3), "Favourite 3");
  assert.equal(TOOLS_CARD_STRINGS.activities.review.idleChanged("TV", "on"), '"TV" idle behaviour → on.');
  assert.equal(TOOLS_CARD_STRINGS.backup.customizeButtonsToggle, "Customise individual buttons");
  assert.equal(TOOLS_CARD_STRINGS.wifiCommands.colorGroup, "Colour");
  assert.equal(TOOLS_CARD_STRINGS.tabs.backup, TOOLS_CARD_STRINGS_EN.tabs.backup);

  setToolsCardLanguage("en");
});

test("bundled complete control-panel translations select regional locales and preserve dynamic meaning", () => {
  const cases = [
    {
      locale: "nl-NL",
      favorites: "Favorieten",
      activity: "Activiteit 7",
      immediate: "Dit wordt onmiddellijk op de hub toegepast.",
      replace: "Verwijderingen worden alleen op de hub toegepast als ‘Bestaande apparaten en activiteiten wissen’ tijdens het herstellen is ingeschakeld.",
      volumeChannel: "Volume en kanaal",
      playback: "Afspelen",
    },
    {
      locale: "de-DE",
      favorites: "Favoriten",
      activity: "Aktivität 7",
      immediate: "Dies wird sofort auf dem Hub angewendet.",
      replace: "Löschungen werden nur auf den Hub angewendet, wenn „Vorhandene Geräte und Aktivitäten löschen“ bei der Wiederherstellung aktiviert ist.",
      volumeChannel: "Lautstärke & Kanal",
      playback: "Wiedergabe",
    },
    {
      locale: "fr-FR",
      favorites: "Favoris",
      activity: "Activité 7",
      immediate: "Cette modification est appliquée immédiatement au hub.",
      replace: "Les suppressions ne sont appliquées au hub que si l’option « Effacer les appareils et activités existants » est activée pendant la restauration.",
      volumeChannel: "Volume et chaînes",
      playback: "Lecture",
    },
    {
      locale: "es-ES",
      favorites: "Favoritos",
      activity: "Actividad 7",
      immediate: "Esto se aplica al hub inmediatamente.",
      replace: "Las eliminaciones solo se aplican al hub si se activa «Borrar los dispositivos y actividades existentes» durante la restauración.",
      volumeChannel: "Volumen y canal",
      playback: "Reproducción",
    },
  ];

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    assert.equal(TOOLS_CARD_STRINGS.cache.favorites, item.favorites);
    assert.equal(TOOLS_CARD_STRINGS.common.activityFallback(7), item.activity);
    assert.equal(TOOLS_CARD_STRINGS.backup.deleteImmediateNote, item.immediate);
    assert.equal(TOOLS_CARD_STRINGS.backup.deleteReplaceNote, item.replace);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.transportGroup, item.volumeChannel);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.mediaGroup, item.playback);
  }

  setToolsCardLanguage("en");
});

test("Spanish power section labels describe both on and off behavior", () => {
  setToolsCardLanguage("es-ES");
  assert.equal(TOOLS_CARD_STRINGS.activities.deviceReview.sectionPower, "Encendido y apagado");
  assert.equal(TOOLS_CARD_STRINGS.backup.detailPower, "Encendido y apagado");
  setToolsCardLanguage("en");
});

test("shared editor terminology stays aligned within every Control Panel locale", () => {
  const cases = [
    ["en", "Button assignments", "Updating automatic power control…", "Playback", "HTTP listener", "Fast forward"],
    ["de", "Tastenbelegungen", "Automatisches Ein- und Ausschalten wird aktualisiert…", "Wiedergabe", "HTTP-Listener", "Vorspulen"],
    ["es", "Asignaciones de botones", "Actualizando el encendido y apagado automático…", "Reproducción", "listener HTTP", "Avance rápido"],
    ["fr", "Attributions de touches", "Mise à jour de la marche/arrêt automatique…", "Lecture", "écouteur HTTP", "Avance rapide"],
    ["nl", "Knoptoewijzingen", "Automatisch in- en uitschakelen bijwerken…", "Afspelen", "HTTP-listener", "Vooruitspoelen"],
    ["zh-Hans", "按键分配", "正在更新自动电源控制…", "播放", "HTTP 监听器", "快进"],
  ] as const;

  for (const [locale, assignments, powerProgress, playback, listener, fastForward] of cases) {
    setToolsCardLanguage(locale);
    assert.equal(TOOLS_CARD_STRINGS.backup.buttonBindingsTitle, assignments, locale);
    assert.equal(TOOLS_CARD_STRINGS.backendState.entityStepIdleBehavior, powerProgress, locale);
    assert.equal(TOOLS_CARD_STRINGS.backendState.wifiStepPowerConfig, powerProgress, locale);
    assert.equal(TOOLS_CARD_STRINGS.backup.buttonCatalog.transport, playback, locale);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.mediaGroup, playback, locale);
    assert.match(TOOLS_CARD_STRINGS.wifiCommands.transportMqttHint, new RegExp(listener), locale);
    assert.equal(TOOLS_CARD_STRINGS.backup.buttonCatalog.forward, fastForward, locale);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.keyLabels.fwd, fastForward, locale);
  }

  setToolsCardLanguage("en");
});

test("IR learning copy follows each locale's established glossary", () => {
  const cases = [
    ["de", "Nutzdaten", "Anlernen", "IR-Zeitwerte"],
    ["es", "carga útil", "mando a distancia", "duraciones de señal"],
    ["fr", "données utiles", "télécommande source", "durées de signal"],
    ["nl", "payload", "Inleren", "timingwaarden"],
    ["zh-Hans", "有效载荷", "Hub", "时序值"],
  ] as const;

  for (const [locale, payload, learning, timing] of cases) {
    setToolsCardLanguage(locale);
    const copy = [
      TOOLS_CARD_STRINGS.backup.learnAria,
      TOOLS_CARD_STRINGS.backup.learnHubLearned(12, "38"),
      TOOLS_CARD_STRINGS.backup.learnHubNoPayload,
      TOOLS_CARD_STRINGS.backup.learnHaUnavailable,
    ].join(" ");
    const normalized = copy.toLowerCase();
    assert.equal(normalized.includes(payload.toLowerCase()), true, `${locale}: payload term`);
    assert.equal(normalized.includes(learning.toLowerCase()), true, `${locale}: learning term`);
    assert.equal(normalized.includes(timing.toLowerCase()), true, `${locale}: timing term`);
    assert.equal(normalized.includes("emitter inbox"), false, `${locale}: no inbox metaphor`);
  }

  setToolsCardLanguage("en");
});

test("remote entity copy follows Home Assistant's domain terminology", () => {
  const cases = [
    ["de", "Fernsteuerungsentität"],
    ["es", "entidad de mando a distancia"],
    ["fr", "entité de télécommande"],
    ["nl", "afstandsbedieningsentiteit"],
    ["zh-Hans", "遥控实体"],
  ] as const;

  for (const [locale, term] of cases) {
    setToolsCardLanguage(locale);
    assert.match(TOOLS_CARD_STRINGS.hubClick.noRemoteEntity, new RegExp(term, "i"), locale);
  }

  setToolsCardLanguage("en");
});

test("correctness-sensitive translations preserve runtime meaning and protocol identifiers", () => {
  setToolsCardLanguage("zh-Hans");
  assert.equal(
    TOOLS_CARD_STRINGS.backup.wifiEventCreateFailed,
    "无法创建 Wifi 事件。事件会保持暂存，并在下次创建时重试。",
  );

  setToolsCardLanguage("es");
  assert.match(TOOLS_CARD_STRINGS.decodedPayload.httpSubtitle, /\bwifi_ip\b/);
  assert.doesNotMatch(TOOLS_CARD_STRINGS.decodedPayload.httpSubtitle, /Wifi_ip/);

  setToolsCardLanguage("nl");
  assert.equal(TOOLS_CARD_STRINGS.wifiCommands.clearSlotSubtitle, "De configuratie wordt gewist.");
  assert.deepEqual(
    [
      TOOLS_CARD_STRINGS.backendState.operationBackup,
      TOOLS_CARD_STRINGS.backendState.operationRestore,
      TOOLS_CARD_STRINGS.backendState.operationCacheRefresh,
      TOOLS_CARD_STRINGS.backendState.operationEntitySync,
      TOOLS_CARD_STRINGS.backendState.operationWifiDeploy,
    ],
    [
      "Back-up wordt gemaakt",
      "Back-up wordt hersteld",
      "Hubcache wordt vernieuwd",
      "Synchronisatie met hub wordt uitgevoerd",
      "Wifi Commands worden gesynchroniseerd",
    ],
  );

  setToolsCardLanguage("en");
});

test("French zero counts use the singular category", () => {
  setToolsCardLanguage("fr");

  assert.deepEqual(
    [
      TOOLS_CARD_STRINGS.backup.selectedCount(0),
      TOOLS_CARD_STRINGS.backup.backupResultSummary(0, 0),
      TOOLS_CARD_STRINGS.backup.activityMeta(0, 0),
      TOOLS_CARD_STRINGS.backup.deleteImpactActivities(0),
      TOOLS_CARD_STRINGS.backup.deleteImpactFavorites(0),
      TOOLS_CARD_STRINGS.backup.deleteImpactMacroSteps(0),
      TOOLS_CARD_STRINGS.backup.deleteImpactPowerSteps(0),
      TOOLS_CARD_STRINGS.backup.deleteImpactBindings(0),
      TOOLS_CARD_STRINGS.backup.macroStepsCount(0),
      TOOLS_CARD_STRINGS.backup.roleMappedNote(0, 3),
      TOOLS_CARD_STRINGS.backup.bindingsConfiguredCount(0),
      TOOLS_CARD_STRINGS.wifiCommands.configuredSlots(0),
      TOOLS_CARD_STRINGS.wifiCommands.inActivities(0),
      TOOLS_CARD_STRINGS.wifiCommands.eventsConfiguredPill(0, 3),
      TOOLS_CARD_STRINGS.wifiCommands.eventsShowUnconfigured(0),
      TOOLS_CARD_STRINGS.wifiCommands.wifiEventDeleteRefs(0, 0, 0),
    ],
    [
      "0 sélectionné",
      "Sauvegarde de 0 activité et 0 appareil",
      "0 favori · 0 macro",
      "0 activité y fait référence",
      "0 raccourci sera supprimé",
      "0 étape de séquence sera supprimée",
      "0 étape de marche/arrêt sera effacée",
      "0 attribution de touche sera effacée",
      "0 étape",
      "0 touche attribuée sur 3",
      "0 configurée",
      "0 emplacement",
      "dans 0 activité",
      "0 sur 3 configuré",
      "Afficher 0 non configuré…",
      "Le hub supprimera aussi 0 raccourci et 0 attribution de touche qui y font référence ; l’étape est retirée de 0 macro (une macro sans étapes est supprimée).",
    ],
  );

  setToolsCardLanguage("en");
});

test("bundled Simplified Chinese control-panel translation supports zh-Hans", () => {
  setToolsCardLanguage("zh-Hans");

  assert.deepEqual(
    [
      TOOLS_CARD_STRINGS.tabs.cache,
      TOOLS_CARD_STRINGS.tabs.wifiCommands,
      TOOLS_CARD_STRINGS.tabs.backup,
      TOOLS_CARD_STRINGS.tabs.settings,
      TOOLS_CARD_STRINGS.tabs.logs,
    ],
    ["Hub", "自动化", "备份", "设置", "日志"],
  );
  assert.equal(TOOLS_CARD_STRINGS.common.activityFallback(7), "活动 7");
  assert.equal(TOOLS_CARD_STRINGS.cache.activityCounts(2, 1, 4), "2 个收藏 / 1 个宏 / 4 个按键");
  assert.equal(TOOLS_CARD_STRINGS.backup.backupResultSummary(2, 3), "备份包含 2 个活动和 3 个设备");
  assert.equal(TOOLS_CARD_STRINGS.backup.deleteImmediateNote, "此操作会立即应用到 Hub。");
  assert.equal(TOOLS_CARD_STRINGS.wifiCommands.action, "动作");
  assert.equal(TOOLS_CARD_STRINGS.hubClick.lovelaceHint, "复制到仪表板 YAML：");
  assert.equal(TOOLS_CARD_STRINGS.backendState.restoreDevice(8), "正在恢复设备 8…");
  assert.equal(
    TOOLS_CARD_STRINGS.wifiCommands.wifiEventDeleteRefs(1, 2, 3),
    "Hub 还会移除引用此事件的 1 个快捷项和 2 个按键分配，并从 3 个宏中移除此步骤（没有步骤的宏会被删除）。",
  );

  setToolsCardLanguage("en");
});

test("compact navigation and button copy stays clear in translated UI", () => {
  const cases = [
    {
      locale: "nl",
      tabs: ["Hub", "Automatisering", "Back-up"],
      cache: ["Inschakelen", "Lijst", "Alles", "Ordenen", "Toevoegen", "Toevoegen", "Synchroniseren"],
      backupSections: ["Maken", "Bewerken", "Herstellen"],
      backupButtons: ["Downloaden", "Geen", "Alles", "Starten", "Bestand kiezen"],
      wifiButtons: ["Toevoegen", "Synchroniseren"],
      retrySync: "Opnieuw synchroniseren",
    },
    {
      locale: "de",
      tabs: ["Hub", "Automatisierung", "Backup"],
      cache: ["Aktivieren", "Liste", "Alle", "Sortieren", "Hinzufügen", "Hinzufügen", "Synchronisieren"],
      backupSections: ["Sichern", "Ändern", "Wiederherstellen"],
      backupButtons: ["Herunterladen", "Keine", "Alle", "Starten", "Datei auswählen"],
      wifiButtons: ["Hinzufügen", "Synchronisieren"],
      retrySync: "Erneut synchronisieren",
    },
    {
      locale: "fr",
      tabs: ["Hub", "Automatisation", "Sauvegarde"],
      cache: ["Activer", "Liste", "Tout", "Réordonner", "Ajouter", "Ajouter", "Synchroniser"],
      backupSections: ["Créer", "Modifier", "Restaurer"],
      backupButtons: ["Télécharger", "Aucun", "Tout", "Démarrer", "Choisir un fichier"],
      wifiButtons: ["Ajouter", "Synchroniser"],
      retrySync: "Resynchroniser",
    },
    {
      locale: "es",
      tabs: ["Hub", "Automatización", "Backup"],
      cache: ["Activar", "Lista", "Todo", "Ordenar", "Añadir", "Añadir", "Sincronizar"],
      backupSections: ["Crear", "Editar", "Restaurar"],
      backupButtons: ["Descargar", "Ninguno", "Todos", "Iniciar", "Elegir archivo"],
      wifiButtons: ["Añadir", "Sincronizar"],
      retrySync: "Reintentar",
    },
  ] as const;

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    assert.deepEqual(
      [TOOLS_CARD_STRINGS.tabs.cache, TOOLS_CARD_STRINGS.tabs.wifiCommands, TOOLS_CARD_STRINGS.tabs.backup],
      item.tabs,
      `${item.locale} primary tabs`,
    );
    assert.deepEqual(
      [
        TOOLS_CARD_STRINGS.cache.enablePersistentCache,
        TOOLS_CARD_STRINGS.cache.refreshList,
        TOOLS_CARD_STRINGS.cache.refreshAll,
        TOOLS_CARD_STRINGS.cache.changeOrder,
        TOOLS_CARD_STRINGS.cache.addActivity,
        TOOLS_CARD_STRINGS.cache.addDevice,
        TOOLS_CARD_STRINGS.cache.reorderSync,
      ],
      item.cache,
      `${item.locale} Hub actions`,
    );
    assert.deepEqual(
      [
        TOOLS_CARD_STRINGS.backup.sectionMake,
        TOOLS_CARD_STRINGS.backup.sectionEdit,
        TOOLS_CARD_STRINGS.backup.sectionRestore,
      ],
      item.backupSections,
      `${item.locale} Backup sections`,
    );
    assert.deepEqual(
      [
        TOOLS_CARD_STRINGS.backup.downloadBackup,
        TOOLS_CARD_STRINGS.backup.deselectAll,
        TOOLS_CARD_STRINGS.backup.selectAll,
        TOOLS_CARD_STRINGS.backup.startBackup,
        TOOLS_CARD_STRINGS.backup.chooseBackupFile,
      ],
      item.backupButtons,
      `${item.locale} Backup actions`,
    );
    assert.deepEqual(
      [
        TOOLS_CARD_STRINGS.wifiCommands.addDeviceButton,
        TOOLS_CARD_STRINGS.wifiCommands.actionButtonSyncToHub,
      ],
      item.wifiButtons,
      `${item.locale} Automation actions`,
    );
    assert.deepEqual(
      [TOOLS_CARD_STRINGS.activities.syncRetry, TOOLS_CARD_STRINGS.wifiCommands.wifiEventRetrySync],
      [item.retrySync, item.retrySync],
      `${item.locale} retry-sync actions`,
    );
  }

  setToolsCardLanguage("en");
});

test("firmware copy distinguishes required updates from recommendations", () => {
  setToolsCardLanguage("en");

  assert.equal(TOOLS_CARD_STRINGS.hub.firmwareUpdateRequired, "Firmware update required");
  assert.equal(TOOLS_CARD_STRINGS.hub.firmwareUpdateRecommended, "Firmware update recommended");
  assert.equal(
    TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(8, 5, true),
    "Firmware version 5 or newer is required for Control Panel configuration changes. Firmware version 8 or newer is recommended because it contains fixes for known issues. Update the hub over Bluetooth using the Sofabaton app.",
  );
  assert.equal(
    TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(8, 5, false),
    "Firmware version 8 or newer is recommended because it contains fixes for known issues. Your installed firmware remains supported for Control Panel configuration changes. Update the hub over Bluetooth using the Sofabaton app.",
  );
  assert.equal(
    TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(5, 5, true),
    "Firmware version 5 or newer is required for Control Panel configuration changes. Update the hub over Bluetooth using the Sofabaton app.",
  );

  const labels = [
    ["de", "Firmware-Update erforderlich", "Firmware-Update empfohlen"],
    ["es", "Actualización de firmware necesaria", "Actualización de firmware recomendada"],
    ["fr", "Mise à jour du firmware requise", "Mise à jour du firmware recommandée"],
    ["nl", "Firmware-update vereist", "Firmware-update aanbevolen"],
    ["zh-Hans", "需要更新固件", "建议更新固件"],
  ] as const;

  for (const [locale, required, recommended] of labels) {
    setToolsCardLanguage(locale);
    assert.equal(TOOLS_CARD_STRINGS.hub.firmwareUpdateRequired, required, locale);
    assert.equal(TOOLS_CARD_STRINGS.hub.firmwareUpdateRecommended, recommended, locale);

    const blocked = TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(8, 5, true);
    const advisory = TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(8, 5, false);
    assert.match(blocked, /5/, `${locale} required version`);
    assert.match(blocked, /8/, `${locale} recommended version`);
    assert.notEqual(blocked, advisory, `${locale} required and recommended states`);
  }

  setToolsCardLanguage("zh-Hans");
  assert.equal(
    TOOLS_CARD_STRINGS.availability.blockedByFirmware(2, 5),
    "此 Hub 当前固件版本为 2。要使用控制面板中修改 Hub 配置的功能，请先使用 Sofabaton 应用通过蓝牙将 Hub 固件升级至 5 或更高版本。Hub 上报新固件版本后，此功能将自动恢复。",
  );
  assert.equal(
    TOOLS_CARD_STRINGS.activities.firmwareUnsupportedBody(2, 5),
    "此 Hub 当前固件版本为 2。要安全编辑 Hub 配置，需要 5 或更高版本。为保护你的配置，编辑功能已禁用。请使用 Sofabaton 应用通过蓝牙升级 Hub 固件。Hub 上报新固件版本后，编辑功能将自动恢复。",
  );
  assert.equal(
    TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(8, 5, true),
    "控制面板中的配置修改功能要求固件版本不低于 5。建议升级至 8 或更高版本，其中包含针对已知问题的修复。请使用 Sofabaton 应用通过蓝牙升级 Hub 固件。",
  );
  assert.equal(
    TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(8, 5, false),
    "建议将固件升级至 8 或更高版本，其中包含针对已知问题的修复。当前固件仍支持通过控制面板修改配置。请使用 Sofabaton 应用通过蓝牙升级 Hub 固件。",
  );
  assert.equal(
    TOOLS_CARD_STRINGS.hub.firmwareUpdateTooltip(5, 5, true),
    "控制面板中的配置修改功能要求固件版本不低于 5。请使用 Sofabaton 应用通过蓝牙升级 Hub 固件。",
  );

  setToolsCardLanguage("en");
});

test("activity membership and MQTT delivery copy stays explicit in every locale", () => {
  const cases = [
    {
      locale: "en",
      helper: "The device is added to both power sequences. Assign buttons or shortcuts later, or leave them empty.",
      mqttTitle: "MQTT identifiers",
      transportLabel: "Delivery method",
      transportLocked: "The delivery method cannot be changed after the device is synced to the hub.",
    },
    {
      locale: "de",
      helper: "Das Gerät wird beiden Ein-/Ausschaltsequenzen hinzugefügt. Tasten oder Verknüpfungen kannst du später zuweisen; die Sequenzen dürfen auch leer bleiben.",
      mqttTitle: "MQTT-Kennungen",
      transportLabel: "Übertragungsweg",
      transportLocked: "Der Übertragungsweg kann nach der Synchronisierung des Geräts mit dem Hub nicht mehr geändert werden.",
    },
    {
      locale: "es",
      helper: "El dispositivo se añade a las secuencias de encendido y apagado. Puedes asignar botones o accesos directos más tarde, o dejar las secuencias vacías.",
      mqttTitle: "Identificadores MQTT",
      transportLabel: "Método de transmisión",
      transportLocked: "El método no se puede cambiar después de sincronizar el dispositivo con el hub.",
    },
    {
      locale: "fr",
      helper: "L’appareil est ajouté aux séquences d’allumage et d’extinction. Vous pourrez attribuer des touches ou des raccourcis plus tard, ou laisser les séquences vides.",
      mqttTitle: "Identifiants MQTT",
      transportLabel: "Mode de transmission",
      transportLocked: "Le mode de transmission ne peut plus être modifié après la synchronisation de l’appareil avec le hub.",
    },
    {
      locale: "nl",
      helper: "Het apparaat wordt toegevoegd aan de in- en uitschakelreeksen. Je kunt later knoppen of snelkoppelingen toewijzen, of de reeksen leeg laten.",
      mqttTitle: "MQTT-id's",
      transportLabel: "Overdrachtsmethode",
      transportLocked: "De overdrachtsmethode kan niet meer worden gewijzigd nadat het apparaat met de hub is gesynchroniseerd.",
    },
    {
      locale: "zh-Hans",
      helper: "将设备添加到开机和关机序列。稍后可分配按键或快捷项，也可将序列留空。",
      mqttTitle: "MQTT 标识符",
      transportLabel: "传输方式",
      transportLocked: "设备同步到 Hub 后，传输方式无法更改。",
    },
  ] as const;

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    assert.equal(TOOLS_CARD_STRINGS.backup.addMemberHelper, item.helper, item.locale);
    assert.equal(TOOLS_CARD_STRINGS.decodedPayload.mqttTitle, item.mqttTitle, item.locale);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.transportLabel, item.transportLabel, item.locale);
    assert.equal(TOOLS_CARD_STRINGS.wifiCommands.transportLockedNote, item.transportLocked, item.locale);
  }

  setToolsCardLanguage("en");
  assert.equal(TOOLS_CARD_STRINGS.decodedPayload.mqttDeviceId, "Device ID (ignored by the hub)");
  assert.equal(TOOLS_CARD_STRINGS.decodedPayload.mqttCommandId, "Command ID (ignored by the hub)");
});

test("German and Dutch use native terminology for generic Wifi event copy", () => {
  setToolsCardLanguage("de");
  assert.equal(TOOLS_CARD_STRINGS.backup.wifiEventNameLabel, "Ereignisname");
  assert.match(TOOLS_CARD_STRINGS.wifiCommands.wifiEventsSubtitle, /^Ereignisse,/);
  assert.equal(TOOLS_CARD_STRINGS.wifiCommands.wifiEventNeedsSyncBadge, "Synchronisierung nötig");

  setToolsCardLanguage("nl");
  assert.equal(TOOLS_CARD_STRINGS.backup.wifiEventNameLabel, "Naam van de gebeurtenis");
  assert.match(TOOLS_CARD_STRINGS.wifiCommands.wifiEventsSubtitle, /^Gebeurtenissen /);
  assert.equal(TOOLS_CARD_STRINGS.wifiCommands.wifiEventNeedsSyncBadge, "Synchronisatie nodig");

  setToolsCardLanguage("en");
});

test("control-panel count copy uses real singular and plural forms", () => {
  const cases = [
    {
      locale: "en",
      expected: [
        "0 favs / 1 macro / 2 buttons",
        "1 cmd",
        "2 cmds",
        "1 favorite · 2 macros",
        "1 linked device",
        "1 of 1 button mapped",
        "1 of 2 buttons mapped",
        "1 configured",
        "2 configured",
        "The hub will also remove 1 shortcut and 0 button assignments that reference it, and the step is removed from 1 macro (a macro left with no steps is removed).",
        "The hub will also remove 2 shortcuts and 2 button assignments that reference it, and the step is removed from 2 macros (a macro left with no steps is removed).",
      ],
    },
    {
      locale: "en-GB",
      expected: [
        "0 favs / 1 macro / 2 buttons",
        "1 cmd",
        "2 cmds",
        "1 favourite · 2 macros",
        "1 linked device",
        "1 of 1 button mapped",
        "1 of 2 buttons mapped",
        "1 configured",
        "2 configured",
        "The hub will also remove 1 shortcut and 0 button assignments that reference it, and the step is removed from 1 macro (a macro left with no steps is removed).",
        "The hub will also remove 2 shortcuts and 2 button assignments that reference it, and the step is removed from 2 macros (a macro left with no steps is removed).",
      ],
    },
    {
      locale: "nl",
      expected: [
        "0 fav. / 1 macro / 2 knoppen",
        "1 cmd",
        "2 cmd",
        "1 favoriet · 2 macro's",
        "1 gekoppeld apparaat",
        "1 van 1 knop gekoppeld",
        "1 van 2 knoppen gekoppeld",
        "1 geconfigureerd",
        "2 geconfigureerd",
        "De hub verwijdert ook 1 snelkoppeling en 0 knoptoewijzingen die ernaar verwijzen; de stap wordt uit 1 macro verwijderd (een macro zonder stappen wordt verwijderd).",
        "De hub verwijdert ook 2 snelkoppelingen en 2 knoptoewijzingen die ernaar verwijzen; de stap wordt uit 2 macro's verwijderd (een macro zonder stappen wordt verwijderd).",
      ],
    },
    {
      locale: "de",
      expected: [
        "0 Fav. / 1 Makro / 2 Tasten",
        "1 Bef.",
        "2 Bef.",
        "1 Favorit · 2 Makros",
        "1 verknüpftes Gerät",
        "1 von 1 Taste belegt",
        "1 von 2 Tasten belegt",
        "1 konfiguriert",
        "2 konfiguriert",
        "Der Hub entfernt außerdem 1 Verknüpfung und 0 Tastenbelegungen, die darauf verweisen; der Schritt wird aus 1 Makro entfernt (ein Makro ohne Schritte wird gelöscht).",
        "Der Hub entfernt außerdem 2 Verknüpfungen und 2 Tastenbelegungen, die darauf verweisen; der Schritt wird aus 2 Makros entfernt (ein Makro ohne Schritte wird gelöscht).",
      ],
    },
    {
      locale: "fr",
      expected: [
        "0 fav. / 1 macro / 2 touches",
        "1 cmd",
        "2 cmd",
        "1 favori · 2 macros",
        "1 appareil lié",
        "1 touche attribuée sur 1",
        "1 touche attribuée sur 2",
        "1 configurée",
        "2 configurées",
        "Le hub supprimera aussi 1 raccourci et 0 attribution de touche qui y font référence ; l’étape est retirée de 1 macro (une macro sans étapes est supprimée).",
        "Le hub supprimera aussi 2 raccourcis et 2 attributions de touches qui y font référence ; l’étape est retirée de 2 macros (une macro sans étapes est supprimée).",
      ],
    },
    {
      locale: "es",
      expected: [
        "0 fav. / 1 macro / 2 botones",
        "1 cmd",
        "2 cmd",
        "1 favorito · 2 macros",
        "1 dispositivo vinculado",
        "1 de 1 botón asignado",
        "1 de 2 botones asignados",
        "1 configurado",
        "2 configurados",
        "El hub también eliminará 1 acceso directo y 0 asignaciones de botones que hacen referencia al evento; el paso se elimina de 1 macro (una macro sin pasos se elimina).",
        "El hub también eliminará 2 accesos directos y 2 asignaciones de botones que hacen referencia al evento; el paso se elimina de 2 macros (una macro sin pasos se elimina).",
      ],
    },
  ];

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    const actual = [
      TOOLS_CARD_STRINGS.cache.activityCounts(0, 1, 2),
      TOOLS_CARD_STRINGS.cache.deviceCommandCount(1),
      TOOLS_CARD_STRINGS.cache.deviceCommandCount(2),
      TOOLS_CARD_STRINGS.backup.activityMeta(1, 2),
      TOOLS_CARD_STRINGS.backup.linkedDevices(1),
      TOOLS_CARD_STRINGS.backup.roleMappedNote(1, 1),
      TOOLS_CARD_STRINGS.backup.roleMappedNote(1, 2),
      TOOLS_CARD_STRINGS.backup.bindingsConfiguredCount(1),
      TOOLS_CARD_STRINGS.backup.bindingsConfiguredCount(2),
      TOOLS_CARD_STRINGS.wifiCommands.wifiEventDeleteRefs(1, 0, 1),
      TOOLS_CARD_STRINGS.wifiCommands.wifiEventDeleteRefs(2, 2, 2),
    ];
    assert.deepEqual(actual, item.expected, item.locale);
  }

  setToolsCardLanguage("en");
});

function sourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(root, entry.name);
    return entry.isDirectory() ? sourceFiles(target) : [target];
  });
}

function lineOf(source: ts.SourceFile, node: ts.Node): number {
  return source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
}

function tagName(node: ts.TaggedTemplateExpression): string {
  return node.tag.getText();
}

function templateText(node: ts.TaggedTemplateExpression): string {
  const template = node.template;
  if (ts.isNoSubstitutionTemplateLiteral(template)) return template.text;
  return template.head.text
    + template.templateSpans.map((span) => `__EXPR__${span.literal.text}`).join("");
}

function normalizeVisibleText(value: string): string {
  return value
    .replace(/__EXPR__/g, " ")
    .replace(/&(?:amp|nbsp|mdash|hellip);/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksUserVisible(value: string): boolean {
  const text = normalizeVisibleText(value);
  return /[A-Za-z]{2}/.test(text);
}

function isInsideHtmlExpression(node: ts.Node): boolean {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isTaggedTemplateExpression(parent) && tagName(parent) === "html") return true;
  }
  return false;
}

function isTechnicalHtmlExpressionLiteral(node: ts.StringLiteralLike): boolean {
  const value = node.text.trim();
  if (value.includes("<") || value.includes(">")) return true;
  if (/^[a-z-]+\s*:\s*[^;]+;?$/i.test(value)) return true;

  for (let parent: ts.Node | undefined = node.parent; parent; parent = parent.parent) {
    if (ts.isPropertyAssignment(parent)) {
      const propertyName = parent.name.getText().replace(/["']/g, "");
      if (propertyName === "class" || propertyName.endsWith("ClassName")) return true;
    }
    if (ts.isTaggedTemplateExpression(parent)) break;
  }
  return false;
}

test("western locale source uses compact ellipses and French non-breaking punctuation", () => {
  const sourceRoot = path.resolve("custom_components/sofabaton_x1s/www/src");
  const offenders: string[] = [];
  const catalogues = [
    ...["de", "es", "fr", "nl"].map((locale) => ({
      locale,
      file: path.join(sourceRoot, "control-panel-translations", `${locale}.ts`),
    })),
    { locale: "fr", file: path.join(sourceRoot, "remote-card-translations", "fr.ts") },
    { locale: "nl", file: path.join(sourceRoot, "remote-card-translations", "nl.ts") },
  ];

  for (const { locale, file } of catalogues) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    const visit = (node: ts.Node) => {
      const isTextNode = ts.isStringLiteralLike(node)
        || ts.isTemplateHead(node)
        || ts.isTemplateMiddle(node)
        || ts.isTemplateTail(node);
      if (isTextNode) {
        const value = (node as ts.StringLiteralLike).text;
        if (value.includes("...")) {
          offenders.push(`${locale}:${lineOf(source, node)} uses three periods`);
        }
        if (locale === "fr" && / (?=[:;?!])/.test(value)) {
          offenders.push(`${locale}:${lineOf(source, node)} uses a breaking punctuation space`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});

test("control-panel UI source does not introduce literal user-facing strings", () => {
  const root = path.resolve("custom_components/sofabaton_x1s/www/src");
  const files = sourceFiles(root).filter((file) => {
    const relative = path.relative(root, file).replaceAll("\\", "/");
    return file.endsWith(".ts")
      && relative !== "strings.ts"
      && !relative.startsWith("control-panel-translations/")
      && !relative.startsWith("remote-card")
      && !relative.startsWith("remote-card-translations/")
      && !relative.startsWith("editor-sections/")
      && !relative.startsWith("sections/")
      && relative !== "state/remote-card-store.ts"
      && !relative.endsWith("-styles.ts");
  });

  const offenders: string[] = [];
  const uiProperties = new Set(["label", "title", "subtitle", "helper", "message", "placeholder"]);

  for (const file of files) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const relative = path.relative(root, file).replaceAll("\\", "/");

    const report = (node: ts.Node, kind: string, value: string) => {
      offenders.push(`${relative}:${lineOf(source, node)} ${kind}: ${normalizeVisibleText(value)}`);
    };

    const visit = (node: ts.Node) => {
      if (ts.isTaggedTemplateExpression(node) && tagName(node) === "html") {
        const raw = templateText(node);
        for (const match of raw.matchAll(/(?:aria-label|title|placeholder)\s*=\s*["']([^"']+)["']/gi)) {
          if (looksUserVisible(match[1])) report(node, "attribute", match[1]);
        }
        for (const match of raw.matchAll(/>([^<>]+)</g)) {
          if (looksUserVisible(match[1])) report(node, "text", match[1]);
        }
      }

      if (ts.isNewExpression(node)
        && node.expression.getText(source) === "Error"
        && node.arguments?.length
        && ts.isStringLiteralLike(node.arguments[0])
        && looksUserVisible(node.arguments[0].text)) {
        report(node.arguments[0], "error", node.arguments[0].text);
      }

      if (ts.isPropertyAssignment(node)
        && ts.isIdentifier(node.name)
        && uiProperties.has(node.name.text)
        && ts.isStringLiteralLike(node.initializer)
        && looksUserVisible(node.initializer.text)) {
        report(node.initializer, `property ${node.name.text}`, node.initializer.text);
      }

      if (ts.isStringLiteralLike(node)
        && isInsideHtmlExpression(node)
        && !isTechnicalHtmlExpressionLiteral(node)
        && normalizeVisibleText(node.text).includes(" ")
        && looksUserVisible(node.text)) {
        report(node, "template expression", node.text);
      }

      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(offenders, [], offenders.join("\n"));
});
