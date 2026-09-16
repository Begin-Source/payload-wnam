'use client'
import { lazyKeywordDrawer } from './LazyKeywordDrawer'
import { WorkflowQuickActionModal } from './quickActions/WorkflowQuickActionModal'
import { AmzTemplateDesignQuickActionModal } from './quickActions/AmzTemplateDesignQuickActionModal'
import { CategoryCoverQuickActionModal } from '@/components/CategoryCoverQuickActionModal'
import { CategorySlotsQuickActionModal } from '@/components/CategorySlotsQuickActionModal'
import { OfferMerchantSlotQuickActionModal } from '@/components/OfferMerchantSlotQuickActionModal'
import { OfferReviewMdxQuickActionModal } from '@/components/OfferReviewMdxQuickActionModal'
import { ArticlePipelineCatchupDrawer } from '@/components/ArticlePipelineCatchupDrawer'
import { ContentBriefDraftSkeletonDrawer } from '@/components/ContentBriefDraftSkeletonDrawer'
import { MediaAiImageDrawer } from '@/components/MediaAiImageDrawer'


import { KeywordListGroupedToolbar } from '@/components/KeywordListGroupedToolbar'





import { SiteQuickActionsDrawer } from '@/components/SiteQuickActionsDrawer'
import { TrustPagesBundleQuickActionModal } from '@/components/TrustPagesBundleQuickActionModal'
import React, { useRef } from 'react'
import type { KeywordDrawerRef } from '@/components/keywordListDrawerRef'

const KeywordDefaultBatchDrawer = lazyKeywordDrawer(() => import('@/components/KeywordDefaultBatchDrawer').then(module => module.KeywordDefaultBatchDrawer))

const KeywordGeoDrawer = lazyKeywordDrawer(() => import('@/components/KeywordGeoDrawer').then(module => module.KeywordGeoDrawer))

const KeywordPillarSprintDrawer = lazyKeywordDrawer(() => import('@/components/KeywordPillarSprintDrawer').then(module => module.KeywordPillarSprintDrawer))

const KeywordQuickWinDrawer = lazyKeywordDrawer(() => import('@/components/KeywordQuickWinDrawer').then(module => module.KeywordQuickWinDrawer))

const KeywordRefreshDecayDrawer = lazyKeywordDrawer(() => import('@/components/KeywordRefreshDecayDrawer').then(module => module.KeywordRefreshDecayDrawer))

const KeywordSeasonalDrawer = lazyKeywordDrawer(() => import('@/components/KeywordSeasonalDrawer').then(module => module.KeywordSeasonalDrawer))

const KeywordSyncFetchDrawer = lazyKeywordDrawer(() => import('@/components/KeywordSyncFetchDrawer').then(module => module.KeywordSyncFetchDrawer))

export function ArticleListQuickAction(): React.ReactElement {
  return (
    <>
      <ContentBriefDraftSkeletonDrawer />
      <ArticlePipelineCatchupDrawer />
      <WorkflowQuickActionModal kind="articles" />
    </>
  )
}

export function PageListQuickAction(): React.ReactElement {
  return (
    <>
      <TrustPagesBundleQuickActionModal />
      <WorkflowQuickActionModal kind="pages" />
    </>
  )
}

export function CategoryListQuickAction(): React.ReactElement {
  return (
    <>
      <CategoryCoverQuickActionModal />
      <CategorySlotsQuickActionModal />
      <OfferMerchantSlotQuickActionModal />
      <WorkflowQuickActionModal kind="categories" />
    </>
  )
}

export function KeywordListQuickAction(): React.ReactElement {
  const quickWinRef = useRef<KeywordDrawerRef>(null)
  const defaultBatchRef = useRef<KeywordDrawerRef>(null)
  const geoRef = useRef<KeywordDrawerRef>(null)
  const pillarRef = useRef<KeywordDrawerRef>(null)
  const seasonalRef = useRef<KeywordDrawerRef>(null)
  const refreshDecayRef = useRef<KeywordDrawerRef>(null)
  const syncDfsRef = useRef<KeywordDrawerRef>(null)

  return (
    <>
      <KeywordListGroupedToolbar
        openers={{
          quickWin: () => quickWinRef.current?.open(),
          defaultBatch: () => defaultBatchRef.current?.open(),
          highCommission: () => defaultBatchRef.current?.open('high_commission_affiliate'),
          comparisonDecision: () => defaultBatchRef.current?.open('comparison_decision'),
          geo: () => geoRef.current?.open(),
          pillar: () => pillarRef.current?.open(),
          seasonal: () => seasonalRef.current?.open(),
          refreshDecay: () => refreshDecayRef.current?.open(),
          syncDfs: () => syncDfsRef.current?.open(),
        }}
      />
      <KeywordQuickWinDrawer ref={quickWinRef} />
      <KeywordDefaultBatchDrawer ref={defaultBatchRef} />
      <KeywordGeoDrawer ref={geoRef} />
      <KeywordPillarSprintDrawer ref={pillarRef} />
      <KeywordSeasonalDrawer ref={seasonalRef} />
      <KeywordRefreshDecayDrawer ref={refreshDecayRef} />
      <KeywordSyncFetchDrawer ref={syncDfsRef} />
    </>
  )
}

/** @deprecated DFS 同步已并入关键词列表分组工具栏；保留导出以免旧 import map 报错。 */
export function KeywordSyncFetchListAction(): React.ReactElement {
  return <></>
}

export function OfferListQuickAction(): React.ReactElement {
  return (
    <>
      <OfferReviewMdxQuickActionModal />
    </>
  )
}

export function DesignListQuickAction(): React.ReactElement {
  return (
    <>
      <AmzTemplateDesignQuickActionModal />
      <WorkflowQuickActionModal kind="site-blueprints" />
    </>
  )
}

export function MediaListQuickAction(): React.ReactElement {
  return (
    <>
      <MediaAiImageDrawer />
    </>
  )
}

export function SiteListQuickAction(): React.ReactElement {
  return <SiteQuickActionsDrawer />
}
