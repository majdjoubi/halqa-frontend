export type GiftPackageId = 'pkg_1' | 'pkg_3' | 'pkg_6' | 'pkg_10' | 'pkg_test';

export type GiftPackage = {
  id: GiftPackageId;
  lessons: number;
  priceUsd: number;
};

const BASE_GIFT_PACKAGES: GiftPackage[] = [
  { id: 'pkg_1', lessons: 1, priceUsd: 10 },
  { id: 'pkg_3', lessons: 3, priceUsd: 27 },
  { id: 'pkg_6', lessons: 6, priceUsd: 51 },
  { id: 'pkg_10', lessons: 10, priceUsd: 80 },
];

const TEST_GIFT_PACKAGE: GiftPackage = { id: 'pkg_test', lessons: 1, priceUsd: 1 };

function isTruthyEnv(name: string): boolean {
  const v = String(process.env[name] || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function isTestGiftPackageEnabled(): boolean {
  // Safety: keep disabled unless explicitly enabled.
  return isTruthyEnv('GIFTS_ENABLE_TEST_PACKAGE');
}

export function getGiftPackages(): GiftPackage[] {
  return isTestGiftPackageEnabled() ? [...BASE_GIFT_PACKAGES, TEST_GIFT_PACKAGE] : [...BASE_GIFT_PACKAGES];
}

export function getRedeemPackageIdForGiftPackageId(packageId: string): string {
  // In test mode we allow mapping the $1 test package to a real Halqa package.
  // This prevents needing to add a new package in the Halqa backend.
  if (packageId === 'pkg_test') {
    const fallback = String(process.env['GIFTS_TEST_REDEEM_PACKAGE_ID'] || 'pkg_1').trim();
    return fallback || 'pkg_1';
  }
  return packageId;
}

export function getGiftPackage(packageId: string): GiftPackage | null {
  const pkg = getGiftPackages().find((p) => p.id === packageId);
  return pkg || null;
}

export function normalizeGiftText(value: unknown, maxLen: number): string | null {
  const s = String(value ?? '').trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}
