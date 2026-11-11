use glam::Vec3A;
use rocketsim::{DemoMode, GameMode, MutatorConfig};

use crate::{
    layout::{BallPredSlicePod, MutatorConfigC, MAX_PREDICTION_STEPS},
    sim_instance::SimInstance,
};

impl SimInstance {
    pub fn update_ball_prediction(&mut self, max_seconds: f32) {
        let Some(arena) = self.arena.as_ref() else {
            self.pred_count = 0;
            return;
        };
        let steps = ((max_seconds * 120.0).round() as usize).clamp(1, MAX_PREDICTION_STEPS);
        let mut pred_arena = arena.clone();
        pred_arena.remove_cars();
        for i in 0..steps {
            let _ = pred_arena.step_tick();
            let b = pred_arena.get_ball_state();
            self.pred_buffer[i] = BallPredSlicePod {
                pos: b.pos.to_array(),
                vel: b.vel.to_array(),
            };
        }
        self.pred_count = steps;
    }

    pub fn get_mutator_config_c(&self) -> MutatorConfigC {
        let m = self
            .arena
            .as_ref()
            .map(|a| *a.mutator_config())
            .unwrap_or_else(|| MutatorConfig::new(GameMode::Soccar));
        MutatorConfigC {
            gravity: m.gravity.to_array(),
            car_mass: m.car_mass,
            car_world_friction: self.car_world_friction,
            car_world_restitution: self.car_world_restitution,
            ball_mass: m.ball_mass,
            ball_max_speed: m.ball_max_speed,
            ball_drag: m.ball_drag,
            ball_world_friction: self.ball_world_friction,
            ball_world_restitution: self.ball_world_restitution,
            jump_accel: m.jump_accel,
            jump_immediate_force: m.jump_immediate_force,
            boost_accel_ground: m.boost_accel_ground,
            boost_accel_air: m.boost_accel_air,
            boost_used_per_second: m.boost_used_per_second,
            respawn_delay: m.respawn_delay,
            bump_cooldown_time: m.bump_cooldown_time,
            boost_pad_cooldown_big: m.boost_pad_cooldown_big,
            boost_pad_cooldown_small: m.boost_pad_cooldown_small,
            car_spawn_boost_amount: m.car_spawn_boost_amount,
            ball_hit_extra_force_scale: m.ball_hit_extra_force_scale,
            bump_force_scale: m.bump_force_scale,
            ball_radius: m.ball_radius,
            unlimited_flips: u8::from(m.unlimited_flips),
            unlimited_double_jumps: u8::from(m.unlimited_double_jumps),
            recharge_boost_enabled: u8::from(m.recharge_boost_enabled),
            _pad0: 0,
            recharge_boost_per_second: m.recharge_boost_per_second,
            recharge_boost_delay: m.recharge_boost_delay,
            demo_mode: m.demo_mode as i32,
            enable_team_demos: u8::from(m.enable_team_demos),
            _pad1: [0; 3],
            goal_base_threshold_y: m.goal_base_threshold_y,
        }
    }

    pub fn set_mutator_config_c(&mut self, c: &MutatorConfigC) -> i32 {
        self.car_world_friction = c.car_world_friction;
        self.car_world_restitution = c.car_world_restitution;
        self.ball_world_friction = c.ball_world_friction;
        self.ball_world_restitution = c.ball_world_restitution;
        let Some(arena) = self.arena.as_mut() else {
            return 0;
        };
        let mut m = *arena.mutator_config();
        m.gravity = Vec3A::from_array(c.gravity);
        m.car_mass = c.car_mass;
        m.ball_mass = c.ball_mass;
        m.ball_max_speed = c.ball_max_speed;
        m.ball_drag = c.ball_drag;
        m.jump_accel = c.jump_accel;
        m.jump_immediate_force = c.jump_immediate_force;
        m.boost_accel_ground = c.boost_accel_ground;
        m.boost_accel_air = c.boost_accel_air;
        m.boost_used_per_second = c.boost_used_per_second;
        m.respawn_delay = c.respawn_delay;
        m.bump_cooldown_time = c.bump_cooldown_time;
        m.boost_pad_cooldown_big = c.boost_pad_cooldown_big;
        m.boost_pad_cooldown_small = c.boost_pad_cooldown_small;
        m.car_spawn_boost_amount = c.car_spawn_boost_amount;
        m.ball_hit_extra_force_scale = c.ball_hit_extra_force_scale;
        m.bump_force_scale = c.bump_force_scale;
        m.ball_radius = c.ball_radius;
        m.unlimited_flips = c.unlimited_flips != 0;
        m.unlimited_double_jumps = c.unlimited_double_jumps != 0;
        m.recharge_boost_enabled = c.recharge_boost_enabled != 0;
        m.recharge_boost_per_second = c.recharge_boost_per_second;
        m.recharge_boost_delay = c.recharge_boost_delay;
        m.demo_mode = match c.demo_mode {
            1 => DemoMode::OnContact,
            2 => DemoMode::Disabled,
            _ => DemoMode::Normal,
        };
        m.enable_team_demos = c.enable_team_demos != 0;
        m.goal_base_threshold_y = c.goal_base_threshold_y;
        arena.set_mutator_config(m);
        1
    }
}
