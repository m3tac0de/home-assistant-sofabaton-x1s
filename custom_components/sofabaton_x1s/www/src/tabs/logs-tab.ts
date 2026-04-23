import { renderLogConsole } from "../components/log-console";
import type { ControlPanelLogLine } from "../shared/ha-context";

export function renderLogsTab(params: {
  lines: ControlPanelLogLine[];
  loading: boolean;
  error: string | null;
}) {
  return renderLogConsole({
    lines: params.lines,
    loading: params.loading,
    error: params.error,
  });
}
