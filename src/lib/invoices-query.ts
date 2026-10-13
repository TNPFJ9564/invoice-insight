import { queryOptions } from "@tanstack/react-query";
import { listInvoices } from "./inventory.functions";

export const invoicesQuery = queryOptions({ queryKey: ["invoices"], queryFn: () => listInvoices() });
