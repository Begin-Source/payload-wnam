import type { PayloadComponent } from 'payload'

import { Gutter } from '@payloadcms/ui'
import { RenderServerComponent } from '@payloadcms/ui/elements/RenderServerComponent'
import React from 'react'

const baseClass = 'dashboard'

/**
 * Dashboard 首页仅展示 `beforeDashboard` / `afterDashboard`（运营看板），不渲染默认的「首页 / 网站 / …」集合卡片。
 */
export function MinimalDashboard(props: {
  payload: {
    config: {
      admin: {
        components: {
          afterDashboard?: PayloadComponent
          beforeDashboard?: PayloadComponent
        }
      }
    }
    importMap: unknown
  }
  i18n: unknown
  locale: unknown
  params: Record<string, string>
  permissions: unknown
  searchParams: Record<string, string | string[] | undefined>
  user: unknown
}): React.ReactElement {
  const { i18n, locale, params, payload, permissions, searchParams, user } = props
  const { afterDashboard, beforeDashboard } = payload.config.admin.components

  return (
    <Gutter className={baseClass}>
      {Boolean(beforeDashboard) &&
        RenderServerComponent({
          Component: beforeDashboard,
          importMap: payload.importMap,
          serverProps: {
            i18n,
            locale,
            params,
            payload,
            permissions,
            searchParams,
            user,
          },
        })}
      {Boolean(afterDashboard) &&
        RenderServerComponent({
          Component: afterDashboard,
          importMap: payload.importMap,
          serverProps: {
            i18n,
            locale,
            params,
            payload,
            permissions,
            searchParams,
            user,
          },
        })}
    </Gutter>
  )
}
