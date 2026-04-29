# Robots.txt Reference Guide

## Core Directives

### User-agent

Specifies which bot the rules apply to.

**Common user-agents**:
```
User-agent: *                    # All bots
User-agent: Googlebot            # Google's crawler
User-agent: Bingbot              # Bing's crawler
User-agent: GPTBot               # OpenAI's crawler
User-agent: CCBot                # Common Crawl bot
User-agent: anthropic-ai         # Anthropic's crawler
User-agent: PerplexityBot        # Perplexity AI crawler
User-agent: ClaudeBot            # Claude's web crawler
User-agent: Google-Extended      # Google AI training crawler
```

**Multiple user-agents**: Group rules by leaving no blank lines between user-agent declarations.

### Disallow

Blocks bots from crawling specified paths. `Disallow: [path]`

**Path matching**:
- `/` at end = directory and all subdirectories
- Without `/` at end = all paths starting with string
- `*` = wildcard, matches any sequence
- `$` = end of URL

**Examples**:
```
Disallow: /                      # Block entire site
Disallow: /admin/                # Block admin directory
Disallow: /*.pdf$                # Block all PDF files
Disallow: /*?                    # Block all URLs with parameters
Disallow:                        # Allow everything (empty disallow)
```

### Allow

Explicitly allows crawling (overrides Disallow). Supported by Google, Bing, and most major crawlers.

```
User-agent: *
Disallow: /admin/
Allow: /admin/public/
```

### Sitemap

```
Sitemap: https://example.com/sitemap.xml
```

- Must use absolute URLs (not relative)
- Can include multiple Sitemap directives
- Submit same sitemap(s) to Google Search Console

### Crawl-delay

`Crawl-delay: [seconds]` — NOT supported by Googlebot (use Search Console rate limiting). Supported by Bing, Yandex, and others.

---

## AI Crawler Management

### Block All AI Crawlers (Allow Search Indexing)

```
# Block AI training/scraping bots
User-agent: GPTBot
User-agent: ChatGPT-User
Disallow: /

User-agent: anthropic-ai
User-agent: ClaudeBot
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: PerplexityBot
Disallow: /

User-agent: Google-Extended
Disallow: /

# Allow search engines
User-agent: Googlebot
Disallow:

User-agent: Bingbot
Disallow:

Sitemap: https://example.com/sitemap.xml
```

### Allow Only Search Engines

```
User-agent: *
Disallow: /

User-agent: Googlebot
Disallow:

User-agent: Bingbot
Disallow:

User-agent: DuckDuckBot
Disallow:

Sitemap: https://example.com/sitemap.xml
```

---

## SEO-Critical Configurations

### Block URL Parameters (Prevent Duplicate Content)

```
User-agent: *
Disallow: /*?
Allow: /?

Sitemap: https://example.com/sitemap.xml
```

### E-commerce

```
User-agent: *
Disallow: /*?q=
Disallow: /*?sort=
Disallow: /*?filter=
Disallow: /account/
Disallow: /cart/
Disallow: /checkout/
Disallow: /admin/
Allow: /products/

Sitemap: https://example.com/sitemap.xml
```

### WordPress

```
User-agent: *
Disallow: /wp-admin/
Allow: /wp-admin/admin-ajax.php
Disallow: /wp-includes/
Disallow: /wp-content/plugins/
Disallow: /wp-content/themes/
Allow: /wp-content/uploads/
Disallow: /?s=
Disallow: /feed/
Disallow: /trackback/

Sitemap: https://example.com/sitemap_index.xml
```

---

## Common Mistakes and Fixes

| Mistake | Problem | Fix |
|---------|---------|-----|
| Blocking CSS/JS | Google can't render pages | `Allow: /css/` and `Allow: /js/` |
| Relative sitemap URL | `Sitemap: /sitemap.xml` not parsed | Use absolute URL: `Sitemap: https://...` |
| Spaces before colons | `User-agent : Googlebot` — invalid syntax | No spaces before colons |
| Missing trailing slash | `Disallow: /admin` also blocks `/administrator` | Use `Disallow: /admin/` for directory only |
| Blocking entire site with Allow | Many bots don't support Allow | Use noindex meta tags instead of robots.txt for de-indexing |
| No robots.txt on staging | Staging site gets indexed | Add `Disallow: /` on all non-production environments |
| Case sensitivity | Paths are case-sensitive; `Disallow: /Admin/` won't block `/admin/` | Block all case variants |

---

## Robots.txt vs Meta Robots vs X-Robots-Tag

| Method | Use Case | Key Limitation |
|--------|----------|----------------|
| **robots.txt** | Block crawling of directories, reduce crawl budget waste | Does NOT prevent indexing if page is linked elsewhere |
| **Meta robots** | Prevent specific pages from indexing, control snippets | Requires page to be crawled to be read |
| **X-Robots-Tag** | Control non-HTML files (PDFs, images) | Server config required |

**Critical**: To prevent indexing, use noindex (meta tag or header), NOT robots.txt.

---

## Testing and Validation

### Google Search Console Robots.txt Tester

1. Search Console → Settings → robots.txt
2. Test specific URLs against rules
3. Verify which user-agents are affected

### File Requirements

- Accessible (returns 200 status)
- Plain text, UTF-8 encoded
- Located at root domain (`/robots.txt`)
- Max 500KB (Google limit)
- Named exactly `robots.txt` (lowercase)

---

## Monitoring Cadence

**Monthly**: Verify accessibility, check Search Console for blocked URLs, review crawl stats
**Quarterly**: Audit blocked paths, check for new admin/private sections, review AI crawler landscape (new bots?)
**After site changes**: Update if URL structure changed, test new sections, verify sitemaps still referenced

### Search Console Reports to Check

- **Coverage** → Excluded by robots.txt
- **Settings** → Crawl stats
- **URL Inspection** → Test specific URLs

---

## Emergency Fixes

### Accidentally Blocked Entire Site

Fix robots.txt to `User-agent: * / Disallow:` + Sitemap, test in Search Console, request urgent recrawl. **Recovery time**: 1-7 days.

### Blocked CSS/JS Files

Add `Allow: /css/` and `Allow: /js/` directives. Test in robots.txt tester, request re-render via URL Inspection tool.

### Staging Site Indexed

Add `Disallow: /` to staging robots.txt, add noindex meta tag to all staging pages, remove URLs via Search Console Removals tool.
