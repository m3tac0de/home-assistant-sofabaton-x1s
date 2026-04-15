import { html } from "lit";
import type { ControlPanelLogLine } from "../shared/ha-context";
import { formatLogEntry } from "../shared/utils/control-panel-selectors";

export function renderLogConsole(params: {
  lines: ControlPanelLogLine[];
  loading: boolean;
  error: string | null;
}) {
  const body =
    params.loading && !params.lines.length
      ? html`<div class="logs-empty">Loading log stream…</div>`
      : params.error && !params.lines.length
        ? html`<div class="logs-empty error">${params.error}</div>`
        : !params.lines.length
          ? html`<div class="logs-empty">No log lines captured for this hub yet.</div>`
          : params.lines.map((line) => {
              const formatted = formatLogEntry(line);
              return html`
                <div class="log-line" title=${`${formatted.prefix} ${formatted.lineText}`.trim()}><span class="log-line-level log-line-level--${formatted.level}">${formatted.prefix}</span> <span class="log-line-msg">${formatted.lineText}</span></div>
              `;
            });
  return html`
    <div class="tab-panel logs-panel">
      <div class="logs-header">
        <div class="acc-title">Live Console</div>
      </div>
      <div class="logs-console" id="logs-console">${body}</div>
    </div>
  `;
}
