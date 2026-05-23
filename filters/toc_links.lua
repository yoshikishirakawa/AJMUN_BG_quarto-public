-- Rewrite dummy toc links like http://6-4-1.toc to actual chapter anchors.

local utils = pandoc and pandoc.utils or nil
local state = {
  chapter = nil,
}

local function is_html_format()
  return FORMAT and FORMAT:match("html")
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

local function build_target(parts)
  local chapter = tonumber(parts[1])
  if not chapter then
    return nil
  end
  local id = "toc-" .. table.concat(parts, "-")
  local chapter_slug = string.format("%02d_ch%02d.html", chapter, chapter)
  return {
    chapter = chapter,
    id = id,
    target = string.format("%s#%s", chapter_slug, id)
  }
end

local function Link(el)
  if not is_html_format() then
    return nil
  end
  local parts = extract_parts(el.target or "")
  if not parts then
    return nil
  end
  local target_info = build_target(parts)
  if not target_info then
    return nil
  end
  if state.chapter and state.chapter == target_info.chapter then
    el.target = "#" .. target_info.id
  else
    el.target = target_info.target
  end
  return el
end

return {
  { Meta = Meta, Link = Link },
}
