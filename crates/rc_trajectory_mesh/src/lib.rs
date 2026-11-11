//! `rc_trajectory_mesh`: Zero-copy WASM trajectory tube/ribbon geometry, bounce contact rings,
//! ground drop-line vertex buffer generator, and 3D ground/aerial reachability & intercept solver.

pub mod bounce_and_anchors;
pub mod layout;
pub mod state;
pub mod tube_extruder;

pub use bounce_and_anchors::*;
pub use layout::*;
pub use state::*;
pub use tube_extruder::*;



