import { redirect } from "next/navigation";

import { resolveLeadListReturnHref } from "../../../lib/navigation-return";

interface RetiredPipelinePageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RetiredPipelinePage({
  searchParams,
}: RetiredPipelinePageProps) {
  const parameters = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === "string") {
      query.append(key, value);
    } else if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    }
  }

  redirect(resolveLeadListReturnHref(`/work-queue?${query.toString()}`, ""));
}
