var D="/api/v1";function A1(V){if(V==null||V==="")return null;let H=Number(V);return Number.isFinite(H)?H:null}function d1(V){return V instanceof Error?V.message:String(V)}function m5(V){let H={};for(let C of V){let e=A1(C.long_press_device_id),L=A1(C.long_press_command_id);e&&L!=null&&(H[String(C.button_code)]={device_id:e,command_id:L})}return H}var k1=class V{constructor(H={}){this.kind="server";this.hubId="";this.listeners=[];this.hubStatus=null;this.activities=[];this.devices=[];this.running=null;this.activityPages={};this.devicePages={};this.devicePageVersions={};this.loaded=!1;this.catalogLoaded=!1;this._lastError=null;this.firstAnswerPending=!0;this.loadEpoch=0;this.loadPromise=null;this.loadDirty=!1;this.runningEpoch=0;this.statusPromise=null;this.statusDirty=!1;this.pagePromises={};this.retryTimer=null;this.snapshotCache=null;this.socket=null;this.socketGeneration=0;this.reconnectTimer=null;this.streaming=!1;this.baseUrl=String(H.baseUrl??"").replace(/\/+$/,""),this.fetchImpl=H.fetch??((C,e)=>globalThis.fetch(C,e)),this.wsFactory=H.webSocket??(typeof WebSocket=="function"?C=>new WebSocket(C):null),this.retryBaseMs=Math.max(100,H.reconnectDelayMs??1e3),this.reconnectDelay=this.retryBaseMs,this.retryDelay=this.retryBaseMs}get target(){return this.hubId}get lastError(){return this._lastError}setTarget(H){let C=String(H??"");C!==this.hubId&&(this.hubId=C,this.resetState(),this.closeSocket(),this.listeners.length&&this.start())}snapshot(){if(this.hubId)return this.snapshotCache===null&&(this.snapshotCache=this.buildSnapshot()),this.snapshotCache}subscribe(H){return this.listeners.push(H),this.listeners.length===1&&this.start(),()=>{this.listeners=this.listeners.filter(C=>C!==H),this.listeners.length||this.stop()}}async probeIntegration(){if(!this.hubId)throw new Error("no hub selected");if(await this.ensureLoaded(),!this.hubStatus)throw new Error(this._lastError??"hub status unavailable");return"x1s"}async devicePowerState(H){try{let e=(await this.get(`/devices/${H}/power-state`))?.power_state;return e===1?1:e===0?0:null}catch{return null}}async deviceKeymap(H){if(!this.hubId||(await this.ensureLoaded(),!this.hubStatus||!this.loaded||!this.catalogLoaded))return null;let C=this.devices.find(r=>r.device_id===H);if(!C)return{keymap:null,reason:"cache_miss"};let e=String(H);if(!this.devicePages[e]&&(await this.readDevicePage(H),!this.devicePages[e]))return null;let L=this.devicePages[e];return{keymap:{device:{device_id:C.device_id,name:C.name,device_class:C.device_class??void 0},buttons:L.buttons.map(r=>r.button_code),bindings:L.buttons.filter(r=>r.command_id!=null).map(r=>({button_id:r.button_code,button_name:r.name,command_id:Number(r.command_id),long_press_command_id:r.long_press_command_id??null})),commands:L.commands.map(r=>({command_id:r.command_id,name:r.label})),power_configured:C.idle_behavior!=null&&[1,2,3].includes(Number(C.idle_behavior))}}}async sendCommand(H,C){let e=A1(H);if(e==null)return;let L=A1(C);L||(L=this.running?.activity_id??null),L!=null&&await this.post("/send",{entity_id:L,command_id:e})}async startActivity(H){let C=H.id??this.activities.find(e=>e.name===H.name)?.activity_id??null;C!=null&&await this.post(`/activities/${C}/start`)}async stopActivity(){let H=this.running?.activity_id;H!=null&&await this.post(`/activities/${H}/stop`)}start(){this.hubId&&(this.ensureLoaded(),this.openSocket())}stop(){this.closeSocket(),this.cancelRetry()}resetState(){this.hubStatus=null,this.firstAnswerPending=!0,this.activities=[],this.devices=[],this.running=null,this.activityPages={},this.devicePages={},this.devicePageVersions={},this.loaded=!1,this.catalogLoaded=!1,this._lastError=null,this.loadEpoch+=1,this.runningEpoch+=1,this.loadDirty=!1,this.statusDirty=!1,this.pagePromises={},this.cancelRetry(),this.invalidate()}static readable(H){return!!(H&&H.enabled&&H.status)}invalidate(){this.snapshotCache=null}notify(){for(let H of[...this.listeners])H()}url(H){return`${this.baseUrl}${D}/hubs/${encodeURIComponent(this.hubId)}${H}`}async get(H){let C=await this.fetchImpl(this.url(H),{headers:{accept:"application/json"}});if(!C.ok)throw new Error(`GET ${H} -> ${C.status}`);return await C.json()}async post(H,C){let e=await this.fetchImpl(this.url(H),{method:"POST",headers:C?{accept:"application/json","content-type":"application/json"}:{accept:"application/json"},body:C?JSON.stringify(C):void 0});if(!e.ok)throw new Error(`POST ${H} -> ${e.status}`)}ensureLoaded(){return this.loaded?Promise.resolve():this.loadPromise??this.reload()}reload(){return this.loadEpoch+=1,this.loadPromise?(this.loadDirty=!0,this.loadPromise):(this.loadPromise=(async()=>{do this.loadDirty=!1,await this.loadAll(this.loadEpoch);while(this.loadDirty)})().finally(()=>{this.loadPromise=null}),this.loadPromise)}async loadAll(H){if(!this.hubId)return;let C=this.hubId,e=this.runningEpoch,L=()=>H===this.loadEpoch&&C===this.hubId;try{let r=await this.get("/status");if(!L())return;if(this.hubStatus=r,this.firstAnswerPending=!1,this._lastError=null,V.readable(r)){let[t,i,o]=await Promise.all([this.get("/activities"),this.get("/devices"),this.get("/activity")]);if(!L())return;this.activities=t,this.devices=i,e===this.runningEpoch&&(this.running=o),this.catalogLoaded=!0}else this.running=null;this.loaded=!0,this.cancelRetry()}catch(r){if(!L())return;this._lastError=d1(r),this.hubStatus=null,this.firstAnswerPending=!1,this.loaded=!1,this.scheduleRetry()}this.invalidate(),this.notify(),L()&&this.running&&await this.ensureActivityPages(this.running.activity_id)}refreshStatus(){return this.statusPromise?(this.statusDirty=!0,this.statusPromise):(this.statusPromise=(async()=>{do this.statusDirty=!1,await this.readStatus();while(this.statusDirty)})().finally(()=>{this.statusPromise=null}),this.statusPromise)}async readStatus(){let H=this.hubId,C=this.loadEpoch,e=this.runningEpoch,L=()=>C===this.loadEpoch&&H===this.hubId;try{let r=await this.get("/status");if(!L())return;if(this.hubStatus=r,this.firstAnswerPending=!1,this._lastError=null,V.readable(r)){if(!this.catalogLoaded){this.reload();return}let t=await this.get("/activity");if(!L())return;e===this.runningEpoch&&(this.running=t)}else this.running=null}catch(r){if(!L())return;this._lastError=d1(r),this.hubStatus=null,this.firstAnswerPending=!1,this.scheduleRetry()}this.invalidate(),this.notify()}ensureActivityPages(H){let C=String(H);return this.activityPages[C]?Promise.resolve():(this.pagePromises[C]||(this.pagePromises[C]=this.loadActivityPages(H).finally(()=>{delete this.pagePromises[C]})),this.pagePromises[C])}async loadActivityPages(H){let C=this.hubId,e=this.loadEpoch,L=()=>e===this.loadEpoch&&C===this.hubId;try{let[r,t,i]=await Promise.all([this.get(`/entities/${H}/buttons`),this.get(`/activities/${H}/macros`),this.get(`/activities/${H}/favorites`)]);if(!L())return;this.activityPages[String(H)]={buttons:r,macros:t,favorites:i}}catch(r){if(!L())return;this._lastError=d1(r),this.scheduleRetry();return}this.invalidate(),this.notify()}async readDevicePage(H){let C=String(H),e=this.hubId,L=this.loadEpoch;try{let[r,t]=await Promise.all([this.get(`/entities/${H}/buttons`),this.get(`/devices/${H}/commands`)]);if(L!==this.loadEpoch||e!==this.hubId)return;this.devicePages[C]={buttons:r,commands:t},this.devicePageVersions[C]=(this.devicePageVersions[C]??0)+1}catch(r){if(L!==this.loadEpoch||e!==this.hubId)return;this._lastError=d1(r);return}this.invalidate(),this.notify()}scheduleRetry(){if(!this.listeners.length||this.retryTimer)return;let H=this.retryDelay;this.retryDelay=Math.min(this.retryDelay*2,3e4),this.retryTimer=setTimeout(()=>{this.retryTimer=null,!(!this.listeners.length||!this.hubId)&&(!this.loaded||!this.hubStatus?this.reload():this.running&&!this.activityPages[String(this.running.activity_id)]&&this.ensureActivityPages(this.running.activity_id))},H)}cancelRetry(){this.retryTimer&&clearTimeout(this.retryTimer),this.retryTimer=null,this.retryDelay=this.retryBaseMs}wsUrl(){let H=this.baseUrl;return!H&&typeof location<"u"&&(H=location.origin),`${H.replace(/^http/,"ws")}${D}/events?hub_id=${encodeURIComponent(this.hubId)}`}openSocket(){if(!this.wsFactory||!this.hubId||this.socket)return;this.streaming=!0;let H=++this.socketGeneration,C;try{C=this.wsFactory(this.wsUrl())}catch(e){this._lastError=d1(e),this.scheduleReconnect();return}this.socket=C,C.onopen=()=>{H===this.socketGeneration&&(this.reconnectDelay=this.retryBaseMs,this.reload())},C.onmessage=e=>{H===this.socketGeneration&&this.handleMessage(e.data)},C.onerror=()=>{},C.onclose=()=>{H===this.socketGeneration&&(this.socket=null,this.streaming&&this.scheduleReconnect())}}closeSocket(){this.streaming=!1,this.socketGeneration+=1,this.reconnectTimer&&clearTimeout(this.reconnectTimer),this.reconnectTimer=null;let H=this.socket;if(this.socket=null,H)try{H.close()}catch{}}scheduleReconnect(){if(!this.streaming||this.reconnectTimer)return;let H=this.reconnectDelay;this.reconnectDelay=Math.min(this.reconnectDelay*2,3e4),this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null,this.streaming&&this.openSocket()},H)}handleMessage(H){let C;try{C=typeof H=="string"?JSON.parse(H):H}catch{return}if(!(!C||typeof C!="object"))switch(C.type){case"hello":return;case"dropped":this.reload();return;case"server_event":if(C.kind==="hub_rekeyed"&&C.hub_id&&C.hub_id!==this.hubId){this.hubId=String(C.hub_id),this.reload();return}if(C.hub_id!==this.hubId)return;C.kind==="hub_removed"?(this.hubStatus=null,this.firstAnswerPending=!1,this.invalidate(),this.notify()):this.refreshStatus();return;case"hub_event":if(C.hub_id!==this.hubId||!C.event)return;this.handleHubEvent(C.event);return;default:return}}handleHubEvent(H){let C=H.payload??{};switch(H.kind){case"activity_changed":{let e=A1(C.activity_id);this.running=e==null?null:{activity_id:e,name:C.name??null},this.runningEpoch+=1,this.invalidate(),this.notify(),e!=null&&this.ensureActivityPages(e);return}case"hub_state":case"app_state":case"status_changed":this.refreshStatus();return;case"catalog_ready":C.ready?this.reload():this.refreshStatus();return;case"snapshot_changed":{let e=Array.isArray(C.device_ids)?C.device_ids:[],L=Array.isArray(C.activity_ids)?C.activity_ids:[],r=!e.length&&!L.length,t=r?Object.keys(this.devicePages):e.map(String).filter(i=>this.devicePages[i]);if(r||e.length)this.activityPages={};else for(let i of L)delete this.activityPages[String(i)];for(let i of t)delete this.devicePages[i];this.reload().then(()=>Promise.all(t.map(i=>this.readDevicePage(Number(i)))));return}default:return}}runningPagesReady(){return!this.running||!!this.activityPages[String(this.running.activity_id)]}buildSnapshot(){let H=this.hubStatus?.status??null,C=this.hubStatus?.enabled??!1,e=!!(this.hubStatus&&C&&H?.controllable),L=this.firstAnswerPending&&!this.hubStatus,r=this.running?.activity_id??null,t=this.activities.map(m=>({id:m.activity_id,name:m.name,state:m.activity_id===r?"on":"off"})),i=this.devices.map(m=>({id:m.device_id,name:m.name,device_class:m.device_class??void 0})),o={},a={},l={},n={};for(let[m,c]of Object.entries(this.activityPages)){o[m]=c.buttons.map(h=>h.button_code),a[m]=c.macros.map(h=>({id:h.command_id,name:h.label??""})),l[m]=c.favorites.map(h=>({id:h.command_id,name:h.label??"",device_id:h.device_id}));let v=m5(c.buttons);Object.keys(v).length&&(n[m]=v)}for(let[m,c]of Object.entries(this.devicePages)){let v=m5(c.buttons);Object.keys(v).length&&(n[m]=v)}let s=this.running?.name??t.find(m=>m.id===r)?.name??void 0,A={hub_version:String(H?.hub_version??"").toUpperCase(),current_activity:e?s:void 0,current_activity_id:e?r:null,load_state:this.loaded&&this.runningPagesReady()?"ready":"loading",activities:t,devices:i,assigned_keys:o,macro_keys:a,favorite_keys:l,long_press_keys:n,keymap_versions:{...this.devicePageVersions},hub_id:this.hubId};return{state:L?"off":e?r!=null?"on":"off":"unavailable",attributes:A}}};var _1=globalThis,T1=_1.ShadowRoot&&(_1.ShadyCSS===void 0||_1.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,c2=Symbol(),p5=new WeakMap,s1=class{constructor(H,C,e){if(this._$cssResult$=!0,e!==c2)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=H,this.t=C}get styleSheet(){let H=this.o,C=this.t;if(T1&&H===void 0){let e=C!==void 0&&C.length===1;e&&(H=p5.get(C)),H===void 0&&((this.o=H=new CSSStyleSheet).replaceSync(this.cssText),e&&p5.set(C,H))}return H}toString(){return this.cssText}},R1=V=>new s1(typeof V=="string"?V:V+"",void 0,c2),v2=(V,...H)=>{let C=V.length===1?V[0]:H.reduce((e,L,r)=>e+(t=>{if(t._$cssResult$===!0)return t.cssText;if(typeof t=="number")return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(L)+V[r+1],V[0]);return new s1(C,V,c2)},c5=(V,H)=>{if(T1)V.adoptedStyleSheets=H.map(C=>C instanceof CSSStyleSheet?C:C.styleSheet);else for(let C of H){let e=document.createElement("style"),L=_1.litNonce;L!==void 0&&e.setAttribute("nonce",L),e.textContent=C.cssText,V.appendChild(e)}},u2=T1?V=>V:V=>V instanceof CSSStyleSheet?(H=>{let C="";for(let e of H.cssRules)C+=e.cssText;return R1(C)})(V):V;var{is:cH,defineProperty:vH,getOwnPropertyDescriptor:uH,getOwnPropertyNames:xH,getOwnPropertySymbols:hH,getPrototypeOf:ZH}=Object,U=globalThis,v5=U.trustedTypes,SH=v5?v5.emptyScript:"",gH=U.reactiveElementPolyfillSupport,l1=(V,H)=>V,x2={toAttribute(V,H){switch(H){case Boolean:V=V?SH:null;break;case Object:case Array:V=V==null?V:JSON.stringify(V)}return V},fromAttribute(V,H){let C=V;switch(H){case Boolean:C=V!==null;break;case Number:C=V===null?null:Number(V);break;case Object:case Array:try{C=JSON.parse(V)}catch{C=null}}return C}},x5=(V,H)=>!cH(V,H),u5={attribute:!0,type:String,converter:x2,reflect:!1,useDefault:!1,hasChanged:x5};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),U.litPropertyMetadata??(U.litPropertyMetadata=new WeakMap);var E=class extends HTMLElement{static addInitializer(H){this._$Ei(),(this.l??(this.l=[])).push(H)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(H,C=u5){if(C.state&&(C.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(H)&&((C=Object.create(C)).wrapped=!0),this.elementProperties.set(H,C),!C.noAccessor){let e=Symbol(),L=this.getPropertyDescriptor(H,e,C);L!==void 0&&vH(this.prototype,H,L)}}static getPropertyDescriptor(H,C,e){let{get:L,set:r}=uH(this.prototype,H)??{get(){return this[C]},set(t){this[C]=t}};return{get:L,set(t){let i=L?.call(this);r?.call(this,t),this.requestUpdate(H,i,e)},configurable:!0,enumerable:!0}}static getPropertyOptions(H){return this.elementProperties.get(H)??u5}static _$Ei(){if(this.hasOwnProperty(l1("elementProperties")))return;let H=ZH(this);H.finalize(),H.l!==void 0&&(this.l=[...H.l]),this.elementProperties=new Map(H.elementProperties)}static finalize(){if(this.hasOwnProperty(l1("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(l1("properties"))){let C=this.properties,e=[...xH(C),...hH(C)];for(let L of e)this.createProperty(L,C[L])}let H=this[Symbol.metadata];if(H!==null){let C=litPropertyMetadata.get(H);if(C!==void 0)for(let[e,L]of C)this.elementProperties.set(e,L)}this._$Eh=new Map;for(let[C,e]of this.elementProperties){let L=this._$Eu(C,e);L!==void 0&&this._$Eh.set(L,C)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(H){let C=[];if(Array.isArray(H)){let e=new Set(H.flat(1/0).reverse());for(let L of e)C.unshift(u2(L))}else H!==void 0&&C.push(u2(H));return C}static _$Eu(H,C){let e=C.attribute;return e===!1?void 0:typeof e=="string"?e:typeof H=="string"?H.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(H=>this.enableUpdating=H),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(H=>H(this))}addController(H){(this._$EO??(this._$EO=new Set)).add(H),this.renderRoot!==void 0&&this.isConnected&&H.hostConnected?.()}removeController(H){this._$EO?.delete(H)}_$E_(){let H=new Map,C=this.constructor.elementProperties;for(let e of C.keys())this.hasOwnProperty(e)&&(H.set(e,this[e]),delete this[e]);H.size>0&&(this._$Ep=H)}createRenderRoot(){let H=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return c5(H,this.constructor.elementStyles),H}connectedCallback(){this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),this._$EO?.forEach(H=>H.hostConnected?.())}enableUpdating(H){}disconnectedCallback(){this._$EO?.forEach(H=>H.hostDisconnected?.())}attributeChangedCallback(H,C,e){this._$AK(H,e)}_$ET(H,C){let e=this.constructor.elementProperties.get(H),L=this.constructor._$Eu(H,e);if(L!==void 0&&e.reflect===!0){let r=(e.converter?.toAttribute!==void 0?e.converter:x2).toAttribute(C,e.type);this._$Em=H,r==null?this.removeAttribute(L):this.setAttribute(L,r),this._$Em=null}}_$AK(H,C){let e=this.constructor,L=e._$Eh.get(H);if(L!==void 0&&this._$Em!==L){let r=e.getPropertyOptions(L),t=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:x2;this._$Em=L;let i=t.fromAttribute(C,r.type);this[L]=i??this._$Ej?.get(L)??i,this._$Em=null}}requestUpdate(H,C,e,L=!1,r){if(H!==void 0){let t=this.constructor;if(L===!1&&(r=this[H]),e??(e=t.getPropertyOptions(H)),!((e.hasChanged??x5)(r,C)||e.useDefault&&e.reflect&&r===this._$Ej?.get(H)&&!this.hasAttribute(t._$Eu(H,e))))return;this.C(H,C,e)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(H,C,{useDefault:e,reflect:L,wrapped:r},t){e&&!(this._$Ej??(this._$Ej=new Map)).has(H)&&(this._$Ej.set(H,t??C??this[H]),r!==!0||t!==void 0)||(this._$AL.has(H)||(this.hasUpdated||e||(C=void 0),this._$AL.set(H,C)),L===!0&&this._$Em!==H&&(this._$Eq??(this._$Eq=new Set)).add(H))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(C){Promise.reject(C)}let H=this.scheduleUpdate();return H!=null&&await H,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(let[L,r]of this._$Ep)this[L]=r;this._$Ep=void 0}let e=this.constructor.elementProperties;if(e.size>0)for(let[L,r]of e){let{wrapped:t}=r,i=this[L];t!==!0||this._$AL.has(L)||i===void 0||this.C(L,void 0,r,i)}}let H=!1,C=this._$AL;try{H=this.shouldUpdate(C),H?(this.willUpdate(C),this._$EO?.forEach(e=>e.hostUpdate?.()),this.update(C)):this._$EM()}catch(e){throw H=!1,this._$EM(),e}H&&this._$AE(C)}willUpdate(H){}_$AE(H){this._$EO?.forEach(C=>C.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(H)),this.updated(H)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(H){return!0}update(H){this._$Eq&&(this._$Eq=this._$Eq.forEach(C=>this._$ET(C,this[C]))),this._$EM()}updated(H){}firstUpdated(H){}};E.elementStyles=[],E.shadowRootOptions={mode:"open"},E[l1("elementProperties")]=new Map,E[l1("finalized")]=new Map,gH?.({ReactiveElement:E}),(U.reactiveElementVersions??(U.reactiveElementVersions=[])).push("2.1.2");var p1=globalThis,h5=V=>V,P1=p1.trustedTypes,Z5=P1?P1.createPolicy("lit-html",{createHTML:V=>V}):void 0,Z2="$lit$",F=`lit$${Math.random().toFixed(9).slice(2)}$`,S2="?"+F,fH=`<${S2}>`,j=document,c1=()=>j.createComment(""),v1=V=>V===null||typeof V!="object"&&typeof V!="function",g2=Array.isArray,w5=V=>g2(V)||typeof V?.[Symbol.iterator]=="function",h2=`[ 	
\f\r]`,m1=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,S5=/-->/g,g5=/>/g,K=RegExp(`>|${h2}(?:([^\\s"'>=/]+)(${h2}*=${h2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),f5=/'/g,b5=/"/g,O5=/^(?:script|style|textarea|title)$/i,f2=V=>(H,...C)=>({_$litType$:V,strings:H,values:C}),x=f2(1),k5=f2(2),_5=f2(3),N=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),y5=new WeakMap,Q=j.createTreeWalker(j,129);function T5(V,H){if(!g2(V)||!V.hasOwnProperty("raw"))throw Error("invalid template strings array");return Z5!==void 0?Z5.createHTML(H):H}var R5=(V,H)=>{let C=V.length-1,e=[],L,r=H===2?"<svg>":H===3?"<math>":"",t=m1;for(let i=0;i<C;i++){let o=V[i],a,l,n=-1,s=0;for(;s<o.length&&(t.lastIndex=s,l=t.exec(o),l!==null);)s=t.lastIndex,t===m1?l[1]==="!--"?t=S5:l[1]!==void 0?t=g5:l[2]!==void 0?(O5.test(l[2])&&(L=RegExp("</"+l[2],"g")),t=K):l[3]!==void 0&&(t=K):t===K?l[0]===">"?(t=L??m1,n=-1):l[1]===void 0?n=-2:(n=t.lastIndex-l[2].length,a=l[1],t=l[3]===void 0?K:l[3]==='"'?b5:f5):t===b5||t===f5?t=K:t===S5||t===g5?t=m1:(t=K,L=void 0);let A=t===K&&V[i+1].startsWith("/>")?" ":"";r+=t===m1?o+fH:n>=0?(e.push(a),o.slice(0,n)+Z2+o.slice(n)+F+A):o+F+(n===-2?i:A)}return[T5(V,r+(V[C]||"<?>")+(H===2?"</svg>":H===3?"</math>":"")),e]},u1=class V{constructor({strings:H,_$litType$:C},e){let L;this.parts=[];let r=0,t=0,i=H.length-1,o=this.parts,[a,l]=R5(H,C);if(this.el=V.createElement(a,e),Q.currentNode=this.el.content,C===2||C===3){let n=this.el.content.firstChild;n.replaceWith(...n.childNodes)}for(;(L=Q.nextNode())!==null&&o.length<i;){if(L.nodeType===1){if(L.hasAttributes())for(let n of L.getAttributeNames())if(n.endsWith(Z2)){let s=l[t++],A=L.getAttribute(n).split(F),m=/([.?@])?(.*)/.exec(s);o.push({type:1,index:r,name:m[2],strings:A,ctor:m[1]==="."?D1:m[1]==="?"?E1:m[1]==="@"?F1:Y}),L.removeAttribute(n)}else n.startsWith(F)&&(o.push({type:6,index:r}),L.removeAttribute(n));if(O5.test(L.tagName)){let n=L.textContent.split(F),s=n.length-1;if(s>0){L.textContent=P1?P1.emptyScript:"";for(let A=0;A<s;A++)L.append(n[A],c1()),Q.nextNode(),o.push({type:2,index:++r});L.append(n[s],c1())}}}else if(L.nodeType===8)if(L.data===S2)o.push({type:2,index:r});else{let n=-1;for(;(n=L.data.indexOf(F,n+1))!==-1;)o.push({type:7,index:r}),n+=F.length-1}r++}}static createElement(H,C){let e=j.createElement("template");return e.innerHTML=H,e}};function X(V,H,C=V,e){if(H===N)return H;let L=e!==void 0?C._$Co?.[e]:C._$Cl,r=v1(H)?void 0:H._$litDirective$;return L?.constructor!==r&&(L?._$AO?.(!1),r===void 0?L=void 0:(L=new r(V),L._$AT(V,C,e)),e!==void 0?(C._$Co??(C._$Co=[]))[e]=L:C._$Cl=L),L!==void 0&&(H=X(V,L._$AS(V,H.values),L,e)),H}var B1=class{constructor(H,C){this._$AV=[],this._$AN=void 0,this._$AD=H,this._$AM=C}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(H){let{el:{content:C},parts:e}=this._$AD,L=(H?.creationScope??j).importNode(C,!0);Q.currentNode=L;let r=Q.nextNode(),t=0,i=0,o=e[0];for(;o!==void 0;){if(t===o.index){let a;o.type===2?a=new V1(r,r.nextSibling,this,H):o.type===1?a=new o.ctor(r,o.name,o.strings,this,H):o.type===6&&(a=new N1(r,this,H)),this._$AV.push(a),o=e[++i]}t!==o?.index&&(r=Q.nextNode(),t++)}return Q.currentNode=j,L}p(H){let C=0;for(let e of this._$AV)e!==void 0&&(e.strings!==void 0?(e._$AI(H,e,C),C+=e.strings.length-2):e._$AI(H[C])),C++}},V1=class V{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(H,C,e,L){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=H,this._$AB=C,this._$AM=e,this.options=L,this._$Cv=L?.isConnected??!0}get parentNode(){let H=this._$AA.parentNode,C=this._$AM;return C!==void 0&&H?.nodeType===11&&(H=C.parentNode),H}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(H,C=this){H=X(this,H,C),v1(H)?H===p||H==null||H===""?(this._$AH!==p&&this._$AR(),this._$AH=p):H!==this._$AH&&H!==N&&this._(H):H._$litType$!==void 0?this.$(H):H.nodeType!==void 0?this.T(H):w5(H)?this.k(H):this._(H)}O(H){return this._$AA.parentNode.insertBefore(H,this._$AB)}T(H){this._$AH!==H&&(this._$AR(),this._$AH=this.O(H))}_(H){this._$AH!==p&&v1(this._$AH)?this._$AA.nextSibling.data=H:this.T(j.createTextNode(H)),this._$AH=H}$(H){let{values:C,_$litType$:e}=H,L=typeof e=="number"?this._$AC(H):(e.el===void 0&&(e.el=u1.createElement(T5(e.h,e.h[0]),this.options)),e);if(this._$AH?._$AD===L)this._$AH.p(C);else{let r=new B1(L,this),t=r.u(this.options);r.p(C),this.T(t),this._$AH=r}}_$AC(H){let C=y5.get(H.strings);return C===void 0&&y5.set(H.strings,C=new u1(H)),C}k(H){g2(this._$AH)||(this._$AH=[],this._$AR());let C=this._$AH,e,L=0;for(let r of H)L===C.length?C.push(e=new V(this.O(c1()),this.O(c1()),this,this.options)):e=C[L],e._$AI(r),L++;L<C.length&&(this._$AR(e&&e._$AB.nextSibling,L),C.length=L)}_$AR(H=this._$AA.nextSibling,C){for(this._$AP?.(!1,!0,C);H!==this._$AB;){let e=h5(H).nextSibling;h5(H).remove(),H=e}}setConnected(H){this._$AM===void 0&&(this._$Cv=H,this._$AP?.(H))}},Y=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(H,C,e,L,r){this.type=1,this._$AH=p,this._$AN=void 0,this.element=H,this.name=C,this._$AM=L,this.options=r,e.length>2||e[0]!==""||e[1]!==""?(this._$AH=Array(e.length-1).fill(new String),this.strings=e):this._$AH=p}_$AI(H,C=this,e,L){let r=this.strings,t=!1;if(r===void 0)H=X(this,H,C,0),t=!v1(H)||H!==this._$AH&&H!==N,t&&(this._$AH=H);else{let i=H,o,a;for(H=r[0],o=0;o<r.length-1;o++)a=X(this,i[e+o],C,o),a===N&&(a=this._$AH[o]),t||(t=!v1(a)||a!==this._$AH[o]),a===p?H=p:H!==p&&(H+=(a??"")+r[o+1]),this._$AH[o]=a}t&&!L&&this.j(H)}j(H){H===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,H??"")}},D1=class extends Y{constructor(){super(...arguments),this.type=3}j(H){this.element[this.name]=H===p?void 0:H}},E1=class extends Y{constructor(){super(...arguments),this.type=4}j(H){this.element.toggleAttribute(this.name,!!H&&H!==p)}},F1=class extends Y{constructor(H,C,e,L,r){super(H,C,e,L,r),this.type=5}_$AI(H,C=this){if((H=X(this,H,C,0)??p)===N)return;let e=this._$AH,L=H===p&&e!==p||H.capture!==e.capture||H.once!==e.once||H.passive!==e.passive,r=H!==p&&(e===p||L);L&&this.element.removeEventListener(this.name,this,e),r&&this.element.addEventListener(this.name,this,H),this._$AH=H}handleEvent(H){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,H):this._$AH.handleEvent(H)}},N1=class{constructor(H,C,e){this.element=H,this.type=6,this._$AN=void 0,this._$AM=C,this.options=e}get _$AU(){return this._$AM._$AU}_$AI(H){X(this,H)}},P5={M:Z2,P:F,A:S2,C:1,L:R5,R:B1,D:w5,V:X,I:V1,H:Y,N:E1,U:F1,B:D1,F:N1},bH=p1.litHtmlPolyfillSupport;bH?.(u1,V1),(p1.litHtmlVersions??(p1.litHtmlVersions=[])).push("3.3.2");var B5=(V,H,C)=>{let e=C?.renderBefore??H,L=e._$litPart$;if(L===void 0){let r=C?.renderBefore??null;e._$litPart$=L=new V1(H.insertBefore(c1(),r),r,void 0,C??{})}return L._$AI(V),L};var x1=globalThis,W=class extends E{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var C;let H=super.createRenderRoot();return(C=this.renderOptions).renderBefore??(C.renderBefore=H.firstChild),H}update(H){let C=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(H),this._$Do=B5(C,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return N}};W._$litElement$=!0,W.finalized=!0,x1.litElementHydrateSupport?.({LitElement:W});var yH=x1.litElementPolyfillSupport;yH?.({LitElement:W});(x1.litElementVersions??(x1.litElementVersions=[])).push("4.2.2");var I1={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},h1=V=>(...H)=>({_$litDirective$:V,values:H}),e1=class{constructor(H){}get _$AU(){return this._$AM._$AU}_$AT(H,C,e){this._$Ct=H,this._$AM=C,this._$Ci=e}_$AS(H,C){return this.update(H,C)}update(H,C){return this.render(...C)}};var{I:wH}=P5,D5=V=>V;var F5=V=>V.strings===void 0,E5=()=>document.createComment(""),L1=(V,H,C)=>{let e=V._$AA.parentNode,L=H===void 0?V._$AB:H._$AA;if(C===void 0){let r=e.insertBefore(E5(),L),t=e.insertBefore(E5(),L);C=new wH(r,t,V,V.options)}else{let r=C._$AB.nextSibling,t=C._$AM,i=t!==V;if(i){let o;C._$AQ?.(V),C._$AM=V,C._$AP!==void 0&&(o=V._$AU)!==t._$AU&&C._$AP(o)}if(r!==L||i){let o=C._$AA;for(;o!==r;){let a=D5(o).nextSibling;D5(e).insertBefore(o,L),o=a}}}return C},G=(V,H,C=V)=>(V._$AI(H,C),V),OH={},N5=(V,H=OH)=>V._$AH=H,I5=V=>V._$AH,$1=V=>{V._$AR(),V._$AA.remove()};var $5=(V,H,C)=>{let e=new Map;for(let L=H;L<=C;L++)e.set(V[L],L);return e},z=h1(class extends e1{constructor(V){if(super(V),V.type!==I1.CHILD)throw Error("repeat() can only be used in text expressions")}dt(V,H,C){let e;C===void 0?C=H:H!==void 0&&(e=H);let L=[],r=[],t=0;for(let i of V)L[t]=e?e(i,t):t,r[t]=C(i,t),t++;return{values:r,keys:L}}render(V,H,C){return this.dt(V,H,C).values}update(V,[H,C,e]){let L=I5(V),{values:r,keys:t}=this.dt(H,C,e);if(!Array.isArray(L))return this.ut=t,r;let i=this.ut??(this.ut=[]),o=[],a,l,n=0,s=L.length-1,A=0,m=r.length-1;for(;n<=s&&A<=m;)if(L[n]===null)n++;else if(L[s]===null)s--;else if(i[n]===t[A])o[A]=G(L[n],r[A]),n++,A++;else if(i[s]===t[m])o[m]=G(L[s],r[m]),s--,m--;else if(i[n]===t[m])o[m]=G(L[n],r[m]),L1(V,o[m+1],L[n]),n++,m--;else if(i[s]===t[A])o[A]=G(L[s],r[A]),L1(V,L[n],L[s]),s--,A++;else if(a===void 0&&(a=$5(t,A,m),l=$5(i,n,s)),a.has(i[n]))if(a.has(i[s])){let c=l.get(t[A]),v=c!==void 0?L[c]:null;if(v===null){let h=L1(V,L[n]);G(h,r[A]),o[A]=h}else o[A]=G(v,r[A]),L1(V,L[n],v),L[c]=null;A++}else $1(L[s]),s--;else $1(L[n]),n++;for(;A<=m;){let c=L1(V,o[m+1]);G(c,r[A]),o[A++]=c}for(;n<=s;){let c=L[n++];c!==null&&$1(c)}return this.ut=t,N5(V,o),N}});var Z1=(V,H)=>{let C=V._$AN;if(C===void 0)return!1;for(let e of C)e._$AO?.(H,!1),Z1(e,H);return!0},U1=V=>{let H,C;do{if((H=V._$AM)===void 0)break;C=H._$AN,C.delete(V),V=H}while(C?.size===0)},U5=V=>{for(let H;H=V._$AM;V=H){let C=H._$AN;if(C===void 0)H._$AN=C=new Set;else if(C.has(V))break;C.add(V),TH(H)}};function kH(V){this._$AN!==void 0?(U1(this),this._$AM=V,U5(this)):this._$AM=V}function _H(V,H=!1,C=0){let e=this._$AH,L=this._$AN;if(L!==void 0&&L.size!==0)if(H)if(Array.isArray(e))for(let r=C;r<e.length;r++)Z1(e[r],!1),U1(e[r]);else e!=null&&(Z1(e,!1),U1(e));else Z1(this,V)}var TH=V=>{V.type==I1.CHILD&&(V._$AP??(V._$AP=_H),V._$AQ??(V._$AQ=kH))},W1=class extends e1{constructor(){super(...arguments),this._$AN=void 0}_$AT(H,C,e){super._$AT(H,C,e),U5(this),this.isConnected=H._$AU}_$AO(H,C=!0){H!==this.isConnected&&(this.isConnected=H,H?this.reconnected?.():this.disconnected?.()),C&&(Z1(this,H),U1(this))}setValue(H){if(F5(this._$Ct))this._$Ct._$AI(H,this);else{let C=[...this._$Ct._$AH];C[this._$Ci]=H,this._$Ct._$AI(C,this,0)}}disconnected(){}reconnected(){}};var k=()=>new y2,y2=class{},b2=new WeakMap,f=h1(class extends W1{render(V){return p}update(V,[H]){let C=H!==this.G;return C&&this.G!==void 0&&this.rt(void 0),(C||this.lt!==this.ct)&&(this.G=H,this.ht=V.options?.host,this.rt(this.ct=V.element)),p}rt(V){if(this.isConnected||(V=void 0),typeof this.G=="function"){let H=this.ht??globalThis,C=b2.get(H);C===void 0&&(C=new WeakMap,b2.set(H,C)),C.get(this.G)!==void 0&&this.G.call(this.ht,void 0),C.set(this.G,V),V!==void 0&&this.G.call(this.ht,V)}else this.G.value=V}get lt(){return typeof this.G=="function"?b2.get(this.ht??globalThis)?.get(this.G):this.G?.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}});var r1=["activity","macro_favorites","macros_row","favorites_row","dpad","nav","mid","media","colors","abc","shortcuts"],RH=new Set(r1),K5=2,W5=1,G5=6,w2=["group_order","show_activity","show_dpad","show_nav","show_mid","show_volume","show_channel","show_media","show_dvr","show_colors","show_abc","show_numpad","show_macros_button","show_favorites_button","show_device_toggle","mf_as_rows","mf_row_visible_rows","show_favorite_device_names"],PH="device:";function Q5(V){return`${PH}${V==null?"default":String(V)}`}var BH=["group_order","show_activity","show_dpad","show_nav","show_volume","show_channel","show_media","show_dvr","show_colors","show_abc","show_numpad","show_commands_button","show_power_button","show_device_toggle","show_shortcuts","c_as_rows","c_row_visible_rows"],DH={mf_as_rows:"c_as_rows",mf_row_visible_rows:"c_row_visible_rows"},EH=Object.fromEntries(Object.entries(DH).map(([V,H])=>[H,V])),FH=new Set(BH);function G1(V){let H=V?.device_mode;return H&&typeof H=="object"?H:null}function j5(V){let H=V?.key_style;return H==="tinted"||H==="elevated"||H==="glossy"?H:"flat"}function X5(V){return V?.tinted_panels===!0||V?.key_style==="panel"}function Y5(V){return G1(V)?.enabled!==!1}function J5(V){let H=G1(V)?.open_device;if(H==null)return null;let C=Number(H);return Number.isFinite(C)?C:null}function z5(V,H){let C=G1(V)?.layouts,e=C&&typeof C=="object"?C[H]:null;return e&&typeof e=="object"?e:null}function q5(V){let H={};if(!V||typeof V!="object")return H;for(let[C,e]of Object.entries(V))FH.has(C)&&(H[EH[C]??C]=e);return H}var NH=Object.freeze({show_activity:!0,show_dpad:!0,show_nav:!0,show_mid:!0,show_volume:!0,show_channel:!0,show_media:!0,show_dvr:!0,show_colors:!0,show_abc:!0,show_numpad:!0,show_commands_button:!0,show_power_button:!0,show_device_toggle:!0,show_shortcuts:!0,mf_as_rows:!1,mf_row_visible_rows:K5,group_order:Object.freeze(r1.slice())});function C3(V,H){let C={...NH,...q5(z5(V,"default"))};return H!=null&&(C={...C,...q5(z5(V,String(H)))}),C}function H3(V){return typeof V?.show_commands_button=="boolean"?V.show_commands_button:!0}function V3(V){return typeof V?.show_power_button=="boolean"?V.show_power_button:!0}function e3(V){return typeof V?.show_device_toggle=="boolean"?V.show_device_toggle:!0}function L3(V){return typeof V?.show_shortcuts=="boolean"?V.show_shortcuts:!0}var O2=["left","middle","right"];function IH(V){if(!V||typeof V!="object")return null;let H=String(V.icon??"").trim(),C=Number(V.command_id);return!H||!Number.isFinite(C)?null:{icon:H,command_id:C}}function r3(V,H){let C={};if(H==null)return C;let e=G1(V)?.shortcuts,L=e&&typeof e=="object"?e[String(H)]:null;if(!L||typeof L!="object")return C;for(let r of O2){let t=IH(L[r]);t&&(C[r]=t)}return C}function $H(V){let H={};if(!V||typeof V!="object")return H;for(let C of w2)V[C]!==void 0&&(H[C]=V[C]);return H}function UH(V){let H=$H(V),C=V?.layouts?.default;return C&&typeof C=="object"?{...H,...C}:H}function z1(V,H){let C=UH(V),e=V?.layouts;if(!e||typeof e!="object"||H==null)return C;let L=String(H),r=e[L]??(Number.isFinite(Number(H))?e[Number(H)]:null);return r&&typeof r=="object"?{...C,...r}:C}function q1(V){return typeof V?.show_macros_button=="boolean"?V.show_macros_button:!0}function K1(V){return typeof V?.show_favorites_button=="boolean"?V.show_favorites_button:!0}function t3(V){return V?.show_favorite_device_names===!0}function i3(V){return V?.mf_as_rows===!0}function WH(V){let H=Number(V);if(!Number.isFinite(H))return K5;let C=Math.round(H);return C<W5?W5:C>G5?G5:C}function o3(V){return WH(V?.mf_row_visible_rows)}function M3(V){return typeof V?.show_volume=="boolean"?V.show_volume:typeof V?.show_mid=="boolean"?V.show_mid:!0}function a3(V){return typeof V?.show_channel=="boolean"?V.show_channel:typeof V?.show_mid=="boolean"?V.show_mid:!0}function n3(V){return typeof V?.show_media=="boolean"?V.show_media:!0}function d3(V){return typeof V?.show_dvr=="boolean"?V.show_dvr:!0}function S1(V){let H=Array.isArray(V)?V:r1,C=[],e=new Set;for(let L of H){let r=String(L??"").trim();!RH.has(r)||e.has(r)||(C.push(r),e.add(r))}for(let L of r1)e.has(L)||C.push(L);return C}var M={UP:174,DOWN:178,LEFT:175,RIGHT:177,OK:176,BACK:179,HOME:180,MENU:181,VOL_UP:182,VOL_DOWN:185,MUTE:184,CH_UP:183,CH_DOWN:186,GUIDE:157,DVR:155,PLAY:156,EXIT:154,A:153,B:152,C:151,REW:187,PAUSE:188,FWD:189,RED:190,GREEN:191,YELLOW:192,BLUE:193,NUM_ENTER:158,NUM_0:159,NUM_DASH:160,NUM_9:161,NUM_8:162,NUM_7:163,NUM_6:164,NUM_5:165,NUM_4:166,NUM_3:167,NUM_2:168,NUM_1:169},Q1=Object.freeze([M.NUM_1,M.NUM_2,M.NUM_3,M.NUM_4,M.NUM_5,M.NUM_6,M.NUM_7,M.NUM_8,M.NUM_9,M.NUM_0,M.NUM_DASH,M.NUM_ENTER]);function A3(V){return typeof V?.show_numpad=="boolean"?V.show_numpad:!0}var s3=new Set(["powered off","powered_off","off"]),Pe={up:M.UP,down:M.DOWN,left:M.LEFT,right:M.RIGHT,ok:M.OK,back:M.BACK,home:M.HOME,menu:M.MENU,volup:M.VOL_UP,voldn:M.VOL_DOWN,mute:M.MUTE,chup:M.CH_UP,chdn:M.CH_DOWN,guide:M.GUIDE,dvr:M.DVR,play:M.PLAY,exit:M.EXIT,rew:M.REW,pause:M.PAUSE,fwd:M.FWD,red:M.RED,green:M.GREEN,yellow:M.YELLOW,blue:M.BLUE,a:M.A,b:M.B,c:M.C},Be=new Set([M.C,M.B,M.A,M.EXIT,M.DVR,M.PLAY,M.GUIDE]);function l3(V){return String(V?.attributes?.hub_version||"").toUpperCase()}function k2(V,H){return H?!0:V.includes("X2")}function m3(V,H){return k2(V,H)||V.includes("X1S")}function _2(){return customElements.get("ha-dropdown-item")?"ha-dropdown-item":"sbx-mwc-list-item"}function p3(){return customElements.get("ha-dropdown-item")?["wa-open"]:["opened"]}function c3(){return customElements.get("ha-dropdown-item")?["wa-close"]:["closed"]}function v3(V,H=[]){let C=String(V??"");if(!!!customElements.get("ha-dropdown-item"))return C;let L=H.find(r=>String(r?.value??"")===C);return L?String(L.label??L.value??""):C}async function u3(){let V=_2();await Promise.all([customElements.whenDefined("sbx-ha-icon"),customElements.whenDefined("sbx-ha-select"),customElements.whenDefined(V).catch(()=>{})])}var t1={card:{selectEntityError:"Select a Sofabaton remote entity",remoteUnavailable:"Remote is unavailable (possibly because the Sofabaton app is connected).",noActivitiesWarning:"No activities found in remote attributes.",noMacros:"No macros available",noFavorites:"No favorites available",noCommands:"No commands available",macrosTab:"Macros",favoritesTab:"Favorites",commandsTab:"Commands",powerButton:"Toggle power",activitySelectLabel:"Activity",deviceSelectLabel:"Device",selectDevice:"Select device",allDevicesLayout:"Default device layout",filterCommands:"Filter commands",switchToDeviceMode:"Switch to device mode",switchToActivityMode:"Switch to activity mode",deviceKeymapMissing:"This device's commands are not cached yet. Refresh this device in the Hub tab of the Sofabaton Control Panel, then reload the dashboard.",deviceKeymapError:"Could not load this device's commands.",poweredOff:"Powered Off",defaultLayout:"Default activity layout",activityFallback:V=>`Activity ${V}`,deviceFallback:V=>`Device ${V}`,pickerName:"Sofabaton Virtual Remote",pickerDescription:"A configurable remote for the Sofabaton X1, X1S and X2 integration."},assist:{label:"Key capture",start:"Start",waiting:"Waiting for keypress",exitEditMode:"Exit Edit mode to begin",captured:V=>`Captured: ${V}`,notCaptured:"Not captured.",working:"Working\u2026",triggersReady:"Triggers ready for use",createTriggers:"Create MQTT Discovery triggers",startCapturing:"Start capturing commands",deviceDetectedTitle:"Sofabaton MQTT device detected.",close:"Close",alsoActivityTriggers:"Also create triggers for Activity changes.",seeDocs:"See documentation for this feature.",dontShowAgain:"Don't show this again for this device during this session.",detectedDevice:V=>`Detected MQTT device: ${V}.`,lastCommand:V=>`Last command: ${V}.`,existingTriggers:"Existing MQTT automation triggers were found.",noMqttCommands:"No MQTT commands discovered yet",deviceFallback:V=>`Device ${V}`,unknownDevice:"Unknown device",commandFallback:V=>`Command ${V}`,createdTriggers:(V,H)=>`Created ${V} MQTT Discovery triggers for ${H}`,createdActivityTriggers:V=>`Created ${V} activity triggers for X2 \u2192 Activities`,plusActivityTriggers:V=>` plus ${V} activity triggers`,allTriggersExist:V=>`All MQTT Discovery triggers already exist for ${V}`,buttonFallback:"Button",activityFallbackLabel:"Activity",unknown:"Unknown",automationAssistName:"Automation Assist",notification:{title:"\u{1F6E0}\uFE0F Automation Assist",eventButton:V=>`Button: ${V}`,eventCommand:V=>`Command: ${V}`,eventActivity:V=>`Activity Change: ${V}`,eventOther:V=>`Event: ${V}`,header:(V,H)=>`**Activity: ${V} | ${H}**`,headerDevice:(V,H)=>`**Device: ${V} | ${H}**`,lovelaceHeading:"\u{1F4CB} **Lovelace button code**",lovelaceCopy:"*Copy this to your dashboard YAML:*",serviceHeading:"\u2699\uFE0F **Service call (automation)**",serviceCopy:"*Use this in your scripts or automations:*"}},editor:{fieldLabels:{entity:"Select a Sofabaton remote entity",theme:"Apply a theme to the card",use_background_override:"Customize background color",background_override:"Select background color",show_activity:"Activity/device selector",show_dpad:"Direction pad",show_nav:"Back/Home/Menu keys",show_mid:"Volume/Channel rockers",show_media:"Playback",show_colors:"Red/Green/Yellow/Blue",show_abc:"A/B/C buttons",show_macros_button:"Macros button",show_favorites_button:"Favorites button",max_width:"Maximum card width (px)",key_style:"Button style",group_order:"Group order"},generalOptionsTitle:"General options",keyCapture:"Key capture",keyCaptureDescription:"Send button presses to the hub: capture them to generate ready-to-use YAML for dashboard buttons and automations.",keyCaptureLearnMore:"Learn more about Key capture",keyCaptureDocsAria:"Key capture documentation",stylingOptions:"Styling options",keyStyleFlat:"Flat (matches the card background)",keyStyleTinted:"Tinted (buttons stand out from the background)",keyStyleElevated:"Elevated (tinted with a shadow)",keyStyleGlossy:"Glossy (shiny, curved buttons)",tintedPanels:"Tinted panels",tintedPanelsDescription:"Show a tinted background behind each group of buttons.",layoutOptions:"Layout options",layoutSelectLabel:"Layout",defaultLayoutOption:"Default activity layout",allDevicesOption:"Default device layout",commands:"Commands",power:"Power button",modeToggle:"Mode switch",deviceModeDescription:"Control one device configured on the hub, using that device's button assignments and complete command list.",longPress:"Enable hold-to-repeat",longPressDescription:"Hold a selected button to send its command repeatedly, as on the physical remote.",longPressButtons:"Buttons",enableDeviceMode:"Enable device mode",initialView:"Initial view",initialViewHelper:"What the card shows when it loads",openOnCurrentActivity:"Current activity",macrosFavoritesAsRows:"Macros/Favorites as rows",commandsAsRows:"Commands as rows",favoriteDeviceNames:"Show device names",rowOptions:V=>`${V} options`,visibleRows:"Visible rows",moveGroupUp:V=>`Move ${V} up`,moveGroupDown:V=>`Move ${V} down`,macros:"Macros",favorites:"Favorites",volume:"Volume",channel:"Channel",mediaControls:"Playback",dvr:"DVR",numpad:"Number pad",resetDefaultLayout:"Reset layout",shortcutSlotLeft:"Left shortcut",shortcutSlotMiddle:"Middle shortcut",shortcutSlotRight:"Right shortcut",shortcutIcon:"Icon",shortcutCommand:"Command",shortcutReset:"Reset",shortcutCommandMissing:V=>`Command ${V} (missing)`,shortcutsCommandsLoading:"Loading commands\u2026",shortcutsCommandsUnavailable:"This device's commands are not cached yet. Refresh this device in the Hub tab of the Sofabaton Control Panel, then reload the dashboard.",shortcutsCommandsError:"Could not load this device's commands. Reload the dashboard and try again.",noteDefaultLayout:"Used for activities without their own layout",noteDeviceDefaultLayout:"Used for devices without their own layout",noteCustomActivityLayout:"Using custom activity layout",noteCustomDeviceLayout:"Using custom device layout",noteUsingActivityDefault:"Using default activity layout",noteUsingDeviceDefault:"Using default device layout"},groups:{activity:"Activity/device",macro_favorites:"Macros/Favorites",macros_row:"Macros row",favorites_row:"Favorites row",dpad:"Direction pad",nav:"Back/Home/Menu",mid:"Volume/Channel",media:"Playback",colors:"Color buttons",abc:"A/B/C",shortcuts:"Shortcuts"},keys:{up:"Up",down:"Down",left:"Left",right:"Right",ok:"OK",back:"Back",home:"Home",menu:"Menu",volup:"Vol +",voldn:"Vol -",mute:"Mute",chup:"Ch +",chdn:"Ch -",guide:"Guide",dvr:"DVR",play:"Play",exit:"Exit",rew:"Rewind",pause:"Pause",fwd:"Fast forward",red:"Red",green:"Green",yellow:"Yellow",blue:"Blue",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Enter"}},g1={};function b(V,H){let C=String(V||"").toLowerCase();if(C&&(g1[C]=H,J===C||J.split(/[-_]/)[0]===C)){let e=x3(J);j1=e?R2(t1,e):t1}}function T2(V){return typeof V=="object"&&V!==null&&!Array.isArray(V)}function R2(V,H){if(!T2(H))return V;let C=Array.isArray(V)?[...V]:{...V};for(let[e,L]of Object.entries(H))L!==void 0&&(T2(L)&&T2(V?.[e])?C[e]=R2(V[e],L):C[e]=L);return C}function x3(V){let H=String(V||"").toLowerCase();if(!H)return null;if(g1[H])return g1[H];let C=H.split(/[-_]/)[0];return C&&g1[C]?g1[C]:null}var J="en",j1=t1;function h3(V){let H=String(V||"en").toLowerCase();if(H===J)return!1;J=H;let C=x3(H);return j1=C?R2(t1,C):t1,!0}function Z3(){return J}function X1(){let V=J.split(/[-_]/)[0];return["ar","fa","he","ps","ur"].includes(V)?"rtl":"ltr"}function d(){return j1}function S3(V){let H=String(V||"").trim().toLowerCase();return H?H===t1.card.poweredOff.toLowerCase()?!0:H===j1.card.poweredOff.toLowerCase():!1}var g3=`
      :host {
        --sb-group-radius: var(--ha-card-border-radius, 18px);
        --remote-max-width: 360px;
        --remote-zoom: 1;
        /* Hover / press overlays for keys and drawer buttons, derived from
           the theme's text colour (see sbx-key-button.ts). Declared on
           .wrap below so a card-level theme applied on sbx-ha-card is seen. */

        display: block;
      }

      sbx-ha-card {
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

      /* Theme-resilience tokens, one level below sbx-ha-card (where a card-level
         theme: config lands as inline variables) so both global and card-level
         themes feed them. --secondary-text-color is floored toward primary
         text: themes like Caule alias it to their disabled grey. */
      sbx-ha-card { --sb-theme-secondary-text: var(--secondary-text-color); }
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
      sbx-ha-select { width: 100%; }

      /* HA 2026.04 introduced --ha-color-form-background (used by ha-combo-box-item
         inside sbx-ha-select). Community themes predate this variable so it falls back
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
           ha-dropdown-item (wa) and sbx-mwc-list-item (mdc). */
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
      .sb-activity-select sbx-mwc-list-item[selected],
      .sb-activity-select sbx-mwc-list-item[activated] {
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
         both sbx-ha-select generations (mdc and ha-picker-field) without
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

      /* Favorites device name band (show_favorite_device_names): a narrow
         strip along the top edge, clipped by the card's radius; the content
         below recentres in the remaining height. */
      .drawer-btn {
        --sb-device-band-h: 14px;
      }
      .drawer-btn__device {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: var(--sb-device-band-h);
        padding: 0 6px;
        box-sizing: border-box;
        background: color-mix(in srgb, var(--sb-key-label-color, var(--primary-color)) 16%, transparent);
        color: color-mix(in srgb, var(--primary-text-color) 80%, transparent);
        font-size: 9px;
        font-weight: 500;
        line-height: var(--sb-device-band-h);
        letter-spacing: 0.02em;
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        pointer-events: none;
      }
      .drawer-btn--custom .drawer-btn__device {
        padding: 0 12px;
        text-align: start;
      }
      .drawer-btn--banded .drawer-btn__inner--stack {
        padding-top: calc(var(--sb-device-band-h) + 2px);
      }
      .drawer-btn--banded .drawer-btn__inner--row {
        padding-top: var(--sb-device-band-h);
      }


      /* Active state for buttons */
      .macroFavoritesButton.active-tab {
        background: color-mix(in srgb, var(--primary-color) 14%, transparent);
        color: var(--primary-text-color);
      }

      /* D-pad cluster */
      .dpad {
        padding: 12px;
        position: relative;
        perspective: 900px;
      }
      .dpad-face--keys {
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

      /* Number pad face (docs/internal/numpad-plan.md). The keys face stays
         in flow and sets the group's height; the keypad face is laid over
         it inside the same padding, twelve square keys in four rows, so the
         rows below never move (Q1). The small round toggle in the dead
         corner flips; a tap anywhere outside the group flips back (the
         card's outside-close handler). */
      .dpad-face {
        backface-visibility: hidden;
        transition:
          transform 320ms ease,
          opacity 200ms ease;
      }
      .dpad-face--numpad {
        position: absolute;
        inset: 12px;
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        grid-template-rows: repeat(4, minmax(0, 1fr));
        gap: 6px 10px;
        align-items: stretch;
        justify-items: center;
        transform: rotateX(-180deg);
        opacity: 0;
        --sb-key-font-size: clamp(11px, 5.5cqw, 40px);
      }
      .dpad-face--numpad .key {
        width: auto;
        height: 100%;
      }
      .dpad--numpad-open .dpad-face--keys {
        transform: rotateX(180deg);
        opacity: 0;
      }
      .dpad--numpad-open .dpad-face--numpad {
        transform: rotateX(0);
        opacity: 1;
      }
      /* The button is the hit box: the visible ring is drawn 8px inside
         it, so a finger that lands a little off the circle (the corner is
         dead space anyway) still opens the pad. The ring sits 10px from
         the frame, as before. */
      .dpad-numpad-toggle {
        position: absolute;
        right: 2px;
        bottom: 2px;
        box-sizing: content-box;
        width: clamp(26px, 7cqw, 34px);
        height: clamp(26px, 7cqw, 34px);
        margin: 0;
        padding: 8px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        border: 0;
        background: transparent;
        color: var(--sb-key-label-color, var(--primary-color));
        opacity: 0.45;
        cursor: pointer;
        --mdc-icon-size: 16px;
        font-size: 16px;
        line-height: 1;
        -webkit-tap-highlight-color: transparent;
        transition: opacity 200ms ease;
      }
      .dpad-numpad-toggle::before {
        content: "";
        position: absolute;
        inset: 8px;
        border-radius: 50%;
        border: 1px solid currentColor;
        pointer-events: none;
      }
      .dpad-numpad-toggle:hover,
      .dpad-numpad-toggle:focus-visible {
        opacity: 0.85;
        outline: none;
      }
      .dpad--numpad-open .dpad-numpad-toggle {
        opacity: 0;
        pointer-events: none;
      }
      /* D-pad off, number pad on: the keypad is the group. */
      .dpad--numpad-only {
        perspective: none;
      }
      .dpad--numpad-only .dpad-face--numpad {
        position: static;
        inset: auto;
        transform: none;
        opacity: 1;
        gap: 10px;
        align-items: center;
        justify-items: stretch;
        --sb-key-font-size: clamp(11px, 7cqw, 50px);
      }
      .dpad--numpad-only .dpad-face--numpad .key {
        width: 100%;
        height: auto;
      }
      @media (prefers-reduced-motion: reduce) {
        .dpad-face,
        .dpad-numpad-toggle {
          transition: none;
        }
      }

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
      .sb-notice sbx-ha-icon {
        flex: none;
        margin-top: 1px;
        color: var(--sb-notice-accent);
        /* Real sbx-ha-icon sizes itself from --mdc-icon-size; the harness stub
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
    `;function Y1(V,H){let C=String(H??"").trim();if(C)return C;let e=d().keys[String(V??"").toLowerCase()];return e||(V?String(V).replace(/[_-]+/g," ").replace(/\b\w/g,L=>L.toUpperCase()):d().assist.buttonFallback)}function f3(V){if(Array.isArray(V)&&V.length>=3){let H=Number(V[0]),C=Number(V[1]),e=Number(V[2]);return[H,C,e].some(L=>Number.isNaN(L))?"":`rgb(${H}, ${C}, ${e})`}if(V&&typeof V=="object"&&V.r!=null&&V.g!=null&&V.b!=null){let H=Number(V.r),C=Number(V.g),e=Number(V.b);return[H,C,e].some(L=>Number.isNaN(L))?"":`rgb(${H}, ${C}, ${e})`}return""}function b3({showVolume:V,showChannel:H,isX2:C}){let e=V&&H?"dual":V?"volume":H?"channel":"off";return{midMode:e,classMap:{"mid--dual":e==="dual","mid--volume":e==="volume","mid--channel":e==="channel","mid--x2":C,"mid--x1":!C}}}function y3({isX2:V,showMedia:H,showDvr:C}){let e=V?H&&C?"both":H?"play":C?"dvr":"off":H||C?"play":"off";return{mediaMode:e,classMap:{"media--play":e==="play","media--dvr":e==="dvr","media--both":e==="both","media--x2":V,"media--x1":!V}}}function w3({isX2:V,showVolume:H,showChannel:C,showMedia:e,showDvr:L}){return{volup:H,voldn:H,mute:H,guide:V&&C,chup:C,chdn:C,rew:e,play:e&&V,fwd:e,dvr:V&&L,pause:L||!V&&e,exit:V&&L}}function O3({editMode:V,showMacrosButton:H,showFavoritesButton:C,macros:e,favorites:L,customFavorites:r,disableAllButtons:t}){let i=H||C,o=(H?1:0)+(C?1:0),a=V?!0:e.length>0,l=V?!0:L.length+r.length>0;return{showMF:i,visibleCount:o,macrosDisabled:t||!a,favoritesDisabled:t||!l}}function k3({activeDrawer:V,showMacrosButton:H,showFavoritesButton:C,editMode:e,macros:L,favorites:r,customFavorites:t,disableAllButtons:i}){let o=O3({editMode:e,showMacrosButton:H,showFavoritesButton:C,macros:L,favorites:r,customFavorites:t,disableAllButtons:i}),a=V;return!o.showMF&&a&&(a=null),a==="macros"&&!H&&(a=null),a==="favorites"&&!C&&(a=null),{...o,nextActiveDrawer:a,closedByVisibility:!!(V&&!a)}}var GH={volup:"volume",voldn:"volume",chup:"channel",chdn:"channel",up:"dpad",down:"dpad",left:"dpad",right:"dpad"};function zH(V){let H=V?.hold_repeat;return H&&typeof H=="object"?H:{}}function qH(V){let H=zH(V),C=H.enabled===!0;return{enabled:C,volume:C&&H.volume!==!1,channel:C&&H.channel!==!1,dpad:C&&H.dpad!==!1}}function KH(V){return GH[String(V??"")]??null}function P2(V,H){let C=KH(H);return C?qH(V)[C]:!1}function _3(V,H,C){if(H==null||C==null)return null;let e=Number(H),L=Number(C);if(!Number.isFinite(e)||!Number.isFinite(L))return null;let r=V?.long_press_keys;if(!r||typeof r!="object")return null;let t=r[String(e)];if(!t||typeof t!="object"||Array.isArray(t))return null;let i=t[String(L)];if(!i||typeof i!="object")return null;let o=Number(i.device_id),a=Number(i.command_id);return!Number.isFinite(o)||o<1||!Number.isFinite(a)||a<1?null:{device_id:o,command_id:a}}function QH(){return{ts:0,pointerId:null,type:null}}function jH(V,H,C){let e=H&&typeof H.pointerId=="number"?H.pointerId:null,L=H?.type||null,r=C-V.ts;return r<450||r<1200&&(V.type==="pointerup"||V.type==="touchend")&&(L==="click"||L==="ha-click"||L==="tap")?!1:(V.ts=C,V.pointerId=e,V.type=L,!0)}function H2(V,H,C={}){let e=(Array.isArray(V)?V:[V]).filter(i=>!!i),L=QH(),r=i=>{if(jH(L,i,Date.now())){typeof i.preventDefault=="function"&&i.preventDefault(),typeof i.stopPropagation=="function"&&i.stopPropagation(),typeof i.stopImmediatePropagation=="function"&&i.stopImmediatePropagation();try{C.fireHaptic?.(),H(i)}catch{}}},t=typeof window<"u"&&"PointerEvent"in window;for(let i of e)t?i.addEventListener("pointerup",r,{capture:!0,passive:!1}):(i.addEventListener("touchend",r,{capture:!0,passive:!1}),i.addEventListener("click",r,{capture:!0})),i.addEventListener("ha-click",r,{capture:!0})}var XH=350,B2=260;function T3(V,H=XH){return Math.min(V||0,H)+8}function R3(V){let{desired:H,rowTop:C,rowBottom:e,cardTop:L,cardBottom:r,viewportHeight:t}=V;if(L==null||r==null){let n=t-e,s=C;return n<H&&s>n?"up":"down"}let i=r-e,o=C-L,a=Math.max(0,Math.min(H,i));return Math.max(0,Math.min(H,o))>a?"up":"down"}function P3({up:V,rowTop:H,rowBottom:C,cardTop:e,cardBottom:L,viewportHeight:r}){let t=V?H-(e??0):(L??r)-C;return Math.max(Math.min(120,Math.floor(t)),Math.floor(t-12))}function B3(V,H){return V?{activity:"10",drawer:H?"9":"2"}:H?{activity:"2",drawer:"10"}:{activity:"3",drawer:"2"}}var YH=400,JH=250,D2="sb-hold-repeat";function D3(V){if(!V||V.type!==D2)return 0;let H=V.detail,C=typeof H=="number"?H:Number(H);return Number.isFinite(C)&&C>0?C:0}var J1=class{constructor(H,C={}){this.delayHandle=null;this.intervalHandle=null;this.repeats=0;this.fired=!1;this.fire=H,this.delayMs=C.delayMs??YH,this.intervalMs=C.intervalMs??JH,this.timers={setTimeout:C.setTimeout??((e,L)=>setTimeout(e,L)),clearTimeout:C.clearTimeout??(e=>clearTimeout(e)),setInterval:C.setInterval??((e,L)=>setInterval(e,L)),clearInterval:C.clearInterval??(e=>clearInterval(e))}}get active(){return this.delayHandle!=null||this.intervalHandle!=null}get repeatCount(){return this.repeats}start(){this.clearTimers(),this.fired=!1,this.repeats=0,this.delayHandle=this.timers.setTimeout(()=>{this.delayHandle=null,this.tick(),this.intervalHandle=this.timers.setInterval(()=>this.tick(),this.intervalMs)},this.delayMs)}stop(){return this.clearTimers(),this.fired}consumeFired(){let H=this.fired;return this.fired=!1,H}tick(){this.fired=!0,this.repeats+=1;try{this.fire(this.repeats)}catch{}}clearTimers(){this.delayHandle!=null&&(this.timers.clearTimeout(this.delayHandle),this.delayHandle=null),this.intervalHandle!=null&&(this.timers.clearInterval(this.intervalHandle),this.intervalHandle=null)}},CV=500,E2="sb-long-press";function E3(V){return!!(V&&V.type===E2)}var C2=class{constructor(H,C={}){this.delayHandle=null;this.fired=!1;this.fire=H,this.delayMs=C.delayMs??CV,this.timers={setTimeout:C.setTimeout??((e,L)=>setTimeout(e,L)),clearTimeout:C.clearTimeout??(e=>clearTimeout(e))}}get active(){return this.delayHandle!=null}start(){this.clearTimer(),this.fired=!1,this.delayHandle=this.timers.setTimeout(()=>{this.delayHandle=null,this.fired=!0;try{this.fire()}catch{}},this.delayMs)}stop(){return this.clearTimer(),this.fired}consumeFired(){let H=this.fired;return this.fired=!1,H}clearTimer(){this.delayHandle!=null&&(this.timers.clearTimeout(this.delayHandle),this.delayHandle=null)}};function _(V,H){return V!=null&&Object.prototype.hasOwnProperty.call(V,H)}function F2(V){let H=V?.attributes?.current_activity_id;return H!=null?Number(H):null}function HV(V){return(Array.isArray(V)?V:[]).map(H=>({id:Number(H?.id),name:String(H?.name??""),state:String(H?.state??"")})).filter(H=>Number.isFinite(H.id)&&H.name)}function F3(V,H,C){let e=V?.attributes?.activities,L=Array.isArray(e)&&e.length?e:H&&Array.isArray(C)?C:[];return{activities:HV(L),nextHubActivitiesCache:H&&Array.isArray(e)&&e.length?e:C}}function N3(V){let H=V?.attributes?.devices;return(Array.isArray(H)?H:[]).map(C=>({id:Number(C?.id),name:String(C?.name??""),device_class:C?.device_class!=null?String(C.device_class):void 0})).filter(C=>Number.isFinite(C.id)&&C.name)}function I3(V,H){if(H==null)return"";let C=Number(H);return Number.isFinite(C)&&(Array.isArray(V)?V.find(L=>L.id===C):null)?.name||""}function V2(V,H){if(H==null)return"";let C=Number(H);return Number.isFinite(C)&&(Array.isArray(V)?V.find(L=>L.id===C):null)?.name||""}function $3(V,H){let C=V?.attributes?.current_activity;if(C)return String(C);let e=F2(V);return V2(H,e)}function U3(V,H,C){if(!V)return null;let e=H;if(e==null||e==="")return{activityId:null,label:d().card.defaultLayout,poweredOff:!1};if(e==="powered_off")return{activityId:null,label:d().card.poweredOff,poweredOff:!0};if(typeof e=="string"&&e.startsWith("device:")){let r=e.slice(7);if(r==="default")return{activityId:null,label:d().card.allDevicesLayout,poweredOff:!1,mode:"device",deviceId:null};let t=Number(r);return Number.isFinite(t)?{activityId:null,label:"",poweredOff:!1,mode:"device",deviceId:t}:null}let L=Number(e);return Number.isFinite(L)?{activityId:L,label:V2(C,L),poweredOff:!1}:null}function T(V){let H=String(V||"").trim().toLowerCase();return s3.has(H)||S3(H)}function W3(V,H,C){if(V==null)return!1;let e=Number(V);if(!Number.isFinite(e))return!1;let L=Array.isArray(H)?H.find(r=>Number(r?.id)===e):null;if(L&&L.state!=null&&String(L.state).trim()!==""){let r=String(L.state).trim().toLowerCase();return!T(r)&&r!=="off"}return!!C&&!T(C)}function G3(V){return Array.isArray(V)?`${V.length}:${V.map(H=>String(H??"")).join(",")}`:String(V??"")}function z3({isHubIntegration:V,activityId:H,assignedKeys:C,macroKeys:e,favoriteKeys:L,hubAssignedKeysCache:r,hubMacrosCache:t,hubFavoritesCache:i}){let o={...r||{}},a={...t||{}},l={...i||{}},n=H!=null?String(H):null,s=C&&typeof C=="object"?C:null,A=e&&typeof e=="object"?e:null,m=L&&typeof L=="object"?L:null;if(V&&n!=null){if(s&&(_(s,n)||_(s,H))){let S=s[n]??s[H];o[n]=Array.isArray(S)?S:[]}if(A&&(_(A,n)||_(A,H))){let S=A[n]??A[H];a[n]=Array.isArray(S)?S:[]}if(m&&(_(m,n)||_(m,H))){let S=m[n]??m[H];l[n]=Array.isArray(S)?S:[]}}let c=A&&n!=null&&(_(A,n)||_(A,H))?A[n]??A[H]??[]:V&&n!=null?a[n]??[]:[],v=m&&n!=null&&(_(m,n)||_(m,H))?m[n]??m[H]??[]:V&&n!=null?l[n]??[]:[],h=s&&n!=null&&(_(s,n)||_(s,H))?s[n]??s[H]??null:V&&n!=null?o[n]??null:null;return{actKey:n,assignedMap:s,macroMap:A,favoriteMap:m,hubAssignedKeysCache:o,hubMacrosCache:a,hubFavoritesCache:l,macros:c,favorites:v,rawAssignedKeys:h}}function q3({editMode:V,preview:H,activities:C,currentActivityLabel:e,pendingActivity:L,pendingExpired:r}){let t=[...V?[d().card.defaultLayout]:[],d().card.poweredOff,...C.map(s=>s.name)],i=H?H.poweredOff?d().card.poweredOff:H.label||d().card.activityFallback(H.activityId):null;i&&!t.includes(i)&&t.push(i);let o=i||e||d().card.poweredOff,a=H?H.poweredOff:T(o),l=L&&!r&&L!==o?L:o,n=V||(H?!0:t.length<=1);return{options:t,previewLabel:i,current:o,poweredOff:a,resolvedValue:l,disabled:n,clearPending:!!(L&&(r||o===L))}}function K3({editMode:V,preview:H,devices:C,currentDeviceId:e}){let L=[{value:"",label:d().card.selectDevice},...C.map(t=>({value:String(t.id),label:t.name}))],r=e!=null?String(e):"";return V&&H?.mode==="device"&&(H.deviceId==null?(L.push({value:"device:default",label:d().card.allDevicesLayout}),r="device:default"):(r=String(H.deviceId),L.some(t=>t.value===r)||L.push({value:r,label:d().card.deviceFallback(H.deviceId)}))),{options:L,resolvedValue:r,disabled:V}}function Q3(V,H,C){return!V&&H===0&&C!=="loading"?d().card.noActivitiesWarning:""}function f1(V){return new Promise(H=>setTimeout(H,V))}function j3(V,H){return{requestSeen:V||{},queue:Array.isArray(H)?H:[]}}function X3(V,H){return H&&(V[H]=!0),V}function Y3(V,H){return!!(H&&V[H])}function J3(V,H,{priority:C=!1,gapMs:e=150}={}){let L={list:H,gapMs:Number(e)};return C?V.unshift(L):V.push(L),V}function C0(V,H,C=3e3,e=Date.now()){let L=V[H]||0;return e-L<C?!1:(V[H]=e,!0)}function H0(V){return`req:basic:${V}`}function V0(){return["type:request_basic_data"]}function e0(V){return V==null?null:["type:request_assigned_keys",`activity_id:${Number(V)}`]}function L0(V){return V==null?null:["type:request_favorite_keys",`activity_id:${Number(V)}`]}function r0(V){return V==null?null:["type:request_macro_keys",`activity_id:${Number(V)}`]}function t0(V){return V==null?null:["type:start_activity",`activity_id:${Number(V)}`]}function i0(V){return V==null?null:["type:stop_activity",`activity_id:${Number(V)}`]}function N2(V,H){let C=Number(V),e=Number(H);return!Number.isFinite(C)||!Number.isFinite(e)?null:["type:send_assigned_key",`activity_id:${C}`,`key_id:${e}`]}function o0(V,H){let C=Number(V),e=Number(H);return!Number.isFinite(C)||!Number.isFinite(e)?null:["type:send_macro_key",`activity_id:${C}`,`key_id:${e}`]}function I2(V,H){let C=Number(V),e=Number(H);return!Number.isFinite(C)||!Number.isFinite(e)?null:["type:send_favorite_key",`device_id:${C}`,`key_id:${e}`]}function M0(V,H,C){let e=Number(H),L=Number(C);return!V||!Number.isFinite(e)||!Number.isFinite(L)?null:{entity_id:V,command:e,device:L}}function a0(V,H=0){if(!V||typeof V!="object")return null;let C=String(V.name??V.label??"").trim();if(!C)return null;let e=V.icon!=null&&String(V.icon).trim()?String(V.icon).trim():null,L=V.action&&typeof V.action=="object"?V.action:V.tap_action&&typeof V.tap_action=="object"?V.tap_action:null,r=V.command_id??V.key_id??V.command??V.key??V.id??null,t=V.device_id??V.activity_id??V.device??V.activity??null,i=r!=null?Number(r):null,o=t!=null?Number(t):null,a=Number.isFinite(i)&&(t==null||Number.isFinite(o)),l=!!(L&&(L.action||L.service||L.perform_action||L.navigation_path||L.url_path));return!a&&!l?null:{__custom:!0,name:C,icon:e,action:l?L:null,command_id:Number.isFinite(i)?i:null,device_id:Number.isFinite(o)?o:null,_idx:H,_raw:V}}function n0(V){let C=(Array.isArray(V)?V:[]).map(e=>{let L=String(e?.name??""),r=String(e?.icon??""),t=String(e?.command_id??""),i=String(e?.device_id??""),o="";try{o=e?.action?JSON.stringify(e.action):""}catch{o="[unserializable]"}return`${L}|${r}|${t}|${i}|${o}`});return`${C.length}:${C.join(";;")}`}var VV="Sofabaton Virtual Remote",$2="0.2.4";var d0=`__${VV}_logged__`,e2="__sofabatonAutomationAssistSession__",A0="__sofabatonPreviewActivityCache__",L2="sbx-virtual-remote",s0="sbx-virtual-remote-editor",l0=()=>{if(typeof window>"u")return null;let V=window[A0];return V&&typeof V=="object"?V:null},m0=V=>{if(!V)return null;let H=l0();return H?H[String(V)]??null:null},p0=(V,H)=>{if(!V||typeof window>"u")return;let C=l0()??{};C[String(V)]=H==null?"":String(H),window[A0]=C};function c0(){let V=window;if(V[d0])return;V[d0]=!0;let H="padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;line-height:18px;",C=H+"background:#ef4444;color:#fff;",e=H+"background:#22c55e;color:#062b12;",L=H+"background:#facc15;color:#111827;",r=H+"background:#3b82f6;color:#fff;",t="color:transparent;";console.log(`%cSofabaton%c %c Virtual %c %c  Remote  %c %c   ${$2}   `,C,t,e,t,L,t,r)}function I(V){if(V==null)return"";try{return JSON.stringify(V)}catch{return String(V)}}var eV={sofabaton_x1s:"x1s",sofabaton_hub:"hub"},r2=class{constructor(){this.kind="ha";this._hass=null;this._entityId=""}get hass(){return this._hass}get entityId(){return this._entityId}setHass(H){this._hass=H}setTarget(H){this._entityId=String(H??"")}snapshot(){if(this._entityId)return this._hass?.states?.[this._entityId]}async probeIntegration(){if(!this._hass?.callWS||!this._entityId)throw new Error("hass.callWS unavailable");let H=await this._hass.callWS({type:"config/entity_registry/get",entity_id:this._entityId});return eV[String(H?.platform||"")]??"unknown"}entryId(){return String(this.snapshot()?.attributes?.entry_id??"")}async devicePowerState(H){if(!this._hass?.callWS)return null;let C=this.entryId();if(!C)return null;try{let L=(await this._hass.callWS({type:"sofabaton_x1s/device/power_state",entry_id:C,device_id:H}))?.power_state;return L===1?1:L===0?0:null}catch{return null}}async deviceKeymap(H){if(!this._hass?.callWS)return null;let C=this.entryId();return C?this._hass.callWS({type:"sofabaton_x1s/device/keymap",entry_id:C,device_id:H}):null}async sendCommand(H,C){let e=M0(this._entityId,H,C);e&&await this.callService("remote","send_command",e)}async sendRawCommandList(H){await this.callService("remote","send_command",{entity_id:this._entityId,command:H})}async startActivity(H){await this.callService("remote","turn_on",{entity_id:this._entityId,activity:H.name})}async stopActivity(){await this.callService("remote","turn_off",{entity_id:this._entityId})}async callService(H,C,e={},L=void 0){if(!this._hass?.callService)throw new TypeError("hass.callService unavailable");return this._hass.callService(H,C,e,L)}};var LV=198,rV=199,tV=15e3,iV="sofabaton-remote:last-device:";function oV(V){return{show_activity:!0,show_dpad:!0,show_nav:!0,show_mid:!0,show_media:!0,show_dvr:!0,show_colors:!0,show_abc:!0,theme:"",background_override:null,show_automation_assist:!1,show_macros_button:null,show_favorites_button:null,custom_favorites:[],max_width:360,shrink:0,group_order:r1.slice(),...V}}var t2=class{constructor(H,C){this._backend=null;this._haBackend=null;this._backendUnsubscribe=null;this._config=null;this._editMode=!1;this.previewActivity=null;this.integration=null;this.integrationEntityId=null;this.integrationDetectingFor=null;this.hubRequestSeen=null;this.hubQueue=null;this.hubQueueBusy=!1;this.hubRequestCache=null;this.hubActivitiesCache=null;this.hubAssignedKeysCache=null;this.hubMacrosCache=null;this.hubFavoritesCache=null;this.x2LastFetchedActivityId=null;this.enabledButtonsCache=[];this.enabledButtonsCacheKey=null;this.enabledButtonsInvalid=!1;this.loadPending=!1;this.pendingActivity=null;this.pendingActivityAt=null;this.activityLoadActive=!1;this.activityLoadTarget=null;this.activityLoadTimeout=null;this.commandPulseUntil=0;this.commandPulseTimeout=null;this.previewState=null;this._mode="activity";this._deviceId=null;this.deviceKeymaps={};this.deviceKeymapFetching=new Set;this.initialViewApplied=!1;this.commandFilter="";this.activeDrawer=null;this.activityMenuOpen=!1;this.lastUpdateFingerprint=null;this.powerBusy=!1;this._powerAssumption=null;this.onChange=H,this.host=C}get backend(){return this._backend}get hass(){return this._haBackend?.hass??null}get config(){return this._config}get editMode(){return this._editMode}setConfig(H){if(!H||!H.entity)throw new Error(d().card.selectEntityError);if(Object.prototype.hasOwnProperty.call(H,"preview_activity"))this.previewActivity=String(H?.preview_activity??""),p0(H?.entity,this.previewActivity);else if(this.previewActivity==null){let C=m0(H?.entity);this.previewActivity=C??""}this._config=oV(H),this._backend?.setTarget(String(this._config.entity)),this.activeDrawer=null,this.activityMenuOpen=!1,this.initialViewApplied=!1,this.invalidateFingerprint(),this.onChange()}setHass(H){this._haBackend||(this._haBackend=new r2),this._haBackend.setHass(H),this.setBackend(this._haBackend)}setBackend(H){this._backend!==H&&(this._backendUnsubscribe?.(),this._backendUnsubscribe=null,this._backend=H,H?.subscribe&&(this._backendUnsubscribe=H.subscribe(()=>this.onBackendChange()))),H&&this._config?.entity&&H.setTarget(String(this._config.entity)),this.onBackendChange()}onBackendChange(){this.ensureIntegration().then(()=>{this.shouldNotify()&&this.onChange()})}setEditMode(H){this._editMode=!!H,this.invalidateFingerprint(),this.onChange()}setPreviewActivity(H){this.previewActivity=H??"",this.invalidateFingerprint()}connected(){this._backend?.subscribe&&!this._backendUnsubscribe&&(this._backendUnsubscribe=this._backend.subscribe(()=>this.onBackendChange()))}disconnected(){this._backendUnsubscribe?.(),this._backendUnsubscribe=null,this.commandPulseTimeout&&clearTimeout(this.commandPulseTimeout),this.activityLoadTimeout&&clearTimeout(this.activityLoadTimeout),this.commandPulseTimeout=null,this.commandPulseUntil=0,this.activityLoadTimeout=null}invalidateFingerprint(){this.lastUpdateFingerprint=null}shouldNotify(){let H=this.updateFingerprint();return H===this.lastUpdateFingerprint?!1:(this.lastUpdateFingerprint=H,!0)}updateFingerprint(){let H=String(this._config?.entity||""),C=H?this.remoteState():null,e=C?.attributes||{},L=String(this._config?.theme||""),r=this.hass?.themes,t=L?r?.themes?.[L]:null,i=r?.darkMode?"dark":"light",o=this._deviceId!=null?this.deviceKeymaps[String(this._deviceId)]:null;return[H,String(C?.state??""),String(e?.current_activity_id??""),String(e?.current_activity??""),String(e?.load_state??""),String(e?.hub_version??""),I(e?.activities),I(e?.devices),I(e?.assigned_keys),I(e?.macro_keys),I(e?.favorite_keys),I(this._config?.background_override),L,i,I(t),this._editMode?"1":"0",String(this.previewActivity??""),this.integration||"",this._mode,String(this._deviceId??""),o?`${o.status}:${o.version??0}:${o.buttons.length}:${o.commands.length}`:"",I(e?.keymap_versions)].join("|")}async ensureIntegration(){if(!this._backend||!this._config?.entity)return;let H=String(this._config.entity);if(this.integrationEntityId&&this.integrationEntityId!==H&&(this.hubRequestCache=null,this.hubRequestSeen=null,this.hubQueue=null,this.hubQueueBusy=!1,this.hubActivitiesCache=null,this.hubAssignedKeysCache=null,this.hubMacrosCache=null,this.hubFavoritesCache=null,this.x2LastFetchedActivityId=null,this._mode="activity",this._deviceId=null,this.deviceKeymaps={},this.commandFilter="",this.initialViewApplied=!1),!(this.integrationEntityId===H&&this.integration)&&this.integrationDetectingFor!==H){this.integrationDetectingFor=H;try{this.integration=await this._backend.probeIntegration(),this.integrationEntityId=H}catch{this.integration=null,this.integrationEntityId=H}finally{this.integrationDetectingFor=null,this.invalidateFingerprint()}}}isHubIntegration(){return this.integration==="hub"}hubVersion(){return l3(this.remoteState())}isX2(){return k2(this.hubVersion(),this.isHubIntegration())}supportsUnicodeCommandNames(){return m3(this.hubVersion(),this.isHubIntegration())}mode(){return this._mode}currentDeviceId(){return this._deviceId}devices(){return N3(this.remoteState())}deviceNameForId(H){return I3(this.devices(),H)||null}deviceModeAvailable(){return this.integration!=="x1s"||!Y5(this._config)?!1:this.devices().length>0}maybeApplyInitialView(){if(this.initialViewApplied)return;let H=J5(this._config);if(H==null){this.initialViewApplied=!0;return}if(!this.deviceModeAvailable())return;this.initialViewApplied=!0;let C=Number(H);this.devices().some(e=>e.id===C)&&(this._mode="device",this._deviceId=C,this.ensureDeviceKeymap(C))}setMode(H){if(this._mode!==H){if(this._mode=H,this.activeDrawer=null,this.commandFilter="",H==="device"){let C=this.readLastDevice(),e=this.devices();this._deviceId=C!=null&&e.some(L=>L.id===C)?C:null,this._deviceId!=null&&this.ensureDeviceKeymap(this._deviceId)}this.invalidateFingerprint(),this.onChange()}}toggleMode(){this.setMode(this._mode==="device"?"activity":"device")}setDevice(H){let C=H!=null&&Number.isFinite(Number(H))?Number(H):null;this._deviceId!==C&&(this._deviceId=C,this.commandFilter="",this.writeLastDevice(C),C!=null&&this.ensureDeviceKeymap(C),this.invalidateFingerprint(),this.onChange())}setCommandFilter(H){this.commandFilter=String(H??""),this.onChange()}deviceKeymapState(H=this._deviceId){return H==null?null:this.deviceKeymaps[String(H)]??null}devicePowerConfigured(H=this._deviceId){let C=this.deviceKeymapState(H);return C?.status==="ready"&&C.powerConfigured===!0}async fetchDevicePowerState(H){let C=this._backend;if(!C)return null;try{return await C.devicePowerState(H)}catch{return null}}async toggleDevicePower(){if(this._editMode||this.powerBusy)return;let H=this._backend;if(!H||!this._config?.entity)return;let C=this._deviceId;if(!(C==null||!this.devicePowerConfigured(C))){this.powerBusy=!0,this.onChange();try{let e=null,L=this._powerAssumption;if(L&&L.deviceId===C&&Date.now()-L.at<tV?e=L.state:e=await this.fetchDevicePowerState(C),e==null)return;let r=e===1?rV:LV;this.triggerCommandPulse(),await H.sendCommand(r,C),this._powerAssumption={deviceId:C,state:e===1?0:1,at:Date.now()}}finally{this.powerBusy=!1,this.onChange()}}}filteredCommands(){let H=this.deviceKeymapState();return!H||H.status!=="ready"?[]:this.filterAndSortCommands(H.commands)}keymapVersion(H){let C=this.remoteState()?.attributes?.keymap_versions;return Number(C?.[String(H)]??0)||0}keymapStale(H){let C=this.deviceKeymaps[String(H)];return C?C.status==="loading"?!1:(C.version??0)!==this.keymapVersion(H):!0}async ensureDeviceKeymap(H){let C=String(H);if(!this.keymapStale(H))return;let e=this._backend;if(!e||this.deviceKeymapFetching.has(C))return;let L=this.keymapVersion(H),r=this.deviceKeymaps[C];r||(this.deviceKeymaps[C]={status:"loading",buttons:[],commands:[],version:L}),this.deviceKeymapFetching.add(C);try{let t=await e.deviceKeymap(H);if(t===null){r||(delete this.deviceKeymaps[C],this.invalidateFingerprint(),this.onChange());return}let i=t?.keymap;if(!i)this.deviceKeymaps[C]={status:"cache_miss",buttons:[],commands:[],version:L};else{let o=new Set((Array.isArray(i.buttons)?i.buttons:[]).map(a=>Number(a)));for(let a of Array.isArray(i.bindings)?i.bindings:[])Number(a?.command_id)&&o.add(Number(a.button_id));this.deviceKeymaps[C]={status:"ready",buttons:[...o].filter(a=>Number.isFinite(a)),commands:(Array.isArray(i.commands)?i.commands:[]).map(a=>({command_id:Number(a?.command_id),name:String(a?.name??"")})).filter(a=>Number.isFinite(a.command_id)&&a.name),powerConfigured:i.power_configured===!0,version:L}}}catch{this.deviceKeymaps[C]={status:"error",buttons:[],commands:[],version:L}}finally{this.deviceKeymapFetching.delete(C)}this.invalidateFingerprint(),this.onChange()}lastDeviceStorageKey(){let H=String(this._config?.entity||"");return H?`${iV}${H}`:null}readLastDevice(){let H=this.lastDeviceStorageKey();if(!H||typeof window>"u")return null;try{let C=window.localStorage?.getItem(H),e=C==null?NaN:Number(C);return Number.isFinite(e)?e:null}catch{return null}}writeLastDevice(H){let C=this.lastDeviceStorageKey();if(!(!C||typeof window>"u"))try{H==null?window.localStorage?.removeItem(C):window.localStorage?.setItem(C,String(H))}catch{}}remoteState(){return this._backend?.snapshot()}currentActivityId(){return F2(this.remoteState())}activities(){let{activities:H,nextHubActivitiesCache:C}=F3(this.remoteState(),this.isHubIntegration(),this.hubActivitiesCache);return this.hubActivitiesCache=C,H}currentActivityLabel(){return $3(this.remoteState(),this.activities())}activityNameForId(H){return V2(this.activities(),H)??null}previewSelectionState(H){return U3(this._editMode,this.previewActivity,Array.isArray(H)?H:this.activities())}effectiveActivityId(){return this.previewState?this.previewState.activityId:this.currentActivityId()}isActivityOn(H,C){return W3(H,Array.isArray(C)?C:this.activities(),this.currentActivityLabel())}layoutConfig(H=this.effectiveActivityId()){return z1(this._config,H)}groupOrderList(H=null){let C=z1(this._config,H??this.effectiveActivityId());return S1(C?.group_order)}layoutSignature(H,C){let e=S1(C?.group_order),L=[`activity:${H??"off"}`,`order:${e.join(",")}`];for(let r of w2)r!=="group_order"&&L.push(`${r}:${String(C?.[r])}`);return L.join("|")}showMacrosButton(){return q1(this.layoutConfig())}showFavoritesButton(){return K1(this.layoutConfig())}customFavorites(){let H=this._config?.custom_favorites;if(!Array.isArray(H))return[];let C=[];for(let e=0;e<H.length;e++){let L=a0(H[e],e);L&&C.push(L)}return C}customFavoritesSignature(H){return n0(H)}automationAssistEnabled(){return!!this._config?.show_automation_assist}enabledButtons(){return this.enabledButtonsCache||[]}isEnabled(H){if(this._mode==="device"){let e=this.deviceKeymapState();return!e||e.status!=="ready"?!0:e.buttons.includes(Number(H))}let C=this.enabledButtons();return this.enabledButtonsInvalid||!C.length?!0:C.some(e=>e.command===Number(H))}anyKeyBound(H){if(this._mode==="device"){let e=this.deviceKeymapState();return!e||e.status!=="ready"?!1:H.some(L=>e.buttons.includes(L))}if(this.enabledButtonsInvalid)return!1;let C=this.enabledButtons();return H.some(e=>C.some(L=>L.command===e))}commandTarget(H){return this.enabledButtons().find(L=>L.command===Number(H))||null}resolveCommandDeviceId(H,C=null){let e=C!=null?Number(C):this.commandTarget(H)?.activity_id??this.currentActivityId();return e==null||!Number.isFinite(Number(e))?null:Number(e)}activityLoadingActive(){return this.activityLoadActive}isLoadingActive(){let H=!!this.activityLoadActive,C=this.commandPulseUntil&&Date.now()<this.commandPulseUntil;return H||!!C||this.loadPending}triggerCommandPulse(){this.commandPulseUntil=Date.now()+1e3,this.host.onCommandPulseChange?.(!0),this.commandPulseTimeout&&clearTimeout(this.commandPulseTimeout),this.commandPulseTimeout=setTimeout(()=>{this.commandPulseUntil=0,this.commandPulseTimeout=null,this.host.onCommandPulseChange?.(!1)},1e3)}startActivityLoading(H){this.activityLoadTarget=String(H??""),this.activityLoadActive=!0,this.onChange(),this.activityLoadTimeout&&clearTimeout(this.activityLoadTimeout),this.activityLoadTimeout=setTimeout(()=>{this.activityLoadActive&&(this.activityLoadActive=!1,this.onChange())},6e4)}stopActivityLoading(H=!0){this.activityLoadActive&&(this.activityLoadActive=!1,this.activityLoadTarget=null,this.activityLoadTimeout&&clearTimeout(this.activityLoadTimeout),this.activityLoadTimeout=null,H&&this.onChange())}hubInitState(){let H=j3(this.hubRequestSeen,this.hubQueue);this.hubRequestSeen=H.requestSeen,this.hubQueue=H.queue}hubQueueIdle(){let H=Array.isArray(this.hubQueue)?this.hubQueue.length:0;return!this.hubQueueBusy&&H===0}hubEnqueueCommand(H,{priority:C=!1,gapMs:e=150}={}){this.isHubIntegration()&&(!this._backend||!this._config?.entity||(this.hubInitState(),this.hubQueue=J3(this.hubQueue,H,{priority:C,gapMs:e}),this.hubDrainQueue().catch(()=>{})))}hubEnqueueRequest(H,C){this.isHubIntegration()&&(!this._backend||!this._config?.entity||(this.hubInitState(),!(C&&Y3(this.hubRequestSeen,C))&&(C&&(this.hubRequestSeen=X3(this.hubRequestSeen,C)),this.hubEnqueueCommand(H,{priority:!1,gapMs:3e3}))))}async hubDrainQueue(){if(this.isHubIntegration()&&!(!this._backend||!this._config?.entity)&&(this.hubInitState(),!this.hubQueueBusy)){this.hubQueueBusy=!0;try{for(;this.hubQueue.length;){let H=this.hubQueue.shift();if(!H?.list)continue;await this._backend?.sendRawCommandList?.(H.list);let C=Number.isFinite(Number(H?.gapMs))?Number(H.gapMs):750;await f1(C)}}finally{this.hubQueueBusy=!1,this.host.onHubQueueDrained?.()}}}hubThrottle(H,C=3e3){return this.hubRequestCache=this.hubRequestCache||{},C0(this.hubRequestCache,H,C)}async hubSendCommandList(H,C=null,e=3e3){if(!this._editMode&&this.isHubIntegration()&&!(!this._backend||!this._config?.entity)&&(this.hubInitState(),!(C&&!this.hubThrottle(C,e)))){if(this.hubQueueBusy||Array.isArray(this.hubQueue)&&this.hubQueue.length){this.hubEnqueueCommand(H,{priority:!0,gapMs:150});return}await this._backend?.sendRawCommandList?.(H)}}hubRequestBasicData(){let H=String(this._config?.entity||"");this.hubEnqueueRequest(V0(),H0(H))}hubRequestAssignedKeys(H){let C=e0(H);C&&this.hubEnqueueCommand(C,{priority:!1,gapMs:3e3})}hubRequestFavoriteKeys(H){let C=L0(H);C&&this.hubEnqueueCommand(C,{priority:!1,gapMs:3e3})}hubRequestMacroKeys(H){let C=r0(H);C&&this.hubEnqueueCommand(C,{priority:!1,gapMs:3e3})}async hubStartActivity(H){let C=t0(H);C&&await this.hubSendCommandList(C)}async hubStopActivity(H){let C=i0(H);C&&await this.hubSendCommandList(C)}async callService(H,C,e,L=void 0){let r=this._backend;if(!r?.callService)throw new TypeError("service calls are unavailable on this backend");await r.callService(H,C,e,L)}async runLovelaceAction(H,C=null){if(this._editMode||!H||typeof H!="object")return;let e=String(H.action||"").toLowerCase(),L=(!e||e==="default")&&(H.service||H.perform_action);if(e!=="none"){if(e==="call-service"||e==="perform-action"||L){let r=String(H.service||H.perform_action||"").trim();if(!r.includes("."))return;let[t,i]=r.split(".",2),o={...H.service_data||H.data||{}},a=H.target&&typeof H.target=="object"?H.target:void 0;await this.callService(t,i,o,a);return}if(e==="toggle"){let r=H.entity_id||H.entity||C?.entity_id||C?.entityId;if(!r)return;await this.callService("homeassistant","toggle",{entity_id:r});return}if(e==="more-info"){let r=H.entity_id||H.entity||C?.entity_id||C?.entityId;if(!r)return;this.host.fireEvent("hass-more-info",{entityId:r});return}if(e==="navigate"){let r=H.navigation_path;if(!r)return;history.pushState(null,"",String(r)),window.dispatchEvent(new Event("location-changed",{bubbles:!0,composed:!0}));return}if(e==="url"){let r=H.url_path;if(!r)return;window.open(String(r),"_blank");return}if(e==="fire-dom-event"){this.host.fireEvent("ll-custom",H);return}}}async sendCommand(H,C=null){if(this._editMode||!this._backend||!this._config?.entity)return;let e=this._mode==="device"?C!=null&&Number.isFinite(Number(C))?Number(C):this._deviceId:this.resolveCommandDeviceId(H,C);if(!(this._mode==="device"&&e==null)){if(this.isHubIntegration()){let L=N2(e,H);if(!L)return;await this.hubSendCommandList(L);return}await this._backend.sendCommand(H,e)}}longPressBindingForButton(H,C){if(this.integration!=="x1s")return null;let e=this.remoteState()?.attributes;return _3(e,C,H)}longPressAvailableForButton(H,C){return this.longPressBindingForButton(H,C)!==null}async sendLongPress(H,C){if(this._editMode||!this._backend||!this._config?.entity)return;let e=this.longPressBindingForButton(H,C);e&&await this._backend.sendCommand(e.command_id,e.device_id)}async sendDrawerItem(H,C,e,L){if(this._editMode)return;if(!this.isHubIntegration())return this.sendCommand(C,e);if(!this._backend||!this._config?.entity)return;let r=Number(e??this.currentActivityId()),t=Number(C);if(!Number.isFinite(t))return;if(H==="macros"){let o=o0(r,t);return o?this.hubSendCommandList(o):void 0}if(H==="favorites"){let o=Number(L?.device_id??L?.device),a=I2(o,t);return a?this.hubSendCommandList(a):void 0}let i=N2(r,t);if(i)return this.hubSendCommandList(i)}async sendCustomFavoriteCommand(H,C){if(this._editMode||!this._backend||!this._config?.entity)return;let e=Number(H),L=Number(C);if(!(!Number.isFinite(e)||!Number.isFinite(L))){if(this.isHubIntegration()){let r=I2(L,e);if(!r)return;await this.hubSendCommandList(r);return}await this._backend.sendCommand(e,L)}}async setActivity(H){if(this._editMode||H==null||H==="")return;let C=String(H),e=this.currentActivityLabel();if(C===e)return;if(this.pendingActivity=C,this.pendingActivityAt=Date.now(),this.startActivityLoading(C),this.isHubIntegration()){if(T(C)){let o=this.currentActivityId();o!=null&&await this.hubStopActivity(o);return}let i=this.activities().find(o=>o.name===C)?.id;if(i==null)return;await this.hubStartActivity(i);return}let L=this._backend;if(!L)return;if(T(C)){await L.stopActivity();return}let r=this.activities().find(t=>t.name===C);await L.startActivity({id:r?.id??null,name:C})}deriveRuntimeState(){let H=this.remoteState(),C=this.activities(),e=this.previewSelectionState(C);this.previewState=e,this.maybeApplyInitialView();let L=e?e.mode==="device"?"device":"activity":this._mode;L==="device"&&!e&&!this.deviceModeAvailable()&&(L="activity");let r=e?e.activityId:this.currentActivityId(),t=L==="device"?e?e.deviceId??null:this._deviceId:null,i=L==="device"?C3(this._config,t):z1(this._config,r);L==="device"&&t!=null&&this.keymapStale(t)&&this.ensureDeviceKeymap(t);let o=L==="device"?this.deviceKeymapState(t):null,a=H?.state==="unavailable",l=H?.attributes??{},n=l?.load_state,s=l?.assigned_keys,A=l?.macro_keys,m=l?.favorite_keys,c=z3({isHubIntegration:this.isHubIntegration(),activityId:r,assignedKeys:s,macroKeys:A,favoriteKeys:m,hubAssignedKeysCache:this.hubAssignedKeysCache||{},hubMacrosCache:this.hubMacrosCache||{},hubFavoritesCache:this.hubFavoritesCache||{}});if(this.hubAssignedKeysCache=c.hubAssignedKeysCache,this.hubMacrosCache=c.hubMacrosCache,this.hubFavoritesCache=c.hubFavoritesCache,this.isHubIntegration()&&!a){if(C.length===0&&n!=="loading"&&this.hubRequestBasicData(),r!=null){let O=Number(r);this.x2LastFetchedActivityId!==O&&(this.x2LastFetchedActivityId=O,this.hubRequestAssignedKeys(O),this.hubRequestMacroKeys(O),this.hubRequestFavoriteKeys(O))}}else this.isHubIntegration()&&r==null&&(this.x2LastFetchedActivityId=null);let v=c.rawAssignedKeys,h=G3(v);if(this.enabledButtonsCacheKey!==h){this.enabledButtonsCacheKey=h;let O=Array.isArray(v)?v.map(H1=>({command:Number(H1),activity_id:r})).filter(H1=>Number.isFinite(H1.command)):[];this.enabledButtonsInvalid=Array.isArray(v)&&O.length===0,this.enabledButtonsCache=O}let S=L!=="device"&&!a&&!e&&n==="loading"&&(r==null?C.length===0:v==null);this.loadPending=S;let g=this.pendingActivityAt?Date.now()-this.pendingActivityAt:null,P=g!=null&&g>15e3,w=null,y=null,$=!1,B="";if(a)this.stopActivityLoading(!1);else if(L==="device")y=K3({editMode:this._editMode,preview:e,devices:this.devices(),currentDeviceId:t}),B=t!=null?this.deviceNameForId(t)??"":"",$=!1;else{w=q3({editMode:this._editMode,preview:e,activities:C,currentActivityLabel:this.currentActivityLabel(),pendingActivity:this.pendingActivity,pendingExpired:P}),B=w.current,$=e?!!e.poweredOff:r==null||!!w.poweredOff,w.clearPending&&(this.pendingActivity=null,this.pendingActivityAt=null);let O=this.currentActivityLabel();this.activityLoadActive&&this.activityLoadTarget&&(T(this.activityLoadTarget)&&$||O===this.activityLoadTarget)&&this.stopActivityLoading(!1)}let M1=M3(i),a1=a3(i),s2=n3(i),w1=d3(i),l2=this.deviceModeAvailable()&&e3(i),m2=L==="device"?Q5(t):r,p2=o?.status==="ready"?this.filterAndSortCommands(o.commands):[],n1=L!=="device"?"":o?.status==="cache_miss"?d().card.deviceKeymapMissing:o?.status==="error"?d().card.deviceKeymapError:"";return{remote:H,isUnavailable:a,loadState:n,activities:C,preview:e,activityId:r,mode:L,deviceId:t,keymapEntry:o,keymapLoading:o?.status==="loading",loadPending:S,commands:p2,commandFilter:this.commandFilter,showCommandsButton:H3(i),deviceModeAvailable:l2,layoutConfig:i,layoutSignature:this.layoutSignature(m2,i),macros:c.macros,favorites:c.favorites,customFavorites:this.customFavorites(),rawAssignedKeys:v,selectState:w,deviceSelectState:y,currentLabel:B,isPoweredOff:$,isX2:this.isX2(),showVolume:M1,showChannel:a1,showMedia:s2,showDvr:w1,noActivitiesMessage:L==="device"?n1:Q3(a,C.length,n)}}filterAndSortCommands(H){let C=this.commandFilter.trim().toLowerCase();return[...C?H.filter(L=>L.name.toLowerCase().includes(C)):H].sort((L,r)=>L.name.localeCompare(r.name,void 0,{sensitivity:"base"}))}};function i2(V,H,C){if(!V||!H)return"";let e=V.kind||"button";if(e==="activity")return C?Number.isFinite(Number(V.activityId))?["action: remote.send_command","target:",`  entity_id: ${H}`,"data:","  command:","    - type:start_activity",`    - activity_id:${V.activityId}`].join(`
`):"":["action: remote.turn_on","target:",`  entity_id: ${H}`,"data:",`  activity: ${V.activityName}`].join(`
`);if(e==="power")return C?Number.isFinite(Number(V.activityId))?["action: remote.send_command","target:",`  entity_id: ${H}`,"data:","  command:","    - type:stop_activity",`    - activity_id:${V.activityId}`].join(`
`):"":["action: remote.turn_off","target:",`  entity_id: ${H}`].join(`
`);if(C){let L=V.commandType==="macro"?"send_macro_key":V.commandType==="favorite"?"send_favorite_key":"send_assigned_key",r=V.commandType==="favorite"?"device_id":"activity_id";return["action: remote.send_command","target:",`  entity_id: ${H}`,"data:","  command:",`    - type:${L}`,`    - ${r}:${V.deviceId}`,`    - key_id:${V.commandId}`].join(`
`)}return["action: remote.send_command","target:",`  entity_id: ${H}`,"data:",`  command: ${V.commandId}`,`  device: ${V.deviceId}`].join(`
`)}function U2(V,H,C){if(!V||!H)return"";let e=V.kind||"button",L=V.label||d().assist.automationAssistName,r=e==="activity"?"mdi:television-classic":e==="power"?"mdi:power":V.commandType==="favorite"?"mdi:star":V.commandType==="macro"?"mdi:cogs":V.icon||"mdi:remote",t=i2(V,H,C).split(`
`).map(i=>`  ${i}`).join(`
`);return["type: button",`name: ${L}`,`icon: ${r}`,"tap_action:","  action: perform-action","  perform_"+t.substring(2),"hold_action:","  action: none"].join(`
`)}function v0(V,H,C,e){if(!V)return"";let L=V.kind||"button",r=d().assist.notification,t=V.activityName||e||d().assist.unknown,i=V.label??"",o=L==="button"?V.deviceMode?r.eventCommand(i):r.eventButton(i):L==="activity"?r.eventActivity(i):r.eventOther(i),a=U2(V,H,C),l=i2(V,H,C);return["---","",V.deviceMode?r.headerDevice(V.deviceName||d().assist.unknownDevice,o):r.header(t,o),"","---",r.lovelaceHeading,"",r.lovelaceCopy,"```yaml",a,"```",r.serviceHeading,"",r.serviceCopy,"```yaml",l,"```"].join(`
`)}function u0(V){if(!V)return null;let H=String(V).replace(/[^a-fA-F0-9]/g,"").toUpperCase();return!H||H.length<6?null:H}function W2(V){if(V==null)return null;if(typeof V=="object")return V;try{return JSON.parse(String(V))}catch{return null}}var o2=class{constructor(H){this.active=!1;this.capture=null;this.statusMessage=null;this.mqttMatch=!1;this.mqttPayload=null;this.mqttDeviceName=null;this.mqttCommandName=null;this.mqttExisting=!1;this.discoveryCreated=!1;this.discoveryWorking=!1;this.discoveryDeviceId=null;this.modalOpen=!1;this.modalDeviceId=null;this.modalActivityChecked=!1;this.hubMac=null;this.hubMacDetecting=!1;this.mqttUnsub=null;this.mqttTopic=null;this.mqttLookupId=0;this.mqttDeviceNames=new Map;this.mqttDeviceCommands=new Map;this.mqttRequestQueue=Promise.resolve();this.mqttPublishQueue=Promise.resolve();this.discoveryIds=new Set;this.lastActivityLabel=null;this.lastActivityId=null;this.lastPoweredOff=null;this.host=H}sessionState(){let H=window;return H[e2]||(H[e2]={hideMqttModal:!1,discoveryDeviceIds:new Set,activityTriggersCreated:!1}),H[e2]}activityTriggersCreatedInSession(){return this.sessionState().activityTriggersCreated}ensureCaptureStarted(){return!this.host.assistEnabled()||this.host.isEditMode()?!1:(this.active||this.setActive(!0),this.active)}primeActivityBaseline(){let H=this.host.currentActivityLabel(),C=this.host.currentActivityId();this.lastActivityLabel=H,this.lastActivityId=Number.isFinite(Number(C))?Number(C):null,this.lastPoweredOff=T(H)}resetActivityBaseline(){this.lastActivityLabel=null,this.lastActivityId=null,this.lastPoweredOff=null}setActive(H){let C=!!H;this.active!==C&&(this.active=C,C?(this.statusMessage=null,this.primeActivityBaseline(),this.syncMqtt()):(this.capture=null,this.mqttMatch=!1,this.mqttPayload=null,this.mqttDeviceName=null,this.mqttCommandName=null,this.mqttExisting=!1,this.discoveryCreated=!1,this.discoveryWorking=!1,this.discoveryDeviceId=null,this.statusMessage=null,this.unsubscribeMqtt(),this.closeMqttModal()),this.host.onChange())}resetCaptureSideState(){this.mqttMatch=!1,this.mqttPayload=null,this.mqttDeviceName=null,this.mqttCommandName=null,this.mqttExisting=!1,this.discoveryCreated=!1,this.discoveryWorking=!1,this.discoveryDeviceId=null,this.statusMessage=null}recordActivityChange(H){if(!this.ensureCaptureStarted())return;let C=Number(H.activityId),e=Number.isFinite(C)?C:null,L=!!H.poweredOff,r=L?d().card.poweredOff:String(H.activityName||d().assist.activityFallbackLabel);this.capture={label:r,activityId:e,activityName:L?d().card.poweredOff:String(H.activityName||r),kind:L?"power":"activity"},this.resetCaptureSideState(),this.host.onChange(),this.notifyCapture()}recordClick(H){if(!this.ensureCaptureStarted())return;let C=Number(H.commandId);if(!Number.isFinite(C))return;if(H.deviceMode){let t=Number(H.deviceId);if(!Number.isFinite(t))return;this.capture={label:String(H.label??d().assist.buttonFallback),commandId:C,deviceId:t,commandType:H.commandType??"assigned",icon:H.icon?String(H.icon):null,deviceMode:!0,deviceName:String(H.deviceName||d().assist.deviceFallback(t)),kind:"button"},this.resetCaptureSideState(),this.host.onChange(),this.notifyCapture();return}let e=H.commandType??"assigned",L=e==="favorite"||e==="macro"?H.deviceId!=null?Number(H.deviceId):this.host.currentActivityId():this.host.resolveCommandDeviceId(C,H.deviceId??null);if(L==null||!Number.isFinite(Number(L)))return;let r=this.host.activityNameForId(L)||this.host.currentActivityLabel()||d().assist.unknown;this.capture={label:String(H.label??d().assist.buttonFallback),commandId:C,deviceId:Number(L),commandType:e,icon:H.icon?String(H.icon):null,activityName:r,kind:"button"},this.resetCaptureSideState(),this.host.onChange(),this.notifyCapture()}observeActivityState(H){let C=H.currentLabel;!H.unavailable&&this.host.assistEnabled()&&this.lastActivityLabel!=null&&C!==this.lastActivityLabel&&(T(C)?this.recordActivityChange({activityId:this.lastActivityId,activityName:d().card.poweredOff,poweredOff:!0}):this.recordActivityChange({activityId:H.activityId,activityName:C,poweredOff:!1})),H.unavailable?this.resetActivityBaseline():(this.lastActivityLabel=C,this.lastActivityId=H.activityId,this.lastPoweredOff=T(C))}remoteYaml(){return i2(this.capture,this.host.entityId(),this.host.isHubIntegration())}buttonYaml(){return U2(this.capture,this.host.entityId(),this.host.isHubIntegration())}notifyCapture(){if(!this.host.assistEnabled()||!this.host.getHass())return;let H=this.capture,C=v0(H,this.host.entityId(),this.host.isHubIntegration(),this.host.activityNameForId(H?.deviceId)||this.host.currentActivityLabel()||"");C&&this.host.callService("persistent_notification","create",{title:d().assist.notification.title,message:C})}statusText(){return this.active?this.statusMessage?this.statusMessage:this.capture?d().assist.captured(String(this.capture.label??"")):d().assist.waiting:this.host.isEditMode()?d().assist.exitEditMode:d().assist.waiting}modalViewState(){let H=this.active,C=this.mqttSupported(),e=this.mqttPayload,L=Number(e?.device_id),r=Number(e?.key_id),t=this.mqttDeviceName||(Number.isFinite(L)?d().assist.deviceFallback(L):d().assist.unknownDevice),i=this.mqttCommandName||(Number.isFinite(r)?d().assist.commandFallback(r):null),o=[d().assist.detectedDevice(t)];i&&o.push(d().assist.lastCommand(i)),this.mqttExisting&&o.push(d().assist.existingTriggers);let a=this.discoveryWorking?d().assist.working:this.discoveryCreated?d().assist.triggersReady:d().assist.createTriggers;return{open:this.modalOpen,showActivityRow:!this.sessionState().activityTriggersCreated,text:o.join(" "),showStart:!H,showCreate:C&&H,createLabel:a,createDisabled:this.discoveryWorking||this.discoveryCreated||!this.mqttAvailable()}}mqttSupported(){return this.host.isX2()}mqttAvailable(){return this.mqttSupported()&&this.active&&!!this.hubMac&&!this.discoveryCreated&&!this.discoveryWorking&&this.mqttReady()}mqttReady(){return this.host.isHubIntegration()?this.host.hubQueueIdle():!0}safeUnsubscribe(H){if(typeof H=="function")try{let C=H();C&&typeof C.catch=="function"&&C.catch(()=>{})}catch{}}ensureHubMac(){let H=this.host.getHass();if(!H||!this.host.entityId()||this.hubMac||this.hubMacDetecting)return;let C=u0(this.host.hubMacAttribute());if(C){this.hubMac=C;return}if(!this.host.isHubIntegration()||!H.connection?.subscribeMessage)return;this.hubMacDetecting=!0;let e="activity/+/list",L=null,r=null,t=!1,i=()=>{if(t)return;t=!0,L&&(clearTimeout(L),L=null);let o=r;r=null,this.safeUnsubscribe(o),this.hubMacDetecting=!1,this.host.onChange(),this.syncMqtt()};H.connection.subscribeMessage(o=>{let a=String(o?.topic||"").match(/^activity\/([^/]+)\/list$/),l=a?.[1]?u0(a[1]):null;l&&(this.hubMac=l,i())},{type:"mqtt/subscribe",topic:e}).then(o=>{r=o,this.host.requestHubBasicData(),L=setTimeout(()=>i(),4e3)}).catch(()=>{i()})}syncMqtt(){if(!this.host.assistEnabled()){this.unsubscribeMqtt();return}if(!this.active){this.unsubscribeMqtt();return}if(!this.mqttSupported()){this.unsubscribeMqtt();return}if(!this.mqttReady())return;this.ensureHubMac();let H=this.hubMac;if(!H)return;let C=`${H}/up`;if(this.mqttTopic===C&&this.mqttUnsub)return;this.unsubscribeMqtt();let e=this.host.getHass();e?.connection?.subscribeMessage&&(this.mqttTopic=C,e.connection.subscribeMessage(L=>this.handleMqtt(L),{type:"mqtt/subscribe",topic:C}).then(L=>{this.mqttUnsub=L}).catch(()=>{this.mqttUnsub=null}))}unsubscribeMqtt(){if(this.mqttUnsub){let H=this.mqttUnsub;this.mqttUnsub=null,this.safeUnsubscribe(H)}this.mqttTopic=null}mqttTriggerExists(H,C){return!1}shouldSuppressMqttModal(H){let C=this.sessionState();return C.hideMqttModal?!0:C.discoveryDeviceIds.has(H)}openMqttModal(H){Number.isFinite(H)&&(this.shouldSuppressMqttModal(H)||(this.modalDeviceId=H,this.modalOpen=!0,this.modalActivityChecked=!1,this.host.onChange()))}closeMqttModal(){this.modalOpen&&(this.modalOpen=!1,this.host.onChange())}setModalOptOut(H){H&&(this.sessionState().hideMqttModal=!0,this.closeMqttModal())}setModalActivityChecked(H){this.modalActivityChecked=!!H}handleMqtt(H){let C=W2(H?.payload);if(!C)return;let e=Number(C.device_id);Number.isFinite(e)&&this.discoveryDeviceId!==e&&(this.discoveryDeviceId=e,this.discoveryCreated=!1,this.discoveryWorking=!1),this.mqttMatch=!0,this.mqttPayload=C,this.mqttDeviceName=null,this.mqttCommandName=null,this.mqttExisting=this.mqttTriggerExists(C,this.mqttTopic),this.host.onChange(),this.primeMqttMetadata(C),this.openMqttModal(e)}primeMqttMetadata(H){let C=this.hubMac;if(!C||!H)return;let e=Number(H.device_id),L=Number(H.key_id);if(!Number.isFinite(e)||!Number.isFinite(L))return;let r=this.mqttLookupId+1;this.mqttLookupId=r,Promise.all([this.requestMqttDeviceName(C,e),this.requestMqttDeviceCommandName(C,e,L)]).then(([t,i])=>{this.mqttLookupId===r&&(t&&(this.mqttDeviceName=t),i&&(this.mqttCommandName=i),this.host.onChange())})}async requestMqttDeviceName(H,C){let e=this.host.getHass();if(!e?.connection?.subscribeMessage||!Number.isFinite(C))return null;let L=`${H}:${C}`;if(this.mqttDeviceNames.has(L))return this.mqttDeviceNames.get(L)??null;let r=`device/${H}/list`,t=`device/${H}/list_request`,i=JSON.stringify({data:"device_list"});return this.enqueueMqttRequest(()=>new Promise(o=>{let a=null,l=null,n=s=>{if(a&&clearTimeout(a),l){let A=l;l=null,this.safeUnsubscribe(A)}s&&this.mqttDeviceNames.set(L,s),o(s||null)};e.connection.subscribeMessage(s=>{let A=W2(s?.payload),c=(Array.isArray(A?.data)?A.data:[]).find(v=>Number(v?.device_id)===C);n(c?.device_name?String(c.device_name):null)},{type:"mqtt/subscribe",topic:r}).then(s=>{l=s,this.host.callService("mqtt","publish",{topic:t,payload:i}),a=setTimeout(()=>n(null),4e3)}).catch(()=>n(null))}))}async requestMqttDeviceCommandName(H,C,e){if(!Number.isFinite(e))return null;let L=await this.requestMqttDeviceCommands(H,C);return L&&L.get(Number(e))||null}async requestMqttDeviceCommands(H,C){let e=this.host.getHass();if(!e?.connection?.subscribeMessage||!Number.isFinite(C))return null;let L=`${H}:${C}`;if(this.mqttDeviceCommands.has(L))return this.mqttDeviceCommands.get(L)??null;let r=`device/${H}/keys_list`,t=`device/${H}/keys_request`,i=JSON.stringify({data:{device_id:C}});return this.enqueueMqttRequest(()=>new Promise(o=>{let a=null,l=null,n=s=>{if(a&&clearTimeout(a),l){let A=l;l=null,this.safeUnsubscribe(A)}s&&this.mqttDeviceCommands.set(L,s),o(s||null)};e.connection.subscribeMessage(s=>{let A=W2(s?.payload);if(Number(A?.device_id)!==C)return;let m=Array.isArray(A?.data)?A.data:[],c=new Map;m.forEach(v=>{let h=Number(v?.key_id);if(!Number.isFinite(h))return;let S=v?.key_name?String(v.key_name):null;S&&c.set(h,S)}),n(c)},{type:"mqtt/subscribe",topic:r}).then(s=>{l=s,this.host.callService("mqtt","publish",{topic:t,payload:i}),a=setTimeout(()=>n(null),4e3)}).catch(()=>n(null))}))}enqueueMqttRequest(H){let C=async()=>H();return this.mqttRequestQueue=this.mqttRequestQueue.then(C,C),this.mqttRequestQueue}enqueueMqttPublish(H){let C=async()=>H();return this.mqttPublishQueue=this.mqttPublishQueue.then(C,C),this.mqttPublishQueue}setStatus(H){this.statusMessage=String(H??""),this.host.onChange()}async createTriggers(){if(!this.mqttAvailable())return;let H=this.hubMac,C=this.mqttPayload;if(!H||!C)return;let e=Number(C.device_id);if(Number.isFinite(e)){this.discoveryWorking=!0,this.host.onChange();try{let[L,r]=await Promise.all([this.requestMqttDeviceName(H,e),this.requestMqttDeviceCommands(H,e)]);if(!r||r.size===0){this.setStatus(d().assist.noMqttCommands);return}let t=L||d().assist.deviceFallback(e),i=`${H}/up`,o=String(H).toLowerCase(),a=String(H).toUpperCase(),l=this.sessionState(),s=!l.activityTriggersCreated&&this.modalActivityChecked,A=0,m=0;for(let[c,v]of r.entries()){let h={device_id:e,key_id:Number(c)};if(!Number.isFinite(h.key_id)||this.mqttTriggerExists(h,i))continue;let S=v||d().assist.commandFallback(h.key_id),g=`sofabaton_${o}_d${e}_k${h.key_id}`;if(this.discoveryIds.has(g))continue;let w={automation_type:"trigger",type:"button_short_press",subtype:`X2 ${t} ${S}`,payload:JSON.stringify(h),topic:`${a}/up`,device:{identifiers:[`sofabaton_x2_remote_${e}`],name:`X2 \u2192 ${t}`,model:"X2",manufacturer:"Sofabaton"}};await this.enqueueMqttPublish(async()=>{await this.host.callService("mqtt","publish",{topic:`homeassistant/device_automation/${g}/config`,payload:JSON.stringify(w),retain:!0}),this.discoveryIds.add(g),await f1(250)}),A+=1}if(s){let c=`activity/${o}/activity_control_up`,v={identifiers:["sofabaton_x2_remote_activities"],name:"X2 \u2192 Activities",model:"X2",manufacturer:"Sofabaton"},S=this.host.activities().map(g=>({id:g.id,name:g.name,state:"on"}));S.push({id:255,name:"Powered Off",state:"off"});for(let g of S){let P=Number(g.id);if(!Number.isFinite(P))continue;let w={activity_id:P,state:g.state},y=`sofabaton_${o}_activity_${P}`;if(this.discoveryIds.has(y))continue;let B={automation_type:"trigger",type:"button_short_press",subtype:`X2 Activity ${g.name}`,payload:JSON.stringify(w),topic:c,device:v};await this.enqueueMqttPublish(async()=>{await this.host.callService("mqtt","publish",{topic:`homeassistant/device_automation/${y}/config`,payload:JSON.stringify(B),retain:!0}),this.discoveryIds.add(y),await f1(250)}),m+=1}l.activityTriggersCreated=!0}if(this.discoveryCreated=!0,this.discoveryDeviceId=e,l.discoveryDeviceIds.add(e),A>0||m>0){let c=s&&m>0&&A>0?d().assist.plusActivityTriggers(m):"",v=A>0?d().assist.createdTriggers(A,t):d().assist.createdActivityTriggers(m);this.setStatus(`${v}${c}`)}else this.setStatus(d().assist.allTriggersExist(t))}finally{this.discoveryWorking=!1,this.host.onChange()}}}disconnected(){this.unsubscribeMqtt()}};var h0=Symbol.for(""),MV=V=>{if(V?.r===h0)return V?._$litStatic$},Z0=V=>({_$litStatic$:V,r:h0});var x0=new Map,G2=V=>(H,...C)=>{let e=C.length,L,r,t=[],i=[],o,a=0,l=!1;for(;a<e;){for(o=H[a];a<e&&(r=C[a],(L=MV(r))!==void 0);)o+=L+H[++a],l=!0;a!==e&&i.push(r),t.push(o),a++}if(a===e&&t.push(H[e]),l){let n=t.join("$$lit$$");(H=x0.get(n))===void 0&&(t.raw=t,x0.set(n,H=t)),C=i}return V(H,...C)},S0=G2(x),OL=G2(k5),kL=G2(_5);function C1(V){return f(H=>{if(!H)return;let C=H;C.__sbTrigger=V,!C.__sbActionWired&&(C.__sbActionWired=!0,H2(C,e=>C.__sbTrigger?.(e),{fireHaptic:()=>{C.dispatchEvent(new CustomEvent("haptic",{detail:"light",bubbles:!0,composed:!0}))}}))})}function g0(V){return f(H=>{if(!H)return;let C=H;C.__sbListenersWired||(C.__sbListenersWired=!0,V(C))})}function f0(V){let H=Z0(_2()),e=(V.unavailable?[]:V.options).map(t=>typeof t=="string"?{value:t,label:t}:t),L=g0(t=>{t.addEventListener("selected",V.onSelect),t.addEventListener("change",V.onSelect),p3().forEach(i=>{t.addEventListener(i,()=>V.onMenuOpened(),!0)}),c3().forEach(i=>{t.addEventListener(i,()=>V.onMenuClosed(),!0)}),t.addEventListener("change",()=>V.onMenuClosed(),!0),t.addEventListener("blur",()=>V.onMenuClosed(),!0)}),r=V.modeToggle?x`
        <button
          type="button"
          class="sb-mode-toggle"
          aria-label=${V.modeToggle.ariaLabel}
          title=${V.modeToggle.ariaLabel}
          .disabled=${V.unavailable}
          @click=${t=>{t.preventDefault(),t.stopPropagation(),V.modeToggle.onToggle()}}
        >
          <sbx-ha-icon icon=${V.modeToggle.icon}></sbx-ha-icon>
        </button>
      `:p;return x`
    <div
      class="activityRow${V.modeToggle?" activityRow--with-toggle":""}${V.menuOpen?" activityRow--menu-open":""}"
      style=${V.visible?"":"display: none !important;"}
      ${V.rowRef?f(V.rowRef):p}
    >
      ${r}
      <sbx-ha-select
        class="sb-activity-select"
        .label=${V.selectLabel}
        .hass=${V.hass}
        .value=${V.unavailable?"":v3(V.resolvedValue,e)}
        .disabled=${V.unavailable||V.disabled}
        ${L}
      >
        ${z(e,t=>t.value,t=>S0`
            <${H} .value=${t.value}>${t.label}</${H}>
          `)}
      </sbx-ha-select>
      <div
        class="loadIndicator${V.loading?" is-loading":""}"
        ${V.loadIndicatorRef?f(V.loadIndicatorRef):p}
      ></div>
    </div>
  `}var b0=`
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
`,M2=null;function aV(V){if(typeof CSSStyleSheet<"u"&&"replaceSync"in CSSStyleSheet.prototype&&"adoptedStyleSheets"in V){M2||(M2=new CSSStyleSheet,M2.replaceSync(b0)),V.adoptedStyleSheets=[...V.adoptedStyleSheets,M2];return}let H=document.createElement("style");H.textContent=b0,V.appendChild(H)}var nV=globalThis.HTMLElement??class{},z2=class extends nV{constructor(){super(...arguments);this._control=null;this._iconEl=null;this._trailingIconEl=null;this._labelEl=null;this._label="";this._icon=null;this._trailingIcon=null;this._accessibilityLabel="";this._color=null;this._sizeVar=null;this._disabled=!1;this._wired=!1;this._holdRepeat=!1;this._longPress=!1;this._hold=new J1(C=>this.repeatTrigger(C));this._longHold=new C2(()=>this.longPressTrigger());this.onTrigger=null}set label(C){this._label=String(C??""),this.syncContent()}set icon(C){this._icon=C?String(C):null,this.syncContent()}set trailingIcon(C){this._trailingIcon=C?String(C):null,this.syncContent()}set accessibilityLabel(C){this._accessibilityLabel=String(C??""),this.syncContent()}set color(C){this._color=C?String(C):null,this._color?(this.style.setProperty("--sb-color",this._color),this.style.setProperty("--sb-control-background",this._color)):(this.style.removeProperty("--sb-color"),this.style.removeProperty("--sb-control-background"))}set sizeVar(C){this._sizeVar=C?String(C):null,this._sizeVar?this.style.setProperty("--sb-control-font-size",`var(${this._sizeVar})`):this.style.removeProperty("--sb-control-font-size")}set disabled(C){this._disabled=!!C,this._control&&(this._control.disabled=this._disabled),this._disabled&&(this._hold.stop(),this._longHold.stop())}set holdRepeat(C){this._holdRepeat=!!C,this._holdRepeat||this._hold.stop()}get holdRepeat(){return this._holdRepeat}set longPress(C){this._longPress=!!C,this._longPress||this._longHold.stop()}get longPress(){return this._longPress}get disabled(){return this._disabled}fireHaptic(){this.dispatchEvent(new CustomEvent("haptic",{detail:"light",bubbles:!0,composed:!0}))}trigger(C){this._disabled||this.classList.contains("disabled")||this._hold.consumeFired()||this._longHold.consumeFired()||this.onTrigger?.(C)}repeatTrigger(C){if(this._disabled||this.classList.contains("disabled")){this._hold.stop();return}C===1&&this.fireHaptic(),this.onTrigger?.(new CustomEvent(D2,{detail:C}))}longPressTrigger(){if(this._disabled||this.classList.contains("disabled")){this._longHold.stop();return}this.fireHaptic(),this.onTrigger?.(new CustomEvent(E2))}onHoldPointerDown(C){this._disabled||this.classList.contains("disabled")||C.isPrimary===!1||typeof C.button=="number"&&C.button!==0||(this._holdRepeat?this._hold.start():this._longPress&&this._longHold.start())}onHoldPointerEnd(C){this._hold.stop(),this._longHold.stop(),C.type!=="pointerup"&&(this._hold.consumeFired(),this._longHold.consumeFired())}syncContent(){!this._control||!this._iconEl||!this._trailingIconEl||!this._labelEl||(this._icon?(this._iconEl.setAttribute("icon",this._icon),this._iconEl.hidden=!1):(this._iconEl.removeAttribute("icon"),this._iconEl.hidden=!0),this._trailingIcon?(this._trailingIconEl.setAttribute("icon",this._trailingIcon),this._trailingIconEl.hidden=!1):(this._trailingIconEl.removeAttribute("icon"),this._trailingIconEl.hidden=!0),this._control.classList.toggle("sb-key-control--with-trailing-icon",!!this._trailingIcon),this._labelEl.textContent=this._label,this._labelEl.hidden=!this._label,this._control.setAttribute("aria-label",this._accessibilityLabel||this._label||"Remote button"))}connectedCallback(){if(this._wired)return;this._wired=!0;let C=this.attachShadow({mode:"open"});aV(C);let e=document.createElement("button");e.type="button",e.className="sb-key-control",e.disabled=this._disabled;let L=document.createElement("sbx-ha-icon");L.className="sb-key-control__icon";let r=document.createElement("span");r.className="sb-key-control__label";let t=document.createElement("sbx-ha-icon");t.className="sb-key-control__trailing-icon",e.append(L,r,t),C.appendChild(e),this._control=e,this._iconEl=L,this._trailingIconEl=t,this._labelEl=r,this.syncContent(),this.addEventListener("pointerdown",i=>this.onHoldPointerDown(i),{capture:!0});for(let i of["pointerup","pointercancel","pointerleave","lostpointercapture"])this.addEventListener(i,o=>this.onHoldPointerEnd(o),{capture:!0});e.addEventListener("contextmenu",i=>{(this._holdRepeat||this._longPress)&&i.preventDefault()}),H2([this,e],i=>this.trigger(i),{fireHaptic:()=>this.fireHaptic()}),e.addEventListener("click",i=>{i.detail!==0||this._disabled||(this.fireHaptic(),this.trigger(i))})}disconnectedCallback(){this._hold.stop(),this._longHold.stop()}};customElements.get("sbx-key-button")||customElements.define("sbx-key-button",z2);var dV=new Set([M.C,M.B,M.A,M.EXIT,M.DVR,M.PLAY,M.GUIDE,...Q1]),AV=[{key:"up",id:M.UP,cmd:M.UP,label:"",icon:"mdi:chevron-up",extraClass:"area-up"},{key:"left",id:M.LEFT,cmd:M.LEFT,label:"",icon:"mdi:chevron-left",extraClass:"area-left"},{key:"ok",id:M.OK,cmd:M.OK,label:"",icon:"mdi:circle",extraClass:"area-ok okKey",size:"big"},{key:"right",id:M.RIGHT,cmd:M.RIGHT,label:"",icon:"mdi:chevron-right",extraClass:"area-right"},{key:"down",id:M.DOWN,cmd:M.DOWN,label:"",icon:"mdi:chevron-down",extraClass:"area-down"}],y0=[{key:"num1",id:M.NUM_1,cmd:M.NUM_1,label:"1",icon:"",size:"small"},{key:"num2",id:M.NUM_2,cmd:M.NUM_2,label:"2",icon:"",size:"small"},{key:"num3",id:M.NUM_3,cmd:M.NUM_3,label:"3",icon:"",size:"small"},{key:"num4",id:M.NUM_4,cmd:M.NUM_4,label:"4",icon:"",size:"small"},{key:"num5",id:M.NUM_5,cmd:M.NUM_5,label:"5",icon:"",size:"small"},{key:"num6",id:M.NUM_6,cmd:M.NUM_6,label:"6",icon:"",size:"small"},{key:"num7",id:M.NUM_7,cmd:M.NUM_7,label:"7",icon:"",size:"small"},{key:"num8",id:M.NUM_8,cmd:M.NUM_8,label:"8",icon:"",size:"small"},{key:"num9",id:M.NUM_9,cmd:M.NUM_9,label:"9",icon:"",size:"small"},{key:"numdash",id:M.NUM_DASH,cmd:M.NUM_DASH,label:"-",icon:"",size:"small"},{key:"num0",id:M.NUM_0,cmd:M.NUM_0,label:"0",icon:"",size:"small"},{key:"numenter",id:M.NUM_ENTER,cmd:M.NUM_ENTER,label:"E",icon:"",size:"small"}],sV=[{key:"back",id:M.BACK,cmd:M.BACK,label:"",icon:"mdi:arrow-u-left-top"},{key:"home",id:M.HOME,cmd:M.HOME,label:"",icon:"mdi:home"},{key:"menu",id:M.MENU,cmd:M.MENU,label:"",icon:"mdi:menu"}],lV=[{key:"volup",id:M.VOL_UP,cmd:M.VOL_UP,label:"",icon:"mdi:volume-plus",extraClass:"mid-btn mid-btn-volup"},{key:"voldn",id:M.VOL_DOWN,cmd:M.VOL_DOWN,label:"",icon:"mdi:volume-minus",extraClass:"mid-btn mid-btn-voldn"},{key:"guide",id:M.GUIDE,cmd:M.GUIDE,label:"",icon:"mdi:television-guide",extraClass:"mid-btn mid-btn-guide"},{key:"mute",id:M.MUTE,cmd:M.MUTE,label:"",icon:"mdi:volume-mute",extraClass:"mid-btn mid-btn-mute"},{key:"chup",id:M.CH_UP,cmd:M.CH_UP,label:"",icon:"mdi:chevron-up",extraClass:"mid-btn mid-btn-chup"},{key:"chdn",id:M.CH_DOWN,cmd:M.CH_DOWN,label:"",icon:"mdi:chevron-down",extraClass:"mid-btn mid-btn-chdn"}],mV=[{key:"rew",id:M.REW,cmd:M.REW,label:"",icon:"mdi:rewind",extraClass:"area-rew"},{key:"play",id:M.PLAY,cmd:M.PLAY,label:"",icon:"mdi:play",extraClass:"area-play"},{key:"fwd",id:M.FWD,cmd:M.FWD,label:"",icon:"mdi:fast-forward",extraClass:"area-fwd"},{key:"dvr",id:M.DVR,cmd:M.DVR,label:"DVR",icon:"",extraClass:"area-dvr"},{key:"pause",id:M.PAUSE,cmd:M.PAUSE,label:"",icon:"mdi:pause",extraClass:"area-pause"},{key:"exit",id:M.EXIT,cmd:M.EXIT,label:"Exit",icon:"",extraClass:"area-exit"}],pV=[{key:"red",id:M.RED,cmd:M.RED,label:"",icon:"",color:"#d32f2f"},{key:"green",id:M.GREEN,cmd:M.GREEN,label:"",icon:"",color:"#388e3c"},{key:"yellow",id:M.YELLOW,cmd:M.YELLOW,label:"",icon:"",color:"#fbc02d"},{key:"blue",id:M.BLUE,cmd:M.BLUE,label:"",icon:"",color:"#1976d2"}],cV=[{key:"a",id:M.A,cmd:M.A,label:"A",icon:"",size:"small"},{key:"b",id:M.B,cmd:M.B,label:"B",icon:"",size:"small"},{key:"c",id:M.C,cmd:M.C,label:"C",icon:"",size:"small"}];function q(V,H){let C=dV.has(H.id),e=V.buttonVisibility&&H.key in V.buttonVisibility?V.buttonVisibility[H.key]:!0;if(!(C?V.isX2&&e:e))return p;let r=!V.disableAll&&(V.editMode||V.isEnabled(H.id)),t=H.color?"key key--color":`key key--${H.size??"normal"} ${H.extraClass??""}`.trim(),i=Y1(H.key,H.color?H.key:H.label);return x`
    <sbx-key-button
      class="${t}${r?"":" disabled"}"
      .label=${H.label}
      .icon=${H.icon||null}
      .accessibilityLabel=${i}
      .color=${H.color??null}
      .sizeVar=${H.color?null:"--sb-key-font-size"}
      .disabled=${!r}
      .holdRepeat=${V.holdRepeatForKey(H.key)}
      .longPress=${V.longPressForKey(H)}
      .onTrigger=${o=>V.onKeyPress(H,o)}
    ></sbx-key-button>
  `}function w0(V,H,C=null){let e=!!C?.available;if(!H)return e?x`
      <div class="dpad dpad--numpad-only" ${C?.hostRef?f(C.hostRef):p}>
        <div class="dpad-face dpad-face--numpad">
          ${y0.map(t=>q(V,t))}
        </div>
      </div>
    `:p;let L=e&&!!C?.open,r=["dpad",e?"dpad--numpad-ready":"",L?"dpad--numpad-open":""].filter(Boolean).join(" ");return x`
    <div class=${r} ${C?.hostRef?f(C.hostRef):p}>
      <div class="dpad-face dpad-face--keys" ?inert=${L}>
        ${AV.map(t=>q(V,t))}
      </div>
      ${e?x`
            <div class="dpad-face dpad-face--numpad" ?inert=${!L}>
              ${y0.map(t=>q(V,t))}
            </div>
            <button
              type="button"
              class="dpad-numpad-toggle"
              aria-label=${d().editor.numpad}
              ?inert=${L}
              @click=${()=>C.onOpen()}
            >
              <sbx-ha-icon icon="mdi:dialpad" aria-hidden="true"></sbx-ha-icon>
            </button>
          `:p}
    </div>
  `}function O0(V,H){return H?x`<div class="row3">${sV.map(C=>q(V,C))}</div>`:p}function k0(V,H){if(!H)return p;let C=b3({showVolume:V.showVolume,showChannel:V.showChannel,isX2:V.isX2}),e=["mid",...Object.entries(C.classMap).filter(([,L])=>L).map(([L])=>L)].join(" ");return x`<div class=${e}>${lV.map(L=>q(V,L))}</div>`}function _0(V,H){if(!H)return p;let C=y3({isX2:V.isX2,showMedia:V.showMedia,showDvr:V.showDvr}),e=["media",...Object.entries(C.classMap).filter(([,L])=>L).map(([L])=>L)].join(" ");return x`<div class=${e}>${mV.map(L=>q(V,L))}</div>`}function T0(V,H){return H?x`
    <div class="row3 shortcuts">
      ${V.slots.map(C=>{if(C.icon==null)return x`
            <div
              class="key key--normal ${V.editMode?"shortcut-ghost":"shortcut-spacer"}"
              aria-hidden="true"
            ></div>
          `;let e=!V.disableAll&&(V.editMode||!C.missing);return x`
          <sbx-key-button
            class="key key--normal shortcut-key${e?"":" disabled"}"
            .label=${""}
            .icon=${C.icon}
            .accessibilityLabel=${C.label}
            .sizeVar=${"--sb-key-font-size"}
            .disabled=${!e}
            .holdRepeat=${!1}
            .onTrigger=${()=>V.onPress(C)}
          ></sbx-key-button>
        `})}
    </div>
  `:p}function R0(V,H){return H?x`
    <div class="colors">
      <div class="colorsGrid">${pV.map(C=>q(V,C))}</div>
    </div>
  `:p}function P0(V,H){return H?x`
    <div class="abc">
      <div class="abcGrid">${cV.map(C=>q(V,C))}</div>
    </div>
  `:p}function vV(V){return V==="macros"?"macro":V==="favorites"?"favorite":"assigned"}function B0(V,H,C){return{label:V?.name||d().assist.unknown,commandId:Number(V?.command_id??V?.id),deviceId:Number(V?.device_id??V?.device??C),icon:V?.icon?String(V.icon):null,commandType:vV(H)}}function D0(V,H){let C=Number(V?.command_id),e=V?.device_id!=null?Number(V.device_id):null,L=e??Number(H);return{label:String(V?.name??"Favorite"),icon:V?.icon?String(V.icon):null,action:V?.action??null,commandId:C,deviceId:L}}function E0(V){return V?x`<div class="drawer-btn__device" title=${V}>${V}</div>`:p}function F0(V,H,C){let e=B0(H,C,V.currentActivityId),L=C==="favorites"&&V.favoriteDeviceName&&Number.isFinite(e.deviceId)?V.favoriteDeviceName(e.deviceId):"";return x`
    <sbx-ha-card
      class="drawer-btn${L?" drawer-btn--banded":""}"
      role="button"
      tabindex="0"
      ${C1(()=>{!Number.isFinite(e.commandId)||!Number.isFinite(e.deviceId)||V.onDrawerItem({model:e,itemType:C,rawItem:H})})}
    >
      ${E0(L)}
      <div class="drawer-btn__inner drawer-btn__inner--stack">
        ${e.icon?x`<sbx-ha-icon class="drawer-btn__icon" icon=${e.icon}></sbx-ha-icon>`:p}
        <div class="name">${e.label}</div>
      </div>
    </sbx-ha-card>
  `}function uV(V,H){let C=D0(H,V.currentActivityId),e=V.favoriteDeviceName&&!C.action&&H.device_id!=null?V.favoriteDeviceName(C.deviceId):"";return x`
    <sbx-ha-card
      class="drawer-btn drawer-btn--custom${e?" drawer-btn--banded":""}"
      role="button"
      tabindex="0"
      style="grid-column: 1 / -1;"
      ${C1(()=>V.onCustomFavorite({model:C,rawFavorite:H}))}
    >
      ${E0(e)}
      <div class="drawer-btn__inner drawer-btn__inner--row">
        ${C.icon?x`<sbx-ha-icon class="drawer-btn__icon" icon=${C.icon}></sbx-ha-icon>`:p}
        <div class="name">${C.label}</div>
      </div>
    </sbx-ha-card>
  `}function xV(V,H){let C=V.command_id??V.id??"",e=V.device_id??V.device??"",L=V.name??"",r=V.action?JSON.stringify(V.action):"";return`${H}:${String(e)}:${String(C)}:${String(L)}:${r}`}function N0(V){let H=new Map;return V.map(C=>{let e=xV(C.item,C.kind),L=H.get(e)??0;return H.set(e,L+1),{...C,key:`${e}#${L}`}})}function Q2(V,H,C){let e=N0(H.map(L=>({kind:C,item:L})));return x`${z(e,L=>L.key,L=>F0(V,L.item,C))}`}function j2(V){let H=N0([...V.customFavorites.map(C=>({kind:"custom",item:C})),...V.favorites.map(C=>({kind:"favorite",item:C}))]);return x`${z(H,C=>C.key,C=>C.kind==="custom"?uV(V,C.item):F0(V,C.item,"favorites"))}`}function q2(V,H,C,e,L,r){if(!C)return p;let t=["macroFavoritesButton",...e?["active-tab"]:[],...L?["disabled"]:[]].join(" ");return x`
    <sbx-key-button
      class=${t}
      .label=${H}
      .icon=${null}
      .trailingIcon=${hV()}
      .accessibilityLabel=${H}
      .sizeVar=${"--sb-tab-font-size"}
      .disabled=${L}
      .onTrigger=${r}
    ></sbx-key-button>
  `}function hV(){return X1()==="rtl"?"mdi:chevron-left":"mdi:chevron-right"}function I0(V,H){let C="var(--sb-group-radius)";return[`border-top-left-radius: ${V&&H?"0":C}`,`border-top-right-radius: ${V&&H?"0":C}`,`border-bottom-left-radius: ${V&&!H?"0":C}`,`border-bottom-right-radius: ${V&&!H?"0":C}`,"transition: border-radius 0.2s ease"].join("; ")}function $0(V){let H=V.activeDrawer==="macros",C=V.activeDrawer==="favorites",e=H||C,L=r=>r?f(r):p;return x`
    <div
      class="mf-container${V.drawerUp?" drawer-up":""}"
      style=${V.visible?"":"display: none !important;"}
      ${L(V.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${I0(e,V.drawerUp)}
        ${L(V.rowRef)}
      >
        <div class="macroFavoritesGrid${V.single?" single":""}">
          ${q2(V,d().card.macrosTab,V.showMacrosButton,H,V.macrosDisabled,V.onToggleMacros)}
          ${q2(V,d().card.favoritesTab,V.showFavoritesButton,C,V.favoritesDisabled,V.onToggleFavorites)}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--macros${H?" open":""}"
        ${L(V.macrosOverlayRef)}
      >
        <div class="mf-grid">
          ${V.renderMacrosContent?Q2(V,V.macros,"macros"):p}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--favorites${C?" open":""}"
        ${L(V.favoritesOverlayRef)}
      >
        <div class="mf-grid">
          ${V.renderFavoritesContent?j2(V):p}
        </div>
      </div>
    </div>
  `}function a2(V){let H=V.kind==="commands"?"inline-drawer-row__grid mf-grid mf-grid--commands":"inline-drawer-row__grid mf-grid",C=V.filter?V.power?x`
          <div class="inline-filter-row">
            ${K2(V.filter)}
            ${X2(V.power)}
          </div>
        `:K2(V.filter):p;return x`
    <div
      class="inline-drawer-row inline-drawer-row--${V.kind}"
      style=${V.visible?"":"display: none !important;"}
    >
      ${C}
      <div
        class="inline-drawer-row__scroller"
        style="--inline-row-visible-rows: ${V.visibleRows};"
      >
        <div class=${H}>
          ${V.itemCount?V.items:x`
                <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                  ${V.emptyText}
                </div>
              `}
        </div>
      </div>
    </div>
  `}function X2(V){return x`
    <sbx-key-button
      class="sb-power-key${V.busy?" sb-power-key--busy":""}"
      .label=${null}
      .icon=${"mdi:power"}
      .accessibilityLabel=${V.label}
      .disabled=${V.disabled||V.busy}
      .onTrigger=${()=>V.onToggle()}
    ></sbx-key-button>
  `}function U0(V){return x`
    <div class="commands-row commands-row--power commands-row--power-only">
      <div class="commands-row__spacer"></div>
      ${X2(V)}
    </div>
  `}function K2(V){return x`
    <input
      class="sb-commands-filter"
      type="text"
      .value=${V.value}
      placeholder=${V.placeholder}
      aria-label=${V.placeholder}
      @input=${H=>{let C=H.target;V.onInput(String(C?.value??""))}}
      @keydown=${H=>H.stopPropagation()}
    />
  `}function ZV(V,H){return x`
    <sbx-ha-card
      class="drawer-btn drawer-btn--command"
      role="button"
      tabindex="0"
      ${C1(()=>{Number.isFinite(H.command_id)&&V.onCommand(H)})}
    >
      <div class="drawer-btn__inner drawer-btn__inner--row">
        <div class="name">${H.name}</div>
      </div>
    </sbx-ha-card>
  `}function Y2(V){return x`${z(V.commands,H=>`${H.command_id}:${H.name}`,H=>ZV(V,H))}`}function W0(V){let H=C=>C?f(C):p;return x`
    <div
      class="commands-row${V.power?" commands-row--power":""}"
      style=${V.visible?"":"display: none !important;"}
    >
    <div
      class="mf-container${V.drawerUp?" drawer-up":""}"
      ${H(V.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${I0(V.open,V.drawerUp)}
        ${H(V.rowRef)}
      >
        <div class="macroFavoritesGrid single">
          ${q2(null,V.tabLabel,!0,V.open,V.disabled,V.onToggle)}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--commands${V.open?" open":""}"
        ${H(V.overlayRef)}
      >
        ${V.renderContent?x`
              ${K2(V.filter)}
              <div class="mf-grid mf-grid--commands">
                ${V.commands.length?Y2(V):x`
                      <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                        ${V.emptyText}
                      </div>
                    `}
              </div>
            `:p}
      </div>
    </div>
    ${V.power?X2(V.power):p}
    </div>
  `}function G0(V){return x`
    <div
      class="automationAssist"
      style=${V.visible?"":"display: none !important;"}
    >
      <div class="automationAssist__header">
        <div class="automationAssist__label">${d().assist.label}</div>
      </div>
      <div class="automationAssist__status">${V.controller.statusText()}</div>
    </div>
  `}function z0(V){let H=V.controller,C=H.modalViewState(),e=L=>{L.target===L.currentTarget&&H.closeMqttModal()};return x`
    <div
      class="sb-modal${C.open?" open":""}"
      role="dialog"
      aria-modal="true"
      @click=${e}
    >
      <div class="sb-modal__dialog">
        <div class="sb-modal__header">
          <div class="sb-modal__title">${d().assist.deviceDetectedTitle}</div>
          <button
            type="button"
            class="sb-modal__close"
            aria-label=${d().assist.close}
            @click=${()=>H.closeMqttModal()}
          >
            ✕
          </button>
        </div>
        <div class="sb-modal__body">
          <div class="sb-modal__text">${C.text}</div>
        </div>
        <div class="sb-modal__actions">
          <label
            class="sb-modal__optout"
            style=${C.showActivityRow?"":"display: none !important;"}
          >
            <input
              type="checkbox"
              .checked=${H.modalActivityChecked}
              @change=${L=>H.setModalActivityChecked(!!L.target.checked)}
            />
            <span>${d().assist.alsoActivityTriggers}</span>
          </label>
          <a
            class="sb-modal__link"
            href=${`https://github.com/m3tac0de/sofabaton-virtual-remote/blob/${$2}/docs/automation_triggers.md`}
            target="_blank"
            rel="noopener noreferrer"
          >
            ${d().assist.seeDocs}
          </a>
          <button
            type="button"
            class="automationAssist__startBtn automationAssist__mqttBtn${C.createDisabled?" disabled":""}"
            .disabled=${C.createDisabled}
            style=${C.showCreate?"":"display: none !important;"}
            ${C1(()=>{H.createTriggers()})}
          >
            ${C.createLabel}
          </button>
          <label class="sb-modal__optout">
            <input
              type="checkbox"
              @change=${L=>{L.target.checked&&H.setModalOptOut(!0)}}
            />
            <span>${d().assist.dontShowAgain}</span>
          </label>
          <button
            type="button"
            class="automationAssist__startBtn"
            style=${C.showStart?"":"display: none !important;"}
            ${C1(()=>H.setActive(!0))}
          >
            ${d().assist.startCapturing}
          </button>
        </div>
      </div>
    </div>
  `}function SV(V){let H=V.trim().slice(1),C=H.length===3?H.split("").map(e=>e+e).join(""):H;return/^[0-9a-fA-F]{6}$/.test(C)?[0,2,4].map(e=>parseInt(C.slice(e,e+2),16)).join(","):null}var b1=class extends W{constructor(){super();this._haElementsReady=!1;this._editMode=!1;this._drawerUp=!1;this._numpadOpen=!1;this._numpadPageKey=null;this._drawerResetTimer=null;this._drawerContentResetTimer=null;this._closingDrawer=null;this._drawerMeasureSignature=null;this._drawerMeasurePending=!1;this._appliedThemeVars=[];this._appliedThemeKey=null;this._lastGroupRadius=null;this._appliedSizingKey=null;this._lastLayeringKey=null;this._lastLayeringTargets=[null,null];this._layoutSignatureCache=null;this._layoutOverlayEl=null;this._lastLayoutSignature=null;this._keymapLoading=!1;this._lastSelectedActivityValue=null;this._lastSelectedActivityAt=0;this._onOutsidePointerDown=null;this._onResize=null;this._onPreviewActivity=null;this._cardRef=k();this._wrapRef=k();this._layoutContainerRef=k();this._activityRowRef=k();this._loadIndicatorRef=k();this._mfContainerRef=k();this._dpadRef=k();this._macrosOverlayRef=k();this._favoritesOverlayRef=k();this._commandsOverlayRef=k();this._macroFavoritesRowRef=k();this._store=new t2(()=>this.requestUpdate(),{fireEvent:(C,e)=>this._fireEvent(C,e),onHubQueueDrained:()=>{this._assist.syncMqtt(),this.requestUpdate()},onCommandPulseChange:()=>this._syncLoadIndicator()}),this._assist=new o2({getHass:()=>this._store.hass,assistEnabled:()=>this._store.automationAssistEnabled(),entityId:()=>String(this._store.config?.entity??""),isEditMode:()=>this._editMode,isX2:()=>this._store.isX2(),isHubIntegration:()=>this._store.isHubIntegration(),hubMacAttribute:()=>this._store.remoteState()?.attributes?.hub_mac,hubQueueIdle:()=>this._store.hubQueueIdle(),requestHubBasicData:()=>this._store.hubRequestBasicData(),activities:()=>this._store.activities(),activityNameForId:C=>this._store.activityNameForId(C),currentActivityId:()=>this._store.currentActivityId(),currentActivityLabel:()=>this._store.currentActivityLabel(),resolveCommandDeviceId:(C,e)=>this._store.resolveCommandDeviceId(C,e),callService:(C,e,L)=>this._store.callService(C,e,L),onChange:()=>this.requestUpdate()}),u3().then(()=>{this._haElementsReady=!0,this.requestUpdate()})}setConfig(C){this._store.setConfig(C),this._assist.resetActivityBaseline(),this._drawerUp=!1,this._drawerResetTimer&&clearTimeout(this._drawerResetTimer),this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._closingDrawer=null,this._drawerMeasureSignature=null,this._drawerMeasurePending=!1}set hass(C){let e=C?.locale?.language??C?.language;this.setLanguage(e),this._store.setHass(C)}setLanguage(C){let e=h3(C);this.lang=Z3(),this.dir=X1(),e&&this.requestUpdate()}setBackend(C){this._store.setBackend(C)}get hass(){return this._store.hass}set editMode(C){this._editMode=!!C,this._store.setEditMode(this._editMode),this._editMode&&this._assist.active&&this._assist.setActive(!1)}get editMode(){return this._editMode}getCardSize(){return 12}static getConfigElement(){return document.createElement(s0)}static getStubConfig(){return{entity:""}}connectedCallback(){super.connectedCallback(),this._store.connected(),this._installOutsideCloseHandler(),this._onResize||(this._onResize=()=>{this._store.activeDrawer&&(this._updateDrawerDirection(),this._syncLayering())}),window.addEventListener("resize",this._onResize,{passive:!0}),this._onPreviewActivity||(this._onPreviewActivity=C=>{let e=C?.detail||{},L=this._store.config?.entity;e.entity&&L&&e.entity!==L||(this._store.setPreviewActivity(e.previewActivity??""),this._editMode&&this.requestUpdate())}),window.addEventListener("sofabaton-preview-activity",this._onPreviewActivity)}disconnectedCallback(){super.disconnectedCallback(),this._removeOutsideCloseHandler(),this._onResize&&(window.removeEventListener("resize",this._onResize),this._onResize=null),this._onPreviewActivity&&window.removeEventListener("sofabaton-preview-activity",this._onPreviewActivity),this._drawerResetTimer&&clearTimeout(this._drawerResetTimer),this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._store.disconnected(),this._assist.disconnected()}_fireEvent(C,e={}){this.dispatchEvent(new CustomEvent(C,{detail:e,bubbles:!0,composed:!0}))}_installOutsideCloseHandler(){this._onOutsidePointerDown||(this._onOutsidePointerDown=C=>{let e=typeof C.composedPath=="function"?C.composedPath():[];if(this._store.activeDrawer){let L=this._macrosOverlayRef.value&&e.includes(this._macrosOverlayRef.value)||this._favoritesOverlayRef.value&&e.includes(this._favoritesOverlayRef.value)||this._commandsOverlayRef.value&&e.includes(this._commandsOverlayRef.value),r=this._macroFavoritesRowRef.value&&e.includes(this._macroFavoritesRowRef.value);L||r||this._setActiveDrawer(null)}if(this._numpadOpen){let L=this._dpadRef.value;L&&e.includes(L)||(this._numpadOpen=!1,this.requestUpdate())}this._store.activityMenuOpen&&(this._activityRowRef.value&&e.includes(this._activityRowRef.value)||(this._store.activityMenuOpen=!1,this._syncLayering()))},document.addEventListener("pointerdown",this._onOutsidePointerDown,!0))}_removeOutsideCloseHandler(){this._onOutsidePointerDown&&(document.removeEventListener("pointerdown",this._onOutsidePointerDown,!0),this._onOutsidePointerDown=null)}_toggleDrawer(C){this._setActiveDrawer(this._store.activeDrawer===C?null:C)}_retainClosingDrawer(C){this._closingDrawer=C,this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._drawerContentResetTimer=setTimeout(()=>{this._closingDrawer===C&&(this._closingDrawer=null,this._drawerContentResetTimer=null,this.requestUpdate())},B2)}_setActiveDrawer(C){let e=this._store.activeDrawer;e!==C&&(e&&this._retainClosingDrawer(e),C&&this._closingDrawer===C&&(this._closingDrawer=null,this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._drawerContentResetTimer=null),this._store.activeDrawer=C,this._drawerMeasurePending=!!C,C||this._scheduleDrawerDirectionReset(),this._syncLayering(),this.requestUpdate())}_updateDrawerDirection(){if(!this._store.activeDrawer)return;let C=this._macroFavoritesRowRef.value,e=this._store.activeDrawer==="commands",L=e?this._commandsOverlayRef.value:this._store.activeDrawer==="favorites"?this._favoritesOverlayRef.value:this._macrosOverlayRef.value;if(!C||!L)return;let r=C.getBoundingClientRect(),t=this._cardRef.value&&typeof this._cardRef.value.getBoundingClientRect=="function"?this._cardRef.value.getBoundingClientRect():null,i=R3({desired:T3(L.scrollHeight||0,e?window.innerHeight:void 0),rowTop:r.top,rowBottom:r.bottom,cardTop:t?.top??null,cardBottom:t?.bottom??null,viewportHeight:window.innerHeight})==="up";e&&(L.style.maxHeight=`${P3({up:i,rowTop:r.top,rowBottom:r.bottom,cardTop:t?.top??null,cardBottom:t?.bottom??null,viewportHeight:window.innerHeight})}px`),i!==this._drawerUp&&(this._drawerUp=i,this.requestUpdate())}_scheduleDrawerDirectionReset(){this._drawerResetTimer&&clearTimeout(this._drawerResetTimer),this._drawerResetTimer=setTimeout(()=>{this._store.activeDrawer||this._drawerUp&&(this._drawerUp=!1,this.requestUpdate())},B2)}_syncLayering(){let C=this._activityRowRef.value,e=this._mfContainerRef.value;if(!C||!e)return;e=e.closest(".commands-row")??e;let L=`${this._store.activityMenuOpen?1:0}:${this._store.activeDrawer||""}`,r=[C,e];if(this._lastLayeringKey===L&&this._lastLayeringTargets[0]===r[0]&&this._lastLayeringTargets[1]===r[1])return;let t=B3(!!this._store.activityMenuOpen,!!this._store.activeDrawer);C.style.zIndex=t.activity,e.style.zIndex=t.drawer,this._lastLayeringKey=L,this._lastLayeringTargets=r}_handleActivitySelect(C){if(this._editMode)return;let e=C.target,L=C?.detail?.value??e?.value;if(L==null)return;let r=Date.now();String(L)===this._lastSelectedActivityValue&&r-this._lastSelectedActivityAt<250||(this._lastSelectedActivityValue=String(L),this._lastSelectedActivityAt=r,this._fireEvent("haptic","light"),Promise.resolve(this._store.setActivity(L)).catch(t=>{console.error("[sofabaton-virtual-remote] Failed to set activity:",t)}))}_handleSelect(C){this._store.mode()==="device"&&this._store.deviceModeAvailable()?this._handleDeviceSelect(C):this._handleActivitySelect(C)}_handleDeviceSelect(C){if(this._editMode)return;let e=C.target,L=C?.detail?.value??e?.value;if(L==null)return;let r=Date.now();if(String(L)===this._lastSelectedActivityValue&&r-this._lastSelectedActivityAt<250)return;this._lastSelectedActivityValue=String(L),this._lastSelectedActivityAt=r,this._fireEvent("haptic","light");let t=String(L)===""?null:Number(L);this._store.setDevice(Number.isFinite(t)?t:null)}_openNumpad(){this._numpadOpen||(this._numpadOpen=!0,this._fireEvent("haptic","light"),this.requestUpdate())}_handleModeToggle(){this._editMode||(this._fireEvent("haptic","light"),this._setActiveDrawer(null),this._numpadOpen=!1,this._store.toggleMode())}_syncLoadIndicator(){this._loadIndicatorRef.value?.classList.toggle("is-loading",this._store.isLoadingActive()||this._keymapLoading)}_applyLocalTheme(C){let e=this._cardRef.value,L=this._store.hass;if(!e)return!1;let r=f3(this._store.config?.background_override),t=C?L?.themes?.themes?.[C]:null,i=L?.themes?.darkMode?"dark":"light",o=`${C||""}||${r}||${i}||${JSON.stringify(t??null)}`;if(this._appliedThemeKey===o)return!1;for(let A of this._appliedThemeVars)e.style.removeProperty(A);this._appliedThemeVars=[],this._appliedThemeKey=o,this._lastGroupRadius=null;let a=null;if(C){let A=t;if(A&&typeof A=="object"){a=A;let m=A;if(m.modes&&typeof m.modes=="object"){let c=L?.themes?.darkMode?"dark":"light";a={...A,...m.modes?.[c]||{}},delete a.modes}for(let[c,v]of Object.entries(a)){if(v==null||typeof v!="string"&&typeof v!="number")continue;let h=c.startsWith("--")?c:`--${c}`;e.style.setProperty(h,String(v)),this._appliedThemeVars.push(h)}for(let[c,v]of Object.entries(a)){if(typeof v!="string"||!v.startsWith("#"))continue;let h=c.startsWith("--")?c.slice(2):c;if(a[`rgb-${h}`]!==void 0||a[`--rgb-${h}`]!==void 0)continue;let S=SV(v);if(!S)continue;let g=`--rgb-${h}`;e.style.setProperty(g,S),this._appliedThemeVars.push(g)}}}let l=a?.["ha-card-background"]??a?.["card-background-color"]??a?.["ha-card-background-color"]??a?.["primary-background-color"]??null,n=r||l,s=this._store.config?.background_override;if(r&&Array.isArray(s)&&s.length===3){let[A,m,c]=s.map(S=>Number(S)/255),v=S=>S<=.03928?S/12.92:((S+.055)/1.055)**2.4,h=.2126*v(A)+.7152*v(m)+.0722*v(c);e.style.setProperty("--sb-overlay-base",h<.4?"#ffffff":"#000000"),this._appliedThemeVars.push("--sb-overlay-base")}return n?(e.style.setProperty("--ha-card-background",String(n)),e.style.setProperty("--card-background-color",String(n)),e.style.setProperty("--ha-card-background-color",String(n)),e.style.setProperty("background",String(n)),e.style.setProperty("background-color",String(n)),this._appliedThemeVars.push("--ha-card-background","--card-background-color","--ha-card-background-color","background","background-color")):(e.style.removeProperty("background"),e.style.removeProperty("background-color")),!0}_updateGroupRadius(){let C=this._cardRef.value;if(!C)return;let e=getComputedStyle(C),L=["--ha-card-border-radius","--ha-control-border-radius","--mdc-shape-medium","--mdc-shape-small","--mdc-shape-large"],r="";for(let t of L){let i=(e.getPropertyValue(t)||"").trim();if(i){r=i;break}}r||(r="18px"),this._lastGroupRadius!==r&&(this._lastGroupRadius=r,C.style.setProperty("--sb-group-radius",r),this._appliedThemeVars.includes("--sb-group-radius")||this._appliedThemeVars.push("--sb-group-radius"))}_applyHostSizing(){let C=this._store.config?.max_width,e=this._store.config?.shrink,L=`${typeof C}:${String(C??"")}||${typeof e}:${String(e??"")}`;if(this._appliedSizingKey===L)return;this._appliedSizingKey=L,C==null||C===""||C===0?this.style.removeProperty("--remote-max-width"):typeof C=="number"&&Number.isFinite(C)&&C>0?this.style.setProperty("--remote-max-width",`${C}px`):typeof C=="string"&&C.trim()&&this.style.setProperty("--remote-max-width",C.trim());let r=typeof e=="number"?e:typeof e=="string"?Number(e):0;if(!Number.isFinite(r)||r<=0)this.style.removeProperty("--remote-zoom");else{let t=Math.max(.1,Math.min(1,1-r/100));this.style.setProperty("--remote-zoom",String(t))}}_prefersReducedMotion(){return typeof window<"u"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}_clearLayoutOverlay(){this._layoutOverlayEl&&(this._layoutOverlayEl.remove(),this._layoutOverlayEl=null)}_maybeAnimateLayoutChange(C){let e=this._layoutContainerRef.value,L=this._wrapRef.value;if(!e||!L)return;if(this._layoutSignatureCache==null){this._layoutSignatureCache=C;return}if(this._layoutSignatureCache===C)return;if(this._layoutSignatureCache=C,this._store.backend?.kind==="server"||this._prefersReducedMotion()){this._clearLayoutOverlay();return}let r=L.getBoundingClientRect(),t=e.getBoundingClientRect();if(!r.width||!t.width)return;this._clearLayoutOverlay();let i=document.createElement("div");i.className="layout-overlay",i.setAttribute("aria-hidden","true"),i.style.top=`${t.top-r.top}px`,i.style.left=`${t.left-r.left}px`,i.style.width=`${t.width}px`,i.style.height=`${t.height}px`,i.appendChild(e.cloneNode(!0)),L.appendChild(i),this._layoutOverlayEl=i;let o=()=>{this._layoutOverlayEl===i&&(i.remove(),this._layoutOverlayEl=null)};i.addEventListener("transitionend",a=>{a.target===i&&o()},{once:!0}),requestAnimationFrame(()=>{i.classList.add("layout-overlay--fade")}),setTimeout(o,320)}render(){if(!this._haElementsReady||!this._store.config||!this._store.backend)return p;let C=this._store,e=C.deriveRuntimeState(),L=e.layoutConfig;this._lastLayoutSignature=e.layoutSignature;let r=e.mode==="device";this._keymapLoading=!!e.keymapLoading,this._assist.observeActivityState({currentLabel:r?this._store.currentActivityLabel():e.currentLabel,activityId:e.activityId!=null?Number(e.activityId):null,unavailable:e.isUnavailable}),!C.automationAssistEnabled()&&this._assist.active&&this._assist.setActive(!1),this._assist.syncMqtt();let t=i3(L),i=!r&&q1(L),o=!r&&K1(L),a=t&&i,l=t&&o,n=!t&&i,s=!t&&o,A=r&&e.showCommandsButton,m=A&&!t,c=A&&t,v=r?e.isUnavailable||!this._editMode&&e.deviceId==null:e.isUnavailable||C.activityLoadingActive()||e.loadPending||!this._editMode&&e.isPoweredOff;(r&&(C.activeDrawer==="macros"||C.activeDrawer==="favorites")||!r&&C.activeDrawer==="commands")&&(this._retainClosingDrawer(C.activeDrawer),this._scheduleDrawerDirectionReset(),C.activeDrawer=null);let h=null;r?C.activeDrawer==="commands"&&!m&&(this._retainClosingDrawer("commands"),this._scheduleDrawerDirectionReset(),C.activeDrawer=null):(h=k3({activeDrawer:C.activeDrawer,showMacrosButton:n,showFavoritesButton:s,editMode:this._editMode,macros:e.macros,favorites:e.favorites,customFavorites:e.customFavorites,disableAllButtons:v}),h.closedByVisibility&&(C.activeDrawer&&this._retainClosingDrawer(C.activeDrawer),this._scheduleDrawerDirectionReset()),C.activeDrawer=h.nextActiveDrawer);let S=C.activeDrawer==="macros"?e.macros.length:C.activeDrawer==="favorites"?e.favorites.length+e.customFavorites.length:C.activeDrawer==="commands"?e.commands.length:0,g=`${C.activeDrawer||""}:${S}:${e.commandFilter}:${e.layoutSignature}`;this._drawerMeasureSignature!==g&&(this._drawerMeasureSignature=g,this._drawerMeasurePending=!!C.activeDrawer);let P=e.isX2&&!C.isHubIntegration()&&A3(L)&&(this._editMode||C.anyKeyBound(Q1)),w=`${e.mode}:${r?e.deviceId??"":e.activityId??""}`;(!P||w!==this._numpadPageKey)&&(this._numpadOpen=!1),this._numpadPageKey=w;let y={isX2:e.isX2,buttonVisibility:w3({isX2:e.isX2,showVolume:e.showVolume,showChannel:e.showChannel,showMedia:e.showMedia,showDvr:e.showDvr}),disableAll:v,editMode:this._editMode,isEnabled:u=>C.isEnabled(u),onKeyPress:(u,R)=>this._onKeyPress(u,R),holdRepeatForKey:u=>P2(C.config,u),longPressForKey:u=>this._longPressForSpec(u),showVolume:e.showVolume,showChannel:e.showChannel,showMedia:e.showMedia,showDvr:e.showDvr},$={value:e.commandFilter,placeholder:d().card.filterCommands,onInput:u=>C.setCommandFilter(u)},B={visible:!!h?.showMF,showMacrosButton:n,showFavoritesButton:s,single:h?.visibleCount===1,macrosDisabled:!!h?.macrosDisabled,favoritesDisabled:!!h?.favoritesDisabled,activeDrawer:C.activeDrawer==="commands"?null:C.activeDrawer,drawerUp:this._drawerUp,macros:e.macros,favorites:e.favorites,customFavorites:e.customFavorites,currentActivityId:C.currentActivityId(),favoriteDeviceName:t3(L)?u=>C.deviceNameForId(u)??"":null,renderMacrosContent:C.activeDrawer==="macros"||this._closingDrawer==="macros",renderFavoritesContent:C.activeDrawer==="favorites"||this._closingDrawer==="favorites",containerRef:this._mfContainerRef,rowRef:this._macroFavoritesRowRef,macrosOverlayRef:this._macrosOverlayRef,favoritesOverlayRef:this._favoritesOverlayRef,onToggleMacros:()=>this._toggleDrawer("macros"),onToggleFavorites:()=>this._toggleDrawer("favorites"),onDrawerItem:({model:u,itemType:R,rawItem:O1})=>{this._assist.recordClick({label:u.label,commandId:u.commandId,deviceId:u.deviceId,commandType:u.commandType,icon:u.icon}),C.triggerCommandPulse(),C.sendDrawerItem(R,u.commandId,u.deviceId,O1)},onCustomFavorite:({model:u,rawFavorite:R})=>{if(this._assist.active&&this._assist.setStatus(d().assist.notCaptured),u.action){C.runLovelaceAction(u.action,R);return}!Number.isFinite(u.commandId)||!Number.isFinite(u.deviceId)||(C.triggerCommandPulse(),C.sendCustomFavoriteCommand(u.commandId,u.deviceId))}},M1=r&&V3(L)&&(this._editMode||C.devicePowerConfigured()),a1={busy:C.powerBusy,disabled:v,label:d().card.powerButton,onToggle:()=>{C.toggleDevicePower()}},s2=r?r3(C.config,e.deviceId):{},w1=O2.map(u=>{let R=s2[u];if(!R)return{slot:u,icon:null,label:"",commandId:null,missing:!1};let O1=e.keymapEntry?.status==="ready"?e.keymapEntry.commands:null,l5=O1?.find(pH=>pH.command_id===R.command_id);return{slot:u,icon:R.icon,label:l5?.name??d().assist.commandFallback(R.command_id),commandId:R.command_id,missing:O1!=null&&!l5}}),l2=w1.some(u=>u.icon!=null),m2=r&&L3(L)&&(l2||this._editMode),p2={visible:m,open:C.activeDrawer==="commands",disabled:v,drawerUp:this._drawerUp,commands:e.commands,renderContent:C.activeDrawer==="commands"||this._closingDrawer==="commands",emptyText:d().card.noCommands,tabLabel:d().card.commandsTab,filter:$,onToggle:()=>this._toggleDrawer("commands"),onCommand:u=>this._onCommandItem(u),containerRef:this._mfContainerRef,rowRef:this._macroFavoritesRowRef,overlayRef:this._commandsOverlayRef},n1=o3(L),O=e.showVolume||e.showChannel,H1=e.isX2?e.showMedia||e.showDvr:e.showMedia,sH=S1(L.group_order),a5=j5(C.config),lH=X5(C.config),mH=["wrap",...a5==="flat"?[]:[`wrap--keys-${a5}`],...lH?["wrap--panels"]:[]].join(" "),n5={activity:()=>L.show_activity?f0({hass:C.hass,visible:!0,unavailable:e.isUnavailable,options:r?e.deviceSelectState?.options??[]:e.selectState?.options??[],selectLabel:r?d().card.deviceSelectLabel:d().card.activitySelectLabel,resolvedValue:r?e.deviceSelectState?.resolvedValue??"":e.selectState?.resolvedValue??"",disabled:r?!!e.deviceSelectState?.disabled:!!e.selectState?.disabled,loading:C.isLoadingActive()||!!e.keymapLoading,modeToggle:e.deviceModeAvailable?{icon:r?"mdi:audio-video":"mdi:play-circle-outline",ariaLabel:r?d().card.switchToActivityMode:d().card.switchToDeviceMode,onToggle:()=>this._handleModeToggle()}:null,menuOpen:!!C.activityMenuOpen,onSelect:u=>this._handleSelect(u),onMenuOpened:()=>{C.activityMenuOpen=!0,this._syncLayering(),this.requestUpdate()},onMenuClosed:()=>{C.activityMenuOpen=!1,this._syncLayering(),this.requestUpdate()},rowRef:this._activityRowRef,loadIndicatorRef:this._loadIndicatorRef}):p,macro_favorites:()=>r?m?W0({...p2,power:M1?a1:null}):M1&&!c?U0(a1):p:h?.showMF?$0(B):p,macros_row:()=>r?c?a2({kind:"commands",visible:!0,visibleRows:n1,items:Y2({commands:e.commands,onCommand:u=>this._onCommandItem(u)}),itemCount:e.commands.length,emptyText:d().card.noCommands,filter:$,power:M1?a1:null}):p:a?a2({kind:"macros",visible:!0,visibleRows:n1,items:Q2(B,e.macros,"macros"),itemCount:e.macros.length,emptyText:d().card.noMacros}):p,favorites_row:()=>!r&&l?a2({kind:"favorites",visible:!0,visibleRows:n1,items:j2(B),itemCount:e.customFavorites.length+e.favorites.length,emptyText:d().card.noFavorites}):p,dpad:()=>w0(y,!!L.show_dpad,{available:P,open:this._numpadOpen,hostRef:this._dpadRef,onOpen:()=>this._openNumpad()}),nav:()=>O0(y,!!L.show_nav),mid:()=>k0(y,O),media:()=>_0(y,H1),colors:()=>R0(y,!!L.show_colors),abc:()=>P0(y,!!L.show_abc&&e.isX2),shortcuts:()=>T0({editMode:this._editMode,disableAll:v,slots:w1,onPress:u=>this._onShortcutPress(u)},m2)},d5=e.isUnavailable?d().card.remoteUnavailable:e.noActivitiesMessage,A5=r&&!e.isUnavailable&&e.keymapEntry?.status==="error"?"error":"warning",s5=C.automationAssistEnabled();return x`
      <sbx-ha-card ${f(this._cardRef)}>
        ${s5?z0({visible:!0,controller:this._assist}):p}
        <div class=${mH} ${f(this._wrapRef)}>
          ${s5?G0({visible:!0,controller:this._assist}):p}
          <div class="layout-container" ${f(this._layoutContainerRef)}>
            ${d5?x`<div
                  class="sb-notice sb-notice--${A5}"
                  role="status"
                  aria-live="polite"
                >
                  <sbx-ha-icon
                    icon=${A5==="error"?"mdi:alert-circle-outline":"mdi:alert-outline"}
                  ></sbx-ha-icon>
                  <span class="sb-notice__text">${d5}</span>
                </div>`:p}
            ${z(sH.filter(u=>u in n5),u=>u,u=>n5[u]())}
          </div>
        </div>
      </sbx-ha-card>
    `}_longPressForSpec(C){if(this._editMode)return!1;let e=this._store;if(P2(e.config,C.key))return!1;let L=e.mode()==="device"?e.currentDeviceId():e.commandTarget(C.id)?.activity_id??e.currentActivityId();return e.longPressAvailableForButton(C.id,L)}_onKeyPress(C,e){let L=this._store.mode()==="device",r=L?this._store.currentDeviceId():this._store.commandTarget(C.id)?.activity_id??this._store.currentActivityId();if(E3(e)){this._assist.active&&this._assist.setStatus(d().assist.notCaptured),this._store.triggerCommandPulse(),this._store.sendLongPress(C.cmd,r);return}D3(e)<=1&&this._assist.recordClick({label:Y1(C.key,C.color?C.key:C.label),commandId:C.cmd,deviceId:r??null,commandType:"assigned",icon:C.color?null:C.icon||null,deviceMode:L,deviceName:L?this._store.deviceNameForId(r):null}),this._store.triggerCommandPulse(),this._store.sendCommand(C.cmd,r)}_onShortcutPress(C){if(C.commandId==null)return;let e=this._store.currentDeviceId();e!=null&&(this._assist.recordClick({label:C.label,commandId:C.commandId,deviceId:e,commandType:"favorite",icon:C.icon,deviceMode:!0,deviceName:this._store.deviceNameForId(e)}),this._store.triggerCommandPulse(),this._store.sendCommand(C.commandId,e))}_onCommandItem(C){let e=this._store.currentDeviceId();e!=null&&(this._assist.recordClick({label:C.name,commandId:C.command_id,deviceId:e,commandType:"favorite",icon:null,deviceMode:!0,deviceName:this._store.deviceNameForId(e)}),this._store.triggerCommandPulse(),this._store.sendCommand(C.command_id,e))}updated(C){(this._applyLocalTheme(String(this._store.config?.theme??""))||this._lastGroupRadius==null)&&this._updateGroupRadius(),this._applyHostSizing(),this._lastLayoutSignature!=null&&this._maybeAnimateLayoutChange(this._lastLayoutSignature),this._drawerMeasurePending&&(this._drawerMeasurePending=!1,this._updateDrawerDirection()),this._syncLayering(),this._syncLoadIndicator()}};b1.styles=[R1(g3),v2`
      sbx-key-button {
        display: block;
      }
    `];var n2={light:{"--primary-color":"#009ac7","--rgb-primary-color":"0, 154, 199","--primary-text-color":"#141414","--rgb-primary-text-color":"33, 33, 33","--secondary-text-color":"#5e5e5e","--disabled-text-color":"#bdbdbd","--primary-background-color":"#fafafa","--secondary-background-color":"#e5e5e5","--card-background-color":"#ffffff","--divider-color":"rgba(0, 0, 0, 0.12)","--error-color":"#db4437","--rgb-error-color":"219, 68, 55","--warning-color":"#ffa600","--success-color":"#43a047","--info-color":"#039be5","--state-icon-color":"#44739e","--input-fill-color":"rgb(245, 245, 245)","--ha-color-form-background":"#f3f3f3","--ha-color-fill-neutral-normal-resting":"#e6e6e6","--ha-color-fill-neutral-quiet-hover":"#e6e6e6","--ha-color-fill-primary-quiet-hover":"#dff3fc","--ha-color-border-neutral-loud":"#5e5e5e","--ha-color-border-neutral-quiet":"#e6e6e6","--ha-color-fill-primary-quiet-resting":"#eff9fe","--mdc-theme-primary":"#009ac7","--mdc-theme-surface":"#ffffff","--mdc-select-label-ink-color":"rgba(0, 0, 0, 0.6)","--wa-color-neutral-fill-normal":"#e6e6e6"},dark:{"--primary-color":"#009ac7","--rgb-primary-color":"0, 154, 199","--primary-text-color":"#e1e1e1","--rgb-primary-text-color":"33, 33, 33","--secondary-text-color":"#9b9b9b","--disabled-text-color":"#6f6f6f","--primary-background-color":"#111111","--secondary-background-color":"#282828","--card-background-color":"#1c1c1c","--divider-color":"rgba(225, 225, 225, 0.12)","--error-color":"#db4437","--rgb-error-color":"219, 68, 55","--warning-color":"#ffa600","--success-color":"#43a047","--info-color":"#039be5","--state-icon-color":"#44739e","--input-fill-color":"rgba(255, 255, 255, 0.05)","--ha-color-form-background":"#363636","--ha-color-fill-neutral-normal-resting":"#202020","--ha-color-fill-neutral-quiet-hover":"#202020","--ha-color-fill-primary-quiet-hover":"#002e3e","--ha-color-border-neutral-loud":"#b1b1b1","--ha-color-border-neutral-quiet":"#5e5e5e","--ha-color-fill-primary-quiet-resting":"#001721","--mdc-theme-primary":"#009ac7","--mdc-theme-surface":"#1c1c1c","--mdc-select-label-ink-color":"rgba(255, 255, 255, 0.6)","--wa-color-neutral-fill-normal":"#202020"}};var gV=Object.keys(n2.light),fV={"--rgb-primary-color":"--primary-color","--rgb-primary-text-color":"--primary-text-color","--rgb-error-color":"--error-color"};function J2(V){let H=String(V??"").trim().toLowerCase();if(!H)return null;let C=H.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);if(C)return d2(Number(C[1]),Number(C[2]),Number(C[3]),C[4]==null?1:Number(C[4]));if(C=H.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/),C)return d2(Number(C[1]),Number(C[2]),Number(C[3]),q0(C[4]));if(C=H.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/),C)return d2(Number(C[1])*255,Number(C[2])*255,Number(C[3])*255,q0(C[4]));if(C=H.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/),C){let e=C[1];e.length<=4&&(e=e.split("").map(r=>r+r).join(""));let L=r=>parseInt(e.slice(r,r+2),16);return d2(L(0),L(2),L(4),e.length===8?L(6)/255:1)}return null}function q0(V){return V==null?1:V.endsWith("%")?Number(V.slice(0,-1))/100:Number(V)}function d2(V,H,C,e){return![V,H,C,e].every(Number.isFinite)||e<=0?null:{r:V,g:H,b:C,a:e}}function K0({r:V,g:H,b:C}){let e=L=>{let r=Math.min(255,Math.max(0,L))/255;return r<=.03928?r/12.92:((r+.055)/1.055)**2.4};return .2126*e(V)+.7152*e(H)+.0722*e(C)}function bV({r:V,g:H,b:C}){return[V,H,C].map(e=>Math.round(e)).join(", ")}function Q0(V){let H=String(V??"").trim().toLowerCase();return H==="light"||H==="dark"?H:"inherit"}function yV(V){let H=V.hostValue("--primary-text-color"),C=H?V.resolveColor(H):null;if(C)return K0(C)>.5?"dark":"light";let e=V.hostValue("--card-background-color")||V.hostValue("--primary-background-color"),L=e?V.resolveColor(e):null;return L?K0(L)<.5?"dark":"light":V.prefersDark?"dark":"light"}function j0(V){let H=!V.hostColorScheme||V.hostColorScheme.trim()==="normal";if(V.theme!=="inherit")return{mode:V.theme,values:{...n2[V.theme]},colorScheme:V.theme};let C=yV(V),e=n2[C],L={};for(let r of gV){if(V.hostValue(r))continue;let t=fV[r];if(t){let i=V.hostValue(t);if(i){let o=V.resolveColor(i);L[r]=o?bV(o):e[r];continue}}L[r]=e[r]}return{mode:C,values:L,colorScheme:H?C:null}}var wV=new Set(["type","entity","theme","show_automation_assist","preview_activity"]),OV=new Set(["action","tap_action","hold_action","double_tap_action"]);function C5(V){return!!V&&typeof V=="object"&&!Array.isArray(V)}function kV(V){let H={};if(!C5(V))return H;for(let[C,e]of Object.entries(V))if(!(wV.has(C)||e===void 0)){if(C==="custom_favorites"&&Array.isArray(e)){let L=e.filter(r=>C5(r)&&r.command_id!=null&&r.device_id!=null).map(r=>{let t={};for(let[i,o]of Object.entries(r))OV.has(i)||(t[i]=o);return t});L.length&&(H.custom_favorites=L);continue}H[C]=e}return H}function H5(V){let H=String(V??"").trim(),C=H.replace(/[:\-\s.]/g,"");return/^[0-9a-fA-F]{12}$/.test(C)?C.toLowerCase():H}function X0(V,H="/ui/remote/"){let C=new URL(V),e=C.pathname.indexOf(H),L=e>=0?C.pathname.slice(0,e):"";return`${C.origin}${L}`.replace(/\/+$/,"")}function Y0(V,H,C={}){let L={...kV(H),entity:V};if(C.openDevice!=null){let r=C5(L.device_mode)?{...L.device_mode}:{};r.open_device=C.openDevice,L.device_mode=r}return L}var _V="0.2.2";function J0(V,H){let C=String(V??"").trim();if(!C)return null;let e;try{e=H?new URL(C,H):new URL(C)}catch{return null}if(e.protocol!=="http:"&&e.protocol!=="https:")return null;let L=e.pathname.replace(/\/+$/,"");return L.endsWith(D)&&(L=L.slice(0,-D.length)),`${e.origin}${L}`.replace(/\/+$/,"")}function TV(V){return V instanceof Error?V.message:String(V)}function C7(V,H){return V!=="https:"||!/^http:/i.test(H)?null:{code:"mixed_content",message:`This page is https but the server at ${H} is http, which browsers block. Serve the server over TLS (a reverse proxy or --tls-cert) and use its https address.`}}async function RV(V,H,C,e={}){try{await H(`${V}${D}/server`,{mode:"no-cors",cache:"no-store"})}catch{return{code:"server_unreachable",message:`The server at ${V} did not answer (${TV(C)}).`}}let L=e.pageOrigin?` ${e.pageOrigin}`:"";return{code:"cross_origin_refused",message:`The server at ${V} refused this page: add this page's origin${L} to the server's allowed_origins setting (control panel, Server settings).`}}async function H7(V,H,C,e={}){let L=H5(H),r=`${V}${D}`,t=[];try{let o=await C(`${r}/hubs`,{headers:{accept:"application/json"}});if(!o.ok)return{hub:null,hubs:t,error:{code:"server_unreachable",message:`The server at ${V} answered GET ${D}/hubs with ${o.status}.`}};let a=await o.json();t=Array.isArray(a)?a:[]}catch(o){return{hub:null,hubs:t,error:await RV(V,C,o,e)}}if(!L)return{hub:null,hubs:t,error:{code:"hub_missing",message:"No hub id given: set hub to the hub's MAC (any spelling)."}};let i=t.find(o=>H5(o.hub_id)===L)??null;return i?{hub:i,hubs:t,error:null}:{hub:null,hubs:t,error:{code:"hub_not_found",message:`No hub with id ${L} is registered on this server.`}}}async function V7(V,H,C){try{let e=await C(`${V}${D}/hubs/${encodeURIComponent(H)}/ui/remote-card`,{headers:{accept:"application/json"}});if(!e.ok)return null;let L=await e.json();return L&&typeof L=="object"?L.document??null:null}catch{return null}}function e7(V,H){return!V||V.state==="unavailable"?H?`The server cannot reach the hub (${H}).`:"The hub is not controllable right now (offline, disabled, or the Sofabaton app is connected).":null}var V5=class extends HTMLElement{constructor(){super();let H=this.attachShadow({mode:"open"});H.innerHTML=`
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
    `}};function L7(){customElements.get("sbx-ha-card")||customElements.define("sbx-ha-card",V5)}var r7="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z";var t7="M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z";var i7="M6.59,0.66C8.93,-1.15 11.47,1.06 12.04,4.5C12.47,4.5 12.89,4.62 13.27,4.84C13.79,4.24 14.25,3.42 14.07,2.5C13.65,0.35 16.06,-1.39 18.35,1.58C20.16,3.92 17.95,6.46 14.5,7.03C14.5,7.46 14.39,7.89 14.16,8.27C14.76,8.78 15.58,9.24 16.5,9.06C18.63,8.64 20.38,11.04 17.41,13.34C15.07,15.15 12.53,12.94 11.96,9.5C11.53,9.5 11.11,9.37 10.74,9.15C10.22,9.75 9.75,10.58 9.93,11.5C10.35,13.64 7.94,15.39 5.65,12.42C3.83,10.07 6.05,7.53 9.5,6.97C9.5,6.54 9.63,6.12 9.85,5.74C9.25,5.23 8.43,4.76 7.5,4.94C5.37,5.36 3.62,2.96 6.59,0.66M5,16H7A2,2 0 0,1 9,18V24H7V22H5V24H3V18A2,2 0 0,1 5,16M5,18V20H7V18H5M12.93,16H15L12.07,24H10L12.93,16M18,16H21V18H18V22H21V24H18A2,2 0 0,1 16,22V18A2,2 0 0,1 18,16Z";var o7="M6,6.9L3.87,4.78L5.28,3.37L7.4,5.5L6,6.9M13,1V4H11V1H13M20.13,4.78L18,6.9L16.6,5.5L18.72,3.37L20.13,4.78M4.5,10.5V12.5H1.5V10.5H4.5M19.5,10.5H22.5V12.5H19.5V10.5M6,20H18A2,2 0 0,1 20,22H4A2,2 0 0,1 6,20M12,5A6,6 0 0,1 18,11V19H6V11A6,6 0 0,1 12,5Z";var M7="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12,16.5C9.5,16.5 7.5,14.5 7.5,12C7.5,9.5 9.5,7.5 12,7.5C14.5,7.5 16.5,9.5 16.5,12C16.5,14.5 14.5,16.5 12,16.5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",a7="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z";var n7="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var d7="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z";var A7="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16";var s7="M11,7H13A2,2 0 0,1 15,9V17H13V13H11V17H9V9A2,2 0 0,1 11,7M11,9V11H13V9H11M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z";var l7="M15,10.5C15,11.3 14.3,12 13.5,12C14.3,12 15,12.7 15,13.5V15A2,2 0 0,1 13,17H9V7H13A2,2 0 0,1 15,9V10.5M13,15V13H11V15H13M13,11V9H11V11H13M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";var m7="M11,7H13A2,2 0 0,1 15,9V10H13V9H11V15H13V14H15V15A2,2 0 0,1 13,17H11A2,2 0 0,1 9,15V9A2,2 0 0,1 11,7M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";var p7="M10,2H14A1,1 0 0,1 15,3H21V21H19A1,1 0 0,1 18,22A1,1 0 0,1 17,21H7A1,1 0 0,1 6,22A1,1 0 0,1 5,21H3V3H9A1,1 0 0,1 10,2M5,5V9H19V5H5M7,6A1,1 0 0,1 8,7A1,1 0 0,1 7,8A1,1 0 0,1 6,7A1,1 0 0,1 7,6M12,6H14V7H12V6M15,6H16V8H15V6M17,6H18V8H17V6M12,11A4,4 0 0,0 8,15A4,4 0 0,0 12,19A4,4 0 0,0 16,15A4,4 0 0,0 12,11M10,6A1,1 0 0,1 11,7A1,1 0 0,1 10,8A1,1 0 0,1 9,7A1,1 0 0,1 10,6Z";var c7="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z";var v7="M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",u7="M9,4H15V12H19.84L12,19.84L4.16,12H9V4Z";var x7="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",h7="M20,9V15H12V19.84L4.16,12L12,4.16V9H20Z";var Z7="M20 13.5V20H18V13.5C18 11 16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z";var S7="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",g7="M4,15V9H12V4.16L19.84,12L12,19.84V15H4Z";var f7="M20 13.5C20 17.09 17.09 20 13.5 20H6V18H13.5C16 18 18 16 18 13.5S16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z";var b7="M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",y7="M15,20H9V12H4.16L12,4.16L19.84,12H15V20Z";var w7="M20,7H4A2,2 0 0,0 2,9V15A2,2 0 0,0 4,17H5V18C5,18.6 5.4,19 6,19H8C8.6,19 9,18.6 9,18V17H15V18C15,18.6 15.4,19 16,19H18C18.6,19 19,18.6 19,18V17H20A2,2 0 0,0 22,15V9A2,2 0 0,0 20,7M14,12H4V10H14V12M18,13A2,2 0 0,1 16,11A2,2 0 0,1 18,9A2,2 0 0,1 20,11A2,2 0 0,1 18,13M6,15H4V14H6V15M10,15H8V14H10V15M14,15H12V14H14V15Z",O7="M22.1 21.5L2.4 1.7L1.1 3L5.1 7H4C2.9 7 2 7.9 2 9V15C2 16.1 2.9 17 4 17H5V18C5 18.6 5.4 19 6 19H8C8.6 19 9 18.6 9 18V17H15V18C15 18.6 15.4 19 16 19H17.1L20.8 22.7L22.1 21.5M6 15H4V14H6V15M4 12V10H8.1L10.1 12H4M10 15H8V14H10V15M12 15V14H12.1L13.1 15H12M14 10V10.8L20.2 17C21.2 16.9 22 16.1 22 15V9C22 7.9 21.1 7 20 7H10.2L13.2 10H14M18 9C19.1 9 20 9.9 20 11S19.1 13 18 13 16 12.1 16 11 16.9 9 18 9Z";var k7="M22,3H7C6.31,3 5.77,3.35 5.41,3.88L0,12L5.41,20.11C5.77,20.64 6.31,21 7,21H22A2,2 0 0,0 24,19V5A2,2 0 0,0 22,3M19,15.59L17.59,17L14,13.41L10.41,17L9,15.59L12.59,12L9,8.41L10.41,7L14,10.59L17.59,7L19,8.41L15.41,12";var _7="M19,7H11V14H3V5H1V20H3V17H21V20H23V11A4,4 0 0,0 19,7M7,13A3,3 0 0,0 10,10A3,3 0 0,0 7,7A3,3 0 0,0 4,10A3,3 0 0,0 7,13Z";var T7="M7 14C8.66 14 10 12.66 10 11C10 9.34 8.66 8 7 8C5.34 8 4 9.34 4 11C4 12.66 5.34 14 7 14M7 10C7.55 10 8 10.45 8 11C8 11.55 7.55 12 7 12C6.45 12 6 11.55 6 11C6 10.45 6.45 10 7 10M19 7H11V15H3V5H1V20H3V17H21V20H23V11C23 8.79 21.21 7 19 7M21 15H13V9H19C20.1 9 21 9.9 21 11Z";var R7="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21";var P7="M20.84,22.73L18.11,20H3V19L5,17V11C5,9.86 5.29,8.73 5.83,7.72L1.11,3L2.39,1.73L22.11,21.46L20.84,22.73M19,15.8V11C19,7.9 16.97,5.17 14,4.29C14,4.19 14,4.1 14,4A2,2 0 0,0 12,2A2,2 0 0,0 10,4C10,4.1 10,4.19 10,4.29C9.39,4.47 8.8,4.74 8.26,5.09L19,15.8M12,23A2,2 0 0,0 14,21H10A2,2 0 0,0 12,23Z";var B7="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21M19.75,3.19L18.33,4.61C20.04,6.3 21,8.6 21,11H23C23,8.07 21.84,5.25 19.75,3.19M1,11H3C3,8.6 3.96,6.3 5.67,4.61L4.25,3.19C2.16,5.25 1,8.07 1,11Z";var D7="M3,2H21A1,1 0 0,1 22,3V5A1,1 0 0,1 21,6H20V13A1,1 0 0,1 19,14H13V16.17C14.17,16.58 15,17.69 15,19A3,3 0 0,1 12,22A3,3 0 0,1 9,19C9,17.69 9.83,16.58 11,16.17V14H5A1,1 0 0,1 4,13V6H3A1,1 0 0,1 2,5V3A1,1 0 0,1 3,2M12,18A1,1 0 0,0 11,19A1,1 0 0,0 12,20A1,1 0 0,0 13,19A1,1 0 0,0 12,18Z";var E7="M3 2H21C21.55 2 22 2.45 22 3V5C22 5.55 21.55 6 21 6H20V7C20 7.55 19.55 8 19 8H13V10.17C14.17 10.58 15 11.7 15 13C15 14.66 13.66 16 12 16C10.34 16 9 14.66 9 13C9 11.69 9.84 10.58 11 10.17V8H5C4.45 8 4 7.55 4 7V6H3C2.45 6 2 5.55 2 5V3C2 2.45 2.45 2 3 2M12 12C11.45 12 11 12.45 11 13C11 13.55 11.45 14 12 14C12.55 14 13 13.55 13 13C13 12.45 12.55 12 12 12Z";var F7="M14.88,16.29L13,18.17V14.41M13,5.83L14.88,7.71L13,9.58M17.71,7.71L12,2H11V9.58L6.41,5L5,6.41L10.59,12L5,17.58L6.41,19L11,14.41V22H12L17.71,16.29L13.41,12L17.71,7.71Z";var N7="M13,5.83L14.88,7.71L13.28,9.31L14.69,10.72L17.71,7.7L12,2H11V7.03L13,9.03M5.41,4L4,5.41L10.59,12L5,17.59L6.41,19L11,14.41V22H12L16.29,17.71L18.59,20L20,18.59M13,18.17V14.41L14.88,16.29";var I7="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z";var $7="M17,18L12,15.82L7,18V5H17M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z";var U7="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z",W7="M10,2C8.18,2 6.47,2.5 5,3.35C8,5.08 10,8.3 10,12C10,15.7 8,18.92 5,20.65C6.47,21.5 8.18,22 10,22A10,10 0 0,0 20,12A10,10 0 0,0 10,2Z",G7="M9,2C7.95,2 6.95,2.16 6,2.46C10.06,3.73 13,7.5 13,12C13,16.5 10.06,20.27 6,21.54C6.95,21.84 7.95,22 9,22A10,10 0 0,0 19,12A10,10 0 0,0 9,2Z",z7="M12,18C11.11,18 10.26,17.8 9.5,17.45C11.56,16.5 13,14.42 13,12C13,9.58 11.56,7.5 9.5,6.55C10.26,6.2 11.11,6 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z",q7="M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,15.31L23.31,12L20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31Z",K7="M12,18V6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,15.31L23.31,12L20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31Z",Q7="M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z";var j7="M19.36,2.72L20.78,4.14L15.06,9.85C16.13,11.39 16.28,13.24 15.38,14.44L9.06,8.12C10.26,7.22 12.11,7.37 13.65,8.44L19.36,2.72M5.93,17.57C3.92,15.56 2.69,13.16 2.35,10.92L7.23,8.83L14.67,16.27L12.58,21.15C10.34,20.81 7.94,19.58 5.93,17.57Z";var X7="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z";var Y7="M1.2,4.47L2.5,3.2L20,20.72L18.73,22L16.73,20H4A2,2 0 0,1 2,18V6C2,5.78 2.04,5.57 2.1,5.37L1.2,4.47M7,4L9,2H15L17,4H20A2,2 0 0,1 22,6V18C22,18.6 21.74,19.13 21.32,19.5L16.33,14.5C16.76,13.77 17,12.91 17,12A5,5 0 0,0 12,7C11.09,7 10.23,7.24 9.5,7.67L5.82,4H7M7,12A5,5 0 0,0 12,17C12.5,17 13.03,16.92 13.5,16.77L11.72,15C10.29,14.85 9.15,13.71 9,12.28L7.23,10.5C7.08,10.97 7,11.5 7,12M12,9A3,3 0 0,1 15,12C15,12.35 14.94,12.69 14.83,13L11,9.17C11.31,9.06 11.65,9 12,9Z";var J7="M12 2C17.5 2 22 6.5 22 12S17.5 22 12 22 2 17.5 2 12 6.5 2 12 2M12 4C10.1 4 8.4 4.6 7.1 5.7L18.3 16.9C19.3 15.5 20 13.8 20 12C20 7.6 16.4 4 12 4M16.9 18.3L5.7 7.1C4.6 8.4 4 10.1 4 12C4 16.4 7.6 20 12 20C13.9 20 15.6 19.4 16.9 18.3Z";var C4="M5,11L6.5,6.5H17.5L19,11M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6Z";var H4="M9 0C7.3 0 6 1.3 6 3S7.3 6 9 6C10.3 6 11.4 5.2 11.8 4H14V6H16V4H18V2H11.8C11.4 .8 10.3 0 9 0M9 2C9.6 2 10 2.4 10 3S9.6 4 9 4 8 3.6 8 3 8.4 2 9 2M6.5 8C5.8 8 5.3 8.4 5.1 9L3 15V23C3 23.6 3.4 24 4 24H5C5.6 24 6 23.6 6 23V22H18V23C18 23.6 18.4 24 19 24H20C20.6 24 21 23.6 21 23V15L18.9 9C18.7 8.4 18.1 8 17.5 8H6.5M6.5 9.5H17.5L19 14H5L6.5 9.5M6.5 16C7.3 16 8 16.7 8 17.5S7.3 19 6.5 19 5 18.3 5 17.5 5.7 16 6.5 16M17.5 16C18.3 16 19 16.7 19 17.5S18.3 19 17.5 19 16 18.3 16 17.5 16.7 16 17.5 16Z";var V4="M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.07,10 1,10M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18M21,3H3C1.89,3 1,3.89 1,5V8H3V5H21V19H14V21H21A2,2 0 0,0 23,19V5C23,3.89 22.1,3 21,3Z";var e4="M21,3H3C1.89,3 1,3.89 1,5V8H3V5H21V19H14V21H21A2,2 0 0,0 23,19V5C23,3.89 22.1,3 21,3M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.07,10 1,10M19,7H5V8.63C8.96,9.91 12.09,13.04 13.37,17H19M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18Z";var L4="M1.6,1.27L0.25,2.75L1.41,3.8C1.16,4.13 1,4.55 1,5V8H3V5.23L18.2,19H14V21H20.41L22.31,22.72L23.65,21.24M6.5,3L8.7,5H21V16.14L23,17.95V5C23,3.89 22.1,3 21,3M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.08,10 1,10M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18Z";var r4="M6.03 12.03L8.03 15.5L5.5 18.68L2 12.62L6.03 12.03M17 18V15.29C17.88 14.9 18.5 14.03 18.5 13C18.5 12.43 18.3 11.9 17.97 11.5L19.94 10.35C20.95 9.76 21.3 8.47 20.71 7.46L19.33 5.06C18.74 4.05 17.45 3.7 16.44 4.28L8.31 9C7.36 9.53 7.03 10.75 7.58 11.71L9.08 14.31C9.63 15.26 10.86 15.59 11.81 15.04L13.69 13.96C13.94 14.55 14.41 15.03 15 15.29V18C15 19.1 15.9 20 17 20H22V18H17Z";var t4="M8,9H11V4H13V9H16L20,17H4L8,9M14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18H14Z";var i4="M17,19H7V5H17M17,1H7C5.89,1 5,1.89 5,3V21A2,2 0 0,0 7,23H17A2,2 0 0,0 19,21V3C19,1.89 18.1,1 17,1Z";var o4="M20.07,4.93C21.88,6.74 23,9.24 23,12C23,14.76 21.88,17.26 20.07,19.07L18.66,17.66C20.11,16.22 21,14.22 21,12C21,9.79 20.11,7.78 18.66,6.34L20.07,4.93M17.24,7.76C18.33,8.85 19,10.35 19,12C19,13.65 18.33,15.15 17.24,16.24L15.83,14.83C16.55,14.11 17,13.11 17,12C17,10.89 16.55,9.89 15.83,9.17L17.24,7.76M13,10A2,2 0 0,1 15,12A2,2 0 0,1 13,14A2,2 0 0,1 11,12A2,2 0 0,1 13,10M11.5,1A2.5,2.5 0 0,1 14,3.5V8H12V4H3V19H12V16H14V20.5A2.5,2.5 0 0,1 11.5,23H3.5A2.5,2.5 0 0,1 1,20.5V3.5A2.5,2.5 0 0,1 3.5,1H11.5Z";var M4="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";var a4="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z",n4="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z",d4="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z";var A4="M16.59,5.59L18,7L12,13L6,7L7.41,5.59L12,10.17L16.59,5.59M16.59,11.59L18,13L12,19L6,13L7.41,11.59L12,16.17L16.59,11.59Z",s4="M18.41,7.41L17,6L11,12L17,18L18.41,16.59L13.83,12L18.41,7.41M12.41,7.41L11,6L5,12L11,18L12.41,16.59L7.83,12L12.41,7.41Z",l4="M5.59,7.41L7,6L13,12L7,18L5.59,16.59L10.17,12L5.59,7.41M11.59,7.41L13,6L19,12L13,18L11.59,16.59L16.17,12L11.59,7.41Z",m4="M7.41,18.41L6,17L12,11L18,17L16.59,18.41L12,13.83L7.41,18.41M7.41,12.41L6,11L12,5L18,11L16.59,12.41L12,7.83L7.41,12.41Z",p4="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";var c4="M22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12M20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12M6,10L12,16L18,10L16.6,8.6L12,13.2L7.4,8.6L6,10Z",v4="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z";var u4="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z";var x4="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z";var h4="M22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12M20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12M7.4,15.4L12,10.8L16.6,15.4L18,14L12,8L6,14L7.4,15.4Z";var Z4="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var S4="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var g4="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z";var f4="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z";var b4="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";var y4="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z";var w4="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2C6.47,2 2,6.47 2,12C2,17.53 6.47,22 12,22C17.53,22 22,17.53 22,12C22,6.47 17.53,2 12,2M14.59,8L12,10.59L9.41,8L8,9.41L10.59,12L8,14.59L9.41,16L12,13.41L14.59,16L16,14.59L13.41,12L16,9.41L14.59,8Z";var O4="M18,11H16.5V10.5H14.5V13.5H16.5V13H18V14A1,1 0 0,1 17,15H14A1,1 0 0,1 13,14V10A1,1 0 0,1 14,9H17A1,1 0 0,1 18,10M11,11H9.5V10.5H7.5V13.5H9.5V13H11V14A1,1 0 0,1 10,15H7A1,1 0 0,1 6,14V10A1,1 0 0,1 7,9H10A1,1 0 0,1 11,10M19,4H5C3.89,4 3,4.89 3,6V18A2,2 0 0,0 5,20H19A2,2 0 0,0 21,18V6C21,4.89 20.1,4 19,4Z",k4="M5,4C4.45,4 4,4.18 3.59,4.57C3.2,4.96 3,5.44 3,6V18C3,18.56 3.2,19.04 3.59,19.43C4,19.82 4.45,20 5,20H19C19.5,20 20,19.81 20.39,19.41C20.8,19 21,18.53 21,18V6C21,5.47 20.8,5 20.39,4.59C20,4.19 19.5,4 19,4H5M4.5,5.5H19.5V18.5H4.5V5.5M7,9C6.7,9 6.47,9.09 6.28,9.28C6.09,9.47 6,9.7 6,10V14C6,14.3 6.09,14.53 6.28,14.72C6.47,14.91 6.7,15 7,15H10C10.27,15 10.5,14.91 10.71,14.72C10.91,14.53 11,14.3 11,14V13H9.5V13.5H7.5V10.5H9.5V11H11V10C11,9.7 10.91,9.47 10.71,9.28C10.5,9.09 10.27,9 10,9H7M14,9C13.73,9 13.5,9.09 13.29,9.28C13.09,9.47 13,9.7 13,10V14C13,14.3 13.09,14.53 13.29,14.72C13.5,14.91 13.73,15 14,15H17C17.3,15 17.53,14.91 17.72,14.72C17.91,14.53 18,14.3 18,14V13H16.5V13.5H14.5V10.5H16.5V11H18V10C18,9.7 17.91,9.47 17.72,9.28C17.53,9.09 17.3,9 17,9H14Z";var _4="M2,21H20V19H2M20,8H18V5H20M20,3H4V13A4,4 0 0,0 8,17H14A4,4 0 0,0 18,13V10H20A2,2 0 0,0 22,8V5C22,3.89 21.1,3 20,3Z";var T4="M2,21V19H20V21H2M20,8V5H18V8H20M20,3A2,2 0 0,1 22,5V8A2,2 0 0,1 20,10H18V13A4,4 0 0,1 14,17H8A4,4 0 0,1 4,13V3H20M16,5H6V13A2,2 0 0,0 8,15H14A2,2 0 0,0 16,13V5Z";var R4="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";var P4="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11L19.5,12L19.43,13L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z";var B4="M15.9,18.45C17.25,18.45 18.35,17.35 18.35,16C18.35,14.65 17.25,13.55 15.9,13.55C14.54,13.55 13.45,14.65 13.45,16C13.45,17.35 14.54,18.45 15.9,18.45M21.1,16.68L22.58,17.84C22.71,17.95 22.75,18.13 22.66,18.29L21.26,20.71C21.17,20.86 21,20.92 20.83,20.86L19.09,20.16C18.73,20.44 18.33,20.67 17.91,20.85L17.64,22.7C17.62,22.87 17.47,23 17.3,23H14.5C14.32,23 14.18,22.87 14.15,22.7L13.89,20.85C13.46,20.67 13.07,20.44 12.71,20.16L10.96,20.86C10.81,20.92 10.62,20.86 10.54,20.71L9.14,18.29C9.05,18.13 9.09,17.95 9.22,17.84L10.7,16.68L10.65,16L10.7,15.31L9.22,14.16C9.09,14.05 9.05,13.86 9.14,13.71L10.54,11.29C10.62,11.13 10.81,11.07 10.96,11.13L12.71,11.84C13.07,11.56 13.46,11.32 13.89,11.15L14.15,9.29C14.18,9.13 14.32,9 14.5,9H17.3C17.47,9 17.62,9.13 17.64,9.29L17.91,11.15C18.33,11.32 18.73,11.56 19.09,11.84L20.83,11.13C21,11.07 21.17,11.13 21.26,11.29L22.66,13.71C22.75,13.86 22.71,14.05 22.58,14.16L21.1,15.31L21.15,16L21.1,16.68M6.69,8.07C7.56,8.07 8.26,7.37 8.26,6.5C8.26,5.63 7.56,4.92 6.69,4.92A1.58,1.58 0 0,0 5.11,6.5C5.11,7.37 5.82,8.07 6.69,8.07M10.03,6.94L11,7.68C11.07,7.75 11.09,7.87 11.03,7.97L10.13,9.53C10.08,9.63 9.96,9.67 9.86,9.63L8.74,9.18L8,9.62L7.81,10.81C7.79,10.92 7.7,11 7.59,11H5.79C5.67,11 5.58,10.92 5.56,10.81L5.4,9.62L4.64,9.18L3.5,9.63C3.41,9.67 3.3,9.63 3.24,9.53L2.34,7.97C2.28,7.87 2.31,7.75 2.39,7.68L3.34,6.94L3.31,6.5L3.34,6.06L2.39,5.32C2.31,5.25 2.28,5.13 2.34,5.03L3.24,3.47C3.3,3.37 3.41,3.33 3.5,3.37L4.63,3.82L5.4,3.38L5.56,2.19C5.58,2.08 5.67,2 5.79,2H7.59C7.7,2 7.79,2.08 7.81,2.19L8,3.38L8.74,3.82L9.86,3.37C9.96,3.33 10.08,3.37 10.13,3.47L11.03,5.03C11.09,5.13 11.07,5.25 11,5.32L10.03,6.06L10.06,6.5L10.03,6.94Z";var D4="M6,7H18A5,5 0 0,1 23,12A5,5 0 0,1 18,17C16.36,17 14.91,16.21 14,15H10C9.09,16.21 7.64,17 6,17A5,5 0 0,1 1,12A5,5 0 0,1 6,7M19.75,9.5A1.25,1.25 0 0,0 18.5,10.75A1.25,1.25 0 0,0 19.75,12A1.25,1.25 0 0,0 21,10.75A1.25,1.25 0 0,0 19.75,9.5M17.25,12A1.25,1.25 0 0,0 16,13.25A1.25,1.25 0 0,0 17.25,14.5A1.25,1.25 0 0,0 18.5,13.25A1.25,1.25 0 0,0 17.25,12M5,9V11H3V13H5V15H7V13H9V11H7V9H5Z",E4="M17.5,7A5.5,5.5 0 0,1 23,12.5A5.5,5.5 0 0,1 17.5,18C15.79,18 14.27,17.22 13.26,16H10.74C9.73,17.22 8.21,18 6.5,18A5.5,5.5 0 0,1 1,12.5A5.5,5.5 0 0,1 6.5,7H17.5M6.5,9A3.5,3.5 0 0,0 3,12.5A3.5,3.5 0 0,0 6.5,16C7.9,16 9.1,15.18 9.66,14H14.34C14.9,15.18 16.1,16 17.5,16A3.5,3.5 0 0,0 21,12.5A3.5,3.5 0 0,0 17.5,9H6.5M5.75,10.25H7.25V11.75H8.75V13.25H7.25V14.75H5.75V13.25H4.25V11.75H5.75V10.25M16.75,12.5A1,1 0 0,1 17.75,13.5A1,1 0 0,1 16.75,14.5A1,1 0 0,1 15.75,13.5A1,1 0 0,1 16.75,12.5M18.75,10.5A1,1 0 0,1 19.75,11.5A1,1 0 0,1 18.75,12.5A1,1 0 0,1 17.75,11.5A1,1 0 0,1 18.75,10.5Z";var F4="M23 3H1V1H23V3M2 22H6C6 19 4 17 4 17C10 13 11 4 11 4H2V22M22 4H13C13 4 14 13 20 17C20 17 18 19 18 22H22V4Z",N4="M23 3H1V1H23V3M2 22H11V4H2V22M22 4H13V22H22V4Z";var I4="M8,2H16A2,2 0 0,1 18,4V20A2,2 0 0,1 16,22H8A2,2 0 0,1 6,20V4A2,2 0 0,1 8,2M8,4V6H16V4H8M16,8H8V10H16V8M16,18H14V20H16V18Z";var $4="M12,19A2,2 0 0,0 10,21A2,2 0 0,0 12,23A2,2 0 0,0 14,21A2,2 0 0,0 12,19M6,1A2,2 0 0,0 4,3A2,2 0 0,0 6,5A2,2 0 0,0 8,3A2,2 0 0,0 6,1M6,7A2,2 0 0,0 4,9A2,2 0 0,0 6,11A2,2 0 0,0 8,9A2,2 0 0,0 6,7M6,13A2,2 0 0,0 4,15A2,2 0 0,0 6,17A2,2 0 0,0 8,15A2,2 0 0,0 6,13M18,5A2,2 0 0,0 20,3A2,2 0 0,0 18,1A2,2 0 0,0 16,3A2,2 0 0,0 18,5M12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13M18,13A2,2 0 0,0 16,15A2,2 0 0,0 18,17A2,2 0 0,0 20,15A2,2 0 0,0 18,13M18,7A2,2 0 0,0 16,9A2,2 0 0,0 18,11A2,2 0 0,0 20,9A2,2 0 0,0 18,7M12,7A2,2 0 0,0 10,9A2,2 0 0,0 12,11A2,2 0 0,0 14,9A2,2 0 0,0 12,7M12,1A2,2 0 0,0 10,3A2,2 0 0,0 12,5A2,2 0 0,0 14,3A2,2 0 0,0 12,1Z";var U4="M12,14C10.89,14 10,13.1 10,12C10,10.89 10.89,10 12,10C13.11,10 14,10.89 14,12A2,2 0 0,1 12,14M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";var W4="M14.5,10.37C15.54,10.37 16.38,9.53 16.38,8.5C16.38,7.46 15.54,6.63 14.5,6.63C13.46,6.63 12.63,7.46 12.63,8.5A1.87,1.87 0 0,0 14.5,10.37M14.5,1A7.5,7.5 0 0,1 22,8.5C22,10.67 21.08,12.63 19.6,14H9.4C7.93,12.63 7,10.67 7,8.5C7,4.35 10.36,1 14.5,1M6,21V22H4V21H2V15H22V21H20V22H18V21H6M4,18V19H13V18H4M15,17V19H17V17H15M19,17A1,1 0 0,0 18,18A1,1 0 0,0 19,19A1,1 0 0,0 20,18A1,1 0 0,0 19,17Z",G4="M18,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2M10,4A1,1 0 0,1 11,5A1,1 0 0,1 10,6A1,1 0 0,1 9,5A1,1 0 0,1 10,4M7,4A1,1 0 0,1 8,5A1,1 0 0,1 7,6A1,1 0 0,1 6,5A1,1 0 0,1 7,4M18,20H6V8H18V20M14.67,15.33C14.69,16.03 14.41,16.71 13.91,17.21C12.86,18.26 11.15,18.27 10.09,17.21C9.59,16.71 9.31,16.03 9.33,15.33C9.4,14.62 9.63,13.94 10,13.33C10.37,12.5 10.81,11.73 11.33,11L12,10C13.79,12.59 14.67,14.36 14.67,15.33";var z4="M8,3C6.89,3 6,3.89 6,5V21H18V5C18,3.89 17.11,3 16,3H8M8,5H16V19H8V5M13,11V13H15V11H13Z",q4="M16,11H18V13H16V11M12,3H19C20.11,3 21,3.89 21,5V19H22V21H2V19H10V5C10,3.89 10.89,3 12,3M12,5V19H19V5H12Z";var K4="M12,3C10.89,3 10,3.89 10,5H3V19H2V21H22V19H21V5C21,3.89 20.11,3 19,3H12M12,5H19V19H12V5M5,11H7V13H5V11Z";var Q4="M12 10C10.9 10 10 10.9 10 12S10.9 14 12 14 14 13.1 14 12 13.1 10 12 10M16 2H8C6.9 2 6 2.9 6 4V20C6 21.1 6.9 22 8 22H16C17.1 22 18 21.1 18 20V4C18 2.9 17.1 2 16 2M16 20H8V4H16V20Z";var j4="M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z";var X4="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z";var Y4="M11 21H9V3H11V21M15 3H13V21H15V3Z";var J4="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z";var C9="M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.74,7.13 11.35,7 12,7Z";var H9="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z";var V9="M12.5,2C9.64,2 8.57,4.55 9.29,7.47L15,13.16C15.87,13.37 16.81,13.81 17.28,14.73C18.46,17.1 22.03,17 22.03,12.5C22.03,8.92 18.05,8.13 14.35,10.13C14.03,9.73 13.61,9.42 13.13,9.22C13.32,8.29 13.76,7.24 14.75,6.75C17.11,5.57 17,2 12.5,2M3.28,4L2,5.27L4.47,7.73C3.22,7.74 2,8.87 2,11.5C2,15.07 5.96,15.85 9.65,13.87C9.97,14.27 10.4,14.59 10.89,14.79C10.69,15.71 10.25,16.75 9.27,17.24C6.91,18.42 7,22 11.5,22C13.8,22 14.94,20.36 14.94,18.21L18.73,22L20,20.72L3.28,4Z";var e9="M13,6V18L21.5,12M4,18L12.5,12L4,6V18Z";var L9="M3.5,3H5V1.8C5,1.36 5.36,1 5.8,1H10.2C10.64,1 11,1.36 11,1.8V3H12.5A1.5,1.5 0 0,1 14,4.5V5H22V20H14V20.5A1.5,1.5 0 0,1 12.5,22H3.5A1.5,1.5 0 0,1 2,20.5V4.5A1.5,1.5 0 0,1 3.5,3M18,7V9H20V7H18M14,7V9H16V7H14M10,7V9H12V7H10M14,16V18H16V16H14M18,16V18H20V16H18M10,16V18H12V16H10Z",r9="M18,9H16V7H18M18,13H16V11H18M18,17H16V15H18M8,9H6V7H8M8,13H6V11H8M8,17H6V15H8M18,3V5H16V3H8V5H6V3H4V21H6V19H8V21H16V19H18V21H20V3H18Z";var t9="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z";var i9="M22,22H2V20H22V22M22,6H2V3H22V6M20,7V19H17V11C17,11 14.5,10 12,10C9.5,10 7,11 7,11V19H4V7H20M14.5,14.67H14.47L14.81,15.22L14.87,15.34C15.29,16.35 15,17.5 14.21,18.24C13.5,18.9 12.5,19.07 11.58,18.95C10.71,18.84 9.9,18.29 9.45,17.53C9.3,17.3 9.19,17.03 9.13,16.77L9,16.11C8.96,15.15 9.34,14.14 10.06,13.54C9.73,14.26 9.81,15.16 10.3,15.79L10.36,15.87C10.44,15.94 10.55,15.97 10.64,15.92C10.73,15.89 10.8,15.8 10.8,15.7L10.76,15.56C10.23,14.17 10.68,12.55 11.79,11.63C12.1,11.38 12.5,11.15 12.87,11.05C12.46,11.87 12.61,12.93 13.25,13.57L14.14,14.3L14.5,14.67M13.11,17.44V17.44C13.37,17.2 13.53,16.8 13.5,16.44V16.25C13.38,15.65 12.85,15.46 12.5,15L12.26,14.55C12.13,14.85 12.12,15.13 12.17,15.46C12.23,15.8 12.37,16.09 12.29,16.44C12.2,16.83 11.9,17.22 11.37,17.35C11.67,17.64 12.15,17.87 12.64,17.71L13.11,17.44Z",o9="M22,22H2V20H22V22M22,6H2V3H22V6M20,7V19H17V11C17,11 14.5,10 12,10C9.5,10 7,11 7,11V19H4V7H20Z";var M9="M15,2L17,9H7L9,2M11,10H13V20H16V22H8V20H11V10Z";var a9="M19,11.5C19,11.5 17,13.67 17,15A2,2 0 0,0 19,17A2,2 0 0,0 21,15C21,13.67 19,11.5 19,11.5M5.21,10L10,5.21L14.79,10M16.56,8.94L7.62,0L6.21,1.41L8.59,3.79L3.44,8.94C2.85,9.5 2.85,10.47 3.44,11.06L8.94,16.56C9.23,16.85 9.62,17 10,17C10.38,17 10.77,16.85 11.06,16.56L16.56,11.06C17.15,10.47 17.15,9.5 16.56,8.94Z";var n9="M7,2H17A2,2 0 0,1 19,4V9H5V4A2,2 0 0,1 7,2M19,19A2,2 0 0,1 17,21V22H15V21H9V22H7V21A2,2 0 0,1 5,19V10H19V19M8,5V7H10V5H8M8,12V15H10V12H8Z";var d9="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z",A9="M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z";var s9="M16.5,9L13.5,12L16.5,15H22V9M9,16.5V22H15V16.5L12,13.5M7.5,9H2V15H7.5L10.5,12M15,7.5V2H9V7.5L12,10.5L15,7.5Z";var l9="M7,6H17A6,6 0 0,1 23,12A6,6 0 0,1 17,18C15.22,18 13.63,17.23 12.53,16H11.47C10.37,17.23 8.78,18 7,18A6,6 0 0,1 1,12A6,6 0 0,1 7,6M6,9V11H4V13H6V15H8V13H10V11H8V9H6M15.5,12A1.5,1.5 0 0,0 14,13.5A1.5,1.5 0 0,0 15.5,15A1.5,1.5 0 0,0 17,13.5A1.5,1.5 0 0,0 15.5,12M18.5,9A1.5,1.5 0 0,0 17,10.5A1.5,1.5 0 0,0 18.5,12A1.5,1.5 0 0,0 20,10.5A1.5,1.5 0 0,0 18.5,9Z";var m9="M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12M8,15H16V17H8V15M16,18V20H8V18H16Z";var p9="M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12Z";var c9="M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5M11,3A6,6 0 0,1 17,9C17,10.7 16.29,12.23 15.16,13.33L14.16,12.88C15.28,11.96 16,10.56 16,9A5,5 0 0,0 11,4A5,5 0 0,0 6,9C6,11.05 7.23,12.81 9,13.58V14.66C6.67,13.83 5,11.61 5,9A6,6 0 0,1 11,3Z";var v9="M20.11,3.89L22,2V7H17L19.08,4.92C18.55,4.23 17.64,3.66 16.36,3.19C15.08,2.72 13.63,2.5 12,2.5C10.38,2.5 8.92,2.72 7.64,3.19C6.36,3.66 5.45,4.23 4.92,4.92L7,7H2V2L3.89,3.89C4.64,3 5.74,2.31 7.2,1.78C8.65,1.25 10.25,1 12,1C13.75,1 15.35,1.25 16.8,1.78C18.26,2.31 19.36,3 20.11,3.89M19.73,16.27V16.45L19,21.7C18.92,22.08 18.76,22.39 18.5,22.64C18.23,22.89 17.91,23 17.53,23H10.73C10.36,23 10,22.86 9.7,22.55L4.73,17.63L5.53,16.83C5.75,16.61 6,16.5 6.33,16.5H6.56L10,17.25V6.5C10,6.11 10.13,5.76 10.43,5.46C10.73,5.16 11.08,5 11.5,5C11.89,5 12.24,5.16 12.54,5.46C12.84,5.76 13,6.11 13,6.5V12.5H13.78C13.88,12.5 14.05,12.55 14.3,12.61L18.84,14.86C19.44,15.14 19.73,15.61 19.73,16.27Z";var u9="M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";var x9="M13 5C15.21 5 17 6.79 17 9C17 10.5 16.2 11.77 15 12.46V11.24C15.61 10.69 16 9.89 16 9C16 7.34 14.66 6 13 6S10 7.34 10 9C10 9.89 10.39 10.69 11 11.24V12.46C9.8 11.77 9 10.5 9 9C9 6.79 10.79 5 13 5M20 20.5C19.97 21.32 19.32 21.97 18.5 22H13C12.62 22 12.26 21.85 12 21.57L8 17.37L8.74 16.6C8.93 16.39 9.2 16.28 9.5 16.28H9.7L12 18V9C12 8.45 12.45 8 13 8S14 8.45 14 9V13.47L15.21 13.6L19.15 15.79C19.68 16.03 20 16.56 20 17.14V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.11 2.9 14 4 14H8V12L4 12L4 4H20L20 12H18V14H20V13.96L20.04 14C21.13 14 22 13.09 22 12V4C22 2.9 21.11 2 20 2Z";var h9="M7.5,7L5.5,5H18.5L16.5,7M11,13V19H6V21H18V19H13V13L21,5V3H3V5L11,13Z";var Z9="M12,1C7,1 3,5 3,10V17A3,3 0 0,0 6,20H9V12H5V10A7,7 0 0,1 12,3A7,7 0 0,1 19,10V12H15V20H18A3,3 0 0,0 21,17V10C21,5 16.97,1 12,1Z";var S9="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z";var g9="M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z";var f9="M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z",b9="M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z";var y9="M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5Z";var w9="M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z";var O9="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z";var k9="M21.8,13H20V21H13V17.67L15.79,14.88L16.5,15C17.66,15 18.6,14.06 18.6,12.9C18.6,11.74 17.66,10.8 16.5,10.8A2.1,2.1 0 0,0 14.4,12.9L14.5,13.61L13,15.13V9.65C13.66,9.29 14.1,8.6 14.1,7.8A2.1,2.1 0 0,0 12,5.7A2.1,2.1 0 0,0 9.9,7.8C9.9,8.6 10.34,9.29 11,9.65V15.13L9.5,13.61L9.6,12.9A2.1,2.1 0 0,0 7.5,10.8A2.1,2.1 0 0,0 5.4,12.9A2.1,2.1 0 0,0 7.5,15L8.21,14.88L11,17.67V21H4V13H2.25C1.83,13 1.42,13 1.42,12.79C1.43,12.57 1.85,12.15 2.28,11.72L11,3C11.33,2.67 11.67,2.33 12,2.33C12.33,2.33 12.67,2.67 13,3L17,7V6H19V9L21.78,11.78C22.18,12.18 22.59,12.59 22.6,12.8C22.6,13 22.2,13 21.8,13M7.5,12A0.9,0.9 0 0,1 8.4,12.9A0.9,0.9 0 0,1 7.5,13.8A0.9,0.9 0 0,1 6.6,12.9A0.9,0.9 0 0,1 7.5,12M16.5,12C17,12 17.4,12.4 17.4,12.9C17.4,13.4 17,13.8 16.5,13.8A0.9,0.9 0 0,1 15.6,12.9A0.9,0.9 0 0,1 16.5,12M12,6.9C12.5,6.9 12.9,7.3 12.9,7.8C12.9,8.3 12.5,8.7 12,8.7C11.5,8.7 11.1,8.3 11.1,7.8C11.1,7.3 11.5,6.9 12,6.9Z",_9="M12,3L2,12H5V20H19V12H22L12,3M12,8.5C14.34,8.5 16.46,9.43 18,10.94L16.8,12.12C15.58,10.91 13.88,10.17 12,10.17C10.12,10.17 8.42,10.91 7.2,12.12L6,10.94C7.54,9.43 9.66,8.5 12,8.5M12,11.83C13.4,11.83 14.67,12.39 15.6,13.3L14.4,14.47C13.79,13.87 12.94,13.5 12,13.5C11.06,13.5 10.21,13.87 9.6,14.47L8.4,13.3C9.33,12.39 10.6,11.83 12,11.83M12,15.17C12.94,15.17 13.7,15.91 13.7,16.83C13.7,17.75 12.94,18.5 12,18.5C11.06,18.5 10.3,17.75 10.3,16.83C10.3,15.91 11.06,15.17 12,15.17Z";var T9="M12 3L2 12H5V20H19V12H22M13 18H11V17H13M13.5 14.58V16H10.5V14.58A3 3 0 1 1 13.5 14.58Z";var R9="M12 5.69L17 10.19V18H15V12H9V18H7V10.19L12 5.69M12 3L2 12H5V20H11V14H13V20H19V12H22";var P9="M19 8C20.11 8 21 8.9 21 10V16.76C21.61 17.31 22 18.11 22 19C22 20.66 20.66 22 19 22C17.34 22 16 20.66 16 19C16 18.11 16.39 17.31 17 16.76V10C17 8.9 17.9 8 19 8M19 9C18.45 9 18 9.45 18 10V11H20V10C20 9.45 19.55 9 19 9M5 20V12H2L12 3L16.4 6.96C15.54 7.69 15 8.78 15 10V16C14.37 16.83 14 17.87 14 19L14.1 20H5Z";var B9="M19.5,12.8V22H14.7V13.9C14.7,13.2 14.1,12.6 13.4,12.6H10.5C9.8,12.6 9.2,13.2 9.2,13.9V22H4.5V2H9.3V8.4C9.6,8.3 9.9,8.2 10.2,8.2H15C17.5,8.2 19.5,10.3 19.5,12.8Z";var D9="M12 2C13.1 2 14 2.9 14 4S13.1 6 12 6 10 5.1 10 4 10.9 2 12 2M15.9 8.1C15.5 7.7 14.8 7 13.5 7H11C8.2 7 6 4.8 6 2H4C4 5.2 6.1 7.8 9 8.7V22H11V16H13V22H15V10.1L19 14L20.4 12.6L15.9 8.1Z";var E9="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z";var F9="M22,16V4A2,2 0 0,0 20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16M11,12L13.03,14.71L16,11L20,16H8M2,6V20A2,2 0 0,0 4,22H18V20H4V6";var N9="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var I9="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z";var $9="M12,19.58V19.58C10.4,19.58 8.89,18.96 7.76,17.83C6.62,16.69 6,15.19 6,13.58C6,12 6.62,10.47 7.76,9.34L12,5.1M17.66,7.93L12,2.27V2.27L6.34,7.93C3.22,11.05 3.22,16.12 6.34,19.24C7.9,20.8 9.95,21.58 12,21.58C14.05,21.58 16.1,20.8 17.66,19.24C20.78,16.12 20.78,11.05 17.66,7.93Z";var U9="M12.5,3C7.81,3 4,5.69 4,9V9C4,10.19 4.5,11.34 5.44,12.33C4.53,13.5 4,14.96 4,16.5C4,17.64 4,18.83 4,20C4,21.11 4.89,22 6,22H19C20.11,22 21,21.11 21,20C21,18.85 21,17.61 21,16.5C21,15.28 20.66,14.07 20,13L22,11L19,8L16.9,10.1C15.58,9.38 14.05,9 12.5,9C10.65,9 8.95,9.53 7.55,10.41C7.19,9.97 7,9.5 7,9C7,7.21 9.46,5.75 12.5,5.75V5.75C13.93,5.75 15.3,6.08 16.33,6.67L18.35,4.65C16.77,3.59 14.68,3 12.5,3M12.5,11C12.84,11 13.17,11.04 13.5,11.09C10.39,11.57 8,14.25 8,17.5V20H6V17.5A6.5,6.5 0 0,1 12.5,11Z";var W9="M19,10H17V8H19M19,13H17V11H19M16,10H14V8H16M16,13H14V11H16M16,17H8V15H16M7,10H5V8H7M7,13H5V11H7M8,11H10V13H8M8,8H10V10H8M11,11H13V13H11M11,8H13V10H11M20,5H4C2.89,5 2,5.89 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7C22,5.89 21.1,5 20,5Z",G9="M21,11H6.83L10.41,7.41L9,6L3,12L9,18L10.41,16.58L6.83,13H21V11Z";var z9="M19,7V11H5.83L9.41,7.41L8,6L2,12L8,18L9.41,16.58L5.83,13H21V7H19Z";var q9="M3 15H5V19H19V15H21V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15Z";var K9="M12.03,1C11.82,1 11.6,1.11 11.41,1.31C10.56,2.16 9.72,3 8.88,3.84C8.66,4.06 8.6,4.18 8.38,4.38C8.09,4.62 7.96,4.91 7.97,5.28C8,6.57 8,7.84 8,9.13C8,10.46 8,11.82 8,13.16C8,13.26 8,13.34 8.03,13.44C8.11,13.75 8.31,13.82 8.53,13.59C9.73,12.39 10.8,11.3 12,10.09C13.36,8.73 14.73,7.37 16.09,6C16.5,5.6 16.5,5.15 16.09,4.75C14.94,3.6 13.77,2.47 12.63,1.31C12.43,1.11 12.24,1 12.03,1M18.66,7.66C18.45,7.66 18.25,7.75 18.06,7.94C16.91,9.1 15.75,10.24 14.59,11.41C14.2,11.8 14.2,12.23 14.59,12.63C15.74,13.78 16.88,14.94 18.03,16.09C18.43,16.5 18.85,16.5 19.25,16.09C20.36,15 21.5,13.87 22.59,12.75C22.76,12.58 22.93,12.42 23,12.19V11.88C22.93,11.64 22.76,11.5 22.59,11.31C21.47,10.19 20.37,9.06 19.25,7.94C19.06,7.75 18.86,7.66 18.66,7.66M4.78,8.09C4.65,8.04 4.58,8.14 4.5,8.22C3.35,9.39 2.34,10.43 1.19,11.59C0.93,11.86 0.93,12.24 1.19,12.5C1.81,13.13 2.44,13.75 3.06,14.38C3.6,14.92 4,15.33 4.56,15.88C4.72,16.03 4.86,16 4.94,15.81C5,15.71 5,15.58 5,15.47C5,14.29 5,13.37 5,12.19C5,11 5,9.81 5,8.63C5,8.55 5,8.45 4.97,8.38C4.95,8.25 4.9,8.14 4.78,8.09M12.09,14.25C11.89,14.25 11.66,14.34 11.47,14.53C10.32,15.69 9.18,16.87 8.03,18.03C7.63,18.43 7.63,18.85 8.03,19.25C9.14,20.37 10.26,21.47 11.38,22.59C11.54,22.76 11.71,22.93 11.94,23H12.22C12.44,22.94 12.62,22.79 12.78,22.63C13.9,21.5 15.03,20.38 16.16,19.25C16.55,18.85 16.5,18.4 16.13,18C14.97,16.84 13.84,15.69 12.69,14.53C12.5,14.34 12.3,14.25 12.09,14.25Z";var Q9="M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z";var j9="M4,6H20V16H4M20,18A2,2 0 0,0 22,16V6C22,4.89 21.1,4 20,4H4C2.89,4 2,4.89 2,6V16A2,2 0 0,0 4,18H0V20H24V18H20Z";var X9="M2.81,8.46L14.83,20.5L15.54,19.78L16.95,21.19L18.36,19.78L16.95,18.36L18.36,16.95L19.78,18.36L21.19,16.95L19.78,15.54L20.5,14.83L8.46,2.81L2.81,8.46M5.64,8.46L8.46,5.64L17.66,14.83L14.83,17.66L5.64,8.46M7.05,8.46L8.46,9.88L9.88,8.46L8.46,7.05L7.05,8.46M9.17,10.59L10.59,12L12,10.59L10.59,9.17L9.17,10.59M11.29,12.71L12.71,14.12L14.12,12.71L12.71,11.29L11.29,12.71M13.41,14.83L14.83,16.24L16.24,14.83L14.83,13.41L13.41,14.83Z",Y9="M2.95 3L2 6.91L19.34 11.25L20.29 7.34L2.95 3M6.09 6.89L4.16 6.41L4.64 4.46L6.57 4.94L6.09 6.89M9.94 7.86L8 7.38L8.5 5.42L10.42 5.91L9.94 7.86M13.8 8.82L11.87 8.34L12.35 6.39L14.27 6.87L13.8 8.82M17.65 9.79L15.72 9.31L16.2 7.35L18.13 7.84L17.65 9.79M4.66 12.75L3.71 16.66L21.05 21L22 17.1L4.66 12.75M7.8 16.65L5.88 16.16L6.35 14.21L8.28 14.69L7.8 16.65M11.65 17.61L9.73 17.13L10.2 15.18L12.13 15.66L11.65 17.61M15.5 18.58L13.58 18.09L14.06 16.14L16 16.62L15.5 18.58M19.36 19.54L17.43 19.06L17.91 17.11L19.84 17.59L19.36 19.54M6.25 12.11L11 10.2L17.75 11.89L13 13.8L6.25 12.11Z";var J9="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z";var C6="M15 14V16A1 1 0 0 1 14 17H10A1 1 0 0 1 9 16V14A5 5 0 1 1 15 14M14 18H10V19A1 1 0 0 0 11 20H13A1 1 0 0 0 14 19M7 19V18H5V19A1 1 0 0 0 6 20H7.17A2.93 2.93 0 0 1 7 19M5 10A6.79 6.79 0 0 1 5.68 7A4 4 0 0 0 4 14.45V16A1 1 0 0 0 5 17H7V14.88A6.92 6.92 0 0 1 5 10M17 18V19A2.93 2.93 0 0 1 16.83 20H18A1 1 0 0 0 19 19V18M18.32 7A6.79 6.79 0 0 1 19 10A6.92 6.92 0 0 1 17 14.88V17H19A1 1 0 0 0 20 16V14.45A4 4 0 0 0 18.32 7Z",H6="M20.84 22.73L18.09 20C18.06 20 18.03 20 18 20H16.83C16.94 19.68 17 19.34 17 19V18.89L14.75 16.64C14.57 16.86 14.31 17 14 17H10C9.45 17 9 16.55 9 16V14C7.4 12.8 6.74 10.84 7.12 9L5.5 7.4C5.18 8.23 5 9.11 5 10C5 11.83 5.72 13.58 7 14.88V17H5C4.45 17 4 16.55 4 16V14.45C2.86 13.79 2.12 12.62 2 11.31C1.85 9.27 3.25 7.5 5.2 7.09L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M15 6C13.22 4.67 10.86 4.72 9.13 5.93L16.08 12.88C17.63 10.67 17.17 7.63 15 6M19.79 16.59C19.91 16.42 20 16.22 20 16V14.45C21.91 13.34 22.57 10.9 21.46 9C20.8 7.85 19.63 7.11 18.32 7C18.77 7.94 19 8.96 19 10C19 11.57 18.47 13.09 17.5 14.31L19.79 16.59M10 19C10 19.55 10.45 20 11 20H13C13.55 20 14 19.55 14 19V18H10V19M7 18H5V19C5 19.55 5.45 20 6 20H7.17C7.06 19.68 7 19.34 7 19V18Z";var V6="M12,2C9.76,2 7.78,3.05 6.5,4.68L16.31,14.5C17.94,13.21 19,11.24 19,9A7,7 0 0,0 12,2M3.28,4L2,5.27L5.04,8.3C5,8.53 5,8.76 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H14.73L18.73,22L20,20.72L3.28,4M9,20V21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9Z";var e6="M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z";var L6="M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z";var r6="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z";var t6="M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10A2,2 0 0,1 6,8H15V6A3,3 0 0,0 12,3A3,3 0 0,0 9,6H7A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17Z";var i6="M18 1C15.24 1 13 3.24 13 6V8H4C2.9 8 2 8.89 2 10V20C2 21.11 2.9 22 4 22H16C17.11 22 18 21.11 18 20V10C18 8.9 17.11 8 16 8H15V6C15 4.34 16.34 3 18 3C19.66 3 21 4.34 21 6V8H23V6C23 3.24 20.76 1 18 1M10 13C11.1 13 12 13.89 12 15C12 16.11 11.11 17 10 17C8.9 17 8 16.11 8 15C8 13.9 8.9 13 10 13Z";var o6="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z";var M6="M9,2A7,7 0 0,1 16,9C16,10.57 15.5,12 14.61,13.19L15.41,14H16L22,20L20,22L14,16V15.41L13.19,14.61C12,15.5 10.57,16 9,16A7,7 0 0,1 2,9A7,7 0 0,1 9,2M5,8V10H13V8H5Z";var a6="M9,2A7,7 0 0,1 16,9C16,10.57 15.5,12 14.61,13.19L15.41,14H16L22,20L20,22L14,16V15.41L13.19,14.61C12,15.5 10.57,16 9,16A7,7 0 0,1 2,9A7,7 0 0,1 9,2M8,5V8H5V10H8V13H10V10H13V8H10V5H8Z";var n6="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z";var d6="M7,10L12,15L17,10H7Z";var A6="M21,15.61L19.59,17L14.58,12L19.59,7L21,8.39L17.44,12L21,15.61M3,6H16V8H3V6M3,13V11H13V13H3M3,18V16H16V18H3Z";var s6="M7,15L12,10L17,15H7Z";var l6="M6.43,3.72C6.5,3.66 6.57,3.6 6.62,3.56C8.18,2.55 10,2 12,2C13.88,2 15.64,2.5 17.14,3.42C17.25,3.5 17.54,3.69 17.7,3.88C16.25,2.28 12,5.7 12,5.7C10.5,4.57 9.17,3.8 8.16,3.5C7.31,3.29 6.73,3.5 6.46,3.7M19.34,5.21C19.29,5.16 19.24,5.11 19.2,5.06C18.84,4.66 18.38,4.56 18,4.59C17.61,4.71 15.9,5.32 13.8,7.31C13.8,7.31 16.17,9.61 17.62,11.96C19.07,14.31 19.93,16.16 19.4,18.73C21,16.95 22,14.59 22,12C22,9.38 21,7 19.34,5.21M15.73,12.96C15.08,12.24 14.13,11.21 12.86,9.95C12.59,9.68 12.3,9.4 12,9.1C12,9.1 11.53,9.56 10.93,10.17C10.16,10.94 9.17,11.95 8.61,12.54C7.63,13.59 4.81,16.89 4.65,18.74C4.65,18.74 4,17.28 5.4,13.89C6.3,11.68 9,8.36 10.15,7.28C10.15,7.28 9.12,6.14 7.82,5.35L7.77,5.32C7.14,4.95 6.46,4.66 5.8,4.62C5.13,4.67 4.71,5.16 4.71,5.16C3.03,6.95 2,9.35 2,12A10,10 0 0,0 12,22C14.93,22 17.57,20.74 19.4,18.73C19.4,18.73 19.19,17.4 17.84,15.5C17.53,15.07 16.37,13.69 15.73,12.96Z";var m6="M4,5A2,2 0 0,0 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7A2,2 0 0,0 20,5H4M4,7H16V17H4V7M19,7A1,1 0 0,1 20,8A1,1 0 0,1 19,9A1,1 0 0,1 18,8A1,1 0 0,1 19,7M13,9V15H15V9H13M19,11A1,1 0 0,1 20,12A1,1 0 0,1 19,13A1,1 0 0,1 18,12A1,1 0 0,1 19,11Z";var p6="M19,13H5V11H19V13Z",c6="M17,13H7V11H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";var v6="M17,13H7V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var u6="M21,16H3V4H21M21,2H3C1.89,2 1,2.89 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16V4C23,2.89 22.1,2 21,2Z";var x6="M10,0.2C9,0.2 8.2,1 8.2,2C8.2,3 9,3.8 10,3.8C11,3.8 11.8,3 11.8,2C11.8,1 11,0.2 10,0.2M15.67,1A7.33,7.33 0 0,0 23,8.33V7A6,6 0 0,1 17,1H15.67M18.33,1C18.33,3.58 20.42,5.67 23,5.67V4.33C21.16,4.33 19.67,2.84 19.67,1H18.33M21,1A2,2 0 0,0 23,3V1H21M7.92,4.03C7.75,4.03 7.58,4.06 7.42,4.11L2,5.8V11H3.8V7.33L5.91,6.67L2,22H3.8L6.67,13.89L9,17V22H10.8V15.59L8.31,11.05L9.04,8.18L10.12,10H15V8.2H11.38L9.38,4.87C9.08,4.37 8.54,4.03 7.92,4.03Z";var h6="M18,4L20,8H17L15,4H13L15,8H12L10,4H8L10,8H7L5,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V4H18Z";var Z6="M20.84 2.18L16.91 2.96L19.65 6.5L21.62 6.1L20.84 2.18M13.97 3.54L12 3.93L14.75 7.46L16.71 7.07L13.97 3.54M9.07 4.5L7.1 4.91L9.85 8.44L11.81 8.05L9.07 4.5M4.16 5.5L3.18 5.69A2 2 0 0 0 1.61 8.04L2 10L6.9 9.03L4.16 5.5M2 10V20C2 21.11 2.9 22 4 22H20C21.11 22 22 21.11 22 20V10H2Z";var S6="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A2.5,2.5 0 0,0 9.5,6.5A2.5,2.5 0 0,0 12,9A2.5,2.5 0 0,0 14.5,6.5A2.5,2.5 0 0,0 12,4M4.4,9.53C3.97,10.84 4.69,12.25 6,12.68C7.32,13.1 8.73,12.39 9.15,11.07C9.58,9.76 8.86,8.35 7.55,7.92C6.24,7.5 4.82,8.21 4.4,9.53M19.61,9.5C19.18,8.21 17.77,7.5 16.46,7.92C15.14,8.34 14.42,9.75 14.85,11.07C15.28,12.38 16.69,13.1 18,12.67C19.31,12.25 20.03,10.83 19.61,9.5M7.31,18.46C8.42,19.28 10,19.03 10.8,17.91C11.61,16.79 11.36,15.23 10.24,14.42C9.13,13.61 7.56,13.86 6.75,14.97C5.94,16.09 6.19,17.65 7.31,18.46M16.7,18.46C17.82,17.65 18.07,16.09 17.26,14.97C16.45,13.85 14.88,13.6 13.77,14.42C12.65,15.23 12.4,16.79 13.21,17.91C14,19.03 15.59,19.27 16.7,18.46M12,10.5A1.5,1.5 0 0,0 10.5,12A1.5,1.5 0 0,0 12,13.5A1.5,1.5 0 0,0 13.5,12A1.5,1.5 0 0,0 12,10.5Z";var g6="M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z";var f6="M16,9H13V14.5A2.5,2.5 0 0,1 10.5,17A2.5,2.5 0 0,1 8,14.5A2.5,2.5 0 0,1 10.5,12C11.07,12 11.58,12.19 12,12.5V7H16M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3Z";var b6="M16,9H13V14.5A2.5,2.5 0 0,1 10.5,17A2.5,2.5 0 0,1 8,14.5A2.5,2.5 0 0,1 10.5,12C11.07,12 11.58,12.19 12,12.5V7H16V9M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19M5,5V19H19V5H5Z";var y6="M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z";var w6="M6.5,2H10.5L13.44,10.83L13.5,2H17.5V22C16.25,21.78 14.87,21.64 13.41,21.58L10.5,13L10.43,21.59C9.03,21.65 7.7,21.79 6.5,22V2Z";var O6="M7 1C5.9 1 5 1.9 5 3V21C5 22.11 5.9 23 7 23H14C16.76 23 19 20.76 19 18V3C19 1.9 18.11 1 17 1H7M8 4H16V11H8V4M9 14H10V16H12V17H10V19H9V17H7V16H9V14M16 15C16.55 15 17 15.45 17 16C17 16.55 16.55 17 16 17C15.45 17 15 16.55 15 16C15 15.45 15.45 15 16 15M14 17C14.55 17 15 17.45 15 18C15 18.55 14.55 19 14 19C13.45 19 13 18.55 13 18C13 17.45 13.45 17 14 17Z",k6="M10.04,20.4H7.12C6.19,20.4 5.3,20 4.64,19.36C4,18.7 3.6,17.81 3.6,16.88V7.12C3.6,6.19 4,5.3 4.64,4.64C5.3,4 6.19,3.62 7.12,3.62H10.04V20.4M7.12,2A5.12,5.12 0 0,0 2,7.12V16.88C2,19.71 4.29,22 7.12,22H11.65V2H7.12M5.11,8C5.11,9.04 5.95,9.88 7,9.88C8.03,9.88 8.87,9.04 8.87,8C8.87,6.96 8.03,6.12 7,6.12C5.95,6.12 5.11,6.96 5.11,8M17.61,11C18.72,11 19.62,11.89 19.62,13C19.62,14.12 18.72,15 17.61,15C16.5,15 15.58,14.12 15.58,13C15.58,11.89 16.5,11 17.61,11M16.88,22A5.12,5.12 0 0,0 22,16.88V7.12C22,4.29 19.71,2 16.88,2H13.65V22H16.88Z";var _6="M4,17V9H2V7H6V17H4M22,15C22,16.11 21.1,17 20,17H16V15H20V13H18V11H20V9H16V7H20A2,2 0 0,1 22,9V10.5A1.5,1.5 0 0,1 20.5,12A1.5,1.5 0 0,1 22,13.5V15M14,15V17H8V13C8,11.89 8.9,11 10,11H12V9H8V7H12A2,2 0 0,1 14,9V11C14,12.11 13.1,13 12,13H10V15H14Z";var T6="M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";var R6="M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C12.3,20 12.5,19.8 12.5,19.5C12.5,19.3 12.4,19.2 12.4,19.1C12,18.6 11.8,18.1 11.8,17.5C11.8,16.1 12.9,15 14.3,15H16A4,4 0 0,0 20,11C20,7.1 16.4,4 12,4M6.5,10C7.3,10 8,10.7 8,11.5C8,12.3 7.3,13 6.5,13C5.7,13 5,12.3 5,11.5C5,10.7 5.7,10 6.5,10M9.5,6C10.3,6 11,6.7 11,7.5C11,8.3 10.3,9 9.5,9C8.7,9 8,8.3 8,7.5C8,6.7 8.7,6 9.5,6M14.5,6C15.3,6 16,6.7 16,7.5C16,8.3 15.3,9 14.5,9C13.7,9 13,8.3 13,7.5C13,6.7 13.7,6 14.5,6M17.5,10C18.3,10 19,10.7 19,11.5C19,12.3 18.3,13 17.5,13C16.7,13 16,12.3 16,11.5C16,10.7 16.7,10 17.5,10Z";var P6="M14,19H18V5H14M6,19H10V5H6V19Z";var B6="M15,16H13V8H15M11,16H9V8H11M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",D6="M13,16V8H15V16H13M9,16V8H11V16H9M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";var E6="M19,11H11V17H19V11M23,19V5C23,3.88 22.1,3 21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19M21,19H3V4.97H21V19Z";var F6="M8,5.14V19.14L19,12.14L8,5.14Z";var N6="M10,16.5V7.5L16,12M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",I6="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z";var $6="M3,5V19L11,12M13,19H16V5H13M18,5V19H21V5";var U6="M4,2C2.89,2 2,2.89 2,4V20C2,21.11 2.89,22 4,22H20C21.11,22 22,21.11 22,20V4C22,2.89 21.11,2 20,2H4M8.56,6H12.06L15.5,12L12.06,18H8.56L12,12L8.56,6Z";var W6="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",G6="M17,13H13V17H11V13H7V11H11V7H13V11H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";var z6="M17,13H13V17H11V13H7V11H11V7H13V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var q6="M7,22H4.75C4.75,22 4,22 3.81,20.65L2.04,3.81L2,3.5C2,2.67 2.9,2 4,2C5.1,2 6,2.67 6,3.5C6,2.67 6.9,2 8,2C9.1,2 10,2.67 10,3.5C10,2.67 10.9,2 12,2C13.09,2 14,2.66 14,3.5V3.5C14,2.67 14.9,2 16,2C17.1,2 18,2.67 18,3.5C18,2.67 18.9,2 20,2C21.1,2 22,2.67 22,3.5L21.96,3.81L20.19,20.65C20,22 19.25,22 19.25,22H17L16.5,22H13.75L10.25,22H7.5L7,22M17.85,4.93C17.55,4.39 16.84,4 16,4C15.19,4 14.36,4.36 14,4.87L13.78,20H16.66L17.85,4.93M10,4.87C9.64,4.36 8.81,4 8,4C7.16,4 6.45,4.39 6.15,4.93L7.34,20H10.22L10,4.87Z";var K6="M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",Q6="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19M13,17H11V7H13V17Z",j6="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19Z",X6="M11,3H13V21H11V3Z";var Y6="M18.73,18C15.4,21.69 9.71,22 6,18.64C2.33,15.31 2.04,9.62 5.37,5.93C6.9,4.25 9,3.2 11.27,3C7.96,6.7 8.27,12.39 12,15.71C13.63,17.19 15.78,18 18,18C18.25,18 18.5,18 18.73,18Z";var J6="M13,3H11V13H13V3M17.83,5.17L16.41,6.59C18.05,7.91 19,9.9 19,12A7,7 0 0,1 12,19C8.14,19 5,15.88 5,12C5,9.91 5.95,7.91 7.58,6.58L6.17,5.17C2.38,8.39 1.92,14.07 5.14,17.86C8.36,21.64 14.04,22.1 17.83,18.88C19.85,17.17 21,14.65 21,12C21,9.37 19.84,6.87 17.83,5.17Z";var C8="M16,6C14.87,6 13.77,6.35 12.84,7H4C2.89,7 2,7.89 2,9V15C2,16.11 2.89,17 4,17H5V18A1,1 0 0,0 6,19H8A1,1 0 0,0 9,18V17H15V18A1,1 0 0,0 16,19H18A1,1 0 0,0 19,18V17H20C21.11,17 22,16.11 22,15V9C22,7.89 21.11,7 20,7H19.15C18.23,6.35 17.13,6 16,6M16,7.5A3.5,3.5 0 0,1 19.5,11A3.5,3.5 0 0,1 16,14.5A3.5,3.5 0 0,1 12.5,11A3.5,3.5 0 0,1 16,7.5M4,9H8V10H4V9M16,9A2,2 0 0,0 14,11A2,2 0 0,0 16,13A2,2 0 0,0 18,11A2,2 0 0,0 16,9M4,11H8V12H4V11M4,13H8V14H4V13Z";var H8="M4,2A1,1 0 0,0 3,3V4A1,1 0 0,0 4,5H5V14H11V16.59L6.79,20.79L8.21,22.21L11,19.41V22H13V19.41L15.79,22.21L17.21,20.79L13,16.59V14H19V5H20A1,1 0 0,0 21,4V3A1,1 0 0,0 20,2H4Z";var V8="M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z";var e8="M20,6A2,2 0 0,1 22,8V20A2,2 0 0,1 20,22H4A2,2 0 0,1 2,20V8C2,7.15 2.53,6.42 3.28,6.13L15.71,1L16.47,2.83L8.83,6H20M20,8H4V12H16V10H18V12H20V8M7,14A3,3 0 0,0 4,17A3,3 0 0,0 7,20A3,3 0 0,0 10,17A3,3 0 0,0 7,14Z";var L8="M12,10A2,2 0 0,1 14,12C14,12.5 13.82,12.94 13.53,13.29L16.7,22H14.57L12,14.93L9.43,22H7.3L10.47,13.29C10.18,12.94 10,12.5 10,12A2,2 0 0,1 12,10M12,8A4,4 0 0,0 8,12C8,12.5 8.1,13 8.28,13.46L7.4,15.86C6.53,14.81 6,13.47 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12C18,13.47 17.47,14.81 16.6,15.86L15.72,13.46C15.9,13 16,12.5 16,12A4,4 0 0,0 12,8M12,4A8,8 0 0,0 4,12C4,14.36 5,16.5 6.64,17.94L5.92,19.94C3.54,18.11 2,15.23 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12C22,15.23 20.46,18.11 18.08,19.94L17.36,17.94C19,16.5 20,14.36 20,12A8,8 0 0,0 12,4Z";var r8="M19,12C19,15.86 15.86,19 12,19C8.14,19 5,15.86 5,12C5,8.14 8.14,5 12,5C15.86,5 19,8.14 19,12Z";var t8="M12.5,5A7.5,7.5 0 0,0 5,12.5A7.5,7.5 0 0,0 12.5,20A7.5,7.5 0 0,0 20,12.5A7.5,7.5 0 0,0 12.5,5M7,10H9A1,1 0 0,1 10,11V12C10,12.5 9.62,12.9 9.14,12.97L10.31,15H9.15L8,13V15H7M12,10H14V11H12V12H14V13H12V14H14V15H12A1,1 0 0,1 11,14V11A1,1 0 0,1 12,10M16,10H18V11H16V14H18V15H16A1,1 0 0,1 15,14V11A1,1 0 0,1 16,10M8,11V12H9V11";var i8="M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z";var o8="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z";var M8="M2 12C2 16.97 6.03 21 11 21C13.39 21 15.68 20.06 17.4 18.4L15.9 16.9C14.63 18.25 12.86 19 11 19C4.76 19 1.64 11.46 6.05 7.05C10.46 2.64 18 5.77 18 12H15L19 16H19.1L23 12H20C20 7.03 15.97 3 11 3C6.03 3 2 7.03 2 12Z";var a8="M12,0C8.96,0 6.21,1.23 4.22,3.22L5.63,4.63C7.26,3 9.5,2 12,2C14.5,2 16.74,3 18.36,4.64L19.77,3.23C17.79,1.23 15.04,0 12,0M7.05,6.05L8.46,7.46C9.37,6.56 10.62,6 12,6C13.38,6 14.63,6.56 15.54,7.46L16.95,6.05C15.68,4.78 13.93,4 12,4C10.07,4 8.32,4.78 7.05,6.05M12,15A2,2 0 0,1 10,13A2,2 0 0,1 12,11A2,2 0 0,1 14,13A2,2 0 0,1 12,15M15,9H9A1,1 0 0,0 8,10V22A1,1 0 0,0 9,23H15A1,1 0 0,0 16,22V10A1,1 0 0,0 15,9Z";var n8="M2,5.27L3.28,4L21,21.72L19.73,23L16,19.27V22A1,1 0 0,1 15,23H9C8.46,23 8,22.55 8,22V11.27L2,5.27M12,0C15.05,0 17.8,1.23 19.77,3.23L18.36,4.64C16.75,3 14.5,2 12,2C9.72,2 7.64,2.85 6.06,4.24L4.64,2.82C6.59,1.07 9.17,0 12,0M12,4C13.94,4 15.69,4.78 16.95,6.05L15.55,7.46C14.64,6.56 13.39,6 12,6C10.83,6 9.76,6.4 8.9,7.08L7.5,5.66C8.7,4.62 10.28,4 12,4M15,9C15.56,9 16,9.45 16,10V14.18L13.5,11.69L13.31,11.5L10.82,9H15M10.03,13.3C10.16,14.16 10.84,14.85 11.71,15L10.03,13.3Z",d8="M9,2C7.89,2 7,2.89 7,4V20C7,21.11 7.89,22 9,22H15C16.11,22 17,21.11 17,20V4C17,2.89 16.11,2 15,2H13V4H11V2H9M11,6H13V8H15V10H13V12H11V10H9V8H11V6M9,14H11V16H9V14M13,14H15V16H13V14M9,18H11V20H9V18M13,18H15V20H13V18Z";var A8="M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z";var s8="M13,15V9H12L10,10V11H11.5V15M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z";var l8="M11.5,12L20,18V6M11,18V6L2.5,12L11,18Z";var m8="M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2Z";var p8="M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2M12 4L20 12L12 20L4 12Z";var c8="M12,2A2,2 0 0,1 14,4C14,4.74 13.6,5.39 13,5.73V7H14A7,7 0 0,1 21,14H22A1,1 0 0,1 23,15V18A1,1 0 0,1 22,19H21V20A2,2 0 0,1 19,22H5A2,2 0 0,1 3,20V19H2A1,1 0 0,1 1,18V15A1,1 0 0,1 2,14H3A7,7 0 0,1 10,7H11V5.73C10.4,5.39 10,4.74 10,4A2,2 0 0,1 12,2M7.5,13A2.5,2.5 0 0,0 5,15.5A2.5,2.5 0 0,0 7.5,18A2.5,2.5 0 0,0 10,15.5A2.5,2.5 0 0,0 7.5,13M16.5,13A2.5,2.5 0 0,0 14,15.5A2.5,2.5 0 0,0 16.5,18A2.5,2.5 0 0,0 19,15.5A2.5,2.5 0 0,0 16.5,13Z";var v8="M12,2C14.65,2 17.19,3.06 19.07,4.93L17.65,6.35C16.15,4.85 14.12,4 12,4C9.88,4 7.84,4.84 6.35,6.35L4.93,4.93C6.81,3.06 9.35,2 12,2M3.66,6.5L5.11,7.94C4.39,9.17 4,10.57 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,10.57 19.61,9.17 18.88,7.94L20.34,6.5C21.42,8.12 22,10.04 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12C2,10.04 2.58,8.12 3.66,6.5M12,6A6,6 0 0,1 18,12C18,13.59 17.37,15.12 16.24,16.24L14.83,14.83C14.08,15.58 13.06,16 12,16C10.94,16 9.92,15.58 9.17,14.83L7.76,16.24C6.63,15.12 6,13.59 6,12A6,6 0 0,1 12,6M12,8A1,1 0 0,0 11,9A1,1 0 0,0 12,10A1,1 0 0,0 13,9A1,1 0 0,0 12,8Z";var u8="M5,3A2,2 0 0,0 3,5V7H5V5H19V7H21V5A2,2 0 0,0 19,3H5M8,7V9H16V7H8M3,9V12A9,9 0 0,0 12,21A9,9 0 0,0 21,12V9H19V12A7,7 0 0,1 12,19A7,7 0 0,1 5,12V9H3M12,12A2.5,2.5 0 0,0 9.5,14.5A2.5,2.5 0 0,0 12,17A2.5,2.5 0 0,0 14.5,14.5A2.5,2.5 0 0,0 12,12Z";var x8="M20.2,5.9L21,5.1C19.6,3.7 17.8,3 16,3C14.2,3 12.4,3.7 11,5.1L11.8,5.9C13,4.8 14.5,4.2 16,4.2C17.5,4.2 19,4.8 20.2,5.9M19.3,6.7C18.4,5.8 17.2,5.3 16,5.3C14.8,5.3 13.6,5.8 12.7,6.7L13.5,7.5C14.2,6.8 15.1,6.5 16,6.5C16.9,6.5 17.8,6.8 18.5,7.5L19.3,6.7M19,13H17V9H15V13H5A2,2 0 0,0 3,15V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V15A2,2 0 0,0 19,13M8,18H6V16H8V18M11.5,18H9.5V16H11.5V18M15,18H13V16H15V18Z";var h8="M13.5,5.5C14.59,5.5 15.5,4.58 15.5,3.5C15.5,2.38 14.59,1.5 13.5,1.5C12.39,1.5 11.5,2.38 11.5,3.5C11.5,4.58 12.39,5.5 13.5,5.5M9.89,19.38L10.89,15L13,17V23H15V15.5L12.89,13.5L13.5,10.5C14.79,12 16.79,13 19,13V11C17.09,11 15.5,10 14.69,8.58L13.69,7C13.29,6.38 12.69,6 12,6C11.69,6 11.5,6.08 11.19,6.08L6,8.28V13H8V9.58L9.79,8.88L8.19,17L3.29,16L2.89,18L9.89,19.38Z";var Z8="M4,18V21H7V18H17V21H20V15H4V18M19,10H22V13H19V10M2,10H5V13H2V10M17,13H7V5A2,2 0 0,1 9,3H15A2,2 0 0,1 17,5V13Z";var S8="M15,5V12H9V5H15M15,3H9A2,2 0 0,0 7,5V14H17V5A2,2 0 0,0 15,3M22,10H19V13H22V10M5,10H2V13H5V10M20,15H4V21H6V17H18V21H20V15Z";var g8="M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M5,3V5H7V3H5M5,11V13H7V11H5M5,19V21H7V19H5Z";var f8="M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z";var b8="M11,13H13V16H16V11H18L12,6L6,11H8V16H11V13M12,1L21,5V11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1Z",y8="M21,11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1L21,5V11M12,21C15.75,20 19,15.54 19,11.22V6.3L12,3.18L5,6.3V11.22C5,15.54 8.25,20 12,21M11,14H13V17H16V12H18L12,7L6,12H8V17H11V14";var w8="M14.83,13.41L13.42,14.82L16.55,17.95L14.5,20H20V14.5L17.96,16.54L14.83,13.41M14.5,4L16.54,6.04L4,18.59L5.41,20L17.96,7.46L20,9.5V4M10.59,9.17L5.41,4L4,5.41L9.17,10.58L10.59,9.17Z";var O8="M11,9H9V2H7V9H5V2H3V9C3,11.12 4.66,12.84 6.75,12.97V22H9.25V12.97C11.34,12.84 13,11.12 13,9V2H11V9M16,6V14H18.5V22H21V2C18.24,2 16,4.24 16,6Z";var k8="M20,5V19L13,12M6,5V19H4V5M13,5V19L6,12";var _8="M4,5V19L11,12M18,5V19H20V5M11,5V19L18,12";var T8="M16,18H18V6H16M6,18L14.5,12L6,6V18Z";var R8="M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z";var P8="M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z",B8="M2,5.27L3.28,4L20,20.72L18.73,22L12.73,16H9V14L9.79,13.06L2,5.27M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M9.82,8H15V10L13.54,11.72L9.82,8M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z";var D8="M20.79,13.95L18.46,14.57L16.46,13.44V10.56L18.46,9.43L20.79,10.05L21.31,8.12L19.54,7.65L20,5.88L18.07,5.36L17.45,7.69L15.45,8.82L13,7.38V5.12L14.71,3.41L13.29,2L12,3.29L10.71,2L9.29,3.41L11,5.12V7.38L8.5,8.82L6.5,7.69L5.92,5.36L4,5.88L4.47,7.65L2.7,8.12L3.22,10.05L5.55,9.43L7.55,10.56V13.45L5.55,14.58L3.22,13.96L2.7,15.89L4.47,16.36L4,18.12L5.93,18.64L6.55,16.31L8.55,15.18L11,16.62V18.88L9.29,20.59L10.71,22L12,20.71L13.29,22L14.7,20.59L13,18.88V16.62L15.5,15.17L17.5,16.3L18.12,18.63L20,18.12L19.53,16.35L21.3,15.88L20.79,13.95M9.5,10.56L12,9.11L14.5,10.56V13.44L12,14.89L9.5,13.44V10.56Z";var E8="M12.5 7C12.5 5.89 13.39 5 14.5 5H18C19.1 5 20 5.9 20 7V9.16C18.84 9.57 18 10.67 18 11.97V14H12.5V7M6 11.96V14H11.5V7C11.5 5.89 10.61 5 9.5 5H6C4.9 5 4 5.9 4 7V9.15C5.16 9.56 6 10.67 6 11.96M20.66 10.03C19.68 10.19 19 11.12 19 12.12V15H5V12C5 10.9 4.11 10 3 10S1 10.9 1 12V17C1 18.1 1.9 19 3 19V21H5V19H19V21H21V19C22.1 19 23 18.1 23 17V12C23 10.79 21.91 9.82 20.66 10.03Z",F8="M21 9V7C21 5.35 19.65 4 18 4H14C13.23 4 12.53 4.3 12 4.78C11.47 4.3 10.77 4 10 4H6C4.35 4 3 5.35 3 7V9C1.35 9 0 10.35 0 12V17C0 18.65 1.35 20 3 20V22H5V20H19V22H21V20C22.65 20 24 18.65 24 17V12C24 10.35 22.65 9 21 9M14 6H18C18.55 6 19 6.45 19 7V9.78C18.39 10.33 18 11.12 18 12V14H13V7C13 6.45 13.45 6 14 6M5 7C5 6.45 5.45 6 6 6H10C10.55 6 11 6.45 11 7V14H6V12C6 11.12 5.61 10.33 5 9.78V7M22 17C22 17.55 21.55 18 21 18H3C2.45 18 2 17.55 2 17V12C2 11.45 2.45 11 3 11S4 11.45 4 12V16H20V12C20 11.45 20.45 11 21 11S22 11.45 22 12V17Z";var N8="M9.5,4.27C10.88,4.53 12.9,5.14 14,5.5C16.75,6.45 17.69,7.63 17.69,10.29C17.69,12.89 16.09,13.87 14.05,12.89V8.05C14.05,7.5 13.95,6.97 13.41,6.82C13,6.69 12.76,7.07 12.76,7.63V19.73L9.5,18.69V4.27M13.37,17.62L18.62,15.75C19.22,15.54 19.31,15.24 18.83,15.08C18.34,14.92 17.47,14.97 16.87,15.18L13.37,16.41V14.45L13.58,14.38C13.58,14.38 14.59,14 16,13.87C17.43,13.71 19.17,13.89 20.53,14.4C22.07,14.89 22.25,15.61 21.86,16.1C21.46,16.6 20.5,16.95 20.5,16.95L13.37,19.5V17.62M3.5,17.42C1.93,17 1.66,16.05 2.38,15.5C3.05,15 4.18,14.65 4.18,14.65L8.86,13V14.88L5.5,16.09C4.9,16.3 4.81,16.6 5.29,16.76C5.77,16.92 6.65,16.88 7.24,16.66L8.86,16.08V17.77L8.54,17.83C6.92,18.09 5.2,18 3.5,17.42Z",I8="M18 21L14 17H17V7H14L18 3L22 7H19V17H22M2 19V17H12V19M2 13V11H9V13M2 7V5H6V7H2Z";var $8="M4 8C2.9 8 2 8.9 2 10V14C2 15.11 2.9 16 4 16H20C21.11 16 22 15.11 22 14V10C22 8.9 21.11 8 20 8M9 10C10.11 10 11 10.9 11 12C11 13.11 10.11 14 9 14C7.9 14 7 13.11 7 12C7 10.9 7.9 10 9 10M15 10C16.11 10 17 10.9 17 12C17 13.11 16.11 14 15 14C13.9 14 13 13.11 13 12C13 10.9 13.9 10 15 10M5 11C5.55 11 6 11.45 6 12C6 12.55 5.55 13 5 13C4.45 13 4 12.55 4 12C4 11.45 4.45 11 5 11M9 11C8.45 11 8 11.45 8 12C8 12.55 8.45 13 9 13C9.55 13 10 12.55 10 12C10 11.45 9.55 11 9 11M15 11C14.45 11 14 11.45 14 12C14 12.55 14.45 13 15 13C15.55 13 16 12.55 16 12C16 11.45 15.55 11 15 11M19 11C19.55 11 20 11.45 20 12C20 12.55 19.55 13 19 13C18.45 13 18 12.55 18 12C18 11.45 18.45 11 19 11Z";var U8="M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12M12,20A5,5 0 0,1 7,15A5,5 0 0,1 12,10A5,5 0 0,1 17,15A5,5 0 0,1 12,20M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8C10.89,8 10,7.1 10,6C10,4.89 10.89,4 12,4M17,2H7C5.89,2 5,2.89 5,4V20A2,2 0 0,0 7,22H17A2,2 0 0,0 19,20V4C19,2.89 18.1,2 17,2Z";var W8="M2,5.27L3.28,4L21,21.72L19.73,23L18.27,21.54C17.93,21.83 17.5,22 17,22H7C5.89,22 5,21.1 5,20V8.27L2,5.27M12,18A3,3 0 0,1 9,15C9,14.24 9.28,13.54 9.75,13L8.33,11.6C7.5,12.5 7,13.69 7,15A5,5 0 0,0 12,20C13.31,20 14.5,19.5 15.4,18.67L14,17.25C13.45,17.72 12.76,18 12,18M17,15A5,5 0 0,0 12,10H11.82L5.12,3.3C5.41,2.54 6.14,2 7,2H17A2,2 0 0,1 19,4V17.18L17,15.17V15M12,4C10.89,4 10,4.89 10,6A2,2 0 0,0 12,8A2,2 0 0,0 14,6C14,4.89 13.1,4 12,4Z";var G8="M20.07,19.07L18.66,17.66C20.11,16.22 21,14.21 21,12C21,9.78 20.11,7.78 18.66,6.34L20.07,4.93C21.88,6.74 23,9.24 23,12C23,14.76 21.88,17.26 20.07,19.07M17.24,16.24L15.83,14.83C16.55,14.11 17,13.11 17,12C17,10.89 16.55,9.89 15.83,9.17L17.24,7.76C18.33,8.85 19,10.35 19,12C19,13.65 18.33,15.15 17.24,16.24M4,3H12A2,2 0 0,1 14,5V19A2,2 0 0,1 12,21H4A2,2 0 0,1 2,19V5A2,2 0 0,1 4,3M8,5A2,2 0 0,0 6,7A2,2 0 0,0 8,9A2,2 0 0,0 10,7A2,2 0 0,0 8,5M8,11A4,4 0 0,0 4,15A4,4 0 0,0 8,19A4,4 0 0,0 12,15A4,4 0 0,0 8,11M8,13A2,2 0 0,1 10,15A2,2 0 0,1 8,17A2,2 0 0,1 6,15A2,2 0 0,1 8,13Z";var z8="M17.9,10.9C14.7,9 9.35,8.8 6.3,9.75C5.8,9.9 5.3,9.6 5.15,9.15C5,8.65 5.3,8.15 5.75,8C9.3,6.95 15.15,7.15 18.85,9.35C19.3,9.6 19.45,10.2 19.2,10.65C18.95,11 18.35,11.15 17.9,10.9M17.8,13.7C17.55,14.05 17.1,14.2 16.75,13.95C14.05,12.3 9.95,11.8 6.8,12.8C6.4,12.9 5.95,12.7 5.85,12.3C5.75,11.9 5.95,11.45 6.35,11.35C10,10.25 14.5,10.8 17.6,12.7C17.9,12.85 18.05,13.35 17.8,13.7M16.6,16.45C16.4,16.75 16.05,16.85 15.75,16.65C13.4,15.2 10.45,14.9 6.95,15.7C6.6,15.8 6.3,15.55 6.2,15.25C6.1,14.9 6.35,14.6 6.65,14.5C10.45,13.65 13.75,14 16.35,15.6C16.7,15.75 16.75,16.15 16.6,16.45M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var q8="M3,3V21H21V3";var K8="M3,3H21V21H3V3M5,5V19H19V5H5Z";var Q8="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z";var j8="M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z";var X8="M18,18H6V6H18V18Z",Y8="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M9,9H15V15H9",J8="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4M9,9V15H15V9";var CC="M6,14H8L11,17H9L6,14M4,4H5V3A1,1 0 0,1 6,2H10A1,1 0 0,1 11,3V4H13V3A1,1 0 0,1 14,2H18A1,1 0 0,1 19,3V4H20A2,2 0 0,1 22,6V19A2,2 0 0,1 20,21V22H17V21H7V22H4V21A2,2 0 0,1 2,19V6A2,2 0 0,1 4,4M18,7A1,1 0 0,1 19,8A1,1 0 0,1 18,9A1,1 0 0,1 17,8A1,1 0 0,1 18,7M14,7A1,1 0 0,1 15,8A1,1 0 0,1 14,9A1,1 0 0,1 13,8A1,1 0 0,1 14,7M20,6H4V10H20V6M4,19H20V12H4V19M6,7A1,1 0 0,1 7,8A1,1 0 0,1 6,9A1,1 0 0,1 5,8A1,1 0 0,1 6,7M13,14H15L18,17H16L13,14Z";var HC="M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,12H8V14H4V12M14,18H4V16H14V18M20,18H16V16H20V18M20,14H10V12H20V14Z",VC="M20,4A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20M20,18V6H4V18H20M6,10H8V12H6V10M6,14H14V16H6V14M16,14H18V16H16V14M10,10H18V12H10V10Z";var eC="M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M7.76,16.24L6.35,17.65C4.78,16.1 4,14.05 4,12C4,9.95 4.78,7.9 6.34,6.34L7.75,7.75C6.59,8.93 6,10.46 6,12C6,13.54 6.59,15.07 7.76,16.24M12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16M17.66,17.66L16.25,16.25C17.41,15.07 18,13.54 18,12C18,10.46 17.41,8.93 16.24,7.76L17.65,6.35C19.22,7.9 20,9.95 20,12C20,14.05 19.22,16.1 17.66,17.66M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10Z";var LC="M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z";var rC="M19,18H5V6H19M21,4H3C1.89,4 1,4.89 1,6V18A2,2 0 0,0 3,20H21A2,2 0 0,0 23,18V6C23,4.89 22.1,4 21,4Z";var tC="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z";var iC="M8.16,3L6.75,4.41L9.34,7H4C2.89,7 2,7.89 2,9V19C2,20.11 2.89,21 4,21H20C21.11,21 22,20.11 22,19V9C22,7.89 21.11,7 20,7H14.66L17.25,4.41L15.84,3L12,6.84L8.16,3M4,9H17V19H4V9M19.5,9A1,1 0 0,1 20.5,10A1,1 0 0,1 19.5,11A1,1 0 0,1 18.5,10A1,1 0 0,1 19.5,9M19.5,12A1,1 0 0,1 20.5,13A1,1 0 0,1 19.5,14A1,1 0 0,1 18.5,13A1,1 0 0,1 19.5,12Z";var oC="M21,17V5H3V17H21M21,3A2,2 0 0,1 23,5V17A2,2 0 0,1 21,19H16V21H8V19H3A2,2 0 0,1 1,17V5A2,2 0 0,1 3,3H21M5,7H11V11H5V7M5,13H11V15H5V13M13,7H19V9H13V7M13,11H19V15H13V11Z",MC="M0.5,2.77L1.78,1.5L21,20.72L19.73,22L16.73,19H16V21H8V19H3A2,2 0 0,1 1,17V5C1,4.5 1.17,4.07 1.46,3.73L0.5,2.77M21,17V5H7.82L5.82,3H21A2,2 0 0,1 23,5V17C23,17.85 22.45,18.59 21.7,18.87L19.82,17H21M3,17H14.73L3,5.27V17Z";var aC="M21,3H3C1.89,3 1,3.89 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5C23,3.89 22.1,3 21,3M21,17H3V5H21M16,11L9,15V7";var nC="M21,6V8H3V6H21M3,18H12V16H3V18M3,13H21V11H3V13Z";var dC="M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z";var AC="M16.95,16.95L14.83,14.83C15.55,14.1 16,13.1 16,12C16,11.26 15.79,10.57 15.43,10L17.6,7.81C18.5,9 19,10.43 19,12C19,13.93 18.22,15.68 16.95,16.95M12,5C13.57,5 15,5.5 16.19,6.4L14,8.56C13.43,8.21 12.74,8 12,8A4,4 0 0,0 8,12C8,13.1 8.45,14.1 9.17,14.83L7.05,16.95C5.78,15.68 5,13.93 5,12A7,7 0 0,1 12,5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z";var sC="M19.03 7.39L20.45 5.97C20 5.46 19.55 5 19.04 4.56L17.62 6C16.07 4.74 14.12 4 12 4C7.03 4 3 8.03 3 13S7.03 22 12 22C17 22 21 17.97 21 13C21 10.88 20.26 8.93 19.03 7.39M13 14H11V7H13V14M15 1H9V3H15V1Z";var lC="M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z";var mC="M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M17,15A3,3 0 0,1 14,12A3,3 0 0,1 17,9A3,3 0 0,1 20,12A3,3 0 0,1 17,15Z",pC="M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M7,15A3,3 0 0,1 4,12A3,3 0 0,1 7,9A3,3 0 0,1 10,12A3,3 0 0,1 7,15Z";var cC="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z";var vC="M1,21H23L12,2";var uC="M12,2L1,21H23M12,6L19.53,19H4.47";var xC="M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z";var hC="M7 3H5V9H7V3M19 3H17V13H19V3M3 13H5V21H7V13H9V11H3V13M15 7H13V3H11V7H9V9H15V7M11 21H13V11H11V21M15 15V17H17V21H19V17H21V15H15Z";var ZC="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z";var SC="M12,2A9,9 0 0,1 21,11H13V19A3,3 0 0,1 10,22A3,3 0 0,1 7,19V18H9V19A1,1 0 0,0 10,20A1,1 0 0,0 11,19V11H3A9,9 0 0,1 12,2Z";var gC="M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z";var fC="M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.78,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13A2,2 0 0,0 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20A2.2,2.2 0 0,0 12,22.2A2.2,2.2 0 0,0 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16A2,2 0 0,0 18,13V11H19V7H15Z";var bC="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z";var yC="M12,5A7,7 0 0,0 5,12H7A5,5 0 0,1 12,7A5,5 0 0,1 17,12H19A7,7 0 0,0 12,5M13,14.29C13.88,13.9 14.5,13.03 14.5,12A2.5,2.5 0 0,0 12,9.5A2.5,2.5 0 0,0 9.5,12C9.5,13 10.12,13.9 11,14.29V17.59L7.59,21L9,22.41L12,19.41L15,22.41L16.41,21L13,17.59V14.29M12,1A11,11 0 0,0 1,12H3A9,9 0 0,1 12,3A9,9 0 0,1 21,12H23A11,11 0 0,0 12,1Z",wC="M5,2A1,1 0 0,0 4,1A1,1 0 0,0 3,2V6H1V12H7V6H5V2M9,16C9,17.3 9.84,18.4 11,18.82V23H13V18.82C14.16,18.41 15,17.31 15,16V14H9V16M1,16C1,17.3 1.84,18.4 3,18.82V23H5V18.82C6.16,18.4 7,17.3 7,16V14H1V16M21,6V2A1,1 0 0,0 20,1A1,1 0 0,0 19,2V6H17V12H23V6H21M13,2A1,1 0 0,0 12,1A1,1 0 0,0 11,2V6H9V12H15V6H13V2M17,16C17,17.3 17.84,18.4 19,18.82V23H21V18.82C22.16,18.41 23,17.31 23,16V14H17V16Z",OC="M18,7V4A2,2 0 0,0 16,2H8A2,2 0 0,0 6,4V7H5V13L8,19V22H16V19L19,13V7H18M8,4H16V7H14V5H13V7H11V5H10V7H8V4Z";var kC="M8,11.5A1.5,1.5 0 0,0 6.5,10A1.5,1.5 0 0,0 5,11.5A1.5,1.5 0 0,0 6.5,13A1.5,1.5 0 0,0 8,11.5M15,6.5A1.5,1.5 0 0,0 13.5,5H10.5A1.5,1.5 0 0,0 9,6.5A1.5,1.5 0 0,0 10.5,8H13.5A1.5,1.5 0 0,0 15,6.5M8.5,15A1.5,1.5 0 0,0 7,16.5A1.5,1.5 0 0,0 8.5,18A1.5,1.5 0 0,0 10,16.5A1.5,1.5 0 0,0 8.5,15M12,1A11,11 0 0,0 1,12A11,11 0 0,0 12,23A11,11 0 0,0 23,12A11,11 0 0,0 12,1M12,21C7.04,21 3,16.96 3,12C3,7.04 7.04,3 12,3C16.96,3 21,7.04 21,12C21,16.96 16.96,21 12,21M17.5,10A1.5,1.5 0 0,0 16,11.5A1.5,1.5 0 0,0 17.5,13A1.5,1.5 0 0,0 19,11.5A1.5,1.5 0 0,0 17.5,10M15.5,15A1.5,1.5 0 0,0 14,16.5A1.5,1.5 0 0,0 15.5,18A1.5,1.5 0 0,0 17,16.5A1.5,1.5 0 0,0 15.5,15Z";var _C="M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16C16.2,18 16.39,17.92 16.54,17.82L19.73,21L21,19.73M21,6.5L17,10.5V7A1,1 0 0,0 16,6H9.82L21,17.18V6.5Z";var TC="M18,14.5V11A1,1 0 0,0 17,10H16C18.24,8.39 18.76,5.27 17.15,3C15.54,0.78 12.42,0.26 10.17,1.87C9.5,2.35 8.96,3 8.6,3.73C6.25,2.28 3.17,3 1.72,5.37C0.28,7.72 1,10.8 3.36,12.25C3.57,12.37 3.78,12.5 4,12.58V21A1,1 0 0,0 5,22H17A1,1 0 0,0 18,21V17.5L22,21.5V10.5L18,14.5M13,4A2,2 0 0,1 15,6A2,2 0 0,1 13,8A2,2 0 0,1 11,6A2,2 0 0,1 13,4M6,6A2,2 0 0,1 8,8A2,2 0 0,1 6,10A2,2 0 0,1 4,8A2,2 0 0,1 6,6Z";var RC="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z",PC="M7,9V15H11L16,20V4L11,9H7Z",BC="M5,9V15H9L14,20V4L9,9M18.5,12C18.5,10.23 17.5,8.71 16,7.97V16C17.5,15.29 18.5,13.76 18.5,12Z",DC="M3,9H7L12,4V20L7,15H3V9M14,11H22V13H14V11Z",EC="M3,9H7L12,4V20L7,15H3V9M16.59,12L14,9.41L15.41,8L18,10.59L20.59,8L22,9.41L19.41,12L22,14.59L20.59,16L18,13.41L15.41,16L14,14.59L16.59,12Z",FC="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z",NC="M3,9H7L12,4V20L7,15H3V9M14,11H17V8H19V11H22V13H19V16H17V13H14V11Z";var IC="M5.64,3.64L21.36,19.36L19.95,20.78L16,16.83V20L11,15H7V9H8.17L4.22,5.05L5.64,3.64M16,4V11.17L12.41,7.58L16,4Z";var $C="M14.12,10H19V8.2H15.38L13.38,4.87C13.08,4.37 12.54,4.03 11.92,4.03C11.74,4.03 11.58,4.06 11.42,4.11L6,5.8V11H7.8V7.33L9.91,6.67L6,22H7.8L10.67,13.89L13,17V22H14.8V15.59L12.31,11.05L13.04,8.18M14,3.8C15,3.8 15.8,3 15.8,2C15.8,1 15,0.2 14,0.2C13,0.2 12.2,1 12.2,2C12.2,3 13,3.8 14,3.8Z";var UC="M14.83,11.17C16.39,12.73 16.39,15.27 14.83,16.83C13.27,18.39 10.73,18.39 9.17,16.83L14.83,11.17M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M7,4A1,1 0 0,0 6,5A1,1 0 0,0 7,6A1,1 0 0,0 8,5A1,1 0 0,0 7,4M10,4A1,1 0 0,0 9,5A1,1 0 0,0 10,6A1,1 0 0,0 11,5A1,1 0 0,0 10,4M12,8A6,6 0 0,0 6,14A6,6 0 0,0 12,20A6,6 0 0,0 18,14A6,6 0 0,0 12,8Z";var WC="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z";var GC="M20.84 22.73L16.29 18.18C15.2 19.3 13.69 20 12 20C8.69 20 6 17.31 6 14C6 12.67 6.67 11.03 7.55 9.44L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M18 14C18 10 12 3.25 12 3.25S10.84 4.55 9.55 6.35L17.95 14.75C18 14.5 18 14.25 18 14Z";var zC="M6,19A5,5 0 0,1 1,14A5,5 0 0,1 6,9C7,6.65 9.3,5 12,5C15.43,5 18.24,7.66 18.5,11.03L19,11A4,4 0 0,1 23,15A4,4 0 0,1 19,19H6M19,13H17V12A5,5 0 0,0 12,7C9.5,7 7.45,8.82 7.06,11.19C6.73,11.07 6.37,11 6,11A3,3 0 0,0 3,14A3,3 0 0,0 6,17H19A2,2 0 0,0 21,15A2,2 0 0,0 19,13Z";var qC="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z";var KC="M6,14.03A1,1 0 0,1 7,15.03C7,15.58 6.55,16.03 6,16.03C3.24,16.03 1,13.79 1,11.03C1,8.27 3.24,6.03 6,6.03C7,3.68 9.3,2.03 12,2.03C15.43,2.03 18.24,4.69 18.5,8.06L19,8.03A4,4 0 0,1 23,12.03C23,14.23 21.21,16.03 19,16.03H18C17.45,16.03 17,15.58 17,15.03C17,14.47 17.45,14.03 18,14.03H19A2,2 0 0,0 21,12.03A2,2 0 0,0 19,10.03H17V9.03C17,6.27 14.76,4.03 12,4.03C9.5,4.03 7.45,5.84 7.06,8.21C6.73,8.09 6.37,8.03 6,8.03A3,3 0 0,0 3,11.03A3,3 0 0,0 6,14.03M12,14.15C12.18,14.39 12.37,14.66 12.56,14.94C13,15.56 14,17.03 14,18C14,19.11 13.1,20 12,20A2,2 0 0,1 10,18C10,17.03 11,15.56 11.44,14.94C11.63,14.66 11.82,14.4 12,14.15M12,11.03L11.5,11.59C11.5,11.59 10.65,12.55 9.79,13.81C8.93,15.06 8,16.56 8,18A4,4 0 0,0 12,22A4,4 0 0,0 16,18C16,16.56 15.07,15.06 14.21,13.81C13.35,12.55 12.5,11.59 12.5,11.59";var QC="M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z";var jC="M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z";var XC="M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z";var YC="M6,11H10V9H14V11H18V4H6V11M18,13H6V20H18V13M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2Z";var JC="M6,8H10V6H14V8H18V4H6V8M18,10H6V15H18V10M6,20H18V17H6V20M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2Z";var CH="M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9M8 12H16V14H8V12M8 15H16V17H8V15M8 18H16V20H8V18Z";var HH="M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9Z";var VH="M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z";var eH="M10,15L15.19,12L10,9V15M21.56,7.17C21.69,7.64 21.78,8.27 21.84,9.07C21.91,9.87 21.94,10.56 21.94,11.16L22,12C22,14.19 21.84,15.8 21.56,16.83C21.31,17.73 20.73,18.31 19.83,18.56C19.36,18.69 18.5,18.78 17.18,18.84C15.88,18.91 14.69,18.94 13.59,18.94L12,19C7.81,19 5.2,18.84 4.17,18.56C3.27,18.31 2.69,17.73 2.44,16.83C2.31,16.36 2.22,15.73 2.16,14.93C2.09,14.13 2.06,13.44 2.06,12.84L2,12C2,9.81 2.16,8.2 2.44,7.17C2.69,6.27 3.27,5.69 4.17,5.44C4.64,5.31 5.5,5.22 6.82,5.16C8.12,5.09 9.31,5.06 10.41,5.06L12,5C16.19,5 18.8,5.16 19.83,5.44C20.73,5.69 21.31,6.27 21.56,7.17Z";var LH="M2.5,4.5H21.5C22.34,4.5 23,5.15 23,6V17.5C23,18.35 22.34,19 21.5,19H2.5C1.65,19 1,18.35 1,17.5V6C1,5.15 1.65,4.5 2.5,4.5M9.71,8.5V15L15.42,11.7L9.71,8.5M17.25,21H6.65C6.35,21 6.15,20.8 6.15,20.5C6.15,20.2 6.35,20 6.65,20H17.35C17.65,20 17.85,20.2 17.85,20.5C17.85,20.8 17.55,21 17.25,21Z";var e5={account:r7,"account-group":t7,"air-conditioner":i7,"alarm-light":o7,album:M7,alert:a7,"alert-circle":n7,"alert-circle-outline":d7,"alert-outline":A7,"alpha-a-circle-outline":s7,"alpha-b-circle-outline":l7,"alpha-c-circle-outline":m7,amplifier:p7,apple:c7,"arrow-down":v7,"arrow-down-bold":u7,"arrow-left":x7,"arrow-left-bold":h7,"arrow-left-top":Z7,"arrow-right":S7,"arrow-right-bold":g7,"arrow-u-left-top":f7,"arrow-up":b7,"arrow-up-bold":y7,"audio-video":w7,"audio-video-off":O7,backspace:k7,bed:_7,"bed-outline":T7,bell:R7,"bell-off":P7,"bell-ring":B7,blinds:D7,"blinds-open":E7,bluetooth:F7,"bluetooth-off":N7,bookmark:I7,"bookmark-outline":$7,"brightness-1":U7,"brightness-2":W7,"brightness-3":G7,"brightness-4":z7,"brightness-5":q7,"brightness-6":K7,"brightness-7":Q7,broom:j7,camera:X7,"camera-off":Y7,cancel:J7,car:C4,"car-key":H4,cast:V4,"cast-connected":e4,"cast-off":L4,cctv:r4,"ceiling-light":t4,cellphone:i4,"cellphone-wireless":o4,check:M4,"check-bold":a4,"check-circle":n4,"check-circle-outline":d4,"chevron-double-down":A4,"chevron-double-left":s4,"chevron-double-right":l4,"chevron-double-up":m4,"chevron-down":p4,"chevron-down-circle-outline":c4,"chevron-left":v4,"chevron-right":u4,"chevron-up":x4,"chevron-up-circle-outline":h4,circle:Z4,"circle-outline":S4,clock:g4,"clock-outline":f4,close:b4,"close-circle":y4,"close-circle-outline":w4,"closed-caption":O4,"closed-caption-outline":k4,coffee:_4,"coffee-outline":T4,cog:R4,"cog-outline":P4,cogs:B4,"controller-classic":D4,"controller-classic-outline":E4,curtains:F4,"curtains-closed":N4,"desktop-tower":I4,dialpad:$4,disc:U4,"disc-player":W4,dishwasher:G4,door:z4,"door-closed":q4,"door-open":K4,doorbell:Q4,"dots-horizontal":j4,"dots-vertical":X4,"drag-vertical-variant":Y4,eye:J4,"eye-off":C9,fan:H9,"fan-off":V9,"fast-forward":e9,film:L9,filmstrip:r9,fire:t9,fireplace:i9,"fireplace-off":o9,"floor-lamp":M9,"format-color-fill":a9,fridge:n9,fullscreen:d9,"fullscreen-exit":A9,gamepad:s9,"gamepad-variant":l9,garage:m9,"garage-open":p9,"gesture-double-tap":c9,"gesture-swipe":v9,"gesture-tap":u9,"gesture-tap-button":x9,"glass-cocktail":h9,headphones:Z9,heart:S9,"heart-outline":g9,"help-circle":f9,"help-circle-outline":b9,hexagon:y9,"hexagon-outline":w9,home:O9,"home-assistant":k9,"home-automation":_9,"home-lightbulb":T9,"home-outline":R9,"home-thermometer":P9,hulu:B9,"human-greeting":D9,image:E9,"image-multiple":F9,information:N9,"information-outline":I9,"invert-colors":$9,kettle:U9,keyboard:W9,"keyboard-backspace":G9,"keyboard-return":z9,"keyboard-space":q9,kodi:K9,lamp:Q9,laptop:j9,"led-strip":X9,"led-strip-variant":Y9,lightbulb:J9,"lightbulb-group":C6,"lightbulb-group-off":H6,"lightbulb-off":V6,"lightbulb-on":e6,"lightbulb-outline":L6,lock:r6,"lock-open":t6,"lock-open-variant":i6,magnify:o6,"magnify-minus":M6,"magnify-plus":a6,menu:n6,"menu-down":d6,"menu-open":A6,"menu-up":s6,"microsoft-xbox":l6,microwave:m6,minus:p6,"minus-box":c6,"minus-circle":v6,monitor:u6,"motion-sensor":x6,movie:h6,"movie-open":Z6,"movie-roll":S6,music:g6,"music-box":f6,"music-box-outline":b6,"music-note":y6,netflix:w6,"nintendo-game-boy":O6,"nintendo-switch":k6,numeric:_6,palette:T6,"palette-outline":R6,pause:P6,"pause-circle":B6,"pause-circle-outline":D6,"picture-in-picture-bottom-right":E6,play:F6,"play-circle":N6,"play-circle-outline":I6,"play-pause":$6,plex:U6,plus:W6,"plus-box":G6,"plus-circle":z6,popcorn:q6,power:K6,"power-cycle":Q6,"power-off":j6,"power-on":X6,"power-sleep":Y6,"power-standby":J6,projector:C8,"projector-screen":H8,radiator:V8,radio:e8,"radio-tower":L8,record:r8,"record-rec":t8,redo:i8,refresh:o8,reload:M8,remote:a8,"remote-off":n8,"remote-tv":d8,repeat:A8,"repeat-once":s8,rewind:l8,rhombus:m8,"rhombus-outline":p8,robot:c8,"robot-vacuum":v8,"robot-vacuum-variant":u8,"router-wireless":x8,run:h8,seat:Z8,"seat-outline":S8,server:g8,"shield-check":f8,"shield-home":b8,"shield-home-outline":y8,shuffle:w8,"silverware-fork-knife":O8,"skip-backward":k8,"skip-forward":_8,"skip-next":T8,"skip-previous":R8,sleep:P8,"sleep-off":B8,snowflake:D8,sofa:E8,"sofa-outline":F8,"sony-playstation":N8,sort:I8,soundbar:$8,speaker:U8,"speaker-off":W8,"speaker-wireless":G8,spotify:z8,square:q8,"square-outline":K8,star:Q8,"star-outline":j8,stop:X8,"stop-circle":Y8,"stop-circle-outline":J8,stove:CC,subtitles:HC,"subtitles-outline":VC,"surround-sound":eC,sync:LC,tablet:rC,television:tC,"television-classic":iC,"television-guide":oC,"television-off":MC,"television-play":aC,text:nC,thermometer:dC,thermostat:AC,timer:sC,"timer-outline":lC,"toggle-switch":mC,"toggle-switch-off":pC,translate:cC,triangle:vC,"triangle-outline":uC,tune:xC,"tune-vertical":hC,twitch:ZC,umbrella:SC,undo:gC,usb:fC,video:bC,"video-input-antenna":yC,"video-input-component":wC,"video-input-hdmi":OC,"video-input-svideo":kC,"video-off":_C,"video-vintage":TC,"volume-high":RC,"volume-low":PC,"volume-medium":BC,"volume-minus":DC,"volume-mute":EC,"volume-off":FC,"volume-plus":NC,"volume-variant-off":IC,walk:$C,"washing-machine":UC,water:WC,"water-off":GC,"weather-cloudy":zC,"weather-night":qC,"weather-rainy":KC,"weather-sunny":QC,wifi:jC,"wifi-off":XC,"window-closed":YC,"window-open":JC,"window-shutter":CH,"window-shutter-open":HH,wrench:VH,youtube:eH,"youtube-tv":LH};var PV="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";function rH(V){let H=String(V??"").trim().replace(/^mdi:/,"");return H?e5[H]??null:null}var L5=class extends HTMLElement{constructor(){super();this._rendered=null;this._shadow=this.attachShadow({mode:"open"})}static get observedAttributes(){return["icon"]}get icon(){return this.getAttribute("icon")??""}set icon(C){C==null||C===""?this.removeAttribute("icon"):this.setAttribute("icon",String(C))}connectedCallback(){this._render()}attributeChangedCallback(){this._render()}_render(){let C=this.icon;if(this._rendered===C)return;this._rendered=C;let e=rH(C)??PV;this._shadow.innerHTML=`
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
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${e}"></path></svg>
    `}};function tH(){customElements.get("sbx-ha-icon")||customElements.define("sbx-ha-icon",L5)}var r5=class extends HTMLElement{constructor(){super(...arguments);this._value=null}get value(){return this._value??this.getAttribute("value")??""}set value(C){this._value=C==null?"":String(C),this.setAttribute("value",this._value)}},t5=class extends HTMLElement{constructor(){super();this._labelEl=null;this._valueEl=null;this._trigger=null;this._menu=null;this._label="";this._value="";this._options=[];this._connected=!1;this._onViewportChange=()=>this._placeMenu();this._observer=new MutationObserver(()=>this._syncOptions()),this._shadow=this.attachShadow({mode:"open"}),this._shadow.innerHTML=`
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
      <button class="trigger" part="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="options">
        <span class="label" part="label"></span>
        <span class="value" part="value"></span>
        <span class="caret"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5z"></path></svg></span>
      </button>
      <div class="menu" part="menu" id="options" role="listbox"></div>
    `,this._labelEl=this._shadow.querySelector(".label"),this._valueEl=this._shadow.querySelector(".value"),this._trigger=this._shadow.querySelector(".trigger"),this._menu=this._shadow.querySelector(".menu")}static get observedAttributes(){return["label","disabled"]}connectedCallback(){this._connected||(this._connected=!0,this._trigger?.addEventListener("click",()=>{this.disabled||(this.hasAttribute("open")?this._closeMenu():this._openMenu())}),this._trigger?.addEventListener("keydown",C=>{if(!this.disabled)if(C.key==="ArrowDown"||C.key==="ArrowUp"){C.preventDefault(),this.hasAttribute("open")||this._openMenu();let e=Array.from(this._menu?.querySelectorAll(".option")??[]),L=Math.max(0,this._options.findIndex(t=>t.value===this._value)),r=C.key==="ArrowDown"?Math.min(e.length-1,L+1):Math.max(0,L-1);e[r]?.focus()}else C.key==="Escape"&&this.hasAttribute("open")&&(C.preventDefault(),this._closeMenu())}),this._shadow.addEventListener("focusout",C=>{let e=C.relatedTarget;e&&this._shadow.contains(e)||this.hasAttribute("open")&&this._closeMenu()}),this._menu?.addEventListener("keydown",C=>{if(C.key==="Escape"){C.preventDefault(),this._closeMenu(),this._trigger?.focus();return}let e=Array.from(this._menu?.querySelectorAll(".option")??[]),L=e.indexOf(this._shadow.activeElement),r=C.key==="ArrowDown"?Math.min(e.length-1,L+1):C.key==="ArrowUp"?Math.max(0,L-1):C.key==="Home"?0:C.key==="End"?e.length-1:null;r!=null&&(C.preventDefault(),e[r]?.focus())})),this._observer.observe(this,{childList:!0,subtree:!0,characterData:!0}),this._renderLabel(),this._syncOptions()}disconnectedCallback(){this._observer.disconnect(),this._closeMenu()}attributeChangedCallback(C){C==="label"&&this._renderLabel(),C==="disabled"&&this._trigger&&(this._trigger.disabled=this.disabled)}get label(){return this._label||this.getAttribute("label")||""}set label(C){this._label=C==null?"":String(C),this._renderLabel()}get value(){return this._value}set value(C){this._value=C==null?"":String(C),this._renderValue(),this._renderOptions()}get disabled(){return this.hasAttribute("disabled")}set disabled(C){C?this.setAttribute("disabled",""):this.removeAttribute("disabled"),this._trigger&&(this._trigger.disabled=!!C)}_renderLabel(){this._labelEl&&(this._labelEl.textContent=this.label)}_syncOptions(){let C=this._value,e=Array.from(this.children);this._options=e.map(L=>({value:String(L.value??L.getAttribute("value")??L.textContent??""),label:(L.textContent??"").trim(),defaultLayout:L.classList.contains("sb-option-default")})),C!==""&&!this._options.some(L=>L.value===C)&&(this._value=this._options[0]?.value??""),this._renderValue(),this._renderOptions()}_renderValue(){if(!this._valueEl)return;let C=this._options.find(e=>e.value===this._value);this._valueEl.textContent=C?.label??this._value}_renderOptions(){if(this._menu){this._menu.textContent="";for(let C of this._options){let e=document.createElement("button");e.type="button",e.className="option",e.setAttribute("part",C.defaultLayout?"option default-option":"option"),e.dataset.value=C.value,e.setAttribute("role","option"),e.textContent=C.label,e.dataset.selected=String(C.value===this._value),e.setAttribute("aria-selected",e.dataset.selected),e.addEventListener("click",()=>{this._value=C.value,this._renderValue(),this._renderOptions(),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("selected",{detail:{value:this._value},bubbles:!0,composed:!0})),this._closeMenu(),this._trigger?.focus()}),this._menu.appendChild(e)}}}_openMenu(){this.setAttribute("open",""),this._trigger?.setAttribute("aria-expanded","true"),this._placeMenu(),window.addEventListener("scroll",this._onViewportChange,!0),window.addEventListener("resize",this._onViewportChange),this.dispatchEvent(new Event("opened",{bubbles:!0,composed:!0}))}_closeMenu(){window.removeEventListener("scroll",this._onViewportChange,!0),window.removeEventListener("resize",this._onViewportChange),this.hasAttribute("open")&&(this.removeAttribute("open"),this._trigger?.setAttribute("aria-expanded","false"),this.dispatchEvent(new Event("closed",{bubbles:!0,composed:!0})))}_placeMenu(){let C=this._menu,e=this._trigger;if(!C||!e||!this.hasAttribute("open"))return;C.style.left="0px",C.style.top="0px",C.style.width=`${iH}px`;let L=C.getBoundingClientRect(),r=e.getBoundingClientRect(),t=L.width>0?L.width/iH:BV(this);C.style.left=`${(r.left-L.left)/t}px`,C.style.top=`${(r.bottom+4-L.top)/t}px`,C.style.width=`${r.width/t}px`;let i=this.closest("sbx-ha-card")?.getBoundingClientRect(),o=8,a=window.innerHeight-8,l=Math.max(o,i?i.top+8:o),n=Math.min(a,i?i.bottom-8:a),s=Math.min(C.scrollHeight*t,64*t);Math.max(r.top-4-l,n-r.bottom-4)<s&&(l=o,n=a);let A=Math.max(0,n-r.bottom-4),m=Math.max(0,r.top-4-l),c=m>A;C.style.maxHeight=`${Math.min(window.innerHeight*.6,c?m:A)/t}px`,c&&(C.style.top=`${(r.top-4-L.top-C.getBoundingClientRect().height)/t}px`)}},iH=100;function BV(V){let H=V.currentCSSZoom;if(typeof H=="number"&&H>0)return H;let C=1,e=V;for(;e;){let L=parseFloat(getComputedStyle(e).zoom);Number.isFinite(L)&&L>0&&(C*=L),e=e.parentElement??e.getRootNode().host??null}return C}function oH(){customElements.get("sbx-mwc-list-item")||customElements.define("sbx-mwc-list-item",r5),customElements.get("sbx-ha-select")||customElements.define("sbx-ha-select",t5)}function MH(){L7(),tH(),oH()}var Z=V=>`\u2068${V}\u2069`,y1=Z("Sofabaton"),A2=Z("MQTT"),i5=Z("MQTT Discovery"),aH=Z("YAML"),EV=Z("Lovelace"),nH=Z("DVR"),dH=Z("A/B/C"),FV={card:{selectEntityError:`\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 ${y1}`,remoteUnavailable:`\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u063A\u064A\u0631 \u0645\u062A\u0627\u062D (\u0642\u062F \u064A\u0643\u0648\u0646 \u062A\u0637\u0628\u064A\u0642 ${y1} \u0645\u062A\u0635\u0644\u064B\u0627).`,noActivitiesWarning:"\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0623\u064A \u0623\u0646\u0634\u0637\u0629 \u0641\u064A \u0633\u0645\u0627\u062A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F.",noMacros:"\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0648\u062D\u062F\u0627\u062A \u0645\u0627\u0643\u0631\u0648",noFavorites:"\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0645\u0641\u0636\u0644\u0627\u062A",noCommands:"\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0623\u0648\u0627\u0645\u0631",macrosTab:"\u0627\u0644\u0645\u0627\u0643\u0631\u0648",favoritesTab:"\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",commandsTab:"\u0627\u0644\u0623\u0648\u0627\u0645\u0631",powerButton:"\u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u062A\u0634\u063A\u064A\u0644/\u0627\u0644\u0625\u064A\u0642\u0627\u0641",activitySelectLabel:"\u0627\u0644\u0646\u0634\u0627\u0637",deviceSelectLabel:"\u0627\u0644\u062C\u0647\u0627\u0632",selectDevice:"\u0627\u062E\u062A\u0631 \u062C\u0647\u0627\u0632\u064B\u0627",allDevicesLayout:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629",filterCommands:"\u062A\u0635\u0641\u064A\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",switchToDeviceMode:"\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",switchToActivityMode:"\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 \u0627\u0644\u0623\u0646\u0634\u0637\u0629",deviceKeymapMissing:`\u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u062E\u0632\u0651\u0646\u0629 \u0645\u0624\u0642\u062A\u064B\u0627 \u0628\u0639\u062F. \u062D\u062F\u0650\u0651\u062B \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062A\u0628\u0648\u064A\u0628 ${Z("Hub")} \u0641\u064A ${Z("Sofabaton Control Panel")}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.`,deviceKeymapError:"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.",poweredOff:"\u0645\u064F\u0637\u0641\u0623",defaultLayout:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",activityFallback:V=>`\u0627\u0644\u0646\u0634\u0627\u0637 ${Z(V)}`,deviceFallback:V=>`\u0627\u0644\u062C\u0647\u0627\u0632 ${Z(V)}`,pickerName:`\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0645\u0646 ${y1}`,pickerDescription:`\u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u062E\u0635\u064A\u0635 \u0644\u062A\u0643\u0627\u0645\u0644 ${Z("Sofabaton X1 / X1S / X2")}.`},assist:{label:"\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",start:"\u0628\u062F\u0621",waiting:"\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0636\u063A\u0637\u0629 \u0632\u0631",exitEditMode:"\u063A\u0627\u062F\u0631 \u0648\u0636\u0639 \u0627\u0644\u062A\u062D\u0631\u064A\u0631 \u0644\u0644\u0628\u062F\u0621",captured:V=>`\u062A\u0645 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0645\u0631: ${Z(V)}`,notCaptured:"\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u062A\u0642\u0627\u0637 \u0623\u064A \u0623\u0645\u0631.",working:"\u062C\u0627\u0631\u064D \u0627\u0644\u0639\u0645\u0644\u2026",triggersReady:"\u0627\u0644\u0645\u0634\u063A\u0651\u0644\u0627\u062A \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",createTriggers:`\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${i5}`,startCapturing:"\u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",deviceDetectedTitle:`\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u062C\u0647\u0627\u0632 ${A2} \u0645\u0646 ${y1}.`,close:"\u0625\u063A\u0644\u0627\u0642",alsoActivityTriggers:"\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u064A\u0636\u064B\u0627 \u0639\u0646\u062F \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637.",seeDocs:"\u0639\u0631\u0636 \u0648\u062B\u0627\u0626\u0642 \u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629.",dontShowAgain:"\u0639\u062F\u0645 \u0625\u0638\u0647\u0627\u0631 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627 \u0644\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u062E\u0644\u0627\u0644 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629.",detectedDevice:V=>`\u062C\u0647\u0627\u0632 ${A2} \u0627\u0644\u0645\u0643\u062A\u0634\u0641: ${Z(V)}.`,lastCommand:V=>`\u0622\u062E\u0631 \u0623\u0645\u0631: ${Z(V)}.`,existingTriggers:`\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u062A\u0645\u062A\u0629 ${A2} \u0645\u0648\u062C\u0648\u062F\u0629 \u0645\u0633\u0628\u0642\u064B\u0627.`,noMqttCommands:`\u0644\u0645 \u064A\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u0623\u064A \u0623\u0648\u0627\u0645\u0631 ${A2} \u062D\u062A\u0649 \u0627\u0644\u0622\u0646`,deviceFallback:V=>`\u0627\u0644\u062C\u0647\u0627\u0632 ${Z(V)}`,unknownDevice:"\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",commandFallback:V=>`\u0627\u0644\u0623\u0645\u0631 ${Z(V)}`,createdTriggers:(V,H)=>`\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${i5} \u0644\u0640 ${Z(H)}\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${Z(V)}`,createdActivityTriggers:V=>`\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0646\u0634\u0627\u0637 \u0644\u0640 ${Z("X2 \u2192 Activities")}\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${Z(V)}`,plusActivityTriggers:V=>`\u060C \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${Z(V)}`,allTriggersExist:V=>`\u062C\u0645\u064A\u0639 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${i5} \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0640 ${Z(V)} \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0627\u0644\u0641\u0639\u0644`,buttonFallback:"\u0632\u0631",activityFallbackLabel:"\u0627\u0644\u0646\u0634\u0627\u0637",unknown:"\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",automationAssistName:"\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",notification:{title:"\u{1F6E0}\uFE0F \u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",eventButton:V=>`\u0627\u0644\u0632\u0631: ${Z(V)}`,eventCommand:V=>`\u0627\u0644\u0623\u0645\u0631: ${Z(V)}`,eventActivity:V=>`\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637: ${Z(V)}`,eventOther:V=>`\u0627\u0644\u062D\u062F\u062B: ${Z(V)}`,header:(V,H)=>`**\u0627\u0644\u0646\u0634\u0627\u0637: ${Z(V)} \u2022 ${Z(H)}**`,headerDevice:(V,H)=>`**\u0627\u0644\u062C\u0647\u0627\u0632: ${Z(V)} \u2022 ${Z(H)}**`,lovelaceHeading:`\u{1F4CB} **\u0643\u0648\u062F \u0632\u0631 ${EV}**`,lovelaceCopy:`*\u0627\u0646\u0633\u062E \u0647\u0630\u0627 \u0625\u0644\u0649 ${aH} \u0627\u0644\u062E\u0627\u0635 \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A:*`,serviceHeading:"\u2699\uFE0F **\u0627\u0633\u062A\u062F\u0639\u0627\u0621 \u062E\u062F\u0645\u0629 (\u0623\u062A\u0645\u062A\u0629)**",serviceCopy:"*\u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0627 \u0641\u064A \u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u0646\u0635\u064A\u0629 \u0623\u0648 \u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629:*"}},editor:{fieldLabels:{entity:`\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 ${y1}`,theme:"\u062A\u0637\u0628\u064A\u0642 \u0633\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0628\u0637\u0627\u0642\u0629",use_background_override:"\u062A\u062E\u0635\u064A\u0635 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",background_override:"\u0627\u062E\u062A\u064A\u0627\u0631 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",show_activity:"\u0645\u062D\u062F\u0650\u0651\u062F \u0627\u0644\u0646\u0634\u0627\u0637/\u0627\u0644\u062C\u0647\u0627\u0632",show_dpad:"\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",show_nav:"\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",show_mid:"\u0623\u0632\u0631\u0627\u0631 \u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A \u0648\u0627\u0644\u0642\u0646\u0648\u0627\u062A",show_media:"\u0627\u0644\u062A\u0634\u063A\u064A\u0644",show_colors:"\u0623\u062D\u0645\u0631\u060C \u0623\u062E\u0636\u0631\u060C \u0623\u0635\u0641\u0631\u060C \u0623\u0632\u0631\u0642",show_abc:`\u0623\u0632\u0631\u0627\u0631 ${dH}`,show_macros_button:"\u0632\u0631 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",show_favorites_button:"\u0632\u0631 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",max_width:"\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0639\u0631\u0636 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 (\u0628\u0643\u0633\u0644)",key_style:"\u0646\u0645\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",group_order:"\u062A\u0631\u062A\u064A\u0628 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0627\u062A"},generalOptionsTitle:"\u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629",keyCapture:"\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",keyCaptureDescription:`\u0623\u0631\u0633\u0644 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0625\u0644\u0649 \u062C\u0647\u0627\u0632 ${Z("Hub")} \u0644\u0625\u0646\u0634\u0627\u0621 ${aH} \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0641\u064A \u0623\u0632\u0631\u0627\u0631 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629.`,keyCaptureLearnMore:"\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u0649 \u0627\u0644\u0645\u0632\u064A\u062F \u062D\u0648\u0644 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",keyCaptureDocsAria:"\u0648\u062B\u0627\u0626\u0642 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",stylingOptions:"\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0638\u0647\u0631",keyStyleFlat:"\u0645\u0633\u0637\u062D (\u0628\u0646\u0641\u0633 \u0644\u0648\u0646 \u062E\u0644\u0641\u064A\u0629 \u0627\u0644\u0628\u0637\u0627\u0642\u0629)",keyStyleTinted:"\u0645\u0644\u0648\u0651\u0646 (\u062A\u062A\u0645\u064A\u0632 \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0639\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629)",keyStyleElevated:"\u0645\u0631\u062A\u0641\u0639 (\u0645\u0644\u0648\u0651\u0646 \u0645\u0639 \u0638\u0644)",keyStyleGlossy:"\u0644\u0627\u0645\u0639 (\u0623\u0632\u0631\u0627\u0631 \u0644\u0627\u0645\u0639\u0629 \u0645\u0642\u0648\u0651\u0633\u0629)",tintedPanels:"\u062E\u0644\u0641\u064A\u0627\u062A \u0645\u0644\u0648\u0651\u0646\u0629",tintedPanelsDescription:"\u064A\u0639\u0631\u0636 \u062E\u0644\u0641\u064A\u0629 \u0645\u0644\u0648\u0651\u0646\u0629 \u062E\u0644\u0641 \u0643\u0644 \u0645\u062C\u0645\u0648\u0639\u0629 \u0623\u0632\u0631\u0627\u0631.",layoutOptions:"\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u062E\u0637\u064A\u0637",layoutSelectLabel:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637",defaultLayoutOption:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",allDevicesOption:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629",commands:"\u0627\u0644\u0623\u0648\u0627\u0645\u0631",power:"\u0632\u0631 \u0627\u0644\u062A\u0634\u063A\u064A\u0644/\u0627\u0644\u0625\u064A\u0642\u0627\u0641",modeToggle:"\u0632\u0631 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0648\u0636\u0639",deviceModeDescription:`\u062A\u062D\u0643\u0651\u0645 \u0641\u064A \u062C\u0647\u0627\u0632 \u0648\u0627\u062D\u062F \u062A\u0645 \u0625\u0639\u062F\u0627\u062F\u0647 \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 ${Z("Hub")}\u060C \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u062A\u0639\u064A\u064A\u0646\u0627\u062A \u0623\u0632\u0631\u0627\u0631\u0647 \u0648\u0642\u0627\u0626\u0645\u0629 \u0623\u0648\u0627\u0645\u0631\u0647 \u0627\u0644\u0643\u0627\u0645\u0644\u0629.`,longPress:"\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0643\u0631\u0627\u0631 \u0639\u0646\u062F \u0627\u0644\u0636\u063A\u0637 \u0627\u0644\u0645\u0637\u0648\u0651\u0644",longPressDescription:"\u0627\u0636\u063A\u0637 \u0645\u0637\u0648\u0651\u0644\u064B\u0627 \u0639\u0644\u0649 \u0623\u062D\u062F \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0644\u0625\u0631\u0633\u0627\u0644 \u0623\u0645\u0631\u0647 \u0628\u0634\u0643\u0644 \u0645\u062A\u0643\u0631\u0631\u060C \u0643\u0645\u0627 \u0641\u064A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0641\u0639\u0644\u064A.",longPressButtons:"\u0627\u0644\u0623\u0632\u0631\u0627\u0631",enableDeviceMode:"\u062A\u0641\u0639\u064A\u0644 \u0648\u0636\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",initialView:"\u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0644\u064A",initialViewHelper:"\u0645\u0627 \u062A\u0639\u0631\u0636\u0647 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0639\u0646\u062F \u0641\u062A\u062D\u0647\u0627",openOnCurrentActivity:"\u0627\u0644\u0646\u0634\u0627\u0637 \u0627\u0644\u062D\u0627\u0644\u064A",macrosFavoritesAsRows:"\u0639\u0631\u0636 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 \u0648\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A \u0641\u064A \u0635\u0641\u0648\u0641",commandsAsRows:"\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0641\u064A \u0635\u0641\u0648\u0641",favoriteDeviceNames:"\u0625\u0638\u0647\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",rowOptions:V=>`\u062E\u064A\u0627\u0631\u0627\u062A ${V}`,visibleRows:"\u0627\u0644\u0635\u0641\u0648\u0641 \u0627\u0644\u0645\u0631\u0626\u064A\u0629",moveGroupUp:V=>`\u0646\u0642\u0644 ${Z(V)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649`,moveGroupDown:V=>`\u0646\u0642\u0644 ${Z(V)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0641\u0644`,macros:"\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",favorites:"\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",volume:"\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",channel:"\u0627\u0644\u0642\u0646\u0627\u0629",mediaControls:"\u0627\u0644\u062A\u0634\u063A\u064A\u0644",dvr:nH,numpad:"\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0631\u0642\u0627\u0645",resetDefaultLayout:"\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0627\u0644\u062A\u062E\u0637\u064A\u0637",shortcutSlotLeft:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u064A\u0633\u0631",shortcutSlotMiddle:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u0648\u0633\u0637",shortcutSlotRight:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u064A\u0645\u0646",shortcutIcon:"\u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0629",shortcutCommand:"\u0627\u0644\u0623\u0645\u0631",shortcutReset:"\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0636\u0628\u0637",shortcutCommandMissing:V=>`\u0627\u0644\u0623\u0645\u0631 ${Z(V)} (\u0645\u0641\u0642\u0648\u062F)`,shortcutsCommandsLoading:"\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0648\u0627\u0645\u0631\u2026",shortcutsCommandsUnavailable:`\u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u062E\u0632\u0651\u0646\u0629 \u0645\u0624\u0642\u062A\u064B\u0627 \u0628\u0639\u062F. \u062D\u062F\u0650\u0651\u062B \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062A\u0628\u0648\u064A\u0628 ${Z("Hub")} \u0641\u064A ${Z("Sofabaton Control Panel")}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.`,shortcutsCommandsError:"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.",noteDefaultLayout:"\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",noteDeviceDefaultLayout:"\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",noteCustomActivityLayout:"\u062A\u062E\u0637\u064A\u0637 \u0623\u0646\u0634\u0637\u0629 \u0645\u062E\u0635\u0651\u0635 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",noteCustomDeviceLayout:"\u062A\u062E\u0637\u064A\u0637 \u0623\u062C\u0647\u0632\u0629 \u0645\u062E\u0635\u0651\u0635 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",noteUsingActivityDefault:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",noteUsingDeviceDefault:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645"},groups:{activity:"\u0627\u0644\u0646\u0634\u0627\u0637/\u0627\u0644\u062C\u0647\u0627\u0632",macro_favorites:"\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 \u0648\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",macros_row:"\u0635\u0641 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",favorites_row:"\u0635\u0641 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",dpad:"\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",nav:"\u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",mid:"\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A/\u0627\u0644\u0642\u0646\u0627\u0629",media:"\u0627\u0644\u062A\u0634\u063A\u064A\u0644",colors:"\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0623\u0644\u0648\u0627\u0646",abc:dH,shortcuts:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631\u0627\u062A"},keys:{up:"\u0623\u0639\u0644\u0649",down:"\u0623\u0633\u0641\u0644",left:"\u064A\u0633\u0627\u0631",right:"\u064A\u0645\u064A\u0646",ok:"\u0645\u0648\u0627\u0641\u0642",back:"\u0631\u062C\u0648\u0639",home:"\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629",menu:"\u0627\u0644\u0642\u0627\u0626\u0645\u0629",volup:`\u0627\u0644\u0635\u0648\u062A ${Z("+")}`,voldn:`\u0627\u0644\u0635\u0648\u062A ${Z("-")}`,mute:"\u0643\u062A\u0645 \u0627\u0644\u0635\u0648\u062A",chup:`\u0627\u0644\u0642\u0646\u0627\u0629 ${Z("+")}`,chdn:`\u0627\u0644\u0642\u0646\u0627\u0629 ${Z("-")}`,guide:"\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C",dvr:nH,play:"\u062A\u0634\u063A\u064A\u0644",exit:"\u062E\u0631\u0648\u062C",rew:"\u062A\u0631\u062C\u064A\u0639",pause:"\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A",fwd:"\u062A\u0642\u062F\u064A\u0645 \u0633\u0631\u064A\u0639",red:"\u0623\u062D\u0645\u0631",green:"\u0623\u062E\u0636\u0631",yellow:"\u0623\u0635\u0641\u0631",blue:"\u0623\u0632\u0631\u0642",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"\u0625\u062F\u062E\u0627\u0644"}};b("ar",FV);b("en-gb",{card:{favoritesTab:"Favourites",noFavorites:"No favourites available"},editor:{fieldLabels:{use_background_override:"Customise background colour",background_override:"Select background colour",show_favorites_button:"Favourites button"},favorites:"Favourites",macrosFavoritesAsRows:"Macros/Favourites as rows"},groups:{macro_favorites:"Macros/Favourites",favorites_row:"Favourites row",colors:"Colour buttons"}});var NV={card:{selectEntityError:"W\xE4hle eine Sofabaton-Fernsteuerungsentit\xE4t aus",remoteUnavailable:"Die Fernsteuerung ist nicht verf\xFCgbar (m\xF6glicherweise ist die Sofabaton-App verbunden).",noActivitiesWarning:"Keine Aktivit\xE4ten in den Attributen der Fernsteuerung gefunden.",noMacros:"Keine Makros verf\xFCgbar",noFavorites:"Keine Favoriten verf\xFCgbar",noCommands:"Keine Befehle verf\xFCgbar",macrosTab:"Makros",favoritesTab:"Favoriten",commandsTab:"Befehle",powerButton:"Ein-/Ausschalten",activitySelectLabel:"Aktivit\xE4t",deviceSelectLabel:"Ger\xE4t",selectDevice:"Ger\xE4t ausw\xE4hlen",allDevicesLayout:"Standard-Ger\xE4telayout",filterCommands:"Befehle filtern",switchToDeviceMode:"In den Ger\xE4temodus wechseln",switchToActivityMode:"In den Aktivit\xE4tsmodus wechseln",deviceKeymapMissing:"Die Befehle dieses Ger\xE4ts sind noch nicht im Cache. Aktualisiere das Ger\xE4t im Hub-Tab der Sofabaton-Steuerzentrale und lade danach das Dashboard neu.",deviceKeymapError:"Die Befehle dieses Ger\xE4ts konnten nicht geladen werden.",poweredOff:"Ausgeschaltet",defaultLayout:"Standard-Aktivit\xE4tslayout",activityFallback:V=>`Aktivit\xE4t ${V}`,deviceFallback:V=>`Ger\xE4t ${V}`,pickerName:"Virtuelle Sofabaton-Fernbedienung",pickerDescription:"Eine konfigurierbare Fernbedienung f\xFCr die Sofabaton-X1-, X1S- und X2-Integration."},assist:{label:"Tastendr\xFCcke erfassen",start:"Starten",waiting:"Warten auf Tastendruck",exitEditMode:"Bearbeitungsmodus verlassen, um zu beginnen",captured:V=>`Erfasst: ${V}`,notCaptured:"Nicht erfasst.",working:"Wird ausgef\xFChrt\u2026",triggersReady:"Ausl\xF6ser einsatzbereit",createTriggers:"MQTT-Discovery-Ausl\xF6ser erstellen",startCapturing:"Befehlserfassung starten",deviceDetectedTitle:"Sofabaton-MQTT-Ger\xE4t erkannt.",close:"Schlie\xDFen",alsoActivityTriggers:"Zus\xE4tzlich Ausl\xF6ser f\xFCr Aktivit\xE4tswechsel erstellen.",seeDocs:"Dokumentation zu dieser Funktion anzeigen.",dontShowAgain:"F\xFCr dieses Ger\xE4t w\xE4hrend dieser Sitzung nicht erneut anzeigen.",detectedDevice:V=>`MQTT-Ger\xE4t erkannt: ${V}.`,lastCommand:V=>`Letzter Befehl: ${V}.`,existingTriggers:"Vorhandene MQTT-Automatisierungsausl\xF6ser wurden gefunden.",noMqttCommands:"Noch keine MQTT-Befehle erkannt",deviceFallback:V=>`Ger\xE4t ${V}`,unknownDevice:"Unbekanntes Ger\xE4t",commandFallback:V=>`Befehl ${V}`,createdTriggers:(V,H)=>`${V} MQTT-Discovery-Ausl\xF6ser f\xFCr ${H} ${V===1?"wurde":"wurden"} erstellt`,createdActivityTriggers:V=>`${V} Aktivit\xE4tsausl\xF6ser f\xFCr X2 \u2192 Activities ${V===1?"wurde":"wurden"} erstellt`,plusActivityTriggers:V=>`; zus\xE4tzlich ${V===1?"wurde":"wurden"} ${V} Aktivit\xE4tsausl\xF6ser erstellt`,allTriggersExist:V=>`Alle MQTT-Discovery-Ausl\xF6ser f\xFCr ${V} sind bereits vorhanden`,buttonFallback:"Taste",activityFallbackLabel:"Aktivit\xE4t",unknown:"Unbekannt",automationAssistName:"Automatisierungsassistent",notification:{title:"\u{1F6E0}\uFE0F Automatisierungsassistent",eventButton:V=>`Taste: ${V}`,eventCommand:V=>`Befehl: ${V}`,eventActivity:V=>`Aktivit\xE4tswechsel: ${V}`,eventOther:V=>`Ereignis: ${V}`,header:(V,H)=>`**Aktivit\xE4t: ${V} | ${H}**`,headerDevice:(V,H)=>`**Ger\xE4t: ${V} | ${H}**`,lovelaceHeading:"\u{1F4CB} **Lovelace-Schaltfl\xE4chencode**",lovelaceCopy:"*In das Dashboard-YAML kopieren:*",serviceHeading:"\u2699\uFE0F **Dienstaufruf (Automatisierung)**",serviceCopy:"*In Skripten oder Automatisierungen verwenden:*"}},editor:{fieldLabels:{entity:"Sofabaton-Fernsteuerungsentit\xE4t ausw\xE4hlen",theme:"Theme auf die Karte anwenden",use_background_override:"Hintergrundfarbe anpassen",background_override:"Hintergrundfarbe ausw\xE4hlen",show_activity:"Aktivit\xE4ts-/Ger\xE4teauswahl",show_dpad:"Steuerkreuz",show_nav:"Zur\xFCck-, Home- und Men\xFC-Tasten",show_mid:"Lautst\xE4rke- und Kanalwippen",show_media:"Wiedergabe",show_colors:"Rot/Gr\xFCn/Gelb/Blau",show_abc:"A/B/C-Tasten",show_macros_button:"Makrotaste",show_favorites_button:"Favoritentaste",max_width:"Maximale Kartenbreite (px)",key_style:"Tastenstil",group_order:"Gruppenreihenfolge"},generalOptionsTitle:"Allgemeine Optionen",keyCapture:"Tastendr\xFCcke erfassen",keyCaptureDescription:"Sende Tastendr\xFCcke an den Hub, um sofort einsatzbereites YAML f\xFCr Dashboard-Schaltfl\xE4chen und Automatisierungen zu erzeugen.",keyCaptureLearnMore:"Mehr \xFCber die Tastenerfassung erfahren",keyCaptureDocsAria:"Dokumentation zur Tastenerfassung",stylingOptions:"Stiloptionen",keyStyleFlat:"Flach (wie der Kartenhintergrund)",keyStyleTinted:"Get\xF6nt (Tasten heben sich vom Hintergrund ab)",keyStyleElevated:"Erh\xF6ht (get\xF6nt mit Schatten)",keyStyleGlossy:"Gl\xE4nzend (gl\xE4nzende, gew\xF6lbte Tasten)",tintedPanels:"Get\xF6nte Panels",tintedPanelsDescription:"Zeigt hinter jeder Tastengruppe einen get\xF6nten Hintergrund an.",layoutOptions:"Layoutoptionen",layoutSelectLabel:"Layout",defaultLayoutOption:"Standard-Aktivit\xE4tslayout",allDevicesOption:"Standard-Ger\xE4telayout",commands:"Befehle",power:"Ein-/Aus-Taste",modeToggle:"Modusschalter",deviceModeDescription:"Steuere ein einzelnes, im Hub eingerichtetes Ger\xE4t mit dessen Tastenbelegungen und vollst\xE4ndiger Befehlsliste.",longPress:"Wiederholen beim Gedr\xFCckthalten aktivieren",longPressDescription:"Halte eine ausgew\xE4hlte Taste gedr\xFCckt, um ihren Befehl wiederholt zu senden \u2013 wie bei der physischen Fernbedienung.",longPressButtons:"Tasten",enableDeviceMode:"Ger\xE4temodus aktivieren",initialView:"Anfangsansicht",initialViewHelper:"Was die Karte beim \xD6ffnen anzeigt",openOnCurrentActivity:"Aktuelle Aktivit\xE4t",macrosFavoritesAsRows:"Makros/Favoriten als Zeilen",commandsAsRows:"Befehle als Zeilen",favoriteDeviceNames:"Ger\xE4tenamen anzeigen",rowOptions:V=>`Optionen f\xFCr ${V}`,visibleRows:"Sichtbare Zeilen",moveGroupUp:V=>`${V} nach oben verschieben`,moveGroupDown:V=>`${V} nach unten verschieben`,macros:"Makros",favorites:"Favoriten",volume:"Lautst\xE4rke",channel:"Kanal",mediaControls:"Wiedergabe",dvr:"DVR",numpad:"Ziffernblock",resetDefaultLayout:"Layout zur\xFCcksetzen",shortcutSlotLeft:"Linke Verkn\xFCpfung",shortcutSlotMiddle:"Mittlere Verkn\xFCpfung",shortcutSlotRight:"Rechte Verkn\xFCpfung",shortcutIcon:"Symbol",shortcutCommand:"Befehl",shortcutReset:"Zur\xFCcksetzen",shortcutCommandMissing:V=>`Befehl ${V} (fehlt)`,shortcutsCommandsLoading:"Befehle werden geladen\u2026",shortcutsCommandsUnavailable:"Die Befehle dieses Ger\xE4ts sind noch nicht im Cache. Aktualisiere das Ger\xE4t im Hub-Tab der Sofabaton-Steuerzentrale und lade danach das Dashboard neu.",shortcutsCommandsError:"Die Befehle dieses Ger\xE4ts konnten nicht geladen werden. Lade das Dashboard neu und versuche es erneut.",noteDefaultLayout:"F\xFCr Aktivit\xE4ten ohne eigenes Layout",noteDeviceDefaultLayout:"F\xFCr Ger\xE4te ohne eigenes Layout",noteCustomActivityLayout:"Benutzerdefiniertes Aktivit\xE4tslayout aktiv",noteCustomDeviceLayout:"Benutzerdefiniertes Ger\xE4telayout aktiv",noteUsingActivityDefault:"Standard-Aktivit\xE4tslayout aktiv",noteUsingDeviceDefault:"Standard-Ger\xE4telayout aktiv"},groups:{activity:"Aktivit\xE4t/Ger\xE4t",macro_favorites:"Makros/Favoriten",macros_row:"Makrozeile",favorites_row:"Favoritenzeile",dpad:"Steuerkreuz",nav:"Zur\xFCck/Home/Men\xFC",mid:"Lautst\xE4rke/Kanal",media:"Wiedergabe",colors:"Farbtasten",abc:"A/B/C",shortcuts:"Verkn\xFCpfungen"},keys:{up:"Nach oben",down:"Nach unten",left:"Nach links",right:"Nach rechts",ok:"OK",back:"Zur\xFCck",home:"Home",menu:"Men\xFC",volup:"Lautst\xE4rke +",voldn:"Lautst\xE4rke -",mute:"Stumm",chup:"Kanal +",chdn:"Kanal -",guide:"Guide",dvr:"DVR",play:"Wiedergabe",exit:"Beenden",rew:"Zur\xFCckspulen",pause:"Pause",fwd:"Vorspulen",red:"Rot",green:"Gr\xFCn",yellow:"Gelb",blue:"Blau",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Enter"}};b("de",NV);var i1=(V,H,C=`${H}s`)=>V===1?H:C,IV={card:{selectEntityError:"Selecciona una entidad de mando a distancia Sofabaton",remoteUnavailable:"El mando a distancia no est\xE1 disponible (posiblemente porque la aplicaci\xF3n Sofabaton est\xE1 conectada).",noActivitiesWarning:"No se encontraron actividades en los atributos del mando a distancia.",noMacros:"No hay macros disponibles",noFavorites:"No hay favoritos disponibles",noCommands:"No hay comandos disponibles",macrosTab:"Macros",favoritesTab:"Favoritos",commandsTab:"Comandos",powerButton:"Alternar encendido/apagado",activitySelectLabel:"Actividad",deviceSelectLabel:"Dispositivo",selectDevice:"Seleccionar dispositivo",allDevicesLayout:"Dise\xF1o predeterminado de dispositivos",filterCommands:"Filtrar comandos",switchToDeviceMode:"Cambiar al modo de dispositivo",switchToActivityMode:"Cambiar al modo de actividad",deviceKeymapMissing:"Los comandos de este dispositivo a\xFAn no est\xE1n en cach\xE9. Actualiza el dispositivo en la pesta\xF1a Hub del Panel de control Sofabaton y vuelve a cargar el panel de Home Assistant.",deviceKeymapError:"No se pudieron cargar los comandos de este dispositivo.",poweredOff:"Apagado",defaultLayout:"Dise\xF1o predeterminado de actividades",activityFallback:V=>`Actividad ${V}`,deviceFallback:V=>`Dispositivo ${V}`,pickerName:"Mando a distancia virtual Sofabaton",pickerDescription:"Un mando a distancia configurable para la integraci\xF3n Sofabaton X1, X1S y X2."},assist:{label:"Captura de botones",start:"Iniciar",waiting:"Esperando a que se pulse un bot\xF3n",exitEditMode:"Sal del modo de edici\xF3n para comenzar",captured:V=>`Capturado: ${V}`,notCaptured:"Sin capturar.",working:"Procesando\u2026",triggersReady:"Desencadenantes listos para usar",createTriggers:"Crear desencadenantes de MQTT Discovery",startCapturing:"Iniciar la captura de comandos",deviceDetectedTitle:"Se ha detectado un dispositivo MQTT de Sofabaton.",close:"Cerrar",alsoActivityTriggers:"Crear tambi\xE9n desencadenantes para los cambios de actividad.",seeDocs:"Consulta la documentaci\xF3n de esta funci\xF3n.",dontShowAgain:"No volver a mostrar este mensaje para este dispositivo durante esta sesi\xF3n.",detectedDevice:V=>`Dispositivo MQTT detectado: ${V}.`,lastCommand:V=>`\xDAltimo comando: ${V}.`,existingTriggers:"Se encontraron desencadenantes existentes de automatizaci\xF3n MQTT.",noMqttCommands:"A\xFAn no se han detectado comandos MQTT",deviceFallback:V=>`Dispositivo ${V}`,unknownDevice:"Dispositivo desconocido",commandFallback:V=>`Comando ${V}`,createdTriggers:(V,H)=>`${V} ${i1(V,"desencadenante")} de MQTT Discovery ${i1(V,"creado")} para ${H}`,createdActivityTriggers:V=>`${V} ${i1(V,"desencadenante")} de actividad ${i1(V,"creado")} para X2 \u2192 Activities`,plusActivityTriggers:V=>`; adem\xE1s, ${V} ${i1(V,"desencadenante")} de actividad ${i1(V,"creado")}`,allTriggersExist:V=>`Ya existen todos los desencadenantes de MQTT Discovery para ${V}`,buttonFallback:"Bot\xF3n",activityFallbackLabel:"Actividad",unknown:"Desconocido",automationAssistName:"Asistente de automatizaci\xF3n",notification:{title:"\u{1F6E0}\uFE0F Asistente de automatizaci\xF3n",eventButton:V=>`Bot\xF3n: ${V}`,eventCommand:V=>`Comando: ${V}`,eventActivity:V=>`Cambio de actividad: ${V}`,eventOther:V=>`Evento: ${V}`,header:(V,H)=>`**Actividad: ${V} | ${H}**`,headerDevice:(V,H)=>`**Dispositivo: ${V} | ${H}**`,lovelaceHeading:"\u{1F4CB} **C\xF3digo de bot\xF3n Lovelace**",lovelaceCopy:"*Copia esto en el YAML de tu panel:*",serviceHeading:"\u2699\uFE0F **Llamada de servicio (automatizaci\xF3n)**",serviceCopy:"*Usa esto en tus scripts o automatizaciones:*"}},editor:{fieldLabels:{entity:"Seleccionar una entidad de mando a distancia Sofabaton",theme:"Aplicar un tema a la tarjeta",use_background_override:"Personalizar el color de fondo",background_override:"Seleccionar el color de fondo",show_activity:"Selector de actividad/dispositivo",show_dpad:"Control direccional",show_nav:"Botones Atr\xE1s/Inicio/Men\xFA",show_mid:"Controles de volumen y canal",show_media:"Reproducci\xF3n",show_colors:"Rojo/Verde/Amarillo/Azul",show_abc:"Botones A/B/C",show_macros_button:"Bot\xF3n de macros",show_favorites_button:"Bot\xF3n de favoritos",max_width:"Ancho m\xE1ximo de la tarjeta (px)",key_style:"Estilo de los botones",group_order:"Orden de los grupos"},generalOptionsTitle:"Opciones generales",keyCapture:"Captura de botones",keyCaptureDescription:"Env\xEDa pulsaciones de botones al hub para generar YAML listo para usar en botones del panel y automatizaciones.",keyCaptureLearnMore:"M\xE1s informaci\xF3n sobre la captura de botones",keyCaptureDocsAria:"Documentaci\xF3n sobre la captura de botones",stylingOptions:"Opciones de estilo",keyStyleFlat:"Plano (igual que el fondo de la tarjeta)",keyStyleTinted:"Tintado (los botones destacan sobre el fondo)",keyStyleElevated:"Elevado (tintado con sombra)",keyStyleGlossy:"Brillante (botones curvos y brillantes)",tintedPanels:"Paneles tintados",tintedPanelsDescription:"Muestra un fondo tintado detr\xE1s de cada grupo de botones.",layoutOptions:"Opciones de dise\xF1o",layoutSelectLabel:"Dise\xF1o",defaultLayoutOption:"Dise\xF1o predeterminado de actividades",allDevicesOption:"Dise\xF1o predeterminado de dispositivos",commands:"Comandos",power:"Bot\xF3n de encendido/apagado",modeToggle:"Bot\xF3n de modo",deviceModeDescription:"Controla un \xFAnico dispositivo configurado en el hub mediante sus asignaciones de botones y su lista completa de comandos.",longPress:"Activar la repetici\xF3n al mantener pulsado un bot\xF3n",longPressDescription:"Mant\xE9n pulsado un bot\xF3n seleccionado para enviar su comando repetidamente, como en el mando a distancia f\xEDsico.",longPressButtons:"Botones",enableDeviceMode:"Activar el modo de dispositivo",initialView:"Vista inicial",initialViewHelper:"Lo que muestra la tarjeta al abrirse",openOnCurrentActivity:"Actividad actual",macrosFavoritesAsRows:"Macros/favoritos como filas",commandsAsRows:"Comandos como filas",favoriteDeviceNames:"Mostrar nombres de dispositivos",rowOptions:V=>`Opciones de ${V}`,visibleRows:"Filas visibles",moveGroupUp:V=>`Mover ${V} hacia arriba`,moveGroupDown:V=>`Mover ${V} hacia abajo`,macros:"Macros",favorites:"Favoritos",volume:"Volumen",channel:"Canal",mediaControls:"Reproducci\xF3n",dvr:"DVR",numpad:"Teclado num\xE9rico",resetDefaultLayout:"Restablecer dise\xF1o",shortcutSlotLeft:"Acceso directo izquierdo",shortcutSlotMiddle:"Acceso directo central",shortcutSlotRight:"Acceso directo derecho",shortcutIcon:"Icono",shortcutCommand:"Comando",shortcutReset:"Restablecer",shortcutCommandMissing:V=>`Comando ${V} (no encontrado)`,shortcutsCommandsLoading:"Cargando comandos\u2026",shortcutsCommandsUnavailable:"Los comandos de este dispositivo a\xFAn no est\xE1n en cach\xE9. Actualiza el dispositivo en la pesta\xF1a Hub del Panel de control Sofabaton y vuelve a cargar el panel de Home Assistant.",shortcutsCommandsError:"No se pudieron cargar los comandos de este dispositivo. Vuelve a cargar el panel de Home Assistant e int\xE9ntalo de nuevo.",noteDefaultLayout:"Se usa para actividades sin un dise\xF1o propio",noteDeviceDefaultLayout:"Se usa para dispositivos sin un dise\xF1o propio",noteCustomActivityLayout:"Se est\xE1 usando un dise\xF1o de actividad personalizado",noteCustomDeviceLayout:"Se est\xE1 usando un dise\xF1o de dispositivo personalizado",noteUsingActivityDefault:"Se est\xE1 usando el dise\xF1o predeterminado de actividades",noteUsingDeviceDefault:"Se est\xE1 usando el dise\xF1o predeterminado de dispositivos"},groups:{activity:"Actividad/dispositivo",macro_favorites:"Macros/favoritos",macros_row:"Fila de macros",favorites_row:"Fila de favoritos",dpad:"Control direccional",nav:"Atr\xE1s/Inicio/Men\xFA",mid:"Volumen/Canal",media:"Reproducci\xF3n",colors:"Botones de colores",abc:"A/B/C",shortcuts:"Accesos directos"},keys:{up:"Arriba",down:"Abajo",left:"Izquierda",right:"Derecha",ok:"OK",back:"Atr\xE1s",home:"Inicio",menu:"Men\xFA",volup:"Volumen +",voldn:"Volumen -",mute:"Silencio",chup:"Canal +",chdn:"Canal -",guide:"Gu\xEDa",dvr:"DVR",play:"Reproducir",exit:"Salir",rew:"Retroceder",pause:"Pausa",fwd:"Avance r\xE1pido",red:"Rojo",green:"Verde",yellow:"Amarillo",blue:"Azul",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Intro"}};b("es",IV);var o1=(V,H,C=`${H}s`)=>V>1?C:H,$V={card:{selectEntityError:"S\xE9lectionnez une entit\xE9 de t\xE9l\xE9commande Sofabaton",remoteUnavailable:"La t\xE9l\xE9commande n\u2019est pas disponible (peut-\xEAtre parce que l\u2019application Sofabaton est connect\xE9e).",noActivitiesWarning:"Aucune activit\xE9 trouv\xE9e dans les attributs de la t\xE9l\xE9commande.",noMacros:"Aucune macro disponible",noFavorites:"Aucun favori disponible",noCommands:"Aucune commande disponible",macrosTab:"Macros",favoritesTab:"Favoris",commandsTab:"Commandes",powerButton:"Basculer marche/arr\xEAt",activitySelectLabel:"Activit\xE9",deviceSelectLabel:"Appareil",selectDevice:"S\xE9lectionner un appareil",allDevicesLayout:"Disposition par d\xE9faut des appareils",filterCommands:"Filtrer les commandes",switchToDeviceMode:"Passer en mode appareil",switchToActivityMode:"Passer en mode activit\xE9",deviceKeymapMissing:"Les commandes de cet appareil ne sont pas encore en cache. Actualisez l\u2019appareil dans l\u2019onglet Hub du Panneau de contr\xF4le Sofabaton, puis rechargez le tableau de bord.",deviceKeymapError:"Impossible de charger les commandes de cet appareil.",poweredOff:"\xC9teinte",defaultLayout:"Disposition par d\xE9faut des activit\xE9s",activityFallback:V=>`Activit\xE9 ${V}`,deviceFallback:V=>`Appareil ${V}`,pickerName:"T\xE9l\xE9commande virtuelle Sofabaton",pickerDescription:"Une t\xE9l\xE9commande configurable pour l\u2019int\xE9gration Sofabaton X1, X1S et X2."},assist:{label:"Capture de touches",start:"D\xE9marrer",waiting:"En attente d\u2019une pression sur une touche",exitEditMode:"Quittez le mode d\u2019\xE9dition pour commencer",captured:V=>`Capture\xA0: ${V}`,notCaptured:"Aucune capture.",working:"Traitement en cours\u2026",triggersReady:"D\xE9clencheurs pr\xEAts \xE0 l\u2019emploi",createTriggers:"Cr\xE9er les d\xE9clencheurs MQTT Discovery",startCapturing:"Commencer la capture des commandes",deviceDetectedTitle:"Appareil MQTT Sofabaton d\xE9tect\xE9.",close:"Fermer",alsoActivityTriggers:"Cr\xE9er \xE9galement des d\xE9clencheurs pour les changements d\u2019activit\xE9.",seeDocs:"Consultez la documentation de cette fonctionnalit\xE9.",dontShowAgain:"Ne plus afficher ce message pour cet appareil pendant cette session.",detectedDevice:V=>`Appareil MQTT d\xE9tect\xE9\xA0: ${V}.`,lastCommand:V=>`Derni\xE8re commande\xA0: ${V}.`,existingTriggers:"Des d\xE9clencheurs d\u2019automatisation MQTT existants ont \xE9t\xE9 trouv\xE9s.",noMqttCommands:"Aucune commande MQTT d\xE9couverte pour le moment",deviceFallback:V=>`Appareil ${V}`,unknownDevice:"Appareil inconnu",commandFallback:V=>`Commande ${V}`,createdTriggers:(V,H)=>`${V} ${o1(V,"d\xE9clencheur")} MQTT Discovery ${o1(V,"cr\xE9\xE9")} pour ${H}`,createdActivityTriggers:V=>`${V} ${o1(V,"d\xE9clencheur")} d\u2019activit\xE9 ${o1(V,"cr\xE9\xE9")} pour X2 \u2192 Activities`,plusActivityTriggers:V=>`\xA0; ${V} ${o1(V,"d\xE9clencheur")} d\u2019activit\xE9 \xE9galement ${o1(V,"cr\xE9\xE9")}`,allTriggersExist:V=>`Tous les d\xE9clencheurs MQTT Discovery existent d\xE9j\xE0 pour ${V}`,buttonFallback:"Touche",activityFallbackLabel:"Activit\xE9",unknown:"Inconnu",automationAssistName:"Assistant d\u2019automatisation",notification:{title:"\u{1F6E0}\uFE0F Assistant d\u2019automatisation",eventButton:V=>`Touche\xA0: ${V}`,eventCommand:V=>`Commande\xA0: ${V}`,eventActivity:V=>`Changement d\u2019activit\xE9\xA0: ${V}`,eventOther:V=>`\xC9v\xE9nement\xA0: ${V}`,header:(V,H)=>`**Activit\xE9\xA0: ${V} | ${H}**`,headerDevice:(V,H)=>`**Appareil\xA0: ${V} | ${H}**`,lovelaceHeading:"\u{1F4CB} **Code de bouton Lovelace**",lovelaceCopy:"*Copiez ceci dans le YAML de votre tableau de bord\xA0:*",serviceHeading:"\u2699\uFE0F **Appel de service (automatisation)**",serviceCopy:"*Utilisez ceci dans vos scripts ou automatisations\xA0:*"}},editor:{fieldLabels:{entity:"S\xE9lectionner une entit\xE9 de t\xE9l\xE9commande Sofabaton",theme:"Appliquer un th\xE8me \xE0 la carte",use_background_override:"Personnaliser la couleur d\u2019arri\xE8re-plan",background_override:"S\xE9lectionner la couleur d\u2019arri\xE8re-plan",show_activity:"S\xE9lecteur d\u2019activit\xE9/appareil",show_dpad:"Pav\xE9 directionnel",show_nav:"Touches Retour/Accueil/Menu",show_mid:"Touches de volume et de cha\xEEne",show_media:"Lecture",show_colors:"Rouge/Vert/Jaune/Bleu",show_abc:"Touches A/B/C",show_macros_button:"Bouton des macros",show_favorites_button:"Bouton des favoris",max_width:"Largeur maximale de la carte (px)",key_style:"Style des touches",group_order:"Ordre des groupes"},generalOptionsTitle:"Options g\xE9n\xE9rales",keyCapture:"Capture de touches",keyCaptureDescription:"Envoyez les pressions sur les touches au hub afin de g\xE9n\xE9rer du YAML pr\xEAt \xE0 l\u2019emploi pour les boutons du tableau de bord et les automatisations.",keyCaptureLearnMore:"En savoir plus sur la capture de touches",keyCaptureDocsAria:"Documentation sur la capture de touches",stylingOptions:"Options de style",keyStyleFlat:"Plat (m\xEAme couleur que la carte)",keyStyleTinted:"Teint\xE9 (les touches se d\xE9tachent du fond)",keyStyleElevated:"Sur\xE9lev\xE9 (teint\xE9 avec ombre)",keyStyleGlossy:"Brillant (touches bomb\xE9es et brillantes)",tintedPanels:"Panneaux teint\xE9s",tintedPanelsDescription:"Affiche un fond teint\xE9 derri\xE8re chaque groupe de touches.",layoutOptions:"Options de disposition",layoutSelectLabel:"Disposition",defaultLayoutOption:"Disposition par d\xE9faut des activit\xE9s",allDevicesOption:"Disposition par d\xE9faut des appareils",commands:"Commandes",power:"Bouton Marche/Arr\xEAt",modeToggle:"Bouton de mode",deviceModeDescription:"Contr\xF4lez un seul appareil configur\xE9 sur le hub, avec ses propres attributions de touches et sa liste compl\xE8te de commandes.",longPress:"Activer la r\xE9p\xE9tition par appui prolong\xE9",longPressDescription:"Maintenez une touche s\xE9lectionn\xE9e pour envoyer sa commande de fa\xE7on r\xE9p\xE9t\xE9e, comme sur la t\xE9l\xE9commande physique.",longPressButtons:"Touches",enableDeviceMode:"Activer le mode appareil",initialView:"Vue initiale",initialViewHelper:"Ce que la carte affiche \xE0 l\u2019ouverture",openOnCurrentActivity:"Activit\xE9 en cours",macrosFavoritesAsRows:"Macros/favoris sous forme de lignes",commandsAsRows:"Commandes sous forme de lignes",favoriteDeviceNames:"Afficher les noms des appareils",rowOptions:V=>`Options de ${V}`,visibleRows:"Lignes visibles",moveGroupUp:V=>`D\xE9placer ${V} vers le haut`,moveGroupDown:V=>`D\xE9placer ${V} vers le bas`,macros:"Macros",favorites:"Favoris",volume:"Volume",channel:"Cha\xEEne",mediaControls:"Lecture",dvr:"DVR",numpad:"Pav\xE9 num\xE9rique",resetDefaultLayout:"R\xE9initialiser",shortcutSlotLeft:"Raccourci gauche",shortcutSlotMiddle:"Raccourci central",shortcutSlotRight:"Raccourci droit",shortcutIcon:"Ic\xF4ne",shortcutCommand:"Commande",shortcutReset:"R\xE9initialiser",shortcutCommandMissing:V=>`Commande ${V} (manquante)`,shortcutsCommandsLoading:"Chargement des commandes\u2026",shortcutsCommandsUnavailable:"Les commandes de cet appareil ne sont pas encore en cache. Actualisez l\u2019appareil dans l\u2019onglet Hub du Panneau de contr\xF4le Sofabaton, puis rechargez le tableau de bord.",shortcutsCommandsError:"Impossible de charger les commandes de cet appareil. Rechargez le tableau de bord et r\xE9essayez.",noteDefaultLayout:"Utilis\xE9e pour les activit\xE9s sans disposition propre",noteDeviceDefaultLayout:"Utilis\xE9e pour les appareils sans disposition propre",noteCustomActivityLayout:"Disposition d\u2019activit\xE9 personnalis\xE9e utilis\xE9e",noteCustomDeviceLayout:"Disposition d\u2019appareil personnalis\xE9e utilis\xE9e",noteUsingActivityDefault:"Disposition par d\xE9faut des activit\xE9s utilis\xE9e",noteUsingDeviceDefault:"Disposition par d\xE9faut des appareils utilis\xE9e"},groups:{activity:"Activit\xE9/appareil",macro_favorites:"Macros/favoris",macros_row:"Ligne des macros",favorites_row:"Ligne des favoris",dpad:"Pav\xE9 directionnel",nav:"Retour/Accueil/Menu",mid:"Volume/Cha\xEEne",media:"Lecture",colors:"Touches de couleur",abc:"A/B/C",shortcuts:"Raccourcis"},keys:{up:"Haut",down:"Bas",left:"Gauche",right:"Droite",ok:"OK",back:"Retour",home:"Accueil",menu:"Menu",volup:"Volume +",voldn:"Volume -",mute:"Muet",chup:"Cha\xEEne +",chdn:"Cha\xEEne -",guide:"Guide",dvr:"DVR",play:"Lecture",exit:"Quitter",rew:"Retour rapide",pause:"Pause",fwd:"Avance rapide",red:"Rouge",green:"Vert",yellow:"Jaune",blue:"Bleu",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Entr\xE9e"}};b("fr",$V);var UV={card:{selectEntityError:"Selecteer een Sofabaton-entiteit voor afstandsbediening",remoteUnavailable:"De afstandsbediening is niet beschikbaar (mogelijk omdat de Sofabaton-app verbonden is).",noActivitiesWarning:"Geen activiteiten gevonden in de attributen van de afstandsbediening.",noMacros:"Geen macro's beschikbaar",noFavorites:"Geen favorieten beschikbaar",noCommands:"Geen commando's beschikbaar",macrosTab:"Macro's",favoritesTab:"Favorieten",commandsTab:"Commando's",powerButton:"In-/uitschakelen",activitySelectLabel:"Activiteit",deviceSelectLabel:"Apparaat",selectDevice:"Selecteer apparaat",allDevicesLayout:"Standaardindeling voor apparaten",filterCommands:"Commando's filteren",switchToDeviceMode:"Naar apparaatmodus schakelen",switchToActivityMode:"Naar activiteitsmodus schakelen",deviceKeymapMissing:"De commando's van dit apparaat zijn nog niet gecachet. Vernieuw het apparaat op het tabblad Hub van het Sofabaton-bedieningspaneel en laad daarna het dashboard opnieuw.",deviceKeymapError:"Kan de commando's van dit apparaat niet laden.",poweredOff:"Uitgeschakeld",defaultLayout:"Standaardindeling voor activiteiten",activityFallback:V=>`Activiteit ${V}`,deviceFallback:V=>`Apparaat ${V}`,pickerName:"Sofabaton virtuele afstandsbediening",pickerDescription:"Een configureerbare afstandsbediening voor de Sofabaton X1-, X1S- en X2-integratie."},assist:{label:"Knopdrukken registreren",start:"Starten",waiting:"Wachten op een knopdruk",exitEditMode:"Verlaat de bewerkingsmodus om te beginnen",captured:V=>`Vastgelegd: ${V}`,notCaptured:"Niet vastgelegd.",working:"Bezig\u2026",triggersReady:"Triggers klaar voor gebruik",createTriggers:"MQTT Discovery-triggers aanmaken",startCapturing:"Begin met commando's vastleggen",deviceDetectedTitle:"Sofabaton-MQTT-apparaat gedetecteerd.",close:"Sluiten",alsoActivityTriggers:"Maak ook triggers aan voor activiteitswisselingen.",seeDocs:"Bekijk de documentatie voor deze functie.",dontShowAgain:"Dit tijdens deze sessie niet opnieuw tonen voor dit apparaat.",detectedDevice:V=>`MQTT-apparaat gedetecteerd: ${V}.`,lastCommand:V=>`Laatste commando: ${V}.`,existingTriggers:"Er zijn bestaande MQTT-automatiseringstriggers gevonden.",noMqttCommands:"Nog geen MQTT-commando's ontdekt",deviceFallback:V=>`Apparaat ${V}`,unknownDevice:"Onbekend apparaat",commandFallback:V=>`Commando ${V}`,createdTriggers:(V,H)=>`${V} MQTT Discovery-triggers aangemaakt voor ${H}`,createdActivityTriggers:V=>`${V} activiteitstriggers aangemaakt voor X2 \u2192 Activities`,plusActivityTriggers:V=>` plus ${V} activiteitstriggers`,allTriggersExist:V=>`Alle MQTT Discovery-triggers bestaan al voor ${V}`,buttonFallback:"Knop",activityFallbackLabel:"Activiteit",unknown:"Onbekend",automationAssistName:"Automatiseringshulp",notification:{title:"\u{1F6E0}\uFE0F Automatiseringshulp",eventButton:V=>`Knop: ${V}`,eventCommand:V=>`Commando: ${V}`,eventActivity:V=>`Activiteitswissel: ${V}`,eventOther:V=>`Gebeurtenis: ${V}`,header:(V,H)=>`**Activiteit: ${V} | ${H}**`,headerDevice:(V,H)=>`**Apparaat: ${V} | ${H}**`,lovelaceHeading:"\u{1F4CB} **Lovelace-knopcode**",lovelaceCopy:"*Kopieer dit naar je dashboard-YAML:*",serviceHeading:"\u2699\uFE0F **Service-aanroep (automatisering)**",serviceCopy:"*Gebruik dit in je scripts of automatiseringen:*"}},editor:{fieldLabels:{entity:"Selecteer een Sofabaton-entiteit voor afstandsbediening",theme:"Pas een thema toe op de kaart",use_background_override:"Achtergrondkleur aanpassen",background_override:"Kies een achtergrondkleur",show_activity:"Activiteits-/apparaatkiezer",show_dpad:"Richtingsknoppen",show_nav:"Terug/Home/Menu-knoppen",show_mid:"Volume-/kanaalknoppen",show_media:"Afspelen",show_colors:"Rood/groen/geel/blauw",show_abc:"A/B/C-knoppen",show_macros_button:"Macroknop",show_favorites_button:"Favorietenknop",max_width:"Maximale kaartbreedte (px)",key_style:"Knopstijl",group_order:"Groepsvolgorde"},generalOptionsTitle:"Algemene opties",keyCapture:"Knopdrukken registreren",keyCaptureDescription:"Stuur knopdrukken naar de hub: leg knopdrukken vast om direct bruikbare YAML te genereren voor dashboardknoppen en automatiseringen.",keyCaptureLearnMore:"Meer informatie over Knopdrukken registreren",keyCaptureDocsAria:"Documentatie over Knopdrukken registreren",stylingOptions:"Stijlopties",keyStyleFlat:"Vlak (zelfde kleur als de kaart)",keyStyleTinted:"Getint (knoppen steken af tegen de achtergrond)",keyStyleElevated:"Verhoogd (getint met schaduw)",keyStyleGlossy:"Glanzend (glimmende, bolle knoppen)",tintedPanels:"Getinte panelen",tintedPanelsDescription:"Toont een getinte achtergrond achter elke groep knoppen.",layoutOptions:"Indelingsopties",layoutSelectLabel:"Indeling",defaultLayoutOption:"Standaardindeling voor activiteiten",allDevicesOption:"Standaardindeling voor apparaten",commands:"Commando's",power:"Aan/uit-knop",modeToggle:"Modusknop",deviceModeDescription:"Bedien \xE9\xE9n apparaat dat op de hub is ingesteld met de knoptoewijzingen en volledige lijst met commando's van dat apparaat.",longPress:"Herhalen bij ingedrukt houden inschakelen",longPressDescription:"Houd een geselecteerde knop ingedrukt om het bijbehorende commando te herhalen, net als op de fysieke afstandsbediening.",longPressButtons:"Knoppen",enableDeviceMode:"Apparaatmodus inschakelen",initialView:"Beginweergave",initialViewHelper:"Wat de kaart toont bij het openen",openOnCurrentActivity:"Huidige activiteit",macrosFavoritesAsRows:"Macro's/favorieten als rijen",commandsAsRows:"Commando's als rijen",favoriteDeviceNames:"Apparaatnamen tonen",rowOptions:V=>`Opties voor ${V}`,visibleRows:"Zichtbare rijen",moveGroupUp:V=>`Verplaats ${V} omhoog`,moveGroupDown:V=>`Verplaats ${V} omlaag`,macros:"Macro's",favorites:"Favorieten",volume:"Volume",channel:"Kanaal",mediaControls:"Afspelen",dvr:"DVR",numpad:"Cijfertoetsen",resetDefaultLayout:"Indeling resetten",shortcutSlotLeft:"Linker snelkoppeling",shortcutSlotMiddle:"Middelste snelkoppeling",shortcutSlotRight:"Rechter snelkoppeling",shortcutIcon:"Pictogram",shortcutCommand:"Commando",shortcutReset:"Resetten",shortcutCommandMissing:V=>`Commando ${V} (ontbreekt)`,shortcutsCommandsLoading:"Commando's laden\u2026",shortcutsCommandsUnavailable:"De commando's van dit apparaat zijn nog niet gecachet. Vernieuw het apparaat op het tabblad Hub van het Sofabaton-bedieningspaneel en laad daarna het dashboard opnieuw.",shortcutsCommandsError:"Kan de commando's van dit apparaat niet laden. Laad het dashboard opnieuw en probeer het nogmaals.",noteDefaultLayout:"Gebruikt voor activiteiten zonder eigen indeling",noteDeviceDefaultLayout:"Gebruikt voor apparaten zonder eigen indeling",noteCustomActivityLayout:"Aangepaste activiteitenindeling in gebruik",noteCustomDeviceLayout:"Aangepaste apparaatindeling in gebruik",noteUsingActivityDefault:"Standaardindeling voor activiteiten in gebruik",noteUsingDeviceDefault:"Standaardindeling voor apparaten in gebruik"},groups:{activity:"Activiteit/apparaat",macro_favorites:"Macro's/favorieten",macros_row:"Macrorij",favorites_row:"Favorietenrij",dpad:"Richtingsknoppen",nav:"Terug/Home/Menu",mid:"Volume/kanaal",media:"Afspelen",colors:"Kleurknoppen",abc:"A/B/C",shortcuts:"Snelkoppelingen"},keys:{up:"Omhoog",down:"Omlaag",left:"Links",right:"Rechts",ok:"OK",back:"Terug",home:"Home",menu:"Menu",volup:"Vol +",voldn:"Vol -",mute:"Dempen",chup:"CH +",chdn:"CH -",guide:"Gids",dvr:"DVR",play:"Afspelen",exit:"Afsluiten",rew:"Terugspoelen",pause:"Pauze",fwd:"Vooruitspoelen",red:"Rood",green:"Groen",yellow:"Geel",blue:"Blauw",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Enter"}};b("nl",UV);var WV={card:{selectEntityError:"\u8BF7\u9009\u62E9 Sofabaton \u9065\u63A7\u5B9E\u4F53",remoteUnavailable:"\u9065\u63A7\u4E0D\u53EF\u7528\uFF08\u53EF\u80FD\u662F\u56E0\u4E3A Sofabaton \u5E94\u7528\u5DF2\u8FDE\u63A5\uFF09\u3002",noActivitiesWarning:"\u5728\u9065\u63A7\u5C5E\u6027\u4E2D\u672A\u627E\u5230\u6D3B\u52A8\u3002",noMacros:"\u6CA1\u6709\u53EF\u7528\u7684\u5B8F",noFavorites:"\u6CA1\u6709\u53EF\u7528\u7684\u6536\u85CF",noCommands:"\u6CA1\u6709\u53EF\u7528\u547D\u4EE4",macrosTab:"\u5B8F",favoritesTab:"\u6536\u85CF",commandsTab:"\u547D\u4EE4",powerButton:"\u5207\u6362\u7535\u6E90",activitySelectLabel:"\u6D3B\u52A8",deviceSelectLabel:"\u8BBE\u5907",selectDevice:"\u9009\u62E9\u8BBE\u5907",allDevicesLayout:"\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40",filterCommands:"\u7B5B\u9009\u547D\u4EE4",switchToDeviceMode:"\u5207\u6362\u5230\u8BBE\u5907\u6A21\u5F0F",switchToActivityMode:"\u5207\u6362\u5230\u6D3B\u52A8\u6A21\u5F0F",deviceKeymapMissing:"\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u5C1A\u672A\u7F13\u5B58\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u7684 Hub \u6807\u7B7E\u9875\u4E2D\u5237\u65B0\u6B64\u8BBE\u5907\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\u3002",deviceKeymapError:"\u65E0\u6CD5\u52A0\u8F7D\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u3002",poweredOff:"\u5DF2\u5173\u673A",defaultLayout:"\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",activityFallback:V=>`\u6D3B\u52A8 ${V}`,deviceFallback:V=>`\u8BBE\u5907 ${V}`,pickerName:"Sofabaton \u865A\u62DF\u9065\u63A7\u5668",pickerDescription:"\u9002\u7528\u4E8E Sofabaton X1\u3001X1S \u548C X2 \u96C6\u6210\u7684\u53EF\u914D\u7F6E\u9065\u63A7\u5668\u3002"},assist:{label:"\u6309\u952E\u6355\u83B7",start:"\u5F00\u59CB",waiting:"\u7B49\u5F85\u6309\u952E",exitEditMode:"\u9000\u51FA\u7F16\u8F91\u6A21\u5F0F\u540E\u5373\u53EF\u5F00\u59CB",captured:V=>`\u5DF2\u6355\u83B7\uFF1A${V}`,notCaptured:"\u5C1A\u672A\u6355\u83B7\u3002",working:"\u6B63\u5728\u5904\u7406\u2026",triggersReady:"\u89E6\u53D1\u5668\u5DF2\u5C31\u7EEA",createTriggers:"\u521B\u5EFA MQTT Discovery \u89E6\u53D1\u5668",startCapturing:"\u5F00\u59CB\u6355\u83B7\u547D\u4EE4",deviceDetectedTitle:"\u5DF2\u68C0\u6D4B\u5230 Sofabaton MQTT \u8BBE\u5907\u3002",close:"\u5173\u95ED",alsoActivityTriggers:"\u540C\u65F6\u4E3A\u6D3B\u52A8\u53D8\u66F4\u521B\u5EFA\u89E6\u53D1\u5668\u3002",seeDocs:"\u67E5\u770B\u6B64\u529F\u80FD\u7684\u6587\u6863\u3002",dontShowAgain:"\u672C\u6B21\u4F1A\u8BDD\u4E2D\u4E0D\u518D\u4E3A\u6B64\u8BBE\u5907\u663E\u793A\u6B64\u63D0\u793A\u3002",detectedDevice:V=>`\u68C0\u6D4B\u5230 MQTT \u8BBE\u5907\uFF1A${V}\u3002`,lastCommand:V=>`\u6700\u540E\u4E00\u4E2A\u547D\u4EE4\uFF1A${V}\u3002`,existingTriggers:"\u53D1\u73B0\u5DF2\u6709\u7684 MQTT \u81EA\u52A8\u5316\u89E6\u53D1\u5668\u3002",noMqttCommands:"\u5C1A\u672A\u53D1\u73B0 MQTT \u547D\u4EE4",deviceFallback:V=>`\u8BBE\u5907 ${V}`,unknownDevice:"\u672A\u77E5\u8BBE\u5907",commandFallback:V=>`\u547D\u4EE4 ${V}`,createdTriggers:(V,H)=>`\u5DF2\u4E3A\u201C${H}\u201D\u521B\u5EFA ${V} \u4E2A MQTT Discovery \u89E6\u53D1\u5668`,createdActivityTriggers:V=>`\u5DF2\u4E3A X2 \u2192 \u6D3B\u52A8\u521B\u5EFA ${V} \u4E2A\u6D3B\u52A8\u89E6\u53D1\u5668`,plusActivityTriggers:V=>`\uFF0C\u53E6\u521B\u5EFA ${V} \u4E2A\u6D3B\u52A8\u89E6\u53D1\u5668`,allTriggersExist:V=>`\u201C${V}\u201D\u7684\u6240\u6709 MQTT Discovery \u89E6\u53D1\u5668\u5747\u5DF2\u5B58\u5728`,buttonFallback:"\u6309\u952E",activityFallbackLabel:"\u6D3B\u52A8",unknown:"\u672A\u77E5",automationAssistName:"\u81EA\u52A8\u5316\u52A9\u624B",notification:{title:"\u{1F6E0}\uFE0F \u81EA\u52A8\u5316\u52A9\u624B",eventButton:V=>`\u6309\u952E\uFF1A${V}`,eventCommand:V=>`\u547D\u4EE4\uFF1A${V}`,eventActivity:V=>`\u6D3B\u52A8\u53D8\u66F4\uFF1A${V}`,eventOther:V=>`\u4E8B\u4EF6\uFF1A${V}`,header:(V,H)=>`**\u6D3B\u52A8\uFF1A${V} | ${H}**`,headerDevice:(V,H)=>`**\u8BBE\u5907\uFF1A${V} | ${H}**`,lovelaceHeading:"\u{1F4CB} **Lovelace \u6309\u94AE\u4EE3\u7801**",lovelaceCopy:"*\u5C06\u5176\u590D\u5236\u5230\u4EEA\u8868\u677F YAML \u4E2D\uFF1A*",serviceHeading:"\u2699\uFE0F **\u670D\u52A1\u8C03\u7528\uFF08\u81EA\u52A8\u5316\uFF09**",serviceCopy:"*\u5728\u811A\u672C\u6216\u81EA\u52A8\u5316\u4E2D\u4F7F\u7528\u6B64\u5185\u5BB9\uFF1A*"}},editor:{fieldLabels:{entity:"\u9009\u62E9 Sofabaton \u9065\u63A7\u5B9E\u4F53",theme:"\u4E3A\u5361\u7247\u5E94\u7528\u4E3B\u9898",use_background_override:"\u81EA\u5B9A\u4E49\u80CC\u666F\u989C\u8272",background_override:"\u9009\u62E9\u80CC\u666F\u989C\u8272",show_activity:"\u6D3B\u52A8/\u8BBE\u5907\u9009\u62E9\u5668",show_dpad:"\u65B9\u5411\u952E",show_nav:"\u8FD4\u56DE/\u4E3B\u9875/\u83DC\u5355\u952E",show_mid:"\u97F3\u91CF/\u9891\u9053\u8C03\u8282\u952E",show_media:"\u64AD\u653E",show_colors:"\u7EA2/\u7EFF/\u9EC4/\u84DD",show_abc:"A/B/C \u6309\u952E",show_macros_button:"\u5B8F\u6309\u94AE",show_favorites_button:"\u6536\u85CF\u6309\u94AE",max_width:"\u5361\u7247\u6700\u5927\u5BBD\u5EA6\uFF08px\uFF09",key_style:"\u6309\u952E\u6837\u5F0F",group_order:"\u5206\u7EC4\u987A\u5E8F"},generalOptionsTitle:"\u5E38\u89C4\u9009\u9879",keyCapture:"\u6309\u952E\u6355\u83B7",keyCaptureDescription:"\u5C06\u6309\u952E\u64CD\u4F5C\u53D1\u9001\u5230 Hub\uFF0C\u4EE5\u751F\u6210\u53EF\u76F4\u63A5\u7528\u4E8E\u4EEA\u8868\u677F\u6309\u94AE\u548C\u81EA\u52A8\u5316\u7684 YAML\u3002",keyCaptureLearnMore:"\u8BE6\u7EC6\u4E86\u89E3\u6309\u952E\u6355\u83B7",keyCaptureDocsAria:"\u6309\u952E\u6355\u83B7\u6587\u6863",stylingOptions:"\u6837\u5F0F\u9009\u9879",keyStyleFlat:"\u6241\u5E73\uFF08\u4E0E\u5361\u7247\u80CC\u666F\u76F8\u540C\uFF09",keyStyleTinted:"\u7740\u8272\uFF08\u6309\u952E\u4E0E\u80CC\u666F\u533A\u5206\u5F00\uFF09",keyStyleElevated:"\u60AC\u6D6E\uFF08\u7740\u8272\u5E76\u5E26\u9634\u5F71\uFF09",keyStyleGlossy:"\u5149\u6CFD\uFF08\u6709\u5149\u6CFD\u7684\u7ACB\u4F53\u6309\u952E\uFF09",tintedPanels:"\u7740\u8272\u9762\u677F",tintedPanelsDescription:"\u5728\u6BCF\u7EC4\u6309\u952E\u540E\u65B9\u663E\u793A\u7740\u8272\u80CC\u666F\u3002",layoutOptions:"\u5E03\u5C40\u9009\u9879",layoutSelectLabel:"\u5E03\u5C40",defaultLayoutOption:"\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",allDevicesOption:"\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40",commands:"\u547D\u4EE4",power:"\u7535\u6E90\u6309\u94AE",modeToggle:"\u6A21\u5F0F\u5207\u6362",deviceModeDescription:"\u63A7\u5236 Hub \u4E2D\u914D\u7F6E\u7684\u5355\u4E2A\u8BBE\u5907\uFF0C\u5E76\u4F7F\u7528\u8BE5\u8BBE\u5907\u81EA\u5DF1\u7684\u6309\u952E\u5206\u914D\u548C\u5B8C\u6574\u547D\u4EE4\u5217\u8868\u3002",longPress:"\u542F\u7528\u957F\u6309\u91CD\u590D\u53D1\u9001",longPressDescription:"\u6309\u4F4F\u6240\u9009\u6309\u952E\u53EF\u91CD\u590D\u53D1\u9001\u5176\u547D\u4EE4\uFF0C\u5C31\u50CF\u4F7F\u7528\u7269\u7406\u9065\u63A7\u5668\u4E00\u6837\u3002",longPressButtons:"\u6309\u952E",enableDeviceMode:"\u542F\u7528\u8BBE\u5907\u6A21\u5F0F",initialView:"\u521D\u59CB\u89C6\u56FE",initialViewHelper:"\u5361\u7247\u6253\u5F00\u65F6\u663E\u793A\u7684\u5185\u5BB9",openOnCurrentActivity:"\u5F53\u524D\u6D3B\u52A8",macrosFavoritesAsRows:"\u5C06\u5B8F/\u6536\u85CF\u663E\u793A\u4E3A\u884C",commandsAsRows:"\u5C06\u547D\u4EE4\u663E\u793A\u4E3A\u884C",favoriteDeviceNames:"\u663E\u793A\u8BBE\u5907\u540D\u79F0",rowOptions:V=>`${V}\u9009\u9879`,visibleRows:"\u53EF\u89C1\u884C",moveGroupUp:V=>`\u5C06${V}\u4E0A\u79FB`,moveGroupDown:V=>`\u5C06${V}\u4E0B\u79FB`,macros:"\u5B8F",favorites:"\u6536\u85CF",volume:"\u97F3\u91CF",channel:"\u9891\u9053",mediaControls:"\u64AD\u653E",dvr:"DVR",numpad:"\u6570\u5B57\u952E\u76D8",resetDefaultLayout:"\u91CD\u7F6E\u5E03\u5C40",shortcutSlotLeft:"\u5DE6\u4FA7\u5FEB\u6377\u6309\u952E",shortcutSlotMiddle:"\u4E2D\u95F4\u5FEB\u6377\u6309\u952E",shortcutSlotRight:"\u53F3\u4FA7\u5FEB\u6377\u6309\u952E",shortcutIcon:"\u56FE\u6807",shortcutCommand:"\u547D\u4EE4",shortcutReset:"\u91CD\u7F6E",shortcutCommandMissing:V=>`\u547D\u4EE4 ${V}\uFF08\u7F3A\u5931\uFF09`,shortcutsCommandsLoading:"\u6B63\u5728\u52A0\u8F7D\u547D\u4EE4\u2026",shortcutsCommandsUnavailable:"\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u5C1A\u672A\u7F13\u5B58\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u7684 Hub \u6807\u7B7E\u9875\u4E2D\u5237\u65B0\u6B64\u8BBE\u5907\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\u3002",shortcutsCommandsError:"\u65E0\u6CD5\u52A0\u8F7D\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",noteDefaultLayout:"\u7528\u4E8E\u6CA1\u6709\u5355\u72EC\u5E03\u5C40\u7684\u6D3B\u52A8",noteDeviceDefaultLayout:"\u7528\u4E8E\u6CA1\u6709\u5355\u72EC\u5E03\u5C40\u7684\u8BBE\u5907",noteCustomActivityLayout:"\u6B63\u5728\u4F7F\u7528\u81EA\u5B9A\u4E49\u6D3B\u52A8\u5E03\u5C40",noteCustomDeviceLayout:"\u6B63\u5728\u4F7F\u7528\u81EA\u5B9A\u4E49\u8BBE\u5907\u5E03\u5C40",noteUsingActivityDefault:"\u6B63\u5728\u4F7F\u7528\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",noteUsingDeviceDefault:"\u6B63\u5728\u4F7F\u7528\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40"},groups:{activity:"\u6D3B\u52A8/\u8BBE\u5907",macro_favorites:"\u5B8F/\u6536\u85CF",macros_row:"\u5B8F\u884C",favorites_row:"\u6536\u85CF\u884C",dpad:"\u65B9\u5411\u952E",nav:"\u8FD4\u56DE/\u4E3B\u9875/\u83DC\u5355",mid:"\u97F3\u91CF/\u9891\u9053",media:"\u64AD\u653E",colors:"\u5F69\u8272\u6309\u952E",abc:"A/B/C",shortcuts:"\u5FEB\u6377\u6309\u952E"},keys:{up:"\u4E0A",down:"\u4E0B",left:"\u5DE6",right:"\u53F3",ok:"\u786E\u5B9A",back:"\u8FD4\u56DE",home:"\u4E3B\u9875",menu:"\u83DC\u5355",volup:"\u97F3\u91CF +",voldn:"\u97F3\u91CF -",mute:"\u9759\u97F3",chup:"\u9891\u9053 +",chdn:"\u9891\u9053 -",guide:"\u8282\u76EE\u6307\u5357",dvr:"DVR",play:"\u64AD\u653E",exit:"\u9000\u51FA",rew:"\u5FEB\u9000",pause:"\u6682\u505C",fwd:"\u5FEB\u8FDB",red:"\u7EA2",green:"\u7EFF",yellow:"\u9EC4",blue:"\u84DD",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"\u786E\u5B9A"}};b("zh-hans",WV);var o5="sofabaton-remote",AH="/ui/embed/",Rt="server";function GV(){let V;try{V=import.meta.url}catch{return null}return typeof V!="string"||!V.includes(AH)?null:X0(V,AH)}var zV=GV(),qV=["hub","server","theme","lang","device","config"],KV=`
  :host {
    display: block;
    box-sizing: border-box;
    color: var(--primary-text-color);
    font-family: Roboto, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  :host([hidden]) { display: none; }
  .notice, .banner {
    box-sizing: border-box;
    max-width: 360px;
    margin: 0 auto 8px;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 13px;
    line-height: 1.4;
  }
  .notice {
    background: var(--card-background-color);
    border: 1px solid var(--divider-color);
    color: var(--primary-text-color);
  }
  .banner {
    background: rgba(var(--rgb-error-color), 0.12);
    color: var(--error-color);
  }
  .probe {
    position: absolute;
    width: 0;
    height: 0;
    overflow: hidden;
    pointer-events: none;
  }
`,M5=class extends HTMLElement{constructor(){super();this._stage=null;this._notice=null;this._banner=null;this._probe=null;this._backend=null;this._card=null;this._unsubscribe=null;this._hub=null;this._lastBanner=null;this._bootEpoch=0;this._bootQueued=!1;this._configOverride=null;this._appliedThemeVars=[];this._media=null;this._onMediaChange=()=>this._applyTheme();this._shadow=this.attachShadow({mode:"open"})}static get observedAttributes(){return qV}get hub(){return this.getAttribute("hub")??""}set hub(C){this._setOrRemove("hub",C)}get server(){return this.getAttribute("server")??""}set server(C){this._setOrRemove("server",C)}get theme(){return Q0(this.getAttribute("theme"))}set theme(C){this._setOrRemove("theme",C)}get lang(){return this.getAttribute("lang")??""}set lang(C){this._setOrRemove("lang",C)}get device(){let C=this.getAttribute("device");if(C==null||C.trim()==="")return null;let e=Number(C);return Number.isFinite(e)?e:null}set device(C){this._setOrRemove("device",C==null?null:String(C))}get config(){return this._configOverride}set config(C){if(typeof C=="string"){this._setOrRemove("config",C);return}this._configOverride=C&&typeof C=="object"&&!Array.isArray(C)?{...C}:null,this.hasAttribute("config")?this.removeAttribute("config"):this._scheduleBoot()}get hubId(){return this._hub?.hub_id??null}refreshTheme(){this.isConnected&&this._applyTheme()}reload(){this._scheduleBoot()}_setOrRemove(C,e){e==null||e===""?this.removeAttribute(C):this.setAttribute(C,String(e))}connectedCallback(){this._renderShell(),typeof matchMedia=="function"&&!this._media&&(this._media=matchMedia("(prefers-color-scheme: dark)"),this._media.addEventListener("change",this._onMediaChange)),this._applyTheme(),this._scheduleBoot()}disconnectedCallback(){this._bootEpoch+=1,this._teardown(),this._media&&(this._media.removeEventListener("change",this._onMediaChange),this._media=null)}attributeChangedCallback(C,e,L){if(e!==L&&(C==="config"&&(this._configOverride=QV(L)),!!this.isConnected)){if(C==="theme"){this._applyTheme();return}if(C==="lang"){this._card?.setLanguage(this._language());return}this._scheduleBoot()}}_scheduleBoot(){!this.isConnected||this._bootQueued||(this._bootQueued=!0,queueMicrotask(()=>{this._bootQueued=!1,this.isConnected&&this._boot()}))}async _boot(){let C=++this._bootEpoch;this._teardown();let e=this._serverBase();if(!e){this._fail({code:"server_missing",message:this.server?`The server attribute is not an http(s) URL: ${this.server}`:"Set the server attribute to the sofabaton-x-server base URL (for example http://nas:8480)."});return}let L=C7(typeof location<"u"?location.protocol:void 0,e);if(L){this._fail(L);return}let r=(s,A)=>fetch(s,A),t=typeof location<"u"?location.origin:void 0,i=await H7(e,this.hub,r,{pageOrigin:t});if(C!==this._bootEpoch)return;if(i.error||!i.hub){this._fail(i.error??{code:"hub_not_found",message:"No such hub."});return}let o=i.hub,a=this._configOverride;if(!a&&(a=await V7(e,o.hub_id,r),C!==this._bootEpoch))return;let l=new k1({baseUrl:e});l.setTarget(o.hub_id);let n=document.createElement(L2);n.setConfig(Y0(o.hub_id,a,{openDevice:this.device})),n.setLanguage(this._language()),n.setBackend(l),this._backend=l,this._card=n,this._hub=o,this._notice&&(this._notice.hidden=!0),this._stage?.replaceChildren(n),this._unsubscribe=l.subscribe(()=>this._syncBanner()),this._syncBanner(),this.dispatchEvent(new CustomEvent("sofabaton-remote-ready",{detail:{hub:o.hub_id,name:o.config?.name??null},bubbles:!0,composed:!0}))}_teardown(){this._unsubscribe?.(),this._unsubscribe=null,this._card?.setBackend(null),this._card?.remove(),this._card=null,this._backend?.stop(),this._backend=null,this._hub=null,this._lastBanner=null,this._banner&&(this._banner.hidden=!0,this._banner.textContent="")}_fail(C){this._notice&&(this._notice.textContent=C.message,this._notice.hidden=!1),this.dispatchEvent(new CustomEvent("sofabaton-remote-error",{detail:{code:C.code,message:C.message},bubbles:!0,composed:!0}))}_serverBase(){let C=typeof location<"u"?location.href:void 0,e=this.server;return e?J0(e,C):zV}_language(){let C=typeof navigator<"u"?navigator.language:"";return(this.lang||C||"").trim()||void 0}_renderShell(){this._stage||(this._shadow.innerHTML=`<style>${KV}</style>
      <div class="probe" aria-hidden="true"></div>
      <div class="banner" part="banner" hidden></div>
      <div class="notice" part="notice" hidden></div>
      <div class="stage" part="stage"></div>`,this._probe=this._shadow.querySelector(".probe"),this._banner=this._shadow.querySelector(".banner"),this._notice=this._shadow.querySelector(".notice"),this._stage=this._shadow.querySelector(".stage"))}_syncBanner(){if(!this._banner||!this._backend)return;let C=e7(this._backend.snapshot(),this._backend.lastError);C!==this._lastBanner&&(this._lastBanner=C,this._banner.hidden=!C,this._banner.textContent=C??"")}_applyTheme(){for(let L of this._appliedThemeVars)this.style.removeProperty(L);this._appliedThemeVars=[],this.style.removeProperty("color-scheme");let C=getComputedStyle(this),e=j0({theme:this.theme,hostValue:L=>C.getPropertyValue(L).trim(),prefersDark:this._media?.matches??!1,resolveColor:L=>this._resolveColor(L),hostColorScheme:C.getPropertyValue("color-scheme").trim()});for(let[L,r]of Object.entries(e.values))this.style.setProperty(L,r),this._appliedThemeVars.push(L);e.colorScheme&&this.style.setProperty("color-scheme",e.colorScheme)}_resolveColor(C){let e=this._probe;if(!e)return J2(C);if(e.style.color="",e.style.color=C,!e.style.color)return null;let L=J2(getComputedStyle(e).color);return e.style.color="",L}};function QV(V){if(V==null||V.trim()==="")return null;try{let H=JSON.parse(V);if(H&&typeof H=="object"&&!Array.isArray(H))return H}catch{}return console.warn(`<${o5}>: the config attribute is not a JSON object; using the server's layout.`),null}function jV(){MH(),c0(),customElements.get(L2)||customElements.define(L2,b1),customElements.get(o5)||customElements.define(o5,M5)}typeof window<"u"&&typeof customElements<"u"&&jV();export{Rt as EMBED_DIST,AH as EMBED_MARKER,o5 as EMBED_TAG,_V as MIN_SERVER_VERSION,M5 as SofabatonRemote,jV as bootstrapRemoteEmbed};
