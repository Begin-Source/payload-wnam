# On-Page SEO Auditor -- Output Templates

Templates for on-page-seo-auditor steps 1-11. Referenced from [SKILL.md](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/optimize/on-page-seo-auditor/SKILL.md).

---

## Step 1: Gather Page Information

```markdown
### Audit Setup
**Page URL**: [URL]
**Target Keyword**: [primary keyword]
**Secondary Keywords**: [additional keywords]
**Page Type**: [blog/product/landing/service]
**Business Goal**: [traffic/conversions/authority]
```

## Step 2: Audit Title Tag

```markdown
## Title Tag Analysis
**Current Title**: [title]
**Character Count**: [X] characters

| Criterion | Status | Notes |
|-----------|--------|-------|
| Length (50-60 chars) | Pass/Warn/Fail | [notes] |
| Keyword included | Pass/Warn/Fail | Position: [front/middle/end] |
| Keyword at front | Pass/Warn/Fail | [notes] |
| Unique across site | Pass/Warn/Fail | [notes] |
| Compelling/clickable | Pass/Warn/Fail | [notes] |
| Matches intent | Pass/Warn/Fail | [notes] |

**Title Score**: [X]/10
**Issues Found**: [list]
**Recommended Title**: "[Optimized title suggestion]"
**Why**: [Explanation of improvements]
```

## Step 3: Audit Meta Description

```markdown
## Meta Description Analysis
**Current Description**: [description]
**Character Count**: [X] characters

| Criterion | Status | Notes |
|-----------|--------|-------|
| Length (150-160 chars) | Pass/Warn/Fail | [notes] |
| Keyword included | Pass/Warn/Fail | [notes] |
| Call-to-action present | Pass/Warn/Fail | [notes] |
| Unique across site | Pass/Warn/Fail | [notes] |
| Accurately describes page | Pass/Warn/Fail | [notes] |
| Compelling copy | Pass/Warn/Fail | [notes] |

**Description Score**: [X]/10
**Issues Found**: [list]
**Recommended Description**: "[Optimized description]" ([X] chars)
```

## Step 4: Audit Header Structure

```markdown
## Header Structure Analysis

### Current Header Hierarchy
H1: [H1 text]
  H2: [H2 text]
    H3: [H3 text]

| Criterion | Status | Notes |
|-----------|--------|-------|
| Single H1 | Pass/Warn/Fail | Found: [X] H1s |
| H1 includes keyword | Pass/Warn/Fail | [notes] |
| Logical hierarchy | Pass/Warn/Fail | [notes] |
| H2s include keywords | Pass/Warn/Fail | [X]/[Y] contain keywords |
| No skipped levels | Pass/Warn/Fail | [notes] |
| Descriptive headers | Pass/Warn/Fail | [notes] |

**Header Score**: [X]/10
**Issues Found**: [list]
**Recommended Changes**: [suggestions]
```

## Step 5: Audit Content Quality

```markdown
## Content Quality Analysis
**Word Count**: [X] words
**Reading Level**: [Grade level]
**Estimated Read Time**: [X] minutes

| Criterion | Status | Notes |
|-----------|--------|-------|
| Sufficient length | ✅/⚠️/❌ | [comparison to ranking content] |
| Comprehensive coverage | ✅/⚠️/❌ | [notes] |
| Unique value/insights | ✅/⚠️/❌ | [notes] |
| Up-to-date information | ✅/⚠️/❌ | [notes] |
| Proper formatting | ✅/⚠️/❌ | [notes] |
| Readability | ✅/⚠️/❌ | [notes] |
| E-E-A-T signals | ✅/⚠️/❌ | [notes] |

**Content Elements Checklist**:
- [ ] Introduction with keyword
- [ ] Clear sections/structure
- [ ] Bullet points/lists
- [ ] Tables where appropriate
- [ ] Images/visuals
- [ ] Examples/case studies
- [ ] Statistics with sources
- [ ] FAQ section
- [ ] Conclusion with CTA

**Content Score**: [X]/10
**Gaps Identified**: [list]
**Recommendations**: [list]
```

## Step 6: Audit Keyword Usage

```markdown
## Keyword Optimization Analysis
**Primary Keyword**: "[keyword]"
**Keyword Density**: [X]%

### Keyword Placement
| Location | Present | Notes |
|----------|---------|-------|
| Title tag | ✅/❌ | Position: [X] |
| Meta description | ✅/❌ | [notes] |
| H1 | ✅/❌ | [notes] |
| First 100 words | ✅/❌ | Word position: [X] |
| H2 headings | ✅/❌ | In [X]/[Y] H2s |
| Body content | ✅/❌ | [X] occurrences |
| URL slug | ✅/❌ | [notes] |
| Image alt text | ✅/❌ | In [X]/[Y] images |

### Secondary Keywords
| Keyword | Occurrences | Status |
|---------|-------------|--------|
| [keyword 1] | [X] | ✅/⚠️/❌ |

### LSI/Related Terms
**Present**: [list]
**Missing**: [list]

**Keyword Score**: [X]/10
```

## Step 7: Audit Internal Links

```markdown
## Internal Linking Analysis
**Total Internal Links**: [X]
**Unique Internal Links**: [X]

| Criterion | Status | Notes |
|-----------|--------|-------|
| Number of internal links | ✅/⚠️/❌ | [X] (recommend 3-5+) |
| Relevant anchor text | ✅/⚠️/❌ | [notes] |
| Links to related content | ✅/⚠️/❌ | [notes] |
| No broken links | ✅/⚠️/❌ | [X] broken found |
| Natural placement | ✅/⚠️/❌ | [notes] |

**Current Internal Links**:
1. "[Anchor text]" -> [URL]

**Internal Linking Score**: [X]/10
**Recommended Additional Links**:
1. Add link to "[Related page]" with anchor "[suggested anchor]"

**Anchor Text Improvements**:
- Change "[current anchor]" to "[improved anchor]"
```

## Step 8: Audit Images

```markdown
## Image Optimization Analysis
**Total Images**: [X]

### Image Audit Table
| Image | Alt Text | File Name | Size | Status |
|-------|----------|-----------|------|--------|
| [img1] | [alt or "missing"] | [filename] | [KB] | ✅/⚠️/❌ |

| Criterion | Status | Notes |
|-----------|--------|-------|
| All images have alt text | ✅/⚠️/❌ | [X]/[Y] have alt |
| Descriptive file names | ✅/⚠️/❌ | [notes] |
| Appropriate file sizes | ✅/⚠️/❌ | [notes] |
| Modern formats (WebP) | ✅/⚠️/❌ | [notes] |
| Lazy loading enabled | ✅/⚠️/❌ | [notes] |

**Image Score**: [X]/10
**Recommendations**: [list]
```

## Step 9: Audit Technical On-Page Elements

```markdown
## Technical On-Page Analysis

| Element | Current Value | Status | Recommendation |
|---------|---------------|--------|----------------|
| URL | [URL] | ✅/⚠️/❌ | [notes] |
| URL length | [X] chars | ✅/⚠️/❌ | [notes] |
| Canonical tag | [URL or "missing"] | ✅/⚠️/❌ | [notes] |
| Mobile-friendly | [yes/no] | ✅/⚠️/❌ | [notes] |
| Page speed | [X]s | ✅/⚠️/❌ | [notes] |
| HTTPS | [yes/no] | ✅/⚠️/❌ | [notes] |
| Schema markup | [types or "none"] | ✅/⚠️/❌ | [notes] |

**Technical Score**: [X]/10
```

## Step 10: CORE-EEAT Quick Scan

Reference: [CORE-EEAT Benchmark](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/references/core-eeat-benchmark.md)

```markdown
## CORE-EEAT Quick Scan

| ID | Check Item | Status | Notes |
|----|-----------|--------|-------|
| C01 | Intent Alignment | ✅/⚠️/❌ | Title promise = content delivery |
| C02 | Direct Answer | ✅/⚠️/❌ | Core answer in first 150 words |
| C09 | FAQ Coverage | ✅/⚠️/❌ | Structured FAQ present |
| C10 | Semantic Closure | ✅/⚠️/❌ | Conclusion answers opening |
| O01 | Heading Hierarchy | ✅/⚠️/❌ | H1->H2->H3, no skipping |
| O02 | Summary Box | ✅/⚠️/❌ | TL;DR or Key Takeaways |
| O03 | Data Tables | ✅/⚠️/❌ | Comparisons in tables |
| O05 | Schema Markup | ✅/⚠️/❌ | Appropriate JSON-LD |
| O06 | Section Chunking | ✅/⚠️/❌ | Single topic per section |
| R01 | Data Precision | ✅/⚠️/❌ | >=5 precise numbers |
| R02 | Citation Density | ✅/⚠️/❌ | >=1 per 500 words |
| R06 | Timestamp | ✅/⚠️/❌ | Updated <1 year |
| R08 | Internal Link Graph | ✅/⚠️/❌ | Descriptive anchors |
| R10 | Content Consistency | ✅/⚠️/❌ | No contradictions |
| Exp01 | First-Person Narrative | ✅/⚠️/❌ | "I tested" or "We found" |
| Ept01 | Author Identity | ✅/⚠️/❌ | Byline + bio present |
| T04 | Disclosure Statements | ✅/⚠️/❌ | Affiliate links disclosed |

**CORE-EEAT Quick Score**: [X]/17 items passing
> For full 80-item audit, use `content-quality-auditor`.
```

## Step 11: Generate Audit Summary

```markdown
# On-Page SEO Audit Report
**Page**: [URL]
**Target Keyword**: [keyword]
**Audit Date**: [date]

## Overall Score: [X]/100

## Priority Issues

### Critical (Fix Immediately)
1. [Critical issue 1]

### Important (Fix Soon)
1. [Important issue 1]

### Minor (Nice to Have)
1. [Minor issue 1]

## Quick Wins
1. **[Change 1]**: [Why and how]
2. **[Change 2]**: [Why and how]

## Detailed Recommendations

### Title Tag
- **Current**: [current title]
- **Recommended**: [new title]

### Meta Description
- **Current**: [current description]
- **Recommended**: [new description]

### Content Improvements
1. [Specific content change with location]

### Internal Linking
1. Add link: "[anchor]" -> [destination]

### Image Optimization
1. [Image 1]: [change needed]

## Competitor Comparison

| Element | Your Page | Top Competitor | Gap |
|---------|-----------|----------------|-----|
| Word count | [X] | [Y] | [+/-Z] |
| Internal links | [X] | [Y] | [+/-Z] |
| Images | [X] | [Y] | [+/-Z] |
| H2 headings | [X] | [Y] | [+/-Z] |

## Action Checklist
- [ ] Update title tag
- [ ] Rewrite meta description
- [ ] Add keyword to H1
- [ ] Add [X] more internal links
- [ ] Add alt text to [X] images
- [ ] Add [X] more content sections
- [ ] Implement FAQ schema
- [ ] [Additional action items]
```
