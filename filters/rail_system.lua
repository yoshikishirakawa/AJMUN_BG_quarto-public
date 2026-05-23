-- filters/rail_system.lua
-- Injects LaTeX markers for the Proportional Rail Navigation System
-- Collects chapter/section page data for 2-pass PDF build
-- Writes directly to .raildata file from Lua (avoids LaTeX \write issues)

local raildata_file = nil
local raildata_path = nil

-- ファイル名からチャプタータイプを判定
local function get_chapter_type(filename)
  if not filename then return "special" end
  local base = filename:match("([^/\\]+)$") or filename
  base = base:lower()
  
  -- 非表示対象
  local hide_files = {
    ["index.qmd"] = true,
    ["00_front.md"] = true,
    ["90_afterword.md"] = true,
    ["99_advertisement.qmd"] = true,
  }
  if hide_files[base] then
    return "hide"
  end
  
  -- 参考文献・索引
  if base:match("^95_references") then
    return "references"
  end
  if base:match("^96_index") then
    return "index"
  end
  
  -- 本文チャプター (01_ch01 〜 06_ch06)
  if base:match("^%d%d_ch%d%d") then
    return "chapter"
  end
  
  return "special"
end

-- raildataファイルに書き込み (追記モード)
local function write_raildata(line)
  if not raildata_path then
    -- Determine output path based on Quarto's output directory
    local output_dir = os.getenv("QUARTO_PROJECT_OUTPUT_DIR") or "."
    raildata_path = output_dir .. "/navigation.raildata"
    
    -- First call: open in write mode to clear previous content
    local f = io.open(raildata_path, "w")
    if f then
      f:close()
    end
  end
  
  -- Append to file
  local f = io.open(raildata_path, "a")
  if f then
    f:write(line .. "\n")
    f:close()
  end
end

-- 現在処理中のファイルのタイプを取得
local current_file = PANDOC_STATE and PANDOC_STATE.input_files and PANDOC_STATE.input_files[1] or ""
local CHAPTER_TYPE = get_chapter_type(current_file)
local SHOW_RAIL = (CHAPTER_TYPE ~= "hide" and CHAPTER_TYPE ~= "special")

-- Track chapter index for ordering
local chapter_order = {
  ["01_ch01.md"] = 1,
  ["02_ch02.md"] = 2,
  ["03_ch03.md"] = 3,
  ["04_ch04.md"] = 4,
  ["05_ch05.md"] = 5,
  ["06_ch06.md"] = 6,
  ["95_references.qmd"] = 7,
  ["96_index.qmd"] = 8,
}

local function get_chapter_index(filename)
  if not filename then return 0 end
  local base = filename:match("([^/\\]+)$") or filename
  base = base:lower()
  return chapter_order[base] or 0
end

local CHAPTER_INDEX = get_chapter_index(current_file)

function Pandoc(doc)
  -- LaTeX以外は処理しない
  if not quarto.doc.is_format("latex") then
    return doc
  end
  
  local blocks = doc.blocks
  
  -- ドキュメント先頭にチャプターマーカーを挿入
  if CHAPTER_TYPE == "hide" then
    table.insert(blocks, 1, pandoc.RawBlock("latex", "\\RailMarkHide"))
  elseif CHAPTER_INDEX > 0 then
    -- 本文チャプター/参考文献/索引
    local marker = string.format("\\RailMarkChapter[%s]{%d}", CHAPTER_TYPE, CHAPTER_INDEX)
    table.insert(blocks, 1, pandoc.RawBlock("latex", marker))
  else
    local marker = string.format("\\RailMarkChapter[%s]{0}", CHAPTER_TYPE)
    table.insert(blocks, 1, pandoc.RawBlock("latex", marker))
  end
  
  return pandoc.Pandoc(blocks, doc.meta)
end

function Header(el)
  -- LaTeX以外は処理しない
  if not quarto.doc.is_format("latex") then
    return nil
  end
  
  local blocks = {}
  
  -- Needspace injection (見出し前の改ページ制御)
  if el.level == 2 then
    table.insert(blocks, pandoc.RawBlock('latex', '\\needspace{5\\baselineskip}'))
  elseif el.level == 3 then
    table.insert(blocks, pandoc.RawBlock('latex', '\\needspace{3\\baselineskip}'))
  elseif el.level == 4 then
    table.insert(blocks, pandoc.RawBlock('latex', '\\needspace{2\\baselineskip}'))
  end
  
  -- ヘッダー本体を追加
  table.insert(blocks, el)
  
  -- セクションマーカー (## = Level 2) を挿入
  -- ナビゲーションバー表示対象のチャプターでのみ
  if SHOW_RAIL and el.level == 2 then
    -- Insert section marker with chapter index
    local marker = string.format("\\RailMarkSection{%d}", CHAPTER_INDEX)
    table.insert(blocks, pandoc.RawBlock('latex', marker))
  end
  
  -- 変更がなければnilを返す
  if #blocks == 1 and blocks[1] == el then
    return nil
  end
  
  return blocks
end
