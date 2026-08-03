// Canonical business-identity configuration for lancee.
//
// lancee is a product, brand, or trading division operated by the South
// African company Hookitup Pty (Ltd). This module is the single source of
// truth for the business-identity shape and its defaults. It is shared by:
//   - the client  (Vite)  via src/lib/business.ts, which feeds it import.meta.env
//   - the server  (Node)  via server/business.mjs, which feeds it process.env
//
// Per the platform's legal requirements, unknown company information
// (registration numbers, VAT number, registered address, contact emails) is
// NOT hardcoded. Each unknown field is read from a validated environment
// variable and defaults to an empty placeholder ('') until the operator
// configures it. Known facts (brand name, operating legal entity, South
// African jurisdiction, ZAR) are provided as documented defaults.

export const BUSINESS_ENV_KEYS = [
  'PLATFORM_NAME',
  'PLATFORM_LEGAL_STYLE',
  'LEGAL_ENTITY_NAME',
  'COMPANY_REGISTRATION_NUMBER',
  'VAT_REGISTRATION_NUMBER',
  'REGISTERED_ADDRESS',
  'SUPPORT_EMAIL',
  'LEGAL_EMAIL',
  'INFORMATION_OFFICER_EMAIL',
  'JURISDICTION',
  'COUNTRY_CODE',
  'CURRENCY',
  'VAT_REGISTERED',
]

function envString(env, key, fallback) {
  const value = String(env?.[key] ?? '').trim()
  return value.length ? value : fallback
}

function envBoolean(env, key, fallback) {
  const value = String(env?.[key] ?? '').trim().toLowerCase()
  if (value === 'true' || value === '1') return true
  if (value === 'false' || value === '0') return false
  return fallback
}

function envEmail(env, key) {
  const value = envString(env, key, '')
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value : ''
}

function envCountryCode(env, key, fallback) {
  const value = envString(env, key, fallback).toUpperCase()
  return /^[A-Z]{2}$/.test(value) ? value : fallback
}

function envCurrency(env, key, fallback) {
  const value = envString(env, key, fallback).toUpperCase()
  return /^[A-Z]{3}$/.test(value) ? value : fallback
}

export function loadBusinessIdentity(env) {
  return {
    platformName: envString(env, 'PLATFORM_NAME', 'lancee'),
    platformLegalStyle: envString(
      env,
      'PLATFORM_LEGAL_STYLE',
      'lancee, operated by Hookitup Pty (Ltd)',
    ),
    legalEntityName: envString(env, 'LEGAL_ENTITY_NAME', 'Hookitup Pty (Ltd)'),
    companyRegistrationNumber: envString(env, 'COMPANY_REGISTRATION_NUMBER', ''),
    vatRegistrationNumber: envString(env, 'VAT_REGISTRATION_NUMBER', ''),
    registeredAddress: envString(env, 'REGISTERED_ADDRESS', ''),
    supportEmail: envEmail(env, 'SUPPORT_EMAIL'),
    legalEmail: envEmail(env, 'LEGAL_EMAIL'),
    informationOfficerEmail: envEmail(env, 'INFORMATION_OFFICER_EMAIL'),
    jurisdiction: envString(env, 'JURISDICTION', 'South Africa'),
    countryCode: envCountryCode(env, 'COUNTRY_CODE', 'ZA'),
    currency: envCurrency(env, 'CURRENCY', 'ZAR'),
    isVatRegistered: envBoolean(env, 'VAT_REGISTERED', false),
  }
}
