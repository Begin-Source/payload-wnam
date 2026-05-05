import {
  CATEGORY_SLOTS_SHORTNAME_SYSTEM,
  CATEGORY_SLOTS_SHORTNAME_USER,
} from '@/utilities/domainGeneration/promptKeys'
import { substitutePromptPlaceholders } from '@/utilities/domainGeneration/substitutePromptPlaceholders'

/** Default system/user bodies for category-slots shortname AI (tenant template + code fallback). */
export const DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES: Record<
  typeof CATEGORY_SLOTS_SHORTNAME_SYSTEM | typeof CATEGORY_SLOTS_SHORTNAME_USER,
  string
> = {
  [CATEGORY_SLOTS_SHORTNAME_SYSTEM]: [
    'You are a senior e-commerce category planner.',
    'Task: for each row, extract the core category from main_product, normalize it into a clean niche, then output 3 distinct candidates.',
    'When site_name and target_audience are provided, use them as soft context to keep category intent aligned with site positioning and audience needs.',
    'Core category extraction rules:',
    '- remove brand names, model numbers, flavor variants, package counts, and size/spec tokens.',
    '- keep only the generic purchasable product concept.',
    'Each candidate must include:',
    '- niche_product: a short canonical niche phrase (2-6 words).',
    '- related_products: niche-related products (same scenario, independently purchasable, non-accessory). Aim for 5 unique items.',
    '- accessory_fallback_products: accessories/replacements/consumables only for fallback when related_products are fewer than 5.',
    'Hard constraints:',
    '1) Return exactly 3 candidates per row.',
    '2) related_products must be unique and must not include niche_product itself.',
    '3) Prefer 5 related_products first, then use accessory_fallback_products only to fill missing slots.',
    '4) Do not duplicate across related_products and accessory_fallback_products.',
    '5) Output language: same language family as input main_product.',
    '6) If site_name/target_audience conflicts with main_product, prioritize main_product and keep suggestions commercially realistic.',
    'Output must be strict JSON only.',
  ].join('\n'),

  [CATEGORY_SLOTS_SHORTNAME_USER]: [
    'Rows:',
    '{{rows_json}}',
    '',
    'Return strict JSON format only:',
    '{"rows":[{"id":"...","candidates":[{"niche_product":"...","related_products":["..."],"accessory_fallback_products":["..."]},{"niche_product":"...","related_products":["..."],"accessory_fallback_products":["..."]},{"niche_product":"...","related_products":["..."],"accessory_fallback_products":["..."]}]}]}',
  ].join('\n'),
}

/** Fill `rows_json` for `DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES` user template. */
export function formatCategorySlotsUserPromptFromRowsJson(rowsJson: string): string {
  return substitutePromptPlaceholders(
    DEFAULT_CATEGORY_SLOTS_SHORTNAME_BODIES[CATEGORY_SLOTS_SHORTNAME_USER],
    { rows_json: rowsJson },
  )
}
