-- 国際法引用環境フィルタ
-- lawquoteブロックとlawrefインラインを実装
-- 仕様: meta_docs/LAWQUOTE_SPEC.md

function Div(el)
  if not FORMAT:match 'html' then return nil end
  if el.classes:includes('lawquote') then
    -- lawquoteブロックの処理
    
    -- 新仕様: title属性が必須、slugは任意
    local title = el.attributes['title'] or ''
    local slug = el.attributes['slug'] or ''
    local summary = el.attributes['summary'] or ''
    
    -- 旧仕様互換: instrument/article/para（非推奨だが後方互換のため残す）
    local instrument = el.attributes['instrument'] or ''
    local article = el.attributes['article'] or ''
    local paragraph = el.attributes['paragraph'] or el.attributes['para'] or ''
    
    -- IDの生成
    local element_id = ''
    if slug ~= '' then
      -- slugが指定されている場合はそれを使用
      element_id = 'law:' .. slug
    elseif instrument ~= '' and article ~= '' and paragraph ~= '' then
      -- 旧仕様互換
      element_id = 'law:' .. instrument .. ':art' .. article .. '-' .. paragraph
    elseif instrument ~= '' and article ~= '' then
      element_id = 'law:' .. instrument .. ':art' .. article
    elseif instrument ~= '' then
      element_id = 'law:' .. instrument
    elseif title ~= '' then
      -- titleから自動生成（英数字とハイフンのみ）
      local auto_slug = title:lower():gsub('[^a-z0-9-]', '-'):gsub('%-+', '-'):gsub('^%-', ''):gsub('%-$', '')
      if auto_slug ~= '' then
        element_id = 'law:' .. auto_slug
      end
    end
    
    if element_id ~= '' then
      el.identifier = element_id
    end
    
    -- HTML構造の生成
    -- <section class="lawquote" id="..." role="note" aria-labelledby="...">
    --   <div class="lawquote-header">
    --     <span class="lawquote-title" id="...:title">Title</span>
    --     <span class="lawquote-meta">Meta</span>
    --   </div>
    --   <div class="lawquote-body">
    --     ... content ...
    --   </div>
    -- </section>
    
    -- role属性とaria属性を設定
    el.attributes['role'] = 'note'
    if element_id ~= '' then
      el.attributes['aria-labelledby'] = element_id .. ':title'
    end
    if summary ~= '' then
      el.attributes['aria-describedby'] = element_id .. ':summary'
    end
    
    -- ヘッダー部分の作成
    local header_content = pandoc.List()
    
    -- タイトル（インライン要素をサポート）
    if title ~= '' then
      -- title属性からインライン要素を解析
      local title_inlines = pandoc.read(title, 'markdown').blocks[1].content
      local title_span = pandoc.Span(title_inlines)
      title_span.classes = {'lawquote-title'}
      if element_id ~= '' then
        title_span.identifier = element_id .. ':title'
      end
      header_content:insert(title_span)
    end
    
    -- メタ情報（旧仕様互換）
    if instrument ~= '' or article ~= '' or paragraph ~= '' then
      local meta_parts = {}
      if instrument ~= '' then
        table.insert(meta_parts, instrument)
      end
      if article ~= '' then
        table.insert(meta_parts, '第' .. article .. '条')
      end
      if paragraph ~= '' then
        table.insert(meta_parts, '第' .. paragraph .. '項')
      end
      
      if #meta_parts > 0 then
        local meta_text = table.concat(meta_parts, ' ')
        local meta_span = pandoc.Span(pandoc.Str(meta_text))
        meta_span.classes = {'lawquote-meta'}
        header_content:insert(meta_span)
      end
    end
    
    -- ヘッダーDivの作成
    local header_div = pandoc.Div(pandoc.Para(header_content))
    header_div.classes = {'lawquote-header'}
    
    -- ボディDivの作成
    local body_div = pandoc.Div(el.content or {})
    body_div.classes = {'lawquote-body'}
    
    -- 新しいコンテンツを設定
    el.content = pandoc.List({header_div, body_div})
    
    return el
  end
end

function Str(el)
  -- lawrefインラインの処理
  -- 形式: {lawref=UNCharter:50-1}
  local matched = el.text:match("{lawref=([^}]+)}")
  if matched then
    local parts = {}
    for part in matched:gmatch("[^:]+") do
      table.insert(parts, part)
    end
    
    if #parts >= 2 then
      local instrument = parts[1]
      local reference = parts[2]
      
      -- リンクの生成
      local href = "#law:" .. instrument .. ":art" .. reference:gsub("-", "-")
      local link = pandoc.Link(
        pandoc.Str(matched),
        href,
        nil,
        pandoc.Attributes{
          class = "lawref",
          title = instrument .. " " .. reference
        }
      )
      
      return link
    end
  end
end

-- 下線のサポート（Pandoc標準のUnderlineを処理）
function Underline(el)
  -- lawquote内の下線を処理
  local span = pandoc.Span(el.content)
  span.classes = {'underline'}
  return span
end

-- LineBreakの処理（段落なし改行）
function LineBreak(el)
  -- lawquote内での改行を明示的に<br>として処理
  return pandoc.RawInline('html', '<br>')
end

-- Link要素の処理（lawquote内でのリンクをサポート）
function Link(el)
  -- lawquote内のリンクをそのまま処理
  -- 特別な処理が不要な場合はそのまま返す
  return el
end

function CodeBlock(el)
  -- コードブロックの処理（必要に応じて拡張）
  if el.classes:includes('law') then
    el.classes:insert('code-block')
    return el
  end
end

return {
  {Div = Div},
  {Str = Str},
  {Underline = Underline},
  {LineBreak = LineBreak},
  {Link = Link},
  {CodeBlock = CodeBlock}
}
