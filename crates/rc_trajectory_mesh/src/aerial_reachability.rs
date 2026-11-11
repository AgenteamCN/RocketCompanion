//! Aerial kinematics, boost-driven thrust reachability kernels,
//! 3D Spacetime Funnel / Horn generation, and Discrete Isochrone Bubbles.

use rc_physics_sim::layout::CarStatePod;

use crate::{
    layout::{
        BUBBLE_RIB_VERTS_COUNT, BUBBLE_VERTS_COUNT, FUNNEL_RAIL_SEGMENTS_VERTS,
        FUNNEL_RING_LINE_VERTS, FUNNEL_RINGS, FUNNEL_SECTORS, FUNNEL_VERTS_COUNT,
        GROUND_HORIZON_COUNT,
    },
    reachability_constants::{
        clip_arena_rocketsim_xyz, funnel_ring_time, funnel_sector_phi, BubbleSphereTables,
        BOOST_ACCEL, BOOST_BURN_RATE, FUNNEL_IDX_1S, FUNNEL_IDX_2S, FUNNEL_IDX_3S, GRAVITY_Z,
        HORIZON_RGB, JUMP_MIN_VELOCITY, MAX_CAR_SPEED,
    },
};

#[derive(Clone, Copy)]
pub struct BallisticCenter {
    pub x: f32,
    pub y: f32,
    pub z: f32,
    pub ivx: f32,
    pub ivy: f32,
    pub ivz: f32,
}

/// Computes aerial orientation turn delay (in seconds) required to align car nose (`fwd`)
/// with a target unit direction `(dx, dy, dz)`, accounting for current angular velocity.
#[inline]
pub fn compute_aerial_turn_latency(
    fwd: [f32; 3],
    dir: [f32; 3],
    ang_vel: [f32; 3],
) -> f32 {
    let cos_alpha = (fwd[0] * dir[0] + fwd[1] * dir[1] + fwd[2] * dir[2]).clamp(-1.0, 1.0);
    let alpha = cos_alpha.acos();
    if alpha < 0.08 {
        return 0.0;
    }

    // Axis of desired rotation: cross(fwd, dir)
    let rx = fwd[1] * dir[2] - fwd[2] * dir[1];
    let ry = fwd[2] * dir[0] - fwd[0] * dir[2];
    let rz = fwd[0] * dir[1] - fwd[1] * dir[0];
    let r_len = (rx * rx + ry * ry + rz * rz).sqrt();
    let omega_toward = if r_len > 1e-4 {
        (ang_vel[0] * rx + ang_vel[1] * ry + ang_vel[2] * rz) / r_len
    } else {
        0.0
    };

    // Effective angular acceleration in RocketSim air (~10.8 rad/s^2)
    let alpha_max = 10.8f32;
    let disc = (omega_toward * omega_toward + 2.0 * alpha_max * alpha).max(0.0);
    let t_raw = (-omega_toward + disc.sqrt()) / alpha_max;
    (t_raw * 0.68).clamp(0.0, 0.42)
}

/// Computes the ballistic center `c(t)` in RocketSim coordinates at lookahead time `t` (seconds),
/// enforcing RocketSim's 2300 UU/s maximum speed cap and minimum single-jump impulse (328.125 UU/s)
/// when on the ground, while clamping Z to the stadium floor (`>= 17.0` UU).
#[inline]
pub fn compute_ballistic_center(
    pos: [f32; 3],
    vel: [f32; 3],
    up: [f32; 3],
    t: f32,
    include_jump_impulse: bool,
    is_on_ground: bool,
) -> BallisticCenter {
    let jump_vel = if include_jump_impulse && is_on_ground {
        JUMP_MIN_VELOCITY
    } else {
        0.0
    };
    let ivx = vel[0] + jump_vel * up[0];
    let ivy = vel[1] + jump_vel * up[1];
    let ivz = vel[2] + jump_vel * up[2];

    let evx = ivx;
    let evy = ivy;
    let evz = ivz + GRAVITY_Z * t;
    let end_spd = (evx * evx + evy * evy + evz * evz).sqrt();

    let mut cx = pos[0] + ivx * t;
    let mut cy = pos[1] + ivy * t;
    let mut cz = pos[2] + ivz * t + 0.5 * GRAVITY_Z * t * t;

    if end_spd > MAX_CAR_SPEED {
        let scale = MAX_CAR_SPEED / end_spd;
        let avg_scale = 0.5 * (1.0 + scale);
        cx = pos[0] + (cx - pos[0]) * avg_scale;
        cy = pos[1] + (cy - pos[1]) * avg_scale;
        cz = pos[2] + (cz - pos[2]) * avg_scale;
    }

    if cz < 17.0 {
        cz = 17.0;
    }

    BallisticCenter {
        x: cx,
        y: cy,
        z: cz,
        ivx,
        ivy,
        ivz,
    }
}

/// Computes directional thrust displacement `s_thrust(t)` in UU along unit vector `d`
/// given available boost (`0..100`), lookahead time `t`, turn latency `t_turn`, and initial velocity along `d`.
#[inline]
pub fn compute_directional_boost_reach(
    t: f32,
    boost_amount: f32,
    t_turn: f32,
    vel_along_d: f32,
) -> f32 {
    let avail_burn = boost_amount.max(0.0) / BOOST_BURN_RATE;
    let t_active = (t - t_turn).max(0.0);
    let tau = t_active.min(avail_burn);
    let t_coast = (t_active - tau).max(0.0);

    let mut s_thrust = 0.5 * BOOST_ACCEL * tau * tau + BOOST_ACCEL * tau * t_coast;

    if vel_along_d > 0.0 {
        let max_extra_disp = ((MAX_CAR_SPEED - vel_along_d) * t_active).max(0.0);
        if s_thrust > max_extra_disp {
            s_thrust = max_extra_disp;
        }
    }

    s_thrust
}

/// Updates 3D Spacetime Funnel / Horn positions, colors, 1s/2s/3s ring contours, and 4 longitudinal guide rails.
pub fn update_aerial_funnel_geometry(
    car: &CarStatePod,
    car_pos_override: [f32; 3],
    include_jump: bool,
    funnel_positions: &mut [f32; FUNNEL_VERTS_COUNT * 3],
    funnel_colors: &mut [f32; FUNNEL_VERTS_COUNT * 3],
    funnel_ring_line_positions: &mut [[f32; FUNNEL_RING_LINE_VERTS * 3]; GROUND_HORIZON_COUNT],
    funnel_rail_positions: &mut [f32; FUNNEL_RAIL_SEGMENTS_VERTS * 3],
) {
    let is_on_ground = car.is_on_ground > 0.5;
    let boost = car.boost;
    let fwd = car.forward;
    let right = car.right;
    let up = car.up;
    let ang_vel = car.ang_vel;

    for i in 0..FUNNEL_RINGS {
        let t = funnel_ring_time(i);
        let c = compute_ballistic_center(
            car_pos_override,
            car.vel,
            up,
            t,
            include_jump,
            is_on_ground,
        );

        let rgb = if t <= 1.05 {
            HORIZON_RGB[0]
        } else if t <= 2.05 {
            HORIZON_RGB[1]
        } else {
            HORIZON_RGB[2]
        };

        for j in 0..FUNNEL_SECTORS {
            let phi = funnel_sector_phi(j);
            let (sin_phi, cos_phi) = phi.sin_cos();

            // Radial direction in car's (right, up) cross-plane
            let dir_x = right[0] * cos_phi + up[0] * sin_phi;
            let dir_y = right[1] * cos_phi + up[1] * sin_phi;
            let dir_z = right[2] * cos_phi + up[2] * sin_phi;
            let dir = [dir_x, dir_y, dir_z];

            let t_turn = compute_aerial_turn_latency(fwd, dir, ang_vel);
            let vel_along_d = c.ivx * dir_x + c.ivy * dir_y + c.ivz * dir_z;
            let s_thrust = compute_directional_boost_reach(t, boost, t_turn, vel_along_d);

            let r_lat = s_thrust * 0.92 + 35.0 + 28.0 * t;
            let r_vert = r_lat;

            let wx = c.x + right[0] * (r_lat * cos_phi) + up[0] * (r_vert * sin_phi);
            let wy = c.y + right[1] * (r_lat * cos_phi) + up[1] * (r_vert * sin_phi);
            let wz_coord = c.z + right[2] * (r_lat * cos_phi) + up[2] * (r_vert * sin_phi);
            let (cx, cy, cz) = clip_arena_rocketsim_xyz(wx, wy, wz_coord, 32.0);

            let v_idx3 = (i * FUNNEL_SECTORS + j) * 3;
            funnel_positions[v_idx3] = cx;
            funnel_positions[v_idx3 + 1] = cz;
            funnel_positions[v_idx3 + 2] = cy;

            let shade = 0.5
                + 0.3 * (0.4 * dir_x - 0.4 * dir_y + 0.8 * dir_z).max(0.0)
                + 0.2 * (0.5 * (dir_z + 1.0));
            funnel_colors[v_idx3] = rgb[0] * shade;
            funnel_colors[v_idx3 + 1] = rgb[1] * shade;
            funnel_colors[v_idx3 + 2] = rgb[2] * shade;
        }
    }

    // Update 1s, 2s, 3s Isochrone Rings
    let ring_indices = [FUNNEL_IDX_1S, FUNNEL_IDX_2S, FUNNEL_IDX_3S];
    for h in 0..GROUND_HORIZON_COUNT {
        let ring_i = ring_indices[h];
        let r_arr = &mut funnel_ring_line_positions[h];
        let base_v3 = ring_i * FUNNEL_SECTORS * 3;
        for j in 0..FUNNEL_SECTORS {
            let src = base_v3 + j * 3;
            let dst = j * 3;
            r_arr[dst] = funnel_positions[src];
            r_arr[dst + 1] = funnel_positions[src + 1];
            r_arr[dst + 2] = funnel_positions[src + 2];
        }
        let last_dst = FUNNEL_SECTORS * 3;
        r_arr[last_dst] = funnel_positions[base_v3];
        r_arr[last_dst + 1] = funnel_positions[base_v3 + 1];
        r_arr[last_dst + 2] = funnel_positions[base_v3 + 2];
    }

    // Update 4 Longitudinal Rails
    let quarter_sectors = [
        0usize,
        FUNNEL_SECTORS >> 2,
        FUNNEL_SECTORS >> 1,
        (3 * FUNNEL_SECTORS) >> 2,
    ];
    let mut ptr = 0;
    for sec_j in quarter_sectors {
        for i in 0..(FUNNEL_RINGS - 1) {
            let v0 = (i * FUNNEL_SECTORS + sec_j) * 3;
            let v1 = ((i + 1) * FUNNEL_SECTORS + sec_j) * 3;
            funnel_rail_positions[ptr] = funnel_positions[v0];
            funnel_rail_positions[ptr + 1] = funnel_positions[v0 + 1];
            funnel_rail_positions[ptr + 2] = funnel_positions[v0 + 2];
            funnel_rail_positions[ptr + 3] = funnel_positions[v1];
            funnel_rail_positions[ptr + 4] = funnel_positions[v1 + 1];
            funnel_rail_positions[ptr + 5] = funnel_positions[v1 + 2];
            ptr += 6;
        }
    }
}

/// Updates Discrete 1s/2s/3s Isochrone Bubbles positions, colors, and wireframe rib segments.
pub fn update_aerial_bubbles_geometry(
    car: &CarStatePod,
    car_pos_override: [f32; 3],
    include_jump: bool,
    tables: &BubbleSphereTables,
    bubble_positions: &mut [[f32; BUBBLE_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
    bubble_colors: &mut [[f32; BUBBLE_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
    bubble_rib_positions: &mut [[f32; BUBBLE_RIB_VERTS_COUNT * 3]; GROUND_HORIZON_COUNT],
) {
    let is_on_ground = car.is_on_ground > 0.5;
    let boost = car.boost;
    let fwd = car.forward;
    let up = car.up;
    let ang_vel = car.ang_vel;
    let horizons = [1.0f32, 2.0, 3.0];

    for h in 0..GROUND_HORIZON_COUNT {
        let big_t = horizons[h];
        let c = compute_ballistic_center(
            car_pos_override,
            car.vel,
            up,
            big_t,
            include_jump,
            is_on_ground,
        );

        let pos_arr = &mut bubble_positions[h];
        let col_arr = &mut bubble_colors[h];
        let rgb = HORIZON_RGB[h];

        for v in 0..BUBBLE_VERTS_COUNT {
            let dir = tables.unit_dirs[v];
            let [dx, dy, dz] = dir;

            let t_turn = compute_aerial_turn_latency(fwd, dir, ang_vel);
            let vel_along_d = c.ivx * dx + c.ivy * dy + c.ivz * dz;
            let s_thrust = compute_directional_boost_reach(big_t, boost, t_turn, vel_along_d);
            let r_total = s_thrust + 65.0 + 30.0 * big_t;

            let wx = c.x + dx * r_total;
            let wy = c.y + dy * r_total;
            let wz_coord = c.z + dz * r_total;
            let (cx, cy, cz) = clip_arena_rocketsim_xyz(wx, wy, wz_coord, 36.0);

            let v3 = v * 3;
            pos_arr[v3] = cx;
            pos_arr[v3 + 1] = cz;
            pos_arr[v3 + 2] = cy;

            let shade = 0.45
                + 0.35 * (0.45 * dx - 0.5 * dy + 0.74 * dz).max(0.0)
                + 0.2 * (0.5 * (dz + 1.0));
            col_arr[v3] = rgb[0] * shade;
            col_arr[v3 + 1] = rgb[1] * shade;
            col_arr[v3 + 2] = rgb[2] * shade;
        }

        let rib_arr = &mut bubble_rib_positions[h];
        for (r, &v_idx) in tables.rib_indices.iter().enumerate() {
            let src3 = (v_idx as usize) * 3;
            let dst3 = r * 3;
            rib_arr[dst3] = pos_arr[src3];
            rib_arr[dst3 + 1] = pos_arr[src3 + 1];
            rib_arr[dst3 + 2] = pos_arr[src3 + 2];
        }
    }
}
