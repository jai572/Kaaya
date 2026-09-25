import { useState } from "react";
import { useLocation } from "react-router-dom";
import { staffSendFeedback, type FeedbackKind } from "../../lib/api";
import { Drawer, Segmented, errorMessage } from "./ui";

const KINDS: { value: FeedbackKind; label: string }[] = [
  { value: "problem", label: "Something's wrong" },
  { value: "confusing", label: "Confusing" },
  { value: "idea", label: "Idea" },
  { value: "good", label: "Works well" },
];

const NAME_KEY = "kaaya.staff.feedback.name";

export default function FeedbackDrawer({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const [kind, setKind] = useState<FeedbackKind>("problem");
  const [message, setMessage] = useState("");
  const [name, setName] = useState(() => {
    try {
      return window.localStorage.getItem(NAME_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await staffSendFeedback({ kind, message, tester_name: name.trim() || null, page_path: location.pathname + location.search });
      try {
        window.localStorage.setItem(NAME_KEY, name.trim());
      } catch {
        // remembered on this device only
      }
      setMessage("");
      setSent((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e, "Could not send — please try again"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      title="Give feedback"
      onClose={onClose}
      footer={
        <>
          <button type="button" className="st-btn st-btn--ghost" onClick={onClose} disabled={busy}>
            Close
          </button>
          <button type="button" className="st-btn" onClick={send} disabled={busy || message.trim().length < 3}>
            {busy ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      <p className="st-hint">
        Tell us anything — a bug, something slow or confusing, or what works. We record which page you were on, so just describe what you did and
        what happened.
      </p>
      <div className="st-field">
        <span className="st-label">What kind?</span>
        <Segmented label="Feedback type" value={kind} options={KINDS} onChange={setKind} />
      </div>
      <div className="st-field">
        <label htmlFor="fb-message">What happened?</label>
        <textarea
          id="fb-message"
          className="st-input st-textarea"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. I booked Raisha at 2pm, pressed Book, and the calendar didn't show it until I refreshed."
        />
      </div>
      <div className="st-field">
        <label htmlFor="fb-name">Your name</label>
        <input id="fb-name" className="st-input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {sent > 0 && (
        <p className="st-note" role="status">
          Thank you — {sent === 1 ? "your feedback was" : `${sent} notes were`} sent. Add more any time.
        </p>
      )}
      {error && <p className="st-error">{error}</p>}
    </Drawer>
  );
}
