//! Exact C-ABI linear memory layouts matching `RocketSimStateViews.ts` and `RocketSimConstants.ts`.

pub const MAX_CARS: usize = 8;
pub const MAX_PADS: usize = 34;
pub const MAX_PREDICTION_STEPS: usize = 600;
pub const MAX_EVENTS_PER_STEP: usize = 256;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct ArenaHeaderPod {
    pub tick_count: f32,
    pub goal_scored_flag: f32,
    pub num_cars: f32,
    pub num_pads: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BallStatePod {
    pub pos: [f32; 3],
    pub forward: [f32; 3],
    pub right: [f32; 3],
    pub up: [f32; 3],
    pub vel: [f32; 3],
    pub ang_vel: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct WheelTelemetryPod {
    pub suspension_length: f32,
    pub steer_angle: f32,
    pub has_contact: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CarStatePod {
    pub pos: [f32; 3],
    pub forward: [f32; 3],
    pub right: [f32; 3],
    pub up: [f32; 3],
    pub vel: [f32; 3],
    pub ang_vel: [f32; 3],
    pub boost: f32,
    pub is_on_ground: f32,
    pub is_supersonic: f32,
    pub is_demoed: f32,
    pub has_flip_or_jump: f32,
    pub is_boosting: f32,
    pub is_flipping: f32,
    pub wheels: [WheelTelemetryPod; 4],
    pub ground_normal: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BoostPadStatePod {
    pub is_active: f32,
    pub cooldown: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CarJumpAirTelemetryPod {
    pub is_jumping: f32,
    pub air_time: f32,
    pub jump_time: f32,
    pub air_time_since_jump: f32,
}

/// 448 floats (1792 bytes) shared state buffer mapped into `RocketSimStateViews.ts`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct GameStateBufferPod {
    pub header: ArenaHeaderPod,                        // 0..4 (4)
    pub ball: BallStatePod,                            // 4..22 (18)
    pub cars: [CarStatePod; MAX_CARS],                 // 22..342 (320)
    pub pads: [BoostPadStatePod; MAX_PADS],            // 342..410 (68)
    pub is_ball_sleeping: f32,                         // 410 (EXTENDED_STATE_OFFSETS.IS_BALL_SLEEPING)
    pub is_simulation_frozen: f32,                     // 411 (EXTENDED_STATE_OFFSETS.IS_SIMULATION_FROZEN)
    pub possession_team: f32,                          // 412 (EXTENDED_STATE_OFFSETS.POSSESSION_STATE)
    pub blue_possession_points: f32,                   // 413 (EXTENDED_STATE_OFFSETS.POSSESSION_BLUE_POINTS)
    pub orange_possession_points: f32,                 // 414 (EXTENDED_STATE_OFFSETS.POSSESSION_ORANGE_POINTS)
    pub possession_time_accumulator: f32,              // 415 (EXTENDED_STATE_OFFSETS.POSSESSION_DURATION)
    pub car_jump_air: [CarJumpAirTelemetryPod; MAX_CARS], // 416..448 (32)
}

impl Default for GameStateBufferPod {
    fn default() -> Self {
        Self {
            header: ArenaHeaderPod::default(),
            ball: BallStatePod::default(),
            cars: [CarStatePod::default(); MAX_CARS],
            pads: [BoostPadStatePod::default(); MAX_PADS],
            is_ball_sleeping: 0.0,
            is_simulation_frozen: 0.0,
            possession_team: -1.0,
            blue_possession_points: 0.0,
            orange_possession_points: 0.0,
            possession_time_accumulator: 0.0,
            car_jump_air: [CarJumpAirTelemetryPod::default(); MAX_CARS],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CarControlsPod {
    pub throttle: f32,
    pub steer: f32,
    pub pitch: f32,
    pub yaw: f32,
    pub roll: f32,
    pub jump: f32,
    pub boost: f32,
    pub handbrake: f32,
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BoostPadInfoPod {
    pub pos: [f32; 3],
    pub is_big: f32,
}

/// 9 floats (pos[3], vel[3], ang_vel[3]) matching `BALL_PRED_STRIDE = 9`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BallPredSlicePod {
    pub pos: [f32; 3],
    pub vel: [f32; 3],
    pub ang_vel: [f32; 3],
}

/// 64-byte (16-word) cache-line aligned event slot matching `PhysicsEventReader.ts` (`strideWords === 16`)
/// and `RCReplayBinarySchema.ts` (`RC_REPLAY_EVENT_STRIDE = 64`).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct PhysicsEvent {
    pub event_type: u32,     // word 0
    pub tick: u32,           // word 1
    pub pos_x: f32,          // word 2
    pub pos_y: f32,          // word 3
    pub pos_z: f32,          // word 4
    pub norm_x: f32,         // word 5
    pub norm_y: f32,         // word 6
    pub norm_z: f32,         // word 7
    pub normal_rel_vel: f32, // word 8
    pub speed: f32,          // word 9
    pub impulse: f32,        // word 10
    pub packed_ids: u32,     // word 11: (primary_id & 0xFFFF) | ((secondary_id & 0xFFFF) << 16)
    pub sub_type: u32,       // word 12
    pub flags: u32,          // word 13
    pub custom_float: f32,   // word 14
    pub custom_int: u32,     // word 15
}

impl PhysicsEvent {
    #[inline]
    pub const fn pack_ids(primary_id: i32, secondary_id: i32) -> u32 {
        ((primary_id as u32) & 0xFFFF) | (((secondary_id as u32) & 0xFFFF) << 16)
    }
}

/// 16-byte header (`[writeSeq, capacity(256), eventSize(64), droppedCount]`) + 256 * 64-byte ring buffer.
#[repr(C)]
pub struct PhysicsEventBuffer {
    pub write_seq: u32,
    pub capacity: u32,
    pub event_size: u32,
    pub dropped_count: u32,
    pub events: [PhysicsEvent; MAX_EVENTS_PER_STEP],
}

impl Default for PhysicsEventBuffer {
    fn default() -> Self {
        Self {
            write_seq: 0,
            capacity: MAX_EVENTS_PER_STEP as u32,
            event_size: core::mem::size_of::<PhysicsEvent>() as u32,
            dropped_count: 0,
            events: [PhysicsEvent::default(); MAX_EVENTS_PER_STEP],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct WheelPairConfigC {
    pub wheel_radius: f32,
    pub suspension_rest_length: f32,
    pub connection_point_offset: [f32; 3],
}

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct CarConfigC {
    pub hitbox_size: [f32; 3],
    pub hitbox_pos_offset: [f32; 3],
    pub front_wheels: WheelPairConfigC,
    pub back_wheels: WheelPairConfigC,
    pub three_wheels: u8,
    pub _pad: [u8; 3],
    pub dodge_deadzone: f32,
}

/// 112-byte C-ABI `MutatorConfig` matching `mutatorConfigPipeline.ts`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct MutatorConfigC {
    pub gravity: [f32; 3],
    pub car_mass: f32,
    pub car_world_friction: f32,
    pub car_world_restitution: f32,
    pub ball_mass: f32,
    pub ball_max_speed: f32,
    pub ball_drag: f32,
    pub ball_world_friction: f32,
    pub ball_world_restitution: f32,
    pub jump_accel: f32,
    pub jump_immediate_force: f32,
    pub boost_accel_ground: f32,
    pub boost_accel_air: f32,
    pub boost_used_per_second: f32,
    pub respawn_delay: f32,
    pub bump_cooldown_time: f32,
    pub boost_pad_cooldown_big: f32,
    pub boost_pad_cooldown_small: f32,
    pub car_spawn_boost_amount: f32,
    pub ball_hit_extra_force_scale: f32,
    pub bump_force_scale: f32,
    pub ball_radius: f32,
    pub unlimited_flips: u8,
    pub unlimited_double_jumps: u8,
    pub recharge_boost_enabled: u8,
    pub _pad0: u8,
    pub recharge_boost_per_second: f32,
    pub recharge_boost_delay: f32,
    pub demo_mode: i32,
    pub enable_team_demos: u8,
    pub _pad1: [u8; 3],
    pub goal_base_threshold_y: f32,
}
