/**
 * Optional: `pnpm exec tsx scripts/seed-authors.ts`
 * Creates a default author with one credential for EEAT smoke tests.
 */
import 'dotenv/config'
import configPromise from '@payload-config'
import { getPayload } from 'payload'

async function main(): Promise<void> {
  const payload = await getPayload({ config: configPromise })
  const existing = await payload.find({ collection: 'authors', limit: 1 })
  if (existing.docs.length) {
    console.log('Authors already exist, skip')
    return
  }
  await payload.create({
    collection: 'authors',
    data: {
      displayName: 'Editor',
      slug: 'editor',
      role: 'editor',
      credentials: [{ title: 'Editor in chief', issuer: 'Site', year: new Date().getFullYear() }],
      sameAs: [],
    },
  })
  console.log('Seeded default author')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
