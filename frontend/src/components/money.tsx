import { currencyFormatter } from "../lib/sales";

export function Money({ value, currency }: { value: number; currency: string }) {
  const exact = currencyFormatter(currency).format(value);
  const readable = currencyFormatter(currency, Math.abs(value) >= 100_000).format(value);
  if (readable === exact) return <span className="money-value" title={exact}>{exact}</span>;
  return <span className="money-value" title={exact}>
    <span aria-hidden="true">{readable}</span><span className="sr-only">{exact}</span>
  </span>;
}