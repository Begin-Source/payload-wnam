interface ArticleContentProps {
  content: string
}

export function ArticleContent({ content }: ArticleContentProps) {
  // Simple markdown-like parsing for demo
  const parseContent = (text: string) => {
    const lines = text.trim().split('\n')
    const elements: JSX.Element[] = []
    let currentList: string[] = []
    let listType: 'ul' | 'ol' | null = null

    const flushList = () => {
      if (currentList.length > 0 && listType) {
        const ListTag = listType
        elements.push(
          <ListTag key={`list-${elements.length}`} className={listType === 'ul' ? 'list-disc list-inside space-y-2 my-4 text-muted-foreground' : 'list-decimal list-inside space-y-2 my-4 text-muted-foreground'}>
            {currentList.map((item, i) => (
              <li key={i} className="leading-relaxed">{item}</li>
            ))}
          </ListTag>
        )
        currentList = []
        listType = null
      }
    }

    lines.forEach((line, index) => {
      const trimmedLine = line.trim()
      
      if (!trimmedLine) {
        flushList()
        return
      }

      // Headings
      if (trimmedLine.startsWith('## ')) {
        flushList()
        const headingText = trimmedLine.replace('## ', '')
        const id = headingText.toLowerCase().replace(/\s+/g, '-').replace(/[^\w-]/g, '')
        elements.push(
          <h2 key={index} id={id} className="font-serif text-2xl font-bold text-foreground mt-10 mb-4 scroll-mt-24">
            {headingText}
          </h2>
        )
        return
      }

      if (trimmedLine.startsWith('### ')) {
        flushList()
        const headingText = trimmedLine.replace('### ', '')
        elements.push(
          <h3 key={index} className="font-serif text-xl font-semibold text-foreground mt-8 mb-3">
            {headingText}
          </h3>
        )
        return
      }

      // Lists
      if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
        if (listType !== 'ul') {
          flushList()
          listType = 'ul'
        }
        currentList.push(trimmedLine.slice(2))
        return
      }

      if (/^\d+\.\s/.test(trimmedLine)) {
        if (listType !== 'ol') {
          flushList()
          listType = 'ol'
        }
        currentList.push(trimmedLine.replace(/^\d+\.\s/, ''))
        return
      }

      // Paragraphs
      flushList()
      
      // Bold text handling
      let processedLine = trimmedLine
      processedLine = processedLine.replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground font-semibold">$1</strong>')
      
      elements.push(
        <p 
          key={index} 
          className="text-muted-foreground leading-relaxed my-4"
          dangerouslySetInnerHTML={{ __html: processedLine }}
        />
      )
    })

    flushList()
    return elements
  }

  return (
    <div className="prose-custom">
      {parseContent(content)}
    </div>
  )
}
