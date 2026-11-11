//! Multi-track WASM replay buffer matching `ballPredictionPipeline.ts` and `RocketSimWasmStateAndReplayBase.ts`.

use crate::layout::{CarControlsPod, GameStateBufferPod, PhysicsEvent, MAX_CARS};

pub const REPLAY_MAX_FRAMES: usize = 36000;
pub const REPLAY_MAX_INCIDENTS: usize = 4096;
pub const REPLAY_MAX_SIGNALS: usize = 4096;

#[repr(C)]
#[derive(Clone, Copy, Default)]
pub struct ReplayHeader {
    pub magic: u32,
    pub version: u32,
    pub frame_count: u32,
    pub state_stride: u32,
    pub incident_count: u32,
    pub signal_count: u32,
    pub recording_active: u32,
    pub reserved: [u32; 9],
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct ReplayFrameEntry {
    pub state: GameStateBufferPod,
    pub packed_controls: [u8; 64],
}

impl Default for ReplayFrameEntry {
    fn default() -> Self {
        Self {
            state: GameStateBufferPod::default(),
            packed_controls: [0u8; 64],
        }
    }
}

pub struct ReplayStorage {
    pub header: ReplayHeader,
    pub state_track: Vec<ReplayFrameEntry>,
    pub incident_track: Vec<PhysicsEvent>,
    pub signal_track: Vec<PhysicsEvent>,
}

impl Default for ReplayStorage {
    fn default() -> Self {
        Self::new()
    }
}

impl ReplayStorage {
    pub fn new() -> Self {
        Self {
            header: ReplayHeader {
                magic: 0x524C5243,
                version: 2,
                frame_count: 0,
                state_stride: core::mem::size_of::<ReplayFrameEntry>() as u32,
                incident_count: 0,
                signal_count: 0,
                recording_active: 1,
                reserved: [0; 9],
            },
            state_track: Vec::new(),
            incident_track: Vec::new(),
            signal_track: Vec::new(),
        }
    }

    pub fn init(&mut self) {
        if self.state_track.capacity() == 0 {
            self.state_track.reserve(1024);
        }
        if self.incident_track.capacity() == 0 {
            self.incident_track.reserve(256);
        }
        if self.signal_track.capacity() == 0 {
            self.signal_track.reserve(256);
        }
        self.clear();
    }

    pub fn clear(&mut self) {
        self.state_track.clear();
        self.incident_track.clear();
        self.signal_track.clear();
        self.header.frame_count = 0;
        self.header.incident_count = 0;
        self.header.signal_count = 0;
    }

    pub fn record_frame(
        &mut self,
        state: &GameStateBufferPod,
        controls: &[CarControlsPod; MAX_CARS],
    ) {
        if self.header.recording_active == 0 || self.state_track.len() >= REPLAY_MAX_FRAMES {
            return;
        }
        let mut packed = [0u8; 64];
        for (i, c) in controls.iter().enumerate() {
            let thr = ((c.throttle.clamp(-1.0, 1.0) * 31.0).round() as i32).clamp(-31, 31) + 31;
            let str_v = ((c.steer.clamp(-1.0, 1.0) * 31.0).round() as i32).clamp(-31, 31) + 31;
            let pit = ((c.pitch.clamp(-1.0, 1.0) * 3.0).round() as i32).clamp(-3, 3) + 3;
            let yaw = ((c.yaw.clamp(-1.0, 1.0) * 3.0).round() as i32).clamp(-3, 3) + 3;
            let rol = ((c.roll.clamp(-1.0, 1.0) * 3.0).round() as i32).clamp(-3, 3) + 3;
            let jmp = u8::from(c.jump >= 0.5);
            let bst = u8::from(c.boost >= 0.5);
            let hnd = u8::from(c.handbrake >= 0.5);

            packed[i * 3] = ((thr as u8) & 0x3f) | (((str_v as u8) & 0x30) << 2);
            packed[i * 3 + 1] =
                ((str_v as u8) & 0x0f) | (((pit as u8) & 0x07) << 4) | (((yaw as u8) & 0x04) << 5);
            packed[i * 3 + 2] = ((yaw as u8) & 0x03)
                | (((rol as u8) & 0x07) << 2)
                | (jmp << 5)
                | (bst << 6)
                | (hnd << 7);

            let q_off = 24 + i * 5;
            let q_byte = |v: f32| -> u8 {
                ((v.clamp(-1.0, 1.0) * 127.0).round() as i8) as u8
            };
            packed[q_off] = q_byte(c.throttle);
            packed[q_off + 1] = q_byte(c.steer);
            packed[q_off + 2] = q_byte(c.pitch);
            packed[q_off + 3] = q_byte(c.yaw);
            packed[q_off + 4] = q_byte(c.roll);
        }
        self.state_track.push(ReplayFrameEntry {
            state: *state,
            packed_controls: packed,
        });
        self.header.frame_count = self.state_track.len() as u32;
    }

    pub fn push_incident(&mut self, ev: &PhysicsEvent) {
        if self.header.recording_active == 0 || self.incident_track.len() >= REPLAY_MAX_INCIDENTS {
            return;
        }
        let mut copy = *ev;
        if copy.custom_int == 0 {
            copy.custom_int = self.state_track.len() as u32;
        }
        self.incident_track.push(copy);
        self.header.incident_count = self.incident_track.len() as u32;
    }

    pub fn push_signal(&mut self, ev: &PhysicsEvent) {
        if self.signal_track.len() >= REPLAY_MAX_SIGNALS {
            return;
        }
        let mut copy = *ev;
        if copy.custom_int == 0 {
            copy.custom_int = self.state_track.len() as u32;
        }
        self.signal_track.push(copy);
        self.header.signal_count = self.signal_track.len() as u32;
    }
}
