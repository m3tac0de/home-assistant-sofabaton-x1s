// Automation Assist controller: the key-capture + MQTT trigger-discovery
// subsystem extracted from the legacy card class (~980 lines of card methods,
// now DOM-free). The host interface supplies hass/config/hub-queue context;
// onChange() replaces the legacy _updateAutomationAssistUI/_updateAutomation-
// AssistModalUI calls — the Lit card re-renders from the controller's state.
//
// Cleanup vs legacy (noted in the refactor plan): disconnected() actually
// unsubscribes the MQTT listener — the legacy card leaked it on disconnect.

import {
  automationAssistButtonYaml,
  automationAssistNotificationBody,
  automationAssistRemoteYaml,
  type AutomationAssistCapture,
} from "../remote-card-assist-yaml";
import { isPoweredOffLabel } from "../remote-card-state";
import { sleep } from "../remote-card-hub";
import { str } from "../remote-card-strings";
import { AUTOMATION_ASSIST_SESSION_KEY } from "../remote-card-shared";
import type { HassLike } from "../remote-card-types";

export interface AssistActivity {
  id: number | string;
  name: string;
  state?: string;
}

/** Everything the controller needs from the card/store. */
export interface AutomationAssistHost {
  getHass(): HassLike | null;
  /** show_automation_assist from the card config. */
  assistEnabled(): boolean;
  entityId(): string;
  isEditMode(): boolean;
  isX2(): boolean;
  isHubIntegration(): boolean;
  /** hub_mac attribute of the remote entity, if any. */
  hubMacAttribute(): unknown;
  /** True when the hub command queue is idle (X2 MQTT must wait for it). */
  hubQueueIdle(): boolean;
  /** Kick a hub basic-data request (wakes the hub into publishing MQTT). */
  requestHubBasicData(): void;
  activities(): AssistActivity[];
  activityNameForId(activityId: unknown): string | null | undefined;
  currentActivityId(): unknown;
  currentActivityLabel(): string;
  resolveCommandDeviceId(commandId: number, deviceId: unknown): number | null;
  callService(
    domain: string,
    service: string,
    data: Record<string, unknown>,
  ): Promise<void>;
  /** State changed — re-render whatever shows assist state. */
  onChange(): void;
}

interface AssistSessionState {
  hideMqttModal: boolean;
  discoveryDeviceIds: Set<number>;
  activityTriggersCreated: boolean;
}

interface MqttMessageLike {
  topic?: unknown;
  payload?: unknown;
}

type MqttPayload = Record<string, unknown>;

export function normalizeHubMac(value: unknown): string | null {
  if (!value) return null;
  const normalized = String(value)
    .replace(/[^a-fA-F0-9]/g, "")
    .toUpperCase();
  if (!normalized || normalized.length < 6) return null;
  return normalized;
}

export function parseMqttPayload(payload: unknown): MqttPayload | null {
  if (payload == null) return null;
  if (typeof payload === "object") return payload as MqttPayload;
  try {
    return JSON.parse(String(payload)) as MqttPayload;
  } catch (e) {
    return null;
  }
}

export function automationAssistSlug(value: unknown): string {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_") || "command"
  );
}

export class AutomationAssistController {
  private readonly host: AutomationAssistHost;

  active = false;
  capture: AutomationAssistCapture | null = null;
  statusMessage: string | null = null;

  // MQTT discovery state
  mqttMatch = false;
  mqttPayload: MqttPayload | null = null;
  mqttDeviceName: string | null = null;
  mqttCommandName: string | null = null;
  mqttExisting = false;
  discoveryCreated = false;
  discoveryWorking = false;
  discoveryDeviceId: number | null = null;

  // Modal state (the Lit card renders from these)
  modalOpen = false;
  modalDeviceId: number | null = null;
  modalActivityChecked = false;

  hubMac: string | null = null;
  private hubMacDetecting = false;
  private mqttUnsub: (() => unknown) | null = null;
  private mqttTopic: string | null = null;
  private mqttLookupId = 0;
  private mqttDeviceNames = new Map<string, string | null>();
  private mqttDeviceCommands = new Map<string, Map<number, string> | null>();
  private mqttRequestQueue: Promise<unknown> = Promise.resolve();
  private mqttPublishQueue: Promise<unknown> = Promise.resolve();
  private discoveryIds = new Set<string>();

  // Activity-change baseline (drives capture of activity switches)
  private lastActivityLabel: string | null = null;
  private lastActivityId: number | null = null;
  private lastPoweredOff: boolean | null = null;

  constructor(host: AutomationAssistHost) {
    this.host = host;
  }

  // ---------- session (per-tab, shared across card instances) ----------

  private sessionState(): AssistSessionState {
    const win = window as unknown as Record<string, unknown>;
    if (!win[AUTOMATION_ASSIST_SESSION_KEY]) {
      win[AUTOMATION_ASSIST_SESSION_KEY] = {
        hideMqttModal: false,
        discoveryDeviceIds: new Set<number>(),
        activityTriggersCreated: false,
      } satisfies AssistSessionState;
    }
    return win[AUTOMATION_ASSIST_SESSION_KEY] as AssistSessionState;
  }

  activityTriggersCreatedInSession(): boolean {
    return this.sessionState().activityTriggersCreated;
  }

  // ---------- capture lifecycle ----------

  private ensureCaptureStarted(): boolean {
    if (!this.host.assistEnabled()) return false;
    if (this.host.isEditMode()) return false;
    if (!this.active) {
      this.setActive(true);
    }
    return this.active;
  }

  primeActivityBaseline(): void {
    const currentLabel = this.host.currentActivityLabel();
    const currentId = this.host.currentActivityId();
    this.lastActivityLabel = currentLabel;
    this.lastActivityId = Number.isFinite(Number(currentId))
      ? Number(currentId)
      : null;
    this.lastPoweredOff = isPoweredOffLabel(currentLabel);
  }

  resetActivityBaseline(): void {
    this.lastActivityLabel = null;
    this.lastActivityId = null;
    this.lastPoweredOff = null;
  }

  setActive(active: boolean): void {
    const next = !!active;
    if (this.active === next) return;
    this.active = next;
    if (!next) {
      this.capture = null;
      this.mqttMatch = false;
      this.mqttPayload = null;
      this.mqttDeviceName = null;
      this.mqttCommandName = null;
      this.mqttExisting = false;
      this.discoveryCreated = false;
      this.discoveryWorking = false;
      this.discoveryDeviceId = null;
      this.statusMessage = null;
      this.unsubscribeMqtt();
      this.closeMqttModal();
    } else {
      this.statusMessage = null;
      this.primeActivityBaseline();
      this.syncMqtt();
    }
    this.host.onChange();
  }

  private resetCaptureSideState(): void {
    this.mqttMatch = false;
    this.mqttPayload = null;
    this.mqttDeviceName = null;
    this.mqttCommandName = null;
    this.mqttExisting = false;
    this.discoveryCreated = false;
    this.discoveryWorking = false;
    this.discoveryDeviceId = null;
    this.statusMessage = null;
  }

  recordActivityChange(params: {
    activityId: unknown;
    activityName: string;
    poweredOff?: boolean;
  }): void {
    if (!this.ensureCaptureStarted()) return;

    const id = Number(params.activityId);
    const resolvedId = Number.isFinite(id) ? id : null;
    const poweredOff = !!params.poweredOff;
    const label = poweredOff
      ? str().card.poweredOff
      : String(params.activityName || str().assist.activityFallbackLabel);

    this.capture = {
      label,
      activityId: resolvedId,
      activityName: poweredOff
        ? str().card.poweredOff
        : String(params.activityName || label),
      kind: poweredOff ? "power" : "activity",
    };
    this.resetCaptureSideState();

    this.host.onChange();
    this.notifyCapture();
  }

  recordClick(params: {
    label?: unknown;
    commandId: unknown;
    deviceId?: unknown;
    commandType?: string;
    icon?: unknown;
  }): void {
    if (!this.ensureCaptureStarted()) return;

    const command = Number(params.commandId);
    if (!Number.isFinite(command)) return;

    const commandType = params.commandType ?? "assigned";
    const resolvedDevice =
      commandType === "favorite" || commandType === "macro"
        ? params.deviceId != null
          ? Number(params.deviceId)
          : this.host.currentActivityId()
        : this.host.resolveCommandDeviceId(command, params.deviceId ?? null);

    if (resolvedDevice == null || !Number.isFinite(Number(resolvedDevice))) {
      return;
    }

    const activityName =
      this.host.activityNameForId(resolvedDevice) ||
      this.host.currentActivityLabel() ||
      str().assist.unknown;

    this.capture = {
      label: String(params.label ?? str().assist.buttonFallback),
      commandId: command,
      deviceId: Number(resolvedDevice),
      commandType,
      icon: params.icon ? String(params.icon) : null,
      activityName,
      kind: "button",
    };
    this.resetCaptureSideState();

    this.host.onChange();
    this.notifyCapture();
  }

  /**
   * Feed the current activity state from each hass update; detects activity
   * switches against the baseline and records them as captures (the legacy
   * card ran this block inside _update()).
   */
  observeActivityState(params: {
    currentLabel: string;
    activityId: number | null;
    unavailable: boolean;
  }): void {
    const current = params.currentLabel;

    // The legacy card ran the change check only on available entities (the
    // whole block lived in _update's `else` branch).
    if (
      !params.unavailable &&
      this.host.assistEnabled() &&
      this.lastActivityLabel != null &&
      current !== this.lastActivityLabel
    ) {
      if (isPoweredOffLabel(current)) {
        this.recordActivityChange({
          activityId: this.lastActivityId,
          activityName: str().card.poweredOff,
          poweredOff: true,
        });
      } else {
        this.recordActivityChange({
          activityId: params.activityId,
          activityName: current,
          poweredOff: false,
        });
      }
    }

    if (params.unavailable) {
      this.resetActivityBaseline();
    } else {
      this.lastActivityLabel = current;
      this.lastActivityId = params.activityId;
      this.lastPoweredOff = isPoweredOffLabel(current);
    }
  }

  // ---------- notification ----------

  remoteYaml(): string {
    return automationAssistRemoteYaml(
      this.capture,
      this.host.entityId(),
      this.host.isHubIntegration(),
    );
  }

  buttonYaml(): string {
    return automationAssistButtonYaml(
      this.capture,
      this.host.entityId(),
      this.host.isHubIntegration(),
    );
  }

  private notifyCapture(): void {
    if (!this.host.assistEnabled()) return;
    if (!this.host.getHass()) return;
    const capture = this.capture;
    const body = automationAssistNotificationBody(
      capture,
      this.host.entityId(),
      this.host.isHubIntegration(),
      this.host.activityNameForId(capture?.deviceId) ||
        this.host.currentActivityLabel() ||
        "",
    );
    if (!body) return;

    void this.host.callService("persistent_notification", "create", {
      title: str().assist.notification.title,
      message: body,
    });
  }

  // ---------- status / modal view state ----------

  /** The status line under the assist label (legacy _updateAutomationAssistUI). */
  statusText(): string {
    if (!this.active) {
      return this.host.isEditMode()
        ? str().assist.exitEditMode
        : str().assist.waiting;
    }
    if (this.statusMessage) return this.statusMessage;
    if (this.capture) return str().assist.captured(String(this.capture.label ?? ""));
    return str().assist.waiting;
  }

  /** Derived modal content (legacy _updateAutomationAssistModalUI). */
  modalViewState(): {
    open: boolean;
    showActivityRow: boolean;
    text: string;
    showStart: boolean;
    showCreate: boolean;
    createLabel: string;
    createDisabled: boolean;
  } {
    const isActive = this.active;
    const mqttSupported = this.mqttSupported();
    const payload = this.mqttPayload;
    const deviceId = Number(payload?.device_id);
    const commandId = Number(payload?.key_id);
    const deviceName =
      this.mqttDeviceName ||
      (Number.isFinite(deviceId)
        ? str().assist.deviceFallback(deviceId)
        : str().assist.unknownDevice);
    const commandName =
      this.mqttCommandName ||
      (Number.isFinite(commandId)
        ? str().assist.commandFallback(commandId)
        : null);

    const lines = [str().assist.detectedDevice(deviceName)];
    if (commandName) lines.push(str().assist.lastCommand(commandName));
    if (this.mqttExisting) lines.push(str().assist.existingTriggers);

    const createLabel = this.discoveryWorking
      ? str().assist.working
      : this.discoveryCreated
        ? str().assist.triggersReady
        : str().assist.createTriggers;

    return {
      open: this.modalOpen,
      showActivityRow: !this.sessionState().activityTriggersCreated,
      text: lines.join(" "),
      showStart: !isActive,
      showCreate: mqttSupported && isActive,
      createLabel,
      createDisabled:
        this.discoveryWorking || this.discoveryCreated || !this.mqttAvailable(),
    };
  }

  // ---------- MQTT plumbing ----------

  mqttSupported(): boolean {
    return this.host.isX2();
  }

  mqttAvailable(): boolean {
    return (
      this.mqttSupported() &&
      this.active &&
      Boolean(this.hubMac) &&
      !this.discoveryCreated &&
      !this.discoveryWorking &&
      this.mqttReady()
    );
  }

  mqttReady(): boolean {
    if (!this.host.isHubIntegration()) return true;
    return this.host.hubQueueIdle();
  }

  private safeUnsubscribe(unsubscribe: (() => unknown) | null | undefined): void {
    if (typeof unsubscribe !== "function") return;
    try {
      const maybePromise = unsubscribe() as { catch?: (fn: () => void) => void };
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {
          /* no-op */
        });
      }
    } catch (e) {
      /* no-op */
    }
  }

  private ensureHubMac(): void {
    const hass = this.host.getHass();
    if (!hass || !this.host.entityId()) return;
    if (this.hubMac || this.hubMacDetecting) return;

    const attrMac = normalizeHubMac(this.host.hubMacAttribute());
    if (attrMac) {
      this.hubMac = attrMac;
      return;
    }

    if (!this.host.isHubIntegration()) return;
    if (!hass.connection?.subscribeMessage) return;

    this.hubMacDetecting = true;

    const topic = "activity/+/list";
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => unknown) | null = null;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      const unsubscribe = unsub;
      unsub = null;
      this.safeUnsubscribe(unsubscribe);

      this.hubMacDetecting = false;
      this.host.onChange();
      this.syncMqtt();
    };

    hass.connection
      .subscribeMessage(
        (msg: MqttMessageLike) => {
          const topicMatch = String(msg?.topic || "").match(
            /^activity\/([^/]+)\/list$/,
          );
          const normalized = topicMatch?.[1]
            ? normalizeHubMac(topicMatch[1])
            : null;
          if (!normalized) return;
          this.hubMac = normalized;
          finish();
        },
        { type: "mqtt/subscribe", topic },
      )
      .then((unsubscribe) => {
        unsub = unsubscribe;
        this.host.requestHubBasicData();
        timeoutId = setTimeout(() => finish(), 4000);
      })
      .catch(() => {
        finish();
      });
  }

  syncMqtt(): void {
    if (!this.host.assistEnabled()) {
      this.unsubscribeMqtt();
      return;
    }

    if (!this.active) {
      this.unsubscribeMqtt();
      return;
    }

    if (!this.mqttSupported()) {
      this.unsubscribeMqtt();
      return;
    }

    if (!this.mqttReady()) {
      return;
    }

    this.ensureHubMac();
    const mac = this.hubMac;
    if (!mac) return;

    const topic = `${mac}/up`;
    if (this.mqttTopic === topic && this.mqttUnsub) return;

    this.unsubscribeMqtt();

    const hass = this.host.getHass();
    if (!hass?.connection?.subscribeMessage) return;

    this.mqttTopic = topic;
    hass.connection
      .subscribeMessage((msg: MqttMessageLike) => this.handleMqtt(msg), {
        type: "mqtt/subscribe",
        topic,
      })
      .then((unsub) => {
        this.mqttUnsub = unsub;
      })
      .catch(() => {
        this.mqttUnsub = null;
      });
  }

  unsubscribeMqtt(): void {
    if (this.mqttUnsub) {
      const unsubscribe = this.mqttUnsub;
      this.mqttUnsub = null;
      this.safeUnsubscribe(unsubscribe);
    }
    this.mqttTopic = null;
  }

  /** Legacy behavior kept: no automatic trigger-exists detection. */
  private mqttTriggerExists(_payload: MqttPayload, _topic: string | null): boolean {
    return false;
  }

  // ---------- modal ----------

  private shouldSuppressMqttModal(deviceId: number): boolean {
    const session = this.sessionState();
    if (session.hideMqttModal) return true;
    return session.discoveryDeviceIds.has(deviceId);
  }

  openMqttModal(deviceId: number): void {
    if (!Number.isFinite(deviceId)) return;
    if (this.shouldSuppressMqttModal(deviceId)) return;
    this.modalDeviceId = deviceId;
    this.modalOpen = true;
    this.modalActivityChecked = false;
    this.host.onChange();
  }

  closeMqttModal(): void {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.host.onChange();
  }

  /** The "don't show again for this session" checkbox. */
  setModalOptOut(checked: boolean): void {
    if (!checked) return;
    this.sessionState().hideMqttModal = true;
    this.closeMqttModal();
  }

  setModalActivityChecked(checked: boolean): void {
    this.modalActivityChecked = !!checked;
  }

  // ---------- MQTT message handling ----------

  handleMqtt(msg: MqttMessageLike): void {
    const payload = parseMqttPayload(msg?.payload);
    if (!payload) return;

    const deviceId = Number(payload.device_id);
    if (Number.isFinite(deviceId) && this.discoveryDeviceId !== deviceId) {
      this.discoveryDeviceId = deviceId;
      this.discoveryCreated = false;
      this.discoveryWorking = false;
    }

    this.mqttMatch = true;
    this.mqttPayload = payload;
    this.mqttDeviceName = null;
    this.mqttCommandName = null;
    this.mqttExisting = this.mqttTriggerExists(payload, this.mqttTopic);
    this.host.onChange();
    this.primeMqttMetadata(payload);
    this.openMqttModal(deviceId);
  }

  private primeMqttMetadata(payload: MqttPayload): void {
    const mac = this.hubMac;
    if (!mac || !payload) return;

    const deviceId = Number(payload.device_id);
    const keyId = Number(payload.key_id);
    if (!Number.isFinite(deviceId) || !Number.isFinite(keyId)) return;

    const lookupId = this.mqttLookupId + 1;
    this.mqttLookupId = lookupId;

    void Promise.all([
      this.requestMqttDeviceName(mac, deviceId),
      this.requestMqttDeviceCommandName(mac, deviceId, keyId),
    ]).then(([deviceName, commandName]) => {
      if (this.mqttLookupId !== lookupId) return;
      if (deviceName) this.mqttDeviceName = deviceName;
      if (commandName) this.mqttCommandName = commandName;
      this.host.onChange();
    });
  }

  async requestMqttDeviceName(
    mac: string,
    deviceId: number,
  ): Promise<string | null> {
    const hass = this.host.getHass();
    if (!hass?.connection?.subscribeMessage) return null;
    if (!Number.isFinite(deviceId)) return null;

    const cacheKey = `${mac}:${deviceId}`;
    if (this.mqttDeviceNames.has(cacheKey)) {
      return this.mqttDeviceNames.get(cacheKey) ?? null;
    }

    const topic = `device/${mac}/list`;
    const requestTopic = `device/${mac}/list_request`;
    const payload = JSON.stringify({ data: "device_list" });

    return this.enqueueMqttRequest(
      () =>
        new Promise<string | null>((resolve) => {
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          let unsub: (() => unknown) | null = null;

          const finish = (name: string | null) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (unsub) {
              const unsubscribe = unsub;
              unsub = null;
              this.safeUnsubscribe(unsubscribe);
            }
            if (name) {
              this.mqttDeviceNames.set(cacheKey, name);
            }
            resolve(name || null);
          };

          hass.connection!
            .subscribeMessage(
              (msg: MqttMessageLike) => {
                const data = parseMqttPayload(msg?.payload);
                const devices = Array.isArray(data?.data)
                  ? (data.data as Array<Record<string, unknown>>)
                  : [];
                const match = devices.find(
                  (device) => Number(device?.device_id) === deviceId,
                );
                finish(match?.device_name ? String(match.device_name) : null);
              },
              { type: "mqtt/subscribe", topic },
            )
            .then((unsubscribe) => {
              unsub = unsubscribe;
              void this.host.callService("mqtt", "publish", {
                topic: requestTopic,
                payload,
              });
              timeoutId = setTimeout(() => finish(null), 4000);
            })
            .catch(() => finish(null));
        }),
    ) as Promise<string | null>;
  }

  async requestMqttDeviceCommandName(
    mac: string,
    deviceId: number,
    keyId: number,
  ): Promise<string | null> {
    if (!Number.isFinite(keyId)) return null;
    const commands = await this.requestMqttDeviceCommands(mac, deviceId);
    if (!commands) return null;
    return commands.get(Number(keyId)) || null;
  }

  async requestMqttDeviceCommands(
    mac: string,
    deviceId: number,
  ): Promise<Map<number, string> | null> {
    const hass = this.host.getHass();
    if (!hass?.connection?.subscribeMessage) return null;
    if (!Number.isFinite(deviceId)) return null;

    const cacheKey = `${mac}:${deviceId}`;
    if (this.mqttDeviceCommands.has(cacheKey)) {
      return this.mqttDeviceCommands.get(cacheKey) ?? null;
    }

    const topic = `device/${mac}/keys_list`;
    const requestTopic = `device/${mac}/keys_request`;
    const payload = JSON.stringify({ data: { device_id: deviceId } });

    return this.enqueueMqttRequest(
      () =>
        new Promise<Map<number, string> | null>((resolve) => {
          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          let unsub: (() => unknown) | null = null;

          const finish = (commands: Map<number, string> | null) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (unsub) {
              const unsubscribe = unsub;
              unsub = null;
              this.safeUnsubscribe(unsubscribe);
            }
            if (commands) {
              this.mqttDeviceCommands.set(cacheKey, commands);
            }
            resolve(commands || null);
          };

          hass.connection!
            .subscribeMessage(
              (msg: MqttMessageLike) => {
                const data = parseMqttPayload(msg?.payload);
                if (Number(data?.device_id) !== deviceId) return;
                const keys = Array.isArray(data?.data)
                  ? (data.data as Array<Record<string, unknown>>)
                  : [];
                const commands = new Map<number, string>();
                keys.forEach((entry) => {
                  const key = Number(entry?.key_id);
                  if (!Number.isFinite(key)) return;
                  const name = entry?.key_name ? String(entry.key_name) : null;
                  if (name) commands.set(key, name);
                });
                finish(commands);
              },
              { type: "mqtt/subscribe", topic },
            )
            .then((unsubscribe) => {
              unsub = unsubscribe;
              void this.host.callService("mqtt", "publish", {
                topic: requestTopic,
                payload,
              });
              timeoutId = setTimeout(() => finish(null), 4000);
            })
            .catch(() => finish(null));
        }),
    ) as Promise<Map<number, string> | null>;
  }

  private enqueueMqttRequest(task: () => Promise<unknown>): Promise<unknown> {
    const run = async () => task();
    this.mqttRequestQueue = this.mqttRequestQueue.then(run, run);
    return this.mqttRequestQueue;
  }

  private enqueueMqttPublish(task: () => Promise<unknown>): Promise<unknown> {
    const run = async () => task();
    this.mqttPublishQueue = this.mqttPublishQueue.then(run, run);
    return this.mqttPublishQueue;
  }

  setStatus(text: string): void {
    this.statusMessage = String(text ?? "");
    this.host.onChange();
  }

  // ---------- trigger discovery (the modal's Create button) ----------

  async createTriggers(): Promise<void> {
    if (!this.mqttAvailable()) return;
    const mac = this.hubMac;
    const payload = this.mqttPayload;
    if (!mac || !payload) return;

    const deviceId = Number(payload.device_id);
    if (!Number.isFinite(deviceId)) return;

    this.discoveryWorking = true;
    this.host.onChange();

    try {
      const [deviceName, commands] = await Promise.all([
        this.requestMqttDeviceName(mac, deviceId),
        this.requestMqttDeviceCommands(mac, deviceId),
      ]);

      if (!commands || commands.size === 0) {
        this.setStatus(str().assist.noMqttCommands);
        return;
      }

      const deviceLabel = deviceName || str().assist.deviceFallback(deviceId);
      const topic = `${mac}/up`;
      const macLower = String(mac).toLowerCase();
      const macUpper = String(mac).toUpperCase();
      const session = this.sessionState();
      const allowActivityTriggers = !session.activityTriggersCreated;
      const includeActivityTriggers =
        allowActivityTriggers && this.modalActivityChecked;
      let createdCount = 0;
      let createdActivityCount = 0;

      for (const [keyId, commandName] of commands.entries()) {
        const payloadObj = { device_id: deviceId, key_id: Number(keyId) };
        if (!Number.isFinite(payloadObj.key_id)) continue;

        if (this.mqttTriggerExists(payloadObj, topic)) {
          continue;
        }

        const displayCommand =
          commandName || str().assist.commandFallback(payloadObj.key_id);
        const uniqueId = `sofabaton_${macLower}_d${deviceId}_k${payloadObj.key_id}`;
        if (this.discoveryIds.has(uniqueId)) continue;
        const subtype = `X2 ${deviceLabel} ${displayCommand}`;
        const config = {
          automation_type: "trigger",
          type: "button_short_press",
          subtype,
          payload: JSON.stringify(payloadObj),
          topic: `${macUpper}/up`,
          device: {
            identifiers: [`sofabaton_x2_remote_${deviceId}`],
            name: `X2 → ${deviceLabel}`,
            model: "X2",
            manufacturer: "Sofabaton",
          },
        };

        await this.enqueueMqttPublish(async () => {
          await this.host.callService("mqtt", "publish", {
            topic: `homeassistant/device_automation/${uniqueId}/config`,
            payload: JSON.stringify(config),
            retain: true,
          });
          this.discoveryIds.add(uniqueId);
          await sleep(250);
        });
        createdCount += 1;
      }

      if (includeActivityTriggers) {
        const activityTopic = `activity/${macLower}/activity_control_up`;
        const activityDevice = {
          identifiers: ["sofabaton_x2_remote_activities"],
          name: "X2 → Activities",
          model: "X2",
          manufacturer: "Sofabaton",
        };
        const activities = this.host.activities();
        const activityEntries: AssistActivity[] = activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          state: "on",
        }));
        activityEntries.push({
          id: 255,
          name: "Powered Off",
          state: "off",
        });

        for (const activity of activityEntries) {
          const activityId = Number(activity.id);
          if (!Number.isFinite(activityId)) continue;
          const payloadObj = { activity_id: activityId, state: activity.state };
          const uniqueId = `sofabaton_${macLower}_activity_${activityId}`;
          if (this.discoveryIds.has(uniqueId)) continue;

          const subtype = `X2 Activity ${activity.name}`;
          const config = {
            automation_type: "trigger",
            type: "button_short_press",
            subtype,
            payload: JSON.stringify(payloadObj),
            topic: activityTopic,
            device: activityDevice,
          };

          await this.enqueueMqttPublish(async () => {
            await this.host.callService("mqtt", "publish", {
              topic: `homeassistant/device_automation/${uniqueId}/config`,
              payload: JSON.stringify(config),
              retain: true,
            });
            this.discoveryIds.add(uniqueId);
            await sleep(250);
          });
          createdActivityCount += 1;
        }

        session.activityTriggersCreated = true;
      }

      this.discoveryCreated = true;
      this.discoveryDeviceId = deviceId;

      session.discoveryDeviceIds.add(deviceId);

      if (createdCount > 0 || createdActivityCount > 0) {
        const activityNote =
          includeActivityTriggers &&
          createdActivityCount > 0 &&
          createdCount > 0
            ? str().assist.plusActivityTriggers(createdActivityCount)
            : "";
        const base =
          createdCount > 0
            ? str().assist.createdTriggers(createdCount, deviceLabel)
            : str().assist.createdActivityTriggers(createdActivityCount);
        this.setStatus(`${base}${activityNote}`);
      } else {
        this.setStatus(str().assist.allTriggersExist(deviceLabel));
      }
    } finally {
      this.discoveryWorking = false;
      this.host.onChange();
    }
  }

  /** Call from disconnectedCallback (fixes the legacy MQTT subscription leak). */
  disconnected(): void {
    this.unsubscribeMqtt();
  }
}
