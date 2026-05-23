export const isInternalLink = (href: string): boolean => {
  return /\.toc$/.test(href)
}
