import type { Offer } from '@/payload-types'

function offerNetworkDisplayName(network: Offer['network']): string {
  if (network && typeof network === 'object' && 'name' in network && network.name) {
    return String(network.name)
  }
  return 'Amazon'
}

/**
 * Merchant outbound CTA copy aligned with review/featured cards:
 * normalizes names like "Amazon Affiliate" to "View on Amazon".
 */
export function merchantCtaLabel(network: Offer['network'], override?: string): string {
  if (override?.trim()) return override.trim()
  const n = offerNetworkDisplayName(network).toLowerCase()
  if (n.includes('amazon')) return 'View on Amazon'
  return `View on ${offerNetworkDisplayName(network)}`
}
