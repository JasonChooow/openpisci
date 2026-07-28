//! Compile-time encrypted Cloud gateway URL and its frontend command.

use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

const ENCRYPTED_CLOUD_URL: &str = env!("ENCRYPTED_CLOUD_URL");
const CLOUD_URL_NONCE: &str = env!("CLOUD_URL_NONCE");
const CLOUD_URL_KEY: &str = env!("CLOUD_URL_KEY");

/// Return the official Cloud gateway URL.
///
/// Debug builds may use a compile-time `VITE_CLOUD_BASE_URL` override for
/// local integration. Release builds always decrypt the embedded official URL.
pub fn get_cloud_url() -> String {
    #[cfg(debug_assertions)]
    if let Some(url) = debug_cloud_url_override(option_env!("VITE_CLOUD_BASE_URL")) {
        return url;
    }

    decrypt_embedded_cloud_url()
}

#[cfg(debug_assertions)]
fn debug_cloud_url_override(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_owned)
}

fn decrypt_cloud_url(
    ciphertext: &[u8],
    key: &[u8; 32],
    nonce: &[u8; 12],
) -> Result<Vec<u8>, aes_gcm::Error> {
    let cipher = Aes256Gcm::new_from_slice(key).expect("AES-256-GCM key must be exactly 32 bytes");
    cipher.decrypt(Nonce::from_slice(nonce), ciphertext)
}

fn decrypt_embedded_cloud_url() -> String {
    let encrypted = hex::decode(ENCRYPTED_CLOUD_URL)
        .expect("embedded Cloud URL ciphertext must be valid hexadecimal");
    let nonce: [u8; 12] = hex::decode(CLOUD_URL_NONCE)
        .expect("embedded Cloud URL nonce must be valid hexadecimal")
        .try_into()
        .expect("embedded Cloud URL nonce must be 12 bytes");
    let key: [u8; 32] = hex::decode(CLOUD_URL_KEY)
        .expect("embedded Cloud URL key must be valid hexadecimal")
        .try_into()
        .expect("embedded Cloud URL key must be 32 bytes");

    let plaintext = decrypt_cloud_url(&encrypted, &key, &nonce)
        .expect("embedded Cloud URL authentication or decryption failed");

    String::from_utf8(plaintext).expect("decrypted Cloud URL must be valid UTF-8")
}

#[tauri::command]
pub fn get_cloud_base_url() -> String {
    get_cloud_url()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::{prelude::*, string::string_regex};

    fn valid_cloud_url() -> impl Strategy<Value = String> {
        (
            prop_oneof![Just("http"), Just("https")],
            prop::collection::vec(
                string_regex("[a-z][a-z0-9]{0,15}").expect("host label regex must be valid"),
                2..=4,
            ),
            prop::collection::vec(
                string_regex("[A-Za-z0-9._~-]{1,24}").expect("path segment regex must be valid"),
                0..=4,
            ),
            prop::option::of(
                string_regex("[A-Za-z0-9._~=&-]{1,24}").expect("query regex must be valid"),
            ),
        )
            .prop_map(|(scheme, host_labels, path_segments, query)| {
                let mut url = format!("{scheme}://{}", host_labels.join("."));
                for segment in path_segments {
                    url.push('/');
                    url.push_str(&segment);
                }
                if let Some(query) = query {
                    url.push('?');
                    url.push_str(&query);
                }
                url
            })
    }

    #[test]
    fn embedded_cloud_url_decrypts_to_official_endpoint() {
        assert_eq!(decrypt_embedded_cloud_url(), "https://www.dimnuo.com");
        assert!(!ENCRYPTED_CLOUD_URL.contains("dimnuo"));
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

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(100))]

        /// Feature: cloud-locked-llm-gateway, Property 1: Cloud URL 加密解密往返一致
        /// **Validates: Requirements 1.1, 1.2**
        #[test]
        fn cloud_url_encryption_decryption_round_trip(
            url in valid_cloud_url(),
            key in prop::array::uniform32(any::<u8>()),
            nonce in prop::array::uniform12(any::<u8>()),
        ) {
            let cipher = Aes256Gcm::new_from_slice(&key)
                .expect("generated AES-256-GCM key must be 32 bytes");
            let ciphertext = cipher
                .encrypt(Nonce::from_slice(&nonce), url.as_bytes())
                .expect("encryption of a valid URL must succeed");

            let plaintext = decrypt_cloud_url(&ciphertext, &key, &nonce)
                .expect("ciphertext encrypted with the same key and nonce must decrypt");

            prop_assert_eq!(plaintext.as_slice(), url.as_bytes());
        }
    }
}
