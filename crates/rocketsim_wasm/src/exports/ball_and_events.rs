use rc_physics_sim::layout::{BallPredSlicePod, PhysicsEvent, PhysicsEventBuffer};

use crate::with_sim;

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setImpactThresholds(
    _ball_ground: f32,
    _ball_wall: f32,
    _car_ball: f32,
    _cooldown_ticks: i32,
) {
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setSurfaceTaxonomyThresholds(_floor_nz: f32, _net_nz: f32) {}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setDirectionDotThreshold(min_dir_dot: f32) {
    with_sim(|sim| sim.direction_dot_threshold = min_dir_dot);
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getDirectionDotThreshold() -> f32 {
    with_sim(|sim| sim.direction_dot_threshold)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_initBallPrediction(max_seconds: f32) {
    with_sim(|sim| sim.update_ball_prediction(max_seconds));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_updateBallPrediction(max_seconds: f32) {
    with_sim(|sim| sim.update_ball_prediction(max_seconds));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_updateBallPredictionIncremental(max_seconds: f32) {
    with_sim(|sim| sim.update_ball_prediction(max_seconds));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_updateBallPredictionManual(max_seconds: f32, _ticks_since_last: i32) {
    with_sim(|sim| sim.update_ball_prediction(max_seconds));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallStateForTime(pred_time: f32, out_slice9: *mut f32) -> i32 {
    if out_slice9.is_null() {
        return 0;
    }
    with_sim(|sim| {
        if sim.pred_count == 0 {
            return 0;
        }
        let idx = ((pred_time * 120.0).round() as usize).min(sim.pred_count - 1);
        let s = &sim.pred_buffer[idx];
        unsafe {
            let out = core::slice::from_raw_parts_mut(out_slice9, 9);
            out[0..3].copy_from_slice(&s.pos);
            out[3..6].copy_from_slice(&s.vel);
            out[6..9].fill(0.0);
        }
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallPredictionStride() -> i32 {
    6
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallPredictionPtr() -> *const BallPredSlicePod {
    with_sim(|sim| sim.pred_buffer.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallPredictionCount() -> i32 {
    with_sim(|sim| sim.pred_count as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_isBallSleeping() -> i32 {
    with_sim(|sim| {
        sim.arena
            .as_ref()
            .map(|a| i32::from(a.is_ball_sleeping()))
            .unwrap_or(0)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallOnGround() -> i32 {
    with_sim(|sim| {
        let Some(arena) = sim.arena.as_ref() else {
            return 0;
        };
        let b = arena.get_ball_state();
        let r = arena.mutator_config().ball_radius;
        i32::from((b.pos.z - r) <= 8.0 && b.vel.z.abs() <= 50.0)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallRadius() -> f32 {
    with_sim(|sim| {
        sim.arena
            .as_ref()
            .map(|a| a.mutator_config().ball_radius)
            .unwrap_or(91.25)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBallMotionState() -> i32 {
    with_sim(|sim| sim.state_buffer.ball_motion_state as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setBallState(state_ptr: *const f32) {
    if state_ptr.is_null() {
        return;
    }
    let slice = unsafe { &*(state_ptr as *const [f32; 18]) };
    with_sim(|sim| sim.set_ball_state_from_slice(slice));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setPossessionReportingEnabled(enabled: i32) {
    with_sim(|sim| sim.possession_reporting_enabled = enabled != 0);
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getPossessionStats(
    out_team: *mut i32,
    out_blue_points: *mut f32,
    out_orange_points: *mut f32,
    out_time: *mut f32,
) {
    with_sim(|sim| unsafe {
        if !out_team.is_null() {
            *out_team = sim.state_buffer.possession_team as i32;
        }
        if !out_blue_points.is_null() {
            *out_blue_points = sim.state_buffer.blue_possession_points;
        }
        if !out_orange_points.is_null() {
            *out_orange_points = sim.state_buffer.orange_possession_points;
        }
        if !out_time.is_null() {
            *out_time = sim.state_buffer.possession_time_accumulator;
        }
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setPossessionEventEnabled(enabled: i32) {
    with_sim(|sim| sim.possession_event_enabled = enabled != 0);
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getPossessionEventEnabled() -> i32 {
    with_sim(|sim| i32::from(sim.possession_event_enabled))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCurrentPossessionCar() -> i32 {
    with_sim(|sim| sim.state_buffer.possession_car_index as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCurrentPossessionTeam() -> i32 {
    with_sim(|sim| sim.state_buffer.possession_team as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_pushSignalEvent(
    event_type: i32,
    tick: i32,
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    norm_x: f32,
    norm_y: f32,
    norm_z: f32,
    primary_id: i32,
    secondary_id: i32,
    sub_type: i32,
    flags: i32,
    custom_float: f32,
    custom_int: i32,
) {
    with_sim(|sim| {
        let ev = PhysicsEvent {
            event_type: event_type as u32,
            tick: tick as u32,
            pos_x,
            pos_y,
            pos_z,
            norm_x,
            norm_y,
            norm_z,
            vel_x: 0.0,
            vel_y: 0.0,
            vel_z: 0.0,
            primary_id,
            secondary_id,
            sub_type: sub_type as u8,
            flags: flags as u8,
            reserved: 0,
            custom_float,
            custom_int,
        };
        sim.push_event(ev);
        sim.replay.push_signal(&ev);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getEventBufferPtr() -> *const PhysicsEventBuffer {
    with_sim(|sim| &sim.event_buffer as *const PhysicsEventBuffer)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getEventBufferSize() -> i32 {
    core::mem::size_of::<PhysicsEventBuffer>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_clearEvents() {
    with_sim(|sim| {
        sim.event_buffer.count = 0;
        sim.event_buffer.dropped_count = 0;
    });
}
