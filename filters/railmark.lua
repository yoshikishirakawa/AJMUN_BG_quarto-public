-- railmark.lua
-- Insert navigation markers for the proportional rail without patching \chapter.
-- - Adds \RailMarkChapter[type] at the start of each source doc.
-- - Adds \RailMarkSubsection before level-3 headings (###) for tick marks,
--   except for special/toc chapters where ticks are suppressed.

local function basename(path)
  return (path:gsub("[/\\]+$", ""):match("([^/\\]+)$")) or path
end

local function classify(fname)
  local base = basename(fname or ""):lower()
  if base == "00_toc.qmd" then
    return "toc"
  end
  local special = {
    ["index.qmd"] = true,
    ["00_front.md"] = true,           -- 挨拶
    ["90_afterword.md"] = true,       -- 編集後記
    ["95_references_structured.qmd"] = true, -- 参考文献
    ["96_index.qmd"] = true,          -- 索引
    ["99_advertisement.qmd"] = true,  -- 広告
    ["99_back.qmd"] = true,           -- 裏表紙
  }
  if special[base] then
    return "special"
  end
  return "chapter"
end

local CHAP_TYPE = classify(PANDOC_STATE and PANDOC_STATE.input_files[1] or "")
local TICKS_ENABLED = (CHAP_TYPE == "chapter")

local function chapter_marker_block()
  return pandoc.RawBlock("latex", string.format("\\RailMarkChapter[%s]", CHAP_TYPE))
end

function Pandoc(doc)
  local blocks = doc.blocks
  table.insert(blocks, 1, chapter_marker_block())
  return pandoc.Pandoc(blocks, doc.meta)
end

function Header(el)
  if not TICKS_ENABLED then
    return nil
  end
  -- Treat level-3 headings (###) as subsection tick anchors.
  if el.level == 3 then
    return {
      pandoc.RawBlock("latex", "\\RailMarkSubsection"),
      el,
    }
  end
  return nil
end
