// tests/frontend/edit-detail-view.test.ts
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
var HTMLElementShim = class HTMLElement2 extends ElementShim {
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

// custom_components/sofabaton_x1s/www/src/strings.ts
var TOOLS_CARD_STRINGS = {
  docs: {
    wifiCommandsUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
    backupUrl: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/backup.md"
  },
  tabs: {
    cache: "Hub",
    wifiCommands: "Wifi Commands",
    backup: "Backup",
    settings: "Settings",
    logs: "Logs"
  },
  tabDocs: {
    wifi_commands: "Wifi Commands documentation",
    backup: "Backup documentation"
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
    persistentCacheOffCopy: "Turn it on to browse cached activities and devices, and to unlock Backup workflows that depend on it.",
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
    refreshList: "Refresh list",
    refreshAll: "Refresh all",
    editActivity: "Edit activity",
    editDevice: "Edit device",
    changeOrder: "Change order",
    addActivity: "Add Activity",
    reorderSync: "Sync to hub",
    reorderCancel: "Cancel",
    reorderHint: "Drag activities into the desired order, then sync to the hub.",
    reorderDevicesHint: "Drag devices into the desired order, then sync to the hub.",
    reorderSyncing: "Writing the new order to the hub\u2026",
    addActivityTitle: "Add Activity",
    addActivityBody: "Name the new activity. It is created on the hub and opened in the editor.",
    addActivityPlaceholder: "Activity name",
    addActivityCancel: "Cancel",
    addActivityConfirm: "Create",
    addActivityCreating: "Creating\u2026"
  },
  logs: {
    loading: "Loading log stream...",
    empty: "No log lines captured for this hub yet.",
    liveConsole: "Live Console"
  },
  cacheRefresh: {
    label: "Refresh all",
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
  activities: {
    loading: "Loading activities...",
    selectHub: "Select a hub to edit its activities.",
    activityFallback: (id) => `Activity ${id}`,
    // Guard panels (§4.1), rendered inside the editor view.
    appConnectedTitle: "The Sofabaton app is connected",
    appConnectedBody: "Close the Sofabaton app to edit the hub configuration.",
    operationRunningTitle: "Another operation is running",
    operationRunningBody: "Wait for the current backup, restore, or sync to finish, then try again.",
    // Capture flow (§4.2).
    captureTitle: "Reading your hub",
    captureMessage: "Reading your hub's configuration\u2026",
    captureMessageWithStep: (current, total) => `Reading your hub's configuration\u2026 (device ${current} of ${total})`,
    captureFailedTitle: "Couldn't read the hub",
    captureFailedBody: "The hub stopped responding before we finished reading it.",
    retry: "Retry",
    back: "Back",
    // Cache-sourced capture (blob-free structural bundle).
    capturingFromCache: (kind) => `Loading ${kind} from the hub cache\u2026`,
    needsRefreshTitle: "Refresh the hub cache to edit",
    needsRefreshBody: (kind) => `This ${kind} isn't in the local hub cache yet. Refresh the hub cache (a few seconds) to load it into the editor.`,
    // Session restore banner (§4.6).
    // Live-mode edit header (§4.3). The header mirrors the Wifi command
    // editor: a single stateful Sync button (no dirty chip, no review/discard).
    syncToHub: "Sync to Hub",
    syncUpToDate: "Up to date",
    // Immediate entity delete (executed on the hub right away).
    deletingTitle: (kind) => `Deleting ${kind}`,
    deletingMessage: (kind) => `Removing this ${kind} from the hub\u2026`,
    // Sync flow (§4.5).
    syncingTitle: "Syncing to your hub",
    syncingMessage: "Writing your changes to the hub\u2026",
    syncSuccess: "Synced to hub.",
    syncPlanSummary: (count) => `${count} hub ${count === 1 ? "write" : "writes"}`,
    syncFailedTitle: "Sync didn't finish",
    syncFailedStep: (step) => `The hub stopped at: ${step}`,
    syncStaleTitle: (kind) => `This ${kind} changed on the hub`,
    syncStaleBody: (kind) => `The ${kind} was edited on the hub since you loaded it, so your changes can't be safely applied. Reload the hub's current version to continue \u2014 your unsaved edits will be discarded.`,
    syncRetry: "Retry sync",
    syncReload: "Reload from hub",
    syncKeepEditing: "Keep editing",
    exitUnsyncedTitle: "Unsynced changes",
    exitUnsyncedBody: (kind) => `This ${kind} has changes that have not been synced to the hub. Sync them now, or leave without syncing and discard the local edit.`,
    exitSyncNow: "Sync now",
    exitWithoutSync: "Leave without syncing",
    // Dismiss label reused by the sync-success / delete-error banners.
    discardConfirmCancel: "Keep editing",
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
      startReordered: "Start sequence reordered.",
      roleNowControls: (group, device) => `${group} now control "${device}".`,
      roleCustomized: (group) => `${group} customized.`,
      roleCleared: (group) => `${group} no longer assigned.`,
      shortcutAdded: (name) => `Added "${name}".`,
      shortcutRemoved: (name) => `Removed "${name}".`,
      shortcutRenamed: (oldName, newName) => `Renamed "${oldName}" \u2192 "${newName}".`,
      shortcutsReordered: "Reordered shortcuts.",
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
    },
    // Review-list section titles + entry templates for the live *device*
    // editor (activity-diff.ts, diffDeviceForReview).
    deviceReview: {
      sectionPower: "Power",
      sectionNetwork: "Network",
      sectionButtons: "Buttons",
      sectionMacros: "Macros",
      powerControlChanged: (label) => `Automatic power control \u2192 ${label}.`,
      powerOnChanged: "Power-on sequence updated.",
      powerOffChanged: "Power-off sequence updated.",
      macroAdded: (name) => `Added macro "${name}".`,
      macroRemoved: (name) => `Removed macro "${name}".`,
      macroRenamed: (oldName, newName) => `Renamed macro "${oldName}" \u2192 "${newName}".`,
      macroChanged: (name) => `Edited macro "${name}".`,
      bindingBound: (button, command) => `"${button}" now sends "${command}".`,
      bindingCleared: (button) => `"${button}" no longer bound.`,
      ipChanged: (ip) => `IP address \u2192 ${ip}.`,
      ipCleared: "IP address cleared."
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
    deleteMacroTitle: (name) => `Delete macro "${name}"?`,
    deleteCascadeIntro: "Removing this also clears its references elsewhere in the backup:",
    deleteSimpleBody: "This removes it from the loaded backup.",
    deleteImpactActivities: (count) => `${count} ${count === 1 ? "activity references" : "activities reference"} it`,
    deleteImpactFavorites: (count) => `${count} shortcut${count === 1 ? "" : "s"} will be removed`,
    deleteImpactMacroSteps: (count) => `${count} sequence step${count === 1 ? "" : "s"} will be removed`,
    deleteImpactPowerSteps: (count) => `${count} power sequence step${count === 1 ? "" : "s"} will be cleared`,
    deleteReplaceNote: "Deletions reach the hub only with a Replace restore.",
    // Live-edit variants: deletions here act on the hub, not a backup file.
    deleteCascadeIntroLive: "Deleting this also removes its references on the hub:",
    deleteSimpleBodyLive: "This removes it.",
    deleteImmediateNote: "This is applied to the hub immediately.",
    deleteSyncNote: "This change is written to the hub on the next Sync.",
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
    bindingCommand: "Command",
    bindingEnableLongPress: "Enable long-press binding",
    bindingLongPressDevice: "Long-press device",
    bindingLongPressCommand: "Long-press command",
    bindingIncomplete: "Choose a button and target first.",
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
    newMacroName: "Macro",
    shortcutChipCommand: "command",
    shortcutChipAction: "macro",
    shortcutRenameAria: (kind) => kind === "macro" ? "Rename macro" : "Rename shortcut",
    shortcutDeleteAria: (kind) => kind === "macro" ? "Delete macro" : "Delete shortcut",
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
    // Activity-detail copy.
    activityRemoveDeviceTitle: (name) => `Remove ${name} from this activity?`,
    activityRunningTitle: "Buttons on the remote",
    activityRunningSub: "Which device each remote button controls in this activity.",
    activityShortcutsTitle: "Shortcuts on the remote screen",
    activityShortcutsSubSortable: "Commands and macros shown on the remote's screen. Drag the handle to reorder.",
    activityShortcutsSubStatic: "Commands and macros shown on the remote's screen. Use the move buttons to reorder.",
    activityShortcutsEmpty: "No shortcuts yet. Add a command or a macro.",
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
    // Unified "add to shortcuts" flow.
    addShortcutButton: "Add",
    addShortcutTitle: "Add to shortcuts",
    addShortcutKindLabel: "Type",
    shortcutKindCommand: "Device command",
    shortcutKindAction: "Macro",
    macroTargetLabel: "Macro",
    macroTargetCreateNew: "Create new macro",
    macroTargetNoExisting: "No macros yet. Create one below.",
    addShortcutActionName: "Name",
    addShortcutActionHelper: "You'll pick the steps next."
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
    activityInput: "Perform this command when an Activity starts",
    activityInputHint: "The command is set as the Activity's input on the hub, so it runs during the Activity's startup sequence.",
    activityInputReplaces: (slotName, activityName) => `Replaces "${slotName}" when ${activityName} starts`,
    noActivitiesForHub: "No Activities available for this hub.",
    activityInputLabel: "Activity that performs this command",
    devicePowerOnLabel: "When the hub turns this device on",
    devicePowerOffLabel: "When the hub turns this device off",
    devicePowerNothing: "Nothing",
    devicePowerHint: "Runs as part of this device's power sequence in your Activities. Synced to the hub.",
    devicePowerPerform: (commandName) => `perform ${commandName}`,
    hubEventsTitle: "Hub Events",
    hubEventsSubtitle: "Perform a Home Assistant Action when the hub changes state. These run in Home Assistant only and are never synced to the hub.",
    hubEventPowerOff: "When the hub is switched OFF",
    hubEventRedundantOff: "When OFF is pressed while the hub is already OFF",
    hubEventActivityStart: "When an Activity starts",
    hubEventDoNothing: "do nothing",
    hubEventPerform: (service) => `perform ${service}`,
    hubEventClearTitle: "Reset to do nothing",
    hubEventModalNote: "Choose the Action to perform when this happens. Clear the Action to do nothing.",
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

// custom_components/sofabaton_x1s/www/src/tabs/activity-editor.ts
var S3 = TOOLS_CARD_STRINGS.backup;
var OVERLAY_MENU_MAX_HEIGHT = 240;
function overlayMenuPosition(anchor, align) {
  if (!anchor) return "";
  const gap = 4;
  const spaceBelow = window.innerHeight - anchor.bottom;
  const openUp = spaceBelow < OVERLAY_MENU_MAX_HEIGHT + gap && anchor.top > spaceBelow;
  const vertical = openUp ? `bottom: ${Math.round(window.innerHeight - anchor.top + gap)}px; top: auto;` : `top: ${Math.round(anchor.bottom + gap)}px; bottom: auto;`;
  const horizontal = align === "right" ? `right: ${Math.round(window.innerWidth - anchor.right)}px; left: auto;` : `left: ${Math.round(anchor.left)}px; right: auto;`;
  return `position: fixed; ${vertical} ${horizontal}`;
}
function menuAnchorRect(event) {
  const target = event.currentTarget;
  return target instanceof HTMLElement ? target.getBoundingClientRect() : null;
}
function renderDrillInRow(params) {
  return T`
    <div class="quick-access-sortable-item quick-access-footer-item">
      <button class="edit-selection-row edit-selection-row--footer" @click=${params.onOpen}>
        <ha-icon class="footer-row-icon" icon="mdi:tune-variant"></ha-icon>
        <span class="selection-main">
          <span class="selection-label">${params.label}</span>
          ${params.meta ? T`<span class="selection-sub">${params.meta}</span>` : A}
        </span>
        <span class="selection-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
      </button>
    </div>
  `;
}
var ROLE_LABELS = {
  volume: S3.roleVolume,
  navigation: S3.roleNavigation,
  playback: S3.rolePlayback,
  channels: S3.roleChannels
};
var ROLE_ICONS = {
  volume: "mdi:volume-high",
  navigation: "mdi:gamepad-round-outline",
  playback: "mdi:play-pause",
  channels: "mdi:pound"
};
function roleTriggerLabel(role) {
  switch (role.state) {
    case "device":
      return role.deviceName ?? "";
    case "customized":
      return S3.roleCustomized(role.deviceName ?? "");
    case "custom":
      return S3.roleCustom;
    case "unused":
      return S3.roleNotUsed;
  }
}
function renderActivityRolesBlock(params) {
  return T`
    <div class="quick-access-list quick-access-list--overlays">
      <div class="quick-access-sortable-container">
        ${params.roles.map((role) => renderRoleRow(role, params))}
        ${renderDrillInRow(params.customize)}
      </div>
    </div>
  `;
}
function renderRoleRow(role, params) {
  const open = params.openGroup === role.group;
  const partialNote = (role.state === "device" || role.state === "customized") && role.boundCount < role.totalCount ? S3.roleMappedNote(role.boundCount, role.totalCount) : null;
  return T`
    <div class="quick-access-sortable-item">
      <div class="role-row">
        <ha-icon class="role-icon" icon=${ROLE_ICONS[role.group]}></ha-icon>
      <div class="role-main">
        <div class="role-label">${ROLE_LABELS[role.group]}</div>
        ${partialNote ? T`<div class="role-note">${partialNote}</div>` : A}
      </div>
      <span class="member-add role-menu-anchor" data-open=${open ? "true" : "false"}>
        <button
          class="role-trigger"
          type="button"
          data-state=${role.state}
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          aria-label=${S3.roleMenuAria(ROLE_LABELS[role.group])}
          @click=${(event) => params.onToggleMenu(open ? null : role.group, menuAnchorRect(event))}
        >
          <span>${roleTriggerLabel(role)}</span>
          <ha-icon icon="mdi:chevron-down"></ha-icon>
        </button>
        ${open ? T`
              <button
                class="member-add-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${() => params.onToggleMenu(null)}
              ></button>
              <div
                class="member-add-menu role-menu"
                role="listbox"
                aria-label=${ROLE_LABELS[role.group]}
                style=${overlayMenuPosition(params.menuAnchor, "right")}
              >
                <button
                  class="member-add-option"
                  type="button"
                  role="option"
                  aria-selected=${role.state === "unused" ? "true" : "false"}
                  @click=${() => params.onAssign(role.group, null)}
                >${S3.roleNotUsed}</button>
                ${params.optionsFor(role.group).map((option) => T`
                  <button
                    class="member-add-option"
                    type="button"
                    role="option"
                    ?disabled=${option.mappable === 0}
                    aria-selected=${role.deviceId === option.deviceId ? "true" : "false"}
                    @click=${() => params.onAssign(role.group, option.deviceId)}
                  >${option.mappable === 0 ? S3.roleOptionNoMapping(option.label) : option.label}</button>
                `)}
              </div>
            ` : A}
      </span>
      </div>
    </div>
  `;
}
var activityEditorStyles = i`
  .member-add {
    position: relative;
    display: inline-flex;
  }
  .member-add-backdrop {
    position: fixed;
    inset: 0;
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: default;
    z-index: 4;
  }
  .member-add-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 5;
    min-width: 180px;
    max-height: 240px;
    overflow-y: auto;
    background: var(--card-background-color, #fff);
    border: 1px solid var(--divider-color);
    border-radius: var(--backup-radius-md);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    display: flex;
    flex-direction: column;
    padding: 4px;
  }
  .member-add-option {
    border: none;
    background: none;
    text-align: left;
    padding: 8px 10px;
    font-size: 0.9rem;
    color: var(--primary-text-color);
    border-radius: var(--backup-radius-sm);
    cursor: pointer;
  }
  .member-add-option:hover {
    background: var(--secondary-background-color);
  }
  .member-add-empty {
    padding: 8px 10px;
    font-size: 0.85rem;
    color: var(--secondary-text-color);
    line-height: 1.4;
  }
  .role-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
  }
  /* Advanced-mode footer: the last row of a quick-access list that drills
     into the deeper editor for the rows above it. Tinted and separated by
     a solid divider so it reads as attached to — but different from — the
     list items. The extra class in the selector outranks the plain
     sortable-item border rule that follows in the host tab's styles. */
  .quick-access-sortable-item.quick-access-footer-item {
    border-top: 1px solid var(--divider-color);
    background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 55%, transparent);
    border-radius: 0 0 calc(var(--backup-radius-lg) - 1px) calc(var(--backup-radius-lg) - 1px);
    overflow: hidden;
  }
  .edit-selection-row--footer .selection-label {
    color: var(--secondary-text-color);
    font-size: 12.5px;
    font-weight: 600;
  }
  .footer-row-icon {
    flex: 0 0 auto;
    color: var(--secondary-text-color);
    --mdc-icon-size: 16px;
  }
  .role-icon {
    color: var(--secondary-text-color);
    --mdc-icon-size: 18px;
    flex: none;
  }
  .role-main {
    flex: 1;
    min-width: 0;
  }
  .role-label {
    font-size: 0.92rem;
  }
  .role-note {
    font-size: 0.75rem;
    color: var(--secondary-text-color);
  }
  .role-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: 1px solid var(--divider-color);
    border-radius: var(--backup-radius-sm);
    background: var(--card-background-color, #fff);
    color: var(--primary-text-color);
    padding: 5px 8px;
    font-size: 0.85rem;
    cursor: pointer;
    max-width: 190px;
    --mdc-icon-size: 15px;
  }
  .role-trigger > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .role-trigger[data-state="unused"] > span {
    color: var(--secondary-text-color);
  }
  .role-trigger[data-state="custom"] > span,
  .role-trigger[data-state="customized"] > span {
    font-style: italic;
  }
  .role-menu {
    right: 0;
    left: auto;
    min-width: 200px;
  }
  .member-add-option:disabled {
    color: var(--disabled-text-color, var(--secondary-text-color));
    cursor: default;
    opacity: 0.7;
  }
`;

// custom_components/sofabaton_x1s/www/src/tabs/backup-tab-styles.ts
var backupTabStyles = i`
    :host {
      display: flex;
      flex: 1;
      min-width: 0;
      min-height: 0;
      max-width: 100%;
      overflow: hidden;
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
    }
    .backup-body {
      gap: 12px;
    }
    .restore-body {
      gap: 12px;
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
    ha-radio-group.scope-form--md {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
      --ha-radio-option-active-color: var(--primary-color);
      --ha-radio-option-checked-background-color: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    ha-radio-group.scope-form--md ha-radio-option {
      min-width: 0;
    }
    @media (max-width: 380px) {
      ha-radio-group.scope-form--md { grid-template-columns: 1fr; }
    }
    .compat-radio-group {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      width: 100%;
    }
    .compat-radio-option {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .compat-radio-option:hover {
      border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color));
    }
    .compat-radio-option.selected {
      border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
    }
    .compat-radio-option.disabled {
      opacity: 0.58;
      cursor: default;
    }
    .compat-radio-option-label {
      min-width: 0;
      flex: 1 1 auto;
      font-size: 13px;
      font-weight: 600;
      line-height: 1.4;
    }
    @media (max-width: 380px) {
      .compat-radio-group { grid-template-columns: 1fr; }
    }
    .compat-choice {
      width: 18px;
      height: 18px;
      margin: 0;
      flex: 0 0 auto;
      accent-color: var(--primary-color);
    }

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
    .edit-config-view .selection-card {
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
    .edit-config-view .selection-list {
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
    .edit-config-view .selection-group-header {
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 94%, white 6%);
    }
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

    .edit-body { padding-top: 0; padding-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-content: normal; }
    .edit-config-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
    .edit-selection-row {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      cursor: pointer;
    }
    .edit-selection-row:first-child { border-top: none; }
    .edit-selection-row:hover {
      background: color-mix(in srgb, var(--primary-color) 6%, transparent);
    }
    .edit-order-sortable { display: block; }
    .edit-order-sortable-container { display: block; }
    /* Inside a sortable wrapper, ":first-child" of the row would not match
       (the row's parent is the wrapper, not the list). Re-strip the border
       on the first row of each wrapped group so groups still read cleanly. */
    .edit-order-sortable-container .edit-selection-row:first-child { border-top: none; }
    .edit-row-drag {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: var(--secondary-text-color);
      cursor: grab;
      touch-action: none;
      padding: 2px;
      margin-left: -4px;
    }
    .edit-row-drag:active { cursor: grabbing; }
    .edit-row-drag ha-icon { --mdc-icon-size: 18px; }
    .selection-chevron {
      color: var(--secondary-text-color);
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .selection-chevron ha-icon { --mdc-icon-size: 18px; }

    /* ── Automatic-power dropdown (device Power section) ─────────────── */
    /* Genuine overlay popup: the menu is absolutely positioned so opening
       it never reflows the sequence rows below. A transparent fixed
       backdrop catches click-away. */
    /* The control is its own field, a sibling of (not inside) the
       sequence list, so the list's overflow:hidden can't clip the popup. */
    .power-control {
      position: relative;
      display: block;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
    }
    .power-control-trigger {
      width: 100%;
      border: none;
      border-radius: inherit;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      cursor: pointer;
    }
    .power-control-trigger:hover {
      background: color-mix(in srgb, var(--primary-color) 6%, transparent);
    }
    .power-control-trigger .selection-chevron ha-icon { transition: transform 120ms ease; }
    .power-control[data-open="true"] .power-control-trigger .selection-chevron ha-icon {
      transform: rotate(180deg);
    }
    .power-control-backdrop {
      position: fixed;
      inset: 0;
      z-index: 30;
      border: none;
      background: transparent;
      padding: 0;
      cursor: default;
    }
    .power-control-menu {
      position: absolute;
      top: calc(100% + 4px);
      left: 0;
      right: 0;
      z-index: 31;
      display: flex;
      flex-direction: column;
      background: var(--card-background-color, var(--ha-card-background, var(--secondary-background-color, #fff)));
      border: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      border-radius: 10px;
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.22);
      overflow: hidden;
    }
    .power-control-option {
      width: 100%;
      border: none;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: left;
      display: flex;
      gap: 12px;
      align-items: center;
      padding: 10px 14px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 50%, transparent);
      cursor: pointer;
    }
    .power-control-option:first-child { border-top: none; }
    .power-control-option:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
    }
    .power-control-option[aria-checked="true"] .selection-label { color: var(--primary-color); }
    .power-control-option .selection-chevron ha-icon { color: var(--primary-color); }

    /* Power-on/off sequence rows, dimmed + inert when power control is off */
    .power-sequences[data-disabled="true"] { opacity: 0.45; pointer-events: none; }
    .power-sequences-note {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
      padding: 8px 14px 0;
    }
    .tab-panel--detail { min-width: 0; padding: 0; }
    .detail-view {
      min-width: 0;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
      overflow: hidden;
    }
    .sticky-header {
      position: sticky;
      z-index: 2;
      min-width: 0;
      background: var(--ha-card-background, var(--card-background-color));
    }
    .sticky-header { top: 0; }
    .detail-scroll {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }
    .detail-title-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      min-width: 0;
      padding: 12px 16px;
      border-bottom: 1px solid var(--divider-color);
    }
    .detail-title-main {
      display: flex;
      align-items: center;
      gap: 10px;
      min-width: 0;
      flex: 1;
      overflow: hidden;
    }
    .detail-title-stack {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1 1 0;
      overflow: hidden;
    }
    .detail-crumbs {
      display: flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      max-width: 100%;
      overflow: hidden;
      white-space: nowrap;
      font-size: 11px;
      line-height: 1.1;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .detail-crumb {
      flex: 0 1 auto;
      min-width: 0;
      border: none;
      background: transparent;
      padding: 0;
      font: inherit;
      color: var(--secondary-text-color);
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: color 120ms ease;
    }
    .detail-crumb:hover {
      color: var(--primary-color);
      text-decoration: underline;
    }
    .detail-crumb-sep {
      flex: 0 0 auto;
      color: color-mix(in srgb, var(--secondary-text-color) 55%, transparent);
    }
    .detail-title-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .detail-title {
      display: block;
      width: 100%;
      max-width: 100%;
      font-size: 18px;
      font-weight: 700;
      line-height: 1.15;
      color: var(--primary-text-color);
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .detail-section-nav {
      display: flex;
      align-items: stretch;
      min-height: 34px;
      margin: 10px 16px;
      border: 1px solid color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      overflow: hidden;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 76%, transparent);
    }
    .detail-section-nav-btn {
      flex: 1 1 0;
      min-width: 0;
      min-height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 10px;
      border: none;
      border-right: 1px solid color-mix(in srgb, var(--divider-color) 82%, transparent);
      background: transparent;
      color: color-mix(in srgb, var(--secondary-text-color) 88%, var(--primary-text-color) 12%);
      font: inherit;
      cursor: pointer;
      white-space: nowrap;
    }
    .detail-section-nav-btn:last-child {
      border-right: none;
    }
    .detail-section-nav-btn:hover {
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      color: var(--primary-text-color);
    }
    .detail-section-nav-btn.active {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      box-shadow: inset 0 -2px 0 var(--primary-color);
    }
    .detail-section-nav-btn ha-icon {
      --mdc-icon-size: 16px;
      flex: 0 0 auto;
    }
    .detail-section-nav-label {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    @media (max-width: 640px) {
      .detail-section-nav-btn { gap: 0; }
      .detail-section-nav-btn ha-icon { display: none; }
    }
    /* Match the Wifi Commands tab's detail-view back button so the
       affordance is identical across the card: padded pill with a
       bold label-weight, content-sized (not a fixed square). */
    .back-btn {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    .back-btn:hover {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .edit-detail-card {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      padding: 14px;
      background: var(--ha-card-background, var(--card-background-color));
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .edit-detail-copy {
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
    }
    .edit-field-group {
      display: grid;
      gap: 8px;
    }
    .edit-field-label {
      color: var(--secondary-text-color);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .edit-field-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .edit-row-input {
      flex: 1 1 auto;
      width: 100%;
      min-width: 0;
      max-width: 100%;
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      background: var(--ha-card-background, var(--card-background-color));
      border: 1px solid color-mix(in srgb, var(--primary-color) 65%, var(--divider-color));
      border-radius: var(--backup-radius-sm);
      padding: 4px 10px;
      outline: none;
    }
    .edit-row-input:focus { border-color: var(--primary-color); }
    .edit-support-card {
      border: 1px dashed color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      padding: 12px 14px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .icon-btn, .dialog-close {
      flex: 0 0 auto;
      width: 34px;
      height: 34px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: border-color 120ms ease, background-color 120ms ease, transform 80ms ease, color 120ms ease;
    }
    .icon-btn:hover:not(:disabled),
    .dialog-close:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
    }
    .icon-btn:active,
    .dialog-close:active { transform: translateY(1px); }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 16px; }
    /* Destructive variant of .icon-btn — used for the inline delete
       (trash) action next to the rename pencil on rows and detail
       headers. Resting state stays neutral so the row doesn't read as
       alarming; the danger tone only appears on hover / focus. */
    .icon-btn--danger:hover:not(:disabled) {
      border-color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 10%, var(--ha-card-background, var(--card-background-color)));
      color: var(--error-color, #db4437);
    }
    .quick-access-head-main {
      min-width: 0;
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .quick-access-add-btn {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 12px;
      border-radius: var(--backup-radius-md);
      border: 1px solid color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      color: var(--primary-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: border-color 120ms ease, background 120ms ease;
    }
    .quick-access-add-btn:hover {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
    }
    .quick-access-add-btn ha-icon { --mdc-icon-size: 16px; }
    .quick-access-head-actions {
      display: inline-flex;
      gap: 8px;
      flex: 0 0 auto;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .power-device-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }
    .power-device-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .power-device-controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .power-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 0;
      flex: 1 1 160px;
    }
    .power-field--delay { flex: 0 1 120px; }
    .power-field-label {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .power-device-controls .decoded-field-input { font-size: 13px; }
    .quick-access-section {
      display: grid;
      gap: 12px;
      scroll-margin-top: 16px;
    }
    .quick-access-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
    }
    .quick-access-title {
      color: var(--primary-text-color);
      font-size: 14px;
      font-weight: 700;
    }
    .quick-access-sub {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.45;
    }
    .quick-access-list {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-lg);
      background: var(--ha-card-background, var(--card-background-color));
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    /* Lists whose rows open absolutely-positioned overlay menus (role
       pickers, idle-behavior pickers). overflow:hidden would clip the
       popups at the list edge, so these opt into visible overflow; the
       footer row carries its own corner radius instead. */
    .quick-access-list--overlays {
      overflow: visible;
    }
    .quick-access-sortable {
      display: block;
    }
    .quick-access-sortable-container {
      display: block;
    }
    .quick-access-sortable-item {
      display: block;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      user-select: none;
      -webkit-user-select: none;
    }
    .quick-access-sortable-item:first-child {
      border-top: none;
    }
    .quick-access-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 12px 14px;
    }
    /* Variant for rows that don't carry a drag handle (e.g. Device commands,
       which have no concept of ordering). Drop the leading column so the
       label sits flush with the row padding. */
    .quick-access-row--no-drag {
      grid-template-columns: minmax(0, 1fr) auto;
    }
    .quick-access-main {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .quick-access-label-row {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .quick-access-label {
      min-width: 0;
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 700;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .quick-access-chip {
      flex: 0 0 auto;
      border-radius: var(--backup-radius-pill);
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      border: 1px solid var(--divider-color);
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 74%, transparent);
    }
    .quick-access-meta {
      color: var(--secondary-text-color);
      font-size: 12px;
      line-height: 1.4;
    }
    .quick-access-actions {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      flex: 0 0 auto;
    }
    /* Inline per-row wait control: the delay that trails this command.
       The "Delay" caption stacks above the number inside the same bordered
       pill so the label and field read as one piece. The caption is tiny
       and the pill stays shorter than the row, so it adds no row height. */
    .step-wait {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      flex: 0 0 auto;
      padding: 2px 6px 3px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 60%, transparent);
      cursor: text;
    }
    .step-wait:focus-within {
      border-color: var(--primary-color);
    }
    .step-wait-caption {
      font-size: 9px;
      line-height: 1;
      font-weight: 600;
      letter-spacing: 0.4px;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      pointer-events: none;
    }
    .step-wait-field {
      display: inline-flex;
      align-items: baseline;
      gap: 3px;
    }
    .step-wait-input {
      width: 42px;
      min-width: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      text-align: right;
      outline: none;
      -moz-appearance: textfield;
    }
    .step-wait-input::-webkit-outer-spin-button,
    .step-wait-input::-webkit-inner-spin-button {
      -webkit-appearance: none;
      margin: 0;
    }
    .step-wait-unit {
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
    }
    .quick-access-drag {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
    }
    .quick-access-drag:active {
      cursor: grabbing;
    }
    .quick-access-empty {
      border: 1px dashed color-mix(in srgb, var(--divider-color) 88%, transparent);
      border-radius: var(--backup-radius-md);
      padding: 12px 14px;
      color: var(--secondary-text-color);
      font-size: 13px;
      line-height: 1.5;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .dialog-btn {
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 8px 12px;
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .dialog-btn:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
    }
    .dialog-btn-primary {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    }
    .dialog-btn-danger {
      border-color: var(--error-color, #db4437);
      color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent);
    }
    .dialog-btn-danger:hover:not(:disabled) {
      background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent);
    }
    .dialog-btn:disabled { opacity: 0.45; cursor: default; }
    .delete-impact-list {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .delete-impact-list li {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 13px;
      color: var(--primary-text-color);
    }
    .delete-impact-list ha-icon {
      --mdc-icon-size: 18px;
      color: var(--secondary-text-color);
      flex: 0 0 auto;
    }
    .delete-replace-note {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.45;
    }
    .delete-replace-note ha-icon { --mdc-icon-size: 16px; flex: 0 0 auto; }
    select.decoded-field-input { cursor: pointer; }
    .binding-toggle-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .binding-static-field {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
      padding: 8px 10px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 54%, transparent);
    }
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: var(--backup-radius-lg); border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
    .dialog.small { width: min(500px, calc(100vw - 36px)); }
    .dialog.medium { width: min(640px, calc(100vw - 36px)); }
    /* Reminder banner inside the Edit Payload dialog nudging the user
       toward Test before overwriting a working command. */
    .payload-test-note {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 12px;
      padding: 10px 12px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--warning-color, #ffa726) 45%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #ffa726) 10%, transparent);
      color: var(--primary-text-color);
      font-size: 12.5px;
      line-height: 1.45;
    }
    .payload-test-note ha-icon {
      --mdc-icon-size: 18px;
      color: var(--warning-color, #ffa726);
      flex: none;
      margin-top: 1px;
    }
    /* "Advanced" foldout that wraps the structured-payload form
       inside the Change Command dialog. Mirrors the Wifi Commands
       command-config popup so the affordance reads the same way
       across the card. */
    .advanced-section {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 6px;
      padding-top: 10px;
      border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
    }
    .advanced-toggle {
      width: fit-content;
      border: 0;
      background: transparent;
      color: var(--secondary-text-color);
      padding: 0;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      text-align: left;
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.02em;
      cursor: pointer;
    }
    .advanced-toggle:hover { color: var(--primary-text-color); }
    .advanced-toggle-copy { display: block; }
    .advanced-toggle ha-icon { --mdc-icon-size: 18px; transition: transform 120ms ease; }
    .advanced-toggle.expanded ha-icon { transform: rotate(180deg); }
    .advanced-panel { display: grid; gap: 14px; padding-top: 2px; }
    .decoded-form {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .decoded-form-head { display: flex; flex-direction: column; gap: 2px; }
    .decoded-form-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--primary-text-color);
    }
    .decoded-form-sub {
      font-size: 12px;
      color: var(--secondary-text-color);
      line-height: 1.4;
    }
    .decoded-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .decoded-field-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--secondary-text-color);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .decoded-field-input {
      width: 100%;
      box-sizing: border-box;
      font: inherit;
      font-size: 13px;
      color: var(--primary-text-color);
      background: var(--ha-color-form-background, var(--secondary-background-color));
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-sm);
      padding: 8px 10px;
    }
    .decoded-field-input:focus {
      outline: none;
      border-color: var(--primary-color);
    }
    .decoded-field-input--multiline {
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      resize: vertical;
      min-height: 60px;
      /* Wrap long content (e.g. a raw hex payload) inside the textarea
         instead of running off as one long line; newlines are preserved. */
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    /* Escaped wire-string fields are conceptually one long string with
       visible \\n escapes. Wrap on the textarea edge rather than
       overflowing horizontally, and break long URL-like tokens so the
       string never runs off the right side. */
    .decoded-field-input--escaped {
      white-space: pre-wrap;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .decoded-field-helper {
      font-size: 11px;
      color: var(--secondary-text-color);
      line-height: 1.35;
    }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; flex: 1; color: var(--primary-text-color); }
    .dialog-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      overflow-y: auto;
      --ha-color-form-background: var(
        --input-fill-color,
        var(
          --secondary-background-color,
          color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black)
        )
      );
      --ha-color-form-background-hover: var(--ha-color-form-background);
    }
    .dialog-body ha-input,
    .dialog-body ha-textfield {
      width: 100%;
    }
    .dialog-body ha-input {
      --ha-input-padding-top: 0;
      --ha-input-padding-bottom: 0;
    }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .dialog-footer-note { min-height: 18px; font-size: 13px; color: var(--error-color, #db4437); }

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

    .backup-downloaded-note,
    .backup-expired-note {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-top: 10px;
      font-size: 12px;
      font-weight: 600;
    }
    .backup-downloaded-note {
      color: var(--success-color, #43a047);
    }
    .backup-expired-note {
      color: var(--warning-color, #ff9800);
    }
    .backup-downloaded-note ha-icon,
    .backup-expired-note ha-icon {
      --mdc-icon-size: 16px;
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
      align-items: center;
      gap: 10px;
      flex-wrap: nowrap;
      min-width: 0;
    }
    .restore-action-row .primary-btn { flex: 0 0 auto; }
    .filename-btn {
      flex: 1 1 0;
      min-width: 0;
      max-width: 100%;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    input[type="file"] { display: none; }

    /* Compact hub-name row on the Edit overview. Hub name is only
       applied at restore time when the user chooses to wipe the hub,
       so it earns a single thin row instead of its own card. */
    .edit-hub-name-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 10px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent);
      background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 96%, black);
      font-size: 13px;
      min-width: 0;
    }
    .edit-hub-name-label {
      flex: 0 0 auto;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--secondary-text-color);
    }
    .edit-hub-name-value {
      flex: 1 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--primary-text-color);
    }
    .edit-hub-name-row .icon-btn {
      flex: 0 0 auto;
      padding: 2px;
    }
    .edit-hub-name-row .icon-btn ha-icon { --mdc-icon-size: 18px; }

    /* Unsaved-changes indicators.
       .edit-unsaved-chip is the compact pill used in the detail
       sticky-header next to the title. .edit-unsaved-banner is the
       wider notice on the overview page above the action row.
       .primary-btn--unsaved decorates the Download button with a
       dot when there are pending edits. */
    .edit-unsaved-chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 0 auto;
      padding: 2px 8px 2px 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      border-radius: 999px;
      color: var(--warning-color, #f59e0b);
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 16%, transparent);
      border: 1px solid color-mix(in srgb, var(--warning-color, #f59e0b) 35%, transparent);
    }
    .edit-unsaved-chip::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--warning-color, #f59e0b);
    }
    .edit-unsaved-banner {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: var(--backup-radius-sm);
      border: 1px solid color-mix(in srgb, var(--warning-color, #f59e0b) 35%, transparent);
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 10%, transparent);
      color: var(--primary-text-color);
      font-size: 13px;
      line-height: 1.4;
    }
    .edit-unsaved-banner ha-icon {
      --mdc-icon-size: 18px;
      color: var(--warning-color, #f59e0b);
      flex: 0 0 auto;
    }
    .primary-btn--unsaved::after {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-left: 8px;
      border-radius: 50%;
      background: var(--warning-color, #f59e0b);
      vertical-align: middle;
    }

    @media (max-width: 380px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
      .quick-access-row {
        grid-template-columns: auto minmax(0, 1fr) auto;
      }
      .quick-access-actions {
        justify-content: flex-end;
      }
      .edit-field-row,
      .restore-action-row {
        align-items: stretch;
        flex-direction: column;
      }
      .detail-title-actions {
        gap: 6px;
        min-width: max-content;
      }
      .detail-section-nav {
        overflow-x: auto;
        scrollbar-width: none;
      }
      .detail-section-nav::-webkit-scrollbar {
        display: none;
      }
      .detail-section-nav-btn {
        flex-basis: auto;
        min-width: max-content;
        padding-inline: 12px;
      }
      .restore-action-row > .primary-btn,
      .restore-action-row > .secondary-btn {
        width: 100%;
      }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small {
        width: min(100vw, 100%);
        max-height: calc(100vh - max(env(safe-area-inset-top), 8px));
        border-radius: var(--backup-radius-xl) var(--backup-radius-xl) 0 0;
      }
      .dialog-footer {
        flex-direction: column;
        align-items: stretch;
      }
      .dialog-footer-actions {
        width: 100%;
      }
      .dialog-footer-actions .dialog-btn {
        flex: 1 1 0;
      }
      .dialog-footer-note {
        min-height: 0;
      }
    }
`;

// custom_components/sofabaton_x1s/www/src/tabs/backup-state.ts
var DECODED_CLASS_FORM_SPECS = {
  wifi_ip: {
    title: "HTTP request",
    subtitle: "Edits replay through the hub's wifi_ip writer. Host, port, and Content-Length are derived; you do not set them here.",
    fields: [
      { key: "host", label: "Host (IPv4)", helper: "e.g. 192.168.2.77" },
      { key: "port", label: "Port", numeric: true },
      { key: "method", label: "HTTP method", helper: "e.g. GET, POST" },
      { key: "path", label: "Path" },
      {
        key: "header",
        label: "Extra headers",
        multiline: true,
        crlfOnWire: true,
        helper: "One header per line. Host and Content-Length are added automatically."
      },
      { key: "content_type", label: "Content type" },
      { key: "body", label: "Body", multiline: true }
    ]
  },
  wifi_roku: {
    title: "Roku ECP request",
    fields: [
      { key: "path", label: "ECP URL path", helper: "e.g. /launch/12 or /keypress/Home" }
    ]
  },
  wifi_hue: {
    title: "Hue REST request",
    subtitle: "Body block is injected verbatim between Host headers and the network write.",
    fields: [
      { key: "path", label: "URL path" },
      {
        key: "body_block",
        label: "Body block (raw wire string)",
        multiline: true,
        escapedDisplay: true,
        helper: "Single literal string sent to the device. Newlines are shown as \\n. You own the Content-Length value \u2014 it must match the body byte count."
      }
    ]
  },
  wifi_sonos: {
    title: "Sonos UPnP request",
    subtitle: "Body block is injected verbatim between Host headers and the network write.",
    fields: [
      { key: "path", label: "URL path" },
      {
        key: "body_block",
        label: "Body block (raw wire string)",
        multiline: true,
        escapedDisplay: true,
        helper: "Single literal string sent to the device. Newlines are shown as \\n. You own the Content-Length value \u2014 it must match the body byte count."
      }
    ]
  },
  ir: {
    title: "Descriptive IR payload",
    subtitle: "Edits replay through the hub's descriptive-IR writer. Only descriptive-protocol payloads (P:\u2026 D:\u2026 F:\u2026) are decodable; raw learned-IR payloads are not editable here.",
    fields: [
      {
        key: "descriptor",
        label: "Descriptor",
        helper: "e.g. P:Sony12 R:40000 D:1 F:18 MUL:2"
      }
    ]
  }
};
function normalizeDecodableClass(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized in DECODED_CLASS_FORM_SPECS) {
    return normalized;
  }
  return null;
}
function commandDecodedBlock(bundle, deviceId, commandId) {
  if (!bundle) return null;
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId
  );
  if (!device) return null;
  const command = (device.commands ?? []).find(
    (entry) => Number(entry?.command_id || 0) === normalizedCommandId
  );
  if (!command) return null;
  const restoreData = command.restore_data;
  if (!restoreData || typeof restoreData !== "object") return null;
  const decoded = restoreData.decoded;
  if (!decoded || typeof decoded !== "object") return null;
  const decodedRecord = decoded;
  const className = normalizeDecodableClass(decodedRecord.class);
  if (!className) return null;
  const fields = decodedRecord.fields;
  if (!fields || typeof fields !== "object") return null;
  return {
    className,
    fields: { ...fields },
    trailerHex: String(decodedRecord.trailer_hex ?? ""),
    edited: Boolean(decodedRecord.edited)
  };
}
function updateCommandDecodedFields(bundle, deviceId, commandId, newFields) {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          const restoreData = command.restore_data;
          if (!restoreData || typeof restoreData !== "object") return command;
          const decoded = restoreData.decoded;
          if (!decoded || typeof decoded !== "object") return command;
          const decodedRecord = decoded;
          const existingFields = decodedRecord.fields ?? {};
          return {
            ...command,
            restore_data: {
              ...restoreData,
              decoded: {
                ...decodedRecord,
                fields: { ...existingFields, ...newFields },
                edited: true
              }
            }
          };
        })
      };
    })
  };
}
function commandRawPayloadHex(bundle, deviceId, commandId) {
  if (!bundle) return null;
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(deviceId)
  );
  if (!device) return null;
  const command = (device.commands ?? []).find(
    (entry) => Number(entry?.command_id || 0) === Number(commandId)
  );
  if (!command) return null;
  const restoreData = command.restore_data;
  if (!restoreData || typeof restoreData !== "object") return null;
  const dataHex = String(restoreData.data_hex ?? "").trim();
  return dataHex || null;
}
function normalizeCommandPayloadHex(raw) {
  const cleaned = String(raw ?? "").replace(/0x/gi, "").replace(/[\s,]+/g, "");
  if (!cleaned || cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    return null;
  }
  return (cleaned.toLowerCase().match(/.{2}/g) ?? []).join(" ");
}
function updateCommandRawPayload(bundle, deviceId, commandId, dataHex) {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          const restoreData = command.restore_data;
          if (!restoreData || typeof restoreData !== "object") return command;
          const { decoded: _stale, ...rest } = restoreData;
          return {
            ...command,
            restore_data: { ...rest, data_hex: dataHex }
          };
        })
      };
    })
  };
}
function setCommandRestoreData(bundle, deviceId, commandId, restoreData) {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          return { ...command, restore_data: restoreData };
        })
      };
    })
  };
}
var INTERNAL_POWER_MACRO_BUTTON_IDS = /* @__PURE__ */ new Set([198, 199]);
function compareByHubOrder(left, right) {
  return left.sortKey - right.sortKey || left.id - right.id;
}
function readSortKey(block) {
  const value = Number(block?.sort);
  return Number.isFinite(value) ? value : 0;
}
function bundleActivityOptions(bundle) {
  return [...bundle?.activities ?? []].map((activity) => {
    const block = activity?.device;
    const id = Number(block?.device_id || 0);
    return {
      id,
      sortKey: readSortKey(block),
      label: String(block?.name || `Activity ${id}`),
      meta: `${(activity?.referenced_source_device_ids ?? []).length} linked devices`
    };
  }).filter((option) => option.id > 0).sort(compareByHubOrder).map(({ id, label, meta }) => ({ id, label, meta }));
}
function bundleDeviceOptions(bundle) {
  return [...bundle?.devices ?? []].map((device) => {
    const block = device?.device;
    const id = Number(block?.device_id || 0);
    return {
      id,
      sortKey: readSortKey(block),
      label: String(block?.name || `Device ${id}`),
      meta: String(block?.device_class || "").trim() || void 0
    };
  }).filter((option) => option.id > 0).sort(compareByHubOrder).map(({ id, label, meta }) => ({ id, label, meta }));
}
function normalizeHubVersion(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes("X1S")) return "X1S";
  if (normalized.includes("X2")) return "X2";
  if (normalized.includes("X1")) return "X1";
  return null;
}
function renameBundleHub(bundle, name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return bundle;
  return {
    ...bundle,
    hub: { ...bundle.hub ?? {}, name: trimmed }
  };
}
function renameInList(list, id, name) {
  const trimmed = String(name ?? "").trim();
  return (list ?? []).map((entry) => {
    const block = entry?.device;
    if (!block || Number(block.device_id || 0) !== id) return entry;
    return { ...entry, device: { ...block, name: trimmed || block.name || `Device ${id}` } };
  });
}
function renameBundleActivity(bundle, activityId, name) {
  return { ...bundle, activities: renameInList(bundle.activities, Number(activityId), name) };
}
function renameBundleDevice(bundle, deviceId, name) {
  return { ...bundle, devices: renameInList(bundle.devices, Number(deviceId), name) };
}
function updateActivity(bundle, activityId, updater) {
  const normalizedId = Number(activityId);
  return {
    ...bundle,
    activities: (bundle.activities ?? []).map((activity) => {
      if (Number(activity?.device?.device_id || 0) !== normalizedId) return activity;
      return updater(activity);
    })
  };
}
function updateDeviceCommandLabel(bundle, deviceId, commandId, name) {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const trimmed = String(name ?? "").trim();
  const next = {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).map((command) => {
          if (Number(command?.command_id || 0) !== normalizedCommandId) return command;
          return { ...command, name: trimmed };
        })
      };
    })
  };
  return next;
}
function commandLabelFor(bundle, deviceId, commandId) {
  const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  const command = (device?.commands ?? []).find((entry) => Number(entry?.command_id || 0) === Number(commandId));
  return String(command?.name || "").trim();
}
function favoriteLabel(bundle, row) {
  const explicit = String(row?.name || "").trim();
  if (explicit) return explicit;
  const deviceId = Number(row?.device_id || 0);
  const commandId = Number(row?.command_id || 0);
  const derived = commandLabelFor(bundle, deviceId, commandId);
  if (derived) return derived;
  return `Favorite ${Number(row?.button_id || 0) || "?"}`;
}
function sortByButtonId(rows) {
  return [...rows ?? []].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}
function isEditableActivityMacro(row) {
  const buttonId = Number(row?.button_id || 0);
  const normalizedName = String(row?.name || "").trim().toUpperCase();
  if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(buttonId)) return false;
  if (normalizedName === "POWER_ON" || normalizedName === "POWER_OFF") return false;
  return true;
}
function activityQuickAccessItems(bundle, activityId) {
  if (!bundle) return [];
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const items = [];
  for (const row of sortByButtonId(activity.macros).filter(isEditableActivityMacro)) {
    const buttonId = Number(row?.button_id || 0);
    if (buttonId <= 0) continue;
    items.push({
      kind: "macro",
      activityId: Number(activityId),
      buttonId,
      label: String(row?.name || `Macro ${buttonId}`)
    });
  }
  for (const row of sortByButtonId(activity.favorite_slots)) {
    const buttonId = Number(row?.button_id || 0);
    if (buttonId <= 0) continue;
    items.push({
      kind: "favorite",
      activityId: Number(activityId),
      buttonId,
      label: favoriteLabel(bundle, row),
      deviceId: Number(row?.device_id || 0) || void 0,
      commandId: Number(row?.command_id || 0) || void 0
    });
  }
  const order = activity.favorites_order ?? [];
  const rankById = /* @__PURE__ */ new Map();
  order.forEach((favId, index) => {
    const bid = Number(favId) & 255;
    if (!rankById.has(bid)) rankById.set(bid, index);
  });
  const rankOf = (buttonId) => {
    const bid = Number(buttonId) & 255;
    return rankById.has(bid) ? rankById.get(bid) : rankById.size + bid;
  };
  return items.sort((left, right) => {
    const delta = rankOf(left.buttonId) - rankOf(right.buttonId);
    return delta !== 0 ? delta : left.buttonId - right.buttonId;
  });
}
function renameBundleActivityMacro(bundle, activityId, buttonId, name) {
  const normalizedButtonId = Number(buttonId);
  const trimmed = String(name ?? "").trim();
  return updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    macros: (activity.macros ?? []).map((row) => Number(row?.button_id || 0) === normalizedButtonId ? { ...row, name: trimmed } : row)
  }));
}
function renameBundleActivityFavorite(bundle, activityId, buttonId, name) {
  const normalizedButtonId = Number(buttonId);
  const trimmed = String(name ?? "").trim();
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const row = (activity?.favorite_slots ?? []).find((entry) => Number(entry?.button_id || 0) === normalizedButtonId);
  const deviceId = Number(row?.device_id || 0);
  const commandId = Number(row?.command_id || 0);
  let nextBundle = bundle;
  if (deviceId > 0 && commandId > 0) {
    nextBundle = updateDeviceCommandLabel(nextBundle, deviceId, commandId, trimmed);
  }
  return updateActivity(nextBundle, activityId, (current) => ({
    ...current,
    favorite_slots: (current.favorite_slots ?? []).map((entry) => Number(entry?.button_id || 0) === normalizedButtonId ? { ...entry, name: trimmed } : entry)
  }));
}
function deviceCommandItems(bundle, deviceId) {
  if (!bundle) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId
  );
  if (!device) return [];
  const items = [];
  for (const row of device.commands ?? []) {
    const commandId = Number(row?.command_id || 0);
    if (commandId <= 0) continue;
    const label = String(row?.name || "").trim() || `Command ${commandId}`;
    items.push({ deviceId: normalizedDeviceId, commandId, label });
  }
  return items.sort((left, right) => left.commandId - right.commandId);
}
function bundleDeviceClass(bundle, deviceId) {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId
  );
  if (!device) return null;
  return String(device.device?.device_class ?? "").trim().toLowerCase() || null;
}
function deviceIpAddress(bundle, deviceId) {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId
  );
  if (!device?.device) return null;
  const raw = String(device.device.ip_address ?? "").trim();
  return raw || null;
}
function updateBundleDeviceIp(bundle, deviceId, ip) {
  const normalizedId = Number(deviceId);
  const trimmed = String(ip ?? "").trim();
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedId) return device;
      if (!device.device) return device;
      return {
        ...device,
        device: { ...device.device, ip_address: trimmed || null }
      };
    })
  };
}
var IDLE_BEHAVIOR_AUTO_OFF = 1;
var IDLE_BEHAVIOR_ALWAYS_ON = 2;
var IDLE_BEHAVIOR_STAY_ON = 3;
var IDLE_BEHAVIOR_DISABLED = 4;
function deviceIdleBehavior(bundle, deviceId) {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId
  );
  if (!device?.device) return null;
  const raw = device.device.idle_behavior ?? device.device.power_mode;
  if (raw == null) return null;
  const mode = Number(raw);
  return Number.isFinite(mode) ? mode & 255 : null;
}
function updateBundleDeviceIdleBehavior(bundle, deviceId, mode) {
  const normalizedId = Number(deviceId);
  const normalizedMode = Number(mode) & 255;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedId) return device;
      if (!device.device) return device;
      return {
        ...device,
        device: { ...device.device, idle_behavior: normalizedMode }
      };
    })
  };
}
function renameBundleDeviceCommand(bundle, deviceId, commandId, name) {
  return updateDeviceCommandLabel(bundle, Number(deviceId), Number(commandId), String(name ?? "").trim());
}
function nextFreeDeviceCommandId(bundle, deviceId) {
  if (!bundle) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId
  );
  if (!device) return null;
  const used = new Set(
    (device.commands ?? []).map((command) => Number(command?.command_id || 0))
  );
  for (let candidate = 1; candidate <= 255; candidate += 1) {
    if (!used.has(candidate)) return candidate;
  }
  return null;
}
function addBundleDeviceCommand(bundle, deviceId, commandId, name, restoreData) {
  const normalizedDeviceId = Number(deviceId);
  const normalizedCommandId = Number(commandId);
  const trimmed = String(name ?? "").trim();
  if (normalizedCommandId < 1 || normalizedCommandId > 255) return bundle;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      const commands = device.commands ?? [];
      const taken = commands.some(
        (command) => Number(command?.command_id || 0) === normalizedCommandId
      );
      if (taken) return device;
      return {
        ...device,
        commands: [
          ...commands,
          {
            command_id: normalizedCommandId,
            name: trimmed || `Command ${normalizedCommandId}`,
            restore_data: { ...restoreData, new: true }
          }
        ]
      };
    })
  };
}
function reorderBundleActivityQuickAccess(bundle, activityId, orderedItems) {
  const normalizedActivityId = Number(activityId);
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedActivityId);
  if (!activity) return bundle;
  const macrosByButtonId = /* @__PURE__ */ new Map();
  for (const row of activity.macros ?? []) {
    macrosByButtonId.set(Number(row?.button_id || 0), row);
  }
  const favoritesByButtonId = /* @__PURE__ */ new Map();
  for (const row of activity.favorite_slots ?? []) {
    favoritesByButtonId.set(Number(row?.button_id || 0), row);
  }
  const orderedMacroButtonIds = new Set(
    orderedItems.filter((item) => item.kind === "macro").map((item) => Number(item.buttonId))
  );
  const macroRows = [];
  const favoriteRows = [];
  const macroIdRemap = /* @__PURE__ */ new Map();
  orderedItems.forEach((item, index) => {
    const nextButtonId = index + 1;
    if (item.kind === "macro") {
      const row2 = macrosByButtonId.get(Number(item.buttonId));
      if (row2) {
        macroRows.push({ ...row2, button_id: nextButtonId });
        if (Number(item.buttonId) !== nextButtonId) {
          macroIdRemap.set(Number(item.buttonId), nextButtonId);
        }
      }
      return;
    }
    const row = favoritesByButtonId.get(Number(item.buttonId));
    if (row) favoriteRows.push({ ...row, button_id: nextButtonId });
  });
  for (const row of activity.macros ?? []) {
    if (!orderedMacroButtonIds.has(Number(row?.button_id || 0))) {
      macroRows.push(row);
    }
  }
  return updateActivity(bundle, normalizedActivityId, (current) => ({
    ...current,
    macros: macroRows,
    favorite_slots: favoriteRows,
    // Keep favorites_order in step with the new positional button_ids. The
    // reordered items are renumbered 1..N in display order, so the slot table
    // is exactly [1..N]; leaving the stale baseline order here would make
    // activityQuickAccessItems (and the sync planner) re-derive the OLD order.
    favorites_order: orderedItems.map((_item, index) => index + 1),
    // Macro-target bindings reference a macro by its button_id (with
    // device_id = the activity's own id). Renumbering the macros without
    // following those references would leave the bundle internally
    // inconsistent — a later reorder, or the sync planner, would resolve
    // them against the wrong macro.
    button_bindings: remapMacroTargetBindings(
      current.button_bindings,
      normalizedActivityId,
      macroIdRemap
    )
  }));
}
function remapMacroTargetBindings(bindings, activityId, macroIdRemap) {
  if (!bindings || macroIdRemap.size === 0) return bindings;
  let changed = false;
  const next = bindings.map((row) => {
    let updated = row;
    if (Number(row?.device_id || 0) === activityId && macroIdRemap.has(Number(row?.command_id || 0))) {
      updated = { ...updated, command_id: macroIdRemap.get(Number(row?.command_id || 0)) };
      changed = true;
    }
    if (Number(updated?.long_press_device_id || 0) === activityId && macroIdRemap.has(Number(updated?.long_press_command_id || 0))) {
      updated = {
        ...updated === row ? { ...row } : updated,
        long_press_command_id: macroIdRemap.get(Number(updated?.long_press_command_id || 0))
      };
      changed = true;
    }
    return updated;
  });
  return changed ? next : bindings;
}
function stepMatchesDevice(step, deviceId) {
  return Number(step?.device_id || 0) === deviceId;
}
function stepMatchesCommand(step, deviceId, commandId) {
  return Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === commandId;
}
function deviceMacroStepMatchesCommand(step, commandId) {
  return !isMacroDelayStep(step) && Number(step?.command_id || 0) === commandId;
}
var MACRO_DELAY_SENTINEL = 255;
function isMacroDelayStep(step) {
  return Number(step?.device_id || 0) === MACRO_DELAY_SENTINEL || Number(step?.command_id || 0) === MACRO_DELAY_SENTINEL;
}
function filterMacroSteps(steps, shouldRemove) {
  const list = steps ?? [];
  const result = [];
  for (let index = 0; index < list.length; index += 1) {
    if (shouldRemove(list[index])) {
      while (index + 1 < list.length && isMacroDelayStep(list[index + 1])) {
        index += 1;
      }
      continue;
    }
    result.push(list[index]);
  }
  return result;
}
function countRemovedMacroSteps(steps, shouldRemove) {
  const original = (steps ?? []).length;
  return original - filterMacroSteps(steps, shouldRemove).length;
}
function clearBindingLongPress(binding) {
  const { long_press_device_id, long_press_command_id, ...rest } = binding;
  return rest;
}
function cascadeBindingForDeletedDevice(binding, deviceId) {
  if (Number(binding?.device_id || 0) === deviceId) return null;
  if (Number(binding?.long_press_device_id || 0) === deviceId) return clearBindingLongPress(binding);
  return binding;
}
function cascadeBindingForDeletedCommand(binding, deviceId, commandId, deviceScoped) {
  const shortMatches = deviceScoped ? Number(binding?.command_id || 0) === commandId : Number(binding?.device_id || 0) === deviceId && Number(binding?.command_id || 0) === commandId;
  if (shortMatches) return null;
  const longMatches = deviceScoped ? Number(binding?.long_press_command_id || 0) === commandId : Number(binding?.long_press_device_id || 0) === deviceId && Number(binding?.long_press_command_id || 0) === commandId;
  if (longMatches) return clearBindingLongPress(binding);
  return binding;
}
function cascadeBindingForDeletedMacro(binding, activityId, macroButtonId) {
  const shortMatches = Number(binding?.device_id || 0) === activityId && Number(binding?.command_id || 0) === macroButtonId;
  if (shortMatches) return null;
  const longMatches = Number(binding?.long_press_device_id || 0) === activityId && Number(binding?.long_press_command_id || 0) === macroButtonId;
  if (longMatches) return clearBindingLongPress(binding);
  return binding;
}
function applyBindingCascade(bindings, transform) {
  const result = [];
  for (const binding of bindings ?? []) {
    const next = transform(binding);
    if (next !== null) result.push(next);
  }
  return result;
}
function countAffectedBindings(bindings, transform) {
  let count = 0;
  for (const binding of bindings ?? []) {
    const next = transform(binding);
    if (next === null || next !== binding) count += 1;
  }
  return count;
}
function bundleDeleteImpact(bundle, target) {
  const empty = { favorites: 0, macroSteps: 0, powerSteps: 0, activities: 0, bindings: 0 };
  if (!bundle) return empty;
  if (target.kind === "device") {
    const deviceId = Number(target.deviceId);
    let favorites = 0;
    let macroSteps = 0;
    let activities = 0;
    let bindings = 0;
    for (const activity of bundle.activities ?? []) {
      if ((activity?.referenced_source_device_ids ?? []).some((id) => Number(id) === deviceId)) {
        activities += 1;
      }
      for (const slot of activity?.favorite_slots ?? []) {
        if (Number(slot?.device_id || 0) === deviceId) favorites += 1;
      }
      for (const macro of activity?.macros ?? []) {
        macroSteps += countRemovedMacroSteps(macro?.steps, (step) => stepMatchesDevice(step, deviceId));
      }
      bindings += countAffectedBindings(
        activity?.button_bindings,
        (binding) => cascadeBindingForDeletedDevice(binding, deviceId)
      );
    }
    return { favorites, macroSteps, powerSteps: 0, activities, bindings };
  }
  if (target.kind === "command") {
    const deviceId = Number(target.deviceId);
    const commandId = Number(target.commandId);
    let favorites = 0;
    let macroSteps = 0;
    let bindings = 0;
    for (const activity of bundle.activities ?? []) {
      for (const slot of activity?.favorite_slots ?? []) {
        if (Number(slot?.device_id || 0) === deviceId && Number(slot?.command_id || 0) === commandId) {
          favorites += 1;
        }
      }
      for (const macro of activity?.macros ?? []) {
        macroSteps += countRemovedMacroSteps(macro?.steps, (step) => stepMatchesCommand(step, deviceId, commandId));
      }
      bindings += countAffectedBindings(
        activity?.button_bindings,
        (binding) => cascadeBindingForDeletedCommand(binding, deviceId, commandId, false)
      );
    }
    const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === deviceId);
    bindings += countAffectedBindings(
      device?.button_bindings,
      (binding) => cascadeBindingForDeletedCommand(binding, deviceId, commandId, true)
    );
    let powerSteps = 0;
    for (const macro of device?.macros ?? []) {
      const removed = countRemovedMacroSteps(macro?.steps, (step) => deviceMacroStepMatchesCommand(step, commandId));
      if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(Number(macro?.button_id || 0))) powerSteps += removed;
      else macroSteps += removed;
    }
    return { favorites, macroSteps, powerSteps, activities: 0, bindings };
  }
  if (target.kind === "activity_member") {
    return activityMemberRemovalImpact(bundle, target.activityId, target.deviceId);
  }
  return empty;
}
function backupDeleteHasCascade(impact) {
  return impact.favorites > 0 || impact.macroSteps > 0 || impact.powerSteps > 0 || impact.activities > 0 || impact.bindings > 0;
}
function deleteBundleActivity(bundle, activityId) {
  const id = Number(activityId);
  return {
    ...bundle,
    activities: (bundle.activities ?? []).filter((activity) => Number(activity?.device?.device_id || 0) !== id)
  };
}
function stripDeviceFromActivity(activity, deviceId) {
  return {
    ...activity,
    referenced_source_device_ids: (activity.referenced_source_device_ids ?? []).filter(
      (id) => Number(id) !== deviceId
    ),
    favorite_slots: (activity.favorite_slots ?? []).filter((slot) => Number(slot?.device_id || 0) !== deviceId),
    macros: (activity.macros ?? []).map((macro) => ({
      ...macro,
      steps: filterMacroSteps(macro?.steps, (step) => stepMatchesDevice(step, deviceId))
    })),
    button_bindings: applyBindingCascade(
      activity.button_bindings,
      (binding) => cascadeBindingForDeletedDevice(binding, deviceId)
    )
  };
}
function deleteBundleDevice(bundle, deviceId) {
  const id = Number(deviceId);
  const next = {
    ...bundle,
    devices: (bundle.devices ?? []).filter((device) => Number(device?.device?.device_id || 0) !== id),
    activities: (bundle.activities ?? []).map((activity) => stripDeviceFromActivity(activity, id))
  };
  return reconcileBundlePowerMacros(next);
}
function deleteBundleDeviceCommand(bundle, deviceId, commandId) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  const next = {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).filter((command) => Number(command?.command_id || 0) !== cId),
        button_bindings: applyBindingCascade(
          device.button_bindings,
          (binding) => cascadeBindingForDeletedCommand(binding, dId, cId, true)
        ),
        // The device's own macros (power on/off sequences and user macros)
        // reference commands by id — prune those steps too, or the bundle
        // keeps dangling references sync validation rejects.
        macros: (device.macros ?? []).map((macro) => ({
          ...macro,
          steps: filterMacroSteps(macro?.steps, (step) => deviceMacroStepMatchesCommand(step, cId))
        }))
      };
    }),
    activities: (bundle.activities ?? []).map((activity) => ({
      ...activity,
      favorite_slots: (activity.favorite_slots ?? []).filter(
        (slot) => !(Number(slot?.device_id || 0) === dId && Number(slot?.command_id || 0) === cId)
      ),
      macros: (activity.macros ?? []).map((macro) => ({
        ...macro,
        steps: filterMacroSteps(macro?.steps, (step) => stepMatchesCommand(step, dId, cId))
      })),
      button_bindings: applyBindingCascade(
        activity.button_bindings,
        (binding) => cascadeBindingForDeletedCommand(binding, dId, cId, false)
      )
    }))
  };
  return reconcileBundleMembershipChange(bundle, next);
}
function deleteBundleActivityQuickAccess(bundle, activityId, kind, buttonId) {
  const bId = Number(buttonId);
  const next = updateActivity(bundle, activityId, (activity) => {
    if (kind === "favorite") {
      return {
        ...activity,
        favorite_slots: (activity.favorite_slots ?? []).filter((slot) => Number(slot?.button_id || 0) !== bId)
      };
    }
    return {
      ...activity,
      macros: (activity.macros ?? []).filter((macro) => Number(macro?.button_id || 0) !== bId),
      // A button bound to this macro now dangles — drop it (or clear the
      // long press if only that referenced the macro).
      button_bindings: applyBindingCascade(
        activity.button_bindings,
        (binding) => cascadeBindingForDeletedMacro(binding, Number(activityId), bId)
      )
    };
  });
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}
function nextQuickAccessButtonId(activity) {
  let max = 0;
  const consider = (value) => {
    if (value > 0 && !INTERNAL_POWER_MACRO_BUTTON_IDS.has(value) && value > max) max = value;
  };
  for (const slot of activity.favorite_slots ?? []) consider(Number(slot?.button_id || 0));
  for (const macro of activity.macros ?? []) consider(Number(macro?.button_id || 0));
  return max + 1;
}
function addBundleActivityFavorite(bundle, activityId, deviceId, commandId, name) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  if (dId <= 0 || cId <= 0) return bundle;
  const trimmed = String(name ?? "").trim();
  const next = updateActivity(bundle, activityId, (activity) => {
    const slot = {
      button_id: nextQuickAccessButtonId(activity),
      device_id: dId,
      command_id: cId,
      name: trimmed
    };
    return { ...activity, favorite_slots: [...activity.favorite_slots ?? [], slot] };
  });
  return reconcileActivityPowerMacros(next, Number(activityId));
}
function applyBundleDelete(bundle, target) {
  switch (target.kind) {
    case "activity":
      return deleteBundleActivity(bundle, target.activityId);
    case "device":
      return deleteBundleDevice(bundle, target.deviceId);
    case "command":
      return deleteBundleDeviceCommand(bundle, target.deviceId, target.commandId);
    case "favorite":
      return deleteBundleActivityQuickAccess(bundle, target.activityId, "favorite", target.buttonId);
    case "macro":
      return deleteBundleActivityQuickAccess(bundle, target.activityId, "macro", target.buttonId);
    case "activity_binding":
      return deleteActivityButtonBinding(bundle, target.activityId, target.buttonId);
    case "device_binding":
      return deleteDeviceButtonBinding(bundle, target.deviceId, target.buttonId);
    case "activity_member":
      return removeActivityMemberDevice(bundle, target.activityId, target.deviceId);
  }
}
var POWER_ON_MACRO_BUTTON_ID = 198;
var POWER_OFF_MACRO_BUTTON_ID = 199;
var DEVICE_POWER_ON_REF_COMMAND = 198;
var DEVICE_POWER_OFF_REF_COMMAND = 199;
var DEVICE_INPUT_REF_COMMAND = 197;
var POWER_MACRO_DELAY_BUTTON_CODE = 281474976710655;
var POWER_STEP_DEFAULT_DELAY = 255;
function powerMacroDelayRow(delay) {
  return {
    device_id: 255,
    command_id: 255,
    button_code: POWER_MACRO_DELAY_BUTTON_CODE,
    duration: 255,
    delay: delay & 255
  };
}
function powerStep(deviceId, commandId, duration = 0) {
  return {
    device_id: Number(deviceId),
    command_id: commandId,
    button_code: 0,
    duration: duration & 255,
    delay: POWER_STEP_DEFAULT_DELAY
  };
}
function activityPowerDeviceIds(activity) {
  const ids = /* @__PURE__ */ new Set();
  for (const macro of activity.macros ?? []) {
    const buttonId = Number(macro?.button_id || 0);
    if (buttonId !== POWER_ON_MACRO_BUTTON_ID && buttonId !== POWER_OFF_MACRO_BUTTON_ID) continue;
    for (const step of macro?.steps ?? []) {
      if (isMacroDelayStep(step)) continue;
      const command = Number(step?.command_id || 0);
      if (command === DEVICE_POWER_ON_REF_COMMAND || command === DEVICE_INPUT_REF_COMMAND || command === DEVICE_POWER_OFF_REF_COMMAND) {
        const deviceId = Number(step?.device_id || 0);
        if (deviceId > 0) ids.add(deviceId);
      }
    }
  }
  return ids;
}
function activityUsageDeviceIds(activity) {
  const selfId = Number(activity?.device?.device_id || 0);
  const ids = /* @__PURE__ */ new Set();
  const add = (value) => {
    const id = Number(value || 0);
    if (id > 0 && id !== selfId) ids.add(id);
  };
  for (const slot of activity.favorite_slots ?? []) add(slot?.device_id);
  for (const binding of activity.button_bindings ?? []) {
    add(binding?.device_id);
    add(binding?.long_press_device_id);
  }
  for (const macro of activity.macros ?? []) {
    for (const step of macro?.steps ?? []) {
      if (isMacroDelayStep(step) || isPowerRefStep(step)) continue;
      add(step?.device_id);
    }
  }
  return ids;
}
function activityMemberDeviceIds(activity) {
  const ids = activityPowerDeviceIds(activity);
  for (const id of activityUsageDeviceIds(activity)) ids.add(id);
  return [...ids].sort((left, right) => left - right);
}
function reconcilePowerMacroSteps(existingSteps, members, refCommands) {
  const memberSet = new Set(members);
  const { prefix, groups } = groupMacroSteps(existingSteps);
  const kept = flattenMacroGroups(prefix, groups.filter((group) => {
    const deviceId = Number(group.head?.device_id || 0);
    return deviceId > 0 ? memberSet.has(deviceId) : true;
  }));
  const out = [...kept];
  const memberOrder = new Map(members.map((id, index) => [id, index]));
  const findRef = (deviceId, command) => out.findIndex(
    (step) => !isMacroDelayStep(step) && stepMatchesCommand(step, deviceId, command)
  );
  const indexAfterGroupAt = (headIndex) => {
    let index = headIndex + 1;
    while (index < out.length && isMacroDelayStep(out[index])) index += 1;
    return index;
  };
  const insertIndexFor = (deviceId, command) => {
    if (command === DEVICE_POWER_ON_REF_COMMAND) {
      const inputIndex = findRef(deviceId, DEVICE_INPUT_REF_COMMAND);
      if (inputIndex >= 0) return inputIndex;
    }
    if (command === DEVICE_INPUT_REF_COMMAND) {
      const powerIndex = findRef(deviceId, DEVICE_POWER_ON_REF_COMMAND);
      if (powerIndex >= 0) return indexAfterGroupAt(powerIndex);
    }
    const myOrder = memberOrder.get(deviceId) ?? members.length;
    const laterIndex = out.findIndex((step) => {
      if (isMacroDelayStep(step) || !isPowerRefStep(step)) return false;
      const otherOrder = memberOrder.get(Number(step?.device_id || 0));
      return otherOrder != null && otherOrder > myOrder;
    });
    return laterIndex >= 0 ? laterIndex : out.length;
  };
  for (const deviceId of members) {
    for (const command of refCommands) {
      const present = out.some(
        (step) => Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === command
      );
      if (!present) out.splice(insertIndexFor(deviceId, command), 0, powerStep(deviceId, command));
    }
  }
  return out;
}
function reconcileActivityPowerMacros(bundle, activityId, extraMemberIds = []) {
  return updateActivity(bundle, activityId, (activity) => {
    const selfId = Number(activity?.device?.device_id || 0);
    const memberSet = new Set(activityMemberDeviceIds(activity));
    for (const id of extraMemberIds) {
      const extraId = Number(id || 0);
      if (extraId > 0 && extraId !== selfId) memberSet.add(extraId);
    }
    const members = [...memberSet].sort((left, right) => left - right);
    const macros = [...activity.macros ?? []];
    const ensure = (buttonId, name, refCommands) => {
      const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === buttonId);
      const existing = index >= 0 ? macros[index] : null;
      if (!existing && members.length === 0) return;
      const steps = reconcilePowerMacroSteps(existing?.steps, members, refCommands);
      const next = {
        ...existing ?? {},
        button_id: buttonId,
        name: existing?.name ?? name,
        steps
      };
      if (index >= 0) macros[index] = next;
      else macros.push(next);
    };
    ensure(POWER_ON_MACRO_BUTTON_ID, "POWER_ON", [DEVICE_POWER_ON_REF_COMMAND, DEVICE_INPUT_REF_COMMAND]);
    ensure(POWER_OFF_MACRO_BUTTON_ID, "POWER_OFF", [DEVICE_POWER_OFF_REF_COMMAND]);
    return { ...activity, macros, referenced_source_device_ids: members };
  });
}
function reconcileBundlePowerMacros(bundle) {
  let next = bundle;
  for (const activity of bundle.activities ?? []) {
    const id = Number(activity?.device?.device_id || 0);
    if (id > 0) next = reconcileActivityPowerMacros(next, id);
  }
  return next;
}
function reconcileActivityMembershipChange(before, after, activityId) {
  const aId = Number(activityId);
  const beforeActivity = (before.activities ?? []).find(
    (activity) => Number(activity?.device?.device_id || 0) === aId
  );
  const afterActivity = (after.activities ?? []).find(
    (activity) => Number(activity?.device?.device_id || 0) === aId
  );
  if (!afterActivity) return after;
  const beforeUsage = beforeActivity ? activityUsageDeviceIds(beforeActivity) : /* @__PURE__ */ new Set();
  const afterUsage = activityUsageDeviceIds(afterActivity);
  const lost = new Set([...beforeUsage].filter((deviceId) => !afterUsage.has(deviceId)));
  if (lost.size === 0) return reconcileActivityPowerMacros(after, aId);
  const pruned = updateActivity(after, aId, (activity) => ({
    ...activity,
    referenced_source_device_ids: (activity.referenced_source_device_ids ?? []).filter(
      (deviceId) => !lost.has(Number(deviceId))
    ),
    macros: (activity.macros ?? []).map((macro) => ({
      ...macro,
      steps: filterMacroSteps(
        macro.steps,
        (step) => isPowerRefStep(step) && lost.has(Number(step?.device_id || 0))
      )
    }))
  }));
  return reconcileActivityPowerMacros(pruned, aId);
}
function reconcileBundleMembershipChange(before, after) {
  let next = after;
  for (const activity of after.activities ?? []) {
    const activityId = Number(activity?.device?.device_id || 0);
    if (activityId > 0) next = reconcileActivityMembershipChange(before, next, activityId);
  }
  return next;
}
function findBundleActivity(bundle, activityId) {
  return (bundle?.activities ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(activityId)
  );
}
function removeActivityMemberDevice(bundle, activityId, deviceId) {
  const aId = Number(activityId);
  const next = updateActivity(
    bundle,
    aId,
    (activity) => stripDeviceFromActivity(activity, Number(deviceId))
  );
  return reconcileActivityPowerMacros(next, aId);
}
function activityMemberRemovalImpact(bundle, activityId, deviceId) {
  const empty = { favorites: 0, macroSteps: 0, powerSteps: 0, activities: 0, bindings: 0 };
  const activity = findBundleActivity(bundle, activityId);
  if (!activity) return empty;
  const dId = Number(deviceId);
  let favorites = 0;
  for (const slot of activity.favorite_slots ?? []) {
    if (Number(slot?.device_id || 0) === dId) favorites += 1;
  }
  let macroSteps = 0;
  for (const macro of activity.macros ?? []) {
    if (INTERNAL_POWER_MACRO_BUTTON_IDS.has(Number(macro?.button_id || 0))) {
      for (const step of macro?.steps ?? []) {
        if (!isMacroDelayStep(step) && !isPowerRefStep(step) && stepMatchesDevice(step, dId)) {
          macroSteps += 1;
        }
      }
    } else {
      macroSteps += countRemovedMacroSteps(macro?.steps, (step) => stepMatchesDevice(step, dId));
    }
  }
  const bindings = countAffectedBindings(
    activity.button_bindings,
    (binding) => cascadeBindingForDeletedDevice(binding, dId)
  );
  return { favorites, macroSteps, powerSteps: 0, activities: 0, bindings };
}
var SYNTHETIC_COMMAND_CODE_BASE = 2e4;
function synthesizeCommandCode(commandId) {
  return SYNTHETIC_COMMAND_CODE_BASE + (Number(commandId) & 255);
}
function findDevice(bundle, deviceId) {
  return (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
}
function inputEntryOrdinal(entry) {
  return Number(entry?.input_index ?? entry?.ordinal ?? 0);
}
function deviceInputEntries(bundle, deviceId) {
  const device = findDevice(bundle, deviceId);
  const entries = device?.input_record?.entries ?? [];
  return entries.map((entry) => ({
    commandId: Number(entry?.command_id || 0),
    ordinal: inputEntryOrdinal(entry),
    name: String(entry?.name || entry?.label || "").trim()
  })).filter((entry) => entry.commandId > 0).sort((left, right) => left.ordinal - right.ordinal);
}
function ensureDeviceInput(bundle, deviceId, commandId) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  const device = findDevice(bundle, dId);
  const existingEntries = device?.input_record?.entries ?? [];
  const reused = existingEntries.find((entry) => Number(entry?.command_id || 0) === cId);
  if (reused) {
    return { bundle, ordinal: inputEntryOrdinal(reused) };
  }
  const nextOrdinal = existingEntries.reduce((max, entry) => Math.max(max, inputEntryOrdinal(entry)), 0) + 1;
  const newEntry = {
    command_id: cId,
    fid: synthesizeCommandCode(cId),
    input_index: nextOrdinal,
    name: commandLabelFor(bundle, dId, cId) || `Input ${cId}`
  };
  const nextBundle = {
    ...bundle,
    devices: (bundle.devices ?? []).map((entry) => {
      if (Number(entry?.device?.device_id || 0) !== dId) return entry;
      const record = { ...entry.input_record ?? {} };
      record.entries = [...existingEntries, newEntry];
      return { ...entry, input_record: record };
    })
  };
  return { bundle: nextBundle, ordinal: nextOrdinal };
}
function setActivityPowerInputOrdinal(activity, deviceId, ordinal) {
  const dId = Number(deviceId);
  return {
    ...activity,
    macros: (activity.macros ?? []).map((macro) => {
      if (Number(macro?.button_id || 0) !== POWER_ON_MACRO_BUTTON_ID) return macro;
      let found = false;
      const steps = (macro.steps ?? []).map((step) => {
        if (!isMacroDelayStep(step) && Number(step?.device_id || 0) === dId && Number(step?.command_id || 0) === DEVICE_INPUT_REF_COMMAND) {
          found = true;
          return { ...step, duration: ordinal & 255 };
        }
        return step;
      });
      if (!found) steps.push(powerStep(dId, DEVICE_INPUT_REF_COMMAND, ordinal));
      return { ...macro, steps };
    })
  };
}
function setActivityDeviceInput(bundle, activityId, deviceId, commandId) {
  const cId = Number(commandId);
  if (cId <= 0) return bundle;
  const ensured = ensureDeviceInput(bundle, deviceId, cId);
  const reconciled = reconcileActivityPowerMacros(ensured.bundle, Number(activityId));
  return updateActivity(
    reconciled,
    activityId,
    (activity) => setActivityPowerInputOrdinal(activity, deviceId, ensured.ordinal)
  );
}
function clearActivityDeviceInput(bundle, activityId, deviceId) {
  const reconciled = reconcileActivityPowerMacros(bundle, Number(activityId));
  return updateActivity(reconciled, activityId, (activity) => setActivityPowerInputOrdinal(activity, deviceId, 0));
}
function isPowerRefStep(step) {
  const command = Number(step?.command_id || 0);
  return command === DEVICE_INPUT_REF_COMMAND || command === DEVICE_POWER_ON_REF_COMMAND || command === DEVICE_POWER_OFF_REF_COMMAND;
}
function defaultMacroName(buttonId) {
  if (buttonId === POWER_ON_MACRO_BUTTON_ID) return "POWER_ON";
  if (buttonId === POWER_OFF_MACRO_BUTTON_ID) return "POWER_OFF";
  return `Macro ${buttonId}`;
}
function deviceMacroDelayStep(delay) {
  return { command_id: 255, duration: 255, delay: Number(delay) & 255 };
}
function groupMacroSteps(steps) {
  const prefix = [];
  const groups = [];
  for (const step of steps ?? []) {
    if (isMacroDelayStep(step)) {
      if (groups.length === 0) prefix.push(step);
      else groups[groups.length - 1].trailing.push(step);
    } else {
      groups.push({ head: step, trailing: [] });
    }
  }
  return { prefix, groups };
}
function flattenMacroGroups(prefix, groups) {
  const out = [...prefix];
  for (const group of groups) out.push(group.head, ...group.trailing);
  return out;
}
function groupWait(group) {
  return group.trailing.length > 0 ? Number(group.trailing[0]?.delay || 0) : 0;
}
function applyGroupWait(group, waitByte, isActivity) {
  const value = Number(waitByte) & 255;
  if (group.trailing.length > 0) {
    group.trailing = [{ ...group.trailing[0], delay: value }, ...group.trailing.slice(1)];
  } else if (value > 0) {
    group.trailing = [isActivity ? powerMacroDelayRow(value) : deviceMacroDelayStep(value)];
  }
}
function deviceMacroStepItems(bundle, deviceId, buttonId) {
  const device = findDevice(bundle, deviceId);
  const macro = (device?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const commandId = Number(group.head?.command_id || 0);
    return {
      index,
      kind: "command",
      commandId,
      deviceId: null,
      label: commandNameOrFallback(bundle, Number(deviceId), commandId),
      hold: Number(group.head?.duration || 0),
      wait: groupWait(group)
    };
  });
}
function updateDeviceMacro(bundle, deviceId, buttonId, transform) {
  const dId = Number(deviceId);
  const bId = Number(buttonId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      const macros = [...device.macros ?? []];
      const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === bId);
      const existing = index >= 0 ? macros[index] : null;
      const next = {
        ...existing ?? {},
        button_id: bId,
        name: existing?.name ?? defaultMacroName(bId),
        steps: transform(existing?.steps ?? [])
      };
      if (index >= 0) macros[index] = next;
      else macros.push(next);
      return { ...device, macros };
    })
  };
}
function patchMacroStep(step, patch, isActivityMacro) {
  const next = { ...step };
  if (isMacroDelayStep(step)) {
    if (patch.wait !== void 0) next.delay = Number(patch.wait) & 255;
    return next;
  }
  if (patch.commandId !== void 0) {
    next.command_id = Number(patch.commandId);
    if (isActivityMacro) next.button_code = synthesizeCommandCode(Number(patch.commandId));
  }
  if (patch.deviceId !== void 0 && isActivityMacro) next.device_id = Number(patch.deviceId);
  if (patch.hold !== void 0) next.duration = Number(patch.hold) & 255;
  return next;
}
function addDeviceMacroCommandStep(bundle, deviceId, buttonId, commandId, hold = 0) {
  if (Number(commandId) <= 0) return bundle;
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => [
    ...steps,
    { command_id: Number(commandId), duration: Number(hold) & 255, delay: 255 }
  ]);
}
function updateDeviceMacroStep(bundle, deviceId, buttonId, index, patch) {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    group.head = patchMacroStep(group.head, patch, false);
    return flattenMacroGroups(prefix, groups);
  });
}
function setDeviceMacroStepWait(bundle, deviceId, buttonId, index, wait) {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    applyGroupWait(group, wait, false);
    return flattenMacroGroups(prefix, groups);
  });
}
function removeDeviceMacroStep(bundle, deviceId, buttonId, index) {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    if (Number(index) < 0 || Number(index) >= groups.length) return steps;
    groups.splice(Number(index), 1);
    return flattenMacroGroups(prefix, groups);
  });
}
function reorderDeviceMacroSteps(bundle, deviceId, buttonId, orderedIndices) {
  return updateDeviceMacro(bundle, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const reordered = orderedIndices.map((i4) => groups[Number(i4)]).filter((group) => Boolean(group));
    if (reordered.length !== groups.length) return steps;
    return flattenMacroGroups(prefix, reordered);
  });
}
function activityUserMacroSummaries(bundle, activityId) {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  return (activity?.macros ?? []).map((macro) => ({ buttonId: Number(macro?.button_id || 0), macro })).filter(({ buttonId }) => buttonId > 0 && buttonId !== POWER_ON_MACRO_BUTTON_ID && buttonId !== POWER_OFF_MACRO_BUTTON_ID).map(({ buttonId, macro }) => ({
    buttonId,
    name: String(macro?.name || `Macro ${buttonId}`),
    commandStepCount: (macro?.steps ?? []).filter((step) => !isMacroDelayStep(step)).length
  })).sort((left, right) => left.buttonId - right.buttonId);
}
function activityMacroStepItems(bundle, activityId, buttonId) {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const head = group.head;
    const wait = groupWait(group);
    const deviceId = Number(head?.device_id || 0);
    const commandId = Number(head?.command_id || 0);
    const deviceName = deviceNameFor(bundle, deviceId);
    if (commandId === DEVICE_POWER_ON_REF_COMMAND || commandId === DEVICE_POWER_OFF_REF_COMMAND) {
      const verb = commandId === DEVICE_POWER_ON_REF_COMMAND ? "Power on" : "Power off";
      return { index, kind: "power", commandId, deviceId, label: `${verb} \xB7 ${deviceName}`, hold: 0, wait, protected: true };
    }
    if (commandId === DEVICE_INPUT_REF_COMMAND) {
      const ordinal = Number(head?.duration || 0);
      const input = deviceInputEntries(bundle, deviceId).find((entry) => entry.ordinal === ordinal);
      const inputLabel = input?.name || (ordinal > 0 ? `Input ${ordinal}` : "no input");
      return { index, kind: "input", commandId: input?.commandId ?? null, deviceId, label: `Input \xB7 ${deviceName}: ${inputLabel}`, hold: 0, wait, protected: true };
    }
    return {
      index,
      kind: "command",
      commandId,
      deviceId,
      label: `${deviceName} \xB7 ${commandNameOrFallback(bundle, deviceId, commandId)}`,
      hold: Number(head?.duration || 0),
      wait
    };
  });
}
function updateActivityMacro(bundle, activityId, buttonId, transform) {
  const bId = Number(buttonId);
  const next = updateActivity(bundle, activityId, (activity) => {
    const macros = [...activity.macros ?? []];
    const index = macros.findIndex((macro) => Number(macro?.button_id || 0) === bId);
    const existing = index >= 0 ? macros[index] : null;
    const nextMacro = {
      ...existing ?? {},
      button_id: bId,
      name: existing?.name ?? `Macro ${bId}`,
      steps: transform(existing?.steps ?? [])
    };
    if (index >= 0) macros[index] = nextMacro;
    else macros.push(nextMacro);
    return { ...activity, macros };
  });
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}
function addActivityUserMacro(bundle, activityId, name) {
  return updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    macros: [...activity.macros ?? [], {
      button_id: nextQuickAccessButtonId(activity),
      name: String(name ?? "").trim() || "Macro",
      steps: []
    }]
  }));
}
function addActivityMacroCommandStep(bundle, activityId, buttonId, deviceId, commandId, hold = 0) {
  if (Number(deviceId) <= 0 || Number(commandId) <= 0) return bundle;
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => [...steps, {
    device_id: Number(deviceId),
    command_id: Number(commandId),
    button_code: synthesizeCommandCode(Number(commandId)),
    duration: Number(hold) & 255,
    delay: 255
  }]);
}
function updateActivityMacroStep(bundle, activityId, buttonId, index, patch) {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    group.head = patchMacroStep(group.head, patch, true);
    return flattenMacroGroups(prefix, groups);
  });
}
function setActivityMacroStepWait(bundle, activityId, buttonId, index, wait) {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    applyGroupWait(group, wait, true);
    return flattenMacroGroups(prefix, groups);
  });
}
function removeActivityMacroStep(bundle, activityId, buttonId, index) {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    if (isPowerRefStep(group.head)) return steps;
    groups.splice(Number(index), 1);
    return flattenMacroGroups(prefix, groups);
  });
}
function reorderActivityMacroSteps(bundle, activityId, buttonId, orderedIndices) {
  return updateActivityMacro(bundle, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const reordered = orderedIndices.map((i4) => groups[Number(i4)]).filter((group) => Boolean(group));
    if (reordered.length !== groups.length) return steps;
    return flattenMacroGroups(prefix, reordered);
  });
}
var SHARED_BUTTON_CATALOG = [
  { code: 174, name: "Up", group: "Navigation" },
  { code: 178, name: "Down", group: "Navigation" },
  { code: 175, name: "Left", group: "Navigation" },
  { code: 177, name: "Right", group: "Navigation" },
  { code: 176, name: "OK", group: "Navigation" },
  { code: 180, name: "Home", group: "Navigation" },
  { code: 179, name: "Back", group: "Navigation" },
  { code: 181, name: "Menu", group: "Navigation" },
  { code: 182, name: "Volume Up", group: "Volume & Channel" },
  { code: 185, name: "Volume Down", group: "Volume & Channel" },
  { code: 184, name: "Mute", group: "Volume & Channel" },
  { code: 183, name: "Channel Up", group: "Volume & Channel" },
  { code: 186, name: "Channel Down", group: "Volume & Channel" },
  { code: 187, name: "Rewind", group: "Transport" },
  { code: 188, name: "Pause", group: "Transport" },
  { code: 189, name: "Forward", group: "Transport" },
  { code: 190, name: "Red", group: "Colour" },
  { code: 191, name: "Green", group: "Colour" },
  { code: 192, name: "Yellow", group: "Colour" },
  { code: 193, name: "Blue", group: "Colour" }
];
var X2_EXTRA_BUTTON_CATALOG = [
  { code: 153, name: "A", group: "Extra" },
  { code: 152, name: "B", group: "Extra" },
  { code: 151, name: "C", group: "Extra" },
  { code: 154, name: "Exit", group: "Extra" },
  { code: 155, name: "DVR", group: "Extra" },
  { code: 156, name: "Play", group: "Extra" },
  { code: 157, name: "Guide", group: "Extra" }
];
var BUTTON_NAME_BY_CODE = new Map(
  [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG].map((entry) => [entry.code, entry.name])
);
function bundleButtonCatalog(bundle) {
  if (normalizeHubVersion(bundle?.hub?.version) === "X2") {
    return [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG];
  }
  return [...SHARED_BUTTON_CATALOG];
}
function buttonName(code) {
  return BUTTON_NAME_BY_CODE.get(Number(code)) ?? `Button 0x${Number(code).toString(16).toUpperCase()}`;
}
function deviceNameFor(bundle, deviceId) {
  const device = (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  return String(device?.device?.name || "").trim() || `Device ${Number(deviceId)}`;
}
function commandNameOrFallback(bundle, deviceId, commandId) {
  return commandLabelFor(bundle, deviceId, commandId) || `Command ${Number(commandId)}`;
}
function activityMacroName(bundle, activityId, buttonId) {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  return String(macro?.name || "").trim() || `Macro ${Number(buttonId)}`;
}
function activityBindingTargetLabel(bundle, activityId, targetDeviceId, targetCommandId) {
  if (targetDeviceId === Number(activityId)) {
    return `Macro \xB7 ${activityMacroName(bundle, activityId, targetCommandId)}`;
  }
  return `${deviceNameFor(bundle, targetDeviceId)} \xB7 ${commandNameOrFallback(bundle, targetDeviceId, targetCommandId)}`;
}
function sortBindingsByButtonId(rows) {
  return [...rows ?? []].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}
function activityButtonBindingItems(bundle, activityId) {
  if (!bundle) return [];
  const activity = (bundle.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const items = [];
  for (const row of sortBindingsByButtonId(activity.button_bindings)) {
    const buttonId = Number(row?.button_id || 0);
    const deviceId = Number(row?.device_id || 0);
    const commandId = Number(row?.command_id || 0);
    if (buttonId <= 0 || deviceId <= 0) continue;
    const item = {
      buttonId,
      buttonName: buttonName(buttonId),
      deviceId,
      commandId,
      isMacroTarget: deviceId === Number(activityId),
      shortPressLabel: activityBindingTargetLabel(bundle, Number(activityId), deviceId, commandId)
    };
    const lpDeviceId = Number(row?.long_press_device_id || 0);
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpDeviceId > 0 && lpCommandId > 0) {
      item.longPress = {
        deviceId: lpDeviceId,
        commandId: lpCommandId,
        isMacroTarget: lpDeviceId === Number(activityId),
        label: activityBindingTargetLabel(bundle, Number(activityId), lpDeviceId, lpCommandId)
      };
    }
    items.push(item);
  }
  return items;
}
function deviceButtonBindingItems(bundle, deviceId) {
  if (!bundle) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId);
  if (!device) return [];
  const items = [];
  for (const row of sortBindingsByButtonId(device.button_bindings)) {
    const buttonId = Number(row?.button_id || 0);
    const commandId = Number(row?.command_id || 0);
    if (buttonId <= 0 || commandId <= 0) continue;
    const item = {
      buttonId,
      buttonName: buttonName(buttonId),
      commandId,
      shortPressLabel: commandNameOrFallback(bundle, normalizedDeviceId, commandId)
    };
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpCommandId > 0) {
      item.longPress = {
        commandId: lpCommandId,
        label: commandNameOrFallback(bundle, normalizedDeviceId, lpCommandId)
      };
    }
    items.push(item);
  }
  return items;
}
function boundButtonIds(rows) {
  return new Set((rows ?? []).map((row) => Number(row?.button_id || 0)).filter((id) => id > 0));
}
function unboundButtonsForActivity(bundle, activityId) {
  const activity = (bundle?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const used = boundButtonIds(activity?.button_bindings);
  return bundleButtonCatalog(bundle).filter((entry) => !used.has(entry.code));
}
function unboundButtonsForDevice(bundle, deviceId) {
  const device = (bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  const used = boundButtonIds(device?.button_bindings);
  return bundleButtonCatalog(bundle).filter((entry) => !used.has(entry.code));
}
function upsertBindingRow(rows, row) {
  const buttonId = Number(row.button_id || 0);
  const next = (rows ?? []).filter((entry) => Number(entry?.button_id || 0) !== buttonId);
  next.push(row);
  return sortBindingsByButtonId(next);
}
function upsertActivityButtonBinding(bundle, activityId, input) {
  const buttonId = Number(input.buttonId);
  const deviceId = Number(input.deviceId);
  const commandId = Number(input.commandId);
  if (buttonId <= 0 || deviceId <= 0 || commandId <= 0) return bundle;
  const row = {
    button_id: buttonId,
    button_name: buttonName(buttonId),
    device_id: deviceId,
    command_id: commandId
  };
  const lpDeviceId = Number(input.longPress?.deviceId || 0);
  const lpCommandId = Number(input.longPress?.commandId || 0);
  if (lpDeviceId > 0 && lpCommandId > 0) {
    row.long_press_device_id = lpDeviceId;
    row.long_press_command_id = lpCommandId;
  }
  const next = updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    button_bindings: upsertBindingRow(activity.button_bindings, row)
  }));
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}
function upsertDeviceButtonBinding(bundle, deviceId, input) {
  const normalizedDeviceId = Number(deviceId);
  const buttonId = Number(input.buttonId);
  const commandId = Number(input.commandId);
  if (buttonId <= 0 || commandId <= 0) return bundle;
  const row = {
    button_id: buttonId,
    button_name: buttonName(buttonId),
    command_id: commandId,
    command_name: commandLabelFor(bundle, normalizedDeviceId, commandId) || void 0
  };
  const lpCommandId = Number(input.longPressCommandId || 0);
  if (lpCommandId > 0) row.long_press_command_id = lpCommandId;
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return { ...device, button_bindings: upsertBindingRow(device.button_bindings, row) };
    })
  };
}
function deleteActivityButtonBinding(bundle, activityId, buttonId) {
  const bId = Number(buttonId);
  const next = updateActivity(bundle, activityId, (activity) => ({
    ...activity,
    button_bindings: (activity.button_bindings ?? []).filter((row) => Number(row?.button_id || 0) !== bId)
  }));
  return reconcileActivityMembershipChange(bundle, next, Number(activityId));
}
function deleteDeviceButtonBinding(bundle, deviceId, buttonId) {
  const dId = Number(deviceId);
  const bId = Number(buttonId);
  return {
    ...bundle,
    devices: (bundle.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      return {
        ...device,
        button_bindings: (device.button_bindings ?? []).filter((row) => Number(row?.button_id || 0) !== bId)
      };
    })
  };
}
var ACTIVITY_ROLE_GROUPS = [
  "volume",
  "navigation",
  "playback",
  "channels"
];
var ROLE_GROUP_BUTTON_IDS = {
  volume: [182, 185, 184],
  navigation: [174, 178, 175, 177, 176, 179, 180, 181],
  playback: [156, 188, 187, 189],
  channels: [183, 186]
};
function roleGroupButtons(bundle, group) {
  const catalog = new Set(bundleButtonCatalog(bundle).map((entry) => entry.code));
  return ROLE_GROUP_BUTTON_IDS[group].filter((code) => catalog.has(code));
}
function deviceRoleBindings(bundle, deviceId, group) {
  const device = findDevice(bundle, Number(deviceId));
  const groupIds = new Set(roleGroupButtons(bundle, group));
  const byButton = /* @__PURE__ */ new Map();
  for (const row of device?.button_bindings ?? []) {
    const buttonId = Number(row?.button_id || 0);
    if (groupIds.has(buttonId) && Number(row?.command_id || 0) > 0) byButton.set(buttonId, row);
  }
  return byButton;
}
function roleMappableButtonCount(bundle, deviceId, group) {
  return deviceRoleBindings(bundle, deviceId, group).size;
}
function activityRoleAssignments(bundle, activityId) {
  const activity = findBundleActivity(bundle, activityId);
  return ACTIVITY_ROLE_GROUPS.map((group) => {
    const buttons = roleGroupButtons(bundle, group);
    const totalCount = buttons.length;
    const groupSet = new Set(buttons);
    const bound = (activity?.button_bindings ?? []).filter(
      (row) => groupSet.has(Number(row?.button_id || 0)) && Number(row?.device_id || 0) > 0
    );
    const unused = {
      group,
      state: "unused",
      deviceId: null,
      deviceName: null,
      boundCount: 0,
      totalCount
    };
    if (!bundle || !activity || bound.length === 0) return unused;
    const selfId = Number(activity.device?.device_id || 0);
    const targetIds = /* @__PURE__ */ new Set();
    for (const row of bound) {
      targetIds.add(Number(row?.device_id || 0));
      const lpDeviceId = Number(row?.long_press_device_id || 0);
      if (lpDeviceId > 0) targetIds.add(lpDeviceId);
    }
    const [only] = [...targetIds];
    if (targetIds.size !== 1 || only === selfId) {
      return { group, state: "custom", deviceId: null, deviceName: null, boundCount: bound.length, totalCount };
    }
    const mapped = deviceRoleBindings(bundle, only, group);
    const exact = bound.length === mapped.size && bound.every((row) => {
      const ref = mapped.get(Number(row?.button_id || 0));
      if (!ref) return false;
      if (Number(row?.command_id || 0) !== Number(ref?.command_id || 0)) return false;
      const rowLp = Number(row?.long_press_command_id || 0);
      const refLp = Number(ref?.long_press_command_id || 0);
      if (rowLp !== refLp) return false;
      return rowLp === 0 || Number(row?.long_press_device_id || 0) === only;
    });
    return {
      group,
      state: exact ? "device" : "customized",
      deviceId: only,
      deviceName: deviceNameFor(bundle, only),
      boundCount: bound.length,
      totalCount
    };
  });
}
function setActivityRoleDevice(bundle, activityId, group, deviceId) {
  const aId = Number(activityId);
  const buttons = roleGroupButtons(bundle, group);
  const groupSet = new Set(buttons);
  const mapped = deviceId != null && Number(deviceId) > 0 ? deviceRoleBindings(bundle, Number(deviceId), group) : null;
  const next = updateActivity(bundle, aId, (activity) => {
    let rows = (activity.button_bindings ?? []).filter(
      (row) => !groupSet.has(Number(row?.button_id || 0))
    );
    if (mapped) {
      const dId = Number(deviceId);
      for (const buttonId of buttons) {
        const ref = mapped.get(buttonId);
        if (!ref) continue;
        const row = {
          button_id: buttonId,
          button_name: buttonName(buttonId),
          device_id: dId,
          command_id: Number(ref.command_id)
        };
        const lpCommandId = Number(ref?.long_press_command_id || 0);
        if (lpCommandId > 0) {
          row.long_press_device_id = dId;
          row.long_press_command_id = lpCommandId;
        }
        rows = upsertBindingRow(rows, row);
      }
    }
    return { ...activity, button_bindings: rows };
  });
  return reconcileActivityMembershipChange(bundle, next, aId);
}
function bundleEditableDeviceOptions(bundle) {
  return bundleDeviceOptions(bundle);
}

// custom_components/sofabaton_x1s/www/src/tabs/edit-detail-view.ts
var POWER_MACRO_BUTTON_IDS = /* @__PURE__ */ new Set([198, 199]);
var IP_HEAD_DEVICE_CLASSES = /* @__PURE__ */ new Set(["wifi_hue", "wifi_roku", "wifi_sonos"]);
var IPV4_PATTERN = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
function bundleSupportsUnicodeNames(bundle) {
  const version = String(bundle?.hub?.version || "").toUpperCase();
  return version.includes("X2") || version.includes("X1S");
}
function sanitizeBundleName(bundle, value) {
  const pattern = bundleSupportsUnicodeNames(bundle) ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu : /[^A-Za-z0-9 ]+/g;
  return String(value ?? "").replace(pattern, "").slice(0, 30);
}
function useLegacyTextField() {
  return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
}
var SofabatonEditDetailView = class extends i3 {
  constructor() {
    super(...arguments);
    // ── Host-owned props ───────────────────────────────────────────────
    this.bundle = null;
    this.kind = "activity";
    this.entityId = null;
    this.dirty = false;
    this.mode = "backup";
    // ── Transient view state (moved 1:1 from backup-tab) ──────────────
    this._editDetailActiveSection = "power";
    this._powerControlMenuOpen = false;
    this._roleMenuOpen = null;
    // Trigger rects for the fixed-position overlay menus (overlayMenuPosition).
    // Captured at click time; not reactive — they change only together with
    // the open-state fields above/below.
    this._roleMenuAnchor = null;
    this._roleConfirm = null;
    // Full sub-view for individual button bindings (never an accordion).
    this._bindingsView = false;
    this._addShortcutKind = "command";
    this._addShortcutActionName = "";
    this._addShortcutMacroMode = "new";
    this._addShortcutMacroId = null;
    this._editDetailNameDraft = "";
    this._editRenameDialogOpen = false;
    this._editRenameDialogDraft = "";
    this._editRenameDialogError = "";
    this._editRenameDialogTarget = null;
    // ── Payload dialog (structured decoded form OR raw hex) ────────────
    // Separate from the rename dialog: renaming is the common case and
    // stays a compact name-only form; payload editing has its own button
    // and popup on each command row.
    this._payloadDialogOpen = false;
    this._payloadDialogTarget = null;
    this._payloadDialogDecodedDrafts = {};
    this._payloadDialogDecodedSnapshot = null;
    this._payloadDialogRawSnapshot = "";
    this._payloadDialogRawDraft = "";
    this._payloadDialogError = "";
    // ── Live payload editing (host-provided I/O) ───────────────────────
    // The detail view is hass-free; the live Activities host injects these
    // to fetch a command's blob on demand and to Test it on the hub. Absent
    // in backup mode (the payload already lives in the bundle there).
    this.fetchCommandPayload = null;
    this.testCommandPayload = null;
    this._payloadFetchingCommandId = null;
    this._payloadFetchError = "";
    this._payloadLiveFetched = null;
    this._payloadDialogTestStatus = "idle";
    this._payloadDialogTestError = "";
    // ── Add-command mode of the payload dialog (live mode only) ────────
    // Same payload controls as command edit, plus a Name field. Decodable
    // wifi classes seed their form (and the opaque record trailer) from an
    // existing command fetched as a template; IR synthesizes from the
    // descriptor alone on the backend, so it needs no template.
    this._payloadDialogAddMode = false;
    this._payloadDialogNameDraft = "";
    this._addCommandPreparing = false;
    this._confirmDeleteTarget = null;
    this._confirmDeleteLabel = "";
    this._addFavoriteOpen = false;
    this._addFavoriteDeviceId = null;
    this._addFavoriteCommandId = null;
    this._addFavoriteName = "";
    this._addFavoriteError = "";
    this._bindingDialogOpen = false;
    this._bindingScope = "activity";
    this._bindingEditButtonId = null;
    this._bindingButtonId = null;
    this._bindingDeviceId = null;
    this._bindingCommandId = null;
    this._bindingLongPressEnabled = false;
    this._bindingLpDeviceId = null;
    this._bindingLpCommandId = null;
    this._bindingTargetKind = "command";
    this._bindingActionName = "";
    this._bindingMacroMode = "new";
    this._bindingMacroId = null;
    this._bindingLpTargetKind = "command";
    this._bindingLpMacroMode = "new";
    this._bindingLpMacroId = null;
    this._bindingLpActionName = "";
    this._bindingError = "";
    this._detailScrollTop = 0;
    this._bindingsScrollTop = 0;
    this._macroEditor = null;
    this._stepDialogOpen = false;
    this._stepDialogEditIndex = null;
    this._stepKind = "command";
    this._stepDeviceId = null;
    this._stepCommandId = null;
    this._stepHoldSeconds = "0";
    this._stepError = "";
    this._haSortableReady = Boolean(customElements.get("ha-sortable"));
    /** Ask the host to leave the detail view (back button, entity delete). */
    this._requestClose = () => {
      this.dispatchEvent(new CustomEvent("close"));
    };
    // ── Live-mode header (§4.3) ─────────────────────────────────────────
    // The live header mirrors the Wifi command editor: Back (= discard, via the
    // host's exit-confirm) on the left, rename/delete + a single stateful Sync
    // button on the right. The element only signals sync intent; the host owns
    // the write. In backup mode there is no Sync button and the chip reads
    // "Unsaved".
    this._requestSync = () => this.dispatchEvent(new CustomEvent("sync-request"));
    this._handleEditDetailScroll = (event) => {
      const scrollEl = event.currentTarget;
      if (!scrollEl) return;
      if (this._roleMenuOpen !== null) {
        this._roleMenuAnchor = null;
        this._roleMenuOpen = null;
      }
      const sections = Array.from(
        scrollEl.querySelectorAll("[data-edit-section]")
      );
      if (!sections.length) return;
      if (scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2) {
        const lastSection = sections[sections.length - 1];
        const lastActive = String(lastSection.dataset.editSection || "power");
        if (lastActive !== this._editDetailActiveSection) {
          this._editDetailActiveSection = lastActive;
        }
        return;
      }
      const markerTop = scrollEl.getBoundingClientRect().top + 24;
      let active = String(sections[0].dataset.editSection || "power");
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= markerTop) {
          active = String(section.dataset.editSection || active);
        }
      }
      if (active !== this._editDetailActiveSection) {
        this._editDetailActiveSection = active;
      }
    };
    this._closeBindingsView = () => {
      this._bindingsView = false;
      this._closeBindingDialog();
      this._closeDeleteConfirm();
      this._restoreMainScroll();
    };
    this._handleRoleAssign = (group, deviceId) => {
      this._roleMenuOpen = null;
      if (!this.bundle || this.entityId == null) return;
      const current = activityRoleAssignments(this.bundle, Number(this.entityId)).find((role) => role.group === group);
      if (current && current.deviceId === deviceId && current.state !== "customized" && deviceId != null) return;
      if (current && (current.state === "customized" || current.state === "custom")) {
        this._roleConfirm = { group, deviceId };
        return;
      }
      this._applyRoleAssign(group, deviceId);
    };
    this._closeRoleConfirm = () => {
      this._roleConfirm = null;
    };
    this._confirmRoleAssign = () => {
      const pending = this._roleConfirm;
      this._roleConfirm = null;
      if (!pending) return;
      this._applyRoleAssign(pending.group, pending.deviceId);
    };
    this._handleAddCommandNameInput = (event) => {
      const input = event.currentTarget;
      const value = sanitizeBundleName(this.bundle, input.value);
      input.value = value;
      this._payloadDialogNameDraft = value;
      this._payloadDialogError = "";
    };
    this._handleRawPayloadInput = (event) => {
      const input = event.currentTarget;
      this._payloadDialogRawDraft = input.value;
      this._payloadDialogError = "";
    };
    this._handleDecodedFieldInput = (event, fieldKey) => {
      const input = event.currentTarget;
      this._payloadDialogDecodedDrafts = {
        ...this._payloadDialogDecodedDrafts,
        [fieldKey]: input.value
      };
    };
    this._handleEditRenameDialogInput = (event) => {
      const input = event.currentTarget;
      if (this._editRenameDialogTarget?.kind === "device_ip") {
        this._editRenameDialogDraft = input.value;
      } else {
        const value = sanitizeBundleName(this.bundle, input.value);
        input.value = value;
        this._editRenameDialogDraft = value;
      }
      this._editRenameDialogError = "";
    };
    this._openDetailRenameDialog = () => {
      if (!this.kind || this.entityId == null) return;
      this._editRenameDialogTarget = {
        kind: "detail",
        entityKind: this.kind,
        entityId: this.entityId
      };
      this._editRenameDialogDraft = this._selectedEditTitle();
      this._editRenameDialogError = "";
      this._editRenameDialogOpen = true;
    };
    this._openHubNameRenameDialog = () => {
      if (!this.bundle) return;
      this._editRenameDialogTarget = { kind: "hub_name" };
      this._editRenameDialogDraft = sanitizeBundleName(this.bundle, String(this.bundle.hub?.name ?? ""));
      this._editRenameDialogError = "";
      this._editRenameDialogOpen = true;
    };
    this._closeCommandPayloadDialog = () => {
      this._payloadDialogOpen = false;
      this._payloadDialogTarget = null;
      this._payloadDialogDecodedSnapshot = null;
      this._payloadDialogDecodedDrafts = {};
      this._payloadDialogRawSnapshot = "";
      this._payloadDialogRawDraft = "";
      this._payloadDialogError = "";
      this._payloadLiveFetched = null;
      this._payloadDialogTestStatus = "idle";
      this._payloadDialogTestError = "";
      this._payloadDialogAddMode = false;
      this._payloadDialogNameDraft = "";
    };
    this._applyCommandPayloadDialog = () => {
      const target = this._payloadDialogTarget;
      if (!target || !this.bundle) return;
      if (this._payloadDialogAddMode) {
        this._applyAddCommandDialog(target);
        return;
      }
      if (this.mode === "live") {
        this._applyLivePayloadDialog(target);
        return;
      }
      const snapshot = this._payloadDialogDecodedSnapshot;
      if (snapshot) {
        const changedFields = this._collectChangedDecodedFields(snapshot);
        if (changedFields) {
          this._commitEditBundleEdit(updateCommandDecodedFields(
            this.bundle,
            target.deviceId,
            target.commandId,
            changedFields
          ));
        }
        this._closeCommandPayloadDialog();
        return;
      }
      const normalized = normalizeCommandPayloadHex(this._payloadDialogRawDraft);
      if (!normalized) {
        this._payloadDialogError = "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).";
        return;
      }
      if (normalized !== normalizeCommandPayloadHex(this._payloadDialogRawSnapshot)) {
        this._commitEditBundleEdit(updateCommandRawPayload(
          this.bundle,
          target.deviceId,
          target.commandId,
          normalized
        ));
      }
      this._closeCommandPayloadDialog();
    };
    this._closeEditRenameDialog = () => {
      this._editRenameDialogOpen = false;
      this._editRenameDialogDraft = "";
      this._editRenameDialogError = "";
      this._editRenameDialogTarget = null;
    };
    // ── Delete (with cascade-aware confirm) ─────────────────────────────
    this._openDetailDeleteConfirm = () => {
      if (!this.kind || this.entityId == null) return;
      const id = Number(this.entityId);
      this._confirmDeleteTarget = this.kind === "activity" ? { kind: "activity", activityId: id } : { kind: "device", deviceId: id };
      this._confirmDeleteLabel = this._selectedEditTitle();
    };
    this._closeDeleteConfirm = () => {
      this._confirmDeleteTarget = null;
      this._confirmDeleteLabel = "";
    };
    this._confirmDelete = () => {
      const target = this._confirmDeleteTarget;
      if (!target || !this.bundle) return;
      if (this.mode === "live" && (target.kind === "activity" || target.kind === "device")) {
        const entityId = target.kind === "activity" ? target.activityId : target.deviceId;
        this._closeDeleteConfirm();
        this.dispatchEvent(new CustomEvent("delete-request", {
          detail: { kind: target.kind, entityId }
        }));
        return;
      }
      this._commitEditBundleEdit(applyBundleDelete(this.bundle, target));
      if (target.kind === "activity" || target.kind === "device") {
        this._requestClose();
      }
      this._closeDeleteConfirm();
    };
    // ── Add favorite (device → command picker) ──────────────────────────
    // One entry point for everything that can land on the remote screen:
    // a device command or a macro (existing or new). The kind selector
    // swaps the dialog's fields.
    this._openAddShortcutDialog = () => {
      if (this.entityId == null || !this.bundle) return;
      const devices = bundleEditableDeviceOptions(this.bundle);
      const firstDeviceId = devices[0]?.id ?? null;
      const commands = firstDeviceId != null ? deviceCommandItems(this.bundle, firstDeviceId) : [];
      this._addShortcutKind = "command";
      this._addFavoriteDeviceId = firstDeviceId;
      this._addFavoriteCommandId = commands[0]?.commandId ?? null;
      this._addFavoriteName = commands[0]?.label ?? "";
      this._addFavoriteError = "";
      this._addShortcutActionName = "";
      this._resetMacroTarget("shortcut");
      this._addFavoriteOpen = true;
    };
    this._closeAddFavoriteDialog = () => {
      this._addFavoriteOpen = false;
      this._addFavoriteDeviceId = null;
      this._addFavoriteCommandId = null;
      this._addFavoriteName = "";
      this._addFavoriteError = "";
      this._addShortcutKind = "command";
      this._addShortcutActionName = "";
      this._addShortcutMacroMode = "new";
      this._addShortcutMacroId = null;
    };
    this._handleAddFavoriteDeviceChange = (event) => {
      const value = Number(event.target.value);
      this._addFavoriteDeviceId = Number.isFinite(value) ? value : null;
      const commands = this._addFavoriteDeviceId != null && this.bundle ? deviceCommandItems(this.bundle, this._addFavoriteDeviceId) : [];
      this._addFavoriteCommandId = commands[0]?.commandId ?? null;
      this._addFavoriteName = commands[0]?.label ?? "";
      this._addFavoriteError = "";
    };
    this._handleAddFavoriteCommandChange = (event) => {
      const value = Number(event.target.value);
      this._addFavoriteCommandId = Number.isFinite(value) ? value : null;
      if (this.bundle && this._addFavoriteDeviceId != null && this._addFavoriteCommandId != null) {
        const command = deviceCommandItems(this.bundle, this._addFavoriteDeviceId).find((item) => item.commandId === this._addFavoriteCommandId);
        this._addFavoriteName = command?.label ?? "";
      }
      this._addFavoriteError = "";
    };
    this._handleAddFavoriteNameInput = (event) => {
      this._addFavoriteName = event.target.value;
    };
    this._applyAddFavorite = () => {
      if (!this.bundle || this.entityId == null) return;
      if (this._addFavoriteDeviceId == null || this._addFavoriteCommandId == null) {
        this._addFavoriteError = TOOLS_CARD_STRINGS.backup.addFavoriteNoCommands;
        return;
      }
      const name = sanitizeBundleName(this.bundle, this._addFavoriteName);
      this._commitEditBundleEdit(addBundleActivityFavorite(
        this.bundle,
        Number(this.entityId),
        this._addFavoriteDeviceId,
        this._addFavoriteCommandId,
        name
      ));
      this._closeAddFavoriteDialog();
    };
    this._applyAddShortcut = () => {
      if (!this.bundle || this.entityId == null) return;
      if (this._addShortcutKind === "command") {
        this._applyAddFavorite();
        return;
      }
      const activityId = Number(this.entityId);
      if (this._addShortcutMacroMode === "existing") {
        const existing = activityUserMacroSummaries(this.bundle, activityId).find((macro) => macro.buttonId === Number(this._addShortcutMacroId));
        if (!existing) {
          this._addFavoriteError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
          return;
        }
        this._closeAddFavoriteDialog();
        this._openMacroEditor("activity", activityId, existing.buttonId, existing.name);
        return;
      }
      const name = sanitizeBundleName(this.bundle, this._addShortcutActionName).trim() || TOOLS_CARD_STRINGS.backup.newMacroName;
      const next = addActivityUserMacro(this.bundle, activityId, name);
      this._commitEditBundleEdit(next);
      this._closeAddFavoriteDialog();
      const summaries = activityUserMacroSummaries(next, activityId);
      const created = summaries[summaries.length - 1];
      if (created) this._openMacroEditor("activity", activityId, created.buttonId, created.name);
    };
    this._applyEditRenameDialog = () => {
      const target = this._editRenameDialogTarget;
      if (!target || !this.bundle) return;
      if (target.kind === "device_ip") {
        const draft = this._editRenameDialogDraft.trim();
        if (draft && !IPV4_PATTERN.test(draft)) {
          this._editRenameDialogError = "Enter a dotted-decimal IPv4 address (e.g. 192.168.1.42), or clear the field to remove the IP.";
          return;
        }
        this._commitEditBundleEdit(updateBundleDeviceIp(this.bundle, target.deviceId, draft));
        this._closeEditRenameDialog();
        return;
      }
      const next = sanitizeBundleName(this.bundle, this._editRenameDialogDraft);
      if (!next) {
        this._editRenameDialogError = "Enter a name to continue.";
        return;
      }
      if (target.kind === "detail") {
        this._editDetailNameDraft = next;
        if (target.entityKind === "activity") this._applyActivityRename(target.entityId, next);
        else this._applyDeviceRename(target.entityId, next);
        this._closeEditRenameDialog();
        return;
      }
      if (target.kind === "hub_name") {
        this._commitEditBundleEdit(renameBundleHub(this.bundle, next));
        this._closeEditRenameDialog();
        return;
      }
      if (target.kind === "macro") {
        this._commitEditBundleEdit(renameBundleActivityMacro(this.bundle, target.activityId, target.buttonId, next));
        if (this._macroEditor && this._macroEditor.scope === "activity" && this._macroEditor.entityId === target.activityId && this._macroEditor.buttonId === target.buttonId) {
          this._macroEditor = { ...this._macroEditor, name: next };
        }
        this._closeEditRenameDialog();
        return;
      }
      if (target.kind === "command") {
        this._commitEditBundleEdit(
          renameBundleDeviceCommand(this.bundle, target.deviceId, target.commandId, next)
        );
        this._closeEditRenameDialog();
        return;
      }
      if (this.mode === "live") {
        this._closeEditRenameDialog();
        return;
      }
      this._commitEditBundleEdit(renameBundleActivityFavorite(this.bundle, target.activityId, target.buttonId, next));
      this._closeEditRenameDialog();
    };
    this._handleActivityQuickAccessSort = (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (!this.bundle || this.entityId == null) return;
      const sortableEvent = event;
      const oldIndex = Number(sortableEvent.detail?.oldIndex);
      const newIndex = Number(sortableEvent.detail?.newIndex);
      if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
      const items = activityQuickAccessItems(this.bundle, this.entityId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex >= items.length || newIndex >= items.length) return;
      const nextItems = [...items];
      const [moved] = nextItems.splice(oldIndex, 1);
      if (!moved) return;
      nextItems.splice(newIndex, 0, moved);
      this._commitEditBundleEdit(reorderBundleActivityQuickAccess(
        this.bundle,
        this.entityId,
        nextItems.map((item) => ({ kind: item.kind, buttonId: item.buttonId }))
      ));
    };
    this._closeBindingDialog = () => {
      this._bindingDialogOpen = false;
      this._bindingEditButtonId = null;
      this._bindingButtonId = null;
      this._bindingDeviceId = null;
      this._bindingCommandId = null;
      this._bindingLongPressEnabled = false;
      this._bindingLpDeviceId = null;
      this._bindingLpCommandId = null;
      this._bindingTargetKind = "command";
      this._bindingActionName = "";
      this._bindingMacroMode = "new";
      this._bindingMacroId = null;
      this._bindingLpTargetKind = "command";
      this._bindingLpMacroMode = "new";
      this._bindingLpMacroId = null;
      this._bindingLpActionName = "";
      this._bindingError = "";
    };
    this._handleBindingButtonChange = (event) => {
      const value = Number(event.target.value);
      this._bindingButtonId = Number.isFinite(value) ? value : null;
    };
    this._handleBindingDeviceChange = (event) => {
      const value = Number(event.target.value);
      this._bindingDeviceId = Number.isFinite(value) ? value : null;
      this._bindingCommandId = this._bindingCommandOptions(this._bindingDeviceId)[0]?.value ?? null;
    };
    this._handleBindingCommandChange = (event) => {
      const value = Number(event.target.value);
      this._bindingCommandId = Number.isFinite(value) ? value : null;
    };
    this._handleBindingTargetKindChange = (event) => {
      const kind = event.target.value;
      this._bindingTargetKind = kind;
      this._bindingError = "";
      if (kind === "command") {
        const devices = this._bindingCommandDeviceOptions();
        if (!devices.some((device) => device.value === this._bindingDeviceId)) {
          this._bindingDeviceId = devices[0]?.value ?? null;
        }
        this._bindingCommandId = this._bindingCommandOptions(this._bindingDeviceId)[0]?.value ?? null;
        return;
      }
      this._resetMacroTarget("binding");
      this._bindingActionName ||= this._macroName(this._bindingCommandId);
    };
    this._handleBindingActionNameInput = (event) => {
      this._bindingActionName = event.target.value;
      this._bindingError = "";
    };
    this._handleBindingMacroTargetChange = (event) => {
      const value = event.target.value;
      if (value === "__new__") {
        this._bindingMacroMode = "new";
        this._bindingMacroId = null;
      } else {
        this._bindingMacroMode = "existing";
        this._bindingMacroId = Number(value);
      }
      this._bindingError = "";
    };
    this._handleBindingLpTargetKindChange = (event) => {
      const kind = event.target.value;
      this._bindingLpTargetKind = kind;
      this._bindingError = "";
      if (kind === "command") {
        const devices = this._bindingCommandDeviceOptions();
        if (!devices.some((device) => device.value === this._bindingLpDeviceId)) {
          this._bindingLpDeviceId = devices[0]?.value ?? null;
        }
        this._bindingLpCommandId = this._bindingCommandOptions(this._bindingLpDeviceId)[0]?.value ?? null;
        return;
      }
      this._resetMacroTarget("bindingLp");
      this._bindingLpActionName ||= this._macroName(this._bindingLpCommandId);
    };
    this._handleBindingLpActionNameInput = (event) => {
      this._bindingLpActionName = event.target.value;
      this._bindingError = "";
    };
    this._handleBindingLpMacroTargetChange = (event) => {
      const value = event.target.value;
      if (value === "__new__") {
        this._bindingLpMacroMode = "new";
        this._bindingLpMacroId = null;
      } else {
        this._bindingLpMacroMode = "existing";
        this._bindingLpMacroId = Number(value);
      }
      this._bindingError = "";
    };
    this._handleBindingLongPressToggle = (event) => {
      const enabled = Boolean(event.target.checked);
      this._bindingLongPressEnabled = enabled;
      if (!enabled || !this.bundle) return;
      this._bindingLpTargetKind = "command";
      if (this._bindingScope === "activity") {
        const devices = this._bindingCommandDeviceOptions();
        if (!devices.some((device) => device.value === this._bindingLpDeviceId)) {
          this._bindingLpDeviceId = devices[0]?.value ?? null;
        }
      } else if (this._bindingLpDeviceId == null) {
        this._bindingLpDeviceId = Number(this.entityId);
      }
      const commands = this._bindingCommandOptions(this._bindingLpDeviceId);
      if (!commands.some((command) => command.value === this._bindingLpCommandId)) {
        this._bindingLpCommandId = commands[0]?.value ?? null;
      }
    };
    this._handleBindingLpDeviceChange = (event) => {
      const value = Number(event.target.value);
      this._bindingLpDeviceId = Number.isFinite(value) ? value : null;
      this._bindingLpCommandId = this._bindingCommandOptions(this._bindingLpDeviceId)[0]?.value ?? null;
    };
    this._handleBindingLpCommandChange = (event) => {
      const value = Number(event.target.value);
      this._bindingLpCommandId = Number.isFinite(value) ? value : null;
    };
    this._applyBinding = () => {
      if (!this.bundle || this.entityId == null) return;
      const buttonId = Number(this._bindingButtonId);
      const entityId = Number(this.entityId);
      if (!buttonId) {
        this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return;
      }
      if (this._bindingScope === "activity") {
        const activityId = entityId;
        let next = this.bundle;
        let macroToOpen = null;
        const longPressTarget = this._resolveActivityLongPressTarget(next, activityId);
        if (!longPressTarget) return;
        next = longPressTarget.bundle;
        macroToOpen = longPressTarget.createdMacro;
        const longPress = longPressTarget.longPress;
        if (this._bindingTargetKind === "command") {
          const commandId = Number(this._bindingCommandId);
          if (!commandId || !this._bindingDeviceId) {
            this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
            return;
          }
          this._commitEditBundleEdit(upsertActivityButtonBinding(next, activityId, {
            buttonId,
            deviceId: Number(this._bindingDeviceId),
            commandId,
            longPress
          }));
          this._closeBindingDialog();
          if (macroToOpen) this._openMacroEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
          return;
        }
        const resolved = this._resolveMacroTarget(
          next,
          activityId,
          this._bindingMacroMode,
          this._bindingMacroId,
          this._bindingActionName
        );
        if (!resolved) {
          this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
          return;
        }
        next = upsertActivityButtonBinding(resolved.bundle, activityId, {
          buttonId,
          deviceId: activityId,
          commandId: resolved.macroId,
          longPress
        });
        this._commitEditBundleEdit(next);
        this._closeBindingDialog();
        if (resolved.created) macroToOpen = { buttonId: resolved.macroId, name: resolved.name };
        if (macroToOpen) this._openMacroEditor("activity", activityId, macroToOpen.buttonId, macroToOpen.name);
      } else {
        const commandId = Number(this._bindingCommandId);
        if (!commandId) {
          this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
          return;
        }
        const longPressCommandId = this._bindingLongPressEnabled && this._bindingLpCommandId ? Number(this._bindingLpCommandId) : null;
        this._commitEditBundleEdit(upsertDeviceButtonBinding(this.bundle, entityId, {
          buttonId,
          commandId,
          longPressCommandId
        }));
        this._closeBindingDialog();
      }
    };
    this._closeMacroEditor = () => {
      this._macroEditor = null;
      this._closeStepDialog();
      if (this._bindingsView) this._restoreBindingsScroll();
      else this._restoreMainScroll();
    };
    // Rename the macro currently open in the step editor. Reuses the shared
    // rename dialog (kind "macro"); applying it also refreshes the editor's
    // own title via the macro branch in _applyEditRenameDialog.
    this._openMacroNameRenameDialog = () => {
      const editor = this._macroEditor;
      if (!editor || editor.scope !== "activity" || POWER_MACRO_BUTTON_IDS.has(editor.buttonId)) return;
      this._editRenameDialogTarget = { kind: "macro", activityId: editor.entityId, buttonId: editor.buttonId };
      this._editRenameDialogDraft = editor.name;
      this._editRenameDialogError = "";
      this._editRenameDialogOpen = true;
    };
    this._openAddStepDialog = () => {
      const editor = this._macroEditor;
      if (!editor || !this.bundle) return;
      this._stepDialogEditIndex = null;
      this._stepKind = "command";
      this._stepDeviceId = editor.scope === "activity" ? bundleEditableDeviceOptions(this.bundle)[0]?.id ?? null : editor.entityId;
      const commandDeviceId = editor.scope === "activity" ? this._stepDeviceId : editor.entityId;
      const commands = commandDeviceId != null ? deviceCommandItems(this.bundle, commandDeviceId) : [];
      this._stepCommandId = commands[0]?.commandId ?? null;
      this._stepHoldSeconds = "0";
      this._stepError = "";
      this._stepDialogOpen = true;
    };
    this._closeStepDialog = () => {
      this._stepDialogOpen = false;
      this._stepDialogEditIndex = null;
      this._stepKind = "command";
      this._stepDeviceId = null;
      this._stepCommandId = null;
      this._stepHoldSeconds = "0";
      this._stepError = "";
    };
    this._handleStepDeviceChange = (event) => {
      const value = Number(event.target.value);
      this._stepDeviceId = Number.isFinite(value) ? value : null;
      const commands = this._stepDeviceId != null && this.bundle ? deviceCommandItems(this.bundle, this._stepDeviceId) : [];
      this._stepCommandId = commands[0]?.commandId ?? null;
    };
    this._handleStepCommandChange = (event) => {
      const raw = event.target.value;
      this._stepCommandId = raw === "" ? null : Number(raw);
    };
    this._handleStepHoldInput = (event) => {
      this._stepHoldSeconds = event.target.value;
    };
    // Snap the dialog's hold field to the 0.5s grid when the user commits it
    // (on blur / Enter), so the field can't keep an off-grid value like 0.3.
    this._handleStepHoldChange = (event) => {
      this._stepHoldSeconds = this._snapHalfSeconds(event.target.value);
    };
    // Inline per-row wait edit: the attached delay travels with its command.
    this._handleStepWaitChange = (item, event) => {
      const editor = this._macroEditor;
      if (!editor || !this.bundle) return;
      const input = event.target;
      const waitByte = this._secondsToByte(input.value);
      input.value = this._byteToSeconds(waitByte);
      const next = editor.scope === "device" ? setDeviceMacroStepWait(this.bundle, editor.entityId, editor.buttonId, item.index, waitByte) : setActivityMacroStepWait(this.bundle, editor.entityId, editor.buttonId, item.index, waitByte);
      this._commitEditBundleEdit(next);
    };
    this._applyStep = () => {
      const editor = this._macroEditor;
      if (!editor || !this.bundle) return;
      const timeByte = this._secondsToByte(this._stepHoldSeconds);
      const editIndex = this._stepDialogEditIndex;
      const isDevice = editor.scope === "device";
      if (this._stepKind === "input") {
        const deviceId2 = Number(this._stepDeviceId);
        if (deviceId2 > 0) {
          const next2 = this._stepCommandId == null ? clearActivityDeviceInput(this.bundle, editor.entityId, deviceId2) : setActivityDeviceInput(this.bundle, editor.entityId, deviceId2, Number(this._stepCommandId));
          this._commitEditBundleEdit(next2);
        }
        this._closeStepDialog();
        return;
      }
      const commandId = Number(this._stepCommandId);
      if (!commandId || !isDevice && !this._stepDeviceId) {
        this._stepError = TOOLS_CARD_STRINGS.backup.stepNoCommands;
        return;
      }
      const deviceId = Number(this._stepDeviceId);
      let next;
      if (editIndex === null) {
        next = isDevice ? addDeviceMacroCommandStep(this.bundle, editor.entityId, editor.buttonId, commandId, timeByte) : addActivityMacroCommandStep(this.bundle, editor.entityId, editor.buttonId, deviceId, commandId, timeByte);
      } else {
        next = isDevice ? updateDeviceMacroStep(this.bundle, editor.entityId, editor.buttonId, editIndex, { commandId, hold: timeByte }) : updateActivityMacroStep(this.bundle, editor.entityId, editor.buttonId, editIndex, { deviceId, commandId, hold: timeByte });
      }
      this._commitEditBundleEdit(next);
      this._closeStepDialog();
    };
    this._handleStepReorder = (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
      const editor = this._macroEditor;
      if (!editor || !this.bundle) return;
      const sortableEvent = event;
      const oldIndex = Number(sortableEvent.detail?.oldIndex);
      const newIndex = Number(sortableEvent.detail?.newIndex);
      const items = this._currentMacroStepItems();
      if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
      if (oldIndex < 0 || newIndex < 0 || oldIndex >= items.length || newIndex >= items.length) return;
      const order = items.map((_2, index) => index);
      const [moved] = order.splice(oldIndex, 1);
      order.splice(newIndex, 0, moved);
      const next = editor.scope === "device" ? reorderDeviceMacroSteps(this.bundle, editor.entityId, editor.buttonId, order) : reorderActivityMacroSteps(this.bundle, editor.entityId, editor.buttonId, order);
      this._commitEditBundleEdit(next);
    };
    this._togglePowerControlMenu = () => {
      this._powerControlMenuOpen = !this._powerControlMenuOpen;
    };
  }
  static {
    this.properties = {
      bundle: { attribute: false },
      kind: { attribute: false },
      entityId: { attribute: false },
      dirty: { type: Boolean },
      mode: { type: String },
      _editDetailActiveSection: { state: true },
      _editDetailNameDraft: { state: true },
      _editRenameDialogOpen: { state: true },
      _editRenameDialogDraft: { state: true },
      _editRenameDialogError: { state: true },
      _editRenameDialogTarget: { state: true },
      _payloadDialogOpen: { state: true },
      _payloadDialogTarget: { state: true },
      _payloadDialogDecodedDrafts: { state: true },
      _payloadDialogDecodedSnapshot: { state: true },
      _payloadDialogRawDraft: { state: true },
      _payloadDialogError: { state: true },
      fetchCommandPayload: { attribute: false },
      testCommandPayload: { attribute: false },
      _payloadFetchingCommandId: { state: true },
      _payloadFetchError: { state: true },
      _payloadDialogTestStatus: { state: true },
      _payloadDialogTestError: { state: true },
      _payloadDialogAddMode: { state: true },
      _payloadDialogNameDraft: { state: true },
      _addCommandPreparing: { state: true },
      _confirmDeleteTarget: { state: true },
      _confirmDeleteLabel: { state: true },
      _addFavoriteOpen: { state: true },
      _addFavoriteDeviceId: { state: true },
      _addFavoriteCommandId: { state: true },
      _addFavoriteName: { state: true },
      _addFavoriteError: { state: true },
      _bindingDialogOpen: { state: true },
      _bindingScope: { state: true },
      _bindingEditButtonId: { state: true },
      _bindingButtonId: { state: true },
      _bindingDeviceId: { state: true },
      _bindingCommandId: { state: true },
      _bindingLongPressEnabled: { state: true },
      _bindingLpDeviceId: { state: true },
      _bindingLpCommandId: { state: true },
      _bindingTargetKind: { state: true },
      _bindingActionName: { state: true },
      _bindingMacroMode: { state: true },
      _bindingMacroId: { state: true },
      _bindingLpTargetKind: { state: true },
      _bindingLpMacroMode: { state: true },
      _bindingLpMacroId: { state: true },
      _bindingLpActionName: { state: true },
      _bindingError: { state: true },
      _macroEditor: { state: true },
      _stepDialogOpen: { state: true },
      _stepDialogEditIndex: { state: true },
      _stepKind: { state: true },
      _stepDeviceId: { state: true },
      _stepCommandId: { state: true },
      _stepHoldSeconds: { state: true },
      _stepError: { state: true },
      _haSortableReady: { state: true },
      _powerControlMenuOpen: { state: true },
      _roleMenuOpen: { state: true },
      _roleConfirm: { state: true },
      _bindingsView: { state: true },
      _addShortcutKind: { state: true },
      _addShortcutActionName: { state: true },
      _addShortcutMacroMode: { state: true },
      _addShortcutMacroId: { state: true }
    };
  }
  static {
    // The whole backup-tab stylesheet ships to both shadow roots (see
    // backup-tab-styles.ts); the :host rule it carries gives this element
    // the same flex-fill layout the tab-panel had inside backup-tab.
    this.styles = [activityEditorStyles, backupTabStyles, i`
    :host {
      flex-direction: column;
    }
    /* Live-mode header Sync button — styled identically to the Wifi command
       editor's .detail-sync-btn (primary when there are pending changes, a
       green "up to date" disabled state when clean). */
    .detail-sync-btn {
      border: 1px solid var(--divider-color);
      border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    .detail-sync-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .detail-sync-btn.sync-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .detail-sync-btn:disabled {
      cursor: default;
      opacity: 0.42;
      color: var(--disabled-text-color, var(--secondary-text-color));
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .detail-sync-btn:disabled:hover { border-color: color-mix(in srgb, var(--divider-color) 88%, transparent); }
    .detail-sync-btn.detail-sync-btn--state-ok,
    .detail-sync-btn.detail-sync-btn--state-ok:disabled {
      border-color: color-mix(in srgb, #48b851 45%, var(--divider-color));
      background: color-mix(in srgb, #48b851 14%, var(--ha-card-background, var(--card-background-color)));
      color: #2e7d32;
      opacity: 1;
    }
    /* Spinner used on the live "fetch payload" command-row button. */
    @keyframes sb-spin { to { transform: rotate(360deg); } }
    ha-icon.sb-spin { animation: sb-spin 720ms linear infinite; }
    /* Inline status line (fetch error + in-dialog Test result). */
    .section-status {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      padding: 8px 12px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 10px);
      font-size: 13px;
      line-height: 1.4;
      color: var(--secondary-text-color);
    }
    .section-status ha-icon { --mdc-icon-size: 18px; flex: 0 0 auto; }
    .section-status.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 30%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .payload-test-status.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 30%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 6%, var(--ha-card-background, var(--card-background-color)));
    }
    .payload-test-btn { display: inline-flex; align-items: center; gap: 6px; margin-right: auto; }
    .payload-test-btn ha-icon { --mdc-icon-size: 16px; }
    /* Device-class indicator in the payload dialog header. */
    .dialog-title-group { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
    .dialog-title-group .dialog-title { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .payload-class-badge {
      flex: 0 0 auto;
      font-family: var(--code-font-family, ui-monospace, SFMono-Regular, Menlo, monospace);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      padding: 2px 9px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--primary-color) 40%, var(--divider-color));
      color: var(--primary-text-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
  `];
  }
  connectedCallback() {
    super.connectedCallback();
    if (!this._haSortableReady) {
      void customElements.whenDefined("ha-sortable").then(() => {
        this._haSortableReady = true;
      });
    }
  }
  // Lit reuses the element instance when the host re-renders with a
  // different entity, so all transient view state must reset exactly the
  // way backup-tab's _openEditDetail/_closeEditDetail pair used to.
  willUpdate(changed) {
    if (changed.has("kind") || changed.has("entityId")) {
      this._resetForEntity();
    }
  }
  _resetForEntity() {
    this._editDetailActiveSection = "power";
    this._powerControlMenuOpen = false;
    this._roleMenuOpen = null;
    this._roleMenuAnchor = null;
    this._roleConfirm = null;
    this._bindingsView = false;
    this._editDetailNameDraft = sanitizeBundleName(this.bundle, this._selectedEditTitle());
    this._closeEditRenameDialog();
    this._closeCommandPayloadDialog();
    this._payloadFetchingCommandId = null;
    this._payloadFetchError = "";
    this._addCommandPreparing = false;
    this._closeDeleteConfirm();
    this._closeAddFavoriteDialog();
    this._closeBindingDialog();
    this._macroEditor = null;
    this._closeStepDialog();
  }
  /**
   * Commit a mutated bundle from any edit handler. The element updates its
   * own prop synchronously (handlers read the fresh bundle in the same
   * tick), then hands the result to the host, which owns dirty/persistence
   * semantics.
   */
  _commitEditBundleEdit(next) {
    this.bundle = next;
    this.dispatchEvent(new CustomEvent("bundle-change", { detail: { bundle: this.bundle } }));
  }
  _renderDirtyChip() {
    if (this.mode === "live" || !this.dirty) return A;
    return T`<span class="edit-unsaved-chip" title="You have unsaved changes. Download the backup to save them.">Unsaved</span>`;
  }
  _renderLiveSyncButton() {
    const S4 = TOOLS_CARD_STRINGS.activities;
    const dirty = this.dirty;
    const label = dirty ? S4.syncToHub : S4.syncUpToDate;
    const classes = `detail-sync-btn${dirty ? " sync-btn-primary" : " detail-sync-btn--state-ok"}`;
    return T`<button class=${classes} ?disabled=${!dirty} @click=${dirty ? this._requestSync : null}>${label}</button>`;
  }
  // Rename (pencil) + delete (trash) header buttons — shared by live and
  // backup mode so both editors expose the identical affordance. In live
  // mode rename rides the normal Sync (a bundle mutation → dirty → Sync);
  // delete executes immediately on the hub through the host (see
  // _confirmDelete).
  _renderDetailRenameDeleteButtons(kind) {
    return T`
      <button class="icon-btn" @click=${this._openDetailRenameDialog} aria-label=${`Rename ${kind}`}>
        <ha-icon icon="mdi:pencil"></ha-icon>
      </button>
      <button
        class="icon-btn icon-btn--danger"
        @click=${this._openDetailDeleteConfirm}
        aria-label=${kind === "activity" ? TOOLS_CARD_STRINGS.backup.deleteActivityAria : TOOLS_CARD_STRINGS.backup.deleteDeviceAria}
      >
        <ha-icon icon="mdi:trash-can-outline"></ha-icon>
      </button>
    `;
  }
  render() {
    if (!this.bundle || this.entityId == null) return A;
    if (this._macroEditor) {
      return this._renderMacroStepEditorView(this._macroEditor);
    }
    if (this._bindingsView && this.kind === "activity") {
      return this._renderActivityBindingsView();
    }
    const title = this._selectedEditTitle();
    if (!title) return A;
    return this._renderEditDetailView({ kind: this.kind, title });
  }
  _renderEditDetailView(params) {
    const sectionItems = this._editDetailSectionItems(params.kind);
    const activityQuickAccess = params.kind === "activity" && this.entityId != null ? activityQuickAccessItems(this.bundle, this.entityId) : [];
    const deviceCommands = params.kind === "device" && this.entityId != null ? deviceCommandItems(this.bundle, this.entityId) : [];
    return T`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._requestClose}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this._renderDetailCrumbs([
      { label: this._entityKindCrumbLabel(params.kind), onClick: this._requestClose }
    ])}
                  <div class="detail-title">${params.title}</div>
                </div>
                ${this._renderDirtyChip()}
                <div class="detail-title-actions">
                  ${this._renderDetailRenameDeleteButtons(params.kind)}
                  ${this.mode === "live" ? this._renderLiveSyncButton() : A}
                </div>
              </div>
            </div>
            ${this._renderEditDetailSectionNav(sectionItems)}
          </div>
          <div class="detail-scroll" @scroll=${this._handleEditDetailScroll}>
            ${params.kind === "activity" ? T`
                  ${this._renderPowerSetupSection("activity", Number(this.entityId))}
                  ${this._renderButtonBindingsSection("activity")}
                  ${this._renderActivityQuickAccessSection(activityQuickAccess)}
                ` : T`
                  ${this._renderPowerSetupSection("device", Number(this.entityId))}
                  ${this._renderDeviceNetworkSection()}
                  ${this._renderDeviceCommandsSection(deviceCommands)}
                  ${this._renderButtonBindingsSection("device")}
                `}
          </div>
        </div>
        ${this._renderEditRenameDialog()}
        ${this._renderCommandPayloadDialog()}
        ${this._renderDeleteConfirmDialog()}
        ${this._renderAddFavoriteDialog()}
        ${this._renderBindingDialog()}
        ${this._renderRoleConfirmDialog()}
      </div>
    `;
  }
  _editDetailSectionItems(kind) {
    if (kind === "activity") {
      return [];
    }
    const hasNetworkSection = this.entityId != null && this.bundle ? IP_HEAD_DEVICE_CLASSES.has(bundleDeviceClass(this.bundle, Number(this.entityId)) ?? "") : false;
    return [
      { id: "power", icon: "mdi:power-plug-outline", label: "Power" },
      ...hasNetworkSection ? [{ id: "network", icon: "mdi:lan-connect", label: "Network" }] : [],
      { id: "commands", icon: "mdi:format-list-bulleted", label: "Commands" },
      { id: "bindings", icon: "mdi:gesture-tap-button", label: "Buttons" }
    ];
  }
  _renderEditDetailSectionNav(items) {
    if (items.length <= 1) return A;
    const activeId = items.some((item) => item.id === this._editDetailActiveSection) ? this._editDetailActiveSection : items[0].id;
    return T`
      <div class="detail-section-nav" role="tablist" aria-label="Detail sections">
        ${items.map((item) => T`
          <button
            class=${`detail-section-nav-btn${item.id === activeId ? " active" : ""}`}
            type="button"
            role="tab"
            aria-selected=${item.id === activeId ? "true" : "false"}
            @click=${() => this._scrollEditDetailSection(item.id)}
          >
            <ha-icon icon=${item.icon}></ha-icon>
            <span class="detail-section-nav-label">${item.label}</span>
          </button>
        `)}
      </div>
    `;
  }
  _scrollEditDetailSection(sectionId) {
    const scrollEl = this.renderRoot.querySelector(".detail-scroll");
    const sectionEl = scrollEl?.querySelector(`[data-edit-section="${sectionId}"]`);
    if (!scrollEl || !sectionEl) return;
    const targetTop = sectionEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop;
    scrollEl.scrollTop = Math.max(0, targetTop);
    this._editDetailActiveSection = sectionId;
  }
  _renderBindingsListBody(kind) {
    if (this.entityId == null || !this.bundle) return A;
    const entityId = Number(this.entityId);
    const items = kind === "activity" ? activityButtonBindingItems(this.bundle, entityId) : deviceButtonBindingItems(this.bundle, entityId);
    if (!items.length) {
      return T`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.buttonBindingsEmpty}</div>`;
    }
    return T`
      <div class="quick-access-list">
        <div class="quick-access-sortable-container">
          ${items.map((item) => this._renderButtonBindingRow(item, kind))}
        </div>
      </div>
    `;
  }
  _renderAddBindingButton(kind) {
    if (this.entityId == null || !this.bundle) return A;
    const entityId = Number(this.entityId);
    const unbound = kind === "activity" ? unboundButtonsForActivity(this.bundle, entityId) : unboundButtonsForDevice(this.bundle, entityId);
    return T`
      <button
        class="quick-access-add-btn"
        @click=${() => this._openAddBindingDialog(kind)}
        ?disabled=${unbound.length === 0}
      >
        <ha-icon icon="mdi:plus"></ha-icon>
        <span>${TOOLS_CARD_STRINGS.backup.addBinding}</span>
      </button>
    `;
  }
  _renderButtonBindingsSection(kind) {
    if (this.entityId == null || !this.bundle) return A;
    const S4 = TOOLS_CARD_STRINGS.backup;
    const isActivity = kind === "activity";
    return T`
      <div class="quick-access-section" data-edit-section="bindings">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">
              ${isActivity ? S4.activityRunningTitle : S4.buttonBindingsTitle}
            </div>
            <div class="quick-access-sub">
              ${isActivity ? S4.activityRunningSub : S4.buttonBindingsDeviceSub}
            </div>
          </div>
          ${isActivity ? A : this._renderAddBindingButton(kind)}
        </div>
        ${isActivity ? this._renderActivityRolesBlock() : this._renderBindingsListBody(kind)}
      </div>
    `;
  }
  // Sub-view for per-button customization — same navigation pattern as
  // the step editor (breadcrumbs + back), never an inline accordion.
  _renderActivityBindingsView() {
    const S4 = TOOLS_CARD_STRINGS.backup;
    return T`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._closeBindingsView}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this._renderDetailCrumbs([
      { label: this._entityKindCrumbLabel("activity"), onClick: this._requestClose },
      { label: this._selectedEditTitle(), onClick: this._closeBindingsView }
    ])}
                  <div class="detail-title">${S4.bindingsViewTitle}</div>
                </div>
                ${this._renderDirtyChip()}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main">
                  <div class="quick-access-title">${S4.buttonBindingsTitle}</div>
                  <div class="quick-access-sub">${S4.buttonBindingsActivitySub}</div>
                </div>
                ${this._renderAddBindingButton("activity")}
              </div>
              ${this._renderBindingsListBody("activity")}
            </div>
          </div>
        </div>
        ${this._renderBindingDialog()}
        ${this._renderDeleteConfirmDialog()}
      </div>
    `;
  }
  // ── Role-based button assignment (activity) ──────────────────────────
  _renderActivityRolesBlock() {
    if (this.entityId == null || !this.bundle) return A;
    const bundle = this.bundle;
    const activityId = Number(this.entityId);
    const deviceOptions = bundleEditableDeviceOptions(bundle).map((device) => ({
      deviceId: device.id,
      label: device.label
    }));
    const S4 = TOOLS_CARD_STRINGS.backup;
    const bindingCount = activityButtonBindingItems(bundle, activityId).length;
    return renderActivityRolesBlock({
      roles: activityRoleAssignments(bundle, activityId),
      optionsFor: (group) => deviceOptions.map((option) => ({
        ...option,
        mappable: roleMappableButtonCount(bundle, option.deviceId, group)
      })),
      openGroup: this._roleMenuOpen,
      menuAnchor: this._roleMenuAnchor,
      onToggleMenu: (group, anchor) => {
        this._roleMenuAnchor = group == null ? null : anchor ?? null;
        this._roleMenuOpen = group;
      },
      onAssign: this._handleRoleAssign,
      customize: {
        label: S4.customizeButtonsToggle,
        meta: bindingCount > 0 ? S4.bindingsConfiguredCount(bindingCount) : S4.bindingsNoneConfigured,
        onOpen: () => {
          this._captureCurrentScrollPosition();
          this._bindingsView = true;
        }
      }
    });
  }
  _applyRoleAssign(group, deviceId) {
    if (!this.bundle || this.entityId == null) return;
    this._commitEditBundleEdit(
      setActivityRoleDevice(this.bundle, Number(this.entityId), group, deviceId)
    );
  }
  _renderRoleConfirmDialog() {
    if (!this._roleConfirm) return A;
    const S4 = TOOLS_CARD_STRINGS.backup;
    return T`
      <div class="modal-backdrop" @click=${this._closeRoleConfirm}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S4.roleConfirmTitle}</div>
            <button class="dialog-close" @click=${this._closeRoleConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="backup-drawer-sub">${S4.roleConfirmBody}</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeRoleConfirm}>${S4.roleConfirmCancel}</button>
              <button class="dialog-btn dialog-btn-danger" @click=${this._confirmRoleAssign}>${S4.roleConfirmReplace}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderButtonBindingRow(item, kind) {
    return T`
      <div class="quick-access-sortable-item" data-kind="binding" data-button-id=${item.buttonId}>
        <div class="quick-access-row quick-access-row--no-drag">
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.buttonName}</div>
              <div class="quick-access-chip">button</div>
            </div>
            <div class="quick-access-meta">${item.shortPressLabel}</div>
            ${item.longPress ? T`<div class="quick-access-meta">${TOOLS_CARD_STRINGS.backup.bindingLongPressMeta(item.longPress.label)}</div>` : A}
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._openEditBindingDialog(kind, item.buttonId)}
              aria-label="Edit binding"
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
            <button
              class="icon-btn icon-btn--danger"
              @click=${() => this._openBindingDeleteConfirm(kind, item.buttonId, item.buttonName)}
              aria-label=${TOOLS_CARD_STRINGS.backup.deleteBindingAria}
            >
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  /**
   * "Network" section shown above Commands in the Device detail view
   * for hue / roku / sonos devices, where the IP address lives on the
   * device head and the hub uses it to build Host headers / addressing
   * at replay time. wifi_ip devices are deliberately excluded — their
   * IP lives inside each command blob and is edited per-command via
   * the structured-payload form.
   */
  _renderDeviceNetworkSection() {
    if (this.entityId == null || !this.bundle) return A;
    const deviceId = Number(this.entityId);
    const deviceClass = bundleDeviceClass(this.bundle, deviceId) ?? "";
    if (!IP_HEAD_DEVICE_CLASSES.has(deviceClass)) return A;
    const ip = deviceIpAddress(this.bundle, deviceId);
    return T`
      <div class="quick-access-section" data-edit-section="network">
        <div class="quick-access-head">
          <div class="quick-access-title">Network</div>
          <div class="quick-access-sub">
            The device's IP address lives in the device record. The hub uses it to address the device at replay time (Host header for Hue / Sonos, base URL for Roku).
          </div>
        </div>
        <div class="quick-access-list">
          <div class="quick-access-sortable-container">
            <div class="quick-access-sortable-item">
              <div class="quick-access-row quick-access-row--no-drag">
                <div class="quick-access-main">
                  <div class="quick-access-label-row">
                    <div class="quick-access-label">${ip ?? "(not set)"}</div>
                    <div class="quick-access-chip">ip</div>
                  </div>
                  <div class="quick-access-meta">IPv4 dotted-decimal address</div>
                </div>
                <div class="quick-access-actions">
                  <button
                    class="icon-btn"
                    @click=${() => this._openDeviceIpRenameDialog(deviceId)}
                    aria-label="Edit IP address"
                  >
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderDeviceCommandsSection(items) {
    if (this.entityId == null) return A;
    return T`
      <div class="quick-access-section" data-edit-section="commands">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">Commands</div>
            <div class="quick-access-sub">
              ${this.mode === "live" ? "Use the pencil to rename a command and the braces to fetch its payload from the hub and edit it. Deleting commands stays in Backup \u2192 Edit." : "Use the pencil to rename a command (names update everywhere it is referenced) and the braces to edit its payload."}
            </div>
          </div>
          ${this.mode === "live" ? T`
                <div class="quick-access-head-actions">
                  <button
                    class="quick-access-add-btn"
                    ?disabled=${this._addCommandPreparing}
                    @click=${() => void this._openAddCommandDialog()}
                  >
                    <ha-icon
                      icon=${this._addCommandPreparing ? "mdi:loading" : "mdi:plus"}
                      class=${this._addCommandPreparing ? "sb-spin" : ""}
                    ></ha-icon>
                    <span>Add command</span>
                  </button>
                </div>
              ` : A}
        </div>
        ${this._payloadFetchError ? T`
              <div class="section-status error" role="alert">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${this._payloadFetchError}</span>
              </div>
            ` : A}
        ${items.length ? T`
              <div class="quick-access-list">
                <div class="quick-access-sortable-container">
                  ${items.map((item) => this._renderDeviceCommandRow(item))}
                </div>
              </div>
            ` : T`<div class="quick-access-empty">This Device does not currently have any commands.</div>`}
      </div>
    `;
  }
  _renderDeviceCommandRow(item) {
    const pendingAdd = this._commandIsPendingAdd(item.commandId);
    return T`
      <div class="quick-access-sortable-item" data-kind="command" data-command-id=${item.commandId}>
        <div class="quick-access-row quick-access-row--no-drag">
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${pendingAdd ? "new command" : "command"}</div>
            </div>
            <div class="quick-access-meta">
              Command ID ${item.commandId}
            </div>
          </div>
          <div class="quick-access-actions">
            <button
              class="icon-btn"
              @click=${() => this._openDeviceCommandRenameDialog(item.commandId)}
              aria-label="Rename command"
            >
              <ha-icon icon="mdi:pencil"></ha-icon>
            </button>
            ${this.mode !== "live" && this._commandHasEditablePayload(item.commandId) ? T`
                  <button
                    class="icon-btn"
                    @click=${() => this._openCommandPayloadDialog(item.commandId)}
                    aria-label="Edit payload"
                    title="Edit payload"
                  >
                    <ha-icon icon="mdi:code-braces"></ha-icon>
                  </button>
                ` : A}
            ${this.mode === "live" && !pendingAdd ? T`
                  <button
                    class="icon-btn"
                    @click=${() => void this._liveFetchAndOpenPayload(item.commandId)}
                    ?disabled=${this._payloadFetchingCommandId != null}
                    aria-label="Edit payload"
                    title="Fetch and edit this command's payload"
                  >
                    <ha-icon
                      icon=${this._payloadFetchingCommandId === item.commandId ? "mdi:loading" : "mdi:code-braces"}
                      class=${this._payloadFetchingCommandId === item.commandId ? "sb-spin" : ""}
                    ></ha-icon>
                  </button>
                ` : A}
            ${this.mode === "live" ? A : T`
                  <button
                    class="icon-btn icon-btn--danger"
                    @click=${() => this._openCommandDeleteConfirm(item.commandId, item.label)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.deleteCommandAria}
                  >
                    <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                  </button>
                `}
          </div>
        </div>
      </div>
    `;
  }
  _renderActivityQuickAccessSection(items) {
    if (this.entityId == null) return A;
    const rows = items.map((item) => this._renderActivityQuickAccessRow(item));
    return T`
      <div class="quick-access-section" data-edit-section="quick_access">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">${TOOLS_CARD_STRINGS.backup.activityShortcutsTitle}</div>
            <div class="quick-access-sub">
              ${this._haSortableReady ? TOOLS_CARD_STRINGS.backup.activityShortcutsSubSortable : TOOLS_CARD_STRINGS.backup.activityShortcutsSubStatic}
            </div>
          </div>
          <div class="quick-access-head-actions">
            <button class="quick-access-add-btn" @click=${this._openAddShortcutDialog}>
              <ha-icon icon="mdi:plus"></ha-icon>
              <span>${TOOLS_CARD_STRINGS.backup.addShortcutButton}</span>
            </button>
          </div>
        </div>
        ${items.length ? T`
              <div class="quick-access-list">
                ${this._haSortableReady ? T`
                      <ha-sortable
                        class="quick-access-sortable"
                        draggable-selector=".quick-access-sortable-item"
                        handle-selector=".quick-access-drag"
                        animation="180"
                        @item-moved=${this._handleActivityQuickAccessSort}
                      >
                        <div class="quick-access-sortable-container">
                          ${rows}
                        </div>
                      </ha-sortable>
                    ` : rows}
              </div>
            ` : T`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.activityShortcutsEmpty}</div>`}
      </div>
    `;
  }
  // Narrative meta line: a custom action shows its step count; a command
  // shortcut shows which device it plays on. Slot ids are storage detail.
  _quickAccessRowMeta(item) {
    if (item.kind === "macro") {
      const summary = this.entityId != null ? activityUserMacroSummaries(this.bundle, Number(this.entityId)).find((macro) => macro.buttonId === item.buttonId) : void 0;
      return TOOLS_CARD_STRINGS.backup.macroStepsCount(summary?.commandStepCount ?? 0);
    }
    const device = (this.bundle?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(item.deviceId || 0));
    return String(device?.device?.name || "").trim() || `Device ${item.deviceId ?? "?"}`;
  }
  _renderActivityQuickAccessRow(item) {
    return T`
      <div class="quick-access-sortable-item" data-kind=${item.kind} data-button-id=${item.buttonId}>
        <div class="quick-access-row">
          <div class="quick-access-drag" aria-hidden="true">
            <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
          </div>
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">
                ${item.kind === "macro" ? TOOLS_CARD_STRINGS.backup.shortcutChipAction : TOOLS_CARD_STRINGS.backup.shortcutChipCommand}
              </div>
            </div>
            <div class="quick-access-meta">${this._quickAccessRowMeta(item)}</div>
          </div>
          <div class="quick-access-actions">
            ${this._haSortableReady ? A : T`
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, -1)}
                aria-label="Move up"
              >
                <ha-icon icon="mdi:chevron-up"></ha-icon>
              </button>
              <button
                class="icon-btn"
                @click=${() => this._moveQuickAccessByIdentity(item.kind, item.buttonId, 1)}
                aria-label="Move down"
              >
                <ha-icon icon="mdi:chevron-down"></ha-icon>
              </button>
            `}
            ${item.kind === "macro" ? T`
                  <button
                    class="icon-btn"
                    @click=${() => this._openMacroEditor("activity", Number(this.entityId), item.buttonId, item.label)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.editStepsAria}
                  >
                    <ha-icon icon="mdi:playlist-edit"></ha-icon>
                  </button>
                ` : A}
            ${this.mode === "live" && item.kind === "favorite" ? A : T`
                  <button
                    class="icon-btn"
                    @click=${() => this._openQuickAccessRenameDialog(item.kind, item.buttonId)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.shortcutRenameAria(item.kind)}
                  >
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                `}
            <button
              class="icon-btn icon-btn--danger"
              @click=${() => this._openQuickAccessDeleteConfirm(item.kind, item.buttonId, item.label)}
              aria-label=${TOOLS_CARD_STRINGS.backup.shortcutDeleteAria(item.kind)}
            >
              <ha-icon icon="mdi:trash-can-outline"></ha-icon>
            </button>
          </div>
        </div>
      </div>
    `;
  }
  _renderEditRenameDialog() {
    if (!this._editRenameDialogOpen || !this._editRenameDialogTarget) return A;
    const label = this._editRenameDialogLabel();
    return T`
      <div class="modal-backdrop" @click=${this._closeEditRenameDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${label}</div>
            <button class="dialog-close" @click=${this._closeEditRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${useLegacyTextField() ? T`
                  <ha-textfield
                    id="sb-backup-edit-name"
                    .label=${this._editRenameFieldLabel()}
                    .maxLength=${this._editRenameFieldMaxLength()}
                    .value=${this._editRenameDialogDraft}
                    @input=${this._handleEditRenameDialogInput}
                    @change=${this._handleEditRenameDialogInput}
                    @keydown=${(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._applyEditRenameDialog();
      }
    }}
                  ></ha-textfield>
                ` : T`
                  <ha-input
                    id="sb-backup-edit-name"
                    type="text"
                    .label=${this._editRenameFieldLabel()}
                    .maxlength=${this._editRenameFieldMaxLength()}
                    .value=${this._editRenameDialogDraft}
                    @input=${this._handleEditRenameDialogInput}
                    @change=${this._handleEditRenameDialogInput}
                    @keydown=${(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._applyEditRenameDialog();
      }
    }}
                  ></ha-input>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._editRenameDialogError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeEditRenameDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyEditRenameDialog}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  /**
   * The payload popup: structured per-class form when the command has a
   * decoded block, raw hex replacement otherwise. Every command with a
   * captured payload (`restore_data.data_hex`) is editable — classes
   * without a parser just get the raw bytes.
   */
  _renderCommandPayloadDialog() {
    if (!this._payloadDialogOpen || !this._payloadDialogTarget) return A;
    const decoded = this._payloadDialogDecodedSnapshot;
    const deviceClass = String(
      bundleDeviceClass(this.bundle, this._payloadDialogTarget.deviceId) || ""
    ).trim();
    return T`
      <div class="modal-backdrop" @click=${this._closeCommandPayloadDialog}>
        <div class="dialog medium" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title-group">
              <div class="dialog-title">${this._payloadDialogAddMode ? "Add Command" : "Edit Payload"}</div>
              ${deviceClass ? T`<span class="payload-class-badge" title="Device class">${deviceClass}</span>` : A}
            </div>
            <button class="dialog-close" @click=${this._closeCommandPayloadDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._payloadDialogAddMode ? T`
                  <label class="decoded-field">
                    <span class="decoded-field-label">Name</span>
                    <input
                      class="decoded-field-input"
                      type="text"
                      maxlength="20"
                      spellcheck="false"
                      .value=${this._payloadDialogNameDraft}
                      @input=${this._handleAddCommandNameInput}
                      @change=${this._handleAddCommandNameInput}
                    />
                    <span class="decoded-field-helper">Shown on the remote and in every command picker.</span>
                  </label>
                ` : A}
            ${decoded ? this._renderDecodedPayloadForm(decoded.className) : this._renderRawPayloadForm()}
            ${this._liveDeviceIsIr() ? T`
                  <div class="payload-test-note">
                    <ha-icon icon="mdi:flash-outline"></ha-icon>
                    <span>
                      ${this.mode === "live" ? T`Verify a changed payload before saving: <strong>Test</strong> plays the current bytes on the hub without saving. Save folds the payload into the device's next Sync.` : T`Verify a changed payload before trusting it: <strong>Test</strong> plays the bytes on the hub without saving. Save here only once the payload does what you expect.`}
                    </span>
                  </div>
                ` : A}
            ${this._payloadDialogTestStatus !== "idle" ? T`
                  <div class="section-status payload-test-status ${this._payloadDialogTestStatus}" role="status" aria-live="polite">
                    <ha-icon icon=${this._payloadDialogTestStatus === "success" ? "mdi:check-circle-outline" : this._payloadDialogTestStatus === "error" ? "mdi:alert-circle-outline" : "mdi:progress-clock"}></ha-icon>
                    <span>
                      ${this._payloadDialogTestStatus === "testing" ? "Sending to the hub\u2026" : this._payloadDialogTestStatus === "success" ? "Sent to the hub for one-shot playback." : this._payloadDialogTestError || "Test failed."}
                    </span>
                  </div>
                ` : A}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._payloadDialogError}</div>
            <div class="dialog-footer-actions">
              ${this.mode === "live" && this._liveDeviceIsIr() && this.testCommandPayload ? T`
                    <button
                      class="dialog-btn payload-test-btn"
                      ?disabled=${this._payloadDialogTestStatus === "testing"}
                      @click=${() => void this._runLivePayloadTest()}
                    >
                      <ha-icon icon="mdi:flash-outline"></ha-icon>
                      <span>Test</span>
                    </button>
                  ` : A}
              <button class="dialog-btn" @click=${this._closeCommandPayloadDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyCommandPayloadDialog}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderRawPayloadForm() {
    return T`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">Raw payload</div>
          <div class="decoded-form-sub">
            No structured editor exists for this device class; the bytes below
            are replayed to the hub verbatim on restore.
          </div>
        </div>
        <label class="decoded-field">
          <span class="decoded-field-label">Payload (hex bytes)</span>
          <textarea
            class="decoded-field-input decoded-field-input--multiline"
            rows="6"
            spellcheck="false"
            .value=${this._payloadDialogRawDraft}
            @input=${this._handleRawPayloadInput}
            @change=${this._handleRawPayloadInput}
          ></textarea>
          <span class="decoded-field-helper">
            Byte pairs like "0a 4f 22" &mdash; whitespace and 0x prefixes are tolerated.
          </span>
        </label>
      </div>
    `;
  }
  _renderDecodedPayloadForm(className) {
    const spec = DECODED_CLASS_FORM_SPECS[className];
    if (!spec) return A;
    return T`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">${spec.title}</div>
          ${spec.subtitle ? T`<div class="decoded-form-sub">${spec.subtitle}</div>` : A}
        </div>
        ${spec.fields.map((field) => this._renderDecodedField(field))}
      </div>
    `;
  }
  _renderDecodedField(field) {
    const value = this._payloadDialogDecodedDrafts[field.key] ?? "";
    const onInput = (event) => this._handleDecodedFieldInput(event, field.key);
    const multilineClass = field.escapedDisplay ? "decoded-field-input--multiline decoded-field-input--escaped" : "decoded-field-input--multiline";
    return T`
      <label class="decoded-field">
        <span class="decoded-field-label">${field.label}</span>
        ${field.multiline ? T`
              <textarea
                class="decoded-field-input ${multilineClass}"
                rows="4"
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              ></textarea>
            ` : T`
              <input
                class="decoded-field-input"
                type=${field.numeric ? "number" : "text"}
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              />
            `}
        ${field.helper ? T`<span class="decoded-field-helper">${field.helper}</span>` : A}
      </label>
    `;
  }
  _editRenameDialogLabel() {
    const target = this._editRenameDialogTarget;
    if (!target) return "Rename";
    if (target.kind === "detail") {
      return target.entityKind === "activity" ? "Rename Activity" : "Rename Device";
    }
    if (target.kind === "macro") return "Rename Macro";
    if (target.kind === "favorite") return "Rename Favorite";
    if (target.kind === "device_ip") return "Edit IP address";
    if (target.kind === "hub_name") return "Rename Hub";
    return "Rename Command";
  }
  /** Per-target label & max length used by the dialog's primary text input. */
  _editRenameFieldLabel() {
    return this._editRenameDialogTarget?.kind === "device_ip" ? "IP address" : "Name";
  }
  _editRenameFieldMaxLength() {
    return this._editRenameDialogTarget?.kind === "device_ip" ? 15 : 30;
  }
  /**
   * Diff each spec field against the open-dialog snapshot. Returns a
   * record of fields that changed (mapped back through the wire-format
   * coercion in `_draftToFieldValue`), or `null` when nothing changed
   * and the bundle should be left untouched.
   */
  _collectChangedDecodedFields(snapshot) {
    const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
    if (!spec) return null;
    const changed = {};
    let touched = false;
    for (const field of spec.fields) {
      const draft = this._payloadDialogDecodedDrafts[field.key] ?? "";
      const original = this._fieldValueToDraft(snapshot.fields[field.key], field);
      if (draft === original) continue;
      changed[field.key] = this._draftToFieldValue(draft, field);
      touched = true;
    }
    return touched ? changed : null;
  }
  /**
   * Convert a draft string from a form control to the value shape the
   * decoder expects. `numeric` fields become numbers; `crlfOnWire`
   * fields get `\n` line endings normalized to `\r\n` so the wire
   * round-trip stays exact even though the browser textarea hides the
   * `\r`. Everything else passes through verbatim.
   */
  _draftToFieldValue(draft, field) {
    if (field.numeric) {
      const numeric = Number(draft);
      return Number.isFinite(numeric) ? numeric : 0;
    }
    if (field.escapedDisplay) {
      let result = draft.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
      return result;
    }
    if (field.crlfOnWire) {
      return draft.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    }
    return draft;
  }
  _openDeviceIpRenameDialog(deviceId) {
    const normalizedId = Number(deviceId);
    this._editRenameDialogTarget = { kind: "device_ip", deviceId: normalizedId };
    this._editRenameDialogDraft = deviceIpAddress(this.bundle, normalizedId) || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }
  _openDeviceCommandRenameDialog(commandId) {
    if (this.entityId == null) return;
    const deviceId = Number(this.entityId);
    const normalizedCommandId = Number(commandId);
    this._editRenameDialogTarget = { kind: "command", deviceId, commandId: normalizedCommandId };
    const item = deviceCommandItems(this.bundle, deviceId).find(
      (entry) => entry.commandId === normalizedCommandId
    );
    this._editRenameDialogDraft = item?.label || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }
  /**
   * True when the command is a not-yet-synced addition (live mode): its
   * bundle row carries the `restore_data.new` marker and there is nothing
   * on the hub to fetch for it yet.
   */
  _commandIsPendingAdd(commandId) {
    if (this.entityId == null || !this.bundle) return false;
    const device = (this.bundle.devices ?? []).find(
      (entry) => Number(entry?.device?.device_id || 0) === Number(this.entityId)
    );
    const command = (device?.commands ?? []).find(
      (row) => Number(row?.command_id || 0) === Number(commandId)
    );
    return Boolean(command?.restore_data?.["new"]);
  }
  /** True when the command carries anything the payload dialog can edit. */
  _commandHasEditablePayload(commandId) {
    if (this.entityId == null) return false;
    const deviceId = Number(this.entityId);
    return Boolean(
      commandDecodedBlock(this.bundle, deviceId, Number(commandId)) || commandRawPayloadHex(this.bundle, deviceId, Number(commandId))
    );
  }
  /**
   * True for IR devices. Live payload *editing* is offered for all classes
   * (raw hex, or the structured form where a parser exists), but the Test
   * button — `playIrBlob` — is IR-only, so it gates on this.
   */
  _liveDeviceIsIr() {
    if (this.entityId == null || !this.bundle) return false;
    return String(bundleDeviceClass(this.bundle, Number(this.entityId)) || "").trim().toLowerCase() === "ir";
  }
  /**
   * Live "edit payload": fetch this one command's blob from the hub on
   * demand (the structural bundle is blob-free), then open the same payload
   * dialog backup uses — populated from the fetch, not the bundle, so the
   * fetch itself never marks the bundle dirty. The host supplies the fetch.
   */
  async _liveFetchAndOpenPayload(commandId) {
    if (this.mode !== "live" || this.entityId == null || !this.fetchCommandPayload) return;
    if (this._payloadFetchingCommandId != null) return;
    const deviceId = Number(this.entityId);
    const normalizedCommandId = Number(commandId);
    this._payloadFetchingCommandId = normalizedCommandId;
    this._payloadFetchError = "";
    try {
      const fetched = await this.fetchCommandPayload(deviceId, normalizedCommandId);
      if (!fetched || !String(fetched.dataHex || "").trim()) {
        this._payloadFetchError = "The hub returned no payload for this command.";
        return;
      }
      this._openLivePayloadDialog(deviceId, normalizedCommandId, fetched);
    } catch (error) {
      this._payloadFetchError = error instanceof Error ? error.message : String(error);
    } finally {
      this._payloadFetchingCommandId = null;
    }
  }
  _openLivePayloadDialog(deviceId, commandId, fetched) {
    const decoded = this._decodedSnapshotFromFetch(fetched.decoded);
    const rawHex = decoded ? "" : normalizeCommandPayloadHex(fetched.dataHex) ?? fetched.dataHex;
    this._payloadDialogTarget = { deviceId, commandId };
    this._payloadLiveFetched = fetched;
    this._payloadDialogDecodedSnapshot = decoded;
    this._payloadDialogDecodedDrafts = decoded ? this._initialDecodedDrafts(decoded) : {};
    this._payloadDialogRawSnapshot = rawHex;
    this._payloadDialogRawDraft = rawHex;
    this._payloadDialogError = "";
    this._payloadDialogTestStatus = "idle";
    this._payloadDialogTestError = "";
    this._payloadDialogOpen = true;
  }
  /**
   * Open the payload dialog in add-command mode (live only). The controls
   * mirror command edit for the device's class:
   *
   * * `ir` — blank descriptor form. The backend synthesizes the record
   *   from the descriptor alone (`build_descriptive_ir_blob_body`), so no
   *   template is needed and Test works before anything is saved.
   * * decodable wifi classes — the structured form, seeded from an
   *   existing command fetched as a template. The template supplies the
   *   record's opaque trailer (a checksum region we cannot synthesize)
   *   plus sensible defaults like host/port.
   * * everything else — raw hex entry.
   *
   * Non-IR devices need at least one existing command: the template
   * trailer and the codec (`library_type`) are both read from it.
   */
  async _openAddCommandDialog() {
    if (this.mode !== "live" || this.entityId == null || !this.bundle) return;
    if (this._addCommandPreparing) return;
    const deviceId = Number(this.entityId);
    const deviceClass = String(bundleDeviceClass(this.bundle, deviceId) || "").trim().toLowerCase();
    this._payloadFetchError = "";
    if (deviceClass === "ir") {
      this._openAddDialogWithSnapshot(deviceId, {
        className: "ir",
        fields: { descriptor: "" },
        trailerHex: "",
        edited: false
      });
      return;
    }
    const existing = deviceCommandItems(this.bundle, deviceId);
    if (!existing.length) {
      this._payloadFetchError = "This device has no commands to use as a template \u2014 add its first command with the Sofabaton app.";
      return;
    }
    if (deviceClass in DECODED_CLASS_FORM_SPECS && this.fetchCommandPayload) {
      this._addCommandPreparing = true;
      try {
        const fetched = await this.fetchCommandPayload(deviceId, existing[0].commandId);
        const decoded = this._decodedSnapshotFromFetch(fetched?.decoded ?? null);
        if (decoded) {
          this._openAddDialogWithSnapshot(deviceId, decoded);
          return;
        }
      } catch (error) {
        this._payloadFetchError = error instanceof Error ? error.message : String(error);
        return;
      } finally {
        this._addCommandPreparing = false;
      }
    }
    this._openAddDialogWithSnapshot(deviceId, null);
  }
  _openAddDialogWithSnapshot(deviceId, decoded) {
    this._payloadDialogTarget = { deviceId, commandId: 0 };
    this._payloadDialogAddMode = true;
    this._payloadDialogNameDraft = "";
    this._payloadLiveFetched = null;
    this._payloadDialogDecodedSnapshot = decoded;
    this._payloadDialogDecodedDrafts = decoded ? this._initialDecodedDrafts(decoded) : {};
    this._payloadDialogRawSnapshot = "";
    this._payloadDialogRawDraft = "";
    this._payloadDialogError = "";
    this._payloadDialogTestStatus = "idle";
    this._payloadDialogTestError = "";
    this._payloadDialogOpen = true;
  }
  /**
   * Commit a new command from the add dialog: allocate the next free id on
   * the device and append a row whose `restore_data` carries the
   * `new: true` marker the device-sync planner turns into a `command_add`
   * step. Decoded forms serialize every field (there is no pristine
   * baseline to diff against); raw entry normalizes the hex.
   */
  _applyAddCommandDialog(target) {
    if (!this.bundle) return;
    const name = sanitizeBundleName(this.bundle, this._payloadDialogNameDraft).trim();
    if (!name) {
      this._payloadDialogError = "Enter a name for the new command.";
      return;
    }
    let restoreData;
    const snapshot = this._payloadDialogDecodedSnapshot;
    if (snapshot) {
      const spec = DECODED_CLASS_FORM_SPECS[snapshot.className];
      const fields = {};
      for (const field of spec.fields) {
        fields[field.key] = this._draftToFieldValue(this._payloadDialogDecodedDrafts[field.key] ?? "", field);
      }
      if (snapshot.className === "ir") {
        const descriptor = String(fields["descriptor"] ?? "").trim();
        if (!descriptor.startsWith("P:")) {
          this._payloadDialogError = "Enter a descriptive IR payload starting with P: (e.g. P:Sony12 R:40000 D:1 F:18).";
          return;
        }
      }
      restoreData = {
        transport: "hub_code_record",
        decoded: {
          class: snapshot.className,
          trailer_hex: snapshot.trailerHex,
          fields,
          edited: true
        }
      };
    } else {
      const normalized = normalizeCommandPayloadHex(this._payloadDialogRawDraft);
      if (!normalized) {
        this._payloadDialogError = "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).";
        return;
      }
      restoreData = { transport: "hub_code_record", data_hex: normalized };
    }
    const newId = nextFreeDeviceCommandId(this.bundle, target.deviceId);
    if (newId == null) {
      this._payloadDialogError = "This device has no free command slot left.";
      return;
    }
    this._commitEditBundleEdit(
      addBundleDeviceCommand(this.bundle, target.deviceId, newId, name, restoreData)
    );
    this._closeCommandPayloadDialog();
  }
  /** Convert a fetched decoded block into the editor's snapshot shape. */
  _decodedSnapshotFromFetch(decoded) {
    if (!decoded) return null;
    const className = String(decoded.class ?? "").trim().toLowerCase();
    if (!(className in DECODED_CLASS_FORM_SPECS)) return null;
    return {
      className,
      fields: { ...decoded.fields ?? {} },
      trailerHex: String(decoded.trailer_hex ?? ""),
      edited: false
    };
  }
  /**
   * Commit a live payload edit. The working command has no restore_data yet
   * (blob-free bundle), so build the whole block — carrying the `edited`
   * marker the device-sync planner keys on — and set it via
   * `setCommandRestoreData`. A pristine (unchanged) dialog commits nothing.
   */
  _applyLivePayloadDialog(target) {
    if (!this.bundle) return;
    const snapshot = this._payloadDialogDecodedSnapshot;
    if (snapshot) {
      const changedFields = this._collectChangedDecodedFields(snapshot);
      if (!changedFields) {
        this._closeCommandPayloadDialog();
        return;
      }
      const restoreData2 = {
        transport: "hub_code_record",
        data_hex: this._payloadLiveFetched?.dataHex ?? "",
        decoded: {
          class: snapshot.className,
          trailer_hex: snapshot.trailerHex,
          fields: { ...snapshot.fields, ...changedFields },
          edited: true
        }
      };
      this._commitEditBundleEdit(setCommandRestoreData(this.bundle, target.deviceId, target.commandId, restoreData2));
      this._closeCommandPayloadDialog();
      return;
    }
    const normalized = normalizeCommandPayloadHex(this._payloadDialogRawDraft);
    if (!normalized) {
      this._payloadDialogError = "Enter the payload as hex bytes (an even number of hex digits; spaces are fine).";
      return;
    }
    if (normalized === normalizeCommandPayloadHex(this._payloadDialogRawSnapshot)) {
      this._closeCommandPayloadDialog();
      return;
    }
    const restoreData = { transport: "hub_code_record", data_hex: normalized, edited: true };
    this._commitEditBundleEdit(setCommandRestoreData(this.bundle, target.deviceId, target.commandId, restoreData));
    this._closeCommandPayloadDialog();
  }
  /** Test the current draft on the hub (IR only), via the host's callback. */
  async _runLivePayloadTest() {
    if (!this.testCommandPayload) return;
    const value = this._payloadDialogDecodedSnapshot ? String(this._payloadDialogDecodedDrafts["descriptor"] ?? "").trim() : String(this._payloadDialogRawDraft ?? "").trim();
    if (!value) {
      this._payloadDialogTestStatus = "error";
      this._payloadDialogTestError = "Nothing to test yet.";
      return;
    }
    this._payloadDialogTestStatus = "testing";
    this._payloadDialogTestError = "";
    try {
      await this.testCommandPayload(value);
      this._payloadDialogTestStatus = "success";
    } catch (error) {
      this._payloadDialogTestStatus = "error";
      this._payloadDialogTestError = error instanceof Error ? error.message : String(error);
    }
  }
  _openCommandPayloadDialog(commandId) {
    if (this.mode === "live") return;
    if (this.entityId == null) return;
    const deviceId = Number(this.entityId);
    const normalizedCommandId = Number(commandId);
    const decoded = commandDecodedBlock(this.bundle, deviceId, normalizedCommandId);
    const rawHex = decoded ? null : commandRawPayloadHex(this.bundle, deviceId, normalizedCommandId);
    if (!decoded && !rawHex) return;
    this._payloadDialogTarget = { deviceId, commandId: normalizedCommandId };
    this._payloadDialogDecodedSnapshot = decoded;
    this._payloadDialogDecodedDrafts = decoded ? this._initialDecodedDrafts(decoded) : {};
    this._payloadDialogRawSnapshot = rawHex ?? "";
    this._payloadDialogRawDraft = rawHex ?? "";
    this._payloadDialogError = "";
    this._payloadDialogOpen = true;
  }
  _initialDecodedDrafts(decoded) {
    const spec = DECODED_CLASS_FORM_SPECS[decoded.className];
    if (!spec) return {};
    const drafts = {};
    for (const field of spec.fields) {
      drafts[field.key] = this._fieldValueToDraft(decoded.fields[field.key], field);
    }
    return drafts;
  }
  _fieldValueToDraft(value, field) {
    if (value == null) return "";
    if (field.numeric) return String(Number(value) || 0);
    const stringValue = String(value);
    if (field.escapedDisplay) {
      return stringValue.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
    }
    return stringValue;
  }
  _openQuickAccessRenameDialog(kind, buttonId) {
    if (this.mode === "live" && kind === "favorite") return;
    if (this.entityId == null) return;
    this._editRenameDialogTarget = kind === "macro" ? { kind: "macro", activityId: this.entityId, buttonId } : { kind: "favorite", activityId: this.entityId, buttonId };
    const item = activityQuickAccessItems(this.bundle, this.entityId).find(
      (entry) => entry.kind === kind && entry.buttonId === Number(buttonId)
    );
    this._editRenameDialogDraft = item?.label || "";
    this._editRenameDialogError = "";
    this._editRenameDialogOpen = true;
  }
  _openCommandDeleteConfirm(commandId, label) {
    if (this.entityId == null) return;
    this._confirmDeleteTarget = {
      kind: "command",
      deviceId: Number(this.entityId),
      commandId: Number(commandId)
    };
    this._confirmDeleteLabel = label;
  }
  _openQuickAccessDeleteConfirm(kind, buttonId, label) {
    if (this.entityId == null) return;
    const activityId = Number(this.entityId);
    this._confirmDeleteTarget = kind === "macro" ? { kind: "macro", activityId, buttonId: Number(buttonId) } : { kind: "favorite", activityId, buttonId: Number(buttonId) };
    this._confirmDeleteLabel = label;
  }
  _deleteConfirmTitle(target, label) {
    const name = label || "this item";
    switch (target.kind) {
      case "activity":
        return TOOLS_CARD_STRINGS.backup.deleteActivityTitle(name);
      case "device":
        return TOOLS_CARD_STRINGS.backup.deleteDeviceTitle(name);
      case "command":
        return TOOLS_CARD_STRINGS.backup.deleteCommandTitle(name);
      case "favorite":
        return TOOLS_CARD_STRINGS.backup.deleteFavoriteTitle(name);
      case "macro":
        return TOOLS_CARD_STRINGS.backup.deleteMacroTitle(name);
      case "activity_binding":
      case "device_binding":
        return TOOLS_CARD_STRINGS.backup.deleteBindingTitle(name);
      case "activity_member":
        return TOOLS_CARD_STRINGS.backup.activityRemoveDeviceTitle(name);
    }
  }
  _openBindingDeleteConfirm(kind, buttonId, name) {
    if (this.entityId == null) return;
    const entityId = Number(this.entityId);
    this._confirmDeleteTarget = kind === "activity" ? { kind: "activity_binding", activityId: entityId, buttonId: Number(buttonId) } : { kind: "device_binding", deviceId: entityId, buttonId: Number(buttonId) };
    this._confirmDeleteLabel = name;
  }
  _renderDeleteConfirmDialog() {
    const target = this._confirmDeleteTarget;
    if (!target || !this.bundle) return A;
    const impact = bundleDeleteImpact(this.bundle, target);
    const hasCascade = backupDeleteHasCascade(impact);
    const S4 = TOOLS_CARD_STRINGS.backup;
    const isLive = this.mode === "live";
    const isImmediate = isLive && (target.kind === "activity" || target.kind === "device");
    const intro = isLive ? hasCascade ? S4.deleteCascadeIntroLive : S4.deleteSimpleBodyLive : hasCascade ? S4.deleteCascadeIntro : S4.deleteSimpleBody;
    const note = isLive ? isImmediate ? S4.deleteImmediateNote : S4.deleteSyncNote : S4.deleteReplaceNote;
    return T`
      <div class="modal-backdrop" @click=${this._closeDeleteConfirm}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${this._deleteConfirmTitle(target, this._confirmDeleteLabel)}</div>
            <button class="dialog-close" @click=${this._closeDeleteConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="backup-drawer-sub">
              ${intro}
            </div>
            ${hasCascade ? T`
                  <ul class="delete-impact-list">
                    ${impact.activities > 0 ? T`<li><ha-icon icon="mdi:link-variant"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactActivities(impact.activities)}</span></li>` : A}
                    ${impact.favorites > 0 ? T`<li><ha-icon icon="mdi:star-outline"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactFavorites(impact.favorites)}</span></li>` : A}
                    ${impact.macroSteps > 0 ? T`<li><ha-icon icon="mdi:format-list-numbered"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactMacroSteps(impact.macroSteps)}</span></li>` : A}
                    ${impact.powerSteps > 0 ? T`<li><ha-icon icon="mdi:power"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactPowerSteps(impact.powerSteps)}</span></li>` : A}
                    ${impact.bindings > 0 ? T`<li><ha-icon icon="mdi:gesture-tap-button"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactBindings(impact.bindings)}</span></li>` : A}
                  </ul>
                ` : A}
            <div class="delete-replace-note">
              <ha-icon icon="mdi:information-outline"></ha-icon>
              <span>${note}</span>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeDeleteConfirm}>${TOOLS_CARD_STRINGS.backup.deleteCancel}</button>
              <button class="dialog-btn dialog-btn-danger" @click=${this._confirmDelete}>${TOOLS_CARD_STRINGS.backup.deleteConfirm}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderAddFavoriteDialog() {
    if (!this._addFavoriteOpen || !this.bundle) return A;
    const S4 = TOOLS_CARD_STRINGS.backup;
    const kind = this._addShortcutKind;
    const devices = bundleEditableDeviceOptions(this.bundle);
    const macros = this._macroOptions();
    const commands = this._addFavoriteDeviceId != null ? deviceCommandItems(this.bundle, this._addFavoriteDeviceId) : [];
    const canAdd = kind !== "command" || this._addFavoriteDeviceId != null && this._addFavoriteCommandId != null;
    const commandFields = devices.length === 0 ? T`<div class="backup-drawer-sub">${S4.addFavoriteNoDevices}</div>` : T`
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-device">${S4.addFavoriteDevice}</label>
            <select id="sb-add-fav-device" class="decoded-field-input" @change=${this._handleAddFavoriteDeviceChange}>
              ${devices.map((device) => T`
                <option value=${device.id} ?selected=${device.id === this._addFavoriteDeviceId}>${device.label}</option>
              `)}
            </select>
          </div>
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-command">${S4.addFavoriteCommand}</label>
            ${commands.length === 0 ? T`<div class="quick-access-empty">${S4.addFavoriteNoCommands}</div>` : T`
                  <select id="sb-add-fav-command" class="decoded-field-input" @change=${this._handleAddFavoriteCommandChange}>
                    ${commands.map((command) => T`
                      <option value=${command.commandId} ?selected=${command.commandId === this._addFavoriteCommandId}>${command.label}</option>
                    `)}
                  </select>
                `}
          </div>
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-name">${S4.addFavoriteName}</label>
            <input
              id="sb-add-fav-name"
              class="decoded-field-input"
              maxlength="20"
              .value=${this._addFavoriteName}
              @input=${this._handleAddFavoriteNameInput}
            />
          </div>
        `;
    const actionFields = T`
      <div class="decoded-field">
        <label class="decoded-field-label" for="sb-add-action-name">${S4.addShortcutActionName}</label>
        <input
          id="sb-add-action-name"
          class="decoded-field-input"
          maxlength="20"
          .value=${this._addShortcutActionName}
          @input=${(event) => {
      this._addShortcutActionName = event.target.value;
    }}
        />
        <div class="decoded-field-helper">${S4.addShortcutActionHelper}</div>
      </div>
    `;
    const macroFields = T`
      ${macros.length ? T`
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-add-macro-target">${S4.macroTargetLabel}</label>
              <select
                id="sb-add-macro-target"
                class="decoded-field-input"
                @change=${(event) => {
      const value = event.target.value;
      if (value === "__new__") {
        this._addShortcutMacroMode = "new";
        this._addShortcutMacroId = null;
      } else {
        this._addShortcutMacroMode = "existing";
        this._addShortcutMacroId = Number(value);
      }
      this._addFavoriteError = "";
    }}
              >
                ${macros.map((macro) => T`
                  <option value=${macro.value} ?selected=${this._addShortcutMacroMode === "existing" && macro.value === this._addShortcutMacroId}>${macro.label}</option>
                `)}
                <option value="__new__" ?selected=${this._addShortcutMacroMode === "new"}>${S4.macroTargetCreateNew}</option>
              </select>
            </div>
          ` : T`<div class="quick-access-empty">${S4.macroTargetNoExisting}</div>`}
      ${this._addShortcutMacroMode === "new" ? actionFields : A}
    `;
    return T`
      <div class="modal-backdrop" @click=${this._closeAddFavoriteDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S4.addShortcutTitle}</div>
            <button class="dialog-close" @click=${this._closeAddFavoriteDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-add-shortcut-kind">${S4.addShortcutKindLabel}</label>
              <select
                id="sb-add-shortcut-kind"
                class="decoded-field-input"
                @change=${(event) => {
      this._addShortcutKind = event.target.value;
      if (this._addShortcutKind === "action") this._resetMacroTarget("shortcut");
      this._addFavoriteError = "";
    }}
              >
                <option value="command" ?selected=${kind === "command"}>${S4.shortcutKindCommand}</option>
                <option value="action" ?selected=${kind === "action"}>${S4.shortcutKindAction}</option>
              </select>
            </div>
            ${kind === "command" ? commandFields : macroFields}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._addFavoriteError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeAddFavoriteDialog}>${S4.addFavoriteCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyAddShortcut} ?disabled=${!canAdd}>${S4.addFavoriteAdd}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _applyActivityRename(activityId, name) {
    if (!this.bundle) return;
    this._commitEditBundleEdit(renameBundleActivity(this.bundle, activityId, name));
  }
  _applyDeviceRename(deviceId, name) {
    if (!this.bundle) return;
    this._commitEditBundleEdit(renameBundleDevice(this.bundle, deviceId, name));
  }
  _entityKindCrumbLabel(kind) {
    return kind === "activity" ? TOOLS_CARD_STRINGS.backup.crumbActivities : TOOLS_CARD_STRINGS.backup.crumbDevices;
  }
  // Compact ancestor trail shown above the detail/editor title. Each crumb
  // is a tappable button that pops back to that level; the trailing "›"
  // leads the eye into the current page's big title beneath it.
  _renderDetailCrumbs(crumbs) {
    if (!crumbs.length) return A;
    return T`
      <div class="detail-crumbs">
        ${crumbs.map((crumb, index) => T`
          ${index > 0 ? T`<span class="detail-crumb-sep" aria-hidden="true">›</span>` : A}
          <button class="detail-crumb" type="button" @click=${crumb.onClick}>${crumb.label}</button>
        `)}
        <span class="detail-crumb-sep" aria-hidden="true">›</span>
      </div>
    `;
  }
  _applyEditDetailRename() {
    const next = sanitizeBundleName(this.bundle, this._editDetailNameDraft);
    if (!next || !this.kind || this.entityId == null) return;
    if (this.kind === "activity") this._applyActivityRename(this.entityId, next);
    else this._applyDeviceRename(this.entityId, next);
    this._editDetailNameDraft = next;
  }
  _moveActivityQuickAccessItem(index, delta) {
    if (!this.bundle || this.entityId == null) return;
    const items = activityQuickAccessItems(this.bundle, this.entityId);
    const nextIndex = index + delta;
    if (index < 0 || nextIndex < 0 || index >= items.length || nextIndex >= items.length) return;
    const nextItems = [...items];
    const [moved] = nextItems.splice(index, 1);
    nextItems.splice(nextIndex, 0, moved);
    this._commitEditBundleEdit(reorderBundleActivityQuickAccess(
      this.bundle,
      this.entityId,
      nextItems.map((item) => ({ kind: item.kind, buttonId: item.buttonId }))
    ));
  }
  _moveQuickAccessByIdentity(kind, buttonId, delta) {
    if (!this.bundle || this.entityId == null) return;
    const items = activityQuickAccessItems(this.bundle, this.entityId);
    const index = items.findIndex((item) => item.kind === kind && item.buttonId === Number(buttonId));
    if (index === -1) return;
    this._moveActivityQuickAccessItem(index, delta);
  }
  // ── Button bindings (add / edit picker) ─────────────────────────────
  _bindingCommandDeviceOptions() {
    if (!this.bundle) return [];
    return bundleEditableDeviceOptions(this.bundle).map((device) => ({ value: device.id, label: device.label }));
  }
  _bindingTargetKindFor(deviceId) {
    if (!this.bundle || this.entityId == null) return "command";
    const dId = Number(deviceId || 0);
    if (dId === Number(this.entityId)) return "action";
    return "command";
  }
  _macroName(buttonId) {
    if (!this.bundle || this.entityId == null) return "";
    const bId = Number(buttonId || 0);
    return activityUserMacroSummaries(this.bundle, Number(this.entityId)).find((macro) => macro.buttonId === bId)?.name ?? "";
  }
  _macroOptions() {
    if (!this.bundle || this.entityId == null) return [];
    return activityUserMacroSummaries(this.bundle, Number(this.entityId)).map((macro) => ({ value: macro.buttonId, label: macro.name }));
  }
  _resetMacroTarget(prefix) {
    const firstMacro = this._macroOptions()[0] ?? null;
    const mode = firstMacro ? "existing" : "new";
    if (prefix === "shortcut") {
      this._addShortcutMacroMode = mode;
      this._addShortcutMacroId = firstMacro?.value ?? null;
      return;
    }
    if (prefix === "binding") {
      this._bindingMacroMode = mode;
      this._bindingMacroId = firstMacro?.value ?? null;
      return;
    }
    this._bindingLpMacroMode = mode;
    this._bindingLpMacroId = firstMacro?.value ?? null;
  }
  _captureCurrentScrollPosition() {
    const root = this.renderRoot;
    const scrollEl = root?.querySelector(".detail-scroll");
    if (!scrollEl) return;
    if (this._bindingsView) this._bindingsScrollTop = scrollEl.scrollTop;
    else this._detailScrollTop = scrollEl.scrollTop;
  }
  _restoreMainScroll() {
    void this.updateComplete.then(() => {
      const root = this.renderRoot;
      const scrollEl = root?.querySelector(".detail-scroll");
      if (scrollEl) scrollEl.scrollTop = this._detailScrollTop;
    });
  }
  _restoreBindingsScroll() {
    void this.updateComplete.then(() => {
      const root = this.renderRoot;
      const scrollEl = root?.querySelector(".detail-scroll");
      if (scrollEl) scrollEl.scrollTop = this._bindingsScrollTop;
    });
  }
  // Command options for a chosen target: the activity's own macros when the
  // target is the activity itself, otherwise the target device's commands.
  _bindingCommandOptions(targetDeviceId) {
    if (targetDeviceId == null || !this.bundle) return [];
    if (this._bindingScope === "activity" && this.entityId != null && targetDeviceId === Number(this.entityId)) {
      return activityUserMacroSummaries(this.bundle, Number(this.entityId)).map((macro) => ({ value: macro.buttonId, label: macro.name }));
    }
    return deviceCommandItems(this.bundle, targetDeviceId).map((command) => ({ value: command.commandId, label: command.label }));
  }
  _openAddBindingDialog(kind) {
    if (this.entityId == null || !this.bundle) return;
    const entityId = Number(this.entityId);
    const unbound = kind === "activity" ? unboundButtonsForActivity(this.bundle, entityId) : unboundButtonsForDevice(this.bundle, entityId);
    if (!unbound.length) return;
    this._bindingScope = kind;
    this._bindingEditButtonId = null;
    this._bindingButtonId = unbound[0].code;
    this._bindingTargetKind = "command";
    this._bindingActionName = "";
    this._resetMacroTarget("binding");
    this._bindingLpTargetKind = "command";
    this._bindingLpActionName = "";
    this._resetMacroTarget("bindingLp");
    if (kind === "activity") {
      const devices = this._bindingCommandDeviceOptions();
      this._bindingDeviceId = devices[0]?.value ?? null;
    } else {
      this._bindingDeviceId = entityId;
    }
    const commandDeviceId = kind === "activity" ? this._bindingDeviceId : entityId;
    const commands = commandDeviceId != null ? deviceCommandItems(this.bundle, commandDeviceId) : [];
    this._bindingCommandId = commands[0]?.commandId ?? null;
    this._bindingLongPressEnabled = false;
    this._bindingLpDeviceId = this._bindingDeviceId;
    this._bindingLpCommandId = this._bindingCommandId;
    this._bindingError = "";
    this._bindingDialogOpen = true;
  }
  _openEditBindingDialog(kind, buttonId) {
    if (this.entityId == null || !this.bundle) return;
    const entityId = Number(this.entityId);
    const items = kind === "activity" ? activityButtonBindingItems(this.bundle, entityId) : deviceButtonBindingItems(this.bundle, entityId);
    const item = items.find((entry) => entry.buttonId === Number(buttonId));
    if (!item) return;
    this._bindingScope = kind;
    this._bindingEditButtonId = item.buttonId;
    this._bindingButtonId = item.buttonId;
    this._bindingDeviceId = kind === "activity" ? item.deviceId ?? null : entityId;
    this._bindingCommandId = item.commandId;
    this._bindingTargetKind = kind === "activity" ? this._bindingTargetKindFor(item.deviceId) : "command";
    this._bindingActionName = this._bindingTargetKind === "action" ? this._macroName(item.commandId) : "";
    this._bindingMacroMode = this._bindingTargetKind === "action" ? "existing" : "new";
    this._bindingMacroId = this._bindingTargetKind === "action" ? item.commandId : null;
    this._bindingLongPressEnabled = Boolean(item.longPress);
    this._bindingLpDeviceId = kind === "activity" ? item.longPress?.deviceId ?? item.deviceId ?? null : entityId;
    this._bindingLpCommandId = item.longPress?.commandId ?? null;
    this._bindingLpTargetKind = kind === "activity" ? this._bindingTargetKindFor(this._bindingLpDeviceId) : "command";
    this._bindingLpActionName = this._bindingLpTargetKind === "action" ? this._macroName(this._bindingLpCommandId) : "";
    this._bindingLpMacroMode = this._bindingLpTargetKind === "action" ? "existing" : "new";
    this._bindingLpMacroId = this._bindingLpTargetKind === "action" ? this._bindingLpCommandId : null;
    this._bindingError = "";
    this._bindingDialogOpen = true;
  }
  _resolveMacroTarget(bundle, activityId, mode, macroId, rawName) {
    if (mode === "existing") {
      const existing = activityUserMacroSummaries(bundle, activityId).find((macro) => macro.buttonId === Number(macroId));
      return existing ? { bundle, macroId: existing.buttonId, name: existing.name, created: false } : null;
    }
    const name = sanitizeBundleName(bundle, rawName).trim() || TOOLS_CARD_STRINGS.backup.newMacroName;
    const next = addActivityUserMacro(bundle, activityId, name);
    const summaries = activityUserMacroSummaries(next, activityId);
    const created = summaries[summaries.length - 1];
    return created ? { bundle: next, macroId: created.buttonId, name: created.name, created: true } : null;
  }
  _resolveActivityLongPressTarget(bundle, activityId) {
    if (!this._bindingLongPressEnabled) {
      return { bundle, longPress: null, createdMacro: null };
    }
    if (this._bindingLpTargetKind === "command") {
      if (!this._bindingLpDeviceId || !this._bindingLpCommandId) {
        this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
        return null;
      }
      return {
        bundle,
        longPress: {
          deviceId: Number(this._bindingLpDeviceId),
          commandId: Number(this._bindingLpCommandId)
        },
        createdMacro: null
      };
    }
    const resolved = this._resolveMacroTarget(
      bundle,
      activityId,
      this._bindingLpMacroMode,
      this._bindingLpMacroId,
      this._bindingLpActionName
    );
    if (!resolved) {
      this._bindingError = TOOLS_CARD_STRINGS.backup.bindingIncomplete;
      return null;
    }
    return {
      bundle: resolved.bundle,
      longPress: { deviceId: activityId, commandId: resolved.macroId },
      createdMacro: resolved.created ? { buttonId: resolved.macroId, name: resolved.name } : null
    };
  }
  _renderBindingSelect(params) {
    return T`
      <div class="decoded-field">
        <label class="decoded-field-label" for=${params.id}>${params.label}</label>
        ${params.options.length === 0 ? T`<div class="quick-access-empty">${params.emptyText ?? ""}</div>` : T`
              <select id=${params.id} class="decoded-field-input" @change=${params.onChange}>
                ${params.options.map((option) => T`
                  <option value=${option.value} ?selected=${option.value === params.value}>${option.label}</option>
                `)}
              </select>
            `}
      </div>
    `;
  }
  _renderMacroTargetFields(params) {
    const S4 = TOOLS_CARD_STRINGS.backup;
    const macros = this._macroOptions();
    return T`
      ${macros.length ? T`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-macro-target`}>${S4.macroTargetLabel}</label>
              <select
                id=${`${params.idPrefix}-macro-target`}
                class="decoded-field-input"
                @change=${params.onMacroChange}
              >
                ${macros.map((macro) => T`
                  <option value=${macro.value} ?selected=${params.mode === "existing" && macro.value === params.macroId}>${macro.label}</option>
                `)}
                <option value="__new__" ?selected=${params.mode === "new"}>${S4.macroTargetCreateNew}</option>
              </select>
            </div>
          ` : T`<div class="quick-access-empty">${S4.macroTargetNoExisting}</div>`}
      ${params.mode === "new" ? T`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-macro-name`}>${S4.addShortcutActionName}</label>
              <input
                id=${`${params.idPrefix}-macro-name`}
                class="decoded-field-input"
                maxlength="20"
                .value=${params.name}
                @input=${params.onNameInput}
              />
              <div class="decoded-field-helper">${S4.addShortcutActionHelper}</div>
            </div>
          ` : A}
    `;
  }
  _renderBindingDialog() {
    if (!this._bindingDialogOpen || !this.bundle || this.entityId == null) return A;
    const S4 = TOOLS_CARD_STRINGS.backup;
    const scope = this._bindingScope;
    const entityId = Number(this.entityId);
    const isEdit = this._bindingEditButtonId != null;
    const isActivity = scope === "activity";
    const targetKind = isActivity ? this._bindingTargetKind : "command";
    const lpTargetKind = isActivity ? this._bindingLpTargetKind : "command";
    const unbound = scope === "activity" ? unboundButtonsForActivity(this.bundle, entityId) : unboundButtonsForDevice(this.bundle, entityId);
    const commandDeviceOptions = this._bindingCommandDeviceOptions();
    const commandDeviceId = scope === "activity" && targetKind === "command" ? this._bindingDeviceId : entityId;
    const commandOptions = this._bindingCommandOptions(commandDeviceId);
    const lpDeviceId = scope === "activity" && lpTargetKind === "command" ? this._bindingLpDeviceId : entityId;
    const lpCommandOptions = this._bindingCommandOptions(lpDeviceId);
    const canSave = this._bindingButtonId != null && (scope === "device" ? this._bindingCommandId != null : targetKind === "command" ? this._bindingDeviceId != null && this._bindingCommandId != null : true);
    const title = isEdit ? S4.bindingDialogEditTitle(buttonName(Number(this._bindingButtonId))) : S4.bindingDialogAddTitle;
    const commandFields = T`
      ${scope === "activity" ? this._renderBindingSelect({
      id: "sb-binding-device",
      label: S4.bindingTargetDevice,
      value: this._bindingDeviceId,
      options: commandDeviceOptions,
      onChange: this._handleBindingDeviceChange,
      emptyText: S4.bindingNoDevices
    }) : A}
      ${this._renderBindingSelect({
      id: "sb-binding-command",
      label: S4.bindingCommand,
      value: this._bindingCommandId,
      options: commandOptions,
      onChange: this._handleBindingCommandChange,
      emptyText: S4.bindingNoCommands
    })}
    `;
    const actionFields = this._renderMacroTargetFields({
      idPrefix: "sb-binding",
      mode: this._bindingMacroMode,
      macroId: this._bindingMacroId,
      name: this._bindingActionName,
      onMacroChange: this._handleBindingMacroTargetChange,
      onNameInput: this._handleBindingActionNameInput
    });
    const lpCommandFields = T`
      ${scope === "activity" ? this._renderBindingSelect({
      id: "sb-binding-lp-device",
      label: S4.bindingLongPressDevice,
      value: this._bindingLpDeviceId,
      options: commandDeviceOptions,
      onChange: this._handleBindingLpDeviceChange,
      emptyText: S4.bindingNoDevices
    }) : A}
      ${this._renderBindingSelect({
      id: "sb-binding-lp-command",
      label: S4.bindingLongPressCommand,
      value: this._bindingLpCommandId,
      options: lpCommandOptions,
      onChange: this._handleBindingLpCommandChange,
      emptyText: S4.bindingNoCommands
    })}
    `;
    const lpActionFields = this._renderMacroTargetFields({
      idPrefix: "sb-binding-lp",
      mode: this._bindingLpMacroMode,
      macroId: this._bindingLpMacroId,
      name: this._bindingLpActionName,
      onMacroChange: this._handleBindingLpMacroTargetChange,
      onNameInput: this._handleBindingLpActionNameInput
    });
    return T`
      <div class="modal-backdrop" @click=${this._closeBindingDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" @click=${this._closeBindingDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isEdit ? T`
                  <div class="decoded-field">
                    <span class="decoded-field-label">${S4.bindingButton}</span>
                    <div class="binding-static-field">${buttonName(Number(this._bindingButtonId))}</div>
                  </div>
                ` : this._renderBindingSelect({
      id: "sb-binding-button",
      label: S4.bindingButton,
      value: this._bindingButtonId,
      options: unbound.map((entry) => ({ value: entry.code, label: entry.name })),
      onChange: this._handleBindingButtonChange,
      emptyText: S4.bindingNoButtons
    })}
            ${isActivity ? T`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-binding-kind">${S4.addShortcutKindLabel}</label>
                    <select
                      id="sb-binding-kind"
                      class="decoded-field-input"
                      @change=${this._handleBindingTargetKindChange}
                    >
                      <option value="command" ?selected=${targetKind === "command"}>${S4.shortcutKindCommand}</option>
                      <option value="action" ?selected=${targetKind === "action"}>${S4.shortcutKindAction}</option>
                    </select>
                  </div>
                ` : A}
            ${targetKind === "command" ? commandFields : actionFields}
            <div class="binding-toggle-row">
              <span class="decoded-field-label">${S4.bindingEnableLongPress}</span>
              <ha-switch
                .checked=${this._bindingLongPressEnabled}
                @change=${this._handleBindingLongPressToggle}
              ></ha-switch>
            </div>
            ${this._bindingLongPressEnabled ? T`
                  ${isActivity ? T`
                        <div class="decoded-field">
                          <label class="decoded-field-label" for="sb-binding-lp-kind">${S4.addShortcutKindLabel}</label>
                          <select
                            id="sb-binding-lp-kind"
                            class="decoded-field-input"
                            @change=${this._handleBindingLpTargetKindChange}
                          >
                            <option value="command" ?selected=${lpTargetKind === "command"}>${S4.shortcutKindCommand}</option>
                            <option value="action" ?selected=${lpTargetKind === "action"}>${S4.shortcutKindAction}</option>
                          </select>
                        </div>
                      ` : A}
                  ${lpTargetKind === "command" ? lpCommandFields : lpActionFields}
                ` : A}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._bindingError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeBindingDialog}>${S4.bindingCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyBinding} ?disabled=${!canSave}>
                ${isEdit ? S4.bindingSave : S4.bindingAdd}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  // ── Macro step editor (device macros + activity user macros) ────────
  _openMacroEditor(scope, entityId, buttonId, name) {
    this._captureCurrentScrollPosition();
    this._macroEditor = { scope, entityId: Number(entityId), buttonId: Number(buttonId), name };
  }
  // Macro time bytes are in 0.5-second units (a hold byte of 4 = 2.0s),
  // matching the Sofabaton app. 0 = a single click / no wait.
  _byteToSeconds(byteValue) {
    return (Number(byteValue) * 0.5).toFixed(1).replace(/\.0$/, "");
  }
  _secondsToByte(value) {
    const seconds = parseFloat(String(value));
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(255, Math.max(0, Math.round(seconds * 2)));
  }
  /** Snap a typed seconds value to the hub's 0.5s grid (returns the string form). */
  _snapHalfSeconds(value) {
    return this._byteToSeconds(this._secondsToByte(value));
  }
  _currentMacroStepItems() {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return [];
    return editor.scope === "device" ? deviceMacroStepItems(this.bundle, editor.entityId, editor.buttonId) : activityMacroStepItems(this.bundle, editor.entityId, editor.buttonId);
  }
  _openEditStepDialog(item) {
    const editor = this._macroEditor;
    if (!editor) return;
    this._stepDialogEditIndex = item.index;
    this._stepError = "";
    this._stepDialogOpen = true;
    if (item.kind === "input") {
      this._stepKind = "input";
      this._stepDeviceId = item.deviceId ?? null;
      this._stepCommandId = item.commandId ?? null;
      return;
    }
    this._stepKind = "command";
    this._stepDeviceId = editor.scope === "activity" ? item.deviceId ?? null : editor.entityId;
    this._stepCommandId = item.commandId ?? null;
    this._stepHoldSeconds = this._byteToSeconds(item.hold);
  }
  _removeStep(index) {
    const editor = this._macroEditor;
    if (!editor || !this.bundle) return;
    const next = editor.scope === "device" ? removeDeviceMacroStep(this.bundle, editor.entityId, editor.buttonId, index) : removeActivityMacroStep(this.bundle, editor.entityId, editor.buttonId, index);
    this._commitEditBundleEdit(next);
  }
  _renderMacroStepEditorView(editor) {
    const items = this._currentMacroStepItems();
    const canRename = editor.scope === "activity" && !POWER_MACRO_BUTTON_IDS.has(editor.buttonId);
    const sortable = this._haSortableReady && items.length > 1;
    const renderRows = () => items.map((item) => this._renderMacroStepRow(item, sortable));
    return T`
      <div class="tab-panel tab-panel--detail">
        <div class="detail-view">
          <div class="sticky-header">
            <div class="detail-title-row">
              <div class="detail-title-main">
                <button class="back-btn" @click=${this._closeMacroEditor}>
                  <ha-icon icon="mdi:arrow-left"></ha-icon>
                </button>
                <div class="detail-title-stack">
                  ${this._renderDetailCrumbs([
      { label: this._entityKindCrumbLabel(editor.scope), onClick: this._requestClose },
      { label: this._selectedEditTitle(), onClick: this._closeMacroEditor }
    ])}
                  <div class="detail-title">${editor.name}</div>
                </div>
                ${this._renderDirtyChip()}
                ${canRename ? T`
                      <div class="detail-title-actions">
                        <button
                          class="icon-btn"
                          @click=${this._openMacroNameRenameDialog}
                          aria-label=${TOOLS_CARD_STRINGS.backup.renameMacroAria}
                        >
                          <ha-icon icon="mdi:pencil"></ha-icon>
                        </button>
                      </div>
                    ` : A}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main">
                  <div class="quick-access-title">Steps</div>
                  <div class="quick-access-sub">
                    ${this._haSortableReady ? "Drag to reorder. Each step plays a command; set the wait that follows it on the right." : "Each step plays a command; set the wait that follows it on the right."}
                  </div>
                </div>
                <button class="quick-access-add-btn" @click=${this._openAddStepDialog}>
                  <ha-icon icon="mdi:plus"></ha-icon>
                  <span>${TOOLS_CARD_STRINGS.backup.addStep}</span>
                </button>
              </div>
              ${items.length ? T`
                    <div class="quick-access-list">
                      ${sortable ? T`
                            <ha-sortable
                              class="quick-access-sortable"
                              draggable-selector=".quick-access-sortable-item"
                              handle-selector=".quick-access-drag"
                              animation="180"
                              @item-moved=${this._handleStepReorder}
                            >
                              <div class="quick-access-sortable-container">${renderRows()}</div>
                            </ha-sortable>
                          ` : T`<div class="quick-access-sortable-container">${renderRows()}</div>`}
                    </div>
                  ` : T`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.noMacroSteps}</div>`}
            </div>
          </div>
        </div>
        ${this._renderStepDialog()}
        ${this._renderEditRenameDialog()}
      </div>
    `;
  }
  _renderMacroStepRow(item, sortable) {
    const isPower = item.kind === "power";
    const isInput = item.kind === "input";
    const meta = item.kind === "command" && item.hold > 0 ? TOOLS_CARD_STRINGS.backup.holdLabel(this._byteToSeconds(item.hold)) : "";
    const chip = isPower || isInput ? "required" : "command";
    return T`
      <div class="quick-access-sortable-item" data-step-index=${item.index}>
        <div class="quick-access-row">
          ${sortable ? T`<div class="quick-access-drag" aria-hidden="true"><ha-icon icon="mdi:drag-vertical-variant"></ha-icon></div>` : T`<span></span>`}
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${chip}</div>
            </div>
            ${meta ? T`<div class="quick-access-meta">${meta}</div>` : A}
          </div>
          <div class="quick-access-actions">
            <label class="step-wait" title=${TOOLS_CARD_STRINGS.backup.stepWaitAria}>
              <span class="step-wait-caption">${TOOLS_CARD_STRINGS.backup.stepWaitLabel}</span>
              <span class="step-wait-field">
                <input
                  class="step-wait-input"
                  type="number"
                  min="0"
                  max="120"
                  step="0.5"
                  aria-label=${TOOLS_CARD_STRINGS.backup.stepWaitAria}
                  .value=${this._byteToSeconds(item.wait)}
                  @change=${(event) => this._handleStepWaitChange(item, event)}
                />
                <span class="step-wait-unit">${TOOLS_CARD_STRINGS.backup.stepWaitUnit}</span>
              </span>
            </label>
            ${isPower ? A : T`
                  <button class="icon-btn" @click=${() => this._openEditStepDialog(item)} aria-label=${TOOLS_CARD_STRINGS.backup.editStepAria}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  ${isInput ? A : T`
                        <button class="icon-btn icon-btn--danger" @click=${() => this._removeStep(item.index)} aria-label=${TOOLS_CARD_STRINGS.backup.deleteStepAria}>
                          <ha-icon icon="mdi:trash-can-outline"></ha-icon>
                        </button>
                      `}
                `}
          </div>
        </div>
      </div>
    `;
  }
  _renderStepDialog() {
    if (!this._stepDialogOpen || !this.bundle || !this._macroEditor) return A;
    const editor = this._macroEditor;
    const isEdit = this._stepDialogEditIndex !== null;
    const isActivity = editor.scope === "activity";
    const isInput = this._stepKind === "input";
    const devices = bundleEditableDeviceOptions(this.bundle);
    const commandDeviceId = isInput ? this._stepDeviceId : isActivity ? this._stepDeviceId : editor.entityId;
    const commands = commandDeviceId != null ? deviceCommandItems(this.bundle, commandDeviceId) : [];
    const canSave = isInput || this._stepCommandId != null && (!isActivity || this._stepDeviceId != null);
    const title = isInput ? TOOLS_CARD_STRINGS.backup.inputStepTitle : isEdit ? TOOLS_CARD_STRINGS.backup.stepDialogEditTitle : TOOLS_CARD_STRINGS.backup.stepDialogAddTitle;
    return T`
      <div class="modal-backdrop" @click=${this._closeStepDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" @click=${this._closeStepDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isInput ? T`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-input">${TOOLS_CARD_STRINGS.backup.inputStepCommand}</label>
                    <select id="sb-step-input" class="decoded-field-input" @change=${this._handleStepCommandChange}>
                      <option value="" ?selected=${this._stepCommandId == null}>${TOOLS_CARD_STRINGS.backup.inputStepNone}</option>
                      ${commands.map((command) => T`
                        <option value=${command.commandId} ?selected=${command.commandId === this._stepCommandId}>${command.label}</option>
                      `)}
                    </select>
                  </div>
                ` : T`
                  ${isActivity ? this._renderBindingSelect({
      id: "sb-step-device",
      label: TOOLS_CARD_STRINGS.backup.stepDevice,
      value: this._stepDeviceId,
      options: devices.map((device) => ({ value: device.id, label: device.label })),
      onChange: this._handleStepDeviceChange,
      emptyText: TOOLS_CARD_STRINGS.backup.bindingNoDevices
    }) : A}
                  ${this._renderBindingSelect({
      id: "sb-step-command",
      label: TOOLS_CARD_STRINGS.backup.stepCommand,
      value: this._stepCommandId,
      options: commands.map((command) => ({ value: command.commandId, label: command.label })),
      onChange: this._handleStepCommandChange,
      emptyText: TOOLS_CARD_STRINGS.backup.stepNoCommands
    })}
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-hold">${TOOLS_CARD_STRINGS.backup.stepHoldSeconds}</label>
                    <input
                      id="sb-step-hold"
                      class="decoded-field-input"
                      type="number"
                      min="0"
                      max="120"
                      step="0.5"
                      .value=${this._stepHoldSeconds}
                      @input=${this._handleStepHoldInput}
                      @change=${this._handleStepHoldChange}
                    />
                  </div>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._stepError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeStepDialog}>${TOOLS_CARD_STRINGS.backup.stepCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyStep} ?disabled=${!canSave}>
                ${isEdit ? TOOLS_CARD_STRINGS.backup.stepSave : TOOLS_CARD_STRINGS.backup.stepAdd}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  // ── Power On/Off setup (shared by Device and Activity details) ──────
  _powerSetupStepCount(scope, entityId, buttonId) {
    if (!this.bundle) return 0;
    return scope === "device" ? deviceMacroStepItems(this.bundle, entityId, buttonId).length : activityMacroStepItems(this.bundle, entityId, buttonId).length;
  }
  _renderPowerSetupRow(scope, entityId, buttonId, label, disabled) {
    const count = this._powerSetupStepCount(scope, entityId, buttonId);
    return T`
      <div class="quick-access-sortable-item">
        <button
          class="edit-selection-row"
          aria-disabled=${disabled ? "true" : "false"}
          tabindex=${disabled ? "-1" : "0"}
          @click=${() => {
      if (!disabled) this._openMacroEditor(scope, entityId, buttonId, label);
    }}
        >
          <span class="selection-main">
            <span class="selection-label">${label}</span>
            <span class="selection-sub">${TOOLS_CARD_STRINGS.backup.macroStepsCount(count)}</span>
          </span>
          <span class="selection-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
        </button>
      </div>
    `;
  }
  // The device Power section folds two concepts the hub keeps separate but
  // the app presents together: the automatic-power / idle-behavior selector
  // (one 0x0242 byte) and the POWER_ON/POWER_OFF command sequences. Choosing
  // "Don't control power" makes the hub ignore the sequences, so they render
  // inert. Activities have no idle behavior, so they get only the sequences.
  _renderPowerSetupSection(scope, entityId) {
    if (this.entityId == null || !this.bundle) return A;
    const S4 = TOOLS_CARD_STRINGS.backup;
    const isDevice = scope === "device";
    const mode = isDevice ? deviceIdleBehavior(this.bundle, entityId) : null;
    const sequencesDisabled = isDevice && mode === IDLE_BEHAVIOR_DISABLED;
    return T`
      <div class="quick-access-section" data-edit-section="power">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">${S4.powerSetupTitle}</div>
            <div class="quick-access-sub">
              ${isDevice ? S4.powerSetupDeviceSub : S4.powerSetupActivitySub}
            </div>
          </div>
        </div>
        ${isDevice ? this._renderPowerControlDropdown(entityId, mode) : A}
        <div class="quick-access-list">
          ${sequencesDisabled ? T`<div class="power-sequences-note">${S4.powerSequencesDisabledNote}</div>` : A}
          <div
            class="quick-access-sortable-container power-sequences"
            data-disabled=${sequencesDisabled ? "true" : "false"}
          >
            ${this._renderPowerSetupRow(scope, entityId, 198, S4.powerOnLabel, sequencesDisabled)}
            ${this._renderPowerSetupRow(scope, entityId, 199, S4.powerOffLabel, sequencesDisabled)}
          </div>
        </div>
      </div>
    `;
  }
  // ── Automatic power control selector (device only) ──────────────────
  // One hub byte (the 0x0242 reply) encodes both the "Power On/Off Setup"
  // toggle and the "Idle Behavior" choice, so it surfaces here as a single
  // two-line dropdown. It lives in its own hub query, not the device
  // record, so it is captured/restored separately.
  _powerControlOptions() {
    const S4 = TOOLS_CARD_STRINGS.backup;
    return [
      { mode: IDLE_BEHAVIOR_DISABLED, label: S4.powerControlDisabled, sub: S4.powerControlDisabledSub },
      { mode: IDLE_BEHAVIOR_AUTO_OFF, label: S4.powerControlAutoOff, sub: S4.powerControlAutoOffSub },
      { mode: IDLE_BEHAVIOR_STAY_ON, label: S4.powerControlStayOn, sub: S4.powerControlStayOnSub },
      { mode: IDLE_BEHAVIOR_ALWAYS_ON, label: S4.powerControlAlwaysOn, sub: S4.powerControlAlwaysOnSub }
    ];
  }
  _selectPowerControl(deviceId, mode) {
    this._powerControlMenuOpen = false;
    if (!this.bundle) return;
    if (deviceIdleBehavior(this.bundle, deviceId) === mode) return;
    this._commitEditBundleEdit(updateBundleDeviceIdleBehavior(this.bundle, deviceId, mode));
  }
  _renderPowerControlDropdown(deviceId, mode) {
    const S4 = TOOLS_CARD_STRINGS.backup;
    const options = this._powerControlOptions();
    const selected = options.find((opt) => opt.mode === mode) ?? null;
    const open = this._powerControlMenuOpen;
    return T`
      <div class="power-control" data-open=${open ? "true" : "false"}>
        <button
          class="power-control-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          @click=${this._togglePowerControlMenu}
        >
          <span class="selection-main">
            <span class="selection-label">${selected ? selected.label : S4.powerControlUnset}</span>
            <span class="selection-sub">${selected ? selected.sub : S4.powerControlUnsetSub}</span>
          </span>
          <span class="selection-chevron"><ha-icon icon="mdi:chevron-down"></ha-icon></span>
        </button>
        ${open ? T`
              <button
                class="power-control-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${this._togglePowerControlMenu}
              ></button>
              <div class="power-control-menu" role="listbox" aria-label=${S4.powerControlTitle}>
                ${options.map((opt) => {
      const isSel = opt.mode === mode;
      return T`
                    <button
                      class="power-control-option"
                      type="button"
                      role="option"
                      aria-selected=${isSel ? "true" : "false"}
                      aria-checked=${isSel ? "true" : "false"}
                      @click=${() => this._selectPowerControl(deviceId, opt.mode)}
                    >
                      <span class="selection-main">
                        <span class="selection-label">${opt.label}</span>
                        <span class="selection-sub">${opt.sub}</span>
                      </span>
                      <span class="selection-chevron">
                        ${isSel ? T`<ha-icon icon="mdi:check"></ha-icon>` : A}
                      </span>
                    </button>
                  `;
    })}
              </div>
            ` : A}
      </div>
    `;
  }
  _selectedEditTitle() {
    if (!this.bundle || !this.kind || this.entityId == null) return "";
    const options = this.kind === "activity" ? bundleActivityOptions(this.bundle) : bundleDeviceOptions(this.bundle);
    return options.find((option) => option.id === this.entityId)?.label || "";
  }
};
if (!customElements.get("sofabaton-edit-detail-view")) {
  customElements.define("sofabaton-edit-detail-view", SofabatonEditDetailView);
}

// tests/frontend/edit-detail-view.test.ts
var EditDetailViewElement = customElements.get("sofabaton-edit-detail-view");
function editorBundle(model = "X1S") {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { name: "Living Room", version: model },
    devices: [
      {
        device: { device_id: 1, name: "Television", device_class: "ir" },
        commands: [{
          command_id: 10,
          name: "Power",
          restore_data: {
            transport: "hub_code_record",
            library_type: 14,
            command_code: "00 00 00 00 00 10",
            data_hex: "aa bb cc"
          }
        }]
      },
      {
        device: { device_id: 2, name: "Roku", device_class: "wifi_roku", ip_address: "192.0.2.10" },
        commands: [{ command_id: 20, name: "Home" }]
      },
      {
        device: { device_id: 3, name: "Soundbar", device_class: "ir" },
        commands: [{ command_id: 30, name: "Volume Up" }]
      }
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [1],
      favorite_slots: [{ button_id: 1, device_id: 1, command_id: 10, name: "Power" }],
      button_bindings: [],
      macros: [
        {
          button_id: 3,
          name: "Volume Combo",
          steps: [{ device_id: 1, command_id: 10, button_code: 19978, duration: 0, delay: 255 }]
        },
        {
          button_id: 198,
          name: "POWER_ON",
          steps: [
            { device_id: 1, command_id: 198, button_code: 0, duration: 0, delay: 255 },
            { device_id: 1, command_id: 197, button_code: 0, duration: 0, delay: 255 }
          ]
        },
        {
          button_id: 199,
          name: "POWER_OFF",
          steps: [{ device_id: 1, command_id: 199, button_code: 0, duration: 0, delay: 255 }]
        }
      ]
    }]
  };
}
function createEditor(model = "X1S", kind = "activity") {
  const element = new EditDetailViewElement();
  element.bundle = editorBundle(model);
  element.kind = kind;
  element.entityId = kind === "activity" ? 101 : 1;
  element.mode = "backup";
  return element;
}
function controlEvent(value) {
  const control = { value };
  return { currentTarget: control, target: control };
}
function mutableControlEvent(value) {
  const control = { value };
  return { event: { currentTarget: control, target: control }, control };
}
function collectBundleChanges(element) {
  const changes = [];
  element.addEventListener("bundle-change", (event) => {
    changes.push(event.detail.bundle);
  });
  return changes;
}
function templateText(template) {
  if (typeof template === "string") return template;
  if (Array.isArray(template)) return template.map(templateText).join("");
  if (template && typeof template === "object") {
    const value = template;
    return templateText(value.strings ?? []) + templateText(value.values ?? []);
  }
  return "";
}
test("name input applies the model-specific sanitizer and 20-character cap", () => {
  const cases = [
    { model: "X1", raw: "TV+ Room_\xE9!42", expected: "TV Room42" },
    { model: "X1S", raw: "TV+ Room_\xE9!42", expected: "TV+ Room_\xE9!42" },
    { model: "X2", raw: "TV+ Room_\xE9!42", expected: "TV+ Room_\xE9!42" },
    { model: "X1S", raw: "Ok/Select \u{1F600}", expected: "Ok/Select " }
  ];
  for (const { model, raw, expected } of cases) {
    const element = createEditor(model);
    element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
    const { event, control } = mutableControlEvent(raw);
    element._handleEditRenameDialogInput(event);
    assert.equal(control.value, expected);
    assert.equal(element._editRenameDialogDraft, expected);
    assert.equal(sanitizeBundleName(element.bundle, "A".repeat(35)), "A".repeat(30));
  }
});
test("rename Save emits the exact sanitized bundle while invalid input emits nothing", () => {
  const element = createEditor("X1");
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
  element._handleEditRenameDialogInput(controlEvent("!!!"));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 0);
  assert.match(element._editRenameDialogError, /Enter a name/i);
  assert.equal(element._editRenameDialogOpen, true);
  element._handleEditRenameDialogInput(controlEvent("Movie+ Night"));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].activities[0].device?.name, "Movie Night");
  assert.equal(element._editRenameDialogOpen, false);
});
test("rename Cancel clears transient state without mutating or emitting", () => {
  const element = createEditor();
  const original = structuredClone(element.bundle);
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
  element._editRenameDialogDraft = "Unsaved name";
  element._editRenameDialogError = "old error";
  element._closeEditRenameDialog();
  assert.deepEqual(element.bundle, original);
  assert.equal(changes.length, 0);
  assert.equal(element._editRenameDialogOpen, false);
  assert.equal(element._editRenameDialogDraft, "");
  assert.equal(element._editRenameDialogTarget, null);
  assert.equal(element._editRenameDialogError, "");
});
test("rename dialog supports both Home Assistant text-field implementations", () => {
  const element = createEditor();
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "detail", entityKind: "activity", entityId: 101 };
  element._editRenameDialogDraft = "Watch TV";
  assert.equal(useLegacyTextField(), false);
  assert.match(templateText(element._renderEditRenameDialog()), /ha-input/);
  customElements.define("ha-textfield", class extends i3 {
  });
  assert.equal(useLegacyTextField(), true);
  assert.match(templateText(element._renderEditRenameDialog()), /ha-textfield/);
  customElements.define("ha-input", class extends i3 {
  });
  assert.equal(useLegacyTextField(), false);
  assert.match(templateText(element._renderEditRenameDialog()), /ha-input/);
});
test("device IP Save rejects malformed IPv4 and commits a trimmed valid address", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "device_ip", deviceId: 2 };
  element._handleEditRenameDialogInput(controlEvent("192.168.1.256"));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 0);
  assert.match(element._editRenameDialogError, /IPv4 address/i);
  assert.equal(element._editRenameDialogOpen, true);
  element._handleEditRenameDialogInput(controlEvent(" 198.51.100.7 "));
  element._applyEditRenameDialog();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].devices[1].device?.ip_address, "198.51.100.7");
  assert.equal(element._editRenameDialogOpen, false);
});
test("the Network section offers the IP pencil in live mode too", () => {
  for (const mode of ["backup", "live"]) {
    const element = createEditor("X1S", "device");
    element.entityId = 2;
    element.mode = mode;
    const text = templateText(element._renderDeviceNetworkSection());
    assert.match(text, /192\.0\.2\.10/);
    assert.match(text, /Edit IP address/);
  }
});
test("clearing the device IP is a valid committed edit", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._editRenameDialogOpen = true;
  element._editRenameDialogTarget = { kind: "device_ip", deviceId: 2 };
  element._editRenameDialogDraft = "   ";
  element._applyEditRenameDialog();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].devices[1].device?.ip_address ?? "", "");
});
test("raw payload Save blocks invalid hex and normalizes tolerant valid input", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._payloadDialogOpen = true;
  element._payloadDialogTarget = { deviceId: 1, commandId: 10 };
  element._payloadDialogDecodedSnapshot = null;
  element._payloadDialogRawSnapshot = "aa bb cc";
  element._payloadDialogRawDraft = "abc";
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 0);
  assert.match(element._payloadDialogError, /even number of hex digits/i);
  assert.equal(element._payloadDialogOpen, true);
  element._handleRawPayloadInput(controlEvent("0xDE ad\nBE,ef"));
  assert.equal(element._payloadDialogError, "");
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 1);
  const command = changes[0].devices[0].commands?.find((row) => row.command_id === 10);
  assert.equal(command?.restore_data?.data_hex, "de ad be ef");
  assert.equal(element._payloadDialogOpen, false);
});
test("raw payload Save does not emit when only formatting changed", () => {
  const element = createEditor("X1S", "device");
  const changes = collectBundleChanges(element);
  element._payloadDialogOpen = true;
  element._payloadDialogTarget = { deviceId: 1, commandId: 10 };
  element._payloadDialogDecodedSnapshot = null;
  element._payloadDialogRawSnapshot = "aa bb cc";
  element._payloadDialogRawDraft = "0xAA 0xBB 0xCC";
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 0);
  assert.equal(element._payloadDialogOpen, false);
});
test("decoded-field drafts preserve numeric, escaped, and CRLF wire shapes", () => {
  const element = createEditor("X1S", "device");
  assert.equal(element._draftToFieldValue("42", { numeric: true }), 42);
  assert.equal(element._draftToFieldValue("not-a-number", { numeric: true }), 0);
  assert.equal(element._draftToFieldValue("line\\nnext\\r", { escapedDisplay: true }), "line\nnext\r");
  assert.equal(element._draftToFieldValue("one\ntwo\r\nthree", { crlfOnWire: true }), "one\r\ntwo\r\nthree");
  assert.equal(element._fieldValueToDraft("one\r\ntwo", { escapedDisplay: true }), "one\\r\\ntwo");
});
test("macro timing conversion covers invalid, boundary, rounding, and saturation cases", () => {
  const element = createEditor();
  const cases = [
    ["", 0],
    ["-1", 0],
    ["0", 0],
    ["0.24", 0],
    ["0.25", 1],
    ["0.3", 1],
    ["0.5", 1],
    ["120", 240],
    ["127.5", 255],
    ["128", 255],
    ["NaN", 0],
    ["Infinity", 0]
  ];
  for (const [raw, expected] of cases) assert.equal(element._secondsToByte(raw), expected, raw);
  assert.equal(element._snapHalfSeconds("0.3"), "0.5");
  assert.equal(element._snapHalfSeconds("-2"), "0");
  assert.equal(element._snapHalfSeconds("999"), "127.5");
});
test("wait change snaps the control and emits the exact attached delay row", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._macroEditor = { scope: "activity", entityId: 101, buttonId: 3, name: "Volume Combo" };
  const { event, control } = mutableControlEvent("0.3");
  element._handleStepWaitChange({ index: 0 }, event);
  assert.equal(control.value, "0.5");
  assert.equal(changes.length, 1);
  const macro = changes[0].activities[0].macros?.find((row) => row.button_id === 3);
  assert.deepEqual(
    macro?.steps?.map((step) => [step.device_id, step.command_id, step.delay]),
    [[1, 10, 255], [255, 255, 1]]
  );
});
test("macro step Save blocks incomplete input and commits a quantized valid step", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._macroEditor = { scope: "activity", entityId: 101, buttonId: 3, name: "Volume Combo" };
  element._stepDialogOpen = true;
  element._stepDialogEditIndex = null;
  element._stepKind = "command";
  element._stepDeviceId = 3;
  element._stepCommandId = null;
  element._stepHoldSeconds = "0.3";
  element._applyStep();
  assert.equal(changes.length, 0);
  assert.notEqual(element._stepError, "");
  assert.equal(element._stepDialogOpen, true);
  element._stepCommandId = 30;
  element._applyStep();
  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  const macro = activity.macros?.find((row) => row.button_id === 3);
  assert.deepEqual(
    macro?.steps?.filter((step) => step.device_id !== 255).map((step) => [step.device_id, step.command_id, step.duration]),
    [[1, 10, 0], [3, 30, 1]]
  );
  assert.deepEqual(activity.referenced_source_device_ids, [1, 3]);
  assert.equal(element._stepDialogOpen, false);
});
test("favorite Save blocks an incomplete selection and sanitizes the committed label", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._addFavoriteOpen = true;
  element._addFavoriteDeviceId = null;
  element._addFavoriteCommandId = null;
  element._addFavoriteName = "";
  element._applyAddFavorite();
  assert.equal(changes.length, 0);
  assert.notEqual(element._addFavoriteError, "");
  assert.equal(element._addFavoriteOpen, true);
  element._handleAddFavoriteDeviceChange(controlEvent("3"));
  element._handleAddFavoriteCommandChange(controlEvent("30"));
  element._handleAddFavoriteNameInput(controlEvent("Sound+bar! " + "X".repeat(30)));
  element._applyAddFavorite();
  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  const added = activity.favorite_slots?.find((slot) => slot.device_id === 3);
  assert.equal(added?.name, "Sound+bar! " + "X".repeat(19));
  assert.deepEqual(activity.referenced_source_device_ids, [1, 3]);
  assert.equal(element._addFavoriteOpen, false);
});
test("binding Save blocks incomplete input and links a valid command target", () => {
  const element = createEditor();
  const changes = collectBundleChanges(element);
  element._bindingDialogOpen = true;
  element._bindingScope = "activity";
  element._bindingButtonId = 176;
  element._bindingTargetKind = "command";
  element._bindingLongPressEnabled = false;
  element._bindingDeviceId = 3;
  element._bindingCommandId = null;
  element._applyBinding();
  assert.equal(changes.length, 0);
  assert.notEqual(element._bindingError, "");
  assert.equal(element._bindingDialogOpen, true);
  element._bindingCommandId = 30;
  element._applyBinding();
  assert.equal(changes.length, 1);
  const activity = changes[0].activities[0];
  assert.deepEqual(activity.button_bindings, [
    { button_id: 176, button_name: "OK", device_id: 3, command_id: 30 }
  ]);
  assert.deepEqual(activity.referenced_source_device_ids, [1, 3]);
  assert.equal(element._bindingDialogOpen, false);
});
function createLiveDeviceEditor() {
  const element = createEditor("X1S", "device");
  element.entityId = 1;
  element.mode = "live";
  element.bundle.devices[0].commands[0] = { command_id: 10, name: "Power" };
  return element;
}
test("the Test button gates on IR; editing is offered for all classes", () => {
  const element = createEditor("X1S", "device");
  element.mode = "live";
  element.entityId = 1;
  assert.equal(element._liveDeviceIsIr(), true);
  element.entityId = 2;
  assert.equal(element._liveDeviceIsIr(), false);
});
test("live command rename commits a name change", () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  element._openDeviceCommandRenameDialog(10);
  assert.equal(element._editRenameDialogOpen, true);
  element._editRenameDialogDraft = "Power Toggle";
  element._applyEditRenameDialog();
  assert.equal(changes.length, 1);
  assert.equal(changes[0].devices[0].commands[0].name, "Power Toggle");
  assert.equal(element._editRenameDialogOpen, false);
});
test("live payload editing works for a non-IR device via the structured form", async () => {
  const element = createEditor("X1S", "device");
  element.entityId = 2;
  element.mode = "live";
  const changes = collectBundleChanges(element);
  element.fetchCommandPayload = async () => ({
    dataHex: "1e 6c 61 75 6e 63 68",
    decoded: { class: "wifi_roku", trailer_hex: "", fields: { path: "launch/1234" } }
  });
  await element._liveFetchAndOpenPayload(20);
  assert.equal(element._payloadDialogOpen, true);
  assert.equal(element._payloadDialogDecodedSnapshot.className, "wifi_roku");
  element._payloadDialogDecodedDrafts = { ...element._payloadDialogDecodedDrafts, path: "launch/9999" };
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 1);
  const command = changes[0].devices[1].commands[0];
  assert.equal(command.restore_data.decoded.edited, true);
  assert.equal(command.restore_data.decoded.fields.path, "launch/9999");
});
test("live payload edit fetches on demand, edits, and commits the edited marker", async () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  let fetchArgs = null;
  element.fetchCommandPayload = async (deviceId, commandId) => {
    fetchArgs = { deviceId, commandId };
    return { dataHex: "0a 4f 22", decoded: null };
  };
  await element._liveFetchAndOpenPayload(10);
  assert.deepEqual(fetchArgs, { deviceId: 1, commandId: 10 });
  assert.equal(element._payloadDialogOpen, true);
  assert.equal(element._payloadDialogRawDraft, "0a 4f 22");
  assert.equal(changes.length, 0);
  element._payloadDialogRawDraft = "de ad be ef";
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 1);
  const command = changes[0].devices[0].commands[0];
  assert.equal(command.restore_data.data_hex, "de ad be ef");
  assert.equal(command.restore_data.edited, true);
  assert.equal(element._payloadDialogOpen, false);
});
test("live payload edit with no change commits nothing", async () => {
  const element = createLiveDeviceEditor();
  const changes = collectBundleChanges(element);
  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });
  await element._liveFetchAndOpenPayload(10);
  element._applyCommandPayloadDialog();
  assert.equal(changes.length, 0);
  assert.equal(element._payloadDialogOpen, false);
});
test("live payload Test plays the current draft via the host callback", async () => {
  const element = createLiveDeviceEditor();
  let played = null;
  element.testCommandPayload = async (hex) => {
    played = hex;
  };
  element.fetchCommandPayload = async () => ({ dataHex: "0a 4f 22", decoded: null });
  await element._liveFetchAndOpenPayload(10);
  element._payloadDialogRawDraft = "de ad be ef";
  await element._runLivePayloadTest();
  assert.equal(played, "de ad be ef");
  assert.equal(element._payloadDialogTestStatus, "success");
});
test("live payload fetch failure surfaces an error and opens nothing", async () => {
  const element = createLiveDeviceEditor();
  element.fetchCommandPayload = async () => {
    throw new Error("hub busy");
  };
  await element._liveFetchAndOpenPayload(10);
  assert.equal(element._payloadDialogOpen, false);
  assert.equal(element._payloadFetchError, "hub busy");
  assert.equal(element._payloadFetchingCommandId, null);
});
test("delete confirm copy matches the mode and delete kind", () => {
  const element = createEditor("X1S", "device");
  element.entityId = 1;
  element._confirmDeleteLabel = "Television";
  element._confirmDeleteTarget = { kind: "device", deviceId: 1 };
  element.mode = "backup";
  let text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("Replace restore"));
  element.mode = "live";
  text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("applied to the hub immediately"));
  assert.ok(!text.includes("Replace restore"));
  assert.ok(!text.includes("loaded backup"));
  assert.ok(!text.includes("in the backup"));
  element.kind = "activity";
  element.entityId = 101;
  element._confirmDeleteTarget = { kind: "macro", activityId: 101, buttonId: 3 };
  element._confirmDeleteLabel = "Volume Combo";
  text = templateText(element._renderDeleteConfirmDialog());
  assert.ok(text.includes("next Sync"));
  assert.ok(!text.includes("Replace restore"));
});
test("payload test hint shows only when editing an IR command", () => {
  const element = createLiveDeviceEditor();
  element._payloadDialogOpen = true;
  element._payloadDialogTarget = { deviceId: 1, commandId: 10 };
  element._payloadDialogDecodedSnapshot = null;
  element._payloadDialogRawDraft = "0a 4f 22";
  let text = templateText(element._renderCommandPayloadDialog());
  assert.ok(text.includes("Verify a changed payload"));
  element.entityId = 2;
  element._payloadDialogTarget = { deviceId: 2, commandId: 20 };
  text = templateText(element._renderCommandPayloadDialog());
  assert.ok(!text.includes("Verify a changed payload"));
});
