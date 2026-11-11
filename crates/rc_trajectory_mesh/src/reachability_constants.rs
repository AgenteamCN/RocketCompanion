//! Shared constants, physics parameters, visual palette, trigonometric tables,
//! and standard carball arena clipping for Reachability & Intercept.

use core::f32::consts::{PI, TAU};

use crate::layout::{BUBBLE_LAT, BUBBLE_LON, BUBBLE_VERTS_COUNT, FUNNEL_RINGS, FUNNEL_SECTORS, N_GROUND_BINS};

pub const GRAVITY_Z: f32 = -650.0;
pub const BOOST_ACCEL: f32 = 1058.333; // RocketSim aerial boost (991.667) + air throttle (66.667)
pub const BOOST_BURN_RATE: f32 = 33.333;
pub const MAX_CAR_SPEED: f32 = 2300.0;
pub const BALL_CAR_CONTACT_RADIUS: f32 = 148.0; // Ball radius (91.25) + Octane effective nose reach (~56.75)
pub const JUMP_IMMEDIATE_FORCE: f32 = 291.667; // Frame-1 jump impulse (875 / 3 UU/s)
pub const JUMP_MIN_VELOCITY: f32 = 328.125; // Minimum tap-jump upward velocity: 291.667 + 0.025s * 1458.333
pub const JUMP_MAX_SINGLE_VELOCITY: f32 = 583.333; // Full 0.20s held single-jump upward velocity

pub const FUNNEL_IDX_1S: usize = 5; // t ~ 1.04s
pub const FUNNEL_IDX_2S: usize = 10; // t ~ 2.02s
pub const FUNNEL_IDX_3S: usize = FUNNEL_RINGS - 1; // t = 3.00s

pub const HORIZON_RGB: [[f32; 3]; 3] = [
    [0.05, 0.95, 0.65], // 1s Cyan-Green
    [1.0, 0.85, 0.1],   // 2s Gold
    [1.0, 0.28, 0.65],  // 3s Rose
];

pub const VF_GRID: [f32; 11] = [
    -1400.0, -1000.0, -600.0, -250.0, 0.0, 250.0, 600.0, 1000.0, 1400.0, 1850.0, 2300.0,
];
pub const VR_GRID: [f32; 5] = [0.0, 250.0, 600.0, 1000.0, 1500.0];
pub const WZ_GRID: [f32; 3] = [-3.0, 0.0, 3.0];

//Reachability bitflags passed via `_physics_updateReachabilityAndIntercept(..., flags, ...)`
pub const REACH_FLAG_SHOW_GROUND: u32 = 1 << 0;
pub const REACH_FLAG_GROUND_ANALYTICAL: u32 = 1 << 1;
pub const REACH_FLAG_SHOW_AERIAL: u32 = 1 << 2;
pub const REACH_FLAG_AERIAL_BUBBLES: u32 = 1 << 3;
pub const REACH_FLAG_AERIAL_SHOW_RINGS: u32 = 1 << 4;
pub const REACH_FLAG_AERIAL_SHOW_RAILS: u32 = 1 << 5;
pub const REACH_FLAG_INCLUDE_JUMP_IMPULSE: u32 = 1 << 6;
pub const REACH_FLAG_SHOW_INTERCEPT: u32 = 1 << 7;
pub const REACH_FLAG_CROSS_TRAJECTORY_ORIENT: u32 = 1 << 8;
pub const REACH_FLAG_SHOW_CLOSEST_FALLBACK: u32 = 1 << 9;

#[inline]
pub fn ground_bin_angle(bin_idx: usize) -> f32 {
    -PI + (TAU * (bin_idx as f32)) / (N_GROUND_BINS as f32)
}

#[inline]
pub fn funnel_ring_time(ring_idx: usize) -> f32 {
    0.06 + (2.94 * (ring_idx as f32)) / ((FUNNEL_RINGS - 1) as f32)
}

#[inline]
pub fn funnel_sector_phi(sector_idx: usize) -> f32 {
    (TAU * (sector_idx as f32)) / (FUNNEL_SECTORS as f32)
}

/// Precomputed unit sphere directions for Discrete 3D Bubbles (`(BUBBLE_LAT + 1) * BUBBLE_LON`)
/// and rib vertex indices (`3 * BUBBLE_LON * 2 + 4 * BUBBLE_LAT * 2 = 216`).
pub struct BubbleSphereTables {
    pub unit_dirs: [[f32; 3]; BUBBLE_VERTS_COUNT],
    pub rib_indices: [u16; 216],
}

impl BubbleSphereTables {
    pub fn generate() -> Self {
        let mut unit_dirs = [[0.0f32; 3]; BUBBLE_VERTS_COUNT];
        for i in 0..=BUBBLE_LAT {
            let theta = (PI * (i as f32)) / (BUBBLE_LAT as f32);
            let (st, ct) = theta.sin_cos();
            for j in 0..BUBBLE_LON {
                let phi = (TAU * (j as f32)) / (BUBBLE_LON as f32);
                let (sp, cp) = phi.sin_cos();
                let idx = i * BUBBLE_LON + j;
                unit_dirs[idx] = [st * cp, st * sp, ct];
            }
        }

        let mut rib_indices = [0u16; 216];
        let mut ptr = 0;
        for i in [3usize, 6, 9] {
            for j in 0..BUBBLE_LON {
                rib_indices[ptr] = (i * BUBBLE_LON + j) as u16;
                rib_indices[ptr + 1] = (i * BUBBLE_LON + ((j + 1) % BUBBLE_LON)) as u16;
                ptr += 2;
            }
        }
        let mut j = 0;
        while j < BUBBLE_LON {
            for i in 0..BUBBLE_LAT {
                rib_indices[ptr] = (i * BUBBLE_LON + j) as u16;
                rib_indices[ptr + 1] = ((i + 1) * BUBBLE_LON + j) as u16;
                ptr += 2;
            }
            j += 5;
        }

        Self {
            unit_dirs,
            rib_indices,
        }
    }
}

/// Clips RocketSim world coordinates `(x, y, z)` to the standard carball arena boundary
/// including 45-degree corner bevels (`|x| + |y| <= 8064 - margin`).
#[inline]
pub fn clip_arena_rocketsim_xyz(x: f32, y: f32, z: f32, margin: f32) -> (f32, f32, f32) {
    let x_lim = 4096.0 - margin;
    let y_lim = 5120.0 - margin;
    let z_min = 16.0;
    let z_max = 2044.0 - margin;

    let mut xc = x.clamp(-x_lim, x_lim);
    let mut yc = y.clamp(-y_lim, y_lim);
    let zc = z.clamp(z_min, z_max);

    let bevel_lim = 8064.0 - margin;
    let sum_abs = xc.abs() + yc.abs();
    if sum_abs > bevel_lim && sum_abs > 1e-5 {
        let scale = bevel_lim / sum_abs;
        xc *= scale;
        yc *= scale;
    }
    (xc, yc, zc)
}
