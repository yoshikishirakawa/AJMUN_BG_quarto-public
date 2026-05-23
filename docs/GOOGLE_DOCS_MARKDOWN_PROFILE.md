# Google Docs Markdown Profile

## Positioning
- Google integration is optional
- Preferred import path is direct `.md` import
- Google Docs import remains available as a secondary workflow

## Recommended authoring rules
- Use heading levels consistently
- Use standard lists and tables only
- Keep custom AJMUN syntax in exported Markdown when possible
- Avoid unsupported layout tricks that rely on Google Docs styling only

## Import behavior
- `.md` files are stored as UTF-8
- Content is preserved as-is except for line-ending normalization (`CRLF -> LF`)
- The importer does not auto-reformat the Markdown body

## Operational guidance
- If the host configures Google OAuth, editors may search/import Docs through the app
- If Google is not configured, `.md` import remains fully available
