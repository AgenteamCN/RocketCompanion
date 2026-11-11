//! 40-slice harmonic granular lookup table, RMS auto-normalization offsets,
//! 5-band piecewise-cosine frequency equalizer, velocity-coupled gear curves,
//! and kinetic strain/rev-bounce evaluators for the Turtle Modem powertrain synthesizer.

use crate::{config_pod::EngineTuningConfigPod, pod_types::MAX_ENGINE_GRANULAR_SLICES};

pub const ENGINE_EQ_BAND_FREQS_HZ: [f32; 5] = [42.0, 48.0, 56.0, 66.0, 74.0];
pub const REMOTE_ENGINE_LOD_ANCHOR_COUNT: usize = 10;

/// Calibrated RPM centers for the 40 harmonic slices of `turtle_modem` (`metadata.json`).
pub const TURTLE_MODEM_SLICE_RPMS: [f32; MAX_ENGINE_GRANULAR_SLICES] = [
    900.0, 966.0, 1151.0, 1271.0, 1409.0, 1534.0, 1665.0, 1803.0, 1899.0, 2000.0, 2134.0, 2241.0,
    2327.0, 2413.0, 2517.0, 2616.0, 2711.0, 2772.0, 2863.0, 2990.0, 4520.0, 4615.0, 4736.0, 5016.0,
    5030.0, 5122.0, 5129.0, 5229.0, 5243.0, 5314.0, 5398.0, 5660.0, 5766.0, 5773.0, 5781.0, 5788.0,
    5826.0, 5858.0, 5873.0, 6000.0,
];

/// Calibrated fundamental frequencies in Hz for the 40 harmonic slices of `turtle_modem`.
pub const TURTLE_MODEM_SLICE_FREQS_HZ: [f32; MAX_ENGINE_GRANULAR_SLICES] = [
    37.65, 38.13, 39.47, 40.34, 41.34, 42.25, 43.20, 44.20, 44.90, 45.63, 46.60, 47.38, 48.00,
    48.63, 49.38, 50.10, 50.79, 51.23, 51.89, 52.81, 63.91, 64.60, 65.48, 67.51, 67.61, 68.28,
    68.33, 69.06, 69.16, 69.67, 70.28, 72.18, 72.95, 73.00, 73.06, 73.11, 73.39, 73.62, 73.73,
    74.65,
];

/// Pre-computed median-relative RMS loudness normalization offsets in dB (`[-8.0, 8.0]`)
/// across all 40 conditioned `turtle_modem` harmonic loop slices.
pub const TURTLE_MODEM_SLICE_AUTO_NORM_DB: [f32; MAX_ENGINE_GRANULAR_SLICES] = [
    -3.3983, -3.6365, -3.0362, -2.5724, -2.1079, 0.0000, 0.0379, -2.8175, -4.3429, -4.6101,
    -4.1292, -3.1131, -1.6336, -2.5086, -3.2404, -3.0036, -3.1189, -2.0962, -1.7677, -1.2440,
    3.2855, 4.6789, 3.0532, 2.8412, 3.6877, 3.2998, 3.0618, 3.4523, 3.3254, 3.0187, 1.6122,
    -0.7296, 1.8767, 0.0535, 0.3782, 0.3603, 2.7108, 2.7629, 0.4338, 2.7346,
];

#[derive(Clone, Copy)]
pub struct PowertrainKinetics {
    pub abs_fwd: f32,
    pub raw_acc: f32,
    pub smooth_acc: f32,
    pub supersonic_turn: bool,
    pub shift_locked: bool,
    pub under_strain: bool,
    pub braking: bool,
    pub drifting: bool,
    pub turning_hard: bool,
    pub wall_decel: bool,
    pub speed_collapse: bool,
}

#[derive(Clone, Copy, Default)]
pub struct GranularSynthesisEval {
    pub lower_idx: usize,
    pub upper_idx: usize,
    pub lower_gain: f32,
    pub upper_gain: f32,
    pub lower_rate: f32,
    pub upper_rate: f32,
    pub idle_gain: f32,
    pub idle_pitch: f32,
    pub cutoff_hz: f32,
    pub eq_db: f32,
}

#[inline]
pub fn compute_velocity_coupled_gear_rpm(
    cfg: &EngineTuningConfigPod,
    abs_fwd: f32,
    gear: i32,
    dir: i8,
) -> f32 {
    let v1 = cfg.max_throttle_speed_uu.max(200.0);
    let v2 = cfg.supersonic_speed_uu.max(v1 + 100.0);
    let (idle, land, cut) = (cfg.idle_rpm, cfg.upshift_landing_rpm, cfg.rev_limit_cutoff_rpm);
    if gear <= 1 {
        let norm = (abs_fwd / v1).clamp(0.0, 1.02);
        return idle + norm.powf(if dir < 0 { 0.95 } else { 0.85 }) * (cut - idle);
    }
    if gear == 2 {
        if dir < 0 {
            let r2 = v1 * 0.65;
            return land + ((abs_fwd - r2) / (v1 - r2).max(100.0)).clamp(0.0, 1.02) * (cut - land);
        }
        if abs_fwd >= v1 {
            return land + ((abs_fwd - v1) / (v2 - v1).max(100.0)).clamp(0.0, 1.02) * (cut - land);
        }
        let flr = v1 * 0.68;
        let a = ((abs_fwd - flr) / (v1 - flr).max(100.0)).clamp(0.0, 1.0);
        return cfg.downshift_trigger_rpm + a * (land - cfg.downshift_trigger_rpm);
    }
    let flr = if dir < 0 { v1 * 0.68 } else { v2 * 0.72 };
    let ceil = if dir < 0 { v1 } else { 2300.0 };
    let norm = ((abs_fwd - flr) / (ceil - flr).max(100.0)).clamp(0.0, 1.0);
    cfg.downshift_trigger_rpm + norm * (cut - cfg.downshift_trigger_rpm)
}

#[allow(clippy::too_many_arguments)]
pub fn evaluate_powertrain_kinetics(
    cfg: &EngineTuningConfigPod, fwd: f32, prev_fwd: f32, prev_acc: f32,
    thr: f32, steer: f32, hb: bool, boost: bool, grounded: bool, up_z: f32, dt: f32,
) -> PowertrainKinetics {
    let abs_fwd = fwd.abs();
    let raw_acc = if dt > 1e-4 { ((fwd - prev_fwd) / dt).clamp(-6000.0, 6000.0) } else { 0.0 };
    let smooth_acc = prev_acc + (raw_acc - prev_acc) * (1.0 - (-16.0 * dt).exp());
    let braking = (fwd > cfg.zero_speed_threshold_uu && thr < -0.05) || (fwd < -cfg.zero_speed_threshold_uu && thr > 0.05);
    let abs_st = steer.abs();
    let drifting = grounded && hb && abs_fwd > 120.0;
    let turning_hard = grounded && abs_st >= cfg.shift_lock_steer_threshold && abs_fwd > 180.0;
    let pwr_turn = (cfg.flags & 16) != 0 && grounded && !braking && (thr.abs() > 0.05 || boost)
        && abs_st >= cfg.shift_lock_steer_threshold && abs_fwd > 180.0;
    let supersonic_turn = pwr_turn && boost && abs_fwd >= cfg.supersonic_speed_uu * 0.96;
    let shift_locked = drifting || pwr_turn;
    let sign = if fwd >= 0.0 { 1.0 } else { -1.0 };
    let (s_acc, s_raw) = (smooth_acc * sign, raw_acc * sign);
    let wall_decel = grounded && thr.abs() > 0.05 && !braking
        && s_acc < cfg.wall_decel_dip_threshold_uu && s_raw < cfg.wall_decel_dip_threshold_uu * 0.5
        && (up_z < 0.95 || abs_st < cfg.shift_lock_steer_threshold);
    let speed_collapse = grounded && !braking && s_acc < -120.0 && (abs_fwd < 420.0 || s_acc < -850.0);
    let under_strain = grounded && thr.abs() > 0.05 && !braking && (drifting || wall_decel || up_z < 0.75);
    PowertrainKinetics {
        abs_fwd, raw_acc, smooth_acc, supersonic_turn, shift_locked,
        under_strain, braking, drifting, turning_hard, wall_decel, speed_collapse,
    }
}

#[inline]
pub fn resolve_touchdown_state(
    cfg: &EngineTuningConfigPod, abs_fwd: f32, cur_gear: i32, cur_rpm: f32, dir: i8,
) -> (i32, f32, f32, f32) {
    let v1 = cfg.max_throttle_speed_uu.max(200.0);
    let v2 = cfg.supersonic_speed_uu.max(v1 + 100.0);
    let gear = if dir < 0 {
        if abs_fwd >= v1 * 0.96 { cur_gear.max(2) } else { 1 }
    } else if abs_fwd < v1 * 0.96 {
        1
    } else if abs_fwd < v2 * 0.96 {
        2
    } else {
        cur_gear.max(3)
    };
    let m = compute_velocity_coupled_gear_rpm(cfg, abs_fwd, gear, dir);
    if (cfg.flags & 512) == 0 { (gear, cfg.idle_rpm, m, 0.22) } else { (gear, cur_rpm * 0.35 + m * 0.65, m, 0.08) }
}


#[inline]
pub fn compute_deceleration_target_rpm(
    cfg: &EngineTuningConfigPod, kin: &PowertrainKinetics, gear: i32, prev_tgt: f32, dir: i8, dt: f32,
) -> f32 {
    if (cfg.flags & 8) == 0 {
        return (prev_tgt - cfg.rpm_drop_rate * if kin.braking { 2.6 } else { 1.0 } * dt).max(cfg.idle_rpm);
    }
    let mut coupled = compute_velocity_coupled_gear_rpm(cfg, kin.abs_fwd, gear, dir);
    if gear <= 1 {
        let norm = (kin.abs_fwd / cfg.max_throttle_speed_uu.max(200.0)).clamp(0.0, 1.0);
        let curve = if kin.braking { norm.powf(1.15) } else { norm };
        coupled = cfg.idle_rpm + curve * (cfg.rev_limit_cutoff_rpm - cfg.idle_rpm);
    }
    let flr = prev_tgt - cfg.rpm_drop_rate * if kin.braking { 3.5 } else { 1.25 } * dt;
    coupled.min(flr).max(cfg.idle_rpm)
}

#[allow(clippy::too_many_arguments)]
pub fn compute_active_ground_target_rpm(
    cfg: &EngineTuningConfigPod, kin: &PowertrainKinetics, gear: &mut i32,
    overdrive: &mut bool, prev_tgt: f32, abs_thr: f32, drv_rev: bool, boost: bool, dir: i8, dt: f32,
) -> f32 {
    let abs_fwd = kin.abs_fwd;
    let g = (*gear).max(1);
    *gear = g;
    if kin.speed_collapse {
        *overdrive = false;
        let base_r = compute_velocity_coupled_gear_rpm(cfg, abs_fwd, 1, dir);
        if abs_fwd < 360.0 && *gear > 1 {
            *gear = 1;
        }
        return prev_tgt + (base_r - prev_tgt) * (14.0 * dt).min(1.0);
    }
    let s_acc = kin.smooth_acc * if drv_rev { -1.0 } else { 1.0 };
    if kin.wall_decel {
        let dip = (s_acc.abs() * 2.2).min(1800.0);
        let m_flr = if *gear > 1 { cfg.downshift_trigger_rpm + 220.0 } else { cfg.idle_rpm + 300.0 };
        return (prev_tgt - dip * dt).max(m_flr);
    }
    let rise = if drv_rev { cfg.reverse_accel_rise_rate } else { cfg.base_accel_rise_rate };
    let b_mult = if !drv_rev && boost { cfg.boost_overdrive_multiplier.max(1.0) } else { 1.0 };
    let dec = (if drv_rev { cfg.reverse_gear_decay_factor_base } else { cfg.gear_decay_factor_base }).powi((g - 1).max(0));
    let flr_rpm = compute_velocity_coupled_gear_rpm(cfg, abs_fwd, g, dir);
    let max_ceil = abs_fwd >= cfg.max_throttle_speed_uu * if drv_rev { 0.96 } else { 0.97 };
    let mut nxt = prev_tgt + rise * b_mult * dec * abs_thr * dt;
    if (cfg.flags & 8) != 0 && g == 1 && s_acc > -20.0 {
        if flr_rpm >= nxt {
            nxt = flr_rpm;
            *overdrive = max_ceil;
        } else {
            *overdrive = max_ceil || (nxt - flr_rpm) > 260.0;
        }
    } else {
        *overdrive = g >= 2 || max_ceil;
    }
    nxt
}

#[inline]
pub fn evaluate_engine_freq_eq_curve_db(freq_hz: f32, bands: &[f32; 5]) -> f32 {
    let f = freq_hz.clamp(ENGINE_EQ_BAND_FREQS_HZ[0], ENGINE_EQ_BAND_FREQS_HZ[4]);
    if f <= ENGINE_EQ_BAND_FREQS_HZ[0] {
        return bands[0];
    }
    for i in 0..4 {
        let (f0, f1) = (ENGINE_EQ_BAND_FREQS_HZ[i], ENGINE_EQ_BAND_FREQS_HZ[i + 1]);
        if f <= f1 {
            let t = (f - f0) / (f1 - f0).max(0.1);
            let s = 0.5 * (1.0 - (core::f32::consts::PI * t).cos());
            return bands[i] + (bands[i + 1] - bands[i]) * s;
        }
    }
    bands[4]
}

#[inline]
pub fn evaluate_slice_loudness_compensation(
    t: &EngineTuningConfigPod, freq: f32, auto_db: f32, min_f: f32, max_f: f32,
) -> (f32, f32) {
    if (t.flags & 64) == 0 {
        return (1.0, 0.0);
    }
    let norm_db = auto_db * t.slice_rms_auto_norm_strength.clamp(0.0, 1.0);
    let eq_db = evaluate_engine_freq_eq_curve_db(freq, &t.eq_band_gains_db);
    let f_norm = ((freq - min_f) / (max_f - min_f).max(1.0)).clamp(0.0, 1.0);
    let total_db = (norm_db + eq_db + t.freq_tilt_db * (f_norm - 0.5) * 2.0).clamp(-15.0, 15.0);
    (10.0_f32.powf(total_db / 20.0), total_db)
}

#[inline]
pub const fn remote_lod_anchor_indices() -> [usize; REMOTE_ENGINE_LOD_ANCHOR_COUNT] {
    let mut out = [0usize; REMOTE_ENGINE_LOD_ANCHOR_COUNT];
    let (n, c) = ((MAX_ENGINE_GRANULAR_SLICES - 1) as i32, (REMOTE_ENGINE_LOD_ANCHOR_COUNT - 1) as i32);
    let mut k = 0;
    while k < REMOTE_ENGINE_LOD_ANCHOR_COUNT {
        out[k] = (((k as i32) * n + (c / 2)) / c) as usize;
        k += 1;
    }
    out
}

#[allow(clippy::too_many_arguments)]
pub fn evaluate_granular_synthesis(
    tuning: &EngineTuningConfigPod, rpms: &[f32; MAX_ENGINE_GRANULAR_SLICES],
    freqs: &[f32; MAX_ENGINE_GRANULAR_SLICES], norms: &[f32; MAX_ENGINE_GRANULAR_SLICES],
    cur_rpm: f32, smooth_thr: f32, strain: bool, stat_neutral: bool, primary: bool,
) -> GranularSynthesisEval {
    let (idle, red) = (tuning.idle_rpm.max(100.0), tuning.redline_rpm.max(tuning.idle_rpm + 100.0));
    let st_off = if strain { -1800.0 } else { 0.0 };
    let cutoff_hz = if (tuning.flags & 256) != 0 {
        900.0 + smooth_thr * 17100.0 + (cur_rpm / red) * 2000.0 + st_off
    } else {
        2200.0 + smooth_thr * 15800.0 + st_off
    }
    .clamp(800.0, 20000.0);

    let idle_w = if cur_rpm < 1450.0 { (1.0 - (cur_rpm - idle) / 550.0).clamp(0.0, 1.0) } else { 0.0 };
    let (idle_gain, idle_pitch) = (idle_w * tuning.idle_volume.clamp(0.0, 2.0), (cur_rpm / idle).clamp(0.5, 2.0));

    let (lower_idx, upper_idx) = if primary {
        let mut l = 0usize;
        for (i, &r) in rpms.iter().enumerate().take(MAX_ENGINE_GRANULAR_SLICES - 1) {
            if cur_rpm >= r { l = i; } else { break; }
        }
        (l, (l + 1).min(MAX_ENGINE_GRANULAR_SLICES - 1))
    } else {
        let anc = remote_lod_anchor_indices();
        let mut p = 0usize;
        for (k, &idx) in anc.iter().enumerate().take(REMOTE_ENGINE_LOD_ANCHOR_COUNT - 1) {
            if cur_rpm >= rpms[idx] { p = k; } else { break; }
        }
        (anc[p], anc[(p + 1).min(REMOTE_ENGINE_LOD_ANCHOR_COUNT - 1)])
    };

    let (l_rpm, span) = (rpms[lower_idx], rpms[upper_idx] - rpms[lower_idx]);
    let alpha = if upper_idx != lower_idx && span > 1e-3 { ((cur_rpm - l_rpm) / span).clamp(0.0, 1.0) } else { 0.0 };
    let (wl, wu) = if (tuning.flags & 128) != 0 {
        let a = alpha * 0.5 * core::f32::consts::PI;
        (a.cos(), a.sin())
    } else {
        (1.0 - alpha, alpha)
    };

    let eng = if stat_neutral { 0.0 } else { ((cur_rpm - idle) / 160.0).clamp(0.0, 1.0).max((smooth_thr * 2.5).clamp(0.0, 1.0)) };
    let master = (1.0 - idle_w * 0.65) * eng;
    let min_f = freqs[0].max(15.0);
    let max_f = freqs[MAX_ENGINE_GRANULAR_SLICES - 1].max(min_f + 1.0);
    let tgt_f = min_f + ((cur_rpm - idle) / (red - idle)) * (max_f - min_f);
    let (lf, uf) = (freqs[lower_idx].max(15.0), freqs[upper_idx].max(15.0));

    let (lg, ldb) = evaluate_slice_loudness_compensation(tuning, lf, norms[lower_idx], min_f, max_f);
    let (ug, udb) = if upper_idx != lower_idx { evaluate_slice_loudness_compensation(tuning, uf, norms[upper_idx], min_f, max_f) } else { (0.0, 0.0) };
    let (r_min, r_max) = if primary { (0.70, 1.40) } else { (0.65, 1.45) };

    GranularSynthesisEval {
        lower_idx, upper_idx,
        lower_gain: wl * master * lg,
        upper_gain: if upper_idx != lower_idx { wu * master * ug } else { 0.0 },
        lower_rate: (tgt_f / lf).clamp(r_min, r_max),
        upper_rate: (tgt_f / uf).clamp(r_min, r_max),
        idle_gain, idle_pitch, cutoff_hz,
        eq_db: ldb * (1.0 - alpha) + udb * alpha,
    }
}

/// Evaluates the Top-3 remote vehicle LOD budget with wake/sleep hysteresis and distance sorting.
pub fn evaluate_remote_engine_lod_mask(
    cars_state: &[rc_physics_sim::layout::CarStatePod; rc_physics_sim::layout::MAX_CARS],
    prev_awake_mask: u32,
    listener: &crate::pod_types::AudioListenerStatePod,
    cfg: &crate::config_pod::AudioDirectorConfigPod,
    out_dists_uu: &mut [f32; rc_physics_sim::layout::MAX_CARS],
) -> u32 {
    use rc_physics_sim::layout::MAX_CARS;
    let active_car = listener.active_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
    let num_cars = listener.effective_num_cars.clamp(0, MAX_CARS as i32) as usize;
    let (is_audible, has_listener) = ((listener.flags & 1) != 0, (listener.flags & 2) != 0);
    let prof = &cfg.attenuation_profiles[10];
    let scale = cfg.arena_acoustic_scale.max(0.1);
    let min_d = prof.min_distance_uu * scale;
    let max_d = (prof.max_distance_uu * scale).max(min_d + 100.0);
    let (cull_max, wake_cut) = ((prof.flags & 1) != 0, (max_d - 100.0 * scale).max(min_d + 50.0));
    let (mut c_idx, mut c_dst, mut c_cnt) = ([0usize; MAX_CARS], [0.0_f32; MAX_CARS], 0usize);

    for i in 0..num_cars {
        if i == active_car {
            out_dists_uu[i] = 0.0;
            continue;
        }
        let car = &cars_state[i];
        let d = if has_listener {
            let (dx, dy, dz) = (car.pos[0] - listener.pos_uu[0], car.pos[1] - listener.pos_uu[1], car.pos[2] - listener.pos_uu[2]);
            (dx * dx + dy * dy + dz * dz).sqrt()
        } else {
            0.0
        };
        out_dists_uu[i] = d;
        if !is_audible || car.is_demoed > 0.0 || car.pos[2] <= -200.0 || car.pos[0] < -5000.0 {
            continue;
        }
        let awk = (prev_awake_mask & (1u32 << (i as u32))) != 0;
        let culled = cull_max && d > max_d;
        if if awk { !culled } else { !culled && d <= wake_cut } {
            c_idx[c_cnt] = i;
            c_dst[c_cnt] = d - if awk { 60.0 } else { 0.0 };
            c_cnt += 1;
        }
    }
    for a in 1..c_cnt {
        let (ki, kd) = (c_idx[a], c_dst[a]);
        let mut b = a;
        while b > 0 && c_dst[b - 1] > kd {
            c_idx[b] = c_idx[b - 1];
            c_dst[b] = c_dst[b - 1];
            b -= 1;
        }
        c_idx[b] = ki;
        c_dst[b] = kd;
    }
    let mut mask = 0u32;
    for &idx in c_idx.iter().take(c_cnt.min(crate::pod_types::MAX_AUDIBLE_REMOTE_ENGINES)) {
        mask |= 1u32 << (idx as u32);
    }
    mask
}




