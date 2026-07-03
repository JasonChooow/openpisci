import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tauriConfigPath = path.join(ROOT, "src-tauri", "tauri.conf.json");
const tauriConfig = JSON.parse(fs.readFileSync(tauriConfigPath, "utf8"));
const productName = String(tauriConfig.productName || "app").trim();
const version = String(tauriConfig.version || "").trim();

if (!version) {
  throw new Error("Missing version in src-tauri/tauri.conf.json");
}

const normalizedName = productName
  .replace(/\s+/g, "")
  .replace(/[^A-Za-z0-9._-]/g, "")
  .replace(/-+/g, "-")
  .replace(/^-|-$/g, "");

const nsisDir = path.join(ROOT, "target", "release", "bundle", "nsis");
if (!fs.existsSync(nsisDir)) {
  throw new Error(`NSIS bundle directory not found: ${nsisDir}`);
}

const exeFiles = fs
  .readdirSync(nsisDir)
  .filter((name) => name.toLowerCase().endsWith(".exe"))
  .map((name) => ({
    name,
    path: path.join(nsisDir, name),
    stat: fs.statSync(path.join(nsisDir, name)),
  }))
  .filter((file) => file.stat.isFile())
  .sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);

if (exeFiles.length === 0) {
  throw new Error(`No installer exe found in ${nsisDir}`);
}

const source = exeFiles.find((file) => !file.name.includes("-installer-")) ?? exeFiles[0];
const targetName = `${normalizedName}-installer-${version}.exe`;
const targetPath = path.join(nsisDir, targetName);

if (path.resolve(source.path) !== path.resolve(targetPath)) {
  fs.copyFileSync(source.path, targetPath);
}

console.log(targetPath);
