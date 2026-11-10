import React from 'react';
import { type DriftwoodsGroundConfig } from '../../../config/driftwoodsConfig';
import {
  TunerRow,
  TunerSegmentedControl,
  TunerToggleRow,
} from '../../../compounds/TunerControls';

export interface DriftwoodsGroundSurfaceSectionProps {
  ground: DriftwoodsGroundConfig;
  onChange: (patch: Partial<DriftwoodsGroundConfig>) => void;
  isLight: boolean;
}

export const DriftwoodsGroundSurfaceSection: React.FC<DriftwoodsGroundSurfaceSectionProps> = ({
  ground,
  onChange,
  isLight,
}) => (
  <>
      {/* 3. PBR Surface & Texture Filtering */}
      <div className="flex flex-col gap-1.5 pt-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-500 px-1">
          Surface Material &amp; Hardware Mipmap + Anisotropic Filtering (Ground Only)
        </span>

        <div className="grid grid-cols-2 gap-1.5">
          <TunerRow
            label="Roughness"
            value={ground.roughness}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.01}
            onChange={(val) => onChange({ roughness: val })}
            isLight={isLight}
          />

          <TunerRow
            label="Metalness"
            value={ground.metalness}
            sliderMin={0.0}
            sliderMax={1.0}
            sliderStep={0.01}
            onChange={(val) => onChange({ metalness: val })}
            isLight={isLight}
          />
        </div>

        <TunerSegmentedControl<'linear' | 'nearest'>
          label="Mag Filter (Magnification Algorithm)"
          description="Linear = Bilinear + Trilinear Mipmap. Nearest = Point magnification + Mipmap."
          value={ground.magFilter || 'linear'}
          options={[
            { value: 'linear', label: 'Linear + Mipmap (Smooth)' },
            { value: 'nearest', label: 'Nearest + Mipmap (Sharp)' },
          ]}
          onChange={(val) => onChange({ magFilter: val })}
          isLight={isLight}
        />

        <TunerRow
          label="Anisotropy Level (Ground Only)"
          description="Hardware Anisotropic Filtering on baked RGBA ground mipmaps eliminates grazing-angle shimmer"
          value={ground.anisotropy ?? 4}
          sliderMin={1}
          sliderMax={16}
          sliderStep={1}
          stepOverride={1}
          unit="x"
          onChange={(val) => onChange({ anisotropy: Math.round(val) })}
          isLight={isLight}
        />
      </div>

      {/* 4. Layer Toggles */}
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        <TunerToggleRow
          label="Ground Visible"
          checked={ground.visible}
          onChange={(checked) => onChange({ visible: checked })}
          isLight={isLight}
        />

        <TunerToggleRow
          label="Wireframe Mode"
          checked={ground.wireframe}
          onChange={(checked) => onChange({ wireframe: checked })}
          isLight={isLight}
        />
      </div>
  </>
);
