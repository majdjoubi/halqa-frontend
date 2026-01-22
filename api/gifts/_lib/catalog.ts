export type GiftPackageId = 'pkg_1' | 'pkg_3' | 'pkg_6' | 'pkg_10';

export type GiftPackage = {
  id: GiftPackageId;
  lessons: number;
  priceUsd: number;
};

export const GIFT_PACKAGES: GiftPackage[] = [
  { id: 'pkg_1', lessons: 1, priceUsd: 10 },
  { id: 'pkg_3', lessons: 3, priceUsd: 27 },
  { id: 'pkg_6', lessons: 6, priceUsd: 51 },
  { id: 'pkg_10', lessons: 10, priceUsd: 80 },
];

export function getGiftPackage(packageId: string): GiftPackage | null {
  const pkg = GIFT_PACKAGES.find((p) => p.id === packageId);
  return pkg || null;
}

export function normalizeGiftText(value: unknown, maxLen: number): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}
