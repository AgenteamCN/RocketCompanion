//! Zero-Emscripten WebAssembly C-ABI exports (`_physics_*`, `_malloc`, `_free`) for RocketSim v3-rust.

pub mod exports;

use std::{
    alloc::{alloc, dealloc, Layout},
    cell::UnsafeCell,
    collections::HashMap,
    sync::Mutex,
};

use rc_audio_director::AudioDirectorInstance;
use rc_physics_sim::sim_instance::SimInstance;

struct GlobalSim(UnsafeCell<Option<SimInstance>>);
unsafe impl Sync for GlobalSim {}

struct GlobalAudioDirector(UnsafeCell<Option<AudioDirectorInstance>>);
unsafe impl Sync for GlobalAudioDirector {}

static SIM: GlobalSim = GlobalSim(UnsafeCell::new(None));
static AUDIO_DIRECTOR: GlobalAudioDirector = GlobalAudioDirector(UnsafeCell::new(None));
static ALLOCATIONS: Mutex<Option<HashMap<usize, Layout>>> = Mutex::new(None);

pub(crate) fn with_sim<R>(f: impl FnOnce(&mut SimInstance) -> R) -> R {
    unsafe {
        let slot = &mut *SIM.0.get();
        let inst = slot.get_or_insert_with(SimInstance::new);
        f(inst)
    }
}

pub(crate) fn with_audio<R>(f: impl FnOnce(&mut AudioDirectorInstance) -> R) -> R {
    unsafe {
        let slot = &mut *AUDIO_DIRECTOR.0.get();
        let inst = slot.get_or_insert_with(AudioDirectorInstance::new);
        f(inst)
    }
}

pub(crate) fn with_sim_and_audio<R>(
    f: impl FnOnce(&mut SimInstance, &mut AudioDirectorInstance) -> R,
) -> R {
    unsafe {
        let sim_slot = &mut *SIM.0.get();
        let sim_inst = sim_slot.get_or_insert_with(SimInstance::new);
        let audio_slot = &mut *AUDIO_DIRECTOR.0.get();
        let audio_inst = audio_slot.get_or_insert_with(AudioDirectorInstance::new);
        f(sim_inst, audio_inst)
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn _malloc(size: usize) -> usize {
    if size == 0 {
        return 0;
    }
    let Ok(layout) = Layout::from_size_align(size, 8) else {
        return 0;
    };
    let ptr = unsafe { alloc(layout) };
    if ptr.is_null() {
        return 0;
    }
    let addr = ptr as usize;
    let mut map_guard = ALLOCATIONS.lock().unwrap();
    map_guard.get_or_insert_with(HashMap::new).insert(addr, layout);
    addr
}

#[unsafe(no_mangle)]
pub extern "C" fn _free(ptr: usize) {
    if ptr == 0 {
        return;
    }
    let mut map_guard = ALLOCATIONS.lock().unwrap();
    if let Some(map) = map_guard.as_mut()
        && let Some(layout) = map.remove(&ptr)
    {
        unsafe { dealloc(ptr as *mut u8, layout) };
    }
}

pub use exports::*;
