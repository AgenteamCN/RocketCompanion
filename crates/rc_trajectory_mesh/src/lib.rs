//! `rc_trajectory_mesh`: Zero-copy WASM trajectory tube/ribbon geometry, bounce contact rings,
//! ground drop-line vertex buffer generator, and 3D ground/aerial reachability & intercept solver.

pub mod aerial_reachability;
pub mod ground_reachability;
pub mod intercept_solver;
pub mod layout;
pub mod reachability_constants;
pub mod state;

pub use layout::*;
pub use reachability_constants::*;
pub use state::*;

