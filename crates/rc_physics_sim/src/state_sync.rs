use glam::{Mat3A, Vec3A};
use rocketsim::consts;

use crate::{
    layout::{ MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

impl SimInstance {
    pub fn sync_state_to_buffer(&mut self) {
        let Some(arena) = self.arena.as_ref() else {
            return;
        };

        let ball = arena.get_ball_state();
        let pad_count = arena.num_boost_pads().min(MAX_PADS);

        self.state_buffer.header.tick_count = arena.tick_count() as f32;
        if arena.is_ball_scored() {
            self.state_buffer.header.goal_scored_flag = if ball.pos.y > 0.0 { 1.0 } else { 2.0 };
        }
        self.state_buffer.header.num_cars = self.highest_car_slot_len() as f32;
        self.state_buffer.header.num_pads = pad_count as f32;

        self.state_buffer.ball.pos = ball.pos.to_array();
        self.state_buffer.ball.forward = ball.rot_mat.x_axis.to_array();
        self.state_buffer.ball.right = ball.rot_mat.y_axis.to_array();
        self.state_buffer.ball.up = ball.rot_mat.z_axis.to_array();
        self.state_buffer.ball.vel = ball.vel.to_array();
        self.state_buffer.ball.ang_vel = ball.ang_vel.to_array();

        let speed_sq = ball.vel.length_squared();
        self.ball_motion_state = if speed_sq < 1.0 {
            0
        } else if (ball.pos.z - arena.mutator_config().ball_radius) <= 8.0 {
            1
        } else {
            2
        };
        self.state_buffer.is_ball_sleeping = if arena.is_ball_sleeping() { 1.0 } else { 0.0 };
        self.state_buffer.is_simulation_frozen = if self.sim_frozen { 1.0 } else { 0.0 };

        for slot in 0..MAX_CARS {
            let Some(car_id) = self.car_slots[slot] else {
                continue;
            };
            let Some(car_obj) = arena.cars().get(car_id) else {
                continue;
            };
            let st = arena.get_car_state(car_id);
            let pod = &mut self.state_buffer.cars[slot];

            pod.pos = st.pos.to_array();
            pod.forward = st.rot_mat.x_axis.to_array();
            pod.right = st.rot_mat.y_axis.to_array();
            pod.up = st.rot_mat.z_axis.to_array();
            pod.vel = st.vel.to_array();
            pod.ang_vel = st.ang_vel.to_array();
            pod.boost = st.boost;
            pod.is_on_ground = if st.is_on_ground() { 1.0 } else { 0.0 };
            pod.is_supersonic = if st.is_supersonic { 1.0 } else { 0.0 };
            pod.is_demoed = if st.is_demoed {
                st.demo_respawn_timer.max(0.001)
            } else {
                0.0
            };
            pod.has_flip_or_jump = if st.has_flip_or_jump() { 1.0 } else { 0.0 };
            pod.is_boosting = if st.is_boosting { 1.0 } else { 0.0 };
            pod.is_flipping = if st.is_flipping { 1.0 } else { 0.0 };

            for w in 0..4 {
                let (sus_len, steer, contact) = car_obj.wheel_telemetry(w);
                pod.wheels[w].suspension_length = sus_len;
                pod.wheels[w].steer_angle = steer;
                pod.wheels[w].has_contact = if contact { 1.0 } else { 0.0 };
            }

            let gn = st
                .world_contact_normal()
                .unwrap_or(if st.is_on_ground() {
                    st.rot_mat.z_axis
                } else {
                    Vec3A::ZERO
                });
            pod.ground_normal = gn.to_array();

            let ja = &mut self.state_buffer.car_jump_air[slot];
            ja.is_jumping = if st.is_jumping { 1.0 } else { 0.0 };
            ja.air_time = st.air_time;
            ja.jump_time = if st.is_demoed {
                self.car_custom[slot].demo_spawn_selection as f32
            } else {
                st.jump_time()
            };
            ja.air_time_since_jump = st.air_time_since_jump;
        }

        for i in 0..pad_count {
            let ps = arena.get_boost_pad_state(i);
            self.state_buffer.pads[i].is_active = if ps.is_active() { 1.0 } else { 0.0 };
            self.state_buffer.pads[i].cooldown = ps.cooldown;
        }
    }

    pub fn set_ball_state_from_slice(&mut self, f: &[f32; 18]) {
        let Some(arena) = self.arena.as_mut() else {
            return;
        };
        let mut bs = *arena.get_ball_state();
        bs.pos = Vec3A::from_slice(&f[0..3]);
        let fwd = Vec3A::from_slice(&f[3..6]);
        let right = Vec3A::from_slice(&f[6..9]);
        let up = Vec3A::from_slice(&f[9..12]);
        if fwd.length_squared() > 0.2 && right.length_squared() > 0.2 && up.length_squared() > 0.2 {
            bs.rot_mat = Mat3A::from_cols(fwd, right, up);
        }
        bs.vel = Vec3A::from_slice(&f[12..15]);
        bs.ang_vel = Vec3A::from_slice(&f[15..18]);
        arena.set_ball_state(bs);
        self.sync_state_to_buffer();
    }

    pub fn set_car_state_from_slice(&mut self, slot: usize, f: &[f32; 40]) {
        if slot >= MAX_CARS {
            return;
        }
        let Some(car_id) = self.car_slots[slot] else {
            return;
        };
        let Some(arena) = self.arena.as_mut() else {
            return;
        };
        let mut cs = *arena.get_car_state(car_id);
        cs.pos = Vec3A::from_slice(&f[0..3]);
        let fwd = Vec3A::from_slice(&f[3..6]);
        let right = Vec3A::from_slice(&f[6..9]);
        let up = Vec3A::from_slice(&f[9..12]);
        if fwd.length_squared() > 0.2 && right.length_squared() > 0.2 && up.length_squared() > 0.2 {
            cs.rot_mat = Mat3A::from_cols(fwd, right, up);
        }
        cs.vel = Vec3A::from_slice(&f[12..15]);
        cs.ang_vel = Vec3A::from_slice(&f[15..18]);
        cs.boost = f[18].clamp(0.0, 100.0);
        cs.is_supersonic = f[20] >= 0.5;
        if f[21] > 0.0 {
            cs.is_demoed = true;
            cs.demo_respawn_timer = f[21];
        } else {
            cs.is_demoed = false;
            cs.demo_respawn_timer = 0.0;
        }
        if f[22] >= 0.5 {
            if !cs.is_on_ground() {
                cs.has_jumped = false;
                cs.has_double_jumped = false;
                cs.has_flipped = false;
                cs.air_time_since_jump = 0.0;
            }
            self.car_custom[slot].air_flips_used = 0;
        } else if !cs.is_on_ground() {
            cs.has_jumped = true;
            cs.has_double_jumped = true;
        }
        cs.is_boosting = f[23] >= 0.5;
        cs.is_flipping = f[24] >= 0.5;
        arena.set_car_state_full(car_id, cs);
        self.sync_state_to_buffer();
    }

    pub fn restore_compact_state(&mut self, slice: &[f32]) -> i32 {
        if slice.len() < 410 {
            return 0;
        }
        let Some(arena) = self.arena.as_mut() else {
            return 0;
        };
        arena.set_tick_count(slice[0] as u64);
        self.state_buffer.header.goal_scored_flag = slice[1];

        let mut ball_arr = [0.0f32; 18];
        ball_arr.copy_from_slice(&slice[4..22]);
        self.set_ball_state_from_slice(&ball_arr);

        for slot in 0..MAX_CARS {
            let base = 22 + slot * 40;
            let mut car_arr = [0.0f32; 40];
            car_arr.copy_from_slice(&slice[base..base + 40]);
            self.set_car_state_from_slice(slot, &car_arr);
            if slice.len() >= 448 {
                let ja_base = 416 + slot * 4;
                if let Some(car_id) = self.car_slots[slot]
                    && let Some(arena) = self.arena.as_mut()
                {
                    let mut cs = *arena.get_car_state(car_id);
                    cs.is_jumping = slice[ja_base] > 0.5;
                    cs.air_time = slice[ja_base + 1];
                    if !cs.is_demoed {
                        cs.jump_ticks = (slice[ja_base + 2] / consts::TICK_TIME).round().max(0.0) as u32;
                    }
                    cs.air_time_since_jump = slice[ja_base + 3];
                    arena.set_car_state_full(car_id, cs);
                }
            }
        }
        self.sync_state_to_buffer();
        1
    }
}
