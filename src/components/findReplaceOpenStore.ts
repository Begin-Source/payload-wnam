const openBySlug = new Map<string, boolean>()
const listenersBySlug = new Map<string, Set<() => void>>()

function listenersFor(slug: string): Set<() => void> {
  let set = listenersBySlug.get(slug)
  if (!set) {
    set = new Set()
    listenersBySlug.set(slug, set)
  }
  return set
}

export function getFindReplaceOpen(collectionSlug: string): boolean {
  return openBySlug.get(collectionSlug) ?? false
}

export function setFindReplaceOpen(collectionSlug: string, next: boolean): void {
  const prev = openBySlug.get(collectionSlug) ?? false
  if (prev === next) return
  openBySlug.set(collectionSlug, next)
  for (const l of listenersFor(collectionSlug)) {
    l()
  }
}

export function subscribeFindReplaceOpen(
  collectionSlug: string,
  onStoreChange: () => void,
): () => void {
  const set = listenersFor(collectionSlug)
  set.add(onStoreChange)
  return () => {
    set.delete(onStoreChange)
  }
}
