//! C-ABI exports for `rc_audio_director`: zero-copy `AudioFrameCuePod`, `AudioDirectorConfigPod`,
//! `AudioListenerStatePod`, and per-frame `_physics_stepAudioDirector`.

use rc_audio_director::{AudioDirectorConfigPod, AudioFrameCuePod, AudioListenerStatePod};

use crate::{with_audio, with_sim_and_audio};

#[unsafe(no_mangle)]
pub extern "C" fn _physics_stepAudioDirector(dt_sec: f32) -> *const AudioFrameCuePod {
    with_sim_and_audio(|sim, audio| audio.step_frame(sim, dt_sec))
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAudioCuePtr() -> *const AudioFrameCuePod {
    with_audio(|audio| &audio.cue_pod as *const AudioFrameCuePod)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAudioCueSize() -> i32 {
    core::mem::size_of::<AudioFrameCuePod>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAudioConfigPtr() -> *mut AudioDirectorConfigPod {
    with_audio(|audio| &mut audio.config_pod as *mut AudioDirectorConfigPod)
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAudioConfigSize() -> i32 {
    core::mem::size_of::<AudioDirectorConfigPod>() as i32
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_getAudioListenerPtr() -> *mut AudioListenerStatePod {
    with_audio(|audio| &mut audio.listener_pod as *mut AudioListenerStatePod)
}

#[unsafe(no_mangle)]
#[allow(clippy::too_many_arguments)]
pub extern "C" fn _physics_setAudioListenerState(
    pos_x: f32,
    pos_y: f32,
    pos_z: f32,
    fwd_x: f32,
    fwd_y: f32,
    fwd_z: f32,
    up_x: f32,
    up_y: f32,
    up_z: f32,
    active_car_index: i32,
    effective_num_cars: i32,
    flags: i32,
) {
    with_audio(|audio| {
        audio.set_listener_state(
            pos_x,
            pos_y,
            pos_z,
            fwd_x,
            fwd_y,
            fwd_z,
            up_x,
            up_y,
            up_z,
            active_car_index,
            effective_num_cars,
            flags as u32,
        );
    });
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_resetAudioDirector(active_car_index: i32) {
    with_audio(|audio| audio.reset(active_car_index));
}

#[unsafe(no_mangle)]
pub extern "C" fn _physics_triggerAudioCarAction(car_index: i32, action_code: i32) {
    with_audio(|audio| audio.trigger_car_action(car_index, action_code));
}
