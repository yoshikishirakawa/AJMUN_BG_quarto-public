-- Convert placeholder links like https://5-4-1.toc into internal links
-- pointing to numbered sections (chapter-section-item-...).
-- Also assigns stable IDs to headings based on detected numbering so the
-- links resolve in the PDF output. No content files are modified; all
-- changes are applied during the PDF build pipeline.

local mapping = {}
local current = { chapter = nil, section = nil, item = nil, subitem = nil }

local function is_latex()
  return FORMAT and FORMAT:match("latex")
end

local function to_ascii_digits(s)
  if not s then return nil end
  local out = {}
  for _, c in utf8.codes(s) do
    if c >= 0xFF10 and c <= 0xFF19 then
      table.insert(out, string.char(c - 0xFF10 + 48))
    else
      table.insert(out, utf8.char(c))
    end
  end
  return table.concat(out)
end

local function build_key(parts)
  local cleaned = {}
  for _, p in ipairs(parts) do
    if p and p ~= "" then
      table.insert(cleaned, to_ascii_digits(p))
    end
  end
  if #cleaned == 0 then
    return nil
  end
  return table.concat(cleaned, "-")
end

local function record_header(el)
  if not is_latex() then
    return nil
  end

  local text = pandoc.utils.stringify(el.content)
  local chapter = text:match("第%s*([%d０-９]+)%s*章")
  local section = text:match("第%s*([%d０-９]+)%s*節")
  local item = text:match("第%s*([%d０-９]+)%s*項")
  local subitem = text:match("第%s*([%d０-９]+)%s*目")

  local key = nil

  if el.level == 1 and chapter then
    current.chapter = to_ascii_digits(chapter)
    current.section, current.item, current.subitem = nil, nil, nil
    key = build_key({ current.chapter })
  elseif el.level == 2 and section then
    current.section = to_ascii_digits(section)
    current.item, current.subitem = nil, nil
    key = build_key({ current.chapter, current.section })
  elseif el.level == 3 and item then
    current.item = to_ascii_digits(item)
    current.subitem = nil
    key = build_key({ current.chapter, current.section, current.item })
  elseif el.level >= 4 and (item or subitem) then
    current.subitem = to_ascii_digits(subitem or item)
    key = build_key({ current.chapter, current.section, current.item, current.subitem })
  end

  if key then
    local target_id = el.identifier
    if target_id == nil or target_id == "" then
      target_id = "toc-" .. key
      el.identifier = target_id
    end
    mapping[key] = target_id
  end

  return el
end

local function rewrite_link(el)
  if not is_latex() then
    return nil
  end

  local raw = el.target or ""
  local key_part = raw:match("^https?://([%d%-]+)%.toc/?$")
  if not key_part then
    return nil
  end

  local parts = {}
  for part in key_part:gmatch("([^%-]+)") do
    table.insert(parts, part)
  end
  local key = build_key(parts)
  if not key then
    return nil
  end

  local target_id = mapping[key] or ("toc-" .. key)
  el.target = "#" .. target_id
  return el
end

function Pandoc(doc)
  if not is_latex() then
    return nil
  end
  -- First pass: record headings and attach deterministic IDs
  doc = doc:walk({ Header = record_header })
  -- Second pass: rewrite placeholder links
  doc = doc:walk({ Link = rewrite_link })
  return doc
end
