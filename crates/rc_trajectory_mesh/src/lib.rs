//! `rc_trajectory_mesh`: Zero-copy WASM trajectory tube/ribbon geometry, bounce contact rings,
//! ground drop-line vertex buffer generator, and 3D ground/aerial reachability & intercept solver.

pub mod layout;
pub mod state;

pub use layout::*;
pub use state::*;

