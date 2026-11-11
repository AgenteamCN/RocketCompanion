//! Static linear memory pool and state container for `rc_trajectory_mesh`.

use rc_physics_sim::layout::{BallPredSlicePod, GameStateBufferPod};

use crate::layout::{
    BounceMarkerPod, InterceptSolutionPod, ReachabilityOutputHeaderPod, TrajectoryMeshConfigPod,
    TrajectoryMeshHeaderPod, BUBBLE_RIB_VERTS_COUNT, BUBBLE_VERTS_COUNT, FUNNEL_RAIL_SEGMENTS_VERTS,
    FUNNEL_RING_LINE_VERTS, FUNNEL_VERTS_COUNT, GROUND_FILL0_VERTS, GROUND_FILL_BAND_VERTS,
    GROUND_HORIZON_COUNT, GROUND_LUT_TOTAL_ELEMENTS, GROUND_RADII_FLOATS, GROUND_RING_VERTS,
    MAX_BOUNCE_MARKERS, MAX_DASH_RANGES, MAX_GROUND_DROP_FLOATS, MAX_PREDICTION_SLICES,
    MAX_RADIAL_SEGMENTS, MAX_TUBE_INDICES, MAX_TUBE_VERTICES,
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

    /// Foundation stub for computing Ground/Aerial Reachability & Spacetime Intercept in WASM.
    /// Tier 2 branches will fill in LUT trilinear interpolation, funnel/bubble generation, and intercept solver.
    pub fn update_reachability_and_intercept(
        &mut self,
        _state: &GameStateBufferPod,
        _car_index: usize,
        _elapsed_ticks: i32,
        _flags: u32,
        _cross_arm_length: f32,
    ) -> u32 {
        self.reachability_header.ground_visible = 0;
        self.reachability_header.aerial_visible = 0;
        self.reachability_header.intercept = InterceptSolutionPod::default();
        self.reachability_header.intercept.status
    }
}
