export type AdminBrandingPublic = {
  brandName: string | null
  primaryColor: string | null
  logoUrl: string | null
  /** Media `updatedAt` or id — used to bust favicon cache after logo swaps. */
  logoUpdatedAt: string | null
}
