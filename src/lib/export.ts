import * as XLSX from "xlsx";

export const INV_HEADERS = ["Timestamp", "Invoice No", "Company Name", "Tax ID", "Invoice Date", "Salesperson", "GPU Code", "TPU Code",
  "Product Name", "Quantity", "Unit", "Unit Price", "Total Price", "Grand Total", "Image URL", "Common name", "Status"];

export function flatten(invoices: any[]) {
  return invoices.flatMap((inv) => (inv.invoice_items ?? []).map((i: any) => [
    new Date(inv.created_at).toLocaleString("th-TH"), inv.invoice_no, inv.company_name, inv.tax_id, inv.invoice_date, inv.salesperson,
    i.gpu_code, i.tpu_code, i.product_name, i.quantity, i.unit, i.unit_price, i.total_price, inv.grand_total, inv.image_url, i.common_name, i.status,
  ]));
}

function download(blob: Blob, name: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export function exportData(invoices: any[], kind: "xlsx" | "csv" | "json") {
  const stamp = new Date().toISOString().slice(0, 10);
  if (kind === "json") return download(new Blob([JSON.stringify(invoices, null, 2)], { type: "application/json" }), `inventory-${stamp}.json`);
  const ws = XLSX.utils.aoa_to_sheet([INV_HEADERS, ...flatten(invoices)]);
  if (kind === "csv") return download(new Blob(["\uFEFF" + XLSX.utils.sheet_to_csv(ws)], { type: "text/csv" }), `inventory-${stamp}.csv`);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "INV");
  XLSX.writeFile(wb, `inventory-${stamp}.xlsx`);
}

export function driveThumb(url: string) {
  const id = url?.match(/\/d\/([^/]+)/)?.[1];
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1200` : url;
}
