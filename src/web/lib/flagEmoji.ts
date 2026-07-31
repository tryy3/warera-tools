export function flagEmojiFromIso(isoCode: string | null | undefined): string {
  if (!isoCode) return "";
  const upper = isoCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(upper)) return "";
  const A = 0x1f1e6;
  const chars = [...upper].map((ch) => String.fromCodePoint(A + (ch.charCodeAt(0) - 65)));
  return chars.join("");
}
