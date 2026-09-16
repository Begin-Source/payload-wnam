import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** Worker bundle replacement for Payload's eval-based dynamic importer.
 * Native import preserves module loading without disabling whole-bundle minification.
 * Only Next's server compilation selects this module; Payload CLI keeps its own loader.
 */
export async function dynamicImport(modulePathOrSpecifier: string): Promise<unknown> {
  const specifier = path.isAbsolute(modulePathOrSpecifier)
    ? pathToFileURL(modulePathOrSpecifier).href : modulePathOrSpecifier
  return import(/* webpackIgnore: true */ /* @vite-ignore */ specifier)
}
