//! `SimInstance` managing `Arena`, 8 car slots, state buffer sync, ball prediction, snapshots, and events.

use glam::Vec3A;
use rocketsim::{
    Arena, ArenaConfig, ArenaMemWeightMode, CarBodyConfig, GameMode, Team,
};

use crate::{
    layout::{
        BallPredSlicePod, BoostPadInfoPod, CarConfigC, CarControlsPod, GameStateBufferPod,
        PhysicsEvent, PhysicsEventBuffer, WheelPairConfigC, MAX_CARS, MAX_EVENTS_PER_STEP,
        MAX_PADS, MAX_PREDICTION_STEPS,
    },
    reconciler::{ReconcilerRingStorage, SNAPSHOT_RING_CAPACITY},
    replay::ReplayStorage,
};

#[derive(Clone, Copy)]
pub struct CarCustomSettings {
    pub unlimited_boost: bool,
    pub boost_collectable: bool,
    pub recharge_enabled: bool,
    pub recharge_per_second: f32,
    pub recharge_delay: f32,
    pub max_flip_count: i32,
    pub flip_timer_mode: i32,
    pub demo_spawn_selection: i32,
    pub three_wheels: bool,
    pub hitbox_index: i32,
    pub air_flips_used: i32,
    pub last_flip_reset_tick: u32,
}

impl Default for CarCustomSettings {
    fn default() -> Self {
        Self {
            unlimited_boost: false,
            boost_collectable: true,
            recharge_enabled: false,
            recharge_per_second: 10.0,
            recharge_delay: 0.5,
            max_flip_count: 1,
            flip_timer_mode: 0,
            demo_spawn_selection: -1,
            three_wheels: false,
            hitbox_index: 0,
            air_flips_used: 0,
            last_flip_reset_tick: 0,
        }
    }
}

#[derive(Clone)]
pub struct SavedSlotSnapshot {
    pub tick: i32,
    pub arena: Arena,
    pub car_slots: [Option<usize>; MAX_CARS],
    pub car_custom: [CarCustomSettings; MAX_CARS],
    pub state_buffer: GameStateBufferPod,
}

pub struct SimInstance {
    pub arena: Option<Arena>,
    pub car_slots: [Option<usize>; MAX_CARS],
    pub car_custom: [CarCustomSettings; MAX_CARS],
    pub state_buffer: GameStateBufferPod,
    pub controls_buffer: [CarControlsPod; MAX_CARS],
    pub pad_info_buffer: [BoostPadInfoPod; MAX_PADS],
    pub pred_buffer: [BallPredSlicePod; MAX_PREDICTION_STEPS],
    pub pred_count: usize,
    pub event_buffer: PhysicsEventBuffer,
    pub replay: ReplayStorage,
    pub reconciler: ReconcilerRingStorage,
    pub saved_slots: Vec<Option<SavedSlotSnapshot>>,
    pub car_config_cache: [CarConfigC; 7],
    pub unlimited_boost_global: bool,
    pub arena_preset: i32,
    pub goal_box_enabled: bool,
    pub goal_box_half_x: f32,
    pub goal_box_min_y: f32,
    pub goal_box_max_y: f32,
    pub goal_box_max_z: f32,
    pub sim_control_flags: u32,
    pub possession_event_enabled: bool,
    pub possession_reporting_enabled: bool,
    pub sim_frozen: bool,
    pub target_resume_tick: u32,
    pub mask_inputs_while_frozen: bool,
    pub direction_dot_threshold: f32,
    pub car_world_friction: f32,
    pub car_world_restitution: f32,
    pub ball_world_friction: f32,
    pub ball_world_restitution: f32,
    pub ball_motion_state: i32,
    pub possession_car_index: i32,
}

impl Default for SimInstance {
    fn default() -> Self {
        Self::new()
    }
}

impl SimInstance {
    pub fn new() -> Self {
        let mut inst = Self {
            arena: None,
            car_slots: [None; MAX_CARS],
            car_custom: [CarCustomSettings::default(); MAX_CARS],
            state_buffer: GameStateBufferPod::default(),
            controls_buffer: [CarControlsPod::default(); MAX_CARS],
            pad_info_buffer: [BoostPadInfoPod::default(); MAX_PADS],
            pred_buffer: [BallPredSlicePod::default(); MAX_PREDICTION_STEPS],
            pred_count: 0,
            event_buffer: PhysicsEventBuffer::default(),
            replay: ReplayStorage::new(),
            reconciler: ReconcilerRingStorage::new(),
            saved_slots: vec![None; SNAPSHOT_RING_CAPACITY],
            car_config_cache: [CarConfigC::default(); 7],
            unlimited_boost_global: false,
            arena_preset: 0,
            goal_box_enabled: false,
            goal_box_half_x: 892.755,
            goal_box_min_y: 5120.0,
            goal_box_max_y: 6000.0,
            goal_box_max_z: 642.775,
            sim_control_flags: 0x07,
            possession_event_enabled: true,
            possession_reporting_enabled: true,
            sim_frozen: false,
            target_resume_tick: 0,
            mask_inputs_while_frozen: false,
            direction_dot_threshold: 0.25,
            car_world_friction: 0.3,
            car_world_restitution: 0.1,
            ball_world_friction: 0.35,
            ball_world_restitution: 0.6,
            ball_motion_state: 0,
            possession_car_index: -1,
        };
        for i in 0..7 {
            let cfg = Self::base_hitbox_config(i as i32);
            inst.car_config_cache[i] = Self::car_config_to_c(&cfg);
        }
        inst
    }

    pub fn base_hitbox_config(idx: i32) -> CarBodyConfig {
        match idx {
            1 => CarBodyConfig::DOMINUS,
            2 => CarBodyConfig::PLANK,
            3 => CarBodyConfig::BREAKOUT,
            4 => CarBodyConfig::HYBRID,
            5 => CarBodyConfig::MERC,
            6 => CarBodyConfig::PSYCLOPS,
            _ => CarBodyConfig::OCTANE,
        }
    }

    pub fn hitbox_config_from_index(&self, idx: i32) -> CarBodyConfig {
        let mut cfg = Self::base_hitbox_config(idx);
        let c = &self.car_config_cache[idx.clamp(0, 6) as usize];
        cfg.hitbox_size = Vec3A::from_array(c.hitbox_size);
        cfg.hitbox_pos_offset = Vec3A::from_array(c.hitbox_pos_offset);
        cfg.front_wheels.wheel_radius = c.front_wheels.wheel_radius;
        cfg.front_wheels.suspension_rest_length = c.front_wheels.suspension_rest_length;
        cfg.front_wheels.connection_point_offset =
            Vec3A::from_array(c.front_wheels.connection_point_offset);
        cfg.back_wheels.wheel_radius = c.back_wheels.wheel_radius;
        cfg.back_wheels.suspension_rest_length = c.back_wheels.suspension_rest_length;
        cfg.back_wheels.connection_point_offset =
            Vec3A::from_array(c.back_wheels.connection_point_offset);
        cfg.three_wheels = c.three_wheels != 0 || idx == 6;
        cfg.dodge_deadzone = c.dodge_deadzone;
        cfg
    }

    pub fn car_config_to_c(cfg: &CarBodyConfig) -> CarConfigC {
        CarConfigC {
            hitbox_size: cfg.hitbox_size.to_array(),
            hitbox_pos_offset: cfg.hitbox_pos_offset.to_array(),
            front_wheels: WheelPairConfigC {
                wheel_radius: cfg.front_wheels.wheel_radius,
                suspension_rest_length: cfg.front_wheels.suspension_rest_length,
                connection_point_offset: cfg.front_wheels.connection_point_offset.to_array(),
            },
            back_wheels: WheelPairConfigC {
                wheel_radius: cfg.back_wheels.wheel_radius,
                suspension_rest_length: cfg.back_wheels.suspension_rest_length,
                connection_point_offset: cfg.back_wheels.connection_point_offset.to_array(),
            },
            three_wheels: u8::from(cfg.three_wheels),
            _pad: [0; 3],
            dodge_deadzone: cfg.dodge_deadzone,
        }
    }

    pub fn create_arena(&mut self) -> i32 {
        let mut config = ArenaConfig::new(GameMode::Soccar);
        config.mem_weight_mode = ArenaMemWeightMode::Light;
        if self.arena_preset == 1 {
            config.min_pos = Vec3A::new(-4500.0, -7500.0, -100.0);
            config.max_pos = Vec3A::new(4500.0, 7500.0, 2200.0);
        }
        let arena = Arena::new_with_config(config);
        self.car_slots = [None; MAX_CARS];
        self.car_custom = [CarCustomSettings::default(); MAX_CARS];

        let pad_count = arena.num_boost_pads().min(MAX_PADS);
        for i in 0..pad_count {
            let cfg = arena.get_boost_pad_config(i);
            self.pad_info_buffer[i] = BoostPadInfoPod {
                pos: cfg.pos.to_array(),
                is_big: if cfg.is_big { 1.0 } else { 0.0 },
            };
        }

        self.arena = Some(arena);
        self.sync_state_to_buffer();
        1
    }

    pub fn active_car_mask(&self) -> i32 {
        let mut mask = 0i32;
        for (slot, id) in self.car_slots.iter().enumerate() {
            if id.is_some() {
                mask |= 1 << slot;
            }
        }
        mask
    }

    pub fn active_car_count(&self) -> i32 {
        self.car_slots.iter().filter(|s| s.is_some()).count() as i32
    }

    pub fn highest_car_slot_len(&self) -> usize {
        for i in (0..MAX_CARS).rev() {
            if self.car_slots[i].is_some() {
                return i + 1;
            }
        }
        0
    }

    pub fn add_car_at_slot(&mut self, slot: usize, team: i32, hitbox_index: i32) -> i32 {
        if slot >= MAX_CARS {
            return -1;
        }
        let cfg = self.hitbox_config_from_index(hitbox_index);
        let Some(arena) = self.arena.as_mut() else {
            return -1;
        };
        let rs_team = if team == 0 { Team::Blue } else { Team::Orange };

        if let Some(car_id) = self.car_slots[slot] {
            arena.set_car_team(car_id, rs_team);
            arena.set_car_config(car_id, cfg);
        } else {
            let car_id = arena.add_car(rs_team, cfg);
            self.car_slots[slot] = Some(car_id);
        }

        self.car_custom[slot] = CarCustomSettings {
            unlimited_boost: self.unlimited_boost_global,
            three_wheels: cfg.three_wheels,
            hitbox_index,
            ..CarCustomSettings::default()
        };
        self.sync_state_to_buffer();
        slot as i32
    }

    pub fn add_car(&mut self, team: i32, hitbox_index: i32) -> i32 {
        for slot in 0..MAX_CARS {
            if self.car_slots[slot].is_none() {
                return self.add_car_at_slot(slot, team, hitbox_index);
            }
        }
        -1
    }

    pub fn remove_car(&mut self, slot: usize) -> i32 {
        if slot >= MAX_CARS {
            return 0;
        }
        let Some(car_id) = self.car_slots[slot].take() else {
            return 0;
        };
        if let Some(arena) = self.arena.as_mut() {
            arena.remove_car(car_id);
            for other in self.car_slots.iter_mut().flatten() {
                if *other > car_id {
                    *other -= 1;
                }
            }
        }
        self.state_buffer.cars[slot] = Default::default();
        self.state_buffer.car_jump_air[slot] = Default::default();
        self.sync_state_to_buffer();
        1
    }

    pub fn push_event(&mut self, ev: PhysicsEvent) {
        let slot = (self.event_buffer.write_seq as usize) % MAX_EVENTS_PER_STEP;
        self.event_buffer.events[slot] = ev;
        self.event_buffer.write_seq = self.event_buffer.write_seq.wrapping_add(1);
    }
}
