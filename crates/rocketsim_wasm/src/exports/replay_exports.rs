use rc_physics_sim::{
    layout::{GameStateBufferPod, PhysicsEvent},
    replay::{ReplayFrameEntry, ReplayHeader},
};

use crate::with_sim;

#[unsafe(no_mangle)]
pub extern "C" fn _physics_initReplayBuffer() {
    with_sim(|sim| sim.replay.init());
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_clearReplayBuffer() {
    with_sim(|sim| sim.replay.clear());
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayBufferPtr() -> *const ReplayHeader {
    with_sim(|sim| &sim.replay.header as *const ReplayHeader)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayBufferSize() -> i32 {
    core::mem::size_of::<ReplayHeader>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_recordReplayFrame() {
    with_sim(|sim| {
        let st = sim.state_buffer;
        let ctrl = sim.controls_buffer;
        sim.replay.record_frame(&st, &ctrl);
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayFrameCount() -> i32 {
    with_sim(|sim| sim.replay.state_track.len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayFramePtrByOffset(ticks_ago: i32) -> *const f32 {
    with_sim(|sim| {
        let len = sim.replay.state_track.len();
        if len == 0 || ticks_ago < 0 {
            return core::ptr::null();
        }
        let idx = len.saturating_sub(1 + ticks_ago as usize);
        (&sim.replay.state_track[idx].state as *const GameStateBufferPod) as *const f32
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayFramePtrByIndex(frame_index: i32) -> *const f32 {
    with_sim(|sim| {
        let idx = frame_index as usize;
        if idx >= sim.replay.state_track.len() {
            return core::ptr::null();
        }
        (&sim.replay.state_track[idx].state as *const GameStateBufferPod) as *const f32
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayControlsPtrByIndex(frame_index: i32) -> *const u8 {
    with_sim(|sim| {
        let idx = frame_index as usize;
        if idx >= sim.replay.state_track.len() {
            return core::ptr::null();
        }
        sim.replay.state_track[idx].packed_controls.as_ptr()
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayStateTrackPtr() -> *const ReplayFrameEntry {
    with_sim(|sim| sim.replay.state_track.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayStateStride() -> i32 {
    core::mem::size_of::<ReplayFrameEntry>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayIncidentTrackPtr() -> *const PhysicsEvent {
    with_sim(|sim| sim.replay.incident_track.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayIncidentCount() -> i32 {
    with_sim(|sim| sim.replay.incident_track.len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplaySignalTrackPtr() -> *const PhysicsEvent {
    with_sim(|sim| sim.replay.signal_track.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplaySignalCount() -> i32 {
    with_sim(|sim| sim.replay.signal_track.len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_setReplayRecordingActive(active: i32) {
    with_sim(|sim| sim.replay.header.recording_active = u32::from(active != 0));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayRecordingActive() -> i32 {
    with_sim(|sim| i32::from(sim.replay.header.recording_active != 0))
}
