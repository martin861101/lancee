import type { PlanCode, PricingRegion } from '../../lib/api'

export type PricingFeature = {
  label: string
  included: boolean
  value?: string
}

export type PlanCopy = {
  planCode: PlanCode
  tagline: string
  description: string
  cta: string
  ctaActive: string
  features: PricingFeature[]
}

export const planCopy: Record<PlanCode, PlanCopy> = {
  solo: {
    planCode: 'solo',
    tagline: 'Everything you need to organise clients, projects and getting paid.',
    description: 'A central place to run your independent work.',
    cta: 'Start with Solo',
    ctaActive: 'Current plan',
    features: [
      { label: 'Unlimited clients', included: true },
      { label: 'Unlimited projects', included: true },
      { label: 'Up to 10 workflow automations', included: true },
      { label: 'All integrated workflows', included: true },
      { label: 'Add up to 5 team members', included: true },
      { label: 'AI as an optional add-on', included: true },
      { label: '5 complimentary AI actions per month', included: true },
      { label: 'Everything else included', included: true },
    ],
  },
  pro: {
    planCode: 'pro',
    tagline: 'Run the operational side of your business from one workspace.',
    description: 'For freelancers who increasingly rely on lancee to operate.',
    cta: 'Choose Pro',
    ctaActive: 'Current plan',
    features: [
      { label: 'Unlimited clients', included: true },
      { label: 'Unlimited projects', included: true },
      { label: 'Up to 50 workflow automations', included: true },
      { label: 'All integrated workflows', included: true },
      { label: 'Add up to 50 team members', included: true },
      { label: 'AI as an optional add-on', included: true },
      { label: '20 complimentary AI actions per month', included: true },
      { label: 'Everything else included', included: true },
    ],
  },
  studio: {
    planCode: 'studio',
    tagline: 'Bring your clients, team and workflows into one operating system.',
    description: 'For small teams, studios, agencies and growing businesses.',
    cta: 'Start with Studio',
    ctaActive: 'Current plan',
    features: [
      { label: 'Unlimited clients', included: true },
      { label: 'Unlimited projects', included: true },
      { label: 'Unlimited workflow automations', included: true },
      { label: 'All integrated workflows', included: true },
      { label: 'AI included for every licensed user', included: true },
      { label: 'Unlimited team members', included: true },
      { label: 'Everything included', included: true },
    ],
  },
}

export const regions: { code: PricingRegion; label: string; currencyLabel: string }[] = [
  { code: 'ZA', label: 'South Africa', currencyLabel: 'ZAR' },
  { code: 'US', label: 'United States', currencyLabel: 'USD' },
  { code: 'UK', label: 'United Kingdom', currencyLabel: 'GBP' },
  { code: 'OTHER', label: 'Other countries', currencyLabel: 'USD' },
]

export type AddOn = {
  id: string
  name: string
  kind: string
}

export const addOns: AddOn[] = [
  { id: 'automations', name: 'Automations', kind: 'Run more on autopilot' },
  { id: 'forms', name: 'Forms', kind: 'Capture work as it arrives' },
  { id: 'proto', name: 'Payments', kind: 'Get paid faster' },
  { id: 'storage', name: 'Storage', kind: 'More room for your work' },
  { id: 'seats', name: 'Team seats', kind: 'Everyone in one workspace' },
]

export type ComparisonRow = {
  label: string
  solo: 'included' | 'partial' | '—'
  pro: 'included' | 'partial' | '—'
  studio: 'included' | 'partial' | '—'
}

export type ComparisonGroup = {
  id: string
  group: string
  rows: ComparisonRow[]
}

export const comparisonGroups: ComparisonGroup[] = [
  {
    id: 'core',
    group: 'Core workspace',
    rows: [
      { label: 'Clients', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'Projects', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'Kanban boards', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'Field tasks & project notes', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'File management', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'Calendar', solo: 'included', pro: 'included', studio: 'included' },
    ],
  },
  {
    id: 'business',
    group: 'Business & billing',
    rows: [
      { label: 'Basic invoicing', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'Advanced invoicing & recurring', solo: '—', pro: 'included', studio: 'included' },
      { label: 'Proposals / estimates', solo: '—', pro: 'included', studio: 'included' },
      { label: 'Payment integration', solo: 'included', pro: 'included', studio: 'included' },
      { label: 'Time tracking', solo: '—', pro: 'included', studio: 'included' },
      { label: 'Reporting', solo: '—', pro: 'included', studio: 'included' },
    ],
  },
  {
    id: 'automation',
    group: 'Automation',
    rows: [
      { label: 'Workflow automations', solo: 'partial', pro: 'partial', studio: 'included' },
      { label: 'Scheduled workflows', solo: '—', pro: 'included', studio: 'included' },
      { label: 'Webhooks', solo: '—', pro: 'included', studio: 'included' },
      { label: 'External integrations', solo: 'included', pro: 'included', studio: 'included' },
    ],
  },
  {
    id: 'collaboration',
    group: 'Collaboration',
    rows: [
      { label: 'Team members', solo: 'partial', pro: 'partial', studio: 'included' },
      { label: 'Roles & permissions', solo: '—', pro: '—', studio: 'included' },
      { label: 'Approval workflows', solo: '—', pro: '—', studio: 'included' },
      { label: 'Custom workspace branding', solo: '—', pro: 'included', studio: 'included' },
      { label: 'Client portal', solo: 'included', pro: 'included', studio: 'included' },
    ],
  },
]