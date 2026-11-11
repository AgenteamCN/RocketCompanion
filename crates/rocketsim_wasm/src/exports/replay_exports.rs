use std::cell::UnsafeCell;

use rc_physics_sim::{
    layout::{GameStateBufferPod, PhysicsEvent},
    replay::{ReplayFrameEntry, ReplayHeader},
};
use rc_replay_codec::{
    anomaly::diff_replay_frame_anomaly,
    codec_workspace::ReplayCodecWorkspace,
    seeker::seek_replay_time_into_buffers,
    types::{
        ReplayAnomalyDiffPod, ReplayBookmarkPod, ReplayRosterSlotPod, ReplayStreamHeaderPod,
    },
};

use crate::with_sim;

struct GlobalReplayCodec(UnsafeCell<Option<ReplayCodecWorkspace>>);
unsafe impl Sync for GlobalReplayCodec {}

static REPLAY_CODEC: GlobalReplayCodec = GlobalReplayCodec(UnsafeCell::new(None));

pub(crate) fn with_replay_codec<R>(f: impl FnOnce(&mut ReplayCodecWorkspace) -> R) -> R {
    unsafe {
        let slot = &mut *REPLAY_CODEC.0.get();
        let ws = slot.get_or_insert_with(ReplayCodecWorkspace::new);
        f(ws)
    }
}

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

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayCodecHeaderPtr() -> *const ReplayStreamHeaderPod {
    with_replay_codec(|ws| &ws.header as *const ReplayStreamHeaderPod)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_allocReplayImportBuffer(byte_len: i32) -> *mut u8 {
    if byte_len <= 0 {
        return core::ptr::null_mut();
    }
    with_replay_codec(|ws| ws.alloc_import_buffer(byte_len as usize))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_decodeImportedReplayStream(
    byte_len: i32,
    interpolation_mode: i32,
    synthesize_controls: i32,
) -> i32 {
    let _ = (interpolation_mode, synthesize_controls);
    if byte_len <= 0 {
        return 0;
    }
    with_sim(|sim| {
        with_replay_codec(|ws| ws.decode_imported_stream(byte_len as usize, &mut sim.replay))
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_encodeReplayExportStream(use_delta_transpose: i32) -> i32 {
    with_sim(|sim| {
        with_replay_codec(|ws| ws.encode_export_stream(&sim.replay, use_delta_transpose != 0) as i32)
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayExportBufferPtr() -> *const u8 {
    with_replay_codec(|ws| {
        if ws.export_buffer.is_empty() {
            core::ptr::null()
        } else {
            ws.export_buffer.as_ptr()
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayExportBufferSize() -> i32 {
    with_replay_codec(|ws| ws.export_buffer.len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayRosterPtr() -> *const ReplayRosterSlotPod {
    with_replay_codec(|ws| ws.roster.as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayBookmarkTrackPtr() -> *const ReplayBookmarkPod {
    with_replay_codec(|ws| {
        if ws.bookmarks.is_empty() {
            core::ptr::null()
        } else {
            ws.bookmarks.as_ptr()
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayBookmarkCount() -> i32 {
    with_replay_codec(|ws| ws.bookmarks.len() as i32)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_seekReplayTime(time_sec: f32, interpolate_mode: i32) -> i32 {
    let tick_rate = with_replay_codec(|ws| ws.header.tick_rate_hz);
    with_sim(|sim| {
        seek_replay_time_into_buffers(
            &sim.replay.state_track,
            tick_rate,
            time_sec,
            interpolate_mode,
            &mut sim.state_buffer,
            &mut sim.controls_buffer,
        )
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_diffReplayFrameAnomaly(
    frame_index: i32,
    pos_threshold_uu: f32,
) -> i32 {
    if frame_index < 0 {
        return -1;
    }
    with_sim(|sim| {
        with_replay_codec(|ws| {
            diff_replay_frame_anomaly(
                &sim.replay.state_track,
                frame_index as usize,
                &sim.state_buffer,
                pos_threshold_uu,
                &mut ws.anomaly_diff,
            )
        })
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getReplayAnomalyDiffPtr() -> *const ReplayAnomalyDiffPod {
    with_replay_codec(|ws| &ws.anomaly_diff as *const ReplayAnomalyDiffPod)
}

