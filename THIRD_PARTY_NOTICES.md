# Third-Party Notices

This repository ships code, fonts, sample assets, and representative outputs.
Review the notes below before redistributing material outside this repository or
repackaging it for third parties.

## Fonts bundled in the repository

- `fonts/` and `assets/fonts/` include the BIZ UDP Mincho / Gothic font files
  used by the HTML sample outputs.
- BIZ UDPMincho is licensed under the SIL Open Font License, Version 1.1, by the
  BIZ UDMincho Project Authors.
- BIZ UDGothic is licensed under the SIL Open Font License, Version 1.1, by the
  BIZ UDGothic Project Authors.
- The bundled OFL text is available at `licenses/OFL-1.1-BIZ-FONTS.txt`.
- Upstream repositories:
  - https://github.com/googlefonts/morisawa-biz-ud-mincho
  - https://github.com/googlefonts/morisawa-biz-ud-gothic

## System fonts referenced at PDF build time

- The PDF build pipeline references Harano Aji Mincho / Gothic via the TeX
  environment.
- These fonts are not bundled here as standalone distributable assets. Ensure
  your TeX environment provides them under terms appropriate for your use.

## Sample text, images, and generated outputs

- `content/`, `assets/`, `sample-outputs/`, and representative PDF/HTML outputs
  are included to demonstrate this project as a bundled sample workspace.
- Those materials contain project-specific editorial content, cited quotations,
  linked source references, and image assets. They are not licensed under the ISC
  software license unless explicitly stated.
- See `CONTENT_LICENSE.md` and `docs/ASSET_RIGHTS_MANIFEST.md` for the current
  content and asset redistribution terms.

## Dependency licenses

- JavaScript and Python dependency licenses remain governed by their respective
  upstream packages and lockfiles.
- Review `package-lock.json`, `ui-next/package-lock.json`, and Python package
  metadata before producing a downstream packaged release.
