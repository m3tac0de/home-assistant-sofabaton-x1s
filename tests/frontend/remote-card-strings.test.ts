import test from "node:test";
import assert from "node:assert/strict";
import {
  REMOTE_CARD_STRINGS_EN,
  isLocalizedPoweredOffLabel,
  registerRemoteCardTranslation,
  remoteCardDirection,
  remoteCardLanguage,
  setRemoteCardLanguage,
  str,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-strings";
import { isPoweredOffLabel } from "../../custom_components/sofabaton_x1s/www/src/remote-card-state";
import { drawerTabChevronIcon } from "../../custom_components/sofabaton_x1s/www/src/sections/macro-favorites";
import { TOOLS_CARD_STRINGS } from "../../custom_components/sofabaton_x1s/www/src/strings";
import TOOLS_CARD_STRINGS_DE from "../../custom_components/sofabaton_x1s/www/src/control-panel-translations/de";
import TOOLS_CARD_STRINGS_ES from "../../custom_components/sofabaton_x1s/www/src/control-panel-translations/es";
import TOOLS_CARD_STRINGS_FR from "../../custom_components/sofabaton_x1s/www/src/control-panel-translations/fr";
import TOOLS_CARD_STRINGS_NL from "../../custom_components/sofabaton_x1s/www/src/control-panel-translations/nl";
import TOOLS_CARD_STRINGS_ZH_HANS from "../../custom_components/sofabaton_x1s/www/src/control-panel-translations/zh-hans";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/ar";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/de";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/en-gb";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/es";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/fr";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/nl";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/zh-hans";

test("defaults to the English table", () => {
  setRemoteCardLanguage("en");
  assert.equal(str(), REMOTE_CARD_STRINGS_EN);
  assert.equal(str().card.poweredOff, "Powered Off");
  assert.equal(str().card.activityFallback(7), "Activity 7");
});

test("unknown languages fall back to English", () => {
  setRemoteCardLanguage("zz");
  assert.equal(str().card.poweredOff, "Powered Off");
  assert.equal(str().assist.waiting, "Waiting for keypress");
  setRemoteCardLanguage("en");
});

test("partial translations overlay English key by key", () => {
  registerRemoteCardTranslation("xx", {
    card: {
      poweredOff: "Uitgeschakeld",
      activityFallback: (id: number | string) => `Activiteit ${id}`,
    },
    assist: { waiting: "Wachten op toetsdruk" },
  });
  setRemoteCardLanguage("xx");

  // Overridden keys (plain and function-valued)
  assert.equal(str().card.poweredOff, "Uitgeschakeld");
  assert.equal(str().card.activityFallback(3), "Activiteit 3");
  assert.equal(str().assist.waiting, "Wachten op toetsdruk");

  // Untranslated keys fall back to English, including nested tables
  assert.equal(str().card.noMacros, "No macros available");
  assert.equal(str().assist.notification.title, REMOTE_CARD_STRINGS_EN.assist.notification.title);
  assert.equal(str().keys.ok, "OK");

  setRemoteCardLanguage("en");
  assert.equal(str().card.poweredOff, "Powered Off");
});

test("regional codes fall back to the base language", () => {
  registerRemoteCardTranslation("yy", {
    card: { poweredOff: "Ausgeschaltet" },
  });
  setRemoteCardLanguage("yy-CH");
  assert.equal(str().card.poweredOff, "Ausgeschaltet");
  setRemoteCardLanguage("en");
});

test("physical remote terminology stays aligned with the Control Panel", () => {
  setRemoteCardLanguage("de");
  assert.match(str().card.selectEntityError, /Fernsteuerungsentität/);

  setRemoteCardLanguage("es");
  assert.match(str().card.selectEntityError, /entidad de mando a distancia/);
  assert.match(str().editor.longPressDescription, /mando a distancia físico/);

  setRemoteCardLanguage("nl");
  assert.match(str().card.selectEntityError, /entiteit voor afstandsbediening/);
  assert.match(str().card.remoteUnavailable, /afstandsbediening/);
  assert.doesNotMatch(str().card.remoteUnavailable, /\bremote\b/i);

  setRemoteCardLanguage("zh-Hans");
  assert.match(str().card.selectEntityError, /遥控实体/);
  assert.match(str().editor.longPressDescription, /物理遥控器/);
  setRemoteCardLanguage("en");
});

test("device cache recovery names the localized Control Panel card and Hub tab", () => {
  const cases = [
    ["en", TOOLS_CARD_STRINGS],
    // The Control Panel has no Arabic overlay, so its visible names fall back to English.
    ["ar", TOOLS_CARD_STRINGS],
    ["de", TOOLS_CARD_STRINGS_DE],
    ["es", TOOLS_CARD_STRINGS_ES],
    ["fr", TOOLS_CARD_STRINGS_FR],
    ["nl", TOOLS_CARD_STRINGS_NL],
    ["zh-Hans", TOOLS_CARD_STRINGS_ZH_HANS],
  ] as const;

  for (const [locale, panelStrings] of cases) {
    setRemoteCardLanguage(locale);
    const message = str().card.deviceKeymapMissing;
    assert.equal(message.includes(panelStrings.card.pickerName), true, `${locale}: card name`);
    assert.equal(message.includes(panelStrings.tabs.cache), true, `${locale}: tab name`);
    assert.equal(
      str().editor.shortcutsCommandsUnavailable,
      message,
      `${locale}: card and shortcut recovery instructions`,
    );
  }

  setRemoteCardLanguage("en");
});

test("power copy distinguishes the runtime action from the editor button", () => {
  const cases = [
    ["en", "Toggle power", "Power button"],
    ["ar", "تبديل التشغيل/الإيقاف", "زر التشغيل/الإيقاف"],
    ["de", "Ein-/Ausschalten", "Ein-/Aus-Taste"],
    ["es", "Alternar encendido/apagado", "Botón de encendido/apagado"],
    ["fr", "Basculer marche/arrêt", "Bouton Marche/Arrêt"],
    ["nl", "In-/uitschakelen", "Aan/uit-knop"],
    ["zh-Hans", "切换电源", "电源按钮"],
  ] as const;

  for (const [locale, action, button] of cases) {
    setRemoteCardLanguage(locale);
    assert.equal(str().card.powerButton, action, `${locale}: runtime action`);
    assert.equal(str().editor.power, button, `${locale}: editor button`);
  }

  setRemoteCardLanguage("en");
});

test("missing shortcut commands stay distinct and bidi-safe", () => {
  setRemoteCardLanguage("es");
  assert.equal(str().editor.shortcutCommandMissing(17), "Comando 17 (no encontrado)");
  assert.notEqual(
    str().editor.shortcutCommandMissing(17).includes("no disponible"),
    true,
  );

  setRemoteCardLanguage("ar");
  assert.equal(
    str().editor.shortcutCommandMissing(17),
    "الأمر \u206817\u2069 (مفقود)",
  );

  setRemoteCardLanguage("de");
  assert.equal(str().groups.shortcuts, "Verknüpfungen");
  assert.equal(str().editor.shortcutSlotLeft, "Linke Verknüpfung");

  setRemoteCardLanguage("en");
});

test("layout row uses compact activity/device and mode labels", () => {
  const cases = [
    ["en", "Activity/device", "Mode switch", "Activity/device selector"],
    ["ar", "النشاط/الجهاز", "زر تبديل الوضع", "محدِّد النشاط/الجهاز"],
    ["de", "Aktivität/Gerät", "Modusschalter", "Aktivitäts-/Geräteauswahl"],
    ["es", "Actividad/dispositivo", "Botón de modo", "Selector de actividad/dispositivo"],
    ["fr", "Activité/appareil", "Bouton de mode", "Sélecteur d’activité/appareil"],
    ["nl", "Activiteit/apparaat", "Modusknop", "Activiteits-/apparaatkiezer"],
    ["zh-Hans", "活动/设备", "模式切换", "活动/设备选择器"],
  ] as const;

  for (const [locale, selector, modeSwitch, selectorField] of cases) {
    setRemoteCardLanguage(locale);
    assert.equal(str().groups.activity, selector, `${locale}: selector`);
    assert.equal(str().editor.modeToggle, modeSwitch, `${locale}: mode switch`);
    assert.equal(str().editor.fieldLabels.show_activity, selectorField, `${locale}: selector field`);
  }

  setRemoteCardLanguage("en");
});

test("English device-mode labels use Control Panel sentence case", () => {
  setRemoteCardLanguage("en");
  assert.equal(str().card.defaultLayout, "Default activity layout");
  assert.equal(str().card.allDevicesLayout, "Default device layout");
  assert.equal(str().editor.defaultLayoutOption, "Default activity layout");
  assert.equal(str().editor.allDevicesOption, "Default device layout");
  assert.equal(str().editor.enableDeviceMode, "Enable device mode");
  assert.equal(str().editor.openOnCurrentActivity, "Current activity");
});

test("Playback and physical-key names stay aligned in every Virtual Remote locale", () => {
  const cases = [
    ["en", "Playback", "Fast forward"],
    ["en-GB", "Playback", "Fast forward"],
    ["de", "Wiedergabe", "Vorspulen"],
    ["es", "Reproducción", "Avance rápido"],
    ["fr", "Lecture", "Avance rapide"],
    ["nl", "Afspelen", "Vooruitspoelen"],
    ["zh-Hans", "播放", "快进"],
    ["ar", "التشغيل", "تقديم سريع"],
  ] as const;

  for (const [locale, playback, fastForward] of cases) {
    setRemoteCardLanguage(locale);
    assert.equal(str().editor.fieldLabels.show_media, playback, locale);
    assert.equal(str().editor.mediaControls, playback, locale);
    assert.equal(str().groups.media, playback, locale);
    assert.equal(str().keys.fwd, fastForward, locale);
  }

  setRemoteCardLanguage("en");
});

test("MQTT detection modal copy preserves the Sofabaton device meaning in every locale", () => {
  const cases = [
    ["en", "Sofabaton MQTT device detected.", "Don't show this again for this device during this session."],
    ["en-GB", "Sofabaton MQTT device detected.", "Don't show this again for this device during this session."],
    ["nl-NL", "Sofabaton-MQTT-apparaat gedetecteerd.", "Dit tijdens deze sessie niet opnieuw tonen voor dit apparaat."],
    ["de-DE", "Sofabaton-MQTT-Gerät erkannt.", "Für dieses Gerät während dieser Sitzung nicht erneut anzeigen."],
    ["fr-FR", "Appareil MQTT Sofabaton détecté.", "Ne plus afficher ce message pour cet appareil pendant cette session."],
    ["es-ES", "Se ha detectado un dispositivo MQTT de Sofabaton.", "No volver a mostrar este mensaje para este dispositivo durante esta sesión."],
    ["ar", "تم اكتشاف جهاز \u2068MQTT\u2069 من \u2068Sofabaton\u2069.", "عدم إظهار هذه الرسالة مجددًا لهذا الجهاز خلال هذه الجلسة."],
    ["zh-Hans", "已检测到 Sofabaton MQTT 设备。", "本次会话中不再为此设备显示此提示。"],
  ] as const;

  for (const [locale, title, optOut] of cases) {
    setRemoteCardLanguage(locale);
    assert.equal(str().assist.deviceDetectedTitle, title);
    assert.equal(str().assist.dontShowAgain, optOut);
  }

  setRemoteCardLanguage("en");
});

test("Arabic and regional Arabic locales select right-to-left direction", () => {
  setRemoteCardLanguage("ar-SA");
  assert.equal(remoteCardLanguage(), "ar-sa");
  assert.equal(remoteCardDirection(), "rtl");
  assert.equal(drawerTabChevronIcon(), "mdi:chevron-left");
  assert.deepEqual(
    [str().card.macrosTab, str().card.favoritesTab, str().card.commandsTab],
    ["الماكرو", "المفضلات", "الأوامر"],
  );

  setRemoteCardLanguage("en-GB");
  assert.equal(remoteCardDirection(), "ltr");
  assert.equal(drawerTabChevronIcon(), "mdi:chevron-right");
  assert.deepEqual(
    [str().card.macrosTab, str().card.favoritesTab, str().card.commandsTab],
    ["Macros", "Favourites", "Commands"],
  );
  setRemoteCardLanguage("en");
});

test("layout reset buttons use compact, locally clear labels", () => {
  // One shared "Reset layout" label: the layout selection scopes what resets.
  const cases = [
    ["en", "Reset layout"],
    ["nl", "Indeling resetten"],
    ["de", "Layout zurücksetzen"],
    ["fr", "Réinitialiser"],
    ["es", "Restablecer diseño"],
    ["ar", "إعادة ضبط التخطيط"],
    ["zh-Hans", "重置布局"],
  ] as const;

  for (const [locale, defaultLayout] of cases) {
    setRemoteCardLanguage(locale);
    assert.equal(str().editor.resetDefaultLayout, defaultLayout, locale);
  }

  setRemoteCardLanguage("en");
});

test("Simplified Chinese uses Home Assistant dashboard terminology", () => {
  setRemoteCardLanguage("zh-Hans");
  assert.equal(str().assist.notification.lovelaceCopy, "*将其复制到仪表板 YAML 中：*");
  setRemoteCardLanguage("en");
});

test("bundled German translation supports regional locales and inflection", () => {
  setRemoteCardLanguage("de-DE");

  assert.equal(
    str().card.remoteUnavailable,
    "Die Fernsteuerung ist nicht verfügbar (möglicherweise ist die Sofabaton-App verbunden).",
  );
  assert.equal(str().card.activityFallback(7), "Aktivität 7");
  assert.equal(
    str().assist.createdTriggers(1, "Fernseher"),
    "1 MQTT-Discovery-Auslöser für Fernseher wurde erstellt",
  );
  assert.equal(
    str().assist.createdTriggers(2, "Fernseher"),
    "2 MQTT-Discovery-Auslöser für Fernseher wurden erstellt",
  );
  assert.equal(
    str().assist.plusActivityTriggers(1),
    "; zusätzlich wurde 1 Aktivitätsauslöser erstellt",
  );
  assert.equal(isPoweredOffLabel("ausgeschaltet"), true);

  setRemoteCardLanguage("en");
});

test("bundled Arabic translation supports regional locales and bidi isolation", () => {
  setRemoteCardLanguage("ar-SA");

  assert.equal(
    str().card.remoteUnavailable,
    "جهاز التحكم عن بُعد غير متاح (قد يكون تطبيق \u2068Sofabaton\u2069 متصلًا).",
  );
  assert.equal(str().card.activityFallback(7), "النشاط \u20687\u2069");
  assert.equal(
    str().assist.detectedDevice("Living Room TV"),
    "جهاز \u2068MQTT\u2069 المكتشف: \u2068Living Room TV\u2069.",
  );
  assert.equal(
    str().assist.createdTriggers(2, "Living Room TV"),
    "تم إنشاء مشغّلات \u2068MQTT Discovery\u2069 لـ \u2068Living Room TV\u2069، وعددها \u20682\u2069",
  );
  assert.equal(isPoweredOffLabel("مُطفأ"), true);

  setRemoteCardLanguage("en");
});

test("bundled French translation supports regional locales and inflection", () => {
  setRemoteCardLanguage("fr-CA");

  assert.equal(
    str().card.remoteUnavailable,
    "La télécommande n’est pas disponible (peut-être parce que l’application Sofabaton est connectée).",
  );
  assert.equal(str().card.activityFallback(7), "Activité 7");
  assert.equal(
    str().assist.createdTriggers(1, "Téléviseur"),
    "1 déclencheur MQTT Discovery créé pour Téléviseur",
  );
  assert.equal(
    str().assist.createdTriggers(0, "Téléviseur"),
    "0 déclencheur MQTT Discovery créé pour Téléviseur",
  );
  assert.equal(
    str().assist.createdTriggers(2, "Téléviseur"),
    "2 déclencheurs MQTT Discovery créés pour Téléviseur",
  );
  assert.equal(isPoweredOffLabel("éteinte"), true);

  setRemoteCardLanguage("en");
});

test("bundled Spanish translation supports regional locales and inflection", () => {
  setRemoteCardLanguage("es-MX");

  assert.equal(
    str().card.remoteUnavailable,
    "El mando a distancia no está disponible (posiblemente porque la aplicación Sofabaton está conectada).",
  );
  assert.equal(str().card.activityFallback(7), "Actividad 7");
  assert.equal(
    str().assist.createdTriggers(1, "Televisor"),
    "1 desencadenante de MQTT Discovery creado para Televisor",
  );
  assert.equal(
    str().assist.createdTriggers(2, "Televisor"),
    "2 desencadenantes de MQTT Discovery creados para Televisor",
  );
  assert.equal(isPoweredOffLabel("apagado"), true);

  setRemoteCardLanguage("en");
});

test("bundled Simplified Chinese translation supports the zh-Hans locale", () => {
  setRemoteCardLanguage("zh-Hans");

  assert.equal(
    str().card.remoteUnavailable,
    "遥控不可用（可能是因为 Sofabaton 应用已连接）。",
  );
  assert.equal(str().card.activityFallback(7), "活动 7");
  assert.equal(
    str().assist.createdTriggers(2, "客厅电视"),
    "已为“客厅电视”创建 2 个 MQTT Discovery 触发器",
  );
  assert.equal(
    str().assist.createdActivityTriggers(2),
    "已为 X2 → 活动创建 2 个活动触发器",
  );
  assert.equal(str().editor.resetDefaultLayout, "重置布局");
  assert.equal(isPoweredOffLabel("已关机"), true);

  setRemoteCardLanguage("en");
});

test("registering a translation for the active language refreshes the table", () => {
  setRemoteCardLanguage("ww");
  assert.equal(str().card.poweredOff, "Powered Off");
  registerRemoteCardTranslation("ww", { card: { poweredOff: "Éteint" } });
  assert.equal(str().card.poweredOff, "Éteint");
  setRemoteCardLanguage("en");
});

test("powered-off detection matches localized and protocol labels", () => {
  registerRemoteCardTranslation("xx", {
    card: { poweredOff: "Uitgeschakeld" },
  });
  setRemoteCardLanguage("xx");

  // Localized select label is recognized...
  assert.equal(isLocalizedPoweredOffLabel("Uitgeschakeld"), true);
  assert.equal(isPoweredOffLabel("uitgeschakeld"), true);
  // ...and the English/protocol values keep working in any language.
  assert.equal(isLocalizedPoweredOffLabel("Powered Off"), true);
  assert.equal(isPoweredOffLabel("powered_off"), true);
  assert.equal(isPoweredOffLabel("off"), true);
  assert.equal(isPoweredOffLabel("Watch TV"), false);

  setRemoteCardLanguage("en");
  assert.equal(isPoweredOffLabel("Uitgeschakeld"), false);
});
