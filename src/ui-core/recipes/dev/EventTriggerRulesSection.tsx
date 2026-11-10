import React from 'react';
import { Card } from '../../layout/Card';
import { ToggleSwitch } from '../../primitives/ToggleSwitch';
import { DropdownMenu } from '../../compounds/DropdownMenu';
import { DualGrabberSlider } from '../../primitives/DualGrabberSlider';
import {
  EventFilterMatrix,
  type EventCatalogEntry,
} from '../../compounds/tuner/EventFilterMatrix';

export interface EventTriggerRule {
  id: string;
  name: string;
  enabled: boolean;
  conditionType: 'ball-speed' | 'boost-below' | 'car-air-time' | 'touch-count';
  actionType: 'award-goal' | 'reset-shot' | 'slow-motion' | 'flash-hud';
  range: [number, number];
  minLimit: number;
  maxLimit: number;
  unit: string;
}

export interface EventTriggerRulesSectionProps {
  isLight?: boolean;
  eventCatalogItems: EventCatalogEntry[];
  selectedEvents: Record<string, boolean>;
  onToggleEventHex: (hex: string) => void;
  onSelectAllEvents: () => void;
  onDeselectAllEvents: () => void;
  rules: EventTriggerRule[];
  onUpdateRule: (id: string, patch: Partial<EventTriggerRule>) => void;
  onHoverDesc?: (desc: string | null) => void;
}

export const EventTriggerRulesSection: React.FC<EventTriggerRulesSectionProps> = ({
  isLight = false,
  eventCatalogItems,
  selectedEvents,
  onToggleEventHex,
  onSelectAllEvents,
  onDeselectAllEvents,
  rules,
  onUpdateRule,
  onHoverDesc,
}) => {
  return (
    <>
      <Card isLight={isLight} variant="outlined" className="p-3.5 flex flex-col gap-2">
        <EventFilterMatrix
          items={eventCatalogItems}
          selectedMap={selectedEvents}
          onToggleItem={onToggleEventHex}
          onSelectAll={onSelectAllEvents}
          onDeselectAll={onDeselectAllEvents}
          isLight={isLight}
        />
      </Card>

      {rules.map((rule) => (
        <Card
          key={rule.id}
          isLight={isLight}
          variant="outlined"
          onMouseEnter={() =>
            onHoverDesc?.(
              `${rule.name}: Evaluated every physics tick (120Hz) — [${rule.range[0]}${rule.unit} .. ${rule.range[1]}${rule.unit}].`
            )
          }
          onMouseLeave={() => onHoverDesc?.(null)}
          className="p-3.5 flex flex-col gap-3"
        >
          <div className="flex items-center justify-between gap-4">
            <h3 className="text-xs font-bold uppercase tracking-wider">
              {rule.name}
            </h3>
            <ToggleSwitch
              label="Enabled"
              checked={rule.enabled}
              onCheckedChange={(enabled) => onUpdateRule(rule.id, { enabled })}
              isLight={isLight}
            />
          </div>

          <div
            className={`grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t ${
              isLight ? 'border-neutral-200' : 'border-neutral-800'
            }`}
          >
            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Telemetry Condition
              </span>
              <DropdownMenu
                isLight={isLight}
                options={[
                  { label: 'Ball Speed On Goal (kph)', value: 'ball-speed' },
                  { label: 'Remaining Boost Tank (%)', value: 'boost-below' },
                  { label: 'Continuous Car Air Time (s)', value: 'car-air-time' },
                  { label: 'Aerial Ball Touches', value: 'touch-count' },
                ]}
                value={rule.conditionType}
                onChange={(v) =>
                  onUpdateRule(rule.id, {
                    conditionType: v as EventTriggerRule['conditionType'],
                  })
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                Triggered Action
              </span>
              <DropdownMenu
                isLight={isLight}
                options={[
                  { label: 'Award Valid Goal', value: 'award-goal' },
                  { label: 'Reset Shot Immediately', value: 'reset-shot' },
                  { label: 'Engage 25% Slow Motion', value: 'slow-motion' },
                  { label: 'Flash HUD Telemetry Alert', value: 'flash-hud' },
                ]}
                value={rule.actionType}
                onChange={(v) =>
                  onUpdateRule(rule.id, {
                    actionType: v as EventTriggerRule['actionType'],
                  })
                }
              />
            </div>
          </div>

          <DualGrabberSlider
            label="Acceptance Threshold Band"
            min={rule.minLimit}
            max={rule.maxLimit}
            step={1}
            value={rule.range}
            onChange={(range) => onUpdateRule(rule.id, { range })}
            unit={rule.unit}
            isLight={isLight}
          />
        </Card>
      ))}
    </>
  );
};
