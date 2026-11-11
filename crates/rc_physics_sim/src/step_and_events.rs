use rocketsim::{ArenaEvent, CarControls};

use crate::{
    layout::{PhysicsEvent, MAX_CARS},
    sim_instance::SimInstance,
};

impl SimInstance {
    pub fn step(&mut self, ticks_to_simulate: i32, silent: bool) {
        if self.arena.is_none() || ticks_to_simulate <= 0 {
            return;
        }

        for _ in 0..ticks_to_simulate {
            if self.sim_frozen {
                let current_tick = self
                    .arena
                    .as_ref()
                    .map(|a| a.tick_count() as u32)
                    .unwrap_or(0);
                if self.target_resume_tick > 0 && current_tick >= self.target_resume_tick {
                    self.sim_frozen = false;
                } else {
                    self.sync_state_to_buffer();
                    return;
                }
            }

            for slot in 0..MAX_CARS {
                let Some(car_id) = self.car_slots[slot] else {
                    continue;
                };
                let hb_idx = self.car_custom[slot].hitbox_index.clamp(0, 6) as usize;
                let cached_f = self.car_config_cache[hb_idx].front_wheels.suspension_rest_length;
                let cached_b = self.car_config_cache[hb_idx].back_wheels.suspension_rest_length;
                let needs_sync = self.arena.as_ref().is_some_and(|a| {
                    let cfg = a.get_car_info(car_id).config;
                    (cfg.front_wheels.suspension_rest_length - cached_f).abs() > 1e-5
                        || (cfg.back_wheels.suspension_rest_length - cached_b).abs() > 1e-5
                });
                if needs_sync {
                    let new_cfg = self.hitbox_config_from_index(self.car_custom[slot].hitbox_index);
                    if let Some(arena) = self.arena.as_mut() {
                        arena.set_car_config(car_id, new_cfg);
                    }
                }
            }

            if let Some(arena) = self.arena.as_mut() {
                for slot in 0..MAX_CARS {
                    let Some(car_id) = self.car_slots[slot] else {
                        continue;
                    };
                    let c = &self.controls_buffer[slot];
                    let controls = CarControls {
                        throttle: c.throttle,
                        steer: c.steer,
                        pitch: c.pitch,
                        yaw: c.yaw,
                        roll: c.roll,
                        jump: c.jump >= 0.5,
                        boost: c.boost >= 0.5,
                        handbrake: c.handbrake >= 0.5,
                    };
                    arena.set_car_controls(car_id, controls);
                }

                let _ = arena.step_tick();

                for slot in 0..MAX_CARS {
                    let Some(car_id) = self.car_slots[slot] else {
                        continue;
                    };
                    let custom = &self.car_custom[slot];
                    if self.unlimited_boost_global || custom.unlimited_boost {
                        let st = *arena.get_car_state(car_id);
                        if st.boost < 100.0 {
                            arena.set_car_boost(car_id, 100.0);
                        }
                    } else if custom.recharge_enabled {
                        let st = *arena.get_car_state(car_id);
                        if st.boosting_time <= 0.0 && st.boost < 100.0 {
                            let new_boost = (st.boost + custom.recharge_per_second / 120.0).min(100.0);
                            arena.set_car_boost(car_id, new_boost);
                        }
                    }
                }
            }

            if !silent {
                self.drain_arena_events();
            }

            self.sync_state_to_buffer();

            if !silent && self.replay.header.recording_active != 0 {
                let st_copy = self.state_buffer;
                let ctrl_copy = self.controls_buffer;
                self.replay.record_frame(&st_copy, &ctrl_copy);
            }
        }
    }

    pub(crate) fn drain_arena_events(&mut self) {
        let Some(arena) = self.arena.as_ref() else {
            return;
        };
        let tick = arena.tick_count() as u32;
        let raw_events: Vec<ArenaEvent> = arena.get_last_step_events().to_vec();
        let boost_big = arena.mutator_config().boost_pad_amount_big;
        let boost_small = arena.mutator_config().boost_pad_amount_small;

        for ev in raw_events {
            match ev {
                ArenaEvent::BallHitWorld(e) => {
                    let nz = e.contact_normal.z;
                    let sub_type = if nz > 0.7 {
                        1
                    } else if nz < -0.7 {
                        2
                    } else {
                        3
                    };
                    let pev = PhysicsEvent {
                        event_type: 1,
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        norm_x: e.contact_normal.x,
                        norm_y: e.contact_normal.y,
                        norm_z: e.contact_normal.z,
                        primary_id: -1,
                        secondary_id: -1,
                        sub_type,
                        ..Default::default()
                    };
                    self.push_event(pev);
                }
                ArenaEvent::CarHitBall(e) => {
                    let slot = self
                        .car_slots
                        .iter()
                        .position(|&id| id == Some(e.car_idx))
                        .map(|s| s as i32)
                        .unwrap_or(e.car_idx as i32);
                    let pev = PhysicsEvent {
                        event_type: 2,
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        vel_x: e.extra_hit_vel.x,
                        vel_y: e.extra_hit_vel.y,
                        vel_z: e.extra_hit_vel.z,
                        primary_id: slot,
                        secondary_id: -1,
                        ..Default::default()
                    };
                    if slot >= 0 && (slot as usize) < MAX_CARS {
                        self.state_buffer.possession_car_index = slot as f32;
                    }
                    self.push_event(pev);
                    self.replay.push_incident(&pev);
                }
                ArenaEvent::CarHitWorld(e) => {
                    let slot = self
                        .car_slots
                        .iter()
                        .position(|&id| id == Some(e.car_idx))
                        .map(|s| s as i32)
                        .unwrap_or(e.car_idx as i32);
                    let pev = PhysicsEvent {
                        event_type: 3,
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        norm_x: e.contact_normal.x,
                        norm_y: e.contact_normal.y,
                        norm_z: e.contact_normal.z,
                        primary_id: slot,
                        secondary_id: -1,
                        ..Default::default()
                    };
                    self.push_event(pev);
                }
                ArenaEvent::CarHitCar(e) => {
                    let s1 = self
                        .car_slots
                        .iter()
                        .position(|&id| id == Some(e.bumper_car_idx))
                        .map(|s| s as i32)
                        .unwrap_or(e.bumper_car_idx as i32);
                    let s2 = self
                        .car_slots
                        .iter()
                        .position(|&id| id == Some(e.victim_car_idx))
                        .map(|s| s as i32)
                        .unwrap_or(e.victim_car_idx as i32);
                    let pev = PhysicsEvent {
                        event_type: if e.is_demo { 5 } else { 4 },
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        primary_id: s1,
                        secondary_id: s2,
                        flags: u8::from(e.is_demo),
                        ..Default::default()
                    };
                    self.push_event(pev);
                    self.replay.push_incident(&pev);
                }
                ArenaEvent::CarPickupBoost(e) => {
                    let slot = self
                        .car_slots
                        .iter()
                        .position(|&id| id == Some(e.car_idx))
                        .map(|s| s as i32)
                        .unwrap_or(e.car_idx as i32);
                    let is_big = self
                        .arena
                        .as_ref()
                        .map(|a| a.get_boost_pad_config(e.boost_pad_idx).is_big)
                        .unwrap_or(false);
                    let pev = PhysicsEvent {
                        event_type: 6,
                        tick,
                        primary_id: slot,
                        secondary_id: e.boost_pad_idx as i32,
                        custom_float: if is_big { boost_big } else { boost_small },
                        ..Default::default()
                    };
                    self.push_event(pev);
                }
                ArenaEvent::CarLanded(_) => {}
            }
        }
    }
}
