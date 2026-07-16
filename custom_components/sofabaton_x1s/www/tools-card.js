// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t4, e5, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t4, this.t = e5;
  }
  get styleSheet() {
    let t4 = this.o;
    const s4 = this.t;
    if (e && void 0 === t4) {
      const e5 = void 0 !== s4 && 1 === s4.length;
      e5 && (t4 = o.get(s4)), void 0 === t4 && ((this.o = t4 = new CSSStyleSheet()).replaceSync(this.cssText), e5 && o.set(s4, t4));
    }
    return t4;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
var i = (t4, ...e5) => {
  const o5 = 1 === t4.length ? t4[0] : e5.reduce((e6, s4, o6) => e6 + ((t5) => {
    if (true === t5._$cssResult$) return t5.cssText;
    if ("number" == typeof t5) return t5;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t4[o6 + 1], t4[0]);
  return new n(o5, t4, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
  else for (const e5 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e5.cssText, s4.appendChild(o6);
  }
};
var c = e ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
  let e5 = "";
  for (const s4 of t5.cssRules) e5 += s4.cssText;
  return r(e5);
})(t4) : t4;

// node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t4, s4) => t4;
var u = { toAttribute(t4, s4) {
  switch (s4) {
    case Boolean:
      t4 = t4 ? l : null;
      break;
    case Object:
    case Array:
      t4 = null == t4 ? t4 : JSON.stringify(t4);
  }
  return t4;
}, fromAttribute(t4, s4) {
  let i7 = t4;
  switch (s4) {
    case Boolean:
      i7 = null !== t4;
      break;
    case Number:
      i7 = null === t4 ? null : Number(t4);
      break;
    case Object:
    case Array:
      try {
        i7 = JSON.parse(t4);
      } catch (t5) {
        i7 = null;
      }
  }
  return i7;
} };
var f = (t4, s4) => !i2(t4, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ?? (Symbol.metadata = /* @__PURE__ */ Symbol("metadata")), a.litPropertyMetadata ?? (a.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
var y = class extends HTMLElement {
  static addInitializer(t4) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t4);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t4, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t4) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t4, s4), !s4.noAccessor) {
      const i7 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t4, i7, s4);
      void 0 !== h3 && e2(this.prototype, t4, h3);
    }
  }
  static getPropertyDescriptor(t4, s4, i7) {
    const { get: e5, set: r4 } = h(this.prototype, t4) ?? { get() {
      return this[s4];
    }, set(t5) {
      this[s4] = t5;
    } };
    return { get: e5, set(s5) {
      const h3 = e5?.call(this);
      r4?.call(this, s5), this.requestUpdate(t4, h3, i7);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t4) {
    return this.elementProperties.get(t4) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t4 = n2(this);
    t4.finalize(), void 0 !== t4.l && (this.l = [...t4.l]), this.elementProperties = new Map(t4.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t5 = this.properties, s4 = [...r2(t5), ...o2(t5)];
      for (const i7 of s4) this.createProperty(i7, t5[i7]);
    }
    const t4 = this[Symbol.metadata];
    if (null !== t4) {
      const s4 = litPropertyMetadata.get(t4);
      if (void 0 !== s4) for (const [t5, i7] of s4) this.elementProperties.set(t5, i7);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t5, s4] of this.elementProperties) {
      const i7 = this._$Eu(t5, s4);
      void 0 !== i7 && this._$Eh.set(i7, t5);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i7 = [];
    if (Array.isArray(s4)) {
      const e5 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e5) i7.unshift(c(s5));
    } else void 0 !== s4 && i7.push(c(s4));
    return i7;
  }
  static _$Eu(t4, s4) {
    const i7 = s4.attribute;
    return false === i7 ? void 0 : "string" == typeof i7 ? i7 : "string" == typeof t4 ? t4.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t4) => this.enableUpdating = t4), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t4) => t4(this));
  }
  addController(t4) {
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t4), void 0 !== this.renderRoot && this.isConnected && t4.hostConnected?.();
  }
  removeController(t4) {
    this._$EO?.delete(t4);
  }
  _$E_() {
    const t4 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i7 of s4.keys()) this.hasOwnProperty(i7) && (t4.set(i7, this[i7]), delete this[i7]);
    t4.size > 0 && (this._$Ep = t4);
  }
  createRenderRoot() {
    const t4 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t4, this.constructor.elementStyles), t4;
  }
  connectedCallback() {
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), this._$EO?.forEach((t4) => t4.hostConnected?.());
  }
  enableUpdating(t4) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t4) => t4.hostDisconnected?.());
  }
  attributeChangedCallback(t4, s4, i7) {
    this._$AK(t4, i7);
  }
  _$ET(t4, s4) {
    const i7 = this.constructor.elementProperties.get(t4), e5 = this.constructor._$Eu(t4, i7);
    if (void 0 !== e5 && true === i7.reflect) {
      const h3 = (void 0 !== i7.converter?.toAttribute ? i7.converter : u).toAttribute(s4, i7.type);
      this._$Em = t4, null == h3 ? this.removeAttribute(e5) : this.setAttribute(e5, h3), this._$Em = null;
    }
  }
  _$AK(t4, s4) {
    const i7 = this.constructor, e5 = i7._$Eh.get(t4);
    if (void 0 !== e5 && this._$Em !== e5) {
      const t5 = i7.getPropertyOptions(e5), h3 = "function" == typeof t5.converter ? { fromAttribute: t5.converter } : void 0 !== t5.converter?.fromAttribute ? t5.converter : u;
      this._$Em = e5;
      const r4 = h3.fromAttribute(s4, t5.type);
      this[e5] = r4 ?? this._$Ej?.get(e5) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t4, s4, i7, e5 = false, h3) {
    if (void 0 !== t4) {
      const r4 = this.constructor;
      if (false === e5 && (h3 = this[t4]), i7 ?? (i7 = r4.getPropertyOptions(t4)), !((i7.hasChanged ?? f)(h3, s4) || i7.useDefault && i7.reflect && h3 === this._$Ej?.get(t4) && !this.hasAttribute(r4._$Eu(t4, i7)))) return;
      this.C(t4, s4, i7);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t4, s4, { useDefault: i7, reflect: e5, wrapped: h3 }, r4) {
    i7 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t4) && (this._$Ej.set(t4, r4 ?? s4 ?? this[t4]), true !== h3 || void 0 !== r4) || (this._$AL.has(t4) || (this.hasUpdated || i7 || (s4 = void 0), this._$AL.set(t4, s4)), true === e5 && this._$Em !== t4 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t4));
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
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t6, s5] of this._$Ep) this[t6] = s5;
        this._$Ep = void 0;
      }
      const t5 = this.constructor.elementProperties;
      if (t5.size > 0) for (const [s5, i7] of t5) {
        const { wrapped: t6 } = i7, e5 = this[s5];
        true !== t6 || this._$AL.has(s5) || void 0 === e5 || this.C(s5, void 0, i7, e5);
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
    this._$Eq && (this._$Eq = this._$Eq.forEach((t5) => this._$ET(t5, this[t5]))), this._$EM();
  }
  updated(t4) {
  }
  firstUpdated(t4) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ?? (a.reactiveElementVersions = [])).push("2.1.2");

// node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t4) => t4;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t4) => t4 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t4) => null === t4 || "object" != typeof t4 && "function" != typeof t4;
var u2 = Array.isArray;
var d2 = (t4) => u2(t4) || "function" == typeof t4?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t4) => (i7, ...s4) => ({ _$litType$: t4, strings: i7, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t4, i7) {
  if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i7) : i7;
}
var N = (t4, i7) => {
  const s4 = t4.length - 1, e5 = [];
  let n4, l3 = 2 === i7 ? "<svg>" : 3 === i7 ? "<math>" : "", c4 = v;
  for (let i8 = 0; i8 < s4; i8++) {
    const s5 = t4[i8];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t4[i8 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e5.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i8 : x2);
  }
  return [V(t4, l3 + (t4[s4] || "<?>") + (2 === i7 ? "</svg>" : 3 === i7 ? "</math>" : "")), e5];
};
var S2 = class _S {
  constructor({ strings: t4, _$litType$: i7 }, e5) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t4.length - 1, d3 = this.parts, [f3, v2] = N(t4, i7);
    if (this.el = _S.createElement(f3, e5), P.currentNode = this.el.content, 2 === i7 || 3 === i7) {
      const t5 = this.el.content.firstChild;
      t5.replaceWith(...t5.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t5 of r4.getAttributeNames()) if (t5.endsWith(h2)) {
          const i8 = v2[a3++], s4 = r4.getAttribute(t5).split(o3), e6 = /([.?@])?(.*)/.exec(i8);
          d3.push({ type: 1, index: l3, name: e6[2], strings: s4, ctor: "." === e6[1] ? I : "?" === e6[1] ? L : "@" === e6[1] ? z : H }), r4.removeAttribute(t5);
        } else t5.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t5));
        if (y2.test(r4.tagName)) {
          const t5 = r4.textContent.split(o3), i8 = t5.length - 1;
          if (i8 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i8; s4++) r4.append(t5[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t5[i8], c3());
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
  static createElement(t4, i7) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t4, s4;
  }
};
function M(t4, i7, s4 = t4, e5) {
  if (i7 === E) return i7;
  let h3 = void 0 !== e5 ? s4._$Co?.[e5] : s4._$Cl;
  const o5 = a2(i7) ? void 0 : i7._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t4), h3._$AT(t4, s4, e5)), void 0 !== e5 ? (s4._$Co ?? (s4._$Co = []))[e5] = h3 : s4._$Cl = h3), void 0 !== h3 && (i7 = M(t4, h3._$AS(t4, i7.values), h3, e5)), i7;
}
var R = class {
  constructor(t4, i7) {
    this._$AV = [], this._$AN = void 0, this._$AD = t4, this._$AM = i7;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t4) {
    const { el: { content: i7 }, parts: s4 } = this._$AD, e5 = (t4?.creationScope ?? l2).importNode(i7, true);
    P.currentNode = e5;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i8;
        2 === r4.type ? i8 = new k(h3, h3.nextSibling, this, t4) : 1 === r4.type ? i8 = new r4.ctor(h3, r4.name, r4.strings, this, t4) : 6 === r4.type && (i8 = new Z(h3, this, t4)), this._$AV.push(i8), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e5;
  }
  p(t4) {
    let i7 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t4, s4, i7), i7 += s4.strings.length - 2) : s4._$AI(t4[i7])), i7++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t4, i7, s4, e5) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t4, this._$AB = i7, this._$AM = s4, this.options = e5, this._$Cv = e5?.isConnected ?? true;
  }
  get parentNode() {
    let t4 = this._$AA.parentNode;
    const i7 = this._$AM;
    return void 0 !== i7 && 11 === t4?.nodeType && (t4 = i7.parentNode), t4;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t4, i7 = this) {
    t4 = M(this, t4, i7), a2(t4) ? t4 === A || null == t4 || "" === t4 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t4 !== this._$AH && t4 !== E && this._(t4) : void 0 !== t4._$litType$ ? this.$(t4) : void 0 !== t4.nodeType ? this.T(t4) : d2(t4) ? this.k(t4) : this._(t4);
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
    const { values: i7, _$litType$: s4 } = t4, e5 = "number" == typeof s4 ? this._$AC(t4) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e5) this._$AH.p(i7);
    else {
      const t5 = new R(e5, this), s5 = t5.u(this.options);
      t5.p(i7), this.T(s5), this._$AH = t5;
    }
  }
  _$AC(t4) {
    let i7 = C.get(t4.strings);
    return void 0 === i7 && C.set(t4.strings, i7 = new S2(t4)), i7;
  }
  k(t4) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i7 = this._$AH;
    let s4, e5 = 0;
    for (const h3 of t4) e5 === i7.length ? i7.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i7[e5], s4._$AI(h3), e5++;
    e5 < i7.length && (this._$AR(s4 && s4._$AB.nextSibling, e5), i7.length = e5);
  }
  _$AR(t4 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t4 !== this._$AB; ) {
      const s5 = i3(t4).nextSibling;
      i3(t4).remove(), t4 = s5;
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
  constructor(t4, i7, s4, e5, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t4, this.name = i7, this._$AM = e5, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t4, i7 = this, s4, e5) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t4 = M(this, t4, i7, 0), o5 = !a2(t4) || t4 !== this._$AH && t4 !== E, o5 && (this._$AH = t4);
    else {
      const e6 = t4;
      let n4, r4;
      for (t4 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e6[s4 + n4], i7, n4), r4 === E && (r4 = this._$AH[n4]), o5 || (o5 = !a2(r4) || r4 !== this._$AH[n4]), r4 === A ? t4 = A : t4 !== A && (t4 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e5 && this.j(t4);
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
  constructor(t4, i7, s4, e5, h3) {
    super(t4, i7, s4, e5, h3), this.type = 5;
  }
  _$AI(t4, i7 = this) {
    if ((t4 = M(this, t4, i7, 0) ?? A) === E) return;
    const s4 = this._$AH, e5 = t4 === A && s4 !== A || t4.capture !== s4.capture || t4.once !== s4.once || t4.passive !== s4.passive, h3 = t4 !== A && (s4 === A || e5);
    e5 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t4), this._$AH = t4;
  }
  handleEvent(t4) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t4) : this._$AH.handleEvent(t4);
  }
};
var Z = class {
  constructor(t4, i7, s4) {
    this.element = t4, this.type = 6, this._$AN = void 0, this._$AM = i7, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t4) {
    M(this, t4);
  }
};
var j = { M: h2, P: o3, A: n3, C: 1, L: N, R, D: d2, V: M, I: k, H, N: L, U: z, B: I, F: Z };
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ?? (t2.litHtmlVersions = [])).push("3.3.2");
var D = (t4, i7, s4) => {
  const e5 = s4?.renderBefore ?? i7;
  let h3 = e5._$litPart$;
  if (void 0 === h3) {
    const t5 = s4?.renderBefore ?? null;
    e5._$litPart$ = h3 = new k(i7.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
  }
  return h3._$AI(t4), h3;
};

// node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a;
    const t4 = super.createRenderRoot();
    return (_a = this.renderOptions).renderBefore ?? (_a.renderBefore = t4.firstChild), t4;
  }
  update(t4) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t4), this._$Do = D(r4, this.renderRoot, this.renderOptions);
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
var e4 = (t4) => (...e5) => ({ _$litDirective$: t4, values: e5 });
var i5 = class {
  constructor(t4) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t4, e5, i7) {
    this._$Ct = t4, this._$AM = e5, this._$Ci = i7;
  }
  _$AS(t4, e5) {
    return this.update(t4, e5);
  }
  update(t4, e5) {
    return this.render(...e5);
  }
};

// node_modules/lit-html/directive-helpers.js
var { I: t3 } = j;
var m2 = {};
var p3 = (o5, t4 = m2) => o5._$AH = t4;

// node_modules/lit-html/directives/keyed.js
var i6 = e4(class extends i5 {
  constructor() {
    super(...arguments), this.key = A;
  }
  render(r4, t4) {
    return this.key = r4, t4;
  }
  update(r4, [t4, e5]) {
    return t4 !== this.key && (p3(r4), this.key = t4), e5;
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
  return b2`
    <div class=${rowClassName}>
      ${params.items.map((item) => {
    const isActive = item.id === params.selectedId;
    const isPassive = item.passive || !params.onSelect;
    const buttonClassName = normalizeClassName(
      `secondary-tab-btn${isActive ? " active" : ""}${isPassive ? " secondary-tab-btn--static" : ""}`
    );
    if (isPassive) {
      return b2`
            <div class=${buttonClassName}>
              <span class="secondary-tab-btn-icon"><ha-icon icon=${item.icon}></ha-icon></span>
              <span class="secondary-tab-btn-label">${item.label}</span>
              ${typeof item.count === "number" ? b2`<span class="secondary-tab-btn-count">${item.count}</span>` : A}
            </div>
          `;
    }
    return b2`
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
            ${typeof item.count === "number" ? b2`<span class="secondary-tab-btn-count">${item.count}</span>` : A}
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
  return b2`
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
  return b2`
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
  return b2`
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
  return b2`
    <div class=${viewClassName}>
      ${params.content}
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/shared/styles/card-styles.ts
var cardStyles = [secondaryTabStyles, i`
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
  /* Wifi command press wipe — a soft primary-tinted band sweeps left
     to right across the bottom dock when the user pushes a Wifi
     Command on their physical remote. No alarm semantics: it borrows
     the dock's existing primary-color language, the motion is one
     pass (no pulse), and pointer-events:none keeps the dock
     interactive while it plays. Keyed on the event timestamp so each
     fresh press cleanly remounts and restarts the sweep. */
  .card-bottom-dock-ir-flash {
    position: absolute;
    inset: 0;
    pointer-events: none;
    border-radius: inherit;
    overflow: hidden;
  }
  .card-bottom-dock-ir-flash::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: 38%;
    background: linear-gradient(
      90deg,
      transparent 0%,
      color-mix(in srgb, var(--primary-color) 22%, transparent) 35%,
      color-mix(in srgb, var(--primary-color) 38%, transparent) 50%,
      color-mix(in srgb, var(--primary-color) 22%, transparent) 65%,
      transparent 100%
    );
    box-shadow: 0 0 18px color-mix(in srgb, var(--primary-color) 22%, transparent);
    transform: translateX(-100%);
    animation: dockIrWipe 720ms cubic-bezier(0.22, 0.61, 0.36, 1) 1 forwards;
  }
  @keyframes dockIrWipe {
    0%   { transform: translateX(-100%); opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { transform: translateX(280%); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .card-bottom-dock-ir-flash::before {
      animation: none;
      opacity: 0;
    }
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
  .logs-console { flex: 1; min-height: 0; border: 1px solid color-mix(in srgb, #8fb3d9 16%, var(--divider-color)); border-radius: 10px; background: linear-gradient(180deg, color-mix(in srgb, #16202b 92%, black), color-mix(in srgb, #0f151d 96%, black)); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03), inset 0 0 0 1px rgba(120, 150, 190, 0.04); font-family: "SF Mono", "Fira Code", Consolas, monospace; padding: 10px 0; user-select: text; -webkit-user-select: text; }
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
  .cache-panel { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .cache-panel .secondary-view-shell,
  .cache-panel .secondary-tab-panel { min-width: 0; }
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
  .entity-block { width: 100%; min-width: 0; max-width: 100%; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--secondary-background-color, var(--ha-card-background)); overflow-x: clip; transition: border-color 120ms ease; }
  .entity-block:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
  .entity-summary { width: 100%; min-width: 0; display: flex; align-items: center; gap: 8px; overflow: hidden; padding: 9px 10px 9px 12px; cursor: pointer; user-select: none; border-radius: var(--ha-card-border-radius, 12px); transition: background-color 120ms ease; }
  .entity-summary:hover { background: color-mix(in srgb, var(--primary-color) 5%, var(--secondary-background-color, var(--ha-card-background))); }
  .entity-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; flex: 0 0 auto; }
  .entity-name { font-size: 13px; font-weight: 700; flex: 1 1 0; min-width: 0; display: inline-flex; align-items: center; gap: 8px; overflow: hidden; }
  .entity-name-icon { display: inline-flex; align-items: center; justify-content: center; color: var(--state-icon-color, var(--secondary-text-color)); flex-shrink: 0; }
  .entity-name-icon ha-icon { --mdc-icon-size: 16px; }
  .entity-name-copy { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 0; overflow: hidden; }
  .entity-name-label { display: block; min-width: 0; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entity-body { display: none; }
  .entity-block.open .entity-body { display: block; }
  .entity-block.open > .entity-summary { position: sticky; top: 0; z-index: 2; background: var(--secondary-background-color, var(--ha-card-background)); border-bottom: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
  .id-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; font-family: "SF Mono", "Fira Code", Consolas, monospace; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); border-radius: calc(var(--ha-card-border-radius, 12px) * 0.4); padding: 2px 5px; flex-shrink: 0; white-space: nowrap; min-width: 68px; justify-content: space-between; }
  .id-badge span:first-child { color: var(--secondary-text-color); opacity: 0.75; }
  .id-badge span:last-child { color: var(--primary-text-color); text-align: right; }
  .entity-count { display: block; min-width: 0; font-size: 10px; font-weight: 400; line-height: 1.05; color: var(--secondary-text-color); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cache-panel-header {
    margin-top: 6px;
    margin-bottom: 8px;
    gap: 18px;
  }
  .cache-panel-header .refresh-action { display: inline-flex; align-items: center; gap: 8px; }
  .refresh-list-label--clickable { cursor: pointer; -webkit-user-select: none; user-select: none; }
  .refresh-list-label--clickable:hover { color: var(--primary-text-color); }
  .refresh-list-label--clickable[aria-disabled="true"] { cursor: default; }
  .refresh-list-label--clickable[aria-disabled="true"]:hover { color: var(--secondary-text-color); }
  .cache-panel-body,
  .secondary-tab-panel--connected .cache-panel-body {
    min-width: 0;
    grid-template-columns: minmax(0, 1fr);
    overflow-x: hidden;
    padding-top: 0;
  }
  .entity-chevron { font-size: 8px; color: var(--secondary-text-color); transition: transform 150ms; flex-shrink: 0; }
  /* Activity re-order mode: rows swap the play icon for a drag handle,
     take an alternate background, and become draggable as a whole. */
  .entity-block--reorder {
    background: color-mix(in srgb, var(--primary-color) 9%, var(--secondary-background-color, var(--ha-card-background)));
    border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color));
    cursor: grab;
  }
  .entity-block--reorder:active { cursor: grabbing; }
  .entity-block--reorder .entity-summary { cursor: inherit; }
  .entity-block--reorder .entity-summary:hover { background: transparent; }
  .entity-block--reorder .entity-name-icon { color: var(--primary-color); }
  .cache-reorder-list { min-width: 0; display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; align-content: start; }
  .cache-reorder-sortable { display: block; min-width: 0; }
  .sortable-ghost.entity-block--reorder { opacity: 0.45; }
  .cache-list-footer { display: flex; flex-direction: column; gap: 8px; padding: 12px 0 4px; }
  .cache-reorder-hint { font-size: 11.5px; color: var(--secondary-text-color); }
  .cache-footer-error { font-size: 12px; color: var(--error-color, #db4437); }
  .cache-footer-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .cache-footer-btn {
    display: inline-flex; align-items: center; gap: 6px;
    border: 1px solid var(--divider-color);
    border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
    background: transparent;
    color: var(--primary-text-color);
    font: inherit; font-size: 12.5px; font-weight: 700;
    padding: 7px 12px; cursor: pointer;
  }
  .cache-footer-btn ha-icon { --mdc-icon-size: 16px; }
  .cache-footer-btn:hover:not([disabled]) { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
  .cache-footer-btn[disabled] { opacity: 0.5; cursor: default; }
  .cache-footer-btn--primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
  /* Add Activity dialog. */
  .cache-modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
  .cache-dialog {
    width: min(420px, calc(100vw - 36px));
    display: flex; flex-direction: column; gap: 12px;
    padding: 16px;
    border-radius: calc(var(--ha-card-border-radius, 12px) * 1.33);
    border: 1px solid var(--divider-color);
    background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
    box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28));
  }
  .cache-dialog-title { font-size: 16px; font-weight: 700; color: var(--primary-text-color); }
  .cache-dialog-text { font-size: 13px; line-height: 1.55; color: var(--secondary-text-color); }
  .cache-dialog-input {
    width: 100%; box-sizing: border-box;
    padding: 9px 10px;
    border: 1px solid var(--divider-color);
    border-radius: calc(var(--ha-card-border-radius, 12px) * 0.7);
    background: var(--card-background-color, var(--primary-background-color));
    color: var(--primary-text-color);
    font: inherit; font-size: 13.5px;
  }
  .cache-dialog-input:focus { outline: none; border-color: var(--primary-color); }
  .cache-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
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
  .settings-hub-header { flex-shrink: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 0; }
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
    .hub-connection-strip { grid-template-columns: auto minmax(14px, 1fr) auto minmax(14px, 1fr) auto; gap: 6px; padding: 8px 10px; }
    .hub-connection-node { width: 42px; height: 42px; border-radius: 14px; }
    .hub-hero-icon { width: 25px; height: 25px; }
    .hub-ident-name { font-size: 15px; }
    .hub-compact-stats { display: none; }
    .entity-chevron { display: none; }
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
};

// custom_components/sofabaton_x1s/www/src/shared/utils/control-panel-selectors.ts
var BUTTON_NAMES = {
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
  const bySort = (value) => Number(value ?? 0) > 0 ? Number(value) : Number.POSITIVE_INFINITY;
  return [...hub?.activities ?? []].sort(
    (left, right) => bySort(left?.sort) - bySort(right?.sort) || Number(left?.id ?? 0) - Number(right?.id ?? 0)
  );
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
function hubRefreshBusy(snapshot, entryId) {
  return !!entryId && entryId in snapshot.refreshBusyByHub;
}
function hubActiveRefreshLabel(snapshot, entryId) {
  return entryId ? snapshot.refreshBusyByHub[entryId] ?? null : null;
}
function hubExternalCommandLabel(snapshot, entryId) {
  return entryId ? snapshot.externalHubCommandByHub[entryId] ?? null : null;
}
function resolveRuntimeState(snapshot) {
  const hub = selectedHub(snapshot);
  const entryId = hub?.entry_id ?? null;
  const completionNotice = entryId ? snapshot.runtimeCompletionNoticeByHub[entryId] : void 0;
  if (completionNotice) {
    return {
      kind: "completion",
      tone: completionNotice.tone,
      label: completionNotice.label,
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
      operation: hubRuntime.operation === "backup_restore" ? "backup_restore" : hubRuntime.operation === "backup_export" ? "backup_export" : hubRuntime.operation === "cache_refresh" ? "cache_refresh" : hubRuntime.operation === "entity_sync" ? "entity_sync" : "wifi_deploy",
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
  const externalLabel = hubExternalCommandLabel(snapshot, entryId);
  if (externalLabel !== null) {
    return {
      kind: "notice",
      label: externalLabel || "Hub command in progress...",
      detail: null
    };
  }
  if (hubRefreshBusy(snapshot, entryId)) {
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
      message: gateState.kind === "version_mismatch" ? "Refresh the dashboard to load the updated Sofabaton Control Panel card." : gateState.kind === "backend_unavailable" ? "Waiting for the Sofabaton X integration to finish starting." : "This hub is not connected, so the control panel is unavailable until the hub reconnects."
    };
  }
  if (tabId === "logs" || tabId === "settings" || tabId === "cache") {
    return { kind: "available" };
  }
  const hub = selectedHub(snapshot);
  if (hub && proxyClientConnected(snapshot.hass, hub)) {
    const title = tabId === "wifi_commands" ? "Wifi Commands unavailable" : "Backup unavailable";
    const message = tabId === "wifi_commands" ? "Wifi Commands cannot be used while the Sofabaton app is connected to the hub through the proxy." : "Backup cannot be used while the Sofabaton app is connected to the hub through the proxy.";
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
    return w`<svg class=${className.trim()} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 421.04 173.01" aria-hidden="true" fill="currentColor">
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
  return b2`<ha-icon class=${className.trim()} icon=${icon}></ha-icon>`;
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
  wifiPressSubscribedEntryId: null
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
      lastWifiPress: null
    };
    this._clearRuntimeStatePoll();
    this._clearRuntimeCompletionTimers();
    this._clearBackendRetry();
    void this._teardownBackupOperationFeed();
    void this._teardownWifiPressFeed();
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
      lastWifiPress: null
    };
    this.persistViewState();
    this.emit();
    void (async () => {
      await this._teardownBackupOperationFeed();
      await this._teardownWifiPressFeed();
      await this.unsubscribeLogs();
      await this.loadControlPanelState();
      await this._syncBackupOperationFeed();
      await this._syncWifiPressFeed();
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
  emit() {
    this.onChange(this._snapshot);
  }
};

// custom_components/sofabaton_x1s/www/src/components/hub-picker.ts
function renderHubPicker(params) {
  const prefix = params.prefixLabel ?? "HUB";
  if (!params.interactive) {
    return b2`
      <div class="hub-picker hub-picker--static" id="hub-picker-root">
        <div class="hub-picker-btn hub-picker-btn--static">
          <span class="chip-prefix">${prefix}</span>
          <span class="chip-name">${params.selectedLabel}</span>
        </div>
      </div>
    `;
  }
  return b2`
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
      ${params.open ? b2`
            <div id="hub-picker-menu" class="hub-picker-menu" role="menu">
              ${params.hubs.map(
    (hub) => b2`
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

// custom_components/sofabaton_x1s/www/src/components/tab-bar.ts
function renderTabBar(params) {
  const tabs = [
    { id: "cache", label: TOOLS_CARD_STRINGS.tabs.cache, disabled: false },
    { id: "wifi_commands", label: TOOLS_CARD_STRINGS.tabs.wifiCommands, disabled: false },
    { id: "backup", label: TOOLS_CARD_STRINGS.tabs.backup, disabled: false }
  ];
  const toolsMenuActive = params.selectedTab === "settings" || params.selectedTab === "logs";
  return b2`
    <div class="tabs">
      <div class="tabs-scroll">
        ${tabs.map(
    (tab) => b2`
            <button
              class="tab-btn${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
              type="button"
              ?disabled=${tab.disabled}
              @click=${() => params.onSelect(tab.id)}
            >
              <span class="tab-btn-label">${tab.label}</span>
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
        ${params.toolsMenuOpen ? b2`
              <div class="tab-menu-dropdown" id="tools-tab-menu-dropdown" role="menu">
                <button
                  class="tab-menu-item${params.selectedTab === "settings" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "settings")}
                  @click=${() => params.onSelect("settings")}
                >
                  ${TOOLS_CARD_STRINGS.tabs.settings}
                </button>
                <button
                  class="tab-menu-item${params.selectedTab === "logs" ? " active" : ""}"
                  type="button"
                  role="menuitemradio"
                  aria-checked=${String(params.selectedTab === "logs")}
                  @click=${() => params.onSelect("logs")}
                >
                  ${TOOLS_CARD_STRINGS.tabs.logs}
                </button>
              </div>
            ` : null}
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/components/setting-tile.ts
function renderSettingTile(params) {
  return b2`
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
          ${params.footerLabel ? b2`<span class="setting-global-tag">${params.footerLabel}</span>` : A}
        </div>
        <div class="setting-description">${params.description}</div>
      </div>
      <div class="setting-tile-control">${params.control}</div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/settings-tab.ts
function renderSettingsTab(params) {
  if (params.loading) return b2`<div class="cache-state">${TOOLS_CARD_STRINGS.settings.loading}</div>`;
  if (params.error) return b2`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return b2`<div class="cache-state">${TOOLS_CARD_STRINGS.settings.noHubsFound}</div>`;
  const hub = params.hub;
  const connected = hubConnected(params.hass, hub);
  const proxyOn = proxyClientConnected(params.hass, hub);
  const hubVersion = String(hub.version ?? "").trim();
  const firmwareVersion = hub.firmware_version != null ? `FW: v${hub.firmware_version}` : "";
  const versionLine = [hubVersion ? `Sofabaton ${hubVersion}` : "", firmwareVersion].filter(Boolean).join(" / ");
  const busy = !!(params.pendingSettingKey || params.pendingActionKey || params.hubCommandBusy);
  const canAct = canRunHubActions(params.hass, params.hub) && !busy;
  const settingValue = (key) => !!params.hub?.settings?.[key];
  return b2`
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
              <div class="hub-compact-name">${hub.name || TOOLS_CARD_STRINGS.settings.unknownHubName}</div>
              ${versionLine ? b2`<div class="hub-compact-meta">${versionLine}</div>` : A}
              ${hub.ip_address ? b2`<div class="hub-compact-meta">${hub.ip_address}</div>` : A}
            </div>
          </div>
          <div class="hub-compact-stats">
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("activities", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.activity_count || 0)}</div>
                <div class="hub-compact-stat-label">${TOOLS_CARD_STRINGS.settings.activities}</div>
              </div>
            </div>
            <div class="hub-compact-divider"></div>
            <div class="hub-compact-stat">
              <span class="hub-compact-stat-icon">${hubIcon("devices", "hub-compact-stat-svg")}</span>
              <div class="hub-compact-stat-text">
                <div class="hub-compact-stat-value">${Number(hub.device_count || 0)}</div>
                <div class="hub-compact-stat-label">${TOOLS_CARD_STRINGS.settings.devices}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="tab-panel scrollable">
        <div class="settings-content">
          <div class="settings-list">
            ${renderSettingTile({
    title: TOOLS_CARD_STRINGS.settings.persistentCacheTitle,
    description: TOOLS_CARD_STRINGS.settings.persistentCacheDescription,
    classes: `toggle${busy ? " disabled" : ""}`,
    footerLabel: TOOLS_CARD_STRINGS.settings.persistentCacheFooter,
    control: b2`<ha-switch .checked=${params.persistentCacheEnabled} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("persistent_cache", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("persistent_cache", !params.persistentCacheEnabled)
  })}
            ${renderSettingTile({
    title: TOOLS_CARD_STRINGS.settings.hexLoggingTitle,
    description: TOOLS_CARD_STRINGS.settings.hexLoggingDescription,
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${settingValue("hex_logging_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("hex_logging_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("hex_logging_enabled", !settingValue("hex_logging_enabled"))
  })}
            ${renderSettingTile({
    title: TOOLS_CARD_STRINGS.settings.proxyTitle,
    description: TOOLS_CARD_STRINGS.settings.proxyDescription,
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${settingValue("proxy_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("proxy_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("proxy_enabled", !settingValue("proxy_enabled"))
  })}
            ${renderSettingTile({
    title: TOOLS_CARD_STRINGS.settings.wifiDeviceTitle,
    description: TOOLS_CARD_STRINGS.settings.wifiDeviceDescription,
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${settingValue("wifi_device_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("wifi_device_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("wifi_device_enabled", !settingValue("wifi_device_enabled"))
  })}
            ${renderSettingTile({
    title: TOOLS_CARD_STRINGS.settings.findRemoteTitle,
    description: TOOLS_CARD_STRINGS.settings.findRemoteDescription,
    classes: `action${canAct ? "" : " disabled"}`,
    control: b2`<ha-icon class="setting-icon" icon="mdi:bell-ring-outline"></ha-icon>`,
    onClick: canAct ? () => params.onRunAction("find_remote") : void 0
  })}
            ${renderSettingTile({
    title: TOOLS_CARD_STRINGS.settings.syncRemoteTitle,
    description: TOOLS_CARD_STRINGS.settings.syncRemoteDescription,
    classes: `action${canAct ? "" : " disabled"}`,
    control: b2`<ha-icon class="setting-icon" icon="mdi:sync"></ha-icon>`,
    onClick: canAct ? () => params.onRunAction("sync_remote") : void 0
  })}
          </div>
        </div>
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/cache-tab.ts
function badge(type, value) {
  return b2`<span class="id-badge"><span>${type}:</span><span>${String(value)}</span></span>`;
}
function renderCacheTab(params) {
  if (params.loading) return b2`<div class="cache-state">${TOOLS_CARD_STRINGS.cache.loading}</div>`;
  if (params.error) return b2`<div class="cache-state error">${params.error}</div>`;
  if (!params.persistentCacheEnabled) {
    return b2`
      <div class="cache-state cache-enable-state">
        <div class="cache-enable-icon"><ha-icon icon="mdi:database-cog-outline"></ha-icon></div>
        <div class="cache-state-title">${TOOLS_CARD_STRINGS.cache.persistentCacheOffTitle}</div>
        <div class="cache-state-sub">${TOOLS_CARD_STRINGS.cache.persistentCacheOffCopy}</div>
        <button
          class="cache-enable-btn"
          ?disabled=${params.enablingPersistentCache || params.hubCommandBusy}
          @click=${params.onEnablePersistentCache}
        >
          <ha-icon icon="mdi:database-check-outline"></ha-icon>
          <span>${params.enablingPersistentCache ? TOOLS_CARD_STRINGS.cache.enablingPersistentCache : TOOLS_CARD_STRINGS.cache.enablePersistentCache}</span>
        </button>
      </div>
    `;
  }
  if (!params.hub) return b2`<div class="cache-state">${TOOLS_CARD_STRINGS.cache.noHubsFound}</div>`;
  const renderActivity = (activity) => {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const reorder = params.reorderMode;
    const isOpen = !reorder && params.openEntity === key;
    const locked2 = params.hubCommandBusy || params.selectedHubProxyConnected || reorder;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const favorites = activityFavorites(params.hub, id);
    const macros = activityMacros(params.hub, id);
    const buttons = activityButtons(params.hub, id);
    return b2`
      <div class="entity-block${isOpen ? " open" : ""}${reorder ? " entity-block--reorder" : ""}" id=${`entity-${key}`} data-activity-id=${id}>
        <div class="entity-summary" @click=${reorder ? null : () => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-icon">
              <ha-icon icon=${reorder ? "mdi:drag-vertical-variant" : "mdi:play-circle-outline"}></ha-icon>
            </span>
            <span class="entity-name-copy">
              <span class="entity-name-label">${activity.name || TOOLS_CARD_STRINGS.cache.activityFallback(id)}</span>
              <span class="entity-count entity-count--activity">${TOOLS_CARD_STRINGS.cache.activityCounts(favorites.length, macros.length, buttons.length)}</span>
            </span>
          </span>
          <span class="entity-meta">
            ${badge(TOOLS_CARD_STRINGS.cache.devIdBadge, id)}
            <button class="icon-btn" title=${TOOLS_CARD_STRINGS.cache.editActivity} ?disabled=${locked2} @click=${(event) => {
      event.stopPropagation();
      params.onEditActivity(id);
    }}><ha-icon icon="mdi:wrench"></ha-icon></button>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked2} @click=${(event) => {
      event.stopPropagation();
      params.onRefreshEntry("activity", id, key);
    }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            ${reorder ? null : b2`<span class="entity-chevron">▼</span>`}
          </span>
        </div>
        ${isOpen ? b2`<div class="entity-body">
          ${favorites.length ? b2`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.favorites}</div>${favorites.map((favorite) => b2`<div class="inner-row"><span class="inner-label">${favorite.label || TOOLS_CARD_STRINGS.cache.favoriteFallback(favorite.command_id)}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.favIdBadge, favorite.button_id)}${badge(TOOLS_CARD_STRINGS.cache.devIdBadge, favorite.device_id)}${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, favorite.command_id)}</span></div>`)}` : null}
          ${macros.length ? b2`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.macros}</div>${macros.map((macro) => b2`<div class="inner-row"><span class="inner-label">${macro.label || macro.name || TOOLS_CARD_STRINGS.cache.macroFallback(macro.command_id)}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.favIdBadge, macro.command_id)}${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, macro.command_id)}</span></div>`)}` : null}
          ${buttons.length ? b2`<div class="inner-section-label">${TOOLS_CARD_STRINGS.cache.buttons}</div><div class="buttons-grid">${[buttons.slice(0, Math.ceil(buttons.length / 2)), buttons.slice(Math.ceil(buttons.length / 2))].map((column) => b2`<div class="buttons-col">${column.map((buttonId) => b2`<div class="inner-row"><span class="inner-label">${buttonName(buttonId)}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, buttonId)}</span></div>`)}</div>`)}</div>` : null}
          ${!favorites.length && !macros.length && !buttons.length ? b2`<div class="inner-empty">${TOOLS_CARD_STRINGS.cache.noCachedData}</div>` : null}
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
    return b2`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">
            <span class="entity-name-icon"><ha-icon icon=${icon}></ha-icon></span>
            <span class="entity-name-copy">
              <span class="entity-name-label">${device.name || TOOLS_CARD_STRINGS.cache.deviceFallback(id)}</span>
              <span class="entity-count">${TOOLS_CARD_STRINGS.cache.deviceCommandCount(Number(device.command_count || 0))}</span>
            </span>
          </span>
          <span class="entity-meta">
            ${badge(TOOLS_CARD_STRINGS.cache.devIdBadge, id)}
            <button class="icon-btn" title=${TOOLS_CARD_STRINGS.cache.editDevice} ?disabled=${locked2} @click=${(event) => {
      event.stopPropagation();
      params.onEditDevice(id);
    }}><ha-icon icon="mdi:wrench"></ha-icon></button>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked2} @click=${(event) => {
      event.stopPropagation();
      params.onRefreshEntry("device", id, key);
    }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? b2`<div class="entity-body">${commands.length ? commands.map((command) => b2`<div class="inner-row"><span class="inner-label">${command.label}</span><span class="inner-badges">${badge(TOOLS_CARD_STRINGS.cache.comIdBadge, command.id)}</span></div>`) : b2`<div class="inner-empty">${TOOLS_CARD_STRINGS.cache.noCachedCommands}</div>`}</div>` : null}
      </div>
    `;
  };
  const activities = hubActivities(params.hub);
  const devices = hubDevices(params.hub);
  const selectedSection = params.selectedSection;
  const locked = params.hubCommandBusy || params.selectedHubProxyConnected || params.reorderMode;
  const S5 = TOOLS_CARD_STRINGS.cache;
  const orderedActivities = params.reorderMode ? [
    ...params.reorderIds.map((id) => activities.find((activity) => Number(activity.id) === Number(id))).filter((activity) => !!activity),
    ...activities.filter((activity) => !params.reorderIds.includes(Number(activity.id)))
  ] : activities;
  const containSortableEvent = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const handleSortableMove = (event) => {
    containSortableEvent(event);
    const detail = event.detail;
    const oldIndex = Number(detail?.oldIndex);
    const newIndex = Number(detail?.newIndex);
    if (!Number.isInteger(oldIndex) || !Number.isInteger(newIndex) || oldIndex === newIndex) return;
    params.onReorderMove(oldIndex, newIndex);
  };
  const activityRows = orderedActivities.map(renderActivity);
  const activitiesList = params.reorderMode ? b2`
        <ha-sortable
          class="cache-reorder-sortable"
          draggable-selector=".entity-block"
          animation="180"
          @item-moved=${handleSortableMove}
          @item-added=${containSortableEvent}
          @item-removed=${containSortableEvent}
          @drag-start=${containSortableEvent}
          @drag-end=${containSortableEvent}
        >
          <div class="cache-reorder-list">${activityRows}</div>
        </ha-sortable>
      ` : activityRows;
  const activitiesFooter = b2`
    <div class="cache-list-footer">
      ${params.reorderMode ? b2`
            <div class="cache-reorder-hint">${S5.reorderHint}</div>
            ${params.reorderError ? b2`<div class="cache-footer-error">${params.reorderError}</div>` : null}
            <div class="cache-footer-actions">
              <button
                class="cache-footer-btn cache-footer-btn--primary"
                ?disabled=${params.reorderSyncing}
                @click=${params.onSyncReorder}
              >
                <ha-icon icon="mdi:upload-outline"></ha-icon>
                <span>${params.reorderSyncing ? S5.reorderSyncing : S5.reorderSync}</span>
              </button>
              <button
                class="cache-footer-btn"
                ?disabled=${params.reorderSyncing}
                @click=${params.onCancelReorder}
              >${S5.reorderCancel}</button>
            </div>
          ` : b2`
            <div class="cache-footer-actions">
              <button
                class="cache-footer-btn"
                ?disabled=${locked || activities.length < 2}
                @click=${params.onStartReorder}
              >
                <ha-icon icon="mdi:swap-vertical"></ha-icon>
                <span>${S5.changeOrder}</span>
              </button>
              <button
                class="cache-footer-btn"
                ?disabled=${locked}
                @click=${params.onOpenAddActivity}
              >
                <ha-icon icon="mdi:plus"></ha-icon>
                <span>${S5.addActivity}</span>
              </button>
            </div>
          `}
    </div>
  `;
  const activeBody = selectedSection === "activities" ? b2`${activitiesList}${activitiesFooter}` : devices.map(renderDevice);
  const confirmAddActivity = (event) => {
    const dialog = event.currentTarget.closest(".cache-dialog");
    const input = dialog?.querySelector(".cache-dialog-input");
    const name = String(input?.value || "").trim();
    if (name) params.onConfirmAddActivity(name);
  };
  const addActivityDialog = params.addActivityOpen ? b2`
        <div class="cache-modal-backdrop" @click=${params.addActivityBusy ? null : params.onCloseAddActivity}>
          <div class="cache-dialog" @click=${(event) => event.stopPropagation()}>
            <div class="cache-dialog-title">${S5.addActivityTitle}</div>
            <div class="cache-dialog-text">${S5.addActivityBody}</div>
            ${params.addActivityError ? b2`<div class="cache-footer-error">${params.addActivityError}</div>` : null}
            <input
              class="cache-dialog-input"
              type="text"
              maxlength="30"
              placeholder=${S5.addActivityPlaceholder}
              ?disabled=${params.addActivityBusy}
              @keydown=${(event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    confirmAddActivity(event);
  }}
            />
            <div class="cache-dialog-actions">
              <button
                class="cache-footer-btn"
                ?disabled=${params.addActivityBusy}
                @click=${params.onCloseAddActivity}
              >${S5.addActivityCancel}</button>
              <button
                class="cache-footer-btn cache-footer-btn--primary"
                ?disabled=${params.addActivityBusy}
                @click=${confirmAddActivity}
              >${params.addActivityBusy ? S5.addActivityCreating : S5.addActivityConfirm}</button>
            </div>
          </div>
        </div>
      ` : null;
  return b2`
    <div class="tab-panel">
      ${params.staleData ? b2`<div class="stale-banner"><span class="stale-banner-text">${TOOLS_CARD_STRINGS.cache.staleBanner}</span><button class="stale-banner-btn" @click=${params.onRefreshStale}>${TOOLS_CARD_STRINGS.cache.refresh}</button></div>` : null}
      ${renderSecondaryTabShell({
    connected: true,
    shellClassName: "cache-panel secondary-view-shell--edge",
    items: [
      { id: "activities", label: TOOLS_CARD_STRINGS.cache.activities, icon: "mdi:play-circle-outline", count: activities.length },
      { id: "devices", label: TOOLS_CARD_STRINGS.cache.devices, icon: "mdi:audio-video", count: devices.length }
    ],
    selectedId: selectedSection,
    onSelect: params.onSelectSection,
    content: renderSecondaryPanel({
      connected: true,
      header: b2`
          <div class="secondary-panel-header secondary-panel-header--plain cache-panel-header">
            <span class="flex-spacer"></span>
            <span class="refresh-action">
              <span
                class="refresh-list-label refresh-list-label--clickable"
                role="button"
                tabindex=${locked ? -1 : 0}
                aria-disabled=${String(locked)}
                @click=${locked ? null : params.onRefreshAll}
                @keydown=${locked ? null : (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          params.onRefreshAll();
        }
      }}
              >${TOOLS_CARD_STRINGS.cache.refreshAll}</span>
              <button class="icon-btn${params.refreshAllSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${params.onRefreshAll}>
                <ha-icon icon="mdi:refresh"></ha-icon>
              </button>
            </span>
            <span class="refresh-action">
              <span
                class="refresh-list-label refresh-list-label--clickable"
                role="button"
                tabindex=${locked ? -1 : 0}
                aria-disabled=${String(locked)}
                @click=${locked ? null : () => params.onRefreshSection(selectedSection)}
                @keydown=${locked ? null : (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          params.onRefreshSection(selectedSection);
        }
      }}
              >${TOOLS_CARD_STRINGS.cache.refreshList}</span>
              <button class="icon-btn${params.refreshBusy && !params.activeRefreshLabel ? " spinning" : ""}" ?disabled=${locked} @click=${() => params.onRefreshSection(selectedSection)}>
                <ha-icon icon="mdi:refresh"></ha-icon>
              </button>
            </span>
          </div>
          `,
      bodyClassName: "cache-panel-body",
      body: activeBody
    })
  })}
      ${addActivityDialog}
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/components/log-console.ts
function renderLogConsole(params) {
  const body = params.loading && !params.lines.length ? b2`<div class="logs-empty">${TOOLS_CARD_STRINGS.logs.loading}</div>` : params.error && !params.lines.length ? b2`<div class="logs-empty error">${params.error}</div>` : !params.lines.length ? b2`<div class="logs-empty">${TOOLS_CARD_STRINGS.logs.empty}</div>` : params.lines.map((line) => {
    const formatted = formatLogEntry(line);
    return b2`
                <div class="log-line" title=${`${formatted.prefix} ${formatted.lineText}`.trim()}><span class="log-line-level log-line-level--${formatted.level}">${formatted.prefix}</span> <span class="log-line-msg">${formatted.lineText}</span></div>
              `;
  });
  return b2`
    <div class="tab-panel logs-panel">
      ${renderSecondaryTabShell({
    items: [{ id: "logs", label: TOOLS_CARD_STRINGS.logs.liveConsole, icon: "mdi:console-line", passive: true }],
    selectedId: "logs",
    connected: true,
    shellClassName: "secondary-view-shell--edge",
    content: renderSecondaryViewBody({
      connected: true,
      className: "logs-console-wrap",
      content: b2`<div class="logs-console" id="logs-console">${body}</div>`
    })
  })}
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/logs-tab.ts
function renderLogsTab(params) {
  return renderLogConsole({
    lines: params.lines,
    loading: params.loading,
    error: params.error
  });
}

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
  return b2`
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
  return b2`
    <div class="quick-access-sortable-item quick-access-footer-item">
      <button class="edit-selection-row edit-selection-row--footer" @click=${params.onOpen}>
        <ha-icon class="footer-row-icon" icon="mdi:tune-variant"></ha-icon>
        <span class="selection-main">
          <span class="selection-label">${params.label}</span>
          ${params.meta ? b2`<span class="selection-sub">${params.meta}</span>` : A}
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
  return b2`
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
  return b2`
    <div class="quick-access-sortable-item">
      <div class="role-row">
        <ha-icon class="role-icon" icon=${ROLE_ICONS[role.group]}></ha-icon>
      <div class="role-main">
        <div class="role-label">${ROLE_LABELS[role.group]}</div>
        ${partialNote ? b2`<div class="role-note">${partialNote}</div>` : A}
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
        ${open ? b2`
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
                ${params.optionsFor(role.group).map((option) => b2`
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

// custom_components/sofabaton_x1s/www/src/shared/ha-context.ts
var BACKUP_BUNDLE_SCHEMA_VERSION = 5;

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
var HUB_VERSION_RANK = {
  X1: 1,
  X1S: 2,
  X2: 3
};
var INTERNAL_POWER_MACRO_BUTTON_IDS = /* @__PURE__ */ new Set([198, 199]);
function backupDeviceOptions(hub) {
  return hubDevices(hub).map((device) => ({
    id: Number(device.id),
    label: String(device.name || `Device ${device.id}`),
    meta: String(device.device_class || "").trim() || void 0
  }));
}
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
var ACTIVITY_ENTITY_ID_MIN = 101;
function activityChainDependencyIds(bundle, activityId) {
  const activity = (bundle?.activities ?? []).find(
    (entry) => Number(entry?.device?.device_id || 0) === Number(activityId)
  );
  if (!bundle || !activity) return [];
  const selfId = Number(activity?.device?.device_id || 0);
  const bundleActivityIds = new Set(
    (bundle.activities ?? []).map((entry) => Number(entry?.device?.device_id || 0))
  );
  const refs = /* @__PURE__ */ new Set();
  const add = (value) => {
    const id = Number(value || 0);
    if (id >= ACTIVITY_ENTITY_ID_MIN && id !== 255 && id !== selfId && bundleActivityIds.has(id)) refs.add(id);
  };
  for (const binding of activity.button_bindings ?? []) {
    add(binding?.device_id);
    add(binding?.long_press_device_id);
  }
  for (const macro of activity.macros ?? []) {
    for (const step of macro?.steps ?? []) {
      if (Number(step?.device_id || 0) === 255) continue;
      add(step?.device_id);
    }
  }
  for (const slot of activity.favorite_slots ?? []) add(slot?.device_id);
  return [...refs].sort((left, right) => left - right);
}
function forcedRestoreActivityIds(bundle, selectedActivityIds) {
  const selected = new Set(selectedActivityIds.map((value) => Number(value)));
  const reached = new Set(selected);
  const queue = [...reached];
  while (queue.length) {
    const current = queue.pop();
    for (const dep of activityChainDependencyIds(bundle, current)) {
      if (!reached.has(dep)) {
        reached.add(dep);
        queue.push(dep);
      }
    }
  }
  return [...reached].filter((id) => !selected.has(id)).sort((left, right) => left - right);
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
  const forcedActivityIds = forcedRestoreActivityIds(params.bundle, params.selectedActivityIds);
  const selectedActivityIds = [
    .../* @__PURE__ */ new Set([
      ...(params.selectedActivityIds ?? []).map((value) => Number(value)),
      ...forcedActivityIds
    ])
  ].sort((left, right) => left - right);
  const forcedDeviceIds = forcedRestoreDeviceIds(params.bundle, selectedActivityIds);
  const selected = new Set(forcedDeviceIds);
  for (const deviceId of params.manualSelectedDeviceIds ?? []) {
    const normalized = Number(deviceId);
    if (normalized > 0) selected.add(normalized);
  }
  return {
    forcedDeviceIds,
    selectedDeviceIds: [...selected].sort((left, right) => left - right),
    selectedActivityIds,
    forcedActivityIds
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
  const profile = String(bundle.payload_profile || "full_backup");
  if (profile !== "full_backup") {
    throw new Error(
      "This file is a structural cache bundle (no command payloads); it cannot be edited or restored. Export a full backup instead."
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
function reorderBundleActivities(bundle, orderedActivityIds) {
  return reorderBundleTopLevelEntries(bundle, "activities", orderedActivityIds);
}
function reorderBundleDevices(bundle, orderedDeviceIds) {
  return reorderBundleTopLevelEntries(bundle, "devices", orderedDeviceIds);
}
function reorderBundleTopLevelEntries(bundle, key, orderedIds) {
  const entries = bundle[key] ?? [];
  const newSortById = /* @__PURE__ */ new Map();
  orderedIds.forEach((id, index) => {
    const normalized = Number(id);
    if (normalized > 0) newSortById.set(normalized, index + 1);
  });
  const nextEntries = entries.map((entry) => {
    const block = entry?.device;
    if (!block) return entry;
    const entryId = Number(block.device_id || 0);
    const nextSort = newSortById.get(entryId);
    if (nextSort === void 0) return entry;
    return { ...entry, device: { ...block, sort: nextSort } };
  });
  return { ...bundle, [key]: nextEntries };
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
    const reordered = orderedIndices.map((i7) => groups[Number(i7)]).filter((group) => Boolean(group));
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
    const reordered = orderedIndices.map((i7) => groups[Number(i7)]).filter((group) => Boolean(group));
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
function buttonName2(code) {
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
      buttonName: buttonName2(buttonId),
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
      buttonName: buttonName2(buttonId),
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
    button_name: buttonName2(buttonId),
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
    button_name: buttonName2(buttonId),
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
          button_name: buttonName2(buttonId),
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
var SofabatonEditDetailView = class extends i4 {
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
      this._bindingActionName || (this._bindingActionName = this._macroName(this._bindingCommandId));
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
      this._bindingLpActionName || (this._bindingLpActionName = this._macroName(this._bindingLpCommandId));
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
    return b2`<span class="edit-unsaved-chip" title="You have unsaved changes. Download the backup to save them.">Unsaved</span>`;
  }
  _renderLiveSyncButton() {
    const S5 = TOOLS_CARD_STRINGS.activities;
    const dirty = this.dirty;
    const label = dirty ? S5.syncToHub : S5.syncUpToDate;
    const classes = `detail-sync-btn${dirty ? " sync-btn-primary" : " detail-sync-btn--state-ok"}`;
    return b2`<button class=${classes} ?disabled=${!dirty} @click=${dirty ? this._requestSync : null}>${label}</button>`;
  }
  // Rename (pencil) + delete (trash) header buttons — shared by live and
  // backup mode so both editors expose the identical affordance. In live
  // mode rename rides the normal Sync (a bundle mutation → dirty → Sync);
  // delete executes immediately on the hub through the host (see
  // _confirmDelete).
  _renderDetailRenameDeleteButtons(kind) {
    return b2`
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
    const deviceCommands2 = params.kind === "device" && this.entityId != null ? deviceCommandItems(this.bundle, this.entityId) : [];
    return b2`
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
            ${params.kind === "activity" ? b2`
                  ${this._renderPowerSetupSection("activity", Number(this.entityId))}
                  ${this._renderButtonBindingsSection("activity")}
                  ${this._renderActivityQuickAccessSection(activityQuickAccess)}
                ` : b2`
                  ${this._renderPowerSetupSection("device", Number(this.entityId))}
                  ${this._renderDeviceNetworkSection()}
                  ${this._renderDeviceCommandsSection(deviceCommands2)}
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
    return b2`
      <div class="detail-section-nav" role="tablist" aria-label="Detail sections">
        ${items.map((item) => b2`
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
      return b2`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.buttonBindingsEmpty}</div>`;
    }
    return b2`
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
    return b2`
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    const isActivity = kind === "activity";
    return b2`
      <div class="quick-access-section" data-edit-section="bindings">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">
              ${isActivity ? S5.activityRunningTitle : S5.buttonBindingsTitle}
            </div>
            <div class="quick-access-sub">
              ${isActivity ? S5.activityRunningSub : S5.buttonBindingsDeviceSub}
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    return b2`
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
                  <div class="detail-title">${S5.bindingsViewTitle}</div>
                </div>
                ${this._renderDirtyChip()}
              </div>
            </div>
          </div>
          <div class="detail-scroll">
            <div class="quick-access-section">
              <div class="quick-access-head">
                <div class="quick-access-head-main">
                  <div class="quick-access-title">${S5.buttonBindingsTitle}</div>
                  <div class="quick-access-sub">${S5.buttonBindingsActivitySub}</div>
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
    const S5 = TOOLS_CARD_STRINGS.backup;
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
        label: S5.customizeButtonsToggle,
        meta: bindingCount > 0 ? S5.bindingsConfiguredCount(bindingCount) : S5.bindingsNoneConfigured,
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    return b2`
      <div class="modal-backdrop" @click=${this._closeRoleConfirm}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S5.roleConfirmTitle}</div>
            <button class="dialog-close" @click=${this._closeRoleConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="backup-drawer-sub">${S5.roleConfirmBody}</div>
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note"></div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeRoleConfirm}>${S5.roleConfirmCancel}</button>
              <button class="dialog-btn dialog-btn-danger" @click=${this._confirmRoleAssign}>${S5.roleConfirmReplace}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _renderButtonBindingRow(item, kind) {
    return b2`
      <div class="quick-access-sortable-item" data-kind="binding" data-button-id=${item.buttonId}>
        <div class="quick-access-row quick-access-row--no-drag">
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.buttonName}</div>
              <div class="quick-access-chip">button</div>
            </div>
            <div class="quick-access-meta">${item.shortPressLabel}</div>
            ${item.longPress ? b2`<div class="quick-access-meta">${TOOLS_CARD_STRINGS.backup.bindingLongPressMeta(item.longPress.label)}</div>` : A}
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
    return b2`
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
    return b2`
      <div class="quick-access-section" data-edit-section="commands">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">Commands</div>
            <div class="quick-access-sub">
              ${this.mode === "live" ? "Use the pencil to rename a command and the braces to fetch its payload from the hub and edit it. Deleting commands stays in Backup \u2192 Edit." : "Use the pencil to rename a command (names update everywhere it is referenced) and the braces to edit its payload."}
            </div>
          </div>
          ${this.mode === "live" ? b2`
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
        ${this._payloadFetchError ? b2`
              <div class="section-status error" role="alert">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${this._payloadFetchError}</span>
              </div>
            ` : A}
        ${items.length ? b2`
              <div class="quick-access-list">
                <div class="quick-access-sortable-container">
                  ${items.map((item) => this._renderDeviceCommandRow(item))}
                </div>
              </div>
            ` : b2`<div class="quick-access-empty">This Device does not currently have any commands.</div>`}
      </div>
    `;
  }
  _renderDeviceCommandRow(item) {
    const pendingAdd = this._commandIsPendingAdd(item.commandId);
    return b2`
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
            ${this.mode !== "live" && this._commandHasEditablePayload(item.commandId) ? b2`
                  <button
                    class="icon-btn"
                    @click=${() => this._openCommandPayloadDialog(item.commandId)}
                    aria-label="Edit payload"
                    title="Edit payload"
                  >
                    <ha-icon icon="mdi:code-braces"></ha-icon>
                  </button>
                ` : A}
            ${this.mode === "live" && !pendingAdd ? b2`
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
            ${this.mode === "live" ? A : b2`
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
    return b2`
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
        ${items.length ? b2`
              <div class="quick-access-list">
                ${this._haSortableReady ? b2`
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
            ` : b2`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.activityShortcutsEmpty}</div>`}
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
    return b2`
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
            ${this._haSortableReady ? A : b2`
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
            ${item.kind === "macro" ? b2`
                  <button
                    class="icon-btn"
                    @click=${() => this._openMacroEditor("activity", Number(this.entityId), item.buttonId, item.label)}
                    aria-label=${TOOLS_CARD_STRINGS.backup.editStepsAria}
                  >
                    <ha-icon icon="mdi:playlist-edit"></ha-icon>
                  </button>
                ` : A}
            ${this.mode === "live" && item.kind === "favorite" ? A : b2`
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
    return b2`
      <div class="modal-backdrop" @click=${this._closeEditRenameDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${label}</div>
            <button class="dialog-close" @click=${this._closeEditRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${useLegacyTextField() ? b2`
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
                ` : b2`
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
    return b2`
      <div class="modal-backdrop" @click=${this._closeCommandPayloadDialog}>
        <div class="dialog medium" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title-group">
              <div class="dialog-title">${this._payloadDialogAddMode ? "Add Command" : "Edit Payload"}</div>
              ${deviceClass ? b2`<span class="payload-class-badge" title="Device class">${deviceClass}</span>` : A}
            </div>
            <button class="dialog-close" @click=${this._closeCommandPayloadDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._payloadDialogAddMode ? b2`
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
            ${this._liveDeviceIsIr() ? b2`
                  <div class="payload-test-note">
                    <ha-icon icon="mdi:flash-outline"></ha-icon>
                    <span>
                      ${this.mode === "live" ? b2`Verify a changed payload before saving: <strong>Test</strong> plays the current bytes on the hub without saving. Save folds the payload into the device's next Sync.` : b2`Verify a changed payload before trusting it: <strong>Test</strong> plays the bytes on the hub without saving. Save here only once the payload does what you expect.`}
                    </span>
                  </div>
                ` : A}
            ${this._payloadDialogTestStatus !== "idle" ? b2`
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
              ${this.mode === "live" && this._liveDeviceIsIr() && this.testCommandPayload ? b2`
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
    return b2`
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
    return b2`
      <div class="decoded-form">
        <div class="decoded-form-head">
          <div class="decoded-form-title">${spec.title}</div>
          ${spec.subtitle ? b2`<div class="decoded-form-sub">${spec.subtitle}</div>` : A}
        </div>
        ${spec.fields.map((field) => this._renderDecodedField(field))}
      </div>
    `;
  }
  _renderDecodedField(field) {
    const value = this._payloadDialogDecodedDrafts[field.key] ?? "";
    const onInput = (event) => this._handleDecodedFieldInput(event, field.key);
    const multilineClass = field.escapedDisplay ? "decoded-field-input--multiline decoded-field-input--escaped" : "decoded-field-input--multiline";
    return b2`
      <label class="decoded-field">
        <span class="decoded-field-label">${field.label}</span>
        ${field.multiline ? b2`
              <textarea
                class="decoded-field-input ${multilineClass}"
                rows="4"
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              ></textarea>
            ` : b2`
              <input
                class="decoded-field-input"
                type=${field.numeric ? "number" : "text"}
                spellcheck="false"
                .value=${value}
                @input=${onInput}
                @change=${onInput}
              />
            `}
        ${field.helper ? b2`<span class="decoded-field-helper">${field.helper}</span>` : A}
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    const isLive = this.mode === "live";
    const isImmediate = isLive && (target.kind === "activity" || target.kind === "device");
    const intro = isLive ? hasCascade ? S5.deleteCascadeIntroLive : S5.deleteSimpleBodyLive : hasCascade ? S5.deleteCascadeIntro : S5.deleteSimpleBody;
    const note = isLive ? isImmediate ? S5.deleteImmediateNote : S5.deleteSyncNote : S5.deleteReplaceNote;
    return b2`
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
            ${hasCascade ? b2`
                  <ul class="delete-impact-list">
                    ${impact.activities > 0 ? b2`<li><ha-icon icon="mdi:link-variant"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactActivities(impact.activities)}</span></li>` : A}
                    ${impact.favorites > 0 ? b2`<li><ha-icon icon="mdi:star-outline"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactFavorites(impact.favorites)}</span></li>` : A}
                    ${impact.macroSteps > 0 ? b2`<li><ha-icon icon="mdi:format-list-numbered"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactMacroSteps(impact.macroSteps)}</span></li>` : A}
                    ${impact.powerSteps > 0 ? b2`<li><ha-icon icon="mdi:power"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactPowerSteps(impact.powerSteps)}</span></li>` : A}
                    ${impact.bindings > 0 ? b2`<li><ha-icon icon="mdi:gesture-tap-button"></ha-icon><span>${TOOLS_CARD_STRINGS.backup.deleteImpactBindings(impact.bindings)}</span></li>` : A}
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    const kind = this._addShortcutKind;
    const devices = bundleEditableDeviceOptions(this.bundle);
    const macros = this._macroOptions();
    const commands = this._addFavoriteDeviceId != null ? deviceCommandItems(this.bundle, this._addFavoriteDeviceId) : [];
    const canAdd = kind !== "command" || this._addFavoriteDeviceId != null && this._addFavoriteCommandId != null;
    const commandFields = devices.length === 0 ? b2`<div class="backup-drawer-sub">${S5.addFavoriteNoDevices}</div>` : b2`
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-device">${S5.addFavoriteDevice}</label>
            <select id="sb-add-fav-device" class="decoded-field-input" @change=${this._handleAddFavoriteDeviceChange}>
              ${devices.map((device) => b2`
                <option value=${device.id} ?selected=${device.id === this._addFavoriteDeviceId}>${device.label}</option>
              `)}
            </select>
          </div>
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-command">${S5.addFavoriteCommand}</label>
            ${commands.length === 0 ? b2`<div class="quick-access-empty">${S5.addFavoriteNoCommands}</div>` : b2`
                  <select id="sb-add-fav-command" class="decoded-field-input" @change=${this._handleAddFavoriteCommandChange}>
                    ${commands.map((command) => b2`
                      <option value=${command.commandId} ?selected=${command.commandId === this._addFavoriteCommandId}>${command.label}</option>
                    `)}
                  </select>
                `}
          </div>
          <div class="decoded-field">
            <label class="decoded-field-label" for="sb-add-fav-name">${S5.addFavoriteName}</label>
            <input
              id="sb-add-fav-name"
              class="decoded-field-input"
              maxlength="20"
              .value=${this._addFavoriteName}
              @input=${this._handleAddFavoriteNameInput}
            />
          </div>
        `;
    const actionFields = b2`
      <div class="decoded-field">
        <label class="decoded-field-label" for="sb-add-action-name">${S5.addShortcutActionName}</label>
        <input
          id="sb-add-action-name"
          class="decoded-field-input"
          maxlength="20"
          .value=${this._addShortcutActionName}
          @input=${(event) => {
      this._addShortcutActionName = event.target.value;
    }}
        />
        <div class="decoded-field-helper">${S5.addShortcutActionHelper}</div>
      </div>
    `;
    const macroFields = b2`
      ${macros.length ? b2`
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-add-macro-target">${S5.macroTargetLabel}</label>
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
                ${macros.map((macro) => b2`
                  <option value=${macro.value} ?selected=${this._addShortcutMacroMode === "existing" && macro.value === this._addShortcutMacroId}>${macro.label}</option>
                `)}
                <option value="__new__" ?selected=${this._addShortcutMacroMode === "new"}>${S5.macroTargetCreateNew}</option>
              </select>
            </div>
          ` : b2`<div class="quick-access-empty">${S5.macroTargetNoExisting}</div>`}
      ${this._addShortcutMacroMode === "new" ? actionFields : A}
    `;
    return b2`
      <div class="modal-backdrop" @click=${this._closeAddFavoriteDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S5.addShortcutTitle}</div>
            <button class="dialog-close" @click=${this._closeAddFavoriteDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="decoded-field">
              <label class="decoded-field-label" for="sb-add-shortcut-kind">${S5.addShortcutKindLabel}</label>
              <select
                id="sb-add-shortcut-kind"
                class="decoded-field-input"
                @change=${(event) => {
      this._addShortcutKind = event.target.value;
      if (this._addShortcutKind === "action") this._resetMacroTarget("shortcut");
      this._addFavoriteError = "";
    }}
              >
                <option value="command" ?selected=${kind === "command"}>${S5.shortcutKindCommand}</option>
                <option value="action" ?selected=${kind === "action"}>${S5.shortcutKindAction}</option>
              </select>
            </div>
            ${kind === "command" ? commandFields : macroFields}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._addFavoriteError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeAddFavoriteDialog}>${S5.addFavoriteCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyAddShortcut} ?disabled=${!canAdd}>${S5.addFavoriteAdd}</button>
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
    return b2`
      <div class="detail-crumbs">
        ${crumbs.map((crumb, index) => b2`
          ${index > 0 ? b2`<span class="detail-crumb-sep" aria-hidden="true">›</span>` : A}
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
    return b2`
      <div class="decoded-field">
        <label class="decoded-field-label" for=${params.id}>${params.label}</label>
        ${params.options.length === 0 ? b2`<div class="quick-access-empty">${params.emptyText ?? ""}</div>` : b2`
              <select id=${params.id} class="decoded-field-input" @change=${params.onChange}>
                ${params.options.map((option) => b2`
                  <option value=${option.value} ?selected=${option.value === params.value}>${option.label}</option>
                `)}
              </select>
            `}
      </div>
    `;
  }
  _renderMacroTargetFields(params) {
    const S5 = TOOLS_CARD_STRINGS.backup;
    const macros = this._macroOptions();
    return b2`
      ${macros.length ? b2`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-macro-target`}>${S5.macroTargetLabel}</label>
              <select
                id=${`${params.idPrefix}-macro-target`}
                class="decoded-field-input"
                @change=${params.onMacroChange}
              >
                ${macros.map((macro) => b2`
                  <option value=${macro.value} ?selected=${params.mode === "existing" && macro.value === params.macroId}>${macro.label}</option>
                `)}
                <option value="__new__" ?selected=${params.mode === "new"}>${S5.macroTargetCreateNew}</option>
              </select>
            </div>
          ` : b2`<div class="quick-access-empty">${S5.macroTargetNoExisting}</div>`}
      ${params.mode === "new" ? b2`
            <div class="decoded-field">
              <label class="decoded-field-label" for=${`${params.idPrefix}-macro-name`}>${S5.addShortcutActionName}</label>
              <input
                id=${`${params.idPrefix}-macro-name`}
                class="decoded-field-input"
                maxlength="20"
                .value=${params.name}
                @input=${params.onNameInput}
              />
              <div class="decoded-field-helper">${S5.addShortcutActionHelper}</div>
            </div>
          ` : A}
    `;
  }
  _renderBindingDialog() {
    if (!this._bindingDialogOpen || !this.bundle || this.entityId == null) return A;
    const S5 = TOOLS_CARD_STRINGS.backup;
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
    const title = isEdit ? S5.bindingDialogEditTitle(buttonName2(Number(this._bindingButtonId))) : S5.bindingDialogAddTitle;
    const commandFields = b2`
      ${scope === "activity" ? this._renderBindingSelect({
      id: "sb-binding-device",
      label: S5.bindingTargetDevice,
      value: this._bindingDeviceId,
      options: commandDeviceOptions,
      onChange: this._handleBindingDeviceChange,
      emptyText: S5.bindingNoDevices
    }) : A}
      ${this._renderBindingSelect({
      id: "sb-binding-command",
      label: S5.bindingCommand,
      value: this._bindingCommandId,
      options: commandOptions,
      onChange: this._handleBindingCommandChange,
      emptyText: S5.bindingNoCommands
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
    const lpCommandFields = b2`
      ${scope === "activity" ? this._renderBindingSelect({
      id: "sb-binding-lp-device",
      label: S5.bindingLongPressDevice,
      value: this._bindingLpDeviceId,
      options: commandDeviceOptions,
      onChange: this._handleBindingLpDeviceChange,
      emptyText: S5.bindingNoDevices
    }) : A}
      ${this._renderBindingSelect({
      id: "sb-binding-lp-command",
      label: S5.bindingLongPressCommand,
      value: this._bindingLpCommandId,
      options: lpCommandOptions,
      onChange: this._handleBindingLpCommandChange,
      emptyText: S5.bindingNoCommands
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
    return b2`
      <div class="modal-backdrop" @click=${this._closeBindingDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" @click=${this._closeBindingDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isEdit ? b2`
                  <div class="decoded-field">
                    <span class="decoded-field-label">${S5.bindingButton}</span>
                    <div class="binding-static-field">${buttonName2(Number(this._bindingButtonId))}</div>
                  </div>
                ` : this._renderBindingSelect({
      id: "sb-binding-button",
      label: S5.bindingButton,
      value: this._bindingButtonId,
      options: unbound.map((entry) => ({ value: entry.code, label: entry.name })),
      onChange: this._handleBindingButtonChange,
      emptyText: S5.bindingNoButtons
    })}
            ${isActivity ? b2`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-binding-kind">${S5.addShortcutKindLabel}</label>
                    <select
                      id="sb-binding-kind"
                      class="decoded-field-input"
                      @change=${this._handleBindingTargetKindChange}
                    >
                      <option value="command" ?selected=${targetKind === "command"}>${S5.shortcutKindCommand}</option>
                      <option value="action" ?selected=${targetKind === "action"}>${S5.shortcutKindAction}</option>
                    </select>
                  </div>
                ` : A}
            ${targetKind === "command" ? commandFields : actionFields}
            <div class="binding-toggle-row">
              <span class="decoded-field-label">${S5.bindingEnableLongPress}</span>
              <ha-switch
                .checked=${this._bindingLongPressEnabled}
                @change=${this._handleBindingLongPressToggle}
              ></ha-switch>
            </div>
            ${this._bindingLongPressEnabled ? b2`
                  ${isActivity ? b2`
                        <div class="decoded-field">
                          <label class="decoded-field-label" for="sb-binding-lp-kind">${S5.addShortcutKindLabel}</label>
                          <select
                            id="sb-binding-lp-kind"
                            class="decoded-field-input"
                            @change=${this._handleBindingLpTargetKindChange}
                          >
                            <option value="command" ?selected=${lpTargetKind === "command"}>${S5.shortcutKindCommand}</option>
                            <option value="action" ?selected=${lpTargetKind === "action"}>${S5.shortcutKindAction}</option>
                          </select>
                        </div>
                      ` : A}
                  ${lpTargetKind === "command" ? lpCommandFields : lpActionFields}
                ` : A}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._bindingError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeBindingDialog}>${S5.bindingCancel}</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyBinding} ?disabled=${!canSave}>
                ${isEdit ? S5.bindingSave : S5.bindingAdd}
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
    return b2`
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
                ${canRename ? b2`
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
              ${items.length ? b2`
                    <div class="quick-access-list">
                      ${sortable ? b2`
                            <ha-sortable
                              class="quick-access-sortable"
                              draggable-selector=".quick-access-sortable-item"
                              handle-selector=".quick-access-drag"
                              animation="180"
                              @item-moved=${this._handleStepReorder}
                            >
                              <div class="quick-access-sortable-container">${renderRows()}</div>
                            </ha-sortable>
                          ` : b2`<div class="quick-access-sortable-container">${renderRows()}</div>`}
                    </div>
                  ` : b2`<div class="quick-access-empty">${TOOLS_CARD_STRINGS.backup.noMacroSteps}</div>`}
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
    return b2`
      <div class="quick-access-sortable-item" data-step-index=${item.index}>
        <div class="quick-access-row">
          ${sortable ? b2`<div class="quick-access-drag" aria-hidden="true"><ha-icon icon="mdi:drag-vertical-variant"></ha-icon></div>` : b2`<span></span>`}
          <div class="quick-access-main">
            <div class="quick-access-label-row">
              <div class="quick-access-label">${item.label}</div>
              <div class="quick-access-chip">${chip}</div>
            </div>
            ${meta ? b2`<div class="quick-access-meta">${meta}</div>` : A}
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
            ${isPower ? A : b2`
                  <button class="icon-btn" @click=${() => this._openEditStepDialog(item)} aria-label=${TOOLS_CARD_STRINGS.backup.editStepAria}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                  </button>
                  ${isInput ? A : b2`
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
    return b2`
      <div class="modal-backdrop" @click=${this._closeStepDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${title}</div>
            <button class="dialog-close" @click=${this._closeStepDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${isInput ? b2`
                  <div class="decoded-field">
                    <label class="decoded-field-label" for="sb-step-input">${TOOLS_CARD_STRINGS.backup.inputStepCommand}</label>
                    <select id="sb-step-input" class="decoded-field-input" @change=${this._handleStepCommandChange}>
                      <option value="" ?selected=${this._stepCommandId == null}>${TOOLS_CARD_STRINGS.backup.inputStepNone}</option>
                      ${commands.map((command) => b2`
                        <option value=${command.commandId} ?selected=${command.commandId === this._stepCommandId}>${command.label}</option>
                      `)}
                    </select>
                  </div>
                ` : b2`
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
    return b2`
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    const isDevice = scope === "device";
    const mode = isDevice ? deviceIdleBehavior(this.bundle, entityId) : null;
    const sequencesDisabled = isDevice && mode === IDLE_BEHAVIOR_DISABLED;
    return b2`
      <div class="quick-access-section" data-edit-section="power">
        <div class="quick-access-head">
          <div class="quick-access-head-main">
            <div class="quick-access-title">${S5.powerSetupTitle}</div>
            <div class="quick-access-sub">
              ${isDevice ? S5.powerSetupDeviceSub : S5.powerSetupActivitySub}
            </div>
          </div>
        </div>
        ${isDevice ? this._renderPowerControlDropdown(entityId, mode) : A}
        <div class="quick-access-list">
          ${sequencesDisabled ? b2`<div class="power-sequences-note">${S5.powerSequencesDisabledNote}</div>` : A}
          <div
            class="quick-access-sortable-container power-sequences"
            data-disabled=${sequencesDisabled ? "true" : "false"}
          >
            ${this._renderPowerSetupRow(scope, entityId, 198, S5.powerOnLabel, sequencesDisabled)}
            ${this._renderPowerSetupRow(scope, entityId, 199, S5.powerOffLabel, sequencesDisabled)}
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
    const S5 = TOOLS_CARD_STRINGS.backup;
    return [
      { mode: IDLE_BEHAVIOR_DISABLED, label: S5.powerControlDisabled, sub: S5.powerControlDisabledSub },
      { mode: IDLE_BEHAVIOR_AUTO_OFF, label: S5.powerControlAutoOff, sub: S5.powerControlAutoOffSub },
      { mode: IDLE_BEHAVIOR_STAY_ON, label: S5.powerControlStayOn, sub: S5.powerControlStayOnSub },
      { mode: IDLE_BEHAVIOR_ALWAYS_ON, label: S5.powerControlAlwaysOn, sub: S5.powerControlAlwaysOnSub }
    ];
  }
  _selectPowerControl(deviceId, mode) {
    this._powerControlMenuOpen = false;
    if (!this.bundle) return;
    if (deviceIdleBehavior(this.bundle, deviceId) === mode) return;
    this._commitEditBundleEdit(updateBundleDeviceIdleBehavior(this.bundle, deviceId, mode));
  }
  _renderPowerControlDropdown(deviceId, mode) {
    const S5 = TOOLS_CARD_STRINGS.backup;
    const options = this._powerControlOptions();
    const selected = options.find((opt) => opt.mode === mode) ?? null;
    const open = this._powerControlMenuOpen;
    return b2`
      <div class="power-control" data-open=${open ? "true" : "false"}>
        <button
          class="power-control-trigger"
          type="button"
          aria-haspopup="listbox"
          aria-expanded=${open ? "true" : "false"}
          @click=${this._togglePowerControlMenu}
        >
          <span class="selection-main">
            <span class="selection-label">${selected ? selected.label : S5.powerControlUnset}</span>
            <span class="selection-sub">${selected ? selected.sub : S5.powerControlUnsetSub}</span>
          </span>
          <span class="selection-chevron"><ha-icon icon="mdi:chevron-down"></ha-icon></span>
        </button>
        ${open ? b2`
              <button
                class="power-control-backdrop"
                type="button"
                tabindex="-1"
                aria-hidden="true"
                @click=${this._togglePowerControlMenu}
              ></button>
              <div class="power-control-menu" role="listbox" aria-label=${S5.powerControlTitle}>
                ${options.map((opt) => {
      const isSel = opt.mode === mode;
      return b2`
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
                        ${isSel ? b2`<ha-icon icon="mdi:check"></ha-icon>` : A}
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
SofabatonEditDetailView.properties = {
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
// The whole backup-tab stylesheet ships to both shadow roots (see
// backup-tab-styles.ts); the :host rule it carries gives this element
// the same flex-fill layout the tab-panel had inside backup-tab.
SofabatonEditDetailView.styles = [activityEditorStyles, backupTabStyles, i`
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
if (!customElements.get("sofabaton-edit-detail-view")) {
  customElements.define("sofabaton-edit-detail-view", SofabatonEditDetailView);
}

// custom_components/sofabaton_x1s/www/src/tabs/backup-tab.ts
var BACKUP_SECTION_ITEMS = [
  { id: "make", icon: "mdi:content-save-move-outline", label: "Make" },
  { id: "edit", icon: "mdi:pencil-box-outline", label: "Edit" },
  { id: "restore", icon: "mdi:database-import-outline", label: "Restore" }
];
var _SofabatonBackupTab = class _SofabatonBackupTab extends i4 {
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
    // Op-ids the user has already acknowledged (via Complete, error
    // dismiss, etc.). The sync function skips re-applying terminal
    // status for any op in this set, so subscription events or stale
    // server snapshots cannot snap the view back to a "complete" or
    // "failed" view the user has already moved past. Cleared opportunistically
    // when the op stops appearing in the server snapshot.
    this._acknowledgedOpIds = /* @__PURE__ */ new Set();
    this._editBundle = null;
    this._editFilename = "";
    this._editError = null;
    // Which entity's detail view is open. Everything below the entity
    // list — sections, sub-views, dialogs — lives in the extracted
    // <sofabaton-edit-detail-view> element; this host only tracks the
    // selection (persisted with the edit session).
    this._editDetailKind = null;
    this._editDetailId = null;
    // True when `_editBundle` has user-made changes that have not yet
    // been downloaded. Flipped on by every edit handler (rename, reorder,
    // decoded payload, IP, etc.) and on session restore (those ARE
    // unsaved edits). Flipped off by `_downloadEditedBundle` and by
    // any path that loads a fresh bundle from file. Drives the
    // "Unsaved" indicators in the Edit overview and detail header.
    this._editBundleDirty = false;
    // Hub rename dialog (edit overview) — the entity-level rename
    // machinery moved into the detail element with everything else.
    this._hubRenameOpen = false;
    this._hubRenameDraft = "";
    this._hubRenameError = "";
    this._haSortableReady = Boolean(customElements.get("ha-sortable"));
    this._backupScopeRadioName = `sofabaton-backup-scope-${Math.random().toString(36).slice(2)}`;
    this._editSessionRestoreTried = false;
    // entry_id of the hub the currently-loaded restore bundle was picked
    // against. Used to detect hub-picker switches and drop a bundle that is no
    // longer valid for the now-selected hub.
    this._restoreHubEntryId = null;
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
        this._editBundleDirty = false;
        this._closeEditDetail();
      } catch (error) {
        this._editBundle = null;
        this._editFilename = "";
        this._editBundleDirty = false;
        this._closeEditDetail();
        this._editError = formatError(error);
      } finally {
        if (input) input.value = "";
      }
    };
    this._closeEditDetail = () => {
      this._editDetailKind = null;
      this._editDetailId = null;
    };
    this._handleDetailBundleChange = (event) => {
      this._editBundle = event.detail.bundle;
      this._editBundleDirty = true;
    };
    // ── Hub rename (edit overview) ──────────────────────────────────────
    // The entity/command rename machinery moved into the detail element;
    // the hub name is the one rename that opens from the overview, so it
    // keeps a minimal dialog here with the same look and name rules.
    this._openHubNameRenameDialog = () => {
      if (!this._editBundle) return;
      this._hubRenameDraft = sanitizeBundleName(this._editBundle, String(this._editBundle.hub?.name ?? ""));
      this._hubRenameError = "";
      this._hubRenameOpen = true;
    };
    this._closeHubRenameDialog = () => {
      this._hubRenameOpen = false;
      this._hubRenameDraft = "";
      this._hubRenameError = "";
    };
    this._handleHubRenameInput = (event) => {
      const input = event.currentTarget;
      const value = sanitizeBundleName(this._editBundle, input.value);
      input.value = value;
      this._hubRenameDraft = value;
      this._hubRenameError = "";
    };
    this._applyHubRename = () => {
      if (!this._editBundle) return;
      const next = sanitizeBundleName(this._editBundle, this._hubRenameDraft);
      if (!next) {
        this._hubRenameError = "Enter a name to continue.";
        return;
      }
      this._commitEditBundleEdit(renameBundleHub(this._editBundle, next));
      this._closeHubRenameDialog();
    };
    this._handleEditActivityOrderSort = (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
      this._reorderEditTopLevel(event, "activity");
    };
    this._handleEditDeviceOrderSort = (event) => {
      event.stopPropagation();
      event.stopImmediatePropagation();
      this._reorderEditTopLevel(event, "device");
    };
    this._downloadEditedBundle = async () => {
      if (!this._editBundle || !this.hass || !this.hub) return;
      const base = this._editFilename.replace(/\.json$/i, "") || "sofabaton_backup";
      const filename = `${base}_edited.json`;
      let operationId = "";
      try {
        const result = await this.api().stashEditedBackup(this.hub.entry_id, this._editBundle, filename);
        operationId = String(result?.operation_id || "");
      } catch (error) {
        this._editError = formatError(error);
        return;
      }
      if (!operationId) {
        this._editError = "Failed to prepare edited backup for download.";
        return;
      }
      const path = `/api/sofabaton_x1s/backup/download/${encodeURIComponent(operationId)}`;
      let url = path;
      try {
        const signed = await this.hass.callWS({
          type: "auth/sign_path",
          path,
          expires: 600
        });
        if (signed?.path) url = signed.path;
      } catch (error) {
        console.error("[sofabaton] auth/sign_path failed", error);
        this._editError = formatError(error);
        return;
      }
      const anchor = document.createElement("a");
      anchor.target = "_blank";
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.dispatchEvent(new MouseEvent("click"));
      document.body.removeChild(anchor);
      this._clearEditSession();
      this._editBundleDirty = false;
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
  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
  }
  connectedCallback() {
    super.connectedCallback();
    if (!this._haSortableReady) {
      void customElements.whenDefined("ha-sortable").then(() => {
        this._haSortableReady = true;
      });
    }
  }
  updated(changed) {
    if (changed.has("hub")) {
      void this._syncBackupOperationState();
      this._editSessionRestoreTried = false;
      const nextEntryId = String(this.hub?.entry_id || "").trim() || null;
      if (this._restoreHubEntryId && nextEntryId !== this._restoreHubEntryId) {
        this._resetRestoreBundleForHubSwitch();
      }
      this._restoreHubEntryId = nextEntryId;
    }
    if (changed.has("cacheHub") && this.cacheHub && !this._backupDeviceIds.length) {
      this._backupDeviceIds = backupDeviceOptions(this.cacheHub).map((device) => device.id);
    }
    if (!this._editSessionRestoreTried && this.hub && this.selectedSection === "edit" && !this._editBundle) {
      this._editSessionRestoreTried = true;
      this._restoreEditSession();
    }
    if (changed.has("_editBundle") || changed.has("_editFilename") || changed.has("_editDetailKind") || changed.has("_editDetailId") || changed.has("_editBundleDirty")) {
      this._persistEditSession();
    }
  }
  _editSessionStorageKey() {
    const entryId = this.hub?.entry_id;
    if (!entryId) return null;
    return `${_SofabatonBackupTab._EDIT_SESSION_KEY_PREFIX}${entryId}`;
  }
  _persistEditSession() {
    const key = this._editSessionStorageKey();
    if (!key) return;
    try {
      if (!this._editBundle) {
        window.localStorage.removeItem(key);
        return;
      }
      const payload = {
        savedAt: Date.now(),
        filename: this._editFilename || "",
        bundle: this._editBundle,
        dirty: this._editBundleDirty,
        detail: this._editDetailKind && this._editDetailId != null ? { kind: this._editDetailKind, id: this._editDetailId } : null
      };
      window.localStorage.setItem(key, JSON.stringify(payload));
    } catch {
    }
  }
  _clearEditSession() {
    const key = this._editSessionStorageKey();
    if (!key) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
    }
  }
  /**
   * Wipe the in-memory edit draft AND the persisted session.
   * Called when the user starts a new backup or restore so they don't return
   * to the Edit tab and mistake a stale draft for the file they just produced.
   */
  _discardEditSession() {
    this._editBundle = null;
    this._editFilename = "";
    this._editError = null;
    this._editBundleDirty = false;
    this._closeEditDetail();
    this._clearEditSession();
  }
  _restoreEditSession() {
    const key = this._editSessionStorageKey();
    if (!key) return;
    let raw = null;
    try {
      raw = window.localStorage.getItem(key);
    } catch {
      return;
    }
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const savedAt = Number(parsed?.savedAt);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > _SofabatonBackupTab._EDIT_SESSION_TTL_MS) {
        window.localStorage.removeItem(key);
        return;
      }
      const bundle = validateBackupBundle(parsed.bundle);
      this._editBundle = bundle;
      this._editFilename = typeof parsed.filename === "string" ? parsed.filename : "";
      if (parsed.detail && parsed.detail.kind && Number.isFinite(Number(parsed.detail.id))) {
        this._editDetailKind = parsed.detail.kind;
        this._editDetailId = Number(parsed.detail.id);
      }
      this._editBundleDirty = Boolean(parsed.dirty);
    } catch {
      try {
        window.localStorage.removeItem(key);
      } catch {
      }
    }
  }
  render() {
    if (this.loading) {
      return b2`<div class="tab-panel"><div class="state">Loading backup tools…</div></div>`;
    }
    if (this.error) {
      return b2`<div class="tab-panel"><div class="state error">${this.error}</div></div>`;
    }
    if (!this.hub || !this.hass) {
      return b2`<div class="tab-panel"><div class="state">${TOOLS_CARD_STRINGS.backup.selectHub}</div></div>`;
    }
    if (this.blockedTitle && this.blockedMessage) {
      return b2`
        <div class="tab-panel">
          <div class="blocked-state">
            <div class="blocked-state-title">${this.blockedTitle}</div>
            <div class="blocked-state-sub">${this.blockedMessage}</div>
          </div>
        </div>
      `;
    }
    if (this.selectedSection === "edit" && this._editDetailKind && this._editDetailId != null) {
      const detailTitle = this._selectedEditTitle();
      if (detailTitle) {
        return b2`
          <sofabaton-edit-detail-view
            .bundle=${this._editBundle}
            .kind=${this._editDetailKind}
            .entityId=${this._editDetailId}
            .dirty=${this._editBundleDirty}
            mode="backup"
            @bundle-change=${this._handleDetailBundleChange}
            @close=${this._closeEditDetail}
          ></sofabaton-edit-detail-view>
        `;
      }
    }
    return b2`
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
    return b2`
      ${renderSecondaryTabContent({
      connected: true,
      contentClassName: "backup-body",
      content: b2`
            <div class="backup-drawer-sub">
              ${isRunning ? TOOLS_CARD_STRINGS.backup.creatingSubtitle : isSuccess ? TOOLS_CARD_STRINGS.backup.readySubtitle : TOOLS_CARD_STRINGS.backup.chooseSubtitle}
            </div>
            ${!this.persistentCacheEnabled || !this.cacheHub ? this._renderStatus("warning", "mdi:database-off-outline", TOOLS_CARD_STRINGS.backup.enablePersistentCache) : A}
            ${this._backupError ? this._renderStatus("error", "mdi:alert-circle-outline", this._backupError) : A}
            ${isRunning && this._backupProgress ? this._renderProgressCard(this._backupProgress, "backup") : isSuccess ? (() => {
        const hasBundle = !!this._backupProgress?.backup;
        const wasDownloaded = !!this._backupProgress?.backup_downloaded;
        const expired = !!this._backupProgress?.backup_expired;
        return b2`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">${TOOLS_CARD_STRINGS.backup.completedTitle}</div>
                    <div class="backup-complete-sub">${summary}</div>
                    ${expired ? b2`<div class="backup-expired-note">
                          <ha-icon icon="mdi:clock-alert-outline"></ha-icon>
                          ${TOOLS_CARD_STRINGS.backup.expired}
                        </div>` : wasDownloaded ? b2`<div class="backup-downloaded-note">
                            <ha-icon icon="mdi:check-circle-outline"></ha-icon>
                            ${TOOLS_CARD_STRINGS.backup.downloaded}
                          </div>` : A}
                    <div class="action-row">
                      <button class="primary-btn" ?disabled=${!hasBundle} @click=${this._downloadLatestBackup}>
                        ${wasDownloaded ? TOOLS_CARD_STRINGS.backup.downloadAgain : TOOLS_CARD_STRINGS.backup.downloadBackup}
                      </button>
                      <button class="secondary-btn" @click=${() => void this._completeBackupResult()}>${TOOLS_CARD_STRINGS.backup.complete}</button>
                    </div>
                  </div>
                `;
      })() : b2`
                  <div class="backup-config-view">
                  <div class="backup-scope-group">
                    ${this._renderScopeGroup({
        value: this._backupScope,
        disabled: this._backupLocked() || !this.cacheHub,
        options: [
          { value: "whole_hub", label: TOOLS_CARD_STRINGS.backup.entireHub },
          { value: "individual_devices", label: TOOLS_CARD_STRINGS.backup.selectedDevices }
        ],
        onChange: (next) => this._setBackupScope(next)
      })}
                  </div>
                  ${!wholeHub ? b2`
                    <div class="backup-devices-head">
                      <div class="backup-devices-head-main">
                        <div class="backup-section-title">${TOOLS_CARD_STRINGS.backup.devicesToInclude}</div>
                        <div class="backup-selected-count">${TOOLS_CARD_STRINGS.backup.selectedCount(this._backupDeviceIds.length)}</div>
                      </div>
                      <button class="backup-link-btn" ?disabled=${this._backupLocked() || !this.cacheHub} @click=${this._toggleAllBackupDevices}>
                        ${allDevicesSelected ? TOOLS_CARD_STRINGS.backup.deselectAll : TOOLS_CARD_STRINGS.backup.selectAll}
                      </button>
                    </div>
                    <div class="selection-card">
                      <div class="selection-list">
                        ${devices.length ? devices.map((device) => b2`
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
                                ${device.meta ? b2`<span class="selection-meta">${device.meta}</span>` : A}
                              </div>
                            `) : b2`<div class="selection-empty">${TOOLS_CARD_STRINGS.backup.noDevicesAvailable}</div>`}
                      </div>
                    </div>
                  ` : A}
                  <div class="backup-action-row">
                    <button
                      class="primary-btn header-primary-btn"
                      ?disabled=${this._backupActionDisabled()}
                      @click=${() => void this._runBackup()}
                    >
                      ${isRunning ? TOOLS_CARD_STRINGS.backup.working : TOOLS_CARD_STRINGS.backup.startBackup}
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
    const deviceOptions = bundleEditableDeviceOptions(bundle);
    return b2`
      ${renderSecondaryTabContent({
      connected: true,
      contentClassName: "edit-body",
      content: b2`
            ${this._editError ? this._renderStatus("error", "mdi:alert-circle-outline", this._editError) : A}
            <input id="edit-file-input" type="file" accept=".json,application/json" @change=${this._handleEditFilePicked} />
            ${bundle ? b2`
              ${this._renderEditOverview({
        activityOptions,
        deviceOptions
      })}
            ` : b2`
              <div class="edit-config-view">
                <div class="backup-drawer-sub">
                  ${TOOLS_CARD_STRINGS.backup.editLoadPrompt}
                </div>
                <div class="restore-action-row">
                  <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || TOOLS_CARD_STRINGS.backup.chooseBackupFile}</button>
                </div>
              </div>
            `}
            ${this._renderHubRenameDialog()}
        `
    })}
    `;
  }
  _renderEditOverview(params) {
    const activitiesSortable = this._haSortableReady && params.activityOptions.length > 1;
    const devicesSortable = this._haSortableReady && params.deviceOptions.length > 1;
    const renderActivityRows = () => params.activityOptions.map((option) => this._renderEditCollectionRow(
      option,
      () => this._openEditDetail("activity", option.id, option.label),
      activitiesSortable
    ));
    const renderDeviceRows = () => params.deviceOptions.map((option) => this._renderEditCollectionRow(
      option,
      () => this._openEditDetail("device", option.id, option.label),
      devicesSortable
    ));
    const hubName = String(this._editBundle?.hub?.name ?? "").trim();
    return b2`
      <div class="edit-config-view">
        <div class="backup-drawer-sub">
          ${TOOLS_CARD_STRINGS.backup.editLoadPrompt}
          ${this._haSortableReady ? TOOLS_CARD_STRINGS.backup.reorderHint : ""}
        </div>
        <div class="edit-hub-name-row" title="Hub name is only applied at restore time when the user opts to wipe the hub.">
          <span class="edit-hub-name-label">${TOOLS_CARD_STRINGS.backup.hubName}</span>
          <span class="edit-hub-name-value">${hubName || TOOLS_CARD_STRINGS.backup.hubNameNotSet}</span>
          <button
            class="icon-btn"
            @click=${this._openHubNameRenameDialog}
            aria-label=${TOOLS_CARD_STRINGS.backup.renameHub}
          >
            <ha-icon icon="mdi:pencil"></ha-icon>
          </button>
        </div>
        <div class="selection-card">
          <div class="selection-list">
            ${params.activityOptions.length ? b2`
                  <div class="selection-group-header">${TOOLS_CARD_STRINGS.backup.activities}</div>
                  ${activitiesSortable ? b2`
                        <ha-sortable
                          class="edit-order-sortable"
                          draggable-selector=".edit-selection-row"
                          handle-selector=".edit-row-drag"
                          animation="180"
                          @item-moved=${this._handleEditActivityOrderSort}
                        >
                          <div class="edit-order-sortable-container">
                            ${renderActivityRows()}
                          </div>
                        </ha-sortable>
                      ` : renderActivityRows()}
                ` : b2`<div class="selection-empty">${TOOLS_CARD_STRINGS.backup.noActivitiesInFile}</div>`}
            ${params.deviceOptions.length ? b2`
                  <div class="selection-group-header">${TOOLS_CARD_STRINGS.backup.devices}</div>
                  ${devicesSortable ? b2`
                        <ha-sortable
                          class="edit-order-sortable"
                          draggable-selector=".edit-selection-row"
                          handle-selector=".edit-row-drag"
                          animation="180"
                          @item-moved=${this._handleEditDeviceOrderSort}
                        >
                          <div class="edit-order-sortable-container">
                            ${renderDeviceRows()}
                          </div>
                        </ha-sortable>
                      ` : renderDeviceRows()}
                ` : b2`<div class="selection-empty">${TOOLS_CARD_STRINGS.backup.noDevicesInFile}</div>`}
          </div>
        </div>
        ${this._editBundleDirty ? b2`
              <div class="edit-unsaved-banner" role="status">
                <ha-icon icon="mdi:alert-circle-outline"></ha-icon>
                <span>${TOOLS_CARD_STRINGS.backup.unsavedChanges}<strong>${TOOLS_CARD_STRINGS.backup.downloadEditedBackupStrong}</strong>${TOOLS_CARD_STRINGS.backup.unsavedChangesSuffix}</span>
              </div>
            ` : A}
        <div class="restore-action-row">
          <button
            class="primary-btn${this._editBundleDirty ? " primary-btn--unsaved" : ""}"
            @click=${this._downloadEditedBundle}
          >${TOOLS_CARD_STRINGS.backup.downloadEditedBackup}</button>
          <button class="secondary-btn filename-btn" @click=${this._openEditFilePicker}>${this._editFilename || TOOLS_CARD_STRINGS.backup.chooseBackupFile}</button>
        </div>
      </div>
    `;
  }
  _renderEditCollectionRow(option, onSelect, showDragHandle) {
    return b2`
      <button class="edit-selection-row" @click=${onSelect}>
        ${showDragHandle ? b2`
              <span
                class="edit-row-drag"
                aria-hidden="true"
                @click=${(event) => event.stopPropagation()}
              >
                <ha-icon icon="mdi:drag-vertical-variant"></ha-icon>
              </span>
            ` : A}
        <span class="selection-main">
          <span class="selection-label">${option.label}</span>
        </span>
        ${option.meta ? b2`<span class="selection-meta">${option.meta}</span>` : A}
        <span class="selection-chevron"><ha-icon icon="mdi:chevron-right"></ha-icon></span>
      </button>
    `;
  }
  /**
   * Commit a mutated bundle from any edit handler. Centralizes the
   * "this counts as a user edit" decision so loaders (file pick,
   * session restore, discard) can keep using the direct
   * `this._editBundle = ...` assignment to bypass the dirty flag.
   */
  _commitEditBundleEdit(next) {
    this._editBundle = next;
    this._editBundleDirty = true;
  }
  // Detail-view transient state (open menus/dialogs, sub-views) lives in
  // the edit-detail element and resets itself when kind/entityId change,
  // so opening and closing here is just entity selection.
  _openEditDetail(kind, id, _name) {
    this._editDetailKind = kind;
    this._editDetailId = Number(id);
  }
  _renderHubRenameDialog() {
    if (!this._hubRenameOpen) return A;
    return b2`
      <div class="modal-backdrop" @click=${this._closeHubRenameDialog}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Rename Hub</div>
            <button class="dialog-close" @click=${this._closeHubRenameDialog}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${useLegacyTextField() ? b2`
                  <ha-textfield
                    id="sb-backup-hub-name"
                    .label=${"Name"}
                    .maxLength=${20}
                    .value=${this._hubRenameDraft}
                    @input=${this._handleHubRenameInput}
                    @change=${this._handleHubRenameInput}
                    @keydown=${(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._applyHubRename();
      }
    }}
                  ></ha-textfield>
                ` : b2`
                  <ha-input
                    id="sb-backup-hub-name"
                    type="text"
                    .label=${"Name"}
                    .maxlength=${20}
                    .value=${this._hubRenameDraft}
                    @input=${this._handleHubRenameInput}
                    @change=${this._handleHubRenameInput}
                    @keydown=${(event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this._applyHubRename();
      }
    }}
                  ></ha-input>
                `}
          </div>
          <div class="dialog-footer">
            <div class="dialog-footer-note">${this._hubRenameError}</div>
            <div class="dialog-footer-actions">
              <button class="dialog-btn" @click=${this._closeHubRenameDialog}>Cancel</button>
              <button class="dialog-btn dialog-btn-primary" @click=${this._applyHubRename}>Save</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  _selectedEditTitle() {
    if (!this._editBundle || !this._editDetailKind || this._editDetailId == null) return "";
    const options = this._editDetailKind === "activity" ? bundleActivityOptions(this._editBundle) : bundleDeviceOptions(this._editBundle);
    return options.find((option) => option.id === this._editDetailId)?.label || "";
  }
  _reorderEditTopLevel(event, kind) {
    if (!this._editBundle) return;
    const sortableEvent = event;
    const oldIndex = Number(sortableEvent.detail?.oldIndex);
    const newIndex = Number(sortableEvent.detail?.newIndex);
    if (!Number.isFinite(oldIndex) || !Number.isFinite(newIndex) || oldIndex === newIndex) return;
    const current = kind === "activity" ? bundleActivityOptions(this._editBundle) : bundleDeviceOptions(this._editBundle);
    if (oldIndex < 0 || newIndex < 0 || oldIndex >= current.length || newIndex >= current.length) return;
    const nextOptions = [...current];
    const [moved] = nextOptions.splice(oldIndex, 1);
    if (!moved) return;
    nextOptions.splice(newIndex, 0, moved);
    const orderedIds = nextOptions.map((option) => option.id);
    this._commitEditBundleEdit(kind === "activity" ? reorderBundleActivities(this._editBundle, orderedIds) : reorderBundleDevices(this._editBundle, orderedIds));
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
    const totalRestoreSelected = restoreSelection.selectedActivityIds.length + restoreSelection.selectedDeviceIds.length;
    const allRestoreSelected = totalRestoreOptions > 0 && totalRestoreSelected === totalRestoreOptions;
    return b2`
      ${renderSecondaryTabContent({
      connected: true,
      contentClassName: "restore-body",
      content: b2`
            <div class="backup-drawer-sub">
              ${isRunning ? "The hub is restoring your backup." : isSuccess ? "Your restore has completed." : "Load a backup file, then choose exactly what to restore. Activities automatically pull in the Devices they depend on."}
            </div>
            ${this._restoreError ? this._renderStatus("error", "mdi:alert-circle-outline", this._restoreError) : A}
            ${isRunning && this._restoreProgress ? this._renderProgressCard(this._restoreProgress, "restore") : isSuccess ? b2`
                  <div class="backup-complete-card">
                    <div class="backup-complete-icon"><ha-icon icon="mdi:check-decagram-outline"></ha-icon></div>
                    <div class="backup-complete-title">Restore completed</div>
                    <div class="backup-complete-sub">The selected Activities and Devices were restored to the hub.</div>
                    <div class="action-row">
                      <button class="primary-btn" @click=${() => void this._completeRestoreResult()}>Complete</button>
                    </div>
                  </div>
                ` : A}
            <input id="restore-file-input" type="file" accept=".json,application/json" @change=${this._handleFilePicked} />
            ${!isRunning && !isSuccess && this._restoreBundle ? b2`
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
                    ${activityOptions.length ? b2`
                        <div class="selection-group-header">Activities</div>
                        ${activityOptions.map((activity) => {
        const forcedActivity = restoreSelection.forcedActivityIds.includes(activity.id);
        return b2`
                          <div
                            class="selection-row ${forcedActivity ? "locked" : ""}"
                            @click=${() => {
          if (forcedActivity || this._restoreLocked()) return;
          this._setRestoreActivity(activity.id, !this._restoreActivityIds.includes(activity.id));
        }}
                          >
                            ${this._renderCheckboxControl({
          checked: restoreSelection.selectedActivityIds.includes(activity.id),
          disabled: forcedActivity || this._restoreLocked(),
          onChange: (checked) => this._setRestoreActivity(activity.id, checked)
        })}
                            <span class="selection-main">
                              <span class="selection-label">${activity.label}</span>
                            </span>
                            ${activity.meta ? b2`<span class="selection-meta">${forcedActivity ? `${activity.meta} \xB7 linked` : activity.meta}</span>` : forcedActivity ? b2`<span class="selection-meta">linked</span>` : A}
                          </div>
                        `;
      })}
                      ` : b2`<div class="selection-empty">This backup file has no activities.</div>`}
                    ${deviceOptions.length ? b2`
                        <div class="selection-group-header">Devices</div>
                        ${deviceOptions.map((device) => {
        const forced = restoreSelection.forcedDeviceIds.includes(device.id);
        return b2`
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
                              ${device.meta ? b2`<span class="selection-meta">${forced ? `${device.meta} \xB7 linked` : device.meta}</span>` : A}
                            </div>
                          `;
      })}
                      ` : b2`<div class="selection-empty">This backup file has no devices.</div>`}
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
            ` : !isRunning && !isSuccess ? b2`
              <div class="restore-action-row">
                <button class="secondary-btn filename-btn" ?disabled=${this._restoreLocked()} @click=${this._openFilePicker}>${this._restoreFilename || "Choose backup file"}</button>
              </div>
            ` : A}
        `
    })}
    `;
  }
  _renderStatus(tone, icon, message) {
    return b2`
      <div class="status-box ${tone}">
        <span class="status-icon"><ha-icon icon=${icon}></ha-icon></span>
        <span>${message}</span>
      </div>
    `;
  }
  _renderScopeGroup(params) {
    const isOption = (raw) => typeof raw === "string" && params.options.some((option) => option.value === raw);
    return b2`
      <div class="compat-radio-group" role="radiogroup" aria-disabled=${params.disabled ? "true" : "false"}>
        ${params.options.map((option) => b2`
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
      return b2`
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
    return b2`
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
      title: mode === "backup" ? TOOLS_CARD_STRINGS.progress.backupTitle : TOOLS_CARD_STRINGS.progress.restoreTitle,
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
    this._discardEditSession();
    const deviceIds = this._backupScope === "whole_hub" ? null : this._backupDeviceIds;
    const entryId = this.hub.entry_id;
    this.setHubCommandBusy?.(true, "Starting backup\u2026", entryId);
    try {
      const start = await this.api().startBackupExport(entryId, deviceIds);
      await this.refreshControlPanelState?.();
      await this._subscribeToOperation(start.operation_id, "backup", entryId);
    } catch (error) {
      this._backupError = formatError(error);
      this.setHubCommandBusy?.(false, null, entryId);
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
      // Expanded set: includes activities forced in by chain references.
      selectedActivityIds: selection.selectedActivityIds,
      selectedDeviceIds: selection.selectedDeviceIds
    });
    this._restoreError = null;
    this._restoreSuccess = null;
    this._restoreProgress = null;
    this._discardEditSession();
    const entryId = this.hub.entry_id;
    this.setHubCommandBusy?.(true, "Starting restore\u2026", entryId);
    try {
      const start = await this.api().startBackupRestore(entryId, filtered, this._restoreMode);
      await this.refreshControlPanelState?.();
      await this._subscribeToOperation(start.operation_id, "restore", entryId);
    } catch (error) {
      this._restoreError = formatError(error);
      this.setHubCommandBusy?.(false, null, entryId);
    }
  }
  async _subscribeToOperation(operationId, kind, entryId) {
    this._teardownProgressSubscription();
    const unsubscribe = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      const staleHub = String(this.hub?.entry_id || "").trim() !== entryId;
      const transient = Boolean(payload?.transient);
      if (transient && payload.status === "failed") {
        const opId = String(payload.operation_id || operationId || "").trim();
        if (opId) this._acknowledgedOpIds.add(opId);
        if (!staleHub) {
          if (kind === "backup") {
            this._backupError = String(payload.error || payload.message || "Backup failed.");
          } else {
            this._restoreError = String(payload.error || payload.message || "Restore failed.");
          }
        }
        this.setHubCommandBusy?.(false, null, entryId);
        this._teardownProgressSubscription();
        return;
      }
      if (kind === "backup") {
        if (!staleHub) this._backupProgress = payload;
        if (payload.status === "success") {
          this.setHubCommandBusy?.(false, null, entryId);
          try {
            await this.refreshControlPanelState?.();
          } catch {
          }
        } else if (payload.status === "failed") {
          if (!staleHub) this._backupError = String(payload.error || payload.message || "Backup failed.");
          this.setHubCommandBusy?.(false, null, entryId);
          try {
            await this.refreshControlPanelState?.();
          } catch {
          }
        }
      } else {
        if (!staleHub) this._restoreProgress = payload;
        if (payload.status === "success") {
          if (!staleHub) this._restoreSuccess = "Restore completed.";
          this.setHubCommandBusy?.(false, null, entryId);
          try {
            await this.refreshControlPanelState?.();
          } catch {
          }
        } else if (payload.status === "failed") {
          if (!staleHub) this._restoreError = String(payload.error || payload.message || "Restore failed.");
          this.setHubCommandBusy?.(false, null, entryId);
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
      this._acknowledgedOpIds.add(operationId);
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
  // Drop the picked-but-not-yet-started restore bundle and its UI-side
  // selection. Server-side state (an in-progress restore, success/failure
  // results) is not touched — that's reconciled by _syncBackupOperationState
  // against the new hub.
  _resetRestoreBundleForHubSwitch() {
    this._restoreBundle = null;
    this._restoreFilename = "";
    this._restoreActivityIds = [];
    this._restoreManualDeviceIds = [];
    this._restoreMode = "merge";
    this._restoreError = null;
    this._restoreSuccess = null;
  }
  async _completeRestoreResult() {
    const operationId = String(this._restoreProgress?.operation_id || "").trim();
    if (operationId) {
      this._acknowledgedOpIds.add(operationId);
      try {
        await this.api().clearRestoreResult(operationId);
      } catch (error) {
        this._restoreError = formatError(error);
      }
    }
    try {
      await this.refreshControlPanelState?.();
    } catch {
    }
    this._resetRestoreComposer();
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
      if (String(this.hub?.entry_id || "").trim() !== entryId) return;
      const rawBackup = state?.backup_export || null;
      const rawRestore = state?.backup_restore || null;
      const backupId = String(rawBackup?.operation_id || "").trim();
      const restoreId = String(rawRestore?.operation_id || "").trim();
      const liveIds = /* @__PURE__ */ new Set();
      if (backupId) liveIds.add(backupId);
      if (restoreId) liveIds.add(restoreId);
      for (const ackId of [...this._acknowledgedOpIds]) {
        if (!liveIds.has(ackId)) this._acknowledgedOpIds.delete(ackId);
      }
      const backupSnapshot = backupId && this._acknowledgedOpIds.has(backupId) ? null : rawBackup;
      const restoreSnapshot = restoreId && this._acknowledgedOpIds.has(restoreId) ? null : rawRestore;
      this._backupProgress = backupSnapshot;
      this._restoreProgress = restoreSnapshot;
      this._backupError = String(this._backupProgress?.status || "") === "failed" ? String(this._backupProgress?.error || this._backupProgress?.message || "Backup failed.") : null;
      this._restoreError = String(this._restoreProgress?.status || "") === "failed" ? String(this._restoreProgress?.error || this._restoreProgress?.message || "Restore failed.") : null;
      this._restoreSuccess = String(this._restoreProgress?.status || "") === "success" ? "Restore completed." : null;
      const active = state?.active_operation || null;
      if (active && String(active.kind || "") === "backup_export" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Backup in progress\u2026"), entryId);
        await this._subscribeToOperation(active.operation_id, "backup", entryId);
      } else if (active && String(active.kind || "") === "backup_restore" && active.operation_id) {
        this.setHubCommandBusy?.(true, String(active.message || "Restore in progress\u2026"), entryId);
        await this._subscribeToOperation(active.operation_id, "restore", entryId);
      } else {
        this.setHubCommandBusy?.(false, null, entryId);
      }
    } catch {
    } finally {
      this._backupHydrating = false;
    }
  }
};
_SofabatonBackupTab.properties = {
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
  _editDetailKind: { state: true },
  _editDetailId: { state: true },
  _editBundleDirty: { state: true },
  _haSortableReady: { state: true },
  _hubRenameOpen: { state: true },
  _hubRenameDraft: { state: true },
  _hubRenameError: { state: true }
};
_SofabatonBackupTab.styles = [secondaryTabStyles, operationProgressStyles, backupTabStyles];
_SofabatonBackupTab._EDIT_SESSION_TTL_MS = 60 * 60 * 1e3;
_SofabatonBackupTab._EDIT_SESSION_KEY_PREFIX = "sofabaton.backup-edit-session.v1.";
var SofabatonBackupTab = _SofabatonBackupTab;
if (!customElements.get("sofabaton-backup-tab")) {
  customElements.define("sofabaton-backup-tab", SofabatonBackupTab);
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
var _SofabatonWifiCommandsTab = class _SofabatonWifiCommandsTab extends i4 {
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
      const busyEntryId = String(this.hub?.entry_id || "").trim();
      this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.deleteDeviceBusy, busyEntryId);
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
        this._setSharedHubCommandBusy(false, null, busyEntryId);
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
    if (this.loading) return b2`<div class="state">Loading...</div>`;
    if (this.error) return b2`<div class="state error">${this.error}</div>`;
    if (!this.hub) return b2`<div class="state">No hubs found.</div>`;
    if (this.blockedTitle && this.blockedMessage) {
      return b2`
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
      return b2`
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
    return b2`
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
    }) : b2`
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
    return b2`
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
        ${this._wifiDevices.length ? b2`
          <div class="device-list">
            ${this._wifiDevices.map((device) => b2`
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
                ${irFlash && this._pressMatchesDevice(irFlash, device) ? i6(irFlash.receivedAt, b2`<div class="wifi-ir-flash" aria-hidden="true"></div>`) : A}
              </div>
            `)}
          </div>
        ` : b2`<div class="empty-state-card">No Wifi Devices configured yet. Add one to start assigning command slots.</div>`}
        <div class="sticky-footer">
          ${!canAdd ? b2`<div class="wifi-max-devices-note">Maximum number of devices reached</div>` : A}
        </div>
      </div>
    `;
  }
  _renderCreateDeviceModal() {
    if (!this._createDeviceModalOpen) return A;
    return b2`
      <div class="modal-backdrop" @click=${this._closeCreateDeviceModal}>
        <div class="dialog small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${TOOLS_CARD_STRINGS.wifiCommands.addDevice}</div>
            <button class="dialog-close" @click=${this._closeCreateDeviceModal}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            ${this._useLegacyTextField() ? b2`
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
                ` : b2`
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
    return b2`
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
    const flashOverlay = irFlash && this._pressMatchesSlot(irFlash, idx) ? i6(irFlash.receivedAt, b2`<div class="wifi-ir-flash" aria-hidden="true"></div>`) : A;
    if (isConfirming) {
      return b2`
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
      return b2`
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
    return b2`
      <div class="slot-btn">
        <div class="slot-actions">
          ${command.is_power_on && command.is_power_off ? b2`<span class="slot-flag power-both" title="Power ON and OFF command"><ha-icon icon="mdi:power"></ha-icon></span>` : command.is_power_on ? b2`<span class="slot-flag power-on" title="Power ON command"><ha-icon icon="mdi:power"></ha-icon></span>` : command.is_power_off ? b2`<span class="slot-flag power-off" title="Power OFF command"><ha-icon icon="mdi:power"></ha-icon></span>` : A}
          ${this._hasInputActivity(command) ? b2`<span class="slot-flag" title=${this._inputFlagTitle(command)}><ha-icon icon=${INPUT_ICON}></ha-icon></span>` : A}
          <button class="slot-clear" @click=${(event) => {
      event.stopPropagation();
      this._confirmClearSlot = idx;
    }}><ha-icon icon="mdi:close"></ha-icon></button>
        </div>
        <button class="slot-main" @click=${() => this._openCommandEditor(idx)}>
          <span class="slot-text-wrap">
            <span class="slot-name">${String(command.name || "").trim() || `Command ${idx + 1}`}</span>
            <span class="slot-meta">
              ${command.add_as_favorite ? b2`<span class="slot-favorite"><ha-icon icon="mdi:heart"></ha-icon></span>` : A}
              ${command.hard_button ? b2`<span class="slot-meta-icon"><ha-icon icon=${this._commandSlotIcon(command.hard_button)} style=${this._commandSlotIconColor(command.hard_button) ? `color:${this._commandSlotIconColor(command.hard_button)}` : ""}></ha-icon></span>` : A}
              ${command.long_press_enabled ? b2`<span class="slot-meta-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>` : A}
              ${unconfiguredCommand ? b2`<span class="slot-meta-icon warning"><ha-icon icon="mdi:alert-circle"></ha-icon></span>` : A}
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
    return b2`
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
                ${this._useLegacyTextField() ? b2`
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
                    ` : b2`
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
                ${this._advancedOptionsOpen ? b2`
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
                ${this._hardButtonReplacementLabel() ? b2`<div class="button-conflict-hint">${this._hardButtonReplacementLabel()}</div>` : A}
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
                  ${activities.length ? activities.map((activity) => b2`
                    <button
                      class="activity-chip ${selectedActivities.has(String(activity.id)) ? "active" : ""} ${activitySelectionEnabled ? "" : "disabled"}"
                      ?disabled=${!activitySelectionEnabled}
                      @click=${(event) => this._toggleActivity(activity.id, event)}
                    >
                      ${activity.name}
                    </button>
                  `) : b2`<div class="empty-hint">${TOOLS_CARD_STRINGS.wifiCommands.noActivitiesForHub}</div>`}
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
    return b2`
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
              ${draft.long_press_enabled ? b2`
                <div class="action-tabs">
                  <button class="action-tab ${activeTab === "short" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("short")}>${TOOLS_CARD_STRINGS.wifiCommands.shortPress}</button>
                  <button class="action-tab ${activeTab === "long" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("long")}>${TOOLS_CARD_STRINGS.wifiCommands.longPress}</button>
                </div>
              ` : A}
              <div class="action-helper">${activeTab === "long" ? TOOLS_CARD_STRINGS.wifiCommands.selectLongPressAction : TOOLS_CARD_STRINGS.wifiCommands.selectTriggeredAction}</div>
              <div class="action-selector-wrap" ?hidden=${activeTab !== "short"}>
                ${i6(this._shortSelectorVersion, b2`
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
                ${i6(this._longSelectorVersion, b2`
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
    return b2`
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
    const pattern = this._supportsUnicodeCommandNames() ? /[^\p{L}\p{N}\p{M} !-\/:-@\[-`{-~]+/gu : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
  }
  _sanitizeWifiDeviceName(value) {
    return this._sanitizeCommandName(value);
  }
  // entryId is captured by callers when their operation starts so busy
  // set/clear pairs stay scoped to that hub even if the hub picker moves on
  // before the operation's finally runs.
  _setSharedHubCommandBusy(busy, label = null, entryId) {
    const key = (entryId ?? String(this.hub?.entry_id || "")).trim() || void 0;
    this.setHubCommandBusy?.(busy, label, key);
    this.dispatchEvent(new CustomEvent("sofabaton-hub-command-busy-changed", {
      detail: { busy, label, entryId: key ?? null },
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
      const addAsFavorite = record.add_as_favorite === void 0 ? this._commandSlotDefault(idx).add_as_favorite : Boolean(record.add_as_favorite);
      const hardButton = String(record.hard_button ?? "");
      const activitiesActive = addAsFavorite || Boolean(hardButton.trim());
      const rawActivities = activitiesActive && Array.isArray(record.activities) ? record.activities.map((id) => String(id)).filter((id) => id !== "") : [];
      const activities = validActivityIds ? rawActivities.filter((id) => validActivityIds.has(id)) : rawActivities;
      return {
        ...this._commandSlotDefault(idx),
        name: this._sanitizeCommandName(record.name ?? `Command ${idx + 1}`),
        add_as_favorite: addAsFavorite,
        hard_button: hardButton,
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
        (slot, i7) => i7 === conflictIdx ? this._cloneCommandSlot({ ...slot, hard_button: "", long_press_enabled: false, long_press_action: { ...DEFAULT_ACTION } }) : slot
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
    return b2`${message} <a class="sync-doc-link" href=${WIFI_COMMANDS_DOCS_URL} target="_blank" rel="noreferrer">${TOOLS_CARD_STRINGS.wifiCommands.seeDocumentation}</a>`;
  }
  _renderStatusDock(message, tone) {
    return b2`
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
    return b2`<button class=${classes} ?disabled=${disabled} @click=${disabled ? null : this._runCommandConfigSync}>${label}</button>`;
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
    const busyEntryId = String(this.hub?.entry_id || "").trim();
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.createDeviceBusy, busyEntryId);
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
      this._setSharedHubCommandBusy(false, null, busyEntryId);
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
    const busyEntryId = String(this.hub?.entry_id || "").trim();
    this._setSharedHubCommandBusy(true, TOOLS_CARD_STRINGS.wifiCommands.syncingDeviceFallback, busyEntryId);
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
      this._setSharedHubCommandBusy(false, null, busyEntryId);
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
_SofabatonWifiCommandsTab._DEVICE_SESSION_KEY_PREFIX = "sofabaton_x1s:wifi_commands:selected_device:";
// Matches the dock wipe (and the slot/card glow keyframes) at 720ms.
_SofabatonWifiCommandsTab._IR_FLASH_DURATION_MS = 720;
_SofabatonWifiCommandsTab.properties = {
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
_SofabatonWifiCommandsTab.styles = [secondaryTabStyles, operationProgressStyles, i`
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
var SofabatonWifiCommandsTab = _SofabatonWifiCommandsTab;
if (!customElements.get("sofabaton-wifi-commands-tab")) {
  customElements.define("sofabaton-wifi-commands-tab", SofabatonWifiCommandsTab);
}

// custom_components/sofabaton_x1s/www/src/components/refresh-cache-button.ts
var SofabatonRefreshCacheButton = class extends i4 {
  constructor() {
    super(...arguments);
    this.hass = null;
    this.entryId = "";
    this.label = "";
    this.disabled = false;
    /** Store-routed refresh (refreshAllForHub); resolves null on success or a failure message. */
    this.runRefresh = null;
    this._running = false;
    this._message = "";
    this._error = null;
    this._unsub = null;
    this._start = async () => {
      if (this._running || !this.entryId || !this.hass) return;
      this._running = true;
      this._error = null;
      this._message = TOOLS_CARD_STRINGS.cacheRefresh.starting;
      if (this.runRefresh) {
        try {
          const failure = await this.runRefresh();
          this._running = false;
          this._message = "";
          if (failure) {
            this._error = failure;
            return;
          }
          this.dispatchEvent(new CustomEvent("refreshed", { bubbles: true, composed: true }));
        } catch (error) {
          this._running = false;
          this._error = formatError(error);
          this._message = "";
        }
        return;
      }
      try {
        const start = await this._api().startCacheRefresh(this.entryId);
        await this._subscribe(start.operation_id);
      } catch (error) {
        this._running = false;
        this._error = formatError(error);
        this._message = "";
      }
    };
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardown();
  }
  _teardown() {
    const unsub = this._unsub;
    this._unsub = null;
    if (unsub) {
      try {
        unsub();
      } catch {
      }
    }
  }
  _api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
  }
  async _subscribe(operationId) {
    this._teardown();
    const unsub = await this._api().subscribeBackupProgress(operationId, (payload) => {
      if (payload.status === "success") {
        this._running = false;
        this._message = "";
        this._error = null;
        this._teardown();
        this.dispatchEvent(new CustomEvent("refreshed", { bubbles: true, composed: true }));
        return;
      }
      if (payload.status === "failed") {
        this._running = false;
        this._error = String(payload.error || payload.message || "Cache refresh failed.");
        this._message = "";
        this._teardown();
        return;
      }
      this._message = String(payload.message || TOOLS_CARD_STRINGS.cacheRefresh.working);
    });
    this._unsub = unsub;
  }
  render() {
    const S5 = TOOLS_CARD_STRINGS.cacheRefresh;
    return b2`
      <div class="wrap">
        <button ?disabled=${this._running || this.disabled || !this.entryId} @click=${this._start}>
          <ha-icon class=${this._running ? "spin" : ""} icon="mdi:refresh"></ha-icon>
          <span>${this._running ? S5.running : this.label || S5.label}</span>
        </button>
        ${this._running && this._message ? b2`<div class="status">${this._message}</div>` : this._error ? b2`<div class="status error">${this._error}</div>` : A}
      </div>
    `;
  }
};
SofabatonRefreshCacheButton.properties = {
  hass: { attribute: false },
  entryId: { type: String },
  label: { type: String },
  disabled: { type: Boolean },
  runRefresh: { attribute: false },
  _running: { state: true },
  _message: { state: true },
  _error: { state: true }
};
SofabatonRefreshCacheButton.styles = i`
    :host { display: inline-flex; }
    .wrap { display: inline-flex; flex-direction: column; gap: 4px; align-items: stretch; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      border: 1px solid var(--primary-color);
      border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
      background: color-mix(in srgb, var(--primary-color) 16%, transparent);
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      font-size: 13px;
      padding: 8px 14px;
      cursor: pointer;
      white-space: nowrap;
      transition: border-color 120ms ease, background-color 120ms ease, opacity 120ms ease;
    }
    button:hover:not(:disabled) { background: color-mix(in srgb, var(--primary-color) 24%, transparent); }
    button:disabled { cursor: default; opacity: 0.55; }
    ha-icon { --mdc-icon-size: 18px; }
    ha-icon.spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (prefers-reduced-motion: reduce) { ha-icon.spin { animation: none; } }
    .status { font-size: 12px; color: var(--secondary-text-color); line-height: 1.35; min-height: 1em; }
    .status.error { color: var(--error-color, #db4437); }
  `;
if (!customElements.get("sofabaton-refresh-cache-button")) {
  customElements.define("sofabaton-refresh-cache-button", SofabatonRefreshCacheButton);
}

// custom_components/sofabaton_x1s/www/src/tabs/activities-tab.ts
var S4 = TOOLS_CARD_STRINGS.activities;
var SofabatonActivitiesTab = class extends i4 {
  constructor() {
    super(...arguments);
    this.hass = null;
    this.hub = null;
    /** What is being edited; the host sets both before mounting. */
    this.kind = "activity";
    this.entityId = null;
    this.loading = false;
    this.error = null;
    this.blockedTitle = null;
    this.blockedMessage = null;
    this.selectedHubProxyConnected = false;
    this._stage = "list";
    this._entityId = null;
    this._baseline = null;
    this._working = null;
    this._captureProgress = null;
    this._captureError = null;
    this._dirty = false;
    this._deleteError = null;
    this._exitConfirmOpen = false;
    this._syncProgress = null;
    this._syncError = null;
    this._syncFailedAt = null;
    this._captureOperationId = null;
    this._syncOperationId = null;
    this._progressUnsub = null;
    this._syncStateHydratedFor = null;
    this._exitAfterSync = false;
    // Which requested activityId we already auto-opened, so returning to the
    // idle stage (close) doesn't immediately re-capture the same activity.
    this._autoOpenedEntityId = null;
    // entry_id of the hub the current stage belongs to. The `hub` prop
    // is a fresh object on every control_panel/state refresh, so we key reset
    // decisions on the entry_id — not object identity — to avoid tearing down
    // an in-flight capture/edit whenever state refreshes.
    this._hubEntryId = null;
    // ── Live command-payload editing (host-provided I/O) ────────────────
    // The detail view is hass-free, so it delegates the on-demand blob fetch
    // and the Test playback to these callbacks. The fetch is per-command (not
    // part of the structural cache), so payloads only leave the hub when the
    // user actually opens the payload editor.
    this._fetchCommandPayload = async (deviceId, commandId) => {
      if (!this.hub) return null;
      const response = await this.api().fetchBlob(this.hub.entry_id, deviceId, commandId);
      const commands = response.commands ?? [];
      const command = commands.find((c4) => Number(c4.command_id) === Number(commandId)) ?? commands[0];
      const dataHex = String(command?.command_blob ?? "").trim();
      if (!command || !dataHex) return null;
      return { dataHex, decoded: command.decoded ?? null };
    };
    this._testCommandPayload = async (hex) => {
      if (!this.hub) throw new Error("No hub is selected.");
      await this.api().playIrBlob(this.hub.entry_id, hex);
    };
    // ── Capture flow (§4.2) — sourced from the blob-free structural cache ──
    // Read the structural hub_bundle the backend assembles on demand from the
    // canonical persistent cache (per-entity refreshes and syncs update it in
    // place; payloads carry a per-entity `fetched_at`). If it's missing —
    // meaning no structural refresh has ever run — prompt the user to refresh.
    // While editing, this bundle *is* the truth — the editor never
    // second-guesses whether the hub has since changed. That reconciliation
    // happens once, authoritatively, at sync time (the backend stale
    // pre-flight).
    this._startCapture = async (entityId) => {
      if (!this.hub || !this.hass) return;
      this._entityId = entityId;
      this._captureError = null;
      this._captureProgress = null;
      this._stage = "capturing";
      try {
        const res = await this.api().getStructuralBundle(this.hub.entry_id);
        const bundle = res?.bundle ?? null;
        const entries = (this.kind === "device" ? bundle?.devices : bundle?.activities) ?? [];
        const hasEntity = !!bundle && entries.some(
          (candidate) => Number(candidate.device?.device_id) === entityId
        );
        if (!bundle || !hasEntity) {
          this._stage = "needs_refresh";
          return;
        }
        this._baseline = bundle;
        this._working = structuredClone(bundle);
        this._dirty = false;
        this._stage = "editing";
      } catch (error) {
        this._captureError = formatError(error);
      }
    };
    // ── Editing (§4.3) — interactive but ephemeral in L2 ───────────────
    this._handleBundleChange = (event) => {
      this._working = event.detail.bundle;
      this._recomputeDirty();
    };
    // ── Sync / Delete (§4.4) ────────────────────────────────────────────
    // Start the real sync engine (§4.5): diff baseline vs working on the
    // backend and issue targeted in-place writes, streaming progress.
    this._requestSync = async () => {
      if (!this._dirty || this._entityId == null || !this.hub || !this._baseline || !this._working) return;
      this._exitConfirmOpen = false;
      this._syncError = null;
      this._syncFailedAt = null;
      this._syncProgress = null;
      this._stage = "syncing";
      try {
        const start = this.kind === "device" ? await this.api().startDeviceSync(this.hub.entry_id, this._entityId, this._baseline, this._working) : await this.api().startActivitySync(this.hub.entry_id, this._entityId, this._baseline, this._working);
        this._syncOperationId = start.operation_id;
        await this.refreshControlPanelState?.();
        await this._subscribeSync(start.operation_id);
      } catch (error) {
        this._syncError = formatError(error);
        this._syncFailedAt = null;
        this._exitAfterSync = false;
        this._stage = "sync_failed";
      }
    };
    this._retrySync = () => {
      void this._requestSync();
    };
    // ── Immediate delete (entity delete executes on the hub right away) ──
    // The detail view gates the delete behind its are-you-sure dialog and then
    // emits `delete-request`; we run the targeted hub delete and, on success,
    // leave the editor (the entity no longer exists to edit).
    this._handleDeleteRequest = async (event) => {
      if (!this.hub || !this.hass) return;
      if (this._stage === "deleting" || this._stage === "syncing") return;
      const entityId = Number(event.detail?.entityId);
      if (!Number.isFinite(entityId)) return;
      this._deleteError = null;
      this._stage = "deleting";
      try {
        if (event.detail.kind === "device") {
          await this.api().deleteDevice(this.hub.entry_id, entityId);
        } else {
          await this.api().deleteActivity(this.hub.entry_id, entityId);
        }
        await this.refreshControlPanelState?.();
        this._resetToList();
      } catch (error) {
        this._deleteError = formatError(error);
        this._stage = "editing";
      }
    };
    this._closeEditor = () => {
      if (this._dirty) {
        this._exitConfirmOpen = true;
        return;
      }
      this._resetToList();
    };
    this._closeExitConfirm = () => {
      this._exitConfirmOpen = false;
    };
    this._leaveWithoutSync = () => {
      this._exitAfterSync = false;
      this._resetToList();
    };
    this._syncAndLeave = () => {
      this._exitAfterSync = true;
      void this._requestSync();
    };
    this._reloadFromHub = () => {
      if (this._entityId == null) return;
      void this._startCapture(this._entityId);
    };
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._teardownProgressSubscription();
  }
  updated(changed) {
    if (changed.has("hub")) {
      const nextEntryId = this.hub?.entry_id ?? null;
      if (this._hubEntryId !== null && nextEntryId !== this._hubEntryId) {
        this._teardownProgressSubscription();
        this._resetToList();
        this._syncStateHydratedFor = null;
      }
      this._hubEntryId = nextEntryId;
    }
    if (this.hub && this._syncStateHydratedFor !== this.hub.entry_id) {
      this._syncStateHydratedFor = this.hub.entry_id;
      void this._hydrateRunningSync();
    }
    this._maybeAutoOpen();
  }
  // Direct-open: capture the requested entity as soon as the guards clear.
  // Runs once per requested id — a close (back to the idle stage) must not
  // re-capture; the host tears the element down on `editor-exit`.
  _maybeAutoOpen() {
    const requested = this.entityId == null ? null : Number(this.entityId);
    if (requested == null || !Number.isFinite(requested)) return;
    if (this._stage !== "list" || this._autoOpenedEntityId === requested) return;
    if (this._openBlocked()) return;
    this._autoOpenedEntityId = requested;
    void this._startCapture(requested);
  }
  _openBlocked() {
    return this.selectedHubProxyConnected || this._isProgressRunning(this.hub?.active_backup_operation ?? null);
  }
  // Card reloaded mid-sync: pick up a running sync op for this kind from the
  // shared backup/state registry and resubscribe to its progress.
  async _hydrateRunningSync() {
    if (!this.hub || !this.hass) return;
    try {
      const state = await this.api().getBackupState(this.hub.entry_id);
      const op = (this.kind === "device" ? state?.device_sync : state?.activity_sync) ?? null;
      const running = !!op && ["pending", "running"].includes(String(op.status || ""));
      if (running && op?.operation_id) {
        this._syncOperationId = op.operation_id;
        this._syncProgress = op;
        this._stage = "syncing";
        await this._subscribeSync(op.operation_id);
      }
    } catch {
    }
  }
  api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
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
  _isProgressRunning(progress) {
    return !!progress && ["pending", "running"].includes(String(progress.status || ""));
  }
  _recomputeDirty() {
    this._dirty = !!this._baseline && !!this._working && JSON.stringify(this._working) !== JSON.stringify(this._baseline);
  }
  async _subscribeSync(operationId) {
    this._teardownProgressSubscription();
    const unsub = await this.api().subscribeBackupProgress(operationId, async (payload) => {
      if (payload.status === "success") {
        this._teardownProgressSubscription();
        await this._onSyncSuccess(operationId);
        return;
      }
      if (payload.status === "failed") {
        this._teardownProgressSubscription();
        this._syncError = String(payload.error || payload.message || "Sync failed.");
        this._syncFailedAt = String(payload.failed_at || "");
        this._syncProgress = null;
        this._exitAfterSync = false;
        this._stage = "sync_failed";
        return;
      }
      this._syncProgress = payload;
    });
    this._progressUnsub = unsub;
  }
  async _onSyncSuccess(operationId) {
    this._syncProgress = null;
    this._syncOperationId = null;
    const exitAfterSync = this._exitAfterSync;
    this._exitAfterSync = false;
    try {
      await this.api().clearBackupResult(operationId);
    } catch {
    }
    try {
      await this.refreshControlPanelState?.();
    } catch {
    }
    if (exitAfterSync) {
      this._resetToList();
      return;
    }
    let rebased = null;
    try {
      const res = this.hub ? await this.api().getStructuralBundle(this.hub.entry_id) : null;
      const bundle = res?.bundle ?? null;
      const entries = (this.kind === "device" ? bundle?.devices : bundle?.activities) ?? [];
      const hasEntity = !!bundle && entries.some(
        (candidate) => Number(candidate.device?.device_id) === this._entityId
      );
      if (bundle && hasEntity) rebased = bundle;
    } catch {
    }
    if (rebased) {
      this._baseline = rebased;
      this._working = structuredClone(rebased);
    } else if (this._working) {
      this._baseline = structuredClone(this._working);
    }
    this._recomputeDirty();
    this._stage = "editing";
  }
  _resetToList() {
    const wasActive = this._stage !== "list" || this._entityId != null;
    this._stage = "list";
    this._entityId = null;
    this._baseline = null;
    this._working = null;
    this._captureProgress = null;
    this._captureError = null;
    this._captureOperationId = null;
    this._dirty = false;
    this._deleteError = null;
    this._exitConfirmOpen = false;
    this._syncProgress = null;
    this._syncError = null;
    this._syncFailedAt = null;
    this._syncOperationId = null;
    this._exitAfterSync = false;
    if (wasActive) {
      this.dispatchEvent(new CustomEvent("editor-exit", { bubbles: true, composed: true }));
    }
  }
  // ── Render ─────────────────────────────────────────────────────────
  render() {
    if (this.loading) {
      return b2`<div class="tab-panel"><div class="state">${S4.loading}</div></div>`;
    }
    if (this.error) {
      return b2`<div class="tab-panel"><div class="state error">${this.error}</div></div>`;
    }
    if (!this.hub || !this.hass) {
      return b2`<div class="tab-panel"><div class="state">${S4.selectHub}</div></div>`;
    }
    if (this.blockedTitle && this.blockedMessage) {
      return this._renderGuard("mdi:lan-disconnect", this.blockedTitle, this.blockedMessage);
    }
    if (this._stage === "needs_refresh") {
      return this._renderNeedsRefresh();
    }
    if (this._stage === "syncing") {
      return this._renderSyncing();
    }
    if (this._stage === "deleting") {
      return this._renderDeleting();
    }
    if (this._stage === "sync_failed") {
      return this._renderSyncFailed();
    }
    if (this._stage === "editing" && this._baseline && this._working && this._entityId != null) {
      return this._renderEditing();
    }
    if (this._stage === "capturing") {
      return this._renderCapturing();
    }
    return this._renderIdle();
  }
  _renderGuard(icon, title, sub) {
    return b2`
      <div class="tab-panel">
        <div class="guard-state">
          <div class="guard-icon"><ha-icon icon=${icon}></ha-icon></div>
          <div class="guard-title">${title}</div>
          <div class="guard-sub">${sub}</div>
        </div>
      </div>
    `;
  }
  // Idle stage: capture hasn't started yet (guards active) or the session is
  // closing. Guard panels (§4.1) render full-panel, in priority order;
  // otherwise _maybeAutoOpen is about to kick off the capture.
  _renderIdle() {
    if (this.selectedHubProxyConnected) {
      return this._renderGuard("mdi:cellphone-link", S4.appConnectedTitle, S4.appConnectedBody);
    }
    if (this._isProgressRunning(this.hub?.active_backup_operation ?? null)) {
      return this._renderGuard("mdi:progress-clock", S4.operationRunningTitle, S4.operationRunningBody);
    }
    return b2`
      <div class="tab-panel">
        <div class="guard-state">
          <div class="guard-icon"><ha-icon icon="mdi:database-arrow-down-outline"></ha-icon></div>
          <div class="guard-sub">${S4.capturingFromCache(this.kind)}</div>
        </div>
      </div>
    `;
  }
  _renderCapturing() {
    if (this._captureError) {
      return b2`
        <div class="tab-panel">
          <div class="capture-error">
            <div class="guard-icon"><ha-icon icon="mdi:alert-circle-outline"></ha-icon></div>
            <div class="capture-error-title">${S4.captureFailedTitle}</div>
            <div class="guard-sub">${this._captureError}</div>
            <div class="action-row">
              <button class="btn btn-primary" @click=${this._reloadFromHub}>${S4.retry}</button>
              <button class="btn" @click=${() => this._resetToList()}>${S4.back}</button>
            </div>
          </div>
        </div>
      `;
    }
    return b2`
      <div class="tab-panel">
        <div class="guard-state">
          <div class="guard-icon"><ha-icon icon="mdi:database-arrow-down-outline"></ha-icon></div>
          <div class="guard-sub">${S4.capturingFromCache(this.kind)}</div>
        </div>
      </div>
    `;
  }
  _renderNeedsRefresh() {
    const S5 = TOOLS_CARD_STRINGS.activities;
    return b2`
      <div class="tab-panel">
        <div class="capture-error">
          <div class="guard-icon"><ha-icon icon="mdi:database-refresh-outline"></ha-icon></div>
          <div class="capture-error-title">${S5.needsRefreshTitle}</div>
          <div class="guard-sub">${S5.needsRefreshBody(this.kind)}</div>
          <div class="action-row">
            <sofabaton-refresh-cache-button
              .hass=${this.hass}
              .entryId=${this.hub?.entry_id ?? ""}
              .runRefresh=${this.startRefreshAll ?? null}
              @refreshed=${() => {
      if (this._entityId != null) void this._startCapture(this._entityId);
    }}
            ></sofabaton-refresh-cache-button>
            <button class="btn" @click=${() => this._resetToList()}>${S5.back}</button>
          </div>
        </div>
      </div>
    `;
  }
  _renderEditing() {
    return b2`
      <div class="editing-shell">
        ${this._deleteError ? this._renderDeleteErrorBanner() : A}
        <sofabaton-edit-detail-view
          .bundle=${this._working}
          .kind=${this.kind}
          .entityId=${this._entityId}
          .dirty=${this._dirty}
          mode="live"
          .fetchCommandPayload=${this._fetchCommandPayload}
          .testCommandPayload=${this._testCommandPayload}
          @bundle-change=${this._handleBundleChange}
          @sync-request=${this._requestSync}
          @delete-request=${this._handleDeleteRequest}
          @close=${this._closeEditor}
        ></sofabaton-edit-detail-view>
        ${this._exitConfirmOpen ? this._renderExitConfirmDialog() : A}
      </div>
    `;
  }
  _renderSyncing() {
    const S5 = TOOLS_CARD_STRINGS.activities;
    const progress = this._syncProgress;
    const message = String(progress?.message || S5.syncingMessage);
    return b2`
      <div class="tab-panel">
        ${renderOperationProgress({ mode: "restore", title: S5.syncingTitle, message })}
      </div>
    `;
  }
  _renderDeleting() {
    const S5 = TOOLS_CARD_STRINGS.activities;
    return b2`
      <div class="tab-panel">
        ${renderOperationProgress({ mode: "restore", title: S5.deletingTitle(this.kind), message: S5.deletingMessage(this.kind) })}
      </div>
    `;
  }
  _renderDeleteErrorBanner() {
    return b2`
      <div class="notice-banner delete-error-banner">
        <span class="notice-banner-text"><ha-icon icon="mdi:alert-circle-outline"></ha-icon> ${this._deleteError}</span>
        <button class="notice-banner-btn" @click=${() => {
      this._deleteError = null;
    }}>${TOOLS_CARD_STRINGS.activities.discardConfirmCancel}</button>
      </div>
    `;
  }
  _renderSyncFailed() {
    const S5 = TOOLS_CARD_STRINGS.activities;
    const isStale = this._syncFailedAt === "stale_check";
    return b2`
      <div class="tab-panel">
        <div class="capture-error">
          <div class="guard-icon"><ha-icon icon=${isStale ? "mdi:sync-alert" : "mdi:alert-circle-outline"}></ha-icon></div>
          <div class="capture-error-title">${isStale ? S5.syncStaleTitle(this.kind) : S5.syncFailedTitle}</div>
          <div class="guard-sub">
            ${isStale ? S5.syncStaleBody(this.kind) : this._syncError || S5.syncFailedStep(String(this._syncFailedAt || ""))}
          </div>
          <div class="action-row">
            ${isStale ? A : b2`<button class="btn btn-primary" @click=${this._retrySync}>${S5.syncRetry}</button>`}
            <sofabaton-refresh-cache-button
              .hass=${this.hass}
              .entryId=${this.hub?.entry_id ?? ""}
              .runRefresh=${this.startRefreshAll ?? null}
              .label=${S5.syncReload}
              @refreshed=${() => {
      if (this._entityId != null) void this._startCapture(this._entityId);
    }}
            ></sofabaton-refresh-cache-button>
            <button class="btn" @click=${() => {
      this._stage = "editing";
      this._syncError = null;
      this._syncFailedAt = null;
    }}>${S5.syncKeepEditing}</button>
          </div>
        </div>
      </div>
    `;
  }
  _renderExitConfirmDialog() {
    const S5 = TOOLS_CARD_STRINGS.activities;
    return b2`
      <div class="modal-backdrop" @click=${this._closeExitConfirm}>
        <div class="dialog dialog--small" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">${S5.exitUnsyncedTitle}</div>
            <button class="dialog-close" @click=${this._closeExitConfirm}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body"><div class="dialog-text">${S5.exitUnsyncedBody(this.kind)}</div></div>
          <div class="dialog-footer">
            <button class="btn btn-danger" @click=${this._leaveWithoutSync}>${S5.exitWithoutSync}</button>
            <div class="dialog-footer-actions">
              <button class="btn" @click=${this._closeExitConfirm}>${S5.discardConfirmCancel}</button>
              <button class="btn btn-primary" @click=${this._syncAndLeave}>${S5.exitSyncNow}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
};
SofabatonActivitiesTab.properties = {
  hass: { attribute: false },
  hub: { attribute: false },
  refreshControlPanelState: { attribute: false },
  startRefreshAll: { attribute: false },
  kind: { type: String },
  entityId: { type: Number },
  loading: { type: Boolean },
  error: { type: String },
  blockedTitle: { type: String },
  blockedMessage: { type: String },
  selectedHubProxyConnected: { type: Boolean },
  _stage: { state: true },
  _entityId: { state: true },
  _baseline: { state: true },
  _working: { state: true },
  _captureProgress: { state: true },
  _captureError: { state: true },
  _dirty: { state: true },
  _deleteError: { state: true },
  _exitConfirmOpen: { state: true },
  _syncProgress: { state: true },
  _syncError: { state: true },
  _syncFailedAt: { state: true }
};
SofabatonActivitiesTab.styles = [operationProgressStyles, i`
    :host {
      display: flex;
      flex: 1;
      min-height: 0;
      flex-direction: column;
    }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow: hidden; }
    .tab-panel--flush { padding: 0; }
    .state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
    .state.error { color: var(--error-color, #db4437); }
    .guard-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 10px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.6;
    }
    .guard-icon { color: var(--secondary-text-color); }
    .guard-icon ha-icon { --mdc-icon-size: 40px; }
    .guard-title { color: var(--primary-text-color); font-size: 16px; font-weight: 700; }
    .guard-sub { max-width: 360px; font-size: 13px; }
    .capture-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      padding: 24px 16px;
      text-align: center;
      color: var(--secondary-text-color);
      line-height: 1.55;
    }
    .capture-error-title { color: var(--primary-text-color); font-size: 16px; font-weight: 700; }
    .action-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
    .btn {
      border: 1px solid var(--divider-color);
      border-radius: calc(var(--ha-card-border-radius, 12px) * 0.85);
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: 700;
      padding: 8px 14px;
      cursor: pointer;
    }
    .btn:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .editing-shell { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    .editing-shell sofabaton-edit-detail-view { flex: 1; min-height: 0; display: flex; }
    .notice-banner {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--divider-color);
      background: color-mix(in srgb, var(--primary-color) 8%, var(--ha-card-background, var(--card-background-color)));
      color: var(--primary-text-color);
      font-size: 13px;
    }
    .notice-banner-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .notice-banner-btn {
      flex: 0 0 auto;
      border: 1px solid var(--divider-color);
      border-radius: 999px;
      background: transparent;
      color: var(--primary-color);
      font: inherit;
      font-weight: 700;
      padding: 4px 12px;
      cursor: pointer;
    }
    .notice-banner-btn:hover { border-color: var(--primary-color); }
    .delete-error-banner { background: color-mix(in srgb, var(--error-color, #db4437) 12%, var(--ha-card-background, var(--card-background-color))); }
    .delete-error-banner .notice-banner-text { display: inline-flex; align-items: center; gap: 6px; color: var(--error-color, #db4437); }
    .delete-error-banner ha-icon { --mdc-icon-size: 18px; }
    .btn-danger { border-color: color-mix(in srgb, var(--error-color, #db4437) 55%, var(--divider-color)); color: var(--error-color, #db4437); }
    .btn-danger:hover { border-color: var(--error-color, #db4437); background: color-mix(in srgb, var(--error-color, #db4437) 12%, transparent); }
    /* Review / discard / sync dialogs (§4.4). */
    .modal-backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
    .dialog {
      width: min(640px, calc(100vw - 36px));
      max-height: min(82vh, 820px);
      display: flex;
      flex-direction: column;
      border-radius: calc(var(--ha-card-border-radius, 12px) * 1.33);
      border: 1px solid var(--divider-color);
      background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
      box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28));
      overflow: hidden;
    }
    .dialog--small { width: min(460px, calc(100vw - 36px)); }
    .dialog-header, .dialog-footer { display: flex; align-items: center; gap: 12px; padding: 14px 16px; }
    .dialog-header { border-bottom: 1px solid var(--divider-color); }
    .dialog-title { font-size: 16px; font-weight: 700; flex: 1; color: var(--primary-text-color); }
    .dialog-close {
      width: 34px; height: 34px; display: inline-flex; align-items: center; justify-content: center;
      border: 1px solid var(--divider-color); border-radius: calc(var(--ha-card-border-radius, 12px) * 0.7);
      background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); cursor: pointer;
    }
    .dialog-close:hover { border-color: var(--primary-color); color: var(--primary-text-color); }
    .dialog-body { padding: 16px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
    .dialog-text { font-size: 14px; line-height: 1.55; color: var(--primary-text-color); }
    .dialog-footer { border-top: 1px solid var(--divider-color); justify-content: space-between; }
    .dialog-footer-actions { display: flex; gap: 8px; }
    .review-group { display: flex; flex-direction: column; gap: 6px; }
    .review-group-title {
      font-size: 11px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--secondary-text-color);
    }
    .review-entry-list { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; }
    .review-entry { font-size: 13.5px; line-height: 1.5; color: var(--primary-text-color); }
    .review-global-note { color: var(--secondary-text-color); font-style: italic; margin-left: 6px; }
    .review-empty { font-size: 14px; color: var(--secondary-text-color); }
    @media (max-width: 640px) {
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog--small { width: 100%; max-height: 100%; border-radius: 0; }
    }
  `];
if (!customElements.get("sofabaton-activities-tab")) {
  customElements.define("sofabaton-activities-tab", SofabatonActivitiesTab);
}

// custom_components/sofabaton_x1s/www/src/tools-card.ts
var TOOLS_TYPE = "sofabaton-control-panel";
var LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;
var EDITOR_TYPE = `${TOOLS_TYPE}-editor`;
function resolveLoadedToolsFrontendVersion() {
  const version = new URL(import.meta.url, window.location.href).searchParams.get("v");
  return String(version || "").trim() || "dev";
}
var LOADED_TOOLS_FRONTEND_VERSION = resolveLoadedToolsFrontendVersion();
var TOOLS_VERSION = LOADED_TOOLS_FRONTEND_VERSION;
var DOC_LINKS = {
  wifi_commands: {
    href: TOOLS_CARD_STRINGS.docs.wifiCommandsUrl,
    label: TOOLS_CARD_STRINGS.tabDocs.wifi_commands
  },
  backup: {
    href: TOOLS_CARD_STRINGS.docs.backupUrl,
    label: TOOLS_CARD_STRINGS.tabDocs.backup
  }
};
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
var previewStyles = i`
  .sb-preview {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    box-sizing: border-box;
  }
  .sb-preview-header {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .sb-preview-logo {
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    color: var(--primary-color);
  }
  .sb-preview-hub {
    width: 52px;
    height: auto;
  }
  .sb-preview-sub {
    font-size: 12px;
    line-height: 1.35;
    color: var(--secondary-text-color);
  }
  .sb-preview-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
  .sb-preview-chip {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
    color: var(--primary-text-color);
    font-size: 12.5px;
    font-weight: 500;
    min-width: 0;
  }
  .sb-preview-chip ha-icon {
    flex: 0 0 auto;
    color: var(--primary-color);
    --mdc-icon-size: 18px;
  }
  .sb-preview-chip span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;
var _SofabatonControlPanelCard = class _SofabatonControlPanelCard extends i4 {
  constructor() {
    super();
    this._config = {};
    this._preview = false;
    this._hubPickerOpen = false;
    this._toolsMenuOpen = false;
    this._lastRenderedTab = null;
    // Entity currently open in the live editor (wrench buttons in the Hub
    // tab); while set, the Hub tab renders the editor instead of the cache.
    this._editingEntity = null;
    // Activity re-order mode ("Change order" under the Activities list).
    this._reorderMode = false;
    this._reorderIds = [];
    this._reorderSyncing = false;
    this._reorderError = null;
    // "Add Activity" dialog state.
    this._addActivityOpen = false;
    this._addActivityBusy = false;
    this._addActivityError = null;
    this._irFlashClearTimer = null;
    this._irFlashClearForReceivedAt = null;
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
  setConfig(config) {
    this._config = config || {};
    const hub = typeof this._config.hub === "string" ? this._config.hub.trim() : "";
    this._store.setPreferredHub(hub || null);
  }
  set hass(value) {
    this._store.setHass(value);
  }
  // HA's hui-card sets `element.preview = true` when rendering inside the card
  // picker / editor preview. Render a compact branded summary instead of the
  // full interactive panel, and don't open live backend subscriptions.
  set preview(value) {
    const next = Boolean(value);
    if (next === this._preview) return;
    this._preview = next;
    if (next) {
      this._store.disconnected();
    } else if (this.isConnected) {
      this._store.connected();
    }
    this.requestUpdate();
  }
  get preview() {
    return this._preview;
  }
  getCardSize() {
    return this._preview ? 3 : 8;
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
    if (!this._preview) this._store.connected();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._store.disconnected();
    document.removeEventListener("pointerdown", this._boundHandleDocumentPointerDown, true);
    this._hubPickerOpen = false;
    this._toolsMenuOpen = false;
    if (this._irFlashClearTimer) {
      clearTimeout(this._irFlashClearTimer);
      this._irFlashClearTimer = null;
      this._irFlashClearForReceivedAt = null;
    }
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
    if (tabId !== "cache") {
      this._editingEntity = null;
      this.resetActivityListInteractions();
    }
    this._store.selectTab(tabId);
  }
  // Drops re-order mode and the Add Activity dialog (tab switch, hub switch).
  resetActivityListInteractions() {
    this._reorderMode = false;
    this._reorderIds = [];
    this._reorderSyncing = false;
    this._reorderError = null;
    this._addActivityOpen = false;
    this._addActivityBusy = false;
    this._addActivityError = null;
  }
  // ── Activity re-order mode ─────────────────────────────────────────
  startReorder() {
    if (this._reorderMode) return;
    const openEntity = this._snapshot.openEntity;
    if (openEntity) this._store.toggleEntity(openEntity);
    const cacheHub = selectedHubCache(this._snapshot);
    this._reorderIds = hubActivities(cacheHub).map((activity) => Number(activity.id));
    this._reorderMode = true;
    this._reorderSyncing = false;
    this._reorderError = null;
    this.requestUpdate();
  }
  cancelReorder() {
    if (this._reorderSyncing) return;
    this.resetActivityListInteractions();
    this.requestUpdate();
  }
  moveReorderItem(oldIndex, newIndex) {
    const ids = [...this._reorderIds];
    if (oldIndex < 0 || oldIndex >= ids.length || newIndex < 0 || newIndex >= ids.length) return;
    const [moved] = ids.splice(oldIndex, 1);
    ids.splice(newIndex, 0, moved);
    this._reorderIds = ids;
    this.requestUpdate();
  }
  async syncReorder() {
    if (!this._reorderMode || this._reorderSyncing) return;
    this._reorderSyncing = true;
    this._reorderError = null;
    this.requestUpdate();
    const failure = await this._store.reorderActivities(this._reorderIds);
    this._reorderSyncing = false;
    if (failure) {
      this._reorderError = failure;
    } else {
      this.resetActivityListInteractions();
    }
    this.requestUpdate();
  }
  // ── Add Activity flow (name prompt → live editor) ──────────────────
  openAddActivity() {
    this._addActivityOpen = true;
    this._addActivityBusy = false;
    this._addActivityError = null;
    this.requestUpdate();
  }
  closeAddActivity() {
    if (this._addActivityBusy) return;
    this._addActivityOpen = false;
    this._addActivityError = null;
    this.requestUpdate();
  }
  async confirmAddActivity(name) {
    if (this._addActivityBusy) return;
    this._addActivityBusy = true;
    this._addActivityError = null;
    this.requestUpdate();
    const result = await this._store.createActivity(name);
    this._addActivityBusy = false;
    if ("error" in result) {
      this._addActivityError = result.error;
      this.requestUpdate();
      return;
    }
    this._addActivityOpen = false;
    this._editingEntity = { kind: "activity", id: result.activityId };
    this.requestUpdate();
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
    return b2`
      <div class="dock-pill-pair" role="group" aria-label="Connectivity">
        <span class="dock-pill-half ${connected ? "dock-pill-half--hub-on" : "dock-pill-half--hub-off"}">HUB</span>
        <span class="dock-pill-half ${proxyOn ? "dock-pill-half--app-on" : "dock-pill-half--app-off"}">APP</span>
      </div>
    `;
  }
  renderBrandLabel() {
    const version = String(this._snapshot.toolsFrontendVersionExpected ?? this._snapshot.toolsFrontendVersionLoaded ?? "").trim() || "unknown";
    return b2`<div class="card-brand">SOFABATON CONTROL PANEL - v${version}</div>`;
  }
  renderBottomDock(hub) {
    const runtimeState = resolveRuntimeState(this._snapshot);
    const docLink = runtimeState ? null : DOC_LINKS[this._snapshot.selectedTab] ?? null;
    const statusText = runtimeState ? runtimeState.detail || runtimeState.label : null;
    const progressPercent = runtimeState?.kind === "operation_running" ? runtimeState.progress.percent : null;
    const dockClass = runtimeState?.kind === "completion" ? `card-bottom-dock card-bottom-dock--${runtimeState.tone}` : "card-bottom-dock";
    const irFlash = this._activeIrFlash(hub?.entry_id ?? null);
    return b2`
      <div class=${dockClass}>
        ${runtimeState?.kind === "operation_running" ? b2`
              <div
                class="card-bottom-dock-progress-line"
                data-indeterminate=${runtimeState.progress.indeterminate ? "true" : "false"}
                style=${runtimeState.progress.indeterminate || progressPercent == null ? "width: 35%" : `width:${progressPercent}%`}
              ></div>
            ` : null}
        ${irFlash ? i6(
      irFlash.receivedAt,
      b2`
                <div
                  class="card-bottom-dock-ir-flash"
                  title=${this._irFlashTitle(irFlash)}
                  aria-hidden="true"
                ></div>
              `
    ) : A}
        <div class="card-bottom-dock-center">
          ${runtimeState ? b2`<span class="card-bottom-dock-status">${statusText}</span>` : docLink ? b2`<a class="card-bottom-dock-link" href=${docLink.href} target="_blank" rel="noreferrer noopener">${docLink.label}</a>` : A}
        </div>
        <div class="card-bottom-dock-right">
          ${this.renderConnectivityPill(hub)}
        </div>
      </div>
    `;
  }
  _activeIrFlash(selectedEntryId) {
    const press = this._snapshot.lastWifiPress;
    if (!press || !selectedEntryId || press.entryId !== selectedEntryId) return null;
    const elapsed = Date.now() - press.receivedAt;
    if (elapsed < 0 || elapsed >= _SofabatonControlPanelCard._IR_FLASH_DURATION_MS) return null;
    if (this._irFlashClearForReceivedAt !== press.receivedAt) {
      if (this._irFlashClearTimer) clearTimeout(this._irFlashClearTimer);
      this._irFlashClearForReceivedAt = press.receivedAt;
      this._irFlashClearTimer = setTimeout(() => {
        this._irFlashClearTimer = null;
        this._irFlashClearForReceivedAt = null;
        this.requestUpdate();
      }, _SofabatonControlPanelCard._IR_FLASH_DURATION_MS - elapsed + 16);
    }
    return press;
  }
  _irFlashTitle(press) {
    const device = press.deviceName?.trim() || "Wifi device";
    const command = press.commandLabel?.trim() || "Wifi command";
    return press.pressType === "long" ? `${device} \u2022 ${command} (long press)` : `${device} \u2022 ${command}`;
  }
  renderBackendUnavailable(height) {
    return b2`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-body">
            <div class="backend-unavailable-state">
              <div class="backend-unavailable-icon"><ha-icon icon="mdi:cloud-off-outline"></ha-icon></div>
              <div class="backend-unavailable-title">Backend not available</div>
              <div class="backend-unavailable-copy">
                Waiting for the Sofabaton X integration to finish starting…
              </div>
            </div>
          </div>
        </div>
      </ha-card>
    `;
  }
  renderVersionMismatch(height) {
    return b2`
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
    return b2`
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
  renderPreview() {
    const features = [
      { icon: "mdi:database-outline", label: TOOLS_CARD_STRINGS.tabs.cache },
      { icon: "mdi:wifi", label: TOOLS_CARD_STRINGS.tabs.wifiCommands },
      { icon: "mdi:cloud-upload-outline", label: TOOLS_CARD_STRINGS.tabs.backup },
      { icon: "mdi:cog-outline", label: TOOLS_CARD_STRINGS.tabs.settings },
      { icon: "mdi:text-box-outline", label: TOOLS_CARD_STRINGS.tabs.logs }
    ];
    return b2`
      <ha-card>
        <div class="sb-preview">
          <div class="sb-preview-header">
            <div class="sb-preview-logo">${hubIcon("hero", "sb-preview-hub")}</div>
            <div class="sb-preview-sub">
              Tools, cache, backups, logs &amp; Wi-Fi commands for your hub
            </div>
          </div>
          <div class="sb-preview-grid">
            ${features.map(
      (feature) => b2`
                <div class="sb-preview-chip">
                  <ha-icon icon=${feature.icon}></ha-icon>
                  <span>${feature.label}</span>
                </div>
              `
    )}
          </div>
        </div>
      </ha-card>
    `;
  }
  render() {
    if (this._preview) return this.renderPreview();
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
    const hubEntryId = hub?.entry_id ?? null;
    const hubRefreshing = hubRefreshBusy(this._snapshot, hubEntryId);
    const hubExternalLabel = hubExternalCommandLabel(this._snapshot, hubEntryId);
    const sharedHubCommandBusy = Boolean(
      runtimeOperationBusy || hubRefreshing || hubExternalLabel !== null || this._snapshot.pendingActionKey
    );
    const sharedHubCommandLabel = (runtimeOperationBusy ? runtimeState.detail || runtimeState.label : null) || hubExternalLabel || (hubRefreshing ? "Refreshing cache\u2026" : null) || (this._snapshot.pendingActionKey ? "Hub command in progress\u2026" : null);
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
      activeTab = b2`
        <sofabaton-wifi-commands-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .blockedTitle=${availability.kind === "blocked" ? availability.title : null}
          .blockedMessage=${availability.kind === "blocked" ? availability.message : null}
          .hub=${hub}
          .hass=${this._snapshot.hass}
          .hubCommandBusy=${sharedHubCommandBusy}
          .hubCommandBusyLabel=${sharedHubCommandLabel}
          .lastWifiPress=${this._snapshot.lastWifiPress}
          .setHubCommandBusy=${(busy, label, entryId) => this._store.setExternalHubCommandBusy(busy, label ?? null, entryId ?? null)}
          .refreshControlPanelState=${() => this._store.loadControlPanelState()}
        ></sofabaton-wifi-commands-tab>
      `;
    } else if (this._snapshot.selectedTab === "backup") {
      const availability = resolveTabAvailability(this._snapshot, "backup");
      activeTab = b2`
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
          .setHubCommandBusy=${(busy, label, entryId) => this._store.setExternalHubCommandBusy(busy, label ?? null, entryId ?? null)}
          .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
        ></sofabaton-backup-tab>
      `;
    } else if (this._snapshot.selectedTab === "cache") {
      if (this._editingEntity != null) {
        activeTab = b2`
          <sofabaton-activities-tab
            .loading=${this._snapshot.loading}
            .error=${this._snapshot.loadError}
            .hub=${hub}
            .hass=${this._snapshot.hass}
            .kind=${this._editingEntity.kind}
            .entityId=${this._editingEntity.id}
            .selectedHubProxyConnected=${proxyClientConnected(this._snapshot.hass, hub)}
            .refreshControlPanelState=${() => this._store.loadState({ silent: true })}
            .startRefreshAll=${() => this._store.refreshAllForHub()}
            @editor-exit=${() => {
          this._editingEntity = null;
          this.requestUpdate();
        }}
          ></sofabaton-activities-tab>
        `;
      } else {
        activeTab = renderCacheTab({
          loading: this._snapshot.loading,
          error: this._snapshot.loadError,
          hub: cacheHub,
          persistentCacheEnabled: cacheEnabled,
          staleData: this._snapshot.staleData,
          refreshBusy: hubRefreshing,
          hubCommandBusy: sharedHubCommandBusy,
          activeRefreshLabel: hubActiveRefreshLabel(this._snapshot, hubEntryId),
          selectedSection: this._snapshot.selectedCacheSection,
          openEntity: this._snapshot.openEntity,
          selectedHubProxyConnected: proxyClientConnected(this._snapshot.hass, hub),
          enablingPersistentCache: this._snapshot.pendingSettingKey === "persistent_cache",
          onEnablePersistentCache: () => this.handleSettingToggle("persistent_cache", true),
          onRefreshStale: () => void this._store.refreshStale(),
          onSelectSection: (sectionId) => this._store.selectCacheSection(sectionId),
          onToggleEntity: (key) => this._store.toggleEntity(key),
          onRefreshSection: (sectionId) => void this._store.refreshSection(sectionId),
          onRefreshEntry: (kind, targetId, key) => void this._store.refreshForHub(kind, targetId, key),
          refreshAllSpinning: hubActiveRefreshLabel(this._snapshot, hubEntryId) === REFRESH_ALL_KEY,
          onRefreshAll: () => void this._store.refreshAllForHub(),
          onEditActivity: (activityId) => {
            this._editingEntity = { kind: "activity", id: activityId };
            this.requestUpdate();
          },
          onEditDevice: (deviceId) => {
            this._editingEntity = { kind: "device", id: deviceId };
            this.requestUpdate();
          },
          reorderMode: this._reorderMode,
          reorderIds: this._reorderIds,
          reorderSyncing: this._reorderSyncing,
          reorderError: this._reorderError,
          onStartReorder: () => this.startReorder(),
          onCancelReorder: () => this.cancelReorder(),
          onReorderMove: (oldIndex, newIndex) => this.moveReorderItem(oldIndex, newIndex),
          onSyncReorder: () => void this.syncReorder(),
          addActivityOpen: this._addActivityOpen,
          addActivityBusy: this._addActivityBusy,
          addActivityError: this._addActivityError,
          onOpenAddActivity: () => this.openAddActivity(),
          onCloseAddActivity: () => this.closeAddActivity(),
          onConfirmAddActivity: (name) => void this.confirmAddActivity(name)
        });
      }
    }
    return b2`
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
        if (entryId !== this._snapshot.selectedHubEntryId) {
          this._editingEntity = null;
        }
        this.resetActivityListInteractions();
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
          ${selectedHubConnected ? b2`<div class="card-body">${activeTab}</div>` : this.renderHubUnavailable()}
          ${this.renderBottomDock(hub)}
        </div>
      </ha-card>
    `;
  }
};
_SofabatonControlPanelCard.styles = [cardStyles, previewStyles];
// Match the dockIrFlash / dockIrIcon keyframes (720ms). After this we
// drop the overlay nodes so they don't sit in the DOM forever and so
// the next animation cleanly restarts via Lit's keyed remount.
_SofabatonControlPanelCard._IR_FLASH_DURATION_MS = 720;
var SofabatonControlPanelCard = _SofabatonControlPanelCard;
var SofabatonControlPanelEditor = class extends HTMLElement {
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
var SOFABATON_PLATFORMS = /* @__PURE__ */ new Set(["sofabaton_x1s", "sofabaton_hub"]);
var TOOLS_CONTROL_TRANSLATION_KEYS = /* @__PURE__ */ new Set([
  "proxy",
  "hex_logging",
  "wifi_device",
  "find_remote",
  "resync_remote",
  "ip_commands",
  "client",
  "hub_connected"
]);
window.customCards = window.customCards || [];
if (!window.customCards.some((c4) => c4.type === TOOLS_TYPE)) {
  window.customCards.push({
    type: TOOLS_TYPE,
    name: "Sofabaton Control Panel",
    description: "A control panel for Sofabaton hub tools, cache, logs, settings, and Wi-Fi commands.",
    // No `preview: true`: the "By card" grid renders the *real* card (squished),
    // not renderPreview() — it only honours `preview` in the by-entity flow.
    // Card picker (HA 2026.6+): recommend this card for the hub-control
    // entities, pre-selecting the hub the entity belongs to.
    getEntitySuggestion: (hass, entityId) => {
      const entry = hass?.entities?.[entityId];
      if (!entry) return null;
      if (!SOFABATON_PLATFORMS.has(String(entry.platform || ""))) return null;
      if (!TOOLS_CONTROL_TRANSLATION_KEYS.has(String(entry.translation_key || "")))
        return null;
      const config = { type: `custom:${TOOLS_TYPE}` };
      const device = entry.device_id ? hass?.devices?.[entry.device_id] : void 0;
      const hubEntryId = device?.primary_config_entry || device?.config_entries?.[0] || null;
      if (hubEntryId) config.hub = hubEntryId;
      return { config };
    }
  });
}
