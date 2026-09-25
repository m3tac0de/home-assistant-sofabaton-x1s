// Setting up access and signing in (docs/internal/sofabaton-x-server-auth-plan.md,
// sections 2 and 8). One element, two modes:
//
// * `setup`: the admin account for an unclaimed server (username, the
//   password twice, Remember me), as a dialog the banner opens;
// * `signin`: the sign-in wall of a claimed server when this browser has
//   no session (`variant="wall"`, the whole page), or the overlay over the
//   current view when a session ends mid-work (`variant="dialog"`): the view
//   stays mounted underneath, so an unsaved editor draft survives.
//
// It calls the API itself and tells the shell with `sb-auth-changed`
// (detail: the new AuthStatus); `sb-auth-cancel` closes the setup dialog.

import { LitElement, html, css, nothing, type TemplateResult } from "lit";

import { problemText, type AuthStatus, type PanelApi } from "../panel-api";
import { PANEL_BASE_CSS } from "../panel-styles";

export const AUTH_DIALOG_TAG = "sb-panel-auth";

const PASSWORD_MIN = 8;

export class SbPanelAuth extends LitElement {
  static properties = {
    api: { attribute: false },
    mode: { type: String },
    variant: { type: String },
    username: { type: String },
    _busy: { state: true },
    _error: { state: true },
  };

  static styles = [
    PANEL_BASE_CSS,
    css`
      :host { display: contents; }
      .backdrop { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; padding: 18px; background: rgba(0, 0, 0, 0.52); }
      .wall { min-height: 100dvh; display: flex; align-items: center; justify-content: center; padding: 18px; background: var(--sbp-bg); }
      form { width: min(400px, calc(100vw - 36px)); display: flex; flex-direction: column; border-radius: 16px; border: 1px solid var(--sbp-line); background: var(--sbp-panel); box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28); overflow: hidden; margin: 0; }
      .wall form { box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06); }
      .head { padding: 16px 16px 4px; }
      .brand { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--sbp-muted); }
      .title { font-size: 17px; font-weight: 600; margin-top: 4px; }
      .body { padding: 4px 16px 16px; display: flex; flex-direction: column; }
      .body .hint { margin-top: 6px; }
      input[type="text"], input[type="password"] { font-size: 14px; padding: 9px 10px; border-radius: 10px; }
      label.inline { margin-top: 14px; }
      .foot { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--sbp-line); flex-wrap: wrap; }
      .error { flex: 1 1 160px; min-height: 18px; font-size: 13px; color: var(--sbp-err); }
      .buttons { display: flex; gap: 8px; margin-left: auto; }
      .buttons button { min-height: 38px; padding: 8px 14px; border-radius: 10px; font-weight: 700; }
      @media (max-width: 640px) {
        .backdrop { padding: 0; align-items: flex-end; }
        .backdrop form { width: 100%; border-radius: 22px 22px 0 0; }
      }
    `,
  ];

  api!: PanelApi;
  mode: "setup" | "signin" = "signin";
  variant: "wall" | "dialog" = "dialog";
  username = "";
  private _busy = false;
  private _error = "";

  firstUpdated(): void {
    const first = this.renderRoot.querySelector<HTMLInputElement>(this.username && this.mode === "signin" ? "#auth-password" : "#auth-username");
    first?.focus();
  }

  private _value(id: string): string {
    return this.renderRoot.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "";
  }

  private _checked(id: string): boolean {
    return Boolean(this.renderRoot.querySelector<HTMLInputElement>(`#${id}`)?.checked);
  }

  private async _submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this._busy) return;
    const username = this._value("auth-username").trim();
    const password = this._value("auth-password");
    const remember = this._checked("auth-remember");
    if (!username) {
      this._error = "Enter a username.";
      return;
    }
    if (this.mode === "setup") {
      if (password.length < PASSWORD_MIN) {
        this._error = `The password needs at least ${PASSWORD_MIN} characters.`;
        return;
      }
      if (password !== this._value("auth-password2")) {
        this._error = "The passwords do not match.";
        return;
      }
    }
    this._busy = true;
    this._error = "";
    try {
      const response = this.mode === "setup"
        ? await this.api.setupAdmin(username, password, remember)
        : await this.api.signIn(username, password, remember);
      if (response.ok && response.body) {
        this.dispatchEvent(new CustomEvent<AuthStatus>("sb-auth-changed", { detail: response.body, bubbles: true, composed: true }));
      } else if (response.status === 401) {
        this._error = "Wrong username or password.";
      } else if (response.status === 409 && this.mode === "setup") {
        this._error = "Access was already set up (maybe in another tab). Sign in instead.";
      } else {
        this._error = problemText(response);
      }
    } catch (err) {
      this._error = `Could not reach the server: ${String(err)}`;
    } finally {
      this._busy = false;
    }
  }

  private _cancel(): void {
    this.dispatchEvent(new CustomEvent("sb-auth-cancel", { bubbles: true, composed: true }));
  }

  private _form(): TemplateResult {
    const setup = this.mode === "setup";
    const title = setup ? "Set up access" : this.variant === "dialog" ? "Signed out" : "Sign in";
    return html`
      <form id="auth-form" role="dialog" aria-modal=${this.variant === "dialog" ? "true" : "false"} aria-labelledby="auth-title" @submit=${this._submit} @click=${(event: Event) => event.stopPropagation()} novalidate>
        <div class="head">
          <div class="brand">Sofabaton X control panel</div>
          <div class="title" id="auth-title">${title}</div>
        </div>
        <div class="body">
          ${setup
            ? html`<div class="hint">Choose the admin account for this server. After this, changes to hubs and server settings need this sign-in here, or a token for integrations. Reading and controlling (sending commands, starting activities) stay open to the network.</div>`
            : this.variant === "dialog"
              ? html`<div class="hint">Your session ended (it expired, or the password was changed elsewhere). Sign in to continue; nothing you were editing is lost.</div>`
              : nothing}
          <label for="auth-username">Username</label>
          <input id="auth-username" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" .value=${this.username || (setup ? "admin" : "")} ?disabled=${this._busy} />
          <label for="auth-password">Password</label>
          <input id="auth-password" type="password" autocomplete=${setup ? "new-password" : "current-password"} ?disabled=${this._busy} />
          ${setup
            ? html`<label for="auth-password2">Password again</label>
                <input id="auth-password2" type="password" autocomplete="new-password" ?disabled=${this._busy} />
                <div class="hint">At least ${PASSWORD_MIN} characters. Forgot it later? Run <span class="mono">sofabaton-x-server --reset-password</span> on the server's host.</div>`
            : nothing}
          <label class="inline" for="auth-remember"><input id="auth-remember" type="checkbox" ?disabled=${this._busy} /> Remember me on this browser</label>
        </div>
        <div class="foot">
          <div class="error" id="auth-error" role="alert">${this._error}</div>
          <div class="buttons">
            ${setup ? html`<button type="button" id="auth-cancel" ?disabled=${this._busy} @click=${this._cancel}>Not now</button>` : nothing}
            <button type="submit" class="primary" id="auth-submit" ?disabled=${this._busy}>${this._busy ? "…" : setup ? "Set up" : "Sign in"}</button>
          </div>
        </div>
      </form>
    `;
  }

  render(): TemplateResult {
    if (this.variant === "wall") return html`<div class="wall" id="auth-wall">${this._form()}</div>`;
    const close = this.mode === "setup" ? () => this._cancel() : () => {};
    return html`<div class="backdrop" id="auth-backdrop" @click=${close}>${this._form()}</div>`;
  }
}

export function defineAuthDialog(): void {
  if (!customElements.get(AUTH_DIALOG_TAG)) customElements.define(AUTH_DIALOG_TAG, SbPanelAuth);
}
