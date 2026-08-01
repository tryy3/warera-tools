const MEDIA_BASE = "https://media.warera.io";
const ITEM_VERSION = 33;
const FLAG_VERSION = 16;

export function wareraItemUrl(itemCode: string): string {
  return `${MEDIA_BASE}/images/items/${itemCode}.png?v=${ITEM_VERSION}`;
}

export function wareraFlagUrl(isoOrCountryCode: string): string {
  return `${MEDIA_BASE}/images/flags/${isoOrCountryCode.toLowerCase()}.svg?v=${FLAG_VERSION}`;
}
