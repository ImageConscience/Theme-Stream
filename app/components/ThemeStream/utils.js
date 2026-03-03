/** Format UTC ISO string for datetime-local input in given timezone */
export function formatUTCForDateTimeInput(utcIso, timeZone) {
  if (!utcIso || !timeZone) return "";
  try {
    const s = new Date(utcIso).toLocaleString("sv-SE", { timeZone });
    return s.replace(" ", "T").slice(0, 16);
  } catch {
    return "";
  }
}

/** Format UTC ISO for display in given timezone */
export function formatUTCForDisplay(utcIso, timeZone) {
  if (!utcIso) return "";
  try {
    return new Date(utcIso).toLocaleString(undefined, { timeZone: timeZone || "UTC" });
  } catch {
    return "";
  }
}
