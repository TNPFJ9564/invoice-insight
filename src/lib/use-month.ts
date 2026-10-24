import { useNavigate, useSearch } from "@tanstack/react-router";
import { bangkokMonth } from "./monthly-data";

export function useMonth() {
  const search = useSearch({ strict: false }) as { month?: string };
  const navigate = useNavigate();
  const month = search.month ?? bangkokMonth();
  const setMonth = (value: string) => navigate({ to: ".", search: (old) => ({ ...old, month: value }), replace: true });
  return { month, setMonth };
}