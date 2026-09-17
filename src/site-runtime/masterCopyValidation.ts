import type { Field, PayloadRequest, Validate } from 'payload'
import { authorsGdprValidate } from '../collections/hooks/authorsGdprValidate'
import type { MasterCollection } from '../site-control/masterSnapshot'

export type CopyColumn = { name: string; value: string | number | null }
const snake = (name: string) => name.replace(/[A-Z]/g,letter => `_${letter.toLowerCase()}`)

/** Restricted import of the known scalar/group/JSON master fields. Use the
 * sanitized Payload validators; do not run general mutation hooks between
 * SQL statements. Relationship targets are pinned and validated separately,
 * then enforced by D1 FKs in the same batch as all parent/relationship rows. */
export async function masterCopyColumns(req: PayloadRequest, collection: MasterCollection, data: Record<string,unknown>): Promise<CopyColumn[]> {
  const config = req.payload.collections[collection]?.config
  if (!config) throw new Error('Independent master collection unavailable')
  if (collection === 'authors') await authorsGdprValidate({ data } as Parameters<typeof authorsGdprValidate>[0])
  const columns: CopyColumn[] = []
  const seen = new Set<string>()
  const walk = async (fields: Field[], sibling: Record<string,unknown>, prefix = '', path: string[] = []): Promise<void> => {
    for (const field of fields) {
      if (field.type === 'tabs') { for (const tab of field.tabs) {
        if ('name' in tab && tab.name) throw new Error('Named master tabs require a schema adapter')
        await walk(tab.fields,sibling,prefix,path)
      }; continue }
      if (!('name' in field) || !field.name) {
        if ('fields' in field) await walk(field.fields,sibling,prefix,path)
        continue
      }
      if (!Object.hasOwn(sibling,field.name) || field.type === 'ui') continue
      const value = sibling[field.name], key = `${prefix}${snake(field.name)}`, fieldPath = [...path,field.name]
      seen.add(fieldPath.join('.'))
      if (field.type === 'group') {
        if (value !== null) {
          if (typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid master group')
          await walk(field.fields,value as Record<string,unknown>,`${key}_`,fieldPath)
          for (const child of Object.keys(value)) if (!seen.has([...fieldPath,child].join('.'))) throw new Error(`Unknown master field ${child}`)
        }
        continue
      }
      if (!['text','textarea','number','checkbox','select','json','richText'].includes(field.type) ||
        ('hasMany' in field && field.hasMany) || field.localized) throw new Error('Unsupported master field storage')
      if ('validate' in field && typeof field.validate === 'function') {
        const result = await (field.validate as Validate)(value,{ ...field,req,data,siblingData: sibling,blockData: {},
          collectionSlug: collection,operation: 'create',event: 'submit',overrideAccess: true,path: fieldPath,preferences: { fields: {} } })
        if (result !== true) throw new Error(`Invalid master field ${fieldPath.join('.')}: ${result}`)
      }
      let stored: string | number | null = null
      if (value != null) {
        if (['json','richText'].includes(field.type)) stored = JSON.stringify(value)
        else if (field.type === 'checkbox') {
          if (typeof value !== 'boolean') throw new Error('Invalid master checkbox')
          stored = Number(value)
        } else if (field.type === 'number') {
          if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid master number')
          stored = value
        } else {
          if (typeof value !== 'string') throw new Error('Invalid master text or selection')
          stored = value
        }
      }
      if (!/^[a-z][a-z0-9_]*$/.test(key)) throw new Error('Unsupported master column name')
      columns.push({ name: key,value: stored })
    }
  }
  await walk(config.fields,data)
  for (const key of Object.keys(data)) if (!seen.has(key)) throw new Error(`Unknown master field ${key}`)
  return columns
}
