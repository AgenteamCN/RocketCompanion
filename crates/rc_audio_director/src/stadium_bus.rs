//! `stadium_bus`: Stadium PA reverb distance/phase blending, dual-world lobby spatialization,
//! HPF/LPF filter frequency curves, and boost pad / countdown signal slot evaluation.

use rc_physics_sim::layout::{PhysicsEvent, PhysicsEventBuffer, MAX_CARS, MAX_PADS};
use crate::{
    config_pod::{AttenuationProfilePod, AudioDirectorConfigPod},
    pod_types::{
        AudioListenerStatePod, AudioOneShotSlotPod, StadiumBusBlendPod,
        AUDIO_ATTENUATION_CATEGORY_COUNT, MAX_AUDIO_ONE_SHOT_SLOTS,
    },
};

pub const DEFAULT_STADIUM_TRANSITION_DURATION_SEC: f32 = 2.0;
pub const DEFAULT_STADIUM_HPF_MAX_FREQ_HZ: f32 = 425.0;
pub const DEFAULT_STADIUM_LPF_MIN_FREQ_HZ: f32 = 3500.0;
pub const DEFAULT_STADIUM_LPF_MAX_FREQ_HZ: f32 = 20000.0;
pub const DEFAULT_STADIUM_HPF_FLOOR_FREQ_HZ: f32 = 20.0;
pub const DEFAULT_STADIUM_WET_MAX_RATIO: f32 = 0.69;
pub const DEFAULT_STADIUM_WET_BOOST: f32 = 1.35;
pub const DEFAULT_STADIUM_BZ_X1: f32 = 0.22;
pub const DEFAULT_STADIUM_BZ_Y1: f32 = 1.0;
pub const DEFAULT_STADIUM_BZ_X2: f32 = 1.0;
pub const DEFAULT_STADIUM_BZ_Y2: f32 = 1.0;
pub const STADIUM_DISTANCE_MIN_UU: f32 = 300.0;
pub const STADIUM_DISTANCE_MAX_UU: f32 = 6000.0;
pub const CATEGORY_INDEX_BOOST_PICKUP: u32 = 12;
pub const CATEGORY_INDEX_SIGNAL_BROADCAST: u32 = 1;

pub mod signal_event_codes {
    pub const BOOST_PICKUP: u32 = 0x0A;
    pub const BOOST_SPAWN: u32 = 0x0B;
    pub const CAR_BOOST_START: u32 = 0x0C;
    pub const CAR_BOOST_STOP: u32 = 0x0D;
    pub const GOAL_SCORED: u32 = 0x0E;
    pub const FLIP_RESET_GAINED: u32 = 0x0F;
    pub const MATCH_START: u32 = 0x80;
    pub const KICKOFF_WILL_START: u32 = 0x81;
    pub const KICKOFF_START: u32 = 0x82;
    pub const COUNTDOWN_TICK: u32 = 0x83;
    pub const MATCH_PAUSED: u32 = 0x84;
    pub const MATCH_WILL_RESUME: u32 = 0x85;
    pub const MATCH_RESUMED: u32 = 0x86;
    pub const OVERTIME_START: u32 = 0x8B;
    pub const TIME_ALERT_60S: u32 = 0x8C;
    pub const TIME_ALERT_30S: u32 = 0x8D;
    pub const MATCH_ENDED: u32 = 0x97;
    pub const PODIUM_START: u32 = 0x99;
    pub const COUNTDOWN_10S: u32 = 0x9E;
    pub const SYS_CTRL_INTERVENE_WILL_RESUME: u32 = 0xA1;
}

pub mod signal_subtypes {
    pub const BOOST_PAD_SMALL: u32 = 0;
    pub const BOOST_PAD_BIG: u32 = 1;
    pub const COUNTDOWN_321: u32 = 2;
    pub const MATCH_START_GO: u32 = 3;
    pub const ALERT_60S: u32 = 4;
    pub const ALERT_30S: u32 = 5;
    pub const COUNTDOWN_10S: u32 = 6;
    pub const OVERTIME_START: u32 = 7;
    pub const ENDGAME: u32 = 8;
}

pub mod slot_priorities {
    pub const GOAL_EXPLOSION: u32 = 10;
    pub const SIGNAL_BROADCAST: u32 = 8;
    pub const BOOST_PICKUP_SELF_BIG: u32 = 5;
    pub const BOOST_PICKUP_SELF_SMALL: u32 = 4;
    pub const BOOST_PICKUP_OTHER: u32 = 2;
}

pub mod cooldown_ticks {
    pub const BOOST_PICKUP_PER_PAD: u32 = 18;
    pub const COUNTDOWN_321: u32 = 30;
    pub const MATCH_START_GO: u32 = 36;
    pub const COUNTDOWN_10S: u32 = 24;
    pub const OVERTIME: u32 = 120;
    pub const LONG_BROADCAST: u32 = 600;
}

#[inline]
pub fn solve_cubic_bezier(x: f32, x1: f32, y1: f32, x2: f32, y2: f32) -> f32 {
    if x <= 0.0 { return 0.0; }
    if x >= 1.0 { return 1.0; }
    let (cx, cy) = (3.0 * x1, 3.0 * y1);
    let (bx, by) = (3.0 * (x2 - x1) - cx, 3.0 * (y2 - y1) - cy);
    let (ax, ay) = (1.0 - cx - bx, 1.0 - cy - by);

    let sample_x = |t: f32| ((ax * t + bx) * t + cx) * t;
    let sample_y = |t: f32| ((ay * t + by) * t + cy) * t;
    let deriv_x = |t: f32| (3.0 * ax * t + 2.0 * bx) * t + cx;

    let mut t2 = x;
    for _ in 0..8 {
        let (x_est, d2) = (sample_x(t2) - x, deriv_x(t2));
        if x_est.abs() < 1e-6 || d2.abs() < 1e-6 { break; }
        t2 -= x_est / d2;
    }
    if !(0.0..=1.0).contains(&t2) || t2.is_nan() {
        let (mut t0, mut t1) = (0.0f32, 1.0f32);
        t2 = x;
        for _ in 0..12 {
            let x_est = sample_x(t2);
            if (x_est - x).abs() < 1e-6 { break; }
            if x > x_est { t0 = t2 } else { t1 = t2 }
            t2 = 0.5 * (t1 - t0) + t0;
        }
    }
    sample_y(t2).clamp(0.0, 1.0)
}

#[inline]
pub fn evaluate_normalized_attenuation(t: f32, profile: &AttenuationProfilePod) -> f32 {
    if t <= 0.0 { return 1.0; }
    if t >= 1.0 { return 0.0; }
    match profile.curve_type {
        0 => 1.0 - t,
        1 => 1.0 - t * t * (3.0 - 2.0 * t),
        2 => {
            let p = if profile.curve_exponent > 0.0 && profile.curve_exponent.is_finite() {
                profile.curve_exponent
            } else {
                1.0
            };
            (1.0 - t).max(0.0).powf(p)
        }
        3 => {
            let [x1, y1, x2, y2] = profile.bezier_x1_y1_x2_y2;
            (1.0 - solve_cubic_bezier(t, x1, y1, x2, y2)).clamp(0.0, 1.0)
        }
        4 => {
            let (k, inv_end) = (3.0f32, 0.25f32);
            ((1.0 / (1.0 + k * t) - inv_end) / (1.0 - inv_end)).max(0.0)
        }
        _ => 1.0 - t * t * (3.0 - 2.0 * t),
    }
}

#[inline]
pub fn evaluate_profile_distance_gain(
    distance_uu: f32,
    profile: &AttenuationProfilePod,
    arena_scale: f32,
    distance_radius_scale: f32,
) -> f32 {
    let scale = if arena_scale.is_finite() && arena_scale > 0.0 { arena_scale.clamp(0.25, 4.0) } else { 1.0 };
    let rad = if distance_radius_scale.is_finite() && distance_radius_scale > 0.0 { distance_radius_scale.clamp(0.25, 3.0) } else { 1.0 };
    let (min_dist, max_dist, effective_dist) = (profile.min_distance_uu * scale, profile.max_distance_uu * scale, distance_uu / rad);

    if !effective_dist.is_finite() || effective_dist <= min_dist {
        return 1.0;
    }
    let min_floor = profile.min_gain_floor.clamp(0.0, 1.0);
    if effective_dist >= max_dist {
        return if (profile.flags & 1) != 0 && min_floor <= 1e-5 { 0.0 } else { min_floor };
    }
    let t = ((effective_dist - min_dist) / (max_dist - min_dist).max(1e-3)).clamp(0.0, 1.0);
    min_floor + (1.0 - min_floor) * evaluate_normalized_attenuation(t, profile)
}

#[inline]
pub fn compute_stadium_bus_pod_from_blend(
    blend: f32,
    hpf_max_freq_hz: f32,
    lpf_min_freq_hz: f32,
    wet_max_ratio: f32,
    wet_boost: f32,
) -> StadiumBusBlendPod {
    let b = if blend.is_finite() { blend.clamp(0.0, 1.0) } else { 0.0 };
    let max_freq = DEFAULT_STADIUM_LPF_MAX_FREQ_HZ;
    let min_lpf = lpf_min_freq_hz.clamp(100.0, max_freq);
    let max_hpf = hpf_max_freq_hz.clamp(DEFAULT_STADIUM_HPF_FLOOR_FREQ_HZ, 5000.0);
    let target_wet = wet_max_ratio.clamp(0.0, 1.0);
    let boost = wet_boost.clamp(0.1, 3.0);

    StadiumBusBlendPod {
        spatial_blend: b,
        hpf_freq_hz: DEFAULT_STADIUM_HPF_FLOOR_FREQ_HZ + b * (max_hpf - DEFAULT_STADIUM_HPF_FLOOR_FREQ_HZ).max(0.0),
        lpf_freq_hz: max_freq * (min_lpf / max_freq).powf(b),
        wet_gain: (b * target_wet * boost).clamp(0.0, 2.0),
    }
}

pub fn step_stadium_bus_blend(
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    current_phase: &mut f32,
) -> StadiumBusBlendPod {
    let (is_audible, spatial_enabled, lobby_dual_world) = (
        (listener.flags & 1) != 0,
        (listener.flags & (1 << 2)) != 0,
        (listener.flags & (1 << 3)) != 0,
    );
    if !is_audible || !spatial_enabled {
        *current_phase = 0.0;
        return compute_stadium_bus_pod_from_blend(
            0.0, DEFAULT_STADIUM_HPF_MAX_FREQ_HZ, DEFAULT_STADIUM_LPF_MIN_FREQ_HZ,
            DEFAULT_STADIUM_WET_MAX_RATIO, DEFAULT_STADIUM_WET_BOOST,
        );
    }

    let [lx, ly, lz] = listener.pos_uu;
    let dist_from_center = (lx * lx + ly * ly + lz * lz).sqrt();
    let arena_scale = cfg.arena_acoustic_scale.clamp(0.25, 4.0);
    let (min_d, max_d) = (STADIUM_DISTANCE_MIN_UU * arena_scale, STADIUM_DISTANCE_MAX_UU * arena_scale);
    let dist_phase = ((dist_from_center - min_d) / (max_d - min_d).max(1.0)).clamp(0.0, 1.0);
    let target_phase = if lobby_dual_world { dist_phase.max(0.85) } else { dist_phase.max(0.35) };

    let max_delta = listener.dt_sec.clamp(0.0005, 0.1) / DEFAULT_STADIUM_TRANSITION_DURATION_SEC;
    if (target_phase - *current_phase).abs() <= 1e-4 {
        *current_phase = target_phase;
    } else if target_phase > *current_phase {
        *current_phase = (*current_phase + max_delta).min(target_phase);
    } else {
        *current_phase = (*current_phase - max_delta).max(target_phase);
    }

    let blend = solve_cubic_bezier(
        *current_phase, DEFAULT_STADIUM_BZ_X1, DEFAULT_STADIUM_BZ_Y1, DEFAULT_STADIUM_BZ_X2, DEFAULT_STADIUM_BZ_Y2,
    );
    compute_stadium_bus_pod_from_blend(
        blend, DEFAULT_STADIUM_HPF_MAX_FREQ_HZ, DEFAULT_STADIUM_LPF_MIN_FREQ_HZ,
        DEFAULT_STADIUM_WET_MAX_RATIO, DEFAULT_STADIUM_WET_BOOST,
    )
}

pub fn push_one_shot_slot(
    one_shots: &mut [AudioOneShotSlotPod; MAX_AUDIO_ONE_SHOT_SLOTS],
    one_shot_count: &mut u32,
    slot: AudioOneShotSlotPod,
) -> bool {
    let count = (*one_shot_count as usize).min(MAX_AUDIO_ONE_SHOT_SLOTS);
    if count < MAX_AUDIO_ONE_SHOT_SLOTS {
        one_shots[count] = slot;
        *one_shot_count = (count + 1) as u32;
        return true;
    }
    let new_prio = slot.priority_and_variant & 0xFF;
    let mut lowest_idx = 0usize;
    let mut lowest_prio = one_shots[0].priority_and_variant & 0xFF;
    for (i, item) in one_shots.iter().enumerate().skip(1) {
        let p = item.priority_and_variant & 0xFF;
        if p < lowest_prio {
            lowest_prio = p;
            lowest_idx = i;
        }
    }
    if new_prio > lowest_prio {
        one_shots[lowest_idx] = slot;
        return true;
    }
    false
}

pub fn evaluate_boost_pad_pickup_slot(
    ev: &PhysicsEvent,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    last_pad_pickup_tick: &mut [u32; MAX_PADS],
) -> Option<AudioOneShotSlotPod> {
    let raw_car = (ev.packed_ids & 0xFFFF) as u16;
    let raw_pad = ((ev.packed_ids >> 16) & 0xFFFF) as u16;
    let car_idx = if raw_car == 0xFFFF { 0xFFFFu32 } else { u32::from(raw_car) };
    let pad_idx = if raw_pad == 0xFFFF { None } else { Some(raw_pad as usize) };

    if let Some(p_idx) = pad_idx && p_idx < MAX_PADS {
        let last_tick = last_pad_pickup_tick[p_idx];
        if last_tick > 0 && ev.tick.saturating_sub(last_tick) < cooldown_ticks::BOOST_PICKUP_PER_PAD {
            return None;
        }
        last_pad_pickup_tick[p_idx] = ev.tick.max(1);
    }

    let is_big = ev.sub_type == 1 || ev.custom_float >= 50.0 || pad_idx.is_some_and(|i| i < 6);
    let active_car = listener.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as u32;
    let is_self = car_idx < (MAX_CARS as u32) && car_idx == active_car;

    let (vol_mult, radius_scale, playback_rate, priority, intensity, is_2d) = if is_self {
        let prio = if is_big { slot_priorities::BOOST_PICKUP_SELF_BIG } else { slot_priorities::BOOST_PICKUP_SELF_SMALL };
        (if is_big { 1.05 } else { 0.92 }, 1.0, if is_big { 0.98 } else { 1.04 }, prio, if is_big { 1.0 } else { 0.65 }, true)
    } else {
        (if is_big { 0.85 } else { 0.62 }, if is_big { 1.05 } else { 0.68 }, if is_big { 0.97 } else { 1.05 }, slot_priorities::BOOST_PICKUP_OTHER, if is_big { 0.85 } else { 0.45 }, false)
    };

    let dist_gain = if is_self {
        1.0
    } else {
        let (dx, dy, dz) = (ev.pos_x - listener.pos_uu[0], ev.pos_y - listener.pos_uu[1], ev.pos_z - listener.pos_uu[2]);
        let dist_uu = (dx * dx + dy * dy + dz * dz).sqrt();
        let cat_idx = CATEGORY_INDEX_BOOST_PICKUP.min((AUDIO_ATTENUATION_CATEGORY_COUNT - 1) as u32) as usize;
        evaluate_profile_distance_gain(dist_uu, &cfg.attenuation_profiles[cat_idx], cfg.arena_acoustic_scale, radius_scale)
    };
    if dist_gain <= 1e-5 {
        return None;
    }

    let self_mult = if is_self { cfg.vehicle_self_volume } else { 1.0 };
    let final_gain = (cfg.master_volume * cfg.boost_volume * cfg.boost_collect_volume * self_mult * vol_mult * dist_gain).clamp(0.0, 5.0);
    if final_gain <= 1e-5 {
        return None;
    }

    Some(AudioOneShotSlotPod {
        event_type: signal_event_codes::BOOST_PICKUP,
        sub_type: if is_big { signal_subtypes::BOOST_PAD_BIG } else { signal_subtypes::BOOST_PAD_SMALL },
        car_index: car_idx,
        priority_and_variant: (priority & 0xFF) | (u32::from(is_2d) << 16),
        final_gain,
        playback_rate,
        distance_radius_scale: radius_scale,
        pan_or_intensity: if is_2d { 0.0 } else { intensity },
        audio_pos_meters: [ev.pos_x * 0.01, ev.pos_z * 0.01, ev.pos_y * 0.01],
        category_index: CATEGORY_INDEX_BOOST_PICKUP,
    })
}

pub fn evaluate_countdown_or_match_signal_slot(
    ev: &PhysicsEvent,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    last_signal_tick_by_subtype: &mut [u32; 10],
) -> Option<AudioOneShotSlotPod> {
    if (listener.flags & (1 << 5)) != 0 {
        return None;
    }
    use signal_event_codes as c;
    use signal_subtypes as s;
    let (sub_type, cooldown) = match ev.event_type {
        c::COUNTDOWN_TICK | c::KICKOFF_WILL_START | c::MATCH_WILL_RESUME | c::SYS_CTRL_INTERVENE_WILL_RESUME => {
            (s::COUNTDOWN_321, cooldown_ticks::COUNTDOWN_321)
        }
        c::KICKOFF_START | c::MATCH_START | c::MATCH_RESUMED => {
            (s::MATCH_START_GO, cooldown_ticks::MATCH_START_GO)
        }
        c::TIME_ALERT_60S => (s::ALERT_60S, cooldown_ticks::LONG_BROADCAST),
        c::TIME_ALERT_30S => (s::ALERT_30S, cooldown_ticks::LONG_BROADCAST),
        c::COUNTDOWN_10S => (s::COUNTDOWN_10S, cooldown_ticks::COUNTDOWN_10S),
        c::OVERTIME_START => (s::OVERTIME_START, cooldown_ticks::OVERTIME),
        c::MATCH_ENDED | c::PODIUM_START => (s::ENDGAME, cooldown_ticks::LONG_BROADCAST),
        _ => return None,
    };

    let idx = (sub_type as usize).min(last_signal_tick_by_subtype.len() - 1);
    let last_tick = last_signal_tick_by_subtype[idx];
    if last_tick > 0 && ev.tick.saturating_sub(last_tick) < cooldown {
        return None;
    }
    last_signal_tick_by_subtype[idx] = ev.tick.max(1);

    let final_gain = cfg.master_volume.clamp(0.0, 5.0);
    if final_gain <= 1e-5 {
        return None;
    }

    Some(AudioOneShotSlotPod {
        event_type: ev.event_type,
        sub_type,
        car_index: 0xFFFF,
        priority_and_variant: (slot_priorities::SIGNAL_BROADCAST & 0xFF) | (1u32 << 16),
        final_gain,
        playback_rate: 1.0,
        distance_radius_scale: 1.0,
        pan_or_intensity: 0.0,
        audio_pos_meters: [0.0, 0.0, 0.0],
        category_index: CATEGORY_INDEX_SIGNAL_BROADCAST,
    })
}

#[allow(clippy::too_many_arguments)]
pub fn collect_stadium_and_signal_events(
    event_buffer: &PhysicsEventBuffer,
    last_read_seq: u32,
    listener: &AudioListenerStatePod,
    cfg: &AudioDirectorConfigPod,
    last_pad_pickup_tick: &mut [u32; MAX_PADS],
    last_signal_tick_by_subtype: &mut [u32; 10],
    one_shots: &mut [AudioOneShotSlotPod; MAX_AUDIO_ONE_SHOT_SLOTS],
    one_shot_count: &mut u32,
) {
    let write_seq = event_buffer.write_seq;
    if write_seq <= last_read_seq {
        return;
    }
    let cap = (event_buffer.capacity as usize).clamp(1, event_buffer.events.len());
    let count = ((write_seq - last_read_seq) as usize).min(cap);
    for seq in (write_seq - count as u32)..write_seq {
        let ev = &event_buffer.events[(seq as usize) % cap];
        if ev.event_type == signal_event_codes::BOOST_PICKUP {
            if let Some(slot) = evaluate_boost_pad_pickup_slot(ev, listener, cfg, last_pad_pickup_tick) {
                push_one_shot_slot(one_shots, one_shot_count, slot);
            }
        } else if ev.event_type >= 0x80
            && let Some(slot) = evaluate_countdown_or_match_signal_slot(ev, listener, cfg, last_signal_tick_by_subtype)
        {
            push_one_shot_slot(one_shots, one_shot_count, slot);
        }
    }
}
