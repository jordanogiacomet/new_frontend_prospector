export const UNAVAILABLE_LABEL = "Não disponível";

const CNPJ_PATTERN = /^\d{14}$/;
const ISO_UTC_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z$/;

const brazilianDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "America/Sao_Paulo",
});

const brlCurrencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

function isValidIsoUtcTimestamp(value: string): boolean {
  const match = ISO_UTC_PATTERN.exec(value);

  if (!match) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const isLeapYear =
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysByMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysByMonth[month - 1] &&
    hour >= 0 &&
    hour <= 23 &&
    minute >= 0 &&
    minute <= 59 &&
    second >= 0 &&
    second <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

export function formatCnpj(value: string | null): string {
  if (typeof value !== "string" || !CNPJ_PATTERN.test(value)) {
    return UNAVAILABLE_LABEL;
  }

  return value.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}

export function formatBrazilianDate(value: string | null): string {
  if (typeof value !== "string" || !isValidIsoUtcTimestamp(value)) {
    return UNAVAILABLE_LABEL;
  }

  return brazilianDateFormatter.format(new Date(value));
}

export function formatBrlCurrency(value: number | null): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return UNAVAILABLE_LABEL;
  }

  return brlCurrencyFormatter.format(value);
}

export function formatScore(value: number | null): string {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 100
  ) {
    return UNAVAILABLE_LABEL;
  }

  return String(value);
}
