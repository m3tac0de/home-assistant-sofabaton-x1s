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

export const REMOTE_CARD_STRINGS_AR = {
  card: {
    selectEntityError: "اختر كيان جهاز تحكم عن بُعد من Sofabaton",
    remoteUnavailable:
      "جهاز التحكم عن بُعد غير متاح (ربما لأن تطبيق Sofabaton متصل).",
    noActivitiesWarning:
      "لم يتم العثور على أي أنشطة في سمات جهاز التحكم عن بُعد.",
    noMacros: "لا توجد وحدات ماكرو متاحة",
    noFavorites: "لا توجد مفضلات متاحة",
    macrosTab: "وحدات الماكرو >",
    favoritesTab: "المفضلات >",
    activitySelectLabel: "النشاط",
    poweredOff: "متوقف عن التشغيل",
    defaultLayout: "التخطيط الافتراضي",
    activityFallback: (id: number | string) => `النشاط ${isolate(id)}`,
  },
  assist: {
    label: "التقاط ضغطات الأزرار",
    start: "بدء",
    waiting: "في انتظار ضغطة زر",
    exitEditMode: "اخرج من وضع التحرير للبدء",
    captured: (label: string) => `تم الالتقاط: ${isolate(label)}`,
    notCaptured: "لم يتم الالتقاط.",
    working: "جارٍ التنفيذ…",
    triggersReady: "المشغّلات جاهزة للاستخدام",
    createTriggers: "إنشاء مشغّلات MQTT Discovery",
    startCapturing: "بدء التقاط الأوامر",
    deviceDetectedTitle: "تم اكتشاف جهاز في Home Assistant.",
    close: "إغلاق",
    alsoActivityTriggers: "إنشاء مشغّلات أيضًا عند تغيّر النشاط.",
    seeDocs: "راجع وثائق هذه الميزة.",
    dontShowAgain:
      "عدم إظهار هذا مرة أخرى لهذا الجهاز (في هذه الجلسة).",
    detectedDevice: (name: string) =>
      `تم اكتشاف جهاز MQTT: ${isolate(name)}.`,
    lastCommand: (name: string) => `آخر أمر: ${isolate(name)}.`,
    existingTriggers:
      "عُثر على مشغّلات أتمتة MQTT موجودة مسبقًا.",
    noMqttCommands: "لم تُكتشف أي أوامر MQTT حتى الآن",
    deviceFallback: (id: number | string) => `الجهاز ${isolate(id)}`,
    unknownDevice: "جهاز غير معروف",
    commandFallback: (id: number | string) => `الأمر ${isolate(id)}`,
    createdTriggers: (count: number, deviceLabel: string) =>
      `تم إنشاء ${isolate(count)} من مشغّلات MQTT Discovery لـ ${isolate(deviceLabel)}`,
    createdActivityTriggers: (count: number) =>
      `تم إنشاء ${isolate(count)} من مشغّلات النشاط لـ X2 → Activities`,
    plusActivityTriggers: (count: number) =>
      `، بالإضافة إلى ${isolate(count)} من مشغّلات النشاط`,
    allTriggersExist: (deviceLabel: string) =>
      `جميع مشغّلات MQTT Discovery الخاصة بـ ${isolate(deviceLabel)} موجودة بالفعل`,
    buttonFallback: "زر",
    activityFallbackLabel: "نشاط",
    unknown: "غير معروف",
    automationAssistName: "Automation Assist",
    notification: {
      title: "🛠️ Automation Assist",
      eventButton: (label: string) => `الزر: ${isolate(label)}`,
      eventActivity: (label: string) =>
        `تغيير النشاط: ${isolate(label)}`,
      eventOther: (label: string) => `الحدث: ${isolate(label)}`,
      header: (activityName: string, eventLabel: string) =>
        `**النشاط: ${isolate(activityName)} | ${isolate(eventLabel)}**`,
      lovelaceHeading: "📋 **رمز زر Lovelace**",
      lovelaceCopy: "*انسخ هذا إلى YAML الخاص بلوحة المعلومات:*",
      serviceHeading: "⚙️ **استدعاء الخدمة (الأتمتة)**",
      serviceCopy: "*استخدم هذا في البرامج النصية أو عمليات الأتمتة:*",
    },
  },
  editor: {
    fieldLabels: {
      entity: "اختر كيان جهاز تحكم عن بُعد من Sofabaton",
      theme: "تطبيق سمة على البطاقة",
      use_background_override: "تخصيص لون الخلفية",
      background_override: "اختيار لون الخلفية",
      show_activity: "محدّد النشاط",
      show_dpad: "لوحة الاتجاهات",
      show_nav: "أزرار الرجوع/الرئيسية/القائمة",
      show_mid: "أزرار مستوى الصوت والقناة",
      show_media: "عناصر التحكم في تشغيل الوسائط",
      show_colors: "أحمر/أخضر/أصفر/أزرق",
      show_abc: "أزرار A/B/C",
      show_macros_button: "زر وحدات الماكرو",
      show_favorites_button: "زر المفضلات",
      max_width: "الحد الأقصى لعرض البطاقة (بالبكسل)",
      group_order: "ترتيب المجموعات",
    },
    automationAssistTitle: "مساعد الأتمتة",
    keyCapture: "التقاط ضغطات الأزرار",
    keyCaptureDescription:
      "أرسل ضغطات الأزرار إلى المحور لإنشاء YAML جاهز للاستخدام لأزرار لوحة المعلومات وعمليات الأتمتة.",
    keyCaptureLearnMore: "تعرّف على المزيد حول التقاط ضغطات الأزرار",
    keyCaptureDocsAria: "وثائق التقاط ضغطات الأزرار",
    stylingOptions: "خيارات المظهر",
    layoutOptions: "خيارات التخطيط",
    layoutSelectLabel: "التخطيط",
    defaultLayoutOption: "التخطيط الافتراضي",
    macrosFavoritesAsRows: "عرض وحدات الماكرو/المفضلات كصفوف",
    visibleRows: "الصفوف المرئية",
    moveGroupUp: (groupLabel: string) =>
      `نقل ${isolate(groupLabel)} إلى أعلى`,
    moveGroupDown: (groupLabel: string) =>
      `نقل ${isolate(groupLabel)} إلى أسفل`,
    macros: "وحدات الماكرو",
    favorites: "المفضلات",
    volume: "مستوى الصوت",
    channel: "القناة",
    mediaControls: "عناصر التحكم في الوسائط",
    dvr: "DVR",
    resetCardDefault: "إعادة التعيين إلى الإعداد الافتراضي للبطاقة",
    resetDefaultLayout: "إعادة التعيين إلى التخطيط الافتراضي",
    noteDefaultLayout: "يُستخدم للأنشطة التي ليس لها تخطيط خاص",
    noteCustomLayout: "يُستخدم تخطيط مخصّص",
    noteUsingDefault: "يُستخدم التخطيط الافتراضي",
  },
  groups: {
    activity: "محدّد النشاط",
    macro_favorites: "وحدات الماكرو/المفضلات",
    macros_row: "صف وحدات الماكرو",
    favorites_row: "صف المفضلات",
    dpad: "لوحة الاتجاهات",
    nav: "الرجوع/الرئيسية/القائمة",
    mid: "مستوى الصوت/القناة",
    media: "عناصر التحكم في الوسائط",
    colors: "أزرار الألوان",
    abc: "A/B/C",
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
    chup: "القناة +",
    chdn: "القناة -",
    guide: "دليل البرامج",
    dvr: "DVR",
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
