import {
  BUSINESS_ENV_KEYS,
  loadBusinessIdentity,
  type BusinessIdentity,
} from '../../shared/business.mjs'

export type { BusinessIdentity }

const identityEnv: Record<string, string | undefined> = Object.fromEntries(
  BUSINESS_ENV_KEYS.map((key) => [key, import.meta.env[`VITE_${key}`] as string | undefined]),
)

export const BUSINESS_IDENTITY: BusinessIdentity = loadBusinessIdentity(identityEnv)
