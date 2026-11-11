//! Zero-copy C-ABI POD structures for trajectory tube/ribbon geometry, bounce rings,
//! ground altitude drop lines, and 3D ground/aerial reachability & intercept outputs.

pub const MAX_PREDICTION_SLICES: usize = 600;
pub const MAX_TUBE_RINGS: usize = 800;
pub const MAX_RADIAL_SEGMENTS: usize = 8;
pub const MAX_TUBE_VERTICES: usize = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS;
pub const MAX_TUBE_INDICES: usize = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS * 6;
pub const MAX_DASH_RANGES: usize = 64;
pub const MAX_BOUNCE_MARKERS: usize = 12;
pub const BOUNCE_MARKER_STRIDE: usize = 8;
pub const MAX_GROUND_DROP_FLOATS: usize = 400 * 6;

pub const N_GROUND_BINS: usize = 72;
pub const GROUND_HORIZON_COUNT: usize = 3;
pub const GROUND_RADII_FLOATS: usize = GROUND_HORIZON_COUNT * N_GROUND_BINS;
pub const GROUND_RING_VERTS: usize = N_GROUND_BINS + 1;
pub const GROUND_FILL0_VERTS: usize = N_GROUND_BINS + 1;
pub const GROUND_FILL_BAND_VERTS: usize = 2 * N_GROUND_BINS;
pub const GROUND_LUT_TOTAL_ELEMENTS: usize = 11 * 5 * 3 * GROUND_HORIZON_COUNT * N_GROUND_BINS;

pub const FUNNEL_RINGS: usize = 16;
pub const FUNNEL_SECTORS: usize = 24;
pub const FUNNEL_VERTS_COUNT: usize = FUNNEL_RINGS * FUNNEL_SECTORS;
pub const FUNNEL_RING_LINE_VERTS: usize = FUNNEL_SECTORS + 1;
pub const FUNNEL_RAIL_SEGMENTS_VERTS: usize = 4 * (FUNNEL_RINGS - 1) * 2;

pub const BUBBLE_LAT: usize = 12;
pub const BUBBLE_LON: usize = 20;
pub const BUBBLE_VERTS_COUNT: usize = (BUBBLE_LAT + 1) * BUBBLE_LON;
pub const BUBBLE_RIB_VERTS_COUNT: usize = 3 * BUBBLE_LON * 2 + 4 * BUBBLE_LAT * 2;

pub const INTERCEPT_CROSS_FLOATS: usize = 18;

/// C-ABI zero-copy output buffer descriptor for Three.js `BufferAttribute` binding.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct TrajectoryMeshHeaderPod {
    pub vertex_count: u32,
    pub index_count: u32,
    pub bounce_count: u32,
    pub ground_drop_float_count: u32,
    pub max_height_uu: f32,
    pub prediction_count: u32,
    pub start_index: u32,
    pub active_triangle_count: u32,
}

/// 8-float surface bounce contact ring descriptor (Three.js world pos + normal + progress + impulse).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BounceMarkerPod {
    pub three_pos: [f32; 3],
    pub three_normal: [f32; 3],
    pub progress_01: f32,
    pub impulse_mag: f32,
}

/// Configuration parameters passed from TypeScript or stored in `TrajectoryMeshState` for tube extrusion.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct TrajectoryMeshConfigPod {
    pub start_index: u32,
    pub solid_ticks: u32,
    pub transparent_ticks: u32,
    pub phase_offset_ticks: i32,
    pub sample_stride: u32,
    pub radial_segments: u32,
    pub dash_cap_style: u32,
    pub flags: u32,
    pub world_radius: f32,
    pub radius_taper: f32,
    pub drop_line_interval_ticks: u32,
    pub live_ball_override_active: u32,
    pub live_ball_three_pos: [f32; 3],
}

impl Default for TrajectoryMeshConfigPod {
    fn default() -> Self {
        Self {
            start_index: 0,
            solid_ticks: 50,
            transparent_ticks: 20,
            phase_offset_ticks: 0,
            sample_stride: 1,
            radial_segments: 6,
            dash_cap_style: 0,
            flags: 0x03,
            world_radius: 18.25,
            radius_taper: 0.35,
            drop_line_interval_ticks: 104,
            live_ball_override_active: 0,
            live_ball_three_pos: [0.0; 3],
        }
    }
}

/// Synchronized spacetime optimal intercept result and 3D orthogonal cross descriptor.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct InterceptSolutionPod {
    /// 0 = none, 1 = reachable, 2 = closest-fallback
    pub status: u32,
    /// 0 = none, 1 = sweet-spot, 2 = catching, 3 = overshoot, 4 = unreachable
    pub pace_status: u32,
    pub target_tick: i32,
    pub time_sec: f32,
    pub distance_uu: f32,
    pub margin_uu: f32,
    pub centrality: f32,
    pub min_boost: f32,
    pub rocket_sim_pos: [f32; 3],
    pub three_pos: [f32; 3],
    pub axis1_three: [f32; 3],
    pub axis2_three: [f32; 3],
    pub axis3_three: [f32; 3],
    pub cross_segments_three: [f32; INTERCEPT_CROSS_FLOATS],
}

impl Default for InterceptSolutionPod {
    fn default() -> Self {
        Self {
            status: 0,
            pace_status: 0,
            target_tick: -1,
            time_sec: 0.0,
            distance_uu: 0.0,
            margin_uu: -99999.0,
            centrality: 0.0,
            min_boost: 0.0,
            rocket_sim_pos: [0.0; 3],
            three_pos: [0.0; 3],
            axis1_three: [1.0, 0.0, 0.0],
            axis2_three: [0.0, 1.0, 0.0],
            axis3_three: [0.0, 0.0, 1.0],
            cross_segments_three: [0.0; INTERCEPT_CROSS_FLOATS],
        }
    }
}

/// Zero-copy output header for Ground + Aerial Reachability & Intercept solver buffers.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct ReachabilityOutputHeaderPod {
    pub ground_visible: u32,
    pub aerial_visible: u32,
    pub aerial_mode: u32,
    pub ground_lut_ready: u32,
    pub car_forward_speed_uu: f32,
    pub car_boost_amount: f32,
    pub intercept: InterceptSolutionPod,
}
