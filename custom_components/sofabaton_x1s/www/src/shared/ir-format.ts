/**
 * IR payload format converters for the payload editor (IR8).
 *
 * TS mirror of the Python originals in lib/blob_decoders.py
 * (parse_pronto_hex / render_pronto_hex / parse_raw_ir_blob_body /
 * build_raw_ir_blob_body). Both implementations are locked together by
 * the shared golden vectors in tests/fixtures/ir-format-vectors.json;
 * change semantics in BOTH places or the suites disagree.
 *
 * The canonical model everywhere is `(timings µs, carrier Hz)` - the
 * same pair HA's infrared platform trades in. Rounding uses
 * half-to-even to match Python's round().
 */

/**
 * Conversion failure with a machine-readable code ("ir-format/...").
 * The payload editor maps codes to translated strings; codes are never
 * shown raw except in logs.
 */
export class IrFormatError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "IrFormatError";
  }
}

export interface IrSignal {
  /** Alternating mark/space durations in microseconds, mark first. */
  timingsUs: number[];
  carrierHz: number;
}

export const RAW_IR_DEFAULT_TRAILING_GAP_US = 40000;
const PRONTO_REFERENCE_HZ = 4145146;
const PRONTO_MAX_WORD = 0xffff;

/** Python-compatible round-half-to-even. */
function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  if (diff > 0.5) return floor + 1;
  if (diff < 0.5) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

// ---------------------------------------------------------------------------
// Pronto hex (learned format, 0000)
// ---------------------------------------------------------------------------

export function parseProntoHex(text: string): IrSignal {
  const tokens = text.trim().split(/\s+/).filter((t) => t.length > 0);
  const words = tokens.map((token) => {
    const value = /^[0-9a-fA-F]+$/.test(token) ? parseInt(token, 16) : NaN;
    if (!Number.isInteger(value)) throw new IrFormatError("ir-format/not-hex");
    return value;
  });
  if (words.length < 6) {
    throw new IrFormatError("ir-format/pronto-too-short");
  }
  if (words.some((w) => w < 0 || w > 0xffff)) {
    throw new IrFormatError("ir-format/pronto-word-range");
  }
  const [preamble, freqWord, oncePairs, repeatPairs] = words;
  if (preamble !== 0x0000) {
    throw new IrFormatError("ir-format/pronto-not-learned-format");
  }
  if (freqWord === 0) throw new IrFormatError("ir-format/pronto-zero-frequency");
  const expected = 4 + 2 * (oncePairs + repeatPairs);
  if (words.length !== expected) {
    throw new IrFormatError("ir-format/pronto-count-mismatch");
  }
  const carrierHz = roundHalfEven(PRONTO_REFERENCE_HZ / freqWord);
  let count: number;
  if (oncePairs > 0) {
    count = 2 * oncePairs;
  } else if (repeatPairs > 0) {
    count = 2 * repeatPairs;
  } else {
    throw new IrFormatError("ir-format/pronto-empty");
  }
  const section = words.slice(4, 4 + count);
  if (section.some((w) => w === 0)) throw new IrFormatError("ir-format/pronto-zero-timing");
  const cycleUs = 1_000_000 / carrierHz;
  const timingsUs = section.map((w) => Math.max(1, roundHalfEven(w * cycleUs)));
  return { timingsUs, carrierHz };
}

export function renderProntoHex(signal: IrSignal): string {
  const { carrierHz } = signal;
  const durations = normalizeTimings(signal);
  const freqWord = Math.max(
    1,
    Math.min(PRONTO_MAX_WORD, roundHalfEven(PRONTO_REFERENCE_HZ / carrierHz)),
  );
  const cyclesPerUs = carrierHz / 1_000_000;
  const words = [0x0000, freqWord, durations.length / 2, 0x0000];
  for (const value of durations) {
    words.push(Math.max(1, Math.min(PRONTO_MAX_WORD, roundHalfEven(value * cyclesPerUs))));
  }
  return words.map((w) => w.toString(16).toUpperCase().padStart(4, "0")).join(" ");
}

// ---------------------------------------------------------------------------
// Sofabaton raw blob (live-validated 2026-08-31 layout)
// ---------------------------------------------------------------------------

export function parseSofabatonBlob(hexText: string): IrSignal {
  const blob = hexToBytes(hexText);
  if (blob.length < 8 + 2 * 4 + 4) {
    throw new IrFormatError("ir-format/blob-too-short");
  }
  if (looksLikeDescriptorBlob(blob)) {
    throw new IrFormatError("ir-format/blob-descriptive");
  }
  const carrierHz = (blob[6] << 8) | blob[7];
  if (carrierHz < 10_000 || carrierHz > 500_000) {
    throw new IrFormatError("ir-format/blob-carrier");
  }
  const timingsUs: number[] = [];
  let terminated = false;
  for (let pos = 8; pos + 4 <= blob.length; pos += 4) {
    const word =
      blob[pos] * 0x1000000 + blob[pos + 1] * 0x10000 + blob[pos + 2] * 0x100 + blob[pos + 3];
    if (word === 0) {
      terminated = true;
      break;
    }
    timingsUs.push(word);
  }
  if (!terminated) throw new IrFormatError("ir-format/blob-unterminated");
  if (timingsUs.length < 2) {
    throw new IrFormatError("ir-format/blob-too-few-timings");
  }
  if (timingsUs.some((v) => v < 20 || v > 2_000_000)) {
    throw new IrFormatError("ir-format/blob-timing-range");
  }
  return { timingsUs, carrierHz };
}

export function buildSofabatonBlob(signal: IrSignal): string {
  const { carrierHz } = signal;
  if (!(carrierHz > 0 && carrierHz < 0x10000)) {
    throw new IrFormatError("ir-format/carrier-range");
  }
  const durations = normalizeTimings(signal);
  if (4 * durations.length >= 0x10000) {
    throw new IrFormatError("ir-format/too-many-timings");
  }
  const bytes: number[] = [];
  pushBe16(bytes, 4 * durations.length);
  bytes.push(0, 0, 0, 0);
  pushBe16(bytes, carrierHz);
  for (const value of durations) {
    if (value >= 0x100000000) throw new IrFormatError("ir-format/timing-range");
    bytes.push((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
  }
  bytes.push(0, 0, 0, 0);
  return bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Format detection + helpers
// ---------------------------------------------------------------------------

export type IrPayloadFormat = "descriptor" | "pronto" | "sofabaton" | "uc_hex" | "unknown";

/**
 * Unfolded Circle `HEX` code: `<protocol>;<0xvalue>;<bits>;<repeat>`. The
 * semicolons make the shape exact - none of the other formats can contain
 * one - so detection never has to guess. Conversion itself needs protocol
 * knowledge and lives on the backend (`ir_payload/convert`).
 */
const UC_HEX_RE = /^\s*([A-Za-z_0-9]+)\s*;\s*(?:0[xX])?([0-9A-Fa-f]+)\s*;\s*(\d+)\s*;\s*(\d+)\s*$/;

export function isUcHexCode(text: string): boolean {
  return UC_HEX_RE.test(text);
}

/** One row of an Unfolded Circle codeset export (`"key","format","code"`). */
export interface UcCodesetRow {
  name: string | null;
  format: "HEX" | "PRONTO";
  code: string;
}

/**
 * Unwrap a pasted codeset CSV row into its fields. Accepts quoted and bare
 * cells and a leading name column; returns null for anything else.
 */
export function unwrapUcCodesetRow(text: string): UcCodesetRow | null {
  const trimmed = text.trim();
  if (!trimmed.includes(",")) return null;
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === '"') {
      if (quoted && trimmed[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  const values = cells.map((cell) => cell.trim());
  const formatIndex = values.findIndex((cell) => /^(HEX|PRONTO)$/i.test(cell));
  if (formatIndex < 0 || formatIndex + 1 >= values.length) return null;
  const format = values[formatIndex].toUpperCase() as "HEX" | "PRONTO";
  const code = values.slice(formatIndex + 1).join(",").trim();
  if (!code) return null;
  const name = formatIndex > 0 ? values.slice(0, formatIndex).join(",").trim() : "";
  return { name: name || null, format, code };
}

/** What a pasted Unfolded Circle code resolves to, or null if it is not one. */
export interface UcPaste {
  name: string | null;
  kind: "uc_hex" | "pronto";
  code: string;
}

export function resolveUcPaste(text: string): UcPaste | null {
  const row = unwrapUcCodesetRow(text);
  if (row) {
    if (row.format === "HEX" && isUcHexCode(row.code)) {
      return { name: row.name, kind: "uc_hex", code: row.code.trim() };
    }
    if (row.format === "PRONTO" && detectIrPayloadFormat(row.code) === "pronto") {
      return { name: row.name, kind: "pronto", code: row.code.trim() };
    }
    return null;
  }
  if (isUcHexCode(text)) return { name: null, kind: "uc_hex", code: text.trim() };
  return null;
}

/** Best-effort classification of pasted payload text. */
export function detectIrPayloadFormat(text: string): IrPayloadFormat {
  const trimmed = text.trim();
  if (trimmed.length === 0) return "unknown";
  if (/^P:/i.test(trimmed)) return "descriptor";
  if (isUcHexCode(trimmed)) return "uc_hex";
  const tokens = trimmed.split(/\s+/);
  if (
    tokens.length >= 6 &&
    tokens.every((t) => /^[0-9a-fA-F]{4}$/.test(t)) &&
    parseInt(tokens[0], 16) === 0
  ) {
    const once = parseInt(tokens[2], 16);
    const repeat = parseInt(tokens[3], 16);
    if (tokens.length === 4 + 2 * (once + repeat)) return "pronto";
  }
  if (/^[0-9a-fA-F\s]+$/.test(trimmed)) return "sofabaton";
  return "unknown";
}

function normalizeTimings(signal: IrSignal): number[] {
  if (signal.timingsUs.length === 0) {
    throw new IrFormatError("ir-format/empty");
  }
  const durations = signal.timingsUs.map((v) => Math.abs(Math.trunc(v)));
  if (durations.some((v) => v === 0)) {
    throw new IrFormatError("ir-format/zero-timing");
  }
  if (durations.length % 2 === 1) durations.push(RAW_IR_DEFAULT_TRAILING_GAP_US);
  return durations;
}

function looksLikeDescriptorBlob(blob: Uint8Array): boolean {
  const magic = [0x00, 0x00, 0x11, 0x00, 0x94, 0x70];
  return blob.length >= 8 && magic.every((b, i) => blob[2 + i] === b);
}

function pushBe16(bytes: number[], value: number): void {
  bytes.push((value >>> 8) & 0xff, value & 0xff);
}

export function hexToBytes(hexText: string): Uint8Array {
  const clean = hexText.replace(/\s+/g, "");
  if (clean.length === 0 || clean.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(clean)) {
    throw new IrFormatError("ir-format/not-hex-bytes");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

/** Spaced-byte presentation used by the payload editor textarea. */
export function formatHexForDisplay(hexText: string): string {
  const clean = hexText.replace(/\s+/g, "").toLowerCase();
  return clean.replace(/(..)/g, "$1 ").trim();
}
