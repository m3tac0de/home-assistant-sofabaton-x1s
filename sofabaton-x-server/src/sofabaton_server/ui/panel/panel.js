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
  let i8 = t5;
  switch (s7) {
    case Boolean:
      i8 = null !== t5;
      break;
    case Number:
      i8 = null === t5 ? null : Number(t5);
      break;
    case Object:
    case Array:
      try {
        i8 = JSON.parse(t5);
      } catch (t6) {
        i8 = null;
      }
  }
  return i8;
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
      const i8 = /* @__PURE__ */ Symbol(), h6 = this.getPropertyDescriptor(t5, i8, s7);
      void 0 !== h6 && e2(this.prototype, t5, h6);
    }
  }
  static getPropertyDescriptor(t5, s7, i8) {
    const { get: e6, set: r6 } = h(this.prototype, t5) ?? { get() {
      return this[s7];
    }, set(t6) {
      this[s7] = t6;
    } };
    return { get: e6, set(s8) {
      const h6 = e6?.call(this);
      r6?.call(this, s8), this.requestUpdate(t5, h6, i8);
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
      for (const i8 of s7) this.createProperty(i8, t6[i8]);
    }
    const t5 = this[Symbol.metadata];
    if (null !== t5) {
      const s7 = litPropertyMetadata.get(t5);
      if (void 0 !== s7) for (const [t6, i8] of s7) this.elementProperties.set(t6, i8);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t6, s7] of this.elementProperties) {
      const i8 = this._$Eu(t6, s7);
      void 0 !== i8 && this._$Eh.set(i8, t6);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s7) {
    const i8 = [];
    if (Array.isArray(s7)) {
      const e6 = new Set(s7.flat(1 / 0).reverse());
      for (const s8 of e6) i8.unshift(c(s8));
    } else void 0 !== s7 && i8.push(c(s7));
    return i8;
  }
  static _$Eu(t5, s7) {
    const i8 = s7.attribute;
    return false === i8 ? void 0 : "string" == typeof i8 ? i8 : "string" == typeof t5 ? t5.toLowerCase() : void 0;
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
    for (const i8 of s7.keys()) this.hasOwnProperty(i8) && (t5.set(i8, this[i8]), delete this[i8]);
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
  attributeChangedCallback(t5, s7, i8) {
    this._$AK(t5, i8);
  }
  _$ET(t5, s7) {
    const i8 = this.constructor.elementProperties.get(t5), e6 = this.constructor._$Eu(t5, i8);
    if (void 0 !== e6 && true === i8.reflect) {
      const h6 = (void 0 !== i8.converter?.toAttribute ? i8.converter : u).toAttribute(s7, i8.type);
      this._$Em = t5, null == h6 ? this.removeAttribute(e6) : this.setAttribute(e6, h6), this._$Em = null;
    }
  }
  _$AK(t5, s7) {
    const i8 = this.constructor, e6 = i8._$Eh.get(t5);
    if (void 0 !== e6 && this._$Em !== e6) {
      const t6 = i8.getPropertyOptions(e6), h6 = "function" == typeof t6.converter ? { fromAttribute: t6.converter } : void 0 !== t6.converter?.fromAttribute ? t6.converter : u;
      this._$Em = e6;
      const r6 = h6.fromAttribute(s7, t6.type);
      this[e6] = r6 ?? this._$Ej?.get(e6) ?? r6, this._$Em = null;
    }
  }
  requestUpdate(t5, s7, i8, e6 = false, h6) {
    if (void 0 !== t5) {
      const r6 = this.constructor;
      if (false === e6 && (h6 = this[t5]), i8 ?? (i8 = r6.getPropertyOptions(t5)), !((i8.hasChanged ?? f)(h6, s7) || i8.useDefault && i8.reflect && h6 === this._$Ej?.get(t5) && !this.hasAttribute(r6._$Eu(t5, i8)))) return;
      this.C(t5, s7, i8);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t5, s7, { useDefault: i8, reflect: e6, wrapped: h6 }, r6) {
    i8 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t5) && (this._$Ej.set(t5, r6 ?? s7 ?? this[t5]), true !== h6 || void 0 !== r6) || (this._$AL.has(t5) || (this.hasUpdated || i8 || (s7 = void 0), this._$AL.set(t5, s7)), true === e6 && this._$Em !== t5 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t5));
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
      if (t6.size > 0) for (const [s8, i8] of t6) {
        const { wrapped: t7 } = i8, e6 = this[s8];
        true !== t7 || this._$AL.has(s8) || void 0 === e6 || this.C(s8, void 0, i8, e6);
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
var x = (t5) => (i8, ...s7) => ({ _$litType$: t5, strings: i8, values: s7 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t5, i8) {
  if (!u2(t5) || !t5.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i8) : i8;
}
var N = (t5, i8) => {
  const s7 = t5.length - 1, e6 = [];
  let n7, l4 = 2 === i8 ? "<svg>" : 3 === i8 ? "<math>" : "", c7 = v;
  for (let i9 = 0; i9 < s7; i9++) {
    const s8 = t5[i9];
    let a4, u6, d3 = -1, f4 = 0;
    for (; f4 < s8.length && (c7.lastIndex = f4, u6 = c7.exec(s8), null !== u6); ) f4 = c7.lastIndex, c7 === v ? "!--" === u6[1] ? c7 = _ : void 0 !== u6[1] ? c7 = m : void 0 !== u6[2] ? (y2.test(u6[2]) && (n7 = RegExp("</" + u6[2], "g")), c7 = p2) : void 0 !== u6[3] && (c7 = p2) : c7 === p2 ? ">" === u6[0] ? (c7 = n7 ?? v, d3 = -1) : void 0 === u6[1] ? d3 = -2 : (d3 = c7.lastIndex - u6[2].length, a4 = u6[1], c7 = void 0 === u6[3] ? p2 : '"' === u6[3] ? $ : g) : c7 === $ || c7 === g ? c7 = p2 : c7 === _ || c7 === m ? c7 = v : (c7 = p2, n7 = void 0);
    const x2 = c7 === p2 && t5[i9 + 1].startsWith("/>") ? " " : "";
    l4 += c7 === v ? s8 + r3 : d3 >= 0 ? (e6.push(a4), s8.slice(0, d3) + h2 + s8.slice(d3) + o3 + x2) : s8 + o3 + (-2 === d3 ? i9 : x2);
  }
  return [V(t5, l4 + (t5[s7] || "<?>") + (2 === i8 ? "</svg>" : 3 === i8 ? "</math>" : "")), e6];
};
var S2 = class _S {
  constructor({ strings: t5, _$litType$: i8 }, e6) {
    let r6;
    this.parts = [];
    let l4 = 0, a4 = 0;
    const u6 = t5.length - 1, d3 = this.parts, [f4, v3] = N(t5, i8);
    if (this.el = _S.createElement(f4, e6), P.currentNode = this.el.content, 2 === i8 || 3 === i8) {
      const t6 = this.el.content.firstChild;
      t6.replaceWith(...t6.childNodes);
    }
    for (; null !== (r6 = P.nextNode()) && d3.length < u6; ) {
      if (1 === r6.nodeType) {
        if (r6.hasAttributes()) for (const t6 of r6.getAttributeNames()) if (t6.endsWith(h2)) {
          const i9 = v3[a4++], s7 = r6.getAttribute(t6).split(o3), e7 = /([.?@])?(.*)/.exec(i9);
          d3.push({ type: 1, index: l4, name: e7[2], strings: s7, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r6.removeAttribute(t6);
        } else t6.startsWith(o3) && (d3.push({ type: 6, index: l4 }), r6.removeAttribute(t6));
        if (y2.test(r6.tagName)) {
          const t6 = r6.textContent.split(o3), i9 = t6.length - 1;
          if (i9 > 0) {
            r6.textContent = s2 ? s2.emptyScript : "";
            for (let s7 = 0; s7 < i9; s7++) r6.append(t6[s7], c3()), P.nextNode(), d3.push({ type: 2, index: ++l4 });
            r6.append(t6[i9], c3());
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
  static createElement(t5, i8) {
    const s7 = l2.createElement("template");
    return s7.innerHTML = t5, s7;
  }
};
function M(t5, i8, s7 = t5, e6) {
  if (i8 === E) return i8;
  let h6 = void 0 !== e6 ? s7._$Co?.[e6] : s7._$Cl;
  const o8 = a2(i8) ? void 0 : i8._$litDirective$;
  return h6?.constructor !== o8 && (h6?._$AO?.(false), void 0 === o8 ? h6 = void 0 : (h6 = new o8(t5), h6._$AT(t5, s7, e6)), void 0 !== e6 ? (s7._$Co ?? (s7._$Co = []))[e6] = h6 : s7._$Cl = h6), void 0 !== h6 && (i8 = M(t5, h6._$AS(t5, i8.values), h6, e6)), i8;
}
var R = class {
  constructor(t5, i8) {
    this._$AV = [], this._$AN = void 0, this._$AD = t5, this._$AM = i8;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t5) {
    const { el: { content: i8 }, parts: s7 } = this._$AD, e6 = (t5?.creationScope ?? l2).importNode(i8, true);
    P.currentNode = e6;
    let h6 = P.nextNode(), o8 = 0, n7 = 0, r6 = s7[0];
    for (; void 0 !== r6; ) {
      if (o8 === r6.index) {
        let i9;
        2 === r6.type ? i9 = new k(h6, h6.nextSibling, this, t5) : 1 === r6.type ? i9 = new r6.ctor(h6, r6.name, r6.strings, this, t5) : 6 === r6.type && (i9 = new Z(h6, this, t5)), this._$AV.push(i9), r6 = s7[++n7];
      }
      o8 !== r6?.index && (h6 = P.nextNode(), o8++);
    }
    return P.currentNode = l2, e6;
  }
  p(t5) {
    let i8 = 0;
    for (const s7 of this._$AV) void 0 !== s7 && (void 0 !== s7.strings ? (s7._$AI(t5, s7, i8), i8 += s7.strings.length - 2) : s7._$AI(t5[i8])), i8++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t5, i8, s7, e6) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t5, this._$AB = i8, this._$AM = s7, this.options = e6, this._$Cv = e6?.isConnected ?? true;
  }
  get parentNode() {
    let t5 = this._$AA.parentNode;
    const i8 = this._$AM;
    return void 0 !== i8 && 11 === t5?.nodeType && (t5 = i8.parentNode), t5;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t5, i8 = this) {
    t5 = M(this, t5, i8), a2(t5) ? t5 === A || null == t5 || "" === t5 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t5 !== this._$AH && t5 !== E && this._(t5) : void 0 !== t5._$litType$ ? this.$(t5) : void 0 !== t5.nodeType ? this.T(t5) : d2(t5) ? this.k(t5) : this._(t5);
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
    const { values: i8, _$litType$: s7 } = t5, e6 = "number" == typeof s7 ? this._$AC(t5) : (void 0 === s7.el && (s7.el = S2.createElement(V(s7.h, s7.h[0]), this.options)), s7);
    if (this._$AH?._$AD === e6) this._$AH.p(i8);
    else {
      const t6 = new R(e6, this), s8 = t6.u(this.options);
      t6.p(i8), this.T(s8), this._$AH = t6;
    }
  }
  _$AC(t5) {
    let i8 = C.get(t5.strings);
    return void 0 === i8 && C.set(t5.strings, i8 = new S2(t5)), i8;
  }
  k(t5) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i8 = this._$AH;
    let s7, e6 = 0;
    for (const h6 of t5) e6 === i8.length ? i8.push(s7 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s7 = i8[e6], s7._$AI(h6), e6++;
    e6 < i8.length && (this._$AR(s7 && s7._$AB.nextSibling, e6), i8.length = e6);
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
  constructor(t5, i8, s7, e6, h6) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t5, this.name = i8, this._$AM = e6, this.options = h6, s7.length > 2 || "" !== s7[0] || "" !== s7[1] ? (this._$AH = Array(s7.length - 1).fill(new String()), this.strings = s7) : this._$AH = A;
  }
  _$AI(t5, i8 = this, s7, e6) {
    const h6 = this.strings;
    let o8 = false;
    if (void 0 === h6) t5 = M(this, t5, i8, 0), o8 = !a2(t5) || t5 !== this._$AH && t5 !== E, o8 && (this._$AH = t5);
    else {
      const e7 = t5;
      let n7, r6;
      for (t5 = h6[0], n7 = 0; n7 < h6.length - 1; n7++) r6 = M(this, e7[s7 + n7], i8, n7), r6 === E && (r6 = this._$AH[n7]), o8 || (o8 = !a2(r6) || r6 !== this._$AH[n7]), r6 === A ? t5 = A : t5 !== A && (t5 += (r6 ?? "") + h6[n7 + 1]), this._$AH[n7] = r6;
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
  constructor(t5, i8, s7, e6, h6) {
    super(t5, i8, s7, e6, h6), this.type = 5;
  }
  _$AI(t5, i8 = this) {
    if ((t5 = M(this, t5, i8, 0) ?? A) === E) return;
    const s7 = this._$AH, e6 = t5 === A && s7 !== A || t5.capture !== s7.capture || t5.once !== s7.once || t5.passive !== s7.passive, h6 = t5 !== A && (s7 === A || e6);
    e6 && this.element.removeEventListener(this.name, this, s7), h6 && this.element.addEventListener(this.name, this, t5), this._$AH = t5;
  }
  handleEvent(t5) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t5) : this._$AH.handleEvent(t5);
  }
};
var Z = class {
  constructor(t5, i8, s7) {
    this.element = t5, this.type = 6, this._$AN = void 0, this._$AM = i8, this.options = s7;
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
var D = (t5, i8, s7) => {
  const e6 = s7?.renderBefore ?? i8;
  let h6 = e6._$litPart$;
  if (void 0 === h6) {
    const t6 = s7?.renderBefore ?? null;
    e6._$litPart$ = h6 = new k(i8.insertBefore(c3(), t6), t6, void 0, s7 ?? {});
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

// node_modules/lit-html/directive.js
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t5) => (...e6) => ({ _$litDirective$: t5, values: e6 });
var i5 = class {
  constructor(t5) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t5, e6, i8) {
    this._$Ct = t5, this._$AM = e6, this._$Ci = i8;
  }
  _$AS(t5, e6) {
    return this.update(t5, e6);
  }
  update(t5, e6) {
    return this.render(...e6);
  }
};

// node_modules/lit-html/directive-helpers.js
var { I: t4 } = j;
var i6 = (o8) => o8;
var r4 = (o8) => void 0 === o8.strings;
var s4 = () => document.createComment("");
var v2 = (o8, n7, e6) => {
  const l4 = o8._$AA.parentNode, d3 = void 0 === n7 ? o8._$AB : n7._$AA;
  if (void 0 === e6) {
    const i8 = l4.insertBefore(s4(), d3), n8 = l4.insertBefore(s4(), d3);
    e6 = new t4(i8, n8, o8, o8.options);
  } else {
    const t5 = e6._$AB.nextSibling, n8 = e6._$AM, c7 = n8 !== o8;
    if (c7) {
      let t6;
      e6._$AQ?.(o8), e6._$AM = o8, void 0 !== e6._$AP && (t6 = o8._$AU) !== n8._$AU && e6._$AP(t6);
    }
    if (t5 !== d3 || c7) {
      let o9 = e6._$AA;
      for (; o9 !== t5; ) {
        const t6 = i6(o9).nextSibling;
        i6(l4).insertBefore(o9, d3), o9 = t6;
      }
    }
  }
  return e6;
};
var u3 = (o8, t5, i8 = o8) => (o8._$AI(t5, i8), o8);
var m2 = {};
var p3 = (o8, t5 = m2) => o8._$AH = t5;
var M2 = (o8) => o8._$AH;
var h3 = (o8) => {
  o8._$AR(), o8._$AA.remove();
};

// node_modules/lit-html/directives/repeat.js
var u4 = (e6, s7, t5) => {
  const r6 = /* @__PURE__ */ new Map();
  for (let l4 = s7; l4 <= t5; l4++) r6.set(e6[l4], l4);
  return r6;
};
var c4 = e4(class extends i5 {
  constructor(e6) {
    if (super(e6), e6.type !== t3.CHILD) throw Error("repeat() can only be used in text expressions");
  }
  dt(e6, s7, t5) {
    let r6;
    void 0 === t5 ? t5 = s7 : void 0 !== s7 && (r6 = s7);
    const l4 = [], o8 = [];
    let i8 = 0;
    for (const s8 of e6) l4[i8] = r6 ? r6(s8, i8) : i8, o8[i8] = t5(s8, i8), i8++;
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
    else if (h6[x2] === a4[k2]) v3[k2] = u3(d3[x2], p4[k2]), x2++, k2++;
    else if (h6[j2] === a4[w2]) v3[w2] = u3(d3[j2], p4[w2]), j2--, w2--;
    else if (h6[x2] === a4[w2]) v3[w2] = u3(d3[x2], p4[w2]), v2(s7, v3[w2 + 1], d3[x2]), x2++, w2--;
    else if (h6[j2] === a4[k2]) v3[k2] = u3(d3[j2], p4[k2]), v2(s7, d3[x2], d3[j2]), j2--, k2++;
    else if (void 0 === m3 && (m3 = u4(a4, k2, w2), y3 = u4(h6, x2, j2)), m3.has(h6[x2])) if (m3.has(h6[j2])) {
      const e6 = y3.get(a4[k2]), t6 = void 0 !== e6 ? d3[e6] : null;
      if (null === t6) {
        const e7 = v2(s7, d3[x2]);
        u3(e7, p4[k2]), v3[k2] = e7;
      } else v3[k2] = u3(t6, p4[k2]), v2(s7, d3[x2], t6), d3[e6] = null;
      k2++;
    } else h3(d3[j2]), j2--;
    else h3(d3[x2]), x2++;
    for (; k2 <= w2; ) {
      const e6 = v2(s7, v3[w2 + 1]);
      u3(e6, p4[k2]), v3[k2++] = e6;
    }
    for (; x2 <= j2; ) {
      const e6 = d3[x2++];
      null !== e6 && h3(e6);
    }
    return this.ut = a4, p3(s7, v3), E;
  }
});

// node_modules/lit-html/async-directive.js
var s5 = (i8, t5) => {
  const e6 = i8._$AN;
  if (void 0 === e6) return false;
  for (const i9 of e6) i9._$AO?.(t5, false), s5(i9, t5);
  return true;
};
var o5 = (i8) => {
  let t5, e6;
  do {
    if (void 0 === (t5 = i8._$AM)) break;
    e6 = t5._$AN, e6.delete(i8), i8 = t5;
  } while (0 === e6?.size);
};
var r5 = (i8) => {
  for (let t5; t5 = i8._$AM; i8 = t5) {
    let e6 = t5._$AN;
    if (void 0 === e6) t5._$AN = e6 = /* @__PURE__ */ new Set();
    else if (e6.has(i8)) break;
    e6.add(i8), c5(t5);
  }
};
function h4(i8) {
  void 0 !== this._$AN ? (o5(this), this._$AM = i8, r5(this)) : this._$AM = i8;
}
function n4(i8, t5 = false, e6 = 0) {
  const r6 = this._$AH, h6 = this._$AN;
  if (void 0 !== h6 && 0 !== h6.size) if (t5) if (Array.isArray(r6)) for (let i9 = e6; i9 < r6.length; i9++) s5(r6[i9], false), o5(r6[i9]);
  else null != r6 && (s5(r6, false), o5(r6));
  else s5(this, i8);
}
var c5 = (i8) => {
  i8.type == t3.CHILD && (i8._$AP ?? (i8._$AP = n4), i8._$AQ ?? (i8._$AQ = h4));
};
var f3 = class extends i5 {
  constructor() {
    super(...arguments), this._$AN = void 0;
  }
  _$AT(i8, t5, e6) {
    super._$AT(i8, t5, e6), r5(this), this.isConnected = i8._$AU;
  }
  _$AO(i8, t5 = true) {
    i8 !== this.isConnected && (this.isConnected = i8, i8 ? this.reconnected?.() : this.disconnected?.()), t5 && (s5(this, i8), o5(this));
  }
  setValue(t5) {
    if (r4(this._$Ct)) this._$Ct._$AI(t5, this);
    else {
      const i8 = [...this._$Ct._$AH];
      i8[this._$Ci] = t5, this._$Ct._$AI(i8, this, 0);
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
var o6 = /* @__PURE__ */ new WeakMap();
var n5 = e4(class extends f3 {
  render(i8) {
    return A;
  }
  update(i8, [s7]) {
    const e6 = s7 !== this.G;
    return e6 && void 0 !== this.G && this.rt(void 0), (e6 || this.lt !== this.ct) && (this.G = s7, this.ht = i8.options?.host, this.rt(this.ct = i8.element)), A;
  }
  rt(t5) {
    if (this.isConnected || (t5 = void 0), "function" == typeof this.G) {
      const i8 = this.ht ?? globalThis;
      let s7 = o6.get(i8);
      void 0 === s7 && (s7 = /* @__PURE__ */ new WeakMap(), o6.set(i8, s7)), void 0 !== s7.get(this.G) && this.G.call(this.ht, void 0), s7.set(this.G, t5), void 0 !== t5 && this.G.call(this.ht, t5);
    } else this.G.value = t5;
  }
  get lt() {
    return "function" == typeof this.G ? o6.get(this.ht ?? globalThis)?.get(this.G) : this.G?.value;
  }
  disconnected() {
    this.lt === this.ct && this.rt(void 0);
  }
  reconnected() {
    this.rt(this.ct);
  }
});

// remote-card/src/remote-card-layout.ts
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
  "abc",
  // Device-mode-only Shortcuts row. Listed last so normalizedGroupOrder
  // back-fills every stored group_order with it in last position; the
  // activity side admits the key but never renders or lists the group.
  "shortcuts"
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
  "show_device_toggle",
  "mf_as_rows",
  "mf_row_visible_rows"
];
var DEVICE_LAYOUT_PREFIX = "device:";
function deviceLayoutKey(deviceId) {
  return `${DEVICE_LAYOUT_PREFIX}${deviceId == null ? "default" : String(deviceId)}`;
}
var DEVICE_LAYOUT_KEYS = [
  "group_order",
  "show_activity",
  "show_dpad",
  "show_nav",
  "show_volume",
  "show_channel",
  "show_media",
  "show_dvr",
  "show_colors",
  "show_abc",
  "show_commands_button",
  "show_power_button",
  "show_device_toggle",
  "show_shortcuts",
  "c_as_rows",
  "c_row_visible_rows"
];
var DEVICE_STORED_KEY_FOR = {
  mf_as_rows: "c_as_rows",
  mf_row_visible_rows: "c_row_visible_rows"
};
var DEVICE_INTERNAL_KEY_FOR = Object.fromEntries(
  Object.entries(DEVICE_STORED_KEY_FOR).map(([internal, stored]) => [stored, internal])
);
var DEVICE_LAYOUT_KEY_SET = new Set(DEVICE_LAYOUT_KEYS);
function deviceModeBlock(config) {
  const block = config?.device_mode;
  return block && typeof block === "object" ? block : null;
}
function keyStyleFromConfig(config) {
  const value = config?.key_style;
  return value === "tinted" || value === "elevated" || value === "glossy" ? value : "flat";
}
function tintedPanelsFromConfig(config) {
  return config?.tinted_panels === true || config?.key_style === "panel";
}
function deviceModeEnabledInConfig(config) {
  return deviceModeBlock(config)?.enabled !== false;
}
function openDeviceFromConfig(config) {
  const value = deviceModeBlock(config)?.open_device;
  if (value == null) return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}
function storedDeviceLayer(config, layerKey) {
  const layouts = deviceModeBlock(config)?.layouts;
  const layer = layouts && typeof layouts === "object" ? layouts[layerKey] : null;
  return layer && typeof layer === "object" ? layer : null;
}
function resolveStoredDeviceLayer(layer) {
  const resolved = {};
  if (!layer || typeof layer !== "object") return resolved;
  for (const [key, value] of Object.entries(layer)) {
    if (!DEVICE_LAYOUT_KEY_SET.has(key)) continue;
    resolved[DEVICE_INTERNAL_KEY_FOR[key] ?? key] = value;
  }
  return resolved;
}
var DEVICE_LAYOUT_DEFAULTS = Object.freeze({
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
  show_commands_button: true,
  show_power_button: true,
  show_device_toggle: true,
  show_shortcuts: true,
  mf_as_rows: false,
  mf_row_visible_rows: DEFAULT_ROW_VISIBLE_ROWS,
  group_order: Object.freeze(DEFAULT_GROUP_ORDER.slice())
});
function layoutConfigForDevice(config, deviceId) {
  let merged = {
    ...DEVICE_LAYOUT_DEFAULTS,
    ...resolveStoredDeviceLayer(storedDeviceLayer(config, "default"))
  };
  if (deviceId != null) {
    merged = {
      ...merged,
      ...resolveStoredDeviceLayer(storedDeviceLayer(config, String(deviceId)))
    };
  }
  return merged;
}
function commandsButtonEnabled(layout) {
  if (typeof layout?.show_commands_button === "boolean") {
    return layout.show_commands_button;
  }
  return true;
}
function powerButtonEnabled(layout) {
  if (typeof layout?.show_power_button === "boolean") {
    return layout.show_power_button;
  }
  return true;
}
function deviceToggleEnabled(layout) {
  if (typeof layout?.show_device_toggle === "boolean") {
    return layout.show_device_toggle;
  }
  return true;
}
function shortcutsRowEnabled(layout) {
  if (typeof layout?.show_shortcuts === "boolean") {
    return layout.show_shortcuts;
  }
  return true;
}
var SHORTCUT_SLOTS = ["left", "middle", "right"];
function normalizedShortcutSlot(value) {
  if (!value || typeof value !== "object") return null;
  const icon = String(value.icon ?? "").trim();
  const commandId = Number(value.command_id);
  if (!icon || !Number.isFinite(commandId)) return null;
  return { icon, command_id: commandId };
}
function deviceShortcutsFromConfig(config, deviceId) {
  const result = {};
  if (deviceId == null) return result;
  const shortcuts = deviceModeBlock(config)?.shortcuts;
  const entry = shortcuts && typeof shortcuts === "object" ? shortcuts[String(deviceId)] : null;
  if (!entry || typeof entry !== "object") return result;
  for (const slot of SHORTCUT_SLOTS) {
    const normalized = normalizedShortcutSlot(entry[slot]);
    if (normalized) result[slot] = normalized;
  }
  return result;
}
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

// remote-card/src/remote-card-compat.ts
function hubVersionFromState(remoteState) {
  return String(remoteState?.attributes?.hub_version || "").toUpperCase();
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
    customElements.whenDefined("ha-icon"),
    customElements.whenDefined("ha-select"),
    customElements.whenDefined(dropdownItemTag).catch(() => {
    })
    // optional
  ]);
}

// remote-card/src/remote-card-strings.ts
var REMOTE_CARD_STRINGS_EN = {
  card: {
    selectEntityError: "Select a Sofabaton remote entity",
    remoteUnavailable: "Remote is unavailable (possibly because the Sofabaton app is connected).",
    noActivitiesWarning: "No activities found in remote attributes.",
    noMacros: "No macros available",
    noFavorites: "No favorites available",
    noCommands: "No commands available",
    macrosTab: "Macros",
    favoritesTab: "Favorites",
    commandsTab: "Commands",
    powerButton: "Toggle power",
    activitySelectLabel: "Activity",
    deviceSelectLabel: "Device",
    selectDevice: "Select device",
    allDevicesLayout: "Default device layout",
    filterCommands: "Filter commands",
    switchToDeviceMode: "Switch to device mode",
    switchToActivityMode: "Switch to activity mode",
    deviceKeymapMissing: "This device's commands are not cached yet. Refresh this device in the Hub tab of the Sofabaton Control Panel, then reload the dashboard.",
    deviceKeymapError: "Could not load this device's commands.",
    poweredOff: "Powered Off",
    defaultLayout: "Default activity layout",
    activityFallback: (id) => `Activity ${id}`,
    deviceFallback: (id) => `Device ${id}`,
    pickerName: "Sofabaton Virtual Remote",
    pickerDescription: "A configurable remote for the Sofabaton X1, X1S and X2 integration."
  },
  assist: {
    label: "Key capture",
    start: "Start",
    waiting: "Waiting for keypress",
    exitEditMode: "Exit Edit mode to begin",
    captured: (label) => `Captured: ${label}`,
    notCaptured: "Not captured.",
    working: "Working\u2026",
    triggersReady: "Triggers ready for use",
    createTriggers: "Create MQTT Discovery triggers",
    startCapturing: "Start capturing commands",
    deviceDetectedTitle: "Sofabaton MQTT device detected.",
    close: "Close",
    alsoActivityTriggers: "Also create triggers for Activity changes.",
    seeDocs: "See documentation for this feature.",
    dontShowAgain: "Don't show this again for this device during this session.",
    detectedDevice: (name) => `Detected MQTT device: ${name}.`,
    lastCommand: (name) => `Last command: ${name}.`,
    existingTriggers: "Existing MQTT automation triggers were found.",
    noMqttCommands: "No MQTT commands discovered yet",
    deviceFallback: (id) => `Device ${id}`,
    unknownDevice: "Unknown device",
    commandFallback: (id) => `Command ${id}`,
    createdTriggers: (count, deviceLabel) => `Created ${count} MQTT Discovery triggers for ${deviceLabel}`,
    createdActivityTriggers: (count) => `Created ${count} activity triggers for X2 \u2192 Activities`,
    plusActivityTriggers: (count) => ` plus ${count} activity triggers`,
    allTriggersExist: (deviceLabel) => `All MQTT Discovery triggers already exist for ${deviceLabel}`,
    buttonFallback: "Button",
    activityFallbackLabel: "Activity",
    unknown: "Unknown",
    automationAssistName: "Automation Assist",
    notification: {
      title: "\u{1F6E0}\uFE0F Automation Assist",
      eventButton: (label) => `Button: ${label}`,
      eventCommand: (label) => `Command: ${label}`,
      eventActivity: (label) => `Activity Change: ${label}`,
      eventOther: (label) => `Event: ${label}`,
      header: (activityName, eventLabel) => `**Activity: ${activityName} | ${eventLabel}**`,
      headerDevice: (deviceName, eventLabel) => `**Device: ${deviceName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace button code**",
      lovelaceCopy: "*Copy this to your dashboard YAML:*",
      serviceHeading: "\u2699\uFE0F **Service call (automation)**",
      serviceCopy: "*Use this in your scripts or automations:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Select a Sofabaton remote entity",
      theme: "Apply a theme to the card",
      use_background_override: "Customize background color",
      background_override: "Select background color",
      show_activity: "Activity/device selector",
      show_dpad: "Direction pad",
      show_nav: "Back/Home/Menu keys",
      show_mid: "Volume/Channel rockers",
      show_media: "Playback",
      show_colors: "Red/Green/Yellow/Blue",
      show_abc: "A/B/C buttons",
      show_macros_button: "Macros button",
      show_favorites_button: "Favorites button",
      max_width: "Maximum card width (px)",
      key_style: "Button style",
      group_order: "Group order"
    },
    generalOptionsTitle: "General options",
    keyCapture: "Key capture",
    keyCaptureDescription: "Send button presses to the hub: capture them to generate ready-to-use YAML for dashboard buttons and automations.",
    keyCaptureLearnMore: "Learn more about Key capture",
    keyCaptureDocsAria: "Key capture documentation",
    stylingOptions: "Styling options",
    keyStyleFlat: "Flat (matches the card background)",
    keyStyleTinted: "Tinted (buttons stand out from the background)",
    keyStyleElevated: "Elevated (tinted with a shadow)",
    keyStyleGlossy: "Glossy (shiny, curved buttons)",
    tintedPanels: "Tinted panels",
    tintedPanelsDescription: "Show a tinted background behind each group of buttons.",
    layoutOptions: "Layout options",
    layoutSelectLabel: "Layout",
    defaultLayoutOption: "Default activity layout",
    allDevicesOption: "Default device layout",
    commands: "Commands",
    power: "Power button",
    modeToggle: "Mode switch",
    deviceModeDescription: "Control one device configured on the hub, using that device's button assignments and complete command list.",
    longPress: "Enable hold-to-repeat",
    longPressDescription: "Hold a selected button to send its command repeatedly, as on the physical remote.",
    longPressButtons: "Buttons",
    enableDeviceMode: "Enable device mode",
    initialView: "Initial view",
    initialViewHelper: "What the card shows when it loads",
    openOnCurrentActivity: "Current activity",
    macrosFavoritesAsRows: "Macros/Favorites as rows",
    commandsAsRows: "Commands as rows",
    visibleRows: "Visible rows",
    moveGroupUp: (groupLabel) => `Move ${groupLabel} up`,
    moveGroupDown: (groupLabel) => `Move ${groupLabel} down`,
    macros: "Macros",
    favorites: "Favorites",
    volume: "Volume",
    channel: "Channel",
    mediaControls: "Playback",
    dvr: "DVR",
    resetDefaultLayout: "Reset layout",
    shortcutSlotLeft: "Left shortcut",
    shortcutSlotMiddle: "Middle shortcut",
    shortcutSlotRight: "Right shortcut",
    shortcutIcon: "Icon",
    shortcutCommand: "Command",
    shortcutReset: "Reset",
    shortcutCommandMissing: (id) => `Command ${id} (missing)`,
    shortcutsCommandsLoading: "Loading commands\u2026",
    shortcutsCommandsUnavailable: "This device's commands are not cached yet. Refresh this device in the Hub tab of the Sofabaton Control Panel, then reload the dashboard.",
    shortcutsCommandsError: "Could not load this device's commands. Reload the dashboard and try again.",
    noteDefaultLayout: "Used for activities without their own layout",
    noteDeviceDefaultLayout: "Used for devices without their own layout",
    noteCustomActivityLayout: "Using custom activity layout",
    noteCustomDeviceLayout: "Using custom device layout",
    noteUsingActivityDefault: "Using default activity layout",
    noteUsingDeviceDefault: "Using default device layout"
  },
  groups: {
    activity: "Activity/device",
    macro_favorites: "Macros/Favorites",
    macros_row: "Macros row",
    favorites_row: "Favorites row",
    dpad: "Direction pad",
    nav: "Back/Home/Menu",
    mid: "Volume/Channel",
    media: "Playback",
    colors: "Color buttons",
    abc: "A/B/C",
    shortcuts: "Shortcuts"
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
    fwd: "Fast forward",
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
  if (lang === currentLanguage) return false;
  currentLanguage = lang;
  const translation = resolveTranslation(lang);
  currentStrings = translation ? deepMerge(REMOTE_CARD_STRINGS_EN, translation) : REMOTE_CARD_STRINGS_EN;
  return true;
}
function remoteCardLanguage() {
  return currentLanguage;
}
function remoteCardDirection() {
  const base = currentLanguage.split(/[-_]/)[0];
  return ["ar", "fa", "he", "ps", "ur"].includes(base) ? "rtl" : "ltr";
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

// remote-card/src/remote-card-styles.ts
var REMOTE_CARD_CSS = `
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --remote-zoom: 1;
        /* Hover / press overlays for keys and drawer buttons, derived from
           the theme's text colour (see sb-key-button.ts). Declared on
           .wrap below so a card-level theme applied on ha-card is seen. */

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
        --sb-tab-font-size: clamp(14px, 4cqw, 20px);
        --sb-tab-height: clamp(32px, 9cqw, 44px);
        --sb-color-key-min-height: clamp(12px, 3.2cqw, 20px);
        container-type: inline-size;
      }

      /* Theme-resilience tokens, one level below ha-card (where a card-level
         theme: config lands as inline variables) so both global and card-level
         themes feed them. --secondary-text-color is floored toward primary
         text: themes like Caule alias it to their disabled grey. */
      ha-card { --sb-theme-secondary-text: var(--secondary-text-color); }
      .wrap {
        --secondary-text-color: color-mix(in srgb, var(--sb-theme-secondary-text) 40%, var(--primary-text-color));
        /* Overlay/tint base: the text colour, unless a background override
           contradicts the page theme, in which case _applyLocalTheme sets
           --sb-overlay-base from the override's own luminance. */
        --sb-tint-base: var(--sb-overlay-base, var(--primary-text-color));
        --sb-overlay-hover: color-mix(in srgb, var(--sb-tint-base) 10%, transparent);
        --sb-overlay-press: color-mix(in srgb, var(--sb-tint-base) 18%, transparent);
        --sb-accent-text: color-mix(in srgb, var(--primary-color) 35%, var(--primary-text-color));
        /* Field surface for native inputs (the commands filter): the card
           surface with a 6% text tint, same recipe as the control panel.
           The theme's input fill is not trusted (Caule aliases it to the
           primary colour, glass themes set it transparent). */
        --sb-field-surface: color-mix(in srgb, var(--sb-tint-base) 6%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color))));
        /* Raised-surface pair used by key_style tinted/elevated. Computed
           here (not on the consumers) so redefining --ha-card-background on
           a drawer button from it is not a self-reference. */
        --sb-key-surface: color-mix(in srgb, var(--sb-tint-base) 8%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color))));
        --sb-key-border: color-mix(in srgb, var(--sb-tint-base) 20%, transparent);
        /* Glossy: a vertical curve of the same tint (bright top, dark
           bottom) plus specular inset highlights. A gradient is legal here
           because every consumer puts the token in a background shorthand. */
        --sb-key-surface-glossy: linear-gradient(180deg,
          color-mix(in srgb, var(--sb-tint-base) 18%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))) 0%,
          color-mix(in srgb, var(--sb-tint-base) 8%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))) 48%,
          color-mix(in srgb, var(--sb-tint-base) 2%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))) 100%);
        --sb-key-gloss-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.30),
          inset 0 6px 10px -6px rgba(255, 255, 255, 0.18),
          inset 0 -2px 4px rgba(0, 0, 0, 0.22),
          0 2px 6px rgba(0, 0, 0, 0.18);
        /* Panel surface used by key_style "panel": the control panel's dock
           recipe (card-styles.ts .card-topbar/.card-bottom-dock) \u2014 a subtle
           8%\u21924% accent gradient into the card background with a softened
           divider border \u2014 so both cards share one surface language. Subtle
           enough that the theme's text and icon colours read on it
           unchanged. A gradient is legal here because every consumer puts
           the token in a background shorthand. */
        --sb-panel-surface: linear-gradient(180deg,
          color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))),
          color-mix(in srgb, var(--primary-color) 4%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))));
        --sb-panel-border: color-mix(in srgb, var(--divider-color) 82%, transparent);
      }
      .wrap { padding: 12px; display: grid; gap: 12px; position: relative; }
      /* key_style: raise the keys off the card. The tint is mixed from the
         theme's TEXT colour, so it lands on the right side of any palette
         (8% white over a true-black card is a clearly raised #141414; 8%
         black over white a soft grey) and stays below the 10%/18% hover and
         press overlays, which stack on top of it. The floored border keeps
         a visible outline even where the theme's divider matches its
         background. Colour keys and the Macros/Favorites tabs declare their
         own --sb-control-* values closer to the element and are unaffected.
         "Elevated" adds a shadow, which only reads on light surfaces
         (nothing renders darker than a black card); the tint carries dark
         themes. */
      .wrap--keys-tinted,
      .wrap--keys-elevated {
        --sb-control-background: var(--sb-key-surface);
        --sb-control-border-color: var(--sb-key-border);
      }
      .wrap--keys-glossy {
        --sb-control-background: var(--sb-key-surface-glossy);
        --sb-control-border-color: var(--sb-key-border);
        --sb-control-box-shadow: var(--sb-key-gloss-shadow);
      }
      .wrap--keys-elevated {
        --sb-control-box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.10);
      }
      /* The drawer headers (Macros/Favorites bar and the device-mode
         Commands bar reuse .macroFavorites) and the buttons inside the
         drawers ride along with key_style: same raised surface and floored
         border as the keys. The drawer panel itself (.mf-overlay) stays on
         the card background so the buttons read as raised on it. The tab
         buttons inside the bar keep their transparent --sb-control-* (the
         BAR is the surface). Drawer buttons are ha-cards, so their tokens
         are redefined from the pair computed on .wrap. */
      .wrap--keys-tinted .macroFavorites,
      .wrap--keys-elevated .macroFavorites {
        background: var(--sb-key-surface);
        border-color: var(--sb-key-border);
      }
      .wrap--keys-glossy .macroFavorites {
        background: var(--sb-key-surface-glossy);
        border-color: var(--sb-key-border);
        box-shadow: var(--sb-key-gloss-shadow);
      }
      .wrap--keys-tinted .drawer-btn,
      .wrap--keys-elevated .drawer-btn {
        --ha-card-background: var(--sb-key-surface);
        --ha-card-border-color: var(--sb-key-border);
      }
      .wrap--keys-glossy .drawer-btn {
        --ha-card-background: var(--sb-key-surface-glossy);
        --ha-card-border-color: var(--sb-key-border);
        --ha-card-box-shadow: var(--sb-key-gloss-shadow);
      }
      .wrap--keys-elevated .macroFavorites {
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.10);
      }
      .wrap--keys-elevated .drawer-btn {
        --ha-card-box-shadow: 0 1px 2px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.10);
      }
      /* Tinted panels (the former key_style "panel", now an independent
         switch so it combines with any key style): the
         bordered group containers take the dock surface. With flat keys
         the keys KEEP the card background and read as card-coloured
         cutouts on a softly accent-tinted panel; with a tinted/elevated/
         glossy key style the keys keep that style's raised surface and
         the panels tint the ground behind them. The tint is subtle
         enough that no text or icon colour needs to change. Container-
         less keys (the nav .row3 and the device-mode power key) take
         the panel surface directly, but only under flat keys - a real
         key style owns their surface. These rules sit AFTER the
         key-style .macroFavorites rules so the bar counts as a
         container (panel surface) when both are on. */
      .wrap--panels .dpad,
      .wrap--panels .mid,
      .wrap--panels .media,
      .wrap--panels .colors,
      .wrap--panels .abc {
        background: var(--sb-panel-surface);
        border-color: var(--sb-panel-border);
      }
      .wrap--panels:not(.wrap--keys-tinted):not(.wrap--keys-elevated):not(.wrap--keys-glossy) .row3,
      .wrap--panels:not(.wrap--keys-tinted):not(.wrap--keys-elevated):not(.wrap--keys-glossy) .sb-power-key {
        --sb-control-background: var(--sb-panel-surface);
        --sb-control-border-color: var(--sb-panel-border);
      }
      .wrap--panels .macroFavorites {
        background: var(--sb-panel-surface);
        border-color: var(--sb-panel-border);
      }
      .wrap--panels .macroFavoritesButton + .macroFavoritesButton {
        border-left-color: var(--sb-panel-border);
      }
      .wrap--panels .macroFavoritesButton:first-child {
        border-right-color: var(--sb-panel-border);
      }
      .wrap--panels .mf-overlay {
        background: var(--sb-panel-surface);
        border-color: var(--sb-panel-border);
      }
      /* drawer-up re-declares border-top with the divider colour at higher
         specificity; keep it on the panel border. */
      .wrap--panels .mf-container.drawer-up .mf-overlay {
        border-top-color: var(--sb-panel-border);
      }
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
        /* Dropdown item text. HA declares these derived tokens on <html> as
           var(--primary-text-color), where they resolve once against the
           GLOBAL theme and descendants inherit the resolved color. A per-card
           theme / background override rewrites --primary-text-color on the
           card only, so the menu panel (which re-reads --card-background-color
           locally) follows the card while the item text stays the global
           theme's color: dark text on a dark panel. Re-declaring the tokens
           here makes them resolve against the card-local text color. No-op
           without a local override. Covers both dropdown generations:
           ha-dropdown-item (wa) and mwc-list-item (mdc). */
        --wa-color-text-normal: var(--primary-text-color);
        --wa-color-text-quiet: var(--secondary-text-color);
        --mdc-theme-text-primary-on-background: var(--primary-text-color);
        --mdc-theme-text-secondary-on-background: var(--secondary-text-color);
        /* Field label ("Activity" / "Device") and value. HA chains these to
           --input-label-ink-color / --input-ink-color on <html>, so a
           card-level theme never reaches them, and some themes (Caule) map
           the label to their disabled grey. Derive both from the card's
           own text colour instead. */
        --mdc-select-label-ink-color: color-mix(in srgb, var(--primary-text-color) 85%, transparent);
        --mdc-select-ink-color: var(--primary-text-color);
        --mdc-select-dropdown-icon-color: color-mix(in srgb, var(--primary-text-color) 70%, transparent);
        /* Menu item hover / selected fills. HA's ha-dropdown-item paints
           --ha-color-fill-neutral-quiet-hover (light grey under any flat
           theme, since flat themes run in light mode) behind item text that
           is now the card's text colour: under Caule both are ~#e5e5e5.
           Derive the fills from the card's own colours instead, as
           translucent tints over the menu panel. The selected item's text
           follows the accent-text rule (not pure primary colour). */
        --ha-color-fill-neutral-quiet-resting: color-mix(in srgb, var(--primary-text-color) 6%, transparent);
        --ha-color-fill-neutral-quiet-hover: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
        --ha-color-fill-primary-quiet-resting: color-mix(in srgb, var(--primary-color) 14%, transparent);
        --ha-color-fill-primary-quiet-hover: color-mix(in srgb, var(--primary-color) 24%, transparent);
        /* wa-dropdown-item paints :host(:hover) and :focus-visible with
           --wa-color-neutral-fill-normal (HA: --ha-color-fill-neutral-normal-resting). */
        --ha-color-fill-neutral-normal-resting: color-mix(in srgb, var(--primary-text-color) 12%, transparent);
        --ha-color-fill-neutral-normal-hover: color-mix(in srgb, var(--primary-text-color) 18%, transparent);
        --wa-color-neutral-fill-normal: var(--ha-color-fill-neutral-normal-resting);
        --wa-color-neutral-fill-quiet: var(--ha-color-fill-neutral-quiet-hover);
        --wa-color-brand-fill-quiet: var(--ha-color-fill-primary-quiet-hover);
        --mdc-ripple-color: var(--primary-text-color);
        --sb-select-selected-text: var(--sb-accent-text, color-mix(in srgb, var(--primary-color) 35%, var(--primary-text-color)));
      }
      /* Outer-scope rule on the item host beats ha-dropdown-item's
         :host([selected]) { color: var(--primary-color) }. */
      .sb-activity-select ha-dropdown-item[selected],
      .sb-activity-select mwc-list-item[selected],
      .sb-activity-select mwc-list-item[activated] {
        color: var(--sb-select-selected-text);
      }

      .activityRow {
        display: grid;
        grid-template-columns: 1fr;
        position: relative;
        z-index: 3;
        /* One bottom line for the whole row. The select's field (HA's
           ha-picker-field) paints 1px --ha-color-border-neutral-loud at rest
           and 2px --mdc-theme-primary when focused; HA declares that chain on
           <html>, so under a card-level theme it resolved to the PAGE's
           primary (HA blue). Both tokens are re-declared below from these
           row tokens, and the mode toggle draws the same line so the two
           read as one control. */
        --sb-field-line: color-mix(in srgb, var(--primary-text-color) 42%, transparent);
        --sb-field-line-active: var(--primary-color);
      }
      .activityRow .sb-activity-select {
        --ha-color-border-neutral-loud: var(--sb-field-line);
        --mdc-theme-primary: var(--sb-field-line-active);
        --mdc-select-idle-line-color: var(--sb-field-line);
        --mdc-select-hover-line-color: var(--sb-field-line);
      }
      /* Long activity/device names ellipsize inside the select instead of
         pushing the card wider (grid items default to min-width auto). The
         same overflow clip also gives the field the theme's corner radius:
         rounding the HOST and zeroing the inner mdc shape token works for
         both ha-select generations (mdc and ha-picker-field) without
         knowing their internal shape tokens. The host paints the form
         background so any residual inner rounding never shows as notched
         corners. */
      .activityRow .sb-activity-select {
        min-width: 0;
        overflow: hidden;
        border-radius: var(--sb-group-radius);
        --mdc-shape-small: 0px;
        background: var(--ha-color-form-background);
      }

      /* Device mode: the toggle fuses to the select's left edge. */
      .activityRow--with-toggle {
        grid-template-columns: auto 1fr;
      }
      .sb-mode-toggle {
        width: 48px;
        align-self: stretch;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        cursor: pointer;
        color: var(--primary-text-color);
        background: var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243)));
        border: none;
        border-inline-end: 1px solid var(--divider-color);
        /* Same line as the field, drawn as an inset shadow so the 1px -> 2px
           active state never shifts layout. */
        box-shadow: inset 0 -1px 0 var(--sb-field-line);
        transition: box-shadow 180ms ease-in-out, background 120ms ease;
        /* One fused control with the select: the outer (inline-start) side
           follows the theme radius, the side meeting the select stays
           square. Logical corners keep the fused edge correct in RTL,
           where the toggle sits visually on the right. */
        border-start-start-radius: var(--sb-group-radius);
        border-end-start-radius: var(--sb-group-radius);
        border-start-end-radius: 0;
        border-end-end-radius: 0;
        -webkit-tap-highlight-color: transparent;
      }
      .sb-mode-toggle:hover {
        background: color-mix(in srgb, var(--primary-text-color) 10%, var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243))));
      }
      .sb-mode-toggle:active {
        transform: scale(0.97);
        background: color-mix(in srgb, var(--primary-text-color) 18%, var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243))));
      }
      .sb-mode-toggle[disabled] {
        opacity: 0.5;
        cursor: default;
      }
      .sb-mode-toggle:focus-visible {
        outline: none;
      }
      /* The toggle's line follows the field: focused field (HA keeps the
         field focused after the menu closes, so does this), open menu, or
         keyboard focus on the toggle itself. */
      .activityRow--with-toggle:has(.sb-activity-select:focus-within) .sb-mode-toggle,
      .activityRow--with-toggle.activityRow--menu-open .sb-mode-toggle,
      .sb-mode-toggle:focus-visible {
        box-shadow: inset 0 -2px 0 var(--sb-field-line-active);
      }
      /* The select's corners on the fused edge go flat so toggle + select
         read as one control. */
      .activityRow--with-toggle .sb-activity-select {
        border-start-start-radius: 0;
        border-end-start-radius: 0;
      }

      /* Device mode: Commands drawer (one command per row + filter input).
         Compound selector: the base .mf-grid two-column rule sits LATER in
         this sheet and would win at equal specificity. Responsive columns:
         one full-width command per row on narrow cards (~230px), two per
         row once the card has the width for it (~300px+). */
      .mf-grid.mf-grid--commands {
        grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      }
      .mf-grid--commands .drawer-btn .name {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .sb-commands-filter {
        width: 100%;
        box-sizing: border-box;
        margin-bottom: 8px;
        padding: 8px 12px;
        font: inherit;
        font-size: 13px;
        color: var(--primary-text-color);
        background: var(--sb-field-surface, var(--input-fill-color, var(--secondary-background-color, rgb(243, 243, 243))));
        border: 1px solid var(--sb-key-border, var(--divider-color));
        border-radius: var(--sb-group-radius);
        outline: none;
      }
      .sb-commands-filter:focus {
        border-color: var(--primary-color, #03a9f4);
      }
      .sb-commands-filter::placeholder {
        color: var(--secondary-text-color);
        opacity: 0.8;
      }
      /* The card sets an inline max-height from the measured viewport space
         (commandsOverlayMaxHeight); this only keeps the filter pinned. */
      .mf-overlay--commands .sb-commands-filter {
        position: sticky;
        top: 0;
        z-index: 1;
      }

      .automationAssist {
        display: grid;
        gap: 4px;
        padding: 12px;
        border-radius: var(--sb-group-radius);
        border: 1px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
        background: color-mix(in srgb, var(--primary-color) 8%, transparent);
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
        border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
        color: var(--primary-text-color);
        border-radius: 999px;
        padding: 2px 10px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        line-height: 1;
      }

      .automationAssist__mqttBtn {
        border: 1px solid color-mix(in srgb, var(--primary-color) 35%, transparent);
        background: color-mix(in srgb, var(--primary-color) 10%, transparent);
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
        background: color-mix(in srgb, var(--primary-color) 16%, transparent);
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


 	  /* Loading feedback lives INSIDE the control's silhouette: an overlay
	     spanning the whole activity row (select alone, or the fused
	     toggle+select pair), rounded and clipped like the control, painting
	     only a bottom band. The band's ends follow the theme's curve, where
	     the old detached full-width bar stuck out past the rounded corners.
	     The row itself must never clip (the dropdown menu renders inside it
	     on the mdc generation), so the overlay clips itself instead. */
	  .loadIndicator {
	    visibility: hidden;
	    position: absolute;
	    inset: 0;
	    border-radius: var(--sb-group-radius);
	    overflow: hidden;
	    pointer-events: none;
	  }

	  .loadIndicator::before {
	    content: "";
	    position: absolute;
	    inset-inline: 0;
	    bottom: 0;
	    height: 4px;
	  }

	  .loadIndicator.is-loading {
	    visibility: visible;
	  }

	  .loadIndicator.is-loading::before {
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
        /* Tighter side padding than the default keys: at the 230px minimum
           card width each tab's text budget is ~81px minus the chevron
           reserve, and the longest tab labels (nl "Favorieten", en-GB
           "Favourites", ~65px at 14px Roboto) need the extra 4px to render
           without an ellipsis at the 14px font floor. */
        --sb-control-padding-inline: 8px;
        /* No padding: the inner control carries the hover/press overlay, so
           it must fill the whole cell or the highlight renders as an inset
           band instead of covering the full tab. */
        padding: 0;
        box-sizing: border-box;
        height: var(--sb-tab-height);
        display: block !important;
        position: relative;
        overflow: hidden;
        transition: background 0.2s ease;
        --sb-control-box-shadow: none;
        --sb-control-border-width: 0;
        --sb-control-border-color: transparent;
        --sb-control-background: transparent;
        --sb-control-radius: 0;
      }
      
      /* Active tab: text stays the theme's text colour, the accent tints the
         surface (primary colour as text is 1:1 on iOS-light orange). */
      .macroFavoritesButton.active-tab {
        color: var(--primary-text-color);
      }

      .macroFavoritesButton + .macroFavoritesButton {
        border-left: 1px solid var(--divider-color);
      }
			.macroFavoritesButton:first-child {
        border-right: 1px solid var(--divider-color);
      }
			.mf-container {
        position: relative; 
        z-index: 2;
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

      /* Device mode: power key sharing the commands strip row. The
         wrapper becomes the positioned ancestor (its .mf-container goes
         static), so the absolutely-positioned commands drawer overlay
         spans the FULL row, bar column plus power column. */
      .commands-row {
        position: relative;
        z-index: 2;
      }
      /* With the bar only 3/4 wide, the overlay's right shoulder sticks
         out past it under the power key. Round that exposed corner with
         the themed radius and restore the edge border there; the bar
         overlaps the left 3/4 of that border (the -1px seam margin), so
         the fused look under the bar is unchanged. */
      .commands-row--power .mf-overlay {
        border-top: 1px solid var(--divider-color);
        border-top-right-radius: var(--sb-group-radius);
      }
      .commands-row--power .drawer-up .mf-overlay {
        border-top-right-radius: var(--sb-group-radius);
        border-bottom: 1px solid var(--divider-color);
        border-bottom-right-radius: var(--sb-group-radius);
      }
      .commands-row--power {
        display: grid;
        grid-template-columns: 3fr 1fr;
        gap: 8px;
        align-items: stretch;
      }
      .commands-row--power .mf-container {
        position: static;
        min-width: 0;
      }
      .sb-power-key {
        color: var(--sb-power-key-color, var(--primary-color, #03a9f4));
      }
      .commands-row--power-only .sb-power-key {
        /* No sibling strip to stretch against: match the Commands bar
           height (tab height plus its 1px borders). */
        height: calc(var(--sb-tab-height) + 2px);
      }
      .sb-power-key--busy {
        animation: sb-power-busy 1s ease-in-out infinite;
      }
      @keyframes sb-power-busy {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.45; }
      }

      /* Commands-as-rows: the power key docks beside the pinned filter. */
      .inline-filter-row {
        display: grid;
        grid-template-columns: 3fr 1fr;
        gap: 8px;
        align-items: stretch;
        margin-bottom: 8px;
      }
      .inline-filter-row .sb-commands-filter {
        margin-bottom: 0;
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
        border-radius: var(--sb-group-radius) !important;
        cursor: pointer;
        position: relative;
        overflow: hidden;
        -webkit-tap-highlight-color: transparent;
      }
      /* Same colour language as the keys: names and icons both take the
         icon accent (sb-key-button's label rule is the counterpart). */
      .drawer-btn .name,
      .drawer-btn__icon {
        color: var(--sb-key-label-color, var(--primary-color));
      }

      /* Hover/press overlay  */
      .drawer-btn::before {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        background: var(--sb-overlay-hover, color-mix(in srgb, var(--primary-text-color) 10%, transparent));
        opacity: 0;
        transition: opacity 120ms ease;
        pointer-events: none;
      }

      .drawer-btn:hover::before {
        opacity: 1;
      }

      .drawer-btn:active::before {
        opacity: 1;
        background: var(--sb-overlay-press, color-mix(in srgb, var(--primary-text-color) 18%, transparent));
      }

      .drawer-btn:focus-visible {
        outline: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent);
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
        text-align: start !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }


      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: color-mix(in srgb, var(--primary-color) 14%, transparent);
        color: var(--primary-text-color);
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

      /* The UI follows the locale direction, but these are spatial controls:
         changing language must never swap the physical Left/Right keys or the
         fixed rows of buttons on the remote. */
      :host([dir="rtl"]) .dpad,
      :host([dir="rtl"]) .row3,
      :host([dir="rtl"]) .mid,
      :host([dir="rtl"]) .media,
      :host([dir="rtl"]) .colors,
      :host([dir="rtl"]) .abc {
        direction: ltr;
      }

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

      /* Shortcuts row (device mode): unconfigured slots keep their grid
         cell. Live mode hides them entirely; the edit preview shows a
         ghost outline so the row's position visualizes before any slot
         is configured. */
      .shortcut-spacer {
        visibility: hidden;
      }
      .shortcut-ghost {
        border: 1px dashed var(--divider-color);
        border-radius: var(--sb-group-radius, var(--ha-card-border-radius, 18px));
        opacity: 0.5;
      }

      /* sizing */

/* Allow grid children to shrink (prevents overflow on mobile / narrow cards) */
.key {
  min-width: 0;
  position: relative;
  width: 100%;
  --mdc-typography-button-font-size: var(--sb-key-font-size);
  --paper-font-body1_-_font-size: var(--sb-key-font-size);
  --sb-control-font-size: var(--sb-key-font-size);
}

/* --- Square remote keys (scalable) --- */
.key:not(.key--color) {
  aspect-ratio: 1 / 1;
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
/* Color keys are native pill controls. */
      .key--color {
        --sb-control-radius: 999px;
        --sb-control-background: var(--sb-color);
      }

      /* Status notice (remote unavailable, no activities, device keymap
         missing / failed): an in-flow row at the top of the layout, styled
         like HA's ha-alert so it reads on any theme. The surface is the
         card background with a 12% accent tint and the text is the theme's
         primary text colour, i.e. exactly the contrast the theme already
         guarantees for the card's own text. It used to be a 12px,
         background-less absolute overlay sitting on the activity selector,
         which was unreadable on most themes and clipped on narrow cards. */
      .sb-notice {
        --sb-notice-accent: var(--warning-color, #ffa600);
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 10px 12px;
        border-radius: min(12px, var(--sb-group-radius));
        border-inline-start: 4px solid var(--sb-notice-accent);
        background: color-mix(in srgb, var(--sb-notice-accent) 12%, var(--ha-card-background, var(--card-background-color, var(--primary-background-color))));
        color: var(--primary-text-color);
        font-size: clamp(13px, 3.6cqw, 15px);
        line-height: 1.4;
        text-align: start;
        overflow-wrap: anywhere;
      }
      .sb-notice--error {
        --sb-notice-accent: var(--error-color, #db4437);
      }
      .sb-notice ha-icon {
        flex: none;
        margin-top: 1px;
        color: var(--sb-notice-accent);
        /* Real ha-icon sizes itself from --mdc-icon-size; the harness stub
           from font-size. Both land on 20px. */
        font-size: 20px;
        --mdc-icon-size: 20px;
      }
      .sb-notice__text {
        flex: 1 1 auto;
        min-width: 0;
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

// remote-card/src/remote-card-ui-helpers.ts
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

// remote-card/src/remote-card-runtime-display.ts
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
  const favoritesEnabled = editMode ? true : favorites.length + customFavorites.length > 0;
  return {
    showMF,
    visibleCount,
    macrosDisabled: disableAllButtons || !macrosEnabled,
    favoritesDisabled: disableAllButtons || !favoritesEnabled
  };
}

// remote-card/src/remote-card-drawer-display.ts
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

// remote-card/src/remote-card-long-press.ts
var LONG_PRESS_GROUP_FOR_KEY = {
  volup: "volume",
  voldn: "volume",
  chup: "channel",
  chdn: "channel",
  up: "dpad",
  down: "dpad",
  left: "dpad",
  right: "dpad"
};
function longPressBlock(config) {
  const block = config?.hold_repeat;
  return block && typeof block === "object" ? block : {};
}
function longPressSettings(config) {
  const block = longPressBlock(config);
  const enabled = block.enabled === true;
  return {
    enabled,
    volume: enabled && block.volume !== false,
    channel: enabled && block.channel !== false,
    dpad: enabled && block.dpad !== false
  };
}
function longPressGroupForKey(key) {
  return LONG_PRESS_GROUP_FOR_KEY[String(key ?? "")] ?? null;
}
function longPressEnabledForKey(config, key) {
  const group = longPressGroupForKey(key);
  if (!group) return false;
  return longPressSettings(config)[group];
}
function hubLongPressBinding(attributes, scopeId, buttonId) {
  if (scopeId == null || buttonId == null) return null;
  const scope = Number(scopeId);
  const button = Number(buttonId);
  if (!Number.isFinite(scope) || !Number.isFinite(button)) return null;
  const map = attributes?.long_press_keys;
  if (!map || typeof map !== "object") return null;
  const page = map[String(scope)];
  if (!page || typeof page !== "object" || Array.isArray(page)) return null;
  const raw = page[String(button)];
  if (!raw || typeof raw !== "object") return null;
  const device = Number(raw.device_id);
  const command = Number(raw.command_id);
  if (!Number.isFinite(device) || device < 1) return null;
  if (!Number.isFinite(command) || command < 1) return null;
  return { device_id: device, command_id: command };
}

// remote-card/src/remote-card-gestures.ts
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
function commandsOverlayMaxHeight({
  up,
  rowTop,
  rowBottom,
  cardTop,
  cardBottom,
  viewportHeight
}) {
  const available = up ? rowTop - (cardTop ?? 0) : (cardBottom ?? viewportHeight) - rowBottom;
  return Math.max(Math.min(120, Math.floor(available)), Math.floor(available - 12));
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
var HOLD_REPEAT_DELAY_MS = 400;
var HOLD_REPEAT_INTERVAL_MS = 250;
var HOLD_REPEAT_EVENT_TYPE = "sb-hold-repeat";
function holdRepeatIndexOf(ev) {
  if (!ev || ev.type !== HOLD_REPEAT_EVENT_TYPE) return 0;
  const detail = ev.detail;
  const index = typeof detail === "number" ? detail : Number(detail);
  return Number.isFinite(index) && index > 0 ? index : 0;
}
var HoldRepeatTimer = class {
  constructor(fire, options = {}) {
    this.delayHandle = null;
    this.intervalHandle = null;
    this.repeats = 0;
    this.fired = false;
    this.fire = fire;
    this.delayMs = options.delayMs ?? HOLD_REPEAT_DELAY_MS;
    this.intervalMs = options.intervalMs ?? HOLD_REPEAT_INTERVAL_MS;
    this.timers = {
      setTimeout: options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h6) => clearTimeout(h6)),
      setInterval: options.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
      clearInterval: options.clearInterval ?? ((h6) => clearInterval(h6))
    };
  }
  /** True while a hold is armed or repeating. */
  get active() {
    return this.delayHandle != null || this.intervalHandle != null;
  }
  /** Repeats fired during the current/last hold. */
  get repeatCount() {
    return this.repeats;
  }
  start() {
    this.clearTimers();
    this.fired = false;
    this.repeats = 0;
    this.delayHandle = this.timers.setTimeout(() => {
      this.delayHandle = null;
      this.tick();
      this.intervalHandle = this.timers.setInterval(() => this.tick(), this.intervalMs);
    }, this.delayMs);
  }
  /** Stop repeating. Returns whether this hold fired at least once. */
  stop() {
    this.clearTimers();
    return this.fired;
  }
  /**
   * Read-and-clear the "a repeat fired" memory. The release tap that follows
   * a hold calls this and skips its own send when it returns true.
   */
  consumeFired() {
    const fired = this.fired;
    this.fired = false;
    return fired;
  }
  tick() {
    this.fired = true;
    this.repeats += 1;
    try {
      this.fire(this.repeats);
    } catch (e6) {
    }
  }
  clearTimers() {
    if (this.delayHandle != null) {
      this.timers.clearTimeout(this.delayHandle);
      this.delayHandle = null;
    }
    if (this.intervalHandle != null) {
      this.timers.clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
};
var LONG_PRESS_HOLD_MS = 500;
var LONG_PRESS_EVENT_TYPE = "sb-long-press";
function isLongPressEvent(ev) {
  return Boolean(ev && ev.type === LONG_PRESS_EVENT_TYPE);
}
var LongPressTimer = class {
  constructor(fire, options = {}) {
    this.delayHandle = null;
    this.fired = false;
    this.fire = fire;
    this.delayMs = options.delayMs ?? LONG_PRESS_HOLD_MS;
    this.timers = {
      setTimeout: options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h6) => clearTimeout(h6))
    };
  }
  /** True while a hold is armed (the fire has not happened or been cancelled). */
  get active() {
    return this.delayHandle != null;
  }
  start() {
    this.clearTimer();
    this.fired = false;
    this.delayHandle = this.timers.setTimeout(() => {
      this.delayHandle = null;
      this.fired = true;
      try {
        this.fire();
      } catch (e6) {
      }
    }, this.delayMs);
  }
  /** Cancel a pending hold. Returns whether this hold already fired. */
  stop() {
    this.clearTimer();
    return this.fired;
  }
  /**
   * Read-and-clear the "the hold fired" memory. The release tap that follows
   * a fired hold calls this and skips its own send when it returns true.
   */
  consumeFired() {
    const fired = this.fired;
    this.fired = false;
    return fired;
  }
  clearTimer() {
    if (this.delayHandle != null) {
      this.timers.clearTimeout(this.delayHandle);
      this.delayHandle = null;
    }
  }
};

// remote-card/src/remote-card-state.ts
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
function devicesFromRemote(remoteState) {
  const list = remoteState?.attributes?.devices;
  return (Array.isArray(list) ? list : []).map((device) => ({
    id: Number(device?.id),
    name: String(device?.name ?? ""),
    device_class: device?.device_class != null ? String(device.device_class) : void 0
  })).filter((device) => Number.isFinite(device.id) && device.name);
}
function deviceNameForId(devices, deviceId) {
  if (deviceId == null) return "";
  const id = Number(deviceId);
  if (!Number.isFinite(id)) return "";
  const match = Array.isArray(devices) ? devices.find((device) => device.id === id) : null;
  return match?.name || "";
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
  if (typeof selection === "string" && selection.startsWith("device:")) {
    const rest = selection.slice("device:".length);
    if (rest === "default") {
      return {
        activityId: null,
        label: str().card.allDevicesLayout,
        poweredOff: false,
        mode: "device",
        deviceId: null
      };
    }
    const deviceId = Number(rest);
    if (!Number.isFinite(deviceId)) return null;
    return {
      activityId: null,
      label: "",
      poweredOff: false,
      mode: "device",
      deviceId
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

// remote-card/src/remote-card-activity-state.ts
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
function buildDeviceSelectState({
  editMode,
  preview,
  devices,
  currentDeviceId
}) {
  const options = [
    { value: "", label: str().card.selectDevice },
    ...devices.map((device) => ({
      value: String(device.id),
      label: device.name
    }))
  ];
  let resolvedValue = currentDeviceId != null ? String(currentDeviceId) : "";
  if (editMode && preview?.mode === "device") {
    if (preview.deviceId == null) {
      options.push({ value: "device:default", label: str().card.allDevicesLayout });
      resolvedValue = "device:default";
    } else {
      resolvedValue = String(preview.deviceId);
      if (!options.some((option) => option.value === resolvedValue)) {
        options.push({
          value: resolvedValue,
          label: str().card.deviceFallback(preview.deviceId)
        });
      }
    }
  }
  return {
    options,
    resolvedValue,
    disabled: editMode
  };
}
function noActivitiesWarning(isUnavailable, activitiesLength, loadState) {
  if (!isUnavailable && activitiesLength === 0 && loadState !== "loading") {
    return str().card.noActivitiesWarning;
  }
  return "";
}

// remote-card/src/remote-card-hub.ts
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

// remote-card/src/remote-card-actions.ts
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

// remote-card/src/remote-card-editor-helpers.ts
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

// remote-card/src/remote-card-shared.ts
var CARD_NAME = "Sofabaton Virtual Remote";
var CARD_VERSION = "0.2.3";
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
  const win = window;
  if (win[LOG_ONCE_KEY]) return;
  win[LOG_ONCE_KEY] = true;
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

// remote-card/src/backend/ha-backend.ts
var INTEGRATION_BY_PLATFORM = {
  sofabaton_x1s: "x1s",
  sofabaton_hub: "hub"
};
var HaRemoteBackend = class {
  constructor() {
    this.kind = "ha";
    this._hass = null;
    this._entityId = "";
  }
  get hass() {
    return this._hass;
  }
  get entityId() {
    return this._entityId;
  }
  setHass(hass) {
    this._hass = hass;
  }
  setTarget(target) {
    this._entityId = String(target ?? "");
  }
  snapshot() {
    if (!this._entityId) return void 0;
    return this._hass?.states?.[this._entityId];
  }
  async probeIntegration() {
    if (!this._hass?.callWS || !this._entityId) {
      throw new Error("hass.callWS unavailable");
    }
    const entry = await this._hass.callWS({
      type: "config/entity_registry/get",
      entity_id: this._entityId
    });
    return INTEGRATION_BY_PLATFORM[String(entry?.platform || "")] ?? "unknown";
  }
  entryId() {
    return String(this.snapshot()?.attributes?.entry_id ?? "");
  }
  async devicePowerState(deviceId) {
    if (!this._hass?.callWS) return null;
    const entryId = this.entryId();
    if (!entryId) return null;
    try {
      const response = await this._hass.callWS({
        type: "sofabaton_x1s/device/power_state",
        entry_id: entryId,
        device_id: deviceId
      });
      const raw = response?.power_state;
      return raw === 1 ? 1 : raw === 0 ? 0 : null;
    } catch (_err) {
      return null;
    }
  }
  async deviceKeymap(deviceId) {
    if (!this._hass?.callWS) return null;
    const entryId = this.entryId();
    if (!entryId) return null;
    return this._hass.callWS({
      type: "sofabaton_x1s/device/keymap",
      entry_id: entryId,
      device_id: deviceId
    });
  }
  async sendCommand(commandId, scopeId) {
    const serviceData = remoteSendCommandData(this._entityId, commandId, scopeId);
    if (!serviceData) return;
    await this.callService("remote", "send_command", serviceData);
  }
  async sendRawCommandList(list) {
    await this.callService("remote", "send_command", {
      entity_id: this._entityId,
      command: list
    });
  }
  async startActivity(activity) {
    await this.callService("remote", "turn_on", {
      entity_id: this._entityId,
      activity: activity.name
    });
  }
  async stopActivity() {
    await this.callService("remote", "turn_off", { entity_id: this._entityId });
  }
  async callService(domain, service, data = {}, target = void 0) {
    if (!this._hass?.callService) {
      throw new TypeError("hass.callService unavailable");
    }
    return this._hass.callService(domain, service, data, target);
  }
};

// remote-card/src/state/remote-card-store.ts
var POWER_ON_KEY_ID = 198;
var POWER_OFF_KEY_ID = 199;
var POWER_ASSUMPTION_TTL_MS = 15e3;
var LAST_DEVICE_STORAGE_PREFIX = "sofabaton-remote:last-device:";
function normalizeRemoteCardConfig(config) {
  return {
    show_activity: true,
    show_dpad: true,
    show_nav: true,
    show_mid: true,
    // Do not materialize the split volume/channel defaults here. Their
    // resolvers already default to true, and absence is what lets released
    // `show_mid` configs remain a read-side fallback.
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
    // The backend port (docs/internal/web-remote-plan.md): HA's `hass` is
    // wrapped by the HA adapter; the web remote installs a server adapter.
    this._backend = null;
    this._haBackend = null;
    this._backendUnsubscribe = null;
    this._config = null;
    this._editMode = false;
    this.previewActivity = null;
    // Integration detection (x1s vs hub)
    this.integration = null;
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
    this.loadPending = false;
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
    // Device mode (docs/internal/device-mode-plan.md) — transient UI state,
    // never card config; the card always starts in activity mode.
    this._mode = "activity";
    this._deviceId = null;
    this.deviceKeymaps = {};
    this.deviceKeymapFetching = /* @__PURE__ */ new Set();
    this.initialViewApplied = false;
    this.commandFilter = "";
    // Drawer / menu UI state (direction math stays in the element)
    this.activeDrawer = null;
    this.activityMenuOpen = false;
    // Update gating
    this.lastUpdateFingerprint = null;
    /** True while a power click's read+fire round-trip is in flight. */
    this.powerBusy = false;
    /** Optimistic post-fire assumption; see POWER_ASSUMPTION_TTL_MS. */
    this._powerAssumption = null;
    this.onChange = onChange;
    this.host = host;
  }
  // ---------- core wiring ----------
  /** The active backend, or null before the card is wired to HA or a server. */
  get backend() {
    return this._backend;
  }
  /**
   * The Lovelace `hass` object behind the HA adapter, null on any other
   * backend. HA-only consumers (Automation Assist, ha-select, the theme
   * engine) read it; the store itself never does.
   */
  get hass() {
    return this._haBackend?.hass ?? null;
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
    this._backend?.setTarget(String(this._config.entity));
    this.activeDrawer = null;
    this.activityMenuOpen = false;
    this.initialViewApplied = false;
    this.invalidateFingerprint();
    this.onChange();
  }
  /** HA entry point: wrap `hass` in the HA adapter and make it the backend. */
  setHass(hass) {
    if (!this._haBackend) this._haBackend = new HaRemoteBackend();
    this._haBackend.setHass(hass);
    this.setBackend(this._haBackend);
  }
  /** Generic entry point: any RemoteBackend (the web remote's server adapter). */
  setBackend(backend) {
    if (this._backend !== backend) {
      this._backendUnsubscribe?.();
      this._backendUnsubscribe = null;
      this._backend = backend;
      if (backend?.subscribe) {
        this._backendUnsubscribe = backend.subscribe(() => this.onBackendChange());
      }
    }
    if (backend && this._config?.entity) backend.setTarget(String(this._config.entity));
    this.onBackendChange();
  }
  onBackendChange() {
    void this.ensureIntegration().then(() => {
      if (!this.shouldNotify()) return;
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
    if (this._backend?.subscribe && !this._backendUnsubscribe) {
      this._backendUnsubscribe = this._backend.subscribe(() => this.onBackendChange());
    }
  }
  disconnected() {
    this._backendUnsubscribe?.();
    this._backendUnsubscribe = null;
    if (this.commandPulseTimeout) clearTimeout(this.commandPulseTimeout);
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
    this.commandPulseTimeout = null;
    this.commandPulseUntil = 0;
    this.activityLoadTimeout = null;
  }
  // ---------- update gating ----------
  invalidateFingerprint() {
    this.lastUpdateFingerprint = null;
  }
  shouldNotify() {
    const nextFingerprint = this.updateFingerprint();
    if (nextFingerprint === this.lastUpdateFingerprint) return false;
    this.lastUpdateFingerprint = nextFingerprint;
    return true;
  }
  updateFingerprint() {
    const entityId = String(this._config?.entity || "");
    const remote = entityId ? this.remoteState() : null;
    const attrs = remote?.attributes || {};
    const themeName = String(this._config?.theme || "");
    const themes = this.hass?.themes;
    const themeDef = themeName ? themes?.themes?.[themeName] : null;
    const themeMode = themes?.darkMode ? "dark" : "light";
    const keymapEntry = this._deviceId != null ? this.deviceKeymaps[String(this._deviceId)] : null;
    return [
      entityId,
      String(remote?.state ?? ""),
      String(attrs?.current_activity_id ?? ""),
      String(attrs?.current_activity ?? ""),
      String(attrs?.load_state ?? ""),
      String(attrs?.hub_version ?? ""),
      stableJsonSignature(attrs?.activities),
      stableJsonSignature(attrs?.devices),
      stableJsonSignature(attrs?.assigned_keys),
      stableJsonSignature(attrs?.macro_keys),
      stableJsonSignature(attrs?.favorite_keys),
      stableJsonSignature(this._config?.background_override),
      themeName,
      themeMode,
      stableJsonSignature(themeDef),
      this._editMode ? "1" : "0",
      String(this.previewActivity ?? ""),
      this.integration || "",
      this._mode,
      String(this._deviceId ?? ""),
      keymapEntry ? `${keymapEntry.status}:${keymapEntry.version ?? 0}:${keymapEntry.buttons.length}:${keymapEntry.commands.length}` : "",
      stableJsonSignature(attrs?.keymap_versions)
    ].join("|");
  }
  // ---------- integration detection ----------
  async ensureIntegration() {
    if (!this._backend || !this._config?.entity) return;
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
      this._mode = "activity";
      this._deviceId = null;
      this.deviceKeymaps = {};
      this.commandFilter = "";
      this.initialViewApplied = false;
    }
    if (this.integrationEntityId === entityId && this.integration) return;
    if (this.integrationDetectingFor === entityId) return;
    this.integrationDetectingFor = entityId;
    try {
      this.integration = await this._backend.probeIntegration();
      this.integrationEntityId = entityId;
    } catch (e6) {
      this.integration = null;
      this.integrationEntityId = entityId;
    } finally {
      this.integrationDetectingFor = null;
      this.invalidateFingerprint();
    }
  }
  isHubIntegration() {
    return this.integration === "hub";
  }
  hubVersion() {
    return hubVersionFromState(this.remoteState());
  }
  isX2() {
    return isX2Hub(this.hubVersion(), this.isHubIntegration());
  }
  supportsUnicodeCommandNames() {
    return supportsUnicodeCommandNames(this.hubVersion(), this.isHubIntegration());
  }
  // ---------- device mode ----------
  mode() {
    return this._mode;
  }
  currentDeviceId() {
    return this._deviceId;
  }
  devices() {
    return devicesFromRemote(this.remoteState());
  }
  deviceNameForId(deviceId) {
    return deviceNameForId(this.devices(), deviceId) || null;
  }
  /**
   * Device mode capability: x1s integration only (the official
   * sofabaton_hub integration has no device keymap path), the
   * device_mode.enabled master switch (absent = on), and a non-empty
   * `devices` attribute (published only while the persistent cache is
   * enabled). The show_device_toggle layout switch is deliberately NOT
   * part of this: it only hides the toggle BUTTON (which may strand the
   * user in one mode by design), never the mode itself.
   */
  deviceModeAvailable() {
    if (this.integration !== "x1s") return false;
    if (!deviceModeEnabledInConfig(this._config)) return false;
    return this.devices().length > 0;
  }
  /**
   * Apply the configured opening view once per config: device_mode
   * .open_device puts the card in device mode on that device. Retries until
   * the capability resolves (integration probe + devices attribute are
   * async).
   */
  maybeApplyInitialView() {
    if (this.initialViewApplied) return;
    const openDevice = openDeviceFromConfig(this._config);
    if (openDevice == null) {
      this.initialViewApplied = true;
      return;
    }
    if (!this.deviceModeAvailable()) return;
    this.initialViewApplied = true;
    const id = Number(openDevice);
    if (!this.devices().some((device) => device.id === id)) return;
    this._mode = "device";
    this._deviceId = id;
    void this.ensureDeviceKeymap(id);
  }
  setMode(next) {
    if (this._mode === next) return;
    this._mode = next;
    this.activeDrawer = null;
    this.commandFilter = "";
    if (next === "device") {
      const remembered = this.readLastDevice();
      const devices = this.devices();
      this._deviceId = remembered != null && devices.some((device) => device.id === remembered) ? remembered : null;
      if (this._deviceId != null) void this.ensureDeviceKeymap(this._deviceId);
    }
    this.invalidateFingerprint();
    this.onChange();
  }
  toggleMode() {
    this.setMode(this._mode === "device" ? "activity" : "device");
  }
  setDevice(deviceId) {
    const next = deviceId != null && Number.isFinite(Number(deviceId)) ? Number(deviceId) : null;
    if (this._deviceId === next) return;
    this._deviceId = next;
    this.commandFilter = "";
    this.writeLastDevice(next);
    if (next != null) void this.ensureDeviceKeymap(next);
    this.invalidateFingerprint();
    this.onChange();
  }
  setCommandFilter(value) {
    this.commandFilter = String(value ?? "");
    this.onChange();
  }
  deviceKeymapState(deviceId = this._deviceId) {
    if (deviceId == null) return null;
    return this.deviceKeymaps[String(deviceId)] ?? null;
  }
  /** Power button render gate: keymap ready AND backend says configured. */
  devicePowerConfigured(deviceId = this._deviceId) {
    const entry = this.deviceKeymapState(deviceId);
    return entry?.status === "ready" && entry.powerConfigured === true;
  }
  async fetchDevicePowerState(deviceId) {
    const backend = this._backend;
    if (!backend) return null;
    try {
      return await backend.devicePowerState(deviceId);
    } catch (_err) {
      return null;
    }
  }
  /**
   * Power button click: look up the device's current power state, then
   * fire the opposite power macro (198 POWER_ON / 199 POWER_OFF) through
   * the ordinary device-scope send path. The state read is skipped inside
   * the optimistic window after our own fire (the hub's tracked byte
   * commits only after the macro runs). An unreadable state aborts the
   * click: firing blind would desync the hub's power bookkeeping.
   */
  async toggleDevicePower() {
    if (this._editMode || this.powerBusy) return;
    const backend = this._backend;
    if (!backend || !this._config?.entity) return;
    const deviceId = this._deviceId;
    if (deviceId == null || !this.devicePowerConfigured(deviceId)) return;
    this.powerBusy = true;
    this.onChange();
    try {
      let state = null;
      const assumption = this._powerAssumption;
      if (assumption && assumption.deviceId === deviceId && Date.now() - assumption.at < POWER_ASSUMPTION_TTL_MS) {
        state = assumption.state;
      } else {
        state = await this.fetchDevicePowerState(deviceId);
      }
      if (state == null) return;
      const keyId = state === 1 ? POWER_OFF_KEY_ID : POWER_ON_KEY_ID;
      this.triggerCommandPulse();
      await backend.sendCommand(keyId, deviceId);
      this._powerAssumption = {
        deviceId,
        state: state === 1 ? 0 : 1,
        at: Date.now()
      };
    } finally {
      this.powerBusy = false;
      this.onChange();
    }
  }
  /** Commands for the current device, filtered and alphabetically sorted. */
  filteredCommands() {
    const entry = this.deviceKeymapState();
    if (!entry || entry.status !== "ready") return [];
    return this.filterAndSortCommands(entry.commands);
  }
  /**
   * Fetch one device's keymap from the backend cache projection. Single
   * fetch per device per card lifetime — the remote card never invalidates
   * cache (control panel owns cache management).
   */
  /** The backend's version for a device's keymap (0 when it publishes none). */
  keymapVersion(deviceId) {
    const versions = this.remoteState()?.attributes?.keymap_versions;
    return Number(versions?.[String(deviceId)] ?? 0) || 0;
  }
  /** True when a device's keymap must be (re)fetched: absent, or behind the backend's version. */
  keymapStale(deviceId) {
    const entry = this.deviceKeymaps[String(deviceId)];
    if (!entry) return true;
    if (entry.status === "loading") return false;
    return (entry.version ?? 0) !== this.keymapVersion(deviceId);
  }
  async ensureDeviceKeymap(deviceId) {
    const key = String(deviceId);
    if (!this.keymapStale(deviceId)) return;
    const backend = this._backend;
    if (!backend) return;
    if (this.deviceKeymapFetching.has(key)) return;
    const version = this.keymapVersion(deviceId);
    const previous = this.deviceKeymaps[key];
    if (!previous) {
      this.deviceKeymaps[key] = { status: "loading", buttons: [], commands: [], version };
    }
    this.deviceKeymapFetching.add(key);
    try {
      const response = await backend.deviceKeymap(deviceId);
      if (response === null) {
        if (!previous) {
          delete this.deviceKeymaps[key];
          this.invalidateFingerprint();
          this.onChange();
        }
        return;
      }
      const keymap = response?.keymap;
      if (!keymap) {
        this.deviceKeymaps[key] = {
          status: "cache_miss",
          buttons: [],
          commands: [],
          version
        };
      } else {
        const buttons = new Set(
          (Array.isArray(keymap.buttons) ? keymap.buttons : []).map(
            (code) => Number(code)
          )
        );
        for (const binding of Array.isArray(keymap.bindings) ? keymap.bindings : []) {
          if (Number(binding?.command_id)) buttons.add(Number(binding.button_id));
        }
        this.deviceKeymaps[key] = {
          status: "ready",
          buttons: [...buttons].filter((code) => Number.isFinite(code)),
          commands: (Array.isArray(keymap.commands) ? keymap.commands : []).map((command) => ({
            command_id: Number(command?.command_id),
            name: String(command?.name ?? "")
          })).filter((command) => Number.isFinite(command.command_id) && command.name),
          powerConfigured: keymap.power_configured === true,
          version
        };
      }
    } catch (_err) {
      this.deviceKeymaps[key] = { status: "error", buttons: [], commands: [], version };
    } finally {
      this.deviceKeymapFetching.delete(key);
    }
    this.invalidateFingerprint();
    this.onChange();
  }
  lastDeviceStorageKey() {
    const entity = String(this._config?.entity || "");
    return entity ? `${LAST_DEVICE_STORAGE_PREFIX}${entity}` : null;
  }
  readLastDevice() {
    const key = this.lastDeviceStorageKey();
    if (!key || typeof window === "undefined") return null;
    try {
      const raw = window.localStorage?.getItem(key);
      const id = raw == null ? NaN : Number(raw);
      return Number.isFinite(id) ? id : null;
    } catch (_err) {
      return null;
    }
  }
  writeLastDevice(deviceId) {
    const key = this.lastDeviceStorageKey();
    if (!key || typeof window === "undefined") return;
    try {
      if (deviceId == null) {
        window.localStorage?.removeItem(key);
      } else {
        window.localStorage?.setItem(key, String(deviceId));
      }
    } catch (_err) {
    }
  }
  // ---------- basic state helpers ----------
  remoteState() {
    return this._backend?.snapshot();
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
  layoutSignature(layoutKey, layoutConfig) {
    const order = normalizedGroupOrder(layoutConfig?.group_order);
    const parts = [
      `activity:${layoutKey ?? "off"}`,
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
    for (let i8 = 0; i8 < arr.length; i8++) {
      const norm = normalizeCustomFavorite(arr[i8], i8);
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
    if (this._mode === "device") {
      const entry = this.deviceKeymapState();
      if (!entry || entry.status !== "ready") return true;
      return entry.buttons.includes(Number(id));
    }
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
    return isActivityLoading || Boolean(isPulse) || this.loadPending;
  }
  triggerCommandPulse() {
    this.commandPulseUntil = Date.now() + 1e3;
    this.host.onCommandPulseChange?.(true);
    if (this.commandPulseTimeout) clearTimeout(this.commandPulseTimeout);
    this.commandPulseTimeout = setTimeout(() => {
      this.commandPulseUntil = 0;
      this.commandPulseTimeout = null;
      this.host.onCommandPulseChange?.(false);
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
  stopActivityLoading(notify = true) {
    if (!this.activityLoadActive) return;
    this.activityLoadActive = false;
    this.activityLoadTarget = null;
    if (this.activityLoadTimeout) clearTimeout(this.activityLoadTimeout);
    this.activityLoadTimeout = null;
    if (notify) this.onChange();
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
    if (!this._backend || !this._config?.entity) return;
    this.hubInitState();
    this.hubQueue = enqueueHubCommand(this.hubQueue, list, { priority, gapMs });
    this.hubDrainQueue().catch(() => {
    });
  }
  hubEnqueueRequest(list, requestKey) {
    if (!this.isHubIntegration()) return;
    if (!this._backend || !this._config?.entity) return;
    this.hubInitState();
    if (requestKey && wasHubRequested(this.hubRequestSeen, requestKey)) return;
    if (requestKey) {
      this.hubRequestSeen = markHubRequested(this.hubRequestSeen, requestKey);
    }
    this.hubEnqueueCommand(list, { priority: false, gapMs: 3e3 });
  }
  async hubDrainQueue() {
    if (!this.isHubIntegration()) return;
    if (!this._backend || !this._config?.entity) return;
    this.hubInitState();
    if (this.hubQueueBusy) return;
    this.hubQueueBusy = true;
    try {
      while (this.hubQueue.length) {
        const next = this.hubQueue.shift();
        if (!next?.list) continue;
        await this._backend?.sendRawCommandList?.(next.list);
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
    if (!this._backend || !this._config?.entity) return;
    this.hubInitState();
    if (throttleKey) {
      if (!this.hubThrottle(throttleKey, minIntervalMs)) return;
    }
    if (this.hubQueueBusy || Array.isArray(this.hubQueue) && this.hubQueue.length) {
      this.hubEnqueueCommand(list, { priority: true, gapMs: 150 });
      return;
    }
    await this._backend?.sendRawCommandList?.(list);
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
    const backend = this._backend;
    if (!backend?.callService) {
      throw new TypeError("service calls are unavailable on this backend");
    }
    await backend.callService(domain, service, data, target);
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
    if (!this._backend || !this._config?.entity) return;
    const resolvedDevice = this._mode === "device" ? deviceId != null && Number.isFinite(Number(deviceId)) ? Number(deviceId) : this._deviceId : this.resolveCommandDeviceId(commandId, deviceId);
    if (this._mode === "device" && resolvedDevice == null) return;
    if (this.isHubIntegration()) {
      const command = hubAssignedKeyCommand(resolvedDevice, commandId);
      if (!command) return;
      await this.hubSendCommandList(command);
      return;
    }
    await this._backend.sendCommand(commandId, resolvedDevice);
  }
  /**
   * A button's hub long-press binding on one entity page, or null
   * (docs/internal/long-press-plan.md). Gated on the x1s integration (the
   * official sofabaton_hub integration has no keymap detail source) and on
   * the `long_press_keys` attribute, which the backend publishes only
   * while the persistent cache is enabled and only for pages whose keymap
   * details are populated. Hold-repeat precedence is the caller's concern
   * (it needs the key spec, not the button id).
   */
  longPressBindingForButton(buttonId, scopeId) {
    if (this.integration !== "x1s") return null;
    const attrs = this.remoteState()?.attributes;
    return hubLongPressBinding(attrs, scopeId, buttonId);
  }
  /** True when holding this hard button should fire its long-press binding. */
  longPressAvailableForButton(buttonId, scopeId) {
    return this.longPressBindingForButton(buttonId, scopeId) !== null;
  }
  /**
   * Fire a button's hub long-press binding. The card resolves the pair and
   * sends it exactly like a favorite (`send_command {command, device}`):
   * the entity and its services have no long-press concept. Guarded like
   * sendCommand; never reached for sofabaton_hub (the gate above stays
   * null there).
   */
  async sendLongPress(buttonId, scopeId) {
    if (this._editMode) return;
    if (!this._backend || !this._config?.entity) return;
    const binding = this.longPressBindingForButton(buttonId, scopeId);
    if (!binding) return;
    await this._backend.sendCommand(binding.command_id, binding.device_id);
  }
  async sendDrawerItem(itemType, commandId, deviceId, rawItem) {
    if (this._editMode) return;
    if (!this.isHubIntegration()) {
      return this.sendCommand(commandId, deviceId);
    }
    if (!this._backend || !this._config?.entity) return;
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
    if (!this._backend || !this._config?.entity) return;
    const cmd = Number(commandId);
    const dev = Number(deviceId);
    if (!Number.isFinite(cmd) || !Number.isFinite(dev)) return;
    if (this.isHubIntegration()) {
      const command = hubFavoriteKeyCommand(dev, cmd);
      if (!command) return;
      await this.hubSendCommandList(command);
      return;
    }
    await this._backend.sendCommand(cmd, dev);
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
    const backend = this._backend;
    if (!backend) return;
    if (isPoweredOffLabel(selected)) {
      await backend.stopActivity();
      return;
    }
    const target = this.activities().find((activity) => activity.name === selected);
    await backend.startActivity({ id: target?.id ?? null, name: selected });
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
    this.maybeApplyInitialView();
    let mode = preview ? preview.mode === "device" ? "device" : "activity" : this._mode;
    if (mode === "device" && !preview && !this.deviceModeAvailable()) {
      mode = "activity";
    }
    const activityId = preview ? preview.activityId : this.currentActivityId();
    const deviceId = mode === "device" ? preview ? preview.deviceId ?? null : this._deviceId : null;
    const layoutConfig = mode === "device" ? layoutConfigForDevice(this._config, deviceId) : layoutConfigForActivity(this._config, activityId);
    if (mode === "device" && deviceId != null && this.keymapStale(deviceId)) {
      void this.ensureDeviceKeymap(deviceId);
    }
    const keymapEntry = mode === "device" ? this.deviceKeymapState(deviceId) : null;
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
    const loadPending = mode !== "device" && !isUnavailable && !preview && loadState === "loading" && (activityId == null ? activities.length === 0 : rawAssignedKeys == null);
    this.loadPending = loadPending;
    const pendingAge = this.pendingActivityAt ? Date.now() - this.pendingActivityAt : null;
    const pendingExpired = pendingAge != null && pendingAge > 15e3;
    let selectState = null;
    let deviceSelectState = null;
    let isPoweredOff = false;
    let currentLabel = "";
    if (isUnavailable) {
      this.stopActivityLoading(false);
    } else if (mode === "device") {
      deviceSelectState = buildDeviceSelectState({
        editMode: this._editMode,
        preview,
        devices: this.devices(),
        currentDeviceId: deviceId
      });
      currentLabel = deviceId != null ? this.deviceNameForId(deviceId) ?? "" : "";
      isPoweredOff = false;
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
          this.stopActivityLoading(false);
        }
      }
    }
    const showVolume = volumeGroupEnabled(layoutConfig);
    const showChannel = channelGroupEnabled(layoutConfig);
    const showMedia = mediaGroupEnabled(layoutConfig);
    const showDvr = dvrGroupEnabled(layoutConfig);
    const deviceModeAvailable = this.deviceModeAvailable() && deviceToggleEnabled(layoutConfig);
    const layoutKey = mode === "device" ? deviceLayoutKey(deviceId) : activityId;
    const commands = keymapEntry?.status === "ready" ? this.filterAndSortCommands(keymapEntry.commands) : [];
    const deviceNotice = mode !== "device" ? "" : keymapEntry?.status === "cache_miss" ? str().card.deviceKeymapMissing : keymapEntry?.status === "error" ? str().card.deviceKeymapError : "";
    return {
      remote,
      isUnavailable,
      loadState,
      activities,
      preview,
      activityId,
      mode,
      deviceId,
      keymapEntry,
      keymapLoading: keymapEntry?.status === "loading",
      loadPending,
      commands,
      commandFilter: this.commandFilter,
      showCommandsButton: commandsButtonEnabled(layoutConfig),
      deviceModeAvailable,
      layoutConfig,
      layoutSignature: this.layoutSignature(layoutKey, layoutConfig),
      macros: resolvedHubData.macros,
      favorites: resolvedHubData.favorites,
      customFavorites: this.customFavorites(),
      rawAssignedKeys,
      selectState,
      deviceSelectState,
      currentLabel,
      isPoweredOff,
      isX2: this.isX2(),
      showVolume,
      showChannel,
      showMedia,
      showDvr,
      noActivitiesMessage: mode === "device" ? deviceNotice : noActivitiesWarning(isUnavailable, activities.length, loadState)
    };
  }
  filterAndSortCommands(commands) {
    const needle = this.commandFilter.trim().toLowerCase();
    const filtered = needle ? commands.filter((command) => command.name.toLowerCase().includes(needle)) : commands;
    return [...filtered].sort(
      (a4, b3) => a4.name.localeCompare(b3.name, void 0, { sensitivity: "base" })
    );
  }
};

// remote-card/src/remote-card-assist-yaml.ts
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
  const eventLabel = kind === "button" ? capture.deviceMode ? notify.eventCommand(label) : notify.eventButton(label) : kind === "activity" ? notify.eventActivity(label) : notify.eventOther(label);
  const buttonYaml = automationAssistButtonYaml(capture, entityId, hubIntegration);
  const remoteYaml = automationAssistRemoteYaml(capture, entityId, hubIntegration);
  return [
    "---",
    "",
    capture.deviceMode ? notify.headerDevice(
      capture.deviceName || str().assist.unknownDevice,
      eventLabel
    ) : notify.header(activityName, eventLabel),
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

// remote-card/src/state/automation-assist-controller.ts
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
    const win = window;
    if (!win[AUTOMATION_ASSIST_SESSION_KEY]) {
      win[AUTOMATION_ASSIST_SESSION_KEY] = {
        hideMqttModal: false,
        discoveryDeviceIds: /* @__PURE__ */ new Set(),
        activityTriggersCreated: false
      };
    }
    return win[AUTOMATION_ASSIST_SESSION_KEY];
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
    if (params.deviceMode) {
      const device = Number(params.deviceId);
      if (!Number.isFinite(device)) return;
      this.capture = {
        label: String(params.label ?? str().assist.buttonFallback),
        commandId: command,
        deviceId: device,
        commandType: params.commandType ?? "assigned",
        icon: params.icon ? String(params.icon) : null,
        deviceMode: true,
        deviceName: String(
          params.deviceName || str().assist.deviceFallback(device)
        ),
        kind: "button"
      };
      this.resetCaptureSideState();
      this.host.onChange();
      this.notifyCapture();
      return;
    }
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

// node_modules/lit-html/static.js
var a3 = /* @__PURE__ */ Symbol.for("");
var o7 = (t5) => {
  if (t5?.r === a3) return t5?._$litStatic$;
};
var s6 = (t5) => ({ _$litStatic$: t5, r: a3 });
var l3 = /* @__PURE__ */ new Map();
var n6 = (t5) => (r6, ...e6) => {
  const a4 = e6.length;
  let s7, i8;
  const n7 = [], u6 = [];
  let c7, $3 = 0, f4 = false;
  for (; $3 < a4; ) {
    for (c7 = r6[$3]; $3 < a4 && void 0 !== (i8 = e6[$3], s7 = o7(i8)); ) c7 += s7 + r6[++$3], f4 = true;
    $3 !== a4 && u6.push(i8), n7.push(c7), $3++;
  }
  if ($3 === a4 && n7.push(r6[a4]), f4) {
    const t6 = n7.join("$$lit$$");
    void 0 === (r6 = l3.get(t6)) && (n7.raw = n7, l3.set(t6, r6 = n7)), e6 = u6;
  }
  return t5(r6, ...e6);
};
var u5 = n6(b2);
var c6 = n6(w);
var $2 = n6(T);

// remote-card/src/sections/wire.ts
function primaryActionRef(handler) {
  return n5((el) => {
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
  return n5((el) => {
    if (!el) return;
    const node = el;
    if (node.__sbListenersWired) return;
    node.__sbListenersWired = true;
    wire(node);
  });
}

// remote-card/src/sections/activity-row.ts
function renderActivityRow(params) {
  const itemTag = s6(selectItemTagName());
  const options = params.unavailable ? [] : params.options;
  const optionObjects = options.map(
    (opt) => typeof opt === "string" ? { value: opt, label: opt } : opt
  );
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
  const toggle = params.modeToggle ? b2`
        <button
          type="button"
          class="sb-mode-toggle"
          aria-label=${params.modeToggle.ariaLabel}
          title=${params.modeToggle.ariaLabel}
          .disabled=${params.unavailable}
          @click=${(ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    params.modeToggle.onToggle();
  }}
        >
          <ha-icon icon=${params.modeToggle.icon}></ha-icon>
        </button>
      ` : A;
  return b2`
    <div
      class="activityRow${params.modeToggle ? " activityRow--with-toggle" : ""}${params.menuOpen ? " activityRow--menu-open" : ""}"
      style=${params.visible ? "" : "display: none !important;"}
      ${params.rowRef ? n5(params.rowRef) : A}
    >
      ${toggle}
      <ha-select
        class="sb-activity-select"
        .label=${params.selectLabel}
        .hass=${params.hass}
        .value=${params.unavailable ? "" : selectValueCompat(params.resolvedValue, optionObjects)}
        .disabled=${params.unavailable || params.disabled}
        ${wireSelectEvents}
      >
        ${c4(
    optionObjects,
    (option) => option.value,
    (option) => u5`
            <${itemTag} .value=${option.value}>${option.label}</${itemTag}>
          `
  )}
      </ha-select>
      <div
        class="loadIndicator${params.loading ? " is-loading" : ""}"
        ${params.loadIndicatorRef ? n5(params.loadIndicatorRef) : A}
      ></div>
    </div>
  `;
}

// remote-card/src/components/sb-key-button.ts
var CONTROL_CSS = `
  :host {
    display: block;
    min-width: 0;
  }

  .sb-key-control {
    appearance: none;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 100%;
    padding: 0 var(--sb-control-padding-inline, 10px);
    border-radius: var(
      --sb-control-radius,
      var(--sb-group-radius, var(--ha-card-border-radius, 18px))
    );
    border: var(--sb-control-border-width, var(--ha-card-border-width, 1px)) solid
      var(--sb-control-border-color, var(--ha-card-border-color, var(--divider-color)));
    background: var(
      --sb-control-background,
      var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))
    );
    box-shadow: var(--sb-control-box-shadow, var(--ha-card-box-shadow, none));
    color: inherit;
    font: inherit;
    font-size: var(--sb-control-font-size, inherit);
    text-align: center;
    cursor: pointer;
    position: relative;
    z-index: 1;
    overflow: hidden;
    -webkit-tap-highlight-color: transparent;
    /* Holding a button (long press) must not open the iOS callout or
       start a text selection. */
    -webkit-touch-callout: none;
    -webkit-user-select: none;
    user-select: none;
  }

  .sb-key-control::before {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 0;
    border-radius: inherit;
    /* Hover / press overlay derived from the theme's text colour via
       color-mix: works for any colour syntax and for card-level themes.
       The rgba(var(--rgb-primary-text-color)) form only worked for hex
       themes, and HA's base hardcodes --rgb-primary-text-color to dark
       (33,33,33), so dark themes got an invisible dark-on-dark overlay. */
    background: var(--sb-overlay-hover, color-mix(in srgb, var(--primary-text-color, #000) 10%, transparent));
    opacity: 0;
    pointer-events: none;
    transition: opacity 120ms ease;
  }

  @media (hover: hover) {
    .sb-key-control:not(:disabled):hover::before {
      opacity: 1;
    }
  }

  .sb-key-control:not(:disabled):active::before {
    background: var(--sb-overlay-press, color-mix(in srgb, var(--primary-text-color, #000) 18%, transparent));
    opacity: 1;
  }

  .sb-key-control:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--primary-color, #03a9f4) 55%, transparent);
    outline-offset: -2px;
  }

  .sb-key-control:disabled {
    cursor: default;
  }

  .sb-key-control__icon,
  .sb-key-control__trailing-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.2em;
    height: 1.2em;
    line-height: 1;
    flex: 0 0 auto;
    --mdc-icon-size: 1.2em;
    color: var(--sb-key-label-color, var(--primary-color));
    position: relative;
    z-index: 1;
  }

  /* A trailing affordance must not take width away from the label. Keep it
     pinned to the logical inline end (right in LTR, left in RTL), while the
     label reserves only the icon's footprint inside its own full-width box. */
  .sb-key-control__trailing-icon {
    position: absolute;
    inset-inline-end: 8px;
    top: 50%;
    transform: translateY(-50%);
  }

  .sb-key-control__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    position: relative;
    z-index: 1;
    /* Text on keys reads as part of the same control language as the
       icons, so it shares their colour (the icon rule above). */
    color: var(--sb-key-label-color, var(--primary-color));
  }

  .sb-key-control--with-trailing-icon .sb-key-control__label {
    box-sizing: border-box;
    width: 100%;
    padding-inline-end: 1.2em;
  }

  [hidden] {
    display: none !important;
  }
`;
var sharedControlSheet = null;
function installControlStyles(root) {
  if (typeof CSSStyleSheet !== "undefined" && "replaceSync" in CSSStyleSheet.prototype && "adoptedStyleSheets" in root) {
    if (!sharedControlSheet) {
      sharedControlSheet = new CSSStyleSheet();
      sharedControlSheet.replaceSync(CONTROL_CSS);
    }
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, sharedControlSheet];
    return;
  }
  const style = document.createElement("style");
  style.textContent = CONTROL_CSS;
  root.appendChild(style);
}
var BaseElement = globalThis.HTMLElement ?? class {
};
var SbKeyButton = class extends BaseElement {
  constructor() {
    super(...arguments);
    this._control = null;
    this._iconEl = null;
    this._trailingIconEl = null;
    this._labelEl = null;
    this._label = "";
    this._icon = null;
    this._trailingIcon = null;
    this._accessibilityLabel = "";
    this._color = null;
    this._sizeVar = null;
    this._disabled = false;
    this._wired = false;
    this._holdRepeat = false;
    this._longPress = false;
    /**
     * Long press: while holdRepeat is on, pressing and holding repeats the
     * trigger (first after HOLD_REPEAT_DELAY_MS, then every
     * HOLD_REPEAT_INTERVAL_MS). The release tap of a hold that repeated is
     * suppressed so letting go never sends one more command.
     */
    this._hold = new HoldRepeatTimer((repeatIndex) => this.repeatTrigger(repeatIndex));
    /**
     * Hub long-press binding: while longPress is on (and holdRepeat is not,
     * hold-to-repeat wins that collision), holding fires the long-press
     * trigger exactly once at LONG_PRESS_HOLD_MS. The release tap of a hold
     * that fired is suppressed, so letting go never also sends the short
     * press.
     */
    this._longHold = new LongPressTimer(() => this.longPressTrigger());
    /** Called on a primary pointer action, keyboard activation, or hold repeat. */
    this.onTrigger = null;
  }
  set label(value) {
    this._label = String(value ?? "");
    this.syncContent();
  }
  set icon(value) {
    this._icon = value ? String(value) : null;
    this.syncContent();
  }
  set trailingIcon(value) {
    this._trailingIcon = value ? String(value) : null;
    this.syncContent();
  }
  set accessibilityLabel(value) {
    this._accessibilityLabel = String(value ?? "");
    this.syncContent();
  }
  set color(value) {
    this._color = value ? String(value) : null;
    if (this._color) {
      this.style.setProperty("--sb-color", this._color);
      this.style.setProperty("--sb-control-background", this._color);
    } else {
      this.style.removeProperty("--sb-color");
      this.style.removeProperty("--sb-control-background");
    }
  }
  /** CSS var applied to the native control's icon/name. */
  set sizeVar(value) {
    this._sizeVar = value ? String(value) : null;
    if (this._sizeVar) {
      this.style.setProperty("--sb-control-font-size", `var(${this._sizeVar})`);
    } else {
      this.style.removeProperty("--sb-control-font-size");
    }
  }
  set disabled(value) {
    this._disabled = Boolean(value);
    if (this._control) this._control.disabled = this._disabled;
    if (this._disabled) {
      this._hold.stop();
      this._longHold.stop();
    }
  }
  /** Enable long press (hold-to-repeat) on this control. */
  set holdRepeat(value) {
    this._holdRepeat = Boolean(value);
    if (!this._holdRepeat) this._hold.stop();
  }
  get holdRepeat() {
    return this._holdRepeat;
  }
  /**
   * Enable the hub long-press binding on this control. Ignored while
   * holdRepeat is on: a hold can only mean one thing, and the explicit
   * hold-to-repeat opt-in beats the transparent binding.
   */
  set longPress(value) {
    this._longPress = Boolean(value);
    if (!this._longPress) this._longHold.stop();
  }
  get longPress() {
    return this._longPress;
  }
  get disabled() {
    return this._disabled;
  }
  fireHaptic() {
    this.dispatchEvent(
      new CustomEvent("haptic", {
        detail: "light",
        bubbles: true,
        composed: true
      })
    );
  }
  trigger(ev) {
    if (this._disabled || this.classList.contains("disabled")) return;
    if (this._hold.consumeFired()) return;
    if (this._longHold.consumeFired()) return;
    this.onTrigger?.(ev);
  }
  repeatTrigger(repeatIndex) {
    if (this._disabled || this.classList.contains("disabled")) {
      this._hold.stop();
      return;
    }
    if (repeatIndex === 1) this.fireHaptic();
    this.onTrigger?.(new CustomEvent(HOLD_REPEAT_EVENT_TYPE, { detail: repeatIndex }));
  }
  longPressTrigger() {
    if (this._disabled || this.classList.contains("disabled")) {
      this._longHold.stop();
      return;
    }
    this.fireHaptic();
    this.onTrigger?.(new CustomEvent(LONG_PRESS_EVENT_TYPE));
  }
  onHoldPointerDown(ev) {
    if (this._disabled || this.classList.contains("disabled")) return;
    if (ev.isPrimary === false || typeof ev.button === "number" && ev.button !== 0) return;
    if (this._holdRepeat) {
      this._hold.start();
    } else if (this._longPress) {
      this._longHold.start();
    }
  }
  onHoldPointerEnd(ev) {
    this._hold.stop();
    this._longHold.stop();
    if (ev.type !== "pointerup") {
      this._hold.consumeFired();
      this._longHold.consumeFired();
    }
  }
  syncContent() {
    if (!this._control || !this._iconEl || !this._trailingIconEl || !this._labelEl) return;
    if (this._icon) {
      this._iconEl.setAttribute("icon", this._icon);
      this._iconEl.hidden = false;
    } else {
      this._iconEl.removeAttribute("icon");
      this._iconEl.hidden = true;
    }
    if (this._trailingIcon) {
      this._trailingIconEl.setAttribute("icon", this._trailingIcon);
      this._trailingIconEl.hidden = false;
    } else {
      this._trailingIconEl.removeAttribute("icon");
      this._trailingIconEl.hidden = true;
    }
    this._control.classList.toggle(
      "sb-key-control--with-trailing-icon",
      Boolean(this._trailingIcon)
    );
    this._labelEl.textContent = this._label;
    this._labelEl.hidden = !this._label;
    this._control.setAttribute(
      "aria-label",
      this._accessibilityLabel || this._label || "Remote button"
    );
  }
  connectedCallback() {
    if (this._wired) return;
    this._wired = true;
    const root = this.attachShadow({ mode: "open" });
    installControlStyles(root);
    const control = document.createElement("button");
    control.type = "button";
    control.className = "sb-key-control";
    control.disabled = this._disabled;
    const icon = document.createElement("ha-icon");
    icon.className = "sb-key-control__icon";
    const label = document.createElement("span");
    label.className = "sb-key-control__label";
    const trailingIcon = document.createElement("ha-icon");
    trailingIcon.className = "sb-key-control__trailing-icon";
    control.append(icon, label, trailingIcon);
    root.appendChild(control);
    this._control = control;
    this._iconEl = icon;
    this._trailingIconEl = trailingIcon;
    this._labelEl = label;
    this.syncContent();
    this.addEventListener("pointerdown", (ev) => this.onHoldPointerDown(ev), {
      capture: true
    });
    for (const type of ["pointerup", "pointercancel", "pointerleave", "lostpointercapture"]) {
      this.addEventListener(type, (ev) => this.onHoldPointerEnd(ev), { capture: true });
    }
    control.addEventListener("contextmenu", (ev) => {
      if (this._holdRepeat || this._longPress) ev.preventDefault();
    });
    attachPrimaryAction([this, control], (ev) => this.trigger(ev), {
      fireHaptic: () => this.fireHaptic()
    });
    control.addEventListener("click", (ev) => {
      if (ev.detail !== 0 || this._disabled) return;
      this.fireHaptic();
      this.trigger(ev);
    });
  }
  disconnectedCallback() {
    this._hold.stop();
    this._longHold.stop();
  }
};
if (!customElements.get("sb-key-button")) {
  customElements.define("sb-key-button", SbKeyButton);
}

// remote-card/src/sections/key-groups.ts
var X2_ONLY_KEY_IDS = /* @__PURE__ */ new Set([
  ID.C,
  ID.B,
  ID.A,
  ID.EXIT,
  ID.DVR,
  ID.PLAY,
  ID.GUIDE
]);
var DPAD_KEYS = [
  { key: "up", id: ID.UP, cmd: ID.UP, label: "", icon: "mdi:chevron-up", extraClass: "area-up" },
  { key: "left", id: ID.LEFT, cmd: ID.LEFT, label: "", icon: "mdi:chevron-left", extraClass: "area-left" },
  // Language-neutral filled circle instead of a localized "OK" label; the
  // assist capture label still resolves to str().keys.ok via the key fallback.
  { key: "ok", id: ID.OK, cmd: ID.OK, label: "", icon: "mdi:circle", extraClass: "area-ok okKey", size: "big" },
  { key: "right", id: ID.RIGHT, cmd: ID.RIGHT, label: "", icon: "mdi:chevron-right", extraClass: "area-right" },
  { key: "down", id: ID.DOWN, cmd: ID.DOWN, label: "", icon: "mdi:chevron-down", extraClass: "area-down" }
];
var NAV_KEYS = [
  { key: "back", id: ID.BACK, cmd: ID.BACK, label: "", icon: "mdi:arrow-u-left-top" },
  { key: "home", id: ID.HOME, cmd: ID.HOME, label: "", icon: "mdi:home" },
  { key: "menu", id: ID.MENU, cmd: ID.MENU, label: "", icon: "mdi:menu" }
];
var MID_KEYS = [
  { key: "volup", id: ID.VOL_UP, cmd: ID.VOL_UP, label: "", icon: "mdi:volume-plus", extraClass: "mid-btn mid-btn-volup" },
  { key: "voldn", id: ID.VOL_DOWN, cmd: ID.VOL_DOWN, label: "", icon: "mdi:volume-minus", extraClass: "mid-btn mid-btn-voldn" },
  // Language-neutral TV-guide glyph instead of the always-English "Guide"
  // text, which was the one label in the icon-only mid cluster and clipped
  // at narrow card widths. Like the OK key, the assist capture label still
  // resolves to the localized str().keys.guide via the key fallback.
  { key: "guide", id: ID.GUIDE, cmd: ID.GUIDE, label: "", icon: "mdi:television-guide", extraClass: "mid-btn mid-btn-guide" },
  { key: "mute", id: ID.MUTE, cmd: ID.MUTE, label: "", icon: "mdi:volume-mute", extraClass: "mid-btn mid-btn-mute" },
  { key: "chup", id: ID.CH_UP, cmd: ID.CH_UP, label: "", icon: "mdi:chevron-up", extraClass: "mid-btn mid-btn-chup" },
  { key: "chdn", id: ID.CH_DOWN, cmd: ID.CH_DOWN, label: "", icon: "mdi:chevron-down", extraClass: "mid-btn mid-btn-chdn" }
];
var MEDIA_KEYS = [
  { key: "rew", id: ID.REW, cmd: ID.REW, label: "", icon: "mdi:rewind", extraClass: "area-rew" },
  { key: "play", id: ID.PLAY, cmd: ID.PLAY, label: "", icon: "mdi:play", extraClass: "area-play" },
  { key: "fwd", id: ID.FWD, cmd: ID.FWD, label: "", icon: "mdi:fast-forward", extraClass: "area-fwd" },
  { key: "dvr", id: ID.DVR, cmd: ID.DVR, label: "DVR", icon: "", extraClass: "area-dvr" },
  { key: "pause", id: ID.PAUSE, cmd: ID.PAUSE, label: "", icon: "mdi:pause", extraClass: "area-pause" },
  { key: "exit", id: ID.EXIT, cmd: ID.EXIT, label: "Exit", icon: "", extraClass: "area-exit" }
];
var COLOR_KEYS = [
  { key: "red", id: ID.RED, cmd: ID.RED, label: "", icon: "", color: "#d32f2f" },
  { key: "green", id: ID.GREEN, cmd: ID.GREEN, label: "", icon: "", color: "#388e3c" },
  { key: "yellow", id: ID.YELLOW, cmd: ID.YELLOW, label: "", icon: "", color: "#fbc02d" },
  { key: "blue", id: ID.BLUE, cmd: ID.BLUE, label: "", icon: "", color: "#1976d2" }
];
var ABC_KEYS = [
  { key: "a", id: ID.A, cmd: ID.A, label: "A", icon: "", size: "small" },
  { key: "b", id: ID.B, cmd: ID.B, label: "B", icon: "", size: "small" },
  { key: "c", id: ID.C, cmd: ID.C, label: "C", icon: "", size: "small" }
];
function renderKey(params, spec) {
  const isX2Only = X2_ONLY_KEY_IDS.has(spec.id);
  const layoutVisible = params.buttonVisibility && spec.key in params.buttonVisibility ? params.buttonVisibility[spec.key] : true;
  const shouldShow = isX2Only ? params.isX2 && layoutVisible : layoutVisible;
  if (!shouldShow) return A;
  const enabled = !params.disableAll && (params.editMode || params.isEnabled(spec.id));
  const wrapClassName = spec.color ? "key key--color" : `key key--${spec.size ?? "normal"} ${spec.extraClass ?? ""}`.trim();
  const accessibleLabel = automationAssistLabelForKey(
    spec.key,
    spec.color ? spec.key : spec.label
  );
  return b2`
    <sb-key-button
      class="${wrapClassName}${enabled ? "" : " disabled"}"
      .label=${spec.label}
      .icon=${spec.icon || null}
      .accessibilityLabel=${accessibleLabel}
      .color=${spec.color ?? null}
      .sizeVar=${spec.color ? null : "--sb-key-font-size"}
      .disabled=${!enabled}
      .holdRepeat=${params.holdRepeatForKey(spec.key)}
      .longPress=${params.longPressForKey(spec)}
      .onTrigger=${(ev) => params.onKeyPress(spec, ev)}
    ></sb-key-button>
  `;
}
function renderDpad(params, visible) {
  if (!visible) return A;
  return b2`<div class="dpad">${DPAD_KEYS.map((k2) => renderKey(params, k2))}</div>`;
}
function renderNavRow(params, visible) {
  if (!visible) return A;
  return b2`<div class="row3">${NAV_KEYS.map((k2) => renderKey(params, k2))}</div>`;
}
function renderMid(params, visible) {
  if (!visible) return A;
  const midState = midModeState({
    showVolume: params.showVolume,
    showChannel: params.showChannel,
    isX2: params.isX2
  });
  const className = [
    "mid",
    ...Object.entries(midState.classMap).filter(([, on]) => on).map(([name]) => name)
  ].join(" ");
  return b2`<div class=${className}>${MID_KEYS.map((k2) => renderKey(params, k2))}</div>`;
}
function renderMedia(params, visible) {
  if (!visible) return A;
  const mediaState = mediaModeState({
    isX2: params.isX2,
    showMedia: params.showMedia,
    showDvr: params.showDvr
  });
  const className = [
    "media",
    ...Object.entries(mediaState.classMap).filter(([, on]) => on).map(([name]) => name)
  ].join(" ");
  return b2`<div class=${className}>${MEDIA_KEYS.map((k2) => renderKey(params, k2))}</div>`;
}
function renderShortcutsRow(params, visible) {
  if (!visible) return A;
  return b2`
    <div class="row3 shortcuts">
      ${params.slots.map((slot) => {
    if (slot.icon == null) {
      return b2`
            <div
              class="key key--normal ${params.editMode ? "shortcut-ghost" : "shortcut-spacer"}"
              aria-hidden="true"
            ></div>
          `;
    }
    const enabled = !params.disableAll && (params.editMode || !slot.missing);
    return b2`
          <sb-key-button
            class="key key--normal shortcut-key${enabled ? "" : " disabled"}"
            .label=${""}
            .icon=${slot.icon}
            .accessibilityLabel=${slot.label}
            .sizeVar=${"--sb-key-font-size"}
            .disabled=${!enabled}
            .holdRepeat=${false}
            .onTrigger=${() => params.onPress(slot)}
          ></sb-key-button>
        `;
  })}
    </div>
  `;
}
function renderColors(params, visible) {
  if (!visible) return A;
  return b2`
    <div class="colors">
      <div class="colorsGrid">${COLOR_KEYS.map((k2) => renderKey(params, k2))}</div>
    </div>
  `;
}
function renderAbc(params, visible) {
  if (!visible) return A;
  return b2`
    <div class="abc">
      <div class="abcGrid">${ABC_KEYS.map((k2) => renderKey(params, k2))}</div>
    </div>
  `;
}

// remote-card/src/remote-card-render-models.ts
function drawerCommandType(type) {
  if (type === "macros") return "macro";
  if (type === "favorites") return "favorite";
  return "assigned";
}
function drawerButtonModel(item, type, fallbackDeviceId) {
  return {
    label: item?.name || str().assist.unknown,
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

// remote-card/src/sections/macro-favorites.ts
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
function itemKey(item, type) {
  const commandId = item.command_id ?? item.id ?? "";
  const deviceId = item.device_id ?? item.device ?? "";
  const name = item.name ?? "";
  const action = item.action ? JSON.stringify(item.action) : "";
  return `${type}:${String(deviceId)}:${String(commandId)}:${String(name)}:${action}`;
}
function withUniqueKeys(entries) {
  const occurrences = /* @__PURE__ */ new Map();
  return entries.map((entry) => {
    const base = itemKey(entry.item, entry.kind);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { ...entry, key: `${base}#${occurrence}` };
  });
}
function renderDrawerItems(params, items, type) {
  const entries = withUniqueKeys(items.map((item) => ({ kind: type, item })));
  return b2`${c4(
    entries,
    (entry) => entry.key,
    (entry) => renderDrawerButton(params, entry.item, type)
  )}`;
}
function renderFavoritesItems(params) {
  const items = withUniqueKeys([
    ...params.customFavorites.map((item) => ({ kind: "custom", item })),
    ...params.favorites.map((item) => ({ kind: "favorite", item }))
  ]);
  return b2`${c4(
    items,
    (entry) => entry.key,
    (entry) => entry.kind === "custom" ? renderCustomFavoriteButton(params, entry.item) : renderDrawerButton(params, entry.item, "favorites")
  )}`;
}
function renderTab(_params, label, visible, active, disabled, onClick) {
  if (!visible) return A;
  const classes = [
    "macroFavoritesButton",
    ...active ? ["active-tab"] : [],
    ...disabled ? ["disabled"] : []
  ].join(" ");
  return b2`
    <sb-key-button
      class=${classes}
      .label=${label}
      .icon=${null}
      .trailingIcon=${drawerTabChevronIcon()}
      .accessibilityLabel=${label}
      .sizeVar=${"--sb-tab-font-size"}
      .disabled=${disabled}
      .onTrigger=${onClick}
    ></sb-key-button>
  `;
}
function drawerTabChevronIcon() {
  return remoteCardDirection() === "rtl" ? "mdi:chevron-left" : "mdi:chevron-right";
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
  const setRef = (r6) => r6 ? n5(r6) : A;
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
          ${params.renderMacrosContent ? renderDrawerItems(params, params.macros, "macros") : A}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--favorites${isFav ? " open" : ""}"
        ${setRef(params.favoritesOverlayRef)}
      >
        <div class="mf-grid">
          ${params.renderFavoritesContent ? renderFavoritesItems(params) : A}
        </div>
      </div>
    </div>
  `;
}
function renderInlineDrawerRow(params) {
  const gridClass = params.kind === "commands" ? "inline-drawer-row__grid mf-grid mf-grid--commands" : "inline-drawer-row__grid mf-grid";
  const filterStrip = params.filter ? params.power ? b2`
          <div class="inline-filter-row">
            ${renderCommandsFilter(params.filter)}
            ${renderPowerKey(params.power)}
          </div>
        ` : renderCommandsFilter(params.filter) : A;
  return b2`
    <div
      class="inline-drawer-row inline-drawer-row--${params.kind}"
      style=${params.visible ? "" : "display: none !important;"}
    >
      ${filterStrip}
      <div
        class="inline-drawer-row__scroller"
        style="--inline-row-visible-rows: ${params.visibleRows};"
      >
        <div class=${gridClass}>
          ${params.itemCount ? params.items : b2`
                <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                  ${params.emptyText}
                </div>
              `}
        </div>
      </div>
    </div>
  `;
}
function renderPowerKey(params) {
  return b2`
    <sb-key-button
      class="sb-power-key${params.busy ? " sb-power-key--busy" : ""}"
      .label=${null}
      .icon=${"mdi:power"}
      .accessibilityLabel=${params.label}
      .disabled=${params.disabled || params.busy}
      .onTrigger=${() => params.onToggle()}
    ></sb-key-button>
  `;
}
function renderPowerRow(power) {
  return b2`
    <div class="commands-row commands-row--power commands-row--power-only">
      <div class="commands-row__spacer"></div>
      ${renderPowerKey(power)}
    </div>
  `;
}
function renderCommandsFilter(filter) {
  return b2`
    <input
      class="sb-commands-filter"
      type="text"
      .value=${filter.value}
      placeholder=${filter.placeholder}
      aria-label=${filter.placeholder}
      @input=${(ev) => {
    const target = ev.target;
    filter.onInput(String(target?.value ?? ""));
  }}
      @keydown=${(ev) => ev.stopPropagation()}
    />
  `;
}
function renderCommandButton(params, command) {
  return b2`
    <ha-card
      class="drawer-btn drawer-btn--command"
      role="button"
      tabindex="0"
      ${primaryActionRef(() => {
    if (!Number.isFinite(command.command_id)) return;
    params.onCommand(command);
  })}
    >
      <div class="drawer-btn__inner drawer-btn__inner--row">
        <div class="name">${command.name}</div>
      </div>
    </ha-card>
  `;
}
function renderCommandsItems(params) {
  return b2`${c4(
    params.commands,
    (command) => `${command.command_id}:${command.name}`,
    (command) => renderCommandButton(params, command)
  )}`;
}
function renderCommandsDrawer(params) {
  const setRef = (r6) => r6 ? n5(r6) : A;
  return b2`
    <div
      class="commands-row${params.power ? " commands-row--power" : ""}"
      style=${params.visible ? "" : "display: none !important;"}
    >
    <div
      class="mf-container${params.drawerUp ? " drawer-up" : ""}"
      ${setRef(params.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${rowRadiusStyle(params.open, params.drawerUp)}
        ${setRef(params.rowRef)}
      >
        <div class="macroFavoritesGrid single">
          ${renderTab(
    null,
    params.tabLabel,
    true,
    params.open,
    params.disabled,
    params.onToggle
  )}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--commands${params.open ? " open" : ""}"
        ${setRef(params.overlayRef)}
      >
        ${params.renderContent ? b2`
              ${renderCommandsFilter(params.filter)}
              <div class="mf-grid mf-grid--commands">
                ${params.commands.length ? renderCommandsItems(params) : b2`
                      <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                        ${params.emptyText}
                      </div>
                    `}
              </div>
            ` : A}
      </div>
    </div>
    ${params.power ? renderPowerKey(params.power) : A}
    </div>
  `;
}

// remote-card/src/sections/assist.ts
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

// remote-card/src/remote-card-element.ts
function hexToRgbTriplet(value) {
  const hex = value.trim().slice(1);
  const full = hex.length === 3 ? hex.split("").map((c7) => c7 + c7).join("") : hex;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [0, 2, 4].map((i8) => parseInt(full.slice(i8, i8 + 2), 16)).join(",");
}
var SofabatonRemoteCard = class extends i4 {
  constructor() {
    super();
    this._haElementsReady = false;
    this._editMode = false;
    // Imperative-edge state (mirrors the legacy fields)
    this._drawerUp = false;
    this._drawerResetTimer = null;
    this._drawerContentResetTimer = null;
    this._closingDrawer = null;
    this._drawerMeasureSignature = null;
    this._drawerMeasurePending = false;
    this._appliedThemeVars = [];
    this._appliedThemeKey = null;
    this._lastGroupRadius = null;
    this._appliedSizingKey = null;
    this._lastLayeringKey = null;
    this._lastLayeringTargets = [null, null];
    this._layoutSignatureCache = null;
    this._layoutOverlayEl = null;
    this._lastLayoutSignature = null;
    this._keymapLoading = false;
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
    this._loadIndicatorRef = e5();
    this._mfContainerRef = e5();
    this._macrosOverlayRef = e5();
    this._favoritesOverlayRef = e5();
    this._commandsOverlayRef = e5();
    this._macroFavoritesRowRef = e5();
    this._store = new RemoteCardStore(
      () => this.requestUpdate(),
      {
        fireEvent: (type, detail) => this._fireEvent(type, detail),
        onHubQueueDrained: () => {
          this._assist.syncMqtt();
          this.requestUpdate();
        },
        onCommandPulseChange: () => this._syncLoadIndicator()
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
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
    this._closingDrawer = null;
    this._drawerMeasureSignature = null;
    this._drawerMeasurePending = false;
  }
  set hass(hass) {
    const language = hass?.locale?.language ?? hass?.language;
    this.setLanguage(language);
    this._store.setHass(hass);
  }
  /** Switch the card's language (HA: from hass.locale; the web remote: from the page). */
  setLanguage(language) {
    const languageChanged = setRemoteCardLanguage(language);
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();
    if (languageChanged) this.requestUpdate();
  }
  /**
   * Install any RemoteBackend (docs/internal/web-remote-plan.md): the web
   * remote's server adapter. HA dashboards never call this; they set hass.
   */
  setBackend(backend) {
    this._store.setBackend(backend);
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
    return { entity: "" };
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
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
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
        const clickedInOverlay = this._macrosOverlayRef.value && path.includes(this._macrosOverlayRef.value) || this._favoritesOverlayRef.value && path.includes(this._favoritesOverlayRef.value) || this._commandsOverlayRef.value && path.includes(this._commandsOverlayRef.value);
        const clickedInToggleRow = this._macroFavoritesRowRef.value && path.includes(this._macroFavoritesRowRef.value);
        if (!(clickedInOverlay || clickedInToggleRow)) {
          this._setActiveDrawer(null);
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
    this._setActiveDrawer(this._store.activeDrawer === type ? null : type);
  }
  _retainClosingDrawer(type) {
    this._closingDrawer = type;
    if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
    this._drawerContentResetTimer = setTimeout(() => {
      if (this._closingDrawer !== type) return;
      this._closingDrawer = null;
      this._drawerContentResetTimer = null;
      this.requestUpdate();
    }, DRAWER_DIRECTION_RESET_MS);
  }
  _setActiveDrawer(type) {
    const previous = this._store.activeDrawer;
    if (previous === type) return;
    if (previous) this._retainClosingDrawer(previous);
    if (type && this._closingDrawer === type) {
      this._closingDrawer = null;
      if (this._drawerContentResetTimer) clearTimeout(this._drawerContentResetTimer);
      this._drawerContentResetTimer = null;
    }
    this._store.activeDrawer = type;
    this._drawerMeasurePending = Boolean(type);
    if (!type) this._scheduleDrawerDirectionReset();
    this._syncLayering();
    this.requestUpdate();
  }
  _updateDrawerDirection() {
    if (!this._store.activeDrawer) return;
    const row = this._macroFavoritesRowRef.value;
    const isCommands = this._store.activeDrawer === "commands";
    const overlay = isCommands ? this._commandsOverlayRef.value : this._store.activeDrawer === "favorites" ? this._favoritesOverlayRef.value : this._macrosOverlayRef.value;
    if (!row || !overlay) return;
    const rowRect = row.getBoundingClientRect();
    const cardRect = this._cardRef.value && typeof this._cardRef.value.getBoundingClientRect === "function" ? this._cardRef.value.getBoundingClientRect() : null;
    const nextUp = drawerDirection({
      // The commands drawer ignores the 350px cap and takes what the
      // viewport gives it (device-mode-plan.md §4.2).
      desired: drawerDesiredHeight(
        overlay.scrollHeight || 0,
        isCommands ? window.innerHeight : void 0
      ),
      rowTop: rowRect.top,
      rowBottom: rowRect.bottom,
      cardTop: cardRect?.top ?? null,
      cardBottom: cardRect?.bottom ?? null,
      viewportHeight: window.innerHeight
    }) === "up";
    if (isCommands) {
      overlay.style.maxHeight = `${commandsOverlayMaxHeight({
        up: nextUp,
        rowTop: rowRect.top,
        rowBottom: rowRect.bottom,
        cardTop: cardRect?.top ?? null,
        cardBottom: cardRect?.bottom ?? null,
        viewportHeight: window.innerHeight
      })}px`;
    }
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
    let mfContainer = this._mfContainerRef.value;
    if (!activityRow || !mfContainer) return;
    mfContainer = mfContainer.closest(".commands-row") ?? mfContainer;
    const key = `${this._store.activityMenuOpen ? 1 : 0}:${this._store.activeDrawer || ""}`;
    const targets = [activityRow, mfContainer];
    if (this._lastLayeringKey === key && this._lastLayeringTargets[0] === targets[0] && this._lastLayeringTargets[1] === targets[1]) {
      return;
    }
    const z2 = layeringZIndexes(
      Boolean(this._store.activityMenuOpen),
      Boolean(this._store.activeDrawer)
    );
    activityRow.style.zIndex = z2.activity;
    mfContainer.style.zIndex = z2.drawer;
    this._lastLayeringKey = key;
    this._lastLayeringTargets = targets;
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
  /**
   * Single stable entry point for the activity/device dropdown. The select's
   * listeners are wired ONCE per node (listenersRef), so the closure they
   * capture must not bake in the render-time mode — this delegate reads the
   * mode at event time instead.
   */
  _handleSelect(ev) {
    const deviceMode = this._store.mode() === "device" && this._store.deviceModeAvailable();
    if (deviceMode) {
      this._handleDeviceSelect(ev);
    } else {
      this._handleActivitySelect(ev);
    }
  }
  _handleDeviceSelect(ev) {
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
    const deviceId = String(value) === "" ? null : Number(value);
    this._store.setDevice(Number.isFinite(deviceId) ? deviceId : null);
  }
  _handleModeToggle() {
    if (this._editMode) return;
    this._fireEvent("haptic", "light");
    this._setActiveDrawer(null);
    this._store.toggleMode();
  }
  _syncLoadIndicator() {
    this._loadIndicatorRef.value?.classList.toggle(
      "is-loading",
      this._store.isLoadingActive() || this._keymapLoading
    );
  }
  // ---------- theming (imperative, on the ha-card like the legacy) ----------
  _applyLocalTheme(themeName) {
    const root = this._cardRef.value;
    const hass = this._store.hass;
    if (!root) return false;
    const bgOverrideCss = rgbToCss(this._store.config?.background_override);
    const themeDef = themeName ? hass?.themes?.themes?.[themeName] : null;
    const themeMode = hass?.themes?.darkMode ? "dark" : "light";
    const appliedKey = `${themeName || ""}||${bgOverrideCss}||${themeMode}||${JSON.stringify(themeDef ?? null)}`;
    if (this._appliedThemeKey === appliedKey) return false;
    for (const cssVar of this._appliedThemeVars) {
      root.style.removeProperty(cssVar);
    }
    this._appliedThemeVars = [];
    this._appliedThemeKey = appliedKey;
    this._lastGroupRadius = null;
    let vars = null;
    if (themeName) {
      const def = themeDef;
      if (def && typeof def === "object") {
        vars = def;
        const defWithModes = def;
        if (defWithModes.modes && typeof defWithModes.modes === "object") {
          const mode = hass?.themes?.darkMode ? "dark" : "light";
          vars = { ...def, ...defWithModes.modes?.[mode] || {} };
          delete vars.modes;
        }
        for (const [k2, v3] of Object.entries(vars)) {
          if (v3 == null || typeof v3 !== "string" && typeof v3 !== "number") continue;
          const cssVar = k2.startsWith("--") ? k2 : `--${k2}`;
          root.style.setProperty(cssVar, String(v3));
          this._appliedThemeVars.push(cssVar);
        }
        for (const [k2, v3] of Object.entries(vars)) {
          if (typeof v3 !== "string" || !v3.startsWith("#")) continue;
          const key = k2.startsWith("--") ? k2.slice(2) : k2;
          if (vars[`rgb-${key}`] !== void 0 || vars[`--rgb-${key}`] !== void 0) continue;
          const triplet = hexToRgbTriplet(v3);
          if (!triplet) continue;
          const cssVar = `--rgb-${key}`;
          root.style.setProperty(cssVar, triplet);
          this._appliedThemeVars.push(cssVar);
        }
      }
    }
    const themeBg = vars?.["ha-card-background"] ?? vars?.["card-background-color"] ?? vars?.["ha-card-background-color"] ?? vars?.["primary-background-color"] ?? null;
    const finalBg = bgOverrideCss || themeBg;
    const override = this._store.config?.background_override;
    if (bgOverrideCss && Array.isArray(override) && override.length === 3) {
      const [r6, g2, b3] = override.map((v3) => Number(v3) / 255);
      const lin = (c7) => c7 <= 0.03928 ? c7 / 12.92 : ((c7 + 0.055) / 1.055) ** 2.4;
      const luminance = 0.2126 * lin(r6) + 0.7152 * lin(g2) + 0.0722 * lin(b3);
      root.style.setProperty("--sb-overlay-base", luminance < 0.4 ? "#ffffff" : "#000000");
      this._appliedThemeVars.push("--sb-overlay-base");
    }
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
    return true;
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
    const shrink = this._store.config?.shrink;
    const sizingKey = `${typeof mw}:${String(mw ?? "")}||${typeof shrink}:${String(shrink ?? "")}`;
    if (this._appliedSizingKey === sizingKey) return;
    this._appliedSizingKey = sizingKey;
    if (mw == null || mw === "" || mw === 0) {
      this.style.removeProperty("--remote-max-width");
    } else if (typeof mw === "number" && Number.isFinite(mw) && mw > 0) {
      this.style.setProperty("--remote-max-width", `${mw}px`);
    } else if (typeof mw === "string" && mw.trim()) {
      this.style.setProperty("--remote-max-width", mw.trim());
    }
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
    if (!this._haElementsReady || !this._store.config || !this._store.backend) {
      return A;
    }
    const store = this._store;
    const derived = store.deriveRuntimeState();
    const layoutConfig = derived.layoutConfig;
    this._lastLayoutSignature = derived.layoutSignature;
    const deviceMode = derived.mode === "device";
    this._keymapLoading = Boolean(derived.keymapLoading);
    this._assist.observeActivityState({
      currentLabel: deviceMode ? this._store.currentActivityLabel() : derived.currentLabel,
      activityId: derived.activityId != null ? Number(derived.activityId) : null,
      unavailable: derived.isUnavailable
    });
    if (!store.automationAssistEnabled() && this._assist.active) {
      this._assist.setActive(false);
    }
    this._assist.syncMqtt();
    const asRows = mfAsRows(layoutConfig);
    const macrosVisible = !deviceMode && macrosButtonEnabled(layoutConfig);
    const favoritesVisible = !deviceMode && favoritesButtonEnabled(layoutConfig);
    const macrosRowOn = asRows && macrosVisible;
    const favoritesRowOn = asRows && favoritesVisible;
    const showMacrosBtn = !asRows && macrosVisible;
    const showFavoritesBtn = !asRows && favoritesVisible;
    const commandsVisible = deviceMode && derived.showCommandsButton;
    const showCommandsDrawer = commandsVisible && !asRows;
    const commandsAsRow = commandsVisible && asRows;
    const disableAll = deviceMode ? derived.isUnavailable || !this._editMode && derived.deviceId == null : derived.isUnavailable || store.activityLoadingActive() || derived.loadPending || !this._editMode && derived.isPoweredOff;
    if (deviceMode && (store.activeDrawer === "macros" || store.activeDrawer === "favorites") || !deviceMode && store.activeDrawer === "commands") {
      this._retainClosingDrawer(store.activeDrawer);
      this._scheduleDrawerDirectionReset();
      store.activeDrawer = null;
    }
    let drawerDisplayState = null;
    if (!deviceMode) {
      drawerDisplayState = drawerVisibilityState({
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
        if (store.activeDrawer) this._retainClosingDrawer(store.activeDrawer);
        this._scheduleDrawerDirectionReset();
      }
      store.activeDrawer = drawerDisplayState.nextActiveDrawer;
    } else if (store.activeDrawer === "commands" && !showCommandsDrawer) {
      this._retainClosingDrawer("commands");
      this._scheduleDrawerDirectionReset();
      store.activeDrawer = null;
    }
    const activeDrawerCount = store.activeDrawer === "macros" ? derived.macros.length : store.activeDrawer === "favorites" ? derived.favorites.length + derived.customFavorites.length : store.activeDrawer === "commands" ? derived.commands.length : 0;
    const drawerMeasureSignature = `${store.activeDrawer || ""}:${activeDrawerCount}:${derived.commandFilter}:${derived.layoutSignature}`;
    if (this._drawerMeasureSignature !== drawerMeasureSignature) {
      this._drawerMeasureSignature = drawerMeasureSignature;
      this._drawerMeasurePending = Boolean(store.activeDrawer);
    }
    const keyParams = {
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
      onKeyPress: (spec, ev) => this._onKeyPress(spec, ev),
      holdRepeatForKey: (key) => longPressEnabledForKey(store.config, key),
      longPressForKey: (spec) => this._longPressForSpec(spec),
      showVolume: derived.showVolume,
      showChannel: derived.showChannel,
      showMedia: derived.showMedia,
      showDvr: derived.showDvr
    };
    const commandsFilter = {
      value: derived.commandFilter,
      placeholder: str().card.filterCommands,
      onInput: (value) => store.setCommandFilter(value)
    };
    const mfParams = {
      visible: Boolean(drawerDisplayState?.showMF),
      showMacrosButton: showMacrosBtn,
      showFavoritesButton: showFavoritesBtn,
      single: drawerDisplayState?.visibleCount === 1,
      macrosDisabled: Boolean(drawerDisplayState?.macrosDisabled),
      favoritesDisabled: Boolean(drawerDisplayState?.favoritesDisabled),
      activeDrawer: store.activeDrawer === "commands" ? null : store.activeDrawer,
      drawerUp: this._drawerUp,
      macros: derived.macros,
      favorites: derived.favorites,
      customFavorites: derived.customFavorites,
      currentActivityId: store.currentActivityId(),
      renderMacrosContent: store.activeDrawer === "macros" || this._closingDrawer === "macros",
      renderFavoritesContent: store.activeDrawer === "favorites" || this._closingDrawer === "favorites",
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
    const powerVisible = deviceMode && powerButtonEnabled(layoutConfig) && (this._editMode || store.devicePowerConfigured());
    const powerParams = {
      busy: store.powerBusy,
      disabled: disableAll,
      label: str().card.powerButton,
      onToggle: () => {
        void store.toggleDevicePower();
      }
    };
    const shortcutConfigs = deviceMode ? deviceShortcutsFromConfig(store.config, derived.deviceId) : {};
    const shortcutSlots = SHORTCUT_SLOTS.map((slot) => {
      const config = shortcutConfigs[slot];
      if (!config) {
        return { slot, icon: null, label: "", commandId: null, missing: false };
      }
      const keymapCommands = derived.keymapEntry?.status === "ready" ? derived.keymapEntry.commands : null;
      const match = keymapCommands?.find(
        (command) => command.command_id === config.command_id
      );
      return {
        slot,
        icon: config.icon,
        label: match?.name ?? str().assist.commandFallback(config.command_id),
        commandId: config.command_id,
        missing: keymapCommands != null && !match
      };
    });
    const shortcutsConfigured = shortcutSlots.some((slot) => slot.icon != null);
    const shortcutsVisible = deviceMode && shortcutsRowEnabled(layoutConfig) && (shortcutsConfigured || this._editMode);
    const commandsParams = {
      visible: showCommandsDrawer,
      open: store.activeDrawer === "commands",
      disabled: disableAll,
      drawerUp: this._drawerUp,
      commands: derived.commands,
      renderContent: store.activeDrawer === "commands" || this._closingDrawer === "commands",
      emptyText: str().card.noCommands,
      tabLabel: str().card.commandsTab,
      filter: commandsFilter,
      onToggle: () => this._toggleDrawer("commands"),
      onCommand: (command) => this._onCommandItem(command),
      containerRef: this._mfContainerRef,
      rowRef: this._macroFavoritesRowRef,
      overlayRef: this._commandsOverlayRef
    };
    const sharedRows = mfRowVisibleRows(layoutConfig);
    const midEnabled = derived.showVolume || derived.showChannel;
    const mediaEnabled = derived.isX2 ? derived.showMedia || derived.showDvr : derived.showMedia;
    const order = normalizedGroupOrder(layoutConfig.group_order);
    const keyStyle = keyStyleFromConfig(store.config);
    const tintedPanels = tintedPanelsFromConfig(store.config);
    const wrapClass = [
      "wrap",
      ...keyStyle === "flat" ? [] : [`wrap--keys-${keyStyle}`],
      ...tintedPanels ? ["wrap--panels"] : []
    ].join(" ");
    const groupTemplates = {
      activity: () => Boolean(layoutConfig.show_activity) ? renderActivityRow({
        hass: store.hass,
        visible: true,
        unavailable: derived.isUnavailable,
        options: deviceMode ? derived.deviceSelectState?.options ?? [] : derived.selectState?.options ?? [],
        selectLabel: deviceMode ? str().card.deviceSelectLabel : str().card.activitySelectLabel,
        resolvedValue: deviceMode ? derived.deviceSelectState?.resolvedValue ?? "" : derived.selectState?.resolvedValue ?? "",
        disabled: deviceMode ? Boolean(derived.deviceSelectState?.disabled) : Boolean(derived.selectState?.disabled),
        loading: store.isLoadingActive() || Boolean(derived.keymapLoading),
        modeToggle: derived.deviceModeAvailable ? {
          // Same icon pair as the control panel's Hub-tab subtabs.
          icon: deviceMode ? "mdi:audio-video" : "mdi:play-circle-outline",
          ariaLabel: deviceMode ? str().card.switchToActivityMode : str().card.switchToDeviceMode,
          // Inert in edit mode (the editor's layout selection drives
          // the previewed mode); rendered so the editor's Device mode
          // switch is visualized in the preview.
          onToggle: () => this._handleModeToggle()
        } : null,
        menuOpen: Boolean(store.activityMenuOpen),
        onSelect: (ev) => this._handleSelect(ev),
        onMenuOpened: () => {
          store.activityMenuOpen = true;
          this._syncLayering();
          this.requestUpdate();
        },
        onMenuClosed: () => {
          store.activityMenuOpen = false;
          this._syncLayering();
          this.requestUpdate();
        },
        rowRef: this._activityRowRef,
        loadIndicatorRef: this._loadIndicatorRef
      }) : A,
      macro_favorites: () => deviceMode ? showCommandsDrawer ? renderCommandsDrawer({
        ...commandsParams,
        power: powerVisible ? powerParams : null
      }) : powerVisible && !commandsAsRow ? renderPowerRow(powerParams) : A : drawerDisplayState?.showMF ? renderMacroFavorites(mfParams) : A,
      macros_row: () => deviceMode ? commandsAsRow ? renderInlineDrawerRow({
        kind: "commands",
        visible: true,
        visibleRows: sharedRows,
        items: renderCommandsItems({
          commands: derived.commands,
          onCommand: (command) => this._onCommandItem(command)
        }),
        itemCount: derived.commands.length,
        emptyText: str().card.noCommands,
        filter: commandsFilter,
        power: powerVisible ? powerParams : null
      }) : A : macrosRowOn ? renderInlineDrawerRow({
        kind: "macros",
        visible: true,
        visibleRows: sharedRows,
        items: renderDrawerItems(mfParams, derived.macros, "macros"),
        itemCount: derived.macros.length,
        emptyText: str().card.noMacros
      }) : A,
      favorites_row: () => !deviceMode && favoritesRowOn ? renderInlineDrawerRow({
        kind: "favorites",
        visible: true,
        visibleRows: sharedRows,
        items: renderFavoritesItems(mfParams),
        itemCount: derived.customFavorites.length + derived.favorites.length,
        emptyText: str().card.noFavorites
      }) : A,
      dpad: () => renderDpad(keyParams, Boolean(layoutConfig.show_dpad)),
      nav: () => renderNavRow(keyParams, Boolean(layoutConfig.show_nav)),
      mid: () => renderMid(keyParams, midEnabled),
      media: () => renderMedia(keyParams, mediaEnabled),
      colors: () => renderColors(keyParams, Boolean(layoutConfig.show_colors)),
      abc: () => renderAbc(keyParams, Boolean(layoutConfig.show_abc) && derived.isX2),
      shortcuts: () => renderShortcutsRow(
        {
          editMode: this._editMode,
          disableAll,
          slots: shortcutSlots,
          onPress: (slot) => this._onShortcutPress(slot)
        },
        shortcutsVisible
      )
    };
    const noticeText = derived.isUnavailable ? str().card.remoteUnavailable : derived.noActivitiesMessage;
    const noticeTone = deviceMode && !derived.isUnavailable && derived.keymapEntry?.status === "error" ? "error" : "warning";
    const assistEnabled = store.automationAssistEnabled();
    return b2`
      <ha-card ${n5(this._cardRef)}>
        ${assistEnabled ? renderAssistModal({ visible: true, controller: this._assist }) : A}
        <div class=${wrapClass} ${n5(this._wrapRef)}>
          ${assistEnabled ? renderAssistRow({ visible: true, controller: this._assist }) : A}
          <div class="layout-container" ${n5(this._layoutContainerRef)}>
            ${noticeText ? b2`<div
                  class="sb-notice sb-notice--${noticeTone}"
                  role="status"
                  aria-live="polite"
                >
                  <ha-icon
                    icon=${noticeTone === "error" ? "mdi:alert-circle-outline" : "mdi:alert-outline"}
                  ></ha-icon>
                  <span class="sb-notice__text">${noticeText}</span>
                </div>` : A}
            ${c4(
      order.filter((key) => key in groupTemplates),
      (key) => key,
      (key) => groupTemplates[key]()
    )}
          </div>
        </div>
      </ha-card>
    `;
  }
  /**
   * Transparent hub long-press: arm the hold gesture on a hard button only
   * when its keymap row carries a binding on the current scope (activity
   * or device page) AND hold-to-repeat is not claiming the button (the
   * explicit hold_repeat opt-in wins that collision; a hold can only mean
   * one thing). Never armed in edit mode: sends are blocked there anyway.
   */
  _longPressForSpec(spec) {
    if (this._editMode) return false;
    const store = this._store;
    if (longPressEnabledForKey(store.config, spec.key)) return false;
    const scope = store.mode() === "device" ? store.currentDeviceId() : store.commandTarget(spec.id)?.activity_id ?? store.currentActivityId();
    return store.longPressAvailableForButton(spec.id, scope);
  }
  _onKeyPress(spec, ev) {
    const deviceMode = this._store.mode() === "device";
    const targetDeviceId = deviceMode ? this._store.currentDeviceId() : this._store.commandTarget(spec.id)?.activity_id ?? this._store.currentActivityId();
    if (isLongPressEvent(ev)) {
      if (this._assist.active) {
        this._assist.setStatus(str().assist.notCaptured);
      }
      this._store.triggerCommandPulse();
      void this._store.sendLongPress(spec.cmd, targetDeviceId);
      return;
    }
    if (holdRepeatIndexOf(ev) <= 1) {
      this._assist.recordClick({
        label: automationAssistLabelForKey(spec.key, spec.color ? spec.key : spec.label),
        commandId: spec.cmd,
        deviceId: targetDeviceId ?? null,
        commandType: "assigned",
        icon: spec.color ? null : spec.icon || null,
        deviceMode,
        deviceName: deviceMode ? this._store.deviceNameForId(targetDeviceId) : null
      });
    }
    this._store.triggerCommandPulse();
    void this._store.sendCommand(spec.cmd, targetDeviceId);
  }
  _onShortcutPress(slot) {
    if (slot.commandId == null) return;
    const deviceId = this._store.currentDeviceId();
    if (deviceId == null) return;
    this._assist.recordClick({
      label: slot.label,
      commandId: slot.commandId,
      deviceId,
      commandType: "favorite",
      icon: slot.icon,
      deviceMode: true,
      deviceName: this._store.deviceNameForId(deviceId)
    });
    this._store.triggerCommandPulse();
    void this._store.sendCommand(slot.commandId, deviceId);
  }
  _onCommandItem(command) {
    const deviceId = this._store.currentDeviceId();
    if (deviceId == null) return;
    this._assist.recordClick({
      label: command.name,
      commandId: command.command_id,
      deviceId,
      commandType: "favorite",
      icon: null,
      deviceMode: true,
      deviceName: this._store.deviceNameForId(deviceId)
    });
    this._store.triggerCommandPulse();
    void this._store.sendCommand(command.command_id, deviceId);
  }
  updated(_changed) {
    const themeChanged = this._applyLocalTheme(String(this._store.config?.theme ?? ""));
    if (themeChanged || this._lastGroupRadius == null) this._updateGroupRadius();
    this._applyHostSizing();
    if (this._lastLayoutSignature != null) {
      this._maybeAnimateLayoutChange(this._lastLayoutSignature);
    }
    if (this._drawerMeasurePending) {
      this._drawerMeasurePending = false;
      this._updateDrawerDirection();
    }
    this._syncLayering();
    this._syncLoadIndicator();
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

// remote-card/src/shims/ha-card.ts
var SbHaCard = class extends HTMLElement {
  constructor() {
    super();
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          display: block;
          position: relative;
          box-sizing: border-box;
          background: var(--ha-card-background, var(--card-background-color, #fff));
          -webkit-backdrop-filter: var(--ha-card-backdrop-filter, none);
          backdrop-filter: var(--ha-card-backdrop-filter, none);
          border-radius: var(--ha-card-border-radius, 12px);
          border-width: var(--ha-card-border-width, 1px);
          border-style: solid;
          border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
          box-shadow: var(--ha-card-box-shadow, none);
          color: var(--primary-text-color);
          transition: all 0.3s ease-out;
        }
        :host([raised]) {
          border: none;
          box-shadow: var(--ha-card-box-shadow, 0px 2px 1px -1px rgba(0, 0, 0, 0.2), 0px 1px 1px 0px rgba(0, 0, 0, 0.14), 0px 1px 3px 0px rgba(0, 0, 0, 0.12));
        }
      </style>
      <slot></slot>
    `;
  }
};
function defineHaCardShim() {
  if (!customElements.get("ha-card")) customElements.define("ha-card", SbHaCard);
}

// node_modules/@mdi/js/mdi.js
var mdiAccount = "M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z";
var mdiAccountGroup = "M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z";
var mdiAirConditioner = "M6.59,0.66C8.93,-1.15 11.47,1.06 12.04,4.5C12.47,4.5 12.89,4.62 13.27,4.84C13.79,4.24 14.25,3.42 14.07,2.5C13.65,0.35 16.06,-1.39 18.35,1.58C20.16,3.92 17.95,6.46 14.5,7.03C14.5,7.46 14.39,7.89 14.16,8.27C14.76,8.78 15.58,9.24 16.5,9.06C18.63,8.64 20.38,11.04 17.41,13.34C15.07,15.15 12.53,12.94 11.96,9.5C11.53,9.5 11.11,9.37 10.74,9.15C10.22,9.75 9.75,10.58 9.93,11.5C10.35,13.64 7.94,15.39 5.65,12.42C3.83,10.07 6.05,7.53 9.5,6.97C9.5,6.54 9.63,6.12 9.85,5.74C9.25,5.23 8.43,4.76 7.5,4.94C5.37,5.36 3.62,2.96 6.59,0.66M5,16H7A2,2 0 0,1 9,18V24H7V22H5V24H3V18A2,2 0 0,1 5,16M5,18V20H7V18H5M12.93,16H15L12.07,24H10L12.93,16M18,16H21V18H18V22H21V24H18A2,2 0 0,1 16,22V18A2,2 0 0,1 18,16Z";
var mdiAlarmLight = "M6,6.9L3.87,4.78L5.28,3.37L7.4,5.5L6,6.9M13,1V4H11V1H13M20.13,4.78L18,6.9L16.6,5.5L18.72,3.37L20.13,4.78M4.5,10.5V12.5H1.5V10.5H4.5M19.5,10.5H22.5V12.5H19.5V10.5M6,20H18A2,2 0 0,1 20,22H4A2,2 0 0,1 6,20M12,5A6,6 0 0,1 18,11V19H6V11A6,6 0 0,1 12,5Z";
var mdiAlbum = "M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12,16.5C9.5,16.5 7.5,14.5 7.5,12C7.5,9.5 9.5,7.5 12,7.5C14.5,7.5 16.5,9.5 16.5,12C16.5,14.5 14.5,16.5 12,16.5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiAlert = "M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z";
var mdiAlertCircle = "M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiAlertCircleOutline = "M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z";
var mdiAlertOutline = "M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16";
var mdiAlphaACircleOutline = "M11,7H13A2,2 0 0,1 15,9V17H13V13H11V17H9V9A2,2 0 0,1 11,7M11,9V11H13V9H11M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z";
var mdiAlphaBCircleOutline = "M15,10.5C15,11.3 14.3,12 13.5,12C14.3,12 15,12.7 15,13.5V15A2,2 0 0,1 13,17H9V7H13A2,2 0 0,1 15,9V10.5M13,15V13H11V15H13M13,11V9H11V11H13M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";
var mdiAlphaCCircleOutline = "M11,7H13A2,2 0 0,1 15,9V10H13V9H11V15H13V14H15V15A2,2 0 0,1 13,17H11A2,2 0 0,1 9,15V9A2,2 0 0,1 11,7M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";
var mdiAmplifier = "M10,2H14A1,1 0 0,1 15,3H21V21H19A1,1 0 0,1 18,22A1,1 0 0,1 17,21H7A1,1 0 0,1 6,22A1,1 0 0,1 5,21H3V3H9A1,1 0 0,1 10,2M5,5V9H19V5H5M7,6A1,1 0 0,1 8,7A1,1 0 0,1 7,8A1,1 0 0,1 6,7A1,1 0 0,1 7,6M12,6H14V7H12V6M15,6H16V8H15V6M17,6H18V8H17V6M12,11A4,4 0 0,0 8,15A4,4 0 0,0 12,19A4,4 0 0,0 16,15A4,4 0 0,0 12,11M10,6A1,1 0 0,1 11,7A1,1 0 0,1 10,8A1,1 0 0,1 9,7A1,1 0 0,1 10,6Z";
var mdiApple = "M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z";
var mdiArrowDown = "M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z";
var mdiArrowDownBold = "M9,4H15V12H19.84L12,19.84L4.16,12H9V4Z";
var mdiArrowLeft = "M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z";
var mdiArrowLeftBold = "M20,9V15H12V19.84L4.16,12L12,4.16V9H20Z";
var mdiArrowLeftTop = "M20 13.5V20H18V13.5C18 11 16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z";
var mdiArrowRight = "M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z";
var mdiArrowRightBold = "M4,15V9H12V4.16L19.84,12L12,19.84V15H4Z";
var mdiArrowULeftTop = "M20 13.5C20 17.09 17.09 20 13.5 20H6V18H13.5C16 18 18 16 18 13.5S16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z";
var mdiArrowUp = "M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z";
var mdiArrowUpBold = "M15,20H9V12H4.16L12,4.16L19.84,12H15V20Z";
var mdiAudioVideo = "M20,7H4A2,2 0 0,0 2,9V15A2,2 0 0,0 4,17H5V18C5,18.6 5.4,19 6,19H8C8.6,19 9,18.6 9,18V17H15V18C15,18.6 15.4,19 16,19H18C18.6,19 19,18.6 19,18V17H20A2,2 0 0,0 22,15V9A2,2 0 0,0 20,7M14,12H4V10H14V12M18,13A2,2 0 0,1 16,11A2,2 0 0,1 18,9A2,2 0 0,1 20,11A2,2 0 0,1 18,13M6,15H4V14H6V15M10,15H8V14H10V15M14,15H12V14H14V15Z";
var mdiAudioVideoOff = "M22.1 21.5L2.4 1.7L1.1 3L5.1 7H4C2.9 7 2 7.9 2 9V15C2 16.1 2.9 17 4 17H5V18C5 18.6 5.4 19 6 19H8C8.6 19 9 18.6 9 18V17H15V18C15 18.6 15.4 19 16 19H17.1L20.8 22.7L22.1 21.5M6 15H4V14H6V15M4 12V10H8.1L10.1 12H4M10 15H8V14H10V15M12 15V14H12.1L13.1 15H12M14 10V10.8L20.2 17C21.2 16.9 22 16.1 22 15V9C22 7.9 21.1 7 20 7H10.2L13.2 10H14M18 9C19.1 9 20 9.9 20 11S19.1 13 18 13 16 12.1 16 11 16.9 9 18 9Z";
var mdiBackspace = "M22,3H7C6.31,3 5.77,3.35 5.41,3.88L0,12L5.41,20.11C5.77,20.64 6.31,21 7,21H22A2,2 0 0,0 24,19V5A2,2 0 0,0 22,3M19,15.59L17.59,17L14,13.41L10.41,17L9,15.59L12.59,12L9,8.41L10.41,7L14,10.59L17.59,7L19,8.41L15.41,12";
var mdiBed = "M19,7H11V14H3V5H1V20H3V17H21V20H23V11A4,4 0 0,0 19,7M7,13A3,3 0 0,0 10,10A3,3 0 0,0 7,7A3,3 0 0,0 4,10A3,3 0 0,0 7,13Z";
var mdiBedOutline = "M7 14C8.66 14 10 12.66 10 11C10 9.34 8.66 8 7 8C5.34 8 4 9.34 4 11C4 12.66 5.34 14 7 14M7 10C7.55 10 8 10.45 8 11C8 11.55 7.55 12 7 12C6.45 12 6 11.55 6 11C6 10.45 6.45 10 7 10M19 7H11V15H3V5H1V20H3V17H21V20H23V11C23 8.79 21.21 7 19 7M21 15H13V9H19C20.1 9 21 9.9 21 11Z";
var mdiBell = "M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21";
var mdiBellOff = "M20.84,22.73L18.11,20H3V19L5,17V11C5,9.86 5.29,8.73 5.83,7.72L1.11,3L2.39,1.73L22.11,21.46L20.84,22.73M19,15.8V11C19,7.9 16.97,5.17 14,4.29C14,4.19 14,4.1 14,4A2,2 0 0,0 12,2A2,2 0 0,0 10,4C10,4.1 10,4.19 10,4.29C9.39,4.47 8.8,4.74 8.26,5.09L19,15.8M12,23A2,2 0 0,0 14,21H10A2,2 0 0,0 12,23Z";
var mdiBellRing = "M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21M19.75,3.19L18.33,4.61C20.04,6.3 21,8.6 21,11H23C23,8.07 21.84,5.25 19.75,3.19M1,11H3C3,8.6 3.96,6.3 5.67,4.61L4.25,3.19C2.16,5.25 1,8.07 1,11Z";
var mdiBlinds = "M3,2H21A1,1 0 0,1 22,3V5A1,1 0 0,1 21,6H20V13A1,1 0 0,1 19,14H13V16.17C14.17,16.58 15,17.69 15,19A3,3 0 0,1 12,22A3,3 0 0,1 9,19C9,17.69 9.83,16.58 11,16.17V14H5A1,1 0 0,1 4,13V6H3A1,1 0 0,1 2,5V3A1,1 0 0,1 3,2M12,18A1,1 0 0,0 11,19A1,1 0 0,0 12,20A1,1 0 0,0 13,19A1,1 0 0,0 12,18Z";
var mdiBlindsOpen = "M3 2H21C21.55 2 22 2.45 22 3V5C22 5.55 21.55 6 21 6H20V7C20 7.55 19.55 8 19 8H13V10.17C14.17 10.58 15 11.7 15 13C15 14.66 13.66 16 12 16C10.34 16 9 14.66 9 13C9 11.69 9.84 10.58 11 10.17V8H5C4.45 8 4 7.55 4 7V6H3C2.45 6 2 5.55 2 5V3C2 2.45 2.45 2 3 2M12 12C11.45 12 11 12.45 11 13C11 13.55 11.45 14 12 14C12.55 14 13 13.55 13 13C13 12.45 12.55 12 12 12Z";
var mdiBluetooth = "M14.88,16.29L13,18.17V14.41M13,5.83L14.88,7.71L13,9.58M17.71,7.71L12,2H11V9.58L6.41,5L5,6.41L10.59,12L5,17.58L6.41,19L11,14.41V22H12L17.71,16.29L13.41,12L17.71,7.71Z";
var mdiBluetoothOff = "M13,5.83L14.88,7.71L13.28,9.31L14.69,10.72L17.71,7.7L12,2H11V7.03L13,9.03M5.41,4L4,5.41L10.59,12L5,17.59L6.41,19L11,14.41V22H12L16.29,17.71L18.59,20L20,18.59M13,18.17V14.41L14.88,16.29";
var mdiBookmark = "M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z";
var mdiBookmarkOutline = "M17,18L12,15.82L7,18V5H17M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z";
var mdiBrightness1 = "M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z";
var mdiBrightness2 = "M10,2C8.18,2 6.47,2.5 5,3.35C8,5.08 10,8.3 10,12C10,15.7 8,18.92 5,20.65C6.47,21.5 8.18,22 10,22A10,10 0 0,0 20,12A10,10 0 0,0 10,2Z";
var mdiBrightness3 = "M9,2C7.95,2 6.95,2.16 6,2.46C10.06,3.73 13,7.5 13,12C13,16.5 10.06,20.27 6,21.54C6.95,21.84 7.95,22 9,22A10,10 0 0,0 19,12A10,10 0 0,0 9,2Z";
var mdiBrightness4 = "M12,18C11.11,18 10.26,17.8 9.5,17.45C11.56,16.5 13,14.42 13,12C13,9.58 11.56,7.5 9.5,6.55C10.26,6.2 11.11,6 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z";
var mdiBrightness5 = "M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,15.31L23.31,12L20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31Z";
var mdiBrightness6 = "M12,18V6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,15.31L23.31,12L20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31Z";
var mdiBrightness7 = "M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z";
var mdiBroom = "M19.36,2.72L20.78,4.14L15.06,9.85C16.13,11.39 16.28,13.24 15.38,14.44L9.06,8.12C10.26,7.22 12.11,7.37 13.65,8.44L19.36,2.72M5.93,17.57C3.92,15.56 2.69,13.16 2.35,10.92L7.23,8.83L14.67,16.27L12.58,21.15C10.34,20.81 7.94,19.58 5.93,17.57Z";
var mdiCamera = "M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z";
var mdiCameraOff = "M1.2,4.47L2.5,3.2L20,20.72L18.73,22L16.73,20H4A2,2 0 0,1 2,18V6C2,5.78 2.04,5.57 2.1,5.37L1.2,4.47M7,4L9,2H15L17,4H20A2,2 0 0,1 22,6V18C22,18.6 21.74,19.13 21.32,19.5L16.33,14.5C16.76,13.77 17,12.91 17,12A5,5 0 0,0 12,7C11.09,7 10.23,7.24 9.5,7.67L5.82,4H7M7,12A5,5 0 0,0 12,17C12.5,17 13.03,16.92 13.5,16.77L11.72,15C10.29,14.85 9.15,13.71 9,12.28L7.23,10.5C7.08,10.97 7,11.5 7,12M12,9A3,3 0 0,1 15,12C15,12.35 14.94,12.69 14.83,13L11,9.17C11.31,9.06 11.65,9 12,9Z";
var mdiCancel = "M12 2C17.5 2 22 6.5 22 12S17.5 22 12 22 2 17.5 2 12 6.5 2 12 2M12 4C10.1 4 8.4 4.6 7.1 5.7L18.3 16.9C19.3 15.5 20 13.8 20 12C20 7.6 16.4 4 12 4M16.9 18.3L5.7 7.1C4.6 8.4 4 10.1 4 12C4 16.4 7.6 20 12 20C13.9 20 15.6 19.4 16.9 18.3Z";
var mdiCar = "M5,11L6.5,6.5H17.5L19,11M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6Z";
var mdiCarKey = "M9 0C7.3 0 6 1.3 6 3S7.3 6 9 6C10.3 6 11.4 5.2 11.8 4H14V6H16V4H18V2H11.8C11.4 .8 10.3 0 9 0M9 2C9.6 2 10 2.4 10 3S9.6 4 9 4 8 3.6 8 3 8.4 2 9 2M6.5 8C5.8 8 5.3 8.4 5.1 9L3 15V23C3 23.6 3.4 24 4 24H5C5.6 24 6 23.6 6 23V22H18V23C18 23.6 18.4 24 19 24H20C20.6 24 21 23.6 21 23V15L18.9 9C18.7 8.4 18.1 8 17.5 8H6.5M6.5 9.5H17.5L19 14H5L6.5 9.5M6.5 16C7.3 16 8 16.7 8 17.5S7.3 19 6.5 19 5 18.3 5 17.5 5.7 16 6.5 16M17.5 16C18.3 16 19 16.7 19 17.5S18.3 19 17.5 19 16 18.3 16 17.5 16.7 16 17.5 16Z";
var mdiCast = "M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.07,10 1,10M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18M21,3H3C1.89,3 1,3.89 1,5V8H3V5H21V19H14V21H21A2,2 0 0,0 23,19V5C23,3.89 22.1,3 21,3Z";
var mdiCastConnected = "M21,3H3C1.89,3 1,3.89 1,5V8H3V5H21V19H14V21H21A2,2 0 0,0 23,19V5C23,3.89 22.1,3 21,3M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.07,10 1,10M19,7H5V8.63C8.96,9.91 12.09,13.04 13.37,17H19M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18Z";
var mdiCastOff = "M1.6,1.27L0.25,2.75L1.41,3.8C1.16,4.13 1,4.55 1,5V8H3V5.23L18.2,19H14V21H20.41L22.31,22.72L23.65,21.24M6.5,3L8.7,5H21V16.14L23,17.95V5C23,3.89 22.1,3 21,3M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.08,10 1,10M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18Z";
var mdiCctv = "M6.03 12.03L8.03 15.5L5.5 18.68L2 12.62L6.03 12.03M17 18V15.29C17.88 14.9 18.5 14.03 18.5 13C18.5 12.43 18.3 11.9 17.97 11.5L19.94 10.35C20.95 9.76 21.3 8.47 20.71 7.46L19.33 5.06C18.74 4.05 17.45 3.7 16.44 4.28L8.31 9C7.36 9.53 7.03 10.75 7.58 11.71L9.08 14.31C9.63 15.26 10.86 15.59 11.81 15.04L13.69 13.96C13.94 14.55 14.41 15.03 15 15.29V18C15 19.1 15.9 20 17 20H22V18H17Z";
var mdiCeilingLight = "M8,9H11V4H13V9H16L20,17H4L8,9M14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18H14Z";
var mdiCellphone = "M17,19H7V5H17M17,1H7C5.89,1 5,1.89 5,3V21A2,2 0 0,0 7,23H17A2,2 0 0,0 19,21V3C19,1.89 18.1,1 17,1Z";
var mdiCellphoneWireless = "M20.07,4.93C21.88,6.74 23,9.24 23,12C23,14.76 21.88,17.26 20.07,19.07L18.66,17.66C20.11,16.22 21,14.22 21,12C21,9.79 20.11,7.78 18.66,6.34L20.07,4.93M17.24,7.76C18.33,8.85 19,10.35 19,12C19,13.65 18.33,15.15 17.24,16.24L15.83,14.83C16.55,14.11 17,13.11 17,12C17,10.89 16.55,9.89 15.83,9.17L17.24,7.76M13,10A2,2 0 0,1 15,12A2,2 0 0,1 13,14A2,2 0 0,1 11,12A2,2 0 0,1 13,10M11.5,1A2.5,2.5 0 0,1 14,3.5V8H12V4H3V19H12V16H14V20.5A2.5,2.5 0 0,1 11.5,23H3.5A2.5,2.5 0 0,1 1,20.5V3.5A2.5,2.5 0 0,1 3.5,1H11.5Z";
var mdiCheck = "M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";
var mdiCheckBold = "M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z";
var mdiCheckCircle = "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z";
var mdiCheckCircleOutline = "M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z";
var mdiChevronDoubleDown = "M16.59,5.59L18,7L12,13L6,7L7.41,5.59L12,10.17L16.59,5.59M16.59,11.59L18,13L12,19L6,13L7.41,11.59L12,16.17L16.59,11.59Z";
var mdiChevronDoubleLeft = "M18.41,7.41L17,6L11,12L17,18L18.41,16.59L13.83,12L18.41,7.41M12.41,7.41L11,6L5,12L11,18L12.41,16.59L7.83,12L12.41,7.41Z";
var mdiChevronDoubleRight = "M5.59,7.41L7,6L13,12L7,18L5.59,16.59L10.17,12L5.59,7.41M11.59,7.41L13,6L19,12L13,18L11.59,16.59L16.17,12L11.59,7.41Z";
var mdiChevronDoubleUp = "M7.41,18.41L6,17L12,11L18,17L16.59,18.41L12,13.83L7.41,18.41M7.41,12.41L6,11L12,5L18,11L16.59,12.41L12,7.83L7.41,12.41Z";
var mdiChevronDown = "M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";
var mdiChevronDownCircleOutline = "M22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12M20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12M6,10L12,16L18,10L16.6,8.6L12,13.2L7.4,8.6L6,10Z";
var mdiChevronLeft = "M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z";
var mdiChevronRight = "M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z";
var mdiChevronUp = "M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z";
var mdiChevronUpCircleOutline = "M22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12M20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12M7.4,15.4L12,10.8L16.6,15.4L18,14L12,8L6,14L7.4,15.4Z";
var mdiCircle = "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiCircleOutline = "M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiClock = "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z";
var mdiClockOutline = "M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z";
var mdiClose = "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";
var mdiCloseCircle = "M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z";
var mdiCloseCircleOutline = "M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2C6.47,2 2,6.47 2,12C2,17.53 6.47,22 12,22C17.53,22 22,17.53 22,12C22,6.47 17.53,2 12,2M14.59,8L12,10.59L9.41,8L8,9.41L10.59,12L8,14.59L9.41,16L12,13.41L14.59,16L16,14.59L13.41,12L16,9.41L14.59,8Z";
var mdiClosedCaption = "M18,11H16.5V10.5H14.5V13.5H16.5V13H18V14A1,1 0 0,1 17,15H14A1,1 0 0,1 13,14V10A1,1 0 0,1 14,9H17A1,1 0 0,1 18,10M11,11H9.5V10.5H7.5V13.5H9.5V13H11V14A1,1 0 0,1 10,15H7A1,1 0 0,1 6,14V10A1,1 0 0,1 7,9H10A1,1 0 0,1 11,10M19,4H5C3.89,4 3,4.89 3,6V18A2,2 0 0,0 5,20H19A2,2 0 0,0 21,18V6C21,4.89 20.1,4 19,4Z";
var mdiClosedCaptionOutline = "M5,4C4.45,4 4,4.18 3.59,4.57C3.2,4.96 3,5.44 3,6V18C3,18.56 3.2,19.04 3.59,19.43C4,19.82 4.45,20 5,20H19C19.5,20 20,19.81 20.39,19.41C20.8,19 21,18.53 21,18V6C21,5.47 20.8,5 20.39,4.59C20,4.19 19.5,4 19,4H5M4.5,5.5H19.5V18.5H4.5V5.5M7,9C6.7,9 6.47,9.09 6.28,9.28C6.09,9.47 6,9.7 6,10V14C6,14.3 6.09,14.53 6.28,14.72C6.47,14.91 6.7,15 7,15H10C10.27,15 10.5,14.91 10.71,14.72C10.91,14.53 11,14.3 11,14V13H9.5V13.5H7.5V10.5H9.5V11H11V10C11,9.7 10.91,9.47 10.71,9.28C10.5,9.09 10.27,9 10,9H7M14,9C13.73,9 13.5,9.09 13.29,9.28C13.09,9.47 13,9.7 13,10V14C13,14.3 13.09,14.53 13.29,14.72C13.5,14.91 13.73,15 14,15H17C17.3,15 17.53,14.91 17.72,14.72C17.91,14.53 18,14.3 18,14V13H16.5V13.5H14.5V10.5H16.5V11H18V10C18,9.7 17.91,9.47 17.72,9.28C17.53,9.09 17.3,9 17,9H14Z";
var mdiCoffee = "M2,21H20V19H2M20,8H18V5H20M20,3H4V13A4,4 0 0,0 8,17H14A4,4 0 0,0 18,13V10H20A2,2 0 0,0 22,8V5C22,3.89 21.1,3 20,3Z";
var mdiCoffeeOutline = "M2,21V19H20V21H2M20,8V5H18V8H20M20,3A2,2 0 0,1 22,5V8A2,2 0 0,1 20,10H18V13A4,4 0 0,1 14,17H8A4,4 0 0,1 4,13V3H20M16,5H6V13A2,2 0 0,0 8,15H14A2,2 0 0,0 16,13V5Z";
var mdiCog = "M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";
var mdiCogOutline = "M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11L19.5,12L19.43,13L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z";
var mdiCogs = "M15.9,18.45C17.25,18.45 18.35,17.35 18.35,16C18.35,14.65 17.25,13.55 15.9,13.55C14.54,13.55 13.45,14.65 13.45,16C13.45,17.35 14.54,18.45 15.9,18.45M21.1,16.68L22.58,17.84C22.71,17.95 22.75,18.13 22.66,18.29L21.26,20.71C21.17,20.86 21,20.92 20.83,20.86L19.09,20.16C18.73,20.44 18.33,20.67 17.91,20.85L17.64,22.7C17.62,22.87 17.47,23 17.3,23H14.5C14.32,23 14.18,22.87 14.15,22.7L13.89,20.85C13.46,20.67 13.07,20.44 12.71,20.16L10.96,20.86C10.81,20.92 10.62,20.86 10.54,20.71L9.14,18.29C9.05,18.13 9.09,17.95 9.22,17.84L10.7,16.68L10.65,16L10.7,15.31L9.22,14.16C9.09,14.05 9.05,13.86 9.14,13.71L10.54,11.29C10.62,11.13 10.81,11.07 10.96,11.13L12.71,11.84C13.07,11.56 13.46,11.32 13.89,11.15L14.15,9.29C14.18,9.13 14.32,9 14.5,9H17.3C17.47,9 17.62,9.13 17.64,9.29L17.91,11.15C18.33,11.32 18.73,11.56 19.09,11.84L20.83,11.13C21,11.07 21.17,11.13 21.26,11.29L22.66,13.71C22.75,13.86 22.71,14.05 22.58,14.16L21.1,15.31L21.15,16L21.1,16.68M6.69,8.07C7.56,8.07 8.26,7.37 8.26,6.5C8.26,5.63 7.56,4.92 6.69,4.92A1.58,1.58 0 0,0 5.11,6.5C5.11,7.37 5.82,8.07 6.69,8.07M10.03,6.94L11,7.68C11.07,7.75 11.09,7.87 11.03,7.97L10.13,9.53C10.08,9.63 9.96,9.67 9.86,9.63L8.74,9.18L8,9.62L7.81,10.81C7.79,10.92 7.7,11 7.59,11H5.79C5.67,11 5.58,10.92 5.56,10.81L5.4,9.62L4.64,9.18L3.5,9.63C3.41,9.67 3.3,9.63 3.24,9.53L2.34,7.97C2.28,7.87 2.31,7.75 2.39,7.68L3.34,6.94L3.31,6.5L3.34,6.06L2.39,5.32C2.31,5.25 2.28,5.13 2.34,5.03L3.24,3.47C3.3,3.37 3.41,3.33 3.5,3.37L4.63,3.82L5.4,3.38L5.56,2.19C5.58,2.08 5.67,2 5.79,2H7.59C7.7,2 7.79,2.08 7.81,2.19L8,3.38L8.74,3.82L9.86,3.37C9.96,3.33 10.08,3.37 10.13,3.47L11.03,5.03C11.09,5.13 11.07,5.25 11,5.32L10.03,6.06L10.06,6.5L10.03,6.94Z";
var mdiControllerClassic = "M6,7H18A5,5 0 0,1 23,12A5,5 0 0,1 18,17C16.36,17 14.91,16.21 14,15H10C9.09,16.21 7.64,17 6,17A5,5 0 0,1 1,12A5,5 0 0,1 6,7M19.75,9.5A1.25,1.25 0 0,0 18.5,10.75A1.25,1.25 0 0,0 19.75,12A1.25,1.25 0 0,0 21,10.75A1.25,1.25 0 0,0 19.75,9.5M17.25,12A1.25,1.25 0 0,0 16,13.25A1.25,1.25 0 0,0 17.25,14.5A1.25,1.25 0 0,0 18.5,13.25A1.25,1.25 0 0,0 17.25,12M5,9V11H3V13H5V15H7V13H9V11H7V9H5Z";
var mdiControllerClassicOutline = "M17.5,7A5.5,5.5 0 0,1 23,12.5A5.5,5.5 0 0,1 17.5,18C15.79,18 14.27,17.22 13.26,16H10.74C9.73,17.22 8.21,18 6.5,18A5.5,5.5 0 0,1 1,12.5A5.5,5.5 0 0,1 6.5,7H17.5M6.5,9A3.5,3.5 0 0,0 3,12.5A3.5,3.5 0 0,0 6.5,16C7.9,16 9.1,15.18 9.66,14H14.34C14.9,15.18 16.1,16 17.5,16A3.5,3.5 0 0,0 21,12.5A3.5,3.5 0 0,0 17.5,9H6.5M5.75,10.25H7.25V11.75H8.75V13.25H7.25V14.75H5.75V13.25H4.25V11.75H5.75V10.25M16.75,12.5A1,1 0 0,1 17.75,13.5A1,1 0 0,1 16.75,14.5A1,1 0 0,1 15.75,13.5A1,1 0 0,1 16.75,12.5M18.75,10.5A1,1 0 0,1 19.75,11.5A1,1 0 0,1 18.75,12.5A1,1 0 0,1 17.75,11.5A1,1 0 0,1 18.75,10.5Z";
var mdiCurtains = "M23 3H1V1H23V3M2 22H6C6 19 4 17 4 17C10 13 11 4 11 4H2V22M22 4H13C13 4 14 13 20 17C20 17 18 19 18 22H22V4Z";
var mdiCurtainsClosed = "M23 3H1V1H23V3M2 22H11V4H2V22M22 4H13V22H22V4Z";
var mdiDesktopTower = "M8,2H16A2,2 0 0,1 18,4V20A2,2 0 0,1 16,22H8A2,2 0 0,1 6,20V4A2,2 0 0,1 8,2M8,4V6H16V4H8M16,8H8V10H16V8M16,18H14V20H16V18Z";
var mdiDisc = "M12,14C10.89,14 10,13.1 10,12C10,10.89 10.89,10 12,10C13.11,10 14,10.89 14,12A2,2 0 0,1 12,14M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";
var mdiDiscPlayer = "M14.5,10.37C15.54,10.37 16.38,9.53 16.38,8.5C16.38,7.46 15.54,6.63 14.5,6.63C13.46,6.63 12.63,7.46 12.63,8.5A1.87,1.87 0 0,0 14.5,10.37M14.5,1A7.5,7.5 0 0,1 22,8.5C22,10.67 21.08,12.63 19.6,14H9.4C7.93,12.63 7,10.67 7,8.5C7,4.35 10.36,1 14.5,1M6,21V22H4V21H2V15H22V21H20V22H18V21H6M4,18V19H13V18H4M15,17V19H17V17H15M19,17A1,1 0 0,0 18,18A1,1 0 0,0 19,19A1,1 0 0,0 20,18A1,1 0 0,0 19,17Z";
var mdiDishwasher = "M18,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2M10,4A1,1 0 0,1 11,5A1,1 0 0,1 10,6A1,1 0 0,1 9,5A1,1 0 0,1 10,4M7,4A1,1 0 0,1 8,5A1,1 0 0,1 7,6A1,1 0 0,1 6,5A1,1 0 0,1 7,4M18,20H6V8H18V20M14.67,15.33C14.69,16.03 14.41,16.71 13.91,17.21C12.86,18.26 11.15,18.27 10.09,17.21C9.59,16.71 9.31,16.03 9.33,15.33C9.4,14.62 9.63,13.94 10,13.33C10.37,12.5 10.81,11.73 11.33,11L12,10C13.79,12.59 14.67,14.36 14.67,15.33";
var mdiDoor = "M8,3C6.89,3 6,3.89 6,5V21H18V5C18,3.89 17.11,3 16,3H8M8,5H16V19H8V5M13,11V13H15V11H13Z";
var mdiDoorClosed = "M16,11H18V13H16V11M12,3H19C20.11,3 21,3.89 21,5V19H22V21H2V19H10V5C10,3.89 10.89,3 12,3M12,5V19H19V5H12Z";
var mdiDoorOpen = "M12,3C10.89,3 10,3.89 10,5H3V19H2V21H22V19H21V5C21,3.89 20.11,3 19,3H12M12,5H19V19H12V5M5,11H7V13H5V11Z";
var mdiDoorbell = "M12 10C10.9 10 10 10.9 10 12S10.9 14 12 14 14 13.1 14 12 13.1 10 12 10M16 2H8C6.9 2 6 2.9 6 4V20C6 21.1 6.9 22 8 22H16C17.1 22 18 21.1 18 20V4C18 2.9 17.1 2 16 2M16 20H8V4H16V20Z";
var mdiDotsHorizontal = "M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z";
var mdiDotsVertical = "M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z";
var mdiDragVerticalVariant = "M11 21H9V3H11V21M15 3H13V21H15V3Z";
var mdiEye = "M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z";
var mdiEyeOff = "M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.74,7.13 11.35,7 12,7Z";
var mdiFan = "M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z";
var mdiFanOff = "M12.5,2C9.64,2 8.57,4.55 9.29,7.47L15,13.16C15.87,13.37 16.81,13.81 17.28,14.73C18.46,17.1 22.03,17 22.03,12.5C22.03,8.92 18.05,8.13 14.35,10.13C14.03,9.73 13.61,9.42 13.13,9.22C13.32,8.29 13.76,7.24 14.75,6.75C17.11,5.57 17,2 12.5,2M3.28,4L2,5.27L4.47,7.73C3.22,7.74 2,8.87 2,11.5C2,15.07 5.96,15.85 9.65,13.87C9.97,14.27 10.4,14.59 10.89,14.79C10.69,15.71 10.25,16.75 9.27,17.24C6.91,18.42 7,22 11.5,22C13.8,22 14.94,20.36 14.94,18.21L18.73,22L20,20.72L3.28,4Z";
var mdiFastForward = "M13,6V18L21.5,12M4,18L12.5,12L4,6V18Z";
var mdiFilm = "M3.5,3H5V1.8C5,1.36 5.36,1 5.8,1H10.2C10.64,1 11,1.36 11,1.8V3H12.5A1.5,1.5 0 0,1 14,4.5V5H22V20H14V20.5A1.5,1.5 0 0,1 12.5,22H3.5A1.5,1.5 0 0,1 2,20.5V4.5A1.5,1.5 0 0,1 3.5,3M18,7V9H20V7H18M14,7V9H16V7H14M10,7V9H12V7H10M14,16V18H16V16H14M18,16V18H20V16H18M10,16V18H12V16H10Z";
var mdiFilmstrip = "M18,9H16V7H18M18,13H16V11H18M18,17H16V15H18M8,9H6V7H8M8,13H6V11H8M8,17H6V15H8M18,3V5H16V3H8V5H6V3H4V21H6V19H8V21H16V19H18V21H20V3H18Z";
var mdiFire = "M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z";
var mdiFireplace = "M22,22H2V20H22V22M22,6H2V3H22V6M20,7V19H17V11C17,11 14.5,10 12,10C9.5,10 7,11 7,11V19H4V7H20M14.5,14.67H14.47L14.81,15.22L14.87,15.34C15.29,16.35 15,17.5 14.21,18.24C13.5,18.9 12.5,19.07 11.58,18.95C10.71,18.84 9.9,18.29 9.45,17.53C9.3,17.3 9.19,17.03 9.13,16.77L9,16.11C8.96,15.15 9.34,14.14 10.06,13.54C9.73,14.26 9.81,15.16 10.3,15.79L10.36,15.87C10.44,15.94 10.55,15.97 10.64,15.92C10.73,15.89 10.8,15.8 10.8,15.7L10.76,15.56C10.23,14.17 10.68,12.55 11.79,11.63C12.1,11.38 12.5,11.15 12.87,11.05C12.46,11.87 12.61,12.93 13.25,13.57L14.14,14.3L14.5,14.67M13.11,17.44V17.44C13.37,17.2 13.53,16.8 13.5,16.44V16.25C13.38,15.65 12.85,15.46 12.5,15L12.26,14.55C12.13,14.85 12.12,15.13 12.17,15.46C12.23,15.8 12.37,16.09 12.29,16.44C12.2,16.83 11.9,17.22 11.37,17.35C11.67,17.64 12.15,17.87 12.64,17.71L13.11,17.44Z";
var mdiFireplaceOff = "M22,22H2V20H22V22M22,6H2V3H22V6M20,7V19H17V11C17,11 14.5,10 12,10C9.5,10 7,11 7,11V19H4V7H20Z";
var mdiFloorLamp = "M15,2L17,9H7L9,2M11,10H13V20H16V22H8V20H11V10Z";
var mdiFormatColorFill = "M19,11.5C19,11.5 17,13.67 17,15A2,2 0 0,0 19,17A2,2 0 0,0 21,15C21,13.67 19,11.5 19,11.5M5.21,10L10,5.21L14.79,10M16.56,8.94L7.62,0L6.21,1.41L8.59,3.79L3.44,8.94C2.85,9.5 2.85,10.47 3.44,11.06L8.94,16.56C9.23,16.85 9.62,17 10,17C10.38,17 10.77,16.85 11.06,16.56L16.56,11.06C17.15,10.47 17.15,9.5 16.56,8.94Z";
var mdiFridge = "M7,2H17A2,2 0 0,1 19,4V9H5V4A2,2 0 0,1 7,2M19,19A2,2 0 0,1 17,21V22H15V21H9V22H7V21A2,2 0 0,1 5,19V10H19V19M8,5V7H10V5H8M8,12V15H10V12H8Z";
var mdiFullscreen = "M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z";
var mdiFullscreenExit = "M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z";
var mdiGamepad = "M16.5,9L13.5,12L16.5,15H22V9M9,16.5V22H15V16.5L12,13.5M7.5,9H2V15H7.5L10.5,12M15,7.5V2H9V7.5L12,10.5L15,7.5Z";
var mdiGamepadVariant = "M7,6H17A6,6 0 0,1 23,12A6,6 0 0,1 17,18C15.22,18 13.63,17.23 12.53,16H11.47C10.37,17.23 8.78,18 7,18A6,6 0 0,1 1,12A6,6 0 0,1 7,6M6,9V11H4V13H6V15H8V13H10V11H8V9H6M15.5,12A1.5,1.5 0 0,0 14,13.5A1.5,1.5 0 0,0 15.5,15A1.5,1.5 0 0,0 17,13.5A1.5,1.5 0 0,0 15.5,12M18.5,9A1.5,1.5 0 0,0 17,10.5A1.5,1.5 0 0,0 18.5,12A1.5,1.5 0 0,0 20,10.5A1.5,1.5 0 0,0 18.5,9Z";
var mdiGarage = "M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12M8,15H16V17H8V15M16,18V20H8V18H16Z";
var mdiGarageOpen = "M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12Z";
var mdiGestureDoubleTap = "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5M11,3A6,6 0 0,1 17,9C17,10.7 16.29,12.23 15.16,13.33L14.16,12.88C15.28,11.96 16,10.56 16,9A5,5 0 0,0 11,4A5,5 0 0,0 6,9C6,11.05 7.23,12.81 9,13.58V14.66C6.67,13.83 5,11.61 5,9A6,6 0 0,1 11,3Z";
var mdiGestureSwipe = "M20.11,3.89L22,2V7H17L19.08,4.92C18.55,4.23 17.64,3.66 16.36,3.19C15.08,2.72 13.63,2.5 12,2.5C10.38,2.5 8.92,2.72 7.64,3.19C6.36,3.66 5.45,4.23 4.92,4.92L7,7H2V2L3.89,3.89C4.64,3 5.74,2.31 7.2,1.78C8.65,1.25 10.25,1 12,1C13.75,1 15.35,1.25 16.8,1.78C18.26,2.31 19.36,3 20.11,3.89M19.73,16.27V16.45L19,21.7C18.92,22.08 18.76,22.39 18.5,22.64C18.23,22.89 17.91,23 17.53,23H10.73C10.36,23 10,22.86 9.7,22.55L4.73,17.63L5.53,16.83C5.75,16.61 6,16.5 6.33,16.5H6.56L10,17.25V6.5C10,6.11 10.13,5.76 10.43,5.46C10.73,5.16 11.08,5 11.5,5C11.89,5 12.24,5.16 12.54,5.46C12.84,5.76 13,6.11 13,6.5V12.5H13.78C13.88,12.5 14.05,12.55 14.3,12.61L18.84,14.86C19.44,15.14 19.73,15.61 19.73,16.27Z";
var mdiGestureTap = "M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";
var mdiGestureTapButton = "M13 5C15.21 5 17 6.79 17 9C17 10.5 16.2 11.77 15 12.46V11.24C15.61 10.69 16 9.89 16 9C16 7.34 14.66 6 13 6S10 7.34 10 9C10 9.89 10.39 10.69 11 11.24V12.46C9.8 11.77 9 10.5 9 9C9 6.79 10.79 5 13 5M20 20.5C19.97 21.32 19.32 21.97 18.5 22H13C12.62 22 12.26 21.85 12 21.57L8 17.37L8.74 16.6C8.93 16.39 9.2 16.28 9.5 16.28H9.7L12 18V9C12 8.45 12.45 8 13 8S14 8.45 14 9V13.47L15.21 13.6L19.15 15.79C19.68 16.03 20 16.56 20 17.14V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.11 2.9 14 4 14H8V12L4 12L4 4H20L20 12H18V14H20V13.96L20.04 14C21.13 14 22 13.09 22 12V4C22 2.9 21.11 2 20 2Z";
var mdiGlassCocktail = "M7.5,7L5.5,5H18.5L16.5,7M11,13V19H6V21H18V19H13V13L21,5V3H3V5L11,13Z";
var mdiHeadphones = "M12,1C7,1 3,5 3,10V17A3,3 0 0,0 6,20H9V12H5V10A7,7 0 0,1 12,3A7,7 0 0,1 19,10V12H15V20H18A3,3 0 0,0 21,17V10C21,5 16.97,1 12,1Z";
var mdiHeart = "M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z";
var mdiHeartOutline = "M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z";
var mdiHelpCircle = "M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z";
var mdiHelpCircleOutline = "M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z";
var mdiHexagon = "M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5Z";
var mdiHexagonOutline = "M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z";
var mdiHome = "M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z";
var mdiHomeAssistant = "M21.8,13H20V21H13V17.67L15.79,14.88L16.5,15C17.66,15 18.6,14.06 18.6,12.9C18.6,11.74 17.66,10.8 16.5,10.8A2.1,2.1 0 0,0 14.4,12.9L14.5,13.61L13,15.13V9.65C13.66,9.29 14.1,8.6 14.1,7.8A2.1,2.1 0 0,0 12,5.7A2.1,2.1 0 0,0 9.9,7.8C9.9,8.6 10.34,9.29 11,9.65V15.13L9.5,13.61L9.6,12.9A2.1,2.1 0 0,0 7.5,10.8A2.1,2.1 0 0,0 5.4,12.9A2.1,2.1 0 0,0 7.5,15L8.21,14.88L11,17.67V21H4V13H2.25C1.83,13 1.42,13 1.42,12.79C1.43,12.57 1.85,12.15 2.28,11.72L11,3C11.33,2.67 11.67,2.33 12,2.33C12.33,2.33 12.67,2.67 13,3L17,7V6H19V9L21.78,11.78C22.18,12.18 22.59,12.59 22.6,12.8C22.6,13 22.2,13 21.8,13M7.5,12A0.9,0.9 0 0,1 8.4,12.9A0.9,0.9 0 0,1 7.5,13.8A0.9,0.9 0 0,1 6.6,12.9A0.9,0.9 0 0,1 7.5,12M16.5,12C17,12 17.4,12.4 17.4,12.9C17.4,13.4 17,13.8 16.5,13.8A0.9,0.9 0 0,1 15.6,12.9A0.9,0.9 0 0,1 16.5,12M12,6.9C12.5,6.9 12.9,7.3 12.9,7.8C12.9,8.3 12.5,8.7 12,8.7C11.5,8.7 11.1,8.3 11.1,7.8C11.1,7.3 11.5,6.9 12,6.9Z";
var mdiHomeAutomation = "M12,3L2,12H5V20H19V12H22L12,3M12,8.5C14.34,8.5 16.46,9.43 18,10.94L16.8,12.12C15.58,10.91 13.88,10.17 12,10.17C10.12,10.17 8.42,10.91 7.2,12.12L6,10.94C7.54,9.43 9.66,8.5 12,8.5M12,11.83C13.4,11.83 14.67,12.39 15.6,13.3L14.4,14.47C13.79,13.87 12.94,13.5 12,13.5C11.06,13.5 10.21,13.87 9.6,14.47L8.4,13.3C9.33,12.39 10.6,11.83 12,11.83M12,15.17C12.94,15.17 13.7,15.91 13.7,16.83C13.7,17.75 12.94,18.5 12,18.5C11.06,18.5 10.3,17.75 10.3,16.83C10.3,15.91 11.06,15.17 12,15.17Z";
var mdiHomeLightbulb = "M12 3L2 12H5V20H19V12H22M13 18H11V17H13M13.5 14.58V16H10.5V14.58A3 3 0 1 1 13.5 14.58Z";
var mdiHomeOutline = "M12 5.69L17 10.19V18H15V12H9V18H7V10.19L12 5.69M12 3L2 12H5V20H11V14H13V20H19V12H22";
var mdiHomeThermometer = "M19 8C20.11 8 21 8.9 21 10V16.76C21.61 17.31 22 18.11 22 19C22 20.66 20.66 22 19 22C17.34 22 16 20.66 16 19C16 18.11 16.39 17.31 17 16.76V10C17 8.9 17.9 8 19 8M19 9C18.45 9 18 9.45 18 10V11H20V10C20 9.45 19.55 9 19 9M5 20V12H2L12 3L16.4 6.96C15.54 7.69 15 8.78 15 10V16C14.37 16.83 14 17.87 14 19L14.1 20H5Z";
var mdiHulu = "M19.5,12.8V22H14.7V13.9C14.7,13.2 14.1,12.6 13.4,12.6H10.5C9.8,12.6 9.2,13.2 9.2,13.9V22H4.5V2H9.3V8.4C9.6,8.3 9.9,8.2 10.2,8.2H15C17.5,8.2 19.5,10.3 19.5,12.8Z";
var mdiHumanGreeting = "M12 2C13.1 2 14 2.9 14 4S13.1 6 12 6 10 5.1 10 4 10.9 2 12 2M15.9 8.1C15.5 7.7 14.8 7 13.5 7H11C8.2 7 6 4.8 6 2H4C4 5.2 6.1 7.8 9 8.7V22H11V16H13V22H15V10.1L19 14L20.4 12.6L15.9 8.1Z";
var mdiImage = "M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z";
var mdiImageMultiple = "M22,16V4A2,2 0 0,0 20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16M11,12L13.03,14.71L16,11L20,16H8M2,6V20A2,2 0 0,0 4,22H18V20H4V6";
var mdiInformation = "M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiInformationOutline = "M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z";
var mdiInvertColors = "M12,19.58V19.58C10.4,19.58 8.89,18.96 7.76,17.83C6.62,16.69 6,15.19 6,13.58C6,12 6.62,10.47 7.76,9.34L12,5.1M17.66,7.93L12,2.27V2.27L6.34,7.93C3.22,11.05 3.22,16.12 6.34,19.24C7.9,20.8 9.95,21.58 12,21.58C14.05,21.58 16.1,20.8 17.66,19.24C20.78,16.12 20.78,11.05 17.66,7.93Z";
var mdiKettle = "M12.5,3C7.81,3 4,5.69 4,9V9C4,10.19 4.5,11.34 5.44,12.33C4.53,13.5 4,14.96 4,16.5C4,17.64 4,18.83 4,20C4,21.11 4.89,22 6,22H19C20.11,22 21,21.11 21,20C21,18.85 21,17.61 21,16.5C21,15.28 20.66,14.07 20,13L22,11L19,8L16.9,10.1C15.58,9.38 14.05,9 12.5,9C10.65,9 8.95,9.53 7.55,10.41C7.19,9.97 7,9.5 7,9C7,7.21 9.46,5.75 12.5,5.75V5.75C13.93,5.75 15.3,6.08 16.33,6.67L18.35,4.65C16.77,3.59 14.68,3 12.5,3M12.5,11C12.84,11 13.17,11.04 13.5,11.09C10.39,11.57 8,14.25 8,17.5V20H6V17.5A6.5,6.5 0 0,1 12.5,11Z";
var mdiKeyboard = "M19,10H17V8H19M19,13H17V11H19M16,10H14V8H16M16,13H14V11H16M16,17H8V15H16M7,10H5V8H7M7,13H5V11H7M8,11H10V13H8M8,8H10V10H8M11,11H13V13H11M11,8H13V10H11M20,5H4C2.89,5 2,5.89 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7C22,5.89 21.1,5 20,5Z";
var mdiKeyboardBackspace = "M21,11H6.83L10.41,7.41L9,6L3,12L9,18L10.41,16.58L6.83,13H21V11Z";
var mdiKeyboardReturn = "M19,7V11H5.83L9.41,7.41L8,6L2,12L8,18L9.41,16.58L5.83,13H21V7H19Z";
var mdiKeyboardSpace = "M3 15H5V19H19V15H21V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15Z";
var mdiKodi = "M12.03,1C11.82,1 11.6,1.11 11.41,1.31C10.56,2.16 9.72,3 8.88,3.84C8.66,4.06 8.6,4.18 8.38,4.38C8.09,4.62 7.96,4.91 7.97,5.28C8,6.57 8,7.84 8,9.13C8,10.46 8,11.82 8,13.16C8,13.26 8,13.34 8.03,13.44C8.11,13.75 8.31,13.82 8.53,13.59C9.73,12.39 10.8,11.3 12,10.09C13.36,8.73 14.73,7.37 16.09,6C16.5,5.6 16.5,5.15 16.09,4.75C14.94,3.6 13.77,2.47 12.63,1.31C12.43,1.11 12.24,1 12.03,1M18.66,7.66C18.45,7.66 18.25,7.75 18.06,7.94C16.91,9.1 15.75,10.24 14.59,11.41C14.2,11.8 14.2,12.23 14.59,12.63C15.74,13.78 16.88,14.94 18.03,16.09C18.43,16.5 18.85,16.5 19.25,16.09C20.36,15 21.5,13.87 22.59,12.75C22.76,12.58 22.93,12.42 23,12.19V11.88C22.93,11.64 22.76,11.5 22.59,11.31C21.47,10.19 20.37,9.06 19.25,7.94C19.06,7.75 18.86,7.66 18.66,7.66M4.78,8.09C4.65,8.04 4.58,8.14 4.5,8.22C3.35,9.39 2.34,10.43 1.19,11.59C0.93,11.86 0.93,12.24 1.19,12.5C1.81,13.13 2.44,13.75 3.06,14.38C3.6,14.92 4,15.33 4.56,15.88C4.72,16.03 4.86,16 4.94,15.81C5,15.71 5,15.58 5,15.47C5,14.29 5,13.37 5,12.19C5,11 5,9.81 5,8.63C5,8.55 5,8.45 4.97,8.38C4.95,8.25 4.9,8.14 4.78,8.09M12.09,14.25C11.89,14.25 11.66,14.34 11.47,14.53C10.32,15.69 9.18,16.87 8.03,18.03C7.63,18.43 7.63,18.85 8.03,19.25C9.14,20.37 10.26,21.47 11.38,22.59C11.54,22.76 11.71,22.93 11.94,23H12.22C12.44,22.94 12.62,22.79 12.78,22.63C13.9,21.5 15.03,20.38 16.16,19.25C16.55,18.85 16.5,18.4 16.13,18C14.97,16.84 13.84,15.69 12.69,14.53C12.5,14.34 12.3,14.25 12.09,14.25Z";
var mdiLamp = "M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z";
var mdiLaptop = "M4,6H20V16H4M20,18A2,2 0 0,0 22,16V6C22,4.89 21.1,4 20,4H4C2.89,4 2,4.89 2,6V16A2,2 0 0,0 4,18H0V20H24V18H20Z";
var mdiLedStrip = "M2.81,8.46L14.83,20.5L15.54,19.78L16.95,21.19L18.36,19.78L16.95,18.36L18.36,16.95L19.78,18.36L21.19,16.95L19.78,15.54L20.5,14.83L8.46,2.81L2.81,8.46M5.64,8.46L8.46,5.64L17.66,14.83L14.83,17.66L5.64,8.46M7.05,8.46L8.46,9.88L9.88,8.46L8.46,7.05L7.05,8.46M9.17,10.59L10.59,12L12,10.59L10.59,9.17L9.17,10.59M11.29,12.71L12.71,14.12L14.12,12.71L12.71,11.29L11.29,12.71M13.41,14.83L14.83,16.24L16.24,14.83L14.83,13.41L13.41,14.83Z";
var mdiLedStripVariant = "M2.95 3L2 6.91L19.34 11.25L20.29 7.34L2.95 3M6.09 6.89L4.16 6.41L4.64 4.46L6.57 4.94L6.09 6.89M9.94 7.86L8 7.38L8.5 5.42L10.42 5.91L9.94 7.86M13.8 8.82L11.87 8.34L12.35 6.39L14.27 6.87L13.8 8.82M17.65 9.79L15.72 9.31L16.2 7.35L18.13 7.84L17.65 9.79M4.66 12.75L3.71 16.66L21.05 21L22 17.1L4.66 12.75M7.8 16.65L5.88 16.16L6.35 14.21L8.28 14.69L7.8 16.65M11.65 17.61L9.73 17.13L10.2 15.18L12.13 15.66L11.65 17.61M15.5 18.58L13.58 18.09L14.06 16.14L16 16.62L15.5 18.58M19.36 19.54L17.43 19.06L17.91 17.11L19.84 17.59L19.36 19.54M6.25 12.11L11 10.2L17.75 11.89L13 13.8L6.25 12.11Z";
var mdiLightbulb = "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z";
var mdiLightbulbGroup = "M15 14V16A1 1 0 0 1 14 17H10A1 1 0 0 1 9 16V14A5 5 0 1 1 15 14M14 18H10V19A1 1 0 0 0 11 20H13A1 1 0 0 0 14 19M7 19V18H5V19A1 1 0 0 0 6 20H7.17A2.93 2.93 0 0 1 7 19M5 10A6.79 6.79 0 0 1 5.68 7A4 4 0 0 0 4 14.45V16A1 1 0 0 0 5 17H7V14.88A6.92 6.92 0 0 1 5 10M17 18V19A2.93 2.93 0 0 1 16.83 20H18A1 1 0 0 0 19 19V18M18.32 7A6.79 6.79 0 0 1 19 10A6.92 6.92 0 0 1 17 14.88V17H19A1 1 0 0 0 20 16V14.45A4 4 0 0 0 18.32 7Z";
var mdiLightbulbGroupOff = "M20.84 22.73L18.09 20C18.06 20 18.03 20 18 20H16.83C16.94 19.68 17 19.34 17 19V18.89L14.75 16.64C14.57 16.86 14.31 17 14 17H10C9.45 17 9 16.55 9 16V14C7.4 12.8 6.74 10.84 7.12 9L5.5 7.4C5.18 8.23 5 9.11 5 10C5 11.83 5.72 13.58 7 14.88V17H5C4.45 17 4 16.55 4 16V14.45C2.86 13.79 2.12 12.62 2 11.31C1.85 9.27 3.25 7.5 5.2 7.09L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M15 6C13.22 4.67 10.86 4.72 9.13 5.93L16.08 12.88C17.63 10.67 17.17 7.63 15 6M19.79 16.59C19.91 16.42 20 16.22 20 16V14.45C21.91 13.34 22.57 10.9 21.46 9C20.8 7.85 19.63 7.11 18.32 7C18.77 7.94 19 8.96 19 10C19 11.57 18.47 13.09 17.5 14.31L19.79 16.59M10 19C10 19.55 10.45 20 11 20H13C13.55 20 14 19.55 14 19V18H10V19M7 18H5V19C5 19.55 5.45 20 6 20H7.17C7.06 19.68 7 19.34 7 19V18Z";
var mdiLightbulbOff = "M12,2C9.76,2 7.78,3.05 6.5,4.68L16.31,14.5C17.94,13.21 19,11.24 19,9A7,7 0 0,0 12,2M3.28,4L2,5.27L5.04,8.3C5,8.53 5,8.76 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H14.73L18.73,22L20,20.72L3.28,4M9,20V21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9Z";
var mdiLightbulbOn = "M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z";
var mdiLightbulbOutline = "M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z";
var mdiLock = "M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z";
var mdiLockOpen = "M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10A2,2 0 0,1 6,8H15V6A3,3 0 0,0 12,3A3,3 0 0,0 9,6H7A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17Z";
var mdiLockOpenVariant = "M18 1C15.24 1 13 3.24 13 6V8H4C2.9 8 2 8.89 2 10V20C2 21.11 2.9 22 4 22H16C17.11 22 18 21.11 18 20V10C18 8.9 17.11 8 16 8H15V6C15 4.34 16.34 3 18 3C19.66 3 21 4.34 21 6V8H23V6C23 3.24 20.76 1 18 1M10 13C11.1 13 12 13.89 12 15C12 16.11 11.11 17 10 17C8.9 17 8 16.11 8 15C8 13.9 8.9 13 10 13Z";
var mdiMagnify = "M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z";
var mdiMagnifyMinus = "M9,2A7,7 0 0,1 16,9C16,10.57 15.5,12 14.61,13.19L15.41,14H16L22,20L20,22L14,16V15.41L13.19,14.61C12,15.5 10.57,16 9,16A7,7 0 0,1 2,9A7,7 0 0,1 9,2M5,8V10H13V8H5Z";
var mdiMagnifyPlus = "M9,2A7,7 0 0,1 16,9C16,10.57 15.5,12 14.61,13.19L15.41,14H16L22,20L20,22L14,16V15.41L13.19,14.61C12,15.5 10.57,16 9,16A7,7 0 0,1 2,9A7,7 0 0,1 9,2M8,5V8H5V10H8V13H10V10H13V8H10V5H8Z";
var mdiMenu = "M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z";
var mdiMenuDown = "M7,10L12,15L17,10H7Z";
var mdiMenuOpen = "M21,15.61L19.59,17L14.58,12L19.59,7L21,8.39L17.44,12L21,15.61M3,6H16V8H3V6M3,13V11H13V13H3M3,18V16H16V18H3Z";
var mdiMenuUp = "M7,15L12,10L17,15H7Z";
var mdiMicrosoftXbox = "M6.43,3.72C6.5,3.66 6.57,3.6 6.62,3.56C8.18,2.55 10,2 12,2C13.88,2 15.64,2.5 17.14,3.42C17.25,3.5 17.54,3.69 17.7,3.88C16.25,2.28 12,5.7 12,5.7C10.5,4.57 9.17,3.8 8.16,3.5C7.31,3.29 6.73,3.5 6.46,3.7M19.34,5.21C19.29,5.16 19.24,5.11 19.2,5.06C18.84,4.66 18.38,4.56 18,4.59C17.61,4.71 15.9,5.32 13.8,7.31C13.8,7.31 16.17,9.61 17.62,11.96C19.07,14.31 19.93,16.16 19.4,18.73C21,16.95 22,14.59 22,12C22,9.38 21,7 19.34,5.21M15.73,12.96C15.08,12.24 14.13,11.21 12.86,9.95C12.59,9.68 12.3,9.4 12,9.1C12,9.1 11.53,9.56 10.93,10.17C10.16,10.94 9.17,11.95 8.61,12.54C7.63,13.59 4.81,16.89 4.65,18.74C4.65,18.74 4,17.28 5.4,13.89C6.3,11.68 9,8.36 10.15,7.28C10.15,7.28 9.12,6.14 7.82,5.35L7.77,5.32C7.14,4.95 6.46,4.66 5.8,4.62C5.13,4.67 4.71,5.16 4.71,5.16C3.03,6.95 2,9.35 2,12A10,10 0 0,0 12,22C14.93,22 17.57,20.74 19.4,18.73C19.4,18.73 19.19,17.4 17.84,15.5C17.53,15.07 16.37,13.69 15.73,12.96Z";
var mdiMicrowave = "M4,5A2,2 0 0,0 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7A2,2 0 0,0 20,5H4M4,7H16V17H4V7M19,7A1,1 0 0,1 20,8A1,1 0 0,1 19,9A1,1 0 0,1 18,8A1,1 0 0,1 19,7M13,9V15H15V9H13M19,11A1,1 0 0,1 20,12A1,1 0 0,1 19,13A1,1 0 0,1 18,12A1,1 0 0,1 19,11Z";
var mdiMinus = "M19,13H5V11H19V13Z";
var mdiMinusBox = "M17,13H7V11H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";
var mdiMinusCircle = "M17,13H7V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiMonitor = "M21,16H3V4H21M21,2H3C1.89,2 1,2.89 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16V4C23,2.89 22.1,2 21,2Z";
var mdiMotionSensor = "M10,0.2C9,0.2 8.2,1 8.2,2C8.2,3 9,3.8 10,3.8C11,3.8 11.8,3 11.8,2C11.8,1 11,0.2 10,0.2M15.67,1A7.33,7.33 0 0,0 23,8.33V7A6,6 0 0,1 17,1H15.67M18.33,1C18.33,3.58 20.42,5.67 23,5.67V4.33C21.16,4.33 19.67,2.84 19.67,1H18.33M21,1A2,2 0 0,0 23,3V1H21M7.92,4.03C7.75,4.03 7.58,4.06 7.42,4.11L2,5.8V11H3.8V7.33L5.91,6.67L2,22H3.8L6.67,13.89L9,17V22H10.8V15.59L8.31,11.05L9.04,8.18L10.12,10H15V8.2H11.38L9.38,4.87C9.08,4.37 8.54,4.03 7.92,4.03Z";
var mdiMovie = "M18,4L20,8H17L15,4H13L15,8H12L10,4H8L10,8H7L5,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V4H18Z";
var mdiMovieOpen = "M20.84 2.18L16.91 2.96L19.65 6.5L21.62 6.1L20.84 2.18M13.97 3.54L12 3.93L14.75 7.46L16.71 7.07L13.97 3.54M9.07 4.5L7.1 4.91L9.85 8.44L11.81 8.05L9.07 4.5M4.16 5.5L3.18 5.69A2 2 0 0 0 1.61 8.04L2 10L6.9 9.03L4.16 5.5M2 10V20C2 21.11 2.9 22 4 22H20C21.11 22 22 21.11 22 20V10H2Z";
var mdiMovieRoll = "M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A2.5,2.5 0 0,0 9.5,6.5A2.5,2.5 0 0,0 12,9A2.5,2.5 0 0,0 14.5,6.5A2.5,2.5 0 0,0 12,4M4.4,9.53C3.97,10.84 4.69,12.25 6,12.68C7.32,13.1 8.73,12.39 9.15,11.07C9.58,9.76 8.86,8.35 7.55,7.92C6.24,7.5 4.82,8.21 4.4,9.53M19.61,9.5C19.18,8.21 17.77,7.5 16.46,7.92C15.14,8.34 14.42,9.75 14.85,11.07C15.28,12.38 16.69,13.1 18,12.67C19.31,12.25 20.03,10.83 19.61,9.5M7.31,18.46C8.42,19.28 10,19.03 10.8,17.91C11.61,16.79 11.36,15.23 10.24,14.42C9.13,13.61 7.56,13.86 6.75,14.97C5.94,16.09 6.19,17.65 7.31,18.46M16.7,18.46C17.82,17.65 18.07,16.09 17.26,14.97C16.45,13.85 14.88,13.6 13.77,14.42C12.65,15.23 12.4,16.79 13.21,17.91C14,19.03 15.59,19.27 16.7,18.46M12,10.5A1.5,1.5 0 0,0 10.5,12A1.5,1.5 0 0,0 12,13.5A1.5,1.5 0 0,0 13.5,12A1.5,1.5 0 0,0 12,10.5Z";
var mdiMusic = "M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z";
var mdiMusicBox = "M16,9H13V14.5A2.5,2.5 0 0,1 10.5,17A2.5,2.5 0 0,1 8,14.5A2.5,2.5 0 0,1 10.5,12C11.07,12 11.58,12.19 12,12.5V7H16M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3Z";
var mdiMusicBoxOutline = "M16,9H13V14.5A2.5,2.5 0 0,1 10.5,17A2.5,2.5 0 0,1 8,14.5A2.5,2.5 0 0,1 10.5,12C11.07,12 11.58,12.19 12,12.5V7H16V9M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19M5,5V19H19V5H5Z";
var mdiMusicNote = "M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z";
var mdiNetflix = "M6.5,2H10.5L13.44,10.83L13.5,2H17.5V22C16.25,21.78 14.87,21.64 13.41,21.58L10.5,13L10.43,21.59C9.03,21.65 7.7,21.79 6.5,22V2Z";
var mdiNintendoGameBoy = "M7 1C5.9 1 5 1.9 5 3V21C5 22.11 5.9 23 7 23H14C16.76 23 19 20.76 19 18V3C19 1.9 18.11 1 17 1H7M8 4H16V11H8V4M9 14H10V16H12V17H10V19H9V17H7V16H9V14M16 15C16.55 15 17 15.45 17 16C17 16.55 16.55 17 16 17C15.45 17 15 16.55 15 16C15 15.45 15.45 15 16 15M14 17C14.55 17 15 17.45 15 18C15 18.55 14.55 19 14 19C13.45 19 13 18.55 13 18C13 17.45 13.45 17 14 17Z";
var mdiNintendoSwitch = "M10.04,20.4H7.12C6.19,20.4 5.3,20 4.64,19.36C4,18.7 3.6,17.81 3.6,16.88V7.12C3.6,6.19 4,5.3 4.64,4.64C5.3,4 6.19,3.62 7.12,3.62H10.04V20.4M7.12,2A5.12,5.12 0 0,0 2,7.12V16.88C2,19.71 4.29,22 7.12,22H11.65V2H7.12M5.11,8C5.11,9.04 5.95,9.88 7,9.88C8.03,9.88 8.87,9.04 8.87,8C8.87,6.96 8.03,6.12 7,6.12C5.95,6.12 5.11,6.96 5.11,8M17.61,11C18.72,11 19.62,11.89 19.62,13C19.62,14.12 18.72,15 17.61,15C16.5,15 15.58,14.12 15.58,13C15.58,11.89 16.5,11 17.61,11M16.88,22A5.12,5.12 0 0,0 22,16.88V7.12C22,4.29 19.71,2 16.88,2H13.65V22H16.88Z";
var mdiNumeric = "M4,17V9H2V7H6V17H4M22,15C22,16.11 21.1,17 20,17H16V15H20V13H18V11H20V9H16V7H20A2,2 0 0,1 22,9V10.5A1.5,1.5 0 0,1 20.5,12A1.5,1.5 0 0,1 22,13.5V15M14,15V17H8V13C8,11.89 8.9,11 10,11H12V9H8V7H12A2,2 0 0,1 14,9V11C14,12.11 13.1,13 12,13H10V15H14Z";
var mdiPalette = "M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";
var mdiPaletteOutline = "M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C12.3,20 12.5,19.8 12.5,19.5C12.5,19.3 12.4,19.2 12.4,19.1C12,18.6 11.8,18.1 11.8,17.5C11.8,16.1 12.9,15 14.3,15H16A4,4 0 0,0 20,11C20,7.1 16.4,4 12,4M6.5,10C7.3,10 8,10.7 8,11.5C8,12.3 7.3,13 6.5,13C5.7,13 5,12.3 5,11.5C5,10.7 5.7,10 6.5,10M9.5,6C10.3,6 11,6.7 11,7.5C11,8.3 10.3,9 9.5,9C8.7,9 8,8.3 8,7.5C8,6.7 8.7,6 9.5,6M14.5,6C15.3,6 16,6.7 16,7.5C16,8.3 15.3,9 14.5,9C13.7,9 13,8.3 13,7.5C13,6.7 13.7,6 14.5,6M17.5,10C18.3,10 19,10.7 19,11.5C19,12.3 18.3,13 17.5,13C16.7,13 16,12.3 16,11.5C16,10.7 16.7,10 17.5,10Z";
var mdiPause = "M14,19H18V5H14M6,19H10V5H6V19Z";
var mdiPauseCircle = "M15,16H13V8H15M11,16H9V8H11M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiPauseCircleOutline = "M13,16V8H15V16H13M9,16V8H11V16H9M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";
var mdiPictureInPictureBottomRight = "M19,11H11V17H19V11M23,19V5C23,3.88 22.1,3 21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19M21,19H3V4.97H21V19Z";
var mdiPlay = "M8,5.14V19.14L19,12.14L8,5.14Z";
var mdiPlayCircle = "M10,16.5V7.5L16,12M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiPlayCircleOutline = "M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z";
var mdiPlayPause = "M3,5V19L11,12M13,19H16V5H13M18,5V19H21V5";
var mdiPlex = "M4,2C2.89,2 2,2.89 2,4V20C2,21.11 2.89,22 4,22H20C21.11,22 22,21.11 22,20V4C22,2.89 21.11,2 20,2H4M8.56,6H12.06L15.5,12L12.06,18H8.56L12,12L8.56,6Z";
var mdiPlus = "M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z";
var mdiPlusBox = "M17,13H13V17H11V13H7V11H11V7H13V11H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";
var mdiPlusCircle = "M17,13H13V17H11V13H7V11H11V7H13V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiPopcorn = "M7,22H4.75C4.75,22 4,22 3.81,20.65L2.04,3.81L2,3.5C2,2.67 2.9,2 4,2C5.1,2 6,2.67 6,3.5C6,2.67 6.9,2 8,2C9.1,2 10,2.67 10,3.5C10,2.67 10.9,2 12,2C13.09,2 14,2.66 14,3.5V3.5C14,2.67 14.9,2 16,2C17.1,2 18,2.67 18,3.5C18,2.67 18.9,2 20,2C21.1,2 22,2.67 22,3.5L21.96,3.81L20.19,20.65C20,22 19.25,22 19.25,22H17L16.5,22H13.75L10.25,22H7.5L7,22M17.85,4.93C17.55,4.39 16.84,4 16,4C15.19,4 14.36,4.36 14,4.87L13.78,20H16.66L17.85,4.93M10,4.87C9.64,4.36 8.81,4 8,4C7.16,4 6.45,4.39 6.15,4.93L7.34,20H10.22L10,4.87Z";
var mdiPower = "M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13";
var mdiPowerCycle = "M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19M13,17H11V7H13V17Z";
var mdiPowerOff = "M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19Z";
var mdiPowerOn = "M11,3H13V21H11V3Z";
var mdiPowerSleep = "M18.73,18C15.4,21.69 9.71,22 6,18.64C2.33,15.31 2.04,9.62 5.37,5.93C6.9,4.25 9,3.2 11.27,3C7.96,6.7 8.27,12.39 12,15.71C13.63,17.19 15.78,18 18,18C18.25,18 18.5,18 18.73,18Z";
var mdiPowerStandby = "M13,3H11V13H13V3M17.83,5.17L16.41,6.59C18.05,7.91 19,9.9 19,12A7,7 0 0,1 12,19C8.14,19 5,15.88 5,12C5,9.91 5.95,7.91 7.58,6.58L6.17,5.17C2.38,8.39 1.92,14.07 5.14,17.86C8.36,21.64 14.04,22.1 17.83,18.88C19.85,17.17 21,14.65 21,12C21,9.37 19.84,6.87 17.83,5.17Z";
var mdiProjector = "M16,6C14.87,6 13.77,6.35 12.84,7H4C2.89,7 2,7.89 2,9V15C2,16.11 2.89,17 4,17H5V18A1,1 0 0,0 6,19H8A1,1 0 0,0 9,18V17H15V18A1,1 0 0,0 16,19H18A1,1 0 0,0 19,18V17H20C21.11,17 22,16.11 22,15V9C22,7.89 21.11,7 20,7H19.15C18.23,6.35 17.13,6 16,6M16,7.5A3.5,3.5 0 0,1 19.5,11A3.5,3.5 0 0,1 16,14.5A3.5,3.5 0 0,1 12.5,11A3.5,3.5 0 0,1 16,7.5M4,9H8V10H4V9M16,9A2,2 0 0,0 14,11A2,2 0 0,0 16,13A2,2 0 0,0 18,11A2,2 0 0,0 16,9M4,11H8V12H4V11M4,13H8V14H4V13Z";
var mdiProjectorScreen = "M4,2A1,1 0 0,0 3,3V4A1,1 0 0,0 4,5H5V14H11V16.59L6.79,20.79L8.21,22.21L11,19.41V22H13V19.41L15.79,22.21L17.21,20.79L13,16.59V14H19V5H20A1,1 0 0,0 21,4V3A1,1 0 0,0 20,2H4Z";
var mdiRadiator = "M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z";
var mdiRadio = "M20,6A2,2 0 0,1 22,8V20A2,2 0 0,1 20,22H4A2,2 0 0,1 2,20V8C2,7.15 2.53,6.42 3.28,6.13L15.71,1L16.47,2.83L8.83,6H20M20,8H4V12H16V10H18V12H20V8M7,14A3,3 0 0,0 4,17A3,3 0 0,0 7,20A3,3 0 0,0 10,17A3,3 0 0,0 7,14Z";
var mdiRadioTower = "M12,10A2,2 0 0,1 14,12C14,12.5 13.82,12.94 13.53,13.29L16.7,22H14.57L12,14.93L9.43,22H7.3L10.47,13.29C10.18,12.94 10,12.5 10,12A2,2 0 0,1 12,10M12,8A4,4 0 0,0 8,12C8,12.5 8.1,13 8.28,13.46L7.4,15.86C6.53,14.81 6,13.47 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12C18,13.47 17.47,14.81 16.6,15.86L15.72,13.46C15.9,13 16,12.5 16,12A4,4 0 0,0 12,8M12,4A8,8 0 0,0 4,12C4,14.36 5,16.5 6.64,17.94L5.92,19.94C3.54,18.11 2,15.23 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12C22,15.23 20.46,18.11 18.08,19.94L17.36,17.94C19,16.5 20,14.36 20,12A8,8 0 0,0 12,4Z";
var mdiRecord = "M19,12C19,15.86 15.86,19 12,19C8.14,19 5,15.86 5,12C5,8.14 8.14,5 12,5C15.86,5 19,8.14 19,12Z";
var mdiRecordRec = "M12.5,5A7.5,7.5 0 0,0 5,12.5A7.5,7.5 0 0,0 12.5,20A7.5,7.5 0 0,0 20,12.5A7.5,7.5 0 0,0 12.5,5M7,10H9A1,1 0 0,1 10,11V12C10,12.5 9.62,12.9 9.14,12.97L10.31,15H9.15L8,13V15H7M12,10H14V11H12V12H14V13H12V14H14V15H12A1,1 0 0,1 11,14V11A1,1 0 0,1 12,10M16,10H18V11H16V14H18V15H16A1,1 0 0,1 15,14V11A1,1 0 0,1 16,10M8,11V12H9V11";
var mdiRedo = "M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z";
var mdiRefresh = "M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z";
var mdiReload = "M2 12C2 16.97 6.03 21 11 21C13.39 21 15.68 20.06 17.4 18.4L15.9 16.9C14.63 18.25 12.86 19 11 19C4.76 19 1.64 11.46 6.05 7.05C10.46 2.64 18 5.77 18 12H15L19 16H19.1L23 12H20C20 7.03 15.97 3 11 3C6.03 3 2 7.03 2 12Z";
var mdiRemote = "M12,0C8.96,0 6.21,1.23 4.22,3.22L5.63,4.63C7.26,3 9.5,2 12,2C14.5,2 16.74,3 18.36,4.64L19.77,3.23C17.79,1.23 15.04,0 12,0M7.05,6.05L8.46,7.46C9.37,6.56 10.62,6 12,6C13.38,6 14.63,6.56 15.54,7.46L16.95,6.05C15.68,4.78 13.93,4 12,4C10.07,4 8.32,4.78 7.05,6.05M12,15A2,2 0 0,1 10,13A2,2 0 0,1 12,11A2,2 0 0,1 14,13A2,2 0 0,1 12,15M15,9H9A1,1 0 0,0 8,10V22A1,1 0 0,0 9,23H15A1,1 0 0,0 16,22V10A1,1 0 0,0 15,9Z";
var mdiRemoteOff = "M2,5.27L3.28,4L21,21.72L19.73,23L16,19.27V22A1,1 0 0,1 15,23H9C8.46,23 8,22.55 8,22V11.27L2,5.27M12,0C15.05,0 17.8,1.23 19.77,3.23L18.36,4.64C16.75,3 14.5,2 12,2C9.72,2 7.64,2.85 6.06,4.24L4.64,2.82C6.59,1.07 9.17,0 12,0M12,4C13.94,4 15.69,4.78 16.95,6.05L15.55,7.46C14.64,6.56 13.39,6 12,6C10.83,6 9.76,6.4 8.9,7.08L7.5,5.66C8.7,4.62 10.28,4 12,4M15,9C15.56,9 16,9.45 16,10V14.18L13.5,11.69L13.31,11.5L10.82,9H15M10.03,13.3C10.16,14.16 10.84,14.85 11.71,15L10.03,13.3Z";
var mdiRemoteTv = "M9,2C7.89,2 7,2.89 7,4V20C7,21.11 7.89,22 9,22H15C16.11,22 17,21.11 17,20V4C17,2.89 16.11,2 15,2H13V4H11V2H9M11,6H13V8H15V10H13V12H11V10H9V8H11V6M9,14H11V16H9V14M13,14H15V16H13V14M9,18H11V20H9V18M13,18H15V20H13V18Z";
var mdiRepeat = "M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z";
var mdiRepeatOnce = "M13,15V9H12L10,10V11H11.5V15M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z";
var mdiRewind = "M11.5,12L20,18V6M11,18V6L2.5,12L11,18Z";
var mdiRhombus = "M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2Z";
var mdiRhombusOutline = "M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2M12 4L20 12L12 20L4 12Z";
var mdiRobot = "M12,2A2,2 0 0,1 14,4C14,4.74 13.6,5.39 13,5.73V7H14A7,7 0 0,1 21,14H22A1,1 0 0,1 23,15V18A1,1 0 0,1 22,19H21V20A2,2 0 0,1 19,22H5A2,2 0 0,1 3,20V19H2A1,1 0 0,1 1,18V15A1,1 0 0,1 2,14H3A7,7 0 0,1 10,7H11V5.73C10.4,5.39 10,4.74 10,4A2,2 0 0,1 12,2M7.5,13A2.5,2.5 0 0,0 5,15.5A2.5,2.5 0 0,0 7.5,18A2.5,2.5 0 0,0 10,15.5A2.5,2.5 0 0,0 7.5,13M16.5,13A2.5,2.5 0 0,0 14,15.5A2.5,2.5 0 0,0 16.5,18A2.5,2.5 0 0,0 19,15.5A2.5,2.5 0 0,0 16.5,13Z";
var mdiRobotVacuum = "M12,2C14.65,2 17.19,3.06 19.07,4.93L17.65,6.35C16.15,4.85 14.12,4 12,4C9.88,4 7.84,4.84 6.35,6.35L4.93,4.93C6.81,3.06 9.35,2 12,2M3.66,6.5L5.11,7.94C4.39,9.17 4,10.57 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,10.57 19.61,9.17 18.88,7.94L20.34,6.5C21.42,8.12 22,10.04 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12C2,10.04 2.58,8.12 3.66,6.5M12,6A6,6 0 0,1 18,12C18,13.59 17.37,15.12 16.24,16.24L14.83,14.83C14.08,15.58 13.06,16 12,16C10.94,16 9.92,15.58 9.17,14.83L7.76,16.24C6.63,15.12 6,13.59 6,12A6,6 0 0,1 12,6M12,8A1,1 0 0,0 11,9A1,1 0 0,0 12,10A1,1 0 0,0 13,9A1,1 0 0,0 12,8Z";
var mdiRobotVacuumVariant = "M5,3A2,2 0 0,0 3,5V7H5V5H19V7H21V5A2,2 0 0,0 19,3H5M8,7V9H16V7H8M3,9V12A9,9 0 0,0 12,21A9,9 0 0,0 21,12V9H19V12A7,7 0 0,1 12,19A7,7 0 0,1 5,12V9H3M12,12A2.5,2.5 0 0,0 9.5,14.5A2.5,2.5 0 0,0 12,17A2.5,2.5 0 0,0 14.5,14.5A2.5,2.5 0 0,0 12,12Z";
var mdiRouterWireless = "M20.2,5.9L21,5.1C19.6,3.7 17.8,3 16,3C14.2,3 12.4,3.7 11,5.1L11.8,5.9C13,4.8 14.5,4.2 16,4.2C17.5,4.2 19,4.8 20.2,5.9M19.3,6.7C18.4,5.8 17.2,5.3 16,5.3C14.8,5.3 13.6,5.8 12.7,6.7L13.5,7.5C14.2,6.8 15.1,6.5 16,6.5C16.9,6.5 17.8,6.8 18.5,7.5L19.3,6.7M19,13H17V9H15V13H5A2,2 0 0,0 3,15V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V15A2,2 0 0,0 19,13M8,18H6V16H8V18M11.5,18H9.5V16H11.5V18M15,18H13V16H15V18Z";
var mdiRun = "M13.5,5.5C14.59,5.5 15.5,4.58 15.5,3.5C15.5,2.38 14.59,1.5 13.5,1.5C12.39,1.5 11.5,2.38 11.5,3.5C11.5,4.58 12.39,5.5 13.5,5.5M9.89,19.38L10.89,15L13,17V23H15V15.5L12.89,13.5L13.5,10.5C14.79,12 16.79,13 19,13V11C17.09,11 15.5,10 14.69,8.58L13.69,7C13.29,6.38 12.69,6 12,6C11.69,6 11.5,6.08 11.19,6.08L6,8.28V13H8V9.58L9.79,8.88L8.19,17L3.29,16L2.89,18L9.89,19.38Z";
var mdiSeat = "M4,18V21H7V18H17V21H20V15H4V18M19,10H22V13H19V10M2,10H5V13H2V10M17,13H7V5A2,2 0 0,1 9,3H15A2,2 0 0,1 17,5V13Z";
var mdiSeatOutline = "M15,5V12H9V5H15M15,3H9A2,2 0 0,0 7,5V14H17V5A2,2 0 0,0 15,3M22,10H19V13H22V10M5,10H2V13H5V10M20,15H4V21H6V17H18V21H20V15Z";
var mdiServer = "M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M5,3V5H7V3H5M5,11V13H7V11H5M5,19V21H7V19H5Z";
var mdiShieldCheck = "M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z";
var mdiShieldHome = "M11,13H13V16H16V11H18L12,6L6,11H8V16H11V13M12,1L21,5V11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1Z";
var mdiShieldHomeOutline = "M21,11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1L21,5V11M12,21C15.75,20 19,15.54 19,11.22V6.3L12,3.18L5,6.3V11.22C5,15.54 8.25,20 12,21M11,14H13V17H16V12H18L12,7L6,12H8V17H11V14";
var mdiShuffle = "M14.83,13.41L13.42,14.82L16.55,17.95L14.5,20H20V14.5L17.96,16.54L14.83,13.41M14.5,4L16.54,6.04L4,18.59L5.41,20L17.96,7.46L20,9.5V4M10.59,9.17L5.41,4L4,5.41L9.17,10.58L10.59,9.17Z";
var mdiSilverwareForkKnife = "M11,9H9V2H7V9H5V2H3V9C3,11.12 4.66,12.84 6.75,12.97V22H9.25V12.97C11.34,12.84 13,11.12 13,9V2H11V9M16,6V14H18.5V22H21V2C18.24,2 16,4.24 16,6Z";
var mdiSkipBackward = "M20,5V19L13,12M6,5V19H4V5M13,5V19L6,12";
var mdiSkipForward = "M4,5V19L11,12M18,5V19H20V5M11,5V19L18,12";
var mdiSkipNext = "M16,18H18V6H16M6,18L14.5,12L6,6V18Z";
var mdiSkipPrevious = "M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z";
var mdiSleep = "M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z";
var mdiSleepOff = "M2,5.27L3.28,4L20,20.72L18.73,22L12.73,16H9V14L9.79,13.06L2,5.27M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M9.82,8H15V10L13.54,11.72L9.82,8M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z";
var mdiSnowflake = "M20.79,13.95L18.46,14.57L16.46,13.44V10.56L18.46,9.43L20.79,10.05L21.31,8.12L19.54,7.65L20,5.88L18.07,5.36L17.45,7.69L15.45,8.82L13,7.38V5.12L14.71,3.41L13.29,2L12,3.29L10.71,2L9.29,3.41L11,5.12V7.38L8.5,8.82L6.5,7.69L5.92,5.36L4,5.88L4.47,7.65L2.7,8.12L3.22,10.05L5.55,9.43L7.55,10.56V13.45L5.55,14.58L3.22,13.96L2.7,15.89L4.47,16.36L4,18.12L5.93,18.64L6.55,16.31L8.55,15.18L11,16.62V18.88L9.29,20.59L10.71,22L12,20.71L13.29,22L14.7,20.59L13,18.88V16.62L15.5,15.17L17.5,16.3L18.12,18.63L20,18.12L19.53,16.35L21.3,15.88L20.79,13.95M9.5,10.56L12,9.11L14.5,10.56V13.44L12,14.89L9.5,13.44V10.56Z";
var mdiSofa = "M12.5 7C12.5 5.89 13.39 5 14.5 5H18C19.1 5 20 5.9 20 7V9.16C18.84 9.57 18 10.67 18 11.97V14H12.5V7M6 11.96V14H11.5V7C11.5 5.89 10.61 5 9.5 5H6C4.9 5 4 5.9 4 7V9.15C5.16 9.56 6 10.67 6 11.96M20.66 10.03C19.68 10.19 19 11.12 19 12.12V15H5V12C5 10.9 4.11 10 3 10S1 10.9 1 12V17C1 18.1 1.9 19 3 19V21H5V19H19V21H21V19C22.1 19 23 18.1 23 17V12C23 10.79 21.91 9.82 20.66 10.03Z";
var mdiSofaOutline = "M21 9V7C21 5.35 19.65 4 18 4H14C13.23 4 12.53 4.3 12 4.78C11.47 4.3 10.77 4 10 4H6C4.35 4 3 5.35 3 7V9C1.35 9 0 10.35 0 12V17C0 18.65 1.35 20 3 20V22H5V20H19V22H21V20C22.65 20 24 18.65 24 17V12C24 10.35 22.65 9 21 9M14 6H18C18.55 6 19 6.45 19 7V9.78C18.39 10.33 18 11.12 18 12V14H13V7C13 6.45 13.45 6 14 6M5 7C5 6.45 5.45 6 6 6H10C10.55 6 11 6.45 11 7V14H6V12C6 11.12 5.61 10.33 5 9.78V7M22 17C22 17.55 21.55 18 21 18H3C2.45 18 2 17.55 2 17V12C2 11.45 2.45 11 3 11S4 11.45 4 12V16H20V12C20 11.45 20.45 11 21 11S22 11.45 22 12V17Z";
var mdiSonyPlaystation = "M9.5,4.27C10.88,4.53 12.9,5.14 14,5.5C16.75,6.45 17.69,7.63 17.69,10.29C17.69,12.89 16.09,13.87 14.05,12.89V8.05C14.05,7.5 13.95,6.97 13.41,6.82C13,6.69 12.76,7.07 12.76,7.63V19.73L9.5,18.69V4.27M13.37,17.62L18.62,15.75C19.22,15.54 19.31,15.24 18.83,15.08C18.34,14.92 17.47,14.97 16.87,15.18L13.37,16.41V14.45L13.58,14.38C13.58,14.38 14.59,14 16,13.87C17.43,13.71 19.17,13.89 20.53,14.4C22.07,14.89 22.25,15.61 21.86,16.1C21.46,16.6 20.5,16.95 20.5,16.95L13.37,19.5V17.62M3.5,17.42C1.93,17 1.66,16.05 2.38,15.5C3.05,15 4.18,14.65 4.18,14.65L8.86,13V14.88L5.5,16.09C4.9,16.3 4.81,16.6 5.29,16.76C5.77,16.92 6.65,16.88 7.24,16.66L8.86,16.08V17.77L8.54,17.83C6.92,18.09 5.2,18 3.5,17.42Z";
var mdiSort = "M18 21L14 17H17V7H14L18 3L22 7H19V17H22M2 19V17H12V19M2 13V11H9V13M2 7V5H6V7H2Z";
var mdiSoundbar = "M4 8C2.9 8 2 8.9 2 10V14C2 15.11 2.9 16 4 16H20C21.11 16 22 15.11 22 14V10C22 8.9 21.11 8 20 8M9 10C10.11 10 11 10.9 11 12C11 13.11 10.11 14 9 14C7.9 14 7 13.11 7 12C7 10.9 7.9 10 9 10M15 10C16.11 10 17 10.9 17 12C17 13.11 16.11 14 15 14C13.9 14 13 13.11 13 12C13 10.9 13.9 10 15 10M5 11C5.55 11 6 11.45 6 12C6 12.55 5.55 13 5 13C4.45 13 4 12.55 4 12C4 11.45 4.45 11 5 11M9 11C8.45 11 8 11.45 8 12C8 12.55 8.45 13 9 13C9.55 13 10 12.55 10 12C10 11.45 9.55 11 9 11M15 11C14.45 11 14 11.45 14 12C14 12.55 14.45 13 15 13C15.55 13 16 12.55 16 12C16 11.45 15.55 11 15 11M19 11C19.55 11 20 11.45 20 12C20 12.55 19.55 13 19 13C18.45 13 18 12.55 18 12C18 11.45 18.45 11 19 11Z";
var mdiSpeaker = "M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12M12,20A5,5 0 0,1 7,15A5,5 0 0,1 12,10A5,5 0 0,1 17,15A5,5 0 0,1 12,20M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8C10.89,8 10,7.1 10,6C10,4.89 10.89,4 12,4M17,2H7C5.89,2 5,2.89 5,4V20A2,2 0 0,0 7,22H17A2,2 0 0,0 19,20V4C19,2.89 18.1,2 17,2Z";
var mdiSpeakerOff = "M2,5.27L3.28,4L21,21.72L19.73,23L18.27,21.54C17.93,21.83 17.5,22 17,22H7C5.89,22 5,21.1 5,20V8.27L2,5.27M12,18A3,3 0 0,1 9,15C9,14.24 9.28,13.54 9.75,13L8.33,11.6C7.5,12.5 7,13.69 7,15A5,5 0 0,0 12,20C13.31,20 14.5,19.5 15.4,18.67L14,17.25C13.45,17.72 12.76,18 12,18M17,15A5,5 0 0,0 12,10H11.82L5.12,3.3C5.41,2.54 6.14,2 7,2H17A2,2 0 0,1 19,4V17.18L17,15.17V15M12,4C10.89,4 10,4.89 10,6A2,2 0 0,0 12,8A2,2 0 0,0 14,6C14,4.89 13.1,4 12,4Z";
var mdiSpeakerWireless = "M20.07,19.07L18.66,17.66C20.11,16.22 21,14.21 21,12C21,9.78 20.11,7.78 18.66,6.34L20.07,4.93C21.88,6.74 23,9.24 23,12C23,14.76 21.88,17.26 20.07,19.07M17.24,16.24L15.83,14.83C16.55,14.11 17,13.11 17,12C17,10.89 16.55,9.89 15.83,9.17L17.24,7.76C18.33,8.85 19,10.35 19,12C19,13.65 18.33,15.15 17.24,16.24M4,3H12A2,2 0 0,1 14,5V19A2,2 0 0,1 12,21H4A2,2 0 0,1 2,19V5A2,2 0 0,1 4,3M8,5A2,2 0 0,0 6,7A2,2 0 0,0 8,9A2,2 0 0,0 10,7A2,2 0 0,0 8,5M8,11A4,4 0 0,0 4,15A4,4 0 0,0 8,19A4,4 0 0,0 12,15A4,4 0 0,0 8,11M8,13A2,2 0 0,1 10,15A2,2 0 0,1 8,17A2,2 0 0,1 6,15A2,2 0 0,1 8,13Z";
var mdiSpotify = "M17.9,10.9C14.7,9 9.35,8.8 6.3,9.75C5.8,9.9 5.3,9.6 5.15,9.15C5,8.65 5.3,8.15 5.75,8C9.3,6.95 15.15,7.15 18.85,9.35C19.3,9.6 19.45,10.2 19.2,10.65C18.95,11 18.35,11.15 17.9,10.9M17.8,13.7C17.55,14.05 17.1,14.2 16.75,13.95C14.05,12.3 9.95,11.8 6.8,12.8C6.4,12.9 5.95,12.7 5.85,12.3C5.75,11.9 5.95,11.45 6.35,11.35C10,10.25 14.5,10.8 17.6,12.7C17.9,12.85 18.05,13.35 17.8,13.7M16.6,16.45C16.4,16.75 16.05,16.85 15.75,16.65C13.4,15.2 10.45,14.9 6.95,15.7C6.6,15.8 6.3,15.55 6.2,15.25C6.1,14.9 6.35,14.6 6.65,14.5C10.45,13.65 13.75,14 16.35,15.6C16.7,15.75 16.75,16.15 16.6,16.45M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";
var mdiSquare = "M3,3V21H21V3";
var mdiSquareOutline = "M3,3H21V21H3V3M5,5V19H19V5H5Z";
var mdiStar = "M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z";
var mdiStarOutline = "M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z";
var mdiStop = "M18,18H6V6H18V18Z";
var mdiStopCircle = "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M9,9H15V15H9";
var mdiStopCircleOutline = "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4M9,9V15H15V9";
var mdiStove = "M6,14H8L11,17H9L6,14M4,4H5V3A1,1 0 0,1 6,2H10A1,1 0 0,1 11,3V4H13V3A1,1 0 0,1 14,2H18A1,1 0 0,1 19,3V4H20A2,2 0 0,1 22,6V19A2,2 0 0,1 20,21V22H17V21H7V22H4V21A2,2 0 0,1 2,19V6A2,2 0 0,1 4,4M18,7A1,1 0 0,1 19,8A1,1 0 0,1 18,9A1,1 0 0,1 17,8A1,1 0 0,1 18,7M14,7A1,1 0 0,1 15,8A1,1 0 0,1 14,9A1,1 0 0,1 13,8A1,1 0 0,1 14,7M20,6H4V10H20V6M4,19H20V12H4V19M6,7A1,1 0 0,1 7,8A1,1 0 0,1 6,9A1,1 0 0,1 5,8A1,1 0 0,1 6,7M13,14H15L18,17H16L13,14Z";
var mdiSubtitles = "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,12H8V14H4V12M14,18H4V16H14V18M20,18H16V16H20V18M20,14H10V12H20V14Z";
var mdiSubtitlesOutline = "M20,4A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20M20,18V6H4V18H20M6,10H8V12H6V10M6,14H14V16H6V14M16,14H18V16H16V14M10,10H18V12H10V10Z";
var mdiSurroundSound = "M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M7.76,16.24L6.35,17.65C4.78,16.1 4,14.05 4,12C4,9.95 4.78,7.9 6.34,6.34L7.75,7.75C6.59,8.93 6,10.46 6,12C6,13.54 6.59,15.07 7.76,16.24M12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16M17.66,17.66L16.25,16.25C17.41,15.07 18,13.54 18,12C18,10.46 17.41,8.93 16.24,7.76L17.65,6.35C19.22,7.9 20,9.95 20,12C20,14.05 19.22,16.1 17.66,17.66M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10Z";
var mdiSync = "M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z";
var mdiTablet = "M19,18H5V6H19M21,4H3C1.89,4 1,4.89 1,6V18A2,2 0 0,0 3,20H21A2,2 0 0,0 23,18V6C23,4.89 22.1,4 21,4Z";
var mdiTelevision = "M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z";
var mdiTelevisionClassic = "M8.16,3L6.75,4.41L9.34,7H4C2.89,7 2,7.89 2,9V19C2,20.11 2.89,21 4,21H20C21.11,21 22,20.11 22,19V9C22,7.89 21.11,7 20,7H14.66L17.25,4.41L15.84,3L12,6.84L8.16,3M4,9H17V19H4V9M19.5,9A1,1 0 0,1 20.5,10A1,1 0 0,1 19.5,11A1,1 0 0,1 18.5,10A1,1 0 0,1 19.5,9M19.5,12A1,1 0 0,1 20.5,13A1,1 0 0,1 19.5,14A1,1 0 0,1 18.5,13A1,1 0 0,1 19.5,12Z";
var mdiTelevisionGuide = "M21,17V5H3V17H21M21,3A2,2 0 0,1 23,5V17A2,2 0 0,1 21,19H16V21H8V19H3A2,2 0 0,1 1,17V5A2,2 0 0,1 3,3H21M5,7H11V11H5V7M5,13H11V15H5V13M13,7H19V9H13V7M13,11H19V15H13V11Z";
var mdiTelevisionOff = "M0.5,2.77L1.78,1.5L21,20.72L19.73,22L16.73,19H16V21H8V19H3A2,2 0 0,1 1,17V5C1,4.5 1.17,4.07 1.46,3.73L0.5,2.77M21,17V5H7.82L5.82,3H21A2,2 0 0,1 23,5V17C23,17.85 22.45,18.59 21.7,18.87L19.82,17H21M3,17H14.73L3,5.27V17Z";
var mdiTelevisionPlay = "M21,3H3C1.89,3 1,3.89 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5C23,3.89 22.1,3 21,3M21,17H3V5H21M16,11L9,15V7";
var mdiText = "M21,6V8H3V6H21M3,18H12V16H3V18M3,13H21V11H3V13Z";
var mdiThermometer = "M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z";
var mdiThermostat = "M16.95,16.95L14.83,14.83C15.55,14.1 16,13.1 16,12C16,11.26 15.79,10.57 15.43,10L17.6,7.81C18.5,9 19,10.43 19,12C19,13.93 18.22,15.68 16.95,16.95M12,5C13.57,5 15,5.5 16.19,6.4L14,8.56C13.43,8.21 12.74,8 12,8A4,4 0 0,0 8,12C8,13.1 8.45,14.1 9.17,14.83L7.05,16.95C5.78,15.68 5,13.93 5,12A7,7 0 0,1 12,5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z";
var mdiTimer = "M19.03 7.39L20.45 5.97C20 5.46 19.55 5 19.04 4.56L17.62 6C16.07 4.74 14.12 4 12 4C7.03 4 3 8.03 3 13S7.03 22 12 22C17 22 21 17.97 21 13C21 10.88 20.26 8.93 19.03 7.39M13 14H11V7H13V14M15 1H9V3H15V1Z";
var mdiTimerOutline = "M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z";
var mdiToggleSwitch = "M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M17,15A3,3 0 0,1 14,12A3,3 0 0,1 17,9A3,3 0 0,1 20,12A3,3 0 0,1 17,15Z";
var mdiToggleSwitchOff = "M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M7,15A3,3 0 0,1 4,12A3,3 0 0,1 7,9A3,3 0 0,1 10,12A3,3 0 0,1 7,15Z";
var mdiTranslate = "M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z";
var mdiTriangle = "M1,21H23L12,2";
var mdiTriangleOutline = "M12,2L1,21H23M12,6L19.53,19H4.47";
var mdiTune = "M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z";
var mdiTuneVertical = "M7 3H5V9H7V3M19 3H17V13H19V3M3 13H5V21H7V13H9V11H3V13M15 7H13V3H11V7H9V9H15V7M11 21H13V11H11V21M15 15V17H17V21H19V17H21V15H15Z";
var mdiTwitch = "M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z";
var mdiUmbrella = "M12,2A9,9 0 0,1 21,11H13V19A3,3 0 0,1 10,22A3,3 0 0,1 7,19V18H9V19A1,1 0 0,0 10,20A1,1 0 0,0 11,19V11H3A9,9 0 0,1 12,2Z";
var mdiUndo = "M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z";
var mdiUsb = "M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.78,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13A2,2 0 0,0 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20A2.2,2.2 0 0,0 12,22.2A2.2,2.2 0 0,0 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16A2,2 0 0,0 18,13V11H19V7H15Z";
var mdiVideo = "M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z";
var mdiVideoInputAntenna = "M12,5A7,7 0 0,0 5,12H7A5,5 0 0,1 12,7A5,5 0 0,1 17,12H19A7,7 0 0,0 12,5M13,14.29C13.88,13.9 14.5,13.03 14.5,12A2.5,2.5 0 0,0 12,9.5A2.5,2.5 0 0,0 9.5,12C9.5,13 10.12,13.9 11,14.29V17.59L7.59,21L9,22.41L12,19.41L15,22.41L16.41,21L13,17.59V14.29M12,1A11,11 0 0,0 1,12H3A9,9 0 0,1 12,3A9,9 0 0,1 21,12H23A11,11 0 0,0 12,1Z";
var mdiVideoInputComponent = "M5,2A1,1 0 0,0 4,1A1,1 0 0,0 3,2V6H1V12H7V6H5V2M9,16C9,17.3 9.84,18.4 11,18.82V23H13V18.82C14.16,18.41 15,17.31 15,16V14H9V16M1,16C1,17.3 1.84,18.4 3,18.82V23H5V18.82C6.16,18.4 7,17.3 7,16V14H1V16M21,6V2A1,1 0 0,0 20,1A1,1 0 0,0 19,2V6H17V12H23V6H21M13,2A1,1 0 0,0 12,1A1,1 0 0,0 11,2V6H9V12H15V6H13V2M17,16C17,17.3 17.84,18.4 19,18.82V23H21V18.82C22.16,18.41 23,17.31 23,16V14H17V16Z";
var mdiVideoInputHdmi = "M18,7V4A2,2 0 0,0 16,2H8A2,2 0 0,0 6,4V7H5V13L8,19V22H16V19L19,13V7H18M8,4H16V7H14V5H13V7H11V5H10V7H8V4Z";
var mdiVideoInputSvideo = "M8,11.5A1.5,1.5 0 0,0 6.5,10A1.5,1.5 0 0,0 5,11.5A1.5,1.5 0 0,0 6.5,13A1.5,1.5 0 0,0 8,11.5M15,6.5A1.5,1.5 0 0,0 13.5,5H10.5A1.5,1.5 0 0,0 9,6.5A1.5,1.5 0 0,0 10.5,8H13.5A1.5,1.5 0 0,0 15,6.5M8.5,15A1.5,1.5 0 0,0 7,16.5A1.5,1.5 0 0,0 8.5,18A1.5,1.5 0 0,0 10,16.5A1.5,1.5 0 0,0 8.5,15M12,1A11,11 0 0,0 1,12A11,11 0 0,0 12,23A11,11 0 0,0 23,12A11,11 0 0,0 12,1M12,21C7.04,21 3,16.96 3,12C3,7.04 7.04,3 12,3C16.96,3 21,7.04 21,12C21,16.96 16.96,21 12,21M17.5,10A1.5,1.5 0 0,0 16,11.5A1.5,1.5 0 0,0 17.5,13A1.5,1.5 0 0,0 19,11.5A1.5,1.5 0 0,0 17.5,10M15.5,15A1.5,1.5 0 0,0 14,16.5A1.5,1.5 0 0,0 15.5,18A1.5,1.5 0 0,0 17,16.5A1.5,1.5 0 0,0 15.5,15Z";
var mdiVideoOff = "M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16C16.2,18 16.39,17.92 16.54,17.82L19.73,21L21,19.73M21,6.5L17,10.5V7A1,1 0 0,0 16,6H9.82L21,17.18V6.5Z";
var mdiVideoVintage = "M18,14.5V11A1,1 0 0,0 17,10H16C18.24,8.39 18.76,5.27 17.15,3C15.54,0.78 12.42,0.26 10.17,1.87C9.5,2.35 8.96,3 8.6,3.73C6.25,2.28 3.17,3 1.72,5.37C0.28,7.72 1,10.8 3.36,12.25C3.57,12.37 3.78,12.5 4,12.58V21A1,1 0 0,0 5,22H17A1,1 0 0,0 18,21V17.5L22,21.5V10.5L18,14.5M13,4A2,2 0 0,1 15,6A2,2 0 0,1 13,8A2,2 0 0,1 11,6A2,2 0 0,1 13,4M6,6A2,2 0 0,1 8,8A2,2 0 0,1 6,10A2,2 0 0,1 4,8A2,2 0 0,1 6,6Z";
var mdiVolumeHigh = "M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z";
var mdiVolumeLow = "M7,9V15H11L16,20V4L11,9H7Z";
var mdiVolumeMedium = "M5,9V15H9L14,20V4L9,9M18.5,12C18.5,10.23 17.5,8.71 16,7.97V16C17.5,15.29 18.5,13.76 18.5,12Z";
var mdiVolumeMinus = "M3,9H7L12,4V20L7,15H3V9M14,11H22V13H14V11Z";
var mdiVolumeMute = "M3,9H7L12,4V20L7,15H3V9M16.59,12L14,9.41L15.41,8L18,10.59L20.59,8L22,9.41L19.41,12L22,14.59L20.59,16L18,13.41L15.41,16L14,14.59L16.59,12Z";
var mdiVolumeOff = "M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z";
var mdiVolumePlus = "M3,9H7L12,4V20L7,15H3V9M14,11H17V8H19V11H22V13H19V16H17V13H14V11Z";
var mdiVolumeVariantOff = "M5.64,3.64L21.36,19.36L19.95,20.78L16,16.83V20L11,15H7V9H8.17L4.22,5.05L5.64,3.64M16,4V11.17L12.41,7.58L16,4Z";
var mdiWalk = "M14.12,10H19V8.2H15.38L13.38,4.87C13.08,4.37 12.54,4.03 11.92,4.03C11.74,4.03 11.58,4.06 11.42,4.11L6,5.8V11H7.8V7.33L9.91,6.67L6,22H7.8L10.67,13.89L13,17V22H14.8V15.59L12.31,11.05L13.04,8.18M14,3.8C15,3.8 15.8,3 15.8,2C15.8,1 15,0.2 14,0.2C13,0.2 12.2,1 12.2,2C12.2,3 13,3.8 14,3.8Z";
var mdiWashingMachine = "M14.83,11.17C16.39,12.73 16.39,15.27 14.83,16.83C13.27,18.39 10.73,18.39 9.17,16.83L14.83,11.17M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M7,4A1,1 0 0,0 6,5A1,1 0 0,0 7,6A1,1 0 0,0 8,5A1,1 0 0,0 7,4M10,4A1,1 0 0,0 9,5A1,1 0 0,0 10,6A1,1 0 0,0 11,5A1,1 0 0,0 10,4M12,8A6,6 0 0,0 6,14A6,6 0 0,0 12,20A6,6 0 0,0 18,14A6,6 0 0,0 12,8Z";
var mdiWater = "M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z";
var mdiWaterOff = "M20.84 22.73L16.29 18.18C15.2 19.3 13.69 20 12 20C8.69 20 6 17.31 6 14C6 12.67 6.67 11.03 7.55 9.44L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M18 14C18 10 12 3.25 12 3.25S10.84 4.55 9.55 6.35L17.95 14.75C18 14.5 18 14.25 18 14Z";
var mdiWeatherCloudy = "M6,19A5,5 0 0,1 1,14A5,5 0 0,1 6,9C7,6.65 9.3,5 12,5C15.43,5 18.24,7.66 18.5,11.03L19,11A4,4 0 0,1 23,15A4,4 0 0,1 19,19H6M19,13H17V12A5,5 0 0,0 12,7C9.5,7 7.45,8.82 7.06,11.19C6.73,11.07 6.37,11 6,11A3,3 0 0,0 3,14A3,3 0 0,0 6,17H19A2,2 0 0,0 21,15A2,2 0 0,0 19,13Z";
var mdiWeatherNight = "M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z";
var mdiWeatherRainy = "M6,14.03A1,1 0 0,1 7,15.03C7,15.58 6.55,16.03 6,16.03C3.24,16.03 1,13.79 1,11.03C1,8.27 3.24,6.03 6,6.03C7,3.68 9.3,2.03 12,2.03C15.43,2.03 18.24,4.69 18.5,8.06L19,8.03A4,4 0 0,1 23,12.03C23,14.23 21.21,16.03 19,16.03H18C17.45,16.03 17,15.58 17,15.03C17,14.47 17.45,14.03 18,14.03H19A2,2 0 0,0 21,12.03A2,2 0 0,0 19,10.03H17V9.03C17,6.27 14.76,4.03 12,4.03C9.5,4.03 7.45,5.84 7.06,8.21C6.73,8.09 6.37,8.03 6,8.03A3,3 0 0,0 3,11.03A3,3 0 0,0 6,14.03M12,14.15C12.18,14.39 12.37,14.66 12.56,14.94C13,15.56 14,17.03 14,18C14,19.11 13.1,20 12,20A2,2 0 0,1 10,18C10,17.03 11,15.56 11.44,14.94C11.63,14.66 11.82,14.4 12,14.15M12,11.03L11.5,11.59C11.5,11.59 10.65,12.55 9.79,13.81C8.93,15.06 8,16.56 8,18A4,4 0 0,0 12,22A4,4 0 0,0 16,18C16,16.56 15.07,15.06 14.21,13.81C13.35,12.55 12.5,11.59 12.5,11.59";
var mdiWeatherSunny = "M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z";
var mdiWifi = "M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z";
var mdiWifiOff = "M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z";
var mdiWindowClosed = "M6,11H10V9H14V11H18V4H6V11M18,13H6V20H18V13M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2Z";
var mdiWindowOpen = "M6,8H10V6H14V8H18V4H6V8M18,10H6V15H18V10M6,20H18V17H6V20M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2Z";
var mdiWindowShutter = "M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9M8 12H16V14H8V12M8 15H16V17H8V15M8 18H16V20H8V18Z";
var mdiWindowShutterOpen = "M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9Z";
var mdiWrench = "M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z";
var mdiYoutube = "M10,15L15.19,12L10,9V15M21.56,7.17C21.69,7.64 21.78,8.27 21.84,9.07C21.91,9.87 21.94,10.56 21.94,11.16L22,12C22,14.19 21.84,15.8 21.56,16.83C21.31,17.73 20.73,18.31 19.83,18.56C19.36,18.69 18.5,18.78 17.18,18.84C15.88,18.91 14.69,18.94 13.59,18.94L12,19C7.81,19 5.2,18.84 4.17,18.56C3.27,18.31 2.69,17.73 2.44,16.83C2.31,16.36 2.22,15.73 2.16,14.93C2.09,14.13 2.06,13.44 2.06,12.84L2,12C2,9.81 2.16,8.2 2.44,7.17C2.69,6.27 3.27,5.69 4.17,5.44C4.64,5.31 5.5,5.22 6.82,5.16C8.12,5.09 9.31,5.06 10.41,5.06L12,5C16.19,5 18.8,5.16 19.83,5.44C20.73,5.69 21.31,6.27 21.56,7.17Z";
var mdiYoutubeTv = "M2.5,4.5H21.5C22.34,4.5 23,5.15 23,6V17.5C23,18.35 22.34,19 21.5,19H2.5C1.65,19 1,18.35 1,17.5V6C1,5.15 1.65,4.5 2.5,4.5M9.71,8.5V15L15.42,11.7L9.71,8.5M17.25,21H6.65C6.35,21 6.15,20.8 6.15,20.5C6.15,20.2 6.35,20 6.65,20H17.35C17.65,20 17.85,20.2 17.85,20.5C17.85,20.8 17.55,21 17.25,21Z";

// remote-card/src/shims/mdi-icons.ts
var MDI_ICON_PATHS = {
  "account": mdiAccount,
  "account-group": mdiAccountGroup,
  "air-conditioner": mdiAirConditioner,
  "alarm-light": mdiAlarmLight,
  "album": mdiAlbum,
  "alert": mdiAlert,
  "alert-circle": mdiAlertCircle,
  "alert-circle-outline": mdiAlertCircleOutline,
  "alert-outline": mdiAlertOutline,
  "alpha-a-circle-outline": mdiAlphaACircleOutline,
  "alpha-b-circle-outline": mdiAlphaBCircleOutline,
  "alpha-c-circle-outline": mdiAlphaCCircleOutline,
  "amplifier": mdiAmplifier,
  "apple": mdiApple,
  "arrow-down": mdiArrowDown,
  "arrow-down-bold": mdiArrowDownBold,
  "arrow-left": mdiArrowLeft,
  "arrow-left-bold": mdiArrowLeftBold,
  "arrow-left-top": mdiArrowLeftTop,
  "arrow-right": mdiArrowRight,
  "arrow-right-bold": mdiArrowRightBold,
  "arrow-u-left-top": mdiArrowULeftTop,
  "arrow-up": mdiArrowUp,
  "arrow-up-bold": mdiArrowUpBold,
  "audio-video": mdiAudioVideo,
  "audio-video-off": mdiAudioVideoOff,
  "backspace": mdiBackspace,
  "bed": mdiBed,
  "bed-outline": mdiBedOutline,
  "bell": mdiBell,
  "bell-off": mdiBellOff,
  "bell-ring": mdiBellRing,
  "blinds": mdiBlinds,
  "blinds-open": mdiBlindsOpen,
  "bluetooth": mdiBluetooth,
  "bluetooth-off": mdiBluetoothOff,
  "bookmark": mdiBookmark,
  "bookmark-outline": mdiBookmarkOutline,
  "brightness-1": mdiBrightness1,
  "brightness-2": mdiBrightness2,
  "brightness-3": mdiBrightness3,
  "brightness-4": mdiBrightness4,
  "brightness-5": mdiBrightness5,
  "brightness-6": mdiBrightness6,
  "brightness-7": mdiBrightness7,
  "broom": mdiBroom,
  "camera": mdiCamera,
  "camera-off": mdiCameraOff,
  "cancel": mdiCancel,
  "car": mdiCar,
  "car-key": mdiCarKey,
  "cast": mdiCast,
  "cast-connected": mdiCastConnected,
  "cast-off": mdiCastOff,
  "cctv": mdiCctv,
  "ceiling-light": mdiCeilingLight,
  "cellphone": mdiCellphone,
  "cellphone-wireless": mdiCellphoneWireless,
  "check": mdiCheck,
  "check-bold": mdiCheckBold,
  "check-circle": mdiCheckCircle,
  "check-circle-outline": mdiCheckCircleOutline,
  "chevron-double-down": mdiChevronDoubleDown,
  "chevron-double-left": mdiChevronDoubleLeft,
  "chevron-double-right": mdiChevronDoubleRight,
  "chevron-double-up": mdiChevronDoubleUp,
  "chevron-down": mdiChevronDown,
  "chevron-down-circle-outline": mdiChevronDownCircleOutline,
  "chevron-left": mdiChevronLeft,
  "chevron-right": mdiChevronRight,
  "chevron-up": mdiChevronUp,
  "chevron-up-circle-outline": mdiChevronUpCircleOutline,
  "circle": mdiCircle,
  "circle-outline": mdiCircleOutline,
  "clock": mdiClock,
  "clock-outline": mdiClockOutline,
  "close": mdiClose,
  "close-circle": mdiCloseCircle,
  "close-circle-outline": mdiCloseCircleOutline,
  "closed-caption": mdiClosedCaption,
  "closed-caption-outline": mdiClosedCaptionOutline,
  "coffee": mdiCoffee,
  "coffee-outline": mdiCoffeeOutline,
  "cog": mdiCog,
  "cog-outline": mdiCogOutline,
  "cogs": mdiCogs,
  "controller-classic": mdiControllerClassic,
  "controller-classic-outline": mdiControllerClassicOutline,
  "curtains": mdiCurtains,
  "curtains-closed": mdiCurtainsClosed,
  "desktop-tower": mdiDesktopTower,
  "disc": mdiDisc,
  "disc-player": mdiDiscPlayer,
  "dishwasher": mdiDishwasher,
  "door": mdiDoor,
  "door-closed": mdiDoorClosed,
  "door-open": mdiDoorOpen,
  "doorbell": mdiDoorbell,
  "dots-horizontal": mdiDotsHorizontal,
  "dots-vertical": mdiDotsVertical,
  "drag-vertical-variant": mdiDragVerticalVariant,
  "eye": mdiEye,
  "eye-off": mdiEyeOff,
  "fan": mdiFan,
  "fan-off": mdiFanOff,
  "fast-forward": mdiFastForward,
  "film": mdiFilm,
  "filmstrip": mdiFilmstrip,
  "fire": mdiFire,
  "fireplace": mdiFireplace,
  "fireplace-off": mdiFireplaceOff,
  "floor-lamp": mdiFloorLamp,
  "format-color-fill": mdiFormatColorFill,
  "fridge": mdiFridge,
  "fullscreen": mdiFullscreen,
  "fullscreen-exit": mdiFullscreenExit,
  "gamepad": mdiGamepad,
  "gamepad-variant": mdiGamepadVariant,
  "garage": mdiGarage,
  "garage-open": mdiGarageOpen,
  "gesture-double-tap": mdiGestureDoubleTap,
  "gesture-swipe": mdiGestureSwipe,
  "gesture-tap": mdiGestureTap,
  "gesture-tap-button": mdiGestureTapButton,
  "glass-cocktail": mdiGlassCocktail,
  "headphones": mdiHeadphones,
  "heart": mdiHeart,
  "heart-outline": mdiHeartOutline,
  "help-circle": mdiHelpCircle,
  "help-circle-outline": mdiHelpCircleOutline,
  "hexagon": mdiHexagon,
  "hexagon-outline": mdiHexagonOutline,
  "home": mdiHome,
  "home-assistant": mdiHomeAssistant,
  "home-automation": mdiHomeAutomation,
  "home-lightbulb": mdiHomeLightbulb,
  "home-outline": mdiHomeOutline,
  "home-thermometer": mdiHomeThermometer,
  "hulu": mdiHulu,
  "human-greeting": mdiHumanGreeting,
  "image": mdiImage,
  "image-multiple": mdiImageMultiple,
  "information": mdiInformation,
  "information-outline": mdiInformationOutline,
  "invert-colors": mdiInvertColors,
  "kettle": mdiKettle,
  "keyboard": mdiKeyboard,
  "keyboard-backspace": mdiKeyboardBackspace,
  "keyboard-return": mdiKeyboardReturn,
  "keyboard-space": mdiKeyboardSpace,
  "kodi": mdiKodi,
  "lamp": mdiLamp,
  "laptop": mdiLaptop,
  "led-strip": mdiLedStrip,
  "led-strip-variant": mdiLedStripVariant,
  "lightbulb": mdiLightbulb,
  "lightbulb-group": mdiLightbulbGroup,
  "lightbulb-group-off": mdiLightbulbGroupOff,
  "lightbulb-off": mdiLightbulbOff,
  "lightbulb-on": mdiLightbulbOn,
  "lightbulb-outline": mdiLightbulbOutline,
  "lock": mdiLock,
  "lock-open": mdiLockOpen,
  "lock-open-variant": mdiLockOpenVariant,
  "magnify": mdiMagnify,
  "magnify-minus": mdiMagnifyMinus,
  "magnify-plus": mdiMagnifyPlus,
  "menu": mdiMenu,
  "menu-down": mdiMenuDown,
  "menu-open": mdiMenuOpen,
  "menu-up": mdiMenuUp,
  "microsoft-xbox": mdiMicrosoftXbox,
  "microwave": mdiMicrowave,
  "minus": mdiMinus,
  "minus-box": mdiMinusBox,
  "minus-circle": mdiMinusCircle,
  "monitor": mdiMonitor,
  "motion-sensor": mdiMotionSensor,
  "movie": mdiMovie,
  "movie-open": mdiMovieOpen,
  "movie-roll": mdiMovieRoll,
  "music": mdiMusic,
  "music-box": mdiMusicBox,
  "music-box-outline": mdiMusicBoxOutline,
  "music-note": mdiMusicNote,
  "netflix": mdiNetflix,
  "nintendo-game-boy": mdiNintendoGameBoy,
  "nintendo-switch": mdiNintendoSwitch,
  "numeric": mdiNumeric,
  "palette": mdiPalette,
  "palette-outline": mdiPaletteOutline,
  "pause": mdiPause,
  "pause-circle": mdiPauseCircle,
  "pause-circle-outline": mdiPauseCircleOutline,
  "picture-in-picture-bottom-right": mdiPictureInPictureBottomRight,
  "play": mdiPlay,
  "play-circle": mdiPlayCircle,
  "play-circle-outline": mdiPlayCircleOutline,
  "play-pause": mdiPlayPause,
  "plex": mdiPlex,
  "plus": mdiPlus,
  "plus-box": mdiPlusBox,
  "plus-circle": mdiPlusCircle,
  "popcorn": mdiPopcorn,
  "power": mdiPower,
  "power-cycle": mdiPowerCycle,
  "power-off": mdiPowerOff,
  "power-on": mdiPowerOn,
  "power-sleep": mdiPowerSleep,
  "power-standby": mdiPowerStandby,
  "projector": mdiProjector,
  "projector-screen": mdiProjectorScreen,
  "radiator": mdiRadiator,
  "radio": mdiRadio,
  "radio-tower": mdiRadioTower,
  "record": mdiRecord,
  "record-rec": mdiRecordRec,
  "redo": mdiRedo,
  "refresh": mdiRefresh,
  "reload": mdiReload,
  "remote": mdiRemote,
  "remote-off": mdiRemoteOff,
  "remote-tv": mdiRemoteTv,
  "repeat": mdiRepeat,
  "repeat-once": mdiRepeatOnce,
  "rewind": mdiRewind,
  "rhombus": mdiRhombus,
  "rhombus-outline": mdiRhombusOutline,
  "robot": mdiRobot,
  "robot-vacuum": mdiRobotVacuum,
  "robot-vacuum-variant": mdiRobotVacuumVariant,
  "router-wireless": mdiRouterWireless,
  "run": mdiRun,
  "seat": mdiSeat,
  "seat-outline": mdiSeatOutline,
  "server": mdiServer,
  "shield-check": mdiShieldCheck,
  "shield-home": mdiShieldHome,
  "shield-home-outline": mdiShieldHomeOutline,
  "shuffle": mdiShuffle,
  "silverware-fork-knife": mdiSilverwareForkKnife,
  "skip-backward": mdiSkipBackward,
  "skip-forward": mdiSkipForward,
  "skip-next": mdiSkipNext,
  "skip-previous": mdiSkipPrevious,
  "sleep": mdiSleep,
  "sleep-off": mdiSleepOff,
  "snowflake": mdiSnowflake,
  "sofa": mdiSofa,
  "sofa-outline": mdiSofaOutline,
  "sony-playstation": mdiSonyPlaystation,
  "sort": mdiSort,
  "soundbar": mdiSoundbar,
  "speaker": mdiSpeaker,
  "speaker-off": mdiSpeakerOff,
  "speaker-wireless": mdiSpeakerWireless,
  "spotify": mdiSpotify,
  "square": mdiSquare,
  "square-outline": mdiSquareOutline,
  "star": mdiStar,
  "star-outline": mdiStarOutline,
  "stop": mdiStop,
  "stop-circle": mdiStopCircle,
  "stop-circle-outline": mdiStopCircleOutline,
  "stove": mdiStove,
  "subtitles": mdiSubtitles,
  "subtitles-outline": mdiSubtitlesOutline,
  "surround-sound": mdiSurroundSound,
  "sync": mdiSync,
  "tablet": mdiTablet,
  "television": mdiTelevision,
  "television-classic": mdiTelevisionClassic,
  "television-guide": mdiTelevisionGuide,
  "television-off": mdiTelevisionOff,
  "television-play": mdiTelevisionPlay,
  "text": mdiText,
  "thermometer": mdiThermometer,
  "thermostat": mdiThermostat,
  "timer": mdiTimer,
  "timer-outline": mdiTimerOutline,
  "toggle-switch": mdiToggleSwitch,
  "toggle-switch-off": mdiToggleSwitchOff,
  "translate": mdiTranslate,
  "triangle": mdiTriangle,
  "triangle-outline": mdiTriangleOutline,
  "tune": mdiTune,
  "tune-vertical": mdiTuneVertical,
  "twitch": mdiTwitch,
  "umbrella": mdiUmbrella,
  "undo": mdiUndo,
  "usb": mdiUsb,
  "video": mdiVideo,
  "video-input-antenna": mdiVideoInputAntenna,
  "video-input-component": mdiVideoInputComponent,
  "video-input-hdmi": mdiVideoInputHdmi,
  "video-input-svideo": mdiVideoInputSvideo,
  "video-off": mdiVideoOff,
  "video-vintage": mdiVideoVintage,
  "volume-high": mdiVolumeHigh,
  "volume-low": mdiVolumeLow,
  "volume-medium": mdiVolumeMedium,
  "volume-minus": mdiVolumeMinus,
  "volume-mute": mdiVolumeMute,
  "volume-off": mdiVolumeOff,
  "volume-plus": mdiVolumePlus,
  "volume-variant-off": mdiVolumeVariantOff,
  "walk": mdiWalk,
  "washing-machine": mdiWashingMachine,
  "water": mdiWater,
  "water-off": mdiWaterOff,
  "weather-cloudy": mdiWeatherCloudy,
  "weather-night": mdiWeatherNight,
  "weather-rainy": mdiWeatherRainy,
  "weather-sunny": mdiWeatherSunny,
  "wifi": mdiWifi,
  "wifi-off": mdiWifiOff,
  "window-closed": mdiWindowClosed,
  "window-open": mdiWindowOpen,
  "window-shutter": mdiWindowShutter,
  "window-shutter-open": mdiWindowShutterOpen,
  "wrench": mdiWrench,
  "youtube": mdiYoutube,
  "youtube-tv": mdiYoutubeTv
};

// remote-card/src/shims/ha-icon.ts
var FALLBACK_PATH = "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";
function mdiPathFor(icon) {
  const name = String(icon ?? "").trim().replace(/^mdi:/, "");
  if (!name) return null;
  return MDI_ICON_PATHS[name] ?? null;
}
var SbHaIcon = class extends HTMLElement {
  constructor() {
    super();
    this._rendered = null;
    this._shadow = this.attachShadow({ mode: "open" });
  }
  static get observedAttributes() {
    return ["icon"];
  }
  get icon() {
    return this.getAttribute("icon") ?? "";
  }
  set icon(value) {
    if (value == null || value === "") this.removeAttribute("icon");
    else this.setAttribute("icon", String(value));
  }
  connectedCallback() {
    this._render();
  }
  attributeChangedCallback() {
    this._render();
  }
  _render() {
    const icon = this.icon;
    if (this._rendered === icon) return;
    this._rendered = icon;
    const path = mdiPathFor(icon) ?? FALLBACK_PATH;
    this._shadow.innerHTML = `
      <style>
        :host {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: var(--mdc-icon-size, 24px);
          height: var(--mdc-icon-size, 24px);
          color: inherit;
          vertical-align: middle;
        }
        svg { width: 100%; height: 100%; fill: currentColor; display: block; }
      </style>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${path}"></path></svg>
    `;
  }
};
function defineHaIconShim() {
  if (!customElements.get("ha-icon")) customElements.define("ha-icon", SbHaIcon);
}

// remote-card/src/shims/ha-select.ts
var SbMwcListItem = class extends HTMLElement {
  constructor() {
    super(...arguments);
    this._value = null;
  }
  get value() {
    return this._value ?? this.getAttribute("value") ?? "";
  }
  set value(next) {
    this._value = next == null ? "" : String(next);
    this.setAttribute("value", this._value);
  }
};
var SbHaSelect = class extends HTMLElement {
  constructor() {
    super();
    this._labelEl = null;
    this._valueEl = null;
    this._trigger = null;
    this._menu = null;
    this._label = "";
    this._value = "";
    this._options = [];
    this._connected = false;
    this._onViewportChange = () => this._placeMenu();
    this._observer = new MutationObserver(() => this._syncOptions());
    this._shadow = this.attachShadow({ mode: "open" });
    this._shadow.innerHTML = `
      <style>
        :host { display: block; position: relative; }
        .label {
          font-size: 12px;
          color: var(--mdc-select-label-ink-color, rgba(0, 0, 0, 0.6));
          line-height: 1.2;
        }
        .trigger {
          width: 100%;
          border: 0;
          background: var(--ha-color-form-background, #f3f3f3);
          border-radius: var(--mdc-shape-small, 4px);
          min-height: 56px;
          padding: 10px 14px 8px 16px;
          color: var(--primary-text-color, #141414);
          font: inherit;
          text-align: left;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          grid-template-rows: auto auto;
          gap: 2px 10px;
          cursor: pointer;
          box-shadow: inset 0 -1px 0 var(--ha-color-border-neutral-loud, rgba(0, 0, 0, 0.55));
          transition: box-shadow 180ms ease-in-out;
        }
        /* HA's field lights its line on any focus (mouse included) and
           keeps it while the menu is open; the card's mode toggle mirrors
           the field through :focus-within and the open state, so the two
           must light together. */
        .trigger:focus,
        :host([open]) .trigger {
          outline: none;
          box-shadow: inset 0 -2px 0 var(--mdc-theme-primary, var(--primary-color, #009ac7));
        }
        .trigger:hover:not([disabled]) {
          background: color-mix(in srgb, var(--primary-text-color, #141414) 8%, var(--ha-color-form-background, #f3f3f3));
        }
        .trigger:active:not([disabled]) {
          background: color-mix(in srgb, var(--primary-text-color, #141414) 12%, var(--ha-color-form-background, #f3f3f3));
        }
        .trigger[disabled] { cursor: default; opacity: 0.6; }
        .value {
          font-size: 16px;
          line-height: 1.3;
          color: var(--primary-text-color, #141414);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .caret {
          grid-column: 2;
          grid-row: 1 / span 2;
          align-self: center;
          width: 24px;
          height: 24px;
          color: var(--secondary-text-color, #5e5e5e);
        }
        .caret svg { width: 100%; height: 100%; fill: currentColor; }
        /* Fixed, not absolute: the card clips the host (overflow: hidden
           ellipsizes long names and rounds the field), which would swallow
           an in-flow popup. HA's own select floats its menu surface the
           same way. Placed from the trigger's rect on open; see _placeMenu. */
        .menu {
          position: fixed;
          left: 0;
          top: 0;
          width: 0;
          box-sizing: border-box;
          display: none;
          max-height: 60vh;
          overflow-y: auto;
          background: var(--card-background-color, var(--mdc-theme-surface, #fff));
          border-radius: 12px;
          border: 1px solid var(--ha-color-border-neutral-quiet, var(--divider-color, #e6e6e6));
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08), 0 12px 28px rgba(0, 0, 0, 0.16);
          padding: 6px;
          z-index: 40;
        }
        :host([open]) .menu { display: block; }
        .option {
          width: 100%;
          border: 0;
          background: transparent;
          color: var(--primary-text-color, #141414);
          text-align: left;
          font: inherit;
          font-size: 16px;
          line-height: 1.3;
          padding: 12px 14px;
          border-radius: 8px;
          cursor: pointer;
        }
        .option:hover, .option:focus-visible {
          outline: none;
          background: var(--wa-color-neutral-fill-normal, var(--ha-color-fill-neutral-normal-resting, #e6e6e6));
        }
        .option[data-selected="true"] {
          background: var(--ha-color-fill-primary-quiet-resting, #eff9fe);
          color: var(--sb-select-selected-text, var(--primary-color, inherit));
        }
        .option + .option { margin-top: 2px; }
      </style>
      <button class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
        <span class="label"></span>
        <span class="value"></span>
        <span class="caret"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"></path></svg></span>
      </button>
      <div class="menu" role="listbox"></div>
    `;
    this._labelEl = this._shadow.querySelector(".label");
    this._valueEl = this._shadow.querySelector(".value");
    this._trigger = this._shadow.querySelector(".trigger");
    this._menu = this._shadow.querySelector(".menu");
  }
  static get observedAttributes() {
    return ["label", "disabled"];
  }
  connectedCallback() {
    if (!this._connected) {
      this._connected = true;
      this._trigger?.addEventListener("click", () => {
        if (this.disabled) return;
        if (this.hasAttribute("open")) this._closeMenu();
        else this._openMenu();
      });
      this._trigger?.addEventListener("keydown", (event) => {
        if (this.disabled) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (!this.hasAttribute("open")) this._openMenu();
          const buttons = Array.from(this._menu?.querySelectorAll(".option") ?? []);
          const index = Math.max(0, this._options.findIndex((option) => option.value === this._value));
          const next = event.key === "ArrowDown" ? Math.min(buttons.length - 1, index + 1) : Math.max(0, index - 1);
          buttons[next]?.focus();
        } else if (event.key === "Escape" && this.hasAttribute("open")) {
          event.preventDefault();
          this._closeMenu();
        }
      });
      this._shadow.addEventListener("focusout", (event) => {
        const next = event.relatedTarget;
        if (next && this._shadow.contains(next)) return;
        if (this.hasAttribute("open")) this._closeMenu();
      });
    }
    this._observer.observe(this, { childList: true, subtree: true, characterData: true });
    this._renderLabel();
    this._syncOptions();
  }
  disconnectedCallback() {
    this._observer.disconnect();
    this._closeMenu();
  }
  attributeChangedCallback(name) {
    if (name === "label") this._renderLabel();
    if (name === "disabled" && this._trigger) this._trigger.disabled = this.disabled;
  }
  get label() {
    return this._label || this.getAttribute("label") || "";
  }
  set label(value) {
    this._label = value == null ? "" : String(value);
    this._renderLabel();
  }
  get value() {
    return this._value;
  }
  set value(next) {
    this._value = next == null ? "" : String(next);
    this._renderValue();
    this._renderOptions();
  }
  get disabled() {
    return this.hasAttribute("disabled");
  }
  set disabled(next) {
    if (next) this.setAttribute("disabled", "");
    else this.removeAttribute("disabled");
    if (this._trigger) this._trigger.disabled = Boolean(next);
  }
  _renderLabel() {
    if (this._labelEl) this._labelEl.textContent = this.label;
  }
  _syncOptions() {
    const current = this._value;
    const items = Array.from(this.children);
    this._options = items.map((item) => ({
      value: String(item.value ?? item.getAttribute("value") ?? item.textContent ?? ""),
      label: (item.textContent ?? "").trim()
    }));
    if (!this._options.some((option) => option.value === current)) {
      this._value = this._options[0]?.value ?? "";
    }
    this._renderValue();
    this._renderOptions();
  }
  _renderValue() {
    if (!this._valueEl) return;
    const match = this._options.find((option) => option.value === this._value);
    this._valueEl.textContent = match?.label ?? this._value;
  }
  _renderOptions() {
    if (!this._menu) return;
    this._menu.textContent = "";
    for (const option of this._options) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.setAttribute("role", "option");
      button.textContent = option.label;
      button.dataset.selected = String(option.value === this._value);
      button.setAttribute("aria-selected", button.dataset.selected);
      button.addEventListener("click", () => {
        this._value = option.value;
        this._renderValue();
        this._renderOptions();
        this.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
        this.dispatchEvent(
          new CustomEvent("selected", { detail: { value: this._value }, bubbles: true, composed: true })
        );
        this._closeMenu();
        this._trigger?.focus();
      });
      this._menu.appendChild(button);
    }
  }
  _openMenu() {
    this.setAttribute("open", "");
    this._trigger?.setAttribute("aria-expanded", "true");
    this._placeMenu();
    window.addEventListener("scroll", this._onViewportChange, true);
    window.addEventListener("resize", this._onViewportChange);
    this.dispatchEvent(new Event("opened", { bubbles: true, composed: true }));
  }
  _closeMenu() {
    window.removeEventListener("scroll", this._onViewportChange, true);
    window.removeEventListener("resize", this._onViewportChange);
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    this._trigger?.setAttribute("aria-expanded", "false");
    this.dispatchEvent(new Event("closed", { bubbles: true, composed: true }));
  }
  /**
   * Put the fixed menu under the trigger. Measured as a delta from where
   * the menu lands at (0, 0): a transformed ancestor (the card animates
   * with one) makes itself the containing block for fixed descendants,
   * and a zoomed ancestor (the page's zoom= parameter) scales the length
   * units, so absolute viewport coordinates would be wrong in both cases.
   */
  _placeMenu() {
    const menu = this._menu;
    const trigger = this._trigger;
    if (!menu || !trigger || !this.hasAttribute("open")) return;
    menu.style.left = "0px";
    menu.style.top = "0px";
    menu.style.width = "0px";
    const origin = menu.getBoundingClientRect();
    const anchor = trigger.getBoundingClientRect();
    const zoom = effectiveZoom(this);
    menu.style.left = `${(anchor.left - origin.left) / zoom}px`;
    menu.style.top = `${(anchor.bottom + 4 - origin.top) / zoom}px`;
    menu.style.width = `${anchor.width / zoom}px`;
  }
};
function effectiveZoom(element) {
  const current = element.currentCSSZoom;
  if (typeof current === "number" && current > 0) return current;
  let zoom = 1;
  let node = element;
  while (node) {
    const value = parseFloat(getComputedStyle(node).zoom);
    if (Number.isFinite(value) && value > 0) zoom *= value;
    node = node.parentElement ?? (node.getRootNode().host ?? null);
  }
  return zoom;
}
function defineHaSelectShim() {
  if (!customElements.get("mwc-list-item")) customElements.define("mwc-list-item", SbMwcListItem);
  if (!customElements.get("ha-select")) customElements.define("ha-select", SbHaSelect);
}

// remote-card/src/shims/palette.ts
var REMOTE_WEB_PALETTE_CSS = `
:root {
  color-scheme: light dark;
  --primary-color: #009ac7;
  --rgb-primary-color: 0, 154, 199;
  --primary-text-color: #141414;
  --rgb-primary-text-color: 33, 33, 33;
  --secondary-text-color: #5e5e5e;
  --disabled-text-color: #bdbdbd;
  --primary-background-color: #fafafa;
  --secondary-background-color: #e5e5e5;
  --card-background-color: #ffffff;
  --divider-color: rgba(0, 0, 0, 0.12);
  --error-color: #db4437;
  --rgb-error-color: 219, 68, 55;
  --warning-color: #ffa600;
  --success-color: #43a047;
  --info-color: #039be5;
  --state-icon-color: #44739e;
  --input-fill-color: rgb(245, 245, 245);
  --ha-color-form-background: #f3f3f3;
  --ha-color-fill-neutral-normal-resting: #e6e6e6;
  --ha-color-fill-neutral-quiet-hover: #e6e6e6;
  --ha-color-fill-primary-quiet-hover: #dff3fc;
  --ha-color-border-neutral-loud: #5e5e5e;
  --ha-color-border-neutral-quiet: #e6e6e6;
  --ha-color-fill-primary-quiet-resting: #eff9fe;
  --mdc-theme-primary: #009ac7;
  --mdc-theme-surface: #ffffff;
  --mdc-select-label-ink-color: rgba(0, 0, 0, 0.6);
  --wa-color-neutral-fill-normal: #e6e6e6;
}
:root[data-theme="dark"] {
  --primary-color: #009ac7;
  --rgb-primary-color: 0, 154, 199;
  --primary-text-color: #e1e1e1;
  --rgb-primary-text-color: 33, 33, 33;
  --secondary-text-color: #9b9b9b;
  --disabled-text-color: #6f6f6f;
  --primary-background-color: #111111;
  --secondary-background-color: #282828;
  --card-background-color: #1c1c1c;
  --divider-color: rgba(225, 225, 225, 0.12);
  --error-color: #db4437;
  --rgb-error-color: 219, 68, 55;
  --warning-color: #ffa600;
  --success-color: #43a047;
  --info-color: #039be5;
  --state-icon-color: #44739e;
  --input-fill-color: rgba(255, 255, 255, 0.05);
  --ha-color-form-background: #363636;
  --ha-color-fill-neutral-normal-resting: #202020;
  --ha-color-fill-neutral-quiet-hover: #202020;
  --ha-color-fill-primary-quiet-hover: #002e3e;
  --ha-color-border-neutral-loud: #b1b1b1;
  --ha-color-border-neutral-quiet: #5e5e5e;
  --ha-color-fill-primary-quiet-resting: #001721;
  --mdc-theme-primary: #009ac7;
  --mdc-theme-surface: #1c1c1c;
  --mdc-select-label-ink-color: rgba(255, 255, 255, 0.6);
  --wa-color-neutral-fill-normal: #202020;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
  --primary-color: #009ac7;
  --rgb-primary-color: 0, 154, 199;
  --primary-text-color: #e1e1e1;
  --rgb-primary-text-color: 33, 33, 33;
  --secondary-text-color: #9b9b9b;
  --disabled-text-color: #6f6f6f;
  --primary-background-color: #111111;
  --secondary-background-color: #282828;
  --card-background-color: #1c1c1c;
  --divider-color: rgba(225, 225, 225, 0.12);
  --error-color: #db4437;
  --rgb-error-color: 219, 68, 55;
  --warning-color: #ffa600;
  --success-color: #43a047;
  --info-color: #039be5;
  --state-icon-color: #44739e;
  --input-fill-color: rgba(255, 255, 255, 0.05);
  --ha-color-form-background: #363636;
  --ha-color-fill-neutral-normal-resting: #202020;
  --ha-color-fill-neutral-quiet-hover: #202020;
  --ha-color-fill-primary-quiet-hover: #002e3e;
  --ha-color-border-neutral-loud: #b1b1b1;
  --ha-color-border-neutral-quiet: #5e5e5e;
  --ha-color-fill-primary-quiet-resting: #001721;
  --mdc-theme-primary: #009ac7;
  --mdc-theme-surface: #1c1c1c;
  --mdc-select-label-ink-color: rgba(255, 255, 255, 0.6);
  --wa-color-neutral-fill-normal: #202020;
  }
}
`;

// remote-card/src/shims/index.ts
var PALETTE_STYLE_ID = "sofabaton-remote-web-palette";
function installRemoteWebPalette(doc = document) {
  if (doc.getElementById(PALETTE_STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = PALETTE_STYLE_ID;
  style.textContent = REMOTE_WEB_PALETTE_CSS;
  doc.head.appendChild(style);
}
function defineRemoteWebElements() {
  defineHaCardShim();
  defineHaIconShim();
  defineHaSelectShim();
}
function installRemoteWebShims(doc = document) {
  installRemoteWebPalette(doc);
  defineRemoteWebElements();
}

// remote-card/src/remote-card-translations/ar.ts
var isolate = (value) => `\u2068${value}\u2069`;
var SOFABATON = isolate("Sofabaton");
var MQTT = isolate("MQTT");
var MQTT_DISCOVERY = isolate("MQTT Discovery");
var YAML = isolate("YAML");
var LOVELACE = isolate("Lovelace");
var DVR = isolate("DVR");
var ABC = isolate("A/B/C");
var REMOTE_CARD_STRINGS_AR = {
  card: {
    selectEntityError: `\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 ${SOFABATON}`,
    remoteUnavailable: `\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u063A\u064A\u0631 \u0645\u062A\u0627\u062D (\u0642\u062F \u064A\u0643\u0648\u0646 \u062A\u0637\u0628\u064A\u0642 ${SOFABATON} \u0645\u062A\u0635\u0644\u064B\u0627).`,
    noActivitiesWarning: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0623\u064A \u0623\u0646\u0634\u0637\u0629 \u0641\u064A \u0633\u0645\u0627\u062A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F.",
    noMacros: "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0648\u062D\u062F\u0627\u062A \u0645\u0627\u0643\u0631\u0648",
    noFavorites: "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0645\u0641\u0636\u0644\u0627\u062A",
    noCommands: "\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0623\u0648\u0627\u0645\u0631",
    // Tab label only: the space-budgeted drawer tab keeps the short form
    // (the longer "وحدات الماكرو" stays in the editor strings below).
    macrosTab: "\u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    favoritesTab: "\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    commandsTab: "\u0627\u0644\u0623\u0648\u0627\u0645\u0631",
    powerButton: "\u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u062A\u0634\u063A\u064A\u0644/\u0627\u0644\u0625\u064A\u0642\u0627\u0641",
    activitySelectLabel: "\u0627\u0644\u0646\u0634\u0627\u0637",
    deviceSelectLabel: "\u0627\u0644\u062C\u0647\u0627\u0632",
    selectDevice: "\u0627\u062E\u062A\u0631 \u062C\u0647\u0627\u0632\u064B\u0627",
    allDevicesLayout: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629",
    filterCommands: "\u062A\u0635\u0641\u064A\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",
    switchToDeviceMode: "\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",
    switchToActivityMode: "\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 \u0627\u0644\u0623\u0646\u0634\u0637\u0629",
    deviceKeymapMissing: `\u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u062E\u0632\u0651\u0646\u0629 \u0645\u0624\u0642\u062A\u064B\u0627 \u0628\u0639\u062F. \u062D\u062F\u0650\u0651\u062B \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062A\u0628\u0648\u064A\u0628 ${isolate("Hub")} \u0641\u064A ${isolate("Sofabaton Control Panel")}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.`,
    deviceKeymapError: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.",
    poweredOff: "\u0645\u064F\u0637\u0641\u0623",
    defaultLayout: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",
    activityFallback: (id) => `\u0627\u0644\u0646\u0634\u0627\u0637 ${isolate(id)}`,
    deviceFallback: (id) => `\u0627\u0644\u062C\u0647\u0627\u0632 ${isolate(id)}`,
    pickerName: `\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0645\u0646 ${SOFABATON}`,
    pickerDescription: `\u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u062E\u0635\u064A\u0635 \u0644\u062A\u0643\u0627\u0645\u0644 ${isolate("Sofabaton X1 / X1S / X2")}.`
  },
  assist: {
    label: "\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    start: "\u0628\u062F\u0621",
    waiting: "\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0636\u063A\u0637\u0629 \u0632\u0631",
    exitEditMode: "\u063A\u0627\u062F\u0631 \u0648\u0636\u0639 \u0627\u0644\u062A\u062D\u0631\u064A\u0631 \u0644\u0644\u0628\u062F\u0621",
    captured: (label) => `\u062A\u0645 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0645\u0631: ${isolate(label)}`,
    notCaptured: "\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u062A\u0642\u0627\u0637 \u0623\u064A \u0623\u0645\u0631.",
    working: "\u062C\u0627\u0631\u064D \u0627\u0644\u0639\u0645\u0644\u2026",
    triggersReady: "\u0627\u0644\u0645\u0634\u063A\u0651\u0644\u0627\u062A \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",
    createTriggers: `\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${MQTT_DISCOVERY}`,
    startCapturing: "\u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",
    deviceDetectedTitle: `\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u062C\u0647\u0627\u0632 ${MQTT} \u0645\u0646 ${SOFABATON}.`,
    close: "\u0625\u063A\u0644\u0627\u0642",
    alsoActivityTriggers: "\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u064A\u0636\u064B\u0627 \u0639\u0646\u062F \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637.",
    seeDocs: "\u0639\u0631\u0636 \u0648\u062B\u0627\u0626\u0642 \u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629.",
    dontShowAgain: "\u0639\u062F\u0645 \u0625\u0638\u0647\u0627\u0631 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627 \u0644\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u062E\u0644\u0627\u0644 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629.",
    detectedDevice: (name) => `\u062C\u0647\u0627\u0632 ${MQTT} \u0627\u0644\u0645\u0643\u062A\u0634\u0641: ${isolate(name)}.`,
    lastCommand: (name) => `\u0622\u062E\u0631 \u0623\u0645\u0631: ${isolate(name)}.`,
    existingTriggers: `\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u062A\u0645\u062A\u0629 ${MQTT} \u0645\u0648\u062C\u0648\u062F\u0629 \u0645\u0633\u0628\u0642\u064B\u0627.`,
    noMqttCommands: `\u0644\u0645 \u064A\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u0623\u064A \u0623\u0648\u0627\u0645\u0631 ${MQTT} \u062D\u062A\u0649 \u0627\u0644\u0622\u0646`,
    deviceFallback: (id) => `\u0627\u0644\u062C\u0647\u0627\u0632 ${isolate(id)}`,
    unknownDevice: "\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
    commandFallback: (id) => `\u0627\u0644\u0623\u0645\u0631 ${isolate(id)}`,
    createdTriggers: (count, deviceLabel) => `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${MQTT_DISCOVERY} \u0644\u0640 ${isolate(deviceLabel)}\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${isolate(count)}`,
    createdActivityTriggers: (count) => `\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0646\u0634\u0627\u0637 \u0644\u0640 ${isolate("X2 \u2192 Activities")}\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${isolate(count)}`,
    plusActivityTriggers: (count) => `\u060C \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${isolate(count)}`,
    allTriggersExist: (deviceLabel) => `\u062C\u0645\u064A\u0639 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${MQTT_DISCOVERY} \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0640 ${isolate(deviceLabel)} \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0627\u0644\u0641\u0639\u0644`,
    buttonFallback: "\u0632\u0631",
    activityFallbackLabel: "\u0627\u0644\u0646\u0634\u0627\u0637",
    unknown: "\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",
    automationAssistName: "\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",
    notification: {
      title: "\u{1F6E0}\uFE0F \u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",
      eventButton: (label) => `\u0627\u0644\u0632\u0631: ${isolate(label)}`,
      eventCommand: (label) => `\u0627\u0644\u0623\u0645\u0631: ${isolate(label)}`,
      eventActivity: (label) => `\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637: ${isolate(label)}`,
      eventOther: (label) => `\u0627\u0644\u062D\u062F\u062B: ${isolate(label)}`,
      header: (activityName, eventLabel) => `**\u0627\u0644\u0646\u0634\u0627\u0637: ${isolate(activityName)} \u2022 ${isolate(eventLabel)}**`,
      headerDevice: (deviceName, eventLabel) => `**\u0627\u0644\u062C\u0647\u0627\u0632: ${isolate(deviceName)} \u2022 ${isolate(eventLabel)}**`,
      lovelaceHeading: `\u{1F4CB} **\u0643\u0648\u062F \u0632\u0631 ${LOVELACE}**`,
      lovelaceCopy: `*\u0627\u0646\u0633\u062E \u0647\u0630\u0627 \u0625\u0644\u0649 ${YAML} \u0627\u0644\u062E\u0627\u0635 \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A:*`,
      serviceHeading: "\u2699\uFE0F **\u0627\u0633\u062A\u062F\u0639\u0627\u0621 \u062E\u062F\u0645\u0629 (\u0623\u062A\u0645\u062A\u0629)**",
      serviceCopy: "*\u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0627 \u0641\u064A \u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u0646\u0635\u064A\u0629 \u0623\u0648 \u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: `\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 ${SOFABATON}`,
      theme: "\u062A\u0637\u0628\u064A\u0642 \u0633\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0628\u0637\u0627\u0642\u0629",
      use_background_override: "\u062A\u062E\u0635\u064A\u0635 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",
      background_override: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",
      show_activity: "\u0645\u062D\u062F\u0650\u0651\u062F \u0627\u0644\u0646\u0634\u0627\u0637/\u0627\u0644\u062C\u0647\u0627\u0632",
      show_dpad: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",
      show_nav: "\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
      show_mid: "\u0623\u0632\u0631\u0627\u0631 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u0642\u0646\u0648\u0627\u062A",
      show_media: "\u0627\u0644\u062A\u0634\u063A\u064A\u0644",
      show_colors: "\u0623\u062D\u0645\u0631\u060C \u0623\u062E\u0636\u0631\u060C \u0623\u0635\u0641\u0631\u060C \u0623\u0632\u0631\u0642",
      show_abc: `\u0623\u0632\u0631\u0627\u0631 ${ABC}`,
      show_macros_button: "\u0632\u0631 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
      show_favorites_button: "\u0632\u0631 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
      max_width: "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0639\u0631\u0636 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 (\u0628\u0643\u0633\u0644)",
      key_style: "\u0646\u0645\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
      group_order: "\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A"
    },
    generalOptionsTitle: "\u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629",
    keyCapture: "\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    keyCaptureDescription: `\u0623\u0631\u0633\u0644 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0625\u0644\u0649 \u062C\u0647\u0627\u0632 ${isolate("Hub")} \u0644\u0625\u0646\u0634\u0627\u0621 ${YAML} \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0641\u064A \u0623\u0632\u0631\u0627\u0631 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629.`,
    keyCaptureLearnMore: "\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u0649 \u0627\u0644\u0645\u0632\u064A\u062F \u062D\u0648\u0644 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    keyCaptureDocsAria: "\u0648\u062B\u0627\u0626\u0642 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    stylingOptions: "\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0638\u0647\u0631",
    keyStyleFlat: "\u0645\u0633\u0637\u062D (\u0628\u0646\u0641\u0633 \u0644\u0648\u0646 \u062E\u0644\u0641\u064A\u0629 \u0627\u0644\u0628\u0637\u0627\u0642\u0629)",
    keyStyleTinted: "\u0645\u0644\u0648\u0651\u0646 (\u062A\u062A\u0645\u064A\u0632 \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0639\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629)",
    keyStyleElevated: "\u0645\u0631\u062A\u0641\u0639 (\u0645\u0644\u0648\u0651\u0646 \u0645\u0639 \u0638\u0644)",
    keyStyleGlossy: "\u0644\u0627\u0645\u0639 (\u0623\u0632\u0631\u0627\u0631 \u0644\u0627\u0645\u0639\u0629 \u0645\u0642\u0648\u0651\u0633\u0629)",
    tintedPanels: "\u062E\u0644\u0641\u064A\u0627\u062A \u0645\u0644\u0648\u0651\u0646\u0629",
    tintedPanelsDescription: "\u064A\u0639\u0631\u0636 \u062E\u0644\u0641\u064A\u0629 \u0645\u0644\u0648\u0651\u0646\u0629 \u062E\u0644\u0641 \u0643\u0644 \u0645\u062C\u0645\u0648\u0639\u0629 \u0623\u0632\u0631\u0627\u0631.",
    layoutOptions: "\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u062E\u0637\u064A\u0637",
    layoutSelectLabel: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637",
    defaultLayoutOption: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",
    allDevicesOption: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629",
    commands: "\u0627\u0644\u0623\u0648\u0627\u0645\u0631",
    power: "\u0632\u0631 \u0627\u0644\u062A\u0634\u063A\u064A\u0644/\u0627\u0644\u0625\u064A\u0642\u0627\u0641",
    modeToggle: "\u0632\u0631 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0648\u0636\u0639",
    deviceModeDescription: `\u062A\u062D\u0643\u0651\u0645 \u0641\u064A \u062C\u0647\u0627\u0632 \u0648\u0627\u062D\u062F \u062A\u0645 \u0625\u0639\u062F\u0627\u062F\u0647 \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 ${isolate("Hub")}\u060C \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u062A\u0639\u064A\u064A\u0646\u0627\u062A \u0623\u0632\u0631\u0627\u0631\u0647 \u0648\u0642\u0627\u0626\u0645\u0629 \u0623\u0648\u0627\u0645\u0631\u0647 \u0627\u0644\u0643\u0627\u0645\u0644\u0629.`,
    longPress: "\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0643\u0631\u0627\u0631 \u0639\u0646\u062F \u0627\u0644\u0636\u063A\u0637 \u0627\u0644\u0645\u0637\u0648\u0651\u0644",
    longPressDescription: "\u0627\u0636\u063A\u0637 \u0645\u0637\u0648\u0651\u0644\u064B\u0627 \u0639\u0644\u0649 \u0623\u062D\u062F \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0644\u0625\u0631\u0633\u0627\u0644 \u0623\u0645\u0631\u0647 \u0628\u0634\u0643\u0644 \u0645\u062A\u0643\u0631\u0631\u060C \u0643\u0645\u0627 \u0641\u064A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0641\u0639\u0644\u064A.",
    longPressButtons: "\u0627\u0644\u0623\u0632\u0631\u0627\u0631",
    enableDeviceMode: "\u062A\u0641\u0639\u064A\u0644 \u0648\u0636\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",
    initialView: "\u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0644\u064A",
    initialViewHelper: "\u0645\u0627 \u062A\u0639\u0631\u0636\u0647 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0639\u0646\u062F \u0641\u062A\u062D\u0647\u0627",
    openOnCurrentActivity: "\u0627\u0644\u0646\u0634\u0627\u0637 \u0627\u0644\u062D\u0627\u0644\u064A",
    macrosFavoritesAsRows: "\u0639\u0631\u0636 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 \u0648\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A \u0641\u064A \u0635\u0641\u0648\u0641",
    commandsAsRows: "\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0641\u064A \u0635\u0641\u0648\u0641",
    visibleRows: "\u0627\u0644\u0635\u0641\u0648\u0641 \u0627\u0644\u0645\u0631\u0626\u064A\u0629",
    moveGroupUp: (groupLabel) => `\u0646\u0642\u0644 ${isolate(groupLabel)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649`,
    moveGroupDown: (groupLabel) => `\u0646\u0642\u0644 ${isolate(groupLabel)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0641\u0644`,
    macros: "\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    favorites: "\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    volume: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",
    channel: "\u0627\u0644\u0642\u0646\u0627\u0629",
    mediaControls: "\u0627\u0644\u062A\u0634\u063A\u064A\u0644",
    dvr: DVR,
    resetDefaultLayout: "\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0627\u0644\u062A\u062E\u0637\u064A\u0637",
    shortcutSlotLeft: "\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u064A\u0633\u0631",
    shortcutSlotMiddle: "\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u0648\u0633\u0637",
    shortcutSlotRight: "\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u064A\u0645\u0646",
    shortcutIcon: "\u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0629",
    shortcutCommand: "\u0627\u0644\u0623\u0645\u0631",
    shortcutReset: "\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0636\u0628\u0637",
    shortcutCommandMissing: (id) => `\u0627\u0644\u0623\u0645\u0631 ${isolate(id)} (\u0645\u0641\u0642\u0648\u062F)`,
    shortcutsCommandsLoading: "\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0648\u0627\u0645\u0631\u2026",
    shortcutsCommandsUnavailable: `\u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u062E\u0632\u0651\u0646\u0629 \u0645\u0624\u0642\u062A\u064B\u0627 \u0628\u0639\u062F. \u062D\u062F\u0650\u0651\u062B \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062A\u0628\u0648\u064A\u0628 ${isolate("Hub")} \u0641\u064A ${isolate("Sofabaton Control Panel")}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.`,
    shortcutsCommandsError: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.",
    noteDefaultLayout: "\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",
    noteDeviceDefaultLayout: "\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",
    noteCustomActivityLayout: "\u062A\u062E\u0637\u064A\u0637 \u0623\u0646\u0634\u0637\u0629 \u0645\u062E\u0635\u0651\u0635 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",
    noteCustomDeviceLayout: "\u062A\u062E\u0637\u064A\u0637 \u0623\u062C\u0647\u0632\u0629 \u0645\u062E\u0635\u0651\u0635 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",
    noteUsingActivityDefault: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",
    noteUsingDeviceDefault: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645"
  },
  groups: {
    activity: "\u0627\u0644\u0646\u0634\u0627\u0637/\u0627\u0644\u062C\u0647\u0627\u0632",
    macro_favorites: "\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 \u0648\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    macros_row: "\u0635\u0641 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    favorites_row: "\u0635\u0641 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    dpad: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",
    nav: "\u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",
    mid: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A/\u0627\u0644\u0642\u0646\u0627\u0629",
    media: "\u0627\u0644\u062A\u0634\u063A\u064A\u0644",
    colors: "\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0623\u0644\u0648\u0627\u0646",
    abc: ABC,
    shortcuts: "\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631\u0627\u062A"
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
    volup: `\u0627\u0644\u0635\u0648\u062A ${isolate("+")}`,
    voldn: `\u0627\u0644\u0635\u0648\u062A ${isolate("-")}`,
    mute: "\u0643\u062A\u0645 \u0627\u0644\u0635\u0648\u062A",
    chup: `\u0627\u0644\u0642\u0646\u0627\u0629 ${isolate("+")}`,
    chdn: `\u0627\u0644\u0642\u0646\u0627\u0629 ${isolate("-")}`,
    guide: "\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C",
    dvr: DVR,
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

// remote-card/src/remote-card-translations/en-gb.ts
registerRemoteCardTranslation("en-gb", {
  card: {
    favoritesTab: "Favourites",
    noFavorites: "No favourites available"
  },
  editor: {
    fieldLabels: {
      use_background_override: "Customise background colour",
      background_override: "Select background colour",
      show_favorites_button: "Favourites button"
    },
    favorites: "Favourites",
    macrosFavoritesAsRows: "Macros/Favourites as rows"
  },
  groups: {
    macro_favorites: "Macros/Favourites",
    favorites_row: "Favourites row",
    colors: "Colour buttons"
  }
});

// remote-card/src/remote-card-translations/de.ts
var REMOTE_CARD_STRINGS_DE = {
  card: {
    selectEntityError: "W\xE4hle eine Sofabaton-Fernsteuerungsentit\xE4t aus",
    remoteUnavailable: "Die Fernsteuerung ist nicht verf\xFCgbar (m\xF6glicherweise ist die Sofabaton-App verbunden).",
    noActivitiesWarning: "Keine Aktivit\xE4ten in den Attributen der Fernsteuerung gefunden.",
    noMacros: "Keine Makros verf\xFCgbar",
    noFavorites: "Keine Favoriten verf\xFCgbar",
    noCommands: "Keine Befehle verf\xFCgbar",
    macrosTab: "Makros",
    favoritesTab: "Favoriten",
    commandsTab: "Befehle",
    powerButton: "Ein-/Ausschalten",
    activitySelectLabel: "Aktivit\xE4t",
    deviceSelectLabel: "Ger\xE4t",
    selectDevice: "Ger\xE4t ausw\xE4hlen",
    allDevicesLayout: "Standard-Ger\xE4telayout",
    filterCommands: "Befehle filtern",
    switchToDeviceMode: "In den Ger\xE4temodus wechseln",
    switchToActivityMode: "In den Aktivit\xE4tsmodus wechseln",
    deviceKeymapMissing: "Die Befehle dieses Ger\xE4ts sind noch nicht im Cache. Aktualisiere das Ger\xE4t im Hub-Tab der Sofabaton-Steuerzentrale und lade danach das Dashboard neu.",
    deviceKeymapError: "Die Befehle dieses Ger\xE4ts konnten nicht geladen werden.",
    poweredOff: "Ausgeschaltet",
    defaultLayout: "Standard-Aktivit\xE4tslayout",
    activityFallback: (id) => `Aktivit\xE4t ${id}`,
    deviceFallback: (id) => `Ger\xE4t ${id}`,
    pickerName: "Virtuelle Sofabaton-Fernbedienung",
    pickerDescription: "Eine konfigurierbare Fernbedienung f\xFCr die Sofabaton-X1-, X1S- und X2-Integration."
  },
  assist: {
    label: "Tastendr\xFCcke erfassen",
    start: "Starten",
    waiting: "Warten auf Tastendruck",
    exitEditMode: "Bearbeitungsmodus verlassen, um zu beginnen",
    captured: (label) => `Erfasst: ${label}`,
    notCaptured: "Nicht erfasst.",
    working: "Wird ausgef\xFChrt\u2026",
    triggersReady: "Ausl\xF6ser einsatzbereit",
    createTriggers: "MQTT-Discovery-Ausl\xF6ser erstellen",
    startCapturing: "Befehlserfassung starten",
    deviceDetectedTitle: "Sofabaton-MQTT-Ger\xE4t erkannt.",
    close: "Schlie\xDFen",
    alsoActivityTriggers: "Zus\xE4tzlich Ausl\xF6ser f\xFCr Aktivit\xE4tswechsel erstellen.",
    seeDocs: "Dokumentation zu dieser Funktion anzeigen.",
    dontShowAgain: "F\xFCr dieses Ger\xE4t w\xE4hrend dieser Sitzung nicht erneut anzeigen.",
    detectedDevice: (name) => `MQTT-Ger\xE4t erkannt: ${name}.`,
    lastCommand: (name) => `Letzter Befehl: ${name}.`,
    existingTriggers: "Vorhandene MQTT-Automatisierungsausl\xF6ser wurden gefunden.",
    noMqttCommands: "Noch keine MQTT-Befehle erkannt",
    deviceFallback: (id) => `Ger\xE4t ${id}`,
    unknownDevice: "Unbekanntes Ger\xE4t",
    commandFallback: (id) => `Befehl ${id}`,
    createdTriggers: (count, deviceLabel) => `${count} MQTT-Discovery-Ausl\xF6ser f\xFCr ${deviceLabel} ${count === 1 ? "wurde" : "wurden"} erstellt`,
    createdActivityTriggers: (count) => `${count} Aktivit\xE4tsausl\xF6ser f\xFCr X2 \u2192 Activities ${count === 1 ? "wurde" : "wurden"} erstellt`,
    plusActivityTriggers: (count) => `; zus\xE4tzlich ${count === 1 ? "wurde" : "wurden"} ${count} Aktivit\xE4tsausl\xF6ser erstellt`,
    allTriggersExist: (deviceLabel) => `Alle MQTT-Discovery-Ausl\xF6ser f\xFCr ${deviceLabel} sind bereits vorhanden`,
    buttonFallback: "Taste",
    activityFallbackLabel: "Aktivit\xE4t",
    unknown: "Unbekannt",
    automationAssistName: "Automatisierungsassistent",
    notification: {
      title: "\u{1F6E0}\uFE0F Automatisierungsassistent",
      eventButton: (label) => `Taste: ${label}`,
      eventCommand: (label) => `Befehl: ${label}`,
      eventActivity: (label) => `Aktivit\xE4tswechsel: ${label}`,
      eventOther: (label) => `Ereignis: ${label}`,
      header: (activityName, eventLabel) => `**Aktivit\xE4t: ${activityName} | ${eventLabel}**`,
      headerDevice: (deviceName, eventLabel) => `**Ger\xE4t: ${deviceName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace-Schaltfl\xE4chencode**",
      lovelaceCopy: "*In das Dashboard-YAML kopieren:*",
      serviceHeading: "\u2699\uFE0F **Dienstaufruf (Automatisierung)**",
      serviceCopy: "*In Skripten oder Automatisierungen verwenden:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Sofabaton-Fernsteuerungsentit\xE4t ausw\xE4hlen",
      theme: "Theme auf die Karte anwenden",
      use_background_override: "Hintergrundfarbe anpassen",
      background_override: "Hintergrundfarbe ausw\xE4hlen",
      show_activity: "Aktivit\xE4ts-/Ger\xE4teauswahl",
      show_dpad: "Steuerkreuz",
      show_nav: "Zur\xFCck-, Home- und Men\xFC-Tasten",
      show_mid: "Lautst\xE4rke- und Kanalwippen",
      show_media: "Wiedergabe",
      show_colors: "Rot/Gr\xFCn/Gelb/Blau",
      show_abc: "A/B/C-Tasten",
      show_macros_button: "Makrotaste",
      show_favorites_button: "Favoritentaste",
      max_width: "Maximale Kartenbreite (px)",
      key_style: "Tastenstil",
      group_order: "Gruppenreihenfolge"
    },
    generalOptionsTitle: "Allgemeine Optionen",
    keyCapture: "Tastendr\xFCcke erfassen",
    keyCaptureDescription: "Sende Tastendr\xFCcke an den Hub, um sofort einsatzbereites YAML f\xFCr Dashboard-Schaltfl\xE4chen und Automatisierungen zu erzeugen.",
    keyCaptureLearnMore: "Mehr \xFCber die Tastenerfassung erfahren",
    keyCaptureDocsAria: "Dokumentation zur Tastenerfassung",
    stylingOptions: "Stiloptionen",
    keyStyleFlat: "Flach (wie der Kartenhintergrund)",
    keyStyleTinted: "Get\xF6nt (Tasten heben sich vom Hintergrund ab)",
    keyStyleElevated: "Erh\xF6ht (get\xF6nt mit Schatten)",
    keyStyleGlossy: "Gl\xE4nzend (gl\xE4nzende, gew\xF6lbte Tasten)",
    tintedPanels: "Get\xF6nte Panels",
    tintedPanelsDescription: "Zeigt hinter jeder Tastengruppe einen get\xF6nten Hintergrund an.",
    layoutOptions: "Layoutoptionen",
    layoutSelectLabel: "Layout",
    defaultLayoutOption: "Standard-Aktivit\xE4tslayout",
    allDevicesOption: "Standard-Ger\xE4telayout",
    commands: "Befehle",
    power: "Ein-/Aus-Taste",
    modeToggle: "Modusschalter",
    deviceModeDescription: "Steuere ein einzelnes, im Hub eingerichtetes Ger\xE4t mit dessen Tastenbelegungen und vollst\xE4ndiger Befehlsliste.",
    longPress: "Wiederholen beim Gedr\xFCckthalten aktivieren",
    longPressDescription: "Halte eine ausgew\xE4hlte Taste gedr\xFCckt, um ihren Befehl wiederholt zu senden \u2013 wie bei der physischen Fernbedienung.",
    longPressButtons: "Tasten",
    enableDeviceMode: "Ger\xE4temodus aktivieren",
    initialView: "Anfangsansicht",
    initialViewHelper: "Was die Karte beim \xD6ffnen anzeigt",
    openOnCurrentActivity: "Aktuelle Aktivit\xE4t",
    macrosFavoritesAsRows: "Makros/Favoriten als Zeilen",
    commandsAsRows: "Befehle als Zeilen",
    visibleRows: "Sichtbare Zeilen",
    moveGroupUp: (groupLabel) => `${groupLabel} nach oben verschieben`,
    moveGroupDown: (groupLabel) => `${groupLabel} nach unten verschieben`,
    macros: "Makros",
    favorites: "Favoriten",
    volume: "Lautst\xE4rke",
    channel: "Kanal",
    mediaControls: "Wiedergabe",
    dvr: "DVR",
    resetDefaultLayout: "Layout zur\xFCcksetzen",
    shortcutSlotLeft: "Linke Verkn\xFCpfung",
    shortcutSlotMiddle: "Mittlere Verkn\xFCpfung",
    shortcutSlotRight: "Rechte Verkn\xFCpfung",
    shortcutIcon: "Symbol",
    shortcutCommand: "Befehl",
    shortcutReset: "Zur\xFCcksetzen",
    shortcutCommandMissing: (id) => `Befehl ${id} (fehlt)`,
    shortcutsCommandsLoading: "Befehle werden geladen\u2026",
    shortcutsCommandsUnavailable: "Die Befehle dieses Ger\xE4ts sind noch nicht im Cache. Aktualisiere das Ger\xE4t im Hub-Tab der Sofabaton-Steuerzentrale und lade danach das Dashboard neu.",
    shortcutsCommandsError: "Die Befehle dieses Ger\xE4ts konnten nicht geladen werden. Lade das Dashboard neu und versuche es erneut.",
    noteDefaultLayout: "F\xFCr Aktivit\xE4ten ohne eigenes Layout",
    noteDeviceDefaultLayout: "F\xFCr Ger\xE4te ohne eigenes Layout",
    noteCustomActivityLayout: "Benutzerdefiniertes Aktivit\xE4tslayout aktiv",
    noteCustomDeviceLayout: "Benutzerdefiniertes Ger\xE4telayout aktiv",
    noteUsingActivityDefault: "Standard-Aktivit\xE4tslayout aktiv",
    noteUsingDeviceDefault: "Standard-Ger\xE4telayout aktiv"
  },
  groups: {
    activity: "Aktivit\xE4t/Ger\xE4t",
    macro_favorites: "Makros/Favoriten",
    macros_row: "Makrozeile",
    favorites_row: "Favoritenzeile",
    dpad: "Steuerkreuz",
    nav: "Zur\xFCck/Home/Men\xFC",
    mid: "Lautst\xE4rke/Kanal",
    media: "Wiedergabe",
    colors: "Farbtasten",
    abc: "A/B/C",
    shortcuts: "Verkn\xFCpfungen"
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
    guide: "Guide",
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
};
registerRemoteCardTranslation("de", REMOTE_CARD_STRINGS_DE);

// remote-card/src/remote-card-translations/es.ts
var plural = (count, singular, pluralForm = `${singular}s`) => count === 1 ? singular : pluralForm;
var REMOTE_CARD_STRINGS_ES = {
  card: {
    selectEntityError: "Selecciona una entidad de mando a distancia Sofabaton",
    remoteUnavailable: "El mando a distancia no est\xE1 disponible (posiblemente porque la aplicaci\xF3n Sofabaton est\xE1 conectada).",
    noActivitiesWarning: "No se encontraron actividades en los atributos del mando a distancia.",
    noMacros: "No hay macros disponibles",
    noFavorites: "No hay favoritos disponibles",
    noCommands: "No hay comandos disponibles",
    macrosTab: "Macros",
    favoritesTab: "Favoritos",
    commandsTab: "Comandos",
    powerButton: "Alternar encendido/apagado",
    activitySelectLabel: "Actividad",
    deviceSelectLabel: "Dispositivo",
    selectDevice: "Seleccionar dispositivo",
    allDevicesLayout: "Dise\xF1o predeterminado de dispositivos",
    filterCommands: "Filtrar comandos",
    switchToDeviceMode: "Cambiar al modo de dispositivo",
    switchToActivityMode: "Cambiar al modo de actividad",
    deviceKeymapMissing: "Los comandos de este dispositivo a\xFAn no est\xE1n en cach\xE9. Actualiza el dispositivo en la pesta\xF1a Hub del Panel de control Sofabaton y vuelve a cargar el panel de Home Assistant.",
    deviceKeymapError: "No se pudieron cargar los comandos de este dispositivo.",
    poweredOff: "Apagado",
    defaultLayout: "Dise\xF1o predeterminado de actividades",
    activityFallback: (id) => `Actividad ${id}`,
    deviceFallback: (id) => `Dispositivo ${id}`,
    pickerName: "Mando a distancia virtual Sofabaton",
    pickerDescription: "Un mando a distancia configurable para la integraci\xF3n Sofabaton X1, X1S y X2."
  },
  assist: {
    label: "Captura de botones",
    start: "Iniciar",
    waiting: "Esperando a que se pulse un bot\xF3n",
    exitEditMode: "Sal del modo de edici\xF3n para comenzar",
    captured: (label) => `Capturado: ${label}`,
    notCaptured: "Sin capturar.",
    working: "Procesando\u2026",
    triggersReady: "Desencadenantes listos para usar",
    createTriggers: "Crear desencadenantes de MQTT Discovery",
    startCapturing: "Iniciar la captura de comandos",
    deviceDetectedTitle: "Se ha detectado un dispositivo MQTT de Sofabaton.",
    close: "Cerrar",
    alsoActivityTriggers: "Crear tambi\xE9n desencadenantes para los cambios de actividad.",
    seeDocs: "Consulta la documentaci\xF3n de esta funci\xF3n.",
    dontShowAgain: "No volver a mostrar este mensaje para este dispositivo durante esta sesi\xF3n.",
    detectedDevice: (name) => `Dispositivo MQTT detectado: ${name}.`,
    lastCommand: (name) => `\xDAltimo comando: ${name}.`,
    existingTriggers: "Se encontraron desencadenantes existentes de automatizaci\xF3n MQTT.",
    noMqttCommands: "A\xFAn no se han detectado comandos MQTT",
    deviceFallback: (id) => `Dispositivo ${id}`,
    unknownDevice: "Dispositivo desconocido",
    commandFallback: (id) => `Comando ${id}`,
    createdTriggers: (count, deviceLabel) => `${count} ${plural(count, "desencadenante")} de MQTT Discovery ${plural(count, "creado")} para ${deviceLabel}`,
    createdActivityTriggers: (count) => `${count} ${plural(count, "desencadenante")} de actividad ${plural(count, "creado")} para X2 \u2192 Activities`,
    plusActivityTriggers: (count) => `; adem\xE1s, ${count} ${plural(count, "desencadenante")} de actividad ${plural(count, "creado")}`,
    allTriggersExist: (deviceLabel) => `Ya existen todos los desencadenantes de MQTT Discovery para ${deviceLabel}`,
    buttonFallback: "Bot\xF3n",
    activityFallbackLabel: "Actividad",
    unknown: "Desconocido",
    automationAssistName: "Asistente de automatizaci\xF3n",
    notification: {
      title: "\u{1F6E0}\uFE0F Asistente de automatizaci\xF3n",
      eventButton: (label) => `Bot\xF3n: ${label}`,
      eventCommand: (label) => `Comando: ${label}`,
      eventActivity: (label) => `Cambio de actividad: ${label}`,
      eventOther: (label) => `Evento: ${label}`,
      header: (activityName, eventLabel) => `**Actividad: ${activityName} | ${eventLabel}**`,
      headerDevice: (deviceName, eventLabel) => `**Dispositivo: ${deviceName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **C\xF3digo de bot\xF3n Lovelace**",
      lovelaceCopy: "*Copia esto en el YAML de tu panel:*",
      serviceHeading: "\u2699\uFE0F **Llamada de servicio (automatizaci\xF3n)**",
      serviceCopy: "*Usa esto en tus scripts o automatizaciones:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Seleccionar una entidad de mando a distancia Sofabaton",
      theme: "Aplicar un tema a la tarjeta",
      use_background_override: "Personalizar el color de fondo",
      background_override: "Seleccionar el color de fondo",
      show_activity: "Selector de actividad/dispositivo",
      show_dpad: "Control direccional",
      show_nav: "Botones Atr\xE1s/Inicio/Men\xFA",
      show_mid: "Controles de volumen y canal",
      show_media: "Reproducci\xF3n",
      show_colors: "Rojo/Verde/Amarillo/Azul",
      show_abc: "Botones A/B/C",
      show_macros_button: "Bot\xF3n de macros",
      show_favorites_button: "Bot\xF3n de favoritos",
      max_width: "Ancho m\xE1ximo de la tarjeta (px)",
      key_style: "Estilo de los botones",
      group_order: "Orden de los grupos"
    },
    generalOptionsTitle: "Opciones generales",
    keyCapture: "Captura de botones",
    keyCaptureDescription: "Env\xEDa pulsaciones de botones al hub para generar YAML listo para usar en botones del panel y automatizaciones.",
    keyCaptureLearnMore: "M\xE1s informaci\xF3n sobre la captura de botones",
    keyCaptureDocsAria: "Documentaci\xF3n sobre la captura de botones",
    stylingOptions: "Opciones de estilo",
    keyStyleFlat: "Plano (igual que el fondo de la tarjeta)",
    keyStyleTinted: "Tintado (los botones destacan sobre el fondo)",
    keyStyleElevated: "Elevado (tintado con sombra)",
    keyStyleGlossy: "Brillante (botones curvos y brillantes)",
    tintedPanels: "Paneles tintados",
    tintedPanelsDescription: "Muestra un fondo tintado detr\xE1s de cada grupo de botones.",
    layoutOptions: "Opciones de dise\xF1o",
    layoutSelectLabel: "Dise\xF1o",
    defaultLayoutOption: "Dise\xF1o predeterminado de actividades",
    allDevicesOption: "Dise\xF1o predeterminado de dispositivos",
    commands: "Comandos",
    power: "Bot\xF3n de encendido/apagado",
    modeToggle: "Bot\xF3n de modo",
    deviceModeDescription: "Controla un \xFAnico dispositivo configurado en el hub mediante sus asignaciones de botones y su lista completa de comandos.",
    longPress: "Activar la repetici\xF3n al mantener pulsado un bot\xF3n",
    longPressDescription: "Mant\xE9n pulsado un bot\xF3n seleccionado para enviar su comando repetidamente, como en el mando a distancia f\xEDsico.",
    longPressButtons: "Botones",
    enableDeviceMode: "Activar el modo de dispositivo",
    initialView: "Vista inicial",
    initialViewHelper: "Lo que muestra la tarjeta al abrirse",
    openOnCurrentActivity: "Actividad actual",
    macrosFavoritesAsRows: "Macros/favoritos como filas",
    commandsAsRows: "Comandos como filas",
    visibleRows: "Filas visibles",
    moveGroupUp: (groupLabel) => `Mover ${groupLabel} hacia arriba`,
    moveGroupDown: (groupLabel) => `Mover ${groupLabel} hacia abajo`,
    macros: "Macros",
    favorites: "Favoritos",
    volume: "Volumen",
    channel: "Canal",
    mediaControls: "Reproducci\xF3n",
    dvr: "DVR",
    resetDefaultLayout: "Restablecer dise\xF1o",
    shortcutSlotLeft: "Acceso directo izquierdo",
    shortcutSlotMiddle: "Acceso directo central",
    shortcutSlotRight: "Acceso directo derecho",
    shortcutIcon: "Icono",
    shortcutCommand: "Comando",
    shortcutReset: "Restablecer",
    shortcutCommandMissing: (id) => `Comando ${id} (no encontrado)`,
    shortcutsCommandsLoading: "Cargando comandos\u2026",
    shortcutsCommandsUnavailable: "Los comandos de este dispositivo a\xFAn no est\xE1n en cach\xE9. Actualiza el dispositivo en la pesta\xF1a Hub del Panel de control Sofabaton y vuelve a cargar el panel de Home Assistant.",
    shortcutsCommandsError: "No se pudieron cargar los comandos de este dispositivo. Vuelve a cargar el panel de Home Assistant e int\xE9ntalo de nuevo.",
    noteDefaultLayout: "Se usa para actividades sin un dise\xF1o propio",
    noteDeviceDefaultLayout: "Se usa para dispositivos sin un dise\xF1o propio",
    noteCustomActivityLayout: "Se est\xE1 usando un dise\xF1o de actividad personalizado",
    noteCustomDeviceLayout: "Se est\xE1 usando un dise\xF1o de dispositivo personalizado",
    noteUsingActivityDefault: "Se est\xE1 usando el dise\xF1o predeterminado de actividades",
    noteUsingDeviceDefault: "Se est\xE1 usando el dise\xF1o predeterminado de dispositivos"
  },
  groups: {
    activity: "Actividad/dispositivo",
    macro_favorites: "Macros/favoritos",
    macros_row: "Fila de macros",
    favorites_row: "Fila de favoritos",
    dpad: "Control direccional",
    nav: "Atr\xE1s/Inicio/Men\xFA",
    mid: "Volumen/Canal",
    media: "Reproducci\xF3n",
    colors: "Botones de colores",
    abc: "A/B/C",
    shortcuts: "Accesos directos"
  },
  keys: {
    up: "Arriba",
    down: "Abajo",
    left: "Izquierda",
    right: "Derecha",
    ok: "OK",
    back: "Atr\xE1s",
    home: "Inicio",
    menu: "Men\xFA",
    volup: "Volumen +",
    voldn: "Volumen -",
    mute: "Silencio",
    chup: "Canal +",
    chdn: "Canal -",
    guide: "Gu\xEDa",
    dvr: "DVR",
    play: "Reproducir",
    exit: "Salir",
    rew: "Retroceder",
    pause: "Pausa",
    fwd: "Avance r\xE1pido",
    red: "Rojo",
    green: "Verde",
    yellow: "Amarillo",
    blue: "Azul",
    a: "A",
    b: "B",
    c: "C"
  }
};
registerRemoteCardTranslation("es", REMOTE_CARD_STRINGS_ES);

// remote-card/src/remote-card-translations/fr.ts
var plural2 = (count, singular, pluralForm = `${singular}s`) => count > 1 ? pluralForm : singular;
var REMOTE_CARD_STRINGS_FR = {
  card: {
    selectEntityError: "S\xE9lectionnez une entit\xE9 de t\xE9l\xE9commande Sofabaton",
    remoteUnavailable: "La t\xE9l\xE9commande n\u2019est pas disponible (peut-\xEAtre parce que l\u2019application Sofabaton est connect\xE9e).",
    noActivitiesWarning: "Aucune activit\xE9 trouv\xE9e dans les attributs de la t\xE9l\xE9commande.",
    noMacros: "Aucune macro disponible",
    noFavorites: "Aucun favori disponible",
    noCommands: "Aucune commande disponible",
    macrosTab: "Macros",
    favoritesTab: "Favoris",
    commandsTab: "Commandes",
    powerButton: "Basculer marche/arr\xEAt",
    activitySelectLabel: "Activit\xE9",
    deviceSelectLabel: "Appareil",
    selectDevice: "S\xE9lectionner un appareil",
    allDevicesLayout: "Disposition par d\xE9faut des appareils",
    filterCommands: "Filtrer les commandes",
    switchToDeviceMode: "Passer en mode appareil",
    switchToActivityMode: "Passer en mode activit\xE9",
    deviceKeymapMissing: "Les commandes de cet appareil ne sont pas encore en cache. Actualisez l\u2019appareil dans l\u2019onglet Hub du Panneau de contr\xF4le Sofabaton, puis rechargez le tableau de bord.",
    deviceKeymapError: "Impossible de charger les commandes de cet appareil.",
    poweredOff: "\xC9teinte",
    defaultLayout: "Disposition par d\xE9faut des activit\xE9s",
    activityFallback: (id) => `Activit\xE9 ${id}`,
    deviceFallback: (id) => `Appareil ${id}`,
    pickerName: "T\xE9l\xE9commande virtuelle Sofabaton",
    pickerDescription: "Une t\xE9l\xE9commande configurable pour l\u2019int\xE9gration Sofabaton X1, X1S et X2."
  },
  assist: {
    label: "Capture de touches",
    start: "D\xE9marrer",
    waiting: "En attente d\u2019une pression sur une touche",
    exitEditMode: "Quittez le mode d\u2019\xE9dition pour commencer",
    captured: (label) => `Capture\xA0: ${label}`,
    notCaptured: "Aucune capture.",
    working: "Traitement en cours\u2026",
    triggersReady: "D\xE9clencheurs pr\xEAts \xE0 l\u2019emploi",
    createTriggers: "Cr\xE9er les d\xE9clencheurs MQTT Discovery",
    startCapturing: "Commencer la capture des commandes",
    deviceDetectedTitle: "Appareil MQTT Sofabaton d\xE9tect\xE9.",
    close: "Fermer",
    alsoActivityTriggers: "Cr\xE9er \xE9galement des d\xE9clencheurs pour les changements d\u2019activit\xE9.",
    seeDocs: "Consultez la documentation de cette fonctionnalit\xE9.",
    dontShowAgain: "Ne plus afficher ce message pour cet appareil pendant cette session.",
    detectedDevice: (name) => `Appareil MQTT d\xE9tect\xE9\xA0: ${name}.`,
    lastCommand: (name) => `Derni\xE8re commande\xA0: ${name}.`,
    existingTriggers: "Des d\xE9clencheurs d\u2019automatisation MQTT existants ont \xE9t\xE9 trouv\xE9s.",
    noMqttCommands: "Aucune commande MQTT d\xE9couverte pour le moment",
    deviceFallback: (id) => `Appareil ${id}`,
    unknownDevice: "Appareil inconnu",
    commandFallback: (id) => `Commande ${id}`,
    createdTriggers: (count, deviceLabel) => `${count} ${plural2(count, "d\xE9clencheur")} MQTT Discovery ${plural2(count, "cr\xE9\xE9")} pour ${deviceLabel}`,
    createdActivityTriggers: (count) => `${count} ${plural2(count, "d\xE9clencheur")} d\u2019activit\xE9 ${plural2(count, "cr\xE9\xE9")} pour X2 \u2192 Activities`,
    plusActivityTriggers: (count) => `\xA0; ${count} ${plural2(count, "d\xE9clencheur")} d\u2019activit\xE9 \xE9galement ${plural2(count, "cr\xE9\xE9")}`,
    allTriggersExist: (deviceLabel) => `Tous les d\xE9clencheurs MQTT Discovery existent d\xE9j\xE0 pour ${deviceLabel}`,
    buttonFallback: "Touche",
    activityFallbackLabel: "Activit\xE9",
    unknown: "Inconnu",
    automationAssistName: "Assistant d\u2019automatisation",
    notification: {
      title: "\u{1F6E0}\uFE0F Assistant d\u2019automatisation",
      eventButton: (label) => `Touche\xA0: ${label}`,
      eventCommand: (label) => `Commande\xA0: ${label}`,
      eventActivity: (label) => `Changement d\u2019activit\xE9\xA0: ${label}`,
      eventOther: (label) => `\xC9v\xE9nement\xA0: ${label}`,
      header: (activityName, eventLabel) => `**Activit\xE9\xA0: ${activityName} | ${eventLabel}**`,
      headerDevice: (deviceName, eventLabel) => `**Appareil\xA0: ${deviceName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Code de bouton Lovelace**",
      lovelaceCopy: "*Copiez ceci dans le YAML de votre tableau de bord\xA0:*",
      serviceHeading: "\u2699\uFE0F **Appel de service (automatisation)**",
      serviceCopy: "*Utilisez ceci dans vos scripts ou automatisations\xA0:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "S\xE9lectionner une entit\xE9 de t\xE9l\xE9commande Sofabaton",
      theme: "Appliquer un th\xE8me \xE0 la carte",
      use_background_override: "Personnaliser la couleur d\u2019arri\xE8re-plan",
      background_override: "S\xE9lectionner la couleur d\u2019arri\xE8re-plan",
      show_activity: "S\xE9lecteur d\u2019activit\xE9/appareil",
      show_dpad: "Pav\xE9 directionnel",
      show_nav: "Touches Retour/Accueil/Menu",
      show_mid: "Touches de volume et de cha\xEEne",
      show_media: "Lecture",
      show_colors: "Rouge/Vert/Jaune/Bleu",
      show_abc: "Touches A/B/C",
      show_macros_button: "Bouton des macros",
      show_favorites_button: "Bouton des favoris",
      max_width: "Largeur maximale de la carte (px)",
      key_style: "Style des touches",
      group_order: "Ordre des groupes"
    },
    generalOptionsTitle: "Options g\xE9n\xE9rales",
    keyCapture: "Capture de touches",
    keyCaptureDescription: "Envoyez les pressions sur les touches au hub afin de g\xE9n\xE9rer du YAML pr\xEAt \xE0 l\u2019emploi pour les boutons du tableau de bord et les automatisations.",
    keyCaptureLearnMore: "En savoir plus sur la capture de touches",
    keyCaptureDocsAria: "Documentation sur la capture de touches",
    stylingOptions: "Options de style",
    keyStyleFlat: "Plat (m\xEAme couleur que la carte)",
    keyStyleTinted: "Teint\xE9 (les touches se d\xE9tachent du fond)",
    keyStyleElevated: "Sur\xE9lev\xE9 (teint\xE9 avec ombre)",
    keyStyleGlossy: "Brillant (touches bomb\xE9es et brillantes)",
    tintedPanels: "Panneaux teint\xE9s",
    tintedPanelsDescription: "Affiche un fond teint\xE9 derri\xE8re chaque groupe de touches.",
    layoutOptions: "Options de disposition",
    layoutSelectLabel: "Disposition",
    defaultLayoutOption: "Disposition par d\xE9faut des activit\xE9s",
    allDevicesOption: "Disposition par d\xE9faut des appareils",
    commands: "Commandes",
    power: "Bouton Marche/Arr\xEAt",
    modeToggle: "Bouton de mode",
    deviceModeDescription: "Contr\xF4lez un seul appareil configur\xE9 sur le hub, avec ses propres attributions de touches et sa liste compl\xE8te de commandes.",
    longPress: "Activer la r\xE9p\xE9tition par appui prolong\xE9",
    longPressDescription: "Maintenez une touche s\xE9lectionn\xE9e pour envoyer sa commande de fa\xE7on r\xE9p\xE9t\xE9e, comme sur la t\xE9l\xE9commande physique.",
    longPressButtons: "Touches",
    enableDeviceMode: "Activer le mode appareil",
    initialView: "Vue initiale",
    initialViewHelper: "Ce que la carte affiche \xE0 l\u2019ouverture",
    openOnCurrentActivity: "Activit\xE9 en cours",
    macrosFavoritesAsRows: "Macros/favoris sous forme de lignes",
    commandsAsRows: "Commandes sous forme de lignes",
    visibleRows: "Lignes visibles",
    moveGroupUp: (groupLabel) => `D\xE9placer ${groupLabel} vers le haut`,
    moveGroupDown: (groupLabel) => `D\xE9placer ${groupLabel} vers le bas`,
    macros: "Macros",
    favorites: "Favoris",
    volume: "Volume",
    channel: "Cha\xEEne",
    mediaControls: "Lecture",
    dvr: "DVR",
    resetDefaultLayout: "R\xE9initialiser",
    shortcutSlotLeft: "Raccourci gauche",
    shortcutSlotMiddle: "Raccourci central",
    shortcutSlotRight: "Raccourci droit",
    shortcutIcon: "Ic\xF4ne",
    shortcutCommand: "Commande",
    shortcutReset: "R\xE9initialiser",
    shortcutCommandMissing: (id) => `Commande ${id} (manquante)`,
    shortcutsCommandsLoading: "Chargement des commandes\u2026",
    shortcutsCommandsUnavailable: "Les commandes de cet appareil ne sont pas encore en cache. Actualisez l\u2019appareil dans l\u2019onglet Hub du Panneau de contr\xF4le Sofabaton, puis rechargez le tableau de bord.",
    shortcutsCommandsError: "Impossible de charger les commandes de cet appareil. Rechargez le tableau de bord et r\xE9essayez.",
    noteDefaultLayout: "Utilis\xE9e pour les activit\xE9s sans disposition propre",
    noteDeviceDefaultLayout: "Utilis\xE9e pour les appareils sans disposition propre",
    noteCustomActivityLayout: "Disposition d\u2019activit\xE9 personnalis\xE9e utilis\xE9e",
    noteCustomDeviceLayout: "Disposition d\u2019appareil personnalis\xE9e utilis\xE9e",
    noteUsingActivityDefault: "Disposition par d\xE9faut des activit\xE9s utilis\xE9e",
    noteUsingDeviceDefault: "Disposition par d\xE9faut des appareils utilis\xE9e"
  },
  groups: {
    activity: "Activit\xE9/appareil",
    macro_favorites: "Macros/favoris",
    macros_row: "Ligne des macros",
    favorites_row: "Ligne des favoris",
    dpad: "Pav\xE9 directionnel",
    nav: "Retour/Accueil/Menu",
    mid: "Volume/Cha\xEEne",
    media: "Lecture",
    colors: "Touches de couleur",
    abc: "A/B/C",
    shortcuts: "Raccourcis"
  },
  keys: {
    up: "Haut",
    down: "Bas",
    left: "Gauche",
    right: "Droite",
    ok: "OK",
    back: "Retour",
    home: "Accueil",
    menu: "Menu",
    volup: "Volume +",
    voldn: "Volume -",
    mute: "Muet",
    chup: "Cha\xEEne +",
    chdn: "Cha\xEEne -",
    guide: "Guide",
    dvr: "DVR",
    play: "Lecture",
    exit: "Quitter",
    rew: "Retour rapide",
    pause: "Pause",
    fwd: "Avance rapide",
    red: "Rouge",
    green: "Vert",
    yellow: "Jaune",
    blue: "Bleu",
    a: "A",
    b: "B",
    c: "C"
  }
};
registerRemoteCardTranslation("fr", REMOTE_CARD_STRINGS_FR);

// remote-card/src/remote-card-translations/nl.ts
var REMOTE_CARD_STRINGS_NL = {
  card: {
    selectEntityError: "Selecteer een Sofabaton-entiteit voor afstandsbediening",
    remoteUnavailable: "De afstandsbediening is niet beschikbaar (mogelijk omdat de Sofabaton-app verbonden is).",
    noActivitiesWarning: "Geen activiteiten gevonden in de attributen van de afstandsbediening.",
    noMacros: "Geen macro's beschikbaar",
    noFavorites: "Geen favorieten beschikbaar",
    noCommands: "Geen commando's beschikbaar",
    macrosTab: "Macro's",
    favoritesTab: "Favorieten",
    commandsTab: "Commando's",
    powerButton: "In-/uitschakelen",
    activitySelectLabel: "Activiteit",
    deviceSelectLabel: "Apparaat",
    selectDevice: "Selecteer apparaat",
    allDevicesLayout: "Standaardindeling voor apparaten",
    filterCommands: "Commando's filteren",
    switchToDeviceMode: "Naar apparaatmodus schakelen",
    switchToActivityMode: "Naar activiteitsmodus schakelen",
    deviceKeymapMissing: "De commando's van dit apparaat zijn nog niet gecachet. Vernieuw het apparaat op het tabblad Hub van het Sofabaton-bedieningspaneel en laad daarna het dashboard opnieuw.",
    deviceKeymapError: "Kan de commando's van dit apparaat niet laden.",
    poweredOff: "Uitgeschakeld",
    defaultLayout: "Standaardindeling voor activiteiten",
    activityFallback: (id) => `Activiteit ${id}`,
    deviceFallback: (id) => `Apparaat ${id}`,
    pickerName: "Sofabaton virtuele afstandsbediening",
    pickerDescription: "Een configureerbare afstandsbediening voor de Sofabaton X1-, X1S- en X2-integratie."
  },
  assist: {
    label: "Knopdrukken registreren",
    start: "Starten",
    waiting: "Wachten op een knopdruk",
    exitEditMode: "Verlaat de bewerkingsmodus om te beginnen",
    captured: (label) => `Vastgelegd: ${label}`,
    notCaptured: "Niet vastgelegd.",
    working: "Bezig\u2026",
    triggersReady: "Triggers klaar voor gebruik",
    createTriggers: "MQTT Discovery-triggers aanmaken",
    startCapturing: "Begin met commando's vastleggen",
    deviceDetectedTitle: "Sofabaton-MQTT-apparaat gedetecteerd.",
    close: "Sluiten",
    alsoActivityTriggers: "Maak ook triggers aan voor activiteitswisselingen.",
    seeDocs: "Bekijk de documentatie voor deze functie.",
    dontShowAgain: "Dit tijdens deze sessie niet opnieuw tonen voor dit apparaat.",
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
    automationAssistName: "Automatiseringshulp",
    notification: {
      title: "\u{1F6E0}\uFE0F Automatiseringshulp",
      eventButton: (label) => `Knop: ${label}`,
      eventCommand: (label) => `Commando: ${label}`,
      eventActivity: (label) => `Activiteitswissel: ${label}`,
      eventOther: (label) => `Gebeurtenis: ${label}`,
      header: (activityName, eventLabel) => `**Activiteit: ${activityName} | ${eventLabel}**`,
      headerDevice: (deviceName, eventLabel) => `**Apparaat: ${deviceName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace-knopcode**",
      lovelaceCopy: "*Kopieer dit naar je dashboard-YAML:*",
      serviceHeading: "\u2699\uFE0F **Service-aanroep (automatisering)**",
      serviceCopy: "*Gebruik dit in je scripts of automatiseringen:*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "Selecteer een Sofabaton-entiteit voor afstandsbediening",
      theme: "Pas een thema toe op de kaart",
      use_background_override: "Achtergrondkleur aanpassen",
      background_override: "Kies een achtergrondkleur",
      show_activity: "Activiteits-/apparaatkiezer",
      show_dpad: "Richtingsknoppen",
      show_nav: "Terug/Home/Menu-knoppen",
      show_mid: "Volume-/kanaalknoppen",
      show_media: "Afspelen",
      show_colors: "Rood/groen/geel/blauw",
      show_abc: "A/B/C-knoppen",
      show_macros_button: "Macroknop",
      show_favorites_button: "Favorietenknop",
      max_width: "Maximale kaartbreedte (px)",
      key_style: "Knopstijl",
      group_order: "Groepsvolgorde"
    },
    generalOptionsTitle: "Algemene opties",
    keyCapture: "Knopdrukken registreren",
    keyCaptureDescription: "Stuur knopdrukken naar de hub: leg knopdrukken vast om direct bruikbare YAML te genereren voor dashboardknoppen en automatiseringen.",
    keyCaptureLearnMore: "Meer informatie over Knopdrukken registreren",
    keyCaptureDocsAria: "Documentatie over Knopdrukken registreren",
    stylingOptions: "Stijlopties",
    keyStyleFlat: "Vlak (zelfde kleur als de kaart)",
    keyStyleTinted: "Getint (knoppen steken af tegen de achtergrond)",
    keyStyleElevated: "Verhoogd (getint met schaduw)",
    keyStyleGlossy: "Glanzend (glimmende, bolle knoppen)",
    tintedPanels: "Getinte panelen",
    tintedPanelsDescription: "Toont een getinte achtergrond achter elke groep knoppen.",
    layoutOptions: "Indelingsopties",
    layoutSelectLabel: "Indeling",
    defaultLayoutOption: "Standaardindeling voor activiteiten",
    allDevicesOption: "Standaardindeling voor apparaten",
    commands: "Commando's",
    power: "Aan/uit-knop",
    modeToggle: "Modusknop",
    deviceModeDescription: "Bedien \xE9\xE9n apparaat dat op de hub is ingesteld met de knoptoewijzingen en volledige lijst met commando's van dat apparaat.",
    longPress: "Herhalen bij ingedrukt houden inschakelen",
    longPressDescription: "Houd een geselecteerde knop ingedrukt om het bijbehorende commando te herhalen, net als op de fysieke afstandsbediening.",
    longPressButtons: "Knoppen",
    enableDeviceMode: "Apparaatmodus inschakelen",
    initialView: "Beginweergave",
    initialViewHelper: "Wat de kaart toont bij het openen",
    openOnCurrentActivity: "Huidige activiteit",
    macrosFavoritesAsRows: "Macro's/favorieten als rijen",
    commandsAsRows: "Commando's als rijen",
    visibleRows: "Zichtbare rijen",
    moveGroupUp: (groupLabel) => `Verplaats ${groupLabel} omhoog`,
    moveGroupDown: (groupLabel) => `Verplaats ${groupLabel} omlaag`,
    macros: "Macro's",
    favorites: "Favorieten",
    volume: "Volume",
    channel: "Kanaal",
    mediaControls: "Afspelen",
    dvr: "DVR",
    resetDefaultLayout: "Indeling resetten",
    shortcutSlotLeft: "Linker snelkoppeling",
    shortcutSlotMiddle: "Middelste snelkoppeling",
    shortcutSlotRight: "Rechter snelkoppeling",
    shortcutIcon: "Pictogram",
    shortcutCommand: "Commando",
    shortcutReset: "Resetten",
    shortcutCommandMissing: (id) => `Commando ${id} (ontbreekt)`,
    shortcutsCommandsLoading: "Commando's laden\u2026",
    shortcutsCommandsUnavailable: "De commando's van dit apparaat zijn nog niet gecachet. Vernieuw het apparaat op het tabblad Hub van het Sofabaton-bedieningspaneel en laad daarna het dashboard opnieuw.",
    shortcutsCommandsError: "Kan de commando's van dit apparaat niet laden. Laad het dashboard opnieuw en probeer het nogmaals.",
    noteDefaultLayout: "Gebruikt voor activiteiten zonder eigen indeling",
    noteDeviceDefaultLayout: "Gebruikt voor apparaten zonder eigen indeling",
    noteCustomActivityLayout: "Aangepaste activiteitenindeling in gebruik",
    noteCustomDeviceLayout: "Aangepaste apparaatindeling in gebruik",
    noteUsingActivityDefault: "Standaardindeling voor activiteiten in gebruik",
    noteUsingDeviceDefault: "Standaardindeling voor apparaten in gebruik"
  },
  groups: {
    activity: "Activiteit/apparaat",
    macro_favorites: "Macro's/favorieten",
    macros_row: "Macrorij",
    favorites_row: "Favorietenrij",
    dpad: "Richtingsknoppen",
    nav: "Terug/Home/Menu",
    mid: "Volume/kanaal",
    media: "Afspelen",
    colors: "Kleurknoppen",
    abc: "A/B/C",
    shortcuts: "Snelkoppelingen"
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
    chup: "CH +",
    chdn: "CH -",
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
};
registerRemoteCardTranslation("nl", REMOTE_CARD_STRINGS_NL);

// remote-card/src/remote-card-translations/zh-hans.ts
var REMOTE_CARD_STRINGS_ZH_HANS = {
  card: {
    selectEntityError: "\u8BF7\u9009\u62E9 Sofabaton \u9065\u63A7\u5B9E\u4F53",
    remoteUnavailable: "\u9065\u63A7\u4E0D\u53EF\u7528\uFF08\u53EF\u80FD\u662F\u56E0\u4E3A Sofabaton \u5E94\u7528\u5DF2\u8FDE\u63A5\uFF09\u3002",
    noActivitiesWarning: "\u5728\u9065\u63A7\u5C5E\u6027\u4E2D\u672A\u627E\u5230\u6D3B\u52A8\u3002",
    noMacros: "\u6CA1\u6709\u53EF\u7528\u7684\u5B8F",
    noFavorites: "\u6CA1\u6709\u53EF\u7528\u7684\u6536\u85CF",
    noCommands: "\u6CA1\u6709\u53EF\u7528\u547D\u4EE4",
    macrosTab: "\u5B8F",
    favoritesTab: "\u6536\u85CF",
    commandsTab: "\u547D\u4EE4",
    powerButton: "\u5207\u6362\u7535\u6E90",
    activitySelectLabel: "\u6D3B\u52A8",
    deviceSelectLabel: "\u8BBE\u5907",
    selectDevice: "\u9009\u62E9\u8BBE\u5907",
    allDevicesLayout: "\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40",
    filterCommands: "\u7B5B\u9009\u547D\u4EE4",
    switchToDeviceMode: "\u5207\u6362\u5230\u8BBE\u5907\u6A21\u5F0F",
    switchToActivityMode: "\u5207\u6362\u5230\u6D3B\u52A8\u6A21\u5F0F",
    deviceKeymapMissing: "\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u5C1A\u672A\u7F13\u5B58\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u7684 Hub \u6807\u7B7E\u9875\u4E2D\u5237\u65B0\u6B64\u8BBE\u5907\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\u3002",
    deviceKeymapError: "\u65E0\u6CD5\u52A0\u8F7D\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u3002",
    poweredOff: "\u5DF2\u5173\u673A",
    defaultLayout: "\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",
    activityFallback: (id) => `\u6D3B\u52A8 ${id}`,
    deviceFallback: (id) => `\u8BBE\u5907 ${id}`,
    pickerName: "Sofabaton \u865A\u62DF\u9065\u63A7\u5668",
    pickerDescription: "\u9002\u7528\u4E8E Sofabaton X1\u3001X1S \u548C X2 \u96C6\u6210\u7684\u53EF\u914D\u7F6E\u9065\u63A7\u5668\u3002"
  },
  assist: {
    label: "\u6309\u952E\u6355\u83B7",
    start: "\u5F00\u59CB",
    waiting: "\u7B49\u5F85\u6309\u952E",
    exitEditMode: "\u9000\u51FA\u7F16\u8F91\u6A21\u5F0F\u540E\u5373\u53EF\u5F00\u59CB",
    captured: (label) => `\u5DF2\u6355\u83B7\uFF1A${label}`,
    notCaptured: "\u5C1A\u672A\u6355\u83B7\u3002",
    working: "\u6B63\u5728\u5904\u7406\u2026",
    triggersReady: "\u89E6\u53D1\u5668\u5DF2\u5C31\u7EEA",
    createTriggers: "\u521B\u5EFA MQTT Discovery \u89E6\u53D1\u5668",
    startCapturing: "\u5F00\u59CB\u6355\u83B7\u547D\u4EE4",
    deviceDetectedTitle: "\u5DF2\u68C0\u6D4B\u5230 Sofabaton MQTT \u8BBE\u5907\u3002",
    close: "\u5173\u95ED",
    alsoActivityTriggers: "\u540C\u65F6\u4E3A\u6D3B\u52A8\u53D8\u66F4\u521B\u5EFA\u89E6\u53D1\u5668\u3002",
    seeDocs: "\u67E5\u770B\u6B64\u529F\u80FD\u7684\u6587\u6863\u3002",
    dontShowAgain: "\u672C\u6B21\u4F1A\u8BDD\u4E2D\u4E0D\u518D\u4E3A\u6B64\u8BBE\u5907\u663E\u793A\u6B64\u63D0\u793A\u3002",
    detectedDevice: (name) => `\u68C0\u6D4B\u5230 MQTT \u8BBE\u5907\uFF1A${name}\u3002`,
    lastCommand: (name) => `\u6700\u540E\u4E00\u4E2A\u547D\u4EE4\uFF1A${name}\u3002`,
    existingTriggers: "\u53D1\u73B0\u5DF2\u6709\u7684 MQTT \u81EA\u52A8\u5316\u89E6\u53D1\u5668\u3002",
    noMqttCommands: "\u5C1A\u672A\u53D1\u73B0 MQTT \u547D\u4EE4",
    deviceFallback: (id) => `\u8BBE\u5907 ${id}`,
    unknownDevice: "\u672A\u77E5\u8BBE\u5907",
    commandFallback: (id) => `\u547D\u4EE4 ${id}`,
    createdTriggers: (count, deviceLabel) => `\u5DF2\u4E3A\u201C${deviceLabel}\u201D\u521B\u5EFA ${count} \u4E2A MQTT Discovery \u89E6\u53D1\u5668`,
    createdActivityTriggers: (count) => `\u5DF2\u4E3A X2 \u2192 \u6D3B\u52A8\u521B\u5EFA ${count} \u4E2A\u6D3B\u52A8\u89E6\u53D1\u5668`,
    plusActivityTriggers: (count) => `\uFF0C\u53E6\u521B\u5EFA ${count} \u4E2A\u6D3B\u52A8\u89E6\u53D1\u5668`,
    allTriggersExist: (deviceLabel) => `\u201C${deviceLabel}\u201D\u7684\u6240\u6709 MQTT Discovery \u89E6\u53D1\u5668\u5747\u5DF2\u5B58\u5728`,
    buttonFallback: "\u6309\u952E",
    activityFallbackLabel: "\u6D3B\u52A8",
    unknown: "\u672A\u77E5",
    automationAssistName: "\u81EA\u52A8\u5316\u52A9\u624B",
    notification: {
      title: "\u{1F6E0}\uFE0F \u81EA\u52A8\u5316\u52A9\u624B",
      eventButton: (label) => `\u6309\u952E\uFF1A${label}`,
      eventCommand: (label) => `\u547D\u4EE4\uFF1A${label}`,
      eventActivity: (label) => `\u6D3B\u52A8\u53D8\u66F4\uFF1A${label}`,
      eventOther: (label) => `\u4E8B\u4EF6\uFF1A${label}`,
      header: (activityName, eventLabel) => `**\u6D3B\u52A8\uFF1A${activityName} | ${eventLabel}**`,
      headerDevice: (deviceName, eventLabel) => `**\u8BBE\u5907\uFF1A${deviceName} | ${eventLabel}**`,
      lovelaceHeading: "\u{1F4CB} **Lovelace \u6309\u94AE\u4EE3\u7801**",
      lovelaceCopy: "*\u5C06\u5176\u590D\u5236\u5230\u4EEA\u8868\u677F YAML \u4E2D\uFF1A*",
      serviceHeading: "\u2699\uFE0F **\u670D\u52A1\u8C03\u7528\uFF08\u81EA\u52A8\u5316\uFF09**",
      serviceCopy: "*\u5728\u811A\u672C\u6216\u81EA\u52A8\u5316\u4E2D\u4F7F\u7528\u6B64\u5185\u5BB9\uFF1A*"
    }
  },
  editor: {
    fieldLabels: {
      entity: "\u9009\u62E9 Sofabaton \u9065\u63A7\u5B9E\u4F53",
      theme: "\u4E3A\u5361\u7247\u5E94\u7528\u4E3B\u9898",
      use_background_override: "\u81EA\u5B9A\u4E49\u80CC\u666F\u989C\u8272",
      background_override: "\u9009\u62E9\u80CC\u666F\u989C\u8272",
      show_activity: "\u6D3B\u52A8/\u8BBE\u5907\u9009\u62E9\u5668",
      show_dpad: "\u65B9\u5411\u952E",
      show_nav: "\u8FD4\u56DE/\u4E3B\u9875/\u83DC\u5355\u952E",
      show_mid: "\u97F3\u91CF/\u9891\u9053\u8C03\u8282\u952E",
      show_media: "\u64AD\u653E",
      show_colors: "\u7EA2/\u7EFF/\u9EC4/\u84DD",
      show_abc: "A/B/C \u6309\u952E",
      show_macros_button: "\u5B8F\u6309\u94AE",
      show_favorites_button: "\u6536\u85CF\u6309\u94AE",
      max_width: "\u5361\u7247\u6700\u5927\u5BBD\u5EA6\uFF08px\uFF09",
      key_style: "\u6309\u952E\u6837\u5F0F",
      group_order: "\u5206\u7EC4\u987A\u5E8F"
    },
    generalOptionsTitle: "\u5E38\u89C4\u9009\u9879",
    keyCapture: "\u6309\u952E\u6355\u83B7",
    keyCaptureDescription: "\u5C06\u6309\u952E\u64CD\u4F5C\u53D1\u9001\u5230 Hub\uFF0C\u4EE5\u751F\u6210\u53EF\u76F4\u63A5\u7528\u4E8E\u4EEA\u8868\u677F\u6309\u94AE\u548C\u81EA\u52A8\u5316\u7684 YAML\u3002",
    keyCaptureLearnMore: "\u8BE6\u7EC6\u4E86\u89E3\u6309\u952E\u6355\u83B7",
    keyCaptureDocsAria: "\u6309\u952E\u6355\u83B7\u6587\u6863",
    stylingOptions: "\u6837\u5F0F\u9009\u9879",
    keyStyleFlat: "\u6241\u5E73\uFF08\u4E0E\u5361\u7247\u80CC\u666F\u76F8\u540C\uFF09",
    keyStyleTinted: "\u7740\u8272\uFF08\u6309\u952E\u4E0E\u80CC\u666F\u533A\u5206\u5F00\uFF09",
    keyStyleElevated: "\u60AC\u6D6E\uFF08\u7740\u8272\u5E76\u5E26\u9634\u5F71\uFF09",
    keyStyleGlossy: "\u5149\u6CFD\uFF08\u6709\u5149\u6CFD\u7684\u7ACB\u4F53\u6309\u952E\uFF09",
    tintedPanels: "\u7740\u8272\u9762\u677F",
    tintedPanelsDescription: "\u5728\u6BCF\u7EC4\u6309\u952E\u540E\u65B9\u663E\u793A\u7740\u8272\u80CC\u666F\u3002",
    layoutOptions: "\u5E03\u5C40\u9009\u9879",
    layoutSelectLabel: "\u5E03\u5C40",
    defaultLayoutOption: "\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",
    allDevicesOption: "\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40",
    commands: "\u547D\u4EE4",
    power: "\u7535\u6E90\u6309\u94AE",
    modeToggle: "\u6A21\u5F0F\u5207\u6362",
    deviceModeDescription: "\u63A7\u5236 Hub \u4E2D\u914D\u7F6E\u7684\u5355\u4E2A\u8BBE\u5907\uFF0C\u5E76\u4F7F\u7528\u8BE5\u8BBE\u5907\u81EA\u5DF1\u7684\u6309\u952E\u5206\u914D\u548C\u5B8C\u6574\u547D\u4EE4\u5217\u8868\u3002",
    longPress: "\u542F\u7528\u957F\u6309\u91CD\u590D\u53D1\u9001",
    longPressDescription: "\u6309\u4F4F\u6240\u9009\u6309\u952E\u53EF\u91CD\u590D\u53D1\u9001\u5176\u547D\u4EE4\uFF0C\u5C31\u50CF\u4F7F\u7528\u7269\u7406\u9065\u63A7\u5668\u4E00\u6837\u3002",
    longPressButtons: "\u6309\u952E",
    enableDeviceMode: "\u542F\u7528\u8BBE\u5907\u6A21\u5F0F",
    initialView: "\u521D\u59CB\u89C6\u56FE",
    initialViewHelper: "\u5361\u7247\u6253\u5F00\u65F6\u663E\u793A\u7684\u5185\u5BB9",
    openOnCurrentActivity: "\u5F53\u524D\u6D3B\u52A8",
    macrosFavoritesAsRows: "\u5C06\u5B8F/\u6536\u85CF\u663E\u793A\u4E3A\u884C",
    commandsAsRows: "\u5C06\u547D\u4EE4\u663E\u793A\u4E3A\u884C",
    visibleRows: "\u53EF\u89C1\u884C",
    moveGroupUp: (groupLabel) => `\u5C06${groupLabel}\u4E0A\u79FB`,
    moveGroupDown: (groupLabel) => `\u5C06${groupLabel}\u4E0B\u79FB`,
    macros: "\u5B8F",
    favorites: "\u6536\u85CF",
    volume: "\u97F3\u91CF",
    channel: "\u9891\u9053",
    mediaControls: "\u64AD\u653E",
    dvr: "DVR",
    resetDefaultLayout: "\u91CD\u7F6E\u5E03\u5C40",
    shortcutSlotLeft: "\u5DE6\u4FA7\u5FEB\u6377\u6309\u952E",
    shortcutSlotMiddle: "\u4E2D\u95F4\u5FEB\u6377\u6309\u952E",
    shortcutSlotRight: "\u53F3\u4FA7\u5FEB\u6377\u6309\u952E",
    shortcutIcon: "\u56FE\u6807",
    shortcutCommand: "\u547D\u4EE4",
    shortcutReset: "\u91CD\u7F6E",
    shortcutCommandMissing: (id) => `\u547D\u4EE4 ${id}\uFF08\u7F3A\u5931\uFF09`,
    shortcutsCommandsLoading: "\u6B63\u5728\u52A0\u8F7D\u547D\u4EE4\u2026",
    shortcutsCommandsUnavailable: "\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u5C1A\u672A\u7F13\u5B58\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u7684 Hub \u6807\u7B7E\u9875\u4E2D\u5237\u65B0\u6B64\u8BBE\u5907\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\u3002",
    shortcutsCommandsError: "\u65E0\u6CD5\u52A0\u8F7D\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",
    noteDefaultLayout: "\u7528\u4E8E\u6CA1\u6709\u5355\u72EC\u5E03\u5C40\u7684\u6D3B\u52A8",
    noteDeviceDefaultLayout: "\u7528\u4E8E\u6CA1\u6709\u5355\u72EC\u5E03\u5C40\u7684\u8BBE\u5907",
    noteCustomActivityLayout: "\u6B63\u5728\u4F7F\u7528\u81EA\u5B9A\u4E49\u6D3B\u52A8\u5E03\u5C40",
    noteCustomDeviceLayout: "\u6B63\u5728\u4F7F\u7528\u81EA\u5B9A\u4E49\u8BBE\u5907\u5E03\u5C40",
    noteUsingActivityDefault: "\u6B63\u5728\u4F7F\u7528\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",
    noteUsingDeviceDefault: "\u6B63\u5728\u4F7F\u7528\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40"
  },
  groups: {
    activity: "\u6D3B\u52A8/\u8BBE\u5907",
    macro_favorites: "\u5B8F/\u6536\u85CF",
    macros_row: "\u5B8F\u884C",
    favorites_row: "\u6536\u85CF\u884C",
    dpad: "\u65B9\u5411\u952E",
    nav: "\u8FD4\u56DE/\u4E3B\u9875/\u83DC\u5355",
    mid: "\u97F3\u91CF/\u9891\u9053",
    media: "\u64AD\u653E",
    colors: "\u5F69\u8272\u6309\u952E",
    abc: "A/B/C",
    shortcuts: "\u5FEB\u6377\u6309\u952E"
  },
  keys: {
    up: "\u4E0A",
    down: "\u4E0B",
    left: "\u5DE6",
    right: "\u53F3",
    ok: "\u786E\u5B9A",
    back: "\u8FD4\u56DE",
    home: "\u4E3B\u9875",
    menu: "\u83DC\u5355",
    volup: "\u97F3\u91CF +",
    voldn: "\u97F3\u91CF -",
    mute: "\u9759\u97F3",
    chup: "\u9891\u9053 +",
    chdn: "\u9891\u9053 -",
    guide: "\u8282\u76EE\u6307\u5357",
    dvr: "DVR",
    play: "\u64AD\u653E",
    exit: "\u9000\u51FA",
    rew: "\u5FEB\u9000",
    pause: "\u6682\u505C",
    fwd: "\u5FEB\u8FDB",
    red: "\u7EA2",
    green: "\u7EFF",
    yellow: "\u9EC4",
    blue: "\u84DD",
    a: "A",
    b: "B",
    c: "C"
  }
};
registerRemoteCardTranslation("zh-hans", REMOTE_CARD_STRINGS_ZH_HANS);

// node_modules/lit-html/directives/keyed.js
var i7 = e4(class extends i5 {
  constructor() {
    super(...arguments), this.key = A;
  }
  render(r6, t5) {
    return this.key = r6, t5;
  }
  update(r6, [t5, e6]) {
    return t5 !== this.key && (p3(r6), this.key = t5), e6;
  }
});

// server-panel/src/components/bottom-dock.ts
function renderBottomDock(params) {
  const { model, message } = params;
  let tone = "";
  let center;
  let actions = A;
  if (model.kind === "running") {
    tone = "dock--running";
    center = b2`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = model.cancellable ? b2`<button class="small dock-action" id="dock-cancel" type="button" ?disabled=${model.cancelling} @click=${params.onCancel}>${model.cancelling ? "Cancelling\u2026" : "Cancel"}</button>` : A;
  } else if (message) {
    tone = message.ok ? "dock--message" : "dock--error";
    center = b2`<span class="dock-status" id="hubs-msg">${message.text}</span>`;
  } else if (model.kind === "notice") {
    tone = `dock--${model.notice.tone}`;
    center = b2`<span class="dock-status" id="dock-status">${model.notice.label}${model.notice.detail ? b2`<span class="dock-detail"> · ${model.notice.detail}</span>` : A}</span>`;
    actions = b2`<button class="small dock-action" id="dock-dismiss" type="button" @click=${params.onDismiss}>Dismiss</button>`;
  } else if (model.kind === "apply_stopped") {
    tone = "dock--warn";
    center = b2`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = b2`
      ${model.resumable ? b2`<button class="small primary dock-action" id="dock-resume" type="button" @click=${() => params.onResume(model.applyId)}>Resume</button>` : A}
      <button class="small dock-action" id="dock-discard" type="button" @click=${() => params.onDiscard(model.applyId)}>Discard</button>`;
  } else if (model.kind === "draft_stale") {
    tone = "dock--warn";
    center = b2`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = b2`
      <button class="small primary dock-action" id="dock-keep-draft" type="button" @click=${params.onKeepDraft}>Keep editing</button>
      <button class="small dock-action" id="dock-discard-draft" type="button" @click=${params.onDiscardDraft}>Discard</button>`;
  } else if (model.kind === "dirty") {
    tone = "dock--dirty";
    center = b2`<span class="dock-status" id="dock-status">${model.text}</span>`;
    actions = b2`<button class="small dock-action" id="dock-discard-draft" type="button" @click=${params.onDiscardDraft}>Discard</button>`;
  } else if (model.kind === "gate") {
    tone = "dock--gate";
    center = b2`<span class="dock-status" id="dock-status">${model.text}</span>`;
  } else if (params.docLink) {
    center = b2`<a class="dock-link" id="dock-link" href=${params.docLink.href} target="_blank" rel="noreferrer noopener">${params.docLink.label}</a>`;
  } else {
    center = b2``;
  }
  const progress = model.kind === "running" ? model.progress : null;
  const press = params.press;
  return b2`
    <footer class="dock ${tone}" id="bottom-dock">
      <div class="dock-inner">
        ${progress ? b2`<div class="dock-progress" id="dock-progress" data-indeterminate=${progress.indeterminate ? "true" : "false"} style=${progress.indeterminate || progress.percent == null ? "width: 35%" : `width: ${progress.percent}%`}></div>` : A}
        ${press ? i7(press.at, b2`<div class="dock-flash" id="dock-flash" data-seq=${press.seq} title=${`${press.pressType} press${press.label ? `: ${press.label}` : ""}`} aria-hidden="true"></div>`) : A}
        <div class="dock-center" role="status" aria-live="polite">${center}</div>
        <div class="dock-right">
          ${actions !== A ? b2`<div class="dock-actions">${actions}</div>` : A}
          ${params.hasHub ? b2`<div class="dock-pill-pair" id="dock-pill" role="group" aria-label="connectivity">
                <span class="dock-pill-half ${params.connectivity.hub ? "on" : "off"}" title=${params.connectivity.hub ? "hub connected" : "hub not connected"}>Hub</span>
                <span class="dock-pill-half ${params.connectivity.app ? "on" : "off"}" title=${params.connectivity.app ? "the Sofabaton app is connected" : "the app is not connected"}>App</span>
              </div>` : A}
        </div>
      </div>
    </footer>
  `;
}

// server-panel/src/panel-route.ts
var HUB_TABS = ["hub", "backup", "remote"];
var SUBTABS = {
  hub: ["devices", "activities"],
  backup: ["make", "edit", "restore"],
  remote: ["card", "layout"]
};
var TAB_LABELS = { hub: "Hub", backup: "Backup", remote: "Remote" };
var TOOL_PAGES = ["setup", "server", "debug"];
var TOOL_LABELS = { setup: "Hub setup", server: "Server", debug: "Debug" };
var TOOL_SUBTABS = {
  setup: ["hubs"],
  server: ["status"],
  debug: ["api", "events"]
};
var SUBTAB_LABELS = {
  devices: "Devices",
  activities: "Activities",
  make: "Make",
  edit: "Edit",
  restore: "Restore",
  card: "Card",
  layout: "Layout",
  hubs: "Hubs",
  status: "Status",
  api: "API console",
  events: "Event stream"
};
function isHubTab(value) {
  return typeof value === "string" && HUB_TABS.includes(value);
}
function isToolPage(value) {
  return typeof value === "string" && TOOL_PAGES.includes(value);
}
function normalizeSub(tab, sub) {
  const subs = SUBTABS[tab];
  return sub && subs.includes(sub) ? sub : subs[0];
}
function hubRoute(hubId, tab = "hub", sub) {
  return { kind: "hub", hubId, tab, sub: normalizeSub(tab, sub) };
}
function normalizeToolSub(page, sub) {
  const subs = TOOL_SUBTABS[page];
  return sub && subs.includes(sub) ? sub : subs[0];
}
function toolRoute(page, sub) {
  return { kind: "tool", page, sub: normalizeToolSub(page, sub) };
}
var LEGACY = {
  hubs: toolRoute("setup"),
  catalog: hubRoute(null, "hub"),
  remote: hubRoute(null, "remote"),
  api: toolRoute("debug", "api"),
  events: toolRoute("debug", "events")
};
function parseRoute(hash) {
  const raw = hash.replace(/^#/, "");
  if (!raw) return null;
  if (!raw.startsWith("/")) return LEGACY[raw] ?? null;
  const parts = raw.split("/").filter(Boolean).map((p4) => {
    try {
      return decodeURIComponent(p4);
    } catch {
      return p4;
    }
  });
  if (!parts.length) return null;
  if (isToolPage(parts[0])) return toolRoute(parts[0], parts[1]);
  if (parts.length === 1 && (parts[0] === "api" || parts[0] === "events")) return toolRoute("debug", parts[0]);
  const [first, tab, sub] = parts;
  const hubId = first === "-" ? null : first;
  if (tab !== void 0 && !isHubTab(tab)) return hubRoute(hubId, "hub");
  return hubRoute(hubId, tab ?? "hub", sub);
}
function hashFor(route) {
  if (route.kind === "tool") return `#/${route.page}/${route.sub}`;
  const hub = route.hubId ? encodeURIComponent(route.hubId) : "-";
  return `#/${hub}/${route.tab}/${route.sub}`;
}
function sameRoute(a4, b3) {
  return hashFor(a4) === hashFor(b3);
}
function withHub(route, hubId) {
  return route.kind === "hub" ? { ...route, hubId } : route;
}

// server-panel/src/panel-state.ts
function hubState(hub) {
  if (!hub.enabled) return { text: "disabled", tone: "off" };
  const s7 = hub.status;
  if (!s7) return { text: "not running: the proxy did not start", tone: "err" };
  if (s7.mode === "disconnected" || !s7.hub_connected) return { text: "waiting for the hub to connect", tone: "warn" };
  if (s7.mode === "observe") return { text: s7.app_connected ? "observing: the app holds the hub" : "observing", tone: "warn" };
  return { text: s7.catalog_ready ? "connected, in control" : "connected, first sync running", tone: "ok" };
}
function hubDisplayName(hub) {
  return hub.config?.name || hub.hub_name || hub.hub_id;
}
function formatWhen(iso) {
  if (!iso) return "never";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleString();
}
function actionOutcome(action, record) {
  if (action === "enable") return record?.enabled ? "started" : "enabled";
  return action === "disable" ? "disabled" : "removed";
}
var THEMES = ["auto", "light", "dark"];
function isTheme(value) {
  return typeof value === "string" && THEMES.includes(value);
}
function nextTheme(current) {
  return THEMES[(THEMES.indexOf(current) + 1) % THEMES.length];
}
var PREFS_KEY = "sofabaton-panel";
function loadPrefs(storage) {
  const prefs = { hub: null, tab: "hub", sub: SUBTABS.hub[0], theme: "auto" };
  if (!storage) return prefs;
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return prefs;
    const data = JSON.parse(raw);
    if (typeof data.hub === "string") prefs.hub = data.hub;
    if (isHubTab(data.tab)) prefs.tab = data.tab;
    else if (data.view === "remote") prefs.tab = "remote";
    prefs.sub = normalizeSub(prefs.tab, typeof data.sub === "string" ? data.sub : null);
    if (isTheme(data.theme)) prefs.theme = data.theme;
  } catch {
  }
  return prefs;
}
function savePrefs(storage, prefs) {
  if (!storage) return;
  try {
    storage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
  }
}
var HISTORY_KEY = "sofabaton-panel-history";
var HISTORY_LIMIT = 30;
function loadHistory(storage) {
  if (!storage) return [];
  try {
    const data = JSON.parse(storage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(data) ? data.slice(0, HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}
function saveHistory(storage, history2) {
  if (!storage) return;
  try {
    storage.setItem(HISTORY_KEY, JSON.stringify(history2.slice(0, HISTORY_LIMIT)));
  } catch {
  }
}
function prettyJson(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
function parseHeaderLines(text) {
  const out = {};
  for (const line of text.split("\n")) {
    const i8 = line.indexOf(":");
    if (i8 < 0) continue;
    const name = line.slice(0, i8).trim();
    if (name) out[name] = line.slice(i8 + 1).trim();
  }
  return out;
}

// server-panel/src/components/hub-picker.ts
function renderHubPicker(params) {
  const selected = params.hubs.find((r6) => r6.hub.hub_id === params.selectedHubId) ?? null;
  const label = selected ? hubDisplayName(selected.hub) : params.hubs.length ? "pick a hub" : "no hub";
  const tone = selected ? hubState(selected.hub).tone : "off";
  const interactive = params.hubs.length > 1 || !selected && params.hubs.length > 0;
  if (!interactive) {
    return b2`
      <div class="hub-picker hub-picker--static" id="hub-picker">
        <div class="hub-picker-btn hub-picker-btn--static" id="hub-picker-btn" title=${selected ? `${label} \xB7 ${selected.hub.hub_id}` : "register a hub under the cog menu"}>
          <span class="chip-prefix">Hub</span><span class="dot ${tone}"></span><span class="chip-name">${label}</span>
        </div>
      </div>
    `;
  }
  return b2`
    <div class="hub-picker" id="hub-picker">
      <button class="hub-picker-btn ${params.open ? "is-open" : ""}" id="hub-picker-btn" type="button" title=${label} aria-haspopup="menu" aria-expanded=${String(params.open)} @click=${params.onToggle}>
        <span class="chip-prefix">Hub</span><span class="dot ${tone}"></span><span class="chip-name">${label}</span><svg class="chip-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${params.open ? mdiChevronUp : mdiChevronDown}></path></svg>
      </button>
      ${params.open ? b2`<div class="menu hub-picker-menu" id="hub-picker-menu" role="menu">
            ${params.hubs.map(({ hub }) => {
    const { text, tone: t5 } = hubState(hub);
    return b2`<button class="menu-item hub-option ${hub.hub_id === params.selectedHubId ? "selected" : ""}" type="button" role="menuitemradio" data-hub=${hub.hub_id} aria-checked=${String(hub.hub_id === params.selectedHubId)} @click=${() => params.onSelect(hub.hub_id)}>
                <span class="dot ${t5}"></span><span class="menu-main"><span class="menu-title">${hubDisplayName(hub)}</span><span class="menu-sub">${hub.config.host} · ${text}</span></span>
              </button>`;
  })}
            <div class="menu-sep"></div>
            <button class="menu-item" type="button" role="menuitem" id="hub-picker-setup" @click=${params.onSetup}><span class="menu-main"><span class="menu-title">Hub setup…</span></span></button>
          </div>` : A}
    </div>
  `;
}

// server-panel/src/components/tab-bar.ts
function renderTabBar(params) {
  const route = params.route;
  const onTool = route.kind === "tool";
  return b2`
    <div class="tabs" id="tabs">
      <div class="tabs-scroll" role="tablist" aria-label="Hub sections">
        ${HUB_TABS.map(
    (tab) => b2`<button class="tab-btn ${!onTool && route.tab === tab ? "active" : ""}" type="button" role="tab" data-tab=${tab} aria-selected=${String(!onTool && route.tab === tab)} @click=${() => params.onTab(tab)}>
            <span class="tab-btn-label">${TAB_LABELS[tab]}</span>
          </button>`
  )}
      </div>
      <div class="tab-menu" id="cog">
        <button class="tab-btn tab-btn--menu ${onTool ? "active" : ""} ${params.cogOpen ? "is-open" : ""}" id="cog-btn" type="button" aria-label=${onTool ? `Setup and tools: ${TOOL_LABELS[route.page]}` : "Setup and tools"} aria-haspopup="menu" aria-expanded=${String(params.cogOpen)} title="setup and tools" @click=${params.onToggleCog}>
          <svg class="cog-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${mdiCogOutline}></path></svg><svg class="chip-arrow" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d=${params.cogOpen ? mdiChevronUp : mdiChevronDown}></path></svg>
        </button>
        ${params.cogOpen ? b2`<div class="menu cog-menu" id="cog-menu" role="menu">
              ${TOOL_PAGES.map(
    (page) => b2`<button class="menu-item ${onTool && route.page === page ? "selected" : ""}" type="button" role="menuitemradio" data-page=${page} aria-checked=${String(onTool && route.page === page)} @click=${() => params.onPage(page)}>
                  <span class="menu-main"><span class="menu-title">${TOOL_LABELS[page]}${page === "debug" ? b2` <span class="badge" id="ws-badge" title="events received">${params.eventCount}</span>` : A}</span></span>
                </button>`
  )}
              <div class="menu-sep"></div>
              <button class="menu-item" type="button" role="menuitem" id="theme-toggle" title="theme: ${params.theme}" @click=${params.onTheme}>
                <span class="menu-main"><span class="menu-title">Theme: ${params.theme}</span><span class="menu-sub">tap to cycle auto, light, dark</span></span>
              </button>
            </div>` : A}
      </div>
    </div>
    <div class="subtabs" id="subtabs" role="tablist" aria-label=${onTool ? TOOL_LABELS[route.page] : TAB_LABELS[route.tab]} data-page=${onTool ? route.page : route.tab}>
      ${(onTool ? TOOL_SUBTABS[route.page] : SUBTABS[route.tab]).map(
    (sub) => b2`<button class="subtab-btn ${route.sub === sub ? "active" : ""}" type="button" role="tab" data-sub=${sub} aria-selected=${String(route.sub === sub)} @click=${() => params.onSub(sub)}>${SUBTAB_LABELS[sub] ?? sub}</button>`
  )}
    </div>
  `;
}

// remote-card/src/backend/server-backend.ts
var SERVER_API_PREFIX = "/api/v1";
var MAX_RECONNECT_DELAY_MS = 3e4;
function toNumber(value) {
  if (value == null || value === "") return null;
  const n7 = Number(value);
  return Number.isFinite(n7) ? n7 : null;
}
function errorText(err) {
  return err instanceof Error ? err.message : String(err);
}
function longPressPairs(buttons) {
  const out = {};
  for (const button of buttons) {
    const device = toNumber(button.long_press_device_id);
    const command = toNumber(button.long_press_command_id);
    if (device && command != null) {
      out[String(button.button_code)] = { device_id: device, command_id: command };
    }
  }
  return out;
}
var ServerRemoteBackend = class _ServerRemoteBackend {
  constructor(options = {}) {
    this.kind = "server";
    this.hubId = "";
    this.listeners = [];
    // Server-side state, in wire shapes
    this.hubStatus = null;
    this.activities = [];
    this.devices = [];
    this.running = null;
    this.activityPages = {};
    this.devicePages = {};
    /** Bumped when a device page is re-read; the store refetches on a change. */
    this.devicePageVersions = {};
    this.loaded = false;
    /** The catalog has been read at least once (a disabled hub answers 409 to reads). */
    this.catalogLoaded = false;
    this._lastError = null;
    /** True until the server has answered (or failed) once for this target. */
    this.firstAnswerPending = true;
    // Load ordering
    this.loadEpoch = 0;
    this.loadPromise = null;
    this.loadDirty = false;
    this.runningEpoch = 0;
    this.statusPromise = null;
    this.statusDirty = false;
    this.pagePromises = {};
    // Retry of failed HTTP work (independent of the socket)
    this.retryTimer = null;
    // Snapshot cache: rebuilt lazily, invalidated on every mutation
    this.snapshotCache = null;
    // Stream
    this.socket = null;
    this.socketGeneration = 0;
    this.reconnectTimer = null;
    this.streaming = false;
    this.baseUrl = String(options.baseUrl ?? "").replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.wsFactory = options.webSocket ?? (typeof WebSocket === "function" ? (url) => new WebSocket(url) : null);
    this.retryBaseMs = Math.max(100, options.reconnectDelayMs ?? 1e3);
    this.reconnectDelay = this.retryBaseMs;
    this.retryDelay = this.retryBaseMs;
  }
  // ---------- RemoteBackend ----------
  get target() {
    return this.hubId;
  }
  /** The last failed request or stream error, for the page to show. */
  get lastError() {
    return this._lastError;
  }
  setTarget(target) {
    const next = String(target ?? "");
    if (next === this.hubId) return;
    this.hubId = next;
    this.resetState();
    this.closeSocket();
    if (this.listeners.length) this.start();
  }
  snapshot() {
    if (!this.hubId) return void 0;
    if (this.snapshotCache === null) this.snapshotCache = this.buildSnapshot();
    return this.snapshotCache;
  }
  subscribe(listener) {
    this.listeners.push(listener);
    if (this.listeners.length === 1) this.start();
    return () => {
      this.listeners = this.listeners.filter((entry) => entry !== listener);
      if (!this.listeners.length) this.stop();
    };
  }
  async probeIntegration() {
    if (!this.hubId) throw new Error("no hub selected");
    await this.ensureLoaded();
    if (!this.hubStatus) throw new Error(this._lastError ?? "hub status unavailable");
    return "x1s";
  }
  async devicePowerState(deviceId) {
    try {
      const response = await this.get(
        `/devices/${deviceId}/power-state`
      );
      const raw = response?.power_state;
      return raw === 1 ? 1 : raw === 0 ? 0 : null;
    } catch (_err) {
      return null;
    }
  }
  /**
   * `null` ("cannot fetch yet, ask again") until the catalog has been read
   * from a healthy hub; a device missing from a loaded catalog is a real
   * miss. The page is fetched once and re-read when `snapshot_changed`
   * names the device; the store follows through `keymap_versions`.
   */
  async deviceKeymap(deviceId) {
    if (!this.hubId) return null;
    await this.ensureLoaded();
    if (!this.hubStatus || !this.loaded || !this.catalogLoaded) return null;
    const device = this.devices.find((entry) => entry.device_id === deviceId);
    if (!device) return { keymap: null, reason: "cache_miss" };
    const key = String(deviceId);
    if (!this.devicePages[key]) {
      await this.readDevicePage(deviceId);
      if (!this.devicePages[key]) return null;
    }
    const page = this.devicePages[key];
    return {
      keymap: {
        device: {
          device_id: device.device_id,
          name: device.name,
          device_class: device.device_class ?? void 0
        },
        buttons: page.buttons.map((button) => button.button_code),
        bindings: page.buttons.filter((button) => button.command_id != null).map((button) => ({
          button_id: button.button_code,
          button_name: button.name,
          command_id: Number(button.command_id),
          long_press_command_id: button.long_press_command_id ?? null
        })),
        commands: page.commands.map((command) => ({
          command_id: command.command_id,
          name: command.label
        })),
        // Same gate as the HA projection: idle-behavior byte 1..3.
        power_configured: device.idle_behavior != null && [1, 2, 3].includes(Number(device.idle_behavior))
      }
    };
  }
  async sendCommand(commandId, scopeId) {
    const command = toNumber(commandId);
    if (command == null) return;
    let scope = toNumber(scopeId);
    if (!scope) scope = this.running?.activity_id ?? null;
    if (scope == null) return;
    await this.post(`/send`, { entity_id: scope, command_id: command });
  }
  async startActivity(activity) {
    const id = activity.id ?? this.activities.find((entry) => entry.name === activity.name)?.activity_id ?? null;
    if (id == null) return;
    await this.post(`/activities/${id}/start`);
  }
  async stopActivity() {
    const id = this.running?.activity_id;
    if (id == null) return;
    await this.post(`/activities/${id}/stop`);
  }
  // ---------- lifecycle ----------
  /** Begin loading and streaming; idempotent. subscribe() calls it. */
  start() {
    if (!this.hubId) return;
    void this.ensureLoaded();
    this.openSocket();
  }
  stop() {
    this.closeSocket();
    this.cancelRetry();
  }
  resetState() {
    this.hubStatus = null;
    this.firstAnswerPending = true;
    this.activities = [];
    this.devices = [];
    this.running = null;
    this.activityPages = {};
    this.devicePages = {};
    this.devicePageVersions = {};
    this.loaded = false;
    this.catalogLoaded = false;
    this._lastError = null;
    this.loadEpoch += 1;
    this.runningEpoch += 1;
    this.loadDirty = false;
    this.statusDirty = false;
    this.pagePromises = {};
    this.cancelRetry();
    this.invalidate();
  }
  /**
   * Reads other than /status answer 409 while the hub is disabled. An
   * app-held (observe) hub still answers reads from the cache, so the
   * catalog is read and shown greyed out.
   */
  static readable(status) {
    return Boolean(status && status.enabled && status.status);
  }
  invalidate() {
    this.snapshotCache = null;
  }
  notify() {
    for (const listener of [...this.listeners]) listener();
  }
  // ---------- HTTP ----------
  url(path) {
    return `${this.baseUrl}${SERVER_API_PREFIX}/hubs/${encodeURIComponent(this.hubId)}${path}`;
  }
  async get(path) {
    const response = await this.fetchImpl(this.url(path), {
      headers: { accept: "application/json" }
    });
    if (!response.ok) throw new Error(`GET ${path} -> ${response.status}`);
    return await response.json();
  }
  async post(path, body) {
    const response = await this.fetchImpl(this.url(path), {
      method: "POST",
      headers: body ? { accept: "application/json", "content-type": "application/json" } : { accept: "application/json" },
      body: body ? JSON.stringify(body) : void 0
    });
    if (!response.ok) throw new Error(`POST ${path} -> ${response.status}`);
  }
  // ---------- loading ----------
  /** Load once; a load already in flight is shared. */
  ensureLoaded() {
    if (this.loaded) return Promise.resolve();
    return this.loadPromise ?? this.reload();
  }
  /**
   * Request a full reload. A load in flight is superseded: its results are
   * discarded when they arrive and the load runs again, so a request that
   * lands mid-load is never lost.
   */
  reload() {
    this.loadEpoch += 1;
    if (this.loadPromise) {
      this.loadDirty = true;
      return this.loadPromise;
    }
    this.loadPromise = (async () => {
      do {
        this.loadDirty = false;
        await this.loadAll(this.loadEpoch);
      } while (this.loadDirty);
    })().finally(() => {
      this.loadPromise = null;
    });
    return this.loadPromise;
  }
  /**
   * Full load: status first, then (only while the hub is readable) the
   * catalog, the running activity, and the running activity's pages. A
   * disabled or app-held hub keeps whatever catalog was read before and
   * shows as unavailable, not as unreachable.
   */
  async loadAll(epoch) {
    if (!this.hubId) return;
    const hubId = this.hubId;
    const runningEpoch = this.runningEpoch;
    const current = () => epoch === this.loadEpoch && hubId === this.hubId;
    try {
      const status = await this.get(`/status`);
      if (!current()) return;
      this.hubStatus = status;
      this.firstAnswerPending = false;
      this._lastError = null;
      if (_ServerRemoteBackend.readable(status)) {
        const [activities, devices, running] = await Promise.all([
          this.get(`/activities`),
          this.get(`/devices`),
          this.get(`/activity`)
        ]);
        if (!current()) return;
        this.activities = activities;
        this.devices = devices;
        if (runningEpoch === this.runningEpoch) this.running = running;
        this.catalogLoaded = true;
      } else {
        this.running = null;
      }
      this.loaded = true;
      this.cancelRetry();
    } catch (err) {
      if (!current()) return;
      this._lastError = errorText(err);
      this.hubStatus = null;
      this.firstAnswerPending = false;
      this.loaded = false;
      this.scheduleRetry();
    }
    this.invalidate();
    this.notify();
    if (current() && this.running) await this.ensureActivityPages(this.running.activity_id);
  }
  /** Re-read /status (and the running activity); one in flight, one pending. */
  refreshStatus() {
    if (this.statusPromise) {
      this.statusDirty = true;
      return this.statusPromise;
    }
    this.statusPromise = (async () => {
      do {
        this.statusDirty = false;
        await this.readStatus();
      } while (this.statusDirty);
    })().finally(() => {
      this.statusPromise = null;
    });
    return this.statusPromise;
  }
  async readStatus() {
    const hubId = this.hubId;
    const epoch = this.loadEpoch;
    const runningEpoch = this.runningEpoch;
    const current = () => epoch === this.loadEpoch && hubId === this.hubId;
    try {
      const status = await this.get(`/status`);
      if (!current()) return;
      this.hubStatus = status;
      this.firstAnswerPending = false;
      this._lastError = null;
      if (_ServerRemoteBackend.readable(status)) {
        if (!this.catalogLoaded) {
          void this.reload();
          return;
        }
        const running = await this.get(`/activity`);
        if (!current()) return;
        if (runningEpoch === this.runningEpoch) this.running = running;
      } else {
        this.running = null;
      }
    } catch (err) {
      if (!current()) return;
      this._lastError = errorText(err);
      this.hubStatus = null;
      this.firstAnswerPending = false;
      this.scheduleRetry();
    }
    this.invalidate();
    this.notify();
  }
  ensureActivityPages(activityId) {
    const key = String(activityId);
    if (this.activityPages[key]) return Promise.resolve();
    if (!this.pagePromises[key]) {
      this.pagePromises[key] = this.loadActivityPages(activityId).finally(() => {
        delete this.pagePromises[key];
      });
    }
    return this.pagePromises[key];
  }
  async loadActivityPages(activityId) {
    const hubId = this.hubId;
    const epoch = this.loadEpoch;
    const current = () => epoch === this.loadEpoch && hubId === this.hubId;
    try {
      const [buttons, macros, favorites] = await Promise.all([
        this.get(`/entities/${activityId}/buttons`),
        this.get(`/activities/${activityId}/macros`),
        this.get(`/activities/${activityId}/favorites`)
      ]);
      if (!current()) return;
      this.activityPages[String(activityId)] = { buttons, macros, favorites };
    } catch (err) {
      if (!current()) return;
      this._lastError = errorText(err);
      this.scheduleRetry();
      return;
    }
    this.invalidate();
    this.notify();
  }
  /** Read (or re-read) one device page; bumps its version on success. */
  async readDevicePage(deviceId) {
    const key = String(deviceId);
    const hubId = this.hubId;
    const epoch = this.loadEpoch;
    try {
      const [buttons, commands] = await Promise.all([
        this.get(`/entities/${deviceId}/buttons`),
        this.get(`/devices/${deviceId}/commands`)
      ]);
      if (epoch !== this.loadEpoch || hubId !== this.hubId) return;
      this.devicePages[key] = { buttons, commands };
      this.devicePageVersions[key] = (this.devicePageVersions[key] ?? 0) + 1;
    } catch (err) {
      if (epoch !== this.loadEpoch || hubId !== this.hubId) return;
      this._lastError = errorText(err);
      return;
    }
    this.invalidate();
    this.notify();
  }
  // ---------- retry of failed HTTP work ----------
  scheduleRetry() {
    if (!this.listeners.length || this.retryTimer) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.listeners.length || !this.hubId) return;
      if (!this.loaded || !this.hubStatus) {
        void this.reload();
      } else if (this.running && !this.activityPages[String(this.running.activity_id)]) {
        void this.ensureActivityPages(this.running.activity_id);
      }
    }, delay);
  }
  cancelRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.retryDelay = this.retryBaseMs;
  }
  // ---------- stream ----------
  wsUrl() {
    let base = this.baseUrl;
    if (!base && typeof location !== "undefined") base = location.origin;
    const ws = base.replace(/^http/, "ws");
    return `${ws}${SERVER_API_PREFIX}/events?hub_id=${encodeURIComponent(this.hubId)}`;
  }
  openSocket() {
    if (!this.wsFactory || !this.hubId || this.socket) return;
    this.streaming = true;
    const generation = ++this.socketGeneration;
    let socket;
    try {
      socket = this.wsFactory(this.wsUrl());
    } catch (err) {
      this._lastError = errorText(err);
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.socketGeneration) return;
      this.reconnectDelay = this.retryBaseMs;
      void this.reload();
    };
    socket.onmessage = (event) => {
      if (generation !== this.socketGeneration) return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
    };
    socket.onclose = () => {
      if (generation !== this.socketGeneration) return;
      this.socket = null;
      if (this.streaming) this.scheduleReconnect();
    };
  }
  closeSocket() {
    this.streaming = false;
    this.socketGeneration += 1;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      try {
        socket.close();
      } catch (_err) {
      }
    }
  }
  scheduleReconnect() {
    if (!this.streaming || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.streaming) this.openSocket();
    }, delay);
  }
  /** Exposed for tests and the page host; routes one stream message. */
  handleMessage(raw) {
    let message;
    try {
      message = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (_err) {
      return;
    }
    if (!message || typeof message !== "object") return;
    switch (message.type) {
      case "hello":
        return;
      case "dropped":
        void this.reload();
        return;
      case "server_event":
        if (message.kind === "hub_rekeyed" && message.hub_id && message.hub_id !== this.hubId) {
          this.hubId = String(message.hub_id);
          void this.reload();
          return;
        }
        if (message.hub_id !== this.hubId) return;
        if (message.kind === "hub_removed") {
          this.hubStatus = null;
          this.firstAnswerPending = false;
          this.invalidate();
          this.notify();
        } else {
          void this.refreshStatus();
        }
        return;
      case "hub_event":
        if (message.hub_id !== this.hubId || !message.event) return;
        this.handleHubEvent(message.event);
        return;
      default:
        return;
    }
  }
  handleHubEvent(event) {
    const payload = event.payload ?? {};
    switch (event.kind) {
      case "activity_changed": {
        const id = toNumber(payload.activity_id);
        this.running = id == null ? null : { activity_id: id, name: payload.name ?? null };
        this.runningEpoch += 1;
        this.invalidate();
        this.notify();
        if (id != null) void this.ensureActivityPages(id);
        return;
      }
      case "hub_state":
      case "app_state":
      case "status_changed":
        void this.refreshStatus();
        return;
      case "catalog_ready":
        if (payload.ready) void this.reload();
        else void this.refreshStatus();
        return;
      case "snapshot_changed": {
        const deviceIds = Array.isArray(payload.device_ids) ? payload.device_ids : [];
        const activityIds = Array.isArray(payload.activity_ids) ? payload.activity_ids : [];
        const everything = !deviceIds.length && !activityIds.length;
        const heldDevices = everything ? Object.keys(this.devicePages) : deviceIds.map(String).filter((key) => this.devicePages[key]);
        if (everything || deviceIds.length) {
          this.activityPages = {};
        } else {
          for (const id of activityIds) delete this.activityPages[String(id)];
        }
        for (const key of heldDevices) delete this.devicePages[key];
        void this.reload().then(
          () => Promise.all(heldDevices.map((key) => this.readDevicePage(Number(key))))
        );
        return;
      }
      default:
        return;
    }
  }
  // ---------- the attribute contract ----------
  runningPagesReady() {
    return !this.running || Boolean(this.activityPages[String(this.running.activity_id)]);
  }
  buildSnapshot() {
    const status = this.hubStatus?.status ?? null;
    const enabled = this.hubStatus?.enabled ?? false;
    const available = Boolean(this.hubStatus && enabled && status?.controllable);
    const pending = this.firstAnswerPending && !this.hubStatus;
    const runningId = this.running?.activity_id ?? null;
    const activities = this.activities.map((activity) => ({
      id: activity.activity_id,
      name: activity.name,
      state: activity.activity_id === runningId ? "on" : "off"
    }));
    const devices = this.devices.map((device) => ({
      id: device.device_id,
      name: device.name,
      device_class: device.device_class ?? void 0
    }));
    const assignedKeys = {};
    const macroKeys = {};
    const favoriteKeys = {};
    const longPressKeys = {};
    for (const [key, page] of Object.entries(this.activityPages)) {
      assignedKeys[key] = page.buttons.map((button) => button.button_code);
      macroKeys[key] = page.macros.map((macro) => ({
        id: macro.command_id,
        name: macro.label ?? ""
      }));
      favoriteKeys[key] = page.favorites.map((favorite) => ({
        id: favorite.command_id,
        name: favorite.label ?? "",
        device_id: favorite.device_id
      }));
      const pairs = longPressPairs(page.buttons);
      if (Object.keys(pairs).length) longPressKeys[key] = pairs;
    }
    for (const [key, page] of Object.entries(this.devicePages)) {
      const pairs = longPressPairs(page.buttons);
      if (Object.keys(pairs).length) longPressKeys[key] = pairs;
    }
    const currentName = this.running?.name ?? activities.find((activity) => activity.id === runningId)?.name ?? void 0;
    const attributes = {
      hub_version: String(status?.hub_version ?? "").toUpperCase(),
      current_activity: available ? currentName : void 0,
      current_activity_id: available ? runningId : null,
      // "loading" until the running activity's pages are in as well: the
      // card disables its keys while the backend says it is still loading
      // and holds no keys for the activity (HA reports the same while it
      // primes an activity's buttons after a switch).
      load_state: this.loaded && this.runningPagesReady() ? "ready" : "loading",
      activities,
      devices,
      assigned_keys: assignedKeys,
      macro_keys: macroKeys,
      favorite_keys: favoriteKeys,
      long_press_keys: longPressKeys,
      keymap_versions: { ...this.devicePageVersions },
      hub_id: this.hubId
    };
    return {
      state: pending ? "off" : !available ? "unavailable" : runningId != null ? "on" : "off",
      attributes
    };
  }
};

// remote-card/src/remote-web-config.ts
var DROPPED_KEYS = /* @__PURE__ */ new Set(["type", "entity", "theme", "show_automation_assist", "preview_activity"]);
var DROPPED_FAVORITE_KEYS = /* @__PURE__ */ new Set(["action", "tap_action", "hold_action", "double_tap_action"]);
function isPlainObject2(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function webRemoteConfigFromCardConfig(config) {
  const out = {};
  if (!isPlainObject2(config)) return out;
  for (const [key, value] of Object.entries(config)) {
    if (DROPPED_KEYS.has(key) || value === void 0) continue;
    if (key === "custom_favorites" && Array.isArray(value)) {
      const kept = value.filter((item) => isPlainObject2(item) && item.command_id != null && item.device_id != null).map((item) => {
        const favorite = {};
        for (const [k2, v3] of Object.entries(item)) {
          if (!DROPPED_FAVORITE_KEYS.has(k2)) favorite[k2] = v3;
        }
        return favorite;
      });
      if (kept.length) out.custom_favorites = kept;
      continue;
    }
    out[key] = value;
  }
  return out;
}
function serverBaseFromPageUrl(href, marker = "/ui/remote/") {
  const url = new URL(href);
  const at = url.pathname.indexOf(marker);
  const root = at >= 0 ? url.pathname.slice(0, at) : "";
  return `${url.origin}${root}`.replace(/\/+$/, "");
}
function cardConfigForWebRemote(hubId, document2, options = {}) {
  const base = webRemoteConfigFromCardConfig(document2);
  const config = { ...base, entity: hubId };
  if (options.openDevice != null) {
    const deviceMode = isPlainObject2(config.device_mode) ? { ...config.device_mode } : {};
    deviceMode.open_device = options.openDevice;
    config.device_mode = deviceMode;
  }
  return config;
}

// server-panel/src/panel-api.ts
var TERMINAL_JOB_STATES = /* @__PURE__ */ new Set(["done", "failed", "cancelled"]);
function serverBaseFromPanelUrl(href) {
  return serverBaseFromPageUrl(href, "/ui/");
}
function problemText(response) {
  const body = response.body;
  if (!body || typeof body !== "object") return `HTTP ${response.status}`;
  const head = body.type || body.title;
  const parts = [head, body.detail].filter((part) => Boolean(part));
  return parts.join(": ") || `HTTP ${response.status}`;
}
var PanelApi = class {
  constructor(baseUrl, fetchImpl) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.apiRoot = `${this.baseUrl}${SERVER_API_PREFIX}`;
    this._fetch = fetchImpl ?? ((input, init) => fetch(input, init));
  }
  /** `path` is relative to the API root, with or without a leading slash. */
  url(path, query) {
    const rel = path.replace(/^\/+/, "");
    let out = `${this.apiRoot}/${rel}`;
    const q = (query ?? "").trim();
    if (q) out += q.startsWith("?") ? q : `?${q}`;
    return out;
  }
  /** The `/ui/remote/` page for a hub, next to the API root. */
  remoteUrl(hubId) {
    return `${this.baseUrl}/ui/remote/${hubId ? `?hub=${encodeURIComponent(hubId)}` : ""}`;
  }
  async request(method, path, options = {}) {
    const headers = { ...options.headers ?? {} };
    const init = { method, headers };
    if (options.rawBody !== void 0) {
      if (options.rawBody !== "") {
        if (!Object.keys(headers).some((k2) => k2.toLowerCase() === "content-type")) headers["Content-Type"] = "application/json";
        init.body = options.rawBody;
      }
    } else if (options.body !== void 0) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    const response = await this._fetch(this.url(path, options.query), init);
    const text = await response.text();
    let body = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    const responseHeaders = [];
    response.headers.forEach((value, key) => responseHeaders.push([key, value]));
    return { ok: response.ok, status: response.status, statusText: response.statusText, headers: responseHeaders, text, body };
  }
  // -- server ----------------------------------------------------------------
  serverInfo() {
    return this.request("GET", "server");
  }
  callbackListener() {
    return this.request("GET", "server/callback-listener");
  }
  retryCallbackListener() {
    return this.request("POST", "server/callback-listener/retry");
  }
  /** The operations from `openapi.json`, sorted by path then method. */
  async operations() {
    const response = await this.request(
      "GET",
      "openapi.json"
    );
    const paths = response.body?.paths ?? {};
    const out = [];
    for (const [path, methods] of Object.entries(paths)) {
      for (const [method, op] of Object.entries(methods)) {
        const rel = path.startsWith(SERVER_API_PREFIX) ? path.slice(SERVER_API_PREFIX.length) : path;
        out.push({ id: op.operationId ?? "", method: method.toUpperCase(), path: rel, summary: op.summary ?? "", hasBody: Boolean(op.requestBody) });
      }
    }
    out.sort((a4, b3) => a4.path.localeCompare(b3.path) || a4.method.localeCompare(b3.method));
    return out;
  }
  // -- hubs ------------------------------------------------------------------
  listHubs() {
    return this.request("GET", "hubs");
  }
  addHub(body) {
    return this.request("POST", "hubs", { body });
  }
  enableHub(hubId) {
    return this.request("POST", `hubs/${encodeURIComponent(hubId)}/enable`);
  }
  disableHub(hubId) {
    return this.request("POST", `hubs/${encodeURIComponent(hubId)}/disable`);
  }
  removeHub(hubId) {
    return this.request("DELETE", `hubs/${encodeURIComponent(hubId)}`);
  }
  // -- discovery ---------------------------------------------------------------
  discoveredHubs() {
    return this.request("GET", "discovery/hubs");
  }
  scan(timeoutSeconds = 5) {
    return this.request("POST", "discovery/scan", { body: { timeout: timeoutSeconds } });
  }
  // -- the web remote's document ---------------------------------------------------
  remoteCardDocument(hubId) {
    return this.request("GET", `hubs/${encodeURIComponent(hubId)}/ui/remote-card`);
  }
  putRemoteCardDocument(hubId, document2) {
    return this.request("PUT", `hubs/${encodeURIComponent(hubId)}/ui/remote-card`, { body: { document: document2 } });
  }
  deleteRemoteCardDocument(hubId) {
    return this.request("DELETE", `hubs/${encodeURIComponent(hubId)}/ui/remote-card`);
  }
  // -- the catalog -----------------------------------------------------------------
  _hub(hubId) {
    return `hubs/${encodeURIComponent(hubId)}`;
  }
  snapshot(hubId) {
    return this.request("GET", `${this._hub(hubId)}/snapshot`);
  }
  devices(hubId) {
    return this.request("GET", `${this._hub(hubId)}/devices`);
  }
  activities(hubId) {
    return this.request("GET", `${this._hub(hubId)}/activities`);
  }
  deviceCommands(hubId, deviceId) {
    return this.request("GET", `${this._hub(hubId)}/devices/${deviceId}/commands`);
  }
  entityButtons(hubId, entityId) {
    return this.request("GET", `${this._hub(hubId)}/entities/${entityId}/buttons`);
  }
  activityMacros(hubId, activityId) {
    return this.request("GET", `${this._hub(hubId)}/activities/${activityId}/macros`);
  }
  activityFavorites(hubId, activityId) {
    return this.request("GET", `${this._hub(hubId)}/activities/${activityId}/favorites`);
  }
  /** Start a refresh job; the 202 body is the job to follow. */
  refreshSnapshot(hubId, scope = {}) {
    return this.request("POST", `${this._hub(hubId)}/snapshot/refresh`, { body: scope });
  }
  job(hubId, jobId) {
    return this.request("GET", `${this._hub(hubId)}/jobs/${encodeURIComponent(jobId)}`);
  }
  /** Recent jobs on the hub, newest first. */
  listJobs(hubId) {
    return this.request("GET", `${this._hub(hubId)}/jobs`);
  }
  cancelJob(hubId, jobId) {
    return this.request("DELETE", `${this._hub(hubId)}/jobs/${encodeURIComponent(jobId)}`);
  }
  /** The hub's apply records, newest first, documents omitted. */
  listApplies(hubId) {
    return this.request("GET", `${this._hub(hubId)}/applies`);
  }
  /** Continue a stopped or cancelled apply; the 202 body is the job. */
  resumeApply(hubId, applyId) {
    return this.request("POST", `${this._hub(hubId)}/applies/${encodeURIComponent(applyId)}/resume`);
  }
  /** Forget an apply record. */
  discardApply(hubId, applyId) {
    return this.request("DELETE", `${this._hub(hubId)}/applies/${encodeURIComponent(applyId)}`);
  }
  /**
   * Poll a job until it reaches a terminal state (or the poll count runs
   * out); `onUpdate` sees every answer. Resolves with the last view.
   */
  async followJob(hubId, jobId, options = {}) {
    const interval = options.intervalMs ?? 500;
    const maxPolls = options.maxPolls ?? 600;
    const sleep2 = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    let last = null;
    for (let i8 = 0; i8 < maxPolls; i8++) {
      const response = await this.job(hubId, jobId);
      if (!response.ok || !response.body) return last;
      last = response.body;
      options.onUpdate?.(last);
      if (TERMINAL_JOB_STATES.has(last.status)) return last;
      await sleep2(interval);
    }
    return last;
  }
};

// server-panel/src/panel-selectors.ts
function runtimeFor(snapshot, hubId) {
  if (!hubId) return null;
  return snapshot.hubs.find((r6) => r6.hub.hub_id === hubId) ?? null;
}
function selectedRuntime(snapshot) {
  return runtimeFor(snapshot, snapshot.selectedHubId);
}
function selectedHub(snapshot) {
  return selectedRuntime(snapshot)?.hub ?? null;
}
function gateFor(snapshot, runtime) {
  if (!snapshot.server.reachable) return "server_unreachable";
  if (!runtime) return "pass";
  const hub = runtime.hub;
  if (!hub.enabled || !hub.status) return "hub_disabled";
  if (!hub.status.hub_connected || hub.status.mode === "disconnected") return "hub_offline";
  if (hub.status.mode === "observe") return "app_holds_hub";
  if (!hub.status.catalog_ready) return "first_sync";
  return "pass";
}
var GATE_LABELS = {
  server_unreachable: "The server is not answering",
  hub_disabled: "This hub is disabled",
  hub_offline: "Waiting for the hub to connect",
  app_holds_hub: "The Sofabaton app holds the hub",
  first_sync: "First sync running"
};
function activeJob(hub) {
  const job = hub?.active_job ?? null;
  return job && !TERMINAL_JOB_STATES.has(job.status) ? job : null;
}
function busyFor(runtime) {
  if (!runtime) return null;
  const job = activeJob(runtime.hub);
  if (job) return { kind: "job", job };
  if (runtime.localBusy) return { kind: "local", key: runtime.localBusy.key, label: runtime.localBusy.label };
  return null;
}
function interactionFor(snapshot, runtime) {
  const gate = gateFor(snapshot, runtime);
  if (gate !== "pass") return { kind: "blocked", reason: gate, label: GATE_LABELS[gate] };
  const busy = busyFor(runtime);
  if (busy?.kind === "job") return { kind: "blocked", reason: "job", label: jobNarration(busy.job) };
  if (busy?.kind === "local") return { kind: "blocked", reason: "local", label: busy.label };
  return { kind: "free" };
}
var JOB_LABELS = {
  refresh: "Refreshing the hub",
  refresh_entity: "Refreshing an entity",
  sync_device: "Writing a device",
  sync_activity: "Writing an activity",
  sync_hub: "Applying the document",
  resume_apply: "Resuming the apply",
  backup: "Making a backup",
  restore: "Restoring",
  erase: "Erasing the hub",
  learn_ir: "Learning an IR code",
  deploy_callback_device: "Deploying the callback device",
  update_callback_device: "Updating the callback device",
  remove_callback_device: "Removing the callback device",
  redeploy_callback_device: "Redeploying the callback device"
};
function jobLabel(kind) {
  return JOB_LABELS[kind] ?? kind;
}
function jobProgress(job) {
  const p4 = job?.progress ?? null;
  const total = Number(p4?.total_steps ?? 0);
  const current = Number(p4?.completed_steps ?? 0);
  const hasTotal = Number.isFinite(total) && total > 0;
  const percent = hasTotal ? Math.max(0, Math.min(100, Math.round(Math.max(0, current) / total * 100))) : null;
  return { current: Number.isFinite(current) ? current : null, total: hasTotal ? total : null, percent, indeterminate: !hasTotal };
}
function jobNarration(job) {
  const parts = [jobLabel(job.kind)];
  const p4 = job.progress ?? {};
  const message = typeof p4.message === "string" ? p4.message.trim() : "";
  if (message) parts.push(message);
  const entityKind = typeof p4.entity_kind === "string" ? p4.entity_kind : null;
  const entityId = typeof p4.entity_id === "number" ? p4.entity_id : null;
  if (entityId !== null && !message.includes(String(entityId))) parts.push(`${entityKind ?? "entity"} ${entityId}`);
  const itemIndex = typeof p4.item_index === "number" ? p4.item_index : null;
  const itemCount = typeof p4.item_count === "number" ? p4.item_count : null;
  if (itemIndex !== null && itemCount !== null && itemCount > 0) parts.push(`item ${itemIndex + 1}/${itemCount}`);
  const progress = jobProgress(job);
  if (!progress.indeterminate) parts.push(`${progress.current ?? 0}/${progress.total}`);
  else if (job.status === "queued") parts.push("queued");
  return parts.join(" \xB7 ");
}
function noticeForJob(job, at) {
  if (!TERMINAL_JOB_STATES.has(job.status)) return null;
  const label = jobLabel(job.kind);
  if (job.status === "failed") {
    const problem = job.error;
    const head = problem?.title || problem?.type || "failed";
    return { tone: "error", label: `${label}: ${head}`, detail: problem?.detail ?? null, jobId: job.job_id, sticky: true, at };
  }
  if (job.status === "cancelled") return { tone: "neutral", label: `${label}: cancelled`, detail: null, jobId: job.job_id, sticky: false, at };
  return { tone: "success", label: `${label}: done`, detail: null, jobId: job.job_id, sticky: false, at };
}
function draftFor(runtime) {
  if (!runtime?.draft) return null;
  return { draft: runtime.draft, check: runtime.draftCheck };
}
function hasDirtyDraft(runtime) {
  return Boolean(runtime?.draft);
}
function dockModel(snapshot, runtime) {
  const job = activeJob(runtime?.hub);
  if (job) {
    const cancelling = runtime?.cancelRequestedJobId === job.job_id;
    return { kind: "running", job, text: cancelling ? `${jobNarration(job)} \xB7 cancelling` : jobNarration(job), progress: jobProgress(job), cancellable: job.cancellable, cancelling };
  }
  if (runtime?.notice) return { kind: "notice", notice: runtime.notice };
  const stopped = runtime?.stoppedApplies[0];
  if (stopped) return { kind: "apply_stopped", applyId: stopped.apply_id, resumable: stopped.resumable, text: `An apply stopped (${stopped.status}); ${stopped.resumable ? "resume or discard it" : "discard it"}` };
  const draft = draftFor(runtime);
  if (draft?.check === "stale") return { kind: "draft_stale", scope: draft.draft.scope, text: "Unsaved changes from an older snapshot: the hub moved on" };
  if (draft) return { kind: "dirty", scope: draft.draft.scope, text: "Unsaved changes" };
  const gate = gateFor(snapshot, runtime);
  if (gate === "server_unreachable" || gate !== "pass" && runtime) return { kind: "gate", gate, text: GATE_LABELS[gate] };
  return { kind: "idle" };
}
function connectivityFor(runtime) {
  const status = runtime?.hub.status ?? null;
  return { hub: Boolean(status?.hub_connected), app: Boolean(status?.app_connected) };
}

// server-panel/src/panel-context.ts
function hubContextFor(snapshot, api) {
  const runtime = selectedRuntime(snapshot);
  const interaction = interactionFor(snapshot, runtime);
  return {
    hub: runtime?.hub ?? null,
    runtime,
    gate: gateFor(snapshot, runtime),
    busy: busyFor(runtime),
    interaction,
    free: interaction.kind === "free",
    api
  };
}

// server-panel/src/panel-stream.ts
var DEFAULT_LIMIT = 500;
var PanelStream = class {
  constructor(options) {
    this.messages = [];
    /** Hub ids the server should filter the stream to; applied on the next (re)connect. */
    this.hubFilter = [];
    this.connected = false;
    /** True between start() and stop(): the stream should be up and reconnects. */
    this.wanted = false;
    this._socket = null;
    this._reconnectTimer = null;
    this._messageListeners = /* @__PURE__ */ new Set();
    this._stateListeners = /* @__PURE__ */ new Set();
    this._apiRoot = options.apiRoot.replace(/\/+$/, "");
    this._WebSocket = options.WebSocketImpl ?? WebSocket;
    this._reconnectMs = options.reconnectMs ?? 3e3;
    this._limit = options.limit ?? DEFAULT_LIMIT;
    this._now = options.now ?? (() => (/* @__PURE__ */ new Date()).toLocaleTimeString());
  }
  /** `ws(s)://.../api/v1/events?hub_id=…`, from the API root's scheme. */
  url() {
    const u6 = new URL(`${this._apiRoot}/events`);
    u6.protocol = u6.protocol === "https:" ? "wss:" : "ws:";
    for (const hub of this.hubFilter) u6.searchParams.append("hub_id", hub);
    return u6.toString();
  }
  onMessage(listener) {
    this._messageListeners.add(listener);
    return () => this._messageListeners.delete(listener);
  }
  onState(listener) {
    this._stateListeners.add(listener);
    return () => this._stateListeners.delete(listener);
  }
  start() {
    this.wanted = true;
    this._clearTimer();
    if (this._socket) return;
    const socket = new this._WebSocket(this.url());
    this._socket = socket;
    socket.onopen = () => this._setConnected(true);
    socket.onclose = () => {
      if (this._socket === socket) this._socket = null;
      this._setConnected(false);
      if (this.wanted) this._reconnectTimer = setTimeout(() => this.start(), this._reconnectMs);
    };
    socket.onmessage = (event) => this._receive(String(event.data));
  }
  stop() {
    this.wanted = false;
    this._clearTimer();
    const socket = this._socket;
    this._socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close();
    }
    this._setConnected(false);
  }
  /** Drop the socket and dial again (the hub filter changed). */
  restart() {
    const wanted = this.wanted;
    this.stop();
    if (wanted) this.start();
  }
  clear() {
    this.messages.length = 0;
  }
  _receive(text) {
    let data;
    try {
      const parsed = JSON.parse(text);
      data = parsed && typeof parsed === "object" ? parsed : { type: "raw", raw: text };
    } catch {
      data = { type: "raw", raw: text };
    }
    const message = { at: this._now(), text, data };
    this.messages.push(message);
    if (this.messages.length > this._limit) this.messages.splice(0, this.messages.length - this._limit);
    for (const listener of this._messageListeners) listener(message);
  }
  _setConnected(connected) {
    if (this.connected === connected) return;
    this.connected = connected;
    for (const listener of this._stateListeners) listener(connected);
  }
  _clearTimer() {
    if (this._reconnectTimer !== null) clearTimeout(this._reconnectTimer);
    this._reconnectTimer = null;
  }
};
function summarizeMessage(data) {
  const m3 = data;
  switch (m3.type) {
    case "press":
      return `press seq=${m3.seq} ${m3.hub_id} dev=${m3.device_id} slot=${m3.slot} ${m3.press_type} "${m3.label}" ${m3.resolution}`;
    case "hub_event":
      return `hub_event ${m3.hub_id} ${m3.event?.kind} seq=${m3.event?.seq}`;
    case "server_event":
      return `server_event ${m3.hub_id} ${m3.kind}`;
    case "job_event": {
      const progress = m3.job?.progress;
      const suffix = progress ? ` ${progress.completed_steps ?? ""}/${progress.total_steps ?? ""}` : "";
      return `job_event ${m3.hub_id} ${m3.job?.kind} ${m3.job?.status}${suffix}`;
    }
    case "hello":
      return `hello v${m3.server_version} instance=${m3.instance_id} hubs=${(m3.hubs ?? []).map((h6) => h6.hub_id).join(",")}`;
    case "dropped":
      return `dropped ${m3.count}`;
    default:
      return String(m3.type ?? "?");
  }
}
var HUB_EVENT_KINDS = /* @__PURE__ */ new Set(["catalog_ready", "hub_state", "app_state", "status_changed"]);
function isHubRefreshTrigger(data) {
  if (data.type === "server_event") return true;
  if (data.type === "hub_event") {
    const event = data.event;
    return Boolean(event?.kind && HUB_EVENT_KINDS.has(event.kind));
  }
  return false;
}

// server-panel/src/panel-store.ts
var ACKS_KEY = "sofabaton-panel-acks";
var DRAFT_PREFIX = "sofabaton-panel-draft:";
var STOPPED_APPLY_STATES = /* @__PURE__ */ new Set(["stopped", "cancelled"]);
var CONFLICT_TYPE = "hub_job_running";
var PanelStore = class {
  constructor(options) {
    this._listeners = /* @__PURE__ */ new Set();
    this._acks = {};
    this._connected = false;
    this._offStream = [];
    this._tick = null;
    this._debounce = null;
    this._retry = null;
    this._messageTimer = null;
    this._noticeTimers = /* @__PURE__ */ new Map();
    this._hubsKey = "";
    this._api = options.api;
    this._stream = options.stream;
    this._storage = options.storage ?? null;
    this._now = options.now ?? (() => Date.now());
    this._setTimer = options.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this._clearTimer = options.clearTimer ?? ((handle) => clearTimeout(handle));
    this._isVisible = options.isVisible ?? (() => typeof document === "undefined" || document.visibilityState === "visible");
    this._tickMs = options.tickMs ?? 5e3;
    this._debounceMs = options.debounceMs ?? 300;
    this._noticeTtlMs = options.noticeTtlMs ?? 6e3;
    this._noticeWindowMs = options.noticeWindowMs ?? 24 * 60 * 60 * 1e3;
    this._messageTtlMs = options.messageTtlMs ?? 8e3;
    this._retryMinMs = options.retryMinMs ?? 2e3;
    this._retryMaxMs = options.retryMaxMs ?? 1e4;
    this._retryDelay = this._retryMinMs;
    const prefs = loadPrefs(this._storage);
    this._acks = loadAcks(this._storage);
    this._lastHubTab = { tab: prefs.tab, sub: prefs.sub };
    const initial = options.initialRoute ?? hubRoute(prefs.hub, prefs.tab, prefs.sub);
    const selected = initial.kind === "hub" && initial.hubId ? initial.hubId : prefs.hub;
    if (initial.kind === "hub") this._lastHubTab = { tab: initial.tab, sub: initial.sub };
    this._snapshot = {
      server: { info: null, reachable: true, error: null, instanceId: null },
      stream: { connected: false, messageCount: 0 },
      hubs: [],
      listLoaded: false,
      seen: [],
      operations: [],
      selectedHubId: selected,
      route: initial.kind === "hub" ? withHub(initial, selected) : initial,
      routeReplace: true,
      theme: prefs.theme,
      message: null
    };
  }
  get snapshot() {
    return this._snapshot;
  }
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
  _set(patch) {
    this._snapshot = { ...this._snapshot, ...patch };
    for (const listener of this._listeners) listener(this._snapshot);
  }
  _patchRuntime(hubId, patch) {
    const index = this._snapshot.hubs.findIndex((r6) => r6.hub.hub_id === hubId);
    if (index < 0) return false;
    const hubs = this._snapshot.hubs.slice();
    hubs[index] = { ...hubs[index], ...patch };
    this._set({ hubs });
    return true;
  }
  // -- lifecycle -----------------------------------------------------------------------
  connect() {
    if (this._connected) return;
    this._connected = true;
    this._offStream = [
      this._stream.onState((connected) => this._onStreamState(connected)),
      this._stream.onMessage((message) => this._onStreamMessage(message))
    ];
    this._stream.start();
    void this._api.operations().then((operations) => this._set({ operations })).catch(() => void 0);
    void this.refreshAll();
    this._scheduleTick();
  }
  disconnect() {
    if (!this._connected) return;
    this._connected = false;
    for (const off of this._offStream) off();
    this._offStream = [];
    this._stream.stop();
    this._clearHandle("_tick");
    this._clearHandle("_debounce");
    this._clearHandle("_retry");
    this._clearHandle("_messageTimer");
    for (const handle of this._noticeTimers.values()) this._clearTimer(handle);
    this._noticeTimers.clear();
  }
  _clearHandle(name) {
    const handle = this[name];
    if (handle !== null) this._clearTimer(handle);
    this[name] = null;
  }
  _scheduleTick() {
    this._clearHandle("_tick");
    if (!this._connected) return;
    this._tick = this._setTimer(() => {
      this._tick = null;
      if (this._isVisible() && this._snapshot.server.reachable) {
        void this.refreshHubs();
        const route = this._snapshot.route;
        if (route.kind === "tool" && route.page === "setup") void this.refreshSeen();
      }
      this._scheduleTick();
    }, this._tickMs);
  }
  // -- selection, route, theme, message ----------------------------------------------------------
  selectHub(hubId) {
    if (hubId === this._snapshot.selectedHubId) return;
    const route = this._snapshot.route;
    const patch = { selectedHubId: hubId };
    if (route.kind === "hub" && route.hubId !== hubId) {
      patch.route = withHub(route, hubId);
      patch.routeReplace = true;
    }
    this._set(patch);
    this._savePrefs();
    if (hubId) {
      void this._loadApplies(hubId);
      void this._checkDraft(hubId);
    }
  }
  /** Go somewhere (decision 9). A hub route without a hub takes the selected one; a hub in it becomes the selection. */
  navigate(route, { replace = false } = {}) {
    let next = route;
    if (next.kind === "hub") {
      const hubId = next.hubId ?? this._snapshot.selectedHubId;
      next = { kind: "hub", hubId, tab: next.tab, sub: normalizeSub(next.tab, next.sub) };
      this._lastHubTab = { tab: next.tab, sub: next.sub };
    } else {
      next = { kind: "tool", page: next.page, sub: normalizeToolSub(next.page, next.sub) };
    }
    if (sameRoute(next, this._snapshot.route)) {
      if (replace !== this._snapshot.routeReplace) this._set({ routeReplace: replace });
    } else {
      this._set({ route: next, routeReplace: replace });
    }
    if (next.kind === "hub" && next.hubId && next.hubId !== this._snapshot.selectedHubId) this.selectHub(next.hubId);
    this._savePrefs();
  }
  /** The hub route to return to from a tool page: the last tab and subtab on the selected hub. */
  lastHubRoute() {
    return hubRoute(this._snapshot.selectedHubId, this._lastHubTab.tab, this._lastHubTab.sub);
  }
  cycleTheme() {
    this._set({ theme: nextTheme(this._snapshot.theme) });
    this._savePrefs();
  }
  say(text, ok = true) {
    this._set({ message: { text, ok } });
    this._clearHandle("_messageTimer");
    this._messageTimer = this._setTimer(() => {
      this._messageTimer = null;
      if (this._snapshot.message?.text === text) this._set({ message: null });
    }, this._messageTtlMs);
  }
  clearMessage() {
    this._clearHandle("_messageTimer");
    if (this._snapshot.message) this._set({ message: null });
  }
  _savePrefs() {
    savePrefs(this._storage, { hub: this._snapshot.selectedHubId, tab: this._lastHubTab.tab, sub: this._lastHubTab.sub, theme: this._snapshot.theme });
  }
  // -- loading and resync ---------------------------------------------------------------------
  /** The full resync (decision 5): server info, the hub list, the discovered list, the selected hub's applies. */
  async refreshAll() {
    const selectedBefore = this._snapshot.selectedHubId;
    await Promise.all([this._loadServer(), this.refreshHubs(), this.refreshSeen()]);
    const selected = this._snapshot.selectedHubId;
    if (selected && selected === selectedBefore) {
      await this._loadApplies(selected);
      await this._checkDraft(selected);
    }
  }
  /** Reload the hub list soon, coalescing bursts of triggers. */
  refreshSoon() {
    this._clearHandle("_debounce");
    this._debounce = this._setTimer(() => {
      this._debounce = null;
      void this.refreshHubs();
      void this.refreshSeen();
    }, this._debounceMs);
  }
  async _loadServer() {
    try {
      const response = await this._api.serverInfo();
      if (response.ok && response.body) this._set({ server: { ...this._snapshot.server, info: response.body, error: null } });
      else this._set({ server: { ...this._snapshot.server, error: `server answered ${response.status}` } });
    } catch (err) {
      this._set({ server: { ...this._snapshot.server, error: `server unreachable: ${String(err)}` } });
    }
  }
  async refreshHubs() {
    let hubs = null;
    try {
      const response = await this._api.listHubs();
      hubs = response.ok && Array.isArray(response.body) ? response.body : null;
    } catch {
      hubs = null;
    }
    if (!hubs) {
      this._markUnreachable();
      return;
    }
    this._markReachable();
    this._applyHubList(hubs);
  }
  async refreshSeen() {
    try {
      const response = await this._api.discoveredHubs();
      if (response.ok && Array.isArray(response.body)) {
        if (JSON.stringify(response.body) !== JSON.stringify(this._snapshot.seen)) this._set({ seen: response.body });
      }
    } catch {
    }
  }
  async _loadApplies(hubId) {
    try {
      const response = await this._api.listApplies(hubId);
      if (!response.ok || !Array.isArray(response.body)) return;
      const stopped = response.body.filter((a4) => STOPPED_APPLY_STATES.has(a4.status));
      const current = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
      if (current && JSON.stringify(current.stoppedApplies) !== JSON.stringify(stopped)) this._patchRuntime(hubId, { stoppedApplies: stopped });
    } catch {
    }
  }
  _markUnreachable() {
    if (this._snapshot.server.reachable) this._retryDelay = this._retryMinMs;
    this._set({ server: { ...this._snapshot.server, reachable: false } });
    this._scheduleRetry();
  }
  _markReachable() {
    if (!this._snapshot.server.reachable) {
      this._set({ server: { ...this._snapshot.server, reachable: true } });
      this._clearHandle("_retry");
      this._retryDelay = this._retryMinMs;
    }
  }
  _scheduleRetry() {
    if (!this._connected || this._retry !== null) return;
    const delay = this._retryDelay;
    this._retryDelay = Math.min(this._retryMaxMs, Math.round(delay * 1.5));
    this._retry = this._setTimer(() => {
      this._retry = null;
      if (!this._connected || this._snapshot.server.reachable) return;
      void this.refreshHubs();
    }, delay);
  }
  /** A fresh hub list: keep each hub's panel-side record, notice finished jobs, follow the selection and the route. */
  _applyHubList(hubs) {
    const key = JSON.stringify(hubs);
    const previous = new Map(this._snapshot.hubs.map((r6) => [r6.hub.hub_id, r6]));
    if (key !== this._hubsKey) {
      this._hubsKey = key;
      const runtimes = hubs.map((hub) => {
        const old = previous.get(hub.hub_id);
        if (old) return { ...old, hub };
        const draft = loadDraft(this._storage, hub.hub_id);
        return { hub, localBusy: null, notice: null, stoppedApplies: [], cancelRequestedJobId: null, lastPress: null, draft, draftCheck: draft?.acceptedStale ? "kept" : "unchecked" };
      });
      this._set({ hubs: runtimes, listLoaded: true });
      for (const hub of hubs) if (hub.last_job) this._noteFinished(hub.hub_id, hub.last_job, { onLoad: !previous.has(hub.hub_id) });
    } else if (!this._snapshot.listLoaded) {
      this._set({ listLoaded: true });
    }
    const selected = this._snapshot.selectedHubId;
    if (hubs.length && !hubs.some((h6) => h6.hub_id === selected)) this.selectHub(hubs[0].hub_id);
    if (!hubs.length) {
      if (selected !== null) this.selectHub(null);
      if (this._snapshot.route.kind === "hub") this.navigate(toolRoute("setup"), { replace: true });
    }
  }
  // -- the stream ------------------------------------------------------------------------------
  _onStreamState(connected) {
    this._set({ stream: { ...this._snapshot.stream, connected } });
    if (connected) void this.refreshAll();
  }
  _onStreamMessage(message) {
    this._set({ stream: { ...this._snapshot.stream, messageCount: this._stream.messages.length } });
    const data = message.data;
    switch (data.type) {
      case "hello":
        this._onHello(typeof data.instance_id === "string" ? data.instance_id : null);
        return;
      case "job_event": {
        const job = data.job;
        if (job && typeof data.hub_id === "string") this._onJobEvent(data.hub_id, job);
        return;
      }
      case "press":
        if (typeof data.hub_id === "string") this._onPress(data.hub_id, data);
        return;
      default:
        if (isHubRefreshTrigger(data)) this.refreshSoon();
    }
  }
  _onHello(instanceId) {
    const previous = this._snapshot.server.instanceId;
    if (instanceId && previous && instanceId !== previous) {
      for (const handle of this._noticeTimers.values()) this._clearTimer(handle);
      this._noticeTimers.clear();
      this._set({ hubs: this._snapshot.hubs.map((r6) => ({ ...r6, notice: null, localBusy: null })) });
      this.say("The server restarted; state reloaded.");
      this._hubsKey = "";
      void this.refreshAll();
    }
    if (instanceId && instanceId !== previous) this._set({ server: { ...this._snapshot.server, instanceId } });
  }
  /** A job frame mutates the hub's record directly; a terminal one reloads the hub afterwards. */
  _onJobEvent(hubId, job) {
    const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
    if (!runtime) {
      this.refreshSoon();
      return;
    }
    const hub = runtime.hub;
    if (TERMINAL_JOB_STATES.has(job.status)) {
      const active = hub.active_job && hub.active_job.job_id === job.job_id ? null : hub.active_job ?? null;
      const cancelRequestedJobId = runtime.cancelRequestedJobId === job.job_id ? null : runtime.cancelRequestedJobId;
      this._patchRuntime(hubId, { hub: { ...hub, active_job: active, last_job: job }, cancelRequestedJobId });
      this._noteFinished(hubId, job, { onLoad: false });
      this.refreshSoon();
    } else {
      this._patchRuntime(hubId, { hub: { ...hub, active_job: job } });
    }
  }
  _onPress(hubId, data) {
    const press = {
      seq: typeof data.seq === "number" ? data.seq : 0,
      deviceId: typeof data.device_id === "number" ? data.device_id : null,
      label: typeof data.label === "string" ? data.label : null,
      pressType: typeof data.press_type === "string" ? data.press_type : "short",
      at: this._now()
    };
    this._patchRuntime(hubId, { lastPress: press });
  }
  // -- notices (decision 6) --------------------------------------------------------------------------
  _noteFinished(hubId, job, { onLoad }) {
    if (!TERMINAL_JOB_STATES.has(job.status)) return;
    if (this._acks[hubId] === job.job_id) return;
    const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
    if (!runtime || runtime.notice?.jobId === job.job_id) return;
    const now = this._now();
    if (onLoad) {
      const finished = job.finished_at ? Date.parse(job.finished_at) : NaN;
      if (Number.isFinite(finished) && now - finished > this._noticeWindowMs) return;
    }
    const notice = noticeForJob(job, now);
    if (!notice) return;
    this._patchRuntime(hubId, { notice });
    const old = this._noticeTimers.get(hubId);
    if (old !== void 0) this._clearTimer(old);
    this._noticeTimers.delete(hubId);
    if (!notice.sticky) {
      this._noticeTimers.set(
        hubId,
        this._setTimer(() => {
          this._noticeTimers.delete(hubId);
          const current = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
          if (current?.notice?.jobId === notice.jobId) this.dismissNotice(hubId);
        }, this._noticeTtlMs)
      );
    }
  }
  /** Drop the hub's notice and remember its job as seen, so a reload does not repeat it. */
  dismissNotice(hubId) {
    const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
    if (!runtime?.notice) return;
    if (runtime.notice.jobId) {
      this._acks = { ...this._acks, [hubId]: runtime.notice.jobId };
      saveAcks(this._storage, this._acks);
    }
    const handle = this._noticeTimers.get(hubId);
    if (handle !== void 0) this._clearTimer(handle);
    this._noticeTimers.delete(hubId);
    this._patchRuntime(hubId, { notice: null });
  }
  // -- short calls, conflicts, jobs (decision 4) -------------------------------------------------------
  /** Run a short non-job call with the hub marked busy for its duration. */
  async runLocal(hubId, key, label, fn) {
    this._patchRuntime(hubId, { localBusy: { key, label } });
    try {
      return await fn();
    } finally {
      const current = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
      if (current?.localBusy?.key === key) this._patchRuntime(hubId, { localBusy: null });
    }
  }
  /** A 409 because a job holds the hub is not an error: the store resyncs instead. Returns true when it was one. */
  noteResponse(hubId, response) {
    const body = response.body;
    if (response.status === 409 && body && typeof body === "object" && body.type === CONFLICT_TYPE) {
      void this.refreshHubs();
      return true;
    }
    return false;
  }
  /** Cancel the hub's active job, when it has one that allows it. The job
   *  stays active until the server drains it; the record remembers the ask. */
  async cancelActiveJob(hubId) {
    const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
    const job = runtime?.hub.active_job;
    if (!job || !job.cancellable || TERMINAL_JOB_STATES.has(job.status)) return false;
    if (runtime?.cancelRequestedJobId === job.job_id) return true;
    this._patchRuntime(hubId, { cancelRequestedJobId: job.job_id });
    try {
      const response = await this._api.cancelJob(hubId, job.job_id);
      if (!response.ok) {
        this._patchRuntime(hubId, { cancelRequestedJobId: null });
        this.say(`Cancel refused: HTTP ${response.status}`, false);
      }
      return response.ok;
    } catch (err) {
      this._patchRuntime(hubId, { cancelRequestedJobId: null });
      this.say(`Cancel failed: ${String(err)}`, false);
      return false;
    }
  }
  // -- stopped applies (decision 6) --------------------------------------------------------------------
  /** Continue a stopped apply as a job; the job frames take it from there. */
  async resumeApply(hubId, applyId) {
    try {
      const response = await this._api.resumeApply(hubId, applyId);
      if (response.status === 202 && response.body) {
        const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
        if (runtime) this._patchRuntime(hubId, { hub: { ...runtime.hub, active_job: response.body } });
        await this._loadApplies(hubId);
        return true;
      }
      if (!this.noteResponse(hubId, response)) this.say(`Resume refused: ${problemLine(response)}`, false);
      return false;
    } catch (err) {
      this.say(`Resume failed: ${String(err)}`, false);
      return false;
    }
  }
  /** Forget a stopped apply record. */
  async discardApply(hubId, applyId) {
    try {
      const response = await this._api.discardApply(hubId, applyId);
      if (response.status === 204 || response.ok) {
        const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
        if (runtime) this._patchRuntime(hubId, { stoppedApplies: runtime.stoppedApplies.filter((a4) => a4.apply_id !== applyId) });
        await this._loadApplies(hubId);
        return true;
      }
      this.say(`Discard refused: ${problemLine(response)}`, false);
      return false;
    } catch (err) {
      this.say(`Discard failed: ${String(err)}`, false);
      return false;
    }
  }
  // -- drafts (decision 8) -------------------------------------------------------------------------
  /** An editor's unsaved work: kept on the record and mirrored to storage. Null clears it. */
  setDraft(hubId, draft) {
    const full = draft ? { ...draft, updatedAt: this._now() } : null;
    if (this._patchRuntime(hubId, { draft: full, draftCheck: full ? "fresh" : "unchecked" })) saveDraft(this._storage, hubId, full);
  }
  /** Drop the hub's draft, in memory and in storage. */
  discardDraft(hubId) {
    this.setDraft(hubId, null);
  }
  /** The stale prompt's "Keep editing": the draft stays, marked as accepted so a reload does not ask again. */
  keepStaleDraft(hubId) {
    const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
    if (!runtime?.draft) return;
    const draft = { ...runtime.draft, acceptedStale: true };
    this._patchRuntime(hubId, { draft, draftCheck: "kept" });
    saveDraft(this._storage, hubId, draft);
  }
  /** A restored draft is checked against the hub's current snapshot once: the same id is fresh, another is stale (the prompt). */
  async _checkDraft(hubId) {
    const runtime = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
    if (!runtime?.draft || runtime.draftCheck !== "unchecked") return;
    try {
      const response = await this._api.snapshot(hubId);
      if (!response.ok || !response.body) return;
      const current = this._snapshot.hubs.find((r6) => r6.hub.hub_id === hubId);
      if (!current?.draft || current.draftCheck !== "unchecked") return;
      this._patchRuntime(hubId, { draftCheck: response.body.snapshot_id === current.draft.snapshotId ? "fresh" : "stale" });
    } catch {
    }
  }
};
function problemLine(response) {
  const body = response.body;
  if (body && typeof body === "object" && (body.type || body.detail)) return [body.type, body.detail].filter(Boolean).join(": ");
  return `HTTP ${response.status}`;
}
function loadAcks(storage) {
  if (!storage) return {};
  try {
    const data = JSON.parse(storage.getItem(ACKS_KEY) || "{}");
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out = {};
    for (const [hub, job] of Object.entries(data)) if (typeof job === "string") out[hub] = job;
    return out;
  } catch {
    return {};
  }
}
function saveAcks(storage, acks) {
  if (!storage) return;
  try {
    storage.setItem(ACKS_KEY, JSON.stringify(acks));
  } catch {
  }
}
function draftKey(hubId) {
  return `${DRAFT_PREFIX}${hubId}`;
}
function loadDraft(storage, hubId) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(draftKey(hubId));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || typeof data.scope !== "string" || typeof data.snapshotId !== "string") return null;
    return {
      scope: data.scope,
      snapshotId: data.snapshotId,
      data: data.data,
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
      ...data.acceptedStale ? { acceptedStale: true } : {}
    };
  } catch {
    return null;
  }
}
function saveDraft(storage, hubId, draft) {
  if (!storage) return;
  try {
    if (draft) storage.setItem(draftKey(hubId), JSON.stringify(draft));
    else if (storage.removeItem) storage.removeItem(draftKey(hubId));
    else storage.setItem(draftKey(hubId), "");
  } catch {
  }
}

// server-panel/src/panel-styles.ts
var PANEL_BASE_CSS = i`
  :host {
    --sbp-bg: var(--primary-background-color, #fafafa);
    --sbp-panel: var(--card-background-color, #ffffff);
    --sbp-panel-2: var(--secondary-background-color, #e5e5e5);
    --sbp-line: var(--divider-color, rgba(0, 0, 0, 0.12));
    --sbp-text: var(--primary-text-color, #141414);
    --sbp-muted: var(--secondary-text-color, #5e5e5e);
    --sbp-accent: var(--primary-color, #009ac7);
    --sbp-accent-rgb: var(--rgb-primary-color, 0, 154, 199);
    --sbp-ok: var(--success-color, #43a047);
    --sbp-warn: var(--warning-color, #ffa600);
    --sbp-err: var(--error-color, #db4437);
    --sbp-input: var(--input-fill-color, rgb(245, 245, 245));
    --sbp-press: #9c27b0;
    --sbp-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    --sbp-radius: 10px;
    font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
    font-size: 14px;
    color: var(--sbp-text);
    box-sizing: border-box;
  }
  *, *::before, *::after { box-sizing: inherit; }
  a { color: var(--sbp-accent); }
  button, input, select, textarea {
    font: inherit;
    color: var(--sbp-text);
    background: var(--sbp-input);
    border: 1px solid var(--sbp-line);
    border-radius: 6px;
    padding: 6px 10px;
  }
  input, select, textarea { width: 100%; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--sbp-accent); }
  textarea { font-family: var(--sbp-mono); font-size: 12px; min-height: 64px; resize: vertical; }
  button { cursor: pointer; white-space: nowrap; background: var(--sbp-panel); }
  button:hover { border-color: var(--sbp-accent); }
  button.primary { background: var(--sbp-accent); color: #fff; border-color: var(--sbp-accent); font-weight: 600; }
  button.danger { color: var(--sbp-err); }
  button.danger:hover { border-color: var(--sbp-err); }
  button.small { font-size: 12px; padding: 4px 9px; }
  button:disabled { opacity: 0.5; cursor: default; }
  label { display: block; color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin: 10px 0 4px; }
  label.inline { display: inline-flex; align-items: center; gap: 6px; text-transform: none; letter-spacing: 0; font-size: 12px; margin: 0; }
  label.inline input { width: auto; }
  pre {
    margin: 0;
    font-family: var(--sbp-mono);
    font-size: 12px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    background: var(--sbp-bg);
    border: 1px solid var(--sbp-line);
    border-radius: 6px;
    padding: 10px;
  }
  code { font-family: var(--sbp-mono); font-size: 12px; }
  .hint { color: var(--sbp-muted); font-size: 12px; line-height: 1.5; }
  .mono { font-family: var(--sbp-mono); }
  .row { display: flex; gap: 8px; align-items: end; }
  .row > * { flex: 1; }
  .row > .fixed { flex: 0 0 auto; }
  .spacer { flex: 1; }
  .tone-ok { color: var(--sbp-ok); }
  .tone-warn { color: var(--sbp-warn); }
  .tone-err { color: var(--sbp-err); }
  .tone-off { color: var(--sbp-muted); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: var(--sbp-muted); flex: 0 0 auto; }
  .dot.ok { background: var(--sbp-ok); }
  .dot.warn { background: var(--sbp-warn); }
  .dot.err { background: var(--sbp-err); }
  .dot.off { background: var(--sbp-line); }
  .panel {
    background: var(--sbp-panel);
    border: 1px solid var(--sbp-line);
    border-radius: var(--sbp-radius);
    padding: 14px 16px;
    min-width: 0;
  }
  .panel + .panel { margin-top: 16px; }
  .panel h2 { margin: 0 0 10px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  .panel h2 .hint { font-weight: 400; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .actions .msg { font-size: 12px; margin-left: auto; }
  .msg-ok { color: var(--sbp-ok); }
  .msg-err { color: var(--sbp-err); }
  table.list { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 6px; }
  table.list th, table.list td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--sbp-line); vertical-align: middle; white-space: nowrap; }
  table.list th { color: var(--sbp-muted); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 0.04em; }
  table.list td.act { text-align: right; }
  table.list .sub { color: var(--sbp-muted); }
  .scroll-x { overflow-x: auto; }
`;

// server-panel/src/panel-element.ts
var PANEL_TAG = "sofabaton-server-panel";
var README = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/sofabaton-x-server/README.md";
var DOC_LINKS = {
  hub: { href: `${README}#control-panel`, label: "Control panel docs" },
  backup: { href: `${README}#ir-payloads-backup-restore`, label: "Backup and restore docs" },
  remote: { href: `${README}#web-remote`, label: "Web remote docs" }
};
function storageOrNull() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
var SofabatonServerPanel = class extends i4 {
  constructor() {
    super();
    this._pickerOpen = false;
    this._cogOpen = false;
    this._unsubscribe = null;
    this._dockObserver = null;
    this._onHashChange = () => {
      const parsed = parseRoute(location.hash);
      if (parsed) this.store.navigate(parsed, { replace: true });
      else this._syncHash();
    };
    this._onDocumentClick = (event) => {
      if (!this._pickerOpen && !this._cogOpen) return;
      const path = event.composedPath();
      const inside = (id) => {
        const el = this.renderRoot.querySelector(`#${id}`);
        return Boolean(el && path.includes(el));
      };
      if (this._pickerOpen && !inside("hub-picker")) this._pickerOpen = false;
      if (this._cogOpen && !inside("cog")) this._cogOpen = false;
    };
    this._onKeyDown = (event) => {
      if (event.key === "Escape") {
        this._pickerOpen = false;
        this._cogOpen = false;
      }
    };
    this.api = new PanelApi(serverBaseFromPanelUrl(location.href));
    this.stream = new PanelStream({ apiRoot: this.api.apiRoot });
    this.store = new PanelStore({ api: this.api, stream: this.stream, storage: storageOrNull(), initialRoute: parseRoute(location.hash) });
    this._snapshot = this.store.snapshot;
  }
  connectedCallback() {
    super.connectedCallback();
    this._unsubscribe = this.store.subscribe((snapshot) => {
      this._snapshot = snapshot;
      this._applyTheme();
      this._syncHash();
    });
    this._applyTheme();
    this._syncHash();
    window.addEventListener("hashchange", this._onHashChange);
    document.addEventListener("click", this._onDocumentClick);
    document.addEventListener("keydown", this._onKeyDown);
    this.store.connect();
    void this.updateComplete.then(() => {
      if (!this.isConnected) return;
      this._dockObserver?.disconnect();
      this._dockObserver = new ResizeObserver(([entry]) => {
        const height = entry.borderBoxSize[0]?.blockSize ?? entry.target.getBoundingClientRect().height;
        this.style.setProperty("--bottom-dock-height", `${height}px`);
      });
      const dock = this.renderRoot.querySelector("#bottom-dock");
      if (dock) this._dockObserver.observe(dock);
    });
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("hashchange", this._onHashChange);
    document.removeEventListener("click", this._onDocumentClick);
    document.removeEventListener("keydown", this._onKeyDown);
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._dockObserver?.disconnect();
    this._dockObserver = null;
    this.store.disconnect();
  }
  // -- state --------------------------------------------------------------------
  get selectedHub() {
    return selectedHub(this._snapshot);
  }
  get route() {
    return this._snapshot.route;
  }
  _syncHash() {
    const want = hashFor(this._snapshot.route);
    if (location.hash === want) return;
    if (this._snapshot.routeReplace) history.replaceState(null, "", want);
    else location.hash = want;
  }
  _applyTheme() {
    const theme = this._snapshot.theme;
    if (theme === "auto") delete document.documentElement.dataset.theme;
    else if (document.documentElement.dataset.theme !== theme) document.documentElement.dataset.theme = theme;
  }
  /** Leaving the draft's screen or its hub with unsaved work asks first (decision 8); nothing is lost either way. */
  _confirmLeave(target) {
    const runtime = selectedRuntime(this._snapshot);
    if (!runtime || !hasDirtyDraft(runtime)) return true;
    const scope = runtime.draft.scope;
    const current = this._snapshot.route;
    const currentScope = current.kind === "hub" ? `${current.tab}/${current.sub}` : null;
    if (currentScope !== scope) return true;
    const leavingHub = target.hubId !== void 0 && target.hubId !== runtime.hub.hub_id;
    const targetScope = target.route ? target.route.kind === "hub" ? `${target.route.tab}/${target.route.sub}` : `${target.route.page}/${target.route.sub}` : null;
    const leavingScope = targetScope !== null && targetScope !== scope;
    if (!leavingHub && !leavingScope) return true;
    return confirm("You have unsaved changes here. They are kept for when you come back.\n\nLeave anyway?");
  }
  _go(route) {
    this._pickerOpen = false;
    this._cogOpen = false;
    if (!this._confirmLeave({ route })) return;
    this.store.navigate(route);
  }
  _goTab(tab) {
    const current = this._snapshot.route;
    const sub = current.kind === "hub" && current.tab === tab ? current.sub : void 0;
    this._go(hubRoute(null, tab, sub));
  }
  _goSub(sub) {
    const current = this._snapshot.route;
    this._go(current.kind === "hub" ? hubRoute(null, current.tab, sub) : toolRoute(current.page, sub));
  }
  _goPage(page) {
    this._go(toolRoute(page));
  }
  _goSetup() {
    this._goPage("setup");
    void this.updateComplete.then(() => {
      const view = this.renderRoot.querySelector("sb-panel-hubs");
      view?.focusAddress();
    });
  }
  // -- events from the views -----------------------------------------------------------
  _onMessage(event) {
    this.store.say(event.detail.text, event.detail.ok);
  }
  _onHubsChanged() {
    void this.store.refreshAll();
  }
  _onSelectHub(event) {
    this.store.selectHub(event.detail.hubId);
    void this.store.refreshHubs();
  }
  _onNavigate(event) {
    const d3 = event.detail;
    if (d3.page) this._go(toolRoute(d3.page));
    else if (d3.tab) this._go(hubRoute(null, d3.tab, d3.sub));
  }
  // -- render ---------------------------------------------------------------------------
  _renderView(ctx) {
    const s7 = this._snapshot;
    const route = s7.route;
    if (route.kind === "tool") {
      switch (route.page) {
        case "server":
          return b2`<sb-panel-server .api=${this.api} .info=${s7.server.info} .error=${s7.server.error} .reachable=${s7.server.reachable} .streamOn=${s7.stream.connected} .hubCount=${s7.hubs.length}></sb-panel-server>`;
        case "debug":
          return route.sub === "events" ? b2`<sb-panel-events .stream=${this.stream}></sb-panel-events>` : b2`<sb-panel-api .api=${this.api} .ctx=${ctx} .operations=${s7.operations} @sb-request-sent=${() => void this.store.refreshAll()}></sb-panel-api>`;
        default:
          return b2`<sb-panel-hubs .api=${this.api} .ctx=${ctx} .hubs=${s7.hubs.map((r6) => r6.hub)} .seen=${s7.seen}></sb-panel-hubs>`;
      }
    }
    switch (route.tab) {
      case "backup":
        return b2`<sb-panel-backup .ctx=${ctx} .section=${route.sub}></sb-panel-backup>`;
      case "remote":
        return b2`<sb-panel-remote .api=${this.api} .ctx=${ctx} .section=${route.sub}></sb-panel-remote>`;
      default:
        return b2`<sb-panel-catalog .api=${this.api} .ctx=${ctx} .kind=${route.sub === "activities" ? "activity" : "device"}></sb-panel-catalog>`;
    }
  }
  render() {
    const s7 = this._snapshot;
    const ctx = hubContextFor(s7, this.api);
    const runtime = selectedRuntime(s7);
    const route = s7.route;
    const viewId = route.kind === "tool" ? `${route.page}-${route.sub}` : route.tab;
    const blocked = route.kind === "hub" && ctx.hub !== null && ctx.interaction.kind === "blocked" ? ctx.interaction : null;
    const streamOn = s7.stream.connected;
    const streamLost = !streamOn && s7.server.reachable && s7.listLoaded;
    return b2`
      <div class="page">
        <header class="top-dock">
          <div class="top-row">
            <div class="brand"><b>Sofabaton X</b><span>control panel</span></div>
            <div class="picker-slot">
              ${renderHubPicker({
      hubs: s7.hubs,
      selectedHubId: s7.selectedHubId,
      open: this._pickerOpen,
      onToggle: () => {
        this._pickerOpen = !this._pickerOpen;
        this._cogOpen = false;
      },
      onSelect: (hubId) => {
        this._pickerOpen = false;
        if (!this._confirmLeave({ hubId })) return;
        this.store.selectHub(hubId);
      },
      onSetup: () => this._goSetup()
    })}
            </div>
            <div class="top-right">
              <span class="stream ${streamLost ? "lost" : ""}" id="stream-state" title=${streamOn ? "event stream live" : "event stream off, reconnecting"}><span class="dot ${streamOn ? "ok" : streamLost ? "warn" : "off"}" id="ws-dot"></span><span class="stream-label" id="ws-state">${streamOn ? "stream live" : streamLost ? "live updates paused, reconnecting" : "stream off"}</span></span>
            </div>
          </div>
          ${renderTabBar({
      route,
      cogOpen: this._cogOpen,
      theme: s7.theme,
      eventCount: s7.stream.messageCount,
      onTab: (tab) => this._goTab(tab),
      onSub: (sub) => this._goSub(sub),
      onToggleCog: () => {
        this._cogOpen = !this._cogOpen;
        this._pickerOpen = false;
      },
      onPage: (page) => this._goPage(page),
      onTheme: () => this.store.cycleTheme()
    })}
        </header>
        <main class="view" id="view-${viewId}" @sb-message=${this._onMessage} @sb-hubs-changed=${this._onHubsChanged} @sb-select-hub=${this._onSelectHub} @sb-navigate=${this._onNavigate}>
          <div class="stage" id="stage-wrap" ?inert=${Boolean(blocked)}>${this._renderView(ctx)}</div>
          ${blocked ? b2`<div class="scrim" id="blocked-scrim"><div class="scrim-card"><b>${blocked.reason === "job" || blocked.reason === "local" ? "Hub busy" : "Hub unavailable"}</b><div class="hint">${blocked.label}</div></div></div>` : A}
        </main>
        ${renderBottomDock({
      model: dockModel(s7, runtime),
      message: s7.message,
      connectivity: connectivityFor(runtime),
      hasHub: ctx.hub !== null,
      press: runtime?.lastPress ?? null,
      docLink: route.kind === "hub" ? DOC_LINKS[route.tab] : null,
      onDismiss: () => {
        if (s7.selectedHubId) this.store.dismissNotice(s7.selectedHubId);
      },
      onCancel: () => {
        if (s7.selectedHubId) void this.store.cancelActiveJob(s7.selectedHubId);
      },
      onResume: (applyId) => {
        if (s7.selectedHubId) void this.store.resumeApply(s7.selectedHubId, applyId);
      },
      onDiscard: (applyId) => {
        if (s7.selectedHubId && confirm("Discard this stopped apply? Its record is forgotten; the hub is not changed.")) void this.store.discardApply(s7.selectedHubId, applyId);
      },
      onKeepDraft: () => {
        if (s7.selectedHubId) this.store.keepStaleDraft(s7.selectedHubId);
      },
      onDiscardDraft: () => {
        if (s7.selectedHubId && confirm("Discard your unsaved changes? The hub is not changed.")) this.store.discardDraft(s7.selectedHubId);
      }
    })}
      </div>
    `;
  }
};
SofabatonServerPanel.properties = {
  _snapshot: { state: true },
  _pickerOpen: { state: true },
  _cogOpen: { state: true }
};
SofabatonServerPanel.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; min-height: 100%; background: var(--sbp-bg); container-type: inline-size; }
      .page {
        --dock-surface: linear-gradient(180deg, color-mix(in srgb, var(--sbp-accent) 8%, var(--sbp-panel)), color-mix(in srgb, var(--sbp-accent) 4%, var(--sbp-panel)));
        --page-gutter: 16px;
        max-width: 1040px; min-height: 100dvh; margin: 0 auto;
        padding: 0 var(--page-gutter) calc(var(--bottom-dock-height, 56px) + 16px);
      }
      button:focus-visible, a:focus-visible { outline: 2px solid var(--sbp-accent); outline-offset: -3px; }

      /* -- top dock -------------------------------------------------------- */
      .top-dock { position: sticky; top: 0; z-index: 40; margin: 0 calc(-1 * var(--page-gutter)); padding: env(safe-area-inset-top, 0px) var(--page-gutter) 0; background: var(--sbp-panel); border-bottom: 1px solid var(--sbp-line); box-shadow: 0 3px 8px rgba(0, 0, 0, 0.03); }
      .top-row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 48px; margin: 0 calc(-1 * var(--page-gutter)); padding: 6px var(--page-gutter); background: var(--dock-surface); border-bottom: 1px solid var(--sbp-line); }
      .brand { display: flex; align-items: baseline; gap: 8px; flex: 0 0 auto; }
      .brand b { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; white-space: nowrap; }
      .brand span { color: var(--sbp-muted); font-size: 11px; white-space: nowrap; }
      .picker-slot { flex: 1 1 auto; min-width: 0; display: flex; justify-content: flex-end; }
      .top-right { display: flex; align-items: center; flex: 0 0 auto; }
      .stream { display: inline-flex; align-items: center; gap: 6px; color: var(--sbp-muted); font-size: 11px; }
      .stream-label { max-width: 120px; line-height: 1.4; }

      .hub-picker { position: relative; max-width: 100%; }
      .hub-picker-btn { display: flex; align-items: center; gap: 6px; max-width: min(100%, 360px); min-height: 36px; border: 1px solid var(--sbp-line); border-radius: 999px; padding: 0 12px 0 10px; background: var(--sbp-panel); color: var(--sbp-text); user-select: none; }
      button.hub-picker-btn { cursor: pointer; }
      button.hub-picker-btn:hover, button.hub-picker-btn.is-open { border-color: var(--sbp-accent); }
      .hub-picker-btn--static { cursor: default; }
      .chip-prefix { flex: 0 0 auto; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sbp-muted); }
      .chip-name { font-size: 12px; font-weight: 600; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .chip-arrow { flex: 0 0 auto; width: 16px; height: 16px; color: var(--sbp-muted); }
      .hub-picker-menu { width: 300px; }

      .menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 40; display: flex; flex-direction: column; min-width: 220px; max-width: calc(100vw - 48px); max-height: calc(100dvh - 160px); overflow-y: auto; overscroll-behavior: contain; padding: 4px 0; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.18); }
      .menu-item { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 8px 14px; border: 0; border-radius: 0; background: transparent; text-align: left; white-space: normal; }
      .menu-item:hover { background: var(--sbp-panel-2); border-color: transparent; }
      .menu-item.selected { background: rgba(var(--sbp-accent-rgb), 0.12); }
      .menu-main { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 3px; }
      .menu-title { font-size: 13px; font-weight: 600; overflow-wrap: anywhere; }
      .menu-sub { font-size: 11px; color: var(--sbp-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .menu-sep { border-top: 1px solid var(--sbp-line); margin: 4px 0; }
      .badge { display: inline-block; min-width: 18px; padding: 0 5px; border-radius: 9px; background: var(--sbp-panel-2); color: var(--sbp-muted); font-size: 11px; text-align: center; font-weight: 500; }

      .tabs { display: flex; align-items: stretch; min-width: 0; }
      .tabs-scroll { display: flex; flex: 1 1 auto; min-width: 0; overflow-x: auto; scrollbar-width: none; }
      .tabs-scroll::-webkit-scrollbar { display: none; }
      .tab-btn { flex: 0 0 auto; min-height: 46px; padding: 10px 18px; border: 0; border-bottom: 3px solid transparent; border-radius: 0; background: transparent; color: var(--sbp-muted); font-weight: 600; }
      .tab-btn:hover { color: var(--sbp-text); border-color: transparent; border-bottom-color: var(--sbp-line); }
      .tab-btn.active { color: var(--sbp-text); border-bottom-color: var(--sbp-accent); background: rgba(var(--sbp-accent-rgb), 0.05); }
      .tab-menu { position: relative; flex: 0 0 auto; margin-left: auto; display: flex; }
      .tab-btn--menu { display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 8px 10px; min-width: 44px; }
      .tab-btn--menu.is-open { color: var(--sbp-accent); }
      .cog-icon { width: 20px; height: 20px; }
      .subtabs { display: flex; overflow-x: auto; scrollbar-width: none; margin: 8px 0 0; border: 1px solid var(--sbp-line); border-bottom: 0; border-radius: 12px 12px 0 0; background: linear-gradient(180deg, var(--sbp-panel), color-mix(in srgb, var(--sbp-panel-2) 45%, var(--sbp-panel))); }
      .subtabs::-webkit-scrollbar { display: none; }
      .subtab-btn { flex: 1 0 auto; min-height: 42px; padding: 10px 16px; border: 0; border-right: 1px solid var(--sbp-line); border-radius: 0; background: transparent; color: var(--sbp-muted); font-size: 11px; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700; }
      .subtab-btn:last-child { border-right: 0; }
      .subtab-btn:hover { color: var(--sbp-text); background: rgba(var(--sbp-accent-rgb), 0.05); }
      .subtab-btn.active { color: var(--sbp-text); background: var(--sbp-panel); box-shadow: inset 0 -3px 0 var(--sbp-accent); }

      /* -- the view and its scrim ------------------------------------------- */
      .view { position: relative; padding: 16px 0 8px; min-height: 40vh; }
      .stage { min-width: 0; }
      .stage[inert] { opacity: 0.5; filter: saturate(0.5); pointer-events: none; }
      .scrim { position: absolute; inset: 0; z-index: 20; display: flex; align-items: flex-start; justify-content: center; padding-top: 40px; }
      .scrim-card { max-width: 420px; padding: 14px 18px; background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14); text-align: center; }
      .scrim-card b { display: block; font-size: 14px; margin-bottom: 4px; }
      .scrim-card .hint { font-size: 12px; }

      /* -- bottom dock -------------------------------------------------------- */
      /* The dock is the column's width, centred like it, not the viewport's. */
      .dock { position: fixed; left: 0; right: 0; bottom: 0; margin-inline: auto; max-width: 1040px; z-index: 30; background: var(--dock-surface); border-top: 1px solid var(--sbp-line); padding-bottom: env(safe-area-inset-bottom, 0px); box-shadow: 0 -3px 8px rgba(0, 0, 0, 0.03); overflow: hidden; }
      .dock-inner { min-height: 48px; padding: 6px var(--page-gutter); display: flex; align-items: center; gap: 16px; }
      .dock-center { flex: 1 1 auto; min-width: 0; display: flex; justify-content: center; align-items: center; font-size: 12px; line-height: 1.5; }
      .dock-status { min-width: 0; overflow-wrap: anywhere; max-height: 30dvh; overflow-y: auto; }
      .dock-detail { color: var(--sbp-muted); }
      .dock-link { font-size: 12px; color: var(--sbp-muted); text-decoration: none; }
      .dock-link:hover { color: var(--sbp-accent); }
      .dock-actions { display: flex; align-items: center; gap: 6px; }
      .dock-action { flex: 0 0 auto; min-height: 36px; }
      .dock--success, .dock--message { --dock-surface: color-mix(in srgb, var(--sbp-ok) 8%, var(--sbp-panel)); border-top-color: color-mix(in srgb, var(--sbp-ok) 40%, var(--sbp-line)); }
      .dock--error { --dock-surface: color-mix(in srgb, var(--sbp-err) 8%, var(--sbp-panel)); border-top-color: color-mix(in srgb, var(--sbp-err) 40%, var(--sbp-line)); }
      .dock--warn, .dock--dirty { --dock-surface: color-mix(in srgb, var(--sbp-warn) 8%, var(--sbp-panel)); border-top-color: color-mix(in srgb, var(--sbp-warn) 40%, var(--sbp-line)); }
      .dock--running .dock-status { color: var(--sbp-accent); font-weight: 600; }
      .dock--success .dock-status, .dock--message .dock-status { color: var(--sbp-ok); }
      .dock--error .dock-status { color: var(--sbp-err); }
      .dock--warn .dock-status { color: var(--sbp-text); }
      .dock--dirty .dock-status { color: var(--sbp-text); font-weight: 600; }
      .dock--neutral .dock-status, .dock--gate .dock-status, .dock--info .dock-status { color: var(--sbp-muted); }
      .dock-right { flex: 0 0 auto; display: flex; align-items: center; gap: 12px; }
      .dock-pill-pair { display: inline-flex; flex: 0 0 auto; border: 1px solid var(--sbp-line); border-radius: 999px; overflow: hidden; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; background: var(--sbp-panel); }
      .dock-pill-half { padding: 4px 9px; color: var(--sbp-muted); }
      .dock-pill-half.on { background: rgba(var(--rgb-success-color, 67, 160, 71), 0.16); color: var(--sbp-ok); }
      .dock-pill-half + .dock-pill-half { border-left: 1px solid var(--sbp-line); }
      .dock-inner { position: relative; }
      .dock-progress { position: absolute; top: -1px; left: 0; height: 3px; border-radius: 2px; background: linear-gradient(90deg, rgba(var(--sbp-accent-rgb), 0.6), var(--sbp-accent) 45%, rgba(var(--sbp-accent-rgb), 0.75) 55%, var(--sbp-accent)); box-shadow: 0 0 8px rgba(var(--sbp-accent-rgb), 0.7); transition: width 180ms ease; animation: dockProgressPulse 1.4s ease-in-out infinite; }
      .dock-progress[data-indeterminate="true"] { width: 35% !important; animation: dockProgressIndeterminate 1.2s ease-in-out infinite, dockProgressPulse 1.4s ease-in-out infinite; }
      @keyframes dockProgressIndeterminate { 0% { transform: translateX(-100%); } 100% { transform: translateX(320%); } }
      @keyframes dockProgressPulse { 0%, 100% { filter: brightness(1); } 50% { filter: brightness(1.35); } }
      /* A press on the physical remote: one soft accent band sweeps the dock left to right, as in the HA card. */
      .dock-flash { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
      .dock-flash::before { content: ""; position: absolute; top: 0; bottom: 0; left: 0; width: 38%; background: linear-gradient(90deg, transparent 0%, rgba(var(--sbp-accent-rgb), 0.22) 35%, rgba(var(--sbp-accent-rgb), 0.38) 50%, rgba(var(--sbp-accent-rgb), 0.22) 65%, transparent 100%); transform: translateX(-100%); animation: dockPressWipe 720ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 forwards; }
      @keyframes dockPressWipe { 0% { transform: translateX(-100%); opacity: 0; } 15% { opacity: 1; } 85% { opacity: 1; } 100% { transform: translateX(280%); opacity: 0; } }
      .stream.lost { color: var(--sbp-warn); }
      @media (prefers-reduced-motion: reduce) {
        .dock-progress, .dock-progress[data-indeterminate="true"] { animation: none; }
        .dock-flash::before { animation: none; opacity: 0; }
      }

      /* -- narrow ------------------------------------------------------------- */
      @container (max-width: 600px) {
        .brand span, .stream-label { display: none; }
        .page { --page-gutter: 12px; }
        .top-row { gap: 8px; }
        .brand b { font-size: 10px; letter-spacing: 0.06em; }
        .hub-picker-btn { min-height: 40px; padding-inline: 9px; }
        .tab-btn { padding-inline: 14px; }
        .dock-inner { gap: 8px; }
        .dock:has(.dock-actions) .dock-inner { flex-direction: column; align-items: stretch; padding-block: 8px; }
        .dock:has(.dock-actions) .dock-center { justify-content: flex-start; }
        .dock:has(.dock-actions) .dock-right { justify-content: space-between; }
        .dock-action { min-height: 40px; }
        .view { padding-top: 12px; }
      }
    `
];
function definePanel() {
  if (!customElements.get(PANEL_TAG)) customElements.define(PANEL_TAG, SofabatonServerPanel);
}

// server-panel/src/views/api-view.ts
var API_VIEW_TAG = "sb-panel-api";
var TERMINAL_JOB = /* @__PURE__ */ new Set(["done", "failed", "cancelled"]);
var SbPanelApi = class extends i4 {
  constructor() {
    super(...arguments);
    this.ctx = null;
    this.hub = null;
    this.operations = [];
    this._request = "nothing sent yet";
    this._response = null;
    this._timing = "";
    this._pretty = true;
    this._history = [];
    this._sending = false;
    this._lastJob = null;
    this._storage = null;
  }
  willUpdate(changed) {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }
  connectedCallback() {
    super.connectedCallback();
    try {
      this._storage = window.localStorage;
    } catch {
      this._storage = null;
    }
    this._history = loadHistory(this._storage);
  }
  _field(id) {
    return this.renderRoot.querySelector(`#${id}`);
  }
  _value(id) {
    return (this._field(id)?.value ?? "").trim();
  }
  _setValue(id, value) {
    const el = this._field(id);
    if (el) el.value = value;
  }
  _pickOperation(event) {
    const index = Number(event.target.value);
    const op = this.operations[index];
    if (!op) return;
    this._setValue("method", op.method);
    this._setValue("path", op.path);
    if (op.hasBody && !this._value("reqbody")) this._setValue("reqbody", "{}");
  }
  _resolvePath(raw) {
    let p4 = raw.trim();
    if (!p4.startsWith("/")) p4 = `/${p4}`;
    p4 = p4.replace(/\{hub_id\}/g, this.hub?.hub_id ?? "{hub_id}");
    if (this._lastJob && /\{job_id\}/.test(p4)) p4 = p4.replace(/\{job_id\}/g, this._lastJob.job_id);
    return p4;
  }
  async _send(preset) {
    const method = preset?.method ?? this._value("method");
    const rawPath = preset?.path ?? this._value("path");
    const path = this._resolvePath(rawPath);
    const query = preset?.query ?? this._value("query");
    const headers = preset?.headers ?? parseHeaderLines(this._field("headers")?.value ?? "");
    let body = preset?.body ?? (this._field("reqbody")?.value ?? "").trim();
    if (method === "GET") body = "";
    const url = new URL(this.api.url(path, query));
    const sentHeaders = { ...headers };
    if (body && !Object.keys(sentHeaders).some((k2) => k2.toLowerCase() === "content-type")) sentHeaders["Content-Type"] = "application/json";
    const lines = [`${method} ${url.pathname}${url.search} HTTP/1.1`, `Host: ${url.host}`];
    for (const [k2, v3] of Object.entries(sentHeaders)) lines.push(`${k2}: ${v3}`);
    if (body) lines.push(`Content-Length: ${new TextEncoder().encode(body).length}`, "", body);
    this._request = lines.join("\n");
    this._timing = "";
    this._sending = true;
    const t0 = performance.now();
    let response;
    try {
      response = await this.api.request(method, path, { query, headers, rawBody: body });
    } catch (err) {
      this._response = { ok: false, status: 0, statusText: `request failed: ${String(err)}`, headers: [], text: "", body: null };
      this._sending = false;
      return;
    }
    this._sending = false;
    this._timing = `${Math.round(performance.now() - t0)} ms`;
    this._response = response;
    const job = response.body;
    if (response.status === 202 && job?.job_id && job.hub_id) this._lastJob = { hub_id: job.hub_id, job_id: job.job_id };
    this._history = [{ method, path: rawPath, query, body, status: response.status, at: (/* @__PURE__ */ new Date()).toLocaleTimeString() }, ...this._history].slice(0, HISTORY_LIMIT);
    saveHistory(this._storage, this._history);
    this.dispatchEvent(new CustomEvent("sb-request-sent", { bubbles: true, composed: true }));
  }
  async _follow() {
    const job = this._lastJob;
    if (!job) {
      this._response = { ok: false, status: 0, statusText: "no 202 job to follow yet", headers: [], text: "", body: null };
      return;
    }
    for (let i8 = 0; i8 < 600; i8++) {
      await this._send({ method: "GET", path: `/hubs/${job.hub_id}/jobs/${job.job_id}`, query: "", body: "", headers: {} });
      const status = this._response?.body?.status;
      if (!status || TERMINAL_JOB.has(status)) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  _recall(entry) {
    this._setValue("method", entry.method);
    this._setValue("path", entry.path);
    this._setValue("query", entry.query);
    this._setValue("reqbody", entry.body);
    this._setValue("op", "");
  }
  _renderResponse() {
    const r6 = this._response;
    if (!r6) return b2`<pre id="rawres">${this._sending ? "\u2026" : "no response yet"}</pre>`;
    if (r6.status === 0) return b2`<pre id="rawres">${r6.statusText}</pre>`;
    const cls = `s${String(r6.status)[0]}`;
    const headers = r6.headers.map(([k2, v3]) => `${k2}: ${v3}`).join("\n");
    const body = this._pretty ? prettyJson(r6.text) : r6.text;
    return b2`<pre id="rawres"><span class="status ${cls}">HTTP/1.1 ${r6.status} ${r6.statusText}</span>\n${headers}\n\n${body}</pre>`;
  }
  render() {
    return b2`
      <div class="split">
        <div class="panel">
          <h2>Request <span class="spacer"></span><span class="hint mono" id="api-base">${new URL(this.api.apiRoot, location.href).pathname}/</span></h2>
          <label>Operation (from openapi.json)</label>
          <select id="op" @change=${this._pickOperation}>
            <option value="">custom…</option>
            ${this.operations.map((op, i8) => b2`<option value=${String(i8)}>${op.method.padEnd(6)} ${op.path}  —  ${op.summary}</option>`)}
          </select>
          <div class="row">
            <div class="fixed" style="width: 110px"><label>Method</label>
              <select id="method"><option>GET</option><option>POST</option><option>PUT</option><option>DELETE</option><option>PATCH</option></select></div>
            <div><label>Path (relative to the API root; <code>{hub_id}</code> is the selected hub)</label>
              <input id="path" value="/hubs/{hub_id}/status" @keydown=${(e6) => {
      if (e6.key === "Enter") void this._send();
    }}></div>
          </div>
          <label>Query (a=b&amp;c=d)</label>
          <input id="query" placeholder="after=12&limit=50">
          <label>Headers (one per line, <code>Name: value</code>)</label>
          <textarea id="headers" placeholder='If-Match: "snapshot id"'></textarea>
          <label>Body (JSON; sent when non-empty and the method is not GET)</label>
          <textarea id="reqbody" style="min-height: 120px" @keydown=${(e6) => {
      if ((e6.ctrlKey || e6.metaKey) && e6.key === "Enter") void this._send();
    }}></textarea>
          <div class="actions" style="margin-top: 10px">
            <button class="primary" id="send" ?disabled=${this._sending} @click=${() => this._send()}>Send</button>
            <button id="follow" title="poll GET /hubs/{hub_id}/jobs/{job_id} from the last 202 until it finishes" @click=${this._follow}>Follow job</button>
            <button id="clear-hist" class="small" style="margin-left: auto" @click=${() => {
      this._history = [];
      saveHistory(this._storage, []);
    }}>clear history</button>
          </div>
          <label>Sent (raw)</label>
          <pre id="rawreq">${this._request}</pre>
          <label>History</label>
          <div class="history" id="history">
            ${this._history.map((h6) => b2`<button @click=${() => this._recall(h6)}>${h6.at}  ${h6.status}  ${h6.method} ${h6.path}${h6.query ? `?${h6.query}` : ""}</button>`)}
          </div>
        </div>
        <div class="panel">
          <h2>Response <span class="spacer"></span><span class="hint" id="timing">${this._timing}</span>
            <button class="small" id="toggle-pretty" @click=${() => {
      this._pretty = !this._pretty;
    }}>${this._pretty ? "raw" : "pretty"}</button></h2>
          ${this._renderResponse()}
        </div>
      </div>
    `;
  }
};
SbPanelApi.properties = {
  api: { attribute: false },
  ctx: { attribute: false },
  hub: { attribute: false },
  operations: { attribute: false },
  _request: { state: true },
  _response: { state: true },
  _timing: { state: true },
  _pretty: { state: true },
  _history: { state: true },
  _sending: { state: true }
};
SbPanelApi.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; }
      .split { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 16px; align-items: start; }
      .status { font-weight: 600; }
      .s2 { color: var(--sbp-ok); } .s3 { color: var(--sbp-accent); } .s4 { color: var(--sbp-warn); } .s5 { color: var(--sbp-err); }
      .history { display: flex; flex-direction: column; gap: 3px; margin-top: 6px; }
      .history button { text-align: left; font-family: var(--sbp-mono); font-size: 11px; padding: 4px 8px; background: var(--sbp-bg); }
      @media (max-width: 960px) { .split { grid-template-columns: 1fr; } }
    `
];
function defineApiView() {
  if (!customElements.get(API_VIEW_TAG)) customElements.define(API_VIEW_TAG, SbPanelApi);
}

// server-panel/src/views/backup-view.ts
var BACKUP_VIEW_TAG = "sb-panel-backup";
var COPY = {
  make: { title: "Make a backup", body: "Reads the whole hub into a bundle you can download and restore later. Coming with the editor plan; today `POST /hubs/{hub_id}/backup` in the API console does the same." },
  edit: { title: "Edit a backup", body: "Open a bundle, change devices and activities, and restore or apply the result. Coming with the editor plan." },
  restore: { title: "Restore", body: "Erase the hub and write a bundle back, or apply it in place. Coming with the editor plan; today `POST /hubs/{hub_id}/restore` in the API console does the same." }
};
var SbPanelBackup = class extends i4 {
  constructor() {
    super(...arguments);
    this.ctx = null;
    this.hub = null;
    this.section = "make";
  }
  willUpdate(changed) {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }
  render() {
    const copy = COPY[this.section] ?? COPY.make;
    return b2`
      <div class="panel" id="backup-placeholder">
        <h2>${copy.title}</h2>
        <div class="hint">${this.hub ? copy.body : "Pick a hub above."}</div>
      </div>
    `;
  }
};
SbPanelBackup.properties = {
  ctx: { attribute: false },
  hub: { attribute: false },
  section: { attribute: false }
};
SbPanelBackup.styles = [PANEL_BASE_CSS, i`:host { display: block; }`];
function defineBackupView() {
  if (!customElements.get(BACKUP_VIEW_TAG)) customElements.define(BACKUP_VIEW_TAG, SbPanelBackup);
}

// server-panel/src/views/catalog-view.ts
var CATALOG_VIEW_TAG = "sb-panel-catalog";
function buildCatalog(devices, activities, snapshot) {
  const provenance = /* @__PURE__ */ new Map();
  for (const e6 of snapshot?.devices ?? []) provenance.set(`device:${e6.device.device_id}`, e6);
  for (const e6 of snapshot?.activities ?? []) provenance.set(`activity:${e6.device.device_id}`, e6);
  const entries = [];
  for (const d3 of devices) {
    const p4 = provenance.get(`device:${d3.device_id}`);
    entries.push({ kind: "device", id: d3.device_id, name: d3.name, device: d3, activity: null, fetched_at: p4?.fetched_at ?? null, complete: p4?.complete ?? false });
  }
  for (const a4 of activities) {
    const p4 = provenance.get(`activity:${a4.activity_id}`);
    entries.push({ kind: "activity", id: a4.activity_id, name: a4.name, device: null, activity: a4, fetched_at: p4?.fetched_at ?? null, complete: p4?.complete ?? false });
  }
  return entries;
}
function jobPhrase(job) {
  const p4 = job.progress;
  const steps = p4 && p4.total_steps != null ? ` ${p4.completed_steps ?? 0}/${p4.total_steps}` : "";
  return `${job.status}${steps}`;
}
var POWER = { 0: "off", 1: "on" };
var SbPanelCatalog = class extends i4 {
  constructor() {
    super(...arguments);
    /** The hub context the shell hands over (state plan, decision 3); `hub` follows it. */
    this.ctx = null;
    this.hub = null;
    /** Which group to list: the Hub tab's Devices or Activities subtab; null lists both. */
    this.kind = null;
    this._entries = [];
    this._snapshot = null;
    this._selected = null;
    // "device:12" / "activity:101"
    this._deviceDetail = null;
    this._activityDetail = null;
    this._notice = null;
    this._detailNotice = null;
    this._refresh = null;
    this._loading = false;
    this._loadedFor = null;
    this._detailFor = null;
    this._devices = [];
    this._activities = [];
  }
  willUpdate(changed) {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }
  updated(changed) {
    if (changed.has("kind") && this.kind && this.selectedEntry && this.selectedEntry.kind !== this.kind) {
      this._selected = null;
      this._clearDetail();
    }
    if (changed.has("hub")) {
      const id = this.hub?.hub_id ?? null;
      if (id !== this._loadedFor) {
        this._loadedFor = id;
        this._entries = [];
        this._snapshot = null;
        this._selected = null;
        this._clearDetail();
        this._notice = null;
        if (id) void this._load();
      }
    }
  }
  _clearDetail() {
    this._deviceDetail = null;
    this._activityDetail = null;
    this._detailNotice = null;
    this._detailFor = null;
  }
  get selectedEntry() {
    if (!this._selected) return null;
    const [kind, id] = this._selected.split(":");
    return this._entries.find((e6) => e6.kind === kind && String(e6.id) === id) ?? null;
  }
  // -- loading ---------------------------------------------------------------------------
  /** The lists and the snapshot header; keeps the selection when it still exists. */
  async _load() {
    const hubId = this.hub?.hub_id;
    if (!hubId) return;
    this._loading = true;
    try {
      const [devices, activities, snapshot] = await Promise.all([this.api.devices(hubId), this.api.activities(hubId), this.api.snapshot(hubId)]);
      if (this._loadedFor !== hubId) return;
      const failed = [devices, activities].find((r6) => !r6.ok);
      if (failed) {
        this._notice = problemText(failed);
        this._entries = [];
        return;
      }
      this._notice = null;
      this._devices = devices.body ?? [];
      this._activities = activities.body ?? [];
      this._snapshot = snapshot.ok ? snapshot.body : null;
      this._entries = buildCatalog(this._devices, this._activities, this._snapshot);
      if (this._selected && !this.selectedEntry) {
        this._selected = null;
        this._clearDetail();
      }
    } catch (err) {
      this._notice = String(err);
    } finally {
      this._loading = false;
    }
  }
  async _select(entry) {
    const key = `${entry.kind}:${entry.id}`;
    if (this._selected === key) return;
    this._selected = key;
    await this._loadDetail(entry);
  }
  async _loadDetail(entry) {
    const hubId = this.hub?.hub_id;
    if (!hubId) return;
    const key = `${entry.kind}:${entry.id}`;
    this._detailFor = key;
    this._deviceDetail = null;
    this._activityDetail = null;
    this._detailNotice = null;
    try {
      if (entry.kind === "device") {
        const commands = await this.api.deviceCommands(hubId, entry.id);
        if (this._detailFor !== key) return;
        if (!commands.ok) this._detailNotice = problemText(commands);
        else this._deviceDetail = { commands: commands.body ?? [] };
      } else {
        const [buttons, macros, favorites] = await Promise.all([
          this.api.entityButtons(hubId, entry.id),
          this.api.activityMacros(hubId, entry.id),
          this.api.activityFavorites(hubId, entry.id)
        ]);
        if (this._detailFor !== key) return;
        const failed = [buttons, macros, favorites].find((r6) => !r6.ok);
        if (failed) this._detailNotice = problemText(failed);
        this._activityDetail = { buttons: buttons.body ?? [], macros: macros.body ?? [], favorites: favorites.body ?? [] };
      }
    } catch (err) {
      if (this._detailFor === key) this._detailNotice = String(err);
    }
    await this._reloadProvenance(hubId);
  }
  async _reloadProvenance(hubId) {
    try {
      const snapshot = await this.api.snapshot(hubId);
      if (this._loadedFor !== hubId || !snapshot.ok) return;
      this._snapshot = snapshot.body;
      this._entries = buildCatalog(this._devices, this._activities, this._snapshot);
    } catch {
    }
  }
  // -- refresh (the explicit hub read) ------------------------------------------------------
  async _refreshScope(scope, label) {
    const hubId = this.hub?.hub_id;
    if (!hubId || this._refresh) return;
    this._refresh = { scope: label, text: "starting\u2026" };
    try {
      const started = await this.api.refreshSnapshot(hubId, scope);
      if (started.status !== 202 || !started.body) {
        this._notice = `refresh ${label}: ${problemText(started)}`;
        return;
      }
      const job = await this.api.followJob(hubId, started.body.job_id, {
        onUpdate: (j2) => {
          this._refresh = { scope: label, text: jobPhrase(j2) };
        }
      });
      if (!job) this._notice = `refresh ${label}: the job could not be followed`;
      else if (job.status !== "done") this._notice = `refresh ${label}: ${job.status}${job.error ? ` (${job.error.type}${job.error.detail ? `: ${job.error.detail}` : ""})` : ""}`;
      else this._notice = null;
    } catch (err) {
      this._notice = `refresh ${label}: ${String(err)}`;
    } finally {
      this._refresh = null;
    }
    await this._load();
    const entry = this.selectedEntry;
    if (entry) await this._loadDetail(entry);
  }
  _refreshAll() {
    void this._refreshScope({}, "whole hub");
  }
  _refreshSelected() {
    const entry = this.selectedEntry;
    if (!entry) return;
    const scope = entry.kind === "device" ? { device_id: entry.id } : { activity_id: entry.id };
    void this._refreshScope(scope, `${entry.kind} ${entry.id}`);
  }
  // -- render -------------------------------------------------------------------------------
  render() {
    const hub = this.hub;
    if (!hub) return b2`<div class="panel"><div class="hint">Pick a hub above.</div></div>`;
    const devices = this.kind === "activity" ? [] : this._entries.filter((e6) => e6.kind === "device");
    const activities = this.kind === "device" ? [] : this._entries.filter((e6) => e6.kind === "activity");
    const snap = this._snapshot;
    return b2`
      <div class="wrap">
        <div class="panel" id="catalog-list">
          <div class="toolbar">
            <span class="status" id="catalog-status" title=${snap ? `snapshot ${snap.snapshot_id}` : ""}>
              ${snap ? b2`captured ${formatWhen(snap.captured_at)} · ${snap.complete ? "complete" : "partial"}` : this._loading ? "loading\u2026" : "no snapshot"}
            </span>
            <span class="spacer"></span>
            <button class="small" id="catalog-reload" ?disabled=${this._loading} @click=${() => void this._load()} title="re-read the server's cache">reload</button>
            <button class="small primary" id="catalog-refresh-all" ?disabled=${Boolean(this._refresh)} @click=${this._refreshAll} title="POST /snapshot/refresh: read the whole hub">
              ${this._refresh?.scope === "whole hub" ? this._refresh.text : "Refresh all"}
            </button>
          </div>
          ${this._notice ? b2`<div class="notice" id="catalog-notice" style="margin-top: 10px">${this._notice}</div>` : A}
          ${this.kind === "activity" ? A : b2`<div class="group">
            <h3>Devices <span class="hint">${devices.length}</span></h3>
            ${devices.length ? devices.map((e6) => this._renderEntry(e6)) : b2`<div class="hint">none</div>`}
          </div>`}
          ${this.kind === "device" ? A : b2`<div class="group">
            <h3>Activities <span class="hint">${activities.length}</span></h3>
            ${activities.length ? activities.map((e6) => this._renderEntry(e6)) : b2`<div class="hint">none</div>`}
          </div>`}
          <div class="hint" style="margin-top: 12px">Ids are what an integration sends: <code>entity_id</code> is a device's or an activity's id, <code>command_id</code> one of its commands. Rows come from the server's cache, read from the hub on first sight; a dot marks an entity read from the hub in full, which is what Refresh does.</div>
        </div>
        <div class="panel" id="catalog-detail">${this._renderDetail()}</div>
      </div>
    `;
  }
  _renderEntry(e6) {
    const key = `${e6.kind}:${e6.id}`;
    const sub = e6.kind === "device" ? [e6.device?.device_class, e6.device?.power_state != null ? `power ${POWER[e6.device.power_state] ?? e6.device.power_state}` : null].filter(Boolean).join(" \xB7 ") : [e6.activity?.active ? "running" : null, e6.activity?.needs_confirm ? "needs confirm" : null].filter(Boolean).join(" \xB7 ");
    return b2`<div class="ent ${this._selected === key ? "sel" : ""}" data-entity=${key} @click=${() => void this._select(e6)}>
      <span class="id">${e6.id}</span>
      <span class="name">${e6.name}</span>
      <span class="dot ${e6.complete ? "ok" : e6.fetched_at ? "warn" : "off"}" title=${e6.fetched_at ? `refreshed from the hub ${formatWhen(e6.fetched_at)}${e6.complete ? "" : ", incomplete"}` : "not refreshed from the hub yet; rows come from the server's cache"}></span>
      <span class="sub">${sub || (e6.kind === "device" ? "device" : "activity")}</span>
    </div>`;
  }
  _renderDetail() {
    const e6 = this.selectedEntry;
    if (!e6) return b2`<div class="hint">Select a device or an activity to see its ids and rows.</div>`;
    const busy = Boolean(this._refresh);
    const label = `${e6.kind} ${e6.id}`;
    const refreshText = this._refresh?.scope === label ? this._refresh.text : e6.kind === "device" ? "Refresh device" : "Refresh activity";
    const facts = [
      ["entity id", String(e6.id)],
      // The library stamps an entity only on a full read (Refresh); rows
      // read on demand fill the cache without a stamp.
      ["refreshed", e6.fetched_at ? `${formatWhen(e6.fetched_at)}${e6.complete ? "" : " (incomplete)"}` : "never (rows come from the server's cache)"]
    ];
    if (e6.device) {
      facts.push(["class", `${e6.device.device_class ?? "?"}${e6.device.device_class_code != null ? ` (${e6.device.device_class_code})` : ""}`]);
      facts.push(["power", e6.device.power_state != null ? POWER[e6.device.power_state] ?? String(e6.device.power_state) : "unknown"]);
      facts.push(["idle behaviour", e6.device.idle_behavior != null ? String(e6.device.idle_behavior) : "none"]);
    }
    if (e6.activity) {
      facts.push(["state", e6.activity.active ? "running" : "not running"], ["needs confirm", e6.activity.needs_confirm ? "yes" : "no"]);
    }
    return b2`
      <div class="headline"><span class="kind">${e6.kind}</span><span class="title">${e6.name}</span><span class="spacer"></span>
        <button class="small" id="catalog-refresh-entity" ?disabled=${busy} @click=${this._refreshSelected} title="POST /snapshot/refresh for this entity">${refreshText}</button></div>
      <dl class="facts">${facts.map(([k2, v3]) => b2`<div><dt>${k2}</dt><dd>${v3}</dd></div>`)}</dl>
      ${this._detailNotice ? b2`<div class="notice" id="catalog-detail-notice">${this._detailNotice}</div>` : A}
      ${e6.kind === "device" ? this._renderDevice(e6) : this._renderActivity(e6)}
    `;
  }
  _renderDevice(e6) {
    const detail = this._deviceDetail;
    return b2`<div class="section">
      <h3>Commands <span class="hint">${detail ? detail.commands.length : "\u2026"}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": ${e6.id}, "command_id": …}</span></h3>
      ${detail ? detail.commands.length ? b2`<div class="scroll-x"><table class="list" id="catalog-commands">
              <thead><tr><th>command id</th><th>label</th></tr></thead>
              <tbody>${detail.commands.map((c7) => b2`<tr><td class="num">${c7.command_id}</td><td>${c7.label}</td></tr>`)}</tbody>
            </table></div>` : b2`<div class="hint">no commands</div>` : this._detailNotice ? A : b2`<div class="hint">loading…</div>`}
    </div>`;
  }
  _renderActivity(e6) {
    const d3 = this._activityDetail;
    if (!d3) return this._detailNotice ? b2`` : b2`<div class="hint">loading…</div>`;
    const bound = d3.buttons.filter((b3) => b3.device_id != null || b3.command_id != null);
    return b2`
      <div class="section">
        <h3>Buttons <span class="hint">${bound.length} bound of ${d3.buttons.length}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": ${e6.id}, "command_id": button code}</span></h3>
        ${d3.buttons.length ? b2`<div class="scroll-x"><table class="list" id="catalog-buttons">
              <thead><tr><th>button code</th><th>name</th><th>device</th><th>command</th><th>long press</th></tr></thead>
              <tbody>${d3.buttons.map((b3) => b2`<tr>
                <td class="num">${b3.button_code}</td><td>${b3.name ?? ""}</td>
                <td class="num">${b3.device_id ?? b2`<span class="sub">–</span>`}</td><td class="num">${b3.command_id ?? b2`<span class="sub">–</span>`}</td>
                <td class="num">${b3.long_press_device_id != null && b3.long_press_command_id != null ? `${b3.long_press_device_id} / ${b3.long_press_command_id}` : b2`<span class="sub">–</span>`}</td>
              </tr>`)}</tbody>
            </table></div>` : b2`<div class="hint">no buttons</div>`}
      </div>
      <div class="section">
        <h3>Macros <span class="hint">${d3.macros.length}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": ${e6.id}, "command_id": …}</span></h3>
        ${d3.macros.length ? b2`<table class="list" id="catalog-macros"><thead><tr><th>command id</th><th>label</th></tr></thead>
              <tbody>${d3.macros.map((m3) => b2`<tr><td class="num">${m3.command_id}</td><td>${m3.label ?? ""}</td></tr>`)}</tbody></table>` : b2`<div class="hint">no macros</div>`}
      </div>
      <div class="section">
        <h3>Favourites <span class="hint">${d3.favorites.length}</span><span class="spacer"></span><span class="hint mono">POST /send {"entity_id": device, "command_id": …}</span></h3>
        ${d3.favorites.length ? b2`<table class="list" id="catalog-favorites"><thead><tr><th>device</th><th>command id</th><th>label</th></tr></thead>
              <tbody>${d3.favorites.map((f4) => b2`<tr><td class="num">${f4.device_id}</td><td class="num">${f4.command_id}</td><td>${f4.label ?? ""}</td></tr>`)}</tbody></table>` : b2`<div class="hint">no favourites</div>`}
      </div>
    `;
  }
};
SbPanelCatalog.properties = {
  api: { attribute: false },
  ctx: { attribute: false },
  hub: { attribute: false },
  kind: { attribute: false },
  _entries: { state: true },
  _snapshot: { state: true },
  _selected: { state: true },
  _deviceDetail: { state: true },
  _activityDetail: { state: true },
  _notice: { state: true },
  _detailNotice: { state: true },
  _refresh: { state: true },
  _loading: { state: true }
};
SbPanelCatalog.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; }
      .wrap { display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 16px; align-items: start; }
      .group { margin-top: 10px; }
      .group h3 { margin: 6px 0 4px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--sbp-muted); display: flex; gap: 8px; align-items: center; }
      .ent { display: grid; grid-template-columns: 44px 1fr auto; gap: 2px 10px; align-items: center; padding: 6px 8px; border-radius: 8px; cursor: pointer; border: 1px solid transparent; }
      .ent:hover { background: var(--sbp-panel-2); }
      .ent.sel { background: rgba(var(--sbp-accent-rgb), 0.12); border-color: rgba(var(--sbp-accent-rgb), 0.35); }
      .ent .id { grid-column: 1; grid-row: 1 / span 2; font-family: var(--sbp-mono); font-size: 12px; color: var(--sbp-muted); }
      .ent .name { grid-column: 2; grid-row: 1; font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ent .sub { grid-column: 2; grid-row: 2; color: var(--sbp-muted); font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .ent .dot { grid-column: 3; grid-row: 1 / span 2; }
      .headline { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; flex-wrap: wrap; }
      .headline .title { font-size: 17px; font-weight: 650; }
      .headline .kind { color: var(--sbp-muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px 18px; margin: 6px 0 12px; padding: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; }
      table.list td.num { font-family: var(--sbp-mono); }
      .section { margin-top: 14px; }
      .section h3 { margin: 0 0 4px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
      .section h3 .hint { font-weight: 400; }
      .notice { padding: 8px 12px; border-radius: 8px; background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12); color: var(--sbp-err); font-size: 13px; margin-bottom: 10px; }
      .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .toolbar .status { font-size: 12px; color: var(--sbp-muted); }
      @media (max-width: 960px) { .wrap { grid-template-columns: 1fr; } }
    `
];
function defineCatalogView() {
  if (!customElements.get(CATALOG_VIEW_TAG)) customElements.define(CATALOG_VIEW_TAG, SbPanelCatalog);
}

// server-panel/src/views/events-view.ts
var EVENTS_VIEW_TAG = "sb-panel-events";
var SbPanelEvents = class extends i4 {
  constructor() {
    super(...arguments);
    this._grep = "";
    this._expand = false;
    this._tick = 0;
    this._unsubscribe = [];
  }
  connectedCallback() {
    super.connectedCallback();
    this._subscribe();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    for (const off of this._unsubscribe) off();
    this._unsubscribe = [];
  }
  _subscribe() {
    if (!this.stream || this._unsubscribe.length) return;
    this._unsubscribe = [this.stream.onMessage(() => this._bump()), this.stream.onState(() => this._bump())];
  }
  _bump() {
    this._tick++;
  }
  updated() {
    this._subscribe();
    const list = this.renderRoot.querySelector("#ws-list");
    list?.lastElementChild?.scrollIntoView({ block: "nearest" });
  }
  _applyFilter() {
    const raw = this.renderRoot.querySelector("#ws-filter")?.value ?? "";
    this.stream.hubFilter = raw.split(",").map((s7) => s7.trim()).filter(Boolean);
    this.stream.restart();
    this._bump();
  }
  _toggle() {
    if (this.stream.wanted) this.stream.stop();
    else this.stream.start();
    this._bump();
  }
  render() {
    const stream = this.stream;
    const grep = this._grep.trim().toLowerCase();
    const rows = stream ? stream.messages : [];
    const shown = rows.filter((row) => !grep || (summarizeMessage(row.data) + " " + row.text).toLowerCase().includes(grep));
    return b2`
      <div class="panel">
        <h2>Event stream <span class="hint mono">/events</span><span class="spacer"></span>
          <input id="ws-filter" placeholder="hub_id filter (optional, comma separated)" @change=${this._applyFilter}>
          <button class="small" id="ws-toggle" @click=${this._toggle}>${stream?.wanted ? "disconnect" : "connect"}</button>
          <button class="small" id="ws-clear" @click=${() => {
      stream?.clear();
      this._bump();
    }}>clear</button></h2>
        <div class="row" style="margin-bottom: 8px; align-items: center">
          <input id="ws-grep" placeholder="show only messages containing… (type, kind, hub, label)" @input=${(e6) => {
      this._grep = e6.target.value;
    }}>
          <label class="inline fixed"><input type="checkbox" id="ws-expand" .checked=${this._expand} @change=${(e6) => {
      this._expand = e6.target.checked;
    }}> expand all</label>
        </div>
        <div class="hint" id="ws-count">${shown.length} of ${rows.length} messages${stream?.connected ? "" : " \xB7 not connected"}</div>
        <div class="list" id="ws-list">
          ${shown.map((row) => b2`<details class="k-${String(row.data.type ?? "raw")}" ?open=${this._expand}>
            <summary><span class="t">${row.at}</span><span>${summarizeMessage(row.data)}</span></summary>
            <pre>${prettyJson(row.text)}</pre>
          </details>`)}
        </div>
      </div>
    `;
  }
};
SbPanelEvents.properties = {
  stream: { attribute: false },
  _grep: { state: true },
  _expand: { state: true },
  _tick: { state: true }
};
SbPanelEvents.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; }
      h2 input { max-width: 320px; font-size: 12px; padding: 3px 8px; }
      .list { display: flex; flex-direction: column; gap: 4px; }
      details { border: 1px solid var(--sbp-line); border-radius: 6px; background: var(--sbp-bg); }
      summary { padding: 5px 10px; cursor: pointer; font-family: var(--sbp-mono); font-size: 12px; display: flex; gap: 10px; }
      summary .t { color: var(--sbp-muted); }
      details pre { border: 0; border-top: 1px solid var(--sbp-line); border-radius: 0; }
      .k-press summary { border-left: 3px solid var(--sbp-press); }
      .k-job_event summary { border-left: 3px solid var(--sbp-warn); }
      .k-server_event summary { border-left: 3px solid var(--sbp-accent); }
      .k-hub_event summary { border-left: 3px solid var(--sbp-ok); }
      .k-dropped summary { border-left: 3px solid var(--sbp-err); }
    `
];
function defineEventsView() {
  if (!customElements.get(EVENTS_VIEW_TAG)) customElements.define(EVENTS_VIEW_TAG, SbPanelEvents);
}

// server-panel/src/views/hubs-view.ts
var HUBS_VIEW_TAG = "sb-panel-hubs";
var SbPanelHubs = class extends i4 {
  constructor() {
    super(...arguments);
    this.ctx = null;
    this.hubs = [];
    this.hub = null;
    this.seen = [];
    this._busy = /* @__PURE__ */ new Set();
    this._scanning = false;
    this._adding = false;
  }
  willUpdate(changed) {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }
  /** Focus the address field (the picker's "Add a hub" lands here). */
  focusAddress() {
    const input = this.renderRoot.querySelector("#add-host");
    input?.focus();
    input?.scrollIntoView({ block: "center" });
  }
  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
  _message(text, ok = true) {
    this._emit("sb-message", { text, ok });
  }
  // -- lifecycle actions ------------------------------------------------------
  async _act(hubId, action) {
    if (this._busy.has(hubId)) return;
    if (action === "remove" && !confirm(`Remove hub ${hubId}?

The server stops its proxy, hands the hub back, and forgets its record, cached state and web remote layout. The hub itself is not changed.`)) {
      return;
    }
    const record = this.hubs.find((h6) => h6.hub_id === hubId) ?? null;
    this._busy = new Set(this._busy).add(hubId);
    try {
      const response = action === "remove" ? await this.api.removeHub(hubId) : action === "enable" ? await this.api.enableHub(hubId) : await this.api.disableHub(hubId);
      if (response.ok) this._message(`${hubId}: ${actionOutcome(action, record)}`);
      else this._message(`${hubId}: ${problemText(response)}`, false);
    } catch (err) {
      this._message(String(err), false);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(hubId);
      this._busy = busy;
    }
    this._emit("sb-hubs-changed");
  }
  async _add(body) {
    if (this._adding) return;
    this._adding = true;
    try {
      const response = await this.api.addHub(body);
      if (response.status === 201 && response.body) {
        this._message(`added ${response.body.hub_id}${response.body.enabled ? "" : " (disabled)"}`);
        this._emit("sb-select-hub", { hubId: response.body.hub_id });
        const host = this.renderRoot.querySelector("#add-host");
        const name = this.renderRoot.querySelector("#add-name");
        if (host) host.value = "";
        if (name) name.value = "";
      } else if (response.status === 503) {
        const problem = response.body;
        const hubId = problem?.hub_id || body.host;
        this._message(`${hubId} is registered but its proxy did not start: ${problem?.detail ?? ""}. Fix the cause and press Retry start.`, false);
        this._emit("sb-select-hub", { hubId });
      } else {
        this._message(problemText(response), false);
      }
    } catch (err) {
      this._message(String(err), false);
    } finally {
      this._adding = false;
    }
    this._emit("sb-hubs-changed");
  }
  _submitAdd(event) {
    event.preventDefault();
    const host = this.renderRoot.querySelector("#add-host")?.value.trim() ?? "";
    if (!host) return;
    const name = this.renderRoot.querySelector("#add-name")?.value.trim() ?? "";
    const disabled = this.renderRoot.querySelector("#add-disabled")?.checked ?? false;
    void this._add({ host, ...name ? { name } : {}, enabled: !disabled });
  }
  async _scan() {
    if (this._scanning) return;
    this._scanning = true;
    try {
      const response = await this.api.scan(5);
      if (response.ok && Array.isArray(response.body)) this.seen = response.body;
      else this._message(problemText(response), false);
    } catch (err) {
      this._message(String(err), false);
    } finally {
      this._scanning = false;
    }
    this._emit("sb-hubs-changed");
  }
  // -- render ---------------------------------------------------------------------
  render() {
    return b2`
      <div class="panel" id="hub-detail">${this._renderDetail()}</div>
      <div class="panel">
        <h2>Register a hub by address <span class="spacer"></span><span class="hint">one owner per hub: disable it in Home Assistant or another proxy first</span></h2>
        <form id="hub-add" @submit=${this._submitAdd}>
          <div class="row">
            <div><input id="add-host" placeholder="192.168.1.50" autocomplete="off" required></div>
            <div class="name"><input id="add-name" placeholder="name (optional)"></div>
            <button class="primary fixed" id="add-send" type="submit" ?disabled=${this._adding}>Add hub</button>
          </div>
          <div style="margin-top: 8px"><label class="inline"><input type="checkbox" id="add-disabled"> start disabled (register only, connect later)</label></div>
          <div class="hint" style="margin-top: 8px">A hub added by address is re-keyed to its MAC after its first sync. Disable stops the proxy and hands the hub back to the app; Remove also forgets its cached state and remote layout. The hub itself is never changed.</div>
        </form>
      </div>
      <div class="panel">
        <h2>Discovered on the LAN <span class="hint" id="seen-note">${this._seenNote()}</span><span class="spacer"></span>
          <button class="small" id="seen-scan" title="POST /discovery/scan: listen for hub advertisements for 5 seconds" ?disabled=${this._scanning} @click=${this._scan}>${this._scanning ? "scanning\u2026" : "scan 5 s"}</button></h2>
        ${this.seen.length ? b2`<div class="scroll-x">
              <table class="list" id="seen-table">
                <thead><tr><th>host</th><th>model</th><th>name</th><th>mac</th><th>seen</th><th></th></tr></thead>
                <tbody>${this.seen.map((s7) => this._renderSeen(s7))}</tbody>
              </table>
            </div>` : b2`<div class="hint" id="seen-empty">Nothing advertised yet. Hubs announce themselves over mDNS; a scan asks again.</div>`}
      </div>
    `;
  }
  _seenNote() {
    if (!this.seen.length) return "";
    return `(${this.seen.filter((s7) => s7.present).length} present)`;
  }
  /** The registered hub an advertisement belongs to: the server's answer, or a host / MAC match. */
  _registeredFor(s7) {
    if (s7.registered_hub_id) return s7.registered_hub_id;
    const c7 = s7.config ?? {};
    const mac = String(c7.mac ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
    const hit = this.hubs.find((h6) => h6.config.host === c7.host || mac && (h6.hub_id === mac || String(h6.config.mac ?? "").toLowerCase().replace(/[^0-9a-f]/g, "") === mac));
    return hit?.hub_id ?? null;
  }
  _renderSeen(s7) {
    const c7 = s7.config ?? {};
    const registered = this._registeredFor(s7);
    return b2`<tr>
      <td class="mono">${c7.host || "?"}</td>
      <td>${c7.hub_version || "?"}</td>
      <td>${c7.name || ""}</td>
      <td class="mono sub">${c7.mac || ""}</td>
      <td class=${s7.present ? "tone-ok" : "sub"} title="first seen ${formatWhen(s7.first_seen)}, last seen ${formatWhen(s7.last_seen)}">${s7.present ? "present" : "gone"}</td>
      <td class="act">
        ${registered ? b2`<span class="sub">registered as ${registered}</span>` : b2`<button class="small primary" ?disabled=${this._adding} @click=${() => this._add({ ...c7, enabled: true })}>Add</button>`}
      </td>
    </tr>`;
  }
  _renderDetail() {
    const h6 = this.hub;
    if (!h6) return b2`<div class="hint">${this.hubs.length ? "No hub selected." : "No hubs registered yet."} Register one below by address, or add one from the discovered list, then manage it here.</div>`;
    const { text, tone } = hubState(h6);
    const s7 = h6.status;
    const busy = this._busy.has(h6.hub_id);
    const model = h6.config.hub_version || s7?.hub_version || "unknown";
    const facts = [
      ["state", b2`<span class="tone-${tone}">${text}</span>`],
      ["host", b2`<span class="mono">${h6.config.host}</span>`],
      ["model", model],
      ["hub id", b2`<span class="mono">${h6.hub_id}</span>`],
      ["mac", b2`<span class="mono">${h6.config.mac || "not yet known"}</span>`],
      ["last seen", formatWhen(h6.last_seen)],
      ["added", formatWhen(h6.added_at)],
      ["cache", s7 ? `${s7.devices_cached} devices \xB7 ${s7.activities_cached} activities` : "no proxy running"],
      ["running activity", s7?.running_activity ? String(s7.running_activity.name || s7.running_activity.activity_id) : "none"]
    ];
    return b2`
      <div class="headline"><span class="dot ${tone}"></span><span class="title">${hubDisplayName(h6)}</span><span class="id mono">${h6.config.name ? h6.hub_id : ""}</span></div>
      <dl class="facts">${facts.map(([k2, v3]) => b2`<div><dt>${k2}</dt><dd>${v3}</dd></div>`)}</dl>
      <div class="actions" id="hub-actions">
        ${!h6.enabled ? b2`<button class="primary" ?disabled=${busy} @click=${() => this._act(h6.hub_id, "enable")}>Enable</button>` : A}
        ${h6.enabled && !s7 ? b2`<button class="primary" ?disabled=${busy} @click=${() => this._act(h6.hub_id, "enable")}>Retry start</button>` : A}
        ${h6.enabled ? b2`<button ?disabled=${busy} @click=${() => this._act(h6.hub_id, "disable")}>Disable</button>` : A}
        <button class="danger" ?disabled=${busy} @click=${() => this._act(h6.hub_id, "remove")}>Remove</button>
        <button @click=${() => this._emit("sb-navigate", { tab: "hub" })}>Open hub</button>
        <button @click=${() => this._emit("sb-navigate", { tab: "remote" })}>Open remote</button>
      </div>
    `;
  }
};
SbPanelHubs.properties = {
  api: { attribute: false },
  ctx: { attribute: false },
  hubs: { attribute: false },
  hub: { attribute: false },
  seen: { attribute: false },
  _busy: { state: true },
  _scanning: { state: true },
  _adding: { state: true }
};
SbPanelHubs.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; }
      .headline { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
      .headline .title { font-size: 17px; font-weight: 650; }
      .headline .id { color: var(--sbp-muted); font-size: 12px; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 18px; margin: 6px 0 14px; padding: 0; }
      .facts div { min-width: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      form .row { max-width: 720px; flex-wrap: wrap; }
      form .row > div:first-child { flex: 1 1 200px; min-width: 160px; }
      form .row > .name { flex: 1 1 140px; }
    `
];
function defineHubsView() {
  if (!customElements.get(HUBS_VIEW_TAG)) customElements.define(HUBS_VIEW_TAG, SbPanelHubs);
}

// server-panel/src/views/remote-view.ts
var REMOTE_VIEW_TAG = "sb-panel-remote";
var SbPanelRemote = class extends i4 {
  constructor() {
    super(...arguments);
    this.ctx = null;
    this.hub = null;
    /** The Remote tab's subtab: the mounted card, or the layout document. */
    this.section = "card";
    this._status = "";
    this._statusOk = true;
    this._banner = null;
    this._documentText = "";
    this._backend = null;
    this._card = null;
    this._unsubscribe = null;
    this._mountedFor = null;
    this._document = null;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._unmount();
  }
  willUpdate(changed) {
    if (changed.has("ctx")) this.hub = this.ctx?.hub ?? null;
  }
  updated(changed) {
    if (changed.has("hub")) {
      const id = this.hub?.hub_id ?? null;
      if (id !== this._mountedFor) {
        this._unmount();
        if (id) void this._mount(id);
      }
    }
    const stage = this.renderRoot.querySelector("#stage");
    if (stage && this._card && this._card.parentElement !== stage) stage.appendChild(this._card);
  }
  _unmount() {
    this._unsubscribe?.();
    this._unsubscribe = null;
    this._card?.setBackend(null);
    this._card?.remove();
    this._card = null;
    this._backend?.stop();
    this._backend = null;
    this._mountedFor = null;
    this._banner = null;
    this._document = null;
    this._documentText = "";
    this._setStatus("");
  }
  async _mount(hubId) {
    this._mountedFor = hubId;
    const response = await this.api.remoteCardDocument(hubId);
    if (this._mountedFor !== hubId) return;
    if (response.ok && response.body) {
      this._document = response.body.document;
      this._documentText = this._document ? JSON.stringify(this._document, null, 2) : "";
      this._setStatus(this._document ? `stored document (updated ${formatWhen(response.body.updated_at)})` : "no document stored: the card uses its defaults");
    } else {
      this._document = null;
      this._documentText = "";
      this._setStatus(problemText(response), false);
    }
    const backend = new ServerRemoteBackend({ baseUrl: this.api.baseUrl });
    backend.setTarget(hubId);
    this._backend = backend;
    const card = document.createElement(TYPE);
    card.setConfig(cardConfigForWebRemote(hubId, this._document));
    card.setLanguage(navigator.language);
    card.setBackend(backend);
    this._card = card;
    this._unsubscribe = backend.subscribe(() => this._syncBanner());
    this._syncBanner();
    this.requestUpdate();
  }
  _syncBanner() {
    const backend = this._backend;
    if (!backend) return;
    const snapshot = backend.snapshot();
    const unavailable = !snapshot || snapshot.state === "unavailable";
    this._banner = unavailable ? backend.lastError ? `The server cannot reach the hub (${backend.lastError}).` : "The hub is not controllable right now (offline, disabled, or the Sofabaton app is connected)." : null;
  }
  _setStatus(text, ok = true) {
    this._status = text;
    this._statusOk = ok;
  }
  _readDocument() {
    const text = this._textarea()?.value.trim() ?? "";
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch (err) {
      this._setStatus(`not valid JSON: ${err.message}`, false);
      return null;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      this._setStatus("the document must be a JSON object", false);
      return null;
    }
    return parsed;
  }
  _textarea() {
    return this.renderRoot.querySelector("#remote-doc");
  }
  _apply(document2) {
    this._document = document2;
    this._documentText = document2 ? JSON.stringify(document2, null, 2) : "";
    const textarea = this._textarea();
    if (textarea) textarea.value = this._documentText;
    if (this._card && this._mountedFor) this._card.setConfig(cardConfigForWebRemote(this._mountedFor, document2));
  }
  async _save() {
    const hubId = this._mountedFor;
    if (!hubId) return;
    const document2 = this._readDocument();
    if (!document2) return;
    try {
      const response = await this.api.putRemoteCardDocument(hubId, document2);
      if (!response.ok || !response.body) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(response.body.document);
      this._setStatus(`saved (updated ${formatWhen(response.body.updated_at)}); applied to the remote`);
    } catch (err) {
      this._setStatus(String(err), false);
    }
  }
  async _reload() {
    const hubId = this._mountedFor;
    if (!hubId) return;
    try {
      const response = await this.api.remoteCardDocument(hubId);
      if (!response.ok || !response.body) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(response.body.document);
      this._setStatus(response.body.document ? `stored document (updated ${formatWhen(response.body.updated_at)})` : "no document stored: the card uses its defaults");
    } catch (err) {
      this._setStatus(String(err), false);
    }
  }
  async _reset() {
    const hubId = this._mountedFor;
    if (!hubId) return;
    try {
      const response = await this.api.deleteRemoteCardDocument(hubId);
      if (response.status !== 204) {
        this._setStatus(problemText(response), false);
        return;
      }
      this._apply(null);
      this._setStatus("reset: the card uses its defaults");
    } catch (err) {
      this._setStatus(String(err), false);
    }
  }
  render() {
    const hub = this.hub;
    return this.section === "layout" ? this._renderLayout(hub) : this._renderCard(hub);
  }
  _renderCard(hub) {
    return b2`
        <div class="frame">
          <div class="bar">
            <span class="title" id="remote-title" title=${hub ? `web remote for ${hub.hub_id}` : ""}>${hub ? hubDisplayName(hub) : "no hub selected"}</span>
            <span class="spacer"></span>
            <a class="hint" id="remote-link" href=${this.api.remoteUrl(hub?.hub_id ?? null)} target="_blank" rel="noopener" title="open the remote in its own tab">open ↗</a>
          </div>
          ${this._banner ? b2`<div class="banner" id="remote-banner">${this._banner}</div>` : ""}
          <div class="stage" id="stage">${hub ? "" : b2`<div class="hint">Pick a hub above.</div>`}</div>
          ${hub ? b2`<div class="foot">${hubDisplayName(hub)} · remote card ${CARD_VERSION}</div>` : ""}
        </div>
    `;
  }
  _renderLayout(hub) {
    return b2`
        <div class="panel">
          <h2>Layout <span class="spacer"></span><span class="hint mono">PUT /hubs/{hub_id}/ui/remote-card</span></h2>
          <div class="hint">The card configuration for this hub, stored on the server and shared by every phone, tablet and wall panel that opens the remote: the Home Assistant card's YAML as JSON, minus <code>entity</code>, <code>theme</code> and Home Assistant actions. An empty object resets to the card's defaults. Saving applies it to the remote on the left.</div>
          <textarea id="remote-doc" .value=${this._documentText} ?disabled=${!hub} placeholder='{ "show_dpad": true, "group_order": ["activity", "dpad", "nav"] }'></textarea>
          <div class="actions" style="margin-top: 10px">
            <button class="primary" id="remote-save" ?disabled=${!hub} @click=${this._save}>Save</button>
            <button id="remote-load" ?disabled=${!hub} @click=${this._reload}>Reload document</button>
            <button class="danger" id="remote-delete" ?disabled=${!hub} @click=${this._reset}>Reset to defaults</button>
            <span class="msg ${this._statusOk ? "msg-ok" : "msg-err"}" id="remote-status">${this._status}</span>
          </div>
        </div>
    `;
  }
};
SbPanelRemote.properties = {
  api: { attribute: false },
  ctx: { attribute: false },
  hub: { attribute: false },
  section: { attribute: false },
  _status: { state: true },
  _statusOk: { state: true },
  _banner: { state: true },
  _documentText: { state: true }
};
SbPanelRemote.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; height: 100%; }
      .frame { max-width: 420px; margin: 0 auto; }
      .frame { background: var(--sbp-panel); border: 1px solid var(--sbp-line); border-radius: var(--sbp-radius); overflow: hidden; }
      .bar { display: flex; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--sbp-line); font-size: 12px; color: var(--sbp-muted); white-space: nowrap; }
      .bar .title { overflow: hidden; text-overflow: ellipsis; min-width: 0; }
      .stage { padding: 10px; }
      .banner { margin: 10px 10px 0; padding: 8px 12px; border-radius: 8px; background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12); color: var(--sbp-err); font-size: 13px; }
      .foot { padding: 6px 10px 8px; color: var(--sbp-muted); font-size: 11px; text-align: center; }
      textarea { min-height: 260px; margin-top: 10px; }
    `
];
function defineRemoteView() {
  if (!customElements.get(REMOTE_VIEW_TAG)) customElements.define(REMOTE_VIEW_TAG, SbPanelRemote);
}

// server-panel/src/views/server-view.ts
var SERVER_VIEW_TAG = "sb-panel-server";
var SbPanelServer = class extends i4 {
  constructor() {
    super(...arguments);
    this.info = null;
    this.error = null;
    this.reachable = true;
    this.streamOn = false;
    this.hubCount = 0;
    this._listener = null;
    this._status = "";
    this._retrying = false;
  }
  _emit(name, detail) {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }
  async _retry() {
    if (this._retrying) return;
    this._retrying = true;
    try {
      const response = await this.api.retryCallbackListener();
      if (response.ok && response.body) {
        this._listener = response.body;
        this._status = response.body.bound ? `listener bound on :${response.body.bound_port}` : "listener still not bound";
      } else {
        this._status = problemText(response);
      }
    } catch (err) {
      this._status = String(err);
    } finally {
      this._retrying = false;
    }
    this._emit("sb-hubs-changed");
  }
  render() {
    const info = this.info;
    const listener = this._listener ?? info?.callback_listener ?? null;
    const listenerText = !listener ? "unknown" : listener.bound ? `bound on :${listener.bound_port}` : listener.wanted ? "wanted, not bound" : "idle (no callback devices)";
    const facts = [
      ["server", this.error ?? (info ? info.version : "connecting\u2026")],
      ["library", info?.library_version ?? "?"],
      ["api", info?.api_version ?? "?"],
      ["instance", info?.instance_id ?? "?"],
      ["hubs", String(this.hubCount)],
      ["event stream", this.streamOn ? "live" : "off"],
      ["callback listener", listenerText]
    ];
    return b2`
      <div class="panel" id="server-detail">
        <h2>Server <span class="spacer"></span><span class="hint mono" id="server-meta">${info ? `server ${info.version} \xB7 library ${info.library_version} \xB7 api ${info.api_version}` : this.error ?? ""}</span></h2>
        <dl class="facts">${facts.map(([k2, v3]) => b2`<div><dt>${k2}</dt><dd>${v3}</dd></div>`)}</dl>
        <div class="actions">
          <button class="small" id="listener-retry" ?disabled=${this._retrying || !this.reachable} @click=${this._retry} title="POST /server/callback-listener/retry">${this._retrying ? "retrying\u2026" : "Retry callback listener"}</button>
          <span class="msg" id="server-status">${this._status}</span>
        </div>
        <div class="hint" style="margin-top: 10px">The callback listener is the port the hubs deliver button presses to (the Wifi Events device); it comes up when a hub has a callback device deployed. The event stream is this page's live feed from the server.</div>
      </div>
    `;
  }
};
SbPanelServer.properties = {
  api: { attribute: false },
  info: { attribute: false },
  error: { attribute: false },
  reachable: { attribute: false },
  streamOn: { attribute: false },
  hubCount: { attribute: false },
  _listener: { state: true },
  _status: { state: true },
  _retrying: { state: true }
};
SbPanelServer.styles = [
  PANEL_BASE_CSS,
  i`
      :host { display: block; }
      .facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 18px; margin: 6px 0 14px; padding: 0; }
      .facts div { min-width: 0; }
      .facts dt { color: var(--sbp-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
      .facts dd { margin: 0; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    `
];
function defineServerView() {
  if (!customElements.get(SERVER_VIEW_TAG)) customElements.define(SERVER_VIEW_TAG, SbPanelServer);
}

// server-panel/src/panel.ts
function bootstrapServerPanel() {
  installRemoteWebShims();
  logPillsOnce();
  if (!customElements.get(TYPE)) customElements.define(TYPE, SofabatonRemoteCard);
  defineHubsView();
  defineCatalogView();
  defineRemoteView();
  defineApiView();
  defineEventsView();
  defineServerView();
  defineBackupView();
  definePanel();
}
if (typeof window !== "undefined" && typeof customElements !== "undefined") {
  bootstrapServerPanel();
}
export {
  bootstrapServerPanel
};
