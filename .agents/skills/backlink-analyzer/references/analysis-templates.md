# Backlink Analysis Output Templates

Output templates for the backlink analysis workflow.

---

## 1. Profile Overview

```markdown
## Backlink Profile Overview

**Domain**: [domain] | **Analysis Date**: [date]

### Key Metrics

| Metric | Value | Industry Avg | Status |
|--------|-------|--------------|--------|
| Total Backlinks | [X] | [Y] | [Above/Below avg] |
| Referring Domains | [X] | [Y] | [status] |
| Domain Authority | [X] | [Y] | [status] |
| Domain Rating | [X] | [Y] | [status] |
| Dofollow Links | [X] ([Y]%) | [Z]% | [status] |
| Nofollow Links | [X] ([Y]%) | [Z]% | [status] |

### Link Velocity

| Period | New Links | Lost Links | Net Change |
|--------|-----------|------------|------------|
| Last 30 days | [X] | [Y] | [+/-Z] |
| Last 90 days | [X] | [Y] | [+/-Z] |
| Last year | [X] | [Y] | [+/-Z] |

### Authority Distribution

DA 80-100: [X]% | DA 60-79: [X]% | DA 40-59: [X]% | DA 20-39: [X]% | DA 0-19: [X]%

**Profile Health Score**: [X]/100
```

---

## 2. Link Quality Analysis

```markdown
## Link Quality Analysis

### Top Quality Backlinks

| Source Domain | DA | Link Type | Anchor | Target Page |
|---------------|-----|-----------|--------|-------------|
| [domain 1] | [DA] | Editorial | [anchor] | [page] |
| [domain 2] | [DA] | Guest Post | [anchor] | [page] |

### Link Type Distribution

| Type | Count | % | Assessment |
|------|-------|---|------------|
| Editorial | [X] | [Y]% | High quality |
| Guest posts | [X] | [Y]% | Good |
| Resource pages | [X] | [Y]% | Good |
| Directory | [X] | [Y]% | Moderate |
| Forum/Comments | [X] | [Y]% | Low quality |
| Sponsored/Paid | [X] | [Y]% | Risky |

### Anchor Text Analysis

| Anchor Type | Count | % | Status |
|-------------|-------|---|--------|
| Brand name | [X] | [Y]% | Natural |
| Exact match | [X] | [Y]% | [Warning if >30%] |
| Partial match | [X] | [Y]% | Natural |
| URL/Naked | [X] | [Y]% | Natural |
| Generic | [X] | [Y]% | Natural |

### Geographic Distribution

| Country | Links | % |
|---------|-------|---|
| [Country 1] | [X] | [Y]% |
| [Country 2] | [X] | [Y]% |
```

---

## 3. Toxic Link Analysis

```markdown
## Toxic Link Analysis

**Toxic Score**: [X]/100 | **High Risk**: [X] | **Medium Risk**: [X] | **Action Required**: [Yes/No]

### Toxic Link Indicators

| Risk Type | Count | Examples |
|-----------|-------|----------|
| Spammy domains | [X] | [domains] |
| Link farms | [X] | [domains] |
| PBN suspected | [X] | [domains] |
| Irrelevant sites | [X] | [domains] |
| Penalized domains | [X] | [domains] |

### High-Risk Links to Review

| Source Domain | Risk Score | Issue | Recommendation |
|---------------|------------|-------|----------------|
| [domain 1] | 95/100 | Link farm | Disavow |
| [domain 2] | 85/100 | Spam site | Disavow |

### Disavow File

```
domain:[spam-site-1.com]
domain:[spam-site-2.com]
[specific-url-1]
```
```

---

## 4. Competitive Backlink Analysis

```markdown
## Competitive Backlink Analysis

### Profile Comparison

| Metric | You | Comp 1 | Comp 2 | Comp 3 |
|--------|-----|--------|--------|--------|
| Referring Domains | [X] | [X] | [X] | [X] |
| Domain Authority | [X] | [X] | [X] | [X] |
| Link Velocity (30d) | [X] | [X] | [X] | [X] |
| Avg Link DA | [X] | [X] | [X] | [X] |

### Link Intersection (sites linking to competitors but not you)

| Domain | DA | Links to Comp 1 | Comp 2 | Comp 3 | Opportunity |
|--------|-----|-----------------|--------|--------|-------------|
| [domain 1] | [DA] | Yes | Yes | Yes | High |
| [domain 2] | [DA] | Yes | Yes | No | High |
| [domain 3] | [DA] | Yes | No | No | Medium |

### Top Linked Competitor Content

| Competitor | Content | Backlinks | Type |
|------------|---------|-----------|------|
| [Comp 1] | [Title/URL] | [X] | [Type] |

**Insight**: [What content types attract most links in this niche]
```

---

## 5. Link Building Opportunities

```markdown
## Link Building Opportunities

| Opportunity Type | Effort | Impact | Priority |
|------------------|--------|--------|----------|
| Link intersection | Medium | High | Highest |
| Broken links | Low | Medium | High |
| Unlinked mentions | Low | Medium | High |
| Resource pages | Medium | High | High |
| Guest posts | High | High | Medium |

### Link Intersection Prospects

| Domain | DA | Why Link | Contact Approach |
|--------|-----|----------|------------------|
| [domain] | [DA] | [reason] | [approach] |

### Broken Link Opportunities

| Source Page | Broken Link | Suggested Replacement |
|-------------|-------------|----------------------|
| [URL] | [broken URL] | [your page] |

### Unlinked Mentions

| Site | Mention | Your Page to Link |
|------|---------|-------------------|
| [domain] | [mention type] | [page] |
```

---

## 6. Link Change Tracking

```markdown
## Link Change Tracking (Last 30 Days)

### New Links

| Source | DA | Type | Anchor | Date |
|--------|-----|------|--------|------|
| [domain] | [DA] | [type] | [anchor] | [date] |

**Total new**: [X] | **Avg DA**: [X] | **Best**: [domain] (DA [X])

### Lost Links

| Source | DA | Reason | Action |
|--------|-----|--------|--------|
| [domain] | [DA] | Page removed | Reach out |

**Total lost**: [X] | **Net change**: [+/-X]

### Recovery Priorities

| Lost Link | Value | Strategy |
|-----------|-------|----------|
| [domain] | High | Contact webmaster |
```

---

## 7. Summary Report

```markdown
# Backlink Analysis Report

**Domain**: [domain] | **Date**: [date] | **Period**: [period]

## Executive Summary

Profile status: [healthy/needs attention/concerning]
- Referring domains: [X] ([+/-Y] vs last month)
- Average link authority: [X] DA
- Link velocity: [X] new/month
- Toxic link %: [X]%

**Strengths**: [1] | [2] | [3]
**Concerns**: [1] | [2]

## Opportunities

| Opportunity | Potential | Effort | Priority |
|-------------|-----------|--------|----------|
| Link intersection | [X] sites | Medium | High |
| Broken links | [X] sites | Low | High |
| Resource pages | [X] sites | Medium | Medium |

## Competitive Position

Your referring domains rank #[X] among [Y] competitors.

## Recommended Actions

**Immediate**: Disavow [X] toxic links, reach out to [X] unlinked mentions
**This Month**: Pursue [X] intersection opportunities, fix [X] broken links, recover [X] lost links
**This Quarter**: Create linkable asset for [topic], launch guest posting, build [X] resource page links

## KPIs

| Metric | Current | 3-Month Target |
|--------|---------|----------------|
| Referring domains | [X] | [Y] |
| Avg DA of new links | [X] | [Y] |
| Link velocity | [X]/mo | [Y]/mo |
| Toxic link % | [X]% | <5% |
```
