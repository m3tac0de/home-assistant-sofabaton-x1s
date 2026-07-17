// tests/frontend/activity-reorder.test.ts
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { setMaxListeners } from "node:events";

// custom_components/sofabaton_x1s/www/src/shared/api/control-panel-api.ts
var ControlPanelApi = class {
  constructor(hass) {
    this.hass = hass;
  }
  loadState() {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/state"
    });
  }
  loadCacheContents() {
    return this.hass.callWS({
      type: "sofabaton_x1s/persistent_cache/contents"
    });
  }
  setSetting(entryId, setting, enabled) {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/set_setting",
      entry_id: entryId,
      setting,
      enabled
    });
  }
  runAction(entryId, action) {
    return this.hass.callWS({
      type: "sofabaton_x1s/control_panel/run_action",
      entry_id: entryId,
      action
    });
  }
  fetchBlob(entryId, deviceId, commandId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/blobs/fetch",
      entry_id: entryId,
      device_id: deviceId,
      ...commandId != null ? { command_id: commandId } : {}
    });
  }
  playIrBlob(entryId, blob) {
    return this.hass.callWS({
      type: "sofabaton_x1s/blobs/play",
      entry_id: entryId,
      blob
    });
  }
  startBackupExport(entryId, deviceIds) {
    return this.hass.callWS({
      type: "sofabaton_x1s/backup/export",
      entry_id: entryId,
      ...deviceIds?.length ? { device_ids: deviceIds } : {}
    });
  }
  startActivitySync(entryId, activityId, baseline, edited) {
    return this.hass.callWS({
      type: "sofabaton_x1s/activity/sync",
      entry_id: entryId,
      activity_id: activityId,
      baseline,
      edited
    });
  }
  activitySyncPlan(entryId, activityId, baseline, edited) {
    return this.hass.callWS({
      type: "sofabaton_x1s/activity/sync_plan",
      entry_id: entryId,
      activity_id: activityId,
      baseline,
      edited
    });
  }
  startDeviceSync(entryId, deviceId, baseline, edited) {
    return this.hass.callWS({
      type: "sofabaton_x1s/device/sync",
      entry_id: entryId,
      device_id: deviceId,
      baseline,
      edited
    });
  }
  deviceSyncPlan(entryId, deviceId, baseline, edited) {
    return this.hass.callWS({
      type: "sofabaton_x1s/device/sync_plan",
      entry_id: entryId,
      device_id: deviceId,
      baseline,
      edited
    });
  }
  // Immediate live delete of a whole activity/device from the hub. Both wrap
  // the id-generic hub delete primitive; separate types keep the id range and
  // validation explicit per entity kind.
  deleteActivity(entryId, activityId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/activity/delete",
      entry_id: entryId,
      activity_id: activityId
    });
  }
  deleteDevice(entryId, deviceId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/device/delete",
      entry_id: entryId,
      device_id: deviceId
    });
  }
  // Immediate live write of the hub's stored activity display order.
  // ordered_ids is the full activity id list in the desired order.
  reorderActivities(entryId, orderedIds) {
    return this.hass.callWS({
      type: "sofabaton_x1s/activity/reorder",
      entry_id: entryId,
      ordered_ids: orderedIds
    });
  }
  // Immediate live write of the hub's stored device display order.
  // ordered_ids is the full device id list in the desired order.
  reorderDevices(entryId, orderedIds) {
    return this.hass.callWS({
      type: "sofabaton_x1s/device/reorder",
      entry_id: entryId,
      ordered_ids: orderedIds
    });
  }
  // Create a fresh, empty activity on the hub; resolves with the
  // hub-assigned activity id so the caller can open the live editor on it.
  createActivity(entryId, name) {
    return this.hass.callWS({
      type: "sofabaton_x1s/activity/create",
      entry_id: entryId,
      name
    });
  }
  startCacheRefresh(entryId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/cache/refresh_all",
      entry_id: entryId
    });
  }
  getStructuralBundle(entryId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/cache/structural_bundle",
      entry_id: entryId
    });
  }
  stashEditedBackup(entryId, backup, filename) {
    return this.hass.callWS({
      type: "sofabaton_x1s/backup/stash_edited",
      entry_id: entryId,
      backup,
      filename
    });
  }
  startBackupRestore(entryId, backup, mode) {
    return this.hass.callWS({
      type: "sofabaton_x1s/backup/restore",
      entry_id: entryId,
      backup,
      mode
    });
  }
  subscribeBackupProgress(operationId, onMessage) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Backup progress is unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/backup/progress_subscribe", operation_id: operationId }
    );
  }
  getBackupState(entryId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/backup/state",
      entry_id: entryId
    });
  }
  getWifiCommandDevices(entityId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/command_devices/list",
      entity_id: entityId
    });
  }
  clearBackupResult(operationId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/backup/clear_result",
      operation_id: operationId
    });
  }
  clearRestoreResult(operationId) {
    return this.hass.callWS({
      type: "sofabaton_x1s/backup/clear_result",
      operation_id: operationId
    });
  }
  refreshCatalog(entryId, kind) {
    return this.hass.callWS({
      type: "sofabaton_x1s/catalog/refresh",
      entry_id: entryId,
      kind
    });
  }
  refreshCacheEntry(payload) {
    const message = {
      type: "sofabaton_x1s/persistent_cache/refresh",
      kind: payload.kind,
      target_id: payload.targetId
    };
    if (payload.entityId) message.entity_id = payload.entityId;
    else message.entry_id = payload.hubEntryId;
    return this.hass.callWS(message);
  }
  getLogs(entryId, limit = 250) {
    return this.hass.callWS({
      type: "sofabaton_x1s/logs/get",
      entry_id: entryId,
      limit
    });
  }
  subscribeLogs(entryId, onMessage) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Live logs are unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/logs/subscribe", entry_id: entryId }
    );
  }
  subscribeWifiPresses(entryId, onMessage) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Wifi press events are unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/wifi_presses/subscribe", entry_id: entryId }
    );
  }
  subscribeHubEvents(entryId, onMessage) {
    if (!this.hass.connection?.subscribeMessage) {
      return Promise.reject(new Error("Hub events are unavailable without a websocket connection"));
    }
    return this.hass.connection.subscribeMessage(
      onMessage,
      { type: "sofabaton_x1s/hub_events/subscribe", entry_id: entryId }
    );
  }
};

// node_modules/@lit-labs/ssr-dom-shim/lib/element-internals.js
var ElementInternalsShim = class ElementInternals {
  get shadowRoot() {
    return this.__host.__shadowRoot;
  }
  constructor(_host) {
    this.ariaActiveDescendantElement = null;
    this.ariaAtomic = "";
    this.ariaAutoComplete = "";
    this.ariaBrailleLabel = "";
    this.ariaBrailleRoleDescription = "";
    this.ariaBusy = "";
    this.ariaChecked = "";
    this.ariaColCount = "";
    this.ariaColIndex = "";
    this.ariaColIndexText = "";
    this.ariaColSpan = "";
    this.ariaControlsElements = null;
    this.ariaCurrent = "";
    this.ariaDescribedByElements = null;
    this.ariaDescription = "";
    this.ariaDetailsElements = null;
    this.ariaDisabled = "";
    this.ariaErrorMessageElements = null;
    this.ariaExpanded = "";
    this.ariaFlowToElements = null;
    this.ariaHasPopup = "";
    this.ariaHidden = "";
    this.ariaInvalid = "";
    this.ariaKeyShortcuts = "";
    this.ariaLabel = "";
    this.ariaLabelledByElements = null;
    this.ariaLevel = "";
    this.ariaLive = "";
    this.ariaModal = "";
    this.ariaMultiLine = "";
    this.ariaMultiSelectable = "";
    this.ariaOrientation = "";
    this.ariaOwnsElements = null;
    this.ariaPlaceholder = "";
    this.ariaPosInSet = "";
    this.ariaPressed = "";
    this.ariaReadOnly = "";
    this.ariaRelevant = "";
    this.ariaRequired = "";
    this.ariaRoleDescription = "";
    this.ariaRowCount = "";
    this.ariaRowIndex = "";
    this.ariaRowIndexText = "";
    this.ariaRowSpan = "";
    this.ariaSelected = "";
    this.ariaSetSize = "";
    this.ariaSort = "";
    this.ariaValueMax = "";
    this.ariaValueMin = "";
    this.ariaValueNow = "";
    this.ariaValueText = "";
    this.role = "";
    this.form = null;
    this.labels = [];
    this.states = /* @__PURE__ */ new Set();
    this.validationMessage = "";
    this.validity = {};
    this.willValidate = true;
    this.__host = _host;
  }
  checkValidity() {
    console.warn("`ElementInternals.checkValidity()` was called on the server.This method always returns true.");
    return true;
  }
  reportValidity() {
    return true;
  }
  setFormValue() {
  }
  setValidity() {
  }
};

// node_modules/@lit-labs/ssr-dom-shim/lib/events.js
var __classPrivateFieldSet = function(receiver, state, value, kind, f3) {
  if (kind === "m") throw new TypeError("Private method is not writable");
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a setter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
  return kind === "a" ? f3.call(receiver, value) : f3 ? f3.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet = function(receiver, state, kind, f3) {
  if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a getter");
  if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
  return kind === "m" ? f3 : kind === "a" ? f3.call(receiver) : f3 ? f3.value : state.get(receiver);
};
var _Event_cancelable;
var _Event_bubbles;
var _Event_composed;
var _Event_defaultPrevented;
var _Event_timestamp;
var _Event_propagationStopped;
var _Event_type;
var _Event_target;
var _Event_isBeingDispatched;
var _a;
var _CustomEvent_detail;
var _b;
var isCaptureEventListener = (options) => typeof options === "boolean" ? options : options?.capture ?? false;
var NONE = 0;
var CAPTURING_PHASE = 1;
var AT_TARGET = 2;
var BUBBLING_PHASE = 3;
var EventTarget = class {
  constructor() {
    this.__eventListeners = /* @__PURE__ */ new Map();
    this.__captureEventListeners = /* @__PURE__ */ new Map();
  }
  addEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    let eventListeners = eventListenersMap.get(type);
    if (eventListeners === void 0) {
      eventListeners = /* @__PURE__ */ new Map();
      eventListenersMap.set(type, eventListeners);
    } else if (eventListeners.has(callback)) {
      return;
    }
    const normalizedOptions = typeof options === "object" && options ? options : {};
    normalizedOptions.signal?.addEventListener("abort", () => this.removeEventListener(type, callback, options));
    eventListeners.set(callback, normalizedOptions ?? {});
  }
  removeEventListener(type, callback, options) {
    if (callback === void 0 || callback === null) {
      return;
    }
    const eventListenersMap = isCaptureEventListener(options) ? this.__captureEventListeners : this.__eventListeners;
    const eventListeners = eventListenersMap.get(type);
    if (eventListeners !== void 0) {
      eventListeners.delete(callback);
      if (!eventListeners.size) {
        eventListenersMap.delete(type);
      }
    }
  }
  dispatchEvent(event) {
    const composedPath = [this];
    let parent = this.__eventTargetParent;
    if (event.composed) {
      while (parent) {
        composedPath.push(parent);
        parent = parent.__eventTargetParent;
      }
    } else {
      while (parent && parent !== this.__host) {
        composedPath.push(parent);
        parent = parent.__eventTargetParent;
      }
    }
    let stopPropagation = false;
    let stopImmediatePropagation = false;
    let eventPhase = NONE;
    let target = null;
    let tmpTarget = null;
    let currentTarget = null;
    const originalStopPropagation = event.stopPropagation;
    const originalStopImmediatePropagation = event.stopImmediatePropagation;
    Object.defineProperties(event, {
      target: {
        get() {
          return target ?? tmpTarget;
        },
        ...enumerableProperty
      },
      srcElement: {
        get() {
          return event.target;
        },
        ...enumerableProperty
      },
      currentTarget: {
        get() {
          return currentTarget;
        },
        ...enumerableProperty
      },
      eventPhase: {
        get() {
          return eventPhase;
        },
        ...enumerableProperty
      },
      composedPath: {
        value: () => composedPath,
        ...enumerableProperty
      },
      stopPropagation: {
        value: () => {
          stopPropagation = true;
          originalStopPropagation.call(event);
        },
        ...enumerableProperty
      },
      stopImmediatePropagation: {
        value: () => {
          stopImmediatePropagation = true;
          originalStopImmediatePropagation.call(event);
        },
        ...enumerableProperty
      }
    });
    const invokeEventListener = (listener, options, eventListenerMap) => {
      if (typeof listener === "function") {
        listener(event);
      } else if (typeof listener?.handleEvent === "function") {
        listener.handleEvent(event);
      }
      if (options.once) {
        eventListenerMap.delete(listener);
      }
    };
    const finishDispatch = () => {
      currentTarget = null;
      eventPhase = NONE;
      return !event.defaultPrevented;
    };
    const captureEventPath = composedPath.slice().reverse();
    target = !this.__host || !event.composed ? this : null;
    const retarget = (eventTargets) => {
      tmpTarget = this;
      while (tmpTarget.__host && eventTargets.includes(tmpTarget.__host)) {
        tmpTarget = tmpTarget.__host;
      }
    };
    for (const eventTarget of captureEventPath) {
      if (!target && (!tmpTarget || tmpTarget === eventTarget.__host)) {
        retarget(captureEventPath.slice(captureEventPath.indexOf(eventTarget)));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? AT_TARGET : CAPTURING_PHASE;
      const captureEventListeners = eventTarget.__captureEventListeners.get(event.type);
      if (captureEventListeners) {
        for (const [listener, options] of captureEventListeners) {
          invokeEventListener(listener, options, captureEventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    const bubbleEventPath = event.bubbles ? composedPath : [this];
    tmpTarget = null;
    for (const eventTarget of bubbleEventPath) {
      if (!target && (!tmpTarget || eventTarget === tmpTarget.__host)) {
        retarget(bubbleEventPath.slice(0, bubbleEventPath.indexOf(eventTarget) + 1));
      }
      currentTarget = eventTarget;
      eventPhase = eventTarget === event.target ? AT_TARGET : BUBBLING_PHASE;
      const captureEventListeners = eventTarget.__eventListeners.get(event.type);
      if (captureEventListeners) {
        for (const [listener, options] of captureEventListeners) {
          invokeEventListener(listener, options, captureEventListeners);
          if (stopImmediatePropagation) {
            return finishDispatch();
          }
        }
      }
      if (stopPropagation) {
        return finishDispatch();
      }
    }
    return finishDispatch();
  }
};
var EventTargetShimWithRealType = EventTarget;
var enumerableProperty = { __proto__: null };
enumerableProperty.enumerable = true;
Object.freeze(enumerableProperty);
var EventShim = (_a = class Event {
  constructor(type, options = {}) {
    _Event_cancelable.set(this, false);
    _Event_bubbles.set(this, false);
    _Event_composed.set(this, false);
    _Event_defaultPrevented.set(this, false);
    _Event_timestamp.set(this, Date.now());
    _Event_propagationStopped.set(this, false);
    _Event_type.set(this, void 0);
    _Event_target.set(this, void 0);
    _Event_isBeingDispatched.set(this, void 0);
    this.NONE = NONE;
    this.CAPTURING_PHASE = CAPTURING_PHASE;
    this.AT_TARGET = AT_TARGET;
    this.BUBBLING_PHASE = BUBBLING_PHASE;
    if (arguments.length === 0)
      throw new Error(`The type argument must be specified`);
    if (typeof options !== "object" || !options) {
      throw new Error(`The "options" argument must be an object`);
    }
    const { bubbles, cancelable, composed } = options;
    __classPrivateFieldSet(this, _Event_cancelable, !!cancelable, "f");
    __classPrivateFieldSet(this, _Event_bubbles, !!bubbles, "f");
    __classPrivateFieldSet(this, _Event_composed, !!composed, "f");
    __classPrivateFieldSet(this, _Event_type, `${type}`, "f");
    __classPrivateFieldSet(this, _Event_target, null, "f");
    __classPrivateFieldSet(this, _Event_isBeingDispatched, false, "f");
  }
  initEvent(_type, _bubbles, _cancelable) {
    throw new Error("Method not implemented.");
  }
  stopImmediatePropagation() {
    this.stopPropagation();
  }
  preventDefault() {
    __classPrivateFieldSet(this, _Event_defaultPrevented, true, "f");
  }
  get target() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get currentTarget() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get srcElement() {
    return __classPrivateFieldGet(this, _Event_target, "f");
  }
  get type() {
    return __classPrivateFieldGet(this, _Event_type, "f");
  }
  get cancelable() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f");
  }
  get defaultPrevented() {
    return __classPrivateFieldGet(this, _Event_cancelable, "f") && __classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get timeStamp() {
    return __classPrivateFieldGet(this, _Event_timestamp, "f");
  }
  composedPath() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? [__classPrivateFieldGet(this, _Event_target, "f")] : [];
  }
  get returnValue() {
    return !__classPrivateFieldGet(this, _Event_cancelable, "f") || !__classPrivateFieldGet(this, _Event_defaultPrevented, "f");
  }
  get bubbles() {
    return __classPrivateFieldGet(this, _Event_bubbles, "f");
  }
  get composed() {
    return __classPrivateFieldGet(this, _Event_composed, "f");
  }
  get eventPhase() {
    return __classPrivateFieldGet(this, _Event_isBeingDispatched, "f") ? _a.AT_TARGET : _a.NONE;
  }
  get cancelBubble() {
    return __classPrivateFieldGet(this, _Event_propagationStopped, "f");
  }
  set cancelBubble(value) {
    if (value) {
      __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
    }
  }
  stopPropagation() {
    __classPrivateFieldSet(this, _Event_propagationStopped, true, "f");
  }
  get isTrusted() {
    return false;
  }
}, _Event_cancelable = /* @__PURE__ */ new WeakMap(), _Event_bubbles = /* @__PURE__ */ new WeakMap(), _Event_composed = /* @__PURE__ */ new WeakMap(), _Event_defaultPrevented = /* @__PURE__ */ new WeakMap(), _Event_timestamp = /* @__PURE__ */ new WeakMap(), _Event_propagationStopped = /* @__PURE__ */ new WeakMap(), _Event_type = /* @__PURE__ */ new WeakMap(), _Event_target = /* @__PURE__ */ new WeakMap(), _Event_isBeingDispatched = /* @__PURE__ */ new WeakMap(), _a.NONE = NONE, _a.CAPTURING_PHASE = CAPTURING_PHASE, _a.AT_TARGET = AT_TARGET, _a.BUBBLING_PHASE = BUBBLING_PHASE, _a);
Object.defineProperties(EventShim.prototype, {
  initEvent: enumerableProperty,
  stopImmediatePropagation: enumerableProperty,
  preventDefault: enumerableProperty,
  target: enumerableProperty,
  currentTarget: enumerableProperty,
  srcElement: enumerableProperty,
  type: enumerableProperty,
  cancelable: enumerableProperty,
  defaultPrevented: enumerableProperty,
  timeStamp: enumerableProperty,
  composedPath: enumerableProperty,
  returnValue: enumerableProperty,
  bubbles: enumerableProperty,
  composed: enumerableProperty,
  eventPhase: enumerableProperty,
  cancelBubble: enumerableProperty,
  stopPropagation: enumerableProperty,
  isTrusted: enumerableProperty
});
var CustomEventShim = (_b = class CustomEvent extends EventShim {
  constructor(type, options = {}) {
    super(type, options);
    _CustomEvent_detail.set(this, void 0);
    __classPrivateFieldSet(this, _CustomEvent_detail, options?.detail ?? null, "f");
  }
  initCustomEvent(_type, _bubbles, _cancelable, _detail) {
    throw new Error("Method not implemented.");
  }
  get detail() {
    return __classPrivateFieldGet(this, _CustomEvent_detail, "f");
  }
}, _CustomEvent_detail = /* @__PURE__ */ new WeakMap(), _b);
Object.defineProperties(CustomEventShim.prototype, {
  detail: enumerableProperty
});
var EventShimWithRealType = EventShim;
var CustomEventShimWithRealType = CustomEventShim;

// node_modules/@lit-labs/ssr-dom-shim/lib/css.js
var _a2;
var CSSRuleShim = (_a2 = class CSSRule {
  constructor() {
    this.STYLE_RULE = 1;
    this.CHARSET_RULE = 2;
    this.IMPORT_RULE = 3;
    this.MEDIA_RULE = 4;
    this.FONT_FACE_RULE = 5;
    this.PAGE_RULE = 6;
    this.NAMESPACE_RULE = 10;
    this.KEYFRAMES_RULE = 7;
    this.KEYFRAME_RULE = 8;
    this.SUPPORTS_RULE = 12;
    this.COUNTER_STYLE_RULE = 11;
    this.FONT_FEATURE_VALUES_RULE = 14;
    this.__parentStyleSheet = null;
    this.cssText = "";
  }
  get parentRule() {
    return null;
  }
  get parentStyleSheet() {
    return this.__parentStyleSheet;
  }
  get type() {
    return 0;
  }
}, _a2.STYLE_RULE = 1, _a2.CHARSET_RULE = 2, _a2.IMPORT_RULE = 3, _a2.MEDIA_RULE = 4, _a2.FONT_FACE_RULE = 5, _a2.PAGE_RULE = 6, _a2.NAMESPACE_RULE = 10, _a2.KEYFRAMES_RULE = 7, _a2.KEYFRAME_RULE = 8, _a2.SUPPORTS_RULE = 12, _a2.COUNTER_STYLE_RULE = 11, _a2.FONT_FEATURE_VALUES_RULE = 14, _a2);

// node_modules/@lit-labs/ssr-dom-shim/index.js
globalThis.Event ??= EventShimWithRealType;
globalThis.CustomEvent ??= CustomEventShimWithRealType;
var attributes = /* @__PURE__ */ new WeakMap();
var attributesForElement = (element) => {
  let attrs = attributes.get(element);
  if (attrs === void 0) {
    attributes.set(element, attrs = /* @__PURE__ */ new Map());
  }
  return attrs;
};
var ElementShim = class Element extends EventTargetShimWithRealType {
  constructor() {
    super(...arguments);
    this.__shadowRootMode = null;
    this.__shadowRoot = null;
    this.__internals = null;
  }
  get attributes() {
    return Array.from(attributesForElement(this)).map(([name, value]) => ({
      name,
      value
    }));
  }
  get shadowRoot() {
    if (this.__shadowRootMode === "closed") {
      return null;
    }
    return this.__shadowRoot;
  }
  get localName() {
    return this.constructor.__localName;
  }
  get tagName() {
    return this.localName?.toUpperCase();
  }
  setAttribute(name, value) {
    attributesForElement(this).set(name, String(value));
  }
  removeAttribute(name) {
    attributesForElement(this).delete(name);
  }
  toggleAttribute(name, force) {
    if (this.hasAttribute(name)) {
      if (force === void 0 || !force) {
        this.removeAttribute(name);
        return false;
      }
    } else {
      if (force === void 0 || force) {
        this.setAttribute(name, "");
        return true;
      } else {
        return false;
      }
    }
    return true;
  }
  hasAttribute(name) {
    return attributesForElement(this).has(name);
  }
  attachShadow(init) {
    const shadowRoot = { host: this };
    this.__shadowRootMode = init.mode;
    if (init && init.mode === "open") {
      this.__shadowRoot = shadowRoot;
    }
    return shadowRoot;
  }
  attachInternals() {
    if (this.__internals !== null) {
      throw new Error(`Failed to execute 'attachInternals' on 'HTMLElement': ElementInternals for the specified element was already attached.`);
    }
    const internals = new ElementInternalsShim(this);
    this.__internals = internals;
    return internals;
  }
  getAttribute(name) {
    const value = attributesForElement(this).get(name);
    return value ?? null;
  }
};
var HTMLElementShim = class HTMLElement extends ElementShim {
};
var HTMLElementShimWithRealType = HTMLElementShim;
globalThis.litServerRoot ??= Object.defineProperty(new HTMLElementShimWithRealType(), "localName", {
  // Patch localName (and tagName) to return a unique name.
  get() {
    return "lit-server-root";
  }
});
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
var CustomElementRegistry = class {
  constructor() {
    this.__definitions = /* @__PURE__ */ new Map();
    this.__reverseDefinitions = /* @__PURE__ */ new Map();
    this.__pendingWhenDefineds = /* @__PURE__ */ new Map();
  }
  define(name, ctor) {
    if (this.__definitions.has(name)) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`'CustomElementRegistry' already has "${name}" defined. This may have been caused by live reload or hot module replacement in which case it can be safely ignored.
Make sure to test your application with a production build as repeat registrations will throw in production.`);
      } else {
        throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the name "${name}" has already been used with this registry`);
      }
    }
    if (this.__reverseDefinitions.has(ctor)) {
      throw new Error(`Failed to execute 'define' on 'CustomElementRegistry': the constructor has already been used with this registry for the tag name ${this.__reverseDefinitions.get(ctor)}`);
    }
    ctor.__localName = name;
    this.__definitions.set(name, {
      ctor,
      // Note it's important we read `observedAttributes` in case it is a getter
      // with side-effects, as is the case in Lit, where it triggers class
      // finalization.
      //
      // TODO(aomarks) To be spec compliant, we should also capture the
      // registration-time lifecycle methods like `connectedCallback`. For them
      // to be actually accessible to e.g. the Lit SSR element renderer, though,
      // we'd need to introduce a new API for accessing them (since `get` only
      // returns the constructor).
      observedAttributes: ctor.observedAttributes ?? []
    });
    this.__reverseDefinitions.set(ctor, name);
    this.__pendingWhenDefineds.get(name)?.resolve(ctor);
    this.__pendingWhenDefineds.delete(name);
  }
  get(name) {
    const definition = this.__definitions.get(name);
    return definition?.ctor;
  }
  getName(ctor) {
    return this.__reverseDefinitions.get(ctor) ?? null;
  }
  upgrade(_element) {
    throw new Error(`customElements.upgrade is not currently supported in SSR. Please file a bug if you need it.`);
  }
  async whenDefined(name) {
    const definition = this.__definitions.get(name);
    if (definition) {
      return definition.ctor;
    }
    let withResolvers = this.__pendingWhenDefineds.get(name);
    if (!withResolvers) {
      withResolvers = promiseWithResolvers();
      this.__pendingWhenDefineds.set(name, withResolvers);
    }
    return withResolvers.promise;
  }
};
var CustomElementRegistryShimWithRealType = CustomElementRegistry;
var customElements = new CustomElementRegistryShimWithRealType();

// node_modules/@lit/reactive-element/node/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t3, e3, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t3, this.t = e3;
  }
  get styleSheet() {
    let t3 = this.o;
    const s4 = this.t;
    if (e && void 0 === t3) {
      const e3 = void 0 !== s4 && 1 === s4.length;
      e3 && (t3 = o.get(s4)), void 0 === t3 && ((this.o = t3 = new CSSStyleSheet()).replaceSync(this.cssText), e3 && o.set(s4, t3));
    }
    return t3;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t3) => new n("string" == typeof t3 ? t3 : t3 + "", void 0, s);
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t3) => t3 instanceof CSSStyleSheet ? t3 : t3.styleSheet);
  else for (const e3 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e3.cssText, s4.appendChild(o6);
  }
};
var c = e || void 0 === t.CSSStyleSheet ? (t3) => t3 : (t3) => t3 instanceof CSSStyleSheet ? ((t4) => {
  let e3 = "";
  for (const s4 of t4.cssRules) e3 += s4.cssText;
  return r(e3);
})(t3) : t3;

// node_modules/@lit/reactive-element/node/reactive-element.js
var { is: h, defineProperty: r2, getOwnPropertyDescriptor: o2, getOwnPropertyNames: n2, getOwnPropertySymbols: a, getPrototypeOf: c2 } = Object;
var l = globalThis;
l.customElements ??= customElements;
var p = l.trustedTypes;
var d = p ? p.emptyScript : "";
var u = l.reactiveElementPolyfillSupport;
var f = (t3, s4) => t3;
var b = { toAttribute(t3, s4) {
  switch (s4) {
    case Boolean:
      t3 = t3 ? d : null;
      break;
    case Object:
    case Array:
      t3 = null == t3 ? t3 : JSON.stringify(t3);
  }
  return t3;
}, fromAttribute(t3, s4) {
  let i4 = t3;
  switch (s4) {
    case Boolean:
      i4 = null !== t3;
      break;
    case Number:
      i4 = null === t3 ? null : Number(t3);
      break;
    case Object:
    case Array:
      try {
        i4 = JSON.parse(t3);
      } catch (t4) {
        i4 = null;
      }
  }
  return i4;
} };
var m = (t3, s4) => !h(t3, s4);
var y = { attribute: true, type: String, converter: b, reflect: false, useDefault: false, hasChanged: m };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), l.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var g = class extends (globalThis.HTMLElement ?? HTMLElementShimWithRealType) {
  static addInitializer(t3) {
    this._$Ei(), (this.l ??= []).push(t3);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t3, s4 = y) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t3) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t3, s4), !s4.noAccessor) {
      const i4 = /* @__PURE__ */ Symbol(), e3 = this.getPropertyDescriptor(t3, i4, s4);
      void 0 !== e3 && r2(this.prototype, t3, e3);
    }
  }
  static getPropertyDescriptor(t3, s4, i4) {
    const { get: e3, set: h3 } = o2(this.prototype, t3) ?? { get() {
      return this[s4];
    }, set(t4) {
      this[s4] = t4;
    } };
    return { get: e3, set(s5) {
      const r4 = e3?.call(this);
      h3?.call(this, s5), this.requestUpdate(t3, r4, i4);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t3) {
    return this.elementProperties.get(t3) ?? y;
  }
  static _$Ei() {
    if (this.hasOwnProperty(f("elementProperties"))) return;
    const t3 = c2(this);
    t3.finalize(), void 0 !== t3.l && (this.l = [...t3.l]), this.elementProperties = new Map(t3.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(f("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(f("properties"))) {
      const t4 = this.properties, s4 = [...n2(t4), ...a(t4)];
      for (const i4 of s4) this.createProperty(i4, t4[i4]);
    }
    const t3 = this[Symbol.metadata];
    if (null !== t3) {
      const s4 = litPropertyMetadata.get(t3);
      if (void 0 !== s4) for (const [t4, i4] of s4) this.elementProperties.set(t4, i4);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t4, s4] of this.elementProperties) {
      const i4 = this._$Eu(t4, s4);
      void 0 !== i4 && this._$Eh.set(i4, t4);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t3) {
    const s4 = [];
    if (Array.isArray(t3)) {
      const e3 = new Set(t3.flat(1 / 0).reverse());
      for (const t4 of e3) s4.unshift(c(t4));
    } else void 0 !== t3 && s4.push(c(t3));
    return s4;
  }
  static _$Eu(t3, s4) {
    const i4 = s4.attribute;
    return false === i4 ? void 0 : "string" == typeof i4 ? i4 : "string" == typeof t3 ? t3.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t3) => this.enableUpdating = t3), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t3) => t3(this));
  }
  addController(t3) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t3), void 0 !== this.renderRoot && this.isConnected && t3.hostConnected?.();
  }
  removeController(t3) {
    this._$EO?.delete(t3);
  }
  _$E_() {
    const t3 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i4 of s4.keys()) this.hasOwnProperty(i4) && (t3.set(i4, this[i4]), delete this[i4]);
    t3.size > 0 && (this._$Ep = t3);
  }
  createRenderRoot() {
    const t3 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t3, this.constructor.elementStyles), t3;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t3) => t3.hostConnected?.());
  }
  enableUpdating(t3) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t3) => t3.hostDisconnected?.());
  }
  attributeChangedCallback(t3, s4, i4) {
    this._$AK(t3, i4);
  }
  _$ET(t3, s4) {
    const i4 = this.constructor.elementProperties.get(t3), e3 = this.constructor._$Eu(t3, i4);
    if (void 0 !== e3 && true === i4.reflect) {
      const h3 = (void 0 !== i4.converter?.toAttribute ? i4.converter : b).toAttribute(s4, i4.type);
      this._$Em = t3, null == h3 ? this.removeAttribute(e3) : this.setAttribute(e3, h3), this._$Em = null;
    }
  }
  _$AK(t3, s4) {
    const i4 = this.constructor, e3 = i4._$Eh.get(t3);
    if (void 0 !== e3 && this._$Em !== e3) {
      const t4 = i4.getPropertyOptions(e3), h3 = "function" == typeof t4.converter ? { fromAttribute: t4.converter } : void 0 !== t4.converter?.fromAttribute ? t4.converter : b;
      this._$Em = e3;
      const r4 = h3.fromAttribute(s4, t4.type);
      this[e3] = r4 ?? this._$Ej?.get(e3) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t3, s4, i4, e3 = false, h3) {
    if (void 0 !== t3) {
      const r4 = this.constructor;
      if (false === e3 && (h3 = this[t3]), i4 ??= r4.getPropertyOptions(t3), !((i4.hasChanged ?? m)(h3, s4) || i4.useDefault && i4.reflect && h3 === this._$Ej?.get(t3) && !this.hasAttribute(r4._$Eu(t3, i4)))) return;
      this.C(t3, s4, i4);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t3, s4, { useDefault: i4, reflect: e3, wrapped: h3 }, r4) {
    i4 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t3) && (this._$Ej.set(t3, r4 ?? s4 ?? this[t3]), true !== h3 || void 0 !== r4) || (this._$AL.has(t3) || (this.hasUpdated || i4 || (s4 = void 0), this._$AL.set(t3, s4)), true === e3 && this._$Em !== t3 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t3));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t4) {
      Promise.reject(t4);
    }
    const t3 = this.scheduleUpdate();
    return null != t3 && await t3, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t5, s5] of this._$Ep) this[t5] = s5;
        this._$Ep = void 0;
      }
      const t4 = this.constructor.elementProperties;
      if (t4.size > 0) for (const [s5, i4] of t4) {
        const { wrapped: t5 } = i4, e3 = this[s5];
        true !== t5 || this._$AL.has(s5) || void 0 === e3 || this.C(s5, void 0, i4, e3);
      }
    }
    let t3 = false;
    const s4 = this._$AL;
    try {
      t3 = this.shouldUpdate(s4), t3 ? (this.willUpdate(s4), this._$EO?.forEach((t4) => t4.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t3 = false, this._$EM(), s5;
    }
    t3 && this._$AE(s4);
  }
  willUpdate(t3) {
  }
  _$AE(t3) {
    this._$EO?.forEach((t4) => t4.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t3)), this.updated(t3);
  }
  _$EM() {
    this._$AL = /* @__PURE__ */ new Map(), this.isUpdatePending = false;
  }
  get updateComplete() {
    return this.getUpdateComplete();
  }
  getUpdateComplete() {
    return this._$ES;
  }
  shouldUpdate(t3) {
    return true;
  }
  update(t3) {
    this._$Eq &&= this._$Eq.forEach((t4) => this._$ET(t4, this[t4])), this._$EM();
  }
  updated(t3) {
  }
  firstUpdated(t3) {
  }
};
g.elementStyles = [], g.shadowRootOptions = { mode: "open" }, g[f("elementProperties")] = /* @__PURE__ */ new Map(), g[f("finalized")] = /* @__PURE__ */ new Map(), u?.({ ReactiveElement: g }), (l.reactiveElementVersions ??= []).push("2.1.2");

// node_modules/lit-html/node/lit-html.js
var t2 = globalThis;
var i2 = (t3) => t3;
var s2 = t2.trustedTypes;
var e2 = s2 ? s2.createPolicy("lit-html", { createHTML: (t3) => t3 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = void 0 === t2.document ? { createTreeWalker: () => ({}) } : document;
var c3 = () => l2.createComment("");
var a2 = (t3) => null === t3 || "object" != typeof t3 && "function" != typeof t3;
var u2 = Array.isArray;
var d2 = (t3) => u2(t3) || "function" == typeof t3?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m2 = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g2 = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t3) => (i4, ...s4) => ({ _$litType$: t3, strings: i4, values: s4 });
var T = x(1);
var b2 = x(2);
var w = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t3, i4) {
  if (!u2(t3) || !t3.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e2 ? e2.createHTML(i4) : i4;
}
var N = (t3, i4) => {
  const s4 = t3.length - 1, e3 = [];
  let n4, l3 = 2 === i4 ? "<svg>" : 3 === i4 ? "<math>" : "", c4 = v;
  for (let i5 = 0; i5 < s4; i5++) {
    const s5 = t3[i5];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m2 : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g2) : c4 === $ || c4 === g2 ? c4 = p2 : c4 === _ || c4 === m2 ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t3[i5 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e3.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i5 : x2);
  }
  return [V(t3, l3 + (t3[s4] || "<?>") + (2 === i4 ? "</svg>" : 3 === i4 ? "</math>" : "")), e3];
};
var S2 = class _S {
  constructor({ strings: t3, _$litType$: i4 }, e3) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t3.length - 1, d3 = this.parts, [f3, v2] = N(t3, i4);
    if (this.el = _S.createElement(f3, e3), P.currentNode = this.el.content, 2 === i4 || 3 === i4) {
      const t4 = this.el.content.firstChild;
      t4.replaceWith(...t4.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t4 of r4.getAttributeNames()) if (t4.endsWith(h2)) {
          const i5 = v2[a3++], s4 = r4.getAttribute(t4).split(o3), e4 = /([.?@])?(.*)/.exec(i5);
          d3.push({ type: 1, index: l3, name: e4[2], strings: s4, ctor: "." === e4[1] ? I : "?" === e4[1] ? L : "@" === e4[1] ? z : H }), r4.removeAttribute(t4);
        } else t4.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t4));
        if (y2.test(r4.tagName)) {
          const t4 = r4.textContent.split(o3), i5 = t4.length - 1;
          if (i5 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i5; s4++) r4.append(t4[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t4[i5], c3());
          }
        }
      } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t4 = -1;
        for (; -1 !== (t4 = r4.data.indexOf(o3, t4 + 1)); ) d3.push({ type: 7, index: l3 }), t4 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t3, i4) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t3, s4;
  }
};
function M(t3, i4, s4 = t3, e3) {
  if (i4 === E) return i4;
  let h3 = void 0 !== e3 ? s4._$Co?.[e3] : s4._$Cl;
  const o5 = a2(i4) ? void 0 : i4._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t3), h3._$AT(t3, s4, e3)), void 0 !== e3 ? (s4._$Co ??= [])[e3] = h3 : s4._$Cl = h3), void 0 !== h3 && (i4 = M(t3, h3._$AS(t3, i4.values), h3, e3)), i4;
}
var k = class {
  constructor(t3, i4) {
    this._$AV = [], this._$AN = void 0, this._$AD = t3, this._$AM = i4;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t3) {
    const { el: { content: i4 }, parts: s4 } = this._$AD, e3 = (t3?.creationScope ?? l2).importNode(i4, true);
    P.currentNode = e3;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i5;
        2 === r4.type ? i5 = new R(h3, h3.nextSibling, this, t3) : 1 === r4.type ? i5 = new r4.ctor(h3, r4.name, r4.strings, this, t3) : 6 === r4.type && (i5 = new W(h3, this, t3)), this._$AV.push(i5), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e3;
  }
  p(t3) {
    let i4 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t3, s4, i4), i4 += s4.strings.length - 2) : s4._$AI(t3[i4])), i4++;
  }
};
var R = class _R {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t3, i4, s4, e3) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t3, this._$AB = i4, this._$AM = s4, this.options = e3, this._$Cv = e3?.isConnected ?? true;
  }
  get parentNode() {
    let t3 = this._$AA.parentNode;
    const i4 = this._$AM;
    return void 0 !== i4 && 11 === t3?.nodeType && (t3 = i4.parentNode), t3;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t3, i4 = this) {
    t3 = M(this, t3, i4), a2(t3) ? t3 === A || null == t3 || "" === t3 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t3 !== this._$AH && t3 !== E && this._(t3) : void 0 !== t3._$litType$ ? this.$(t3) : void 0 !== t3.nodeType ? this.T(t3) : d2(t3) ? this.k(t3) : this._(t3);
  }
  O(t3) {
    return this._$AA.parentNode.insertBefore(t3, this._$AB);
  }
  T(t3) {
    this._$AH !== t3 && (this._$AR(), this._$AH = this.O(t3));
  }
  _(t3) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t3 : this.T(l2.createTextNode(t3)), this._$AH = t3;
  }
  $(t3) {
    const { values: i4, _$litType$: s4 } = t3, e3 = "number" == typeof s4 ? this._$AC(t3) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e3) this._$AH.p(i4);
    else {
      const t4 = new k(e3, this), s5 = t4.u(this.options);
      t4.p(i4), this.T(s5), this._$AH = t4;
    }
  }
  _$AC(t3) {
    let i4 = C.get(t3.strings);
    return void 0 === i4 && C.set(t3.strings, i4 = new S2(t3)), i4;
  }
  k(t3) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i4 = this._$AH;
    let s4, e3 = 0;
    for (const h3 of t3) e3 === i4.length ? i4.push(s4 = new _R(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i4[e3], s4._$AI(h3), e3++;
    e3 < i4.length && (this._$AR(s4 && s4._$AB.nextSibling, e3), i4.length = e3);
  }
  _$AR(t3 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t3 !== this._$AB; ) {
      const s5 = i2(t3).nextSibling;
      i2(t3).remove(), t3 = s5;
    }
  }
  setConnected(t3) {
    void 0 === this._$AM && (this._$Cv = t3, this._$AP?.(t3));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t3, i4, s4, e3, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t3, this.name = i4, this._$AM = e3, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t3, i4 = this, s4, e3) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t3 = M(this, t3, i4, 0), o5 = !a2(t3) || t3 !== this._$AH && t3 !== E, o5 && (this._$AH = t3);
    else {
      const e4 = t3;
      let n4, r4;
      for (t3 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e4[s4 + n4], i4, n4), r4 === E && (r4 = this._$AH[n4]), o5 ||= !a2(r4) || r4 !== this._$AH[n4], r4 === A ? t3 = A : t3 !== A && (t3 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e3 && this.j(t3);
  }
  j(t3) {
    t3 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t3 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t3) {
    this.element[this.name] = t3 === A ? void 0 : t3;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t3) {
    this.element.toggleAttribute(this.name, !!t3 && t3 !== A);
  }
};
var z = class extends H {
  constructor(t3, i4, s4, e3, h3) {
    super(t3, i4, s4, e3, h3), this.type = 5;
  }
  _$AI(t3, i4 = this) {
    if ((t3 = M(this, t3, i4, 0) ?? A) === E) return;
    const s4 = this._$AH, e3 = t3 === A && s4 !== A || t3.capture !== s4.capture || t3.once !== s4.once || t3.passive !== s4.passive, h3 = t3 !== A && (s4 === A || e3);
    e3 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t3), this._$AH = t3;
  }
  handleEvent(t3) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t3) : this._$AH.handleEvent(t3);
  }
};
var W = class {
  constructor(t3, i4, s4) {
    this.element = t3, this.type = 6, this._$AN = void 0, this._$AM = i4, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t3) {
    M(this, t3);
  }
};
var j = t2.litHtmlPolyfillSupport;
j?.(S2, R), (t2.litHtmlVersions ??= []).push("3.3.2");
var B = (t3, i4, s4) => {
  const e3 = s4?.renderBefore ?? i4;
  let h3 = e3._$litPart$;
  if (void 0 === h3) {
    const t4 = s4?.renderBefore ?? null;
    e3._$litPart$ = h3 = new R(i4.insertBefore(c3(), t4), t4, void 0, s4 ?? {});
  }
  return h3._$AI(t3), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i3 = class extends g {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t3 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t3.firstChild, t3;
  }
  update(t3) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t3), this._$Do = B(r4, this.renderRoot, this.renderOptions);
  }
  connectedCallback() {
    super.connectedCallback(), this._$Do?.setConnected(true);
  }
  disconnectedCallback() {
    super.disconnectedCallback(), this._$Do?.setConnected(false);
  }
  render() {
    return E;
  }
};
i3._$litElement$ = true, i3["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i3 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i3 });
(s3.litElementVersions ??= []).push("4.2.2");

// custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors.ts
function selectedHub(snapshot) {
  const hubs = snapshot.state?.hubs ?? [];
  return hubs.find((hub) => hub.entry_id === snapshot.selectedHubEntryId) ?? hubs[0] ?? null;
}
function persistentCacheEnabled(snapshot) {
  return !!snapshot.state?.persistent_cache_enabled;
}
function sortByHubOrder(items = []) {
  const bySort = (value) => Number(value ?? 0) > 0 ? Number(value) : Number.POSITIVE_INFINITY;
  return [...items].sort(
    (left, right) => bySort(left?.sort) - bySort(right?.sort) || Number(left?.id ?? 0) - Number(right?.id ?? 0)
  );
}
function hubActivities(hub) {
  return sortByHubOrder(hub?.activities ?? []);
}
function hubDevices(hub) {
  return sortByHubOrder(hub?.devices_list ?? []);
}
function isBackendUnavailableError(error, hass) {
  if (hass && hass.connected === false) return true;
  if (!error) return false;
  const candidate = error;
  const code = String(
    candidate.code ?? candidate.error?.code ?? ""
  ).toLowerCase();
  if (code === "unknown_command" || code === "not_found" || code === "connection_lost" || code === "disconnected") {
    return true;
  }
  const message = String(
    candidate.message ?? candidate.error?.message ?? (error instanceof Error ? error.message : "")
  );
  if (/unknown[_\s-]?command/i.test(message)) return true;
  if (/connection.*(lost|closed)|disconnected|websocket.*closed/i.test(message)) return true;
  return false;
}
function formatError(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  const candidateError = error;
  const candidates = [
    candidateError.message,
    candidateError.error?.message,
    candidateError.body?.message,
    candidateError.error,
    candidateError.code,
    candidateError.statusText,
    candidateError.type
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return "Unknown error (check Home Assistant logs)";
}
function formatLogEntry(entry) {
  const rawLine = String(entry.line ?? entry.message ?? entry.msg ?? "");
  const level = String(entry.level ?? "log").toLowerCase();
  const levelToken = level.toUpperCase();
  const formattedMatch = rawLine.match(
    /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:,\d+|\.\d+)?)\s+(\S+)\s+([A-Z]+):\s*([\s\S]*)$/
  );
  const rawTime = String(formattedMatch?.[1] ?? entry.timestamp ?? entry.time ?? entry.ts ?? "").trim();
  let message = formattedMatch?.[4] ?? String(entry.message ?? entry.msg ?? rawLine);
  const entryId = String(entry.entry_id ?? "").trim();
  if (entryId) {
    message = message.replace(new RegExp(`\\[${escapeRegExp(entryId)}\\]`, "g"), "");
  }
  message = message.replace(new RegExp(`^${escapeRegExp(levelToken)}:?\\s*`, "i"), "").replace(/\s{2,}/g, " ").trim();
  return {
    time: rawTime,
    level,
    message,
    prefix: levelToken,
    lineText: `${rawTime ? `${rawTime} ` : ""}${message}`.trim()
  };
}
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function remoteEntities(hass) {
  return Object.keys(hass?.states ?? {}).filter((id) => id.startsWith("remote."));
}
function entityForHub(hass, hub) {
  if (!hub) return null;
  return remoteEntities(hass).find((id) => hass?.states?.[id]?.attributes?.entry_id === hub.entry_id) ?? null;
}
function cacheGenerationSnapshot(hass) {
  const snapshot = {};
  for (const id of remoteEntities(hass)) {
    const attrs = hass?.states?.[id]?.attributes ?? {};
    const entryId = String(attrs.entry_id ?? "").trim();
    if (!entryId) continue;
    snapshot[entryId] = Number(attrs.cache_generation ?? 0);
  }
  return snapshot;
}
function didHubGenerationChange(previous, next) {
  const prev = previous ?? {};
  const curr = next ?? {};
  return Object.keys(curr).some(
    (entryId) => Object.prototype.hasOwnProperty.call(prev, entryId) && Number(curr[entryId] ?? 0) !== Number(prev[entryId] ?? 0)
  );
}
function hassFingerprint(hass) {
  return remoteEntities(hass).sort().map((id) => {
    const state = String(hass?.states?.[id]?.state ?? "");
    const attrs = hass?.states?.[id]?.attributes ?? {};
    return `${id};${attrs.entry_id ?? ""};${state};${attrs.proxy_client_connected ? "1" : "0"};${Number(attrs.cache_generation ?? 0)}`;
  }).join("||");
}
function connectionFingerprint(hass) {
  return remoteEntities(hass).sort().map((id) => {
    const state = String(hass?.states?.[id]?.state ?? "");
    const attrs = hass?.states?.[id]?.attributes ?? {};
    return `${id};${attrs.entry_id ?? ""};${state};${attrs.proxy_client_connected ? "1" : "0"}`;
  }).join("||");
}

// custom_components/sofabaton_x1s/www/src/state/control-panel-store.ts
var BACKEND_RETRY_MIN_MS = 2e3;
var BACKEND_RETRY_MAX_MS = 1e4;
var VIEW_STATE_STORAGE_KEY = "sofabaton_x1s:tools_card:view_state:v1";
var VALID_TABS = /* @__PURE__ */ new Set(["settings", "wifi_commands", "backup", "cache", "logs"]);
var REFRESH_ALL_KEY = "__refresh_all__";
var VALID_CACHE_SECTIONS = /* @__PURE__ */ new Set(["activities", "devices"]);
var VALID_BACKUP_SECTIONS = /* @__PURE__ */ new Set(["make", "edit", "restore"]);
function viewStateStorage() {
  try {
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch (_error) {
  }
  return null;
}
function readPersistedViewState() {
  const storage = viewStateStorage();
  if (!storage) return {};
  try {
    const parsed = JSON.parse(storage.getItem(VIEW_STATE_STORAGE_KEY) || "{}");
    const selectedHubEntryId = String(parsed?.selectedHubEntryId ?? "").trim() || null;
    const selectedTab = VALID_TABS.has(parsed?.selectedTab) ? parsed.selectedTab : void 0;
    const selectedCacheSection = VALID_CACHE_SECTIONS.has(parsed?.selectedCacheSection) ? parsed.selectedCacheSection : VALID_CACHE_SECTIONS.has(parsed?.openSection) ? parsed.openSection : "activities";
    const selectedBackupSection = VALID_BACKUP_SECTIONS.has(parsed?.selectedBackupSection) ? parsed.selectedBackupSection : VALID_BACKUP_SECTIONS.has(parsed?.openBackupSection) ? parsed.openBackupSection : "make";
    return {
      selectedHubEntryId,
      ...selectedTab ? { selectedTab } : {},
      selectedCacheSection,
      selectedBackupSection
    };
  } catch (_error) {
    return {};
  }
}
function normalizeLoadedFrontendVersion(value) {
  const version = String(value ?? "").trim();
  return version || "dev";
}
function normalizeExpectedFrontendVersion(value) {
  const version = String(value ?? "").trim();
  return version || null;
}
var INITIAL_SNAPSHOT = {
  hass: null,
  state: null,
  contents: null,
  toolsFrontendVersionLoaded: "dev",
  toolsFrontendVersionExpected: null,
  toolsFrontendVersionMismatch: false,
  loading: false,
  loadError: null,
  backendUnavailable: false,
  selectedHubEntryId: null,
  selectedTab: "cache",
  selectedCacheSection: "activities",
  selectedBackupSection: "make",
  openEntity: null,
  staleData: false,
  refreshBusyByHub: {},
  externalHubCommandByHub: {},
  runtimeCompletionNoticeByHub: {},
  pendingSettingKey: null,
  pendingActionKey: null,
  logsLines: [],
  logsError: null,
  logsLoading: false,
  logsLoadedEntryId: null,
  logsSubscribedEntryId: null,
  logsStickToBottom: true,
  logsScrollBehavior: "auto",
  pendingScrollEntityKey: null,
  lastWifiPress: null,
  wifiPressSubscribedEntryId: null,
  lastHubEvent: null,
  hubEventsSubscribedEntryId: null
};
var ControlPanelStore = class {
  constructor(onChange, options = {}) {
    this.onChange = onChange;
    this._snapshot = { ...INITIAL_SNAPSHOT };
    this._loadingStatePromise = null;
    this._pendingLiveStateRefresh = null;
    this._isConnected = false;
    this._refreshGraceUntil = 0;
    this._logsUnsub = null;
    this._logsLoadSeq = 0;
    this._logsSubscribeSeq = 0;
    this._lastObservedGenerations = cacheGenerationSnapshot(null);
    this._lastHassFingerprint = "";
    this._lastConnectionFingerprint = "";
    this._backendRetryTimer = null;
    this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
    this._backupOpUnsub = null;
    this._backupOpEntryId = null;
    this._backupOpId = null;
    this._runtimeStatePollTimer = null;
    this._runtimeCompletionTimers = /* @__PURE__ */ new Map();
    this._wifiPressUnsub = null;
    this._wifiPressSubscribeSeq = 0;
    this._hubEventsUnsub = null;
    this._hubEventsSubscribeSeq = 0;
    // Hub to pre-select when the card was created from a hub-specific entity (via
    // the card picker). Applied once when the hub becomes available; the user can
    // freely switch hubs afterwards.
    this._preferredHubEntryId = null;
    this._preferredHubApplied = false;
    this._loadedFrontendVersion = normalizeLoadedFrontendVersion(options.loadedFrontendVersion);
    this._snapshot = {
      ...INITIAL_SNAPSHOT,
      ...readPersistedViewState(),
      toolsFrontendVersionLoaded: this._loadedFrontendVersion
    };
  }
  get snapshot() {
    return this._snapshot;
  }
  connected() {
    this._isConnected = true;
    if (this._snapshot.hass && !this._snapshot.state && !this._loadingStatePromise) {
      void this.loadState();
    } else if (this._snapshot.backendUnavailable) {
      this._scheduleBackendRetry();
    }
    void this._syncBackupOperationFeed();
    void this._syncWifiPressFeed();
    void this._syncHubEventsFeed();
    this._scheduleRuntimeStatePoll();
    if (this._snapshot.selectedTab === "logs") {
      void this.syncLogsFeed();
    }
  }
  disconnected() {
    this._isConnected = false;
    this._snapshot = {
      ...this._snapshot,
      externalHubCommandByHub: {},
      runtimeCompletionNoticeByHub: {},
      lastWifiPress: null,
      lastHubEvent: null
    };
    this._clearRuntimeStatePoll();
    this._clearRuntimeCompletionTimers();
    this._clearBackendRetry();
    void this._teardownBackupOperationFeed();
    void this._teardownWifiPressFeed();
    void this._teardownHubEventsFeed();
    void this.unsubscribeLogs();
  }
  _clearBackendRetry() {
    if (this._backendRetryTimer) {
      clearTimeout(this._backendRetryTimer);
      this._backendRetryTimer = null;
    }
    this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
  }
  _clearRuntimeCompletionTimers(entryId) {
    if (entryId !== void 0) {
      const timer = this._runtimeCompletionTimers.get(entryId);
      if (timer) clearTimeout(timer);
      this._runtimeCompletionTimers.delete(entryId);
      return;
    }
    for (const timer of this._runtimeCompletionTimers.values()) clearTimeout(timer);
    this._runtimeCompletionTimers.clear();
  }
  _clearRuntimeStatePoll() {
    if (this._runtimeStatePollTimer) {
      clearTimeout(this._runtimeStatePollTimer);
      this._runtimeStatePollTimer = null;
    }
  }
  _scheduleRuntimeStatePoll() {
    this._clearRuntimeStatePoll();
    if (!this._isConnected) return;
    const hub = selectedHub(this._snapshot);
    const isRunning = hub?.runtime_state?.kind === "operation_running";
    const interval = isRunning ? 1e3 : 5e3;
    this._runtimeStatePollTimer = setTimeout(() => {
      this._runtimeStatePollTimer = null;
      void this._refreshRuntimeState();
    }, interval);
  }
  async _refreshRuntimeState() {
    if (!this._isConnected) return;
    try {
      await this.loadControlPanelState();
    } catch {
      this._scheduleRuntimeStatePoll();
      return;
    }
    this._scheduleRuntimeStatePoll();
  }
  _scheduleBackendRetry() {
    if (!this._isConnected) return;
    if (this._backendRetryTimer) return;
    const delay = this._backendRetryDelay;
    this._backendRetryDelay = Math.min(BACKEND_RETRY_MAX_MS, Math.round(delay * 1.5));
    this._backendRetryTimer = setTimeout(() => {
      this._backendRetryTimer = null;
      if (!this._isConnected || !this._snapshot.backendUnavailable) return;
      void this.loadState({ silent: true });
    }, delay);
  }
  _markBackendUnavailable() {
    const wasUnavailable = this._snapshot.backendUnavailable;
    this._snapshot = {
      ...this._snapshot,
      backendUnavailable: true,
      loadError: null,
      logsError: null
    };
    if (!wasUnavailable) this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
    this._scheduleBackendRetry();
  }
  _clearBackendUnavailable() {
    if (!this._snapshot.backendUnavailable) return;
    this._snapshot = { ...this._snapshot, backendUnavailable: false };
    this._clearBackendRetry();
  }
  setHass(hass) {
    const previousHass = this._snapshot.hass;
    this._snapshot = { ...this._snapshot, hass };
    const fingerprint = hassFingerprint(hass);
    const nextConnectionFingerprint = connectionFingerprint(hass);
    const generationSnapshot = cacheGenerationSnapshot(hass);
    if (!previousHass) {
      this._lastObservedGenerations = generationSnapshot;
      this._lastHassFingerprint = fingerprint;
      this._lastConnectionFingerprint = nextConnectionFingerprint;
      this.emit();
      return;
    }
    if (fingerprint !== this._lastHassFingerprint) {
      const connectionChanged = nextConnectionFingerprint !== this._lastConnectionFingerprint;
      if (this._isConnected && !this._isAnyHubCommandBusy() && !this._snapshot.loading && Date.now() > this._refreshGraceUntil && didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)) {
        this._snapshot = { ...this._snapshot, staleData: true };
      }
      this._lastObservedGenerations = generationSnapshot;
      this._lastHassFingerprint = fingerprint;
      this._lastConnectionFingerprint = nextConnectionFingerprint;
      if (this._isConnected && connectionChanged && !this._snapshot.loading && !this._loadingStatePromise && !this._pendingLiveStateRefresh) {
        this._pendingLiveStateRefresh = this.loadControlPanelState().catch(() => void 0).finally(() => {
          this._pendingLiveStateRefresh = null;
          if (this._isConnected) this.emit();
        });
      }
      this.emit();
    }
  }
  selectHub(entryId) {
    this._snapshot = {
      ...this._snapshot,
      selectedHubEntryId: entryId,
      openEntity: null,
      logsLoadedEntryId: null,
      logsLines: [],
      logsError: null,
      logsStickToBottom: true,
      logsScrollBehavior: "auto",
      lastWifiPress: null,
      lastHubEvent: null
    };
    this.persistViewState();
    this.emit();
    void (async () => {
      await this._teardownBackupOperationFeed();
      await this._teardownWifiPressFeed();
      await this._teardownHubEventsFeed();
      await this.unsubscribeLogs();
      await this.loadControlPanelState();
      await this._syncBackupOperationFeed();
      await this._syncWifiPressFeed();
      await this._syncHubEventsFeed();
      if (this._snapshot.selectedTab === "logs") await this.syncLogsFeed();
    })();
  }
  /**
   * Pre-select a hub by config-entry id (e.g. when the card was instantiated
   * from a hub-specific entity). Applied once when the hub is available; the
   * user can still switch hubs afterwards. Passing null clears the preference.
   */
  setPreferredHub(entryId) {
    const next = String(entryId ?? "").trim() || null;
    this._preferredHubEntryId = next;
    this._preferredHubApplied = false;
    if (!next) return;
    const hubs = this._snapshot.state?.hubs ?? [];
    if (hubs.some((hub) => hub.entry_id === next)) {
      this._preferredHubApplied = true;
      if (this._snapshot.selectedHubEntryId !== next) this.selectHub(next);
    }
  }
  selectTab(tabId) {
    this._snapshot = {
      ...this._snapshot,
      selectedTab: tabId,
      logsStickToBottom: tabId === "logs" ? true : this._snapshot.logsStickToBottom,
      logsScrollBehavior: tabId === "logs" ? "auto" : this._snapshot.logsScrollBehavior
    };
    this.persistViewState();
    if (tabId === "logs") void this.syncLogsFeed();
    else void this.unsubscribeLogs();
    this.emit();
  }
  selectCacheSection(sectionId) {
    if (this._snapshot.selectedCacheSection === sectionId && this._snapshot.openEntity === null) return;
    this._snapshot = {
      ...this._snapshot,
      selectedCacheSection: sectionId,
      openEntity: null
    };
    this.persistViewState();
    this.emit();
  }
  setSelectedBackupSection(sectionId) {
    if (this._snapshot.selectedBackupSection === sectionId) return;
    this._snapshot = { ...this._snapshot, selectedBackupSection: sectionId };
    this.persistViewState();
    this.emit();
  }
  toggleEntity(key) {
    const opening = this._snapshot.openEntity !== key;
    this._snapshot = {
      ...this._snapshot,
      openEntity: opening ? key : null,
      pendingScrollEntityKey: opening ? key : null
    };
    this.emit();
  }
  clearPendingScrollEntityKey() {
    if (!this._snapshot.pendingScrollEntityKey) return;
    this._snapshot = { ...this._snapshot, pendingScrollEntityKey: null };
  }
  /**
   * Busy state is stored per hub: callers whose operation may outlive the
   * current hub selection (tab subscriptions, async finallys) pass the
   * entry_id captured when the operation started so a late clear/set can
   * never touch another hub's state. Without an entry_id the currently
   * selected hub is used.
   */
  setExternalHubCommandBusy(busy, label = null, entryId) {
    const key = String(entryId ?? selectedHub(this._snapshot)?.entry_id ?? "").trim();
    if (!key) return;
    const byHub = { ...this._snapshot.externalHubCommandByHub };
    if (busy) byHub[key] = String(label || "").trim() || "Hub command in progress\u2026";
    else delete byHub[key];
    this._snapshot = {
      ...this._snapshot,
      externalHubCommandByHub: byHub
    };
    this.emit();
  }
  showRuntimeCompletion(notice, entryId, ttlMs = 6e3) {
    const key = String(entryId ?? selectedHub(this._snapshot)?.entry_id ?? "").trim();
    if (!key) return;
    this._clearRuntimeCompletionTimers(key);
    const byHub = { ...this._snapshot.runtimeCompletionNoticeByHub };
    if (notice) byHub[key] = notice;
    else delete byHub[key];
    this._snapshot = {
      ...this._snapshot,
      runtimeCompletionNoticeByHub: byHub
    };
    this.emit();
    if (!notice) return;
    this._runtimeCompletionTimers.set(key, setTimeout(() => {
      this._runtimeCompletionTimers.delete(key);
      if (!(key in this._snapshot.runtimeCompletionNoticeByHub)) return;
      const next = { ...this._snapshot.runtimeCompletionNoticeByHub };
      delete next[key];
      this._snapshot = {
        ...this._snapshot,
        runtimeCompletionNoticeByHub: next
      };
      this.emit();
    }, ttlMs));
  }
  async loadState(options = {}) {
    if (this._loadingStatePromise) return this._loadingStatePromise;
    const silent = !!options.silent;
    if (!silent) {
      this._snapshot = { ...this._snapshot, loading: true, loadError: null };
      this.emit();
    }
    const api = this.api();
    this._loadingStatePromise = (async () => {
      try {
        const [state, contents] = await Promise.all([api.loadState(), api.loadCacheContents()]);
        this.applyControlPanelState(state);
        this._snapshot = { ...this._snapshot, contents };
        this.syncSelection();
        this._clearBackendUnavailable();
        await this._syncBackupOperationFeed();
        await this._syncWifiPressFeed();
        await this._syncHubEventsFeed();
      } catch (error) {
        if (isBackendUnavailableError(error, this._snapshot.hass)) {
          this._markBackendUnavailable();
        } else {
          this._snapshot = { ...this._snapshot, loadError: formatError(error), backendUnavailable: false };
          this._clearBackendRetry();
        }
      } finally {
        this._loadingStatePromise = null;
        this._snapshot = { ...this._snapshot, loading: false, staleData: false };
        this._refreshGraceUntil = Date.now() + 1e4;
        this.emit();
        if (this._snapshot.selectedTab === "logs") void this.syncLogsFeed();
      }
    })();
    return this._loadingStatePromise;
  }
  async loadControlPanelState() {
    try {
      const state = await this.api().loadState();
      this.applyControlPanelState(state);
      this.syncSelection();
      this._clearBackendUnavailable();
      await this._syncBackupOperationFeed();
      await this._syncWifiPressFeed();
      await this._syncHubEventsFeed();
      this.emit();
    } catch (error) {
      if (isBackendUnavailableError(error, this._snapshot.hass)) {
        this._markBackendUnavailable();
        this.emit();
        return;
      }
      throw error;
    }
  }
  async loadCacheContents() {
    const contents = await this.api().loadCacheContents();
    this._snapshot = { ...this._snapshot, contents };
    this.emit();
  }
  async setSetting(setting, enabled) {
    const hub = selectedHub(this._snapshot);
    if (!hub || this._snapshot.pendingSettingKey || this._snapshot.pendingActionKey) return;
    const previousPersistentCacheEnabled = persistentCacheEnabled(this._snapshot);
    this._snapshot = { ...this._snapshot, pendingSettingKey: setting };
    this.applyOptimisticSetting(setting, enabled);
    try {
      await this.api().setSetting(hub.entry_id, setting, enabled);
      if (setting === "persistent_cache") {
        if (enabled) await this.loadCacheContents();
        else await this.loadControlPanelState();
      } else {
        await this.loadControlPanelState();
      }
    } catch (_error) {
      this.applyOptimisticSetting(
        setting,
        setting === "persistent_cache" ? previousPersistentCacheEnabled : !enabled
      );
    } finally {
      this._snapshot = { ...this._snapshot, pendingSettingKey: null };
      this.emit();
    }
  }
  async runAction(action) {
    const hub = selectedHub(this._snapshot);
    if (!hub || this._snapshot.pendingSettingKey || this._snapshot.pendingActionKey) return;
    this._snapshot = { ...this._snapshot, pendingActionKey: action };
    try {
      await this.api().runAction(hub.entry_id, action);
      await this.loadControlPanelState();
    } finally {
      this._snapshot = { ...this._snapshot, pendingActionKey: null };
      this.emit();
    }
  }
  async refreshStale() {
    this._snapshot = { ...this._snapshot, staleData: false };
    this.emit();
    await this.loadState();
  }
  _setRefreshBusy(entryId, label) {
    this._snapshot = {
      ...this._snapshot,
      refreshBusyByHub: { ...this._snapshot.refreshBusyByHub, [entryId]: label }
    };
    this.emit();
  }
  _clearRefreshBusy(entryId) {
    const byHub = { ...this._snapshot.refreshBusyByHub };
    delete byHub[entryId];
    this._snapshot = { ...this._snapshot, refreshBusyByHub: byHub, staleData: false };
    this.emit();
  }
  async refreshSection(sectionId) {
    if (this._isHubCommandBusy()) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    this._setRefreshBusy(hub.entry_id, null);
    try {
      await this.api().refreshCatalog(hub.entry_id, sectionId);
      await this.loadState({ silent: true });
    } finally {
      this._clearRefreshBusy(hub.entry_id);
    }
  }
  /**
   * Whole-hub structural cache refresh ("Refresh all" in the Hub tab).
   * Starts the backend cache_refresh operation and follows its progress;
   * running state and phase messages surface through the bottom dock
   * (hub.runtime_state), so the button itself only spins.
   *
   * Resolves with `null` on success or a failure message — the same one shown
   * in the dock — so embedded starters (the Activities tab's refresh button)
   * can react to the outcome.
   */
  async refreshAllForHub() {
    if (this._isHubCommandBusy()) return "Another hub operation is already running.";
    const hub = selectedHub(this._snapshot);
    if (!hub) return "No hub selected.";
    this._setRefreshBusy(hub.entry_id, REFRESH_ALL_KEY);
    let unsubscribe = null;
    try {
      const start = await this.api().startCacheRefresh(hub.entry_id);
      void this.loadControlPanelState().catch(() => void 0);
      const failure = await new Promise((resolve) => {
        this.api().subscribeBackupProgress(start.operation_id, (payload) => {
          if (payload.status === "success") resolve(null);
          else if (payload.status === "failed") {
            resolve(String(payload.error || payload.message || "Cache refresh failed."));
          }
        }).then((unsub) => {
          unsubscribe = unsub;
        }).catch((error) => resolve(formatError(error)));
      });
      this.showRuntimeCompletion(
        failure ? { tone: "error", label: failure } : { tone: "success", label: "Hub cache refreshed." },
        hub.entry_id
      );
      await this.loadState({ silent: true });
      return failure;
    } catch (error) {
      const failure = formatError(error);
      this.showRuntimeCompletion({ tone: "error", label: failure }, hub.entry_id);
      return failure;
    } finally {
      if (unsubscribe) {
        try {
          unsubscribe();
        } catch {
        }
      }
      this._clearRefreshBusy(hub.entry_id);
    }
  }
  /**
   * Immediate live write of the hub's stored activity display order.
   * ``orderedIds`` is the full activity id list in the desired order.
   * Resolves with `null` on success or a failure message for the caller's UI.
   */
  async reorderActivities(orderedIds) {
    if (this._isHubCommandBusy()) return "Another hub operation is already running.";
    const hub = selectedHub(this._snapshot);
    if (!hub) return "No hub selected.";
    this.setExternalHubCommandBusy(true, "Reordering activities\u2026", hub.entry_id);
    try {
      await this.api().reorderActivities(hub.entry_id, orderedIds.map((id) => Number(id)));
    } catch (error) {
      return formatError(error);
    } finally {
      this.setExternalHubCommandBusy(false, null, hub.entry_id);
    }
    await this.loadState({ silent: true });
    return null;
  }
  /**
   * Immediate live write of the hub's stored device display order.
   * ``orderedIds`` is the full device id list in the desired order.
   * Resolves with `null` on success or a failure message for the caller's UI.
   */
  async reorderDevices(orderedIds) {
    if (this._isHubCommandBusy()) return "Another hub operation is already running.";
    const hub = selectedHub(this._snapshot);
    if (!hub) return "No hub selected.";
    this.setExternalHubCommandBusy(true, "Reordering devices\u2026", hub.entry_id);
    try {
      await this.api().reorderDevices(hub.entry_id, orderedIds.map((id) => Number(id)));
    } catch (error) {
      return formatError(error);
    } finally {
      this.setExternalHubCommandBusy(false, null, hub.entry_id);
    }
    await this.loadState({ silent: true });
    return null;
  }
  /**
   * Create a fresh, empty activity on the hub, then pull its cache entry so
   * the live editor can capture it right away. Resolves with the assigned
   * activity id or an error message.
   */
  async createActivity(name) {
    if (this._isHubCommandBusy()) return { error: "Another hub operation is already running." };
    const hub = selectedHub(this._snapshot);
    if (!hub) return { error: "No hub selected." };
    this.setExternalHubCommandBusy(true, "Creating activity\u2026", hub.entry_id);
    let activityId = 0;
    try {
      const result = await this.api().createActivity(hub.entry_id, name);
      activityId = Number(result?.activity_id || 0);
      if (!activityId) return { error: "The hub did not return the new activity id." };
    } catch (error) {
      return { error: formatError(error) };
    } finally {
      this.setExternalHubCommandBusy(false, null, hub.entry_id);
    }
    await this.refreshForHub("activity", activityId, `act-${activityId}`);
    return { activityId };
  }
  async refreshForHub(kind, targetId, key) {
    if (this._isHubCommandBusy()) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    this._setRefreshBusy(hub.entry_id, key);
    try {
      await this.api().refreshCacheEntry({
        hubEntryId: hub.entry_id,
        entityId: entityForHub(this._snapshot.hass, hub),
        kind,
        targetId
      });
      await this.loadState({ silent: true });
    } finally {
      if (this._snapshot.selectedHubEntryId === hub.entry_id) {
        this._snapshot = { ...this._snapshot, pendingScrollEntityKey: key };
      }
      this._clearRefreshBusy(hub.entry_id);
    }
  }
  async syncLogsFeed() {
    const hub = selectedHub(this._snapshot);
    if (!this._isConnected || this._snapshot.selectedTab !== "logs" || !hub) {
      await this.unsubscribeLogs();
      return;
    }
    const entryId = hub.entry_id;
    if (this._snapshot.logsLoadedEntryId !== entryId && !this._snapshot.logsLoading) {
      this._snapshot = { ...this._snapshot, logsStickToBottom: true };
      this.emit();
      void this.loadHubLogs(entryId);
    }
    if (this._snapshot.logsSubscribedEntryId === entryId) return;
    await this.unsubscribeLogs();
    const subscribeSeq = ++this._logsSubscribeSeq;
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: entryId };
    this.emit();
    try {
      const unsubscribe = await this.api().subscribeLogs(entryId, (payload) => {
        if (subscribeSeq !== this._logsSubscribeSeq) return;
        if (this._snapshot.logsSubscribedEntryId !== entryId) return;
        this.handleHubLogMessage(entryId, payload);
      });
      if (subscribeSeq !== this._logsSubscribeSeq) {
        try {
          unsubscribe();
        } catch {
        }
        return;
      }
      this._logsUnsub = unsubscribe;
      await this.loadHubLogs(entryId, { preserveLines: true });
    } catch (error) {
      if (subscribeSeq !== this._logsSubscribeSeq) return;
      if (isBackendUnavailableError(error, this._snapshot.hass)) {
        this._snapshot = { ...this._snapshot, logsSubscribedEntryId: null };
        this._markBackendUnavailable();
        this.emit();
        return;
      }
      this._snapshot = {
        ...this._snapshot,
        logsError: formatError(error),
        logsSubscribedEntryId: null
      };
      this.emit();
    }
  }
  onLogsScrolled(metrics) {
    const maxScrollTop = Math.max(0, metrics.scrollHeight - metrics.clientHeight);
    this._snapshot = {
      ...this._snapshot,
      logsStickToBottom: maxScrollTop - metrics.top <= 8
    };
  }
  async loadHubLogs(entryId, options = {}) {
    const seq = ++this._logsLoadSeq;
    this._snapshot = {
      ...this._snapshot,
      logsLoading: true,
      logsError: null,
      logsScrollBehavior: "auto",
      logsLines: options.preserveLines ? this._snapshot.logsLines : []
    };
    this.emit();
    try {
      const result = await this.api().getLogs(entryId);
      if (seq !== this._logsLoadSeq) return;
      this._snapshot = {
        ...this._snapshot,
        logsLines: Array.isArray(result?.lines) ? result.lines : [],
        logsLoadedEntryId: entryId
      };
    } catch (error) {
      if (seq !== this._logsLoadSeq) return;
      if (isBackendUnavailableError(error, this._snapshot.hass)) {
        this._snapshot = { ...this._snapshot, logsLoadedEntryId: entryId };
        this._markBackendUnavailable();
      } else {
        this._snapshot = {
          ...this._snapshot,
          logsError: formatError(error),
          logsLoadedEntryId: entryId
        };
      }
    } finally {
      if (seq !== this._logsLoadSeq) return;
      this._snapshot = { ...this._snapshot, logsLoading: false };
      this.emit();
    }
  }
  handleHubLogMessage(entryId, payload) {
    if (!this._isConnected || this._snapshot.selectedTab !== "logs") return;
    const message = payload;
    const line = {
      ts: String(message.ts ?? ""),
      time: String(message.time ?? ""),
      timestamp: String(message.timestamp ?? ""),
      level: String(message.level ?? "log"),
      message: String(message.message ?? message.msg ?? ""),
      msg: String(message.msg ?? ""),
      line: String(message.line ?? message.message ?? message.msg ?? ""),
      logger: String(message.logger ?? ""),
      entry_id: String(message.entry_id ?? "")
    };
    const _formatted = formatLogEntry(line);
    this._snapshot = {
      ...this._snapshot,
      logsError: null,
      logsLoadedEntryId: entryId,
      logsLines: [...this._snapshot.logsLines, line].slice(-400)
    };
    void _formatted;
    this.emit();
  }
  async unsubscribeLogs() {
    this._logsSubscribeSeq++;
    const unsub = this._logsUnsub;
    this._logsUnsub = null;
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: null };
    if (!unsub) return;
    try {
      await unsub();
    } catch {
    }
  }
  applyControlPanelState(state) {
    const previousHub = selectedHub(this._snapshot);
    const previousRuntime = previousHub?.runtime_state;
    const expectedVersion = normalizeExpectedFrontendVersion(state?.tools_frontend_version);
    this._snapshot = {
      ...this._snapshot,
      state,
      loadError: null,
      toolsFrontendVersionExpected: expectedVersion,
      toolsFrontendVersionMismatch: expectedVersion !== null && expectedVersion !== this._loadedFrontendVersion
    };
    const nextHub = selectedHub(this._snapshot);
    const nextRuntime = nextHub?.runtime_state;
    if (previousRuntime?.kind === "operation_running" && nextRuntime?.kind !== "operation_running" && previousRuntime.operation !== "cache_refresh") {
      const operation = previousRuntime.operation;
      const successLabel = operation === "backup_restore" ? "Restore completed successfully." : operation === "backup_export" ? "Backup completed successfully." : operation === "entity_sync" ? "Synced to hub." : "Wifi Device deployed successfully.";
      this.showRuntimeCompletion(
        {
          tone: "success",
          label: successLabel
        },
        nextHub?.entry_id ?? previousHub?.entry_id ?? null
      );
    }
    this._scheduleRuntimeStatePoll();
  }
  applyOptimisticSetting(setting, enabled) {
    if (!this._snapshot.state) return;
    const hub = selectedHub(this._snapshot);
    if (!hub) return;
    if (setting === "persistent_cache") {
      this._snapshot = {
        ...this._snapshot,
        state: {
          ...this._snapshot.state,
          persistent_cache_enabled: enabled,
          hubs: this._snapshot.state.hubs.map((item) => ({
            ...item,
            persistent_cache_enabled: enabled
          }))
        }
      };
      return;
    }
    const hubs = this._snapshot.state.hubs.map(
      (item) => item.entry_id === hub.entry_id ? {
        ...item,
        settings: {
          ...item.settings ?? {},
          [setting]: enabled
        }
      } : item
    );
    this._snapshot = {
      ...this._snapshot,
      state: {
        ...this._snapshot.state,
        hubs
      }
    };
  }
  syncSelection() {
    const hubs = this._snapshot.state?.hubs ?? [];
    if (!hubs.length) {
      this._snapshot = { ...this._snapshot, selectedHubEntryId: null };
      this.persistViewState();
      return;
    }
    if (!this._preferredHubApplied && this._preferredHubEntryId && hubs.some((hub) => hub.entry_id === this._preferredHubEntryId)) {
      this._preferredHubApplied = true;
      this._snapshot = { ...this._snapshot, selectedHubEntryId: this._preferredHubEntryId };
      this.persistViewState();
      return;
    }
    if (!hubs.some((hub) => hub.entry_id === this._snapshot.selectedHubEntryId)) {
      this._snapshot = { ...this._snapshot, selectedHubEntryId: hubs[0].entry_id };
    }
    this.persistViewState();
  }
  api() {
    if (!this._snapshot.hass) throw new Error("Home Assistant context is unavailable");
    return new ControlPanelApi(this._snapshot.hass);
  }
  persistViewState() {
    const storage = viewStateStorage();
    if (!storage) return;
    try {
      storage.setItem(
        VIEW_STATE_STORAGE_KEY,
        JSON.stringify({
          selectedHubEntryId: this._snapshot.selectedHubEntryId,
          selectedTab: this._snapshot.selectedTab,
          selectedCacheSection: this._snapshot.selectedCacheSection,
          selectedBackupSection: this._snapshot.selectedBackupSection
        })
      );
    } catch (_error) {
    }
  }
  _isHubCommandBusy() {
    const hub = selectedHub(this._snapshot);
    const entryId = hub?.entry_id ?? null;
    const activeBackupOperation = hub?.active_backup_operation;
    const backupBusy = !!activeBackupOperation && ["pending", "running"].includes(String(activeBackupOperation.status || ""));
    return Boolean(
      entryId && entryId in this._snapshot.refreshBusyByHub || entryId && entryId in this._snapshot.externalHubCommandByHub || this._snapshot.pendingActionKey || backupBusy
    );
  }
  /** Busy on ANY hub — used to suppress the stale-data banner while one of
   * our own operations is bumping cache generations in the background. */
  _isAnyHubCommandBusy() {
    const backupBusy = (this._snapshot.state?.hubs ?? []).some(
      (hub) => !!hub.active_backup_operation && ["pending", "running"].includes(String(hub.active_backup_operation.status || ""))
    );
    return Boolean(
      Object.keys(this._snapshot.refreshBusyByHub).length || Object.keys(this._snapshot.externalHubCommandByHub).length || this._snapshot.pendingActionKey || backupBusy
    );
  }
  async _syncBackupOperationFeed() {
    const hub = selectedHub(this._snapshot);
    const active = hub?.active_backup_operation;
    const entryId = String(hub?.entry_id || "").trim() || null;
    const operationId = active && ["pending", "running"].includes(String(active.status || "")) ? String(active.operation_id || "").trim() || null : null;
    if (!this._isConnected || !entryId || !operationId || !this._snapshot.hass) {
      await this._teardownBackupOperationFeed();
      return;
    }
    if (this._backupOpEntryId === entryId && this._backupOpId === operationId && this._backupOpUnsub) {
      return;
    }
    await this._teardownBackupOperationFeed();
    this._backupOpEntryId = entryId;
    this._backupOpId = operationId;
    try {
      const unsubscribe = await this.api().subscribeBackupProgress(operationId, (payload) => {
        if (this._backupOpId !== operationId || this._backupOpEntryId !== entryId) return;
        this._applyBackupProgressToSnapshot(entryId, payload);
        if (!["pending", "running"].includes(String(payload.status || ""))) {
          void this._teardownBackupOperationFeed();
        }
      });
      if (this._backupOpId !== operationId || this._backupOpEntryId !== entryId) {
        try {
          unsubscribe();
        } catch {
        }
        return;
      }
      this._backupOpUnsub = unsubscribe;
    } catch {
      this._backupOpEntryId = null;
      this._backupOpId = null;
      this._backupOpUnsub = null;
    }
  }
  _applyBackupProgressToSnapshot(entryId, payload) {
    if (!this._snapshot.state) return;
    const isRunning = ["pending", "running"].includes(String(payload.status || ""));
    const hubs = this._snapshot.state.hubs.map(
      (hub) => hub.entry_id === entryId ? {
        ...hub,
        active_backup_operation: isRunning ? payload : null
      } : hub
    );
    this._snapshot = {
      ...this._snapshot,
      state: {
        ...this._snapshot.state,
        hubs
      }
    };
    this.emit();
  }
  async _teardownBackupOperationFeed() {
    const unsub = this._backupOpUnsub;
    this._backupOpUnsub = null;
    this._backupOpEntryId = null;
    this._backupOpId = null;
    if (!unsub) return;
    try {
      await unsub();
    } catch {
    }
  }
  async _syncWifiPressFeed() {
    const hub = selectedHub(this._snapshot);
    const entryId = String(hub?.entry_id || "").trim() || null;
    if (!this._isConnected || !entryId || !this._snapshot.hass) {
      await this._teardownWifiPressFeed();
      return;
    }
    if (this._snapshot.wifiPressSubscribedEntryId === entryId && this._wifiPressUnsub) {
      return;
    }
    await this._teardownWifiPressFeed();
    const subscribeSeq = ++this._wifiPressSubscribeSeq;
    this._snapshot = { ...this._snapshot, wifiPressSubscribedEntryId: entryId };
    try {
      const unsubscribe = await this.api().subscribeWifiPresses(entryId, (payload) => {
        if (subscribeSeq !== this._wifiPressSubscribeSeq) return;
        if (this._snapshot.wifiPressSubscribedEntryId !== entryId) return;
        this._handleWifiPressMessage(entryId, payload);
      });
      if (subscribeSeq !== this._wifiPressSubscribeSeq) {
        try {
          unsubscribe();
        } catch {
        }
        return;
      }
      this._wifiPressUnsub = unsubscribe;
    } catch {
      if (subscribeSeq === this._wifiPressSubscribeSeq) {
        this._snapshot = { ...this._snapshot, wifiPressSubscribedEntryId: null };
      }
    }
  }
  _handleWifiPressMessage(entryId, payload) {
    const message = payload && typeof payload === "object" ? payload : null;
    if (!message) return;
    const timestamp = Number(message.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const pressType = message.press_type === "long" ? "long" : "short";
    const commandIndex = typeof message.command_index === "number" && message.command_index >= 0 ? Math.trunc(message.command_index) : null;
    const event = {
      entryId,
      deviceId: typeof message.device_id === "number" ? message.device_id : null,
      deviceName: typeof message.device_name === "string" && message.device_name.trim() ? String(message.device_name) : null,
      commandIndex,
      commandLabel: typeof message.command_label === "string" ? String(message.command_label) : "",
      pressType,
      timestamp,
      // The server timestamp drives identity (so a card reopened mid-pulse
      // doesn't re-trigger); receivedAt drives the animation epoch so the
      // dock pulse restarts cleanly on every fresh press, even repeats.
      receivedAt: Date.now()
    };
    this._snapshot = { ...this._snapshot, lastWifiPress: event };
    this.emit();
  }
  async _teardownWifiPressFeed() {
    this._wifiPressSubscribeSeq++;
    const unsub = this._wifiPressUnsub;
    this._wifiPressUnsub = null;
    this._snapshot = { ...this._snapshot, wifiPressSubscribedEntryId: null };
    if (!unsub) return;
    try {
      await unsub();
    } catch {
    }
  }
  async _syncHubEventsFeed() {
    const hub = selectedHub(this._snapshot);
    const entryId = String(hub?.entry_id || "").trim() || null;
    if (!this._isConnected || !entryId || !this._snapshot.hass) {
      await this._teardownHubEventsFeed();
      return;
    }
    if (this._snapshot.hubEventsSubscribedEntryId === entryId && this._hubEventsUnsub) {
      return;
    }
    await this._teardownHubEventsFeed();
    const subscribeSeq = ++this._hubEventsSubscribeSeq;
    this._snapshot = { ...this._snapshot, hubEventsSubscribedEntryId: entryId };
    try {
      const unsubscribe = await this.api().subscribeHubEvents(entryId, (payload) => {
        if (subscribeSeq !== this._hubEventsSubscribeSeq) return;
        if (this._snapshot.hubEventsSubscribedEntryId !== entryId) return;
        this._handleHubEventMessage(entryId, payload);
      });
      if (subscribeSeq !== this._hubEventsSubscribeSeq) {
        try {
          unsubscribe();
        } catch {
        }
        return;
      }
      this._hubEventsUnsub = unsubscribe;
    } catch {
      if (subscribeSeq === this._hubEventsSubscribeSeq) {
        this._snapshot = { ...this._snapshot, hubEventsSubscribedEntryId: null };
      }
    }
  }
  _handleHubEventMessage(entryId, payload) {
    const message = payload && typeof payload === "object" ? payload : null;
    if (!message) return;
    const timestamp = Number(message.timestamp);
    if (!Number.isFinite(timestamp)) return;
    const type = message.type === "redundant_off" ? "redundant_off" : message.type === "activity_change" ? "activity_change" : null;
    if (!type) return;
    const activityId = (value) => typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : null;
    const event = {
      entryId,
      type,
      fromActivityId: activityId(message.from_activity_id),
      toActivityId: activityId(message.to_activity_id),
      timestamp,
      // Same split as wifi presses: the server timestamp is identity, the
      // local receipt time drives the glow animation epoch.
      receivedAt: Date.now()
    };
    this._snapshot = { ...this._snapshot, lastHubEvent: event };
    this.emit();
  }
  async _teardownHubEventsFeed() {
    this._hubEventsSubscribeSeq++;
    const unsub = this._hubEventsUnsub;
    this._hubEventsUnsub = null;
    this._snapshot = { ...this._snapshot, hubEventsSubscribedEntryId: null };
    if (!unsub) return;
    try {
      await unsub();
    } catch {
    }
  }
  emit() {
    this.onChange(this._snapshot);
  }
};

// tests/frontend/activity-reorder.test.ts
setMaxListeners(0);
var baseState = {
  persistent_cache_enabled: true,
  tools_frontend_version: "dev",
  hubs: [
    {
      entry_id: "hub-1",
      name: "Living Room",
      activity_count: 3,
      device_count: 1,
      settings: {
        proxy_enabled: false,
        hex_logging_enabled: false,
        wifi_device_enabled: false
      }
    }
  ]
};
var baseContents = {
  enabled: true,
  hubs: [
    {
      entry_id: "hub-1",
      name: "Living Room",
      activities: [
        { id: 101, name: "Watch TV" },
        { id: 102, name: "Play Xbox" },
        { id: 103, name: "Listen Music" }
      ],
      devices_list: []
    }
  ]
};
var MemoryStorage = class {
  constructor() {
    this.values = /* @__PURE__ */ new Map();
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) ?? null : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
  }
  removeItem(key) {
    this.values.delete(key);
  }
  clear() {
    this.values.clear();
  }
};
var originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
var originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
var liveStores = [];
beforeEach(() => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: { localStorage: storage } });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, writable: true, value: storage });
});
afterEach(() => {
  while (liveStores.length) {
    const store = liveStores.pop();
    try {
      store?.disconnected();
    } catch {
    }
  }
  for (const [name, descriptor] of [
    ["window", originalWindowDescriptor],
    ["localStorage", originalLocalStorageDescriptor]
  ]) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
});
function createHass(handlers = {}) {
  return {
    states: {},
    async callWS(message) {
      const type = String(message.type ?? "");
      const handler = handlers[type];
      if (handler) return await handler(message);
      if (type === "sofabaton_x1s/control_panel/state") return baseState;
      if (type === "sofabaton_x1s/persistent_cache/contents") return baseContents;
      return { ok: true };
    },
    connection: null
  };
}
function createStore() {
  const store = new ControlPanelStore(() => void 0, { loadedFrontendVersion: "dev" });
  liveStores.push(store);
  return store;
}
test("hubActivities follows the hub's stored sort order, zeros last by id", () => {
  const hub = {
    entry_id: "hub-1",
    activities: [
      { id: 101, name: "Watch TV", sort: 3 },
      { id: 102, name: "Play Xbox", sort: 1 },
      { id: 103, name: "Listen Music", sort: 2 },
      { id: 105, name: "New Later" },
      { id: 104, name: "New Earlier", sort: 0 }
    ]
  };
  assert.deepEqual(
    hubActivities(hub).map((activity) => activity.id),
    [102, 103, 101, 104, 105]
  );
});
test("hubActivities keeps id order when the hub never stored an order", () => {
  const hub = {
    entry_id: "hub-1",
    activities: [
      { id: 103, name: "C", sort: 0 },
      { id: 101, name: "A", sort: 0 },
      { id: 102, name: "B" }
    ]
  };
  assert.deepEqual(
    hubActivities(hub).map((activity) => activity.id),
    [101, 102, 103]
  );
});
test("hubDevices follows the hub's stored sort order, ties and zeros by id", () => {
  const hub = {
    entry_id: "hub-1",
    devices_list: [
      { id: 8, name: "testing", sort: 13 },
      { id: 10, name: "Lights", sort: 8 },
      { id: 9, name: "Sonytst", sort: 8 },
      { id: 2, name: "Philips hue", sort: 2 },
      { id: 1, name: "AWOLVision", sort: 1 },
      { id: 3, name: "Zebra", sort: 0 }
    ]
  };
  assert.deepEqual(
    hubDevices(hub).map((device) => device.id),
    [1, 2, 9, 10, 8, 3]
  );
});
test("reorderActivities sends the full ordered id list and reloads state", async () => {
  const calls = [];
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/reorder": (message) => {
        calls.push(message);
        return { status: "success", ordered_ids: message.ordered_ids };
      }
    })
  );
  await store.loadState();
  const failure = await store.reorderActivities([103, 101, 102]);
  assert.equal(failure, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entry_id, "hub-1");
  assert.deepEqual(calls[0].ordered_ids, [103, 101, 102]);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
test("reorderActivities surfaces the backend failure message", async () => {
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/reorder": () => {
        throw new Error("The hub did not confirm the new activity order");
      }
    })
  );
  await store.loadState();
  const failure = await store.reorderActivities([103, 101, 102]);
  assert.match(String(failure), /did not confirm the new activity order/);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
test("reorderDevices sends the full ordered id list and reloads state", async () => {
  const calls = [];
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/device/reorder": (message) => {
        calls.push(message);
        return { status: "success", ordered_ids: message.ordered_ids };
      }
    })
  );
  await store.loadState();
  const failure = await store.reorderDevices([3, 1, 2]);
  assert.equal(failure, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].entry_id, "hub-1");
  assert.deepEqual(calls[0].ordered_ids, [3, 1, 2]);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
test("reorderDevices surfaces the backend failure message", async () => {
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/device/reorder": () => {
        throw new Error("The hub did not confirm the new device order");
      }
    })
  );
  await store.loadState();
  const failure = await store.reorderDevices([3, 1, 2]);
  assert.match(String(failure), /did not confirm the new device order/);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
test("createActivity resolves the assigned id and refreshes its cache entry", async () => {
  const refreshCalls = [];
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/create": (message) => {
        assert.equal(message.name, "Movie Night");
        return { status: "success", activity_id: 105 };
      },
      "sofabaton_x1s/persistent_cache/refresh": (message) => {
        refreshCalls.push(message);
        return { ok: true };
      }
    })
  );
  await store.loadState();
  const result = await store.createActivity("Movie Night");
  assert.deepEqual(result, { activityId: 105 });
  assert.equal(refreshCalls.length, 1);
  assert.equal(refreshCalls[0].kind, "activity");
  assert.equal(refreshCalls[0].target_id, 105);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
test("createActivity reports the backend error without opening the editor id", async () => {
  const store = createStore();
  store.setHass(
    createHass({
      "sofabaton_x1s/activity/create": () => {
        throw new Error("The hub did not confirm creation of the new activity");
      }
    })
  );
  await store.loadState();
  const result = await store.createActivity("Movie Night");
  assert.ok("error" in result);
  assert.match(String(result.error), /did not confirm creation/);
  assert.deepEqual(store.snapshot.externalHubCommandByHub, {});
});
