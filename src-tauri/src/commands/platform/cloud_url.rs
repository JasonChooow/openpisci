//! The platform edge address, and the service addresses discovery resolves.
//!
//! This used to AES-decrypt a URL baked into the binary at compile time. The
//! build emitted the decryption key alongside the ciphertext, so anyone holding
//! the binary held both halves — it hid the hostname from `strings` and from
//! nothing else, while the hostname travelled in plaintext in the TLS SNI of
//! every connection. The cost was real though: the address *was* the binary, so
//! moving a service meant shipping a release.
//!
//! Now the binary carries a bootstrap address and a pinned Ed25519 key, and the
//! addresses come from a signed document. See `discovery.rs`.

use super::discovery;

/// The platform edge.
///
/// Kept as the fallback for every caller: everything is reachable through the
/// edge today, so a discovery failure degrades to exactly the previous
/// behaviour rather than to a client that cannot talk to anything.
pub fn get_cloud_url() -> String {
    #[cfg(debug_assertions)]
    if let Some(url) = debug_cloud_url_override(option_env!("VITE_CLOUD_BASE_URL")) {
        return url;
    }

    discovery::edge_url().to_string()
}

#[cfg(debug_assertions)]
fn debug_cloud_url_override(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

/// Address of one platform service, falling back to the edge.
///
/// A local override wins over discovery: a developer pointing at their own
/// stack means it, and having the document silently redirect them to production
/// would be a confusing afternoon.
pub fn service_url(service: &str) -> String {
    #[cfg(debug_assertions)]
    if let Some(url) = debug_cloud_url_override(option_env!("VITE_CLOUD_BASE_URL")) {
        return url;
    }

    discovery::url_for(service).unwrap_or_else(|| discovery::edge_url().to_string())
}

#[tauri::command]
pub fn get_cloud_base_url() -> String {
    get_cloud_url()
}

/// What the frontend needs to decide what to render before anything is called:
/// where each service is, which are down, and which features are on.
#[tauri::command]
pub async fn get_platform_discovery() -> Result<serde_json::Value, String> {
    if discovery::needs_refresh() {
        // A refresh failure is not fatal — a document already in hand stays
        // usable, and a client with none still has the edge to fall back to.
        if let Err(error) = discovery::refresh().await {
            tracing::warn!("platform discovery refresh failed: {error}");
        }
    }

    match discovery::cached() {
        Some(payload) => serde_json::to_value(payload).map_err(|error| error.to_string()),
        None => Ok(serde_json::json!({
            "available": false,
            "edge_url": discovery::edge_url(),
        })),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_edge_address_is_a_url() {
        assert!(get_cloud_url().starts_with("http"));
    }

    #[test]
    fn an_unresolved_service_falls_back_to_the_edge() {
        // Everything is reachable through the edge, so this degrades to the
        // behaviour that existed before discovery rather than to a dead client.
        assert_eq!(service_url("not-a-real-service"), get_cloud_url());
    }

    #[cfg(debug_assertions)]
    #[test]
    fn debug_override_ignores_whitespace_and_trims_valid_urls() {
        assert_eq!(debug_cloud_url_override(None), None);
        assert_eq!(debug_cloud_url_override(Some("   ")), None);
        assert_eq!(
            debug_cloud_url_override(Some("  http://127.0.0.1:8787/  ")),
            Some("http://127.0.0.1:8787/".to_string())
        );
    }
}
