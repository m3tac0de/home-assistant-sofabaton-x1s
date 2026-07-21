import test from "node:test";
import assert from "node:assert/strict";
import {
  REMOTE_CARD_STRINGS_EN,
  isLocalizedPoweredOffLabel,
  registerRemoteCardTranslation,
  setRemoteCardLanguage,
  str,
} from "../../custom_components/sofabaton_x1s/www/src/remote-card-strings";
import { isPoweredOffLabel } from "../../custom_components/sofabaton_x1s/www/src/remote-card-state";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/ar";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/de";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/es";
import "../../custom_components/sofabaton_x1s/www/src/remote-card-translations/fr";
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
    "جهاز التحكم عن بُعد غير متاح (ربما لأن تطبيق Sofabaton متصل).",
  );
  assert.equal(str().card.activityFallback(7), "النشاط \u20687\u2069");
  assert.equal(
    str().assist.detectedDevice("Living Room TV"),
    "تم اكتشاف جهاز MQTT: \u2068Living Room TV\u2069.",
  );
  assert.equal(isPoweredOffLabel("متوقف عن التشغيل"), true);

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
  assert.equal(str().editor.resetCardDefault, "重置卡片默认布局");
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
