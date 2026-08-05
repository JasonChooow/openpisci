import type { SessionArtifact } from "../services/tauri/chat";
import { isLocalPath, uriToNativePath } from "./linkify";

export type ArtifactOpenTarget =
  | { kind: "local"; target: string }
  | { kind: "web"; target: string }
  | { kind: "preview"; target: string };

function isWebUri(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function getArtifactOpenTarget(artifact: SessionArtifact): ArtifactOpenTarget {
  const uri = (artifact.uri ?? "").trim();
  if (!uri) return { kind: "preview", target: "" };
  if (isWebUri(uri)) return { kind: "web", target: uri };
  if (isLocalPath(uri)) return { kind: "local", target: uriToNativePath(uri) };
  return { kind: "preview", target: uri };
}

export function getArtifactRevealTarget(artifact: SessionArtifact): string | null {
  const target = getArtifactOpenTarget(artifact);
  return target.kind === "local" ? target.target : null;
}
