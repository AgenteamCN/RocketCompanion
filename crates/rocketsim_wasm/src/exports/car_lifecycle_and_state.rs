use rc_physics_sim::layout::CarConfigC;

use crate::with_sim;

#[unsafe(no_mangle)]
pub extern "C" fn _physics_addCarAtSlot(car_index: i32, team: i32, hitbox_index: i32) -> i32 {
    if car_index < 0 {
        return -1;
    }
    with_sim(|sim| sim.add_car_at_slot(car_index as usize, team, hitbox_index))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_addCar(team: i32, hitbox_index: i32) -> i32 {
    with_sim(|sim| sim.add_car(team, hitbox_index))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_removeCar(car_index: i32) -> i32 {
    if car_index < 0 {
        return 0;
    }
    with_sim(|sim| sim.remove_car(car_index as usize))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getActiveCarMask() -> i32 {
    with_sim(|sim| sim.active_car_mask())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_isCarSlotActive(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| i32::from(sim.car_slots[car_index as usize].is_some()))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getActiveCarCount() -> i32 {
    with_sim(|sim| sim.active_car_count())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarHitbox(car_index: i32, hitbox_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        let slot = car_index as usize;
        let cfg = sim.hitbox_config_from_index(hitbox_index);
        let Some(car_id) = sim.car_slots[slot] else {
            return 0;
        };
        let Some(arena) = sim.arena.as_mut() else {
            return 0;
        };
        sim.car_custom[slot].hitbox_index = hitbox_index;
        sim.car_custom[slot].three_wheels = cfg.three_wheels;
        i32::from(arena.set_car_config(car_id, cfg))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarTeam(car_index: i32, team: i32) -> i32 {
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
        let rs_team = if team == 0 {
            rocketsim::Team::Blue
        } else {
            rocketsim::Team::Orange
        };
        i32::from(arena.set_car_team(car_id, rs_team))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_demolishCar(car_index: i32, respawn_delay: f32) -> i32 {
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
        arena.demolish_car_custom(car_id, respawn_delay);
        sim.sync_state_to_buffer();
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_respawnCar(car_index: i32, seed: i32, boost_amount: f32) -> i32 {
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
        let ok = arena.respawn_car_custom(
            car_id,
            if seed >= 0 { Some(seed as u64) } else { None },
            Some(boost_amount),
        );
        sim.sync_state_to_buffer();
        i32::from(ok)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarCount() -> i32 {
    with_sim(|sim| sim.highest_car_slot_len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarConfig(hitbox_index: i32) -> *const CarConfigC {
    with_sim(|sim| {
        let idx = hitbox_index.clamp(0, 6) as usize;
        &sim.car_config_cache[idx] as *const CarConfigC
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarState(car_index: i32, state_ptr: *const f32) {
    if !(0..8).contains(&car_index) || state_ptr.is_null() {
        return;
    }
    let slice = unsafe { &*(state_ptr as *const [f32; 40]) };
    with_sim(|sim| sim.set_car_state_from_slice(car_index as usize, slice));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setUnlimitedBoost(unlimited: i32) {
    with_sim(|sim| sim.unlimited_boost_global = unlimited != 0);
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getUnlimitedBoost() -> i32 {
    with_sim(|sim| i32::from(sim.unlimited_boost_global))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarUnlimitedBoost(car_index: i32, enabled: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        sim.car_custom[car_index as usize].unlimited_boost = enabled != 0;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarUnlimitedBoost(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| i32::from(sim.car_custom[car_index as usize].unlimited_boost))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarBoostCollectable(car_index: i32, collectable: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        sim.car_custom[car_index as usize].boost_collectable = collectable != 0;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarBoostCollectable(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| i32::from(sim.car_custom[car_index as usize].boost_collectable))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setCarBoostRecharge(
    car_index: i32,
    enabled: i32,
    recharge_per_second: f32,
    recharge_delay: f32,
) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| {
        let c = &mut sim.car_custom[car_index as usize];
        c.recharge_enabled = enabled != 0;
        c.recharge_per_second = recharge_per_second;
        c.recharge_delay = recharge_delay;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarBoostRechargeEnabled(car_index: i32) -> i32 {
    if !(0..8).contains(&car_index) {
        return 0;
    }
    with_sim(|sim| i32::from(sim.car_custom[car_index as usize].recharge_enabled))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarBoostRechargePerSecond(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| sim.car_custom[car_index as usize].recharge_per_second)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getCarBoostRechargeDelay(car_index: i32) -> f32 {
    if !(0..8).contains(&car_index) {
        return 0.0;
    }
    with_sim(|sim| sim.car_custom[car_index as usize].recharge_delay)
}
