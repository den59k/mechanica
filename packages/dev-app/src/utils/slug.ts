/** Slugify a heading title into an anchor id (e.g. "Get started" → "get-started"). */
export const slug = (text: string | undefined): string =>
  (text ?? '')
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
