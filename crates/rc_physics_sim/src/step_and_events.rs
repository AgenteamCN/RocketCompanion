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
        let ball = *arena.get_ball_state();
        let raw_events: Vec<ArenaEvent> = arena.get_last_step_events().to_vec();
        let boost_big = arena.mutator_config().boost_pad_amount_big;
        let boost_small = arena.mutator_config().boost_pad_amount_small;

        for ev in raw_events {
            match ev {
                ArenaEvent::BallHitWorld(e) => {
                    let speed = ball.vel.length();
                    let normal_rel_vel = ball.vel.dot(e.contact_normal).abs();
                    let dir_dot = if speed > 1e-4 {
                        (normal_rel_vel / speed).clamp(0.0, 1.0)
                    } else {
                        0.0
                    };
                    let pev = PhysicsEvent {
                        event_type: 0x04, // INCIDENT_EVENT_TYPES.BALL_WORLD_HIT
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        norm_x: e.contact_normal.x,
                        norm_y: e.contact_normal.y,
                        norm_z: e.contact_normal.z,
                        normal_rel_vel,
                        speed,
                        impulse: normal_rel_vel,
                        packed_ids: PhysicsEvent::pack_ids(0xFFFF, 0xFFFF),
                        sub_type: 0, // Auto-classified in PhysicsEventReader.classifyBallHitSurface
                        flags: 0,
                        custom_float: dir_dot,
                        custom_int: 0,
                    };
                    self.push_event(pev);
                    self.replay.push_incident(&pev);
                }
                ArenaEvent::CarHitBall(e) => {
                    let slot = self
                        .car_slots
                        .iter()
                        .position(|&id| id == Some(e.car_idx))
                        .map(|s| s as i32)
                        .unwrap_or(e.car_idx as i32);
                    let (team_id, car_vel, flags) = self
                        .arena
                        .as_ref()
                        .map(|a| {
                            let team = a
                                .cars()
                                .get(e.car_idx)
                                .map(|c| if c.team == rocketsim::Team::Blue { 0 } else { 1 })
                                .unwrap_or(0);
                            let st = a.get_car_state(e.car_idx);
                            let mut fl = 0u32;
                            if st.is_supersonic {
                                fl |= 1 << 1;
                            }
                            if st.is_flipping {
                                fl |= 1 << 2;
                            }
                            if st.is_on_ground() {
                                fl |= 1 << 3;
                            }
                            (team, st.vel, fl)
                        })
                        .unwrap_or((0, glam::Vec3A::ZERO, 0));
                    let rel_vel = (ball.vel - car_vel).length().max(e.extra_hit_vel.length());
                    let hit_norm = (ball.pos - e.contact_point).normalize_or_zero();
                    let pev = PhysicsEvent {
                        event_type: 0x01, // INCIDENT_EVENT_TYPES.CAR_BALL_HIT
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        norm_x: hit_norm.x,
                        norm_y: hit_norm.y,
                        norm_z: hit_norm.z,
                        normal_rel_vel: rel_vel,
                        speed: rel_vel,
                        impulse: e.extra_hit_vel.length().max(rel_vel),
                        packed_ids: PhysicsEvent::pack_ids(slot, team_id),
                        sub_type: 0,
                        flags,
                        custom_float: 0.0,
                        custom_int: 0,
                    };
                    if slot >= 0 && (slot as usize) < MAX_CARS {
                        self.possession_car_index = slot;
                        self.state_buffer.possession_team = team_id as f32;
                    }
                    self.push_event(pev);
                    self.replay.push_incident(&pev);
                }
                ArenaEvent::CarHitWorld(_) => {}
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
                    let rel_speed = self
                        .arena
                        .as_ref()
                        .map(|a| {
                            let v1 = a.get_car_state(e.bumper_car_idx).vel;
                            let v2 = a.get_car_state(e.victim_car_idx).vel;
                            (v1 - v2).length()
                        })
                        .unwrap_or(0.0);
                    let pev = PhysicsEvent {
                        event_type: if e.is_demo { 0x03 } else { 0x02 }, // CAR_CAR_DEMO (0x03) / CAR_CAR_BUMP (0x02)
                        tick,
                        pos_x: e.contact_point.x,
                        pos_y: e.contact_point.y,
                        pos_z: e.contact_point.z,
                        normal_rel_vel: rel_speed,
                        speed: rel_speed,
                        impulse: rel_speed,
                        packed_ids: PhysicsEvent::pack_ids(s1, s2),
                        sub_type: u32::from(e.is_demo),
                        flags: 0,
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
                    let (pad_pos, is_big) = self
                        .arena
                        .as_ref()
                        .map(|a| {
                            let cfg = a.get_boost_pad_config(e.boost_pad_idx);
                            (cfg.pos, cfg.is_big)
                        })
                        .unwrap_or((glam::Vec3A::ZERO, false));
                    let pev = PhysicsEvent {
                        event_type: 0x0A, // INCIDENT_EVENT_TYPES.BOOST_PICKUP
                        tick,
                        pos_x: pad_pos.x,
                        pos_y: pad_pos.y,
                        pos_z: pad_pos.z,
                        packed_ids: PhysicsEvent::pack_ids(slot, e.boost_pad_idx as i32),
                        sub_type: u32::from(is_big),
                        custom_float: if is_big { boost_big } else { boost_small },
                        ..Default::default()
                    };
                    self.push_event(pev);
                    self.replay.push_incident(&pev);
                }
                ArenaEvent::CarLanded(_) => {}
            }
        }
    }
}
