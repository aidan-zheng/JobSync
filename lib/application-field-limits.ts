export const APPLICATION_TEXT_LIMITS = {
  job_url: 2048,
  pasted_text: 50000,
  company_name: 80,
  job_title: 150,
  location: 120,
  contact_person: 100,
  notes: 1500,
} as const;

export type LimitedApplicationTextField = keyof typeof APPLICATION_TEXT_LIMITS;

export function getLimitedTextValue(
  field: LimitedApplicationTextField,
  value: string,
) {
  return value.slice(0, APPLICATION_TEXT_LIMITS[field]);
}

export function isWithinTextLimit(
  field: LimitedApplicationTextField,
  value: string,
) {
  return value.length <= APPLICATION_TEXT_LIMITS[field];
}
