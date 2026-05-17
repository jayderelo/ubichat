import { queryOptions } from "@tanstack/react-query";
import { getCreditLimitSummary } from "#/lib/credit-limit-functions.ts";

export const creditLimitSummaryQueryKey = ["credit-limit-summary"] as const;

export function creditLimitSummaryQueryOptions() {
  return queryOptions({
    queryFn: () => getCreditLimitSummary(),
    queryKey: creditLimitSummaryQueryKey,
  });
}
