import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { staffListFiles } from "../../lib/api";
import { PageHead, errorMessage } from "../../components/staff/ui";

type Row = Awaited<ReturnType<typeof staffListFiles>>["staff"][number];

export default function StaffFiles() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    staffListFiles()
      .then((res) => setRows(res.staff))
      .catch((e) => setError(errorMessage(e, "Could not load staff files")));
  }, []);

  return (
    <div className="st-page">
      <PageHead title="Staff files" subtitle="Private: ID, right to work, contact details, CVs and qualifications" />
      {error && (
        <p className="st-error">
          {error.includes("permission") ? "You don't have permission to see staff files." : error}
        </p>
      )}
      {rows && (
        <div className="st-card">
          <div className="st-table-wrap">
            <table className="st-table">
              <thead>
                <tr>
                  <th>Staff member</th>
                  <th>Documents</th>
                  <th>Needs attention</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <Link to={`/staff/files/${r.id}`}>{r.display_name}</Link>
                      {!r.active && <span className="st-muted"> (inactive)</span>}
                    </td>
                    <td className="st-num">{r.document_count}</td>
                    <td>
                      {r.alerts.length === 0 ? (
                        <span className="st-chip st-chip--ok">Complete</span>
                      ) : (
                        r.alerts.map((a) => (
                          <div key={a}>
                            <span className="st-chip st-chip--warn">{a}</span>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <span className="st-hint">
        Every time a file is opened or a document downloaded, it's recorded with who did it and when.
      </span>
    </div>
  );
}
