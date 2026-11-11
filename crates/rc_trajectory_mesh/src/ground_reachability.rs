//! Ground/surface reachability isochrone solvers (1s / 2s / 3s, Boost = 0):
//! - 3D Trilinear Interpolation over RocketSim WASM Convex-Hull LUT
//! - Analytical kinematic super-ellipse envelope fallback
//! - Temporal EMA smoothing and 3D contour/fill vertex generation

use rc_physics_sim::layout::CarStatePod;

use crate::{
    layout::{
        GROUND_FILL0_VERTS, GROUND_FILL_BAND_VERTS, GROUND_HORIZON_COUNT, GROUND_LUT_TOTAL_ELEMENTS,
        GROUND_RADII_FLOATS, GROUND_RING_VERTS, N_GROUND_BINS,
    },
    reachability_constants::{clip_arena_rocketsim_xyz, ground_bin_angle, VF_GRID, VR_GRID, WZ_GRID},
};

#[inline]
fn find_grid_segment(grid: &[f32], val: f32) -> (usize, f32) {
    let n = grid.len();
    if val <= grid[0] {
        return (0, 0.0);
    }
    if val >= grid[n - 1] {
        return (n - 2, 1.0);
    }
    for i in 0..(n - 1) {
        let g0 = grid[i];
        let g1 = grid[i + 1];
        if val >= g0 && val <= g1 {
            return (i, (val - g0) / (g1 - g0));
        }
    }
    (0, 0.0)
}

/// Analytical kinematic super-ellipse envelope model.
pub fn predict_ground_radii_analytical(
    mut vf: f32,
    mut vr: f32,
    mut wz: f32,
    out_radii: &mut [f32; GROUND_RADII_FLOATS],
) {
    if vf.hypot(vr) < 8.0 {
        vf = 0.0;
        vr = 0.0;
    }
    if wz.abs() < 0.05 {
        wz = 0.0;
    }

    let is_symmetric = vr == 0.0 && wz == 0.0;
    let yaw_bias = (wz * 0.14).clamp(-0.45, 0.45);

    for h_idx in 0..GROUND_HORIZON_COUNT {
        let abs_vf_clamped = vf.abs().min(1400.0);
        let (drift_u, drift_v, r_fwd, r_bwd, r_lat) = match h_idx {
            0 => (
                vf * 0.62,
                vr * 0.45 + wz * 35.0,
                585.0 + vf.max(0.0) * 0.35,
                440.0 - vf.min(0.0) * 0.25,
                440.0 + abs_vf_clamped * 0.3,
            ),
            1 => (
                vf * 0.85,
                vr * 0.65 + wz * 85.0,
                1800.0 + vf.max(0.0) * 0.4,
                1420.0 - vf.min(0.0) * 0.35,
                1420.0 + abs_vf_clamped * 0.35,
            ),
            _ => (
                vf * 0.95,
                vr * 0.75 + wz * 125.0,
                3200.0 + vf.max(0.0) * 0.45,
                1950.0 - vf.min(0.0) * 0.4,
                1950.0 + abs_vf_clamped * 0.38,
            ),
        };

        let base = h_idx * N_GROUND_BINS;
        let turn_side = if wz >= 0.0 { 1.0 } else { -1.0 };
        let wz_scale = (wz.abs() / 3.0).min(1.0);

        for i in 0..N_GROUND_BINS {
            let phi = ground_bin_angle(i) - yaw_bias;
            let (s_phi, c_phi) = phi.sin_cos();
            let w_fwd = 0.5 * (1.0 + c_phi);
            let r_lon = (w_fwd * r_fwd + (1.0 - w_fwd) * r_bwd).max(1.0);
            let r_lat_safe = r_lat.max(1.0);

            let denom = (c_phi / r_lon).hypot(s_phi / r_lat_safe);
            let mut r_shape = 1.0 / denom.max(1e-6);

            if wz.abs() > 0.05 {
                let raw_bulge = (turn_side * s_phi * (1.0 + c_phi * 0.5)).clamp(-1.0, 1.0);
                r_shape *= 1.0 + 0.12 * raw_bulge * wz_scale;
            }

            let pu = drift_u + r_shape * c_phi;
            let pv = drift_v + r_shape * s_phi;
            out_radii[base + i] = pu.hypot(pv);
        }

        if is_symmetric {
            for b in 1..(N_GROUND_BINS >> 1) {
                let sym = N_GROUND_BINS - b;
                let avg = 0.5 * (out_radii[base + b] + out_radii[base + sym]);
                out_radii[base + b] = avg;
                out_radii[base + sym] = avg;
            }
        }
    }

    for b in 0..N_GROUND_BINS {
        let r0 = out_radii[b].max(60.0);
        let r1 = out_radii[N_GROUND_BINS + b].max(r0 + 60.0);
        let r2 = out_radii[2 * N_GROUND_BINS + b].max(r1 + 60.0);
        out_radii[b] = r0;
        out_radii[N_GROUND_BINS + b] = r1;
        out_radii[2 * N_GROUND_BINS + b] = r2;
    }
}

/// Predicts `(3 * 72)` polar radii using 3D Trilinear Interpolation over the pre-baked LUT.
/// Falls back gracefully to the analytical kinematic model if the LUT is not loaded.
pub fn predict_ground_radii_lut(
    mut vf: f32,
    mut vr: f32,
    mut wz: f32,
    lut: &[f32],
    out_radii: &mut [f32; GROUND_RADII_FLOATS],
) {
    if lut.len() < GROUND_LUT_TOTAL_ELEMENTS {
        predict_ground_radii_analytical(vf, vr, wz, out_radii);
        return;
    }

    let stride = GROUND_HORIZON_COUNT * N_GROUND_BINS;
    let n_vr = VR_GRID.len();
    let n_wz = WZ_GRID.len();

    if vf.hypot(vr) < 8.0 {
        vf = 0.0;
        vr = 0.0;
    }
    if wz.abs() < 0.05 {
        wz = 0.0;
    }

    let flip = vr < 0.0 || (vr == 0.0 && wz < 0.0);
    let vr_abs = vr.abs();
    let wz_sym = if flip { -wz } else { wz };

    let (i0, du) = find_grid_segment(&VF_GRID, vf);
    let (j0, dv) = find_grid_segment(&VR_GRID, vr_abs);
    let (k0, dw) = find_grid_segment(&WZ_GRID, wz_sym);

    let w000 = (1.0 - du) * (1.0 - dv) * (1.0 - dw);
    let w100 = du * (1.0 - dv) * (1.0 - dw);
    let w010 = (1.0 - du) * dv * (1.0 - dw);
    let w110 = du * dv * (1.0 - dw);
    let w001 = (1.0 - du) * (1.0 - dv) * dw;
    let w101 = du * (1.0 - dv) * dw;
    let w011 = (1.0 - du) * dv * dw;
    let w111 = du * dv * dw;

    let idx000 = ((i0 * n_vr + j0) * n_wz + k0) * stride;
    let idx100 = (((i0 + 1) * n_vr + j0) * n_wz + k0) * stride;
    let idx010 = ((i0 * n_vr + (j0 + 1)) * n_wz + k0) * stride;
    let idx110 = (((i0 + 1) * n_vr + (j0 + 1)) * n_wz + k0) * stride;
    let idx001 = idx000 + stride;
    let idx101 = idx100 + stride;
    let idx011 = idx010 + stride;
    let idx111 = idx110 + stride;

    for m in 0..stride {
        out_radii[m] = lut[idx000 + m] * w000
            + lut[idx100 + m] * w100
            + lut[idx010 + m] * w010
            + lut[idx110 + m] * w110
            + lut[idx001 + m] * w001
            + lut[idx101 + m] * w101
            + lut[idx011 + m] * w011
            + lut[idx111 + m] * w111;
    }

    if flip {
        for h in 0..GROUND_HORIZON_COUNT {
            let base = h * N_GROUND_BINS;
            for b in 1..(N_GROUND_BINS >> 1) {
                let sym = N_GROUND_BINS - b;
                out_radii.swap(base + b, base + sym);
            }
        }
    }

    // Enforce strict horizon nesting
    for b in 0..N_GROUND_BINS {
        let r0 = out_radii[b].max(60.0);
        let r1 = out_radii[N_GROUND_BINS + b].max(r0 + 50.0);
        let r2 = out_radii[2 * N_GROUND_BINS + b].max(r1 + 50.0);
        out_radii[b] = r0;
        out_radii[N_GROUND_BINS + b] = r1;
        out_radii[2 * N_GROUND_BINS + b] = r2;
    }
}

/// Updates ground reachability radii, temporal EMA smoothing, and Three.js contour line + translucent fill buffers.
pub fn update_ground_reachability_geometry(
    car: &CarStatePod,
    car_pos_override: [f32; 3],
    use_analytical: bool,
    lut: &[f32],
    raw_radii: &mut [f32; GROUND_RADII_FLOATS],
    smoothed_radii: &mut [f32; GROUND_RADII_FLOATS],
    has_prev_radii: &mut bool,
    line_positions: &mut [[f32; GROUND_RING_VERTS * 3]; GROUND_HORIZON_COUNT],
    fill0_positions: &mut [f32; GROUND_FILL0_VERTS * 3],
    fill1_positions: &mut [f32; GROUND_FILL_BAND_VERTS * 3],
    fill2_positions: &mut [f32; GROUND_FILL_BAND_VERTS * 3],
) {
    let [pos_x, pos_y, pos_z] = car_pos_override;
    let [vel_x, vel_y, vel_z] = car.vel;
    let [fwd_x, fwd_y, fwd_z] = car.forward;
    let [right_x, right_y, right_z] = car.right;
    let [up_x, up_y, up_z] = car.up;
    let [ang_x, ang_y, ang_z] = car.ang_vel;

    // Project 3D velocity & angular velocity onto current driving surface frame
    let vf = vel_x * fwd_x + vel_y * fwd_y + vel_z * fwd_z;
    let vr = vel_x * right_x + vel_y * right_y + vel_z * right_z;
    let wz = ang_x * up_x + ang_y * up_y + ang_z * up_z;

    if use_analytical {
        predict_ground_radii_analytical(vf, vr, wz, raw_radii);
    } else {
        predict_ground_radii_lut(vf, vr, wz, lut, raw_radii);
    }

    // Temporal EMA filter to keep contours rock-solid at 120Hz
    let car_spd = vf.hypot(vr);
    let alpha = if car_spd > 30.0 { 0.42 } else { 0.85 };
    if !*has_prev_radii {
        *smoothed_radii = *raw_radii;
        *has_prev_radii = true;
    } else {
        let one_minus_alpha = 1.0 - alpha;
        for i in 0..GROUND_RADII_FLOATS {
            smoothed_radii[i] = alpha * raw_radii[i] + one_minus_alpha * smoothed_radii[i];
        }
    }

    let normal_offsets = [7.0f32, 9.5, 12.0];

    // Car origin in Three.js coords lifted slightly along surface normal
    let car_three_x = pos_x + up_x * 6.0;
    let car_three_y = pos_z + up_z * 6.0;
    let car_three_z = pos_y + up_y * 6.0;

    let mut world_rings = [[0.0f32; N_GROUND_BINS * 3]; GROUND_HORIZON_COUNT];

    for h in 0..GROUND_HORIZON_COUNT {
        let base = h * N_GROUND_BINS;
        let n_lift = normal_offsets[h];
        let ring_three = &mut world_rings[h];
        let line_arr = &mut line_positions[h];

        for i in 0..N_GROUND_BINS {
            let r = smoothed_radii[base + i];
            let angle = ground_bin_angle(i);
            let (s_a, c_a) = angle.sin_cos();
            let lu = r * c_a;
            let lv = r * s_a;

            let wx = pos_x + lu * fwd_x + lv * right_x + n_lift * up_x;
            let wy = pos_y + lu * fwd_y + lv * right_y + n_lift * up_y;
            let wz_coord = pos_z + lu * fwd_z + lv * right_z + n_lift * up_z;

            let (cx, cy, cz) = clip_arena_rocketsim_xyz(wx, wy, wz_coord, 44.0);
            // Convert RocketSim (x, y, z) -> Three.js (x, z, y)
            let tx = cx;
            let ty = cz;
            let tz = cy;

            let idx3 = i * 3;
            ring_three[idx3] = tx;
            ring_three[idx3 + 1] = ty;
            ring_three[idx3 + 2] = tz;

            line_arr[idx3] = tx;
            line_arr[idx3 + 1] = ty;
            line_arr[idx3 + 2] = tz;
        }

        // Close contour loop
        let last_idx = N_GROUND_BINS * 3;
        line_arr[last_idx] = ring_three[0];
        line_arr[last_idx + 1] = ring_three[1];
        line_arr[last_idx + 2] = ring_three[2];
    }

    // Fill 0: car origin at [0..3] + ring 0 at [3..219]
    fill0_positions[0] = car_three_x;
    fill0_positions[1] = car_three_y;
    fill0_positions[2] = car_three_z;
    fill0_positions[3..].copy_from_slice(&world_rings[0]);

    // Fill 1: ring 0 + ring 1
    let ring_floats = N_GROUND_BINS * 3;
    fill1_positions[..ring_floats].copy_from_slice(&world_rings[0]);
    fill1_positions[ring_floats..].copy_from_slice(&world_rings[1]);

    // Fill 2: ring 1 + ring 2
    fill2_positions[..ring_floats].copy_from_slice(&world_rings[1]);
    fill2_positions[ring_floats..].copy_from_slice(&world_rings[2]);
}
