import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ModelsSection from "./ModelsSection";

const update = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("../../SettingsHub/useSettingsForm", () => ({
  useSettingsForm: () => ({
    form: {
      vision_enabled: false,
      enable_streaming: true,
      max_tokens: 8192,
      context_window: 0,
    },
    update,
  }),
}));

beforeEach(() => {
  update.mockClear();
});

describe("ModelsSection", () => {
  it("shows only the official cloud provider and no local provider credential controls", () => {
    render(<ModelsSection />);

    expect(screen.getByText("官方云端")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Anthropic|OpenAI|DeepSeek|Qwen|MiniMax|智谱|Kimi/i)).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
  });

  it("preserves unrelated vision, streaming, and token controls", () => {
    render(<ModelsSection />);

    fireEvent.click(screen.getByLabelText("settings.visionEnabled"));
    fireEvent.change(screen.getByLabelText("settings.maxTokens"), { target: { value: "4096" } });

    expect(update).toHaveBeenCalledWith("vision_enabled", true);
    expect(update).toHaveBeenCalledWith("max_tokens", 4096);
    expect(screen.getByLabelText("settings.enableStreaming")).toBeChecked();
    expect(screen.getByLabelText("settings.contextWindow")).toBeInTheDocument();
  });
});
