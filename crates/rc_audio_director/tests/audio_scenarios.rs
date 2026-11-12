//! Audio scenario regression suite.
//!
//! Each scenario replays one real gameplay situation through the physics + `rc_audio_director`
//! pair and asserts on the resulting cue pod. New scenarios are appended here so every audio bug
//! we encounter stays reproducible without launching the client.
//!
//! Run directly: `cargo test -p rc_audio_director --test audio_scenarios -- --nocapture`
//! (add `RUSTC_BOOTSTRAP=1 RUSTFLAGS=-Zcrate-attr=feature(cold_path)` on stable toolchains).

mod common;

use common::*;
use glam::Vec3A;
use rc_audio_director::AudioDirectorInstance;
use rc_physics_sim::{layout::CarControlsPod, sim_instance::SimInstance};

fn report(name: &str, trace: &CueTrace, extra: &str) {
    println!(
        "[{name}] frames={} events={} floor_cues={} wall_cues={} rolling_avg={:.3} rolling_max={:.3} rate=[{:.3},{:.3}] {extra}",
        trace.frames,
        trace.world_events,
        trace.floor_impact_cues,
        trace.wall_impact_cues,
        trace.average_rolling_gain(),
        trace.rolling_gain_max,
        trace.rolling_rate_min,
        trace.rolling_rate_max,
    );
}

fn set_throttle(sim: &mut SimInstance, slot: usize, throttle: f32) {
    sim.controls_buffer[slot] = CarControlsPod {
        throttle,
        ..CarControlsPod::default()
    };
}

#[test]
fn rolling_ball_keeps_contact_quiet() {
    if !require_physics() {
        return;
    }
    for speed in [600.0_f32, 1200.0, 2000.0] {
        let mut sim = new_sim();
        spawn_rolling_ball(
            &mut sim,
            Vec3A::new(0.0, -2500.0, BALL_REST_Z + 1.0),
            Vec3A::new(0.0, speed, 0.0),
        );
        let mut dir = AudioDirectorInstance::new();
        listener_default(&mut dir);
        let trace = run_frames(&mut sim, &mut dir, 120);
        let (_, velocity) = ball_state(&sim);
        report(
            &format!("rolling@{speed:.0}"),
            &trace,
            &format!("end_speed={:.1}", velocity.length()),
        );
        assert_eq!(
            trace.world_events, 0,
            "sustained rolling contact must not emit world-hit events at {speed} uu/s"
        );
        assert_eq!(
            trace.floor_impact_cues, 0,
            "sustained rolling contact must not retrigger floor impacts at {speed} uu/s"
        );
        assert!(
            trace.average_rolling_gain() > 0.05,
            "rolling loop must stay audible while the ball rolls at {speed} uu/s"
        );
    }
}

#[test]
fn ball_drop_emits_single_floor_impact() {
    if !require_physics() {
        return;
    }
    let mut sim = new_sim();
    spawn_rolling_ball(
        &mut sim,
        Vec3A::new(0.0, -2500.0, 1400.0),
        Vec3A::new(0.0, 0.0, 0.0),
    );
    let mut dir = AudioDirectorInstance::new();
    listener_default(&mut dir);
    let trace = run_frames(&mut sim, &mut dir, 180);
    report("drop", &trace, "");
    assert_eq!(
        trace.floor_impact_cues, 1,
        "a clean drop must produce exactly one floor impact cue"
    );
    assert!(
        trace.peak_impact_gain > 0.3,
        "landing impact must be loud, got {:.3}",
        trace.peak_impact_gain
    );
}

#[test]
fn wall_bounce_emits_one_shot() {
    if !require_physics() {
        return;
    }
    let mut sim = new_sim();
    spawn_rolling_ball(
        &mut sim,
        Vec3A::new(2600.0, -3000.0, 700.0),
        Vec3A::new(1800.0, 0.0, 0.0),
    );
    let mut dir = AudioDirectorInstance::new();
    listener_default(&mut dir);
    let trace = run_frames(&mut sim, &mut dir, 80);
    report("wall", &trace, "");
    assert_eq!(
        trace.wall_impact_cues, 1,
        "wall bounce must emit exactly one wall impact cue"
    );
}

#[test]
fn engine_ignites_and_idles() {
    if !require_physics() {
        return;
    }
    let mut sim = new_sim();
    sim.add_car_at_slot(0, 0, 0);
    let mut dir = AudioDirectorInstance::new();
    dir.set_listener_state(0.0, 0.0, 300.0, 0.0, 0.0, -1.0, 0.0, 1.0, 0.0, 0, 1, 0x07);

    let mut trace = CueTrace::default();
    for _ in 0..30 {
        step_frame(&mut sim, &mut dir, &mut trace);
    }
    let mut cue = unsafe { *dir.step_frame(&sim, FRAME_DT_SEC) };
    let idle_rpm = cue.cars[0].engine_rpm;
    assert!(
        cue.cars[0].engine_gain > 0.0,
        "idle engine must be audible, gain={:.3}",
        cue.cars[0].engine_gain
    );
    assert!(idle_rpm > 0.0, "idle engine must report rpm");

    set_throttle(&mut sim, 0, 1.0);
    for _ in 0..90 {
        cue = step_frame(&mut sim, &mut dir, &mut trace);
    }
    let full_rpm = cue.cars[0].engine_rpm;
    report(
        "engine",
        &trace,
        &format!("idle_rpm={idle_rpm:.0} revved_rpm={full_rpm:.0}"),
    );
    assert!(
        full_rpm > idle_rpm + 800.0,
        "throttle must raise rpm ({idle_rpm:.0} -> {full_rpm:.0})"
    );
    assert!(
        cue.cars[0].engine_pitch > 1.0,
        "engine pitch must rise with rpm, got {:.3}",
        cue.cars[0].engine_pitch
    );
    assert!(
        cue.cars[0].filter_cutoff_hz > 1200.0,
        "throttle must open the engine filter, got {:.0} Hz",
        cue.cars[0].filter_cutoff_hz
    );

    set_throttle(&mut sim, 0, 0.0);
    for _ in 0..150 {
        cue = step_frame(&mut sim, &mut dir, &mut trace);
    }
    assert!(
        cue.cars[0].engine_rpm < full_rpm - 400.0,
        "rpm must decay after throttle release, got {:.0}",
        cue.cars[0].engine_rpm
    );
}
