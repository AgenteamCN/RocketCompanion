//! Discrete vehicle action cue synthesizers (`0x06`..`0x09`, `0x0C`, `0x0D`, `0x0F`)
//! for `AudioDirectorInstance`.

use rc_physics_sim::layout::PhysicsEvent;

use crate::{
    director::AudioDirectorInstance,
    pod_types::{edge_mask_bits, AudioOneShotSlotPod},
};

impl AudioDirectorInstance {
    pub(crate) fn handle_car_jump_family(
        &mut self,
        ev: &PhysicsEvent,
        ev_type: u32,
        car_idx: usize,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let dt_state = &mut self.drivetrains[car_idx];
        if ev_type == 0x06 {
            if dt_state.last_jump_tick != 0 && ev_tick.saturating_sub(dt_state.last_jump_tick) < 5 {
                return;
            }
            dt_state.last_jump_tick = ev_tick.max(1);
        } else {
            if dt_state.last_air_jump_tick != 0
                && ev_tick.saturating_sub(dt_state.last_air_jump_tick) < 5
            {
                return;
            }
            dt_state.last_air_jump_tick = ev_tick.max(1);
        }
        let is_local = (car_idx as i32) == self.listener_pod.active_car_index;
        let (atten, culled) = if is_local {
            (self.config_pod.vehicle_self_volume, false)
        } else {
            self.evaluate_attenuation(7, dist_uu)
        };
        if culled {
            return;
        }
        let vol = match ev_type {
            0x06 => self.config_pod.jump_volume,
            0x07 => self.config_pod.double_jump_volume,
            _ => self.config_pod.dodge_volume,
        };
        let gain = (atten * vol * self.config_pod.master_volume).clamp(0.0, 1.8);
        let variant = self.select_variation(ev_type as usize, 4);
        let rate = 0.97 + self.next_rand_f32() * 0.06;
        let bit_base = match ev_type {
            0x06 => edge_mask_bits::CAR_JUMP_BASE,
            0x07 => edge_mask_bits::CAR_DOUBLE_JUMP_BASE,
            _ => edge_mask_bits::CAR_DODGE_BASE,
        };
        self.cue_pod.one_shot_edge_mask_lo |= 1u32 << (bit_base + (car_idx as u32));
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: ev_type,
            sub_type: ev.sub_type,
            car_index: car_idx as u32,
            priority_and_variant: 65 | (variant << 8) | (u32::from(is_local) << 16),
            final_gain: gain,
            playback_rate: rate,
            distance_radius_scale: 1.0,
            pan_or_intensity: self.cue_pod.cars[car_idx].spatial_pan,
            audio_pos_meters: audio_pos,
            category_index: 7,
        });
    }

    pub(crate) fn handle_car_supersonic_enter(
        &mut self,
        car_idx: usize,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let dt_state = &mut self.drivetrains[car_idx];
        if dt_state.last_supersonic_tick != 0
            && ev_tick.saturating_sub(dt_state.last_supersonic_tick) < 12
        {
            return;
        }
        dt_state.last_supersonic_tick = ev_tick.max(1);
        let is_local = (car_idx as i32) == self.listener_pod.active_car_index;
        let (atten, culled) = if is_local {
            (self.config_pod.vehicle_self_volume, false)
        } else {
            self.evaluate_attenuation(8, dist_uu)
        };
        if culled {
            return;
        }
        let gain = (atten
            * self.config_pod.supersonic_enter_volume
            * self.config_pod.master_volume)
            .clamp(0.0, 1.8);
        let variant = self.select_variation(9, 3);
        let rate = 0.98 + self.next_rand_f32() * 0.04;
        self.cue_pod.one_shot_edge_mask_hi |=
            1u32 << (edge_mask_bits::CAR_SUPERSONIC_ENTER_BASE + (car_idx as u32));
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x09,
            sub_type: 0,
            car_index: car_idx as u32,
            priority_and_variant: 70 | (variant << 8) | (u32::from(is_local) << 16),
            final_gain: gain,
            playback_rate: rate,
            distance_radius_scale: 1.0,
            pan_or_intensity: self.cue_pod.cars[car_idx].spatial_pan,
            audio_pos_meters: audio_pos,
            category_index: 8,
        });
    }

    pub(crate) fn handle_car_boost_edge(
        &mut self,
        ev_type: u32,
        car_idx: usize,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        let dt_state = &mut self.drivetrains[car_idx];
        if ev_type == 0x0C {
            if dt_state.last_boost_tick != 0 && ev_tick.saturating_sub(dt_state.last_boost_tick) < 10
            {
                return;
            }
            dt_state.last_boost_tick = ev_tick.max(1);
            self.cue_pod.one_shot_edge_mask_lo |=
                1u32 << (edge_mask_bits::CAR_BOOST_START_BASE + (car_idx as u32));
        } else {
            self.cue_pod.one_shot_edge_mask_hi |=
                1u32 << (edge_mask_bits::CAR_BOOST_STOP_BASE + (car_idx as u32));
        }
        let is_local = (car_idx as i32) == self.listener_pod.active_car_index;
        let (atten, culled) = if is_local {
            (self.config_pod.vehicle_self_volume, false)
        } else {
            self.evaluate_attenuation(6, dist_uu)
        };
        if culled {
            return;
        }
        let base_vol = if ev_type == 0x0C {
            self.config_pod.boost_start_volume
        } else {
            self.config_pod.boost_release_volume
        };
        let gain = (atten
            * base_vol
            * self.config_pod.boost_volume
            * self.config_pod.master_volume)
            .clamp(0.0, 1.8);
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: ev_type,
            sub_type: 0,
            car_index: car_idx as u32,
            priority_and_variant: 62 | (u32::from(is_local) << 16),
            final_gain: gain,
            playback_rate: 1.0,
            distance_radius_scale: 1.0,
            pan_or_intensity: self.cue_pod.cars[car_idx].spatial_pan,
            audio_pos_meters: audio_pos,
            category_index: 6,
        });
    }

    pub(crate) fn handle_flip_reset_gained(
        &mut self,
        ev: &PhysicsEvent,
        car_idx: usize,
        ev_tick: u32,
        dist_uu: f32,
        audio_pos: [f32; 3],
    ) {
        if ev.sub_type != 1 {
            return;
        }
        let dt_state = &mut self.drivetrains[car_idx];
        if dt_state.last_flip_reset_tick != 0
            && ev_tick.saturating_sub(dt_state.last_flip_reset_tick) < 60
        {
            return;
        }
        dt_state.last_flip_reset_tick = ev_tick.max(1);
        let is_local = (car_idx as i32) == self.listener_pod.active_car_index;
        let (atten, culled) = if is_local {
            (self.config_pod.vehicle_self_volume, false)
        } else {
            self.evaluate_attenuation(9, dist_uu)
        };
        if culled {
            return;
        }
        let gain = (atten * self.config_pod.flip_reset_volume * self.config_pod.master_volume)
            .clamp(0.0, 1.8);
        self.push_one_shot(AudioOneShotSlotPod {
            event_type: 0x0F,
            sub_type: ev.sub_type,
            car_index: car_idx as u32,
            priority_and_variant: 80 | (u32::from(is_local) << 16),
            final_gain: gain,
            playback_rate: 1.0,
            distance_radius_scale: 1.0,
            pan_or_intensity: 1.0,
            audio_pos_meters: audio_pos,
            category_index: 9,
        });
    }
}
