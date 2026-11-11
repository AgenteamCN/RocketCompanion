//! `rc_trajectory_mesh`: Zero-copy WASM trajectory tube/ribbon geometry, bounce contact rings,
//! ground drop-line vertex buffer generator, and 3D ground/aerial reachability & intercept solver.

pub mod aerial_reachability;
pub mod bounce_and_anchors;
pub mod ground_reachability;
pub mod intercept_solver;
pub mod layout;
pub mod reachability_constants;
pub mod sampler_and_anomaly;
pub mod state;
pub mod tube_extruder;

pub use bounce_and_anchors::*;
pub use layout::*;
pub use reachability_constants::*;
pub use sampler_and_anomaly::*;
pub use state::*;
pub use tube_extruder::*;



