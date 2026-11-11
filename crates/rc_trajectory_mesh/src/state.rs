//! Static linear memory pool and state container for `rc_trajectory_mesh`.

use rc_physics_sim::layout::{BallPredSlicePod, GameStateBufferPod, MAX_CARS};

use crate::{
    aerial_reachability::{update_aerial_bubbles_geometry, update_aerial_funnel_geometry},
    ground_reachability::update_ground_reachability_geometry,
    intercept_solver::solve_optimal_intercept,
    layout::{
        BounceMarkerPod, InterceptSolutionPod, ReachabilityOutputHeaderPod,
        TrajectoryMeshConfigPod, TrajectoryMeshHeaderPod, BUBBLE_RIB_VERTS_COUNT,
        BUBBLE_VERTS_COUNT, FUNNEL_RAIL_SEGMENTS_VERTS, FUNNEL_RING_LINE_VERTS, FUNNEL_VERTS_COUNT,
        GROUND_FILL0_VERTS, GROUND_FILL_BAND_VERTS, GROUND_HORIZON_COUNT,
        GROUND_LUT_TOTAL_ELEMENTS, GROUND_RADII_FLOATS, GROUND_RING_VERTS, MAX_BOUNCE_MARKERS,
        MAX_DASH_RANGES, MAX_GROUND_DROP_FLOATS, MAX_PREDICTION_SLICES, MAX_RADIAL_SEGMENTS,
        MAX_TUBE_INDICES, MAX_TUBE_VERTICES,
    },
    reachability_constants::{
        BubbleSphereTables, REACH_FLAG_AERIAL_BUBBLES, REACH_FLAG_CROSS_TRAJECTORY_ORIENT,
        REACH_FLAG_GROUND_ANALYTICAL, REACH_FLAG_INCLUDE_JUMP_IMPULSE, REACH_FLAG_SHOW_AERIAL,
        REACH_FLAG_SHOW_CLOSEST_FALLBACK, REACH_FLAG_SHOW_GROUND, REACH_FLAG_SHOW_INTERCEPT,
    },
};

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct DashRangePod {
    pub start_tick: u32,
    pub end_tick: u32,
}

/// Pre-allocated linear memory pool for 3D volumetric trajectory tube, bounce rings,
/// ground drop lines, and 3D ground/aerial reachability & intercept geometry.
pub struct TrajectoryMeshInstance {
    pub mesh_header: TrajectoryMeshHeaderPod,
    pub mesh_config: TrajectoryMeshConfigPod,

    pub predicted_three_points: [f32; MAX_PREDICTION_SLICES * 3],
    pub raw_predicted_points: [f32; MAX_PREDICTION_SLICES * 3],
    pub dash_ranges: [DashRangePod; MAX_DASH_RANGES],

    pub tube_positions: [f32; MAX_TUBE_VERTICES * 3],
    pub tube_normals: [f32; MAX_TUBE_VERTICES * 3],
    pub tube_uvs: [f32; MAX_TUBE_VERTICES * 2],
    pub tube_indices: [u16; MAX_TUBE_INDICES],

    pub bounce_markers: [BounceMarkerPod; MAX_BOUNCE_MARKERS],
    pub ground_drop_positions: [f32; MAX_GROUND_DROP_FLOATS],

    pub radial_cos_table: [f32; MAX_RADIAL_SEGMENTS],
    pub radial_sin_table: [f32; MAX_RADIAL_SEGMENTS],
    pub last_radial_segments: u32,

    pub reachability_header: ReachabilityOutputHeaderPod,
    pub ground_reachability_lut: Vec<f32>,
    pub ground_raw_radii: [f32; GROUND_RADII_FLOATS],
    pub ground_smoothed_radii: [f32; GROUND_RADII_FLOATS],
    pub has_prev_ground_radii: bool,

    pub ground_line_positions: [[f32; GROUND_RING_VERTS * 3]; GROUND_HORIZON_COUNT],
    pub ground_fill0_positions: [f32; GROUND_FILL0_VERTS * 3],
    pub ground_fill1_positions: [f32; GROUND_FILL_BAND_VERTS * 3],
    pub ground_fill2_positions: [f32; GROUND_FILL_BAND_VERTS * 3],

    pub funnel_positions: [f32; FUNNEL_VERTS_COUNT * 3],
    pub funnel_colors: [f32; FUNNEL_VERTS_COUNT * 3],
    pub funnel_ring_line_positions: [[f32; FUNNEL_RING_LINE_VERTS * 3]; GROUND_HORIZON_COUNT],
    pub funnel_rail_positions: [f32; FUNNEL_RAIL_SEGMENTS_VERTS * 3],

    pub bubble_positions: [[f32; BUBBLE_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
    pub bubble_colors: [[f32; BUBBLE_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
    pub bubble_rib_positions: [[f32; BUBBLE_RIB_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
    pub bubble_tables: BubbleSphereTables,
}

impl Default for TrajectoryMeshInstance {
    fn default() -> Self {
        Self::new()
    }
}

impl TrajectoryMeshInstance {
    pub fn new() -> Self {
        Self {
            mesh_header: TrajectoryMeshHeaderPod::default(),
            mesh_config: TrajectoryMeshConfigPod::default(),
            predicted_three_points: [0.0; MAX_PREDICTION_SLICES * 3],
            raw_predicted_points: [0.0; MAX_PREDICTION_SLICES * 3],
            dash_ranges: [DashRangePod::default(); MAX_DASH_RANGES],
            tube_positions: [0.0; MAX_TUBE_VERTICES * 3],
            tube_normals: [0.0; MAX_TUBE_VERTICES * 3],
            tube_uvs: [0.0; MAX_TUBE_VERTICES * 2],
            tube_indices: [0; MAX_TUBE_INDICES],
            bounce_markers: [BounceMarkerPod::default(); MAX_BOUNCE_MARKERS],
            ground_drop_positions: [0.0; MAX_GROUND_DROP_FLOATS],
            radial_cos_table: [0.0; MAX_RADIAL_SEGMENTS],
            radial_sin_table: [0.0; MAX_RADIAL_SEGMENTS],
            last_radial_segments: 0,
            reachability_header: ReachabilityOutputHeaderPod::default(),
            ground_reachability_lut: Vec::new(),
            ground_raw_radii: [0.0; GROUND_RADII_FLOATS],
            ground_smoothed_radii: [0.0; GROUND_RADII_FLOATS],
            has_prev_ground_radii: false,
            ground_line_positions: [[0.0; GROUND_RING_VERTS * 3]; GROUND_HORIZON_COUNT],
            ground_fill0_positions: [0.0; GROUND_FILL0_VERTS * 3],
            ground_fill1_positions: [0.0; GROUND_FILL_BAND_VERTS * 3],
            ground_fill2_positions: [0.0; GROUND_FILL_BAND_VERTS * 3],
            funnel_positions: [0.0; FUNNEL_VERTS_COUNT * 3],
            funnel_colors: [0.0; FUNNEL_VERTS_COUNT * 3],
            funnel_ring_line_positions: [[0.0; FUNNEL_RING_LINE_VERTS * 3]; GROUND_HORIZON_COUNT],
            funnel_rail_positions: [0.0; FUNNEL_RAIL_SEGMENTS_VERTS * 3],
            bubble_positions: [[0.0; BUBBLE_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
            bubble_colors: [[0.0; BUBBLE_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
            bubble_rib_positions: [[0.0; BUBBLE_RIB_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
            bubble_tables: BubbleSphereTables::generate(),
        }
    }

    pub fn load_ground_reachability_lut_u16(&mut self, raw_u16: &[u16], unit_scale_uu: f32) -> i32 {
        if raw_u16.len() < GROUND_LUT_TOTAL_ELEMENTS {
            return 0;
        }
        let scale = if unit_scale_uu > 0.0 {
            unit_scale_uu
        } else {
            0.1
        };
        self.ground_reachability_lut.clear();
        self.ground_reachability_lut
            .reserve_exact(GROUND_LUT_TOTAL_ELEMENTS);
        for &v in &raw_u16[..GROUND_LUT_TOTAL_ELEMENTS] {
            self.ground_reachability_lut.push(f32::from(v) * scale);
        }
        self.reachability_header.ground_lut_ready = 1;
        1
    }

    /// Foundation stub for building 3D trajectory tube geometry, bounce contact rings, and ground drop lines.
    /// Tier 2 branches will fill in full parallel-transport extrusion and bounce impulse detection.
    pub fn build_trajectory_mesh(
        &mut self,
        pred_slices: &[BallPredSlicePod],
        pred_count: usize,
    ) -> u32 {
        let count = pred_count.min(MAX_PREDICTION_SLICES).min(pred_slices.len());
        let start_idx = (self.mesh_config.start_index as usize).min(count);
        let mut max_height = 0.0f32;

        for (i, slice) in pred_slices.iter().take(count).enumerate() {
            let [x, y, z] = slice.pos;
            let dst = i * 3;
            self.predicted_three_points[dst] = x;
            self.predicted_three_points[dst + 1] = z;
            self.predicted_three_points[dst + 2] = y;

            self.raw_predicted_points[dst] = x;
            self.raw_predicted_points[dst + 1] = y;
            self.raw_predicted_points[dst + 2] = z;

            if i >= start_idx && z > max_height {
                max_height = z;
            }
        }

        self.mesh_header = TrajectoryMeshHeaderPod {
            vertex_count: 0,
            index_count: 0,
            bounce_count: 0,
            ground_drop_float_count: 0,
            max_height_uu: max_height,
            prediction_count: count as u32,
            start_index: start_idx as u32,
            active_triangle_count: 0,
        };
        self.mesh_header.index_count
    }

    /// Computes Ground/Aerial Reachability & Spacetime Intercept in WASM.
    pub fn update_reachability_and_intercept(
        &mut self,
        state: &GameStateBufferPod,
        car_index: usize,
        elapsed_ticks: i32,
        flags: u32,
        cross_arm_length: f32,
    ) -> u32 {
        let idx = car_index.min(MAX_CARS - 1);
        let car = &state.cars[idx];
        if car.is_demoed > 0.5 {
            self.reachability_header.ground_visible = 0;
            self.reachability_header.aerial_visible = 0;
            self.reachability_header.intercept = InterceptSolutionPod::default();
            self.has_prev_ground_radii = false;
            return 0;
        }

        let is_on_ground = car.is_on_ground > 0.5;
        let show_ground = (flags & REACH_FLAG_SHOW_GROUND) != 0;
        let use_analytical = (flags & REACH_FLAG_GROUND_ANALYTICAL) != 0;
        let show_aerial = (flags & REACH_FLAG_SHOW_AERIAL) != 0;
        let is_bubbles = (flags & REACH_FLAG_AERIAL_BUBBLES) != 0;
        let include_jump = (flags & REACH_FLAG_INCLUDE_JUMP_IMPULSE) != 0;
        let show_intercept = (flags & REACH_FLAG_SHOW_INTERCEPT) != 0;
        let cross_trajectory = (flags & REACH_FLAG_CROSS_TRAJECTORY_ORIENT) != 0;
        let show_fallback = (flags & REACH_FLAG_SHOW_CLOSEST_FALLBACK) != 0;

        let forward_spd = car.vel[0] * car.forward[0]
            + car.vel[1] * car.forward[1]
            + car.vel[2] * car.forward[2];
        self.reachability_header.car_forward_speed_uu = forward_spd;
        self.reachability_header.car_boost_amount = car.boost;

        let car_pos = car.pos;

        // 1. Ground Reachability (auto-hides when car is not on ground)
        if show_ground && is_on_ground {
            self.reachability_header.ground_visible = 1;
            update_ground_reachability_geometry(
                car,
                car_pos,
                use_analytical,
                &self.ground_reachability_lut,
                &mut self.ground_raw_radii,
                &mut self.ground_smoothed_radii,
                &mut self.has_prev_ground_radii,
                &mut self.ground_line_positions,
                &mut self.ground_fill0_positions,
                &mut self.ground_fill1_positions,
                &mut self.ground_fill2_positions,
            );
        } else {
            self.reachability_header.ground_visible = 0;
            self.has_prev_ground_radii = false;
        }

        // 2. Aerial Reachability (Funnel vs Bubbles)
        self.reachability_header.aerial_mode = u32::from(is_bubbles);
        if show_aerial {
            self.reachability_header.aerial_visible = 1;
            if is_bubbles {
                update_aerial_bubbles_geometry(
                    car,
                    car_pos,
                    include_jump,
                    &self.bubble_tables,
                    &mut self.bubble_positions,
                    &mut self.bubble_colors,
                    &mut self.bubble_rib_positions,
                );
            } else {
                update_aerial_funnel_geometry(
                    car,
                    car_pos,
                    include_jump,
                    &mut self.funnel_positions,
                    &mut self.funnel_colors,
                    &mut self.funnel_ring_line_positions,
                    &mut self.funnel_rail_positions,
                );
            }
        } else {
            self.reachability_header.aerial_visible = 0;
        }

        // 3. Optimal Spacetime Intercept Solver
        if show_intercept {
            let pred_count = (self.mesh_header.prediction_count as usize).min(MAX_PREDICTION_SLICES);
            if pred_count > 1 {
                self.reachability_header.intercept = solve_optimal_intercept(
                    &self.raw_predicted_points[..pred_count * 3],
                    pred_count,
                    elapsed_ticks,
                    car,
                    car_pos,
                    include_jump,
                    show_fallback,
                    cross_trajectory,
                    cross_arm_length,
                );
            } else {
                // Stationary / fallback ball trajectory (360 ticks at current ball position)
                let [bx, by, bz] = state.ball.pos;
                let mut fallback_pts = [0.0f32; 360 * 3];
                for i in 0..360 {
                    let off = i * 3;
                    fallback_pts[off] = bx;
                    fallback_pts[off + 1] = by;
                    fallback_pts[off + 2] = bz;
                }
                self.reachability_header.intercept = solve_optimal_intercept(
                    &fallback_pts,
                    360,
                    0,
                    car,
                    car_pos,
                    include_jump,
                    show_fallback,
                    cross_trajectory,
                    cross_arm_length,
                );
            }
        } else {
            self.reachability_header.intercept = InterceptSolutionPod::default();
        }

        self.reachability_header.intercept.status
    }
}

