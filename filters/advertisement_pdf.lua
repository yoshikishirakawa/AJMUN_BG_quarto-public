-- 広告ページ処理フィルタ (Safe Version)
-- "広告"というタイトルのヘッダーを検知し、そのヘッダー以降の内容を \includepdf に置き換える。
-- ドキュメント全体を置換するのではなく、該当箇所だけを操作することで、
-- 結合後のドキュメントに対してフィルタが実行された場合でも本文を消さないようにする。

function Pandoc(doc)
  local blocks = doc.blocks
  local new_blocks = pandoc.List()
  local ad_found = false
  local img_path = "assets/37A4_1P_page-0001.jpg"

  for _, el in ipairs(blocks) do
    if not ad_found then
      -- まだ広告ヘッダーが見つかっていない場合
      -- より柔軟なマッチング ("広告"が含まれていればOK)
      if el.t == "Header" and pandoc.utils.stringify(el):match("広告") then
        ad_found = true
        -- 広告ヘッダーを見つけたので、TikZ overlay で最前面に画像を配置
        local tex = [[
\clearpage
\AmpSuppressDecorationsThisPage
\thispagestyle{empty}
\begin{tikzpicture}[remember picture, overlay]
  \node[anchor=center] at (current page.center) {%
    \includegraphics[width=\paperwidth, height=\paperheight]{]] .. img_path .. [[}%
  };
\end{tikzpicture}
\clearpage
]]
        new_blocks:insert(pandoc.RawBlock("latex", tex))
        -- ヘッダー自体は追加しない（削除）
      else
        -- 通常のブロックはそのまま維持
        new_blocks:insert(el)
      end
    else
      -- 広告ヘッダー以降のブロック（画像リンクなど）は全て無視（削除）
      -- 必要ならここで処理を終了しても良いが、ループを回して無視し続ける
    end
  end

  -- 見つかった場合のみ変更を適用
  if ad_found then
    return pandoc.Pandoc(new_blocks, doc.meta)
  end
  
  return doc
end
