-- 索引生成フィルタ（\index{term}[cat1|cat2]）
-- 各mdファイル単位で索引データを収集し、JSONに書き出す

local json = require("pandoc.json")
local utils = pandoc.utils

local function init_state()
  return {
    entries = {},
    heading_numbers = {
      chapter = nil,
      section = nil,
      subsection = nil,
      subsubsection = nil,
    },
    heading_titles = {},
    current_para_id = nil,
    para_counter = 0,
    para_occurrence = {},
    source_path = PANDOC_STATE and PANDOC_STATE.input_files[1] or "document",
    source_rel = nil,
    doc_title = nil,
    slug = nil,
  }
end

local state = init_state()

-- Helper for creating LaTeX index string (max 3 levels)
local function make_latex_index_str(parsed)
  local categories = parsed.categories or {}
  local term_str = parsed.term
  if parsed.reading then term_str = parsed.reading .. "@" .. term_str end
  
  if #categories == 0 then
    return term_str
  elseif #categories == 1 then
    return categories[1] .. "!" .. term_str
  else
    -- Max 3 levels support: Cat1 ! Cat2... ! Term
    -- Combine remaining categories into the second level
    local cat1 = categories[1]
    local rest = {}
    for i = 2, #categories do table.insert(rest, categories[i]) end
    local cat2 = table.concat(rest, " ")
    return cat1 .. "!" .. cat2 .. "!" .. term_str
  end
end

local function sanitize_slug(path)
  -- パスからファイル名を抽出（ディレクトリ部分を削除）
  local filename = path:match("([^/\\]+)$") or path
  -- 拡張子を削除
  filename = filename:gsub("%.[^.]+$", "")
  -- 英数字以外をハイフンに変換
  local slug = filename:gsub("[^%w]+", "-")
  slug = slug:gsub("-+", "-")
  slug = slug:gsub("^%-", ""):gsub("%-$", "")
  if slug == "" then
    slug = "doc"
  end
  return slug:lower()
end

local function infer_source_from_title(title)
  if not title or title == "" then
    return nil
  end
  if title:match("フロント挨拶") then
    return "content/00_front.md"
  end
  if title:match("あとがき") then
    return "content/90_afterword.md"
  end
  if title:match("参考文献") then
    return "content/95_references.qmd"
  end
  if title:match("索引") then
    return "content/96_index.qmd"
  end
  local chapter = title:match("第%s*(%d+)%s*章")
  if chapter then
    return string.format("content/%02d_ch%02d.md", tonumber(chapter), tonumber(chapter))
  end
  return nil
end

local function update_slug()
  local base = state.source_rel or state.source_path or "doc"
  state.slug = sanitize_slug(base)
end

update_slug()

local function trim(text)
  return text:gsub("^[ \t\n\r]+", ""):gsub("[ \t\n\r]+$", "")
end

local function copy_heading_numbers()
  local nums = state.heading_numbers
  local seq = {}
  if nums.chapter then table.insert(seq, nums.chapter) end
  if nums.section then table.insert(seq, nums.section) end
  if nums.subsection then table.insert(seq, nums.subsection) end
  if nums.subsubsection then table.insert(seq, nums.subsubsection) end
  return seq
end

local function most_recent_heading()
  for level = 4, 1, -1 do
    if state.heading_titles[level] then
      return state.heading_titles[level]
    end
  end
  return state.doc_title or "本文"
end

local function build_section_label()
  local nums = state.heading_numbers
  local parts = {}
  if nums.chapter then table.insert(parts, string.format("%d章", nums.chapter)) end
  if nums.section then table.insert(parts, string.format("%d節", nums.section)) end
  if nums.subsection then table.insert(parts, string.format("%d項", nums.subsection)) end
  if nums.subsubsection then table.insert(parts, tostring(nums.subsubsection)) end
  if #parts == 0 then
    return most_recent_heading()
  end
  return table.concat(parts)
end

local function safe_make_directory(path)
  if pandoc.system and pandoc.system.make_directory then
    local ok = pcall(pandoc.system.make_directory, path)
    if ok then
      return
    end
  end
  local escaped = path:gsub('"', '\\"')
  os.execute(string.format('mkdir -p "%s"', escaped))
end

local function ensure_build_dir()
  local index_dir = os.getenv("INDEX_BUILD_DIR") or "build/index"
  local parent = index_dir:match("^(.*)/[^/]+$")
  if parent and parent ~= "" then
    safe_make_directory(parent)
  end
  safe_make_directory(index_dir)
end

local function current_index_path()
  local index_dir = os.getenv("INDEX_BUILD_DIR") or "build/index"
  return string.format("%s/%s.json", index_dir, state.slug)
end

local function remove_file(path)
  local file = io.open(path, "r")
  if file then
    file:close()
    os.remove(path)
  end
end

local function start_para()
  state.para_counter = state.para_counter + 1
  state.current_para_id = state.para_counter
  state.para_occurrence[state.current_para_id] = 0
end

local function end_para()
  state.current_para_id = nil
end

local function allocate_anchor_id()
  if not state.current_para_id then
    start_para()
  end
  local id = state.current_para_id
  state.para_occurrence[id] = (state.para_occurrence[id] or 0) + 1
  local occurrence = state.para_occurrence[id]
  return string.format("idx-%s-%03d-%02d", state.slug, id, occurrence)
end

local function parse_categories(text)
  local categories = {}
  if not text then
    return categories
  end
  for item in text:gmatch("[^|]+") do
    local cleaned = trim(item)
    if cleaned ~= "" then
      table.insert(categories, cleaned)
    end
  end
  return categories
end

local function parse_index_command(raw)
  if raw.t ~= "RawInline" then
    return nil
  end
  local format = (raw.format or ""):lower()
  if not format:match("tex") and not format:match("latex") then
    return nil
  end
  local text = raw.text or ""
  if not text:match("\\index") then
    return nil
  end
  local term_body = text:match("\\index%s*{([^}]*)}")
  if not term_body or term_body == "" then
    return nil
  end
  local category_body = text:match("%[(.-)%]")
  local term = trim(term_body)
  if term == "" then
    return nil
  end
  local reading = nil
  local has_reading = false
  local at_pos = term:find("@")
  if at_pos then
    reading = trim(term:sub(at_pos + 1))
    term = trim(term:sub(1, at_pos - 1))
    if reading ~= "" then
      has_reading = true
    else
      reading = nil
    end
  end
  if term == "" then
    return nil
  end
  return {
    term = term,
    reading = reading ~= "" and reading or nil,
    categories = parse_categories(category_body),
    reading_source = has_reading and "explicit" or nil,
  }
end

local function register_entry(parsed, anchor_id)
  local cats = parsed.categories
  if cats and #cats == 0 then
    cats = nil
  end
  local entry = {
    term = parsed.term,
    reading = parsed.reading,
    categories = cats,
    anchor = anchor_id,
    section_label = build_section_label(),
    section_numbers = copy_heading_numbers(),
    heading = most_recent_heading(),
    source = state.source_rel or state.source_path,
    reading_source = parsed.reading_source,
  }
  table.insert(state.entries, entry)
end

local function handle_str_with_index(text)
  local out = pandoc.List()
  local pos = 1
  while pos <= #text do
    local s, e, term = text:find("\\index%s*{([^}]*)}", pos)
    if not s then
      local tail = text:sub(pos)
      if tail ~= "" then
        out:insert(pandoc.Str(tail))
      end
      break
    end
    if s > pos then
      out:insert(pandoc.Str(text:sub(pos, s - 1)))
    end
    local cat_s, cat_e, cat_body = text:find("%[(.-)%]", e + 1)
    local extra = ""
    local next_pos = e + 1
    if cat_s == e + 1 then
      extra = text:sub(cat_s, cat_e)
      next_pos = cat_e + 1
    end
    local raw_text = text:sub(s, e) .. extra
    local parsed = parse_index_command({
      t = "RawInline",
      format = "tex",
      text = raw_text
    })
    if parsed then
      local anchor_id = allocate_anchor_id()
      register_entry(parsed, anchor_id)
      if FORMAT:match("latex") or FORMAT:match("pdf") then
        local index_str = make_latex_index_str(parsed)
        local tex = string.format("\\label{%s}\\index{%s}", anchor_id, index_str)
        out:insert(pandoc.RawInline("latex", tex))
      else
        local anchor_html = string.format('<span id="%s" class="idx-anchor"></span>', anchor_id)
        out:insert(pandoc.RawInline("html", anchor_html))
      end
    else
      out:insert(pandoc.Str(text:sub(s, next_pos - 1)))
    end
    pos = next_pos
  end
  return out
end

local function extract_trailing_categories(inlines, index)
  local consumed = 0
  local i = index
  while i <= #inlines do
    local inline = inlines[i]
    if inline.t == "Space" or inline.t == "SoftBreak" or inline.t == "LineBreak" then
      consumed = consumed + 1
      i = i + 1
    else
      break
    end
  end
  local inline = inlines[i]
  if not inline or inline.t ~= "Str" then
    return nil, 0
  end
  local text = inline.text or inline.c or ""
  local body = text:match("^%[(.-)%]$")
  if not body then
    return nil, 0
  end
  return parse_categories(body), consumed + 1
end

local function parse_brace_index(text)
  -- {用語|idx|カテゴリ} または {用語|idx} 形式をパース
  local term, rest = text:match("^{([^|}]+)|idx([^}]*)}$")
  if not term then
    return nil
  end
  term = trim(term)
  if term == "" then
    return nil
  end
  
  -- アンダースコアをスペースに変換（用語内のスペース対策）
  term = term:gsub("_", " ")
  
  -- カテゴリと読みを抽出
  local categories = {}
  local reading = nil
  if rest and rest ~= "" then
    -- |の後の部分を処理
    if rest:sub(1, 1) == "|" then
      rest = rest:sub(2) -- 先頭の|を削除
    end
    -- カテゴリと読みを分離 (例: カテゴリ1|カテゴリ2@よみがな)
    local cat_part, read_part = rest:match("^([^@]*)@(.+)$")
    if cat_part then
      categories = parse_categories(cat_part)
      reading = trim(read_part)
      if reading == "" then
        reading = nil
      end
    else
      categories = parse_categories(rest)
    end
  end
  
  return {
    term = term,
    reading = reading,
    categories = categories,
    reading_source = reading and "explicit" or nil,
  }
end

local function process_inline_list(inlines)
  local result = pandoc.List()
  local i = 1
  while i <= #inlines do
    local inline = inlines[i]
    if inline.t == "RawInline" then
      local parsed = parse_index_command(inline)
      if parsed then
        if (not parsed.categories or #parsed.categories == 0) and i + 1 <= #inlines then
          local categories, consumed = extract_trailing_categories(inlines, i + 1)
          if categories and #categories > 0 then
            parsed.categories = categories
            i = i + consumed
          end
        end
        local anchor_id = allocate_anchor_id()
        register_entry(parsed, anchor_id)
        local anchor_html = string.format('<span id="%s" class="idx-anchor"></span>', anchor_id)
        result:insert(pandoc.RawInline("html", anchor_html))
      else
        result:insert(inline)
      end
    elseif inline.t == "Str" and inline.text and inline.text:find("\\index") then
      local pieces = handle_str_with_index(inline.text)
      for _, piece in ipairs(pieces) do
        result:insert(piece)
      end
    elseif inline.t == "Str" and inline.text and inline.text:find("{[^}]+|idx") then
      -- 新しい波括弧形式: {用語|idx|カテゴリ} を含む文字列を処理
      local text = inline.text
      local out = pandoc.List()
      local pos = 1
      while pos <= #text do
        local s, e = text:find("{[^}]+|idx[^}]*}", pos)
        if not s then
          local tail = text:sub(pos)
          if tail ~= "" then
            out:insert(pandoc.Str(tail))
          end
          break
        end
        if s > pos then
          out:insert(pandoc.Str(text:sub(pos, s - 1)))
        end
        local marker = text:sub(s, e)
        local parsed = parse_brace_index(marker)
        if parsed then
          local anchor_id = allocate_anchor_id()
          register_entry(parsed, anchor_id)
          if FORMAT:match("latex") or FORMAT:match("pdf") then
            local index_str = make_latex_index_str(parsed)
            local tex = string.format("\\label{%s}\\index{%s}", anchor_id, index_str)
            out:insert(pandoc.RawInline("latex", tex))
          else
            local anchor_html = string.format('<span id="%s" class="idx-anchor"></span>', anchor_id)
            out:insert(pandoc.RawInline("html", anchor_html))
          end
          -- 本文には何も表示しない（アンカーのみ）
        else
          out:insert(pandoc.Str(marker))
        end
        pos = e + 1
      end
      for _, piece in ipairs(out) do
        result:insert(piece)
      end
    elseif inline.t == "Str" and inline.text and inline.text:match("^\\%[") then
      -- エスケープされた [ を処理: \[term\]{.idx ...} の開始
      -- 次の要素を確認してSpanかどうかチェック
      if i + 1 <= #inlines then
        local next_inline = inlines[i + 1]
        if next_inline.t == "Span" and (next_inline.classes:includes('idx') or next_inline.classes:includes('index')) then
          -- \[ を [ に変換してSpanの前に挿入
          result:insert(pandoc.Str("["))
          -- Spanは次のイテレーションで処理される
          result:insert(inline)
        else
          result:insert(inline)
        end
      else
        result:insert(inline)
      end
    elseif inline.t == "Span" and (inline.classes:includes('idx') or inline.classes:includes('index')) then
      -- Span形式の索引マーカーを処理
      local term = utils.stringify(inline.content)
      if term ~= "" then
        local category_text = inline.attributes['data-cat'] or inline.attributes['cat']
        local categories = parse_categories(category_text)
        local reading = inline.attributes['data-reading'] or inline.attributes['reading']
        if reading and reading == "" then
          reading = nil
        end
        local parsed = {
          term = term,
          reading = reading,
          categories = categories,
          reading_source = reading and "explicit" or nil,
        }
        local anchor_id = allocate_anchor_id()
        register_entry(parsed, anchor_id)
        if FORMAT:match("latex") or FORMAT:match("pdf") then
          local index_str = make_latex_index_str(parsed)
          local tex = string.format("\\label{%s}\\index{%s}", anchor_id, index_str)
          result:insert(pandoc.RawInline("latex", tex))
        else
          local anchor_html = string.format('<span id="%s" class="idx-anchor"></span>', anchor_id)
          result:insert(pandoc.RawInline("html", anchor_html))
        end
      else
        result:insert(inline)
      end
    elseif inline.content and type(inline.content) == "table" then
      inline.content = process_inline_list(inline.content)
      result:insert(inline)
    else
      result:insert(inline)
    end
    i = i + 1
  end
  return result
end

local function handle_block_inlines(el)
  start_para()
  el.content = process_inline_list(el.content)
  end_para()
  return el
end

local function update_heading_numbers(el)
  local text = utils.stringify(el)
  state.heading_titles[el.level] = text
  for level = el.level + 1, 4 do
    state.heading_titles[level] = nil
  end
  if el.level == 1 then
    state.doc_title = state.doc_title or text
    if not state.source_rel then
      state.source_rel = infer_source_from_title(text)
      if state.source_rel then
        update_slug()
      end
    end
    local n = text:match("^%s*第%s*(%d+)%s*章") or text:match("^%s*(%d+)[%.．]")
    if n then
      state.heading_numbers.chapter = tonumber(n)
    end
    state.heading_numbers.section = nil
    state.heading_numbers.subsection = nil
    state.heading_numbers.subsubsection = nil
  elseif el.level == 2 then
    local ch, sec = text:match("^%s*(%d+)[%.．](%d+)")
    if ch and sec then
      state.heading_numbers.chapter = tonumber(ch)
      state.heading_numbers.section = tonumber(sec)
    else
      local sec_only = text:match("^%s*第%s*(%d+)%s*節")
      state.heading_numbers.section = sec_only and tonumber(sec_only) or nil
    end
    state.heading_numbers.subsection = nil
    state.heading_numbers.subsubsection = nil
  elseif el.level == 3 then
    local ch, sec, sub = text:match("^%s*(%d+)[%.．](%d+)[%.．](%d+)")
    if ch and sec and sub then
      state.heading_numbers.chapter = tonumber(ch)
      state.heading_numbers.section = tonumber(sec)
      state.heading_numbers.subsection = tonumber(sub)
    else
      local sub_only = text:match("^%s*第%s*(%d+)%s*項")
      if sub_only then
        state.heading_numbers.subsection = tonumber(sub_only)
      end
    end
    state.heading_numbers.subsubsection = nil
  elseif el.level == 4 then
    local ch, sec, sub, subsub = text:match("^%s*(%d+)[%.．](%d+)[%.．](%d+)[%.．](%d+)")
    if ch and sec and sub and subsub then
      state.heading_numbers.chapter = tonumber(ch)
      state.heading_numbers.section = tonumber(sec)
      state.heading_numbers.subsection = tonumber(sub)
      state.heading_numbers.subsubsection = tonumber(subsub)
    else
      local value = text:match("^%s*第%s*(%d+)%s*目")
      if value then
        state.heading_numbers.subsubsection = tonumber(value)
      end
    end
  end
end

function Meta(meta)
  if meta.title then
    state.doc_title = utils.stringify(meta.title)
  end
  local function meta_string(node)
    if not node then
      return nil
    end
    return trim(utils.stringify(node))
  end
  
  -- Quartoのメタデータから元のファイル名を取得
  local meta_source = nil
  
  -- 複数の可能性を試す
  if meta.quarto then
    meta_source = meta_string(meta.quarto["source-file"])
      or meta_string(meta.quarto["input-file"])
      or meta_string(meta.quarto["source-path"])
  end
  
  if not meta_source then
    meta_source = meta_string(meta["quarto-input-file"])
      or meta_string(meta["source-file"])
      or meta_string(meta["input-file"])
  end
  
  if meta_source and meta_source ~= "" then
    state.source_rel = meta_source
    update_slug()
  elseif state.doc_title then
    state.source_rel = infer_source_from_title(state.doc_title)
    if state.source_rel then
      update_slug()
    end
  end
  return meta
end

function Header(el)
  update_heading_numbers(el)
  return el
end

function Para(el)
  return handle_block_inlines(el)
end

function Plain(el)
  return handle_block_inlines(el)
end

function Pandoc(doc)
  -- 環境変数でJSONファイル生成のみモードを制御
  local generate_json_only = os.getenv("INDEX_GENERATE_JSON_ONLY")

  -- JSON生成は、明示的に要求された場合のみ行う。
  -- Quarto本番レンダリング中の一時ディレクトリ（out/content/build など）には
  -- JSONファイルを出力しないようにする。
  if generate_json_only then
    if #state.entries > 0 then
      ensure_build_dir()
      local path = current_index_path()
      local payload = {
        source = state.source_path,
        title = state.doc_title or "",
        entries = state.entries,
      }
      local file = assert(io.open(path, "w"))
      file:write(json.encode(payload))
      file:close()
    else
      -- 該当ドキュメントの索引がなくなった場合は古いJSONを削除
      remove_file(current_index_path())
    end
  end

  state = init_state()
  update_slug()
  return doc
end

return {
  {
    Meta = Meta,
    Header = Header,
    Para = Para,
    Plain = Plain,
    Pandoc = Pandoc,
  },
}
