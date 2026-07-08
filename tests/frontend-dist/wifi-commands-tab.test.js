// tests/frontend/wifi-commands-tab.test.ts
import test, { afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";

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
var CustomEventShim = (_b = class CustomEvent2 extends EventShim {
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
var customElements2 = new CustomElementRegistryShimWithRealType();

// node_modules/@lit/reactive-element/node/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t4, e4, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t4, this.t = e4;
  }
  get styleSheet() {
    let t4 = this.o;
    const s4 = this.t;
    if (e && void 0 === t4) {
      const e4 = void 0 !== s4 && 1 === s4.length;
      e4 && (t4 = o.get(s4)), void 0 === t4 && ((this.o = t4 = new CSSStyleSheet()).replaceSync(this.cssText), e4 && o.set(s4, t4));
    }
    return t4;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
var i = (t4, ...e4) => {
  const o5 = 1 === t4.length ? t4[0] : e4.reduce((e5, s4, o6) => e5 + ((t5) => {
    if (true === t5._$cssResult$) return t5.cssText;
    if ("number" == typeof t5) return t5;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t4[o6 + 1], t4[0]);
  return new n(o5, t4, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
  else for (const e4 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e4.cssText, s4.appendChild(o6);
  }
};
var c = e || void 0 === t.CSSStyleSheet ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
  let e4 = "";
  for (const s4 of t5.cssRules) e4 += s4.cssText;
  return r(e4);
})(t4) : t4;

// node_modules/@lit/reactive-element/node/reactive-element.js
var { is: h, defineProperty: r2, getOwnPropertyDescriptor: o2, getOwnPropertyNames: n2, getOwnPropertySymbols: a, getPrototypeOf: c2 } = Object;
var l = globalThis;
l.customElements ??= customElements2;
var p = l.trustedTypes;
var d = p ? p.emptyScript : "";
var u = l.reactiveElementPolyfillSupport;
var f = (t4, s4) => t4;
var b = { toAttribute(t4, s4) {
  switch (s4) {
    case Boolean:
      t4 = t4 ? d : null;
      break;
    case Object:
    case Array:
      t4 = null == t4 ? t4 : JSON.stringify(t4);
  }
  return t4;
}, fromAttribute(t4, s4) {
  let i6 = t4;
  switch (s4) {
    case Boolean:
      i6 = null !== t4;
      break;
    case Number:
      i6 = null === t4 ? null : Number(t4);
      break;
    case Object:
    case Array:
      try {
        i6 = JSON.parse(t4);
      } catch (t5) {
        i6 = null;
      }
  }
  return i6;
} };
var m = (t4, s4) => !h(t4, s4);
var y = { attribute: true, type: String, converter: b, reflect: false, useDefault: false, hasChanged: m };
Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), l.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
var g = class extends (globalThis.HTMLElement ?? HTMLElementShimWithRealType) {
  static addInitializer(t4) {
    this._$Ei(), (this.l ??= []).push(t4);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t4, s4 = y) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t4) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t4, s4), !s4.noAccessor) {
      const i6 = /* @__PURE__ */ Symbol(), e4 = this.getPropertyDescriptor(t4, i6, s4);
      void 0 !== e4 && r2(this.prototype, t4, e4);
    }
  }
  static getPropertyDescriptor(t4, s4, i6) {
    const { get: e4, set: h3 } = o2(this.prototype, t4) ?? { get() {
      return this[s4];
    }, set(t5) {
      this[s4] = t5;
    } };
    return { get: e4, set(s5) {
      const r4 = e4?.call(this);
      h3?.call(this, s5), this.requestUpdate(t4, r4, i6);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t4) {
    return this.elementProperties.get(t4) ?? y;
  }
  static _$Ei() {
    if (this.hasOwnProperty(f("elementProperties"))) return;
    const t4 = c2(this);
    t4.finalize(), void 0 !== t4.l && (this.l = [...t4.l]), this.elementProperties = new Map(t4.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(f("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(f("properties"))) {
      const t5 = this.properties, s4 = [...n2(t5), ...a(t5)];
      for (const i6 of s4) this.createProperty(i6, t5[i6]);
    }
    const t4 = this[Symbol.metadata];
    if (null !== t4) {
      const s4 = litPropertyMetadata.get(t4);
      if (void 0 !== s4) for (const [t5, i6] of s4) this.elementProperties.set(t5, i6);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t5, s4] of this.elementProperties) {
      const i6 = this._$Eu(t5, s4);
      void 0 !== i6 && this._$Eh.set(i6, t5);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(t4) {
    const s4 = [];
    if (Array.isArray(t4)) {
      const e4 = new Set(t4.flat(1 / 0).reverse());
      for (const t5 of e4) s4.unshift(c(t5));
    } else void 0 !== t4 && s4.push(c(t4));
    return s4;
  }
  static _$Eu(t4, s4) {
    const i6 = s4.attribute;
    return false === i6 ? void 0 : "string" == typeof i6 ? i6 : "string" == typeof t4 ? t4.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t4) => this.enableUpdating = t4), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t4) => t4(this));
  }
  addController(t4) {
    (this._$EO ??= /* @__PURE__ */ new Set()).add(t4), void 0 !== this.renderRoot && this.isConnected && t4.hostConnected?.();
  }
  removeController(t4) {
    this._$EO?.delete(t4);
  }
  _$E_() {
    const t4 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i6 of s4.keys()) this.hasOwnProperty(i6) && (t4.set(i6, this[i6]), delete this[i6]);
    t4.size > 0 && (this._$Ep = t4);
  }
  createRenderRoot() {
    const t4 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t4, this.constructor.elementStyles), t4;
  }
  connectedCallback() {
    this.renderRoot ??= this.createRenderRoot(), this.enableUpdating(true), this._$EO?.forEach((t4) => t4.hostConnected?.());
  }
  enableUpdating(t4) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t4) => t4.hostDisconnected?.());
  }
  attributeChangedCallback(t4, s4, i6) {
    this._$AK(t4, i6);
  }
  _$ET(t4, s4) {
    const i6 = this.constructor.elementProperties.get(t4), e4 = this.constructor._$Eu(t4, i6);
    if (void 0 !== e4 && true === i6.reflect) {
      const h3 = (void 0 !== i6.converter?.toAttribute ? i6.converter : b).toAttribute(s4, i6.type);
      this._$Em = t4, null == h3 ? this.removeAttribute(e4) : this.setAttribute(e4, h3), this._$Em = null;
    }
  }
  _$AK(t4, s4) {
    const i6 = this.constructor, e4 = i6._$Eh.get(t4);
    if (void 0 !== e4 && this._$Em !== e4) {
      const t5 = i6.getPropertyOptions(e4), h3 = "function" == typeof t5.converter ? { fromAttribute: t5.converter } : void 0 !== t5.converter?.fromAttribute ? t5.converter : b;
      this._$Em = e4;
      const r4 = h3.fromAttribute(s4, t5.type);
      this[e4] = r4 ?? this._$Ej?.get(e4) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t4, s4, i6, e4 = false, h3) {
    if (void 0 !== t4) {
      const r4 = this.constructor;
      if (false === e4 && (h3 = this[t4]), i6 ??= r4.getPropertyOptions(t4), !((i6.hasChanged ?? m)(h3, s4) || i6.useDefault && i6.reflect && h3 === this._$Ej?.get(t4) && !this.hasAttribute(r4._$Eu(t4, i6)))) return;
      this.C(t4, s4, i6);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t4, s4, { useDefault: i6, reflect: e4, wrapped: h3 }, r4) {
    i6 && !(this._$Ej ??= /* @__PURE__ */ new Map()).has(t4) && (this._$Ej.set(t4, r4 ?? s4 ?? this[t4]), true !== h3 || void 0 !== r4) || (this._$AL.has(t4) || (this.hasUpdated || i6 || (s4 = void 0), this._$AL.set(t4, s4)), true === e4 && this._$Em !== t4 && (this._$Eq ??= /* @__PURE__ */ new Set()).add(t4));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t5) {
      Promise.reject(t5);
    }
    const t4 = this.scheduleUpdate();
    return null != t4 && await t4, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ??= this.createRenderRoot(), this._$Ep) {
        for (const [t6, s5] of this._$Ep) this[t6] = s5;
        this._$Ep = void 0;
      }
      const t5 = this.constructor.elementProperties;
      if (t5.size > 0) for (const [s5, i6] of t5) {
        const { wrapped: t6 } = i6, e4 = this[s5];
        true !== t6 || this._$AL.has(s5) || void 0 === e4 || this.C(s5, void 0, i6, e4);
      }
    }
    let t4 = false;
    const s4 = this._$AL;
    try {
      t4 = this.shouldUpdate(s4), t4 ? (this.willUpdate(s4), this._$EO?.forEach((t5) => t5.hostUpdate?.()), this.update(s4)) : this._$EM();
    } catch (s5) {
      throw t4 = false, this._$EM(), s5;
    }
    t4 && this._$AE(s4);
  }
  willUpdate(t4) {
  }
  _$AE(t4) {
    this._$EO?.forEach((t5) => t5.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t4)), this.updated(t4);
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
  shouldUpdate(t4) {
    return true;
  }
  update(t4) {
    this._$Eq &&= this._$Eq.forEach((t5) => this._$ET(t5, this[t5])), this._$EM();
  }
  updated(t4) {
  }
  firstUpdated(t4) {
  }
};
g.elementStyles = [], g.shadowRootOptions = { mode: "open" }, g[f("elementProperties")] = /* @__PURE__ */ new Map(), g[f("finalized")] = /* @__PURE__ */ new Map(), u?.({ ReactiveElement: g }), (l.reactiveElementVersions ??= []).push("2.1.2");

// node_modules/lit-html/node/lit-html.js
var t2 = globalThis;
var i2 = (t4) => t4;
var s2 = t2.trustedTypes;
var e2 = s2 ? s2.createPolicy("lit-html", { createHTML: (t4) => t4 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = void 0 === t2.document ? { createTreeWalker: () => ({}) } : document;
var c3 = () => l2.createComment("");
var a2 = (t4) => null === t4 || "object" != typeof t4 && "function" != typeof t4;
var u2 = Array.isArray;
var d2 = (t4) => u2(t4) || "function" == typeof t4?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m2 = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g2 = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t4) => (i6, ...s4) => ({ _$litType$: t4, strings: i6, values: s4 });
var T = x(1);
var b2 = x(2);
var w = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t4, i6) {
  if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e2 ? e2.createHTML(i6) : i6;
}
var N = (t4, i6) => {
  const s4 = t4.length - 1, e4 = [];
  let n4, l3 = 2 === i6 ? "<svg>" : 3 === i6 ? "<math>" : "", c4 = v;
  for (let i7 = 0; i7 < s4; i7++) {
    const s5 = t4[i7];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m2 : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g2) : c4 === $ || c4 === g2 ? c4 = p2 : c4 === _ || c4 === m2 ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t4[i7 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e4.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i7 : x2);
  }
  return [V(t4, l3 + (t4[s4] || "<?>") + (2 === i6 ? "</svg>" : 3 === i6 ? "</math>" : "")), e4];
};
var S2 = class _S {
  constructor({ strings: t4, _$litType$: i6 }, e4) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t4.length - 1, d3 = this.parts, [f3, v2] = N(t4, i6);
    if (this.el = _S.createElement(f3, e4), P.currentNode = this.el.content, 2 === i6 || 3 === i6) {
      const t5 = this.el.content.firstChild;
      t5.replaceWith(...t5.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t5 of r4.getAttributeNames()) if (t5.endsWith(h2)) {
          const i7 = v2[a3++], s4 = r4.getAttribute(t5).split(o3), e5 = /([.?@])?(.*)/.exec(i7);
          d3.push({ type: 1, index: l3, name: e5[2], strings: s4, ctor: "." === e5[1] ? I : "?" === e5[1] ? L : "@" === e5[1] ? z : H }), r4.removeAttribute(t5);
        } else t5.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t5));
        if (y2.test(r4.tagName)) {
          const t5 = r4.textContent.split(o3), i7 = t5.length - 1;
          if (i7 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i7; s4++) r4.append(t5[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t5[i7], c3());
          }
        }
      } else if (8 === r4.nodeType) if (r4.data === n3) d3.push({ type: 2, index: l3 });
      else {
        let t5 = -1;
        for (; -1 !== (t5 = r4.data.indexOf(o3, t5 + 1)); ) d3.push({ type: 7, index: l3 }), t5 += o3.length - 1;
      }
      l3++;
    }
  }
  static createElement(t4, i6) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t4, s4;
  }
};
function M(t4, i6, s4 = t4, e4) {
  if (i6 === E) return i6;
  let h3 = void 0 !== e4 ? s4._$Co?.[e4] : s4._$Cl;
  const o5 = a2(i6) ? void 0 : i6._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t4), h3._$AT(t4, s4, e4)), void 0 !== e4 ? (s4._$Co ??= [])[e4] = h3 : s4._$Cl = h3), void 0 !== h3 && (i6 = M(t4, h3._$AS(t4, i6.values), h3, e4)), i6;
}
var k = class {
  constructor(t4, i6) {
    this._$AV = [], this._$AN = void 0, this._$AD = t4, this._$AM = i6;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t4) {
    const { el: { content: i6 }, parts: s4 } = this._$AD, e4 = (t4?.creationScope ?? l2).importNode(i6, true);
    P.currentNode = e4;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i7;
        2 === r4.type ? i7 = new R(h3, h3.nextSibling, this, t4) : 1 === r4.type ? i7 = new r4.ctor(h3, r4.name, r4.strings, this, t4) : 6 === r4.type && (i7 = new W(h3, this, t4)), this._$AV.push(i7), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e4;
  }
  p(t4) {
    let i6 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t4, s4, i6), i6 += s4.strings.length - 2) : s4._$AI(t4[i6])), i6++;
  }
};
var R = class _R {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t4, i6, s4, e4) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t4, this._$AB = i6, this._$AM = s4, this.options = e4, this._$Cv = e4?.isConnected ?? true;
  }
  get parentNode() {
    let t4 = this._$AA.parentNode;
    const i6 = this._$AM;
    return void 0 !== i6 && 11 === t4?.nodeType && (t4 = i6.parentNode), t4;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t4, i6 = this) {
    t4 = M(this, t4, i6), a2(t4) ? t4 === A || null == t4 || "" === t4 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t4 !== this._$AH && t4 !== E && this._(t4) : void 0 !== t4._$litType$ ? this.$(t4) : void 0 !== t4.nodeType ? this.T(t4) : d2(t4) ? this.k(t4) : this._(t4);
  }
  O(t4) {
    return this._$AA.parentNode.insertBefore(t4, this._$AB);
  }
  T(t4) {
    this._$AH !== t4 && (this._$AR(), this._$AH = this.O(t4));
  }
  _(t4) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t4 : this.T(l2.createTextNode(t4)), this._$AH = t4;
  }
  $(t4) {
    const { values: i6, _$litType$: s4 } = t4, e4 = "number" == typeof s4 ? this._$AC(t4) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e4) this._$AH.p(i6);
    else {
      const t5 = new k(e4, this), s5 = t5.u(this.options);
      t5.p(i6), this.T(s5), this._$AH = t5;
    }
  }
  _$AC(t4) {
    let i6 = C.get(t4.strings);
    return void 0 === i6 && C.set(t4.strings, i6 = new S2(t4)), i6;
  }
  k(t4) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i6 = this._$AH;
    let s4, e4 = 0;
    for (const h3 of t4) e4 === i6.length ? i6.push(s4 = new _R(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i6[e4], s4._$AI(h3), e4++;
    e4 < i6.length && (this._$AR(s4 && s4._$AB.nextSibling, e4), i6.length = e4);
  }
  _$AR(t4 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t4 !== this._$AB; ) {
      const s5 = i2(t4).nextSibling;
      i2(t4).remove(), t4 = s5;
    }
  }
  setConnected(t4) {
    void 0 === this._$AM && (this._$Cv = t4, this._$AP?.(t4));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t4, i6, s4, e4, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t4, this.name = i6, this._$AM = e4, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t4, i6 = this, s4, e4) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t4 = M(this, t4, i6, 0), o5 = !a2(t4) || t4 !== this._$AH && t4 !== E, o5 && (this._$AH = t4);
    else {
      const e5 = t4;
      let n4, r4;
      for (t4 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e5[s4 + n4], i6, n4), r4 === E && (r4 = this._$AH[n4]), o5 ||= !a2(r4) || r4 !== this._$AH[n4], r4 === A ? t4 = A : t4 !== A && (t4 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e4 && this.j(t4);
  }
  j(t4) {
    t4 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t4 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t4) {
    this.element[this.name] = t4 === A ? void 0 : t4;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t4) {
    this.element.toggleAttribute(this.name, !!t4 && t4 !== A);
  }
};
var z = class extends H {
  constructor(t4, i6, s4, e4, h3) {
    super(t4, i6, s4, e4, h3), this.type = 5;
  }
  _$AI(t4, i6 = this) {
    if ((t4 = M(this, t4, i6, 0) ?? A) === E) return;
    const s4 = this._$AH, e4 = t4 === A && s4 !== A || t4.capture !== s4.capture || t4.once !== s4.once || t4.passive !== s4.passive, h3 = t4 !== A && (s4 === A || e4);
    e4 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t4), this._$AH = t4;
  }
  handleEvent(t4) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t4) : this._$AH.handleEvent(t4);
  }
};
var W = class {
  constructor(t4, i6, s4) {
    this.element = t4, this.type = 6, this._$AN = void 0, this._$AM = i6, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t4) {
    M(this, t4);
  }
};
var Z = { M: h2, P: o3, A: n3, C: 1, L: N, R: k, D: d2, V: M, I: R, H, N: L, U: z, B: I, F: W };
var j = t2.litHtmlPolyfillSupport;
j?.(S2, R), (t2.litHtmlVersions ??= []).push("3.3.2");
var B = (t4, i6, s4) => {
  const e4 = s4?.renderBefore ?? i6;
  let h3 = e4._$litPart$;
  if (void 0 === h3) {
    const t5 = s4?.renderBefore ?? null;
    e4._$litPart$ = h3 = new R(i6.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
  }
  return h3._$AI(t4), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i3 = class extends g {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    const t4 = super.createRenderRoot();
    return this.renderOptions.renderBefore ??= t4.firstChild, t4;
  }
  update(t4) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t4), this._$Do = B(r4, this.renderRoot, this.renderOptions);
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

// node_modules/lit-html/node/directive.js
var e3 = (t4) => (...e4) => ({ _$litDirective$: t4, values: e4 });
var i4 = class {
  constructor(t4) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t4, e4, i6) {
    this._$Ct = t4, this._$AM = e4, this._$Ci = i6;
  }
  _$AS(t4, e4) {
    return this.update(t4, e4);
  }
  update(t4, e4) {
    return this.render(...e4);
  }
};

// node_modules/lit-html/node/directive-helpers.js
var { I: t3 } = Z;
var m3 = {};
var p3 = (o5, t4 = m3) => o5._$AH = t4;

// node_modules/lit-html/node/directives/keyed.js
var i5 = e3(class extends i4 {
  constructor() {
    super(...arguments), this.key = A;
  }
  render(r4, t4) {
    return this.key = r4, t4;
  }
  update(r4, [t4, e4]) {
    return t4 !== this.key && (p3(r4), this.key = t4), e4;
  }
});

// custom_components/sofabaton_x1s/www/src/components/secondary-tab.ts
var secondaryTabStyles = i`
  .secondary-view-shell {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: hidden;
  }
  .secondary-view-shell--edge {
    margin: -16px;
  }
  .secondary-view-shell--connected {
    --secondary-connected-inline: 16px;
    --secondary-connected-bottom: 16px;
    --secondary-connected-radius: calc(var(--ha-card-border-radius, 12px) * 1.8);
  }
  .secondary-view-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
  .secondary-view-body--scroll {
    overflow-y: auto;
  }
  .secondary-view-body--padded {
    padding: 12px 16px 16px;
  }
  .secondary-tab-row {
    flex-shrink: 0;
    display: flex;
    align-items: stretch;
    min-height: 36px;
    margin: 8px 0 0;
    border: 1px solid color-mix(in srgb, var(--divider-color) 88%, transparent);
    border-radius: calc(var(--ha-card-border-radius, 12px) + 2px);
    overflow: hidden;
    background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 82%, transparent);
  }
  .secondary-tab-row--flush {
    margin-inline: 16px;
  }
  .secondary-view-shell--connected .secondary-tab-row {
    margin-top: 10px;
    margin-inline: var(--secondary-connected-inline);
    border-color: color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-radius: var(--secondary-connected-radius) var(--secondary-connected-radius) 0 0;
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 96%, transparent),
        color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 68%, transparent)
      );
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
  }
  .secondary-tab-btn {
    flex: 1 1 0;
    min-width: 0;
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 0 16px;
    border: none;
    border-right: 1px solid color-mix(in srgb, var(--divider-color) 86%, transparent);
    background: transparent;
    color: color-mix(in srgb, var(--secondary-text-color) 88%, var(--primary-text-color) 12%);
    font: inherit;
    cursor: pointer;
  }
  .secondary-tab-btn:last-child {
    border-right: none;
  }
  .secondary-tab-btn.active {
    color: var(--primary-color);
    background: transparent;
    box-shadow: inset 0 -2px 0 var(--primary-color);
  }
  .secondary-view-shell--connected .secondary-tab-btn.active {
    box-shadow: inset 0 -3px 0 var(--primary-color);
  }
  .secondary-tab-btn--static {
    cursor: default;
  }
  .secondary-tab-btn-icon,
  .secondary-panel-title-icon {
    display: inline-flex;
    color: inherit;
  }
  .secondary-tab-btn-icon ha-icon,
  .secondary-panel-title-icon ha-icon {
    --mdc-icon-size: 18px;
  }
  .secondary-tab-btn-label {
    min-width: 0;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .secondary-tab-btn-count {
    flex: 0 0 auto;
    padding: 0 5px;
    border: 1px solid var(--divider-color);
    border-radius: 999px;
    font-size: 9px;
    font-weight: 700;
    line-height: 1.2;
    color: inherit;
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
  }
  .secondary-tab-panel {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .secondary-tab-panel--connected,
  .secondary-view-body--connected {
    margin: 0 var(--secondary-connected-inline) var(--secondary-connected-bottom);
    border-left: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-right: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    border-radius: 0 0 var(--secondary-connected-radius) var(--secondary-connected-radius);
    background:
      radial-gradient(circle at top center, color-mix(in srgb, var(--primary-color) 5%, transparent), transparent 48%),
      color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 98%, transparent);
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.03);
  }
  .secondary-tab-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .secondary-tab-panel--connected .secondary-tab-content {
    padding-top: 18px;
  }
  .secondary-panel-header {
    flex-shrink: 0;
    min-height: 38px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 16px;
    border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
  }
  .secondary-panel-header--plain {
    min-height: 34px;
    justify-content: flex-end;
    border-bottom: none;
    background: transparent;
  }
  .secondary-panel-title {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--secondary-text-color);
  }
  .secondary-panel-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px;
    display: grid;
    gap: 6px;
    align-content: start;
  }
  .secondary-tab-panel--connected .secondary-panel-body {
    padding-top: 16px;
  }
  @media (max-width: 640px) {
    .secondary-tab-row {
      min-height: 34px;
      margin-top: 7px;
    }
    .secondary-tab-row--flush {
      margin-inline: 12px;
    }
    .secondary-view-shell--connected {
      --secondary-connected-inline: 12px;
      --secondary-connected-bottom: 12px;
    }
    .secondary-tab-btn {
      min-height: 34px;
      gap: 5px;
      padding: 0 12px;
    }
    .secondary-tab-btn-label {
      font-size: 12px;
      letter-spacing: 0.04em;
    }
    .secondary-tab-btn-count {
      padding: 1px 5px;
      font-size: 9px;
    }
    .secondary-panel-header {
      gap: 8px;
      padding: 0 12px;
    }
  }
`;
function normalizeClassName(className) {
  return String(className || "").trim().replace(/\s+/g, " ");
}
function renderSecondaryTabRow(params) {
  const rowClassName = normalizeClassName(
    `secondary-tab-row${params.flush === false ? "" : " secondary-tab-row--flush"} ${params.className || ""}`
  );
  return T`
    <div class=${rowClassName}>
      ${params.items.map((item) => {
    const isActive = item.id === params.selectedId;
    const isPassive = item.passive || !params.onSelect;
    const buttonClassName = normalizeClassName(
      `secondary-tab-btn${isActive ? " active" : ""}${isPassive ? " secondary-tab-btn--static" : ""}`
    );
    if (isPassive) {
      return T`
            <div class=${buttonClassName}>
              <span class="secondary-tab-btn-icon"><ha-icon icon=${item.icon}></ha-icon></span>
              <span class="secondary-tab-btn-label">${item.label}</span>
              ${typeof item.count === "number" ? T`<span class="secondary-tab-btn-count">${item.count}</span>` : A}
            </div>
          `;
    }
    return T`
          <button
            class=${buttonClassName}
            type="button"
            ?disabled=${item.disabled}
            @click=${() => {
      if (!item.disabled && item.id !== params.selectedId) params.onSelect?.(item.id);
    }}
          >
            <span class="secondary-tab-btn-icon"><ha-icon icon=${item.icon}></ha-icon></span>
            <span class="secondary-tab-btn-label">${item.label}</span>
            ${typeof item.count === "number" ? T`<span class="secondary-tab-btn-count">${item.count}</span>` : A}
          </button>
        `;
  })}
    </div>
  `;
}
function renderSecondaryTabShell(params) {
  const shellClassName = normalizeClassName(
    `secondary-view-shell${params.connected ? " secondary-view-shell--connected" : ""} ${params.shellClassName || ""}`
  );
  return T`
    <div class=${shellClassName}>
      ${renderSecondaryTabRow({
    items: params.items,
    selectedId: params.selectedId,
    onSelect: params.onSelect,
    flush: params.flush,
    className: params.rowClassName
  })}
      ${params.content}
    </div>
  `;
}
function renderSecondaryViewBody(params) {
  const viewClassName = normalizeClassName(
    `secondary-view-body${params.connected ? " secondary-view-body--connected" : ""}${params.scroll === false ? "" : " secondary-view-body--scroll"}${params.padded === false ? "" : " secondary-view-body--padded"} ${params.className || ""}`
  );
  return T`
    <div class=${viewClassName}>
      ${params.content}
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors.ts
function remoteEntities(hass) {
  return Object.keys(hass?.states ?? {}).filter((id) => id.startsWith("remote."));
}
function entityForHub(hass, hub) {
  if (!hub) return null;
  return remoteEntities(hass).find((id) => hass?.states?.[id]?.attributes?.entry_id === hub.entry_id) ?? null;
}
function remoteAttrsForHub(hass, hub) {
  const entityId = entityForHub(hass, hub);
  return (entityId ? hass?.states?.[entityId]?.attributes : void 0) ?? {};
}
function hubIcon(kind, classes = "") {
  const className = classes ? ` ${classes}` : "";
  if (kind === "hero") {
    return b2`<svg class=${className.trim()} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 421.04 173.01" aria-hidden="true" fill="currentColor">
      <path d="M87.39,45.33c0,21.03,50.51,44.46,123,44.46s123-23.43,123-44.46S282.87.87,210.39.87s-123,23.43-123,44.46Z"></path>
      <path d="M25.79,116h367c11.44,0,18.11-2.01,23.05-6.95,6.19-6.19,6.93-17.18,1.79-26.73l-28.97-54.94C375.65,4.75,344.58,0,320.79,0h-22.52c2.26.78,4.48,1.59,6.62,2.43,27.41,10.85,42.5,26.08,42.5,42.9s-15.09,32.05-42.5,42.9c-25.35,10.04-58.92,15.56-94.5,15.56s-69.15-5.53-94.5-15.56c-27.41-10.85-42.5-26.08-42.5-42.9S88.48,13.28,115.89,2.43c2.14-.85,4.36-1.65,6.62-2.43h-19.72c-23.82,0-54.95,4.77-67.92,27.47L1.18,85.93c-2.61,7.76-.85,15.91,4.88,22.46,5.4,6.3,13.71,7.61,19.73,7.61Z"></path>
      <path d="M25.79,130c-7.42,0-14.04-1.44-19.67-4.22,5.85,12.19,14.63,22.79,26.26,31.66,9.25,7.11,24.67,15.57,45.76,15.57h264c14.9,0,28.65-4.5,42.02-13.76,12.95-9.01,22.84-19.89,29.61-32.48-6.92,2.72-14.25,3.23-20.98,3.23H25.79Z"></path>
    </svg>`;
  }
  const icon = {
    activities: "mdi:play-circle-outline",
    devices: "mdi:audio-video",
    ip: "mdi:router-wireless",
    version: "mdi:cog-outline"
  }[kind];
  return T`<ha-icon class=${className.trim()} icon=${icon}></ha-icon>`;
}

// custom_components/sofabaton_x1s/www/src/strings.ts
var TOOLS_CARD_STRINGS = {
  docs: {
    wifiCommandsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    backupUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/backup.md",
    blobsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/blobs.md"
  },
  tabs: {
    activities: "Activities",
    cache: "Cache",
    wifiCommands: "Wifi Commands",
    wifiShort: "Wifi",
    backup: "Backup",
    blobs: "Blobs",
    settings: "Settings",
    logs: "Logs"
  },
  tabDocs: {
    wifi_commands: "Wifi Commands documentation",
    backup: "Backup documentation",
    blobs: "Blobs documentation"
  },
  backend: {
    unavailableTitle: "Backend not available",
    unavailableCopy: "Waiting for the Sofabaton X integration to finish starting...",
    versionMismatchTitle: "Refresh required to update the Sofabaton Control Panel card",
    versionMismatchCopy: "This dashboard is still using an older cached version of the Sofabaton Control Panel card than the one now running in Home Assistant. Refresh or reopen the dashboard/browser before using the control panel again so the updated card can load.",
    backendExpects: "Backend expects",
    cardLoaded: "Card loaded",
    unknownVersion: "unknown",
    refreshingCache: "Refreshing cache...",
    hubCommandInProgress: "Hub command in progress..."
  },
  hubUnavailable: {
    title: "Hub unavailable",
    copy: "This hub is not connected, so the control panel is unavailable until the hub reconnects."
  },
  settings: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    unknownHubName: "Unknown",
    activities: "Activities",
    devices: "Devices",
    persistentCacheTitle: "Persistent Cache",
    persistentCacheDescription: "Store activity and device data locally for faster access.",
    persistentCacheFooter: "GLOBAL",
    hexLoggingTitle: "Hex Logging",
    hexLoggingDescription: "Log raw hex traffic between hub, integration, and app.",
    proxyTitle: "Proxy",
    proxyDescription: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
    wifiDeviceTitle: "WiFi Device",
    wifiDeviceDescription: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
    findRemoteTitle: "Find Remote",
    findRemoteDescription: "Make the remote beep so you can locate it.",
    syncRemoteTitle: "Sync Remote",
    syncRemoteDescription: "Push the latest configuration to the physical remote."
  },
  cache: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    persistentCacheOffTitle: "Persistent cache is off",
    persistentCacheOffCopy: "Turn it on to browse cached activities and devices, and to unlock Backup and Blobs workflows that depend on it.",
    enablingPersistentCache: "Enabling...",
    enablePersistentCache: "Enable persistent cache",
    devIdBadge: "DevID",
    favIdBadge: "FavID",
    comIdBadge: "ComID",
    activityFallback: (id) => `Activity ${id}`,
    deviceFallback: (id) => `Device ${id}`,
    favoriteFallback: (commandId) => `Favorite ${commandId}`,
    macroFallback: (commandId) => `Macro ${commandId}`,
    activityCounts: (favorites, macros, buttons) => `${favorites} favs / ${macros} macros / ${buttons} btns`,
    deviceCommandCount: (count) => `${count} cmds`,
    favorites: "Favorites",
    macros: "Macros",
    buttons: "Buttons",
    noCachedData: "No cached data yet.",
    noCachedCommands: "No cached commands.",
    staleBanner: "Cache was updated externally. Refresh to see latest data.",
    refresh: "Refresh",
    activities: "Activities",
    devices: "Devices",
    refreshList: "Refresh list"
  },
  logs: {
    loading: "Loading log stream...",
    empty: "No log lines captured for this hub yet.",
    liveConsole: "Live Console"
  },
  cacheRefresh: {
    label: "Refresh entire hub cache",
    running: "Refreshing\u2026",
    starting: "Starting hub cache refresh\u2026",
    working: "Reading your hub's configuration\u2026",
    done: "Hub cache refreshed."
  },
  progress: {
    homeAssistant: "Home Assistant",
    sofabatonHub: "Sofabaton Hub",
    working: "Working...",
    backupTitle: "Creating backup",
    restoreTitle: "Restoring backup"
  },
  blobs: {
    loading: "Loading...",
    noHubsFound: "No hubs found.",
    sections: {
      fetch: "Fetch",
      test: "Test",
      save: "Save"
    },
    fetchCacheDisabled: "Enable persistent cache in the Hub tab before using Fetch.",
    selectOne: "Select one",
    device: "Device",
    command: "Command",
    fetchNoCommands: "This device has no cached commands yet. Refresh that device from the Cache tab first.",
    fetchNoRecords: "The hub returned no blob records for this request.",
    commandFallback: (commandId) => `Command ${commandId}`,
    unknown: "unknown",
    cmdBadge: (commandId) => `Cmd ${commandId}`,
    blobViewMode: "Blob view mode",
    descriptor: "Descriptor",
    hex: "Hex",
    rawBlob: "Raw Blob",
    copied: "Copied",
    copy: "Copy",
    test: "Test",
    testing: "Testing...",
    noIrDevices: "No IR devices found in the cache. Refresh devices from the Cache tab first.",
    irDevice: "IR device",
    save: "Save",
    saving: "Saving...",
    commandName: "Command name"
  },
  activities: {
    loading: "Loading activities...",
    selectHub: "Select a hub to edit its activities.",
    listSubtitle: "Choose an activity to edit. Changes stay on your device until you sync them to the hub.",
    activityFallback: (id) => `Activity ${id}`,
    rowMeta: (devices, shortcuts) => {
      const deviceLabel = `${devices} ${devices === 1 ? "device" : "devices"}`;
      const shortcutLabel = `${shortcuts} ${shortcuts === 1 ? "shortcut" : "shortcuts"}`;
      return `${deviceLabel} \xB7 ${shortcutLabel}`;
    },
    // Guard panels (§4.1), rendered inside the tab.
    appConnectedTitle: "The Sofabaton app is connected",
    appConnectedBody: "Close the Sofabaton app to edit activities.",
    operationRunningTitle: "Another operation is running",
    operationRunningBody: "Wait for the current backup, restore, or sync to finish, then try again.",
    emptyTitle: "No activities yet",
    emptyBody: "This hub has no activities to edit.",
    // Capture flow (§4.2).
    captureTitle: "Reading your hub",
    captureMessage: "Reading your hub's configuration\u2026",
    captureMessageWithStep: (current, total) => `Reading your hub's configuration\u2026 (device ${current} of ${total})`,
    captureFailedTitle: "Couldn't read the hub",
    captureFailedBody: "The hub stopped responding before we finished reading it.",
    retry: "Retry",
    back: "Back",
    // Cache-sourced capture (blob-free structural bundle).
    capturingFromCache: "Loading activity from the hub cache\u2026",
    needsRefreshTitle: "Refresh the hub cache to edit",
    needsRefreshBody: "This activity isn't in the local hub cache yet. Refresh the hub cache (a few seconds) to load it into the editor.",
    // Session restore banner (§4.6).
    sessionRestoreBanner: (name, time) => `Continuing your edit of "${name}" from ${time}`,
    sessionReload: "Reload from hub instead",
    // Live-mode edit header (§4.3).
    notSyncedChip: "Not synced",
    notSyncedTooltip: "Changes are local until you press Sync.",
    reviewChanges: "Review changes",
    sync: "Sync",
    discard: "Discard",
    // Review dialog (§4.4).
    reviewTitle: "Review changes",
    reviewEmpty: "No changes to sync yet.",
    reviewSyncNow: "Sync now",
    reviewKeepEditing: "Keep editing",
    reviewDiscardAll: "Discard all changes",
    reviewAppliesEverywhere: "applies everywhere",
    reviewAppliesEveryActivity: "applies to every activity",
    // Sync flow (§4.5).
    syncingTitle: "Syncing to your hub",
    syncingMessage: "Writing your changes to the hub\u2026",
    syncSuccess: "Synced to hub.",
    syncPlanSummary: (count) => `${count} hub ${count === 1 ? "write" : "writes"}`,
    syncFailedTitle: "Sync didn't finish",
    syncFailedStep: (step) => `The hub stopped at: ${step}`,
    syncStaleTitle: "This activity changed on the hub",
    syncStaleBody: "The activity was edited on the hub since you loaded it, so your changes can't be safely applied. Reload the hub's current version to continue \u2014 your unsaved edits will be discarded.",
    syncRetry: "Retry sync",
    syncReload: "Reload from hub",
    syncKeepEditing: "Keep editing",
    // Discard confirmation.
    discardConfirmTitle: "Discard all changes?",
    discardConfirmBody: "This throws away every edit you've made to this activity and returns to the captured state.",
    discardConfirmCancel: "Keep editing",
    discardConfirmConfirm: "Discard changes",
    // Review-list section titles + entry templates (activity-diff.ts).
    review: {
      sectionDevices: "Devices",
      sectionStart: "When it starts",
      sectionButtons: "Buttons",
      sectionShortcuts: "Shortcuts",
      sectionEnd: "When it ends",
      sectionDeviceWide: "Device-wide changes",
      deviceAdded: (name) => `Added "${name}" to this activity.`,
      deviceRemoved: (name) => `Removed "${name}" from this activity.`,
      inputChanged: (device, input) => `"${device}" input changed to ${input}.`,
      inputCleared: (device) => `"${device}" input cleared.`,
      powersOnNow: (device) => `"${device}" now turns on with this activity.`,
      powersOnNo: (device) => `"${device}" no longer turns on with this activity.`,
      startReordered: "Start sequence reordered.",
      roleNowControls: (group, device) => `${group} now control "${device}".`,
      roleCustomized: (group) => `${group} customized.`,
      roleCleared: (group) => `${group} no longer assigned.`,
      shortcutAdded: (name) => `Added "${name}".`,
      shortcutRemoved: (name) => `Removed "${name}".`,
      shortcutRenamed: (oldName, newName) => `Renamed "${oldName}" \u2192 "${newName}".`,
      shortcutsReordered: "Reordered shortcuts.",
      powersOffNow: (device) => `"${device}" now turns off with this activity.`,
      powersOffNo: (device) => `"${device}" now stays on.`,
      idleChanged: (device, label) => `"${device}" idle behavior \u2192 ${label}.`,
      commandRenamed: (oldName, newName, device) => `Renamed command "${oldName}" \u2192 "${newName}" on "${device}".`,
      roleGroups: {
        volume: "Volume buttons",
        navigation: "Navigation buttons",
        playback: "Playback buttons",
        channels: "Channel buttons"
      },
      idleShort: {
        0: "not set",
        1: "turns off when idle",
        2: "never switches off",
        3: "stays on",
        4: "not managed by the hub"
      }
    }
  },
  backup: {
    loading: "Loading backup tools...",
    selectHub: "Select a hub to manage backups.",
    creatingSubtitle: "The hub is creating your backup.",
    readySubtitle: "Your backup is ready.",
    chooseSubtitle: "Choose what to include in this backup.",
    enablePersistentCache: "Enable persistent cache to choose backup contents from the card.",
    completedTitle: "Backup completed",
    expired: "Backup expired. Start a new backup to download again.",
    downloaded: "Downloaded",
    downloadAgain: "Download again",
    downloadBackup: "Download backup",
    complete: "Complete",
    entireHub: "Entire hub",
    selectedDevices: "Selected devices",
    devicesToInclude: "Devices to include",
    selectedCount: (count) => `${count} selected`,
    deselectAll: "Deselect all",
    selectAll: "Select all",
    noDevicesAvailable: "No devices available.",
    working: "Working",
    startBackup: "Start backup",
    editLoadPrompt: "Load a backup file, then choose an Activity or Device to edit.",
    chooseBackupFile: "Choose backup file",
    reorderHint: " Drag the handle on any row to reorder Activities and Devices.",
    hubName: "Hub name",
    hubNameNotSet: "(not set)",
    renameHub: "Rename Hub",
    activities: "Activities",
    noActivitiesInFile: "This backup file has no activities.",
    devices: "Devices",
    noDevicesInFile: "This backup file has no devices.",
    unsavedChanges: "Unsaved changes. Click ",
    downloadEditedBackupStrong: "Download edited backup",
    unsavedChangesSuffix: " to save them to a file.",
    downloadEditedBackup: "Download edited backup",
    deleteActivityTitle: (name) => `Delete activity "${name}"?`,
    deleteDeviceTitle: (name) => `Delete device "${name}"?`,
    deleteCommandTitle: (name) => `Delete command "${name}"?`,
    deleteFavoriteTitle: (name) => `Delete shortcut "${name}"?`,
    deleteMacroTitle: (name) => `Delete custom action "${name}"?`,
    deleteCascadeIntro: "Removing this also clears its references elsewhere in the backup:",
    deleteSimpleBody: "This removes it from the loaded backup.",
    deleteImpactActivities: (count) => `${count} ${count === 1 ? "activity references" : "activities reference"} it`,
    deleteImpactFavorites: (count) => `${count} shortcut${count === 1 ? "" : "s"} will be removed`,
    deleteImpactMacroSteps: (count) => `${count} sequence step${count === 1 ? "" : "s"} will be removed`,
    deleteReplaceNote: "Deletions reach the hub only with a Replace restore.",
    deleteCancel: "Cancel",
    deleteConfirm: "Delete",
    deleteActivityAria: "Delete activity",
    deleteDeviceAria: "Delete device",
    deleteCommandAria: "Delete command",
    addFavoriteTitle: "Add command shortcut",
    addFavoriteDevice: "Device",
    addFavoriteCommand: "Command",
    addFavoriteName: "Display name",
    addFavoriteAdd: "Add",
    addFavoriteCancel: "Cancel",
    addFavoriteNoDevices: "This backup has no devices with commands to add.",
    addFavoriteNoCommands: "This device has no commands to add.",
    buttonBindingsTitle: "Button bindings",
    buttonBindingsActivitySub: "Bind remote buttons to a device's command within this Activity.",
    buttonBindingsDeviceSub: "Bind remote buttons to this Device's own commands.",
    buttonBindingsEmpty: "No button bindings configured.",
    addBinding: "Add binding",
    bindingButton: "Button",
    bindingTargetDevice: "Device",
    bindingMacroTarget: "This activity \xB7 macros",
    bindingCommand: "Command",
    bindingEnableLongPress: "Enable long-press binding",
    bindingLongPressDevice: "Long-press device",
    bindingLongPressCommand: "Long-press command",
    bindingIncomplete: "Choose a button and command first.",
    bindingNoButtons: "Every button on this hub model is already bound.",
    bindingNoCommands: "This device has no commands to bind.",
    bindingNoDevices: "This backup has no devices with commands to bind.",
    bindingAdd: "Add",
    bindingSave: "Save",
    bindingCancel: "Cancel",
    bindingDialogAddTitle: "Add button binding",
    bindingDialogEditTitle: (name) => `Edit ${name} binding`,
    bindingLongPressMeta: (label) => `Long press \xB7 ${label}`,
    deleteBindingTitle: (name) => `Delete ${name} binding?`,
    deleteBindingAria: "Delete binding",
    deleteImpactBindings: (count) => `${count} button binding${count === 1 ? "" : "s"} will be cleared`,
    macrosTitle: "Macros",
    macrosDeviceSub: "Edit the command sequences this device plays, including its power on / off.",
    macroPowerChip: "power",
    powerSetupTitle: "Power",
    powerSetupDeviceSub: "How the hub manages this device's power for Activities, and the sequences it sends to switch it on and off.",
    powerSetupActivitySub: "The startup and shutdown sequence this Activity runs.",
    powerOnLabel: "Power-on sequence",
    powerOffLabel: "Power-off sequence",
    // Automatic-power dropdown (device only). One hub byte encodes the whole
    // "Power On/Off Setup" + "Idle Behavior" story, so it is one selector here.
    powerControlTitle: "Automatic power control",
    powerControlUnset: "Not captured",
    powerControlUnsetSub: "This backup predates power-control capture. Pick an option to set it, or restore as-is to keep the legacy value.",
    powerControlDisabled: "Don't control power",
    powerControlDisabledSub: "The hub never switches this device on or off. The sequences below are ignored.",
    powerControlAutoOff: "Turn off when idle",
    powerControlAutoOffSub: "Recommended. Powers the device off when no Activity needs it.",
    powerControlStayOn: "Stay on between Activities",
    powerControlStayOnSub: "Skips the wait to power back on; still turns off with the remote's Off button.",
    powerControlAlwaysOn: "Always stay on",
    powerControlAlwaysOnSub: "The hub powers it on but never switches it off automatically.",
    powerSequencesDisabledNote: "Power control is off, so these sequences aren't used. Switch it on above to edit them.",
    inputStepTitle: "Set input",
    inputStepCommand: "Input command",
    inputStepNone: "\u2014 no input \u2014",
    macroStepsCount: (count) => `${count} step${count === 1 ? "" : "s"}`,
    noMacroSteps: "No steps yet.",
    addStep: "Add step",
    stepDialogAddTitle: "Add step",
    stepDialogEditTitle: "Edit step",
    stepDevice: "Device",
    stepCommand: "Command",
    stepHoldSeconds: "Hold (seconds, 0 = click)",
    holdLabel: (seconds) => `Hold ${seconds}s`,
    stepAdd: "Add",
    stepSave: "Save",
    stepCancel: "Cancel",
    stepNoCommands: "This device has no commands.",
    stepWaitAria: "Wait after this step (seconds)",
    stepWaitLabel: "Delay",
    stepWaitUnit: "s",
    renameMacroAria: "Rename macro",
    deleteStepAria: "Delete step",
    editStepAria: "Edit step",
    newMacroName: "Custom action",
    shortcutChipCommand: "command",
    shortcutChipAction: "custom action",
    shortcutRenameAria: (kind) => kind === "macro" ? "Rename custom action" : "Rename shortcut",
    shortcutDeleteAria: (kind) => kind === "macro" ? "Delete custom action" : "Delete shortcut",
    powerSectionTitle: "Power",
    powerActivitySub: "Each device the Activity uses powers on here. Pick its input and adjust the timing.",
    powerInputLabel: "Input",
    powerInputNone: "\u2014 none \u2014",
    powerDelayLabel: "Delay (s)",
    powerNoDevices: "No devices yet. Add a favorite, binding, or macro that uses one.",
    powerOnSequence: "Power-on sequence",
    powerOffSequence: "Power-off sequence",
    powerSequenceSub: "Reorder steps, add your own commands or waits. Required device steps can be reordered but not removed.",
    macroRenameAria: "Rename macro",
    editStepsAria: "Edit steps",
    crumbActivities: "Activities",
    crumbDevices: "Devices",
    // Narrative activity editor (docs/internal/activity-editor-plan.md).
    // Section headings tell the activity's story in order: devices →
    // start → running → shortcuts → end. Storage vocabulary (macro,
    // binding, favorite slot) stays out of the copy.
    activityDevicesTitle: "Devices in this activity",
    activityDevicesSub: "Everything below follows from this list.",
    activityDevicesEmpty: "No devices yet. Add one to get started.",
    activityAddDevice: "Add device",
    activityAddDeviceNone: "Every device in this backup is already part of this activity.",
    activityRemoveDeviceAria: (name) => `Remove ${name} from this activity`,
    activityRemoveDeviceTitle: (name) => `Remove ${name} from this activity?`,
    activityStartTitle: "When the activity starts",
    activityStartSub: "What each device does when this activity begins.",
    activityStartTurnsOn: "Turns on",
    activityStartStaysAsIs: "Stays as is",
    activityStartToggleAria: (name) => `Toggle whether ${name} turns on`,
    activityStartInputLabel: "Input",
    activityStartInputNone: "\u2014 none \u2014",
    activityStartInputAria: (name) => `Input for ${name}`,
    activityStartSequenceTitle: "Start sequence",
    activityEndSequenceTitle: "End sequence",
    activityRunningTitle: "While the activity is running",
    activityRunningSub: "Which device each remote button controls in this activity.",
    activityShortcutsTitle: "Shortcuts on the remote screen",
    activityShortcutsSubSortable: "Commands and custom actions shown on the remote's screen. Drag the handle to reorder.",
    activityShortcutsSubStatic: "Commands and custom actions shown on the remote's screen. Use the move buttons to reorder.",
    activityShortcutsEmpty: "No shortcuts yet. Add a command or a custom action.",
    activityEndTitle: "When the activity ends",
    activityEndSub: "What each device does when this activity is switched off.",
    activityEndTurnsOff: "Turns off",
    activityEndStaysOn: "Stays on",
    activityEndToggleAria: (name) => `Toggle whether ${name} turns off`,
    // Per-device automatic power (device-level idle behavior, 0x0242).
    // Activity switches are governed by THIS, not the activity macros.
    activityIdleAutoOff: "Between activities: turns off when not needed",
    activityIdleStayOn: "Between activities: stays on",
    activityIdleAlwaysOn: "Between activities: never switched off",
    activityIdleDisabled: "Power not managed by the hub",
    activityIdleUnset: "Automatic power: not set",
    activityIdleAria: (name) => `Change automatic power for ${name}`,
    activityIdleMenuNote: "Applies to the device in every activity.",
    activitySectionDevices: "Devices",
    activitySectionStart: "Start",
    activitySectionRunning: "Buttons",
    activitySectionShortcuts: "Shortcuts",
    activitySectionEnd: "End",
    // Role-based button assignment (Phase B).
    roleVolume: "Volume buttons control",
    roleNavigation: "Navigation and OK control",
    rolePlayback: "Playback buttons control",
    roleChannels: "Channel buttons control",
    roleNotUsed: "Not used",
    roleCustom: "Custom",
    roleCustomized: (name) => `${name} (customized)`,
    roleMappedNote: (bound, total) => `${bound} of ${total} buttons mapped`,
    roleOptionNoMapping: (name) => `${name} \u2014 no button mapping`,
    roleMenuAria: (roleLabel) => `Choose a device for: ${roleLabel}`,
    roleConfirmTitle: "Replace custom button setup?",
    roleConfirmBody: "This group has button assignments that don't come from a single device's standard mapping. Assigning it here replaces them.",
    roleConfirmReplace: "Replace",
    roleConfirmCancel: "Cancel",
    customizeButtonsToggle: "Customize individual buttons",
    bindingsViewTitle: "Individual buttons",
    bindingsConfiguredCount: (count) => `${count} configured`,
    bindingsNoneConfigured: "None customized",
    sequenceRowLabel: "Adjust order, delays, and extra steps",
    // Unified "add to shortcuts" flow.
    addShortcutButton: "Add",
    addShortcutTitle: "Add to shortcuts",
    addShortcutKindLabel: "Type",
    shortcutKindCommand: "Device command",
    shortcutKindAction: "Custom action",
    shortcutKindHa: "Home Assistant action",
    addShortcutActionName: "Name",
    addShortcutActionHelper: "You'll pick the steps next.",
    // Home Assistant actions (Phase D).
    haActionDialogTitle: "Add Home Assistant action",
    haActionNameLabel: "Name",
    haActionNameHelper: "Shown on the remote; Home Assistant receives it when the shortcut is pressed.",
    haActionAddressLabel: "Home Assistant address",
    haActionAddressHelper: "IPv4 address (and optional :port) where the hub can reach this Home Assistant on your network. The wifi-commands listener answers there.",
    haActionNameRequired: "Enter a name.",
    haActionInvalidAddress: "Enter the address as IPv4 or IPv4:port, e.g. 192.168.1.10:8060.",
    haActionNoSlots: "No free slots \u2014 the shared device-id space is full.",
    haActionAdd: "Add",
    haActionCancel: "Cancel",
    haActionChip: "HA action"
  },
  wifiCommands: {
    docsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    sectionLabel: "Wifi Devices",
    deployingTitle: "Deploying Wifi Commands",
    sectionSubtitle: "Choose a Wifi Device to edit its command slots, or add a new one.",
    addDevice: "Add Wifi Device",
    syncingDeviceFallback: "Syncing Wifi Device...",
    syncingDeviceNamed: (deviceName) => `Syncing ${deviceName}...`,
    syncInProgress: "Sync in progress",
    startSync: "Starting sync",
    syncFailedToStart: "Sync failed to start",
    syncMessageRemoteUnavailable: "Remote entity unavailable. Is the app connected?",
    syncMessageFailed: "Last sync failed.",
    syncMessageNeeded: "Command config changes need to be synced to the hub.",
    syncMessageUpToDate: "Hub command configuration is up to date.",
    syncMessageIdle: "No sync needed.",
    syncShortUnavailable: "Unavailable",
    syncShortRunning: "Syncing",
    syncShortFailed: "Sync failed",
    syncShortNeeded: "Sync needed",
    syncShortUpToDate: "Up to date",
    syncShortIdle: "Idle",
    deviceDeleting: "Deleting...",
    deviceSynced: "Synced",
    seeDocumentation: "See documentation",
    actionButtonUnavailable: "Unavailable",
    actionButtonSyncing: "Syncing...",
    actionButtonBusy: "Busy",
    actionButtonSyncToHub: "Sync to Hub",
    actionButtonUpToDate: "Up to Date",
    createDeviceBusy: "Creating Wifi Device...",
    createDeviceNameRequired: "Device name is required.",
    createDeviceFailed: "Unable to create Wifi Device",
    deleteDeviceBusy: "Deleting Wifi Device...",
    deleteDeviceFailed: "Unable to delete Wifi Device",
    createModalCancel: "Cancel",
    createModalCreate: "Create",
    deleteModalTitle: "Delete Wifi Device?",
    deleteModalBody: (deviceName) => `Delete "${deviceName}" from the hub and remove its saved command-slot configuration?`,
    deleteModalDelete: "Delete",
    clearSlotTitle: "Clear command slot?",
    clearSlotSubtitle: "Resets configuration.",
    clearSlotNo: "No",
    clearSlotYes: "Yes",
    makeCommand: "Make Command",
    noActionConfigured: "No Action configured",
    commandSlotTitle: (slotIndex) => `Command Slot ${slotIndex + 1}`,
    commandSlotActionTitle: (slotIndex) => `Command Slot ${slotIndex + 1} Action`,
    commandDisplayName: "Command Display Name",
    advanced: "Advanced",
    powerOn: "Set as Power ON command",
    powerOff: "Set as Power OFF command",
    activityInput: "Set as Activity input",
    noActivitiesForHub: "No Activities available for this hub.",
    activityInputLabel: "Activity to apply the input to",
    favorite: "Set as Favorite",
    physicalButtonAssignment: "Physical Button Assignment",
    enableLongPress: "Enable long-press",
    applyToActivities: "Apply to these Activities",
    actionModalNote: "Run an Action whenever the command is performed. Configuring an Action is optional; you can create your own automations that trigger from the Wifi Commands sensor.",
    shortPress: "Short press",
    longPress: "Long press",
    selectLongPressAction: "Select Long-Press Action",
    selectTriggeredAction: "Select Triggered Action",
    action: "Action",
    save: "Save",
    syncWarningTitle: "Sync commands to hub?",
    syncWarningBody: "This sync can run for several minutes. During this process, other interactions with the hub are blocked.",
    syncWarningBody2: "At the end of deployment, the physical remote will be force-resynced. It is recommended to finish your full Wifi Commands setup first, then sync once.",
    syncWarningOptOut: "Don't show this warning again for this remote.",
    syncWarningStart: "Start sync",
    keyLabels: {
      up: "Up",
      down: "Down",
      left: "Left",
      right: "Right",
      ok: "OK",
      back: "Back",
      home: "Home",
      menu: "Menu",
      volup: "Vol +",
      voldn: "Vol -",
      mute: "Mute",
      chup: "Ch +",
      chdn: "Ch -",
      guide: "Guide",
      dvr: "DVR",
      play: "Play",
      exit: "Exit",
      rew: "Rewind",
      pause: "Pause",
      fwd: "Fast Forward",
      red: "Red",
      green: "Green",
      yellow: "Yellow",
      blue: "Blue",
      a: "A",
      b: "B",
      c: "C"
    }
  }
};

// custom_components/sofabaton_x1s/www/src/components/operation-progress.ts
var operationProgressStyles = i`
  .progress-shell {
    --op-progress-radius-lg: var(--ha-card-border-radius, 12px);
    border: 1px solid var(--divider-color);
    border-radius: calc(var(--op-progress-radius-lg) + 4px);
    padding: 18px;
    background: transparent;
    color: var(--primary-text-color);
  }
  .progress-shell[data-mode="restore"] .packet,
  .progress-shell[data-mode="wifi-deploy"] .packet {
    animation-name: opProgressForward;
  }
  .progress-stage {
    position: relative;
    display: flex;
    flex-wrap: nowrap;
    justify-content: center;
    gap: 4px;
    align-items: center;
    min-height: 110px;
    min-width: 0;
  }
  .progress-node { display: grid; justify-items: center; gap: 10px; z-index: 2; }
  .progress-disc {
    width: 76px;
    height: 76px;
    display: grid;
    place-items: center;
    border-radius: var(--op-progress-radius-lg);
    background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 88%, transparent);
    border: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
  }
  .progress-node.home .progress-disc,
  .progress-node.hub .progress-disc { color: var(--primary-color); }
  .progress-disc ha-icon { --mdc-icon-size: 50px; }
  .progress-disc .progress-hub-svg { width: 60px; height: 60px; }
  .progress-node-label {
    color: var(--secondary-text-color);
    font-size: 11px;
    letter-spacing: .08em;
    text-transform: uppercase;
    white-space: nowrap;
  }
  .progress-route { position: relative; flex: 0 1 68px; min-width: 68px; height: 42px; }
  .progress-route::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 2px;
    background: color-mix(in srgb, var(--primary-color) 28%, transparent);
    transform: translateY(-50%);
  }
  .packet {
    position: absolute;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--primary-color);
    box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 14%, transparent);
    animation: opProgressReverse 1.75s cubic-bezier(.55,0,.25,1) infinite;
  }
  .packet:nth-child(2) { animation-delay: .38s; opacity: .78; transform: scale(.82); }
  .packet:nth-child(3) { animation-delay: .76s; opacity: .55; transform: scale(.68); }
  .progress-copy {
    margin-top: 8px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .progress-title {
    font-size: clamp(20px, 3vw, 28px);
    letter-spacing: -.03em;
    font-weight: 700;
  }
  .progress-message { color: var(--secondary-text-color); font-size: 14px; line-height: 1.5; }

  @keyframes opProgressForward {
    0% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
    18% { opacity: 1; }
    82% { opacity: 1; }
    100% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
  }
  @keyframes opProgressReverse {
    0% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
    18% { opacity: 1; }
    82% { opacity: 1; }
    100% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
  }

  @media (max-width: 760px) {
    .progress-disc { width: 64px; height: 64px; }
    .progress-disc ha-icon { --mdc-icon-size: 42px; }
    .progress-disc .progress-hub-svg { width: 50px; height: 50px; }
    .progress-route { flex-basis: 52px; min-width: 52px; }
  }
`;
function renderOperationProgress(view) {
  return T`
    <div class="progress-shell" data-mode=${view.mode} role="status" aria-live="polite">
      <div class="progress-stage">
        <div class="progress-node home">
          <div class="progress-disc"><ha-icon icon="mdi:home-assistant"></ha-icon></div>
          <div class="progress-node-label">${TOOLS_CARD_STRINGS.progress.homeAssistant}</div>
        </div>
        <div class="progress-route" aria-hidden="true">
          <i class="packet"></i>
          <i class="packet"></i>
          <i class="packet"></i>
        </div>
        <div class="progress-node hub">
          <div class="progress-disc">${hubIcon("hero", "progress-hub-svg")}</div>
          <div class="progress-node-label">${TOOLS_CARD_STRINGS.progress.sofabatonHub}</div>
        </div>
      </div>
      <div class="progress-copy">
        <div class="progress-title">${view.title}</div>
        <div class="progress-message">${view.message}</div>
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-state.ts
function findRunningWifiDevice(devices, selectedDeviceKey, selectedSyncStatus, selectedDeviceName = "") {
  const runningDevice = devices.find((device) => String(device?.status || "") === "running");
  if (runningDevice) return runningDevice;
  const deviceKey = String(selectedDeviceKey || "").trim();
  if (deviceKey && String(selectedSyncStatus || "") === "running") {
    return {
      device_key: deviceKey,
      device_name: selectedDeviceName,
      status: "running"
    };
  }
  return null;
}
function shouldFinalizeWifiHubLoad({
  entryId,
  entityId,
  deviceListLoaded
}) {
  return Boolean(String(entryId || "").trim()) && Boolean(String(entityId || "").trim()) && deviceListLoaded;
}
function selectedDeviceOwnsPendingSync({
  selectedDeviceKey,
  commandSyncRunning,
  commandSyncDeviceKey
}) {
  return commandSyncRunning && String(commandSyncDeviceKey || "").trim() !== "" && String(selectedDeviceKey || "").trim() === String(commandSyncDeviceKey || "").trim();
}

// custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab.ts
var SLOT_COUNT = 10;
var INPUT_ICON = "mdi:video-input-hdmi";
var WIFI_COMMANDS_DOCS_URL = TOOLS_CARD_STRINGS.wifiCommands.docsUrl;
var ID = {
  UP: 174,
  DOWN: 178,
  LEFT: 175,
  RIGHT: 177,
  OK: 176,
  BACK: 179,
  HOME: 180,
  MENU: 181,
  VOL_UP: 182,
  VOL_DOWN: 185,
  MUTE: 184,
  CH_UP: 183,
  CH_DOWN: 186,
  GUIDE: 157,
  DVR: 155,
  PLAY: 156,
  EXIT: 154,
  A: 153,
  B: 152,
  C: 151,
  REW: 187,
  PAUSE: 188,
  FWD: 189,
  RED: 190,
  GREEN: 191,
  YELLOW: 192,
  BLUE: 193
};
var HARD_BUTTON_ICONS = {
  up: "mdi:arrow-up-bold",
  down: "mdi:arrow-down-bold",
  left: "mdi:arrow-left-bold",
  right: "mdi:arrow-right-bold",
  ok: "mdi:check-circle-outline",
  back: "mdi:arrow-u-left-top",
  home: "mdi:home-outline",
  menu: "mdi:menu",
  volup: "mdi:volume-plus",
  voldn: "mdi:volume-minus",
  mute: "mdi:volume-mute",
  chup: "mdi:chevron-up-circle-outline",
  chdn: "mdi:chevron-down-circle-outline",
  guide: "mdi:television-guide",
  dvr: "mdi:record-rec",
  play: "mdi:play-circle-outline",
  exit: "mdi:close-circle-outline",
  rew: "mdi:rewind",
  pause: "mdi:pause-circle-outline",
  fwd: "mdi:fast-forward",
  red: "mdi:circle",
  green: "mdi:circle",
  yellow: "mdi:circle",
  blue: "mdi:circle",
  a: "mdi:alpha-a-circle-outline",
  b: "mdi:alpha-b-circle-outline",
  c: "mdi:alpha-c-circle-outline"
};
var DEFAULT_KEY_LABELS = TOOLS_CARD_STRINGS.wifiCommands.keyLabels;
var HARD_BUTTON_ID_MAP = {
  up: ID.UP,
  down: ID.DOWN,
  left: ID.LEFT,
  right: ID.RIGHT,
  ok: ID.OK,
  back: ID.BACK,
  home: ID.HOME,
  menu: ID.MENU,
  volup: ID.VOL_UP,
  voldn: ID.VOL_DOWN,
  mute: ID.MUTE,
  chup: ID.CH_UP,
  chdn: ID.CH_DOWN,
  guide: ID.GUIDE,
  dvr: ID.DVR,
  play: ID.PLAY,
  exit: ID.EXIT,
  rew: ID.REW,
  pause: ID.PAUSE,
  fwd: ID.FWD,
  red: ID.RED,
  green: ID.GREEN,
  yellow: ID.YELLOW,
  blue: ID.BLUE,
  a: ID.A,
  b: ID.B,
  c: ID.C
};
var X2_ONLY_HARD_BUTTON_IDS = /* @__PURE__ */ new Set([ID.C, ID.B, ID.A, ID.EXIT, ID.DVR, ID.PLAY, ID.GUIDE]);
var DEFAULT_ACTION = { action: "perform-action" };
var WIFI_SECTION_ROW = [{ id: "wifi", label: TOOLS_CARD_STRINGS.wifiCommands.sectionLabel, icon: "mdi:wifi", passive: true }];
var SofabatonWifiCommandsTab = class _SofabatonWifiCommandsTab extends i3 {
  constructor() {
    super(...arguments);
    this.hubCommandBusy = false;
    this.hubCommandBusyLabel = null;
    this.blockedTitle = null;
    this.blockedMessage = null;
    this.lastWifiPress = null;
    this._irFlashClearTimer = null;
    this._irFlashClearForReceivedAt = null;
    this._commandsData = this._normalizeCommandsForStorage([]);
    this._wifiDevices = [];
    this._selectedDeviceKey = null;
    this._configLoadedForEntryId = null;
    this._commandConfigLoading = false;
    this._deviceListLoading = false;
    this._syncState = this._defaultSyncState();
    this._commandSyncLoading = false;
    this._commandSyncRunning = false;
    this._commandSyncDeviceKey = null;
    this._commandSyncPollTimer = null;
    this._activeCommandSlot = null;
    this._activeCommandModal = null;
    this._confirmClearSlot = null;
    this._commandSaveError = "";
    this._activeCommandActionTab = "short";
    this._syncWarningOpen = false;
    this._syncWarningOptOut = false;
    this._advancedOptionsOpen = false;
    this._commandEditorDrafts = {};
    this._shortSelectorVersion = 0;
    this._longSelectorVersion = 0;
    this._createDeviceModalOpen = false;
    this._newDeviceName = "";
    this._deviceMutationError = "";
    this._deleteDeviceKey = null;
    this._deletingDeviceKey = null;
    this._creatingDevice = false;
    this._maxWifiDevices = 5;
    this._deviceSessionRestoreTried = false;
    this._saveActiveCommandModal = async () => {
      if (!Number.isInteger(this._activeCommandSlot)) return;
      const idx = Number(this._activeCommandSlot);
      const draft = this._activeCommandDraft();
      if (!draft) return;
      const validationMessage = this._commandSaveValidationMessage(draft);
      if (validationMessage) {
        this._commandSaveError = validationMessage;
        return;
      }
      const next = this._commandsList().slice();
      next[idx] = this._cloneCommandSlot(draft);
      if (next[idx].is_power_on) {
        next.forEach((slot, slotIdx) => {
          if (slotIdx !== idx && slot.is_power_on) next[slotIdx] = this._cloneCommandSlot({ ...slot, is_power_on: false });
        });
      }
      if (next[idx].is_power_off) {
        next.forEach((slot, slotIdx) => {
          if (slotIdx !== idx && slot.is_power_off) next[slotIdx] = this._cloneCommandSlot({ ...slot, is_power_off: false });
        });
      }
      const inputActivityId = String(next[idx].input_activity_id || "").trim();
      if (inputActivityId) {
        next.forEach((slot, slotIdx) => {
          if (slotIdx !== idx && String(slot.input_activity_id || "").trim() === inputActivityId)
            next[slotIdx] = this._cloneCommandSlot({ ...slot, input_activity_id: "" });
        });
      }
      const hardButton = String(next[idx].hard_button || "").trim();
      if (hardButton) {
        next.forEach((slot, slotIdx) => {
          if (slotIdx !== idx && String(slot.hard_button || "").trim() === hardButton)
            next[slotIdx] = this._cloneCommandSlot({ ...slot, hard_button: "", long_press_enabled: false, long_press_action: { ...DEFAULT_ACTION } });
        });
        await this._clearButtonFromOtherDevices(hardButton, String(this._selectedDeviceKey || ""));
      }
      this._commandSaveError = "";
      delete this._commandEditorDrafts[idx];
      this._commandEditorDrafts = { ...this._commandEditorDrafts };
      this._activeCommandModal = null;
      this._activeCommandSlot = null;
      await this._setCommands(next);
    };
    this._closeCommandEditor = () => {
      if (Number.isInteger(this._activeCommandSlot)) {
        delete this._commandEditorDrafts[Number(this._activeCommandSlot)];
        this._commandEditorDrafts = { ...this._commandEditorDrafts };
      }
      this._commandSaveError = "";
      this._advancedOptionsOpen = false;
      this._activeCommandModal = null;
      this._activeCommandSlot = null;
    };
    this._closeCommandActionEditor = () => {
      if (Number.isInteger(this._activeCommandSlot)) {
        delete this._commandEditorDrafts[Number(this._activeCommandSlot)];
        this._commandEditorDrafts = { ...this._commandEditorDrafts };
      }
      this._commandSaveError = "";
      this._activeCommandModal = null;
      this._activeCommandSlot = null;
    };
    this._closeOnBackdrop = () => {
      if (this._activeCommandModal === "action") this._closeCommandActionEditor();
      else this._closeCommandEditor();
    };
    this._goBackToDeviceList = () => {
      this._selectedDeviceKey = null;
      this._commandsData = this._normalizeCommandsForStorage([]);
      if (this._syncState.status !== "running") {
        this._syncState = this._defaultSyncState();
      }
      const key = this._deviceSessionStorageKey();
      if (key) {
        try {
          window.localStorage?.removeItem(key);
        } catch {
        }
      }
    };
    this._openCreateDeviceModal = () => {
      if (this._hubCommandLocked()) return;
      this._newDeviceName = "";
      this._deviceMutationError = "";
      this._createDeviceModalOpen = true;
    };
    this._closeCreateDeviceModal = () => {
      this._createDeviceModalOpen = false;
      this._deviceMutationError = "";
    };
    this._closeDeleteDeviceModal = () => {
      this._deleteDeviceKey = null;
      this._deviceMutationError = "";
    };
    this._deleteWifiDevice = async () => {
      const entityId = String(this._entityId() || "").trim();
      const deviceKey = String(this._deleteDeviceKey || "").trim();
      if (!entityId || !deviceKey || !this.hass?.callWS) return;
      if (this._hubCommandLocked()) return;
      this._closeDeleteDeviceModal();
      this._deletingDeviceKey = deviceKey;
      this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.deleteDeviceBusy);
      try {
        await this.hass.callWS({
          type: "sofabaton_x1s/command_device/delete",
          entity_id: entityId,
          device_key: deviceKey
        });
        if (this._selectedDeviceKey === deviceKey) this._goBackToDeviceList();
        await this._loadWifiDevices(true);
        await this._refreshControlPanelState();
      } catch (error) {
        this._deviceMutationError = String(error?.message || TOOLS_CARD_STRINGS.wifiCommands.deleteDeviceFailed);
        this._deleteDeviceKey = deviceKey;
      } finally {
        this._deletingDeviceKey = null;
        this._setSharedHubCommandBusy(false);
      }
    };
    this._confirmSyncWarning = async () => {
      const entityId = String(this._entityId() || "").trim();
      if (entityId && this._syncWarningOptOut) this._setCommandSyncWarningOptOut(entityId, true);
      this._syncWarningOpen = false;
      await this._startCommandConfigSync();
    };
    this._runCommandConfigSync = async () => {
      if (this._commandSyncRunning || this._hubCommandLocked()) return;
      const entityId = String(this._entityId() || "").trim();
      const deviceKey = String(this._selectedDeviceKey || "").trim();
      if (!entityId) return;
      if (!deviceKey) return;
      if (this._commandSyncWarningOptedOut(entityId)) {
        await this._startCommandConfigSync();
        return;
      }
      this._syncWarningOptOut = false;
      this._syncWarningOpen = true;
    };
  }
  static {
    this._DEVICE_SESSION_KEY_PREFIX = "sofabaton_x1s:wifi_commands:selected_device:";
  }
  static {
    // Matches the dock wipe (and the slot/card glow keyframes) at 720ms.
    this._IR_FLASH_DURATION_MS = 720;
  }
  static {
    this.properties = {
      hass: { attribute: false },
      hub: { attribute: false },
      setHubCommandBusy: { attribute: false },
      refreshControlPanelState: { attribute: false },
      lastWifiPress: { attribute: false },
      hubCommandBusy: { type: Boolean },
      hubCommandBusyLabel: { type: String },
      loading: { type: Boolean },
      error: { type: String },
      blockedTitle: { type: String },
      blockedMessage: { type: String },
      _commandsData: { state: true },
      _wifiDevices: { state: true },
      _selectedDeviceKey: { state: true },
      _configLoadedForEntryId: { state: true },
      _commandConfigLoading: { state: true },
      _deviceListLoading: { state: true },
      _syncState: { state: true },
      _commandSyncLoading: { state: true },
      _commandSyncRunning: { state: true },
      _commandSyncDeviceKey: { state: true },
      _activeCommandSlot: { state: true },
      _activeCommandModal: { state: true },
      _confirmClearSlot: { state: true },
      _commandSaveError: { state: true },
      _activeCommandActionTab: { state: true },
      _syncWarningOpen: { state: true },
      _syncWarningOptOut: { state: true },
      _advancedOptionsOpen: { state: true },
      _commandEditorDrafts: { state: true },
      _shortSelectorVersion: { state: true },
      _longSelectorVersion: { state: true },
      _createDeviceModalOpen: { state: true },
      _newDeviceName: { state: true },
      _deviceMutationError: { state: true },
      _deleteDeviceKey: { state: true },
      _deletingDeviceKey: { state: true },
      _creatingDevice: { state: true },
      _maxWifiDevices: { state: true }
    };
  }
  static {
    this.styles = [secondaryTabStyles, operationProgressStyles, i`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      --tools-radius-sm: calc(var(--ha-card-border-radius, 12px) * 0.85);
      --tools-radius-md: var(--ha-card-border-radius, 12px);
      --tools-radius-lg: calc(var(--ha-card-border-radius, 12px) * 1.33);
      --tools-radius-xl: calc(var(--ha-card-border-radius, 12px) * 1.8);
      --tools-radius-pill: 999px;
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow: hidden; }
    .tab-panel--detail { padding: 0; }
    .list-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; }
    .list-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; padding: 16px 18px 16px 16px; }
    .detail-view { min-height: 0; display: flex; flex-direction: column; gap: 0; overflow: hidden; }
    .sticky-header, .sticky-footer { position: sticky; z-index: 2; background: var(--ha-card-background, var(--card-background-color)); }
    .sticky-header { padding: 12px 16px; }
    .sticky-header { top: 0; border-bottom: 1px solid var(--divider-color); }
    .sticky-footer { bottom: 0; border-top: 1px solid var(--divider-color); padding: 0; }
    .detail-scroll { flex: 1; min-height: 0; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
    .detail-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
    .detail-title-main { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
    .detail-title-actions { display: flex; align-items: center; gap: 8px; flex: 0 0 auto; }
    .detail-title { font-size: 18px; font-weight: 700; color: var(--primary-text-color); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .back-btn, .list-action-btn, .detail-sync-btn, .device-delete-btn { border: 1px solid var(--divider-color); border-radius: var(--tools-radius-sm); background: transparent; color: var(--primary-text-color); font: inherit; }
    .back-btn, .list-action-btn, .detail-sync-btn { padding: 8px 12px; font-weight: 700; cursor: pointer; }
    .back-btn { display: inline-flex; align-items: center; gap: 8px; }
    .list-header { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; column-gap: 16px; row-gap: 8px; }
    .list-header-copy { min-width: 0; }
    .list-header-copy .section-subtitle { margin-top: 0; }
    .list-header-action { grid-column: 2; grid-row: 1; align-self: start; display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
    .device-list { display: grid; gap: 6px; }
    .device-card { position: relative; width: 100%; max-width: 100%; box-sizing: border-box; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); padding: 9px 10px 9px 12px; background: var(--secondary-background-color, var(--ha-card-background)); text-align: left; display: flex; align-items: center; gap: 10px; cursor: pointer; overflow: hidden; box-shadow: none; transition: border-color 120ms ease, background-color 120ms ease; }
    .device-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
    .device-card.pending-delete { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 45%, var(--divider-color)); }
    /* Wifi command press glow — a soft one-shot primary-color ring on
       the device card (list view) or the slot tile (detail view) when
       the matching command is pressed on the physical remote. Same
       720ms timing as the dock wipe and the same color language, so
       the three signals read as one feature. */
    .wifi-ir-flash {
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      box-shadow:
        inset 0 0 0 2px color-mix(in srgb, var(--primary-color) 75%, transparent),
        inset 0 0 14px color-mix(in srgb, var(--primary-color) 22%, transparent),
        0 0 14px color-mix(in srgb, var(--primary-color) 30%, transparent);
      opacity: 0;
      animation: wifiIrGlow 720ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 forwards;
    }
    @keyframes wifiIrGlow {
      0% { opacity: 0; }
      18% { opacity: 1; }
      80% { opacity: 0.7; }
      100% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .wifi-ir-flash { animation: none; opacity: 0; }
    }
    .device-card:hover, .back-btn:hover, .list-action-btn:hover, .detail-sync-btn:hover, .device-delete-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .device-card-main { min-width: 0; flex: 1; display: flex; align-items: center; gap: 10px; }
    .device-card-lead { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .device-card-lead ha-icon { --mdc-icon-size: 20px; }
    .device-card-name { flex: 1; font-size: 13px; font-weight: 700; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
    .device-card-meta { font-size: 12px; color: var(--secondary-text-color); display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; min-width: 0; margin-left: auto; flex-shrink: 0; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 11px; font-size: 12px; font-weight: 700; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); white-space: nowrap; flex: 0 0 auto; }
    .status-pill.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); color: #2e7d32; }
    .status-pill.sync-error { border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color)); color: var(--error-color, #db4437); }
    .status-pill.sync-running { border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color)); color: var(--primary-color); }
    .status-pill.sync-pending { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 40%, var(--divider-color)); color: var(--warning-color, #f59e0b); }
    .status-pill.sync-ok { background: color-mix(in srgb, #48b851 16%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill.sync-error { background: color-mix(in srgb, var(--error-color, #db4437) 12%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill.sync-running { background: color-mix(in srgb, var(--primary-color) 12%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill.sync-pending { background: color-mix(in srgb, var(--warning-color, #f59e0b) 12%, var(--ha-card-background, var(--card-background-color))); }
    .status-pill ha-icon { --mdc-icon-size: 18px; }
    .device-status-pill { min-width: 0; }
    .device-status-pill-label { min-width: 0; }
    .device-card-count { white-space: nowrap; font-size: 12px; color: var(--primary-text-color); flex-shrink: 0; }
    .device-card-count-strong { font-weight: 700; }
    .device-card-actions { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; margin-left: 4px; }
    .device-delete-btn { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; color: var(--secondary-text-color); flex: 0 0 auto; }
    .device-delete-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
      background: transparent;
    }
    .device-delete-btn:disabled:hover {
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .list-action-btn:disabled,
    .detail-sync-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .list-action-btn:disabled:hover,
    .detail-sync-btn:disabled:hover {
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .detail-sync-btn.detail-sync-btn--state-ok {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: #2e7d32;
      opacity: 1;
    }
    .detail-sync-btn.detail-sync-btn--state-ok:disabled {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: #2e7d32;
      opacity: 1;
    }
    .empty-state-card { border: 1px dashed var(--divider-color); border-radius: var(--tools-radius-md); padding: 18px; color: var(--secondary-text-color); line-height: 1.5; }
    .bottom-dock-status {
      width: 100%;
      min-height: 0;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      border: 0;
      border-radius: 0;
      background: var(--ha-card-background, var(--card-background-color));
      padding: 10px 16px;
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 14px;
      line-height: 1.35;
      text-align: center;
    }
    .bottom-dock-status > span:last-child { min-width: 0; }
    .dock-status-indicator {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      flex: 0 0 auto;
      background: color-mix(in srgb, var(--divider-color) 78%, var(--secondary-text-color));
    }
    .dock-status-indicator.status-success { background: #48b851; }
    .dock-status-indicator.status-warning { background: var(--warning-color, #f59e0b); }
    .dock-status-indicator.status-error { background: var(--error-color, #db4437); }
    .dock-status-indicator.status-progress { background: var(--primary-color); }
    .state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
    .state.error { color: var(--error-color, #db4437); }
    .blocked-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.6;
    }
    .blocked-state-title {
      color: var(--primary-text-color);
      font-size: 16px;
      font-weight: 700;
    }
    .blocked-state-sub {
      max-width: 340px;
      font-size: 13px;
    }
    .acc-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .section-title-wrap { display: flex; align-items: center; gap: 8px; }
    .section-subtitle, .dialog-note, .dialog-footer-note, .slot-confirm-sub, .sync-message, .sync-warning-text, .empty-hint { color: var(--secondary-text-color); }
    .section-subtitle { font-size: 13px; line-height: 1.5; }
    .sync-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-lg); background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 82%, transparent); }
    .sync-row.sync-error { border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color)); }
    .sync-row.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); }
    .sync-row.sync-running { border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color)); }
    .sync-message-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; flex-wrap: wrap; }
    .sync-message { font-size: 13px; line-height: 1.4; }
    .sync-doc-link { color: var(--primary-color); font-weight: 600; text-decoration: none; }
    .sync-doc-link:hover { text-decoration: underline; }
    .list-view .sticky-footer { border-top: none; }
    .wifi-max-devices-note { display: flex; justify-content: center; padding: 8px 16px 4px; font-size: 13px; color: var(--secondary-text-color); }
    .sync-btn, .dialog-btn, .slot-action-btn, .sync-static { border: 1px solid var(--divider-color); border-radius: var(--tools-radius-sm); padding: 8px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .sync-btn, .dialog-btn, .slot-action-btn, .activity-chip, .checkbox-row, .slot-btn, .icon-btn, .action-tab { cursor: pointer; }
    .sync-btn:hover, .dialog-btn:hover, .slot-action-btn:hover, .activity-chip:hover, .action-tab:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .sync-btn-primary, .dialog-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .sync-static { opacity: 0.65; cursor: default; }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-md); min-height: 108px; cursor: pointer; padding: 0; text-align: left; display: flex; flex-direction: column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
    .slot-btn:hover { border-color: var(--primary-color); }
    .slot-btn.slot-empty .slot-main { gap: 12px; align-items: center; justify-content: center; flex-direction: column; min-height: 100%; width: 100%; padding: 0; text-align: center; }
    .slot-btn.slot-confirming {
      justify-content: center;
      padding: 0px 12px;
      gap: 6px;
      min-height: 0;
      height: 100%;
    }
    .slot-main { position: relative; display: flex; align-items: flex-start; gap: 8px; padding: 14px 12px 10px; min-width: 0; width: 100%; border: 0; background: transparent; cursor: pointer; text-align: left; }
    .slot-name, .dialog-title, .slot-confirm-title { color: var(--primary-text-color); font-weight: 700; }
    .slot-name { font-size: 15px; line-height: 1.25; overflow-wrap: anywhere; }
    .slot-text-wrap { min-width: 0; flex: 1; text-align: left; }
    .slot-meta { margin-top: 3px; font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display: flex; align-items: center; gap: 4px; }
    .slot-favorite { color: var(--error-color); display: inline-flex; }
    .slot-favorite ha-icon { --mdc-icon-size: 14px; }
    .slot-meta-icon { color: var(--state-icon-color); display: inline-flex; }
    .slot-meta-icon.warning { color: var(--error-color, #db4437); }
    .slot-meta-icon ha-icon { --mdc-icon-size: 14px; }
    .slot-actions { position: absolute; top: 8px; right: 8px; display: flex; align-items: center; gap: 6px; z-index: 1; }
    .slot-flag,
    .slot-clear { width: 26px; height: 26px; min-width: 26px; border-radius: var(--tools-radius-sm); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; padding: 0; opacity: 0.9; }
    .slot-flag { cursor: default; }
    .slot-flag.power-on { color: #2e7d32; border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color)); }
    .slot-flag.power-off { color: #c62828; border-color: color-mix(in srgb, #c62828 35%, var(--divider-color)); }
    .slot-flag.power-both { color: #f59e0b; border-color: color-mix(in srgb, #f59e0b 35%, var(--divider-color)); }
    .slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
    .slot-clear ha-icon { --mdc-icon-size: 16px; }
    .slot-flag ha-icon { --mdc-icon-size: 14px; }
    .slot-clear { cursor: pointer; }
    .slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-sm); min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
    .slot-action-btn:hover { border-color: var(--primary-color); background: var(--ha-card-background, var(--card-background-color)); }
    .slot-action-btn:active { transform: translateY(1px); }
    .slot-confirm-title { font-size: 15px; line-height: 1.2; margin: 0; }
    .slot-confirm-sub { font-size: 12px; line-height: 1.3; margin: 0; }
    .slot-confirm-actions { display: flex; gap: 8px; margin-top: 2px; }
    .slot-btn.slot-confirming .dialog-btn {
      min-height: 40px;
      min-width: 72px;
      padding: 0 10px;
      font-size: 13px;
    }
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: var(--tools-radius-lg); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
    .dialog.small { width: min(500px, calc(100vw - 36px)); }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; flex: 1; }
    .dialog-close,
    .icon-btn {
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--divider-color);
      border-radius: var(--tools-radius-sm);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease, color 120ms ease;
    }
    .dialog-close:hover,
    .icon-btn:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }
    .dialog-close:active,
    .icon-btn:active {
      transform: translateY(1px);
    }
    .dialog-close:focus-visible,
    .icon-btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent);
    }
    .dialog-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      /* Match the remote card's HA form theming fix. HA frontend controls can
         fall back to a light default when --ha-color-form-background is absent. */
      --ha-color-form-background: var(
        --input-fill-color,
        var(
          --secondary-background-color,
          color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black)
        )
      );
      --ha-color-form-background-hover: var(--ha-color-form-background);
    }
    .dialog-note {
      border: 1px solid color-mix(in srgb, var(--info-color, var(--primary-color)) 42%, var(--divider-color));
      border-radius: var(--tools-radius-md);
      padding: 12px;
      background: color-mix(in srgb, var(--info-color, var(--primary-color)) 12%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
      line-height: 1.45;
      display: flex;
      align-items: flex-start;
      gap: 10px;
    }
    .dialog-note::before {
      content: "";
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: color-mix(in srgb, var(--info-color, var(--primary-color)) 22%, transparent);
      flex: 0 0 18px;
      margin-top: 1px;
    }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .dialog-footer-note { min-height: 18px; font-size: 13px; color: var(--error-color, #db4437); }
    .config-block { display: grid; gap: 14px; }
    .config-group { display: grid; gap: 14px; padding: 14px; border: 1px solid var(--divider-color); border-radius: var(--tools-radius-md); background: color-mix(in srgb, var(--ha-card-background, transparent) 92%, #000); }
    .advanced-toggle { width: fit-content; border: 0; background: transparent; color: var(--secondary-text-color); padding: 0; display: inline-flex; align-items: center; gap: 6px; text-align: left; font: inherit; font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
    .advanced-toggle:hover { color: var(--primary-text-color); }
    .advanced-toggle-copy { display: block; }
    .advanced-toggle ha-icon { --mdc-icon-size: 18px; transition: transform 120ms ease; }
    .advanced-toggle.expanded ha-icon { transform: rotate(180deg); }
    .advanced-panel { display: grid; gap: 14px; padding-top: 2px; }
    .checkbox-row { width: 100%; box-sizing: border-box; border: 0; background: transparent; padding: 0; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 10px; row-gap: 2px; font-size: 13px; cursor: pointer; color: inherit; text-align: left; }
    .checkbox-row[disabled] { cursor: default; opacity: 0.6; }
    .checkbox-row.active .checkbox-icon { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
    .checkbox-left { display: contents; }
    .checkbox-copy { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; text-align: left; }
    .checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--divider-color); background: color-mix(in srgb, var(--ha-card-background, transparent) 88%, #000); display: flex; align-items: center; justify-content: center; transition: background-color 120ms ease, border-color 120ms ease; }
    .checkbox-icon ha-icon { --mdc-icon-size: 16px; }
    .checkbox-icon.power-on { color: #2e7d32; background: color-mix(in srgb, #2e7d32 18%, var(--ha-card-background, transparent)); }
    .checkbox-icon.power-off { color: #c62828; background: color-mix(in srgb, #c62828 18%, var(--ha-card-background, transparent)); }
    .checkbox-icon.input { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, var(--ha-card-background, transparent)); }
    .checkbox-copy > span:first-child { font-size: 14px; line-height: 1.35; }
    .checkbox-subtext { min-height: 1.35em; font-size: 12px; line-height: 1.35; color: var(--secondary-text-color); white-space: normal; }
    .button-conflict-hint { font-size: 12px; line-height: 1.35; color: var(--warning-color, var(--secondary-text-color)); padding: 2px 0 4px; }
    .checkbox-row ha-switch { align-self: center; }
    .checkbox-row.nested-control { padding-left: 36px; }
    .input-selector-wrap.nested-control { box-sizing: border-box; padding-left: 36px; }
    .activities-label, .warning-label, .action-helper { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary-text-color); }
    .activities-label.disabled { opacity: 0.55; }
    .input-selector-wrap[disabled] { opacity: 0.6; pointer-events: none; }
    .activity-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .activity-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; font: inherit; }
    .activity-chip.active, .action-tab.active { background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); color: var(--primary-color); }
    .activity-chip.disabled,
    .activity-chip:disabled,
    .activity-chip.disabled.active,
    .activity-chip:disabled.active {
      opacity: 0.45;
      cursor: default;
      border-color: var(--divider-color);
      background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000);
      color: inherit;
      pointer-events: none;
    }
    .activity-chip.disabled:hover,
    .activity-chip:disabled:hover,
    .activity-chip.disabled.active:hover,
    .activity-chip:disabled.active:hover {
      border-color: var(--divider-color);
      background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000);
      color: inherit;
    }
    .action-tabs { display: flex; gap: 8px; }
    .action-tab { border: 1px solid var(--divider-color); border-radius: 999px; padding: 7px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .action-selector-wrap[hidden] { display: none; }
    .dialog-text { font-size: 14px; line-height: 1.55; color: var(--primary-text-color); }
    .warning-optout { display: flex; align-items: center; gap: 10px; }
    .dialog-body ha-input,
    .dialog-body ha-textfield,
    .dialog-body ha-selector {
      width: 100%;
      --mdc-select-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-select-hover-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-select-idle-line-color: var(--divider-color);
      --mdc-select-hover-line-color: var(--primary-color);
      --mdc-select-focused-line-color: var(--primary-color);
      --mdc-select-label-ink-color: var(--secondary-text-color);
      --mdc-select-ink-color: var(--primary-text-color);
      --mdc-theme-on-surface: var(--primary-text-color);
      --mdc-theme-text-primary-on-background: var(--primary-text-color);
      --mdc-theme-primary: var(--primary-color);
    }
    .dialog-body ha-input {
      --ha-input-padding-top: 0;
      --ha-input-padding-bottom: 0;
    }
    @media (max-width: 640px) {
      .command-grid { grid-template-columns: 1fr; }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small { width: 100%; max-height: 100%; border-radius: 0 0 var(--tools-radius-lg) var(--tools-radius-lg); }
      .dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
      .list-header { grid-template-columns: 1fr; }
      .list-header-action { grid-column: 1; grid-row: auto; width: 100%; }
      .list-header-action > .detail-sync-btn,
      .list-header-action > .list-action-btn { width: 100%; justify-content: center; }
      .detail-title-row { gap: 8px; }
      .detail-title-main { min-width: 0; flex: 1; }
      .detail-title-actions { gap: 6px; min-width: max-content; }
      .detail-sync-btn, .list-action-btn { flex: 0 0 auto; white-space: nowrap; }
      .device-card { align-items: center; gap: 10px; padding: 10px 12px; }
      .device-card-main { align-items: center; flex-direction: row; gap: 10px; }
      .device-card-name { flex: 1; }
      .device-card-meta { margin-left: auto; flex-wrap: nowrap; gap: 8px; }
      .device-card-count { font-size: 12px; }
      .device-status-pill { padding: 6px; min-width: 32px; justify-content: center; }
      .device-status-pill-label { display: none; }
      .sync-row { align-items: flex-start; flex-direction: column; }
    }
  `];
  }
  connectedCallback() {
    super.connectedCallback();
    void this._ensureLoadedForCurrentHub();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._clearPollTimer();
    if (this._irFlashClearTimer) {
      clearTimeout(this._irFlashClearTimer);
      this._irFlashClearTimer = null;
      this._irFlashClearForReceivedAt = null;
    }
  }
  updated(changed) {
    if (changed.has("hub")) this._deviceSessionRestoreTried = false;
    if (changed.has("hub") || changed.has("hass")) void this._ensureLoadedForCurrentHub();
    if (changed.has("hub") || changed.has("_selectedDeviceKey")) this._persistSelectedDeviceSession();
    this._scheduleSyncPoll();
    this.renderRoot.querySelectorAll("ha-selector[data-hide-action-type='1']").forEach((element) => this._hideUiActionTypeSelector(element));
  }
  _useLegacyTextField() {
    return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
  }
  render() {
    if (this.loading) return T`<div class="state">Loading...</div>`;
    if (this.error) return T`<div class="state error">${this.error}</div>`;
    if (!this.hub) return T`<div class="state">No hubs found.</div>`;
    if (this.blockedTitle && this.blockedMessage) {
      return T`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">${this.blockedTitle}</div>
            <div class="blocked-state-sub">${this.blockedMessage}</div>
          </div>
        </div>
      `;
    }
    const selectedDevice = this._selectedWifiDevice();
    if (!selectedDevice) {
      return T`
        <div class="tab-panel">
          ${renderSecondaryTabShell({
        connected: true,
        items: [...WIFI_SECTION_ROW],
        selectedId: "wifi",
        shellClassName: "secondary-view-shell--edge",
        content: renderSecondaryViewBody({
          connected: true,
          padded: false,
          scroll: false,
          className: "list-view",
          content: this._renderDeviceListView()
        })
      })}
          ${this._renderDetailsModal()}
          ${this._renderActionModal()}
          ${this._renderSyncWarningModal()}
          ${this._renderCreateDeviceModal()}
          ${this._renderDeleteDeviceModal()}
        </div>
      `;
    }
    const remoteUnavailable = this._remoteUnavailable();
    const syncRunning = this._syncState.status === "running";
    return this._renderSelectedDeviceView({
      selectedDevice,
      remoteUnavailable,
      syncRunning
    });
  }
  _renderSelectedDeviceView({
    selectedDevice,
    remoteUnavailable,
    syncRunning
  }) {
    const externallyLocked = this._hubCommandLocked() && !this._selectedDeviceOwnsPendingSync();
    return T`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._goBackToDeviceList}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title">${selectedDevice.device_name}</div>
              </div>
              <div class="detail-title-actions">
                ${this._renderSyncActionButton({ remoteUnavailable, syncRunning, externallyLocked })}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            ${remoteUnavailable ? A : syncRunning ? renderOperationProgress({
      mode: "wifi-deploy",
      title: TOOLS_CARD_STRINGS.wifiCommands.deployingTitle,
      message: String(this._syncState.message || TOOLS_CARD_STRINGS.wifiCommands.syncInProgress)
    }) : T`
                    <div class="command-grid">
                      ${(() => {
      const press = this._activeWifiPressFlash();
      return this._commandsList().map((command, idx) => this._renderSlot(command, idx, press));
    })()}
                    </div>
                  `}
          </div>
        </div>
        ${this._renderDetailsModal()}
        ${this._renderActionModal()}
        ${this._renderSyncWarningModal()}
        ${this._renderCreateDeviceModal()}
        ${this._renderDeleteDeviceModal()}
      </div>
    `;
  }
  _renderDeviceListView() {
    const canAdd = this._wifiDevices.length < this._maxWifiDevices;
    const irFlash = this._activeWifiPressFlash();
    return T`
      <div class="list-scroll">
        <div class="list-header">
          <div class="list-header-copy">
            <div class="section-subtitle">${TOOLS_CARD_STRINGS.wifiCommands.sectionSubtitle}</div>
          </div>
          <div class="list-header-action">
            <button class="detail-sync-btn" ?disabled=${!canAdd || this._hubCommandLocked() || this._creatingDevice} @click=${this._openCreateDeviceModal}>
              ${TOOLS_CARD_STRINGS.wifiCommands.addDevice}
            </button>
          </div>
        </div>
        ${this._wifiDevices.length ? T`
          <div class="device-list">
            ${this._wifiDevices.map((device) => T`
              <div
                class="device-card ${device.device_key === this._deletingDeviceKey ? "pending-delete" : ""}"
                role="button"
                tabindex=${this._deletingDeviceKey === device.device_key ? -1 : 0}
                aria-disabled=${String(device.device_key === this._deletingDeviceKey)}
                @click=${device.device_key === this._deletingDeviceKey ? null : () => this._selectWifiDevice(device.device_key)}
                @keydown=${device.device_key === this._deletingDeviceKey ? null : ((event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        this._selectWifiDevice(device.device_key);
      }
    })}
              >
                <div class="device-card-main">
                  <span class="device-card-lead"><ha-icon icon="mdi:wifi"></ha-icon></span>
                  <div class="device-card-name">${device.device_name}</div>
                  <div class="device-card-meta">
                    <span class="status-pill device-status-pill ${this._deviceStatusTone(device)}">
                      <ha-icon icon=${this._deviceStatusIcon(device)}></ha-icon>
                      <span class="device-status-pill-label">${this._deviceStatusLabel(device)}</span>
                    </span>
                    <span class="device-card-count"><span class="device-card-count-strong">${Number(device.configured_slot_count || 0)}</span> slot${Number(device.configured_slot_count || 0) === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div class="device-card-actions">
                  <button class="device-delete-btn" title="Delete Wifi Device" ?disabled=${this._hubCommandLocked() || device.device_key === this._deletingDeviceKey} @click=${(event) => this._promptDeleteDevice(device.device_key, event)}>
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </button>
                </div>
                ${irFlash && this._pressMatchesDevice(irFlash, device) ? i5(irFlash.receivedAt, T`<div class="wifi-ir-flash" aria-hidden="true"></div>`) : A}
              </div>
            `)}
          </div>
        ` : T`<div class="empty-state-card">No Wifi Devices configured yet. Add one to start assigning command slots.</div>`}
        <div class="sticky-footer">
          ${!canAdd ? T`<div class="wifi-max-devices-note">Maximum number of devices reached</div>` : A}
        </div>
      </div>
    `;
  }
  _renderCreateDeviceModal() {
    if (!this._createDeviceModalOpen) return A;
    return T`
      <div class="modal-backdrop" @click=${this._closeCreateDeviceModal}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.addDevice}</div>
            <button class="dialog-close" @click=${this._closeCreateDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._useLegacyTextField() ? T`
                  <ha-textfield
                    id="sb-new-device-name"
                    .label=${"Device name"}
                    .maxLength=${20}
                    .value=${this._newDeviceName}
                    .disabled=${this._creatingDevice}
                    @input=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeWifiDeviceName(input.value);
      input.value = value;
      this._newDeviceName = value;
      this._deviceMutationError = "";
    }}
                    @change=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeWifiDeviceName(input.value);
      input.value = value;
      this._newDeviceName = value;
      this._deviceMutationError = "";
    }}
                    @keydown=${(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this._createWifiDevice();
      }
    }}
                  ></ha-textfield>
                ` : T`
                  <ha-input
                    id="sb-new-device-name"
                    type="text"
                    .label=${"Device name"}
                    .maxlength=${20}
                    .value=${this._newDeviceName}
                    .disabled=${this._creatingDevice}
                    @input=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeWifiDeviceName(input.value);
      input.value = value;
      this._newDeviceName = value;
      this._deviceMutationError = "";
    }}
                    @change=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeWifiDeviceName(input.value);
      input.value = value;
      this._newDeviceName = value;
      this._deviceMutationError = "";
    }}
                    @keydown=${(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void this._createWifiDevice();
      }
    }}
                  ></ha-input>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" ?disabled=${this._creatingDevice} @click=${this._closeCreateDeviceModal}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" ?disabled=${this._creatingDevice} @click=${this._createWifiDevice}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCreate}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderDeleteDeviceModal() {
    const device = this._wifiDevices.find((item) => item.device_key === this._deleteDeviceKey);
    if (!device) return A;
    return T`
      <div class="modal-backdrop" @click=${this._closeDeleteDeviceModal}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.deleteModalTitle}</div>
            <button class="dialog-close" @click=${this._closeDeleteDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text">${TOOLS_CARD_STRINGS.wifiCommands.deleteModalBody(device.device_name)}</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeDeleteDeviceModal}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._deleteWifiDevice}>${TOOLS_CARD_STRINGS.wifiCommands.deleteModalDelete}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderSlot(command, idx, irFlash = null) {
    const isConfirming = this._confirmClearSlot === idx;
    const configured = this._isCommandConfigured(command, idx);
    const flashOverlay = irFlash && this._pressMatchesSlot(irFlash, idx) ? i5(irFlash.receivedAt, T`<div class="wifi-ir-flash" aria-hidden="true"></div>`) : A;
    if (isConfirming) {
      return T`
        <div class="slot-btn slot-confirming">
            <div class="slot-confirm-title">${TOOLS_CARD_STRINGS.wifiCommands.clearSlotTitle}</div>
          <div class="slot-confirm-sub">${TOOLS_CARD_STRINGS.wifiCommands.clearSlotSubtitle}</div>
          <div class="slot-confirm-actions">
            <button class="dialog-btn" @click=${() => {
        this._confirmClearSlot = null;
      }}>${TOOLS_CARD_STRINGS.wifiCommands.clearSlotNo}</button>
            <button class="dialog-btn dialog-btn-primary" @click=${() => this._clearSlot(idx)}>${TOOLS_CARD_STRINGS.wifiCommands.clearSlotYes}</button>
          </div>
          ${flashOverlay}
        </div>
      `;
    }
    if (!configured) {
      return T`
        <button class="slot-btn slot-empty" @click=${() => this._openCommandEditor(idx)}>
          <div class="slot-main">
            <div style="font-size:28px;color:var(--secondary-text-color)">+</div>
            <div class="slot-name">${TOOLS_CARD_STRINGS.wifiCommands.makeCommand}</div>
          </div>
          ${flashOverlay}
        </button>
      `;
    }
    const details = this._commandSlotSummaryDetails(command);
    const metaLabel = this._commandSlotMetaLabel(command);
    const unconfiguredCommand = this._isUnconfiguredCommand(command);
    return T`
      <div class="slot-btn">
        <div class="slot-actions">
          ${command.is_power_on && command.is_power_off ? T`<span class="slot-flag power-both" title="Power ON and OFF command"><ha-icon icon="mdi:power"></ha-icon></span>` : command.is_power_on ? T`<span class="slot-flag power-on" title="Power ON command"><ha-icon icon="mdi:power"></ha-icon></span>` : command.is_power_off ? T`<span class="slot-flag power-off" title="Power OFF command"><ha-icon icon="mdi:power"></ha-icon></span>` : A}
          ${this._hasInputActivity(command) ? T`<span class="slot-flag" title=${this._inputFlagTitle(command)}><ha-icon icon=${INPUT_ICON}></ha-icon></span>` : A}
          <button class="slot-clear" @click=${(event) => {
      event.stopPropagation();
      this._confirmClearSlot = idx;
    }}><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <button class="slot-main" @click=${() => this._openCommandEditor(idx)}>
          <span class="slot-text-wrap">
            <span class="slot-name">${String(command.name || "").trim() || `Command ${idx + 1}`}</span>
            <span class="slot-meta">
              ${command.add_as_favorite ? T`<span class="slot-favorite"><ha-icon icon="mdi:heart"></ha-icon></span>` : A}
              ${command.hard_button ? T`<span class="slot-meta-icon"><ha-icon icon=${this._commandSlotIcon(command.hard_button)} style=${this._commandSlotIconColor(command.hard_button) ? `color:${this._commandSlotIconColor(command.hard_button)}` : ""}></ha-icon></span>` : A}
              ${command.long_press_enabled ? T`<span class="slot-meta-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>` : A}
              ${unconfiguredCommand ? T`<span class="slot-meta-icon warning"><ha-icon icon="mdi:alert-circle"></ha-icon></span>` : A}
              <span>${metaLabel}</span>
            </span>
          </span>
        </button>
        <button class="slot-action-btn" @click=${(event) => {
      event.stopPropagation();
      this._openCommandActionEditor(idx);
    }}>
          ${details.commandSummary === TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured ? TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured : `> ${details.service}`}
        </button>
        ${flashOverlay}
      </div>
    `;
  }
  _renderDetailsModal() {
    if (this._activeCommandModal !== "details" || !Number.isInteger(this._activeCommandSlot)) return A;
    const draft = this._activeCommandDraft();
    if (!draft) return A;
    const slotIndex = Number(this._activeCommandSlot);
    const activities = this._editorActivities();
    const selectedActivities = new Set((draft.activities || []).map((id) => String(id)));
    const hasMappedButton = Boolean(String(draft.hard_button || "").trim());
    const activitySelectionEnabled = this._activitySelectionEnabled(draft);
    const inputSelectionEnabled = this._hasInputActivity(draft);
    const inputActivityValue = this._selectorValueForInputActivity(draft);
    const hasActivities = activities.length > 0;
    return T`
      <div class="modal-backdrop" @click=${this._closeOnBackdrop}>
        <div class="dialog" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.commandSlotTitle(slotIndex)}</div>
            <button class="dialog-close" @click=${this._closeCommandEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              Create a Command in this slot. Give it a name and decide which Activities to apply it to. The name will appear on your remote's display, in the mobile app, and as the Wifi Command's sensor status.
            </div>
            <div class="config-block">
              <div class="config-group">
                ${this._useLegacyTextField() ? T`
                      <ha-textfield
                        id="sb-command-display-name"
                        .label=${TOOLS_CARD_STRINGS.wifiCommands.commandDisplayName}
                        .maxLength=${20}
                        .value=${draft.name}
                        @input=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeCommandName(input.value);
      if (input.value !== value) input.value = value;
    }}
                        @change=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeCommandName(input.value);
      input.value = value;
      this._updateActiveCommandDraft({ name: value });
      this._commandSaveError = "";
    }}
                      ></ha-textfield>
                    ` : T`
                      <ha-input
                        id="sb-command-display-name"
                        type="text"
                        .label=${TOOLS_CARD_STRINGS.wifiCommands.commandDisplayName}
                        .maxlength=${20}
                        .value=${draft.name}
                        @input=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeCommandName(input.value);
      if (input.value !== value) input.value = value;
    }}
                        @change=${(event) => {
      const input = event.currentTarget;
      const value = this._sanitizeCommandName(input.value);
      input.value = value;
      this._updateActiveCommandDraft({ name: value });
      this._commandSaveError = "";
    }}
                      ></ha-input>
                    `}
                <button
                  class="advanced-toggle ${this._advancedOptionsOpen ? "expanded" : ""}"
                  @click=${() => {
      this._advancedOptionsOpen = !this._advancedOptionsOpen;
    }}
                  aria-expanded=${String(this._advancedOptionsOpen)}
                >
                  <span class="advanced-toggle-copy">
                    <span>${TOOLS_CARD_STRINGS.wifiCommands.advanced}</span>
                  </span>
                  <ha-icon icon="mdi:chevron-down"></ha-icon>
                </button>
                ${this._advancedOptionsOpen ? T`
                  <div class="advanced-panel">
                    <button class="checkbox-row ${draft.is_power_on ? "active" : ""}" @click=${() => {
      this._togglePowerCommandRow("on");
    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon power-on"><ha-icon icon="mdi:power"></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>${TOOLS_CARD_STRINGS.wifiCommands.powerOn}</span>
                          <span class="checkbox-subtext">${this._powerReplacementLabel("on")}</span>
                        </span>
                      </span>
                      <ha-switch
                        .checked=${draft.is_power_on}
                        @click=${(event) => event.stopPropagation()}
                        @change=${(event) => this._handlePowerCommandSwitchChange("on", event)}
                      ></ha-switch>
                    </button>
                    <button class="checkbox-row ${draft.is_power_off ? "active" : ""}" @click=${() => {
      this._togglePowerCommandRow("off");
    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon power-off"><ha-icon icon="mdi:power"></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>${TOOLS_CARD_STRINGS.wifiCommands.powerOff}</span>
                          <span class="checkbox-subtext">${this._powerReplacementLabel("off")}</span>
                        </span>
                      </span>
                      <ha-switch
                        .checked=${draft.is_power_off}
                        @click=${(event) => event.stopPropagation()}
                        @change=${(event) => this._handlePowerCommandSwitchChange("off", event)}
                      ></ha-switch>
                    </button>
                    <button class="checkbox-row ${inputSelectionEnabled ? "active" : ""}" ?disabled=${!hasActivities} @click=${() => {
      this._toggleInputActivityRow();
    }}>
                      <span class="checkbox-left">
                        <span class="checkbox-icon input"><ha-icon icon=${INPUT_ICON}></ha-icon></span>
                        <span class="checkbox-copy">
                          <span>${TOOLS_CARD_STRINGS.wifiCommands.activityInput}</span>
                          <span class="checkbox-subtext">${hasActivities ? this._inputActivityReplacementLabel() : TOOLS_CARD_STRINGS.wifiCommands.noActivitiesForHub}</span>
                        </span>
                      </span>
                      <ha-switch
                        .checked=${inputSelectionEnabled}
                        .disabled=${!hasActivities}
                        @click=${(event) => event.stopPropagation()}
                        @change=${(event) => this._handleInputActivitySwitchChange(event)}
                      ></ha-switch>
                    </button>
                    <div class="input-selector-wrap nested-control" ?disabled=${!inputSelectionEnabled}>
                      <ha-selector
                        .hass=${this.hass}
                        .selector=${{ select: { mode: "dropdown", options: activities.map((activity) => ({ value: String(activity.id), label: activity.name })) } }}
                        .label=${TOOLS_CARD_STRINGS.wifiCommands.activityInputLabel}
                        .value=${inputActivityValue}
                        .disabled=${!inputSelectionEnabled || !hasActivities}
                        @value-changed=${(event) => this._handleInputActivityChanged(event)}
                      ></ha-selector>
                    </div>
                  </div>
                ` : A}
              </div>
              <div class="config-group">
                <button class="checkbox-row ${draft.add_as_favorite ? "active" : ""}" @click=${() => {
      this._toggleFavoriteRow();
    }}>
                  <span class="checkbox-left">
                    <span class="checkbox-icon"><ha-icon icon="mdi:heart"></ha-icon></span>
                    <span>${TOOLS_CARD_STRINGS.wifiCommands.favorite}</span>
                  </span>
                  <ha-switch
                    .checked=${draft.add_as_favorite}
                    @click=${(event) => event.stopPropagation()}
                    @change=${(event) => this._handleFavoriteSwitchChange(event)}
                  ></ha-switch>
                </button>
                <ha-selector
                  .hass=${this.hass}
                  .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "None" }, ...this._editorAvailableHardButtonOptions().map((option) => ({ value: option.value, label: option.label }))] } }}
                  .label=${TOOLS_CARD_STRINGS.wifiCommands.physicalButtonAssignment}
                  .value=${this._selectorValueForButton(draft)}
                  @value-changed=${(event) => this._handleHardButtonChanged(event)}
                ></ha-selector>
                ${this._hardButtonReplacementLabel() ? T`<div class="button-conflict-hint">${this._hardButtonReplacementLabel()}</div>` : A}
                <button class="checkbox-row nested-control ${hasMappedButton && draft.long_press_enabled ? "active" : ""}" ?disabled=${!hasMappedButton} @click=${() => {
      this._toggleLongPressRow();
    }}>
                  <span class="checkbox-left">
                    <span class="checkbox-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>
                    <span>${TOOLS_CARD_STRINGS.wifiCommands.enableLongPress}</span>
                  </span>
                  <ha-switch
                    .checked=${hasMappedButton && draft.long_press_enabled}
                    .disabled=${!hasMappedButton}
                    @click=${(event) => event.stopPropagation()}
                    @change=${(event) => this._handleLongPressSwitchChange(event)}
                  ></ha-switch>
                </button>
                <div class="activities-label ${activitySelectionEnabled ? "" : "disabled"}">${TOOLS_CARD_STRINGS.wifiCommands.applyToActivities}</div>
                <div class="activity-chip-row">
                  ${activities.length ? activities.map((activity) => T`
                    <button
                      class="activity-chip ${selectedActivities.has(String(activity.id)) ? "active" : ""} ${activitySelectionEnabled ? "" : "disabled"}"
                      ?disabled=${!activitySelectionEnabled}
                      @click=${(event) => this._toggleActivity(activity.id, event)}
                    >
                      ${activity.name}
                    </button>
                  `) : T`<div class="empty-hint">${TOOLS_CARD_STRINGS.wifiCommands.noActivitiesForHub}</div>`}
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._commandSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeCommandEditor}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>${TOOLS_CARD_STRINGS.wifiCommands.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderActionModal() {
    if (this._activeCommandModal !== "action" || !Number.isInteger(this._activeCommandSlot)) return A;
    const draft = this._activeCommandDraft();
    if (!draft) return A;
    const activeTab = this._activeCommandActionTabKey();
    return T`
      <div class="modal-backdrop" @click=${this._closeOnBackdrop}>
        <div class="dialog" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.commandSlotActionTitle(Number(this._activeCommandSlot))}</div>
            <button class="dialog-close" @click=${this._closeCommandActionEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              ${TOOLS_CARD_STRINGS.wifiCommands.actionModalNote}
            </div>
            <div class="config-block">
              ${draft.long_press_enabled ? T`
                <div class="action-tabs">
                  <button class="action-tab ${activeTab === "short" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("short")}>${TOOLS_CARD_STRINGS.wifiCommands.shortPress}</button>
                  <button class="action-tab ${activeTab === "long" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("long")}>${TOOLS_CARD_STRINGS.wifiCommands.longPress}</button>
                </div>
              ` : A}
              <div class="action-helper">${activeTab === "long" ? TOOLS_CARD_STRINGS.wifiCommands.selectLongPressAction : TOOLS_CARD_STRINGS.wifiCommands.selectTriggeredAction}</div>
              <div class="action-selector-wrap" ?hidden=${activeTab !== "short"}>
                ${i5(this._shortSelectorVersion, T`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${TOOLS_CARD_STRINGS.wifiCommands.action}
                    .value=${this._commandActionForPress(draft, "short")}
                    @value-changed=${(event) => this._handleActionChanged("short", event.detail?.value)}
                  ></ha-selector>
                `)}
              </div>
              <div class="action-selector-wrap" ?hidden=${!draft.long_press_enabled || activeTab !== "long"}>
                ${i5(this._longSelectorVersion, T`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${TOOLS_CARD_STRINGS.wifiCommands.action}
                    .value=${this._commandActionForPress(draft, "long")}
                    @value-changed=${(event) => this._handleActionChanged("long", event.detail?.value)}
                  ></ha-selector>
                `)}
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._commandSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeCommandActionEditor}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>${TOOLS_CARD_STRINGS.wifiCommands.save}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderSyncWarningModal() {
    if (!this._syncWarningOpen) return A;
    return T`
      <div class="modal-backdrop" @click=${() => {
      this._syncWarningOpen = false;
    }}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.syncWarningTitle}</div>
            <button class="dialog-close" @click=${() => {
      this._syncWarningOpen = false;
    }}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text sync-warning-text">
              ${TOOLS_CARD_STRINGS.wifiCommands.syncWarningBody}<br /><br />
              ${TOOLS_CARD_STRINGS.wifiCommands.syncWarningBody2}
            </div>
            <label class="warning-optout">
              <input type="checkbox" .checked=${this._syncWarningOptOut} @change=${(event) => {
      this._syncWarningOptOut = event.currentTarget.checked;
    }} />
              <span>${TOOLS_CARD_STRINGS.wifiCommands.syncWarningOptOut}</span>
            </label>
          </div>
          <div class="dialog-footer">
            <div></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${() => {
      this._syncWarningOpen = false;
    }}>${TOOLS_CARD_STRINGS.wifiCommands.createModalCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._confirmSyncWarning}>${TOOLS_CARD_STRINGS.wifiCommands.syncWarningStart}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  async _ensureLoadedForCurrentHub() {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || !this.hass?.callWS) return;
    if (this._configLoadedForEntryId !== entryId) {
      this._configLoadedForEntryId = null;
      this._selectedDeviceKey = null;
      this._wifiDevices = [];
      this._commandsData = this._normalizeCommandsForStorage([]);
      this._syncState = this._defaultSyncState();
    }
    if (this._configLoadedForEntryId === entryId && !this._deviceListLoading && !this._commandConfigLoading && !this._commandSyncLoading) return;
    const entityId = String(this._entityId() || "").trim();
    const deviceListLoaded = await this._loadWifiDevices(true);
    if (!shouldFinalizeWifiHubLoad({ entryId, entityId, deviceListLoaded })) return;
    if (!this._deviceSessionRestoreTried && !this._selectedDeviceKey) {
      this._deviceSessionRestoreTried = true;
      this._restoreSelectedDeviceSession();
    }
    if (this._selectedDeviceKey) {
      await this._loadCommandConfigFromBackend(true);
      await this._loadCommandSyncProgress(true);
    }
    this._configLoadedForEntryId = entryId;
  }
  _deviceSessionStorageKey() {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId) return null;
    return `${_SofabatonWifiCommandsTab._DEVICE_SESSION_KEY_PREFIX}${entryId}`;
  }
  _persistSelectedDeviceSession() {
    const key = this._deviceSessionStorageKey();
    if (!key) return;
    if (!this._deviceSessionRestoreTried && !this._selectedDeviceKey) return;
    try {
      const deviceKey = String(this._selectedDeviceKey || "").trim();
      if (!deviceKey) {
        window.localStorage?.removeItem(key);
        return;
      }
      window.localStorage?.setItem(key, JSON.stringify({
        deviceKey,
        savedAt: Date.now()
      }));
    } catch {
    }
  }
  _restoreSelectedDeviceSession() {
    const key = this._deviceSessionStorageKey();
    if (!key) return;
    try {
      const raw = window.localStorage?.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const deviceKey = String(parsed?.deviceKey || "").trim();
      if (!deviceKey) {
        window.localStorage?.removeItem(key);
        return;
      }
      if (!this._wifiDevices.some((device) => String(device.device_key || "").trim() === deviceKey)) {
        window.localStorage?.removeItem(key);
        return;
      }
      this._selectedDeviceKey = deviceKey;
    } catch {
      try {
        window.localStorage?.removeItem(key);
      } catch {
      }
    }
  }
  _entityId() {
    return entityForHub(this.hass, this.hub);
  }
  _remoteAttrs() {
    return remoteAttrsForHub(this.hass, this.hub);
  }
  _remoteUnavailable() {
    const entityId = this._entityId();
    return !!entityId && this.hass?.states?.[entityId]?.state === "unavailable";
  }
  _hubVersion() {
    return String(this._remoteAttrs()?.hub_version || this.hub?.version || "").toUpperCase();
  }
  _supportsUnicodeCommandNames() {
    const version = this._hubVersion();
    return version.includes("X2") || version.includes("X1S");
  }
  _sanitizeCommandName(value) {
    const pattern = this._supportsUnicodeCommandNames() ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }
  _sanitizeWifiDeviceName(value) {
    return this._sanitizeCommandName(value);
  }
  _setSharedHubCommandBusy(busy, label = null) {
    this.setHubCommandBusy?.(busy, label);
    this.dispatchEvent(new CustomEvent("sofabaton-hub-command-busy-changed", {
      detail: { busy, label },
      bubbles: true,
      composed: true
    }));
  }
  async _refreshControlPanelState() {
    await this.refreshControlPanelState?.();
  }
  _hubCommandLocked() {
    return Boolean(this.hubCommandBusy || this._runningWifiDevice());
  }
  _effectiveHubCommandLabel() {
    const runningDevice = this._runningWifiDevice();
    if (runningDevice) {
      const deviceName = String(runningDevice.device_name || "").trim();
      return deviceName ? TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceNamed(deviceName) : TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceFallback;
    }
    return String(this.hubCommandBusyLabel || "").trim() || "Hub command in progress...";
  }
  _runningWifiDevice() {
    const selectedDevice = this._selectedWifiDevice();
    return findRunningWifiDevice(
      this._wifiDevices,
      this._selectedDeviceKey,
      this._syncState.status,
      selectedDevice?.device_name || ""
    );
  }
  _selectedDeviceOwnsPendingSync() {
    return selectedDeviceOwnsPendingSync({
      selectedDeviceKey: this._selectedDeviceKey,
      commandSyncRunning: this._commandSyncRunning,
      commandSyncDeviceKey: this._commandSyncDeviceKey
    });
  }
  _defaultSyncState() {
    return {
      status: "idle",
      current_step: 0,
      total_steps: 0,
      message: "Idle",
      commands_hash: "",
      managed_command_hashes: [],
      sync_needed: false
    };
  }
  _selectedWifiDevice() {
    return this._wifiDevices.find((device) => device.device_key === this._selectedDeviceKey) || null;
  }
  _normalizeCommandAction(action) {
    if (Array.isArray(action)) {
      const first = action.find((item) => item && typeof item === "object");
      const normalized = first || DEFAULT_ACTION;
      if (normalized && typeof normalized === "object" && "action" in normalized) return { ...normalized };
      return { ...normalized, ...DEFAULT_ACTION };
    }
    if (action && typeof action === "object") {
      const normalized = action;
      return normalized.action ? { ...normalized } : { ...normalized, ...DEFAULT_ACTION };
    }
    return { ...DEFAULT_ACTION };
  }
  _commandSlotDefault(idx) {
    return {
      name: `Command ${idx + 1}`,
      add_as_favorite: true,
      hard_button: "",
      long_press_enabled: false,
      is_power_on: false,
      is_power_off: false,
      input_activity_id: "",
      activities: [],
      action: { ...DEFAULT_ACTION },
      long_press_action: { ...DEFAULT_ACTION }
    };
  }
  _normalizePowerCommandId(value) {
    const num = Number(value);
    if (!Number.isInteger(num) || num < 1 || num > SLOT_COUNT) return null;
    return num;
  }
  _derivePowerCommandIds(nextCommands) {
    let powerOnCommandId = null;
    let powerOffCommandId = null;
    if (Array.isArray(nextCommands)) {
      nextCommands.forEach((item, idx) => {
        const record = item && typeof item === "object" ? item : {};
        if (Boolean(record.is_power_on)) powerOnCommandId = idx + 1;
        if (Boolean(record.is_power_off)) powerOffCommandId = idx + 1;
      });
    }
    return { powerOnCommandId, powerOffCommandId };
  }
  _validActivityIdSet() {
    const list = this._editorActivities();
    if (!list.length) return null;
    return new Set(list.map((activity) => String(activity.id)));
  }
  _normalizeCommandsForStorage(nextCommands, powerOnCommandId = null, powerOffCommandId = null) {
    const normalizedPowerOnId = this._normalizePowerCommandId(powerOnCommandId);
    const normalizedPowerOffId = this._normalizePowerCommandId(powerOffCommandId);
    const validActivityIds = this._validActivityIdSet();
    return Array.from({ length: SLOT_COUNT }, (_2, idx) => {
      const item = Array.isArray(nextCommands) ? nextCommands[idx] ?? {} : {};
      const record = item && typeof item === "object" ? item : {};
      const rawInputActivityId = String(record.input_activity_id ?? "");
      const inputActivityId = validActivityIds && rawInputActivityId && !validActivityIds.has(rawInputActivityId) ? "" : rawInputActivityId;
      const rawActivities = Array.isArray(record.activities) ? record.activities.map((id) => String(id)).filter((id) => id !== "") : [];
      const activities = validActivityIds ? rawActivities.filter((id) => validActivityIds.has(id)) : rawActivities;
      return {
        ...this._commandSlotDefault(idx),
        name: this._sanitizeCommandName(record.name ?? `Command ${idx + 1}`),
        add_as_favorite: record.add_as_favorite === void 0 ? this._commandSlotDefault(idx).add_as_favorite : Boolean(record.add_as_favorite),
        hard_button: String(record.hard_button ?? ""),
        long_press_enabled: Boolean(record.long_press_enabled) && Boolean(String(record.hard_button ?? "").trim()),
        is_power_on: normalizedPowerOnId === idx + 1,
        is_power_off: normalizedPowerOffId === idx + 1,
        input_activity_id: inputActivityId,
        activities,
        action: this._normalizeCommandAction(record.action),
        long_press_action: this._normalizeCommandAction(record.long_press_action)
      };
    });
  }
  _commandsList() {
    return this._commandsData.map((slot, idx) => ({
      ...this._commandSlotDefault(idx),
      ...slot,
      action: this._normalizeCommandAction(slot.action),
      long_press_action: this._normalizeCommandAction(slot.long_press_action)
    }));
  }
  _cloneCommandSlot(slot) {
    return {
      name: this._sanitizeCommandName(slot?.name ?? ""),
      add_as_favorite: Boolean(slot?.add_as_favorite),
      hard_button: String(slot?.hard_button ?? ""),
      long_press_enabled: Boolean(slot?.long_press_enabled) && Boolean(String(slot?.hard_button ?? "").trim()),
      is_power_on: Boolean(slot?.is_power_on),
      is_power_off: Boolean(slot?.is_power_off),
      input_activity_id: String(slot?.input_activity_id ?? ""),
      activities: Array.isArray(slot?.activities) ? slot.activities.map((id) => String(id)).filter((id) => id !== "") : [],
      action: this._normalizeCommandAction(slot?.action),
      long_press_action: this._normalizeCommandAction(slot?.long_press_action)
    };
  }
  async _loadCommandConfigFromBackend(force = false) {
    const entityId = String(this._entityId() || "").trim();
    const entryId = String(this.hub?.entry_id || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId || !entryId || !this.hass?.callWS) return;
    if (this._commandConfigLoading && !force) return;
    if (!deviceKey) return;
    this._commandConfigLoading = true;
    try {
      const result = await this.hass.callWS({
        type: "sofabaton_x1s/command_config/get",
        entity_id: entityId,
        device_key: deviceKey
      });
      this._commandsData = this._normalizeCommandsForStorage(
        result?.commands || [],
        result?.power_on_command_id,
        result?.power_off_command_id
      );
      this._configLoadedForEntryId = entryId;
    } catch (_error) {
      this._commandsData = this._normalizeCommandsForStorage([]);
    } finally {
      this._commandConfigLoading = false;
    }
  }
  async _loadCommandSyncProgress(force = false) {
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId || !this.hass?.callWS) return;
    if (!deviceKey) return;
    if (this._commandSyncLoading && !force) return;
    this._commandSyncLoading = true;
    try {
      const result = await this.hass.callWS({
        type: "sofabaton_x1s/command_sync/progress",
        entity_id: entityId,
        device_key: deviceKey
      });
      this._syncState = {
        status: String(result?.status || "idle"),
        current_step: Number(result?.current_step || 0),
        total_steps: Number(result?.total_steps || 0),
        message: String(result?.message || "Idle"),
        commands_hash: String(result?.commands_hash || ""),
        managed_command_hashes: Array.isArray(result?.managed_command_hashes) ? result.managed_command_hashes.map((item) => String(item || "")).filter(Boolean) : [],
        sync_needed: Boolean(result?.sync_needed)
      };
      if (deviceKey) {
        this._wifiDevices = this._wifiDevices.map(
          (device) => device.device_key === deviceKey ? {
            ...device,
            ...this._syncState
          } : device
        );
      }
    } catch (_error) {
      this._syncState = {
        ...this._defaultSyncState(),
        message: "Unable to load sync status"
      };
    } finally {
      this._commandSyncLoading = false;
    }
  }
  async _loadWifiDevices(force = false) {
    const entityId = String(this._entityId() || "").trim();
    if (!entityId || !this.hass?.callWS) return false;
    if (this._deviceListLoading && !force) return false;
    this._deviceListLoading = true;
    try {
      const result = await this.hass.callWS({
        type: "sofabaton_x1s/command_devices/list",
        entity_id: entityId
      });
      this._wifiDevices = Array.isArray(result?.devices) ? result.devices : [];
      if (this._selectedDeviceKey && this._syncState.status !== "idle") {
        this._wifiDevices = this._wifiDevices.map(
          (device) => device.device_key === this._selectedDeviceKey ? {
            ...device,
            ...this._syncState
          } : device
        );
      }
      this._maxWifiDevices = Number(result?.max_devices || 5);
      if (this._selectedDeviceKey && !this._wifiDevices.some((device) => device.device_key === this._selectedDeviceKey)) {
        this._selectedDeviceKey = null;
        this._commandsData = this._normalizeCommandsForStorage([]);
        this._syncState = this._defaultSyncState();
      }
      return true;
    } catch (_error) {
      return false;
    } finally {
      this._deviceListLoading = false;
    }
  }
  async _setCommands(nextCommands) {
    const { powerOnCommandId, powerOffCommandId } = this._derivePowerCommandIds(nextCommands);
    const normalized = this._normalizeCommandsForStorage(nextCommands, powerOnCommandId, powerOffCommandId);
    this._commandsData = normalized;
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (entityId && this.hass?.callWS) {
      try {
        await this.hass.callWS({
          type: "sofabaton_x1s/command_config/set",
          entity_id: entityId,
          device_key: deviceKey,
          commands: normalized,
          power_on_command_id: powerOnCommandId ?? void 0,
          power_off_command_id: powerOffCommandId ?? void 0
        });
      } catch (_error) {
      }
      await this._loadWifiDevices(true);
      await this._loadCommandSyncProgress(true);
    }
  }
  _ensureCommandDraft(slotIdx) {
    if (!Number.isInteger(slotIdx)) return null;
    const idx = Number(slotIdx);
    if (!this._commandEditorDrafts[idx]) {
      this._commandEditorDrafts[idx] = this._cloneCommandSlot(this._commandsList()[idx] || this._commandSlotDefault(idx));
    }
    return this._commandEditorDrafts[idx];
  }
  _activeCommandDraft() {
    return this._ensureCommandDraft(this._activeCommandSlot);
  }
  _updateActiveCommandDraft(patch) {
    if (!Number.isInteger(this._activeCommandSlot)) return null;
    const idx = Number(this._activeCommandSlot);
    const current = this._ensureCommandDraft(idx);
    if (!current) return null;
    const next = { ...current, ...patch };
    this._commandEditorDrafts = { ...this._commandEditorDrafts, [idx]: this._cloneCommandSlot(next) };
    return this._commandEditorDrafts[idx];
  }
  _activeCommandActionTabKey() {
    const draft = this._activeCommandDraft();
    if (!draft?.long_press_enabled) return "short";
    return this._activeCommandActionTab === "long" ? "long" : "short";
  }
  _setActiveCommandActionTab(tab) {
    this._activeCommandActionTab = tab === "long" ? "long" : "short";
  }
  _commandActionForPress(slot, pressType = "short") {
    return this._normalizeCommandAction(pressType === "long" ? slot?.long_press_action : slot?.action);
  }
  _commandActionDetails(action) {
    const normalized = this._normalizeCommandAction(action);
    const explicitService = String(normalized.perform_action || normalized.service || "").trim();
    const service = explicitService || "perform-action";
    const entityIds = normalized.target?.entity_id;
    const ids = Array.isArray(entityIds) ? entityIds.filter(Boolean) : entityIds ? [entityIds] : [];
    const suffix = (value) => {
      const text = String(value || "").trim();
      if (!text) return "";
      const parts = text.split(".");
      return (parts[parts.length - 1] || text).trim();
    };
    const actionSuffix = suffix(service);
    const entitySuffix = ids.length ? suffix(ids[0]) : "";
    return {
      service,
      entities: ids.length ? ids.join(", ") : "No target entity",
      commandSummary: explicitService && actionSuffix && entitySuffix ? `${actionSuffix} ${entitySuffix}` : explicitService && actionSuffix ? actionSuffix : TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured
    };
  }
  _commandHasCustomAction(action) {
    const details = this._commandActionDetails(action);
    return details.service !== "perform-action" || details.entities !== "No target entity";
  }
  _commandSlotSummaryDetails(command) {
    const shortDetails = this._commandActionDetails(command.action);
    if (shortDetails.commandSummary !== TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured) return shortDetails;
    if (!command.long_press_enabled) return shortDetails;
    const longDetails = this._commandActionDetails(command.long_press_action);
    return longDetails.commandSummary !== TOOLS_CARD_STRINGS.wifiCommands.noActionConfigured ? longDetails : shortDetails;
  }
  _commandSaveValidationMessage(slot = null) {
    const draft = slot || this._activeCommandDraft();
    if (!draft) return "";
    if (!String(draft.name ?? "").length || String(draft.name).startsWith(" ")) {
      return "Command name must start with a non-space character.";
    }
    if (!draft.add_as_favorite && !String(draft.hard_button || "").trim() && !draft.is_power_on && !draft.is_power_off && !this._hasInputActivity(draft)) {
      return "Set a power command, input activity, add as favorite, or map to button before saving.";
    }
    return "";
  }
  _commandActionRefreshKey(action) {
    const normalized = this._normalizeCommandAction(action);
    const normalizeIdValue = (value) => Array.isArray(value) ? value.map((item) => String(item || "")).filter(Boolean).sort() : value ? [String(value)] : [];
    const target = normalized.target || {};
    try {
      return JSON.stringify({
        action: String(normalized.action || "").trim(),
        service: String(normalized.perform_action || normalized.service || "").trim(),
        target_entity_id: normalizeIdValue(target.entity_id || normalized.entity_id || normalized.data?.entity_id || normalized.service_data?.entity_id),
        target_device_id: normalizeIdValue(target.device_id || normalized.device_id || normalized.data?.device_id || normalized.service_data?.device_id),
        target_area_id: normalizeIdValue(target.area_id || normalized.area_id || normalized.data?.area_id || normalized.service_data?.area_id),
        navigation_path: String(normalized.navigation_path || "").trim(),
        url_path: String(normalized.url_path || "").trim()
      });
    } catch (_error) {
      return "";
    }
  }
  _handleActionChanged(pressType, nextValue) {
    const previousValue = this._commandActionForPress(this._activeCommandDraft(), pressType);
    const normalized = this._normalizeCommandAction(nextValue);
    this._updateActiveCommandDraft(pressType === "long" ? { long_press_action: normalized } : { action: normalized });
    this._commandSaveError = "";
    if (this._commandActionRefreshKey(previousValue) !== this._commandActionRefreshKey(normalized)) {
      if (pressType === "long") this._longSelectorVersion += 1;
      else this._shortSelectorVersion += 1;
    }
  }
  _editorHardButtonOptions() {
    const group = (keys, title) => keys.filter((key) => DEFAULT_KEY_LABELS[key]).map((key) => ({
      value: key,
      label: `${title} - ${DEFAULT_KEY_LABELS[key]}`
    }));
    return [
      ...group(["up", "down", "left", "right", "ok", "back", "home", "menu"], "Navigation"),
      ...group(["volup", "voldn", "mute", "chup", "chdn"], "Transport"),
      ...group(["play", "pause", "rew", "fwd", "guide", "dvr", "exit"], "Media"),
      ...group(["a", "b", "c"], "ABC"),
      ...group(["red", "green", "yellow", "blue"], "Color")
    ];
  }
  _editorAvailableHardButtonOptions() {
    const showX2Keys = this._hubVersion().includes("X2");
    return this._editorHardButtonOptions().filter((option) => {
      const id = HARD_BUTTON_ID_MAP[String(option.value || "")];
      if (!Number.isFinite(id)) return false;
      if (X2_ONLY_HARD_BUTTON_IDS.has(id) && !showX2Keys) return false;
      return true;
    });
  }
  _selectorValueForButton(draft) {
    return draft.hard_button ? String(draft.hard_button) : "__none__";
  }
  _activitySelectionEnabled(slot) {
    return Boolean(slot?.add_as_favorite) || Boolean(String(slot?.hard_button || "").trim());
  }
  _hasInputActivity(slot) {
    return Boolean(String(slot?.input_activity_id || "").trim());
  }
  _defaultEditorActivityId() {
    const firstActivity = this._editorActivities()[0];
    return firstActivity ? String(firstActivity.id) : "";
  }
  _ensureDefaultAssignedActivity() {
    const draft = this._activeCommandDraft();
    if (!draft || !this._activitySelectionEnabled(draft) || draft.activities.length > 0) return;
    const fallbackActivity = this._defaultEditorActivityId();
    if (!fallbackActivity) return;
    this._updateActiveCommandDraft({ activities: [fallbackActivity] });
  }
  _selectorValueForInputActivity(draft) {
    return this._hasInputActivity(draft) ? String(draft.input_activity_id) : this._defaultEditorActivityId();
  }
  _activityName(activityId) {
    const match = this._editorActivities().find((activity) => String(activity.id) === String(activityId));
    return match?.name || `Activity ${activityId}`;
  }
  _inputFlagTitle(command) {
    const activityId = String(command.input_activity_id || "").trim();
    return activityId ? `Input for ${this._activityName(activityId)}` : "Input command";
  }
  _isUnconfiguredCommand(command) {
    return !this._activitySelectionEnabled(command) && !command.is_power_on && !command.is_power_off && !this._hasInputActivity(command);
  }
  _commandSlotMetaLabel(command) {
    const activityCount = Array.isArray(command.activities) ? command.activities.length : 0;
    const activitiesLabel = activityCount === 1 ? "Activity" : "Activities";
    const assignmentEnabled = this._activitySelectionEnabled(command);
    if (this._isUnconfiguredCommand(command)) return "Unconfigured command";
    if (!assignmentEnabled && command.is_power_on && command.is_power_off) return "Power ON and OFF command";
    if (!assignmentEnabled && command.is_power_on) return "Power ON command";
    if (!assignmentEnabled && command.is_power_off) return "Power OFF command";
    if (!assignmentEnabled && this._hasInputActivity(command)) return `Input for ${this._activityName(command.input_activity_id)}`;
    return `in ${activityCount} ${activitiesLabel}`;
  }
  _toggleFavoriteRow() {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    this._updateActiveCommandDraft({ add_as_favorite: !draft.add_as_favorite });
    if (!draft.add_as_favorite) this._ensureDefaultAssignedActivity();
    this._commandSaveError = "";
  }
  _handleFavoriteSwitchChange(event) {
    const checked = Boolean(event.currentTarget.checked);
    this._updateActiveCommandDraft({ add_as_favorite: checked });
    if (checked) this._ensureDefaultAssignedActivity();
    this._commandSaveError = "";
  }
  _powerReplacementSlot(kind) {
    if (!Number.isInteger(this._activeCommandSlot)) return null;
    const activeIdx = Number(this._activeCommandSlot);
    const commands = this._commandsList();
    for (let idx = 0; idx < commands.length; idx += 1) {
      if (idx === activeIdx) continue;
      const isMatch = kind === "on" ? Boolean(commands[idx].is_power_on) : Boolean(commands[idx].is_power_off);
      if (isMatch) return { index: idx, slot: commands[idx] };
    }
    return null;
  }
  _powerReplacementLabel(kind) {
    const draft = this._activeCommandDraft();
    if (kind === "on" && draft?.is_power_on) return "Command called as part of device power on sequence";
    if (kind === "off" && draft?.is_power_off) return "Command called as part of device power off sequence";
    const replacement = this._powerReplacementSlot(kind);
    if (!replacement) return `No current ${kind} command set`;
    const name = String(replacement.slot.name || "").trim() || `Command ${replacement.index + 1}`;
    return `Replaces "${name}" as the ${kind} command`;
  }
  _inputActivityReplacementSlot(activityId) {
    if (!Number.isInteger(this._activeCommandSlot) || !activityId) return null;
    const activeIdx = Number(this._activeCommandSlot);
    const commands = this._commandsList();
    for (let idx = 0; idx < commands.length; idx += 1) {
      if (idx === activeIdx) continue;
      if (String(commands[idx].input_activity_id || "").trim() === activityId) return { index: idx, slot: commands[idx] };
    }
    return null;
  }
  _inputActivityReplacementLabel() {
    const draft = this._activeCommandDraft();
    const activityId = String(draft?.input_activity_id || "").trim();
    if (!activityId) return "Command called as part of Activity startup sequence";
    const replacement = this._inputActivityReplacementSlot(activityId);
    if (!replacement) return "Command called as part of Activity startup sequence";
    const name = String(replacement.slot.name || "").trim() || `Command ${replacement.index + 1}`;
    return `Replaces "${name}" as input for ${this._activityName(activityId)}`;
  }
  _hardButtonConflictInfo(buttonId) {
    if (!buttonId || !Number.isInteger(this._activeCommandSlot)) return null;
    const activeIdx = Number(this._activeCommandSlot);
    const currentDeviceKey = String(this._selectedDeviceKey || "");
    const commands = this._commandsList();
    for (let idx = 0; idx < commands.length; idx += 1) {
      if (idx === activeIdx) continue;
      if (String(commands[idx].hard_button || "").trim() === buttonId) {
        const name = String(commands[idx].name || "").trim() || `Command ${idx + 1}`;
        return { deviceName: this._selectedWifiDevice()?.device_name || "this device", slotName: name, isSameDevice: true, deviceKey: currentDeviceKey };
      }
    }
    for (const device of this._wifiDevices) {
      if (device.device_key === currentDeviceKey || !Array.isArray(device.commands)) continue;
      for (let idx = 0; idx < device.commands.length; idx += 1) {
        if (String(device.commands[idx]?.hard_button || "").trim() === buttonId) {
          const name = String(device.commands[idx]?.name || "").trim() || `Command ${idx + 1}`;
          return { deviceName: device.device_name, slotName: name, isSameDevice: false, deviceKey: device.device_key };
        }
      }
    }
    return null;
  }
  _hardButtonReplacementLabel() {
    const draft = this._activeCommandDraft();
    const buttonId = String(draft?.hard_button || "").trim();
    if (!buttonId) return "";
    const conflict = this._hardButtonConflictInfo(buttonId);
    if (!conflict) return "";
    if (conflict.isSameDevice) return `Replaces "${conflict.slotName}" on this button`;
    return `Replaces "${conflict.slotName}" from ${conflict.deviceName}`;
  }
  _setPowerCommandFlag(kind, enabled) {
    if (!Number.isInteger(this._activeCommandSlot)) return;
    const key = kind === "on" ? "is_power_on" : "is_power_off";
    const idx = Number(this._activeCommandSlot);
    const nextDrafts = { ...this._commandEditorDrafts };
    if (enabled) {
      Object.entries(nextDrafts).forEach(([draftIdx, draft]) => {
        if (Number(draftIdx) !== idx && draft) {
          nextDrafts[Number(draftIdx)] = this._cloneCommandSlot({ ...draft, [key]: false });
        }
      });
    }
    const current = this._ensureCommandDraft(idx);
    if (!current) return;
    nextDrafts[idx] = this._cloneCommandSlot({
      ...current,
      [key]: enabled,
      input_activity_id: enabled ? "" : current.input_activity_id
    });
    this._commandEditorDrafts = nextDrafts;
    this._commandSaveError = "";
  }
  _togglePowerCommandRow(kind) {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    this._setPowerCommandFlag(kind, !Boolean(kind === "on" ? draft.is_power_on : draft.is_power_off));
  }
  _handlePowerCommandSwitchChange(kind, event) {
    const checked = Boolean(event.currentTarget.checked);
    this._setPowerCommandFlag(kind, checked);
  }
  _toggleLongPressRow() {
    const draft = this._activeCommandDraft();
    const hasMappedButton = Boolean(String(draft?.hard_button || "").trim());
    if (!draft || !hasMappedButton) return;
    const nextEnabled = !draft.long_press_enabled;
    this._updateActiveCommandDraft({ long_press_enabled: nextEnabled });
    if (!nextEnabled) this._activeCommandActionTab = "short";
    this._commandSaveError = "";
  }
  _handleLongPressSwitchChange(event) {
    const checked = Boolean(event.currentTarget.checked);
    this._updateActiveCommandDraft({ long_press_enabled: checked });
    if (!checked) this._activeCommandActionTab = "short";
    this._commandSaveError = "";
  }
  _handleHardButtonChanged(event) {
    const rawValue = event.detail?.value ?? event.currentTarget?.value ?? "";
    const mapped = String(rawValue ?? "");
    const hasButton = mapped !== "__none__" && mapped !== "None";
    const nextMapped = hasButton ? mapped : "";
    this._updateActiveCommandDraft({
      hard_button: nextMapped,
      long_press_enabled: hasButton ? Boolean(this._activeCommandDraft()?.long_press_enabled) : false,
      long_press_action: hasButton ? this._commandActionForPress(this._activeCommandDraft(), "long") : this._normalizeCommandAction(null)
    });
    if (hasButton) this._ensureDefaultAssignedActivity();
    if (!hasButton) this._activeCommandActionTab = "short";
    this._commandSaveError = "";
    const selector = event.currentTarget;
    if (selector) {
      requestAnimationFrame(() => {
        const slotIndex = Number.isInteger(this._activeCommandSlot) ? Number(this._activeCommandSlot) : 0;
        selector.value = this._selectorValueForButton(this._activeCommandDraft() || this._commandSlotDefault(slotIndex));
      });
    }
  }
  _commandSlotIcon(hardButton) {
    return hardButton ? HARD_BUTTON_ICONS[String(hardButton)] || "mdi:gesture-tap-button" : "mdi:gesture-tap-button";
  }
  _commandSlotIconColor(hardButton) {
    const key = String(hardButton || "");
    if (key === "red") return "#ef4444";
    if (key === "green") return "#22c55e";
    if (key === "yellow") return "#facc15";
    if (key === "blue") return "#3b82f6";
    return "";
  }
  _editorActivities() {
    const list = this._remoteAttrs()?.activities;
    if (!Array.isArray(list)) return [];
    return list.map((activity) => ({
      id: Number(activity.id),
      name: String(activity.name ?? "")
    })).filter((activity) => Number.isFinite(activity.id) && activity.name);
  }
  _isCommandConfigured(command, idx) {
    const defaults = this._commandSlotDefault(idx);
    return String(command.name || "").trim() !== String(defaults.name) || Boolean(command.add_as_favorite) !== Boolean(defaults.add_as_favorite) || Boolean(command.hard_button) || Boolean(command.long_press_enabled) || Boolean(command.is_power_on) || Boolean(command.is_power_off) || Boolean(String(command.input_activity_id || "").trim()) || Array.isArray(command.activities) && command.activities.length > 0 || this._commandHasCustomAction(command.action) || Boolean(command.long_press_enabled) && this._commandHasCustomAction(command.long_press_action);
  }
  _openCommandEditor(slotIndex) {
    this._confirmClearSlot = null;
    this._activeCommandModal = "details";
    this._activeCommandSlot = Number(slotIndex);
    this._activeCommandActionTab = "short";
    this._advancedOptionsOpen = false;
    this._commandSaveError = "";
    const draft = this._ensureCommandDraft(slotIndex);
    if (draft && this._activitySelectionEnabled(draft) && draft.activities.length === 0) this._ensureDefaultAssignedActivity();
  }
  _openCommandActionEditor(slotIndex) {
    this._confirmClearSlot = null;
    this._activeCommandModal = "action";
    this._activeCommandSlot = Number(slotIndex);
    this._activeCommandActionTab = "short";
    this._commandSaveError = "";
    this._shortSelectorVersion += 1;
    this._longSelectorVersion += 1;
    this._ensureCommandDraft(slotIndex);
  }
  _toggleActivity(activityId, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (!this._activitySelectionEnabled(this._activeCommandDraft())) return;
    const current = new Set((this._activeCommandDraft()?.activities || []).map((id) => String(id)));
    const idKey = String(activityId);
    if (current.has(idKey) && current.size > 1) current.delete(idKey);
    else current.add(idKey);
    this._updateActiveCommandDraft({ activities: Array.from(current) });
    this._commandSaveError = "";
  }
  _setInputActivityEnabled(enabled) {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    const fallbackActivity = this._defaultEditorActivityId();
    this._updateActiveCommandDraft({
      input_activity_id: enabled ? String(draft.input_activity_id || "").trim() || fallbackActivity : "",
      is_power_on: enabled ? false : draft.is_power_on,
      is_power_off: enabled ? false : draft.is_power_off
    });
    this._commandSaveError = "";
  }
  _toggleInputActivityRow() {
    const draft = this._activeCommandDraft();
    if (!draft || !this._editorActivities().length) return;
    this._setInputActivityEnabled(!this._hasInputActivity(draft));
  }
  _handleInputActivitySwitchChange(event) {
    const checked = Boolean(event.currentTarget.checked);
    if (!this._editorActivities().length) return;
    this._setInputActivityEnabled(checked);
  }
  _handleInputActivityChanged(event) {
    const rawValue = event.detail?.value ?? event.currentTarget?.value ?? "";
    this._updateActiveCommandDraft({ input_activity_id: String(rawValue ?? "") });
    this._commandSaveError = "";
  }
  async _clearSlot(idx) {
    const next = this._commandsList();
    next[idx] = this._commandSlotDefault(idx);
    this._confirmClearSlot = null;
    await this._setCommands(next);
  }
  async _clearButtonFromOtherDevices(buttonId, currentDeviceKey) {
    if (!buttonId || !this.hass?.callWS) return;
    const entityId = String(this._entityId() || "").trim();
    if (!entityId) return;
    for (const device of this._wifiDevices) {
      if (device.device_key === currentDeviceKey || !Array.isArray(device.commands)) continue;
      const conflictIdx = device.commands.findIndex((cmd) => String(cmd?.hard_button || "").trim() === buttonId);
      if (conflictIdx === -1) continue;
      const slots = this._normalizeCommandsForStorage(device.commands, device.power_on_command_id, device.power_off_command_id);
      const cleared = slots.map(
        (slot, i6) => i6 === conflictIdx ? this._cloneCommandSlot({ ...slot, hard_button: "", long_press_enabled: false, long_press_action: { ...DEFAULT_ACTION } }) : slot
      );
      const { powerOnCommandId, powerOffCommandId } = this._derivePowerCommandIds(cleared);
      const normalized = this._normalizeCommandsForStorage(cleared, powerOnCommandId, powerOffCommandId);
      try {
        await this.hass.callWS({
          type: "sofabaton_x1s/command_config/set",
          entity_id: entityId,
          device_key: device.device_key,
          commands: normalized,
          power_on_command_id: powerOnCommandId ?? void 0,
          power_off_command_id: powerOffCommandId ?? void 0
        });
      } catch (_error) {
      }
    }
  }
  _syncStatusTone(status) {
    if (status === "failed") return "sync-error";
    if (status === "success") return "sync-ok";
    if (status === "running") return "sync-running";
    if (status === "pending") return "sync-pending";
    return "";
  }
  _syncStatusIcon(remoteUnavailable) {
    if (remoteUnavailable || this._syncState.status === "failed") return "mdi:alert-circle-outline";
    if (this._syncState.status === "running") return "mdi:progress-clock";
    return "mdi:information-outline";
  }
  _syncMessage(remoteUnavailable) {
    if (remoteUnavailable) return TOOLS_CARD_STRINGS.wifiCommands.syncMessageRemoteUnavailable;
    if (this._syncState.status === "running") return String(this._syncState.message || TOOLS_CARD_STRINGS.wifiCommands.syncInProgress);
    if (this._syncState.status === "failed") return String(this._syncState.message || TOOLS_CARD_STRINGS.wifiCommands.syncMessageFailed);
    if (this._syncState.sync_needed) return TOOLS_CARD_STRINGS.wifiCommands.syncMessageNeeded;
    if (this._syncState.status === "success") return TOOLS_CARD_STRINGS.wifiCommands.syncMessageUpToDate;
    return TOOLS_CARD_STRINGS.wifiCommands.syncMessageIdle;
  }
  _syncMessageShort(remoteUnavailable) {
    if (remoteUnavailable) return TOOLS_CARD_STRINGS.wifiCommands.syncShortUnavailable;
    if (this._syncState.status === "running") return TOOLS_CARD_STRINGS.wifiCommands.syncShortRunning;
    if (this._syncState.status === "failed") return TOOLS_CARD_STRINGS.wifiCommands.syncShortFailed;
    if (this._syncState.sync_needed) return TOOLS_CARD_STRINGS.wifiCommands.syncShortNeeded;
    if (this._syncState.status === "success") return TOOLS_CARD_STRINGS.wifiCommands.syncShortUpToDate;
    return TOOLS_CARD_STRINGS.wifiCommands.syncShortIdle;
  }
  _deviceStatusLabel(device) {
    if (device.device_key === this._deletingDeviceKey) return TOOLS_CARD_STRINGS.wifiCommands.deviceDeleting;
    if (device.status === "running") return TOOLS_CARD_STRINGS.wifiCommands.syncShortRunning;
    if (device.status === "failed") return TOOLS_CARD_STRINGS.wifiCommands.syncShortFailed;
    if (device.sync_needed) return TOOLS_CARD_STRINGS.wifiCommands.syncShortNeeded;
    if (device.status === "success") return TOOLS_CARD_STRINGS.wifiCommands.deviceSynced;
    return TOOLS_CARD_STRINGS.wifiCommands.deviceSynced;
  }
  _deviceStatusIcon(device) {
    if (device.device_key === this._deletingDeviceKey) return "mdi:progress-clock";
    if (device.status === "failed") return "mdi:alert-circle-outline";
    if (device.status === "running") return "mdi:progress-clock";
    if (device.sync_needed) return "mdi:sync-alert";
    return "mdi:check-circle-outline";
  }
  _deviceStatusTone(device) {
    if (device.device_key === this._deletingDeviceKey) return "sync-pending";
    if (device.status === "failed") return "sync-error";
    if (device.status === "running") return "sync-running";
    if (device.sync_needed) return "sync-pending";
    return "sync-ok";
  }
  _syncDockTone(remoteUnavailable, externallyLocked) {
    if (remoteUnavailable || this._syncState.status === "failed") return "status-error";
    if (this._syncState.status === "running" || externallyLocked) return "status-progress";
    if (this._syncState.sync_needed) return "status-warning";
    return "status-success";
  }
  _renderSyncMessage(remoteUnavailable, externallyLocked = false) {
    const message = externallyLocked ? this._effectiveHubCommandLabel() : this._syncMessage(remoteUnavailable);
    if (remoteUnavailable || this._syncState.status !== "failed") return message;
    return T`${message} <a class="sync-doc-link" href=${WIFI_COMMANDS_DOCS_URL} target="_blank" rel="noreferrer">${TOOLS_CARD_STRINGS.wifiCommands.seeDocumentation}</a>`;
  }
  _renderStatusDock(message, tone) {
    return T`
      <div class="bottom-dock-status">
        <span class="dock-status-indicator ${tone}"></span>
        <span>${message}</span>
      </div>
    `;
  }
  _renderSyncActionButton({
    remoteUnavailable,
    syncRunning,
    externallyLocked
  }) {
    const label = remoteUnavailable ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonUnavailable : syncRunning ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonSyncing : externallyLocked ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonBusy : this._syncState.sync_needed ? TOOLS_CARD_STRINGS.wifiCommands.actionButtonSyncToHub : TOOLS_CARD_STRINGS.wifiCommands.actionButtonUpToDate;
    const disabled = remoteUnavailable || syncRunning || externallyLocked || !this._syncState.sync_needed;
    const classes = `detail-sync-btn${!disabled && this._syncState.sync_needed ? " sync-btn-primary" : ""}${!remoteUnavailable && !syncRunning && !externallyLocked && !this._syncState.sync_needed ? " detail-sync-btn--state-ok" : ""}`;
    return T`<button class=${classes} ?disabled=${disabled} @click=${disabled ? null : this._runCommandConfigSync}>${label}</button>`;
  }
  _selectWifiDevice(deviceKey) {
    this._selectedDeviceKey = String(deviceKey || "").trim();
    void this._loadCommandConfigFromBackend(true);
    void this._loadCommandSyncProgress(true);
  }
  async _createWifiDevice() {
    const entityId = String(this._entityId() || "").trim();
    const deviceName = this._sanitizeWifiDeviceName(this._newDeviceName);
    if (!entityId || !this.hass?.callWS) return;
    if (this._hubCommandLocked()) return;
    if (!deviceName) {
      this._deviceMutationError = TOOLS_CARD_STRINGS.wifiCommands.createDeviceNameRequired;
      return;
    }
    this._creatingDevice = true;
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.createDeviceBusy);
    try {
      const payload = await this.hass.callWS({
        type: "sofabaton_x1s/command_device/create",
        entity_id: entityId,
        device_name: deviceName
      });
      this._closeCreateDeviceModal();
      await this._loadWifiDevices(true);
      this._selectWifiDevice(String(payload?.device_key || ""));
    } catch (error) {
      this._deviceMutationError = String(error?.message || TOOLS_CARD_STRINGS.wifiCommands.createDeviceFailed);
    } finally {
      this._creatingDevice = false;
      this._setSharedHubCommandBusy(false);
    }
  }
  _promptDeleteDevice(deviceKey, event) {
    event?.preventDefault();
    event?.stopPropagation();
    if (this._hubCommandLocked()) return;
    this._deviceMutationError = "";
    this._deleteDeviceKey = deviceKey;
  }
  _commandSyncWarningStorageKey(entityId) {
    return `sofabaton_x1s:sync_warning_optout:${String(entityId || "").trim()}`;
  }
  _commandSyncWarningOptedOut(entityId) {
    try {
      return window.localStorage?.getItem(this._commandSyncWarningStorageKey(entityId)) === "1";
    } catch (_error) {
      return false;
    }
  }
  _setCommandSyncWarningOptOut(entityId, optedOut) {
    try {
      if (optedOut) window.localStorage?.setItem(this._commandSyncWarningStorageKey(entityId), "1");
      else window.localStorage?.removeItem(this._commandSyncWarningStorageKey(entityId));
    } catch (_error) {
    }
  }
  async _startCommandConfigSync() {
    const entityId = String(this._entityId() || "").trim();
    const deviceKey = String(this._selectedDeviceKey || "").trim();
    if (!entityId || !this.hass?.callService) return;
    this._syncState = {
      ...this._syncState,
      status: "running",
      current_step: 0,
      total_steps: Number(this._syncState.total_steps || 0),
      message: TOOLS_CARD_STRINGS.wifiCommands.startSync,
      sync_needed: true
    };
    this._commandSyncRunning = true;
    this._commandSyncDeviceKey = deviceKey;
    this._wifiDevices = this._wifiDevices.map(
      (device) => device.device_key === deviceKey ? {
        ...device,
        ...this._syncState,
        status: "running"
      } : device
    );
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceFallback);
    try {
      await this.hass.callService("sofabaton_x1s", "sync_command_config", { entity_id: entityId, device_key: deviceKey });
      await this._refreshControlPanelState();
    } catch (error) {
      this._syncState = {
        ...this._syncState,
        status: "failed",
        message: String(error?.message || TOOLS_CARD_STRINGS.wifiCommands.syncFailedToStart)
      };
      this._wifiDevices = this._wifiDevices.map(
        (device) => device.device_key === deviceKey ? {
          ...device,
          ...this._syncState
        } : device
      );
    } finally {
      this._commandSyncRunning = false;
      this._commandSyncDeviceKey = null;
      await this._loadWifiDevices(true);
      await this._loadCommandSyncProgress(true);
      await this._refreshControlPanelState();
      this._setSharedHubCommandBusy(false);
    }
  }
  _scheduleSyncPoll() {
    const runningDevice = this._runningWifiDevice();
    const selectedDeviceRunning = this._syncState.status === "running";
    if (!selectedDeviceRunning && !runningDevice || this._remoteUnavailable()) {
      this._clearPollTimer();
      return;
    }
    if (this._commandSyncPollTimer != null) return;
    this._commandSyncPollTimer = window.setTimeout(async () => {
      this._commandSyncPollTimer = null;
      if (selectedDeviceRunning && this._selectedDeviceKey) {
        await this._loadCommandSyncProgress(true);
      } else {
        await this._loadWifiDevices(true);
      }
    }, 1e3);
  }
  _clearPollTimer() {
    if (this._commandSyncPollTimer != null) {
      window.clearTimeout(this._commandSyncPollTimer);
      this._commandSyncPollTimer = null;
    }
  }
  /** Active press for the current hub, while still inside the 720ms flash
   *  window. Returns null otherwise. Side-effect: schedules a single
   *  setTimeout to drop the overlay once the window closes so the slot
   *  / device-card DOM stays clean and the next press cleanly remounts
   *  via the `keyed(receivedAt, ...)` wrapper. */
  _activeWifiPressFlash() {
    const press = this.lastWifiPress;
    if (!press) return null;
    const entryId = this.hub?.entry_id ?? null;
    if (!entryId || press.entryId !== entryId) return null;
    const elapsed = Date.now() - press.receivedAt;
    if (elapsed < 0 || elapsed >= _SofabatonWifiCommandsTab._IR_FLASH_DURATION_MS) return null;
    if (this._irFlashClearForReceivedAt !== press.receivedAt) {
      if (this._irFlashClearTimer) clearTimeout(this._irFlashClearTimer);
      this._irFlashClearForReceivedAt = press.receivedAt;
      this._irFlashClearTimer = setTimeout(() => {
        this._irFlashClearTimer = null;
        this._irFlashClearForReceivedAt = null;
        this.requestUpdate();
      }, _SofabatonWifiCommandsTab._IR_FLASH_DURATION_MS - elapsed + 16);
    }
    return press;
  }
  /** True when the press belongs to the given hub device id. Used both
   *  for the device-card glow (list view) and to gate the slot glow
   *  (detail view), so we never flash a slot on the wrong device. */
  _pressMatchesDevice(press, device) {
    if (!device || press.deviceId == null) return false;
    const deployedId = device.deployed_device_id;
    if (typeof deployedId !== "number") return false;
    return deployedId === press.deviceId;
  }
  /** True when the press targets the slot at `idx` of the currently
   *  selected device. Matches by command_index (authoritative — the
   *  same index the hub uses to dispatch the HTTP callback). */
  _pressMatchesSlot(press, idx) {
    if (press.commandIndex == null) return false;
    if (press.commandIndex !== idx) return false;
    return this._pressMatchesDevice(press, this._selectedWifiDevice());
  }
  _hideUiActionTypeSelector(actionSelector) {
    const hideInNode = (node) => {
      if (!node || typeof node.querySelectorAll !== "function") return;
      node.querySelectorAll(".dropdown").forEach((dropdown) => {
        const element = dropdown;
        element.style.display = "none";
        element.setAttribute("aria-hidden", "true");
      });
    };
    const tryHide = () => {
      [actionSelector, actionSelector.shadowRoot].forEach((node) => {
        hideInNode(node);
        const uiAction = node?.querySelector?.("ha-selector-ui_action");
        if (uiAction) {
          hideInNode(uiAction);
          hideInNode(uiAction.shadowRoot);
          const editorInLight = uiAction.querySelector?.("hui-action-editor");
          if (editorInLight) {
            hideInNode(editorInLight);
            hideInNode(editorInLight.shadowRoot);
          }
          const editorInShadow = uiAction.shadowRoot?.querySelector?.("hui-action-editor");
          if (editorInShadow) {
            hideInNode(editorInShadow);
            hideInNode(editorInShadow.shadowRoot);
          }
        }
      });
    };
    [0, 50, 150, 350, 700].forEach((delay) => {
      window.setTimeout(() => tryHide(), delay);
    });
  }
};
if (!customElements.get("sofabaton-wifi-commands-tab")) {
  customElements.define("sofabaton-wifi-commands-tab", SofabatonWifiCommandsTab);
}

// tests/frontend/wifi-commands-tab.test.ts
var WifiCommandsTabElement = customElements.get("sofabaton-wifi-commands-tab");
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
};
var originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
var originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
function installStorage() {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: { localStorage: storage }
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: storage
  });
  return storage;
}
function restoreGlobal(name, descriptor) {
  if (descriptor) {
    Object.defineProperty(globalThis, name, descriptor);
    return;
  }
  delete globalThis[name];
}
beforeEach(() => {
  installStorage();
});
afterEach(() => {
  restoreGlobal("window", originalWindowDescriptor);
  restoreGlobal("localStorage", originalLocalStorageDescriptor);
});
test("wifi commands persists the selected device detail view per hub", () => {
  const element = new WifiCommandsTabElement();
  element.hub = { entry_id: "hub-1" };
  element._selectedDeviceKey = "dev-2";
  element._persistSelectedDeviceSession();
  const persisted = JSON.parse(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1") || "{}");
  assert.equal(persisted.deviceKey, "dev-2");
  assert.equal(Number.isFinite(Number(persisted.savedAt)), true);
});
test("wifi commands restores the selected device detail view when the device still exists", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "dev-2", savedAt: Date.now() })
  );
  const element = new WifiCommandsTabElement();
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [
    { device_key: "dev-1", device_name: "TV" },
    { device_key: "dev-2", device_name: "Receiver" }
  ];
  element._restoreSelectedDeviceSession();
  assert.equal(element._selectedDeviceKey, "dev-2");
});
test("wifi commands does not wipe the persisted selection before restore has been attempted", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "dev-2", savedAt: Date.now() })
  );
  const element = new WifiCommandsTabElement();
  element.hub = { entry_id: "hub-1" };
  element._persistSelectedDeviceSession();
  assert.equal(
    globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1"),
    JSON.stringify({ deviceKey: "dev-2", savedAt: JSON.parse(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1") || "{}").savedAt })
  );
});
test("wifi commands drops a stale selected device session when that device no longer exists", () => {
  globalThis.localStorage?.setItem(
    "sofabaton_x1s:wifi_commands:selected_device:hub-1",
    JSON.stringify({ deviceKey: "missing-device", savedAt: Date.now() })
  );
  const element = new WifiCommandsTabElement();
  element.hub = { entry_id: "hub-1" };
  element._wifiDevices = [
    { device_key: "dev-1", device_name: "TV" }
  ];
  element._restoreSelectedDeviceSession();
  assert.equal(element._selectedDeviceKey, null);
  assert.equal(globalThis.localStorage?.getItem("sofabaton_x1s:wifi_commands:selected_device:hub-1"), null);
});
