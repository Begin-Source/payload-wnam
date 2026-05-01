'use client'

import { Component, type ErrorInfo, type ReactNode } from 'react'

import type { SiteLayoutId } from '@/utilities/publicLandingTheme'

type Props = {
  layoutId: SiteLayoutId
  children: ReactNode
}

type State = { hasError: boolean; message?: string }

function layoutLabel(id: SiteLayoutId): string {
  switch (id) {
    case 'amz-template-1':
      return 'AMZ template (v1)'
    case 'amz-template-2':
      return 'AMZ template (v2)'
    case 'template1':
      return 'Template 1'
    case 'template2':
      return 'Template 2'
    case 'affiliate_reviews':
      return 'Affiliate reviews'
    case 'wide':
      return 'Wide blog'
    default:
      return 'Default blog'
  }
}

export class SiteLayoutErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV === 'development') {
      console.error('[site-layout]', this.props.layoutId, error, info.componentStack)
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="mx-auto max-w-lg px-4 py-16 text-center">
          <p className="text-lg font-semibold text-foreground">This site theme failed to render.</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Layout: {layoutLabel(this.props.layoutId)}
            {this.state.message ? ` — ${this.state.message}` : null}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">
            Other sites using different layouts are unaffected. Fix this layout in the codebase or change
            the site&apos;s layout in the admin.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
