//! Platform-domain Tauri commands — host / OS primitives.
//!
//! These commands concern the desktop shell itself rather than any agent
//! domain:
//!
//! - [`system`] — runtime & VM capability probing (adb, ffmpeg, …)
//! - [`window`] — window / tray / overlay control, theme application
//! - [`permission`] — UI-side resolution of pending permission prompts
//! - [`interactive`] — UI-side resolution of pending interactive-UI requests
//!
//! Anything here is host-specific glue and has no bearing on chat / pool /
//! config state.

pub mod cloud;
pub mod cloud_account;
pub mod agentos;
pub mod cloud_url;
pub mod extras;
pub mod interactive;
pub mod marketplace;
pub mod permission;
pub mod system;
pub mod window;
