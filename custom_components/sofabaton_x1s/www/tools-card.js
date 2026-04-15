// ../node_modules/@lit/reactive-element/css-tag.js
var t = globalThis;
var e = t.ShadowRoot && (void 0 === t.ShadyCSS || t.ShadyCSS.nativeShadow) && "adoptedStyleSheets" in Document.prototype && "replace" in CSSStyleSheet.prototype;
var s = /* @__PURE__ */ Symbol();
var o = /* @__PURE__ */ new WeakMap();
var n = class {
  constructor(t3, e4, o5) {
    if (this._$cssResult$ = true, o5 !== s) throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");
    this.cssText = t3, this.t = e4;
  }
  get styleSheet() {
    let t3 = this.o;
    const s4 = this.t;
    if (e && void 0 === t3) {
      const e4 = void 0 !== s4 && 1 === s4.length;
      e4 && (t3 = o.get(s4)), void 0 === t3 && ((this.o = t3 = new CSSStyleSheet()).replaceSync(this.cssText), e4 && o.set(s4, t3));
    }
    return t3;
  }
  toString() {
    return this.cssText;
  }
};
var r = (t3) => new n("string" == typeof t3 ? t3 : t3 + "", void 0, s);
var i = (t3, ...e4) => {
  const o5 = 1 === t3.length ? t3[0] : e4.reduce((e5, s4, o6) => e5 + ((t4) => {
    if (true === t4._$cssResult$) return t4.cssText;
    if ("number" == typeof t4) return t4;
    throw Error("Value passed to 'css' function must be a 'css' function result: " + t4 + ". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.");
  })(s4) + t3[o6 + 1], t3[0]);
  return new n(o5, t3, s);
};
var S = (s4, o5) => {
  if (e) s4.adoptedStyleSheets = o5.map((t3) => t3 instanceof CSSStyleSheet ? t3 : t3.styleSheet);
  else for (const e4 of o5) {
    const o6 = document.createElement("style"), n4 = t.litNonce;
    void 0 !== n4 && o6.setAttribute("nonce", n4), o6.textContent = e4.cssText, s4.appendChild(o6);
  }
};
var c = e ? (t3) => t3 : (t3) => t3 instanceof CSSStyleSheet ? ((t4) => {
  let e4 = "";
  for (const s4 of t4.cssRules) e4 += s4.cssText;
  return r(e4);
})(t3) : t3;

// ../node_modules/@lit/reactive-element/reactive-element.js
var { is: i2, defineProperty: e2, getOwnPropertyDescriptor: h, getOwnPropertyNames: r2, getOwnPropertySymbols: o2, getPrototypeOf: n2 } = Object;
var a = globalThis;
var c2 = a.trustedTypes;
var l = c2 ? c2.emptyScript : "";
var p = a.reactiveElementPolyfillSupport;
var d = (t3, s4) => t3;
var u = { toAttribute(t3, s4) {
  switch (s4) {
    case Boolean:
      t3 = t3 ? l : null;
      break;
    case Object:
    case Array:
      t3 = null == t3 ? t3 : JSON.stringify(t3);
  }
  return t3;
}, fromAttribute(t3, s4) {
  let i5 = t3;
  switch (s4) {
    case Boolean:
      i5 = null !== t3;
      break;
    case Number:
      i5 = null === t3 ? null : Number(t3);
      break;
    case Object:
    case Array:
      try {
        i5 = JSON.parse(t3);
      } catch (t4) {
        i5 = null;
      }
  }
  return i5;
} };
var f = (t3, s4) => !i2(t3, s4);
var b = { attribute: true, type: String, converter: u, reflect: false, useDefault: false, hasChanged: f };
Symbol.metadata ?? (Symbol.metadata = /* @__PURE__ */ Symbol("metadata")), a.litPropertyMetadata ?? (a.litPropertyMetadata = /* @__PURE__ */ new WeakMap());
var y = class extends HTMLElement {
  static addInitializer(t3) {
    this._$Ei(), (this.l ?? (this.l = [])).push(t3);
  }
  static get observedAttributes() {
    return this.finalize(), this._$Eh && [...this._$Eh.keys()];
  }
  static createProperty(t3, s4 = b) {
    if (s4.state && (s4.attribute = false), this._$Ei(), this.prototype.hasOwnProperty(t3) && ((s4 = Object.create(s4)).wrapped = true), this.elementProperties.set(t3, s4), !s4.noAccessor) {
      const i5 = /* @__PURE__ */ Symbol(), h3 = this.getPropertyDescriptor(t3, i5, s4);
      void 0 !== h3 && e2(this.prototype, t3, h3);
    }
  }
  static getPropertyDescriptor(t3, s4, i5) {
    const { get: e4, set: r4 } = h(this.prototype, t3) ?? { get() {
      return this[s4];
    }, set(t4) {
      this[s4] = t4;
    } };
    return { get: e4, set(s5) {
      const h3 = e4?.call(this);
      r4?.call(this, s5), this.requestUpdate(t3, h3, i5);
    }, configurable: true, enumerable: true };
  }
  static getPropertyOptions(t3) {
    return this.elementProperties.get(t3) ?? b;
  }
  static _$Ei() {
    if (this.hasOwnProperty(d("elementProperties"))) return;
    const t3 = n2(this);
    t3.finalize(), void 0 !== t3.l && (this.l = [...t3.l]), this.elementProperties = new Map(t3.elementProperties);
  }
  static finalize() {
    if (this.hasOwnProperty(d("finalized"))) return;
    if (this.finalized = true, this._$Ei(), this.hasOwnProperty(d("properties"))) {
      const t4 = this.properties, s4 = [...r2(t4), ...o2(t4)];
      for (const i5 of s4) this.createProperty(i5, t4[i5]);
    }
    const t3 = this[Symbol.metadata];
    if (null !== t3) {
      const s4 = litPropertyMetadata.get(t3);
      if (void 0 !== s4) for (const [t4, i5] of s4) this.elementProperties.set(t4, i5);
    }
    this._$Eh = /* @__PURE__ */ new Map();
    for (const [t4, s4] of this.elementProperties) {
      const i5 = this._$Eu(t4, s4);
      void 0 !== i5 && this._$Eh.set(i5, t4);
    }
    this.elementStyles = this.finalizeStyles(this.styles);
  }
  static finalizeStyles(s4) {
    const i5 = [];
    if (Array.isArray(s4)) {
      const e4 = new Set(s4.flat(1 / 0).reverse());
      for (const s5 of e4) i5.unshift(c(s5));
    } else void 0 !== s4 && i5.push(c(s4));
    return i5;
  }
  static _$Eu(t3, s4) {
    const i5 = s4.attribute;
    return false === i5 ? void 0 : "string" == typeof i5 ? i5 : "string" == typeof t3 ? t3.toLowerCase() : void 0;
  }
  constructor() {
    super(), this._$Ep = void 0, this.isUpdatePending = false, this.hasUpdated = false, this._$Em = null, this._$Ev();
  }
  _$Ev() {
    this._$ES = new Promise((t3) => this.enableUpdating = t3), this._$AL = /* @__PURE__ */ new Map(), this._$E_(), this.requestUpdate(), this.constructor.l?.forEach((t3) => t3(this));
  }
  addController(t3) {
    (this._$EO ?? (this._$EO = /* @__PURE__ */ new Set())).add(t3), void 0 !== this.renderRoot && this.isConnected && t3.hostConnected?.();
  }
  removeController(t3) {
    this._$EO?.delete(t3);
  }
  _$E_() {
    const t3 = /* @__PURE__ */ new Map(), s4 = this.constructor.elementProperties;
    for (const i5 of s4.keys()) this.hasOwnProperty(i5) && (t3.set(i5, this[i5]), delete this[i5]);
    t3.size > 0 && (this._$Ep = t3);
  }
  createRenderRoot() {
    const t3 = this.shadowRoot ?? this.attachShadow(this.constructor.shadowRootOptions);
    return S(t3, this.constructor.elementStyles), t3;
  }
  connectedCallback() {
    this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this.enableUpdating(true), this._$EO?.forEach((t3) => t3.hostConnected?.());
  }
  enableUpdating(t3) {
  }
  disconnectedCallback() {
    this._$EO?.forEach((t3) => t3.hostDisconnected?.());
  }
  attributeChangedCallback(t3, s4, i5) {
    this._$AK(t3, i5);
  }
  _$ET(t3, s4) {
    const i5 = this.constructor.elementProperties.get(t3), e4 = this.constructor._$Eu(t3, i5);
    if (void 0 !== e4 && true === i5.reflect) {
      const h3 = (void 0 !== i5.converter?.toAttribute ? i5.converter : u).toAttribute(s4, i5.type);
      this._$Em = t3, null == h3 ? this.removeAttribute(e4) : this.setAttribute(e4, h3), this._$Em = null;
    }
  }
  _$AK(t3, s4) {
    const i5 = this.constructor, e4 = i5._$Eh.get(t3);
    if (void 0 !== e4 && this._$Em !== e4) {
      const t4 = i5.getPropertyOptions(e4), h3 = "function" == typeof t4.converter ? { fromAttribute: t4.converter } : void 0 !== t4.converter?.fromAttribute ? t4.converter : u;
      this._$Em = e4;
      const r4 = h3.fromAttribute(s4, t4.type);
      this[e4] = r4 ?? this._$Ej?.get(e4) ?? r4, this._$Em = null;
    }
  }
  requestUpdate(t3, s4, i5, e4 = false, h3) {
    if (void 0 !== t3) {
      const r4 = this.constructor;
      if (false === e4 && (h3 = this[t3]), i5 ?? (i5 = r4.getPropertyOptions(t3)), !((i5.hasChanged ?? f)(h3, s4) || i5.useDefault && i5.reflect && h3 === this._$Ej?.get(t3) && !this.hasAttribute(r4._$Eu(t3, i5)))) return;
      this.C(t3, s4, i5);
    }
    false === this.isUpdatePending && (this._$ES = this._$EP());
  }
  C(t3, s4, { useDefault: i5, reflect: e4, wrapped: h3 }, r4) {
    i5 && !(this._$Ej ?? (this._$Ej = /* @__PURE__ */ new Map())).has(t3) && (this._$Ej.set(t3, r4 ?? s4 ?? this[t3]), true !== h3 || void 0 !== r4) || (this._$AL.has(t3) || (this.hasUpdated || i5 || (s4 = void 0), this._$AL.set(t3, s4)), true === e4 && this._$Em !== t3 && (this._$Eq ?? (this._$Eq = /* @__PURE__ */ new Set())).add(t3));
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
      if (this.renderRoot ?? (this.renderRoot = this.createRenderRoot()), this._$Ep) {
        for (const [t5, s5] of this._$Ep) this[t5] = s5;
        this._$Ep = void 0;
      }
      const t4 = this.constructor.elementProperties;
      if (t4.size > 0) for (const [s5, i5] of t4) {
        const { wrapped: t5 } = i5, e4 = this[s5];
        true !== t5 || this._$AL.has(s5) || void 0 === e4 || this.C(s5, void 0, i5, e4);
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
    this._$Eq && (this._$Eq = this._$Eq.forEach((t4) => this._$ET(t4, this[t4]))), this._$EM();
  }
  updated(t3) {
  }
  firstUpdated(t3) {
  }
};
y.elementStyles = [], y.shadowRootOptions = { mode: "open" }, y[d("elementProperties")] = /* @__PURE__ */ new Map(), y[d("finalized")] = /* @__PURE__ */ new Map(), p?.({ ReactiveElement: y }), (a.reactiveElementVersions ?? (a.reactiveElementVersions = [])).push("2.1.2");

// ../node_modules/lit-html/lit-html.js
var t2 = globalThis;
var i3 = (t3) => t3;
var s2 = t2.trustedTypes;
var e3 = s2 ? s2.createPolicy("lit-html", { createHTML: (t3) => t3 }) : void 0;
var h2 = "$lit$";
var o3 = `lit$${Math.random().toFixed(9).slice(2)}$`;
var n3 = "?" + o3;
var r3 = `<${n3}>`;
var l2 = document;
var c3 = () => l2.createComment("");
var a2 = (t3) => null === t3 || "object" != typeof t3 && "function" != typeof t3;
var u2 = Array.isArray;
var d2 = (t3) => u2(t3) || "function" == typeof t3?.[Symbol.iterator];
var f2 = "[ 	\n\f\r]";
var v = /<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g;
var _ = /-->/g;
var m = />/g;
var p2 = RegExp(`>|${f2}(?:([^\\s"'>=/]+)(${f2}*=${f2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`, "g");
var g = /'/g;
var $ = /"/g;
var y2 = /^(?:script|style|textarea|title)$/i;
var x = (t3) => (i5, ...s4) => ({ _$litType$: t3, strings: i5, values: s4 });
var b2 = x(1);
var w = x(2);
var T = x(3);
var E = /* @__PURE__ */ Symbol.for("lit-noChange");
var A = /* @__PURE__ */ Symbol.for("lit-nothing");
var C = /* @__PURE__ */ new WeakMap();
var P = l2.createTreeWalker(l2, 129);
function V(t3, i5) {
  if (!u2(t3) || !t3.hasOwnProperty("raw")) throw Error("invalid template strings array");
  return void 0 !== e3 ? e3.createHTML(i5) : i5;
}
var N = (t3, i5) => {
  const s4 = t3.length - 1, e4 = [];
  let n4, l3 = 2 === i5 ? "<svg>" : 3 === i5 ? "<math>" : "", c4 = v;
  for (let i6 = 0; i6 < s4; i6++) {
    const s5 = t3[i6];
    let a3, u3, d3 = -1, f3 = 0;
    for (; f3 < s5.length && (c4.lastIndex = f3, u3 = c4.exec(s5), null !== u3); ) f3 = c4.lastIndex, c4 === v ? "!--" === u3[1] ? c4 = _ : void 0 !== u3[1] ? c4 = m : void 0 !== u3[2] ? (y2.test(u3[2]) && (n4 = RegExp("</" + u3[2], "g")), c4 = p2) : void 0 !== u3[3] && (c4 = p2) : c4 === p2 ? ">" === u3[0] ? (c4 = n4 ?? v, d3 = -1) : void 0 === u3[1] ? d3 = -2 : (d3 = c4.lastIndex - u3[2].length, a3 = u3[1], c4 = void 0 === u3[3] ? p2 : '"' === u3[3] ? $ : g) : c4 === $ || c4 === g ? c4 = p2 : c4 === _ || c4 === m ? c4 = v : (c4 = p2, n4 = void 0);
    const x2 = c4 === p2 && t3[i6 + 1].startsWith("/>") ? " " : "";
    l3 += c4 === v ? s5 + r3 : d3 >= 0 ? (e4.push(a3), s5.slice(0, d3) + h2 + s5.slice(d3) + o3 + x2) : s5 + o3 + (-2 === d3 ? i6 : x2);
  }
  return [V(t3, l3 + (t3[s4] || "<?>") + (2 === i5 ? "</svg>" : 3 === i5 ? "</math>" : "")), e4];
};
var S2 = class _S {
  constructor({ strings: t3, _$litType$: i5 }, e4) {
    let r4;
    this.parts = [];
    let l3 = 0, a3 = 0;
    const u3 = t3.length - 1, d3 = this.parts, [f3, v2] = N(t3, i5);
    if (this.el = _S.createElement(f3, e4), P.currentNode = this.el.content, 2 === i5 || 3 === i5) {
      const t4 = this.el.content.firstChild;
      t4.replaceWith(...t4.childNodes);
    }
    for (; null !== (r4 = P.nextNode()) && d3.length < u3; ) {
      if (1 === r4.nodeType) {
        if (r4.hasAttributes()) for (const t4 of r4.getAttributeNames()) if (t4.endsWith(h2)) {
          const i6 = v2[a3++], s4 = r4.getAttribute(t4).split(o3), e5 = /([.?@])?(.*)/.exec(i6);
          d3.push({ type: 1, index: l3, name: e5[2], strings: s4, ctor: "." === e5[1] ? I : "?" === e5[1] ? L : "@" === e5[1] ? z : H }), r4.removeAttribute(t4);
        } else t4.startsWith(o3) && (d3.push({ type: 6, index: l3 }), r4.removeAttribute(t4));
        if (y2.test(r4.tagName)) {
          const t4 = r4.textContent.split(o3), i6 = t4.length - 1;
          if (i6 > 0) {
            r4.textContent = s2 ? s2.emptyScript : "";
            for (let s4 = 0; s4 < i6; s4++) r4.append(t4[s4], c3()), P.nextNode(), d3.push({ type: 2, index: ++l3 });
            r4.append(t4[i6], c3());
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
  static createElement(t3, i5) {
    const s4 = l2.createElement("template");
    return s4.innerHTML = t3, s4;
  }
};
function M(t3, i5, s4 = t3, e4) {
  if (i5 === E) return i5;
  let h3 = void 0 !== e4 ? s4._$Co?.[e4] : s4._$Cl;
  const o5 = a2(i5) ? void 0 : i5._$litDirective$;
  return h3?.constructor !== o5 && (h3?._$AO?.(false), void 0 === o5 ? h3 = void 0 : (h3 = new o5(t3), h3._$AT(t3, s4, e4)), void 0 !== e4 ? (s4._$Co ?? (s4._$Co = []))[e4] = h3 : s4._$Cl = h3), void 0 !== h3 && (i5 = M(t3, h3._$AS(t3, i5.values), h3, e4)), i5;
}
var R = class {
  constructor(t3, i5) {
    this._$AV = [], this._$AN = void 0, this._$AD = t3, this._$AM = i5;
  }
  get parentNode() {
    return this._$AM.parentNode;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  u(t3) {
    const { el: { content: i5 }, parts: s4 } = this._$AD, e4 = (t3?.creationScope ?? l2).importNode(i5, true);
    P.currentNode = e4;
    let h3 = P.nextNode(), o5 = 0, n4 = 0, r4 = s4[0];
    for (; void 0 !== r4; ) {
      if (o5 === r4.index) {
        let i6;
        2 === r4.type ? i6 = new k(h3, h3.nextSibling, this, t3) : 1 === r4.type ? i6 = new r4.ctor(h3, r4.name, r4.strings, this, t3) : 6 === r4.type && (i6 = new Z(h3, this, t3)), this._$AV.push(i6), r4 = s4[++n4];
      }
      o5 !== r4?.index && (h3 = P.nextNode(), o5++);
    }
    return P.currentNode = l2, e4;
  }
  p(t3) {
    let i5 = 0;
    for (const s4 of this._$AV) void 0 !== s4 && (void 0 !== s4.strings ? (s4._$AI(t3, s4, i5), i5 += s4.strings.length - 2) : s4._$AI(t3[i5])), i5++;
  }
};
var k = class _k {
  get _$AU() {
    return this._$AM?._$AU ?? this._$Cv;
  }
  constructor(t3, i5, s4, e4) {
    this.type = 2, this._$AH = A, this._$AN = void 0, this._$AA = t3, this._$AB = i5, this._$AM = s4, this.options = e4, this._$Cv = e4?.isConnected ?? true;
  }
  get parentNode() {
    let t3 = this._$AA.parentNode;
    const i5 = this._$AM;
    return void 0 !== i5 && 11 === t3?.nodeType && (t3 = i5.parentNode), t3;
  }
  get startNode() {
    return this._$AA;
  }
  get endNode() {
    return this._$AB;
  }
  _$AI(t3, i5 = this) {
    t3 = M(this, t3, i5), a2(t3) ? t3 === A || null == t3 || "" === t3 ? (this._$AH !== A && this._$AR(), this._$AH = A) : t3 !== this._$AH && t3 !== E && this._(t3) : void 0 !== t3._$litType$ ? this.$(t3) : void 0 !== t3.nodeType ? this.T(t3) : d2(t3) ? this.k(t3) : this._(t3);
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
    const { values: i5, _$litType$: s4 } = t3, e4 = "number" == typeof s4 ? this._$AC(t3) : (void 0 === s4.el && (s4.el = S2.createElement(V(s4.h, s4.h[0]), this.options)), s4);
    if (this._$AH?._$AD === e4) this._$AH.p(i5);
    else {
      const t4 = new R(e4, this), s5 = t4.u(this.options);
      t4.p(i5), this.T(s5), this._$AH = t4;
    }
  }
  _$AC(t3) {
    let i5 = C.get(t3.strings);
    return void 0 === i5 && C.set(t3.strings, i5 = new S2(t3)), i5;
  }
  k(t3) {
    u2(this._$AH) || (this._$AH = [], this._$AR());
    const i5 = this._$AH;
    let s4, e4 = 0;
    for (const h3 of t3) e4 === i5.length ? i5.push(s4 = new _k(this.O(c3()), this.O(c3()), this, this.options)) : s4 = i5[e4], s4._$AI(h3), e4++;
    e4 < i5.length && (this._$AR(s4 && s4._$AB.nextSibling, e4), i5.length = e4);
  }
  _$AR(t3 = this._$AA.nextSibling, s4) {
    for (this._$AP?.(false, true, s4); t3 !== this._$AB; ) {
      const s5 = i3(t3).nextSibling;
      i3(t3).remove(), t3 = s5;
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
  constructor(t3, i5, s4, e4, h3) {
    this.type = 1, this._$AH = A, this._$AN = void 0, this.element = t3, this.name = i5, this._$AM = e4, this.options = h3, s4.length > 2 || "" !== s4[0] || "" !== s4[1] ? (this._$AH = Array(s4.length - 1).fill(new String()), this.strings = s4) : this._$AH = A;
  }
  _$AI(t3, i5 = this, s4, e4) {
    const h3 = this.strings;
    let o5 = false;
    if (void 0 === h3) t3 = M(this, t3, i5, 0), o5 = !a2(t3) || t3 !== this._$AH && t3 !== E, o5 && (this._$AH = t3);
    else {
      const e5 = t3;
      let n4, r4;
      for (t3 = h3[0], n4 = 0; n4 < h3.length - 1; n4++) r4 = M(this, e5[s4 + n4], i5, n4), r4 === E && (r4 = this._$AH[n4]), o5 || (o5 = !a2(r4) || r4 !== this._$AH[n4]), r4 === A ? t3 = A : t3 !== A && (t3 += (r4 ?? "") + h3[n4 + 1]), this._$AH[n4] = r4;
    }
    o5 && !e4 && this.j(t3);
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
  constructor(t3, i5, s4, e4, h3) {
    super(t3, i5, s4, e4, h3), this.type = 5;
  }
  _$AI(t3, i5 = this) {
    if ((t3 = M(this, t3, i5, 0) ?? A) === E) return;
    const s4 = this._$AH, e4 = t3 === A && s4 !== A || t3.capture !== s4.capture || t3.once !== s4.once || t3.passive !== s4.passive, h3 = t3 !== A && (s4 === A || e4);
    e4 && this.element.removeEventListener(this.name, this, s4), h3 && this.element.addEventListener(this.name, this, t3), this._$AH = t3;
  }
  handleEvent(t3) {
    "function" == typeof this._$AH ? this._$AH.call(this.options?.host ?? this.element, t3) : this._$AH.handleEvent(t3);
  }
};
var Z = class {
  constructor(t3, i5, s4) {
    this.element = t3, this.type = 6, this._$AN = void 0, this._$AM = i5, this.options = s4;
  }
  get _$AU() {
    return this._$AM._$AU;
  }
  _$AI(t3) {
    M(this, t3);
  }
};
var B = t2.litHtmlPolyfillSupport;
B?.(S2, k), (t2.litHtmlVersions ?? (t2.litHtmlVersions = [])).push("3.3.2");
var D = (t3, i5, s4) => {
  const e4 = s4?.renderBefore ?? i5;
  let h3 = e4._$litPart$;
  if (void 0 === h3) {
    const t4 = s4?.renderBefore ?? null;
    e4._$litPart$ = h3 = new k(i5.insertBefore(c3(), t4), t4, void 0, s4 ?? {});
  }
  return h3._$AI(t3), h3;
};

// ../node_modules/lit-element/lit-element.js
var s3 = globalThis;
var i4 = class extends y {
  constructor() {
    super(...arguments), this.renderOptions = { host: this }, this._$Do = void 0;
  }
  createRenderRoot() {
    var _a;
    const t3 = super.createRenderRoot();
    return (_a = this.renderOptions).renderBefore ?? (_a.renderBefore = t3.firstChild), t3;
  }
  update(t3) {
    const r4 = this.render();
    this.hasUpdated || (this.renderOptions.isConnected = this.isConnected), super.update(t3), this._$Do = D(r4, this.renderRoot, this.renderOptions);
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
