//! 3D volumetric trajectory tube extrusion (parallel-transport frame propagation
//! and rounded/chamfered capsule end-caps) for `rc_trajectory_mesh`.

use rc_physics_sim::layout::BallPredSlicePod;

use crate::{
    bounce_and_anchors::{
        build_ground_drop_line_segments, build_trajectory_dash_ranges, detect_trajectory_bounces,
        ensure_radial_trig_table, FLAG_SHOW_GROUND_PROJECTION,
    },
    layout::{
        TrajectoryMeshConfigPod, TrajectoryMeshHeaderPod, MAX_DASH_RANGES, MAX_PREDICTION_SLICES,
        MAX_RADIAL_SEGMENTS, MAX_TUBE_INDICES, MAX_TUBE_VERTICES,
    },
    state::{DashRangePod, TrajectoryMeshInstance},
};

const LIVE_BALL_SNAP_MAX_DIST_SQ: f32 = 120.0 * 120.0;

#[derive(Clone, Copy)]
struct CapRingStep {
    axial_offset_scale: f32,
    radius_scale: f32,
    normal_radial: f32,
    normal_axial: f32,
    tip_alpha: f32,
}

const ROUND_START_CAP_STEPS: [CapRingStep; 3] = [
    CapRingStep {
        axial_offset_scale: -0.92,
        radius_scale: 0.22,
        normal_radial: 0.22,
        normal_axial: -0.975,
        tip_alpha: 0.95,
    },
    CapRingStep {
        axial_offset_scale: -0.71,
        radius_scale: 0.71,
        normal_radial: 0.71,
        normal_axial: -0.71,
        tip_alpha: 1.0,
    },
    CapRingStep {
        axial_offset_scale: -0.38,
        radius_scale: 0.92,
        normal_radial: 0.92,
        normal_axial: -0.38,
        tip_alpha: 1.0,
    },
];

const ROUND_END_CAP_STEPS: [CapRingStep; 3] = [
    CapRingStep {
        axial_offset_scale: 0.38,
        radius_scale: 0.92,
        normal_radial: 0.92,
        normal_axial: 0.38,
        tip_alpha: 1.0,
    },
    CapRingStep {
        axial_offset_scale: 0.71,
        radius_scale: 0.71,
        normal_radial: 0.71,
        normal_axial: 0.71,
        tip_alpha: 1.0,
    },
    CapRingStep {
        axial_offset_scale: 0.92,
        radius_scale: 0.22,
        normal_radial: 0.22,
        normal_axial: 0.975,
        tip_alpha: 0.95,
    },
];

const CHAMFER_START_CAP_STEPS: [CapRingStep; 2] = [
    CapRingStep {
        axial_offset_scale: -0.38,
        radius_scale: 0.12,
        normal_radial: 0.24,
        normal_axial: -0.97,
        tip_alpha: 0.95,
    },
    CapRingStep {
        axial_offset_scale: -0.32,
        radius_scale: 0.68,
        normal_radial: 0.707,
        normal_axial: -0.707,
        tip_alpha: 1.0,
    },
];

const CHAMFER_END_CAP_STEPS: [CapRingStep; 2] = [
    CapRingStep {
        axial_offset_scale: 0.32,
        radius_scale: 0.68,
        normal_radial: 0.707,
        normal_axial: 0.707,
        tip_alpha: 1.0,
    },
    CapRingStep {
        axial_offset_scale: 0.38,
        radius_scale: 0.12,
        normal_radial: 0.24,
        normal_axial: 0.97,
        tip_alpha: 0.95,
    },
];

const CYLINDER_RING_STEP: CapRingStep = CapRingStep {
    axial_offset_scale: 0.0,
    radius_scale: 1.0,
    normal_radial: 1.0,
    normal_axial: 0.0,
    tip_alpha: 1.0,
};

struct TubeRingEmitCtx<'a> {
    positions: &'a mut [f32; MAX_TUBE_VERTICES * 3],
    normals: &'a mut [f32; MAX_TUBE_VERTICES * 3],
    uvs: &'a mut [f32; MAX_TUBE_VERTICES * 2],
    indices: &'a mut [u16; MAX_TUBE_INDICES],
    cos_table: &'a [f32; MAX_RADIAL_SEGMENTS],
    sin_table: &'a [f32; MAX_RADIAL_SEGMENTS],
    radial_segments: usize,
    vertex_count: usize,
    index_count: usize,
    prev_ring_base_vertex: Option<usize>,
}

impl<'a> TubeRingEmitCtx<'a> {
    #[inline]
    fn emit_step_ring(
        &mut self,
        step: &CapRingStep,
        pos: [f32; 3],
        tangent: [f32; 3],
        b_vec: [f32; 3],
        n_vec: [f32; 3],
        ring_radius: f32,
        horizon_progress: f32,
    ) -> bool {
        if self.vertex_count + self.radial_segments > MAX_TUBE_VERTICES
            || self.index_count + self.radial_segments * 6 > MAX_TUBE_INDICES
        {
            return false;
        }

        let axial_offset = step.axial_offset_scale * ring_radius;
        let cx = pos[0] + tangent[0] * axial_offset;
        let cy = pos[1] + tangent[1] * axial_offset;
        let cz = pos[2] + tangent[2] * axial_offset;
        let r = ring_radius * step.radius_scale;
        let ring_base_vertex = self.vertex_count;

        for s in 0..self.radial_segments {
            let c = self.cos_table[s];
            let sn = self.sin_table[s];

            let rnx = c * b_vec[0] + sn * n_vec[0];
            let rny = c * b_vec[1] + sn * n_vec[1];
            let rnz = c * b_vec[2] + sn * n_vec[2];

            let v_off3 = self.vertex_count * 3;
            self.positions[v_off3] = cx + rnx * r;
            self.positions[v_off3 + 1] = cy + rny * r;
            self.positions[v_off3 + 2] = cz + rnz * r;

            self.normals[v_off3] = rnx * step.normal_radial + tangent[0] * step.normal_axial;
            self.normals[v_off3 + 1] = rny * step.normal_radial + tangent[1] * step.normal_axial;
            self.normals[v_off3 + 2] = rnz * step.normal_radial + tangent[2] * step.normal_axial;

            let v_off2 = self.vertex_count * 2;
            self.uvs[v_off2] = horizon_progress;
            self.uvs[v_off2 + 1] = step.tip_alpha;

            self.vertex_count += 1;
        }

        if let Some(prev_base) = self.prev_ring_base_vertex {
            for s in 0..self.radial_segments {
                let next_s = (s + 1) % self.radial_segments;
                let i00 = (prev_base + s) as u16;
                let i01 = (prev_base + next_s) as u16;
                let i10 = (ring_base_vertex + s) as u16;
                let i11 = (ring_base_vertex + next_s) as u16;

                self.indices[self.index_count] = i00;
                self.indices[self.index_count + 1] = i10;
                self.indices[self.index_count + 2] = i11;

                self.indices[self.index_count + 3] = i00;
                self.indices[self.index_count + 4] = i11;
                self.indices[self.index_count + 5] = i01;
                self.index_count += 6;
            }
        }

        self.prev_ring_base_vertex = Some(ring_base_vertex);
        true
    }
}

/// Extrudes a twist-free parallel-transport 3D tubular mesh across all solid dash ranges
/// with either rounded hemisphere capsule caps (`0`) or 45-degree chamfered bevel caps (`1`).
#[allow(clippy::too_many_arguments)]
pub fn extrude_trajectory_tube_dash_ranges(
    predicted_three_points: &[f32; MAX_PREDICTION_SLICES * 3],
    prediction_count: usize,
    start_index: usize,
    dash_ranges: &[DashRangePod; MAX_DASH_RANGES],
    range_count: usize,
    cfg: &TrajectoryMeshConfigPod,
    cos_table: &[f32; MAX_RADIAL_SEGMENTS],
    sin_table: &[f32; MAX_RADIAL_SEGMENTS],
    positions: &mut [f32; MAX_TUBE_VERTICES * 3],
    normals: &mut [f32; MAX_TUBE_VERTICES * 3],
    uvs: &mut [f32; MAX_TUBE_VERTICES * 2],
    indices: &mut [u16; MAX_TUBE_INDICES],
) -> (u32, u32) {
    if range_count == 0 || prediction_count <= 1 || start_index >= prediction_count - 1 {
        return (0, 0);
    }

    let radial_segments = (cfg.radial_segments as usize).clamp(4, MAX_RADIAL_SEGMENTS);
    let stride = (cfg.sample_stride as usize).clamp(1, 8);
    let base_radius = cfg.world_radius.max(0.5);
    let clamped_taper = cfg.radius_taper.clamp(0.0, 0.92);
    let total_horizon_span = (prediction_count - 1 - start_index).max(1) as f32;
    let is_chamfer = cfg.dash_cap_style == 1;
    let start_cap_steps: &[CapRingStep] = if is_chamfer {
        &CHAMFER_START_CAP_STEPS
    } else {
        &ROUND_START_CAP_STEPS
    };
    let end_cap_steps: &[CapRingStep] = if is_chamfer {
        &CHAMFER_END_CAP_STEPS
    } else {
        &ROUND_END_CAP_STEPS
    };

    let live_override = cfg.live_ball_override_active != 0;
    let live_pos = cfg.live_ball_three_pos;

    let mut ctx = TubeRingEmitCtx {
        positions,
        normals,
        uvs,
        indices,
        cos_table,
        sin_table,
        radial_segments,
        vertex_count: 0,
        index_count: 0,
        prev_ring_base_vertex: None,
    };

    for range in dash_ranges.iter().take(range_count) {
        let d_start = range.start_tick as usize;
        let d_end = (range.end_tick as usize).min(prediction_count - 1);
        if d_end <= d_start {
            continue;
        }

        ctx.prev_ring_base_vertex = None;
        let mut prev_b = [0.0f32; 3];
        let mut has_frame = false;

        let mut k = d_start;
        let mut reached_end = false;
        while !reached_end {
            if k >= d_end {
                k = d_end;
                reached_end = true;
            }

            let p_off = k * 3;
            let sx = predicted_three_points[p_off];
            let sy = predicted_three_points[p_off + 1];
            let sz = predicted_three_points[p_off + 2];

            let pos = if k == start_index && live_override {
                let dx = live_pos[0] - sx;
                let dy = live_pos[1] - sy;
                let dz = live_pos[2] - sz;
                if dx * dx + dy * dy + dz * dz <= LIVE_BALL_SNAP_MAX_DIST_SQ {
                    live_pos
                } else {
                    [sx, sy, sz]
                }
            } else {
                [sx, sy, sz]
            };

            let k_prev = k.saturating_sub(1).max(start_index);
            let k_next = (k + 1).min(prediction_count - 1);
            let off_prev = k_prev * 3;
            let off_next = k_next * 3;
            let mut tx = predicted_three_points[off_next] - predicted_three_points[off_prev];
            let mut ty =
                predicted_three_points[off_next + 1] - predicted_three_points[off_prev + 1];
            let mut tz =
                predicted_three_points[off_next + 2] - predicted_three_points[off_prev + 2];
            let t_len = (tx * tx + ty * ty + tz * tz).sqrt();
            if t_len > 1e-5 {
                let inv_t = 1.0 / t_len;
                tx *= inv_t;
                ty *= inv_t;
                tz *= inv_t;
            } else {
                tx = 0.0;
                ty = 0.0;
                tz = 1.0;
            }

            let (bx, by, bz) = if !has_frame {
                let (mut bx0, mut by0, mut bz0) = if ty.abs() < 0.92 {
                    (-tz, 0.0, tx)
                } else {
                    (1.0, 0.0, 0.0)
                };
                let b_len = (bx0 * bx0 + by0 * by0 + bz0 * bz0).sqrt();
                let inv_b = if b_len > 1e-6 { 1.0 / b_len } else { 1.0 };
                bx0 *= inv_b;
                by0 *= inv_b;
                bz0 *= inv_b;
                has_frame = true;
                (bx0, by0, bz0)
            } else {
                let dot_tb = tx * prev_b[0] + ty * prev_b[1] + tz * prev_b[2];
                let mut bx1 = prev_b[0] - dot_tb * tx;
                let mut by1 = prev_b[1] - dot_tb * ty;
                let mut bz1 = prev_b[2] - dot_tb * tz;
                let b_len = (bx1 * bx1 + by1 * by1 + bz1 * bz1).sqrt();
                if b_len > 1e-5 {
                    let inv_b = 1.0 / b_len;
                    bx1 *= inv_b;
                    by1 *= inv_b;
                    bz1 *= inv_b;
                    (bx1, by1, bz1)
                } else {
                    (prev_b[0], prev_b[1], prev_b[2])
                }
            };
            prev_b = [bx, by, bz];

            let nx_frame = by * tz - bz * ty;
            let ny_frame = bz * tx - bx * tz;
            let nz_frame = bx * ty - by * tx;

            let horizon_progress =
                (((k - start_index) as f32) / total_horizon_span).clamp(0.0, 1.0);
            let ring_radius = base_radius * (1.0 - clamped_taper * horizon_progress);
            let tangent = [tx, ty, tz];
            let b_vec = [bx, by, bz];
            let n_vec = [nx_frame, ny_frame, nz_frame];

            let mut overflowed = false;
            if k == d_start {
                for step in start_cap_steps {
                    if !ctx.emit_step_ring(
                        step,
                        pos,
                        tangent,
                        b_vec,
                        n_vec,
                        ring_radius,
                        horizon_progress,
                    ) {
                        overflowed = true;
                        break;
                    }
                }
            }

            if !overflowed
                && !ctx.emit_step_ring(
                    &CYLINDER_RING_STEP,
                    pos,
                    tangent,
                    b_vec,
                    n_vec,
                    ring_radius,
                    horizon_progress,
                )
            {
                overflowed = true;
            }

            if !overflowed && reached_end {
                for step in end_cap_steps {
                    if !ctx.emit_step_ring(
                        step,
                        pos,
                        tangent,
                        b_vec,
                        n_vec,
                        ring_radius,
                        horizon_progress,
                    ) {
                        overflowed = true;
                        break;
                    }
                }
            }

            if overflowed {
                break;
            }
            k += stride;
        }
    }

    (ctx.vertex_count as u32, ctx.index_count as u32)
}

impl TrajectoryMeshInstance {
    /// Builds 3D trajectory tube geometry, surface bounce contact rings, and ground drop lines
    /// in WASM linear memory for zero-copy Three.js `BufferAttribute` consumption.
    pub fn build_trajectory_mesh(
        &mut self,
        pred_slices: &[BallPredSlicePod],
        pred_count: usize,
    ) -> u32 {
        let count = pred_count.min(MAX_PREDICTION_SLICES).min(pred_slices.len());
        let start_idx = (self.mesh_config.start_index as usize).min(count);

        for (i, slice) in pred_slices.iter().take(count).enumerate() {
            let [x, y, z] = slice.pos;
            let dst = i * 3;
            self.predicted_three_points[dst] = x;
            self.predicted_three_points[dst + 1] = z;
            self.predicted_three_points[dst + 2] = y;

            self.raw_predicted_points[dst] = x;
            self.raw_predicted_points[dst + 1] = y;
            self.raw_predicted_points[dst + 2] = z;
        }

        if count <= 1 || start_idx >= count - 1 {
            self.mesh_header = TrajectoryMeshHeaderPod {
                vertex_count: 0,
                index_count: 0,
                bounce_count: 0,
                ground_drop_float_count: 0,
                max_height_uu: 0.0,
                prediction_count: count as u32,
                start_index: start_idx as u32,
                active_triangle_count: 0,
            };
            return 0;
        }

        let (bounce_count, max_height_uu) = detect_trajectory_bounces(
            &pred_slices[..count],
            &self.predicted_three_points,
            count,
            start_idx,
            &mut self.bounce_markers,
        );

        let show_ground_drops = (self.mesh_config.flags & FLAG_SHOW_GROUND_PROJECTION) != 0;
        let ground_drop_float_count = if show_ground_drops {
            build_ground_drop_line_segments(
                &self.predicted_three_points,
                count,
                start_idx,
                self.mesh_config.drop_line_interval_ticks,
                &mut self.ground_drop_positions,
            )
        } else {
            0
        };

        let radial_segments =
            (self.mesh_config.radial_segments as usize).clamp(4, MAX_RADIAL_SEGMENTS);
        ensure_radial_trig_table(
            radial_segments,
            &mut self.last_radial_segments,
            &mut self.radial_cos_table,
            &mut self.radial_sin_table,
        );

        let range_count = build_trajectory_dash_ranges(
            count,
            start_idx,
            self.mesh_config.solid_ticks,
            self.mesh_config.transparent_ticks,
            self.mesh_config.phase_offset_ticks,
            &mut self.dash_ranges,
        );

        let (vertex_count, index_count) = extrude_trajectory_tube_dash_ranges(
            &self.predicted_three_points,
            count,
            start_idx,
            &self.dash_ranges,
            range_count,
            &self.mesh_config,
            &self.radial_cos_table,
            &self.radial_sin_table,
            &mut self.tube_positions,
            &mut self.tube_normals,
            &mut self.tube_uvs,
            &mut self.tube_indices,
        );

        self.mesh_header = TrajectoryMeshHeaderPod {
            vertex_count,
            index_count,
            bounce_count,
            ground_drop_float_count,
            max_height_uu,
            prediction_count: count as u32,
            start_index: start_idx as u32,
            active_triangle_count: index_count / 3,
        };
        index_count
    }
}
