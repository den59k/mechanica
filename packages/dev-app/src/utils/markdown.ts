import MarkdownIt from 'markdown-it'

// Shared Markdown renderer for the docs blocks (Prose, Callout). The content is
// trusted (Claude/author-written), so raw HTML is disabled but links auto-link.
const md = new MarkdownIt({ html: false, linkify: true, typographer: true })

export const renderMarkdown = (src: string | undefined): string => md.render(src ?? '')
