'use client'

import { SelectField, useForm, useFormFields } from '@payloadcms/ui'
import type { SelectFieldClientProps } from 'payload'
import { useEffect } from 'react'

import { normalizeMirroredSiteLayout } from '@/collections/hooks/syncBlueprintMirroredLayout'
import { parseRelationshipId } from '@/utilities/parseRelationshipId'

/**
 * Keeps `mirroredSiteLayout` in the document form in sync with the selected `site` while editing,
 * so admin `condition` blocks (e.g. amz JSON) update before save. Server `beforeChange` remains authoritative.
 */
export function MirroredSiteLayoutField(props: SelectFieldClientProps) {
  const { path } = props
  const { dispatchFields, setModified } = useForm()
  const siteValue = useFormFields((tuple) => tuple?.[0]?.site?.value)

  useEffect(() => {
    const siteId = parseRelationshipId(siteValue)
    if (siteId == null) {
      dispatchFields({
        type: 'UPDATE',
        path,
        value: normalizeMirroredSiteLayout(undefined),
      })
      setModified(true)
      return
    }

    const ac = new AbortController()
    ;(async () => {
      try {
        const res = await fetch(`/api/sites/${siteId}?depth=0`, {
          credentials: 'include',
          signal: ac.signal,
          headers: { Accept: 'application/json' },
        })
        if (!res.ok) throw new Error(`sites ${res.status}`)
        const json = (await res.json()) as unknown
        const doc =
          json && typeof json === 'object' && json !== null && 'doc' in json
            ? (json as { doc: { siteLayout?: unknown } }).doc
            : (json as { siteLayout?: unknown })
        const layout = normalizeMirroredSiteLayout(doc?.siteLayout)
        dispatchFields({
          type: 'UPDATE',
          path,
          value: layout,
        })
        setModified(true)
      } catch {
        if (!ac.signal.aborted) {
          dispatchFields({
            type: 'UPDATE',
            path,
            value: 'template1',
          })
          setModified(true)
        }
      }
    })()

    return () => ac.abort()
  }, [siteValue, path, dispatchFields, setModified])

  return <SelectField {...props} />
}
