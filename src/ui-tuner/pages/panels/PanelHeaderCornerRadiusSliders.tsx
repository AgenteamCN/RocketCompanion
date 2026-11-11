import React from 'react';
import { SliderControl } from '../../../ui-core/primitives/SliderControl';
import { useMenuLayoutStore } from '../../../ui-core/stores/menuLayoutStore';
import { resolvePanelHeaderBackBtnGeometry } from '../../../ui-core/tokens/menuLayoutTokens';

export interface PanelHeaderCornerRadiusSlidersProps {
  isLight: boolean;
  onTemplateTokenChange?: () => void;
}

export const PanelHeaderCornerRadiusSliders: React.FC<PanelHeaderCornerRadiusSlidersProps> = ({
  isLight,
  onTemplateTokenChange,
}) => {
  const {
    panelHeaderPaddingX,
    panelHeaderPaddingY,
    panelHeaderBackBtnWidth,
    panelHeaderBackBtnHeight,
    panelHeaderBackBtnRadiusMode,
    panelHeaderBackBtnRadius,
    panelHeaderBackBtnInnerRadius,
    panelHeaderBackBtnRadiusTL,
    panelHeaderBackBtnRadiusTR,
    panelHeaderBackBtnRadiusBR,
    panelHeaderBackBtnRadiusBL,
    panelOuterRadius,
    setToken,
  } = useMenuLayoutStore();

  const btnGeom = resolvePanelHeaderBackBtnGeometry({
    panelHeaderPaddingX,
    panelHeaderPaddingY,
    panelHeaderBackBtnWidth,
    panelHeaderBackBtnHeight,
    panelHeaderBackBtnRadiusMode,
    panelHeaderBackBtnRadius,
    panelHeaderBackBtnInnerRadius,
    panelHeaderBackBtnRadiusTL,
    panelHeaderBackBtnRadiusTR,
    panelHeaderBackBtnRadiusBR,
    panelHeaderBackBtnRadiusBL,
    panelOuterRadius,
  });

  if (panelHeaderBackBtnRadiusMode === 'per-corner') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <SliderControl
          label="Panel Corner Radius (panelOuterRadius)"
          value={panelOuterRadius}
          min={0}
          max={36}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="amber"
          onChange={(v) => {
            setToken('panelOuterRadius', v);
            onTemplateTokenChange?.();
          }}
          isLight={isLight}
        />
        <SliderControl
          label="Top Left Radius (Radius TL)"
          value={panelHeaderBackBtnRadiusTL}
          min={0}
          max={24}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="amber"
          onChange={(v) => {
            setToken('panelHeaderBackBtnRadiusTL', v);
            onTemplateTokenChange?.();
          }}
          isLight={isLight}
        />
        <SliderControl
          label="Top Right Radius (Radius TR)"
          value={panelHeaderBackBtnRadiusTR}
          min={0}
          max={24}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="sky"
          onChange={(v) => {
            setToken('panelHeaderBackBtnRadiusTR', v);
            onTemplateTokenChange?.();
          }}
          isLight={isLight}
        />
        <SliderControl
          label="Bottom Right Radius (Radius BR)"
          value={panelHeaderBackBtnRadiusBR}
          min={0}
          max={24}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="sky"
          onChange={(v) => {
            setToken('panelHeaderBackBtnRadiusBR', v);
            onTemplateTokenChange?.();
          }}
          isLight={isLight}
        />
        <SliderControl
          label="Bottom Left Radius (Radius BL)"
          value={panelHeaderBackBtnRadiusBL}
          min={0}
          max={24}
          step={1}
          unit="px"
          editable={true}
          allowOutOfBoundsInput={true}
          colorScheme="sky"
          onChange={(v) => {
            setToken('panelHeaderBackBtnRadiusBL', v);
            onTemplateTokenChange?.();
          }}
          isLight={isLight}
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      <SliderControl
        label="Panel Corner Radius (panelOuterRadius)"
        value={panelOuterRadius}
        min={0}
        max={36}
        step={1}
        unit="px"
        editable={true}
        allowOutOfBoundsInput={true}
        colorScheme="amber"
        onChange={(v) => {
          setToken('panelOuterRadius', v);
          onTemplateTokenChange?.();
        }}
        isLight={isLight}
      />
      <SliderControl
        label={
          panelHeaderBackBtnRadiusMode === 'asymmetric-tl'
            ? `Remaining three inner corner radii (TR/BR/BL · Outer Corner=${btnGeom.concentricRadius}px)`
            : 'Inner three small corner radii (backBtnInnerRadius)'
        }
        value={panelHeaderBackBtnInnerRadius}
        min={0}
        max={24}
        step={1}
        unit="px"
        editable={true}
        allowOutOfBoundsInput={true}
        colorScheme="sky"
        onChange={(v) => {
          if (panelHeaderBackBtnRadiusMode !== 'asymmetric-tl') {
            setToken('panelHeaderBackBtnRadiusMode', 'asymmetric-tl');
          }
          setToken('panelHeaderBackBtnInnerRadius', v);
          onTemplateTokenChange?.();
        }}
        isLight={isLight}
      />
      <SliderControl
        label={
          panelHeaderBackBtnRadiusMode === 'custom'
            ? 'Uniform corner radius (backBtnRadius)'
            : `Toggle uniform corner radius (current ${btnGeom.radiusSummary})`
        }
        value={
          panelHeaderBackBtnRadiusMode === 'auto'
            ? btnGeom.concentricRadius
            : panelHeaderBackBtnRadius
        }
        min={0}
        max={24}
        step={1}
        unit="px"
        editable={true}
        allowOutOfBoundsInput={true}
        colorScheme="amber"
        onChange={(v) => {
          setToken('panelHeaderBackBtnRadiusMode', 'custom');
          setToken('panelHeaderBackBtnRadius', v);
          onTemplateTokenChange?.();
        }}
        isLight={isLight}
      />
    </div>
  );
};
