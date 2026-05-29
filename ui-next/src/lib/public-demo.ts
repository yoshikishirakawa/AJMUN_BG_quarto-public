export const isPublicDemoMode = () =>
  String(import.meta.env.VITE_PUBLIC_DEMO ?? 'false').toLowerCase() === 'true'

export const publicDemoBasePath = () => import.meta.env.BASE_URL || '/editor/'

export const publicDemoAssetUrl = (path: string) =>
  `${publicDemoBasePath()}${path.replace(/^\/+/, '')}`

export const publicSampleUrl = (path: string) =>
  `${publicDemoBasePath()}../${path.replace(/^\/+/, '')}`

export const editorImageUrl = (path: string) => isPublicDemoMode()
  ? publicDemoAssetUrl(path)
  : path.startsWith('/') ? path : `/${path}`
