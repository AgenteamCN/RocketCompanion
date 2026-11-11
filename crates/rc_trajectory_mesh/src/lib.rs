//! `rc_trajectory_mesh`: Zero-copy WASM trajectory tube/ribbon geometry, bounce contact rings,
//! and ground drop-line vertex buffer generator consuming `rc_physics_sim` prediction slices.

pub const MAX_TUBE_RINGS: usize = 800;
pub const MAX_RADIAL_SEGMENTS: usize = 8;
pub const MAX_TUBE_VERTICES: usize = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS;
pub const MAX_TUBE_INDICES: usize = MAX_TUBE_RINGS * MAX_RADIAL_SEGMENTS * 6;
pub const MAX_BOUNCE_MARKERS: usize = 12;
pub const BOUNCE_MARKER_STRIDE: usize = 8;
pub const MAX_GROUND_DROP_FLOATS: usize = 400 * 6;

/// C-ABI zero-copy output buffer descriptor for Three.js `BufferAttribute` binding.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct TrajectoryMeshHeaderPod {
    pub vertex_count: u32,
    pub index_count: u32,
    pub bounce_count: u32,
    pub ground_drop_float_count: u32,
    pub max_height_uu: f32,
}
