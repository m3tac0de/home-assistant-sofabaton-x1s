// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t5, e6, o8) {
    if (this._$cssResult$ = true, o8 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t5, this.t = e6;
  }
  get styleSheet() {
    let t5 = this.o;
    const s7 = this.t;
    if (e && void 0 === t5) {
      const e6 = void 0 !== s7 && 1 === s7.length;
      e6 && (t5 = o.get(s7)), void 0 === t5 && ((this.o = t5 = new CSSStyleSheet()).replaceSync(this.cssText), e6 && o.set(s7, t5));
    }
    return t5;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t5) => new n("string" == typeof t5 ? t5 : t5 + "", void 0, s);
var i = (t5, ...e6) => {
  const o8 = 1 === t5.length ? t5[0] : e6.reduce((e7, s7, o9) => e7 + ((t6) => {
    if (true === t6._$cssResult$) return t6.cssText;
    if ("number" == typeof t6) return t6;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t6 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s7) + t5[o9 + 1], t5[0]);
  return new n(o8, t5, s);
};
var S = (s7, o8) => {
  if (e) s7.adoptedStyleSheets = o8.map((t5) => t5 instanceof CSSStyleSheet ? t5 : t5.styleSheet);
  else for (const e6 of o8) {
    const o9 = document.createElement("style"), n7 = t.litNonce;
    void 0 !== n7 && o9.setAttribute("nonce", n7), o9.textContent = e6.cssText, s7.appendChild(o9);
  }
};
var c = e ? (t5) => t5 : (t5) => t5 instanceof CSSStyleSheet ? ((t6) => {
  let e6 = "";
  for (const s7 of t6.cssRules) e6 += s7.cssText;
  return r(e6);
})(t5) : t5;

// node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t5, s7) => t5;
var u = { toAttribute(t5, s7) {
  switch (s7) {
    case Boolean:
      t5 = t5 ? l : null;
      break;
    case Object:
    case Array:
      t5 = null == t5 ? t5 : JSON.stringify(t5);
  }
  return t5;
}, fromAttribute(t5, s7) {
  let i7 = t5;
  switch (s7) {
    case Boolean:
      i7 = null !== t5;
      break;
    case Number:
      i7 = null === t5 ? null : Number(t5);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t5);
      } catch (t6) {
        i7 = null;
      }
  }
  return i7;
} };
var f = (t5, s7) => !i2(t5, s7);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ?? (Symbol.metadata = /* @__PURE__ */ Symbol("metadata")), a.litPropertyMetadata ?? (a.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
var y = class extends HTMLElement {
  static addInitializer(t5) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t5);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t5, s7 = b) {
    if (s7.state && (s7.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t5) && ((s7 = Object.create(s7)).wrapped = true), this.elementProperties.set(t5, s7), !s7.noAccessor) {
      const i7 = /* @__PURE__ */ Symbol(), h6 = this.getPropertyDescriptor(t5, i7, s7);
      void 0 !== h6 && e2(this.prototype, t5, h6);
    }
  }
  static getPropertyDescriptor(t5, s7, i7) {
    const { get: e6, set: r6 } = h(this.prototype, t5) ?? { get() {
      return this[s7];
    }, set(t6) {
      this[s7] = t6;
    } };
    return { get: e6, set(s8) {
      const h6 = e6?.call(this);
      r6?.call(this, s8), this.requestUpdate(t5, h6, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t5) {
    return this.elementProperties.get(t5) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t5 = n2(this);
    t5.finalize(), void 0 !== t5.l && (this.l = [...t5.l]), this.elementProperties = new Map(t5.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t6 = this.properties, s7 = [...r2(t6), ...o2(t6)];
      for (const i7 of s7) this.createProperty(i7, t6[i7]);
    }
    const t5 = this[Symbol.metadata];
    if (null !== t5) {
      const s7 = litPropertyMetadata.get(t5);
      if (void 0 !== s7) for (const [t6, i7] of s7) this.elementProperties.set(t6, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t6, s7] of this.elementProperties) {
      const i7 = this._$Eu(t6, s7);
      void 0 !== i7 && this._$Eh.set(i7, t6);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s7) {
    const i7 = [];
    if (Array.isArray(s7)) {
      const e6 = new Set(s7.flat(1 / 0).reverse());
      for (const s8 of e6) i7.unshift(c(s8));
    } else void 0 !== s7 && i7.push(c(s7));
    return i7;
  }
  static _$Eu(t5, s7) {
    const i7 = s7.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t5 ? t5.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t5) => this.enableUpdating = t5), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t5) => t5(this));
  }
  addController(t5) {
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t5), void 0 !== this.renderRoot && this.isConnected && t5.hostConnected?.();
  }
  removeController(t5) {
    this._$EO?.delete(t5);
  }
  _$E_() {
    const t5 = /* @__PURE__ */ new Map(), s7 = this.constructor.elementProperties;
    for (const i7 of s7.keys()) this.hasOwnProperty(i7) && (t5.set(i7, this[i7]), delete this[i7]);
    t5.size > 0 && (this._$Ep = t5);
  }
  createRenderRoot() {
    const t5 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t5, this.constructor.elementStyles), t5;
  }
  connectedCallback() {
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), this._$EO?.forEach((t5) => t5.hostConnected?.());
  }
  enableUpdating(t5) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t5) => t5.hostDisconnected?.());
  }
  attributeChangedCallback(t5, s7, i7) {
    this._$AK(t5, i7);
  }
  _$ET(t5, s7) {
    const i7 = this.constructor.elementProperties.get(t5), e6 = this.constructor._$Eu(t5, i7);
    if (void 0 !== e6 && true === i7.reflect) {
      const h6 = (void 0 !== i7.converter?.toAttribute ? i7.converter : u).toAttribute(s7, i7.type);
      this._$Em = t5, null == h6 ? this.removeAttribute(e6) : this.setAttribute(e6, h6), this._$Em = null;
    }
  }
  _$AK(t5, s7) {
    const i7 = this.constructor, e6 = i7._$Eh.get(t5);
    if (void 0 !== e6 && this._$Em !== e6) {
      const t6 = i7.getPropertyOptions(e6), h6 = "function" == typeof t6.converter ? { fromAttribute: t6.converter } : void 0 !== t6.converter?.fromAttribute ? t6.converter : u;
      this._$Em = e6;
      const r6 = h6.fromAttribute(s7, t6.type);
      this[e6] = r6 ?? this._$Ej?.get(e6) ?? r6, this._$Em = null;
    }
  }
  requestUpdate(t5, s7, i7, e6 = false, h6) {
    if (void 0 !== t5) {
      const r6 = this.constructor;
      if (false === e6 && (h6 = this[t5]), i7 ?? (i7 = r6.getPropertyOptions(t5)), !((i7.hasChanged ?? f)(h6, s7) || i7.useDefault && i7.reflect && h6 === this._$Ej?.get(t5) && !this.hasAttribute(r6._$Eu(t5, i7)))) return;
      this.C(t5, s7, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t5, s7, { useDefault: i7, reflect: e6, wrapped: h6 }, r6) {
    i7 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t5) && (this._$Ej.set(t5, r6 ?? s7 ?? this[t5]), true !== h6 || void 0 !== r6) || (this._$AL.has(t5) || (this.hasUpdated || i7 || (s7 = void 0), this._$AL.set(t5, s7)), true === e6 && this._$Em !== t5 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t5));
  }
  async _$EP() {
    this.isUpdatePending = true;
    try {
      await this._$ES;
    } catch (t6) {
      Promise.reject(t6);
    }
    const t5 = this.scheduleUpdate();
    return null != t5 && await t5, !this.isUpdatePending;
  }
  scheduleUpdate() {
    return this.performUpdate();
  }
  performUpdate() {
    if (!this.isUpdatePending) return;
    if (!this.hasUpdated) {
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t7, s8] of this._$Ep) this[t7] = s8;
        this._$Ep = void 0;
      }
      const t6 = this.constructor.elementProperties;
      if (t6.size > 0) for (const [s8, i7] of t6) {
        const { wrapped: t7 } = i7, e6 = this[s8];
        true !== t7 || this._$AL.has(s8) || void 0 === e6 || this.C(s8, void 0, i7, e6);
      }
    }
    let t5 = false;
    const s7 = this._$AL;
    try {
      t5 = this.shouldUpdate(s7), t5 ? (this.willUpdate(s7), this._$EO?.forEach((t6) => t6.hostUpdate?.()), this.update(s7)) : this._$EM();
    } catch (s8) {
      throw t5 = false, this._$EM(), s8;
    }
    t5 && this._$AE(s7);
  }
  willUpdate(t5) {
  }
  _$AE(t5) {
    this._$EO?.forEach((t6) => t6.hostUpdated?.()), this.hasUpdated || (this.hasUpdated = true, this.firstUpdated(t5)), this.updated(t5);
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
  shouldUpdate(t5) {
    return true;
  }
  update(t5) {
    this._$Eq && (this._$Eq = this._$Eq.forEach((t6) => this._$ET(t6, this[t6]))), this._$EM();
  }
  updated(t5) {
  }
  firstUpdated(t5) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ?? (a.reactiveElementVersions = [])).push("2.1.2");

// node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t5) => t5;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t5) => t5 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t5) => null === t5 || "object" != typeof t5 && "function" != typeof t5;
var u2 = Array.isArray;
var d2 = (t5) => u2(t5) || "function" == typeof t5?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t5) => (i7, ...s7) => ({ _$litType$: t5, strings: i7, values: s7 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t5, i7) {
  if (!u2(t5) || !t5.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i7) : i7;
}
var N = (t5, i7) => {
  const s7 = t5.length - 1, e6 = [];
  let n7, l4 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c7 = v;
  for (let i8 = 0; i8 < s7; i8++) {
    const s8 = t5[i8];
    let a4, u6, d3 = -1, f4 = 0;
    for (; f4 < s8.length && (c7.lastIndex = f4, u6 = c7.exec(s8), null !== u6); ) f4 = c7.lastIndex, c7 === v ? "!--" === u6[1] ? c7 = _ : void 0 !== u6[1] ? c7 = m : void 0 !== u6[2] ? (y2.test(u6[2]) && (n7 = RegExp("</" + u6[2], "g")), c7 = p2) : void 0 !== u6[3] && (c7 = p2) : c7 === p2 ? ">" === u6[0] ? (c7 = n7 ?? v, d3 = -1) : void 0 === u6[1] ? d3 = -2 : (d3 = c7.lastIndex - u6[2].length, a4 = u6[1], c7 = void 0 === u6[3] ? p2 : '"' === u6[3] ? $ : g) : c7 === $ || c7 === g ? c7 = p2 : c7 === _ || c7 === m ? c7 = v : (c7 = p2, n7 = void 0);
    const x2 = c7 === p2 && t5[i8 + 1].startsWith("/>") ? " " : "";
    l4 += c7 === v ? s8 + r3 : d3 >= 0 ? (e6.push(a4), s8.slice(0, d3) + h2 + s8.slice(d3) + o3 + x2) : s8 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t5, l4 + (t5[s7] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e6];
};
var S2 = class _S {
  constructor({ strings: t5, _$litType$: i7 }, e6) {
    let r6;
    this.parts = [];
    let l4 = 0, a4 = 0;
    const u6 = t5.length - 1, d3 = this.parts, [f4, v3] = N(t5, i7);
    if (this.el = _S.createElement(f4, e6), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t6 = this.el.content.firstChild;
      t6.replaceWith(...t6.childNodes);
    }
    for (; null !== (r6 = P.nextNode()) && d3.length < u6; ) {
      if (1 === r6.nodeType) {
        if (r6.hasAttributes()) for (const t6 of r6.getAttributeNames()) if (t6.endsWith(h2)) {
          const i8 = v3[a4++], s7 = r6.getAttribute(t6).split(o3), e7 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l4, name: e7[2], strings: s7, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r6.removeAttribute(t6);
        } else t6.startsWith(o3) && (d3.push({ type: 6, index: l4 }), r6.removeAttribute(t6));
        if (y2.test(r6.tagName)) {
          const t6 = r6.textContent.split(o3), i8 = t6.length - 1;
          if (i8 > 0) {
            r6.textContent = s2 ? s2.emptyScript : "";
            for (let s7 = 0; s7 < i8; s7++) r6.append(t6[s7], c3()), P.nextNode(), d3.push({ type: 2, index: ++l4 });
            r6.append(t6[i8], c3());
          }
        }
      } else if (8 === r6.nodeType) if (r6.data === n3) d3.push({ type: 2, index: l4 });
      else {
        let t6 = -1;
        for (; -1 !== (t6 = r6.data.indexOf(o3, t6 + 1)); ) d3.push({ type: 7, index: l4 }), t6 += o3.length - 1;
      }
      l4++;
    }
  }
  static createElement(t5, i7) {
    const s7 = l2.createElement("template");
    return s7.innerHTML = t5, s7;
  }
};
function M(t5, i7, s7 = t5, e6) {
  if (i7 === E) return i7;
  let h6 = void 0 !== e6 ? s7._$Co?.[e6] : s7._$Cl;
  const o8 = a2(i7) ? void 0 : i7._$litDirective$;
  return h6?.constructor !== o8 && (h6?._$AO?.(false), void 0 === o8 ? h6 = void 0 : (h6 = new o8(t5), h6._$AT(t5, s7, e6)), void 0 !== e6 ? (s7._$Co ?? (s7._$Co = []))[e6] = h6 : s7._$Cl = h6), void 0 !== h6 && (i7 = M(t5, h6._$AS(t5, i7.values), h6, e6)), i7;
}
var R = class {
  constructor(t5, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t5, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t5) {
    const { el: { content: i7 }, parts: s7 } = this._$AD, e6 = (t5?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e6;
    let h6 = P.nextNode(), o8 = 0, n7 = 0, r6 = s7[0];
    for (; void 0 !== r6; ) {
      if (o8 === r6.index) {
        let i8;
        2 === r6.type ? i8 = new k(h6, h6.nextSibling, this, t5) : 1 === r6.type ? i8 = new r6.ctor(h6, r6.name, r6.strings, this, t5) : 6 === r6.type && (i8 = new Z(h6, this, t5)), this._$AV.push(i8), r6 = s7[++n7];
      }
      o8 !== r6?.index && (h6 = P.nextNode(), o8++);
    }
    return P.currentNode = l2, e6;
  }
  p(t5) {
    let i7 = 0;
    for (const s7 of this._$AV) void 0 !== s7 && (void 0 !== s7.strings ? (s7._$AI(t5, s7, i7), i7 += s7.strings.length - 2) : s7._$AI(t5[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t5, i7, s7, e6) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t5, this._$AB = i7, this._$AM = s7, this.options = e6, this._$Cv = e6?.isConnected ?? true;
  }
  get parentNode() {
    let t5 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t5?.nodeType && (t5 = i7.parentNode), t5;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t5, i7 = this) {
    t5 = M(this, t5, i7), a2(t5) ? t5 === A || null == t5 || "" === t5 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t5 !== this._$AH && t5 !== E && this._(t5) : void 0 !== t5._$litType$ ? this.$(t5) : void 0 !== t5.nodeType ? this.T(t5) : d2(t5) ? this.k(t5) : this._(t5);
  }
  O(t5) {
    return this._$AA.parentNode.insertBefore(t5, this._$AB);
  }
  T(t5) {
    this._$AH !== t5 && (this._$AR(), this._$AH = this.O(t5));
  }
  _(t5) {
    this._$AH !== A && a2(this._$AH) ? this._$AA.nextSibling.data = t5 : this.T(l2.createTextNode(t5)), this._$AH = t5;
  }
  $(t5) {
    const { values: i7, _$litType$: s7 } = t5, e6 = "number" == typeof s7 ? this._$AC(t5) : (void 0 === s7.el && (s7.el = S2.createElement(V(s7.h, s7.h[0]), this.options)), s7);
    if (this._$AH?._$AD === e6) this._$AH.p(i7);
    else {
      const t6 = new R(e6, this), s8 = t6.u(this.options);
      t6.p(i7), this.T(s8), this._$AH = t6;
    }
  }
  _$AC(t5) {
    let i7 = C.get(t5.strings);
    return void 0 === i7 && C.set(t5.strings, i7 = new S2(t5)), i7;
  }
  k(t5) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s7, e6 = 0;
    for (const h6 of t5) e6 === i7.length ? i7.push(s7 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s7 = i7[e6], s7._$AI(h6), e6++;
    e6 < i7.length && (this._$AR(s7 && s7._$AB.nextSibling, e6), i7.length = e6);
  }
  _$AR(t5 = this._$AA.nextSibling, s7) {
    for (this._$AP?.(false, true, s7); t5 !== this._$AB; ) {
      const s8 = i3(t5).nextSibling;
      i3(t5).remove(), t5 = s8;
    }
  }
  setConnected(t5) {
    void 0 === this._$AM && (this._$Cv = t5, this._$AP?.(t5));
  }
};
var H = class {
  get tagName() {
    return this.element.tagName;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  constructor(t5, i7, s7, e6, h6) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t5, this.name = i7, this._$AM = e6, this.options = h6, s7.length > 2 || "" !== s7[0] || "" !== s7[1] ? (this._$AH = Array(s7.length - 1).fill(new String()), this.strings = s7) : this._$AH = A;
  }
  _$AI(t5, i7 = this, s7, e6) {
    const h6 = this.strings;
    let o8 = false;
    if (void 0 === h6) t5 = M(this, t5, i7, 0), o8 = !a2(t5) || t5 !== this._$AH && t5 !== E, o8 && (this._$AH = t5);
    else {
      const e7 = t5;
      let n7, r6;
      for (t5 = h6[0], n7 = 0; n7 < h6.length - 1; n7++) r6 = M(this, e7[s7 + n7], i7, n7), r6 === E && (r6 = this._$AH[n7]), o8 || (o8 = !a2(r6) || r6 !== this._$AH[n7]), r6 === A ? t5 = A : t5 !== A && (t5 += (r6 ?? "") + h6[n7 + 1]), this._$AH[n7] = r6;
    }
    o8 && !e6 && this.j(t5);
  }
  j(t5) {
    t5 === A ? this.element.removeAttribute(this.name) : this.element.setAttribute(this.name, t5 ?? "");
  }
};
var I = class extends H {
  constructor() {
    super(...arguments), this.type = 3;
  }
  j(t5) {
    this.element[this.name] = t5 === A ? void 0 : t5;
  }
};
var L = class extends H {
  constructor() {
    super(...arguments), this.type = 4;
  }
  j(t5) {
    this.element.toggleAttribute(this.name, !!t5 && t5 !== A);
  }
};
var z = class extends H {
  constructor(t5, i7, s7, e6, h6) {
    super(t5, i7, s7, e6, h6), this.type = 5;
  }
  _$AI(t5, i7 = this) {
    if ((t5 = M(this, t5, i7, 0) ?? A) === E) return;
    const s7 = this._$AH, e6 = t5 === A && s7 !== A || t5.capture !== s7.capture || t5.once !== s7.once || t5.passive !== s7.passive, h6 = t5 !== A && (s7 === A || e6);
    e6 && this.element.removeEventListener(this.name, this, s7), h6 && this.element.addEventListener(this.name, this, t5), this._$AH = t5;
  }
  handleEvent(t5) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t5) : this._$AH.handleEvent(t5);
  }
};
var Z = class {
  constructor(t5, i7, s7) {
    this.element = t5, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s7;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t5) {
    M(this, t5);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ?? (t2.litHtmlVersions = [])).push("3.3.2");
var D = (t5, i7, s7) => {
  const e6 = s7?.renderBefore ?? i7;
  let h6 = e6._$litPart$;
  if (void 0 === h6) {
    const t6 = s7?.renderBefore ?? null;
    e6._$litPart$ = h6 = new k(i7.insertBefore(c3(), t6), t6, void 0, s7 ?? {});
  }
  return h6._$AI(t5), h6;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a;
    const t5 = super.createRenderRoot();
    return (_a = this.renderOptions).renderBefore ?? (_a.renderBefore = t5.firstChild), t5;
  }
  update(t5) {
    const r6 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t5), this._$Do = D(r6, this.renderRoot, this.renderOptions);
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
i4._$litElement$ = true, i4["finalized"] = true, s3.litElementHydrateSupport?.({ LitElement: i4 });
var o4 = s3.litElementPolyfillSupport;
o4?.({ LitElement: i4 });
(s3.litElementVersions ?? (s3.litElementVersions = [])).push("4.2.2");

// custom_components/sofabaton_x1s/www/src/remote-card-layout.ts
var DEFAULT_GROUP_ORDER = [
  "activity",
  "macro_favorites",
  "macros_row",
  "favorites_row",
  "dpad",
  "nav",
  "mid",
  "media",
  "colors",
  "abc"
];
var DEFAULT_GROUP_ORDER_SET = new Set(DEFAULT_GROUP_ORDER);
var DEFAULT_ROW_VISIBLE_ROWS = 2;
var MIN_ROW_VISIBLE_ROWS = 1;
var MAX_ROW_VISIBLE_ROWS = 6;
var LAYOUT_KEYS = [
  "group_order",
  "show_activity",
  "show_dpad",
  "show_nav",
  "show_mid",
  "show_volume",
  "show_channel",
  "show_media",
  "show_dvr",
  "show_colors",
  "show_abc",
  "show_macros_button",
  "show_favorites_button",
  "mf_as_rows",
  "mf_row_visible_rows"
];
function layoutBaseConfig(config) {
  const base = {};
  if (!config || typeof config !== "object") return base;
  for (const key of LAYOUT_KEYS) {
    if (config[key] !== void 0) {
      base[key] = config[key];
    }
  }
  return base;
}
function layoutDefaultConfig(config) {
  const base = layoutBaseConfig(config);
  const defaultLayout = config?.layouts?.default;
  if (defaultLayout && typeof defaultLayout === "object") {
    return { ...base, ...defaultLayout };
  }
  return base;
}
function layoutConfigForActivity(config, activityId) {
  const base = layoutDefaultConfig(config);
  const layouts = config?.layouts;
  if (!layouts || typeof layouts !== "object" || activityId == null) {
    return base;
  }
  const key = String(activityId);
  const override = layouts[key] ?? (Number.isFinite(Number(activityId)) ? layouts[Number(activityId)] : null);
  if (override && typeof override === "object") {
    return { ...base, ...override };
  }
  return base;
}
function macrosButtonEnabled(layout) {
  if (typeof layout?.show_macros_button === "boolean") {
    return layout.show_macros_button;
  }
  return true;
}
function favoritesButtonEnabled(layout) {
  if (typeof layout?.show_favorites_button === "boolean") {
    return layout.show_favorites_button;
  }
  return true;
}
function mfAsRows(layout) {
  return layout?.mf_as_rows === true;
}
function clampVisibleRows(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_ROW_VISIBLE_ROWS;
  const rounded = Math.round(num);
  if (rounded < MIN_ROW_VISIBLE_ROWS) return MIN_ROW_VISIBLE_ROWS;
  if (rounded > MAX_ROW_VISIBLE_ROWS) return MAX_ROW_VISIBLE_ROWS;
  return rounded;
}
function mfRowVisibleRows(layout) {
  return clampVisibleRows(layout?.mf_row_visible_rows);
}
function volumeGroupEnabled(layout) {
  if (typeof layout?.show_volume === "boolean") return layout.show_volume;
  if (typeof layout?.show_mid === "boolean") return layout.show_mid;
  return true;
}
function channelGroupEnabled(layout) {
  if (typeof layout?.show_channel === "boolean") return layout.show_channel;
  if (typeof layout?.show_mid === "boolean") return layout.show_mid;
  return true;
}
function mediaGroupEnabled(layout) {
  if (typeof layout?.show_media === "boolean") return layout.show_media;
  return true;
}
function dvrGroupEnabled(layout) {
  if (typeof layout?.show_dvr === "boolean") return layout.show_dvr;
  return true;
}
function normalizedGroupOrder(configured) {
  const source = Array.isArray(configured) ? configured : DEFAULT_GROUP_ORDER;
  const order = [];
  const seen = /* @__PURE__ */ new Set();
  for (const entry of source) {
    const key = String(entry ?? "").trim();
    if (!DEFAULT_GROUP_ORDER_SET.has(key) || seen.has(key)) continue;
    order.push(key);
    seen.add(key);
  }
  for (const key of DEFAULT_GROUP_ORDER) {
    if (!seen.has(key)) order.push(key);
  }
  return order;
}
var GROUP_VISIBILITY_KEYS = {
  activity: "show_activity",
  dpad: "show_dpad",
  nav: "show_nav",
  mid: "show_mid",
  media: "show_media",
  colors: "show_colors",
  abc: "show_abc"
};
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
var POWERED_OFF_LABELS = /* @__PURE__ */ new Set(["powered off", "powered_off", "off"]);
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
var X2_ONLY_HARD_BUTTON_IDS = /* @__PURE__ */ new Set([
  ID.C,
  ID.B,
  ID.A,
  ID.EXIT,
  ID.DVR,
  ID.PLAY,
  ID.GUIDE
]);

// custom_components/sofabaton_x1s/www/src/remote-card-strings.ts
var REMOTE_CARD_STRINGS_EN = {
  card: {
    selectEntityError: "Select a Sofabaton remote entity",
    remoteUnavailable: "Remote is unavailable (possibly because the Sofabaton app is connected).",
    noActivitiesWarning: "No activities found in remote attributes.",
    noMacros: "No macros available",
    noFavorites: "No favorites available",
    macrosTab: "Macros >",
    favoritesTab: "Favorites >",
    activitySelectLabel: "Activity",
    poweredOff: "Powered Off",
    defaultLayout: "Default Layout",
    activityFallback: (id) => `Activity ${id}`
  },
  assist: {
    label: "Key capture",
    start: "Start",
    waiting: "Waiting for keypress",
    exitEditMode: "Exit Edit mode to begin",
    captured: (label) => `Captured: ${label}`,
    notCaptured: "Not captured.",
    working: "Working...",
    triggersReady: "Triggers ready for use",
    createTriggers: "Create MQTT Discovery triggers",
    startCapturing: "Start capturing commands",
    deviceDetectedTitle: "Home Assistant device detected.",
    close: "Close",
    alsoActivityTriggers: "Also create triggers for Activity changes.",
    seeDocs: "See documentation for this feature.",
    dontShowAgain: "Not show this again for this device (in this session).",
    detectedDevice: (name) => `Detected MQTT device: ${name}.`,
    lastCommand: (name) => `Last command: ${name}.`,
    existingTriggers: "Existing MQTT automation triggers were found.",
    noMqttCommands: "No MQTT commands discovered yet",
    deviceFallback: (id) => `Device ${id}`,
    unknownDevice: "Unknown device",
    commandFallback: (id) => `Command ${id}`,
    createdTriggers: (count, deviceLabel) => `Created ${count} MQTT discovery triggers for ${deviceLabel}`,
    createdActivityTriggers: (count) => `Created ${count} activity triggers for X2 \u2192 Activities`,
    plusActivityTriggers: (count) => ` plus ${count} activity triggers`,
    allTriggersExist: (deviceLabel) => `All MQTT discovery triggers already exist for ${deviceLabel}`,
    buttonFallback: "Button",
    activityFallbackLabel: "Activity",
    unknown: "Unknown",
    automationAssistName: "Automation Assist",
    notification: {
      title: "\u{1F6E0}\uFE0F Automation Assist",
      eventButton: (label) => `Button: ${label}`,
      eventActivity: (label) => `Activity Change: ${label}`,
      eventOther: (label) => `Event: ${label}`,
      header: (activityName, eventLabel) => `**Activity: ${activityName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace Button Code**",
      lovelaceCopy: "*Copy this to your Dashboard YAML:*",
      serviceHeading: "\u2699\uFE0F **Service Call (Automation)**",
      serviceCopy: "*Use this in your Scripts or Automations:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Select a Sofabaton Remote Entity",
      theme: "Apply a theme to the card",
      use_background_override: "Customize background color",
      background_override: "Select Background Color",
      show_activity: "Activity Selector",
      show_dpad: "Direction Pad",
      show_nav: "Back/Home/Menu Keys",
      show_mid: "Volume/Channel Rockers",
      show_media: "Media Playback Controls",
      show_colors: "Red/Green/Yellow/Blue",
      show_abc: "A/B/C Buttons",
      show_macros_button: "Macros Button",
      show_favorites_button: "Favorites Button",
      max_width: "Maximum Card Width (px)",
      group_order: "Group Order"
    },
    automationAssistTitle: "Automation Assist",
    keyCapture: "Key capture",
    keyCaptureDescription: "Send button presses to the hub: Capture button presses to generate ready-to-use YAML for dashboard buttons and automations.",
    keyCaptureLearnMore: "Learn more about Key capture",
    keyCaptureDocsAria: "Key capture documentation",
    stylingOptions: "Styling Options",
    layoutOptions: "Layout Options",
    layoutSelectLabel: "Layout",
    defaultLayoutOption: "Default layout",
    macrosFavoritesAsRows: "Macros/Favorites as rows",
    visibleRows: "Visible rows",
    moveGroupUp: (groupLabel2) => `Move ${groupLabel2} up`,
    moveGroupDown: (groupLabel2) => `Move ${groupLabel2} down`,
    macros: "Macros",
    favorites: "Favorites",
    volume: "Volume",
    channel: "Channel",
    mediaControls: "Media Controls",
    dvr: "DVR",
    resetCardDefault: "Reset to card default",
    resetDefaultLayout: "Reset to default layout",
    noteDefaultLayout: "Used for Activities without their own layout",
    noteCustomLayout: "Using custom layout",
    noteUsingDefault: "Using default layout"
  },
  groups: {
    activity: "Activity Selector",
    macro_favorites: "Macros/Favorites",
    macros_row: "Macros Row",
    favorites_row: "Favorites Row",
    dpad: "Direction Pad",
    nav: "Back/Home/Menu",
    mid: "Volume/Channel",
    media: "Media Controls",
    colors: "Color Buttons",
    abc: "A/B/C"
  },
  keys: {
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
};
var TRANSLATIONS = {};
function registerRemoteCardTranslation(language, translation) {
  const lang = String(language || "").toLowerCase();
  if (!lang) return;
  TRANSLATIONS[lang] = translation;
  if (currentLanguage === lang || currentLanguage.split(/[-_]/)[0] === lang) {
    const active = resolveTranslation(currentLanguage);
    currentStrings = active ? deepMerge(REMOTE_CARD_STRINGS_EN, active) : REMOTE_CARD_STRINGS_EN;
  }
}
function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepMerge(base, overlay) {
  if (!isPlainObject(overlay)) return base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (value === void 0) continue;
    if (isPlainObject(value) && isPlainObject(base?.[key])) {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}
function resolveTranslation(language) {
  const lang = String(language || "").toLowerCase();
  if (!lang) return null;
  if (TRANSLATIONS[lang]) return TRANSLATIONS[lang];
  const base = lang.split(/[-_]/)[0];
  if (base && TRANSLATIONS[base]) return TRANSLATIONS[base];
  return null;
}
var currentLanguage = "en";
var currentStrings = REMOTE_CARD_STRINGS_EN;
function setRemoteCardLanguage(language) {
  const lang = String(language || "en").toLowerCase();
  if (lang === currentLanguage) return;
  currentLanguage = lang;
  const translation = resolveTranslation(lang);
  currentStrings = translation ? deepMerge(REMOTE_CARD_STRINGS_EN, translation) : REMOTE_CARD_STRINGS_EN;
}
function str() {
  return currentStrings;
}
function isLocalizedPoweredOffLabel(label) {
  const s7 = String(label || "").trim().toLowerCase();
  if (!s7) return false;
  if (s7 === REMOTE_CARD_STRINGS_EN.card.poweredOff.toLowerCase()) return true;
  return s7 === currentStrings.card.poweredOff.toLowerCase();
}

// custom_components/sofabaton_x1s/www/src/remote-card-editor-layout.ts
function layoutHasCustomOverride(config, selection) {
  const layouts = config?.layouts;
  if (!layouts || typeof layouts !== "object") return false;
  const key = String(selection ?? "");
  const override = layouts[key] ?? (Number.isFinite(Number(selection)) ? layouts[Number(selection)] : null);
  return Boolean(override && typeof override === "object");
}
function layoutSelectionNote(config, selection) {
  if (selection === "default") {
    return str().editor.noteDefaultLayout;
  }
  return layoutHasCustomOverride(config, selection) ? str().editor.noteCustomLayout : str().editor.noteUsingDefault;
}
function editorActivitiesFromState(state) {
  const list = state?.attributes?.activities;
  if (!Array.isArray(list)) return [];
  return list.map((activity) => ({
    id: Number(activity?.id),
    name: String(activity?.name ?? "")
  })).filter((activity) => Number.isFinite(activity.id) && activity.name);
}
function layoutConfigForSelection(config, selection) {
  if (selection === "default") {
    return layoutDefaultConfig(config);
  }
  return layoutConfigForActivity(config, selection);
}
function applyLayoutConfigPatch(config, selection, patch) {
  const next = { ...config || {} };
  if (selection === "default") {
    const defaultLayout = next.layouts?.default;
    if (defaultLayout && typeof defaultLayout === "object") {
      next.layouts = {
        ...next.layouts || {},
        default: { ...defaultLayout, ...patch }
      };
      return { nextConfig: next, syncFormPatch: null };
    }
    Object.assign(next, patch);
    return { nextConfig: next, syncFormPatch: patch };
  }
  const layouts = { ...next.layouts || {} };
  const selectionKey = String(selection);
  const existing = layouts[selectionKey] && typeof layouts[selectionKey] === "object" ? layouts[selectionKey] : {};
  layouts[selectionKey] = { ...existing, ...patch };
  next.layouts = layouts;
  return { nextConfig: next, syncFormPatch: null };
}
function groupOrderListForEditor(config, selection) {
  const layout = layoutConfigForSelection(config, selection);
  return normalizedGroupOrder(layout?.group_order);
}
function groupLabel(key) {
  return str().groups[key] || key;
}
function isGroupEnabled(config, selection, key) {
  const prop = GROUP_VISIBILITY_KEYS[key];
  if (!prop) return true;
  const layout = layoutConfigForSelection(config, selection);
  return layout?.[prop] ?? true;
}
function macroEnabled(config, selection) {
  return macrosButtonEnabled(layoutConfigForSelection(config, selection));
}
function favoritesEnabled(config, selection) {
  return favoritesButtonEnabled(layoutConfigForSelection(config, selection));
}
function volumeEnabled(config, selection) {
  return volumeGroupEnabled(layoutConfigForSelection(config, selection));
}
function channelEnabled(config, selection) {
  return channelGroupEnabled(layoutConfigForSelection(config, selection));
}
function macroTogglePatch(config, selection, enabled) {
  return {
    show_macros_button: !!enabled,
    show_favorites_button: !!favoritesEnabled(config, selection)
  };
}
function favoritesTogglePatch(config, selection, enabled) {
  return {
    show_macros_button: !!macroEnabled(config, selection),
    show_favorites_button: !!enabled
  };
}
function mfAsRowsForEditor(config, selection) {
  return mfAsRows(layoutConfigForSelection(config, selection));
}
function mfRowVisibleRowsForEditor(config, selection) {
  return mfRowVisibleRows(layoutConfigForSelection(config, selection));
}
function mfAsRowsPatch(enabled) {
  return { mf_as_rows: !!enabled };
}
function mfRowVisibleRowsPatch(value) {
  return { mf_row_visible_rows: value };
}
function volumeTogglePatch(config, selection, enabled) {
  const channel = channelEnabled(config, selection);
  return {
    show_volume: !!enabled,
    show_mid: !!enabled || !!channel
  };
}
function channelTogglePatch(config, selection, enabled) {
  const volume = volumeEnabled(config, selection);
  return {
    show_channel: !!enabled,
    show_mid: !!enabled || !!volume
  };
}
function dvrTogglePatch(enabled) {
  return {
    show_dvr: !!enabled
  };
}
function groupEnabledPatch(key, enabled) {
  const prop = GROUP_VISIBILITY_KEYS[key];
  return prop ? { [prop]: !!enabled } : null;
}
function moveVisibleGroup(order, isVisible, fromVisible, toVisible) {
  const visibleOrder = order.filter(isVisible);
  if (!Number.isInteger(fromVisible) || !Number.isInteger(toVisible) || fromVisible < 0 || fromVisible >= visibleOrder.length || toVisible < 0 || toVisible >= visibleOrder.length || fromVisible === toVisible) {
    return null;
  }
  const nextVisible = visibleOrder.slice();
  const [moved] = nextVisible.splice(fromVisible, 1);
  nextVisible.splice(toVisible, 0, moved);
  let vi = 0;
  return order.map((key) => isVisible(key) ? nextVisible[vi++] : key);
}

// custom_components/sofabaton_x1s/www/src/remote-card-compat.ts
function hubVersionFor(hass, entityId) {
  const resolved = String(entityId || "").trim();
  if (!resolved) return "";
  return String(
    hass?.states?.[resolved]?.attributes?.hub_version || ""
  ).toUpperCase();
}
function isX2Hub(hubVersion, hubIntegration) {
  if (hubIntegration) return true;
  return hubVersion.includes("X2");
}
function supportsUnicodeCommandNames(hubVersion, hubIntegration) {
  return isX2Hub(hubVersion, hubIntegration) || hubVersion.includes("X1S");
}
function selectItemTagName() {
  return customElements.get("ha-dropdown-item") ? "ha-dropdown-item" : "mwc-list-item";
}
function selectOpenEvents() {
  return customElements.get("ha-dropdown-item") ? ["wa-open"] : ["opened"];
}
function selectCloseEvents() {
  return customElements.get("ha-dropdown-item") ? ["wa-close"] : ["closed"];
}
function selectValueCompat(value, options = []) {
  const resolvedValue = String(value ?? "");
  const useDropdownItems = Boolean(customElements.get("ha-dropdown-item"));
  if (!useDropdownItems) return resolvedValue;
  const selectedOption = options.find(
    (option) => String(option?.value ?? "") === resolvedValue
  );
  return selectedOption ? String(selectedOption.label ?? selectedOption.value ?? "") : resolvedValue;
}
async function ensureHaElements() {
  const dropdownItemTag = selectItemTagName();
  await Promise.all([
    customElements.whenDefined("hui-button-card"),
    customElements.whenDefined("ha-select"),
    customElements.whenDefined(dropdownItemTag).catch(() => {
    })
    // optional
  ]);
}

// custom_components/sofabaton_x1s/www/src/remote-card-styles.ts
var REMOTE_CARD_CSS = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --remote-zoom: 1;
        --sb-overlay-rgb: var(--rgb-primary-text-color, 0, 0, 0);

        display: block;
      }

      ha-card {
        width: 100%;
        max-width: var(--remote-max-width);
        transform: scale(var(--remote-zoom));
        transform-origin: top center;
        margin-left: auto;
        margin-right: auto;
        --sb-key-font-size: clamp(11px, 7cqw, 50px);
        --sb-tab-font-size: clamp(14px, 6cqw, 50px);
        --sb-tab-height: clamp(20px, 3cqw, 50px);
        --sb-color-key-min-height: clamp(12px, 3.2cqw, 20px);
        container-type: inline-size;
      }

      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
      .layout-container { display: grid; gap: 12px; }
      .layout-overlay {
        position: absolute;
        opacity: 1;
        transition: opacity 240ms ease;
        pointer-events: none;
        z-index: 2;
      }
      .layout-overlay--fade { opacity: 0; }
      @media (prefers-reduced-motion: reduce) {
        .layout-overlay { transition: none; }
      }
      ha-select { width: 100%; }

      /* HA 2026.04 introduced --ha-color-form-background (used by ha-combo-box-item
         inside ha-select). Community themes predate this variable so it falls back
         to the built-in light default (rgb(243,243,243)) even in dark themes.
         Override it here with theme-aware fallbacks so the field matches the theme. */
      .sb-activity-select {
        --ha-color-form-background: var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243)));
      }

      .activityRow { 
        display: grid; 
        grid-template-columns: 1fr; 
        position: relative;
        z-index: 3;
      }

      .automationAssist {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: var(--sb-group-radius);
        border: 1px solid rgba(var(--rgb-primary-color), 0.25);
        background: rgba(var(--rgb-primary-color), 0.08);
      }

      .automationAssist__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .automationAssist__label {
        font-size: 13px;
        font-weight: 600;
      }

      .automationAssist__status {
        font-size: 12px;
        opacity: 0.75;
        min-height: 14px; /* reserves 1 line so height doesn't jump */
      }

      /* small pill button */
      .automationAssist__startBtn {
        border: 1px solid rgba(var(--rgb-primary-color), 0.35);
        background: rgba(var(--rgb-primary-color), 0.10);
        color: var(--primary-text-color);
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__mqttBtn {
        border: 1px solid rgba(var(--rgb-primary-color), 0.35);
        background: rgba(var(--rgb-primary-color), 0.10);
        color: var(--primary-text-color);
        border-radius: 999px;
        margin:10px;
        padding: 10px 10px;
        font-size: 16px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__startBtn:hover {
        background: rgba(var(--rgb-primary-color), 0.16);
      }

      .automationAssist__startBtn:active {
        transform: scale(0.98);
      }

      .automationAssist__startBtn[disabled] {
        opacity: 0.5;
        cursor: default;
      }

      .automationAssist__mqttBtn[disabled] {
        opacity: 0.5;
        cursor: default;
      }


 	  .loadIndicator {
	    visibility: hidden;
	    height: 4px;
	    width: 100%;
	    border-radius: 2px;
	    pointer-events: none;
	  }

	  .loadIndicator.is-loading {
	    visibility: visible;
	    background: var(--primary-color, #03a9f4);
	    background-image: linear-gradient(
  		  90deg,
		  transparent,
		  rgba(255, 255, 255, 0.4),
		  transparent
	    );
	    background-size: 200% 100%;
	    background-repeat: no-repeat;
	    animation: sb-shimmer 1.5s infinite linear;
	  }

	  @keyframes sb-shimmer {
	    0% {
		  background-position: -200% 0;
	    }
	    100% {
		  background-position: 200% 0;
	    }
	  }

			.remote { 
        position: relative;
        z-index: 0; /* Base layer */
        display: grid; 
        gap: 12px; 
      }

      /* Group containers - border radius matches theme */
      .dpad, .mid, .media, .colors, .abc {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
      }

			.macroFavoritesGrid {
        display: grid !important;
        grid-template-columns: 1fr 1fr !important; 
        width: 100% !important;
      }
			.macroFavoritesGrid.single {
        grid-template-columns: 1fr !important;
      }
			.macroFavoritesGrid.single .macroFavoritesButton + .macroFavoritesButton {
        border-left: none;
      }
			.macroFavoritesGrid.single .macroFavoritesButton:first-child {
        border-right: none;
      }
			.macroFavoritesButton {
        cursor: pointer;
        padding: 4px 0;
        display: block !important;
        position: relative;
        overflow: hidden;
        transition: background 0.2s ease;
        --ha-card-box-shadow: none;
      }
      
      .macroFavoritesButton.active-tab hui-button-card {
         --primary-text-color: var(--primary-color);
      }

      .macroFavoritesButton + .macroFavoritesButton {
        border-left: 1px solid var(--divider-color);
      }
      .macroFavoritesButton hui-button-card {
        height: var(--sb-tab-height);
        display: block;
        --mdc-typography-button-font-size: var(--sb-tab-font-size);
        --paper-font-body1_-_font-size: var(--sb-tab-font-size);
        font-size: var(--sb-tab-font-size);
      }
			.macroFavoritesButton:first-child {
        border-right: 1px solid var(--divider-color);
      }
			.mf-container {
        position: relative; 
        z-index: 2;
      }

      /* Ensure taps go to the wrapper that has the click handler */
      .macroFavoritesButton > hui-button-card {
        pointer-events: none;
        position: relative;
        z-index: 1;
        -webkit-tap-highlight-color: transparent;
      }

			.macroFavorites {
        border: 1px solid var(--divider-color);
        border-radius: var(--sb-group-radius);
        overflow: hidden; 
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        position: relative;
        z-index: 4;
      }

			.mf-overlay {
        position: absolute;
        top: 100%; 
        left: 0;
        right: 0;
        z-index: 1; /* Lowered: Sits behind the buttons, above the remote body */
        
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        border: 1px solid var(--divider-color);
        border-top: none; 
        border-bottom-left-radius: var(--sb-group-radius);
        border-bottom-right-radius: var(--sb-group-radius);
        box-shadow: 0px 8px 16px rgba(0,0,0,0.25);
        
        transform-origin: top;
        transform: scaleY(0);
        opacity: 0;
        pointer-events: none;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
        
        max-height: 350px;
        overflow-y: auto;
        padding: 12px;
        margin-top: -1px; /* Overlaps the bottom border of the button row for a seamless look */
      }


      .mf-container.drawer-up .mf-overlay {
        top: auto;
        bottom: 100%;

        border-top: 1px solid var(--divider-color);
        border-bottom: none;
        border-bottom-left-radius: 0;
        border-bottom-right-radius: 0;
        border-top-left-radius: var(--sb-group-radius);
        border-top-right-radius: var(--sb-group-radius);

        transform-origin: bottom;

        margin-top: 0;
        margin-bottom: -1px; /* Overlaps the top border of the button row for a seamless look */
        box-shadow: 0px -8px 16px rgba(0,0,0,0.25);
      }

			.mf-overlay.open {
        transform: scaleY(1);
        opacity: 1;
        pointer-events: auto;
      }

      .mf-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }

      /* Inline scrollable macros/favorites rows */
      .inline-drawer-row {
        padding: 12px;
        box-sizing: border-box;
      }
      .inline-drawer-row__scroller {
        /* --inline-row-visible-rows controls how many button rows are visible
           before content overflows and becomes scrollable. */
        --inline-row-btn-h: 50px;
        --inline-row-gap: 8px;
        --inline-row-visible-rows: 2;
        max-height: calc(
          var(--inline-row-btn-h) * var(--inline-row-visible-rows)
          + var(--inline-row-gap) * (var(--inline-row-visible-rows) - 1)
        );
        overflow-y: auto;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }
      .inline-drawer-row__grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .inline-drawer-row__empty {
        text-align: center;
        opacity: 0.6;
        font-size: 13px;
        padding: 8px 0;
      }

      /* Drawer buttons (Macros/Favorites) */
      .drawer-btn {
        height: 50px !important;
        font-size: 13px !important;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }

      /* Hover/press overlay  */
      .macroFavoritesButton::before,
      .drawer-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: rgba(var(--sb-overlay-rgb), 0.06);
        opacity: 0;
        transition: opacity 0.15s ease, background 0.15s ease;
        pointer-events: none;
      }

      .macroFavoritesButton:hover::before,
      .drawer-btn:hover::before {
        opacity: 1;
      }

      .macroFavoritesButton:active::before,
      .drawer-btn:active::before {
        opacity: 1;
        background: rgba(var(--sb-overlay-rgb), 0.14);
      }

      .macroFavoritesButton:focus-visible,
      .drawer-btn:focus-visible {
        outline: 2px solid rgba(var(--rgb-primary-color), 0.55);
        outline-offset: 2px;
      }

      .drawer-btn__inner {
        height: 100%;
        width: 100%;
        box-sizing: border-box;
        position: relative;
        z-index: 1;
      }

      /* Matches default hui-button-card "button" look: centered icon + name */
      .drawer-btn__inner--stack {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 2px;
        padding: 4px;
      }

      /* Custom favorites: row layout with ellipsis */
      .drawer-btn__inner--row {
        display: flex;
        flex-direction: row;
        align-items: center;
        justify-content: flex-start;
        padding: 0 12px;
        gap: 10px;
      }

      .drawer-btn--custom .drawer-btn__icon {
        --mdc-icon-size: 18px;
        width: 15% !important;
        flex: 0 0 15%;
      }

      .drawer-btn--custom .name {
        margin: 0 !important;
        text-align: left !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }


      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
      }

      .macroFavoritesButton hui-button-card {
        --ha-card-box-shadow: none;
        --ha-card-border-width: 0;
        --ha-card-border-color: transparent;
        --ha-card-background: transparent;
        --ha-card-border-radius: 0;
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-areas:
          ". up ."
          "left ok right"
          ". down .";
        gap: 10px;
        align-items: center;
        justify-items: stretch;
      }
      .dpad .area-up { grid-area: up; }
      .dpad .area-left { grid-area: left; }
      .dpad .area-ok { grid-area: ok; }
      .dpad .area-right { grid-area: right; }
      .dpad .area-down { grid-area: down; }

      /* Back / Home / Menu row */
      .row3 {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
      }

      /* Mid: Volume/Channel layout variations */
      .mid {
        padding: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 10px;
        align-items: stretch;
      }
      .mid--dual {
        grid-template-rows: repeat(2, minmax(0, 1fr));
        grid-template-areas:
          "volup mute chup"
          "voldn mute chdn";
      }
      .mid--dual.mid--x2 {
        grid-template-areas:
          "volup guide chup"
          "voldn mute chdn";
      }
      .mid--volume {
        grid-template-rows: 1fr;
        grid-template-areas: "mute voldn volup";
      }
      .mid--channel.mid--x2 {
        grid-template-rows: 1fr;
        grid-template-areas: "guide chdn chup";
      }
      .mid--channel.mid--x1 {
        grid-template-rows: 1fr;
        grid-template-areas: "chdn . chup";
      }
      .mid-btn-volup { grid-area: volup; }
      .mid-btn-voldn { grid-area: voldn; }
      .mid-btn-mute { grid-area: mute; align-self: center; }
      .mid-btn-guide { grid-area: guide; }
      .mid-btn-chup { grid-area: chup; }
      .mid-btn-chdn { grid-area: chdn; }

      /* Media: X1 is 1 row; X2 is 2 rows */
      .media {
        padding: 12px;
        display: grid;
        gap: 10px;
        align-items: stretch;
      }
      .media--play,
      .media--dvr,
      .media--both.media--x1,
      .media--both.media--x2 {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
      .media--play {
        grid-template-areas: "rew play fwd";
      }
      .media--play.media--x1 {
        grid-template-areas: "rew pause fwd";
      }
      .media--dvr {
        grid-template-areas: "dvr pause exit";
      }
      .media--both.media--x1 {
        grid-template-areas: "rew pause fwd";
      }
      .media--both.media--x2 {
        grid-template-areas:
          "rew play fwd"
          "dvr pause exit";
      }
      .media .area-rew   { grid-area: rew; }
      .media .area-play  { grid-area: play; }
      .media .area-fwd   { grid-area: fwd; }
      .media .area-dvr   { grid-area: dvr; }
      .media .area-pause { grid-area: pause; }
      .media .area-exit  { grid-area: exit; }

      /* Colors + ABC blocks */
      .colors, .abc {
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .colorsGrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
      .abcGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }

      /* Key wrapper for disabled styling */
      .key.disabled,
      .macroFavoritesButton.disabled {
        opacity: 0.35;
        pointer-events: none;
        filter: grayscale(0.2);
      }

      /* sizing */

/* Allow grid children to shrink (prevents overflow on mobile / narrow cards) */
.key { min-width: 0; position: relative; width: 100%; }
.key hui-button-card {
  min-width: 0;
  --mdc-typography-button-font-size: var(--sb-key-font-size);
  --paper-font-body1_-_font-size: var(--sb-key-font-size);
  font-size: var(--sb-key-font-size);
}

/* --- Square remote keys (scalable) --- */
.key:not(.key--color) {
  aspect-ratio: 1 / 1;
}

/* Fill wrapper */
.key:not(.key--color) hui-button-card {
  display: block;
  width: 100%;
  height: 100% !important;
}

/* Re-introduce relative sizing (scales with card width) */
.key--small  { transform: scale(0.82); transform-origin: center; }
.key--normal { transform: scale(0.92); transform-origin: center; }
.key--big    { transform: scale(1.00); transform-origin: center; }
.okKey       { transform: scale(1.06); transform-origin: center; }

/* Keep color keys as strips (not square) */
.key--color {
  aspect-ratio: 3 / 1;
  min-height: var(--sb-color-key-min-height);
  transform: none;
}
.key--color hui-button-card {
  height: 100% !important;
  width: 100%;
  display: block;
}

/* Color keys: overlay a pill/strip on top of the hui-button-card */

      .key--color .colorBar {
        position: absolute;
        inset: 0;
        border-radius: 999px;
        background: var(--sb-color);
        pointer-events: none;
      }

      .warn {
        position: absolute;
        top: 12px;
        left: 12px;
        right: 12px;
        z-index: 10;
        font-size: 12px;
        opacity: .9;
        border-left: 3px solid var(--warning-color, orange);
        padding-left: 10px;
      }

      .sb-modal {
        position: fixed;
        inset: 0;
        display: none;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.45);
        z-index: 999;
      }

      .sb-modal.open {
        display: flex;
      }

      .sb-modal__dialog {
        width: min(420px, 90vw);
        background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
        color: var(--primary-text-color);
        border-radius: 16px;
        border: 1px solid var(--divider-color);
        padding: 16px;
        display: grid;
        gap: 12px;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
      }

      .sb-modal__header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .sb-modal__title {
        font-weight: 600;
        font-size: 14px;
      }

      .sb-modal__close {
        border: none;
        background: transparent;
        color: inherit;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }

      .sb-modal__text {
        font-size: 13px;
        opacity: 0.85;
      }

      .sb-modal__optout {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        opacity: 0.85;
      }

      .sb-modal__actions {
        display: grid;
        gap: 8px;
      }

      .sb-modal__link {
        font-size: 12px;
        color: var(--primary-color, #03a9f4);
        text-decoration: underline;
      }
    `;
var REMOTE_CARD_EDITOR_CSS = `
          .sb-modal { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0, 0, 0, 0.45); z-index: 9999; }
          .sb-modal.open { display: flex; }
          .sb-modal__dialog { width: min(560px, 92vw); max-height: 90vh; overflow: auto; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); color: var(--primary-text-color); border-radius: 16px; border: 1px solid var(--divider-color); padding: 16px; display: grid; gap: 12px; box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35); }
          .sb-modal__header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
          .sb-modal__title { font-weight: 700; font-size: 18px; }
          .sb-modal__close { border: none; background: transparent; color: inherit; cursor: pointer; font-size: 22px; line-height: 1; }
          .sb-modal__text { font-size: 15px; line-height: 1.5; opacity: 0.95; }
          .sb-modal__optout { display: flex; align-items: center; gap: 8px; font-size: 14px; }
          .sb-modal__actions { display: flex; gap: 8px; justify-content: flex-end; }
          .sb-exp { border: 1px solid var(--divider-color); border-radius: 12px; overflow: visible; }
          .sb-exp-hdr { width: 100%; display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 12px; background: var(--ha-card-background, transparent); border: 0; cursor: pointer; transition: background-color 120ms ease; }
          .sb-exp-hdr-left { display:flex; align-items:center; gap: 10px; min-width: 0; }
          .sb-exp-title { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .sb-exp-body { padding: 8px 12px 12px 12px; }
          .sb-exp-collapsed .sb-exp-body { display: none; }
          .sb-exp:not(.sb-exp-collapsed) > .sb-exp-hdr { background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); border-radius: 12px 12px 0 0; }
                    
          .sb-layout-title { font-weight: 600; margin: 10px 0 6px; }
          .sb-layout-card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 10px; }
          .sb-layout-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 6px 0; }
          .sb-layout-row-order { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; align-items: center; gap: 10px; }
          .sb-layout-row + .sb-layout-row { border-top: 1px solid var(--divider-color); }
          .sb-layout-actions { display: inline-flex; align-items:center; gap: 10px; }
          .sb-layout-actions-full { flex: 1; }
          .sb-layout-actions-full ha-select { width: 100%; }
          .sb-layout-note { font-size: 12px; opacity: 0.7; text-align: right; padding: 2px 0 6px; }
          .sb-icon-btn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--divider-color); background: var(--ha-card-background, transparent); cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
          .sb-icon-btn[disabled] { opacity: 0.4; cursor: default; }
          .sb-layout-footer { margin-top: 10px; display:flex; justify-content:flex-end; }
          .sb-reset-btn { border: 1px solid var(--divider-color); border-radius: 10px; padding: 6px 10px; background: transparent; cursor:pointer; }
          .sb-switch { display:flex; align-items:center; }
          .sb-styling-wrap { padding: 0 0 12px 0; }
          .sb-styling-card { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; }
          .sb-layout-switch-item { display:flex; align-items:center; gap:8px; min-width: 0; }
          .sb-layout-switch-item-empty { visibility: hidden; }
          .sb-layout-switch-label { font-size: 13px; opacity: 0.9; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .sb-mf-rows-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 12px; align-items: center; background: rgba(var(--rgb-primary-text-color, 0, 0, 0), 0.04); border: 1px solid var(--divider-color); border-radius: 10px; padding: 8px 12px; margin: 8px 0; }
          /* This label explains the switch next to it \u2014 translations can be long, so wrap instead of ellipsing. */
          .sb-mf-rows-row .sb-layout-switch-label { white-space: normal; overflow: visible; text-overflow: clip; }
          .sb-mf-rows-row + .sb-layout-row { border-top: 0; }
          .sb-mf-rows-stepper-item { gap: 10px; justify-self: end; }
          .sb-mf-rows-stepper-item.is-disabled { opacity: 0.45; pointer-events: none; }
          .sb-rows-stepper { display: inline-flex; align-items: center; gap: 6px; }
          .sb-rows-stepper .sb-icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
          .sb-rows-value { min-width: 24px; text-align: center; font-variant-numeric: tabular-nums; font-size: 14px; font-weight: 600; }
          .sb-move-wrap { display:flex; flex-direction:row; align-items:center; gap:6px; justify-self: end; }
          .sb-drag-handle { width: 32px; height: 32px; display: inline-flex; align-items: center; justify-content: center; justify-self: end; color: var(--secondary-text-color); cursor: grab; touch-action: none; }
          .sb-drag-handle:active { cursor: grabbing; }
          .sb-drag-handle ha-icon { --mdc-icon-size: 20px; }
          .sb-layout-row-order.sortable-ghost { opacity: 0.35; }
          .sb-layout-row-order.sortable-chosen { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.06); background: color-mix(in srgb, var(--primary-color) 6%, transparent); }
          .sb-commands-wrap { padding: 0 0 12px 0; }
          .sb-commands-meta { margin-bottom: 12px; }
          .sb-yaml-helper-row { display:flex; align-items:flex-start; justify-content:space-between; gap: 10px; margin-bottom: 10px; }
          .sb-yaml-helper-drag { color: var(--secondary-text-color); opacity: 0.75; padding-top: 2px; }
          .sb-yaml-helper-drag ha-icon { --mdc-icon-size: 20px; }
          .sb-yaml-helper-main { display:flex; flex-direction:column; gap: 4px; flex: 1; min-width: 0; }
          .sb-yaml-helper-label-wrap { display:flex; align-items:center; gap: 6px; font-size: 14px; font-weight: 600; cursor: pointer; }
          .sb-yaml-helper-label { line-height: 1.2; }
          .sb-yaml-helper-desc { font-size: 13px; color: var(--secondary-text-color); line-height: 1.3; }
          .sb-yaml-helper-link { color: var(--secondary-text-color); display:flex; align-items:center; justify-content:center; text-decoration:none; opacity: 0.85; }
          .sb-yaml-helper-link:hover { color: var(--primary-color); opacity: 1; }
          .sb-yaml-helper-link ha-icon { --mdc-icon-size: 16px; }
          .sb-command-sync-row { margin: 0 0 12px; border: 1px solid var(--divider-color); border-radius: 12px; padding: 10px 12px; display:flex; align-items:center; justify-content:space-between; gap: 10px; }
          .sb-command-sync-row-running { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.10); background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
          .sb-command-sync-row-error { border-color: var(--error-color); background: rgba(var(--rgb-error-color, 219, 68, 55), 0.10); background: color-mix(in srgb, var(--error-color) 10%, transparent); }
          .sb-command-sync-row-ok { border-color: var(--success-color, #22c55e); border-color: color-mix(in srgb, var(--success-color, #22c55e) 70%, var(--divider-color)); background: rgba(34, 197, 94, 0.12); background: color-mix(in srgb, var(--success-color, #22c55e) 12%, transparent); }
          .sb-command-sync-message-wrap { display:flex; align-items:center; gap: 8px; min-width: 0; }
          .sb-command-sync-message-wrap ha-icon { --mdc-icon-size: 18px; color: var(--secondary-text-color); }
          .sb-command-sync-row-ok .sb-command-sync-message-wrap ha-icon { color: var(--success-color, #22c55e); }
          .sb-command-sync-row-error .sb-command-sync-message-wrap ha-icon { color: var(--error-color); }
          .sb-command-sync-row-running .sb-command-sync-message-wrap ha-icon { color: var(--primary-color); }
          .sb-command-sync-message { font-size: 13px; color: var(--secondary-text-color); }
          .sb-command-sync-btn { border: 1px solid var(--primary-color); border-radius: 10px; min-height: 34px; padding: 0 12px; background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); color: var(--primary-text-color); cursor: pointer; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
          .sb-command-sync-btn:hover { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.28); background: color-mix(in srgb, var(--primary-color) 28%, transparent); border-color: var(--primary-color); border-color: color-mix(in srgb, var(--primary-color) 85%, #000); }
          .sb-command-sync-btn:active { transform: translateY(1px); }
          .sb-command-sync-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px rgba(var(--rgb-primary-color, 3, 169, 244), 0.45); box-shadow: 0 0 0 2px color-mix(in srgb, var(--primary-color) 45%, transparent); }
          .sb-command-sync-btn[disabled],
          .sb-command-sync-btn.sb-command-sync-btn-static { opacity: 0.6; cursor: default; transform: none; pointer-events: none; }
          .sb-command-sync-btn.sb-command-sync-btn-static { display: inline-flex; align-items: center; }
          .sb-command-grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
          .sb-command-slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: 12px; min-height: 108px; cursor: pointer; padding: 0; text-align: left; display:flex; flex-direction:column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
          .sb-command-slot-btn:hover { border-color: var(--primary-color); }
          .sb-command-slot-main { position: relative; display:flex; align-items:flex-start; gap: 8px; padding: 14px 12px 10px; min-width: 0; }
                    .sb-command-slot-icon-wrap { width: 20px; min-width: 20px; min-height: 20px; display:flex; align-items:center; justify-content:center; }
          .sb-command-slot-icon-wrap ha-icon { --mdc-icon-size: 20px; color: var(--state-icon-color); }
          .sb-command-slot-name { font-weight: 700; font-size: 16px; line-height: 1.15; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--primary-text-color); }
          .sb-command-slot-meta { margin-top: 3px; font-size: 12px; color: var(--secondary-text-color); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; display:flex; align-items:center; gap: 4px; }
          .sb-command-slot-favorite { color: var(--error-color); display:inline-flex; }
          .sb-command-slot-favorite ha-icon { --mdc-icon-size: 14px; }
          .sb-command-slot-meta-icon { color: var(--state-icon-color); display:inline-flex; }
          .sb-command-slot-meta-icon ha-icon { --mdc-icon-size: 14px; }
          .sb-command-slot-text-wrap { min-width: 0; padding-top: 1px; flex: 1; }
          .sb-command-slot-clear { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; min-width: 26px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; padding: 0; cursor: pointer; z-index: 1; opacity: 0.9; }
          .sb-command-slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
          .sb-command-slot-clear ha-icon { --mdc-icon-size: 16px; }
          .sb-command-slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: 10px; min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
          .sb-command-slot-action-btn:hover { border-color: var(--primary-color); background: var(--ha-card-background, var(--card-background-color)); }
          .sb-command-slot-action-btn:active { transform: translateY(1px); }
          .sb-command-slot-action-btn:focus-visible { outline: none; box-shadow: 0 0 0 2px var(--primary-color); }
          .sb-command-slot-confirm { padding: 14px 12px 10px; display:flex; flex-direction:column; }
          .sb-command-slot-confirm-title { font-weight: 700; font-size: 16px; line-height: 1.15; color: var(--primary-text-color); }
          .sb-command-slot-confirm-sub { margin-top: 1px; font-size: 12px; color: var(--secondary-text-color); }
          .sb-command-slot-confirm-actions { display:grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 0 10px 10px; }
          .sb-command-slot-confirm-actions .sb-command-slot-action-btn { margin: 0; text-align: center; justify-content: center; display:flex; align-items:center; }
          .sb-command-slot-empty { border-color: var(--divider-color); background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); }
          .sb-command-slot-empty .sb-command-slot-main { gap: 12px; align-items: center; justify-content: center; flex-direction: column; }
          .sb-command-slot-empty .sb-command-slot-empty-text { font-size: 64px; line-height: 1; color: var(--secondary-text-color); display:inline-flex; align-items:center; justify-content:center; opacity: 0.8; }
          .sb-command-slot-empty .sb-command-slot-name { font-size: 18px; font-weight: 500; text-align: center; color: var(--secondary-text-color); }
          .sb-command-modal { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.52); display:none; align-items:center; justify-content:center; padding: 18px; }
          .sb-command-modal.open { display:flex; }
          .sb-command-dialog { width: min(640px, 100%); max-height: min(680px, 100%); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); color: var(--primary-text-color); border-radius: 16px; border: 1px solid var(--divider-color); display:flex; flex-direction:column; overflow:hidden; box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); }
          .sb-command-dialog-header { display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 14px 16px; border-bottom: 1px solid var(--divider-color); }
          .sb-command-dialog-title { font-size: 16px; font-weight: 700; }
          .sb-command-dialog-close { border: 0; background: transparent; cursor: pointer; color: inherit; display:flex; align-items:center; justify-content:center; }
          .sb-command-dialog-body { padding: 16px; display:flex; flex-direction:column; gap: 12px; overflow:auto; }
          .sb-command-dialog-footer { display:flex; align-items:center; justify-content:space-between; gap: 10px; padding: 12px 16px; border-top: 1px solid var(--divider-color); }
          .sb-command-dialog-footer-note { font-size: 13px; color: var(--error-color); text-align: left; }
          .sb-command-dialog-footer-actions { display:flex; align-items:center; justify-content:flex-end; gap: 8px; margin-left: auto; }
          .sb-command-dialog-btn { border: 1px solid var(--divider-color); border-radius: 10px; min-height: 36px; padding: 0 12px; background: var(--ha-card-background, var(--card-background-color)); color: var(--primary-text-color); cursor: pointer; font-size: 14px; }
          .sb-command-dialog-btn:hover { border-color: var(--primary-color); }
          .sb-command-dialog-btn-primary { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-hub-version-warn-btn { all: unset; cursor: pointer; text-decoration: underline; display: block; }
          .sb-hub-version-chip-row { display: flex; gap: 8px; flex-wrap: wrap; }
          .sb-hub-version-chip { border: 1px solid var(--divider-color); border-radius: 20px; padding: 4px 14px; background: transparent; color: var(--primary-text-color); cursor: pointer; font-size: 13px; }
          .sb-hub-version-chip.active { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-command-dialog-note { border: 1px solid var(--divider-color); border: 1px solid color-mix(in srgb, var(--info-color, var(--primary-color)) 42%, var(--divider-color)); border-radius: 12px; padding: 12px; background: var(--ha-card-background, var(--card-background-color)); background: color-mix(in srgb, var(--info-color, var(--primary-color)) 12%, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 13px; line-height: 1.45; display:flex; align-items:flex-start; gap:10px; }
          .sb-command-dialog-note::before { content: ""; width: 18px; height: 18px; border-radius: 50%; background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.22); background: color-mix(in srgb, var(--info-color, var(--primary-color)) 22%, transparent); flex: 0 0 18px; margin-top: 1px; }
          .sb-command-config-block { border: 1px solid var(--divider-color); border-radius: 12px; padding: 12px; display:flex; flex-direction:column; gap:12px; }
          .sb-command-input-row { display:flex; flex-direction:column; gap:6px; }
          .sb-command-input-label { font-size: 12px; opacity: 0.78; }
          .sb-command-name-field { width: 100%; }
          .sb-command-input-select { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, transparent); color: inherit; min-height: 40px; padding: 6px 12px; }
          .sb-command-checkbox { width: 100%; border: 0; background: transparent; padding: 0; display:flex; align-items:center; justify-content:space-between; gap:10px; font-size: 13px; cursor: pointer; color: inherit; }
          .sb-command-checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--divider-color); background: var(--ha-card-background, rgba(0, 0, 0, 0.12)); background: color-mix(in srgb, var(--ha-card-background, transparent) 88%, #000); display:flex; align-items:center; justify-content:center; transition: background-color 120ms ease, border-color 120ms ease; }
          .sb-command-checkbox-icon ha-icon { --mdc-icon-size: 16px; }
          .sb-command-checkbox-left { display:flex; align-items:center; gap:10px; }
          .sb-command-checkbox.sb-command-favorite-active .sb-command-checkbox-icon { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.20); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
          .sb-command-helper { font-size: 12px; opacity: 0.8; margin-top: 2px; }
          .sb-command-activity-chip-row { display:flex; flex-wrap:wrap; gap:8px; }
          .sb-command-activity-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, rgba(0, 0, 0, 0.1)); background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; cursor: pointer; }
          .sb-command-activity-chip.active { background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.20); background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); }
          .sb-command-action-wrap { display:flex; flex-direction:column; gap:8px; }
          .sb-command-action-tabs { display:flex; gap:8px; }
          .sb-command-action-tab { border: 1px solid var(--divider-color); border-radius: 999px; background: var(--ha-card-background, rgba(0, 0, 0, 0.1)); background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 8px 12px; cursor:pointer; font: inherit; }
          .sb-command-action-tab.active { border-color: var(--primary-color); background: rgba(var(--rgb-primary-color, 3, 169, 244), 0.18); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
          .sb-command-dialog-body ha-textfield,
          .sb-command-dialog-body ha-selector { width: 100%; }
          @media (max-width: 760px) {
            .sb-command-grid { grid-template-columns: 1fr; }
          }
          @media (max-width: 700px) {
            .sb-command-modal { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
            .sb-command-dialog { width: 100%; max-height: 100%; border-radius: 0 0 16px 16px; }
            .sb-command-dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
          }
        `;

// custom_components/sofabaton_x1s/www/src/remote-card-shared.ts
var CARD_NAME = "Sofabaton Virtual Remote";
var CARD_VERSION = "0.1.8";
var KEY_CAPTURE_HELP_URL = "https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/keycapture.md";
var LOG_ONCE_KEY = `__${CARD_NAME}_logged__`;
var AUTOMATION_ASSIST_SESSION_KEY = "__sofabatonAutomationAssistSession__";
var PREVIEW_ACTIVITY_CACHE_KEY = "__sofabatonPreviewActivityCache__";
var TYPE = "sofabaton-virtual-remote";
var EDITOR = "sofabaton-virtual-remote-editor";
var previewCache = () => {
  if (typeof window === "undefined") return null;
  const cache = window[PREVIEW_ACTIVITY_CACHE_KEY];
  return cache && typeof cache === "object" ? cache : null;
};
var readPreviewActivity = (entityId) => {
  if (!entityId) return null;
  const cache = previewCache();
  if (!cache) return null;
  return cache[String(entityId)] ?? null;
};
var writePreviewActivity = (entityId, value) => {
  if (!entityId || typeof window === "undefined") return;
  const cache = previewCache() ?? {};
  cache[String(entityId)] = value == null ? "" : String(value);
  window[PREVIEW_ACTIVITY_CACHE_KEY] = cache;
};
function logPillsOnce() {
  const win2 = window;
  if (win2[LOG_ONCE_KEY]) return;
  win2[LOG_ONCE_KEY] = true;
  const base = "padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;line-height:18px;";
  const red = base + "background:#ef4444;color:#fff;";
  const green = base + "background:#22c55e;color:#062b12;";
  const yellow = base + "background:#facc15;color:#111827;";
  const blue = base + "background:#3b82f6;color:#fff;";
  const gap = "color:transparent;";
  console.log(
    `%cSofabaton%c %c Virtual %c %c  Remote  %c %c   ${CARD_VERSION}   `,
    red,
    gap,
    green,
    gap,
    yellow,
    gap,
    blue
  );
}
function stableJsonSignature(value) {
  if (value == null) return "";
  try {
    return JSON.stringify(value);
  } catch (_err) {
    return String(value);
  }
}

// custom_components/sofabaton_x1s/www/src/editor-sections/expander.ts
function renderEditorExpander(params) {
  const toggle = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    params.onToggle();
  };
  return b2`
    <div class="sb-exp${params.expanded ? "" : " sb-exp-collapsed"}">
      <button
        type="button"
        class="sb-exp-hdr"
        aria-expanded=${String(params.expanded)}
        @click=${toggle}
      >
        <div class="sb-exp-hdr-left">
          <ha-icon icon=${params.icon}></ha-icon>
          <div class="sb-exp-title">${params.title}</div>
        </div>
        <ha-icon
          class="sb-exp-chevron"
          icon=${params.expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
        ></ha-icon>
      </button>
      <div class="sb-exp-body">${params.body}</div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/editor-sections/commands-editor.ts
function renderCommandsEditorSection(params) {
  const onSwitchChange = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    const target = ev.target;
    params.onSetAutomationAssist(!!target.checked);
  };
  const onLabelClick = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    params.onSetAutomationAssist(!params.automationAssistEnabled);
  };
  const body = b2`
    <div class="sb-commands-meta">
      <label class="sb-yaml-helper-row">
        <div class="sb-yaml-helper-drag">
          <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
        </div>
        <div class="sb-yaml-helper-main">
          <div class="sb-yaml-helper-label-wrap" @click=${onLabelClick}>
            <span class="sb-yaml-helper-label">${str().editor.keyCapture}</span>
            <a
              class="sb-yaml-helper-link"
              href=${KEY_CAPTURE_HELP_URL}
              target="_blank"
              rel="noopener noreferrer"
              title=${str().editor.keyCaptureLearnMore}
              aria-label=${str().editor.keyCaptureDocsAria}
              @click=${(ev) => ev.stopPropagation()}
            >
              <ha-icon icon="mdi:help-circle-outline"></ha-icon>
            </a>
          </div>
          <div class="sb-yaml-helper-desc">${str().editor.keyCaptureDescription}</div>
        </div>
        <ha-switch
          .checked=${params.automationAssistEnabled}
          @change=${onSwitchChange}
        ></ha-switch>
      </label>
    </div>
  `;
  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:play-box-multiple-outline",
    title: str().editor.automationAssistTitle,
    onToggle: params.onToggleExpanded,
    body
  });
}

// custom_components/sofabaton_x1s/www/src/editor-sections/styling-options.ts
var computeEditorFieldLabel = (schema) => str().editor.fieldLabels[schema.name] || schema.name;
function renderStylingOptionsSection(params) {
  const config = params.config;
  const showColorPicker = params.config.use_background_override || !!params.config.background_override;
  const schema = [
    { name: "theme", selector: { theme: {} } },
    {
      name: "max_width",
      selector: {
        number: {
          min: 230,
          max: 1200,
          step: 5,
          unit_of_measurement: "px"
        }
      }
    },
    { name: "use_background_override", selector: { boolean: {} } },
    ...showColorPicker ? [{ name: "background_override", selector: { color_rgb: {} } }] : []
  ];
  const data = {
    theme: config.theme || "",
    max_width: config.max_width ?? 360,
    use_background_override: config.use_background_override ?? !!config.background_override,
    background_override: config.background_override ?? [255, 255, 255]
  };
  const onValueChanged = (ev) => {
    ev.stopPropagation();
    params.onValueChanged(ev.detail.value);
  };
  const body = b2`
    <div class="sb-styling-card">
      <ha-form
        .hass=${params.hass}
        .schema=${schema}
        .data=${data}
        .computeLabel=${computeEditorFieldLabel}
        @value-changed=${onValueChanged}
      ></ha-form>
    </div>
  `;
  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:palette",
    title: str().editor.stylingOptions,
    onToggle: params.onToggleExpanded,
    body
  });
}

// node_modules/lit-html/static.js
var a3 = /* @__PURE__ */ Symbol.for("");
var o5 = (t5) => {
  if (t5?.r === a3) return t5?._$litStatic$;
};
var s4 = (t5) => ({ _$litStatic$: t5, r: a3 });
var l3 = /* @__PURE__ */ new Map();
var n4 = (t5) => (r6, ...e6) => {
  const a4 = e6.length;
  let s7, i7;
  const n7 = [], u6 = [];
  let c7, $3 = 0, f4 = false;
  for (; $3 < a4; ) {
    for (c7 = r6[$3]; $3 < a4 && void 0 !== (i7 = e6[$3], s7 = o5(i7)); ) c7 += s7 + r6[++$3], f4 = true;
    $3 !== a4 && u6.push(i7), n7.push(c7), $3++;
  }
  if ($3 === a4 && n7.push(r6[a4]), f4) {
    const t6 = n7.join("$$lit$$");
    void 0 === (r6 = l3.get(t6)) && (n7.raw = n7, l3.set(t6, r6 = n7)), e6 = u6;
  }
  return t5(r6, ...e6);
};
var u3 = n4(b2);
var c4 = n4(w);
var $2 = n4(T);

// node_modules/lit-html/directive-helpers.js
var { I: t3 } = j;
var i5 = (o8) => o8;
var r4 = (o8) => void 0 === o8.strings;
var s5 = () => document.createComment("");
var v2 = (o8, n7, e6) => {
  const l4 = o8._$AA.parentNode, d3 = void 0 === n7 ? o8._$AB : n7._$AA;
  if (void 0 === e6) {
    const i7 = l4.insertBefore(s5(), d3), n8 = l4.insertBefore(s5(), d3);
    e6 = new t3(i7, n8, o8, o8.options);
  } else {
    const t5 = e6._$AB.nextSibling, n8 = e6._$AM, c7 = n8 !== o8;
    if (c7) {
      let t6;
      e6._$AQ?.(o8), e6._$AM = o8, void 0 !== e6._$AP && (t6 = o8._$AU) !== n8._$AU && e6._$AP(t6);
    }
    if (t5 !== d3 || c7) {
      let o9 = e6._$AA;
      for (; o9 !== t5; ) {
        const t6 = i5(o9).nextSibling;
        i5(l4).insertBefore(o9, d3), o9 = t6;
      }
    }
  }
  return e6;
};
var u4 = (o8, t5, i7 = o8) => (o8._$AI(t5, i7), o8);
var m2 = {};
var p3 = (o8, t5 = m2) => o8._$AH = t5;
var M2 = (o8) => o8._$AH;
var h3 = (o8) => {
  o8._$AR(), o8._$AA.remove();
};

// node_modules/lit-html/directive.js
var t4 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t5) => (...e6) => ({ _$litDirective$: t5, values: e6 });
var i6 = class {
  constructor(t5) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t5, e6, i7) {
    this._$Ct = t5, this._$AM = e6, this._$Ci = i7;
  }
  _$AS(t5, e6) {
    return this.update(t5, e6);
  }
  update(t5, e6) {
    return this.render(...e6);
  }
};

// node_modules/lit-html/async-directive.js
var s6 = (i7, t5) => {
  const e6 = i7._$AN;
  if (void 0 === e6) return false;
  for (const i8 of e6) i8._$AO?.(t5, false), s6(i8, t5);
  return true;
};
var o6 = (i7) => {
  let t5, e6;
  do {
    if (void 0 === (t5 = i7._$AM)) break;
    e6 = t5._$AN, e6.delete(i7), i7 = t5;
  } while (0 === e6?.size);
};
var r5 = (i7) => {
  for (let t5; t5 = i7._$AM; i7 = t5) {
    let e6 = t5._$AN;
    if (void 0 === e6) t5._$AN = e6 = /* @__PURE__ */ new Set();
    else if (e6.has(i7)) break;
    e6.add(i7), c5(t5);
  }
};
function h4(i7) {
  void 0 !== this._$AN ? (o6(this), this._$AM = i7, r5(this)) : this._$AM = i7;
}
function n5(i7, t5 = false, e6 = 0) {
  const r6 = this._$AH, h6 = this._$AN;
  if (void 0 !== h6 && 0 !== h6.size) if (t5) if (Array.isArray(r6)) for (let i8 = e6; i8 < r6.length; i8++) s6(r6[i8], false), o6(r6[i8]);
  else null != r6 && (s6(r6, false), o6(r6));
  else s6(this, i7);
}
var c5 = (i7) => {
  i7.type == t4.CHILD && (i7._$AP ?? (i7._$AP = n5), i7._$AQ ?? (i7._$AQ = h4));
};
var f3 = class extends i6 {
  constructor() {
    super(...arguments), this._$AN = void 0;
  }
  _$AT(i7, t5, e6) {
    super._$AT(i7, t5, e6), r5(this), this.isConnected = i7._$AU;
  }
  _$AO(i7, t5 = true) {
    i7 !== this.isConnected && (this.isConnected = i7, i7 ? this.reconnected?.() : this.disconnected?.()), t5 && (s6(this, i7), o6(this));
  }
  setValue(t5) {
    if (r4(this._$Ct)) this._$Ct._$AI(t5, this);
    else {
      const i7 = [...this._$Ct._$AH];
      i7[this._$Ci] = t5, this._$Ct._$AI(i7, this, 0);
    }
  }
  disconnected() {
  }
  reconnected() {
  }
};

// node_modules/lit-html/directives/ref.js
var e5 = () => new h5();
var h5 = class {
};
var o7 = /* @__PURE__ */ new WeakMap();
var n6 = e4(class extends f3 {
  render(i7) {
    return A;
  }
  update(i7, [s7]) {
    const e6 = s7 !== this.G;
    return e6 && void 0 !== this.G && this.rt(void 0), (e6 || this.lt !== this.ct) && (this.G = s7, this.ht = i7.options?.host, this.rt(this.ct = i7.element)), A;
  }
  rt(t5) {
    if (this.isConnected || (t5 = void 0), "function" == typeof this.G) {
      const i7 = this.ht ?? globalThis;
      let s7 = o7.get(i7);
      void 0 === s7 && (s7 = /* @__PURE__ */ new WeakMap(), o7.set(i7, s7)), void 0 !== s7.get(this.G) && this.G.call(this.ht, void 0), s7.set(this.G, t5), void 0 !== t5 && this.G.call(this.ht, t5);
    } else this.G.value = t5;
  }
  get lt() {
    return "function" == typeof this.G ? o7.get(this.ht ?? globalThis)?.get(this.G) : this.G?.value;
  }
  disconnected() {
    this.lt === this.ct && this.rt(void 0);
  }
  reconnected() {
    this.rt(this.ct);
  }
});

// custom_components/sofabaton_x1s/www/src/editor-sections/group-order.ts
var stopEvent = (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
};
var containSortableEvent = (ev) => {
  ev.stopPropagation();
  if (typeof ev.stopImmediatePropagation === "function") {
    ev.stopImmediatePropagation();
  }
};
var containSelectCloseEvents = (el) => {
  if (!el) return;
  const flagged = el;
  if (flagged.__sbCloseContained) return;
  flagged.__sbCloseContained = true;
  selectCloseEvents().forEach((eventName) => {
    el.addEventListener(eventName, (ev) => ev.stopPropagation());
  });
};
function renderSwitchItem(text, checked, onSet) {
  const onChange = (ev) => {
    stopEvent(ev);
    const target = ev.target;
    onSet(!!target.checked);
  };
  return b2`
    <div class="sb-layout-switch-item">
      <ha-switch .checked=${checked} @change=${onChange}></ha-switch>
      <div class="sb-layout-switch-label">${text}</div>
    </div>
  `;
}
var emptySlot = b2`
  <div class="sb-layout-switch-item sb-layout-switch-item-empty" aria-hidden="true"></div>
`;
function renderIconButton(icon, aria, disabled, onClick) {
  return b2`
    <button
      type="button"
      class="sb-icon-btn"
      .disabled=${disabled}
      aria-label=${aria}
      @click=${(ev) => {
    stopEvent(ev);
    if (disabled) return;
    onClick();
  }}
    >
      <ha-icon icon=${icon}></ha-icon>
    </button>
  `;
}
function renderGroupOrderSection(params) {
  const selectionValues = new Set(params.selectionOptions.map((o8) => o8.value));
  const handleLayoutSelect = (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    ev.stopImmediatePropagation?.();
    const detailValue = ev.detail?.value;
    const targetValue = ev.target?.value;
    const selected = detailValue ?? targetValue ?? "";
    params.onSelectLayout(selectionValues.has(selected) ? selected : "default");
  };
  const itemTag = s4(selectItemTagName());
  const layoutSelect = b2`
    <ha-select
      .fixedMenuPosition=${true}
      .label=${str().editor.layoutSelectLabel}
      .hass=${params.hass}
      .value=${selectValueCompat(params.selection, params.selectionOptions)}
      @selected=${handleLayoutSelect}
      @change=${handleLayoutSelect}
      ${n6(containSelectCloseEvents)}
    >
      ${params.selectionOptions.map(
    (option) => u3`
          <${itemTag} .value=${option.value}>${option.label}</${itemTag}>
        `
  )}
    </ha-select>
  `;
  const stepButton = (icon, delta) => {
    const disabled = !params.asRows || delta < 0 && params.visibleRows <= MIN_ROW_VISIBLE_ROWS || delta > 0 && params.visibleRows >= MAX_ROW_VISIBLE_ROWS;
    return b2`
      <button
        type="button"
        class="sb-icon-btn"
        .disabled=${disabled}
        @click=${(ev) => {
      stopEvent(ev);
      if (disabled) return;
      const next = Math.max(
        MIN_ROW_VISIBLE_ROWS,
        Math.min(MAX_ROW_VISIBLE_ROWS, params.visibleRows + delta)
      );
      if (next === params.visibleRows) return;
      params.onSetMfRowVisibleRows(next);
    }}
      >
        <ha-icon icon=${icon}></ha-icon>
      </button>
    `;
  };
  const mfRow = b2`
    <div class="sb-layout-row sb-mf-rows-row">
      <div class="sb-layout-switch-item">
        <ha-switch
          .checked=${params.asRows}
          @change=${(ev) => {
    stopEvent(ev);
    const target = ev.target;
    params.onSetMfAsRows(!!target.checked);
  }}
        ></ha-switch>
        <div class="sb-layout-switch-label">${str().editor.macrosFavoritesAsRows}</div>
      </div>
      <div
        class="sb-layout-switch-item sb-mf-rows-stepper-item${params.asRows ? "" : " is-disabled"}"
      >
        <div class="sb-layout-switch-label">${str().editor.visibleRows}</div>
        <div class="sb-rows-stepper">
          ${stepButton("mdi:minus", -1)}
          <div class="sb-rows-value">${String(params.visibleRows)}</div>
          ${stepButton("mdi:plus", 1)}
        </div>
      </div>
    </div>
  `;
  const moveControl = (key, index) => {
    if (params.sortableReady) {
      return b2`
        <div class="sb-drag-handle" aria-hidden="true">
          <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
        </div>
      `;
    }
    return b2`
      <div class="sb-move-wrap">
        ${renderIconButton(
      "mdi:chevron-up",
      str().editor.moveGroupUp(params.groupLabel(key)),
      index === 0,
      () => params.onMoveGroupByKey(key, -1)
    )}
        ${renderIconButton(
      "mdi:chevron-down",
      str().editor.moveGroupDown(params.groupLabel(key)),
      index === params.visibleOrder.length - 1,
      () => params.onMoveGroupByKey(key, 1)
    )}
      </div>
    `;
  };
  const orderRow = (key, index) => {
    let cells = A;
    if (key === "macro_favorites") {
      cells = b2`
        ${renderSwitchItem(str().editor.macros, params.macroEnabled, params.onSetMacro)}
        ${renderSwitchItem(str().editor.favorites, params.favoritesEnabled, params.onSetFavorites)}
      `;
    } else if (key === "macros_row") {
      cells = b2`
        ${renderSwitchItem(str().editor.macros, params.macroEnabled, params.onSetMacro)}
        ${emptySlot}
      `;
    } else if (key === "favorites_row") {
      cells = b2`
        ${renderSwitchItem(str().editor.favorites, params.favoritesEnabled, params.onSetFavorites)}
        ${emptySlot}
      `;
    } else if (key === "mid") {
      cells = b2`
        ${renderSwitchItem(str().editor.volume, params.volumeEnabled, params.onSetVolume)}
        ${renderSwitchItem(str().editor.channel, params.channelEnabled, params.onSetChannel)}
      `;
    } else if (key === "media") {
      cells = b2`
        ${renderSwitchItem(str().editor.mediaControls, params.mediaEnabled, params.onSetMedia)}
        ${params.isEditorX2 ? renderSwitchItem(str().editor.dvr, params.dvrEnabled, params.onSetDvr) : emptySlot}
      `;
    } else {
      cells = b2`
        ${renderSwitchItem(
        params.groupLabel(key),
        params.isGroupEnabled(key),
        (val) => params.onSetGroupEnabled(key, val)
      )}
        ${emptySlot}
      `;
    }
    return b2`
      <div class="sb-layout-row sb-layout-row-order">${cells}${moveControl(key, index)}</div>
    `;
  };
  const rowsHost = b2`
    <div class="sb-layout-rows">${params.visibleOrder.map(orderRow)}</div>
  `;
  const rows = params.sortableReady ? b2`
        <ha-sortable
          draggable-selector=".sb-layout-row-order"
          handle-selector=".sb-drag-handle"
          animation="180"
          @item-added=${containSortableEvent}
          @item-removed=${containSortableEvent}
          @drag-start=${containSortableEvent}
          @drag-end=${containSortableEvent}
          @item-moved=${(ev) => {
    containSortableEvent(ev);
    const oldIndex = Number(ev.detail?.oldIndex);
    const newIndex = Number(ev.detail?.newIndex);
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex)) return;
    params.onMoveGroupByVisibleIndex(oldIndex, newIndex);
  }}
        >
          ${rowsHost}
        </ha-sortable>
      ` : rowsHost;
  const body = b2`
    <div class="sb-layout-card">
      <div class="sb-layout-row">
        <div class="sb-layout-actions sb-layout-actions-full">${layoutSelect}</div>
      </div>
      <div class="sb-layout-note">${params.selectionNote}</div>
      ${rows}
      ${mfRow}
      <div class="sb-layout-footer">
        <button
          type="button"
          class="sb-reset-btn"
          @click=${(ev) => {
    stopEvent(ev);
    params.onResetGroupOrder();
  }}
        >
          ${params.selection === "default" ? str().editor.resetCardDefault : str().editor.resetDefaultLayout}
        </button>
      </div>
    </div>
  `;
  return renderEditorExpander({
    expanded: params.expanded,
    icon: "mdi:sort",
    title: str().editor.layoutOptions,
    onToggle: params.onToggleExpanded,
    body
  });
}

// custom_components/sofabaton_x1s/www/src/remote-card-editor-element.ts
var ENTITY_FORM_SCHEMA = [
  {
    name: "entity",
    selector: {
      entity: {
        filter: [
          { domain: "remote", integration: "sofabaton_x1s" },
          { domain: "remote", integration: "sofabaton_hub" }
        ]
      }
    },
    required: true
  }
];
var SofabatonRemoteCardEditor = class extends i4 {
  constructor() {
    super(...arguments);
    this._hass = null;
    this._config = { entity: "" };
    this._configInitialized = false;
    this._previewActivity = null;
    this._layoutSelection = "default";
    this._stylingExpanded = false;
    this._layoutExpanded = false;
    this._commandsExpanded = false;
    this._editorIntegrationDomain = null;
    this._editorIntegrationEntityId = null;
    this._editorIntegrationDetectingFor = null;
    this._sortableDefinePending = false;
  }
  // ---------- integration detection (x1s vs hub) ----------
  async _ensureEditorIntegration() {
    if (!this._hass?.callWS || !this._config?.entity) return;
    const entityId = String(this._config.entity);
    if (this._editorIntegrationEntityId === entityId && this._editorIntegrationDomain)
      return;
    if (this._editorIntegrationDetectingFor === entityId) return;
    this._editorIntegrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS({
        type: "config/entity_registry/get",
        entity_id: entityId
      });
      this._editorIntegrationDomain = String(entry?.platform || "");
      this._editorIntegrationEntityId = entityId;
    } catch (e6) {
      this._editorIntegrationDomain = null;
      this._editorIntegrationEntityId = entityId;
    } finally {
      this._editorIntegrationDetectingFor = null;
    }
    this.requestUpdate();
  }
  _isHubIntegrationForEditor() {
    return String(this._editorIntegrationDomain || "") === "sofabaton_hub";
  }
  _isEditorX2() {
    return isX2Hub(
      hubVersionFor(this._hass, this._config?.entity),
      this._isHubIntegrationForEditor()
    );
  }
  // ---------- HA wiring ----------
  set hass(hass) {
    this._hass = hass;
    setRemoteCardLanguage(
      hass?.locale?.language ?? hass?.language
    );
    const entityId = String(this._config?.entity || "").trim();
    if (entityId) {
      if (this._editorIntegrationEntityId !== entityId && this._editorIntegrationDetectingFor !== entityId) {
        void this._ensureEditorIntegration();
      }
    }
    this.requestUpdate();
  }
  get hass() {
    return this._hass;
  }
  setConfig(config) {
    const incomingConfig = { ...config || {} };
    const isInitialEditorConfig = !this._configInitialized;
    this._configInitialized = true;
    if ("preview_activity" in incomingConfig) {
      delete incomingConfig.preview_activity;
    }
    if (Object.prototype.hasOwnProperty.call(config, "preview_activity")) {
      this._previewActivity = String(config?.preview_activity ?? "");
      writePreviewActivity(config?.entity, this._previewActivity);
    } else if (this._previewActivity == null) {
      const cached = readPreviewActivity(config?.entity);
      this._previewActivity = cached ?? "";
    }
    if (isInitialEditorConfig) {
      this._layoutSelection = "default";
      this._previewActivity = "";
      writePreviewActivity(config?.entity, "");
      window.dispatchEvent(
        new CustomEvent("sofabaton-preview-activity", {
          detail: { entity: config?.entity, previewActivity: "" }
        })
      );
    }
    const nextEntity = String(incomingConfig?.entity || "");
    if (nextEntity !== String(this._editorIntegrationEntityId || "")) {
      this._editorIntegrationEntityId = null;
      this._editorIntegrationDomain = null;
      this._editorIntegrationDetectingFor = null;
    }
    if ("commands" in incomingConfig) delete incomingConfig.commands;
    const configUnchanged = !isInitialEditorConfig && JSON.stringify(this._config || {}) === JSON.stringify(incomingConfig);
    this._config = incomingConfig;
    if (configUnchanged) return;
    if (!isInitialEditorConfig) {
      this._syncLayoutSelectionWithPreview();
    }
    this.requestUpdate();
  }
  // ---------- config mutation plumbing ----------
  _fireChanged() {
    const finalConfig = { ...this._config };
    delete finalConfig.use_background_override;
    delete finalConfig.preview_activity;
    delete finalConfig.commands;
    this.dispatchEvent(
      new CustomEvent("config-changed", {
        detail: { config: finalConfig },
        bubbles: true,
        composed: true
      })
    );
  }
  /** Merge handler shared by the entity form and the styling form. */
  _mergeFormValue(value) {
    const newValue = { ...this._config, ...value };
    const entityChanged = newValue.entity !== this._config.entity;
    if (newValue.use_background_override === false) {
      delete newValue.background_override;
    }
    if (JSON.stringify(this._config) === JSON.stringify(newValue)) return;
    if (entityChanged) {
      const prevConfig = this._config;
      this._config = { ...prevConfig, entity: newValue.entity };
      this._layoutSelection = "default";
      this._setPreviewActivityForSelection("default");
      this._config = prevConfig;
      if (prevConfig?.entity) {
        writePreviewActivity(prevConfig.entity, "");
        window.dispatchEvent(
          new CustomEvent("sofabaton-preview-activity", {
            detail: { entity: prevConfig.entity, previewActivity: "" }
          })
        );
      }
    }
    this._config = newValue;
    this._fireChanged();
    this.requestUpdate();
  }
  _updateLayoutConfig(patch) {
    const selection = this._layoutSelectionKey();
    const { nextConfig } = applyLayoutConfigPatch(this._config, selection, patch);
    this._config = nextConfig;
    this._fireChanged();
    this.requestUpdate();
  }
  _setAutomationAssistEnabled(enabled) {
    this._config = { ...this._config, show_automation_assist: !!enabled };
    this._fireChanged();
    this.requestUpdate();
  }
  // ---------- layout selection / preview ----------
  _layoutSelectionKey() {
    return this._layoutSelection ?? "default";
  }
  _syncLayoutSelectionWithPreview() {
    const preview = this._previewActivity;
    if (preview == null || preview === "" || preview === "powered_off") {
      this._layoutSelection = "default";
      return;
    }
    this._layoutSelection = String(preview);
  }
  _setPreviewActivityForSelection(selection) {
    const nextPreview = selection === "default" ? "" : String(selection);
    if (this._previewActivity === nextPreview) return;
    this._previewActivity = nextPreview;
    writePreviewActivity(this._config?.entity, nextPreview);
    window.dispatchEvent(
      new CustomEvent("sofabaton-preview-activity", {
        detail: { entity: this._config?.entity, previewActivity: nextPreview }
      })
    );
  }
  _onSelectLayout(selection) {
    if (selection === this._layoutSelectionKey()) return;
    this._layoutSelection = selection;
    this._setPreviewActivityForSelection(selection);
    this.requestUpdate();
  }
  // ---------- group order ----------
  _isEditorGroupVisible(key, isEditorX2) {
    if (!isEditorX2 && key === "abc") return false;
    const asRows = mfAsRowsForEditor(this._config, this._layoutSelectionKey());
    if (key === "macro_favorites") return !asRows;
    if (key === "macros_row" || key === "favorites_row") return asRows;
    return true;
  }
  _moveGroupByVisibleIndex(fromVisible, toVisible) {
    const isEditorX2 = this._isEditorX2();
    const next = moveVisibleGroup(
      groupOrderListForEditor(this._config, this._layoutSelectionKey()),
      (key) => this._isEditorGroupVisible(key, isEditorX2),
      fromVisible,
      toVisible
    );
    if (next) this._updateLayoutConfig({ group_order: next });
  }
  _moveGroupByKey(groupKey, delta) {
    const isEditorX2 = this._isEditorX2();
    const order = groupOrderListForEditor(this._config, this._layoutSelectionKey());
    const visibleOrder = order.filter(
      (key) => this._isEditorGroupVisible(key, isEditorX2)
    );
    const fromVisible = visibleOrder.indexOf(String(groupKey));
    if (fromVisible < 0) return;
    const toVisible = fromVisible + Number(delta);
    if (toVisible < 0 || toVisible >= visibleOrder.length) return;
    const toKey = visibleOrder[toVisible];
    const from = order.indexOf(String(groupKey));
    const to = order.indexOf(toKey);
    if (from < 0 || to < 0) return;
    const next = order.slice();
    const tmp = next[from];
    next[from] = next[to];
    next[to] = tmp;
    this._updateLayoutConfig({ group_order: next });
  }
  _resetGroupOrder() {
    const selection = this._layoutSelectionKey();
    if (selection !== "default") {
      const next2 = { ...this._config };
      const layouts = { ...next2.layouts || {} };
      delete layouts[selection];
      if (Number.isFinite(Number(selection))) {
        delete layouts[String(Number(selection))];
      }
      if (Object.keys(layouts).length) {
        next2.layouts = layouts;
      } else {
        delete next2.layouts;
      }
      this._config = next2;
      this._fireChanged();
      this.requestUpdate();
      return;
    }
    const enabledDefaults = {
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_volume: true,
      show_channel: true,
      show_media: true,
      show_colors: true,
      show_abc: true,
      show_dvr: true,
      show_macros_button: true,
      show_favorites_button: true,
      mf_as_rows: false,
      mf_row_visible_rows: DEFAULT_ROW_VISIBLE_ROWS,
      group_order: DEFAULT_GROUP_ORDER.slice()
    };
    const next = { ...this._config };
    const defaultLayout = next.layouts?.default;
    if (defaultLayout && typeof defaultLayout === "object") {
      next.layouts = {
        ...next.layouts || {},
        default: { ...defaultLayout, ...enabledDefaults }
      };
    } else {
      Object.assign(next, enabledDefaults);
    }
    this._config = next;
    this._fireChanged();
    this.requestUpdate();
  }
  // ---------- render ----------
  render() {
    if (!this._hass) return A;
    const selection = this._layoutSelectionKey();
    const entityId = this._config?.entity;
    const activities = entityId && this._hass ? editorActivitiesFromState(this._hass?.states?.[entityId]) : [];
    const selectionOptions = [
      { value: "default", label: str().editor.defaultLayoutOption },
      ...activities.map((activity) => ({
        value: String(activity.id),
        label: activity.name
      }))
    ];
    if (!selectionOptions.some((option) => option.value === selection)) {
      this._layoutSelection = "default";
    }
    const isEditorX2 = this._isEditorX2();
    const layoutCfg = layoutConfigForSelection(this._config, this._layoutSelectionKey());
    const order = groupOrderListForEditor(this._config, this._layoutSelectionKey());
    const visibleOrder = order.filter(
      (key) => this._isEditorGroupVisible(key, isEditorX2)
    );
    const sortableReady = Boolean(customElements.get("ha-sortable"));
    if (!sortableReady && !this._sortableDefinePending) {
      this._sortableDefinePending = true;
      void customElements.whenDefined("ha-sortable").then(() => {
        this._sortableDefinePending = false;
        this.requestUpdate();
      });
    }
    const entityFormData = {
      ...this._config,
      entity: this._config.entity || "",
      theme: this._config.theme || "",
      // Maintain the toggle state correctly
      use_background_override: this._config.use_background_override ?? !!this._config.background_override,
      background_override: this._config.background_override ?? [255, 255, 255],
      max_width: this._config.max_width ?? 360,
      group_order: this._config.group_order ?? DEFAULT_GROUP_ORDER.slice(),
      show_automation_assist: this._config.show_automation_assist ?? false
    };
    return b2`
      <div style="padding: 12px 0;">
        <ha-form
          .hass=${this._hass}
          .schema=${ENTITY_FORM_SCHEMA}
          .data=${entityFormData}
          .computeLabel=${computeEditorFieldLabel}
          @value-changed=${(ev) => {
      ev.stopPropagation();
      this._mergeFormValue(ev.detail.value);
    }}
        ></ha-form>
      </div>
      <div class="sb-styling-wrap" style="padding: 0 0 12px 0;">
        ${renderStylingOptionsSection({
      hass: this._hass,
      config: this._config,
      expanded: this._stylingExpanded,
      onToggleExpanded: () => {
        this._stylingExpanded = !this._stylingExpanded;
        this.requestUpdate();
      },
      onValueChanged: (value) => this._mergeFormValue(value)
    })}
      </div>
      <div class="sb-layout-wrap" style="padding: 0 0 12px 0;">
        ${renderGroupOrderSection({
      hass: this._hass,
      expanded: this._layoutExpanded,
      selection: this._layoutSelectionKey(),
      selectionOptions,
      selectionNote: layoutSelectionNote(this._config, this._layoutSelectionKey()),
      visibleOrder,
      isEditorX2,
      asRows: mfAsRowsForEditor(this._config, this._layoutSelectionKey()),
      visibleRows: mfRowVisibleRowsForEditor(this._config, this._layoutSelectionKey()),
      sortableReady,
      macroEnabled: macrosButtonEnabled(layoutCfg),
      favoritesEnabled: favoritesButtonEnabled(layoutCfg),
      volumeEnabled: volumeGroupEnabled(layoutCfg),
      channelEnabled: channelGroupEnabled(layoutCfg),
      mediaEnabled: mediaGroupEnabled(layoutCfg),
      dvrEnabled: dvrGroupEnabled(layoutCfg),
      isGroupEnabled: (key) => isGroupEnabled(this._config, this._layoutSelectionKey(), key),
      groupLabel: (key) => groupLabel(key),
      onToggleExpanded: () => {
        this._layoutExpanded = !this._layoutExpanded;
        this.requestUpdate();
      },
      onSelectLayout: (value) => this._onSelectLayout(value),
      onSetMacro: (v3) => this._updateLayoutConfig(
        macroTogglePatch(this._config, this._layoutSelectionKey(), v3)
      ),
      onSetFavorites: (v3) => this._updateLayoutConfig(
        favoritesTogglePatch(this._config, this._layoutSelectionKey(), v3)
      ),
      onSetVolume: (v3) => this._updateLayoutConfig(
        volumeTogglePatch(this._config, this._layoutSelectionKey(), v3)
      ),
      onSetChannel: (v3) => this._updateLayoutConfig(
        channelTogglePatch(this._config, this._layoutSelectionKey(), v3)
      ),
      onSetMedia: (v3) => {
        const patch = groupEnabledPatch("media", v3);
        if (patch) this._updateLayoutConfig(patch);
      },
      onSetDvr: (v3) => this._updateLayoutConfig(dvrTogglePatch(v3)),
      onSetGroupEnabled: (key, v3) => {
        const patch = groupEnabledPatch(key, v3);
        if (patch) this._updateLayoutConfig(patch);
      },
      onSetMfAsRows: (v3) => this._updateLayoutConfig(mfAsRowsPatch(v3)),
      onSetMfRowVisibleRows: (v3) => this._updateLayoutConfig(mfRowVisibleRowsPatch(v3)),
      onMoveGroupByKey: (key, delta) => this._moveGroupByKey(key, delta),
      onMoveGroupByVisibleIndex: (from, to) => this._moveGroupByVisibleIndex(from, to),
      onResetGroupOrder: () => this._resetGroupOrder()
    })}
      </div>
      <div class="sb-commands-wrap">
        ${renderCommandsEditorSection({
      expanded: this._commandsExpanded,
      automationAssistEnabled: !!this._config.show_automation_assist,
      onToggleExpanded: () => {
        this._commandsExpanded = !this._commandsExpanded;
        this.requestUpdate();
      },
      onSetAutomationAssist: (enabled) => this._setAutomationAssistEnabled(enabled)
    })}
      </div>
    `;
  }
};
SofabatonRemoteCardEditor.styles = r(REMOTE_CARD_EDITOR_CSS);

// node_modules/lit-html/directives/repeat.js
var u5 = (e6, s7, t5) => {
  const r6 = /* @__PURE__ */ new Map();
  for (let l4 = s7; l4 <= t5; l4++) r6.set(e6[l4], l4);
  return r6;
};
var c6 = e4(class extends i6 {
  constructor(e6) {
    if (super(e6), e6.type !== t4.CHILD) throw Error("repeat() can only be used in text expressions");
  }
  dt(e6, s7, t5) {
    let r6;
    void 0 === t5 ? t5 = s7 : void 0 !== s7 && (r6 = s7);
    const l4 = [], o8 = [];
    let i7 = 0;
    for (const s8 of e6) l4[i7] = r6 ? r6(s8, i7) : i7, o8[i7] = t5(s8, i7), i7++;
    return { values: o8, keys: l4 };
  }
  render(e6, s7, t5) {
    return this.dt(e6, s7, t5).values;
  }
  update(s7, [t5, r6, c7]) {
    const d3 = M2(s7), { values: p4, keys: a4 } = this.dt(t5, r6, c7);
    if (!Array.isArray(d3)) return this.ut = a4, p4;
    const h6 = this.ut ?? (this.ut = []), v3 = [];
    let m3, y3, x2 = 0, j2 = d3.length - 1, k2 = 0, w2 = p4.length - 1;
    for (; x2 <= j2 && k2 <= w2; ) if (null === d3[x2]) x2++;
    else if (null === d3[j2]) j2--;
    else if (h6[x2] === a4[k2]) v3[k2] = u4(d3[x2], p4[k2]), x2++, k2++;
    else if (h6[j2] === a4[w2]) v3[w2] = u4(d3[j2], p4[w2]), j2--, w2--;
    else if (h6[x2] === a4[w2]) v3[w2] = u4(d3[x2], p4[w2]), v2(s7, v3[w2 + 1], d3[x2]), x2++, w2--;
    else if (h6[j2] === a4[k2]) v3[k2] = u4(d3[j2], p4[k2]), v2(s7, d3[x2], d3[j2]), j2--, k2++;
    else if (void 0 === m3 && (m3 = u5(a4, k2, w2), y3 = u5(h6, x2, j2)), m3.has(h6[x2])) if (m3.has(h6[j2])) {
      const e6 = y3.get(a4[k2]), t6 = void 0 !== e6 ? d3[e6] : null;
      if (null === t6) {
        const e7 = v2(s7, d3[x2]);
        u4(e7, p4[k2]), v3[k2] = e7;
      } else v3[k2] = u4(t6, p4[k2]), v2(s7, d3[x2], t6), d3[e6] = null;
      k2++;
    } else h3(d3[j2]), j2--;
    else h3(d3[x2]), x2++;
    for (; k2 <= w2; ) {
      const e6 = v2(s7, v3[w2 + 1]);
      u4(e6, p4[k2]), v3[k2++] = e6;
    }
    for (; x2 <= j2; ) {
      const e6 = d3[x2++];
      null !== e6 && h3(e6);
    }
    return this.ut = a4, p3(s7, v3), E;
  }
});

// custom_components/sofabaton_x1s/www/src/remote-card-ui-helpers.ts
function automationAssistLabelForKey(key, label) {
  const trimmed = String(label ?? "").trim();
  if (trimmed) return trimmed;
  const fallback = str().keys[String(key ?? "").toLowerCase()];
  if (fallback) return fallback;
  if (!key) return str().assist.buttonFallback;
  return String(key).replace(/[_-]+/g, " ").replace(/\b\w/g, (c7) => c7.toUpperCase());
}
function rgbToCss(rgb) {
  if (Array.isArray(rgb) && rgb.length >= 3) {
    const r6 = Number(rgb[0]);
    const g2 = Number(rgb[1]);
    const b3 = Number(rgb[2]);
    if ([r6, g2, b3].some((n7) => Number.isNaN(n7))) return "";
    return `rgb(${r6}, ${g2}, ${b3})`;
  }
  if (rgb && typeof rgb === "object" && rgb.r != null && rgb.g != null && rgb.b != null) {
    const r6 = Number(rgb.r);
    const g2 = Number(rgb.g);
    const b3 = Number(rgb.b);
    if ([r6, g2, b3].some((n7) => Number.isNaN(n7))) return "";
    return `rgb(${r6}, ${g2}, ${b3})`;
  }
  return "";
}

// custom_components/sofabaton_x1s/www/src/remote-card-runtime-display.ts
function midModeState({
  showVolume,
  showChannel,
  isX2
}) {
  const midMode = showVolume && showChannel ? "dual" : showVolume ? "volume" : showChannel ? "channel" : "off";
  return {
    midMode,
    classMap: {
      "mid--dual": midMode === "dual",
      "mid--volume": midMode === "volume",
      "mid--channel": midMode === "channel",
      "mid--x2": isX2,
      "mid--x1": !isX2
    }
  };
}
function mediaModeState({
  isX2,
  showMedia,
  showDvr
}) {
  const mediaMode = isX2 ? showMedia && showDvr ? "both" : showMedia ? "play" : showDvr ? "dvr" : "off" : showMedia || showDvr ? "play" : "off";
  return {
    mediaMode,
    classMap: {
      "media--play": mediaMode === "play",
      "media--dvr": mediaMode === "dvr",
      "media--both": mediaMode === "both",
      "media--x2": isX2,
      "media--x1": !isX2
    }
  };
}
function runtimeButtonVisibility({
  isX2,
  showVolume,
  showChannel,
  showMedia,
  showDvr
}) {
  const showPause = showDvr || !isX2 && showMedia;
  return {
    volup: showVolume,
    voldn: showVolume,
    mute: showVolume,
    guide: isX2 && showChannel,
    chup: showChannel,
    chdn: showChannel,
    rew: showMedia,
    play: showMedia && isX2,
    fwd: showMedia,
    dvr: isX2 && showDvr,
    pause: showPause,
    exit: isX2 && showDvr
  };
}
function macroFavoriteDisplayState({
  editMode,
  showMacrosButton,
  showFavoritesButton,
  macros,
  favorites,
  customFavorites,
  disableAllButtons
}) {
  const showMF = showMacrosButton || showFavoritesButton;
  const visibleCount = (showMacrosButton ? 1 : 0) + (showFavoritesButton ? 1 : 0);
  const macrosEnabled = editMode ? true : macros.length > 0;
  const favoritesEnabled2 = editMode ? true : favorites.length + customFavorites.length > 0;
  return {
    showMF,
    visibleCount,
    macrosDisabled: disableAllButtons || !macrosEnabled,
    favoritesDisabled: disableAllButtons || !favoritesEnabled2
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-drawer-display.ts
function drawerVisibilityState({
  activeDrawer,
  showMacrosButton,
  showFavoritesButton,
  editMode,
  macros,
  favorites,
  customFavorites,
  disableAllButtons
}) {
  const display = macroFavoriteDisplayState({
    editMode,
    showMacrosButton,
    showFavoritesButton,
    macros,
    favorites,
    customFavorites,
    disableAllButtons
  });
  let nextActiveDrawer = activeDrawer;
  if (!display.showMF && nextActiveDrawer) nextActiveDrawer = null;
  if (nextActiveDrawer === "macros" && !showMacrosButton) nextActiveDrawer = null;
  if (nextActiveDrawer === "favorites" && !showFavoritesButton) nextActiveDrawer = null;
  return {
    ...display,
    nextActiveDrawer,
    closedByVisibility: Boolean(activeDrawer && !nextActiveDrawer)
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-gestures.ts
function createPrimaryActionGate() {
  return { ts: 0, pointerId: null, type: null };
}
function primaryActionGateAllows(gate, ev, now) {
  const pid = ev && typeof ev.pointerId === "number" ? ev.pointerId : null;
  const etype = ev?.type || null;
  const delta = now - gate.ts;
  if (delta < 450) {
    return false;
  }
  if (delta < 1200 && (gate.type === "pointerup" || gate.type === "touchend") && (etype === "click" || etype === "ha-click" || etype === "tap")) {
    return false;
  }
  gate.ts = now;
  gate.pointerId = pid;
  gate.type = etype;
  return true;
}
function attachPrimaryAction(els, fn, options = {}) {
  const targets = (Array.isArray(els) ? els : [els]).filter(
    (el) => Boolean(el)
  );
  const gate = createPrimaryActionGate();
  const wrapped = (ev) => {
    if (!primaryActionGateAllows(gate, ev, Date.now())) return;
    if (typeof ev.preventDefault === "function") ev.preventDefault();
    if (typeof ev.stopPropagation === "function") ev.stopPropagation();
    if (typeof ev.stopImmediatePropagation === "function")
      ev.stopImmediatePropagation();
    try {
      options.fireHaptic?.();
      fn(ev);
    } catch (e6) {
    }
  };
  const hasPointer = typeof window !== "undefined" && "PointerEvent" in window;
  for (const el of targets) {
    if (hasPointer) {
      el.addEventListener("pointerup", wrapped, {
        capture: true,
        passive: false
      });
    } else {
      el.addEventListener("touchend", wrapped, {
        capture: true,
        passive: false
      });
      el.addEventListener("click", wrapped, { capture: true });
    }
    el.addEventListener("ha-click", wrapped, { capture: true });
  }
}
var DRAWER_MAX_HEIGHT = 350;
var DRAWER_DIRECTION_RESET_MS = 260;
function drawerDesiredHeight(scrollHeight, maxHeight = DRAWER_MAX_HEIGHT) {
  return Math.min(scrollHeight || 0, maxHeight) + 8;
}
function drawerDirection(input) {
  const { desired, rowTop, rowBottom, cardTop, cardBottom, viewportHeight } = input;
  if (cardTop == null || cardBottom == null) {
    const spaceBelow = viewportHeight - rowBottom;
    const spaceAbove = rowTop;
    const shouldOpenUp = spaceBelow < desired && spaceAbove > spaceBelow;
    return shouldOpenUp ? "up" : "down";
  }
  const spaceBelowInCard = cardBottom - rowBottom;
  const spaceAboveInCard = rowTop - cardTop;
  const overlapDown = Math.max(0, Math.min(desired, spaceBelowInCard));
  const overlapUp = Math.max(0, Math.min(desired, spaceAboveInCard));
  return overlapUp > overlapDown ? "up" : "down";
}
function layeringZIndexes(menuOpen, drawerOpen) {
  if (menuOpen) {
    return { activity: "10", drawer: drawerOpen ? "9" : "2" };
  }
  if (drawerOpen) {
    return { activity: "2", drawer: "10" };
  }
  return { activity: "3", drawer: "2" };
}

// custom_components/sofabaton_x1s/www/src/remote-card-state.ts
function hasOwn(obj, key) {
  return obj != null && Object.prototype.hasOwnProperty.call(obj, key);
}
function currentActivityIdFromRemote(remoteState) {
  const activityId = remoteState?.attributes?.current_activity_id;
  if (activityId != null) return Number(activityId);
  return null;
}
function normalizeActivities(source) {
  return (Array.isArray(source) ? source : []).map((activity) => ({
    id: Number(activity?.id),
    name: String(activity?.name ?? ""),
    state: String(activity?.state ?? "")
  })).filter((activity) => Number.isFinite(activity.id) && activity.name);
}
function activitiesFromRemote(remoteState, isHubIntegration, hubActivitiesCache) {
  const list = remoteState?.attributes?.activities;
  const source = Array.isArray(list) && list.length ? list : isHubIntegration && Array.isArray(hubActivitiesCache) ? hubActivitiesCache : [];
  return {
    activities: normalizeActivities(source),
    nextHubActivitiesCache: isHubIntegration && Array.isArray(list) && list.length ? list : hubActivitiesCache
  };
}
function activityNameForId(activities, activityId) {
  if (activityId == null) return "";
  const id = Number(activityId);
  if (!Number.isFinite(id)) return "";
  const match = Array.isArray(activities) ? activities.find((activity) => activity.id === id) : null;
  return match?.name || "";
}
function currentActivityLabelFromRemote(remoteState, activities) {
  const remoteActivity = remoteState?.attributes?.current_activity;
  if (remoteActivity) return String(remoteActivity);
  const activityId = currentActivityIdFromRemote(remoteState);
  return activityNameForId(activities, activityId);
}
function previewSelection(editMode, previewActivity, activities) {
  if (!editMode) return null;
  const selection = previewActivity;
  if (selection == null || selection === "") {
    return {
      activityId: null,
      label: str().card.defaultLayout,
      poweredOff: false
    };
  }
  if (selection === "powered_off") {
    return {
      activityId: null,
      label: str().card.poweredOff,
      poweredOff: true
    };
  }
  const id = Number(selection);
  if (!Number.isFinite(id)) return null;
  return {
    activityId: id,
    label: activityNameForId(activities, id),
    poweredOff: false
  };
}
function isPoweredOffLabel(state) {
  const s7 = String(state || "").trim().toLowerCase();
  return POWERED_OFF_LABELS.has(s7) || isLocalizedPoweredOffLabel(s7);
}
function isActivityOn(activityId, activities, currentActivityLabel) {
  if (activityId == null) return false;
  const id = Number(activityId);
  if (!Number.isFinite(id)) return false;
  const match = Array.isArray(activities) ? activities.find((activity) => Number(activity?.id) === id) : null;
  if (match && match.state != null && String(match.state).trim() !== "") {
    const s7 = String(match.state).trim().toLowerCase();
    return !isPoweredOffLabel(s7) && s7 !== "off";
  }
  return Boolean(currentActivityLabel) && !isPoweredOffLabel(currentActivityLabel);
}
function enabledButtonsSignature(raw) {
  if (!Array.isArray(raw)) return String(raw ?? "");
  return `${raw.length}:${raw.map((entry) => String(entry ?? "")).join(",")}`;
}
function resolveHubActivityData({
  isHubIntegration,
  activityId,
  assignedKeys,
  macroKeys,
  favoriteKeys,
  hubAssignedKeysCache,
  hubMacrosCache,
  hubFavoritesCache
}) {
  const nextAssignedCache = { ...hubAssignedKeysCache || {} };
  const nextMacrosCache = { ...hubMacrosCache || {} };
  const nextFavoritesCache = { ...hubFavoritesCache || {} };
  const actKey = activityId != null ? String(activityId) : null;
  const assignedMap = assignedKeys && typeof assignedKeys === "object" ? assignedKeys : null;
  const macroMap = macroKeys && typeof macroKeys === "object" ? macroKeys : null;
  const favoriteMap = favoriteKeys && typeof favoriteKeys === "object" ? favoriteKeys : null;
  if (isHubIntegration && actKey != null) {
    if (assignedMap && (hasOwn(assignedMap, actKey) || hasOwn(assignedMap, activityId))) {
      const v3 = assignedMap[actKey] ?? assignedMap[activityId];
      nextAssignedCache[actKey] = Array.isArray(v3) ? v3 : [];
    }
    if (macroMap && (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId))) {
      const v3 = macroMap[actKey] ?? macroMap[activityId];
      nextMacrosCache[actKey] = Array.isArray(v3) ? v3 : [];
    }
    if (favoriteMap && (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId))) {
      const v3 = favoriteMap[actKey] ?? favoriteMap[activityId];
      nextFavoritesCache[actKey] = Array.isArray(v3) ? v3 : [];
    }
  }
  const macros = macroMap && actKey != null && (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId)) ? macroMap[actKey] ?? macroMap[activityId] ?? [] : isHubIntegration && actKey != null ? nextMacrosCache[actKey] ?? [] : [];
  const favorites = favoriteMap && actKey != null && (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId)) ? favoriteMap[actKey] ?? favoriteMap[activityId] ?? [] : isHubIntegration && actKey != null ? nextFavoritesCache[actKey] ?? [] : [];
  const rawAssignedKeys = assignedMap && actKey != null && (hasOwn(assignedMap, actKey) || hasOwn(assignedMap, activityId)) ? assignedMap[actKey] ?? assignedMap[activityId] ?? null : isHubIntegration && actKey != null ? nextAssignedCache[actKey] ?? null : null;
  return {
    actKey,
    assignedMap,
    macroMap,
    favoriteMap,
    hubAssignedKeysCache: nextAssignedCache,
    hubMacrosCache: nextMacrosCache,
    hubFavoritesCache: nextFavoritesCache,
    macros,
    favorites,
    rawAssignedKeys
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-activity-state.ts
function buildActivitySelectState({
  editMode,
  preview,
  activities,
  currentActivityLabel,
  pendingActivity,
  pendingExpired
}) {
  const options = [
    ...editMode ? [str().card.defaultLayout] : [],
    str().card.poweredOff,
    ...activities.map((activity) => activity.name)
  ];
  const previewLabel = preview ? preview.poweredOff ? str().card.poweredOff : preview.label || str().card.activityFallback(preview.activityId) : null;
  if (previewLabel && !options.includes(previewLabel)) {
    options.push(previewLabel);
  }
  const current = previewLabel || currentActivityLabel || str().card.poweredOff;
  const poweredOff = preview ? preview.poweredOff : isPoweredOffLabel(current);
  const resolvedValue = pendingActivity && !pendingExpired && pendingActivity !== current ? pendingActivity : current;
  const disabled = editMode || (preview ? true : options.length <= 1);
  return {
    options,
    previewLabel,
    current,
    poweredOff,
    resolvedValue,
    disabled,
    clearPending: Boolean(pendingActivity && (pendingExpired || current === pendingActivity))
  };
}
function noActivitiesWarning(isUnavailable, activitiesLength, loadState) {
  if (!isUnavailable && activitiesLength === 0 && loadState !== "loading") {
    return str().card.noActivitiesWarning;
  }
  return "";
}

// custom_components/sofabaton_x1s/www/src/remote-card-hub.ts
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
function initHubRuntimeState(requestSeen, queue) {
  return {
    requestSeen: requestSeen || {},
    queue: Array.isArray(queue) ? queue : []
  };
}
function markHubRequested(requestSeen, key) {
  if (!key) return requestSeen;
  requestSeen[key] = true;
  return requestSeen;
}
function wasHubRequested(requestSeen, key) {
  return Boolean(key && requestSeen[key]);
}
function enqueueHubCommand(queue, list, { priority = false, gapMs = 150 } = {}) {
  const item = { list, gapMs: Number(gapMs) };
  if (priority) {
    queue.unshift(item);
  } else {
    queue.push(item);
  }
  return queue;
}
function throttleHubRequest(cache, key, minIntervalMs = 3e3, now = Date.now()) {
  const last = cache[key] || 0;
  if (now - last < minIntervalMs) return false;
  cache[key] = now;
  return true;
}
function basicDataRequestKey(entityId) {
  return `req:basic:${entityId}`;
}
function requestBasicDataCommand() {
  return ["type:request_basic_data"];
}
function requestAssignedKeysCommand(activityId) {
  if (activityId == null) return null;
  return ["type:request_assigned_keys", `activity_id:${Number(activityId)}`];
}
function requestFavoriteKeysCommand(activityId) {
  if (activityId == null) return null;
  return ["type:request_favorite_keys", `activity_id:${Number(activityId)}`];
}
function requestMacroKeysCommand(activityId) {
  if (activityId == null) return null;
  return ["type:request_macro_keys", `activity_id:${Number(activityId)}`];
}
function startActivityCommand(activityId) {
  if (activityId == null) return null;
  return ["type:start_activity", `activity_id:${Number(activityId)}`];
}
function stopActivityCommand(activityId) {
  if (activityId == null) return null;
  return ["type:stop_activity", `activity_id:${Number(activityId)}`];
}

// custom_components/sofabaton_x1s/www/src/remote-card-actions.ts
function hubAssignedKeyCommand(activityId, commandId) {
  const activity = Number(activityId);
  const key = Number(commandId);
  if (!Number.isFinite(activity) || !Number.isFinite(key)) return null;
  return [
    "type:send_assigned_key",
    `activity_id:${activity}`,
    `key_id:${key}`
  ];
}
function hubMacroKeyCommand(activityId, commandId) {
  const activity = Number(activityId);
  const key = Number(commandId);
  if (!Number.isFinite(activity) || !Number.isFinite(key)) return null;
  return [
    "type:send_macro_key",
    `activity_id:${activity}`,
    `key_id:${key}`
  ];
}
function hubFavoriteKeyCommand(deviceId, commandId) {
  const device = Number(deviceId);
  const key = Number(commandId);
  if (!Number.isFinite(device) || !Number.isFinite(key)) return null;
  return [
    "type:send_favorite_key",
    `device_id:${device}`,
    `key_id:${key}`
  ];
}
function remoteSendCommandData(entityId, commandId, deviceId) {
  const command = Number(commandId);
  const device = Number(deviceId);
  if (!entityId || !Number.isFinite(command) || !Number.isFinite(device)) return null;
  return {
    entity_id: entityId,
    command,
    device
  };
}

// custom_components/sofabaton_x1s/www/src/remote-card-editor-helpers.ts
function normalizeCustomFavorite(item, idx = 0) {
  if (!item || typeof item !== "object") return null;
  const name = String(item.name ?? item.label ?? "").trim();
  if (!name) return null;
  const icon = item.icon != null && String(item.icon).trim() ? String(item.icon).trim() : null;
  const action = item.action && typeof item.action === "object" ? item.action : item.tap_action && typeof item.tap_action === "object" ? item.tap_action : null;
  const rawCmd = item.command_id ?? item.key_id ?? item.command ?? item.key ?? item.id ?? null;
  const rawDev = item.device_id ?? item.activity_id ?? item.device ?? item.activity ?? null;
  const cmd = rawCmd != null ? Number(rawCmd) : null;
  const dev = rawDev != null ? Number(rawDev) : null;
  const hasIds = Number.isFinite(cmd) && (rawDev == null || Number.isFinite(dev));
  const hasAction = !!(action && (action.action || action.service || action.perform_action || action.navigation_path || action.url_path));
  if (!hasIds && !hasAction) return null;
  return {
    __custom: true,
    name,
    icon,
    action: hasAction ? action : null,
    command_id: Number.isFinite(cmd) ? cmd : null,
    device_id: Number.isFinite(dev) ? dev : null,
    _idx: idx,
    _raw: item
  };
}
function customFavoritesSignature(items) {
  const list = Array.isArray(items) ? items : [];
  const parts = list.map((it) => {
    const n7 = String(it?.name ?? "");
    const ic = String(it?.icon ?? "");
    const cmd = String(it?.command_id ?? "");
    const dev = String(it?.device_id ?? "");
    let act = "";
    try {
      act = it?.action ? JSON.stringify(it.action) : "";
    } catch (e6) {
      act = "[unserializable]";
    }
    return `${n7}|${ic}|${cmd}|${dev}|${act}`;
  });
  return `${parts.length}:${parts.join(";;")}`;
}

// custom_components/sofabaton_x1s/www/src/state/remote-card-store.ts
function normalizeRemoteCardConfig(config) {
  return {
    show_activity: true,
    show_dpad: true,
    show_nav: true,
    show_mid: true,
    show_volume: true,
    show_channel: true,
    show_media: true,
    show_dvr: true,
    show_colors: true,
    show_abc: true,
    theme: "",
    background_override: null,
    show_automation_assist: false,
    show_macros_button: null,
    show_favorites_button: null,
    custom_favorites: [],
    max_width: 360,
    // Shrink the entire card using CSS `zoom` (0 = no shrink, higher = smaller)
    shrink: 0,
    group_order: DEFAULT_GROUP_ORDER.slice(),
    ...config
  };
}
var RemoteCardStore = class {
  constructor(onChange, host) {
    this._hass = null;
    this._config = null;
    this._editMode = false;
    this.previewActivity = null;
    // Integration detection (x1s vs hub)
    this.integrationDomain = null;
    this.integrationEntityId = null;
    this.integrationDetectingFor = null;
    // Hub request queue (prevents parallel requests)
    this.hubRequestSeen = null;
    this.hubQueue = null;
    this.hubQueueBusy = false;
    this.hubRequestCache = null;
    // Hub/X2 attribute caches (attributes may drop while switching)
    this.hubActivitiesCache = null;
    this.hubAssignedKeysCache = null;
    this.hubMacrosCache = null;
    this.hubFavoritesCache = null;
    this.x2LastFetchedActivityId = null;
    // Enabled-buttons cache
    this.enabledButtonsCache = [];
    this.enabledButtonsCacheKey = null;
    this.enabledButtonsInvalid = false;
    // Activity switching / load indicator
    this.pendingActivity = null;
    this.pendingActivityAt = null;
    this.activityLoadActive = false;
    this.activityLoadTarget = null;
    this.activityLoadTimeout = null;
    this.commandPulseUntil = 0;
    this.commandPulseTimeout = null;
    // Preview state resolved during the last derivation
    this.previewState = null;
    // Drawer / menu UI state (direction math stays in the element)
    this.activeDrawer = null;
    this.activityMenuOpen = false;
    // Update gating
    this.lastUpdateFingerprint = null;
    this.onChange = onChange;
    this.host = host;
  }
  // ---------- core wiring ----------
  get hass() {
    return this._hass;
  }
  get config() {
    return this._config;
  }
  get editMode() {
    return this._editMode;
  }
  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error(str().card.selectEntityError);
    }
    if (Object.prototype.hasOwnProperty.call(config, "preview_activity")) {
      this.previewActivity = String(config?.preview_activity ?? "");
      writePreviewActivity(config?.entity, this.previewActivity);
    } else if (this.previewActivity == null) {
      const cached = readPreviewActivity(config?.entity);
      this.previewActivity = cached ?? "";
    }
    this._config = normalizeRemoteCardConfig(config);
    this.activeDrawer = null;
    this.activityMenuOpen = false;
    this.invalidateFingerprint();
    this.onChange();
  }
  setHass(hass) {
    this._hass = hass;
    void this.ensureIntegration().then(() => {
      if (!this.shouldNotifyForHass(hass)) return;
      this.onChange();
    });
  }
  setEditMode(value) {
    this._editMode = !!value;
    this.invalidateFingerprint();
    this.onChange();
  }
  setPreviewActivity(value) {
    this.previewActivity = value ?? "";
    this.invalidateFingerprint();
  }
  connected() {
  }
  disconnected() {
    if (this.commandPulseTimeout) clearTimeout(this.commandPulseTimeout);
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
  }
  // ---------- update gating ----------
  invalidateFingerprint() {
    this.lastUpdateFingerprint = null;
  }
  shouldNotifyForHass(hass) {
    const nextFingerprint = this.updateFingerprint(hass);
    if (nextFingerprint === this.lastUpdateFingerprint) return false;
    this.lastUpdateFingerprint = nextFingerprint;
    return true;
  }
  updateFingerprint(hass = this._hass) {
    const entityId = String(this._config?.entity || "");
    const remote = entityId ? hass?.states?.[entityId] : null;
    const attrs = remote?.attributes || {};
    const themeName = String(this._config?.theme || "");
    const themes = hass?.themes;
    const themeDef = themeName ? themes?.themes?.[themeName] : null;
    const themeMode = themes?.darkMode ? "dark" : "light";
    return [
      entityId,
      String(remote?.state ?? ""),
      String(attrs?.current_activity_id ?? ""),
      String(attrs?.current_activity ?? ""),
      String(attrs?.load_state ?? ""),
      String(attrs?.hub_version ?? ""),
      stableJsonSignature(attrs?.activities),
      stableJsonSignature(attrs?.assigned_keys),
      stableJsonSignature(attrs?.macro_keys),
      stableJsonSignature(attrs?.favorite_keys),
      stableJsonSignature(this._config?.background_override),
      themeName,
      themeMode,
      stableJsonSignature(themeDef),
      this._editMode ? "1" : "0",
      String(this.previewActivity ?? ""),
      this.integrationDomain || ""
    ].join("|");
  }
  // ---------- integration detection ----------
  async ensureIntegration() {
    if (!this._hass?.callWS || !this._config?.entity) return;
    const entityId = String(this._config.entity);
    if (this.integrationEntityId && this.integrationEntityId !== entityId) {
      this.hubRequestCache = null;
      this.hubRequestSeen = null;
      this.hubQueue = null;
      this.hubQueueBusy = false;
      this.hubActivitiesCache = null;
      this.hubAssignedKeysCache = null;
      this.hubMacrosCache = null;
      this.hubFavoritesCache = null;
      this.x2LastFetchedActivityId = null;
    }
    if (this.integrationEntityId === entityId && this.integrationDomain) return;
    if (this.integrationDetectingFor === entityId) return;
    this.integrationDetectingFor = entityId;
    try {
      const entry = await this._hass.callWS({
        type: "config/entity_registry/get",
        entity_id: entityId
      });
      this.integrationDomain = String(entry?.platform || "");
      this.integrationEntityId = entityId;
    } catch (e6) {
      this.integrationDomain = null;
      this.integrationEntityId = entityId;
    } finally {
      this.integrationDetectingFor = null;
      this.invalidateFingerprint();
    }
  }
  isHubIntegration() {
    return String(this.integrationDomain || "") === "sofabaton_hub";
  }
  hubVersion() {
    return hubVersionFor(this._hass, this._config?.entity);
  }
  isX2() {
    return isX2Hub(this.hubVersion(), this.isHubIntegration());
  }
  supportsUnicodeCommandNames() {
    return supportsUnicodeCommandNames(this.hubVersion(), this.isHubIntegration());
  }
  // ---------- basic state helpers ----------
  remoteState() {
    return this._hass?.states?.[String(this._config?.entity ?? "")];
  }
  currentActivityId() {
    return currentActivityIdFromRemote(this.remoteState());
  }
  activities() {
    const { activities, nextHubActivitiesCache } = activitiesFromRemote(
      this.remoteState(),
      this.isHubIntegration(),
      this.hubActivitiesCache
    );
    this.hubActivitiesCache = nextHubActivitiesCache;
    return activities;
  }
  currentActivityLabel() {
    return currentActivityLabelFromRemote(this.remoteState(), this.activities());
  }
  activityNameForId(activityId) {
    return activityNameForId(this.activities(), activityId) ?? null;
  }
  previewSelectionState(activities) {
    return previewSelection(
      this._editMode,
      this.previewActivity,
      Array.isArray(activities) ? activities : this.activities()
    );
  }
  effectiveActivityId() {
    if (this.previewState) return this.previewState.activityId;
    return this.currentActivityId();
  }
  isActivityOn(activityId, activities) {
    return isActivityOn(
      activityId,
      Array.isArray(activities) ? activities : this.activities(),
      this.currentActivityLabel()
    );
  }
  // ---------- layout / capability gating ----------
  layoutConfig(activityId = this.effectiveActivityId()) {
    return layoutConfigForActivity(this._config, activityId);
  }
  groupOrderList(activityId = null) {
    const layout = layoutConfigForActivity(
      this._config,
      activityId ?? this.effectiveActivityId()
    );
    return normalizedGroupOrder(layout?.group_order);
  }
  layoutSignature(activityId, layoutConfig) {
    const order = this.groupOrderList(activityId);
    const parts = [
      `activity:${activityId ?? "off"}`,
      `order:${order.join(",")}`
    ];
    for (const key of LAYOUT_KEYS) {
      if (key === "group_order") continue;
      parts.push(`${key}:${String(layoutConfig?.[key])}`);
    }
    return parts.join("|");
  }
  showMacrosButton() {
    return macrosButtonEnabled(this.layoutConfig());
  }
  showFavoritesButton() {
    return favoritesButtonEnabled(this.layoutConfig());
  }
  customFavorites() {
    const arr = this._config?.custom_favorites;
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (let i7 = 0; i7 < arr.length; i7++) {
      const norm = normalizeCustomFavorite(arr[i7], i7);
      if (norm) out.push(norm);
    }
    return out;
  }
  customFavoritesSignature(items) {
    return customFavoritesSignature(items);
  }
  automationAssistEnabled() {
    return Boolean(this._config?.show_automation_assist);
  }
  // ---------- enabled buttons ----------
  enabledButtons() {
    return this.enabledButtonsCache || [];
  }
  isEnabled(id) {
    const enabled = this.enabledButtons();
    if (this.enabledButtonsInvalid) return true;
    if (!enabled.length) return true;
    return enabled.some((entry) => entry.command === Number(id));
  }
  commandTarget(id) {
    const enabled = this.enabledButtons();
    const match = enabled.find((entry) => entry.command === Number(id));
    return match || null;
  }
  resolveCommandDeviceId(commandId, deviceId = null) {
    const resolved = deviceId != null ? Number(deviceId) : this.commandTarget(commandId)?.activity_id ?? this.currentActivityId();
    if (resolved == null || !Number.isFinite(Number(resolved))) return null;
    return Number(resolved);
  }
  // ---------- load indicator ----------
  /** The narrow activity-switch flag (excludes the command pulse). */
  activityLoadingActive() {
    return this.activityLoadActive;
  }
  isLoadingActive() {
    const isActivityLoading = Boolean(this.activityLoadActive);
    const isPulse = this.commandPulseUntil && Date.now() < this.commandPulseUntil;
    return isActivityLoading || Boolean(isPulse);
  }
  triggerCommandPulse() {
    this.commandPulseUntil = Date.now() + 1e3;
    this.onChange();
    if (this.commandPulseTimeout) clearTimeout(this.commandPulseTimeout);
    this.commandPulseTimeout = setTimeout(() => {
      this.onChange();
    }, 1e3);
  }
  startActivityLoading(target) {
    this.activityLoadTarget = String(target ?? "");
    this.activityLoadActive = true;
    this.onChange();
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
    this.activityLoadTimeout = setTimeout(() => {
      if (this.activityLoadActive) {
        this.activityLoadActive = false;
        this.onChange();
      }
    }, 6e4);
  }
  stopActivityLoading() {
    if (!this.activityLoadActive) return;
    this.activityLoadActive = false;
    this.activityLoadTarget = null;
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
    this.onChange();
  }
  // ---------- hub request queue ----------
  hubInitState() {
    const next = initHubRuntimeState(this.hubRequestSeen, this.hubQueue);
    this.hubRequestSeen = next.requestSeen;
    this.hubQueue = next.queue;
  }
  hubQueueIdle() {
    const queue = Array.isArray(this.hubQueue) ? this.hubQueue.length : 0;
    return !this.hubQueueBusy && queue === 0;
  }
  hubEnqueueCommand(list, { priority = false, gapMs = 150 } = {}) {
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this.hubInitState();
    this.hubQueue = enqueueHubCommand(this.hubQueue, list, { priority, gapMs });
    this.hubDrainQueue().catch(() => {
    });
  }
  hubEnqueueRequest(list, requestKey) {
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this.hubInitState();
    if (requestKey && wasHubRequested(this.hubRequestSeen, requestKey)) return;
    if (requestKey) {
      this.hubRequestSeen = markHubRequested(this.hubRequestSeen, requestKey);
    }
    this.hubEnqueueCommand(list, { priority: false, gapMs: 3e3 });
  }
  async hubDrainQueue() {
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this.hubInitState();
    if (this.hubQueueBusy) return;
    this.hubQueueBusy = true;
    try {
      while (this.hubQueue.length) {
        const next = this.hubQueue.shift();
        if (!next?.list) continue;
        await this.callService("remote", "send_command", {
          entity_id: this._config.entity,
          command: next.list
        });
        const gap = Number.isFinite(Number(next?.gapMs)) ? Number(next.gapMs) : 750;
        await sleep(gap);
      }
    } finally {
      this.hubQueueBusy = false;
      this.host.onHubQueueDrained?.();
    }
  }
  hubThrottle(key, minIntervalMs = 3e3) {
    this.hubRequestCache = this.hubRequestCache || {};
    return throttleHubRequest(this.hubRequestCache, key, minIntervalMs);
  }
  async hubSendCommandList(list, throttleKey = null, minIntervalMs = 3e3) {
    if (this._editMode) return;
    if (!this.isHubIntegration()) return;
    if (!this._hass || !this._config?.entity) return;
    this.hubInitState();
    if (throttleKey) {
      if (!this.hubThrottle(throttleKey, minIntervalMs)) return;
    }
    if (this.hubQueueBusy || Array.isArray(this.hubQueue) && this.hubQueue.length) {
      this.hubEnqueueCommand(list, { priority: true, gapMs: 150 });
      return;
    }
    await this.callService("remote", "send_command", {
      entity_id: this._config.entity,
      command: list
    });
  }
  hubRequestBasicData() {
    const entityId = String(this._config?.entity || "");
    this.hubEnqueueRequest(requestBasicDataCommand(), basicDataRequestKey(entityId));
  }
  hubRequestAssignedKeys(activityId) {
    const command = requestAssignedKeysCommand(activityId);
    if (!command) return;
    this.hubEnqueueCommand(command, { priority: false, gapMs: 3e3 });
  }
  hubRequestFavoriteKeys(activityId) {
    const command = requestFavoriteKeysCommand(activityId);
    if (!command) return;
    this.hubEnqueueCommand(command, { priority: false, gapMs: 3e3 });
  }
  hubRequestMacroKeys(activityId) {
    const command = requestMacroKeysCommand(activityId);
    if (!command) return;
    this.hubEnqueueCommand(command, { priority: false, gapMs: 3e3 });
  }
  async hubStartActivity(activityId) {
    const command = startActivityCommand(activityId);
    if (!command) return;
    await this.hubSendCommandList(command);
  }
  async hubStopActivity(activityId) {
    const command = stopActivityCommand(activityId);
    if (!command) return;
    await this.hubSendCommandList(command);
  }
  // ---------- actions ----------
  async callService(domain, service, data, target = void 0) {
    await this._hass.callService(domain, service, data, target);
  }
  async runLovelaceAction(actionConfig, context = null) {
    if (this._editMode) return;
    if (!actionConfig || typeof actionConfig !== "object") return;
    const action = String(actionConfig.action || "").toLowerCase();
    const implicitService = (!action || action === "default") && (actionConfig.service || actionConfig.perform_action);
    if (action === "none") return;
    if (action === "call-service" || action === "perform-action" || implicitService) {
      const svc = String(actionConfig.service || actionConfig.perform_action || "").trim();
      if (!svc.includes(".")) return;
      const [domain, service] = svc.split(".", 2);
      const serviceData = {
        ...actionConfig.service_data || actionConfig.data || {}
      };
      const target = actionConfig.target && typeof actionConfig.target === "object" ? actionConfig.target : void 0;
      await this.callService(domain, service, serviceData, target);
      return;
    }
    if (action === "toggle") {
      const entityId = actionConfig.entity_id || actionConfig.entity || context?.entity_id || context?.entityId;
      if (!entityId) return;
      await this.callService("homeassistant", "toggle", { entity_id: entityId });
      return;
    }
    if (action === "more-info") {
      const entityId = actionConfig.entity_id || actionConfig.entity || context?.entity_id || context?.entityId;
      if (!entityId) return;
      this.host.fireEvent("hass-more-info", { entityId });
      return;
    }
    if (action === "navigate") {
      const path = actionConfig.navigation_path;
      if (!path) return;
      history.pushState(null, "", String(path));
      window.dispatchEvent(
        new Event("location-changed", { bubbles: true, composed: true })
      );
      return;
    }
    if (action === "url") {
      const url = actionConfig.url_path;
      if (!url) return;
      window.open(String(url), "_blank");
      return;
    }
    if (action === "fire-dom-event") {
      this.host.fireEvent("ll-custom", actionConfig);
      return;
    }
  }
  async sendCommand(commandId, deviceId = null) {
    if (this._editMode) return;
    if (!this._hass || !this._config?.entity) return;
    const resolvedDevice = this.resolveCommandDeviceId(commandId, deviceId);
    if (this.isHubIntegration()) {
      const command = hubAssignedKeyCommand(resolvedDevice, commandId);
      if (!command) return;
      await this.hubSendCommandList(command);
      return;
    }
    const serviceData = remoteSendCommandData(this._config.entity, commandId, resolvedDevice);
    if (!serviceData) return;
    await this.callService("remote", "send_command", serviceData);
  }
  async sendDrawerItem(itemType, commandId, deviceId, rawItem) {
    if (this._editMode) return;
    if (!this.isHubIntegration()) {
      return this.sendCommand(commandId, deviceId);
    }
    if (!this._hass || !this._config?.entity) return;
    const activityId = Number(deviceId ?? this.currentActivityId());
    const keyId = Number(commandId);
    if (!Number.isFinite(keyId)) return;
    if (itemType === "macros") {
      const command2 = hubMacroKeyCommand(activityId, keyId);
      if (!command2) return;
      return this.hubSendCommandList(command2);
    }
    if (itemType === "favorites") {
      const device = Number(rawItem?.device_id ?? rawItem?.device);
      const command2 = hubFavoriteKeyCommand(device, keyId);
      if (!command2) return;
      return this.hubSendCommandList(command2);
    }
    const command = hubAssignedKeyCommand(activityId, keyId);
    if (!command) return;
    return this.hubSendCommandList(command);
  }
  async sendCustomFavoriteCommand(commandId, deviceId) {
    if (this._editMode) return;
    if (!this._hass || !this._config?.entity) return;
    const cmd = Number(commandId);
    const dev = Number(deviceId);
    if (!Number.isFinite(cmd) || !Number.isFinite(dev)) return;
    if (this.isHubIntegration()) {
      const command = hubFavoriteKeyCommand(dev, cmd);
      if (!command) return;
      await this.hubSendCommandList(command);
      return;
    }
    const serviceData = remoteSendCommandData(this._config.entity, cmd, dev);
    if (!serviceData) return;
    await this.callService("remote", "send_command", serviceData);
  }
  async setActivity(option) {
    if (this._editMode) return;
    if (option == null || option === "") return;
    const selected = String(option);
    const current = this.currentActivityLabel();
    if (selected === current) return;
    this.pendingActivity = selected;
    this.pendingActivityAt = Date.now();
    this.startActivityLoading(selected);
    if (this.isHubIntegration()) {
      if (isPoweredOffLabel(selected)) {
        const currentId = this.currentActivityId();
        if (currentId != null) {
          await this.hubStopActivity(currentId);
        }
        return;
      }
      const match = this.activities().find((a4) => a4.name === selected);
      const activityId = match?.id;
      if (activityId == null) return;
      await this.hubStartActivity(activityId);
      return;
    }
    if (isPoweredOffLabel(selected)) {
      await this.callService("remote", "turn_off", {
        entity_id: this._config.entity
      });
      return;
    }
    await this.callService("remote", "turn_on", {
      entity_id: this._config.entity,
      activity: selected
    });
  }
  // ---------- runtime derivation (the state half of the legacy _update) ----------
  /**
   * Resolve everything the render needs for the current hass/config state,
   * updating the hub caches, firing the on-demand hub fetches, refreshing the
   * enabled-buttons cache, and settling pending-activity bookkeeping — the
   * exact sequence the legacy _update() ran before touching the DOM.
   */
  deriveRuntimeState() {
    const remote = this.remoteState();
    const activities = this.activities();
    const preview = this.previewSelectionState(activities);
    this.previewState = preview;
    const activityId = preview ? preview.activityId : this.currentActivityId();
    const layoutConfig = layoutConfigForActivity(this._config, activityId);
    const isUnavailable = remote?.state === "unavailable";
    const attrs = remote?.attributes ?? {};
    const loadState = attrs?.load_state;
    const assignedKeys = attrs?.assigned_keys;
    const macroKeys = attrs?.macro_keys;
    const favoriteKeys = attrs?.favorite_keys;
    const resolvedHubData = resolveHubActivityData({
      isHubIntegration: this.isHubIntegration(),
      activityId,
      assignedKeys,
      macroKeys,
      favoriteKeys,
      hubAssignedKeysCache: this.hubAssignedKeysCache || {},
      hubMacrosCache: this.hubMacrosCache || {},
      hubFavoritesCache: this.hubFavoritesCache || {}
    });
    this.hubAssignedKeysCache = resolvedHubData.hubAssignedKeysCache;
    this.hubMacrosCache = resolvedHubData.hubMacrosCache;
    this.hubFavoritesCache = resolvedHubData.hubFavoritesCache;
    if (this.isHubIntegration() && !isUnavailable) {
      if (activities.length === 0 && loadState !== "loading") {
        this.hubRequestBasicData();
      }
      if (activityId != null) {
        const confirmedActivityId = Number(activityId);
        if (this.x2LastFetchedActivityId !== confirmedActivityId) {
          this.x2LastFetchedActivityId = confirmedActivityId;
          this.hubRequestAssignedKeys(confirmedActivityId);
          this.hubRequestMacroKeys(confirmedActivityId);
          this.hubRequestFavoriteKeys(confirmedActivityId);
        }
      }
    } else if (this.isHubIntegration() && activityId == null) {
      this.x2LastFetchedActivityId = null;
    }
    const rawAssignedKeys = resolvedHubData.rawAssignedKeys;
    const enabledButtonsSig = enabledButtonsSignature(rawAssignedKeys);
    if (this.enabledButtonsCacheKey !== enabledButtonsSig) {
      this.enabledButtonsCacheKey = enabledButtonsSig;
      const parsed = Array.isArray(rawAssignedKeys) ? rawAssignedKeys.map((entry) => ({
        command: Number(entry),
        activity_id: activityId
      })).filter((entry) => Number.isFinite(entry.command)) : [];
      this.enabledButtonsInvalid = Array.isArray(rawAssignedKeys) && parsed.length === 0;
      this.enabledButtonsCache = parsed;
    }
    const pendingAge = this.pendingActivityAt ? Date.now() - this.pendingActivityAt : null;
    const pendingExpired = pendingAge != null && pendingAge > 15e3;
    let selectState = null;
    let isPoweredOff = false;
    let currentLabel = "";
    if (isUnavailable) {
      this.stopActivityLoading();
    } else {
      selectState = buildActivitySelectState({
        editMode: this._editMode,
        preview,
        activities,
        currentActivityLabel: this.currentActivityLabel(),
        pendingActivity: this.pendingActivity,
        pendingExpired
      });
      currentLabel = selectState.current;
      isPoweredOff = preview ? Boolean(preview.poweredOff) : activityId == null || Boolean(selectState.poweredOff);
      if (selectState.clearPending) {
        this.pendingActivity = null;
        this.pendingActivityAt = null;
      }
      const currentActivity = this.currentActivityLabel();
      if (this.activityLoadActive && this.activityLoadTarget) {
        const targetIsOff = isPoweredOffLabel(this.activityLoadTarget);
        if (targetIsOff && isPoweredOff || currentActivity === this.activityLoadTarget) {
          this.stopActivityLoading();
        }
      }
    }
    const showVolume = volumeGroupEnabled(layoutConfig);
    const showChannel = channelGroupEnabled(layoutConfig);
    const showMedia = mediaGroupEnabled(layoutConfig);
    const showDvr = dvrGroupEnabled(layoutConfig);
    return {
      remote,
      isUnavailable,
      loadState,
      activities,
      preview,
      activityId,
      layoutConfig,
      layoutSignature: this.layoutSignature(activityId, layoutConfig),
      macros: resolvedHubData.macros,
      favorites: resolvedHubData.favorites,
      customFavorites: this.customFavorites(),
      rawAssignedKeys,
      selectState,
      currentLabel,
      isPoweredOff,
      isX2: this.isX2(),
      showVolume,
      showChannel,
      showMedia,
      showDvr,
      noActivitiesMessage: noActivitiesWarning(isUnavailable, activities.length, loadState)
    };
  }
};

// custom_components/sofabaton_x1s/www/src/remote-card-assist-yaml.ts
function automationAssistRemoteYaml(capture, entityId, hubIntegration) {
  if (!capture || !entityId) return "";
  const kind = capture.kind || "button";
  if (kind === "activity") {
    if (hubIntegration) {
      if (!Number.isFinite(Number(capture.activityId))) return "";
      return [
        "action: remote.send_command",
        "target:",
        `  entity_id: ${entityId}`,
        "data:",
        "  command:",
        "    - type:start_activity",
        `    - activity_id:${capture.activityId}`
      ].join("\n");
    }
    return [
      "action: remote.turn_on",
      "target:",
      `  entity_id: ${entityId}`,
      "data:",
      `  activity: ${capture.activityName}`
    ].join("\n");
  }
  if (kind === "power") {
    if (hubIntegration) {
      if (!Number.isFinite(Number(capture.activityId))) return "";
      return [
        "action: remote.send_command",
        "target:",
        `  entity_id: ${entityId}`,
        "data:",
        "  command:",
        "    - type:stop_activity",
        `    - activity_id:${capture.activityId}`
      ].join("\n");
    }
    return [
      "action: remote.turn_off",
      "target:",
      `  entity_id: ${entityId}`
    ].join("\n");
  }
  if (hubIntegration) {
    const payloadType = capture.commandType === "macro" ? "send_macro_key" : capture.commandType === "favorite" ? "send_favorite_key" : "send_assigned_key";
    const deviceKey = capture.commandType === "favorite" ? "device_id" : "activity_id";
    return [
      "action: remote.send_command",
      "target:",
      `  entity_id: ${entityId}`,
      "data:",
      "  command:",
      `    - type:${payloadType}`,
      `    - ${deviceKey}:${capture.deviceId}`,
      `    - key_id:${capture.commandId}`
    ].join("\n");
  }
  return [
    "action: remote.send_command",
    "target:",
    `  entity_id: ${entityId}`,
    "data:",
    `  command: ${capture.commandId}`,
    `  device: ${capture.deviceId}`
  ].join("\n");
}
function automationAssistButtonYaml(capture, entityId, hubIntegration) {
  if (!capture || !entityId) return "";
  const kind = capture.kind || "button";
  const label = capture.label || str().assist.automationAssistName;
  const icon = kind === "activity" ? "mdi:television-classic" : kind === "power" ? "mdi:power" : capture.commandType === "favorite" ? "mdi:star" : capture.commandType === "macro" ? "mdi:cogs" : capture.icon || "mdi:remote";
  const serviceYaml = automationAssistRemoteYaml(capture, entityId, hubIntegration).split("\n").map((line) => `  ${line}`).join("\n");
  return [
    "type: button",
    `name: ${label}`,
    `icon: ${icon}`,
    "tap_action:",
    "  action: perform-action",
    "  perform_" + serviceYaml.substring(2),
    "hold_action:",
    "  action: none"
  ].join("\n");
}
function automationAssistNotificationBody(capture, entityId, hubIntegration, fallbackActivityName) {
  if (!capture) return "";
  const kind = capture.kind || "button";
  const notify = str().assist.notification;
  const activityName = capture.activityName || fallbackActivityName || str().assist.unknown;
  const label = capture.label ?? "";
  const eventLabel = kind === "button" ? notify.eventButton(label) : kind === "activity" ? notify.eventActivity(label) : notify.eventOther(label);
  const buttonYaml = automationAssistButtonYaml(capture, entityId, hubIntegration);
  const remoteYaml = automationAssistRemoteYaml(capture, entityId, hubIntegration);
  return [
    "---",
    "",
    notify.header(activityName, eventLabel),
    "",
    "---",
    notify.lovelaceHeading,
    "",
    notify.lovelaceCopy,
    "```yaml",
    buttonYaml,
    "```",
    notify.serviceHeading,
    "",
    notify.serviceCopy,
    "```yaml",
    remoteYaml,
    "```"
  ].join("\n");
}

// custom_components/sofabaton_x1s/www/src/state/automation-assist-controller.ts
function normalizeHubMac(value) {
  if (!value) return null;
  const normalized = String(value).replace(/[^a-fA-F0-9]/g, "").toUpperCase();
  if (!normalized || normalized.length < 6) return null;
  return normalized;
}
function parseMqttPayload(payload) {
  if (payload == null) return null;
  if (typeof payload === "object") return payload;
  try {
    return JSON.parse(String(payload));
  } catch (e6) {
    return null;
  }
}
var AutomationAssistController = class {
  constructor(host) {
    this.active = false;
    this.capture = null;
    this.statusMessage = null;
    // MQTT discovery state
    this.mqttMatch = false;
    this.mqttPayload = null;
    this.mqttDeviceName = null;
    this.mqttCommandName = null;
    this.mqttExisting = false;
    this.discoveryCreated = false;
    this.discoveryWorking = false;
    this.discoveryDeviceId = null;
    // Modal state (the Lit card renders from these)
    this.modalOpen = false;
    this.modalDeviceId = null;
    this.modalActivityChecked = false;
    this.hubMac = null;
    this.hubMacDetecting = false;
    this.mqttUnsub = null;
    this.mqttTopic = null;
    this.mqttLookupId = 0;
    this.mqttDeviceNames = /* @__PURE__ */ new Map();
    this.mqttDeviceCommands = /* @__PURE__ */ new Map();
    this.mqttRequestQueue = Promise.resolve();
    this.mqttPublishQueue = Promise.resolve();
    this.discoveryIds = /* @__PURE__ */ new Set();
    // Activity-change baseline (drives capture of activity switches)
    this.lastActivityLabel = null;
    this.lastActivityId = null;
    this.lastPoweredOff = null;
    this.host = host;
  }
  // ---------- session (per-tab, shared across card instances) ----------
  sessionState() {
    const win2 = window;
    if (!win2[AUTOMATION_ASSIST_SESSION_KEY]) {
      win2[AUTOMATION_ASSIST_SESSION_KEY] = {
        hideMqttModal: false,
        discoveryDeviceIds: /* @__PURE__ */ new Set(),
        activityTriggersCreated: false
      };
    }
    return win2[AUTOMATION_ASSIST_SESSION_KEY];
  }
  activityTriggersCreatedInSession() {
    return this.sessionState().activityTriggersCreated;
  }
  // ---------- capture lifecycle ----------
  ensureCaptureStarted() {
    if (!this.host.assistEnabled()) return false;
    if (this.host.isEditMode()) return false;
    if (!this.active) {
      this.setActive(true);
    }
    return this.active;
  }
  primeActivityBaseline() {
    const currentLabel = this.host.currentActivityLabel();
    const currentId = this.host.currentActivityId();
    this.lastActivityLabel = currentLabel;
    this.lastActivityId = Number.isFinite(Number(currentId)) ? Number(currentId) : null;
    this.lastPoweredOff = isPoweredOffLabel(currentLabel);
  }
  resetActivityBaseline() {
    this.lastActivityLabel = null;
    this.lastActivityId = null;
    this.lastPoweredOff = null;
  }
  setActive(active) {
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
  resetCaptureSideState() {
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
  recordActivityChange(params) {
    if (!this.ensureCaptureStarted()) return;
    const id = Number(params.activityId);
    const resolvedId = Number.isFinite(id) ? id : null;
    const poweredOff = !!params.poweredOff;
    const label = poweredOff ? str().card.poweredOff : String(params.activityName || str().assist.activityFallbackLabel);
    this.capture = {
      label,
      activityId: resolvedId,
      activityName: poweredOff ? str().card.poweredOff : String(params.activityName || label),
      kind: poweredOff ? "power" : "activity"
    };
    this.resetCaptureSideState();
    this.host.onChange();
    this.notifyCapture();
  }
  recordClick(params) {
    if (!this.ensureCaptureStarted()) return;
    const command = Number(params.commandId);
    if (!Number.isFinite(command)) return;
    const commandType = params.commandType ?? "assigned";
    const resolvedDevice = commandType === "favorite" || commandType === "macro" ? params.deviceId != null ? Number(params.deviceId) : this.host.currentActivityId() : this.host.resolveCommandDeviceId(command, params.deviceId ?? null);
    if (resolvedDevice == null || !Number.isFinite(Number(resolvedDevice))) {
      return;
    }
    const activityName = this.host.activityNameForId(resolvedDevice) || this.host.currentActivityLabel() || str().assist.unknown;
    this.capture = {
      label: String(params.label ?? str().assist.buttonFallback),
      commandId: command,
      deviceId: Number(resolvedDevice),
      commandType,
      icon: params.icon ? String(params.icon) : null,
      activityName,
      kind: "button"
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
  observeActivityState(params) {
    const current = params.currentLabel;
    if (!params.unavailable && this.host.assistEnabled() && this.lastActivityLabel != null && current !== this.lastActivityLabel) {
      if (isPoweredOffLabel(current)) {
        this.recordActivityChange({
          activityId: this.lastActivityId,
          activityName: str().card.poweredOff,
          poweredOff: true
        });
      } else {
        this.recordActivityChange({
          activityId: params.activityId,
          activityName: current,
          poweredOff: false
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
  remoteYaml() {
    return automationAssistRemoteYaml(
      this.capture,
      this.host.entityId(),
      this.host.isHubIntegration()
    );
  }
  buttonYaml() {
    return automationAssistButtonYaml(
      this.capture,
      this.host.entityId(),
      this.host.isHubIntegration()
    );
  }
  notifyCapture() {
    if (!this.host.assistEnabled()) return;
    if (!this.host.getHass()) return;
    const capture = this.capture;
    const body = automationAssistNotificationBody(
      capture,
      this.host.entityId(),
      this.host.isHubIntegration(),
      this.host.activityNameForId(capture?.deviceId) || this.host.currentActivityLabel() || ""
    );
    if (!body) return;
    void this.host.callService("persistent_notification", "create", {
      title: str().assist.notification.title,
      message: body
    });
  }
  // ---------- status / modal view state ----------
  /** The status line under the assist label (legacy _updateAutomationAssistUI). */
  statusText() {
    if (!this.active) {
      return this.host.isEditMode() ? str().assist.exitEditMode : str().assist.waiting;
    }
    if (this.statusMessage) return this.statusMessage;
    if (this.capture) return str().assist.captured(String(this.capture.label ?? ""));
    return str().assist.waiting;
  }
  /** Derived modal content (legacy _updateAutomationAssistModalUI). */
  modalViewState() {
    const isActive = this.active;
    const mqttSupported = this.mqttSupported();
    const payload = this.mqttPayload;
    const deviceId = Number(payload?.device_id);
    const commandId = Number(payload?.key_id);
    const deviceName = this.mqttDeviceName || (Number.isFinite(deviceId) ? str().assist.deviceFallback(deviceId) : str().assist.unknownDevice);
    const commandName = this.mqttCommandName || (Number.isFinite(commandId) ? str().assist.commandFallback(commandId) : null);
    const lines = [str().assist.detectedDevice(deviceName)];
    if (commandName) lines.push(str().assist.lastCommand(commandName));
    if (this.mqttExisting) lines.push(str().assist.existingTriggers);
    const createLabel = this.discoveryWorking ? str().assist.working : this.discoveryCreated ? str().assist.triggersReady : str().assist.createTriggers;
    return {
      open: this.modalOpen,
      showActivityRow: !this.sessionState().activityTriggersCreated,
      text: lines.join(" "),
      showStart: !isActive,
      showCreate: mqttSupported && isActive,
      createLabel,
      createDisabled: this.discoveryWorking || this.discoveryCreated || !this.mqttAvailable()
    };
  }
  // ---------- MQTT plumbing ----------
  mqttSupported() {
    return this.host.isX2();
  }
  mqttAvailable() {
    return this.mqttSupported() && this.active && Boolean(this.hubMac) && !this.discoveryCreated && !this.discoveryWorking && this.mqttReady();
  }
  mqttReady() {
    if (!this.host.isHubIntegration()) return true;
    return this.host.hubQueueIdle();
  }
  safeUnsubscribe(unsubscribe) {
    if (typeof unsubscribe !== "function") return;
    try {
      const maybePromise = unsubscribe();
      if (maybePromise && typeof maybePromise.catch === "function") {
        maybePromise.catch(() => {
        });
      }
    } catch (e6) {
    }
  }
  ensureHubMac() {
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
    let timeoutId = null;
    let unsub = null;
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
    hass.connection.subscribeMessage(
      (msg) => {
        const topicMatch = String(msg?.topic || "").match(
          /^activity\/([^/]+)\/list$/
        );
        const normalized = topicMatch?.[1] ? normalizeHubMac(topicMatch[1]) : null;
        if (!normalized) return;
        this.hubMac = normalized;
        finish();
      },
      { type: "mqtt/subscribe", topic }
    ).then((unsubscribe) => {
      unsub = unsubscribe;
      this.host.requestHubBasicData();
      timeoutId = setTimeout(() => finish(), 4e3);
    }).catch(() => {
      finish();
    });
  }
  syncMqtt() {
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
    hass.connection.subscribeMessage((msg) => this.handleMqtt(msg), {
      type: "mqtt/subscribe",
      topic
    }).then((unsub) => {
      this.mqttUnsub = unsub;
    }).catch(() => {
      this.mqttUnsub = null;
    });
  }
  unsubscribeMqtt() {
    if (this.mqttUnsub) {
      const unsubscribe = this.mqttUnsub;
      this.mqttUnsub = null;
      this.safeUnsubscribe(unsubscribe);
    }
    this.mqttTopic = null;
  }
  /** Legacy behavior kept: no automatic trigger-exists detection. */
  mqttTriggerExists(_payload, _topic) {
    return false;
  }
  // ---------- modal ----------
  shouldSuppressMqttModal(deviceId) {
    const session = this.sessionState();
    if (session.hideMqttModal) return true;
    return session.discoveryDeviceIds.has(deviceId);
  }
  openMqttModal(deviceId) {
    if (!Number.isFinite(deviceId)) return;
    if (this.shouldSuppressMqttModal(deviceId)) return;
    this.modalDeviceId = deviceId;
    this.modalOpen = true;
    this.modalActivityChecked = false;
    this.host.onChange();
  }
  closeMqttModal() {
    if (!this.modalOpen) return;
    this.modalOpen = false;
    this.host.onChange();
  }
  /** The "don't show again for this session" checkbox. */
  setModalOptOut(checked) {
    if (!checked) return;
    this.sessionState().hideMqttModal = true;
    this.closeMqttModal();
  }
  setModalActivityChecked(checked) {
    this.modalActivityChecked = !!checked;
  }
  // ---------- MQTT message handling ----------
  handleMqtt(msg) {
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
  primeMqttMetadata(payload) {
    const mac = this.hubMac;
    if (!mac || !payload) return;
    const deviceId = Number(payload.device_id);
    const keyId = Number(payload.key_id);
    if (!Number.isFinite(deviceId) || !Number.isFinite(keyId)) return;
    const lookupId = this.mqttLookupId + 1;
    this.mqttLookupId = lookupId;
    void Promise.all([
      this.requestMqttDeviceName(mac, deviceId),
      this.requestMqttDeviceCommandName(mac, deviceId, keyId)
    ]).then(([deviceName, commandName]) => {
      if (this.mqttLookupId !== lookupId) return;
      if (deviceName) this.mqttDeviceName = deviceName;
      if (commandName) this.mqttCommandName = commandName;
      this.host.onChange();
    });
  }
  async requestMqttDeviceName(mac, deviceId) {
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
      () => new Promise((resolve) => {
        let timeoutId = null;
        let unsub = null;
        const finish = (name) => {
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
        hass.connection.subscribeMessage(
          (msg) => {
            const data = parseMqttPayload(msg?.payload);
            const devices = Array.isArray(data?.data) ? data.data : [];
            const match = devices.find(
              (device) => Number(device?.device_id) === deviceId
            );
            finish(match?.device_name ? String(match.device_name) : null);
          },
          { type: "mqtt/subscribe", topic }
        ).then((unsubscribe) => {
          unsub = unsubscribe;
          void this.host.callService("mqtt", "publish", {
            topic: requestTopic,
            payload
          });
          timeoutId = setTimeout(() => finish(null), 4e3);
        }).catch(() => finish(null));
      })
    );
  }
  async requestMqttDeviceCommandName(mac, deviceId, keyId) {
    if (!Number.isFinite(keyId)) return null;
    const commands = await this.requestMqttDeviceCommands(mac, deviceId);
    if (!commands) return null;
    return commands.get(Number(keyId)) || null;
  }
  async requestMqttDeviceCommands(mac, deviceId) {
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
      () => new Promise((resolve) => {
        let timeoutId = null;
        let unsub = null;
        const finish = (commands) => {
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
        hass.connection.subscribeMessage(
          (msg) => {
            const data = parseMqttPayload(msg?.payload);
            if (Number(data?.device_id) !== deviceId) return;
            const keys = Array.isArray(data?.data) ? data.data : [];
            const commands = /* @__PURE__ */ new Map();
            keys.forEach((entry) => {
              const key = Number(entry?.key_id);
              if (!Number.isFinite(key)) return;
              const name = entry?.key_name ? String(entry.key_name) : null;
              if (name) commands.set(key, name);
            });
            finish(commands);
          },
          { type: "mqtt/subscribe", topic }
        ).then((unsubscribe) => {
          unsub = unsubscribe;
          void this.host.callService("mqtt", "publish", {
            topic: requestTopic,
            payload
          });
          timeoutId = setTimeout(() => finish(null), 4e3);
        }).catch(() => finish(null));
      })
    );
  }
  enqueueMqttRequest(task) {
    const run = async () => task();
    this.mqttRequestQueue = this.mqttRequestQueue.then(run, run);
    return this.mqttRequestQueue;
  }
  enqueueMqttPublish(task) {
    const run = async () => task();
    this.mqttPublishQueue = this.mqttPublishQueue.then(run, run);
    return this.mqttPublishQueue;
  }
  setStatus(text) {
    this.statusMessage = String(text ?? "");
    this.host.onChange();
  }
  // ---------- trigger discovery (the modal's Create button) ----------
  async createTriggers() {
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
        this.requestMqttDeviceCommands(mac, deviceId)
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
      const includeActivityTriggers = allowActivityTriggers && this.modalActivityChecked;
      let createdCount = 0;
      let createdActivityCount = 0;
      for (const [keyId, commandName] of commands.entries()) {
        const payloadObj = { device_id: deviceId, key_id: Number(keyId) };
        if (!Number.isFinite(payloadObj.key_id)) continue;
        if (this.mqttTriggerExists(payloadObj, topic)) {
          continue;
        }
        const displayCommand = commandName || str().assist.commandFallback(payloadObj.key_id);
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
            name: `X2 \u2192 ${deviceLabel}`,
            model: "X2",
            manufacturer: "Sofabaton"
          }
        };
        await this.enqueueMqttPublish(async () => {
          await this.host.callService("mqtt", "publish", {
            topic: `homeassistant/device_automation/${uniqueId}/config`,
            payload: JSON.stringify(config),
            retain: true
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
          name: "X2 \u2192 Activities",
          model: "X2",
          manufacturer: "Sofabaton"
        };
        const activities = this.host.activities();
        const activityEntries = activities.map((activity) => ({
          id: activity.id,
          name: activity.name,
          state: "on"
        }));
        activityEntries.push({
          id: 255,
          name: "Powered Off",
          state: "off"
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
            device: activityDevice
          };
          await this.enqueueMqttPublish(async () => {
            await this.host.callService("mqtt", "publish", {
              topic: `homeassistant/device_automation/${uniqueId}/config`,
              payload: JSON.stringify(config),
              retain: true
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
        const activityNote = includeActivityTriggers && createdActivityCount > 0 && createdCount > 0 ? str().assist.plusActivityTriggers(createdActivityCount) : "";
        const base = createdCount > 0 ? str().assist.createdTriggers(createdCount, deviceLabel) : str().assist.createdActivityTriggers(createdActivityCount);
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
  disconnected() {
    this.unsubscribeMqtt();
  }
};

// custom_components/sofabaton_x1s/www/src/sections/wire.ts
function primaryActionRef(handler) {
  return n6((el) => {
    if (!el) return;
    const node = el;
    node.__sbTrigger = handler;
    if (node.__sbActionWired) return;
    node.__sbActionWired = true;
    attachPrimaryAction(
      node,
      (ev) => node.__sbTrigger?.(ev),
      {
        fireHaptic: () => {
          node.dispatchEvent(
            new CustomEvent("haptic", {
              detail: "light",
              bubbles: true,
              composed: true
            })
          );
        }
      }
    );
  });
}
function listenersRef(wire) {
  return n6((el) => {
    if (!el) return;
    const node = el;
    if (node.__sbListenersWired) return;
    node.__sbListenersWired = true;
    wire(node);
  });
}

// custom_components/sofabaton_x1s/www/src/sections/activity-row.ts
function renderActivityRow(params) {
  const itemTag = s4(selectItemTagName());
  const options = params.unavailable ? [] : params.options;
  const optionObjects = options.map((opt) => ({ value: opt, label: opt }));
  const wireSelectEvents = listenersRef((el) => {
    el.addEventListener("selected", params.onSelect);
    el.addEventListener("change", params.onSelect);
    selectOpenEvents().forEach((eventName) => {
      el.addEventListener(eventName, () => params.onMenuOpened(), true);
    });
    selectCloseEvents().forEach((eventName) => {
      el.addEventListener(eventName, () => params.onMenuClosed(), true);
    });
    el.addEventListener("change", () => params.onMenuClosed(), true);
    el.addEventListener("blur", () => params.onMenuClosed(), true);
  });
  return b2`
    <div
      class="activityRow"
      style=${params.visible ? "" : "display: none !important;"}
      ${params.rowRef ? n6(params.rowRef) : A}
    >
      <ha-select
        class="sb-activity-select"
        .label=${str().card.activitySelectLabel}
        .hass=${params.hass}
        .value=${params.unavailable ? "" : selectValueCompat(params.resolvedValue, optionObjects)}
        .disabled=${params.unavailable || params.disabled}
        ${wireSelectEvents}
      >
        ${optionObjects.map(
    (option) => u3`
            <${itemTag} .value=${option.value}>${option.label}</${itemTag}>
          `
  )}
      </ha-select>
      <div class="loadIndicator${params.loading ? " is-loading" : ""}"></div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/remote-card-render-models.ts
function drawerCommandType(type) {
  if (type === "macros") return "macro";
  if (type === "favorites") return "favorite";
  return "assigned";
}
function drawerButtonModel(item, type, fallbackDeviceId) {
  return {
    label: item?.name || "Unknown",
    commandId: Number(item?.command_id ?? item?.id),
    deviceId: Number(item?.device_id ?? item?.device ?? fallbackDeviceId),
    icon: item?.icon ? String(item.icon) : null,
    commandType: drawerCommandType(type)
  };
}
function customFavoriteButtonModel(favorite, fallbackDeviceId) {
  const commandId = Number(favorite?.command_id);
  const explicitDeviceId = favorite?.device_id != null ? Number(favorite.device_id) : null;
  const deviceId = explicitDeviceId != null ? explicitDeviceId : Number(fallbackDeviceId);
  return {
    label: String(favorite?.name ?? "Favorite"),
    icon: favorite?.icon ? String(favorite.icon) : null,
    action: favorite?.action ?? null,
    commandId,
    deviceId
  };
}
function actionButtonModel({
  label,
  icon,
  extraClass = ""
}) {
  return {
    wrapClassName: `macroFavoritesButton ${extraClass}`.trim(),
    buttonConfig: {
      type: "button",
      show_name: true,
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || void 0,
      tap_action: {
        action: "none"
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    }
  };
}
function huiButtonModel({
  label,
  icon,
  extraClass = "",
  size = "normal"
}) {
  return {
    wrapClassName: `key key--${size} ${extraClass}`.trim(),
    buttonConfig: {
      type: "button",
      show_name: Boolean(label),
      show_icon: Boolean(icon),
      name: label || "",
      icon: icon || void 0,
      tap_action: {
        action: "none"
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    }
  };
}
function colorKeyModel(color) {
  return {
    wrapClassName: "key key--color",
    color,
    buttonConfig: {
      type: "button",
      show_name: false,
      show_icon: false,
      tap_action: {
        action: "none"
      },
      hold_action: { action: "none" },
      double_tap_action: { action: "none" }
    }
  };
}

// custom_components/sofabaton_x1s/www/src/components/sb-key-button.ts
var SbKeyButton = class extends HTMLElement {
  constructor() {
    super(...arguments);
    this._btn = null;
    this._hass = null;
    this._syncedHass = null;
    this._buttonConfig = null;
    this._configApplied = false;
    this._color = null;
    this._sizeVar = null;
    this._wired = false;
    /** Called on a (gated) primary action while the host is not .disabled. */
    this.onTrigger = null;
  }
  set buttonConfig(config) {
    this._buttonConfig = config;
    if (this._btn && config && !this._configApplied) {
      this._configApplied = true;
      this._btn.setConfig?.(config);
    }
  }
  set hass(hass) {
    this._hass = hass;
    this.syncHass();
  }
  /** Color key accent (adds the colorBar and --sb-color). */
  set color(value) {
    this._color = value;
  }
  /** CSS var applied to the button's inner text (legacy _applyButtonTextSizing). */
  set sizeVar(value) {
    this._sizeVar = value;
  }
  syncHass() {
    if (!this._btn || !this._hass) return;
    if (this._syncedHass === this._hass) return;
    this._btn.hass = this._hass;
    this._syncedHass = this._hass;
  }
  connectedCallback() {
    if (this._wired) {
      this.syncHass();
      return;
    }
    this._wired = true;
    if (this._color) {
      this.style.setProperty("--sb-color", this._color);
    }
    const btn = document.createElement("hui-button-card");
    this._btn = btn;
    if (this._hass) {
      btn.hass = this._hass;
      this._syncedHass = this._hass;
    }
    if (this._buttonConfig && !this._configApplied) {
      this._configApplied = true;
      btn.setConfig?.(this._buttonConfig);
    }
    this.appendChild(btn);
    if (this._color) {
      const bar = document.createElement("div");
      bar.className = "colorBar";
      this.appendChild(bar);
    }
    attachPrimaryAction([this, btn], (ev) => {
      if (this.classList.contains("disabled")) return;
      this.onTrigger?.(ev);
    }, {
      fireHaptic: () => {
        this.dispatchEvent(
          new CustomEvent("haptic", {
            detail: "light",
            bubbles: true,
            composed: true
          })
        );
      }
    });
    if (this._sizeVar) {
      applyButtonTextSizing(btn, this._sizeVar);
    }
  }
};
function applyButtonTextSizing(btn, sizeVar) {
  const apply = (attempt = 0) => {
    const root = btn?.shadowRoot;
    if (!root) return;
    const value = `var(${sizeVar})`;
    const card = root.querySelector("ha-card");
    const name = root.querySelector(".name");
    const label = root.querySelector(".label");
    const state = root.querySelector(".state");
    if (card) card.style.setProperty("font-size", value);
    if (name) name.style.fontSize = value;
    if (label) label.style.fontSize = value;
    if (state) state.style.fontSize = value;
    if (!name && !label && !state && attempt < 2) {
      requestAnimationFrame(() => apply(attempt + 1));
    }
  };
  if (btn?.updateComplete && typeof btn.updateComplete.then === "function") {
    void btn.updateComplete.then(() => apply());
  } else {
    requestAnimationFrame(() => apply());
  }
}
if (!customElements.get("sb-key-button")) {
  customElements.define("sb-key-button", SbKeyButton);
}

// custom_components/sofabaton_x1s/www/src/sections/key-groups.ts
var X2_ONLY_KEY_IDS = /* @__PURE__ */ new Set([
  ID.C,
  ID.B,
  ID.A,
  ID.EXIT,
  ID.DVR,
  ID.PLAY,
  ID.GUIDE
]);
var dpadKeys = () => [
  { key: "up", id: ID.UP, cmd: ID.UP, label: "", icon: "mdi:chevron-up", extraClass: "area-up" },
  { key: "left", id: ID.LEFT, cmd: ID.LEFT, label: "", icon: "mdi:chevron-left", extraClass: "area-left" },
  // Language-neutral filled circle instead of a localized "OK" label; the
  // assist capture label still resolves to str().keys.ok via the key fallback.
  { key: "ok", id: ID.OK, cmd: ID.OK, label: "", icon: "mdi:circle", extraClass: "area-ok okKey", size: "big" },
  { key: "right", id: ID.RIGHT, cmd: ID.RIGHT, label: "", icon: "mdi:chevron-right", extraClass: "area-right" },
  { key: "down", id: ID.DOWN, cmd: ID.DOWN, label: "", icon: "mdi:chevron-down", extraClass: "area-down" }
];
var navKeys = () => [
  { key: "back", id: ID.BACK, cmd: ID.BACK, label: "", icon: "mdi:arrow-u-left-top" },
  { key: "home", id: ID.HOME, cmd: ID.HOME, label: "", icon: "mdi:home" },
  { key: "menu", id: ID.MENU, cmd: ID.MENU, label: "", icon: "mdi:menu" }
];
var midKeys = () => [
  { key: "volup", id: ID.VOL_UP, cmd: ID.VOL_UP, label: "", icon: "mdi:volume-plus", extraClass: "mid-btn mid-btn-volup" },
  { key: "voldn", id: ID.VOL_DOWN, cmd: ID.VOL_DOWN, label: "", icon: "mdi:volume-minus", extraClass: "mid-btn mid-btn-voldn" },
  { key: "guide", id: ID.GUIDE, cmd: ID.GUIDE, label: "Guide", icon: "", extraClass: "mid-btn mid-btn-guide" },
  { key: "mute", id: ID.MUTE, cmd: ID.MUTE, label: "", icon: "mdi:volume-mute", extraClass: "mid-btn mid-btn-mute" },
  { key: "chup", id: ID.CH_UP, cmd: ID.CH_UP, label: "", icon: "mdi:chevron-up", extraClass: "mid-btn mid-btn-chup" },
  { key: "chdn", id: ID.CH_DOWN, cmd: ID.CH_DOWN, label: "", icon: "mdi:chevron-down", extraClass: "mid-btn mid-btn-chdn" }
];
var mediaKeys = () => [
  { key: "rew", id: ID.REW, cmd: ID.REW, label: "", icon: "mdi:rewind", extraClass: "area-rew" },
  { key: "play", id: ID.PLAY, cmd: ID.PLAY, label: "", icon: "mdi:play", extraClass: "area-play" },
  { key: "fwd", id: ID.FWD, cmd: ID.FWD, label: "", icon: "mdi:fast-forward", extraClass: "area-fwd" },
  { key: "dvr", id: ID.DVR, cmd: ID.DVR, label: "DVR", icon: "", extraClass: "area-dvr" },
  { key: "pause", id: ID.PAUSE, cmd: ID.PAUSE, label: "", icon: "mdi:pause", extraClass: "area-pause" },
  { key: "exit", id: ID.EXIT, cmd: ID.EXIT, label: "Exit", icon: "", extraClass: "area-exit" }
];
var colorKeys = () => [
  { key: "red", id: ID.RED, cmd: ID.RED, label: "", icon: "", color: "#d32f2f" },
  { key: "green", id: ID.GREEN, cmd: ID.GREEN, label: "", icon: "", color: "#388e3c" },
  { key: "yellow", id: ID.YELLOW, cmd: ID.YELLOW, label: "", icon: "", color: "#fbc02d" },
  { key: "blue", id: ID.BLUE, cmd: ID.BLUE, label: "", icon: "", color: "#1976d2" }
];
var abcKeys = () => [
  { key: "a", id: ID.A, cmd: ID.A, label: "A", icon: "", size: "small" },
  { key: "b", id: ID.B, cmd: ID.B, label: "B", icon: "", size: "small" },
  { key: "c", id: ID.C, cmd: ID.C, label: "C", icon: "", size: "small" }
];
var groupStyle = (visible) => visible ? "" : "display: none !important;";
function renderKey(params, spec) {
  const isX2Only = X2_ONLY_KEY_IDS.has(spec.id);
  const layoutVisible = params.buttonVisibility && spec.key in params.buttonVisibility ? params.buttonVisibility[spec.key] : true;
  const shouldShow = isX2Only ? params.isX2 && layoutVisible : layoutVisible;
  const enabled = !params.disableAll && (params.editMode || params.isEnabled(spec.id));
  const model = spec.color ? colorKeyModel(spec.color) : huiButtonModel({
    label: spec.label,
    icon: spec.icon,
    extraClass: spec.extraClass ?? "",
    size: spec.size ?? "normal"
  });
  return b2`
    <sb-key-button
      class="${model.wrapClassName}${enabled ? "" : " disabled"}"
      style=${shouldShow ? "" : "display: none !important;"}
      .buttonConfig=${model.buttonConfig}
      .color=${spec.color ?? null}
      .sizeVar=${spec.color ? null : "--sb-key-font-size"}
      .hass=${params.hass}
      .onTrigger=${() => params.onKeyPress(spec)}
    ></sb-key-button>
  `;
}
function renderDpad(params, visible) {
  return b2`<div class="dpad" style=${groupStyle(visible)}>${dpadKeys().map((k2) => renderKey(params, k2))}</div>`;
}
function renderNavRow(params, visible) {
  return b2`<div class="row3" style=${groupStyle(visible)}>${navKeys().map((k2) => renderKey(params, k2))}</div>`;
}
function renderMid(params, visible) {
  const midState = midModeState({
    showVolume: params.showVolume,
    showChannel: params.showChannel,
    isX2: params.isX2
  });
  const className = [
    "mid",
    ...Object.entries(midState.classMap).filter(([, on]) => on).map(([name]) => name)
  ].join(" ");
  return b2`<div class=${className} style=${groupStyle(visible)}>${midKeys().map((k2) => renderKey(params, k2))}</div>`;
}
function renderMedia(params, visible) {
  const mediaState = mediaModeState({
    isX2: params.isX2,
    showMedia: params.showMedia,
    showDvr: params.showDvr
  });
  const className = [
    "media",
    ...Object.entries(mediaState.classMap).filter(([, on]) => on).map(([name]) => name)
  ].join(" ");
  return b2`<div class=${className} style=${groupStyle(visible)}>${mediaKeys().map((k2) => renderKey(params, k2))}</div>`;
}
function renderColors(params, visible) {
  return b2`
    <div class="colors" style=${groupStyle(visible)}>
      <div class="colorsGrid">${colorKeys().map((k2) => renderKey(params, k2))}</div>
    </div>
  `;
}
function renderAbc(params, visible) {
  return b2`
    <div class="abc" style=${groupStyle(visible)}>
      <div class="abcGrid">${abcKeys().map((k2) => renderKey(params, k2))}</div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/sections/macro-favorites.ts
function renderDrawerButton(params, item, type) {
  const model = drawerButtonModel(item, type, params.currentActivityId);
  return b2`
    <ha-card
      class="drawer-btn"
      role="button"
      tabindex="0"
      ${primaryActionRef(() => {
    if (!Number.isFinite(model.commandId) || !Number.isFinite(model.deviceId)) return;
    params.onDrawerItem({ model, itemType: type, rawItem: item });
  })}
    >
      <div class="drawer-btn__inner drawer-btn__inner--stack">
        ${model.icon ? b2`<ha-icon class="drawer-btn__icon" icon=${model.icon}></ha-icon>` : A}
        <div class="name">${model.label}</div>
      </div>
    </ha-card>
  `;
}
function renderCustomFavoriteButton(params, favorite) {
  const model = customFavoriteButtonModel(favorite, params.currentActivityId);
  return b2`
    <ha-card
      class="drawer-btn drawer-btn--custom"
      role="button"
      tabindex="0"
      style="grid-column: 1 / -1;"
      ${primaryActionRef(() => params.onCustomFavorite({ model, rawFavorite: favorite }))}
    >
      <div class="drawer-btn__inner drawer-btn__inner--row">
        ${model.icon ? b2`<ha-icon class="drawer-btn__icon" icon=${model.icon}></ha-icon>` : A}
        <div class="name">${model.label}</div>
      </div>
    </ha-card>
  `;
}
function renderFavoritesItems(params) {
  return [
    ...params.customFavorites.map((fav) => renderCustomFavoriteButton(params, fav)),
    ...params.favorites.map((fav) => renderDrawerButton(params, fav, "favorites"))
  ];
}
function renderTab(params, label, visible, active, disabled, onClick) {
  const model = actionButtonModel({ label });
  const classes = [
    "macroFavoritesButton",
    ...active ? ["active-tab"] : [],
    ...disabled ? ["disabled"] : []
  ].join(" ");
  return b2`
    <sb-key-button
      class=${classes}
      style=${visible ? "" : "display: none !important;"}
      .buttonConfig=${model.buttonConfig}
      .sizeVar=${"--sb-tab-font-size"}
      .hass=${params.hass}
      .onTrigger=${onClick}
    ></sb-key-button>
  `;
}
function rowRadiusStyle(anyOpen, up) {
  const r6 = "var(--sb-group-radius)";
  return [
    `border-top-left-radius: ${anyOpen && up ? "0" : r6}`,
    `border-top-right-radius: ${anyOpen && up ? "0" : r6}`,
    `border-bottom-left-radius: ${anyOpen && !up ? "0" : r6}`,
    `border-bottom-right-radius: ${anyOpen && !up ? "0" : r6}`,
    "transition: border-radius 0.2s ease"
  ].join("; ");
}
function renderMacroFavorites(params) {
  const isMacro = params.activeDrawer === "macros";
  const isFav = params.activeDrawer === "favorites";
  const anyOpen = isMacro || isFav;
  const setRef = (r6) => r6 ? n6(r6) : A;
  return b2`
    <div
      class="mf-container${params.drawerUp ? " drawer-up" : ""}"
      style=${params.visible ? "" : "display: none !important;"}
      ${setRef(params.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${rowRadiusStyle(anyOpen, params.drawerUp)}
        ${setRef(params.rowRef)}
      >
        <div class="macroFavoritesGrid${params.single ? " single" : ""}">
          ${renderTab(
    params,
    str().card.macrosTab,
    params.showMacrosButton,
    isMacro,
    params.macrosDisabled,
    params.onToggleMacros
  )}
          ${renderTab(
    params,
    str().card.favoritesTab,
    params.showFavoritesButton,
    isFav,
    params.favoritesDisabled,
    params.onToggleFavorites
  )}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--macros${isMacro ? " open" : ""}"
        ${setRef(params.macrosOverlayRef)}
      >
        <div class="mf-grid">
          ${params.macros.map((macro) => renderDrawerButton(params, macro, "macros"))}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--favorites${isFav ? " open" : ""}"
        ${setRef(params.favoritesOverlayRef)}
      >
        <div class="mf-grid">${renderFavoritesItems(params)}</div>
      </div>
    </div>
  `;
}
function renderInlineDrawerRow(params) {
  return b2`
    <div
      class="inline-drawer-row inline-drawer-row--${params.kind}"
      style=${params.visible ? "" : "display: none !important;"}
    >
      <div
        class="inline-drawer-row__scroller"
        style="--inline-row-visible-rows: ${params.visibleRows};"
      >
        <div class="inline-drawer-row__grid mf-grid">
          ${params.items.length ? params.items : b2`
                <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                  ${params.emptyText}
                </div>
              `}
        </div>
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/sections/assist.ts
function renderAssistRow(params) {
  return b2`
    <div
      class="automationAssist"
      style=${params.visible ? "" : "display: none !important;"}
    >
      <div class="automationAssist__header">
        <div class="automationAssist__label">${str().assist.label}</div>
      </div>
      <div class="automationAssist__status">${params.controller.statusText()}</div>
    </div>
  `;
}
function renderAssistModal(params) {
  const controller = params.controller;
  const view = controller.modalViewState();
  const onBackdropClick = (ev) => {
    if (ev.target === ev.currentTarget) controller.closeMqttModal();
  };
  return b2`
    <div
      class="sb-modal${view.open ? " open" : ""}"
      role="dialog"
      aria-modal="true"
      @click=${onBackdropClick}
    >
      <div class="sb-modal__dialog">
        <div class="sb-modal__header">
          <div class="sb-modal__title">${str().assist.deviceDetectedTitle}</div>
          <button
            type="button"
            class="sb-modal__close"
            aria-label=${str().assist.close}
            @click=${() => controller.closeMqttModal()}
          >
            ✕
          </button>
        </div>
        <div class="sb-modal__body">
          <div class="sb-modal__text">${view.text}</div>
        </div>
        <div class="sb-modal__actions">
          <label
            class="sb-modal__optout"
            style=${view.showActivityRow ? "" : "display: none !important;"}
          >
            <input
              type="checkbox"
              .checked=${controller.modalActivityChecked}
              @change=${(ev) => controller.setModalActivityChecked(
    Boolean(ev.target.checked)
  )}
            />
            <span>${str().assist.alsoActivityTriggers}</span>
          </label>
          <a
            class="sb-modal__link"
            href=${`https://github.com/m3tac0de/sofabaton-virtual-remote/blob/${CARD_VERSION}/docs/automation_triggers.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            ${str().assist.seeDocs}
          </a>
          <button
            type="button"
            class="automationAssist__startBtn automationAssist__mqttBtn${view.createDisabled ? " disabled" : ""}"
            .disabled=${view.createDisabled}
            style=${view.showCreate ? "" : "display: none !important;"}
            ${primaryActionRef(() => void controller.createTriggers())}
          >
            ${view.createLabel}
          </button>
          <label class="sb-modal__optout">
            <input
              type="checkbox"
              @change=${(ev) => {
    if (ev.target.checked) {
      controller.setModalOptOut(true);
    }
  }}
            />
            <span>${str().assist.dontShowAgain}</span>
          </label>
          <button
            type="button"
            class="automationAssist__startBtn"
            style=${view.showStart ? "" : "display: none !important;"}
            ${primaryActionRef(() => controller.setActive(true))}
          >
            ${str().assist.startCapturing}
          </button>
        </div>
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/remote-card-element.ts
var SofabatonRemoteCard = class extends i4 {
  constructor() {
    super();
    this._haElementsReady = false;
    this._editMode = false;
    // Imperative-edge state (mirrors the legacy fields)
    this._drawerUp = false;
    this._drawerResetTimer = null;
    this._appliedThemeVars = [];
    this._appliedThemeKey = null;
    this._lastGroupRadius = null;
    this._layoutSignatureCache = null;
    this._layoutOverlayEl = null;
    this._lastLayoutSignature = null;
    // Activity select dedupe (legacy handleActivitySelect closure state)
    this._lastSelectedActivityValue = null;
    this._lastSelectedActivityAt = 0;
    this._onOutsidePointerDown = null;
    this._onResize = null;
    this._onPreviewActivity = null;
    this._cardRef = e5();
    this._wrapRef = e5();
    this._layoutContainerRef = e5();
    this._activityRowRef = e5();
    this._mfContainerRef = e5();
    this._macrosOverlayRef = e5();
    this._favoritesOverlayRef = e5();
    this._macroFavoritesRowRef = e5();
    this._store = new RemoteCardStore(
      () => this.requestUpdate(),
      {
        fireEvent: (type, detail) => this._fireEvent(type, detail),
        onHubQueueDrained: () => {
          this._assist.syncMqtt();
          this.requestUpdate();
        }
      }
    );
    this._assist = new AutomationAssistController({
      getHass: () => this._store.hass,
      assistEnabled: () => this._store.automationAssistEnabled(),
      entityId: () => String(this._store.config?.entity ?? ""),
      isEditMode: () => this._editMode,
      isX2: () => this._store.isX2(),
      isHubIntegration: () => this._store.isHubIntegration(),
      hubMacAttribute: () => this._store.remoteState()?.attributes?.hub_mac,
      hubQueueIdle: () => this._store.hubQueueIdle(),
      requestHubBasicData: () => this._store.hubRequestBasicData(),
      activities: () => this._store.activities(),
      activityNameForId: (id) => this._store.activityNameForId(id),
      currentActivityId: () => this._store.currentActivityId(),
      currentActivityLabel: () => this._store.currentActivityLabel(),
      resolveCommandDeviceId: (commandId, deviceId) => this._store.resolveCommandDeviceId(commandId, deviceId),
      callService: (domain, service, data) => this._store.callService(domain, service, data),
      onChange: () => this.requestUpdate()
    });
    void ensureHaElements().then(() => {
      this._haElementsReady = true;
      this.requestUpdate();
    });
  }
  // ---------- HA card API ----------
  setConfig(config) {
    this._store.setConfig(config);
    this._assist.resetActivityBaseline();
    this._drawerUp = false;
    if (this._drawerResetTimer) clearTimeout(this._drawerResetTimer);
  }
  set hass(hass) {
    setRemoteCardLanguage(
      hass?.locale?.language ?? hass?.language
    );
    this._store.setHass(hass);
  }
  get hass() {
    return this._store.hass;
  }
  set editMode(value) {
    this._editMode = !!value;
    this._store.setEditMode(this._editMode);
    if (this._editMode && this._assist.active) {
      this._assist.setActive(false);
    }
  }
  get editMode() {
    return this._editMode;
  }
  getCardSize() {
    return 12;
  }
  static getConfigElement() {
    return document.createElement(EDITOR);
  }
  static getStubConfig() {
    return {
      entity: "",
      theme: "",
      background_override: null,
      show_activity: true,
      show_dpad: true,
      show_nav: true,
      show_mid: true,
      show_volume: true,
      show_channel: true,
      show_media: true,
      show_dvr: true,
      show_colors: true,
      show_abc: true,
      show_automation_assist: false,
      show_macros_button: null,
      show_favorites_button: null,
      custom_favorites: [],
      max_width: 360,
      shrink: 0,
      group_order: DEFAULT_GROUP_ORDER.slice()
    };
  }
  // ---------- lifecycle ----------
  connectedCallback() {
    super.connectedCallback();
    this._store.connected();
    this._installOutsideCloseHandler();
    if (!this._onResize) {
      this._onResize = () => {
        if (!this._store.activeDrawer) return;
        this._updateDrawerDirection();
        this._syncLayering();
      };
    }
    window.addEventListener("resize", this._onResize, { passive: true });
    if (!this._onPreviewActivity) {
      this._onPreviewActivity = (event) => {
        const detail = event?.detail || {};
        const entity = this._store.config?.entity;
        if (detail.entity && entity && detail.entity !== entity) return;
        this._store.setPreviewActivity(detail.previewActivity ?? "");
        if (this._editMode) {
          this.requestUpdate();
        }
      };
    }
    window.addEventListener("sofabaton-preview-activity", this._onPreviewActivity);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._removeOutsideCloseHandler();
    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
      this._onResize = null;
    }
    if (this._onPreviewActivity) {
      window.removeEventListener("sofabaton-preview-activity", this._onPreviewActivity);
    }
    if (this._drawerResetTimer) clearTimeout(this._drawerResetTimer);
    this._store.disconnected();
    this._assist.disconnected();
  }
  _fireEvent(type, detail = {}) {
    this.dispatchEvent(
      new CustomEvent(type, { detail, bubbles: true, composed: true })
    );
  }
  // ---------- outside close (drawers + activity menu) ----------
  _installOutsideCloseHandler() {
    if (this._onOutsidePointerDown) return;
    this._onOutsidePointerDown = (e6) => {
      const path = typeof e6.composedPath === "function" ? e6.composedPath() : [];
      if (this._store.activeDrawer) {
        const clickedInOverlay = this._macrosOverlayRef.value && path.includes(this._macrosOverlayRef.value) || this._favoritesOverlayRef.value && path.includes(this._favoritesOverlayRef.value);
        const clickedInToggleRow = this._macroFavoritesRowRef.value && path.includes(this._macroFavoritesRowRef.value);
        if (!(clickedInOverlay || clickedInToggleRow)) {
          this._store.activeDrawer = null;
          this._scheduleDrawerDirectionReset();
          this._syncLayering();
          this.requestUpdate();
        }
      }
      if (this._store.activityMenuOpen) {
        const clickedInActivity = this._activityRowRef.value && path.includes(this._activityRowRef.value);
        if (!clickedInActivity) {
          this._store.activityMenuOpen = false;
          this._syncLayering();
        }
      }
    };
    document.addEventListener("pointerdown", this._onOutsidePointerDown, true);
  }
  _removeOutsideCloseHandler() {
    if (!this._onOutsidePointerDown) return;
    document.removeEventListener("pointerdown", this._onOutsidePointerDown, true);
    this._onOutsidePointerDown = null;
  }
  // ---------- drawers ----------
  _toggleDrawer(type) {
    this._store.activeDrawer = this._store.activeDrawer === type ? null : type;
    if (this._store.activeDrawer) {
      this._updateDrawerDirection();
    } else {
      this._scheduleDrawerDirectionReset();
    }
    this._syncLayering();
    this.requestUpdate();
  }
  _updateDrawerDirection() {
    if (!this._store.activeDrawer) return;
    const row = this._macroFavoritesRowRef.value;
    const overlay = this._store.activeDrawer === "favorites" ? this._favoritesOverlayRef.value : this._macrosOverlayRef.value;
    if (!row || !overlay) return;
    const rowRect = row.getBoundingClientRect();
    const cardRect = this._cardRef.value && typeof this._cardRef.value.getBoundingClientRect === "function" ? this._cardRef.value.getBoundingClientRect() : null;
    const nextUp = drawerDirection({
      desired: drawerDesiredHeight(overlay.scrollHeight || 0),
      rowTop: rowRect.top,
      rowBottom: rowRect.bottom,
      cardTop: cardRect?.top ?? null,
      cardBottom: cardRect?.bottom ?? null,
      viewportHeight: window.innerHeight
    }) === "up";
    if (nextUp !== this._drawerUp) {
      this._drawerUp = nextUp;
      this.requestUpdate();
    }
  }
  _scheduleDrawerDirectionReset() {
    if (this._drawerResetTimer) clearTimeout(this._drawerResetTimer);
    this._drawerResetTimer = setTimeout(() => {
      if (this._store.activeDrawer) return;
      if (this._drawerUp) {
        this._drawerUp = false;
        this.requestUpdate();
      }
    }, DRAWER_DIRECTION_RESET_MS);
  }
  _syncLayering() {
    const activityRow = this._activityRowRef.value;
    const mfContainer = this._mfContainerRef.value;
    if (!activityRow || !mfContainer) return;
    const z2 = layeringZIndexes(
      Boolean(this._store.activityMenuOpen),
      Boolean(this._store.activeDrawer)
    );
    activityRow.style.zIndex = z2.activity;
    mfContainer.style.zIndex = z2.drawer;
  }
  // ---------- activity select ----------
  _handleActivitySelect(ev) {
    if (this._editMode) return;
    const select = ev.target;
    const value = ev?.detail?.value ?? select?.value;
    if (value == null) return;
    const now = Date.now();
    if (String(value) === this._lastSelectedActivityValue && now - this._lastSelectedActivityAt < 250) {
      return;
    }
    this._lastSelectedActivityValue = String(value);
    this._lastSelectedActivityAt = now;
    this._fireEvent("haptic", "light");
    Promise.resolve(this._store.setActivity(value)).catch((err) => {
      console.error("[sofabaton-virtual-remote] Failed to set activity:", err);
    });
  }
  // ---------- theming (imperative, on the ha-card like the legacy) ----------
  _applyLocalTheme(themeName) {
    const root = this._cardRef.value;
    const hass = this._store.hass;
    if (!root || !hass) return;
    const bgOverrideCss = rgbToCss(this._store.config?.background_override);
    const appliedKey = `${themeName || ""}||${bgOverrideCss}`;
    if (this._appliedThemeKey === appliedKey) return;
    for (const cssVar of this._appliedThemeVars) {
      root.style.removeProperty(cssVar);
    }
    this._appliedThemeVars = [];
    this._appliedThemeKey = appliedKey;
    this._lastGroupRadius = null;
    let vars = null;
    if (themeName) {
      const def = hass.themes?.themes?.[themeName];
      if (def && typeof def === "object") {
        vars = def;
        const defWithModes = def;
        if (defWithModes.modes && typeof defWithModes.modes === "object") {
          const mode = hass.themes?.darkMode ? "dark" : "light";
          vars = { ...def, ...defWithModes.modes?.[mode] || {} };
          delete vars.modes;
        }
        for (const [k2, v3] of Object.entries(vars)) {
          if (v3 == null || typeof v3 !== "string" && typeof v3 !== "number") continue;
          const cssVar = k2.startsWith("--") ? k2 : `--${k2}`;
          root.style.setProperty(cssVar, String(v3));
          this._appliedThemeVars.push(cssVar);
        }
      }
    }
    const themeBg = vars?.["ha-card-background"] ?? vars?.["card-background-color"] ?? vars?.["ha-card-background-color"] ?? vars?.["primary-background-color"] ?? null;
    const finalBg = bgOverrideCss || themeBg;
    if (finalBg) {
      root.style.setProperty("--ha-card-background", String(finalBg));
      root.style.setProperty("--card-background-color", String(finalBg));
      root.style.setProperty("--ha-card-background-color", String(finalBg));
      root.style.setProperty("background", String(finalBg));
      root.style.setProperty("background-color", String(finalBg));
      this._appliedThemeVars.push(
        "--ha-card-background",
        "--card-background-color",
        "--ha-card-background-color",
        "background",
        "background-color"
      );
    } else {
      root.style.removeProperty("background");
      root.style.removeProperty("background-color");
    }
  }
  _updateGroupRadius() {
    const root = this._cardRef.value;
    if (!root) return;
    const cs = getComputedStyle(root);
    const candidates = [
      "--ha-card-border-radius",
      "--ha-control-border-radius",
      "--mdc-shape-medium",
      "--mdc-shape-small",
      "--mdc-shape-large"
    ];
    let radius = "";
    for (const name of candidates) {
      const v3 = (cs.getPropertyValue(name) || "").trim();
      if (v3) {
        radius = v3;
        break;
      }
    }
    if (!radius) radius = "18px";
    if (this._lastGroupRadius === radius) return;
    this._lastGroupRadius = radius;
    root.style.setProperty("--sb-group-radius", radius);
    if (!this._appliedThemeVars.includes("--sb-group-radius")) {
      this._appliedThemeVars.push("--sb-group-radius");
    }
  }
  _applyHostSizing() {
    const mw = this._store.config?.max_width;
    if (mw == null || mw === "" || mw === 0) {
      this.style.removeProperty("--remote-max-width");
    } else if (typeof mw === "number" && Number.isFinite(mw) && mw > 0) {
      this.style.setProperty("--remote-max-width", `${mw}px`);
    } else if (typeof mw === "string" && mw.trim()) {
      this.style.setProperty("--remote-max-width", mw.trim());
    }
    const shrink = this._store.config?.shrink;
    const shrinkNum = typeof shrink === "number" ? shrink : typeof shrink === "string" ? Number(shrink) : 0;
    if (!Number.isFinite(shrinkNum) || shrinkNum <= 0) {
      this.style.removeProperty("--remote-zoom");
    } else {
      const z2 = Math.max(0.1, Math.min(1, 1 - shrinkNum / 100));
      this.style.setProperty("--remote-zoom", String(z2));
    }
  }
  // ---------- layout-change crossfade ----------
  _prefersReducedMotion() {
    return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  _clearLayoutOverlay() {
    if (this._layoutOverlayEl) {
      this._layoutOverlayEl.remove();
      this._layoutOverlayEl = null;
    }
  }
  _maybeAnimateLayoutChange(nextSignature) {
    const layoutContainer = this._layoutContainerRef.value;
    const wrap = this._wrapRef.value;
    if (!layoutContainer || !wrap) return;
    if (this._layoutSignatureCache == null) {
      this._layoutSignatureCache = nextSignature;
      return;
    }
    if (this._layoutSignatureCache === nextSignature) return;
    this._layoutSignatureCache = nextSignature;
    if (this._prefersReducedMotion()) {
      this._clearLayoutOverlay();
      return;
    }
    const wrapRect = wrap.getBoundingClientRect();
    const layoutRect = layoutContainer.getBoundingClientRect();
    if (!wrapRect.width || !layoutRect.width) return;
    this._clearLayoutOverlay();
    const overlay = document.createElement("div");
    overlay.className = "layout-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.top = `${layoutRect.top - wrapRect.top}px`;
    overlay.style.left = `${layoutRect.left - wrapRect.left}px`;
    overlay.style.width = `${layoutRect.width}px`;
    overlay.style.height = `${layoutRect.height}px`;
    overlay.appendChild(layoutContainer.cloneNode(true));
    wrap.appendChild(overlay);
    this._layoutOverlayEl = overlay;
    const cleanup = () => {
      if (this._layoutOverlayEl === overlay) {
        overlay.remove();
        this._layoutOverlayEl = null;
      }
    };
    overlay.addEventListener(
      "transitionend",
      (ev) => {
        if (ev.target === overlay) cleanup();
      },
      { once: true }
    );
    requestAnimationFrame(() => {
      overlay.classList.add("layout-overlay--fade");
    });
    setTimeout(cleanup, 320);
  }
  // ---------- render ----------
  render() {
    if (!this._haElementsReady || !this._store.config || !this._store.hass) {
      return A;
    }
    const store = this._store;
    const derived = store.deriveRuntimeState();
    const layoutConfig = derived.layoutConfig;
    this._lastLayoutSignature = derived.layoutSignature;
    this._assist.observeActivityState({
      currentLabel: derived.currentLabel,
      activityId: derived.activityId != null ? Number(derived.activityId) : null,
      unavailable: derived.isUnavailable
    });
    if (!store.automationAssistEnabled() && this._assist.active) {
      this._assist.setActive(false);
    }
    this._assist.syncMqtt();
    const asRows = mfAsRows(layoutConfig);
    const macrosVisible = macrosButtonEnabled(layoutConfig);
    const favoritesVisible = favoritesButtonEnabled(layoutConfig);
    const macrosRowOn = asRows && macrosVisible;
    const favoritesRowOn = asRows && favoritesVisible;
    const showMacrosBtn = !asRows && macrosVisible;
    const showFavoritesBtn = !asRows && favoritesVisible;
    const disableAll = derived.isUnavailable || store.activityLoadingActive() || !this._editMode && derived.isPoweredOff;
    const drawerDisplayState = drawerVisibilityState({
      activeDrawer: store.activeDrawer,
      showMacrosButton: showMacrosBtn,
      showFavoritesButton: showFavoritesBtn,
      editMode: this._editMode,
      macros: derived.macros,
      favorites: derived.favorites,
      customFavorites: derived.customFavorites,
      disableAllButtons: disableAll
    });
    if (drawerDisplayState.closedByVisibility) {
      this._scheduleDrawerDirectionReset();
    }
    store.activeDrawer = drawerDisplayState.nextActiveDrawer;
    const keyParams = {
      hass: store.hass,
      isX2: derived.isX2,
      buttonVisibility: runtimeButtonVisibility({
        isX2: derived.isX2,
        showVolume: derived.showVolume,
        showChannel: derived.showChannel,
        showMedia: derived.showMedia,
        showDvr: derived.showDvr
      }),
      disableAll,
      editMode: this._editMode,
      isEnabled: (id) => store.isEnabled(id),
      onKeyPress: (spec) => this._onKeyPress(spec),
      showVolume: derived.showVolume,
      showChannel: derived.showChannel,
      showMedia: derived.showMedia,
      showDvr: derived.showDvr
    };
    const mfParams = {
      hass: store.hass,
      visible: drawerDisplayState.showMF,
      showMacrosButton: showMacrosBtn,
      showFavoritesButton: showFavoritesBtn,
      single: drawerDisplayState.visibleCount === 1,
      macrosDisabled: drawerDisplayState.macrosDisabled,
      favoritesDisabled: drawerDisplayState.favoritesDisabled,
      activeDrawer: store.activeDrawer,
      drawerUp: this._drawerUp,
      macros: derived.macros,
      favorites: derived.favorites,
      customFavorites: derived.customFavorites,
      currentActivityId: store.currentActivityId(),
      containerRef: this._mfContainerRef,
      rowRef: this._macroFavoritesRowRef,
      macrosOverlayRef: this._macrosOverlayRef,
      favoritesOverlayRef: this._favoritesOverlayRef,
      onToggleMacros: () => this._toggleDrawer("macros"),
      onToggleFavorites: () => this._toggleDrawer("favorites"),
      onDrawerItem: ({ model, itemType, rawItem }) => {
        this._assist.recordClick({
          label: model.label,
          commandId: model.commandId,
          deviceId: model.deviceId,
          commandType: model.commandType,
          icon: model.icon
        });
        store.triggerCommandPulse();
        void store.sendDrawerItem(itemType, model.commandId, model.deviceId, rawItem);
      },
      onCustomFavorite: ({ model, rawFavorite }) => {
        if (this._assist.active) {
          this._assist.setStatus(str().assist.notCaptured);
        }
        if (model.action) {
          void store.runLovelaceAction(model.action, rawFavorite);
          return;
        }
        if (!Number.isFinite(model.commandId) || !Number.isFinite(model.deviceId)) {
          return;
        }
        store.triggerCommandPulse();
        void store.sendCustomFavoriteCommand(model.commandId, model.deviceId);
      }
    };
    const sharedRows = mfRowVisibleRows(layoutConfig);
    const midEnabled = (layoutConfig.show_mid ?? true) && (derived.showVolume || derived.showChannel);
    const mediaEnabled = derived.isX2 ? derived.showMedia || derived.showDvr : derived.showMedia;
    const order = store.groupOrderList(derived.activityId);
    const groupTemplates = {
      activity: () => renderActivityRow({
        hass: store.hass,
        visible: Boolean(layoutConfig.show_activity),
        unavailable: derived.isUnavailable,
        options: derived.selectState?.options ?? [],
        resolvedValue: derived.selectState?.resolvedValue ?? "",
        disabled: Boolean(derived.selectState?.disabled),
        loading: store.isLoadingActive(),
        onSelect: (ev) => this._handleActivitySelect(ev),
        onMenuOpened: () => {
          store.activityMenuOpen = true;
          this._syncLayering();
        },
        onMenuClosed: () => {
          store.activityMenuOpen = false;
          this._syncLayering();
        },
        rowRef: this._activityRowRef
      }),
      macro_favorites: () => renderMacroFavorites(mfParams),
      macros_row: () => renderInlineDrawerRow({
        kind: "macros",
        visible: macrosRowOn,
        visibleRows: sharedRows,
        items: macrosRowOn ? derived.macros.map((m3) => renderDrawerButton(mfParams, m3, "macros")) : [],
        emptyText: str().card.noMacros
      }),
      favorites_row: () => renderInlineDrawerRow({
        kind: "favorites",
        visible: favoritesRowOn,
        visibleRows: sharedRows,
        items: favoritesRowOn ? [
          ...derived.customFavorites.map(
            (f4) => renderCustomFavoriteButton(mfParams, f4)
          ),
          ...derived.favorites.map(
            (f4) => renderDrawerButton(mfParams, f4, "favorites")
          )
        ] : [],
        emptyText: str().card.noFavorites
      }),
      dpad: () => renderDpad(keyParams, Boolean(layoutConfig.show_dpad)),
      nav: () => renderNavRow(keyParams, Boolean(layoutConfig.show_nav)),
      mid: () => renderMid(keyParams, midEnabled),
      media: () => renderMedia(keyParams, mediaEnabled),
      colors: () => renderColors(keyParams, Boolean(layoutConfig.show_colors)),
      abc: () => renderAbc(keyParams, Boolean(layoutConfig.show_abc) && derived.isX2)
    };
    const warnText = derived.isUnavailable ? str().card.remoteUnavailable : derived.noActivitiesMessage;
    return b2`
      <ha-card ${n6(this._cardRef)}>
        ${renderAssistModal({ visible: true, controller: this._assist })}
        <div class="wrap" ${n6(this._wrapRef)}>
          ${renderAssistRow({
      visible: Boolean(store.config?.show_automation_assist),
      controller: this._assist
    })}
          <div class="layout-container" ${n6(this._layoutContainerRef)}>
            ${c6(
      order.filter((key) => key in groupTemplates),
      (key) => key,
      (key) => groupTemplates[key]()
    )}
            <div class="warn" style=${warnText ? "display: block;" : "display: none;"}>
              ${warnText}
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }
  _onKeyPress(spec) {
    this._assist.recordClick({
      label: automationAssistLabelForKey(spec.key, spec.color ? spec.key : spec.label),
      commandId: spec.cmd,
      deviceId: this._store.commandTarget(spec.id)?.activity_id ?? null,
      commandType: "assigned",
      icon: spec.color ? null : spec.icon || null
    });
    this._store.triggerCommandPulse();
    void this._store.sendCommand(
      spec.cmd,
      this._store.commandTarget(spec.id)?.activity_id ?? this._store.currentActivityId()
    );
  }
  updated(_changed) {
    this._applyLocalTheme(String(this._store.config?.theme ?? ""));
    this._updateGroupRadius();
    this._applyHostSizing();
    if (this._lastLayoutSignature != null) {
      this._maybeAnimateLayoutChange(this._lastLayoutSignature);
    }
    this._updateDrawerDirection();
    this._syncLayering();
  }
};
SofabatonRemoteCard.styles = [
  r(REMOTE_CARD_CSS),
  // The legacy wrappers were plain divs; custom-element hosts default to
  // inline, so pin the block display the layout expects.
  i`
      sb-key-button {
        display: block;
      }
    `
];

// custom_components/sofabaton_x1s/www/src/remote-card-translations/ar.ts
var isolate = (value) => `\u2068${value}\u2069`;
var REMOTE_CARD_STRINGS_AR = {
  card: {
    selectEntityError: "\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 Sofabaton",
    remoteUnavailable: "\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u063A\u064A\u0631 \u0645\u062A\u0627\u062D (\u0631\u0628\u0645\u0627 \u0644\u0623\u0646 \u062A\u0637\u0628\u064A\u0642 Sofabaton \u0645\u062A\u0635\u0644).",
    noActivitiesWarning: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0623\u064A \u0623\u0646\u0634\u0637\u0629 \u0641\u064A \u0633\u0645\u0627\u062A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F.",
    noMacros: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0648\u062D\u062F\u0627\u062A \u0645\u0627\u0643\u0631\u0648 \u0645\u062A\u0627\u062D\u0629",
    noFavorites: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0641\u0636\u0644\u0627\u062A \u0645\u062A\u0627\u062D\u0629",
    macrosTab: "\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 >",
    favoritesTab: "\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A >",
    activitySelectLabel: "\u0627\u0644\u0646\u0634\u0627\u0637",
    poweredOff: "\u0645\u062A\u0648\u0642\u0641 \u0639\u0646 \u0627\u0644\u062A\u0634\u063A\u064A\u0644",
    defaultLayout: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A",
    activityFallback: (id) => `\u0627\u0644\u0646\u0634\u0627\u0637 ${isolate(id)}`
  },
  assist: {
    label: "\u0627\u0644\u062A\u0642\u0627\u0637 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    start: "\u0628\u062F\u0621",
    waiting: "\u0641\u064A \u0627\u0646\u062A\u0638\u0627\u0631 \u0636\u063A\u0637\u0629 \u0632\u0631",
    exitEditMode: "\u0627\u062E\u0631\u062C \u0645\u0646 \u0648\u0636\u0639 \u0627\u0644\u062A\u062D\u0631\u064A\u0631 \u0644\u0644\u0628\u062F\u0621",
    captured: (label) => `\u062A\u0645 \u0627\u0644\u0627\u0644\u062A\u0642\u0627\u0637: ${isolate(label)}`,
    notCaptured: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0627\u0644\u062A\u0642\u0627\u0637.",
    working: "\u062C\u0627\u0631\u064D \u0627\u0644\u062A\u0646\u0641\u064A\u0630\u2026",
    triggersReady: "\u0627\u0644\u0645\u0634\u063A\u0651\u0644\u0627\u062A \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",
    createTriggers: "\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A MQTT Discovery",
    startCapturing: "\u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",
    deviceDetectedTitle: "\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u062C\u0647\u0627\u0632 \u0641\u064A Home Assistant.",
    close: "\u0625\u063A\u0644\u0627\u0642",
    alsoActivityTriggers: "\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u064A\u0636\u064B\u0627 \u0639\u0646\u062F \u062A\u063A\u064A\u0651\u0631 \u0627\u0644\u0646\u0634\u0627\u0637.",
    seeDocs: "\u0631\u0627\u062C\u0639 \u0648\u062B\u0627\u0626\u0642 \u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629.",
    dontShowAgain: "\u0639\u062F\u0645 \u0625\u0638\u0647\u0627\u0631 \u0647\u0630\u0627 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649 \u0644\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 (\u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629).",
    detectedDevice: (name) => `\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u062C\u0647\u0627\u0632 MQTT: ${isolate(name)}.`,
    lastCommand: (name) => `\u0622\u062E\u0631 \u0623\u0645\u0631: ${isolate(name)}.`,
    existingTriggers: "\u0639\u064F\u062B\u0631 \u0639\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u062A\u0645\u062A\u0629 MQTT \u0645\u0648\u062C\u0648\u062F\u0629 \u0645\u0633\u0628\u0642\u064B\u0627.",
    noMqttCommands: "\u0644\u0645 \u062A\u064F\u0643\u062A\u0634\u0641 \u0623\u064A \u0623\u0648\u0627\u0645\u0631 MQTT \u062D\u062A\u0649 \u0627\u0644\u0622\u0646",
    deviceFallback: (id) => `\u0627\u0644\u062C\u0647\u0627\u0632 ${isolate(id)}`,
    unknownDevice: "\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
    commandFallback: (id) => `\u0627\u0644\u0623\u0645\u0631 ${isolate(id)}`,
    createdTriggers: (count, deviceLabel) => `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 ${isolate(count)} \u0645\u0646 \u0645\u0634\u063A\u0651\u0644\u0627\u062A MQTT Discovery \u0644\u0640 ${isolate(deviceLabel)}`,
    createdActivityTriggers: (count) => `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 ${isolate(count)} \u0645\u0646 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637 \u0644\u0640 X2 \u2192 Activities`,
    plusActivityTriggers: (count) => `\u060C \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 ${isolate(count)} \u0645\u0646 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637`,
    allTriggersExist: (deviceLabel) => `\u062C\u0645\u064A\u0639 \u0645\u0634\u063A\u0651\u0644\u0627\u062A MQTT Discovery \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0640 ${isolate(deviceLabel)} \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0627\u0644\u0641\u0639\u0644`,
    buttonFallback: "\u0632\u0631",
    activityFallbackLabel: "\u0646\u0634\u0627\u0637",
    unknown: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
    automationAssistName: "Automation Assist",
    notification: {
      title: "\u{1F6E0}\uFE0F Automation Assist",
      eventButton: (label) => `\u0627\u0644\u0632\u0631: ${isolate(label)}`,
      eventActivity: (label) => `\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637: ${isolate(label)}`,
      eventOther: (label) => `\u0627\u0644\u062D\u062F\u062B: ${isolate(label)}`,
      header: (activityName, eventLabel) => `**\u0627\u0644\u0646\u0634\u0627\u0637: ${isolate(activityName)} | ${isolate(eventLabel)}**`,
      lovelaceHeading: "\u{1F4CB} **\u0631\u0645\u0632 \u0632\u0631 Lovelace**",
      lovelaceCopy: "*\u0627\u0646\u0633\u062E \u0647\u0630\u0627 \u0625\u0644\u0649 YAML \u0627\u0644\u062E\u0627\u0635 \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A:*",
      serviceHeading: "\u2699\uFE0F **\u0627\u0633\u062A\u062F\u0639\u0627\u0621 \u0627\u0644\u062E\u062F\u0645\u0629 (\u0627\u0644\u0623\u062A\u0645\u062A\u0629)**",
      serviceCopy: "*\u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0627 \u0641\u064A \u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u0646\u0635\u064A\u0629 \u0623\u0648 \u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 Sofabaton",
      theme: "\u062A\u0637\u0628\u064A\u0642 \u0633\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0628\u0637\u0627\u0642\u0629",
      use_background_override: "\u062A\u062E\u0635\u064A\u0635 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",
      background_override: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",
      show_activity: "\u0645\u062D\u062F\u0651\u062F \u0627\u0644\u0646\u0634\u0627\u0637",
      show_dpad: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",
      show_nav: "\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
      show_mid: "\u0623\u0632\u0631\u0627\u0631 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u0642\u0646\u0627\u0629",
      show_media: "\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062A\u062D\u0643\u0645 \u0641\u064A \u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0648\u0633\u0627\u0626\u0637",
      show_colors: "\u0623\u062D\u0645\u0631/\u0623\u062E\u0636\u0631/\u0623\u0635\u0641\u0631/\u0623\u0632\u0631\u0642",
      show_abc: "\u0623\u0632\u0631\u0627\u0631 A/B/C",
      show_macros_button: "\u0632\u0631 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
      show_favorites_button: "\u0632\u0631 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
      max_width: "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0639\u0631\u0636 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 (\u0628\u0627\u0644\u0628\u0643\u0633\u0644)",
      group_order: "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A"
    },
    automationAssistTitle: "\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",
    keyCapture: "\u0627\u0644\u062A\u0642\u0627\u0637 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    keyCaptureDescription: "\u0623\u0631\u0633\u0644 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0625\u0644\u0649 \u0627\u0644\u0645\u062D\u0648\u0631 \u0644\u0625\u0646\u0634\u0627\u0621 YAML \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0644\u0623\u0632\u0631\u0627\u0631 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629.",
    keyCaptureLearnMore: "\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u0649 \u0627\u0644\u0645\u0632\u064A\u062F \u062D\u0648\u0644 \u0627\u0644\u062A\u0642\u0627\u0637 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    keyCaptureDocsAria: "\u0648\u062B\u0627\u0626\u0642 \u0627\u0644\u062A\u0642\u0627\u0637 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    stylingOptions: "\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0638\u0647\u0631",
    layoutOptions: "\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u062E\u0637\u064A\u0637",
    layoutSelectLabel: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637",
    defaultLayoutOption: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A",
    macrosFavoritesAsRows: "\u0639\u0631\u0636 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648/\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A \u0643\u0635\u0641\u0648\u0641",
    visibleRows: "\u0627\u0644\u0635\u0641\u0648\u0641 \u0627\u0644\u0645\u0631\u0626\u064A\u0629",
    moveGroupUp: (groupLabel2) => `\u0646\u0642\u0644 ${isolate(groupLabel2)} \u0625\u0644\u0649 \u0623\u0639\u0644\u0649`,
    moveGroupDown: (groupLabel2) => `\u0646\u0642\u0644 ${isolate(groupLabel2)} \u0625\u0644\u0649 \u0623\u0633\u0641\u0644`,
    macros: "\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    favorites: "\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    volume: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",
    channel: "\u0627\u0644\u0642\u0646\u0627\u0629",
    mediaControls: "\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062A\u062D\u0643\u0645 \u0641\u064A \u0627\u0644\u0648\u0633\u0627\u0626\u0637",
    dvr: "DVR",
    resetCardDefault: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646 \u0625\u0644\u0649 \u0627\u0644\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0628\u0637\u0627\u0642\u0629",
    resetDefaultLayout: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u062A\u0639\u064A\u064A\u0646 \u0625\u0644\u0649 \u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A",
    noteDefaultLayout: "\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",
    noteCustomLayout: "\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u062A\u062E\u0637\u064A\u0637 \u0645\u062E\u0635\u0651\u0635",
    noteUsingDefault: "\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A"
  },
  groups: {
    activity: "\u0645\u062D\u062F\u0651\u062F \u0627\u0644\u0646\u0634\u0627\u0637",
    macro_favorites: "\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648/\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    macros_row: "\u0635\u0641 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    favorites_row: "\u0635\u0641 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    dpad: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",
    nav: "\u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    mid: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A/\u0627\u0644\u0642\u0646\u0627\u0629",
    media: "\u0639\u0646\u0627\u0635\u0631 \u0627\u0644\u062A\u062D\u0643\u0645 \u0641\u064A \u0627\u0644\u0648\u0633\u0627\u0626\u0637",
    colors: "\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0623\u0644\u0648\u0627\u0646",
    abc: "A/B/C"
  },
  keys: {
    up: "\u0623\u0639\u0644\u0649",
    down: "\u0623\u0633\u0641\u0644",
    left: "\u064A\u0633\u0627\u0631",
    right: "\u064A\u0645\u064A\u0646",
    ok: "\u0645\u0648\u0627\u0641\u0642",
    back: "\u0631\u062C\u0648\u0639",
    home: "\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629",
    menu: "\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    volup: "\u0631\u0641\u0639 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",
    voldn: "\u062E\u0641\u0636 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",
    mute: "\u0643\u062A\u0645 \u0627\u0644\u0635\u0648\u062A",
    chup: "\u0627\u0644\u0642\u0646\u0627\u0629 +",
    chdn: "\u0627\u0644\u0642\u0646\u0627\u0629 -",
    guide: "\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C",
    dvr: "DVR",
    play: "\u062A\u0634\u063A\u064A\u0644",
    exit: "\u062E\u0631\u0648\u062C",
    rew: "\u062A\u0631\u062C\u064A\u0639",
    pause: "\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A",
    fwd: "\u062A\u0642\u062F\u064A\u0645 \u0633\u0631\u064A\u0639",
    red: "\u0623\u062D\u0645\u0631",
    green: "\u0623\u062E\u0636\u0631",
    yellow: "\u0623\u0635\u0641\u0631",
    blue: "\u0623\u0632\u0631\u0642",
    a: "A",
    b: "B",
    c: "C"
  }
};
registerRemoteCardTranslation("ar", REMOTE_CARD_STRINGS_AR);

// custom_components/sofabaton_x1s/www/src/remote-card-translations/en-gb.ts
registerRemoteCardTranslation("en-gb", {
  card: {
    favoritesTab: "Favourites >",
    noFavorites: "No favourites available"
  },
  editor: {
    fieldLabels: {
      use_background_override: "Customise background colour",
      background_override: "Select Background Colour",
      show_favorites_button: "Favourites Button"
    },
    favorites: "Favourites",
    macrosFavoritesAsRows: "Macros/Favourites as rows"
  },
  groups: {
    macro_favorites: "Macros/Favourites",
    favorites_row: "Favourites Row",
    colors: "Colour Buttons"
  }
});

// custom_components/sofabaton_x1s/www/src/remote-card-translations/de.ts
registerRemoteCardTranslation("de", {
  card: {
    selectEntityError: "W\xE4hle eine Sofabaton-Fernbedienungsentit\xE4t aus",
    remoteUnavailable: "Die Fernbedienung ist nicht verf\xFCgbar (m\xF6glicherweise ist die Sofabaton-App verbunden).",
    noActivitiesWarning: "Keine Aktivit\xE4ten in den Attributen der Fernbedienung gefunden.",
    noMacros: "Keine Makros verf\xFCgbar",
    noFavorites: "Keine Favoriten verf\xFCgbar",
    macrosTab: "Makros >",
    favoritesTab: "Favoriten >",
    activitySelectLabel: "Aktivit\xE4t",
    poweredOff: "Ausgeschaltet",
    defaultLayout: "Standardlayout",
    activityFallback: (id) => `Aktivit\xE4t ${id}`
  },
  assist: {
    label: "Tastendr\xFCcke erfassen",
    start: "Starten",
    waiting: "Warten auf Tastendruck",
    exitEditMode: "Bearbeitungsmodus verlassen, um zu beginnen",
    captured: (label) => `Erfasst: ${label}`,
    notCaptured: "Nicht erfasst.",
    working: "Wird ausgef\xFChrt \u2026",
    triggersReady: "Ausl\xF6ser einsatzbereit",
    createTriggers: "MQTT-Discovery-Ausl\xF6ser erstellen",
    startCapturing: "Befehlserfassung starten",
    deviceDetectedTitle: "Home Assistant-Ger\xE4t erkannt.",
    close: "Schlie\xDFen",
    alsoActivityTriggers: "Zus\xE4tzlich Ausl\xF6ser f\xFCr Aktivit\xE4tswechsel erstellen.",
    seeDocs: "Dokumentation zu dieser Funktion anzeigen.",
    dontShowAgain: "F\xFCr dieses Ger\xE4t nicht erneut anzeigen (in dieser Sitzung).",
    detectedDevice: (name) => `MQTT-Ger\xE4t erkannt: ${name}.`,
    lastCommand: (name) => `Letzter Befehl: ${name}.`,
    existingTriggers: "Vorhandene MQTT-Automatisierungsausl\xF6ser wurden gefunden.",
    noMqttCommands: "Noch keine MQTT-Befehle erkannt",
    deviceFallback: (id) => `Ger\xE4t ${id}`,
    unknownDevice: "Unbekanntes Ger\xE4t",
    commandFallback: (id) => `Befehl ${id}`,
    createdTriggers: (count, deviceLabel) => `${count} MQTT-Discovery-Ausl\xF6ser f\xFCr ${deviceLabel} ${count === 1 ? "wurde" : "wurden"} erstellt`,
    createdActivityTriggers: (count) => `${count} Aktivit\xE4tsausl\xF6ser f\xFCr X2 \u2192 Activities ${count === 1 ? "wurde" : "wurden"} erstellt`,
    plusActivityTriggers: (count) => `; zus\xE4tzlich ${count} Aktivit\xE4tsausl\xF6ser ${count === 1 ? "wurde" : "wurden"} erstellt`,
    allTriggersExist: (deviceLabel) => `Alle MQTT-Discovery-Ausl\xF6ser f\xFCr ${deviceLabel} sind bereits vorhanden`,
    buttonFallback: "Taste",
    activityFallbackLabel: "Aktivit\xE4t",
    unknown: "Unbekannt",
    automationAssistName: "Automation Assist",
    notification: {
      title: "\u{1F6E0}\uFE0F Automation Assist",
      eventButton: (label) => `Taste: ${label}`,
      eventActivity: (label) => `Aktivit\xE4tswechsel: ${label}`,
      eventOther: (label) => `Ereignis: ${label}`,
      header: (activityName, eventLabel) => `**Aktivit\xE4t: ${activityName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace-Schaltfl\xE4chencode**",
      lovelaceCopy: "*In das Dashboard-YAML kopieren:*",
      serviceHeading: "\u2699\uFE0F **Dienstaufruf (Automatisierung)**",
      serviceCopy: "*In Skripten oder Automatisierungen verwenden:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Sofabaton-Fernbedienungsentit\xE4t ausw\xE4hlen",
      theme: "Theme auf die Karte anwenden",
      use_background_override: "Hintergrundfarbe anpassen",
      background_override: "Hintergrundfarbe ausw\xE4hlen",
      show_activity: "Aktivit\xE4tsauswahl",
      show_dpad: "Steuerkreuz",
      show_nav: "Zur\xFCck-, Home- und Men\xFC-Tasten",
      show_mid: "Lautst\xE4rke- und Kanalwippen",
      show_media: "Mediensteuerung",
      show_colors: "Rot/Gr\xFCn/Gelb/Blau",
      show_abc: "A/B/C-Tasten",
      show_macros_button: "Makrotaste",
      show_favorites_button: "Favoritentaste",
      max_width: "Maximale Kartenbreite (px)",
      group_order: "Gruppenreihenfolge"
    },
    automationAssistTitle: "Automatisierungsassistent",
    keyCapture: "Tastendr\xFCcke erfassen",
    keyCaptureDescription: "Sende Tastendr\xFCcke an den Hub, um sofort einsatzbereites YAML f\xFCr Dashboard-Schaltfl\xE4chen und Automatisierungen zu erzeugen.",
    keyCaptureLearnMore: "Mehr \xFCber die Tastenerfassung erfahren",
    keyCaptureDocsAria: "Dokumentation zur Tastenerfassung",
    stylingOptions: "Stiloptionen",
    layoutOptions: "Layoutoptionen",
    layoutSelectLabel: "Layout",
    defaultLayoutOption: "Standardlayout",
    macrosFavoritesAsRows: "Makros/Favoriten als Zeilen",
    visibleRows: "Sichtbare Zeilen",
    moveGroupUp: (groupLabel2) => `${groupLabel2} nach oben verschieben`,
    moveGroupDown: (groupLabel2) => `${groupLabel2} nach unten verschieben`,
    macros: "Makros",
    favorites: "Favoriten",
    volume: "Lautst\xE4rke",
    channel: "Kanal",
    mediaControls: "Mediensteuerung",
    dvr: "DVR",
    resetCardDefault: "Auf Kartenvorgabe zur\xFCcksetzen",
    resetDefaultLayout: "Standardlayout zur\xFCcksetzen",
    noteDefaultLayout: "F\xFCr Aktivit\xE4ten ohne eigenes Layout",
    noteCustomLayout: "Benutzerdefiniertes Layout aktiv",
    noteUsingDefault: "Standardlayout aktiv"
  },
  groups: {
    activity: "Aktivit\xE4tsauswahl",
    macro_favorites: "Makros/Favoriten",
    macros_row: "Makrozeile",
    favorites_row: "Favoritenzeile",
    dpad: "Steuerkreuz",
    nav: "Zur\xFCck/Home/Men\xFC",
    mid: "Lautst\xE4rke/Kanal",
    media: "Mediensteuerung",
    colors: "Farbtasten",
    abc: "A/B/C"
  },
  keys: {
    up: "Nach oben",
    down: "Nach unten",
    left: "Nach links",
    right: "Nach rechts",
    ok: "OK",
    back: "Zur\xFCck",
    home: "Home",
    menu: "Men\xFC",
    volup: "Lautst\xE4rke +",
    voldn: "Lautst\xE4rke -",
    mute: "Stumm",
    chup: "Kanal +",
    chdn: "Kanal -",
    guide: "Programm\xFCbersicht",
    dvr: "DVR",
    play: "Wiedergabe",
    exit: "Beenden",
    rew: "Zur\xFCckspulen",
    pause: "Pause",
    fwd: "Vorspulen",
    red: "Rot",
    green: "Gr\xFCn",
    yellow: "Gelb",
    blue: "Blau",
    a: "A",
    b: "B",
    c: "C"
  }
});

// custom_components/sofabaton_x1s/www/src/remote-card-translations/nl.ts
registerRemoteCardTranslation("nl", {
  card: {
    selectEntityError: "Selecteer een Sofabaton remote-entiteit",
    remoteUnavailable: "De remote is niet beschikbaar (mogelijk omdat de Sofabaton-app verbonden is).",
    noActivitiesWarning: "Geen activiteiten gevonden in de remote-attributen.",
    noMacros: "Geen macro's beschikbaar",
    noFavorites: "Geen favorieten beschikbaar",
    macrosTab: "Macro's >",
    favoritesTab: "Favorieten >",
    activitySelectLabel: "Activiteit",
    poweredOff: "Uitgeschakeld",
    defaultLayout: "Standaardindeling",
    activityFallback: (id) => `Activiteit ${id}`
  },
  assist: {
    label: "Knopdrukken registreren",
    start: "Starten",
    waiting: "Wachten op een toetsdruk",
    exitEditMode: "Verlaat de kaart configuratie om te beginnen",
    captured: (label) => `Vastgelegd: ${label}`,
    notCaptured: "Niet vastgelegd.",
    working: "Bezig...",
    triggersReady: "Triggers klaar voor gebruik",
    createTriggers: "MQTT Discovery-triggers aanmaken",
    startCapturing: "Begin met commando's vastleggen",
    deviceDetectedTitle: "Home Assistant-apparaat gedetecteerd.",
    close: "Sluiten",
    alsoActivityTriggers: "Maak ook triggers aan voor activiteitswisselingen.",
    seeDocs: "Bekijk de documentatie voor deze functie.",
    dontShowAgain: "Dit niet meer tonen voor dit apparaat (in deze sessie).",
    detectedDevice: (name) => `MQTT-apparaat gedetecteerd: ${name}.`,
    lastCommand: (name) => `Laatste commando: ${name}.`,
    existingTriggers: "Er zijn bestaande MQTT-automatiseringstriggers gevonden.",
    noMqttCommands: "Nog geen MQTT-commando's ontdekt",
    deviceFallback: (id) => `Apparaat ${id}`,
    unknownDevice: "Onbekend apparaat",
    commandFallback: (id) => `Commando ${id}`,
    createdTriggers: (count, deviceLabel) => `${count} MQTT Discovery-triggers aangemaakt voor ${deviceLabel}`,
    createdActivityTriggers: (count) => `${count} activiteitstriggers aangemaakt voor X2 \u2192 Activities`,
    plusActivityTriggers: (count) => ` plus ${count} activiteitstriggers`,
    allTriggersExist: (deviceLabel) => `Alle MQTT Discovery-triggers bestaan al voor ${deviceLabel}`,
    buttonFallback: "Knop",
    activityFallbackLabel: "Activiteit",
    unknown: "Onbekend",
    automationAssistName: "Automation Assist",
    notification: {
      title: "\u{1F6E0}\uFE0F Automation Assist",
      eventButton: (label) => `Knop: ${label}`,
      eventActivity: (label) => `Activiteitswissel: ${label}`,
      eventOther: (label) => `Gebeurtenis: ${label}`,
      header: (activityName, eventLabel) => `**Activiteit: ${activityName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace-knopcode**",
      lovelaceCopy: "*Kopieer dit naar je dashboard-YAML:*",
      serviceHeading: "\u2699\uFE0F **Service-aanroep (automatisering)**",
      serviceCopy: "*Gebruik dit in je scripts of automatiseringen:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Selecteer een Sofabaton remote-entiteit",
      theme: "Pas een thema toe op de kaart",
      use_background_override: "Achtergrondkleur aanpassen",
      background_override: "Kies een achtergrondkleur",
      show_activity: "Activiteitenkiezer",
      show_dpad: "Richtingstoetsen",
      show_nav: "Terug/Home/Menu-toetsen",
      show_mid: "Volume-/kanaaltoetsen",
      show_media: "Mediabediening",
      show_colors: "Rood/groen/geel/blauw",
      show_abc: "A/B/C-knoppen",
      show_macros_button: "Macro's-knop",
      show_favorites_button: "Favorieten-knop",
      max_width: "Maximale kaartbreedte (px)",
      group_order: "Groepsvolgorde"
    },
    automationAssistTitle: "Automatiseringshulp",
    keyCapture: "Knopdrukken registreren",
    keyCaptureDescription: "Druk knoppen in op de Virtual Remote om direct bruikbare YAML te genereren voor dashboardknoppen en automatiseringen.",
    keyCaptureLearnMore: "Meer informatie over Toetsen vastleggen",
    keyCaptureDocsAria: "Documentatie over Knopdrukken registreren",
    stylingOptions: "Stijlopties",
    layoutOptions: "Indelingsopties",
    layoutSelectLabel: "Indeling",
    defaultLayoutOption: "Standaardindeling",
    macrosFavoritesAsRows: "Macro's/favorieten als rijen",
    visibleRows: "Zichtbare rijen",
    moveGroupUp: (groupLabel2) => `Verplaats ${groupLabel2} omhoog`,
    moveGroupDown: (groupLabel2) => `Verplaats ${groupLabel2} omlaag`,
    macros: "Macro's",
    favorites: "Favorieten",
    volume: "Volume",
    channel: "Kanaal",
    mediaControls: "Mediabediening",
    dvr: "DVR",
    resetCardDefault: "Terug naar kaartstandaard",
    resetDefaultLayout: "Terug naar standaardindeling",
    noteDefaultLayout: "Gebruikt voor activiteiten zonder eigen indeling",
    noteCustomLayout: "Aangepaste indeling in gebruik",
    noteUsingDefault: "Standaardindeling in gebruik"
  },
  groups: {
    activity: "Activiteitenkiezer",
    macro_favorites: "Macro's/favorieten",
    macros_row: "Macro's-rij",
    favorites_row: "Favorietenrij",
    dpad: "Richtingstoetsen",
    nav: "Terug/Home/Menu",
    mid: "Volume/kanaal",
    media: "Mediabediening",
    colors: "Kleurknoppen",
    abc: "A/B/C"
  },
  keys: {
    up: "Omhoog",
    down: "Omlaag",
    left: "Links",
    right: "Rechts",
    ok: "OK",
    back: "Terug",
    home: "Home",
    menu: "Menu",
    volup: "Vol +",
    voldn: "Vol -",
    mute: "Dempen",
    chup: "Kan +",
    chdn: "Kan -",
    guide: "Gids",
    dvr: "DVR",
    play: "Afspelen",
    exit: "Afsluiten",
    rew: "Terugspoelen",
    pause: "Pauze",
    fwd: "Vooruitspoelen",
    red: "Rood",
    green: "Groen",
    yellow: "Geel",
    blue: "Blauw",
    a: "A",
    b: "B",
    c: "C"
  }
});

// custom_components/sofabaton_x1s/www/src/remote-card.ts
var win = window;
logPillsOnce();
if (!customElements.get(EDITOR))
  customElements.define(EDITOR, SofabatonRemoteCardEditor);
if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);
win.customCards = win.customCards || [];
if (!win.customCards.some((c7) => c7.type === TYPE)) {
  win.customCards.push({
    type: TYPE,
    name: "Sofabaton Virtual Remote",
    description: "A configurable remote for the Sofabaton X1, X1S and X2 integration.",
    // Card picker (HA 2026.6+): recommend this card for Sofabaton remote
    // entities, which is exactly what it binds to.
    getEntitySuggestion: (hass, entityId) => {
      if (!entityId.startsWith("remote.")) return null;
      const platform = String(hass?.entities?.[entityId]?.platform || "");
      if (platform !== "sofabaton_x1s" && platform !== "sofabaton_hub") return null;
      return { config: { type: `custom:${TYPE}`, entity: entityId } };
    }
  });
}
