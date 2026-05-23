-- テーブル列幅調整フィルタ（PDF用 - colmin）
--
-- 使い方（Markdown）:
--   | 見出しA | 見出しB | 見出しC |
--   |--------|--------|--------|
--   | ...    | ...    | ...    |
--   {.colmin cols="1,3"}
--
--   または
--
--   ::: {.colmin cols="1,3"}
--   | ... | ... |
--   :::
--
-- PDF出力では、指定された列を最小幅（内容に応じた幅）に設定します。
-- ロジック:
-- 1. 文字幅推定 (CJK=1.0, ASCII=0.5)
-- 2. 強制改行 (<br>) を考慮して最大幅を計算
-- 3. 基準幅 (41文字) に対する割合を算出
-- 4. 均等割幅 (1/N) を上限として設定
-- 5. 残りの幅を非対象列に均等配分

local REFERENCE_CHARS = 41.0

-- 文字幅推定
local function estimate_width(text)
  local width = 0
  local len = utf8.len(text)
  if not len then return 0 end
  
  for p, c in utf8.codes(text) do
    if c > 127 then
      width = width + 1.0 -- CJK etc.
    else
      width = width + 0.5 -- ASCII
    end
  end
  return width
end

-- ブロック内のテキスト幅を計算 (LineBreakで分割)
local function get_block_max_width(block)
  local max_w = 0
  local current_w = 0
  
  local function scanner(el)
    if el.t == 'Str' then
      current_w = current_w + estimate_width(el.text)
    elseif el.t == 'Space' then
      current_w = current_w + 0.5
    elseif el.t == 'LineBreak' then
      if current_w > max_w then max_w = current_w end
      current_w = 0
    elseif el.t == 'SoftBreak' then
      current_w = current_w + 0.5 -- Treat as space
    end
  end
  
  pandoc.walk_block(block, {
    Str = scanner, Space = scanner, LineBreak = scanner, SoftBreak = scanner,
    Code = function(e) current_w = current_w + estimate_width(e.text) end,
    Math = function(e) current_w = current_w + estimate_width(e.text) end,
    RawInline = function(e)
      if e.format == 'html' and e.text:match('<br') then
        if current_w > max_w then max_w = current_w end
        current_w = 0
      elseif e.format == 'latex' and e.text:match('\\newline') then
        if current_w > max_w then max_w = current_w end
        current_w = 0
      end
    end
  })
  
  if current_w > max_w then max_w = current_w end
  return max_w
end

local function parse_cols(raw)
  if not raw or raw == "" then return nil end
  local cols = {}
  raw = raw:gsub(",", " ")
  for token in raw:gmatch("%S+") do
    local n = tonumber(token)
    if n and n >= 1 and n <= 32 then
      cols[#cols + 1] = math.floor(n)
    end
  end
  if #cols == 0 then return nil end
  return cols
end

local function process_table(el, target_cols, use_booktabs)
  if not target_cols then return el end
  
  -- Determine number of columns
  local num_cols = 0
  if el.head and el.head.rows and #el.head.rows > 0 then
    num_cols = #el.head.rows[1].cells
  elseif el.bodies and #el.bodies > 0 and el.bodies[1].body and #el.bodies[1].body > 0 then
    num_cols = #el.bodies[1].body[1].cells
  end
  
  if num_cols == 0 then return el end
  
  -- Pre-process: Replace escaped <br> (Str "<br>") with LineBreak
  -- This ensures both width calculation and rendering treat it as a break.
  el = pandoc.walk_block(el, {
    Str = function(e)
      if e.text:find("<br>") then
        -- Simple split by "<br>"
        local text = e.text
        local result = {}
        local first = true
        
        -- Lua split pattern
        local last_pos = 1
        for s, e_pos in text:gmatch("()<br>()") do
          local part = text:sub(last_pos, s-1)
          if not first then table.insert(result, pandoc.RawInline("latex", "\\newline")) end
          if part ~= "" then table.insert(result, pandoc.Str(part)) end
          last_pos = e_pos
          first = false
        end
        local last_part = text:sub(last_pos)
        if not first then table.insert(result, pandoc.RawInline("latex", "\\newline")) end
        if last_part ~= "" then table.insert(result, pandoc.Str(last_part)) end
        
        -- If no <br> found (shouldn't happen due to check), return e
        if first then return e end
        
        return pandoc.List(result)
      end
      return nil
    end
  })
  
  -- Initialize widths
  local col_widths = {}
  local is_target = {}
  for i = 1, num_cols do
    col_widths[i] = 0
    is_target[i] = false
  end
  
  for _, idx in ipairs(target_cols) do
    if idx <= num_cols then is_target[idx] = true end
  end
  
  -- Pass 1: Calculate natural width for target columns
  -- Iterate all cells
  local function scan_row(row)
    for i, cell in ipairs(row.cells) do
      if is_target[i] then
        local w = 0
        -- Cell is a list of blocks. Check each block.
        for _, block in ipairs(cell.contents) do
          local bw = get_block_max_width(block)
          if bw > w then w = bw end
        end
        -- Add padding buffer (e.g. 1 char)
        w = w + 1.0
        if w > col_widths[i] then col_widths[i] = w end
      end
    end
  end
  
  if el.head then
    for _, row in ipairs(el.head.rows) do scan_row(row) end
  end
  if el.bodies then
    for _, body in ipairs(el.bodies) do
      for _, row in ipairs(body.body) do scan_row(row) end
    end
  end
  if el.foot then
    for _, row in ipairs(el.foot.rows) do scan_row(row) end
  end
  
  -- Calculate final fractions
  local equal_share = 1.0 / num_cols
  local final_widths = {}
  local used_width = 0
  local non_target_count = num_cols
  
  -- Set target widths
  for i = 1, num_cols do
    if is_target[i] then
      local frac = col_widths[i] / REFERENCE_CHARS
      if frac > equal_share then frac = equal_share end
      final_widths[i] = frac
      used_width = used_width + frac
      non_target_count = non_target_count - 1
    end
  end
  
  -- Distribute remaining width
  local remaining = 1.0 - used_width
  if remaining < 0 then remaining = 0 end
  
  local per_non_target = 0
  if non_target_count > 0 then
    per_non_target = remaining / non_target_count
  end
  
  -- Apply widths
  el.colspecs = {}
  for i = 1, num_cols do
    local w = 0
    if is_target[i] then
      w = final_widths[i]
    else
      w = per_non_target
    end
    
    -- Align left for target columns to prevent weird spacing if narrow
    local align = pandoc.AlignDefault
    if is_target[i] then align = pandoc.AlignLeft end
    
    if pandoc.ColWidth then
      el.colspecs[i] = {align, pandoc.ColWidth(w)}
    else
      el.colspecs[i] = {align, w}
    end
  end
  
  -- Apply booktabs styling if requested
  if use_booktabs then
    -- Add booktabs class for post-processing or direct attribute
    el.classes:insert("booktabs")
    -- Set attribute for LaTeX writer
    el.attributes["booktabs"] = "true"
  end
  
  return el
end

-- Div要素が見つかった場合 (::: {.colmin ...} 形式)
function Div(div)
  if FORMAT and not (FORMAT:match("latex") or FORMAT:match("beamer")) then return nil end

  if div.classes:includes("colmin") then
    local raw_cols = div.attributes["cols"]
    local cols = parse_cols(raw_cols)
    
    -- Parse new attributes with defaults
    -- デフォルト値: vlines=true, hlines=true, header-rows=1, header-cols=0
    local vlines = div.attributes["vlines"] ~= "false"  -- default true
    local hlines = div.attributes["hlines"] ~= "false"  -- default true
    local header_rows = tonumber(div.attributes["header-rows"]) or 1
    local header_cols = tonumber(div.attributes["header-cols"]) or 0
    -- Enable booktabs by default for PDF output, can be disabled with booktabs="false"
    local use_booktabs = div.attributes["booktabs"] ~= "false"
    
    if cols then
      return pandoc.walk_block(div, {
        Table = function(el) 
          -- Apply header rows logic
          local current_head_rows = el.head and #el.head.rows or 0
          
          -- If we need more header rows, move from body
          if header_rows > current_head_rows then
            local needed = header_rows - current_head_rows
            if el.bodies and #el.bodies > 0 and #el.bodies[1].body >= needed then
              for i = 1, needed do
                local row = table.remove(el.bodies[1].body, 1)
                el.head.rows:insert(row)
              end
            end
          -- If we need fewer header rows, move to body
          elseif header_rows < current_head_rows then
            local excess = current_head_rows - header_rows
            -- Ensure body exists
            if not el.bodies or #el.bodies == 0 then
              el.bodies = { pandoc.TableBody({}, {}, {}, {}) }
            end
            for i = 1, excess do
              local row = table.remove(el.head.rows, header_rows + 1)
              table.insert(el.bodies[1].body, 1, row) -- Insert at top of body
            end
          end
          
          -- Apply header cols logic (Bold first N cols)
          if header_cols > 0 then
            local function bold_cells(rows)
              for _, row in ipairs(rows) do
                for i = 1, math.min(header_cols, #row.cells) do
                  local cell = row.cells[i]
                  -- Wrap content in Strong if not already
                  -- Simple check: wrap all blocks content in Strong? 
                  -- Better: walk blocks and wrap in Strong? 
                  -- Easiest: Wrap the whole cell content in a Plain containing Strong
                  local new_content = pandoc.List()
                  local inlines = pandoc.List()
                  -- Flatten blocks to inlines if possible or just wrap blocks?
                  -- Wrapping blocks in Strong is not valid AST (Strong contains Inlines).
                  -- So we must convert blocks to inlines or wrap inlines inside blocks.
                  
                  cell.contents = pandoc.walk_block(pandoc.Div(cell.contents), {
                    Plain = function(b) return pandoc.Plain({pandoc.Strong(b.content)}) end,
                    Para = function(b) return pandoc.Para({pandoc.Strong(b.content)}) end
                  }).content
                end
              end
            end
            
            if el.bodies then
              for _, body in ipairs(el.bodies) do
                bold_cells(body.body)
              end
            end
            -- Note: We don't bold header rows' columns because they are usually already bold/distinct.
          end
          
          -- Set attributes for downstream filters
          el.attributes["vlines"] = tostring(vlines)
          el.attributes["hlines"] = tostring(hlines)
          
          return process_table(el, cols, use_booktabs) 
        end
      })
    end
  end
  return nil
end

-- ブロックリスト全体を走査して処理する (Legacy syntax support)
function Blocks(blocks)
  if FORMAT and not (FORMAT:match("latex") or FORMAT:match("beamer")) then return nil end

  local new_blocks = pandoc.List()
  local i = 1
  
  while i <= #blocks do
    local el = blocks[i]
    local next_el = blocks[i + 1]
    
    if el.t == "Table" then
      local processed = false
      if next_el and (next_el.t == "Para" or next_el.t == "Plain") then
        local text = pandoc.utils.stringify(next_el)
        local raw_cols = text:match("^%s*{%.colmin%s+cols=(.+)}")
        if raw_cols then
          local colmin_match = raw_cols:gsub('["\"\"]', "")
          local cols = parse_cols(colmin_match)
          if cols then
            new_blocks:insert(process_table(el, cols, true))  -- Enable booktabs by default
            i = i + 2
            processed = true
          end
        end
      end
      if not processed then
        new_blocks:insert(el)
        i = i + 1
      end
    else
      new_blocks:insert(el)
      i = i + 1
    end
  end
  return new_blocks
end

return {
  { Div = Div, Blocks = Blocks },
}
