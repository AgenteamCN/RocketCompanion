import React, { useState, useEffect } from 'react';
import {
  Timer,
  Waves,
  Zap,
  Feather,
  Activity,
  Flame,
  ShieldAlert,
  Car,
  Terminal,
  Filter,
} from 'lucide-react';
import { audioConfig } from '../../config/audioConfig';
import { SettingSliderRow } from '../../compounds/SettingSliderRow';
import { SettingToggleRow } from '../../compounds/SettingToggleRow';
import type { EventCatalogEntry } from '../../compounds/tuner/EventFilterMatrix';
import { useSettingActionRowStore } from '../../stores/settingRowStore';
import type { EventTriggerRule } from '../dev/EventTriggerRulesSection';

export interface Layer4EventTriggerRulesStateOverride {
  hitCooldownMs?: number;
  onHitCooldownMsChange?: (val: number) => void;
  scrapeCooldownMs?: number;
  onScrapeCooldownMsChange?: (val: number) => void;
  supersonicHoldMs?: number;
  onSupersonicHoldMsChange?: (val: number) => void;
  lightTouchImpulse?: number;
  onLightTouchImpulseChange?: (val: number) => void;
  mediumHitImpulse?: number;
  onMediumHitImpulseChange?: (val: number) => void;
  heavyBoomImpulse?: number;
  onHeavyBoomImpulseChange?: (val: number) => void;
  rimClankGate?: number;
  onRimClankGateChange?: (val: number) => void;
  carBumpGate?: number;
  onCarBumpGateChange?: (val: number) => void;
  enableConsoleLog?: boolean;
  onEnableConsoleLogChange?: (val: boolean) => void;
  logHitStructsOnly?: boolean;
  onLogHitStructsOnlyChange?: (val: boolean) => void;
  selectedEvents?: Record<string, boolean>;
  onToggleEventHex?: (hex: string) => void;
  onSelectAllEvents?: () => void;
  onDeselectAllEvents?: () => void;
  defaultRules?: EventTriggerRule[];
  onChange?: (rules: EventTriggerRule[]) => void;
  eventCatalogItems?: EventCatalogEntry[];
}

export interface EventTriggerRuleMatrixSectionProps {
  ov: Layer4EventTriggerRulesStateOverride;
  internalConsoleLog: boolean;
  setInternalConsoleLog: (val: boolean) => void;
  isLight: boolean;
}

export const EventTriggerRuleMatrixSection: React.FC<
  EventTriggerRuleMatrixSectionProps
> = ({ ov, internalConsoleLog, setInternalConsoleLog, isLight }) => {
  const { rowGap } = useSettingActionRowStore();

  const [internalHitCooldownMs, setInternalHitCooldownMs] = useState<number>(() =>
    Number(audioConfig.get('carBallHitCooldownMs') ?? 40)
  );
  const [internalScrapeCooldownMs, setInternalScrapeCooldownMs] = useState<number>(() =>
    Number(audioConfig.get('goalpostHitCooldownMs') ?? 60)
  );
  const [internalSupersonicHoldMs, setInternalSupersonicHoldMs] = useState<number>(() =>
    Number(audioConfig.get('incidentCooldownMs') ?? 40)
  );
  const [internalLightTouchImpulse, setInternalLightTouchImpulse] = useState<number>(() =>
    Number(audioConfig.get('carBallHitImpulseThreshold') ?? 120)
  );
  const [internalMediumHitImpulse, setInternalMediumHitImpulse] = useState<number>(() =>
    Number(audioConfig.get('ballGroundHitThreshold') ?? 140)
  );
  const [internalHeavyBoomImpulse, setInternalHeavyBoomImpulse] = useState<number>(() =>
    Number(audioConfig.get('ballWallHitThreshold') ?? 160)
  );
  const [internalRimClankGate, setInternalRimClankGate] = useState<number>(() =>
    Number(audioConfig.get('goalpostHitThreshold') ?? 120)
  );
  const [internalCarBumpGate, setInternalCarBumpGate] = useState<number>(() =>
    Number(audioConfig.get('netDualTriggerAngleDeg') ?? 60)
  );
  const [internalLogHitStructsOnly, setInternalLogHitStructsOnly] = useState<boolean>(() =>
    Boolean(audioConfig.get('logCarBallHitEvents'))
  );

  useEffect(() => {
    const handleSync = () => {
      setInternalHitCooldownMs(Number(audioConfig.get('carBallHitCooldownMs') ?? 40));
      setInternalScrapeCooldownMs(Number(audioConfig.get('goalpostHitCooldownMs') ?? 60));
      setInternalSupersonicHoldMs(Number(audioConfig.get('incidentCooldownMs') ?? 40));
      setInternalLightTouchImpulse(
        Number(audioConfig.get('carBallHitImpulseThreshold') ?? 120)
      );
      setInternalMediumHitImpulse(Number(audioConfig.get('ballGroundHitThreshold') ?? 140));
      setInternalHeavyBoomImpulse(Number(audioConfig.get('ballWallHitThreshold') ?? 160));
      setInternalRimClankGate(Number(audioConfig.get('goalpostHitThreshold') ?? 120));
      setInternalCarBumpGate(Number(audioConfig.get('netDualTriggerAngleDeg') ?? 60));
      setInternalConsoleLog(Boolean(audioConfig.get('logAllEvents')));
      setInternalLogHitStructsOnly(Boolean(audioConfig.get('logCarBallHitEvents')));
    };
    const unsub = audioConfig.subscribe(handleSync);
    return () => {
      unsub();
    };
  }, [setInternalConsoleLog]);

  const hitCooldownMs = ov.hitCooldownMs ?? internalHitCooldownMs;
  const scrapeCooldownMs = ov.scrapeCooldownMs ?? internalScrapeCooldownMs;
  const supersonicHoldMs = ov.supersonicHoldMs ?? internalSupersonicHoldMs;
  const lightTouchImpulse = ov.lightTouchImpulse ?? internalLightTouchImpulse;
  const mediumHitImpulse = ov.mediumHitImpulse ?? internalMediumHitImpulse;
  const heavyBoomImpulse = ov.heavyBoomImpulse ?? internalHeavyBoomImpulse;
  const rimClankGate = ov.rimClankGate ?? internalRimClankGate;
  const carBumpGate = ov.carBumpGate ?? internalCarBumpGate;
  const enableConsoleLog = ov.enableConsoleLog ?? internalConsoleLog;
  const logHitStructsOnly = ov.logHitStructsOnly ?? internalLogHitStructsOnly;

  return (
    <div className="flex flex-col" style={{ gap: `${rowGap}px` }}>
      <SettingSliderRow
        icon={Timer}
        iconColor="text-amber-400"
        title="Car-Ball Hit Cooldown"
        min={0}
        max={250}
        step={5}
        value={hitCooldownMs}
        onChange={(val) => {
          setInternalHitCooldownMs(val);
          if (ov.onHitCooldownMsChange) ov.onHitCooldownMsChange(val);
          else audioConfig.set('carBallHitCooldownMs', val);
        }}
        unit=" ms"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={Waves}
        iconColor="text-sky-400"
        title="Surface Scrape Cooldown"
        min={0}
        max={500}
        step={5}
        value={scrapeCooldownMs}
        onChange={(val) => {
          setInternalScrapeCooldownMs(val);
          if (ov.onScrapeCooldownMsChange) ov.onScrapeCooldownMsChange(val);
          else audioConfig.set('goalpostHitCooldownMs', val);
        }}
        unit=" ms"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={Zap}
        iconColor="text-purple-400"
        title="Supersonic Transition Hold"
        min={0}
        max={600}
        step={10}
        value={supersonicHoldMs}
        onChange={(val) => {
          setInternalSupersonicHoldMs(val);
          if (ov.onSupersonicHoldMsChange) ov.onSupersonicHoldMsChange(val);
          else audioConfig.set('incidentCooldownMs', val);
        }}
        unit=" ms"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={Feather}
        iconColor="text-emerald-400"
        title="Light Touch Min Impulse"
        min={0}
        max={1000}
        step={10}
        value={lightTouchImpulse}
        onChange={(val) => {
          setInternalLightTouchImpulse(val);
          if (ov.onLightTouchImpulseChange) ov.onLightTouchImpulseChange(val);
          else audioConfig.set('carBallHitImpulseThreshold', val);
        }}
        unit=" UU/s"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={Activity}
        iconColor="text-cyan-400"
        title="Medium Hit Impulse"
        min={0}
        max={1200}
        step={25}
        value={mediumHitImpulse}
        onChange={(val) => {
          setInternalMediumHitImpulse(val);
          if (ov.onMediumHitImpulseChange) ov.onMediumHitImpulseChange(val);
          else audioConfig.set('ballGroundHitThreshold', val);
        }}
        unit=" UU/s"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={Flame}
        iconColor="text-rose-400"
        title="Heavy Boom Impulse"
        min={0}
        max={2500}
        step={50}
        value={heavyBoomImpulse}
        onChange={(val) => {
          setInternalHeavyBoomImpulse(val);
          if (ov.onHeavyBoomImpulseChange) ov.onHeavyBoomImpulseChange(val);
          else audioConfig.set('ballWallHitThreshold', val);
        }}
        unit=" UU/s"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={ShieldAlert}
        iconColor="text-orange-400"
        title="Rim / Post Clank Gate"
        min={0}
        max={1200}
        step={20}
        value={rimClankGate}
        onChange={(val) => {
          setInternalRimClankGate(val);
          if (ov.onRimClankGateChange) ov.onRimClankGateChange(val);
          else audioConfig.set('goalpostHitThreshold', val);
        }}
        unit=" UU/s"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingSliderRow
        icon={Car}
        iconColor="text-indigo-400"
        title="Car-Car Bump Gate"
        min={0}
        max={1500}
        step={5}
        value={carBumpGate}
        onChange={(val) => {
          setInternalCarBumpGate(val);
          if (ov.onCarBumpGateChange) ov.onCarBumpGateChange(val);
          else audioConfig.set('netDualTriggerAngleDeg', val);
        }}
        unit=" UU/s"
        layout="inline"
        developerMode={true}
        editable={true}
        isLight={isLight}
      />
      <SettingToggleRow
        icon={Terminal}
        iconColor="text-emerald-400"
        title="Enable Event Console Log"
        checked={enableConsoleLog}
        onCheckedChange={(val) => {
          setInternalConsoleLog(val);
          if (ov.onEnableConsoleLogChange) ov.onEnableConsoleLogChange(val);
          else audioConfig.set('logAllEvents', val);
        }}
        isLight={isLight}
      />
      <SettingToggleRow
        icon={Filter}
        iconColor="text-sky-400"
        title="Log Car-Ball Hit Structs Only"
        checked={logHitStructsOnly}
        onCheckedChange={(val) => {
          setInternalLogHitStructsOnly(val);
          if (ov.onLogHitStructsOnlyChange) ov.onLogHitStructsOnlyChange(val);
          else audioConfig.set('logCarBallHitEvents', val);
        }}
        isLight={isLight}
      />
    </div>
  );
};
