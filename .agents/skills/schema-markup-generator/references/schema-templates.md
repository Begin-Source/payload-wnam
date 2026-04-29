# Schema.org JSON-LD Templates

Copy-ready structured data templates. Replace [bracketed values] with actual content.

## FAQPage Schema

```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "[Question text - must match visible page content]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Complete answer text]"
      }
    },
    {
      "@type": "Question",
      "name": "[Question 2]",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "[Answer 2]"
      }
    }
  ]
}
```

---

## HowTo Schema

```json
{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "[How-to title]",
  "description": "[Brief description]",
  "image": {
    "@type": "ImageObject",
    "url": "[Main image URL]",
    "height": "[height]",
    "width": "[width]"
  },
  "totalTime": "PT[X]H[Y]M",
  "estimatedCost": {
    "@type": "MonetaryAmount",
    "currency": "USD",
    "value": "[cost or 0]"
  },
  "supply": [
    { "@type": "HowToSupply", "name": "[Supply item 1]" },
    { "@type": "HowToSupply", "name": "[Supply item 2]" }
  ],
  "tool": [
    { "@type": "HowToTool", "name": "[Tool 1]" },
    { "@type": "HowToTool", "name": "[Tool 2]" }
  ],
  "step": [
    {
      "@type": "HowToStep",
      "position": 1,
      "name": "[Step 1 title]",
      "text": "[Step 1 instructions]",
      "url": "[Page URL]#step1",
      "image": "[Step 1 image URL]"
    },
    {
      "@type": "HowToStep",
      "position": 2,
      "name": "[Step 2 title]",
      "text": "[Step 2 instructions]",
      "url": "[Page URL]#step2"
    }
  ]
}
```

**Time format**: PT[X]H[Y]M (e.g., PT1H30M = 1 hour 30 minutes)

---

## Article / BlogPosting Schema

Use `Article`, `BlogPosting`, `NewsArticle`, or `TechArticle` as @type.

```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "[Title - max 110 chars]",
  "description": "[Summary or excerpt]",
  "image": ["[Image URL - 1200px wide]", "[4:3 ratio]", "[16:9 ratio]"],
  "datePublished": "[ISO 8601: 2024-01-15T08:00:00+00:00]",
  "dateModified": "[ISO 8601 date]",
  "author": {
    "@type": "Person",
    "name": "[Author Name]",
    "url": "[Author profile URL]"
  },
  "publisher": {
    "@type": "Organization",
    "name": "[Publisher Name]",
    "logo": {
      "@type": "ImageObject",
      "url": "[Logo URL - max 600x60px]"
    }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "[Canonical URL]"
  },
  "wordCount": "[word count]"
}
```

---

## Product Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "[Product Name]",
  "image": ["[Image URL 1]", "[Image URL 2]"],
  "description": "[Product description]",
  "sku": "[SKU]",
  "brand": { "@type": "Brand", "name": "[Brand Name]" },
  "offers": {
    "@type": "Offer",
    "url": "[Product page URL]",
    "priceCurrency": "USD",
    "price": "[29.99]",
    "priceValidUntil": "[2024-12-31]",
    "availability": "https://schema.org/InStock",
    "seller": { "@type": "Organization", "name": "[Seller Name]" }
  },
```

> **Review compliance**: `ratingValue`/`reviewCount` MUST reflect actual user reviews per Google Rich Results Policy and FTC rules (16 CFR 465, ~$53K/violation). Confirm: (1) reviews from verified users, (2) counts match site-visible reviews, (3) no review withholding. Add provenance comment in JSON-LD.

```json
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[4.5]",
    "reviewCount": "[89]",
    "bestRating": "5",
    "worstRating": "1"
  },
  "review": [
    {
      "@type": "Review",
      "reviewRating": { "@type": "Rating", "ratingValue": "[5]", "bestRating": "5" },
      "author": { "@type": "Person", "name": "[Reviewer Name]" },
      "reviewBody": "[Review text]",
      "datePublished": "[2024-01-15]"
    }
  ]
}
```

**Availability options**: `InStock`, `OutOfStock`, `PreOrder`, `Discontinued`, `LimitedAvailability`, `SoldOut`

---

## LocalBusiness Schema

Use specific subtypes when applicable: `Restaurant`, `Store`, `AutoRepair`, `HealthAndBeautyBusiness`, `LegalService`, etc.

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "[Business Name]",
  "image": "[Business image URL]",
  "@id": "[Business page URL]",
  "url": "[Website URL]",
  "telephone": "[+1-555-555-5555]",
  "priceRange": "[$$$]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Street]",
    "addressLocality": "[City]",
    "addressRegion": "[State]",
    "postalCode": "[ZIP]",
    "addressCountry": "US"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "[40.7128]",
    "longitude": "[-74.0060]"
  },
  "openingHoursSpecification": [
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      "opens": "09:00",
      "closes": "17:00"
    },
    {
      "@type": "OpeningHoursSpecification",
      "dayOfWeek": "Saturday",
      "opens": "10:00",
      "closes": "15:00"
    }
  ],
```

> **Review compliance**: Same rules as Product schema above apply.

```json
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[4.5]",
    "reviewCount": "[123]"
  }
}
```

---

## Organization Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "[Organization Name]",
  "url": "[Website URL]",
  "logo": "[Logo URL - 112x112px+]",
  "description": "[Company description]",
  "sameAs": ["[Facebook]", "[Twitter]", "[LinkedIn]", "[Instagram]", "[YouTube]"],
  "contactPoint": {
    "@type": "ContactPoint",
    "telephone": "[Phone]",
    "contactType": "customer service",
    "email": "[Email]",
    "availableLanguage": ["English"],
    "areaServed": "US"
  },
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Street]",
    "addressLocality": "[City]",
    "addressRegion": "[State]",
    "postalCode": "[ZIP]",
    "addressCountry": "US"
  }
}
```

---

## BreadcrumbList Schema

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "[Homepage URL]" },
    { "@type": "ListItem", "position": 2, "name": "[Category]", "item": "[Category URL]" },
    { "@type": "ListItem", "position": 3, "name": "[Current Page]", "item": "[Page URL]" }
  ]
}
```

---

## VideoObject Schema

```json
{
  "@context": "https://schema.org",
  "@type": "VideoObject",
  "name": "[Video title]",
  "description": "[Description]",
  "thumbnailUrl": "[Thumbnail URL - min 160x90px]",
  "uploadDate": "[ISO 8601 date]",
  "duration": "PT[X]M[Y]S",
  "contentUrl": "[Video file URL]",
  "embedUrl": "[Embed URL]",
  "interactionStatistic": {
    "@type": "InteractionCounter",
    "interactionType": { "@type": "WatchAction" },
    "userInteractionCount": "[view count]"
  }
}
```

---

## Event Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Event",
  "name": "[Event Name]",
  "description": "[Description]",
  "image": "[Event image URL]",
  "startDate": "[ISO 8601: 2024-06-15T19:00:00-05:00]",
  "endDate": "[ISO 8601 date]",
  "eventStatus": "https://schema.org/EventScheduled",
  "eventAttendanceMode": "https://schema.org/OfflineEventAttendanceMode",
  "location": {
    "@type": "Place",
    "name": "[Venue]",
    "address": {
      "@type": "PostalAddress",
      "streetAddress": "[Street]",
      "addressLocality": "[City]",
      "addressRegion": "[State]",
      "postalCode": "[ZIP]",
      "addressCountry": "US"
    }
  },
  "offers": {
    "@type": "Offer",
    "url": "[Ticket URL]",
    "price": "[price]",
    "priceCurrency": "USD",
    "availability": "https://schema.org/InStock",
    "validFrom": "[Sale start date]"
  },
  "organizer": { "@type": "Organization", "name": "[Organizer]", "url": "[URL]" }
}
```

**Status**: `EventScheduled`, `EventCancelled`, `EventPostponed`, `EventRescheduled`, `EventMovedOnline`
**Attendance**: `OfflineEventAttendanceMode`, `OnlineEventAttendanceMode`, `MixedEventAttendanceMode`

---

## Course Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Course",
  "name": "[Course Name]",
  "description": "[Description]",
  "provider": { "@type": "Organization", "name": "[Provider]", "sameAs": "[URL]" },
  "offers": { "@type": "Offer", "category": "Paid", "price": "[price]", "priceCurrency": "USD" },
  "hasCourseInstance": {
    "@type": "CourseInstance",
    "courseMode": "online",
    "courseWorkload": "PT[X]H",
    "instructor": { "@type": "Person", "name": "[Instructor]" }
  }
}
```

---

## Recipe Schema

```json
{
  "@context": "https://schema.org",
  "@type": "Recipe",
  "name": "[Recipe name]",
  "image": "[Image URL]",
  "author": { "@type": "Person", "name": "[Author]" },
  "datePublished": "[ISO 8601 date]",
  "description": "[Description]",
  "prepTime": "PT[X]M",
  "cookTime": "PT[X]M",
  "totalTime": "PT[X]M",
  "recipeYield": "[e.g., 4 servings]",
  "recipeCategory": "[e.g., Dinner]",
  "recipeCuisine": "[e.g., Italian]",
  "nutrition": { "@type": "NutritionInformation", "calories": "[cal/serving]" },
  "recipeIngredient": ["[Ingredient 1 with qty]", "[Ingredient 2]", "[Ingredient 3]"],
  "recipeInstructions": [
    { "@type": "HowToStep", "text": "[Step 1]" },
    { "@type": "HowToStep", "text": "[Step 2]" }
  ],
```

> **Review compliance**: Same rules as Product schema above apply.

```json
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[4.5]",
    "reviewCount": "[count]"
  }
}
```

---

## SoftwareApplication Schema

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "[Software name]",
  "operatingSystem": "[Windows, macOS, iOS, Android, Web]",
  "applicationCategory": "BusinessApplication",
  "offers": { "@type": "Offer", "price": "[price or 0]", "priceCurrency": "USD" },
```

> **Review compliance**: Same rules as Product schema above apply.

```json
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[4.5]",
    "reviewCount": "[count]"
  },
  "softwareVersion": "[version]",
  "downloadUrl": "[URL]"
}
```

---

## Multiple Schemas (Combined Array)

Wrap multiple schemas in a JSON array inside a single `<script type="application/ld+json">` tag. Each object gets its own `@context`.

---

## Implementation Notes

- Validate: validator.schema.org and search.google.com/test/rich-results
- Use absolute URLs; dates in ISO 8601; no trailing commas
- Schema must match visible page content
