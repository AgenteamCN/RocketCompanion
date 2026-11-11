//! Fixed `#[repr(C)]` POD memory contracts and policy architecture descriptors for `rc_bot_ai`.

use rc_physics_sim::layout::{CarControlsPod, MAX_CARS, MAX_PADS};

pub const MAX_BOT_POLICIES: usize = 16;
pub const MAX_MLP_LAYERS: usize = 8;
pub const MAX_MLP_OBS_DIM: usize = 320;
pub const MAX_MLP_HIDDEN_DIM: usize = 1536;
pub const MAX_BOT_ACTION_LOGITS: usize = 384;
pub const MAX_PERCEIVER_ENTITIES: usize = 64;
pub const PERCEIVER_QUERY_DIM: usize = 32;
pub const PERCEIVER_ENTITY_DIM: usize = 24;
pub const PERCEIVER_EMBED_DIM: usize = 128;
pub const RIPPLE_ACTION_QUEUE_LEN: usize = 6;
pub const RIPPLE_OTHER_SLOTS: usize = 5;
pub const RIPPLE_BALL_SLICES: usize = 6;
pub const KICKOFF_MAX_PRECOMPUTE_STEPS: usize = 128;

/// Numeric policy identifier matching `EXPERIMENTAL_BOT_POLICIES` and Kickoff v1/v2 agents.
#[repr(u32)]
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default)]
pub enum BotPolicyId {
    #[default]
    Heuristic = 0,
    Nexto = 1,
    Necto = 2,
    KickoffV1Ppo = 3,
    KickoffV2SafeTensors = 4,
    Chronos = 5,
    Dice = 6,
    Ducky = 7,
    Fury = 8,
    Galactus = 9,
    Kira = 10,
    Rain = 11,
    RippleV1_1 = 12,
}

impl BotPolicyId {
    #[inline]
    pub const fn from_i32(raw: i32) -> Self {
        match raw {
            1 => Self::Nexto,
            2 => Self::Necto,
            3 => Self::KickoffV1Ppo,
            4 => Self::KickoffV2SafeTensors,
            5 => Self::Chronos,
            6 => Self::Dice,
            7 => Self::Ducky,
            8 => Self::Fury,
            9 => Self::Galactus,
            10 => Self::Kira,
            11 => Self::Rain,
            12 => Self::RippleV1_1,
            _ => Self::Heuristic,
        }
    }

    #[inline]
    pub const fn default_tick_skip(self) -> u32 {
        match self {
            Self::Heuristic | Self::KickoffV1Ppo | Self::KickoffV2SafeTensors | Self::RippleV1_1 => {
                4
            }
            Self::Rain => 6,
            _ => 8,
        }
    }

    #[inline]
    pub const fn supports_scripted_kickoff(self) -> bool {
        matches!(self, Self::Nexto)
    }
}

/// Per-car configuration and runtime telemetry slot in `BotBatchInferenceOutputPod`.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BotCarSlotDiagnosticsPod {
    pub policy_id: u32,
    pub team: u32,
    pub tick_skip: u32,
    pub tick_skip_remaining: u32,
    pub kickoff_step: u32,
    pub last_action_index: i32,
    pub used_scripted_kickoff: u32,
    pub model_ready_flag: u32,
}

/// Zero-copy C-ABI batch inference output block read directly by TypeScript.
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct BotBatchInferenceOutputPod {
    pub active_bot_mask: u32,
    pub inferred_this_step_mask: u32,
    pub loaded_policy_mask: u32,
    pub last_step_tick: u32,
    pub controls: [CarControlsPod; MAX_CARS],
    pub slot_diagnostics: [BotCarSlotDiagnosticsPod; MAX_CARS],
    pub prev_actions_flat: [[f32; 8]; MAX_CARS],
}

/// Single step entry for zero-copy kickoff timeline precomputation (`KickoffV2` / `KickoffPPO`).
#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct KickoffTimelineStepPod {
    pub step_index: u32,
    pub start_tick: u32,
    pub end_tick: u32,
    pub multi_discrete_act: [u8; 6],
    pub _pad: [u8; 2],
    pub controls: CarControlsPod,
}

/// Precomputed kickoff timeline header + step array exposed via `_physics_getBotKickoffTimelinePtr`.
#[repr(C)]
#[derive(Clone, Copy)]
pub struct KickoffTimelineBufferPod {
    pub spawn_index: u32,
    pub step_count: u32,
    pub touch_tick: u32,
    pub touch_step: u32,
    pub steps: [KickoffTimelineStepPod; KICKOFF_MAX_PRECOMPUTE_STEPS],
}

impl Default for KickoffTimelineBufferPod {
    fn default() -> Self {
        Self {
            spawn_index: 0,
            step_count: 0,
            touch_tick: 0,
            touch_step: 0,
            steps: [KickoffTimelineStepPod::default(); KICKOFF_MAX_PRECOMPUTE_STEPS],
        }
    }
}

/// Static architecture specification for GigaLearn / RocketForge Sequential MLP policies.
#[derive(Clone, Copy)]
pub struct MlpPolicyArchSpec {
    pub policy_id: BotPolicyId,
    pub obs_dim: usize,
    pub shared_dims: &'static [usize],
    pub policy_dims: &'static [usize],
    pub out_dim: usize,
    pub leaky_alpha: f32,
    pub mirror_x: bool,
}

pub const CHRONOS_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Chronos,
    obs_dim: 225,
    shared_dims: &[960, 960],
    policy_dims: &[960, 800, 640, 640],
    out_dim: 90,
    leaky_alpha: 0.0,
    mirror_x: true,
};

pub const DICE_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Dice,
    obs_dim: 167,
    shared_dims: &[900, 900],
    policy_dims: &[900, 900, 900],
    out_dim: 90,
    leaky_alpha: 0.01,
    mirror_x: false,
};

pub const DUCKY_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Ducky,
    obs_dim: 295,
    shared_dims: &[],
    policy_dims: &[512, 512, 512, 256],
    out_dim: 90,
    leaky_alpha: 0.0,
    mirror_x: false,
};

pub const FURY_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Fury,
    obs_dim: 318,
    shared_dims: &[1536, 1536],
    policy_dims: &[1024, 1024, 1024],
    out_dim: 380,
    leaky_alpha: 0.0,
    mirror_x: false,
};

pub const GALACTUS_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Galactus,
    obs_dim: 258,
    shared_dims: &[1024, 1024],
    policy_dims: &[1024, 1024, 1024, 1024],
    out_dim: 90,
    leaky_alpha: 0.01,
    mirror_x: false,
};

pub const KIRA_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Kira,
    obs_dim: 109,
    shared_dims: &[1024, 1024, 1024],
    policy_dims: &[1024, 1024, 512, 512],
    out_dim: 90,
    leaky_alpha: 0.0,
    mirror_x: false,
};

pub const RAIN_SPEC: MlpPolicyArchSpec = MlpPolicyArchSpec {
    policy_id: BotPolicyId::Rain,
    obs_dim: 231,
    shared_dims: &[1280],
    policy_dims: &[1024, 768, 512, 256],
    out_dim: 90,
    leaky_alpha: 0.0,
    mirror_x: false,
};

/// Canonical mapping from Y-sorted 34 boost pads (`CommonValues::BOOST_LOCATIONS`) to RocketSim pad indices.
pub const CANONICAL_TO_WASM_PAD_INDEX: [usize; MAX_PADS] = [
    6, 7, 8, 4, 5, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 0, 19, 20, 1, 21, 22, 23, 24, 25, 26,
    27, 28, 29, 30, 2, 3, 31, 32, 33,
];

pub const POS_COEF: f32 = 1.0 / 5000.0;
pub const VEL_COEF: f32 = 1.0 / 2300.0;
pub const ANG_VEL_COEF: f32 = 1.0 / 3.0;

pub const FURY_POS_COEF_X: f32 = 1.0 / 4096.0;
pub const FURY_POS_COEF_Y: f32 = 1.0 / 6000.0;
pub const FURY_POS_COEF_Z: f32 = 1.0 / 2044.0;
pub const FURY_VEL_COEF: f32 = 1.0 / 2300.0;
pub const FURY_ANG_VEL_COEF: f32 = 1.0 / 5.5;

pub const BLUE_GOAL_BACK: [f32; 3] = [0.0, -6000.0, 321.3875];
pub const ORANGE_GOAL_BACK: [f32; 3] = [0.0, 6000.0, 321.3875];
pub const BIG_BOOST_PAD_INDICES: [usize; 6] = [3, 4, 15, 18, 29, 30];

pub const KICKOFF_SPAWN_TEAM0_XY: [[f32; 2]; 5] = [
    [2048.0, -2560.0],
    [-2048.0, -2560.0],
    [256.0, -3840.0],
    [-256.0, -3840.0],
    [0.0, -4608.0],
];

pub const CANONICAL_BOOST_LOCATIONS: [[f32; 3]; MAX_PADS] = [
    [0.0, -4240.0, 70.0],
    [-1792.0, -4184.0, 70.0],
    [1792.0, -4184.0, 70.0],
    [-3072.0, -4096.0, 73.0],
    [3072.0, -4096.0, 73.0],
    [-940.0, -3308.0, 70.0],
    [940.0, -3308.0, 70.0],
    [0.0, -2816.0, 70.0],
    [-3584.0, -2484.0, 70.0],
    [3584.0, -2484.0, 70.0],
    [-1788.0, -2300.0, 70.0],
    [1788.0, -2300.0, 70.0],
    [-2048.0, -1036.0, 70.0],
    [0.0, -1024.0, 70.0],
    [2048.0, -1036.0, 70.0],
    [-3584.0, 0.0, 73.0],
    [-1024.0, 0.0, 70.0],
    [1024.0, 0.0, 70.0],
    [3584.0, 0.0, 73.0],
    [-2048.0, 1036.0, 70.0],
    [0.0, 1024.0, 70.0],
    [2048.0, 1036.0, 70.0],
    [-1788.0, 2300.0, 70.0],
    [1788.0, 2300.0, 70.0],
    [-3584.0, 2484.0, 70.0],
    [3584.0, 2484.0, 70.0],
    [0.0, 2816.0, 70.0],
    [-940.0, 3310.0, 70.0],
    [940.0, 3308.0, 70.0],
    [-3072.0, 4096.0, 73.0],
    [3072.0, 4096.0, 73.0],
    [-1792.0, 4184.0, 70.0],
    [1792.0, 4184.0, 70.0],
    [0.0, 4240.0, 70.0],
];

pub const MIRROR_X_PAD_INDEX: [usize; MAX_PADS] = [
    0, 2, 1, 4, 3, 6, 5, 7, 9, 8, 11, 10, 14, 13, 12, 18, 17, 16, 15, 21, 20, 19, 23, 22, 25, 24,
    26, 28, 27, 30, 29, 32, 31, 33,
];

