import React from 'react'

export function AmzStaticPage({ title, html }: { title: string; html: string }) {
  return (
    <main className="flex-1">
      <div className="container mx-auto px-4 py-12">
        <article className="mx-auto max-w-3xl rounded-lg border border-border bg-card p-6 shadow-sm md:p-10">
          <h1 className="mb-4 text-balance text-4xl font-bold text-foreground md:text-5xl">{title}</h1>
          <div
            className="prose prose-lg prose-neutral mt-8 max-w-none dark:prose-invert prose-headings:text-foreground prose-a:text-primary"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </article>
      </div>
    </main>
  )
}
