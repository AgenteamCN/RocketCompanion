//! Discrete action lookup tables, logit decoders, and state-dependent action masks for `rc_bot_ai`:
//! - `DEFAULT_90_ACTIONS`: 90x8 lookup table for Nexto and GigaLearn/RocketForge MLP policies.
//! - `NECTO_V1_126_ACTIONS`: 126x8 lookup table for Necto V1 discrete action space, plus 12-logit factorized Necto decoder.
//! - `FURY_380_ACTIONS`: 380x8 lookup table (`AdvancedActionOld(4, 5, 5, 7, true)`) for Fury.

use std::sync::OnceLock;

use rc_physics_sim::layout::{CarControlsPod, CarStatePod};

use crate::simd_math::select_masked_argmax;

pub const DEFAULT_ACTION_COUNT: usize = 90;
pub const DEFAULT_GROUND_ACTION_COUNT: usize = 24;
pub const NECTO_V1_ACTION_COUNT: usize = 126;
pub const FURY_ACTION_COUNT: usize = 380;

pub struct Default90ActionMeta {
    pub actions: [CarControlsPod; DEFAULT_ACTION_COUNT],
    pub ground_mask: [u8; DEFAULT_ACTION_COUNT],
    pub air_mask: [u8; DEFAULT_ACTION_COUNT],
    pub jump_mask: [u8; DEFAULT_ACTION_COUNT],
    pub boost_mask: [u8; DEFAULT_ACTION_COUNT],
}

static DEFAULT_90_META: OnceLock<Default90ActionMeta> = OnceLock::new();
static NECTO_V1_126_TABLE: OnceLock<[CarControlsPod; NECTO_V1_ACTION_COUNT]> = OnceLock::new();
static FURY_380_TABLE: OnceLock<[CarControlsPod; FURY_ACTION_COUNT]> = OnceLock::new();

#[inline]
pub const fn controls_from_f32_8(a: [f32; 8]) -> CarControlsPod {
    CarControlsPod {
        throttle: a[0],
        steer: a[1],
        pitch: a[2],
        yaw: a[3],
        roll: a[4],
        jump: if a[5] > 0.0 { 1.0 } else { 0.0 },
        boost: if a[6] > 0.0 { 1.0 } else { 0.0 },
        handbrake: if a[7] > 0.0 { 1.0 } else { 0.0 },
    }
}

#[inline]
pub const fn controls_to_f32_8(c: &CarControlsPod) -> [f32; 8] {
    [
        c.throttle,
        c.steer,
        c.pitch,
        c.yaw,
        c.roll,
        if c.jump > 0.0 { 1.0 } else { 0.0 },
        if c.boost > 0.0 { 1.0 } else { 0.0 },
        if c.handbrake > 0.0 { 1.0 } else { 0.0 },
    ]
}

/// Mirrors a `CarControlsPod` across the X axis (used by Chronos v2.1 when `mirror_x` is active).
#[inline]
pub fn mirror_action_controls_x(c: CarControlsPod) -> CarControlsPod {
    CarControlsPod {
        throttle: c.throttle,
        steer: if c.steer == 0.0 { 0.0 } else { -c.steer },
        pitch: c.pitch,
        yaw: if c.yaw == 0.0 { 0.0 } else { -c.yaw },
        roll: if c.roll == 0.0 { 0.0 } else { -c.roll },
        jump: if c.jump > 0.0 { 1.0 } else { 0.0 },
        boost: if c.boost > 0.0 { 1.0 } else { 0.0 },
        handbrake: if c.handbrake > 0.0 { 1.0 } else { 0.0 },
    }
}

/// Returns the precomputed 90-action lookup table and masks (`DefaultAction` / Nexto).
pub fn default_90_meta() -> &'static Default90ActionMeta {
    DEFAULT_90_META.get_or_init(|| {
        let mut actions = [CarControlsPod::default(); DEFAULT_ACTION_COUNT];
        let mut idx = 0usize;

        for &throttle in &[-1.0f32, 0.0, 1.0] {
            for &steer in &[-1.0f32, 0.0, 1.0] {
                for &boost in &[0.0f32, 1.0] {
                    for &handbrake in &[0.0f32, 1.0] {
                        if boost == 1.0 && throttle != 1.0 {
                            continue;
                        }
                        let thr_or_boost = if throttle != 0.0 { throttle } else { boost };
                        actions[idx] = controls_from_f32_8([
                            thr_or_boost,
                            steer,
                            0.0,
                            steer,
                            0.0,
                            0.0,
                            boost,
                            handbrake,
                        ]);
                        idx += 1;
                    }
                }
            }
        }

        for &pitch in &[-1.0f32, 0.0, 1.0] {
            for &yaw in &[-1.0f32, 0.0, 1.0] {
                for &roll in &[-1.0f32, 0.0, 1.0] {
                    for &jump in &[0.0f32, 1.0] {
                        for &boost in &[0.0f32, 1.0] {
                            if (jump == 1.0 && yaw != 0.0)
                                || (pitch == 0.0 && roll == 0.0 && jump == 0.0)
                            {
                                continue;
                            }
                            let handbrake =
                                if jump == 1.0 && (pitch != 0.0 || yaw != 0.0 || roll != 0.0) {
                                    1.0
                                } else {
                                    0.0
                                };
                            actions[idx] = controls_from_f32_8([
                                boost, yaw, pitch, yaw, roll, jump, boost, handbrake,
                            ]);
                            idx += 1;
                        }
                    }
                }
            }
        }

        let mut ground_mask = [0u8; DEFAULT_ACTION_COUNT];
        let mut air_mask = [0u8; DEFAULT_ACTION_COUNT];
        let mut jump_mask = [0u8; DEFAULT_ACTION_COUNT];
        let mut boost_mask = [0u8; DEFAULT_ACTION_COUNT];

        for i in 0..DEFAULT_ACTION_COUNT {
            let a = &actions[i];
            let is_ground_idx = i < DEFAULT_GROUND_ACTION_COUNT;
            let has_jump = a.jump > 0.0;
            let has_boost = a.boost > 0.0;
            let has_handbrake = a.handbrake > 0.0;

            ground_mask[i] = u8::from(is_ground_idx);
            let air_allowed = (!is_ground_idx && !has_jump)
                || (is_ground_idx
                    && a.throttle == (if has_boost { 1.0 } else { 0.0 })
                    && (a.yaw != 0.0) == has_handbrake);
            air_mask[i] = u8::from(air_allowed);
            jump_mask[i] = u8::from(has_jump);
            boost_mask[i] = u8::from(has_boost);
        }

        Default90ActionMeta {
            actions,
            ground_mask,
            air_mask,
            jump_mask,
            boost_mask,
        }
    })
}

#[inline]
pub fn default_90_actions() -> &'static [CarControlsPod; DEFAULT_ACTION_COUNT] {
    &default_90_meta().actions
}

/// Computes the 90-element action mask matching `DefaultAction::GetActionMask`.
pub fn compute_default_action_90_mask(
    car: &CarStatePod,
    out_mask: &mut [u8; DEFAULT_ACTION_COUNT],
) {
    if car.is_demoed > 0.0 {
        out_mask.fill(0);
        out_mask[0] = 1;
        return;
    }

    let meta = default_90_meta();
    if car.is_on_ground >= 0.5 {
        out_mask.copy_from_slice(&meta.ground_mask);
    } else {
        out_mask.copy_from_slice(&meta.air_mask);
    }

    if car.boost <= 0.0 {
        for i in 0..DEFAULT_ACTION_COUNT {
            if meta.boost_mask[i] != 0 {
                out_mask[i] = 0;
            }
        }
    }

    let has_flip_or_jump = car.has_flip_or_jump.round() as i32 != 0;
    let is_turtled = car.ground_normal[2] > 0.9 || car.up[2] < -0.9;
    if has_flip_or_jump || is_turtled {
        for i in 0..DEFAULT_ACTION_COUNT {
            if meta.jump_mask[i] != 0 {
                out_mask[i] = 1;
            }
        }
    }
}

/// Decodes Nexto 90-action logits into `(action_index, CarControlsPod)`.
#[inline]
pub fn decode_nexto_logits(logits: &[f32]) -> (usize, CarControlsPod) {
    let actions = default_90_actions();
    let mut best_idx = 0usize;
    let mut best_val = logits.first().copied().unwrap_or(f32::NEG_INFINITY);
    let len = logits.len().min(DEFAULT_ACTION_COUNT);
    for (i, &v) in logits.iter().enumerate().take(len).skip(1) {
        if v.is_finite() && v > best_val {
            best_val = v;
            best_idx = i;
        }
    }
    (best_idx, actions[best_idx])
}

/// Decodes Necto 12-dim factorized logits (`[3 throttle, 3 steer, 2 jump, 2 boost, 2 handbrake]`).
#[inline]
pub fn decode_necto_logits(logits12: &[f32]) -> (usize, CarControlsPod) {
    if logits12.len() < 12 {
        return (0, CarControlsPod::default());
    }
    let argmax_range = |start: usize, len: usize| -> usize {
        let mut best = 0usize;
        for i in 1..len {
            if logits12[start + i] > logits12[start + best] {
                best = i;
            }
        }
        best
    };

    let throttle = argmax_range(0, 3);
    let steer = argmax_range(3, 3);
    let jump = argmax_range(6, 2);
    let boost = argmax_range(8, 2);
    let handbrake = argmax_range(10, 2);

    let thr_f = (throttle as i32 - 1) as f32;
    let str_f = (steer as i32 - 1) as f32;
    let hb_i = handbrake as i32;
    let yaw_f = ((steer as i32 - 1) * (1 - hb_i)) as f32;
    let roll_f = ((steer as i32 - 1) * hb_i) as f32;

    let packed_idx = throttle + steer * 3 + jump * 9 + boost * 18 + handbrake * 36;
    let ctrl = controls_from_f32_8([
        thr_f,
        str_f,
        thr_f,
        if yaw_f == 0.0 { 0.0 } else { yaw_f },
        if roll_f == 0.0 { 0.0 } else { roll_f },
        jump as f32,
        boost as f32,
        handbrake as f32,
    ]);
    (packed_idx, ctrl)
}

/// Returns the 126-action Necto V1 lookup table (`30 ground + 96 aerial/jump/flip`).
pub fn necto_v1_126_actions() -> &'static [CarControlsPod; NECTO_V1_ACTION_COUNT] {
    NECTO_V1_126_TABLE.get_or_init(|| {
        let mut actions = [CarControlsPod::default(); NECTO_V1_ACTION_COUNT];
        let mut idx = 0usize;

        for &throttle in &[-1.0f32, 0.0, 1.0] {
            for &steer in &[-1.0f32, -0.5, 0.0, 0.5, 1.0] {
                for &boost in &[0.0f32, 1.0] {
                    for &handbrake in &[0.0f32, 1.0] {
                        if boost == 1.0 && throttle != 1.0 {
                            continue;
                        }
                        let thr_or_boost = if throttle != 0.0 { throttle } else { boost };
                        actions[idx] = controls_from_f32_8([
                            thr_or_boost,
                            steer,
                            0.0,
                            steer,
                            0.0,
                            0.0,
                            boost,
                            handbrake,
                        ]);
                        idx += 1;
                    }
                }
            }
        }

        for &pitch in &[-1.0f32, 0.0, 1.0] {
            for &yaw in &[-1.0f32, 0.0, 1.0] {
                for &roll in &[-1.0f32, 0.0, 1.0] {
                    for &jump in &[0.0f32, 1.0] {
                        for &boost in &[0.0f32, 1.0] {
                            if pitch == 0.0 && yaw == 0.0 && roll == 0.0 && jump == 0.0 {
                                continue;
                            }
                            if jump == 1.0
                                && pitch == 0.0
                                && yaw != 0.0
                                && roll != 0.0
                                && boost == 1.0
                            {
                                continue;
                            }
                            let handbrake =
                                if jump == 1.0 && (pitch != 0.0 || yaw != 0.0 || roll != 0.0) {
                                    1.0
                                } else {
                                    0.0
                                };
                            if idx < NECTO_V1_ACTION_COUNT {
                                actions[idx] = controls_from_f32_8([
                                    boost, yaw, pitch, yaw, roll, jump, boost, handbrake,
                                ]);
                                idx += 1;
                            }
                        }
                    }
                }
            }
        }

        actions
    })
}

fn parse_bin(count: usize, endpoint: bool) -> Vec<f32> {
    if count == 0 {
        return Vec::new();
    }
    if count == 1 {
        return vec![0.0];
    }
    let denom = if endpoint { count - 1 } else { count } as f64;
    let step = 2.0f64 / denom;
    (0..count).map(|i| (-1.0 + step * (i as f64)) as f32).collect()
}

/// Returns Fury's exact 380-action table (`AdvancedActionOld(4, 5, 5, 7, true)`).
pub fn fury_380_actions() -> &'static [CarControlsPod; FURY_ACTION_COUNT] {
    FURY_380_TABLE.get_or_init(|| {
        let thr = parse_bin(4, true);
        let str_bins = parse_bin(5, true);
        let mut actions = [CarControlsPod::default(); FURY_ACTION_COUNT];
        let mut idx = 0usize;

        for &t in &thr {
            for &s in &str_bins {
                for &b in &[0.0f32, 1.0] {
                    for &h in &[0.0f32, 1.0] {
                        if b == 1.0 && t != 1.0 {
                            continue;
                        }
                        actions[idx] = controls_from_f32_8([t, s, 0.0, s, 0.0, 0.0, b, h]);
                        idx += 1;
                    }
                }
            }
        }

        let bins = parse_bin(5, true);
        let delta = bins[1] - bins[0];
        let mut face: Vec<(f32, f32)> = Vec::new();
        for &x in &bins {
            for &y in &bins {
                face.push((x, y));
            }
        }
        let db: Vec<f32> = (0..4)
            .map(|i| ((bins[i] as f64) + (delta as f64) / 2.0) as f32)
            .collect();
        for &x in &db {
            for &y in &db {
                face.push((x, y));
            }
        }

        let mut unique_cube: Vec<[f32; 3]> = Vec::new();
        let mut seen_keys: Vec<(i32, i32, i32)> = Vec::new();
        for &(fst, snd) in &face {
            for axis in 0..3 {
                for &side in &[-1.0f32, 1.0] {
                    let mut arr = [0.0f32; 3];
                    for d in 0..3 {
                        arr[d] = if d == axis {
                            side
                        } else if d == 0 {
                            fst
                        } else {
                            snd
                        };
                    }
                    let key = (
                        (arr[0] * 100_000.0).round() as i32,
                        (arr[1] * 100_000.0).round() as i32,
                        (arr[2] * 100_000.0).round() as i32,
                    );
                    if !seen_keys.contains(&key) {
                        seen_keys.push(key);
                        unique_cube.push(arr);
                    }
                }
            }
        }

        for pt in &unique_cube {
            let (pitch, yaw, roll) = (pt[0], pt[1], pt[2]);
            if pitch == 0.0 && roll == 0.0 && str_bins.iter().any(|&v| (v - yaw).abs() < 1e-6) {
                continue;
            }
            for &b in &[0.0f32, 1.0] {
                actions[idx] = controls_from_f32_8([b, yaw, pitch, yaw, roll, 0.0, b, 0.0]);
                idx += 1;
            }
        }

        let mut flips = vec![None];
        flips.extend(parse_bin(7, false).into_iter().map(Some));
        for ang_opt in flips {
            let (mut pitch, mut roll) = (0.0f32, 0.0f32);
            if let Some(ang) = ang_opt {
                pitch = (ang as f64).sin() as f32;
                roll = (ang as f64).cos() as f32;
                let mag = pitch.abs().max(roll.abs()) as f64;
                pitch = ((pitch as f64) / mag) as f32;
                roll = ((roll as f64) / mag) as f32;
            }
            for &b in &[0.0f32, 1.0] {
                actions[idx] = controls_from_f32_8([b, 0.0, pitch, 0.0, roll, 1.0, b, 1.0]);
                idx += 1;
            }
        }

        actions[idx] = controls_from_f32_8([0.0, 0.0, 0.0, 1.0, -1.0, 1.0, 0.0, 1.0]);
        actions[idx + 1] = controls_from_f32_8([0.0, 0.0, 0.0, -1.0, 1.0, 1.0, 0.0, 1.0]);
        actions
    })
}

/// Computes the 380-element action mask for Fury (`AdvancedActionOld` returns all `1`s).
#[inline]
pub fn compute_fury_action_380_mask(_car: &CarStatePod, out_mask: &mut [u8; FURY_ACTION_COUNT]) {
    out_mask.fill(1);
}

/// Decodes a 90-logit vector using `DefaultAction` masking and optional X-axis mirroring.
#[inline]
pub fn select_default_90_action(
    logits: &[f32],
    car: &CarStatePod,
    mirror_x: bool,
) -> (usize, CarControlsPod) {
    let mut mask = [0u8; DEFAULT_ACTION_COUNT];
    compute_default_action_90_mask(car, &mut mask);
    let act_idx =
        select_masked_argmax(&logits[..logits.len().min(DEFAULT_ACTION_COUNT)], Some(&mask));
    let raw = default_90_actions()[act_idx];
    let ctrl = if mirror_x {
        mirror_action_controls_x(raw)
    } else {
        raw
    };
    (act_idx, ctrl)
}

/// Decodes a 380-logit vector for Fury.
#[inline]
pub fn select_fury_380_action(logits: &[f32], car: &CarStatePod) -> (usize, CarControlsPod) {
    let mut mask = [1u8; FURY_ACTION_COUNT];
    compute_fury_action_380_mask(car, &mut mask);
    let act_idx = select_masked_argmax(&logits[..logits.len().min(FURY_ACTION_COUNT)], Some(&mask));
    (act_idx, fury_380_actions()[act_idx])
}
