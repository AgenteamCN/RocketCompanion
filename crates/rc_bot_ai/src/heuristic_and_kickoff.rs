//! Role-aware multi-car tactical heuristic policy and Nexto speed-flip scripted kickoff controller.

use rc_physics_sim::layout::{CarControlsPod, GameStateBufferPod, MAX_CARS, MAX_PADS};

/// Returns `true` if `state.ball` is stationary near the center kickoff spot `(0, 0)`.
#[inline]
pub fn is_ball_at_kickoff_center(state: &GameStateBufferPod) -> bool {
    let ball_speed_sq = state.ball.vel[0] * state.ball.vel[0]
        + state.ball.vel[1] * state.ball.vel[1]
        + state.ball.vel[2] * state.ball.vel[2];
    let ball_dist_from_origin_sq =
        state.ball.pos[0] * state.ball.pos[0] + state.ball.pos[1] * state.ball.pos[1];
    ball_speed_sq <= 100.0 && ball_dist_from_origin_sq <= 2500.0
}

/// Returns `true` if `car_index` is the closest non-demoed active car on `team` to the ball.
/// Prevents multiple Nexto teammates from all executing the scripted kickoff simultaneously.
pub fn is_primary_kickoff_car(
    state: &GameStateBufferPod,
    car_index: usize,
    team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> bool {
    if car_index >= MAX_CARS {
        return false;
    }
    let self_car = &state.cars[car_index];
    if self_car.is_demoed > 0.5 {
        return false;
    }
    let self_dx = state.ball.pos[0] - self_car.pos[0];
    let self_dy = state.ball.pos[1] - self_car.pos[1];
    let self_dist_sq = self_dx * self_dx + self_dy * self_dy;

    let num_cars = (state.header.num_cars.max(0.0) as usize).min(MAX_CARS);
    let loop_bound = num_cars.max(MAX_CARS);
    for idx in 0..loop_bound {
        if idx == car_index || (active_car_mask & (1u32 << idx)) == 0 {
            continue;
        }
        if slot_teams[idx] != team || state.cars[idx].is_demoed > 0.5 {
            continue;
        }
        let c = &state.cars[idx];
        let dx = state.ball.pos[0] - c.pos[0];
        let dy = state.ball.pos[1] - c.pos[1];
        let d_sq = dx * dx + dy * dy;
        if d_sq + 1.0 < self_dist_sq || ((d_sq - self_dist_sq).abs() <= 1.0 && idx < car_index) {
            return false;
        }
    }
    true
}

/// Nexto speed-flip scripted kickoff controller operating directly on `GameStateBufferPod`.
/// Returns `Some(CarControlsPod)` while the scripted sequence is active, or `None` once handed off to neural policy.
pub fn nexto_scripted_kickoff_controls(
    state: &GameStateBufferPod,
    car_index: usize,
    team: u32,
    kickoff_step: u32,
) -> Option<CarControlsPod> {
    if car_index >= MAX_CARS {
        return None;
    }
    if !is_ball_at_kickoff_center(state) || kickoff_step > 65 {
        return None;
    }

    let car = &state.cars[car_index];
    let sign = if team == 1 { -1.0f32 } else { 1.0f32 };
    let local_x = car.pos[0] * sign;
    let dx = state.ball.pos[0] - car.pos[0];
    let dy = state.ball.pos[1] - car.pos[1];
    let dist_to_ball = (dx * dx + dy * dy).sqrt();
    if dist_to_ball < 380.0 {
        return None;
    }

    let forward_len = (car.forward[0] * car.forward[0] + car.forward[1] * car.forward[1])
        .sqrt()
        .max(1e-6);
    let fx = car.forward[0] / forward_len;
    let fy = car.forward[1] / forward_len;
    let rx = -fy;
    let ry = fx;

    let to_ball_len = dist_to_ball.max(1e-6);
    let bx = dx / to_ball_len;
    let by = dy / to_ball_len;
    let steer_err = bx * rx + by * ry;
    let steer = (steer_err * 3.2).clamp(-1.0, 1.0);
    let diagonal_sign = if local_x >= 0.0 { -1.0f32 } else { 1.0f32 };

    let mut ctrl = CarControlsPod {
        throttle: 1.0,
        steer,
        pitch: 0.0,
        yaw: 0.0,
        roll: 0.0,
        jump: 0.0,
        boost: 1.0,
        handbrake: 0.0,
    };

    if (8..=10).contains(&kickoff_step) {
        ctrl.jump = 1.0;
        ctrl.yaw = -diagonal_sign * 0.35;
    } else if kickoff_step == 11 {
        ctrl.jump = 0.0;
        ctrl.pitch = -1.0;
        ctrl.roll = diagonal_sign;
    } else if (12..=14).contains(&kickoff_step) {
        ctrl.jump = 1.0;
        ctrl.pitch = -1.0;
        ctrl.roll = diagonal_sign;
    } else if (15..=28).contains(&kickoff_step) {
        ctrl.pitch = 1.0;
        ctrl.roll = diagonal_sign * 0.85;
        ctrl.yaw = -diagonal_sign * 0.4;
    }

    Some(ctrl)
}

/// Role-aware multi-car tactical heuristic decision function (striker / support / defender).
pub fn multi_car_heuristic_decide(
    state: &GameStateBufferPod,
    self_car_index: usize,
    self_team: u32,
    active_car_mask: u32,
    slot_teams: &[u32; MAX_CARS],
) -> CarControlsPod {
    if self_car_index >= MAX_CARS {
        return CarControlsPod::default();
    }
    let self_car = &state.cars[self_car_index];
    if self_car.is_demoed > 0.5 {
        return CarControlsPod::default();
    }

    // Wall / ceiling recovery guard: steer back toward arena floor center if tilted on high wall/ceiling.
    let on_wall_or_ceiling = (self_car.up[2] < 0.72
        && (self_car.pos[0].abs() > 3750.0
            || self_car.pos[1].abs() > 4850.0
            || self_car.pos[2] > 250.0))
        || self_car.pos[2] > 1100.0;
    if on_wall_or_ceiling {
        let to_center_x = -self_car.pos[0];
        let to_center_y = -self_car.pos[1];
        let local_x = to_center_x * self_car.forward[0] + to_center_y * self_car.forward[1];
        let local_y = to_center_x * self_car.right[0] + to_center_y * self_car.right[1];
        let angle = local_y.atan2(local_x);
        let airborne = self_car.is_on_ground <= 0.5;
        return CarControlsPod {
            throttle: 1.0,
            steer: (angle * 2.2).clamp(-1.0, 1.0),
            pitch: if airborne {
                (-self_car.forward[2] * 2.0).clamp(-1.0, 1.0)
            } else {
                0.0
            },
            yaw: 0.0,
            roll: if airborne {
                (self_car.right[2] * 2.5).clamp(-1.0, 1.0)
            } else {
                0.0
            },
            jump: 0.0,
            boost: 0.0,
            handbrake: 0.0,
        };
    }

    let attack_dir_y = if self_team == 0 { 1.0f32 } else { -1.0f32 };
    let own_goal_y = -attack_dir_y * 5120.0;
    let enemy_goal_y = attack_dir_y * 5120.0;

    let ball_pred_x = (state.ball.pos[0] + state.ball.vel[0] * 0.35).clamp(-3900.0, 3900.0);
    let ball_pred_y = (state.ball.pos[1] + state.ball.vel[1] * 0.35).clamp(-5050.0, 5050.0);

    let self_dist_sq = (self_car.pos[0] - ball_pred_x).powi(2)
        + (self_car.pos[1] - ball_pred_y).powi(2)
        + (self_car.pos[2] - state.ball.pos[2]).powi(2);

    // Count how many active teammates are closer to the predicted ball position.
    let mut rank_among_teammates = 0u32;
    let num_cars = (state.header.num_cars.max(0.0) as usize).min(MAX_CARS);
    let loop_bound = num_cars.max(MAX_CARS);
    for idx in 0..loop_bound {
        if idx == self_car_index || (active_car_mask & (1u32 << idx)) == 0 {
            continue;
        }
        if slot_teams[idx] != self_team || state.cars[idx].is_demoed > 0.5 {
            continue;
        }
        let c = &state.cars[idx];
        let d_sq = (c.pos[0] - ball_pred_x).powi(2)
            + (c.pos[1] - ball_pred_y).powi(2)
            + (c.pos[2] - state.ball.pos[2]).powi(2);
        if d_sq + 1.0 < self_dist_sq || ((d_sq - self_dist_sq).abs() <= 1.0 && idx < self_car_index)
        {
            rank_among_teammates += 1;
        }
    }

    let to_goal_dx = 0.0 - ball_pred_x;
    let to_goal_dy = enemy_goal_y - ball_pred_y;
    let to_goal_len = (to_goal_dx * to_goal_dx + to_goal_dy * to_goal_dy)
        .sqrt()
        .max(1e-5);
    let strike_offset = 140.0f32;
    let is_behind_ball = (state.ball.pos[1] - self_car.pos[1]) * attack_dir_y > -120.0;

    let (target_x, target_y, desired_speed) = match rank_among_teammates {
        0 => {
            if is_behind_ball {
                (
                    ball_pred_x - (to_goal_dx / to_goal_len) * strike_offset,
                    ball_pred_y - (to_goal_dy / to_goal_len) * strike_offset,
                    2300.0f32,
                )
            } else {
                // Shadow-rotate laterally around the ball to avoid own-goaling.
                let side_sign = if self_car.pos[0] >= ball_pred_x {
                    1.0f32
                } else {
                    -1.0f32
                };
                (
                    (ball_pred_x + side_sign * 420.0).clamp(-3400.0, 3400.0),
                    (ball_pred_y - attack_dir_y * 380.0).clamp(-4850.0, 4850.0),
                    1950.0f32,
                )
            }
        }
        1 => (
            (ball_pred_x * 0.45).clamp(-2400.0, 2400.0),
            (ball_pred_y - attack_dir_y * 1450.0).clamp(-4600.0, 4600.0),
            1650.0f32,
        ),
        _ => (
            (ball_pred_x * 0.25).clamp(-1200.0, 1200.0),
            (own_goal_y * 0.65 + ball_pred_y * 0.35).clamp(-4850.0, 4850.0),
            1400.0f32,
        ),
    };

    let dx = target_x - self_car.pos[0];
    let dy = target_y - self_car.pos[1];
    let dist_2d = (dx * dx + dy * dy).sqrt().max(1e-5);

    let local_x = dx * self_car.forward[0] + dy * self_car.forward[1];
    let local_y = dx * self_car.right[0] + dy * self_car.right[1];
    let heading_angle = local_y.atan2(local_x);

    let raw_steer = (heading_angle * 2.6).clamp(-1.0, 1.0);
    let handbrake =
        if self_car.is_on_ground > 0.5 && heading_angle.abs() > 1.35 && dist_2d > 420.0 {
            1.0
        } else {
            0.0
        };

    let speed_2d = (self_car.vel[0] * self_car.vel[0] + self_car.vel[1] * self_car.vel[1]).sqrt();
    let throttle = if dist_2d < 160.0 && rank_among_teammates > 0 {
        ((dist_2d - 80.0) / 80.0).clamp(-0.5, 1.0)
    } else {
        1.0
    };
    let steer = if throttle < 0.0 { -raw_steer } else { raw_steer };

    let boost = if self_car.is_on_ground > 0.5
        && heading_angle.abs() < 0.32
        && speed_2d < desired_speed
        && self_car.boost > 8.0
        && handbrake < 0.5
    {
        1.0
    } else {
        0.0
    };

    let ball_dist_2d = ((state.ball.pos[0] - self_car.pos[0]).powi(2)
        + (state.ball.pos[1] - self_car.pos[1]).powi(2))
    .sqrt();
    let jump = if rank_among_teammates == 0
        && is_behind_ball
        && self_car.is_on_ground > 0.5
        && ball_dist_2d < 260.0
        && state.ball.pos[2] > 115.0
        && state.ball.pos[2] < 290.0
        && heading_angle.abs() < 0.35
    {
        1.0
    } else {
        0.0
    };

    let _ = MAX_PADS;
    CarControlsPod {
        throttle,
        steer,
        pitch: if jump > 0.5 { -1.0 } else { 0.0 },
        yaw: 0.0,
        roll: 0.0,
        jump,
        boost,
        handbrake,
    }
}

