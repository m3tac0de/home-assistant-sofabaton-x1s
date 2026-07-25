import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";
import {
  WIFI_DEPLOY_PHASES,
  localizeBackendOperationDetail,
  localizeBackendProgress,
} from "../../custom_components/sofabaton_x1s/www/src/shared/utils/backend-state-localization";
import { resolveRuntimeState } from "../../custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors";
import { setToolsCardLanguage } from "../../custom_components/sofabaton_x1s/www/src/strings";

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
        message: "Renaming the activity…",
      },
      expected: "Änderungen werden auf den Hub übertragen…",
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
      "Checking Activities against the hub…",
      "Creating the Wifi Device on the hub…",
      "Adding the Wifi Device to Activities…",
      "Applying Activity shortcuts…",
      "Applying Activity button assignments…",
      "Refreshing Activity buttons and shortcuts…",
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

  // The in-place planner names steps after the user's own commands, so those
  // carry no phase. Relaying the hub's label beats a bare step counter.
  assert.equal(
    localizeBackendProgress(
      { kind: "command_sync", message: "Adding command “Kitchen lights”…", current_step: 2, total_steps: 5 } as any,
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
