use glam::{EulerRot, Mat3A, Vec3A};
use rc_physics_sim::{
    layout::{GameStateBufferPod, MAX_CARS},
    sim_instance::SavedSlotSnapshot,
};
use rocketsim::{consts, BallState, CarCore, CarState, PhysState};

use crate::with_sim;

#[unsafe(no_mangle)]
pub extern "C" fn _physics_init(
    mesh_data: *const u8,
    mesh_sizes: *const i32,
    chunk_count: i32,
) -> i32 {
    if mesh_data.is_null() || mesh_sizes.is_null() || chunk_count <= 0 {
        return 0;
    }
    let count = chunk_count as usize;
    let mut slices = Vec::with_capacity(count);
    unsafe {
        let sizes = core::slice::from_raw_parts(mesh_sizes, count);
        let mut offset = 0usize;
        for &sz in sizes {
            if sz <= 0 {
                return 0;
            }
            let len = sz as usize;
            slices.push(core::slice::from_raw_parts(mesh_data.add(offset), len));
            offset += len;
        }
    }
    match rocketsim::init_or_reload_soccar_from_slices(&slices) {
        Ok(()) => 1,
        Err(_) => 0,
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_createArena() -> i32 {
    with_sim(|sim| sim.create_arena())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_step(ticks: i32) {
    with_sim(|sim| sim.step(ticks, false));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_stepSilent(ticks: i32) {
    with_sim(|sim| sim.step(ticks, true));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getStateSnapshotSize() -> i32 {
    core::mem::size_of::<GameStateBufferPod>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_saveState(out_buffer: *mut f32) -> i32 {
    if out_buffer.is_null() {
        return 0;
    }
    with_sim(|sim| {
        sim.sync_state_to_buffer();
        unsafe {
            let src = (&sim.state_buffer as *const GameStateBufferPod) as *const f32;
            core::ptr::copy_nonoverlapping(src, out_buffer, 448);
        }
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_restoreState(in_buffer: *const f32) -> i32 {
    if in_buffer.is_null() {
        return 0;
    }
    let slice = unsafe { core::slice::from_raw_parts(in_buffer, 448) };
    with_sim(|sim| sim.restore_compact_state(slice))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_restoreCompactState(in_buffer: *const f32, float_count: i32) -> i32 {
    if in_buffer.is_null() || float_count < 410 {
        return 0;
    }
    let slice = unsafe { core::slice::from_raw_parts(in_buffer, float_count as usize) };
    with_sim(|sim| sim.restore_compact_state(slice))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_saveStateSlot(slot: i32) -> i32 {
    if !(0..8).contains(&slot) {
        return 0;
    }
    with_sim(|sim| {
        let Some(arena) = sim.arena.as_ref() else {
            return 0;
        };
        sim.saved_slots[slot as usize] = Some(SavedSlotSnapshot {
            arena: arena.clone(),
            car_slots: sim.car_slots,
            car_custom: sim.car_custom,
            state_buffer: sim.state_buffer,
        });
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_restoreStateSlot(slot: i32) -> i32 {
    if !(0..8).contains(&slot) {
        return 0;
    }
    with_sim(|sim| {
        let Some(saved) = sim.saved_slots[slot as usize].as_ref() else {
            return 0;
        };
        sim.arena = Some(saved.arena.clone());
        sim.car_slots = saved.car_slots;
        sim.car_custom = saved.car_custom;
        sim.state_buffer = saved.state_buffer;
        sim.sync_state_to_buffer();
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_resetKickoff(seed: i32) {
    with_sim(|sim| {
        if let Some(arena) = sim.arena.as_mut() {
            arena.reset_to_random_kickoff(if seed >= 0 { Some(seed as u64) } else { None });
            sim.state_buffer.header.goal_scored_flag = 0.0;
        }
        sim.sync_state_to_buffer();
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_resetKickoffAtSpawn(spawn_index: i32, settle_ticks: i32) -> i32 {
    with_sim(|sim| {
        let Some(arena) = sim.arena.as_mut() else {
            return 0;
        };
        arena.set_ball_state(BallState::DEFAULT);
        let spawns = consts::car::spawn::get_kickoff_spawn_locations(rocketsim::GameMode::Soccar);
        let idx = (spawn_index.max(0) as usize) % spawns.len();
        let spawn_boost = arena.mutator_config().car_spawn_boost_amount;
        for slot in 0..MAX_CARS {
            let Some(car_id) = sim.car_slots[slot] else {
                continue;
            };
            let Some(car_obj) = arena.cars().get(car_id) else {
                continue;
            };
            let team = car_obj.team;
            let sp = spawns[(idx + slot) % spawns.len()];
            let phys = PhysState {
                pos: Vec3A::new(sp.x, sp.y * -team.get_y_dir(), consts::car::spawn::REST_Z),
                rot_mat: Mat3A::from_euler(
                    EulerRot::ZYX,
                    sp.yaw_ang
                        + if team == rocketsim::Team::Blue {
                            0.0
                        } else {
                            core::f32::consts::PI
                        },
                    0.0,
                    0.0,
                ),
                vel: Vec3A::ZERO,
                ang_vel: Vec3A::ZERO,
            };
            let st = CarState::from(CarCore::grounded(phys, spawn_boost));
            arena.set_car_state_full(car_id, st);
        }
        if settle_ticks > 0 {
            for _ in 0..(settle_ticks as usize) {
                let _ = arena.step_tick();
            }
        }
        sim.state_buffer.header.goal_scored_flag = 0.0;
        sim.sync_state_to_buffer();
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_resetGoalLatch() {
    with_sim(|sim| {
        sim.state_buffer.header.goal_scored_flag = 0.0;
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_clearGoalFlag() {
    with_sim(|sim| {
        sim.state_buffer.header.goal_scored_flag = 0.0;
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getStatePtr() -> *const f32 {
    with_sim(|sim| (&sim.state_buffer as *const GameStateBufferPod) as *const f32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getStateSize() -> i32 {
    448
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getControlsPtr() -> *mut f32 {
    with_sim(|sim| sim.controls_buffer.as_mut_ptr() as *mut f32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getPadInfoPtr() -> *const f32 {
    with_sim(|sim| sim.pad_info_buffer.as_ptr() as *const f32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setSimulationFrozen(
    frozen: i32,
    target_resume_tick: i32,
    mask_inputs: i32,
) {
    with_sim(|sim| {
        sim.sim_frozen = frozen != 0;
        sim.target_resume_tick = target_resume_tick.max(0) as u32;
        sim.mask_inputs_while_frozen = mask_inputs != 0;
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setSimControlFlags(flags: i32) {
    with_sim(|sim| sim.sim_control_flags = flags as u32);
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getSimControlFlags() -> i32 {
    with_sim(|sim| sim.sim_control_flags as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setArenaPreset(preset_index: i32) {
    with_sim(|sim| sim.arena_preset = preset_index);
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getArenaPreset() -> i32 {
    with_sim(|sim| sim.arena_preset)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setGoalVolumeBox(
    enabled: i32,
    half_width_x: f32,
    min_y: f32,
    max_y: f32,
    max_z: f32,
) {
    with_sim(|sim| {
        sim.goal_box_enabled = enabled != 0;
        sim.goal_box_half_x = half_width_x;
        sim.goal_box_min_y = min_y;
        sim.goal_box_max_y = max_y;
        sim.goal_box_max_z = max_z;
    });
}
