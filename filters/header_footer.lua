-- filters/header_footer.lua
-- metadataからヘッダー/フッター設定を読み取り、LaTeXコマンドを生成

function Pandoc(doc)
  -- LaTeX以外は処理しない
  if not quarto.doc.is_format("latex") then
    return doc
  end

  local meta = doc.meta
  local latex_blocks = {}

  -- デフォルト値
  local footer_even = "AJMUN 37th"
  local footer_odd = "平和への課題：補遺"
  local header_even = ""
  local header_odd = ""

  -- metadataから値を取得
  if meta.footer then
    if meta.footer.even and meta.footer.even[1] then
      footer_even = meta.footer.even[1].text or meta.footer.even[1]
    end
    if meta.footer.odd and meta.footer.odd[1] then
      footer_odd = meta.footer.odd[1].text or meta.footer.odd[1]
    end
  end

  if meta.header then
    if meta.header.even and meta.header.even[1] then
      header_even = meta.header.even[1].text or meta.header.even[1]
    end
    if meta.header.odd and meta.header.odd[1] then
      header_odd = meta.header.odd[1].text or meta.header.odd[1]
    end
  end

  -- LaTeXコマンドを生成（TikZで使用）
  table.insert(latex_blocks, pandoc.RawBlock("latex",
    "\\newcommand{\\FooterTextEven}{" .. footer_even .. "}"))
  table.insert(latex_blocks, pandoc.RawBlock("latex",
    "\\newcommand{\\FooterTextOdd}{" .. footer_odd .. "}"))
  table.insert(latex_blocks, pandoc.RawBlock("latex",
    "\\newcommand{\\HeaderTextEven}{" .. header_even .. "}"))
  table.insert(latex_blocks, pandoc.RawBlock("latex",
    "\\newcommand{\\HeaderTextOdd}{" .. header_odd .. "}"))

  -- ドキュメント先頭に挿入
  local blocks = {}
  for _, block in ipairs(latex_blocks) do
    table.insert(blocks, block)
  end
  for _, block in ipairs(doc.blocks) do
    table.insert(blocks, block)
  end

  return pandoc.Pandoc(blocks, meta)
end
