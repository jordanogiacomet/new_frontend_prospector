import type { LeadWorkspaceDto } from "../types/commercial";
import { formatBrazilianDate, UNAVAILABLE_LABEL } from "./formatters";

export type CommercialFollowUpStatus =
  | "overdue"
  | "today"
  | "scheduled"
  | "unscheduled"
  | "closed";

const businessDateFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "America/Sao_Paulo",
});

type FollowUpWorkspace = Pick<
  LeadWorkspaceDto,
  "commercial_stage" | "next_action_due_at" | "archived_at"
>;

function businessDateKey(date: Date): string {
  const parts = businessDateFormatter.formatToParts(date);
  const part = (type: string) =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function getCommercialFollowUpStatus(
  workspace: FollowUpWorkspace | null,
  now: Date = new Date(),
): CommercialFollowUpStatus {
  if (workspace === null) return "unscheduled";
  if (
    workspace.archived_at !== null ||
    workspace.commercial_stage === "CLOSED_WON" ||
    workspace.commercial_stage === "CLOSED_LOST"
  ) {
    return "closed";
  }

  const dueAt = workspace.next_action_due_at;
  if (dueAt === null || formatBrazilianDate(dueAt) === UNAVAILABLE_LABEL) {
    return "unscheduled";
  }

  const dueDate = businessDateKey(new Date(dueAt));
  const today = businessDateKey(now);
  return dueDate < today ? "overdue" : dueDate === today ? "today" : "scheduled";
}

export function getFollowUpDateInputValue(
  daysAhead: 0 | 1 | 7,
  now: Date = new Date(),
): string {
  const [year, month, day] = businessDateKey(now).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + daysAhead, 12));
  return date.toISOString().slice(0, 10);
}
