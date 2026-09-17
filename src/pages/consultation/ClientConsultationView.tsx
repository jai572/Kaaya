import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getClientConsultation } from "../../lib/api";

type ConsultationView = {
  id: string;
  status: string;
  submitted_at: string | null;
  treatments: { id: string; name: string }[];
  signature: { legal_name: string; signed_at: string } | null;
};

export default function ClientConsultationView() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<ConsultationView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) {
      setError("Missing link details.");
      return;
    }
    getClientConsultation(id, token)
      .then((res) => setData(res as ConsultationView))
      .catch(() => setError("We couldn't find that consultation. Please check your link."));
  }, [id, token]);

  return (
    <div className="kaaya-shell">
      <div className="kaaya-header">
        <h1>Kaaya</h1>
        <p>Your consultation</p>
      </div>
      {error && <p className="kaaya-error">{error}</p>}
      {data && (
        <div className="kaaya-card">
          <p>
            Status: <strong>{data.status.replace(/_/g, " ")}</strong>
          </p>
          <p>Submitted: {data.submitted_at ? new Date(data.submitted_at).toLocaleString() : "—"}</p>
          <p>Treatments: {data.treatments.map((t) => t.name).join(", ") || "—"}</p>
          {data.signature && <p>Signed by: {data.signature.legal_name}</p>}
        </div>
      )}
    </div>
  );
}
