// The IR pill of an X2 IR device in the panel (IR emitter pill plan, IR5):
// the HA card's components/ir-emitter-pill.ts on the panel's API. The pill,
// its dropdown and their CSS are the shared host-free ones in
// remote-card/src/ir-emitters/ (L-A20: never the card's templates); the host
// view owns the state (open, the read) as it does for the delivery pill.
//
// The routing is the device's `device.extras` in the snapshot document, so a
// pick is an edit of the editor's working copy, written by its Sync (`PUT
// /devices/{id}`). What the pill reads from the hub is the paired remotes
// and repeaters (`GET /hubs/{id}/ir-emitters?refresh=true`, a few seconds),
// only when the dropdown opens; without `refresh` the server answers with
// its last read, which the catalog rows and the pill use at rest.

import type { TemplateResult } from "lit";

import { TOOLS_CARD_STRINGS } from "../../../custom_components/sofabaton_x1s/www/src/strings";
import { renderIrEmitterPill, type IrEmitterPillParams } from "../../../remote-card/src/ir-emitters/emitter-dropdown";
import { normalizePaired, type PairedEmitter } from "../../../remote-card/src/ir-emitters/emitter-rules";
import type { ApiResponse, IrEmitterStatusView, PanelApi, Problem } from "../panel-api";

export { irEmitterStyles, renderReadOnlyIrPill } from "../../../remote-card/src/ir-emitters/emitter-dropdown";

/** The last read of a hub's paired remotes and repeaters. */
export interface IrEmitterRead {
  /** Null when the hub was never read since the server started. */
  paired: PairedEmitter[] | null;
  readAt: number | null;
}

// Per hub: the editor's pill writes it, the catalog rows read it.
const LAST_READS = new Map<string, IrEmitterRead>();
const LOADING = new Map<string, Promise<IrEmitterRead | null>>();

function readOf(view: IrEmitterStatusView | null | undefined): IrEmitterRead {
  return { paired: normalizePaired(view?.paired), readAt: typeof view?.read_at === "number" ? view.read_at : null };
}

export function irEmitterLastRead(hubId: string): IrEmitterRead | null {
  return LAST_READS.get(hubId) ?? null;
}

/** The last read is known here (or is being asked for). */
export function irEmitterLastReadKnown(hubId: string): boolean {
  return LAST_READS.has(hubId) || LOADING.has(hubId);
}

/** Forget every hub's read (tests, or the server restarted). */
export function forgetIrEmitterReads(): void {
  LAST_READS.clear();
  LOADING.clear();
}

/** The server's last read for the hub, asked for once (no hub exchange). */
export function loadIrEmitterLastRead(api: PanelApi, hubId: string): Promise<IrEmitterRead | null> {
  if (!hubId) return Promise.resolve(null);
  const known = LAST_READS.get(hubId);
  if (known) return Promise.resolve(known);
  const pending = LOADING.get(hubId);
  if (pending) return pending;
  const load = api.irEmitters(hubId, false).then(
    (response) => {
      // Not an X2 (409) or not connected: nothing to warn from.
      const read = response.ok ? readOf(response.body) : { paired: null, readAt: null };
      if (!LAST_READS.has(hubId)) LAST_READS.set(hubId, read);
      return LAST_READS.get(hubId) ?? read;
    },
    () => null,
  ).finally(() => LOADING.delete(hubId));
  LOADING.set(hubId, load);
  return load;
}

/** A read from the hub (the dropdown opened): the new read, or the line that
 *  says why there is none. A refusal keeps the last read. */
export async function readIrEmitters(api: PanelApi, hubId: string): Promise<{ read: IrEmitterRead | null; error: string | null }> {
  let response: ApiResponse<IrEmitterStatusView>;
  try {
    response = await api.irEmitters(hubId, true);
  } catch {
    return { read: null, error: TOOLS_CARD_STRINGS.irEmitters.readFailed };
  }
  if (!response.ok || !response.body) return { read: null, error: irEmitterReadProblem(response) };
  // The hub did not answer the read: the server says so with an empty list.
  if (response.body.paired == null) return { read: null, error: TOOLS_CARD_STRINGS.irEmitters.readNoAnswer };
  const read = readOf(response.body);
  LAST_READS.set(hubId, read);
  return { read, error: null };
}

/** A refused read, worded with the card's lines. */
export function irEmitterReadProblem(response: ApiResponse): string {
  const S = TOOLS_CARD_STRINGS.irEmitters;
  const type = String((response.body as Partial<Problem> | null)?.type ?? "");
  // hub_busy: an app client holds the hub (observe mode).
  if (type === "hub_busy") return S.readUnavailable;
  if (type === "hub_job_running" || type === "hub_conflict" || type === "remote_syncing") return S.readBusy;
  if (type === "hub_timeout") return S.readNoAnswer;
  return S.readFailed;
}

/** The header's pill and its dropdown, with scope guidance for the server. */
export function renderPanelIrPill(params: Omit<IrEmitterPillParams, "labels">): TemplateResult {
  return renderIrEmitterPill({
    ...params,
    labels: {
      ...TOOLS_CARD_STRINGS.irEmitters,
      scope: "This applies to commands sent to this device. Command tests and raw IR playback always use the hub's emitters.",
    },
  });
}
