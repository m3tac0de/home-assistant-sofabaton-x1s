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

  setRemoteCardLanguage("en-GB");
  assert.equal(remoteCardDirection(), "ltr");
  setRemoteCardLanguage("en");
});

test("layout reset buttons use compact, locally clear labels", () => {
  const cases = [
    ["en", "Reset card layout", "Reset layout"],
    ["nl", "Kaartindeling resetten", "Indeling resetten"],
    ["de", "Kartenlayout zurücksetzen", "Layout zurücksetzen"],
    ["fr", "Réinitialiser la carte", "Réinitialiser"],
    ["es", "Restablecer tarjeta", "Restablecer diseño"],
    ["ar", "إعادة ضبط البطاقة", "إعادة ضبط التخطيط"],
    ["zh-Hans", "重置卡片布局", "重置布局"],
  ] as const;

  for (const [locale, cardDefault, defaultLayout] of cases) {
    setRemoteCardLanguage(locale);
    assert.equal(str().editor.resetCardDefault, cardDefault, locale);
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
    "Die Fernbedienung ist nicht verfügbar (möglicherweise ist die Sofabaton-App verbunden).",
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
    "; zusätzlich 1 Aktivitätsauslöser wurde erstellt",
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
  assert.equal(isPoweredOffLabel("تم إيقاف التشغيل"), true);

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
    "El control remoto no está disponible (posiblemente porque la aplicación Sofabaton está conectada).",
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
    "遥控器不可用（可能是因为 Sofabaton 应用已连接）。",
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
  assert.equal(str().editor.resetCardDefault, "重置卡片布局");
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
