import { describe, expect, it } from "vitest";
import type { SessionArtifact } from "../services/tauri/chat";
import { getArtifactOpenTarget, getArtifactRevealTarget } from "./artifactOpen";

function artifact(partial: Partial<SessionArtifact>): SessionArtifact {
  return {
    id: "a1",
    session_id: "s1",
    name: "report.md",
    artifact_type: "file",
    uri: "",
    content_summary: "",
    source_tool: "app_control",
    created_at: "2026-08-05T08:00:00.000Z",
    ...partial,
  };
}

describe("getArtifactOpenTarget", () => {
  it("opens local file artifacts with the system default app", () => {
    expect(getArtifactOpenTarget(artifact({ uri: "file:///C:/Users/ZHOU/Desktop/report.md" }))).toEqual({
      kind: "local",
      target: "C:\\Users\\ZHOU\\Desktop\\report.md",
    });
  });

  it("opens web artifacts externally", () => {
    expect(getArtifactOpenTarget(artifact({ uri: "https://example.com/report" }))).toEqual({
      kind: "web",
      target: "https://example.com/report",
    });
  });

  it("falls back to preview when an artifact has no openable target", () => {
    expect(getArtifactOpenTarget(artifact({ uri: "" }))).toEqual({
      kind: "preview",
      target: "",
    });
  });

  it("only reveals local artifacts in the file manager", () => {
    expect(getArtifactRevealTarget(artifact({ uri: "file:///C:/Users/ZHOU/Desktop/report.md" }))).toBe(
      "C:\\Users\\ZHOU\\Desktop\\report.md",
    );
    expect(getArtifactRevealTarget(artifact({ uri: "https://example.com/report" }))).toBeNull();
  });
});
