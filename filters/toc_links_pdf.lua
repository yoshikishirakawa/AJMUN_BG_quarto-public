-- Rewrite dummy toc links like http://6-4-1.toc to internal PDF hyperlinks.
-- PDF version of toc_links.lua

local utils = pandoc and pandoc.utils or nil
local state = {
  chapter = nil,
}

local function is_pdf_or_latex_format()
  return FORMAT and (FORMAT:match("latex") or FORMAT:match("pdf"))
end

local function parse_toc_host(host)
  local parts = {}
  for segment in host:gmatch("[^%-%._]+") do
    local num = tonumber(segment)
    if not num then
      return nil
    end
    table.insert(parts, tostring(num))
  end
  if #parts == 0 then
    return nil
  end
  return parts
end

local function extract_parts(target)
  local host = target:match("^https?://([^/?#]+)%.toc/?$")
  if not host then
    return nil
  end
  return parse_toc_host(host)
end

local function chapter_number_from_path(path)
  if not path or path == "" then
    return nil
  end
  local filename = path:match("([^/]+)$") or path
  local num = filename:match("^(%d+)")
  if num then
    return tonumber(num)
  end
  num = filename:match("^%D*(%d+)")
  if num then
    return tonumber(num)
  end
  return nil
end

local function Meta(meta)
  if not utils then
    return meta
  end

  local function meta_string(node)
    if not node then
      return nil
    end
    local ok, text = pcall(utils.stringify, node)
    if ok and text and text ~= "" then
      return text
    end
    return nil
  end

  local candidates = {}
  if meta.quarto then
    table.insert(candidates, meta_string(meta.quarto["source-file"]))
    table.insert(candidates, meta_string(meta.quarto["input-file"]))
    table.insert(candidates, meta_string(meta.quarto["source-path"]))
  end
  table.insert(candidates, meta_string(meta["quarto-input-file"]))
  table.insert(candidates, meta_string(meta["source-file"]))
  table.insert(candidates, meta_string(meta["input-file"]))

  for _, path in ipairs(candidates) do
    local chapter = chapter_number_from_path(path)
    if chapter then
      state.chapter = chapter
      break
    end
  end

  return meta
end

local function build_pdf_target(parts)
  -- Build internal LaTeX/PDF hyperlink target
  -- Format: #toc-5-3-1-2
  local id = "toc-" .. table.concat(parts, "-")
  return id
end

local function Link(el)
  if not is_pdf_or_latex_format() then
    return nil
  end
  local parts = extract_parts(el.target or "")
  if not parts then
    return nil
  end
  local target_id = build_pdf_target(parts)
  if not target_id then
    return nil
  end
  -- Set the target to an internal anchor reference
  el.target = "#" .. target_id
  return el
end

return {
  { Meta = Meta, Link = Link },
}
