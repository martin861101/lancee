// Type declaration for shared/business.mjs — the canonical, typed
// business-identity configuration. Kept next to the implementation so the
// client (Vite, via src/lib/business.ts) gets full typing.

export interface BusinessIdentity {
  platformName: string
  platformLegalStyle: string
  legalEntityName: string
  companyRegistrationNumber?: string
  vatRegistrationNumber?: string
  registeredAddress?: string
  supportEmail?: string
  legalEmail?: string
  informationOfficerEmail?: string
  jurisdiction: string
  countryCode: string
  currency: string
  isVatRegistered: boolean
}

export const BUSINESS_ENV_KEYS: string[]

export function loadBusinessIdentity(
  env: Record<string, string | undefined>,
): BusinessIdentity
