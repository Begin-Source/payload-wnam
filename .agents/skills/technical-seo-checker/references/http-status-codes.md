# HTTP Status Codes for SEO

## Quick Reference

| Code | Name | SEO Impact | Passes Link Equity? |
|------|------|------------|---------------------|
| 200 | OK | Positive | N/A (original URL) |
| 301 | Moved Permanently | Positive | Yes (~90-99%) |
| 302 | Found | Neutral | No |
| 304 | Not Modified | Neutral (caching) | N/A |
| 307 | Temporary Redirect | Neutral | No |
| 308 | Permanent Redirect | Positive | Yes |
| 404 | Not Found | Neutral/Negative | N/A |
| 410 | Gone | Neutral (faster de-index) | N/A |
| 429 | Too Many Requests | Negative | N/A |
| 451 | Unavailable For Legal Reasons | Negative | N/A |
| 500 | Internal Server Error | Very Negative | N/A |
| 503 | Service Unavailable | Neutral if brief | N/A |

---

## 200 OK

Standard response for working pages. SEO-positive — page is accessible and indexable.

**When it's a problem**: Different URLs return 200 for identical content (should use 301 redirect to consolidate).

**Soft 404s** (returns 200 but shows "not found" message): Search engines may keep page indexed, creating duplicate content issues. Fix: return proper 404 status code.

---

## 301 Moved Permanently

Passes 90-99% of link equity. Use for:
- Permanent URL structure changes
- Domain migrations
- HTTP → HTTPS, www → non-www consolidation
- Duplicate content consolidation

**Common mistakes**:
- Using 302 instead of 301 for permanent changes
- Creating redirect chains (A→B→C)
- Redirecting to irrelevant pages (creates soft 404 signal)
- Not redirecting HTTP to HTTPS

---

## 302 Found (Temporary Redirect)

Does NOT pass full link equity. Search engines keep indexing original URL.

**Use for**: A/B testing, temporary promotions, maintenance redirects.
**Never use for**: Permanent URL changes (use 301).
**Note**: Google may treat long-standing 302s as 301s, but always be explicit.

---

## 307 Temporary Redirect

Like 302 but guarantees HTTP method preservation (POST stays POST). Temporary — doesn't pass full link equity.

## 308 Permanent Redirect

Like 301 but guarantees HTTP method preservation. Passes link equity. Rare in SEO contexts.

---

## Redirect Chain Analysis

**Problem**: Multiple redirects before reaching final destination.

```
http://example.com/page
  → https://example.com/page        (redirect 1)
  → https://www.example.com/page    (redirect 2)
  → https://www.example.com/new-page (redirect 3)
```

**SEO impact**: Each hop slows load, dilutes link equity, wastes crawl budget.

**Fix**: Redirect directly from original URL to final destination:
```
http://example.com/page → https://www.example.com/new-page (single redirect)
```

### Redirect Loops

```
/page-a → /page-b → /page-a (infinite loop)
```

**Impact**: Page completely inaccessible. Browser shows "Too many redirects."

**Diagnose**: Check .htaccess/nginx config for conflicting rules. Use redirect checker tool. Fix conflicting rules, test, request recrawl.

---

## 404 Not Found

**When 404s are OK**: Legitimately deleted pages with no equivalent, never-existed URLs, expired temporary content.

**When 404s are problems**: Previously working pages broken, high-traffic pages deleted without redirect, important pages missing.

**Decision guide**:
- Content moved → 301 redirect to new location
- Content deleted, relevant alternative exists → 301 redirect
- Content permanently gone, no replacement → 410
- Never existed → leave as 404

**Monitor**: Search Console → Coverage → Not found (404). Fix high-value 404s first (most traffic/backlinks).

---

## 410 Gone

Stronger signal than 404 — tells search engines content is permanently deleted, never returning.

**Difference from 404**: Faster de-indexing, search engines stop crawling sooner, better for crawl budget.

**Use when**: No equivalent replacement exists (discontinued products, expired promotions, permanently removed content).

---

## 429 Too Many Requests

Rate limiting triggered. **Critical for SEO**: Ensure Googlebot isn't being rate-limited.

**Handle by**: Whitelisting verified search engine bots, configuring rate limits appropriately, monitoring crawl rate in Search Console.

---

## 451 Unavailable For Legal Reasons

Content removed due to legal demand (DMCA, court order, regulatory requirement).

**SEO handling**: Google de-indexes the URL. If content becomes legally available again, restore and submit for recrawl. Consider geo-targeted availability if restriction is jurisdiction-specific.

---

## 500 Internal Server Error

Very negative if persistent — prevents indexing and ranking.

**Diagnose**: Check server error logs, review recent code/config changes, disable plugins one by one (CMS), check .htaccess syntax.

**Action**: Set up alerts for 500 error spikes. Roll back recent changes if sudden onset.

---

## 503 Service Unavailable

Neutral if truly temporary with Retry-After header. Negative if prolonged.

**Proper maintenance use**:
```
HTTP/1.1 503 Service Unavailable
Retry-After: 3600
```

- Use 503 (not 404 or 500) for maintenance
- Keep maintenance brief (<24 hours)
- **Short-term (hours)**: Search engines retry, no ranking impact
- **Long-term (days+)**: May drop rankings, de-index pages

---

## Status Code Decision Flowchart

1. Content moved permanently? → **301**
2. Content moved temporarily? → **302**
3. Content deleted, replacement exists? → **301** to replacement
4. Content permanently gone, no replacement? → **410**
5. Content doesn't exist? → **404**
6. Server maintenance? → **503** with Retry-After
7. Content works normally? → **200**

---

## Crawl Budget Impact

| Impact Level | Status Codes |
|-------------|-------------|
| **Efficient** | 200, 301 (minimal chains), 410 (removes from queue) |
| **Moderate** | 302 (keeps checking), 404 (periodic recheck), redirect chains |
| **High waste** | 5xx (frequent retries), redirect loops, soft 404s, 429 (blocks crawling) |

---

## Diagnostic Scenarios

### "Page Won't Index"
Check: Status code (should be 200), redirects, 4xx/5xx errors, robots.txt blocking, noindex meta tag.

### "Page Disappeared from Results"
Check: Returns 404/410/5xx, redirecting elsewhere (301/302), changed to 403/401, server timing out (504).

### "Traffic Dropped After Migration"
Check: Old URLs return 404 (should be 301), redirect chains (should be direct), redirect loops, wrong redirect type (302 vs 301), incorrect redirect targets.

---

## Migration Checklist

- [ ] 301 redirects for all permanently moved pages
- [ ] Redirect directly to final destination (no chains)
- [ ] Test all redirects before launching
- [ ] Keep redirects in place for at least 1 year
- [ ] Monitor 404 errors in Search Console post-launch
- [ ] Map 1:1 where possible (old URL → equivalent new URL)

## Technical SEO Severity Framework

| Severity | Examples | Response Time |
|----------|---------|---------------|
| **Critical** | Site-wide 500 errors, robots.txt blocking site, noindex on key pages | Same day |
| **High** | Redirect chains, duplicate content, missing hreflang | Within 1 week |
| **Medium** | Missing schema, suboptimal canonicals, thin content | Within 1 month |
| **Low** | Image compression, minor CLS issues | Next quarter |
