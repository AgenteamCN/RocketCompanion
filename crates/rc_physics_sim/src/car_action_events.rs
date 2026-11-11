//! Synthesizes car action (`0x06..0x08`), supersonic (`0x09`), boost (`0x0C..0x0D`),
//! boost pad spawn (`0x0B`), and flip reset (`0x0F`) incidents into `PhysicsEventBuffer`.

use rocketsim::{CarState, UserInfoType};

use crate::{
    car_modifiers::{PreStepCarState, PreStepSnapshot},
    layout::PhysicsEvent,
    sim_instance::SimInstance,
};

impl SimInstance {
    pub(crate) fn emit_pad_respawn_incidents(
        &mut self,
        snap: &PreStepSnapshot,
        tick: u32,
        pad_count: usize,
        boost_big: f32,
        boost_small: f32,
    ) {
        for i in 0..pad_count {
            let Some((now_active, pos, is_big)) = self.arena.as_ref().map(|a| {
                let cfg = a.get_boost_pad_config(i);
                (a.get_boost_pad_state(i).is_active(), cfg.pos, cfg.is_big)
            }) else {
                break;
            };
            if !snap.pad_active[i] && now_active {
                let pev = PhysicsEvent {
                    event_type: 0x0B, // INCIDENT_EVENT_TYPES.BOOST_SPAWN
                    tick,
                    pos_x: pos.x,
                    pos_y: pos.y,
                    pos_z: pos.z,
                    packed_ids: PhysicsEvent::pack_ids(0xFFFF, i as i32),
                    sub_type: u32::from(is_big),
                    custom_float: if is_big { boost_big } else { boost_small },
                    ..Default::default()
                };
                self.push_event(pev);
                self.replay.push_incident(&pev);
            }
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub(crate) fn emit_car_step_incidents(
        &mut self,
        slot: usize,
        tick: u32,
        pre: &PreStepCarState,
        st: &CarState,
        ball: &rocketsim::BallState,
        jumped_this_tick: bool,
        double_jumped_this_tick: bool,
        dodged_this_tick: bool,
        flip_reset_this_tick: bool,
    ) {
        let speed = st.vel.length();
        let mut base_flags = 0u32;
        if st.is_supersonic {
            base_flags |= 1 << 1;
        }
        if st.is_flipping {
            base_flags |= 1 << 2;
        }
        if st.is_on_ground() {
            base_flags |= 1 << 3;
        }
        let packed = PhysicsEvent::pack_ids(slot as i32, pre.team_id);

        if jumped_this_tick {
            let pev = PhysicsEvent {
                event_type: 0x06,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                speed,
                packed_ids: packed,
                sub_type: 1, // CAR_ACTION_SUBTYPES.SINGLE_JUMP
                flags: base_flags,
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        } else if dodged_this_tick {
            let pev = PhysicsEvent {
                event_type: 0x08,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                speed,
                packed_ids: packed,
                sub_type: 3, // CAR_ACTION_SUBTYPES.DODGE
                flags: base_flags | (1 << 2),
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        } else if double_jumped_this_tick {
            let pev = PhysicsEvent {
                event_type: 0x07,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                speed,
                packed_ids: packed,
                sub_type: 2, // CAR_ACTION_SUBTYPES.DOUBLE_JUMP
                flags: base_flags,
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        }

        if !pre.is_boosting && st.is_boosting {
            let pev = PhysicsEvent {
                event_type: 0x0C,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                speed,
                packed_ids: packed,
                flags: base_flags,
                custom_float: st.boost / 100.0,
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        } else if pre.is_boosting && !st.is_boosting {
            let pev = PhysicsEvent {
                event_type: 0x0D,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                speed,
                packed_ids: packed,
                flags: base_flags,
                custom_float: st.boost / 100.0,
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        }

        if !pre.is_supersonic && st.is_supersonic {
            let pev = PhysicsEvent {
                event_type: 0x09,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                speed,
                normal_rel_vel: speed,
                packed_ids: packed,
                flags: base_flags | (1 << 1),
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        }

        if flip_reset_this_tick
            && tick.saturating_sub(self.car_custom[slot].last_flip_reset_tick) >= 12
        {
            self.car_custom[slot].last_flip_reset_tick = tick;
            let wheels = st.wheels_with_contact();
            let mut wheel_count = 0u32;
            let mut has_ball_wheel = false;
            let mut has_car_wheel = false;
            for w in wheels.iter().flatten() {
                wheel_count += 1;
                match w.user_info {
                    UserInfoType::Ball => has_ball_wheel = true,
                    UserInfoType::Car => has_car_wheel = true,
                    _ => {}
                }
            }
            let dist_to_ball = (st.pos - ball.pos).length();
            let is_ball_reset = has_ball_wheel || (!has_car_wheel && dist_to_ball <= 210.0);
            let (sub_type, obj_code) = if is_ball_reset {
                (1u32, 1u32) // FLIP_RESET_SUBTYPES.BALL, FLIP_RESET_OBJECT_TYPES.BALL
            } else if has_car_wheel {
                (2u32, 2u32) // FLIP_RESET_SUBTYPES.CAR, FLIP_RESET_OBJECT_TYPES.CAR
            } else {
                (3u32, 3u32) // FLIP_RESET_SUBTYPES.CEILING, FLIP_RESET_OBJECT_TYPES.WORLD
            };
            let reset_flags = base_flags | (obj_code << 4) | (0xFF << 8);
            let pev = PhysicsEvent {
                event_type: 0x0F,
                tick,
                pos_x: st.pos.x,
                pos_y: st.pos.y,
                pos_z: st.pos.z,
                norm_x: ball.pos.x,
                norm_y: ball.pos.y,
                norm_z: ball.pos.z,
                speed,
                packed_ids: packed,
                sub_type,
                flags: reset_flags,
                custom_float: wheel_count.max(3) as f32,
                ..Default::default()
            };
            self.push_event(pev);
            self.replay.push_incident(&pev);
        }
    }
}
