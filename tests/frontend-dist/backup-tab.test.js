// tests/frontend/backup-tab.test.ts
import test from "node:test";
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
var customElements2 = new CustomElementRegistryShimWithRealType();

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
var i = (t3, ...e3) => {
  const o5 = 1 === t3.length ? t3[0] : e3.reduce((e4, s4, o6) => e4 + ((t4) => {
    if (true === t4._$cssResult$) return t4.cssText;
    if ("number" == typeof t4) return t4;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t4 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t3[o6 + 1], t3[0]);
  return new n(o5, t3, s);
};
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
l.customElements ??= customElements2;
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
  persistIrBlob(entryId, deviceId, commandName, blob) {
    return this.hass.callWS({
      type: "sofabaton_x1s/blobs/persist",
      entry_id: entryId,
      device_id: deviceId,
      command_name: commandName,
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
  clearBackupResult(operationId) {
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
};

// custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors.ts
function sortByName(items = []) {
  return [...items].sort(
    (left, right) => String(left?.name ?? left?.label ?? "").localeCompare(String(right?.name ?? right?.label ?? ""))
  );
}
function hubDevices(hub) {
  return sortByName(hub?.devices_list ?? []);
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

// custom_components/sofabaton_x1s/www/src/shared/ha-context.ts
var BACKUP_BUNDLE_SCHEMA_VERSION = 5;

// custom_components/sofabaton_x1s/www/src/tabs/backup-state.ts
function backupDeviceOptions(hub) {
  return hubDevices(hub).map((device) => ({
    id: Number(device.id),
    label: String(device.name || `Device ${device.id}`),
    meta: String(device.device_class || "").trim() || void 0
  }));
}
function bundleActivityOptions(bundle) {
  return [...bundle?.activities ?? []].map((activity) => {
    const block = activity?.device || {};
    const id = Number(block.device_id || 0);
    return {
      id,
      label: String(block.name || `Activity ${id}`),
      meta: `${(activity?.referenced_source_device_ids ?? []).length} linked devices`
    };
  }).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label));
}
function bundleDeviceOptions(bundle) {
  return [...bundle?.devices ?? []].map((device) => {
    const block = device?.device || {};
    const id = Number(block.device_id || 0);
    return {
      id,
      label: String(block.name || `Device ${id}`),
      meta: String(block.device_class || "").trim() || void 0
    };
  }).filter((option) => option.id > 0).sort((left, right) => left.label.localeCompare(right.label));
}
function forcedRestoreDeviceIds(bundle, selectedActivityIds) {
  const selected = new Set(selectedActivityIds.map((value) => Number(value)));
  const forced = /* @__PURE__ */ new Set();
  for (const activity of bundle?.activities ?? []) {
    const activityId = Number(activity?.device?.device_id || 0);
    if (!selected.has(activityId)) continue;
    for (const deviceId of activity?.referenced_source_device_ids ?? []) {
      const normalized = Number(deviceId);
      if (normalized > 0) forced.add(normalized);
    }
  }
  return [...forced].sort((left, right) => left - right);
}
function reconcileRestoreSelection(params) {
  const forcedDeviceIds = forcedRestoreDeviceIds(params.bundle, params.selectedActivityIds);
  const selected = new Set(forcedDeviceIds);
  for (const deviceId of params.manualSelectedDeviceIds ?? []) {
    const normalized = Number(deviceId);
    if (normalized > 0) selected.add(normalized);
  }
  return {
    forcedDeviceIds,
    selectedDeviceIds: [...selected].sort((left, right) => left - right)
  };
}
function pruneBackupBundle(params) {
  const selectedActivityIds = new Set((params.selectedActivityIds ?? []).map((value) => Number(value)));
  const selectedDeviceIds = new Set((params.selectedDeviceIds ?? []).map((value) => Number(value)));
  return {
    ...params.bundle,
    devices: (params.bundle.devices ?? []).filter((device) => selectedDeviceIds.has(Number(device?.device?.device_id || 0))),
    activities: (params.bundle.activities ?? []).filter((activity) => selectedActivityIds.has(Number(activity?.device?.device_id || 0)))
  };
}
function validateBackupBundle(raw) {
  if (!raw || typeof raw !== "object") {
    throw new Error("Backup file must contain a JSON object.");
  }
  const bundle = raw;
  if (String(bundle.kind || "") !== "hub_bundle") {
    throw new Error("Backup file is not a Sofabaton hub bundle.");
  }
  if (Number(bundle.schema_version || 0) !== BACKUP_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Backup file schema_version must be ${BACKUP_BUNDLE_SCHEMA_VERSION} (got ${String(bundle.schema_version || "") || "unknown"}).`
    );
  }
  if (!Array.isArray(bundle.devices) || !Array.isArray(bundle.activities)) {
    throw new Error("Backup file is missing devices or activities arrays.");
  }
  return bundle;
}

// custom_components/sofabaton_x1s/www/src/tabs/backup-tab.ts
var SofabatonBackupTab = class extends i3 {
  constructor() {
    super(...arguments);
    this.hass = null;
    this.hub = null;
    this.cacheHub = null;
    this.hubCommandBusy = false;
    this.hubCommandBusyLabel = null;
    this.loading = false;
    this.error = null;
    this.persistentCacheEnabled = false;
    this.selectedHubProxyConnected = false;
    this.openSection = "make";
    this.setOpenSection = () => {
    };
    this._backupScope = "whole_hub";
    this._backupDeviceIds = [];
    this._backupError = null;
    this._backupProgress = null;
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this._restoreMode = "merge";
    this._restoreBundle = null;
    this._restoreFilename = "";
    this._restoreActivityIds = [];
    this._restoreManualDeviceIds = [];
    this._progressUnsub = null;
    this._downloadUrl = null;
    this._loadedBackupEntryId = "";
    this._backupHydrating = false;
    this._toggleAllBackupDevices = () => {
      const devices = backupDeviceOptions(this.cacheHub);
      const allIds = devices.map((device) => device.id);
      this._backupDeviceIds = this._backupDeviceIds.length === allIds.length ? [] : allIds;
    };
    this._selectAllRestoreItems = () => {
      const activities = bundleActivityOptions(this._restoreBundle).map((activity) => activity.id);
      const devices = bundleDeviceOptions(this._restoreBundle).map((device) => device.id);
      this._restoreActivityIds = activities;
      this._restoreManualDeviceIds = devices;
    };
    this._clearRestoreSelection = () => {
      this._restoreActivityIds = [];
      this._restoreManualDeviceIds = [];
    };
    this._resetBackupComposer = () => {
      this._backupError = null;
      this._backupProgress = null;
      this._backupScope = "whole_hub";
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
      this._revokeDownloadUrl();
    };
    this._resetRestoreComposer = () => {
      this._restoreError = null;
      this._restoreSuccess = null;
      this._restoreProgress = null;
      this._restoreMode = "merge";
    };
  }
  static {
    this.properties = {
      hass: { attribute: false },
      hub: { attribute: false },
      cacheHub: { attribute: false },
      setHubCommandBusy: { attribute: false },
      refreshControlPanelState: { attribute: false },
      hubCommandBusy: { type: Boolean },
      hubCommandBusyLabel: { type: String },
      loading: { type: Boolean },
      error: { type: String },
      persistentCacheEnabled: { type: Boolean },
      selectedHubProxyConnected: { type: Boolean },
      openSection: { attribute: false },
      setOpenSection: { attribute: false },
      _backupScope: { state: true },
      _backupDeviceIds: { state: true },
      _backupError: { state: true },
      _backupProgress: { state: true },
      _restoreError: { state: true },
      _restoreSuccess: { state: true },
      _restoreProgress: { state: true },
      _restoreMode: { state: true },
      _restoreBundle: { state: true },
      _restoreFilename: { state: true },
      _restoreActivityIds: { state: true },
      _restoreManualDeviceIds: { state: true },
      _loadedBackupEntryId: { state: true },
      _backupHydrating: { state: true }
    };
  }
  static {
    this.styles = i`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      --backup-radius-sm: calc(var(--ha-card-border-radius, 12px) * 0.85);
      --backup-radius-md: var(--ha-card-border-radius, 12px);
      --backup-radius-lg: calc(var(--ha-card-border-radius, 12px) * 1.33);
      --backup-radius-xl: calc(var(--ha-card-border-radius, 12px) * 1.8);
      --backup-radius-pill: calc(var(--ha-card-border-radius, 12px) * 999);
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
    .state {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      text-align: center;
      padding: 24px;
      line-height: 1.6;
    }
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
    .backup-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      margin: -16px;
    }
    .accordion-section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--divider-color); }
    .accordion-section:first-child { border-top: none; }
    .accordion-section.open { flex: 1; }
    .acc-header {
      flex-shrink: 0;
      height: 44px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 0 16px;
      cursor: pointer;
      user-select: none;
      transition: background-color 120ms ease;
    }
    .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
    .acc-header-icon { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; }
    .accordion-section.open .acc-header-icon { color: var(--primary-color); }
    .acc-header-icon ha-icon { --mdc-icon-size: 18px; }
    .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .flex-spacer { flex: 1; }
    .chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
    .accordion-section.open .chevron { transform: rotate(180deg); }
    .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 12px 16px; display: grid; gap: 12px; align-content: start; }
    .backup-body {
      padding-top: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-content: normal;
    }
    .restore-body {
      padding-top: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
      align-content: normal;
    }

    .header-primary-btn {
      flex: 0 0 auto;
      min-width: 114px;
      min-height: 42px;
      padding: 0 18px;
      border-radius: var(--backup-radius-md);
      border: 1px solid color-mix(in srgb, var(--primary-color) 75%, white 10%);
      background: color-mix(in srgb, var(--primary-color) 20%, white 80%);
      color: var(--primary-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      line-height: 1;
      cursor: pointer;
      transition: color 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .header-primary-btn:hover:not(:disabled) {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 24%, white 76%);
    }
    .header-primary-btn:disabled {
      opacity: 0.45;
      cursor: default;
    }
    .backup-action-row {
      display: flex;
      justify-content: flex-start;
    }
    .backup-drawer-sub { color: var(--secondary-text-color); font-size: 13px; line-height: 1.5; }
    .backup-section-title { color: var(--primary-text-color); font-size: 13px; font-weight: 700; }

    .backup-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .restore-config-view {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .backup-scope-group { display: grid; gap: 8px; }
    .backup-scope-options {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
    }
    .backup-scope-option {
      display: flex;
      cursor: pointer;
      min-width: 0;
    }
    .backup-scope-option * { cursor: inherit; }
    .backup-scope-option + .backup-scope-option {
      border-left: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
    }
    .backup-scope-option.selected {
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    .backup-scope-option ha-formfield {
      width: 100%;
      min-width: 0;
      --mdc-theme-text-primary-on-background: var(--primary-text-color);
    }
    .backup-scope-option .scope-form {
      width: 100%;
      min-width: 0;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0;
    }
    .backup-scope-option ha-radio { flex: 0 0 auto; }

    .backup-devices-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .backup-devices-head-main {
      display: flex;
      align-items: center;
      gap: 14px;
      flex-wrap: wrap;
    }
    .backup-selected-count {
      color: var(--primary-color);
      font-size: 12px;
      font-weight: 700;
    }
    .backup-link-btn {
      border: none;
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      padding: 0;
    }
    .backup-link-btn:disabled { opacity: 0.48; cursor: default; }

    .selection-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
      overflow: hidden;
      min-height: 0;
    }
    .backup-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .restore-config-view .selection-card {
      flex: 1 1 auto;
      min-height: 0;
    }
    .selection-list { display: flex; flex-direction: column; max-height: 340px; overflow-y: auto; }
    .backup-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .restore-config-view .selection-list {
      max-height: none;
      height: 100%;
      min-height: 0;
    }
    .selection-empty {
      padding: 16px 14px;
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .selection-group-header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      min-height: 36px;
      padding: 0 14px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .selection-group-header:first-child { border-top: none; }
    .selection-row {
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .selection-row:first-child { border-top: none; }
    .selection-row ha-checkbox { flex: 0 0 auto; }
    .selection-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 3px;
      flex: 1 1 auto;
    }
    .selection-label {
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
    }
    .selection-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
      margin-left: 8px;
    }
    .selection-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }

    .status-box {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 10px 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--secondary-text-color);
    }
    .status-box.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 35%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-box.warning {
      border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-icon { display: inline-flex; color: inherit; flex: 0 0 auto; }
    .status-icon ha-icon { --mdc-icon-size: 18px; }

    .action-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: center; }
    .primary-btn, .secondary-btn {
      border-radius: var(--backup-radius-md);
      padding: 10px 16px;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
    }
    .primary-btn {
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 16%, var(--ha-card-background, var(--card-background-color)));
    }
    .secondary-btn {
      border: 1px solid var(--divider-color);
      color: var(--primary-text-color);
      background: transparent;
    }
    .primary-btn:hover:not(:disabled), .secondary-btn:hover:not(:disabled) { transform: translateY(-1px); }
    .primary-btn:disabled, .secondary-btn:disabled { opacity: 0.48; cursor: default; transform: none; }

    .file-chip {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid var(--divider-color);
      font-size: 12px;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }

    .backup-complete-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      gap: 10px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 20%, var(--divider-color));
      border-radius: var(--backup-radius-xl);
      padding: 28px 18px;
      background:
        radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 14%, transparent), transparent 44%),
        color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, transparent);
    }
    .backup-complete-icon {
      width: 64px;
      height: 64px;
      display: grid;
      place-items: center;
      border-radius: var(--backup-radius-pill);
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
    }
    .backup-complete-icon ha-icon { --mdc-icon-size: 30px; }
    .backup-complete-title {
      color: var(--primary-text-color);
      font-size: 20px;
      font-weight: 700;
    }
    .backup-complete-sub {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }

    .mode-option-btn {
      width: 100%;
      min-width: 0;
      min-height: 36px;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-align: left;
      padding: 8px 14px;
    }
    .restore-action-row {
      display: flex;
      justify-content: flex-start;
      gap: 10px;
      flex-wrap: wrap;
    }

    .progress-shell {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-xl);
      padding: 18px;
      background: transparent;
      color: var(--primary-text-color);
    }
    .progress-shell[data-mode="restore"] .packet { animation-name: backupMove; }
    .progress-stage {
      position: relative;
      display: flex;
      flex-wrap: nowrap;
      justify-content: space-between;
      gap: 10px;
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
      border-radius: var(--backup-radius-lg);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 88%, transparent);
      border: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
    }
    .progress-node.home .progress-disc { color: #41bdf5; }
    .progress-node.hub .progress-disc { color: var(--primary-color); }
    .progress-disc ha-icon { --mdc-icon-size: 40px; }
    .progress-disc .progress-hub-svg { width: 48px; height: 48px; }
    .progress-node-label {
      color: var(--secondary-text-color);
      font-size: 11px;
      letter-spacing: .08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .progress-route { position: relative; flex: 1 1 auto; min-width: 84px; height: 42px; }
    .progress-route::before {
      content: "";
      position: absolute;
      left: 0;
      right: 0;
      top: 50%;
      height: 2px;
      background: color-mix(in srgb, var(--divider-color) 75%, transparent);
      transform: translateY(-50%);
    }
    .packet {
      position: absolute;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: #5ff0a0;
      box-shadow: 0 0 0 4px rgba(95,240,160,.12);
      animation: restoreMove 1.75s cubic-bezier(.55,0,.25,1) infinite;
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
    .progress-bar {
      margin-top: 14px;
      height: 8px;
      overflow: hidden;
      border-radius: var(--backup-radius-pill);
      background: color-mix(in srgb, var(--divider-color) 55%, transparent);
    }
    .progress-bar-fill {
      height: 100%;
      border-radius: inherit;
      background: linear-gradient(90deg, #41bdf5, #5ff0a0, #a78bfa);
      transition: width 180ms ease;
    }
    .progress-meta {
      margin-top: 10px;
      display: flex;
      justify-content: space-between;
      gap: 10px;
      font-size: 12px;
      color: var(--secondary-text-color);
    }

    input[type="file"] { display: none; }
    @keyframes backupMove {
      0% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
      18% { opacity: 1; }
      82% { opacity: 1; }
      100% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
    }
    @keyframes restoreMove {
      0% { left: 94%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(.55); }
      18% { opacity: 1; }
      82% { opacity: 1; }
      100% { left: 6%; top: 50%; opacity: 0; transform: translate(-50%, -50%) scale(1); }
    }

    @media (max-width: 380px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
    }
    @media (max-width: 760px) {
      .progress-disc { width: 64px; height: 64px; }
      .progress-disc .progress-hub-svg { width: 40px; height: 40px; }
      .progress-route { min-width: 56px; }
    }
  `;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
    this._revokeDownloadUrl();
  }
  updated(changed) {
    if (changed.has("hub")) {
      void this._syncBackupOperationState();
    }
    if (changed.has("cacheHub") && this.cacheHub && !this._backupDeviceIds.length) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
  }
  render() {
    if (this.loading) {
      return T`<div class="tab-panel"><div class="state">Loading backup tools…</div></div>`;
    }
    if (this.error) {
      return T`<div class="tab-panel"><div class="state error">${this.error}</div></div>`;
    }
    if (!this.hub || !this.hass) {
      return T`<div class="tab-panel"><div class="state">Select a hub to manage backups.</div></div>`;
    }
    if (this.selectedHubProxyConnected) {
      return T`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">Backup unavailable</div>
            <div class="blocked-state-sub">Backup cannot be used while the Sofabaton app is connected to the hub through the proxy.</div>
          </div>
        </div>
      `;
    }
    return T`
      <div class="tab-panel">
        <div class="backup-panel">
          ${this._renderBackupSection()}
          ${this._renderRestoreSection()}
        </div>
      </div>
    `;
  }
  _renderBackupSection() {
    const isOpen = this.openSection === "make";
    const devices = backupDeviceOptions(this.cacheHub);
    const wholeHub = this._backupScope === "whole_hub";
    const selectedDeviceIds = wholeHub ? devices.map((device) => device.id) : this._backupDeviceIds;
    const isRunning = this._isProgressRunning(this._backupProgress);
    const isSuccess = String(this._backupProgress?.status || "") === "success";
    const allDevicesSelected = devices.length > 0 && this._backupDeviceIds.length === devices.length;
    const summary = this._backupResultSummary(this._backupProgress?.backup);
    return T`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this.setOpenSection("make")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:content-save-move-outline"></ha-icon></span>
          <span class="acc-title">Make A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? T`
          <div class="acc-body backup-body">
            <div class="backup-drawer-sub">
              ${isRunning ? "The hub is creating your backup." : isSuccess ? "Your backup is ready." : "Choose what to include in this backup."}
            </div>
            ${!this.persistentCacheEnabled || !this.cacheHub ? this._renderStatus("warning", "mdi:database-off-outline", "Enable persistent cache to choose backup contents from the card.") : A}
            ${this._backupError ? this._renderStatus("error", "mdi:alert-circle-outline", this._backupError) : A}
            ${isRunning && this._backupProgress ? this._renderProgressCard(this._backupProgress, "backup") : isSuccess ? T`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Backup completed</div>
                    <div class="backup-complete-sub">${summary}</div>
                    <div class="action-row">
                      <button class="primary-btn" ?disabled=${!this._backupProgress?.backup} @click=${this._downloadLatestBackup}>
                        Download backup
                      </button>
                      <button class="secondary-btn" @click=${this._resetBackupComposer}>New backup</button>
                    </div>
                  </div>
                ` : T`
                  <div class="backup-config-view">
                  <div class="backup-scope-group">
                    <div class="backup-scope-options">
                      <label
                        class="backup-scope-option ${wholeHub ? "selected" : ""}"
                        @click=${() => {
      if (this._backupLocked() || !this.cacheHub) return;
      this._setBackupScope("whole_hub");
    }}
                      >
                        <ha-formfield class="scope-form" label="Entire hub">
                          <ha-radio
                            name="backup-scope"
                            .checked=${wholeHub}
                            ?disabled=${this._backupLocked() || !this.cacheHub}
                          ></ha-radio>
                        </ha-formfield>
                      </label>
                      <label
                        class="backup-scope-option ${!wholeHub ? "selected" : ""}"
                        @click=${() => {
      if (this._backupLocked() || !this.cacheHub) return;
      this._setBackupScope("individual_devices");
    }}
                      >
                        <ha-formfield class="scope-form" label="Selected devices">
                          <ha-radio
                            name="backup-scope"
                            .checked=${!wholeHub}
                            ?disabled=${this._backupLocked() || !this.cacheHub}
                          ></ha-radio>
                        </ha-formfield>
                      </label>
                    </div>
                  </div>
                  ${!wholeHub ? T`
                    <div class="backup-devices-head">
                      <div class="backup-devices-head-main">
                        <div class="backup-section-title">Devices to include</div>
                        <div class="backup-selected-count">${this._backupDeviceIds.length} selected</div>
                      </div>
                      <button class="backup-link-btn" ?disabled=${this._backupLocked() || !this.cacheHub} @click=${this._toggleAllBackupDevices}>
                        ${allDevicesSelected ? "Deselect all" : "Select all"}
                      </button>
                    </div>
                    <div class="selection-card">
                      <div class="selection-list">
                        ${devices.length ? devices.map((device) => T`
                              <div
                                class="selection-row"
                                @click=${() => {
      if (this._backupLocked() || !this.cacheHub) return;
      this._setBackupDevice(device.id, !selectedDeviceIds.includes(device.id));
    }}
                              >
                                <ha-checkbox
                                  .checked=${selectedDeviceIds.includes(device.id)}
                                  ?disabled=${this._backupLocked() || !this.cacheHub}
                                  @click=${(event) => event.stopPropagation()}
                                  @change=${(event) => {
      const target = event.currentTarget;
      this._setBackupDevice(device.id, !!target.checked);
    }}
                                ></ha-checkbox>
                                <span class="selection-main">
                                  <span class="selection-label">${device.label}</span>
                                </span>
                                ${device.meta ? T`<span class="selection-meta">${device.meta}</span>` : A}
                              </div>
                            `) : T`<div class="selection-empty">No devices available.</div>`}
                      </div>
                    </div>
                  ` : A}
                  <div class="backup-action-row">
                    <button
                      class="primary-btn header-primary-btn"
                      ?disabled=${this._backupActionDisabled()}
                      @click=${() => void this._runBackup()}
                    >
                      ${isRunning ? "Working" : "Start backup"}
                    </button>
                  </div>
                  </div>
                `}
          </div>
        ` : A}
      </div>
    `;
  }
  _renderRestoreSectionLegacy() {
    const isOpen = this.openSection === "restore";
    const isRunning = this._isProgressRunning(this._restoreProgress);
    const activityOptions = bundleActivityOptions(this._restoreBundle);
    const deviceOptions = bundleDeviceOptions(this._restoreBundle);
    const restoreSelection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds
    });
    return T`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this.setOpenSection("restore")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:database-import-outline"></ha-icon></span>
          <span class="acc-title">Restore A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? T`
          <div class="acc-body restore-body">
            <div class="backup-drawer-sub">
              Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on.
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : A}
            ${this._restoreSuccess ? this._renderStatus("success", "mdi:check-circle-outline", this._restoreSuccess) : A}
            ${isRunning && this._restoreProgress ? this._renderProgressCard(this._restoreProgress, "restore") : A}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            <div class="action-row" style="justify-content:flex-start;">
              <button class="secondary-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>Choose backup file</button>
              ${this._restoreFilename ? T`<span class="file-chip"><ha-icon icon="mdi:file-document-outline"></ha-icon>${this._restoreFilename}</span>` : A}
            </div>
            ${this._restoreBundle ? T`
              <div class="mode-tabs">
                <button class="mode-tab ${this._restoreMode === "replace" ? "active" : ""}" ?disabled=${this._restoreLocked()} @click=${() => this._restoreMode = "replace"}>Replace</button>
                <button class="mode-tab ${this._restoreMode === "merge" ? "active" : ""}" ?disabled=${this._restoreLocked()} @click=${() => this._restoreMode = "merge"}>Merge</button>
              </div>
              ${this._renderStatus(
      "warning",
      this._restoreMode === "replace" ? "mdi:alert-outline" : "mdi:plus-circle-outline",
      this._restoreMode === "replace" ? "Replace erases the destination hub first, then restores the selected content." : "Merge keeps the current hub content and adds the selected backup content as new items."
    )}
              <div class="selection-card">
                <div class="selection-list">
                  ${activityOptions.length ? activityOptions.map((activity) => T`
                    <div class="selection-row">
                      <ha-checkbox
                        .checked=${this._restoreActivityIds.includes(activity.id)}
                        ?disabled=${this._restoreLocked()}
                        @change=${(event) => {
      const target = event.currentTarget;
      this._setRestoreActivity(activity.id, !!target.checked);
    }}
                      ></ha-checkbox>
                      <span class="selection-main">
                        <span class="selection-label">${activity.label}</span>
                        ${activity.meta ? T`<span class="selection-sub">${activity.meta}</span>` : A}
                      </span>
                    </div>
                  `) : T`<div class="selection-empty">This backup file has no activities.</div>`}
                </div>
              </div>
              <div class="selection-card">
                <div class="selection-list">
                  ${deviceOptions.length ? deviceOptions.map((device) => {
      const forced = restoreSelection.forcedDeviceIds.includes(device.id);
      return T`
                      <div class="selection-row ${forced ? "locked" : ""}">
                        <ha-checkbox
                          .checked=${restoreSelection.selectedDeviceIds.includes(device.id)}
                          ?disabled=${forced || this._restoreLocked()}
                          @change=${(event) => {
        const target = event.currentTarget;
        this._setRestoreDevice(device.id, !!target.checked);
      }}
                        ></ha-checkbox>
                        <span class="selection-main">
                          <span class="selection-label">${device.label}</span>
                          ${device.meta ? T`<span class="selection-sub">${forced ? `${device.meta} \xB7 required by selected activities` : device.meta}</span>` : A}
                        </span>
                      </div>
                    `;
    }) : T`<div class="selection-empty">This backup file has no devices.</div>`}
                </div>
              </div>
              <div class="action-row" style="justify-content:flex-start;">
                <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
              </div>
            ` : A}
          </div>
        ` : A}
      </div>
    `;
  }
  _renderRestoreSection() {
    const isOpen = this.openSection === "restore";
    const isRunning = this._isProgressRunning(this._restoreProgress);
    const isSuccess = String(this._restoreProgress?.status || "") === "success";
    const activityOptions = bundleActivityOptions(this._restoreBundle);
    const deviceOptions = bundleDeviceOptions(this._restoreBundle);
    const restoreSelection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds
    });
    const totalRestoreOptions = activityOptions.length + deviceOptions.length;
    const totalRestoreSelected = this._restoreActivityIds.length + restoreSelection.selectedDeviceIds.length;
    const allRestoreSelected = totalRestoreOptions > 0 && totalRestoreSelected === totalRestoreOptions;
    return T`
      <div class="accordion-section ${isOpen ? "open" : ""}">
        <div class="acc-header" @click=${() => this.setOpenSection("restore")}>
          <span class="acc-header-icon"><ha-icon icon="mdi:database-import-outline"></ha-icon></span>
          <span class="acc-title">Restore A Backup</span>
          <span class="flex-spacer"></span>
          <span class="chevron">▼</span>
        </div>
        ${isOpen ? T`
          <div class="acc-body restore-body">
            <div class="backup-drawer-sub">
              ${isRunning ? "The hub is restoring your backup." : isSuccess ? "Your restore has completed." : "Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on."}
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : A}
            ${isRunning && this._restoreProgress ? this._renderProgressCard(this._restoreProgress, "restore") : isSuccess ? T`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Restore completed</div>
                    <div class="backup-complete-sub">The selected Activities and Devices were restored to the hub.</div>
                    <div class="action-row">
                      <button class="primary-btn" @click=${this._resetRestoreComposer}>Complete</button>
                    </div>
                  </div>
                ` : A}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            ${!isRunning && !isSuccess && this._restoreBundle ? T`
              <div class="restore-config-view">
                <div class="backup-devices-head">
                  <div class="backup-devices-head-main">
                    <div class="backup-section-title">Items to restore</div>
                    <div class="backup-selected-count">${totalRestoreSelected} selected</div>
                  </div>
                  <button class="backup-link-btn" ?disabled=${this._restoreLocked()} @click=${allRestoreSelected ? this._clearRestoreSelection : this._selectAllRestoreItems}>
                    ${allRestoreSelected ? "Deselect all" : "Select all"}
                  </button>
                </div>
                <div class="selection-card">
                  <div class="selection-list">
                    ${activityOptions.length ? T`
                        <div class="selection-group-header">Activities</div>
                        ${activityOptions.map((activity) => T`
                          <div
                            class="selection-row"
                            @click=${() => {
      if (this._restoreLocked()) return;
      this._setRestoreActivity(activity.id, !this._restoreActivityIds.includes(activity.id));
    }}
                          >
                            <ha-checkbox
                              .checked=${this._restoreActivityIds.includes(activity.id)}
                              ?disabled=${this._restoreLocked()}
                              @click=${(event) => event.stopPropagation()}
                              @change=${(event) => {
      const target = event.currentTarget;
      this._setRestoreActivity(activity.id, !!target.checked);
    }}
                            ></ha-checkbox>
                            <span class="selection-main">
                              <span class="selection-label">${activity.label}</span>
                            </span>
                            ${activity.meta ? T`<span class="selection-meta">${activity.meta}</span>` : A}
                          </div>
                        `)}
                      ` : T`<div class="selection-empty">This backup file has no activities.</div>`}
                    ${deviceOptions.length ? T`
                        <div class="selection-group-header">Devices</div>
                        ${deviceOptions.map((device) => {
      const forced = restoreSelection.forcedDeviceIds.includes(device.id);
      return T`
                            <div
                              class="selection-row ${forced ? "locked" : ""}"
                              @click=${() => {
        if (forced || this._restoreLocked()) return;
        this._setRestoreDevice(device.id, !restoreSelection.selectedDeviceIds.includes(device.id));
      }}
                            >
                              <ha-checkbox
                                .checked=${restoreSelection.selectedDeviceIds.includes(device.id)}
                                ?disabled=${forced || this._restoreLocked()}
                                @click=${(event) => event.stopPropagation()}
                                @change=${(event) => {
        const target = event.currentTarget;
        this._setRestoreDevice(device.id, !!target.checked);
      }}
                              ></ha-checkbox>
                              <span class="selection-main">
                                <span class="selection-label">${device.label}</span>
                              </span>
                              ${device.meta ? T`<span class="selection-meta">${forced ? `${device.meta} \xB7 linked` : device.meta}</span>` : A}
                            </div>
                          `;
    })}
                      ` : T`<div class="selection-empty">This backup file has no devices.</div>`}
                  </div>
                </div>
                <div class="backup-scope-group">
                  <div
                    class="selection-row"
                    @click=${() => {
      if (this._restoreLocked()) return;
      this._restoreMode = this._restoreMode === "replace" ? "merge" : "replace";
    }}
                  >
                    <ha-checkbox
                      .checked=${this._restoreMode === "replace"}
                      ?disabled=${this._restoreLocked()}
                      @click=${(event) => event.stopPropagation()}
                      @change=${(event) => {
      const target = event.currentTarget;
      this._restoreMode = target.checked ? "replace" : "merge";
    }}
                    ></ha-checkbox>
                    <span class="selection-main">
                      <span class="selection-label">Erase existing Devices and Activities</span>
                    </span>
                  </div>
                </div>
                <div class="restore-action-row">
                  <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
                  <button class="secondary-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : !isRunning && !isSuccess ? T`
              <div class="restore-action-row">
                <button class="secondary-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
              </div>
            ` : A}
          </div>
        ` : A}
      </div>
    `;
  }
  _renderStatus(tone, icon, message) {
    return T`
      <div class="status-box ${tone}">
        <span class="status-icon"><ha-icon icon=${icon}></ha-icon></span>
        <span>${message}</span>
      </div>
    `;
  }
  _renderProgressCard(progress, mode) {
    const total = Math.max(0, Number(progress.total_steps || 0));
    const done = Math.max(0, Number(progress.completed_steps || 0));
    const percent = total > 0 ? Math.max(6, Math.min(100, Math.round(done / total * 100))) : 36;
    return T`
      <div class="progress-shell" data-mode=${mode}>
        <div class="progress-stage">
          <div class="progress-node home">
            <div class="progress-disc"><ha-icon icon="mdi:home-assistant"></ha-icon></div>
            <div class="progress-node-label">Home Assistant</div>
          </div>
          <div class="progress-route" aria-hidden="true">
            <i class="packet"></i>
            <i class="packet"></i>
            <i class="packet"></i>
          </div>
          <div class="progress-node hub">
            <div class="progress-disc">${hubIcon("hero", "progress-hub-svg")}</div>
            <div class="progress-node-label">Sofabaton Hub</div>
          </div>
        </div>
        <div class="progress-copy">
          <div class="progress-title">${mode === "backup" ? "Creating backup" : "Restoring backup"}</div>
          <div class="progress-message">${String(progress.message || "Working\u2026")}</div>
        </div>
        <div class="progress-bar"><div class="progress-bar-fill" style=${`width:${percent}%`}></div></div>
        <div class="progress-meta">
          <span>${String(progress.phase || "running").replace(/_/g, " ")}</span>
          <span>${total > 0 ? `${done}/${total} steps` : "Preparing\u2026"}</span>
        </div>
      </div>
    `;
  }
  _backupLocked() {
    return this.hubCommandBusy || this._isProgressRunning(this._backupProgress) || this._isProgressRunning(this._restoreProgress);
  }
  _restoreLocked() {
    return this.hubCommandBusy || this._isProgressRunning(this._restoreProgress) || this._isProgressRunning(this._backupProgress);
  }
  _isProgressRunning(progress) {
    return !!progress && ["pending", "running"].includes(String(progress.status || ""));
  }
  _setBackupScope(scope) {
    this._backupScope = scope;
    if (!this._backupDeviceIds.length && this.cacheHub) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
  }
  _setBackupDevice(deviceId, checked) {
    const next = new Set(this._backupDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._backupDeviceIds = [...next].sort((left, right) => left - right);
  }
  _setRestoreActivity(activityId, checked) {
    const next = new Set(this._restoreActivityIds);
    if (checked) next.add(activityId);
    else next.delete(activityId);
    this._restoreActivityIds = [...next].sort((left, right) => left - right);
  }
  _setRestoreDevice(deviceId, checked) {
    const next = new Set(this._restoreManualDeviceIds);
    if (checked) next.add(deviceId);
    else next.delete(deviceId);
    this._restoreManualDeviceIds = [...next].sort((left, right) => left - right);
  }
  _backupActionDisabled() {
    if (this._backupLocked()) return true;
    if (!this.hub || !this.hass || !this.cacheHub || !this.persistentCacheEnabled) return true;
    if (String(this._backupProgress?.status || "") === "success") return true;
    if (this._backupScope === "whole_hub") return false;
    return this._backupDeviceIds.length === 0;
  }
  _restoreActionDisabled(selectedDeviceIds) {
    if (this._restoreLocked()) return true;
    if (!this.hub || !this.hass || !this._restoreBundle) return true;
    return selectedDeviceIds.length === 0 && this._restoreActivityIds.length === 0;
  }
  api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
  }
  async _runBackup() {
    if (!this.hub) return;
    this._backupError = null;
    this._backupProgress = null;
    this._revokeDownloadUrl();
    const deviceIds = this._backupScope === "whole_hub" ? null : this._backupDeviceIds;
    this.setHubCommandBusy?.(true, "Starting backup\u2026");
    try {
      const start = await this.api().startBackupExport(this.hub.entry_id, deviceIds);
      await this._subscribeToOperation(start.operation_id, "backup");
    } catch (error) {
      this._backupError = formatError(error);
      this.setHubCommandBusy?.(false, null);
    }
  }
  async _runRestore() {
    if (!this.hub || !this._restoreBundle) return;
    const selection = reconcileRestoreSelection({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      manualSelectedDeviceIds: this._restoreManualDeviceIds
    });
    const filtered = pruneBackupBundle({
      bundle: this._restoreBundle,
      selectedActivityIds: this._restoreActivityIds,
      selectedDeviceIds: selection.selectedDeviceIds
    });
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this.setHubCommandBusy?.(true, "Starting restore\u2026");
    try {
      const start = await this.api().startBackupRestore(this.hub.entry_id, filtered, this._restoreMode);
      await this._subscribeToOperation(start.operation_id, "restore");
    } catch (error) {
      this._restoreError = formatError(error);
      this.setHubCommandBusy?.(false, null);
    }
  }
  async _subscribeToOperation(operationId, kind) {
    this._teardownProgressSubscription();
    const unsubscribe = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      if (kind === "backup") {
        this._backupProgress = payload;
        if (payload.status === "success") {
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
          }
        } else if (payload.status === "failed") {
          this._backupError = String(payload.error || payload.message || "Backup failed.");
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
          }
        }
      } else {
        this._restoreProgress = payload;
        if (payload.status === "success") {
          this._restoreSuccess = "Restore completed.";
          this.setHubCommandBusy?.(false, null);
          try {
            await this.refreshControlPanelState?.();
          } catch {
          }
        } else if (payload.status === "failed") {
          this._restoreError = String(payload.error || payload.message || "Restore failed.");
          this.setHubCommandBusy?.(false, null);
        }
      }
      if (!this._isProgressRunning(payload)) {
        this._teardownProgressSubscription();
      }
    });
    this._progressUnsub = unsubscribe;
  }
  _teardownProgressSubscription() {
    const unsub = this._progressUnsub;
    this._progressUnsub = null;
    if (unsub) {
      try {
        unsub();
      } catch {
      }
    }
  }
  _openFilePicker() {
    this.renderRoot.querySelector("#restore-file-input")?.click();
  }
  async _handleFilePicked(event) {
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if (!file) return;
    this._restoreError = null;
    this._restoreSuccess = null;
    try {
      const text = await file.text();
      const bundle = validateBackupBundle(JSON.parse(text));
      this._restoreBundle = bundle;
      this._restoreFilename = file.name;
      this._restoreMode = "merge";
      this._restoreActivityIds = bundleActivityOptions(bundle).map((activity) => activity.id);
      this._restoreManualDeviceIds = bundleDeviceOptions(bundle).map((device) => device.id);
    } catch (error) {
      this._restoreBundle = null;
      this._restoreFilename = "";
      this._restoreActivityIds = [];
      this._restoreManualDeviceIds = [];
      this._restoreError = formatError(error);
    } finally {
      if (input) input.value = "";
    }
  }
  async _downloadLatestBackup() {
    const backup = this._backupProgress?.backup;
    if (!backup) return;
    this._revokeDownloadUrl();
    this._downloadUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = this._downloadUrl;
    anchor.download = String(this._backupProgress?.filename || "sofabaton_backup.json");
    anchor.click();
    try {
      if (this._backupProgress?.operation_id) {
        await this.api().clearBackupResult(this._backupProgress.operation_id);
        this._backupProgress = { ...this._backupProgress, backup_downloaded: true };
      }
    } catch {
    }
  }
  _backupResultSummary(bundle) {
    const activityCount = Array.isArray(bundle?.activities) ? bundle.activities.length : 0;
    const deviceCount = Array.isArray(bundle?.devices) ? bundle.devices.length : 0;
    return `${activityCount} Activities and ${deviceCount} Devices backed up`;
  }
  async _syncBackupOperationState() {
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entryId || !this.hass) return;
    if (this._loadedBackupEntryId === entryId && this._backupHydrating) return;
    const activeOperation = this.hub?.active_backup_operation || null;
    const activeOperationId = this._isProgressRunning(activeOperation) ? String(activeOperation?.operation_id || "").trim() : "";
    const localOperationId = String(
      this._backupProgress?.operation_id || this._restoreProgress?.operation_id || ""
    ).trim();
    const localProgressRunning = this._isProgressRunning(this._backupProgress) || this._isProgressRunning(this._restoreProgress);
    if (this._loadedBackupEntryId === entryId && this._progressUnsub && !!activeOperationId && localProgressRunning && localOperationId === activeOperationId) {
      return;
    }
    this._loadedBackupEntryId = entryId;
    this._backupHydrating = true;
    this._teardownProgressSubscription();
    try {
      const state = await this.api().getBackupState(entryId);
      this._backupProgress = state?.backup_export || null;
      this._restoreProgress = state?.backup_restore || null;
      this._backupError = String(this._backupProgress?.status || "") === "failed" ? String(this._backupProgress?.error || this._backupProgress?.message || "Backup failed.") : null;
      this._restoreError = String(this._restoreProgress?.status || "") === "failed" ? String(this._restoreProgress?.error || this._restoreProgress?.message || "Restore failed.") : null;
      this._restoreSuccess = String(this._restoreProgress?.status || "") === "success" ? "Restore completed." : null;
      const active = state?.active_operation || null;
      if (active && String(active.kind || "") === "backup_export" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Backup in progress\u2026"));
        await this._subscribeToOperation(active.operation_id, "backup");
      } else if (active && String(active.kind || "") === "backup_restore" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Restore in progress\u2026"));
        await this._subscribeToOperation(active.operation_id, "restore");
      } else {
        this.setHubCommandBusy?.(false, null);
      }
    } catch {
    } finally {
      this._backupHydrating = false;
    }
  }
  _revokeDownloadUrl() {
    if (!this._downloadUrl) return;
    URL.revokeObjectURL(this._downloadUrl);
    this._downloadUrl = null;
  }
};
if (!customElements.get("sofabaton-backup-tab")) {
  customElements.define("sofabaton-backup-tab", SofabatonBackupTab);
}

// tests/frontend/backup-tab.test.ts
var BackupTabElement = customElements.get("sofabaton-backup-tab");
function createHass(state, onBackupState) {
  return {
    states: {},
    async callWS(message) {
      const type = String(message.type ?? "");
      if (type === "sofabaton_x1s/backup/state") {
        onBackupState?.();
        return state;
      }
      throw new Error(`Unexpected WS call: ${type}`);
    },
    connection: null
  };
}
test("backup tab rehydrates a stale running restore when the hub no longer reports an active operation", async () => {
  let unsubscribed = false;
  let backupStateCalls = 0;
  const element = new BackupTabElement();
  element.hass = createHass(
    {
      backup_restore: {
        operation_id: "restore-1",
        kind: "backup_restore",
        entry_id: "hub-1",
        status: "success",
        phase: "completed",
        message: "Restore completed.",
        completed_steps: 4,
        total_steps: 4
      },
      active_operation: null
    },
    () => {
      backupStateCalls += 1;
    }
  );
  element.hub = {
    entry_id: "hub-1",
    active_backup_operation: null
  };
  element.setHubCommandBusy = () => void 0;
  element._loadedBackupEntryId = "hub-1";
  element._progressUnsub = () => {
    unsubscribed = true;
  };
  element._restoreProgress = {
    operation_id: "restore-1",
    kind: "backup_restore",
    entry_id: "hub-1",
    status: "running",
    phase: "hub",
    message: "Restored hub name.",
    completed_steps: 4,
    total_steps: 4
  };
  await element._syncBackupOperationState();
  assert.equal(backupStateCalls, 1);
  assert.equal(unsubscribed, true);
  assert.equal(element._restoreProgress?.status, "success");
  assert.equal(element._restoreSuccess, "Restore completed.");
});
