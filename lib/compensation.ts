import type { SalaryType } from "@/types/applications";
import { SALARY_TYPE_LABELS } from "@/types/applications";

export const SALARY_TYPES: SalaryType[] = [
  "hourly",
  "weekly",
  "biweekly",
  "monthly",
  "yearly",
];

const SALARY_TYPE_SUFFIXES: Record<SalaryType, string> = {
  hourly: "/ hour",
  weekly: "/ week",
  biweekly: "/ 2 weeks",
  monthly: "/ month",
  yearly: "/ year",
};

const SALARY_TYPE_PLACEHOLDERS: Record<SalaryType, string> = {
  hourly: "e.g. 45",
  weekly: "e.g. 1800",
  biweekly: "e.g. 3600",
  monthly: "e.g. 7500",
  yearly: "e.g. 120000",
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function isSalaryType(value: unknown): value is SalaryType {
  return (
    value === "hourly" ||
    value === "weekly" ||
    value === "biweekly" ||
    value === "monthly" ||
    value === "yearly"
  );
}

export function formatCompensation(
  amount: number | null,
  salaryType: SalaryType | null,
) {
  if (amount == null) {
    return "N/A";
  }

  const formattedAmount = formatCurrency(amount);
  if (!salaryType) {
    return formattedAmount;
  }

  return `${formattedAmount} ${SALARY_TYPE_SUFFIXES[salaryType]}`;
}

export function formatCompensationAmount(amount: number | null) {
  if (amount == null) {
    return "N/A";
  }

  return formatCurrency(amount);
}

export function getCompensationFieldLabel(salaryType: SalaryType | null) {
  if (!salaryType) {
    return "Compensation";
  }

  return `${SALARY_TYPE_LABELS[salaryType]} Compensation`;
}

export function getCompensationPlaceholder(salaryType: SalaryType | null) {
  if (!salaryType) {
    return "e.g. 45";
  }

  return SALARY_TYPE_PLACEHOLDERS[salaryType];
}
