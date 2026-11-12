//! Continuous spatial vehicle LOD refinement, wheel landing detector, ball rolling/flying
//! acoustic loops, and stadium PA reverb/filter bus modulation for `AudioDirectorInstance`.

use rc_physics_sim::{layout::MAX_CARS, sim_instance::SimInstance};

use crate::{
    director::AudioDirectorInstance,
    pod_types::{edge_mask_bits, AudioOneShotSlotPod, MAX_AUDIBLE_REMOTE_ENGINES},
};

impl AudioDirectorInstance {
    pub(crate) fn refine_vehicles_and_wheel_landings(
        &mut self,
        sim: &SimInstance,
        current_tick: u32,
        baseline_mask: u32,
    ) -> u32 {
        let active_car = self.listener_pod.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
        let num_cars = self.listener_pod.effective_num_cars.clamp(0, MAX_CARS as i32) as usize;
        let is_lobby_dual = (self.listener_pod.flags & (1 << 3)) != 0;
        let test_probe_enabled = (self.listener_pod.flags & (1 << 4)) != 0;

        let fwd_uu = [
            self.listener_pod.forward_audio[0],
            self.listener_pod.forward_audio[2],
            self.listener_pod.forward_audio[1],
        ];
        let up_uu = [
            self.listener_pod.up_audio[0],
            self.listener_pod.up_audio[2],
            self.listener_pod.up_audio[1],
        ];
        let right_uu = [
            fwd_uu[1] * up_uu[2] - fwd_uu[2] * up_uu[1],
            fwd_uu[2] * up_uu[0] - fwd_uu[0] * up_uu[2],
            fwd_uu[0] * up_uu[1] - fwd_uu[1] * up_uu[0],
        ];

        let mut remote_candidates: [(usize, f32); MAX_CARS] = [(0, f32::MAX); MAX_CARS];
        let mut candidate_count = 0usize;

        for i in 0..num_cars {
            if sim.car_slots[i].is_none()
                || ((i == 6 || i == 7) && !test_probe_enabled)
                || (is_lobby_dual && i != active_car && i != 6 && i != 7)
            {
                self.drivetrains[i].dormant = i != active_car;
                self.cue_pod.cars[i].engine_gain = 0.0;
                self.cue_pod.cars[i].boost_gain = 0.0;
                self.cue_pod.cars[i].supersonic_gain = 0.0;
                continue;
            }

            let car = &sim.state_buffer.cars[i];
            let dist_uu = self.cue_pod.cars[i].distance_uu;
            let is_primary = i == active_car;

            if !is_primary && dist_uu > 1.0 {
                let dx = (car.pos[0] - self.listener_pod.pos_uu[0]) / dist_uu;
                let dy = (car.pos[1] - self.listener_pod.pos_uu[1]) / dist_uu;
                let dz = (car.pos[2] - self.listener_pod.pos_uu[2]) / dist_uu;
                let pan = (dx * right_uu[0] + dy * right_uu[1] + dz * right_uu[2]).clamp(-1.0, 1.0);
                self.cue_pod.cars[i].spatial_pan = pan;

                let rel_vx = car.vel[0] - self.listener_pod.vel_uu[0];
                let rel_vy = car.vel[1] - self.listener_pod.vel_uu[1];
                let rel_vz = car.vel[2] - self.listener_pod.vel_uu[2];
                let radial_vel = rel_vx * dx + rel_vy * dy + rel_vz * dz;
                let doppler = (1.0
                    - (radial_vel / 34300.0) * self.config_pod.doppler_scale.clamp(0.0, 3.0))
                .clamp(0.78, 1.28);
                self.cue_pod.cars[i].doppler_pitch = doppler;
                self.cue_pod.cars[i].boost_pitch = doppler;

                let (boost_atten, boost_culled) = self.evaluate_attenuation(6, dist_uu);
                self.cue_pod.cars[i].boost_gain = if boost_culled {
                    0.0
                } else {
                    self.cue_pod.cars[i].boost_gain * boost_atten
                };

                let (super_atten, super_culled) = self.evaluate_attenuation(8, dist_uu);
                self.cue_pod.cars[i].supersonic_gain = if super_culled {
                    0.0
                } else {
                    self.cue_pod.cars[i].supersonic_gain * super_atten
                };

                let (eng_atten, eng_culled) = self.evaluate_attenuation(10, dist_uu);
                if !eng_culled && car.is_demoed <= 0.0 && eng_atten > 0.001 {
                    self.cue_pod.cars[i].engine_gain *= eng_atten;
                    remote_candidates[candidate_count] = (i, dist_uu);
                    candidate_count += 1;
                } else {
                    self.cue_pod.cars[i].engine_gain = 0.0;
                }
            } else if is_primary {
                self.cue_pod.cars[i].engine_gain *= self.config_pod.vehicle_self_volume;
                self.cue_pod.cars[i].boost_gain *= self.config_pod.vehicle_self_volume;
                self.cue_pod.cars[i].supersonic_gain *= self.config_pod.vehicle_self_volume;
            }

            if car.is_demoed <= 0.0 {
                self.check_car_wheel_landing(i, car, current_tick, is_primary, dist_uu);
            }
        }

        if baseline_mask != 0 {
            return baseline_mask;
        }

        for a in 0..candidate_count {
            for b in (a + 1)..candidate_count {
                if remote_candidates[b].1 < remote_candidates[a].1 {
                    remote_candidates.swap(a, b);
                }
            }
        }
        let mut mask = 0u32;
        for (rank, &(car_idx, _)) in remote_candidates.iter().take(candidate_count).enumerate() {
            if rank < MAX_AUDIBLE_REMOTE_ENGINES {
                mask |= 1u32 << car_idx;
                self.drivetrains[car_idx].dormant = false;
                self.drivetrains[car_idx].awake_remote = true;
                self.cue_pod.cars[car_idx].packed_flags &= !(1 << 1);
            } else {
                self.drivetrains[car_idx].dormant = true;
                self.drivetrains[car_idx].awake_remote = false;
                self.cue_pod.cars[car_idx].engine_gain = 0.0;
                self.cue_pod.cars[car_idx].packed_flags |= 1 << 1;
            }
        }
        mask
    }

    fn check_car_wheel_landing(
        &mut self,
        car_idx: usize,
        car: &rc_physics_sim::layout::CarStatePod,
        current_tick: u32,
        is_primary: bool,
        dist_uu: f32,
    ) {
        let mut wheel_contacts = 0u32;
        for w in 0..4 {
            if car.wheels[w].has_contact >= 0.5 {
                wheel_contacts += 1;
            }
        }
        let grounded_now = car.is_on_ground >= 0.5 || wheel_contacts >= 2;
        let downward_speed = (-car.vel[2]).max(0.0);
        let dt_state = &mut self.drivetrains[car_idx];

        if !dt_state.landing_was_grounded && grounded_now {
            let impact_speed = dt_state.peak_downward_speed_uu.max(downward_speed);
            let ticks_airborne = dt_state.airborne_ticks;
            let cooldown_ok = dt_state.last_wheel_landing_tick == 0
                || current_tick.saturating_sub(dt_state.last_wheel_landing_tick) >= 18;
            dt_state.landing_was_grounded = true;
            dt_state.peak_downward_speed_uu = 0.0;
            dt_state.airborne_ticks = 0;

            if ticks_airborne >= 10 && impact_speed >= 180.0 && cooldown_ok {
                dt_state.last_wheel_landing_tick = current_tick.max(1);
                let (atten, culled) = if is_primary {
                    (self.config_pod.vehicle_self_volume, false)
                } else {
                    self.evaluate_attenuation(13, dist_uu)
                };
                if !culled {
                    let intensity = ((impact_speed - 180.0) / 1320.0).clamp(0.15, 1.0);
                    let gain = (intensity
                        * 0.65
                        * atten
                        * self.config_pod.wheel_impact_volume
                        * self.config_pod.master_volume)
                        .clamp(0.0, 1.5);
                    let variant = self.select_variation(18 + (car_idx & 3), 4);
                    let rate = 0.94 + self.next_rand_f32() * 0.12;
                    self.cue_pod.one_shot_edge_mask_hi |=
                        1u32 << (edge_mask_bits::CAR_WHEEL_LANDING_BASE + (car_idx as u32));
                    self.push_one_shot(AudioOneShotSlotPod {
                        event_type: 0x12,
                        sub_type: wheel_contacts,
                        car_index: car_idx as u32,
                        priority_and_variant: 45 | (variant << 8),
                        final_gain: gain,
                        playback_rate: rate,
                        distance_radius_scale: 1.0,
                        pan_or_intensity: intensity,
                        audio_pos_meters: [
                            car.pos[0] * 0.01,
                            car.pos[2] * 0.01,
                            car.pos[1] * 0.01,
                        ],
                        category_index: 13,
                    });
                }
            }
        } else if !grounded_now {
            dt_state.landing_was_grounded = false;
            dt_state.airborne_ticks = dt_state.airborne_ticks.saturating_add(1);
            if downward_speed > dt_state.peak_downward_speed_uu {
                dt_state.peak_downward_speed_uu = downward_speed;
            }
        } else {
            dt_state.landing_was_grounded = true;
            dt_state.peak_downward_speed_uu = 0.0;
            dt_state.airborne_ticks = 0;
        }
    }

    pub(crate) fn step_ball_loops(&mut self, sim: &SimInstance, dt_sec: f32) {
        let ball = &sim.state_buffer.ball;
        let (bx, by, bz) = (ball.pos[0], ball.pos[1], ball.pos[2]);
        self.cue_pod.ball.audio_pos_meters = [bx * 0.01, bz * 0.01, by * 0.01];

        let dx = bx - self.listener_pod.pos_uu[0];
        let dy = by - self.listener_pod.pos_uu[1];
        let dz = bz - self.listener_pod.pos_uu[2];
        let ball_dist = (dx * dx + dy * dy + dz * dz).sqrt();
        self.cue_pod.ball.distance_uu = ball_dist;

        let b_speed =
            (ball.vel[0] * ball.vel[0] + ball.vel[1] * ball.vel[1] + ball.vel[2] * ball.vel[2])
                .sqrt();
        let is_sleeping = sim.state_buffer.is_ball_sleeping >= 0.5;
        let is_in_goal = by.abs() > 5120.0 + 92.75;
        let is_ground_contact = (bz - 93.15) <= 15.0;
        let is_rolling_contact = sim.ball_contact_rolling && sim.ball_contact_normal_speed <= 120.0;
        let is_contacting = is_rolling_contact
            || is_ground_contact
            || bz >= (2048.0 - 113.15)
            || bx.abs() >= (4096.0 - 113.15)
            || (by.abs() >= (5120.0 - 113.15) && bz > 642.0)
            || (bz < 260.0 && (bx.abs() > 3800.0 || by.abs() > 4800.0));

        let (roll_atten, roll_culled) = self.evaluate_attenuation(14, ball_dist);
        let rolling_was_active = self.smoothed_ball_rolling_gain > 0.0;
        let rolling_speed_gate = if rolling_was_active { 18.0 } else { 25.0 };
        let is_bouncing = !is_rolling_contact && ball.vel[2].abs() > 120.0;
        let target_roll_gain = if !is_sleeping
            && !is_in_goal
            && !roll_culled
            && is_contacting
            && !is_bouncing
            && b_speed > rolling_speed_gate
        {
            let spd_factor = ((b_speed - 25.0) / 1800.0).clamp(0.08, 1.0);
            let vert_dampen = (1.0 - (ball.vel[2].abs() / 420.0)).clamp(0.0, 1.0);
            (self.config_pod.ball_rolling_volume
                * self.config_pod.master_volume
                * roll_atten
                * spd_factor
                * vert_dampen)
                .clamp(0.0, 2.0)
        } else {
            0.0
        };
        let target_roll_rate = 0.85 + 0.35 * (b_speed / 2000.0).clamp(0.0, 1.0);

        let (fly_atten, fly_culled) = self.evaluate_attenuation(15, ball_dist);
        let downward_speed = (-ball.vel[2]).max(0.0);
        let target_fly_gain = if !is_sleeping
            && !is_in_goal
            && !fly_culled
            && !is_ground_contact
            && bz > 170.0
            && downward_speed > 260.0
        {
            let fall_norm = ((downward_speed - 260.0) / 1740.0).clamp(0.0, 1.0);
            let alt_norm = ((bz - 170.0) / 600.0).clamp(0.15, 1.0);
            (self.config_pod.ball_flying_volume
                * self.config_pod.master_volume
                * fly_atten
                * fall_norm
                * alt_norm
                * 0.65)
                .clamp(0.0, 2.0)
        } else {
            0.0
        };
        let target_fly_rate = 0.90 + 0.30 * (downward_speed / 2000.0).clamp(0.0, 1.0);

        let alpha = 1.0 - (-dt_sec / 0.05).exp();
        self.smoothed_ball_rolling_gain +=
            (target_roll_gain - self.smoothed_ball_rolling_gain) * alpha;
        self.smoothed_ball_flying_gain +=
            (target_fly_gain - self.smoothed_ball_flying_gain) * alpha;
        self.smoothed_ball_rolling_rate +=
            (target_roll_rate - self.smoothed_ball_rolling_rate) * alpha;
        self.smoothed_ball_flying_rate +=
            (target_fly_rate - self.smoothed_ball_flying_rate) * alpha;

        if self.smoothed_ball_rolling_gain < 0.0005 {
            self.smoothed_ball_rolling_gain = 0.0;
        }
        if self.smoothed_ball_flying_gain < 0.0005 {
            self.smoothed_ball_flying_gain = 0.0;
        }

        self.cue_pod.ball.rolling_gain = self.smoothed_ball_rolling_gain;
        self.cue_pod.ball.rolling_rate = self.smoothed_ball_rolling_rate;
        self.cue_pod.ball.flying_gain = self.smoothed_ball_flying_gain;
        self.cue_pod.ball.flying_rate = self.smoothed_ball_flying_rate;
        self.cue_pod.ball_roll_gain = self.smoothed_ball_rolling_gain;
    }

    pub(crate) fn step_stadium_bus(&mut self, dt_sec: f32) {
        let is_spatial_enabled = (self.listener_pod.flags & (1 << 2)) != 0;
        let target_u = if is_spatial_enabled { 0.0 } else { 1.0 };
        let max_delta = (dt_sec / 2.0).clamp(0.0, 0.25);
        if (target_u - self.stadium_linear_phase).abs() > 1e-4 {
            if target_u > self.stadium_linear_phase {
                self.stadium_linear_phase = (self.stadium_linear_phase + max_delta).min(target_u);
            } else {
                self.stadium_linear_phase = (self.stadium_linear_phase - max_delta).max(target_u);
            }
        } else {
            self.stadium_linear_phase = target_u;
        }
        let blend = solve_cubic_bezier(self.stadium_linear_phase, 0.22, 1.0, 1.0, 1.0);
        self.cue_pod.stadium_bus.spatial_blend = blend;
        self.cue_pod.stadium_bus.hpf_freq_hz = 20.0 + blend * (425.0 - 20.0);
        self.cue_pod.stadium_bus.lpf_freq_hz = 20000.0 * (3500.0 / 20000.0f32).powf(blend);
        self.cue_pod.stadium_bus.wet_gain = blend * 0.69 * 1.35;
    }
}

#[inline]
pub(crate) fn solve_cubic_bezier(x: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    if x <= 0.0 {
        return 0.0;
    }
    if x >= 1.0 {
        return 1.0;
    }
    let cx = 3.0 * x1;
    let bx = 3.0 * (x2 - x1) - cx;
    let ax = 1.0 - cx - bx;
    let cy = 3.0 * y1;
    let by = 3.0 * (y2 - y1) - cy;
    let ay = 1.0 - cy - by;

    let mut t = x;
    for _ in 0..6 {
        let x_est = ((ax * t + bx) * t + cx) * t - x;
        if x_est.abs() < 1e-5 {
            break;
        }
        let d = (3.0 * ax * t + 2.0 * bx) * t + cx;
        if d.abs() < 1e-5 {
            break;
        }
        t = (t - x_est / d).clamp(0.0, 1.0);
    }
    (((ay * t + by) * t + cy) * t).clamp(0.0, 1.0)
}
