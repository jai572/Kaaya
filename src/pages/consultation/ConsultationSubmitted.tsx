import { useLocation, useParams } from "react-router-dom";
import type { ClientDecision } from "@shared/types";

export default function ConsultationSubmitted() {
  const { id } = useParams();
  const location = useLocation();
  const state = location.state as { accessToken?: string; decision?: ClientDecision } | null;
  const accessToken = state?.accessToken;
  const declined = state?.decision === "decline";

  return (
    <div className="kaaya-shell">
      <div className="kaaya-card" style={{ textAlign: "center", paddingTop: 32, paddingBottom: 32 }}>
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "var(--kaaya-accent)",
            color: "white",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "1.6rem",
            margin: "0 auto 20px",
          }}
        >
          ✓
        </div>
        <h2 style={{ marginTop: 0 }}>Thank you</h2>
        <p style={{ maxWidth: 380, margin: "0 auto 8px" }}>Your consultation has been submitted to Kaaya.</p>
        {declined ? (
          <p style={{ maxWidth: 380, margin: "0 auto", color: "var(--kaaya-text-muted)" }}>
            We've recorded that you don't wish to continue with your appointment at this time. If you change your
            mind, please contact Kaaya directly.
          </p>
        ) : (
          <p style={{ maxWidth: 380, margin: "0 auto", color: "var(--kaaya-text-muted)" }}>
            Our team will review your information before your appointment, and may be in touch if anything needs
            checking. You don't need to submit this again unless we ask you to.
          </p>
        )}
        {accessToken && id && (
          <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.85rem", marginTop: 24 }}>
            Keep this link to view your submission later:
            <br />
            <code style={{ wordBreak: "break-all" }}>
              {window.location.origin}/c/{id}?token={accessToken}
            </code>
          </p>
        )}
      </div>
    </div>
  );
}
