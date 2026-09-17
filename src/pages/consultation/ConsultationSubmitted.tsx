import { useLocation, useParams } from "react-router-dom";

export default function ConsultationSubmitted() {
  const { id } = useParams();
  const location = useLocation();
  const accessToken = (location.state as { accessToken?: string } | null)?.accessToken;

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
      </div>
      <div className="kaaya-card">
        <h2 style={{ marginTop: 0 }}>Thank you</h2>
        <p>Your consultation has been submitted and will be reviewed by our team before your appointment.</p>
        {accessToken && id && (
          <p style={{ color: "var(--kaaya-text-muted)", fontSize: "0.9rem" }}>
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
