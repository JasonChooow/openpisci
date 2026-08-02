/// Where the client looks for the platform. Not a secret, and never was: the
/// hostname is in the TLS SNI of the first packet and in any capture.
const DEFAULT_EDGE_URL: &str = "https://www.dimnuo.com";

/// Ed25519 public key, base64, that the discovery document must verify against.
/// This is the pin — the one thing in the binary that actually has to be right,
/// because it is what stops a tampered document redirecting the client to
/// somebody else's backend.
const DISCOVERY_PUBLIC_KEY_ENV: &str = "DIM_DISCOVERY_PUBLIC_KEY";

fn main() {
    embed_platform_config();

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

/// Embed the bootstrap address and the discovery signing key.
///
/// This replaces AES-encrypting the cloud URL into the binary. That scheme
/// emitted the decryption key alongside the ciphertext, so anyone holding the
/// binary held both halves — it hid the URL from `strings`, and from nothing
/// else. Meanwhile it cost a release every time an address moved, because the
/// address *was* the binary.
///
/// The property worth having is integrity, not concealment: a tampered
/// discovery document must not be able to point the client at someone else's
/// backend. That is what pinning the verification key below buys, and it is
/// the reason a missing key fails the build rather than defaulting.
fn embed_platform_config() {
    println!("cargo:rerun-if-env-changed={DISCOVERY_PUBLIC_KEY_ENV}");
    println!("cargo:rerun-if-env-changed=DIM_EDGE_URL");
    println!("cargo:rerun-if-env-changed=VITE_CLOUD_BASE_URL");

    let edge_url = std::env::var("DIM_EDGE_URL")
        .map(|value| value.trim().to_owned())
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| DEFAULT_EDGE_URL.to_owned());
    println!("cargo:rustc-env=DIM_EDGE_URL={edge_url}");

    let key = std::env::var(DISCOVERY_PUBLIC_KEY_ENV)
        .map(|value| value.trim().to_owned())
        .unwrap_or_default();

    // A release build with no pin would accept any document the network hands
    // it, which is strictly worse than the scheme this replaces. Debug builds
    // are allowed to run unpinned so a developer can point at a local stack.
    if key.is_empty() && std::env::var("PROFILE").as_deref() == Ok("release") {
        panic!(
            "{DISCOVERY_PUBLIC_KEY_ENV} must be set for a release build; without the \
             pin the client would accept any discovery document it is handed. Get it \
             from the gateway operator, not from the gateway itself."
        );
    }
    println!("cargo:rustc-env=DIM_DISCOVERY_PUBLIC_KEY={key}");
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
