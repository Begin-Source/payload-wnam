# Schema Markup Validation Guide

Complete reference for validating, testing, and troubleshooting structured data.

## Validation Tools

| Tool | URL | Purpose |
|------|-----|---------|
| Google Rich Results Test | https://search.google.com/test/rich-results | Check rich result eligibility |
| Schema.org Validator | https://validator.schema.org/ | Validate against Schema.org spec |
| Google Search Console | Enhancements section | Monitor rich results at scale |

---

## Common JSON-LD Syntax Errors

| Error | Bad | Fix |
|-------|-----|-----|
| Trailing comma | `"headline": "Title",` } | Remove comma after last property |
| Missing quotes | `@context: "..."` | Quote all property names: `"@context"` |
| Wrong date format | `"01/15/2024"` | ISO 8601: `"2024-01-15T08:00:00+00:00"` |
| Relative URL | `"/images/photo.jpg"` | Absolute: `"https://example.com/images/photo.jpg"` |
| Multiple values not in array | `"image": "a.jpg", "b.jpg"` | Use array: `["a.jpg", "b.jpg"]` |

---

## Required vs Recommended Properties

### FAQPage

| Property | Status | Notes |
|----------|--------|-------|
| mainEntity | Required | Array of Question objects |
| Question.name | Required | The question text |
| Answer.text | Required | The answer text |

Minimum: 2 Q&A pairs

### HowTo

| Property | Status | Notes |
|----------|--------|-------|
| name | Required | Title of the how-to |
| step | Required | Array of HowToStep objects |
| step.text | Required | Step instructions |
| image | Recommended | Improves visibility |
| totalTime | Recommended | Shows duration in results |

Minimum: 2 steps with text

### Article

| Property | Status | Notes |
|----------|--------|-------|
| headline | Required | Max 110 characters |
| image | Required | Minimum 1200px wide |
| datePublished | Required | ISO 8601 format |
| author | Required | Person or Organization |
| publisher | Required | Organization with logo |
| publisher.logo | Required | Max 600x60px |
| dateModified | Recommended | Update when content changes |

### Product

| Property | Status | Notes |
|----------|--------|-------|
| name | Required | Product name |
| image | Required | Product images |
| offers.price | Recommended | Required for price display |
| offers.priceCurrency | Recommended | Required for price display |
| offers.availability | Recommended | Stock status |
| aggregateRating | Recommended | Required for star ratings |
| brand / sku | Recommended | Product identifiers |

### LocalBusiness

| Property | Status | Notes |
|----------|--------|-------|
| name | Required | Business name |
| address | Required | Full PostalAddress object |
| geo | Recommended | Latitude/longitude |
| telephone | Recommended | Phone number |
| openingHoursSpecification | Recommended | Business hours |

### Organization

| Property | Status | Notes |
|----------|--------|-------|
| name | Required | Organization name |
| url | Required | Website URL |
| logo | Recommended | Brand logo |
| sameAs | Recommended | Social media profiles |

---

## Google Rich Result Eligibility

### FAQ Rich Results
- Minimum 2 Q&A pairs
- Questions must be actual questions
- Content must match visible page content exactly
- Not for forums, user-generated Q&A (use QAPage), or promotional content

### How-To Rich Results
- Minimum 2 steps with clear instructions
- Complete process from start to finish
- Not for single-step processes or recipes (use Recipe schema)

### Product Rich Results
- **Price display**: requires `offers` with `price`, `priceCurrency`, `availability`
- **Review stars**: requires `aggregateRating` or individual `review`
- Reviews must be genuine, not paid/incentivized

### Article Rich Results
- Valid Article/BlogPosting/NewsArticle schema
- Proper `publisher` with valid logo
- Images meet size requirements (1200px wide)
- Minimum ~300 words content

---

## Testing Workflow

### Initial Implementation
1. Add schema to dev/staging environment
2. Validate syntax at validator.schema.org
3. Test at Google Rich Results Test
4. View page source to confirm schema is present

### Pre-Launch
1. Test staging URL with Rich Results Test
2. Verify all required properties present
3. Confirm content matches visible page content
4. Test multiple schema types if combining

### Post-Launch Monitoring
1. Submit sitemap to Google Search Console
2. Monitor Enhancements reports for errors
3. Re-test pages if content changes
4. Fix errors within 30 days to avoid rich result removal

---

## Common Policy Violations

| Violation | Example | Fix |
|-----------|---------|-----|
| Content mismatch | FAQ schema with Q&A not visible on page | Schema must reflect actual page content |
| Deceptive content | Fake or incentivized reviews | Only include genuine, verifiable info |
| Spammy markup | Product schema on every blog post | Only use schema types relevant to page |
| Hidden content | FAQ answers only in schema | Make all schema content visible to users |
| Promotional FAQ | "Why is [Brand] the best?" | Use neutral, informational questions |

---

## Debugging Common Issues

### Schema Not Appearing in Rich Results Test
1. View page source (not inspect element) and search for `"@type"`
2. Check script tag has `type="application/ld+json"`
3. Copy JSON to validator.schema.org and fix syntax errors
4. Ensure content is not served dynamically after page load

### Rich Results Not Showing in Search
1. Check Search Console > Enhancements
2. Use URL Inspection tool to request indexing
3. Verify schema passes Rich Results Test
4. Allow days/weeks for new schema to appear

### Warnings vs Errors
- **Errors** (must fix): Invalid syntax, missing required properties, invalid values
- **Warnings** (should fix): Missing recommended properties, non-standard extensions

---

## Schema Maintenance Checklist

**Monthly**: Check Search Console for errors, verify rich results appearing, update `dateModified`
**Quarterly**: Audit all schema, test key pages, update outdated info, check for new relevant schema types
**After content changes**: Update schema to match, update `dateModified`, re-validate, request re-indexing
**After site migration**: Verify schema preserved, update absolute URLs, submit new sitemap

---

## Quick Reference: Error Messages

| Error Message | Fix |
|---------------|-----|
| "Missing required field" | Add the required property |
| "Invalid date format" | Use ISO 8601: 2024-01-15T08:00:00+00:00 |
| "URL is not absolute" | Add full URL with https:// |
| "Unexpected token" | Check for missing quotes, brackets, commas |
| "Not eligible for rich results" | Review eligibility requirements above |
| "Image too small" | Use image at least 1200px wide |
| "The attribute price is required" | Add offers.price property |

---

## Resources

- **Schema.org**: https://schema.org/
- **Google Search Central**: https://developers.google.com/search/docs/appearance/structured-data
- **Rich Results Test**: https://search.google.com/test/rich-results
- **Schema Validator**: https://validator.schema.org/
- **JSON-LD Playground**: https://json-ld.org/playground/
