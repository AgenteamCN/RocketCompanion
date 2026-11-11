//! Physics ring-buffer consumer and world/ball/collision/goal impact cue synthesizers
//! (`0x01`..`0x05`, `0x0A`, `0x0E`) for `AudioDirectorInstance`.

use rc_physics_sim::{
    layout::{PhysicsEvent, MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

use crate::{
    director::AudioDirectorInstance,
    pod_types::{edge_mask_bits, AudioOneShotSlotPod},
};

impl AudioDirectorInstance {
    pub(crate) fn consume_event_buffer(&mut self, sim: &SimInstance, current_tick: u32) {
        let write_seq = sim.event_buffer.write_seq;
        let capacity = (sim.event_buffer.capacity as usize).clamp(1, 256);
        let available = write_seq.saturating_sub(self.last_event_read_seq);
        if available == 0 {
            return;
        }
        if available as usize > capacity {
            self.last_event_read_seq = write_seq.saturating_sub(capacity as u32);
        }
        while self.last_event_read_seq < write_seq {
            let slot_idx = (self.last_event_read_seq as usize) % capacity;
            let ev = sim.event_buffer.events[slot_idx];
            self.last_event_read_seq = self.last_event_read_seq.wrapping_add(1);
            self.process_physics_event(&ev, current_tick);
        }
    }

    fn process_physics_event(&mut self, ev: &PhysicsEvent, current_tick: u32) {
        let ev_type = ev.event_type;
        if ev_type == 0 || ev_type > 0x3F {
            return;
        }
        let primary_id = (ev.packed_ids & 0xFFFF) as u32;
        let secondary_id = ((ev.packed_ids >> 16) & 0xFFFF) as u32;
        let car_idx = if primary_id == 0xFFFF {
            0
        } else {
            primary_id.min((MAX_CARS - 1) as u32) as usize
        };

        let active_car = self.listener_pod.active_car_index;
        let is_lobby_dual = (self.listener_pod.flags & (1 << 3)) != 0;
        let test_probe_enabled = (self.listener_pod.flags & (1 << 4)) != 0;

        if primary_id != 0xFFFF {
            if (car_idx == 6 || car_idx == 7) && !test_probe_enabled {
                return;
            }
            if is_lobby_dual && (car_idx as i32) != active_car && car_idx != 6 && car_idx != 7 {
                return;
            }
        }

        let lx = self.listener_pod.pos_uu[0];
        let ly = self.listener_pod.pos_uu[1];
        let lz = self.listener_pod.pos_uu[2];
        let dist_uu =
            ((ev.pos_x - lx).powi(2) + (ev.pos_y - ly).powi(2) + (ev.pos_z - lz).powi(2)).sqrt();
        let audio_pos = [ev.pos_x * 0.01, ev.pos_z * 0.01, ev.pos_y * 0.01];
        let ev_tick = if ev.tick > 0 { ev.tick } else { current_tick };

        match ev_type {
            0x01 => self.handle_car_ball_hit(ev, car_idx, ev_tick, dist_uu, audio_pos),
            0x02 => self.handle_car_car_bump(ev, car_idx, ev_tick, dist_uu, audio_pos),
            0x03 => self.handle_car_demo(car_idx, secondary_id, ev_tick, dist_uu, audio_pos),
            0x04 | 0x05 => self.handle_ball_world_or_post_hit(ev, ev_type, ev_tick, dist_uu, audio_pos),
            0x06..=0x08 => self.handle_car_jump_family(ev, ev_type, car_idx, ev_tick, dist_uu, audio_pos),
            0x09 => self.handle_car_supersonic_enter(car_idx, ev_tick, dist_uu, audio_pos),
            0x0A => self.handle_boost_pickup(ev, car_idx, secondary_id, ev_tick, dist_uu, audio_pos),
            0x0C | 0x0D => self.handle_car_boost_edge(ev_type, car_idx, ev_tick, dist_uu, audio_pos),
            0x0E => self.handle_goal_scored(primary_id, ev_tick, dist_uu, audio_pos),
            0x0F => self.handle_flip_reset_gained(ev, car_idx, ev_tick, dist_uu, audio_pos),
            _ => {}
        }
    }

    fn handle_car_ball_hit(
        &mut self,
        ev: &PhysicsEvent,
        car_idx: usize,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let impulse = ev.impulse.max(ev.speed);
        if impulse < self.config_pod.car_ball_hit_impulse_threshold {
            return;
        }
        let cd_ticks =
            ((self.config_pod.car_ball_hit_cooldown_ms / 1000.0) * 120.0).round() as u32;
        if self.last_car_ball_hit_tick != u32::MAX
            && ev_tick.saturating_sub(self.last_car_ball_hit_tick) < cd_ticks.max(1)
        {
            return;
        }
        self.last_car_ball_hit_tick = ev_tick;

        let (atten, culled) = self.evaluate_attenuation(3, dist_uu);
        if culled {
            return;
        }
        let norm_force = ((impulse - 80.0) / 2320.0).clamp(0.15, 1.0);
        let is_super_or_flip = (ev.flags & ((1 << 1) | (1 << 2))) != 0 || impulse >= 1450.0;
        let gain = (norm_force.powf(0.65)
            * atten
            * self.config_pod.car_ball_hit_volume
            * self.config_pod.ball_collision_volume
            * self.config_pod.master_volume)
            .clamp(0.0, 2.0);
        let rate = (0.94 + norm_force * 0.14 + (self.next_rand_f32() - 0.5) * 0.05).clamp(0.85, 1.25);
        let variant = self.select_variation(1, 4);
        if gain > self.cue_pod.primary_impact_gain {
            self.cue_pod.primary_impact_gain = gain;
            self.cue_pod.primary_impact_pitch = rate;
            self.cue_pod.primary_impact_pos = [ev.pos_x, ev.pos_y, ev.pos_z];
        }
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x01,
            sub_type: u32::from(is_super_or_flip),
            car_index: car_idx as u32,
            priority_and_variant: 85 | (variant << 8),
            final_gain: gain,
            playback_rate: rate,
            distance_radius_scale: 0.75 + 0.75 * norm_force,
            pan_or_intensity: norm_force,
            audio_pos_meters: audio_pos,
            category_index: 3,
        });
    }

    fn handle_car_car_bump(
        &mut self,
        ev: &PhysicsEvent,
        car_idx: usize,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let speed = ev.speed.max(ev.impulse);
        if speed < 180.0 {
            return;
        }
        let cd_ticks = ((self.config_pod.incident_cooldown_ms / 1000.0) * 120.0).round() as u32;
        if self.last_car_bump_global_tick != u32::MAX
            && ev_tick.saturating_sub(self.last_car_bump_global_tick) < cd_ticks.max(4)
        {
            return;
        }
        self.last_car_bump_global_tick = ev_tick;
        let (atten, culled) = self.evaluate_attenuation(4, dist_uu);
        if culled {
            return;
        }
        let intensity = ((speed - 180.0) / 1820.0).clamp(0.2, 1.0);
        let gain = (intensity
            * atten
            * self.config_pod.car_car_collision_volume
            * self.config_pod.master_volume)
            .clamp(0.0, 1.8);
        let rate = 0.94 + self.next_rand_f32() * 0.12;
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x02,
            sub_type: 0,
            car_index: car_idx as u32,
            priority_and_variant: 75,
            final_gain: gain,
            playback_rate: rate,
            distance_radius_scale: 0.75 + 0.5 * intensity,
            pan_or_intensity: intensity,
            audio_pos_meters: audio_pos,
            category_index: 4,
        });
    }

    fn handle_car_demo(
        &mut self,
        car_idx: usize,
        secondary_id: u32,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let victim = (secondary_id as usize).min(MAX_CARS - 1);
        let last_t = self.last_car_demo_tick[victim];
        if last_t != u32::MAX && ev_tick.saturating_sub(last_t) < 12 {
            return;
        }
        self.last_car_demo_tick[victim] = ev_tick;
        let (atten, culled) = self.evaluate_attenuation(0, dist_uu);
        if culled {
            return;
        }
        let gain = (atten * self.config_pod.car_demo_volume * self.config_pod.master_volume)
            .clamp(0.0, 2.0);
        let variant = self.select_variation(3, 5);
        let rate = 0.96 + self.next_rand_f32() * 0.08;
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x03,
            sub_type: 1,
            car_index: car_idx as u32,
            priority_and_variant: 98 | (variant << 8),
            final_gain: gain,
            playback_rate: rate,
            distance_radius_scale: 1.35,
            pan_or_intensity: 1.0,
            audio_pos_meters: audio_pos,
            category_index: 0,
        });
    }

    fn handle_ball_world_or_post_hit(
        &mut self,
        ev: &PhysicsEvent,
        ev_type: u32,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let sub = if ev.sub_type != 0 {
            ev.sub_type
        } else {
            classify_ball_surface(ev.pos_x, ev.pos_y, ev.pos_z, ev.norm_z, ev_type == 0x05)
        };
        let is_post_or_bar = ev_type == 0x05 || sub == 8 || sub == 9;
        let normal_speed = ev.normal_rel_vel.max(ev.impulse);
        let master = self.config_pod.master_volume;

        if is_post_or_bar {
            if normal_speed < self.config_pod.goalpost_hit_threshold {
                return;
            }
            let cd_ticks =
                ((self.config_pod.goalpost_hit_cooldown_ms / 1000.0) * 120.0).round() as u32;
            if self.last_goalpost_hit_tick != u32::MAX
                && ev_tick.saturating_sub(self.last_goalpost_hit_tick) < cd_ticks.max(1)
            {
                return;
            }
            self.last_goalpost_hit_tick = ev_tick;
            let is_large_ping = normal_speed >= 950.0 || sub == 9;
            let cat_idx = if is_large_ping { 2 } else { 5 };
            let (atten, culled) = self.evaluate_attenuation(cat_idx, dist_uu);
            if culled {
                return;
            }
            let vol = if is_large_ping {
                self.config_pod.goalpost_hit_volume
            } else {
                self.config_pod.goalpost_small_hit_volume
            };
            let intensity = ((normal_speed - 140.0) / 1860.0).clamp(0.25, 1.0);
            let gain = (intensity * atten * vol * master).clamp(0.0, 2.0);
            let variant = self.select_variation(if is_large_ping { 4 } else { 5 }, 6);
            let rate = 0.97 + self.next_rand_f32() * 0.06;
            if is_large_ping {
                self.cue_pod.one_shot_edge_mask_hi |= 1u32 << edge_mask_bits::BALL_GOALPOST_LARGE_BIT;
            }
            self.push_one_shot(AudioOneShotSlotPod {
                event_type: 0x05,
                sub_type: if is_large_ping { 9 } else { 8 },
                car_index: 0xFFFF,
                priority_and_variant: 90 | (variant << 8),
                final_gain: gain,
                playback_rate: rate,
                distance_radius_scale: if is_large_ping { 1.25 } else { 0.95 },
                pan_or_intensity: intensity,
                audio_pos_meters: audio_pos,
                category_index: cat_idx as u32,
            });
        } else {
            let threshold = if sub == 1 {
                self.config_pod.ball_ground_hit_threshold
            } else {
                self.config_pod.ball_wall_hit_threshold
            };
            if normal_speed < threshold {
                return;
            }
            if self.last_ball_world_hit_tick != u32::MAX
                && ev_tick.saturating_sub(self.last_ball_world_hit_tick) < 5
            {
                return;
            }
            self.last_ball_world_hit_tick = ev_tick;
            let (atten, culled) = self.evaluate_attenuation(11, dist_uu);
            if culled {
                return;
            }
            let surface_vol = match sub {
                1 => self.config_pod.ball_floor_hit_volume,
                7 => self.config_pod.ball_ramp_hit_volume,
                _ => self.config_pod.ball_net_hit_volume,
            };
            let intensity = ((normal_speed - threshold) / 1660.0).clamp(0.12, 1.0);
            let gain = (intensity
                * atten
                * surface_vol
                * self.config_pod.ball_collision_volume
                * master)
                .clamp(0.0, 1.8);
            let variant = self.select_variation(6, 5);
            let rate = 0.94 + self.next_rand_f32() * 0.12;
            let bit = if sub == 1 {
                edge_mask_bits::BALL_FLOOR_HIT_BIT
            } else {
                edge_mask_bits::BALL_WALL_NET_HIT_BIT
            };
            self.cue_pod.one_shot_edge_mask_hi |= 1u32 << bit;
            self.push_one_shot(AudioOneShotSlotPod {
                event_type: 0x04,
                sub_type: sub,
                car_index: 0xFFFF,
                priority_and_variant: 60 | (variant << 8),
                final_gain: gain,
                playback_rate: rate,
                distance_radius_scale: 0.75 + 0.5 * intensity,
                pan_or_intensity: intensity,
                audio_pos_meters: audio_pos,
                category_index: 11,
            });
        }
    }

    fn handle_boost_pickup(
        &mut self,
        ev: &PhysicsEvent,
        car_idx: usize,
        secondary_id: u32,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let pad_idx = (secondary_id as usize).min(MAX_PADS - 1);
        let last_t = self.last_pad_pickup_tick[pad_idx];
        if last_t != u32::MAX && ev_tick.saturating_sub(last_t) < 6 {
            return;
        }
        self.last_pad_pickup_tick[pad_idx] = ev_tick;
        let is_local = (car_idx as i32) == self.listener_pod.active_car_index;
        let (atten, culled) = if is_local {
            (1.0, false)
        } else {
            self.evaluate_attenuation(12, dist_uu)
        };
        if culled {
            return;
        }
        let is_big = ev.sub_type == 1 || secondary_id < 6;
        let gain = (atten
            * self.config_pod.boost_collect_volume
            * (if is_big { 1.0 } else { 0.82 })
            * self.config_pod.master_volume)
            .clamp(0.0, 1.8);
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x0A,
            sub_type: u32::from(is_big),
            car_index: car_idx as u32,
            priority_and_variant: 55 | ((secondary_id & 0xFF) << 8),
            final_gain: gain,
            playback_rate: if is_big { 1.0 } else { 1.08 },
            distance_radius_scale: 1.0,
            pan_or_intensity: if is_big { 1.0 } else { 0.7 },
            audio_pos_meters: audio_pos,
            category_index: 12,
        });
    }

    fn handle_goal_scored(
        &mut self,
        primary_id: u32,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        if self.last_goal_scored_tick != u32::MAX
            && ev_tick.saturating_sub(self.last_goal_scored_tick) < 120
        {
            return;
        }
        self.last_goal_scored_tick = ev_tick;
        let (atten, culled) = self.evaluate_attenuation(1, dist_uu);
        if culled {
            return;
        }
        let gain = (atten * self.config_pod.goal_scored_volume * self.config_pod.master_volume)
            .clamp(0.0, 2.0);
        self.cue_pod.one_shot_edge_mask_hi |= 1u32 << edge_mask_bits::GOAL_EXPLOSION_BIT;
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x0E,
            sub_type: primary_id,
            car_index: 0xFFFF,
            priority_and_variant: 100,
            final_gain: gain,
            playback_rate: 1.0,
            distance_radius_scale: 1.5,
            pan_or_intensity: 1.0,
            audio_pos_meters: audio_pos,
            category_index: 1,
        });
    }
}

#[inline]
fn classify_ball_surface(x: f32, y: f32, z: f32, nz: f32, is_goalpost: bool) -> u32 {
    let is_near_goal = y.abs() >= 4950.0;
    let is_crossbar = (z - 642.78).abs() < 95.0 && x.abs() <= 960.0;
    let is_upright_post = (x.abs() - 892.755).abs() < 95.0 && z <= 720.0;
    if is_goalpost || (is_near_goal && (is_crossbar || is_upright_post)) {
        return if is_crossbar { 9 } else { 8 };
    }
    if nz >= 0.8 {
        return 1;
    }
    if nz <= 0.05 {
        return 3;
    }
    7
}
