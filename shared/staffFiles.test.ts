import { describe, expect, it } from "vitest";
import { clearedToWorkAlone, staffFileAlerts } from "./staffFiles";

const today = "2026-10-07";
const complete = {
  date_of_birth: "1990-01-01",
  beauty_experience_since: "2020-01-01",
  right_to_work_type: "share_code",
  right_to_work_checked_on: "2026-01-10",
  right_to_work_expires_on: "2028-01-01",
};

describe("clearedToWorkAlone", () => {
  it("needs both age and experience recorded", () => {
    expect(clearedToWorkAlone(null, today)).toBeNull();
    expect(clearedToWorkAlone({ date_of_birth: "1990-01-01" }, today)).toBeNull();
  });
  it("requires 18 or over", () => {
    expect(clearedToWorkAlone({ ...complete, date_of_birth: "2008-10-08" }, today)).toBe(false);
    expect(clearedToWorkAlone({ ...complete, date_of_birth: "2008-10-07" }, today)).toBe(true);
  });
  it("requires more than one year's experience", () => {
    expect(clearedToWorkAlone({ ...complete, beauty_experience_since: "2025-10-07" }, today)).toBe(false);
    expect(clearedToWorkAlone({ ...complete, beauty_experience_since: "2025-10-06" }, today)).toBe(true);
  });
});

describe("staffFileAlerts", () => {
  it("is clean for a complete file", () => {
    expect(staffFileAlerts(complete, [{ kind: "right_to_work" }], today)).toEqual([]);
  });
  it("flags a missing file", () => {
    expect(staffFileAlerts(null, [], today)).toEqual([
      "Right-to-work check not recorded",
      "No right-to-work document uploaded",
      "Date of birth or experience start not recorded",
    ]);
  });
  it("warns before right to work runs out and when it has", () => {
    const docs = [{ kind: "right_to_work" }];
    expect(staffFileAlerts({ ...complete, right_to_work_expires_on: "2026-11-01" }, docs, today)).toEqual([
      "Right to work expires on 2026-11-01: re-check before then",
    ]);
    expect(staffFileAlerts({ ...complete, right_to_work_expires_on: "2026-10-01" }, docs, today)).toEqual([
      "Right to work expired on 2026-10-01",
    ]);
  });
  it("flags expiring qualifications", () => {
    const docs = [{ kind: "right_to_work" }, { kind: "qualification", expires_on: "2026-10-20" }];
    expect(staffFileAlerts(complete, docs, today)).toEqual(["A qualification expires on 2026-10-20"]);
  });
});
