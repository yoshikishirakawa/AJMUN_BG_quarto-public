# Asset Rights Manifest

Date: 2026-04-27

This manifest records the current rights status for non-code assets distributed
with the repository. It is intentionally conservative: assets with incomplete
source or license information are treated as repository-bundled demonstration
assets only, not broadly reusable public-domain or open-license materials.

## Policy

- Code is covered by the repository `LICENSE`.
- Text, images, and representative PDF/HTML outputs are covered by
  `CONTENT_LICENSE.md`.
- BIZ font files are covered by `licenses/OFL-1.1-BIZ-FONTS.txt`.
- Any asset marked `needs-review` must be reviewed before a public release that
  grants reuse rights beyond repository viewing/evaluation.
- `google-docs-links-confirmed`: the project owner confirmed that bundled
  Google Docs source links may remain visible in the public sample outputs.

## Images

| Path | Status | Notes |
| --- | --- | --- |
| `assets/front_cover.jpg` | user-confirmed-cleared | Project owner confirmed source/owner/license are suitable for public redistribution. |
| `assets/back_cover.png` | user-confirmed-cleared | Project owner confirmed source/owner/license are suitable for public redistribution. |
| `assets/37A4_1P_page-0001.jpg` | user-confirmed-cleared | Advertisement/full-page image rights confirmed by project owner. |
| `assets/list.png` | replaced-cleared | Replaced with project-generated icon artwork for public release. |
| `assets/search.png` | replaced-cleared | Replaced with project-generated icon artwork for public release. |
| `assets/comment.png` | replaced-cleared | Replaced with project-generated icon artwork for public release. |
| `assets/setting.png` | replaced-cleared | Replaced with project-generated icon artwork for public release. |
| `assets/uploads/ch_012_1769933301_front_cover.jpg` | duplicate-user-confirmed-cleared | Duplicate/copy of front-cover image. |
| `assets/uploads/ch_013_1769933353_back_cover.png` | duplicate-user-confirmed-cleared | Duplicate/copy of back-cover image. |
| `assets/uploads/ch_014_1769933342_37A4_1P_page-0001.jpg` | duplicate-user-confirmed-cleared | Duplicate/copy of full-page image. |
| `sample-outputs/html/assets/**` | generated-copy | Contains copies of repository assets used by representative HTML output. |

## Fonts

| Path | Status | License |
| --- | --- | --- |
| `fonts/BIZUDPMincho-Regular.ttf` | cleared | SIL Open Font License 1.1 |
| `fonts/BIZUDPMincho-Bold.ttf` | cleared | SIL Open Font License 1.1 |
| `fonts/BIZUDPGothic-Regular.ttf` | cleared | SIL Open Font License 1.1 |
| `fonts/BIZUDPGothic-Bold.ttf` | cleared | SIL Open Font License 1.1 |
| `assets/fonts/BIZUDPMincho-Regular.ttf` | duplicate-cleared | SIL Open Font License 1.1 |
| `assets/fonts/BIZUDPMincho-Bold.ttf` | duplicate-cleared | SIL Open Font License 1.1 |
| `assets/fonts/BIZUDPGothic-Regular.ttf` | duplicate-cleared | SIL Open Font License 1.1 |
| `assets/fonts/BIZUDPGothic-Bold.ttf` | duplicate-cleared | SIL Open Font License 1.1 |
| `sample-outputs/html/**/fonts/*.ttf` | generated-copy | Copies of the bundled BIZ font files for self-contained sample output. |

## Representative Outputs

| Path | Status | Notes |
| --- | --- | --- |
| `sample-outputs/html/` | generated-sample | Contains generated HTML, copied assets, static libraries, and bundled fonts. |
| `sample-outputs/pdf/平和への課題：補遺.pdf` | generated-sample-user-confirmed-cleared | Generated PDF sample containing manuscript text, confirmed images, and embedded fonts. Metadata must be refreshed during release builds. |

## Source Links

| Scope | Status | Notes |
| --- | --- | --- |
| Google Docs links in manuscript and sample outputs | google-docs-links-confirmed | Project owner confirmed these source links may remain in public release artifacts. |

## Required Review Before Broad Redistribution

Before changing `CONTENT_LICENSE.md` to grant broad reuse rights for content,
complete the following:

- Confirm that quoted or translated excerpts are legally usable in the released
  form.
- Regenerate sample PDF metadata so title, author, subject, and producer metadata
  are release-appropriate.
