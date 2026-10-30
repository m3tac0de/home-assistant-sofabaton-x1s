// X2 IR emitter routing: which emitters send a device's IR. The TypeScript
// twin of the library's `lib/emitter_routing.py` (EmitterRouting), with the
// same semantics; tests/frontend/ir-emitters.test.ts holds the shared tables.
//
// An X2 device record carries three routing bytes (`device.extras` in a
// bundle, `emitters: [a, b, c]` on a device row), one big-endian 24-bit mask:
//   c: bit 0 the hub's built-in emitter, bits 1 and 2 the cables in IR ports
//      1 and 2, bits 3-7 paired remotes 1-5;
//   b: two bits per paired repeater 1-4, its built-in emitter then its IR
//      port (repeater n at bits 2(n-1) and 2(n-1)+1);
//   a: single-button RF devices. Carried, never edited here.
//
// The hub choices are the vendor's four (all, built-in, port 1, port 2) or
// none. Any other mix of the three hub bits reads as `custom`: shown as it
// is and kept until a choice replaces it.

export type HubEmitters = "all" | "builtin" | "port1" | "port2" | "custom" | "none";
/** What a pick can set the hub to. */
export type HubChoice = "all" | "builtin" | "port1" | "port2";
export type RepeaterEmitters = "all" | "builtin" | "port";

export const EMITTER_REMOTE_COUNT = 5;
export const EMITTER_REPEATER_COUNT = 4;

const HUB_BITS: Readonly<Record<Exclude<HubEmitters, "custom">, number>> = { none: 0x00, builtin: 0x01, port1: 0x02, port2: 0x04, all: 0x07 };
const HUB_MASK = 0x07;
const REMOTE_SHIFT = 3;
const REPEATER_BITS: Readonly<Record<RepeaterEmitters, number>> = { builtin: 0b01, port: 0b10, all: 0b11 };

/** The hub choices the vendor app offers, in its order. */
export const HUB_CHOICES: readonly HubChoice[] = ["all", "builtin", "port1", "port2"];
/** A repeater's choices, in the vendor app's order. */
export const REPEATER_CHOICES: readonly RepeaterEmitters[] = ["all", "builtin", "port"];

/** The routing of one X2 device, decoded. Immutable: the `with*` helpers
 *  return a new one. `remotes` and `repeaters` are ascending by number. */
export interface EmitterRouting {
  readonly hub: HubEmitters;
  readonly remotes: readonly number[];
  readonly repeaters: ReadonlyArray<readonly [number, RepeaterEmitters]>;
  /** The three hub bits as they are (the `custom` mix lives here). */
  readonly hubBits: number;
  /** The first byte, carried unchanged. */
  readonly rfByte: number;
}

/** The bundle's form of the three bytes (`device.extras`). */
export interface EmitterExtras {
  a: number;
  b: number;
  c: number;
}

export type EmitterTriple = readonly [number, number, number];

const hubChoiceOfBits = (bits: number): HubEmitters => {
  for (const [choice, value] of Object.entries(HUB_BITS)) if (value === bits) return choice as HubEmitters;
  return "custom";
};

const repeaterChoiceOfBits = (bits: number): RepeaterEmitters | null => {
  for (const [choice, value] of Object.entries(REPEATER_BITS)) if (value === bits) return choice as RepeaterEmitters;
  return null;
};

/** The routing in the three bytes after the record's `0xFC` marker. */
export function decodeEmitters(a: number, b: number, c: number): EmitterRouting {
  const hubBits = c & HUB_MASK;
  const remotes: number[] = [];
  for (let n = 1; n <= EMITTER_REMOTE_COUNT; n++) if (c & (1 << (REMOTE_SHIFT + n - 1))) remotes.push(n);
  const repeaters: Array<readonly [number, RepeaterEmitters]> = [];
  for (let n = 1; n <= EMITTER_REPEATER_COUNT; n++) {
    const choice = repeaterChoiceOfBits((b >> (2 * (n - 1))) & 0b11);
    if (choice) repeaters.push([n, choice]);
  }
  return { hub: hubChoiceOfBits(hubBits), remotes, repeaters, hubBits, rfByte: a & 0xff };
}

/** `[a, b, c]` as the record stores them. */
export function encodeEmitters(routing: EmitterRouting): EmitterTriple {
  const hubBits = routing.hub === "custom" ? routing.hubBits : HUB_BITS[routing.hub];
  let c = hubBits & HUB_MASK;
  for (const n of routing.remotes) c |= 1 << (REMOTE_SHIFT + n - 1);
  let b = 0;
  for (const [n, choice] of routing.repeaters) b |= REPEATER_BITS[choice] << (2 * (n - 1));
  return [routing.rfByte & 0xff, b & 0xff, c & 0xff];
}

const isByte = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xff;

/** The routing of a bundle's `device.extras`, or null when it carries none
 *  (off the X2, or a record without the routing block). */
export function routingFromExtras(extras: unknown): EmitterRouting | null {
  if (!extras || typeof extras !== "object") return null;
  const { a, b, c } = extras as Record<string, unknown>;
  if (!isByte(a) || !isByte(b) || !isByte(c)) return null;
  return decodeEmitters(a, b, c);
}

/** The routing of a device row's `emitters: [a, b, c]`, or null. */
export function routingFromTriple(triple: unknown): EmitterRouting | null {
  if (!Array.isArray(triple) || triple.length !== 3) return null;
  const [a, b, c] = triple as unknown[];
  if (!isByte(a) || !isByte(b) || !isByte(c)) return null;
  return decodeEmitters(a, b, c);
}

/** The bundle form of a routing, for `device.extras`. */
export function extrasOfRouting(routing: EmitterRouting): EmitterExtras {
  const [a, b, c] = encodeEmitters(routing);
  return { a, b, c };
}

/** Both route the same emitters (and carry the same RF byte). */
export function sameRouting(left: EmitterRouting, right: EmitterRouting): boolean {
  const [a1, b1, c1] = encodeEmitters(left);
  const [a2, b2, c2] = encodeEmitters(right);
  return a1 === a2 && b1 === b2 && c1 === c2;
}

/** No hub emitter, remote or repeater sends the device's IR. */
export function isEmptyRouting(routing: EmitterRouting): boolean {
  const [, b, c] = encodeEmitters(routing);
  return b === 0 && c === 0;
}

/** Only remotes send it: neither the hub nor a repeater. */
export function isRemoteOnly(routing: EmitterRouting): boolean {
  return routing.hub === "none" && routing.repeaters.length === 0 && routing.remotes.length > 0;
}

/** Only repeaters send it: neither the hub nor a remote. */
export function isRepeaterOnly(routing: EmitterRouting): boolean {
  return routing.hub === "none" && routing.remotes.length === 0 && routing.repeaters.length > 0;
}

export function repeaterChoice(routing: EmitterRouting, number: number): RepeaterEmitters | null {
  return routing.repeaters.find(([n]) => n === number)?.[1] ?? null;
}

/** The hub set to one of the four choices, or none. */
export function withHub(routing: EmitterRouting, choice: HubChoice | "none"): EmitterRouting {
  if (!(choice in HUB_BITS)) throw new RangeError(`hub emitters must be one of ${Object.keys(HUB_BITS).join(", ")}; got ${String(choice)}`);
  return { ...routing, hub: choice, hubBits: HUB_BITS[choice] };
}

export function withRemote(routing: EmitterRouting, number: number, on: boolean): EmitterRouting {
  if (!Number.isInteger(number) || number < 1 || number > EMITTER_REMOTE_COUNT) {
    throw new RangeError(`remote number must be 1-${EMITTER_REMOTE_COUNT}; got ${number}`);
  }
  const remotes = new Set(routing.remotes);
  if (on) remotes.add(number);
  else remotes.delete(number);
  return { ...routing, remotes: [...remotes].sort((x, y) => x - y) };
}

/** Repeater `number` set to a choice, or dropped with null. */
export function withRepeater(routing: EmitterRouting, number: number, choice: RepeaterEmitters | null): EmitterRouting {
  if (!Number.isInteger(number) || number < 1 || number > EMITTER_REPEATER_COUNT) {
    throw new RangeError(`repeater number must be 1-${EMITTER_REPEATER_COUNT}; got ${number}`);
  }
  if (choice !== null && !(choice in REPEATER_BITS)) {
    throw new RangeError(`repeater emitters must be one of ${Object.keys(REPEATER_BITS).join(", ")}; got ${String(choice)}`);
  }
  const repeaters = new Map(routing.repeaters.map(([n, c]) => [n, c] as const));
  if (choice === null) repeaters.delete(number);
  else repeaters.set(number, choice);
  return { ...routing, repeaters: [...repeaters.entries()].sort(([x], [y]) => x - y) };
}

/** Lowercase hex of the three bytes (the library's `to_dict()["bytes"]`). */
export function routingHex(routing: EmitterRouting): string {
  return encodeEmitters(routing).map((value) => value.toString(16).padStart(2, "0")).join("");
}
