fn main() {
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
