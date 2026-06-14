import Chat from "../Chat";
import "./AssistantPage.css";

/** Assistant page — IM channels only (no main chat / CLI tabs). */
export default function AssistantPage() {
  return (
    <div className="assistant-page">
      <Chat variant="im" />
    </div>
  );
}
