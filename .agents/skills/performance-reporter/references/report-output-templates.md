# Performance Report Output Templates

Output templates for SEO performance reporting.

---

## 1. Report Configuration

```markdown
## Report Configuration

**Domain**: [domain] | **Period**: [start] to [end] | **Comparison**: [previous period]
**Type**: [Monthly/Quarterly/Annual] | **Audience**: [Executive/Technical/Client]
**Focus**: [Rankings/Traffic/Content/Backlinks/GEO]
```

---

## 2. Executive Summary

```markdown
# SEO Performance Report

**Domain**: [domain] | **Period**: [date range] | **Prepared**: [date]

## Executive Summary

### Overall Performance: [Excellent/Good/Needs Attention/Critical]

**Wins**:
- [e.g., "Organic traffic increased 25%"]
- [e.g., "3 new #1 rankings achieved"]

**Watch Areas**:
- [e.g., "Mobile rankings declining slightly"]

**Action Required**:
- [e.g., "Technical SEO audit needed"]

### Key Metrics

| Metric | This Period | Last Period | Change | Target | Status |
|--------|-------------|-------------|--------|--------|--------|
| Organic Traffic | [X] | [Y] | [+/-Z%] | [T] | [status] |
| Keywords Top 10 | [X] | [Y] | [+/-Z] | [T] | [status] |
| Organic Conversions | [X] | [Y] | [+/-Z%] | [T] | [status] |
| Domain Authority | [X] | [Y] | [+/-Z] | [T] | [status] |
| AI Citations | [X] | [Y] | [+/-Z%] | [T] | [status] |

### SEO ROI

**Investment**: $[X] | **Organic Revenue**: $[Y] | **ROI**: [Z]%
```

---

## 3. Organic Traffic Analysis

```markdown
## Organic Traffic Analysis

### Overview

| Metric | This Period | vs Last Period | vs Last Year |
|--------|-------------|----------------|--------------|
| Sessions | [X] | [+/-Y%] | [+/-Z%] |
| Users | [X] | [+/-Y%] | [+/-Z%] |
| Pageviews | [X] | [+/-Y%] | [+/-Z%] |
| Bounce Rate | [X]% | [+/-Y%] | [+/-Z%] |

### Traffic by Source

| Channel | Sessions | % of Total | Change |
|---------|----------|------------|--------|
| Organic Search | [X] | [Y]% | [+/-Z%] |
| Direct | [X] | [Y]% | [+/-Z%] |
| Referral | [X] | [Y]% | [+/-Z%] |
| Social | [X] | [Y]% | [+/-Z%] |

### Top Pages

| Page | Sessions | Change | Conversions |
|------|----------|--------|-------------|
| [Page 1] | [X] | [+/-Y%] | [Z] |
| [Page 2] | [X] | [+/-Y%] | [Z] |

### By Device

| Device | Sessions | Change | Conv. Rate |
|--------|----------|--------|------------|
| Desktop | [X] ([Y]%) | [+/-Z%] | [%] |
| Mobile | [X] ([Y]%) | [+/-Z%] | [%] |
```

---

## 4. Keyword Rankings

```markdown
## Keyword Ranking Performance

### Rankings Distribution

| Position Range | Keywords | Change | Traffic Impact |
|----------------|----------|--------|----------------|
| Position 1 | [X] | [+/-Y] | [Z] sessions |
| Position 2-3 | [X] | [+/-Y] | [Z] sessions |
| Position 4-10 | [X] | [+/-Y] | [Z] sessions |
| Position 11-20 | [X] | [+/-Y] | [Z] sessions |
| Position 21-50 | [X] | [+/-Y] | [Z] sessions |

### Top Improvements

| Keyword | Previous | Current | Change | Traffic |
|---------|----------|---------|--------|---------|
| [kw 1] | [X] | [Y] | +[Z] | [sessions] |

### Declines

| Keyword | Previous | Current | Change | Action |
|---------|----------|---------|--------|--------|
| [kw 1] | [X] | [Y] | -[Z] | [action] |

### SERP Features

| Feature | Won | Lost | Opportunities |
|---------|-----|------|---------------|
| Featured Snippets | [X] | [Y] | [Z] |
| People Also Ask | [X] | [Y] | [Z] |
```

---

## 5. GEO/AI Visibility

```markdown
## GEO (AI Visibility) Performance

### AI Citation Overview

| Metric | This Period | Last Period | Change |
|--------|-------------|-------------|--------|
| Keywords with AI Overview | [X]/[Y] | [X]/[Y] | [+/-Z] |
| Your AI Citations | [X] | [Y] | [+/-Z%] |
| Citation Rate | [X]% | [Y]% | [+/-Z%] |

### GEO Wins

| Query | Citation Status | Source Page | Impact |
|-------|-----------------|-------------|--------|
| [query] | New citation | [page] | High visibility |

### GEO Gaps

| Query | AI Overview | You Cited? | Action |
|-------|-------------|------------|--------|
| [query] | Yes | No | [action] |
```

---

## 6. Domain Authority (CITE Score)

```markdown
## Domain Authority (CITE Score)

| Metric | This Period | Last Period | Change |
|--------|-------------|-------------|--------|
| CITE Score | [X]/100 | [Y]/100 | [+/-Z] |
| C -- Citation | [X]/100 | [Y]/100 | [+/-Z] |
| I -- Identity | [X]/100 | [Y]/100 | [+/-Z] |
| T -- Trust | [X]/100 | [Y]/100 | [+/-Z] |
| E -- Eminence | [X]/100 | [Y]/100 | [+/-Z] |

**Veto Status**: No triggers / [item] triggered

_If no previous CITE audit exists, note "Not yet evaluated -- run domain-authority-auditor for baseline" and skip._
```

---

## 7. Content Quality (CORE-EEAT Score)

```markdown
## Content Quality (CORE-EEAT Score)

| Metric | Value |
|--------|-------|
| Pages Audited | [count] |
| Average CORE-EEAT Score | [score]/100 ([rating]) |
| Average GEO Score (CORE) | [score]/100 |
| Average SEO Score (EEAT) | [score]/100 |
| Veto Items Triggered | [count] ([item IDs]) |

### Dimension Averages

| Dimension | Score | Trend |
|-----------|-------|-------|
| C -- Contextual Clarity | [score] | [up/down/stable] |
| O -- Organization | [score] | [up/down/stable] |
| R -- Referenceability | [score] | [up/down/stable] |
| E -- Exclusivity | [score] | [up/down/stable] |
| Exp -- Experience | [score] | [up/down/stable] |
| Ept -- Expertise | [score] | [up/down/stable] |
| A -- Authority | [score] | [up/down/stable] |
| T -- Trust | [score] | [up/down/stable] |

_If no audit exists, note "Run `/seo:audit-page` on key landing pages for baseline" and skip._
```

---

## 8. Backlink Performance

```markdown
## Backlink Performance

| Metric | This Period | Last Period | Change |
|--------|-------------|-------------|--------|
| Total Backlinks | [X] | [Y] | [+/-Z] |
| Referring Domains | [X] | [Y] | [+/-Z] |
| Domain Authority | [X] | [Y] | [+/-Z] |

### Notable New Links

| Source | DA | Type | Value |
|--------|-----|------|-------|
| [domain] | [DA] | [type] | High |
```

---

## 9. Content Performance

```markdown
## Content Performance

| Metric | This Period | Last Period | Target |
|--------|-------------|-------------|--------|
| New articles | [X] | [Y] | [Z] |
| Content updates | [X] | [Y] | [Z] |

### Top Performing

| Content | Traffic | Rankings | Conversions |
|---------|---------|----------|-------------|
| [Title] | [X] | [Y] kw | [Z] |

### Needing Attention

| Content | Issue | Traffic Change | Action |
|---------|-------|----------------|--------|
| [Title] | [issue] | -[X]% | [action] |
```

---

## 10. Recommendations

```markdown
## Recommendations & Next Steps

### Immediate (This Week)

| Priority | Action | Expected Impact | Owner |
|----------|--------|-----------------|-------|
| High | [Action] | [Impact] | [Owner] |

### Short-term (This Month)

| Priority | Action | Expected Impact | Owner |
|----------|--------|-----------------|-------|
| Medium | [Action] | [Impact] | [Owner] |

### Goals for Next Period

| Metric | Current | Target | Action |
|--------|---------|--------|--------|
| Organic Traffic | [X] | [Y] | [action] |
| Keywords Top 10 | [X] | [Y] | [action] |
| AI Citations | [X] | [Y] | [action] |
```

---

## 11. Full Report Structure

Compile sections 2-10 above under: `# [Company] SEO & GEO Performance Report -- [Month/Quarter] [Year]`

**Appendix data sources**: Analytics, Search Console, SEO tool, AI monitor
**Glossary**: GEO = Generative Engine Optimization, DA = Domain Authority
