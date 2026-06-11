import { html } from "lit";
import { renderSecondaryTabShell, renderSecondaryViewBody } from "./secondary-tab";
import type { ControlPanelLogLine } from "../shared/ha-context";
import { formatLogEntry } from "../shared/utils/control-panel-selectors";
import { TOOLS_CARD_STRINGS } from "../strings";

export function renderLogConsole(params: {
  lines: ControlPanelLogLine[];
  loading: boolean;
  error: string | null;
}) {
  const body =
    params.loading && !params.lines.length
      ? html`<div class="logs-empty">${TOOLS_CARD_STRINGS.logs.loading}</div>`
      : params.error && !params.lines.length
        ? html`<div class="logs-empty error">${params.error}</div>`
        : !params.lines.length
          ? html`<div class="logs-empty">${TOOLS_CARD_STRINGS.logs.empty}</div>`
          : params.lines.map((line) => {
              const formatted = formatLogEntry(line);
              return html`
                <div class="log-line" title=${`${formatted.prefix} ${formatted.lineText}`.trim()}><span class="log-line-level log-line-level--${formatted.level}">${formatted.prefix}</span> <span class="log-line-msg">${formatted.lineText}</span></div>
              `;
            });
  return html`
    <div class="tab-panel logs-panel">
      ${renderSecondaryTabShell({
        items: [{ id: "logs", label: TOOLS_CARD_STRINGS.logs.liveConsole, icon: "mdi:console-line", passive: true }],
        selectedId: "logs",
        connected: true,
        shellClassName: "secondary-view-shell--edge",
        content: renderSecondaryViewBody({
          connected: true,
          className: "logs-console-wrap",
          content: html`<div class="logs-console" id="logs-console">${body}</div>`,
        }),
      })}
    </div>
  `;
}
