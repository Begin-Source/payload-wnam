import type { AmzSiteConfig } from './defaultSiteConfig'
import { generateThemeCSS as theme, generateFontCSS as fonts } from '../amz-template-1/theme-generator'
export const generateThemeCSS = (config: AmzSiteConfig): string => theme(config, 'amz-template-2')
export const generateFontCSS = (config: AmzSiteConfig): string => fonts(config, 'amz-template-2')
