use rc_physics_sim::{
    layout::CarControlsPod,
    reconciler::{ReconcileControlEntryPod, ReconcileOutcomePod, CONTROLS_RING_CAPACITY},
};

use crate::with_sim;

#[unsafe(no_mangle)]
pub extern "C" fn _physics_clearReconcilerHistory() {
    with_sim(|sim| sim.clear_reconciler_history());
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReconcilerControlsRingPtr() -> *mut u8 {
    with_sim(|sim| sim.reconciler.controls_ring.as_mut_ptr() as *mut u8)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReconcilerControlsRingCapacity() -> i32 {
    CONTROLS_RING_CAPACITY as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReconcilerControlsEntryStride() -> i32 {
    core::mem::size_of::<ReconcileControlEntryPod>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReconcilerOutcomePtr() -> *const u8 {
    with_sim(|sim| (&sim.reconciler.last_outcome as *const ReconcileOutcomePod) as *const u8)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setReconcilerTickControls(
    tick: i32,
    car_index: i32,
    throttle: f32,
    steer: f32,
    pitch: f32,
    yaw: f32,
    roll: f32,
    jump: f32,
    boost: f32,
    handbrake: f32,
) {
    if car_index < 0 {
        return;
    }
    with_sim(|sim| {
        sim.reconciler.set_tick_controls(
            tick,
            car_index as usize,
            CarControlsPod {
                throttle,
                steer,
                pitch,
                yaw,
                roll,
                jump,
                boost,
                handbrake,
            },
        );
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setReconcilerRemoteControls(
    car_index: i32,
    throttle: f32,
    steer: f32,
    pitch: f32,
    yaw: f32,
    roll: f32,
    jump: f32,
    boost: f32,
    handbrake: f32,
) {
    if car_index < 0 {
        return;
    }
    with_sim(|sim| {
        sim.set_reconciler_remote_controls(
            car_index as usize,
            CarControlsPod {
                throttle,
                steer,
                pitch,
                yaw,
                roll,
                jump,
                boost,
                handbrake,
            },
        );
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_reconcileRollbackToTick(
    server_tick: i32,
    target_client_tick: i32,
    local_car_index: i32,
    kickoff_mask_until_tick: i32,
    authoritative_state_ptr: *const f32,
    float_count: i32,
) -> i32 {
    let auth_slice = if !authoritative_state_ptr.is_null() && float_count >= 410 {
        Some(unsafe { core::slice::from_raw_parts(authoritative_state_ptr, float_count as usize) })
    } else {
        None
    };
    with_sim(|sim| {
        sim.reconcile_rollback_to_tick(
            server_tick,
            target_client_tick,
            local_car_index,
            kickoff_mask_until_tick,
            auth_slice,
        )
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_stepReconcilerRange(
    from_tick: i32,
    to_tick: i32,
    local_car_index: i32,
    kickoff_mask_until_tick: i32,
    silent: i32,
) -> i32 {
    with_sim(|sim| {
        sim.step_reconciler_range(
            from_tick,
            to_tick,
            local_car_index,
            kickoff_mask_until_tick,
            silent != 0,
        )
    })
}
