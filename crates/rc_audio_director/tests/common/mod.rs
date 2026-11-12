//! Shared bootstrap for the audio scenario suite: real RocketSim arena, ball/car spawn helpers,
//! frame stepping and cue-pod accounting. Every new audio scenario is added next to the existing
//! ones in `audio_scenarios.rs` so regressions stay reproducible without launching the game.

use std::path::{Path, PathBuf};

use glam::Vec3A;
use rc_audio_director::{AudioDirectorInstance, AudioFrameCuePod};
use rc_physics_sim::sim_instance::SimInstance;
use rocketsim::BallState;

pub const TICKS_PER_FRAME: i32 = 2;
pub const FRAME_DT_SEC: f32 = 1.0 / 60.0;
pub const BALL_REST_Z: f32 = 93.15;

pub const MESH_FILES: [&str; 16] = [
    "mesh_0.cmf",
    "mesh_1.cmf",
    "mesh_2.cmf",
    "mesh_3.cmf",
    "mesh_4.cmf",
    "mesh_5.cmf",
    "mesh_6.cmf",
    "mesh_7.cmf",
    "mesh_8.cmf",
    "mesh_9.cmf",
    "mesh_10.cmf",
    "mesh_11.cmf",
    "mesh_12.cmf",
    "mesh_13.cmf",
    "mesh_14.cmf",
    "mesh_15.cmf",
];

fn repo_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .canonicalize()
        .unwrap_or_else(|_| PathBuf::from("."))
}

/// Resolves the arena collision meshes: `RC_ARENA_MESH_DIR` first, then the `public` submodule.
pub fn arena_mesh_dir() -> Option<PathBuf> {
    if let Ok(dir) = std::env::var("RC_ARENA_MESH_DIR") {
        let path = PathBuf::from(dir);
        if path.join(MESH_FILES[0]).exists() {
            return Some(path);
        }
    }
    let submodule_dir = repo_root().join("public").join("arenamesh");
    if submodule_dir.join(MESH_FILES[0]).exists() {
        return Some(submodule_dir);
    }
    None
}

/// Initializes the RocketSim collision meshes once per process.
/// Returns `false` when the arena assets are unavailable so callers can skip explicitly.
pub fn init_physics() -> bool {
    let Some(dir) = arena_mesh_dir() else {
        return false;
    };
    let mut chunks: Vec<Vec<u8>> = Vec::with_capacity(MESH_FILES.len());
    for name in MESH_FILES {
        let Ok(bytes) = std::fs::read(dir.join(name)) else {
            return false;
        };
        chunks.push(bytes);
    }
    let slices: Vec<&[u8]> = chunks.iter().map(|chunk| chunk.as_slice()).collect();
    rocketsim::init_or_reload_soccar_from_slices(&slices).is_ok()
}

pub fn require_physics() -> bool {
    if init_physics() {
        return true;
    }
    let message = "arena collision meshes unavailable; set RC_ARENA_MESH_DIR or init the public submodule";
    if std::env::var("RC_STRICT_AUDIO_SCENARIOS").as_deref() == Ok("1") {
        panic!("{message}");
    }
    eprintln!("[audio-scenarios] skipped: {message}");
    false
}

pub fn new_sim() -> SimInstance {
    let mut sim = SimInstance::new();
    sim.create_arena();
    sim
}

pub fn spawn_rolling_ball(sim: &mut SimInstance, pos: Vec3A, velocity: Vec3A) {
    let arena = sim.arena.as_mut().expect("arena");
    let mut ball: BallState = *arena.get_ball_state();
    ball.phys.pos = pos;
    ball.phys.vel = velocity;
    ball.phys.ang_vel = Vec3A::new(-velocity.y / BALL_REST_Z, velocity.x / BALL_REST_Z, 0.0);
    arena.set_ball_state(ball);
}

pub fn ball_state(sim: &SimInstance) -> (Vec3A, Vec3A) {
    let ball = &sim.state_buffer.ball;
    (
        Vec3A::from_array(ball.pos),
        Vec3A::from_array(ball.vel),
    )
}

pub fn listener_default(dir: &mut AudioDirectorInstance) {
    dir.set_listener_state(
        0.0, -1500.0, 300.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 0, 1, 0x07,
    );
}

#[derive(Default, Clone, Copy)]
pub struct CueTrace {
    pub frames: u32,
    pub world_events: u32,
    pub floor_impact_cues: u32,
    pub wall_impact_cues: u32,
    pub goalpost_cues: u32,
    pub car_ball_cues: u32,
    pub rolling_gain_sum: f32,
    pub rolling_gain_max: f32,
    pub flying_gain_max: f32,
    pub rolling_rate_min: f32,
    pub rolling_rate_max: f32,
    pub peak_impact_gain: f32,
}

impl CueTrace {
    pub fn average_rolling_gain(&self) -> f32 {
        if self.frames == 0 {
            0.0
        } else {
            self.rolling_gain_sum / self.frames as f32
        }
    }
}

pub fn step_frame(sim: &mut SimInstance, dir: &mut AudioDirectorInstance, trace: &mut CueTrace) -> AudioFrameCuePod {
    let seq_before = sim.event_buffer.write_seq;
    sim.step(TICKS_PER_FRAME, false);
    trace.world_events += sim.event_buffer.write_seq.saturating_sub(seq_before);
    let cue = unsafe { *dir.step_frame(sim, FRAME_DT_SEC) };
    account_cue(&cue, trace);
    cue
}

fn account_cue(cue: &AudioFrameCuePod, trace: &mut CueTrace) {
    trace.frames += 1;
    trace.rolling_gain_sum += cue.ball.rolling_gain;
    trace.rolling_gain_max = trace.rolling_gain_max.max(cue.ball.rolling_gain);
    trace.flying_gain_max = trace.flying_gain_max.max(cue.ball.flying_gain);
    if cue.ball.rolling_gain > 0.0 {
        trace.rolling_rate_min = if trace.rolling_rate_min == 0.0 {
            cue.ball.rolling_rate
        } else {
            trace.rolling_rate_min.min(cue.ball.rolling_rate)
        };
        trace.rolling_rate_max = trace.rolling_rate_max.max(cue.ball.rolling_rate);
    }
    for index in 0..cue.one_shot_count as usize {
        let slot = &cue.one_shots[index];
        trace.peak_impact_gain = trace.peak_impact_gain.max(slot.final_gain);
        match slot.event_type {
            0x01 => trace.car_ball_cues += 1,
            0x05 => trace.goalpost_cues += 1,
            0x04 => {
                if slot.sub_type == 1 {
                    trace.floor_impact_cues += 1;
                } else {
                    trace.wall_impact_cues += 1;
                }
            }
            _ => {}
        }
    }
}

pub fn run_frames(
    sim: &mut SimInstance,
    dir: &mut AudioDirectorInstance,
    frames: u32,
) -> CueTrace {
    let mut trace = CueTrace::default();
    for _ in 0..frames {
        step_frame(sim, dir, &mut trace);
    }
    trace
}
