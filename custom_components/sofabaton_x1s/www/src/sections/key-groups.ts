// Key groups (dpad / nav / mid / media / colors / abc) for the Lit card.
// Same structure and per-key configs as the legacy buildRemoteGroups(), but
// rendered declaratively around create-once <sb-key-button> hosts.

import { html, type TemplateResult } from "lit";
import { ID } from "../remote-card-layout";
import {
  colorKeyModel,
  huiButtonModel,
} from "../remote-card-render-models";
import { midModeState, mediaModeState } from "../remote-card-runtime-display";
import { str } from "../remote-card-strings";
import type { HassLike } from "../remote-card-types";
import "../components/sb-key-button";

export interface KeySpec {
  key: string;
  id: number;
  cmd: number;
  label: string;
  icon: string;
  extraClass?: string;
  size?: string;
  color?: string;
}

// Mirrors the legacy _render()'s x2-only set.
export const X2_ONLY_KEY_IDS = new Set<number>([
  ID.C,
  ID.B,
  ID.A,
  ID.EXIT,
  ID.DVR,
  ID.PLAY,
  ID.GUIDE,
]);

const dpadKeys = (): KeySpec[] => [
  { key: "up", id: ID.UP, cmd: ID.UP, label: "", icon: "mdi:chevron-up", extraClass: "area-up" },
  { key: "left", id: ID.LEFT, cmd: ID.LEFT, label: "", icon: "mdi:chevron-left", extraClass: "area-left" },
  { key: "ok", id: ID.OK, cmd: ID.OK, label: str().keys.ok, icon: "", extraClass: "area-ok okKey", size: "big" },
  { key: "right", id: ID.RIGHT, cmd: ID.RIGHT, label: "", icon: "mdi:chevron-right", extraClass: "area-right" },
  { key: "down", id: ID.DOWN, cmd: ID.DOWN, label: "", icon: "mdi:chevron-down", extraClass: "area-down" },
];

const navKeys = (): KeySpec[] => [
  { key: "back", id: ID.BACK, cmd: ID.BACK, label: "", icon: "mdi:arrow-u-left-top" },
  { key: "home", id: ID.HOME, cmd: ID.HOME, label: "", icon: "mdi:home" },
  { key: "menu", id: ID.MENU, cmd: ID.MENU, label: "", icon: "mdi:menu" },
];

const midKeys = (): KeySpec[] => [
  { key: "volup", id: ID.VOL_UP, cmd: ID.VOL_UP, label: "", icon: "mdi:volume-plus", extraClass: "mid-btn mid-btn-volup" },
  { key: "voldn", id: ID.VOL_DOWN, cmd: ID.VOL_DOWN, label: "", icon: "mdi:volume-minus", extraClass: "mid-btn mid-btn-voldn" },
  { key: "guide", id: ID.GUIDE, cmd: ID.GUIDE, label: "Guide", icon: "", extraClass: "mid-btn mid-btn-guide" },
  { key: "mute", id: ID.MUTE, cmd: ID.MUTE, label: "", icon: "mdi:volume-mute", extraClass: "mid-btn mid-btn-mute" },
  { key: "chup", id: ID.CH_UP, cmd: ID.CH_UP, label: "", icon: "mdi:chevron-up", extraClass: "mid-btn mid-btn-chup" },
  { key: "chdn", id: ID.CH_DOWN, cmd: ID.CH_DOWN, label: "", icon: "mdi:chevron-down", extraClass: "mid-btn mid-btn-chdn" },
];

const mediaKeys = (): KeySpec[] => [
  { key: "rew", id: ID.REW, cmd: ID.REW, label: "", icon: "mdi:rewind", extraClass: "area-rew" },
  { key: "play", id: ID.PLAY, cmd: ID.PLAY, label: "", icon: "mdi:play", extraClass: "area-play" },
  { key: "fwd", id: ID.FWD, cmd: ID.FWD, label: "", icon: "mdi:fast-forward", extraClass: "area-fwd" },
  { key: "dvr", id: ID.DVR, cmd: ID.DVR, label: "DVR", icon: "", extraClass: "area-dvr" },
  { key: "pause", id: ID.PAUSE, cmd: ID.PAUSE, label: "", icon: "mdi:pause", extraClass: "area-pause" },
  { key: "exit", id: ID.EXIT, cmd: ID.EXIT, label: "Exit", icon: "", extraClass: "area-exit" },
];

const colorKeys = (): KeySpec[] => [
  { key: "red", id: ID.RED, cmd: ID.RED, label: "", icon: "", color: "#d32f2f" },
  { key: "green", id: ID.GREEN, cmd: ID.GREEN, label: "", icon: "", color: "#388e3c" },
  { key: "yellow", id: ID.YELLOW, cmd: ID.YELLOW, label: "", icon: "", color: "#fbc02d" },
  { key: "blue", id: ID.BLUE, cmd: ID.BLUE, label: "", icon: "", color: "#1976d2" },
];

const abcKeys = (): KeySpec[] => [
  { key: "a", id: ID.A, cmd: ID.A, label: "A", icon: "", size: "small" },
  { key: "b", id: ID.B, cmd: ID.B, label: "B", icon: "", size: "small" },
  { key: "c", id: ID.C, cmd: ID.C, label: "C", icon: "", size: "small" },
];

export interface KeyGroupsParams {
  hass: HassLike | null;
  isX2: boolean;
  /** runtimeButtonVisibility() map — keys absent from it default to visible. */
  buttonVisibility: Record<string, boolean> | null;
  disableAll: boolean;
  editMode: boolean;
  isEnabled: (id: number) => boolean;
  onKeyPress: (spec: KeySpec) => void;
  /** midModeState / mediaModeState inputs */
  showVolume: boolean;
  showChannel: boolean;
  showMedia: boolean;
  showDvr: boolean;
}

const groupStyle = (visible: boolean) =>
  visible ? "" : "display: none !important;";

function renderKey(params: KeyGroupsParams, spec: KeySpec): TemplateResult {
  const isX2Only = X2_ONLY_KEY_IDS.has(spec.id);
  const layoutVisible =
    params.buttonVisibility && spec.key in params.buttonVisibility
      ? params.buttonVisibility[spec.key]
      : true;
  const shouldShow = isX2Only ? params.isX2 && layoutVisible : layoutVisible;
  const enabled =
    !params.disableAll && (params.editMode || params.isEnabled(spec.id));

  const model = spec.color
    ? colorKeyModel(spec.color)
    : huiButtonModel({
        label: spec.label,
        icon: spec.icon,
        extraClass: spec.extraClass ?? "",
        size: spec.size ?? "normal",
      });

  return html`
    <sb-key-button
      class="${model.wrapClassName}${enabled ? "" : " disabled"}"
      style=${shouldShow ? "" : "display: none !important;"}
      .buttonConfig=${model.buttonConfig}
      .color=${spec.color ?? null}
      .sizeVar=${spec.color ? null : "--sb-key-font-size"}
      .hass=${params.hass}
      .onTrigger=${() => params.onKeyPress(spec)}
    ></sb-key-button>
  `;
}

export function renderDpad(params: KeyGroupsParams, visible: boolean): TemplateResult {
  return html`<div class="dpad" style=${groupStyle(visible)}>${dpadKeys().map((k) => renderKey(params, k))}</div>`;
}

export function renderNavRow(params: KeyGroupsParams, visible: boolean): TemplateResult {
  return html`<div class="row3" style=${groupStyle(visible)}>${navKeys().map((k) => renderKey(params, k))}</div>`;
}

export function renderMid(params: KeyGroupsParams, visible: boolean): TemplateResult {
  const midState = midModeState({
    showVolume: params.showVolume,
    showChannel: params.showChannel,
    isX2: params.isX2,
  });
  const className = [
    "mid",
    ...Object.entries(midState.classMap)
      .filter(([, on]) => on)
      .map(([name]) => name),
  ].join(" ");
  return html`<div class=${className} style=${groupStyle(visible)}>${midKeys().map((k) => renderKey(params, k))}</div>`;
}

export function renderMedia(params: KeyGroupsParams, visible: boolean): TemplateResult {
  const mediaState = mediaModeState({
    isX2: params.isX2,
    showMedia: params.showMedia,
    showDvr: params.showDvr,
  });
  const className = [
    "media",
    ...Object.entries(mediaState.classMap)
      .filter(([, on]) => on)
      .map(([name]) => name),
  ].join(" ");
  return html`<div class=${className} style=${groupStyle(visible)}>${mediaKeys().map((k) => renderKey(params, k))}</div>`;
}

export function renderColors(params: KeyGroupsParams, visible: boolean): TemplateResult {
  return html`
    <div class="colors" style=${groupStyle(visible)}>
      <div class="colorsGrid">${colorKeys().map((k) => renderKey(params, k))}</div>
    </div>
  `;
}

export function renderAbc(params: KeyGroupsParams, visible: boolean): TemplateResult {
  return html`
    <div class="abc" style=${groupStyle(visible)}>
      <div class="abcGrid">${abcKeys().map((k) => renderKey(params, k))}</div>
    </div>
  `;
}
