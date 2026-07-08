/**
 * Reusable "Refresh entire hub cache" button.
 *
 * Starts the blob-free whole-hub structural refresh
 * (`sofabaton_x1s/cache/refresh_all`), subscribes to its progress via the
 * shared backup progress registry, and shows a spinner + phase message while
 * it runs. Emits a `refreshed` event on success so the host can reload state.
 * Placed in the Cache tab and anywhere fresh cache matters (Activities tab).
 */
import { LitElement, css, html, nothing } from "lit";
import type { BackupProgressEvent, HassLike } from "../shared/ha-context";
import { ControlPanelApi } from "../shared/api/control-panel-api";
import { formatError } from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";

class SofabatonRefreshCacheButton extends LitElement {
  static properties = {
    hass: { attribute: false },
    entryId: { type: String },
    label: { type: String },
    disabled: { type: Boolean },
    _running: { state: true },
    _message: { state: true },
    _error: { state: true },
  };

  static styles = css`
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

  hass: HassLike | null = null;
  entryId = "";
  label = "";
  disabled = false;

  private _running = false;
  private _message = "";
  private _error: string | null = null;
  private _unsub: (() => void) | null = null;

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._teardown();
  }

  private _teardown() {
    const unsub = this._unsub;
    this._unsub = null;
    if (unsub) {
      try { unsub(); } catch { /* ignore */ }
    }
  }

  private _api() {
    if (!this.hass) throw new Error("Home Assistant is not available");
    return new ControlPanelApi(this.hass);
  }

  private _start = async () => {
    if (this._running || !this.entryId || !this.hass) return;
    this._running = true;
    this._error = null;
    this._message = TOOLS_CARD_STRINGS.cacheRefresh.starting;
    try {
      const start = await this._api().startCacheRefresh(this.entryId);
      await this._subscribe(start.operation_id);
    } catch (error) {
      this._running = false;
      this._error = formatError(error);
      this._message = "";
    }
  };

  private async _subscribe(operationId: string) {
    this._teardown();
    const unsub = await this._api().subscribeBackupProgress(operationId, (payload: BackupProgressEvent) => {
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

  protected render() {
    const S = TOOLS_CARD_STRINGS.cacheRefresh;
    return html`
      <div class="wrap">
        <button ?disabled=${this._running || this.disabled || !this.entryId} @click=${this._start}>
          <ha-icon class=${this._running ? "spin" : ""} icon="mdi:refresh"></ha-icon>
          <span>${this._running ? S.running : (this.label || S.label)}</span>
        </button>
        ${this._running && this._message
          ? html`<div class="status">${this._message}</div>`
          : this._error
            ? html`<div class="status error">${this._error}</div>`
            : nothing}
      </div>
    `;
  }
}

if (!customElements.get("sofabaton-refresh-cache-button")) {
  customElements.define("sofabaton-refresh-cache-button", SofabatonRefreshCacheButton);
}
