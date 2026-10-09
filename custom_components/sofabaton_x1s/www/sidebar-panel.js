// node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t4, e6, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t4, this.t = e6;
  }
  get styleSheet() {
    let t4 = this.o;
    const s4 = this.t;
    if (e && void 0 === t4) {
      const e6 = void 0 !== s4 && 1 === s4.length;
      e6 && (t4 = o.get(s4)), void 0 === t4 && ((this.o = t4 = new CSSStyleSheet()).replaceSync(this.cssText), e6 && o.set(s4, t4));
    }
    return t4;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t4) => new n("string" == typeof t4 ? t4 : t4 + "", void 0, s);
var i = (t4, ...e6) => {
  const o5 = 1 === t4.length ? t4[0] : e6.reduce((e7, s4, o6) => e7 + ((t5) => {
    if (true === t5._$cssResult$) return t5.cssText;
    if ("number" == typeof t5) return t5;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t5 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t4[o6 + 1], t4[0]);
  return new n(o5, t4, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t4) => t4 instanceof CSSStyleSheet ? t4 : t4.styleSheet);
  else for (const e6 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e6.cssText, s4.appendChild(o6);
  }
};
var c = e ? (t4) => t4 : (t4) => t4 instanceof CSSStyleSheet ? ((t5) => {
  let e6 = "";
  for (const s4 of t5.cssRules) e6 += s4.cssText;
  return r(e6);
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
      const i6 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t4, i6, s4);
      void 0 !== h3 && e2(this.prototype, t4, h3);
    }
  }
  static getPropertyDescriptor(t4, s4, i6) {
    const { get: e6, set: r4 } = h(this.prototype, t4) ?? { get() {
      return this[s4];
    }, set(t5) {
      this[s4] = t5;
    } };
    return { get: e6, set(s5) {
      const h3 = e6?.call(this);
      r4?.call(this, s5), this.requestUpdate(t4, h3, i6);
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
  static finalizeStyles(s4) {
    const i6 = [];
    if (Array.isArray(s4)) {
      const e6 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e6) i6.unshift(c(s5));
    } else void 0 !== s4 && i6.push(c(s4));
    return i6;
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
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t4), void 0 !== this.renderRoot && this.isConnected && t4.hostConnected?.();
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
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), this._$EO?.forEach((t4) => t4.hostConnected?.());
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
    const i6 = this.constructor.elementProperties.get(t4), e6 = this.constructor._$Eu(t4, i6);
    if (void 0 !== e6 && true === i6.reflect) {
      const h3 = (void 0 !== i6.converter?.toAttribute ? i6.converter : u).toAttribute(s4, i6.type);
      this._$Em = t4, null == h3 ? this.removeAttribute(e6) : this.setAttribute(e6, h3), this._$Em = null;
    }
  }
  _$AK(t4, s4) {
    const i6 = this.constructor, e6 = i6._$Eh.get(t4);
    if (void 0 !== e6 && this._$Em !== e6) {
      const t5 = i6.getPropertyOptions(e6), h3 = "function" == typeof t5.converter ? { fromAttribute: t5.converter } : void 0 !== t5.converter?.fromAttribute ? t5.converter : u;
      this._$Em = e6;
      const r4 = h3.fromAttribute(s4, t5.type);
      this[e6] = r4 ?? this._$Ej?.get(e6) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t4, s4, i6, e6 = false, h3) {
    if (void 0 !== t4) {
      const r4 = this.constructor;
      if (false === e6 && (h3 = this[t4]), i6 ?? (i6 = r4.getPropertyOptions(t4)), !((i6.hasChanged ?? f)(h3, s4) || i6.useDefault && i6.reflect && h3 === this._$Ej?.get(t4) && !this.hasAttribute(r4._$Eu(t4, i6)))) return;
      this.C(t4, s4, i6);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t4, s4, { useDefault: i6, reflect: e6, wrapped: h3 }, r4) {
    i6 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t4) && (this._$Ej.set(t4, r4 ?? s4 ?? this[t4]), true !== h3 || void 0 !== r4) || (this._$AL.has(t4) || (this.hasUpdated || i6 || (s4 = void 0), this._$AL.set(t4, s4)), true === e6 && this._$Em !== t4 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t4));
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
      if (t5.size > 0) for (const [s5, i6] of t5) {
        const { wrapped: t6 } = i6, e6 = this[s5];
        true !== t6 || this._$AL.has(s5) || void 0 === e6 || this.C(s5, void 0, i6, e6);
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
var x = (t4) => (i6, ...s4) => ({ _$litType$: t4, strings: i6, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t4, i6) {
  if (!u2(t4) || !t4.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i6) : i6;
}
var N = (t4, i6) => {
  const s4 = t4.length - 1, e6 = [];
  let n4, l3 = 2 === i6 ? "<svg>" : 3 === i6 ? "<math>" : "", c4 = v;
  for (let i7 = 0; i7 < s4; i7++) {
    const s5 = t4[i7];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t4[i7 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e6.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i7 : x2);
  }
  return [V(t4, l3 + (t4[s4] || "<?>") + (2 === i6 ? "</svg>" : 3 === i6 ? "</math>" : "")), e6];
};
var S2 = class _S {
  constructor({ strings: t4, _$litType$: i6 }, e6) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t4.length - 1, d3 = this.parts, [f3, v2] = N(t4, i6);
    if (this.el = _S.createElement(f3, e6), P.currentNode = this.el.content, 2 === i6 || 3 === i6) {
      const t5 = this.el.content.firstChild;
      t5.replaceWith(...t5.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t5 of r4.getAttributeNames()) if (t5.endsWith(h2)) {
          const i7 = v2[a3++], s4 = r4.getAttribute(t5).split(o3), e7 = /([.?@])?(.*)/.exec(i7);
          d3.push({ type: 1, index: l3, name: e7[2], strings: s4, ctor: "." === e7[1] ? I : "?" === e7[1] ? L : "@" === e7[1] ? z : H }), r4.removeAttribute(t5);
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
function M(t4, i6, s4 = t4, e6) {
  if (i6 === E) return i6;
  let h3 = void 0 !== e6 ? s4._$Co?.[e6] : s4._$Cl;
  const o5 = a2(i6) ? void 0 : i6._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t4), h3._$AT(t4, s4, e6)), void 0 !== e6 ? (s4._$Co ?? (s4._$Co = []))[e6] = h3 : s4._$Cl = h3), void 0 !== h3 && (i6 = M(t4, h3._$AS(t4, i6.values), h3, e6)), i6;
}
var R = class {
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
    const { el: { content: i6 }, parts: s4 } = this._$AD, e6 = (t4?.creationScope ?? l2).importNode(i6, true);
    P.currentNode = e6;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i7;
        2 === r4.type ? i7 = new k(h3, h3.nextSibling, this, t4) : 1 === r4.type ? i7 = new r4.ctor(h3, r4.name, r4.strings, this, t4) : 6 === r4.type && (i7 = new Z(h3, this, t4)), this._$AV.push(i7), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e6;
  }
  p(t4) {
    let i6 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t4, s4, i6), i6 += s4.strings.length - 2) : s4._$AI(t4[i6])), i6++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t4, i6, s4, e6) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t4, this._$AB = i6, this._$AM = s4, this.options = e6, this._$Cv = e6?.isConnected ?? true;
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
    const { values: i6, _$litType$: s4 } = t4, e6 = "number" == typeof s4 ? this._$AC(t4) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e6) this._$AH.p(i6);
    else {
      const t5 = new R(e6, this), s5 = t5.u(this.options);
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
    let s4, e6 = 0;
    for (const h3 of t4) e6 === i6.length ? i6.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i6[e6], s4._$AI(h3), e6++;
    e6 < i6.length && (this._$AR(s4 && s4._$AB.nextSibling, e6), i6.length = e6);
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
  constructor(t4, i6, s4, e6, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t4, this.name = i6, this._$AM = e6, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t4, i6 = this, s4, e6) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t4 = M(this, t4, i6, 0), o5 = !a2(t4) || t4 !== this._$AH && t4 !== E, o5 && (this._$AH = t4);
    else {
      const e7 = t4;
      let n4, r4;
      for (t4 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e7[s4 + n4], i6, n4), r4 === E && (r4 = this._$AH[n4]), o5 || (o5 = !a2(r4) || r4 !== this._$AH[n4]), r4 === A ? t4 = A : t4 !== A && (t4 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e6 && this.j(t4);
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
  constructor(t4, i6, s4, e6, h3) {
    super(t4, i6, s4, e6, h3), this.type = 5;
  }
  _$AI(t4, i6 = this) {
    if ((t4 = M(this, t4, i6, 0) ?? A) === E) return;
    const s4 = this._$AH, e6 = t4 === A && s4 !== A || t4.capture !== s4.capture || t4.once !== s4.once || t4.passive !== s4.passive, h3 = t4 !== A && (s4 === A || e6);
    e6 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t4), this._$AH = t4;
  }
  handleEvent(t4) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t4) : this._$AH.handleEvent(t4);
  }
};
var Z = class {
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
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ?? (t2.litHtmlVersions = [])).push("3.3.2");
var D = (t4, i6, s4) => {
  const e6 = s4?.renderBefore ?? i6;
  let h3 = e6._$litPart$;
  if (void 0 === h3) {
    const t5 = s4?.renderBefore ?? null;
    e6._$litPart$ = h3 = new k(i6.insertBefore(c3(), t5), t5, void 0, s4 ?? {});
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
var t3 = { ATTRIBUTE: 1, CHILD: 2, PROPERTY: 3, BOOLEAN_ATTRIBUTE: 4, EVENT: 5, ELEMENT: 6 };
var e4 = (t4) => (...e6) => ({ _$litDirective$: t4, values: e6 });
var i5 = class {
  constructor(t4) {
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AT(t4, e6, i6) {
    this._$Ct = t4, this._$AM = e6, this._$Ci = i6;
  }
  _$AS(t4, e6) {
    return this.update(t4, e6);
  }
  update(t4, e6) {
    return this.render(...e6);
  }
};

// node_modules/lit-html/directives/class-map.js
var e5 = e4(class extends i5 {
  constructor(t4) {
    if (super(t4), t4.type !== t3.ATTRIBUTE || "class" !== t4.name || t4.strings?.length > 2) throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.");
  }
  render(t4) {
    return " " + Object.keys(t4).filter((s4) => t4[s4]).join(" ") + " ";
  }
  update(s4, [i6]) {
    if (void 0 === this.st) {
      this.st = /* @__PURE__ */ new Set(), void 0 !== s4.strings && (this.nt = new Set(s4.strings.join(" ").split(/\s/).filter((t4) => "" !== t4)));
      for (const t4 in i6) i6[t4] && !this.nt?.has(t4) && this.st.add(t4);
      return this.render(i6);
    }
    const r4 = s4.element.classList;
    for (const t4 of this.st) t4 in i6 || (r4.remove(t4), this.st.delete(t4));
    for (const t4 in i6) {
      const s5 = !!i6[t4];
      s5 === this.st.has(t4) || this.nt?.has(t4) || (s5 ? (r4.add(t4), this.st.add(t4)) : (r4.remove(t4), this.st.delete(t4)));
    }
    return E;
  }
});

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
    deviceKeymapMissingServer: "This device is not in the hub's catalog. Refresh the hub in the Sofabaton control panel, then reload this page.",
    deviceKeymapError: "Could not load this device's commands.",
    serverReadFailed: "Could not load hub data from the server. Check the connection and try again.",
    controlRefused: "The command could not be completed. Try again.",
    poweredOff: "Powered Off",
    defaultLayout: "Default activity layout",
    activityFallback: (id) => `Activity ${id}`,
    deviceFallback: (id) => `Device ${id}`,
    pickerName: "Sofabaton Virtual Remote",
    pickerDescription: "A configurable remote for the Sofabaton X1, X1S and X2 integration."
  },
  // The sidebar remote (docs/internal/sidebar-remote-plan.md): the panel
  // chrome and the sheet titles. Key names reuse `keys`, drawer names and
  // the powered-off label reuse `card`.
  sidebar: {
    title: "Virtual Remote",
    controlPanel: "Control Panel",
    hubMenu: "Choose a hub",
    back: "Back",
    hubReachable: "Reachable",
    hubUnreachable: "Unreachable",
    noHubs: "No Sofabaton hub is set up yet.",
    hubUnavailable: "Hub unavailable",
    remoteUnavailable: "The remote for this hub is unavailable.",
    controlPanelLoadFailed: "Could not load the Control Panel. Reload the page to try again.",
    activities: "Activities",
    devices: "Devices",
    allOff: "All off",
    off: "Off",
    modeToggle: "Switch between activities and devices",
    numberPad: "Number pad",
    pullHandle: "Open favorites and macros",
    pullHandleCommands: "Open commands",
    close: "Close",
    starting: "Starting",
    poweringOff: "Powering off",
    working: "Working",
    appConnected: "The Sofabaton app is connected",
    operations: {
      backup_restore: "Restoring backup",
      cache_refresh: "Refreshing hub cache",
      entity_sync: "Syncing to hub",
      backup_export: "Creating backup",
      wifi_deploy: "Deploying Wifi commands"
    }
  },
  assist: {
    label: "Key capture",
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
      max_width: "Maximum card width (px)",
      key_style: "Button style"
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
    favoriteDeviceNames: "Show device names",
    rowOptions: (groupLabel) => `${groupLabel} options`,
    visibleRows: "Visible rows",
    moveGroupUp: (groupLabel) => `Move ${groupLabel} up`,
    moveGroupDown: (groupLabel) => `Move ${groupLabel} down`,
    fewerVisibleRows: "Fewer visible rows",
    moreVisibleRows: "More visible rows",
    reorderGroupHandle: (groupLabel) => `Reorder ${groupLabel} (arrow keys)`,
    macros: "Macros",
    favorites: "Favorites",
    volume: "Volume",
    channel: "Channel",
    mediaControls: "Playback",
    dvr: "DVR",
    numpad: "Number pad",
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
    exit: "EXIT",
    rew: "Rewind",
    pause: "Pause",
    fwd: "Fast forward",
    red: "Red",
    green: "Green",
    yellow: "Yellow",
    blue: "Blue",
    a: "A",
    b: "B",
    c: "C",
    // X2 on-screen keypad; digits and dash stay untranslated like A/B/C.
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "Enter"
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
var REMOTE_CARD_LOCALE_ALIASES = {
  "zh": "zh-hans",
  "zh-cn": "zh-hans",
  "zh-sg": "zh-hans"
};
function resolveTranslation(language) {
  const raw = String(language || "").toLowerCase().replaceAll("_", "-");
  const lang = REMOTE_CARD_LOCALE_ALIASES[raw] ?? (raw.startsWith("zh-hans-") ? "zh-hans" : raw);
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
  const s4 = String(label || "").trim().toLowerCase();
  if (!s4) return false;
  if (s4 === REMOTE_CARD_STRINGS_EN.card.poweredOff.toLowerCase()) return true;
  return s4 === currentStrings.card.poweredOff.toLowerCase();
}

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
  "show_numpad",
  "show_macros_button",
  "show_favorites_button",
  "show_device_toggle",
  "mf_as_rows",
  "mf_row_visible_rows",
  "show_favorite_device_names"
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
  "show_numpad",
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
  show_numpad: true,
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
  BLUE: 193,
  // X2-only on-screen numeric keypad (docs/internal/numpad-plan.md). The
  // hub numbers them E-first (158) down to 1 (169); the card lays them out
  // in phone order.
  NUM_ENTER: 158,
  NUM_0: 159,
  NUM_DASH: 160,
  NUM_9: 161,
  NUM_8: 162,
  NUM_7: 163,
  NUM_6: 164,
  NUM_5: 165,
  NUM_4: 166,
  NUM_3: 167,
  NUM_2: 168,
  NUM_1: 169
};
var NUMPAD_KEY_IDS = Object.freeze([
  ID.NUM_1,
  ID.NUM_2,
  ID.NUM_3,
  ID.NUM_4,
  ID.NUM_5,
  ID.NUM_6,
  ID.NUM_7,
  ID.NUM_8,
  ID.NUM_9,
  ID.NUM_0,
  ID.NUM_DASH,
  ID.NUM_ENTER
]);
var POWERED_OFF_LABELS = /* @__PURE__ */ new Set(["powered off", "powered_off", "off"]);

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

// remote-card/src/remote-card-runtime-display.ts
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
  const s4 = String(state || "").trim().toLowerCase();
  return POWERED_OFF_LABELS.has(s4) || isLocalizedPoweredOffLabel(s4);
}
function isActivityOn(activityId, activities, currentActivityLabel) {
  if (activityId == null) return false;
  const id = Number(activityId);
  if (!Number.isFinite(id)) return false;
  const match = Array.isArray(activities) ? activities.find((activity) => Number(activity?.id) === id) : null;
  if (match && match.state != null && String(match.state).trim() !== "") {
    const s4 = String(match.state).trim().toLowerCase();
    return !isPoweredOffLabel(s4) && s4 !== "off";
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
      const v2 = assignedMap[actKey] ?? assignedMap[activityId];
      nextAssignedCache[actKey] = Array.isArray(v2) ? v2 : [];
    }
    if (macroMap && (hasOwn(macroMap, actKey) || hasOwn(macroMap, activityId))) {
      const v2 = macroMap[actKey] ?? macroMap[activityId];
      nextMacrosCache[actKey] = Array.isArray(v2) ? v2 : [];
    }
    if (favoriteMap && (hasOwn(favoriteMap, actKey) || hasOwn(favoriteMap, activityId))) {
      const v2 = favoriteMap[actKey] ?? favoriteMap[activityId];
      nextFavoritesCache[actKey] = Array.isArray(v2) ? v2 : [];
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

// remote-card/src/remote-card-long-press.ts
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
    const n4 = String(it?.name ?? "");
    const ic = String(it?.icon ?? "");
    const cmd = String(it?.command_id ?? "");
    const dev = String(it?.device_id ?? "");
    let act = "";
    try {
      act = it?.action ? JSON.stringify(it.action) : "";
    } catch (e6) {
      act = "[unserializable]";
    }
    return `${n4}|${ic}|${cmd}|${dev}|${act}`;
  });
  return `${parts.length}:${parts.join(";;")}`;
}

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

// remote-card/src/remote-card-shared.ts
var CARD_NAME = "Sofabaton Virtual Remote";
var LOG_ONCE_KEY = `__${CARD_NAME}_logged__`;
var PREVIEW_ACTIVITY_CACHE_KEY = "__sofabatonPreviewActivityCache__";
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
    /** Backoff after the backend could not answer a keymap (CR-F4a-1): without
     *  it, the render that follows the null answer re-fetched at once, a loop
     *  paced only by the HTTP round trip while the hub was busy or offline. */
    this.deviceKeymapRetry = /* @__PURE__ */ new Map();
    this.deviceKeymapRetryTimer = null;
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
    if (this.deviceKeymapRetryTimer) clearTimeout(this.deviceKeymapRetryTimer);
    this.deviceKeymapRetryTimer = null;
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
      // A binding-only edit changes only this; the keys' long-press arming
      // is computed at render time from it (CR-F4a-3).
      stableJsonSignature(attrs?.long_press_keys),
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
  /** Re-render once the keymap backoff ends, so the fetch is retried even
   *  when nothing else changes meanwhile. */
  scheduleKeymapRetry(delayMs) {
    if (this.deviceKeymapRetryTimer) clearTimeout(this.deviceKeymapRetryTimer);
    this.deviceKeymapRetryTimer = setTimeout(() => {
      this.deviceKeymapRetryTimer = null;
      this.invalidateFingerprint();
      this.onChange();
    }, delayMs);
  }
  async ensureDeviceKeymap(deviceId) {
    const key = String(deviceId);
    if (!this.keymapStale(deviceId)) return;
    const backend = this._backend;
    if (!backend) return;
    if (this.deviceKeymapFetching.has(key)) return;
    const retry = this.deviceKeymapRetry.get(key);
    if (retry && Date.now() < retry.at) return;
    const version = this.keymapVersion(deviceId);
    const previous = this.deviceKeymaps[key];
    if (!previous) {
      this.deviceKeymaps[key] = { status: "loading", buttons: [], commands: [], version };
    }
    this.deviceKeymapFetching.add(key);
    try {
      const response = await backend.deviceKeymap(deviceId);
      if (response === null) {
        const delayMs = Math.min((retry?.delayMs ?? 500) * 2, 3e4);
        this.deviceKeymapRetry.set(key, { at: Date.now() + delayMs, delayMs });
        this.scheduleKeymapRetry(delayMs);
        if (!previous) {
          delete this.deviceKeymaps[key];
          this.invalidateFingerprint();
          this.onChange();
        }
        return;
      }
      this.deviceKeymapRetry.delete(key);
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
    for (let i6 = 0; i6 < arr.length; i6++) {
      const norm = normalizeCustomFavorite(arr[i6], i6);
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
  /**
   * True when any of `ids` is bound on the current page. Unlike isEnabled
   * this fails CLOSED without data: it gates an affordance (the number pad
   * hint), not a key, so "unknown" must not render it.
   */
  anyKeyBound(ids) {
    if (this._mode === "device") {
      const entry = this.deviceKeymapState();
      if (!entry || entry.status !== "ready") return false;
      return ids.some((id) => entry.buttons.includes(id));
    }
    if (this.enabledButtonsInvalid) return false;
    const enabled = this.enabledButtons();
    return ids.some((id) => enabled.some((entry) => entry.command === id));
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
  /**
   * A control request was refused (the server answers 409/404, HA raises).
   * The card must not keep waiting for an activity switch that will not
   * happen; the rejection itself stops here (CR-F4a-7). The server backend
   * shows it on the host's banner.
   */
  controlFailed() {
    this.pendingActivity = null;
    this.pendingActivityAt = null;
    this.stopActivityLoading();
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
      const match = this.activities().find((a3) => a3.name === selected);
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
    const deviceNotice = mode !== "device" ? "" : keymapEntry?.status === "cache_miss" ? this._backend?.kind === "server" ? str().card.deviceKeymapMissingServer : str().card.deviceKeymapMissing : keymapEntry?.status === "error" ? str().card.deviceKeymapError : "";
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
      (a3, b3) => a3.name.localeCompare(b3.name, void 0, { sensitivity: "base" })
    );
  }
};

// remote-card/src/sidebar/sidebar-busy.ts
function sidebarBusyState(input) {
  const { runtime, strings } = input;
  if (runtime?.kind === "operation_running") {
    const operation = String(runtime.operation ?? "");
    return {
      inert: true,
      busy: true,
      reason: "operation",
      label: strings.operations[operation] ?? strings.working
    };
  }
  if (runtime?.kind === "app_connected") {
    return { inert: true, busy: false, reason: "app", label: strings.appConnected };
  }
  if (input.isUnavailable) {
    return { inert: true, busy: false, reason: "unavailable", label: null };
  }
  if (input.mode === "device") {
    if (input.deviceId == null) return { inert: true, busy: false, reason: "no-device", label: null };
    return { inert: false, busy: false, reason: null, label: null };
  }
  if (input.activityLoading) {
    const target = input.pendingActivity;
    const poweringOff = target != null && isOffLabel(target, strings.off);
    return {
      inert: true,
      busy: true,
      reason: "activity",
      label: poweringOff ? strings.poweringOff : strings.starting
    };
  }
  if (input.loadPending) {
    return { inert: true, busy: true, reason: "loading", label: strings.working };
  }
  if (input.isPoweredOff) {
    return { inert: true, busy: false, reason: "off", label: null };
  }
  return { inert: false, busy: false, reason: null, label: null };
}
function isOffLabel(label, offLabel) {
  const s4 = label.trim().toLowerCase();
  return s4 === offLabel.trim().toLowerCase() || s4 === "powered off" || s4 === "off";
}

// remote-card/src/remote-card-gestures.ts
var HOLD_REPEAT_DELAY_MS = 400;
var HOLD_REPEAT_INTERVAL_MS = 250;
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
      clearTimeout: options.clearTimeout ?? ((h3) => clearTimeout(h3)),
      setInterval: options.setInterval ?? ((fn, ms) => setInterval(fn, ms)),
      clearInterval: options.clearInterval ?? ((h3) => clearInterval(h3))
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
var LongPressTimer = class {
  constructor(fire, options = {}) {
    this.delayHandle = null;
    this.fired = false;
    this.fire = fire;
    this.delayMs = options.delayMs ?? LONG_PRESS_HOLD_MS;
    this.timers = {
      setTimeout: options.setTimeout ?? ((fn, ms) => setTimeout(fn, ms)),
      clearTimeout: options.clearTimeout ?? ((h3) => clearTimeout(h3))
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

// remote-card/src/sidebar/sidebar-hold.ts
var SIDEBAR_REPEAT_KEYS = /* @__PURE__ */ new Set([
  "up",
  "down",
  "left",
  "right",
  "volup",
  "voldn",
  "chup",
  "chdn"
]);
function sidebarHoldKind(key, hasLongPressBinding) {
  if (hasLongPressBinding) return "long-press";
  return SIDEBAR_REPEAT_KEYS.has(key) ? "repeat" : "tap";
}

// remote-card/src/sidebar/sidebar-press.ts
var SidebarPressController = class {
  constructor(root, handlers) {
    this.root = root;
    this.handlers = handlers;
    this.holds = /* @__PURE__ */ new Map();
    this.onDown = (ev) => {
      if (ev.isPrimary === false || typeof ev.button === "number" && ev.button !== 0) return;
      const el = this.keyElement(ev);
      if (!el) return;
      const at = { x: ev.clientX, y: ev.clientY };
      if (!el.hasAttribute("data-key")) {
        if (el.disabled) return;
        this.holds.set(ev.pointerId, { el, id: -1, kind: "visual", repeat: null, long: null, at });
        this.handlers.onPressed(el, true);
        return;
      }
      const key = this.handlers.resolve(el);
      if (!key || !this.handlers.isEnabled(key.id)) return;
      ev.preventDefault();
      const kind = sidebarHoldKind(key.key, this.handlers.hasLongPress(key.id));
      const hold = { el, id: key.id, kind, repeat: null, long: null, at };
      if (kind === "repeat") {
        hold.repeat = new HoldRepeatTimer((index) => {
          if (index === 1) this.handlers.haptic();
          this.handlers.onRepeat(key.id, index, el, at);
        });
        hold.repeat.start();
      } else if (kind === "long-press") {
        hold.long = new LongPressTimer(() => {
          this.handlers.haptic();
          this.handlers.onLongPress(key.id, el, at);
        });
        hold.long.start();
      }
      try {
        el.setPointerCapture?.(ev.pointerId);
      } catch {
      }
      this.holds.set(ev.pointerId, hold);
      this.handlers.onPressed(el, true);
    };
    this.onEnd = (ev) => {
      const hold = this.holds.get(ev.pointerId);
      if (!hold) return;
      if (ev.type === "lostpointercapture" && this.holds.get(ev.pointerId) !== hold) return;
      this.holds.delete(ev.pointerId);
      this.handlers.onPressed(hold.el, false);
      const fired = this.stopTimers(hold);
      if (hold.kind === "visual") return;
      if (ev.type !== "pointerup") return;
      if (fired) return;
      if (!this.pointerOver(hold.el, ev)) return;
      this.handlers.haptic();
      this.handlers.onTap(hold.id, hold.el, hold.at);
    };
    this.onLeave = (ev) => {
      if (ev.pointerType !== "mouse") return;
      const hold = this.holds.get(ev.pointerId);
      if (!hold || ev.target !== hold.el) return;
      this.holds.delete(ev.pointerId);
      this.handlers.onPressed(hold.el, false);
      this.stopTimers(hold);
    };
    this.onMove = (ev) => {
      const hold = this.holds.get(ev.pointerId);
      if (!hold || hold.kind !== "visual" || this.pointerOver(hold.el, ev)) return;
      this.holds.delete(ev.pointerId);
      this.handlers.onPressed(hold.el, false);
    };
    this.onKey = (ev) => {
      if (ev.key !== "Enter" && ev.key !== " ") return;
      const el = this.keyElement(ev);
      if (!el) return;
      const key = this.handlers.resolve(el);
      if (!key || !this.handlers.isEnabled(key.id)) return;
      ev.preventDefault();
      const r4 = el.getBoundingClientRect();
      this.handlers.onTap(key.id, el, { x: r4.left + r4.width / 2, y: r4.top + r4.height / 2 });
    };
    this.onContextMenu = (ev) => {
      if (this.keyElement(ev)) ev.preventDefault();
    };
    root.addEventListener("pointerdown", this.onDown, { capture: true });
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      root.addEventListener(type, this.onEnd, { capture: true });
    }
    root.addEventListener("pointerleave", this.onLeave, { capture: true });
    root.addEventListener("pointermove", this.onMove, { capture: true });
    root.addEventListener("keydown", this.onKey);
    root.addEventListener("contextmenu", this.onContextMenu);
  }
  dispose() {
    for (const hold of this.holds.values()) this.stopTimers(hold);
    this.holds.clear();
  }
  /** The element under a pointer event that is a key or a `[data-press]` item, or null. */
  keyElement(ev) {
    const path = typeof ev.composedPath === "function" ? ev.composedPath() : [];
    for (const node of path) {
      if (node instanceof Element && (node.hasAttribute("data-key") || node.hasAttribute("data-press"))) return node;
      if (node === this.root) break;
    }
    return null;
  }
  stopTimers(hold) {
    let fired = false;
    if (hold.repeat) fired = hold.repeat.stop() || fired;
    if (hold.long) fired = hold.long.stop() || fired;
    return fired;
  }
  pointerOver(el, ev) {
    const rect = el.getBoundingClientRect();
    if (!rect.width && !rect.height) return true;
    return ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
  }
};

// remote-card/src/sidebar/sidebar-layout.ts
var MIN_PORTRAIT_WHEEL = 240;
var LANDSCAPE_HYSTERESIS = 24;
var MIN_LANDSCAPE_WIDTH = 640;
var PORTRAIT_WHEEL_SHARE = 0.76;
var PORTRAIT_MAX_WIDTH = 560;
var PORTRAIT_GAPS = 5;
function portraitWheelSize(m2) {
  const fixed = m2.fixedRows.reduce((sum, h3) => sum + h3, 0) + PORTRAIT_GAPS * m2.gap + m2.pad + m2.pull;
  const byHeight = m2.height - fixed;
  const byWidth = PORTRAIT_WHEEL_SHARE * (Math.min(m2.width, PORTRAIT_MAX_WIDTH) - 2 * m2.pad);
  return Math.min(byHeight, byWidth);
}
function wantsLandscape(m2, current = false) {
  if (m2.width < MIN_LANDSCAPE_WIDTH || m2.width <= m2.height) return false;
  const floor = current ? MIN_PORTRAIT_WHEEL + LANDSCAPE_HYSTERESIS : MIN_PORTRAIT_WHEEL;
  return portraitWheelSize(m2) < floor;
}

// remote-card/src/sidebar/sidebar-remote-styles.ts
var sidebarRemoteStyles = i`
  :host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    color: var(--primary-text-color);
    font-family: var(--ha-font-family-body, Roboto, "Segoe UI", system-ui, sans-serif);
    -webkit-font-smoothing: antialiased;
    /* derived tokens */
    --sb-card: var(--ha-card-background, var(--card-background-color, var(--primary-background-color)));
    --sb-ground: var(--primary-background-color);
    --sb-pill: color-mix(in srgb, var(--primary-text-color) 9%, var(--sb-ground));
    --sb-sheet: color-mix(in srgb, var(--primary-text-color) 3%, var(--primary-background-color));
    --sb-disc-a: color-mix(in srgb, var(--primary-text-color) 5%, var(--sb-ground));
    --sb-disc-b: color-mix(in srgb, var(--primary-text-color) 15%, var(--sb-ground));
    --sb-muted: color-mix(in srgb, var(--secondary-text-color) 30%, var(--primary-text-color));
    --sb-accent-text: color-mix(in srgb, var(--primary-color) 45%, var(--primary-text-color));
    /* hover / press surfaces, the card's recipe: a text-colour tint over the resting surface */
    --sb-hover: color-mix(in srgb, var(--primary-text-color) 10%, transparent);
    --sb-press: color-mix(in srgb, var(--primary-text-color) 18%, transparent);
    --sb-on-primary: #fff;
    --sb-halo: rgba(255, 255, 255, 0.75);
    --sb-ok-dot: #7f9a72;
    --sb-err: #c0504d;
    --sb-gap: clamp(8px, 1.5vh, 26px);
    --sb-pad: clamp(20px, 3vmin, 24px);
    --sb-row-h: clamp(42px, 6vh, 72px);
    --sb-ico: clamp(18px, 3.4vmin, 30px);
  }
  :host([data-glass]) {
    --sb-ground: var(--sb-card);
  }
  *, *::before, *::after { box-sizing: border-box; }
  button {
    font: inherit;
    color: inherit;
    background: none;
    border: 0;
    padding: 0;
    margin: 0;
    -webkit-tap-highlight-color: transparent;
    -webkit-touch-callout: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    cursor: pointer;
  }
  .sheet button, .segs button, .filter { touch-action: manipulation; }
  button:focus-visible { outline: 2px solid color-mix(in srgb, var(--primary-color) 55%, transparent); outline-offset: 2px; }
  ha-icon { display: inline-flex; --mdc-icon-size: var(--sb-ico); }
  .app {
    position: relative;
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /* No background of its own: the panel host paints the dashboard ground
       (wallpaper themes carry a fixed-attachment image, and painting that
       twice doubles the repaint cost of every resize frame). */
  }

  /* ---------- the remote column ---------- */
  .remote {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: var(--sb-gap);
    padding: var(--sb-pad) var(--sb-pad) 0;
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    position: relative;
    isolation: isolate;
  }
  .remote > * { min-width: 0; min-height: 0; flex: 0 0 auto; }
  .remote > .wheel-area { flex: 1000 1 0; max-height: calc((min(100vw, 560px) - 2 * var(--sb-pad)) * 0.76); }
  .remote > .sp { flex: 1 1 0; margin-top: calc(-1 * var(--sb-gap)); }
  .remote > .sp:last-child { margin-top: 0; }

  /* ---------- activity line ---------- */
  .activity { display: flex; align-items: center; gap: 12px; height: var(--sb-row-h); position: relative; }
  .activity .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; text-align: start; }
  .activity .eyebrow { font-size: 11px; letter-spacing: 0.12em; color: var(--sb-accent-text); text-transform: uppercase; }
  .activity .name { display: flex; align-items: center; gap: 4px; font-size: clamp(18px, 2.8vmin, 26px); }
  .activity .name span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .activity .name ha-icon { --mdc-icon-size: 22px; opacity: 0.7; flex: 0 0 auto; }
  .round {
    width: calc(var(--sb-row-h) * 0.85);
    height: calc(var(--sb-row-h) * 0.85);
    border-radius: 50%;
    background: var(--sb-pill);
    display: grid;
    place-items: center;
    color: var(--primary-color);
    flex: 0 0 auto;
    transition: transform 90ms ease, filter 90ms ease;
  }
  .round.power { color: var(--primary-text-color); position: relative; }
  .round.power ha-icon { opacity: 0.8; }
  .round.pressed { transform: scale(0.92); }
  .power::after {
    content: "";
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    opacity: 0;
    border: 2px solid color-mix(in srgb, var(--primary-color) 22%, transparent);
    border-top-color: var(--primary-color);
    transition: opacity 0.15s;
  }
  .power.busy { pointer-events: none; }
  .power.busy::after { opacity: 1; animation: spin 0.9s linear infinite; }
  .power.busy ha-icon { opacity: 0.4; }
  .activity .spin {
    display: none;
    width: 18px; height: 18px; border-radius: 50%; flex: 0 0 auto;
    border: 2px solid color-mix(in srgb, var(--primary-color) 25%, transparent);
    border-top-color: var(--primary-color);
    animation: spin 0.8s linear infinite;
  }
  .app.busy .activity .spin { display: block; }
  .app.busy .activity .name ha-icon { display: none; }
  .activity .bar {
    position: absolute; left: 0; right: 0; bottom: -6px; height: 2px; border-radius: 1px; overflow: hidden; opacity: 0;
    background: color-mix(in srgb, var(--primary-color) 18%, transparent);
    transition: opacity 0.2s;
  }
  .activity .bar::after {
    content: ""; position: absolute; top: 0; bottom: 0; width: 35%; border-radius: 1px; background: var(--primary-color);
    animation: slide 1.4s cubic-bezier(0.4, 0, 0.2, 1) infinite;
  }
  .app.busy .activity .bar { opacity: 1; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes slide { from { left: -35%; } to { left: 100%; } }

  /* inert: everything below the activity line veils and stops responding */
  .remote > *, .pull { transition: opacity 0.25s ease; }
  .app.inert .remote > :not(.activity) { opacity: 0.4; pointer-events: none; }
  .app.inert .activity .power { pointer-events: none; }
  /* "pick" = nothing to send to yet (device mode without a device, or
     powered off): the keys are inert but the selector stays live; in device
     mode the pull handle too (it opens the device list) */
  .app.inert:not(.pick) .pull, .app.inert.powered-off .pull { opacity: 0.4; pointer-events: none; }

  /* ---------- the wheel ---------- */
  .wheel-area { container-type: size; display: grid; place-items: center; perspective: 700px; }
  .wheel-wrap { position: relative; width: min(76cqw, 100cqh); aspect-ratio: 1; }
  .wheel { position: absolute; inset: 0; transition: transform 110ms ease; transform-style: preserve-3d; }
  .face { position: absolute; inset: 0; transition: opacity 240ms ease, transform 260ms cubic-bezier(0.2, 0.7, 0.2, 1), visibility 0s linear 240ms; }
  .disc {
    position: absolute; inset: 0; border-radius: 50%;
    background: radial-gradient(circle at 50% 42%, var(--sb-disc-a) 0%, var(--sb-disc-b) 100%);
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.35);
    transition: box-shadow 110ms ease;
  }
  .disc::before {
    content: ""; position: absolute; inset: 0; border-radius: 50%; opacity: 0; transition: opacity 110ms ease;
    background: linear-gradient(var(--tilt-angle, 0deg), rgba(0, 0, 0, 0.07), transparent 45%, transparent 60%, rgba(255, 255, 255, 0.18));
  }
  .wheel[data-tilt] .disc { box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.35); }
  .wheel[data-tilt] .disc::before { opacity: 1; }
  .wheel[data-tilt="up"] { transform: rotateX(13deg); }
  .wheel[data-tilt="down"] { transform: rotateX(-13deg); }
  .wheel[data-tilt="left"] { transform: rotateY(-13deg); }
  .wheel[data-tilt="right"] { transform: rotateY(13deg); }
  /* The angle is keyed on data-light, which outlives data-tilt, so the fade after release keeps the pressed direction. */
  .wheel[data-light="up"] .disc::before { --tilt-angle: 180deg; }
  .wheel[data-light="down"] .disc::before { --tilt-angle: 0deg; }
  .wheel[data-light="left"] .disc::before { --tilt-angle: 90deg; }
  .wheel[data-light="right"] .disc::before { --tilt-angle: 270deg; }
  .dirs { position: absolute; inset: 0; border-radius: 50%; overflow: hidden; }
  .dir { position: absolute; inset: 0; display: block; color: var(--primary-text-color); border-radius: 0; }
  .dir.up { clip-path: polygon(0 0, 100% 0, 50% 50%); }
  .dir.down { clip-path: polygon(0 100%, 100% 100%, 50% 50%); }
  .dir.left { clip-path: polygon(0 0, 0 100%, 50% 50%); }
  .dir.right { clip-path: polygon(100% 0, 100% 100%, 50% 50%); }
  .dir ha-icon { position: absolute; --mdc-icon-size: clamp(22px, 11cqmin, 40px); opacity: 0.8; }
  .dir.up ha-icon { left: 50%; top: 9%; translate: -50% 0; }
  .dir.down ha-icon { left: 50%; bottom: 9%; translate: -50% 0; }
  .dir.left ha-icon { top: 50%; left: 9%; translate: 0 -50%; }
  .dir.right ha-icon { top: 50%; right: 9%; translate: 0 -50%; }
  .ok { z-index: 1; }
  .ok {
    position: absolute; left: 32%; top: 32%; width: 36%; height: 36%; border-radius: 50%;
    background: var(--primary-color); color: var(--sb-on-primary); display: grid; place-items: center;
    font-size: clamp(14px, 7.5cqmin, 36px); letter-spacing: 0.06em; font-weight: 500;
    box-shadow: 0 4px 14px color-mix(in srgb, var(--primary-color) 35%, transparent);
    transition: transform 90ms ease, filter 90ms ease;
  }
  .numpad { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(4, 1fr); gap: 4%; padding: 2%; }
  .numpad button {
    border-radius: 24%; background: var(--sb-pill); display: grid; place-items: center;
    font-size: clamp(16px, 7cqmin, 26px); font-weight: 500; transition: transform 90ms ease, filter 90ms ease;
  }
  .face-wheel { opacity: 1; transform: scale(1); visibility: visible; transition-delay: 0s; }
  .wheel.flipped .face-wheel { opacity: 0; transform: scale(0.88); pointer-events: none; visibility: hidden; transition-delay: 0s, 0s, 240ms; }
  .face-pad { opacity: 0; transform: scale(1.06); pointer-events: none; visibility: hidden; }
  .wheel.flipped .face-pad { opacity: 1; transform: none; pointer-events: auto; visibility: visible; transition-delay: 0s; }
  .face-pad button { opacity: 0; transform: translateY(8px); transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.7, 0.2, 1); }
  .wheel.flipped .face-pad button { opacity: 1; transform: none; transition-delay: calc(var(--i) * 16ms + 60ms); }
  .wheel.flipped .face-pad button.off { opacity: 0.28; }
  .wheel.flipped .face-pad button.pressed { transform: scale(0.94); transition-delay: 0s; }
  .numtoggle {
    position: absolute; width: 36px; height: 36px; border-radius: 50%;
    left: calc(50% + var(--sb-orbit-r) * 0.819 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.574 - 18px);
    background: var(--sb-pill); color: var(--primary-color); display: grid; place-items: center;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    transition: transform 90ms ease, filter 90ms ease, box-shadow 90ms ease, opacity 220ms ease 140ms, visibility 0s linear 0s;
  }
  .numtoggle ha-icon { --mdc-icon-size: 20px; }
  .numtoggle.pressed { transform: scale(0.9); box-shadow: none; }
  /* The six satellites (toggle, DVR, EXIT, A, B, C) fade with the wheel face as the
     number pad opens and fade back in once it closes. Hidden, not displayed away,
     so the fade can run both ways; visibility keeps them out of the tab order. */
  .wheel-wrap.flipped .numtoggle, .wheel-wrap.flipped .orbit {
    opacity: 0; pointer-events: none; visibility: hidden;
    transition: transform 90ms ease, opacity 160ms ease, visibility 0s linear 160ms;
  }
  /* The pad toggle, DVR, EXIT and A/B/C (X2): small round keys on one circle around the wheel,
     radius (50% - 16px) * sqrt2 (the toggle's old corner seat, kept so the outermost keys still
     clear the wrap by the same margin). EXIT sits 5 deg above the horizontal on the right, DVR
     and the toggle step 20 deg down from it (-5, 15, 35 deg); A, B, C mirror EXIT, DVR and the
     toggle across the vertical axis (185, 165, 145 deg), so the two sides are exact reflections */
  .wheel-wrap { --sb-orbit-r: calc((50% - 16px) * 1.4142); }
  .orbit {
    position: absolute; width: 36px; height: 36px; border-radius: 50%; background: var(--sb-pill);
    color: var(--primary-text-color); display: grid; place-items: center; font-size: 9px; font-weight: 600; letter-spacing: 0.04em;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    transition: transform 90ms ease, background 90ms ease, opacity 220ms ease 140ms, visibility 0s linear 0s;
  }
  .orbit.dvr { left: calc(50% + var(--sb-orbit-r) * 0.966 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.259 - 18px); }
  .orbit.exit { left: calc(50% + var(--sb-orbit-r) * 0.996 - 18px); top: calc(50% - var(--sb-orbit-r) * 0.087 - 18px); }
  .orbit.a { left: calc(50% - var(--sb-orbit-r) * 0.996 - 18px); top: calc(50% - var(--sb-orbit-r) * 0.087 - 18px); }
  .orbit.b { left: calc(50% - var(--sb-orbit-r) * 0.966 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.259 - 18px); }
  .orbit.c { left: calc(50% - var(--sb-orbit-r) * 0.819 - 18px); top: calc(50% + var(--sb-orbit-r) * 0.574 - 18px); }
  .orbit.abc { font-size: 12px; }
  .orbit.pressed { transform: scale(0.9); background: color-mix(in srgb, var(--primary-text-color) 18%, var(--sb-pill)); }
  .orbit.off { opacity: 0.35; }

  /* ---------- rows ---------- */
  .bare { display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; gap: var(--sb-gap); height: calc(var(--sb-row-h) * 0.75); }
  .seg { display: flex; align-items: center; justify-content: center; color: var(--primary-text-color); font-size: var(--sb-ico); font-weight: 500; position: relative; z-index: 0; height: 100%; transition: transform 90ms ease, filter 90ms ease; }
  .seg ha-icon { opacity: 0.85; }
  .seg.lbl { flex-direction: column; gap: 1px; }
  .seg.lbl ha-icon { --mdc-icon-size: calc(var(--sb-ico) * 0.8); }
  .seg.lbl small { font-size: clamp(10px, 1.5vmin, 13px); letter-spacing: 0.08em; color: var(--sb-muted); }
  .seg.text { font-size: clamp(14px, 2.1vmin, 19px); letter-spacing: 0.06em; }
  /* the CH rocker's centre on an X1/X1S has no guide key: the icon is a label, not a key */
  .seg.deco { cursor: default; }
  .bare > .seg::before {
    content: ""; position: absolute; left: 50%; top: 50%; translate: -50% -50%; z-index: -1; opacity: 0;
    width: min(100%, 92px); height: 100%; border-radius: 999px; background: var(--sb-pill); transition: opacity 90ms ease;
  }
  .bare > .seg.pressed::before { opacity: 1; }
  .media { height: var(--sb-row-h); grid-template-columns: 1fr 1.5fr 1fr; align-items: center; }
  .media > .seg { height: calc(var(--sb-row-h) * 0.75); }
  .media .pill { height: 100%; grid-template-columns: 1fr 1fr; }
  .media .pill.single { grid-template-columns: 1fr; }
  .pill {
    background: var(--sb-pill); border-radius: 999px; height: var(--sb-row-h); display: grid; align-items: stretch;
    position: relative; overflow: hidden; transition: transform 110ms ease; transform-style: preserve-3d;
  }
  .pill::before {
    content: ""; position: absolute; inset: 0; opacity: 0; transition: opacity 110ms ease; pointer-events: none;
    background: linear-gradient(var(--tilt-angle, 90deg), rgba(0, 0, 0, 0.07), transparent 45%);
  }
  /* Each pill carries its own perspective so the vanishing point is its centre; a shared
     one on the row made the outer ends (VOL-, CH+) dip deeper than their inner neighbours. */
  .pill[data-tilt="left"] { transform: perspective(700px) rotateY(-14deg); }
  .pill[data-tilt="right"] { transform: perspective(700px) rotateY(14deg); }
  .pill[data-tilt="left"]::before, .pill[data-tilt="right"]::before { opacity: 1; }
  .pill[data-light="left"]::before { --tilt-angle: 90deg; }
  .pill[data-light="right"]::before { --tilt-angle: 270deg; }
  .pill[data-tilt="center"] { transform: scale(0.96); }
  .pill .seg.pressed, .dir.pressed { transform: none; filter: none; }
  .pill .seg.pressed { background: none; }
  .rockers { display: grid; grid-template-columns: 1fr 1fr; gap: var(--sb-gap); }
  .rockers .pill { grid-template-columns: 1fr 1fr 1fr; }
  .colors { display: grid; grid-template-columns: repeat(4, 1fr); gap: var(--sb-gap); }
  .colors button { height: calc(var(--sb-row-h) * 0.45); border-radius: 999px; transition: transform 90ms ease, filter 90ms ease; }
  .colors .red { background: color-mix(in srgb, #c0504d 85%, var(--sb-pill)); }
  .colors .green { background: color-mix(in srgb, #5f8f64 85%, var(--sb-pill)); }
  .colors .yellow { background: color-mix(in srgb, #c9a23f 85%, var(--sb-pill)); }
  .colors .blue { background: color-mix(in srgb, #5a86b1 85%, var(--sb-pill)); }
  .pressed { transform: scale(0.94); }
  .pill .seg.pressed, .numpad button.pressed { background: var(--sb-press); }
  .round.pressed, .numtoggle.pressed, .tile.pressed, .lrow.pressed, .row.pressed { background: color-mix(in srgb, var(--primary-text-color) 18%, var(--sb-pill)); }
  .pull .knob.pressed { background: color-mix(in srgb, var(--primary-text-color) 18%, var(--sb-pill)); }
  .ok.pressed { background: color-mix(in srgb, #000 14%, var(--primary-color)); }
  .colors button.pressed { outline: 2px solid color-mix(in srgb, var(--primary-text-color) 45%, transparent); outline-offset: 2px; }

  /* long-press marker: a key that holds (fires its binding) instead of repeating carries a small dot under its mark */
  /* ---------- bound / unbound ---------- */
  .off { cursor: default !important; pointer-events: none; }
  .seg.off, .dir.off, .numpad button.off { opacity: 0.28; }
  .bare > .seg.off::before { display: none; }
  .pill.off { opacity: 0.45; }
  .pill.off .seg.off { opacity: 1; }
  .ok.off { background: var(--sb-pill); color: var(--primary-text-color); box-shadow: none; opacity: 0.4; }
  .colors button.off { filter: grayscale(0.7); opacity: 0.3; }

  /* ---------- hover (mouse only) ---------- */
  @media (hover: hover) {
    .numpad button:not(.off):not(.pressed):hover { background: var(--sb-hover); }
    .orbit:not(.off):not(.pressed):hover, .round:not(.pressed):hover, .numtoggle:not(.pressed):hover, .tile:not(.pressed):hover, .lrow:not(.pressed):hover, .row:not(.pressed):hover, .segs .close:hover, .pull .knob:not(.pressed):hover { background: color-mix(in srgb, var(--primary-text-color) 10%, var(--sb-pill)); }
    .row.current:not(.pressed):hover { background: color-mix(in srgb, var(--primary-text-color) 10%, color-mix(in srgb, var(--primary-color) 12%, var(--sb-pill))); }
    .colors button:not(.off):hover { outline: 2px solid color-mix(in srgb, var(--primary-text-color) 30%, transparent); outline-offset: 2px; }
    /* darken, never lighten: the label is white on most primaries and lightening would cost it contrast */
    .ok:not(.off):not(.pressed):hover { background: color-mix(in srgb, #000 8%, var(--primary-color)); }
    .bare > .seg:not(.off):not(.pressed):hover::before { opacity: 0.55; }
    .segs .s:not(.active):hover { color: var(--primary-text-color); background: var(--sb-hover); }
  }

  /* ---------- feedback ---------- */
  /* z-index above the sheet (7): the sheet's tiles and rows ring too */
  .ring {
    position: absolute; border-radius: 50%; border: 2px solid var(--primary-color); pointer-events: none; z-index: 8;
    opacity: 0.55; animation: ring 520ms cubic-bezier(0.2, 0.7, 0.3, 1) forwards; will-change: transform, opacity; isolation: isolate;
  }
  .ring.err { border-color: var(--sb-err); animation-name: ring-err; }
  @keyframes ring { from { transform: scale(0.55); opacity: 0.55; } to { transform: scale(1.9); opacity: 0; } }
  @keyframes ring-err { 0% { transform: scale(0.55); opacity: 0.7; } 30% { transform: scale(1.1); opacity: 0.7; } 100% { transform: scale(1.3); opacity: 0; } }

  /* ---------- pull handle ---------- */
  .pull {
    flex: 0 0 auto; display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%;
    padding: 6px 0 calc(8px + env(safe-area-inset-bottom)); color: var(--sb-muted);
  }
  .pull .grip { width: 44px; height: 4px; border-radius: 2px; background: color-mix(in srgb, var(--primary-text-color) 22%, transparent); }
  .pull .knob { width: 34px; height: 34px; border-radius: 50%; background: var(--sb-pill); display: grid; place-items: center; transition: transform 90ms ease, filter 90ms ease; }
  .pull .knob ha-icon { --mdc-icon-size: 22px; opacity: 0.75; }
  .pull .knob.pressed { transform: scale(0.9); }

  /* ---------- the sheet ---------- */
  .scrim { position: absolute; inset: 0; background: rgba(0, 0, 0, 0.35); opacity: 0; pointer-events: none; transition: opacity 0.2s; z-index: 6; }
  .sheet {
    position: absolute; left: 0; right: 0; bottom: 0; height: 68%; max-width: 560px; margin: 0 auto; z-index: 7;
    background: var(--sb-sheet); border-radius: 22px 22px 0 0; box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.18);
    transform: translateY(105%); transition: transform 0.25s; display: flex; flex-direction: column;
    color: var(--primary-text-color);
  }
  :host([data-glass]) .sheet {
    background: linear-gradient(var(--sb-card), var(--sb-card)), linear-gradient(var(--sb-card), var(--sb-card));
    -webkit-backdrop-filter: blur(24px); backdrop-filter: blur(24px);
  }
  .app.open .scrim { opacity: 1; pointer-events: auto; }
  .app.open .sheet { transform: none; }
  .sheet .grip { width: 36px; height: 4px; border-radius: 2px; background: var(--divider-color); margin: 10px auto 0; flex: 0 0 auto; }
  .segs { display: flex; align-items: center; gap: 10px; padding: 10px 16px 8px; flex: 0 0 auto; }
  .segs .ctl { flex: 1; display: grid; grid-template-columns: repeat(2, 1fr); background: var(--sb-pill); border-radius: 999px; padding: 3px; }
  .segs .s { height: 34px; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 13px; color: var(--sb-muted); }
  .segs .s ha-icon { --mdc-icon-size: 16px; }
  .segs .s.active { background: var(--sb-sheet); color: var(--primary-text-color); box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12); }
  .segs .s.active ha-icon { color: var(--sb-accent-text); }
  .segs .close, .phead .close { width: 34px; height: 34px; border-radius: 50%; background: var(--sb-pill); display: grid; place-items: center; flex: 0 0 auto; }
  .segs .close ha-icon, .phead .close ha-icon { --mdc-icon-size: 18px; opacity: 0.7; }
  .phead { display: flex; align-items: center; gap: 10px; padding: 12px 16px 8px; font-size: 17px; flex: 0 0 auto; }
  .phead .eyebrow { font-size: 11px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--sb-accent-text); display: block; }
  .phead .titles { flex: 1; min-width: 0; }
  .phead .close { margin-left: auto; }
  .filter { margin: 2px 16px 8px; height: 40px; border-radius: 12px; background: var(--sb-pill); display: flex; align-items: center; gap: 8px; padding: 0 12px; flex: 0 0 auto; }
  .filter ha-icon { --mdc-icon-size: 18px; color: var(--sb-muted); }
  .filter input { flex: 1; min-width: 0; background: none; border: 0; font: inherit; font-size: 14px; color: var(--primary-text-color); outline: none; }
  .filter input::placeholder { color: var(--sb-muted); }
  .body { flex: 1; overflow-y: auto; padding: 4px 16px calc(16px + env(safe-area-inset-bottom)); -webkit-overflow-scrolling: touch; }
  .empty { padding: 24px 8px; text-align: center; color: var(--sb-muted); font-size: 14px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .tile {
    display: grid; grid-template-columns: 40px 1fr; align-items: center; gap: 12px; height: 64px; padding: 0 12px; text-align: start;
    border-radius: 14px; background: var(--sb-pill); color: var(--primary-text-color); min-width: 0; transition: transform 90ms ease, filter 90ms ease;
  }
  .tile .ic { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .tile .ic ha-icon, .lrow .li { --mdc-icon-size: 20px; opacity: 0.8; }
  .t { display: grid; gap: 2px; min-width: 0; }
  .t b { font-weight: 500; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .t small { font-size: 12px; color: var(--sb-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list { display: grid; gap: 8px; }
  .lrow {
    display: grid; grid-template-columns: 24px 1fr 24px; align-items: center; gap: 12px; height: 52px; padding: 0 12px 0 14px; text-align: start;
    border-radius: 14px; background: var(--sb-pill); color: var(--primary-text-color); transition: transform 90ms ease, filter 90ms ease;
  }
  .lrow .li { justify-self: center; }
  .lrow .chev { --mdc-icon-size: 22px; opacity: 0.6; }
  .rows { display: grid; gap: 6px; }
  .row {
    display: grid; grid-template-columns: 36px 1fr auto; align-items: center; gap: 12px; height: 52px; padding: 0 12px 0 10px; text-align: start;
    border-radius: 14px; background: var(--sb-pill); color: var(--primary-text-color); font-size: 15px; transition: transform 90ms ease, filter 90ms ease;
  }
  .row .ic { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
  .row .ic ha-icon { --mdc-icon-size: 20px; opacity: 0.8; }
  .row .st { width: 8px; height: 8px; border-radius: 50%; background: var(--divider-color); }
  /* the current row: tinted surface, accent on the icon and dot, the name stays text-coloured (readable on every theme) */
  .row.current { color: var(--primary-text-color); background: color-mix(in srgb, var(--primary-color) 12%, var(--sb-pill)); }
  .row.current .ic { color: var(--sb-accent-text); }
  .row.current .ic { background: color-mix(in srgb, var(--primary-color) 18%, transparent); }
  .row.current .ic ha-icon { opacity: 1; }
  .row.current .st { background: var(--primary-color); box-shadow: 0 0 0 3px color-mix(in srgb, var(--primary-color) 25%, transparent); }
  .row span.name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---------- notices ---------- */
  .notice { margin: 0 var(--sb-pad); padding: 10px 14px; border-radius: 12px; background: var(--sb-pill); color: var(--sb-muted); font-size: 13px; text-align: center; }

  /* ---------- landscape: the wheel (with its satellites) left, the key rows right ----------
     Only when the portrait column would leave the wheel too small (the element
     measures that, sidebar-layout.ts, and sets .landscape). The activity line
     spans both columns; the four key rows sit in equal-height tracks on the
     right (so they space out like the portrait spacers do) and the wheel area
     stretches over all of them. The portrait spacers and the square cap on the
     wheel area are dropped. */
  .app.landscape .remote {
    display: grid;
    /* Both columns have a definite width (the wheel column follows the
       height, the key column is capped) so the free space splits evenly:
       edge to wheel = wheel to keys = keys to edge. */
    /* percentages, not cq units: in the container's own declarations cq
       units have no ancestor container and fall back to the viewport, which
       is wider than the panel whenever HA's sidebar is docked */
    grid-template-columns: auto clamp(260px, 40%, 460px);
    grid-template-rows: auto repeat(4, minmax(0, 1fr));
    justify-content: space-evenly;
    /* the side padding is the edge zone; the same amount between the columns
       keeps edge-to-wheel, wheel-to-keys and keys-to-edge equal */
    column-gap: var(--sb-pad);
    row-gap: var(--sb-gap);
    align-items: center;
    max-width: 1040px;
    container-type: size;
    /* The split only happens on hosts too short for the portrait column, so
       the block always fills the height: the four tracks share it like the
       portrait spacers do, the wheel grows with them, the pull stays at the
       bottom. */
  }
  .app.landscape .remote > .sp { display: none; }
  .app.landscape .remote > .activity, .app.landscape .remote > .notice { grid-column: 1 / -1; }
  /* as wide as the wheel plus its satellites (they reach ~0.2 diameters past the
     wrap on either side); the height is the four tracks under the activity line */
  .app.landscape .remote > .wheel-area {
    grid-column: 1; grid-row: 2 / -1; align-self: stretch; justify-self: center; max-height: none;
    /* the wheel's box: the wrap, plus the satellites when the hub has them (X2):
       A and EXIT sit at 5 deg off the horizontal on the orbit radius
       (D/2 - 16px) * sqrt2, in 36px discs, so the box is 1.408 D - 9px */
    --sb-wheel-box: 1;
    --sb-wheel-box-off: 0px;
    /* by height, but never wider than what the key column (its width above)
       and the column gap leave of the remote's content box */
    width: min(
      calc((100cqh - var(--sb-row-h) - var(--sb-gap)) * var(--sb-wheel-box) + var(--sb-wheel-box-off)),
      calc(100cqw - min(max(260px, 40cqw), 460px) - var(--sb-pad))
    );
  }
  .app.landscape .remote > .wheel-area.has-orbit { --sb-wheel-box: 1.408; --sb-wheel-box-off: -9px; }
  .app.landscape .remote:has(> .notice) > .wheel-area { grid-row: 3 / -1; }
  .app.landscape .remote > .nav, .app.landscape .remote > .media, .app.landscape .remote > .rockers, .app.landscape .remote > .colors { grid-column: 2; width: 100%; }
  .app.landscape .wheel-wrap { width: min(100cqh, calc((100cqw - var(--sb-wheel-box-off)) / var(--sb-wheel-box))); }
  /* with the keys beside the wheel there is no half-height to speak of: the sheet takes the full view */
  .app.landscape .sheet { height: 100%; border-radius: 0; }

  @media (prefers-reduced-motion: reduce) {
    .wheel, .pill, .face, .face-pad button, .sheet, .scrim, .remote > *, .pull, .orbit, .numtoggle { transition: none; }
    .ring { animation-duration: 1ms; }
    .wheel[data-tilt], .pill[data-tilt] { transform: none; }
  }
`;

// remote-card/src/shims/palette.ts
var REMOTE_WEB_PALETTE_VARS = {
  "light": {
    "--primary-color": "#009ac7",
    "--rgb-primary-color": "0, 154, 199",
    "--primary-text-color": "#141414",
    "--rgb-primary-text-color": "33, 33, 33",
    "--secondary-text-color": "#5e5e5e",
    "--disabled-text-color": "#bdbdbd",
    "--primary-background-color": "#fafafa",
    "--secondary-background-color": "#e5e5e5",
    "--card-background-color": "#ffffff",
    "--divider-color": "rgba(0, 0, 0, 0.12)",
    "--error-color": "#db4437",
    "--rgb-error-color": "219, 68, 55",
    "--warning-color": "#ffa600",
    "--success-color": "#43a047",
    "--info-color": "#039be5",
    "--state-icon-color": "#44739e",
    "--input-fill-color": "rgb(245, 245, 245)",
    "--ha-color-form-background": "#f3f3f3",
    "--ha-color-fill-neutral-normal-resting": "#e6e6e6",
    "--ha-color-fill-neutral-quiet-hover": "#e6e6e6",
    "--ha-color-fill-primary-quiet-hover": "#dff3fc",
    "--ha-color-border-neutral-loud": "#5e5e5e",
    "--ha-color-border-neutral-quiet": "#e6e6e6",
    "--ha-color-fill-primary-quiet-resting": "#eff9fe",
    "--mdc-theme-primary": "#009ac7",
    "--mdc-theme-surface": "#ffffff",
    "--mdc-select-label-ink-color": "rgba(0, 0, 0, 0.6)",
    "--wa-color-neutral-fill-normal": "#e6e6e6"
  },
  "dark": {
    "--primary-color": "#009ac7",
    "--rgb-primary-color": "0, 154, 199",
    "--primary-text-color": "#e1e1e1",
    "--rgb-primary-text-color": "33, 33, 33",
    "--secondary-text-color": "#9b9b9b",
    "--disabled-text-color": "#6f6f6f",
    "--primary-background-color": "#111111",
    "--secondary-background-color": "#282828",
    "--card-background-color": "#1c1c1c",
    "--divider-color": "rgba(225, 225, 225, 0.12)",
    "--error-color": "#db4437",
    "--rgb-error-color": "219, 68, 55",
    "--warning-color": "#ffa600",
    "--success-color": "#43a047",
    "--info-color": "#039be5",
    "--state-icon-color": "#44739e",
    "--input-fill-color": "rgba(255, 255, 255, 0.05)",
    "--ha-color-form-background": "#363636",
    "--ha-color-fill-neutral-normal-resting": "#202020",
    "--ha-color-fill-neutral-quiet-hover": "#202020",
    "--ha-color-fill-primary-quiet-hover": "#002e3e",
    "--ha-color-border-neutral-loud": "#b1b1b1",
    "--ha-color-border-neutral-quiet": "#5e5e5e",
    "--ha-color-fill-primary-quiet-resting": "#001721",
    "--mdc-theme-primary": "#009ac7",
    "--mdc-theme-surface": "#1c1c1c",
    "--mdc-select-label-ink-color": "rgba(255, 255, 255, 0.6)",
    "--wa-color-neutral-fill-normal": "#202020"
  }
};

// remote-card/src/remote-embed-theme.ts
var PALETTE_VAR_NAMES = Object.keys(REMOTE_WEB_PALETTE_VARS.light);
function parseCssColor(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  let m2 = text.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (m2) return finish(Number(m2[1]), Number(m2[2]), Number(m2[3]), m2[4] == null ? 1 : Number(m2[4]));
  m2 = text.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (m2) return finish(Number(m2[1]), Number(m2[2]), Number(m2[3]), alpha(m2[4]));
  m2 = text.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/);
  if (m2) return finish(Number(m2[1]) * 255, Number(m2[2]) * 255, Number(m2[3]) * 255, alpha(m2[4]));
  m2 = text.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m2) {
    let hex = m2[1];
    if (hex.length <= 4) hex = hex.split("").map((c4) => c4 + c4).join("");
    const n4 = (i6) => parseInt(hex.slice(i6, i6 + 2), 16);
    return finish(n4(0), n4(2), n4(4), hex.length === 8 ? n4(6) / 255 : 1);
  }
  return null;
}
function alpha(raw) {
  if (raw == null) return 1;
  return raw.endsWith("%") ? Number(raw.slice(0, -1)) / 100 : Number(raw);
}
function finish(r4, g2, b3, a3) {
  if (![r4, g2, b3, a3].every(Number.isFinite)) return null;
  if (a3 <= 0) return null;
  return { r: r4, g: g2, b: b3, a: a3 };
}
function relativeLuminance({ r: r4, g: g2, b: b3 }) {
  const channel = (v2) => {
    const s4 = Math.min(255, Math.max(0, v2)) / 255;
    return s4 <= 0.03928 ? s4 / 12.92 : ((s4 + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r4) + 0.7152 * channel(g2) + 0.0722 * channel(b3);
}

// remote-card/src/sidebar/sidebar-remote-theme.ts
var SIDEBAR_THEME_PROBE_CLASS = "sb-sidebar-theme-probe";
function resolveSidebarTheme(readStyle) {
  const primary = parseCssColor(readStyle("var(--primary-color)"));
  const text = parseCssColor(readStyle("var(--primary-text-color)"));
  const card = parseCssColorKeepAlpha(
    readStyle("var(--ha-card-background, var(--card-background-color, var(--primary-background-color)))")
  );
  return {
    onPrimary: primary && relativeLuminance(primary) > 0.4 ? "#111" : "#fff",
    halo: text && relativeLuminance(text) > 0.5 ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.75)",
    glass: card != null && card.a < 1
  };
}
function parseCssColorKeepAlpha(value) {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return null;
  if (text === "transparent" || text === "rgba(0, 0, 0, 0)") return { a: 0 };
  const parsed = parseCssColor(text);
  return parsed ? { a: parsed.a } : null;
}
function applySidebarTheme(host, root) {
  const probe = document.createElement("span");
  probe.className = SIDEBAR_THEME_PROBE_CLASS;
  probe.setAttribute("aria-hidden", "true");
  root.appendChild(probe);
  const readStyle = (cssColor) => {
    probe.style.color = cssColor;
    return getComputedStyle(probe).color || null;
  };
  let facts;
  try {
    facts = resolveSidebarTheme(readStyle);
  } finally {
    probe.remove();
  }
  host.style.setProperty("--sb-on-primary", facts.onPrimary);
  host.style.setProperty("--sb-halo", facts.halo);
  host.toggleAttribute("data-glass", facts.glass);
  return facts;
}

// remote-card/src/sidebar/sidebar-remote-element.ts
var SIDEBAR_REMOTE_TAG = "sofabaton-sidebar-remote";
var KEY_BY_ID = {
  [ID.UP]: "up",
  [ID.DOWN]: "down",
  [ID.LEFT]: "left",
  [ID.RIGHT]: "right",
  [ID.OK]: "ok",
  [ID.BACK]: "back",
  [ID.HOME]: "home",
  [ID.MENU]: "menu",
  [ID.VOL_UP]: "volup",
  [ID.VOL_DOWN]: "voldn",
  [ID.MUTE]: "mute",
  [ID.CH_UP]: "chup",
  [ID.CH_DOWN]: "chdn",
  [ID.GUIDE]: "guide",
  [ID.REW]: "rew",
  [ID.PLAY]: "play",
  [ID.PAUSE]: "pause",
  [ID.FWD]: "fwd",
  [ID.DVR]: "dvr",
  [ID.EXIT]: "exit",
  [ID.A]: "a",
  [ID.B]: "b",
  [ID.C]: "c",
  [ID.RED]: "red",
  [ID.GREEN]: "green",
  [ID.YELLOW]: "yellow",
  [ID.BLUE]: "blue",
  [ID.NUM_1]: "num1",
  [ID.NUM_2]: "num2",
  [ID.NUM_3]: "num3",
  [ID.NUM_4]: "num4",
  [ID.NUM_5]: "num5",
  [ID.NUM_6]: "num6",
  [ID.NUM_7]: "num7",
  [ID.NUM_8]: "num8",
  [ID.NUM_9]: "num9",
  [ID.NUM_0]: "num0",
  [ID.NUM_DASH]: "numdash",
  [ID.NUM_ENTER]: "numenter"
};
var NUMPAD_ORDER = [
  { id: ID.NUM_1, label: "1" },
  { id: ID.NUM_2, label: "2" },
  { id: ID.NUM_3, label: "3" },
  { id: ID.NUM_4, label: "4" },
  { id: ID.NUM_5, label: "5" },
  { id: ID.NUM_6, label: "6" },
  { id: ID.NUM_7, label: "7" },
  { id: ID.NUM_8, label: "8" },
  { id: ID.NUM_9, label: "9" },
  { id: ID.NUM_DASH, label: "\u2212" },
  { id: ID.NUM_0, label: "0" },
  { id: ID.NUM_ENTER, label: "E" }
];
function clickPoint(ev) {
  if (!(ev instanceof MouseEvent) || !ev.detail) return void 0;
  return { x: ev.clientX, y: ev.clientY };
}
function deviceClassIcon(deviceClass) {
  const cls = String(deviceClass ?? "").toLowerCase();
  if (cls.includes("wifi") || cls.includes("wi-fi") || cls.includes("network")) return "mdi:wifi";
  if (cls.includes("bluetooth") || cls.includes("bt")) return "mdi:bluetooth";
  return "mdi:remote";
}
var VIEW_STORAGE_PREFIX = "sofabaton_x1s:sidebar:view:";
function readStored(key) {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key, value) {
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value);
  } catch {
  }
}
function rememberedOpenDevice(entity) {
  if (readStored(`${VIEW_STORAGE_PREFIX}${entity}`) !== "device") return null;
  const id = Number(readStored(`${LAST_DEVICE_STORAGE_PREFIX}${entity}`));
  return Number.isFinite(id) ? id : null;
}
function sidebarConfig(entity) {
  const openDevice = rememberedOpenDevice(entity);
  return {
    entity,
    hold_repeat: { enabled: true },
    show_favorite_device_names: true,
    show_automation_assist: false,
    max_width: 0,
    // The store reopens this device once the capability resolves (its
    // open_device path, built for the card's configured opening view).
    ...openDevice != null ? { device_mode: { open_device: openDevice } } : {}
  };
}
var SofabatonSidebarRemote = class extends i4 {
  constructor() {
    super();
    this._hass = null;
    this._entityId = "";
    this._hubConnected = true;
    this._runtime = null;
    this._lastThemesRef = void 0;
    this._press = null;
    /** Landscape split, only when the portrait wheel would be too small (sidebar-layout.ts). */
    this._landscape = false;
    this._sizeObserver = null;
    /** The rows have been measured once; after that only the ResizeObserver re-measures. */
    this._layoutMeasured = false;
    this._sheet = null;
    this._lastDrawer = "favorites";
    this._numpadOpen = false;
    this._numpadPageKey = "";
    this._outsideTap = null;
    this._onKeydown = (ev) => {
      if (ev.key !== "Escape") return;
      if (this._sheet) {
        this._openSheet(null);
        ev.preventDefault();
      } else if (this._numpadOpen) {
        this._numpadOpen = false;
        this.requestUpdate();
        ev.preventDefault();
      }
    };
    this._store = new RemoteCardStore(() => this.requestUpdate(), {
      fireEvent: (type, detail) => this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true })),
      onHubQueueDrained: () => this.requestUpdate(),
      onCommandPulseChange: () => this.requestUpdate()
    });
  }
  // ---------- host API ----------
  set hubConnected(value) {
    if (value === this._hubConnected) return;
    this._hubConnected = value;
    this.requestUpdate();
  }
  get hubConnected() {
    return this._hubConnected;
  }
  set hass(value) {
    this._hass = value;
    const language = value?.locale?.language ?? value?.language;
    if (setRemoteCardLanguage(language)) this.requestUpdate();
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();
    this._store.setHass(value);
    const themes = value?.themes;
    if (themes !== this._lastThemesRef) {
      this._lastThemesRef = themes;
      this.updateComplete.then(() => this._applyTheme());
    }
  }
  get hass() {
    return this._hass;
  }
  /** The remote entity of the selected hub ("" = none). */
  set entityId(value) {
    const next = String(value ?? "");
    if (next === this._entityId) return;
    this._entityId = next;
    this._sheet = null;
    this._numpadOpen = false;
    if (next) {
      this._store.setConfig(sidebarConfig(next));
      if (this._hass) this._store.setHass(this._hass);
    }
    this.requestUpdate();
  }
  get entityId() {
    return this._entityId;
  }
  /** The hub's runtime state from the panel's poll (long-running operations). */
  set runtime(value) {
    this._runtime = value;
    this.requestUpdate();
  }
  get runtime() {
    return this._runtime;
  }
  get store() {
    return this._store;
  }
  // ---------- lifecycle ----------
  connectedCallback() {
    super.connectedCallback();
    this._store.connected();
    this._outsideTap = (ev) => {
      if (!this._numpadOpen) return;
      const path = ev.composedPath();
      const wheel = this.renderRoot.querySelector(".wheel-wrap");
      if (wheel && !path.includes(wheel)) {
        this._numpadOpen = false;
        this.requestUpdate();
      }
    };
    this.addEventListener("pointerdown", this._outsideTap);
    this.addEventListener("keydown", this._onKeydown);
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this._store.disconnected();
    this.removeEventListener("keydown", this._onKeydown);
    this._press?.dispose();
    this._press = null;
    if (this._outsideTap) this.removeEventListener("pointerdown", this._outsideTap);
    this._sizeObserver?.disconnect();
    this._sizeObserver = null;
  }
  firstUpdated() {
    this._press = new SidebarPressController(this.renderRoot, {
      resolve: (el) => {
        const id = Number(el.dataset.key);
        if (!Number.isFinite(id)) return null;
        return { id, key: KEY_BY_ID[id] ?? String(id) };
      },
      hasLongPress: (id) => this._store.longPressAvailableForButton(id, this._scopeFor(id)),
      isEnabled: (id) => this._keyEnabled(id),
      onTap: (id, el, at) => this._send(id, el, at),
      onRepeat: (id, _index, el, at) => this._send(id, el, at),
      onLongPress: (id, el, at) => this._sendLongPress(id, el, at),
      onPressed: (el, pressed) => this._setPressed(el, pressed),
      haptic: () => this._haptic()
    });
    this._applyTheme();
    if (typeof ResizeObserver !== "undefined") {
      this._sizeObserver = new ResizeObserver(() => this._measureLayout());
      this._sizeObserver.observe(this);
    }
  }
  updated(_changed) {
    if (this._lastThemesRef === void 0) this._applyTheme();
    if (!this._layoutMeasured) this._measureLayout();
  }
  /** Portrait unless the portrait wheel would be too small; measured from the
   *  rows whose heights are the same in both layouts (sidebar-layout.ts). */
  _measureLayout() {
    const root = this.renderRoot;
    const remote = root.querySelector(".remote");
    const pull = root.querySelector(".pull");
    if (!remote || !pull) return;
    const rows = [".activity", ".nav", ".media", ".rockers", ".colors"].map((sel) => root.querySelector(sel)).filter((el) => el != null);
    if (rows.length < 5) return;
    const cs = getComputedStyle(remote);
    this._layoutMeasured = true;
    const landscape = wantsLandscape({
      width: this.clientWidth,
      height: this.clientHeight,
      fixedRows: rows.map((el) => el.offsetHeight),
      pull: pull.offsetHeight,
      gap: parseFloat(cs.rowGap) || 0,
      pad: parseFloat(cs.paddingTop) || 0
    }, this._landscape);
    if (landscape !== this._landscape) {
      this._landscape = landscape;
      this.requestUpdate();
    }
  }
  _applyTheme() {
    if (!this.isConnected) return;
    applySidebarTheme(this, this.renderRoot);
  }
  // ---------- sending ----------
  _scopeFor(id) {
    const store = this._store;
    if (store.mode() === "device") return store.currentDeviceId();
    return store.commandTarget(id)?.activity_id ?? store.currentActivityId();
  }
  _keyEnabled(id) {
    if (this._busy().inert) return false;
    return this._store.isEnabled(id);
  }
  _control(request, el) {
    request.catch(() => {
      this._store.controlFailed();
      this._flagFailure(el ?? null);
    });
  }
  _send(id, el, at) {
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendCommand(id, this._scopeFor(id)), el);
  }
  _sendLongPress(id, el, at) {
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendLongPress(id, this._scopeFor(id)), el);
  }
  /** The transmit ring: a thin accent circle expanding out of the key. On
   *  the wheel's quadrants (a quarter of the disc each) and on the sheet's
   *  wide tiles and rows it starts where the finger was, at a key's size,
   *  not from the whole quadrant or row. */
  _ring(el, failed = false, at) {
    const app = this.renderRoot.querySelector(".app");
    if (!app || !el) return;
    const base = app.getBoundingClientRect();
    const r4 = el.getBoundingClientRect();
    const fromPoint = el.classList.contains("dir") || el.closest(".sheet") != null;
    const d3 = fromPoint ? 92 : Math.max(r4.width, r4.height) * 1.1;
    const cx = fromPoint && at ? at.x : r4.left + r4.width / 2;
    const cy = fromPoint && at ? at.y : r4.top + r4.height / 2;
    const ring = document.createElement("div");
    ring.className = failed ? "ring err" : "ring";
    ring.style.cssText = `left:${cx - base.left - d3 / 2}px;top:${cy - base.top - d3 / 2}px;width:${d3}px;height:${d3}px`;
    app.appendChild(ring);
    ring.addEventListener("animationend", () => ring.remove());
    setTimeout(() => ring.remove(), 1500);
  }
  /** A refused send: a red ring on the key and the panel's hub dot flashes red. */
  _flagFailure(el) {
    this._ring(el, true);
    this.dispatchEvent(new CustomEvent("sidebar-remote-failed", { bubbles: true, composed: true }));
    this.requestUpdate();
  }
  _haptic() {
    this.dispatchEvent(new CustomEvent("haptic", { detail: "light", bubbles: true, composed: true }));
  }
  _setPressed(el, pressed) {
    el.classList.toggle("pressed", pressed);
    const dir = el.dataset.dir;
    const wheel = this.renderRoot.querySelector(".wheel");
    if (dir && wheel) {
      if (pressed) {
        wheel.dataset.tilt = dir;
        wheel.dataset.light = dir;
      } else {
        delete wheel.dataset.tilt;
      }
    }
    const pill = el.closest(".pill");
    if (pill) {
      if (pressed) {
        const segs = [...pill.children].filter((c4) => c4.offsetParent !== null || getComputedStyle(c4).display !== "none");
        const i6 = segs.indexOf(el);
        const tilt = segs.length === 1 ? "center" : segs.length === 2 ? ["left", "right"][i6] : ["left", "center", "right"][i6];
        pill.dataset.tilt = tilt;
        if (tilt !== "center") pill.dataset.light = tilt;
      } else {
        delete pill.dataset.tilt;
      }
    }
  }
  // ---------- state ----------
  _busy() {
    const derived = this._store.deriveRuntimeState();
    const s4 = str();
    return sidebarBusyState({
      mode: derived.mode,
      isUnavailable: derived.isUnavailable || !this._hubConnected,
      activityLoading: this._store.activityLoadingActive(),
      loadPending: derived.loadPending,
      isPoweredOff: derived.isPoweredOff,
      pendingActivity: derived.selectState?.resolvedValue ?? null,
      deviceId: derived.deviceId ?? null,
      runtime: this._runtime,
      strings: {
        starting: s4.sidebar.starting,
        poweringOff: s4.sidebar.poweringOff,
        working: s4.sidebar.working,
        appConnected: s4.sidebar.appConnected,
        operations: s4.sidebar.operations,
        off: s4.card.poweredOff
      }
    });
  }
  /** Open a sheet pane (or close with null); the pull handle, pickers and audits use it. */
  openSheet(pane) {
    this._openSheet(pane);
  }
  _openSheet(pane) {
    if (pane === "favorites" || pane === "macros") this._lastDrawer = pane;
    const opening = pane != null && this._sheet == null;
    this._sheet = pane;
    this.requestUpdate();
    if (opening) {
      void this.updateComplete.then(() => this.renderRoot.querySelector(".sheet .close")?.focus({ preventScroll: true }));
    }
  }
  _togglePull() {
    const deviceMode = this._store.mode() === "device";
    if (!deviceMode) return this._openSheet(this._lastDrawer);
    this._openSheet(this._store.currentDeviceId() == null ? "devices" : "commands");
  }
  _toggleNumpad() {
    this._numpadOpen = !this._numpadOpen;
    this.requestUpdate();
  }
  _pickActivity(label) {
    this._openSheet(null);
    this._haptic();
    if (this._store.mode() !== "activity") {
      this._store.setMode("activity");
      this._rememberView();
    }
    this._control(this._store.setActivity(label));
  }
  _pickDevice(id) {
    this._openSheet(null);
    if (this._store.mode() !== "device") this._store.setMode("device");
    this._store.setDevice(id);
    this._rememberView();
  }
  _rememberView() {
    if (this._entityId) writeStored(`${VIEW_STORAGE_PREFIX}${this._entityId}`, this._store.mode());
  }
  _toggleMode() {
    this._store.toggleMode();
    this._rememberView();
    this._sheet = null;
    this._numpadOpen = false;
    this.requestUpdate();
  }
  _power() {
    const el = this.renderRoot.querySelector(".power");
    const store = this._store;
    this._control(store.mode() === "device" ? store.toggleDevicePower() : store.setActivity(str().card.poweredOff), el);
  }
  // ---------- render ----------
  render() {
    if (!this._entityId) {
      return b2`<div class="app"><div class="remote"><div class="sp"></div><div class="notice">${str().sidebar.remoteUnavailable}</div><div class="sp"></div></div></div>`;
    }
    const store = this._store;
    const derived = store.deriveRuntimeState();
    const s4 = str();
    const deviceMode = derived.mode === "device";
    const busy = this._busy();
    const isX2 = derived.isX2;
    const vis = runtimeButtonVisibility({
      isX2,
      showVolume: true,
      showChannel: true,
      showMedia: true,
      showDvr: true
    });
    const numpadAvailable = isX2 && store.anyKeyBound(NUMPAD_KEY_IDS);
    const pageKey = `${derived.mode}:${deviceMode ? derived.deviceId ?? "" : derived.activityId ?? ""}`;
    if (!numpadAvailable || pageKey !== this._numpadPageKey) this._numpadOpen = false;
    this._numpadPageKey = pageKey;
    const showPower = deviceMode ? powerButtonEnabled(null) && store.devicePowerConfigured() : store.currentActivityId() != null;
    const powerLabel = deviceMode ? s4.card.powerButton : s4.sidebar.allOff;
    const modeAvailable = store.deviceModeAvailable();
    const currentName = derived.isUnavailable || !this._hubConnected ? s4.sidebar.hubUnavailable : deviceMode ? store.deviceNameForId(derived.deviceId) ?? s4.card.selectDevice : derived.selectState?.resolvedValue || derived.currentLabel || s4.card.poweredOff;
    const eyebrow = busy.label ?? (deviceMode ? s4.card.deviceSelectLabel : s4.card.activitySelectLabel);
    const off = (id) => !store.isEnabled(id);
    const key = (id, cls, body, extra = {}) => b2`
      <button
        class=${e5({ ...cls, off: off(id) })}
        data-key=${id}
        data-dir=${extra.dir ?? A}
        aria-label=${s4.keys[KEY_BY_ID[id]] ?? String(id)}
        aria-disabled=${off(id) ? "true" : A}
        type="button"
      >${body}</button>`;
    const icon = (name) => b2`<ha-icon .icon=${name}></ha-icon>`;
    const allOff = (...ids) => ids.every(off);
    const playPause = isX2 ? b2`<div class=${e5({ pill: true, off: allOff(ID.PLAY, ID.PAUSE) })}>${key(ID.PLAY, { seg: true }, icon("mdi:play-outline"))}${key(ID.PAUSE, { seg: true }, icon("mdi:pause"))}</div>` : b2`<div class=${e5({ pill: true, single: true, off: allOff(ID.PAUSE) })}>${key(ID.PAUSE, { seg: true }, icon("mdi:play-pause"))}</div>`;
    return b2`
      <div class=${e5({ app: true, landscape: this._landscape, inert: busy.inert, busy: busy.busy, pick: busy.reason === "no-device" || busy.reason === "off", "powered-off": busy.reason === "off", open: this._sheet != null })} data-mode=${derived.mode}>
        <main class="remote" aria-busy=${busy.busy ? "true" : "false"}>
          <div class="activity">
            ${modeAvailable ? b2`<button class="round mode" type="button" title=${s4.sidebar.modeToggle} aria-label=${s4.sidebar.modeToggle} @click=${this._toggleMode}>
                  ${icon(deviceMode ? "mdi:audio-video" : "mdi:play-circle-outline")}
                </button>` : A}
            <button class="text" type="button" @click=${() => this._openSheet(deviceMode ? "devices" : "activities")} aria-haspopup="dialog">
              <span class="eyebrow">${eyebrow}${busy.busy ? "\u2026" : ""}</span>
              <span class="name"><span>${currentName}</span>${icon("mdi:chevron-down")}<span class="spin"></span></span>
            </button>
            ${showPower ? b2`<button class=${e5({ round: true, power: true, busy: deviceMode && store.powerBusy })} type="button" aria-label=${powerLabel} title=${powerLabel} @click=${this._power}>
                  ${icon("mdi:power")}
                </button>` : A}
            <span class="bar"></span>
          </div>

          ${derived.noActivitiesMessage ? b2`<div class="notice">${derived.noActivitiesMessage}</div>` : A}

          <div class="sp"></div>
          <div class=${e5({ "wheel-area": true, "has-orbit": isX2 })}>
            <div class=${e5({ "wheel-wrap": true, flipped: this._numpadOpen })}>
              <div class=${e5({ wheel: true, flipped: this._numpadOpen })}>
                <div class="face face-wheel">
                  <div class="disc"></div>
                  <div class="dirs">
                    ${key(ID.UP, { dir: true, up: true }, icon("mdi:chevron-up"), { dir: "up" })}
                    ${key(ID.LEFT, { dir: true, left: true }, icon("mdi:chevron-left"), { dir: "left" })}
                    ${key(ID.RIGHT, { dir: true, right: true }, icon("mdi:chevron-right"), { dir: "right" })}
                    ${key(ID.DOWN, { dir: true, down: true }, icon("mdi:chevron-down"), { dir: "down" })}
                  </div>
                  ${key(ID.OK, { ok: true }, "OK")}
                </div>
                ${numpadAvailable ? b2`<div class="numpad face face-pad">
                      ${NUMPAD_ORDER.map((n4, i6) => b2`<button class=${e5({ off: off(n4.id) })} style="--i:${i6}" data-key=${n4.id} type="button" aria-label=${s4.keys[KEY_BY_ID[n4.id]] ?? n4.label}>${n4.label}</button>`)}
                    </div>` : A}
              </div>
              ${numpadAvailable ? b2`<button class="numtoggle" type="button" aria-label=${s4.sidebar.numberPad} aria-pressed=${this._numpadOpen ? "true" : "false"} @click=${this._toggleNumpad}>${icon("mdi:dialpad")}</button>` : A}
              ${vis.dvr ? key(ID.DVR, { orbit: true, dvr: true }, "DVR") : A}
              ${vis.exit ? key(ID.EXIT, { orbit: true, exit: true }, "EXIT") : A}
              ${isX2 ? key(ID.A, { orbit: true, abc: true, a: true }, "A") : A}
              ${isX2 ? key(ID.B, { orbit: true, abc: true, b: true }, "B") : A}
              ${isX2 ? key(ID.C, { orbit: true, abc: true, c: true }, "C") : A}
            </div>
          </div>
          <div class="sp"></div>

          <div class="bare nav">
            ${key(ID.BACK, { seg: true }, icon("mdi:arrow-u-left-top"))}
            ${key(ID.HOME, { seg: true }, icon("mdi:home-outline"))}
            ${key(ID.MENU, { seg: true }, icon("mdi:menu"))}
          </div>

          <div class="bare media">
            ${key(ID.REW, { seg: true }, icon("mdi:rewind-outline"))}
            ${playPause}
            ${key(ID.FWD, { seg: true }, icon("mdi:fast-forward-outline"))}
          </div>


          <div class="rockers">
            <div class=${e5({ pill: true, vol: true, off: allOff(ID.VOL_DOWN, ID.MUTE, ID.VOL_UP) })}>
              ${key(ID.VOL_DOWN, { seg: true }, "\u2212")}
              ${key(ID.MUTE, { seg: true, lbl: true }, b2`${icon("mdi:volume-mute")}<small>VOL</small>`)}
              ${key(ID.VOL_UP, { seg: true }, "+")}
            </div>
            <div class=${e5({ pill: true, ch: true, off: vis.guide ? allOff(ID.CH_DOWN, ID.GUIDE, ID.CH_UP) : allOff(ID.CH_DOWN, ID.CH_UP) })}>
              ${key(ID.CH_DOWN, { seg: true }, "\u2212")}
              ${vis.guide ? key(ID.GUIDE, { seg: true, lbl: true }, b2`${icon("mdi:television-guide")}<small>CH</small>`) : b2`<div class="seg lbl deco" aria-hidden="true">${icon("mdi:television-guide")}<small>CH</small></div>`}
              ${key(ID.CH_UP, { seg: true }, "+")}
            </div>
          </div>

          <div class="colors">
            ${key(ID.RED, { red: true }, "")}${key(ID.GREEN, { green: true }, "")}${key(ID.YELLOW, { yellow: true }, "")}${key(ID.BLUE, { blue: true }, "")}
          </div>

          <div class="sp"></div>
        </main>

        <button class="pull" type="button" aria-label=${deviceMode ? s4.sidebar.pullHandleCommands : s4.sidebar.pullHandle} @click=${this._togglePull}>
          <span class="grip"></span>
          <span class="knob">${icon("mdi:chevron-up")}</span>
        </button>

        <div class="scrim" @click=${() => this._openSheet(null)}></div>
        ${this._renderSheet(derived, deviceMode)}
      </div>
    `;
  }
  _renderSheet(derived, deviceMode) {
    const s4 = str();
    const pane = this._sheet;
    const picker = pane === "activities" || pane === "devices";
    const headed = pane === "commands" || picker && !this._store.deviceModeAvailable();
    const tabs = picker ? [{ pane: "activities", icon: "mdi:movie-open-outline", label: s4.sidebar.activities }, { pane: "devices", icon: "mdi:audio-video", label: s4.sidebar.devices }] : [{ pane: "favorites", icon: "mdi:star-outline", label: s4.card.favoritesTab }, { pane: "macros", icon: "mdi:playlist-play", label: s4.card.macrosTab }];
    const icon = (name) => b2`<ha-icon .icon=${name}></ha-icon>`;
    const close = b2`<button class="close" type="button" aria-label=${s4.sidebar.close} @click=${() => this._openSheet(null)}>${icon("mdi:close")}</button>`;
    const title = pane === "devices" ? s4.sidebar.devices : pane === "commands" ? s4.card.commandsTab : pane === "favorites" ? s4.card.favoritesTab : pane === "macros" ? s4.card.macrosTab : s4.sidebar.activities;
    const eyebrow = pane === "commands" ? this._store.deviceNameForId(derived.deviceId) ?? "" : "";
    return b2`
      <div class="sheet" role="dialog" aria-modal="true" aria-hidden=${pane ? "false" : "true"} aria-label=${title}>
        <div class="grip"></div>
        ${headed ? b2`<div class="phead"><div class="titles">${eyebrow ? b2`<span class="eyebrow">${eyebrow}</span>` : A}<span>${title}</span></div>${close}</div>` : b2`<div class="segs"><div class="ctl" role="tablist">
              ${tabs.map((tab) => b2`<button class=${e5({ s: true, active: pane === tab.pane })} role="tab" aria-selected=${pane === tab.pane ? "true" : "false"} type="button" @click=${() => this._openSheet(tab.pane)}>${icon(tab.icon)}${tab.label}</button>`)}
            </div>${close}</div>`}
        ${pane === "commands" ? b2`<label class="filter">${icon("mdi:magnify")}<input type="search" .value=${derived.commandFilter} placeholder=${s4.card.filterCommands} @input=${(ev) => this._store.setCommandFilter(ev.target.value)} /></label>` : A}
        <div class="body">${pane ? this._renderPane(pane, derived, deviceMode) : A}</div>
      </div>
    `;
  }
  _renderPane(pane, derived, deviceMode) {
    const s4 = str();
    const store = this._store;
    const icon = (name) => b2`<ha-icon .icon=${name}></ha-icon>`;
    const devices = store.devices();
    const classOf = (deviceId) => deviceClassIcon(devices.find((d3) => d3.id === deviceId)?.device_class);
    const fallbackDevice = store.currentActivityId();
    if (pane === "favorites") {
      const favorites = derived.favorites.map((raw) => ({ raw, model: drawerButtonModel(raw, "favorites", fallbackDevice) }));
      const custom = derived.customFavorites.map((raw) => ({ raw, model: customFavoriteButtonModel(raw, fallbackDevice) }));
      if (!favorites.length && !custom.length) return b2`<div class="empty">${s4.card.noFavorites}</div>`;
      return b2`<div class="grid">
        ${favorites.map(({ raw, model }) => b2`
          <button class="tile" type="button" data-press @click=${(ev) => this._drawerItem("favorites", model, raw, ev.currentTarget, clickPoint(ev))}>
            <span class="ic">${icon(model.icon ?? classOf(model.deviceId))}</span>
            <span class="t"><b>${model.label}</b><small>${store.deviceNameForId(model.deviceId) ?? ""}</small></span>
          </button>`)}
        ${custom.map(({ model }) => b2`
          <button class="tile" type="button" data-press @click=${(ev) => this._customFavorite(model, ev.currentTarget, clickPoint(ev))}>
            <span class="ic">${icon(model.icon ?? classOf(model.deviceId))}</span>
            <span class="t"><b>${model.label}</b><small>${store.deviceNameForId(model.deviceId) ?? ""}</small></span>
          </button>`)}
      </div>`;
    }
    if (pane === "macros") {
      const macros = derived.macros.map((raw) => ({ raw, model: drawerButtonModel(raw, "macros", fallbackDevice) }));
      if (!macros.length) return b2`<div class="empty">${s4.card.noMacros}</div>`;
      return b2`<div class="list">
        ${macros.map(({ raw, model }) => b2`
          <button class="lrow" type="button" data-press @click=${(ev) => this._drawerItem("macros", model, raw, ev.currentTarget, clickPoint(ev))}>
            <ha-icon class="li" .icon=${model.icon ?? "mdi:playlist-play"}></ha-icon>
            <span class="t"><b>${model.label}</b></span>
            <ha-icon class="chev" .icon=${"mdi:chevron-right"}></ha-icon>
          </button>`)}
      </div>`;
    }
    if (pane === "commands") {
      const commands = derived.commands;
      const deviceIcon = classOf(derived.deviceId ?? -1);
      if (!commands.length) return b2`<div class="empty">${derived.keymapLoading ? s4.sidebar.working : s4.card.noCommands}</div>`;
      return b2`<div class="list">
        ${commands.map((command) => b2`
          <button class="lrow" type="button" data-press @click=${(ev) => this._command(command.command_id, ev.currentTarget, clickPoint(ev))}>
            <ha-icon class="li" .icon=${deviceIcon}></ha-icon>
            <span class="t"><b>${command.name}</b></span>
            <ha-icon class="chev" .icon=${"mdi:chevron-right"}></ha-icon>
          </button>`)}
      </div>`;
    }
    if (pane === "devices") {
      return b2`<div class="rows">
        ${devices.map((device) => b2`
          <button class=${e5({ row: true, current: deviceMode && device.id === derived.deviceId })} type="button" data-press @click=${() => this._pickDevice(device.id)}>
            <span class="ic">${icon(deviceClassIcon(device.device_class))}</span>
            <span class="name">${device.name}</span>
            <span class="st"></span>
          </button>`)}
      </div>`;
    }
    const currentId = store.currentActivityId();
    return b2`<div class="rows">
      ${derived.activities.map((activity) => b2`
        <button class=${e5({ row: true, current: activity.id === currentId })} type="button" data-press @click=${() => this._pickActivity(activity.name)}>
          <span class="ic">${icon("mdi:movie-open-outline")}</span>
          <span class="name">${activity.name}</span>
          <span class="st"></span>
        </button>`)}
    </div>`;
  }
  _drawerItem(itemType, model, raw, el, at) {
    this._haptic();
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendDrawerItem(itemType, model.commandId, model.deviceId, raw), el);
  }
  _customFavorite(model, el, at) {
    this._haptic();
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendCustomFavoriteCommand(model.commandId, model.deviceId), el);
  }
  _command(commandId, el, at) {
    this._haptic();
    this._store.triggerCommandPulse();
    this._ring(el, false, at);
    this._control(this._store.sendCommand(commandId, this._store.currentDeviceId()), el);
  }
};
SofabatonSidebarRemote.styles = sidebarRemoteStyles;

// remote-card/src/sidebar/sidebar-panel-element.ts
var HUB_ICON = w`<svg class="hubicon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 421.04 173.01" aria-hidden="true" fill="currentColor">
  <path d="M87.39,45.33c0,21.03,50.51,44.46,123,44.46s123-23.43,123-44.46S282.87.87,210.39.87s-123,23.43-123,44.46Z"></path>
  <path d="M25.79,116h367c11.44,0,18.11-2.01,23.05-6.95,6.19-6.19,6.93-17.18,1.79-26.73l-28.97-54.94C375.65,4.75,344.58,0,320.79,0h-22.52c2.26.78,4.48,1.59,6.62,2.43,27.41,10.85,42.5,26.08,42.5,42.9s-15.09,32.05-42.5,42.9c-25.35,10.04-58.92,15.56-94.5,15.56s-69.15-5.53-94.5-15.56c-27.41-10.85-42.5-26.08-42.5-42.9S88.48,13.28,115.89,2.43c2.14-.85,4.36-1.65,6.62-2.43h-19.72c-23.82,0-54.95,4.77-67.92,27.47L1.18,85.93c-2.61,7.76-.85,15.91,4.88,22.46,5.4,6.3,13.71,7.61,19.73,7.61Z"></path>
  <path d="M25.79,130c-7.42,0-14.04-1.44-19.67-4.22,5.85,12.19,14.63,22.79,26.26,31.66,9.25,7.11,24.67,15.57,45.76,15.57h264c14.9,0,28.65-4.5,42.02-13.76,12.95-9.01,22.84-19.89,29.61-32.48-6.92,2.72-14.25,3.23-20.98,3.23H25.79Z"></path>
</svg>`;
var SIDEBAR_PANEL_TAG = "sofabaton-x-panel";
var CONTROL_PANEL_TAG = "sofabaton-control-panel";
var CONTROL_PANEL_BUNDLE = "tools-card.js";
var HUB_STORAGE_KEY = "sofabaton_x1s:sidebar:hub";
var POLL_MS = 4e3;
function entityForHub(hass, entryId) {
  if (!hass || !entryId) return null;
  for (const [id, state] of Object.entries(hass.states ?? {})) {
    if (!id.startsWith("remote.")) continue;
    if (String(state?.attributes?.entry_id ?? "") === entryId) return id;
  }
  return null;
}
var PANEL_URL_PATH = "/sofabaton-x";
var VIEW_PATHS = { remote: "/virtual-remote", panel: "/control-panel" };
function viewForPath(path) {
  const clean = String(path ?? "").replace(/\/+$/, "");
  for (const [view, sub] of Object.entries(VIEW_PATHS)) {
    if (clean === sub) return view;
  }
  return null;
}
function pathForView(view) {
  return VIEW_PATHS[view];
}
function pickHub(hubs, remembered) {
  if (!hubs.length) return null;
  if (remembered && hubs.some((hub) => hub.entry_id === remembered)) return remembered;
  return hubs[0].entry_id;
}
var SofabatonXPanel = class extends i4 {
  constructor() {
    super(...arguments);
    this._hass = null;
    this._narrow = false;
    this._hubs = [];
    this._selected = null;
    this._view = "remote";
    /** Opened on a tab's own path: back arrow instead of the menu button. */
    this._subview = false;
    /** Tab labels hidden because the labelled strip does not fit beside the hub picker. */
    this._compact = false;
    this._tabsObserver = null;
    this._menuOpen = false;
    this._controlPanel = null;
    this._controlPanelLoading = false;
    this._controlPanelFailed = false;
    this._pollTimer = null;
    this._polling = false;
    this._hassSeen = false;
    this._errUntil = 0;
    this._onVisibility = null;
    this._onOutside = null;
    this._onRemoteFailed = () => {
      this._errUntil = Date.now() + 900;
      this.requestUpdate();
      setTimeout(() => this.requestUpdate(), 950);
    };
  }
  set hass(value) {
    this._hass = value;
    const language = value?.locale?.language ?? value?.language;
    if (setRemoteCardLanguage(language)) this.requestUpdate();
    this.lang = remoteCardLanguage();
    this.dir = remoteCardDirection();
    if (this._controlPanel) this._controlPanel.hass = value;
    if (!this._hassSeen) {
      this._hassSeen = true;
      void this._poll();
    }
    this.requestUpdate();
  }
  get hass() {
    return this._hass;
  }
  set narrow(value) {
    const next = Boolean(value);
    if (next === this._narrow) return;
    this._narrow = next;
    this.toggleAttribute("narrow", next);
    this.requestUpdate();
  }
  get narrow() {
    return this._narrow;
  }
  /** HA's route for the panel: `/sofabaton-x` opens as before; the sub-paths
   *  `/virtual-remote` and `/control-panel` open that tab as a subview, with a
   *  back arrow in place of the menu button (like hass-subpage), so a
   *  dashboard can link straight to one tab and the user can come back. */
  set route(value) {
    const path = String(value?.path ?? "");
    const view = viewForPath(path);
    this._subview = view != null;
    if (view != null && view !== this._view) void this._setView(view, false);
    this.requestUpdate();
  }
  set panel(_value) {
  }
  get selectedHub() {
    return this._selected;
  }
  get view() {
    return this._view;
  }
  get isAdmin() {
    return this._hass?.user?.is_admin === true;
  }
  connectedCallback() {
    super.connectedCallback();
    this._selected = this._readStoredHub();
    this._onVisibility = () => {
      if (document.visibilityState === "visible") void this._poll();
    };
    document.addEventListener("visibilitychange", this._onVisibility);
    this._onOutside = (ev) => {
      if (!this._menuOpen) return;
      const menu = this.renderRoot.querySelector(".menu");
      const chip = this.renderRoot.querySelector(".hub");
      const path = ev.composedPath();
      if (menu && path.includes(menu) || chip && path.includes(chip)) return;
      this._menuOpen = false;
      this.requestUpdate();
    };
    document.addEventListener("pointerdown", this._onOutside, { capture: true });
    this.addEventListener("sidebar-remote-failed", this._onRemoteFailed);
    void this._poll();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    if (this._onVisibility) document.removeEventListener("visibilitychange", this._onVisibility);
    if (this._onOutside) document.removeEventListener("pointerdown", this._onOutside, { capture: true });
    this.removeEventListener("sidebar-remote-failed", this._onRemoteFailed);
    this._tabsObserver?.disconnect();
    this._tabsObserver = null;
  }
  // ---------- hubs ----------
  _readStoredHub() {
    try {
      return window.localStorage.getItem(HUB_STORAGE_KEY);
    } catch {
      return null;
    }
  }
  _storeHub(entryId) {
    try {
      if (entryId) window.localStorage.setItem(HUB_STORAGE_KEY, entryId);
      else window.localStorage.removeItem(HUB_STORAGE_KEY);
    } catch {
    }
  }
  /** Poll the light hub list while the panel is visible. */
  async _poll() {
    if (this._pollTimer) clearTimeout(this._pollTimer);
    this._pollTimer = null;
    if (!this.isConnected) return;
    if (!this._polling && this._hass?.callWS) {
      this._polling = true;
      try {
        const result = await this._hass.callWS({ type: "sofabaton_x1s/sidebar/state" });
        this._applyHubs(Array.isArray(result?.hubs) ? result.hubs : []);
      } catch {
      } finally {
        this._polling = false;
      }
    }
    if (document.visibilityState === "visible") {
      this._pollTimer = setTimeout(() => void this._poll(), POLL_MS);
    }
  }
  _applyHubs(hubs) {
    this._hubs = hubs;
    const next = pickHub(hubs, this._selected);
    if (next !== this._selected) this._selectHub(next, false);
    this.requestUpdate();
  }
  /** Select a hub by config-entry id (the menu's action; harnesses and audits use it too). */
  selectHub(entryId) {
    if (!this._hubs.some((hub) => hub.entry_id === entryId)) return;
    this._selectHub(entryId);
  }
  _selectHub(entryId, remember = true) {
    this._selected = entryId;
    this._menuOpen = false;
    if (remember) this._storeHub(entryId);
    if (this._controlPanel && entryId) {
      this._controlPanel.setConfig({ fill_height: true, host: "panel", hub: entryId });
    }
    this.requestUpdate();
  }
  _selectedHub() {
    return this._hubs.find((hub) => hub.entry_id === this._selected) ?? null;
  }
  // ---------- views ----------
  /** `fromUser`: a tab click. In a subview that also moves the URL to the tab's
   *  path (replace, not push), so a reload or a share lands on the same tab. */
  async _setView(view, fromUser = true) {
    if (fromUser && this._subview) this._replacePath(view);
    if (view === "remote") {
      if (this._view !== "remote") {
        this._view = "remote";
        this.requestUpdate();
      }
      return;
    }
    if (this._view === "panel") return;
    if (!this._controlPanel) {
      this._controlPanelLoading = true;
      this._controlPanelFailed = false;
      this.requestUpdate();
      try {
        if (!customElements.get(CONTROL_PANEL_TAG)) {
          const own = new URL(import.meta.url);
          const url = new URL(CONTROL_PANEL_BUNDLE, own);
          url.search = own.search;
          await import(
            /* @vite-ignore */
            url.href
          );
        }
        const card = document.createElement(CONTROL_PANEL_TAG);
        card.setConfig({ fill_height: true, host: "panel", hub: this._selected ?? void 0 });
        if (this._hass) card.hass = this._hass;
        this._controlPanel = card;
      } catch {
        this._controlPanelFailed = true;
      } finally {
        this._controlPanelLoading = false;
      }
    }
    if (this._controlPanel) this._view = "panel";
    this.requestUpdate();
  }
  /* Navigation mirrors HA's own helpers (src/common/navigate.ts): HA pushes a
     history entry with `{ from: <previous path> }` and marks the app's first
     entry `{ root: true }`; its goBack() steps back only when `from` is set
     and otherwise replaces the entry with the default dashboard. The
     companion apps (Android's back button, iOS) ride on that same history,
     so the panel keeps to the same state shape and the same
     `location-changed` event instead of inventing its own. */
  _replacePath(view) {
    const path = `${PANEL_URL_PATH}${pathForView(view)}`;
    if (typeof window === "undefined" || window.location.pathname === path) return;
    const current = window.history.state ?? {};
    const data = current.root ? { root: true } : void 0;
    const state = current.from === void 0 ? data ?? null : { ...data, from: current.from };
    try {
      window.history.replaceState(state, "", path);
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: true } }));
  }
  /** The subview's back arrow, as HA's goBack(): one step back when HA
   *  navigated here (the entry carries `from`), else the default dashboard
   *  replaces this entry (a fresh tab, a deep link from outside). */
  _back() {
    if (typeof window === "undefined") return;
    const current = window.history.state ?? {};
    if (current.from !== void 0) {
      window.history.back();
      return;
    }
    try {
      window.history.replaceState(current.root ? { root: true } : null, "", "/");
    } catch {
      return;
    }
    window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: true } }));
  }
  // ---------- header measurement ----------
  updated() {
    if (!this._tabsObserver) this._measureTabs();
  }
  /** Labels show when the labelled strip (the hidden probe) fits the space the tabs get. */
  _measureTabs() {
    const strip = this.renderRoot.querySelector(".tabs");
    const probe = this.renderRoot.querySelector(".probe");
    if (!strip || !probe) return;
    if (!this._tabsObserver && typeof ResizeObserver !== "undefined") {
      this._tabsObserver = new ResizeObserver(() => this._measureTabs());
      this._tabsObserver.observe(strip);
      this._tabsObserver.observe(probe);
    }
    const compact = probe.offsetWidth > strip.clientWidth;
    if (compact !== this._compact) {
      this._compact = compact;
      this.requestUpdate();
    }
  }
  // ---------- render ----------
  render() {
    const s4 = str();
    const hub = this._selectedHub();
    const entityId = entityForHub(this._hass, this._selected);
    const entityState = entityId ? this._hass?.states?.[entityId]?.state : void 0;
    const reachable = hub ? hub.hub_connected !== false && entityState !== "unavailable" : false;
    const runtime = hub?.runtime_state ?? null;
    const remote = this.renderRoot.querySelector(SIDEBAR_REMOTE_TAG);
    const inFlight = Boolean(remote?.store.isLoadingActive()) && runtime?.kind !== "operation_running";
    const dotClass = {
      dot: true,
      down: !reachable,
      busy: runtime?.kind === "operation_running" || Boolean(remote?.store.activityLoadingActive()),
      tx: inFlight,
      err: Date.now() < this._errUntil
    };
    const tabs = this.isAdmin ? b2`<div class=${e5({ tabs: true, compact: this._compact })} role="tablist">
          ${this._renderTab("remote", b2`<ha-icon .icon=${"mdi:remote-tv"}></ha-icon>`, s4.sidebar.title)}
          ${this._renderTab("panel", HUB_ICON, s4.sidebar.controlPanel)}
          <div class="probe" aria-hidden="true">
            <span class="tab"><ha-icon .icon=${"mdi:remote-tv"}></ha-icon><span>${s4.sidebar.title}</span></span>
            <span class="tab">${HUB_ICON}<span>${s4.sidebar.controlPanel}</span></span>
          </div>
        </div>` : b2`<div class=${e5({ tabs: true, single: true, compact: this._compact })}>
          <div class="title"><ha-icon .icon=${"mdi:remote-tv"}></ha-icon><span class="label">${s4.sidebar.title}</span></div>
          <div class="probe" aria-hidden="true"><span class="title"><ha-icon .icon=${"mdi:remote-tv"}></ha-icon><span>${s4.sidebar.title}</span></span></div>
        </div>`;
    return b2`
      <div class="header">
        <div class="toolbar">
          ${this._subview ? b2`<button class="back" type="button" aria-label=${s4.sidebar.back} title=${s4.sidebar.back} @click=${this._back}>
                <ha-icon .icon=${"mdi:arrow-left"}></ha-icon>
              </button>` : b2`<ha-menu-button .hass=${this._hass} .narrow=${this._narrow}></ha-menu-button>`}
          ${tabs}
          ${this._hubs.length > 1 ? b2`<button class="hub" type="button" aria-haspopup="menu" aria-expanded=${this._menuOpen ? "true" : "false"} aria-label=${s4.sidebar.hubMenu} @click=${() => {
      this._menuOpen = !this._menuOpen;
      this.requestUpdate();
    }}>
                <span class=${e5(dotClass)}></span>
                <span class="name">${hub?.name || hub?.entry_id || ""}</span>
                <ha-icon .icon=${"mdi:menu-down"}></ha-icon>
              </button>` : A}
          ${this._menuOpen ? this._renderMenu() : A}
        </div>
      </div>
      <div class="content">
        ${this._view === "panel" && this._controlPanel ? b2`<div class="page">${this._controlPanel}</div>` : hub ? b2`<sofabaton-sidebar-remote .hass=${this._hass} .entityId=${entityId ?? ""} .hubConnected=${hub.hub_connected !== false} .runtime=${runtime} ?narrow=${this._narrow}></sofabaton-sidebar-remote>` : b2`<div class="empty">${s4.sidebar.noHubs}</div>`}
        ${this._controlPanelFailed ? b2`<div class="empty">${s4.sidebar.controlPanelLoadFailed}</div>` : A}
      </div>
    `;
  }
  _renderTab(view, icon, label) {
    const active = this._view === view;
    return b2`<button
      class=${e5({ tab: true, [view]: true, active })}
      type="button"
      role="tab"
      aria-selected=${active ? "true" : "false"}
      title=${label}
      aria-label=${label}
      ?disabled=${view === "panel" && this._controlPanelLoading}
      @click=${() => this._setView(view)}
    >${icon}<span class="label">${label}</span></button>`;
  }
  _renderMenu() {
    const s4 = str();
    return b2`<div class="menu" role="menu">
      ${this._hubs.map((hub) => {
      const entityId = entityForHub(this._hass, hub.entry_id);
      const reachable = hub.hub_connected !== false && this._hass?.states?.[entityId ?? ""]?.state !== "unavailable";
      return b2`<button class=${e5({ mi: true, current: hub.entry_id === this._selected })} role="menuitemradio" aria-checked=${hub.entry_id === this._selected ? "true" : "false"} type="button" @click=${() => this._selectHub(hub.entry_id)}>
          <ha-icon .icon=${"mdi:remote"}></ha-icon>
          <span>${hub.name || hub.entry_id}${hub.version ? b2`<small>${hub.version}</small>` : A}</span>
          <span class=${e5({ dot: true, down: !reachable })} title=${reachable ? s4.sidebar.hubReachable : s4.sidebar.hubUnreachable}></span>
        </button>`;
    })}
    </div>`;
  }
};
SofabatonXPanel.styles = i`
    :host {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      height: 100vh;
      height: 100dvh;
      /* The dashboard ground (hui-view): the theme's background image when it has one. */
      background: var(--lovelace-background, var(--primary-background-color));
      color: var(--primary-text-color);
      font-family: var(--ha-font-family-body, Roboto, "Segoe UI", system-ui, sans-serif);
    }
    *, *::before, *::after { box-sizing: border-box; }
    /* The header is tokenized like hui-root's: the theme's header colour (which
       may be translucent), its backdrop filter, its border on the toolbar, and
       tabs that follow HA's tab group (14px medium, 2px indicator in the
       selection-bar colour, inactive tabs at 80%). */
    .header {
      position: relative;
      flex: 0 0 auto;
      /* Above the content, as hui-root's header is: a theme's backdrop filter
         makes the header its own stacking layer, and without this the remote,
         painted later, would sit on top of the open hub menu. */
      z-index: 4;
      background-color: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, white);
      backdrop-filter: var(--app-header-backdrop-filter, none);
      padding-top: var(--safe-area-inset-top, env(safe-area-inset-top));
    }
    .toolbar {
      display: flex;
      align-items: center;
      height: var(--header-height, 56px);
      padding: 0 12px;
      border-bottom: var(--app-header-border-bottom, none);
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: var(--ha-font-weight-normal, 400);
    }
    :host([narrow]) .toolbar { padding: 0 4px; }
    .tabs {
      /* Basis 0, never auto: the strip's share of the row must not depend on what
         it currently shows (labels or icons), or the fit test below feeds back
         into itself. It gets whatever the buttons and the hub chip leave over. */
      flex: 1 1 0; min-width: 0; align-self: stretch; display: flex; align-items: stretch; position: relative; overflow: hidden;
      margin-inline-start: 4px;
      --tab-indicator: var(--ha-tab-indicator-color, var(--app-header-selection-bar-color, var(--app-header-text-color, white)));
      --tab-active: var(--ha-tab-active-text-color, var(--app-header-text-color, white));
    }
    .tab, .title {
      display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; white-space: nowrap; flex: 0 0 auto; position: relative;
    }
    .tab { font-size: var(--ha-font-size-m, 14px); font-weight: var(--ha-font-weight-medium, 500); opacity: 0.8; transition: opacity 0.15s; }
    .tab:hover { opacity: 1; }
    .tab.active { opacity: 1; color: var(--tab-active); }
    .tab.active::after { content: ""; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--tab-indicator); }
    .tab:disabled { opacity: 0.5; cursor: default; }
    .tab ha-icon, .title ha-icon { --mdc-icon-size: 24px; flex: 0 0 auto; }
    /* the hub silhouette: as tall a box as the mdi icons, a little wider for its aspect */
    .tab .hubicon { width: 28px; height: 24px; flex: 0 0 auto; display: block; }
    /* One tab only (not an admin): a plain icon + label in the page-title style, nothing selected. */
    .title { padding: 0 8px; min-width: 0; }
    .title .label { overflow: hidden; text-overflow: ellipsis; }
    :host(:not([narrow])) .title { margin-inline-start: var(--ha-space-4, 16px); }
    /* The labels drop as soon as they stop fitting; the probe is the labelled strip, measured off-screen.
       Both compact rules hit the strip's own children only (child combinator): the probe's tabs keep
       their labelled padding, so the yardstick is the same width in both modes. Letting the probe
       shrink in compact mode made the labels flicker in the 16px band between the two widths. */
    .tabs.compact > .tab .label, .tabs.compact > .title .label { display: none; }
    .tabs.compact > .tab { padding: 0 12px; }
    .probe { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; display: inline-flex; white-space: nowrap; }
    button {
      font: inherit; color: inherit; background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
      -webkit-tap-highlight-color: transparent; user-select: none;
    }
    button:focus-visible { outline: 2px solid color-mix(in srgb, currentColor 55%, transparent); outline-offset: -2px; }
    /* the subview's back arrow sits where the menu button sits (ha-icon-button metrics) */
    .back { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; flex: 0 0 auto; }
    .back ha-icon { --mdc-icon-size: 24px; }
    .back:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
    .hub {
      display: flex; align-items: center; gap: 6px; height: 34px; padding: 0 8px 0 12px; border-radius: 17px; flex: 0 0 auto;
      font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; max-width: 45vw;
      background: color-mix(in srgb, currentColor 12%, transparent);
    }
    .hub .name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hub ha-icon { --mdc-icon-size: 18px; opacity: 0.7; flex: 0 0 auto; }
    .dot { width: 8px; height: 8px; border-radius: 50%; flex: 0 0 auto; background: #7f9a72; transition: background 0.15s, box-shadow 0.15s; }
    .dot.down { background: #c0504d; }
    .dot.tx { background: var(--primary-color); box-shadow: 0 0 0 4px color-mix(in srgb, var(--primary-color) 28%, transparent); }
    .dot.err { background: #c0504d; box-shadow: 0 0 0 4px rgba(192, 80, 77, 0.28); }
    .dot.busy { background: var(--primary-color); animation: pulse 1.2s ease-in-out infinite; }
    @keyframes pulse { 0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--primary-color) 35%, transparent); } 50% { box-shadow: 0 0 0 5px transparent; } }
    .menu {
      position: absolute; right: 8px; top: calc(100% - 4px); z-index: 8; min-width: 232px; padding: 6px 0; border-radius: 12px;
      background: var(--card-background-color, var(--primary-background-color)); color: var(--primary-text-color);
      box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22), 0 1px 3px rgba(0, 0, 0, 0.12); font-size: 14px;
    }
    .mi { display: grid; grid-template-columns: 24px 1fr auto; align-items: center; gap: 14px; height: 48px; padding: 0 16px; width: 100%; text-align: start; }
    .mi ha-icon { --mdc-icon-size: 22px; opacity: 0.7; }
    .mi small { font-size: 11px; letter-spacing: 0.06em; color: var(--secondary-text-color); margin-left: 6px; }
    .mi.current { color: var(--primary-color); background: color-mix(in srgb, var(--primary-color) 10%, transparent); }
    .mi.current ha-icon { opacity: 1; }
    .mi:hover { background: color-mix(in srgb, var(--primary-text-color) 6%, transparent); }
    .content { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }
    sofabaton-sidebar-remote { flex: 1 1 auto; min-height: 0; }
    .page { height: 100%; max-width: 1040px; margin: 0 auto; padding: 16px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); width: 100%; }
    sofabaton-control-panel { display: block; height: 100%; }
    :host([narrow]) .page { padding: 0; padding-bottom: env(safe-area-inset-bottom); }
    :host([narrow]) sofabaton-control-panel { --tools-card-outer-radius: 0; --ha-card-border-width: 0; }
    .empty { margin: auto; padding: 24px; color: var(--secondary-text-color); text-align: center; }
  `;

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
    deviceKeymapMissingServer: `\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0643\u062A\u0627\u0644\u0648\u062C ${isolate("Hub")}. \u062D\u062F\u0650\u0651\u062B ${isolate("Hub")} \u0641\u064A \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 ${SOFABATON}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629.`,
    serverReadFailed: `\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A ${isolate("Hub")} \u0645\u0646 \u0627\u0644\u062E\u0627\u062F\u0645. \u062A\u062D\u0642\u0651\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.`,
    controlRefused: "\u062A\u0639\u0630\u0651\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0623\u0645\u0631. \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.",
    poweredOff: "\u0645\u064F\u0637\u0641\u0623",
    defaultLayout: "\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",
    activityFallback: (id) => `\u0627\u0644\u0646\u0634\u0627\u0637 ${isolate(id)}`,
    deviceFallback: (id) => `\u0627\u0644\u062C\u0647\u0627\u0632 ${isolate(id)}`,
    pickerName: `\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0645\u0646 ${SOFABATON}`,
    pickerDescription: `\u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u062E\u0635\u064A\u0635 \u0644\u062A\u0643\u0627\u0645\u0644 ${isolate("Sofabaton X1 / X1S / X2")}.`
  },
  sidebar: {
    title: "\u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0627\u0641\u062A\u0631\u0627\u0636\u064A",
    controlPanel: "\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645",
    hubMenu: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0645\u062D\u0648\u0631",
    back: "\u0631\u062C\u0648\u0639",
    hubReachable: "\u0645\u062A\u0635\u0644",
    hubUnreachable: "\u063A\u064A\u0631 \u0645\u062A\u0635\u0644",
    noHubs: "\u0644\u0645 \u064A\u062A\u0645 \u0625\u0639\u062F\u0627\u062F \u0623\u064A \u0645\u062D\u0648\u0631 \u2068Sofabaton\u2069 \u0628\u0639\u062F.",
    hubUnavailable: "\u0627\u0644\u0645\u062D\u0648\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D",
    remoteUnavailable: "\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0627\u0644\u062E\u0627\u0635 \u0628\u0647\u0630\u0627 \u0627\u0644\u0645\u062D\u0648\u0631 \u063A\u064A\u0631 \u0645\u062A\u0627\u062D.",
    controlPanelLoadFailed: "\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645. \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0635\u0641\u062D\u0629 \u0644\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627.",
    activities: "\u0627\u0644\u0623\u0646\u0634\u0637\u0629",
    devices: "\u0627\u0644\u0623\u062C\u0647\u0632\u0629",
    allOff: "\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0643\u0644",
    off: "\u0645\u0637\u0641\u0623",
    modeToggle: "\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0628\u064A\u0646 \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0648\u0627\u0644\u0623\u062C\u0647\u0632\u0629",
    numberPad: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0631\u0642\u0627\u0645",
    pullHandle: "\u0641\u062A\u062D \u0627\u0644\u0645\u0641\u0636\u0644\u0629 \u0648\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    pullHandleCommands: "\u0641\u062A\u062D \u0627\u0644\u0623\u0648\u0627\u0645\u0631",
    close: "\u0625\u063A\u0644\u0627\u0642",
    starting: "\u062C\u0627\u0631\u064D \u0627\u0644\u0628\u062F\u0621",
    poweringOff: "\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u064A\u0642\u0627\u0641",
    working: "\u062C\u0627\u0631\u064D \u0627\u0644\u0639\u0645\u0644",
    appConnected: "\u062A\u0637\u0628\u064A\u0642 \u2068Sofabaton\u2069 \u0645\u062A\u0635\u0644",
    operations: {
      backup_restore: "\u062C\u0627\u0631\u064D \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629",
      cache_refresh: "\u062C\u0627\u0631\u064D \u062A\u062D\u062F\u064A\u062B \u0630\u0627\u0643\u0631\u0629 \u0627\u0644\u0645\u062D\u0648\u0631 \u0627\u0644\u0645\u0624\u0642\u062A\u0629",
      entity_sync: "\u062C\u0627\u0631\u064D \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0645\u0639 \u0627\u0644\u0645\u062D\u0648\u0631",
      backup_export: "\u062C\u0627\u0631\u064D \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629",
      wifi_deploy: "\u062C\u0627\u0631\u064D \u0646\u0634\u0631 \u2068Wifi Commands\u2069"
    }
  },
  assist: {
    label: "\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",
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
      max_width: "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0639\u0631\u0636 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 (\u0628\u0643\u0633\u0644)",
      key_style: "\u0646\u0645\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631"
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
    favoriteDeviceNames: "\u0625\u0638\u0647\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",
    rowOptions: (groupLabel) => `\u062E\u064A\u0627\u0631\u0627\u062A ${groupLabel}`,
    visibleRows: "\u0627\u0644\u0635\u0641\u0648\u0641 \u0627\u0644\u0645\u0631\u0626\u064A\u0629",
    moveGroupUp: (groupLabel) => `\u0646\u0642\u0644 ${isolate(groupLabel)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649`,
    moveGroupDown: (groupLabel) => `\u0646\u0642\u0644 ${isolate(groupLabel)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0641\u0644`,
    fewerVisibleRows: "\u0635\u0641\u0648\u0641 \u0645\u0631\u0626\u064A\u0629 \u0623\u0642\u0644",
    moreVisibleRows: "\u0635\u0641\u0648\u0641 \u0645\u0631\u0626\u064A\u0629 \u0623\u0643\u062B\u0631",
    reorderGroupHandle: (groupLabel) => `\u0625\u0639\u0627\u062F\u0629 \u062A\u0631\u062A\u064A\u0628 ${isolate(groupLabel)} (\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0623\u0633\u0647\u0645)`,
    macros: "\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",
    favorites: "\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",
    volume: "\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",
    channel: "\u0627\u0644\u0642\u0646\u0627\u0629",
    mediaControls: "\u0627\u0644\u062A\u0634\u063A\u064A\u0644",
    dvr: DVR,
    numpad: "\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0631\u0642\u0627\u0645",
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
    exit: "EXIT",
    rew: "\u062A\u0631\u062C\u064A\u0639",
    pause: "\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A",
    fwd: "\u062A\u0642\u062F\u064A\u0645 \u0633\u0631\u064A\u0639",
    red: "\u0623\u062D\u0645\u0631",
    green: "\u0623\u062E\u0636\u0631",
    yellow: "\u0623\u0635\u0641\u0631",
    blue: "\u0623\u0632\u0631\u0642",
    a: "A",
    b: "B",
    c: "C",
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "\u0625\u062F\u062E\u0627\u0644"
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
      background_override: "Select background colour"
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
    deviceKeymapMissingServer: "Dieses Ger\xE4t ist nicht im Katalog des Hubs. Aktualisiere den Hub in der Sofabaton-Steuerzentrale und lade diese Seite dann neu.",
    serverReadFailed: "Die Hub-Daten konnten nicht vom Server geladen werden. Pr\xFCfe die Verbindung und versuche es erneut.",
    controlRefused: "Der Befehl konnte nicht ausgef\xFChrt werden. Versuche es erneut.",
    poweredOff: "Ausgeschaltet",
    defaultLayout: "Standard-Aktivit\xE4tslayout",
    activityFallback: (id) => `Aktivit\xE4t ${id}`,
    deviceFallback: (id) => `Ger\xE4t ${id}`,
    pickerName: "Virtuelle Sofabaton-Fernbedienung",
    pickerDescription: "Eine konfigurierbare Fernbedienung f\xFCr die Sofabaton-X1-, X1S- und X2-Integration."
  },
  sidebar: {
    title: "Virtuelle Fernbedienung",
    controlPanel: "Steuerzentrale",
    hubMenu: "Hub w\xE4hlen",
    back: "Zur\xFCck",
    hubReachable: "Erreichbar",
    hubUnreachable: "Nicht erreichbar",
    noHubs: "Es ist noch kein Sofabaton-Hub eingerichtet.",
    hubUnavailable: "Hub nicht verf\xFCgbar",
    remoteUnavailable: "Die Fernsteuerung f\xFCr diesen Hub ist nicht verf\xFCgbar.",
    controlPanelLoadFailed: "Die Steuerzentrale konnte nicht geladen werden. Lade die Seite neu, um es erneut zu versuchen.",
    activities: "Aktivit\xE4ten",
    devices: "Ger\xE4te",
    allOff: "Alles aus",
    off: "Aus",
    modeToggle: "Zwischen Aktivit\xE4ten und Ger\xE4ten wechseln",
    numberPad: "Zifferntasten",
    pullHandle: "Favoriten und Makros \xF6ffnen",
    pullHandleCommands: "Befehle \xF6ffnen",
    close: "Schlie\xDFen",
    starting: "Wird gestartet",
    poweringOff: "Wird ausgeschaltet",
    working: "Wird ausgef\xFChrt",
    appConnected: "Die Sofabaton-App ist verbunden",
    operations: {
      backup_restore: "Backup wird wiederhergestellt",
      cache_refresh: "Hub-Cache wird aktualisiert",
      entity_sync: "Wird mit dem Hub synchronisiert",
      backup_export: "Backup wird erstellt",
      wifi_deploy: "Wifi Commands werden \xFCbertragen"
    }
  },
  assist: {
    label: "Tastendr\xFCcke erfassen",
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
      max_width: "Maximale Kartenbreite (px)",
      key_style: "Tastenstil"
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
    favoriteDeviceNames: "Ger\xE4tenamen anzeigen",
    rowOptions: (groupLabel) => `Optionen f\xFCr ${groupLabel}`,
    visibleRows: "Sichtbare Zeilen",
    moveGroupUp: (groupLabel) => `${groupLabel} nach oben verschieben`,
    moveGroupDown: (groupLabel) => `${groupLabel} nach unten verschieben`,
    fewerVisibleRows: "Weniger sichtbare Zeilen",
    moreVisibleRows: "Mehr sichtbare Zeilen",
    reorderGroupHandle: (groupLabel) => `${groupLabel} verschieben (Pfeiltasten)`,
    macros: "Makros",
    favorites: "Favoriten",
    volume: "Lautst\xE4rke",
    channel: "Kanal",
    mediaControls: "Wiedergabe",
    dvr: "DVR",
    numpad: "Ziffernblock",
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
    exit: "EXIT",
    rew: "Zur\xFCckspulen",
    pause: "Pause",
    fwd: "Vorspulen",
    red: "Rot",
    green: "Gr\xFCn",
    yellow: "Gelb",
    blue: "Blau",
    a: "A",
    b: "B",
    c: "C",
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "Enter"
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
    deviceKeymapMissingServer: "Este dispositivo no est\xE1 en el cat\xE1logo del hub. Actualiza el hub en el panel de control de Sofabaton y vuelve a cargar esta p\xE1gina.",
    serverReadFailed: "No se pudieron cargar los datos del hub desde el servidor. Comprueba la conexi\xF3n y vuelve a intentarlo.",
    controlRefused: "No se pudo completar el comando. Vuelve a intentarlo.",
    poweredOff: "Apagado",
    defaultLayout: "Dise\xF1o predeterminado de actividades",
    activityFallback: (id) => `Actividad ${id}`,
    deviceFallback: (id) => `Dispositivo ${id}`,
    pickerName: "Mando a distancia virtual Sofabaton",
    pickerDescription: "Un mando a distancia configurable para la integraci\xF3n Sofabaton X1, X1S y X2."
  },
  sidebar: {
    title: "Mando virtual",
    controlPanel: "Panel de control",
    hubMenu: "Elegir un hub",
    back: "Atr\xE1s",
    hubReachable: "Accesible",
    hubUnreachable: "Inaccesible",
    noHubs: "Todav\xEDa no hay ning\xFAn hub Sofabaton configurado.",
    hubUnavailable: "Hub no disponible",
    remoteUnavailable: "El mando a distancia de este hub no est\xE1 disponible.",
    controlPanelLoadFailed: "No se pudo cargar el panel de control. Recarga la p\xE1gina para volver a intentarlo.",
    activities: "Actividades",
    devices: "Dispositivos",
    allOff: "Apagar todo",
    off: "Apagado",
    modeToggle: "Cambiar entre actividades y dispositivos",
    numberPad: "Teclado num\xE9rico",
    pullHandle: "Abrir favoritos y macros",
    pullHandleCommands: "Abrir comandos",
    close: "Cerrar",
    starting: "Iniciando",
    poweringOff: "Apagando",
    working: "Trabajando",
    appConnected: "La app de Sofabaton est\xE1 conectada",
    operations: {
      backup_restore: "Restaurando la copia de seguridad",
      cache_refresh: "Actualizando la cach\xE9 del hub",
      entity_sync: "Sincronizando con el hub",
      backup_export: "Creando la copia de seguridad",
      wifi_deploy: "Desplegando Wifi Commands"
    }
  },
  assist: {
    label: "Captura de botones",
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
      max_width: "Ancho m\xE1ximo de la tarjeta (px)",
      key_style: "Estilo de los botones"
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
    favoriteDeviceNames: "Mostrar nombres de dispositivos",
    rowOptions: (groupLabel) => `Opciones de ${groupLabel}`,
    visibleRows: "Filas visibles",
    moveGroupUp: (groupLabel) => `Mover ${groupLabel} hacia arriba`,
    moveGroupDown: (groupLabel) => `Mover ${groupLabel} hacia abajo`,
    fewerVisibleRows: "Menos filas visibles",
    moreVisibleRows: "M\xE1s filas visibles",
    reorderGroupHandle: (groupLabel) => `Reordenar ${groupLabel} (teclas de flecha)`,
    macros: "Macros",
    favorites: "Favoritos",
    volume: "Volumen",
    channel: "Canal",
    mediaControls: "Reproducci\xF3n",
    dvr: "DVR",
    numpad: "Teclado num\xE9rico",
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
    exit: "EXIT",
    rew: "Retroceder",
    pause: "Pausa",
    fwd: "Avance r\xE1pido",
    red: "Rojo",
    green: "Verde",
    yellow: "Amarillo",
    blue: "Azul",
    a: "A",
    b: "B",
    c: "C",
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "Intro"
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
    deviceKeymapMissingServer: "Cet appareil ne figure pas dans le catalogue du hub. Actualisez le hub dans le panneau de contr\xF4le Sofabaton, puis rechargez cette page.",
    serverReadFailed: "Impossible de charger les donn\xE9es du hub depuis le serveur. V\xE9rifiez la connexion, puis r\xE9essayez.",
    controlRefused: "La commande n\u2019a pas pu \xEAtre ex\xE9cut\xE9e. R\xE9essayez.",
    poweredOff: "\xC9teinte",
    defaultLayout: "Disposition par d\xE9faut des activit\xE9s",
    activityFallback: (id) => `Activit\xE9 ${id}`,
    deviceFallback: (id) => `Appareil ${id}`,
    pickerName: "T\xE9l\xE9commande virtuelle Sofabaton",
    pickerDescription: "Une t\xE9l\xE9commande configurable pour l\u2019int\xE9gration Sofabaton X1, X1S et X2."
  },
  sidebar: {
    title: "T\xE9l\xE9commande virtuelle",
    controlPanel: "Panneau de contr\xF4le",
    hubMenu: "Choisir un hub",
    back: "Retour",
    hubReachable: "Joignable",
    hubUnreachable: "Injoignable",
    noHubs: "Aucun hub Sofabaton n'est encore configur\xE9.",
    hubUnavailable: "Hub indisponible",
    remoteUnavailable: "La t\xE9l\xE9commande de ce hub est indisponible.",
    controlPanelLoadFailed: "Impossible de charger le panneau de contr\xF4le. Rechargez la page pour r\xE9essayer.",
    activities: "Activit\xE9s",
    devices: "Appareils",
    allOff: "Tout \xE9teindre",
    off: "\xC9teint",
    modeToggle: "Basculer entre activit\xE9s et appareils",
    numberPad: "Pav\xE9 num\xE9rique",
    pullHandle: "Ouvrir les favoris et les macros",
    pullHandleCommands: "Ouvrir les commandes",
    close: "Fermer",
    starting: "D\xE9marrage",
    poweringOff: "Extinction",
    working: "En cours",
    appConnected: "L'application Sofabaton est connect\xE9e",
    operations: {
      backup_restore: "Restauration de la sauvegarde",
      cache_refresh: "Actualisation du cache du hub",
      entity_sync: "Synchronisation avec le hub",
      backup_export: "Cr\xE9ation de la sauvegarde",
      wifi_deploy: "D\xE9ploiement des Wifi Commands"
    }
  },
  assist: {
    label: "Capture de touches",
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
      max_width: "Largeur maximale de la carte (px)",
      key_style: "Style des touches"
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
    favoriteDeviceNames: "Afficher les noms des appareils",
    rowOptions: (groupLabel) => `Options de ${groupLabel}`,
    visibleRows: "Lignes visibles",
    moveGroupUp: (groupLabel) => `D\xE9placer ${groupLabel} vers le haut`,
    moveGroupDown: (groupLabel) => `D\xE9placer ${groupLabel} vers le bas`,
    fewerVisibleRows: "Moins de lignes visibles",
    moreVisibleRows: "Plus de lignes visibles",
    reorderGroupHandle: (groupLabel) => `R\xE9ordonner ${groupLabel} (touches fl\xE9ch\xE9es)`,
    macros: "Macros",
    favorites: "Favoris",
    volume: "Volume",
    channel: "Cha\xEEne",
    mediaControls: "Lecture",
    dvr: "DVR",
    numpad: "Pav\xE9 num\xE9rique",
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
    exit: "EXIT",
    rew: "Retour rapide",
    pause: "Pause",
    fwd: "Avance rapide",
    red: "Rouge",
    green: "Vert",
    yellow: "Jaune",
    blue: "Bleu",
    a: "A",
    b: "B",
    c: "C",
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "Entr\xE9e"
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
    deviceKeymapMissingServer: "Dit apparaat staat niet in de catalogus van de hub. Vernieuw de hub in het Sofabaton-bedieningspaneel en laad deze pagina daarna opnieuw.",
    serverReadFailed: "De hubgegevens konden niet van de server worden geladen. Controleer de verbinding en probeer het opnieuw.",
    controlRefused: "Het commando kon niet worden uitgevoerd. Probeer het opnieuw.",
    poweredOff: "Uitgeschakeld",
    defaultLayout: "Standaardindeling voor activiteiten",
    activityFallback: (id) => `Activiteit ${id}`,
    deviceFallback: (id) => `Apparaat ${id}`,
    pickerName: "Sofabaton virtuele afstandsbediening",
    pickerDescription: "Een configureerbare afstandsbediening voor de Sofabaton X1-, X1S- en X2-integratie."
  },
  sidebar: {
    title: "Virtuele afstandsbediening",
    controlPanel: "Bedieningspaneel",
    hubMenu: "Kies een hub",
    back: "Terug",
    hubReachable: "Bereikbaar",
    hubUnreachable: "Niet bereikbaar",
    noHubs: "Er is nog geen Sofabaton-hub ingesteld.",
    hubUnavailable: "Hub niet beschikbaar",
    remoteUnavailable: "De afstandsbediening voor deze hub is niet beschikbaar.",
    controlPanelLoadFailed: "Het bedieningspaneel kon niet worden geladen. Laad de pagina opnieuw om het nogmaals te proberen.",
    activities: "Activiteiten",
    devices: "Apparaten",
    allOff: "Alles uit",
    off: "Uit",
    modeToggle: "Wisselen tussen activiteiten en apparaten",
    numberPad: "Cijfertoetsen",
    pullHandle: "Favorieten en macro's openen",
    pullHandleCommands: "Commando's openen",
    close: "Sluiten",
    starting: "Wordt gestart",
    poweringOff: "Wordt uitgeschakeld",
    working: "Bezig",
    appConnected: "De Sofabaton-app is verbonden",
    operations: {
      backup_restore: "Back-up wordt teruggezet",
      cache_refresh: "Hub-cache wordt vernieuwd",
      entity_sync: "Wordt gesynchroniseerd met de hub",
      backup_export: "Back-up wordt gemaakt",
      wifi_deploy: "Wifi Commands worden uitgerold"
    }
  },
  assist: {
    label: "Knopdrukken registreren",
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
      max_width: "Maximale kaartbreedte (px)",
      key_style: "Knopstijl"
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
    favoriteDeviceNames: "Apparaatnamen tonen",
    rowOptions: (groupLabel) => `Opties voor ${groupLabel}`,
    visibleRows: "Zichtbare rijen",
    moveGroupUp: (groupLabel) => `Verplaats ${groupLabel} omhoog`,
    moveGroupDown: (groupLabel) => `Verplaats ${groupLabel} omlaag`,
    fewerVisibleRows: "Minder zichtbare rijen",
    moreVisibleRows: "Meer zichtbare rijen",
    reorderGroupHandle: (groupLabel) => `${groupLabel} verplaatsen (pijltjestoetsen)`,
    macros: "Macro's",
    favorites: "Favorieten",
    volume: "Volume",
    channel: "Kanaal",
    mediaControls: "Afspelen",
    dvr: "DVR",
    numpad: "Cijfertoetsen",
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
    exit: "EXIT",
    rew: "Terugspoelen",
    pause: "Pauze",
    fwd: "Vooruitspoelen",
    red: "Rood",
    green: "Groen",
    yellow: "Geel",
    blue: "Blauw",
    a: "A",
    b: "B",
    c: "C",
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "Enter"
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
    deviceKeymapMissingServer: "\u6B64\u8BBE\u5907\u4E0D\u5728 Hub \u7684\u76EE\u5F55\u4E2D\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u4E2D\u5237\u65B0 Hub\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u6B64\u9875\u9762\u3002",
    serverReadFailed: "\u65E0\u6CD5\u4ECE\u670D\u52A1\u5668\u52A0\u8F7D Hub \u6570\u636E\u3002\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",
    controlRefused: "\u65E0\u6CD5\u5B8C\u6210\u8BE5\u547D\u4EE4\u3002\u8BF7\u91CD\u8BD5\u3002",
    poweredOff: "\u5DF2\u5173\u673A",
    defaultLayout: "\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",
    activityFallback: (id) => `\u6D3B\u52A8 ${id}`,
    deviceFallback: (id) => `\u8BBE\u5907 ${id}`,
    pickerName: "Sofabaton \u865A\u62DF\u9065\u63A7\u5668",
    pickerDescription: "\u9002\u7528\u4E8E Sofabaton X1\u3001X1S \u548C X2 \u96C6\u6210\u7684\u53EF\u914D\u7F6E\u9065\u63A7\u5668\u3002"
  },
  sidebar: {
    title: "\u865A\u62DF\u9065\u63A7\u5668",
    controlPanel: "\u63A7\u5236\u9762\u677F",
    hubMenu: "\u9009\u62E9 Hub",
    back: "\u8FD4\u56DE",
    hubReachable: "\u53EF\u8FDE\u63A5",
    hubUnreachable: "\u65E0\u6CD5\u8FDE\u63A5",
    noHubs: "\u5C1A\u672A\u8BBE\u7F6E\u4EFB\u4F55 Sofabaton Hub\u3002",
    hubUnavailable: "Hub \u4E0D\u53EF\u7528",
    remoteUnavailable: "\u6B64 Hub \u7684\u9065\u63A7\u5B9E\u4F53\u4E0D\u53EF\u7528\u3002",
    controlPanelLoadFailed: "\u65E0\u6CD5\u52A0\u8F7D\u63A7\u5236\u9762\u677F\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u9875\u9762\u540E\u91CD\u8BD5\u3002",
    activities: "\u6D3B\u52A8",
    devices: "\u8BBE\u5907",
    allOff: "\u5168\u90E8\u5173\u95ED",
    off: "\u5173\u95ED",
    modeToggle: "\u5728\u6D3B\u52A8\u548C\u8BBE\u5907\u4E4B\u95F4\u5207\u6362",
    numberPad: "\u6570\u5B57\u952E\u76D8",
    pullHandle: "\u6253\u5F00\u6536\u85CF\u548C\u5B8F",
    pullHandleCommands: "\u6253\u5F00\u547D\u4EE4",
    close: "\u5173\u95ED",
    starting: "\u6B63\u5728\u542F\u52A8",
    poweringOff: "\u6B63\u5728\u5173\u95ED",
    working: "\u5904\u7406\u4E2D",
    appConnected: "Sofabaton \u5E94\u7528\u5DF2\u8FDE\u63A5",
    operations: {
      backup_restore: "\u6B63\u5728\u6062\u590D\u5907\u4EFD",
      cache_refresh: "\u6B63\u5728\u5237\u65B0 Hub \u7F13\u5B58",
      entity_sync: "\u6B63\u5728\u540C\u6B65\u5230 Hub",
      backup_export: "\u6B63\u5728\u521B\u5EFA\u5907\u4EFD",
      wifi_deploy: "\u6B63\u5728\u90E8\u7F72 Wifi Commands"
    }
  },
  assist: {
    label: "\u6309\u952E\u6355\u83B7",
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
      max_width: "\u5361\u7247\u6700\u5927\u5BBD\u5EA6\uFF08px\uFF09",
      key_style: "\u6309\u952E\u6837\u5F0F"
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
    favoriteDeviceNames: "\u663E\u793A\u8BBE\u5907\u540D\u79F0",
    rowOptions: (groupLabel) => `${groupLabel}\u9009\u9879`,
    visibleRows: "\u53EF\u89C1\u884C",
    moveGroupUp: (groupLabel) => `\u5C06${groupLabel}\u4E0A\u79FB`,
    moveGroupDown: (groupLabel) => `\u5C06${groupLabel}\u4E0B\u79FB`,
    fewerVisibleRows: "\u51CF\u5C11\u53EF\u89C1\u884C\u6570",
    moreVisibleRows: "\u589E\u52A0\u53EF\u89C1\u884C\u6570",
    reorderGroupHandle: (groupLabel) => `\u8C03\u6574${groupLabel}\u7684\u987A\u5E8F\uFF08\u65B9\u5411\u952E\uFF09`,
    macros: "\u5B8F",
    favorites: "\u6536\u85CF",
    volume: "\u97F3\u91CF",
    channel: "\u9891\u9053",
    mediaControls: "\u64AD\u653E",
    dvr: "DVR",
    numpad: "\u6570\u5B57\u952E\u76D8",
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
    exit: "EXIT",
    rew: "\u5FEB\u9000",
    pause: "\u6682\u505C",
    fwd: "\u5FEB\u8FDB",
    red: "\u7EA2",
    green: "\u7EFF",
    yellow: "\u9EC4",
    blue: "\u84DD",
    a: "A",
    b: "B",
    c: "C",
    num0: "0",
    num1: "1",
    num2: "2",
    num3: "3",
    num4: "4",
    num5: "5",
    num6: "6",
    num7: "7",
    num8: "8",
    num9: "9",
    numdash: "-",
    numenter: "\u786E\u8BA4 (E)"
  }
};
registerRemoteCardTranslation("zh-hans", REMOTE_CARD_STRINGS_ZH_HANS);

// remote-card/src/sidebar-panel.ts
if (!customElements.get(SIDEBAR_REMOTE_TAG)) customElements.define(SIDEBAR_REMOTE_TAG, SofabatonSidebarRemote);
if (!customElements.get(SIDEBAR_PANEL_TAG)) customElements.define(SIDEBAR_PANEL_TAG, SofabatonXPanel);
