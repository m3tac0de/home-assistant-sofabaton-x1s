// Server settings > Access (docs/internal/sofabaton-x-server-auth-plan.md,
// section 8): the admin account, the write tokens, the signed-in browsers
// and the allowed browser origins. Before access is set up it offers the
// setup (the shell's dialog, through `sb-auth-setup`) and still edits the
// allowed origins, which are open like every write until then.
//
// A new token's secret is shown once, here, with a copy button that also
// works over plain HTTP (no navigator.clipboard outside a secure context).

import { LitElement, html, css, nothing, type TemplateResult } from "lit";

import {
  problemText,
  type AuthStatus,
  type OriginsSetting,
  type PanelApi,
  type SessionView,
  type TokenCreated,
  type TokenInfo,
} from "../panel-api";
import { PANEL_BASE_CSS } from "../panel-styles";

export const ACCESS_VIEW_TAG = "sb-panel-access";

const PASSWORD_MIN = 8;

function localTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : at.toLocaleString();
}

/** "Firefox on Windows", from a user agent; the raw text when nothing matches. */
export function browserLabel(userAgent: string): string {
  const ua = userAgent || "";
  if (!ua) return "unknown browser";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  if (browser && os) return `${browser} on ${os}`;
  return browser || os || ua.slice(0, 60);
}

/** Copy text; `navigator.clipboard` only exists in a secure context, so plain HTTP selects the field and uses execCommand. */
export async function copyText(text: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    if (window.isSecureContext && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the selection copy
  }
  if (!field) return false;
  field.focus();
  field.select();
  try {
    return document.execCommand("copy");
  } catch {
    return false;
  }
}

export class SbPanelAccess extends LitElement {
  static properties = {
    api: { attribute: false },
    auth: { attribute: false },
    reachable: { attribute: false },
    _tokens: { state: true },
    _sessions: { state: true },
    _origins: { state: true },
    _originsDraft: { state: true },
    _created: { state: true },
    _copied: { state: true },
    _renaming: { state: true },
    _confirmRevoke: { state: true },
    _busy: { state: true },
    _msg: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: block; }
      .intro { margin-bottom: 10px; }
      .fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0 14px; margin-bottom: 12px; }
      .token-new { margin: 10px 0 4px; padding: 12px; border: 1px solid color-mix(in srgb, var(--sbp-ok) 45%, var(--sbp-line)); border-radius: var(--sbp-radius); background: color-mix(in srgb, var(--sbp-ok) 7%, var(--sbp-panel)); }
      .token-new b { display: block; margin-bottom: 6px; font-size: 13px; }
      .token-new .row { align-items: center; }
      .token-new input { font-family: var(--sbp-mono); font-size: 12px; }
      .token-new pre { margin-top: 8px; }
      .add { display: flex; gap: 8px; align-items: center; margin-top: 10px; }
      .add input { max-width: 280px; }
      table.list td.name { white-space: normal; overflow-wrap: anywhere; }
      table.list td.act button + button { margin-left: 6px; }
      .rename { display: flex; gap: 6px; align-items: center; }
      .rename input { max-width: 220px; padding: 3px 8px; }
      .pill { display: inline-block; padding: 0 6px; border-radius: 999px; font-size: 10px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; background: rgba(var(--sbp-accent-rgb), 0.14); color: var(--sbp-accent); margin-left: 6px; }
      .empty { color: var(--sbp-muted); font-size: 12px; padding: 8px 0; }
      textarea#origins { min-height: 72px; }
      .note { color: var(--sbp-muted); font-size: 12px; }
      .msg-line { min-height: 18px; margin-top: 6px; font-size: 12px; }
    `,
  ];

  api!: PanelApi;
  auth: AuthStatus | null = null;
  reachable = true;
  private _tokens: TokenInfo[] | null = null;
  private _sessions: SessionView[] | null = null;
  private _origins: OriginsSetting | null = null;
  private _originsDraft: string | null = null;
  private _created: TokenCreated | null = null;
  private _copied = false;
  private _renaming: { id: string; draft: string } | null = null;
  private _confirmRevoke: string | null = null;
  private _busy = new Set<string>();
  private _msg: Record<string, { text: string; ok: boolean }> = {};

  connectedCallback(): void {
    super.connectedCallback();
    void this._load();
  }

  willUpdate(changed: Map<PropertyKey, unknown>): void {
    const before = changed.get("auth") as AuthStatus | null | undefined;
    if (changed.has("auth") && before !== undefined && (before?.signed_in !== this.auth?.signed_in || before?.claimed !== this.auth?.claimed)) {
      // A "signed out" line from the failed call is stale once the session is back.
      if (this.auth?.signed_in) this._msg = {};
      void this._load();
    }
  }

  private get _signedIn(): boolean {
    return Boolean(this.auth?.claimed && this.auth.signed_in);
  }

  private async _load(): Promise<void> {
    if (!this.api) return;
    const settings = await this.api.serverSettings().catch(() => null);
    if (settings?.ok && settings.body) this._origins = settings.body.allowed_origins ?? { value: [], pinned: false };
    if (!this._signedIn) {
      this._tokens = null;
      this._sessions = null;
      return;
    }
    const [tokens, sessions] = await Promise.all([this.api.listTokens().catch(() => null), this.api.listSessions().catch(() => null)]);
    if (tokens?.ok && tokens.body) this._tokens = tokens.body;
    else if (tokens) this._say("tokens", problemText(tokens), false);
    if (sessions?.ok && sessions.body) this._sessions = sessions.body;
  }

  private _say(key: string, text: string, ok: boolean): void {
    this._msg = { ...this._msg, [key]: { text, ok } };
  }

  private async _run(key: string, work: () => Promise<void>): Promise<void> {
    if (this._busy.has(key)) return;
    this._busy = new Set(this._busy).add(key);
    this._say(key, "", true);
    try {
      await work();
    } catch (err) {
      this._say(key, String(err), false);
    } finally {
      const busy = new Set(this._busy);
      busy.delete(key);
      this._busy = busy;
    }
  }

  private _emit(name: string, detail?: unknown): void {
    this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
  }

  private _field(id: string): HTMLInputElement | null {
    return this.renderRoot.querySelector<HTMLInputElement>(`#${id}`);
  }

  // -- account ---------------------------------------------------------------------

  private _saveAccount(): Promise<void> {
    return this._run("account", async () => {
      const username = this._field("account-username")?.value.trim() ?? "";
      const current = this._field("account-current")?.value ?? "";
      const next = this._field("account-new")?.value ?? "";
      const again = this._field("account-again")?.value ?? "";
      if (!current) return this._say("account", "Enter your current password.", false);
      if (next && next.length < PASSWORD_MIN) return this._say("account", `The new password needs at least ${PASSWORD_MIN} characters.`, false);
      if (next !== again) return this._say("account", "The new passwords do not match.", false);
      const change: { current_password: string; username?: string; new_password?: string } = { current_password: current };
      if (username && username !== this.auth?.username) change.username = username;
      if (next) change.new_password = next;
      if (!change.username && !change.new_password) return this._say("account", "Nothing to change.", false);
      const response = await this.api.updateAdmin(change);
      if (!response.ok || !response.body) return this._say("account", response.status === 403 ? "The current password is not right." : problemText(response), false);
      for (const id of ["account-current", "account-new", "account-again"]) {
        const field = this._field(id);
        if (field) field.value = "";
      }
      this._say("account", "Saved. Every other browser was signed out.", true);
      this._emit("sb-auth-changed", response.body);
      const sessions = await this.api.listSessions();
      if (sessions.ok && sessions.body) this._sessions = sessions.body;
    });
  }

  private _renderAccount(): TemplateResult {
    return html`
      <div class="panel" id="access-account">
        <h2>Admin account</h2>
        <div class="fields">
          <div><label for="account-username">Username</label><input id="account-username" type="text" autocomplete="username" .value=${this.auth?.username ?? ""} /></div>
          <div><label for="account-current">Current password</label><input id="account-current" type="password" autocomplete="current-password" /></div>
          <div><label for="account-new">New password</label><input id="account-new" type="password" autocomplete="new-password" placeholder="leave empty to keep" /></div>
          <div><label for="account-again">New password again</label><input id="account-again" type="password" autocomplete="new-password" /></div>
        </div>
        <div class="actions">
          <button class="small primary" id="account-save" ?disabled=${this._busy.has("account") || !this.reachable} @click=${this._saveAccount}>Save</button>
          ${this._message("account")}
        </div>
        <div class="hint" style="margin-top: 8px">Changing the username or password signs out every other browser. Tokens keep working. Forgot the password? Run <span class="mono">sofabaton-x-server --reset-password</span> on the server's host (in Docker: <span class="mono">docker exec &lt;container&gt; sofabaton-x-server --reset-password</span>).</div>
      </div>
    `;
  }

  // -- tokens ----------------------------------------------------------------------

  private _createToken(): Promise<void> {
    return this._run("tokens", async () => {
      const field = this._field("token-name");
      const name = field?.value.trim() ?? "";
      if (!name) return this._say("tokens", "Give the token a name, e.g. the integration it is for.", false);
      const response = await this.api.createToken(name);
      if (!response.ok || !response.body) return this._say("tokens", problemText(response), false);
      this._created = response.body;
      this._copied = false;
      if (field) field.value = "";
      const list = await this.api.listTokens();
      if (list.ok && list.body) this._tokens = list.body;
      await this.updateComplete;
      this._field("token-secret")?.select();
    });
  }

  private async _copyCreated(): Promise<void> {
    if (!this._created) return;
    this._copied = await copyText(this._created.token, this._field("token-secret"));
    if (!this._copied) this._say("tokens", "Could not copy; select the token and copy it by hand.", false);
  }

  private _renameToken(id: string): Promise<void> {
    return this._run(`token-${id}`, async () => {
      const draft = this._renaming?.draft.trim() ?? "";
      if (!draft) return;
      const response = await this.api.renameToken(id, draft);
      if (!response.ok || !response.body) return this._say("tokens", problemText(response), false);
      this._renaming = null;
      this._tokens = (this._tokens ?? []).map((t) => (t.id === id ? response.body! : t));
    });
  }

  private _revokeToken(id: string): Promise<void> {
    return this._run(`token-${id}`, async () => {
      const response = await this.api.revokeToken(id);
      this._confirmRevoke = null;
      if (!response.ok) return this._say("tokens", problemText(response), false);
      this._tokens = (this._tokens ?? []).filter((t) => t.id !== id);
      if (this._created?.id === id) this._created = null;
      this._say("tokens", "Revoked. Anything using that token can no longer make changes.", true);
    });
  }

  private _renderCreated(): TemplateResult | typeof nothing {
    const created = this._created;
    if (!created) return nothing;
    const base = this.api.baseUrl || location.origin;
    return html`
      <div class="token-new" id="token-created">
        <b>New token "${created.name}": copy it now, it is not shown again.</b>
        <div class="row">
          <input id="token-secret" type="text" readonly .value=${created.token} @focus=${(event: Event) => (event.target as HTMLInputElement).select()} />
          <button class="small fixed" id="token-copy" @click=${this._copyCreated}>${this._copied ? "Copied" : "Copy"}</button>
          <button class="small fixed" id="token-done" @click=${() => { this._created = null; }}>Done</button>
        </div>
        <pre id="token-example">curl -X PUT -H "Authorization: Bearer ${created.token}" -H "Content-Type: application/json" \\
  -d '{}' ${base}/api/v1/server/settings</pre>
        <div class="hint" style="margin-top: 6px">Send it as <span class="mono">Authorization: Bearer &lt;token&gt;</span>, or as <span class="mono">X-Sofabaton-Token: &lt;token&gt;</span> when a reverse proxy's own login already uses the Authorization header.</div>
      </div>
    `;
  }

  private _renderTokenRow(token: TokenInfo): TemplateResult {
    const busy = this._busy.has(`token-${token.id}`);
    const renaming = this._renaming?.id === token.id;
    return html`
      <tr data-token=${token.id}>
        <td class="name">
          ${renaming
            ? html`<span class="rename"><input id="token-rename" type="text" .value=${this._renaming!.draft}
                @input=${(event: Event) => { this._renaming = { id: token.id, draft: (event.target as HTMLInputElement).value }; }}
                @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") void this._renameToken(token.id); if (event.key === "Escape") this._renaming = null; }} /></span>`
            : token.name}
        </td>
        <td class="mono sub">…${token.hint}</td>
        <td class="sub">${localTime(token.created_at)}</td>
        <td class="sub">${token.last_used_at ? localTime(token.last_used_at) : "never"}</td>
        <td class="act">
          ${renaming
            ? html`<button class="small primary" ?disabled=${busy} @click=${() => this._renameToken(token.id)}>Save</button><button class="small" @click=${() => { this._renaming = null; }}>Cancel</button>`
            : this._confirmRevoke === token.id
              ? html`<button class="small danger" data-action="confirm-revoke" ?disabled=${busy} @click=${() => this._revokeToken(token.id)}>Revoke "${token.name}"</button><button class="small" @click=${() => { this._confirmRevoke = null; }}>Keep</button>`
              : html`<button class="small" data-action="rename" @click=${() => { this._renaming = { id: token.id, draft: token.name }; this._confirmRevoke = null; }}>Rename</button><button class="small danger" data-action="revoke" @click=${() => { this._confirmRevoke = token.id; this._renaming = null; }}>Revoke</button>`}
        </td>
      </tr>
    `;
  }

  private _renderTokens(): TemplateResult {
    const tokens = this._tokens;
    return html`
      <div class="panel" id="access-tokens">
        <h2>Tokens</h2>
        <div class="hint intro">Integrations (Hubitat, scripts, other home automation) need a token to change hubs and settings. Reading and control calls (send a command, start an activity) work without one. Tokens do not expire; revoke one when it is no longer used. A token cannot manage tokens or this account.</div>
        ${this._renderCreated()}
        ${tokens === null
          ? html`<div class="empty">loading…</div>`
          : tokens.length === 0
            ? html`<div class="empty" id="tokens-empty">No tokens yet.</div>`
            : html`<div class="scroll-x"><table class="list" id="tokens-table">
                <thead><tr><th>Name</th><th>Ends in</th><th>Created</th><th>Last used</th><th></th></tr></thead>
                <tbody>${tokens.map((t) => this._renderTokenRow(t))}</tbody>
              </table></div>`}
        <div class="add">
          <input id="token-name" type="text" maxlength="64" placeholder="Name, e.g. Hubitat" @keydown=${(event: KeyboardEvent) => { if (event.key === "Enter") void this._createToken(); }} />
          <button class="small primary" id="token-create" ?disabled=${this._busy.has("tokens") || !this.reachable} @click=${this._createToken}>Create token</button>
        </div>
        <div class="msg-line">${this._message("tokens")}</div>
      </div>
    `;
  }

  // -- sessions --------------------------------------------------------------------

  private _signOutOthers(): Promise<void> {
    return this._run("sessions", async () => {
      const response = await this.api.revokeOtherSessions();
      if (!response.ok) return this._say("sessions", problemText(response), false);
      this._sessions = (this._sessions ?? []).filter((s) => s.current);
      this._say("sessions", "Every other browser was signed out.", true);
    });
  }

  private _signOutOne(session: SessionView): Promise<void> {
    return this._run(`session-${session.id}`, async () => {
      const response = await this.api.revokeSession(session.id);
      if (!response.ok) return this._say("sessions", problemText(response), false);
      this._sessions = (this._sessions ?? []).filter((s) => s.id !== session.id);
      if (session.current) this._emit("sb-auth-refresh");
    });
  }

  private _renderSessions(): TemplateResult {
    const sessions = this._sessions;
    const others = (sessions ?? []).filter((s) => !s.current).length;
    return html`
      <div class="panel" id="access-sessions">
        <h2>Signed-in browsers</h2>
        ${sessions === null
          ? html`<div class="empty">loading…</div>`
          : html`<div class="scroll-x"><table class="list" id="sessions-table">
              <thead><tr><th>Browser</th><th>Signed in</th><th>Last seen</th><th>Until</th><th></th></tr></thead>
              <tbody>${sessions.map((s) => html`
                <tr data-session=${s.id}>
                  <td>${browserLabel(s.user_agent)}${s.current ? html`<span class="pill">this one</span>` : nothing}</td>
                  <td class="sub">${localTime(s.created_at)}</td>
                  <td class="sub">${localTime(s.last_seen_at)}</td>
                  <td class="sub">${s.remember ? localTime(s.expires_at) : "browser closes"}</td>
                  <td class="act"><button class="small" ?disabled=${this._busy.has(`session-${s.id}`)} @click=${() => this._signOutOne(s)}>Sign out</button></td>
                </tr>`)}
              </tbody>
            </table></div>`}
        <div class="actions" style="margin-top: 10px">
          <button class="small" id="sessions-others" ?disabled=${!others || this._busy.has("sessions") || !this.reachable} @click=${this._signOutOthers}>Sign out other browsers</button>
          ${this._message("sessions")}
        </div>
      </div>
    `;
  }

  // -- allowed origins -------------------------------------------------------------

  private _originsText(): string {
    return this._originsDraft ?? (this._origins?.value ?? []).join("\n");
  }

  private _saveOrigins(): Promise<void> {
    return this._run("origins", async () => {
      const list = this._originsText().split(/[\s,]+/).map((v) => v.trim()).filter(Boolean);
      const response = await this.api.updateServerSettings({ allowed_origins: list });
      if (!response.ok || !response.body) return this._say("origins", problemText(response), false);
      this._origins = response.body.allowed_origins ?? { value: list, pinned: false };
      this._originsDraft = null;
      this._say("origins", "Saved; in effect now.", true);
    });
  }

  private _renderOrigins(): TemplateResult {
    const origins = this._origins;
    const pinned = Boolean(origins?.pinned);
    const dirty = this._originsDraft !== null && this._originsDraft.trim() !== (origins?.value ?? []).join("\n");
    return html`
      <div class="panel" id="access-origins">
        <h2>Allowed browser origins</h2>
        <div class="hint intro">Web pages on another address (a dashboard at <span class="mono">http://nas:8123</span>, say) that may call this server from the browser: read, and send commands. They never get this panel's sign-in; to make changes they need a token. Pages on other addresses are refused. One origin per line: <span class="mono">scheme://host:port</span>, no path.</div>
        <textarea id="origins" spellcheck="false" placeholder="http://nas:8123" .value=${this._originsText()} ?disabled=${pinned || !origins}
          @input=${(event: Event) => { this._originsDraft = (event.target as HTMLTextAreaElement).value; }}></textarea>
        <div class="actions" style="margin-top: 8px">
          <button class="small primary" id="origins-save" ?disabled=${pinned || !dirty || this._busy.has("origins") || !this.reachable} @click=${this._saveOrigins}>Save</button>
          ${dirty ? html`<button class="small" id="origins-revert" @click=${() => { this._originsDraft = null; }}>Revert</button>` : nothing}
          ${pinned ? html`<span class="note">set by an environment variable or command-line flag</span>` : nothing}
          ${this._message("origins")}
        </div>
      </div>
    `;
  }

  private _message(key: string): TemplateResult | typeof nothing {
    const msg = this._msg[key];
    return msg?.text ? html`<span class="msg ${msg.ok ? "msg-ok" : "msg-err"}" id="${key}-msg">${msg.text}</span>` : nothing;
  }

  // -- page ------------------------------------------------------------------------

  render(): TemplateResult {
    const auth = this.auth;
    if (auth === null) {
      return html`<div class="panel" id="access-unknown"><h2>Access</h2><div class="hint">This server did not report its access settings.</div></div>`;
    }
    if (!auth.claimed) {
      return html`
        <div class="panel" id="access-unclaimed">
          <h2>Access is not set up</h2>
          <div class="hint intro">Anyone who can reach this server can change its hubs and settings, as with earlier versions. Set up an admin account to require this panel's sign-in (or a token, for integrations) for changes. Reading and control (sending commands, starting activities, the web remote) stay open to the network either way.</div>
          <div class="actions"><button class="small primary" id="access-setup" ?disabled=${!this.reachable} @click=${() => this._emit("sb-auth-setup")}>Set up access</button></div>
        </div>
        ${this._renderOrigins()}
      `;
    }
    return html`${this._renderAccount()}${this._renderTokens()}${this._renderSessions()}${this._renderOrigins()}`;
  }
}

export function defineAccessView(): void {
  if (!customElements.get(ACCESS_VIEW_TAG)) customElements.define(ACCESS_VIEW_TAG, SbPanelAccess);
}
