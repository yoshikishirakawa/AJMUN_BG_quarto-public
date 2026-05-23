-- Assign deterministic toc-* IDs to headings based on chapter/section numbering.
-- Expects headings like "第5章 ..." at level 1, and subheadings at levels 2-4.

local utils = pandoc.utils

local function new_state()
  return {
    chapter = nil,
    section = 0,
    subsection = 0,
    subsubsection = 0,
  }
end

local state = new_state()

local function assign_identifier(el, parts)
  local new_id = "toc-" .. table.concat(parts, "-")
  if not new_id or new_id == "" then
    return el
  end
  if el.identifier == new_id then
    return el
  end
  local alias = el.identifier
  el.identifier = new_id
  if alias and alias ~= "" then
    local alias_anchor = pandoc.RawBlock("html", string.format('<span id="%s"></span>', alias))
    return {alias_anchor, el}
  end
  return el
end

local function handle_level1(el, text)
  local num = text:match("第%s*(%d+)%s*章") or text:match("(%d+)")
  if not num then
    return
  end
  state.chapter = tonumber(num)
  state.section = 0
  state.subsection = 0
  state.subsubsection = 0
  return assign_identifier(el, {state.chapter})
end

local function handle_level2(el)
  if not state.chapter then
    return
  end
  state.section = state.section + 1
  state.subsection = 0
  state.subsubsection = 0
  return assign_identifier(el, {state.chapter, state.section})
end

local function handle_level3(el)
  if not state.chapter or state.section == 0 then
    return
  end
  state.subsection = state.subsection + 1
  state.subsubsection = 0
  return assign_identifier(el, {state.chapter, state.section, state.subsection})
end

local function handle_level4(el)
  if not state.chapter or state.section == 0 or state.subsection == 0 then
    return
  end
  state.subsubsection = state.subsubsection + 1
  return assign_identifier(el, {state.chapter, state.section, state.subsection, state.subsubsection})
end

local function Header(el)
  local text = utils.stringify(el)
  local updated = nil
  if el.level == 1 then
    updated = handle_level1(el, text)
  elseif el.level == 2 then
    updated = handle_level2(el)
  elseif el.level == 3 then
    updated = handle_level3(el)
  elseif el.level == 4 then
    updated = handle_level4(el)
  end
  return updated or el
end

local function Meta(meta)
  state = new_state()
  return meta
end

return {
  { Meta = Meta, Header = Header },
}
