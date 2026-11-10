import { create } from 'zustand';
import { syncBridge as crossClientSync } from './syncBridge';
import {
  STORAGE_KEYS,
  readStorageJson,
  writeStorageJson,
  safeStorage,
} from '../config/storageHelpers';

export type TrajectoryRowLayout = 'inline' | 'stacked';
export type SliderRowLayout = 'inline' | 'stacked';
export type SegmentedRowLayout = 'inline' | 'stacked';
export type PacingPriorityControlType = 'dropdown' | 'segmented-inline' | 'segmented-stacked';
export type PresetCustomVariation = 'slide-reveal' | 'morph-pill' | 'popover-scrub' | 'below-row';
export type DevStatusAccentColor = 'emerald' | 'amber';
export type TelemetryNestedVariation =
  | 'underline-disclosure'
  | 'apple-grouped-inset'
  | 'flush-aligned'
  | 'tree-guide';
export type FloatingOpacityOrder = 'last' | 'first-when-inactive' | 'first';

export interface SettingActionRowTokens {
  /** Whether to render the outer border and card surface background (default: false for Apple-style list row) */
  bordered: boolean;
  /** Whether to render the subtitle/description line below the title (default: false — descriptions show in footer on hover) */
  showDescription: boolean;
  /** Row horizontal padding (left & right in px, default: 10px — wraps icon & right control inside hover box) */
  paddingX: number;
  /** Row vertical padding (top & bottom in px, default: 6px — all row spacing comes from the row itself) */
  paddingY: number;
  /** Extra vertical gap between adjacent rows (in px, default: 0px so there is no dead zone between rows on hover) */
  rowGap: number;
  /** Outer row & hover highlight border radius (in px, default: 8px Apple-style subtle squircle) */
  borderRadius: number;
  /** Leading SVG icon width & height (in px, default: 22px) */
  iconSize: number;
  /** Horizontal gap between leading SVG icon and title column (in px, default: 14px) */
  iconGap: number;
  /** Primary title font size shared across all setting row types (in px, default: 14px) */
  titleFontSize: number;
  /** Secondary description font size when showDescription is true (in px, default: 11px) */
  descriptionFontSize: number;
  /** Right action button font size (in px, default: 12px) */
  buttonFontSize: number;
  /** Right action button horizontal padding (in px, default: 10px) */
  buttonPaddingX: number;
  /** Right action button vertical padding (in px, default: 5px) */
  buttonPaddingY: number;
  /** Right action button border radius (in px, default: 6px — concentric with outer 8px row radius) */
  buttonRadius: number;
  /** Whether the right action button displays the trailing ArrowRight icon (default: true) */
  showButtonArrow: boolean;
  /**
   * Optional global default SVG icon color override.
   * Empty string (`''`) uses the standard neutral gray (`text-neutral-500` in light / `text-neutral-400` in dark).
   * Individual rows can also pass their own `iconColor` prop (Tailwind `text-*` class or CSS color string) when needed.
   */
  defaultIconColor: string;

  // ── Decoupled Composite Toggle + Configure (e.g. Ball Trajectory Predictor) ──
  /** Layout for composite Toggle + Configure rows: 'inline' (same single row) or 'stacked' (2-row card) */
  trajectoryRowLayout: TrajectoryRowLayout;

  // ── Decoupled SettingSliderRow Tokens ──
  /** Layout for SettingSliderRow: 'inline' (Title + Track + Value on one row) or 'stacked' (Title/Value above Track) */
  sliderLayout: SliderRowLayout;
  /** Width of the slider track in 'inline' mode (in px, default: 200px) */
  sliderTrackWidth: number;
  /** Whether to show - / + stepper buttons in SettingSliderRow (default: false in compact settings rows) */
  sliderShowStepper: boolean;
  /** Whether numeric text input is enabled in User Mode (default: false — read-only value badge, drag slider only) */
  sliderEditableInUserMode: boolean;
  /** Whether numeric text input is enabled in Developer Mode (default: false — developer overrides live in Developer Menu) */
  sliderEditableInDevMode: boolean;
  /** Font size of the slider value readout / input badge (in px, default: 12px) */
  sliderValueFontSize: number;

  // ── Decoupled SettingSegmentedRow & Advanced Row Tokens ──
  /** Default layout for SettingSegmentedRow: 'inline' (Title left, SegmentedSwitch right) or 'stacked' (Title top, SegmentedSwitch bottom) */
  segmentedLayout: SegmentedRowLayout;
  /** Control mode for Experience Priority / Pacing Priority: 'dropdown' | 'segmented-inline' | 'segmented-stacked' */
  pacingPriorityControl: PacingPriorityControlType;
  /** Whether to render status badges next to row titles in AdvancedTab (default: false for cleaner alignment) */
  advancedShowBadges: boolean;
  /** Whether AdvancedTab rows render permanent card borders (default: false to align switches & buttons with borderless rows) */
  advancedBordered: boolean;

  // ── Decoupled SettingPresetCustomRow (UI Scaling & Render Scale Shared Component) ──
  /** Visual & motion variation when Custom is selected on UI Scaling / Render Scale */
  presetCustomVariation: PresetCustomVariation;
  /** Width of the inline custom slider revealed when Custom is selected (in px, default: 220px) */
  presetCustomSliderWidth: number;
  /** Spring / transition duration for theSegmented + Slider reveal (in ms, default: 260ms) */
  presetCustomAnimDuration: number;

  // ── Decoupled SettingDeveloperStatusRow (Developer Settings Badge Row) ──
  /** Accent color for Developer Settings icon & 'Active' badge when developerMode is enabled ('emerald' | 'amber') */
  devStatusAccentColor: DevStatusAccentColor;
  /** Whether clicking the Developer Settings badge row toggles developer mode in sandbox preview */
  devStatusInteractiveToggle: boolean;

  // ── Decoupled TelemetryConfigCard (Show Telemetry Summary Variations) ──
  /** Nesting & disclosure variation for Show Telemetry Summary ('underline-disclosure' | 'apple-grouped-inset' | 'flush-aligned' | 'tree-guide') */
  telemetryVariation: TelemetryNestedVariation;
  /** Position of the underlined 'Show v' trigger relative to the ToggleSwitch ('left' | 'right') */
  telemetryTriggerPosition: 'left' | 'right';
  /** Whether the 5 telemetry sub-metrics are collapsed by default ('underline-disclosure' & 'apple-grouped-inset') */
  telemetryDefaultCollapsed: boolean;

  // ── Decoupled Advanced Ordering & Developer Spacing ──
  /** Ordering rule for Floating Window Opacity in Advanced ('last' = always last row) */
  floatingOpacityOrder: FloatingOpacityOrder;
  /** Extra top spacing (in px, default: 8px) above the bordered Under Development row in DeveloperTab so the hover highlight of Observe Safe Area Boundary does not collide with its outer border */
  underDevelopmentTopMargin: number;
}

export const DEFAULT_SETTING_ACTION_ROW_TOKENS: SettingActionRowTokens = {
  bordered: false,
  showDescription: false,
  paddingX: 10,
  paddingY: 6,
  rowGap: 0,
  borderRadius: 8,
  iconSize: 22,
  iconGap: 14,
  titleFontSize: 14,
  descriptionFontSize: 11,
  buttonFontSize: 12,
  buttonPaddingX: 10,
  buttonPaddingY: 5,
  buttonRadius: 6,
  showButtonArrow: true,
  defaultIconColor: '',
  trajectoryRowLayout: 'inline',
  sliderLayout: 'inline',
  sliderTrackWidth: 200,
  sliderShowStepper: false,
  sliderEditableInUserMode: false,
  sliderEditableInDevMode: false,
  sliderValueFontSize: 12,
  segmentedLayout: 'inline',
  pacingPriorityControl: 'segmented-inline',
  advancedBordered: false,
  advancedShowBadges: false,
  presetCustomVariation: 'slide-reveal',
  presetCustomSliderWidth: 220,
  presetCustomAnimDuration: 260,
  devStatusAccentColor: 'amber',
  devStatusInteractiveToggle: false,
  telemetryVariation: 'underline-disclosure',
  telemetryTriggerPosition: 'left',
  telemetryDefaultCollapsed: true,
  floatingOpacityOrder: 'last',
  underDevelopmentTopMargin: 8,
};

const STORAGE_KEY = STORAGE_KEYS.SETTING_ACTION_ROW_TOKENS;
const SYNC_KEY = 'store:settingActionRow:v7';

const normalizeTokens = (raw?: Partial<SettingActionRowTokens>): SettingActionRowTokens => ({
  ...DEFAULT_SETTING_ACTION_ROW_TOKENS,
  ...(raw && typeof raw === 'object' ? raw : {}),
  devStatusInteractiveToggle: false,
});

const loadSavedTokens = (): SettingActionRowTokens =>
  normalizeTokens(
    readStorageJson<Partial<SettingActionRowTokens>>(STORAGE_KEY, DEFAULT_SETTING_ACTION_ROW_TOKENS)
  );

const saveTokens = (tokens: SettingActionRowTokens) => {
  if (!crossClientSync.isApplyingRemote()) {
    crossClientSync.set(SYNC_KEY, tokens);
  }
  writeStorageJson(STORAGE_KEY, tokens);
};

export interface SettingActionRowStore extends SettingActionRowTokens {
  setToken: <K extends keyof SettingActionRowTokens>(
    key: K,
    value: SettingActionRowTokens[K]
  ) => void;
  updateTokens: (patch: Partial<SettingActionRowTokens>) => void;
  resetTokens: () => void;
  exportConfigCode: () => string;
}

const extractSnapshot = (s: SettingActionRowTokens): SettingActionRowTokens => ({
  bordered: s.bordered,
  showDescription: s.showDescription,
  paddingX: s.paddingX,
  paddingY: s.paddingY,
  rowGap: s.rowGap,
  borderRadius: s.borderRadius,
  iconSize: s.iconSize,
  iconGap: s.iconGap,
  titleFontSize: s.titleFontSize,
  descriptionFontSize: s.descriptionFontSize,
  buttonFontSize: s.buttonFontSize,
  buttonPaddingX: s.buttonPaddingX,
  buttonPaddingY: s.buttonPaddingY,
  buttonRadius: s.buttonRadius,
  showButtonArrow: s.showButtonArrow,
  defaultIconColor: s.defaultIconColor,
  trajectoryRowLayout: s.trajectoryRowLayout,
  sliderLayout: s.sliderLayout,
  sliderTrackWidth: s.sliderTrackWidth,
  sliderShowStepper: s.sliderShowStepper,
  sliderEditableInUserMode: s.sliderEditableInUserMode,
  sliderEditableInDevMode: s.sliderEditableInDevMode,
  sliderValueFontSize: s.sliderValueFontSize,
  segmentedLayout: s.segmentedLayout,
  pacingPriorityControl: s.pacingPriorityControl,
  advancedBordered: s.advancedBordered,
  advancedShowBadges: s.advancedShowBadges,
  presetCustomVariation: s.presetCustomVariation,
  presetCustomSliderWidth: s.presetCustomSliderWidth,
  presetCustomAnimDuration: s.presetCustomAnimDuration,
  devStatusAccentColor: s.devStatusAccentColor,
  devStatusInteractiveToggle: s.devStatusInteractiveToggle,
  telemetryVariation: s.telemetryVariation,
  telemetryTriggerPosition: s.telemetryTriggerPosition,
  telemetryDefaultCollapsed: s.telemetryDefaultCollapsed,
  floatingOpacityOrder: s.floatingOpacityOrder,
  underDevelopmentTopMargin: s.underDevelopmentTopMargin,
});

const initialTokens = normalizeTokens(
  crossClientSync.get<SettingActionRowTokens>(SYNC_KEY, loadSavedTokens())
);

export const useSettingActionRowStore = create<SettingActionRowStore>((set, get) => ({
  ...initialTokens,

  setToken: (key, value) => {
    set((state) => {
      const next = normalizeTokens({
        ...extractSnapshot(state),
        [key]: value,
      });
      saveTokens(next);
      return next;
    });
  },

  updateTokens: (patch) => {
    set((state) => {
      const next = normalizeTokens({
        ...extractSnapshot(state),
        ...patch,
      });
      saveTokens(next);
      return next;
    });
  },

  resetTokens: () => {
    const fresh = { ...DEFAULT_SETTING_ACTION_ROW_TOKENS };
    saveTokens(fresh);
    set(() => fresh);
  },

  exportConfigCode: () => {
    const snapshot = extractSnapshot(get());
    return `export const DEFAULT_SETTING_ACTION_ROW_TOKENS: SettingActionRowTokens = ${JSON.stringify(
      snapshot,
      null,
      2
    )};`;
  },
}));

crossClientSync.registerDefault(SYNC_KEY, { ...DEFAULT_SETTING_ACTION_ROW_TOKENS });

crossClientSync.onReset((scopePrefix) => {
  if (scopePrefix && !SYNC_KEY.startsWith(scopePrefix)) return;
  const fresh = { ...DEFAULT_SETTING_ACTION_ROW_TOKENS };
  safeStorage.remove(STORAGE_KEY);
  useSettingActionRowStore.setState(fresh);
});

crossClientSync.subscribeKey<SettingActionRowTokens>(SYNC_KEY, (remote) => {
  if (!remote || typeof remote !== 'object') return;
  const merged = normalizeTokens(remote);
  writeStorageJson(STORAGE_KEY, merged);
  useSettingActionRowStore.setState(merged);
});

