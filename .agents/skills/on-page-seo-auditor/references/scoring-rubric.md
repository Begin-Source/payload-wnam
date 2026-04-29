# On-Page SEO Scoring Rubric

Score each section independently, apply weights, sum for overall score (out of 100).

## Section 1: Title Tag (Weight: 15%, Max: 15 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Keyword presence | 3 | Primary keyword appears in title |
| Keyword position | 2 | Primary keyword in first half of title |
| Length optimization | 2 | Between 50-60 characters |
| Uniqueness | 2 | Title is unique across the site |
| Compelling copy | 2 | Includes benefit, modifier, or hook |
| Intent match | 2 | Title matches search intent accurately |
| Brand inclusion | 1 | Brand name present (at end) |
| No truncation risk | 1 | Displays fully in SERP without cutoff |

## Section 2: Meta Description (Weight: 5%, Max: 5 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Keyword inclusion | 1 | Primary keyword appears naturally |
| Length optimization | 1 | Between 150-160 characters |
| Call-to-action | 1 | Contains explicit or implicit CTA |
| Unique description | 1 | Not duplicated from other pages |
| Accurate summary | 1 | Accurately describes page content |

## Section 3: Header Structure (Weight: 10%, Max: 10 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Single H1 present | 2 | Exactly one H1 on the page |
| H1 contains keyword | 2 | Primary keyword in H1 text |
| Logical hierarchy | 2 | No skipped levels (H1->H2->H3) |
| H2s cover key subtopics | 2 | H2s address main topic facets |
| Descriptive headers | 1 | Headers describe section content clearly |
| Keyword variations in H2s | 1 | Secondary keywords or LSI terms in subheadings |

## Section 4: Content Quality (Weight: 25%, Max: 25 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Sufficient length | 4 | Meets minimum for query type (see benchmarks) |
| Comprehensive coverage | 4 | Covers all major subtopics that top-ranking pages cover |
| Unique value | 4 | Original insights, data, or perspective |
| Up-to-date information | 3 | Statistics, dates, and references are current |
| Proper formatting | 3 | Uses lists, tables, bold, images for readability |
| Readability | 3 | Appropriate reading level for target audience |
| E-E-A-T signals | 4 | Author byline, credentials, first-person experience, cited sources |

### Content Length Benchmarks

| Query Type | 4/4 | 3/4 | 2/4 | Below 1/4 |
|-----------|-----|-----|-----|-----------|
| Informational | 1,500+ | 1,000-1,499 | 500-999 | <500 |
| Commercial | 1,200+ | 800-1,199 | 400-799 | <400 |
| Transactional | 500+ | 350-499 | 200-349 | <200 |
| Local | 400+ | 250-399 | 150-249 | <150 |

## Section 5: Keyword Optimization (Weight: 15%, Max: 15 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Keyword in title | 2 | Primary keyword in title tag |
| Keyword in H1 | 2 | Primary keyword in H1 |
| Keyword in first 100 words | 2 | Primary keyword appears early |
| Keyword density (0.5-2.5%) | 2 | Natural density, not stuffed |
| Secondary keywords present | 2 | 2-3 secondary/related keywords used |
| LSI/semantic terms | 2 | Related terms and synonyms present |
| Keyword in URL | 1 | Primary keyword in URL slug |
| Keyword in image alt text | 1 | At least one image alt contains keyword naturally |
| Keyword in meta description | 1 | Primary keyword in meta description |

### Keyword Density Guidelines

| Density | Score Impact |
|---------|-------------|
| 0.5-2.0% | Full points |
| 2.0-2.5% | -1 point |
| 2.5-3.0% | -2 points |
| >3.0% | 0 points (keyword stuffing) |
| <0.5% | -1 point |

## Section 6: Internal/External Links (Weight: 10%, Max: 10 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Internal link count | 2 | 3-5+ contextual internal links (per 1,000 words) |
| Internal link relevance | 2 | Links point to topically related pages |
| Descriptive anchor text | 2 | Anchors describe destination, not "click here" |
| External link quality | 2 | Links to authoritative, relevant external sources |
| No broken links | 1 | All links return 200 status |
| Link placement | 1 | Links placed naturally within content flow |

### Internal Link Count Guidelines

| Content Length | Minimum | Ideal Range | Too Many |
|---------------|---------|-------------|---------|
| <500 words | 2 | 2-4 | >8 |
| 500-1,000 words | 3 | 3-6 | >12 |
| 1,000-2,000 words | 4 | 5-10 | >20 |
| 2,000+ words | 5 | 8-15 | >25 |

## Section 7: Image Optimization (Weight: 10%, Max: 10 points)

### Image alt text (WCAG 1.1.1 primary, SEO secondary)

- PASS: descriptive alt present on all content images; natural keyword inclusion where relevant
- PARTIAL: descriptive alt present but some images missing; OR all alt present but some keyword-stuffed
- FAIL: missing alt on content images, OR alt text is just "image of X" / keyword list

Reference: [WCAG 2.2 SC 1.1.1](https://www.w3.org/WAI/WCAG22/Understanding/non-text-content)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Descriptive file names | 1 | Files named descriptively (keyword-research-tool.webp) |
| Optimized file sizes | 2 | <200KB photos, <50KB graphics |
| Modern formats | 1 | Uses WebP or AVIF where supported |
| Lazy loading | 1 | Below-fold images use loading="lazy" |

### Image Size Guidelines

| Image Type | Target Size | Format |
|-----------|------------|--------|
| Hero/banner | <200KB | WebP |
| Content photos | <150KB | WebP |
| Screenshots | <100KB | WebP/PNG |
| Icons/graphics | <30KB | SVG/WebP |
| Thumbnails | <50KB | WebP |

## Section 8: Page-Level Technical (Weight: 10%, Max: 10 points)

| Criterion | Points | Requirement |
|-----------|--------|-------------|
| Clean URL structure | 2 | Short, descriptive, keyword-containing URL |
| Correct canonical tag | 2 | Self-referencing or appropriate cross-domain canonical |
| Mobile-friendly | 2 | Passes mobile-friendly test, responsive layout |
| Page speed (LCP) | 2 | LCP <=2.5s on mobile |
| HTTPS | 1 | Page served over HTTPS with valid certificate |
| Schema markup | 1 | Appropriate schema type implemented |

## Overall Score Calculation

```
Overall Score = Sum of (Section Score / Section Max * Section Weight * 100)
```

### Section Weight Distribution

| Audit Section | Weight | Max Score |
|--------------|--------|-----------|
| Title Tag | 15% | 15 |
| Meta Description | 5% | 5 |
| Header Structure | 10% | 10 |
| Content Quality | 25% | 25 |
| Keyword Optimization | 15% | 15 |
| Internal/External Links | 10% | 10 |
| Image Optimization | 10% | 10 |
| Page-Level Technical | 10% | 10 |

### Scoring Scale

| Score | Meaning | Action Required |
|-------|---------|-----------------|
| 10/10 | Excellent | None |
| 7-9/10 | Good | Optional optimization |
| 4-6/10 | Needs work | Fix within this week |
| 1-3/10 | Poor | Fix immediately (Critical) |
| 0/10 | Missing/broken | Fix immediately (Blocking) |

### Overall Score Interpretation

| Score Range | Grade | Assessment |
|------------|-------|-----------|
| 90-100 | A+ | Exceptional -- minor tweaks only |
| 80-89 | A | Strong -- a few optimization opportunities |
| 70-79 | B | Good -- several areas need attention |
| 60-69 | C | Average -- significant improvements needed |
| 50-59 | D | Below average -- major issues present |
| <50 | F | Poor -- comprehensive overhaul required |

## Common Issue Resolution Playbook

### Title Tag Issues

| Issue | Impact | Quick Fix Template |
|-------|--------|-------------------|
| Missing title | Critical | "[Primary Keyword]: [Benefit] | [Brand]" |
| Too long (>60 chars) | Medium | Move brand to end, remove filler words |
| Too short (<30 chars) | Medium | Add modifier, benefit, or year |
| Missing keyword | High | Include primary keyword in first half |
| Duplicate title | High | Add page-specific modifier |

### Meta Description Issues

| Issue | Impact | Quick Fix Template |
|-------|--------|-------------------|
| Missing description | Medium | "[What this page covers]. [Key benefit]. [CTA]." (150-160 chars) |
| Too long (>160 chars) | Low | Trim; ensure core message fits in 150 chars |
| Missing keyword | Low | Naturally incorporate primary keyword |
| No CTA | Low | Add: "Learn more", "Get started", etc. |
| Duplicated | Medium | Write unique description for each page |

### Header Issues

| Issue | Impact | Quick Fix |
|-------|--------|-----------|
| Missing H1 | Critical | Add one H1 per page with primary keyword |
| Multiple H1s | High | Keep one H1, convert others to H2 |
| Skipped levels | Medium | Use sequential hierarchy: H1->H2->H3 |
| Not descriptive | Medium | Rewrite to include keyword variations |
| No H2s | Medium | Add descriptive H2s every 200-300 words |

### Content Issues

| Issue | Impact | Quick Fix |
|-------|--------|-----------|
| Thin content (<300 words) | Critical | Expand with subtopics, FAQ, examples |
| Keyword stuffing (>3%) | High | Reduce usage, use synonyms |
| No structured data | Medium | Add relevant schema (FAQ, HowTo, Article) |
| Missing internal links | Medium | Add 3-5 contextual internal links |
| No images | Low | Add 2-3 relevant images with alt text |

## Industry Benchmarks

### Content Length by Query Type

| Query Type | Top 10 Average | Recommended Minimum |
|-----------|---------------|-------------------|
| Informational (guides) | 2,200 words | 1,500 words |
| Commercial (reviews) | 1,800 words | 1,200 words |
| Transactional (product) | 800 words | 500 words |
| Local (service pages) | 600 words | 400 words |
| Definition queries | 1,200 words | 800 words |

### Page Speed Benchmarks

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | <=2.5s | 2.5-4.0s | >4.0s |
| FID/INP | <=100ms/200ms | 100-300ms | >300ms |
| CLS | <=0.1 | 0.1-0.25 | >0.25 |
| TTFB | <=800ms | 800-1800ms | >1800ms |

## Accessibility (WCAG 2.2 AA)

| Criterion | Check |
|---|---|
| 1.1.1 Non-text content | All images have functional alt text |
| 1.3.1 Info and relationships | Headings nested logically, no empty headings |
| 1.4.3 Contrast (minimum) | Normal text >= 4.5:1; large text >= 3:1 |
| 2.4.7 Focus visible | Keyboard focus indicator visible on all interactive elements |
| 4.1.2 Name, role, value | ARIA labels on custom controls; form fields have accessible names |

Flag failures as HIGH priority (SEO signal + legal risk).

### When to Adjust Weights

| Page Type | Increase Weight | Decrease Weight |
|-----------|----------------|----------------|
| E-commerce product | Image Optimization, Technical | Content Quality |
| Long-form guide | Content Quality, Keywords | Image Optimization |
| Landing page | Technical, Title | Content Quality |
| Local service page | Technical, Links | Keywords |

Document weight adjustments and reasoning in the audit report.
