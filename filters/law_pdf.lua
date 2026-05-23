-- 国際法引用環境フィルタ (PDF用)
-- lawquoteブロックをtcolorboxで装飾

-- Helper function to process inline br tags
local function process_inlines_for_br(inlines)
  local new_inlines = pandoc.List()
  local modified = false
  
  for _, el in ipairs(inlines) do
    if el.t == "Str" then
      local text = el.text
      if text:match("<br>") or text:match("\\<br\\>") or text:match("&lt;br&gt;") then
        local result = text:gsub("\\<br\\>", "###BR###")
                           :gsub("<br>", "###BR###")
                           :gsub("&lt;br&gt;", "###BR###")
        local parts = {}
        for part in string.gmatch(result .. "###BR###", "(.-)###BR###") do
          table.insert(parts, part)
        end
        for i, part in ipairs(parts) do
          if part ~= "" then
            new_inlines:insert(pandoc.Str(part))
          end
          if i < #parts then
            new_inlines:insert(pandoc.RawInline("latex", "\\\\"))
          end
        end
        modified = true
      else
        new_inlines:insert(el)
      end
    elseif el.t == "Span" and el.content then
      local new_content, was_modified = process_inlines_for_br(el.content)
      if was_modified then
        el.content = new_content
        modified = true
      end
      new_inlines:insert(el)
    else
      new_inlines:insert(el)
    end
  end
  
  return new_inlines, modified
end

-- Process blocks in lawquote to handle br tags
local function process_lawquote_content(blocks)
  local new_blocks = pandoc.List()
  for _, block in ipairs(blocks) do
    if block.t == "Para" then
      local new_inlines, _ = process_inlines_for_br(block.content)
      new_blocks:insert(pandoc.Para(new_inlines))
    elseif block.t == "Plain" then
      local new_inlines, _ = process_inlines_for_br(block.content)
      new_blocks:insert(pandoc.Plain(new_inlines))
    else
      new_blocks:insert(block)
    end
  end
  return new_blocks
end

function Div(el)
  if not FORMAT:match 'latex' then return nil end
  if el.classes:includes('lawquote') then
    -- 属性の取得
    local title = el.attributes['title'] or ''
    
    -- まず br タグを処理
    el.content = process_lawquote_content(el.content)
    
    -- LaTeX環境の生成
    local latex_begin = pandoc.List()
    local latex_end = pandoc.List()
    
    -- tcolorboxでフレーム付きボックスを作成
    if title ~= '' then
      -- まず脚注マーカーとマークダウンリンクを削除
     local clean_title = title:gsub('%[%^[^%]]+%]', '')  -- Remove footnotes [^xxx]
                              :gsub('%[([^%]]+)%]%(([^%)]+)%)', '%1')  -- Remove markdown links, keep text
      
      -- タイトルのエスケープ（基本的な特殊文字のみ）
      local safe_title = clean_title:gsub('\\\\', '\\\\textbackslash ')
                               :gsub('%%', '\\\\%%')
                               :gsub('%$', '\\\\$')
                               :gsub('_', '\\\\_')
                               :gsub('&', '\\\\&')
                               :gsub('#', '\\\\#')
                               :gsub('%^', '\\\\^{}')
                               :gsub('~', '\\\\~{}')
      
      -- tcolorboxのtitleオプションにprotectで保護して挿入
      latex_begin:insert(pandoc.RawBlock('latex', '\\begin{lawstyle}[title={\\protect ' .. safe_title .. '}]'))
    else
      latex_begin:insert(pandoc.RawBlock('latex', '\\begin{lawstyle}'))
    end
    
    latex_end:insert(pandoc.RawBlock('latex', '\\end{lawstyle}'))
    
    -- 新しいコンテンツを構築
    local new_content = pandoc.List()
    new_content:extend(latex_begin)
    new_content:extend(el.content)
    new_content:extend(latex_end)
    
    -- Divとして返す
    return pandoc.Div(new_content)
  end
end

return {
  {Div = Div}
}

