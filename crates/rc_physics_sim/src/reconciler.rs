//! Ring-buffer historical snapshot storage, multi-car rollback control ring,
//! and single-call rollback-resimulate / forward-prediction stepping for client reconciliation.

use crate::{
    layout::{CarControlsPod, MAX_CARS},
    sim_instance::{SavedSlotSnapshot, SimInstance},
};

pub const SNAPSHOT_RING_CAPACITY: usize = 256;
pub const SNAPSHOT_RING_MASK: usize = SNAPSHOT_RING_CAPACITY - 1;
pub const CONTROLS_RING_CAPACITY: usize = 1024;
pub const CONTROLS_RING_MASK: usize = CONTROLS_RING_CAPACITY - 1;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct ReconcileControlEntryPod {
    pub tick: i32,
    pub valid_mask: u32,
    pub controls: [CarControlsPod; MAX_CARS],
}

impl Default for ReconcileControlEntryPod {
    fn default() -> Self {
        Self {
            tick: -1,
            valid_mask: 0,
            controls: [CarControlsPod::default(); MAX_CARS],
        }
    }
}

#[repr(C)]
#[derive(Clone, Copy)]
pub struct ReconcileOutcomePod {
    pub start_tick: i32,
    pub end_tick: i32,
    pub resimulated_ticks: i32,
    pub restored_from_ring_slot: u32,
    pub pre_ball_pos: [f32; 3],
    pub post_ball_pos: [f32; 3],
    pub pre_car_pos: [[f32; 3]; MAX_CARS],
    pub post_car_pos: [[f32; 3]; MAX_CARS],
}

impl Default for ReconcileOutcomePod {
    fn default() -> Self {
        Self {
            start_tick: 0,
            end_tick: 0,
            resimulated_ticks: 0,
            restored_from_ring_slot: 0,
            pre_ball_pos: [0.0; 3],
            post_ball_pos: [0.0; 3],
            pre_car_pos: [[0.0; 3]; MAX_CARS],
            post_car_pos: [[0.0; 3]; MAX_CARS],
        }
    }
}

pub struct ReconcilerRingStorage {
    pub controls_ring: Vec<ReconcileControlEntryPod>,
    pub last_outcome: ReconcileOutcomePod,
    pub last_local_controls: CarControlsPod,
    pub last_remote_controls: [CarControlsPod; MAX_CARS],
    pub remote_controls_valid_mask: u32,
}

impl Default for ReconcilerRingStorage {
    fn default() -> Self {
        Self::new()
    }
}

impl ReconcilerRingStorage {
    pub fn new() -> Self {
        Self {
            controls_ring: vec![ReconcileControlEntryPod::default(); CONTROLS_RING_CAPACITY],
            last_outcome: ReconcileOutcomePod::default(),
            last_local_controls: CarControlsPod::default(),
            last_remote_controls: [CarControlsPod::default(); MAX_CARS],
            remote_controls_valid_mask: 0,
        }
    }

    pub fn clear(&mut self) {
        self.controls_ring.fill(ReconcileControlEntryPod::default());
        self.last_outcome = ReconcileOutcomePod::default();
        self.last_local_controls = CarControlsPod::default();
        self.last_remote_controls = [CarControlsPod::default(); MAX_CARS];
        self.remote_controls_valid_mask = 0;
    }

    pub fn set_tick_controls(&mut self, tick: i32, slot: usize, ctrl: CarControlsPod) {
        if tick < 0 || slot >= MAX_CARS {
            return;
        }
        let idx = (tick as usize) & CONTROLS_RING_MASK;
        let entry = &mut self.controls_ring[idx];
        if entry.tick != tick {
            entry.tick = tick;
            entry.valid_mask = 0;
            entry.controls = [CarControlsPod::default(); MAX_CARS];
        }
        entry.controls[slot] = ctrl;
        entry.valid_mask |= 1u32 << slot;
    }

    pub fn get_tick_controls(&self, tick: i32, slot: usize) -> Option<CarControlsPod> {
        if tick < 0 || slot >= MAX_CARS {
            return None;
        }
        let entry = &self.controls_ring[(tick as usize) & CONTROLS_RING_MASK];
        if entry.tick == tick && (entry.valid_mask & (1u32 << slot)) != 0 {
            Some(entry.controls[slot])
        } else {
            None
        }
    }

    pub fn resolve_controls_for_step(
        &mut self,
        tick: i32,
        slot: usize,
        local_car_index: usize,
        is_kickoff_masked: bool,
        zero_hold_order_during_resim: bool,
    ) -> CarControlsPod {
        if is_kickoff_masked {
            let neutral = CarControlsPod::default();
            self.set_tick_controls(tick, slot, neutral);
            return neutral;
        }
        if let Some(existing) = self.get_tick_controls(tick, slot) {
            return existing;
        }
        if slot == local_car_index {
            for lookback in 1..=16 {
                let prev = tick - lookback;
                if prev < 0 {
                    break;
                }
                if let Some(ctrl) = self.get_tick_controls(prev, slot) {
                    self.set_tick_controls(tick, slot, ctrl);
                    return ctrl;
                }
            }
            let held = self.last_local_controls;
            self.set_tick_controls(tick, slot, held);
            return held;
        }
        if (self.remote_controls_valid_mask & (1u32 << slot)) == 0 {
            return CarControlsPod::default();
        }
        let mut remote = self.last_remote_controls[slot];
        if zero_hold_order_during_resim {
            remote.steer = 0.0;
            remote.pitch = 0.0;
            remote.yaw = 0.0;
            remote.roll = 0.0;
            remote.jump = 0.0;
        }
        remote
    }
}

impl SimInstance {
    pub fn save_state_slot(&mut self, slot: i32) -> i32 {
        if slot < 0 {
            return 0;
        }
        let Some(arena) = self.arena.as_ref() else {
            return 0;
        };
        let idx = (slot as usize) & SNAPSHOT_RING_MASK;
        let tick = arena.tick_count() as i32;
        self.saved_slots[idx] = Some(SavedSlotSnapshot {
            tick,
            arena: arena.clone(),
            car_slots: self.car_slots,
            car_custom: self.car_custom,
            state_buffer: self.state_buffer,
        });
        1
    }

    pub fn restore_state_slot(&mut self, slot: i32) -> i32 {
        if slot < 0 {
            return 0;
        }
        let idx = (slot as usize) & SNAPSHOT_RING_MASK;
        let Some(saved) = self.saved_slots[idx].as_ref() else {
            return 0;
        };
        self.arena = Some(saved.arena.clone());
        self.car_slots = saved.car_slots;
        self.car_custom = saved.car_custom;
        self.state_buffer = saved.state_buffer;
        self.sync_state_to_buffer();
        1
    }

    pub fn clear_reconciler_history(&mut self) {
        self.reconciler.clear();
        for slot in self.saved_slots.iter_mut() {
            *slot = None;
        }
    }

    pub fn set_reconciler_remote_controls(&mut self, car_slot: usize, ctrl: CarControlsPod) {
        if car_slot >= MAX_CARS {
            return;
        }
        self.reconciler.last_remote_controls[car_slot] = ctrl;
        self.reconciler.remote_controls_valid_mask |= 1u32 << car_slot;
    }

    pub fn reconcile_rollback_to_tick(
        &mut self,
        server_tick: i32,
        target_client_tick: i32,
        local_car_index: i32,
        kickoff_mask_until_tick: i32,
        authoritative_state_slice: Option<&[f32]>,
    ) -> i32 {
        if server_tick < 0 || target_client_tick < server_tick || self.arena.is_none() {
            return 0;
        }
        let local_idx = local_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;

        self.sync_state_to_buffer();
        let mut outcome = ReconcileOutcomePod {
            start_tick: server_tick,
            end_tick: target_client_tick,
            resimulated_ticks: 0,
            restored_from_ring_slot: 0,
            pre_ball_pos: self.state_buffer.ball.pos,
            post_ball_pos: [0.0; 3],
            pre_car_pos: [[0.0; 3]; MAX_CARS],
            post_car_pos: [[0.0; 3]; MAX_CARS],
        };
        for c in 0..MAX_CARS {
            outcome.pre_car_pos[c] = self.state_buffer.cars[c].pos;
        }

        let ring_idx = (server_tick as usize) & SNAPSHOT_RING_MASK;
        let has_matching_ring_slot = self.saved_slots[ring_idx]
            .as_ref()
            .is_some_and(|s| s.tick == server_tick);
        if has_matching_ring_slot {
            let _ = self.restore_state_slot(server_tick);
            outcome.restored_from_ring_slot = 1;
        }
        if let Some(auth_slice) = authoritative_state_slice
            && self.restore_compact_state(auth_slice) == 0
        {
            return 0;
        }

        let backfill_start = (server_tick - 16).max(0);
        for t in backfill_start..server_tick {
            let masked = kickoff_mask_until_tick > 0 && t < kickoff_mask_until_tick;
            let _ = self
                .reconciler
                .resolve_controls_for_step(t, local_idx, local_idx, masked, false);
        }

        for t in server_tick..target_client_tick {
            let masked = kickoff_mask_until_tick > 0 && t < kickoff_mask_until_tick;
            for c in 0..MAX_CARS {
                if self.car_slots[c].is_none() {
                    continue;
                }
                let ctrl =
                    self.reconciler
                        .resolve_controls_for_step(t, c, local_idx, masked, true);
                self.controls_buffer[c] = ctrl;
            }
            let _ = self.save_state_slot(t);
            self.step(1, true);
            outcome.resimulated_ticks += 1;
        }

        let _ = self.save_state_slot(target_client_tick);
        self.sync_state_to_buffer();
        outcome.post_ball_pos = self.state_buffer.ball.pos;
        for c in 0..MAX_CARS {
            outcome.post_car_pos[c] = self.state_buffer.cars[c].pos;
        }
        self.reconciler.last_outcome = outcome;
        1
    }

    pub fn step_reconciler_range(
        &mut self,
        from_tick: i32,
        to_tick: i32,
        local_car_index: i32,
        kickoff_mask_until_tick: i32,
        silent: bool,
    ) -> i32 {
        if from_tick < 0 || to_tick <= from_tick || self.arena.is_none() {
            return from_tick.max(0);
        }
        let local_idx = local_car_index.clamp(0, (MAX_CARS - 1) as i32) as usize;
        for t in from_tick..to_tick {
            let masked = kickoff_mask_until_tick > 0 && t < kickoff_mask_until_tick;
            for c in 0..MAX_CARS {
                if self.car_slots[c].is_none() {
                    continue;
                }
                let ctrl =
                    self.reconciler
                        .resolve_controls_for_step(t, c, local_idx, masked, false);
                if c == local_idx {
                    self.reconciler.last_local_controls = ctrl;
                }
                self.controls_buffer[c] = ctrl;
            }
            let _ = self.save_state_slot(t);
            self.step(1, silent);
        }
        let current_tick = self
            .arena
            .as_ref()
            .map(|a| a.tick_count() as i32)
            .unwrap_or(to_tick);
        let _ = self.save_state_slot(current_tick);
        current_tick
    }
}
