// Pure checks behind the warnings on staff files. Dates are YYYY-MM-DD
// strings, so plain string comparison orders them correctly.

type RecordLike = {
  date_of_birth?: string | null;
  beauty_experience_since?: string | null;
  right_to_work_type?: string | null;
  right_to_work_checked_on?: string | null;
  right_to_work_expires_on?: string | null;
} | null;

type DocLike = { kind: string; expires_on?: string | null };

const WARN_DAYS = 60;

function addYears(date: string, years: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return `${String(y + years).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** The insurer only covers beauty work by someone 18+ with over a year's
 * continuous experience, unless they're directly supervised. null = not
 * enough information recorded to say. */
export function clearedToWorkAlone(record: RecordLike, today: string): boolean | null {
  if (!record?.date_of_birth || !record.beauty_experience_since) return null;
  const adult = addYears(record.date_of_birth, 18) <= today;
  const experienced = addYears(record.beauty_experience_since, 1) < today;
  return adult && experienced;
}

export function staffFileAlerts(record: RecordLike, docs: DocLike[], today: string): string[] {
  const alerts: string[] = [];
  const soon = addDays(today, WARN_DAYS);

  if (!record?.right_to_work_checked_on) alerts.push("Right-to-work check not recorded");
  if (!docs.some((d) => d.kind === "right_to_work")) alerts.push("No right-to-work document uploaded");
  const rtwExpiry = record?.right_to_work_expires_on;
  if (rtwExpiry && rtwExpiry < today) alerts.push(`Right to work expired on ${rtwExpiry}`);
  else if (rtwExpiry && rtwExpiry <= soon) alerts.push(`Right to work expires on ${rtwExpiry}: re-check before then`);

  const cleared = clearedToWorkAlone(record, today);
  if (cleared === null) alerts.push("Date of birth or experience start not recorded");
  else if (!cleared) alerts.push("Must be supervised: insurer requires 18+ and over 1 year's experience");

  for (const d of docs) {
    if (d.kind === "right_to_work" || !d.expires_on) continue;
    if (d.expires_on < today) alerts.push(`A ${d.kind === "id" ? "ID document" : d.kind} expired on ${d.expires_on}`);
    else if (d.expires_on <= soon) alerts.push(`A ${d.kind === "id" ? "ID document" : d.kind} expires on ${d.expires_on}`);
  }
  return alerts;
}
