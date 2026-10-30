var R="/api/v1";function s1(C){if(C==null||C==="")return null;let V=Number(C);return Number.isFinite(V)?V:null}var l1=class extends Error{constructor(H,e){super(H);this.status=e}},yH=6e3;function A1(C){return C instanceof Error?C.message:String(C)}function m5(C){let V={};for(let H of C){let e=s1(H.long_press_device_id),L=s1(H.long_press_command_id);e&&L!=null&&(V[String(H.button_code)]={device_id:e,command_id:L})}return V}var _1=class C{constructor(V={}){this.kind="server";this.hubId="";this.listeners=[];this.hubStatus=null;this.activities=[];this.devices=[];this.running=null;this.activityPages={};this.devicePages={};this.devicePageVersions={};this.loaded=!1;this.catalogLoaded=!1;this._lastError=null;this._controlRefusedAt=null;this.firstAnswerPending=!0;this.loadEpoch=0;this.loadPromise=null;this.loadDirty=!1;this.runningEpoch=0;this.statusPromise=null;this.statusDirty=!1;this.pagePromises={};this.retryTimer=null;this.snapshotCache=null;this.socket=null;this.socketGeneration=0;this.reconnectTimer=null;this.streaming=!1;this.baseUrl=String(V.baseUrl??"").replace(/\/+$/,""),this.fetchImpl=V.fetch??((H,e)=>globalThis.fetch(H,e)),this.wsFactory=V.webSocket??(typeof WebSocket=="function"?H=>new WebSocket(H):null),this.retryBaseMs=Math.max(100,V.reconnectDelayMs??1e3),this.reconnectDelay=this.retryBaseMs,this.retryDelay=this.retryBaseMs}get target(){return this.hubId}get lastError(){return this._lastError}setTarget(V){let H=String(V??"");H!==this.hubId&&(this.hubId=H,this.resetState(),this.closeSocket(),this.listeners.length&&this.start())}snapshot(){if(this.hubId)return this.snapshotCache===null&&(this.snapshotCache=this.buildSnapshot()),this.snapshotCache}subscribe(V){return this.listeners.push(V),this.listeners.length===1&&this.start(),()=>{this.listeners=this.listeners.filter(H=>H!==V),this.listeners.length||this.stop()}}async probeIntegration(){if(!this.hubId)throw new Error("no hub selected");if(await this.ensureLoaded(),!this.hubStatus)throw new Error(this._lastError??"hub status unavailable");return"x1s"}async devicePowerState(V){try{let e=(await this.get(`/devices/${V}/power-state`))?.power_state;return e===1?1:e===0?0:null}catch{return null}}async deviceKeymap(V){if(!this.hubId||(await this.ensureLoaded(),!this.hubStatus||!this.loaded||!this.catalogLoaded))return null;let H=this.devices.find(r=>r.device_id===V);if(!H)return{keymap:null,reason:"cache_miss"};let e=String(V);if(!this.devicePages[e]&&(await this.readDevicePage(V),!this.devicePages[e]))return null;let L=this.devicePages[e];return{keymap:{device:{device_id:H.device_id,name:H.name,device_class:H.device_class??void 0},buttons:L.buttons.map(r=>r.button_code),bindings:L.buttons.filter(r=>r.command_id!=null).map(r=>({button_id:r.button_code,button_name:r.name,command_id:Number(r.command_id),long_press_command_id:r.long_press_command_id??null})),commands:L.commands.map(r=>({command_id:r.command_id,name:r.label})),power_configured:H.idle_behavior!=null&&[1,2,3].includes(Number(H.idle_behavior))}}}async sendCommand(V,H){let e=s1(V);if(e==null)return;let L=s1(H);L||(L=this.running?.activity_id??null),L!=null&&await this.post("/send",{entity_id:L,command_id:e})}async startActivity(V){let H=V.id??this.activities.find(e=>e.name===V.name)?.activity_id??null;H!=null&&await this.post(`/activities/${H}/start`)}async stopActivity(){let V=this.running?.activity_id;V!=null&&await this.post(`/activities/${V}/stop`)}start(){this.hubId&&(this.ensureLoaded(),this.openSocket())}stop(){this.closeSocket(),this.cancelRetry()}resetState(){this.hubStatus=null,this.firstAnswerPending=!0,this.activities=[],this.devices=[],this.running=null,this.activityPages={},this.devicePages={},this.devicePageVersions={},this.loaded=!1,this.catalogLoaded=!1,this._lastError=null,this.loadEpoch+=1,this.runningEpoch+=1,this.loadDirty=!1,this.statusDirty=!1,this.pagePromises={},this.cancelRetry(),this.invalidate()}static readable(V){return!!(V&&V.enabled&&V.status)}invalidate(){this.snapshotCache=null}notify(){for(let V of[...this.listeners])V()}url(V){return`${this.baseUrl}${R}/hubs/${encodeURIComponent(this.hubId)}${V}`}async get(V){let H=await this.fetchImpl(this.url(V),{headers:{accept:"application/json"}});if(!H.ok)throw new l1(`GET ${V} -> ${H.status}`,H.status);return await H.json()}async post(V,H){let e=await this.fetchImpl(this.url(V),{method:"POST",headers:H?{accept:"application/json","content-type":"application/json"}:{accept:"application/json"},body:H?JSON.stringify(H):void 0});if(!e.ok)throw this.noteControlRefused(),new l1(`POST ${V} -> ${e.status}`,e.status)}get controlRefused(){return this._controlRefusedAt!==null}noteControlRefused(){let V=Date.now();this._controlRefusedAt=V,this.notify(),setTimeout(()=>{this._controlRefusedAt===V&&(this._controlRefusedAt=null,this.notify())},yH)}ensureLoaded(){return this.loaded?Promise.resolve():this.loadPromise??this.reload()}reload(){return this.loadEpoch+=1,this.loadPromise?(this.loadDirty=!0,this.loadPromise):(this.loadPromise=(async()=>{do this.loadDirty=!1,await this.loadAll(this.loadEpoch);while(this.loadDirty)})().finally(()=>{this.loadPromise=null}),this.loadPromise)}async loadAll(V){if(!this.hubId)return;let H=this.hubId,e=this.runningEpoch,L=()=>V===this.loadEpoch&&H===this.hubId;try{let r=await this.get("/status");if(!L())return;if(this.hubStatus=r,this.firstAnswerPending=!1,this._lastError=null,C.readable(r)){let[t,o,i]=await Promise.all([this.get("/activities"),this.get("/devices"),this.get("/activity")]);if(!L())return;this.activities=t,this.devices=o,e===this.runningEpoch&&(this.running=i),this.catalogLoaded=!0}else this.running=null;this.loaded=!0,this.cancelRetry()}catch(r){if(!L())return;if(r instanceof l1&&r.status===404&&await this.relocateHub(H)){this.reload();return}this._lastError=A1(r),this.hubStatus=null,this.firstAnswerPending=!1,this.loaded=!1,this.scheduleRetry()}this.invalidate(),this.notify(),L()&&this.running&&await this.ensureActivityPages(this.running.activity_id)}async relocateHub(V){try{let H=await this.fetchImpl(`${this.baseUrl}${R}/hubs`,{headers:{accept:"application/json"}});if(!H.ok||V!==this.hubId)return!1;let e=await H.json(),L=Array.isArray(e)?e.find(r=>r?.hub_id&&r.hub_id!==V&&r.config?.host===V):null;return!L?.hub_id||V!==this.hubId?!1:(this.moveTarget(String(L.hub_id)),!0)}catch{return!1}}moveTarget(V){this.hubId=V,this.pagePromises={};let H=this.streaming;this.closeSocket(),H&&this.openSocket(),this.notify()}refreshStatus(){return this.statusPromise?(this.statusDirty=!0,this.statusPromise):(this.statusPromise=(async()=>{do this.statusDirty=!1,await this.readStatus();while(this.statusDirty)})().finally(()=>{this.statusPromise=null}),this.statusPromise)}async readStatus(){let V=this.hubId,H=this.loadEpoch,e=this.runningEpoch,L=()=>H===this.loadEpoch&&V===this.hubId;try{let r=await this.get("/status");if(!L())return;if(this.hubStatus=r,this.firstAnswerPending=!1,this._lastError=null,this.retryDelay=this.retryBaseMs,C.readable(r)){if(!this.catalogLoaded){this.reload();return}let t=await this.get("/activity");if(!L())return;e===this.runningEpoch&&(this.running=t)}else this.running=null}catch(r){if(!L())return;this._lastError=A1(r),this.hubStatus=null,this.firstAnswerPending=!1,this.scheduleRetry()}this.invalidate(),this.notify()}ensureActivityPages(V){let H=String(V);if(this.activityPages[H])return Promise.resolve();let e=this.pagePromises[H];if(e&&e.epoch===this.loadEpoch)return e.promise;let L=this.loadActivityPages(V).finally(()=>{this.pagePromises[H]?.promise===L&&delete this.pagePromises[H]});return this.pagePromises[H]={epoch:this.loadEpoch,promise:L},L}async loadActivityPages(V){let H=this.hubId,e=this.loadEpoch,L=()=>e===this.loadEpoch&&H===this.hubId;try{let[r,t,o]=await Promise.all([this.get(`/entities/${V}/buttons`),this.get(`/activities/${V}/macros`),this.get(`/activities/${V}/favorites`)]);if(!L())return;this.activityPages[String(V)]={buttons:r,macros:t,favorites:o},this.retryDelay=this.retryBaseMs}catch(r){if(!L())return;this._lastError=A1(r),this.scheduleRetry();return}this.invalidate(),this.notify()}async readDevicePage(V){let H=String(V),e=this.hubId,L=this.loadEpoch;try{let[r,t]=await Promise.all([this.get(`/entities/${V}/buttons`),this.get(`/devices/${V}/commands`)]);if(L!==this.loadEpoch||e!==this.hubId)return;this.devicePages[H]={buttons:r,commands:t},this.devicePageVersions[H]=(this.devicePageVersions[H]??0)+1}catch(r){if(L!==this.loadEpoch||e!==this.hubId)return;this._lastError=A1(r);return}this.invalidate(),this.notify()}scheduleRetry(){if(!this.listeners.length||this.retryTimer)return;let V=this.retryDelay;this.retryDelay=Math.min(this.retryDelay*2,3e4),this.retryTimer=setTimeout(()=>{this.retryTimer=null,!(!this.listeners.length||!this.hubId)&&(!this.loaded||!this.hubStatus?this.reload():this.running&&!this.activityPages[String(this.running.activity_id)]&&this.ensureActivityPages(this.running.activity_id))},V)}cancelRetry(){this.retryTimer&&clearTimeout(this.retryTimer),this.retryTimer=null,this.retryDelay=this.retryBaseMs}wsUrl(){let V=this.baseUrl;return!V&&typeof location<"u"&&(V=location.origin),`${V.replace(/^http/,"ws")}${R}/events?hub_id=${encodeURIComponent(this.hubId)}`}openSocket(){if(!this.wsFactory||!this.hubId||this.socket)return;this.streaming=!0;let V=++this.socketGeneration,H;try{H=this.wsFactory(this.wsUrl())}catch(e){this._lastError=A1(e),this.scheduleReconnect();return}this.socket=H,H.onopen=()=>{V===this.socketGeneration&&(this.reconnectDelay=this.retryBaseMs,this.reload())},H.onmessage=e=>{V===this.socketGeneration&&this.handleMessage(e.data)},H.onerror=()=>{},H.onclose=()=>{V===this.socketGeneration&&(this.socket=null,this.streaming&&this.scheduleReconnect())}}closeSocket(){this.streaming=!1,this.socketGeneration+=1,this.reconnectTimer&&clearTimeout(this.reconnectTimer),this.reconnectTimer=null;let V=this.socket;if(this.socket=null,V)try{V.close()}catch{}}scheduleReconnect(){if(!this.streaming||this.reconnectTimer)return;let V=this.reconnectDelay;this.reconnectDelay=Math.min(this.reconnectDelay*2,3e4),this.reconnectTimer=setTimeout(()=>{this.reconnectTimer=null,this.streaming&&this.openSocket()},V)}handleMessage(V){let H;try{H=typeof V=="string"?JSON.parse(V):V}catch{return}if(!(!H||typeof H!="object"))switch(H.type){case"hello":return;case"dropped":this.reload();return;case"server_event":if(H.kind==="hub_rekeyed"&&H.hub_id&&H.hub_id!==this.hubId){this.hubId=String(H.hub_id),this.notify(),this.reload();return}if(H.hub_id!==this.hubId)return;H.kind==="hub_removed"?(this.hubStatus=null,this.firstAnswerPending=!1,this.invalidate(),this.notify()):this.refreshStatus();return;case"hub_event":if(H.hub_id!==this.hubId||!H.event)return;this.handleHubEvent(H.event);return;default:return}}handleHubEvent(V){let H=V.payload??{};switch(V.kind){case"activity_changed":{let e=s1(H.activity_id);this.running=e==null?null:{activity_id:e,name:H.name??null},this.runningEpoch+=1,this.invalidate(),this.notify(),e!=null&&this.ensureActivityPages(e);return}case"hub_state":case"app_state":case"status_changed":this.refreshStatus();return;case"catalog_ready":H.ready?this.reload():this.refreshStatus();return;case"snapshot_changed":{let e=Array.isArray(H.device_ids)?H.device_ids:[],L=Array.isArray(H.activity_ids)?H.activity_ids:[],r=!e.length&&!L.length,t=r?Object.keys(this.devicePages):e.map(String).filter(o=>this.devicePages[o]);if(r||e.length)this.activityPages={};else for(let o of L)delete this.activityPages[String(o)];for(let o of t)delete this.devicePages[o];this.reload().then(()=>Promise.all(t.map(o=>this.readDevicePage(Number(o)))));return}default:return}}runningPagesReady(){return!this.running||!!this.activityPages[String(this.running.activity_id)]}buildSnapshot(){let V=this.hubStatus?.status??null,H=this.hubStatus?.enabled??!1,e=!!(this.hubStatus&&H&&V?.controllable),L=this.firstAnswerPending&&!this.hubStatus,r=this.running?.activity_id??null,t=this.activities.map(m=>({id:m.activity_id,name:m.name,state:m.activity_id===r?"on":"off"})),o=this.devices.map(m=>({id:m.device_id,name:m.name,device_class:m.device_class??void 0})),i={},M={},n={},a={};for(let[m,u]of Object.entries(this.activityPages)){i[m]=u.buttons.map(Z=>Z.button_code),M[m]=u.macros.map(Z=>({id:Z.command_id,name:Z.label??""})),n[m]=u.favorites.map(Z=>({id:Z.command_id,name:Z.label??"",device_id:Z.device_id}));let v=m5(u.buttons);Object.keys(v).length&&(a[m]=v)}for(let[m,u]of Object.entries(this.devicePages)){let v=m5(u.buttons);Object.keys(v).length&&(a[m]=v)}let l=this.running?.name??t.find(m=>m.id===r)?.name??void 0,s={hub_version:String(V?.hub_version??"").toUpperCase(),current_activity:e?l:void 0,current_activity_id:e?r:null,load_state:this.loaded&&this.runningPagesReady()?"ready":"loading",activities:t,devices:o,assigned_keys:i,macro_keys:M,favorite_keys:n,long_press_keys:a,keymap_versions:{...this.devicePageVersions},hub_id:this.hubId};return{state:L?"off":e?r!=null?"on":"off":"unavailable",attributes:s}}};var T1=globalThis,R1=T1.ShadowRoot&&(T1.ShadyCSS===void 0||T1.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,u2=Symbol(),p5=new WeakMap,m1=class{constructor(V,H,e){if(this._$cssResult$=!0,e!==u2)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=V,this.t=H}get styleSheet(){let V=this.o,H=this.t;if(R1&&V===void 0){let e=H!==void 0&&H.length===1;e&&(V=p5.get(H)),V===void 0&&((this.o=V=new CSSStyleSheet).replaceSync(this.cssText),e&&p5.set(H,V))}return V}toString(){return this.cssText}},P1=C=>new m1(typeof C=="string"?C:C+"",void 0,u2),c2=(C,...V)=>{let H=C.length===1?C[0]:V.reduce((e,L,r)=>e+(t=>{if(t._$cssResult$===!0)return t.cssText;if(typeof t=="number")return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(L)+C[r+1],C[0]);return new m1(H,C,u2)},u5=(C,V)=>{if(R1)C.adoptedStyleSheets=V.map(H=>H instanceof CSSStyleSheet?H:H.styleSheet);else for(let H of V){let e=document.createElement("style"),L=T1.litNonce;L!==void 0&&e.setAttribute("nonce",L),e.textContent=H.cssText,C.appendChild(e)}},v2=R1?C=>C:C=>C instanceof CSSStyleSheet?(V=>{let H="";for(let e of V.cssRules)H+=e.cssText;return P1(H)})(C):C;var{is:wH,defineProperty:OH,getOwnPropertyDescriptor:kH,getOwnPropertyNames:_H,getOwnPropertySymbols:TH,getPrototypeOf:RH}=Object,U=globalThis,c5=U.trustedTypes,PH=c5?c5.emptyScript:"",BH=U.reactiveElementPolyfillSupport,p1=(C,V)=>C,x2={toAttribute(C,V){switch(V){case Boolean:C=C?PH:null;break;case Object:case Array:C=C==null?C:JSON.stringify(C)}return C},fromAttribute(C,V){let H=C;switch(V){case Boolean:H=C!==null;break;case Number:H=C===null?null:Number(C);break;case Object:case Array:try{H=JSON.parse(C)}catch{H=null}}return H}},x5=(C,V)=>!wH(C,V),v5={attribute:!0,type:String,converter:x2,reflect:!1,useDefault:!1,hasChanged:x5};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),U.litPropertyMetadata??(U.litPropertyMetadata=new WeakMap);var E=class extends HTMLElement{static addInitializer(V){this._$Ei(),(this.l??(this.l=[])).push(V)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(V,H=v5){if(H.state&&(H.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(V)&&((H=Object.create(H)).wrapped=!0),this.elementProperties.set(V,H),!H.noAccessor){let e=Symbol(),L=this.getPropertyDescriptor(V,e,H);L!==void 0&&OH(this.prototype,V,L)}}static getPropertyDescriptor(V,H,e){let{get:L,set:r}=kH(this.prototype,V)??{get(){return this[H]},set(t){this[H]=t}};return{get:L,set(t){let o=L?.call(this);r?.call(this,t),this.requestUpdate(V,o,e)},configurable:!0,enumerable:!0}}static getPropertyOptions(V){return this.elementProperties.get(V)??v5}static _$Ei(){if(this.hasOwnProperty(p1("elementProperties")))return;let V=RH(this);V.finalize(),V.l!==void 0&&(this.l=[...V.l]),this.elementProperties=new Map(V.elementProperties)}static finalize(){if(this.hasOwnProperty(p1("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(p1("properties"))){let H=this.properties,e=[..._H(H),...TH(H)];for(let L of e)this.createProperty(L,H[L])}let V=this[Symbol.metadata];if(V!==null){let H=litPropertyMetadata.get(V);if(H!==void 0)for(let[e,L]of H)this.elementProperties.set(e,L)}this._$Eh=new Map;for(let[H,e]of this.elementProperties){let L=this._$Eu(H,e);L!==void 0&&this._$Eh.set(L,H)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(V){let H=[];if(Array.isArray(V)){let e=new Set(V.flat(1/0).reverse());for(let L of e)H.unshift(v2(L))}else V!==void 0&&H.push(v2(V));return H}static _$Eu(V,H){let e=H.attribute;return e===!1?void 0:typeof e=="string"?e:typeof V=="string"?V.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(V=>this.enableUpdating=V),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(V=>V(this))}addController(V){(this._$EO??(this._$EO=new Set)).add(V),this.renderRoot!==void 0&&this.isConnected&&V.hostConnected?.()}removeController(V){this._$EO?.delete(V)}_$E_(){let V=new Map,H=this.constructor.elementProperties;for(let e of H.keys())this.hasOwnProperty(e)&&(V.set(e,this[e]),delete this[e]);V.size>0&&(this._$Ep=V)}createRenderRoot(){let V=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return u5(V,this.constructor.elementStyles),V}connectedCallback(){this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),this._$EO?.forEach(V=>V.hostConnected?.())}enableUpdating(V){}disconnectedCallback(){this._$EO?.forEach(V=>V.hostDisconnected?.())}attributeChangedCallback(V,H,e){this._$AK(V,e)}_$ET(V,H){let e=this.constructor.elementProperties.get(V),L=this.constructor._$Eu(V,e);if(L!==void 0&&e.reflect===!0){let r=(e.converter?.toAttribute!==void 0?e.converter:x2).toAttribute(H,e.type);this._$Em=V,r==null?this.removeAttribute(L):this.setAttribute(L,r),this._$Em=null}}_$AK(V,H){let e=this.constructor,L=e._$Eh.get(V);if(L!==void 0&&this._$Em!==L){let r=e.getPropertyOptions(L),t=typeof r.converter=="function"?{fromAttribute:r.converter}:r.converter?.fromAttribute!==void 0?r.converter:x2;this._$Em=L;let o=t.fromAttribute(H,r.type);this[L]=o??this._$Ej?.get(L)??o,this._$Em=null}}requestUpdate(V,H,e,L=!1,r){if(V!==void 0){let t=this.constructor;if(L===!1&&(r=this[V]),e??(e=t.getPropertyOptions(V)),!((e.hasChanged??x5)(r,H)||e.useDefault&&e.reflect&&r===this._$Ej?.get(V)&&!this.hasAttribute(t._$Eu(V,e))))return;this.C(V,H,e)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(V,H,{useDefault:e,reflect:L,wrapped:r},t){e&&!(this._$Ej??(this._$Ej=new Map)).has(V)&&(this._$Ej.set(V,t??H??this[V]),r!==!0||t!==void 0)||(this._$AL.has(V)||(this.hasUpdated||e||(H=void 0),this._$AL.set(V,H)),L===!0&&this._$Em!==V&&(this._$Eq??(this._$Eq=new Set)).add(V))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(H){Promise.reject(H)}let V=this.scheduleUpdate();return V!=null&&await V,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(let[L,r]of this._$Ep)this[L]=r;this._$Ep=void 0}let e=this.constructor.elementProperties;if(e.size>0)for(let[L,r]of e){let{wrapped:t}=r,o=this[L];t!==!0||this._$AL.has(L)||o===void 0||this.C(L,void 0,r,o)}}let V=!1,H=this._$AL;try{V=this.shouldUpdate(H),V?(this.willUpdate(H),this._$EO?.forEach(e=>e.hostUpdate?.()),this.update(H)):this._$EM()}catch(e){throw V=!1,this._$EM(),e}V&&this._$AE(H)}willUpdate(V){}_$AE(V){this._$EO?.forEach(H=>H.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(V)),this.updated(V)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(V){return!0}update(V){this._$Eq&&(this._$Eq=this._$Eq.forEach(H=>this._$ET(H,this[H]))),this._$EM()}updated(V){}firstUpdated(V){}};E.elementStyles=[],E.shadowRootOptions={mode:"open"},E[p1("elementProperties")]=new Map,E[p1("finalized")]=new Map,BH?.({ReactiveElement:E}),(U.reactiveElementVersions??(U.reactiveElementVersions=[])).push("2.1.2");var c1=globalThis,h5=C=>C,B1=c1.trustedTypes,Z5=B1?B1.createPolicy("lit-html",{createHTML:C=>C}):void 0,Z2="$lit$",N=`lit$${Math.random().toFixed(9).slice(2)}$`,S2="?"+N,DH=`<${S2}>`,j=document,v1=()=>j.createComment(""),x1=C=>C===null||typeof C!="object"&&typeof C!="function",g2=Array.isArray,w5=C=>g2(C)||typeof C?.[Symbol.iterator]=="function",h2=`[ 	
\f\r]`,u1=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,S5=/-->/g,g5=/>/g,K=RegExp(`>|${h2}(?:([^\\s"'>=/]+)(${h2}*=${h2}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),f5=/'/g,b5=/"/g,O5=/^(?:script|style|textarea|title)$/i,f2=C=>(V,...H)=>({_$litType$:C,strings:V,values:H}),h=f2(1),k5=f2(2),_5=f2(3),$=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),y5=new WeakMap,Q=j.createTreeWalker(j,129);function T5(C,V){if(!g2(C)||!C.hasOwnProperty("raw"))throw Error("invalid template strings array");return Z5!==void 0?Z5.createHTML(V):V}var R5=(C,V)=>{let H=C.length-1,e=[],L,r=V===2?"<svg>":V===3?"<math>":"",t=u1;for(let o=0;o<H;o++){let i=C[o],M,n,a=-1,l=0;for(;l<i.length&&(t.lastIndex=l,n=t.exec(i),n!==null);)l=t.lastIndex,t===u1?n[1]==="!--"?t=S5:n[1]!==void 0?t=g5:n[2]!==void 0?(O5.test(n[2])&&(L=RegExp("</"+n[2],"g")),t=K):n[3]!==void 0&&(t=K):t===K?n[0]===">"?(t=L??u1,a=-1):n[1]===void 0?a=-2:(a=t.lastIndex-n[2].length,M=n[1],t=n[3]===void 0?K:n[3]==='"'?b5:f5):t===b5||t===f5?t=K:t===S5||t===g5?t=u1:(t=K,L=void 0);let s=t===K&&C[o+1].startsWith("/>")?" ":"";r+=t===u1?i+DH:a>=0?(e.push(M),i.slice(0,a)+Z2+i.slice(a)+N+s):i+N+(a===-2?o:s)}return[T5(C,r+(C[H]||"<?>")+(V===2?"</svg>":V===3?"</math>":"")),e]},h1=class C{constructor({strings:V,_$litType$:H},e){let L;this.parts=[];let r=0,t=0,o=V.length-1,i=this.parts,[M,n]=R5(V,H);if(this.el=C.createElement(M,e),Q.currentNode=this.el.content,H===2||H===3){let a=this.el.content.firstChild;a.replaceWith(...a.childNodes)}for(;(L=Q.nextNode())!==null&&i.length<o;){if(L.nodeType===1){if(L.hasAttributes())for(let a of L.getAttributeNames())if(a.endsWith(Z2)){let l=n[t++],s=L.getAttribute(a).split(N),m=/([.?@])?(.*)/.exec(l);i.push({type:1,index:r,name:m[2],strings:s,ctor:m[1]==="."?F1:m[1]==="?"?E1:m[1]==="@"?N1:Y}),L.removeAttribute(a)}else a.startsWith(N)&&(i.push({type:6,index:r}),L.removeAttribute(a));if(O5.test(L.tagName)){let a=L.textContent.split(N),l=a.length-1;if(l>0){L.textContent=B1?B1.emptyScript:"";for(let s=0;s<l;s++)L.append(a[s],v1()),Q.nextNode(),i.push({type:2,index:++r});L.append(a[l],v1())}}}else if(L.nodeType===8)if(L.data===S2)i.push({type:2,index:r});else{let a=-1;for(;(a=L.data.indexOf(N,a+1))!==-1;)i.push({type:7,index:r}),a+=N.length-1}r++}}static createElement(V,H){let e=j.createElement("template");return e.innerHTML=V,e}};function X(C,V,H=C,e){if(V===$)return V;let L=e!==void 0?H._$Co?.[e]:H._$Cl,r=x1(V)?void 0:V._$litDirective$;return L?.constructor!==r&&(L?._$AO?.(!1),r===void 0?L=void 0:(L=new r(C),L._$AT(C,H,e)),e!==void 0?(H._$Co??(H._$Co=[]))[e]=L:H._$Cl=L),L!==void 0&&(V=X(C,L._$AS(C,V.values),L,e)),V}var D1=class{constructor(V,H){this._$AV=[],this._$AN=void 0,this._$AD=V,this._$AM=H}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(V){let{el:{content:H},parts:e}=this._$AD,L=(V?.creationScope??j).importNode(H,!0);Q.currentNode=L;let r=Q.nextNode(),t=0,o=0,i=e[0];for(;i!==void 0;){if(t===i.index){let M;i.type===2?M=new e1(r,r.nextSibling,this,V):i.type===1?M=new i.ctor(r,i.name,i.strings,this,V):i.type===6&&(M=new $1(r,this,V)),this._$AV.push(M),i=e[++o]}t!==i?.index&&(r=Q.nextNode(),t++)}return Q.currentNode=j,L}p(V){let H=0;for(let e of this._$AV)e!==void 0&&(e.strings!==void 0?(e._$AI(V,e,H),H+=e.strings.length-2):e._$AI(V[H])),H++}},e1=class C{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(V,H,e,L){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=V,this._$AB=H,this._$AM=e,this.options=L,this._$Cv=L?.isConnected??!0}get parentNode(){let V=this._$AA.parentNode,H=this._$AM;return H!==void 0&&V?.nodeType===11&&(V=H.parentNode),V}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(V,H=this){V=X(this,V,H),x1(V)?V===p||V==null||V===""?(this._$AH!==p&&this._$AR(),this._$AH=p):V!==this._$AH&&V!==$&&this._(V):V._$litType$!==void 0?this.$(V):V.nodeType!==void 0?this.T(V):w5(V)?this.k(V):this._(V)}O(V){return this._$AA.parentNode.insertBefore(V,this._$AB)}T(V){this._$AH!==V&&(this._$AR(),this._$AH=this.O(V))}_(V){this._$AH!==p&&x1(this._$AH)?this._$AA.nextSibling.data=V:this.T(j.createTextNode(V)),this._$AH=V}$(V){let{values:H,_$litType$:e}=V,L=typeof e=="number"?this._$AC(V):(e.el===void 0&&(e.el=h1.createElement(T5(e.h,e.h[0]),this.options)),e);if(this._$AH?._$AD===L)this._$AH.p(H);else{let r=new D1(L,this),t=r.u(this.options);r.p(H),this.T(t),this._$AH=r}}_$AC(V){let H=y5.get(V.strings);return H===void 0&&y5.set(V.strings,H=new h1(V)),H}k(V){g2(this._$AH)||(this._$AH=[],this._$AR());let H=this._$AH,e,L=0;for(let r of V)L===H.length?H.push(e=new C(this.O(v1()),this.O(v1()),this,this.options)):e=H[L],e._$AI(r),L++;L<H.length&&(this._$AR(e&&e._$AB.nextSibling,L),H.length=L)}_$AR(V=this._$AA.nextSibling,H){for(this._$AP?.(!1,!0,H);V!==this._$AB;){let e=h5(V).nextSibling;h5(V).remove(),V=e}}setConnected(V){this._$AM===void 0&&(this._$Cv=V,this._$AP?.(V))}},Y=class{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(V,H,e,L,r){this.type=1,this._$AH=p,this._$AN=void 0,this.element=V,this.name=H,this._$AM=L,this.options=r,e.length>2||e[0]!==""||e[1]!==""?(this._$AH=Array(e.length-1).fill(new String),this.strings=e):this._$AH=p}_$AI(V,H=this,e,L){let r=this.strings,t=!1;if(r===void 0)V=X(this,V,H,0),t=!x1(V)||V!==this._$AH&&V!==$,t&&(this._$AH=V);else{let o=V,i,M;for(V=r[0],i=0;i<r.length-1;i++)M=X(this,o[e+i],H,i),M===$&&(M=this._$AH[i]),t||(t=!x1(M)||M!==this._$AH[i]),M===p?V=p:V!==p&&(V+=(M??"")+r[i+1]),this._$AH[i]=M}t&&!L&&this.j(V)}j(V){V===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,V??"")}},F1=class extends Y{constructor(){super(...arguments),this.type=3}j(V){this.element[this.name]=V===p?void 0:V}},E1=class extends Y{constructor(){super(...arguments),this.type=4}j(V){this.element.toggleAttribute(this.name,!!V&&V!==p)}},N1=class extends Y{constructor(V,H,e,L,r){super(V,H,e,L,r),this.type=5}_$AI(V,H=this){if((V=X(this,V,H,0)??p)===$)return;let e=this._$AH,L=V===p&&e!==p||V.capture!==e.capture||V.once!==e.once||V.passive!==e.passive,r=V!==p&&(e===p||L);L&&this.element.removeEventListener(this.name,this,e),r&&this.element.addEventListener(this.name,this,V),this._$AH=V}handleEvent(V){typeof this._$AH=="function"?this._$AH.call(this.options?.host??this.element,V):this._$AH.handleEvent(V)}},$1=class{constructor(V,H,e){this.element=V,this.type=6,this._$AN=void 0,this._$AM=H,this.options=e}get _$AU(){return this._$AM._$AU}_$AI(V){X(this,V)}},P5={M:Z2,P:N,A:S2,C:1,L:R5,R:D1,D:w5,V:X,I:e1,H:Y,N:E1,U:N1,B:F1,F:$1},FH=c1.litHtmlPolyfillSupport;FH?.(h1,e1),(c1.litHtmlVersions??(c1.litHtmlVersions=[])).push("3.3.2");var B5=(C,V,H)=>{let e=H?.renderBefore??V,L=e._$litPart$;if(L===void 0){let r=H?.renderBefore??null;e._$litPart$=L=new e1(V.insertBefore(v1(),r),r,void 0,H??{})}return L._$AI(C),L};var Z1=globalThis,W=class extends E{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var H;let V=super.createRenderRoot();return(H=this.renderOptions).renderBefore??(H.renderBefore=V.firstChild),V}update(V){let H=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(V),this._$Do=B5(H,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return $}};W._$litElement$=!0,W.finalized=!0,Z1.litElementHydrateSupport?.({LitElement:W});var EH=Z1.litElementPolyfillSupport;EH?.({LitElement:W});(Z1.litElementVersions??(Z1.litElementVersions=[])).push("4.2.2");var I1={ATTRIBUTE:1,CHILD:2,PROPERTY:3,BOOLEAN_ATTRIBUTE:4,EVENT:5,ELEMENT:6},S1=C=>(...V)=>({_$litDirective$:C,values:V}),L1=class{constructor(V){}get _$AU(){return this._$AM._$AU}_$AT(V,H,e){this._$Ct=V,this._$AM=H,this._$Ci=e}_$AS(V,H){return this.update(V,H)}update(V,H){return this.render(...H)}};var{I:NH}=P5,D5=C=>C;var E5=C=>C.strings===void 0,F5=()=>document.createComment(""),r1=(C,V,H)=>{let e=C._$AA.parentNode,L=V===void 0?C._$AB:V._$AA;if(H===void 0){let r=e.insertBefore(F5(),L),t=e.insertBefore(F5(),L);H=new NH(r,t,C,C.options)}else{let r=H._$AB.nextSibling,t=H._$AM,o=t!==C;if(o){let i;H._$AQ?.(C),H._$AM=C,H._$AP!==void 0&&(i=C._$AU)!==t._$AU&&H._$AP(i)}if(r!==L||o){let i=H._$AA;for(;i!==r;){let M=D5(i).nextSibling;D5(e).insertBefore(i,L),i=M}}}return H},G=(C,V,H=C)=>(C._$AI(V,H),C),$H={},N5=(C,V=$H)=>C._$AH=V,$5=C=>C._$AH,U1=C=>{C._$AR(),C._$AA.remove()};var I5=(C,V,H)=>{let e=new Map;for(let L=V;L<=H;L++)e.set(C[L],L);return e},z=S1(class extends L1{constructor(C){if(super(C),C.type!==I1.CHILD)throw Error("repeat() can only be used in text expressions")}dt(C,V,H){let e;H===void 0?H=V:V!==void 0&&(e=V);let L=[],r=[],t=0;for(let o of C)L[t]=e?e(o,t):t,r[t]=H(o,t),t++;return{values:r,keys:L}}render(C,V,H){return this.dt(C,V,H).values}update(C,[V,H,e]){let L=$5(C),{values:r,keys:t}=this.dt(V,H,e);if(!Array.isArray(L))return this.ut=t,r;let o=this.ut??(this.ut=[]),i=[],M,n,a=0,l=L.length-1,s=0,m=r.length-1;for(;a<=l&&s<=m;)if(L[a]===null)a++;else if(L[l]===null)l--;else if(o[a]===t[s])i[s]=G(L[a],r[s]),a++,s++;else if(o[l]===t[m])i[m]=G(L[l],r[m]),l--,m--;else if(o[a]===t[m])i[m]=G(L[a],r[m]),r1(C,i[m+1],L[a]),a++,m--;else if(o[l]===t[s])i[s]=G(L[l],r[s]),r1(C,L[a],L[l]),l--,s++;else if(M===void 0&&(M=I5(t,s,m),n=I5(o,a,l)),M.has(o[a]))if(M.has(o[l])){let u=n.get(t[s]),v=u!==void 0?L[u]:null;if(v===null){let Z=r1(C,L[a]);G(Z,r[s]),i[s]=Z}else i[s]=G(v,r[s]),r1(C,L[a],v),L[u]=null;s++}else U1(L[l]),l--;else U1(L[a]),a++;for(;s<=m;){let u=r1(C,i[m+1]);G(u,r[s]),i[s++]=u}for(;a<=l;){let u=L[a++];u!==null&&U1(u)}return this.ut=t,N5(C,i),$}});var g1=(C,V)=>{let H=C._$AN;if(H===void 0)return!1;for(let e of H)e._$AO?.(V,!1),g1(e,V);return!0},W1=C=>{let V,H;do{if((V=C._$AM)===void 0)break;H=V._$AN,H.delete(C),C=V}while(H?.size===0)},U5=C=>{for(let V;V=C._$AM;C=V){let H=V._$AN;if(H===void 0)V._$AN=H=new Set;else if(H.has(C))break;H.add(C),WH(V)}};function IH(C){this._$AN!==void 0?(W1(this),this._$AM=C,U5(this)):this._$AM=C}function UH(C,V=!1,H=0){let e=this._$AH,L=this._$AN;if(L!==void 0&&L.size!==0)if(V)if(Array.isArray(e))for(let r=H;r<e.length;r++)g1(e[r],!1),W1(e[r]);else e!=null&&(g1(e,!1),W1(e));else g1(this,C)}var WH=C=>{C.type==I1.CHILD&&(C._$AP??(C._$AP=UH),C._$AQ??(C._$AQ=IH))},G1=class extends L1{constructor(){super(...arguments),this._$AN=void 0}_$AT(V,H,e){super._$AT(V,H,e),U5(this),this.isConnected=V._$AU}_$AO(V,H=!0){V!==this.isConnected&&(this.isConnected=V,V?this.reconnected?.():this.disconnected?.()),H&&(g1(this,V),W1(this))}setValue(V){if(E5(this._$Ct))this._$Ct._$AI(V,this);else{let H=[...this._$Ct._$AH];H[this._$Ci]=V,this._$Ct._$AI(H,this,0)}}disconnected(){}reconnected(){}};var k=()=>new y2,y2=class{},b2=new WeakMap,f=S1(class extends G1{render(C){return p}update(C,[V]){let H=V!==this.G;return H&&this.G!==void 0&&this.rt(void 0),(H||this.lt!==this.ct)&&(this.G=V,this.ht=C.options?.host,this.rt(this.ct=C.element)),p}rt(C){if(this.isConnected||(C=void 0),typeof this.G=="function"){let V=this.ht??globalThis,H=b2.get(V);H===void 0&&(H=new WeakMap,b2.set(V,H)),H.get(this.G)!==void 0&&this.G.call(this.ht,void 0),H.set(this.G,C),C!==void 0&&this.G.call(this.ht,C)}else this.G.value=C}get lt(){return typeof this.G=="function"?b2.get(this.ht??globalThis)?.get(this.G):this.G?.value}disconnected(){this.lt===this.ct&&this.rt(void 0)}reconnected(){this.rt(this.ct)}});var t1=["activity","macro_favorites","macros_row","favorites_row","dpad","nav","mid","media","colors","abc","shortcuts"],GH=new Set(t1),K5=2,W5=1,G5=6,w2=["group_order","show_activity","show_dpad","show_nav","show_mid","show_volume","show_channel","show_media","show_dvr","show_colors","show_abc","show_numpad","show_macros_button","show_favorites_button","show_device_toggle","mf_as_rows","mf_row_visible_rows","show_favorite_device_names"],zH="device:";function Q5(C){return`${zH}${C==null?"default":String(C)}`}var qH=["group_order","show_activity","show_dpad","show_nav","show_volume","show_channel","show_media","show_dvr","show_colors","show_abc","show_numpad","show_commands_button","show_power_button","show_device_toggle","show_shortcuts","c_as_rows","c_row_visible_rows"],KH={mf_as_rows:"c_as_rows",mf_row_visible_rows:"c_row_visible_rows"},QH=Object.fromEntries(Object.entries(KH).map(([C,V])=>[V,C])),jH=new Set(qH);function z1(C){let V=C?.device_mode;return V&&typeof V=="object"?V:null}function j5(C){let V=C?.key_style;return V==="tinted"||V==="elevated"||V==="glossy"?V:"flat"}function X5(C){return C?.tinted_panels===!0||C?.key_style==="panel"}function Y5(C){return z1(C)?.enabled!==!1}function J5(C){let V=z1(C)?.open_device;if(V==null)return null;let H=Number(V);return Number.isFinite(H)?H:null}function z5(C,V){let H=z1(C)?.layouts,e=H&&typeof H=="object"?H[V]:null;return e&&typeof e=="object"?e:null}function q5(C){let V={};if(!C||typeof C!="object")return V;for(let[H,e]of Object.entries(C))jH.has(H)&&(V[QH[H]??H]=e);return V}var XH=Object.freeze({show_activity:!0,show_dpad:!0,show_nav:!0,show_mid:!0,show_volume:!0,show_channel:!0,show_media:!0,show_dvr:!0,show_colors:!0,show_abc:!0,show_numpad:!0,show_commands_button:!0,show_power_button:!0,show_device_toggle:!0,show_shortcuts:!0,mf_as_rows:!1,mf_row_visible_rows:K5,group_order:Object.freeze(t1.slice())});function C3(C,V){let H={...XH,...q5(z5(C,"default"))};return V!=null&&(H={...H,...q5(z5(C,String(V)))}),H}function H3(C){return typeof C?.show_commands_button=="boolean"?C.show_commands_button:!0}function V3(C){return typeof C?.show_power_button=="boolean"?C.show_power_button:!0}function e3(C){return typeof C?.show_device_toggle=="boolean"?C.show_device_toggle:!0}function L3(C){return typeof C?.show_shortcuts=="boolean"?C.show_shortcuts:!0}var O2=["left","middle","right"];function YH(C){if(!C||typeof C!="object")return null;let V=String(C.icon??"").trim(),H=Number(C.command_id);return!V||!Number.isFinite(H)?null:{icon:V,command_id:H}}function r3(C,V){let H={};if(V==null)return H;let e=z1(C)?.shortcuts,L=e&&typeof e=="object"?e[String(V)]:null;if(!L||typeof L!="object")return H;for(let r of O2){let t=YH(L[r]);t&&(H[r]=t)}return H}function JH(C){let V={};if(!C||typeof C!="object")return V;for(let H of w2)C[H]!==void 0&&(V[H]=C[H]);return V}function CV(C){let V=JH(C),H=C?.layouts?.default;return H&&typeof H=="object"?{...V,...H}:V}function q1(C,V){let H=CV(C),e=C?.layouts;if(!e||typeof e!="object"||V==null)return H;let L=String(V),r=e[L]??(Number.isFinite(Number(V))?e[Number(V)]:null);return r&&typeof r=="object"?{...H,...r}:H}function K1(C){return typeof C?.show_macros_button=="boolean"?C.show_macros_button:!0}function Q1(C){return typeof C?.show_favorites_button=="boolean"?C.show_favorites_button:!0}function t3(C){return C?.show_favorite_device_names===!0}function i3(C){return C?.mf_as_rows===!0}function HV(C){let V=Number(C);if(!Number.isFinite(V))return K5;let H=Math.round(V);return H<W5?W5:H>G5?G5:H}function o3(C){return HV(C?.mf_row_visible_rows)}function M3(C){return typeof C?.show_volume=="boolean"?C.show_volume:typeof C?.show_mid=="boolean"?C.show_mid:!0}function a3(C){return typeof C?.show_channel=="boolean"?C.show_channel:typeof C?.show_mid=="boolean"?C.show_mid:!0}function n3(C){return typeof C?.show_media=="boolean"?C.show_media:!0}function d3(C){return typeof C?.show_dvr=="boolean"?C.show_dvr:!0}function f1(C){let V=Array.isArray(C)?C:t1,H=[],e=new Set;for(let L of V){let r=String(L??"").trim();!GH.has(r)||e.has(r)||(H.push(r),e.add(r))}for(let L of t1)e.has(L)||H.push(L);return H}var d={UP:174,DOWN:178,LEFT:175,RIGHT:177,OK:176,BACK:179,HOME:180,MENU:181,VOL_UP:182,VOL_DOWN:185,MUTE:184,CH_UP:183,CH_DOWN:186,GUIDE:157,DVR:155,PLAY:156,EXIT:154,A:153,B:152,C:151,REW:187,PAUSE:188,FWD:189,RED:190,GREEN:191,YELLOW:192,BLUE:193,NUM_ENTER:158,NUM_0:159,NUM_DASH:160,NUM_9:161,NUM_8:162,NUM_7:163,NUM_6:164,NUM_5:165,NUM_4:166,NUM_3:167,NUM_2:168,NUM_1:169},j1=Object.freeze([d.NUM_1,d.NUM_2,d.NUM_3,d.NUM_4,d.NUM_5,d.NUM_6,d.NUM_7,d.NUM_8,d.NUM_9,d.NUM_0,d.NUM_DASH,d.NUM_ENTER]);function A3(C){return typeof C?.show_numpad=="boolean"?C.show_numpad:!0}var s3=new Set(["powered off","powered_off","off"]);function l3(C){return String(C?.attributes?.hub_version||"").toUpperCase()}function k2(C,V){return V?!0:C.includes("X2")}function m3(C,V){return k2(C,V)||C.includes("X1S")}function _2(){return customElements.get("ha-dropdown-item")?"ha-dropdown-item":"sbx-mwc-list-item"}function p3(){return customElements.get("ha-dropdown-item")?["wa-open"]:["opened"]}function u3(){return customElements.get("ha-dropdown-item")?["wa-close"]:["closed"]}function c3(C,V=[]){let H=String(C??"");if(!!!customElements.get("ha-dropdown-item"))return H;let L=V.find(r=>String(r?.value??"")===H);return L?String(L.label??L.value??""):H}async function v3(){let C=_2();await Promise.all([customElements.whenDefined("sbx-ha-icon"),customElements.whenDefined("sbx-ha-select"),customElements.whenDefined(C).catch(()=>{})])}var i1={card:{selectEntityError:"Select a Sofabaton remote entity",remoteUnavailable:"Remote is unavailable (possibly because the Sofabaton app is connected).",noActivitiesWarning:"No activities found in remote attributes.",noMacros:"No macros available",noFavorites:"No favorites available",noCommands:"No commands available",macrosTab:"Macros",favoritesTab:"Favorites",commandsTab:"Commands",powerButton:"Toggle power",activitySelectLabel:"Activity",deviceSelectLabel:"Device",selectDevice:"Select device",allDevicesLayout:"Default device layout",filterCommands:"Filter commands",switchToDeviceMode:"Switch to device mode",switchToActivityMode:"Switch to activity mode",deviceKeymapMissing:"This device's commands are not cached yet. Refresh this device in the Hub tab of the Sofabaton Control Panel, then reload the dashboard.",deviceKeymapMissingServer:"This device is not in the hub's catalog. Refresh the hub in the Sofabaton control panel, then reload this page.",deviceKeymapError:"Could not load this device's commands.",serverReadFailed:"Could not load hub data from the server. Check the connection and try again.",controlRefused:"The command could not be completed. Try again.",poweredOff:"Powered Off",defaultLayout:"Default activity layout",activityFallback:C=>`Activity ${C}`,deviceFallback:C=>`Device ${C}`,pickerName:"Sofabaton Virtual Remote",pickerDescription:"A configurable remote for the Sofabaton X1, X1S and X2 integration."},sidebar:{title:"Virtual Remote",controlPanel:"Control Panel",hubMenu:"Choose a hub",back:"Back",hubReachable:"Reachable",hubUnreachable:"Unreachable",noHubs:"No Sofabaton hub is set up yet.",hubUnavailable:"Hub unavailable",remoteUnavailable:"The remote for this hub is unavailable.",controlPanelLoadFailed:"Could not load the Control Panel. Reload the page to try again.",activities:"Activities",devices:"Devices",allOff:"All off",off:"Off",modeToggle:"Switch between activities and devices",numberPad:"Number pad",pullHandle:"Open favorites and macros",pullHandleCommands:"Open commands",close:"Close",pinToDock:C=>`Pin ${C} to the dock`,pinnedToDock:C=>`${C}, pinned to the dock`,dockShortcut:"Dock shortcut",dockSwap:"Swap sides",dockOnLeft:"On the left",dockOnRight:"On the right",unpin:"Unpin",dockFull:"The dock is full",dockIcon:"Icon",starting:"Starting",poweringOff:"Powering off",working:"Working",appConnected:"The Sofabaton app is connected",operations:{backup_restore:"Restoring backup",cache_refresh:"Refreshing hub cache",entity_sync:"Syncing with hub",backup_export:"Creating backup",wifi_deploy:"Syncing Wifi Commands"}},assist:{label:"Key capture",waiting:"Waiting for keypress",exitEditMode:"Exit Edit mode to begin",captured:C=>`Captured: ${C}`,notCaptured:"Not captured.",working:"Working\u2026",triggersReady:"Triggers ready for use",createTriggers:"Create MQTT Discovery triggers",startCapturing:"Start capturing commands",deviceDetectedTitle:"Sofabaton MQTT device detected.",close:"Close",alsoActivityTriggers:"Also create triggers for Activity changes.",seeDocs:"See documentation for this feature.",dontShowAgain:"Don't show this again for this device during this session.",detectedDevice:C=>`Detected MQTT device: ${C}.`,lastCommand:C=>`Last command: ${C}.`,existingTriggers:"Existing MQTT automation triggers were found.",noMqttCommands:"No MQTT commands discovered yet",deviceFallback:C=>`Device ${C}`,unknownDevice:"Unknown device",commandFallback:C=>`Command ${C}`,createdTriggers:(C,V)=>`Created ${C} MQTT Discovery triggers for ${V}`,createdActivityTriggers:C=>`Created ${C} activity triggers for X2 \u2192 Activities`,plusActivityTriggers:C=>` plus ${C} activity triggers`,allTriggersExist:C=>`All MQTT Discovery triggers already exist for ${C}`,buttonFallback:"Button",activityFallbackLabel:"Activity",unknown:"Unknown",automationAssistName:"Automation Assist",notification:{title:"\u{1F6E0}\uFE0F Automation Assist",eventButton:C=>`Button: ${C}`,eventCommand:C=>`Command: ${C}`,eventActivity:C=>`Activity Change: ${C}`,eventOther:C=>`Event: ${C}`,header:(C,V)=>`**Activity: ${C} | ${V}**`,headerDevice:(C,V)=>`**Device: ${C} | ${V}**`,lovelaceHeading:"\u{1F4CB} **Lovelace button code**",lovelaceCopy:"*Copy this to your dashboard YAML:*",serviceHeading:"\u2699\uFE0F **Service call (automation)**",serviceCopy:"*Use this in your scripts or automations:*"}},editor:{fieldLabels:{entity:"Select a Sofabaton remote entity",theme:"Apply a theme to the card",use_background_override:"Customize background color",background_override:"Select background color",max_width:"Maximum card width (px)",key_style:"Button style"},generalOptionsTitle:"General options",keyCapture:"Key capture",keyCaptureDescription:"Send button presses to the hub: capture them to generate ready-to-use YAML for dashboard buttons and automations.",keyCaptureLearnMore:"Learn more about Key capture",keyCaptureDocsAria:"Key capture documentation",stylingOptions:"Styling options",keyStyleFlat:"Flat (matches the card background)",keyStyleTinted:"Tinted (buttons stand out from the background)",keyStyleElevated:"Elevated (tinted with a shadow)",keyStyleGlossy:"Glossy (shiny, curved buttons)",tintedPanels:"Tinted panels",tintedPanelsDescription:"Show a tinted background behind each group of buttons.",layoutOptions:"Layout options",layoutSelectLabel:"Layout",defaultLayoutOption:"Default activity layout",allDevicesOption:"Default device layout",commands:"Commands",power:"Power button",modeToggle:"Mode switch",deviceModeDescription:"Control one device configured on the hub, using that device's button assignments and complete command list.",longPress:"Enable hold-to-repeat",longPressDescription:"Hold a selected button to send its command repeatedly, as on the physical remote.",longPressButtons:"Buttons",enableDeviceMode:"Enable device mode",initialView:"Initial view",initialViewHelper:"What the card shows when it loads",openOnCurrentActivity:"Current activity",macrosFavoritesAsRows:"Macros/Favorites as rows",commandsAsRows:"Commands as rows",favoriteDeviceNames:"Show device names",rowOptions:C=>`${C} options`,visibleRows:"Visible rows",moveGroupUp:C=>`Move ${C} up`,moveGroupDown:C=>`Move ${C} down`,fewerVisibleRows:"Fewer visible rows",moreVisibleRows:"More visible rows",reorderGroupHandle:C=>`Reorder ${C} (arrow keys)`,macros:"Macros",favorites:"Favorites",volume:"Volume",channel:"Channel",mediaControls:"Playback",dvr:"DVR",numpad:"Number pad",resetDefaultLayout:"Reset layout",shortcutSlotLeft:"Left shortcut",shortcutSlotMiddle:"Middle shortcut",shortcutSlotRight:"Right shortcut",shortcutIcon:"Icon",shortcutCommand:"Command",shortcutReset:"Reset",shortcutCommandMissing:C=>`Command ${C} (missing)`,shortcutsCommandsLoading:"Loading commands\u2026",shortcutsCommandsUnavailable:"This device's commands are not cached yet. Refresh this device in the Hub tab of the Sofabaton Control Panel, then reload the dashboard.",shortcutsCommandsError:"Could not load this device's commands. Reload the dashboard and try again.",noteDefaultLayout:"Used for activities without their own layout",noteDeviceDefaultLayout:"Used for devices without their own layout",noteCustomActivityLayout:"Using custom activity layout",noteCustomDeviceLayout:"Using custom device layout",noteUsingActivityDefault:"Using default activity layout",noteUsingDeviceDefault:"Using default device layout"},groups:{activity:"Activity/device",macro_favorites:"Macros/Favorites",macros_row:"Macros row",favorites_row:"Favorites row",dpad:"Direction pad",nav:"Back/Home/Menu",mid:"Volume/Channel",media:"Playback",colors:"Color buttons",abc:"A/B/C",shortcuts:"Shortcuts"},keys:{up:"Up",down:"Down",left:"Left",right:"Right",ok:"OK",back:"Back",home:"Home",menu:"Menu",volup:"Vol +",voldn:"Vol -",mute:"Mute",chup:"Ch +",chdn:"Ch -",guide:"Guide",dvr:"DVR",play:"Play",exit:"EXIT",rew:"Rewind",pause:"Pause",fwd:"Fast forward",red:"Red",green:"Green",yellow:"Yellow",blue:"Blue",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Enter"}},b1={};function b(C,V){let H=String(C||"").toLowerCase();if(H&&(b1[H]=V,J===H||J.split(/[-_]/)[0]===H)){let e=x3(J);X1=e?R2(i1,e):i1}}function T2(C){return typeof C=="object"&&C!==null&&!Array.isArray(C)}function R2(C,V){if(!T2(V))return C;let H=Array.isArray(C)?[...C]:{...C};for(let[e,L]of Object.entries(V))L!==void 0&&(T2(L)&&T2(C?.[e])?H[e]=R2(C[e],L):H[e]=L);return H}var VV={zh:"zh-hans","zh-cn":"zh-hans","zh-sg":"zh-hans"};function x3(C){let V=String(C||"").toLowerCase().replaceAll("_","-"),H=VV[V]??(V.startsWith("zh-hans-")?"zh-hans":V);if(!H)return null;if(b1[H])return b1[H];let e=H.split(/[-_]/)[0];return e&&b1[e]?b1[e]:null}var J="en",X1=i1;function h3(C){let V=String(C||"en").toLowerCase();if(V===J)return!1;J=V;let H=x3(V);return X1=H?R2(i1,H):i1,!0}function Z3(){return J}function Y1(){let C=J.split(/[-_]/)[0];return["ar","fa","he","ps","ur"].includes(C)?"rtl":"ltr"}function A(){return X1}function S3(C){let V=String(C||"").trim().toLowerCase();return V?V===i1.card.poweredOff.toLowerCase()?!0:V===X1.card.poweredOff.toLowerCase():!1}var g3=`
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
        /* Dialog surface: HA's own ha-dialog chain, not the card surface.
           Glass themes make --ha-card-background see-through and keep
           the dialog surface readable (opaque, or translucent with a
           --ha-dialog-surface-backdrop-filter blur). */
        --sb-dialog-surface: var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color, var(--primary-background-color, #fff))));
        --sb-dialog-backdrop-filter: var(--ha-dialog-surface-backdrop-filter, none);
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
        --sb-drawer-layer: var(--sb-panel-surface);
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

        /* The drawer floats over the keys. Glass / iOS themes make the card
           background translucent (alpha 0.3-0.4), which is fine for the card
           over a wallpaper but lets the keys underneath show through the
           drawer. Stack the same surface twice (0.3 becomes ~0.51, 0.4
           ~0.64, an opaque colour stays pixel-identical) and blur what
           remains: more layers made the dark glass themes' drawer read as
           a black slab against their translucent card. */
        --sb-drawer-layer: linear-gradient(
          var(--ha-card-background, var(--card-background-color, var(--primary-background-color))),
          var(--ha-card-background, var(--card-background-color, var(--primary-background-color))));
        background: var(--sb-drawer-layer), var(--sb-drawer-layer);
        border: 1px solid var(--divider-color);
        border-top: none; 
        border-bottom-left-radius: var(--sb-group-radius);
        border-bottom-right-radius: var(--sb-group-radius);
        box-shadow: 0px 8px 16px rgba(0,0,0,0.25);
        
        transform-origin: top;
        transform: scaleY(0);
        opacity: 0;
        pointer-events: none;
        /* The blur lives on .open only (a closed drawer with a backdrop
           filter changes how the card's text rasterises); the delay keeps
           it through the closing fade. */
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease,
          -webkit-backdrop-filter 0s 0.25s, backdrop-filter 0s 0.25s;

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
        -webkit-backdrop-filter: blur(20px);
        backdrop-filter: blur(20px);
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease;
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

      /* Drawer buttons (Macros/Favorites). They sit on the drawer panel,
         which is the card surface, so with flat keys an sbx-ha-card at the card
         colour would only be separated by its border, and iOS / Material
         You / glass themes set --ha-card-border-width to 0: the buttons
         vanished into the panel. Raise them unconditionally with the
         key-style tint and floored border (the key_style rules above
         re-point the same tokens for tinted / elevated / glossy). */
      .drawer-btn {
        --ha-card-background: var(--sb-key-surface);
        --ha-card-border-color: var(--sb-key-border);
        --ha-card-border-width: 1px;
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
      /* A name that wraps to a second line inherited the page's ~1.5
         line-height; tighten it so two lines still sit as one label. */
      .drawer-btn .name {
        line-height: 1.15;
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
        background: var(--sb-dialog-surface, var(--ha-dialog-surface-background, var(--mdc-theme-surface, var(--card-background-color, var(--primary-background-color, #fff)))));
        -webkit-backdrop-filter: var(--sb-dialog-backdrop-filter, none);
        backdrop-filter: var(--sb-dialog-backdrop-filter, none);
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
    `;function f3(C,V){let H=String(V??"").trim();if(H)return H;let e=A().keys[String(C??"").toLowerCase()];return e||(C?String(C).replace(/[_-]+/g," ").replace(/\b\w/g,L=>L.toUpperCase()):A().assist.buttonFallback)}function b3(C){if(Array.isArray(C)&&C.length>=3){let V=Number(C[0]),H=Number(C[1]),e=Number(C[2]);return[V,H,e].some(L=>Number.isNaN(L))?"":`rgb(${V}, ${H}, ${e})`}if(C&&typeof C=="object"&&C.r!=null&&C.g!=null&&C.b!=null){let V=Number(C.r),H=Number(C.g),e=Number(C.b);return[V,H,e].some(L=>Number.isNaN(L))?"":`rgb(${V}, ${H}, ${e})`}return""}function y3({showVolume:C,showChannel:V,isX2:H}){let e=C&&V?"dual":C?"volume":V?"channel":"off";return{midMode:e,classMap:{"mid--dual":e==="dual","mid--volume":e==="volume","mid--channel":e==="channel","mid--x2":H,"mid--x1":!H}}}function w3({isX2:C,showMedia:V,showDvr:H}){let e=C?V&&H?"both":V?"play":H?"dvr":"off":V||H?"play":"off";return{mediaMode:e,classMap:{"media--play":e==="play","media--dvr":e==="dvr","media--both":e==="both","media--x2":C,"media--x1":!C}}}function O3({isX2:C,showVolume:V,showChannel:H,showMedia:e,showDvr:L}){return{volup:V,voldn:V,mute:V,guide:C&&H,chup:H,chdn:H,rew:e,play:e&&C,fwd:e,dvr:C&&L,pause:L||!C&&e,exit:C&&L}}function k3({editMode:C,showMacrosButton:V,showFavoritesButton:H,macros:e,favorites:L,customFavorites:r,disableAllButtons:t}){let o=V||H,i=(V?1:0)+(H?1:0),M=C?!0:e.length>0,n=C?!0:L.length+r.length>0;return{showMF:o,visibleCount:i,macrosDisabled:t||!M,favoritesDisabled:t||!n}}function _3({activeDrawer:C,showMacrosButton:V,showFavoritesButton:H,editMode:e,macros:L,favorites:r,customFavorites:t,disableAllButtons:o}){let i=k3({editMode:e,showMacrosButton:V,showFavoritesButton:H,macros:L,favorites:r,customFavorites:t,disableAllButtons:o}),M=C;return!i.showMF&&M&&(M=null),M==="macros"&&!V&&(M=null),M==="favorites"&&!H&&(M=null),{...i,nextActiveDrawer:M,closedByVisibility:!!(C&&!M)}}var eV={volup:"volume",voldn:"volume",chup:"channel",chdn:"channel",up:"dpad",down:"dpad",left:"dpad",right:"dpad"};function LV(C){let V=C?.hold_repeat;return V&&typeof V=="object"?V:{}}function rV(C){let V=LV(C),H=V.enabled===!0;return{enabled:H,volume:H&&V.volume!==!1,channel:H&&V.channel!==!1,dpad:H&&V.dpad!==!1}}function tV(C){return eV[String(C??"")]??null}function P2(C,V){let H=tV(V);return H?rV(C)[H]:!1}function T3(C,V,H){if(V==null||H==null)return null;let e=Number(V),L=Number(H);if(!Number.isFinite(e)||!Number.isFinite(L))return null;let r=C?.long_press_keys;if(!r||typeof r!="object")return null;let t=r[String(e)];if(!t||typeof t!="object"||Array.isArray(t))return null;let o=t[String(L)];if(!o||typeof o!="object")return null;let i=Number(o.device_id),M=Number(o.command_id);return!Number.isFinite(i)||i<1||!Number.isFinite(M)||M<1?null:{device_id:i,command_id:M}}function iV(){return{ts:0,pointerId:null,type:null}}function oV(C,V,H){let e=V&&typeof V.pointerId=="number"?V.pointerId:null,L=V?.type||null,r=H-C.ts;return r<450||r<1200&&(C.type==="pointerup"||C.type==="touchend")&&(L==="click"||L==="ha-click"||L==="tap")?!1:(C.ts=H,C.pointerId=e,C.type=L,!0)}function H2(C,V,H={}){let e=(Array.isArray(C)?C:[C]).filter(M=>!!M),L=iV(),r=(M,n=M.type)=>{if(oV(L,{type:n,pointerId:M.pointerId},Date.now())){typeof M.preventDefault=="function"&&M.preventDefault(),typeof M.stopPropagation=="function"&&M.stopPropagation(),typeof M.stopImmediatePropagation=="function"&&M.stopImmediatePropagation();try{H.fireHaptic?.(),V(M)}catch{}}},t=M=>{M.detail===0&&r(M,"keyboard")},o=M=>{let n=M.key;if(n!=="Enter"&&n!==" ")return;let a=M.currentTarget;M.target!==a||a?.getAttribute("role")!=="button"||r(M,"keyboard")},i=typeof window<"u"&&"PointerEvent"in window;for(let M of e)M.addEventListener("keydown",o),i?(M.addEventListener("pointerup",n=>r(n),{capture:!0,passive:!1}),M.addEventListener("click",t)):(M.addEventListener("touchend",n=>r(n),{capture:!0,passive:!1}),M.addEventListener("click",n=>r(n),{capture:!0})),M.addEventListener("ha-click",n=>r(n),{capture:!0})}var MV=350,B2=260;function R3(C,V=MV){return Math.min(C||0,V)+8}function P3(C){let{desired:V,rowTop:H,rowBottom:e,cardTop:L,cardBottom:r,viewportHeight:t}=C;if(L==null||r==null){let a=t-e,l=H;return a<V&&l>a?"up":"down"}let o=r-e,i=H-L,M=Math.max(0,Math.min(V,o));return Math.max(0,Math.min(V,i))>M?"up":"down"}function B3({up:C,rowTop:V,rowBottom:H,cardTop:e,cardBottom:L,viewportHeight:r}){let t=C?V-(e??0):(L??r)-H;return Math.max(Math.min(120,Math.floor(t)),Math.floor(t-12))}function D3(C,V){return C?{activity:"10",drawer:V?"9":"2"}:V?{activity:"2",drawer:"10"}:{activity:"3",drawer:"2"}}var aV=400,nV=250,D2="sb-hold-repeat";function F3(C){if(!C||C.type!==D2)return 0;let V=C.detail,H=typeof V=="number"?V:Number(V);return Number.isFinite(H)&&H>0?H:0}var J1=class{constructor(V,H={}){this.delayHandle=null;this.intervalHandle=null;this.repeats=0;this.fired=!1;this.fire=V,this.delayMs=H.delayMs??aV,this.intervalMs=H.intervalMs??nV,this.timers={setTimeout:H.setTimeout??((e,L)=>setTimeout(e,L)),clearTimeout:H.clearTimeout??(e=>clearTimeout(e)),setInterval:H.setInterval??((e,L)=>setInterval(e,L)),clearInterval:H.clearInterval??(e=>clearInterval(e))}}get active(){return this.delayHandle!=null||this.intervalHandle!=null}get repeatCount(){return this.repeats}start(){this.clearTimers(),this.fired=!1,this.repeats=0,this.delayHandle=this.timers.setTimeout(()=>{this.delayHandle=null,this.tick(),this.intervalHandle=this.timers.setInterval(()=>this.tick(),this.intervalMs)},this.delayMs)}stop(){return this.clearTimers(),this.fired}consumeFired(){let V=this.fired;return this.fired=!1,V}tick(){this.fired=!0,this.repeats+=1;try{this.fire(this.repeats)}catch{}}clearTimers(){this.delayHandle!=null&&(this.timers.clearTimeout(this.delayHandle),this.delayHandle=null),this.intervalHandle!=null&&(this.timers.clearInterval(this.intervalHandle),this.intervalHandle=null)}},dV=500,F2="sb-long-press";function E3(C){return!!(C&&C.type===F2)}var C2=class{constructor(V,H={}){this.delayHandle=null;this.fired=!1;this.fire=V,this.delayMs=H.delayMs??dV,this.timers={setTimeout:H.setTimeout??((e,L)=>setTimeout(e,L)),clearTimeout:H.clearTimeout??(e=>clearTimeout(e))}}get active(){return this.delayHandle!=null}start(){this.clearTimer(),this.fired=!1,this.delayHandle=this.timers.setTimeout(()=>{this.delayHandle=null,this.fired=!0;try{this.fire()}catch{}},this.delayMs)}stop(){return this.clearTimer(),this.fired}consumeFired(){let V=this.fired;return this.fired=!1,V}clearTimer(){this.delayHandle!=null&&(this.timers.clearTimeout(this.delayHandle),this.delayHandle=null)}};function _(C,V){return C!=null&&Object.prototype.hasOwnProperty.call(C,V)}function E2(C){let V=C?.attributes?.current_activity_id;return V!=null?Number(V):null}function N3(C){return{...Number.isInteger(C?.icon)?{icon:Number(C.icon)}:{},...Number.isInteger(C?.color_id)?{color_id:Number(C.color_id)}:{}}}function AV(C){return(Array.isArray(C)?C:[]).map(V=>({id:Number(V?.id),name:String(V?.name??""),state:String(V?.state??""),...N3(V)})).filter(V=>Number.isFinite(V.id)&&V.name)}function $3(C,V,H){let e=C?.attributes?.activities,L=Array.isArray(e)&&e.length?e:V&&Array.isArray(H)?H:[];return{activities:AV(L),nextHubActivitiesCache:V&&Array.isArray(e)&&e.length?e:H}}function I3(C){let V=C?.attributes?.devices;return(Array.isArray(V)?V:[]).map(H=>({id:Number(H?.id),name:String(H?.name??""),device_class:H?.device_class!=null?String(H.device_class):void 0,...N3(H)})).filter(H=>Number.isFinite(H.id)&&H.name)}function U3(C,V){if(V==null)return"";let H=Number(V);return Number.isFinite(H)&&(Array.isArray(C)?C.find(L=>L.id===H):null)?.name||""}function V2(C,V){if(V==null)return"";let H=Number(V);return Number.isFinite(H)&&(Array.isArray(C)?C.find(L=>L.id===H):null)?.name||""}function W3(C,V){let H=C?.attributes?.current_activity;if(H)return String(H);let e=E2(C);return V2(V,e)}function G3(C,V,H){if(!C)return null;let e=V;if(e==null||e==="")return{activityId:null,label:A().card.defaultLayout,poweredOff:!1};if(e==="powered_off")return{activityId:null,label:A().card.poweredOff,poweredOff:!0};if(typeof e=="string"&&e.startsWith("device:")){let r=e.slice(7);if(r==="default")return{activityId:null,label:A().card.allDevicesLayout,poweredOff:!1,mode:"device",deviceId:null};let t=Number(r);return Number.isFinite(t)?{activityId:null,label:"",poweredOff:!1,mode:"device",deviceId:t}:null}let L=Number(e);return Number.isFinite(L)?{activityId:L,label:V2(H,L),poweredOff:!1}:null}function P(C){let V=String(C||"").trim().toLowerCase();return s3.has(V)||S3(V)}function z3(C,V,H){if(C==null)return!1;let e=Number(C);if(!Number.isFinite(e))return!1;let L=Array.isArray(V)?V.find(r=>Number(r?.id)===e):null;if(L&&L.state!=null&&String(L.state).trim()!==""){let r=String(L.state).trim().toLowerCase();return!P(r)&&r!=="off"}return!!H&&!P(H)}function q3(C){return Array.isArray(C)?`${C.length}:${C.map(V=>String(V??"")).join(",")}`:String(C??"")}function K3({isHubIntegration:C,activityId:V,assignedKeys:H,macroKeys:e,favoriteKeys:L,hubAssignedKeysCache:r,hubMacrosCache:t,hubFavoritesCache:o}){let i={...r||{}},M={...t||{}},n={...o||{}},a=V!=null?String(V):null,l=H&&typeof H=="object"?H:null,s=e&&typeof e=="object"?e:null,m=L&&typeof L=="object"?L:null;if(C&&a!=null){if(l&&(_(l,a)||_(l,V))){let S=l[a]??l[V];i[a]=Array.isArray(S)?S:[]}if(s&&(_(s,a)||_(s,V))){let S=s[a]??s[V];M[a]=Array.isArray(S)?S:[]}if(m&&(_(m,a)||_(m,V))){let S=m[a]??m[V];n[a]=Array.isArray(S)?S:[]}}let u=s&&a!=null&&(_(s,a)||_(s,V))?s[a]??s[V]??[]:C&&a!=null?M[a]??[]:[],v=m&&a!=null&&(_(m,a)||_(m,V))?m[a]??m[V]??[]:C&&a!=null?n[a]??[]:[],Z=l&&a!=null&&(_(l,a)||_(l,V))?l[a]??l[V]??null:C&&a!=null?i[a]??null:null;return{actKey:a,assignedMap:l,macroMap:s,favoriteMap:m,hubAssignedKeysCache:i,hubMacrosCache:M,hubFavoritesCache:n,macros:u,favorites:v,rawAssignedKeys:Z}}function Q3({editMode:C,preview:V,activities:H,currentActivityLabel:e,pendingActivity:L,pendingExpired:r}){let t=[...C?[A().card.defaultLayout]:[],A().card.poweredOff,...H.map(l=>l.name)],o=V?V.poweredOff?A().card.poweredOff:V.label||A().card.activityFallback(V.activityId):null;o&&!t.includes(o)&&t.push(o);let i=o||e||A().card.poweredOff,M=V?V.poweredOff:P(i),n=L&&!r&&L!==i?L:i,a=C||(V?!0:t.length<=1);return{options:t,previewLabel:o,current:i,poweredOff:M,resolvedValue:n,disabled:a,clearPending:!!(L&&(r||i===L))}}function j3({editMode:C,preview:V,devices:H,currentDeviceId:e}){let L=[{value:"",label:A().card.selectDevice},...H.map(t=>({value:String(t.id),label:t.name}))],r=e!=null?String(e):"";return C&&V?.mode==="device"&&(V.deviceId==null?(L.push({value:"device:default",label:A().card.allDevicesLayout}),r="device:default"):(r=String(V.deviceId),L.some(t=>t.value===r)||L.push({value:r,label:A().card.deviceFallback(V.deviceId)}))),{options:L,resolvedValue:r,disabled:C}}function X3(C,V,H){return!C&&V===0&&H!=="loading"?A().card.noActivitiesWarning:""}function y1(C){return new Promise(V=>setTimeout(V,C))}function Y3(C,V){return{requestSeen:C||{},queue:Array.isArray(V)?V:[]}}function J3(C,V){return V&&(C[V]=!0),C}function C0(C,V){return!!(V&&C[V])}function H0(C,V,{priority:H=!1,gapMs:e=150}={}){let L={list:V,gapMs:Number(e)};return H?C.unshift(L):C.push(L),C}function V0(C,V,H=3e3,e=Date.now()){let L=C[V]||0;return e-L<H?!1:(C[V]=e,!0)}function e0(C){return`req:basic:${C}`}function L0(){return["type:request_basic_data"]}function r0(C){return C==null?null:["type:request_assigned_keys",`activity_id:${Number(C)}`]}function t0(C){return C==null?null:["type:request_favorite_keys",`activity_id:${Number(C)}`]}function i0(C){return C==null?null:["type:request_macro_keys",`activity_id:${Number(C)}`]}function o0(C){return C==null?null:["type:start_activity",`activity_id:${Number(C)}`]}function M0(C){return C==null?null:["type:stop_activity",`activity_id:${Number(C)}`]}function N2(C,V){let H=Number(C),e=Number(V);return!Number.isFinite(H)||!Number.isFinite(e)?null:["type:send_assigned_key",`activity_id:${H}`,`key_id:${e}`]}function a0(C,V){let H=Number(C),e=Number(V);return!Number.isFinite(H)||!Number.isFinite(e)?null:["type:send_macro_key",`activity_id:${H}`,`key_id:${e}`]}function $2(C,V){let H=Number(C),e=Number(V);return!Number.isFinite(H)||!Number.isFinite(e)?null:["type:send_favorite_key",`device_id:${H}`,`key_id:${e}`]}function n0(C,V,H){let e=Number(V),L=Number(H);return!C||!Number.isFinite(e)||!Number.isFinite(L)?null:{entity_id:C,command:e,device:L}}function d0(C,V=0){if(!C||typeof C!="object")return null;let H=String(C.name??C.label??"").trim();if(!H)return null;let e=C.icon!=null&&String(C.icon).trim()?String(C.icon).trim():null,L=C.action&&typeof C.action=="object"?C.action:C.tap_action&&typeof C.tap_action=="object"?C.tap_action:null,r=C.command_id??C.key_id??C.command??C.key??C.id??null,t=C.device_id??C.activity_id??C.device??C.activity??null,o=r!=null?Number(r):null,i=t!=null?Number(t):null,M=Number.isFinite(o)&&(t==null||Number.isFinite(i)),n=!!(L&&(L.action||L.service||L.perform_action||L.navigation_path||L.url_path));return!M&&!n?null:{__custom:!0,name:H,icon:e,action:n?L:null,command_id:Number.isFinite(o)?o:null,device_id:Number.isFinite(i)?i:null,_idx:V,_raw:C}}function A0(C){let H=(Array.isArray(C)?C:[]).map(e=>{let L=String(e?.name??""),r=String(e?.icon??""),t=String(e?.command_id??""),o=String(e?.device_id??""),i="";try{i=e?.action?JSON.stringify(e.action):""}catch{i="[unserializable]"}return`${L}|${r}|${t}|${o}|${i}`});return`${H.length}:${H.join(";;")}`}var sV="Sofabaton Virtual Remote",lV="0.2.9";var s0=`__${sV}_logged__`,e2="__sofabatonAutomationAssistSession__",l0="__sofabatonPreviewActivityCache__",L2="sbx-virtual-remote",m0="sbx-virtual-remote-editor",p0=()=>{if(typeof window>"u")return null;let C=window[l0];return C&&typeof C=="object"?C:null},u0=C=>{if(!C)return null;let V=p0();return V?V[String(C)]??null:null},c0=(C,V)=>{if(!C||typeof window>"u")return;let H=p0()??{};H[String(C)]=V==null?"":String(V),window[l0]=H};function v0(){let C=window;if(C[s0])return;C[s0]=!0;let V="padding:2px 10px;border-radius:999px;font-weight:700;font-size:12px;line-height:18px;",H=V+"background:#ef4444;color:#fff;",e=V+"background:#22c55e;color:#062b12;",L=V+"background:#facc15;color:#111827;",r=V+"background:#3b82f6;color:#fff;",t="color:transparent;";console.log(`%cSofabaton%c %c Virtual %c %c  Remote  %c %c   ${lV}   `,H,t,e,t,L,t,r)}function B(C){if(C==null)return"";try{return JSON.stringify(C)}catch{return String(C)}}var mV={sofabaton_x1s:"x1s",sofabaton_hub:"hub"},r2=class{constructor(){this.kind="ha";this._hass=null;this._entityId=""}get hass(){return this._hass}get entityId(){return this._entityId}setHass(V){this._hass=V}setTarget(V){this._entityId=String(V??"")}snapshot(){if(this._entityId)return this._hass?.states?.[this._entityId]}async probeIntegration(){if(!this._hass?.callWS||!this._entityId)throw new Error("hass.callWS unavailable");let V=await this._hass.callWS({type:"config/entity_registry/get",entity_id:this._entityId});return mV[String(V?.platform||"")]??"unknown"}entryId(){return String(this.snapshot()?.attributes?.entry_id??"")}async devicePowerState(V){if(!this._hass?.callWS)return null;let H=this.entryId();if(!H)return null;try{let L=(await this._hass.callWS({type:"sofabaton_x1s/device/power_state",entry_id:H,device_id:V}))?.power_state;return L===1?1:L===0?0:null}catch{return null}}async deviceKeymap(V){if(!this._hass?.callWS)return null;let H=this.entryId();return H?this._hass.callWS({type:"sofabaton_x1s/device/keymap",entry_id:H,device_id:V}):null}async sendCommand(V,H){let e=n0(this._entityId,V,H);e&&await this.callService("remote","send_command",e)}async sendRawCommandList(V){await this.callService("remote","send_command",{entity_id:this._entityId,command:V})}async startActivity(V){await this.callService("remote","turn_on",{entity_id:this._entityId,activity:V.name})}async stopActivity(){await this.callService("remote","turn_off",{entity_id:this._entityId})}async callService(V,H,e={},L=void 0){if(!this._hass?.callService)throw new TypeError("hass.callService unavailable");return this._hass.callService(V,H,e,L)}};var pV=198,uV=199,cV=15e3,vV="sofabaton-remote:last-device:";function xV(C){return{show_activity:!0,show_dpad:!0,show_nav:!0,show_mid:!0,show_media:!0,show_dvr:!0,show_colors:!0,show_abc:!0,theme:"",background_override:null,show_automation_assist:!1,show_macros_button:null,show_favorites_button:null,custom_favorites:[],max_width:360,shrink:0,group_order:t1.slice(),...C}}var t2=class{constructor(V,H){this._backend=null;this._haBackend=null;this._backendUnsubscribe=null;this._config=null;this._editMode=!1;this.previewActivity=null;this.integration=null;this.integrationEntityId=null;this.integrationDetectingFor=null;this.hubRequestSeen=null;this.hubQueue=null;this.hubQueueBusy=!1;this.hubRequestCache=null;this.hubActivitiesCache=null;this.hubAssignedKeysCache=null;this.hubMacrosCache=null;this.hubFavoritesCache=null;this.x2LastFetchedActivityId=null;this.enabledButtonsCache=[];this.enabledButtonsCacheKey=null;this.enabledButtonsInvalid=!1;this.loadPending=!1;this.pendingActivity=null;this.pendingActivityAt=null;this.activityLoadActive=!1;this.activityLoadTarget=null;this.activityLoadTimeout=null;this.commandPulseUntil=0;this.commandPulseTimeout=null;this.previewState=null;this._mode="activity";this._deviceId=null;this.deviceKeymaps={};this.deviceKeymapFetching=new Set;this.deviceKeymapRetry=new Map;this.deviceKeymapRetryTimer=null;this.initialViewApplied=!1;this.commandFilter="";this.activeDrawer=null;this.activityMenuOpen=!1;this.lastUpdateFingerprint=null;this.powerBusy=!1;this._powerAssumption=null;this.onChange=V,this.host=H}get backend(){return this._backend}get hass(){return this._haBackend?.hass??null}get config(){return this._config}get editMode(){return this._editMode}setConfig(V){if(!V||!V.entity)throw new Error(A().card.selectEntityError);if(Object.prototype.hasOwnProperty.call(V,"preview_activity"))this.previewActivity=String(V?.preview_activity??""),c0(V?.entity,this.previewActivity);else if(this.previewActivity==null){let H=u0(V?.entity);this.previewActivity=H??""}this._config=xV(V),this._backend?.setTarget(String(this._config.entity)),this.activeDrawer=null,this.activityMenuOpen=!1,this.initialViewApplied=!1,this.invalidateFingerprint(),this.onChange()}setHass(V){this._haBackend||(this._haBackend=new r2),this._haBackend.setHass(V),this.setBackend(this._haBackend)}setBackend(V){this._backend!==V&&(this._backendUnsubscribe?.(),this._backendUnsubscribe=null,this._backend=V,V?.subscribe&&(this._backendUnsubscribe=V.subscribe(()=>this.onBackendChange()))),V&&this._config?.entity&&V.setTarget(String(this._config.entity)),this.onBackendChange()}onBackendChange(){this.ensureIntegration().then(()=>{this.shouldNotify()&&this.onChange()})}setEditMode(V){this._editMode=!!V,this.invalidateFingerprint(),this.onChange()}setPreviewActivity(V){this.previewActivity=V??"",this.invalidateFingerprint()}connected(){this._backend?.subscribe&&!this._backendUnsubscribe&&(this._backendUnsubscribe=this._backend.subscribe(()=>this.onBackendChange()))}disconnected(){this._backendUnsubscribe?.(),this._backendUnsubscribe=null,this.commandPulseTimeout&&clearTimeout(this.commandPulseTimeout),this.activityLoadTimeout&&clearTimeout(this.activityLoadTimeout),this.commandPulseTimeout=null,this.commandPulseUntil=0,this.activityLoadTimeout=null,this.deviceKeymapRetryTimer&&clearTimeout(this.deviceKeymapRetryTimer),this.deviceKeymapRetryTimer=null}invalidateFingerprint(){this.lastUpdateFingerprint=null}shouldNotify(){let V=this.updateFingerprint();return V===this.lastUpdateFingerprint?!1:(this.lastUpdateFingerprint=V,!0)}updateFingerprint(){let V=String(this._config?.entity||""),H=V?this.remoteState():null,e=H?.attributes||{},L=String(this._config?.theme||""),r=this.hass?.themes,t=L?r?.themes?.[L]:null,o=r?.darkMode?"dark":"light",i=this._deviceId!=null?this.deviceKeymaps[String(this._deviceId)]:null;return[V,String(H?.state??""),String(e?.current_activity_id??""),String(e?.current_activity??""),String(e?.load_state??""),String(e?.hub_version??""),B(e?.activities),B(e?.devices),B(e?.assigned_keys),B(e?.macro_keys),B(e?.favorite_keys),B(e?.long_press_keys),B(this._config?.background_override),L,o,B(t),this._editMode?"1":"0",String(this.previewActivity??""),this.integration||"",this._mode,String(this._deviceId??""),i?`${i.status}:${i.version??0}:${i.buttons.length}:${i.commands.length}`:"",B(e?.keymap_versions)].join("|")}async ensureIntegration(){if(!this._backend||!this._config?.entity)return;let V=String(this._config.entity);if(this.integrationEntityId&&this.integrationEntityId!==V&&(this.hubRequestCache=null,this.hubRequestSeen=null,this.hubQueue=null,this.hubQueueBusy=!1,this.hubActivitiesCache=null,this.hubAssignedKeysCache=null,this.hubMacrosCache=null,this.hubFavoritesCache=null,this.x2LastFetchedActivityId=null,this._mode="activity",this._deviceId=null,this.deviceKeymaps={},this.commandFilter="",this.initialViewApplied=!1),!(this.integrationEntityId===V&&this.integration)&&this.integrationDetectingFor!==V){this.integrationDetectingFor=V;try{this.integration=await this._backend.probeIntegration(),this.integrationEntityId=V}catch{this.integration=null,this.integrationEntityId=V}finally{this.integrationDetectingFor=null,this.invalidateFingerprint()}}}isHubIntegration(){return this.integration==="hub"}hubVersion(){return l3(this.remoteState())}isX2(){return k2(this.hubVersion(),this.isHubIntegration())}supportsUnicodeCommandNames(){return m3(this.hubVersion(),this.isHubIntegration())}mode(){return this._mode}currentDeviceId(){return this._deviceId}devices(){return I3(this.remoteState())}deviceNameForId(V){return U3(this.devices(),V)||null}deviceModeAvailable(){return this.integration!=="x1s"||!Y5(this._config)?!1:this.devices().length>0}maybeApplyInitialView(){if(this.initialViewApplied)return;let V=J5(this._config);if(V==null){this.initialViewApplied=!0;return}if(!this.deviceModeAvailable())return;this.initialViewApplied=!0;let H=Number(V);this.devices().some(e=>e.id===H)&&(this._mode="device",this._deviceId=H,this.ensureDeviceKeymap(H))}setMode(V){if(this._mode!==V){if(this._mode=V,this.activeDrawer=null,this.commandFilter="",V==="device"){let H=this.readLastDevice(),e=this.devices();this._deviceId=H!=null&&e.some(L=>L.id===H)?H:null,this._deviceId!=null&&this.ensureDeviceKeymap(this._deviceId)}this.invalidateFingerprint(),this.onChange()}}toggleMode(){this.setMode(this._mode==="device"?"activity":"device")}setDevice(V){let H=V!=null&&Number.isFinite(Number(V))?Number(V):null;this._deviceId!==H&&(this._deviceId=H,this.commandFilter="",this.writeLastDevice(H),H!=null&&this.ensureDeviceKeymap(H),this.invalidateFingerprint(),this.onChange())}setCommandFilter(V){this.commandFilter=String(V??""),this.onChange()}deviceKeymapState(V=this._deviceId){return V==null?null:this.deviceKeymaps[String(V)]??null}devicePowerConfigured(V=this._deviceId){let H=this.deviceKeymapState(V);return H?.status==="ready"&&H.powerConfigured===!0}async fetchDevicePowerState(V){let H=this._backend;if(!H)return null;try{return await H.devicePowerState(V)}catch{return null}}async toggleDevicePower(){if(this._editMode||this.powerBusy)return;let V=this._backend;if(!V||!this._config?.entity)return;let H=this._deviceId;if(!(H==null||!this.devicePowerConfigured(H))){this.powerBusy=!0,this.onChange();try{let e=null,L=this._powerAssumption;if(L&&L.deviceId===H&&Date.now()-L.at<cV?e=L.state:e=await this.fetchDevicePowerState(H),e==null)return;let r=e===1?uV:pV;this.triggerCommandPulse(),await V.sendCommand(r,H),this._powerAssumption={deviceId:H,state:e===1?0:1,at:Date.now()}}finally{this.powerBusy=!1,this.onChange()}}}filteredCommands(){let V=this.deviceKeymapState();return!V||V.status!=="ready"?[]:this.filterAndSortCommands(V.commands)}keymapVersion(V){let H=this.remoteState()?.attributes?.keymap_versions;return Number(H?.[String(V)]??0)||0}keymapStale(V){let H=this.deviceKeymaps[String(V)];return H?H.status==="loading"?!1:(H.version??0)!==this.keymapVersion(V):!0}scheduleKeymapRetry(V){this.deviceKeymapRetryTimer&&clearTimeout(this.deviceKeymapRetryTimer),this.deviceKeymapRetryTimer=setTimeout(()=>{this.deviceKeymapRetryTimer=null,this.invalidateFingerprint(),this.onChange()},V)}async ensureDeviceKeymap(V){let H=String(V);if(!this.keymapStale(V))return;let e=this._backend;if(!e||this.deviceKeymapFetching.has(H))return;let L=this.deviceKeymapRetry.get(H);if(L&&Date.now()<L.at)return;let r=this.keymapVersion(V),t=this.deviceKeymaps[H];t||(this.deviceKeymaps[H]={status:"loading",buttons:[],commands:[],version:r}),this.deviceKeymapFetching.add(H);try{let o=await e.deviceKeymap(V);if(o===null){let M=Math.min((L?.delayMs??500)*2,3e4);this.deviceKeymapRetry.set(H,{at:Date.now()+M,delayMs:M}),this.scheduleKeymapRetry(M),t||(delete this.deviceKeymaps[H],this.invalidateFingerprint(),this.onChange());return}this.deviceKeymapRetry.delete(H);let i=o?.keymap;if(!i)this.deviceKeymaps[H]={status:"cache_miss",buttons:[],commands:[],version:r};else{let M=new Set((Array.isArray(i.buttons)?i.buttons:[]).map(n=>Number(n)));for(let n of Array.isArray(i.bindings)?i.bindings:[])Number(n?.command_id)&&M.add(Number(n.button_id));this.deviceKeymaps[H]={status:"ready",buttons:[...M].filter(n=>Number.isFinite(n)),commands:(Array.isArray(i.commands)?i.commands:[]).map(n=>({command_id:Number(n?.command_id),name:String(n?.name??"")})).filter(n=>Number.isFinite(n.command_id)&&n.name),powerConfigured:i.power_configured===!0,version:r}}}catch{this.deviceKeymaps[H]={status:"error",buttons:[],commands:[],version:r}}finally{this.deviceKeymapFetching.delete(H)}this.invalidateFingerprint(),this.onChange()}lastDeviceStorageKey(){let V=String(this._config?.entity||"");return V?`${vV}${V}`:null}readLastDevice(){let V=this.lastDeviceStorageKey();if(!V||typeof window>"u")return null;try{let H=window.localStorage?.getItem(V),e=H==null?NaN:Number(H);return Number.isFinite(e)?e:null}catch{return null}}writeLastDevice(V){let H=this.lastDeviceStorageKey();if(!(!H||typeof window>"u"))try{V==null?window.localStorage?.removeItem(H):window.localStorage?.setItem(H,String(V))}catch{}}remoteState(){return this._backend?.snapshot()}currentActivityId(){return E2(this.remoteState())}activities(){let{activities:V,nextHubActivitiesCache:H}=$3(this.remoteState(),this.isHubIntegration(),this.hubActivitiesCache);return this.hubActivitiesCache=H,V}currentActivityLabel(){return W3(this.remoteState(),this.activities())}activityNameForId(V){return V2(this.activities(),V)??null}previewSelectionState(V){return G3(this._editMode,this.previewActivity,Array.isArray(V)?V:this.activities())}effectiveActivityId(){return this.previewState?this.previewState.activityId:this.currentActivityId()}isActivityOn(V,H){return z3(V,Array.isArray(H)?H:this.activities(),this.currentActivityLabel())}layoutConfig(V=this.effectiveActivityId()){return q1(this._config,V)}groupOrderList(V=null){let H=q1(this._config,V??this.effectiveActivityId());return f1(H?.group_order)}layoutSignature(V,H){let e=f1(H?.group_order),L=[`activity:${V??"off"}`,`order:${e.join(",")}`];for(let r of w2)r!=="group_order"&&L.push(`${r}:${String(H?.[r])}`);return L.join("|")}showMacrosButton(){return K1(this.layoutConfig())}showFavoritesButton(){return Q1(this.layoutConfig())}customFavorites(){let V=this._config?.custom_favorites;if(!Array.isArray(V))return[];let H=[];for(let e=0;e<V.length;e++){let L=d0(V[e],e);L&&H.push(L)}return H}customFavoritesSignature(V){return A0(V)}automationAssistEnabled(){return!!this._config?.show_automation_assist}enabledButtons(){return this.enabledButtonsCache||[]}isEnabled(V){if(this._mode==="device"){let e=this.deviceKeymapState();return!e||e.status!=="ready"?!0:e.buttons.includes(Number(V))}let H=this.enabledButtons();return this.enabledButtonsInvalid||!H.length?!0:H.some(e=>e.command===Number(V))}anyKeyBound(V){if(this._mode==="device"){let e=this.deviceKeymapState();return!e||e.status!=="ready"?!1:V.some(L=>e.buttons.includes(L))}if(this.enabledButtonsInvalid)return!1;let H=this.enabledButtons();return V.some(e=>H.some(L=>L.command===e))}commandTarget(V){return this.enabledButtons().find(L=>L.command===Number(V))||null}resolveCommandDeviceId(V,H=null){let e=H!=null?Number(H):this.commandTarget(V)?.activity_id??this.currentActivityId();return e==null||!Number.isFinite(Number(e))?null:Number(e)}activityLoadingActive(){return this.activityLoadActive}isLoadingActive(){let V=!!this.activityLoadActive,H=this.commandPulseUntil&&Date.now()<this.commandPulseUntil;return V||!!H||this.loadPending}triggerCommandPulse(){this.commandPulseUntil=Date.now()+1e3,this.host.onCommandPulseChange?.(!0),this.commandPulseTimeout&&clearTimeout(this.commandPulseTimeout),this.commandPulseTimeout=setTimeout(()=>{this.commandPulseUntil=0,this.commandPulseTimeout=null,this.host.onCommandPulseChange?.(!1)},1e3)}startActivityLoading(V){this.activityLoadTarget=String(V??""),this.activityLoadActive=!0,this.onChange(),this.activityLoadTimeout&&clearTimeout(this.activityLoadTimeout),this.activityLoadTimeout=setTimeout(()=>{this.activityLoadActive&&(this.activityLoadActive=!1,this.onChange())},6e4)}controlFailed(){this.pendingActivity=null,this.pendingActivityAt=null,this.stopActivityLoading()}stopActivityLoading(V=!0){this.activityLoadActive&&(this.activityLoadActive=!1,this.activityLoadTarget=null,this.activityLoadTimeout&&clearTimeout(this.activityLoadTimeout),this.activityLoadTimeout=null,V&&this.onChange())}hubInitState(){let V=Y3(this.hubRequestSeen,this.hubQueue);this.hubRequestSeen=V.requestSeen,this.hubQueue=V.queue}hubQueueIdle(){let V=Array.isArray(this.hubQueue)?this.hubQueue.length:0;return!this.hubQueueBusy&&V===0}hubEnqueueCommand(V,{priority:H=!1,gapMs:e=150}={}){this.isHubIntegration()&&(!this._backend||!this._config?.entity||(this.hubInitState(),this.hubQueue=H0(this.hubQueue,V,{priority:H,gapMs:e}),this.hubDrainQueue().catch(()=>{})))}hubEnqueueRequest(V,H){this.isHubIntegration()&&(!this._backend||!this._config?.entity||(this.hubInitState(),!(H&&C0(this.hubRequestSeen,H))&&(H&&(this.hubRequestSeen=J3(this.hubRequestSeen,H)),this.hubEnqueueCommand(V,{priority:!1,gapMs:3e3}))))}async hubDrainQueue(){if(this.isHubIntegration()&&!(!this._backend||!this._config?.entity)&&(this.hubInitState(),!this.hubQueueBusy)){this.hubQueueBusy=!0;try{for(;this.hubQueue.length;){let V=this.hubQueue.shift();if(!V?.list)continue;await this._backend?.sendRawCommandList?.(V.list);let H=Number.isFinite(Number(V?.gapMs))?Number(V.gapMs):750;await y1(H)}}finally{this.hubQueueBusy=!1,this.host.onHubQueueDrained?.()}}}hubThrottle(V,H=3e3){return this.hubRequestCache=this.hubRequestCache||{},V0(this.hubRequestCache,V,H)}async hubSendCommandList(V,H=null,e=3e3){if(!this._editMode&&this.isHubIntegration()&&!(!this._backend||!this._config?.entity)&&(this.hubInitState(),!(H&&!this.hubThrottle(H,e)))){if(this.hubQueueBusy||Array.isArray(this.hubQueue)&&this.hubQueue.length){this.hubEnqueueCommand(V,{priority:!0,gapMs:150});return}await this._backend?.sendRawCommandList?.(V)}}hubRequestBasicData(){let V=String(this._config?.entity||"");this.hubEnqueueRequest(L0(),e0(V))}hubRequestAssignedKeys(V){let H=r0(V);H&&this.hubEnqueueCommand(H,{priority:!1,gapMs:3e3})}hubRequestFavoriteKeys(V){let H=t0(V);H&&this.hubEnqueueCommand(H,{priority:!1,gapMs:3e3})}hubRequestMacroKeys(V){let H=i0(V);H&&this.hubEnqueueCommand(H,{priority:!1,gapMs:3e3})}async hubStartActivity(V){let H=o0(V);H&&await this.hubSendCommandList(H)}async hubStopActivity(V){let H=M0(V);H&&await this.hubSendCommandList(H)}async callService(V,H,e,L=void 0){let r=this._backend;if(!r?.callService)throw new TypeError("service calls are unavailable on this backend");await r.callService(V,H,e,L)}async runLovelaceAction(V,H=null){if(this._editMode||!V||typeof V!="object")return;let e=String(V.action||"").toLowerCase(),L=(!e||e==="default")&&(V.service||V.perform_action);if(e!=="none"){if(e==="call-service"||e==="perform-action"||L){let r=String(V.service||V.perform_action||"").trim();if(!r.includes("."))return;let[t,o]=r.split(".",2),i={...V.service_data||V.data||{}},M=V.target&&typeof V.target=="object"?V.target:void 0;await this.callService(t,o,i,M);return}if(e==="toggle"){let r=V.entity_id||V.entity||H?.entity_id||H?.entityId;if(!r)return;await this.callService("homeassistant","toggle",{entity_id:r});return}if(e==="more-info"){let r=V.entity_id||V.entity||H?.entity_id||H?.entityId;if(!r)return;this.host.fireEvent("hass-more-info",{entityId:r});return}if(e==="navigate"){let r=V.navigation_path;if(!r)return;history.pushState(null,"",String(r)),window.dispatchEvent(new Event("location-changed",{bubbles:!0,composed:!0}));return}if(e==="url"){let r=V.url_path;if(!r)return;window.open(String(r),"_blank");return}if(e==="fire-dom-event"){this.host.fireEvent("ll-custom",V);return}}}async sendCommand(V,H=null){if(this._editMode||!this._backend||!this._config?.entity)return;let e=this._mode==="device"?H!=null&&Number.isFinite(Number(H))?Number(H):this._deviceId:this.resolveCommandDeviceId(V,H);if(!(this._mode==="device"&&e==null)){if(this.isHubIntegration()){let L=N2(e,V);if(!L)return;await this.hubSendCommandList(L);return}await this._backend.sendCommand(V,e)}}longPressBindingForButton(V,H){if(this.integration!=="x1s")return null;let e=this.remoteState()?.attributes;return T3(e,H,V)}longPressAvailableForButton(V,H){return this.longPressBindingForButton(V,H)!==null}async sendLongPress(V,H){if(this._editMode||!this._backend||!this._config?.entity)return;let e=this.longPressBindingForButton(V,H);e&&await this._backend.sendCommand(e.command_id,e.device_id)}async sendDrawerItem(V,H,e,L){if(this._editMode)return;if(!this.isHubIntegration())return this.sendCommand(H,e);if(!this._backend||!this._config?.entity)return;let r=Number(e??this.currentActivityId()),t=Number(H);if(!Number.isFinite(t))return;if(V==="macros"){let i=a0(r,t);return i?this.hubSendCommandList(i):void 0}if(V==="favorites"){let i=Number(L?.device_id??L?.device),M=$2(i,t);return M?this.hubSendCommandList(M):void 0}let o=N2(r,t);if(o)return this.hubSendCommandList(o)}async sendCustomFavoriteCommand(V,H){if(this._editMode||!this._backend||!this._config?.entity)return;let e=Number(V),L=Number(H);if(!(!Number.isFinite(e)||!Number.isFinite(L))){if(this.isHubIntegration()){let r=$2(L,e);if(!r)return;await this.hubSendCommandList(r);return}await this._backend.sendCommand(e,L)}}async setActivity(V){if(this._editMode||V==null||V==="")return;let H=String(V),e=this.currentActivityLabel();if(H===e)return;if(this.pendingActivity=H,this.pendingActivityAt=Date.now(),this.startActivityLoading(H),this.isHubIntegration()){if(P(H)){let i=this.currentActivityId();i!=null&&await this.hubStopActivity(i);return}let o=this.activities().find(i=>i.name===H)?.id;if(o==null)return;await this.hubStartActivity(o);return}let L=this._backend;if(!L)return;if(P(H)){await L.stopActivity();return}let r=this.activities().find(t=>t.name===H);await L.startActivity({id:r?.id??null,name:H})}deriveRuntimeState(){let V=this.remoteState(),H=this.activities(),e=this.previewSelectionState(H);this.previewState=e,this.maybeApplyInitialView();let L=e?e.mode==="device"?"device":"activity":this._mode;L==="device"&&!e&&!this.deviceModeAvailable()&&(L="activity");let r=e?e.activityId:this.currentActivityId(),t=L==="device"?e?e.deviceId??null:this._deviceId:null,o=L==="device"?C3(this._config,t):q1(this._config,r);L==="device"&&t!=null&&this.keymapStale(t)&&this.ensureDeviceKeymap(t);let i=L==="device"?this.deviceKeymapState(t):null,M=V?.state==="unavailable",n=V?.attributes??{},a=n?.load_state,l=n?.assigned_keys,s=n?.macro_keys,m=n?.favorite_keys,u=K3({isHubIntegration:this.isHubIntegration(),activityId:r,assignedKeys:l,macroKeys:s,favoriteKeys:m,hubAssignedKeysCache:this.hubAssignedKeysCache||{},hubMacrosCache:this.hubMacrosCache||{},hubFavoritesCache:this.hubFavoritesCache||{}});if(this.hubAssignedKeysCache=u.hubAssignedKeysCache,this.hubMacrosCache=u.hubMacrosCache,this.hubFavoritesCache=u.hubFavoritesCache,this.isHubIntegration()&&!M){if(H.length===0&&a!=="loading"&&this.hubRequestBasicData(),r!=null){let O=Number(r);this.x2LastFetchedActivityId!==O&&(this.x2LastFetchedActivityId=O,this.hubRequestAssignedKeys(O),this.hubRequestMacroKeys(O),this.hubRequestFavoriteKeys(O))}}else this.isHubIntegration()&&r==null&&(this.x2LastFetchedActivityId=null);let v=u.rawAssignedKeys,Z=q3(v);if(this.enabledButtonsCacheKey!==Z){this.enabledButtonsCacheKey=Z;let O=Array.isArray(v)?v.map(V1=>({command:Number(V1),activity_id:r})).filter(V1=>Number.isFinite(V1.command)):[];this.enabledButtonsInvalid=Array.isArray(v)&&O.length===0,this.enabledButtonsCache=O}let S=L!=="device"&&!M&&!e&&a==="loading"&&(r==null?H.length===0:v==null);this.loadPending=S;let g=this.pendingActivityAt?Date.now()-this.pendingActivityAt:null,D=g!=null&&g>15e3,w=null,y=null,I=!1,F="";if(M)this.stopActivityLoading(!1);else if(L==="device")y=j3({editMode:this._editMode,preview:e,devices:this.devices(),currentDeviceId:t}),F=t!=null?this.deviceNameForId(t)??"":"",I=!1;else{w=Q3({editMode:this._editMode,preview:e,activities:H,currentActivityLabel:this.currentActivityLabel(),pendingActivity:this.pendingActivity,pendingExpired:D}),F=w.current,I=e?!!e.poweredOff:r==null||!!w.poweredOff,w.clearPending&&(this.pendingActivity=null,this.pendingActivityAt=null);let O=this.currentActivityLabel();this.activityLoadActive&&this.activityLoadTarget&&(P(this.activityLoadTarget)&&I||O===this.activityLoadTarget)&&this.stopActivityLoading(!1)}let a1=M3(o),n1=a3(o),s2=n3(o),O1=d3(o),l2=this.deviceModeAvailable()&&e3(o),m2=L==="device"?Q5(t):r,p2=i?.status==="ready"?this.filterAndSortCommands(i.commands):[],d1=L!=="device"?"":i?.status==="cache_miss"?this._backend?.kind==="server"?A().card.deviceKeymapMissingServer:A().card.deviceKeymapMissing:i?.status==="error"?A().card.deviceKeymapError:"";return{remote:V,isUnavailable:M,loadState:a,activities:H,preview:e,activityId:r,mode:L,deviceId:t,keymapEntry:i,keymapLoading:i?.status==="loading",loadPending:S,commands:p2,commandFilter:this.commandFilter,showCommandsButton:H3(o),deviceModeAvailable:l2,layoutConfig:o,layoutSignature:this.layoutSignature(m2,o),macros:u.macros,favorites:u.favorites,customFavorites:this.customFavorites(),rawAssignedKeys:v,selectState:w,deviceSelectState:y,currentLabel:F,isPoweredOff:I,isX2:this.isX2(),showVolume:a1,showChannel:n1,showMedia:s2,showDvr:O1,noActivitiesMessage:L==="device"?d1:X3(M,H.length,a)}}filterAndSortCommands(V){let H=this.commandFilter.trim().toLowerCase();return[...H?V.filter(L=>L.name.toLowerCase().includes(H)):V].sort((L,r)=>L.name.localeCompare(r.name,void 0,{sensitivity:"base"}))}};function x0(C){let V=String(C??"");return V!==""&&V===V.trim()&&!/^[-?:,[\]{}#&*!|>'"%@`]/.test(V)&&!/: |:$| #/.test(V)&&!/^(?:y|yes|n|no|true|false|on|off|null|~)$/i.test(V)&&!/^[-+]?(?:\d|\.\d)/.test(V)&&!/[\u0000-\u001f]/.test(V)?V:JSON.stringify(V)}function i2(C,V,H){if(!C||!V)return"";let e=C.kind||"button";if(e==="activity")return H?Number.isFinite(Number(C.activityId))?["action: remote.send_command","target:",`  entity_id: ${V}`,"data:","  command:","    - type:start_activity",`    - activity_id:${C.activityId}`].join(`
`):"":["action: remote.turn_on","target:",`  entity_id: ${V}`,"data:",`  activity: ${x0(C.activityName)}`].join(`
`);if(e==="power")return H?Number.isFinite(Number(C.activityId))?["action: remote.send_command","target:",`  entity_id: ${V}`,"data:","  command:","    - type:stop_activity",`    - activity_id:${C.activityId}`].join(`
`):"":["action: remote.turn_off","target:",`  entity_id: ${V}`].join(`
`);if(H){let L=C.commandType==="macro"?"send_macro_key":C.commandType==="favorite"?"send_favorite_key":"send_assigned_key",r=C.commandType==="favorite"?"device_id":"activity_id";return["action: remote.send_command","target:",`  entity_id: ${V}`,"data:","  command:",`    - type:${L}`,`    - ${r}:${C.deviceId}`,`    - key_id:${C.commandId}`].join(`
`)}return["action: remote.send_command","target:",`  entity_id: ${V}`,"data:",`  command: ${C.commandId}`,`  device: ${C.deviceId}`].join(`
`)}function I2(C,V,H){if(!C||!V)return"";let e=C.kind||"button",L=C.label||A().assist.automationAssistName,r=e==="activity"?"mdi:television-classic":e==="power"?"mdi:power":C.commandType==="favorite"?"mdi:star":C.commandType==="macro"?"mdi:cogs":C.icon||"mdi:remote",t=i2(C,V,H).split(`
`).map(o=>`  ${o}`).join(`
`);return["type: button",`name: ${x0(L)}`,`icon: ${r}`,"tap_action:","  action: perform-action","  perform_"+t.substring(2),"hold_action:","  action: none"].join(`
`)}function h0(C,V,H,e){if(!C)return"";let L=C.kind||"button",r=A().assist.notification,t=C.activityName||e||A().assist.unknown,o=C.label??"",i=L==="button"?C.deviceMode?r.eventCommand(o):r.eventButton(o):L==="activity"?r.eventActivity(o):r.eventOther(o),M=I2(C,V,H),n=i2(C,V,H);return["---","",C.deviceMode?r.headerDevice(C.deviceName||A().assist.unknownDevice,i):r.header(t,i),"","---",r.lovelaceHeading,"",r.lovelaceCopy,"```yaml",M,"```",r.serviceHeading,"",r.serviceCopy,"```yaml",n,"```"].join(`
`)}function Z0(C){if(!C)return null;let V=String(C).replace(/[^a-fA-F0-9]/g,"").toUpperCase();return!V||V.length<6?null:V}function U2(C){if(C==null)return null;if(typeof C=="object")return C;try{return JSON.parse(String(C))}catch{return null}}var o2=class{constructor(V){this.active=!1;this.capture=null;this.statusMessage=null;this.mqttMatch=!1;this.mqttPayload=null;this.mqttDeviceName=null;this.mqttCommandName=null;this.mqttExisting=!1;this.discoveryCreated=!1;this.discoveryWorking=!1;this.discoveryDeviceId=null;this.modalOpen=!1;this.modalDeviceId=null;this.modalActivityChecked=!1;this.hubMac=null;this.hubMacDetecting=!1;this.mqttUnsub=null;this.mqttTopic=null;this.mqttToken=null;this.mqttLookupId=0;this.mqttDeviceNames=new Map;this.mqttDeviceCommands=new Map;this.mqttRequestQueue=Promise.resolve();this.mqttPublishQueue=Promise.resolve();this.discoveryIds=new Set;this.lastActivityLabel=null;this.lastActivityId=null;this.host=V}sessionState(){let V=window;return V[e2]||(V[e2]={hideMqttModal:!1,discoveryDeviceIds:new Set,activityTriggersCreated:!1}),V[e2]}activityTriggersCreatedInSession(){return this.sessionState().activityTriggersCreated}ensureCaptureStarted(){return!this.host.assistEnabled()||this.host.isEditMode()?!1:(this.active||this.setActive(!0),this.active)}primeActivityBaseline(){let V=this.host.currentActivityLabel(),H=this.host.currentActivityId();this.lastActivityLabel=V,this.lastActivityId=Number.isFinite(Number(H))?Number(H):null}resetActivityBaseline(){this.lastActivityLabel=null,this.lastActivityId=null}setActive(V){let H=!!V;this.active!==H&&(this.active=H,H?(this.statusMessage=null,this.primeActivityBaseline(),this.syncMqtt()):(this.capture=null,this.mqttMatch=!1,this.mqttPayload=null,this.mqttDeviceName=null,this.mqttCommandName=null,this.mqttExisting=!1,this.discoveryCreated=!1,this.discoveryWorking=!1,this.discoveryDeviceId=null,this.statusMessage=null,this.unsubscribeMqtt(),this.closeMqttModal()),this.host.onChange())}resetCaptureSideState(){this.mqttMatch=!1,this.mqttPayload=null,this.mqttDeviceName=null,this.mqttCommandName=null,this.mqttExisting=!1,this.discoveryCreated=!1,this.discoveryWorking=!1,this.discoveryDeviceId=null,this.statusMessage=null}recordActivityChange(V){if(!this.ensureCaptureStarted())return;let H=Number(V.activityId),e=Number.isFinite(H)?H:null,L=!!V.poweredOff,r=L?A().card.poweredOff:String(V.activityName||A().assist.activityFallbackLabel);this.capture={label:r,activityId:e,activityName:L?A().card.poweredOff:String(V.activityName||r),kind:L?"power":"activity"},this.resetCaptureSideState(),this.host.onChange(),this.notifyCapture()}recordClick(V){if(!this.ensureCaptureStarted())return;let H=Number(V.commandId);if(!Number.isFinite(H))return;if(V.deviceMode){let t=Number(V.deviceId);if(!Number.isFinite(t))return;this.capture={label:String(V.label??A().assist.buttonFallback),commandId:H,deviceId:t,commandType:V.commandType??"assigned",icon:V.icon?String(V.icon):null,deviceMode:!0,deviceName:String(V.deviceName||A().assist.deviceFallback(t)),kind:"button"},this.resetCaptureSideState(),this.host.onChange(),this.notifyCapture();return}let e=V.commandType??"assigned",L=e==="favorite"||e==="macro"?V.deviceId!=null?Number(V.deviceId):this.host.currentActivityId():this.host.resolveCommandDeviceId(H,V.deviceId??null);if(L==null||!Number.isFinite(Number(L)))return;let r=this.host.activityNameForId(L)||this.host.currentActivityLabel()||A().assist.unknown;this.capture={label:String(V.label??A().assist.buttonFallback),commandId:H,deviceId:Number(L),commandType:e,icon:V.icon?String(V.icon):null,activityName:r,kind:"button"},this.resetCaptureSideState(),this.host.onChange(),this.notifyCapture()}observeActivityState(V){let H=V.currentLabel;!V.unavailable&&this.host.assistEnabled()&&this.lastActivityLabel!=null&&H!==this.lastActivityLabel&&(P(H)?this.recordActivityChange({activityId:this.lastActivityId,activityName:A().card.poweredOff,poweredOff:!0}):this.recordActivityChange({activityId:V.activityId,activityName:H,poweredOff:!1})),V.unavailable?this.resetActivityBaseline():(this.lastActivityLabel=H,this.lastActivityId=V.activityId)}remoteYaml(){return i2(this.capture,this.host.entityId(),this.host.isHubIntegration())}buttonYaml(){return I2(this.capture,this.host.entityId(),this.host.isHubIntegration())}notifyCapture(){if(!this.host.assistEnabled()||!this.host.getHass())return;let V=this.capture,H=h0(V,this.host.entityId(),this.host.isHubIntegration(),this.host.activityNameForId(V?.deviceId)||this.host.currentActivityLabel()||"");H&&this.host.callService("persistent_notification","create",{title:A().assist.notification.title,message:H})}statusText(){return this.active?this.statusMessage?this.statusMessage:this.capture?A().assist.captured(String(this.capture.label??"")):A().assist.waiting:this.host.isEditMode()?A().assist.exitEditMode:A().assist.waiting}modalViewState(){let V=this.active,H=this.mqttSupported(),e=this.mqttPayload,L=Number(e?.device_id),r=Number(e?.key_id),t=this.mqttDeviceName||(Number.isFinite(L)?A().assist.deviceFallback(L):A().assist.unknownDevice),o=this.mqttCommandName||(Number.isFinite(r)?A().assist.commandFallback(r):null),i=[A().assist.detectedDevice(t)];o&&i.push(A().assist.lastCommand(o)),this.mqttExisting&&i.push(A().assist.existingTriggers);let M=this.discoveryWorking?A().assist.working:this.discoveryCreated?A().assist.triggersReady:A().assist.createTriggers;return{open:this.modalOpen,showActivityRow:!this.sessionState().activityTriggersCreated,text:i.join(" "),showStart:!V,showCreate:H&&V,createLabel:M,createDisabled:this.discoveryWorking||this.discoveryCreated||!this.mqttAvailable()}}mqttSupported(){return this.host.isX2()}mqttAvailable(){return this.mqttSupported()&&this.active&&!!this.hubMac&&!this.discoveryCreated&&!this.discoveryWorking&&this.mqttReady()}mqttReady(){return this.host.isHubIntegration()?this.host.hubQueueIdle():!0}safeUnsubscribe(V){if(typeof V=="function")try{let H=V();H&&typeof H.catch=="function"&&H.catch(()=>{})}catch{}}ensureHubMac(){let V=this.host.getHass();if(!V||!this.host.entityId()||this.hubMac||this.hubMacDetecting)return;let H=Z0(this.host.hubMacAttribute());if(H){this.hubMac=H;return}if(!this.host.isHubIntegration()||!V.connection?.subscribeMessage)return;this.hubMacDetecting=!0;let e="activity/+/list",L=null,r=null,t=!1,o=()=>{if(t)return;t=!0,L&&(clearTimeout(L),L=null);let i=r;r=null,this.safeUnsubscribe(i),this.hubMacDetecting=!1,this.host.onChange(),this.syncMqtt()};V.connection.subscribeMessage(i=>{let M=String(i?.topic||"").match(/^activity\/([^/]+)\/list$/),n=M?.[1]?Z0(M[1]):null;n&&(this.hubMac=n,o())},{type:"mqtt/subscribe",topic:e}).then(i=>{r=i,this.host.requestHubBasicData(),L=setTimeout(()=>o(),4e3)}).catch(()=>{o()})}syncMqtt(){if(!this.host.assistEnabled()){this.unsubscribeMqtt();return}if(!this.active){this.unsubscribeMqtt();return}if(!this.mqttSupported()){this.unsubscribeMqtt();return}if(!this.mqttReady())return;this.ensureHubMac();let V=this.hubMac;if(!V)return;let H=`${V}/up`;if(this.mqttTopic===H&&this.mqttToken)return;this.unsubscribeMqtt();let e=this.host.getHass();if(!e?.connection?.subscribeMessage)return;this.mqttTopic=H;let L=Symbol("mqtt-subscription");this.mqttToken=L,e.connection.subscribeMessage(r=>{this.mqttToken===L&&this.handleMqtt(r)},{type:"mqtt/subscribe",topic:H}).then(r=>{this.mqttToken===L?this.mqttUnsub=r:this.safeUnsubscribe(r)}).catch(()=>{this.mqttToken===L&&(this.mqttToken=null,this.mqttTopic=null)})}unsubscribeMqtt(){if(this.mqttToken=null,this.mqttUnsub){let V=this.mqttUnsub;this.mqttUnsub=null,this.safeUnsubscribe(V)}this.mqttTopic=null}mqttTriggerExists(V,H){return!1}shouldSuppressMqttModal(V){let H=this.sessionState();return H.hideMqttModal?!0:H.discoveryDeviceIds.has(V)}openMqttModal(V){Number.isFinite(V)&&(this.shouldSuppressMqttModal(V)||(this.modalDeviceId=V,this.modalOpen=!0,this.modalActivityChecked=!1,this.host.onChange()))}closeMqttModal(){this.modalOpen&&(this.modalOpen=!1,this.host.onChange())}setModalOptOut(V){V&&(this.sessionState().hideMqttModal=!0,this.closeMqttModal())}setModalActivityChecked(V){this.modalActivityChecked=!!V}handleMqtt(V){let H=U2(V?.payload);if(!H)return;let e=Number(H.device_id);Number.isFinite(e)&&this.discoveryDeviceId!==e&&(this.discoveryDeviceId=e,this.discoveryCreated=!1,this.discoveryWorking=!1),this.mqttMatch=!0,this.mqttPayload=H,this.mqttDeviceName=null,this.mqttCommandName=null,this.mqttExisting=this.mqttTriggerExists(H,this.mqttTopic),this.host.onChange(),this.primeMqttMetadata(H),this.openMqttModal(e)}primeMqttMetadata(V){let H=this.hubMac;if(!H||!V)return;let e=Number(V.device_id),L=Number(V.key_id);if(!Number.isFinite(e)||!Number.isFinite(L))return;let r=this.mqttLookupId+1;this.mqttLookupId=r,Promise.all([this.requestMqttDeviceName(H,e),this.requestMqttDeviceCommandName(H,e,L)]).then(([t,o])=>{this.mqttLookupId===r&&(t&&(this.mqttDeviceName=t),o&&(this.mqttCommandName=o),this.host.onChange())})}async requestMqttDeviceName(V,H){let e=this.host.getHass();if(!e?.connection?.subscribeMessage||!Number.isFinite(H))return null;let L=`${V}:${H}`;if(this.mqttDeviceNames.has(L))return this.mqttDeviceNames.get(L)??null;let r=`device/${V}/list`,t=`device/${V}/list_request`,o=JSON.stringify({data:"device_list"});return this.enqueueMqttRequest(()=>new Promise(i=>{let M=null,n=null,a=l=>{if(M&&clearTimeout(M),n){let s=n;n=null,this.safeUnsubscribe(s)}l&&this.mqttDeviceNames.set(L,l),i(l||null)};e.connection.subscribeMessage(l=>{let s=U2(l?.payload),u=(Array.isArray(s?.data)?s.data:[]).find(v=>Number(v?.device_id)===H);a(u?.device_name?String(u.device_name):null)},{type:"mqtt/subscribe",topic:r}).then(l=>{n=l,this.host.callService("mqtt","publish",{topic:t,payload:o}),M=setTimeout(()=>a(null),4e3)}).catch(()=>a(null))}))}async requestMqttDeviceCommandName(V,H,e){if(!Number.isFinite(e))return null;let L=await this.requestMqttDeviceCommands(V,H);return L&&L.get(Number(e))||null}async requestMqttDeviceCommands(V,H){let e=this.host.getHass();if(!e?.connection?.subscribeMessage||!Number.isFinite(H))return null;let L=`${V}:${H}`;if(this.mqttDeviceCommands.has(L))return this.mqttDeviceCommands.get(L)??null;let r=`device/${V}/keys_list`,t=`device/${V}/keys_request`,o=JSON.stringify({data:{device_id:H}});return this.enqueueMqttRequest(()=>new Promise(i=>{let M=null,n=null,a=l=>{if(M&&clearTimeout(M),n){let s=n;n=null,this.safeUnsubscribe(s)}l&&this.mqttDeviceCommands.set(L,l),i(l||null)};e.connection.subscribeMessage(l=>{let s=U2(l?.payload);if(Number(s?.device_id)!==H)return;let m=Array.isArray(s?.data)?s.data:[],u=new Map;m.forEach(v=>{let Z=Number(v?.key_id);if(!Number.isFinite(Z))return;let S=v?.key_name?String(v.key_name):null;S&&u.set(Z,S)}),a(u)},{type:"mqtt/subscribe",topic:r}).then(l=>{n=l,this.host.callService("mqtt","publish",{topic:t,payload:o}),M=setTimeout(()=>a(null),4e3)}).catch(()=>a(null))}))}enqueueMqttRequest(V){let H=async()=>V();return this.mqttRequestQueue=this.mqttRequestQueue.then(H,H),this.mqttRequestQueue}enqueueMqttPublish(V){let H=async()=>V();return this.mqttPublishQueue=this.mqttPublishQueue.then(H,H),this.mqttPublishQueue}setStatus(V){this.statusMessage=String(V??""),this.host.onChange()}async createTriggers(){if(!this.mqttAvailable())return;let V=this.hubMac,H=this.mqttPayload;if(!V||!H)return;let e=Number(H.device_id);if(Number.isFinite(e)){this.discoveryWorking=!0,this.host.onChange();try{let[L,r]=await Promise.all([this.requestMqttDeviceName(V,e),this.requestMqttDeviceCommands(V,e)]);if(!r||r.size===0){this.setStatus(A().assist.noMqttCommands);return}let t=L||A().assist.deviceFallback(e),o=`${V}/up`,i=String(V).toLowerCase(),M=String(V).toUpperCase(),n=this.sessionState(),l=!n.activityTriggersCreated&&this.modalActivityChecked,s=0,m=0;for(let[u,v]of r.entries()){let Z={device_id:e,key_id:Number(u)};if(!Number.isFinite(Z.key_id)||this.mqttTriggerExists(Z,o))continue;let S=v||A().assist.commandFallback(Z.key_id),g=`sofabaton_${i}_d${e}_k${Z.key_id}`;if(this.discoveryIds.has(g))continue;let w={automation_type:"trigger",type:"button_short_press",subtype:`X2 ${t} ${S}`,payload:JSON.stringify(Z),topic:`${M}/up`,device:{identifiers:[`sofabaton_x2_remote_${e}`],name:`X2 \u2192 ${t}`,model:"X2",manufacturer:"Sofabaton"}};await this.enqueueMqttPublish(async()=>{await this.host.callService("mqtt","publish",{topic:`homeassistant/device_automation/${g}/config`,payload:JSON.stringify(w),retain:!0}),this.discoveryIds.add(g),await y1(250)}),s+=1}if(l){let u=`activity/${i}/activity_control_up`,v={identifiers:["sofabaton_x2_remote_activities"],name:"X2 \u2192 Activities",model:"X2",manufacturer:"Sofabaton"},S=this.host.activities().map(g=>({id:g.id,name:g.name,state:"on"}));S.push({id:255,name:"Powered Off",state:"off"});for(let g of S){let D=Number(g.id);if(!Number.isFinite(D))continue;let w={activity_id:D,state:g.state},y=`sofabaton_${i}_activity_${D}`;if(this.discoveryIds.has(y))continue;let F={automation_type:"trigger",type:"button_short_press",subtype:`X2 Activity ${g.name}`,payload:JSON.stringify(w),topic:u,device:v};await this.enqueueMqttPublish(async()=>{await this.host.callService("mqtt","publish",{topic:`homeassistant/device_automation/${y}/config`,payload:JSON.stringify(F),retain:!0}),this.discoveryIds.add(y),await y1(250)}),m+=1}n.activityTriggersCreated=!0}if(this.discoveryCreated=!0,this.discoveryDeviceId=e,n.discoveryDeviceIds.add(e),s>0||m>0){let u=l&&m>0&&s>0?A().assist.plusActivityTriggers(m):"",v=s>0?A().assist.createdTriggers(s,t):A().assist.createdActivityTriggers(m);this.setStatus(`${v}${u}`)}else this.setStatus(A().assist.allTriggersExist(t))}finally{this.discoveryWorking=!1,this.host.onChange()}}}disconnected(){this.unsubscribeMqtt()}};var g0=Symbol.for(""),hV=C=>{if(C?.r===g0)return C?._$litStatic$},f0=C=>({_$litStatic$:C,r:g0});var S0=new Map,W2=C=>(V,...H)=>{let e=H.length,L,r,t=[],o=[],i,M=0,n=!1;for(;M<e;){for(i=V[M];M<e&&(r=H[M],(L=hV(r))!==void 0);)i+=L+V[++M],n=!0;M!==e&&o.push(r),t.push(i),M++}if(M===e&&t.push(V[e]),n){let a=t.join("$$lit$$");(V=S0.get(a))===void 0&&(t.raw=t,S0.set(a,V=t)),H=o}return C(V,...H)},b0=W2(h),NL=W2(k5),$L=W2(_5);function C1(C){return f(V=>{if(!V)return;let H=V;H.__sbTrigger=C,!H.__sbActionWired&&(H.__sbActionWired=!0,H2(H,e=>H.__sbTrigger?.(e),{fireHaptic:()=>{H.dispatchEvent(new CustomEvent("haptic",{detail:"light",bubbles:!0,composed:!0}))}}))})}function y0(C){return f(V=>{if(!V)return;let H=V;H.__sbListenersWired||(H.__sbListenersWired=!0,C(H))})}function w0(C){let V=f0(_2()),e=(C.unavailable?[]:C.options).map(t=>typeof t=="string"?{value:t,label:t}:t),L=y0(t=>{t.addEventListener("selected",C.onSelect),t.addEventListener("change",C.onSelect),p3().forEach(o=>{t.addEventListener(o,()=>C.onMenuOpened(),!0)}),u3().forEach(o=>{t.addEventListener(o,()=>C.onMenuClosed(),!0)}),t.addEventListener("change",()=>C.onMenuClosed(),!0),t.addEventListener("blur",()=>C.onMenuClosed(),!0)}),r=C.modeToggle?h`
        <button
          type="button"
          class="sb-mode-toggle"
          aria-label=${C.modeToggle.ariaLabel}
          title=${C.modeToggle.ariaLabel}
          .disabled=${C.unavailable}
          @click=${t=>{t.preventDefault(),t.stopPropagation(),C.modeToggle.onToggle()}}
        >
          <sbx-ha-icon icon=${C.modeToggle.icon}></sbx-ha-icon>
        </button>
      `:p;return h`
    <div
      class="activityRow${C.modeToggle?" activityRow--with-toggle":""}${C.menuOpen?" activityRow--menu-open":""}"
      style=${C.visible?"":"display: none !important;"}
      ${C.rowRef?f(C.rowRef):p}
    >
      ${r}
      <sbx-ha-select
        class="sb-activity-select"
        .label=${C.selectLabel}
        .hass=${C.hass}
        .value=${C.unavailable?"":c3(C.resolvedValue,e)}
        .disabled=${C.unavailable||C.disabled}
        ${L}
      >
        ${z(e,t=>t.value,t=>b0`
            <${V} .value=${t.value}>${t.label}</${V}>
          `)}
      </sbx-ha-select>
      <div
        class="loadIndicator${C.loading?" is-loading":""}"
        ${C.loadIndicatorRef?f(C.loadIndicatorRef):p}
      ></div>
    </div>
  `}var O0=`
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
`,M2=null;function ZV(C){if(typeof CSSStyleSheet<"u"&&"replaceSync"in CSSStyleSheet.prototype&&"adoptedStyleSheets"in C){M2||(M2=new CSSStyleSheet,M2.replaceSync(O0)),C.adoptedStyleSheets=[...C.adoptedStyleSheets,M2];return}let V=document.createElement("style");V.textContent=O0,C.appendChild(V)}var SV=globalThis.HTMLElement??class{},G2=class extends SV{constructor(){super(...arguments);this._control=null;this._iconEl=null;this._trailingIconEl=null;this._labelEl=null;this._label="";this._icon=null;this._trailingIcon=null;this._accessibilityLabel="";this._color=null;this._sizeVar=null;this._disabled=!1;this._wired=!1;this._holdRepeat=!1;this._longPress=!1;this._hold=new J1(H=>this.repeatTrigger(H));this._longHold=new C2(()=>this.longPressTrigger());this.onTrigger=null}set label(H){this._label=String(H??""),this.syncContent()}set icon(H){this._icon=H?String(H):null,this.syncContent()}set trailingIcon(H){this._trailingIcon=H?String(H):null,this.syncContent()}set accessibilityLabel(H){this._accessibilityLabel=String(H??""),this.syncContent()}set color(H){this._color=H?String(H):null,this._color?(this.style.setProperty("--sb-color",this._color),this.style.setProperty("--sb-control-background",this._color)):(this.style.removeProperty("--sb-color"),this.style.removeProperty("--sb-control-background"))}set sizeVar(H){this._sizeVar=H?String(H):null,this._sizeVar?this.style.setProperty("--sb-control-font-size",`var(${this._sizeVar})`):this.style.removeProperty("--sb-control-font-size")}set disabled(H){this._disabled=!!H,this._control&&(this._control.disabled=this._disabled),this._disabled&&(this._hold.stop(),this._longHold.stop())}set holdRepeat(H){this._holdRepeat=!!H,this._holdRepeat||this._hold.stop()}get holdRepeat(){return this._holdRepeat}set longPress(H){this._longPress=!!H,this._longPress||this._longHold.stop()}get longPress(){return this._longPress}get disabled(){return this._disabled}fireHaptic(){this.dispatchEvent(new CustomEvent("haptic",{detail:"light",bubbles:!0,composed:!0}))}trigger(H){this._disabled||this.classList.contains("disabled")||this._hold.consumeFired()||this._longHold.consumeFired()||this.onTrigger?.(H)}repeatTrigger(H){if(this._disabled||this.classList.contains("disabled")){this._hold.stop();return}H===1&&this.fireHaptic(),this.onTrigger?.(new CustomEvent(D2,{detail:H}))}longPressTrigger(){if(this._disabled||this.classList.contains("disabled")){this._longHold.stop();return}this.fireHaptic(),this.onTrigger?.(new CustomEvent(F2))}onHoldPointerDown(H){this._disabled||this.classList.contains("disabled")||H.isPrimary===!1||typeof H.button=="number"&&H.button!==0||(this._holdRepeat?this._hold.start():this._longPress&&this._longHold.start())}onHoldPointerEnd(H){this._hold.stop(),this._longHold.stop(),H.type!=="pointerup"&&(this._hold.consumeFired(),this._longHold.consumeFired())}syncContent(){!this._control||!this._iconEl||!this._trailingIconEl||!this._labelEl||(this._icon?(this._iconEl.setAttribute("icon",this._icon),this._iconEl.hidden=!1):(this._iconEl.removeAttribute("icon"),this._iconEl.hidden=!0),this._trailingIcon?(this._trailingIconEl.setAttribute("icon",this._trailingIcon),this._trailingIconEl.hidden=!1):(this._trailingIconEl.removeAttribute("icon"),this._trailingIconEl.hidden=!0),this._control.classList.toggle("sb-key-control--with-trailing-icon",!!this._trailingIcon),this._labelEl.textContent=this._label,this._labelEl.hidden=!this._label,this._control.setAttribute("aria-label",this._accessibilityLabel||this._label||A().assist.buttonFallback))}connectedCallback(){if(this._wired)return;this._wired=!0;let H=this.attachShadow({mode:"open"});ZV(H);let e=document.createElement("button");e.type="button",e.className="sb-key-control",e.disabled=this._disabled;let L=document.createElement("sbx-ha-icon");L.className="sb-key-control__icon";let r=document.createElement("span");r.className="sb-key-control__label";let t=document.createElement("sbx-ha-icon");t.className="sb-key-control__trailing-icon",e.append(L,r,t),H.appendChild(e),this._control=e,this._iconEl=L,this._trailingIconEl=t,this._labelEl=r,this.syncContent(),this.addEventListener("pointerdown",o=>this.onHoldPointerDown(o),{capture:!0});for(let o of["pointerup","pointercancel","pointerleave","lostpointercapture"])this.addEventListener(o,i=>this.onHoldPointerEnd(i),{capture:!0});e.addEventListener("contextmenu",o=>{(this._holdRepeat||this._longPress)&&o.preventDefault()}),H2([this,e],o=>this.trigger(o),{fireHaptic:()=>this.fireHaptic()})}disconnectedCallback(){this._hold.stop(),this._longHold.stop()}};customElements.get("sbx-key-button")||customElements.define("sbx-key-button",G2);function gV(C){return C.label}function z2(C){return C.glyphFace?A().keys[C.key]??C.label:f3(C.key,C.color?C.key:C.label)}var fV=new Set([d.C,d.B,d.A,d.EXIT,d.DVR,d.PLAY,d.GUIDE,...j1]),bV=[{key:"up",id:d.UP,cmd:d.UP,label:"",icon:"mdi:chevron-up",extraClass:"area-up"},{key:"left",id:d.LEFT,cmd:d.LEFT,label:"",icon:"mdi:chevron-left",extraClass:"area-left"},{key:"ok",id:d.OK,cmd:d.OK,label:"",icon:"mdi:circle",extraClass:"area-ok okKey",size:"big"},{key:"right",id:d.RIGHT,cmd:d.RIGHT,label:"",icon:"mdi:chevron-right",extraClass:"area-right"},{key:"down",id:d.DOWN,cmd:d.DOWN,label:"",icon:"mdi:chevron-down",extraClass:"area-down"}],k0=[{key:"num1",id:d.NUM_1,cmd:d.NUM_1,label:"1",icon:"",size:"small"},{key:"num2",id:d.NUM_2,cmd:d.NUM_2,label:"2",icon:"",size:"small"},{key:"num3",id:d.NUM_3,cmd:d.NUM_3,label:"3",icon:"",size:"small"},{key:"num4",id:d.NUM_4,cmd:d.NUM_4,label:"4",icon:"",size:"small"},{key:"num5",id:d.NUM_5,cmd:d.NUM_5,label:"5",icon:"",size:"small"},{key:"num6",id:d.NUM_6,cmd:d.NUM_6,label:"6",icon:"",size:"small"},{key:"num7",id:d.NUM_7,cmd:d.NUM_7,label:"7",icon:"",size:"small"},{key:"num8",id:d.NUM_8,cmd:d.NUM_8,label:"8",icon:"",size:"small"},{key:"num9",id:d.NUM_9,cmd:d.NUM_9,label:"9",icon:"",size:"small"},{key:"numdash",id:d.NUM_DASH,cmd:d.NUM_DASH,label:"-",icon:"",size:"small"},{key:"num0",id:d.NUM_0,cmd:d.NUM_0,label:"0",icon:"",size:"small"},{key:"numenter",id:d.NUM_ENTER,cmd:d.NUM_ENTER,label:"E",icon:"",size:"small",glyphFace:!0}],yV=[{key:"back",id:d.BACK,cmd:d.BACK,label:"",icon:"mdi:arrow-u-left-top"},{key:"home",id:d.HOME,cmd:d.HOME,label:"",icon:"mdi:home"},{key:"menu",id:d.MENU,cmd:d.MENU,label:"",icon:"mdi:menu"}],wV=[{key:"volup",id:d.VOL_UP,cmd:d.VOL_UP,label:"",icon:"mdi:volume-plus",extraClass:"mid-btn mid-btn-volup"},{key:"voldn",id:d.VOL_DOWN,cmd:d.VOL_DOWN,label:"",icon:"mdi:volume-minus",extraClass:"mid-btn mid-btn-voldn"},{key:"guide",id:d.GUIDE,cmd:d.GUIDE,label:"",icon:"mdi:television-guide",extraClass:"mid-btn mid-btn-guide"},{key:"mute",id:d.MUTE,cmd:d.MUTE,label:"",icon:"mdi:volume-mute",extraClass:"mid-btn mid-btn-mute"},{key:"chup",id:d.CH_UP,cmd:d.CH_UP,label:"",icon:"mdi:chevron-up",extraClass:"mid-btn mid-btn-chup"},{key:"chdn",id:d.CH_DOWN,cmd:d.CH_DOWN,label:"",icon:"mdi:chevron-down",extraClass:"mid-btn mid-btn-chdn"}],OV=[{key:"rew",id:d.REW,cmd:d.REW,label:"",icon:"mdi:rewind",extraClass:"area-rew"},{key:"play",id:d.PLAY,cmd:d.PLAY,label:"",icon:"mdi:play",extraClass:"area-play"},{key:"fwd",id:d.FWD,cmd:d.FWD,label:"",icon:"mdi:fast-forward",extraClass:"area-fwd"},{key:"dvr",id:d.DVR,cmd:d.DVR,label:"DVR",icon:"",extraClass:"area-dvr"},{key:"pause",id:d.PAUSE,cmd:d.PAUSE,label:"",icon:"mdi:pause",extraClass:"area-pause"},{key:"exit",id:d.EXIT,cmd:d.EXIT,label:"EXIT",icon:"",extraClass:"area-exit"}],kV=[{key:"red",id:d.RED,cmd:d.RED,label:"",icon:"",color:"#d32f2f"},{key:"green",id:d.GREEN,cmd:d.GREEN,label:"",icon:"",color:"#388e3c"},{key:"yellow",id:d.YELLOW,cmd:d.YELLOW,label:"",icon:"",color:"#fbc02d"},{key:"blue",id:d.BLUE,cmd:d.BLUE,label:"",icon:"",color:"#1976d2"}],_V=[{key:"a",id:d.A,cmd:d.A,label:"A",icon:"",size:"small"},{key:"b",id:d.B,cmd:d.B,label:"B",icon:"",size:"small"},{key:"c",id:d.C,cmd:d.C,label:"C",icon:"",size:"small"}];function q(C,V){let H=fV.has(V.id),e=C.buttonVisibility&&V.key in C.buttonVisibility?C.buttonVisibility[V.key]:!0;if(!(H?C.isX2&&e:e))return p;let r=!C.disableAll&&(C.editMode||C.isEnabled(V.id)),t=V.color?"key key--color":`key key--${V.size??"normal"} ${V.extraClass??""}`.trim(),o=z2(V);return h`
    <sbx-key-button
      class="${t}${r?"":" disabled"}"
      .label=${gV(V)}
      .icon=${V.icon||null}
      .accessibilityLabel=${o}
      .color=${V.color??null}
      .sizeVar=${V.color?null:"--sb-key-font-size"}
      .disabled=${!r}
      .holdRepeat=${C.holdRepeatForKey(V.key)}
      .longPress=${C.longPressForKey(V)}
      .onTrigger=${i=>C.onKeyPress(V,i)}
    ></sbx-key-button>
  `}function _0(C,V,H=null){let e=!!H?.available;if(!V)return e?h`
      <div class="dpad dpad--numpad-only" ${H?.hostRef?f(H.hostRef):p}>
        <div class="dpad-face dpad-face--numpad">
          ${k0.map(i=>q(C,i))}
        </div>
      </div>
    `:p;let L=e&&!!H?.open,r=["dpad",e?"dpad--numpad-ready":"",L?"dpad--numpad-open":""].filter(Boolean).join(" "),t=i=>{!L||i.key!=="Escape"||(i.preventDefault(),i.stopPropagation(),H?.onClose?.(!0))},o=i=>{if(!L)return;let M=i.relatedTarget;!M||i.currentTarget.contains(M)||H?.onClose?.(!1)};return h`
    <div
      class=${r}
      ${H?.hostRef?f(H.hostRef):p}
      @keydown=${e?t:null}
      @focusout=${e?o:null}
    >
      <div class="dpad-face dpad-face--keys" ?inert=${L}>
        ${bV.map(i=>q(C,i))}
      </div>
      ${e?h`
            <div class="dpad-face dpad-face--numpad" ?inert=${!L}>
              ${k0.map(i=>q(C,i))}
            </div>
            <button
              type="button"
              class="dpad-numpad-toggle"
              aria-label=${A().editor.numpad}
              ?inert=${L}
              @click=${()=>H.onOpen()}
            >
              <sbx-ha-icon icon="mdi:dialpad" aria-hidden="true"></sbx-ha-icon>
            </button>
          `:p}
    </div>
  `}function T0(C,V){return V?h`<div class="row3">${yV.map(H=>q(C,H))}</div>`:p}function R0(C,V){if(!V)return p;let H=y3({showVolume:C.showVolume,showChannel:C.showChannel,isX2:C.isX2}),e=["mid",...Object.entries(H.classMap).filter(([,L])=>L).map(([L])=>L)].join(" ");return h`<div class=${e}>${wV.map(L=>q(C,L))}</div>`}function P0(C,V){if(!V)return p;let H=w3({isX2:C.isX2,showMedia:C.showMedia,showDvr:C.showDvr}),e=["media",...Object.entries(H.classMap).filter(([,L])=>L).map(([L])=>L)].join(" ");return h`<div class=${e}>${OV.map(L=>q(C,L))}</div>`}function B0(C,V){return V?h`
    <div class="row3 shortcuts">
      ${C.slots.map(H=>{if(H.icon==null)return h`
            <div
              class="key key--normal ${C.editMode?"shortcut-ghost":"shortcut-spacer"}"
              aria-hidden="true"
            ></div>
          `;let e=!C.disableAll&&(C.editMode||!H.missing);return h`
          <sbx-key-button
            class="key key--normal shortcut-key${e?"":" disabled"}"
            .label=${""}
            .icon=${H.icon}
            .accessibilityLabel=${H.label}
            .sizeVar=${"--sb-key-font-size"}
            .disabled=${!e}
            .holdRepeat=${!1}
            .onTrigger=${()=>C.onPress(H)}
          ></sbx-key-button>
        `})}
    </div>
  `:p}function D0(C,V){return V?h`
    <div class="colors">
      <div class="colorsGrid">${kV.map(H=>q(C,H))}</div>
    </div>
  `:p}function F0(C,V){return V?h`
    <div class="abc">
      <div class="abcGrid">${_V.map(H=>q(C,H))}</div>
    </div>
  `:p}function TV(C){return C==="macros"?"macro":C==="favorites"?"favorite":"assigned"}function E0(C,V,H){return{label:C?.name||A().assist.unknown,commandId:Number(C?.command_id??C?.id),deviceId:Number(C?.device_id??C?.device??H),icon:C?.icon?String(C.icon):null,commandType:TV(V)}}function N0(C,V){let H=Number(C?.command_id),e=C?.device_id!=null?Number(C.device_id):null,L=e??Number(V);return{label:String(C?.name??"Favorite"),icon:C?.icon?String(C.icon):null,action:C?.action??null,commandId:H,deviceId:L}}function $0(C){return C?h`<div class="drawer-btn__device" title=${C}>${C}</div>`:p}function I0(C,V,H){let e=E0(V,H,C.currentActivityId),L=H==="favorites"&&C.favoriteDeviceName&&Number.isFinite(e.deviceId)?C.favoriteDeviceName(e.deviceId):"";return h`
    <sbx-ha-card
      class="drawer-btn${L?" drawer-btn--banded":""}"
      role="button"
      tabindex="0"
      ${C1(()=>{!Number.isFinite(e.commandId)||!Number.isFinite(e.deviceId)||C.onDrawerItem({model:e,itemType:H,rawItem:V})})}
    >
      ${$0(L)}
      <div class="drawer-btn__inner drawer-btn__inner--stack">
        ${e.icon?h`<sbx-ha-icon class="drawer-btn__icon" icon=${e.icon}></sbx-ha-icon>`:p}
        <div class="name">${e.label}</div>
      </div>
    </sbx-ha-card>
  `}function RV(C,V){let H=N0(V,C.currentActivityId),e=C.favoriteDeviceName&&!H.action&&V.device_id!=null?C.favoriteDeviceName(H.deviceId):"";return h`
    <sbx-ha-card
      class="drawer-btn drawer-btn--custom${e?" drawer-btn--banded":""}"
      role="button"
      tabindex="0"
      style="grid-column: 1 / -1;"
      ${C1(()=>C.onCustomFavorite({model:H,rawFavorite:V}))}
    >
      ${$0(e)}
      <div class="drawer-btn__inner drawer-btn__inner--row">
        ${H.icon?h`<sbx-ha-icon class="drawer-btn__icon" icon=${H.icon}></sbx-ha-icon>`:p}
        <div class="name">${H.label}</div>
      </div>
    </sbx-ha-card>
  `}function PV(C,V){let H=C.command_id??C.id??"",e=C.device_id??C.device??"",L=C.name??"",r=C.action?JSON.stringify(C.action):"";return`${V}:${String(e)}:${String(H)}:${String(L)}:${r}`}function U0(C){let V=new Map;return C.map(H=>{let e=PV(H.item,H.kind),L=V.get(e)??0;return V.set(e,L+1),{...H,key:`${e}#${L}`}})}function Q2(C,V,H){let e=U0(V.map(L=>({kind:H,item:L})));return h`${z(e,L=>L.key,L=>I0(C,L.item,H))}`}function j2(C){let V=U0([...C.customFavorites.map(H=>({kind:"custom",item:H})),...C.favorites.map(H=>({kind:"favorite",item:H}))]);return h`${z(V,H=>H.key,H=>H.kind==="custom"?RV(C,H.item):I0(C,H.item,"favorites"))}`}function q2(C,V,H,e,L,r){if(!H)return p;let t=["macroFavoritesButton",...e?["active-tab"]:[],...L?["disabled"]:[]].join(" ");return h`
    <sbx-key-button
      class=${t}
      .label=${V}
      .icon=${null}
      .trailingIcon=${BV()}
      .accessibilityLabel=${V}
      .sizeVar=${"--sb-tab-font-size"}
      .disabled=${L}
      .onTrigger=${r}
    ></sbx-key-button>
  `}function BV(){return Y1()==="rtl"?"mdi:chevron-left":"mdi:chevron-right"}function W0(C,V){let H="var(--sb-group-radius)";return[`border-top-left-radius: ${C&&V?"0":H}`,`border-top-right-radius: ${C&&V?"0":H}`,`border-bottom-left-radius: ${C&&!V?"0":H}`,`border-bottom-right-radius: ${C&&!V?"0":H}`,"transition: border-radius 0.2s ease"].join("; ")}function G0(C){let V=C.activeDrawer==="macros",H=C.activeDrawer==="favorites",e=V||H,L=r=>r?f(r):p;return h`
    <div
      class="mf-container${C.drawerUp?" drawer-up":""}"
      style=${C.visible?"":"display: none !important;"}
      ${L(C.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${W0(e,C.drawerUp)}
        ${L(C.rowRef)}
      >
        <div class="macroFavoritesGrid${C.single?" single":""}">
          ${q2(C,A().card.macrosTab,C.showMacrosButton,V,C.macrosDisabled,C.onToggleMacros)}
          ${q2(C,A().card.favoritesTab,C.showFavoritesButton,H,C.favoritesDisabled,C.onToggleFavorites)}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--macros${V?" open":""}"
        ${L(C.macrosOverlayRef)}
      >
        <div class="mf-grid">
          ${C.renderMacrosContent?Q2(C,C.macros,"macros"):p}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--favorites${H?" open":""}"
        ${L(C.favoritesOverlayRef)}
      >
        <div class="mf-grid">
          ${C.renderFavoritesContent?j2(C):p}
        </div>
      </div>
    </div>
  `}function a2(C){let V=C.kind==="commands"?"inline-drawer-row__grid mf-grid mf-grid--commands":"inline-drawer-row__grid mf-grid",H=C.filter?C.power?h`
          <div class="inline-filter-row">
            ${K2(C.filter)}
            ${X2(C.power)}
          </div>
        `:K2(C.filter):p;return h`
    <div
      class="inline-drawer-row inline-drawer-row--${C.kind}"
      style=${C.visible?"":"display: none !important;"}
    >
      ${H}
      <div
        class="inline-drawer-row__scroller"
        style="--inline-row-visible-rows: ${C.visibleRows};"
      >
        <div class=${V}>
          ${C.itemCount?C.items:h`
                <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                  ${C.emptyText}
                </div>
              `}
        </div>
      </div>
    </div>
  `}function X2(C){return h`
    <sbx-key-button
      class="sb-power-key${C.busy?" sb-power-key--busy":""}"
      .label=${null}
      .icon=${"mdi:power"}
      .accessibilityLabel=${C.label}
      .disabled=${C.disabled||C.busy}
      .onTrigger=${()=>C.onToggle()}
    ></sbx-key-button>
  `}function z0(C){return h`
    <div class="commands-row commands-row--power commands-row--power-only">
      <div class="commands-row__spacer"></div>
      ${X2(C)}
    </div>
  `}function K2(C){return h`
    <input
      class="sb-commands-filter"
      type="text"
      .value=${C.value}
      placeholder=${C.placeholder}
      aria-label=${C.placeholder}
      @input=${V=>{let H=V.target;C.onInput(String(H?.value??""))}}
      @keydown=${V=>V.stopPropagation()}
    />
  `}function DV(C,V){return h`
    <sbx-ha-card
      class="drawer-btn drawer-btn--command"
      role="button"
      tabindex="0"
      ${C1(()=>{Number.isFinite(V.command_id)&&C.onCommand(V)})}
    >
      <div class="drawer-btn__inner drawer-btn__inner--row">
        <div class="name">${V.name}</div>
      </div>
    </sbx-ha-card>
  `}function Y2(C){return h`${z(C.commands,V=>`${V.command_id}:${V.name}`,V=>DV(C,V))}`}function q0(C){let V=H=>H?f(H):p;return h`
    <div
      class="commands-row${C.power?" commands-row--power":""}"
      style=${C.visible?"":"display: none !important;"}
    >
    <div
      class="mf-container${C.drawerUp?" drawer-up":""}"
      ${V(C.containerRef)}
    >
      <div
        class="macroFavorites"
        style=${W0(C.open,C.drawerUp)}
        ${V(C.rowRef)}
      >
        <div class="macroFavoritesGrid single">
          ${q2(null,C.tabLabel,!0,C.open,C.disabled,C.onToggle)}
        </div>
      </div>
      <div
        class="mf-overlay mf-overlay--commands${C.open?" open":""}"
        ${V(C.overlayRef)}
      >
        ${C.renderContent?h`
              ${K2(C.filter)}
              <div class="mf-grid mf-grid--commands">
                ${C.commands.length?Y2(C):h`
                      <div class="inline-drawer-row__empty" style="grid-column: 1 / -1;">
                        ${C.emptyText}
                      </div>
                    `}
              </div>
            `:p}
      </div>
    </div>
    ${C.power?X2(C.power):p}
    </div>
  `}function K0(C){return h`
    <div
      class="automationAssist"
      style=${C.visible?"":"display: none !important;"}
    >
      <div class="automationAssist__header">
        <div class="automationAssist__label">${A().assist.label}</div>
      </div>
      <div class="automationAssist__status">${C.controller.statusText()}</div>
    </div>
  `}function Q0(C){let V=C.controller,H=V.modalViewState(),e=L=>{L.target===L.currentTarget&&V.closeMqttModal()};return h`
    <div
      class="sb-modal${H.open?" open":""}"
      role="dialog"
      aria-modal="true"
      @click=${e}
    >
      <div class="sb-modal__dialog">
        <div class="sb-modal__header">
          <div class="sb-modal__title">${A().assist.deviceDetectedTitle}</div>
          <button
            type="button"
            class="sb-modal__close"
            aria-label=${A().assist.close}
            @click=${()=>V.closeMqttModal()}
          >
            ✕
          </button>
        </div>
        <div class="sb-modal__body">
          <div class="sb-modal__text">${H.text}</div>
        </div>
        <div class="sb-modal__actions">
          <label
            class="sb-modal__optout"
            style=${H.showActivityRow?"":"display: none !important;"}
          >
            <input
              type="checkbox"
              .checked=${V.modalActivityChecked}
              @change=${L=>V.setModalActivityChecked(!!L.target.checked)}
            />
            <span>${A().assist.alsoActivityTriggers}</span>
          </label>
          <a
            class="sb-modal__link"
            href="https://github.com/m3tac0de/sofabaton-virtual-remote/blob/main/docs/automation_triggers.md"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${A().assist.seeDocs}
          </a>
          <button
            type="button"
            class="automationAssist__startBtn automationAssist__mqttBtn${H.createDisabled?" disabled":""}"
            .disabled=${H.createDisabled}
            style=${H.showCreate?"":"display: none !important;"}
            ${C1(()=>{V.createTriggers()})}
          >
            ${H.createLabel}
          </button>
          <label class="sb-modal__optout">
            <input
              type="checkbox"
              @change=${L=>{L.target.checked&&V.setModalOptOut(!0)}}
            />
            <span>${A().assist.dontShowAgain}</span>
          </label>
          <button
            type="button"
            class="automationAssist__startBtn"
            style=${H.showStart?"":"display: none !important;"}
            ${C1(()=>V.setActive(!0))}
          >
            ${A().assist.startCapturing}
          </button>
        </div>
      </div>
    </div>
  `}function FV(C){let V=C.trim().slice(1),H=V.length===3?V.split("").map(e=>e+e).join(""):V;return/^[0-9a-fA-F]{6}$/.test(H)?[0,2,4].map(e=>parseInt(H.slice(e,e+2),16)).join(","):null}var w1=class extends W{constructor(){super();this._haElementsReady=!1;this._editMode=!1;this._drawerUp=!1;this._numpadOpen=!1;this._numpadPageKey=null;this._drawerResetTimer=null;this._drawerContentResetTimer=null;this._closingDrawer=null;this._drawerMeasureSignature=null;this._drawerMeasurePending=!1;this._appliedThemeVars=[];this._appliedThemeKey=null;this._lastGroupRadius=null;this._appliedSizingKey=null;this._lastLayeringKey=null;this._lastLayeringTargets=[null,null];this._layoutSignatureCache=null;this._layoutOverlayEl=null;this._lastLayoutSignature=null;this._keymapLoading=!1;this._lastSelectedActivityValue=null;this._lastSelectedActivityAt=0;this._onOutsidePointerDown=null;this._onResize=null;this._onPreviewActivity=null;this._cardRef=k();this._wrapRef=k();this._layoutContainerRef=k();this._activityRowRef=k();this._loadIndicatorRef=k();this._mfContainerRef=k();this._dpadRef=k();this._macrosOverlayRef=k();this._favoritesOverlayRef=k();this._commandsOverlayRef=k();this._macroFavoritesRowRef=k();this._store=new t2(()=>this.requestUpdate(),{fireEvent:(H,e)=>this._fireEvent(H,e),onHubQueueDrained:()=>{this._assist.syncMqtt(),this.requestUpdate()},onCommandPulseChange:()=>this._syncLoadIndicator()}),this._assist=new o2({getHass:()=>this._store.hass,assistEnabled:()=>this._store.automationAssistEnabled(),entityId:()=>String(this._store.config?.entity??""),isEditMode:()=>this._editMode,isX2:()=>this._store.isX2(),isHubIntegration:()=>this._store.isHubIntegration(),hubMacAttribute:()=>this._store.remoteState()?.attributes?.hub_mac,hubQueueIdle:()=>this._store.hubQueueIdle(),requestHubBasicData:()=>this._store.hubRequestBasicData(),activities:()=>this._store.activities(),activityNameForId:H=>this._store.activityNameForId(H),currentActivityId:()=>this._store.currentActivityId(),currentActivityLabel:()=>this._store.currentActivityLabel(),resolveCommandDeviceId:(H,e)=>this._store.resolveCommandDeviceId(H,e),callService:(H,e,L)=>this._store.callService(H,e,L),onChange:()=>this.requestUpdate()}),v3().then(()=>{this._haElementsReady=!0,this.requestUpdate()})}setConfig(H){this._store.setConfig(H),this._assist.resetActivityBaseline(),this._drawerUp=!1,this._drawerResetTimer&&clearTimeout(this._drawerResetTimer),this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._closingDrawer=null,this._drawerMeasureSignature=null,this._drawerMeasurePending=!1}set hass(H){let e=H?.locale?.language??H?.language;this.setLanguage(e),this._store.setHass(H)}setLanguage(H){let e=h3(H);this.lang=Z3(),this.dir=Y1(),e&&this.requestUpdate()}setBackend(H){this._store.setBackend(H)}get hass(){return this._store.hass}set editMode(H){this._editMode=!!H,this._store.setEditMode(this._editMode),this._editMode&&this._assist.active&&this._assist.setActive(!1)}get editMode(){return this._editMode}getCardSize(){return 12}static getConfigElement(){return document.createElement(m0)}static getStubConfig(){return{entity:""}}connectedCallback(){super.connectedCallback(),this._store.connected(),this._installOutsideCloseHandler(),this._onResize||(this._onResize=()=>{this._store.activeDrawer&&(this._updateDrawerDirection(),this._syncLayering())}),window.addEventListener("resize",this._onResize,{passive:!0}),this._onPreviewActivity||(this._onPreviewActivity=H=>{let e=H?.detail||{},L=this._store.config?.entity;e.entity&&L&&e.entity!==L||(this._store.setPreviewActivity(e.previewActivity??""),this._editMode&&this.requestUpdate())}),window.addEventListener("sofabaton-preview-activity",this._onPreviewActivity)}disconnectedCallback(){super.disconnectedCallback(),this._removeOutsideCloseHandler(),this._onResize&&(window.removeEventListener("resize",this._onResize),this._onResize=null),this._onPreviewActivity&&window.removeEventListener("sofabaton-preview-activity",this._onPreviewActivity),this._drawerResetTimer&&clearTimeout(this._drawerResetTimer),this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._store.disconnected(),this._assist.disconnected()}_fireEvent(H,e={}){this.dispatchEvent(new CustomEvent(H,{detail:e,bubbles:!0,composed:!0}))}_installOutsideCloseHandler(){this._onOutsidePointerDown||(this._onOutsidePointerDown=H=>{let e=typeof H.composedPath=="function"?H.composedPath():[];if(this._store.activeDrawer){let L=this._macrosOverlayRef.value&&e.includes(this._macrosOverlayRef.value)||this._favoritesOverlayRef.value&&e.includes(this._favoritesOverlayRef.value)||this._commandsOverlayRef.value&&e.includes(this._commandsOverlayRef.value),r=this._macroFavoritesRowRef.value&&e.includes(this._macroFavoritesRowRef.value);L||r||this._setActiveDrawer(null)}if(this._numpadOpen){let L=this._dpadRef.value;L&&e.includes(L)||(this._numpadOpen=!1,this.requestUpdate())}this._store.activityMenuOpen&&(this._activityRowRef.value&&e.includes(this._activityRowRef.value)||(this._store.activityMenuOpen=!1,this._syncLayering()))},document.addEventListener("pointerdown",this._onOutsidePointerDown,!0))}_removeOutsideCloseHandler(){this._onOutsidePointerDown&&(document.removeEventListener("pointerdown",this._onOutsidePointerDown,!0),this._onOutsidePointerDown=null)}_toggleDrawer(H){this._setActiveDrawer(this._store.activeDrawer===H?null:H)}_retainClosingDrawer(H){this._closingDrawer=H,this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._drawerContentResetTimer=setTimeout(()=>{this._closingDrawer===H&&(this._closingDrawer=null,this._drawerContentResetTimer=null,this.requestUpdate())},B2)}_setActiveDrawer(H){let e=this._store.activeDrawer;e!==H&&(e&&this._retainClosingDrawer(e),H&&this._closingDrawer===H&&(this._closingDrawer=null,this._drawerContentResetTimer&&clearTimeout(this._drawerContentResetTimer),this._drawerContentResetTimer=null),this._store.activeDrawer=H,this._drawerMeasurePending=!!H,H||this._scheduleDrawerDirectionReset(),this._syncLayering(),this.requestUpdate())}_updateDrawerDirection(){if(!this._store.activeDrawer)return;let H=this._macroFavoritesRowRef.value,e=this._store.activeDrawer==="commands",L=e?this._commandsOverlayRef.value:this._store.activeDrawer==="favorites"?this._favoritesOverlayRef.value:this._macrosOverlayRef.value;if(!H||!L)return;let r=H.getBoundingClientRect(),t=this._cardRef.value&&typeof this._cardRef.value.getBoundingClientRect=="function"?this._cardRef.value.getBoundingClientRect():null,o=P3({desired:R3(L.scrollHeight||0,e?window.innerHeight:void 0),rowTop:r.top,rowBottom:r.bottom,cardTop:t?.top??null,cardBottom:t?.bottom??null,viewportHeight:window.innerHeight})==="up";e&&(L.style.maxHeight=`${B3({up:o,rowTop:r.top,rowBottom:r.bottom,cardTop:t?.top??null,cardBottom:t?.bottom??null,viewportHeight:window.innerHeight})}px`),o!==this._drawerUp&&(this._drawerUp=o,this.requestUpdate())}_scheduleDrawerDirectionReset(){this._drawerResetTimer&&clearTimeout(this._drawerResetTimer),this._drawerResetTimer=setTimeout(()=>{this._store.activeDrawer||this._drawerUp&&(this._drawerUp=!1,this.requestUpdate())},B2)}_syncLayering(){let H=this._activityRowRef.value,e=this._mfContainerRef.value;if(!H||!e)return;e=e.closest(".commands-row")??e;let L=`${this._store.activityMenuOpen?1:0}:${this._store.activeDrawer||""}`,r=[H,e];if(this._lastLayeringKey===L&&this._lastLayeringTargets[0]===r[0]&&this._lastLayeringTargets[1]===r[1])return;let t=D3(!!this._store.activityMenuOpen,!!this._store.activeDrawer);H.style.zIndex=t.activity,e.style.zIndex=t.drawer,this._lastLayeringKey=L,this._lastLayeringTargets=r}_handleActivitySelect(H){if(this._editMode)return;let e=H.target,L=H?.detail?.value??e?.value;if(L==null)return;let r=Date.now();String(L)===this._lastSelectedActivityValue&&r-this._lastSelectedActivityAt<250||(this._lastSelectedActivityValue=String(L),this._lastSelectedActivityAt=r,this._fireEvent("haptic","light"),this._control(this._store.setActivity(L)))}_control(H){H.catch(()=>this._store.controlFailed())}_handleSelect(H){this._store.mode()==="device"&&this._store.deviceModeAvailable()?this._handleDeviceSelect(H):this._handleActivitySelect(H)}_handleDeviceSelect(H){if(this._editMode)return;let e=H.target,L=H?.detail?.value??e?.value;if(L==null)return;let r=Date.now();if(String(L)===this._lastSelectedActivityValue&&r-this._lastSelectedActivityAt<250)return;this._lastSelectedActivityValue=String(L),this._lastSelectedActivityAt=r,this._fireEvent("haptic","light");let t=String(L)===""?null:Number(L);this._store.setDevice(Number.isFinite(t)?t:null)}_openNumpad(){this._numpadOpen||(this._numpadOpen=!0,this._fireEvent("haptic","light"),this.requestUpdate(),this.updateComplete.then(()=>this._focusDpadControl(".dpad-face--numpad .key")))}_closeNumpad(H){this._numpadOpen&&(this._numpadOpen=!1,this.requestUpdate(),H&&this.updateComplete.then(()=>this._focusDpadControl(".dpad-numpad-toggle")))}_focusDpadControl(H){let e=this._dpadRef.value?.querySelector(H);(e?.shadowRoot?.querySelector(".sb-key-control")??e)?.focus()}_handleModeToggle(){this._editMode||(this._fireEvent("haptic","light"),this._setActiveDrawer(null),this._numpadOpen=!1,this._store.toggleMode())}_syncLoadIndicator(){this._loadIndicatorRef.value?.classList.toggle("is-loading",this._store.isLoadingActive()||this._keymapLoading)}_applyLocalTheme(H){let e=this._cardRef.value,L=this._store.hass;if(!e)return!1;let r=b3(this._store.config?.background_override),t=H?L?.themes?.themes?.[H]:null,o=L?.themes?.darkMode?"dark":"light",i=`${H||""}||${r}||${o}||${JSON.stringify(t??null)}`;if(this._appliedThemeKey===i)return!1;for(let s of this._appliedThemeVars)e.style.removeProperty(s);this._appliedThemeVars=[],this._appliedThemeKey=i,this._lastGroupRadius=null;let M=null;if(H){let s=t;if(s&&typeof s=="object"){M=s;let m=s;if(m.modes&&typeof m.modes=="object"){let u=L?.themes?.darkMode?"dark":"light";M={...s,...m.modes?.[u]||{}},delete M.modes}for(let[u,v]of Object.entries(M)){if(v==null||typeof v!="string"&&typeof v!="number")continue;let Z=u.startsWith("--")?u:`--${u}`;e.style.setProperty(Z,String(v)),this._appliedThemeVars.push(Z)}for(let[u,v]of Object.entries(M)){if(typeof v!="string"||!v.startsWith("#"))continue;let Z=u.startsWith("--")?u.slice(2):u;if(M[`rgb-${Z}`]!==void 0||M[`--rgb-${Z}`]!==void 0)continue;let S=FV(v);if(!S)continue;let g=`--rgb-${Z}`;e.style.setProperty(g,S),this._appliedThemeVars.push(g)}}}let n=M?.["ha-card-background"]??M?.["card-background-color"]??M?.["ha-card-background-color"]??M?.["primary-background-color"]??null,a=r||n,l=this._store.config?.background_override;if(r&&Array.isArray(l)&&l.length===3){let[s,m,u]=l.map(S=>Number(S)/255),v=S=>S<=.03928?S/12.92:((S+.055)/1.055)**2.4,Z=.2126*v(s)+.7152*v(m)+.0722*v(u);e.style.setProperty("--sb-overlay-base",Z<.4?"#ffffff":"#000000"),this._appliedThemeVars.push("--sb-overlay-base")}return a?(e.style.setProperty("--ha-card-background",String(a)),e.style.setProperty("--card-background-color",String(a)),e.style.setProperty("--ha-card-background-color",String(a)),e.style.setProperty("background",String(a)),e.style.setProperty("background-color",String(a)),this._appliedThemeVars.push("--ha-card-background","--card-background-color","--ha-card-background-color","background","background-color")):(e.style.removeProperty("background"),e.style.removeProperty("background-color")),!0}_updateGroupRadius(){let H=this._cardRef.value;if(!H)return;let e=getComputedStyle(H),L=["--ha-card-border-radius","--ha-control-border-radius","--mdc-shape-medium","--mdc-shape-small","--mdc-shape-large"],r="";for(let t of L){let o=(e.getPropertyValue(t)||"").trim();if(o){r=o;break}}r||(r="18px"),this._lastGroupRadius!==r&&(this._lastGroupRadius=r,H.style.setProperty("--sb-group-radius",r),this._appliedThemeVars.includes("--sb-group-radius")||this._appliedThemeVars.push("--sb-group-radius"))}_applyHostSizing(){let H=this._store.config?.max_width,e=this._store.config?.shrink,L=`${typeof H}:${String(H??"")}||${typeof e}:${String(e??"")}`;if(this._appliedSizingKey===L)return;this._appliedSizingKey=L,H==null||H===""||H===0?this.style.removeProperty("--remote-max-width"):typeof H=="number"&&Number.isFinite(H)&&H>0?this.style.setProperty("--remote-max-width",`${H}px`):typeof H=="string"&&H.trim()&&this.style.setProperty("--remote-max-width",H.trim());let r=typeof e=="number"?e:typeof e=="string"?Number(e):0;if(!Number.isFinite(r)||r<=0)this.style.removeProperty("--remote-zoom");else{let t=Math.max(.1,Math.min(1,1-r/100));this.style.setProperty("--remote-zoom",String(t))}}_prefersReducedMotion(){return typeof window<"u"&&typeof window.matchMedia=="function"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches}_clearLayoutOverlay(){this._layoutOverlayEl&&(this._layoutOverlayEl.remove(),this._layoutOverlayEl=null)}_maybeAnimateLayoutChange(H){let e=this._layoutContainerRef.value,L=this._wrapRef.value;if(!e||!L)return;if(this._layoutSignatureCache==null){this._layoutSignatureCache=H;return}if(this._layoutSignatureCache===H)return;if(this._layoutSignatureCache=H,this._store.backend?.kind==="server"||this._prefersReducedMotion()){this._clearLayoutOverlay();return}let r=L.getBoundingClientRect(),t=e.getBoundingClientRect();if(!r.width||!t.width)return;this._clearLayoutOverlay();let o=document.createElement("div");o.className="layout-overlay",o.setAttribute("aria-hidden","true"),o.style.top=`${t.top-r.top}px`,o.style.left=`${t.left-r.left}px`,o.style.width=`${t.width}px`,o.style.height=`${t.height}px`,o.appendChild(e.cloneNode(!0)),L.appendChild(o),this._layoutOverlayEl=o;let i=()=>{this._layoutOverlayEl===o&&(o.remove(),this._layoutOverlayEl=null)};o.addEventListener("transitionend",M=>{M.target===o&&i()},{once:!0}),requestAnimationFrame(()=>{o.classList.add("layout-overlay--fade")}),setTimeout(i,320)}render(){if(!this._haElementsReady||!this._store.config||!this._store.backend)return p;let H=this._store,e=H.deriveRuntimeState(),L=e.layoutConfig;this._lastLayoutSignature=e.layoutSignature;let r=e.mode==="device";this._keymapLoading=!!e.keymapLoading,this._assist.observeActivityState({currentLabel:r?this._store.currentActivityLabel():e.currentLabel,activityId:e.activityId!=null?Number(e.activityId):null,unavailable:e.isUnavailable}),!H.automationAssistEnabled()&&this._assist.active&&this._assist.setActive(!1),this._assist.syncMqtt();let t=i3(L),o=!r&&K1(L),i=!r&&Q1(L),M=t&&o,n=t&&i,a=!t&&o,l=!t&&i,s=r&&e.showCommandsButton,m=s&&!t,u=s&&t,v=r?e.isUnavailable||!this._editMode&&e.deviceId==null:e.isUnavailable||H.activityLoadingActive()||e.loadPending||!this._editMode&&e.isPoweredOff;(r&&(H.activeDrawer==="macros"||H.activeDrawer==="favorites")||!r&&H.activeDrawer==="commands")&&(this._retainClosingDrawer(H.activeDrawer),this._scheduleDrawerDirectionReset(),H.activeDrawer=null);let Z=null;r?H.activeDrawer==="commands"&&!m&&(this._retainClosingDrawer("commands"),this._scheduleDrawerDirectionReset(),H.activeDrawer=null):(Z=_3({activeDrawer:H.activeDrawer,showMacrosButton:a,showFavoritesButton:l,editMode:this._editMode,macros:e.macros,favorites:e.favorites,customFavorites:e.customFavorites,disableAllButtons:v}),Z.closedByVisibility&&(H.activeDrawer&&this._retainClosingDrawer(H.activeDrawer),this._scheduleDrawerDirectionReset()),H.activeDrawer=Z.nextActiveDrawer);let S=H.activeDrawer==="macros"?e.macros.length:H.activeDrawer==="favorites"?e.favorites.length+e.customFavorites.length:H.activeDrawer==="commands"?e.commands.length:0,g=`${H.activeDrawer||""}:${S}:${e.commandFilter}:${e.layoutSignature}`;this._drawerMeasureSignature!==g&&(this._drawerMeasureSignature=g,this._drawerMeasurePending=!!H.activeDrawer);let D=e.isX2&&A3(L)&&(this._editMode||H.anyKeyBound(j1)),w=`${e.mode}:${r?e.deviceId??"":e.activityId??""}`;(!D||w!==this._numpadPageKey)&&(this._numpadOpen=!1),this._numpadPageKey=w;let y={isX2:e.isX2,buttonVisibility:O3({isX2:e.isX2,showVolume:e.showVolume,showChannel:e.showChannel,showMedia:e.showMedia,showDvr:e.showDvr}),disableAll:v,editMode:this._editMode,isEnabled:x=>H.isEnabled(x),onKeyPress:(x,T)=>this._onKeyPress(x,T),holdRepeatForKey:x=>P2(H.config,x),longPressForKey:x=>this._longPressForSpec(x),showVolume:e.showVolume,showChannel:e.showChannel,showMedia:e.showMedia,showDvr:e.showDvr},I={value:e.commandFilter,placeholder:A().card.filterCommands,onInput:x=>H.setCommandFilter(x)},F={visible:!!Z?.showMF,showMacrosButton:a,showFavoritesButton:l,single:Z?.visibleCount===1,macrosDisabled:!!Z?.macrosDisabled,favoritesDisabled:!!Z?.favoritesDisabled,activeDrawer:H.activeDrawer==="commands"?null:H.activeDrawer,drawerUp:this._drawerUp,macros:e.macros,favorites:e.favorites,customFavorites:e.customFavorites,currentActivityId:H.currentActivityId(),favoriteDeviceName:t3(L)?x=>H.deviceNameForId(x)??"":null,renderMacrosContent:H.activeDrawer==="macros"||this._closingDrawer==="macros",renderFavoritesContent:H.activeDrawer==="favorites"||this._closingDrawer==="favorites",containerRef:this._mfContainerRef,rowRef:this._macroFavoritesRowRef,macrosOverlayRef:this._macrosOverlayRef,favoritesOverlayRef:this._favoritesOverlayRef,onToggleMacros:()=>this._toggleDrawer("macros"),onToggleFavorites:()=>this._toggleDrawer("favorites"),onDrawerItem:({model:x,itemType:T,rawItem:k1})=>{this._assist.recordClick({label:x.label,commandId:x.commandId,deviceId:x.deviceId,commandType:x.commandType,icon:x.icon}),H.triggerCommandPulse(),this._control(H.sendDrawerItem(T,x.commandId,x.deviceId,k1))},onCustomFavorite:({model:x,rawFavorite:T})=>{if(this._assist.active&&this._assist.setStatus(A().assist.notCaptured),x.action){H.runLovelaceAction(x.action,T);return}!Number.isFinite(x.commandId)||!Number.isFinite(x.deviceId)||(H.triggerCommandPulse(),this._control(H.sendCustomFavoriteCommand(x.commandId,x.deviceId)))}},a1=r&&V3(L)&&(this._editMode||H.devicePowerConfigured()),n1={busy:H.powerBusy,disabled:v,label:A().card.powerButton,onToggle:()=>{this._control(H.toggleDevicePower())}},s2=r?r3(H.config,e.deviceId):{},O1=O2.map(x=>{let T=s2[x];if(!T)return{slot:x,icon:null,label:"",commandId:null,missing:!1};let k1=e.keymapEntry?.status==="ready"?e.keymapEntry.commands:null,l5=k1?.find(bH=>bH.command_id===T.command_id);return{slot:x,icon:T.icon,label:l5?.name??A().assist.commandFallback(T.command_id),commandId:T.command_id,missing:k1!=null&&!l5}}),l2=O1.some(x=>x.icon!=null),m2=r&&L3(L)&&(l2||this._editMode),p2={visible:m,open:H.activeDrawer==="commands",disabled:v,drawerUp:this._drawerUp,commands:e.commands,renderContent:H.activeDrawer==="commands"||this._closingDrawer==="commands",emptyText:A().card.noCommands,tabLabel:A().card.commandsTab,filter:I,onToggle:()=>this._toggleDrawer("commands"),onCommand:x=>this._onCommandItem(x),containerRef:this._mfContainerRef,rowRef:this._macroFavoritesRowRef,overlayRef:this._commandsOverlayRef},d1=o3(L),O=e.showVolume||e.showChannel,V1=e.isX2?e.showMedia||e.showDvr:e.showMedia,SH=f1(L.group_order),a5=j5(H.config),gH=X5(H.config),fH=["wrap",...a5==="flat"?[]:[`wrap--keys-${a5}`],...gH?["wrap--panels"]:[]].join(" "),n5={activity:()=>L.show_activity?w0({hass:H.hass,visible:!0,unavailable:e.isUnavailable,options:r?e.deviceSelectState?.options??[]:e.selectState?.options??[],selectLabel:r?A().card.deviceSelectLabel:A().card.activitySelectLabel,resolvedValue:r?e.deviceSelectState?.resolvedValue??"":e.selectState?.resolvedValue??"",disabled:r?!!e.deviceSelectState?.disabled:!!e.selectState?.disabled,loading:H.isLoadingActive()||!!e.keymapLoading,modeToggle:e.deviceModeAvailable?{icon:r?"mdi:audio-video":"mdi:play-circle-outline",ariaLabel:r?A().card.switchToActivityMode:A().card.switchToDeviceMode,onToggle:()=>this._handleModeToggle()}:null,menuOpen:!!H.activityMenuOpen,onSelect:x=>this._handleSelect(x),onMenuOpened:()=>{H.activityMenuOpen=!0,this._syncLayering(),this.requestUpdate()},onMenuClosed:()=>{H.activityMenuOpen=!1,this._syncLayering(),this.requestUpdate()},rowRef:this._activityRowRef,loadIndicatorRef:this._loadIndicatorRef}):p,macro_favorites:()=>r?m?q0({...p2,power:a1?n1:null}):a1&&!u?z0(n1):p:Z?.showMF?G0(F):p,macros_row:()=>r?u?a2({kind:"commands",visible:!0,visibleRows:d1,items:Y2({commands:e.commands,onCommand:x=>this._onCommandItem(x)}),itemCount:e.commands.length,emptyText:A().card.noCommands,filter:I,power:a1?n1:null}):p:M?a2({kind:"macros",visible:!0,visibleRows:d1,items:Q2(F,e.macros,"macros"),itemCount:e.macros.length,emptyText:A().card.noMacros}):p,favorites_row:()=>!r&&n?a2({kind:"favorites",visible:!0,visibleRows:d1,items:j2(F),itemCount:e.customFavorites.length+e.favorites.length,emptyText:A().card.noFavorites}):p,dpad:()=>_0(y,!!L.show_dpad,{available:D,open:this._numpadOpen,hostRef:this._dpadRef,onOpen:()=>this._openNumpad(),onClose:x=>this._closeNumpad(x)}),nav:()=>T0(y,!!L.show_nav),mid:()=>R0(y,O),media:()=>P0(y,V1),colors:()=>D0(y,!!L.show_colors),abc:()=>F0(y,!!L.show_abc&&e.isX2),shortcuts:()=>B0({editMode:this._editMode,disableAll:v,slots:O1,onPress:x=>this._onShortcutPress(x)},m2)},d5=e.isUnavailable?A().card.remoteUnavailable:e.noActivitiesMessage,A5=r&&!e.isUnavailable&&e.keymapEntry?.status==="error"?"error":"warning",s5=H.automationAssistEnabled();return h`
      <sbx-ha-card ${f(this._cardRef)}>
        ${s5?Q0({visible:!0,controller:this._assist}):p}
        <div class=${fH} ${f(this._wrapRef)}>
          ${s5?K0({visible:!0,controller:this._assist}):p}
          <div class="layout-container" ${f(this._layoutContainerRef)}>
            ${d5?h`<div
                  class="sb-notice sb-notice--${A5}"
                  role="status"
                  aria-live="polite"
                >
                  <sbx-ha-icon
                    icon=${A5==="error"?"mdi:alert-circle-outline":"mdi:alert-outline"}
                  ></sbx-ha-icon>
                  <span class="sb-notice__text">${d5}</span>
                </div>`:p}
            ${z(SH.filter(x=>x in n5),x=>x,x=>n5[x]())}
          </div>
        </div>
      </sbx-ha-card>
    `}_longPressForSpec(H){if(this._editMode)return!1;let e=this._store;if(P2(e.config,H.key))return!1;let L=e.mode()==="device"?e.currentDeviceId():e.commandTarget(H.id)?.activity_id??e.currentActivityId();return e.longPressAvailableForButton(H.id,L)}_onKeyPress(H,e){let L=this._store.mode()==="device",r=L?this._store.currentDeviceId():this._store.commandTarget(H.id)?.activity_id??this._store.currentActivityId();if(E3(e)){this._assist.active&&this._assist.setStatus(A().assist.notCaptured),this._store.triggerCommandPulse(),this._control(this._store.sendLongPress(H.cmd,r));return}F3(e)<=1&&this._assist.recordClick({label:z2(H),commandId:H.cmd,deviceId:r??null,commandType:"assigned",icon:H.color?null:H.icon||null,deviceMode:L,deviceName:L?this._store.deviceNameForId(r):null}),this._store.triggerCommandPulse(),this._control(this._store.sendCommand(H.cmd,r))}_onShortcutPress(H){if(H.commandId==null)return;let e=this._store.currentDeviceId();e!=null&&(this._assist.recordClick({label:H.label,commandId:H.commandId,deviceId:e,commandType:"favorite",icon:H.icon,deviceMode:!0,deviceName:this._store.deviceNameForId(e)}),this._store.triggerCommandPulse(),this._control(this._store.sendCommand(H.commandId,e)))}_onCommandItem(H){let e=this._store.currentDeviceId();e!=null&&(this._assist.recordClick({label:H.name,commandId:H.command_id,deviceId:e,commandType:"favorite",icon:null,deviceMode:!0,deviceName:this._store.deviceNameForId(e)}),this._store.triggerCommandPulse(),this._control(this._store.sendCommand(H.command_id,e)))}updated(H){(this._applyLocalTheme(String(this._store.config?.theme??""))||this._lastGroupRadius==null)&&this._updateGroupRadius(),this._applyHostSizing(),this._lastLayoutSignature!=null&&this._maybeAnimateLayoutChange(this._lastLayoutSignature),this._drawerMeasurePending&&(this._drawerMeasurePending=!1,this._updateDrawerDirection()),this._syncLayering(),this._syncLoadIndicator()}};w1.styles=[P1(g3),c2`
      sbx-key-button {
        display: block;
      }
    `];var n2={light:{"--primary-color":"#009ac7","--rgb-primary-color":"0, 154, 199","--primary-text-color":"#141414","--rgb-primary-text-color":"33, 33, 33","--secondary-text-color":"#5e5e5e","--disabled-text-color":"#bdbdbd","--primary-background-color":"#fafafa","--secondary-background-color":"#e5e5e5","--card-background-color":"#ffffff","--divider-color":"rgba(0, 0, 0, 0.12)","--error-color":"#db4437","--rgb-error-color":"219, 68, 55","--warning-color":"#ffa600","--success-color":"#43a047","--info-color":"#039be5","--state-icon-color":"#44739e","--input-fill-color":"rgb(245, 245, 245)","--ha-color-form-background":"#f3f3f3","--ha-color-fill-neutral-normal-resting":"#e6e6e6","--ha-color-fill-neutral-quiet-hover":"#e6e6e6","--ha-color-fill-primary-quiet-hover":"#dff3fc","--ha-color-border-neutral-loud":"#5e5e5e","--ha-color-border-neutral-quiet":"#e6e6e6","--ha-color-fill-primary-quiet-resting":"#eff9fe","--mdc-theme-primary":"#009ac7","--mdc-theme-surface":"#ffffff","--mdc-select-label-ink-color":"rgba(0, 0, 0, 0.6)","--wa-color-neutral-fill-normal":"#e6e6e6"},dark:{"--primary-color":"#009ac7","--rgb-primary-color":"0, 154, 199","--primary-text-color":"#e1e1e1","--rgb-primary-text-color":"33, 33, 33","--secondary-text-color":"#9b9b9b","--disabled-text-color":"#6f6f6f","--primary-background-color":"#111111","--secondary-background-color":"#282828","--card-background-color":"#1c1c1c","--divider-color":"rgba(225, 225, 225, 0.12)","--error-color":"#db4437","--rgb-error-color":"219, 68, 55","--warning-color":"#ffa600","--success-color":"#43a047","--info-color":"#039be5","--state-icon-color":"#44739e","--input-fill-color":"rgba(255, 255, 255, 0.05)","--ha-color-form-background":"#363636","--ha-color-fill-neutral-normal-resting":"#202020","--ha-color-fill-neutral-quiet-hover":"#202020","--ha-color-fill-primary-quiet-hover":"#002e3e","--ha-color-border-neutral-loud":"#b1b1b1","--ha-color-border-neutral-quiet":"#5e5e5e","--ha-color-fill-primary-quiet-resting":"#001721","--mdc-theme-primary":"#009ac7","--mdc-theme-surface":"#1c1c1c","--mdc-select-label-ink-color":"rgba(255, 255, 255, 0.6)","--wa-color-neutral-fill-normal":"#202020"}};var EV=Object.keys(n2.light),NV={"--rgb-primary-color":"--primary-color","--rgb-primary-text-color":"--primary-text-color","--rgb-error-color":"--error-color"};function J2(C){let V=String(C??"").trim().toLowerCase();if(!V)return null;let H=V.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);if(H)return d2(Number(H[1]),Number(H[2]),Number(H[3]),H[4]==null?1:Number(H[4]));if(H=V.match(/^rgba?\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/),H)return d2(Number(H[1]),Number(H[2]),Number(H[3]),j0(H[4]));if(H=V.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+%?)\s*)?\)$/),H)return d2(Number(H[1])*255,Number(H[2])*255,Number(H[3])*255,j0(H[4]));if(H=V.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/),H){let e=H[1];e.length<=4&&(e=e.split("").map(r=>r+r).join(""));let L=r=>parseInt(e.slice(r,r+2),16);return d2(L(0),L(2),L(4),e.length===8?L(6)/255:1)}return null}function j0(C){return C==null?1:C.endsWith("%")?Number(C.slice(0,-1))/100:Number(C)}function d2(C,V,H,e){return![C,V,H,e].every(Number.isFinite)||e<=0?null:{r:C,g:V,b:H,a:e}}function X0({r:C,g:V,b:H}){let e=L=>{let r=Math.min(255,Math.max(0,L))/255;return r<=.03928?r/12.92:((r+.055)/1.055)**2.4};return .2126*e(C)+.7152*e(V)+.0722*e(H)}function $V({r:C,g:V,b:H}){return[C,V,H].map(e=>Math.round(e)).join(", ")}function Y0(C){let V=String(C??"").trim().toLowerCase();return V==="light"||V==="dark"?V:"inherit"}function IV(C){let V=C.hostValue("--primary-text-color"),H=V?C.resolveColor(V):null;if(H)return X0(H)>.5?"dark":"light";let e=C.hostValue("--card-background-color")||C.hostValue("--primary-background-color"),L=e?C.resolveColor(e):null;return L?X0(L)<.5?"dark":"light":C.prefersDark?"dark":"light"}function J0(C){let V=!C.hostColorScheme||C.hostColorScheme.trim()==="normal";if(C.theme!=="inherit")return{mode:C.theme,values:{...n2[C.theme]},colorScheme:C.theme};let H=IV(C),e=n2[H],L={};for(let r of EV){if(C.hostValue(r))continue;let t=NV[r];if(t){let o=C.hostValue(t);if(o){let i=C.resolveColor(o);L[r]=i?$V(i):e[r];continue}}L[r]=e[r]}return{mode:H,values:L,colorScheme:V?H:null}}var UV=new Set(["type","entity","theme","show_automation_assist","preview_activity"]),WV=new Set(["action","tap_action","hold_action","double_tap_action"]);function C5(C){return!!C&&typeof C=="object"&&!Array.isArray(C)}function GV(C){let V={};if(!C5(C))return V;for(let[H,e]of Object.entries(C))if(!(UV.has(H)||e===void 0)){if(H==="custom_favorites"&&Array.isArray(e)){let L=e.filter(r=>C5(r)&&r.command_id!=null&&r.device_id!=null).map(r=>{let t={};for(let[o,i]of Object.entries(r))WV.has(o)||(t[o]=i);return t});L.length&&(V.custom_favorites=L);continue}V[H]=e}return V}function H5(C){let V=String(C??"").trim(),H=V.replace(/[:\-\s.]/g,"");return/^[0-9a-fA-F]{12}$/.test(H)?H.toLowerCase():V}function C7(C,V="/ui/remote/"){let H=new URL(C),e=H.pathname.indexOf(V),L=e>=0?H.pathname.slice(0,e):"";return`${H.origin}${L}`.replace(/\/+$/,"")}function H7(C,V,H={}){let L={...GV(V),entity:C};if(H.openDevice!=null){let r=C5(L.device_mode)?{...L.device_mode}:{};r.open_device=H.openDevice,L.device_mode=r}return L}var zV="0.2.2";function V7(C,V){let H=String(C??"").trim();if(!H)return null;let e;try{e=V?new URL(H,V):new URL(H)}catch{return null}if(e.protocol!=="http:"&&e.protocol!=="https:")return null;let L=e.pathname.replace(/\/+$/,"");return L.endsWith(R)&&(L=L.slice(0,-R.length)),`${e.origin}${L}`.replace(/\/+$/,"")}function qV(C){return C instanceof Error?C.message:String(C)}function e7(C,V){return C!=="https:"||!/^http:/i.test(V)?null:{code:"mixed_content",message:`This page is https but the server at ${V} is http, which browsers block. Serve the server over TLS (a reverse proxy or --tls-cert) and use its https address.`}}async function KV(C,V,H,e={}){try{await V(`${C}${R}/server`,{mode:"no-cors",cache:"no-store"})}catch{return{code:"server_unreachable",message:`The server at ${C} did not answer (${qV(H)}).`}}let L=e.pageOrigin?` ${e.pageOrigin}`:"";return{code:"cross_origin_refused",message:`The server at ${C} refused this page: add this page's origin${L} to the server's allowed_origins setting (control panel, Server settings).`}}async function L7(C,V,H,e={}){let L=H5(V),r=`${C}${R}`,t=[];try{let i=await H(`${r}/hubs`,{headers:{accept:"application/json"}});if(!i.ok)return{hub:null,hubs:t,error:{code:"server_unreachable",message:`The server at ${C} answered GET ${R}/hubs with ${i.status}.`}};let M=await i.json();t=Array.isArray(M)?M:[]}catch(i){return{hub:null,hubs:t,error:await KV(C,H,i,e)}}if(!L)return{hub:null,hubs:t,error:{code:"hub_missing",message:"No hub id given: set hub to the hub's MAC (any spelling)."}};let o=t.find(i=>H5(i.hub_id)===L)??null;return o?{hub:o,hubs:t,error:null}:{hub:null,hubs:t,error:{code:"hub_not_found",message:`No hub with id ${L} is registered on this server.`}}}async function r7(C,V,H){try{let e=await H(`${C}${R}/hubs/${encodeURIComponent(V)}/ui/remote-card`,{headers:{accept:"application/json"}});if(!e.ok)return null;let L=await e.json();return L&&typeof L=="object"?L.document??null:null}catch{return null}}function t7(C,V,H=!1){return(!C||C.state==="unavailable")&&V?A().card.serverReadFailed:H?A().card.controlRefused:null}var V5=class extends HTMLElement{constructor(){super();let V=this.attachShadow({mode:"open"});V.innerHTML=`
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
    `}};function i7(){customElements.get("sbx-ha-card")||customElements.define("sbx-ha-card",V5)}var o7="M12,4A4,4 0 0,1 16,8A4,4 0 0,1 12,12A4,4 0 0,1 8,8A4,4 0 0,1 12,4M12,14C16.42,14 20,15.79 20,18V20H4V18C4,15.79 7.58,14 12,14Z";var M7="M12,5.5A3.5,3.5 0 0,1 15.5,9A3.5,3.5 0 0,1 12,12.5A3.5,3.5 0 0,1 8.5,9A3.5,3.5 0 0,1 12,5.5M5,8C5.56,8 6.08,8.15 6.53,8.42C6.38,9.85 6.8,11.27 7.66,12.38C7.16,13.34 6.16,14 5,14A3,3 0 0,1 2,11A3,3 0 0,1 5,8M19,8A3,3 0 0,1 22,11A3,3 0 0,1 19,14C17.84,14 16.84,13.34 16.34,12.38C17.2,11.27 17.62,9.85 17.47,8.42C17.92,8.15 18.44,8 19,8M5.5,18.25C5.5,16.18 8.41,14.5 12,14.5C15.59,14.5 18.5,16.18 18.5,18.25V20H5.5V18.25M0,20V18.5C0,17.11 1.89,15.94 4.45,15.6C3.86,16.28 3.5,17.22 3.5,18.25V20H0M24,20H20.5V18.25C20.5,17.22 20.14,16.28 19.55,15.6C22.11,15.94 24,17.11 24,18.5V20Z";var a7="M6.59,0.66C8.93,-1.15 11.47,1.06 12.04,4.5C12.47,4.5 12.89,4.62 13.27,4.84C13.79,4.24 14.25,3.42 14.07,2.5C13.65,0.35 16.06,-1.39 18.35,1.58C20.16,3.92 17.95,6.46 14.5,7.03C14.5,7.46 14.39,7.89 14.16,8.27C14.76,8.78 15.58,9.24 16.5,9.06C18.63,8.64 20.38,11.04 17.41,13.34C15.07,15.15 12.53,12.94 11.96,9.5C11.53,9.5 11.11,9.37 10.74,9.15C10.22,9.75 9.75,10.58 9.93,11.5C10.35,13.64 7.94,15.39 5.65,12.42C3.83,10.07 6.05,7.53 9.5,6.97C9.5,6.54 9.63,6.12 9.85,5.74C9.25,5.23 8.43,4.76 7.5,4.94C5.37,5.36 3.62,2.96 6.59,0.66M5,16H7A2,2 0 0,1 9,18V24H7V22H5V24H3V18A2,2 0 0,1 5,16M5,18V20H7V18H5M12.93,16H15L12.07,24H10L12.93,16M18,16H21V18H18V22H21V24H18A2,2 0 0,1 16,22V18A2,2 0 0,1 18,16Z";var n7="M6,6.9L3.87,4.78L5.28,3.37L7.4,5.5L6,6.9M13,1V4H11V1H13M20.13,4.78L18,6.9L16.6,5.5L18.72,3.37L20.13,4.78M4.5,10.5V12.5H1.5V10.5H4.5M19.5,10.5H22.5V12.5H19.5V10.5M6,20H18A2,2 0 0,1 20,22H4A2,2 0 0,1 6,20M12,5A6,6 0 0,1 18,11V19H6V11A6,6 0 0,1 12,5Z";var d7="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12,16.5C9.5,16.5 7.5,14.5 7.5,12C7.5,9.5 9.5,7.5 12,7.5C14.5,7.5 16.5,9.5 16.5,12C16.5,14.5 14.5,16.5 12,16.5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",A7="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z";var s7="M13,13H11V7H13M13,17H11V15H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var l7="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z";var m7="M12,2L1,21H23M12,6L19.53,19H4.47M11,10V14H13V10M11,16V18H13V16";var p7="M10,2H14A1,1 0 0,1 15,3H21V21H19A1,1 0 0,1 18,22A1,1 0 0,1 17,21H7A1,1 0 0,1 6,22A1,1 0 0,1 5,21H3V3H9A1,1 0 0,1 10,2M5,5V9H19V5H5M7,6A1,1 0 0,1 8,7A1,1 0 0,1 7,8A1,1 0 0,1 6,7A1,1 0 0,1 7,6M12,6H14V7H12V6M15,6H16V8H15V6M17,6H18V8H17V6M12,11A4,4 0 0,0 8,15A4,4 0 0,0 12,19A4,4 0 0,0 16,15A4,4 0 0,0 12,11M10,6A1,1 0 0,1 11,7A1,1 0 0,1 10,8A1,1 0 0,1 9,7A1,1 0 0,1 10,6Z";var u7="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z";var c7="M11,4H13V16L18.5,10.5L19.92,11.92L12,19.84L4.08,11.92L5.5,10.5L11,16V4Z",v7="M9,4H15V12H19.84L12,19.84L4.16,12H9V4Z";var x7="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z",h7="M20,9V15H12V19.84L4.16,12L12,4.16V9H20Z";var Z7="M20 13.5V20H18V13.5C18 11 16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z";var S7="M4,11V13H16L10.5,18.5L11.92,19.92L19.84,12L11.92,4.08L10.5,5.5L16,11H4Z",g7="M4,15V9H12V4.16L19.84,12L12,19.84V15H4Z";var f7="M20 13.5C20 17.09 17.09 20 13.5 20H6V18H13.5C16 18 18 16 18 13.5S16 9 13.5 9H7.83L10.91 12.09L9.5 13.5L4 8L9.5 2.5L10.92 3.91L7.83 7H13.5C17.09 7 20 9.91 20 13.5Z";var b7="M13,20H11V8L5.5,13.5L4.08,12.08L12,4.16L19.92,12.08L18.5,13.5L13,8V20Z",y7="M15,20H9V12H4.16L12,4.16L19.84,12H15V20Z";var w7="M19,12H17V15H14V17H19V12M7,9H10V7H5V12H7V9M21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19V5A2,2 0 0,0 21,3M21,19H3V5H21V19Z";var O7="M20,7H4A2,2 0 0,0 2,9V15A2,2 0 0,0 4,17H5V18C5,18.6 5.4,19 6,19H8C8.6,19 9,18.6 9,18V17H15V18C15,18.6 15.4,19 16,19H18C18.6,19 19,18.6 19,18V17H20A2,2 0 0,0 22,15V9A2,2 0 0,0 20,7M14,12H4V10H14V12M18,13A2,2 0 0,1 16,11A2,2 0 0,1 18,9A2,2 0 0,1 20,11A2,2 0 0,1 18,13M6,15H4V14H6V15M10,15H8V14H10V15M14,15H12V14H14V15Z",k7="M22.1 21.5L2.4 1.7L1.1 3L5.1 7H4C2.9 7 2 7.9 2 9V15C2 16.1 2.9 17 4 17H5V18C5 18.6 5.4 19 6 19H8C8.6 19 9 18.6 9 18V17H15V18C15 18.6 15.4 19 16 19H17.1L20.8 22.7L22.1 21.5M6 15H4V14H6V15M4 12V10H8.1L10.1 12H4M10 15H8V14H10V15M12 15V14H12.1L13.1 15H12M14 10V10.8L20.2 17C21.2 16.9 22 16.1 22 15V9C22 7.9 21.1 7 20 7H10.2L13.2 10H14M18 9C19.1 9 20 9.9 20 11S19.1 13 18 13 16 12.1 16 11 16.9 9 18 9Z";var _7="M22,3H7C6.31,3 5.77,3.35 5.41,3.88L0,12L5.41,20.11C5.77,20.64 6.31,21 7,21H22A2,2 0 0,0 24,19V5A2,2 0 0,0 22,3M19,15.59L17.59,17L14,13.41L10.41,17L9,15.59L12.59,12L9,8.41L10.41,7L14,10.59L17.59,7L19,8.41L15.41,12";var T7="M19,7H11V14H3V5H1V20H3V17H21V20H23V11A4,4 0 0,0 19,7M7,13A3,3 0 0,0 10,10A3,3 0 0,0 7,7A3,3 0 0,0 4,10A3,3 0 0,0 7,13Z";var R7="M7 14C8.66 14 10 12.66 10 11C10 9.34 8.66 8 7 8C5.34 8 4 9.34 4 11C4 12.66 5.34 14 7 14M7 10C7.55 10 8 10.45 8 11C8 11.55 7.55 12 7 12C6.45 12 6 11.55 6 11C6 10.45 6.45 10 7 10M19 7H11V15H3V5H1V20H3V17H21V20H23V11C23 8.79 21.21 7 19 7M21 15H13V9H19C20.1 9 21 9.9 21 11Z";var P7="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21";var B7="M20.84,22.73L18.11,20H3V19L5,17V11C5,9.86 5.29,8.73 5.83,7.72L1.11,3L2.39,1.73L22.11,21.46L20.84,22.73M19,15.8V11C19,7.9 16.97,5.17 14,4.29C14,4.19 14,4.1 14,4A2,2 0 0,0 12,2A2,2 0 0,0 10,4C10,4.1 10,4.19 10,4.29C9.39,4.47 8.8,4.74 8.26,5.09L19,15.8M12,23A2,2 0 0,0 14,21H10A2,2 0 0,0 12,23Z";var D7="M21,19V20H3V19L5,17V11C5,7.9 7.03,5.17 10,4.29C10,4.19 10,4.1 10,4A2,2 0 0,1 12,2A2,2 0 0,1 14,4C14,4.1 14,4.19 14,4.29C16.97,5.17 19,7.9 19,11V17L21,19M14,21A2,2 0 0,1 12,23A2,2 0 0,1 10,21M19.75,3.19L18.33,4.61C20.04,6.3 21,8.6 21,11H23C23,8.07 21.84,5.25 19.75,3.19M1,11H3C3,8.6 3.96,6.3 5.67,4.61L4.25,3.19C2.16,5.25 1,8.07 1,11Z";var F7="M3,2H21A1,1 0 0,1 22,3V5A1,1 0 0,1 21,6H20V13A1,1 0 0,1 19,14H13V16.17C14.17,16.58 15,17.69 15,19A3,3 0 0,1 12,22A3,3 0 0,1 9,19C9,17.69 9.83,16.58 11,16.17V14H5A1,1 0 0,1 4,13V6H3A1,1 0 0,1 2,5V3A1,1 0 0,1 3,2M12,18A1,1 0 0,0 11,19A1,1 0 0,0 12,20A1,1 0 0,0 13,19A1,1 0 0,0 12,18Z";var E7="M3 2H21C21.55 2 22 2.45 22 3V5C22 5.55 21.55 6 21 6H20V7C20 7.55 19.55 8 19 8H13V10.17C14.17 10.58 15 11.7 15 13C15 14.66 13.66 16 12 16C10.34 16 9 14.66 9 13C9 11.69 9.84 10.58 11 10.17V8H5C4.45 8 4 7.55 4 7V6H3C2.45 6 2 5.55 2 5V3C2 2.45 2.45 2 3 2M12 12C11.45 12 11 12.45 11 13C11 13.55 11.45 14 12 14C12.55 14 13 13.55 13 13C13 12.45 12.55 12 12 12Z";var N7="M14.88,16.29L13,18.17V14.41M13,5.83L14.88,7.71L13,9.58M17.71,7.71L12,2H11V9.58L6.41,5L5,6.41L10.59,12L5,17.58L6.41,19L11,14.41V22H12L17.71,16.29L13.41,12L17.71,7.71Z";var $7="M13,5.83L14.88,7.71L13.28,9.31L14.69,10.72L17.71,7.7L12,2H11V7.03L13,9.03M5.41,4L4,5.41L10.59,12L5,17.59L6.41,19L11,14.41V22H12L16.29,17.71L18.59,20L20,18.59M13,18.17V14.41L14.88,16.29";var I7="M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z";var U7="M17,18L12,15.82L7,18V5H17M17,3H7A2,2 0 0,0 5,5V21L12,18L19,21V5C19,3.89 18.1,3 17,3Z";var W7="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2Z",G7="M10,2C8.18,2 6.47,2.5 5,3.35C8,5.08 10,8.3 10,12C10,15.7 8,18.92 5,20.65C6.47,21.5 8.18,22 10,22A10,10 0 0,0 20,12A10,10 0 0,0 10,2Z",z7="M9,2C7.95,2 6.95,2.16 6,2.46C10.06,3.73 13,7.5 13,12C13,16.5 10.06,20.27 6,21.54C6.95,21.84 7.95,22 9,22A10,10 0 0,0 19,12A10,10 0 0,0 9,2Z",q7="M12,18C11.11,18 10.26,17.8 9.5,17.45C11.56,16.5 13,14.42 13,12C13,9.58 11.56,7.5 9.5,6.55C10.26,6.2 11.11,6 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z",K7="M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,15.31L23.31,12L20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31Z",Q7="M12,18V6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,15.31L23.31,12L20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31Z",j7="M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8M12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18M20,8.69V4H15.31L12,0.69L8.69,4H4V8.69L0.69,12L4,15.31V20H8.69L12,23.31L15.31,20H20V15.31L23.31,12L20,8.69Z";var X7="M19.36,2.72L20.78,4.14L15.06,9.85C16.13,11.39 16.28,13.24 15.38,14.44L9.06,8.12C10.26,7.22 12.11,7.37 13.65,8.44L19.36,2.72M5.93,17.57C3.92,15.56 2.69,13.16 2.35,10.92L7.23,8.83L14.67,16.27L12.58,21.15C10.34,20.81 7.94,19.58 5.93,17.57Z";var Y7="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z";var J7="M1.2,4.47L2.5,3.2L20,20.72L18.73,22L16.73,20H4A2,2 0 0,1 2,18V6C2,5.78 2.04,5.57 2.1,5.37L1.2,4.47M7,4L9,2H15L17,4H20A2,2 0 0,1 22,6V18C22,18.6 21.74,19.13 21.32,19.5L16.33,14.5C16.76,13.77 17,12.91 17,12A5,5 0 0,0 12,7C11.09,7 10.23,7.24 9.5,7.67L5.82,4H7M7,12A5,5 0 0,0 12,17C12.5,17 13.03,16.92 13.5,16.77L11.72,15C10.29,14.85 9.15,13.71 9,12.28L7.23,10.5C7.08,10.97 7,11.5 7,12M12,9A3,3 0 0,1 15,12C15,12.35 14.94,12.69 14.83,13L11,9.17C11.31,9.06 11.65,9 12,9Z";var C4="M12 2C17.5 2 22 6.5 22 12S17.5 22 12 22 2 17.5 2 12 6.5 2 12 2M12 4C10.1 4 8.4 4.6 7.1 5.7L18.3 16.9C19.3 15.5 20 13.8 20 12C20 7.6 16.4 4 12 4M16.9 18.3L5.7 7.1C4.6 8.4 4 10.1 4 12C4 16.4 7.6 20 12 20C13.9 20 15.6 19.4 16.9 18.3Z";var H4="M5,11L6.5,6.5H17.5L19,11M17.5,16A1.5,1.5 0 0,1 16,14.5A1.5,1.5 0 0,1 17.5,13A1.5,1.5 0 0,1 19,14.5A1.5,1.5 0 0,1 17.5,16M6.5,16A1.5,1.5 0 0,1 5,14.5A1.5,1.5 0 0,1 6.5,13A1.5,1.5 0 0,1 8,14.5A1.5,1.5 0 0,1 6.5,16M18.92,6C18.72,5.42 18.16,5 17.5,5H6.5C5.84,5 5.28,5.42 5.08,6L3,12V20A1,1 0 0,0 4,21H5A1,1 0 0,0 6,20V19H18V20A1,1 0 0,0 19,21H20A1,1 0 0,0 21,20V12L18.92,6Z";var V4="M9 0C7.3 0 6 1.3 6 3S7.3 6 9 6C10.3 6 11.4 5.2 11.8 4H14V6H16V4H18V2H11.8C11.4 .8 10.3 0 9 0M9 2C9.6 2 10 2.4 10 3S9.6 4 9 4 8 3.6 8 3 8.4 2 9 2M6.5 8C5.8 8 5.3 8.4 5.1 9L3 15V23C3 23.6 3.4 24 4 24H5C5.6 24 6 23.6 6 23V22H18V23C18 23.6 18.4 24 19 24H20C20.6 24 21 23.6 21 23V15L18.9 9C18.7 8.4 18.1 8 17.5 8H6.5M6.5 9.5H17.5L19 14H5L6.5 9.5M6.5 16C7.3 16 8 16.7 8 17.5S7.3 19 6.5 19 5 18.3 5 17.5 5.7 16 6.5 16M17.5 16C18.3 16 19 16.7 19 17.5S18.3 19 17.5 19 16 18.3 16 17.5 16.7 16 17.5 16Z";var e4="M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.07,10 1,10M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18M21,3H3C1.89,3 1,3.89 1,5V8H3V5H21V19H14V21H21A2,2 0 0,0 23,19V5C23,3.89 22.1,3 21,3Z";var L4="M21,3H3C1.89,3 1,3.89 1,5V8H3V5H21V19H14V21H21A2,2 0 0,0 23,19V5C23,3.89 22.1,3 21,3M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.07,10 1,10M19,7H5V8.63C8.96,9.91 12.09,13.04 13.37,17H19M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18Z";var r4="M1.6,1.27L0.25,2.75L1.41,3.8C1.16,4.13 1,4.55 1,5V8H3V5.23L18.2,19H14V21H20.41L22.31,22.72L23.65,21.24M6.5,3L8.7,5H21V16.14L23,17.95V5C23,3.89 22.1,3 21,3M1,10V12A9,9 0 0,1 10,21H12C12,14.92 7.08,10 1,10M1,14V16A5,5 0 0,1 6,21H8A7,7 0 0,0 1,14M1,18V21H4A3,3 0 0,0 1,18Z";var t4="M6.03 12.03L8.03 15.5L5.5 18.68L2 12.62L6.03 12.03M17 18V15.29C17.88 14.9 18.5 14.03 18.5 13C18.5 12.43 18.3 11.9 17.97 11.5L19.94 10.35C20.95 9.76 21.3 8.47 20.71 7.46L19.33 5.06C18.74 4.05 17.45 3.7 16.44 4.28L8.31 9C7.36 9.53 7.03 10.75 7.58 11.71L9.08 14.31C9.63 15.26 10.86 15.59 11.81 15.04L13.69 13.96C13.94 14.55 14.41 15.03 15 15.29V18C15 19.1 15.9 20 17 20H22V18H17Z";var i4="M8,9H11V4H13V9H16L20,17H4L8,9M14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18H14Z";var o4="M17,19H7V5H17M17,1H7C5.89,1 5,1.89 5,3V21A2,2 0 0,0 7,23H17A2,2 0 0,0 19,21V3C19,1.89 18.1,1 17,1Z";var M4="M20.07,4.93C21.88,6.74 23,9.24 23,12C23,14.76 21.88,17.26 20.07,19.07L18.66,17.66C20.11,16.22 21,14.22 21,12C21,9.79 20.11,7.78 18.66,6.34L20.07,4.93M17.24,7.76C18.33,8.85 19,10.35 19,12C19,13.65 18.33,15.15 17.24,16.24L15.83,14.83C16.55,14.11 17,13.11 17,12C17,10.89 16.55,9.89 15.83,9.17L17.24,7.76M13,10A2,2 0 0,1 15,12A2,2 0 0,1 13,14A2,2 0 0,1 11,12A2,2 0 0,1 13,10M11.5,1A2.5,2.5 0 0,1 14,3.5V8H12V4H3V19H12V16H14V20.5A2.5,2.5 0 0,1 11.5,23H3.5A2.5,2.5 0 0,1 1,20.5V3.5A2.5,2.5 0 0,1 3.5,1H11.5Z";var a4="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z";var n4="M9,20.42L2.79,14.21L5.62,11.38L9,14.77L18.88,4.88L21.71,7.71L9,20.42Z",d4="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z",A4="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M12 20C7.59 20 4 16.41 4 12S7.59 4 12 4 20 7.59 20 12 16.41 20 12 20M16.59 7.58L10 14.17L7.41 11.59L6 13L10 17L18 9L16.59 7.58Z";var s4="M16.59,5.59L18,7L12,13L6,7L7.41,5.59L12,10.17L16.59,5.59M16.59,11.59L18,13L12,19L6,13L7.41,11.59L12,16.17L16.59,11.59Z",l4="M18.41,7.41L17,6L11,12L17,18L18.41,16.59L13.83,12L18.41,7.41M12.41,7.41L11,6L5,12L11,18L12.41,16.59L7.83,12L12.41,7.41Z",m4="M5.59,7.41L7,6L13,12L7,18L5.59,16.59L10.17,12L5.59,7.41M11.59,7.41L13,6L19,12L13,18L11.59,16.59L16.17,12L11.59,7.41Z",p4="M7.41,18.41L6,17L12,11L18,17L16.59,18.41L12,13.83L7.41,18.41M7.41,12.41L6,11L12,5L18,11L16.59,12.41L12,7.83L7.41,12.41Z",u4="M7.41,8.58L12,13.17L16.59,8.58L18,10L12,16L6,10L7.41,8.58Z";var c4="M15.41,16.58L10.83,12L15.41,7.41L14,6L8,12L14,18L15.41,16.58Z";var v4="M8.59,16.58L13.17,12L8.59,7.41L10,6L16,12L10,18L8.59,16.58Z";var x4="M7.41,15.41L12,10.83L16.59,15.41L18,14L12,8L6,14L7.41,15.41Z";var h4="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var Z4="M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var S4="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z";var g4="M12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22C6.47,22 2,17.5 2,12A10,10 0 0,1 12,2M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z";var f4="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";var b4="M12,2C17.53,2 22,6.47 22,12C22,17.53 17.53,22 12,22C6.47,22 2,17.53 2,12C2,6.47 6.47,2 12,2M15.59,7L12,10.59L8.41,7L7,8.41L10.59,12L7,15.59L8.41,17L12,13.41L15.59,17L17,15.59L13.41,12L17,8.41L15.59,7Z";var y4="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2C6.47,2 2,6.47 2,12C2,17.53 6.47,22 12,22C17.53,22 22,17.53 22,12C22,6.47 17.53,2 12,2M14.59,8L12,10.59L9.41,8L8,9.41L10.59,12L8,14.59L9.41,16L12,13.41L14.59,16L16,14.59L13.41,12L16,9.41L14.59,8Z";var w4="M18,11H16.5V10.5H14.5V13.5H16.5V13H18V14A1,1 0 0,1 17,15H14A1,1 0 0,1 13,14V10A1,1 0 0,1 14,9H17A1,1 0 0,1 18,10M11,11H9.5V10.5H7.5V13.5H9.5V13H11V14A1,1 0 0,1 10,15H7A1,1 0 0,1 6,14V10A1,1 0 0,1 7,9H10A1,1 0 0,1 11,10M19,4H5C3.89,4 3,4.89 3,6V18A2,2 0 0,0 5,20H19A2,2 0 0,0 21,18V6C21,4.89 20.1,4 19,4Z",O4="M5,4C4.45,4 4,4.18 3.59,4.57C3.2,4.96 3,5.44 3,6V18C3,18.56 3.2,19.04 3.59,19.43C4,19.82 4.45,20 5,20H19C19.5,20 20,19.81 20.39,19.41C20.8,19 21,18.53 21,18V6C21,5.47 20.8,5 20.39,4.59C20,4.19 19.5,4 19,4H5M4.5,5.5H19.5V18.5H4.5V5.5M7,9C6.7,9 6.47,9.09 6.28,9.28C6.09,9.47 6,9.7 6,10V14C6,14.3 6.09,14.53 6.28,14.72C6.47,14.91 6.7,15 7,15H10C10.27,15 10.5,14.91 10.71,14.72C10.91,14.53 11,14.3 11,14V13H9.5V13.5H7.5V10.5H9.5V11H11V10C11,9.7 10.91,9.47 10.71,9.28C10.5,9.09 10.27,9 10,9H7M14,9C13.73,9 13.5,9.09 13.29,9.28C13.09,9.47 13,9.7 13,10V14C13,14.3 13.09,14.53 13.29,14.72C13.5,14.91 13.73,15 14,15H17C17.3,15 17.53,14.91 17.72,14.72C17.91,14.53 18,14.3 18,14V13H16.5V13.5H14.5V10.5H16.5V11H18V10C18,9.7 17.91,9.47 17.72,9.28C17.53,9.09 17.3,9 17,9H14Z";var k4="M2,21H20V19H2M20,8H18V5H20M20,3H4V13A4,4 0 0,0 8,17H14A4,4 0 0,0 18,13V10H20A2,2 0 0,0 22,8V5C22,3.89 21.1,3 20,3Z";var _4="M2,21V19H20V21H2M20,8V5H18V8H20M20,3A2,2 0 0,1 22,5V8A2,2 0 0,1 20,10H18V13A4,4 0 0,1 14,17H8A4,4 0 0,1 4,13V3H20M16,5H6V13A2,2 0 0,0 8,15H14A2,2 0 0,0 16,13V5Z";var T4="M12,15.5A3.5,3.5 0 0,1 8.5,12A3.5,3.5 0 0,1 12,8.5A3.5,3.5 0 0,1 15.5,12A3.5,3.5 0 0,1 12,15.5M19.43,12.97C19.47,12.65 19.5,12.33 19.5,12C19.5,11.67 19.47,11.34 19.43,11L21.54,9.37C21.73,9.22 21.78,8.95 21.66,8.73L19.66,5.27C19.54,5.05 19.27,4.96 19.05,5.05L16.56,6.05C16.04,5.66 15.5,5.32 14.87,5.07L14.5,2.42C14.46,2.18 14.25,2 14,2H10C9.75,2 9.54,2.18 9.5,2.42L9.13,5.07C8.5,5.32 7.96,5.66 7.44,6.05L4.95,5.05C4.73,4.96 4.46,5.05 4.34,5.27L2.34,8.73C2.21,8.95 2.27,9.22 2.46,9.37L4.57,11C4.53,11.34 4.5,11.67 4.5,12C4.5,12.33 4.53,12.65 4.57,12.97L2.46,14.63C2.27,14.78 2.21,15.05 2.34,15.27L4.34,18.73C4.46,18.95 4.73,19.03 4.95,18.95L7.44,17.94C7.96,18.34 8.5,18.68 9.13,18.93L9.5,21.58C9.54,21.82 9.75,22 10,22H14C14.25,22 14.46,21.82 14.5,21.58L14.87,18.93C15.5,18.67 16.04,18.34 16.56,17.94L19.05,18.95C19.27,19.03 19.54,18.95 19.66,18.73L21.66,15.27C21.78,15.05 21.73,14.78 21.54,14.63L19.43,12.97Z";var R4="M12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10M10,22C9.75,22 9.54,21.82 9.5,21.58L9.13,18.93C8.5,18.68 7.96,18.34 7.44,17.94L4.95,18.95C4.73,19.03 4.46,18.95 4.34,18.73L2.34,15.27C2.21,15.05 2.27,14.78 2.46,14.63L4.57,12.97L4.5,12L4.57,11L2.46,9.37C2.27,9.22 2.21,8.95 2.34,8.73L4.34,5.27C4.46,5.05 4.73,4.96 4.95,5.05L7.44,6.05C7.96,5.66 8.5,5.32 9.13,5.07L9.5,2.42C9.54,2.18 9.75,2 10,2H14C14.25,2 14.46,2.18 14.5,2.42L14.87,5.07C15.5,5.32 16.04,5.66 16.56,6.05L19.05,5.05C19.27,4.96 19.54,5.05 19.66,5.27L21.66,8.73C21.79,8.95 21.73,9.22 21.54,9.37L19.43,11L19.5,12L19.43,13L21.54,14.63C21.73,14.78 21.79,15.05 21.66,15.27L19.66,18.73C19.54,18.95 19.27,19.04 19.05,18.95L16.56,17.95C16.04,18.34 15.5,18.68 14.87,18.93L14.5,21.58C14.46,21.82 14.25,22 14,22H10M11.25,4L10.88,6.61C9.68,6.86 8.62,7.5 7.85,8.39L5.44,7.35L4.69,8.65L6.8,10.2C6.4,11.37 6.4,12.64 6.8,13.8L4.68,15.36L5.43,16.66L7.86,15.62C8.63,16.5 9.68,17.14 10.87,17.38L11.24,20H12.76L13.13,17.39C14.32,17.14 15.37,16.5 16.14,15.62L18.57,16.66L19.32,15.36L17.2,13.81C17.6,12.64 17.6,11.37 17.2,10.2L19.31,8.65L18.56,7.35L16.15,8.39C15.38,7.5 14.32,6.86 13.12,6.62L12.75,4H11.25Z";var P4="M15.9,18.45C17.25,18.45 18.35,17.35 18.35,16C18.35,14.65 17.25,13.55 15.9,13.55C14.54,13.55 13.45,14.65 13.45,16C13.45,17.35 14.54,18.45 15.9,18.45M21.1,16.68L22.58,17.84C22.71,17.95 22.75,18.13 22.66,18.29L21.26,20.71C21.17,20.86 21,20.92 20.83,20.86L19.09,20.16C18.73,20.44 18.33,20.67 17.91,20.85L17.64,22.7C17.62,22.87 17.47,23 17.3,23H14.5C14.32,23 14.18,22.87 14.15,22.7L13.89,20.85C13.46,20.67 13.07,20.44 12.71,20.16L10.96,20.86C10.81,20.92 10.62,20.86 10.54,20.71L9.14,18.29C9.05,18.13 9.09,17.95 9.22,17.84L10.7,16.68L10.65,16L10.7,15.31L9.22,14.16C9.09,14.05 9.05,13.86 9.14,13.71L10.54,11.29C10.62,11.13 10.81,11.07 10.96,11.13L12.71,11.84C13.07,11.56 13.46,11.32 13.89,11.15L14.15,9.29C14.18,9.13 14.32,9 14.5,9H17.3C17.47,9 17.62,9.13 17.64,9.29L17.91,11.15C18.33,11.32 18.73,11.56 19.09,11.84L20.83,11.13C21,11.07 21.17,11.13 21.26,11.29L22.66,13.71C22.75,13.86 22.71,14.05 22.58,14.16L21.1,15.31L21.15,16L21.1,16.68M6.69,8.07C7.56,8.07 8.26,7.37 8.26,6.5C8.26,5.63 7.56,4.92 6.69,4.92A1.58,1.58 0 0,0 5.11,6.5C5.11,7.37 5.82,8.07 6.69,8.07M10.03,6.94L11,7.68C11.07,7.75 11.09,7.87 11.03,7.97L10.13,9.53C10.08,9.63 9.96,9.67 9.86,9.63L8.74,9.18L8,9.62L7.81,10.81C7.79,10.92 7.7,11 7.59,11H5.79C5.67,11 5.58,10.92 5.56,10.81L5.4,9.62L4.64,9.18L3.5,9.63C3.41,9.67 3.3,9.63 3.24,9.53L2.34,7.97C2.28,7.87 2.31,7.75 2.39,7.68L3.34,6.94L3.31,6.5L3.34,6.06L2.39,5.32C2.31,5.25 2.28,5.13 2.34,5.03L3.24,3.47C3.3,3.37 3.41,3.33 3.5,3.37L4.63,3.82L5.4,3.38L5.56,2.19C5.58,2.08 5.67,2 5.79,2H7.59C7.7,2 7.79,2.08 7.81,2.19L8,3.38L8.74,3.82L9.86,3.37C9.96,3.33 10.08,3.37 10.13,3.47L11.03,5.03C11.09,5.13 11.07,5.25 11,5.32L10.03,6.06L10.06,6.5L10.03,6.94Z";var B4="M6,7H18A5,5 0 0,1 23,12A5,5 0 0,1 18,17C16.36,17 14.91,16.21 14,15H10C9.09,16.21 7.64,17 6,17A5,5 0 0,1 1,12A5,5 0 0,1 6,7M19.75,9.5A1.25,1.25 0 0,0 18.5,10.75A1.25,1.25 0 0,0 19.75,12A1.25,1.25 0 0,0 21,10.75A1.25,1.25 0 0,0 19.75,9.5M17.25,12A1.25,1.25 0 0,0 16,13.25A1.25,1.25 0 0,0 17.25,14.5A1.25,1.25 0 0,0 18.5,13.25A1.25,1.25 0 0,0 17.25,12M5,9V11H3V13H5V15H7V13H9V11H7V9H5Z",D4="M17.5,7A5.5,5.5 0 0,1 23,12.5A5.5,5.5 0 0,1 17.5,18C15.79,18 14.27,17.22 13.26,16H10.74C9.73,17.22 8.21,18 6.5,18A5.5,5.5 0 0,1 1,12.5A5.5,5.5 0 0,1 6.5,7H17.5M6.5,9A3.5,3.5 0 0,0 3,12.5A3.5,3.5 0 0,0 6.5,16C7.9,16 9.1,15.18 9.66,14H14.34C14.9,15.18 16.1,16 17.5,16A3.5,3.5 0 0,0 21,12.5A3.5,3.5 0 0,0 17.5,9H6.5M5.75,10.25H7.25V11.75H8.75V13.25H7.25V14.75H5.75V13.25H4.25V11.75H5.75V10.25M16.75,12.5A1,1 0 0,1 17.75,13.5A1,1 0 0,1 16.75,14.5A1,1 0 0,1 15.75,13.5A1,1 0 0,1 16.75,12.5M18.75,10.5A1,1 0 0,1 19.75,11.5A1,1 0 0,1 18.75,12.5A1,1 0 0,1 17.75,11.5A1,1 0 0,1 18.75,10.5Z";var F4="M23 3H1V1H23V3M2 22H6C6 19 4 17 4 17C10 13 11 4 11 4H2V22M22 4H13C13 4 14 13 20 17C20 17 18 19 18 22H22V4Z",E4="M23 3H1V1H23V3M2 22H11V4H2V22M22 4H13V22H22V4Z";var N4="M8,2H16A2,2 0 0,1 18,4V20A2,2 0 0,1 16,22H8A2,2 0 0,1 6,20V4A2,2 0 0,1 8,2M8,4V6H16V4H8M16,8H8V10H16V8M16,18H14V20H16V18Z";var $4="M12,19A2,2 0 0,0 10,21A2,2 0 0,0 12,23A2,2 0 0,0 14,21A2,2 0 0,0 12,19M6,1A2,2 0 0,0 4,3A2,2 0 0,0 6,5A2,2 0 0,0 8,3A2,2 0 0,0 6,1M6,7A2,2 0 0,0 4,9A2,2 0 0,0 6,11A2,2 0 0,0 8,9A2,2 0 0,0 6,7M6,13A2,2 0 0,0 4,15A2,2 0 0,0 6,17A2,2 0 0,0 8,15A2,2 0 0,0 6,13M18,5A2,2 0 0,0 20,3A2,2 0 0,0 18,1A2,2 0 0,0 16,3A2,2 0 0,0 18,5M12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13M18,13A2,2 0 0,0 16,15A2,2 0 0,0 18,17A2,2 0 0,0 20,15A2,2 0 0,0 18,13M18,7A2,2 0 0,0 16,9A2,2 0 0,0 18,11A2,2 0 0,0 20,9A2,2 0 0,0 18,7M12,7A2,2 0 0,0 10,9A2,2 0 0,0 12,11A2,2 0 0,0 14,9A2,2 0 0,0 12,7M12,1A2,2 0 0,0 10,3A2,2 0 0,0 12,5A2,2 0 0,0 14,3A2,2 0 0,0 12,1Z";var I4="M12,14C10.89,14 10,13.1 10,12C10,10.89 10.89,10 12,10C13.11,10 14,10.89 14,12A2,2 0 0,1 12,14M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";var U4="M14.5,10.37C15.54,10.37 16.38,9.53 16.38,8.5C16.38,7.46 15.54,6.63 14.5,6.63C13.46,6.63 12.63,7.46 12.63,8.5A1.87,1.87 0 0,0 14.5,10.37M14.5,1A7.5,7.5 0 0,1 22,8.5C22,10.67 21.08,12.63 19.6,14H9.4C7.93,12.63 7,10.67 7,8.5C7,4.35 10.36,1 14.5,1M6,21V22H4V21H2V15H22V21H20V22H18V21H6M4,18V19H13V18H4M15,17V19H17V17H15M19,17A1,1 0 0,0 18,18A1,1 0 0,0 19,19A1,1 0 0,0 20,18A1,1 0 0,0 19,17Z",W4="M18,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V4A2,2 0 0,0 18,2M10,4A1,1 0 0,1 11,5A1,1 0 0,1 10,6A1,1 0 0,1 9,5A1,1 0 0,1 10,4M7,4A1,1 0 0,1 8,5A1,1 0 0,1 7,6A1,1 0 0,1 6,5A1,1 0 0,1 7,4M18,20H6V8H18V20M14.67,15.33C14.69,16.03 14.41,16.71 13.91,17.21C12.86,18.26 11.15,18.27 10.09,17.21C9.59,16.71 9.31,16.03 9.33,15.33C9.4,14.62 9.63,13.94 10,13.33C10.37,12.5 10.81,11.73 11.33,11L12,10C13.79,12.59 14.67,14.36 14.67,15.33";var G4="M8,3C6.89,3 6,3.89 6,5V21H18V5C18,3.89 17.11,3 16,3H8M8,5H16V19H8V5M13,11V13H15V11H13Z",z4="M16,11H18V13H16V11M12,3H19C20.11,3 21,3.89 21,5V19H22V21H2V19H10V5C10,3.89 10.89,3 12,3M12,5V19H19V5H12Z";var q4="M12,3C10.89,3 10,3.89 10,5H3V19H2V21H22V19H21V5C21,3.89 20.11,3 19,3H12M12,5H19V19H12V5M5,11H7V13H5V11Z";var K4="M12 10C10.9 10 10 10.9 10 12S10.9 14 12 14 14 13.1 14 12 13.1 10 12 10M16 2H8C6.9 2 6 2.9 6 4V20C6 21.1 6.9 22 8 22H16C17.1 22 18 21.1 18 20V4C18 2.9 17.1 2 16 2M16 20H8V4H16V20Z";var Q4="M16,12A2,2 0 0,1 18,10A2,2 0 0,1 20,12A2,2 0 0,1 18,14A2,2 0 0,1 16,12M10,12A2,2 0 0,1 12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12M4,12A2,2 0 0,1 6,10A2,2 0 0,1 8,12A2,2 0 0,1 6,14A2,2 0 0,1 4,12Z";var j4="M12,16A2,2 0 0,1 14,18A2,2 0 0,1 12,20A2,2 0 0,1 10,18A2,2 0 0,1 12,16M12,10A2,2 0 0,1 14,12A2,2 0 0,1 12,14A2,2 0 0,1 10,12A2,2 0 0,1 12,10M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8A2,2 0 0,1 10,6A2,2 0 0,1 12,4Z";var X4="M11 21H9V3H11V21M15 3H13V21H15V3Z";var Y4="M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z";var J4="M11.83,9L15,12.16C15,12.11 15,12.05 15,12A3,3 0 0,0 12,9C11.94,9 11.89,9 11.83,9M7.53,9.8L9.08,11.35C9.03,11.56 9,11.77 9,12A3,3 0 0,0 12,15C12.22,15 12.44,14.97 12.65,14.92L14.2,16.47C13.53,16.8 12.79,17 12,17A5,5 0 0,1 7,12C7,11.21 7.2,10.47 7.53,9.8M2,4.27L4.28,6.55L4.73,7C3.08,8.3 1.78,10 1,12C2.73,16.39 7,19.5 12,19.5C13.55,19.5 15.03,19.2 16.38,18.66L16.81,19.08L19.73,22L21,20.73L3.27,3M12,7A5,5 0 0,1 17,12C17,12.64 16.87,13.26 16.64,13.82L19.57,16.75C21.07,15.5 22.27,13.86 23,12C21.27,7.61 17,4.5 12,4.5C10.6,4.5 9.26,4.75 8,5.2L10.17,7.35C10.74,7.13 11.35,7 12,7Z";var C9="M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.68 9.22,10.87C9.41,10.39 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z";var H9="M12.5,2C9.64,2 8.57,4.55 9.29,7.47L15,13.16C15.87,13.37 16.81,13.81 17.28,14.73C18.46,17.1 22.03,17 22.03,12.5C22.03,8.92 18.05,8.13 14.35,10.13C14.03,9.73 13.61,9.42 13.13,9.22C13.32,8.29 13.76,7.24 14.75,6.75C17.11,5.57 17,2 12.5,2M3.28,4L2,5.27L4.47,7.73C3.22,7.74 2,8.87 2,11.5C2,15.07 5.96,15.85 9.65,13.87C9.97,14.27 10.4,14.59 10.89,14.79C10.69,15.71 10.25,16.75 9.27,17.24C6.91,18.42 7,22 11.5,22C13.8,22 14.94,20.36 14.94,18.21L18.73,22L20,20.72L3.28,4Z";var V9="M13,6V18L21.5,12M4,18L12.5,12L4,6V18Z";var e9="M15,9.9L18,12L15,14.1V9.9M6,9.9L9,12L6,14.1V9.9M13,6V18L21.5,12L13,6M4,6V18L12.5,12L4,6Z";var L9="M3.5,3H5V1.8C5,1.36 5.36,1 5.8,1H10.2C10.64,1 11,1.36 11,1.8V3H12.5A1.5,1.5 0 0,1 14,4.5V5H22V20H14V20.5A1.5,1.5 0 0,1 12.5,22H3.5A1.5,1.5 0 0,1 2,20.5V4.5A1.5,1.5 0 0,1 3.5,3M18,7V9H20V7H18M14,7V9H16V7H14M10,7V9H12V7H10M14,16V18H16V16H14M18,16V18H20V16H18M10,16V18H12V16H10Z",r9="M18,9H16V7H18M18,13H16V11H18M18,17H16V15H18M8,9H6V7H8M8,13H6V11H8M8,17H6V15H8M18,3V5H16V3H8V5H6V3H4V21H6V19H8V21H16V19H18V21H20V3H18Z";var t9="M17.66 11.2C17.43 10.9 17.15 10.64 16.89 10.38C16.22 9.78 15.46 9.35 14.82 8.72C13.33 7.26 13 4.85 13.95 3C13 3.23 12.17 3.75 11.46 4.32C8.87 6.4 7.85 10.07 9.07 13.22C9.11 13.32 9.15 13.42 9.15 13.55C9.15 13.77 9 13.97 8.8 14.05C8.57 14.15 8.33 14.09 8.14 13.93C8.08 13.88 8.04 13.83 8 13.76C6.87 12.33 6.69 10.28 7.45 8.64C5.78 10 4.87 12.3 5 14.47C5.06 14.97 5.12 15.47 5.29 15.97C5.43 16.57 5.7 17.17 6 17.7C7.08 19.43 8.95 20.67 10.96 20.92C13.1 21.19 15.39 20.8 17.03 19.32C18.86 17.66 19.5 15 18.56 12.72L18.43 12.46C18.22 12 17.66 11.2 17.66 11.2M14.5 17.5C14.22 17.74 13.76 18 13.4 18.1C12.28 18.5 11.16 17.94 10.5 17.28C11.69 17 12.4 16.12 12.61 15.23C12.78 14.43 12.46 13.77 12.33 13C12.21 12.26 12.23 11.63 12.5 10.94C12.69 11.32 12.89 11.7 13.13 12C13.9 13 15.11 13.44 15.37 14.8C15.41 14.94 15.43 15.08 15.43 15.23C15.46 16.05 15.1 16.95 14.5 17.5H14.5Z";var i9="M22,22H2V20H22V22M22,6H2V3H22V6M20,7V19H17V11C17,11 14.5,10 12,10C9.5,10 7,11 7,11V19H4V7H20M14.5,14.67H14.47L14.81,15.22L14.87,15.34C15.29,16.35 15,17.5 14.21,18.24C13.5,18.9 12.5,19.07 11.58,18.95C10.71,18.84 9.9,18.29 9.45,17.53C9.3,17.3 9.19,17.03 9.13,16.77L9,16.11C8.96,15.15 9.34,14.14 10.06,13.54C9.73,14.26 9.81,15.16 10.3,15.79L10.36,15.87C10.44,15.94 10.55,15.97 10.64,15.92C10.73,15.89 10.8,15.8 10.8,15.7L10.76,15.56C10.23,14.17 10.68,12.55 11.79,11.63C12.1,11.38 12.5,11.15 12.87,11.05C12.46,11.87 12.61,12.93 13.25,13.57L14.14,14.3L14.5,14.67M13.11,17.44V17.44C13.37,17.2 13.53,16.8 13.5,16.44V16.25C13.38,15.65 12.85,15.46 12.5,15L12.26,14.55C12.13,14.85 12.12,15.13 12.17,15.46C12.23,15.8 12.37,16.09 12.29,16.44C12.2,16.83 11.9,17.22 11.37,17.35C11.67,17.64 12.15,17.87 12.64,17.71L13.11,17.44Z",o9="M22,22H2V20H22V22M22,6H2V3H22V6M20,7V19H17V11C17,11 14.5,10 12,10C9.5,10 7,11 7,11V19H4V7H20Z";var M9="M15,2L17,9H7L9,2M11,10H13V20H16V22H8V20H11V10Z";var a9="M19,11.5C19,11.5 17,13.67 17,15A2,2 0 0,0 19,17A2,2 0 0,0 21,15C21,13.67 19,11.5 19,11.5M5.21,10L10,5.21L14.79,10M16.56,8.94L7.62,0L6.21,1.41L8.59,3.79L3.44,8.94C2.85,9.5 2.85,10.47 3.44,11.06L8.94,16.56C9.23,16.85 9.62,17 10,17C10.38,17 10.77,16.85 11.06,16.56L16.56,11.06C17.15,10.47 17.15,9.5 16.56,8.94Z";var n9="M7,2H17A2,2 0 0,1 19,4V9H5V4A2,2 0 0,1 7,2M19,19A2,2 0 0,1 17,21V22H15V21H9V22H7V21A2,2 0 0,1 5,19V10H19V19M8,5V7H10V5H8M8,12V15H10V12H8Z";var d9="M5,5H10V7H7V10H5V5M14,5H19V10H17V7H14V5M17,14H19V19H14V17H17V14M10,17V19H5V14H7V17H10Z",A9="M14,14H19V16H16V19H14V14M5,14H10V19H8V16H5V14M8,5H10V10H5V8H8V5M19,8V10H14V5H16V8H19Z";var s9="M16.5,9L13.5,12L16.5,15H22V9M9,16.5V22H15V16.5L12,13.5M7.5,9H2V15H7.5L10.5,12M15,7.5V2H9V7.5L12,10.5L15,7.5Z";var l9="M7,6H17A6,6 0 0,1 23,12A6,6 0 0,1 17,18C15.22,18 13.63,17.23 12.53,16H11.47C10.37,17.23 8.78,18 7,18A6,6 0 0,1 1,12A6,6 0 0,1 7,6M6,9V11H4V13H6V15H8V13H10V11H8V9H6M15.5,12A1.5,1.5 0 0,0 14,13.5A1.5,1.5 0 0,0 15.5,15A1.5,1.5 0 0,0 17,13.5A1.5,1.5 0 0,0 15.5,12M18.5,9A1.5,1.5 0 0,0 17,10.5A1.5,1.5 0 0,0 18.5,12A1.5,1.5 0 0,0 20,10.5A1.5,1.5 0 0,0 18.5,9Z",m9="M6,9H8V11H10V13H8V15H6V13H4V11H6V9M18.5,9A1.5,1.5 0 0,1 20,10.5A1.5,1.5 0 0,1 18.5,12A1.5,1.5 0 0,1 17,10.5A1.5,1.5 0 0,1 18.5,9M15.5,12A1.5,1.5 0 0,1 17,13.5A1.5,1.5 0 0,1 15.5,15A1.5,1.5 0 0,1 14,13.5A1.5,1.5 0 0,1 15.5,12M17,5A7,7 0 0,1 24,12A7,7 0 0,1 17,19C15.04,19 13.27,18.2 12,16.9C10.73,18.2 8.96,19 7,19A7,7 0 0,1 0,12A7,7 0 0,1 7,5H17M7,7A5,5 0 0,0 2,12A5,5 0 0,0 7,17C8.64,17 10.09,16.21 11,15H13C13.91,16.21 15.36,17 17,17A5,5 0 0,0 22,12A5,5 0 0,0 17,7H7Z";var p9="M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12M8,15H16V17H8V15M16,18V20H8V18H16Z";var u9="M19,20H17V11H7V20H5V9L12,5L19,9V20M8,12H16V14H8V12Z";var c9="M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5M11,3A6,6 0 0,1 17,9C17,10.7 16.29,12.23 15.16,13.33L14.16,12.88C15.28,11.96 16,10.56 16,9A5,5 0 0,0 11,4A5,5 0 0,0 6,9C6,11.05 7.23,12.81 9,13.58V14.66C6.67,13.83 5,11.61 5,9A6,6 0 0,1 11,3Z";var v9="M20.11,3.89L22,2V7H17L19.08,4.92C18.55,4.23 17.64,3.66 16.36,3.19C15.08,2.72 13.63,2.5 12,2.5C10.38,2.5 8.92,2.72 7.64,3.19C6.36,3.66 5.45,4.23 4.92,4.92L7,7H2V2L3.89,3.89C4.64,3 5.74,2.31 7.2,1.78C8.65,1.25 10.25,1 12,1C13.75,1 15.35,1.25 16.8,1.78C18.26,2.31 19.36,3 20.11,3.89M19.73,16.27V16.45L19,21.7C18.92,22.08 18.76,22.39 18.5,22.64C18.23,22.89 17.91,23 17.53,23H10.73C10.36,23 10,22.86 9.7,22.55L4.73,17.63L5.53,16.83C5.75,16.61 6,16.5 6.33,16.5H6.56L10,17.25V6.5C10,6.11 10.13,5.76 10.43,5.46C10.73,5.16 11.08,5 11.5,5C11.89,5 12.24,5.16 12.54,5.46C12.84,5.76 13,6.11 13,6.5V12.5H13.78C13.88,12.5 14.05,12.55 14.3,12.61L18.84,14.86C19.44,15.14 19.73,15.61 19.73,16.27Z";var x9="M10,9A1,1 0 0,1 11,8A1,1 0 0,1 12,9V13.47L13.21,13.6L18.15,15.79C18.68,16.03 19,16.56 19,17.14V21.5C18.97,22.32 18.32,22.97 17.5,23H11C10.62,23 10.26,22.85 10,22.57L5.1,18.37L5.84,17.6C6.03,17.39 6.3,17.28 6.58,17.28H6.8L10,19V9M11,5A4,4 0 0,1 15,9C15,10.5 14.2,11.77 13,12.46V11.24C13.61,10.69 14,9.89 14,9A3,3 0 0,0 11,6A3,3 0 0,0 8,9C8,9.89 8.39,10.69 9,11.24V12.46C7.8,11.77 7,10.5 7,9A4,4 0 0,1 11,5Z";var h9="M13 5C15.21 5 17 6.79 17 9C17 10.5 16.2 11.77 15 12.46V11.24C15.61 10.69 16 9.89 16 9C16 7.34 14.66 6 13 6S10 7.34 10 9C10 9.89 10.39 10.69 11 11.24V12.46C9.8 11.77 9 10.5 9 9C9 6.79 10.79 5 13 5M20 20.5C19.97 21.32 19.32 21.97 18.5 22H13C12.62 22 12.26 21.85 12 21.57L8 17.37L8.74 16.6C8.93 16.39 9.2 16.28 9.5 16.28H9.7L12 18V9C12 8.45 12.45 8 13 8S14 8.45 14 9V13.47L15.21 13.6L19.15 15.79C19.68 16.03 20 16.56 20 17.14V20.5M20 2H4C2.9 2 2 2.9 2 4V12C2 13.11 2.9 14 4 14H8V12L4 12L4 4H20L20 12H18V14H20V13.96L20.04 14C21.13 14 22 13.09 22 12V4C22 2.9 21.11 2 20 2Z";var Z9="M7.5,7L5.5,5H18.5L16.5,7M11,13V19H6V21H18V19H13V13L21,5V3H3V5L11,13Z";var S9="M12,1C7,1 3,5 3,10V17A3,3 0 0,0 6,20H9V12H5V10A7,7 0 0,1 12,3A7,7 0 0,1 19,10V12H15V20H18A3,3 0 0,0 21,17V10C21,5 16.97,1 12,1Z";var g9="M12,21.35L10.55,20.03C5.4,15.36 2,12.27 2,8.5C2,5.41 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.08C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.41 22,8.5C22,12.27 18.6,15.36 13.45,20.03L12,21.35Z";var f9="M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z";var b9="M15.07,11.25L14.17,12.17C13.45,12.89 13,13.5 13,15H11V14.5C11,13.39 11.45,12.39 12.17,11.67L13.41,10.41C13.78,10.05 14,9.55 14,9C14,7.89 13.1,7 12,7A2,2 0 0,0 10,9H8A4,4 0 0,1 12,5A4,4 0 0,1 16,9C16,9.88 15.64,10.67 15.07,11.25M13,19H11V17H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z",y9="M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z";var w9="M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5Z";var O9="M21,16.5C21,16.88 20.79,17.21 20.47,17.38L12.57,21.82C12.41,21.94 12.21,22 12,22C11.79,22 11.59,21.94 11.43,21.82L3.53,17.38C3.21,17.21 3,16.88 3,16.5V7.5C3,7.12 3.21,6.79 3.53,6.62L11.43,2.18C11.59,2.06 11.79,2 12,2C12.21,2 12.41,2.06 12.57,2.18L20.47,6.62C20.79,6.79 21,7.12 21,7.5V16.5M12,4.15L5,8.09V15.91L12,19.85L19,15.91V8.09L12,4.15Z";var k9="M10,20V14H14V20H19V12H22L12,3L2,12H5V20H10Z";var _9="M21.8,13H20V21H13V17.67L15.79,14.88L16.5,15C17.66,15 18.6,14.06 18.6,12.9C18.6,11.74 17.66,10.8 16.5,10.8A2.1,2.1 0 0,0 14.4,12.9L14.5,13.61L13,15.13V9.65C13.66,9.29 14.1,8.6 14.1,7.8A2.1,2.1 0 0,0 12,5.7A2.1,2.1 0 0,0 9.9,7.8C9.9,8.6 10.34,9.29 11,9.65V15.13L9.5,13.61L9.6,12.9A2.1,2.1 0 0,0 7.5,10.8A2.1,2.1 0 0,0 5.4,12.9A2.1,2.1 0 0,0 7.5,15L8.21,14.88L11,17.67V21H4V13H2.25C1.83,13 1.42,13 1.42,12.79C1.43,12.57 1.85,12.15 2.28,11.72L11,3C11.33,2.67 11.67,2.33 12,2.33C12.33,2.33 12.67,2.67 13,3L17,7V6H19V9L21.78,11.78C22.18,12.18 22.59,12.59 22.6,12.8C22.6,13 22.2,13 21.8,13M7.5,12A0.9,0.9 0 0,1 8.4,12.9A0.9,0.9 0 0,1 7.5,13.8A0.9,0.9 0 0,1 6.6,12.9A0.9,0.9 0 0,1 7.5,12M16.5,12C17,12 17.4,12.4 17.4,12.9C17.4,13.4 17,13.8 16.5,13.8A0.9,0.9 0 0,1 15.6,12.9A0.9,0.9 0 0,1 16.5,12M12,6.9C12.5,6.9 12.9,7.3 12.9,7.8C12.9,8.3 12.5,8.7 12,8.7C11.5,8.7 11.1,8.3 11.1,7.8C11.1,7.3 11.5,6.9 12,6.9Z",T9="M12,3L2,12H5V20H19V12H22L12,3M12,8.5C14.34,8.5 16.46,9.43 18,10.94L16.8,12.12C15.58,10.91 13.88,10.17 12,10.17C10.12,10.17 8.42,10.91 7.2,12.12L6,10.94C7.54,9.43 9.66,8.5 12,8.5M12,11.83C13.4,11.83 14.67,12.39 15.6,13.3L14.4,14.47C13.79,13.87 12.94,13.5 12,13.5C11.06,13.5 10.21,13.87 9.6,14.47L8.4,13.3C9.33,12.39 10.6,11.83 12,11.83M12,15.17C12.94,15.17 13.7,15.91 13.7,16.83C13.7,17.75 12.94,18.5 12,18.5C11.06,18.5 10.3,17.75 10.3,16.83C10.3,15.91 11.06,15.17 12,15.17Z";var R9="M12 3L2 12H5V20H19V12H22M13 18H11V17H13M13.5 14.58V16H10.5V14.58A3 3 0 1 1 13.5 14.58Z";var P9="M12 5.69L17 10.19V18H15V12H9V18H7V10.19L12 5.69M12 3L2 12H5V20H11V14H13V20H19V12H22";var B9="M19 8C20.11 8 21 8.9 21 10V16.76C21.61 17.31 22 18.11 22 19C22 20.66 20.66 22 19 22C17.34 22 16 20.66 16 19C16 18.11 16.39 17.31 17 16.76V10C17 8.9 17.9 8 19 8M19 9C18.45 9 18 9.45 18 10V11H20V10C20 9.45 19.55 9 19 9M5 20V12H2L12 3L16.4 6.96C15.54 7.69 15 8.78 15 10V16C14.37 16.83 14 17.87 14 19L14.1 20H5Z";var D9="M19.5,12.8V22H14.7V13.9C14.7,13.2 14.1,12.6 13.4,12.6H10.5C9.8,12.6 9.2,13.2 9.2,13.9V22H4.5V2H9.3V8.4C9.6,8.3 9.9,8.2 10.2,8.2H15C17.5,8.2 19.5,10.3 19.5,12.8Z";var F9="M12 2C13.1 2 14 2.9 14 4S13.1 6 12 6 10 5.1 10 4 10.9 2 12 2M15.9 8.1C15.5 7.7 14.8 7 13.5 7H11C8.2 7 6 4.8 6 2H4C4 5.2 6.1 7.8 9 8.7V22H11V16H13V22H15V10.1L19 14L20.4 12.6L15.9 8.1Z";var E9="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z";var N9="M22,16V4A2,2 0 0,0 20,2H8A2,2 0 0,0 6,4V16A2,2 0 0,0 8,18H20A2,2 0 0,0 22,16M11,12L13.03,14.71L16,11L20,16H8M2,6V20A2,2 0 0,0 4,22H18V20H4V6";var $9="M13,9H11V7H13M13,17H11V11H13M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var I9="M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z";var U9="M12,19.58V19.58C10.4,19.58 8.89,18.96 7.76,17.83C6.62,16.69 6,15.19 6,13.58C6,12 6.62,10.47 7.76,9.34L12,5.1M17.66,7.93L12,2.27V2.27L6.34,7.93C3.22,11.05 3.22,16.12 6.34,19.24C7.9,20.8 9.95,21.58 12,21.58C14.05,21.58 16.1,20.8 17.66,19.24C20.78,16.12 20.78,11.05 17.66,7.93Z";var W9="M12.5,3C7.81,3 4,5.69 4,9V9C4,10.19 4.5,11.34 5.44,12.33C4.53,13.5 4,14.96 4,16.5C4,17.64 4,18.83 4,20C4,21.11 4.89,22 6,22H19C20.11,22 21,21.11 21,20C21,18.85 21,17.61 21,16.5C21,15.28 20.66,14.07 20,13L22,11L19,8L16.9,10.1C15.58,9.38 14.05,9 12.5,9C10.65,9 8.95,9.53 7.55,10.41C7.19,9.97 7,9.5 7,9C7,7.21 9.46,5.75 12.5,5.75V5.75C13.93,5.75 15.3,6.08 16.33,6.67L18.35,4.65C16.77,3.59 14.68,3 12.5,3M12.5,11C12.84,11 13.17,11.04 13.5,11.09C10.39,11.57 8,14.25 8,17.5V20H6V17.5A6.5,6.5 0 0,1 12.5,11Z";var G9="M19,10H17V8H19M19,13H17V11H19M16,10H14V8H16M16,13H14V11H16M16,17H8V15H16M7,10H5V8H7M7,13H5V11H7M8,11H10V13H8M8,8H10V10H8M11,11H13V13H11M11,8H13V10H11M20,5H4C2.89,5 2,5.89 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7C22,5.89 21.1,5 20,5Z",z9="M21,11H6.83L10.41,7.41L9,6L3,12L9,18L10.41,16.58L6.83,13H21V11Z";var q9="M19,7V11H5.83L9.41,7.41L8,6L2,12L8,18L9.41,16.58L5.83,13H21V7H19Z";var K9="M3 15H5V19H19V15H21V19C21 20.1 20.1 21 19 21H5C3.9 21 3 20.1 3 19V15Z";var Q9="M12.03,1C11.82,1 11.6,1.11 11.41,1.31C10.56,2.16 9.72,3 8.88,3.84C8.66,4.06 8.6,4.18 8.38,4.38C8.09,4.62 7.96,4.91 7.97,5.28C8,6.57 8,7.84 8,9.13C8,10.46 8,11.82 8,13.16C8,13.26 8,13.34 8.03,13.44C8.11,13.75 8.31,13.82 8.53,13.59C9.73,12.39 10.8,11.3 12,10.09C13.36,8.73 14.73,7.37 16.09,6C16.5,5.6 16.5,5.15 16.09,4.75C14.94,3.6 13.77,2.47 12.63,1.31C12.43,1.11 12.24,1 12.03,1M18.66,7.66C18.45,7.66 18.25,7.75 18.06,7.94C16.91,9.1 15.75,10.24 14.59,11.41C14.2,11.8 14.2,12.23 14.59,12.63C15.74,13.78 16.88,14.94 18.03,16.09C18.43,16.5 18.85,16.5 19.25,16.09C20.36,15 21.5,13.87 22.59,12.75C22.76,12.58 22.93,12.42 23,12.19V11.88C22.93,11.64 22.76,11.5 22.59,11.31C21.47,10.19 20.37,9.06 19.25,7.94C19.06,7.75 18.86,7.66 18.66,7.66M4.78,8.09C4.65,8.04 4.58,8.14 4.5,8.22C3.35,9.39 2.34,10.43 1.19,11.59C0.93,11.86 0.93,12.24 1.19,12.5C1.81,13.13 2.44,13.75 3.06,14.38C3.6,14.92 4,15.33 4.56,15.88C4.72,16.03 4.86,16 4.94,15.81C5,15.71 5,15.58 5,15.47C5,14.29 5,13.37 5,12.19C5,11 5,9.81 5,8.63C5,8.55 5,8.45 4.97,8.38C4.95,8.25 4.9,8.14 4.78,8.09M12.09,14.25C11.89,14.25 11.66,14.34 11.47,14.53C10.32,15.69 9.18,16.87 8.03,18.03C7.63,18.43 7.63,18.85 8.03,19.25C9.14,20.37 10.26,21.47 11.38,22.59C11.54,22.76 11.71,22.93 11.94,23H12.22C12.44,22.94 12.62,22.79 12.78,22.63C13.9,21.5 15.03,20.38 16.16,19.25C16.55,18.85 16.5,18.4 16.13,18C14.97,16.84 13.84,15.69 12.69,14.53C12.5,14.34 12.3,14.25 12.09,14.25Z";var j9="M8,2H16L20,14H4L8,2M11,15H13V20H18V22H6V20H11V15Z";var X9="M4,6H20V16H4M20,18A2,2 0 0,0 22,16V6C22,4.89 21.1,4 20,4H4C2.89,4 2,4.89 2,6V16A2,2 0 0,0 4,18H0V20H24V18H20Z";var Y9="M12,6A4,4 0 0,0 8,10V16H6V18H9V23H11V18H13V23H15V18H18V16H16V10A4,4 0 0,0 12,6M12,8A2,2 0 0,1 14,10V15H10V10A2,2 0 0,1 12,8Z",J9="M2.81,8.46L14.83,20.5L15.54,19.78L16.95,21.19L18.36,19.78L16.95,18.36L18.36,16.95L19.78,18.36L21.19,16.95L19.78,15.54L20.5,14.83L8.46,2.81L2.81,8.46M5.64,8.46L8.46,5.64L17.66,14.83L14.83,17.66L5.64,8.46M7.05,8.46L8.46,9.88L9.88,8.46L8.46,7.05L7.05,8.46M9.17,10.59L10.59,12L12,10.59L10.59,9.17L9.17,10.59M11.29,12.71L12.71,14.12L14.12,12.71L12.71,11.29L11.29,12.71M13.41,14.83L14.83,16.24L16.24,14.83L14.83,13.41L13.41,14.83Z",C6="M2.95 3L2 6.91L19.34 11.25L20.29 7.34L2.95 3M6.09 6.89L4.16 6.41L4.64 4.46L6.57 4.94L6.09 6.89M9.94 7.86L8 7.38L8.5 5.42L10.42 5.91L9.94 7.86M13.8 8.82L11.87 8.34L12.35 6.39L14.27 6.87L13.8 8.82M17.65 9.79L15.72 9.31L16.2 7.35L18.13 7.84L17.65 9.79M4.66 12.75L3.71 16.66L21.05 21L22 17.1L4.66 12.75M7.8 16.65L5.88 16.16L6.35 14.21L8.28 14.69L7.8 16.65M11.65 17.61L9.73 17.13L10.2 15.18L12.13 15.66L11.65 17.61M15.5 18.58L13.58 18.09L14.06 16.14L16 16.62L15.5 18.58M19.36 19.54L17.43 19.06L17.91 17.11L19.84 17.59L19.36 19.54M6.25 12.11L11 10.2L17.75 11.89L13 13.8L6.25 12.11Z";var H6="M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z";var V6="M15 14V16A1 1 0 0 1 14 17H10A1 1 0 0 1 9 16V14A5 5 0 1 1 15 14M14 18H10V19A1 1 0 0 0 11 20H13A1 1 0 0 0 14 19M7 19V18H5V19A1 1 0 0 0 6 20H7.17A2.93 2.93 0 0 1 7 19M5 10A6.79 6.79 0 0 1 5.68 7A4 4 0 0 0 4 14.45V16A1 1 0 0 0 5 17H7V14.88A6.92 6.92 0 0 1 5 10M17 18V19A2.93 2.93 0 0 1 16.83 20H18A1 1 0 0 0 19 19V18M18.32 7A6.79 6.79 0 0 1 19 10A6.92 6.92 0 0 1 17 14.88V17H19A1 1 0 0 0 20 16V14.45A4 4 0 0 0 18.32 7Z",e6="M20.84 22.73L18.09 20C18.06 20 18.03 20 18 20H16.83C16.94 19.68 17 19.34 17 19V18.89L14.75 16.64C14.57 16.86 14.31 17 14 17H10C9.45 17 9 16.55 9 16V14C7.4 12.8 6.74 10.84 7.12 9L5.5 7.4C5.18 8.23 5 9.11 5 10C5 11.83 5.72 13.58 7 14.88V17H5C4.45 17 4 16.55 4 16V14.45C2.86 13.79 2.12 12.62 2 11.31C1.85 9.27 3.25 7.5 5.2 7.09L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M15 6C13.22 4.67 10.86 4.72 9.13 5.93L16.08 12.88C17.63 10.67 17.17 7.63 15 6M19.79 16.59C19.91 16.42 20 16.22 20 16V14.45C21.91 13.34 22.57 10.9 21.46 9C20.8 7.85 19.63 7.11 18.32 7C18.77 7.94 19 8.96 19 10C19 11.57 18.47 13.09 17.5 14.31L19.79 16.59M10 19C10 19.55 10.45 20 11 20H13C13.55 20 14 19.55 14 19V18H10V19M7 18H5V19C5 19.55 5.45 20 6 20H7.17C7.06 19.68 7 19.34 7 19V18Z";var L6="M12,2C9.76,2 7.78,3.05 6.5,4.68L16.31,14.5C17.94,13.21 19,11.24 19,9A7,7 0 0,0 12,2M3.28,4L2,5.27L5.04,8.3C5,8.53 5,8.76 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H14.73L18.73,22L20,20.72L3.28,4M9,20V21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9Z";var r6="M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z";var t6="M12,2A7,7 0 0,1 19,9C19,11.38 17.81,13.47 16,14.74V17A1,1 0 0,1 15,18H9A1,1 0 0,1 8,17V14.74C6.19,13.47 5,11.38 5,9A7,7 0 0,1 12,2M9,21V20H15V21A1,1 0 0,1 14,22H10A1,1 0 0,1 9,21M12,4A5,5 0 0,0 7,9C7,11.05 8.23,12.81 10,13.58V16H14V13.58C15.77,12.81 17,11.05 17,9A5,5 0 0,0 12,4Z";var i6="M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z";var o6="M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V10A2,2 0 0,1 6,8H15V6A3,3 0 0,0 12,3A3,3 0 0,0 9,6H7A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,17A2,2 0 0,0 14,15A2,2 0 0,0 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17Z";var M6="M18 1C15.24 1 13 3.24 13 6V8H4C2.9 8 2 8.89 2 10V20C2 21.11 2.9 22 4 22H16C17.11 22 18 21.11 18 20V10C18 8.9 17.11 8 16 8H15V6C15 4.34 16.34 3 18 3C19.66 3 21 4.34 21 6V8H23V6C23 3.24 20.76 1 18 1M10 13C11.1 13 12 13.89 12 15C12 16.11 11.11 17 10 17C8.9 17 8 16.11 8 15C8 13.9 8.9 13 10 13Z";var a6="M9.5,3A6.5,6.5 0 0,1 16,9.5C16,11.11 15.41,12.59 14.44,13.73L14.71,14H15.5L20.5,19L19,20.5L14,15.5V14.71L13.73,14.44C12.59,15.41 11.11,16 9.5,16A6.5,6.5 0 0,1 3,9.5A6.5,6.5 0 0,1 9.5,3M9.5,5C7,5 5,7 5,9.5C5,12 7,14 9.5,14C12,14 14,12 14,9.5C14,7 12,5 9.5,5Z";var n6="M9,2A7,7 0 0,1 16,9C16,10.57 15.5,12 14.61,13.19L15.41,14H16L22,20L20,22L14,16V15.41L13.19,14.61C12,15.5 10.57,16 9,16A7,7 0 0,1 2,9A7,7 0 0,1 9,2M5,8V10H13V8H5Z";var d6="M9,2A7,7 0 0,1 16,9C16,10.57 15.5,12 14.61,13.19L15.41,14H16L22,20L20,22L14,16V15.41L13.19,14.61C12,15.5 10.57,16 9,16A7,7 0 0,1 2,9A7,7 0 0,1 9,2M8,5V8H5V10H8V13H10V10H13V8H10V5H8Z";var A6="M3,6H21V8H3V6M3,11H21V13H3V11M3,16H21V18H3V16Z";var s6="M7,10L12,15L17,10H7Z";var l6="M21,15.61L19.59,17L14.58,12L19.59,7L21,8.39L17.44,12L21,15.61M3,6H16V8H3V6M3,13V11H13V13H3M3,18V16H16V18H3Z";var m6="M7,15L12,10L17,15H7Z";var p6="M6.43,3.72C6.5,3.66 6.57,3.6 6.62,3.56C8.18,2.55 10,2 12,2C13.88,2 15.64,2.5 17.14,3.42C17.25,3.5 17.54,3.69 17.7,3.88C16.25,2.28 12,5.7 12,5.7C10.5,4.57 9.17,3.8 8.16,3.5C7.31,3.29 6.73,3.5 6.46,3.7M19.34,5.21C19.29,5.16 19.24,5.11 19.2,5.06C18.84,4.66 18.38,4.56 18,4.59C17.61,4.71 15.9,5.32 13.8,7.31C13.8,7.31 16.17,9.61 17.62,11.96C19.07,14.31 19.93,16.16 19.4,18.73C21,16.95 22,14.59 22,12C22,9.38 21,7 19.34,5.21M15.73,12.96C15.08,12.24 14.13,11.21 12.86,9.95C12.59,9.68 12.3,9.4 12,9.1C12,9.1 11.53,9.56 10.93,10.17C10.16,10.94 9.17,11.95 8.61,12.54C7.63,13.59 4.81,16.89 4.65,18.74C4.65,18.74 4,17.28 5.4,13.89C6.3,11.68 9,8.36 10.15,7.28C10.15,7.28 9.12,6.14 7.82,5.35L7.77,5.32C7.14,4.95 6.46,4.66 5.8,4.62C5.13,4.67 4.71,5.16 4.71,5.16C3.03,6.95 2,9.35 2,12A10,10 0 0,0 12,22C14.93,22 17.57,20.74 19.4,18.73C19.4,18.73 19.19,17.4 17.84,15.5C17.53,15.07 16.37,13.69 15.73,12.96Z";var u6="M4,5A2,2 0 0,0 2,7V17A2,2 0 0,0 4,19H20A2,2 0 0,0 22,17V7A2,2 0 0,0 20,5H4M4,7H16V17H4V7M19,7A1,1 0 0,1 20,8A1,1 0 0,1 19,9A1,1 0 0,1 18,8A1,1 0 0,1 19,7M13,9V15H15V9H13M19,11A1,1 0 0,1 20,12A1,1 0 0,1 19,13A1,1 0 0,1 18,12A1,1 0 0,1 19,11Z";var c6="M19,13H5V11H19V13Z",v6="M17,13H7V11H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";var x6="M17,13H7V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var h6="M21,16H3V4H21M21,2H3C1.89,2 1,2.89 1,4V16A2,2 0 0,0 3,18H10V20H8V22H16V20H14V18H21A2,2 0 0,0 23,16V4C23,2.89 22.1,2 21,2Z";var Z6="M10,0.2C9,0.2 8.2,1 8.2,2C8.2,3 9,3.8 10,3.8C11,3.8 11.8,3 11.8,2C11.8,1 11,0.2 10,0.2M15.67,1A7.33,7.33 0 0,0 23,8.33V7A6,6 0 0,1 17,1H15.67M18.33,1C18.33,3.58 20.42,5.67 23,5.67V4.33C21.16,4.33 19.67,2.84 19.67,1H18.33M21,1A2,2 0 0,0 23,3V1H21M7.92,4.03C7.75,4.03 7.58,4.06 7.42,4.11L2,5.8V11H3.8V7.33L5.91,6.67L2,22H3.8L6.67,13.89L9,17V22H10.8V15.59L8.31,11.05L9.04,8.18L10.12,10H15V8.2H11.38L9.38,4.87C9.08,4.37 8.54,4.03 7.92,4.03Z";var S6="M18,4L20,8H17L15,4H13L15,8H12L10,4H8L10,8H7L5,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V4H18Z";var g6="M20.84 2.18L16.91 2.96L19.65 6.5L21.62 6.1L20.84 2.18M13.97 3.54L12 3.93L14.75 7.46L16.71 7.07L13.97 3.54M9.07 4.5L7.1 4.91L9.85 8.44L11.81 8.05L9.07 4.5M4.16 5.5L3.18 5.69A2 2 0 0 0 1.61 8.04L2 10L6.9 9.03L4.16 5.5M2 10V20C2 21.11 2.9 22 4 22H20C21.11 22 22 21.11 22 20V10H2Z";var f6="M20.84 2.18L16.91 2.96L19.65 6.5L21.62 6.1L20.84 2.18M13.97 3.54L12 3.93L14.75 7.46L16.71 7.07L13.97 3.54M9.07 4.5L7.1 4.91L9.85 8.44L11.81 8.05L9.07 4.5M4.16 5.5L3.18 5.69C2.1 5.9 1.39 6.96 1.61 8.04L2 10L6.9 9.03L4.16 5.5M20 12V20H4V12H20M22 10H2V20C2 21.11 2.9 22 4 22H20C21.11 22 22 21.11 22 20V10Z";var b6="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A2.5,2.5 0 0,0 9.5,6.5A2.5,2.5 0 0,0 12,9A2.5,2.5 0 0,0 14.5,6.5A2.5,2.5 0 0,0 12,4M4.4,9.53C3.97,10.84 4.69,12.25 6,12.68C7.32,13.1 8.73,12.39 9.15,11.07C9.58,9.76 8.86,8.35 7.55,7.92C6.24,7.5 4.82,8.21 4.4,9.53M19.61,9.5C19.18,8.21 17.77,7.5 16.46,7.92C15.14,8.34 14.42,9.75 14.85,11.07C15.28,12.38 16.69,13.1 18,12.67C19.31,12.25 20.03,10.83 19.61,9.5M7.31,18.46C8.42,19.28 10,19.03 10.8,17.91C11.61,16.79 11.36,15.23 10.24,14.42C9.13,13.61 7.56,13.86 6.75,14.97C5.94,16.09 6.19,17.65 7.31,18.46M16.7,18.46C17.82,17.65 18.07,16.09 17.26,14.97C16.45,13.85 14.88,13.6 13.77,14.42C12.65,15.23 12.4,16.79 13.21,17.91C14,19.03 15.59,19.27 16.7,18.46M12,10.5A1.5,1.5 0 0,0 10.5,12A1.5,1.5 0 0,0 12,13.5A1.5,1.5 0 0,0 13.5,12A1.5,1.5 0 0,0 12,10.5Z";var y6="M21,3V15.5A3.5,3.5 0 0,1 17.5,19A3.5,3.5 0 0,1 14,15.5A3.5,3.5 0 0,1 17.5,12C18.04,12 18.55,12.12 19,12.34V6.47L9,8.6V17.5A3.5,3.5 0 0,1 5.5,21A3.5,3.5 0 0,1 2,17.5A3.5,3.5 0 0,1 5.5,14C6.04,14 6.55,14.12 7,14.34V6L21,3Z";var w6="M16,9H13V14.5A2.5,2.5 0 0,1 10.5,17A2.5,2.5 0 0,1 8,14.5A2.5,2.5 0 0,1 10.5,12C11.07,12 11.58,12.19 12,12.5V7H16M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3Z";var O6="M16,9H13V14.5A2.5,2.5 0 0,1 10.5,17A2.5,2.5 0 0,1 8,14.5A2.5,2.5 0 0,1 10.5,12C11.07,12 11.58,12.19 12,12.5V7H16V9M19,3A2,2 0 0,1 21,5V19A2,2 0 0,1 19,21H5A2,2 0 0,1 3,19V5A2,2 0 0,1 5,3H19M5,5V19H19V5H5Z";var k6="M12 3V13.55C11.41 13.21 10.73 13 10 13C7.79 13 6 14.79 6 17S7.79 21 10 21 14 19.21 14 17V7H18V3H12Z";var _6="M6.5,2H10.5L13.44,10.83L13.5,2H17.5V22C16.25,21.78 14.87,21.64 13.41,21.58L10.5,13L10.43,21.59C9.03,21.65 7.7,21.79 6.5,22V2Z";var T6="M7 1C5.9 1 5 1.9 5 3V21C5 22.11 5.9 23 7 23H14C16.76 23 19 20.76 19 18V3C19 1.9 18.11 1 17 1H7M8 4H16V11H8V4M9 14H10V16H12V17H10V19H9V17H7V16H9V14M16 15C16.55 15 17 15.45 17 16C17 16.55 16.55 17 16 17C15.45 17 15 16.55 15 16C15 15.45 15.45 15 16 15M14 17C14.55 17 15 17.45 15 18C15 18.55 14.55 19 14 19C13.45 19 13 18.55 13 18C13 17.45 13.45 17 14 17Z",R6="M10.04,20.4H7.12C6.19,20.4 5.3,20 4.64,19.36C4,18.7 3.6,17.81 3.6,16.88V7.12C3.6,6.19 4,5.3 4.64,4.64C5.3,4 6.19,3.62 7.12,3.62H10.04V20.4M7.12,2A5.12,5.12 0 0,0 2,7.12V16.88C2,19.71 4.29,22 7.12,22H11.65V2H7.12M5.11,8C5.11,9.04 5.95,9.88 7,9.88C8.03,9.88 8.87,9.04 8.87,8C8.87,6.96 8.03,6.12 7,6.12C5.95,6.12 5.11,6.96 5.11,8M17.61,11C18.72,11 19.62,11.89 19.62,13C19.62,14.12 18.72,15 17.61,15C16.5,15 15.58,14.12 15.58,13C15.58,11.89 16.5,11 17.61,11M16.88,22A5.12,5.12 0 0,0 22,16.88V7.12C22,4.29 19.71,2 16.88,2H13.65V22H16.88Z";var P6="M4,17V9H2V7H6V17H4M22,15C22,16.11 21.1,17 20,17H16V15H20V13H18V11H20V9H16V7H20A2,2 0 0,1 22,9V10.5A1.5,1.5 0 0,1 20.5,12A1.5,1.5 0 0,1 22,13.5V15M14,15V17H8V13C8,11.89 8.9,11 10,11H12V9H8V7H12A2,2 0 0,1 14,9V11C14,12.11 13.1,13 12,13H10V15H14Z";var B6="M17.5,12A1.5,1.5 0 0,1 16,10.5A1.5,1.5 0 0,1 17.5,9A1.5,1.5 0 0,1 19,10.5A1.5,1.5 0 0,1 17.5,12M14.5,8A1.5,1.5 0 0,1 13,6.5A1.5,1.5 0 0,1 14.5,5A1.5,1.5 0 0,1 16,6.5A1.5,1.5 0 0,1 14.5,8M9.5,8A1.5,1.5 0 0,1 8,6.5A1.5,1.5 0 0,1 9.5,5A1.5,1.5 0 0,1 11,6.5A1.5,1.5 0 0,1 9.5,8M6.5,12A1.5,1.5 0 0,1 5,10.5A1.5,1.5 0 0,1 6.5,9A1.5,1.5 0 0,1 8,10.5A1.5,1.5 0 0,1 6.5,12M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A1.5,1.5 0 0,0 13.5,19.5C13.5,19.11 13.35,18.76 13.11,18.5C12.88,18.23 12.73,17.88 12.73,17.5A1.5,1.5 0 0,1 14.23,16H16A5,5 0 0,0 21,11C21,6.58 16.97,3 12,3Z";var D6="M12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2C17.5,2 22,6 22,11A6,6 0 0,1 16,17H14.2C13.9,17 13.7,17.2 13.7,17.5C13.7,17.6 13.8,17.7 13.8,17.8C14.2,18.3 14.4,18.9 14.4,19.5C14.5,20.9 13.4,22 12,22M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C12.3,20 12.5,19.8 12.5,19.5C12.5,19.3 12.4,19.2 12.4,19.1C12,18.6 11.8,18.1 11.8,17.5C11.8,16.1 12.9,15 14.3,15H16A4,4 0 0,0 20,11C20,7.1 16.4,4 12,4M6.5,10C7.3,10 8,10.7 8,11.5C8,12.3 7.3,13 6.5,13C5.7,13 5,12.3 5,11.5C5,10.7 5.7,10 6.5,10M9.5,6C10.3,6 11,6.7 11,7.5C11,8.3 10.3,9 9.5,9C8.7,9 8,8.3 8,7.5C8,6.7 8.7,6 9.5,6M14.5,6C15.3,6 16,6.7 16,7.5C16,8.3 15.3,9 14.5,9C13.7,9 13,8.3 13,7.5C13,6.7 13.7,6 14.5,6M17.5,10C18.3,10 19,10.7 19,11.5C19,12.3 18.3,13 17.5,13C16.7,13 16,12.3 16,11.5C16,10.7 16.7,10 17.5,10Z";var F6="M14,19H18V5H14M6,19H10V5H6V19Z";var E6="M15,16H13V8H15M11,16H9V8H11M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",N6="M13,16V8H15V16H13M9,16V8H11V16H9M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4Z";var $6="M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z";var I6="M19,11H11V17H19V11M23,19V5C23,3.88 22.1,3 21,3H3A2,2 0 0,0 1,5V19A2,2 0 0,0 3,21H21A2,2 0 0,0 23,19M21,19H3V4.97H21V19Z";var U6="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z";var W6="M8,6.2V4H7V2H17V4H16V12L18,14V16H17.8L14,12.2V4H10V8.2L8,6.2M20,20.7L18.7,22L12.8,16.1V22H11.2V16H6V14L8,12V11.3L2,5.3L3.3,4L20,20.7M8.8,14H10.6L9.7,13.1L8.8,14Z",G6="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12M8.8,14L10,12.8V4H14V12.8L15.2,14H8.8Z";var z6="M8,5.14V19.14L19,12.14L8,5.14Z";var q6="M10,16.5V7.5L16,12M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z",K6="M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M10,16.5L16,12L10,7.5V16.5Z";var Q6="M8.5,8.64L13.77,12L8.5,15.36V8.64M6.5,5V19L17.5,12",j6="M3,5V19L11,12M13,19H16V5H13M18,5V19H21V5";var X6="M3 10H14V12H3V10M3 6H14V8H3V6M3 14H10V16H3V14M16 13V21L22 17L16 13Z";var Y6="M4,2C2.89,2 2,2.89 2,4V20C2,21.11 2.89,22 4,22H20C21.11,22 22,21.11 22,20V4C22,2.89 21.11,2 20,2H4M8.56,6H12.06L15.5,12L12.06,18H8.56L12,12L8.56,6Z";var J6="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z",C8="M17,13H13V17H11V13H7V11H11V7H13V11H17M19,3H5C3.89,3 3,3.89 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.89 20.1,3 19,3Z";var H8="M17,13H13V17H11V13H7V11H11V7H13V11H17M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var V8="M7,22H4.75C4.75,22 4,22 3.81,20.65L2.04,3.81L2,3.5C2,2.67 2.9,2 4,2C5.1,2 6,2.67 6,3.5C6,2.67 6.9,2 8,2C9.1,2 10,2.67 10,3.5C10,2.67 10.9,2 12,2C13.09,2 14,2.66 14,3.5V3.5C14,2.67 14.9,2 16,2C17.1,2 18,2.67 18,3.5C18,2.67 18.9,2 20,2C21.1,2 22,2.67 22,3.5L21.96,3.81L20.19,20.65C20,22 19.25,22 19.25,22H17L16.5,22H13.75L10.25,22H7.5L7,22M17.85,4.93C17.55,4.39 16.84,4 16,4C15.19,4 14.36,4.36 14,4.87L13.78,20H16.66L17.85,4.93M10,4.87C9.64,4.36 8.81,4 8,4C7.16,4 6.45,4.39 6.15,4.93L7.34,20H10.22L10,4.87Z";var e8="M16.56,5.44L15.11,6.89C16.84,7.94 18,9.83 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12C6,9.83 7.16,7.94 8.88,6.88L7.44,5.44C5.36,6.88 4,9.28 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,9.28 18.64,6.88 16.56,5.44M13,3H11V13H13",L8="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19M13,17H11V7H13V17Z",r8="M12,3A9,9 0 0,0 3,12A9,9 0 0,0 12,21A9,9 0 0,0 21,12A9,9 0 0,0 12,3M12,19A7,7 0 0,1 5,12A7,7 0 0,1 12,5A7,7 0 0,1 19,12A7,7 0 0,1 12,19Z",t8="M11,3H13V21H11V3Z";var i8="M18.73,18C15.4,21.69 9.71,22 6,18.64C2.33,15.31 2.04,9.62 5.37,5.93C6.9,4.25 9,3.2 11.27,3C7.96,6.7 8.27,12.39 12,15.71C13.63,17.19 15.78,18 18,18C18.25,18 18.5,18 18.73,18Z";var o8="M13,3H11V13H13V3M17.83,5.17L16.41,6.59C18.05,7.91 19,9.9 19,12A7,7 0 0,1 12,19C8.14,19 5,15.88 5,12C5,9.91 5.95,7.91 7.58,6.58L6.17,5.17C2.38,8.39 1.92,14.07 5.14,17.86C8.36,21.64 14.04,22.1 17.83,18.88C19.85,17.17 21,14.65 21,12C21,9.37 19.84,6.87 17.83,5.17Z";var M8="M16,6C14.87,6 13.77,6.35 12.84,7H4C2.89,7 2,7.89 2,9V15C2,16.11 2.89,17 4,17H5V18A1,1 0 0,0 6,19H8A1,1 0 0,0 9,18V17H15V18A1,1 0 0,0 16,19H18A1,1 0 0,0 19,18V17H20C21.11,17 22,16.11 22,15V9C22,7.89 21.11,7 20,7H19.15C18.23,6.35 17.13,6 16,6M16,7.5A3.5,3.5 0 0,1 19.5,11A3.5,3.5 0 0,1 16,14.5A3.5,3.5 0 0,1 12.5,11A3.5,3.5 0 0,1 16,7.5M4,9H8V10H4V9M16,9A2,2 0 0,0 14,11A2,2 0 0,0 16,13A2,2 0 0,0 18,11A2,2 0 0,0 16,9M4,11H8V12H4V11M4,13H8V14H4V13Z";var a8="M4,2A1,1 0 0,0 3,3V4A1,1 0 0,0 4,5H5V14H11V16.59L6.79,20.79L8.21,22.21L11,19.41V22H13V19.41L15.79,22.21L17.21,20.79L13,16.59V14H19V5H20A1,1 0 0,0 21,4V3A1,1 0 0,0 20,2H4Z";var n8="M7.95,3L6.53,5.19L7.95,7.4H7.94L5.95,10.5L4.22,9.6L5.64,7.39L4.22,5.19L6.22,2.09L7.95,3M13.95,2.89L12.53,5.1L13.95,7.3L13.94,7.31L11.95,10.4L10.22,9.5L11.64,7.3L10.22,5.1L12.22,2L13.95,2.89M20,2.89L18.56,5.1L20,7.3V7.31L18,10.4L16.25,9.5L17.67,7.3L16.25,5.1L18.25,2L20,2.89M2,22V14A2,2 0 0,1 4,12H20A2,2 0 0,1 22,14V22H20V20H4V22H2M6,14A1,1 0 0,0 5,15V17A1,1 0 0,0 6,18A1,1 0 0,0 7,17V15A1,1 0 0,0 6,14M10,14A1,1 0 0,0 9,15V17A1,1 0 0,0 10,18A1,1 0 0,0 11,17V15A1,1 0 0,0 10,14M14,14A1,1 0 0,0 13,15V17A1,1 0 0,0 14,18A1,1 0 0,0 15,17V15A1,1 0 0,0 14,14M18,14A1,1 0 0,0 17,15V17A1,1 0 0,0 18,18A1,1 0 0,0 19,17V15A1,1 0 0,0 18,14Z";var d8="M20,6A2,2 0 0,1 22,8V20A2,2 0 0,1 20,22H4A2,2 0 0,1 2,20V8C2,7.15 2.53,6.42 3.28,6.13L15.71,1L16.47,2.83L8.83,6H20M20,8H4V12H16V10H18V12H20V8M7,14A3,3 0 0,0 4,17A3,3 0 0,0 7,20A3,3 0 0,0 10,17A3,3 0 0,0 7,14Z";var A8="M12,10A2,2 0 0,1 14,12C14,12.5 13.82,12.94 13.53,13.29L16.7,22H14.57L12,14.93L9.43,22H7.3L10.47,13.29C10.18,12.94 10,12.5 10,12A2,2 0 0,1 12,10M12,8A4,4 0 0,0 8,12C8,12.5 8.1,13 8.28,13.46L7.4,15.86C6.53,14.81 6,13.47 6,12A6,6 0 0,1 12,6A6,6 0 0,1 18,12C18,13.47 17.47,14.81 16.6,15.86L15.72,13.46C15.9,13 16,12.5 16,12A4,4 0 0,0 12,8M12,4A8,8 0 0,0 4,12C4,14.36 5,16.5 6.64,17.94L5.92,19.94C3.54,18.11 2,15.23 2,12A10,10 0 0,1 12,2A10,10 0 0,1 22,12C22,15.23 20.46,18.11 18.08,19.94L17.36,17.94C19,16.5 20,14.36 20,12A8,8 0 0,0 12,4Z";var s8="M19,12C19,15.86 15.86,19 12,19C8.14,19 5,15.86 5,12C5,8.14 8.14,5 12,5C15.86,5 19,8.14 19,12Z";var l8="M12.5,5A7.5,7.5 0 0,0 5,12.5A7.5,7.5 0 0,0 12.5,20A7.5,7.5 0 0,0 20,12.5A7.5,7.5 0 0,0 12.5,5M7,10H9A1,1 0 0,1 10,11V12C10,12.5 9.62,12.9 9.14,12.97L10.31,15H9.15L8,13V15H7M12,10H14V11H12V12H14V13H12V14H14V15H12A1,1 0 0,1 11,14V11A1,1 0 0,1 12,10M16,10H18V11H16V14H18V15H16A1,1 0 0,1 15,14V11A1,1 0 0,1 16,10M8,11V12H9V11";var m8="M18.4,10.6C16.55,9 14.15,8 11.5,8C6.85,8 2.92,11.03 1.54,15.22L3.9,16C4.95,12.81 7.95,10.5 11.5,10.5C13.45,10.5 15.23,11.22 16.62,12.38L13,16H22V7L18.4,10.6Z";var p8="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z";var u8="M2 12C2 16.97 6.03 21 11 21C13.39 21 15.68 20.06 17.4 18.4L15.9 16.9C14.63 18.25 12.86 19 11 19C4.76 19 1.64 11.46 6.05 7.05C10.46 2.64 18 5.77 18 12H15L19 16H19.1L23 12H20C20 7.03 15.97 3 11 3C6.03 3 2 7.03 2 12Z";var c8="M12,0C8.96,0 6.21,1.23 4.22,3.22L5.63,4.63C7.26,3 9.5,2 12,2C14.5,2 16.74,3 18.36,4.64L19.77,3.23C17.79,1.23 15.04,0 12,0M7.05,6.05L8.46,7.46C9.37,6.56 10.62,6 12,6C13.38,6 14.63,6.56 15.54,7.46L16.95,6.05C15.68,4.78 13.93,4 12,4C10.07,4 8.32,4.78 7.05,6.05M12,15A2,2 0 0,1 10,13A2,2 0 0,1 12,11A2,2 0 0,1 14,13A2,2 0 0,1 12,15M15,9H9A1,1 0 0,0 8,10V22A1,1 0 0,0 9,23H15A1,1 0 0,0 16,22V10A1,1 0 0,0 15,9Z";var v8="M2,5.27L3.28,4L21,21.72L19.73,23L16,19.27V22A1,1 0 0,1 15,23H9C8.46,23 8,22.55 8,22V11.27L2,5.27M12,0C15.05,0 17.8,1.23 19.77,3.23L18.36,4.64C16.75,3 14.5,2 12,2C9.72,2 7.64,2.85 6.06,4.24L4.64,2.82C6.59,1.07 9.17,0 12,0M12,4C13.94,4 15.69,4.78 16.95,6.05L15.55,7.46C14.64,6.56 13.39,6 12,6C10.83,6 9.76,6.4 8.9,7.08L7.5,5.66C8.7,4.62 10.28,4 12,4M15,9C15.56,9 16,9.45 16,10V14.18L13.5,11.69L13.31,11.5L10.82,9H15M10.03,13.3C10.16,14.16 10.84,14.85 11.71,15L10.03,13.3Z",x8="M9,2C7.89,2 7,2.89 7,4V20C7,21.11 7.89,22 9,22H15C16.11,22 17,21.11 17,20V4C17,2.89 16.11,2 15,2H13V4H11V2H9M11,6H13V8H15V10H13V12H11V10H9V8H11V6M9,14H11V16H9V14M13,14H15V16H13V14M9,18H11V20H9V18M13,18H15V20H13V18Z";var h8="M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z";var Z8="M13,15V9H12L10,10V11H11.5V15M17,17H7V14L3,18L7,22V19H19V13H17M7,7H17V10L21,6L17,2V5H5V11H7V7Z";var S8="M11.5,12L20,18V6M11,18V6L2.5,12L11,18Z";var g8="M10,9.9L7,12L10,14.1V9.9M19,9.9L16,12L19,14.1V9.9M12,6V18L3.5,12L12,6M21,6V18L12.5,12L21,6Z",f8="M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2Z";var b8="M12 2C11.5 2 11 2.19 10.59 2.59L2.59 10.59C1.8 11.37 1.8 12.63 2.59 13.41L10.59 21.41C11.37 22.2 12.63 22.2 13.41 21.41L21.41 13.41C22.2 12.63 22.2 11.37 21.41 10.59L13.41 2.59C13 2.19 12.5 2 12 2M12 4L20 12L12 20L4 12Z";var y8="M12,2A2,2 0 0,1 14,4C14,4.74 13.6,5.39 13,5.73V7H14A7,7 0 0,1 21,14H22A1,1 0 0,1 23,15V18A1,1 0 0,1 22,19H21V20A2,2 0 0,1 19,22H5A2,2 0 0,1 3,20V19H2A1,1 0 0,1 1,18V15A1,1 0 0,1 2,14H3A7,7 0 0,1 10,7H11V5.73C10.4,5.39 10,4.74 10,4A2,2 0 0,1 12,2M7.5,13A2.5,2.5 0 0,0 5,15.5A2.5,2.5 0 0,0 7.5,18A2.5,2.5 0 0,0 10,15.5A2.5,2.5 0 0,0 7.5,13M16.5,13A2.5,2.5 0 0,0 14,15.5A2.5,2.5 0 0,0 16.5,18A2.5,2.5 0 0,0 19,15.5A2.5,2.5 0 0,0 16.5,13Z";var w8="M12,2C14.65,2 17.19,3.06 19.07,4.93L17.65,6.35C16.15,4.85 14.12,4 12,4C9.88,4 7.84,4.84 6.35,6.35L4.93,4.93C6.81,3.06 9.35,2 12,2M3.66,6.5L5.11,7.94C4.39,9.17 4,10.57 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12C20,10.57 19.61,9.17 18.88,7.94L20.34,6.5C21.42,8.12 22,10.04 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12C2,10.04 2.58,8.12 3.66,6.5M12,6A6,6 0 0,1 18,12C18,13.59 17.37,15.12 16.24,16.24L14.83,14.83C14.08,15.58 13.06,16 12,16C10.94,16 9.92,15.58 9.17,14.83L7.76,16.24C6.63,15.12 6,13.59 6,12A6,6 0 0,1 12,6M12,8A1,1 0 0,0 11,9A1,1 0 0,0 12,10A1,1 0 0,0 13,9A1,1 0 0,0 12,8Z";var O8="M5,3A2,2 0 0,0 3,5V7H5V5H19V7H21V5A2,2 0 0,0 19,3H5M8,7V9H16V7H8M3,9V12A9,9 0 0,0 12,21A9,9 0 0,0 21,12V9H19V12A7,7 0 0,1 12,19A7,7 0 0,1 5,12V9H3M12,12A2.5,2.5 0 0,0 9.5,14.5A2.5,2.5 0 0,0 12,17A2.5,2.5 0 0,0 14.5,14.5A2.5,2.5 0 0,0 12,12Z";var k8="M20.2,5.9L21,5.1C19.6,3.7 17.8,3 16,3C14.2,3 12.4,3.7 11,5.1L11.8,5.9C13,4.8 14.5,4.2 16,4.2C17.5,4.2 19,4.8 20.2,5.9M19.3,6.7C18.4,5.8 17.2,5.3 16,5.3C14.8,5.3 13.6,5.8 12.7,6.7L13.5,7.5C14.2,6.8 15.1,6.5 16,6.5C16.9,6.5 17.8,6.8 18.5,7.5L19.3,6.7M19,13H17V9H15V13H5A2,2 0 0,0 3,15V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V15A2,2 0 0,0 19,13M8,18H6V16H8V18M11.5,18H9.5V16H11.5V18M15,18H13V16H15V18Z";var _8="M13.5,5.5C14.59,5.5 15.5,4.58 15.5,3.5C15.5,2.38 14.59,1.5 13.5,1.5C12.39,1.5 11.5,2.38 11.5,3.5C11.5,4.58 12.39,5.5 13.5,5.5M9.89,19.38L10.89,15L13,17V23H15V15.5L12.89,13.5L13.5,10.5C14.79,12 16.79,13 19,13V11C17.09,11 15.5,10 14.69,8.58L13.69,7C13.29,6.38 12.69,6 12,6C11.69,6 11.5,6.08 11.19,6.08L6,8.28V13H8V9.58L9.79,8.88L8.19,17L3.29,16L2.89,18L9.89,19.38Z";var T8="M4,18V21H7V18H17V21H20V15H4V18M19,10H22V13H19V10M2,10H5V13H2V10M17,13H7V5A2,2 0 0,1 9,3H15A2,2 0 0,1 17,5V13Z";var R8="M15,5V12H9V5H15M15,3H9A2,2 0 0,0 7,5V14H17V5A2,2 0 0,0 15,3M22,10H19V13H22V10M5,10H2V13H5V10M20,15H4V21H6V17H18V21H20V15Z";var P8="M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M5,3V5H7V3H5M5,11V13H7V11H5M5,19V21H7V19H5Z";var B8="M11,13.5V21.5H3V13.5H11M9,15.5H5V19.5H9V15.5M12,2L17.5,11H6.5L12,2M12,5.86L10.08,9H13.92L12,5.86M17.5,13C20,13 22,15 22,17.5C22,20 20,22 17.5,22C15,22 13,20 13,17.5C13,15 15,13 17.5,13M17.5,15A2.5,2.5 0 0,0 15,17.5A2.5,2.5 0 0,0 17.5,20A2.5,2.5 0 0,0 20,17.5A2.5,2.5 0 0,0 17.5,15Z";var D8="M10,17L6,13L7.41,11.59L10,14.17L16.59,7.58L18,9M12,1L3,5V11C3,16.55 6.84,21.74 12,23C17.16,21.74 21,16.55 21,11V5L12,1Z";var F8="M11,13H13V16H16V11H18L12,6L6,11H8V16H11V13M12,1L21,5V11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1Z",E8="M21,11C21,16.55 17.16,21.74 12,23C6.84,21.74 3,16.55 3,11V5L12,1L21,5V11M12,21C15.75,20 19,15.54 19,11.22V6.3L12,3.18L5,6.3V11.22C5,15.54 8.25,20 12,21M11,14H13V17H16V12H18L12,7L6,12H8V17H11V14";var N8="M14.83,13.41L13.42,14.82L16.55,17.95L14.5,20H20V14.5L17.96,16.54L14.83,13.41M14.5,4L16.54,6.04L4,18.59L5.41,20L17.96,7.46L20,9.5V4M10.59,9.17L5.41,4L4,5.41L9.17,10.58L10.59,9.17Z";var $8="M11,9H9V2H7V9H5V2H3V9C3,11.12 4.66,12.84 6.75,12.97V22H9.25V12.97C11.34,12.84 13,11.12 13,9V2H11V9M16,6V14H18.5V22H21V2C18.24,2 16,4.24 16,6Z";var I8="M20,5V19L13,12M6,5V19H4V5M13,5V19L6,12";var U8="M4,5V19L11,12M18,5V19H20V5M11,5V19L18,12";var W8="M16,18H18V6H16M6,18L14.5,12L6,6V18Z";var G8="M6,18V6H8V18H6M9.5,12L18,6V18L9.5,12Z";var z8="M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M15,16H9V14L12.39,10H9V8H15V10L11.62,14H15V16M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z",q8="M2,5.27L3.28,4L20,20.72L18.73,22L12.73,16H9V14L9.79,13.06L2,5.27M23,12H17V10L20.39,6H17V4H23V6L19.62,10H23V12M9.82,8H15V10L13.54,11.72L9.82,8M7,20H1V18L4.39,14H1V12H7V14L3.62,18H7V20Z";var K8="M20.79,13.95L18.46,14.57L16.46,13.44V10.56L18.46,9.43L20.79,10.05L21.31,8.12L19.54,7.65L20,5.88L18.07,5.36L17.45,7.69L15.45,8.82L13,7.38V5.12L14.71,3.41L13.29,2L12,3.29L10.71,2L9.29,3.41L11,5.12V7.38L8.5,8.82L6.5,7.69L5.92,5.36L4,5.88L4.47,7.65L2.7,8.12L3.22,10.05L5.55,9.43L7.55,10.56V13.45L5.55,14.58L3.22,13.96L2.7,15.89L4.47,16.36L4,18.12L5.93,18.64L6.55,16.31L8.55,15.18L11,16.62V18.88L9.29,20.59L10.71,22L12,20.71L13.29,22L14.7,20.59L13,18.88V16.62L15.5,15.17L17.5,16.3L18.12,18.63L20,18.12L19.53,16.35L21.3,15.88L20.79,13.95M9.5,10.56L12,9.11L14.5,10.56V13.44L12,14.89L9.5,13.44V10.56Z";var Q8="M12.5 7C12.5 5.89 13.39 5 14.5 5H18C19.1 5 20 5.9 20 7V9.16C18.84 9.57 18 10.67 18 11.97V14H12.5V7M6 11.96V14H11.5V7C11.5 5.89 10.61 5 9.5 5H6C4.9 5 4 5.9 4 7V9.15C5.16 9.56 6 10.67 6 11.96M20.66 10.03C19.68 10.19 19 11.12 19 12.12V15H5V12C5 10.9 4.11 10 3 10S1 10.9 1 12V17C1 18.1 1.9 19 3 19V21H5V19H19V21H21V19C22.1 19 23 18.1 23 17V12C23 10.79 21.91 9.82 20.66 10.03Z",j8="M21 9V7C21 5.35 19.65 4 18 4H14C13.23 4 12.53 4.3 12 4.78C11.47 4.3 10.77 4 10 4H6C4.35 4 3 5.35 3 7V9C1.35 9 0 10.35 0 12V17C0 18.65 1.35 20 3 20V22H5V20H19V22H21V20C22.65 20 24 18.65 24 17V12C24 10.35 22.65 9 21 9M14 6H18C18.55 6 19 6.45 19 7V9.78C18.39 10.33 18 11.12 18 12V14H13V7C13 6.45 13.45 6 14 6M5 7C5 6.45 5.45 6 6 6H10C10.55 6 11 6.45 11 7V14H6V12C6 11.12 5.61 10.33 5 9.78V7M22 17C22 17.55 21.55 18 21 18H3C2.45 18 2 17.55 2 17V12C2 11.45 2.45 11 3 11S4 11.45 4 12V16H20V12C20 11.45 20.45 11 21 11S22 11.45 22 12V17Z";var X8="M9.5,4.27C10.88,4.53 12.9,5.14 14,5.5C16.75,6.45 17.69,7.63 17.69,10.29C17.69,12.89 16.09,13.87 14.05,12.89V8.05C14.05,7.5 13.95,6.97 13.41,6.82C13,6.69 12.76,7.07 12.76,7.63V19.73L9.5,18.69V4.27M13.37,17.62L18.62,15.75C19.22,15.54 19.31,15.24 18.83,15.08C18.34,14.92 17.47,14.97 16.87,15.18L13.37,16.41V14.45L13.58,14.38C13.58,14.38 14.59,14 16,13.87C17.43,13.71 19.17,13.89 20.53,14.4C22.07,14.89 22.25,15.61 21.86,16.1C21.46,16.6 20.5,16.95 20.5,16.95L13.37,19.5V17.62M3.5,17.42C1.93,17 1.66,16.05 2.38,15.5C3.05,15 4.18,14.65 4.18,14.65L8.86,13V14.88L5.5,16.09C4.9,16.3 4.81,16.6 5.29,16.76C5.77,16.92 6.65,16.88 7.24,16.66L8.86,16.08V17.77L8.54,17.83C6.92,18.09 5.2,18 3.5,17.42Z",Y8="M18 21L14 17H17V7H14L18 3L22 7H19V17H22M2 19V17H12V19M2 13V11H9V13M2 7V5H6V7H2Z";var J8="M4 8C2.9 8 2 8.9 2 10V14C2 15.11 2.9 16 4 16H20C21.11 16 22 15.11 22 14V10C22 8.9 21.11 8 20 8M9 10C10.11 10 11 10.9 11 12C11 13.11 10.11 14 9 14C7.9 14 7 13.11 7 12C7 10.9 7.9 10 9 10M15 10C16.11 10 17 10.9 17 12C17 13.11 16.11 14 15 14C13.9 14 13 13.11 13 12C13 10.9 13.9 10 15 10M5 11C5.55 11 6 11.45 6 12C6 12.55 5.55 13 5 13C4.45 13 4 12.55 4 12C4 11.45 4.45 11 5 11M9 11C8.45 11 8 11.45 8 12C8 12.55 8.45 13 9 13C9.55 13 10 12.55 10 12C10 11.45 9.55 11 9 11M15 11C14.45 11 14 11.45 14 12C14 12.55 14.45 13 15 13C15.55 13 16 12.55 16 12C16 11.45 15.55 11 15 11M19 11C19.55 11 20 11.45 20 12C20 12.55 19.55 13 19 13C18.45 13 18 12.55 18 12C18 11.45 18.45 11 19 11Z";var CC="M12,12A3,3 0 0,0 9,15A3,3 0 0,0 12,18A3,3 0 0,0 15,15A3,3 0 0,0 12,12M12,20A5,5 0 0,1 7,15A5,5 0 0,1 12,10A5,5 0 0,1 17,15A5,5 0 0,1 12,20M12,4A2,2 0 0,1 14,6A2,2 0 0,1 12,8C10.89,8 10,7.1 10,6C10,4.89 10.89,4 12,4M17,2H7C5.89,2 5,2.89 5,4V20A2,2 0 0,0 7,22H17A2,2 0 0,0 19,20V4C19,2.89 18.1,2 17,2Z";var HC="M2,5.27L3.28,4L21,21.72L19.73,23L18.27,21.54C17.93,21.83 17.5,22 17,22H7C5.89,22 5,21.1 5,20V8.27L2,5.27M12,18A3,3 0 0,1 9,15C9,14.24 9.28,13.54 9.75,13L8.33,11.6C7.5,12.5 7,13.69 7,15A5,5 0 0,0 12,20C13.31,20 14.5,19.5 15.4,18.67L14,17.25C13.45,17.72 12.76,18 12,18M17,15A5,5 0 0,0 12,10H11.82L5.12,3.3C5.41,2.54 6.14,2 7,2H17A2,2 0 0,1 19,4V17.18L17,15.17V15M12,4C10.89,4 10,4.89 10,6A2,2 0 0,0 12,8A2,2 0 0,0 14,6C14,4.89 13.1,4 12,4Z";var VC="M20.07,19.07L18.66,17.66C20.11,16.22 21,14.21 21,12C21,9.78 20.11,7.78 18.66,6.34L20.07,4.93C21.88,6.74 23,9.24 23,12C23,14.76 21.88,17.26 20.07,19.07M17.24,16.24L15.83,14.83C16.55,14.11 17,13.11 17,12C17,10.89 16.55,9.89 15.83,9.17L17.24,7.76C18.33,8.85 19,10.35 19,12C19,13.65 18.33,15.15 17.24,16.24M4,3H12A2,2 0 0,1 14,5V19A2,2 0 0,1 12,21H4A2,2 0 0,1 2,19V5A2,2 0 0,1 4,3M8,5A2,2 0 0,0 6,7A2,2 0 0,0 8,9A2,2 0 0,0 10,7A2,2 0 0,0 8,5M8,11A4,4 0 0,0 4,15A4,4 0 0,0 8,19A4,4 0 0,0 12,15A4,4 0 0,0 8,11M8,13A2,2 0 0,1 10,15A2,2 0 0,1 8,17A2,2 0 0,1 6,15A2,2 0 0,1 8,13Z";var eC="M17.9,10.9C14.7,9 9.35,8.8 6.3,9.75C5.8,9.9 5.3,9.6 5.15,9.15C5,8.65 5.3,8.15 5.75,8C9.3,6.95 15.15,7.15 18.85,9.35C19.3,9.6 19.45,10.2 19.2,10.65C18.95,11 18.35,11.15 17.9,10.9M17.8,13.7C17.55,14.05 17.1,14.2 16.75,13.95C14.05,12.3 9.95,11.8 6.8,12.8C6.4,12.9 5.95,12.7 5.85,12.3C5.75,11.9 5.95,11.45 6.35,11.35C10,10.25 14.5,10.8 17.6,12.7C17.9,12.85 18.05,13.35 17.8,13.7M16.6,16.45C16.4,16.75 16.05,16.85 15.75,16.65C13.4,15.2 10.45,14.9 6.95,15.7C6.6,15.8 6.3,15.55 6.2,15.25C6.1,14.9 6.35,14.6 6.65,14.5C10.45,13.65 13.75,14 16.35,15.6C16.7,15.75 16.75,16.15 16.6,16.45M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2Z";var LC="M3,3V21H21V3";var rC="M3,3H21V21H3V3M5,5V19H19V5H5Z";var tC="M12,17.27L18.18,21L16.54,13.97L22,9.24L14.81,8.62L12,2L9.19,8.62L2,9.24L7.45,13.97L5.82,21L12,17.27Z";var iC="M12,15.39L8.24,17.66L9.23,13.38L5.91,10.5L10.29,10.13L12,6.09L13.71,10.13L18.09,10.5L14.77,13.38L15.76,17.66M22,9.24L14.81,8.63L12,2L9.19,8.63L2,9.24L7.45,13.97L5.82,21L12,17.27L18.18,21L16.54,13.97L22,9.24Z";var oC="M18,18H6V6H18V18Z",MC="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M9,9H15V15H9",aC="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4M9,9V15H15V9";var nC="M6,14H8L11,17H9L6,14M4,4H5V3A1,1 0 0,1 6,2H10A1,1 0 0,1 11,3V4H13V3A1,1 0 0,1 14,2H18A1,1 0 0,1 19,3V4H20A2,2 0 0,1 22,6V19A2,2 0 0,1 20,21V22H17V21H7V22H4V21A2,2 0 0,1 2,19V6A2,2 0 0,1 4,4M18,7A1,1 0 0,1 19,8A1,1 0 0,1 18,9A1,1 0 0,1 17,8A1,1 0 0,1 18,7M14,7A1,1 0 0,1 15,8A1,1 0 0,1 14,9A1,1 0 0,1 13,8A1,1 0 0,1 14,7M20,6H4V10H20V6M4,19H20V12H4V19M6,7A1,1 0 0,1 7,8A1,1 0 0,1 6,9A1,1 0 0,1 5,8A1,1 0 0,1 6,7M13,14H15L18,17H16L13,14Z";var dC="M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M4,12H8V14H4V12M14,18H4V16H14V18M20,18H16V16H20V18M20,14H10V12H20V14Z",AC="M20,4A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4H20M20,18V6H4V18H20M6,10H8V12H6V10M6,14H14V16H6V14M16,14H18V16H16V14M10,10H18V12H10V10Z";var sC="M20,4H4A2,2 0 0,0 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V6A2,2 0 0,0 20,4M7.76,16.24L6.35,17.65C4.78,16.1 4,14.05 4,12C4,9.95 4.78,7.9 6.34,6.34L7.75,7.75C6.59,8.93 6,10.46 6,12C6,13.54 6.59,15.07 7.76,16.24M12,16A4,4 0 0,1 8,12A4,4 0 0,1 12,8A4,4 0 0,1 16,12A4,4 0 0,1 12,16M17.66,17.66L16.25,16.25C17.41,15.07 18,13.54 18,12C18,10.46 17.41,8.93 16.24,7.76L17.65,6.35C19.22,7.9 20,9.95 20,12C20,14.05 19.22,16.1 17.66,17.66M12,10A2,2 0 0,0 10,12A2,2 0 0,0 12,14A2,2 0 0,0 14,12A2,2 0 0,0 12,10Z";var lC="M12,18A6,6 0 0,1 6,12C6,11 6.25,10.03 6.7,9.2L5.24,7.74C4.46,8.97 4,10.43 4,12A8,8 0 0,0 12,20V23L16,19L12,15M12,4V1L8,5L12,9V6A6,6 0 0,1 18,12C18,13 17.75,13.97 17.3,14.8L18.76,16.26C19.54,15.03 20,13.57 20,12A8,8 0 0,0 12,4Z";var mC="M19,18H5V6H19M21,4H3C1.89,4 1,4.89 1,6V18A2,2 0 0,0 3,20H21A2,2 0 0,0 23,18V6C23,4.89 22.1,4 21,4Z";var pC="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z";var uC="M8.16,3L6.75,4.41L9.34,7H4C2.89,7 2,7.89 2,9V19C2,20.11 2.89,21 4,21H20C21.11,21 22,20.11 22,19V9C22,7.89 21.11,7 20,7H14.66L17.25,4.41L15.84,3L12,6.84L8.16,3M4,9H17V19H4V9M19.5,9A1,1 0 0,1 20.5,10A1,1 0 0,1 19.5,11A1,1 0 0,1 18.5,10A1,1 0 0,1 19.5,9M19.5,12A1,1 0 0,1 20.5,13A1,1 0 0,1 19.5,14A1,1 0 0,1 18.5,13A1,1 0 0,1 19.5,12Z";var cC="M21,17V5H3V17H21M21,3A2,2 0 0,1 23,5V17A2,2 0 0,1 21,19H16V21H8V19H3A2,2 0 0,1 1,17V5A2,2 0 0,1 3,3H21M5,7H11V11H5V7M5,13H11V15H5V13M13,7H19V9H13V7M13,11H19V15H13V11Z",vC="M0.5,2.77L1.78,1.5L21,20.72L19.73,22L16.73,19H16V21H8V19H3A2,2 0 0,1 1,17V5C1,4.5 1.17,4.07 1.46,3.73L0.5,2.77M21,17V5H7.82L5.82,3H21A2,2 0 0,1 23,5V17C23,17.85 22.45,18.59 21.7,18.87L19.82,17H21M3,17H14.73L3,5.27V17Z";var xC="M21,3H3C1.89,3 1,3.89 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5C23,3.89 22.1,3 21,3M21,17H3V5H21M16,11L9,15V7";var hC="M21,6V8H3V6H21M3,18H12V16H3V18M3,13H21V11H3V13Z";var ZC="M15 13V5A3 3 0 0 0 9 5V13A5 5 0 1 0 15 13M12 4A1 1 0 0 1 13 5V8H11V5A1 1 0 0 1 12 4Z";var SC="M16.95,16.95L14.83,14.83C15.55,14.1 16,13.1 16,12C16,11.26 15.79,10.57 15.43,10L17.6,7.81C18.5,9 19,10.43 19,12C19,13.93 18.22,15.68 16.95,16.95M12,5C13.57,5 15,5.5 16.19,6.4L14,8.56C13.43,8.21 12.74,8 12,8A4,4 0 0,0 8,12C8,13.1 8.45,14.1 9.17,14.83L7.05,16.95C5.78,15.68 5,13.93 5,12A7,7 0 0,1 12,5M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12C22,6.47 17.5,2 12,2Z";var gC="M19.03 7.39L20.45 5.97C20 5.46 19.55 5 19.04 4.56L17.62 6C16.07 4.74 14.12 4 12 4C7.03 4 3 8.03 3 13S7.03 22 12 22C17 22 21 17.97 21 13C21 10.88 20.26 8.93 19.03 7.39M13 14H11V7H13V14M15 1H9V3H15V1Z";var fC="M12,20A7,7 0 0,1 5,13A7,7 0 0,1 12,6A7,7 0 0,1 19,13A7,7 0 0,1 12,20M19.03,7.39L20.45,5.97C20,5.46 19.55,5 19.04,4.56L17.62,6C16.07,4.74 14.12,4 12,4A9,9 0 0,0 3,13A9,9 0 0,0 12,22C17,22 21,17.97 21,13C21,10.88 20.26,8.93 19.03,7.39M11,14H13V8H11M15,1H9V3H15V1Z";var bC="M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M17,15A3,3 0 0,1 14,12A3,3 0 0,1 17,9A3,3 0 0,1 20,12A3,3 0 0,1 17,15Z",yC="M17,7H7A5,5 0 0,0 2,12A5,5 0 0,0 7,17H17A5,5 0 0,0 22,12A5,5 0 0,0 17,7M7,15A3,3 0 0,1 4,12A3,3 0 0,1 7,9A3,3 0 0,1 10,12A3,3 0 0,1 7,15Z";var wC="M12.87,15.07L10.33,12.56L10.36,12.53C12.1,10.59 13.34,8.36 14.07,6H17V4H10V2H8V4H1V6H12.17C11.5,7.92 10.44,9.75 9,11.35C8.07,10.32 7.3,9.19 6.69,8H4.69C5.42,9.63 6.42,11.17 7.67,12.56L2.58,17.58L4,19L9,14L12.11,17.11L12.87,15.07M18.5,10H16.5L12,22H14L15.12,19H19.87L21,22H23L18.5,10M15.88,17L17.5,12.67L19.12,17H15.88Z";var OC="M1,21H23L12,2";var kC="M12,2L1,21H23M12,6L19.53,19H4.47";var _C="M3,17V19H9V17H3M3,5V7H13V5H3M13,21V19H21V17H13V15H11V21H13M7,9V11H3V13H7V15H9V9H7M21,13V11H11V13H21M15,9H17V7H21V5H17V3H15V9Z";var TC="M7 3H5V9H7V3M19 3H17V13H19V3M3 13H5V21H7V13H9V11H3V13M15 7H13V3H11V7H9V9H15V7M11 21H13V11H11V21M15 15V17H17V21H19V17H21V15H15Z";var RC="M11.64 5.93H13.07V10.21H11.64M15.57 5.93H17V10.21H15.57M7 2L3.43 5.57V18.43H7.71V22L11.29 18.43H14.14L20.57 12V2M19.14 11.29L16.29 14.14H13.43L10.93 16.64V14.14H7.71V3.43H19.14Z";var PC="M12,2A9,9 0 0,1 21,11H13V19A3,3 0 0,1 10,22A3,3 0 0,1 7,19V18H9V19A1,1 0 0,0 10,20A1,1 0 0,0 11,19V11H3A9,9 0 0,1 12,2Z";var BC="M12.5,8C9.85,8 7.45,9 5.6,10.6L2,7V16H11L7.38,12.38C8.77,11.22 10.54,10.5 12.5,10.5C16.04,10.5 19.05,12.81 20.1,16L22.47,15.22C21.08,11.03 17.15,8 12.5,8Z";var DC="M15,7V11H16V13H13V5H15L12,1L9,5H11V13H8V10.93C8.7,10.56 9.2,9.85 9.2,9C9.2,7.78 8.21,6.8 7,6.8C5.78,6.8 4.8,7.78 4.8,9C4.8,9.85 5.3,10.56 6,10.93V13A2,2 0 0,0 8,15H11V18.05C10.29,18.41 9.8,19.15 9.8,20A2.2,2.2 0 0,0 12,22.2A2.2,2.2 0 0,0 14.2,20C14.2,19.15 13.71,18.41 13,18.05V15H16A2,2 0 0,0 18,13V11H19V7H15Z";var FC="M17,10.5V7A1,1 0 0,0 16,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16A1,1 0 0,0 17,17V13.5L21,17.5V6.5L17,10.5Z";var EC="M12,5A7,7 0 0,0 5,12H7A5,5 0 0,1 12,7A5,5 0 0,1 17,12H19A7,7 0 0,0 12,5M13,14.29C13.88,13.9 14.5,13.03 14.5,12A2.5,2.5 0 0,0 12,9.5A2.5,2.5 0 0,0 9.5,12C9.5,13 10.12,13.9 11,14.29V17.59L7.59,21L9,22.41L12,19.41L15,22.41L16.41,21L13,17.59V14.29M12,1A11,11 0 0,0 1,12H3A9,9 0 0,1 12,3A9,9 0 0,1 21,12H23A11,11 0 0,0 12,1Z",NC="M5,2A1,1 0 0,0 4,1A1,1 0 0,0 3,2V6H1V12H7V6H5V2M9,16C9,17.3 9.84,18.4 11,18.82V23H13V18.82C14.16,18.41 15,17.31 15,16V14H9V16M1,16C1,17.3 1.84,18.4 3,18.82V23H5V18.82C6.16,18.4 7,17.3 7,16V14H1V16M21,6V2A1,1 0 0,0 20,1A1,1 0 0,0 19,2V6H17V12H23V6H21M13,2A1,1 0 0,0 12,1A1,1 0 0,0 11,2V6H9V12H15V6H13V2M17,16C17,17.3 17.84,18.4 19,18.82V23H21V18.82C22.16,18.41 23,17.31 23,16V14H17V16Z",$C="M18,7V4A2,2 0 0,0 16,2H8A2,2 0 0,0 6,4V7H5V13L8,19V22H16V19L19,13V7H18M8,4H16V7H14V5H13V7H11V5H10V7H8V4Z";var IC="M8,11.5A1.5,1.5 0 0,0 6.5,10A1.5,1.5 0 0,0 5,11.5A1.5,1.5 0 0,0 6.5,13A1.5,1.5 0 0,0 8,11.5M15,6.5A1.5,1.5 0 0,0 13.5,5H10.5A1.5,1.5 0 0,0 9,6.5A1.5,1.5 0 0,0 10.5,8H13.5A1.5,1.5 0 0,0 15,6.5M8.5,15A1.5,1.5 0 0,0 7,16.5A1.5,1.5 0 0,0 8.5,18A1.5,1.5 0 0,0 10,16.5A1.5,1.5 0 0,0 8.5,15M12,1A11,11 0 0,0 1,12A11,11 0 0,0 12,23A11,11 0 0,0 23,12A11,11 0 0,0 12,1M12,21C7.04,21 3,16.96 3,12C3,7.04 7.04,3 12,3C16.96,3 21,7.04 21,12C21,16.96 16.96,21 12,21M17.5,10A1.5,1.5 0 0,0 16,11.5A1.5,1.5 0 0,0 17.5,13A1.5,1.5 0 0,0 19,11.5A1.5,1.5 0 0,0 17.5,10M15.5,15A1.5,1.5 0 0,0 14,16.5A1.5,1.5 0 0,0 15.5,18A1.5,1.5 0 0,0 17,16.5A1.5,1.5 0 0,0 15.5,15Z";var UC="M3.27,2L2,3.27L4.73,6H4A1,1 0 0,0 3,7V17A1,1 0 0,0 4,18H16C16.2,18 16.39,17.92 16.54,17.82L19.73,21L21,19.73M21,6.5L17,10.5V7A1,1 0 0,0 16,6H9.82L21,17.18V6.5Z";var WC="M18,14.5V11A1,1 0 0,0 17,10H16C18.24,8.39 18.76,5.27 17.15,3C15.54,0.78 12.42,0.26 10.17,1.87C9.5,2.35 8.96,3 8.6,3.73C6.25,2.28 3.17,3 1.72,5.37C0.28,7.72 1,10.8 3.36,12.25C3.57,12.37 3.78,12.5 4,12.58V21A1,1 0 0,0 5,22H17A1,1 0 0,0 18,21V17.5L22,21.5V10.5L18,14.5M13,4A2,2 0 0,1 15,6A2,2 0 0,1 13,8A2,2 0 0,1 11,6A2,2 0 0,1 13,4M6,6A2,2 0 0,1 8,8A2,2 0 0,1 6,10A2,2 0 0,1 4,8A2,2 0 0,1 6,6Z";var GC="M14,3.23V5.29C16.89,6.15 19,8.83 19,12C19,15.17 16.89,17.84 14,18.7V20.77C18,19.86 21,16.28 21,12C21,7.72 18,4.14 14,3.23M16.5,12C16.5,10.23 15.5,8.71 14,7.97V16C15.5,15.29 16.5,13.76 16.5,12M3,9V15H7L12,20V4L7,9H3Z",zC="M7,9V15H11L16,20V4L11,9H7Z",qC="M5,9V15H9L14,20V4L9,9M18.5,12C18.5,10.23 17.5,8.71 16,7.97V16C17.5,15.29 18.5,13.76 18.5,12Z",KC="M3,9H7L12,4V20L7,15H3V9M14,11H22V13H14V11Z",QC="M3,9H7L12,4V20L7,15H3V9M16.59,12L14,9.41L15.41,8L18,10.59L20.59,8L22,9.41L19.41,12L22,14.59L20.59,16L18,13.41L15.41,16L14,14.59L16.59,12Z",jC="M12,4L9.91,6.09L12,8.18M4.27,3L3,4.27L7.73,9H3V15H7L12,20V13.27L16.25,17.53C15.58,18.04 14.83,18.46 14,18.7V20.77C15.38,20.45 16.63,19.82 17.68,18.96L19.73,21L21,19.73L12,10.73M19,12C19,12.94 18.8,13.82 18.46,14.64L19.97,16.15C20.62,14.91 21,13.5 21,12C21,7.72 18,4.14 14,3.23V5.29C16.89,6.15 19,8.83 19,12M16.5,12C16.5,10.23 15.5,8.71 14,7.97V10.18L16.45,12.63C16.5,12.43 16.5,12.21 16.5,12Z",XC="M3,9H7L12,4V20L7,15H3V9M14,11H17V8H19V11H22V13H19V16H17V13H14V11Z";var YC="M5.64,3.64L21.36,19.36L19.95,20.78L16,16.83V20L11,15H7V9H8.17L4.22,5.05L5.64,3.64M16,4V11.17L12.41,7.58L16,4Z";var JC="M14.12,10H19V8.2H15.38L13.38,4.87C13.08,4.37 12.54,4.03 11.92,4.03C11.74,4.03 11.58,4.06 11.42,4.11L6,5.8V11H7.8V7.33L9.91,6.67L6,22H7.8L10.67,13.89L13,17V22H14.8V15.59L12.31,11.05L13.04,8.18M14,3.8C15,3.8 15.8,3 15.8,2C15.8,1 15,0.2 14,0.2C13,0.2 12.2,1 12.2,2C12.2,3 13,3.8 14,3.8Z";var CH="M14.83,11.17C16.39,12.73 16.39,15.27 14.83,16.83C13.27,18.39 10.73,18.39 9.17,16.83L14.83,11.17M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2M7,4A1,1 0 0,0 6,5A1,1 0 0,0 7,6A1,1 0 0,0 8,5A1,1 0 0,0 7,4M10,4A1,1 0 0,0 9,5A1,1 0 0,0 10,6A1,1 0 0,0 11,5A1,1 0 0,0 10,4M12,8A6,6 0 0,0 6,14A6,6 0 0,0 12,20A6,6 0 0,0 18,14A6,6 0 0,0 12,8Z";var HH="M12,20A6,6 0 0,1 6,14C6,10 12,3.25 12,3.25C12,3.25 18,10 18,14A6,6 0 0,1 12,20Z";var VH="M20.84 22.73L16.29 18.18C15.2 19.3 13.69 20 12 20C8.69 20 6 17.31 6 14C6 12.67 6.67 11.03 7.55 9.44L1.11 3L2.39 1.73L22.11 21.46L20.84 22.73M18 14C18 10 12 3.25 12 3.25S10.84 4.55 9.55 6.35L17.95 14.75C18 14.5 18 14.25 18 14Z";var eH="M6,19A5,5 0 0,1 1,14A5,5 0 0,1 6,9C7,6.65 9.3,5 12,5C15.43,5 18.24,7.66 18.5,11.03L19,11A4,4 0 0,1 23,15A4,4 0 0,1 19,19H6M19,13H17V12A5,5 0 0,0 12,7C9.5,7 7.45,8.82 7.06,11.19C6.73,11.07 6.37,11 6,11A3,3 0 0,0 3,14A3,3 0 0,0 6,17H19A2,2 0 0,0 21,15A2,2 0 0,0 19,13Z";var LH="M17.75,4.09L15.22,6.03L16.13,9.09L13.5,7.28L10.87,9.09L11.78,6.03L9.25,4.09L12.44,4L13.5,1L14.56,4L17.75,4.09M21.25,11L19.61,12.25L20.2,14.23L18.5,13.06L16.8,14.23L17.39,12.25L15.75,11L17.81,10.95L18.5,9L19.19,10.95L21.25,11M18.97,15.95C19.8,15.87 20.69,17.05 20.16,17.8C19.84,18.25 19.5,18.67 19.08,19.07C15.17,23 8.84,23 4.94,19.07C1.03,15.17 1.03,8.83 4.94,4.93C5.34,4.53 5.76,4.17 6.21,3.85C6.96,3.32 8.14,4.21 8.06,5.04C7.79,7.9 8.75,10.87 10.95,13.06C13.14,15.26 16.1,16.22 18.97,15.95M17.33,17.97C14.5,17.81 11.7,16.64 9.53,14.5C7.36,12.31 6.2,9.5 6.04,6.68C3.23,9.82 3.34,14.64 6.35,17.66C9.37,20.67 14.19,20.78 17.33,17.97Z";var rH="M6,14.03A1,1 0 0,1 7,15.03C7,15.58 6.55,16.03 6,16.03C3.24,16.03 1,13.79 1,11.03C1,8.27 3.24,6.03 6,6.03C7,3.68 9.3,2.03 12,2.03C15.43,2.03 18.24,4.69 18.5,8.06L19,8.03A4,4 0 0,1 23,12.03C23,14.23 21.21,16.03 19,16.03H18C17.45,16.03 17,15.58 17,15.03C17,14.47 17.45,14.03 18,14.03H19A2,2 0 0,0 21,12.03A2,2 0 0,0 19,10.03H17V9.03C17,6.27 14.76,4.03 12,4.03C9.5,4.03 7.45,5.84 7.06,8.21C6.73,8.09 6.37,8.03 6,8.03A3,3 0 0,0 3,11.03A3,3 0 0,0 6,14.03M12,14.15C12.18,14.39 12.37,14.66 12.56,14.94C13,15.56 14,17.03 14,18C14,19.11 13.1,20 12,20A2,2 0 0,1 10,18C10,17.03 11,15.56 11.44,14.94C11.63,14.66 11.82,14.4 12,14.15M12,11.03L11.5,11.59C11.5,11.59 10.65,12.55 9.79,13.81C8.93,15.06 8,16.56 8,18A4,4 0 0,0 12,22A4,4 0 0,0 16,18C16,16.56 15.07,15.06 14.21,13.81C13.35,12.55 12.5,11.59 12.5,11.59";var tH="M12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,2L14.39,5.42C13.65,5.15 12.84,5 12,5C11.16,5 10.35,5.15 9.61,5.42L12,2M3.34,7L7.5,6.65C6.9,7.16 6.36,7.78 5.94,8.5C5.5,9.24 5.25,10 5.11,10.79L3.34,7M3.36,17L5.12,13.23C5.26,14 5.53,14.78 5.95,15.5C6.37,16.24 6.91,16.86 7.5,17.37L3.36,17M20.65,7L18.88,10.79C18.74,10 18.47,9.23 18.05,8.5C17.63,7.78 17.1,7.15 16.5,6.64L20.65,7M20.64,17L16.5,17.36C17.09,16.85 17.62,16.22 18.04,15.5C18.46,14.77 18.73,14 18.87,13.21L20.64,17M12,22L9.59,18.56C10.33,18.83 11.14,19 12,19C12.82,19 13.63,18.83 14.37,18.56L12,22Z";var iH="M12,21L15.6,16.2C14.6,15.45 13.35,15 12,15C10.65,15 9.4,15.45 8.4,16.2L12,21M12,3C7.95,3 4.21,4.34 1.2,6.6L3,9C5.5,7.12 8.62,6 12,6C15.38,6 18.5,7.12 21,9L22.8,6.6C19.79,4.34 16.05,3 12,3M12,9C9.3,9 6.81,9.89 4.8,11.4L6.6,13.8C8.1,12.67 9.97,12 12,12C14.03,12 15.9,12.67 17.4,13.8L19.2,11.4C17.19,9.89 14.7,9 12,9Z";var oH="M2.28,3L1,4.27L2.47,5.74C2.04,6 1.61,6.29 1.2,6.6L3,9C3.53,8.6 4.08,8.25 4.66,7.93L6.89,10.16C6.15,10.5 5.44,10.91 4.8,11.4L6.6,13.8C7.38,13.22 8.26,12.77 9.2,12.47L11.75,15C10.5,15.07 9.34,15.5 8.4,16.2L12,21L14.46,17.73L17.74,21L19,19.72M12,3C9.85,3 7.8,3.38 5.9,4.07L8.29,6.47C9.5,6.16 10.72,6 12,6C15.38,6 18.5,7.11 21,9L22.8,6.6C19.79,4.34 16.06,3 12,3M12,9C11.62,9 11.25,9 10.88,9.05L14.07,12.25C15.29,12.53 16.43,13.07 17.4,13.8L19.2,11.4C17.2,9.89 14.7,9 12,9Z";var MH="M6,11H10V9H14V11H18V4H6V11M18,13H6V20H18V13M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2Z";var aH="M6,8H10V6H14V8H18V4H6V8M18,10H6V15H18V10M6,20H18V17H6V20M6,2H18A2,2 0 0,1 20,4V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V4A2,2 0 0,1 6,2Z";var nH="M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9M8 12H16V14H8V12M8 15H16V17H8V15M8 18H16V20H8V18Z";var dH="M3 4H21V8H19V20H17V8H7V20H5V8H3V4M8 9H16V11H8V9Z";var AH="M22.7,19L13.6,9.9C14.5,7.6 14,4.9 12.1,3C10.1,1 7.1,0.6 4.7,1.7L9,6L6,9L1.6,4.7C0.4,7.1 0.9,10.1 2.9,12.1C4.8,14 7.5,14.5 9.8,13.6L18.9,22.7C19.3,23.1 19.9,23.1 20.3,22.7L22.6,20.4C23.1,20 23.1,19.3 22.7,19Z";var sH="M10,15L15.19,12L10,9V15M21.56,7.17C21.69,7.64 21.78,8.27 21.84,9.07C21.91,9.87 21.94,10.56 21.94,11.16L22,12C22,14.19 21.84,15.8 21.56,16.83C21.31,17.73 20.73,18.31 19.83,18.56C19.36,18.69 18.5,18.78 17.18,18.84C15.88,18.91 14.69,18.94 13.59,18.94L12,19C7.81,19 5.2,18.84 4.17,18.56C3.27,18.31 2.69,17.73 2.44,16.83C2.31,16.36 2.22,15.73 2.16,14.93C2.09,14.13 2.06,13.44 2.06,12.84L2,12C2,9.81 2.16,8.2 2.44,7.17C2.69,6.27 3.27,5.69 4.17,5.44C4.64,5.31 5.5,5.22 6.82,5.16C8.12,5.09 9.31,5.06 10.41,5.06L12,5C16.19,5 18.8,5.16 19.83,5.44C20.73,5.69 21.31,6.27 21.56,7.17Z";var lH="M2.5,4.5H21.5C22.34,4.5 23,5.15 23,6V17.5C23,18.35 22.34,19 21.5,19H2.5C1.65,19 1,18.35 1,17.5V6C1,5.15 1.65,4.5 2.5,4.5M9.71,8.5V15L15.42,11.7L9.71,8.5M17.25,21H6.65C6.35,21 6.15,20.8 6.15,20.5C6.15,20.2 6.35,20 6.65,20H17.35C17.65,20 17.85,20.2 17.85,20.5C17.85,20.8 17.55,21 17.25,21Z";var e5={account:o7,"account-group":M7,"air-conditioner":a7,"alarm-light":n7,album:d7,alert:A7,"alert-circle":s7,"alert-circle-outline":l7,"alert-outline":m7,amplifier:p7,apple:u7,"arrow-down":c7,"arrow-down-bold":v7,"arrow-left":x7,"arrow-left-bold":h7,"arrow-left-top":Z7,"arrow-right":S7,"arrow-right-bold":g7,"arrow-u-left-top":f7,"arrow-up":b7,"arrow-up-bold":y7,"aspect-ratio":w7,"audio-video":O7,"audio-video-off":k7,backspace:_7,bed:T7,"bed-outline":R7,bell:P7,"bell-off":B7,"bell-ring":D7,blinds:F7,"blinds-open":E7,bluetooth:N7,"bluetooth-off":$7,bookmark:I7,"bookmark-outline":U7,"brightness-1":W7,"brightness-2":G7,"brightness-3":z7,"brightness-4":q7,"brightness-5":K7,"brightness-6":Q7,"brightness-7":j7,broom:X7,camera:Y7,"camera-off":J7,cancel:C4,car:H4,"car-key":V4,cast:e4,"cast-connected":L4,"cast-off":r4,cctv:t4,"ceiling-light":i4,cellphone:o4,"cellphone-wireless":M4,check:a4,"check-bold":n4,"check-circle":d4,"check-circle-outline":A4,"chevron-double-down":s4,"chevron-double-left":l4,"chevron-double-right":m4,"chevron-double-up":p4,"chevron-down":u4,"chevron-left":c4,"chevron-right":v4,"chevron-up":x4,circle:h4,"circle-outline":Z4,clock:S4,"clock-outline":g4,close:f4,"close-circle":b4,"close-circle-outline":y4,"closed-caption":w4,"closed-caption-outline":O4,coffee:k4,"coffee-outline":_4,cog:T4,"cog-outline":R4,cogs:P4,"controller-classic":B4,"controller-classic-outline":D4,curtains:F4,"curtains-closed":E4,"desktop-tower":N4,dialpad:$4,disc:I4,"disc-player":U4,dishwasher:W4,door:G4,"door-closed":z4,"door-open":q4,doorbell:K4,"dots-horizontal":Q4,"dots-vertical":j4,"drag-vertical-variant":X4,eye:Y4,"eye-off":J4,fan:C9,"fan-off":H9,"fast-forward":V9,"fast-forward-outline":e9,film:L9,filmstrip:r9,fire:t9,fireplace:i9,"fireplace-off":o9,"floor-lamp":M9,"format-color-fill":a9,fridge:n9,fullscreen:d9,"fullscreen-exit":A9,gamepad:s9,"gamepad-variant":l9,"gamepad-variant-outline":m9,garage:p9,"garage-open":u9,"gesture-double-tap":c9,"gesture-swipe":v9,"gesture-tap":x9,"gesture-tap-button":h9,"glass-cocktail":Z9,headphones:S9,heart:g9,"heart-outline":f9,"help-circle":b9,"help-circle-outline":y9,hexagon:w9,"hexagon-outline":O9,home:k9,"home-assistant":_9,"home-automation":T9,"home-lightbulb":R9,"home-outline":P9,"home-thermometer":B9,hulu:D9,"human-greeting":F9,image:E9,"image-multiple":N9,information:$9,"information-outline":I9,"invert-colors":U9,kettle:W9,keyboard:G9,"keyboard-backspace":z9,"keyboard-return":q9,"keyboard-space":K9,kodi:Q9,lamp:j9,laptop:X9,"led-outline":Y9,"led-strip":J9,"led-strip-variant":C6,lightbulb:H6,"lightbulb-group":V6,"lightbulb-group-off":e6,"lightbulb-off":L6,"lightbulb-on":r6,"lightbulb-outline":t6,lock:i6,"lock-open":o6,"lock-open-variant":M6,magnify:a6,"magnify-minus":n6,"magnify-plus":d6,menu:A6,"menu-down":s6,"menu-open":l6,"menu-up":m6,"microsoft-xbox":p6,microwave:u6,minus:c6,"minus-box":v6,"minus-circle":x6,monitor:h6,"motion-sensor":Z6,movie:S6,"movie-open":g6,"movie-open-outline":f6,"movie-roll":b6,music:y6,"music-box":w6,"music-box-outline":O6,"music-note":k6,netflix:_6,"nintendo-game-boy":T6,"nintendo-switch":R6,numeric:P6,palette:B6,"palette-outline":D6,pause:F6,"pause-circle":E6,"pause-circle-outline":N6,pencil:$6,"picture-in-picture-bottom-right":I6,pin:U6,"pin-off-outline":W6,"pin-outline":G6,play:z6,"play-circle":q6,"play-circle-outline":K6,"play-outline":Q6,"play-pause":j6,"playlist-play":X6,plex:Y6,plus:J6,"plus-box":C8,"plus-circle":H8,popcorn:V8,power:e8,"power-cycle":L8,"power-off":r8,"power-on":t8,"power-sleep":i8,"power-standby":o8,projector:M8,"projector-screen":a8,radiator:n8,radio:d8,"radio-tower":A8,record:s8,"record-rec":l8,redo:m8,refresh:p8,reload:u8,remote:c8,"remote-off":v8,"remote-tv":x8,repeat:h8,"repeat-once":Z8,rewind:S8,"rewind-outline":g8,rhombus:f8,"rhombus-outline":b8,robot:y8,"robot-vacuum":w8,"robot-vacuum-variant":O8,"router-wireless":k8,run:_8,seat:T8,"seat-outline":R8,server:P8,"shape-outline":B8,"shield-check":D8,"shield-home":F8,"shield-home-outline":E8,shuffle:N8,"silverware-fork-knife":$8,"skip-backward":I8,"skip-forward":U8,"skip-next":W8,"skip-previous":G8,sleep:z8,"sleep-off":q8,snowflake:K8,sofa:Q8,"sofa-outline":j8,"sony-playstation":X8,sort:Y8,soundbar:J8,speaker:CC,"speaker-off":HC,"speaker-wireless":VC,spotify:eC,square:LC,"square-outline":rC,star:tC,"star-outline":iC,stop:oC,"stop-circle":MC,"stop-circle-outline":aC,stove:nC,subtitles:dC,"subtitles-outline":AC,"surround-sound":sC,sync:lC,tablet:mC,television:pC,"television-classic":uC,"television-guide":cC,"television-off":vC,"television-play":xC,text:hC,thermometer:ZC,thermostat:SC,timer:gC,"timer-outline":fC,"toggle-switch":bC,"toggle-switch-off":yC,translate:wC,triangle:OC,"triangle-outline":kC,tune:_C,"tune-vertical":TC,twitch:RC,umbrella:PC,undo:BC,usb:DC,video:FC,"video-input-antenna":EC,"video-input-component":NC,"video-input-hdmi":$C,"video-input-svideo":IC,"video-off":UC,"video-vintage":WC,"volume-high":GC,"volume-low":zC,"volume-medium":qC,"volume-minus":KC,"volume-mute":QC,"volume-off":jC,"volume-plus":XC,"volume-variant-off":YC,walk:JC,"washing-machine":CH,water:HH,"water-off":VH,"weather-cloudy":eH,"weather-night":LH,"weather-rainy":rH,"weather-sunny":tH,wifi:iH,"wifi-off":oH,"window-closed":MH,"window-open":aH,"window-shutter":nH,"window-shutter-open":dH,wrench:AH,youtube:sH,"youtube-tv":lH};var QV="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z";function mH(C){let V=String(C??"").trim().replace(/^mdi:/,"");return V?e5[V]??null:null}var L5=class extends HTMLElement{constructor(){super();this._rendered=null;this._shadow=this.attachShadow({mode:"open"})}static get observedAttributes(){return["icon"]}get icon(){return this.getAttribute("icon")??""}set icon(H){H==null||H===""?this.removeAttribute("icon"):this.setAttribute("icon",String(H))}connectedCallback(){this._render()}attributeChangedCallback(){this._render()}_render(){let H=this.icon;if(this._rendered===H)return;this._rendered=H;let e=mH(H)??QV;this._shadow.innerHTML=`
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
    `}};function pH(){customElements.get("sbx-ha-icon")||customElements.define("sbx-ha-icon",L5)}var r5=class extends HTMLElement{constructor(){super(...arguments);this._value=null}get value(){return this._value??this.getAttribute("value")??""}set value(H){this._value=H==null?"":String(H),this.setAttribute("value",this._value)}},t5=class extends HTMLElement{constructor(){super();this._labelEl=null;this._valueEl=null;this._trigger=null;this._menu=null;this._label="";this._value="";this._options=[];this._connected=!1;this._onViewportChange=()=>this._placeMenu();this._observer=new MutationObserver(()=>this._syncOptions()),this._shadow=this.attachShadow({mode:"open"}),this._shadow.innerHTML=`
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
    `,this._labelEl=this._shadow.querySelector(".label"),this._valueEl=this._shadow.querySelector(".value"),this._trigger=this._shadow.querySelector(".trigger"),this._menu=this._shadow.querySelector(".menu")}static get observedAttributes(){return["label","disabled"]}connectedCallback(){this._connected||(this._connected=!0,this._trigger?.addEventListener("click",()=>{this.disabled||(this.hasAttribute("open")?this._closeMenu():this._openMenu())}),this._trigger?.addEventListener("keydown",H=>{if(!this.disabled)if(H.key==="ArrowDown"||H.key==="ArrowUp"){H.preventDefault();let e=this.hasAttribute("open");e||this._openMenu();let L=Array.from(this._menu?.querySelectorAll(".option")??[]),r=this._options.findIndex(o=>o.value===this._value),t=e?H.key==="ArrowDown"?Math.min(L.length-1,r+1):Math.max(0,r-1):Math.max(0,r);L[t]?.focus()}else H.key==="Escape"&&this.hasAttribute("open")&&(H.preventDefault(),this._closeMenu())}),this._shadow.addEventListener("focusout",H=>{let e=H.relatedTarget;e&&this._shadow.contains(e)||this.hasAttribute("open")&&this._closeMenu()}),this._menu?.addEventListener("keydown",H=>{if(H.key==="Escape"){H.preventDefault(),this._closeMenu(),this._trigger?.focus();return}let e=Array.from(this._menu?.querySelectorAll(".option")??[]),L=e.indexOf(this._shadow.activeElement),r=H.key==="ArrowDown"?Math.min(e.length-1,L+1):H.key==="ArrowUp"?Math.max(0,L-1):H.key==="Home"?0:H.key==="End"?e.length-1:null;r!=null&&(H.preventDefault(),e[r]?.focus())})),this._observer.observe(this,{childList:!0,subtree:!0,characterData:!0}),this._renderLabel(),this._syncOptions()}disconnectedCallback(){this._observer.disconnect(),this._closeMenu()}attributeChangedCallback(H){H==="label"&&this._renderLabel(),H==="disabled"&&this._trigger&&(this._trigger.disabled=this.disabled)}get label(){return this._label||this.getAttribute("label")||""}set label(H){this._label=H==null?"":String(H),this._renderLabel()}get value(){return this._value}set value(H){this._value=H==null?"":String(H),this._renderValue(),this._renderOptions()}get disabled(){return this.hasAttribute("disabled")}set disabled(H){H?this.setAttribute("disabled",""):this.removeAttribute("disabled"),this._trigger&&(this._trigger.disabled=!!H)}_renderLabel(){this._labelEl&&(this._labelEl.textContent=this.label)}_syncOptions(){let H=this._value,e=Array.from(this.children);this._options=e.map(L=>({value:String(L.value??L.getAttribute("value")??L.textContent??""),label:(L.textContent??"").trim(),defaultLayout:L.classList.contains("sb-option-default")})),H!==""&&!this._options.some(L=>L.value===H)&&(this._value=this._options[0]?.value??""),this._renderValue(),this._renderOptions()}_renderValue(){if(!this._valueEl)return;let H=this._options.find(e=>e.value===this._value);this._valueEl.textContent=H?.label??this._value}_renderOptions(){if(this._menu){this._menu.textContent="";for(let H of this._options){let e=document.createElement("button");e.type="button",e.className="option",e.setAttribute("part",H.defaultLayout?"option default-option":"option"),e.dataset.value=H.value,e.setAttribute("role","option"),e.textContent=H.label,e.dataset.selected=String(H.value===this._value),e.setAttribute("aria-selected",e.dataset.selected),e.addEventListener("click",()=>{this._value=H.value,this._renderValue(),this._renderOptions(),this.dispatchEvent(new Event("change",{bubbles:!0,composed:!0})),this.dispatchEvent(new CustomEvent("selected",{detail:{value:this._value},bubbles:!0,composed:!0})),this._closeMenu(),this._trigger?.focus()}),this._menu.appendChild(e)}}}_openMenu(){this.setAttribute("open",""),this._trigger?.setAttribute("aria-expanded","true"),this._placeMenu(),window.addEventListener("scroll",this._onViewportChange,!0),window.addEventListener("resize",this._onViewportChange),this.dispatchEvent(new Event("opened",{bubbles:!0,composed:!0}))}_closeMenu(){window.removeEventListener("scroll",this._onViewportChange,!0),window.removeEventListener("resize",this._onViewportChange),this.hasAttribute("open")&&(this.removeAttribute("open"),this._trigger?.setAttribute("aria-expanded","false"),this.dispatchEvent(new Event("closed",{bubbles:!0,composed:!0})))}_placeMenu(){let H=this._menu,e=this._trigger;if(!H||!e||!this.hasAttribute("open"))return;H.style.left="0px",H.style.top="0px",H.style.width=`${uH}px`;let L=H.getBoundingClientRect(),r=e.getBoundingClientRect(),t=L.width>0?L.width/uH:jV(this);H.style.left=`${(r.left-L.left)/t}px`,H.style.top=`${(r.bottom+4-L.top)/t}px`,H.style.width=`${r.width/t}px`;let o=this.closest("sbx-ha-card")?.getBoundingClientRect(),i=8,M=window.innerHeight-8,n=Math.max(i,o?o.top+8:i),a=Math.min(M,o?o.bottom-8:M),l=Math.min(H.scrollHeight*t,64*t);Math.max(r.top-4-n,a-r.bottom-4)<l&&(n=i,a=M);let s=Math.max(0,a-r.bottom-4),m=Math.max(0,r.top-4-n),u=m>s;H.style.maxHeight=`${Math.min(window.innerHeight*.6,u?m:s)/t}px`,u&&(H.style.top=`${(r.top-4-L.top-H.getBoundingClientRect().height)/t}px`)}},uH=100;function jV(C){let V=C.currentCSSZoom;if(typeof V=="number"&&V>0)return V;let H=1,e=C;for(;e;){let L=parseFloat(getComputedStyle(e).zoom);Number.isFinite(L)&&L>0&&(H*=L),e=e.parentElement??e.getRootNode().host??null}return H}function cH(){customElements.get("sbx-mwc-list-item")||customElements.define("sbx-mwc-list-item",r5),customElements.get("sbx-ha-select")||customElements.define("sbx-ha-select",t5)}function vH(){i7(),pH(),cH()}var c=C=>`\u2068${C}\u2069`,H1=c("Sofabaton"),A2=c("MQTT"),i5=c("MQTT Discovery"),xH=c("YAML"),YV=c("Lovelace"),hH=c("DVR"),JV=c("A/B/C"),Ce={card:{selectEntityError:`\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 ${H1}`,remoteUnavailable:`\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u063A\u064A\u0631 \u0645\u062A\u0627\u062D (\u0642\u062F \u064A\u0643\u0648\u0646 \u062A\u0637\u0628\u064A\u0642 ${H1} \u0645\u062A\u0635\u0644\u064B\u0627).`,noActivitiesWarning:"\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0623\u064A \u0623\u0646\u0634\u0637\u0629 \u0641\u064A \u0633\u0645\u0627\u062A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F.",noMacros:"\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0648\u062D\u062F\u0627\u062A \u0645\u0627\u0643\u0631\u0648",noFavorites:"\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0645\u0641\u0636\u0644\u0627\u062A",noCommands:"\u0644\u0627 \u062A\u062A\u0648\u0641\u0631 \u0623\u064A \u0623\u0648\u0627\u0645\u0631",macrosTab:"\u0627\u0644\u0645\u0627\u0643\u0631\u0648",favoritesTab:"\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",commandsTab:"\u0627\u0644\u0623\u0648\u0627\u0645\u0631",powerButton:"\u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u062A\u0634\u063A\u064A\u0644/\u0627\u0644\u0625\u064A\u0642\u0627\u0641",activitySelectLabel:"\u0627\u0644\u0646\u0634\u0627\u0637",deviceSelectLabel:"\u0627\u0644\u062C\u0647\u0627\u0632",selectDevice:"\u0627\u062E\u062A\u0631 \u062C\u0647\u0627\u0632\u064B\u0627",allDevicesLayout:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629",filterCommands:"\u062A\u0635\u0641\u064A\u0629 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",switchToDeviceMode:"\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",switchToActivityMode:"\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0625\u0644\u0649 \u0648\u0636\u0639 \u0627\u0644\u0623\u0646\u0634\u0637\u0629",deviceKeymapMissing:`\u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u062E\u0632\u0651\u0646\u0629 \u0645\u0624\u0642\u062A\u064B\u0627 \u0628\u0639\u062F. \u062D\u062F\u0650\u0651\u062B \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062A\u0628\u0648\u064A\u0628 ${c("Hub")} \u0641\u064A ${c("Sofabaton Control Panel")}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.`,deviceKeymapError:"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632.",deviceKeymapMissingServer:`\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F \u0641\u064A \u0643\u062A\u0627\u0644\u0648\u062C ${c("Hub")}. \u062D\u062F\u0650\u0651\u062B ${c("Hub")} \u0641\u064A \u0644\u0648\u062D\u0629 \u062A\u062D\u0643\u0645 ${H1}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0647\u0630\u0647 \u0627\u0644\u0635\u0641\u062D\u0629.`,serverReadFailed:`\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0628\u064A\u0627\u0646\u0627\u062A ${c("Hub")} \u0645\u0646 \u0627\u0644\u062E\u0627\u062F\u0645. \u062A\u062D\u0642\u0651\u0642 \u0645\u0646 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.`,controlRefused:"\u062A\u0639\u0630\u0651\u0631 \u062A\u0646\u0641\u064A\u0630 \u0627\u0644\u0623\u0645\u0631. \u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.",poweredOff:"\u0645\u064F\u0637\u0641\u0623",defaultLayout:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",activityFallback:C=>`\u0627\u0644\u0646\u0634\u0627\u0637 ${c(C)}`,deviceFallback:C=>`\u0627\u0644\u062C\u0647\u0627\u0632 ${c(C)}`,pickerName:`\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0645\u0646 ${H1}`,pickerDescription:`\u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0642\u0627\u0628\u0644 \u0644\u0644\u062A\u062E\u0635\u064A\u0635 \u0644\u062A\u0643\u0627\u0645\u0644 ${c("Sofabaton X1 / X1S / X2")}.`},sidebar:{title:"\u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0627\u0641\u062A\u0631\u0627\u0636\u064A",controlPanel:"\u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645",hubMenu:`\u0627\u062E\u062A\u064A\u0627\u0631 ${c("Hub")}`,back:"\u0631\u062C\u0648\u0639",hubReachable:"\u0645\u062A\u0635\u0644",hubUnreachable:"\u063A\u064A\u0631 \u0645\u062A\u0635\u0644",noHubs:`\u0644\u0645 \u064A\u062A\u0645 \u0625\u0639\u062F\u0627\u062F \u0623\u064A ${c("Hub")} \u0645\u0646 ${H1} \u0628\u0639\u062F.`,hubUnavailable:`${c("Hub")} \u063A\u064A\u0631 \u0645\u062A\u0627\u062D`,remoteUnavailable:`\u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0627\u0644\u062E\u0627\u0635 \u0628\u0647\u0630\u0627 ${c("Hub")} \u063A\u064A\u0631 \u0645\u062A\u0627\u062D.`,controlPanelLoadFailed:"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u062D\u0643\u0645. \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0635\u0641\u062D\u0629 \u0644\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627.",activities:"\u0627\u0644\u0623\u0646\u0634\u0637\u0629",devices:"\u0627\u0644\u0623\u062C\u0647\u0632\u0629",allOff:"\u0625\u064A\u0642\u0627\u0641 \u0627\u0644\u0643\u0644",off:"\u0645\u0637\u0641\u0623",modeToggle:"\u0627\u0644\u062A\u0628\u062F\u064A\u0644 \u0628\u064A\u0646 \u0627\u0644\u0623\u0646\u0634\u0637\u0629 \u0648\u0627\u0644\u0623\u062C\u0647\u0632\u0629",numberPad:"\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0631\u0642\u0627\u0645",pullHandle:"\u0641\u062A\u062D \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A \u0648\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",pullHandleCommands:"\u0641\u062A\u062D \u0627\u0644\u0623\u0648\u0627\u0645\u0631",close:"\u0625\u063A\u0644\u0627\u0642",pinToDock:C=>`\u062A\u062B\u0628\u064A\u062A ${c(C)} \u0641\u064A \u0627\u0644\u0634\u0631\u064A\u0637 \u0627\u0644\u0633\u0641\u0644\u064A`,pinnedToDock:C=>`${c(C)}\u060C \u0645\u062B\u0628\u0651\u062A \u0641\u064A \u0627\u0644\u0634\u0631\u064A\u0637 \u0627\u0644\u0633\u0641\u0644\u064A`,dockShortcut:"\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0634\u0631\u064A\u0637 \u0627\u0644\u0633\u0641\u0644\u064A",dockSwap:"\u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u062C\u0627\u0646\u0628",dockOnLeft:"\u0639\u0644\u0649 \u0627\u0644\u064A\u0633\u0627\u0631",dockOnRight:"\u0639\u0644\u0649 \u0627\u0644\u064A\u0645\u064A\u0646",unpin:"\u0625\u0644\u063A\u0627\u0621 \u0627\u0644\u062A\u062B\u0628\u064A\u062A",dockFull:"\u0627\u0644\u0634\u0631\u064A\u0637 \u0627\u0644\u0633\u0641\u0644\u064A \u0645\u0645\u062A\u0644\u0626",dockIcon:"\u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0629",starting:"\u062C\u0627\u0631\u064D \u0627\u0644\u0628\u062F\u0621",poweringOff:"\u062C\u0627\u0631\u064D \u0627\u0644\u0625\u064A\u0642\u0627\u0641",working:"\u062C\u0627\u0631\u064D \u0627\u0644\u0639\u0645\u0644",appConnected:"\u062A\u0637\u0628\u064A\u0642 \u2068Sofabaton\u2069 \u0645\u062A\u0635\u0644",operations:{backup_restore:"\u062C\u0627\u0631\u064D \u0627\u0633\u062A\u0639\u0627\u062F\u0629 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629",cache_refresh:`\u062C\u0627\u0631\u064D \u062A\u062D\u062F\u064A\u062B \u0630\u0627\u0643\u0631\u0629 ${c("Hub")} \u0627\u0644\u0645\u0624\u0642\u062A\u0629`,entity_sync:`\u062C\u0627\u0631\u064D \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0645\u0639 ${c("Hub")}`,backup_export:"\u062C\u0627\u0631\u064D \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u0646\u0633\u062E\u0629 \u0627\u0644\u0627\u062D\u062A\u064A\u0627\u0637\u064A\u0629",wifi_deploy:`\u062C\u0627\u0631\u064D \u0645\u0632\u0627\u0645\u0646\u0629 ${c("Wifi Commands")}`}},assist:{label:"\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",waiting:"\u0628\u0627\u0646\u062A\u0638\u0627\u0631 \u0636\u063A\u0637\u0629 \u0632\u0631",exitEditMode:"\u063A\u0627\u062F\u0631 \u0648\u0636\u0639 \u0627\u0644\u062A\u062D\u0631\u064A\u0631 \u0644\u0644\u0628\u062F\u0621",captured:C=>`\u062A\u0645 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0645\u0631: ${c(C)}`,notCaptured:"\u0644\u0645 \u064A\u062A\u0645 \u0627\u0644\u062A\u0642\u0627\u0637 \u0623\u064A \u0623\u0645\u0631.",working:"\u062C\u0627\u0631\u064D \u0627\u0644\u0639\u0645\u0644\u2026",triggersReady:"\u0627\u0644\u0645\u0634\u063A\u0651\u0644\u0627\u062A \u062C\u0627\u0647\u0632\u0629 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",createTriggers:`\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${i5}`,startCapturing:"\u0628\u062F\u0621 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0648\u0627\u0645\u0631",deviceDetectedTitle:`\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u062C\u0647\u0627\u0632 ${A2} \u0645\u0646 ${H1}.`,close:"\u0625\u063A\u0644\u0627\u0642",alsoActivityTriggers:"\u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u064A\u0636\u064B\u0627 \u0639\u0646\u062F \u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637.",seeDocs:"\u0639\u0631\u0636 \u0648\u062B\u0627\u0626\u0642 \u0647\u0630\u0647 \u0627\u0644\u0645\u064A\u0632\u0629.",dontShowAgain:"\u0639\u062F\u0645 \u0625\u0638\u0647\u0627\u0631 \u0647\u0630\u0647 \u0627\u0644\u0631\u0633\u0627\u0644\u0629 \u0645\u062C\u062F\u062F\u064B\u0627 \u0644\u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u062E\u0644\u0627\u0644 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629.",detectedDevice:C=>`\u062C\u0647\u0627\u0632 ${A2} \u0627\u0644\u0645\u0643\u062A\u0634\u0641: ${c(C)}.`,lastCommand:C=>`\u0622\u062E\u0631 \u0623\u0645\u0631: ${c(C)}.`,existingTriggers:`\u062A\u0645 \u0627\u0644\u0639\u062B\u0648\u0631 \u0639\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0623\u062A\u0645\u062A\u0629 ${A2} \u0645\u0648\u062C\u0648\u062F\u0629 \u0645\u0633\u0628\u0642\u064B\u0627.`,noMqttCommands:`\u0644\u0645 \u064A\u062A\u0645 \u0627\u0643\u062A\u0634\u0627\u0641 \u0623\u064A \u0623\u0648\u0627\u0645\u0631 ${A2} \u062D\u062A\u0649 \u0627\u0644\u0622\u0646`,deviceFallback:C=>`\u0627\u0644\u062C\u0647\u0627\u0632 ${c(C)}`,unknownDevice:"\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",commandFallback:C=>`\u0627\u0644\u0623\u0645\u0631 ${c(C)}`,createdTriggers:(C,V)=>`\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${i5} \u0644\u0640 ${c(V)}\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${c(C)}`,createdActivityTriggers:C=>`\u062A\u0645 \u0625\u0646\u0634\u0627\u0621 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0646\u0634\u0627\u0637 \u0644\u0640 ${c("X2 \u2192 Activities")}\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${c(C)}`,plusActivityTriggers:C=>`\u060C \u0628\u0627\u0644\u0625\u0636\u0627\u0641\u0629 \u0625\u0644\u0649 \u0645\u0634\u063A\u0651\u0644\u0627\u062A \u0627\u0644\u0646\u0634\u0627\u0637\u060C \u0648\u0639\u062F\u062F\u0647\u0627 ${c(C)}`,allTriggersExist:C=>`\u062C\u0645\u064A\u0639 \u0645\u0634\u063A\u0651\u0644\u0627\u062A ${i5} \u0627\u0644\u062E\u0627\u0635\u0629 \u0628\u0640 ${c(C)} \u0645\u0648\u062C\u0648\u062F\u0629 \u0628\u0627\u0644\u0641\u0639\u0644`,buttonFallback:"\u0632\u0631",activityFallbackLabel:"\u0627\u0644\u0646\u0634\u0627\u0637",unknown:"\u063A\u064A\u0631 \u0645\u0639\u0631\u0648\u0641",automationAssistName:"\u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",notification:{title:"\u{1F6E0}\uFE0F \u0645\u0633\u0627\u0639\u062F \u0627\u0644\u0623\u062A\u0645\u062A\u0629",eventButton:C=>`\u0627\u0644\u0632\u0631: ${c(C)}`,eventCommand:C=>`\u0627\u0644\u0623\u0645\u0631: ${c(C)}`,eventActivity:C=>`\u062A\u063A\u064A\u064A\u0631 \u0627\u0644\u0646\u0634\u0627\u0637: ${c(C)}`,eventOther:C=>`\u0627\u0644\u062D\u062F\u062B: ${c(C)}`,header:(C,V)=>`**\u0627\u0644\u0646\u0634\u0627\u0637: ${c(C)} \u2022 ${c(V)}**`,headerDevice:(C,V)=>`**\u0627\u0644\u062C\u0647\u0627\u0632: ${c(C)} \u2022 ${c(V)}**`,lovelaceHeading:`\u{1F4CB} **\u0643\u0648\u062F \u0632\u0631 ${YV}**`,lovelaceCopy:`*\u0627\u0646\u0633\u062E \u0647\u0630\u0627 \u0625\u0644\u0649 ${xH} \u0627\u0644\u062E\u0627\u0635 \u0628\u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A:*`,serviceHeading:"\u2699\uFE0F **\u0627\u0633\u062A\u062F\u0639\u0627\u0621 \u062E\u062F\u0645\u0629 (\u0623\u062A\u0645\u062A\u0629)**",serviceCopy:"*\u0627\u0633\u062A\u062E\u062F\u0645 \u0647\u0630\u0627 \u0641\u064A \u0627\u0644\u0628\u0631\u0627\u0645\u062C \u0627\u0644\u0646\u0635\u064A\u0629 \u0623\u0648 \u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629:*"}},editor:{fieldLabels:{entity:`\u0627\u062E\u062A\u0631 \u0643\u064A\u0627\u0646 \u062C\u0647\u0627\u0632 \u062A\u062D\u0643\u0645 \u0639\u0646 \u0628\u064F\u0639\u062F \u0645\u0646 ${H1}`,theme:"\u062A\u0637\u0628\u064A\u0642 \u0633\u0645\u0629 \u0639\u0644\u0649 \u0627\u0644\u0628\u0637\u0627\u0642\u0629",use_background_override:"\u062A\u062E\u0635\u064A\u0635 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",background_override:"\u0627\u062E\u062A\u064A\u0627\u0631 \u0644\u0648\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629",max_width:"\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u0642\u0635\u0649 \u0644\u0639\u0631\u0636 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 (\u0628\u0643\u0633\u0644)",key_style:"\u0646\u0645\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631"},generalOptionsTitle:"\u0627\u0644\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0639\u0627\u0645\u0629",keyCapture:"\u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",keyCaptureDescription:`\u0623\u0631\u0633\u0644 \u0636\u063A\u0637\u0627\u062A \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0625\u0644\u0649 \u062C\u0647\u0627\u0632 ${c("Hub")} \u0644\u0625\u0646\u0634\u0627\u0621 ${xH} \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0641\u064A \u0623\u0632\u0631\u0627\u0631 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u0639\u0645\u0644\u064A\u0627\u062A \u0627\u0644\u0623\u062A\u0645\u062A\u0629.`,keyCaptureLearnMore:"\u062A\u0639\u0631\u0651\u0641 \u0639\u0644\u0649 \u0627\u0644\u0645\u0632\u064A\u062F \u062D\u0648\u0644 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",keyCaptureDocsAria:"\u0648\u062B\u0627\u0626\u0642 \u0627\u0644\u062A\u0642\u0627\u0637 \u0627\u0644\u0623\u0632\u0631\u0627\u0631",stylingOptions:"\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u0645\u0638\u0647\u0631",keyStyleFlat:"\u0645\u0633\u0637\u062D (\u0628\u0646\u0641\u0633 \u0644\u0648\u0646 \u062E\u0644\u0641\u064A\u0629 \u0627\u0644\u0628\u0637\u0627\u0642\u0629)",keyStyleTinted:"\u0645\u0644\u0648\u0651\u0646 (\u062A\u062A\u0645\u064A\u0632 \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0639\u0646 \u0627\u0644\u062E\u0644\u0641\u064A\u0629)",keyStyleElevated:"\u0645\u0631\u062A\u0641\u0639 (\u0645\u0644\u0648\u0651\u0646 \u0645\u0639 \u0638\u0644)",keyStyleGlossy:"\u0644\u0627\u0645\u0639 (\u0623\u0632\u0631\u0627\u0631 \u0644\u0627\u0645\u0639\u0629 \u0645\u0642\u0648\u0651\u0633\u0629)",tintedPanels:"\u062E\u0644\u0641\u064A\u0627\u062A \u0645\u0644\u0648\u0651\u0646\u0629",tintedPanelsDescription:"\u064A\u0639\u0631\u0636 \u062E\u0644\u0641\u064A\u0629 \u0645\u0644\u0648\u0651\u0646\u0629 \u062E\u0644\u0641 \u0643\u0644 \u0645\u062C\u0645\u0648\u0639\u0629 \u0623\u0632\u0631\u0627\u0631.",layoutOptions:"\u062E\u064A\u0627\u0631\u0627\u062A \u0627\u0644\u062A\u062E\u0637\u064A\u0637",layoutSelectLabel:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637",defaultLayoutOption:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629",allDevicesOption:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629",commands:"\u0627\u0644\u0623\u0648\u0627\u0645\u0631",power:"\u0632\u0631 \u0627\u0644\u062A\u0634\u063A\u064A\u0644/\u0627\u0644\u0625\u064A\u0642\u0627\u0641",modeToggle:"\u0632\u0631 \u062A\u0628\u062F\u064A\u0644 \u0627\u0644\u0648\u0636\u0639",deviceModeDescription:`\u062A\u062D\u0643\u0651\u0645 \u0641\u064A \u062C\u0647\u0627\u0632 \u0648\u0627\u062D\u062F \u062A\u0645 \u0625\u0639\u062F\u0627\u062F\u0647 \u0639\u0644\u0649 \u062C\u0647\u0627\u0632 ${c("Hub")}\u060C \u0628\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u062A\u0639\u064A\u064A\u0646\u0627\u062A \u0623\u0632\u0631\u0627\u0631\u0647 \u0648\u0642\u0627\u0626\u0645\u0629 \u0623\u0648\u0627\u0645\u0631\u0647 \u0627\u0644\u0643\u0627\u0645\u0644\u0629.`,longPress:"\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u062A\u0643\u0631\u0627\u0631 \u0639\u0646\u062F \u0627\u0644\u0636\u063A\u0637 \u0627\u0644\u0645\u0637\u0648\u0651\u0644",longPressDescription:"\u0627\u0636\u063A\u0637 \u0645\u0637\u0648\u0651\u0644\u064B\u0627 \u0639\u0644\u0649 \u0623\u062D\u062F \u0627\u0644\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0645\u062D\u062F\u062F\u0629 \u0644\u0625\u0631\u0633\u0627\u0644 \u0623\u0645\u0631\u0647 \u0628\u0634\u0643\u0644 \u0645\u062A\u0643\u0631\u0631\u060C \u0643\u0645\u0627 \u0641\u064A \u062C\u0647\u0627\u0632 \u0627\u0644\u062A\u062D\u0643\u0645 \u0627\u0644\u0641\u0639\u0644\u064A.",longPressButtons:"\u0627\u0644\u0623\u0632\u0631\u0627\u0631",enableDeviceMode:"\u062A\u0641\u0639\u064A\u0644 \u0648\u0636\u0639 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",initialView:"\u0627\u0644\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0644\u064A",initialViewHelper:"\u0645\u0627 \u062A\u0639\u0631\u0636\u0647 \u0627\u0644\u0628\u0637\u0627\u0642\u0629 \u0639\u0646\u062F \u0641\u062A\u062D\u0647\u0627",openOnCurrentActivity:"\u0627\u0644\u0646\u0634\u0627\u0637 \u0627\u0644\u062D\u0627\u0644\u064A",macrosFavoritesAsRows:"\u0639\u0631\u0636 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 \u0648\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A \u0641\u064A \u0635\u0641\u0648\u0641",commandsAsRows:"\u0639\u0631\u0636 \u0627\u0644\u0623\u0648\u0627\u0645\u0631 \u0641\u064A \u0635\u0641\u0648\u0641",favoriteDeviceNames:"\u0625\u0638\u0647\u0627\u0631 \u0623\u0633\u0645\u0627\u0621 \u0627\u0644\u0623\u062C\u0647\u0632\u0629",rowOptions:C=>`\u062E\u064A\u0627\u0631\u0627\u062A ${C}`,visibleRows:"\u0627\u0644\u0635\u0641\u0648\u0641 \u0627\u0644\u0645\u0631\u0626\u064A\u0629",moveGroupUp:C=>`\u0646\u0642\u0644 ${c(C)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0639\u0644\u0649`,moveGroupDown:C=>`\u0646\u0642\u0644 ${c(C)} \u0625\u0644\u0649 \u0627\u0644\u0623\u0633\u0641\u0644`,fewerVisibleRows:"\u0635\u0641\u0648\u0641 \u0645\u0631\u0626\u064A\u0629 \u0623\u0642\u0644",moreVisibleRows:"\u0635\u0641\u0648\u0641 \u0645\u0631\u0626\u064A\u0629 \u0623\u0643\u062B\u0631",reorderGroupHandle:C=>`\u0625\u0639\u0627\u062F\u0629 \u062A\u0631\u062A\u064A\u0628 ${c(C)} (\u0645\u0641\u0627\u062A\u064A\u062D \u0627\u0644\u0623\u0633\u0647\u0645)`,macros:"\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",favorites:"\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",volume:"\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A",channel:"\u0627\u0644\u0642\u0646\u0627\u0629",mediaControls:"\u0627\u0644\u062A\u0634\u063A\u064A\u0644",dvr:hH,numpad:"\u0644\u0648\u062D\u0629 \u0627\u0644\u0623\u0631\u0642\u0627\u0645",resetDefaultLayout:"\u0625\u0639\u0627\u062F\u0629 \u0636\u0628\u0637 \u0627\u0644\u062A\u062E\u0637\u064A\u0637",shortcutSlotLeft:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u064A\u0633\u0631",shortcutSlotMiddle:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u0648\u0633\u0637",shortcutSlotRight:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631 \u0627\u0644\u0623\u064A\u0645\u0646",shortcutIcon:"\u0627\u0644\u0623\u064A\u0642\u0648\u0646\u0629",shortcutCommand:"\u0627\u0644\u0623\u0645\u0631",shortcutReset:"\u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0636\u0628\u0637",shortcutCommandMissing:C=>`\u0627\u0644\u0623\u0645\u0631 ${c(C)} (\u0645\u0641\u0642\u0648\u062F)`,shortcutsCommandsLoading:"\u062C\u0627\u0631\u064D \u062A\u062D\u0645\u064A\u0644 \u0627\u0644\u0623\u0648\u0627\u0645\u0631\u2026",shortcutsCommandsUnavailable:`\u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632 \u063A\u064A\u0631 \u0645\u062E\u0632\u0651\u0646\u0629 \u0645\u0624\u0642\u062A\u064B\u0627 \u0628\u0639\u062F. \u062D\u062F\u0650\u0651\u062B \u0627\u0644\u062C\u0647\u0627\u0632 \u0645\u0646 \u062A\u0628\u0648\u064A\u0628 ${c("Hub")} \u0641\u064A ${c("Sofabaton Control Panel")}\u060C \u062B\u0645 \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A.`,shortcutsCommandsError:"\u062A\u0639\u0630\u0651\u0631 \u062A\u062D\u0645\u064A\u0644 \u0623\u0648\u0627\u0645\u0631 \u0647\u0630\u0627 \u0627\u0644\u062C\u0647\u0627\u0632. \u0623\u0639\u062F \u062A\u062D\u0645\u064A\u0644 \u0644\u0648\u062D\u0629 \u0627\u0644\u0645\u0639\u0644\u0648\u0645\u0627\u062A \u0648\u062D\u0627\u0648\u0644 \u0645\u062C\u062F\u062F\u064B\u0627.",noteDefaultLayout:"\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",noteDeviceDefaultLayout:"\u064A\u064F\u0633\u062A\u062E\u062F\u0645 \u0644\u0644\u0623\u062C\u0647\u0632\u0629 \u0627\u0644\u062A\u064A \u0644\u064A\u0633 \u0644\u0647\u0627 \u062A\u062E\u0637\u064A\u0637 \u062E\u0627\u0635",noteCustomActivityLayout:"\u062A\u062E\u0637\u064A\u0637 \u0623\u0646\u0634\u0637\u0629 \u0645\u062E\u0635\u0651\u0635 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",noteCustomDeviceLayout:"\u062A\u062E\u0637\u064A\u0637 \u0623\u062C\u0647\u0632\u0629 \u0645\u062E\u0635\u0651\u0635 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",noteUsingActivityDefault:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u0646\u0634\u0637\u0629 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645",noteUsingDeviceDefault:"\u0627\u0644\u062A\u062E\u0637\u064A\u0637 \u0627\u0644\u0627\u0641\u062A\u0631\u0627\u0636\u064A \u0644\u0644\u0623\u062C\u0647\u0632\u0629 \u0642\u064A\u062F \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645"},groups:{activity:"\u0627\u0644\u0646\u0634\u0627\u0637/\u0627\u0644\u062C\u0647\u0627\u0632",macro_favorites:"\u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648 \u0648\u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",macros_row:"\u0635\u0641 \u0648\u062D\u062F\u0627\u062A \u0627\u0644\u0645\u0627\u0643\u0631\u0648",favorites_row:"\u0635\u0641 \u0627\u0644\u0645\u0641\u0636\u0644\u0627\u062A",dpad:"\u0644\u0648\u062D\u0629 \u0627\u0644\u0627\u062A\u062C\u0627\u0647\u0627\u062A",nav:"\u0627\u0644\u0631\u062C\u0648\u0639/\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629/\u0627\u0644\u0642\u0627\u0626\u0645\u0629",mid:"\u0645\u0633\u062A\u0648\u0649 \u0627\u0644\u0635\u0648\u062A/\u0627\u0644\u0642\u0646\u0627\u0629",media:"\u0627\u0644\u062A\u0634\u063A\u064A\u0644",colors:"\u0623\u0632\u0631\u0627\u0631 \u0627\u0644\u0623\u0644\u0648\u0627\u0646",abc:JV,shortcuts:"\u0627\u0644\u0627\u062E\u062A\u0635\u0627\u0631\u0627\u062A"},keys:{up:"\u0623\u0639\u0644\u0649",down:"\u0623\u0633\u0641\u0644",left:"\u064A\u0633\u0627\u0631",right:"\u064A\u0645\u064A\u0646",ok:"\u0645\u0648\u0627\u0641\u0642",back:"\u0631\u062C\u0648\u0639",home:"\u0627\u0644\u0631\u0626\u064A\u0633\u064A\u0629",menu:"\u0627\u0644\u0642\u0627\u0626\u0645\u0629",volup:`\u0627\u0644\u0635\u0648\u062A ${c("+")}`,voldn:`\u0627\u0644\u0635\u0648\u062A ${c("-")}`,mute:"\u0643\u062A\u0645 \u0627\u0644\u0635\u0648\u062A",chup:`\u0627\u0644\u0642\u0646\u0627\u0629 ${c("+")}`,chdn:`\u0627\u0644\u0642\u0646\u0627\u0629 ${c("-")}`,guide:"\u062F\u0644\u064A\u0644 \u0627\u0644\u0628\u0631\u0627\u0645\u062C",dvr:hH,play:"\u062A\u0634\u063A\u064A\u0644",exit:"EXIT",rew:"\u062A\u0631\u062C\u064A\u0639",pause:"\u0625\u064A\u0642\u0627\u0641 \u0645\u0624\u0642\u062A",fwd:"\u062A\u0642\u062F\u064A\u0645 \u0633\u0631\u064A\u0639",red:"\u0623\u062D\u0645\u0631",green:"\u0623\u062E\u0636\u0631",yellow:"\u0623\u0635\u0641\u0631",blue:"\u0623\u0632\u0631\u0642",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"\u0625\u062F\u062E\u0627\u0644"}};b("ar",Ce);b("en-gb",{card:{favoritesTab:"Favourites",noFavorites:"No favourites available"},sidebar:{pullHandle:"Open favourites and macros"},editor:{fieldLabels:{use_background_override:"Customise background colour",background_override:"Select background colour"},favorites:"Favourites",macrosFavoritesAsRows:"Macros/Favourites as rows"},groups:{macro_favorites:"Macros/Favourites",favorites_row:"Favourites row",colors:"Colour buttons"}});var He={card:{selectEntityError:"W\xE4hle eine Sofabaton-Fernsteuerungsentit\xE4t aus",remoteUnavailable:"Die Fernsteuerung ist nicht verf\xFCgbar (m\xF6glicherweise ist die Sofabaton-App verbunden).",noActivitiesWarning:"Keine Aktivit\xE4ten in den Attributen der Fernsteuerung gefunden.",noMacros:"Keine Makros verf\xFCgbar",noFavorites:"Keine Favoriten verf\xFCgbar",noCommands:"Keine Befehle verf\xFCgbar",macrosTab:"Makros",favoritesTab:"Favoriten",commandsTab:"Befehle",powerButton:"Ein-/Ausschalten",activitySelectLabel:"Aktivit\xE4t",deviceSelectLabel:"Ger\xE4t",selectDevice:"Ger\xE4t ausw\xE4hlen",allDevicesLayout:"Standard-Ger\xE4telayout",filterCommands:"Befehle filtern",switchToDeviceMode:"In den Ger\xE4temodus wechseln",switchToActivityMode:"In den Aktivit\xE4tsmodus wechseln",deviceKeymapMissing:"Die Befehle dieses Ger\xE4ts sind noch nicht im Cache. Aktualisiere das Ger\xE4t im Hub-Tab der Sofabaton-Steuerzentrale und lade danach das Dashboard neu.",deviceKeymapError:"Die Befehle dieses Ger\xE4ts konnten nicht geladen werden.",deviceKeymapMissingServer:"Dieses Ger\xE4t ist nicht im Katalog des Hubs. Aktualisiere den Hub in der Sofabaton-Steuerzentrale und lade diese Seite dann neu.",serverReadFailed:"Die Hub-Daten konnten nicht vom Server geladen werden. Pr\xFCfe die Verbindung und versuche es erneut.",controlRefused:"Der Befehl konnte nicht ausgef\xFChrt werden. Versuche es erneut.",poweredOff:"Ausgeschaltet",defaultLayout:"Standard-Aktivit\xE4tslayout",activityFallback:C=>`Aktivit\xE4t ${C}`,deviceFallback:C=>`Ger\xE4t ${C}`,pickerName:"Virtuelle Sofabaton-Fernbedienung",pickerDescription:"Eine konfigurierbare Fernbedienung f\xFCr die Sofabaton-X1-, X1S- und X2-Integration."},sidebar:{title:"Virtuelle Fernbedienung",controlPanel:"Steuerzentrale",hubMenu:"Hub w\xE4hlen",back:"Zur\xFCck",hubReachable:"Erreichbar",hubUnreachable:"Nicht erreichbar",noHubs:"Es ist noch kein Sofabaton-Hub eingerichtet.",hubUnavailable:"Hub nicht verf\xFCgbar",remoteUnavailable:"Die Fernsteuerung f\xFCr diesen Hub ist nicht verf\xFCgbar.",controlPanelLoadFailed:"Die Steuerzentrale konnte nicht geladen werden. Lade die Seite neu, um es erneut zu versuchen.",activities:"Aktivit\xE4ten",devices:"Ger\xE4te",allOff:"Alles aus",off:"Aus",modeToggle:"Zwischen Aktivit\xE4ten und Ger\xE4ten wechseln",numberPad:"Ziffernblock",pullHandle:"Favoriten und Makros \xF6ffnen",pullHandleCommands:"Befehle \xF6ffnen",close:"Schlie\xDFen",pinToDock:C=>`${C} an das Dock anheften`,pinnedToDock:C=>`${C}, an das Dock angeheftet`,dockShortcut:"Dock-Verkn\xFCpfung",dockSwap:"Seite wechseln",dockOnLeft:"Auf der linken Seite",dockOnRight:"Auf der rechten Seite",unpin:"L\xF6sen",dockFull:"Das Dock ist voll",dockIcon:"Symbol",starting:"Wird gestartet",poweringOff:"Wird ausgeschaltet",working:"Wird ausgef\xFChrt",appConnected:"Die Sofabaton-App ist verbunden",operations:{backup_restore:"Backup wird wiederhergestellt",cache_refresh:"Hub-Cache wird aktualisiert",entity_sync:"Wird mit dem Hub synchronisiert",backup_export:"Backup wird erstellt",wifi_deploy:"Wifi Commands werden synchronisiert"}},assist:{label:"Tastendr\xFCcke erfassen",waiting:"Warten auf Tastendruck",exitEditMode:"Bearbeitungsmodus verlassen, um zu beginnen",captured:C=>`Erfasst: ${C}`,notCaptured:"Nicht erfasst.",working:"Wird ausgef\xFChrt\u2026",triggersReady:"Ausl\xF6ser einsatzbereit",createTriggers:"MQTT-Discovery-Ausl\xF6ser erstellen",startCapturing:"Befehlserfassung starten",deviceDetectedTitle:"Sofabaton-MQTT-Ger\xE4t erkannt.",close:"Schlie\xDFen",alsoActivityTriggers:"Zus\xE4tzlich Ausl\xF6ser f\xFCr Aktivit\xE4tswechsel erstellen.",seeDocs:"Dokumentation zu dieser Funktion anzeigen.",dontShowAgain:"F\xFCr dieses Ger\xE4t w\xE4hrend dieser Sitzung nicht erneut anzeigen.",detectedDevice:C=>`MQTT-Ger\xE4t erkannt: ${C}.`,lastCommand:C=>`Letzter Befehl: ${C}.`,existingTriggers:"Vorhandene MQTT-Automatisierungsausl\xF6ser wurden gefunden.",noMqttCommands:"Noch keine MQTT-Befehle erkannt",deviceFallback:C=>`Ger\xE4t ${C}`,unknownDevice:"Unbekanntes Ger\xE4t",commandFallback:C=>`Befehl ${C}`,createdTriggers:(C,V)=>`${C} MQTT-Discovery-Ausl\xF6ser f\xFCr ${V} ${C===1?"wurde":"wurden"} erstellt`,createdActivityTriggers:C=>`${C} Aktivit\xE4tsausl\xF6ser f\xFCr X2 \u2192 Activities ${C===1?"wurde":"wurden"} erstellt`,plusActivityTriggers:C=>`; zus\xE4tzlich ${C===1?"wurde":"wurden"} ${C} Aktivit\xE4tsausl\xF6ser erstellt`,allTriggersExist:C=>`Alle MQTT-Discovery-Ausl\xF6ser f\xFCr ${C} sind bereits vorhanden`,buttonFallback:"Taste",activityFallbackLabel:"Aktivit\xE4t",unknown:"Unbekannt",automationAssistName:"Automatisierungsassistent",notification:{title:"\u{1F6E0}\uFE0F Automatisierungsassistent",eventButton:C=>`Taste: ${C}`,eventCommand:C=>`Befehl: ${C}`,eventActivity:C=>`Aktivit\xE4tswechsel: ${C}`,eventOther:C=>`Ereignis: ${C}`,header:(C,V)=>`**Aktivit\xE4t: ${C} | ${V}**`,headerDevice:(C,V)=>`**Ger\xE4t: ${C} | ${V}**`,lovelaceHeading:"\u{1F4CB} **Lovelace-Schaltfl\xE4chencode**",lovelaceCopy:"*In das Dashboard-YAML kopieren:*",serviceHeading:"\u2699\uFE0F **Dienstaufruf (Automatisierung)**",serviceCopy:"*In Skripten oder Automatisierungen verwenden:*"}},editor:{fieldLabels:{entity:"Sofabaton-Fernsteuerungsentit\xE4t ausw\xE4hlen",theme:"Theme auf die Karte anwenden",use_background_override:"Hintergrundfarbe anpassen",background_override:"Hintergrundfarbe ausw\xE4hlen",max_width:"Maximale Kartenbreite (px)",key_style:"Tastenstil"},generalOptionsTitle:"Allgemeine Optionen",keyCapture:"Tastendr\xFCcke erfassen",keyCaptureDescription:"Sende Tastendr\xFCcke an den Hub, um sofort einsatzbereites YAML f\xFCr Dashboard-Schaltfl\xE4chen und Automatisierungen zu erzeugen.",keyCaptureLearnMore:"Mehr \xFCber die Tastenerfassung erfahren",keyCaptureDocsAria:"Dokumentation zur Tastenerfassung",stylingOptions:"Stiloptionen",keyStyleFlat:"Flach (wie der Kartenhintergrund)",keyStyleTinted:"Get\xF6nt (Tasten heben sich vom Hintergrund ab)",keyStyleElevated:"Erh\xF6ht (get\xF6nt mit Schatten)",keyStyleGlossy:"Gl\xE4nzend (gl\xE4nzende, gew\xF6lbte Tasten)",tintedPanels:"Get\xF6nte Panels",tintedPanelsDescription:"Zeigt hinter jeder Tastengruppe einen get\xF6nten Hintergrund an.",layoutOptions:"Layoutoptionen",layoutSelectLabel:"Layout",defaultLayoutOption:"Standard-Aktivit\xE4tslayout",allDevicesOption:"Standard-Ger\xE4telayout",commands:"Befehle",power:"Ein-/Aus-Taste",modeToggle:"Modusschalter",deviceModeDescription:"Steuere ein einzelnes, im Hub eingerichtetes Ger\xE4t mit dessen Tastenbelegungen und vollst\xE4ndiger Befehlsliste.",longPress:"Wiederholen beim Gedr\xFCckthalten aktivieren",longPressDescription:"Halte eine ausgew\xE4hlte Taste gedr\xFCckt, um ihren Befehl wiederholt zu senden \u2013 wie bei der physischen Fernbedienung.",longPressButtons:"Tasten",enableDeviceMode:"Ger\xE4temodus aktivieren",initialView:"Anfangsansicht",initialViewHelper:"Was die Karte beim \xD6ffnen anzeigt",openOnCurrentActivity:"Aktuelle Aktivit\xE4t",macrosFavoritesAsRows:"Makros/Favoriten als Zeilen",commandsAsRows:"Befehle als Zeilen",favoriteDeviceNames:"Ger\xE4tenamen anzeigen",rowOptions:C=>`Optionen f\xFCr ${C}`,visibleRows:"Sichtbare Zeilen",moveGroupUp:C=>`${C} nach oben verschieben`,moveGroupDown:C=>`${C} nach unten verschieben`,fewerVisibleRows:"Weniger sichtbare Zeilen",moreVisibleRows:"Mehr sichtbare Zeilen",reorderGroupHandle:C=>`${C} verschieben (Pfeiltasten)`,macros:"Makros",favorites:"Favoriten",volume:"Lautst\xE4rke",channel:"Kanal",mediaControls:"Wiedergabe",dvr:"DVR",numpad:"Ziffernblock",resetDefaultLayout:"Layout zur\xFCcksetzen",shortcutSlotLeft:"Linke Verkn\xFCpfung",shortcutSlotMiddle:"Mittlere Verkn\xFCpfung",shortcutSlotRight:"Rechte Verkn\xFCpfung",shortcutIcon:"Symbol",shortcutCommand:"Befehl",shortcutReset:"Zur\xFCcksetzen",shortcutCommandMissing:C=>`Befehl ${C} (fehlt)`,shortcutsCommandsLoading:"Befehle werden geladen\u2026",shortcutsCommandsUnavailable:"Die Befehle dieses Ger\xE4ts sind noch nicht im Cache. Aktualisiere das Ger\xE4t im Hub-Tab der Sofabaton-Steuerzentrale und lade danach das Dashboard neu.",shortcutsCommandsError:"Die Befehle dieses Ger\xE4ts konnten nicht geladen werden. Lade das Dashboard neu und versuche es erneut.",noteDefaultLayout:"F\xFCr Aktivit\xE4ten ohne eigenes Layout",noteDeviceDefaultLayout:"F\xFCr Ger\xE4te ohne eigenes Layout",noteCustomActivityLayout:"Benutzerdefiniertes Aktivit\xE4tslayout aktiv",noteCustomDeviceLayout:"Benutzerdefiniertes Ger\xE4telayout aktiv",noteUsingActivityDefault:"Standard-Aktivit\xE4tslayout aktiv",noteUsingDeviceDefault:"Standard-Ger\xE4telayout aktiv"},groups:{activity:"Aktivit\xE4t/Ger\xE4t",macro_favorites:"Makros/Favoriten",macros_row:"Makrozeile",favorites_row:"Favoritenzeile",dpad:"Steuerkreuz",nav:"Zur\xFCck/Home/Men\xFC",mid:"Lautst\xE4rke/Kanal",media:"Wiedergabe",colors:"Farbtasten",abc:"A/B/C",shortcuts:"Verkn\xFCpfungen"},keys:{up:"Nach oben",down:"Nach unten",left:"Nach links",right:"Nach rechts",ok:"OK",back:"Zur\xFCck",home:"Home",menu:"Men\xFC",volup:"Lautst\xE4rke +",voldn:"Lautst\xE4rke -",mute:"Stumm",chup:"Kanal +",chdn:"Kanal -",guide:"Guide",dvr:"DVR",play:"Wiedergabe",exit:"EXIT",rew:"Zur\xFCckspulen",pause:"Pause",fwd:"Vorspulen",red:"Rot",green:"Gr\xFCn",yellow:"Gelb",blue:"Blau",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Enter"}};b("de",He);var o1=(C,V,H=`${V}s`)=>C===1?V:H,Ve={card:{selectEntityError:"Selecciona una entidad de mando a distancia Sofabaton",remoteUnavailable:"El mando a distancia no est\xE1 disponible (posiblemente porque la aplicaci\xF3n Sofabaton est\xE1 conectada).",noActivitiesWarning:"No se encontraron actividades en los atributos del mando a distancia.",noMacros:"No hay macros disponibles",noFavorites:"No hay favoritos disponibles",noCommands:"No hay comandos disponibles",macrosTab:"Macros",favoritesTab:"Favoritos",commandsTab:"Comandos",powerButton:"Alternar encendido/apagado",activitySelectLabel:"Actividad",deviceSelectLabel:"Dispositivo",selectDevice:"Seleccionar dispositivo",allDevicesLayout:"Dise\xF1o predeterminado de dispositivos",filterCommands:"Filtrar comandos",switchToDeviceMode:"Cambiar al modo de dispositivo",switchToActivityMode:"Cambiar al modo de actividad",deviceKeymapMissing:"Los comandos de este dispositivo a\xFAn no est\xE1n en cach\xE9. Actualiza el dispositivo en la pesta\xF1a Hub del Panel de control Sofabaton y vuelve a cargar el panel de Home Assistant.",deviceKeymapError:"No se pudieron cargar los comandos de este dispositivo.",deviceKeymapMissingServer:"Este dispositivo no est\xE1 en el cat\xE1logo del hub. Actualiza el hub en el panel de control de Sofabaton y vuelve a cargar esta p\xE1gina.",serverReadFailed:"No se pudieron cargar los datos del hub desde el servidor. Comprueba la conexi\xF3n y vuelve a intentarlo.",controlRefused:"No se pudo completar el comando. Vuelve a intentarlo.",poweredOff:"Apagado",defaultLayout:"Dise\xF1o predeterminado de actividades",activityFallback:C=>`Actividad ${C}`,deviceFallback:C=>`Dispositivo ${C}`,pickerName:"Mando a distancia virtual Sofabaton",pickerDescription:"Un mando a distancia configurable para la integraci\xF3n Sofabaton X1, X1S y X2."},sidebar:{title:"Mando virtual",controlPanel:"Panel de control",hubMenu:"Elegir un hub",back:"Atr\xE1s",hubReachable:"Accesible",hubUnreachable:"Inaccesible",noHubs:"Todav\xEDa no hay ning\xFAn hub Sofabaton configurado.",hubUnavailable:"Hub no disponible",remoteUnavailable:"El mando a distancia de este hub no est\xE1 disponible.",controlPanelLoadFailed:"No se pudo cargar el panel de control. Recarga la p\xE1gina para volver a intentarlo.",activities:"Actividades",devices:"Dispositivos",allOff:"Apagar todo",off:"Apagado",modeToggle:"Cambiar entre actividades y dispositivos",numberPad:"Teclado num\xE9rico",pullHandle:"Abrir favoritos y macros",pullHandleCommands:"Abrir comandos",close:"Cerrar",pinToDock:C=>`Fijar ${C} en el dock`,pinnedToDock:C=>`${C}, fijado en el dock`,dockShortcut:"Acceso directo del dock",dockSwap:"Cambiar de lado",dockOnLeft:"A la izquierda",dockOnRight:"A la derecha",unpin:"Dejar de fijar",dockFull:"El dock est\xE1 lleno",dockIcon:"Icono",starting:"Iniciando",poweringOff:"Apagando",working:"Procesando",appConnected:"La aplicaci\xF3n Sofabaton est\xE1 conectada",operations:{backup_restore:"Restaurando copia de seguridad",cache_refresh:"Actualizando la cach\xE9 del hub",entity_sync:"Sincronizando con el hub",backup_export:"Creando copia de seguridad",wifi_deploy:"Sincronizando Wifi Commands"}},assist:{label:"Captura de botones",waiting:"Esperando a que se pulse un bot\xF3n",exitEditMode:"Sal del modo de edici\xF3n para comenzar",captured:C=>`Capturado: ${C}`,notCaptured:"Sin capturar.",working:"Procesando\u2026",triggersReady:"Desencadenantes listos para usar",createTriggers:"Crear desencadenantes de MQTT Discovery",startCapturing:"Iniciar la captura de comandos",deviceDetectedTitle:"Se ha detectado un dispositivo MQTT de Sofabaton.",close:"Cerrar",alsoActivityTriggers:"Crear tambi\xE9n desencadenantes para los cambios de actividad.",seeDocs:"Consulta la documentaci\xF3n de esta funci\xF3n.",dontShowAgain:"No volver a mostrar este mensaje para este dispositivo durante esta sesi\xF3n.",detectedDevice:C=>`Dispositivo MQTT detectado: ${C}.`,lastCommand:C=>`\xDAltimo comando: ${C}.`,existingTriggers:"Se encontraron desencadenantes existentes de automatizaci\xF3n MQTT.",noMqttCommands:"A\xFAn no se han detectado comandos MQTT",deviceFallback:C=>`Dispositivo ${C}`,unknownDevice:"Dispositivo desconocido",commandFallback:C=>`Comando ${C}`,createdTriggers:(C,V)=>`${C} ${o1(C,"desencadenante")} de MQTT Discovery ${o1(C,"creado")} para ${V}`,createdActivityTriggers:C=>`${C} ${o1(C,"desencadenante")} de actividad ${o1(C,"creado")} para X2 \u2192 Activities`,plusActivityTriggers:C=>`; adem\xE1s, ${C} ${o1(C,"desencadenante")} de actividad ${o1(C,"creado")}`,allTriggersExist:C=>`Ya existen todos los desencadenantes de MQTT Discovery para ${C}`,buttonFallback:"Bot\xF3n",activityFallbackLabel:"Actividad",unknown:"Desconocido",automationAssistName:"Asistente de automatizaci\xF3n",notification:{title:"\u{1F6E0}\uFE0F Asistente de automatizaci\xF3n",eventButton:C=>`Bot\xF3n: ${C}`,eventCommand:C=>`Comando: ${C}`,eventActivity:C=>`Cambio de actividad: ${C}`,eventOther:C=>`Evento: ${C}`,header:(C,V)=>`**Actividad: ${C} | ${V}**`,headerDevice:(C,V)=>`**Dispositivo: ${C} | ${V}**`,lovelaceHeading:"\u{1F4CB} **C\xF3digo de bot\xF3n Lovelace**",lovelaceCopy:"*Copia esto en el YAML de tu panel:*",serviceHeading:"\u2699\uFE0F **Llamada de servicio (automatizaci\xF3n)**",serviceCopy:"*Usa esto en tus scripts o automatizaciones:*"}},editor:{fieldLabels:{entity:"Seleccionar una entidad de mando a distancia Sofabaton",theme:"Aplicar un tema a la tarjeta",use_background_override:"Personalizar el color de fondo",background_override:"Seleccionar el color de fondo",max_width:"Ancho m\xE1ximo de la tarjeta (px)",key_style:"Estilo de los botones"},generalOptionsTitle:"Opciones generales",keyCapture:"Captura de botones",keyCaptureDescription:"Env\xEDa pulsaciones de botones al hub para generar YAML listo para usar en botones del panel y automatizaciones.",keyCaptureLearnMore:"M\xE1s informaci\xF3n sobre la captura de botones",keyCaptureDocsAria:"Documentaci\xF3n sobre la captura de botones",stylingOptions:"Opciones de estilo",keyStyleFlat:"Plano (igual que el fondo de la tarjeta)",keyStyleTinted:"Tintado (los botones destacan sobre el fondo)",keyStyleElevated:"Elevado (tintado con sombra)",keyStyleGlossy:"Brillante (botones curvos y brillantes)",tintedPanels:"Paneles tintados",tintedPanelsDescription:"Muestra un fondo tintado detr\xE1s de cada grupo de botones.",layoutOptions:"Opciones de dise\xF1o",layoutSelectLabel:"Dise\xF1o",defaultLayoutOption:"Dise\xF1o predeterminado de actividades",allDevicesOption:"Dise\xF1o predeterminado de dispositivos",commands:"Comandos",power:"Bot\xF3n de encendido/apagado",modeToggle:"Bot\xF3n de modo",deviceModeDescription:"Controla un \xFAnico dispositivo configurado en el hub mediante sus asignaciones de botones y su lista completa de comandos.",longPress:"Activar la repetici\xF3n al mantener pulsado un bot\xF3n",longPressDescription:"Mant\xE9n pulsado un bot\xF3n seleccionado para enviar su comando repetidamente, como en el mando a distancia f\xEDsico.",longPressButtons:"Botones",enableDeviceMode:"Activar el modo de dispositivo",initialView:"Vista inicial",initialViewHelper:"Lo que muestra la tarjeta al abrirse",openOnCurrentActivity:"Actividad actual",macrosFavoritesAsRows:"Macros/favoritos como filas",commandsAsRows:"Comandos como filas",favoriteDeviceNames:"Mostrar nombres de dispositivos",rowOptions:C=>`Opciones de ${C}`,visibleRows:"Filas visibles",moveGroupUp:C=>`Mover ${C} hacia arriba`,moveGroupDown:C=>`Mover ${C} hacia abajo`,fewerVisibleRows:"Menos filas visibles",moreVisibleRows:"M\xE1s filas visibles",reorderGroupHandle:C=>`Reordenar ${C} (teclas de flecha)`,macros:"Macros",favorites:"Favoritos",volume:"Volumen",channel:"Canal",mediaControls:"Reproducci\xF3n",dvr:"DVR",numpad:"Teclado num\xE9rico",resetDefaultLayout:"Restablecer dise\xF1o",shortcutSlotLeft:"Acceso directo izquierdo",shortcutSlotMiddle:"Acceso directo central",shortcutSlotRight:"Acceso directo derecho",shortcutIcon:"Icono",shortcutCommand:"Comando",shortcutReset:"Restablecer",shortcutCommandMissing:C=>`Comando ${C} (no encontrado)`,shortcutsCommandsLoading:"Cargando comandos\u2026",shortcutsCommandsUnavailable:"Los comandos de este dispositivo a\xFAn no est\xE1n en cach\xE9. Actualiza el dispositivo en la pesta\xF1a Hub del Panel de control Sofabaton y vuelve a cargar el panel de Home Assistant.",shortcutsCommandsError:"No se pudieron cargar los comandos de este dispositivo. Vuelve a cargar el panel de Home Assistant e int\xE9ntalo de nuevo.",noteDefaultLayout:"Se usa para actividades sin un dise\xF1o propio",noteDeviceDefaultLayout:"Se usa para dispositivos sin un dise\xF1o propio",noteCustomActivityLayout:"Se est\xE1 usando un dise\xF1o de actividad personalizado",noteCustomDeviceLayout:"Se est\xE1 usando un dise\xF1o de dispositivo personalizado",noteUsingActivityDefault:"Se est\xE1 usando el dise\xF1o predeterminado de actividades",noteUsingDeviceDefault:"Se est\xE1 usando el dise\xF1o predeterminado de dispositivos"},groups:{activity:"Actividad/dispositivo",macro_favorites:"Macros/favoritos",macros_row:"Fila de macros",favorites_row:"Fila de favoritos",dpad:"Control direccional",nav:"Atr\xE1s/Inicio/Men\xFA",mid:"Volumen/Canal",media:"Reproducci\xF3n",colors:"Botones de colores",abc:"A/B/C",shortcuts:"Accesos directos"},keys:{up:"Arriba",down:"Abajo",left:"Izquierda",right:"Derecha",ok:"OK",back:"Atr\xE1s",home:"Inicio",menu:"Men\xFA",volup:"Volumen +",voldn:"Volumen -",mute:"Silencio",chup:"Canal +",chdn:"Canal -",guide:"Gu\xEDa",dvr:"DVR",play:"Reproducir",exit:"EXIT",rew:"Retroceder",pause:"Pausa",fwd:"Avance r\xE1pido",red:"Rojo",green:"Verde",yellow:"Amarillo",blue:"Azul",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Intro"}};b("es",Ve);var M1=(C,V,H=`${V}s`)=>C>1?H:V,ee={card:{selectEntityError:"S\xE9lectionnez une entit\xE9 de t\xE9l\xE9commande Sofabaton",remoteUnavailable:"La t\xE9l\xE9commande n\u2019est pas disponible (peut-\xEAtre parce que l\u2019application Sofabaton est connect\xE9e).",noActivitiesWarning:"Aucune activit\xE9 trouv\xE9e dans les attributs de la t\xE9l\xE9commande.",noMacros:"Aucune macro disponible",noFavorites:"Aucun favori disponible",noCommands:"Aucune commande disponible",macrosTab:"Macros",favoritesTab:"Favoris",commandsTab:"Commandes",powerButton:"Basculer marche/arr\xEAt",activitySelectLabel:"Activit\xE9",deviceSelectLabel:"Appareil",selectDevice:"S\xE9lectionner un appareil",allDevicesLayout:"Disposition par d\xE9faut des appareils",filterCommands:"Filtrer les commandes",switchToDeviceMode:"Passer en mode appareil",switchToActivityMode:"Passer en mode activit\xE9",deviceKeymapMissing:"Les commandes de cet appareil ne sont pas encore en cache. Actualisez l\u2019appareil dans l\u2019onglet Hub du Panneau de contr\xF4le Sofabaton, puis rechargez le tableau de bord.",deviceKeymapError:"Impossible de charger les commandes de cet appareil.",deviceKeymapMissingServer:"Cet appareil ne figure pas dans le catalogue du hub. Actualisez le hub dans le panneau de contr\xF4le Sofabaton, puis rechargez cette page.",serverReadFailed:"Impossible de charger les donn\xE9es du hub depuis le serveur. V\xE9rifiez la connexion, puis r\xE9essayez.",controlRefused:"La commande n\u2019a pas pu \xEAtre ex\xE9cut\xE9e. R\xE9essayez.",poweredOff:"\xC9teinte",defaultLayout:"Disposition par d\xE9faut des activit\xE9s",activityFallback:C=>`Activit\xE9 ${C}`,deviceFallback:C=>`Appareil ${C}`,pickerName:"T\xE9l\xE9commande virtuelle Sofabaton",pickerDescription:"Une t\xE9l\xE9commande configurable pour l\u2019int\xE9gration Sofabaton X1, X1S et X2."},sidebar:{title:"T\xE9l\xE9commande virtuelle",controlPanel:"Panneau de contr\xF4le",hubMenu:"Choisir un hub",back:"Retour",hubReachable:"Joignable",hubUnreachable:"Injoignable",noHubs:"Aucun hub Sofabaton n\u2019est encore configur\xE9.",hubUnavailable:"Hub indisponible",remoteUnavailable:"La t\xE9l\xE9commande de ce hub est indisponible.",controlPanelLoadFailed:"Impossible de charger le panneau de contr\xF4le. Rechargez la page pour r\xE9essayer.",activities:"Activit\xE9s",devices:"Appareils",allOff:"Tout \xE9teindre",off:"\xC9teint",modeToggle:"Basculer entre activit\xE9s et appareils",numberPad:"Pav\xE9 num\xE9rique",pullHandle:"Ouvrir les favoris et les macros",pullHandleCommands:"Ouvrir les commandes",close:"Fermer",pinToDock:C=>`\xC9pingler ${C} au dock`,pinnedToDock:C=>`${C}, \xE9pingl\xE9 au dock`,dockShortcut:"Raccourci du dock",dockSwap:"Changer de c\xF4t\xE9",dockOnLeft:"\xC0 gauche",dockOnRight:"\xC0 droite",unpin:"D\xE9s\xE9pingler",dockFull:"Le dock est plein",dockIcon:"Ic\xF4ne",starting:"D\xE9marrage",poweringOff:"Extinction",working:"Traitement en cours",appConnected:"L\u2019application Sofabaton est connect\xE9e",operations:{backup_restore:"Restauration de la sauvegarde",cache_refresh:"Actualisation du cache du hub",entity_sync:"Synchronisation avec le hub",backup_export:"Cr\xE9ation de la sauvegarde",wifi_deploy:"Synchronisation de Wifi Commands"}},assist:{label:"Capture de touches",waiting:"En attente d\u2019une pression sur une touche",exitEditMode:"Quittez le mode d\u2019\xE9dition pour commencer",captured:C=>`Capture\xA0: ${C}`,notCaptured:"Aucune capture.",working:"Traitement en cours\u2026",triggersReady:"D\xE9clencheurs pr\xEAts \xE0 l\u2019emploi",createTriggers:"Cr\xE9er les d\xE9clencheurs MQTT Discovery",startCapturing:"Commencer la capture des commandes",deviceDetectedTitle:"Appareil MQTT Sofabaton d\xE9tect\xE9.",close:"Fermer",alsoActivityTriggers:"Cr\xE9er \xE9galement des d\xE9clencheurs pour les changements d\u2019activit\xE9.",seeDocs:"Consultez la documentation de cette fonctionnalit\xE9.",dontShowAgain:"Ne plus afficher ce message pour cet appareil pendant cette session.",detectedDevice:C=>`Appareil MQTT d\xE9tect\xE9\xA0: ${C}.`,lastCommand:C=>`Derni\xE8re commande\xA0: ${C}.`,existingTriggers:"Des d\xE9clencheurs d\u2019automatisation MQTT existants ont \xE9t\xE9 trouv\xE9s.",noMqttCommands:"Aucune commande MQTT d\xE9couverte pour le moment",deviceFallback:C=>`Appareil ${C}`,unknownDevice:"Appareil inconnu",commandFallback:C=>`Commande ${C}`,createdTriggers:(C,V)=>`${C} ${M1(C,"d\xE9clencheur")} MQTT Discovery ${M1(C,"cr\xE9\xE9")} pour ${V}`,createdActivityTriggers:C=>`${C} ${M1(C,"d\xE9clencheur")} d\u2019activit\xE9 ${M1(C,"cr\xE9\xE9")} pour X2 \u2192 Activities`,plusActivityTriggers:C=>`\xA0; ${C} ${M1(C,"d\xE9clencheur")} d\u2019activit\xE9 \xE9galement ${M1(C,"cr\xE9\xE9")}`,allTriggersExist:C=>`Tous les d\xE9clencheurs MQTT Discovery existent d\xE9j\xE0 pour ${C}`,buttonFallback:"Touche",activityFallbackLabel:"Activit\xE9",unknown:"Inconnu",automationAssistName:"Assistant d\u2019automatisation",notification:{title:"\u{1F6E0}\uFE0F Assistant d\u2019automatisation",eventButton:C=>`Touche\xA0: ${C}`,eventCommand:C=>`Commande\xA0: ${C}`,eventActivity:C=>`Changement d\u2019activit\xE9\xA0: ${C}`,eventOther:C=>`\xC9v\xE9nement\xA0: ${C}`,header:(C,V)=>`**Activit\xE9\xA0: ${C} | ${V}**`,headerDevice:(C,V)=>`**Appareil\xA0: ${C} | ${V}**`,lovelaceHeading:"\u{1F4CB} **Code de bouton Lovelace**",lovelaceCopy:"*Copiez ceci dans le YAML de votre tableau de bord\xA0:*",serviceHeading:"\u2699\uFE0F **Appel de service (automatisation)**",serviceCopy:"*Utilisez ceci dans vos scripts ou automatisations\xA0:*"}},editor:{fieldLabels:{entity:"S\xE9lectionner une entit\xE9 de t\xE9l\xE9commande Sofabaton",theme:"Appliquer un th\xE8me \xE0 la carte",use_background_override:"Personnaliser la couleur d\u2019arri\xE8re-plan",background_override:"S\xE9lectionner la couleur d\u2019arri\xE8re-plan",max_width:"Largeur maximale de la carte (px)",key_style:"Style des touches"},generalOptionsTitle:"Options g\xE9n\xE9rales",keyCapture:"Capture de touches",keyCaptureDescription:"Envoyez les pressions sur les touches au hub afin de g\xE9n\xE9rer du YAML pr\xEAt \xE0 l\u2019emploi pour les boutons du tableau de bord et les automatisations.",keyCaptureLearnMore:"En savoir plus sur la capture de touches",keyCaptureDocsAria:"Documentation sur la capture de touches",stylingOptions:"Options de style",keyStyleFlat:"Plat (m\xEAme couleur que la carte)",keyStyleTinted:"Teint\xE9 (les touches se d\xE9tachent du fond)",keyStyleElevated:"Sur\xE9lev\xE9 (teint\xE9 avec ombre)",keyStyleGlossy:"Brillant (touches bomb\xE9es et brillantes)",tintedPanels:"Panneaux teint\xE9s",tintedPanelsDescription:"Affiche un fond teint\xE9 derri\xE8re chaque groupe de touches.",layoutOptions:"Options de disposition",layoutSelectLabel:"Disposition",defaultLayoutOption:"Disposition par d\xE9faut des activit\xE9s",allDevicesOption:"Disposition par d\xE9faut des appareils",commands:"Commandes",power:"Bouton Marche/Arr\xEAt",modeToggle:"Bouton de mode",deviceModeDescription:"Contr\xF4lez un seul appareil configur\xE9 sur le hub, avec ses propres attributions de touches et sa liste compl\xE8te de commandes.",longPress:"Activer la r\xE9p\xE9tition par appui prolong\xE9",longPressDescription:"Maintenez une touche s\xE9lectionn\xE9e pour envoyer sa commande de fa\xE7on r\xE9p\xE9t\xE9e, comme sur la t\xE9l\xE9commande physique.",longPressButtons:"Touches",enableDeviceMode:"Activer le mode appareil",initialView:"Vue initiale",initialViewHelper:"Ce que la carte affiche \xE0 l\u2019ouverture",openOnCurrentActivity:"Activit\xE9 en cours",macrosFavoritesAsRows:"Macros/favoris sous forme de lignes",commandsAsRows:"Commandes sous forme de lignes",favoriteDeviceNames:"Afficher les noms des appareils",rowOptions:C=>`Options de ${C}`,visibleRows:"Lignes visibles",moveGroupUp:C=>`D\xE9placer ${C} vers le haut`,moveGroupDown:C=>`D\xE9placer ${C} vers le bas`,fewerVisibleRows:"Moins de lignes visibles",moreVisibleRows:"Plus de lignes visibles",reorderGroupHandle:C=>`R\xE9ordonner ${C} (touches fl\xE9ch\xE9es)`,macros:"Macros",favorites:"Favoris",volume:"Volume",channel:"Cha\xEEne",mediaControls:"Lecture",dvr:"DVR",numpad:"Pav\xE9 num\xE9rique",resetDefaultLayout:"R\xE9initialiser",shortcutSlotLeft:"Raccourci gauche",shortcutSlotMiddle:"Raccourci central",shortcutSlotRight:"Raccourci droit",shortcutIcon:"Ic\xF4ne",shortcutCommand:"Commande",shortcutReset:"R\xE9initialiser",shortcutCommandMissing:C=>`Commande ${C} (manquante)`,shortcutsCommandsLoading:"Chargement des commandes\u2026",shortcutsCommandsUnavailable:"Les commandes de cet appareil ne sont pas encore en cache. Actualisez l\u2019appareil dans l\u2019onglet Hub du Panneau de contr\xF4le Sofabaton, puis rechargez le tableau de bord.",shortcutsCommandsError:"Impossible de charger les commandes de cet appareil. Rechargez le tableau de bord et r\xE9essayez.",noteDefaultLayout:"Utilis\xE9e pour les activit\xE9s sans disposition propre",noteDeviceDefaultLayout:"Utilis\xE9e pour les appareils sans disposition propre",noteCustomActivityLayout:"Disposition d\u2019activit\xE9 personnalis\xE9e utilis\xE9e",noteCustomDeviceLayout:"Disposition d\u2019appareil personnalis\xE9e utilis\xE9e",noteUsingActivityDefault:"Disposition par d\xE9faut des activit\xE9s utilis\xE9e",noteUsingDeviceDefault:"Disposition par d\xE9faut des appareils utilis\xE9e"},groups:{activity:"Activit\xE9/appareil",macro_favorites:"Macros/favoris",macros_row:"Ligne des macros",favorites_row:"Ligne des favoris",dpad:"Pav\xE9 directionnel",nav:"Retour/Accueil/Menu",mid:"Volume/Cha\xEEne",media:"Lecture",colors:"Touches de couleur",abc:"A/B/C",shortcuts:"Raccourcis"},keys:{up:"Haut",down:"Bas",left:"Gauche",right:"Droite",ok:"OK",back:"Retour",home:"Accueil",menu:"Menu",volup:"Volume +",voldn:"Volume -",mute:"Muet",chup:"Cha\xEEne +",chdn:"Cha\xEEne -",guide:"Guide",dvr:"DVR",play:"Lecture",exit:"EXIT",rew:"Retour rapide",pause:"Pause",fwd:"Avance rapide",red:"Rouge",green:"Vert",yellow:"Jaune",blue:"Bleu",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Entr\xE9e"}};b("fr",ee);var Le={card:{selectEntityError:"Selecteer een Sofabaton-entiteit voor afstandsbediening",remoteUnavailable:"De afstandsbediening is niet beschikbaar (mogelijk omdat de Sofabaton-app verbonden is).",noActivitiesWarning:"Geen activiteiten gevonden in de attributen van de afstandsbediening.",noMacros:"Geen macro's beschikbaar",noFavorites:"Geen favorieten beschikbaar",noCommands:"Geen commando's beschikbaar",macrosTab:"Macro's",favoritesTab:"Favorieten",commandsTab:"Commando's",powerButton:"In-/uitschakelen",activitySelectLabel:"Activiteit",deviceSelectLabel:"Apparaat",selectDevice:"Selecteer apparaat",allDevicesLayout:"Standaardindeling voor apparaten",filterCommands:"Commando's filteren",switchToDeviceMode:"Naar apparaatmodus schakelen",switchToActivityMode:"Naar activiteitsmodus schakelen",deviceKeymapMissing:"De commando's van dit apparaat zijn nog niet gecachet. Vernieuw het apparaat op het tabblad Hub van het Sofabaton-bedieningspaneel en laad daarna het dashboard opnieuw.",deviceKeymapError:"Kan de commando's van dit apparaat niet laden.",deviceKeymapMissingServer:"Dit apparaat staat niet in de catalogus van de hub. Vernieuw de hub in het Sofabaton-bedieningspaneel en laad deze pagina daarna opnieuw.",serverReadFailed:"De hubgegevens konden niet van de server worden geladen. Controleer de verbinding en probeer het opnieuw.",controlRefused:"Het commando kon niet worden uitgevoerd. Probeer het opnieuw.",poweredOff:"Uitgeschakeld",defaultLayout:"Standaardindeling voor activiteiten",activityFallback:C=>`Activiteit ${C}`,deviceFallback:C=>`Apparaat ${C}`,pickerName:"Sofabaton virtuele afstandsbediening",pickerDescription:"Een configureerbare afstandsbediening voor de Sofabaton X1-, X1S- en X2-integratie."},sidebar:{title:"Virtuele afstandsbediening",controlPanel:"Bedieningspaneel",hubMenu:"Kies een hub",back:"Terug",hubReachable:"Bereikbaar",hubUnreachable:"Niet bereikbaar",noHubs:"Er is nog geen Sofabaton-hub ingesteld.",hubUnavailable:"Hub niet beschikbaar",remoteUnavailable:"De afstandsbediening voor deze hub is niet beschikbaar.",controlPanelLoadFailed:"Het bedieningspaneel kon niet worden geladen. Laad de pagina opnieuw om het nogmaals te proberen.",activities:"Activiteiten",devices:"Apparaten",allOff:"Alles uit",off:"Uit",modeToggle:"Wisselen tussen activiteiten en apparaten",numberPad:"Cijfertoetsen",pullHandle:"Favorieten en macro's openen",pullHandleCommands:"Commando's openen",close:"Sluiten",pinToDock:C=>`${C} vastzetten in het dock`,pinnedToDock:C=>`${C}, vastgezet in het dock`,dockShortcut:"Dock-snelkoppeling",dockSwap:"Van kant wisselen",dockOnLeft:"Aan de linkerkant",dockOnRight:"Aan de rechterkant",unpin:"Losmaken",dockFull:"Het dock is vol",dockIcon:"Pictogram",starting:"Wordt gestart",poweringOff:"Wordt uitgeschakeld",working:"Bezig",appConnected:"De Sofabaton-app is verbonden",operations:{backup_restore:"Back-up wordt hersteld",cache_refresh:"Hubcache wordt vernieuwd",entity_sync:"Synchronisatie met hub wordt uitgevoerd",backup_export:"Back-up wordt gemaakt",wifi_deploy:"Wifi Commands worden gesynchroniseerd"}},assist:{label:"Knopdrukken registreren",waiting:"Wachten op een knopdruk",exitEditMode:"Verlaat de bewerkingsmodus om te beginnen",captured:C=>`Vastgelegd: ${C}`,notCaptured:"Niet vastgelegd.",working:"Bezig\u2026",triggersReady:"Triggers klaar voor gebruik",createTriggers:"MQTT Discovery-triggers aanmaken",startCapturing:"Begin met commando's vastleggen",deviceDetectedTitle:"Sofabaton-MQTT-apparaat gedetecteerd.",close:"Sluiten",alsoActivityTriggers:"Maak ook triggers aan voor activiteitswisselingen.",seeDocs:"Bekijk de documentatie voor deze functie.",dontShowAgain:"Dit tijdens deze sessie niet opnieuw tonen voor dit apparaat.",detectedDevice:C=>`MQTT-apparaat gedetecteerd: ${C}.`,lastCommand:C=>`Laatste commando: ${C}.`,existingTriggers:"Er zijn bestaande MQTT-automatiseringstriggers gevonden.",noMqttCommands:"Nog geen MQTT-commando's ontdekt",deviceFallback:C=>`Apparaat ${C}`,unknownDevice:"Onbekend apparaat",commandFallback:C=>`Commando ${C}`,createdTriggers:(C,V)=>`${C} MQTT Discovery-triggers aangemaakt voor ${V}`,createdActivityTriggers:C=>`${C} activiteitstriggers aangemaakt voor X2 \u2192 Activities`,plusActivityTriggers:C=>` plus ${C} activiteitstriggers`,allTriggersExist:C=>`Alle MQTT Discovery-triggers bestaan al voor ${C}`,buttonFallback:"Knop",activityFallbackLabel:"Activiteit",unknown:"Onbekend",automationAssistName:"Automatiseringshulp",notification:{title:"\u{1F6E0}\uFE0F Automatiseringshulp",eventButton:C=>`Knop: ${C}`,eventCommand:C=>`Commando: ${C}`,eventActivity:C=>`Activiteitswissel: ${C}`,eventOther:C=>`Gebeurtenis: ${C}`,header:(C,V)=>`**Activiteit: ${C} | ${V}**`,headerDevice:(C,V)=>`**Apparaat: ${C} | ${V}**`,lovelaceHeading:"\u{1F4CB} **Lovelace-knopcode**",lovelaceCopy:"*Kopieer dit naar je dashboard-YAML:*",serviceHeading:"\u2699\uFE0F **Service-aanroep (automatisering)**",serviceCopy:"*Gebruik dit in je scripts of automatiseringen:*"}},editor:{fieldLabels:{entity:"Selecteer een Sofabaton-entiteit voor afstandsbediening",theme:"Pas een thema toe op de kaart",use_background_override:"Achtergrondkleur aanpassen",background_override:"Kies een achtergrondkleur",max_width:"Maximale kaartbreedte (px)",key_style:"Knopstijl"},generalOptionsTitle:"Algemene opties",keyCapture:"Knopdrukken registreren",keyCaptureDescription:"Stuur knopdrukken naar de hub: leg knopdrukken vast om direct bruikbare YAML te genereren voor dashboardknoppen en automatiseringen.",keyCaptureLearnMore:"Meer informatie over Knopdrukken registreren",keyCaptureDocsAria:"Documentatie over Knopdrukken registreren",stylingOptions:"Stijlopties",keyStyleFlat:"Vlak (zelfde kleur als de kaart)",keyStyleTinted:"Getint (knoppen steken af tegen de achtergrond)",keyStyleElevated:"Verhoogd (getint met schaduw)",keyStyleGlossy:"Glanzend (glimmende, bolle knoppen)",tintedPanels:"Getinte panelen",tintedPanelsDescription:"Toont een getinte achtergrond achter elke groep knoppen.",layoutOptions:"Indelingsopties",layoutSelectLabel:"Indeling",defaultLayoutOption:"Standaardindeling voor activiteiten",allDevicesOption:"Standaardindeling voor apparaten",commands:"Commando's",power:"Aan/uit-knop",modeToggle:"Modusknop",deviceModeDescription:"Bedien \xE9\xE9n apparaat dat op de hub is ingesteld met de knoptoewijzingen en volledige lijst met commando's van dat apparaat.",longPress:"Herhalen bij ingedrukt houden inschakelen",longPressDescription:"Houd een geselecteerde knop ingedrukt om het bijbehorende commando te herhalen, net als op de fysieke afstandsbediening.",longPressButtons:"Knoppen",enableDeviceMode:"Apparaatmodus inschakelen",initialView:"Beginweergave",initialViewHelper:"Wat de kaart toont bij het openen",openOnCurrentActivity:"Huidige activiteit",macrosFavoritesAsRows:"Macro's/favorieten als rijen",commandsAsRows:"Commando's als rijen",favoriteDeviceNames:"Apparaatnamen tonen",rowOptions:C=>`Opties voor ${C}`,visibleRows:"Zichtbare rijen",moveGroupUp:C=>`Verplaats ${C} omhoog`,moveGroupDown:C=>`Verplaats ${C} omlaag`,fewerVisibleRows:"Minder zichtbare rijen",moreVisibleRows:"Meer zichtbare rijen",reorderGroupHandle:C=>`${C} verplaatsen (pijltjestoetsen)`,macros:"Macro's",favorites:"Favorieten",volume:"Volume",channel:"Kanaal",mediaControls:"Afspelen",dvr:"DVR",numpad:"Cijfertoetsen",resetDefaultLayout:"Indeling resetten",shortcutSlotLeft:"Linker snelkoppeling",shortcutSlotMiddle:"Middelste snelkoppeling",shortcutSlotRight:"Rechter snelkoppeling",shortcutIcon:"Pictogram",shortcutCommand:"Commando",shortcutReset:"Resetten",shortcutCommandMissing:C=>`Commando ${C} (ontbreekt)`,shortcutsCommandsLoading:"Commando's laden\u2026",shortcutsCommandsUnavailable:"De commando's van dit apparaat zijn nog niet gecachet. Vernieuw het apparaat op het tabblad Hub van het Sofabaton-bedieningspaneel en laad daarna het dashboard opnieuw.",shortcutsCommandsError:"Kan de commando's van dit apparaat niet laden. Laad het dashboard opnieuw en probeer het nogmaals.",noteDefaultLayout:"Gebruikt voor activiteiten zonder eigen indeling",noteDeviceDefaultLayout:"Gebruikt voor apparaten zonder eigen indeling",noteCustomActivityLayout:"Aangepaste activiteitenindeling in gebruik",noteCustomDeviceLayout:"Aangepaste apparaatindeling in gebruik",noteUsingActivityDefault:"Standaardindeling voor activiteiten in gebruik",noteUsingDeviceDefault:"Standaardindeling voor apparaten in gebruik"},groups:{activity:"Activiteit/apparaat",macro_favorites:"Macro's/favorieten",macros_row:"Macrorij",favorites_row:"Favorietenrij",dpad:"Richtingsknoppen",nav:"Terug/Home/Menu",mid:"Volume/kanaal",media:"Afspelen",colors:"Kleurknoppen",abc:"A/B/C",shortcuts:"Snelkoppelingen"},keys:{up:"Omhoog",down:"Omlaag",left:"Links",right:"Rechts",ok:"OK",back:"Terug",home:"Home",menu:"Menu",volup:"Vol +",voldn:"Vol -",mute:"Dempen",chup:"CH +",chdn:"CH -",guide:"Gids",dvr:"DVR",play:"Afspelen",exit:"EXIT",rew:"Terugspoelen",pause:"Pauze",fwd:"Vooruitspoelen",red:"Rood",green:"Groen",yellow:"Geel",blue:"Blauw",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"Enter"}};b("nl",Le);var re={card:{selectEntityError:"\u8BF7\u9009\u62E9 Sofabaton \u9065\u63A7\u5B9E\u4F53",remoteUnavailable:"\u9065\u63A7\u4E0D\u53EF\u7528\uFF08\u53EF\u80FD\u662F\u56E0\u4E3A Sofabaton \u5E94\u7528\u5DF2\u8FDE\u63A5\uFF09\u3002",noActivitiesWarning:"\u5728\u9065\u63A7\u5C5E\u6027\u4E2D\u672A\u627E\u5230\u6D3B\u52A8\u3002",noMacros:"\u6CA1\u6709\u53EF\u7528\u7684\u5B8F",noFavorites:"\u6CA1\u6709\u53EF\u7528\u7684\u6536\u85CF",noCommands:"\u6CA1\u6709\u53EF\u7528\u547D\u4EE4",macrosTab:"\u5B8F",favoritesTab:"\u6536\u85CF",commandsTab:"\u547D\u4EE4",powerButton:"\u5207\u6362\u7535\u6E90",activitySelectLabel:"\u6D3B\u52A8",deviceSelectLabel:"\u8BBE\u5907",selectDevice:"\u9009\u62E9\u8BBE\u5907",allDevicesLayout:"\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40",filterCommands:"\u7B5B\u9009\u547D\u4EE4",switchToDeviceMode:"\u5207\u6362\u5230\u8BBE\u5907\u6A21\u5F0F",switchToActivityMode:"\u5207\u6362\u5230\u6D3B\u52A8\u6A21\u5F0F",deviceKeymapMissing:"\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u5C1A\u672A\u7F13\u5B58\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u7684 Hub \u6807\u7B7E\u9875\u4E2D\u5237\u65B0\u6B64\u8BBE\u5907\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\u3002",deviceKeymapError:"\u65E0\u6CD5\u52A0\u8F7D\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u3002",deviceKeymapMissingServer:"\u6B64\u8BBE\u5907\u4E0D\u5728 Hub \u7684\u76EE\u5F55\u4E2D\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u4E2D\u5237\u65B0 Hub\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u6B64\u9875\u9762\u3002",serverReadFailed:"\u65E0\u6CD5\u4ECE\u670D\u52A1\u5668\u52A0\u8F7D Hub \u6570\u636E\u3002\u8BF7\u68C0\u67E5\u8FDE\u63A5\u540E\u91CD\u8BD5\u3002",controlRefused:"\u65E0\u6CD5\u5B8C\u6210\u8BE5\u547D\u4EE4\u3002\u8BF7\u91CD\u8BD5\u3002",poweredOff:"\u5DF2\u5173\u673A",defaultLayout:"\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",activityFallback:C=>`\u6D3B\u52A8 ${C}`,deviceFallback:C=>`\u8BBE\u5907 ${C}`,pickerName:"Sofabaton \u865A\u62DF\u9065\u63A7\u5668",pickerDescription:"\u9002\u7528\u4E8E Sofabaton X1\u3001X1S \u548C X2 \u96C6\u6210\u7684\u53EF\u914D\u7F6E\u9065\u63A7\u5668\u3002"},sidebar:{title:"\u865A\u62DF\u9065\u63A7\u5668",controlPanel:"\u63A7\u5236\u9762\u677F",hubMenu:"\u9009\u62E9 Hub",back:"\u8FD4\u56DE",hubReachable:"\u53EF\u8FDE\u63A5",hubUnreachable:"\u65E0\u6CD5\u8FDE\u63A5",noHubs:"\u5C1A\u672A\u8BBE\u7F6E\u4EFB\u4F55 Sofabaton Hub\u3002",hubUnavailable:"Hub \u4E0D\u53EF\u7528",remoteUnavailable:"\u6B64 Hub \u7684\u9065\u63A7\u5B9E\u4F53\u4E0D\u53EF\u7528\u3002",controlPanelLoadFailed:"\u65E0\u6CD5\u52A0\u8F7D\u63A7\u5236\u9762\u677F\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u9875\u9762\u540E\u91CD\u8BD5\u3002",activities:"\u6D3B\u52A8",devices:"\u8BBE\u5907",allOff:"\u5168\u90E8\u5173\u95ED",off:"\u5173\u95ED",modeToggle:"\u5728\u6D3B\u52A8\u548C\u8BBE\u5907\u4E4B\u95F4\u5207\u6362",numberPad:"\u6570\u5B57\u952E\u76D8",pullHandle:"\u6253\u5F00\u6536\u85CF\u548C\u5B8F",pullHandleCommands:"\u6253\u5F00\u547D\u4EE4",close:"\u5173\u95ED",pinToDock:C=>`\u5C06 ${C} \u56FA\u5B9A\u5230\u5E95\u680F`,pinnedToDock:C=>`${C}\uFF0C\u5DF2\u56FA\u5B9A\u5230\u5E95\u680F`,dockShortcut:"\u5E95\u680F\u5FEB\u6377\u6309\u952E",dockSwap:"\u5DE6\u53F3\u4E92\u6362",dockOnLeft:"\u5728\u5DE6\u4FA7",dockOnRight:"\u5728\u53F3\u4FA7",unpin:"\u53D6\u6D88\u56FA\u5B9A",dockFull:"\u5E95\u680F\u5DF2\u6EE1",dockIcon:"\u56FE\u6807",starting:"\u6B63\u5728\u542F\u52A8",poweringOff:"\u6B63\u5728\u5173\u95ED",working:"\u6B63\u5728\u5904\u7406",appConnected:"Sofabaton \u5E94\u7528\u5DF2\u8FDE\u63A5",operations:{backup_restore:"\u6B63\u5728\u6062\u590D\u5907\u4EFD",cache_refresh:"\u6B63\u5728\u5237\u65B0 Hub \u7F13\u5B58",entity_sync:"\u6B63\u5728\u4E0E Hub \u540C\u6B65",backup_export:"\u6B63\u5728\u521B\u5EFA\u5907\u4EFD",wifi_deploy:"\u6B63\u5728\u540C\u6B65 Wifi Commands"}},assist:{label:"\u6309\u952E\u6355\u83B7",waiting:"\u7B49\u5F85\u6309\u952E",exitEditMode:"\u9000\u51FA\u7F16\u8F91\u6A21\u5F0F\u540E\u5373\u53EF\u5F00\u59CB",captured:C=>`\u5DF2\u6355\u83B7\uFF1A${C}`,notCaptured:"\u5C1A\u672A\u6355\u83B7\u3002",working:"\u6B63\u5728\u5904\u7406\u2026",triggersReady:"\u89E6\u53D1\u5668\u5DF2\u5C31\u7EEA",createTriggers:"\u521B\u5EFA MQTT Discovery \u89E6\u53D1\u5668",startCapturing:"\u5F00\u59CB\u6355\u83B7\u547D\u4EE4",deviceDetectedTitle:"\u5DF2\u68C0\u6D4B\u5230 Sofabaton MQTT \u8BBE\u5907\u3002",close:"\u5173\u95ED",alsoActivityTriggers:"\u540C\u65F6\u4E3A\u6D3B\u52A8\u53D8\u66F4\u521B\u5EFA\u89E6\u53D1\u5668\u3002",seeDocs:"\u67E5\u770B\u6B64\u529F\u80FD\u7684\u6587\u6863\u3002",dontShowAgain:"\u672C\u6B21\u4F1A\u8BDD\u4E2D\u4E0D\u518D\u4E3A\u6B64\u8BBE\u5907\u663E\u793A\u6B64\u63D0\u793A\u3002",detectedDevice:C=>`\u68C0\u6D4B\u5230 MQTT \u8BBE\u5907\uFF1A${C}\u3002`,lastCommand:C=>`\u6700\u540E\u4E00\u4E2A\u547D\u4EE4\uFF1A${C}\u3002`,existingTriggers:"\u53D1\u73B0\u5DF2\u6709\u7684 MQTT \u81EA\u52A8\u5316\u89E6\u53D1\u5668\u3002",noMqttCommands:"\u5C1A\u672A\u53D1\u73B0 MQTT \u547D\u4EE4",deviceFallback:C=>`\u8BBE\u5907 ${C}`,unknownDevice:"\u672A\u77E5\u8BBE\u5907",commandFallback:C=>`\u547D\u4EE4 ${C}`,createdTriggers:(C,V)=>`\u5DF2\u4E3A\u201C${V}\u201D\u521B\u5EFA ${C} \u4E2A MQTT Discovery \u89E6\u53D1\u5668`,createdActivityTriggers:C=>`\u5DF2\u4E3A X2 \u2192 \u6D3B\u52A8\u521B\u5EFA ${C} \u4E2A\u6D3B\u52A8\u89E6\u53D1\u5668`,plusActivityTriggers:C=>`\uFF0C\u53E6\u521B\u5EFA ${C} \u4E2A\u6D3B\u52A8\u89E6\u53D1\u5668`,allTriggersExist:C=>`\u201C${C}\u201D\u7684\u6240\u6709 MQTT Discovery \u89E6\u53D1\u5668\u5747\u5DF2\u5B58\u5728`,buttonFallback:"\u6309\u952E",activityFallbackLabel:"\u6D3B\u52A8",unknown:"\u672A\u77E5",automationAssistName:"\u81EA\u52A8\u5316\u52A9\u624B",notification:{title:"\u{1F6E0}\uFE0F \u81EA\u52A8\u5316\u52A9\u624B",eventButton:C=>`\u6309\u952E\uFF1A${C}`,eventCommand:C=>`\u547D\u4EE4\uFF1A${C}`,eventActivity:C=>`\u6D3B\u52A8\u53D8\u66F4\uFF1A${C}`,eventOther:C=>`\u4E8B\u4EF6\uFF1A${C}`,header:(C,V)=>`**\u6D3B\u52A8\uFF1A${C} | ${V}**`,headerDevice:(C,V)=>`**\u8BBE\u5907\uFF1A${C} | ${V}**`,lovelaceHeading:"\u{1F4CB} **Lovelace \u6309\u94AE\u4EE3\u7801**",lovelaceCopy:"*\u5C06\u5176\u590D\u5236\u5230\u4EEA\u8868\u677F YAML \u4E2D\uFF1A*",serviceHeading:"\u2699\uFE0F **\u670D\u52A1\u8C03\u7528\uFF08\u81EA\u52A8\u5316\uFF09**",serviceCopy:"*\u5728\u811A\u672C\u6216\u81EA\u52A8\u5316\u4E2D\u4F7F\u7528\u6B64\u5185\u5BB9\uFF1A*"}},editor:{fieldLabels:{entity:"\u9009\u62E9 Sofabaton \u9065\u63A7\u5B9E\u4F53",theme:"\u4E3A\u5361\u7247\u5E94\u7528\u4E3B\u9898",use_background_override:"\u81EA\u5B9A\u4E49\u80CC\u666F\u989C\u8272",background_override:"\u9009\u62E9\u80CC\u666F\u989C\u8272",max_width:"\u5361\u7247\u6700\u5927\u5BBD\u5EA6\uFF08px\uFF09",key_style:"\u6309\u952E\u6837\u5F0F"},generalOptionsTitle:"\u5E38\u89C4\u9009\u9879",keyCapture:"\u6309\u952E\u6355\u83B7",keyCaptureDescription:"\u5C06\u6309\u952E\u64CD\u4F5C\u53D1\u9001\u5230 Hub\uFF0C\u4EE5\u751F\u6210\u53EF\u76F4\u63A5\u7528\u4E8E\u4EEA\u8868\u677F\u6309\u94AE\u548C\u81EA\u52A8\u5316\u7684 YAML\u3002",keyCaptureLearnMore:"\u8BE6\u7EC6\u4E86\u89E3\u6309\u952E\u6355\u83B7",keyCaptureDocsAria:"\u6309\u952E\u6355\u83B7\u6587\u6863",stylingOptions:"\u6837\u5F0F\u9009\u9879",keyStyleFlat:"\u6241\u5E73\uFF08\u4E0E\u5361\u7247\u80CC\u666F\u76F8\u540C\uFF09",keyStyleTinted:"\u7740\u8272\uFF08\u6309\u952E\u4E0E\u80CC\u666F\u533A\u5206\u5F00\uFF09",keyStyleElevated:"\u60AC\u6D6E\uFF08\u7740\u8272\u5E76\u5E26\u9634\u5F71\uFF09",keyStyleGlossy:"\u5149\u6CFD\uFF08\u6709\u5149\u6CFD\u7684\u7ACB\u4F53\u6309\u952E\uFF09",tintedPanels:"\u7740\u8272\u9762\u677F",tintedPanelsDescription:"\u5728\u6BCF\u7EC4\u6309\u952E\u540E\u65B9\u663E\u793A\u7740\u8272\u80CC\u666F\u3002",layoutOptions:"\u5E03\u5C40\u9009\u9879",layoutSelectLabel:"\u5E03\u5C40",defaultLayoutOption:"\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",allDevicesOption:"\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40",commands:"\u547D\u4EE4",power:"\u7535\u6E90\u6309\u94AE",modeToggle:"\u6A21\u5F0F\u5207\u6362",deviceModeDescription:"\u63A7\u5236 Hub \u4E2D\u914D\u7F6E\u7684\u5355\u4E2A\u8BBE\u5907\uFF0C\u5E76\u4F7F\u7528\u8BE5\u8BBE\u5907\u81EA\u5DF1\u7684\u6309\u952E\u5206\u914D\u548C\u5B8C\u6574\u547D\u4EE4\u5217\u8868\u3002",longPress:"\u542F\u7528\u957F\u6309\u91CD\u590D\u53D1\u9001",longPressDescription:"\u6309\u4F4F\u6240\u9009\u6309\u952E\u53EF\u91CD\u590D\u53D1\u9001\u5176\u547D\u4EE4\uFF0C\u5C31\u50CF\u4F7F\u7528\u7269\u7406\u9065\u63A7\u5668\u4E00\u6837\u3002",longPressButtons:"\u6309\u952E",enableDeviceMode:"\u542F\u7528\u8BBE\u5907\u6A21\u5F0F",initialView:"\u521D\u59CB\u89C6\u56FE",initialViewHelper:"\u5361\u7247\u6253\u5F00\u65F6\u663E\u793A\u7684\u5185\u5BB9",openOnCurrentActivity:"\u5F53\u524D\u6D3B\u52A8",macrosFavoritesAsRows:"\u5C06\u5B8F/\u6536\u85CF\u663E\u793A\u4E3A\u884C",commandsAsRows:"\u5C06\u547D\u4EE4\u663E\u793A\u4E3A\u884C",favoriteDeviceNames:"\u663E\u793A\u8BBE\u5907\u540D\u79F0",rowOptions:C=>`${C}\u9009\u9879`,visibleRows:"\u53EF\u89C1\u884C",moveGroupUp:C=>`\u5C06${C}\u4E0A\u79FB`,moveGroupDown:C=>`\u5C06${C}\u4E0B\u79FB`,fewerVisibleRows:"\u51CF\u5C11\u53EF\u89C1\u884C\u6570",moreVisibleRows:"\u589E\u52A0\u53EF\u89C1\u884C\u6570",reorderGroupHandle:C=>`\u8C03\u6574${C}\u7684\u987A\u5E8F\uFF08\u65B9\u5411\u952E\uFF09`,macros:"\u5B8F",favorites:"\u6536\u85CF",volume:"\u97F3\u91CF",channel:"\u9891\u9053",mediaControls:"\u64AD\u653E",dvr:"DVR",numpad:"\u6570\u5B57\u952E\u76D8",resetDefaultLayout:"\u91CD\u7F6E\u5E03\u5C40",shortcutSlotLeft:"\u5DE6\u4FA7\u5FEB\u6377\u6309\u952E",shortcutSlotMiddle:"\u4E2D\u95F4\u5FEB\u6377\u6309\u952E",shortcutSlotRight:"\u53F3\u4FA7\u5FEB\u6377\u6309\u952E",shortcutIcon:"\u56FE\u6807",shortcutCommand:"\u547D\u4EE4",shortcutReset:"\u91CD\u7F6E",shortcutCommandMissing:C=>`\u547D\u4EE4 ${C}\uFF08\u7F3A\u5931\uFF09`,shortcutsCommandsLoading:"\u6B63\u5728\u52A0\u8F7D\u547D\u4EE4\u2026",shortcutsCommandsUnavailable:"\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u5C1A\u672A\u7F13\u5B58\u3002\u8BF7\u5728 Sofabaton \u63A7\u5236\u9762\u677F\u7684 Hub \u6807\u7B7E\u9875\u4E2D\u5237\u65B0\u6B64\u8BBE\u5907\uFF0C\u7136\u540E\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\u3002",shortcutsCommandsError:"\u65E0\u6CD5\u52A0\u8F7D\u6B64\u8BBE\u5907\u7684\u547D\u4EE4\u3002\u8BF7\u91CD\u65B0\u52A0\u8F7D\u4EEA\u8868\u677F\uFF0C\u7136\u540E\u91CD\u8BD5\u3002",noteDefaultLayout:"\u7528\u4E8E\u6CA1\u6709\u5355\u72EC\u5E03\u5C40\u7684\u6D3B\u52A8",noteDeviceDefaultLayout:"\u7528\u4E8E\u6CA1\u6709\u5355\u72EC\u5E03\u5C40\u7684\u8BBE\u5907",noteCustomActivityLayout:"\u6B63\u5728\u4F7F\u7528\u81EA\u5B9A\u4E49\u6D3B\u52A8\u5E03\u5C40",noteCustomDeviceLayout:"\u6B63\u5728\u4F7F\u7528\u81EA\u5B9A\u4E49\u8BBE\u5907\u5E03\u5C40",noteUsingActivityDefault:"\u6B63\u5728\u4F7F\u7528\u9ED8\u8BA4\u6D3B\u52A8\u5E03\u5C40",noteUsingDeviceDefault:"\u6B63\u5728\u4F7F\u7528\u9ED8\u8BA4\u8BBE\u5907\u5E03\u5C40"},groups:{activity:"\u6D3B\u52A8/\u8BBE\u5907",macro_favorites:"\u5B8F/\u6536\u85CF",macros_row:"\u5B8F\u884C",favorites_row:"\u6536\u85CF\u884C",dpad:"\u65B9\u5411\u952E",nav:"\u8FD4\u56DE/\u4E3B\u9875/\u83DC\u5355",mid:"\u97F3\u91CF/\u9891\u9053",media:"\u64AD\u653E",colors:"\u5F69\u8272\u6309\u952E",abc:"A/B/C",shortcuts:"\u5FEB\u6377\u6309\u952E"},keys:{up:"\u4E0A",down:"\u4E0B",left:"\u5DE6",right:"\u53F3",ok:"\u786E\u5B9A",back:"\u8FD4\u56DE",home:"\u4E3B\u9875",menu:"\u83DC\u5355",volup:"\u97F3\u91CF +",voldn:"\u97F3\u91CF -",mute:"\u9759\u97F3",chup:"\u9891\u9053 +",chdn:"\u9891\u9053 -",guide:"\u8282\u76EE\u6307\u5357",dvr:"DVR",play:"\u64AD\u653E",exit:"EXIT",rew:"\u5FEB\u9000",pause:"\u6682\u505C",fwd:"\u5FEB\u8FDB",red:"\u7EA2",green:"\u7EFF",yellow:"\u9EC4",blue:"\u84DD",a:"A",b:"B",c:"C",num0:"0",num1:"1",num2:"2",num3:"3",num4:"4",num5:"5",num6:"6",num7:"7",num8:"8",num9:"9",numdash:"-",numenter:"\u786E\u8BA4 (E)"}};b("zh-hans",re);var o5="sofabaton-remote",ZH="/ui/embed/",Gt="server";function te(){let C;try{C=import.meta.url}catch{return null}return typeof C!="string"||!C.includes(ZH)?null:C7(C,ZH)}var ie=te(),oe=["hub","server","theme","lang","device","config"],Me=`
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
`,M5=class extends HTMLElement{constructor(){super();this._stage=null;this._notice=null;this._banner=null;this._probe=null;this._backend=null;this._card=null;this._unsubscribe=null;this._hub=null;this._lastBanner=null;this._bootEpoch=0;this._bootQueued=!1;this._configOverride=null;this._appliedThemeVars=[];this._media=null;this._onMediaChange=()=>this._applyTheme();this._shadow=this.attachShadow({mode:"open"})}static get observedAttributes(){return oe}get hub(){return this.getAttribute("hub")??""}set hub(H){this._setOrRemove("hub",H)}get server(){return this.getAttribute("server")??""}set server(H){this._setOrRemove("server",H)}get theme(){return Y0(this.getAttribute("theme"))}set theme(H){this._setOrRemove("theme",H)}get lang(){return this.getAttribute("lang")??""}set lang(H){this._setOrRemove("lang",H)}get device(){let H=this.getAttribute("device");if(H==null||H.trim()==="")return null;let e=Number(H);return Number.isFinite(e)?e:null}set device(H){this._setOrRemove("device",H==null?null:String(H))}get config(){return this._configOverride}set config(H){if(typeof H=="string"){this._setOrRemove("config",H);return}this.hasAttribute("config")&&this.removeAttribute("config"),this._configOverride=H&&typeof H=="object"&&!Array.isArray(H)?{...H}:null,this._scheduleBoot()}get hubId(){return this._hub?.hub_id??null}refreshTheme(){this.isConnected&&this._applyTheme()}reload(){this._scheduleBoot()}_setOrRemove(H,e){e==null||e===""?this.removeAttribute(H):this.setAttribute(H,String(e))}connectedCallback(){this._renderShell(),typeof matchMedia=="function"&&!this._media&&(this._media=matchMedia("(prefers-color-scheme: dark)"),this._media.addEventListener("change",this._onMediaChange)),this._applyTheme(),this._scheduleBoot()}disconnectedCallback(){this._bootEpoch+=1,this._teardown(),this._media&&(this._media.removeEventListener("change",this._onMediaChange),this._media=null)}attributeChangedCallback(H,e,L){if(e!==L&&(H==="config"&&(this._configOverride=ae(L)),!!this.isConnected)){if(H==="theme"){this._applyTheme();return}if(H==="lang"){this._card?.setLanguage(this._language());return}this._scheduleBoot()}}_scheduleBoot(){!this.isConnected||this._bootQueued||(this._bootQueued=!0,queueMicrotask(()=>{this._bootQueued=!1,this.isConnected&&this._boot()}))}async _boot(){let H=++this._bootEpoch;this._teardown();let e=this._serverBase();if(!e){this._fail({code:"server_missing",message:this.server?`The server attribute is not an http(s) URL: ${this.server}`:"Set the server attribute to the sofabaton-x-server base URL (for example http://nas:8480)."});return}let L=e7(typeof location<"u"?location.protocol:void 0,e);if(L){this._fail(L);return}let r=(l,s)=>fetch(l,s),t=typeof location<"u"?location.origin:void 0,o=await L7(e,this.hub,r,{pageOrigin:t});if(H!==this._bootEpoch)return;if(o.error||!o.hub){this._fail(o.error??{code:"hub_not_found",message:"No such hub."});return}let i=o.hub,M=this._configOverride;if(!M&&(M=await r7(e,i.hub_id,r),H!==this._bootEpoch))return;let n=new _1({baseUrl:e});n.setTarget(i.hub_id);let a=document.createElement(L2);a.setConfig(H7(i.hub_id,M,{openDevice:this.device})),a.setLanguage(this._language()),a.setBackend(n),this._backend=n,this._card=a,this._hub=i,this._notice&&(this._notice.hidden=!0),this._stage?.replaceChildren(a),this._unsubscribe=n.subscribe(()=>{this._followTarget(),this._syncBanner()}),this._syncBanner(),this._dispatchReady(i)}_dispatchReady(H){this.dispatchEvent(new CustomEvent("sofabaton-remote-ready",{detail:{hub:H.hub_id,name:H.config?.name??null},bubbles:!0,composed:!0}))}_followTarget(){let H=this._backend?.target;!this._hub||!H||H===this._hub.hub_id||(this._hub={...this._hub,hub_id:H},this._dispatchReady(this._hub))}_teardown(){this._unsubscribe?.(),this._unsubscribe=null,this._card?.setBackend(null),this._card?.remove(),this._card=null,this._backend?.stop(),this._backend=null,this._hub=null,this._lastBanner=null,this._banner&&(this._banner.hidden=!0,this._banner.textContent="")}_fail(H){this._notice&&(this._notice.textContent=H.message,this._notice.hidden=!1),this.dispatchEvent(new CustomEvent("sofabaton-remote-error",{detail:{code:H.code,message:H.message},bubbles:!0,composed:!0}))}_serverBase(){let H=typeof location<"u"?location.href:void 0,e=this.server;return e?V7(e,H):ie}_language(){let H=typeof navigator<"u"?navigator.language:"";return(this.lang||H||"").trim()||void 0}_renderShell(){this._stage||(this._shadow.innerHTML=`<style>${Me}</style>
      <div class="probe" aria-hidden="true"></div>
      <div class="banner" part="banner" hidden></div>
      <div class="notice" part="notice" hidden></div>
      <div class="stage" part="stage"></div>`,this._probe=this._shadow.querySelector(".probe"),this._banner=this._shadow.querySelector(".banner"),this._notice=this._shadow.querySelector(".notice"),this._stage=this._shadow.querySelector(".stage"))}_syncBanner(){if(!this._banner||!this._backend)return;let H=t7(this._backend.snapshot(),this._backend.lastError,this._backend.controlRefused);H!==this._lastBanner&&(this._lastBanner=H,this._banner.hidden=!H,this._banner.textContent=H??"")}_applyTheme(){for(let L of this._appliedThemeVars)this.style.removeProperty(L);this._appliedThemeVars=[],this.style.removeProperty("color-scheme");let H=getComputedStyle(this),e=J0({theme:this.theme,hostValue:L=>H.getPropertyValue(L).trim(),prefersDark:this._media?.matches??!1,resolveColor:L=>this._resolveColor(L),hostColorScheme:H.getPropertyValue("color-scheme").trim()});for(let[L,r]of Object.entries(e.values))this.style.setProperty(L,r),this._appliedThemeVars.push(L);e.colorScheme&&this.style.setProperty("color-scheme",e.colorScheme)}_resolveColor(H){let e=this._probe;if(!e)return J2(H);if(e.style.color="",e.style.color=H,!e.style.color)return null;let L=J2(getComputedStyle(e).color);return e.style.color="",L}};function ae(C){if(C==null||C.trim()==="")return null;try{let V=JSON.parse(C);if(V&&typeof V=="object"&&!Array.isArray(V))return V}catch{}return console.warn(`<${o5}>: the config attribute is not a JSON object; using the server's layout.`),null}function ne(){vH(),v0(),customElements.get(L2)||customElements.define(L2,w1),customElements.get(o5)||customElements.define(o5,M5)}typeof window<"u"&&typeof customElements<"u"&&ne();export{Gt as EMBED_DIST,ZH as EMBED_MARKER,o5 as EMBED_TAG,zV as MIN_SERVER_VERSION,M5 as SofabatonRemote,ne as bootstrapRemoteEmbed};
