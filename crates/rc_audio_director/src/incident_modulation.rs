//! Kinetic intensity modulation, non-repeating variation selection, surface taxonomy,
//! and priority/cooldown calibration for discrete physics incidents and vehicle actions.

use crate::{
    ball_loops::evaluate_profile_distance_gain,
    config_pod::AudioDirectorConfigPod,
    pod_types::{
        AudioFrameCuePod, AudioListenerStatePod, AudioOneShotSlotPod, MAX_AUDIO_ONE_SHOT_SLOTS,
    },
};

pub mod event_codes {
    pub const NONE: u32 = 0x00;
    pub const CAR_BALL_HIT: u32 = 0x01;
    pub const CAR_CAR_BUMP: u32 = 0x02;
    pub const CAR_CAR_DEMO: u32 = 0x03;
    pub const BALL_WORLD_HIT: u32 = 0x04;
    pub const BALL_GOALPOST_HIT: u32 = 0x05;
    pub const CAR_JUMP: u32 = 0x06;
    pub const CAR_DOUBLE_JUMP: u32 = 0x07;
    pub const CAR_DODGE: u32 = 0x08;
    pub const CAR_SUPERSONIC_ENTER: u32 = 0x09;
    pub const BOOST_PICKUP: u32 = 0x0A;
    pub const BOOST_SPAWN: u32 = 0x0B;
    pub const CAR_BOOST_START: u32 = 0x0C;
    pub const CAR_BOOST_STOP: u32 = 0x0D;
    pub const GOAL_SCORED: u32 = 0x0E;
    pub const FLIP_RESET_GAINED: u32 = 0x0F;
    pub const WHEEL_IMPACT: u32 = 0x12;
    pub const CAR_ACTION: u32 = 0x3E;
}

pub mod surface_subtypes {
    pub const NONE: u32 = 0;
    pub const FLOOR: u32 = 1;
    pub const CEILING: u32 = 2;
    pub const SIDE_WALL: u32 = 3;
    pub const BACKBOARD: u32 = 4;
    pub const CORNER_45: u32 = 5;
    pub const RAMP_GROUND: u32 = 6;
    pub const RAMP_CEILING: u32 = 7;
    pub const GOALPOST: u32 = 8;
    pub const CROSSBAR: u32 = 9;
    pub const OTHER_CURVE: u32 = 10;
}

pub mod categories {
    pub const DEMOLISH: u32 = 0;
    pub const GOAL_EXPLOSION: u32 = 1;
    pub const GOALPOST_PING_LARGE: u32 = 2;
    pub const CAR_BALL_HIT: u32 = 3;
    pub const CAR_BUMP: u32 = 4;
    pub const GOALPOST_PING_SMALL: u32 = 5;
    pub const BOOST_OTHER: u32 = 6;
    pub const JUMP_DODGE_OTHER: u32 = 7;
    pub const SUPERSONIC_OTHER: u32 = 8;
    pub const FLIP_RESET_OTHER: u32 = 9;
    pub const ENGINE_OTHER: u32 = 10;
    pub const WORLD_SURFACE: u32 = 11;
    pub const BOOST_PICKUP: u32 = 12;
    pub const WHEEL_LANDING: u32 = 13;
    pub const BALL_ROLLING: u32 = 14;
    pub const BALL_FLYING: u32 = 15;
}

pub mod slot_priority {
    pub const GOAL_EXPLOSION: u32 = 10;
    pub const DEMOLISH: u32 = 9;
    pub const SIGNAL_BROADCAST: u32 = 8;
    pub const GOALPOST_PING_LARGE: u32 = 8;
    pub const GOALPOST_PING_SMALL: u32 = 7;
    pub const CAR_BALL_HIT_HEAVY: u32 = 7;
    pub const CAR_BALL_HIT_BASE: u32 = 6;
    pub const CAR_CAR_BUMP_HEAVY: u32 = 6;
    pub const CAR_CAR_BUMP_BASE: u32 = 5;
    pub const BOOST_PICKUP_SELF_BIG: u32 = 5;
    pub const BOOST_PICKUP_SELF_SMALL: u32 = 4;
    pub const WORLD_NET_BACKBOARD_HIT: u32 = 4;
    pub const WORLD_RAMP_HIT: u32 = 3;
    pub const WORLD_FLOOR_HIT: u32 = 2;
    pub const BOOST_PICKUP_OTHER: u32 = 2;
}

pub mod cooldown_ticks {
    pub const GOAL_SCORED: u32 = 300;
    pub const CAR_CAR_DEMO: u32 = 11;
    pub const CAR_CAR_BUMP_GLOBAL: u32 = 4;
    pub const BOOST_PICKUP_PER_PAD: u32 = 18;
    pub const WHEEL_LANDING_PER_CAR: u32 = 17;
    pub const BOOST_EDGE_PER_CAR: u32 = 5;
    pub const JUMP_ACTION_PER_CAR: u32 = 5;
    pub const SUPERSONIC_ENTER_PER_CAR: u32 = 30;
    pub const FLIP_RESET_PER_CAR: u32 = 60;
}

#[derive(Clone, Copy)]
pub struct IncidentModulationParams {
    pub category_idx: u32,
    pub vol_mult: f32,
    pub radius_scale: f32,
    pub playback_rate: f32,
    pub priority: u32,
    pub intensity: f32,
}

#[inline]
pub fn smoothstep01(t: f32) -> f32 {
    let x = t.clamp(0.0, 1.0);
    x * x * (3.0 - 2.0 * x)
}

#[inline]
pub fn ms_to_ticks_120hz(ms: f32) -> u32 {
    if !ms.is_finite() || ms <= 0.0 {
        return 0;
    }
    ((ms * 0.12).round() as u32).max(1)
}

#[inline]
pub fn next_rng_u32(rng_state: &mut u32) -> u32 {
    let mut x = if *rng_state == 0 {
        0x9E37_79B9
    } else {
        *rng_state
    };
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    *rng_state = x;
    x
}

#[inline]
pub fn select_non_repeating_variant(rng_state: &mut u32, pool_len: u32, prev_variant: u32) -> u32 {
    if pool_len <= 1 {
        return 0;
    }
    let mut idx = next_rng_u32(rng_state) % pool_len;
    if idx == prev_variant {
        idx = (idx + 1) % pool_len;
    }
    idx
}

#[inline]
pub fn classify_ball_hit_surface(
    x: f32,
    y: f32,
    z: f32,
    _nx: f32,
    ny: f32,
    nz: f32,
    is_goalpost: bool,
) -> u32 {
    let is_near_goal = y.abs() >= 4950.0;
    let is_crossbar = (z - 642.78).abs() < 95.0 && x.abs() <= 960.0;
    let is_upright_post = (x.abs() - 892.755).abs() < 95.0 && z <= 720.0;

    if is_goalpost || (is_near_goal && (is_crossbar || is_upright_post)) {
        return if is_crossbar {
            surface_subtypes::CROSSBAR
        } else {
            surface_subtypes::GOALPOST
        };
    }
    if nz >= 0.8 {
        return surface_subtypes::FLOOR;
    }
    if nz <= -0.8 {
        return surface_subtypes::CEILING;
    }
    if nz <= 0.05 {
        if ny.abs() >= 0.7 && y.abs() >= 4800.0 {
            return surface_subtypes::BACKBOARD;
        }
        if x.abs() >= 2900.0 && y.abs() >= 3800.0 {
            return surface_subtypes::CORNER_45;
        }
        return surface_subtypes::SIDE_WALL;
    }
    surface_subtypes::RAMP_GROUND
}

#[inline]
pub fn pack_priority_variant(priority: u32, variant_idx: u32, is_2d_stereo: bool) -> u32 {
    (priority & 0xFF) | ((variant_idx & 0xFF) << 8) | (u32::from(is_2d_stereo) << 16)
}

#[inline]
pub fn listener_distance_and_atten(
    pos_uu: [f32; 3],
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    category_idx: u32,
    radius_scale: f32,
) -> (f32, bool) {
    let has_listener = (listener.flags & 2) != 0;
    if !has_listener {
        return (1.0, false);
    }
    let dx = pos_uu[0] - listener.pos_uu[0];
    let dy = pos_uu[1] - listener.pos_uu[1];
    let dz = pos_uu[2] - listener.pos_uu[2];
    let dist = (dx * dx + dy * dy + dz * dz).sqrt();
    let profile = &cfg.attenuation_profiles[(category_idx as usize).min(15)];
    evaluate_profile_distance_gain(dist, profile, cfg.arena_acoustic_scale, radius_scale)
}

#[inline]
pub fn push_one_shot_slot(cue: &mut AudioFrameCuePod, slot: AudioOneShotSlotPod) {
    if slot.final_gain <= 1e-5 {
        return;
    }
    let incoming_prio = slot.priority_and_variant & 0xFF;
    let count = cue.one_shot_count as usize;
    if count < MAX_AUDIO_ONE_SHOT_SLOTS {
        cue.one_shots[count] = slot;
        cue.one_shot_count = (count + 1) as u32;
    } else {
        let mut min_prio = u32::MAX;
        let mut min_idx = None;
        for i in 0..MAX_AUDIO_ONE_SHOT_SLOTS {
            let p = cue.one_shots[i].priority_and_variant & 0xFF;
            if p < min_prio {
                min_prio = p;
                min_idx = Some(i);
            }
        }
        if let Some(idx) = min_idx
            && incoming_prio >= min_prio
        {
            cue.one_shots[idx] = slot;
        }
    }

    if slot.final_gain > cue.primary_impact_gain {
        cue.primary_impact_gain = slot.final_gain;
        cue.primary_impact_pitch = slot.playback_rate;
        cue.primary_impact_pos = [
            slot.audio_pos_meters[0] * 100.0,
            slot.audio_pos_meters[2] * 100.0,
            slot.audio_pos_meters[1] * 100.0,
        ];
    }
}

#[inline]
pub fn calibrate_car_ball_hit(
    metric: f32,
    threshold: f32,
    is_supersonic: bool,
    is_self_touch: bool,
) -> IncidentModulationParams {
    let span = (2400.0 - threshold).max(400.0);
    let norm = ((metric - threshold) / span).clamp(0.0, 1.0);
    let bonus = if is_supersonic { 0.12 } else { 0.0 };
    let intensity = (smoothstep01(norm) + bonus).clamp(0.0, 1.0);
    let base_vol = 0.62 + 0.56 * intensity.powf(0.75);
    let self_presence = if is_self_touch { 1.06 } else { 1.0 };
    IncidentModulationParams {
        category_idx: categories::CAR_BALL_HIT,
        vol_mult: (base_vol * self_presence).clamp(0.45, 1.30),
        radius_scale: (0.78 + 0.50 * intensity).clamp(0.75, 1.35),
        playback_rate: (0.96 + 0.08 * intensity).clamp(0.92, 1.08),
        priority: if intensity >= 0.65 || is_self_touch {
            slot_priority::CAR_BALL_HIT_HEAVY
        } else {
            slot_priority::CAR_BALL_HIT_BASE
        },
        intensity,
    }
}

#[inline]
pub fn calibrate_car_bump(rel_speed: f32, involves_self: bool) -> IncidentModulationParams {
    let intensity = smoothstep01((rel_speed - 180.0) / 1900.0);
    IncidentModulationParams {
        category_idx: categories::CAR_BUMP,
        vol_mult: ((0.60 + 0.52 * intensity) * if involves_self { 1.12 } else { 1.0 })
            .clamp(0.45, 1.30),
        radius_scale: ((0.75 + 0.45 * intensity) * if involves_self { 1.15 } else { 1.0 })
            .clamp(0.70, 1.30),
        playback_rate: (0.95 + 0.10 * intensity).clamp(0.90, 1.10),
        priority: if involves_self || intensity >= 0.60 {
            slot_priority::CAR_CAR_BUMP_HEAVY
        } else {
            slot_priority::CAR_CAR_BUMP_BASE
        },
        intensity,
    }
}

#[inline]
pub fn calibrate_world_surface(
    normal_vel: f32,
    threshold: f32,
    surface_tag: u32,
) -> (IncidentModulationParams, u32) {
    let intensity = smoothstep01((normal_vel - threshold) / 1650.0);
    let is_backboard = surface_tag == surface_subtypes::BACKBOARD;
    let backboard_boost = if is_backboard { 1.12 } else { 1.0 };
    let is_floor = surface_tag == surface_subtypes::FLOOR;
    let is_net = matches!(
        surface_tag,
        surface_subtypes::CEILING
            | surface_subtypes::SIDE_WALL
            | surface_subtypes::BACKBOARD
            | surface_subtypes::CORNER_45
    );
    let (priority, pool_len) = if is_floor {
        (slot_priority::WORLD_FLOOR_HIT, 3)
    } else if is_net {
        (slot_priority::WORLD_NET_BACKBOARD_HIT, 5)
    } else {
        (slot_priority::WORLD_RAMP_HIT, 3)
    };
    (
        IncidentModulationParams {
            category_idx: categories::WORLD_SURFACE,
            vol_mult: ((0.52 + 0.58 * intensity) * backboard_boost).clamp(0.40, 1.25),
            radius_scale: ((0.72 + 0.48 * intensity) * if is_backboard { 1.15 } else { 1.0 })
                .clamp(0.65, 1.35),
            playback_rate: (0.95 + 0.10 * intensity).clamp(0.90, 1.08),
            priority,
            intensity,
        },
        pool_len,
    )
}

#[inline]
pub fn calibrate_goalpost_ping(
    ball_speed: f32,
    threshold: f32,
) -> (IncidentModulationParams, bool) {
    let is_ping_large = ball_speed >= 1400.0;
    let intensity = if is_ping_large {
        smoothstep01((ball_speed - 1400.0) / 1400.0)
    } else {
        smoothstep01((ball_speed - threshold) / (1400.0 - threshold).max(200.0))
    };
    if is_ping_large {
        (
            IncidentModulationParams {
                category_idx: categories::GOALPOST_PING_LARGE,
                vol_mult: (0.85 + 0.30 * intensity).clamp(0.80, 1.20),
                radius_scale: (0.92 + 0.23 * intensity).clamp(0.90, 1.20),
                playback_rate: (0.98 + 0.05 * intensity).clamp(0.96, 1.04),
                priority: slot_priority::GOALPOST_PING_LARGE,
                intensity,
            },
            true,
        )
    } else {
        (
            IncidentModulationParams {
                category_idx: categories::GOALPOST_PING_SMALL,
                vol_mult: (0.60 + 0.40 * intensity).clamp(0.50, 1.05),
                radius_scale: (0.75 + 0.30 * intensity).clamp(0.70, 1.10),
                playback_rate: (0.97 + 0.06 * intensity).clamp(0.95, 1.05),
                priority: slot_priority::GOALPOST_PING_SMALL,
                intensity,
            },
            false,
        )
    }
}
