import React from 'react'

export function AmzStaticPage({ title, html }: { title: string; html: string }) {
  return (
    <div className="container mx-auto px-4 py-10">
      <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6 shadow-sm md:p-10">
        <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <div
          className="prose prose-neutral mt-8 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-primary"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </article>
    </div>
  )
}
