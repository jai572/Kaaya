import { describe, it, expect } from "vitest";
import {
  categoryLabel,
  slugify,
  parsePriceToPence,
  penceToInput,
  toTimeInput,
  shortTime,
  locationTag,
  addDays,
  shortDate,
  nextFreeColour,
  STAFF_COLOURS,
} from "./staffFormat";

describe("categoryLabel / slugify", () => {
  it("turns slugs into readable labels", () => {
    expect(categoryLabel("eyelash-extensions")).toBe("Eyelash extensions");
    expect(categoryLabel("threading")).toBe("Threading");
    expect(categoryLabel("")).toBe("Other");
  });

  it("turns labels into slugs", () => {
    expect(slugify("Brows & Lashes")).toBe("brows-lashes");
    expect(slugify("  Henna  Brow ")).toBe("henna-brow");
  });
});

describe("parsePriceToPence", () => {
  it("accepts pounds with or without pence and a £ sign", () => {
    expect(parsePriceToPence("12")).toBe(1200);
    expect(parsePriceToPence("12.5")).toBe(1250);
    expect(parsePriceToPence("£12.50")).toBe(1250);
    expect(parsePriceToPence("0")).toBe(0);
  });

  it("rejects anything that isn't a money amount", () => {
    expect(parsePriceToPence("")).toBeNull();
    expect(parsePriceToPence("12.505")).toBeNull();
    expect(parsePriceToPence("-3")).toBeNull();
    expect(parsePriceToPence("ten")).toBeNull();
  });

  it("round-trips through penceToInput", () => {
    expect(penceToInput(1250)).toBe("12.50");
    expect(parsePriceToPence(penceToInput(3799))).toBe(3799);
  });
});

describe("times", () => {
  it("formats DB times for inputs and display", () => {
    expect(toTimeInput("09:00:00")).toBe("09:00");
    expect(toTimeInput(null)).toBe("");
    expect(shortTime("09:00:00")).toBe("9:00");
    expect(shortTime("17:30")).toBe("17:30");
  });
});

describe("locationTag", () => {
  it("abbreviates location names for dense grids", () => {
    expect(locationTag("Bon Accord Centre")).toBe("BA");
    expect(locationTag("Location 2")).toBe("L2");
    expect(locationTag("Union Square")).toBe("US");
  });
});

describe("dates", () => {
  it("adds days across month ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-11-01", -1)).toBe("2026-10-31");
  });

  it("formats a short date", () => {
    expect(shortDate("2026-10-20")).toBe("Tue 20 Oct");
  });
});

describe("nextFreeColour", () => {
  it("skips colours already in use, case-insensitively", () => {
    expect(nextFreeColour([])).toBe(STAFF_COLOURS[0]);
    expect(nextFreeColour([STAFF_COLOURS[0].toUpperCase(), null])).toBe(STAFF_COLOURS[1]);
  });

  it("wraps around when every colour is taken", () => {
    expect(STAFF_COLOURS).toContain(nextFreeColour([...STAFF_COLOURS]));
  });
});
