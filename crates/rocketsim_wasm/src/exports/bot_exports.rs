//! C-ABI exports for `rc_bot_ai` (`_physics_loadBotWeights`, `_physics_stepBotInferenceMask`, etc.).

use rc_bot_ai::{BotBatchInferenceOutputPod, BotDirector, KickoffTimelineBufferPod};

use crate::{with_bot, with_sim_and_bot};

/// Injects SafeTensors model weights (`F32` or `F16`) for a given `BotPolicyId`.
/// Returns the number of parsed tensors on success, or a negative error code on failure.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_loadBotWeights(
    policy_id: i32,
    data_ptr: *const u8,
    byte_len: i32,
) -> i32 {
    if byte_len <= 0 {
        return -1;
    }
    with_bot(|bot| bot.load_bot_weights(policy_id, data_ptr, byte_len as usize))
}

/// Returns `1` if the specified `BotPolicyId` has weights ready (or is `Heuristic`), else `0`.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_isBotPolicyLoaded(policy_id: i32) -> i32 {
    with_bot(|bot| bot.is_bot_policy_loaded(policy_id))
}

/// Configures a car slot (`0..7`) with its assigned `BotPolicyId`, `team` (`0` = Blue, `1` = Orange),
/// and `tick_skip` (`<= 0` uses the policy's default tick skip).
#[unsafe(no_mangle)]
pub extern "C" fn _physics_configureBotSlot(
    car_index: i32,
    policy_id: i32,
    team: i32,
    tick_skip: i32,
) -> i32 {
    if car_index < 0 {
        return -1;
    }
    with_bot(|bot| bot.configure_bot_slot(car_index as usize, policy_id, team, tick_skip))
}

/// Resets per-car bot inference state (tick-skip counters, previous actions, kickoff timers)
/// for all cars selected in `car_mask` (`0` resets all 8 slots).
#[unsafe(no_mangle)]
pub extern "C" fn _physics_resetBotDirector(car_mask: i32) {
    with_bot(|bot| bot.reset_bot_director(car_mask as u32));
}

/// Overrides the cached `prev_action` and output controls for a specific car slot (`8` floats).
#[unsafe(no_mangle)]
pub extern "C" fn _physics_overrideBotControls(car_index: i32, controls_ptr: *const f32) -> i32 {
    if car_index < 0 {
        return -1;
    }
    with_bot(|bot| bot.override_bot_controls(car_index as usize, controls_ptr))
}

/// Executes multi-car observation building + policy inference for all active bot slots in `active_bot_mask`,
/// writes the resulting `CarControlsPod` directly into `SimInstance.controls_buffer`, and returns
/// a pointer to `BotBatchInferenceOutputPod`.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_stepBotInferenceMask(
    active_bot_mask: i32,
    is_kickoff: i32,
) -> *const BotBatchInferenceOutputPod {
    with_sim_and_bot(|sim, bot| {
        bot.step_bot_inference_mask(sim, active_bot_mask as u32, is_kickoff)
    })
}

/// Returns a stable pointer to the `BotBatchInferenceOutputPod` linear memory block.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBotBatchOutputPtr() -> *const BotBatchInferenceOutputPod {
    with_bot(|bot| bot.get_batch_output_ptr())
}

/// Returns `sizeof(BotBatchInferenceOutputPod)` in bytes for TypeScript layout assertions.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBotBatchOutputSize() -> i32 {
    core::mem::size_of::<BotBatchInferenceOutputPod>() as i32
}

/// Precomputes a kickoff control timeline into `KickoffTimelineBufferPod` and returns its pointer.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_precomputeBotKickoffTimeline(
    policy_id: i32,
    spawn_index: i32,
    max_steps: i32,
) -> *const KickoffTimelineBufferPod {
    with_sim_and_bot(|sim, bot| {
        bot.precompute_kickoff_timeline(sim, policy_id, spawn_index, max_steps)
    })
}

/// Returns a stable pointer to the `KickoffTimelineBufferPod` linear memory block.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_getBotKickoffTimelinePtr() -> *const KickoffTimelineBufferPod {
    with_bot(|bot| bot.get_kickoff_timeline_ptr())
}

/// Native WASM SIMD128 `out = W * x + b` linear layer helper replacing `src/ai/experimental/simdMatVec.wasm`.
#[unsafe(no_mangle)]
pub extern "C" fn _physics_botSimdMatVecBias(
    w_ptr: *const f32,
    x_ptr: *const f32,
    b_ptr: *const f32,
    out_ptr: *mut f32,
    in_dim: i32,
    out_dim: i32,
) {
    if in_dim <= 0 || out_dim <= 0 {
        return;
    }
    BotDirector::simd_mat_vec_bias_raw(
        w_ptr,
        x_ptr,
        b_ptr,
        out_ptr,
        in_dim as usize,
        out_dim as usize,
    );
}
