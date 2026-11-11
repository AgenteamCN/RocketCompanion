//! `rc_trajectory_mesh`: Zero-copy WASM trajectory tube/ribbon geometry, bounce contact rings,
//! ground drop-line vertex buffer generator, and 3D ground/aerial reachability & intercept solver.

pub mod layout;
pub mod sampler_and_anomaly;
pub mod state;

pub use layout::*;
pub use sampler_and_anomaly::*;
pub use state::*;

