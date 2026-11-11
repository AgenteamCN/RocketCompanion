use rc_physics_sim::layout::MutatorConfigC;
use rocketsim::{consts, GameMode, MutatorConfig};

use crate::with_sim;

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarIsJumping(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| i32::from(sim.state_buffer.car_jump_air[car_index as usize].is_jumping > 0.5))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarAirTime(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| sim.state_buffer.car_jump_air[car_index as usize].air_time)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarJumpTime(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| sim.state_buffer.car_jump_air[car_index as usize].jump_time)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarAirTimeSinceJump(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| sim.state_buffer.car_jump_air[car_index as usize].air_time_since_jump)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarLinearFactorAndGravity(
    car_index: i32,
    fx: f32,
    fy: f32,
    fz: f32,
    gravity_scale: f32,
) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        let Some(car_id) = sim.car_slots[car_index as usize] else {
            return 0;
        };
        let Some(arena) = sim.arena.as_mut() else {
            return 0;
        };
        i32::from(arena.set_car_linear_factor_and_gravity(car_id, fx, fy, fz, gravity_scale))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarCollisionMask(
    _car_index: i32,
    _interact_with_ball: i32,
    _interact_with_cars: i32,
) -> i32 {
    1
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setArenaMutators(
    gravity_z: f32,
    boost_accel_ground: f32,
    boost_accel_air: f32,
    ball_max_speed: f32,
    ball_bounciness: f32,
) -> i32 {
    with_sim(|sim| {
        sim.ball_world_restitution = ball_bounciness;
        let Some(arena) = sim.arena.as_mut() else {
            return 0;
        };
        let mut m = *arena.mutator_config();
        m.gravity.z = gravity_z;
        m.boost_accel_ground = boost_accel_ground;
        m.boost_accel_air = boost_accel_air;
        m.ball_max_speed = ball_max_speed;
        arena.set_mutator_config(m);
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getMutatorConfigSize() -> i32 {
    core::mem::size_of::<MutatorConfigC>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getMutatorConfig(out_buffer: *mut MutatorConfigC) -> i32 {
    if out_buffer.is_null() {
        return 0;
    }
    with_sim(|sim| {
        unsafe { *out_buffer = sim.get_mutator_config_c() };
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setMutatorConfig(in_buffer: *const MutatorConfigC) -> i32 {
    if in_buffer.is_null() {
        return 0;
    }
    let cfg = unsafe { &*in_buffer };
    with_sim(|sim| sim.set_mutator_config_c(cfg))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_resetMutatorConfig() -> i32 {
    with_sim(|sim| {
        let Some(arena) = sim.arena.as_mut() else {
            return 0;
        };
        arena.set_mutator_config(MutatorConfig::new(GameMode::Soccar));
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarThreeWheels(car_index: i32, enabled: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        let slot = car_index as usize;
        sim.car_custom[slot].three_wheels = enabled != 0;
        let Some(car_id) = sim.car_slots[slot] else {
            return 0;
        };
        let Some(arena) = sim.arena.as_mut() else {
            return 0;
        };
        i32::from(arena.set_car_three_wheels(car_id, enabled != 0))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarThreeWheels(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| i32::from(sim.car_custom[car_index as usize].three_wheels))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarMaxFlipCount(car_index: i32, max_flip_count: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        sim.car_custom[car_index as usize].max_flip_count = max_flip_count;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarMaxFlipCount(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 1;
    }
    with_sim(|sim| sim.car_custom[car_index as usize].max_flip_count)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarFlipTimerMode(car_index: i32, mode: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        sim.car_custom[car_index as usize].flip_timer_mode = mode;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarFlipTimerMode(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| sim.car_custom[car_index as usize].flip_timer_mode)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarDemoSpawnSelection(car_index: i32, slot_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        sim.car_custom[car_index as usize].demo_spawn_selection = slot_index;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarDemoSpawnSelection(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return -1;
    }
    with_sim(|sim| sim.car_custom[car_index as usize].demo_spawn_selection)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarDemoRespawnTimer(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| {
        let Some(car_id) = sim.car_slots[car_index as usize] else {
            return 0.0;
        };
        let Some(arena) = sim.arena.as_ref() else {
            return 0.0;
        };
        let st = arena.get_car_state(car_id);
        if st.is_demoed {
            st.demo_respawn_timer
        } else {
            0.0
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarFlipsRemaining(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        let slot = car_index as usize;
        let Some(car_id) = sim.car_slots[slot] else {
            return 0;
        };
        let Some(arena) = sim.arena.as_ref() else {
            return 0;
        };
        let st = arena.get_car_state(car_id);
        let max_flips = sim.car_custom[slot].max_flip_count;
        if st.is_on_ground() {
            return max_flips.max(1);
        }
        if !st.has_flip_or_jump() {
            return 0;
        }
        if max_flips <= 0 || max_flips >= 99 {
            return 99;
        }
        (max_flips - sim.car_custom[slot].air_flips_used).max(1)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarFlipWindowTimer(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| {
        let Some(car_id) = sim.car_slots[car_index as usize] else {
            return 0.0;
        };
        let Some(arena) = sim.arena.as_ref() else {
            return 0.0;
        };
        let st = arena.get_car_state(car_id);
        if st.has_flip_or_jump() && !st.is_on_ground() {
            ((consts::car::jump::MAX_TICKS as f32 * consts::TICK_TIME)
                + consts::car::jump::DOUBLEJUMP_MAX_DELAY
                - st.air_time_since_jump)
                .max(0.0)
        } else {
            0.0
        }
    })
}
