// Arabic (العربية) translation for the Sofabaton Virtual Remote card.
//
// This is a complete Modern Standard Arabic translation. User- and hub-supplied
// values are wrapped in Unicode bidirectional isolates so Latin device names,
// numeric IDs, and punctuation remain readable in right-to-left text.

import {
  registerRemoteCardTranslation,
  type RemoteCardStrings,
} from "../remote-card-strings";

const isolate = (value: number | string) => `\u2068${value}\u2069`;
const SOFABATON = isolate("Sofabaton");
const MQTT = isolate("MQTT");
const MQTT_DISCOVERY = isolate("MQTT Discovery");
const AUTOMATION_ASSIST = isolate("Automation Assist");
const YAML = isolate("YAML");
const LOVELACE = isolate("Lovelace");
const DVR = isolate("DVR");
const ABC = isolate("A/B/C");

export const REMOTE_CARD_STRINGS_AR = {
  card: {
    selectEntityError: `اختر كيانًا لجهاز تحكم ${SOFABATON} عن بُعد`,
    remoteUnavailable:
      `جهاز التحكم عن بُعد غير متاح (قد يكون تطبيق ${SOFABATON} متصلًا).`,
    noActivitiesWarning:
      "لم يتم العثور على أي أنشطة في سمات جهاز التحكم عن بُعد.",
    noMacros: "لا تتوفر أي وحدات ماكرو",
    noFavorites: "لا تتوفر أي مفضلات",
    macrosTab: "وحدات الماكرو ‹",
    favoritesTab: "المفضلات ‹",
    activitySelectLabel: "النشاط",
    poweredOff: "تم إيقاف التشغيل",
    defaultLayout: "التخطيط الافتراضي",
    activityFallback: (id: number | string) => `النشاط ${isolate(id)}`,
  },
  assist: {
    label: "التقاط الأزرار",
    start: "بدء",
    waiting: "بانتظار ضغطة زر",
    exitEditMode: "غادر وضع التحرير للبدء",
    captured: (label: string) => `تم التقاط الأمر: ${isolate(label)}`,
    notCaptured: "لم يتم التقاط أي أمر.",
    working: "جارٍ العمل…",
    triggersReady: "المشغّلات جاهزة للاستخدام",
    createTriggers: `إنشاء مشغّلات ${MQTT_DISCOVERY}`,
    startCapturing: "بدء التقاط الأوامر",
    deviceDetectedTitle: `تم اكتشاف جهاز ${MQTT} من ${SOFABATON}.`,
    close: "إغلاق",
    alsoActivityTriggers: "إنشاء مشغّلات أيضًا عند تغيير النشاط.",
    seeDocs: "عرض وثائق هذه الميزة.",
    dontShowAgain:
      "عدم إظهار هذه الرسالة مجددًا لهذا الجهاز خلال هذه الجلسة.",
    detectedDevice: (name: string) =>
      `جهاز ${MQTT} المكتشف: ${isolate(name)}.`,
    lastCommand: (name: string) => `آخر أمر: ${isolate(name)}.`,
    existingTriggers:
      `تم العثور على مشغّلات أتمتة ${MQTT} موجودة مسبقًا.`,
    noMqttCommands: `لم يتم اكتشاف أي أوامر ${MQTT} حتى الآن`,
    deviceFallback: (id: number | string) => `الجهاز ${isolate(id)}`,
    unknownDevice: "جهاز غير معروف",
    commandFallback: (id: number | string) => `الأمر ${isolate(id)}`,
    createdTriggers: (count: number, deviceLabel: string) =>
      `تم إنشاء مشغّلات ${MQTT_DISCOVERY} لـ ${isolate(deviceLabel)}، وعددها ${isolate(count)}`,
    createdActivityTriggers: (count: number) =>
      `تم إنشاء مشغّلات نشاط لـ ${isolate("X2 → Activities")}، وعددها ${isolate(count)}`,
    plusActivityTriggers: (count: number) =>
      `، بالإضافة إلى مشغّلات النشاط، وعددها ${isolate(count)}`,
    allTriggersExist: (deviceLabel: string) =>
      `جميع مشغّلات ${MQTT_DISCOVERY} الخاصة بـ ${isolate(deviceLabel)} موجودة بالفعل`,
    buttonFallback: "زر",
    activityFallbackLabel: "النشاط",
    unknown: "غير معروف",
    automationAssistName: AUTOMATION_ASSIST,
    notification: {
      title: `🛠️ ${AUTOMATION_ASSIST}`,
      eventButton: (label: string) => `الزر: ${isolate(label)}`,
      eventActivity: (label: string) =>
        `تغيير النشاط: ${isolate(label)}`,
      eventOther: (label: string) => `الحدث: ${isolate(label)}`,
      header: (activityName: string, eventLabel: string) =>
        `**النشاط: ${isolate(activityName)} • ${isolate(eventLabel)}**`,
      lovelaceHeading: `📋 **رمز زر ${LOVELACE}**`,
      lovelaceCopy: `*انسخ هذا إلى ${YAML} الخاص بلوحة المعلومات:*`,
      serviceHeading: "⚙️ **استدعاء خدمة (أتمتة)**",
      serviceCopy: "*استخدم هذا في البرامج النصية أو عمليات الأتمتة:*",
    },
  },
  editor: {
    fieldLabels: {
      entity: `اختر كيانًا لجهاز تحكم ${SOFABATON} عن بُعد`,
      theme: "تطبيق سمة على البطاقة",
      use_background_override: "تخصيص لون الخلفية",
      background_override: "اختيار لون الخلفية",
      show_activity: "اختيار النشاط",
      show_dpad: "لوحة الاتجاهات",
      show_nav: "أزرار الرجوع/الرئيسية/القائمة",
      show_mid: "مفاتيح مستوى الصوت والقنوات",
      show_media: "أزرار تشغيل الوسائط",
      show_colors: "أحمر، أخضر، أصفر، أزرق",
      show_abc: `أزرار ${ABC}`,
      show_macros_button: "زر وحدات الماكرو",
      show_favorites_button: "زر المفضلات",
      max_width: "الحد الأقصى لعرض البطاقة (بكسل)",
      group_order: "ترتيب المجموعات",
    },
    automationAssistTitle: "مساعد الأتمتة",
    keyCapture: "التقاط الأزرار",
    keyCaptureDescription:
      `أرسل ضغطات الأزرار إلى وحدة التحكم لإنشاء ${YAML} جاهز للاستخدام في أزرار لوحة المعلومات وعمليات الأتمتة.`,
    keyCaptureLearnMore: "تعرّف على المزيد حول التقاط الأزرار",
    keyCaptureDocsAria: "وثائق التقاط الأزرار",
    stylingOptions: "خيارات المظهر",
    layoutOptions: "خيارات التخطيط",
    layoutSelectLabel: "التخطيط",
    defaultLayoutOption: "التخطيط الافتراضي",
    macrosFavoritesAsRows: "عرض وحدات الماكرو والمفضلات في صفوف",
    visibleRows: "الصفوف المرئية",
    moveGroupUp: (groupLabel: string) =>
      `نقل ${isolate(groupLabel)} إلى الأعلى`,
    moveGroupDown: (groupLabel: string) =>
      `نقل ${isolate(groupLabel)} إلى الأسفل`,
    macros: "وحدات الماكرو",
    favorites: "المفضلات",
    volume: "مستوى الصوت",
    channel: "القناة",
    mediaControls: "أزرار تشغيل الوسائط",
    dvr: DVR,
    resetCardDefault: "إعادة ضبط البطاقة",
    resetDefaultLayout: "إعادة ضبط التخطيط",
    noteDefaultLayout: "يُستخدم للأنشطة التي ليس لها تخطيط خاص",
    noteCustomLayout: "تخطيط مخصّص قيد الاستخدام",
    noteUsingDefault: "التخطيط الافتراضي قيد الاستخدام",
  },
  groups: {
    activity: "اختيار النشاط",
    macro_favorites: "وحدات الماكرو والمفضلات",
    macros_row: "صف وحدات الماكرو",
    favorites_row: "صف المفضلات",
    dpad: "لوحة الاتجاهات",
    nav: "الرجوع/الرئيسية/القائمة",
    mid: "مستوى الصوت/القناة",
    media: "أزرار تشغيل الوسائط",
    colors: "أزرار الألوان",
    abc: ABC,
  },
  keys: {
    up: "أعلى",
    down: "أسفل",
    left: "يسار",
    right: "يمين",
    ok: "موافق",
    back: "رجوع",
    home: "الرئيسية",
    menu: "القائمة",
    volup: "رفع مستوى الصوت",
    voldn: "خفض مستوى الصوت",
    mute: "كتم الصوت",
    chup: `القناة ${isolate("+")}`,
    chdn: `القناة ${isolate("-")}`,
    guide: "دليل البرامج",
    dvr: DVR,
    play: "تشغيل",
    exit: "خروج",
    rew: "ترجيع",
    pause: "إيقاف مؤقت",
    fwd: "تقديم سريع",
    red: "أحمر",
    green: "أخضر",
    yellow: "أصفر",
    blue: "أزرق",
    a: "A",
    b: "B",
    c: "C",
  },
} satisfies RemoteCardStrings;

registerRemoteCardTranslation("ar", REMOTE_CARD_STRINGS_AR);
