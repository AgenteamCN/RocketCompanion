//! Pre-step snapshot capture and post-step custom car modifiers (`max_flip_count`,
//! `flip_timer_mode`, `demo_spawn_selection`, `recharge_delay`) plus goal/possession tracking.

use glam::{EulerRot, Mat3A, Vec3A};
use rocketsim::{consts, CarCore, CarState, PhysState, Team};

use crate::{
    layout::{PhysicsEvent, MAX_CARS, MAX_PADS},
    sim_instance::SimInstance,
};

#[derive(Clone, Copy, Default)]
pub struct PreStepCarState {
    pub active: bool,
    pub team_id: i32,
    pub is_demoed: bool,
    pub is_on_ground: bool,
    pub is_jumping: bool,
    pub is_flipping: bool,
    pub is_boosting: bool,
    pub is_supersonic: bool,
    pub has_jumped: bool,
    pub has_double_jumped: bool,
    pub has_flipped: bool,
    pub had_air_flip_avail: bool,
    pub boost: f32,
}

#[derive(Clone)]
pub struct PreStepSnapshot {
    pub cars: [PreStepCarState; MAX_CARS],
    pub pad_active: [bool; MAX_PADS],
    pub prev_goal_flag: f32,
    pub prev_possession_team: i32,
}

impl Default for PreStepSnapshot {
    fn default() -> Self {
        Self {
            cars: [PreStepCarState::default(); MAX_CARS],
            pad_active: [false; MAX_PADS],
            prev_goal_flag: 0.0,
            prev_possession_team: -1,
        }
    }
}

const RESPAWN_PRESETS_TEAM0: [(f32, f32, f32, f32); 4] = [
    (2688.0, -4608.0, 17.0, core::f32::consts::FRAC_PI_2),
    (2304.0, -4608.0, 17.0, core::f32::consts::FRAC_PI_2),
    (-2304.0, -4608.0, 17.0, core::f32::consts::FRAC_PI_2),
    (-2688.0, -4608.0, 17.0, core::f32::consts::FRAC_PI_2),
];

impl SimInstance {
    pub(crate) fn capture_pre_step_snapshot(&mut self) -> PreStepSnapshot {
        let mut snap = PreStepSnapshot {
            prev_goal_flag: self.state_buffer.header.goal_scored_flag,
            prev_possession_team: self.state_buffer.possession_team.round() as i32,
            ..PreStepSnapshot::default()
        };
        let Some(arena) = self.arena.as_mut() else {
            return snap;
        };

        for slot in 0..MAX_CARS {
            let Some(car_id) = self.car_slots[slot] else {
                continue;
            };
            if self.car_custom[slot].flip_timer_mode == 1 {
                let st = *arena.get_car_state(car_id);
                if !st.is_on_ground() && st.air_time_since_jump > 0.25 {
                    let mut mod_st = st;
                    mod_st.air_time_since_jump = 0.25;
                    arena.set_car_state_full(car_id, mod_st);
                }
            }

            let team_id = arena
                .cars()
                .get(car_id)
                .map(|c| if c.team == Team::Blue { 0 } else { 1 })
                .unwrap_or(0);
            let st = arena.get_car_state(car_id);
            snap.cars[slot] = PreStepCarState {
                active: true,
                team_id,
                is_demoed: st.is_demoed,
                is_on_ground: st.is_on_ground(),
                is_jumping: st.is_jumping,
                is_flipping: st.is_flipping,
                is_boosting: st.is_boosting,
                is_supersonic: st.is_supersonic,
                has_jumped: st.has_jumped,
                has_double_jumped: st.has_double_jumped,
                has_flipped: st.has_flipped,
                had_air_flip_avail: !st.is_on_ground() && st.has_flip_or_jump(),
                boost: st.boost,
            };
        }

        let pad_count = arena.num_boost_pads().min(MAX_PADS);
        for i in 0..pad_count {
            snap.pad_active[i] = arena.get_boost_pad_state(i).is_active();
        }
        snap
    }

    pub(crate) fn apply_post_step_modifiers_and_incidents(
        &mut self,
        snap: &PreStepSnapshot,
        silent: bool,
    ) {
        let Some((tick, ball, pad_count, boost_big, boost_small, arena_scored)) =
            self.arena.as_ref().map(|a| {
                let m = a.mutator_config();
                (
                    a.tick_count() as u32,
                    *a.get_ball_state(),
                    a.num_boost_pads().min(MAX_PADS),
                    m.boost_pad_amount_big,
                    m.boost_pad_amount_small,
                    a.is_ball_scored(),
                )
            })
        else {
            return;
        };

        if !silent {
            self.emit_pad_respawn_incidents(snap, tick, pad_count, boost_big, boost_small);
        }

        for slot in 0..MAX_CARS {
            let Some(car_id) = self.car_slots[slot] else {
                continue;
            };
            let pre = &snap.cars[slot];
            if !pre.active {
                continue;
            }
            let Some(mut st) = self.arena.as_ref().map(|a| *a.get_car_state(car_id)) else {
                continue;
            };
            let mut state_dirty = false;

            if pre.is_demoed && !st.is_demoed {
                let sel = self.car_custom[slot].demo_spawn_selection;
                if (0..4).contains(&sel) {
                    let (rx, ry, rz, ryaw) = RESPAWN_PRESETS_TEAM0[sel as usize];
                    let (px, py, yaw) = if pre.team_id == 0 {
                        (rx, ry, ryaw)
                    } else {
                        (-rx, -ry, -ryaw)
                    };
                    let phys = PhysState {
                        pos: Vec3A::new(px, py, rz),
                        rot_mat: Mat3A::from_euler(EulerRot::ZYX, yaw, 0.0, 0.0),
                        vel: Vec3A::ZERO,
                        ang_vel: Vec3A::ZERO,
                    };
                    st = CarState::from(CarCore::grounded(phys, st.boost));
                    state_dirty = true;
                }
            }

            let is_on_ground = st.is_on_ground();
            if is_on_ground {
                self.car_custom[slot].air_flips_used = 0;
            }

            let jumped_this_tick = !pre.is_jumping && st.is_jumping;
            let double_jumped_this_tick = !pre.has_double_jumped && st.has_double_jumped;
            let dodged_this_tick =
                (!pre.is_flipping && st.is_flipping) || (!pre.has_flipped && st.has_flipped);

            let now_air_flip_avail = !is_on_ground && st.has_flip_or_jump();
            let flip_reset_this_tick = !st.is_demoed
                && !is_on_ground
                && !pre.is_on_ground
                && !st.has_jumped
                && (pre.has_jumped || !pre.had_air_flip_avail)
                && now_air_flip_avail;

            if flip_reset_this_tick {
                self.car_custom[slot].air_flips_used = 0;
            }

            if double_jumped_this_tick || dodged_this_tick {
                self.car_custom[slot].air_flips_used += 1;
                let max_flips = self.car_custom[slot].max_flip_count;
                if max_flips <= 0
                    || max_flips >= 99
                    || self.car_custom[slot].air_flips_used < max_flips
                {
                    st.has_double_jumped = false;
                    st.has_flipped = false;
                    if st.air_time_since_jump >= consts::car::jump::DOUBLEJUMP_MAX_DELAY - 0.1 {
                        st.air_time_since_jump = 0.25;
                    }
                    state_dirty = true;
                }
            }

            if self.car_custom[slot].flip_timer_mode == 1
                && !is_on_ground
                && st.air_time_since_jump > 0.25
            {
                st.air_time_since_jump = 0.25;
                state_dirty = true;
            }

            let custom = &self.car_custom[slot];
            if self.unlimited_boost_global || custom.unlimited_boost {
                if st.boost < 100.0 {
                    st.boost = 100.0;
                    state_dirty = true;
                }
            } else if custom.recharge_enabled
                && !st.is_boosting
                && st.time_since_boosted >= custom.recharge_delay
                && st.boost < 100.0
            {
                st.boost = (st.boost + custom.recharge_per_second * consts::TICK_TIME).min(100.0);
                state_dirty = true;
            }

            if state_dirty && let Some(arena) = self.arena.as_mut() {
                arena.set_car_state_full(car_id, st);
            }

            if !silent {
                self.emit_car_step_incidents(
                    slot,
                    tick,
                    pre,
                    &st,
                    &ball,
                    jumped_this_tick,
                    double_jumped_this_tick,
                    dodged_this_tick,
                    flip_reset_this_tick,
                );
            }
        }

        self.update_goal_and_possession(snap, tick, &ball, arena_scored, silent);
    }

    fn update_goal_and_possession(
        &mut self,
        snap: &PreStepSnapshot,
        tick: u32,
        ball: &rocketsim::BallState,
        arena_scored: bool,
        silent: bool,
    ) {
        let is_scored = if self.goal_box_enabled {
            let abs_y = ball.pos.y.abs();
            ball.pos.x.abs() <= self.goal_box_half_x
                && abs_y >= self.goal_box_min_y
                && abs_y <= self.goal_box_max_y
                && ball.pos.z >= 0.0
                && ball.pos.z <= self.goal_box_max_z
        } else {
            arena_scored
        };

        if is_scored && snap.prev_goal_flag == 0.0 {
            let scoring_team = if ball.pos.y > 0.0 { 0 } else { 1 };
            self.state_buffer.header.goal_scored_flag = if ball.pos.y > 0.0 { 1.0 } else { 2.0 };
            if !silent && (self.sim_control_flags & 0x04) != 0 {
                let pev = PhysicsEvent {
                    event_type: 0x0E,
                    tick,
                    pos_x: ball.pos.x,
                    pos_y: ball.pos.y,
                    pos_z: ball.pos.z,
                    speed: ball.vel.length(),
                    packed_ids: PhysicsEvent::pack_ids(scoring_team, scoring_team),
                    sub_type: scoring_team as u32,
                    ..Default::default()
                };
                self.push_event(pev);
                self.replay.push_incident(&pev);
            }
        }

        let cur_poss_team = self.state_buffer.possession_team.round() as i32;
        if cur_poss_team == 0 || cur_poss_team == 1 {
            if cur_poss_team != snap.prev_possession_team {
                self.state_buffer.possession_time_accumulator = consts::TICK_TIME;
                if cur_poss_team == 0 {
                    self.state_buffer.blue_possession_points += 1.0;
                } else {
                    self.state_buffer.orange_possession_points += 1.0;
                }
                if !silent && self.possession_event_enabled {
                    let pev = PhysicsEvent {
                        event_type: 0x11,
                        tick,
                        pos_x: ball.pos.x,
                        pos_y: ball.pos.y,
                        pos_z: ball.pos.z,
                        packed_ids: PhysicsEvent::pack_ids(
                            self.possession_car_index.max(0),
                            cur_poss_team,
                        ),
                        sub_type: cur_poss_team as u32,
                        ..Default::default()
                    };
                    self.push_event(pev);
                    self.replay.push_incident(&pev);
                }
            } else {
                let prev_time = self.state_buffer.possession_time_accumulator;
                let next_time = prev_time + consts::TICK_TIME;
                self.state_buffer.possession_time_accumulator = next_time;
                if prev_time.floor() < next_time.floor() {
                    if cur_poss_team == 0 {
                        self.state_buffer.blue_possession_points += 1.0;
                    } else {
                        self.state_buffer.orange_possession_points += 1.0;
                    }
                }
            }
        }
    }
}
