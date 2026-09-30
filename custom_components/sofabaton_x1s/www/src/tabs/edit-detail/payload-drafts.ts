// Pure conversions between decoded payload fields and their editor drafts (R6, CR-F2-14).

import type { BlobFetchDecodedBlock } from "../../shared/ha-context";
import {
  DECODED_CLASS_FORM_SPECS,
  type BackupCommandDecodedBlock,
  type DecodableCommandClass,
  type DecodedFieldSpec,
} from "../backup-state";

/**
 * Convert a draft string from a form control to the value shape the
 * decoder expects. `numeric` fields become numbers; `crlfOnWire`
 * fields get `\n` line endings normalized to `\r\n` so the wire
 * round-trip stays exact even though the browser textarea hides the
 * `\r`. Everything else passes through verbatim.
 */
export function draftToFieldValue(draft: string, field: DecodedFieldSpec): unknown {
  if (field.numeric) {
    const numeric = Number(draft);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  if (field.escapedDisplay) {
    // Inverse of the display escape in `_fieldValueToDraft`. We do
    // NOT touch lone backslashes — body_block content in observed
    // Hue / Sonos commands never contains literal `\` text, and
    // honoring `\\` would force the user to double-escape ordinary
    // backslashes in pasted JSON.
    let result = draft.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
    // If the user pressed Enter inside the textarea, that produces
    // a real LF in the input value. Keep it — they meant a newline,
    // and the next render will re-escape it for display. The above
    // replace order means typed `\n` text wins over rendered LF,
    // which is what we want.
    return result;
  }
  if (field.crlfOnWire) {
    return draft.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  }
  return draft;
}

export function fieldValueToDraft(value: unknown, field: DecodedFieldSpec): string {
  if (value == null) return "";
  if (field.numeric) return String(Number(value) || 0);
  const stringValue = String(value);
  if (field.escapedDisplay) {
    // Surface the wire `\n` / `\r` characters as their two-char
    // escape sequences so the user can see and edit the literal
    // string. `_draftToFieldValue` performs the reverse on save.
    return stringValue.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  }
  return stringValue;
}

/** Convert a fetched decoded block into the editor's snapshot shape. */
export function decodedSnapshotFromFetch(decoded: BlobFetchDecodedBlock | null): BackupCommandDecodedBlock | null {
  if (!decoded) return null;
  const className = String(decoded.class ?? "").trim().toLowerCase();
  if (!(className in DECODED_CLASS_FORM_SPECS)) return null;
  return {
    className: className as DecodableCommandClass,
    fields: { ...(decoded.fields ?? {}) },
    trailerHex: String(decoded.trailer_hex ?? ""),
    edited: false,
  };
}
