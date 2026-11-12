//! Ball-to-surface contact classification: separates sustained rolling/sliding contact from
//! genuine impacts so the contact stream stays event-driven instead of firing once per tick.

use glam::Vec3A;

/// Normal relative speed below which a contact is treated as sustained rolling/sliding contact.
pub const CONTACT_ROLL_NORMAL_SPEED_UU: f32 = 60.0;

/// Extra normal speed a repeated contact on the same surface must gain to count as a new impact.
pub const CONTACT_RETRIGGER_NORMAL_SPEED_UU: f32 = 45.0;

/// Minimum tick spacing between two impacts on the same surface normal.
pub const CONTACT_RETRIGGER_TICKS: u32 = 6;

/// Contact normal similarity above which two contacts are considered the same surface.
pub const CONTACT_SAME_SURFACE_DOT: f32 = 0.9;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BallContactKind {
    Rolling,
    Impact,
}

#[derive(Clone, Copy, Debug)]
pub struct BallContactClassification {
    pub kind: BallContactKind,
    pub normal_speed_uu: f32,
    pub surface_speed_uu: f32,
    pub deflection_uu: f32,
    pub normal: Vec3A,
}

#[derive(Clone, Copy, Debug)]
pub struct BallContactState {
    last_tick: u32,
    last_normal: Vec3A,
    last_normal_speed_uu: f32,
    last_velocity: Vec3A,
    last_impact_tick: u32,
    rolling: bool,
    normal_speed_uu: f32,
    surface_speed_uu: f32,
    normal: Vec3A,
}

impl Default for BallContactState {
    fn default() -> Self {
        Self {
            last_tick: u32::MAX,
            last_normal: Vec3A::ZERO,
            last_normal_speed_uu: 0.0,
            last_velocity: Vec3A::ZERO,
            last_impact_tick: u32::MAX,
            rolling: false,
            normal_speed_uu: 0.0,
            surface_speed_uu: 0.0,
            normal: Vec3A::ZERO,
        }
    }
}

impl BallContactState {
    pub fn reset(&mut self) {
        *self = Self::default();
    }

    /// Classifies one ball/surface contact reported by the physics world for `tick`.
    pub fn classify(
        &mut self,
        tick: u32,
        velocity: Vec3A,
        contact_normal: Vec3A,
    ) -> BallContactClassification {
        let normal = contact_normal.normalize_or_zero();
        let normal_speed_uu = velocity.dot(normal).abs();
        let tangential = velocity - normal * velocity.dot(normal);
        let surface_speed_uu = tangential.length();
        let deflection_uu = (velocity - self.last_velocity).length();

        let continuing = self.last_tick != u32::MAX
            && tick.saturating_sub(self.last_tick) <= 1
            && self.last_normal.dot(normal) >= CONTACT_SAME_SURFACE_DOT;
        let retrigger_gap = self.last_impact_tick == u32::MAX
            || tick.saturating_sub(self.last_impact_tick) >= CONTACT_RETRIGGER_TICKS;

        let kind = if normal_speed_uu < CONTACT_ROLL_NORMAL_SPEED_UU {
            BallContactKind::Rolling
        } else if continuing
            && normal_speed_uu <= self.last_normal_speed_uu + CONTACT_RETRIGGER_NORMAL_SPEED_UU
        {
            BallContactKind::Rolling
        } else if !retrigger_gap
            && normal_speed_uu <= self.last_normal_speed_uu + CONTACT_RETRIGGER_NORMAL_SPEED_UU
        {
            BallContactKind::Rolling
        } else {
            BallContactKind::Impact
        };

        if kind == BallContactKind::Impact {
            self.last_impact_tick = tick;
        }
        self.rolling = kind == BallContactKind::Rolling;
        self.normal_speed_uu = normal_speed_uu;
        self.surface_speed_uu = surface_speed_uu;
        self.normal = normal;
        self.last_tick = tick;
        self.last_normal = normal;
        self.last_normal_speed_uu = normal_speed_uu;
        self.last_velocity = velocity;

        BallContactClassification {
            kind,
            normal_speed_uu,
            surface_speed_uu,
            deflection_uu,
            normal,
        }
    }

    /// True while the ball is in sustained rolling/sliding contact with a surface at `tick`.
    pub fn is_rolling(&self, tick: u32) -> bool {
        self.rolling && self.last_tick != u32::MAX && tick.saturating_sub(self.last_tick) <= 1
    }

    pub fn normal_speed_uu(&self) -> f32 {
        self.normal_speed_uu
    }

    pub fn surface_speed_uu(&self) -> f32 {
        self.surface_speed_uu
    }

    pub fn contact_normal(&self) -> Vec3A {
        self.normal
    }
}
