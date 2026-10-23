"use client";

/** Formats a timestamp in the viewer's locale and time zone (the server's may differ). */
export function LocalTime({
  date,
  options = { dateStyle: "medium", timeStyle: "short" },
}: {
  date: Date | string;
  options?: Intl.DateTimeFormatOptions;
}) {
  const d = new Date(date);
  return (
    <time dateTime={d.toISOString()} suppressHydrationWarning>
      {d.toLocaleString(undefined, options)}
    </time>
  );
}
