# Internal Linking Optimizer -- Output Templates

Templates for internal-linking-optimizer steps 3-7. Referenced from [SKILL.md](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/optimize/internal-linking-optimizer/SKILL.md).

---

## Step 3: Analyze Anchor Text Distribution

CORE-EEAT alignment: maps to R08 (Internal Link Graph). See [content-quality-auditor](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/cross-cutting/content-quality-auditor/SKILL.md) for full audit.

```markdown
## Anchor Text Analysis

### Most Used Anchors

| Anchor Text | Count | Target Pages | Assessment |
|-------------|-------|--------------|------------|
| "click here" | [X] | [X] pages | Not descriptive |
| "[exact keyword]" | [X] | [page] | May be over-optimized |
| "[descriptive phrase]" | [X] | [page] | Good |

### Anchor Text Distribution: [Important URL]

| Anchor Text | Source Page | Status |
|-------------|-------------|--------|
| "[anchor 1]" | [source URL] | ✅/⚠️/❌ |

**Issues Found**:
- Over-optimized anchors: [X] instances
- Generic anchors: [X] instances
- Same anchor to multiple pages: [X] instances

### Recommendations for [URL]
Current: "[current anchor]" used [X] times
Recommended variety:
- "[variation 1]" - Use from [page type]
- "[variation 2]" - Use from [page type]

**Anchor Score**: [X]/10
```

## Step 4: Create Topic Cluster Link Strategy

```markdown
## Topic Cluster Internal Linking

### Cluster: [Main Topic]
**Pillar Page**: [URL]
**Cluster Articles**: [X]

### Recommended Link Structure
[Pillar Page]
   +-- Links TO all cluster articles
   +-- [Cluster Article 1] -> pillar + related clusters
   +-- [Cluster Article 2] -> pillar + related clusters

### Links to Add

| From Page | To Page | Anchor Text | Location |
|-----------|---------|-------------|----------|
| [URL 1] | [URL 2] | "[anchor]" | [section] |
| [Pillar] | [Cluster 1] | "[anchor]" | [section] |
```

## Step 5: Find Contextual Link Opportunities

```markdown
## Contextual Link Opportunities

**Page: [URL 1]**
**Topic**: [topic] | **Current internal links**: [X]

| Opportunity | Target Page | Anchor Text | Reason |
|-------------|-------------|-------------|--------|
| Paragraph 2 mentions "[topic]" | [URL] | "[topic phrase]" | Topic match |
| Section on "[subject]" | [URL] | "[anchor]" | Related guide |

### Priority Link Additions

1. **From**: [Source URL]
   **To**: [Target URL]
   **Anchor**: "[anchor text]"
   **Where**: [specific location in content]
```

## Step 6: Optimize Navigation and Footer Links

```markdown
## Site-Wide Link Optimization

### Navigation Recommendations

| Element | Current | Recommended | Reason |
|---------|---------|-------------|--------|
| Main nav | [X] links | [Y] links | [reason] |
| Footer | [X] links | [Y] links | [reason] |
| Sidebar | [status] | [recommendation] | [reason] |
| Breadcrumbs | [status] | [recommendation] | [reason] |

### Pages to Add to Navigation
1. [Page] - Add to [location] because [reason]

### Pages to Remove from Navigation
1. [Page] - Move to [footer/remove] because [reason]
```

## Step 7: Generate Link Implementation Plan

```markdown
# Internal Linking Optimization Plan
**Site**: [domain] | **Analysis Date**: [date]

## Summary
- Total link opportunities: [X]
- Orphan pages to fix: [X]
- Estimated traffic impact: [+X%]

## Current State

| Metric | Current | Target | Gap |
|--------|---------|--------|-----|
| Avg links per page | [X] | [X] | [X] |
| Orphan pages | [X] | 0 | [X] |
| Over-optimized anchors | [X]% | <10% | [X]% |
| Topic cluster coverage | [X]% | 100% | [X]% |

## Phase 1: Critical Fixes (Week 1)
- [ ] Fix orphan pages: [URLs] - Add links from [X] pages
- [ ] High-value links: Link [Page A] to [Page B] with "[anchor]"

## Phase 2: Topic Clusters (Week 2-3)
- [ ] Cluster [Topic]: Ensure pillar links to all [X] cluster articles
- [ ] Add [X] cross-links between cluster articles

## Phase 3: Optimization (Week 4+)
- [ ] Vary anchors for [Page] - currently [X]% exact match
- [ ] Add [Page] to main navigation
- [ ] Update footer links

### Anchor Text Guidelines

| Type | Example | Usage |
|------|---------|-------|
| Exact match | "keyword research" | 10-20% |
| Partial match | "tips for keyword research" | 30-40% |
| Branded | "Brand's guide to..." | 10-20% |
| Natural | "this article", "learn more" | 20-30% |

## Tracking
- [ ] Rankings for target keywords
- [ ] Traffic to previously orphan pages
- [ ] Crawl stats in search console
- [ ] Internal link distribution changes
```
