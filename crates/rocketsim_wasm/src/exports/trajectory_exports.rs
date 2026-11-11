//! Zero-copy C-ABI exports (`_physics_*`) for `rc_trajectory_mesh` (Trajectory Tube, Bounce Rings,
//! Ground Altitude Drop Lines, Ground/Aerial Reachability Isochrones, and Spacetime Intercept Solver).

use std::cell::UnsafeCell;

use rc_trajectory_mesh::{
    BounceMarkerPod, ReachabilityOutputHeaderPod, TrajectoryMeshConfigPod, TrajectoryMeshHeaderPod,
    TrajectoryMeshInstance, GROUND_HORIZON_COUNT,
};

use crate::with_sim;

struct GlobalTrajectoryMesh(UnsafeCell<Option<Box<TrajectoryMeshInstance>>>);
unsafe impl Sync for GlobalTrajectoryMesh {}

static TRAJECTORY_MESH: GlobalTrajectoryMesh = GlobalTrajectoryMesh(UnsafeCell::new(None));

pub(crate) fn with_trajectory_mesh<R>(f: impl FnOnce(&mut TrajectoryMeshInstance) -> R) -> R {
    unsafe {
        let slot = &mut *TRAJECTORY_MESH.0.get();
        let inst = slot.get_or_insert_with(|| Box::new(TrajectoryMeshInstance::new()));
        f(inst)
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryMeshHeaderPtr() -> *const TrajectoryMeshHeaderPod {
    with_trajectory_mesh(|tm| &tm.mesh_header as *const TrajectoryMeshHeaderPod)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryMeshConfigPtr() -> *mut TrajectoryMeshConfigPod {
    with_trajectory_mesh(|tm| &mut tm.mesh_config as *mut TrajectoryMeshConfigPod)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryPositionsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.tube_positions.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryNormalsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.tube_normals.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryUvsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.tube_uvs.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryIndicesPtr() -> *const u16 {
    with_trajectory_mesh(|tm| tm.tube_indices.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryBounceMarkersPtr() -> *const BounceMarkerPod {
    with_trajectory_mesh(|tm| tm.bounce_markers.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryGroundDropsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.ground_drop_positions.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryPredictedThreePointsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.predicted_three_points.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getTrajectoryRawPointsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.raw_predicted_points.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_buildTrajectoryMesh(
    start_index: i32,
    solid_ticks: i32,
    transparent_ticks: i32,
    phase_offset_ticks: i32,
    world_radius: f32,
    radius_taper: f32,
    radial_segments: i32,
    sample_stride: i32,
    dash_cap_style: i32,
    drop_line_interval_ticks: i32,
    flags: u32,
    live_ball_override: i32,
    live_x: f32,
    live_y: f32,
    live_z: f32,
) -> i32 {
    with_sim(|sim| {
        with_trajectory_mesh(|tm| {
            tm.mesh_config.start_index = start_index.max(0) as u32;
            tm.mesh_config.solid_ticks = solid_ticks.max(1) as u32;
            tm.mesh_config.transparent_ticks = transparent_ticks.max(0) as u32;
            tm.mesh_config.phase_offset_ticks = phase_offset_ticks;
            tm.mesh_config.world_radius = world_radius;
            tm.mesh_config.radius_taper = radius_taper;
            tm.mesh_config.radial_segments = radial_segments.clamp(4, 8) as u32;
            tm.mesh_config.sample_stride = sample_stride.clamp(1, 8) as u32;
            tm.mesh_config.dash_cap_style = dash_cap_style.max(0) as u32;
            tm.mesh_config.drop_line_interval_ticks = drop_line_interval_ticks.max(1) as u32;
            tm.mesh_config.flags = flags;
            tm.mesh_config.live_ball_override_active = u32::from(live_ball_override != 0);
            tm.mesh_config.live_ball_three_pos = [live_x, live_y, live_z];
            tm.build_trajectory_mesh(&sim.pred_buffer, sim.pred_count) as i32
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_loadGroundReachabilityLut(
    lut_u16_ptr: *const u16,
    element_count: i32,
    unit_scale_uu: f32,
) -> i32 {
    if lut_u16_ptr.is_null() || element_count <= 0 {
        return 0;
    }
    let slice = unsafe { core::slice::from_raw_parts(lut_u16_ptr, element_count as usize) };
    with_trajectory_mesh(|tm| tm.load_ground_reachability_lut_u16(slice, unit_scale_uu))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReachabilityHeaderPtr() -> *const ReachabilityOutputHeaderPod {
    with_trajectory_mesh(|tm| &tm.reachability_header as *const ReachabilityOutputHeaderPod)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getGroundReachabilityRadiiPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.ground_smoothed_radii.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getGroundReachabilityLinePtr(horizon_idx: i32) -> *const f32 {
    let idx = horizon_idx.clamp(0, (GROUND_HORIZON_COUNT - 1) as i32) as usize;
    with_trajectory_mesh(|tm| tm.ground_line_positions[idx].as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getGroundReachabilityFillPtr(horizon_idx: i32) -> *const f32 {
    with_trajectory_mesh(|tm| match horizon_idx {
        0 => tm.ground_fill0_positions.as_ptr(),
        1 => tm.ground_fill1_positions.as_ptr(),
        _ => tm.ground_fill2_positions.as_ptr(),
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialFunnelPositionsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.funnel_positions.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialFunnelColorsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.funnel_colors.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialFunnelRingLinePtr(horizon_idx: i32) -> *const f32 {
    let idx = horizon_idx.clamp(0, (GROUND_HORIZON_COUNT - 1) as i32) as usize;
    with_trajectory_mesh(|tm| tm.funnel_ring_line_positions[idx].as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialFunnelRailsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.funnel_rail_positions.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialBubblePositionsPtr(horizon_idx: i32) -> *const f32 {
    let idx = horizon_idx.clamp(0, (GROUND_HORIZON_COUNT - 1) as i32) as usize;
    with_trajectory_mesh(|tm| tm.bubble_positions[idx].as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialBubbleColorsPtr(horizon_idx: i32) -> *const f32 {
    let idx = horizon_idx.clamp(0, (GROUND_HORIZON_COUNT - 1) as i32) as usize;
    with_trajectory_mesh(|tm| tm.bubble_colors[idx].as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAerialBubbleRibsPtr(horizon_idx: i32) -> *const f32 {
    let idx = horizon_idx.clamp(0, (GROUND_HORIZON_COUNT - 1) as i32) as usize;
    with_trajectory_mesh(|tm| tm.bubble_rib_positions[idx].as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getInterceptCrossSegmentsPtr() -> *const f32 {
    with_trajectory_mesh(|tm| tm.reachability_header.intercept.cross_segments_three.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_updateReachabilityAndIntercept(
    car_index: i32,
    elapsed_ticks: i32,
    flags: u32,
    cross_arm_length: f32,
) -> i32 {
    with_sim(|sim| {
        with_trajectory_mesh(|tm| {
            tm.update_reachability_and_intercept(
                &sim.state_buffer,
                car_index.max(0) as usize,
                elapsed_ticks,
                flags,
                cross_arm_length,
            ) as i32
        })
    })
}
