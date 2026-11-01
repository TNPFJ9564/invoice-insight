import { queryOptions } from "@tanstack/react-query";
import { listInvoices } from "./inventory.functions";
import { MONTH_PATTERN, bangkokMonth } from "./monthly-data";

export const invoicesQuery = (month: string) => queryOptions({ queryKey: ["invoices", month], queryFn: () => listInvoices({ data: { month } }) });

export const monthSearch = (s: Record<string, unknown>): { month?: string } =>
  typeof s["month"] === "string" && MONTH_PATTERN.test(s["month"]) ? { month: s["month"] } : {};
export const monthDeps = ({ search }: { search: { month?: string } }) => ({ month: search.month ?? bangkokMonth() });
