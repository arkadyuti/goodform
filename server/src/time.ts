/**
 * Wall-clock resolution through an IANA timezone.
 *
 * Shared by the reminder scheduler and by request handling: both have to answer
 * the same question — what day and time is it *for this user* — and they must
 * not answer it differently.
 */
export function localParts(instant: Date, timezone: string): { date: string; time: string } {
  try {
    const date = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(instant);
    const time = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(instant);
    return { date, time };
  } catch {
    // An unknown zone should not stop every other user's reminders.
    return { date: instant.toISOString().slice(0, 10), time: instant.toISOString().slice(11, 16) };
  }
}
