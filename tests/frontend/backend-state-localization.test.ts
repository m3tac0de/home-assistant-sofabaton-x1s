import assert from "node:assert/strict";
import test from "node:test";

import "../../custom_components/sofabaton_x1s/www/src/control-panel-translations";
import {
  localizeBackendOperationDetail,
  localizeBackendProgress,
  localizeRuntimeOperation,
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
  setToolsCardLanguage("es");
  assert.deepEqual(
    localizeRuntimeOperation({
      kind: "operation_running",
      operation: "backup_export",
      label: "Creating backup",
      detail: "Backing up device 3…",
      current_step: 2,
      total_steps: 5,
    }),
    {
      label: "Creando backup",
      detail: "Paso 2 de 5",
    },
  );

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
