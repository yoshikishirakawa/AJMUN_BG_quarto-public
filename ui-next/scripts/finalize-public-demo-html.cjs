const fs = require('node:fs')
const path = require('node:path')

const htmlPath = path.resolve(__dirname, '..', '..', 'sample-outputs', 'editor', 'index.html')
const title = 'AJMUN BG Editor 公開デモ'
const description = '保存・ビルド・認証・外部連携を無効化した AJMUN BG Editor の読み取り専用デモです。'
const descriptionMeta = `<meta name="description" content="${description}" />`

if (!fs.existsSync(htmlPath)) {
  throw new Error(`Public demo HTML was not found: ${htmlPath}`)
}

let html = fs.readFileSync(htmlPath, 'utf8')

if (/<html\b[^>]*>/i.test(html)) {
  html = html.replace(/<html\b([^>]*)>/i, (match, attrs) => {
    if (/\blang=/i.test(attrs)) {
      return match.replace(/\blang=(['"])[^'"]*\1/i, 'lang="ja"')
    }
    return `<html${attrs} lang="ja">`
  })
} else {
  html = `<!doctype html>\n<html lang="ja">\n${html}\n</html>`
}

if (/<title>.*?<\/title>/is.test(html)) {
  html = html.replace(/<title>.*?<\/title>/is, `<title>${title}</title>`)
} else {
  html = html.replace(/<head>/i, `<head>\n    <title>${title}</title>`)
}

if (/<meta\s+name=(['"])description\1[^>]*>/i.test(html)) {
  html = html.replace(/<meta\s+name=(['"])description\1[^>]*>/i, descriptionMeta)
} else if (/<meta\s+name=(['"])viewport\1[^>]*>/i.test(html)) {
  html = html.replace(/(<meta\s+name=(['"])viewport\2[^>]*>)/i, `$1\n    ${descriptionMeta}`)
} else {
  html = html.replace(/<head>/i, `<head>\n    ${descriptionMeta}`)
}

fs.writeFileSync(htmlPath, html.endsWith('\n') ? html : `${html}\n`)
