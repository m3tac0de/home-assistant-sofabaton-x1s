import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";
import {
  ENTITY_SYNC_STEP_KINDS,
  WIFI_DEPLOY_PHASES,
  WIFI_INPLACE_STEP_KINDS,
  backendErrorCode,
  localizeBackendError,
  localizeBackendOperationDetail,
  localizeBackendProgress,
} from "../../custom_components/sofabaton_x1s/www/src/shared/utils/backend-state-localization";
import { resolveRuntimeState } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors";
import { setToolsCardLanguage } from "../../custom_components/sofabaton_x1s/www/src/strings";

test("structured backend errors are localized without relaying English exception text", () => {
  setToolsCardLanguage("de");
  assert.equal(
    localizeBackendError(
      { state: "error", error_code: "ir_learn_failed", message: "transport gone" },
      "ir_learn",
    ),
    "Anlernen fehlgeschlagen.",
  );

  setToolsCardLanguage("fr");
  assert.equal(
    localizeBackendError({ state: "refused", message: "proxy client connected" }, "ir_learn"),
    "Le hub n’est pas passé en mode apprentissage. L’application Sofabaton est-elle connectée, ou une synchronisation est-elle en cours\u00a0?",
  );

  setToolsCardLanguage("es");
  assert.equal(
    localizeBackendError({ state: "error", error_code: "ir_learn_no_payload" }, "ir_learn"),
    "El hub captó una señal, pero no se pudo leer su carga útil.",
  );

  setToolsCardLanguage("nl");
  assert.equal(
    localizeBackendError({ code: "a_future_backend_code", message: "Some new English error" }, "ir_learn"),
    "Inleren mislukt.",
  );

  setToolsCardLanguage("zh-Hans");
  assert.equal(
    localizeBackendError({ message: "Could not resolve Sofabaton hub" }, "ir_emissions"),
    "无法加载最近发射的红外命令。",
  );

  assert.equal(backendErrorCode({ error: { code: "UNAVAILABLE" } }), "unavailable");
  assert.equal(backendErrorCode({ message: "transport gone" }), null);
  setToolsCardLanguage("en");
});

test("device creation errors are localized from stable codes", () => {
  const cases = [
    ["de", "invalid_name", "Gib einen Gerätenamen mit 1 bis 30 Zeichen ein."],
    ["es", "unsupported_class", "Este tipo de dispositivo no se puede crear en este hub."],
    ["fr", "create_failed", "Impossible de créer l’appareil sur le hub."],
    ["nl", "device_id_missing", "De hub heeft geen ID voor het nieuwe apparaat teruggegeven."],
    ["de", "not_found", "Der ausgewählte Hub ist nicht mehr verfügbar."],
    ["zh-Hans", "a_future_code", "无法在 Hub 上创建设备。"],
  ] as const;

  for (const [locale, code, expected] of cases) {
    setToolsCardLanguage(locale);
    assert.equal(
      localizeBackendError({ code, message: "The hub returned an English error" }, "device_create"),
      expected,
      locale,
    );
  }
  setToolsCardLanguage("en");
});

test("structured backend progress is localized without relaying its English message", () => {
  const cases = [
    {
      locale: "nl",
      progress: {
        kind: "backup_export",
        phase: "device",
        current_device_id: 12,
        message: "Backing up device 12…",
      },
      expected: "Back-up maken van apparaat 12…",
    },
    {
      locale: "de",
      progress: {
        kind: "activity_sync",
        phase: "writing",
        step_kind: "activity_rename",
        message: "Renaming the activity…",
      },
      expected: "Aktivität wird umbenannt…",
    },
    {
      locale: "fr",
      progress: {
        kind: "cache_refresh",
        phase: "activity",
        current_activity_id: 7,
        message: "Refreshing activity 7…",
      },
      expected: "Actualisation de l’activité 7…",
    },
    {
      locale: "es",
      progress: {
        kind: "backup_restore",
        phase: "cache_warm",
        message: "Restore complete -- warming the hub cache...",
      },
      expected: "Actualizando la caché del hub restaurado…",
    },
  ] as const;

  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    assert.equal(localizeBackendProgress(item.progress), item.expected, item.locale);
  }

  setToolsCardLanguage("en");
});

test("runtime operation labels and step details use the active frontend locale", () => {
  setToolsCardLanguage("de");
  assert.equal(
    localizeBackendOperationDetail("wifi_deploy", 3, 8),
    "Schritt 3 von 8",
  );
  assert.equal(
    localizeBackendOperationDetail("wifi_deploy", null, null),
    "Wifi Commands werden synchronisiert…",
  );

  setToolsCardLanguage("en");
});

test("Wifi Commands deploy stages are localized from their phase, not counted", () => {
  const stage = (phase: string, extra: Record<string, unknown> = {}) =>
    localizeBackendProgress(
      { kind: "command_sync", phase, current_step: 3, total_steps: 8, ...extra } as any,
      "wifi_deploy",
    );

  // Every phase the pipeline reports has copy of its own; a step counter for
  // "Creating Wifi Device on Hub" told the user nothing.
  assert.deepEqual(
    [
      stage("starting"),
      stage("enabling_device"),
      stage("validating_activities"),
      stage("creating_device"),
      stage("adding_to_activities"),
      stage("applying_favorites"),
      stage("applying_bindings"),
      stage("refreshing_maps"),
      stage("resyncing_remote"),
      stage("complete"),
    ],
    [
      "Starting the sync…",
      "Enabling the Wifi Device…",
      "Checking activities against the hub…",
      "Creating the Wifi Device on the hub…",
      "Adding the Wifi Device to activities…",
      "Applying activity shortcuts…",
      "Applying activity button assignments…",
      "Refreshing activity buttons and shortcuts…",
      "Resyncing the physical remote…",
      "Wifi Commands synced.",
    ],
  );

  // In the user's language, not the hub's.
  for (const [locale, expected] of [
    ["nl", "Wifi-apparaat op de hub aanmaken…"],
    ["de", "WLAN-Gerät wird auf dem Hub erstellt…"],
    ["fr", "Création de l’appareil Wifi sur le hub…"],
    ["es", "Creando el dispositivo Wifi en el hub…"],
    ["zh-Hans", "正在 Hub 上创建 Wifi 设备…"],
  ] as const) {
    setToolsCardLanguage(locale);
    assert.equal(stage("creating_device"), expected, locale);
  }
  setToolsCardLanguage("en");

  // The baseline read is the exception: it is the one long stage (one step
  // per activity read off the hub), so its label carries a compact counter
  // and visibly advances. Without step data it stays a plain label.
  assert.equal(stage("reading_device"), "Reading the deployed Wifi Device… (3/8)");
  assert.equal(
    localizeBackendProgress({ kind: "command_sync", phase: "reading_device" } as any, "wifi_deploy"),
    "Reading the deployed Wifi Device…",
  );

  // The in-place planner names steps after the user's own commands, so those
  // carry no phase — the pipeline clears it (null) once the plan starts, so
  // the stale read stage cannot mask the live labels. Relaying the hub's
  // label beats a bare step counter.
  assert.equal(
    localizeBackendProgress(
      { kind: "command_sync", message: "Adding command “Kitchen lights”…", current_step: 2, total_steps: 5 } as any,
      "wifi_deploy",
    ),
    "Adding command “Kitchen lights”…",
  );
  assert.equal(
    localizeBackendProgress(
      { kind: "command_sync", phase: null, message: "Adding command “Kitchen lights”…", current_step: 2, total_steps: 5 } as any,
      "wifi_deploy",
    ),
    "Adding command “Kitchen lights”…",
  );

  // No phase and no message: the counter is still the last resort, then a
  // generic. Nothing regresses for an older backend.
  assert.equal(
    localizeBackendProgress({ kind: "command_sync", current_step: 2, total_steps: 5 } as any, "wifi_deploy"),
    "Step 2 of 5",
  );
  assert.equal(
    localizeBackendProgress({ kind: "command_sync" } as any, "wifi_deploy"),
    "Syncing Wifi Commands…",
  );

  // An unknown future phase must not black-hole the status.
  assert.equal(
    localizeBackendProgress(
      { kind: "command_sync", phase: "some_new_stage", message: "Doing a new thing…" } as any,
      "wifi_deploy",
    ),
    "Doing a new thing…",
  );
});

test("entity-sync write steps are localized from their step kind, with a counter", () => {
  const writing = (extra: Record<string, unknown>) =>
    localizeBackendProgress(
      { kind: "activity_sync", phase: "writing", completed_steps: 2, total_steps: 5, ...extra } as any,
      "entity_sync",
    );

  // Structured step kind → translated copy; the counter is 1-based (the
  // engine emits completed_steps BEFORE the write).
  assert.equal(writing({ step_kind: "activity_rename" }), "Renaming the activity… (3/5)");
  assert.equal(writing({ step_kind: "macro_write_power_on" }), "Updating the start sequence… (3/5)");
  assert.equal(
    writing({ step_kind: "command_rename", step_device_id: 7 }),
    "Renaming a command on device 7… (3/5)",
  );
  assert.equal(writing({ step_kind: "command_rename" }), "Renaming a command… (3/5)");

  // In the user's language, not the hub's.
  setToolsCardLanguage("de");
  assert.equal(writing({ step_kind: "favorite_add" }), "Verknüpfung wird hinzugefügt… (3/5)");
  setToolsCardLanguage("zh-Hans");
  assert.equal(writing({ step_kind: "remote_sync" }), "正在同步遥控器… (3/5)");
  setToolsCardLanguage("en");

  // Unknown step kind (newer engine than card): relay the engine's own
  // label; absent both, fall back to the generic phase copy.
  assert.equal(
    writing({ step_kind: "some_new_step", message: "Doing a new thing…" }),
    "Doing a new thing… (3/5)",
  );
  assert.equal(writing({}), "Applying changes to the hub… (3/5)");
  assert.equal(
    localizeBackendProgress({ kind: "activity_sync", phase: "writing", step_kind: "favorite_add" } as any, "entity_sync"),
    "Adding a shortcut…",
  );

  // The settle window has its own phase; "Synced to hub." is reserved for
  // the actual completion.
  assert.equal(
    localizeBackendProgress({ kind: "activity_sync", phase: "settling" } as any, "entity_sync"),
    "Waiting for the hub to finish processing the changes…",
  );
});

test("every entity-sync step kind the engine emits has frontend copy", () => {
  // Same seam guard as the wifi phases below: the engine names a step, the
  // card translates it. Plan-step kinds come from activity_sync.py;
  // macro_write is refined into three display variants by
  // proxy_activity_sync's _progress_step_kind.
  const source = readFileSync(
    path.resolve("custom_components/sofabaton_x1s/lib/activity_sync.py"),
    "utf8",
  );
  const emitted = new Set<string>();
  for (const match of source.matchAll(/\bkind="([a-z_]+)"/g)) emitted.add(match[1]);
  assert.ok(emitted.size >= 15, `expected the plan builders to name their steps, saw ${emitted.size}`);

  emitted.delete("macro_write");
  emitted.add("macro_write_power_on");
  emitted.add("macro_write_power_off");
  emitted.add("macro_write_custom");

  const unmapped = [...emitted].filter((kind) => !(kind in ENTITY_SYNC_STEP_KINDS)).sort();
  assert.deepEqual(unmapped, [], `engine step kinds with no frontend string: ${unmapped.join(", ")}`);
  const dead = Object.keys(ENTITY_SYNC_STEP_KINDS).filter((kind) => !emitted.has(kind)).sort();
  assert.deepEqual(dead, [], `frontend strings for step kinds the engine never sends: ${dead.join(", ")}`);
});

test("Wifi in-place write steps are localized from their step kind", () => {
  const writing = (extra: Record<string, unknown>) =>
    localizeBackendProgress(
      { kind: "command_sync", current_step: 2, total_steps: 5, ...extra } as any,
      "wifi_deploy",
    );

  // Structured step kind + the user's own command label, translated copy
  // around it. In-place progress is already 1-based, so no +1 here.
  assert.equal(
    writing({ step_kind: "command_add", step_name: "Kitchen lights" }),
    "Adding command “Kitchen lights”… (2/5)",
  );
  assert.equal(writing({ step_kind: "command_delete" }), "Removing a command… (2/5)");
  assert.equal(writing({ step_kind: "wifi_head_commit" }), "Saving the device… (2/5)");
  // The two member_replay flavors are distinguished by the refined kind.
  assert.equal(writing({ step_kind: "member_replay" }), "Updating input selection… (2/5)");
  assert.equal(writing({ step_kind: "member_replay_join" }), "Adding the device to an activity… (2/5)");
  // Shared kinds reuse the entity-sync strings.
  assert.equal(writing({ step_kind: "favorite_add" }), "Adding a shortcut… (2/5)");

  setToolsCardLanguage("de");
  assert.equal(
    writing({ step_kind: "command_rename", step_name: "Licht an" }),
    'Befehl wird in "Licht an" umbenannt… (2/5)',
  );
  setToolsCardLanguage("en");

  // Unknown kind: the pipeline's own label still wins over the counter.
  assert.equal(
    writing({ step_kind: "some_new_step", message: "Doing a new thing…" }),
    "Doing a new thing…",
  );
});

test("every Wifi in-place step kind the pipeline emits has frontend copy", () => {
  const source = readFileSync(
    path.resolve("custom_components/sofabaton_x1s/lib/wifi_inplace_plan.py"),
    "utf8",
  );
  const emitted = new Set<string>();
  for (const match of source.matchAll(/\bkind="([a-z_]+)"/g)) emitted.add(match[1]);
  assert.ok(emitted.size >= 10, `expected the in-place planner to name its steps, saw ${emitted.size}`);

  // member_replay is refined at emission time by its progress-only "join"
  // payload flag (proxy_activity_sync._progress_step_kind).
  emitted.add("member_replay_join");

  const unmapped = [...emitted].filter((kind) => !(kind in WIFI_INPLACE_STEP_KINDS)).sort();
  assert.deepEqual(unmapped, [], `in-place step kinds with no frontend string: ${unmapped.join(", ")}`);
  const dead = Object.keys(WIFI_INPLACE_STEP_KINDS).filter((kind) => !emitted.has(kind)).sort();
  assert.deepEqual(dead, [], `frontend strings for step kinds the planner never sends: ${dead.join(", ")}`);
});

test("a running operation outranks a lingering completion notice", () => {
  setToolsCardLanguage("en");
  const snapshot = {
    selectedHubEntryId: "hub-1",
    state: {
      hubs: [{
        entry_id: "hub-1",
        runtime_state: {
          kind: "operation_running",
          operation: "entity_sync",
          phase: "writing",
          step_kind: "favorite_add",
          current_step: 1,
          total_steps: 4,
        },
      }],
    },
    runtimeCompletionNoticeByHub: { "hub-1": { tone: "success", label: "Wifi Device deployed" } },
    externalHubCommandByHub: {},
    refreshBusyByHub: {},
    hass: null,
  } as any;

  // Chained flows (Wifi Events deploy → activity sync) must narrate the
  // second operation, not spend the notice TTL on the first one's banner.
  const running = resolveRuntimeState(snapshot);
  assert.equal(running?.kind, "operation_running");
  assert.equal(running?.detail, "Adding a shortcut… (2/4)");

  // Once nothing is running the notice still shows.
  snapshot.state.hubs[0].runtime_state = { kind: "idle" };
  const notice = resolveRuntimeState(snapshot);
  assert.equal(notice?.kind, "completion");
  assert.equal(notice?.label, "Wifi Device deployed");
});

test("the bottom dock narrates the running phase, not just the step counter", () => {
  const snapshot = (runtimeState: Record<string, unknown>) => ({
    selectedHubEntryId: "hub-1",
    state: { hubs: [{ entry_id: "hub-1", runtime_state: runtimeState }] },
    runtimeCompletionNoticeByHub: {},
    externalHubCommandByHub: {},
    refreshBusyByHub: {},
    hass: null,
  }) as any;

  // Phase + target id present: the dock says what the hub is doing, in the
  // active locale, ignoring the backend's English `detail` entirely.
  const cases = [
    { locale: "en", detail: "Restoring device 8…" },
    { locale: "nl", detail: "Apparaat 8 herstellen…" },
    { locale: "de", detail: "Gerät 8 wird wiederhergestellt…" },
    { locale: "zh-Hans", detail: "正在恢复设备 8…" },
  ];
  for (const item of cases) {
    setToolsCardLanguage(item.locale);
    const running = resolveRuntimeState(snapshot({
      kind: "operation_running",
      operation: "backup_restore",
      label: "Restoring backup",
      detail: "Restoring device 8…",
      phase: "device",
      current_device_id: 8,
      current_step: 4,
      total_steps: 11,
    }));
    assert.equal(running?.detail, item.detail, item.locale);
  }

  // Activities get their own phase, and the step counter still drives the
  // progress bar underneath the text.
  setToolsCardLanguage("es");
  const activity = resolveRuntimeState(snapshot({
    kind: "operation_running",
    operation: "cache_refresh",
    phase: "activity",
    current_activity_id: 101,
    current_step: 2,
    total_steps: 6,
  }));
  assert.equal(activity?.detail, "Actualizando la actividad 101…");
  assert.deepEqual(
    activity?.kind === "operation_running" ? activity.progress : null,
    { current: 2, total: 6, percent: 33, indeterminate: false },
  );

  setToolsCardLanguage("en");
});

test("the Control Panel runtime selector does not relay backend English state copy", () => {
  const snapshot = {
    selectedHubEntryId: "hub-1",
    state: {
      hubs: [{
        entry_id: "hub-1",
        runtime_state: {
          kind: "operation_running",
          operation: "cache_refresh",
          label: "Refreshing hub cache",
          detail: "Refreshing device 4…",
          current_step: 3,
          total_steps: 9,
        },
      }],
    },
    runtimeCompletionNoticeByHub: {},
    externalHubCommandByHub: {},
    refreshBusyByHub: {},
    hass: null,
  } as any;

  setToolsCardLanguage("fr");
  const running = resolveRuntimeState(snapshot);
  assert.equal(running?.kind, "operation_running");
  assert.equal(running?.label, "Actualisation du cache du hub");
  assert.equal(running?.detail, "Étape 3 sur 9");

  snapshot.state.hubs[0].runtime_state = {
    kind: "app_connected",
    operation: null,
    label: "Only Logs is available while the Sofabaton app is connected.",
    detail: null,
    current_step: null,
    total_steps: null,
  };
  setToolsCardLanguage("es");
  const appConnected = resolveRuntimeState(snapshot);
  assert.equal(appConnected?.kind, "app_connected");
  assert.equal(
    appConnected?.label,
    "Solo Registros está disponible mientras la aplicación Sofabaton está conectada.",
  );

  setToolsCardLanguage("en");
});

test("every Wifi deploy phase the hub emits has frontend copy", () => {
  // Guards the seam that caused this regression in the first place: the hub
  // names a stage, the card translates it. A stage added on one side and not
  // the other degrades to English (or a step counter) silently, so pin it.
  const source = readFileSync(path.resolve("custom_components/sofabaton_x1s/hub.py"), "utf8");

  const emitted = new Set<string>();
  let cursor = source.indexOf("_set_command_sync_progress(");
  while (cursor !== -1) {
    const rest = source.slice(cursor);
    // Each call ends at the first line that is only indentation + ")".
    const end = rest.search(/\n\s*\)\s*\n/);
    const call = end === -1 ? rest.slice(0, 800) : rest.slice(0, end);
    // Capture every branch on the phase line, so the conditional form
    // (`phase="updated_in_place" if plan.steps else "already_current"`)
    // contributes both slugs rather than only the first.
    for (const line of call.split("\n")) {
      if (!/^\s*phase=/.test(line)) continue;
      for (const match of line.matchAll(/"([a-z_]+)"/g)) emitted.add(match[1]);
    }
    cursor = source.indexOf("_set_command_sync_progress(", cursor + 1);
  }

  assert.ok(emitted.size >= 15, `expected the deploy pipeline to name its stages, saw ${emitted.size}`);
  const unmapped = [...emitted].filter((phase) => !(phase in WIFI_DEPLOY_PHASES)).sort();
  assert.deepEqual(unmapped, [], `hub phases with no frontend string: ${unmapped.join(", ")}`);

  const dead = Object.keys(WIFI_DEPLOY_PHASES).filter((phase) => !emitted.has(phase)).sort();
  assert.deepEqual(dead, [], `frontend strings for phases the hub never sends: ${dead.join(", ")}`);
});
