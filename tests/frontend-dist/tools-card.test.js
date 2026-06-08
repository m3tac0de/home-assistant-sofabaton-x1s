var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};

// node_modules/@lit-labs/ssr-dom-shim/lib/element-internals.js
var ElementInternalsShim;
var init_element_internals = __esm({
  "node_modules/@lit-labs/ssr-dom-shim/lib/element-internals.js"() {
    ElementInternalsShim = class ElementInternals {
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
  }
});

// node_modules/@lit-labs/ssr-dom-shim/lib/events.js
var __classPrivateFieldSet, __classPrivateFieldGet, _Event_cancelable, _Event_bubbles, _Event_composed, _Event_defaultPrevented, _Event_timestamp, _Event_propagationStopped, _Event_type, _Event_target, _Event_isBeingDispatched, _a, _CustomEvent_detail, _b, isCaptureEventListener, NONE, CAPTURING_PHASE, AT_TARGET, BUBBLING_PHASE, EventTarget, EventTargetShimWithRealType, enumerableProperty, EventShim, CustomEventShim, EventShimWithRealType, CustomEventShimWithRealType;
var init_events = __esm({
  "node_modules/@lit-labs/ssr-dom-shim/lib/events.js"() {
    __classPrivateFieldSet = function(receiver, state, value, kind, f3) {
      if (kind === "m") throw new TypeError("Private method is not writable");
      if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a setter");
      if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
      return kind === "a" ? f3.call(receiver, value) : f3 ? f3.value = value : state.set(receiver, value), value;
    };
    __classPrivateFieldGet = function(receiver, state, kind, f3) {
      if (kind === "a" && !f3) throw new TypeError("Private accessor was defined without a getter");
      if (typeof state === "function" ? receiver !== state || !f3 : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
      return kind === "m" ? f3 : kind === "a" ? f3.call(receiver) : f3 ? f3.value : state.get(receiver);
    };
    isCaptureEventListener = (options) => typeof options === "boolean" ? options : options?.capture ?? false;
    NONE = 0;
    CAPTURING_PHASE = 1;
    AT_TARGET = 2;
    BUBBLING_PHASE = 3;
    EventTarget = class {
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
    EventTargetShimWithRealType = EventTarget;
    enumerableProperty = { __proto__: null };
    enumerableProperty.enumerable = true;
    Object.freeze(enumerableProperty);
    EventShim = (_a = class Event {
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
    CustomEventShim = (_b = class CustomEvent2 extends EventShim {
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
    EventShimWithRealType = EventShim;
    CustomEventShimWithRealType = CustomEventShim;
  }
});

// node_modules/@lit-labs/ssr-dom-shim/lib/css.js
var _a2, CSSRuleShim;
var init_css = __esm({
  "node_modules/@lit-labs/ssr-dom-shim/lib/css.js"() {
    CSSRuleShim = (_a2 = class CSSRule {
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
  }
});

// node_modules/@lit-labs/ssr-dom-shim/index.js
function promiseWithResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
var attributes, attributesForElement, ElementShim, HTMLElementShim, HTMLElementShimWithRealType, CustomElementRegistry, CustomElementRegistryShimWithRealType, customElements2;
var init_ssr_dom_shim = __esm({
  "node_modules/@lit-labs/ssr-dom-shim/index.js"() {
    init_element_internals();
    init_events();
    init_element_internals();
    init_css();
    init_events();
    globalThis.Event ??= EventShimWithRealType;
    globalThis.CustomEvent ??= CustomEventShimWithRealType;
    attributes = /* @__PURE__ */ new WeakMap();
    attributesForElement = (element) => {
      let attrs = attributes.get(element);
      if (attrs === void 0) {
        attributes.set(element, attrs = /* @__PURE__ */ new Map());
      }
      return attrs;
    };
    ElementShim = class Element extends EventTargetShimWithRealType {
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
    HTMLElementShim = class HTMLElement2 extends ElementShim {
    };
    HTMLElementShimWithRealType = HTMLElementShim;
    globalThis.litServerRoot ??= Object.defineProperty(new HTMLElementShimWithRealType(), "localName", {
      // Patch localName (and tagName) to return a unique name.
      get() {
        return "lit-server-root";
      }
    });
    CustomElementRegistry = class {
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
    CustomElementRegistryShimWithRealType = CustomElementRegistry;
    customElements2 = new CustomElementRegistryShimWithRealType();
  }
});

// node_modules/@lit/reactive-element/node/css-tag.js
var t, e, s, o, n, r, i, S, c;
var init_css_tag = __esm({
  "node_modules/@lit/reactive-element/node/css-tag.js"() {
    t = globalThis;
    e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
    s = /* @__PURE__ */ Symbol();
    o = /* @__PURE__ */ new WeakMap();
    n = class {
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
    r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
    i = (t4, ...e4) => {
      const o5 = 1 === t4.length ? t4[0] : e4.reduce((e5, s4, o6) => e5 + ((t5) => {
        if (true === t5._$cssResult$) return t5.cssText;
        if ("number" == typeof t5) return t5;
        throw Error("Value passed to 'css' function must be a 'css' function result: " + t5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
      })(s4) + t4[o6 + 1], t4[0]);
      return new n(o5, t4, s);
    };
    S = (s4, o5) => {
      if (e) s4.adoptedStyleSheets = o5.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
      else for (const e4 of o5) {
        const o6 = document.createElement("style"), n4 = t.litNonce;
        void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e4.cssText, s4.appendChild(o6);
      }
    };
    c = e || void 0 === t.CSSStyleSheet ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
      let e4 = "";
      for (const s4 of t5.cssRules) e4 += s4.cssText;
      return r(e4);
    })(t4) : t4;
  }
});

// node_modules/@lit/reactive-element/node/reactive-element.js
var h, r2, o2, n2, a, c2, l, p, d, u, f, b, m, y, g;
var init_reactive_element = __esm({
  "node_modules/@lit/reactive-element/node/reactive-element.js"() {
    init_ssr_dom_shim();
    init_css_tag();
    init_css_tag();
    ({ is: h, defineProperty: r2, getOwnPropertyDescriptor: o2, getOwnPropertyNames: n2, getOwnPropertySymbols: a, getPrototypeOf: c2 } = Object);
    l = globalThis;
    l.customElements ??= customElements2;
    p = l.trustedTypes;
    d = p ? p.emptyScript : "";
    u = l.reactiveElementPolyfillSupport;
    f = (t4, s4) => t4;
    b = { toAttribute(t4, s4) {
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
    m = (t4, s4) => !h(t4, s4);
    y = { attribute: true, type: String, converter: b, reflect: false, useDefault: false, hasChanged: m };
    Symbol.metadata ??= /* @__PURE__ */ Symbol("metadata"), l.litPropertyMetadata ??= /* @__PURE__ */ new WeakMap();
    g = class extends (globalThis.HTMLElement ?? HTMLElementShimWithRealType) {
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
  }
});

// node_modules/lit-html/node/lit-html.js
function V(t4, i6) {
  if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e2 ? e2.createHTML(i6) : i6;
}
function M(t4, i6, s4 = t4, e4) {
  if (i6 === E) return i6;
  let h3 = void 0 !== e4 ? s4._$Co?.[e4] : s4._$Cl;
  const o5 = a2(i6) ? void 0 : i6._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t4), h3._$AT(t4, s4, e4)), void 0 !== e4 ? (s4._$Co ??= [])[e4] = h3 : s4._$Cl = h3), void 0 !== h3 && (i6 = M(t4, h3._$AS(t4, i6.values), h3, e4)), i6;
}
var t2, i2, s2, e2, h2, o3, n3, r3, l2, c3, a2, u2, d2, f2, v, _, m2, p2, g2, $, y2, x, T, b2, w, E, A, C, P, N, S2, k, R, H, I, L, z, W, Z, j, B;
var init_lit_html = __esm({
  "node_modules/lit-html/node/lit-html.js"() {
    t2 = globalThis;
    i2 = (t4) => t4;
    s2 = t2.trustedTypes;
    e2 = s2 ? s2.createPolicy("lit-html", { createHTML: (t4) => t4 }) : void 0;
    h2 = "$lit$";
    o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
    n3 = "?" + o3;
    r3 = `<${n3}>`;
    l2 = void 0 === t2.document ? { createTreeWalker: () => ({}) } : document;
    c3 = () => l2.createComment("");
    a2 = (t4) => null === t4 || "object" != typeof t4 && "function" != typeof t4;
    u2 = Array.isArray;
    d2 = (t4) => u2(t4) || "function" == typeof t4?.[Symbol.iterator];
    f2 = "[ 	\n\f\r]";
    v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
    _ = /-->/g;
    m2 = />/g;
    p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
    g2 = /'/g;
    $ = /"/g;
    y2 = /^(?:script|style|textarea|title)$/i;
    x = (t4) => (i6, ...s4) => ({ _$litType$: t4, strings: i6, values: s4 });
    T = x(1);
    b2 = x(2);
    w = x(3);
    E = /* @__PURE__ */ Symbol.for("lit-noChange");
    A = /* @__PURE__ */ Symbol.for("lit-nothing");
    C = /* @__PURE__ */ new WeakMap();
    P = l2.createTreeWalker(l2, 129);
    N = (t4, i6) => {
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
    S2 = class _S {
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
    k = class {
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
    R = class _R {
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
    H = class {
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
    I = class extends H {
      constructor() {
        super(...arguments), this.type = 3;
      }
      j(t4) {
        this.element[this.name] = t4 === A ? void 0 : t4;
      }
    };
    L = class extends H {
      constructor() {
        super(...arguments), this.type = 4;
      }
      j(t4) {
        this.element.toggleAttribute(this.name, !!t4 && t4 !== A);
      }
    };
    z = class extends H {
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
    W = class {
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
    Z = { M: h2, P: o3, A: n3, C: 1, L: N, R: k, D: d2, V: M, I: R, H, N: L, U: z, B: I, F: W };
    j = t2.litHtmlPolyfillSupport;
    j?.(S2, R), (t2.litHtmlVersions ??= []).push("3.3.2");
    B = (t4, i6, s4) => {
      const e4 = s4?.renderBefore ?? i6;
      let h3 = e4._$litPart$;
      if (void 0 === h3) {
        const t5 = s4?.renderBefore ?? null;
        e4._$litPart$ = h3 = new R(i6.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
      }
      return h3._$AI(t4), h3;
    };
  }
});

// node_modules/lit-element/lit-element.js
var s3, i3, o4;
var init_lit_element = __esm({
  "node_modules/lit-element/lit-element.js"() {
    init_reactive_element();
    init_reactive_element();
    init_lit_html();
    init_lit_html();
    s3 = globalThis;
    i3 = class extends g {
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
    o4 = s3.litElementPolyfillSupport;
    o4?.({ LitElement: i3 });
    (s3.litElementVersions ??= []).push("4.2.2");
  }
});

// node_modules/lit-html/node/is-server.js
var init_is_server = __esm({
  "node_modules/lit-html/node/is-server.js"() {
  }
});

// node_modules/lit/index.js
var init_lit = __esm({
  "node_modules/lit/index.js"() {
    init_reactive_element();
    init_lit_html();
    init_lit_element();
    init_is_server();
  }
});

// custom_components/sofabaton_x1s/www/src/components/secondary-tab.ts
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
function renderSecondaryTabContent(params) {
  const panelClassName = normalizeClassName(
    `secondary-tab-panel${params.connected ? " secondary-tab-panel--connected" : ""} ${params.panelClassName || ""}`
  );
  const contentClassName = normalizeClassName(`secondary-tab-content ${params.contentClassName || ""}`);
  return T`
    <div class=${panelClassName}>
      <div class=${contentClassName}>
        ${params.content}
      </div>
    </div>
  `;
}
function renderSecondaryPanel(params) {
  const panelClassName = normalizeClassName(
    `secondary-tab-panel${params.connected ? " secondary-tab-panel--connected" : ""} ${params.panelClassName || ""}`
  );
  const bodyClassName = normalizeClassName(`secondary-panel-body ${params.bodyClassName || ""}`);
  return T`
    <div class=${panelClassName}>
      ${params.header}
      <div class=${bodyClassName}>
        ${params.body}
      </div>
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
var secondaryTabStyles;
var init_secondary_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/components/secondary-tab.ts"() {
    "use strict";
    init_lit();
    secondaryTabStyles = i`
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
  }
});

// custom_components/sofabaton_x1s/www/src/shared/styles/card-styles.ts
var cardStyles;
var init_card_styles = __esm({
  "custom_components/sofabaton_x1s/www/src/shared/styles/card-styles.ts"() {
    "use strict";
    init_lit();
    init_secondary_tab();
    cardStyles = [secondaryTabStyles, i`
  :host { display: block; }
  *, *::before, *::after { box-sizing: border-box; }
  .card-inner { height: var(--tools-card-height, 600px); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); }
  .card-topbar {
    position: relative;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 4px 12px;
    min-height: 32px;
    border-bottom: 1px solid color-mix(in srgb, var(--divider-color) 82%, transparent);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color))),
        color-mix(in srgb, var(--primary-color) 4%, var(--ha-card-background, var(--card-background-color)))
      );
  }
  .card-brand {
    min-width: 0;
    flex: 1 1 auto;
    color: color-mix(in srgb, var(--primary-text-color) 94%, var(--secondary-text-color));
    font-size: 10px;
    font-weight: 400;
    letter-spacing: 0.12em;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-title { font-size: 16px; font-weight: 700; }
  .card-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .card-bottom-dock {
    position: relative;
    flex-shrink: 0;
    min-height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px 12px;
    border-top: 1px solid color-mix(in srgb, var(--divider-color) 82%, transparent);
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color))),
        color-mix(in srgb, var(--primary-color) 4%, var(--ha-card-background, var(--card-background-color)))
      );
  }
  .card-bottom-dock--success {
    border-top-color: color-mix(in srgb, var(--success-color, #22c55e) 45%, var(--divider-color));
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--success-color, #22c55e) 11%, var(--ha-card-background, var(--card-background-color))),
        color-mix(in srgb, var(--success-color, #22c55e) 6%, var(--ha-card-background, var(--card-background-color)))
      );
  }
  .card-bottom-dock--error {
    border-top-color: color-mix(in srgb, var(--error-color, #db4437) 45%, var(--divider-color));
    background:
      linear-gradient(
        180deg,
        color-mix(in srgb, var(--error-color, #db4437) 11%, var(--ha-card-background, var(--card-background-color))),
        color-mix(in srgb, var(--error-color, #db4437) 6%, var(--ha-card-background, var(--card-background-color)))
      );
  }
  .card-bottom-dock-center {
    min-width: 0;
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    color: var(--secondary-text-color);
    overflow: hidden;
  }
  .card-bottom-dock-center > span,
  .card-bottom-dock-center > a {
    min-width: 0;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-bottom-dock-status {
    color: color-mix(in srgb, var(--secondary-text-color) 88%, transparent);
  }
  .card-bottom-dock--success .card-bottom-dock-status {
    color: color-mix(in srgb, var(--success-color, #22c55e) 88%, black 10%);
  }
  .card-bottom-dock--error .card-bottom-dock-status {
    color: color-mix(in srgb, var(--error-color, #db4437) 88%, black 10%);
  }
  .card-bottom-dock-link {
    color: var(--primary-color);
    text-decoration: underline;
    font-weight: 400;
  }
  .card-bottom-dock-link:hover {
    text-decoration: underline;
  }
  .card-bottom-dock-empty {
    display: block;
    width: 100%;
    min-height: 1px;
  }
  .card-bottom-dock-progress-line {
    position: absolute;
    top: -2px;
    left: 0;
    height: 4px;
    background: linear-gradient(
      90deg,
      color-mix(in srgb, var(--primary-color) 60%, transparent),
      var(--primary-color) 45%,
      color-mix(in srgb, var(--primary-color) 70%, white 30%) 55%,
      var(--primary-color)
    );
    box-shadow:
      0 0 8px color-mix(in srgb, var(--primary-color) 70%, transparent),
      0 0 14px color-mix(in srgb, var(--primary-color) 40%, transparent);
    border-radius: 2px;
    transition: width 180ms ease;
    animation: dockProgressPulse 1.4s ease-in-out infinite;
  }
  .card-bottom-dock-progress-line[data-indeterminate="true"] {
    width: 35% !important;
    animation:
      dockProgressIndeterminate 1.2s ease-in-out infinite,
      dockProgressPulse 1.4s ease-in-out infinite;
  }
  @keyframes dockProgressIndeterminate {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(320%); }
  }
  @keyframes dockProgressPulse {
    0%, 100% { filter: brightness(1); }
    50% { filter: brightness(1.35); }
  }
  .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; }
  .tab-panel.scrollable, .acc-body, .logs-console { overflow-y: auto; }
  .hub-picker { position: relative; display: flex; flex-direction: column; align-items: flex-start; }
  .card-topbar > .hub-picker { flex: 0 0 auto; align-items: flex-end; margin-left: 2px; }
  .hub-picker-btn { display: inline-flex; align-items: center; gap: 6px; max-width: min(100%, 420px); min-height: 24px; border: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent); border-radius: 999px; padding: 0 10px 0 9px; background: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 80%, var(--primary-color) 6%); cursor: pointer; font-family: inherit; color: var(--primary-text-color); flex-shrink: 0; user-select: none; -webkit-user-select: none; transition: border-color 120ms ease, background 120ms ease; }
  .hub-picker-btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
  .hub-picker-btn--static { cursor: default; }
  .chip-prefix { font-size: 9px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: color-mix(in srgb, var(--primary-color) 62%, var(--secondary-text-color)); flex-shrink: 0; }
  .chip-name { font-size: 11px; font-weight: 700; flex: 1; min-width: 0; max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-arrow { --mdc-icon-size: 13px; color: var(--secondary-text-color); flex-shrink: 0; transform: rotate(180deg); }
  .hub-picker-menu { position: absolute; top: calc(100% + 6px); right: 0; z-index: 20; display: flex; flex-direction: column; width: max-content; min-width: 160px; max-width: min(320px, calc(100vw - 24px)); margin: 0; padding: 4px 0; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--card-background-color, var(--ha-card-background, white)); color: var(--primary-text-color); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18); overflow: hidden; }
  .hub-option, .tab-menu-item { width: 100%; border: none; background: transparent; text-align: left; font: inherit; color: inherit; cursor: pointer; user-select: none; -webkit-user-select: none; }
  .hub-option { padding: 10px 14px; font-size: 13px; }
  .hub-option:hover, .tab-menu-item:hover { background: color-mix(in srgb, var(--primary-color) 7%, transparent); }
  .hub-option.selected, .tab-menu-item.active { font-weight: 700; color: var(--primary-color); }
  .tabs { flex-shrink: 0; display: flex; align-items: stretch; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--divider-color); }
  .tabs-scroll { display: flex; gap: 2px; flex: 1 1 auto; min-width: 0; }
  .tab-btn { position: relative; border: none; background: transparent; color: var(--secondary-text-color); font: inherit; font-size: 14px; font-weight: 700; padding: 12px 16px; cursor: pointer; user-select: none; -webkit-user-select: none; }
  .tab-btn--push-right { margin-left: auto; }
  .tab-btn--menu { display: inline-flex; align-items: center; gap: 4px; padding-right: 12px; }
  .tab-btn--menu.is-open { color: var(--primary-color); }
  .tab-btn-menu-icon { --mdc-icon-size: 16px; }
  .tab-btn-menu-caret { --mdc-icon-size: 18px; margin-right: -2px; }
  .tab-btn.active { color: var(--primary-color); box-shadow: inset 0 -3px 0 var(--primary-color); }
  .tab-btn.tab-disabled { color: var(--disabled-text-color, var(--secondary-text-color)); opacity: 0.45; cursor: default; }
  .tab-btn-label-short { display: none; }
  .tab-menu { position: relative; display: flex; }
  .tab-menu--push-right { margin-left: auto; }
  .tab-menu-dropdown { position: absolute; top: calc(100% + 1px); right: 0; z-index: 15; display: flex; flex-direction: column; min-width: 150px; padding: 4px 0; border: 1px solid var(--divider-color); border-radius: calc(var(--ha-card-border-radius, 12px) - 2px); background: var(--card-background-color, var(--ha-card-background, white)); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18); overflow: hidden; }
  .tab-menu-item { padding: 10px 14px; font-size: 13px; }
  .logs-panel { gap: 10px; }
  .logs-console-wrap {
    flex: 1;
    min-height: 0;
    padding: 12px 16px 16px;
    display: flex;
    flex-direction: column;
  }
  .logs-header, .hub-hero { display: grid; }
  .logs-header { gap: 4px; }
  .logs-title-row { display: flex; align-items: center; gap: 10px; }
  .logs-title-row .acc-header-icon { color: var(--primary-color); display: inline-flex; flex: 0 0 auto; }
  .logs-title-row .acc-header-icon ha-icon { --mdc-icon-size: 18px; }
  .logs-subtitle, .logs-empty, .cache-state, .entity-count, .refresh-list-label, .stale-banner { color: var(--secondary-text-color); }
  .logs-console { flex: 1; min-height: 0; border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 2px); background: radial-gradient(circle at top, color-mix(in srgb, var(--primary-color) 6%, transparent), transparent 45%), color-mix(in srgb, #05070b 92%, var(--card-background-color, #fff)); font-family: "SF Mono", "Fira Code", Consolas, monospace; padding: 10px 0; user-select: text; -webkit-user-select: text; }
  .logs-empty { padding: 12px 14px; font-size: 12px; }
  .logs-empty.error, .cache-state.error { color: var(--error-color, #db4437); }
  .log-line { padding: 1px 14px; font-size: 11px; line-height: 1.45; color: color-mix(in srgb, var(--primary-text-color) 94%, white); white-space: normal; overflow-wrap: anywhere; user-select: text; -webkit-user-select: text; }
  .log-line-level { font-weight: 700; white-space: nowrap; }
  .log-line-level--debug { color: #8ebcff; }
  .log-line-level--info { color: #72d7a1; }
  .log-line-level--warning { color: #ffcf70; }
  .log-line-level--error, .log-line-level--critical { color: #ff8d8d; }
  .log-line-msg { color: #e7edf6; }
  .hub-hero { gap: 10px; padding: 2px 0 0; }
  .hub-ident-name { font-size: 18px; line-height: 1.1; font-weight: 800; letter-spacing: -0.02em; color: var(--primary-text-color); }
  .hub-connection-strip { display: grid; grid-template-columns: auto minmax(26px, 1fr) auto minmax(26px, 1fr) auto; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 4px); background: radial-gradient(circle at top center, color-mix(in srgb, var(--primary-color) 8%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 92%, transparent), color-mix(in srgb, var(--card-background-color, #fff) 86%, transparent)); overflow: hidden; }
  .hub-connection-node { position: relative; width: 54px; height: 54px; display: inline-flex; align-items: center; justify-content: center; border-radius: 18px; border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, var(--divider-color)); background: color-mix(in srgb, var(--card-background-color, #fff) 94%, transparent); color: color-mix(in srgb, var(--primary-text-color) 34%, var(--secondary-text-color)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04); transition: color 180ms ease, border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease, background 180ms ease; }
  .hub-connection-node.is-active { color: color-mix(in srgb, var(--primary-color) 72%, white 10%); border-color: color-mix(in srgb, var(--primary-color) 45%, var(--divider-color)); background: color-mix(in srgb, var(--primary-color) 10%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 12%, transparent), 0 0 18px color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .hub-connection-node.is-bridged { color: color-mix(in srgb, #67b7ff 75%, white 10%); border-color: color-mix(in srgb, #67b7ff 45%, var(--divider-color)); background: color-mix(in srgb, #67b7ff 11%, transparent); box-shadow: 0 0 0 1px color-mix(in srgb, #67b7ff 12%, transparent), 0 0 18px color-mix(in srgb, #67b7ff 16%, transparent); }
  .hub-connection-node.is-active .hub-connection-node-icon { animation: hubNodePulse 2.8s ease-in-out infinite; }
  .hub-connection-node-icon { display: inline-flex; align-items: center; justify-content: center; }
  .hub-connection-node-icon--hub { width: 33px; height: 33px; }
  .hub-connection-node-icon--mdi ha-icon { --mdc-icon-size: 24px; }
  .hub-connection-link { position: relative; height: 12px; display: flex; align-items: center; }
  .hub-connection-link-line { position: relative; width: 100%; height: 2px; border-radius: 999px; background: color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); overflow: hidden; }
  .hub-connection-link-line::after { content: ""; position: absolute; inset: 0 auto 0 -35%; width: 35%; background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--primary-color) 45%, white 10%), transparent); opacity: 0; }
  .hub-connection-link.is-active .hub-connection-link-line { background: color-mix(in srgb, var(--primary-color) 28%, var(--divider-color)); box-shadow: 0 0 8px color-mix(in srgb, var(--primary-color) 14%, transparent); }
  .hub-connection-link.is-active .hub-connection-link-line::after { opacity: 0.9; animation: hubSignalTravel 2.4s ease-in-out infinite alternate; }
  @keyframes hubSignalTravel { from { transform: translateX(0); } to { transform: translateX(380%); } }
  @keyframes hubNodePulse { 0%, 100% { transform: scale(1); opacity: 0.96; } 50% { transform: scale(1.03); opacity: 1; } }
  .hub-hero-icon { width: 33px; height: 33px; display: block; }
  .hub-badges { display: flex; gap: 10px; flex-wrap: wrap; padding: 4px 0 4px; }
  .hub-conn-badge, .hub-proxy-badge { display: inline-flex; align-items: center; gap: 9px; min-height: 38px; padding: 0 14px 0 12px; border-radius: 999px; border: 1px solid var(--divider-color); font-size: 13px; font-weight: 700; }
  .hub-conn-badge::before, .hub-proxy-badge::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
  .hub-conn-badge--on { color: #48b851; border-color: color-mix(in srgb, #48b851 45%, var(--divider-color)); }
  .hub-proxy-badge--on { color: #67b7ff; border-color: color-mix(in srgb, #67b7ff 42%, var(--divider-color)); }
  .hub-info-list { border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 4px); overflow: hidden; }
  .hub-row { min-height: 50px; display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 0 14px; border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); }
  .hub-row:first-child { border-top: none; }
  .hub-row-icon-svg { width: 22px; height: 22px; }
  .hub-row-value, .setting-title, .entity-name, .cache-state-title { color: var(--primary-text-color); }
  .hub-row-label { font-size: 12px; font-weight: 700; color: color-mix(in srgb, var(--primary-text-color) 88%, var(--secondary-text-color)); }
  .hub-row-value { font-size: 12px; font-weight: 700; text-align: right; word-break: break-word; }
  .hub-tab-layout { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .hub-tab-layout > .tab-panel { flex: 1; }
  .panel-sticky-footer { flex-shrink: 0; border-top: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); }
  .bottom-dock-status { width: 100%; display: flex; align-items: stretch; justify-content: center; }
  .card-bottom-dock-right {
    position: absolute;
    right: 12px;
    top: 50%;
    transform: translateY(-50%);
    display: inline-flex;
    align-items: center;
    pointer-events: auto;
  }
  .dock-pill-pair {
    display: inline-flex;
    align-items: stretch;
    min-height: 22px;
    border-radius: 999px;
    overflow: hidden;
    border: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
    line-height: 1;
    white-space: nowrap;
    font-size: 10px;
    font-weight: 700;
  }
  .dock-pill-half {
    display: inline-flex;
    align-items: center;
    padding: 0 9px;
  }
  .dock-pill-half + .dock-pill-half {
    border-left: 1px solid color-mix(in srgb, var(--divider-color) 84%, transparent);
  }
  .dock-pill-half--hub-on {
    color: #2f9f43;
    background: color-mix(in srgb, #48b851 16%, var(--ha-card-background, var(--card-background-color)));
  }
  .dock-pill-half--hub-off {
    color: #c13d3d;
    background: color-mix(in srgb, #db4437 14%, var(--ha-card-background, var(--card-background-color)));
  }
  .dock-pill-half--app-on {
    color: #2f80d8;
    background: color-mix(in srgb, #67b7ff 16%, var(--ha-card-background, var(--card-background-color)));
  }
  .dock-pill-half--app-off {
    color: color-mix(in srgb, var(--secondary-text-color) 78%, transparent);
    background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
  }
  .card-blocked-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 28px 32px;
    text-align: center;
  }
  .card-blocked-icon {
    display: inline-flex;
    color: color-mix(in srgb, var(--warning-color, var(--primary-color)) 75%, var(--secondary-text-color));
  }
  .card-blocked-icon ha-icon { --mdc-icon-size: 40px; }
  .card-blocked-title {
    color: var(--primary-text-color);
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.01em;
  }
  .card-blocked-copy {
    max-width: 360px;
    color: var(--secondary-text-color);
    font-size: 13px;
    line-height: 1.6;
  }
  .dock-status-value { font-weight: 700; font-family: "SF Mono", "Fira Code", Consolas, monospace; }
  .settings-list { border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 4px); overflow: hidden; }
  .setting-tile { min-height: 52px; display: flex; flex-direction: row; align-items: center; gap: 16px; padding: 12px 16px; background: var(--ha-card-background, var(--card-background-color, #fff)); border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); }
  .setting-tile:first-child { border-top: none; }
  .setting-tile.toggle, .setting-tile.action { cursor: pointer; transition: background 120ms ease; }
  .setting-tile.toggle:hover, .setting-tile.action:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color, #fff))); }
  .setting-tile.toggle:active, .setting-tile.action:active, .setting-tile.pressed { background: color-mix(in srgb, var(--primary-color) 12%, var(--ha-card-background, var(--card-background-color, #fff))); }
  .setting-tile.disabled { opacity: 0.55; cursor: default; }
  .setting-tile-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .setting-tile-control { flex-shrink: 0; display: flex; align-items: center; }
  .setting-title { font-size: 14px; font-weight: 700; color: var(--primary-text-color); display: flex; align-items: center; gap: 7px; }
  .setting-global-tag { font-size: 9px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; background: linear-gradient(90deg, color-mix(in srgb, var(--primary-color) 82%, #08131c), color-mix(in srgb, var(--primary-color) 58%, #14324b)); color: white; text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18); flex-shrink: 0; }
  .setting-description { font-size: 12px; line-height: 1.35; color: var(--secondary-text-color); }
  .setting-icon { color: var(--secondary-text-color); display: inline-flex; }
  .cache-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .accordion-section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--divider-color); }
  .accordion-section:first-child { border-top: none; }
  .accordion-section.open { flex: 1; }
  .acc-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: 10px; padding: 0 16px; cursor: pointer; user-select: none; transition: background-color 120ms ease; }
  .acc-header:hover { background: color-mix(in srgb, var(--primary-color) 6%, var(--ha-card-background, var(--card-background-color))); }
  .acc-header-icon { color: var(--secondary-text-color); display: inline-flex; flex: 0 0 auto; transition: color 120ms ease; }
  .acc-header-icon ha-icon { --mdc-icon-size: 18px; }
  .accordion-section.open .acc-header-icon { color: var(--primary-color); }
  .acc-title { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
  .badge, .id-badge { border: 1px solid var(--divider-color); border-radius: 999px; }
  .badge { font-size: 11px; padding: 1px 7px; }
  .flex-spacer { flex: 1; }
  .icon-btn { width: 30px; height: 30px; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--divider-color); border-radius: 10px; background: transparent; color: var(--secondary-text-color); cursor: pointer; padding: 0; line-height: 1; transition: color 120ms, border-color 120ms, background 120ms; }
  .icon-btn:hover { color: var(--primary-color); border-color: var(--primary-color); background: rgba(3, 169, 244, 0.05); }
  .icon-btn:disabled { opacity: 0.35; cursor: default; pointer-events: none; }
  .icon-btn.spinning { color: var(--primary-color); border-color: var(--primary-color); opacity: 1 !important; pointer-events: none; }
  .icon-btn.spinning ha-icon { animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .chevron, .entity-chevron { font-size: 9px; color: var(--secondary-text-color); transition: transform 150ms; }
  .accordion-section.open .chevron, .entity-block.open .entity-chevron { transform: rotate(180deg); }
  .acc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 0 16px 12px; display: grid; gap: 6px; align-content: start; }
  .entity-block { border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--secondary-background-color, var(--ha-card-background)); overflow-x: clip; transition: border-color 120ms ease; }
  .entity-block:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
  .entity-summary { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: pointer; user-select: none; border-radius: var(--ha-card-border-radius, 12px); transition: background-color 120ms ease; }
  .entity-summary:hover { background: color-mix(in srgb, var(--primary-color) 5%, var(--secondary-background-color, var(--ha-card-background))); }
  .entity-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .entity-name { font-size: 13px; font-weight: 700; flex: 1; min-width: 0; display: inline-flex; align-items: center; gap: 8px; }
  .entity-name-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--state-icon-color, var(--secondary-text-color)); flex-shrink: 0; }
  .entity-name-icon ha-icon { --mdc-icon-size: 16px; }
  .entity-name-label { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entity-body { display: none; }
  .entity-block.open .entity-body { display: block; }
  .entity-block.open > .entity-summary { position: sticky; top: 0; z-index: 2; background: var(--secondary-background-color, var(--ha-card-background)); border-bottom: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
  .id-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; font-family: "SF Mono", "Fira Code", Consolas, monospace; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); border-radius: calc(var(--ha-card-border-radius, 12px) * 0.4); padding: 2px 5px; flex-shrink: 0; white-space: nowrap; min-width: 68px; justify-content: space-between; }
  .id-badge span:first-child { color: var(--secondary-text-color); opacity: 0.75; }
  .id-badge span:last-child { color: var(--primary-text-color); text-align: right; }
  .entity-count { font-size: 10px; color: var(--secondary-text-color); flex-shrink: 0; white-space: nowrap; }
  .cache-panel-header {
    margin-top: 6px;
    margin-bottom: 8px;
  }
  .cache-panel-body,
  .secondary-tab-panel--connected .cache-panel-body {
    padding-top: 0;
  }
  .entity-chevron { font-size: 8px; color: var(--secondary-text-color); transition: transform 150ms; flex-shrink: 0; }
  .inner-section-label { padding: 5px 12px 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary-text-color); background: var(--primary-background-color, rgba(0,0,0,0.04)); border-top: 1px solid var(--divider-color); margin-top: 2px; }
  .inner-section-label:first-child { border-top: none; margin-top: 0; }
  .inner-row { display: flex; align-items: center; gap: 6px; padding: 5px 8px; }
  .inner-row:hover { background: rgba(0, 0, 0, 0.03); }
  .inner-label { font-size: 12px; font-weight: 500; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inner-badges { display: flex; gap: 4px; flex-shrink: 0; }
  .buttons-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 6px; }
  .buttons-col { display: flex; flex-direction: column; }
  .inner-empty { padding: 8px 12px; font-size: 11px; color: var(--secondary-text-color); font-style: italic; }
  .cache-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; padding: 24px 16px; text-align: center; font-size: 13px; line-height: 1.6; }
  .cache-state-icon { font-size: 32px; line-height: 1; margin-bottom: 4px; }
  .cache-state-sub { font-size: 12px; line-height: 1.5; max-width: 260px; }
  .cache-enable-state { gap: 14px; max-width: 360px; margin: 0 auto; }
  .cache-enable-state .cache-state-title { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
  .cache-enable-state .cache-state-sub { font-size: 13px; color: var(--secondary-text-color); max-width: 320px; }
  .cache-enable-icon { width: 64px; height: 64px; display: grid; place-items: center; border-radius: var(--ha-card-border-radius, 12px); color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 14%, transparent); margin-bottom: 4px; }
  .cache-enable-icon ha-icon { --mdc-icon-size: 34px; }
  .cache-enable-btn { display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; padding: 12px 22px; border-radius: var(--ha-card-border-radius, 12px); border: 1px solid color-mix(in srgb, var(--primary-color) 60%, var(--divider-color)); background: color-mix(in srgb, var(--primary-color) 22%, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform 120ms ease, background 120ms ease, border-color 120ms ease, box-shadow 120ms ease; box-shadow: 0 4px 14px color-mix(in srgb, var(--primary-color) 22%, transparent); }
  .cache-enable-btn:hover:not(:disabled) { transform: translateY(-1px); background: color-mix(in srgb, var(--primary-color) 28%, var(--ha-card-background, var(--card-background-color))); border-color: var(--primary-color); box-shadow: 0 6px 18px color-mix(in srgb, var(--primary-color) 28%, transparent); }
  .cache-enable-btn:active:not(:disabled) { transform: translateY(0); }
  .cache-enable-btn:disabled { opacity: 0.55; cursor: default; transform: none; box-shadow: none; }
  .cache-enable-btn ha-icon { --mdc-icon-size: 20px; color: var(--primary-color); }
  .version-mismatch-state { flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 18px; padding: 24px 32px 40px; }
  .version-mismatch-header { display: flex; align-items: flex-start; gap: 14px; }
  .version-mismatch-icon { flex-shrink: 0; display: inline-flex; padding-top: 3px; color: var(--warning-color, #ff9800); }
  .version-mismatch-icon ha-icon { --mdc-icon-size: 26px; }
  .version-mismatch-title { font-size: 20px; font-weight: 800; line-height: 1.25; color: var(--primary-text-color); }
  .version-mismatch-copy { font-size: 13px; line-height: 1.65; color: var(--secondary-text-color); }
  .version-mismatch-versions { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid color-mix(in srgb, var(--error-color, #db4437) 22%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 2px); background: color-mix(in srgb, var(--error-color, #db4437) 4%, var(--card-background-color, var(--ha-card-background))); overflow: hidden; }
  .version-mismatch-row { display: flex; flex-direction: column; gap: 5px; padding: 14px 18px; }
  .version-mismatch-row + .version-mismatch-row { border-left: 1px solid color-mix(in srgb, var(--error-color, #db4437) 18%, var(--divider-color)); }
  .version-mismatch-label { font-size: 10px; font-weight: 800; letter-spacing: 0.09em; text-transform: uppercase; color: var(--secondary-text-color); }
  .version-mismatch-value { font-size: 18px; font-weight: 700; font-family: "SF Mono", "Fira Code", Consolas, monospace; color: var(--primary-text-color); word-break: break-word; }
  .backend-unavailable-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 24px 32px; text-align: center; }
  .backend-unavailable-icon { color: var(--secondary-text-color); display: inline-flex; }
  .backend-unavailable-icon ha-icon { --mdc-icon-size: 40px; }
  .backend-unavailable-title { font-size: 16px; font-weight: 700; color: var(--primary-text-color); }
  .backend-unavailable-copy { font-size: 13px; line-height: 1.6; color: var(--secondary-text-color); max-width: 320px; }
  .stale-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 30%, transparent); }
  .stale-banner-text { flex: 1; }
  .stale-banner-btn { background: none; border: 1px solid var(--divider-color); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--primary-text-color); }
  .settings-hub-header { flex-shrink: 0; padding: 14px 16px 0; }
  .settings-content { flex-shrink: 0; display: flex; flex-direction: column; }
  .hub-compact-card { display: flex; align-items: center; gap: 14px; padding: 12px 14px; border: 1px solid color-mix(in srgb, var(--primary-text-color) 12%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 2px); background: var(--ha-card-background, var(--card-background-color, #fff)); }
  .hub-compact-left { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
  .hub-compact-icon-wrap { position: relative; flex-shrink: 0; width: 52px; height: 52px; border-radius: 14px; background: white; border: 1.5px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); display: flex; align-items: center; justify-content: center; transition: color 250ms ease, border-color 250ms ease; }
  .hub-compact-icon-wrap--on { color: #48b851; border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); }
  .hub-compact-icon-wrap--off { color: color-mix(in srgb, var(--secondary-text-color) 45%, transparent); }
  .hub-compact-icon { width: 33px; height: 33px; display: block; }
  .hub-compact-badge { position: absolute; bottom: -5px; right: -5px; width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--ha-card-background, var(--card-background-color, #fff)); background: var(--ha-card-background, var(--card-background-color, #fff)); display: flex; align-items: center; justify-content: center; transition: color 250ms ease; }
  .hub-compact-badge ha-icon { --mdc-icon-size: 12px; }
  .hub-compact-badge--on { color: #67b7ff; }
  .hub-compact-badge--off { color: color-mix(in srgb, var(--secondary-text-color) 45%, transparent); }
  .hub-compact-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .hub-compact-name { font-size: 15px; font-weight: 800; line-height: 1.2; color: var(--primary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hub-compact-meta { font-size: 11.5px; color: var(--secondary-text-color); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .hub-compact-stats { display: flex; align-items: center; gap: 0; flex-shrink: 0; }
  .hub-compact-stat { display: flex; flex-direction: row; align-items: center; gap: 9px; padding: 0 14px; }
  .hub-compact-stat-icon { display: inline-flex; align-items: center; color: var(--secondary-text-color); flex-shrink: 0; }
  .hub-compact-stat-svg { width: 20px; height: 20px; }
  .hub-compact-stat-text { display: flex; flex-direction: column; gap: 1px; }
  .hub-compact-stat-value { font-size: 17px; font-weight: 800; color: var(--primary-text-color); line-height: 1; }
  .hub-compact-stat-label { font-size: 11px; color: var(--secondary-text-color); font-weight: 500; }
  .hub-compact-divider { width: 1px; height: 36px; background: color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); flex-shrink: 0; }
  @media (max-width: 640px) {
    .tabs-scroll { overflow-x: auto; scrollbar-width: none; }
    .tabs-scroll::-webkit-scrollbar { display: none; }
    .tab-btn-label-short { display: inline; }
    .tab-btn--has-short-label .tab-btn-label { display: none; }
    .hub-connection-strip { grid-template-columns: auto minmax(14px, 1fr) auto minmax(14px, 1fr) auto; gap: 6px; padding: 8px 10px; }
    .hub-connection-node { width: 42px; height: 42px; border-radius: 14px; }
    .hub-hero-icon { width: 25px; height: 25px; }
    .hub-ident-name { font-size: 15px; }
    .hub-compact-stats { display: none; }
    .entity-chevron { display: none; }
    .entity-count { display: none; }
    .card-topbar { padding: 4px 8px; gap: 6px; }
    .card-bottom-dock { padding: 5px 8px; }
    .card-bottom-dock-center { font-size: 10px; }
    .hub-picker-btn { max-width: min(100vw - 32px, 320px); }
    .chip-name { max-width: 220px; }
    .card-brand { font-size: 9px; letter-spacing: 0.1em; }
    .cache-panel-header {
      margin-top: 5px;
      margin-bottom: 6px;
    }
  }
`];
  }
});

// custom_components/sofabaton_x1s/www/src/shared/api/control-panel-api.ts
var ControlPanelApi;
var init_control_panel_api = __esm({
  "custom_components/sofabaton_x1s/www/src/shared/api/control-panel-api.ts"() {
    "use strict";
    ControlPanelApi = class {
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
  }
});

// custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors.ts
function selectedHub(snapshot) {
  const hubs = snapshot.state?.hubs ?? [];
  return hubs.find((hub) => hub.entry_id === snapshot.selectedHubEntryId) ?? hubs[0] ?? null;
}
function selectedHubCache(snapshot) {
  const hubs = snapshot.contents?.hubs ?? [];
  return hubs.find((hub) => hub.entry_id === snapshot.selectedHubEntryId) ?? hubs[0] ?? null;
}
function persistentCacheEnabled(snapshot) {
  return !!snapshot.state?.persistent_cache_enabled;
}
function sortByName(items = []) {
  return [...items].sort(
    (left, right) => String(left?.name ?? left?.label ?? "").localeCompare(String(right?.name ?? right?.label ?? ""))
  );
}
function sortById(items = []) {
  return [...items].sort(
    (left, right) => Number(left?.id ?? left?.button_id ?? 0) - Number(right?.id ?? right?.button_id ?? 0)
  );
}
function hubActivities(hub) {
  return sortById(hub?.activities ?? []);
}
function hubDevices(hub) {
  return sortByName(hub?.devices_list ?? []);
}
function deviceClassIcon(deviceClass) {
  switch (String(deviceClass || "").trim().toLowerCase()) {
    case "ir":
      return "mdi:remote";
    case "bluetooth":
      return "mdi:bluetooth";
    case "wifi_roku":
    case "wifi_hue":
    case "wifi_mqtt":
    case "wifi_ip":
      return "mdi:wifi";
    default:
      return "mdi:radio-tower";
  }
}
function activityFavorites(hub, activityId) {
  const rows = hub?.activity_favorites?.[String(activityId)] ?? [];
  return sortById(rows);
}
function activityMacros(hub, activityId) {
  return hub?.activity_macros?.[String(activityId)] ?? [];
}
function activityButtons(hub, activityId) {
  return (hub?.buttons?.[String(activityId)] ?? []).map(Number);
}
function deviceCommands(hub, deviceId) {
  const commands = hub?.commands?.[String(deviceId)] ?? {};
  return Object.entries(commands).map(([id, label]) => ({ id: Number(id), label: String(label || `Command ${id}`) })).sort((left, right) => left.label.localeCompare(right.label));
}
function buttonName(buttonId) {
  return BUTTON_NAMES[buttonId] ?? `Button ${buttonId}`;
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
function remoteAttrsForHub(hass, hub) {
  const entityId = entityForHub(hass, hub);
  return (entityId ? hass?.states?.[entityId]?.attributes : void 0) ?? {};
}
function remoteAvailableForHub(hass, hub) {
  const entityId = entityForHub(hass, hub);
  const stateObject = entityId ? hass?.states?.[entityId] : null;
  const state = String(stateObject?.state ?? "").toLowerCase();
  return !!state && state !== "unavailable" && state !== "unknown";
}
function proxyClientConnected(hass, hub) {
  const attrs = remoteAttrsForHub(hass, hub);
  if (typeof attrs.proxy_client_connected === "boolean") return attrs.proxy_client_connected;
  return !!hub?.proxy_client_connected;
}
function hubConnected(hass, hub) {
  return remoteAvailableForHub(hass, hub) || proxyClientConnected(hass, hub);
}
function canRunHubActions(hass, hub) {
  return remoteAvailableForHub(hass, hub);
}
function resolveCardGateState(snapshot) {
  if (snapshot.toolsFrontendVersionMismatch) return { kind: "version_mismatch" };
  if (snapshot.backendUnavailable) return { kind: "backend_unavailable" };
  const hub = selectedHub(snapshot);
  if (hub && !hubConnected(snapshot.hass, hub)) return { kind: "hub_unavailable" };
  return { kind: "pass" };
}
function resolveRuntimeState(snapshot) {
  const hub = selectedHub(snapshot);
  if (snapshot.runtimeCompletionNotice) {
    return {
      kind: "completion",
      tone: snapshot.runtimeCompletionNotice.tone,
      label: snapshot.runtimeCompletionNotice.label,
      detail: null
    };
  }
  const hubRuntime = hub?.runtime_state;
  if (hubRuntime?.kind === "operation_running") {
    const total = Number(hubRuntime.total_steps || 0);
    const current = Number(hubRuntime.current_step || 0);
    const percent = total > 0 ? Math.max(0, Math.min(100, Math.round(Math.max(0, current) / total * 100))) : null;
    return {
      kind: "operation_running",
      operation: hubRuntime.operation === "backup_restore" ? "backup_restore" : hubRuntime.operation === "backup_export" ? "backup_export" : "wifi_deploy",
      label: String(hubRuntime.label || "Operation running"),
      detail: String(hubRuntime.detail || hubRuntime.label || "Working..."),
      progress: {
        current: Number.isFinite(current) ? current : null,
        total: Number.isFinite(total) && total > 0 ? total : null,
        percent,
        indeterminate: !total || total <= 0
      }
    };
  }
  if (hubRuntime?.kind === "app_connected") {
    return {
      kind: "app_connected",
      label: String(hubRuntime.label || "Only Logs is available while the Sofabaton app is connected."),
      detail: String(hubRuntime.detail || "")
    };
  }
  if (hub && proxyClientConnected(snapshot.hass, hub)) {
    return {
      kind: "app_connected",
      label: "Only Logs is available while the Sofabaton app is connected.",
      detail: null
    };
  }
  if (snapshot.externalHubCommandBusy) {
    return {
      kind: "notice",
      label: String(snapshot.externalHubCommandLabel || "Hub command in progress..."),
      detail: null
    };
  }
  if (snapshot.refreshBusy) {
    return {
      kind: "notice",
      label: "Refreshing cache...",
      detail: null
    };
  }
  return null;
}
function resolveTabAvailability(snapshot, tabId) {
  const gateState = resolveCardGateState(snapshot);
  if (gateState.kind !== "pass") {
    return {
      kind: "blocked",
      title: gateState.kind === "hub_unavailable" ? "Hub unavailable" : "Unavailable",
      message: gateState.kind === "version_mismatch" ? "Refresh the dashboard to load the updated Sofabaton Control Panel card." : gateState.kind === "backend_unavailable" ? "Waiting for the Sofabaton X1S integration to finish starting." : "This hub is not connected, so the control panel is unavailable until the hub reconnects."
    };
  }
  if (tabId === "logs" || tabId === "settings" || tabId === "cache") {
    return { kind: "available" };
  }
  const hub = selectedHub(snapshot);
  if (hub && proxyClientConnected(snapshot.hass, hub)) {
    const title = tabId === "wifi_commands" ? "Wifi Commands unavailable" : tabId === "backup" ? "Backup unavailable" : "Blobs unavailable";
    const message = tabId === "wifi_commands" ? "Wifi Commands cannot be used while the Sofabaton app is connected to the hub through the proxy." : tabId === "backup" ? "Backup cannot be used while the Sofabaton app is connected to the hub through the proxy." : "Blobs cannot be used while the Sofabaton app is connected to the hub through the proxy.";
    return { kind: "blocked", title, message };
  }
  return { kind: "available" };
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
var BUTTON_NAMES;
var init_control_panel_selectors = __esm({
  "custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors.ts"() {
    "use strict";
    init_lit();
    BUTTON_NAMES = {
      151: "C",
      152: "B",
      153: "A",
      154: "Exit",
      155: "Dvr",
      156: "Play",
      157: "Guide",
      174: "Up",
      175: "Left",
      176: "Ok",
      177: "Right",
      178: "Down",
      179: "Back",
      180: "Home",
      181: "Menu",
      182: "Vol Up",
      183: "Ch Up",
      184: "Mute",
      185: "Vol Down",
      186: "Ch Down",
      187: "Rew",
      188: "Pause",
      189: "Fwd",
      190: "Red",
      191: "Green",
      192: "Yellow",
      193: "Blue",
      198: "Power On",
      199: "Power Off"
    };
  }
});

// custom_components/sofabaton_x1s/www/src/state/control-panel-store.ts
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
    const selectedBlobsSection = VALID_BLOBS_SECTIONS.has(parsed?.selectedBlobsSection) ? parsed.selectedBlobsSection : VALID_BLOBS_SECTIONS.has(parsed?.openBlobsSection) ? parsed.openBlobsSection : "fetch";
    return {
      selectedHubEntryId,
      ...selectedTab ? { selectedTab } : {},
      selectedCacheSection,
      selectedBackupSection,
      selectedBlobsSection
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
var BACKEND_RETRY_MIN_MS, BACKEND_RETRY_MAX_MS, VIEW_STATE_STORAGE_KEY, VALID_TABS, VALID_CACHE_SECTIONS, VALID_BACKUP_SECTIONS, VALID_BLOBS_SECTIONS, INITIAL_SNAPSHOT, ControlPanelStore;
var init_control_panel_store = __esm({
  "custom_components/sofabaton_x1s/www/src/state/control-panel-store.ts"() {
    "use strict";
    init_control_panel_api();
    init_control_panel_selectors();
    BACKEND_RETRY_MIN_MS = 2e3;
    BACKEND_RETRY_MAX_MS = 1e4;
    VIEW_STATE_STORAGE_KEY = "sofabaton_x1s:tools_card:view_state:v1";
    VALID_TABS = /* @__PURE__ */ new Set(["settings", "wifi_commands", "blobs", "backup", "cache", "logs"]);
    VALID_CACHE_SECTIONS = /* @__PURE__ */ new Set(["activities", "devices"]);
    VALID_BACKUP_SECTIONS = /* @__PURE__ */ new Set(["make", "edit", "restore"]);
    VALID_BLOBS_SECTIONS = /* @__PURE__ */ new Set(["fetch", "test", "save"]);
    INITIAL_SNAPSHOT = {
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
      selectedBlobsSection: "fetch",
      openEntity: null,
      staleData: false,
      refreshBusy: false,
      activeRefreshLabel: null,
      externalHubCommandBusy: false,
      externalHubCommandLabel: null,
      runtimeCompletionNotice: null,
      pendingSettingKey: null,
      pendingActionKey: null,
      logsLines: [],
      logsError: null,
      logsLoading: false,
      logsLoadedEntryId: null,
      logsSubscribedEntryId: null,
      logsStickToBottom: true,
      logsScrollBehavior: "auto",
      pendingScrollEntityKey: null
    };
    ControlPanelStore = class {
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
        this._runtimeCompletionTimer = null;
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
        this._scheduleRuntimeStatePoll();
        if (this._snapshot.selectedTab === "logs") {
          void this.syncLogsFeed();
        }
      }
      disconnected() {
        this._isConnected = false;
        this._snapshot = {
          ...this._snapshot,
          externalHubCommandBusy: false,
          externalHubCommandLabel: null,
          runtimeCompletionNotice: null
        };
        this._clearRuntimeStatePoll();
        this._clearRuntimeCompletionTimer();
        this._clearBackendRetry();
        void this._teardownBackupOperationFeed();
        void this.unsubscribeLogs();
      }
      _clearBackendRetry() {
        if (this._backendRetryTimer) {
          clearTimeout(this._backendRetryTimer);
          this._backendRetryTimer = null;
        }
        this._backendRetryDelay = BACKEND_RETRY_MIN_MS;
      }
      _clearRuntimeCompletionTimer() {
        if (this._runtimeCompletionTimer) {
          clearTimeout(this._runtimeCompletionTimer);
          this._runtimeCompletionTimer = null;
        }
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
          if (this._isConnected && !this._isHubCommandBusy() && !this._snapshot.loading && Date.now() > this._refreshGraceUntil && didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)) {
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
          externalHubCommandBusy: false,
          externalHubCommandLabel: null,
          runtimeCompletionNotice: null
        };
        this._clearRuntimeCompletionTimer();
        this.persistViewState();
        this.emit();
        void (async () => {
          await this._teardownBackupOperationFeed();
          await this.unsubscribeLogs();
          await this.loadControlPanelState();
          await this._syncBackupOperationFeed();
          if (this._snapshot.selectedTab === "logs") await this.syncLogsFeed();
        })();
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
      setSelectedBlobsSection(sectionId) {
        if (this._snapshot.selectedBlobsSection === sectionId) return;
        this._snapshot = { ...this._snapshot, selectedBlobsSection: sectionId };
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
      setExternalHubCommandBusy(busy, label = null) {
        this._snapshot = {
          ...this._snapshot,
          externalHubCommandBusy: busy,
          externalHubCommandLabel: busy ? String(label || "").trim() || "Hub command in progress\u2026" : null
        };
        this.emit();
      }
      showRuntimeCompletion(notice, ttlMs = 6e3) {
        this._clearRuntimeCompletionTimer();
        this._snapshot = {
          ...this._snapshot,
          runtimeCompletionNotice: notice
        };
        this.emit();
        if (!notice) return;
        this._runtimeCompletionTimer = setTimeout(() => {
          this._runtimeCompletionTimer = null;
          if (!this._snapshot.runtimeCompletionNotice) return;
          this._snapshot = {
            ...this._snapshot,
            runtimeCompletionNotice: null
          };
          this.emit();
        }, ttlMs);
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
      async refreshSection(sectionId) {
        if (this._isHubCommandBusy()) return;
        const hub = selectedHub(this._snapshot);
        if (!hub) return;
        this._snapshot = { ...this._snapshot, refreshBusy: true, activeRefreshLabel: null };
        this.emit();
        try {
          await this.api().refreshCatalog(hub.entry_id, sectionId);
          await this.loadState({ silent: true });
        } finally {
          this._snapshot = {
            ...this._snapshot,
            refreshBusy: false,
            activeRefreshLabel: null,
            staleData: false
          };
          this.emit();
        }
      }
      async refreshForHub(kind, targetId, key) {
        if (this._isHubCommandBusy()) return;
        const hub = selectedHub(this._snapshot);
        if (!hub) return;
        this._snapshot = { ...this._snapshot, refreshBusy: true, activeRefreshLabel: key };
        this.emit();
        try {
          await this.api().refreshCacheEntry({
            hubEntryId: hub.entry_id,
            entityId: entityForHub(this._snapshot.hass, hub),
            kind,
            targetId
          });
          await this.loadState({ silent: true });
        } finally {
          this._snapshot = {
            ...this._snapshot,
            refreshBusy: false,
            activeRefreshLabel: null,
            staleData: false,
            pendingScrollEntityKey: key
          };
          this.emit();
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
        if (previousRuntime?.kind === "operation_running" && nextRuntime?.kind !== "operation_running") {
          const operation = previousRuntime.operation;
          const successLabel = operation === "backup_restore" ? "Restore completed successfully." : operation === "backup_export" ? "Backup completed successfully." : "Wifi Device deployed successfully.";
          this.showRuntimeCompletion({
            tone: "success",
            label: successLabel
          });
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
              selectedBackupSection: this._snapshot.selectedBackupSection,
              selectedBlobsSection: this._snapshot.selectedBlobsSection
            })
          );
        } catch (_error) {
        }
      }
      _isHubCommandBusy() {
        const hub = selectedHub(this._snapshot);
        const activeBackupOperation = hub?.active_backup_operation;
        const backupBusy = !!activeBackupOperation && ["pending", "running"].includes(String(activeBackupOperation.status || ""));
        return Boolean(
          this._snapshot.refreshBusy || this._snapshot.externalHubCommandBusy || this._snapshot.pendingActionKey || backupBusy
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
      emit() {
        this.onChange(this._snapshot);
      }
    };
  }
});

// custom_components/sofabaton_x1s/www/src/components/hub-picker.ts
function renderHubPicker(params) {
  const prefix = params.prefixLabel ?? "HUB";
  if (!params.interactive) {
    return T`
      <div class="hub-picker hub-picker--static" id="hub-picker-root">
        <div class="hub-picker-btn hub-picker-btn--static">
          <span class="chip-prefix">${prefix}</span>
          <span class="chip-name">${params.selectedLabel}</span>
        </div>
      </div>
    `;
  }
  return T`
    <div class="hub-picker" id="hub-picker-root">
      <button
        class="hub-picker-btn${params.open ? " is-open" : ""}"
        id="hub-picker-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded=${String(params.open)}
        @click=${params.onToggle}
      >
        <span class="chip-prefix">${prefix}</span>
        <span class="chip-name">${params.selectedLabel}</span>
        <ha-icon class="chip-arrow" icon="mdi:chevron-up"></ha-icon>
      </button>
      ${params.open ? T`
            <div id="hub-picker-menu" class="hub-picker-menu" role="menu">
              ${params.hubs.map(
    (hub) => T`
                  <button
                    class="hub-option${hub.entry_id === params.selectedEntryId ? " selected" : ""}"
                    type="button"
                    role="menuitemradio"
                    aria-checked=${String(hub.entry_id === params.selectedEntryId)}
                    @click=${() => params.onSelect(hub.entry_id)}
                  >
                    ${hub.name || hub.entry_id}
                  </button>
                `
  )}
            </div>
          ` : null}
    </div>
  `;
}
var init_hub_picker = __esm({
  "custom_components/sofabaton_x1s/www/src/components/hub-picker.ts"() {
    "use strict";
    init_lit();
  }
});

// custom_components/sofabaton_x1s/www/src/components/tab-bar.ts
function renderTabBar(params) {
  const tabs = [
    { id: "cache", label: "Cache", disabled: false },
    { id: "wifi_commands", label: "Wifi Commands", shortLabel: "Wifi", disabled: false },
    { id: "backup", label: "Backup", disabled: false },
    { id: "blobs", label: "Blobs", disabled: false }
  ];
  const toolsMenuActive = params.selectedTab === "settings" || params.selectedTab === "logs";
  return T`
    <div class="tabs">
      <div class="tabs-scroll">
        ${tabs.map(
    (tab) => T`
            <button
              class="tab-btn${tab.shortLabel ? " tab-btn--has-short-label" : ""}${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
              type="button"
              ?disabled=${tab.disabled}
              @click=${() => params.onSelect(tab.id)}
            >
              <span class="tab-btn-label">${tab.label}</span>
              ${tab.shortLabel ? T`<span class="tab-btn-label-short">${tab.shortLabel}</span>` : null}
            </button>
          `
  )}
      </div>
      <div class="tab-menu" id="tools-tab-menu-root">
        <button
          class="tab-btn tab-btn--menu${toolsMenuActive ? " active" : ""}${params.toolsMenuOpen ? " is-open" : ""}"
          id="tools-tab-menu-btn"
          type="button"
          aria-haspopup="menu"
          aria-expanded=${String(params.toolsMenuOpen)}
          @click=${params.onToggleToolsMenu}
        >
          <ha-icon class="tab-btn-menu-icon" icon="mdi:cog-outline"></ha-icon>
          <ha-icon class="tab-btn-menu-caret" icon="mdi:chevron-down"></ha-icon>
        </button>
        ${params.toolsMenuOpen ? T`
              <div class="tab-menu-dropdown" id="tools-tab-menu-dropdown" role="menu">
                <button
                  class="tab-menu-item${params.selectedTab === "settings" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "settings")}
                  @click=${() => params.onSelect("settings")}
                >
                  Settings
                </button>
                <button
                  class="tab-menu-item${params.selectedTab === "logs" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "logs")}
                  @click=${() => params.onSelect("logs")}
                >
                  Logs
                </button>
              </div>
            ` : null}
      </div>
    </div>
  `;
}
var init_tab_bar = __esm({
  "custom_components/sofabaton_x1s/www/src/components/tab-bar.ts"() {
    "use strict";
    init_lit();
  }
});

// custom_components/sofabaton_x1s/www/src/components/setting-tile.ts
function renderSettingTile(params) {
  return T`
    <div
      class="setting-tile ${params.classes ?? ""}"
      @pointerdown=${(event) => {
    const tile = event.currentTarget;
    if (tile.classList.contains("disabled")) return;
    tile.classList.add("pressed");
  }}
      @pointerup=${(event) => {
    event.currentTarget.classList.remove("pressed");
  }}
      @pointercancel=${(event) => {
    event.currentTarget.classList.remove("pressed");
  }}
      @pointerleave=${(event) => {
    event.currentTarget.classList.remove("pressed");
  }}
      @click=${params.onClick ?? A}
    >
      <div class="setting-tile-body">
        <div class="setting-title">
          ${params.title}
          ${params.footerLabel ? T`<span class="setting-global-tag">${params.footerLabel}</span>` : A}
        </div>
        <div class="setting-description">${params.description}</div>
      </div>
      <div class="setting-tile-control">${params.control}</div>
    </div>
  `;
}
var init_setting_tile = __esm({
  "custom_components/sofabaton_x1s/www/src/components/setting-tile.ts"() {
    "use strict";
    init_lit();
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/settings-tab.ts
function renderSettingsTab(params) {
  if (params.loading) return T`<div class="cache-state">Loading…</div>`;
  if (params.error) return T`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return T`<div class="cache-state">No hubs found.</div>`;
  const hub = params.hub;
  const connected = hubConnected(params.hass, hub);
  const proxyOn = proxyClientConnected(params.hass, hub);
  const hubVersion = String(hub.version ?? "").trim();
  const firmwareVersion = hub.firmware_version != null ? `FW: v${hub.firmware_version}` : "";
  const versionLine = [hubVersion ? `Sofabaton ${hubVersion}` : "", firmwareVersion].filter(Boolean).join(" / ");
  const busy = !!(params.pendingSettingKey || params.pendingActionKey || params.hubCommandBusy);
  const canAct = canRunHubActions(params.hass, params.hub) && !busy;
  const settingValue = (key) => !!params.hub?.settings?.[key];
  return T`
    <div class="hub-tab-layout">
      <div class="settings-hub-header">
        <div class="hub-compact-card">
          <div class="hub-compact-left">
            <div class="hub-compact-icon-wrap ${connected ? "hub-compact-icon-wrap--on" : "hub-compact-icon-wrap--off"}">
              ${hubIcon("hero", "hub-compact-icon")}
              <div class="hub-compact-badge ${proxyOn ? "hub-compact-badge--on" : "hub-compact-badge--off"}">
                <ha-icon icon="mdi:cellphone"></ha-icon>
              </div>
            </div>
            <div class="hub-compact-text">
              <div class="hub-compact-name">${hub.name || "Unknown"}</div>
              ${versionLine ? T`<div class="hub-compact-meta">${versionLine}</div>` : A}
              ${hub.ip_address ? T`<div class="hub-compact-meta">${hub.ip_address}</div>` : A}
            </div>
          </div>
          <div class="hub-compact-stats">
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("activities", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.activity_count || 0)}</div>
                <div class="hub-compact-stat-label">Activities</div>
              </div>
            </div>
            <div class="hub-compact-divider"></div>
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("devices", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.device_count || 0)}</div>
                <div class="hub-compact-stat-label">Devices</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="tab-panel scrollable">
        <div class="settings-content">
          <div class="settings-list">
            ${renderSettingTile({
    title: "Persistent Cache",
    description: "Store activity and device data locally for faster access.",
    classes: `toggle${busy ? " disabled" : ""}`,
    footerLabel: "GLOBAL",
    control: T`<ha-switch .checked=${params.persistentCacheEnabled} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("persistent_cache", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("persistent_cache", !params.persistentCacheEnabled)
  })}
            ${renderSettingTile({
    title: "Hex Logging",
    description: "Log raw hex traffic between hub, integration, and app.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: T`<ha-switch .checked=${settingValue("hex_logging_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("hex_logging_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("hex_logging_enabled", !settingValue("hex_logging_enabled"))
  })}
            ${renderSettingTile({
    title: "Proxy",
    description: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: T`<ha-switch .checked=${settingValue("proxy_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("proxy_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("proxy_enabled", !settingValue("proxy_enabled"))
  })}
            ${renderSettingTile({
    title: "WiFi Device",
    description: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: T`<ha-switch .checked=${settingValue("wifi_device_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("wifi_device_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("wifi_device_enabled", !settingValue("wifi_device_enabled"))
  })}
            ${renderSettingTile({
    title: "Find Remote",
    description: "Make the remote beep so you can locate it.",
    classes: `action${canAct ? "" : " disabled"}`,
    control: T`<ha-icon class="setting-icon" icon="mdi:bell-ring-outline"></ha-icon>`,
    onClick: canAct ? () => params.onRunAction("find_remote") : void 0
  })}
            ${renderSettingTile({
    title: "Sync Remote",
    description: "Push the latest configuration to the physical remote.",
    classes: `action${canAct ? "" : " disabled"}`,
    control: T`<ha-icon class="setting-icon" icon="mdi:sync"></ha-icon>`,
    onClick: canAct ? () => params.onRunAction("sync_remote") : void 0
  })}
          </div>
        </div>
      </div>
    </div>
  `;
}
var init_settings_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/settings-tab.ts"() {
    "use strict";
    init_lit();
    init_control_panel_selectors();
    init_setting_tile();
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/cache-tab.ts
function badge(type, value) {
  return T`<span class="id-badge"><span>${type}:</span><span>${String(value)}</span></span>`;
}
function renderCacheTab(params) {
  if (params.loading) return T`<div class="cache-state">Loading…</div>`;
  if (params.error) return T`<div class="cache-state error">${params.error}</div>`;
  if (!params.persistentCacheEnabled) {
    return T`
      <div class="cache-state cache-enable-state">
        <div class="cache-enable-icon"><ha-icon icon="mdi:database-cog-outline"></ha-icon></div>
        <div class="cache-state-title">Persistent cache is off</div>
        <div class="cache-state-sub">Turn it on to browse cached activities and devices, and to unlock Backup and Blobs workflows that depend on it.</div>
        <button
          class="cache-enable-btn"
          ?disabled=${params.enablingPersistentCache || params.hubCommandBusy}
          @click=${params.onEnablePersistentCache}
        >
          <ha-icon icon="mdi:database-check-outline"></ha-icon>
          <span>${params.enablingPersistentCache ? "Enabling\u2026" : "Enable persistent cache"}</span>
        </button>
      </div>
    `;
  }
  if (!params.hub) return T`<div class="cache-state">No hubs found.</div>`;
  const renderActivity = (activity) => {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const isOpen = params.openEntity === key;
    const locked2 = params.hubCommandBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const favorites = activityFavorites(params.hub, id);
    const macros = activityMacros(params.hub, id);
    const buttons = activityButtons(params.hub, id);
    return T`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-label">${activity.name || `Activity ${id}`}</span>
          </span>
          <span class="entity-meta">
            ${badge("DevID", id)}
            <span class="entity-count entity-count--activity">${favorites.length} favs / ${macros.length} macros / ${buttons.length} btns</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked2} @click=${(event) => {
      event.stopPropagation();
      params.onRefreshEntry("activity", id, key);
    }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? T`<div class="entity-body">
          ${favorites.length ? T`<div class="inner-section-label">Favorites</div>${favorites.map((favorite) => T`<div class="inner-row"><span class="inner-label">${favorite.label || `Favorite ${favorite.command_id}`}</span><span class="inner-badges">${badge("FavID", favorite.button_id)}${badge("DevID", favorite.device_id)}${badge("ComID", favorite.command_id)}</span></div>`)}` : null}
          ${macros.length ? T`<div class="inner-section-label">Macros</div>${macros.map((macro) => T`<div class="inner-row"><span class="inner-label">${macro.label || macro.name || `Macro ${macro.command_id}`}</span><span class="inner-badges">${badge("FavID", macro.command_id)}${badge("ComID", macro.command_id)}</span></div>`)}` : null}
          ${buttons.length ? T`<div class="inner-section-label">Buttons</div><div class="buttons-grid">${[buttons.slice(0, Math.ceil(buttons.length / 2)), buttons.slice(Math.ceil(buttons.length / 2))].map((column) => T`<div class="buttons-col">${column.map((buttonId) => T`<div class="inner-row"><span class="inner-label">${buttonName(buttonId)}</span><span class="inner-badges">${badge("ComID", buttonId)}</span></div>`)}</div>`)}</div>` : null}
          ${!favorites.length && !macros.length && !buttons.length ? T`<div class="inner-empty">No cached data yet.</div>` : null}
        </div>` : null}
      </div>
    `;
  };
  const renderDevice = (device) => {
    const id = Number(device.id);
    const key = `dev-${id}`;
    const isOpen = params.openEntity === key;
    const locked2 = params.hubCommandBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const commands = deviceCommands(params.hub, id);
    const icon = deviceClassIcon(device.device_class);
    return T`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-icon"><ha-icon icon=${icon}></ha-icon></span>
            <span class="entity-name-label">${device.name || `Device ${id}`}</span>
          </span>
          <span class="entity-meta">
            ${badge("DevID", id)}
            <span class="entity-count">${Number(device.command_count || 0)} cmds</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked2} @click=${(event) => {
      event.stopPropagation();
      params.onRefreshEntry("device", id, key);
    }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? T`<div class="entity-body">${commands.length ? commands.map((command) => T`<div class="inner-row"><span class="inner-label">${command.label}</span><span class="inner-badges">${badge("ComID", command.id)}</span></div>`) : T`<div class="inner-empty">No cached commands.</div>`}</div>` : null}
      </div>
    `;
  };
  const activities = hubActivities(params.hub);
  const devices = hubDevices(params.hub);
  const selectedSection = params.selectedSection;
  const locked = params.hubCommandBusy || params.selectedHubProxyConnected;
  const activeBody = selectedSection === "activities" ? activities.map(renderActivity) : devices.map(renderDevice);
  return T`
    <div class="tab-panel">
      ${params.staleData ? T`<div class="stale-banner"><span class="stale-banner-text">Cache was updated externally. Refresh to see latest data.</span><button class="stale-banner-btn" @click=${params.onRefreshStale}>Refresh</button></div>` : null}
      ${renderSecondaryTabShell({
    connected: true,
    shellClassName: "cache-panel secondary-view-shell--edge",
    items: [
      { id: "activities", label: "Activities", icon: "mdi:play-circle-outline", count: activities.length },
      { id: "devices", label: "Devices", icon: "mdi:audio-video", count: devices.length }
    ],
    selectedId: selectedSection,
    onSelect: params.onSelectSection,
    content: renderSecondaryPanel({
      connected: true,
      header: T`
          <div class="secondary-panel-header secondary-panel-header--plain cache-panel-header">
            <span class="flex-spacer"></span>
            <span class="refresh-list-label">Refresh list</span>
            <button class="icon-btn${params.refreshBusy && !params.activeRefreshLabel ? " spinning" : ""}" ?disabled=${locked} @click=${() => params.onRefreshSection(selectedSection)}>
              <ha-icon icon="mdi:refresh"></ha-icon>
            </button>
          </div>
          `,
      bodyClassName: "cache-panel-body",
      body: activeBody
    })
  })}
    </div>
  `;
}
var init_cache_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/cache-tab.ts"() {
    "use strict";
    init_lit();
    init_secondary_tab();
    init_control_panel_selectors();
  }
});

// custom_components/sofabaton_x1s/www/src/components/log-console.ts
function renderLogConsole(params) {
  const body = params.loading && !params.lines.length ? T`<div class="logs-empty">Loading log stream…</div>` : params.error && !params.lines.length ? T`<div class="logs-empty error">${params.error}</div>` : !params.lines.length ? T`<div class="logs-empty">No log lines captured for this hub yet.</div>` : params.lines.map((line) => {
    const formatted = formatLogEntry(line);
    return T`
                <div class="log-line" title=${`${formatted.prefix} ${formatted.lineText}`.trim()}><span class="log-line-level log-line-level--${formatted.level}">${formatted.prefix}</span> <span class="log-line-msg">${formatted.lineText}</span></div>
              `;
  });
  return T`
    <div class="tab-panel logs-panel">
      ${renderSecondaryTabShell({
    items: [{ id: "logs", label: "Live Console", icon: "mdi:console-line", passive: true }],
    selectedId: "logs",
    connected: true,
    shellClassName: "secondary-view-shell--edge",
    content: renderSecondaryViewBody({
      connected: true,
      className: "logs-console-wrap",
      content: T`<div class="logs-console" id="logs-console">${body}</div>`
    })
  })}
    </div>
  `;
}
var init_log_console = __esm({
  "custom_components/sofabaton_x1s/www/src/components/log-console.ts"() {
    "use strict";
    init_lit();
    init_secondary_tab();
    init_control_panel_selectors();
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/logs-tab.ts
function renderLogsTab(params) {
  return renderLogConsole({
    lines: params.lines,
    loading: params.loading,
    error: params.error
  });
}
var init_logs_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/logs-tab.ts"() {
    "use strict";
    init_log_console();
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/blobs-state.ts
function blobDeviceOptions(hub) {
  return [...hub?.devices_list ?? []].map((device) => ({
    value: String(Number(device.id)),
    label: String(device.name || `Device ${Number(device.id)}`),
    deviceClass: String(device.device_class || ""),
    commandCount: Number(device.command_count || 0)
  })).sort((left, right) => left.label.localeCompare(right.label));
}
function blobCommandOptions(hub, deviceId) {
  if (!hub || !Number.isInteger(deviceId)) return [];
  const commands = hub.commands?.[String(deviceId)] ?? {};
  return Object.entries(commands).map(([id, label]) => ({
    value: String(Number(id)),
    label: String(label || `Command ${id}`)
  })).sort((left, right) => left.label.localeCompare(right.label));
}
function blobFetchBlockedReason(params) {
  if (!params.persistentCacheEnabled) return "cache_disabled";
  if (Number.isInteger(params.selectedDeviceId) && params.commandCount <= 0) return "no_commands";
  return null;
}
var init_blobs_state = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/blobs-state.ts"() {
    "use strict";
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/blobs-tab.ts
var BLOBS_SECTION_ITEMS, SofabatonBlobsTab;
var init_blobs_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/blobs-tab.ts"() {
    "use strict";
    init_lit();
    init_secondary_tab();
    init_control_panel_api();
    init_control_panel_selectors();
    init_blobs_state();
    BLOBS_SECTION_ITEMS = [
      { id: "fetch", icon: "mdi:cloud-download-outline", label: "Fetch" },
      { id: "test", icon: "mdi:flash-outline", label: "Test" },
      { id: "save", icon: "mdi:content-save-outline", label: "Save" }
    ];
    SofabatonBlobsTab = class extends i3 {
      constructor() {
        super(...arguments);
        this.hass = null;
        this.hub = null;
        this.cacheHub = null;
        this.setHubCommandBusy = null;
        this.refreshControlPanelState = null;
        this.hubCommandBusy = false;
        this.hubCommandBusyLabel = null;
        this.loading = false;
        this.error = null;
        this.persistentCacheEnabled = false;
        this.blockedTitle = null;
        this.blockedMessage = null;
        this._selectedDeviceId = null;
        this._selectedCommandId = null;
        this._fetchLoading = false;
        this._fetchError = "";
        this._fetchResponse = null;
        this._testBlobInput = "";
        this._testLoading = false;
        this._testError = "";
        this._testSuccess = "";
        this._saveDeviceIdInput = "";
        this._saveCommandName = "";
        this._saveBlobInput = "";
        this._saveLoading = false;
        this._saveError = "";
        this._saveSuccess = "";
        this._loadedEntryId = "";
        this.selectedSection = "fetch";
        this.setSelectedSection = () => {
        };
        this._testFlash = false;
        this._saveFlash = false;
        this._copyFlashKey = null;
        this._resultViewMode = {};
        this._testFlashTimer = null;
        this._saveFlashTimer = null;
        this._copyFlashTimer = null;
        this._runFetch = async () => {
          const entryId = String(this.hub?.entry_id || "").trim();
          if (!entryId || this._selectedDeviceId == null || this._selectedCommandId == null || this._busy()) return;
          this._fetchLoading = true;
          this._fetchError = "";
          this._fetchResponse = null;
          this._setSharedBusy(true, "Fetching blob\u2026");
          try {
            this._fetchResponse = await this._api().fetchBlob(entryId, this._selectedDeviceId, this._selectedCommandId);
          } catch (error) {
            this._fetchError = formatError(error);
          } finally {
            this._fetchLoading = false;
            this._setSharedBusy(false);
          }
        };
        this._runTest = async () => {
          const entryId = String(this.hub?.entry_id || "").trim();
          if (!entryId || this._busy() || proxyClientConnected(this.hass, this.hub)) return;
          if (!String(this._testBlobInput || "").trim()) return;
          this._testLoading = true;
          this._testError = "";
          this._testSuccess = "";
          this._setSharedBusy(true, "Testing blob\u2026");
          try {
            await this._api().playIrBlob(entryId, this._testBlobInput);
            this._testSuccess = "Blob sent to the hub for one-shot playback.";
            this._scheduleSuccessRevert("test");
          } catch (error) {
            this._testError = formatError(error);
          } finally {
            this._testLoading = false;
            this._setSharedBusy(false);
          }
        };
        this._runSave = async () => {
          const entryId = String(this.hub?.entry_id || "").trim();
          const deviceId = Number.parseInt(String(this._saveDeviceIdInput || "").trim(), 10);
          if (!entryId || this._busy() || proxyClientConnected(this.hass, this.hub)) return;
          if (!Number.isInteger(deviceId) || deviceId < 1 || deviceId > 255) return;
          if (!String(this._saveCommandName || "").trim() || !String(this._saveBlobInput || "").trim()) return;
          this._saveLoading = true;
          this._saveError = "";
          this._saveSuccess = "";
          this._setSharedBusy(true, "Saving blob\u2026");
          try {
            const result = await this._api().persistIrBlob(
              entryId,
              deviceId,
              this._saveCommandName,
              this._saveBlobInput
            );
            await this._refreshControlPanelState();
            this._saveSuccess = `Saved command ${result.command_name} as id ${result.command_id} on device ${result.device_id}.`;
            this._scheduleSuccessRevert("save");
          } catch (error) {
            this._saveError = formatError(error);
          } finally {
            this._saveLoading = false;
            this._setSharedBusy(false);
          }
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
          blockedTitle: { type: String },
          blockedMessage: { type: String },
          _selectedDeviceId: { state: true },
          _selectedCommandId: { state: true },
          _fetchLoading: { state: true },
          _fetchError: { state: true },
          _fetchResponse: { state: true },
          _testBlobInput: { state: true },
          _testLoading: { state: true },
          _testError: { state: true },
          _testSuccess: { state: true },
          _saveDeviceIdInput: { state: true },
          _saveCommandName: { state: true },
          _saveBlobInput: { state: true },
          _saveLoading: { state: true },
          _saveError: { state: true },
          _saveSuccess: { state: true },
          _loadedEntryId: { state: true },
          selectedSection: { attribute: false },
          setSelectedSection: { attribute: false },
          _testFlash: { state: true },
          _saveFlash: { state: true },
          _copyFlashKey: { state: true },
          _resultViewMode: { state: true }
        };
      }
      static {
        this.styles = [secondaryTabStyles, i`
    :host { display: flex; flex: 1; min-height: 0; }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
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
    .blob-panel {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      margin: -16px;
      /* Container query target — control-grid collapses to single column
         based on this element's width, not the viewport's. Lets a narrow
         card on a wide dashboard collapse without dragging single-column
         layout across wide cards. */
      container-type: inline-size;
      container-name: blob-panel;
    }
    .blob-section-content { display: flex; flex-direction: column; gap: 14px; padding-top: 0; min-width: 0; }
    .blob-section-subtitle {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--secondary-text-color);
    }
    .subtitle-warning {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: color-mix(in srgb, var(--warning-color, #f59e0b) 70%, var(--primary-text-color));
      font-weight: 600;
    }
    .subtitle-warning ha-icon {
      --mdc-icon-size: 16px;
      color: var(--warning-color, #f59e0b);
      flex: 0 0 auto;
    }
    .section-status {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px 12px;
      border: 1px solid var(--divider-color);
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.45;
      color: var(--secondary-text-color);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    .section-status.error {
      color: var(--error-color, #db4437);
      border-color: color-mix(in srgb, var(--error-color, #db4437) 30%, var(--divider-color));
      background: color-mix(in srgb, var(--error-color, #db4437) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .section-status.success {
      color: #2e7d32;
      border-color: color-mix(in srgb, #2e7d32 30%, var(--divider-color));
      background: color-mix(in srgb, #2e7d32 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .section-status.inline-status {
      padding: 6px 12px;
      font-size: 12px;
      animation: blobInlineStatusIn 180ms ease-out;
    }
    @keyframes blobInlineStatusIn {
      from { opacity: 0; transform: translateX(-6px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .section-status.warning {
      border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 35%, var(--divider-color));
      background: color-mix(in srgb, var(--warning-color, #f59e0b) 5%, var(--ha-card-background, var(--card-background-color)));
    }
    .status-icon { color: inherit; display: inline-flex; flex: 0 0 auto; }
    .status-icon ha-icon { --mdc-icon-size: 18px; }
    .control-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 12px;
      align-items: end;
    }
    .control-grid ha-selector {
      width: 100%;
      min-width: 0;
    }
    .copy-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-card-border-radius, 10px);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 10px;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease, border-color 140ms ease;
    }
    .copy-btn ha-icon {
      --mdc-icon-size: 15px;
      display: inline-flex;
    }
    .copy-btn:hover:not([data-state="success"]) {
      border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color));
      color: var(--primary-color);
    }
    .copy-btn:disabled {
      opacity: 0.46;
      cursor: default;
      border-color: color-mix(in srgb, var(--divider-color) 88%, transparent);
    }
    .view-toggle {
      display: inline-flex;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      padding: 2px;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    .view-toggle-btn {
      border: none;
      background: transparent;
      color: var(--secondary-text-color);
      font: inherit;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 4px 12px;
      border-radius: 999px;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease;
    }
    .view-toggle-btn:hover:not(.active) {
      color: var(--primary-text-color);
    }
    .view-toggle-btn.active {
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .copy-btn[data-state="success"] {
      background: #2e7d32;
      border-color: #2e7d32;
      color: #ffffff;
    }
    .action-row {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    /* Primary action button. Visual base matches the Wifi Commands modal
       Save/Cancel buttons:
         .dialog-btn        — outlined neutral
         .dialog-btn-primary — outlined primary (1px primary border + 18%
                              primary-tinted fill + primary-text-color text)
       wifi-commands-tab.ts:374–377. Each blob action keeps that base and
       swaps the tint hue for busy/success/error states.

       Border-radius adapts via --ha-card-border-radius for theme parity. */
    .blob-action-btn {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      min-height: 38px;
      padding: 8px 14px;
      border-radius: var(--ha-card-border-radius, 10px);
      border: 1px solid var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 18%, transparent);
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      transition: background 140ms ease, color 140ms ease, border-color 140ms ease, transform 80ms ease;
    }
    .blob-action-btn:hover:not([data-state="busy"]):not([data-state="disabled"]) {
      border-color: color-mix(in srgb, var(--primary-color) 80%, var(--primary-text-color));
      background: color-mix(in srgb, var(--primary-color) 26%, transparent);
    }
    .blob-action-btn:active:not([data-state="busy"]):not([data-state="disabled"]) {
      transform: translateY(1px);
    }
    .blob-action-btn:focus-visible {
      outline: 2px solid color-mix(in srgb, var(--primary-color) 60%, transparent);
      outline-offset: 2px;
    }
    .blob-action-btn[data-state="busy"] {
      cursor: progress;
      border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color));
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .blob-action-btn[data-state="success"] {
      border-color: #2e7d32;
      background: color-mix(in srgb, #2e7d32 18%, transparent);
      color: #2e7d32;
    }
    .blob-action-btn[data-state="error"] {
      border-color: var(--error-color, #db4437);
      background: color-mix(in srgb, var(--error-color, #db4437) 18%, transparent);
      color: var(--error-color, #db4437);
    }
    .blob-action-btn[data-state="disabled"] {
      cursor: default;
      border-color: var(--divider-color);
      background: transparent;
      color: color-mix(in srgb, var(--primary-text-color) 45%, transparent);
    }
    .blob-action-btn ha-icon {
      --mdc-icon-size: 16px;
      display: inline-flex;
    }
    .blob-action-spinner {
      width: 14px;
      height: 14px;
      border-radius: 50%;
      border: 2px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
      border-top-color: var(--primary-color);
      animation: blobActionSpin 720ms linear infinite;
    }
    @keyframes blobActionSpin {
      to { transform: rotate(360deg); }
    }
    .blob-input-host {
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      width: 100%;
      min-width: 0;
    }
    .blob-input-host ha-textfield,
    .blob-input-host ha-input,
    .blob-input-host ha-textarea,
    .blob-input-host ha-selector {
      display: block;
      width: 100%;
    }
    /* ha-input ships with a built-in --ha-input-padding-bottom (default
       var(--ha-space-2), ~8px) that pushes the field above its baseline.
       ha-select has no equivalent, so the two controls otherwise sit at
       different bottoms in the same row. Zero it out here so the row
       bottom-aligns. */
    .blob-input-host ha-input {
      --ha-input-padding-bottom: 0px;
      --ha-input-padding-top: 0px;
    }
    .blob-input-host ha-textarea {
      --ha-textarea-resize: vertical;
    }
    .control-grid .blob-input-host {
      /* Pin the actual input controls to the row's baseline so a select and a
         textfield with different label heights still bottom-align. */
      align-self: end;
    }
    .results-list {
      display: grid;
      gap: 12px;
    }
    .result-card {
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 14px);
      padding: 14px;
      display: grid;
      gap: 10px;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 78%, transparent);
    }
    .result-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .result-title {
      font-size: 14px;
      font-weight: 800;
      color: var(--primary-text-color);
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .result-badges {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      justify-content: flex-end;
    }
    .result-badge {
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      padding: 3px 8px;
      font-size: 11px;
      font-weight: 700;
      color: var(--secondary-text-color);
      background: var(--ha-card-background, var(--card-background-color));
    }
    .result-block {
      display: grid;
      gap: 6px;
    }
    .result-block-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .result-label {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .result-pre {
      margin: 0;
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 12px);
      background: color-mix(in srgb, #05070b 94%, var(--card-background-color, #fff));
      color: #e7edf6;
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      padding: 10px 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      user-select: text;
      -webkit-user-select: text;
    }
    .result-pre--scrollable {
      height: calc((12px * 1.55 * 4) + 20px);
      overflow: auto;
    }
    /* Console-styled blob input. Visual sibling of .result-pre so the user
       sees the same dark monospace surface whether they're entering or viewing
       a blob hex / descriptor string. */
    .test-textarea {
      display: block;
      box-sizing: border-box;
      width: 100%;
      max-width: 100%;
      min-height: 132px;
      resize: vertical;
      margin: 0;
      border: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color));
      border-radius: var(--ha-card-border-radius, 12px);
      background: color-mix(in srgb, #05070b 94%, var(--card-background-color, #fff));
      color: #e7edf6;
      caret-color: #e7edf6;
      font-family: "SF Mono", "Fira Code", Consolas, monospace;
      font-size: 12px;
      line-height: 1.55;
      padding: 10px 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .test-textarea::placeholder {
      color: color-mix(in srgb, #e7edf6 45%, transparent);
    }
    .test-textarea:focus {
      outline: none;
      border-color: color-mix(in srgb, var(--primary-color) 65%, transparent);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 35%, transparent),
                  inset 0 0 0 1px color-mix(in srgb, #05070b 100%, transparent);
    }
    .test-textarea:disabled {
      opacity: 0.55;
      cursor: default;
    }
    .text-input {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid var(--divider-color);
      border-radius: 14px;
      background: var(--ha-card-background, var(--card-background-color));
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      line-height: 1.4;
      padding: 12px 14px;
    }
    .text-input:focus {
      outline: none;
      border-color: var(--primary-color);
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--primary-color) 35%, transparent);
    }
    .text-input:disabled {
      opacity: 0.7;
      cursor: default;
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 80%, transparent);
    }
    @media (max-width: 760px) {
      .chevron { display: none; }
    }
    @container blob-panel (max-width: 420px) {
      .control-grid {
        grid-template-columns: 1fr;
      }
    }
  `];
      }
      disconnectedCallback() {
        super.disconnectedCallback();
        if (this._testFlashTimer) {
          clearTimeout(this._testFlashTimer);
          this._testFlashTimer = null;
        }
        if (this._saveFlashTimer) {
          clearTimeout(this._saveFlashTimer);
          this._saveFlashTimer = null;
        }
        if (this._copyFlashTimer) {
          clearTimeout(this._copyFlashTimer);
          this._copyFlashTimer = null;
        }
      }
      _useLegacyTextField() {
        return Boolean(customElements.get("ha-textfield")) && !customElements.get("ha-input");
      }
      /** Uppercase hub model — mirrors wifi-commands-tab's _hubVersion(). */
      _hubVersion() {
        return String(remoteAttrsForHub(this.hass, this.hub)?.hub_version || this.hub?.version || "").toUpperCase();
      }
      /**
       * Descriptor view applicability for the Test / Save subtitles.
       *
       * Two parser paths feed the Descriptor view:
       *   1. X2-only descriptive IR strings (P:Sony12 R:... etc.), which
       *      the hub parses out of the captured IR blob body.
       *   2. The virtual device classes (wifi_ip, wifi_roku, wifi_hue,
       *      wifi_sonos), whose blobs carry structural fields the
       *      integration decodes on every hub version.
       *
       * Path (2) only matters in the Fetch view — the Test / Save inputs
       * are IR-only, so the subtitles below still gate their descriptor
       * sentence on hub version. The Fetch results render the toggle
       * whenever the row carries a non-empty `parsed_blob`, so no
       * version gate is needed there.
       */
      _supportsDescriptors() {
        return this._hubVersion().includes("X2");
      }
      /** Unicode command names (and the extended punctuation set) are X1S/X2 only. */
      _supportsUnicodeCommandNames() {
        const v2 = this._hubVersion();
        return v2.includes("X2") || v2.includes("X1S");
      }
      /**
       * Sanitize a command name input. Pattern + length matches wifi-commands-tab's
       * _sanitizeCommandName so the user gets the same character allow-list as the
       * Wifi Commands tab uses for renaming command slots.
       */
      _sanitizeCommandName(value) {
        const pattern = this._supportsUnicodeCommandNames() ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu : /[^A-Za-z0-9 ]+/g;
        return String(value ?? "").replace(pattern, "").slice(0, 20);
      }
      _blobInputPlaceholder() {
        return this._supportsDescriptors() ? "Paste blob hex here, or enter a descriptor such as P:Sony12 R:40000 D:1 F:18 MUL:2" : "Paste blob hex here.";
      }
      /**
       * Subtitle templates per drawer. Two-line layout: descriptive copy on top,
       * an IR-only warning (with icon) below. The "descriptive protocol string"
       * sentence is X2-only since descriptor parsing is unsupported on X1/X1S.
       */
      _renderSubtitleBlock(args) {
        const descriptorSentence = args.descriptor && this._supportsDescriptors() ? " Blobs may be raw hex or a descriptive protocol string." : "";
        return T`
      <div class="blob-section-subtitle">
        <span>${args.lead}${descriptorSentence}</span>
        <span class="subtitle-warning">
          <ha-icon icon="mdi:alert-outline"></ha-icon>
          <span>${args.warning}</span>
        </span>
      </div>
    `;
      }
      _fetchSubtitle() {
        return this._renderSubtitleBlock({
          lead: "Retrieve and view a Blob from the hub. Ensure that the cache for your devices and their commands is up to date.",
          warning: "Only Blobs from IR devices can be Tested and Saved."
        });
      }
      _testSubtitle() {
        return this._renderSubtitleBlock({
          lead: "Play a Blob on the hub without saving it.",
          descriptor: true,
          warning: "Only Blobs from IR devices can be Tested."
        });
      }
      _saveSubtitle() {
        return this._renderSubtitleBlock({
          lead: "Add a new command to an existing IR device by saving a Blob to the hub.",
          descriptor: true,
          warning: "Only Blobs from IR devices can be Saved."
        });
      }
      _buttonState(args) {
        if (args.busy) return "busy";
        if (args.success) return "success";
        if (args.error) return "error";
        if (!args.canSubmit) return "disabled";
        return "idle";
      }
      _renderActionButton(args) {
        const { label, busyLabel, state, idleIcon, onClick } = args;
        const interactive = state === "idle" || state === "success" || state === "error";
        let leadingIcon = A;
        if (state === "busy") {
          leadingIcon = T`<span class="blob-action-spinner" aria-hidden="true"></span>`;
        } else if (state === "success") {
          leadingIcon = T`<ha-icon icon="mdi:check-circle-outline"></ha-icon>`;
        } else if (state === "error") {
          leadingIcon = T`<ha-icon icon="mdi:alert-circle-outline"></ha-icon>`;
        } else if ((state === "idle" || state === "disabled") && idleIcon) {
          leadingIcon = T`<ha-icon icon=${idleIcon}></ha-icon>`;
        }
        const text = state === "busy" ? busyLabel : label;
        return T`
      <button
        class="blob-action-btn"
        data-state=${state}
        aria-busy=${state === "busy" ? "true" : "false"}
        ?disabled=${!interactive}
        @click=${onClick}
      >
        ${leadingIcon}
        <span>${text}</span>
      </button>
    `;
      }
      _scheduleSuccessRevert(which) {
        if (which === "test") {
          this._testFlash = true;
          if (this._testFlashTimer) clearTimeout(this._testFlashTimer);
          this._testFlashTimer = setTimeout(() => {
            this._testFlash = false;
            this._testFlashTimer = null;
          }, 1800);
        } else {
          this._saveFlash = true;
          if (this._saveFlashTimer) clearTimeout(this._saveFlashTimer);
          this._saveFlashTimer = setTimeout(() => {
            this._saveFlash = false;
            this._saveSuccess = "";
            this._saveFlashTimer = null;
          }, 3e3);
        }
      }
      updated(changed) {
        if (changed.has("hub")) this._handleHubChanged();
        if (changed.has("cacheHub")) this._normalizeSelections();
      }
      render() {
        if (this.loading) return T`<div class="state">Loading…</div>`;
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
        const selectedSection = this.selectedSection ?? "fetch";
        return T`
      <div class="tab-panel">
        ${renderSecondaryTabShell({
          items: BLOBS_SECTION_ITEMS,
          selectedId: selectedSection,
          onSelect: (section) => this.setSelectedSection(section),
          connected: true,
          shellClassName: "blob-panel secondary-view-shell--edge",
          content: selectedSection === "fetch" ? this._renderFetchSectionContent() : selectedSection === "test" ? this._renderTestSectionContent() : this._renderSaveSectionContent()
        })}
      </div>
    `;
      }
      _renderFetchSectionContent() {
        const deviceOptions = this._deviceOptions();
        const commandOptions = this._commandOptions();
        const fetchBlocked = blobFetchBlockedReason({
          persistentCacheEnabled: this.persistentCacheEnabled,
          selectedDeviceId: this._selectedDeviceId,
          commandCount: commandOptions.length
        });
        const disabled = this._busy() || !this.persistentCacheEnabled;
        return T`
      ${renderSecondaryTabContent({
          connected: true,
          content: T`
        <div class="blob-section-content">
          ${this._fetchSubtitle()}
          ${fetchBlocked === "cache_disabled" ? this._renderStatus(
            "warning",
            "mdi:database-off-outline",
            "Enable persistent cache in the Hub tab before using Fetch."
          ) : A}
          <div class="control-grid">
            <ha-selector
              .hass=${this.hass}
              .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "Select one" }, ...deviceOptions.map((option) => ({ value: option.value, label: option.label }))] } }}
              .label=${"Device"}
              .value=${this._selectedDeviceId == null ? "__none__" : String(this._selectedDeviceId)}
              .disabled=${disabled}
              @value-changed=${(event) => this._handleDeviceChanged(event)}
            ></ha-selector>
            <ha-selector
              .hass=${this.hass}
              .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "Select one" }, ...commandOptions.map((option) => ({ value: option.value, label: option.label }))] } }}
              .label=${"Command"}
              .value=${this._selectedCommandId == null ? "__none__" : String(this._selectedCommandId)}
              .disabled=${disabled || this._selectedDeviceId == null || fetchBlocked === "no_commands"}
              @value-changed=${(event) => this._handleCommandChanged(event)}
            ></ha-selector>
          </div>
          ${fetchBlocked === "no_commands" ? this._renderStatus(
            "warning",
            "mdi:refresh-circle",
            "This device has no cached commands yet. Refresh that device from the Cache tab first."
          ) : A}
          ${this._fetchError ? this._renderStatus("error", "mdi:alert-circle-outline", this._fetchError) : A}
          ${this._fetchResponse ? this._renderFetchResults() : A}
        </div>
        `
        })}
    `;
      }
      _renderFetchResults() {
        const commands = this._fetchResponse?.commands ?? [];
        if (!commands.length) {
          return this._renderStatus(
            "warning",
            "mdi:file-search-outline",
            "The hub returned no blob records for this request."
          );
        }
        return T`
      <div class="results-list">
        ${commands.map((command) => {
          const cmdKey = `cmd-${command.device_id ?? "?"}-${command.command_id ?? "?"}`;
          const copied = this._copyFlashKey === cmdKey;
          const descriptor = String(command.parsed_blob ?? "").trim();
          const rawBlob = String(command.command_blob ?? "");
          const hasDescriptor = descriptor !== "";
          const mode = hasDescriptor ? this._resultViewMode[cmdKey] ?? "descriptor" : "hex";
          const shownText = mode === "descriptor" ? descriptor : rawBlob;
          const copyTarget = mode === "descriptor" ? descriptor : rawBlob;
          return T`
          <article class="result-card">
            <div class="result-head">
              <div class="result-title">${String(command.command_label || `Command ${command.command_id ?? "unknown"}`)}</div>
              <div class="result-badges">
                <span class="result-badge">${this._deviceClassLabel(command.device_class)}</span>
                <span class="result-badge">Cmd ${String(command.command_id ?? "?")}</span>
              </div>
            </div>
            <div class="result-block">
              <div class="result-block-head">
                ${hasDescriptor ? T`
                      <div
                        class="view-toggle"
                        role="tablist"
                        aria-label="Blob view mode"
                      >
                        <button
                          class="view-toggle-btn${mode === "descriptor" ? " active" : ""}"
                          role="tab"
                          aria-selected=${mode === "descriptor" ? "true" : "false"}
                          @click=${() => this._setResultViewMode(cmdKey, "descriptor")}
                        >Descriptor</button>
                        <button
                          class="view-toggle-btn${mode === "hex" ? " active" : ""}"
                          role="tab"
                          aria-selected=${mode === "hex" ? "true" : "false"}
                          @click=${() => this._setResultViewMode(cmdKey, "hex")}
                        >Hex</button>
                      </div>
                    ` : T`<div class="result-label">Raw Blob</div>`}
                <button
                  class="copy-btn"
                  data-state=${copied ? "success" : "idle"}
                  aria-live="polite"
                  @click=${() => void this._copyText(copyTarget, cmdKey)}
                >
                  <ha-icon icon=${copied ? "mdi:check" : "mdi:content-copy"}></ha-icon>
                  <span>${copied ? "Copied" : "Copy"}</span>
                </button>
              </div>
              <pre class="result-pre result-pre--scrollable">${shownText}</pre>
            </div>
          </article>
        `;
        })}
      </div>
    `;
      }
      _renderTestSectionContent() {
        const proxyConnected = proxyClientConnected(this.hass, this.hub);
        const busy = this._busy();
        const canSubmit = !busy && !proxyConnected && String(this._testBlobInput || "").trim() !== "";
        return T`
      ${renderSecondaryTabContent({
          connected: true,
          content: T`
        <div class="blob-section-content">
          ${this._testSubtitle()}
          ${this._renderBlobTextarea({
            value: this._testBlobInput,
            disabled: busy || proxyConnected,
            placeholder: this._blobInputPlaceholder(),
            onInput: (value) => {
              this._testBlobInput = value;
              this._testError = "";
              this._testSuccess = "";
              this._testFlash = false;
            }
          })}
          <div class="action-row">
            ${this._renderActionButton({
            label: "Test",
            busyLabel: "Testing...",
            idleIcon: "mdi:flash-outline",
            state: this._buttonState({
              busy: this._testLoading,
              error: Boolean(this._testError),
              success: this._testFlash && Boolean(this._testSuccess),
              canSubmit
            }),
            onClick: () => void this._runTest()
          })}
          </div>
          ${this._testError ? this._renderStatus("error", "mdi:alert-circle-outline", this._testError) : A}
        </div>
        `
        })}
    `;
      }
      _renderSaveSectionContent() {
        const proxyConnected = proxyClientConnected(this.hass, this.hub);
        const busy = this._busy();
        const parsedDeviceId = Number.parseInt(String(this._saveDeviceIdInput || "").trim(), 10);
        const deviceIdValid = Number.isInteger(parsedDeviceId) && parsedDeviceId >= 1 && parsedDeviceId <= 255;
        const irDeviceOptions = this._deviceOptions().filter(
          (option) => String(option.deviceClass || "").trim().toLowerCase() === "ir"
        );
        const canSubmit = !busy && !proxyConnected && deviceIdValid && String(this._saveCommandName || "").trim() !== "" && String(this._saveBlobInput || "").trim() !== "";
        return T`
      ${renderSecondaryTabContent({
          connected: true,
          content: T`
        <div class="blob-section-content">
          ${this._saveSubtitle()}
          ${irDeviceOptions.length === 0 && !proxyConnected ? this._renderStatus(
            "warning",
            "mdi:refresh-circle",
            "No IR devices found in the cache. Refresh devices from the Cache tab first."
          ) : A}
          <div class="control-grid">
            <div class="blob-input-host">
              <ha-selector
                .hass=${this.hass}
                .selector=${{ select: { mode: "dropdown", options: [{ value: "__none__", label: "Select one" }, ...irDeviceOptions.map((option) => ({ value: option.value, label: option.label }))] } }}
                .label=${"IR device"}
                .value=${this._saveDeviceIdInput && this._saveDeviceIdInput !== "__none__" ? this._saveDeviceIdInput : "__none__"}
                .disabled=${busy || proxyConnected || irDeviceOptions.length === 0}
                @value-changed=${(event) => {
            const raw = String(event.detail?.value ?? "");
            this._saveDeviceIdInput = raw && raw !== "__none__" ? raw : "";
            this._saveError = "";
            this._saveSuccess = "";
            this._saveFlash = false;
          }}
              ></ha-selector>
            </div>
            ${this._renderCommandNameInput(busy, proxyConnected)}
          </div>
          ${this._renderBlobTextarea({
            value: this._saveBlobInput,
            disabled: busy || proxyConnected,
            placeholder: this._blobInputPlaceholder(),
            onInput: (value) => {
              this._saveBlobInput = value;
              this._saveError = "";
              this._saveSuccess = "";
              this._saveFlash = false;
            }
          })}
          <div class="action-row">
            ${this._renderActionButton({
            label: "Save",
            busyLabel: "Saving...",
            idleIcon: "mdi:content-save-outline",
            state: this._buttonState({
              busy: this._saveLoading,
              error: Boolean(this._saveError),
              success: this._saveFlash && Boolean(this._saveSuccess),
              canSubmit
            }),
            onClick: () => void this._runSave()
          })}
            ${this._saveSuccess ? T`
                  <div class="section-status success inline-status" role="status" aria-live="polite">
                    <span class="status-icon"><ha-icon icon="mdi:check-circle-outline"></ha-icon></span>
                    <span>${this._saveSuccess}</span>
                  </div>
                ` : A}
          </div>
          ${this._saveError ? this._renderStatus("error", "mdi:alert-circle-outline", this._saveError) : A}
        </div>
        `
        })}
    `;
      }
      _renderCommandNameInput(busy, proxyConnected) {
        const onInputLive = (event) => {
          const input = event.currentTarget;
          const value = this._sanitizeCommandName(input.value);
          if (input.value !== value) input.value = value;
        };
        const onCommit = (event) => {
          const input = event.currentTarget;
          const value = this._sanitizeCommandName(input.value);
          input.value = value;
          this._saveCommandName = value;
          this._saveError = "";
          this._saveSuccess = "";
          this._saveFlash = false;
        };
        const disabled = busy || proxyConnected;
        if (this._useLegacyTextField()) {
          return T`
        <div class="blob-input-host">
          <ha-textfield
            .label=${"Command name"}
            .maxLength=${20}
            .value=${this._saveCommandName}
            .disabled=${disabled}
            @input=${onInputLive}
            @change=${onCommit}
          ></ha-textfield>
        </div>
      `;
        }
        if (customElements.get("ha-input")) {
          return T`
        <div class="blob-input-host">
          <ha-input
            type="text"
            .label=${"Command name"}
            .maxlength=${20}
            .value=${this._saveCommandName}
            .disabled=${disabled}
            @input=${onInputLive}
            @change=${onCommit}
          ></ha-input>
        </div>
      `;
        }
        return T`
      <input
        class="text-input"
        type="text"
        maxlength="20"
        .value=${this._saveCommandName}
        .disabled=${disabled}
        placeholder="Command name"
        @input=${onInputLive}
        @change=${onCommit}
      />
    `;
      }
      _renderSingleLineInput(args) {
        const { kind, label, value, disabled, placeholder, min, max, onInput } = args;
        const handleInputEvent = (event) => {
          const target = event.currentTarget;
          onInput(String(target?.value ?? ""));
        };
        if (this._useLegacyTextField()) {
          return T`
        <div class="blob-input-host">
          <ha-textfield
            type=${kind}
            .label=${label}
            .value=${value}
            .disabled=${disabled}
            .placeholder=${placeholder}
            min=${min ?? A}
            max=${max ?? A}
            @input=${handleInputEvent}
            @change=${handleInputEvent}
          ></ha-textfield>
        </div>
      `;
        }
        if (customElements.get("ha-input")) {
          return T`
        <div class="blob-input-host">
          <ha-input
            type=${kind}
            .label=${label}
            .value=${value}
            .disabled=${disabled}
            .placeholder=${placeholder}
            min=${min ?? A}
            max=${max ?? A}
            @input=${handleInputEvent}
            @change=${handleInputEvent}
          ></ha-input>
        </div>
      `;
        }
        return T`
      <input
        class="text-input"
        type=${kind}
        .value=${value}
        .disabled=${disabled}
        placeholder=${placeholder}
        min=${min ?? A}
        max=${max ?? A}
        @input=${handleInputEvent}
      />
    `;
      }
      /**
       * Blob hex / descriptor textarea. Always rendered as a native textarea
       * styled to look like the result console (.result-pre) — dark monospace
       * surface, light text — since this is a code-editor field, not a form
       * label field. Using ha-textarea here would fight HA's light-surface
       * theming and break the console look.
       */
      _renderBlobTextarea(args) {
        const { value, disabled, placeholder, onInput } = args;
        const handleInputEvent = (event) => {
          const target = event.currentTarget;
          onInput(String(target?.value ?? ""));
        };
        return T`
      <textarea
        class="test-textarea"
        .value=${value}
        .disabled=${disabled}
        placeholder=${placeholder}
        spellcheck="false"
        autocapitalize="off"
        autocorrect="off"
        @input=${handleInputEvent}
      ></textarea>
    `;
      }
      _renderStatus(tone, icon, message) {
        return T`
      <div class="section-status ${tone}">
        <span class="status-icon"><ha-icon icon=${icon}></ha-icon></span>
        <span>${message}</span>
      </div>
    `;
      }
      _handleHubChanged() {
        const nextEntryId = String(this.hub?.entry_id || "").trim();
        if (nextEntryId === this._loadedEntryId) return;
        this._loadedEntryId = nextEntryId;
        this._selectedDeviceId = null;
        this._selectedCommandId = null;
        this._fetchLoading = false;
        this._fetchError = "";
        this._fetchResponse = null;
        this._testBlobInput = "";
        this._testLoading = false;
        this._testError = "";
        this._testSuccess = "";
        this._saveDeviceIdInput = "";
        this._saveCommandName = "";
        this._saveBlobInput = "";
        this._saveLoading = false;
        this._saveError = "";
        this._saveSuccess = "";
        this._testFlash = false;
        this._saveFlash = false;
        if (this._testFlashTimer) {
          clearTimeout(this._testFlashTimer);
          this._testFlashTimer = null;
        }
        if (this._saveFlashTimer) {
          clearTimeout(this._saveFlashTimer);
          this._saveFlashTimer = null;
        }
      }
      _normalizeSelections() {
        const deviceOptions = this._deviceOptions();
        if (this._selectedDeviceId != null && !deviceOptions.some((option) => Number(option.value) === this._selectedDeviceId)) {
          this._selectedDeviceId = null;
          this._selectedCommandId = null;
          this._fetchResponse = null;
          this._fetchError = "";
          return;
        }
        const commandOptions = this._commandOptions();
        if (this._selectedCommandId != null && !commandOptions.some((option) => Number(option.value) === this._selectedCommandId)) {
          this._selectedCommandId = null;
          this._fetchResponse = null;
          this._fetchError = "";
        }
      }
      _handleDeviceChanged(event) {
        const value = String(event.detail?.value ?? "");
        this._selectedDeviceId = value && value !== "__none__" ? Number(value) : null;
        this._selectedCommandId = null;
        this._fetchResponse = null;
        this._fetchError = "";
      }
      _handleCommandChanged(event) {
        const value = String(event.detail?.value ?? "");
        this._selectedCommandId = value && value !== "__none__" ? Number(value) : null;
        this._fetchResponse = null;
        this._fetchError = "";
        if (this._selectedDeviceId != null && this._selectedCommandId != null) void this._runFetch();
      }
      _deviceOptions() {
        return blobDeviceOptions(this.cacheHub);
      }
      _commandOptions() {
        return blobCommandOptions(this.cacheHub, this._selectedDeviceId);
      }
      _selectedDevice() {
        return this._deviceOptions().find((option) => Number(option.value) === this._selectedDeviceId) ?? null;
      }
      _deviceClassLabel(deviceClass) {
        const normalized = String(deviceClass || "").trim();
        return normalized || "Unknown class";
      }
      _setResultViewMode(cmdKey, mode) {
        if (this._resultViewMode[cmdKey] === mode) return;
        this._resultViewMode = { ...this._resultViewMode, [cmdKey]: mode };
      }
      async _copyText(value, flashKey) {
        const text = String(value || "");
        if (!text) return;
        let copied = false;
        if (navigator.clipboard?.writeText) {
          try {
            await navigator.clipboard.writeText(text);
            copied = true;
          } catch {
          }
        }
        if (!copied) {
          try {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.setAttribute("readonly", "");
            textarea.style.position = "absolute";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            copied = document.execCommand("copy");
            document.body.removeChild(textarea);
          } catch {
            copied = false;
          }
        }
        if (!copied) return;
        this._copyFlashKey = flashKey;
        if (this._copyFlashTimer) clearTimeout(this._copyFlashTimer);
        this._copyFlashTimer = setTimeout(() => {
          this._copyFlashKey = null;
          this._copyFlashTimer = null;
        }, 1500);
      }
      _busy() {
        return Boolean(this.hubCommandBusy || this._fetchLoading || this._testLoading || this._saveLoading);
      }
      _api() {
        if (!this.hass) throw new Error("Home Assistant context is unavailable");
        return new ControlPanelApi(this.hass);
      }
      _setSharedBusy(busy, label) {
        this.setHubCommandBusy?.(busy, label ?? null);
      }
      async _refreshControlPanelState() {
        await this.refreshControlPanelState?.();
      }
    };
    if (!customElements.get("sofabaton-blobs-tab")) {
      customElements.define("sofabaton-blobs-tab", SofabatonBlobsTab);
    }
  }
});

// custom_components/sofabaton_x1s/www/src/components/operation-progress.ts
function renderOperationProgress(view) {
  return T`
    <div class="progress-shell" data-mode=${view.mode} role="status" aria-live="polite">
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
        <div class="progress-title">${view.title}</div>
        <div class="progress-message">${view.message}</div>
      </div>
    </div>
  `;
}
var operationProgressStyles;
var init_operation_progress = __esm({
  "custom_components/sofabaton_x1s/www/src/components/operation-progress.ts"() {
    "use strict";
    init_lit();
    init_control_panel_selectors();
    operationProgressStyles = i`
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
  }
});

// custom_components/sofabaton_x1s/www/src/shared/ha-context.ts
var BACKUP_BUNDLE_SCHEMA_VERSION;
var init_ha_context = __esm({
  "custom_components/sofabaton_x1s/www/src/shared/ha-context.ts"() {
    "use strict";
    BACKUP_BUNDLE_SCHEMA_VERSION = 5;
  }
});

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
function assertBackupBundleRestoreCompatible(bundle, destinationHubVersion) {
  const sourceVersion = normalizeHubVersion(bundle?.hub?.version);
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
var HUB_VERSION_RANK;
var init_backup_state = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/backup-state.ts"() {
    "use strict";
    init_ha_context();
    init_control_panel_selectors();
    HUB_VERSION_RANK = {
      X1: 1,
      X1S: 2,
      X2: 3
    };
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/backup-tab.ts
var BACKUP_SECTION_ITEMS, SofabatonBackupTab;
var init_backup_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/backup-tab.ts"() {
    "use strict";
    init_lit();
    init_secondary_tab();
    init_control_panel_api();
    init_control_panel_selectors();
    init_operation_progress();
    init_backup_state();
    BACKUP_SECTION_ITEMS = [
      { id: "make", icon: "mdi:content-save-move-outline", label: "Make" },
      { id: "edit", icon: "mdi:pencil-box-outline", label: "Edit" },
      { id: "restore", icon: "mdi:database-import-outline", label: "Restore" }
    ];
    SofabatonBackupTab = class extends i3 {
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
        this.blockedTitle = null;
        this.blockedMessage = null;
        this.selectedSection = "make";
        this.setSelectedSection = () => {
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
        this._loadedBackupEntryId = "";
        this._backupHydrating = false;
        this._editBundle = null;
        this._editFilename = "";
        this._editError = null;
        this._editingKey = null;
        this._backupScopeRadioName = `sofabaton-backup-scope-${Math.random().toString(36).slice(2)}`;
        this._openEditFilePicker = () => {
          this.renderRoot.querySelector("#edit-file-input")?.click();
        };
        this._handleEditFilePicked = async (event) => {
          const input = event.currentTarget;
          const file = input?.files?.[0];
          if (!file) return;
          this._editError = null;
          try {
            const text = await file.text();
            const bundle = validateBackupBundle(JSON.parse(text));
            this._editBundle = bundle;
            this._editFilename = file.name;
            this._editingKey = null;
          } catch (error) {
            this._editBundle = null;
            this._editFilename = "";
            this._editingKey = null;
            this._editError = formatError(error);
          } finally {
            if (input) input.value = "";
          }
        };
        this._downloadEditedBundle = () => {
          if (!this._editBundle) return;
          const json = JSON.stringify(this._editBundle, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const base = this._editFilename.replace(/\.json$/i, "") || "sofabaton_backup";
          const anchor = document.createElement("a");
          anchor.href = url;
          anchor.download = `${base}_edited.json`;
          document.body.appendChild(anchor);
          anchor.dispatchEvent(new MouseEvent("click"));
          document.body.removeChild(anchor);
          setTimeout(() => URL.revokeObjectURL(url), 0);
        };
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
          blockedTitle: { type: String },
          blockedMessage: { type: String },
          selectedSection: { attribute: false },
          setSelectedSection: { attribute: false },
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
          _backupHydrating: { state: true },
          _editBundle: { state: true },
          _editFilename: { state: true },
          _editError: { state: true },
          _editingKey: { state: true }
        };
      }
      static {
        this.styles = [secondaryTabStyles, operationProgressStyles, i`
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

    .edit-body { padding-top: 0; padding-bottom: 8px; display: flex; flex-direction: column; gap: 8px; align-content: normal; }
    .edit-config-view { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 8px; }
    .edit-config-view .selection-card { flex: 1 1 auto; min-height: 0; }
    .edit-config-view .selection-list { max-height: none; height: 100%; min-height: 0; }
    .edit-action-row { display: flex; justify-content: flex-start; align-items: center; gap: 10px; flex-wrap: nowrap; min-width: 0; }
    .edit-action-row .primary-btn { flex: 0 0 auto; }
    .edit-hub-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 6px 14px 8px;
      border: 1px solid var(--divider-color);
      border-radius: var(--backup-radius-md);
      background: color-mix(in srgb, var(--secondary-background-color, var(--ha-card-background)) 72%, transparent);
    }
    .edit-hub-caption { font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color); }
    .edit-hub-inline { display: flex; align-items: center; gap: 4px; }
    .edit-row { display: flex; align-items: center; gap: 4px; padding: 4px 14px; border-top: 1px solid color-mix(in srgb, var(--divider-color) 72%, transparent); }
    .edit-row:first-child { border-top: none; }
    .edit-row-label {
      flex: 0 1 auto;
      min-width: 0;
      color: var(--primary-text-color);
      font-size: 13px;
      font-weight: 600;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .edit-row-meta {
      margin-left: auto;
      color: var(--secondary-text-color);
      font-size: 12px;
      font-weight: 600;
      white-space: nowrap;
    }
    .edit-row-input {
      flex: 0 1 220px;
      width: 220px;
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
    .icon-btn {
      flex: 0 0 auto;
      display: inline-grid;
      place-items: center;
      width: 26px;
      height: 26px;
      border-radius: var(--backup-radius-pill);
      border: 1px solid transparent;
      background: transparent;
      color: var(--secondary-text-color);
      cursor: pointer;
      transition: color 120ms ease, background 120ms ease, border-color 120ms ease;
    }
    .icon-btn:hover:not(:disabled) {
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
    }
    .icon-btn:disabled { opacity: 0.45; cursor: default; }
    .icon-btn ha-icon { --mdc-icon-size: 16px; }

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

    @media (max-width: 380px) {
      .backup-scope-options { grid-template-columns: 1fr; }
      .backup-scope-option + .backup-scope-option {
        border-left: none;
        border-top: 1px solid color-mix(in srgb, var(--divider-color) 80%, transparent);
      }
    }
  `];
      }
      disconnectedCallback() {
        super.disconnectedCallback();
        this._teardownProgressSubscription();
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
        return T`
      <div class="tab-panel">
        ${renderSecondaryTabShell({
          items: BACKUP_SECTION_ITEMS,
          selectedId: this.selectedSection,
          onSelect: (section) => this.setSelectedSection(section),
          connected: true,
          shellClassName: "backup-panel secondary-view-shell--edge",
          content: this.selectedSection === "make" ? this._renderBackupSectionContent() : this.selectedSection === "edit" ? this._renderEditSectionContent() : this._renderRestoreSectionContent()
        })}
      </div>
    `;
      }
      _renderBackupSectionContent() {
        const devices = backupDeviceOptions(this.cacheHub);
        const wholeHub = this._backupScope === "whole_hub";
        const selectedDeviceIds = wholeHub ? devices.map((device) => device.id) : this._backupDeviceIds;
        const isRunning = this._isProgressRunning(this._backupProgress);
        const isSuccess = String(this._backupProgress?.status || "") === "success";
        const allDevicesSelected = devices.length > 0 && this._backupDeviceIds.length === devices.length;
        const summary = this._backupResultSummary(this._backupProgress?.backup);
        return T`
      ${renderSecondaryTabContent({
          connected: true,
          contentClassName: "backup-body",
          content: T`
            <div class="backup-drawer-sub">
              ${isRunning ? "The hub is creating your backup." : isSuccess ? "Your backup is ready." : "Choose what to include in this backup."}
            </div>
            ${!this.persistentCacheEnabled || !this.cacheHub ? this._renderStatus("warning", "mdi:database-off-outline", "Enable persistent cache to choose backup contents from the card.") : A}
            ${this._backupError ? this._renderStatus("error", "mdi:alert-circle-outline", this._backupError) : A}
            ${isRunning && this._backupProgress ? this._renderProgressCard(this._backupProgress, "backup") : isSuccess ? (() => {
            const hasBundle = !!this._backupProgress?.backup;
            const wasDownloaded = !!this._backupProgress?.backup_downloaded;
            const expired = !!this._backupProgress?.backup_expired;
            return T`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Backup completed</div>
                    <div class="backup-complete-sub">${summary}</div>
                    ${expired ? T`<div class="backup-expired-note">
                          <ha-icon icon="mdi:clock-alert-outline"></ha-icon>
                          Backup expired. Start a new backup to download again.
                        </div>` : wasDownloaded ? T`<div class="backup-downloaded-note">
                            <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                            Downloaded
                          </div>` : A}
                    <div class="action-row">
                      <button class="primary-btn" ?disabled=${!hasBundle} @click=${this._downloadLatestBackup}>
                        ${wasDownloaded ? "Download again" : "Download backup"}
                      </button>
                      <button class="secondary-btn" @click=${() => void this._completeBackupResult()}>Complete</button>
                    </div>
                  </div>
                `;
          })() : T`
                  <div class="backup-config-view">
                  <div class="backup-scope-group">
                    ${this._renderScopeGroup({
            value: this._backupScope,
            disabled: this._backupLocked() || !this.cacheHub,
            options: [
              { value: "whole_hub", label: "Entire hub" },
              { value: "individual_devices", label: "Selected devices" }
            ],
            onChange: (next) => this._setBackupScope(next)
          })}
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
                                ${this._renderCheckboxControl({
            checked: selectedDeviceIds.includes(device.id),
            disabled: this._backupLocked() || !this.cacheHub,
            onChange: (checked) => this._setBackupDevice(device.id, checked)
          })}
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
        `
        })}
    `;
      }
      _renderEditSectionContent() {
        const bundle = this._editBundle;
        const activityOptions = bundleActivityOptions(bundle);
        const deviceOptions = bundleDeviceOptions(bundle);
        const hubName = String(bundle?.hub?.name || "").trim();
        return T`
      ${renderSecondaryTabContent({
          connected: true,
          contentClassName: "edit-body",
          content: T`
            <div class="backup-drawer-sub">
              ${bundle ? "Rename the hub, activities, and devices in this backup. Edits stay in your browser until you download the modified file." : "Load a backup file to rename its hub, activities, and devices before downloading it again."}
            </div>
            ${this._editError ? this._renderStatus("error", "mdi:alert-circle-outline", this._editError) : A}
            <input id="edit-file-input" type="file" accept=".json,application/json" @change=${this._handleEditFilePicked} />
            ${bundle ? T`
              <div class="edit-config-view">
                <div class="edit-hub-row">
                  <span class="edit-hub-caption">Hub name</span>
                  <div class="edit-hub-inline">
                    ${this._renderEditableLabel({
            editKey: "hub",
            value: hubName || "Unnamed hub",
            placeholder: "Hub name",
            onSave: (next) => this._applyHubRename(next)
          })}
                  </div>
                </div>
                <div class="selection-card">
                  <div class="selection-list">
                    ${activityOptions.length ? T`
                        <div class="selection-group-header">Activities</div>
                        ${activityOptions.map((activity) => this._renderEditRow({
            editKey: `activity:${activity.id}`,
            label: activity.label,
            meta: activity.meta,
            onSave: (next) => this._applyActivityRename(activity.id, next)
          }))}
                      ` : T`<div class="selection-empty">This backup file has no activities.</div>`}
                    ${deviceOptions.length ? T`
                        <div class="selection-group-header">Devices</div>
                        ${deviceOptions.map((device) => this._renderEditRow({
            editKey: `device:${device.id}`,
            label: device.label,
            meta: device.meta,
            onSave: (next) => this._applyDeviceRename(device.id, next)
          }))}
                      ` : T`<div class="selection-empty">This backup file has no devices.</div>`}
                  </div>
                </div>
                <div class="edit-action-row">
                  <button class="primary-btn" @click=${this._downloadEditedBundle}>Download edited backup</button>
                  <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : T`
              <div class="edit-action-row">
                <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || "Choose backup file"}</button>
              </div>
            `}
        `
        })}
    `;
      }
      _renderEditRow(params) {
        const isEditing = this._editingKey === params.editKey;
        return T`
      <div class="edit-row">
        ${this._renderEditableLabel({
          editKey: params.editKey,
          value: params.label,
          placeholder: "Name",
          onSave: params.onSave
        })}
        ${params.meta && !isEditing ? T`<span class="edit-row-meta">${params.meta}</span>` : A}
      </div>
    `;
      }
      _renderEditableLabel(params) {
        const isEditing = this._editingKey === params.editKey;
        if (!isEditing) {
          return T`
        <span class="edit-row-label" title=${params.value}>${params.value}</span>
        <button
          class="icon-btn"
          title="Rename"
          @click=${() => {
            this._editingKey = params.editKey;
          }}
        >
          <ha-icon icon="mdi:pencil-outline"></ha-icon>
        </button>
      `;
        }
        const sanitize = (raw) => this._sanitizeBundleName(raw);
        const commit = (input) => {
          const next = sanitize(String(input?.value ?? ""));
          if (next) params.onSave(next);
          this._editingKey = null;
        };
        return T`
      <input
        class="edit-row-input"
        type="text"
        .value=${params.value}
        placeholder=${params.placeholder}
        maxlength="20"
        autofocus
        @input=${(event) => {
          const input = event.currentTarget;
          const cleaned = sanitize(input.value);
          if (cleaned !== input.value) {
            const caret = Math.max(0, (input.selectionStart ?? cleaned.length) - (input.value.length - cleaned.length));
            input.value = cleaned;
            input.setSelectionRange(caret, caret);
          }
        }}
        @keydown=${(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit(event.currentTarget);
          } else if (event.key === "Escape") {
            event.preventDefault();
            this._editingKey = null;
          }
        }}
        @blur=${(event) => commit(event.currentTarget)}
      />
      <button
        class="icon-btn"
        title="Save"
        @mousedown=${(event) => event.preventDefault()}
        @click=${(event) => {
          const root = event.currentTarget.parentElement;
          const input = root?.querySelector(".edit-row-input") ?? null;
          commit(input);
        }}
      >
        <ha-icon icon="mdi:check"></ha-icon>
      </button>
    `;
      }
      _bundleSupportsUnicodeNames() {
        const version = String(this._editBundle?.hub?.version || "").toUpperCase();
        return version.includes("X2") || version.includes("X1S");
      }
      _sanitizeBundleName(value) {
        const pattern = this._bundleSupportsUnicodeNames() ? /[^\p{L}\p{N}\p{M} +&.'()_-]+/gu : /[^A-Za-z0-9 ]+/g;
        return String(value ?? "").replace(pattern, "").slice(0, 20);
      }
      _applyHubRename(name) {
        if (!this._editBundle) return;
        this._editBundle = renameBundleHub(this._editBundle, name);
      }
      _applyActivityRename(activityId, name) {
        if (!this._editBundle) return;
        this._editBundle = renameBundleActivity(this._editBundle, activityId, name);
      }
      _applyDeviceRename(deviceId, name) {
        if (!this._editBundle) return;
        this._editBundle = renameBundleDevice(this._editBundle, deviceId, name);
      }
      _renderRestoreSectionContent() {
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
      ${renderSecondaryTabContent({
          connected: true,
          contentClassName: "restore-body",
          content: T`
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
                            ${this._renderCheckboxControl({
            checked: this._restoreActivityIds.includes(activity.id),
            disabled: this._restoreLocked(),
            onChange: (checked) => this._setRestoreActivity(activity.id, checked)
          })}
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
                              ${this._renderCheckboxControl({
              checked: restoreSelection.selectedDeviceIds.includes(device.id),
              disabled: forced || this._restoreLocked(),
              onChange: (checked) => this._setRestoreDevice(device.id, checked)
            })}
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
                    ${this._renderCheckboxControl({
            checked: this._restoreMode === "replace",
            disabled: this._restoreLocked(),
            onChange: (checked) => {
              this._restoreMode = checked ? "replace" : "merge";
            }
          })}
                    <span class="selection-main">
                      <span class="selection-label">Erase existing Devices and Activities</span>
                    </span>
                  </div>
                </div>
                <div class="restore-action-row">
                  <button class="primary-btn" ?disabled=${this._restoreActionDisabled(restoreSelection.selectedDeviceIds)} @click=${this._runRestore}>Start restore</button>
                  <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
                </div>
              </div>
            ` : !isRunning && !isSuccess ? T`
              <div class="restore-action-row">
                <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
              </div>
            ` : A}
        `
        })}
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
      _renderScopeGroup(params) {
        const isOption = (raw) => typeof raw === "string" && params.options.some((option) => option.value === raw);
        return T`
      <div class="compat-radio-group" role="radiogroup" aria-disabled=${params.disabled ? "true" : "false"}>
        ${params.options.map((option) => T`
          <label
            class="compat-radio-option ${option.value === params.value ? "selected" : ""} ${params.disabled || !!option.disabled ? "disabled" : ""}"
          >
            <input
              class="compat-choice compat-choice--radio"
              type="radio"
              name=${this._backupScopeRadioName}
              .value=${option.value}
              .checked=${option.value === params.value}
              ?disabled=${params.disabled || !!option.disabled}
              @change=${(event) => {
          const target = event.currentTarget;
          if (target.checked && isOption(target.value) && target.value !== params.value) {
            params.onChange(target.value);
          }
        }}
            />
            <span class="compat-radio-option-label">${option.label}</span>
          </label>
        `)}
      </div>
    `;
      }
      _renderCheckboxControl(params) {
        const stopClick = params.stopClick !== false;
        if (customElements.get("ha-checkbox")) {
          return T`
        <ha-checkbox
          .checked=${params.checked}
          ?disabled=${params.disabled}
          @click=${stopClick ? ((event) => event.stopPropagation()) : (() => {
          })}
          @change=${(event) => {
            const target = event.currentTarget;
            params.onChange(!!target.checked);
          }}
        ></ha-checkbox>
      `;
        }
        return T`
      <input
        class="compat-choice compat-choice--checkbox"
        type="checkbox"
        .checked=${params.checked}
        ?disabled=${params.disabled}
        @click=${stopClick ? ((event) => event.stopPropagation()) : (() => {
        })}
        @change=${(event) => {
          const target = event.currentTarget;
          params.onChange(!!target.checked);
        }}
      />
    `;
      }
      _renderProgressCard(progress, mode) {
        return renderOperationProgress({
          mode,
          title: mode === "backup" ? "Creating backup" : "Restoring backup",
          message: String(progress.message || "Working\u2026")
        });
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
        const deviceIds = this._backupScope === "whole_hub" ? null : this._backupDeviceIds;
        this.setHubCommandBusy?.(true, "Starting backup\u2026");
        try {
          const start = await this.api().startBackupExport(this.hub.entry_id, deviceIds);
          await this.refreshControlPanelState?.();
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
          await this.refreshControlPanelState?.();
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
          assertBackupBundleRestoreCompatible(bundle, this.hub?.version);
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
        const operationId = this._backupProgress?.operation_id;
        if (!operationId || !this.hass) return;
        const filename = String(this._backupProgress?.filename || "sofabaton_backup.json");
        const path = `/api/sofabaton_x1s/backup/download/${encodeURIComponent(operationId)}`;
        let url = path;
        try {
          const signed = await this.hass.callWS({
            type: "auth/sign_path",
            path,
            // Generous expiry. The 60s default created a flaky window where
            // slow user interactions or share-sheet handoffs could let the
            // signature expire before the WebView delegate fetched it.
            expires: 600
          });
          if (signed?.path) url = signed.path;
        } catch (error) {
          console.error("[sofabaton] auth/sign_path failed", error);
          return;
        }
        const anchor = document.createElement("a");
        anchor.target = "_blank";
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.dispatchEvent(new MouseEvent("click"));
        document.body.removeChild(anchor);
      }
      _backupResultSummary(bundle) {
        const activityCount = Array.isArray(bundle?.activities) ? bundle.activities.length : 0;
        const deviceCount = Array.isArray(bundle?.devices) ? bundle.devices.length : 0;
        return `${activityCount} Activities and ${deviceCount} Devices backed up`;
      }
      async _completeBackupResult() {
        const operationId = String(this._backupProgress?.operation_id || "").trim();
        this._backupError = null;
        if (operationId) {
          try {
            await this.api().clearBackupResult(operationId);
          } catch (error) {
            this._backupError = formatError(error);
          }
        }
        try {
          await this.refreshControlPanelState?.();
        } catch {
        }
        this._resetBackupComposer();
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
    };
    if (!customElements.get("sofabaton-backup-tab")) {
      customElements.define("sofabaton-backup-tab", SofabatonBackupTab);
    }
  }
});

// node_modules/lit-html/node/directive.js
var e3, i4;
var init_directive = __esm({
  "node_modules/lit-html/node/directive.js"() {
    e3 = (t4) => (...e4) => ({ _$litDirective$: t4, values: e4 });
    i4 = class {
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
  }
});

// node_modules/lit-html/node/directive-helpers.js
var t3, m3, p3;
var init_directive_helpers = __esm({
  "node_modules/lit-html/node/directive-helpers.js"() {
    init_lit_html();
    ({ I: t3 } = Z);
    m3 = {};
    p3 = (o5, t4 = m3) => o5._$AH = t4;
  }
});

// node_modules/lit-html/node/directives/keyed.js
var i5;
var init_keyed = __esm({
  "node_modules/lit-html/node/directives/keyed.js"() {
    init_lit_html();
    init_directive();
    init_directive_helpers();
    i5 = e3(class extends i4 {
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
  }
});

// node_modules/lit/directives/keyed.js
var init_keyed2 = __esm({
  "node_modules/lit/directives/keyed.js"() {
    init_keyed();
  }
});

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
var init_wifi_commands_state = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-state.ts"() {
    "use strict";
  }
});

// custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab.ts
var SLOT_COUNT, INPUT_ICON, WIFI_COMMANDS_DOCS_URL, ID, HARD_BUTTON_ICONS, DEFAULT_KEY_LABELS, HARD_BUTTON_ID_MAP, X2_ONLY_HARD_BUTTON_IDS, DEFAULT_ACTION, WIFI_SECTION_ROW, SofabatonWifiCommandsTab;
var init_wifi_commands_tab = __esm({
  "custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab.ts"() {
    "use strict";
    init_lit();
    init_keyed2();
    init_secondary_tab();
    init_operation_progress();
    init_control_panel_selectors();
    init_wifi_commands_state();
    SLOT_COUNT = 10;
    INPUT_ICON = "mdi:video-input-hdmi";
    WIFI_COMMANDS_DOCS_URL = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md";
    ID = {
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
    HARD_BUTTON_ICONS = {
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
    DEFAULT_KEY_LABELS = {
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
    };
    HARD_BUTTON_ID_MAP = {
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
    X2_ONLY_HARD_BUTTON_IDS = /* @__PURE__ */ new Set([ID.C, ID.B, ID.A, ID.EXIT, ID.DVR, ID.PLAY, ID.GUIDE]);
    DEFAULT_ACTION = { action: "perform-action" };
    WIFI_SECTION_ROW = [{ id: "wifi", label: "Wifi Devices", icon: "mdi:wifi", passive: true }];
    SofabatonWifiCommandsTab = class extends i3 {
      constructor() {
        super(...arguments);
        this.hubCommandBusy = false;
        this.hubCommandBusyLabel = null;
        this.blockedTitle = null;
        this.blockedMessage = null;
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
          this._setSharedHubCommandBusy(true, "Deleting Wifi Device...");
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
            this._deviceMutationError = String(error?.message || "Unable to delete Wifi Device");
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
        this._openHubVersionModal = () => {
          this._hubVersionModalOpen = false;
        };
        this._submitHubVersionModal = async () => {
          this._hubVersionModalOpen = false;
        };
      }
      static {
        this.properties = {
          hass: { attribute: false },
          hub: { attribute: false },
          setHubCommandBusy: { attribute: false },
          refreshControlPanelState: { attribute: false },
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
    .device-card { width: 100%; max-width: 100%; box-sizing: border-box; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); padding: 9px 10px 9px 12px; background: var(--secondary-background-color, var(--ha-card-background)); text-align: left; display: flex; align-items: center; gap: 10px; cursor: pointer; overflow: hidden; box-shadow: none; transition: border-color 120ms ease, background-color 120ms ease; }
    .device-card[aria-disabled="true"] { cursor: default; opacity: 0.72; }
    .device-card.pending-delete { border-color: color-mix(in srgb, var(--warning-color, #f59e0b) 45%, var(--divider-color)); }
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
    .sync-btn, .dialog-btn, .slot-action-btn, .activity-chip, .checkbox-row, .slot-btn, .icon-btn, .version-chip, .action-tab { cursor: pointer; }
    .sync-btn:hover, .dialog-btn:hover, .slot-action-btn:hover, .activity-chip:hover, .version-chip:hover, .action-tab:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
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
    .activity-chip-row, .version-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .activity-chip, .version-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; font: inherit; }
    .activity-chip.active, .version-chip.active, .action-tab.active { background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); color: var(--primary-color); }
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
      }
      updated(changed) {
        if (changed.has("hub") || changed.has("hass")) void this._ensureLoadedForCurrentHub();
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
          title: "Deploying Wifi commands",
          message: String(this._syncState.message || "Sync in progress")
        }) : T`
                    <div class="command-grid">
                      ${this._commandsList().map((command, idx) => this._renderSlot(command, idx))}
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
        return T`
      <div class="list-scroll">
        <div class="list-header">
          <div class="list-header-copy">
            <div class="section-subtitle">Choose a Wifi Device to edit its command slots, or add a new one.</div>
          </div>
          <div class="list-header-action">
            <button class="detail-sync-btn" ?disabled=${!canAdd || this._hubCommandLocked() || this._creatingDevice} @click=${this._openCreateDeviceModal}>
              Add Wifi Device
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
            <div class="dialog-title">Add Wifi Device</div>
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
              <button class="dialog-btn" ?disabled=${this._creatingDevice} @click=${this._closeCreateDeviceModal}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" ?disabled=${this._creatingDevice} @click=${this._createWifiDevice}>Create</button>
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
            <div class="dialog-title">Delete Wifi Device?</div>
            <button class="dialog-close" @click=${this._closeDeleteDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text">Delete "${device.device_name}" from the hub and remove its saved command-slot configuration?</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._deviceMutationError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeDeleteDeviceModal}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._deleteWifiDevice}>Delete</button>
            </div>
          </div>
        </div>
      </div>
    `;
      }
      _renderSlot(command, idx) {
        const isConfirming = this._confirmClearSlot === idx;
        const configured = this._isCommandConfigured(command, idx);
        if (isConfirming) {
          return T`
        <div class="slot-btn slot-confirming">
          <div class="slot-confirm-title">Clear command slot?</div>
          <div class="slot-confirm-sub">Resets configuration.</div>
          <div class="slot-confirm-actions">
            <button class="dialog-btn" @click=${() => {
            this._confirmClearSlot = null;
          }}>No</button>
            <button class="dialog-btn dialog-btn-primary" @click=${() => this._clearSlot(idx)}>Yes</button>
          </div>
        </div>
      `;
        }
        if (!configured) {
          return T`
        <button class="slot-btn slot-empty" @click=${() => this._openCommandEditor(idx)}>
          <div class="slot-main">
            <div style="font-size:28px;color:var(--secondary-text-color)">+</div>
            <div class="slot-name">Make Command</div>
          </div>
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
          ${details.commandSummary === "No Action configured" ? "No Action configured" : `> ${details.service}`}
        </button>
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
            <div class="dialog-title">Command Slot ${slotIndex + 1}</div>
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
                        .label=${"Command Display Name"}
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
                        .label=${"Command Display Name"}
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
                    <span>Advanced</span>
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
                          <span>Set as Power ON command</span>
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
                          <span>Set as Power OFF command</span>
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
                          <span>Set as Activity input</span>
                          <span class="checkbox-subtext">${hasActivities ? this._inputActivityReplacementLabel() : "No activities available for this hub."}</span>
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
                        .label=${"Activity to apply the input to"}
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
                    <span>Set as Favorite</span>
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
                  .label=${"Physical Button Assignment"}
                  .value=${this._selectorValueForButton(draft)}
                  @value-changed=${(event) => this._handleHardButtonChanged(event)}
                ></ha-selector>
                ${this._hardButtonReplacementLabel() ? T`<div class="button-conflict-hint">${this._hardButtonReplacementLabel()}</div>` : A}
                <button class="checkbox-row nested-control ${hasMappedButton && draft.long_press_enabled ? "active" : ""}" ?disabled=${!hasMappedButton} @click=${() => {
          this._toggleLongPressRow();
        }}>
                  <span class="checkbox-left">
                    <span class="checkbox-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>
                    <span>Enable long-press</span>
                  </span>
                  <ha-switch
                    .checked=${hasMappedButton && draft.long_press_enabled}
                    .disabled=${!hasMappedButton}
                    @click=${(event) => event.stopPropagation()}
                    @change=${(event) => this._handleLongPressSwitchChange(event)}
                  ></ha-switch>
                </button>
                <div class="activities-label ${activitySelectionEnabled ? "" : "disabled"}">Apply to these Activities</div>
                <div class="activity-chip-row">
                  ${activities.length ? activities.map((activity) => T`
                    <button
                      class="activity-chip ${selectedActivities.has(String(activity.id)) ? "active" : ""} ${activitySelectionEnabled ? "" : "disabled"}"
                      ?disabled=${!activitySelectionEnabled}
                      @click=${(event) => this._toggleActivity(activity.id, event)}
                    >
                      ${activity.name}
                    </button>
                  `) : T`<div class="empty-hint">No activities available for this hub.</div>`}
                </div>
              </div>
            </div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._commandSaveError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeCommandEditor}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>Save</button>
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
            <div class="dialog-title">Command Slot ${Number(this._activeCommandSlot) + 1} Action</div>
            <button class="dialog-close" @click=${this._closeCommandActionEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              Run an Action whenever the command is performed. Configuring an Action is optional; you can create your own automations that trigger from the Wifi Commands sensor.
            </div>
            <div class="config-block">
              ${draft.long_press_enabled ? T`
                <div class="action-tabs">
                  <button class="action-tab ${activeTab === "short" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("short")}>Short press</button>
                  <button class="action-tab ${activeTab === "long" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("long")}>Long press</button>
                </div>
              ` : A}
              <div class="action-helper">${activeTab === "long" ? "Select Long-Press Action" : "Select Triggered Action"}</div>
              <div class="action-selector-wrap" ?hidden=${activeTab !== "short"}>
                ${i5(this._shortSelectorVersion, T`
                  <ha-selector
                    data-hide-action-type="1"
                    .hass=${this.hass}
                    .selector=${{ ui_action: {} }}
                    .label=${"Action"}
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
                    .label=${"Action"}
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
              <button class="dialog-btn" @click=${this._closeCommandActionEditor}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._saveActiveCommandModal}>Save</button>
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
            <div class="dialog-title">Sync commands to hub?</div>
            <button class="dialog-close" @click=${() => {
          this._syncWarningOpen = false;
        }}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text sync-warning-text">
              This sync can run for several minutes. During this process, other interactions with the hub are blocked.<br /><br />
              At the end of deployment, the physical remote will be force-resynced. It is recommended to finish your full Wifi Commands setup first, then sync once.
            </div>
            <label class="warning-optout">
              <input type="checkbox" .checked=${this._syncWarningOptOut} @change=${(event) => {
          this._syncWarningOptOut = event.currentTarget.checked;
        }} />
              <span>Don't show this warning again for this remote.</span>
            </label>
          </div>
          <div class="dialog-footer">
            <div></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${() => {
          this._syncWarningOpen = false;
        }}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._confirmSyncWarning}>Start sync</button>
            </div>
          </div>
        </div>
      </div>
    `;
      }
      _renderHubVersionModal() {
        return A;
        return T`
      <div class="modal-backdrop" @click=${() => {
          this._hubVersionModalOpen = false;
        }}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Unknown hub version</div>
            <button class="dialog-close" @click=${() => {
          this._hubVersionModalOpen = false;
        }}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-text">
              We couldn't automatically detect your hub model. Select the correct version below - the change takes effect immediately, no restart needed.
            </div>
            <div class="version-chip-row">
              ${["X1", "X1S", "X2"].map((version) => T`
                <button class="version-chip ${this._hubVersionModalSelectedVersion === version ? "active" : ""}" @click=${() => {
          this._hubVersionModalSelectedVersion = version;
        }}>
                  ${version}
                </button>
              `)}
            </div>
          </div>
          <div class="dialog-footer">
            <div></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${() => {
          this._hubVersionModalOpen = false;
        }}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._submitHubVersionModal}>Confirm</button>
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
        if (this._selectedDeviceKey) {
          await this._loadCommandConfigFromBackend(true);
          await this._loadCommandSyncProgress(true);
        }
        this._configLoadedForEntryId = entryId;
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
      _hubVersionConfident() {
        return true;
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
          return deviceName ? `Syncing ${deviceName}...` : "Syncing Wifi Device...";
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
          commandSummary: explicitService && actionSuffix && entitySuffix ? `${actionSuffix} ${entitySuffix}` : explicitService && actionSuffix ? actionSuffix : "No Action configured"
        };
      }
      _commandHasCustomAction(action) {
        const details = this._commandActionDetails(action);
        return details.service !== "perform-action" || details.entities !== "No target entity";
      }
      _commandSlotSummaryDetails(command) {
        const shortDetails = this._commandActionDetails(command.action);
        if (shortDetails.commandSummary !== "No Action configured") return shortDetails;
        if (!command.long_press_enabled) return shortDetails;
        const longDetails = this._commandActionDetails(command.long_press_action);
        return longDetails.commandSummary !== "No Action configured" ? longDetails : shortDetails;
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
        if (remoteUnavailable) return "Remote entity unavailable. Is the app connected?";
        if (this._syncState.status === "running") return String(this._syncState.message || "Sync in progress");
        if (this._syncState.status === "failed") return String(this._syncState.message || "Last sync failed.");
        if (this._syncState.sync_needed) return "Command config changes need to be synced to the hub.";
        if (this._syncState.status === "success") return "Hub command configuration is up to date.";
        return "No sync needed.";
      }
      _syncMessageShort(remoteUnavailable) {
        if (remoteUnavailable) return "Unavailable";
        if (this._syncState.status === "running") return "Syncing";
        if (this._syncState.status === "failed") return "Sync failed";
        if (this._syncState.sync_needed) return "Sync needed";
        if (this._syncState.status === "success") return "Up to date";
        return "Idle";
      }
      _deviceStatusLabel(device) {
        if (device.device_key === this._deletingDeviceKey) return "Deleting...";
        if (device.status === "running") return "Syncing";
        if (device.status === "failed") return "Sync failed";
        if (device.sync_needed) return "Sync needed";
        if (device.status === "success") return "Synced";
        return "Synced";
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
        return T`${message} <a class="sync-doc-link" href=${WIFI_COMMANDS_DOCS_URL} target="_blank" rel="noreferrer">See documentation</a>`;
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
        const label = remoteUnavailable ? "Unavailable" : syncRunning ? "Syncing..." : externallyLocked ? "Busy" : this._syncState.sync_needed ? "Sync to Hub" : "Up to Date";
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
          this._deviceMutationError = "Device name is required.";
          return;
        }
        this._creatingDevice = true;
        this._setSharedHubCommandBusy(true, "Creating Wifi Device...");
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
          this._deviceMutationError = String(error?.message || "Unable to create Wifi Device");
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
          message: "Starting sync",
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
        this._setSharedHubCommandBusy(true, "Syncing Wifi Device...");
        try {
          await this.hass.callService("sofabaton_x1s", "sync_command_config", { entity_id: entityId, device_key: deviceKey });
          await this._refreshControlPanelState();
        } catch (error) {
          this._syncState = {
            ...this._syncState,
            status: "failed",
            message: String(error?.message || "Sync failed to start")
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
  }
});

// custom_components/sofabaton_x1s/www/src/tools-card.ts
var tools_card_exports = {};
function resolveLoadedToolsFrontendVersion() {
  const version = new URL(import.meta.url, window.location.href).searchParams.get("v");
  return String(version || "").trim() || "dev";
}
function logOnce() {
  const windowWithFlag = window;
  if (windowWithFlag[LOG_ONCE_KEY]) return;
  windowWithFlag[LOG_ONCE_KEY] = true;
  const base = "padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;line-height:18px;border:1px solid transparent;";
  const red = base + "background:#fff;color:#ef4444;border-color:#ef4444;";
  const green = base + "background:#062b12;color:#22c55e;border-color:#22c55e;";
  const yellow = base + "background:#111827;color:#facc15;border-color:#facc15;";
  const blue = base + "background:#fff;color:#3b82f6;border-color:#3b82f6;";
  const gap = "color:transparent;";
  console.log(
    `%cSofabaton%c %c Control %c %c  Panel  %c %c   ${TOOLS_VERSION}   `,
    red,
    gap,
    green,
    gap,
    yellow,
    gap,
    blue
  );
}
var TOOLS_TYPE, LOG_ONCE_KEY, EDITOR_TYPE, LOADED_TOOLS_FRONTEND_VERSION, TOOLS_VERSION, DOC_LINKS, SofabatonControlPanelCard, SofabatonControlPanelEditor;
var init_tools_card = __esm({
  "custom_components/sofabaton_x1s/www/src/tools-card.ts"() {
    "use strict";
    init_lit();
    init_card_styles();
    init_control_panel_store();
    init_control_panel_selectors();
    init_hub_picker();
    init_tab_bar();
    init_settings_tab();
    init_cache_tab();
    init_logs_tab();
    init_blobs_tab();
    init_backup_tab();
    init_wifi_commands_tab();
    TOOLS_TYPE = "sofabaton-control-panel";
    LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;
    EDITOR_TYPE = `${TOOLS_TYPE}-editor`;
    LOADED_TOOLS_FRONTEND_VERSION = resolveLoadedToolsFrontendVersion();
    TOOLS_VERSION = LOADED_TOOLS_FRONTEND_VERSION;
    DOC_LINKS = {
      wifi_commands: {
        href: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md",
        label: "Wifi Commands documentation"
      },
      backup: {
        href: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/backup.md",
        label: "Backup documentation"
      },
      blobs: {
        href: "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/blobs.md",
        label: "Blobs documentation"
      }
    };
    SofabatonControlPanelCard = class extends i3 {
      constructor() {
        super();
        this._config = {};
        this._hubPickerOpen = false;
        this._toolsMenuOpen = false;
        this._lastRenderedTab = null;
        this._pendingCacheScrollSnapshot = null;
        this._boundHandleDocumentPointerDown = (event) => {
          this.handleDocumentPointerDown(event);
        };
        this._store = new ControlPanelStore(
          (snapshot) => {
            this._snapshot = snapshot;
            this.requestUpdate();
          },
          { loadedFrontendVersion: LOADED_TOOLS_FRONTEND_VERSION }
        );
        this._snapshot = this._store.snapshot;
      }
      static {
        this.styles = [cardStyles];
      }
      setConfig(config) {
        this._config = config || {};
      }
      set hass(value) {
        this._store.setHass(value);
      }
      getCardSize() {
        return 8;
      }
      static getConfigElement() {
        return document.createElement(EDITOR_TYPE);
      }
      static getStubConfig() {
        return {
          card_height: 600
        };
      }
      connectedCallback() {
        super.connectedCallback();
        logOnce();
        document.addEventListener("pointerdown", this._boundHandleDocumentPointerDown, true);
        this._store.connected();
      }
      disconnectedCallback() {
        super.disconnectedCallback();
        this._store.disconnected();
        document.removeEventListener("pointerdown", this._boundHandleDocumentPointerDown, true);
        this._hubPickerOpen = false;
        this._toolsMenuOpen = false;
      }
      willUpdate() {
        if (this._lastRenderedTab === "cache") {
          this._pendingCacheScrollSnapshot = this.captureCacheScrollState();
        }
      }
      updated() {
        const pendingEntityKey = this._snapshot.pendingScrollEntityKey;
        if (this._snapshot.selectedTab === "cache") {
          this.restoreCacheScrollState(this._pendingCacheScrollSnapshot, pendingEntityKey);
          this._pendingCacheScrollSnapshot = null;
          if (pendingEntityKey) this._store.clearPendingScrollEntityKey();
        } else {
          this._pendingCacheScrollSnapshot = null;
          if (pendingEntityKey) this._store.clearPendingScrollEntityKey();
        }
        if (this._snapshot.selectedTab === "logs" && this._snapshot.logsStickToBottom) {
          const consoleElement2 = this.renderRoot.querySelector("#logs-console");
          if (consoleElement2) consoleElement2.scrollTop = consoleElement2.scrollHeight;
        }
        const consoleElement = this.renderRoot.querySelector("#logs-console");
        if (consoleElement) {
          consoleElement.onscroll = () => this._store.onLogsScrolled({
            top: consoleElement.scrollTop,
            clientHeight: consoleElement.clientHeight,
            scrollHeight: consoleElement.scrollHeight
          });
        }
        this._lastRenderedTab = this._snapshot.selectedTab;
      }
      handleDocumentPointerDown(event) {
        const path = event.composedPath();
        const hubPickerRoot = this.renderRoot.querySelector("#hub-picker-root");
        const toolsMenuRoot = this.renderRoot.querySelector("#tools-tab-menu-root");
        const clickedHubPicker = hubPickerRoot ? path.includes(hubPickerRoot) : false;
        const clickedToolsMenu = toolsMenuRoot ? path.includes(toolsMenuRoot) : false;
        let changed = false;
        if (this._hubPickerOpen && !clickedHubPicker) {
          this._hubPickerOpen = false;
          changed = true;
        }
        if (this._toolsMenuOpen && !clickedToolsMenu) {
          this._toolsMenuOpen = false;
          changed = true;
        }
        if (changed) this.requestUpdate();
      }
      toggleHubPicker() {
        this._hubPickerOpen = !this._hubPickerOpen;
        if (this._hubPickerOpen) this._toolsMenuOpen = false;
        this.requestUpdate();
      }
      toggleToolsMenu() {
        this._toolsMenuOpen = !this._toolsMenuOpen;
        if (this._toolsMenuOpen) this._hubPickerOpen = false;
        this.requestUpdate();
      }
      handleTabSelect(tabId) {
        this._toolsMenuOpen = false;
        this._store.selectTab(tabId);
      }
      handleSettingToggle(setting, enabled) {
        void this._store.setSetting(setting, enabled);
      }
      handleAction(action) {
        void this._store.runAction(action);
      }
      captureCacheScrollState() {
        const state = {
          section: this._snapshot.selectedCacheSection || null,
          sectionTop: 0,
          panelTop: 0
        };
        const body = this.cacheScrollBody();
        const panel = this.renderRoot.querySelector(".tab-panel");
        if (body) state.sectionTop = body.scrollTop || 0;
        if (panel) state.panelTop = panel.scrollTop || 0;
        return state;
      }
      cacheScrollBody() {
        return this.renderRoot.querySelector(".cache-panel-body");
      }
      restoreCacheScrollState(snapshot, pendingEntityKey) {
        if (!snapshot) {
          if (pendingEntityKey) {
            requestAnimationFrame(() => this.scrollEntityToTop(pendingEntityKey));
          }
          return;
        }
        requestAnimationFrame(() => {
          const panel = this.renderRoot.querySelector(".tab-panel");
          if (panel) panel.scrollTop = Number(snapshot.panelTop || 0);
          const body = this.cacheScrollBody();
          if (body) body.scrollTop = Number(snapshot.sectionTop || 0);
          if (pendingEntityKey) {
            requestAnimationFrame(() => this.scrollEntityToTop(pendingEntityKey));
          }
        });
      }
      scrollEntityToTop(key) {
        const entity = this.renderRoot.querySelector(`#entity-${key}`);
        if (!entity) return;
        const body = entity.closest(".cache-panel-body, .secondary-panel-body, .acc-body");
        if (!body) return;
        const entityTop = entity.getBoundingClientRect().top;
        const bodyTop = body.getBoundingClientRect().top;
        body.scrollTo({
          top: body.scrollTop + (entityTop - bodyTop),
          behavior: "smooth"
        });
      }
      renderConnectivityPill(hub) {
        if (!hub) return null;
        const connected = hubConnected(this._snapshot.hass, hub);
        const proxyOn = proxyClientConnected(this._snapshot.hass, hub);
        return T`
      <div class="dock-pill-pair" role="group" aria-label="Connectivity">
        <span class="dock-pill-half ${connected ? "dock-pill-half--hub-on" : "dock-pill-half--hub-off"}">HUB</span>
        <span class="dock-pill-half ${proxyOn ? "dock-pill-half--app-on" : "dock-pill-half--app-off"}">APP</span>
      </div>
    `;
      }
      renderBrandLabel() {
        const version = String(this._snapshot.toolsFrontendVersionExpected ?? this._snapshot.toolsFrontendVersionLoaded ?? "").trim() || "unknown";
        return T`<div class="card-brand">SOFABATON CONTROL PANEL - v${version}</div>`;
      }
      renderBottomDock(hub) {
        const runtimeState = resolveRuntimeState(this._snapshot);
        const docLink = runtimeState ? null : DOC_LINKS[this._snapshot.selectedTab] ?? null;
        const statusText = runtimeState ? runtimeState.detail || runtimeState.label : null;
        const progressPercent = runtimeState?.kind === "operation_running" ? runtimeState.progress.percent : null;
        const dockClass = runtimeState?.kind === "completion" ? `card-bottom-dock card-bottom-dock--${runtimeState.tone}` : "card-bottom-dock";
        return T`
      <div class=${dockClass}>
        ${runtimeState?.kind === "operation_running" ? T`
              <div
                class="card-bottom-dock-progress-line"
                data-indeterminate=${runtimeState.progress.indeterminate ? "true" : "false"}
                style=${runtimeState.progress.indeterminate || progressPercent == null ? "width: 35%" : `width:${progressPercent}%`}
              ></div>
            ` : null}
        <div class="card-bottom-dock-center">
          ${runtimeState ? T`<span class="card-bottom-dock-status">${statusText}</span>` : docLink ? T`<a class="card-bottom-dock-link" href=${docLink.href} target="_blank" rel="noreferrer noopener">${docLink.label}</a>` : A}
        </div>
        <div class="card-bottom-dock-right">
          ${this.renderConnectivityPill(hub)}
        </div>
      </div>
    `;
      }
      renderBackendUnavailable(height) {
        return T`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-body">
            <div class="backend-unavailable-state">
              <div class="backend-unavailable-icon"><ha-icon icon="mdi:cloud-off-outline"></ha-icon></div>
              <div class="backend-unavailable-title">Backend not available</div>
              <div class="backend-unavailable-copy">
                Waiting for the Sofabaton X1S integration to finish starting…
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
      }
      renderVersionMismatch(height) {
        return T`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-body">
            <div class="version-mismatch-state">
              <div class="version-mismatch-header">
                <div class="version-mismatch-icon"><ha-icon icon="mdi:alert-circle"></ha-icon></div>
                <div class="version-mismatch-title">Refresh required to update the Sofabaton Control Panel card</div>
              </div>
              <div class="version-mismatch-copy">
                This dashboard is still using an older cached version of the Sofabaton Control Panel card than the one now running in Home Assistant.
                Refresh or reopen the dashboard/browser before using the control panel again so the updated card can load.
              </div>
              <div class="version-mismatch-versions">
                <div class="version-mismatch-row">
                  <div class="version-mismatch-label">Backend expects</div>
                  <div class="version-mismatch-value">${this._snapshot.toolsFrontendVersionExpected || "unknown"}</div>
                </div>
                <div class="version-mismatch-row">
                  <div class="version-mismatch-label">Card loaded</div>
                  <div class="version-mismatch-value">${this._snapshot.toolsFrontendVersionLoaded}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
      }
      renderHubUnavailable() {
        return T`
      <div class="card-body">
        <div class="card-blocked-state">
          <div class="card-blocked-icon"><ha-icon icon="mdi:lan-disconnect"></ha-icon></div>
          <div class="card-blocked-title">Hub unavailable</div>
          <div class="card-blocked-copy">
            This hub is not connected, so the control panel is unavailable until the hub reconnects.
          </div>
        </div>
      </div>
    `;
      }
      render() {
        const hub = selectedHub(this._snapshot);
        const cacheHub = selectedHubCache(this._snapshot);
        const cacheEnabled = persistentCacheEnabled(this._snapshot);
        const hubs = this._snapshot.state?.hubs ?? [];
        const height = Number(this._config.card_height ?? 600);
        const cardGateState = resolveCardGateState(this._snapshot);
        if (cardGateState.kind === "version_mismatch") {
          return this.renderVersionMismatch(height);
        }
        if (cardGateState.kind === "backend_unavailable") {
          return this.renderBackendUnavailable(height);
        }
        const selectedHubConnected = cardGateState.kind !== "hub_unavailable";
        const activeBackupOperation = hub?.active_backup_operation;
        const runtimeState = resolveRuntimeState(this._snapshot);
        const runtimeOperationBusy = runtimeState?.kind === "operation_running";
        const sharedHubCommandBusy = Boolean(
          runtimeOperationBusy || this._snapshot.refreshBusy || this._snapshot.externalHubCommandBusy || this._snapshot.pendingActionKey
        );
        const sharedHubCommandLabel = (runtimeOperationBusy ? runtimeState.detail || runtimeState.label : null) || this._snapshot.externalHubCommandLabel || (this._snapshot.refreshBusy ? "Refreshing cache\u2026" : null) || (this._snapshot.pendingActionKey ? "Hub command in progress\u2026" : null);
        let activeTab = renderSettingsTab({
          loading: this._snapshot.loading,
          error: this._snapshot.loadError,
          hub,
          hass: this._snapshot.hass,
          persistentCacheEnabled: cacheEnabled,
          hubCommandBusy: sharedHubCommandBusy,
          pendingSettingKey: this._snapshot.pendingSettingKey,
          pendingActionKey: this._snapshot.pendingActionKey,
          onToggleSetting: (setting, enabled) => this.handleSettingToggle(setting, enabled),
          onRunAction: (action) => this.handleAction(action)
        });
        if (this._snapshot.selectedTab === "logs") {
          activeTab = renderLogsTab({
            lines: this._snapshot.logsLines,
            loading: this._snapshot.logsLoading,
            error: this._snapshot.logsError
          });
        } else if (this._snapshot.selectedTab === "wifi_commands") {
          const availability = resolveTabAvailability(this._snapshot, "wifi_commands");
          activeTab = T`
        <sofabaton-wifi-commands-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .blockedTitle=${availability.kind === "blocked" ? availability.title : null}
          .blockedMessage=${availability.kind === "blocked" ? availability.message : null}
          .hub=${hub}
          .hass=${this._snapshot.hass}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .setHubCommandBusy=${(busy, label) => this._store.setExternalHubCommandBusy(busy, label ?? null)}
          .refreshControlPanelState=${() => this._store.loadControlPanelState()}
        ></sofabaton-wifi-commands-tab>
      `;
        } else if (this._snapshot.selectedTab === "blobs") {
          const availability = resolveTabAvailability(this._snapshot, "blobs");
          activeTab = T`
        <sofabaton-blobs-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .blockedTitle=${availability.kind === "blocked" ? availability.title : null}
          .blockedMessage=${availability.kind === "blocked" ? availability.message : null}
          .hub=${hub}
          .cacheHub=${cacheHub}
          .hass=${this._snapshot.hass}
          .persistentCacheEnabled=${cacheEnabled}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .selectedSection=${this._snapshot.selectedBlobsSection}
          .setSelectedSection=${(section) => this._store.setSelectedBlobsSection(section)}
          .setHubCommandBusy=${(busy, label) => this._store.setExternalHubCommandBusy(busy, label ?? null)}
          .refreshControlPanelState=${() => this._store.loadControlPanelState()}
        ></sofabaton-blobs-tab>
      `;
        } else if (this._snapshot.selectedTab === "backup") {
          const availability = resolveTabAvailability(this._snapshot, "backup");
          activeTab = T`
        <sofabaton-backup-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .blockedTitle=${availability.kind === "blocked" ? availability.title : null}
          .blockedMessage=${availability.kind === "blocked" ? availability.message : null}
          .hub=${hub}
          .cacheHub=${cacheHub}
          .hass=${this._snapshot.hass}
          .persistentCacheEnabled=${cacheEnabled}
          .selectedHubProxyConnected=${proxyClientConnected(this._snapshot.hass, hub)}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .selectedSection=${this._snapshot.selectedBackupSection}
          .setSelectedSection=${(section) => this._store.setSelectedBackupSection(section)}
          .setHubCommandBusy=${(busy, label) => this._store.setExternalHubCommandBusy(busy, label ?? null)}
          .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
        ></sofabaton-backup-tab>
      `;
        } else if (this._snapshot.selectedTab === "cache") {
          activeTab = renderCacheTab({
            loading: this._snapshot.loading,
            error: this._snapshot.loadError,
            hub: cacheHub,
            persistentCacheEnabled: cacheEnabled,
            staleData: this._snapshot.staleData,
            refreshBusy: this._snapshot.refreshBusy,
            hubCommandBusy: sharedHubCommandBusy,
            activeRefreshLabel: this._snapshot.activeRefreshLabel,
            selectedSection: this._snapshot.selectedCacheSection,
            openEntity: this._snapshot.openEntity,
            selectedHubProxyConnected: proxyClientConnected(this._snapshot.hass, hub),
            enablingPersistentCache: this._snapshot.pendingSettingKey === "persistent_cache",
            onEnablePersistentCache: () => this.handleSettingToggle("persistent_cache", true),
            onRefreshStale: () => void this._store.refreshStale(),
            onSelectSection: (sectionId) => this._store.selectCacheSection(sectionId),
            onToggleEntity: (key) => this._store.toggleEntity(key),
            onRefreshSection: (sectionId) => void this._store.refreshSection(sectionId),
            onRefreshEntry: (kind, targetId, key) => void this._store.refreshForHub(kind, targetId, key)
          });
        }
        return T`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-topbar">
            ${this.renderBrandLabel()}
            ${hubs.length > 1 ? renderHubPicker({
          interactive: true,
          open: this._hubPickerOpen,
          selectedLabel: hub?.name || hub?.entry_id || "",
          prefixLabel: "HUB",
          hubs,
          selectedEntryId: this._snapshot.selectedHubEntryId,
          onToggle: () => this.toggleHubPicker(),
          onSelect: (entryId) => {
            this._hubPickerOpen = false;
            this._store.selectHub(entryId);
          }
        }) : null}
          </div>
          ${renderTabBar({
          selectedTab: this._snapshot.selectedTab,
          toolsMenuOpen: this._toolsMenuOpen,
          onSelect: (tabId) => this.handleTabSelect(tabId),
          onToggleToolsMenu: () => this.toggleToolsMenu()
        })}
          ${selectedHubConnected ? T`<div class="card-body">${activeTab}</div>` : this.renderHubUnavailable()}
          ${this.renderBottomDock(hub)}
        </div>
      </ha-card>
    `;
      }
    };
    SofabatonControlPanelEditor = class extends HTMLElement {
      constructor() {
        super(...arguments);
        this._config = {};
      }
      setConfig(config) {
        this._config = config || {};
        this.render();
      }
      connectedCallback() {
        this.render();
      }
      render() {
        const height = Number(this._config.card_height ?? 600);
        this.innerHTML = `
      <style>
        .editor-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; }
        .editor-row label { flex: 1; font-size: 14px; color: var(--primary-text-color); }
        .editor-row input[type=number] { width: 90px; padding: 6px 8px; border: 1px solid var(--divider-color); border-radius: 6px; background: var(--card-background-color); color: var(--primary-text-color); }
        .editor-hint { font-size: 12px; color: var(--secondary-text-color); padding-bottom: 4px; }
      </style>
      <div class="editor-row">
        <label for="tools-card-height">Card height</label>
        <input id="tools-card-height" type="number" min="240" step="10" value="${height}" />
      </div>
      <div class="editor-hint">Controls how much of the activity/device lists is visible. Default: 600 px.</div>
    `;
        this.querySelector("#tools-card-height")?.addEventListener("change", (event) => {
          const value = Number(event.currentTarget.value || 600);
          this.dispatchEvent(new CustomEvent("config-changed", {
            detail: { config: { ...this._config, card_height: value } },
            bubbles: true,
            composed: true
          }));
        });
      }
    };
    if (!customElements.get(TOOLS_TYPE)) customElements.define(TOOLS_TYPE, SofabatonControlPanelCard);
    if (!customElements.get(EDITOR_TYPE)) customElements.define(EDITOR_TYPE, SofabatonControlPanelEditor);
    window.customCards = window.customCards || [];
    if (!window.customCards.some((c4) => c4.type === TOOLS_TYPE)) {
      window.customCards.push({
        type: TOOLS_TYPE,
        name: "Sofabaton Control Panel",
        description: "A control panel for Sofabaton hub tools, cache, logs, settings, and Wi-Fi commands."
      });
    }
  }
});

// tests/frontend/tools-card.test.ts
import test from "node:test";
import assert from "node:assert/strict";
var originalWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
function restoreWindow() {
  if (originalWindowDescriptor) {
    Object.defineProperty(globalThis, "window", originalWindowDescriptor);
    return;
  }
  delete globalThis.window;
}
test("bottom dock clears completion text on tabs with no default dock content", async () => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: {
      location: { href: "http://localhost/lovelace/test" },
      customCards: []
    }
  });
  try {
    await Promise.resolve().then(() => (init_tools_card(), tools_card_exports));
    const ToolsCardElement = customElements.get("sofabaton-control-panel");
    const element = new ToolsCardElement();
    document.body.appendChild(element);
    element._snapshot = {
      hass: null,
      state: {
        persistent_cache_enabled: true,
        tools_frontend_version: "dev",
        hubs: [
          {
            entry_id: "hub-1",
            name: "Living Room",
            settings: {
              proxy_enabled: false,
              hex_logging_enabled: false,
              wifi_device_enabled: false
            }
          }
        ]
      },
      contents: null,
      toolsFrontendVersionLoaded: "dev",
      toolsFrontendVersionExpected: "dev",
      toolsFrontendVersionMismatch: false,
      loading: false,
      loadError: null,
      backendUnavailable: false,
      selectedHubEntryId: "hub-1",
      selectedTab: "settings",
      selectedCacheSection: "activities",
      selectedBackupSection: "make",
      selectedBlobsSection: "fetch",
      openEntity: null,
      staleData: false,
      refreshBusy: false,
      activeRefreshLabel: null,
      externalHubCommandBusy: false,
      externalHubCommandLabel: null,
      runtimeCompletionNotice: {
        tone: "success",
        label: "Backup completed successfully."
      },
      pendingSettingKey: null,
      pendingActionKey: null,
      logsLines: [],
      logsError: null,
      logsLoading: false,
      logsLoadedEntryId: null,
      logsSubscribedEntryId: null,
      logsStickToBottom: true,
      logsScrollBehavior: "auto",
      pendingScrollEntityKey: null
    };
    element.requestUpdate();
    await element.updateComplete;
    let center = element.shadowRoot?.querySelector(".card-bottom-dock-center");
    assert.match(String(center?.textContent || ""), /Backup completed successfully\./);
    element._snapshot = {
      ...element._snapshot,
      runtimeCompletionNotice: null
    };
    element.requestUpdate();
    await element.updateComplete;
    center = element.shadowRoot?.querySelector(".card-bottom-dock-center");
    assert.equal(center?.textContent?.trim() || "", "");
    assert.equal(center?.querySelector(".card-bottom-dock-status"), null);
    element.remove();
  } finally {
    restoreWindow();
  }
});
