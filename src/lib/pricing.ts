import type { PricingRegion } from './api'

export const REGION_CURRENCY: Record<PricingRegion, { currency: string; locale: string }> = {
  ZA: { currency: 'ZAR', locale: 'en-ZA' },
  US: { currency: 'USD', locale: 'en-US' },
  UK: { currency: 'GBP', locale: 'en-GB' },
  OTHER: { currency: 'USD', locale: 'en-US' },
}

export function detectPricingRegion(
  workspaceCountry: string | null | undefined,
  fallbackLocale?: string,
  fallbackTimeZone?: string,
): PricingRegion {
  const normalizedCountry = String(workspaceCountry || '').trim().toLowerCase()
  if (normalizedCountry) {
    if (['south africa', 'za', 'south-africa'].includes(normalizedCountry)) return 'ZA'
    if (['united states', 'usa', 'us', 'united-states'].includes(normalizedCountry)) return 'US'
    if (['united kingdom', 'uk', 'gb', 'britain', 'england'].includes(normalizedCountry)) return 'UK'
  }

  // 1) Timezone is the most reliable signal for physical location (e.g. SA user with en-US language still -> ZAR)
  const timeZone =
    fallbackTimeZone ??
    (typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : '') ??
    ''
  const tz = String(timeZone || '').trim().toLowerCase()
  if (tz) {
    if (tz === 'africa/johannesburg' || tz.includes('johannesburg')) return 'ZA'
    // Africa/Johannesburg is the only SA zone; avoid mapping all Africa/* to ZA (e.g. Lagos, Nairobi)
    if (tz === 'europe/london' || tz === 'europe/guernsey' || tz === 'europe/jersey' || tz === 'europe/isle_of_man') return 'UK'
    if (tz.startsWith('america/') || tz.startsWith('us/')) return 'US'
    if (tz === 'pacific/honolulu') return 'US'
  }

  // 2) Locale / language: check navigator.languages + fallbackLocale
  const candidates: string[] = []
  if (fallbackLocale) candidates.push(fallbackLocale)
  if (typeof navigator !== 'undefined') {
    const langs = (navigator as unknown as { languages?: string[] }).languages
    if (Array.isArray(langs)) candidates.push(...langs)
    if (navigator.language) candidates.push(navigator.language)
  }
  if (candidates.length === 0) candidates.push('en-ZA')

  const regionFromLocale = (raw: string): PricingRegion | null => {
    const lower = String(raw || '').trim().toLowerCase()
    if (!lower) return null
    // Direct suffix check: en-ZA, en-GB, en-US
    const parts = lower.split('-')
    const suffix = parts[1]?.toLowerCase()
    if (suffix === 'za') return 'ZA'
    if (suffix === 'gb' || suffix === 'uk') return 'UK'
    if (suffix === 'us') return 'US'
    // Bare codes
    if (lower === 'za') return 'ZA'
    if (lower === 'en-za') return 'ZA'
    if (lower === 'en-gb' || lower === 'en-uk') return 'UK'
    if (lower === 'en-us') return 'US'
    return null
  }

  for (const cand of candidates) {
    const hit = regionFromLocale(cand)
    if (hit) return hit
  }

  // No explicit region in locale -> fall back to OTHER (USD) except when timezone already handled
  // Check language without region: plain "en" should not force US; return OTHER so pricing defaults to USD list but server IP can override
  return 'OTHER'
}

export function formatPrice(amount: number, currency: string, locale?: string) {
  try {
    return new Intl.NumberFormat(locale || 'en', {
      style: 'currency',
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return `${currency} ${amount.toFixed(2)}`
  }
}

export function formatPriceAmount(amount: number, currency: string, locale?: string) {
  try {
    return new Intl.NumberFormat(locale || 'en', {
      style: 'currency',
      currency,
      currencyDisplay: 'symbol',
      maximumFractionDigits: 2,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  } catch {
    return new Intl.NumberFormat('en', {
      maximumFractionDigits: 2,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  }
}
