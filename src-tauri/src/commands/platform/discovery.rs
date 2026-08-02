//! Signed platform discovery.
//!
//! The client no longer carries the platform topology. It carries one bootstrap
//! address and one Ed25519 public key, fetches `/.well-known/dim-platform` from
//! the edge, verifies the signature against the pinned key, and reads every
//! service address out of the document.
//!
//! What this replaces: AES-encrypting the cloud URL into the binary. That
//! emitted the decryption key next to the ciphertext, so anyone with the binary
//! had both — it hid the hostname from `strings` and from nothing else, while
//! the hostname sat in plaintext in the TLS SNI of the first packet. And it made
//! every address change a release.
//!
//! The property that actually matters is integrity, and a signature is how you
//! get it. Concealment was never available and was never the point.

use std::sync::RwLock;
use std::time::{SystemTime, UNIX_EPOCH};

use base64::Engine;
use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use serde::{Deserialize, Serialize};

/// Bootstrap address, in plaintext. See the module docs for why that is fine.
const EDGE_URL: &str = env!("DIM_EDGE_URL");

/// Pinned verification key, base64. Empty only in debug builds; `build.rs`
/// refuses to produce a release without it.
const DISCOVERY_PUBLIC_KEY: &str = env!("DIM_DISCOVERY_PUBLIC_KEY");

const DISCOVERY_PATH: &str = "/.well-known/dim-platform";
const DISCOVERY_VERSION: u32 = 1;

/// Startup waits on this. A client that cannot reach the edge this fast falls
/// back to its cache rather than making the user watch a spinner.
const FETCH_TIMEOUT_SECONDS: u64 = 5;

/// Re-fetch this long before expiry, so a refresh has room to fail and be
/// retried while the document in hand is still valid.
const REFRESH_MARGIN_SECONDS: i64 = 120;

// Only the services this client actually calls. The document also advertises
// `dimtrade`, but the desktop still reads its balance from the auth service's
// `/api/auth/user/balance`; a constant here would suggest a wiring that does
// not exist. It goes in when the wallet call moves.
pub const SERVICE_AUTH: &str = "dimauth";
pub const SERVICE_STORE: &str = "dimstore";
pub const SERVICE_ROUTER: &str = "dimrouter";
pub const SERVICE_AGENTOS: &str = "agentos";

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct ServiceEndpoint {
    pub name: String,
    pub url: String,
    #[serde(default)]
    pub min_client_version: Option<String>,
    #[serde(default = "default_status")]
    pub status: String,
}

fn default_status() -> String {
    "healthy".to_string()
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DiscoveryPayload {
    pub version: u32,
    pub issued_at: i64,
    pub expires_at: i64,
    #[serde(default)]
    pub environment: String,
    #[serde(default)]
    pub services: Vec<ServiceEndpoint>,
    #[serde(default)]
    pub features: serde_json::Map<String, serde_json::Value>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DiscoveryEnvelope {
    pub payload: serde_json::Value,
    #[serde(default)]
    pub signature: String,
    #[serde(default)]
    pub alg: String,
}

#[derive(Debug)]
pub enum DiscoveryError {
    Unreachable(String),
    Malformed(String),
    BadSignature,
    Expired,
    UnsupportedVersion(u32),
    NotPinned,
}

impl std::fmt::Display for DiscoveryError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Unreachable(detail) => write!(f, "cannot reach the platform edge: {detail}"),
            Self::Malformed(detail) => write!(f, "discovery document is malformed: {detail}"),
            Self::BadSignature => write!(f, "discovery document signature does not verify"),
            Self::Expired => write!(f, "discovery document has expired"),
            Self::UnsupportedVersion(v) => write!(f, "unsupported discovery version {v}"),
            Self::NotPinned => write!(f, "no discovery public key was pinned into this build"),
        }
    }
}

impl std::error::Error for DiscoveryError {}

static CACHED: RwLock<Option<DiscoveryPayload>> = RwLock::new(None);

pub fn edge_url() -> &'static str {
    EDGE_URL
}

fn now_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

/// Re-encode the payload the way the signer did.
///
/// Sorted keys, no whitespace — the same canonical form `dimsdk.discovery`
/// uses. Verifying the raw response bytes instead would make the signature
/// depend on the HTTP layer not touching them, which is not a property anyone
/// can promise across proxies and JSON libraries.
fn canonical_bytes(payload: &serde_json::Value) -> Result<Vec<u8>, DiscoveryError> {
    fn write(value: &serde_json::Value, out: &mut String) {
        match value {
            serde_json::Value::Object(map) => {
                let mut keys: Vec<&String> = map.keys().collect();
                keys.sort();
                out.push('{');
                for (index, key) in keys.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    out.push_str(&serde_json::Value::String((*key).clone()).to_string());
                    out.push(':');
                    write(&map[*key], out);
                }
                out.push('}');
            }
            serde_json::Value::Array(items) => {
                out.push('[');
                for (index, item) in items.iter().enumerate() {
                    if index > 0 {
                        out.push(',');
                    }
                    write(item, out);
                }
                out.push(']');
            }
            other => out.push_str(&other.to_string()),
        }
    }

    if !payload.is_object() {
        return Err(DiscoveryError::Malformed("payload is not an object".into()));
    }
    let mut out = String::new();
    write(payload, &mut out);
    Ok(out.into_bytes())
}

fn verifying_key() -> Result<VerifyingKey, DiscoveryError> {
    if DISCOVERY_PUBLIC_KEY.is_empty() {
        return Err(DiscoveryError::NotPinned);
    }
    let raw = base64::engine::general_purpose::STANDARD
        .decode(DISCOVERY_PUBLIC_KEY)
        .map_err(|e| DiscoveryError::Malformed(format!("pinned key is not base64: {e}")))?;
    let bytes: [u8; 32] = raw
        .try_into()
        .map_err(|_| DiscoveryError::Malformed("pinned key is not 32 bytes".into()))?;
    VerifyingKey::from_bytes(&bytes)
        .map_err(|e| DiscoveryError::Malformed(format!("pinned key is not a valid point: {e}")))
}

/// Verify an envelope and parse it. Expiry is checked by the caller, because
/// an expired-but-authentic cached document is still worth using.
pub fn verify(envelope: &DiscoveryEnvelope) -> Result<DiscoveryPayload, DiscoveryError> {
    verify_with(envelope, &verifying_key()?)
}

fn verify_with(
    envelope: &DiscoveryEnvelope,
    key: &VerifyingKey,
) -> Result<DiscoveryPayload, DiscoveryError> {
    let raw_signature = base64::engine::general_purpose::STANDARD
        .decode(&envelope.signature)
        .map_err(|_| DiscoveryError::BadSignature)?;
    let signature_bytes: [u8; 64] = raw_signature
        .try_into()
        .map_err(|_| DiscoveryError::BadSignature)?;

    key.verify(
        &canonical_bytes(&envelope.payload)?,
        &Signature::from_bytes(&signature_bytes),
    )
    .map_err(|_| DiscoveryError::BadSignature)?;

    let payload: DiscoveryPayload = serde_json::from_value(envelope.payload.clone())
        .map_err(|e| DiscoveryError::Malformed(e.to_string()))?;
    if payload.version != DISCOVERY_VERSION {
        return Err(DiscoveryError::UnsupportedVersion(payload.version));
    }
    Ok(payload)
}

/// Fetch and verify, then remember it.
pub async fn refresh() -> Result<DiscoveryPayload, DiscoveryError> {
    let url = format!("{}{}", EDGE_URL.trim_end_matches('/'), DISCOVERY_PATH);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(FETCH_TIMEOUT_SECONDS))
        .build()
        .map_err(|e| DiscoveryError::Unreachable(e.to_string()))?;

    let envelope: DiscoveryEnvelope = client
        .get(&url)
        .send()
        .await
        .map_err(|e| DiscoveryError::Unreachable(e.to_string()))?
        .json()
        .await
        .map_err(|e| DiscoveryError::Malformed(e.to_string()))?;

    let payload = verify(&envelope)?;
    if payload.expires_at <= now_seconds() {
        return Err(DiscoveryError::Expired);
    }

    if let Ok(mut guard) = CACHED.write() {
        *guard = Some(payload.clone());
    }
    Ok(payload)
}

pub fn cached() -> Option<DiscoveryPayload> {
    CACHED.read().ok().and_then(|guard| guard.clone())
}

pub fn needs_refresh() -> bool {
    match cached() {
        None => true,
        Some(payload) => now_seconds() > payload.expires_at - REFRESH_MARGIN_SECONDS,
    }
}

/// Address of a service, or `None` if discovery has not run.
///
/// Callers fall back to the edge URL. That is right for anything reachable
/// through the edge — which today is everything — and it means a discovery
/// failure degrades to the previous behaviour rather than to a dead client.
pub fn url_for(service: &str) -> Option<String> {
    cached().and_then(|payload| {
        payload
            .services
            .iter()
            .find(|s| s.name == service)
            .map(|s| s.url.clone())
    })
}

/// Whether to bother trying. An unmentioned service reads as healthy: not being
/// named is not the same as being down, and pre-emptively disabling a feature
/// over a missing name is worse than attempting the call.
pub fn is_healthy(service: &str) -> bool {
    match cached() {
        None => true,
        Some(payload) => payload
            .services
            .iter()
            .find(|s| s.name == service)
            .map(|s| s.status != "down")
            .unwrap_or(true),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn payload_json(expires_in: i64) -> serde_json::Value {
        serde_json::json!({
            "version": 1,
            "issued_at": now_seconds(),
            "expires_at": now_seconds() + expires_in,
            "environment": "test",
            "services": [
                {"name": "dimauth", "url": "https://auth.dimnuo.com",
                 "min_client_version": "0.1.0", "status": "healthy"},
                {"name": "dimstore", "url": "https://store.dimnuo.com",
                 "min_client_version": "0.1.0", "status": "down"}
            ],
            "features": {"wechat_login": true}
        })
    }

    /// The canonical form must match what `dimsdk.discovery.canonical_bytes`
    /// produces, or nothing this client is handed will ever verify. Two
    /// implementations of one encoding is exactly where that drifts.
    #[test]
    fn canonical_encoding_sorts_keys_and_omits_whitespace() {
        let value = serde_json::json!({"b": 1, "a": {"d": [1, 2], "c": "x"}});
        let encoded = String::from_utf8(canonical_bytes(&value).unwrap()).unwrap();
        assert_eq!(encoded, r#"{"a":{"c":"x","d":[1,2]},"b":1}"#);
    }

    #[test]
    fn canonical_encoding_is_stable_across_key_order() {
        let one: serde_json::Value = serde_json::from_str(r#"{"a":1,"b":2}"#).unwrap();
        let two: serde_json::Value = serde_json::from_str(r#"{"b":2,"a":1}"#).unwrap();
        assert_eq!(canonical_bytes(&one).unwrap(), canonical_bytes(&two).unwrap());
    }

    #[test]
    fn a_non_object_payload_is_rejected() {
        assert!(canonical_bytes(&serde_json::json!([1, 2, 3])).is_err());
    }

    #[test]
    fn an_unpinned_build_verifies_nothing() {
        // Debug builds may be unpinned so a developer can point at a local
        // stack; `build.rs` refuses to produce a release that way.
        if DISCOVERY_PUBLIC_KEY.is_empty() {
            let envelope = DiscoveryEnvelope {
                payload: payload_json(900),
                signature: String::new(),
                alg: "none".into(),
            };
            assert!(matches!(
                verify(&envelope),
                Err(DiscoveryError::NotPinned)
            ));
        }
    }

    #[test]
    fn a_missing_signature_is_not_treated_as_a_valid_one() {
        let envelope = DiscoveryEnvelope {
            payload: payload_json(900),
            signature: String::new(),
            alg: "none".into(),
        };
        assert!(verify(&envelope).is_err());
    }

    #[test]
    fn the_bootstrap_address_is_plaintext_on_purpose() {
        // It is in the TLS SNI of the first packet either way. What guards the
        // client is the pinned key, not hiding this string.
        assert!(EDGE_URL.starts_with("http"));
    }

    #[test]
    fn an_unknown_service_is_attempted_rather_than_disabled() {
        assert!(is_healthy("something-not-in-the-document"));
    }

    fn dimsdk_fixture() -> serde_json::Value {
        let raw = include_str!("../../../tests/fixtures/discovery_signed_by_dimsdk.json");
        serde_json::from_str(raw).expect("fixture must be valid JSON")
    }

    fn fixture_key() -> VerifyingKey {
        let encoded = dimsdk_fixture()["public_key"].as_str().unwrap().to_string();
        let raw = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .unwrap();
        VerifyingKey::from_bytes(&raw.try_into().unwrap()).unwrap()
    }

    /// The one that matters.
    ///
    /// Two implementations of one canonical encoding is precisely where drift
    /// hides, and the symptom would be every client rejecting an authentic
    /// document with nothing in the error pointing at the cause. The fixture is
    /// produced by `dimsdk.discovery.sign_document`, so this fails the moment
    /// the two encodings stop agreeing.
    #[test]
    fn a_document_signed_by_the_python_sdk_verifies_here() {
        let envelope: DiscoveryEnvelope =
            serde_json::from_value(dimsdk_fixture()["envelope"].clone()).unwrap();
        let payload = verify_with(&envelope, &fixture_key()).expect("must verify");

        assert_eq!(payload.environment, "生产");
        assert_eq!(payload.services.len(), 3);
        assert_eq!(
            payload
                .services
                .iter()
                .find(|s| s.name == "dimstore")
                .unwrap()
                .status,
            "down"
        );
    }

    /// The fixture carries Chinese text on purpose. Python's `json.dumps`
    /// escapes non-ASCII to `\uXXXX` by default while serde_json writes raw
    /// UTF-8; if the SDK ever reverts to the default, this is what catches it.
    #[test]
    fn non_ascii_fields_do_not_break_verification() {
        let envelope: DiscoveryEnvelope =
            serde_json::from_value(dimsdk_fixture()["envelope"].clone()).unwrap();
        assert!(envelope.payload["features"]["注释"].is_string());
        assert!(verify_with(&envelope, &fixture_key()).is_ok());
    }

    #[test]
    fn tampering_with_the_python_signed_document_is_caught() {
        let mut envelope: DiscoveryEnvelope =
            serde_json::from_value(dimsdk_fixture()["envelope"].clone()).unwrap();
        envelope.payload["services"][0]["url"] =
            serde_json::json!("https://auth.attacker.example");

        assert!(matches!(
            verify_with(&envelope, &fixture_key()),
            Err(DiscoveryError::BadSignature)
        ));
    }
}
