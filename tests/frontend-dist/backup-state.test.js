// tests/frontend/backup-state.test.ts
import test from "node:test";
import assert from "node:assert/strict";

// custom_components/sofabaton_x1s/www/src/shared/ha-context.ts
var BACKUP_BUNDLE_SCHEMA_VERSION = 5;

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

// custom_components/sofabaton_x1s/www/src/tabs/backup-state.ts
var HUB_VERSION_RANK = {
  X1: 1,
  X1S: 2,
  X2: 3
};
var INTERNAL_POWER_MACRO_BUTTON_IDS = /* @__PURE__ */ new Set([198, 199]);
function forcedRestoreDeviceIds(bundle2, selectedActivityIds) {
  const selected = new Set(selectedActivityIds.map((value) => Number(value)));
  const forced = /* @__PURE__ */ new Set();
  for (const activity of bundle2?.activities ?? []) {
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
function backupUsesWholeHub(selectedActivityIds) {
  return (selectedActivityIds ?? []).length > 0;
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
  const bundle2 = raw;
  if (String(bundle2.kind || "") !== "hub_bundle") {
    throw new Error("Backup file is not a Sofabaton hub bundle.");
  }
  if (Number(bundle2.schema_version || 0) !== BACKUP_BUNDLE_SCHEMA_VERSION) {
    throw new Error(
      `Backup file schema_version must be ${BACKUP_BUNDLE_SCHEMA_VERSION} (got ${String(bundle2.schema_version || "") || "unknown"}).`
    );
  }
  if (!Array.isArray(bundle2.devices) || !Array.isArray(bundle2.activities)) {
    throw new Error("Backup file is missing devices or activities arrays.");
  }
  return bundle2;
}
function normalizeHubVersion(value) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.includes("X1S")) return "X1S";
  if (normalized.includes("X2")) return "X2";
  if (normalized.includes("X1")) return "X1";
  return null;
}
function updateActivity(bundle2, activityId, updater) {
  const normalizedId = Number(activityId);
  return {
    ...bundle2,
    activities: (bundle2.activities ?? []).map((activity) => {
      if (Number(activity?.device?.device_id || 0) !== normalizedId) return activity;
      return updater(activity);
    })
  };
}
function commandLabelFor(bundle2, deviceId, commandId) {
  const device = (bundle2.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  const command = (device?.commands ?? []).find((entry) => Number(entry?.command_id || 0) === Number(commandId));
  return String(command?.name || "").trim();
}
var IDLE_BEHAVIOR_DISABLED = 4;
function deviceIdleBehavior(bundle2, deviceId) {
  if (!bundle2) return null;
  const normalizedId = Number(deviceId);
  const device = (bundle2.devices ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === normalizedId
  );
  if (!device?.device) return null;
  const raw = device.device.idle_behavior ?? device.device.power_mode;
  if (raw == null) return null;
  const mode = Number(raw);
  return Number.isFinite(mode) ? mode & 255 : null;
}
function updateBundleDeviceIdleBehavior(bundle2, deviceId, mode) {
  const normalizedId = Number(deviceId);
  const normalizedMode = Number(mode) & 255;
  return {
    ...bundle2,
    devices: (bundle2.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedId) return device;
      if (!device.device) return device;
      return {
        ...device,
        device: { ...device.device, idle_behavior: normalizedMode }
      };
    })
  };
}
function reorderBundleActivityQuickAccess(bundle2, activityId, orderedItems) {
  const normalizedActivityId = Number(activityId);
  const activity = (bundle2.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedActivityId);
  if (!activity) return bundle2;
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
  orderedItems.forEach((item, index) => {
    const nextButtonId = index + 1;
    if (item.kind === "macro") {
      const row2 = macrosByButtonId.get(Number(item.buttonId));
      if (row2) macroRows.push({ ...row2, button_id: nextButtonId });
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
  return updateActivity(bundle2, normalizedActivityId, (current) => ({
    ...current,
    macros: macroRows,
    favorite_slots: favoriteRows
  }));
}
function stepMatchesDevice(step, deviceId) {
  return Number(step?.device_id || 0) === deviceId;
}
function stepMatchesCommand(step, deviceId, commandId) {
  return Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === commandId;
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
function bundleDeleteImpact(bundle2, target) {
  const empty = { favorites: 0, macroSteps: 0, activities: 0, bindings: 0 };
  if (!bundle2) return empty;
  if (target.kind === "device") {
    const deviceId = Number(target.deviceId);
    let favorites = 0;
    let macroSteps = 0;
    let activities = 0;
    let bindings = 0;
    for (const activity of bundle2.activities ?? []) {
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
    return { favorites, macroSteps, activities, bindings };
  }
  if (target.kind === "command") {
    const deviceId = Number(target.deviceId);
    const commandId = Number(target.commandId);
    let favorites = 0;
    let macroSteps = 0;
    let bindings = 0;
    for (const activity of bundle2.activities ?? []) {
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
    const device = (bundle2.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === deviceId);
    bindings += countAffectedBindings(
      device?.button_bindings,
      (binding) => cascadeBindingForDeletedCommand(binding, deviceId, commandId, true)
    );
    return { favorites, macroSteps, activities: 0, bindings };
  }
  return empty;
}
function deleteBundleActivity(bundle2, activityId) {
  const id = Number(activityId);
  return {
    ...bundle2,
    activities: (bundle2.activities ?? []).filter((activity) => Number(activity?.device?.device_id || 0) !== id)
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
function deleteBundleDevice(bundle2, deviceId) {
  const id = Number(deviceId);
  const next = {
    ...bundle2,
    devices: (bundle2.devices ?? []).filter((device) => Number(device?.device?.device_id || 0) !== id),
    activities: (bundle2.activities ?? []).map((activity) => stripDeviceFromActivity(activity, id))
  };
  return reconcileBundlePowerMacros(next);
}
function deleteBundleDeviceCommand(bundle2, deviceId, commandId) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  const next = {
    ...bundle2,
    devices: (bundle2.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      return {
        ...device,
        commands: (device.commands ?? []).filter((command) => Number(command?.command_id || 0) !== cId),
        button_bindings: applyBindingCascade(
          device.button_bindings,
          (binding) => cascadeBindingForDeletedCommand(binding, dId, cId, true)
        )
      };
    }),
    activities: (bundle2.activities ?? []).map((activity) => ({
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
  return reconcileBundlePowerMacros(next);
}
function deleteBundleActivityQuickAccess(bundle2, activityId, kind, buttonId) {
  const bId = Number(buttonId);
  const next = updateActivity(bundle2, activityId, (activity) => {
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
  return reconcileActivityPowerMacros(next, Number(activityId));
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
function addBundleActivityFavorite(bundle2, activityId, deviceId, commandId, name) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  if (dId <= 0 || cId <= 0) return bundle2;
  const trimmed = String(name ?? "").trim();
  const next = updateActivity(bundle2, activityId, (activity) => {
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
function applyBundleDelete(bundle2, target) {
  switch (target.kind) {
    case "activity":
      return deleteBundleActivity(bundle2, target.activityId);
    case "device":
      return deleteBundleDevice(bundle2, target.deviceId);
    case "command":
      return deleteBundleDeviceCommand(bundle2, target.deviceId, target.commandId);
    case "favorite":
      return deleteBundleActivityQuickAccess(bundle2, target.activityId, "favorite", target.buttonId);
    case "macro":
      return deleteBundleActivityQuickAccess(bundle2, target.activityId, "macro", target.buttonId);
    case "activity_binding":
      return deleteActivityButtonBinding(bundle2, target.activityId, target.buttonId);
    case "device_binding":
      return deleteDeviceButtonBinding(bundle2, target.deviceId, target.buttonId);
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
function activityMemberDeviceIds(activity) {
  const selfId = Number(activity?.device?.device_id || 0);
  const ids = activityPowerDeviceIds(activity);
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
  return [...ids].sort((left, right) => left - right);
}
function reconcilePowerMacroSteps(existingSteps, members, refCommands) {
  const memberSet = new Set(members);
  const kept = (existingSteps ?? []).filter((step) => {
    if (isMacroDelayStep(step)) return true;
    const deviceId = Number(step?.device_id || 0);
    return deviceId > 0 ? memberSet.has(deviceId) : true;
  });
  const out = [...kept];
  for (const deviceId of members) {
    for (const command of refCommands) {
      const present = out.some(
        (step) => Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === command
      );
      if (!present) out.push(powerStep(deviceId, command));
    }
  }
  return out;
}
function reconcileActivityPowerMacros(bundle2, activityId) {
  return updateActivity(bundle2, activityId, (activity) => {
    const members = activityMemberDeviceIds(activity);
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
function reconcileBundlePowerMacros(bundle2) {
  let next = bundle2;
  for (const activity of bundle2.activities ?? []) {
    const id = Number(activity?.device?.device_id || 0);
    if (id > 0) next = reconcileActivityPowerMacros(next, id);
  }
  return next;
}
var SYNTHETIC_COMMAND_CODE_BASE = 2e4;
function synthesizeCommandCode(commandId) {
  return SYNTHETIC_COMMAND_CODE_BASE + (Number(commandId) & 255);
}
function findDevice(bundle2, deviceId) {
  return (bundle2?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
}
function inputEntryOrdinal(entry) {
  return Number(entry?.input_index ?? entry?.ordinal ?? 0);
}
function deviceInputEntries(bundle2, deviceId) {
  const device = findDevice(bundle2, deviceId);
  const entries = device?.input_record?.entries ?? [];
  return entries.map((entry) => ({
    commandId: Number(entry?.command_id || 0),
    ordinal: inputEntryOrdinal(entry),
    name: String(entry?.name || entry?.label || "").trim()
  })).filter((entry) => entry.commandId > 0).sort((left, right) => left.ordinal - right.ordinal);
}
function ensureDeviceInput(bundle2, deviceId, commandId) {
  const dId = Number(deviceId);
  const cId = Number(commandId);
  const device = findDevice(bundle2, dId);
  const existingEntries = device?.input_record?.entries ?? [];
  const reused = existingEntries.find((entry) => Number(entry?.command_id || 0) === cId);
  if (reused) {
    return { bundle: bundle2, ordinal: inputEntryOrdinal(reused) };
  }
  const nextOrdinal = existingEntries.reduce((max, entry) => Math.max(max, inputEntryOrdinal(entry)), 0) + 1;
  const newEntry = {
    command_id: cId,
    fid: synthesizeCommandCode(cId),
    input_index: nextOrdinal,
    name: commandLabelFor(bundle2, dId, cId) || `Input ${cId}`
  };
  const nextBundle = {
    ...bundle2,
    devices: (bundle2.devices ?? []).map((entry) => {
      if (Number(entry?.device?.device_id || 0) !== dId) return entry;
      const record = { ...entry.input_record ?? {} };
      record.entries = [...existingEntries, newEntry];
      return { ...entry, input_record: record };
    })
  };
  return { bundle: nextBundle, ordinal: nextOrdinal };
}
function activityPowerDevices(bundle2, activityId) {
  if (!bundle2) return [];
  const activity = (bundle2.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  if (!activity) return [];
  const powerOn = (activity.macros ?? []).find((macro) => Number(macro?.button_id || 0) === POWER_ON_MACRO_BUTTON_ID);
  const steps = powerOn?.steps ?? [];
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  for (const step of steps) {
    if (isMacroDelayStep(step)) continue;
    const command = Number(step?.command_id || 0);
    if (command !== DEVICE_POWER_ON_REF_COMMAND && command !== DEVICE_INPUT_REF_COMMAND) continue;
    const deviceId = Number(step?.device_id || 0);
    if (deviceId > 0 && !seen.has(deviceId)) {
      seen.add(deviceId);
      order.push(deviceId);
    }
  }
  return order.map((deviceId) => {
    const inputStep = steps.find(
      (step) => !isMacroDelayStep(step) && Number(step?.device_id || 0) === deviceId && Number(step?.command_id || 0) === DEVICE_INPUT_REF_COMMAND
    );
    const inputOrdinal = Number(inputStep?.duration || 0);
    const input = deviceInputEntries(bundle2, deviceId).find((entry) => entry.ordinal === inputOrdinal);
    return {
      deviceId,
      deviceName: deviceNameFor(bundle2, deviceId),
      inputOrdinal,
      inputCommandId: input?.commandId ?? null,
      inputCommandName: input?.name || (inputOrdinal > 0 ? `Input ${inputOrdinal}` : null)
    };
  });
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
function setActivityDeviceInput(bundle2, activityId, deviceId, commandId) {
  const cId = Number(commandId);
  if (cId <= 0) return bundle2;
  const ensured = ensureDeviceInput(bundle2, deviceId, cId);
  return updateActivity(
    ensured.bundle,
    activityId,
    (activity) => setActivityPowerInputOrdinal(activity, deviceId, ensured.ordinal)
  );
}
function clearActivityDeviceInput(bundle2, activityId, deviceId) {
  return updateActivity(bundle2, activityId, (activity) => setActivityPowerInputOrdinal(activity, deviceId, 0));
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
function deviceMacroStepItems(bundle2, deviceId, buttonId) {
  const device = findDevice(bundle2, deviceId);
  const macro = (device?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const commandId = Number(group.head?.command_id || 0);
    return {
      index,
      kind: "command",
      commandId,
      deviceId: null,
      label: commandNameOrFallback(bundle2, Number(deviceId), commandId),
      hold: Number(group.head?.duration || 0),
      wait: groupWait(group)
    };
  });
}
function updateDeviceMacro(bundle2, deviceId, buttonId, transform) {
  const dId = Number(deviceId);
  const bId = Number(buttonId);
  return {
    ...bundle2,
    devices: (bundle2.devices ?? []).map((device) => {
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
function addDeviceMacroCommandStep(bundle2, deviceId, buttonId, commandId, hold = 0) {
  if (Number(commandId) <= 0) return bundle2;
  return updateDeviceMacro(bundle2, deviceId, buttonId, (steps) => [
    ...steps,
    { command_id: Number(commandId), duration: Number(hold) & 255, delay: 255 }
  ]);
}
function updateDeviceMacroStep(bundle2, deviceId, buttonId, index, patch) {
  return updateDeviceMacro(bundle2, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    group.head = patchMacroStep(group.head, patch, false);
    return flattenMacroGroups(prefix, groups);
  });
}
function setDeviceMacroStepWait(bundle2, deviceId, buttonId, index, wait) {
  return updateDeviceMacro(bundle2, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    applyGroupWait(group, wait, false);
    return flattenMacroGroups(prefix, groups);
  });
}
function removeDeviceMacroStep(bundle2, deviceId, buttonId, index) {
  return updateDeviceMacro(bundle2, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    if (Number(index) < 0 || Number(index) >= groups.length) return steps;
    groups.splice(Number(index), 1);
    return flattenMacroGroups(prefix, groups);
  });
}
function reorderDeviceMacroSteps(bundle2, deviceId, buttonId, orderedIndices) {
  return updateDeviceMacro(bundle2, deviceId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const reordered = orderedIndices.map((i4) => groups[Number(i4)]).filter((group) => Boolean(group));
    if (reordered.length !== groups.length) return steps;
    return flattenMacroGroups(prefix, reordered);
  });
}
function activityMacroStepItems(bundle2, activityId, buttonId) {
  const activity = (bundle2?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  const { groups } = groupMacroSteps(macro?.steps);
  return groups.map((group, index) => {
    const head = group.head;
    const wait = groupWait(group);
    const deviceId = Number(head?.device_id || 0);
    const commandId = Number(head?.command_id || 0);
    const deviceName = deviceNameFor(bundle2, deviceId);
    if (commandId === DEVICE_POWER_ON_REF_COMMAND || commandId === DEVICE_POWER_OFF_REF_COMMAND) {
      const verb = commandId === DEVICE_POWER_ON_REF_COMMAND ? "Power on" : "Power off";
      return { index, kind: "power", commandId, deviceId, label: `${verb} \xB7 ${deviceName}`, hold: 0, wait, protected: true };
    }
    if (commandId === DEVICE_INPUT_REF_COMMAND) {
      const ordinal = Number(head?.duration || 0);
      const input = deviceInputEntries(bundle2, deviceId).find((entry) => entry.ordinal === ordinal);
      const inputLabel = input?.name || (ordinal > 0 ? `Input ${ordinal}` : "no input");
      return { index, kind: "input", commandId: input?.commandId ?? null, deviceId, label: `Input \xB7 ${deviceName}: ${inputLabel}`, hold: 0, wait, protected: true };
    }
    return {
      index,
      kind: "command",
      commandId,
      deviceId,
      label: `${deviceName} \xB7 ${commandNameOrFallback(bundle2, deviceId, commandId)}`,
      hold: Number(head?.duration || 0),
      wait
    };
  });
}
function updateActivityMacro(bundle2, activityId, buttonId, transform) {
  const bId = Number(buttonId);
  const next = updateActivity(bundle2, activityId, (activity) => {
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
  return reconcileActivityPowerMacros(next, Number(activityId));
}
function addActivityUserMacro(bundle2, activityId, name) {
  return updateActivity(bundle2, activityId, (activity) => ({
    ...activity,
    macros: [...activity.macros ?? [], {
      button_id: nextQuickAccessButtonId(activity),
      name: String(name ?? "").trim() || "Macro",
      steps: []
    }]
  }));
}
function addActivityMacroCommandStep(bundle2, activityId, buttonId, deviceId, commandId, hold = 0) {
  if (Number(deviceId) <= 0 || Number(commandId) <= 0) return bundle2;
  return updateActivityMacro(bundle2, activityId, buttonId, (steps) => [...steps, {
    device_id: Number(deviceId),
    command_id: Number(commandId),
    button_code: synthesizeCommandCode(Number(commandId)),
    duration: Number(hold) & 255,
    delay: 255
  }]);
}
function updateActivityMacroStep(bundle2, activityId, buttonId, index, patch) {
  return updateActivityMacro(bundle2, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    group.head = patchMacroStep(group.head, patch, true);
    return flattenMacroGroups(prefix, groups);
  });
}
function setActivityMacroStepWait(bundle2, activityId, buttonId, index, wait) {
  return updateActivityMacro(bundle2, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    applyGroupWait(group, wait, true);
    return flattenMacroGroups(prefix, groups);
  });
}
function removeActivityMacroStep(bundle2, activityId, buttonId, index) {
  return updateActivityMacro(bundle2, activityId, buttonId, (steps) => {
    const { prefix, groups } = groupMacroSteps(steps);
    const group = groups[Number(index)];
    if (!group) return steps;
    if (isPowerRefStep(group.head)) return steps;
    groups.splice(Number(index), 1);
    return flattenMacroGroups(prefix, groups);
  });
}
function reorderActivityMacroSteps(bundle2, activityId, buttonId, orderedIndices) {
  return updateActivityMacro(bundle2, activityId, buttonId, (steps) => {
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
function bundleButtonCatalog(bundle2) {
  if (normalizeHubVersion(bundle2?.hub?.version) === "X2") {
    return [...SHARED_BUTTON_CATALOG, ...X2_EXTRA_BUTTON_CATALOG];
  }
  return [...SHARED_BUTTON_CATALOG];
}
function buttonName(code) {
  return BUTTON_NAME_BY_CODE.get(Number(code)) ?? `Button 0x${Number(code).toString(16).toUpperCase()}`;
}
function deviceNameFor(bundle2, deviceId) {
  const device = (bundle2?.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(deviceId));
  return String(device?.device?.name || "").trim() || `Device ${Number(deviceId)}`;
}
function commandNameOrFallback(bundle2, deviceId, commandId) {
  return commandLabelFor(bundle2, deviceId, commandId) || `Command ${Number(commandId)}`;
}
function activityMacroName(bundle2, activityId, buttonId) {
  const activity = (bundle2?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const macro = (activity?.macros ?? []).find((entry) => Number(entry?.button_id || 0) === Number(buttonId));
  return String(macro?.name || "").trim() || `Macro ${Number(buttonId)}`;
}
function activityBindingTargetLabel(bundle2, activityId, targetDeviceId, targetCommandId) {
  if (targetDeviceId === Number(activityId)) {
    return `Macro \xB7 ${activityMacroName(bundle2, activityId, targetCommandId)}`;
  }
  return `${deviceNameFor(bundle2, targetDeviceId)} \xB7 ${commandNameOrFallback(bundle2, targetDeviceId, targetCommandId)}`;
}
function sortBindingsByButtonId(rows) {
  return [...rows ?? []].sort((left, right) => Number(left?.button_id || 0) - Number(right?.button_id || 0));
}
function activityButtonBindingItems(bundle2, activityId) {
  if (!bundle2) return [];
  const activity = (bundle2.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
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
      shortPressLabel: activityBindingTargetLabel(bundle2, Number(activityId), deviceId, commandId)
    };
    const lpDeviceId = Number(row?.long_press_device_id || 0);
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpDeviceId > 0 && lpCommandId > 0) {
      item.longPress = {
        deviceId: lpDeviceId,
        commandId: lpCommandId,
        isMacroTarget: lpDeviceId === Number(activityId),
        label: activityBindingTargetLabel(bundle2, Number(activityId), lpDeviceId, lpCommandId)
      };
    }
    items.push(item);
  }
  return items;
}
function deviceButtonBindingItems(bundle2, deviceId) {
  if (!bundle2) return [];
  const normalizedDeviceId = Number(deviceId);
  const device = (bundle2.devices ?? []).find((entry) => Number(entry?.device?.device_id || 0) === normalizedDeviceId);
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
      shortPressLabel: commandNameOrFallback(bundle2, normalizedDeviceId, commandId)
    };
    const lpCommandId = Number(row?.long_press_command_id || 0);
    if (lpCommandId > 0) {
      item.longPress = {
        commandId: lpCommandId,
        label: commandNameOrFallback(bundle2, normalizedDeviceId, lpCommandId)
      };
    }
    items.push(item);
  }
  return items;
}
function boundButtonIds(rows) {
  return new Set((rows ?? []).map((row) => Number(row?.button_id || 0)).filter((id) => id > 0));
}
function unboundButtonsForActivity(bundle2, activityId) {
  const activity = (bundle2?.activities ?? []).find((entry) => Number(entry?.device?.device_id || 0) === Number(activityId));
  const used = boundButtonIds(activity?.button_bindings);
  return bundleButtonCatalog(bundle2).filter((entry) => !used.has(entry.code));
}
function upsertBindingRow(rows, row) {
  const buttonId = Number(row.button_id || 0);
  const next = (rows ?? []).filter((entry) => Number(entry?.button_id || 0) !== buttonId);
  next.push(row);
  return sortBindingsByButtonId(next);
}
function upsertActivityButtonBinding(bundle2, activityId, input) {
  const buttonId = Number(input.buttonId);
  const deviceId = Number(input.deviceId);
  const commandId = Number(input.commandId);
  if (buttonId <= 0 || deviceId <= 0 || commandId <= 0) return bundle2;
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
  const next = updateActivity(bundle2, activityId, (activity) => ({
    ...activity,
    button_bindings: upsertBindingRow(activity.button_bindings, row)
  }));
  return reconcileActivityPowerMacros(next, Number(activityId));
}
function upsertDeviceButtonBinding(bundle2, deviceId, input) {
  const normalizedDeviceId = Number(deviceId);
  const buttonId = Number(input.buttonId);
  const commandId = Number(input.commandId);
  if (buttonId <= 0 || commandId <= 0) return bundle2;
  const row = {
    button_id: buttonId,
    button_name: buttonName(buttonId),
    command_id: commandId,
    command_name: commandLabelFor(bundle2, normalizedDeviceId, commandId) || void 0
  };
  const lpCommandId = Number(input.longPressCommandId || 0);
  if (lpCommandId > 0) row.long_press_command_id = lpCommandId;
  return {
    ...bundle2,
    devices: (bundle2.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== normalizedDeviceId) return device;
      return { ...device, button_bindings: upsertBindingRow(device.button_bindings, row) };
    })
  };
}
function deleteActivityButtonBinding(bundle2, activityId, buttonId) {
  const bId = Number(buttonId);
  const next = updateActivity(bundle2, activityId, (activity) => ({
    ...activity,
    button_bindings: (activity.button_bindings ?? []).filter((row) => Number(row?.button_id || 0) !== bId)
  }));
  return reconcileActivityPowerMacros(next, Number(activityId));
}
function deleteDeviceButtonBinding(bundle2, deviceId, buttonId) {
  const dId = Number(deviceId);
  const bId = Number(buttonId);
  return {
    ...bundle2,
    devices: (bundle2.devices ?? []).map((device) => {
      if (Number(device?.device?.device_id || 0) !== dId) return device;
      return {
        ...device,
        button_bindings: (device.button_bindings ?? []).filter((row) => Number(row?.button_id || 0) !== bId)
      };
    })
  };
}
function assertBackupBundleRestoreCompatible(bundle2, destinationHubVersion) {
  const sourceVersion = normalizeHubVersion(bundle2?.hub?.version);
  if (!sourceVersion) {
    throw new Error("Backup file is missing its source hub model, so compatibility cannot be verified.");
  }
  const destinationVersion = normalizeHubVersion(destinationHubVersion);
  if (!destinationVersion) {
    throw new Error("The destination hub model is unknown, so restore compatibility cannot be verified.");
  }
  if (HUB_VERSION_RANK[destinationVersion] < HUB_VERSION_RANK[sourceVersion]) {
    throw new Error(
      `This backup was created on a Sofabaton ${sourceVersion} hub and cannot be restored onto a Sofabaton ${destinationVersion} hub.`
    );
  }
}

// tests/frontend/backup-state.test.ts
var bundle = {
  kind: "hub_bundle",
  schema_version: 5,
  hub: {
    version: "X1"
  },
  devices: [
    { device: { device_id: 1, name: "TV", device_class: "ir" } },
    { device: { device_id: 2, name: "AVR", device_class: "ir" } },
    { device: { device_id: 3, name: "Streamer", device_class: "wifi_ip" } }
  ],
  activities: [
    { device: { device_id: 101, name: "Watch TV", entity_type: "activity" }, referenced_source_device_ids: [1, 2] },
    { device: { device_id: 102, name: "Game", entity_type: "activity" }, referenced_source_device_ids: [2, 3] }
  ]
};
test("backupUsesWholeHub switches on when any activity is selected", () => {
  assert.equal(backupUsesWholeHub([]), false);
  assert.equal(backupUsesWholeHub([101]), true);
});
test("forcedRestoreDeviceIds unions linked devices for selected activities", () => {
  assert.deepEqual(forcedRestoreDeviceIds(bundle, [101]), [1, 2]);
  assert.deepEqual(forcedRestoreDeviceIds(bundle, [101, 102]), [1, 2, 3]);
});
test("reconcileRestoreSelection keeps manual device picks alongside forced ones", () => {
  assert.deepEqual(
    reconcileRestoreSelection({
      bundle,
      selectedActivityIds: [101],
      manualSelectedDeviceIds: [3]
    }),
    {
      forcedDeviceIds: [1, 2],
      selectedDeviceIds: [1, 2, 3]
    }
  );
});
test("pruneBackupBundle keeps only selected devices and activities", () => {
  const pruned = pruneBackupBundle({
    bundle,
    selectedActivityIds: [102],
    selectedDeviceIds: [2, 3]
  });
  assert.deepEqual(
    pruned.devices.map((device) => device.device?.device_id),
    [2, 3]
  );
  assert.deepEqual(
    pruned.activities.map((activity) => activity.device?.device_id),
    [102]
  );
});
test("validateBackupBundle rejects wrong kinds and schemas", () => {
  assert.equal(validateBackupBundle(bundle).kind, "hub_bundle");
  assert.throws(() => validateBackupBundle({ kind: "device_backup", schema_version: 5 }), /not a Sofabaton hub bundle/i);
  assert.throws(() => validateBackupBundle({ kind: "hub_bundle", schema_version: 4, devices: [], activities: [] }), /schema_version must be 5/i);
});
test("normalizeHubVersion canonicalizes known hub model labels", () => {
  assert.equal(normalizeHubVersion("x1"), "X1");
  assert.equal(normalizeHubVersion("Sofabaton X1S"), "X1S");
  assert.equal(normalizeHubVersion("x2 "), "X2");
  assert.equal(normalizeHubVersion("unknown"), null);
});
test("assertBackupBundleRestoreCompatible allows upward-compatible restores only", () => {
  assert.doesNotThrow(() => assertBackupBundleRestoreCompatible(bundle, "X1"));
  assert.doesNotThrow(() => assertBackupBundleRestoreCompatible(bundle, "X1S"));
  assert.doesNotThrow(() => assertBackupBundleRestoreCompatible(bundle, "X2"));
  assert.throws(
    () => assertBackupBundleRestoreCompatible({ ...bundle, hub: { version: "X1S" } }, "X1"),
    /cannot be restored onto a Sofabaton X1 hub/i
  );
  assert.throws(
    () => assertBackupBundleRestoreCompatible({ ...bundle, hub: { version: "X2" } }, "X1S"),
    /cannot be restored onto a Sofabaton X1S hub/i
  );
});
test("assertBackupBundleRestoreCompatible rejects missing source or destination hub models", () => {
  assert.throws(
    () => assertBackupBundleRestoreCompatible({ ...bundle, hub: {} }, "X2"),
    /missing its source hub model/i
  );
  assert.throws(
    () => assertBackupBundleRestoreCompatible(bundle, ""),
    /destination hub model is unknown/i
  );
});
function editableBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      {
        device: { device_id: 1, name: "TV", device_class: "ir" },
        commands: [
          { command_id: 10, name: "Power" },
          { command_id: 11, name: "Volume Up" }
        ]
      },
      { device: { device_id: 2, name: "AVR", device_class: "ir" }, commands: [{ command_id: 20, name: "Power" }] }
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1, 2],
        favorite_slots: [
          { button_id: 1, device_id: 1, command_id: 10, name: "TV Power" },
          { button_id: 2, device_id: 2, command_id: 20, name: "AVR Power" }
        ],
        macros: [
          { button_id: 3, name: "Combo", steps: [
            { device_id: 1, command_id: 11 },
            { device_id: 2, command_id: 20 }
          ] },
          { button_id: 198, name: "POWER_ON", steps: [{ device_id: 1, command_id: 10 }] }
        ]
      }
    ]
  };
}
function activity101(b3) {
  return (b3.activities ?? []).find((a3) => a3.device?.device_id === 101);
}
test("deleteBundleActivity removes only the targeted activity", () => {
  const next = deleteBundleActivity(editableBundle(), 101);
  assert.deepEqual(next.activities.map((a3) => a3.device?.device_id), []);
  assert.equal(next.devices.length, 2);
});
test("deviceIdleBehavior prefers idle_behavior, falls back to power_mode", () => {
  const b3 = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1" },
    devices: [
      { device: { device_id: 1, idle_behavior: 4, power_mode: 1 } },
      { device: { device_id: 2, power_mode: 3 } },
      { device: { device_id: 3 } }
    ],
    activities: []
  };
  assert.equal(deviceIdleBehavior(b3, 1), 4);
  assert.equal(deviceIdleBehavior(b3, 2), 3);
  assert.equal(deviceIdleBehavior(b3, 3), null);
  assert.equal(deviceIdleBehavior(b3, 99), null);
});
test("updateBundleDeviceIdleBehavior writes the dedicated field only on the target", () => {
  const b3 = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1" },
    devices: [
      { device: { device_id: 1, power_mode: 1 } },
      { device: { device_id: 2, idle_behavior: 1 } }
    ],
    activities: []
  };
  const next = updateBundleDeviceIdleBehavior(b3, 1, IDLE_BEHAVIOR_DISABLED);
  assert.equal(deviceIdleBehavior(next, 1), IDLE_BEHAVIOR_DISABLED);
  assert.equal(deviceIdleBehavior(next, 2), 1);
  assert.equal(deviceIdleBehavior(b3, 1), 1);
});
test("deleteBundleDevice clears references across activities", () => {
  const next = deleteBundleDevice(editableBundle(), 1);
  assert.deepEqual(next.devices.map((d3) => d3.device?.device_id), [2]);
  const act = activity101(next);
  assert.deepEqual(act.referenced_source_device_ids, [2]);
  assert.deepEqual(act.favorite_slots?.map((s4) => s4.device_id), [2]);
  assert.deepEqual(act.macros?.find((m3) => m3.button_id === 3)?.steps?.map((s4) => s4.device_id), [2]);
});
test("deleteBundleDeviceCommand removes the command and its exact references", () => {
  const next = deleteBundleDeviceCommand(editableBundle(), 1, 10);
  const device1 = next.devices.find((d3) => d3.device?.device_id === 1);
  assert.deepEqual(device1.commands?.map((c4) => c4.command_id), [11]);
  const act = activity101(next);
  assert.deepEqual(act.favorite_slots?.map((s4) => [s4.device_id, s4.command_id]), [[2, 20]]);
  assert.deepEqual(act.macros?.find((m3) => m3.button_id === 3)?.steps?.map((s4) => s4.command_id), [11, 20]);
});
test("deleteBundleDeviceCommand also removes the deleted command's trailing delay row", () => {
  const b3 = {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [{
      device: { device_id: 1, name: "TV", device_class: "ir" },
      commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol Up" }]
    }],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [1],
      favorite_slots: [],
      macros: [{ button_id: 3, name: "Seq", steps: [
        { device_id: 1, command_id: 10 },
        { device_id: 255, command_id: 255, delay: 5 },
        { device_id: 1, command_id: 11 },
        { device_id: 255, command_id: 255, delay: 3 }
      ] }]
    }]
  };
  const next = deleteBundleDeviceCommand(b3, 1, 10);
  assert.deepEqual(next.activities[0].macros[0].steps, [
    { device_id: 1, command_id: 11 },
    { device_id: 255, command_id: 255, delay: 3 }
  ]);
  assert.deepEqual(
    bundleDeleteImpact(b3, { kind: "command", deviceId: 1, commandId: 10 }),
    { favorites: 0, macroSteps: 2, activities: 0, bindings: 0 }
  );
});
test("deleteBundleActivityQuickAccess removes one row and preserves power macros", () => {
  const noFav = deleteBundleActivityQuickAccess(editableBundle(), 101, "favorite", 1);
  assert.deepEqual(activity101(noFav).favorite_slots?.map((s4) => s4.button_id), [2]);
  const macroIds = activity101(deleteBundleActivityQuickAccess(editableBundle(), 101, "macro", 3)).macros?.map((m3) => m3.button_id);
  assert.equal(macroIds?.includes(3), false);
  assert.equal(macroIds?.includes(198), true);
  assert.equal(macroIds?.includes(199), true);
});
test("addBundleActivityFavorite appends at the next editable slot", () => {
  const next = addBundleActivityFavorite(editableBundle(), 101, 1, 11, "Vol Up");
  const slots = activity101(next).favorite_slots;
  assert.deepEqual(slots[slots.length - 1], { button_id: 4, device_id: 1, command_id: 11, name: "Vol Up" });
  const noop = addBundleActivityFavorite(editableBundle(), 101, 0, 11, "x");
  assert.equal(activity101(noop).favorite_slots?.length, 2);
});
test("bundleDeleteImpact counts cascade references", () => {
  const b3 = editableBundle();
  assert.deepEqual(bundleDeleteImpact(b3, { kind: "device", deviceId: 1 }), { favorites: 1, macroSteps: 2, activities: 1, bindings: 0 });
  assert.deepEqual(bundleDeleteImpact(b3, { kind: "command", deviceId: 2, commandId: 20 }), { favorites: 1, macroSteps: 1, activities: 0, bindings: 0 });
  assert.deepEqual(bundleDeleteImpact(b3, { kind: "activity", activityId: 101 }), { favorites: 0, macroSteps: 0, activities: 0, bindings: 0 });
});
test("reorderBundleActivityQuickAccess preserves internal power macros", () => {
  const next = reorderBundleActivityQuickAccess(editableBundle(), 101, [
    { kind: "macro", buttonId: 3 },
    { kind: "favorite", buttonId: 1 },
    { kind: "favorite", buttonId: 2 }
  ]);
  const act = activity101(next);
  const power = act.macros?.find((m3) => m3.button_id === 198);
  assert.ok(power, "power macro 198 should survive the reorder");
  assert.deepEqual(power?.steps, [{ device_id: 1, command_id: 10 }]);
  assert.equal(act.macros?.find((m3) => m3.name === "Combo")?.button_id, 1);
  assert.deepEqual(act.favorite_slots?.map((s4) => s4.button_id), [2, 3]);
});
test("applyBundleDelete dispatches by target kind", () => {
  const next = applyBundleDelete(editableBundle(), { kind: "command", deviceId: 1, commandId: 10 });
  assert.deepEqual(
    next.devices.find((d3) => d3.device?.device_id === 1)?.commands?.map((c4) => c4.command_id),
    [11]
  );
});
function bindingBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [
      {
        device: { device_id: 1, name: "TV", device_class: "ir" },
        commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol Up" }],
        button_bindings: [
          { button_id: 176, button_name: "OK", command_id: 10, long_press_command_id: 11 }
        ]
      },
      {
        device: { device_id: 2, name: "Soundbar", device_class: "ir" },
        commands: [{ command_id: 20, name: "Power" }]
      }
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1, 2],
        button_bindings: [
          { button_id: 182, button_name: "Volume Up", device_id: 2, command_id: 20 },
          {
            button_id: 176,
            button_name: "OK",
            device_id: 1,
            command_id: 10,
            long_press_device_id: 2,
            long_press_command_id: 20
          }
        ]
      }
    ]
  };
}
test("bundleButtonCatalog adapts to hub model", () => {
  assert.equal(bundleButtonCatalog({ ...bindingBundle(), hub: { version: "X1S" } }).length, 20);
  assert.equal(bundleButtonCatalog(bindingBundle()).length, 27);
});
test("activityButtonBindingItems resolves labels and long-press, sorted by button id", () => {
  const items = activityButtonBindingItems(bindingBundle(), 101);
  assert.deepEqual(items.map((i4) => i4.buttonName), ["OK", "Volume Up"]);
  const ok = items.find((i4) => i4.buttonName === "OK");
  assert.equal(ok.shortPressLabel, "TV \xB7 Power");
  assert.equal(ok.longPress?.label, "Soundbar \xB7 Power");
});
function activityWithMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [
      { device: { device_id: 1, name: "TV", device_class: "ir" }, commands: [{ command_id: 10, name: "Power" }] }
    ],
    activities: [
      {
        device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
        referenced_source_device_ids: [1],
        button_bindings: [],
        macros: [
          { button_id: 5, name: "Movie Night", steps: [
            { device_id: 1, command_id: 10, button_code: 19978, duration: 0, delay: 255 }
          ] }
        ]
      }
    ]
  };
}
test("activityButtonBindingItems labels a macro binding (device_id == activity id)", () => {
  const b3 = upsertActivityButtonBinding(activityWithMacroBundle(), 101, { buttonId: 174, deviceId: 101, commandId: 5 });
  const item = activityButtonBindingItems(b3, 101).find((i4) => i4.buttonId === 174);
  assert.equal(item.isMacroTarget, true);
  assert.equal(item.shortPressLabel, "Macro \xB7 Movie Night");
});
test("binding a macro does not add the activity's own id to power-macro membership", () => {
  const b3 = upsertActivityButtonBinding(activityWithMacroBundle(), 101, { buttonId: 174, deviceId: 101, commandId: 5 });
  assert.equal(b3.activities[0].referenced_source_device_ids.includes(101), false);
  assert.deepEqual(b3.activities[0].referenced_source_device_ids, [1]);
});
test("deleting a macro drops a button bound to it and clears a long-press to it", () => {
  let b3 = upsertActivityButtonBinding(activityWithMacroBundle(), 101, { buttonId: 174, deviceId: 101, commandId: 5 });
  b3 = upsertActivityButtonBinding(b3, 101, {
    buttonId: 178,
    deviceId: 1,
    commandId: 10,
    longPress: { deviceId: 101, commandId: 5 }
  });
  const after = deleteBundleActivityQuickAccess(b3, 101, "macro", 5).activities[0].button_bindings;
  assert.deepEqual(after.map((r4) => r4.button_id), [178]);
  const survivor = after.find((r4) => r4.button_id === 178);
  assert.equal(survivor.long_press_command_id ?? null, null);
  assert.equal(survivor.long_press_device_id ?? null, null);
});
test("deviceButtonBindingItems resolves own-command labels", () => {
  const items = deviceButtonBindingItems(bindingBundle(), 1);
  assert.equal(items.length, 1);
  assert.equal(items[0].shortPressLabel, "Power");
  assert.equal(items[0].longPress?.label, "Vol Up");
});
test("unboundButtonsForActivity excludes already-bound buttons", () => {
  const unbound = unboundButtonsForActivity(bindingBundle(), 101).map((b3) => b3.code);
  assert.equal(unbound.includes(176), false);
  assert.equal(unbound.includes(182), false);
  assert.equal(unbound.includes(174), true);
});
test("upsertActivityButtonBinding adds, then replaces by button id", () => {
  let b3 = upsertActivityButtonBinding(bindingBundle(), 101, { buttonId: 174, deviceId: 1, commandId: 11 });
  assert.equal(b3.activities[0].button_bindings.length, 3);
  b3 = upsertActivityButtonBinding(b3, 101, { buttonId: 176, deviceId: 1, commandId: 11 });
  assert.equal(b3.activities[0].button_bindings.length, 3);
  const ok = b3.activities[0].button_bindings.find((r4) => r4.button_id === 176);
  assert.equal(ok.command_id, 11);
  assert.equal(ok.long_press_command_id, void 0);
});
test("upsertDeviceButtonBinding writes a device-level binding", () => {
  const b3 = upsertDeviceButtonBinding(bindingBundle(), 2, { buttonId: 184, commandId: 20 });
  const dev2 = b3.devices.find((d3) => d3.device?.device_id === 2);
  assert.deepEqual(dev2.button_bindings.map((r4) => [r4.button_id, r4.command_id]), [[184, 20]]);
});
test("deleteActivityButtonBinding removes one binding", () => {
  const b3 = deleteActivityButtonBinding(bindingBundle(), 101, 176);
  assert.deepEqual(b3.activities[0].button_bindings.map((r4) => r4.button_id), [182]);
});
test("deleting a device cascades to activity button bindings", () => {
  const b3 = bindingBundle();
  assert.equal(bundleDeleteImpact(b3, { kind: "device", deviceId: 2 }).bindings, 2);
  const bindings = deleteBundleDevice(b3, 2).activities[0].button_bindings;
  assert.deepEqual(bindings.map((r4) => r4.button_id), [176]);
  assert.equal(bindings[0].long_press_device_id, void 0);
  assert.equal(bindings[0].command_id, 10);
});
test("deleting a command cascades to device and activity bindings", () => {
  const b3 = bindingBundle();
  assert.equal(bundleDeleteImpact(b3, { kind: "command", deviceId: 1, commandId: 10 }).bindings, 2);
  const next = deleteBundleDeviceCommand(b3, 1, 10);
  assert.deepEqual(next.devices.find((d3) => d3.device?.device_id === 1).button_bindings, []);
  assert.deepEqual(next.activities[0].button_bindings.map((r4) => r4.button_id), [182]);
});
function powerMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "TV" }, commands: [{ command_id: 10, name: "Power" }] },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] }
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      referenced_source_device_ids: [],
      favorite_slots: [{ button_id: 1, device_id: 1, command_id: 10 }],
      button_bindings: [{ button_id: 182, device_id: 2, command_id: 20 }],
      macros: []
    }]
  };
}
test("reconcileActivityPowerMacros builds flat power steps for referenced devices", () => {
  const next = reconcileActivityPowerMacros(powerMacroBundle(), 101);
  const act = next.activities[0];
  assert.deepEqual(act.referenced_source_device_ids, [1, 2]);
  const on = act.macros.find((m3) => m3.button_id === 198);
  const off = act.macros.find((m3) => m3.button_id === 199);
  assert.deepEqual(on.steps.map((s4) => [s4.device_id, s4.command_id, s4.duration, s4.delay]), [
    [1, 198, 0, 255],
    [1, 197, 0, 255],
    [2, 198, 0, 255],
    [2, 197, 0, 255]
  ]);
  assert.deepEqual(off.steps.map((s4) => [s4.device_id, s4.command_id, s4.delay]), [
    [1, 199, 255],
    [2, 199, 255]
  ]);
  assert.equal(on.steps.find((s4) => s4.command_id === 198).button_code, 0);
});
function realPowerActivity() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X2" },
    devices: [
      { device: { device_id: 3, name: "Projector" }, commands: [{ command_id: 27, name: "On" }] },
      {
        device: { device_id: 9, name: "Denon" },
        commands: [{ command_id: 52, name: "Input aux1" }],
        input_record: { entries: [{ command_id: 52, input_index: 1, name: "Input aux1" }] }
      }
    ],
    activities: [{
      device: { device_id: 101, name: "Watch a movie", entity_type: "activity" },
      referenced_source_device_ids: [3, 9],
      favorite_slots: [{ button_id: 1, device_id: 9, command_id: 52 }],
      button_bindings: [],
      macros: [
        { button_id: 198, name: "POWER_ON", steps: [
          { device_id: 3, command_id: 198, button_code: 0, duration: 1, delay: 255 },
          { device_id: 9, command_id: 197, button_code: 0, duration: 1, delay: 255 },
          { device_id: 9, command_id: 198, button_code: 0, duration: 1, delay: 255 },
          { device_id: 3, command_id: 197, button_code: 0, duration: 0, delay: 255 }
        ] },
        { button_id: 199, name: "POWER_OFF", steps: [
          { device_id: 3, command_id: 199, button_code: 0, duration: 1, delay: 255 },
          { device_id: 9, command_id: 199, button_code: 0, duration: 1, delay: 255 }
        ] }
      ]
    }]
  };
}
test("activityPowerDevices reads each device's input from its own 0xC5 step (flat, interleaved)", () => {
  const devices = activityPowerDevices(realPowerActivity(), 101);
  assert.deepEqual(devices.map((d3) => [d3.deviceId, d3.inputOrdinal, d3.inputCommandId]), [
    [3, 0, null],
    [9, 1, 52]
  ]);
  assert.equal(devices.find((d3) => d3.deviceId === 9).inputCommandName, "Input aux1");
});
test("reconcile preserves power-only devices and existing input ordinals", () => {
  const next = reconcileActivityPowerMacros(realPowerActivity(), 101);
  const act = next.activities[0];
  assert.deepEqual(act.referenced_source_device_ids, [3, 9]);
  const on = act.macros.find((m3) => m3.button_id === 198);
  assert.equal(on.steps.find((s4) => s4.device_id === 9 && s4.command_id === 197).duration, 1);
  assert.deepEqual(on.steps, realPowerActivity().activities[0].macros[0].steps);
});
test("adding a favorite appends only the new device's power steps", () => {
  const next = addBundleActivityFavorite(reconcileActivityPowerMacros(powerMacroBundle(), 101), 101, 1, 10, "TV Power");
  const on = next.activities[0].macros.find((m3) => m3.button_id === 198);
  assert.deepEqual([...new Set(on.steps.filter((s4) => s4.command_id === 198).map((s4) => s4.device_id))], [1, 2]);
});
function powerEditorBundle() {
  return reconcileActivityPowerMacros({
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      {
        device: { device_id: 1, name: "TV" },
        commands: [{ command_id: 10, name: "Power" }, { command_id: 12, name: "HDMI 1" }],
        input_record: { entries: [{ command_id: 12, input_index: 1, name: "HDMI 1" }] }
      },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] }
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [
        { button_id: 1, device_id: 1, command_id: 10 },
        { button_id: 2, device_id: 2, command_id: 20 }
      ],
      button_bindings: [],
      macros: []
    }]
  }, 101);
}
test("synthesizeCommandCode mirrors the X1 formula", () => {
  assert.equal(synthesizeCommandCode(0), 2e4);
  assert.equal(synthesizeCommandCode(18), 20018);
});
test("activityPowerDevices lists members with their input", () => {
  const devices = activityPowerDevices(powerEditorBundle(), 101);
  assert.deepEqual(devices.map((d3) => [d3.deviceId, d3.inputOrdinal]), [[1, 0], [2, 0]]);
});
test("setActivityDeviceInput reuses an existing device input", () => {
  const next = setActivityDeviceInput(powerEditorBundle(), 101, 1, 12);
  assert.equal(next.devices.find((d3) => d3.device?.device_id === 1).input_record.entries.length, 1);
  const view = activityPowerDevices(next, 101).find((d3) => d3.deviceId === 1);
  assert.equal(view.inputOrdinal, 1);
  assert.equal(view.inputCommandId, 12);
  assert.equal(view.inputCommandName, "HDMI 1");
});
test("setActivityDeviceInput appends a new device input when absent", () => {
  const next = setActivityDeviceInput(powerEditorBundle(), 101, 2, 20);
  const dev2 = next.devices.find((d3) => d3.device?.device_id === 2);
  assert.deepEqual(
    dev2.input_record.entries.map((e3) => [e3.command_id, e3.input_index, e3.fid]),
    [[20, 1, synthesizeCommandCode(20)]]
  );
  assert.equal(activityPowerDevices(next, 101).find((d3) => d3.deviceId === 2).inputOrdinal, 1);
});
test("clearActivityDeviceInput resets the input ordinal to 0", () => {
  const set = setActivityDeviceInput(powerEditorBundle(), 101, 1, 12);
  const cleared = clearActivityDeviceInput(set, 101, 1);
  assert.equal(activityPowerDevices(cleared, 101).find((d3) => d3.deviceId === 1).inputOrdinal, 0);
});
function deviceMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [{
      device: { device_id: 1, name: "TV" },
      commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol Up" }],
      macros: [{ button_id: 198, name: "POWER_ON", steps: [{ command_id: 10, duration: 0, delay: 0 }] }]
    }],
    activities: []
  };
}
test("deviceMacroStepItems folds the trailing delay onto its command as wait", () => {
  const base = deviceMacroBundle();
  assert.deepEqual(
    deviceMacroStepItems(base, 1, 198).map((i4) => [i4.kind, i4.label, i4.hold, i4.wait]),
    [["command", "Power", 0, 0]]
  );
  const withWait = setDeviceMacroStepWait(base, 1, 198, 0, 4);
  assert.deepEqual(
    deviceMacroStepItems(withWait, 1, 198).map((i4) => [i4.kind, i4.wait]),
    [["command", 4]]
  );
});
test("setDeviceMacroStepWait inserts, updates in place, and no-ops at zero", () => {
  const base = deviceMacroBundle();
  const steps = (b3) => b3.devices[0].macros.find((m3) => m3.button_id === 198).steps;
  assert.equal(steps(setDeviceMacroStepWait(base, 1, 198, 0, 0)).length, 1);
  const ins = setDeviceMacroStepWait(base, 1, 198, 0, 4);
  assert.deepEqual(steps(ins).map((s4) => [s4.command_id, s4.delay]), [[10, 0], [255, 4]]);
  const upd = setDeviceMacroStepWait(ins, 1, 198, 0, 0);
  assert.deepEqual(steps(upd).map((s4) => [s4.command_id, s4.delay]), [[10, 0], [255, 0]]);
});
test("addDeviceMacroCommandStep appends with a hold (delay sentinel 0xFF), and creates the macro if absent", () => {
  const appended = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 4);
  const steps = appended.devices[0].macros.find((m3) => m3.button_id === 198).steps;
  assert.deepEqual(steps.map((s4) => [s4.command_id, s4.duration]), [[10, 0], [11, 4]]);
  assert.equal(steps[1].delay, 255);
  const created = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 199, 10);
  const off = created.devices[0].macros.find((m3) => m3.button_id === 199);
  assert.equal(off.name, "POWER_OFF");
  assert.deepEqual(off.steps.map((s4) => s4.command_id), [10]);
  assert.equal("button_code" in off.steps[0], false);
});
test("updateDeviceMacroStep edits command and hold", () => {
  const added = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 0);
  const edited = updateDeviceMacroStep(added, 1, 198, 1, { commandId: 10, hold: 7 });
  assert.deepEqual(edited.devices[0].macros.find((m3) => m3.button_id === 198).steps[1], {
    command_id: 10,
    duration: 7,
    delay: 255
  });
});
test("removeDeviceMacroStep and reorderDeviceMacroSteps", () => {
  const two = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 0);
  assert.deepEqual(deviceMacroStepItems(reorderDeviceMacroSteps(two, 1, 198, [1, 0]), 1, 198).map((i4) => i4.commandId), [11, 10]);
  assert.deepEqual(deviceMacroStepItems(removeDeviceMacroStep(two, 1, 198, 0), 1, 198).map((i4) => i4.commandId), [11]);
});
test("a command's attached wait follows it through reorder and remove", () => {
  let two = addDeviceMacroCommandStep(deviceMacroBundle(), 1, 198, 11, 0);
  two = setDeviceMacroStepWait(two, 1, 198, 0, 6);
  const steps = (b3) => b3.devices[0].macros.find((m3) => m3.button_id === 198).steps;
  const reordered = reorderDeviceMacroSteps(two, 1, 198, [1, 0]);
  assert.deepEqual(deviceMacroStepItems(reordered, 1, 198).map((i4) => [i4.commandId, i4.wait]), [[11, 0], [10, 6]]);
  assert.deepEqual(steps(reordered).map((s4) => s4.command_id), [11, 10, 255]);
  const removed = removeDeviceMacroStep(reordered, 1, 198, 1);
  assert.deepEqual(steps(removed).map((s4) => s4.command_id), [11]);
});
function userMacroBundle() {
  return {
    kind: "hub_bundle",
    schema_version: 5,
    hub: { version: "X1S" },
    devices: [
      { device: { device_id: 1, name: "TV" }, commands: [{ command_id: 10, name: "Power" }, { command_id: 11, name: "Vol" }] },
      { device: { device_id: 2, name: "AVR" }, commands: [{ command_id: 20, name: "Power" }] }
    ],
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [],
      button_bindings: [],
      macros: [{ button_id: 1, name: "Combo", steps: [] }]
    }]
  };
}
test("addActivityMacroCommandStep synthesizes button_code and pulls the device into the power macros", () => {
  const next = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 5);
  assert.deepEqual(next.activities[0].macros.find((m3) => m3.button_id === 1).steps[0], {
    device_id: 1,
    command_id: 10,
    button_code: synthesizeCommandCode(10),
    duration: 5,
    delay: 255
  });
  assert.deepEqual(next.activities[0].referenced_source_device_ids, [1]);
  assert.equal(next.activities[0].macros.some((m3) => m3.button_id === 198), true);
});
test("activityMacroStepItems labels device \xB7 command and folds the wait onto it", () => {
  let b3 = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b3 = setActivityMacroStepWait(b3, 101, 1, 0, 30);
  b3 = addActivityMacroCommandStep(b3, 101, 1, 2, 20, 0);
  assert.deepEqual(activityMacroStepItems(b3, 101, 1).map((i4) => [i4.kind, i4.label, i4.wait]), [
    ["command", "TV \xB7 Power", 30],
    ["command", "AVR \xB7 Power", 0]
  ]);
});
test("reorderActivityMacroSteps carries a command's attached wait", () => {
  let b3 = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b3 = setActivityMacroStepWait(b3, 101, 1, 0, 12);
  b3 = addActivityMacroCommandStep(b3, 101, 1, 2, 20, 0);
  const reordered = reorderActivityMacroSteps(b3, 101, 1, [1, 0]);
  assert.deepEqual(activityMacroStepItems(reordered, 101, 1).map((i4) => [i4.label, i4.wait]), [
    ["AVR \xB7 Power", 0],
    ["TV \xB7 Power", 12]
  ]);
});
test("removeActivityMacroStep keeps the device in the power macros (additive membership)", () => {
  let b3 = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b3 = addActivityMacroCommandStep(b3, 101, 1, 2, 20, 0);
  assert.deepEqual(b3.activities[0].referenced_source_device_ids, [1, 2]);
  b3 = removeActivityMacroStep(b3, 101, 1, 1);
  assert.deepEqual(b3.activities[0].referenced_source_device_ids, [1, 2]);
});
test("updateActivityMacroStep re-synthesizes button_code when the command changes", () => {
  let b3 = addActivityMacroCommandStep(userMacroBundle(), 101, 1, 1, 10, 0);
  b3 = updateActivityMacroStep(b3, 101, 1, 0, { commandId: 11, hold: 9 });
  assert.deepEqual(b3.activities[0].macros.find((m3) => m3.button_id === 1).steps[0], {
    device_id: 1,
    command_id: 11,
    button_code: synthesizeCommandCode(11),
    duration: 9,
    delay: 255
  });
});
test("addActivityUserMacro creates an empty macro at the next slot", () => {
  const macro = addActivityUserMacro(userMacroBundle(), 101, "New Macro").activities[0].macros.find((m3) => m3.name === "New Macro");
  assert.equal(macro.button_id, 2);
  assert.deepEqual(macro.steps, []);
});
test("activityMacroStepItems marks power-macro refs as protected and labels them", () => {
  const items = activityMacroStepItems(realPowerActivity(), 101, 198);
  assert.equal(items.every((i4) => (i4.kind === "power" || i4.kind === "input") && i4.protected === true), true);
  const inputRef = items.find((i4) => i4.kind === "input" && i4.deviceId === 9);
  assert.equal(inputRef.label, "Input \xB7 Denon: Input aux1");
  assert.equal(inputRef.commandId, 52);
  assert.equal(items.find((i4) => i4.kind === "power" && i4.deviceId === 3).label, "Power on \xB7 Projector");
});
test("removeActivityMacroStep refuses to delete a mandatory power ref", () => {
  const before = activityMacroStepItems(realPowerActivity(), 101, 198).length;
  const next = removeActivityMacroStep(realPowerActivity(), 101, 198, 0);
  assert.equal(activityMacroStepItems(next, 101, 198).length, before);
});
test("setActivityMacroStepWait edits the wait on a protected power ref without touching the ref", () => {
  const next = setActivityMacroStepWait(realPowerActivity(), 101, 198, 0, 8);
  const items = activityMacroStepItems(next, 101, 198);
  assert.equal(items.length, activityMacroStepItems(realPowerActivity(), 101, 198).length);
  assert.equal(items[0].wait, 8);
  assert.equal(items[0].protected, true);
  const headStep = next.activities[0].macros.find((m3) => m3.button_id === 198).steps[0];
  assert.deepEqual([headStep.device_id, headStep.command_id], [3, 198]);
});
test("a user command added to a power macro is a deletable (non-protected) step", () => {
  const added = addActivityMacroCommandStep(realPowerActivity(), 101, 198, 9, 52, 0);
  const cmd = activityMacroStepItems(added, 101, 198).find((i4) => i4.kind === "command");
  assert.equal(cmd.protected, void 0);
  const removed = removeActivityMacroStep(added, 101, 198, cmd.index);
  assert.equal(activityMacroStepItems(removed, 101, 198).some((i4) => i4.kind === "command"), false);
  assert.equal(activityMacroStepItems(removed, 101, 198).some((i4) => i4.kind === "power" || i4.kind === "input"), true);
});
test("deleting a favorite keeps its device in the power macros, but deleting the device removes it", () => {
  const seeded = reconcileActivityPowerMacros({
    ...powerMacroBundle(),
    activities: [{
      device: { device_id: 101, name: "Watch TV", entity_type: "activity" },
      favorite_slots: [
        { button_id: 1, device_id: 1, command_id: 10 },
        { button_id: 2, device_id: 2, command_id: 20 }
      ],
      button_bindings: [],
      macros: []
    }]
  }, 101);
  assert.deepEqual(seeded.activities[0].referenced_source_device_ids, [1, 2]);
  const afterFav = deleteBundleActivityQuickAccess(seeded, 101, "favorite", 1);
  assert.deepEqual(afterFav.activities[0].referenced_source_device_ids, [1, 2]);
  const afterDevice = deleteBundleDevice(afterFav, 1);
  assert.deepEqual(afterDevice.activities[0].referenced_source_device_ids, [2]);
  const on = afterDevice.activities[0].macros.find((m3) => m3.button_id === 198);
  assert.deepEqual([...new Set(on.steps.filter((s4) => s4.command_id === 198).map((s4) => s4.device_id))], [2]);
});
