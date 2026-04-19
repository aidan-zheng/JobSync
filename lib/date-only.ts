function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

export function getLocalDateInputValue(date = new Date()) {
  return [
    date.getFullYear(),
    padDatePart(date.getMonth() + 1),
    padDatePart(date.getDate()),
  ].join("-");
}

export function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12);
}

export function formatDateOnly(
  value: string | null | undefined,
  options: Intl.DateTimeFormatOptions,
) {
  if (!value) return "N/A";

  const parsed = parseDateOnly(value);
  if (!parsed) return value;

  return parsed.toLocaleDateString("en-US", options);
}
