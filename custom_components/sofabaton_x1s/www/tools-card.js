// ../node_modules/@lit/reactive-element/css-tag.js
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

// ../node_modules/@lit/reactive-element/reactive-element.js
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

// ../node_modules/lit-html/lit-html.js
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

// ../node_modules/lit-element/lit-element.js
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

// custom_components/sofabaton_x1s/www/src/shared/styles/card-styles.ts
var cardStyles = i`
  :host { display: block; }
  *, *::before, *::after { box-sizing: border-box; }
  .card-inner { height: var(--tools-card-height, 600px); display: flex; flex-direction: column; overflow: hidden; border-radius: var(--ha-card-border-radius, 12px); }
  .card-header { flex-shrink: 0; min-height: 52px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px 8px; }
  .card-title { font-size: 16px; font-weight: 700; }
  .card-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; }
  .tab-panel.scrollable, .acc-body, .logs-console { overflow-y: auto; }
  .hub-picker-btn { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--divider-color); border-radius: 999px; padding: 4px 10px; background: var(--secondary-background-color, var(--ha-card-background)); cursor: pointer; font-family: inherit; color: var(--primary-text-color); flex-shrink: 0; }
  .chip-label { font-size: 10px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--secondary-text-color); }
  .chip-name { font-size: 13px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chip-arrow { font-size: 10px; color: var(--secondary-text-color); }
  .hub-picker-dialog { position: fixed; margin: 0; padding: 0; border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--card-background-color, var(--ha-card-background, white)); color: var(--primary-text-color); box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18); min-width: 160px; overflow: hidden; }
  .hub-picker-dialog::backdrop { background: transparent; }
  .hub-option { padding: 9px 14px; font-size: 13px; cursor: pointer; }
  .hub-option.selected { font-weight: 600; color: var(--primary-color); }
  .tabs { flex-shrink: 0; display: flex; gap: 2px; padding: 0 16px; border-bottom: 1px solid var(--divider-color); }
  .tab-btn { position: relative; border: none; border-bottom: 3px solid transparent; background: transparent; color: var(--secondary-text-color); font: inherit; font-size: 14px; font-weight: 700; padding: 12px 16px 11px; cursor: pointer; }
  .tab-btn--push-right { margin-left: auto; }
  .tab-btn.active { color: var(--primary-color); border-bottom-color: var(--primary-color); }
  .tab-btn.tab-disabled { color: var(--disabled-text-color, var(--secondary-text-color)); opacity: 0.45; cursor: default; }
  .logs-panel { gap: 10px; }
  .logs-header, .hub-hero { display: grid; }
  .logs-header { gap: 4px; }
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
  .hub-badges { display: flex; gap: 10px; flex-wrap: wrap; padding: 8px 0 12px; }
  .hub-conn-badge, .hub-proxy-badge { display: inline-flex; align-items: center; gap: 9px; min-height: 38px; padding: 0 14px 0 12px; border-radius: 999px; border: 1px solid var(--divider-color); font-size: 13px; font-weight: 700; }
  .hub-conn-badge::before, .hub-proxy-badge::before { content: ""; width: 9px; height: 9px; border-radius: 50%; background: currentColor; }
  .hub-conn-badge--on { color: #48b851; border-color: color-mix(in srgb, #48b851 45%, var(--divider-color)); }
  .hub-proxy-badge--on { color: #67b7ff; border-color: color-mix(in srgb, #67b7ff 42%, var(--divider-color)); }
  .hub-info-list { border: 1px solid color-mix(in srgb, var(--primary-text-color) 14%, var(--divider-color)); border-radius: calc(var(--ha-card-border-radius, 12px) + 4px); overflow: hidden; }
  .hub-row { min-height: 58px; display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 0 16px; border-top: 1px solid color-mix(in srgb, var(--primary-text-color) 10%, var(--divider-color)); }
  .hub-row:first-child { border-top: none; }
  .hub-row-icon-svg { width: 22px; height: 22px; }
  .hub-row-value, .setting-title, .entity-name, .cache-state-title { color: var(--primary-text-color); }
  .hub-row-label { font-size: 13px; font-weight: 700; color: color-mix(in srgb, var(--primary-text-color) 88%, var(--secondary-text-color)); }
  .hub-row-value { font-size: 13px; font-weight: 700; text-align: right; word-break: break-word; }
  .setting-title { font-size: 14px; font-weight: 700; }
  .settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .setting-tile { min-height: 132px; padding: 16px; display: flex; flex-direction: column; gap: 12px; border: 1px solid var(--divider-color); border-radius: calc(var(--ha-card-border-radius, 12px) + 2px); background: linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 92%, white), var(--card-background-color, #fff)); box-shadow: 0 1px 0 rgba(0, 0, 0, 0.02); }
  .setting-tile.toggle, .setting-tile.action { cursor: pointer; transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease; }
  .setting-tile.toggle:hover, .setting-tile.action:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06); transform: translateY(-1px); }
  .setting-tile.toggle:active, .setting-tile.action:active, .setting-tile.pressed { border-color: color-mix(in srgb, var(--primary-color) 70%, var(--divider-color)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary-color) 25%, transparent); transform: translateY(0); background: linear-gradient(180deg, color-mix(in srgb, var(--card-background-color, #fff) 84%, var(--primary-color)), color-mix(in srgb, var(--card-background-color, #fff) 92%, var(--primary-color))); }
  .setting-tile.disabled { opacity: 0.55; cursor: default; box-shadow: none; transform: none; }
  .setting-tile-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .setting-description { font-size: 13px; line-height: 1.45; color: var(--secondary-text-color); }
  .setting-icon { font-size: 22px; line-height: 1; }
  .cache-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; margin: -16px; }
  .accordion-section { display: flex; flex-direction: column; min-height: 0; border-top: 1px solid var(--divider-color); }
  .accordion-section:first-child { border-top: none; }
  .accordion-section.open { flex: 1; }
  .acc-header { flex-shrink: 0; height: 44px; display: flex; align-items: center; gap: 8px; padding: 0 16px; cursor: pointer; user-select: none; }
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
  .entity-block { border: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px); background: var(--secondary-background-color, var(--ha-card-background)); overflow-x: clip; }
  .entity-summary { display: flex; align-items: center; gap: 8px; padding: 9px 10px 9px 12px; cursor: pointer; user-select: none; }
  .entity-meta { margin-left: auto; display: inline-flex; align-items: center; gap: 8px; min-width: 0; }
  .entity-name { font-size: 13px; font-weight: 700; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entity-body { display: none; }
  .entity-block.open .entity-body { display: block; }
  .entity-block.open > .entity-summary { position: sticky; top: 0; z-index: 2; background: var(--secondary-background-color, var(--ha-card-background)); border-bottom: 1px solid var(--divider-color); border-radius: var(--ha-card-border-radius, 12px) var(--ha-card-border-radius, 12px) 0 0; }
  .id-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 9px; font-weight: 600; font-family: "SF Mono", "Fira Code", Consolas, monospace; background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); border-radius: calc(var(--ha-card-border-radius, 12px) * 0.4); padding: 2px 5px; flex-shrink: 0; white-space: nowrap; min-width: 68px; justify-content: space-between; }
  .id-badge span:first-child { color: var(--secondary-text-color); opacity: 0.75; }
  .id-badge span:last-child { color: var(--primary-text-color); text-align: right; }
  .entity-count { font-size: 10px; color: var(--secondary-text-color); flex-shrink: 0; white-space: nowrap; }
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
  .stale-banner { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 30%, transparent); }
  .stale-banner-text { flex: 1; }
  .stale-banner-btn { background: none; border: 1px solid var(--divider-color); border-radius: 6px; padding: 4px 10px; font-size: 11px; font-weight: 600; cursor: pointer; color: var(--primary-text-color); }
  @media (max-width: 640px) {
    .settings-grid { grid-template-columns: 1fr; }
    .hub-connection-strip { grid-template-columns: auto minmax(14px, 1fr) auto minmax(14px, 1fr) auto; gap: 6px; padding: 8px 10px; }
    .hub-connection-node { width: 42px; height: 42px; border-radius: 14px; }
    .hub-hero-icon { width: 25px; height: 25px; }
    .hub-ident-name { font-size: 15px; }
  }
`;

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
  return sortById(hub?.activities ?? []);
}
function hubDevices(hub) {
  return sortByName(hub?.devices_list ?? []);
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
    devices: "mdi:remote",
    ip: "mdi:router-wireless",
    version: "mdi:cog-outline"
  }[kind];
  return b2`<ha-icon class=${className.trim()} icon=${icon}></ha-icon>`;
}

// custom_components/sofabaton_x1s/www/src/state/control-panel-store.ts
var INITIAL_SNAPSHOT = {
  hass: null,
  state: null,
  contents: null,
  loading: false,
  loadError: null,
  selectedHubEntryId: null,
  selectedTab: "hub",
  openSection: "activities",
  openEntity: null,
  staleData: false,
  refreshBusy: false,
  activeRefreshLabel: null,
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
var ControlPanelStore = class {
  constructor(onChange) {
    this.onChange = onChange;
    this._snapshot = { ...INITIAL_SNAPSHOT };
    this._loadingStatePromise = null;
    this._pendingLiveStateRefresh = null;
    this._isConnected = false;
    this._refreshGraceUntil = 0;
    this._logsUnsub = null;
    this._logsLoadSeq = 0;
    this._lastObservedGenerations = cacheGenerationSnapshot(null);
    this._lastHassFingerprint = "";
    this._lastConnectionFingerprint = "";
  }
  get snapshot() {
    return this._snapshot;
  }
  connected() {
    this._isConnected = true;
    if (this._snapshot.hass && !this._snapshot.state && !this._loadingStatePromise) {
      void this.loadState();
    }
    if (this._snapshot.selectedTab === "logs") {
      void this.syncLogsFeed();
    }
  }
  disconnected() {
    this._isConnected = false;
    this.unsubscribeLogs();
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
      if (this._isConnected && !this._snapshot.refreshBusy && !this._snapshot.loading && Date.now() > this._refreshGraceUntil && didHubGenerationChange(this._lastObservedGenerations, generationSnapshot)) {
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
      logsScrollBehavior: "auto"
    };
    this.unsubscribeLogs();
    this.emit();
    void this.loadControlPanelState().finally(() => {
      if (this._snapshot.selectedTab === "logs") void this.syncLogsFeed();
    });
  }
  selectTab(tabId) {
    const nextTab = tabId === "cache" && !persistentCacheEnabled(this._snapshot) ? "settings" : tabId;
    this._snapshot = {
      ...this._snapshot,
      selectedTab: nextTab,
      logsStickToBottom: nextTab === "logs" ? true : this._snapshot.logsStickToBottom,
      logsScrollBehavior: nextTab === "logs" ? "auto" : this._snapshot.logsScrollBehavior
    };
    if (nextTab === "logs") void this.syncLogsFeed();
    else this.unsubscribeLogs();
    this.emit();
  }
  toggleSection(sectionId) {
    this._snapshot = {
      ...this._snapshot,
      openSection: this._snapshot.openSection === sectionId ? null : sectionId,
      openEntity: null
    };
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
        this._snapshot = { ...this._snapshot, state, contents, loadError: null };
        this.syncSelection();
      } catch (error) {
        this._snapshot = { ...this._snapshot, loadError: formatError(error) };
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
    const state = await this.api().loadState();
    this._snapshot = { ...this._snapshot, state, loadError: null };
    this.syncSelection();
    this.emit();
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
        if (!enabled && this._snapshot.selectedTab === "cache") {
          this._snapshot = { ...this._snapshot, selectedTab: "settings" };
          await this.loadState();
          return;
        }
        if (enabled) await this.loadCacheContents();
        else await this.loadControlPanelState();
      } else {
        await this.loadControlPanelState();
      }
      if (this._snapshot.selectedTab === "cache" && !persistentCacheEnabled(this._snapshot)) {
        this._snapshot = { ...this._snapshot, selectedTab: "settings" };
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
    if (this._snapshot.refreshBusy) return;
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
    if (this._snapshot.refreshBusy) return;
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
      this.unsubscribeLogs();
      return;
    }
    const entryId = hub.entry_id;
    if (this._snapshot.logsLoadedEntryId !== entryId && !this._snapshot.logsLoading) {
      this._snapshot = { ...this._snapshot, logsStickToBottom: true };
      this.emit();
      void this.loadHubLogs(entryId);
    }
    if (this._snapshot.logsSubscribedEntryId === entryId) return;
    this.unsubscribeLogs();
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: entryId };
    this.emit();
    try {
      const unsubscribe = await this.api().subscribeLogs(entryId, (payload) => {
        if (this._snapshot.logsSubscribedEntryId !== entryId) return;
        this.handleHubLogMessage(entryId, payload);
      });
      if (this._snapshot.logsSubscribedEntryId !== entryId) {
        unsubscribe();
        return;
      }
      this._logsUnsub = unsubscribe;
      await this.loadHubLogs(entryId, { preserveLines: true });
    } catch (error) {
      if (this._snapshot.logsSubscribedEntryId !== entryId) return;
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
      this._snapshot = {
        ...this._snapshot,
        logsError: formatError(error),
        logsLoadedEntryId: entryId
      };
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
  unsubscribeLogs() {
    this._logsUnsub?.();
    this._logsUnsub = null;
    this._snapshot = { ...this._snapshot, logsSubscribedEntryId: null };
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
      return;
    }
    if (!hubs.some((hub) => hub.entry_id === this._snapshot.selectedHubEntryId)) {
      this._snapshot = { ...this._snapshot, selectedHubEntryId: hubs[0].entry_id };
    }
    if (this._snapshot.selectedTab === "cache" && !persistentCacheEnabled(this._snapshot)) {
      this._snapshot = { ...this._snapshot, selectedTab: "settings" };
    }
  }
  api() {
    if (!this._snapshot.hass) throw new Error("Home Assistant context is unavailable");
    return new ControlPanelApi(this._snapshot.hass);
  }
  emit() {
    this.onChange(this._snapshot);
  }
};

// custom_components/sofabaton_x1s/www/src/components/hub-picker.ts
function renderHubPicker(params) {
  if (!params.visible) return null;
  return b2`
    <button class="hub-picker-btn" id="hub-picker-btn" @click=${params.onOpen}>
      <span class="chip-label">Hub</span>
      <span class="chip-name">${params.selectedLabel}</span>
      <span class="chip-arrow">▼</span>
    </button>
    <dialog id="hub-picker-dialog" class="hub-picker-dialog">
      ${params.hubs.map(
    (hub) => b2`
          <div
            class="hub-option${hub.entry_id === params.selectedEntryId ? " selected" : ""}"
            @click=${() => params.onSelect(hub.entry_id)}
          >
            ${hub.name || hub.entry_id}
          </div>
        `
  )}
    </dialog>
  `;
}

// custom_components/sofabaton_x1s/www/src/components/tab-bar.ts
function renderTabBar(params) {
  const tabs = [
    { id: "hub", label: "Hub", disabled: false },
    { id: "settings", label: "Settings", disabled: false },
    { id: "wifi_commands", label: "Wifi Commands", disabled: false },
    { id: "cache", label: "Cache", disabled: !params.persistentCacheEnabled },
    { id: "logs", label: "Logs", disabled: false, pushRight: true }
  ];
  return b2`
    <div class="tabs">
      ${tabs.map(
    (tab) => b2`
          <button
            class="tab-btn${tab.pushRight ? " tab-btn--push-right" : ""}${params.selectedTab === tab.id ? " active" : ""}${tab.disabled ? " tab-disabled" : ""}"
            ?disabled=${tab.disabled}
            @click=${() => params.onSelect(tab.id)}
          >
            ${tab.label}
          </button>
        `
  )}
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/hub-tab.ts
function renderHubTab(params) {
  if (params.loading) return b2`<div class="cache-state">Loading…</div>`;
  if (params.error) return b2`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return b2`<div class="cache-state">No hubs found.</div>`;
  const connected = hubConnected(params.hass, params.hub);
  const proxyOn = proxyClientConnected(params.hass, params.hub);
  const haActive = connected || proxyOn;
  const haFullyActive = connected && proxyOn;
  const row = (kind, label, value) => b2`
    <div class="hub-row">
      <span class="hub-row-icon">${hubIcon(kind, "hub-row-icon-svg")}</span>
      <span class="hub-row-label">${label}</span>
      <span class="hub-row-value">${String(value)}</span>
    </div>
  `;
  return b2`
    <div class="tab-panel scrollable">
      <div class="hub-hero">
        <div class="hub-ident hub-ident--hero">
          <div class="hub-ident-name">${params.hub.name || "Unknown"}</div>
        </div>
        <div class="hub-connection-strip" role="img" aria-label="Hub connection status">
          <div class="hub-connection-node hub-connection-node--hub${connected ? " is-active" : ""}">
            <span class="hub-connection-node-icon hub-connection-node-icon--hub">
              ${hubIcon("hero", "hub-hero-icon")}
            </span>
          </div>
          <div class="hub-connection-link${connected ? " is-active" : ""}"><span class="hub-connection-link-line"></span></div>
          <div class="hub-connection-node hub-connection-node--ha${haActive ? " is-active" : ""}${haFullyActive ? " is-bridged" : ""}">
            <span class="hub-connection-node-icon hub-connection-node-icon--mdi">
              <ha-icon icon="mdi:home-assistant"></ha-icon>
            </span>
          </div>
          <div class="hub-connection-link${proxyOn ? " is-active" : ""}"><span class="hub-connection-link-line"></span></div>
          <div class="hub-connection-node hub-connection-node--app${proxyOn ? " is-active" : ""}">
            <span class="hub-connection-node-icon hub-connection-node-icon--mdi">
              <ha-icon icon="mdi:tablet-cellphone"></ha-icon>
            </span>
          </div>
        </div>
      </div>
      <div class="hub-badges">
        <span class="hub-conn-badge ${connected ? "hub-conn-badge--on" : "hub-conn-badge--off"}">${connected ? "Hub connected" : "Hub not connected"}</span>
        <span class="hub-proxy-badge ${proxyOn ? "hub-proxy-badge--on" : "hub-proxy-badge--off"}">${proxyOn ? "App connected" : "App not connected"}</span>
      </div>
      <div class="hub-info-list">
        ${params.hub.version ? row("version", "Version", `Sofabaton ${params.hub.version}`) : null}
        ${params.hub.ip_address ? row("ip", "IP Address", params.hub.ip_address) : null}
        ${row("activities", "Activities", Number(params.hub.activity_count || 0))}
        ${row("devices", "Devices", Number(params.hub.device_count || 0))}
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
      <div class="setting-tile-header">
        <div class="setting-title">${params.title}</div>
        ${params.control}
      </div>
      <div class="setting-description">${params.description}</div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/settings-tab.ts
function renderSettingsTab(params) {
  if (params.loading) return b2`<div class="cache-state">Loading…</div>`;
  if (params.error) return b2`<div class="cache-state error">${params.error}</div>`;
  if (!params.hub) return b2`<div class="cache-state">No hubs found.</div>`;
  const busy = !!(params.pendingSettingKey || params.pendingActionKey);
  const canAct = canRunHubActions(params.hass, params.hub) && !busy;
  const settingValue = (key) => !!params.hub?.settings?.[key];
  return b2`
    <div class="tab-panel scrollable">
      <div class="acc-title">Configuration</div>
      <div class="settings-grid">
        ${renderSettingTile({
    title: "Persistent Cache",
    description: "Store activity and device data locally for faster access.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${params.persistentCacheEnabled} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("persistent_cache", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("persistent_cache", !params.persistentCacheEnabled)
  })}
        ${renderSettingTile({
    title: "Hex Logging",
    description: "Log raw hex traffic between hub, integration, and app.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${settingValue("hex_logging_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("hex_logging_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("hex_logging_enabled", !settingValue("hex_logging_enabled"))
  })}
        ${renderSettingTile({
    title: "Proxy",
    description: "Let the official Sofabaton app share the hub connection with HA simultaneously.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${settingValue("proxy_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("proxy_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("proxy_enabled", !settingValue("proxy_enabled"))
  })}
        ${renderSettingTile({
    title: "WiFi Device",
    description: "Enable the HTTP listener that captures remote button presses and routes them to HA actions.",
    classes: `toggle${busy ? " disabled" : ""}`,
    control: b2`<ha-switch .checked=${settingValue("wifi_device_enabled")} .disabled=${busy} @change=${(event) => {
      event.stopPropagation();
      params.onToggleSetting("wifi_device_enabled", !!event.currentTarget.checked);
    }}></ha-switch>`,
    onClick: busy ? void 0 : () => params.onToggleSetting("wifi_device_enabled", !settingValue("wifi_device_enabled"))
  })}
        ${renderSettingTile({
    title: "Find Remote",
    description: "Make the remote beep so you can locate it.",
    classes: `action${canAct ? "" : " disabled"}`,
    control: b2`<ha-icon class="setting-icon" icon="mdi:bell-ring-outline"></ha-icon>`,
    onClick: canAct ? () => params.onRunAction("find_remote") : void 0
  })}
        ${renderSettingTile({
    title: "Sync Remote",
    description: "Push the latest configuration to the physical remote.",
    classes: `action${canAct ? "" : " disabled"}`,
    control: b2`<ha-icon class="setting-icon" icon="mdi:sync"></ha-icon>`,
    onClick: canAct ? () => params.onRunAction("sync_remote") : void 0
  })}
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/components/accordion-section.ts
function renderAccordionSection(params) {
  return b2`
    <div class="accordion-section${params.isOpen ? " open" : ""}" id=${`acc-${params.sectionId}`}>
      <div class="acc-header" @click=${params.onToggle}>
        <span class="acc-title">${params.title}</span>
        <span class="badge">${params.count}</span>
        <span class="flex-spacer"></span>
        <span class="refresh-list-label">Refresh list</span>
        <button class="icon-btn${params.spinning ? " spinning" : ""}" ?disabled=${params.disabled} @click=${(event) => {
    event.stopPropagation();
    params.onRefresh();
  }}>
          <ha-icon icon="mdi:refresh"></ha-icon>
        </button>
        <span class="chevron">▼</span>
      </div>
      ${params.isOpen ? b2`<div class="acc-body" id=${`acc-body-${params.sectionId}`}>${params.body}</div>` : null}
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/tabs/cache-tab.ts
function badge(type, value) {
  return b2`<span class="id-badge"><span>${type}:</span><span>${String(value)}</span></span>`;
}
function renderCacheTab(params) {
  if (params.loading) return b2`<div class="cache-state">Loading…</div>`;
  if (params.error) return b2`<div class="cache-state error">${params.error}</div>`;
  if (!params.persistentCacheEnabled) return b2`<div class="cache-state"><div class="cache-state-icon">💾</div><div class="cache-state-title">Persistent cache is off</div><div class="cache-state-sub">Enable it from the Settings tab to browse cached activities and devices.</div></div>`;
  if (!params.hub) return b2`<div class="cache-state">No hubs found.</div>`;
  const renderActivity = (activity) => {
    const id = Number(activity.id);
    const key = `act-${id}`;
    const isOpen = params.openEntity === key;
    const locked = params.refreshBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const favorites = activityFavorites(params.hub, id);
    const macros = activityMacros(params.hub, id);
    const buttons = activityButtons(params.hub, id);
    return b2`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">${activity.name || `Activity ${id}`}</span>
          <span class="entity-meta">
            ${badge("DevID", id)}
            <span class="entity-count">${favorites.length} favs · ${macros.length} macros · ${buttons.length} btns</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event) => {
      event.stopPropagation();
      params.onRefreshEntry("activity", id, key);
    }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? b2`<div class="entity-body">
          ${favorites.length ? b2`<div class="inner-section-label">Favorites</div>${favorites.map((favorite) => b2`<div class="inner-row"><span class="inner-label">${favorite.label || `Favorite ${favorite.command_id}`}</span><span class="inner-badges">${badge("FavID", favorite.button_id)}${badge("DevID", favorite.device_id)}${badge("ComID", favorite.command_id)}</span></div>`)}` : null}
          ${macros.length ? b2`<div class="inner-section-label">Macros</div>${macros.map((macro) => b2`<div class="inner-row"><span class="inner-label">${macro.label || macro.name || `Macro ${macro.command_id}`}</span><span class="inner-badges">${badge("FavID", macro.command_id)}${badge("ComID", macro.command_id)}</span></div>`)}` : null}
          ${buttons.length ? b2`<div class="inner-section-label">Buttons</div><div class="buttons-grid">${[buttons.slice(0, Math.ceil(buttons.length / 2)), buttons.slice(Math.ceil(buttons.length / 2))].map((column) => b2`<div class="buttons-col">${column.map((buttonId) => b2`<div class="inner-row"><span class="inner-label">${buttonName(buttonId)}</span><span class="inner-badges">${badge("ComID", buttonId)}</span></div>`)}</div>`)}</div>` : null}
          ${!favorites.length && !macros.length && !buttons.length ? b2`<div class="inner-empty">No cached data yet.</div>` : null}
        </div>` : null}
      </div>
    `;
  };
  const renderDevice = (device) => {
    const id = Number(device.id);
    const key = `dev-${id}`;
    const isOpen = params.openEntity === key;
    const locked = params.refreshBusy || params.selectedHubProxyConnected;
    const isSpinning = params.refreshBusy && params.activeRefreshLabel === key;
    const commands = deviceCommands(params.hub, id);
    return b2`
      <div class="entity-block${isOpen ? " open" : ""}" id=${`entity-${key}`}>
        <div class="entity-summary" @click=${() => params.onToggleEntity(key)}>
          <span class="entity-name">${device.name || `Device ${id}`}</span>
          <span class="entity-meta">
            ${badge("DevID", id)}
            <span class="entity-count">${Number(device.command_count || 0)} cmds</span>
            <button class="icon-btn${isSpinning ? " spinning" : ""}" ?disabled=${locked} @click=${(event) => {
      event.stopPropagation();
      params.onRefreshEntry("device", id, key);
    }}><ha-icon icon="mdi:refresh"></ha-icon></button>
            <span class="entity-chevron">▼</span>
          </span>
        </div>
        ${isOpen ? b2`<div class="entity-body">${commands.length ? commands.map((command) => b2`<div class="inner-row"><span class="inner-label">${command.label}</span><span class="inner-badges">${badge("ComID", command.id)}</span></div>`) : b2`<div class="inner-empty">No cached commands.</div>`}</div>` : null}
      </div>
    `;
  };
  const activities = hubActivities(params.hub);
  const devices = hubDevices(params.hub);
  return b2`
    <div class="tab-panel">
      ${params.staleData ? b2`<div class="stale-banner"><span class="stale-banner-text">Cache was updated externally. Refresh to see latest data.</span><button class="stale-banner-btn" @click=${params.onRefreshStale}>Refresh</button></div>` : null}
      <div class="cache-panel">
        ${renderAccordionSection({ sectionId: "activities", title: "Activities", count: activities.length, isOpen: params.openSection === "activities", disabled: params.refreshBusy || params.selectedHubProxyConnected, spinning: params.refreshBusy && !params.activeRefreshLabel, onToggle: () => params.onToggleSection("activities"), onRefresh: () => params.onRefreshSection("activities"), body: activities.map(renderActivity) })}
        ${renderAccordionSection({ sectionId: "devices", title: "Devices", count: devices.length, isOpen: params.openSection === "devices", disabled: params.refreshBusy || params.selectedHubProxyConnected, spinning: params.refreshBusy && !params.activeRefreshLabel, onToggle: () => params.onToggleSection("devices"), onRefresh: () => params.onRefreshSection("devices"), body: devices.map(renderDevice) })}
      </div>
    </div>
  `;
}

// custom_components/sofabaton_x1s/www/src/components/log-console.ts
function renderLogConsole(params) {
  const body = params.loading && !params.lines.length ? b2`<div class="logs-empty">Loading log stream…</div>` : params.error && !params.lines.length ? b2`<div class="logs-empty error">${params.error}</div>` : !params.lines.length ? b2`<div class="logs-empty">No log lines captured for this hub yet.</div>` : params.lines.map((line) => {
    const formatted = formatLogEntry(line);
    return b2`
                <div class="log-line" title=${`${formatted.prefix} ${formatted.lineText}`.trim()}><span class="log-line-level log-line-level--${formatted.level}">${formatted.prefix}</span> <span class="log-line-msg">${formatted.lineText}</span></div>
              `;
  });
  return b2`
    <div class="tab-panel logs-panel">
      <div class="logs-header">
        <div class="acc-title">Live Console</div>
      </div>
      <div class="logs-console" id="logs-console">${body}</div>
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

// ../node_modules/lit-html/directive.js
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

// ../node_modules/lit-html/directive-helpers.js
var { I: t3 } = j;
var m2 = {};
var p3 = (o5, t4 = m2) => o5._$AH = t4;

// ../node_modules/lit-html/directives/keyed.js
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

// custom_components/sofabaton_x1s/www/src/tabs/wifi-commands-tab.ts
var WIFI_COMMANDS_DOCS_URL = "https://github.com/m3tac0de/home-assistant-sofabaton-x1s/blob/main/docs/wifi_commands.md";
var SLOT_COUNT = 10;
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
var DEFAULT_KEY_LABELS = {
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
var SofabatonWifiCommandsTab = class extends i4 {
  constructor() {
    super(...arguments);
    this._commandsData = this._normalizeCommandsForStorage([]);
    this._configLoadedForEntryId = null;
    this._commandConfigLoading = false;
    this._syncState = this._defaultSyncState();
    this._commandSyncLoading = false;
    this._commandSyncRunning = false;
    this._commandSyncPollTimer = null;
    this._activeCommandSlot = null;
    this._activeCommandModal = null;
    this._confirmClearSlot = null;
    this._commandSaveError = "";
    this._activeCommandActionTab = "short";
    this._syncWarningOpen = false;
    this._syncWarningOptOut = false;
    this._hubVersionModalOpen = false;
    this._hubVersionModalSelectedVersion = "X1";
    this._commandEditorDrafts = {};
    this._shortSelectorVersion = 0;
    this._longSelectorVersion = 0;
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
    this._confirmSyncWarning = async () => {
      const entityId = String(this._entityId() || "").trim();
      if (entityId && this._syncWarningOptOut) this._setCommandSyncWarningOptOut(entityId, true);
      this._syncWarningOpen = false;
      await this._startCommandConfigSync();
    };
    this._runCommandConfigSync = async () => {
      if (this._commandSyncRunning) return;
      const entityId = String(this._entityId() || "").trim();
      if (!entityId) return;
      if (this._commandSyncWarningOptedOut(entityId)) {
        await this._startCommandConfigSync();
        return;
      }
      this._syncWarningOptOut = false;
      this._syncWarningOpen = true;
    };
    this._openHubVersionModal = () => {
      this._hubVersionModalSelectedVersion = this._hubVersion() || "X1";
      this._hubVersionModalOpen = true;
    };
    this._submitHubVersionModal = async () => {
      const entityId = String(this._entityId() || "").trim();
      if (!entityId || !this.hass?.callWS) return;
      await this.hass.callWS({
        type: "sofabaton_x1s/hub/set_version",
        entity_id: entityId,
        version: this._hubVersionModalSelectedVersion
      });
      this._hubVersionModalOpen = false;
    };
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
  render() {
    if (this.loading) return b2`<div class="state">Loading…</div>`;
    if (this.error) return b2`<div class="state error">${this.error}</div>`;
    if (!this.hub) return b2`<div class="state">No hubs found.</div>`;
    const remoteUnavailable = this._remoteUnavailable();
    const syncTone = remoteUnavailable ? "sync-error" : this._syncStatusTone(this._syncState.status);
    const syncRunning = this._syncState.status === "running";
    const syncMessage = this._syncMessage(remoteUnavailable);
    return b2`
      <div class="tab-panel">
        <div class="section-title-wrap">
          <div class="section-title">Wifi Commands</div>
          <a class="section-help" href=${WIFI_COMMANDS_DOCS_URL} target="_blank" rel="noopener noreferrer" title="Learn more about Wifi Commands" aria-label="Wifi Commands documentation">
            <ha-icon icon="mdi:help-circle-outline"></ha-icon>
          </a>
        </div>
        <div class="section-subtitle">
          Receive button presses from the hub: assign Home Assistant actions to physical buttons or favorites and deploy the configuration to your hub.
        </div>
        ${this._hubVersionConfident() ? A : b2`
          <button class="hub-version-warn-btn" @click=${this._openHubVersionModal}>
            ⚠️ Your hub may be miss-versioned! Click here to fix it.
          </button>
        `}
        <div class="sync-row ${syncTone}">
          <div class="sync-message-wrap">
            <ha-icon icon=${this._syncStatusIcon(remoteUnavailable)}></ha-icon>
            <div class="sync-message">${syncMessage}</div>
          </div>
          ${remoteUnavailable ? A : syncRunning ? b2`<div class="sync-static">Syncing…</div>` : this._syncState.sync_needed ? b2`
            <button class="sync-btn sync-btn-primary" ?disabled=${this._commandSyncRunning} @click=${this._runCommandConfigSync}>Sync to Hub</button>
          ` : A}
        </div>
        ${remoteUnavailable ? A : b2`
          <div class="command-grid">
            ${this._commandsList().map((command, idx) => this._renderSlot(command, idx))}
          </div>
        `}
        ${this._renderDetailsModal()}
        ${this._renderActionModal()}
        ${this._renderSyncWarningModal()}
        ${this._renderHubVersionModal()}
      </div>
    `;
  }
  _renderSlot(command, idx) {
    const isConfirming = this._confirmClearSlot === idx;
    const configured = this._isCommandConfigured(command, idx);
    if (isConfirming) {
      return b2`
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
      return b2`
        <button class="slot-btn slot-empty" @click=${() => this._openCommandEditor(idx)}>
          <div class="slot-main">
            <div style="font-size:28px;color:var(--secondary-text-color)">+</div>
            <div class="slot-name">Make Command</div>
          </div>
        </button>
      `;
    }
    const details = this._commandSlotSummaryDetails(command);
    const activityCount = Array.isArray(command.activities) ? command.activities.length : 0;
    const activitiesLabel = activityCount === 1 ? "Activity" : "Activities";
    return b2`
      <div class="slot-btn">
        <button class="slot-clear" @click=${(event) => {
      event.stopPropagation();
      this._confirmClearSlot = idx;
    }}><ha-icon icon="mdi:close"></ha-icon></button>
        <button class="slot-main" @click=${() => this._openCommandEditor(idx)}>
          <span class="slot-text-wrap">
            <span class="slot-name">${String(command.name || "").trim() || `Command ${idx + 1}`}</span>
            <span class="slot-meta">
              ${command.add_as_favorite ? b2`<span class="slot-favorite"><ha-icon icon="mdi:heart"></ha-icon></span>` : A}
              ${command.hard_button ? b2`<span class="slot-meta-icon"><ha-icon icon=${this._commandSlotIcon(command.hard_button)} style=${this._commandSlotIconColor(command.hard_button) ? `color:${this._commandSlotIconColor(command.hard_button)}` : ""}></ha-icon></span>` : A}
              ${command.long_press_enabled ? b2`<span class="slot-meta-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>` : A}
              <span>in ${activityCount} ${activitiesLabel}</span>
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
    return b2`
      <div class="modal-backdrop" @click=${this._closeOnBackdrop}>
        <div class="dialog" @click=${(event) => event.stopPropagation()}>
          <div class="dialog-header">
            <div class="dialog-title">Command Slot ${slotIndex + 1}</div>
            <button class="dialog-close" @click=${this._closeCommandEditor}><ha-icon icon="mdi:close"></ha-icon></button>
          </div>
          <div class="dialog-body">
            <div class="dialog-note">
              Create a Command in this slot. Give it a name and decide which Activities to apply it to. The name will appear on your remote’s display, in the mobile app, and as the Wifi Command's sensor status.
            </div>
            <div class="config-block">
              <ha-textfield
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
              <button class="checkbox-row ${draft.add_as_favorite ? "active" : ""}" @click=${() => {
      this._toggleFavoriteRow();
    }}>
                <span class="checkbox-left">
                  <span class="checkbox-icon"><ha-icon icon="mdi:heart"></ha-icon></span>
                  <span>Make as Favorite</span>
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
              <button class="checkbox-row ${hasMappedButton && draft.long_press_enabled ? "active" : ""}" ?disabled=${!hasMappedButton} @click=${() => {
      this._toggleLongPressRow();
    }}>
                <span class="checkbox-left">
                  <span class="checkbox-icon"><ha-icon icon="mdi:timer-sand-full"></ha-icon></span>
                  <span>Enable longpress</span>
                </span>
                <ha-switch
                  .checked=${hasMappedButton && draft.long_press_enabled}
                  .disabled=${!hasMappedButton}
                  @click=${(event) => event.stopPropagation()}
                  @change=${(event) => this._handleLongPressSwitchChange(event)}
                ></ha-switch>
              </button>
              <div class="activities-label">Apply to these Activities</div>
              <div class="activity-chip-row">
                ${activities.length ? activities.map((activity) => b2`
                  <button class="activity-chip ${selectedActivities.has(String(activity.id)) ? "active" : ""}" @click=${(event) => this._toggleActivity(activity.id, event)}>
                    ${activity.name}
                  </button>
                `) : b2`<div class="empty-hint">No activities available for this hub.</div>`}
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
    return b2`
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
              ${draft.long_press_enabled ? b2`
                <div class="action-tabs">
                  <button class="action-tab ${activeTab === "short" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("short")}>Short press</button>
                  <button class="action-tab ${activeTab === "long" ? "active" : ""}" @click=${() => this._setActiveCommandActionTab("long")}>Long press</button>
                </div>
              ` : A}
              <div class="action-helper">${activeTab === "long" ? "Select Long-Press Action" : "Select Triggered Action"}</div>
              <div class="action-selector-wrap" ?hidden=${activeTab !== "short"}>
                ${i6(this._shortSelectorVersion, b2`
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
                ${i6(this._longSelectorVersion, b2`
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
    return b2`
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
              <span>Don’t show this warning again for this remote.</span>
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
    if (!this._hubVersionModalOpen) return A;
    return b2`
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
              We couldn’t automatically detect your hub model. Select the correct version below — the change takes effect immediately, no restart needed.
            </div>
            <div class="version-chip-row">
              ${["X1", "X1S", "X2"].map((version) => b2`
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
    if (this._configLoadedForEntryId === entryId && !this._commandConfigLoading && !this._commandSyncLoading) return;
    await this._loadCommandConfigFromBackend(true);
    await this._loadCommandSyncProgress(true);
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
    return this._remoteAttrs()?.hub_version_confident !== false;
  }
  _supportsUnicodeCommandNames() {
    const version = this._hubVersion();
    return version.includes("X2") || version.includes("X1S");
  }
  _sanitizeCommandName(value) {
    const pattern = this._supportsUnicodeCommandNames() ? /[^\p{L}\p{N} ]+/gu : /[^A-Za-z0-9 ]+/g;
    return String(value ?? "").replace(pattern, "").slice(0, 20);
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
      activities: [],
      action: { ...DEFAULT_ACTION },
      long_press_action: { ...DEFAULT_ACTION }
    };
  }
  _normalizeCommandsForStorage(nextCommands) {
    return Array.from({ length: SLOT_COUNT }, (_2, idx) => {
      const item = Array.isArray(nextCommands) ? nextCommands[idx] ?? {} : {};
      const record = item && typeof item === "object" ? item : {};
      return {
        ...this._commandSlotDefault(idx),
        name: this._sanitizeCommandName(record.name ?? `Command ${idx + 1}`),
        add_as_favorite: record.add_as_favorite === void 0 ? this._commandSlotDefault(idx).add_as_favorite : Boolean(record.add_as_favorite),
        hard_button: String(record.hard_button ?? ""),
        long_press_enabled: Boolean(record.long_press_enabled) && Boolean(String(record.hard_button ?? "").trim()),
        activities: Array.isArray(record.activities) ? record.activities.map((id) => String(id)).filter((id) => id !== "") : [],
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
      activities: Array.isArray(slot?.activities) ? slot.activities.map((id) => String(id)).filter((id) => id !== "") : [],
      action: this._normalizeCommandAction(slot?.action),
      long_press_action: this._normalizeCommandAction(slot?.long_press_action)
    };
  }
  async _loadCommandConfigFromBackend(force = false) {
    const entityId = String(this._entityId() || "").trim();
    const entryId = String(this.hub?.entry_id || "").trim();
    if (!entityId || !entryId || !this.hass?.callWS) return;
    if (this._commandConfigLoading && !force) return;
    if (this._configLoadedForEntryId === entryId && !force) return;
    this._commandConfigLoading = true;
    try {
      const result = await this.hass.callWS({
        type: "sofabaton_x1s/command_config/get",
        entity_id: entityId
      });
      this._commandsData = this._normalizeCommandsForStorage(result?.commands || []);
      this._configLoadedForEntryId = entryId;
    } catch (_error) {
      this._commandsData = this._normalizeCommandsForStorage([]);
      this._configLoadedForEntryId = entryId;
    } finally {
      this._commandConfigLoading = false;
    }
  }
  async _loadCommandSyncProgress(force = false) {
    const entityId = String(this._entityId() || "").trim();
    if (!entityId || !this.hass?.callWS) return;
    if (this._commandSyncLoading && !force) return;
    this._commandSyncLoading = true;
    try {
      const result = await this.hass.callWS({
        type: "sofabaton_x1s/command_sync/progress",
        entity_id: entityId
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
    } catch (_error) {
      this._syncState = {
        ...this._defaultSyncState(),
        message: "Unable to load sync status"
      };
    } finally {
      this._commandSyncLoading = false;
    }
  }
  async _setCommands(nextCommands) {
    const normalized = this._normalizeCommandsForStorage(nextCommands);
    this._commandsData = normalized;
    const entityId = String(this._entityId() || "").trim();
    if (entityId && this.hass?.callWS) {
      try {
        await this.hass.callWS({
          type: "sofabaton_x1s/command_config/set",
          entity_id: entityId,
          commands: normalized
        });
      } catch (_error) {
      }
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
    if (!draft.add_as_favorite && !String(draft.hard_button || "").trim()) {
      return "Add as Favorite or Map to button before saving.";
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
      label: `${title} \u2022 ${DEFAULT_KEY_LABELS[key]}`
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
  _toggleFavoriteRow() {
    const draft = this._activeCommandDraft();
    if (!draft) return;
    this._updateActiveCommandDraft({ add_as_favorite: !draft.add_as_favorite });
    this._commandSaveError = "";
  }
  _handleFavoriteSwitchChange(event) {
    const checked = Boolean(event.currentTarget.checked);
    this._updateActiveCommandDraft({ add_as_favorite: checked });
    this._commandSaveError = "";
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
    return String(command.name || "").trim() !== String(defaults.name) || Boolean(command.add_as_favorite) !== Boolean(defaults.add_as_favorite) || Boolean(command.hard_button) || Boolean(command.long_press_enabled) || Array.isArray(command.activities) && command.activities.length > 0 || this._commandHasCustomAction(command.action) || Boolean(command.long_press_enabled) && this._commandHasCustomAction(command.long_press_action);
  }
  _openCommandEditor(slotIndex) {
    this._confirmClearSlot = null;
    this._activeCommandModal = "details";
    this._activeCommandSlot = Number(slotIndex);
    this._activeCommandActionTab = "short";
    this._commandSaveError = "";
    const draft = this._ensureCommandDraft(slotIndex);
    const activities = this._editorActivities();
    const fallbackActivity = activities[0] ? String(activities[0].id) : null;
    const selectedActivities = new Set((draft?.activities || []).map((id) => String(id)));
    if (selectedActivities.size === 0 && fallbackActivity) {
      selectedActivities.add(fallbackActivity);
      this._updateActiveCommandDraft({ activities: Array.from(selectedActivities) });
    }
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
    const current = new Set((this._activeCommandDraft()?.activities || []).map((id) => String(id)));
    const idKey = String(activityId);
    if (current.has(idKey) && current.size > 1) current.delete(idKey);
    else current.add(idKey);
    this._updateActiveCommandDraft({ activities: Array.from(current) });
    this._commandSaveError = "";
  }
  async _clearSlot(idx) {
    const next = this._commandsList();
    next[idx] = this._commandSlotDefault(idx);
    this._confirmClearSlot = null;
    await this._setCommands(next);
  }
  _syncStatusTone(status) {
    if (status === "failed") return "sync-error";
    if (status === "success") return "sync-ok";
    if (status === "running") return "sync-running";
    return "";
  }
  _syncStatusIcon(remoteUnavailable) {
    if (remoteUnavailable || this._syncState.status === "failed") return "mdi:alert-circle-outline";
    if (this._syncState.status === "running") return "mdi:progress-clock";
    return "mdi:information-outline";
  }
  _syncMessage(remoteUnavailable) {
    if (remoteUnavailable) return "Remote entity unavailable. Is the app connected?";
    if (this._syncState.status === "running") {
      const total = Number(this._syncState.total_steps || 0);
      const current = Number(this._syncState.current_step || 0);
      const progress = total > 0 ? ` (${Math.min(current, total)}/${total})` : "";
      return `${String(this._syncState.message || "Sync in progress")}${progress}`;
    }
    if (this._syncState.status === "failed") return String(this._syncState.message || "Last sync failed.");
    if (this._syncState.sync_needed) return "Command config changes need to be synced to the hub.";
    if (this._syncState.status === "success") return "Hub command configuration is up to date.";
    return "No sync needed.";
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
    try {
      await this.hass.callService("sofabaton_x1s", "sync_command_config", { entity_id: entityId });
    } catch (error) {
      this._syncState = {
        ...this._syncState,
        status: "failed",
        message: String(error?.message || "Sync failed to start")
      };
    } finally {
      this._commandSyncRunning = false;
      await this._loadCommandSyncProgress(true);
    }
  }
  _scheduleSyncPoll() {
    if (this._syncState.status !== "running" || this._remoteUnavailable()) {
      this._clearPollTimer();
      return;
    }
    if (this._commandSyncPollTimer != null) return;
    this._commandSyncPollTimer = window.setTimeout(async () => {
      this._commandSyncPollTimer = null;
      await this._loadCommandSyncProgress(true);
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
      node.querySelectorAll("ha-selector-select, ha-control-select, ha-formfield").forEach((element) => {
        const htmlElement = element;
        if (htmlElement.textContent?.includes("Perform action")) {
          htmlElement.style.display = "none";
          htmlElement.setAttribute("aria-hidden", "true");
        }
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
SofabatonWifiCommandsTab.properties = {
  hass: { attribute: false },
  hub: { attribute: false },
  loading: { type: Boolean },
  error: { type: String },
  _commandsData: { state: true },
  _configLoadedForEntryId: { state: true },
  _commandConfigLoading: { state: true },
  _syncState: { state: true },
  _commandSyncLoading: { state: true },
  _commandSyncRunning: { state: true },
  _activeCommandSlot: { state: true },
  _activeCommandModal: { state: true },
  _confirmClearSlot: { state: true },
  _commandSaveError: { state: true },
  _activeCommandActionTab: { state: true },
  _syncWarningOpen: { state: true },
  _syncWarningOptOut: { state: true },
  _hubVersionModalOpen: { state: true },
  _hubVersionModalSelectedVersion: { state: true },
  _commandEditorDrafts: { state: true },
  _shortSelectorVersion: { state: true },
  _longSelectorVersion: { state: true }
};
SofabatonWifiCommandsTab.styles = i`
    :host { display: flex; flex: 1; min-height: 0; }
    .tab-panel { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 16px; gap: 14px; overflow-y: auto; }
    .state { flex: 1; display: flex; align-items: center; justify-content: center; color: var(--secondary-text-color); }
    .state.error { color: var(--error-color, #db4437); }
    .section-title-wrap { display: flex; align-items: center; gap: 8px; }
    .section-title { font-size: 16px; font-weight: 700; color: var(--primary-text-color); }
    .section-help { color: var(--secondary-text-color); display: inline-flex; }
    .section-subtitle, .dialog-note, .dialog-footer-note, .slot-confirm-sub, .sync-message, .sync-warning-text, .empty-hint { color: var(--secondary-text-color); }
    .section-subtitle { font-size: 13px; line-height: 1.5; }
    .hub-version-warn-btn { width: 100%; border: 1px solid color-mix(in srgb, var(--warning-color, #ff9800) 45%, var(--divider-color)); border-radius: 12px; padding: 10px 12px; background: color-mix(in srgb, var(--warning-color, #ff9800) 10%, transparent); color: var(--primary-text-color); text-align: left; font: inherit; font-weight: 600; cursor: pointer; }
    .sync-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 1px solid var(--divider-color); border-radius: 14px; background: var(--secondary-background-color, var(--ha-card-background)); }
    .sync-row.sync-error { border-color: color-mix(in srgb, var(--error-color, #db4437) 35%, var(--divider-color)); }
    .sync-row.sync-ok { border-color: color-mix(in srgb, #48b851 35%, var(--divider-color)); }
    .sync-row.sync-running { border-color: color-mix(in srgb, var(--primary-color) 35%, var(--divider-color)); }
    .sync-message-wrap { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .sync-message { font-size: 13px; line-height: 1.4; }
    .sync-btn, .dialog-btn, .slot-action-btn, .sync-static { border: 1px solid var(--divider-color); border-radius: 10px; padding: 8px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .sync-btn, .dialog-btn, .slot-action-btn, .activity-chip, .checkbox-row, .slot-btn, .icon-btn, .version-chip, .action-tab { cursor: pointer; }
    .sync-btn:hover, .dialog-btn:hover, .slot-action-btn:hover, .activity-chip:hover, .version-chip:hover, .action-tab:hover { border-color: color-mix(in srgb, var(--primary-color) 55%, var(--divider-color)); }
    .sync-btn-primary, .dialog-btn-primary { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
    .sync-static { opacity: 0.65; cursor: default; }
    .command-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .slot-btn { position: relative; border: 1px solid var(--divider-color); border-radius: 12px; min-height: 108px; cursor: pointer; padding: 0; text-align: left; display: flex; flex-direction: column; overflow: hidden; background: var(--ha-card-background, var(--card-background-color)); }
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
    .slot-meta-icon ha-icon { --mdc-icon-size: 14px; }
    .slot-clear { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; min-width: 26px; border-radius: 8px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color)); color: var(--secondary-text-color); display: inline-flex; align-items: center; justify-content: center; padding: 0; cursor: pointer; z-index: 1; opacity: 0.9; }
    .slot-clear:hover { opacity: 1; border-color: var(--primary-color); }
    .slot-clear ha-icon { --mdc-icon-size: 16px; }
    .slot-action-btn { margin: 0 10px 10px; border: 1px solid var(--divider-color); border-radius: 10px; min-height: 44px; width: auto; background: var(--secondary-background-color, var(--ha-card-background, var(--card-background-color))); color: var(--primary-text-color); font-size: 14px; font-weight: 500; line-height: 1.2; text-align: left; padding: 10px 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease, transform 80ms ease; }
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
    .dialog { width: min(760px, calc(100vw - 36px)); max-height: min(82vh, 900px); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--divider-color); background: var(--ha-card-background, var(--card-background-color, var(--primary-background-color))); box-shadow: var(--ha-card-box-shadow, 0 8px 28px rgba(0,0,0,0.28)); overflow: hidden; }
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
      border-radius: 10px;
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
      border-radius: 12px;
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
    .checkbox-row { width: 100%; border: 0; background: transparent; padding: 0; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; cursor: pointer; color: inherit; }
    .checkbox-row[disabled] { cursor: default; opacity: 0.6; }
    .checkbox-row.active .checkbox-icon { border-color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 20%, transparent); }
    .checkbox-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .checkbox-icon { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--divider-color); background: color-mix(in srgb, var(--ha-card-background, transparent) 88%, #000); display: flex; align-items: center; justify-content: center; transition: background-color 120ms ease, border-color 120ms ease; }
    .checkbox-icon ha-icon { --mdc-icon-size: 16px; }
    .activities-label, .warning-label, .action-helper { font-size: 12px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--secondary-text-color); }
    .activity-chip-row, .version-chip-row { display: flex; flex-wrap: wrap; gap: 8px; }
    .activity-chip, .version-chip { border: 1px solid var(--divider-color); border-radius: 999px; background: color-mix(in srgb, var(--ha-card-background, transparent) 90%, #000); color: inherit; padding: 6px 12px; font: inherit; }
    .activity-chip.active, .version-chip.active, .action-tab.active { background: color-mix(in srgb, var(--primary-color) 20%, transparent); border-color: var(--primary-color); color: var(--primary-color); }
    .action-tabs { display: flex; gap: 8px; }
    .action-tab { border: 1px solid var(--divider-color); border-radius: 999px; padding: 7px 12px; background: transparent; color: var(--primary-text-color); font: inherit; font-size: 13px; font-weight: 700; }
    .action-selector-wrap[hidden] { display: none; }
    .dialog-text { font-size: 14px; line-height: 1.55; color: var(--primary-text-color); }
    .warning-optout { display: flex; align-items: center; gap: 10px; }
    .dialog-body ha-textfield,
    .dialog-body ha-selector {
      width: 100%;
      --input-fill-color: var(--ha-color-form-background);
      --mdc-theme-surface: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-text-field-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-text-field-hover-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 92%, black);
      --mdc-text-field-disabled-fill-color: color-mix(in srgb, var(--ha-card-background, var(--card-background-color)) 88%, black);
      --mdc-text-field-idle-line-color: var(--divider-color);
      --mdc-text-field-hover-line-color: var(--primary-color);
      --mdc-text-field-focused-line-color: var(--primary-color);
      --mdc-text-field-label-ink-color: var(--secondary-text-color);
      --mdc-text-field-ink-color: var(--primary-text-color);
      --mdc-text-field-input-text-color: var(--primary-text-color);
      --text-field-hover-color: var(--primary-text-color);
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
    @media (max-width: 640px) {
      .command-grid { grid-template-columns: 1fr; }
      .modal-backdrop { padding: max(env(safe-area-inset-top), 8px) 0 0; align-items: flex-start; }
      .dialog, .dialog.small { width: 100%; max-height: 100%; border-radius: 0 0 16px 16px; }
      .dialog-footer { padding-bottom: max(env(safe-area-inset-bottom), 12px); }
      .sync-row { align-items: flex-start; flex-direction: column; }
    }
  `;
if (!customElements.get("sofabaton-wifi-commands-tab")) {
  customElements.define("sofabaton-wifi-commands-tab", SofabatonWifiCommandsTab);
}

// custom_components/sofabaton_x1s/www/src/tools-card.ts
var TOOLS_TYPE = "sofabaton-control-panel";
var TOOLS_VERSION = "0.1.0";
var LOG_ONCE_KEY = `__${TOOLS_TYPE}_logged__`;
var EDITOR_TYPE = `${TOOLS_TYPE}-editor`;
function logOnce() {
  const windowWithFlag = window;
  if (windowWithFlag[LOG_ONCE_KEY]) return;
  windowWithFlag[LOG_ONCE_KEY] = true;
  console.log(`Sofabaton Control Panel ${TOOLS_VERSION}`);
}
var SofabatonControlPanelCard = class extends i4 {
  constructor() {
    super();
    this._config = {};
    this._lastRenderedTab = null;
    this._pendingCacheScrollSnapshot = null;
    this._store = new ControlPanelStore((snapshot) => {
      this._snapshot = snapshot;
      this.requestUpdate();
    });
    this._snapshot = this._store.snapshot;
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
  connectedCallback() {
    super.connectedCallback();
    logOnce();
    this._store.connected();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._store.disconnected();
    this.renderRoot.querySelector("#hub-picker-dialog")?.close();
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
  openHubPicker() {
    const button = this.renderRoot.querySelector("#hub-picker-btn");
    const dialog = this.renderRoot.querySelector("#hub-picker-dialog");
    if (!button || !dialog) return;
    const rect = button.getBoundingClientRect();
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${Math.max(8, rect.right - 180)}px`;
    dialog.showModal();
  }
  handleTabSelect(tabId) {
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
      section: this._snapshot.openSection || null,
      sectionTop: 0,
      panelTop: 0
    };
    const body = state.section ? this.renderRoot.querySelector(`#acc-body-${state.section}`) : null;
    const panel = this.renderRoot.querySelector(".tab-panel");
    if (body) state.sectionTop = body.scrollTop || 0;
    if (panel) state.panelTop = panel.scrollTop || 0;
    return state;
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
      const body = snapshot.section ? this.renderRoot.querySelector(`#acc-body-${snapshot.section}`) : null;
      if (body) body.scrollTop = Number(snapshot.sectionTop || 0);
      if (pendingEntityKey) {
        requestAnimationFrame(() => this.scrollEntityToTop(pendingEntityKey));
      }
    });
  }
  scrollEntityToTop(key) {
    const entity = this.renderRoot.querySelector(`#entity-${key}`);
    if (!entity) return;
    const body = entity.closest(".acc-body");
    if (!body) return;
    const entityTop = entity.getBoundingClientRect().top;
    const bodyTop = body.getBoundingClientRect().top;
    body.scrollTo({
      top: body.scrollTop + (entityTop - bodyTop),
      behavior: "smooth"
    });
  }
  render() {
    const hub = selectedHub(this._snapshot);
    const cacheHub = selectedHubCache(this._snapshot);
    const cacheEnabled = persistentCacheEnabled(this._snapshot);
    const hubs = this._snapshot.state?.hubs ?? [];
    const height = Number(this._config.card_height ?? 600);
    let activeTab = renderHubTab({
      loading: this._snapshot.loading,
      error: this._snapshot.loadError,
      hub,
      hass: this._snapshot.hass
    });
    if (this._snapshot.selectedTab === "settings") {
      activeTab = renderSettingsTab({
        loading: this._snapshot.loading,
        error: this._snapshot.loadError,
        hub,
        hass: this._snapshot.hass,
        persistentCacheEnabled: cacheEnabled,
        pendingSettingKey: this._snapshot.pendingSettingKey,
        pendingActionKey: this._snapshot.pendingActionKey,
        onToggleSetting: (setting, enabled) => this.handleSettingToggle(setting, enabled),
        onRunAction: (action) => this.handleAction(action)
      });
    } else if (this._snapshot.selectedTab === "logs") {
      activeTab = renderLogsTab({
        lines: this._snapshot.logsLines,
        loading: this._snapshot.logsLoading,
        error: this._snapshot.logsError
      });
    } else if (this._snapshot.selectedTab === "wifi_commands") {
      activeTab = b2`
        <sofabaton-wifi-commands-tab
          .loading=${this._snapshot.loading}
          .error=${this._snapshot.loadError}
          .hub=${hub}
          .hass=${this._snapshot.hass}
        ></sofabaton-wifi-commands-tab>
      `;
    } else if (this._snapshot.selectedTab === "cache") {
      activeTab = renderCacheTab({
        loading: this._snapshot.loading,
        error: this._snapshot.loadError,
        hub: cacheHub,
        persistentCacheEnabled: cacheEnabled,
        staleData: this._snapshot.staleData,
        refreshBusy: this._snapshot.refreshBusy,
        activeRefreshLabel: this._snapshot.activeRefreshLabel,
        openSection: this._snapshot.openSection,
        openEntity: this._snapshot.openEntity,
        selectedHubProxyConnected: proxyClientConnected(this._snapshot.hass, hub),
        onRefreshStale: () => void this._store.refreshStale(),
        onToggleSection: (sectionId) => this._store.toggleSection(sectionId),
        onToggleEntity: (key) => this._store.toggleEntity(key),
        onRefreshSection: (sectionId) => void this._store.refreshSection(sectionId),
        onRefreshEntry: (kind, targetId, key) => void this._store.refreshForHub(kind, targetId, key)
      });
    }
    return b2`
      <ha-card>
        <div class="card-inner" style=${`height:${height}px`}>
          <div class="card-header">
            <span class="card-title">Sofabaton Control Panel</span>
            ${renderHubPicker({
      visible: hubs.length > 1,
      selectedLabel: hub?.name || hub?.entry_id || "",
      hubs,
      selectedEntryId: this._snapshot.selectedHubEntryId,
      onOpen: () => this.openHubPicker(),
      onSelect: (entryId) => {
        this.renderRoot.querySelector("#hub-picker-dialog")?.close();
        this._store.selectHub(entryId);
      }
    })}
          </div>
          ${renderTabBar({
      selectedTab: this._snapshot.selectedTab,
      persistentCacheEnabled: cacheEnabled,
      onSelect: (tabId) => this.handleTabSelect(tabId)
    })}
          <div class="card-body">${activeTab}</div>
        </div>
      </ha-card>
    `;
  }
};
SofabatonControlPanelCard.styles = [cardStyles];
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
