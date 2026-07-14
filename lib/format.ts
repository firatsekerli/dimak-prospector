// Strip all non-digits from a phone and build a wa.me link (per reference/app.py).
export function waLink(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits ? `https://wa.me/${digits}` : "";
}
