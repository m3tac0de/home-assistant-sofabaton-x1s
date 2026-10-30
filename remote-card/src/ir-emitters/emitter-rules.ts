// What the IR pill says about a routing, given the hub's paired remotes and
// repeaters from the last read (docs/internal/ir-emitter-pill-plan.md,
// section 1). Pure: shared by the HA card and the server panel.
//
// Amber (attention) only for a picked repeater that is offline and for a
// picked remote or repeater the hub no longer has paired. A routing with no
// hub emitter (remote only, repeater only) is a neutral note, never amber.
// The hub's own emitters and both IR ports are always there: the hub's
// cable flags are not reliable, so no port is ever flagged.

import {
  EMITTER_REMOTE_COUNT,
  EMITTER_REPEATER_COUNT,
  repeaterChoice,
  routingFromTriple,
  withHub,
  withRemote,
  withRepeater,
  type EmitterRouting,
  type HubChoice,
  type HubEmitters,
  type RepeaterEmitters,
} from "./emitter-routing";

/** One paired remote or repeater, as the status read lists it. */
export interface PairedEmitter {
  kind: "remote" | "repeater";
  /** Its routing number: remote 1-5, repeater 1-4. */
  number: number;
  name: string;
  online: boolean;
  /** A repeater's own cable flag; unbenched, so not used yet. */
  port_cable?: boolean | null;
}

export type IrEmitterProblem =
  | { kind: "offline"; target: "repeater"; number: number; name: string }
  | { kind: "unpaired"; target: "remote" | "repeater"; number: number; name: string | null };

/** The neutral note of a routing without the hub's emitters. */
export type IrEmitterNote = "remote_only" | "repeater_only" | "no_hub";

/** One "Send IR from" row: the hub, a repeater or a remote. */
export interface IrEmitterRow {
  key: string;
  kind: "hub" | "repeater" | "remote";
  /** The remote's or repeater's number; 0 for the hub. */
  number: number;
  /** The paired name; null for the hub and for one the last read did not list. */
  name: string | null;
  picked: boolean;
  /** Listed by the last read; null when there is no read yet. */
  paired: boolean | null;
  /** Its online state from the last read; null when unknown. */
  online: boolean | null;
  /** The hub's or the repeater's choice while picked. */
  choice: HubEmitters | RepeaterEmitters | null;
}

const inRange = (kind: "remote" | "repeater", number: number) =>
  Number.isInteger(number) && number >= 1 && number <= (kind === "remote" ? EMITTER_REMOTE_COUNT : EMITTER_REPEATER_COUNT);

/** The paired rows of a status answer, checked; null when the hub was never read. */
export function normalizePaired(raw: unknown): PairedEmitter[] | null {
  if (!Array.isArray(raw)) return null;
  const rows: PairedEmitter[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const kind = row.kind === "remote" || row.kind === "repeater" ? row.kind : null;
    const number = Number(row.number);
    if (!kind || !inRange(kind, number)) continue;
    rows.push({
      kind,
      number,
      name: String(row.name ?? "").trim(),
      online: row.online === true,
      port_cable: typeof row.port_cable === "boolean" ? row.port_cable : null,
    });
  }
  return rows;
}

const pairedRow = (paired: readonly PairedEmitter[] | null, kind: "remote" | "repeater", number: number) =>
  paired?.find((row) => row.kind === kind && row.number === number) ?? null;

/** How many rows are picked: the hub (any of its choices) plus each remote and repeater. */
export function pickedRowCount(routing: EmitterRouting): number {
  return (routing.hub === "none" ? 0 : 1) + routing.remotes.length + routing.repeaters.length;
}

/** What needs attention; nothing without a read (the pill stays plain). */
export function irEmitterProblems(routing: EmitterRouting, paired: readonly PairedEmitter[] | null): IrEmitterProblem[] {
  if (!paired) return [];
  const problems: IrEmitterProblem[] = [];
  for (const [number] of routing.repeaters) {
    const row = pairedRow(paired, "repeater", number);
    if (!row) problems.push({ kind: "unpaired", target: "repeater", number, name: null });
    else if (!row.online) problems.push({ kind: "offline", target: "repeater", number, name: row.name });
  }
  for (const number of routing.remotes) {
    if (!pairedRow(paired, "remote", number)) problems.push({ kind: "unpaired", target: "remote", number, name: null });
  }
  return problems;
}

export function irEmitterAttention(routing: EmitterRouting | null, paired: readonly PairedEmitter[] | null): boolean {
  return routing !== null && irEmitterProblems(routing, paired).length > 0;
}

/** A device row's read-only pill: amber when its `emitters` and the last read need attention. */
export function irEmitterRowAttention(emitters: unknown, paired: readonly PairedEmitter[] | null): boolean {
  return irEmitterAttention(routingFromTriple(emitters), paired);
}

/** The neutral note when the hub's own emitters are not picked. */
export function irEmitterNote(routing: EmitterRouting): IrEmitterNote | null {
  if (routing.hub !== "none") return null;
  const remotes = routing.remotes.length > 0;
  const repeaters = routing.repeaters.length > 0;
  if (remotes && repeaters) return "no_hub";
  if (remotes) return "remote_only";
  if (repeaters) return "repeater_only";
  return null;
}

/** The rows to show: the hub, then the repeaters, then the remotes, each the
 *  paired ones plus any the routing names that the last read did not list
 *  (so it can be unticked). Without a read, only the picked ones. */
export function irEmitterRows(routing: EmitterRouting, paired: readonly PairedEmitter[] | null): IrEmitterRow[] {
  const rows: IrEmitterRow[] = [{
    key: "hub",
    kind: "hub",
    number: 0,
    name: null,
    picked: routing.hub !== "none",
    paired: true,
    online: true,
    choice: routing.hub === "none" ? null : routing.hub,
  }];
  for (const kind of ["repeater", "remote"] as const) {
    const picked = kind === "repeater" ? routing.repeaters.map(([n]) => n) : [...routing.remotes];
    const listed = (paired ?? []).filter((row) => row.kind === kind).map((row) => row.number);
    const numbers = [...new Set([...listed, ...picked])].sort((x, y) => x - y);
    for (const number of numbers) {
      const row = pairedRow(paired, kind, number);
      rows.push({
        key: `${kind}:${number}`,
        kind,
        number,
        name: row?.name || null,
        picked: picked.includes(number),
        paired: paired ? row !== null : null,
        online: row ? row.online : null,
        choice: kind === "repeater" ? repeaterChoice(routing, number) : null,
      });
    }
  }
  return rows;
}

/** Tick or untick a row. Ticking the hub or a repeater picks All (the
 *  vendor's default); the last picked row stays picked (null). */
export function toggleEmitterRow(routing: EmitterRouting, row: Pick<IrEmitterRow, "kind" | "number" | "picked">): EmitterRouting | null {
  if (row.picked && pickedRowCount(routing) <= 1) return null;
  if (row.kind === "hub") return withHub(routing, row.picked ? "none" : "all");
  if (row.kind === "repeater") return withRepeater(routing, row.number, row.picked ? null : "all");
  return withRemote(routing, row.number, !row.picked);
}

/** The hub's choice picked (it replaces a custom mix). */
export function pickHubEmitters(routing: EmitterRouting, choice: HubChoice): EmitterRouting {
  return withHub(routing, choice);
}

export function pickRepeaterEmitters(routing: EmitterRouting, number: number, choice: RepeaterEmitters): EmitterRouting {
  return withRepeater(routing, number, choice);
}

/** The custom hub mix, named by its two bits (the only mixes outside the four). */
export function customHubMix(routing: EmitterRouting): "builtin_port1" | "builtin_port2" | "ports" | null {
  if (routing.hub !== "custom") return null;
  switch (routing.hubBits & 0x07) {
    case 0x03: return "builtin_port1";
    case 0x05: return "builtin_port2";
    case 0x06: return "ports";
    default: return null;
  }
}
