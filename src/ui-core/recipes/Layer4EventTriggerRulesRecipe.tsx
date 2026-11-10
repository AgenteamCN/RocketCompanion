import React, { useState, useEffect } from 'react';
import {
  audioConfig,
  selectAllEventLogs,
  deselectAllEventLogs,
  setEventLogFilterItem,
} from '../config/audioConfig';
import {
  CONSOLE_LOG_EVENT_CATALOG,
  createDefaultLogEventFilter,
} from '../config/audioConstants';
import { PanelContainer, PanelHeader, PanelContent } from '../layout/Panel';
import { PanelFooter } from '../layout/PanelFooter';
import type { EventCatalogEntry } from '../compounds/tuner/EventFilterMatrix';
import type { StandardSurfaceProps, SurfaceMeta } from '../manifest/surfaceMetaTypes';
import { resolveCalibratedSurfaceSizing } from '../manifest/surfaceCalibration';
import { useAppStore } from '../stores/appStore';
import { useMenuLayoutStore } from '../stores/menuLayoutStore';
import { useStoreSnapshotOverride } from '../stores/storeSnapshotScope';
import {
  EventTriggerRulesSection,
  type EventTriggerRule,
} from './dev/EventTriggerRulesSection';
import {
  EventTriggerRuleMatrixSection,
  type Layer4EventTriggerRulesStateOverride,
} from './layer-sections/EventTriggerRuleMatrixSection';

export type { EventTriggerRule } from './dev/EventTriggerRulesSection';
export type { Layer4EventTriggerRulesStateOverride } from './layer-sections/EventTriggerRuleMatrixSection';

export const SURFACE_META: SurfaceMeta = {
  id: 'recipe:Layer4EventTriggerRulesRecipe',
  title: 'Event & Trigger Rules Engine',
  subtitle:
    'Audio debounce shielding, collision impulse thresholds, event filter catalog, and telemetry rules',
  icon: 'filter',
  layer: 'layer4',
  menuGroup: 'menu-layer',
  defaultSizing: {
    mode: 'adaptive',
    width: 580,
    height: 560,
    minHeight: 240,
    maxHeight: 1120,
  },
};

export interface Layer4EventTriggerRulesRecipeProps extends StandardSurfaceProps {
  stateOverride?: Layer4EventTriggerRulesStateOverride;
  className?: string;
}

const DEFAULT_TRIGGER_RULES: EventTriggerRule[] = [
  {
    id: 'rule-speed-gate',
    name: 'Minimum Shot Velocity Gate',
    conditionType: 'ball-speed',
    range: [95, 145],
    unit: ' kph',
    minLimit: 0,
    maxLimit: 180,
    actionType: 'award-goal',
    enabled: true,
  },
  {
    id: 'rule-boost-budget',
    name: 'Boost Consumption Window',
    conditionType: 'boost-below',
    range: [12, 65],
    unit: '%',
    minLimit: 0,
    maxLimit: 100,
    actionType: 'flash-hud',
    enabled: true,
  },
];

const EVENT_CATALOG_ITEMS: EventCatalogEntry[] = CONSOLE_LOG_EVENT_CATALOG.map(
  (item) => ({
    hex: item.hex,
    id: item.id,
    name: item.name,
  })
);

export const Layer4EventTriggerRulesRecipe: React.FC<Layer4EventTriggerRulesRecipeProps> =
  React.memo(({ isLight = true, onBack, stateOverride, className = '' }) => {
    const goBack = useAppStore((s) => s.goBack);
    const scopeOverride =
      useStoreSnapshotOverride<Layer4EventTriggerRulesStateOverride>('eventTriggerRules');
    const ov = { ...scopeOverride, ...stateOverride };

    const [rules, setRules] = useState<EventTriggerRule[]>(
      () => ov.defaultRules ?? DEFAULT_TRIGGER_RULES
    );
    const [internalEnableConsoleLog, setInternalEnableConsoleLog] = useState<boolean>(() =>
      Boolean(audioConfig.get('logAllEvents'))
    );
    const [internalSelectedEvents, setInternalSelectedEvents] = useState<
      Record<string, boolean>
    >(() => ({
      ...(audioConfig.config?.logEventFilter || createDefaultLogEventFilter()),
    }));
    const [hoveredDesc, setHoveredDesc] = useState<string | null>(null);

    const storeSizing = useMenuLayoutStore((s) => s.panels['layer4-event-trigger-rules']);
    const calibratedSizing = resolveCalibratedSurfaceSizing(
      SURFACE_META.id,
      SURFACE_META.defaultSizing
    );
    const sizing = storeSizing ?? {
      mode: calibratedSizing.mode === 'fixed' ? ('fixed' as const) : ('auto' as const),
      width: calibratedSizing.width,
      targetHeight:
        typeof calibratedSizing.height === 'number' ? calibratedSizing.height : 560,
      minHeight: calibratedSizing.minHeight ?? 240,
      maxHeight: calibratedSizing.maxHeight ?? 1120,
    };

    useEffect(() => {
      const handleSync = () => {
        setInternalEnableConsoleLog(Boolean(audioConfig.get('logAllEvents')));
        setInternalSelectedEvents({
          ...(audioConfig.config?.logEventFilter || createDefaultLogEventFilter()),
        });
      };
      const unsub = audioConfig.subscribe(handleSync);
      return () => {
        unsub();
      };
    }, []);

    const eventCatalogItems = ov.eventCatalogItems ?? EVENT_CATALOG_ITEMS;
    const selectedEvents = ov.selectedEvents ?? internalSelectedEvents;

    const updateRule = (id: string, patch: Partial<EventTriggerRule>) => {
      const next = rules.map((r) => (r.id === id ? { ...r, ...patch } : r));
      setRules(next);
      ov.onChange?.(next);
    };

    const handleToggleEventHex = (hex: string) => {
      if (ov.onToggleEventHex) {
        ov.onToggleEventHex(hex);
        return;
      }
      const key = hex.toLowerCase();
      const nextVal = !Boolean(selectedEvents[key]);
      setEventLogFilterItem(key, nextVal);
      setInternalSelectedEvents((prev) => ({ ...prev, [key]: nextVal }));
    };

    const handleSelectAllEvents = () => {
      if (ov.onSelectAllEvents) {
        ov.onSelectAllEvents();
        return;
      }
      selectAllEventLogs();
      const next: Record<string, boolean> = {};
      eventCatalogItems.forEach((i) => {
        next[i.hex.toLowerCase()] = true;
      });
      setInternalEnableConsoleLog(true);
      setInternalSelectedEvents(next);
    };

    const handleDeselectAllEvents = () => {
      if (ov.onDeselectAllEvents) {
        ov.onDeselectAllEvents();
        return;
      }
      deselectAllEventLogs();
      setInternalEnableConsoleLog(false);
      setInternalSelectedEvents({});
    };

    return (
      <PanelContainer
        isLight={isLight}
        sizing={sizing}
        className={`w-full select-none ${className}`}
      >
        <PanelHeader
          isLight={isLight}
          title="EVENT & TRIGGER RULES ENGINE"
          onBack={onBack ?? goBack}
        />

        <PanelContent scrollable={true} className="flex flex-col gap-3">
          <EventTriggerRuleMatrixSection
            ov={ov}
            internalConsoleLog={internalEnableConsoleLog}
            setInternalConsoleLog={setInternalEnableConsoleLog}
            isLight={isLight}
          />

          <EventTriggerRulesSection
            isLight={isLight}
            eventCatalogItems={eventCatalogItems}
            selectedEvents={selectedEvents}
            onToggleEventHex={handleToggleEventHex}
            onSelectAllEvents={handleSelectAllEvents}
            onDeselectAllEvents={handleDeselectAllEvents}
            rules={rules}
            onUpdateRule={updateRule}
            onHoverDesc={setHoveredDesc}
          />
        </PanelContent>

        <PanelFooter
          isLight={isLight}
          defaultDescription="Configure audio debounce shielding, collision impulse thresholds, event filter catalog, and telemetry rules."
          hoveredDescription={hoveredDesc}
        />
      </PanelContainer>
    );
  });

Layer4EventTriggerRulesRecipe.displayName = 'Layer4EventTriggerRulesRecipe';
export default Layer4EventTriggerRulesRecipe;
