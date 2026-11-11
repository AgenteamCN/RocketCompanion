//! Sub-frame replay timeline seeking, orthonormal basis interpolation, and packed controls unpacking.

use glam::Vec3;
use rc_physics_sim::{
    layout::{CarControlsPod, GameStateBufferPod, MAX_CARS, MAX_PADS},
    replay::ReplayFrameEntry,
};

use crate::types::RLRC_TICK_RATE_HZ;

#[inline]
fn lerp_f32(a: f32, b: f32, t: f32) -> f32 {
    a + (b - a) * t
}

#[inline]
fn lerp_vec3(a: [f32; 3], b: [f32; 3], t: f32) -> [f32; 3] {
    [
        lerp_f32(a[0], b[0], t),
        lerp_f32(a[1], b[1], t),
        lerp_f32(a[2], b[2], t),
    ]
}

/// Orthonormalizes an interpolated `(forward, right, up)` basis matching `interpolateReplaySnapshots`
/// in `ReplayFrameInterpolator.ts` (RocketSim left-handed coordinate frame: `right = cross(up, fwd)`).
fn interpolate_orthonormal_basis(
    fwd0: [f32; 3],
    right0: [f32; 3],
    up0: [f32; 3],
    fwd1: [f32; 3],
    right1: [f32; 3],
    up1: [f32; 3],
    t: f32,
) -> ([f32; 3], [f32; 3], [f32; 3]) {
    let raw_f = Vec3::from_array(lerp_vec3(fwd0, fwd1, t));
    let f = if raw_f.length_squared() > 1e-8 {
        raw_f.normalize()
    } else {
        Vec3::from_array(fwd0).normalize_or_zero()
    };

    let raw_u = Vec3::from_array(lerp_vec3(up0, up1, t));
    let ortho_u = raw_u - f * raw_u.dot(f);
    let u = if ortho_u.length_squared() > 1e-8 {
        ortho_u.normalize()
    } else {
        let fallback_u = Vec3::from_array(up0);
        (fallback_u - f * fallback_u.dot(f)).normalize_or_zero()
    };

    let mut r = u.cross(f);
    let raw_r = Vec3::from_array(lerp_vec3(right0, right1, t));
    if r.dot(raw_r) < 0.0 {
        r = -r;
    }
    let r = r.normalize_or_zero();
    (f.to_array(), r.to_array(), u.to_array())
}

/// Unpacks 64-byte Track 0 packed controls into 8 `CarControlsPod` slots
/// matching `unpackTrack64ToCarControls` in `RCReplayBinarySchema.ts`.
pub fn unpack_track64_to_controls(
    packed: &[u8; 64],
    out_controls: &mut [CarControlsPod; MAX_CARS],
) {
    for c in 0..MAX_CARS {
        let b0 = packed[c * 3];
        let b1 = packed[c * 3 + 1];
        let b2 = packed[c * 3 + 2];
        let q_off = 24 + c * 5;
        let q0 = packed[q_off] as i8;
        let q1 = packed[q_off + 1] as i8;
        let q2 = packed[q_off + 2] as i8;
        let q3 = packed[q_off + 3] as i8;
        let q4 = packed[q_off + 4] as i8;

        if b0 == 0 && b1 == 0 && b2 == 0 && q0 == 0 && q1 == 0 {
            out_controls[c] = CarControlsPod::default();
            continue;
        }

        let jump = if (b2 & (1 << 5)) != 0 { 1.0 } else { 0.0 };
        let boost = if (b2 & (1 << 6)) != 0 { 1.0 } else { 0.0 };
        let handbrake = if (b2 & (1 << 7)) != 0 { 1.0 } else { 0.0 };

        let (throttle, steer, pitch, yaw, roll) =
            if q0 != 0 || q1 != 0 || q2 != 0 || q3 != 0 || q4 != 0 {
                (
                    f32::from(q0) / 127.0,
                    f32::from(q1) / 127.0,
                    f32::from(q2) / 127.0,
                    f32::from(q3) / 127.0,
                    f32::from(q4) / 127.0,
                )
            } else {
                (
                    (f32::from(b0 & 0x3f) - 31.0) / 31.0,
                    (f32::from(((b0 >> 2) & 0x30) | (b1 & 0x0f)) - 31.0) / 31.0,
                    (f32::from((b1 >> 4) & 0x07) - 3.0) / 3.0,
                    (f32::from(((b1 >> 5) & 0x04) | (b2 & 0x03)) - 3.0) / 3.0,
                    (f32::from((b2 >> 2) & 0x07) - 3.0) / 3.0,
                )
            };

        out_controls[c] = CarControlsPod {
            throttle,
            steer,
            pitch,
            yaw,
            roll,
            jump,
            boost,
            handbrake,
        };
    }
}

/// Interpolates between two `GameStateBufferPod` snapshots at `alpha` in `[0.0, 1.0]`.
pub fn interpolate_game_state_pods(
    s0: &GameStateBufferPod,
    s1: &GameStateBufferPod,
    alpha: f32,
) -> GameStateBufferPod {
    let t = alpha.clamp(0.0, 1.0);
    if t <= 1e-4 {
        return *s0;
    }
    if t >= 0.9999 {
        return *s1;
    }

    let mut out = if t < 0.5 { *s0 } else { *s1 };
    out.header.tick_count = lerp_f32(s0.header.tick_count, s1.header.tick_count, t).round();

    out.ball.pos = lerp_vec3(s0.ball.pos, s1.ball.pos, t);
    out.ball.vel = lerp_vec3(s0.ball.vel, s1.ball.vel, t);
    out.ball.ang_vel = lerp_vec3(s0.ball.ang_vel, s1.ball.ang_vel, t);
    let (bf, br, bu) = interpolate_orthonormal_basis(
        s0.ball.forward,
        s0.ball.right,
        s0.ball.up,
        s1.ball.forward,
        s1.ball.right,
        s1.ball.up,
        t,
    );
    out.ball.forward = bf;
    out.ball.right = br;
    out.ball.up = bu;

    let num_cars = (s1.header.num_cars.round() as usize).clamp(0, MAX_CARS);
    for c in 0..num_cars {
        let c0 = &s0.cars[c];
        let c1 = &s1.cars[c];
        let dst = &mut out.cars[c];
        dst.pos = lerp_vec3(c0.pos, c1.pos, t);
        dst.vel = lerp_vec3(c0.vel, c1.vel, t);
        dst.ang_vel = lerp_vec3(c0.ang_vel, c1.ang_vel, t);
        dst.boost = lerp_f32(c0.boost, c1.boost, t);
        let (cf, cr, cu) = interpolate_orthonormal_basis(
            c0.forward, c0.right, c0.up, c1.forward, c1.right, c1.up, t,
        );
        dst.forward = cf;
        dst.right = cr;
        dst.up = cu;
    }

    for p in 0..MAX_PADS {
        out.pads[p].cooldown = lerp_f32(s0.pads[p].cooldown, s1.pads[p].cooldown, t);
        out.pads[p].is_active = if out.pads[p].cooldown <= 1e-4 {
            1.0
        } else {
            0.0
        };
    }

    out
}

/// Seeks the replay state track by time in seconds (`time_sec`), interpolating sub-frame state
/// directly into `out_state` and `out_controls`. Returns the floor frame index (`-1` if empty).
pub fn seek_replay_time_into_buffers(
    state_track: &[ReplayFrameEntry],
    tick_rate_hz: f32,
    time_sec: f32,
    interpolate_mode: i32,
    out_state: &mut GameStateBufferPod,
    out_controls: &mut [CarControlsPod; MAX_CARS],
) -> i32 {
    if state_track.is_empty() {
        return -1;
    }
    let rate = if tick_rate_hz > 0.0 {
        tick_rate_hz
    } else {
        RLRC_TICK_RATE_HZ
    };
    let max_idx = (state_track.len() - 1) as f32;
    let exact_cursor = (time_sec.max(0.0) * rate).clamp(0.0, max_idx);
    let idx0 = (exact_cursor.floor() as usize).min(state_track.len() - 1);
    let idx1 = (idx0 + 1).min(state_track.len() - 1);
    let alpha = exact_cursor - (idx0 as f32);

    if interpolate_mode == 0 || idx0 == idx1 {
        let picked = if alpha >= 0.5 { idx1 } else { idx0 };
        *out_state = state_track[picked].state;
        unpack_track64_to_controls(&state_track[picked].packed_controls, out_controls);
        return picked as i32;
    }

    *out_state = interpolate_game_state_pods(
        &state_track[idx0].state,
        &state_track[idx1].state,
        alpha,
    );
    let ctrl_idx = if alpha >= 0.5 { idx1 } else { idx0 };
    unpack_track64_to_controls(&state_track[ctrl_idx].packed_controls, out_controls);
    idx0 as i32
}
