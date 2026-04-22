export function parseOptionalNumber(value: unknown): number | null | undefined {
  if (value === "" || value == null) {
    return null;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function isNonNegativeNumber(value: number | null): boolean {
  return value == null || value >= 0;
}

export const INVALID_SALARY_INPUT_ERROR =
  "Invalid salary input. Enter a valid number or leave the field empty.";

export const NON_NEGATIVE_SALARY_ERROR =
  "Salary / hour must be zero or greater.";

export function getSalaryValidationError(
  value: number | null | undefined,
): string | null {
  if (value === undefined) {
    return INVALID_SALARY_INPUT_ERROR;
  }

  if (!isNonNegativeNumber(value)) {
    return NON_NEGATIVE_SALARY_ERROR;
  }

  return null;
}
