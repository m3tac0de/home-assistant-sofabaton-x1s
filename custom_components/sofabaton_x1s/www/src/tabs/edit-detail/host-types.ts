// Types the edit-detail view shares with its hosts (R6, CR-F2-14).

import type {
  BackupBundlePayload,
  BlobFetchDecodedBlock,
  HassLike,
  IrEmissionRecord,
  IrEmitterConsumersResponse,
  IrLearnEvent,
  RfBand,
  WifiEvent,
} from "../../shared/ha-context";

export type BackupEditTargetKind = "activity" | "device";

/**
 * A command payload fetched on demand from the hub (live mode). `dataHex` is
 * the raw stored blob; `decoded` is the structured block when the class /
 * hub supports it (raw IR on X1/X1S has none). Supplied by the host's
 * `fetchCommandPayload` callback — the detail view stays hass-free.
 */
export interface FetchedCommandPayload {
  dataHex: string;
  decoded: BlobFetchDecodedBlock | null;
  /** The record's code type (0x1D / 0x1E = RF); absent or null when unknown. */
  libraryType?: number | null;
}

/** How a command's payload plays and learns: IR, or RF on a band. */
export type PayloadSignal = "ir" | RfBand;

export type BackupEditDetailSectionId =
  | "power"
  | "quick_access"
  | "network"
  | "commands"
  | "bindings";

export type BackupQuickAccessKind = "macro" | "favorite";

export type ActivityBindingTargetKind = "command" | "action" | "wifi_event";

/** One Wifi Event target selection inside an Add dialog. */
export type WifiEventTargetSel = { mode: "existing" | "new"; slot: number | null; name: string };

/**
 * Facade the LIVE host (activities-tab) provides for the Wifi Event kind
 * in the Add dialogs. `create` allocates the event in the store (W7: no
 * hub write; the Sync press deploys it) and grafts the Wifi Events
 * device block into the host's captured baseline + working bundles (both:
 * the sync validator's baseline grandfathering depends on it), returning
 * the grafted working bundle for the ref insert. `ensureGrafted` does the
 * graft alone (selecting an existing event whose device predates the
 * capture).
 */
export interface WifiEventsHost {
  list(): Promise<WifiEvent[]>;
  create(name: string): Promise<{ event: WifiEvent; bundle: BackupBundlePayload | null }>;
  ensureGrafted(): Promise<BackupBundlePayload | null>;
}

/**
 * Host facade for the payload editor's learn mode (IR9). The detail view
 * is hass-free; the live Activities host owns the WS subscriptions.
 *
 * `learnFromHub` arms one hub learn window and streams its events; the
 * resolved function cancels the window (and is also how the view lets
 * go of a finished subscription). `subscribeEmissions` is the emitter
 * inbox: the backend replays its intercept ring on subscribe and after
 * every send. `consumers` gates the Home Assistant option. With
 * `band`, `learnFromHub` arms the hub's RF receiver instead (no Home
 * Assistant source exists for RF).
 */
export interface IrLearnHost {
  learnFromHub(
    onEvent: (event: IrLearnEvent) => void,
    timeoutS: number,
    band?: RfBand | null,
  ): Promise<() => void>;
  subscribeEmissions(onEvent: (emissions: IrEmissionRecord[]) => void): Promise<() => void>;
  consumers(): Promise<IrEmitterConsumersResponse>;
}

/**
 * What the delivery pill of a managed Wifi device needs from the live host:
 * Home Assistant (for the delivery record, Test and the broker link), the
 * hub, whether it is an X2 (the method choice) and the shared hub lock.
 * Absent in the offline Backup editor, which shows no pill.
 */
export interface DeliveryHost {
  hass(): HassLike | null;
  hubEntryId(): string;
  /** An X2: the dropdown offers the method choice. */
  canSwitch(): boolean;
  /** Another hub operation runs. */
  locked(): boolean;
  setBusy(busy: boolean, label: string | null): void;
}

/**
 * What the IR pill of an X2 IR device needs from the live host: Home
 * Assistant (the paired remotes and repeaters read), the hub, the routing
 * the hub has (the captured baseline, for the pending state and Undo) and
 * the shared hub lock. Absent in the offline Backup editor, which shows no
 * pill.
 */
export interface IrEmitterHost {
  hass(): HassLike | null;
  hubEntryId(): string;
  /** The device's routing bytes as the hub has them (`device.extras`). */
  baselineExtras(deviceId: number): { a: number; b: number; c: number } | null;
  /** Another hub operation runs. */
  locked(): boolean;
  setBusy(busy: boolean, label: string | null): void;
}

// "copy" brings another activity's macro over verbatim; it is not a "new" item (nothing to fill in).
export type MacroTargetMode = "existing" | "new" | "copy";

// longer a dialog mode — they're edited inline on each command row.
export type MacroStepKind = "command" | "input" | "wifi_event";

export type BackupRenameDialogTarget =
  | { kind: "detail"; entityKind: BackupEditTargetKind; entityId: number }
  | { kind: "macro"; activityId: number; buttonId: number }
  | { kind: "favorite"; activityId: number; buttonId: number }
  | { kind: "command"; deviceId: number; commandId: number }
  | { kind: "device_ip"; deviceId: number };
