# Content Refresh Templates

Templates for content-refresher steps 2-9. Referenced from [SKILL.md](https://github.com/aaron-he-zhu/seo-geo-claude-skills/blob/main/optimize/content-refresher/SKILL.md).

---

## Step 2: Identify Content Refresh Candidates

```markdown
## Content Refresh Analysis

### Content Audit Results

| Content | Published | Last Updated | Traffic Trend | Priority |
|---------|-----------|--------------|---------------|----------|
| [Title 1] | [date] | [date] | down -45% | High |
| [Title 2] | [date] | Never | down -30% | High |
| [Title 3] | [date] | [date] | down -20% | Medium |

### Refresh Prioritization

High Traffic + High Decline = Refresh Immediately
High Traffic + Low Decline = Schedule Refresh
Low Traffic + High Decline = Evaluate & Decide
Low Traffic + Low Decline = Low Priority
```

## Step 3: Analyze Individual Content for Refresh

```markdown
## Content Refresh Analysis: [Title]
**URL**: [URL]
**Published**: [date] | **Last Updated**: [date] | **Word Count**: [X]

### Performance Metrics

| Metric | 6 Mo Ago | Current | Change |
|--------|----------|---------|--------|
| Organic Traffic | [X]/mo | [X]/mo | [+/-X]% |
| Avg Position | [X] | [X] | [+/-X] |
| Impressions | [X] | [X] | [+/-X]% |
| CTR | [X]% | [X]% | [+/-X]% |

### Keywords Analysis

| Keyword | Old Position | Current Position | Change |
|---------|--------------|------------------|--------|
| [kw 1] | [X] | [X] | [+/-X] |
```

## Step 4: Identify Specific Updates Needed

```markdown
## Refresh Requirements

### Outdated Elements

| Element | Current | Update Needed |
|---------|---------|---------------|
| Year references | "[old year]" | Update to [current year] |
| Statistics | "[old stat]" | Find current data |
| Tool mentions | "[old tool]" | Add newer tools |
| Links | [X] broken | Fix or replace |

### Missing Information

| Topic | Competitor Coverage | Words Needed | Priority |
|-------|---------------------|--------------|----------|
| [Topic 1] | 3/5 competitors | ~300 words | High |

### SEO Updates Needed
- [ ] Update title tag with current year
- [ ] Refresh meta description
- [ ] Add new H2 sections for [topics]
- [ ] Update internal links to newer content
- [ ] Add FAQ section for featured snippets
- [ ] Refresh images and add new alt text

### GEO Updates Needed
- [ ] Add clear definition at start
- [ ] Include quotable statistics with sources
- [ ] Add Q&A formatted sections
- [ ] Update sources with current citations
- [ ] Create standalone factual statements
```

## Step 5: Create Refresh Plan

```markdown
## Content Refresh Plan

### Title/URL
**Current**: [current title]
**Refreshed**: [updated title with year/hook]

### Structural Changes
**Keep As-Is**: [sections still relevant]
**Update/Expand**: [sections needing updates]
**Add New Sections**: [new sections with word counts]
**Remove/Consolidate**: [outdated sections]

### Content Additions
**New Word Count Target**: [X] words (+[Y] from current)

| Section | Current | After Refresh | Notes |
|---------|---------|---------------|-------|
| Introduction | [X] | [X] | Add hook, update context |
| [Section 1] | [X] | [X] | Keep |
| [New Section] | 0 | [X] | Add entirely |
| FAQ | 0 | [X] | Add for GEO |

### Statistics to Update

| Old Statistic | New Statistic | Source |
|---------------|---------------|--------|
| "[old stat]" | "[find current]" | [source] |

### Links to Update

| Anchor Text | Old URL | New URL | Reason |
|-------------|---------|---------|--------|
| "[anchor]" | [old] | [new] | Broken |

### Images to Update

| Image | Action | New Alt Text |
|-------|--------|--------------|
| [img 1] | Replace | "[keyword-rich alt]" |
```

## Step 6: Write Refresh Content

```markdown
## Refreshed Content Sections

### Updated Introduction
[Write with: updated hook, fresh statistics, primary keyword in first 100 words]

### New Section: [Title]
[Cover topics competitors now cover, GEO-optimized with quotable statements]

### Updated Statistics
**Replace**: "[Old statement with outdated stat]"
**With**: "[New statement with current stat] (Source, [current year])"

### New FAQ Section
### [Question matching PAA/common query]?
[Direct answer in 40-60 words, optimized for featured snippets]
```

## Step 7: Optimize for GEO During Refresh

```markdown
## GEO Enhancement Opportunities

### Add Clear Definitions
> **[Topic]** is [clear, quotable definition in 40-60 words].

### Add Quotable Statements
**Transform**: "Email marketing is effective for businesses."
**Into**: "Email marketing delivers an average ROI of $42 for every $1 invested (DMA, [year])."

### Add Q&A Sections
- What is [topic]?
- How does [topic] work?
- Why is [topic] important?

### Update Citations
- Add sources for all statistics
- Link to authoritative references
- Include publication dates
- Use recent sources (last 2 years)
```

## Step 8: Generate Republishing Strategy

```markdown
## Republishing Strategy

### Date Strategy Options
1. **Update Published Date** -- Major overhaul (50%+ new content)
2. **Add "Last Updated" Date** -- Moderate updates (20-50% new)
3. **Keep Original Date** -- Minor updates (<20% new)

**Recommendation**: [Option X] because [reason]

### Technical Implementation
- [ ] Update `dateModified` in schema
- [ ] Update sitemap lastmod
- [ ] Clear cache after publishing
- [ ] Resubmit to search console

### Promotion Strategy
- [ ] Share on social media as "updated for [current year]"
- [ ] Send to email list if significant update
- [ ] Update internal links with fresh anchors
- [ ] Monitor rankings for 4-6 weeks
```

## Step 9: Create Refresh Report

```markdown
# Content Refresh Report

**Content**: [Title]
**Refresh Date**: [Date]
**Refresh Level**: [Major/Moderate/Minor]

## Changes Made

| Element | Before | After |
|---------|--------|-------|
| Word count | [X] | [Y] (+[Z]%) |
| Sections | [X] | [Y] |
| Statistics | [X] outdated | [Y] current |
| Internal links | [X] | [Y] |
| FAQ questions | 0 | [X] |

## Updates Completed
- [x] Updated title with current year
- [x] Refreshed meta description
- [x] Added [X] new sections
- [x] Updated [X] statistics with sources
- [x] Fixed [X] broken links
- [x] Added FAQ section for GEO

## Expected Outcomes

| Metric | Current | 30-Day Target | 90-Day Target |
|--------|---------|---------------|---------------|
| Avg Position | [X] | [Y] | [Z] |
| Organic Traffic | [X]/mo | [Y]/mo | [Z]/mo |

**Next Review**: [Date - 6 months from now]
```
