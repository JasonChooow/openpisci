use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};

const CLOUD_URL: &str = "https://www.dimnuo.com";
const CLOUD_URL_KEY_ENV: &str = "PISCIS_CLOUD_URL_KEY_HEX";

fn main() {
    encrypt_cloud_url();

    for icon in [
        "icons/32x32.png",
        "icons/64x64.png",
        "icons/128x128.png",
        "icons/128x128@2x.png",
        "icons/icon.png",
        "icons/icon.ico",
        "icons/icon.icns",
    ] {
        println!("cargo:rerun-if-changed={icon}");
    }

    #[cfg(target_os = "windows")]
    {
        let mut attributes = tauri_build::Attributes::new();
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new_without_app_manifest());
        add_windows_manifest();
        tauri_build::try_build(attributes).expect("failed to run tauri build");
    }

    #[cfg(not(target_os = "windows"))]
    tauri_build::build()
}

fn encrypt_cloud_url() {
    println!("cargo:rerun-if-env-changed={CLOUD_URL_KEY_ENV}");
    println!("cargo:rerun-if-env-changed=VITE_CLOUD_BASE_URL");

    let key = cloud_url_key();
    let mut nonce = [0_u8; 12];
    getrandom::getrandom(&mut nonce).expect("failed to generate Cloud URL nonce");

    let cipher = Aes256Gcm::new_from_slice(&key).expect("AES-256-GCM key must be 32 bytes");
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce), CLOUD_URL.as_bytes())
        .expect("failed to encrypt Cloud URL");

    println!(
        "cargo:rustc-env=ENCRYPTED_CLOUD_URL={}",
        hex::encode(ciphertext)
    );
    println!("cargo:rustc-env=CLOUD_URL_NONCE={}", hex::encode(nonce));
    println!("cargo:rustc-env=CLOUD_URL_KEY={}", hex::encode(key));
}

fn cloud_url_key() -> [u8; 32] {
    if let Ok(encoded) = std::env::var(CLOUD_URL_KEY_ENV) {
        let decoded = hex::decode(encoded.trim())
            .unwrap_or_else(|_| panic!("{CLOUD_URL_KEY_ENV} must be valid hexadecimal"));
        return decoded.try_into().unwrap_or_else(|bytes: Vec<u8>| {
            panic!(
                "{CLOUD_URL_KEY_ENV} must decode to 32 bytes, got {}",
                bytes.len()
            )
        });
    }

    let mut key = [0_u8; 32];
    getrandom::getrandom(&mut key).expect("failed to generate Cloud URL encryption key");
    key
}

#[cfg(target_os = "windows")]
fn add_windows_manifest() {
    let manifest = std::env::current_dir()
        .expect("build.rs cwd")
        .join("windows-app-manifest.xml");

    println!("cargo:rerun-if-changed={}", manifest.display());
    println!("cargo:rustc-link-arg=/MANIFEST:EMBED");
    println!("cargo:rustc-link-arg=/MANIFESTINPUT:{}", manifest.display());
    println!("cargo:rustc-link-arg=/WX");
}
