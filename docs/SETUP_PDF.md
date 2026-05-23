# PDF Setup

## Required tools
- Quarto
- LuaLaTeX
- `latexmk`

## Host installation options
- macOS: install MacTeX or BasicTeX and ensure `/Library/TeX/texbin` is on `PATH`
- Linux: install TeX Live packages that provide `lualatex`, `latexmk`, and Japanese language support
- Existing TeX installations are supported as long as `quarto`, `lualatex`, and `latexmk` are visible on `PATH`

## Docker option
The standard Docker compose is lightweight and does not include TeX. Use the PDF
override when PDF generation should run inside Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.pdf.yml up --build
```

## Verify the environment
Run:

```bash
scripts/check_pdf_env.sh
```

Optional smoke render:

```bash
scripts/check_pdf_env.sh --render-smoke
```

## Notes
- PDF support is a first-class feature of this project
- The TeX toolchain does not have to be bundled with the repo, but it must be installed on the host or selected via the PDF Docker override
- `/api/v1/system/status` reports whether `quarto`, `lualatex`, and `latexmk` are available to the running API process
