-- Unescape escaped HTML break tags in PDF output
-- Handles: <br>, \<br\>, and <br> inside various elements

-- Patterns to match <br> in various forms
local function is_br_tag(text)
  -- Match: <br>, \<br\>, or HTML entities
  return text:match("<br>") or text:match("\\<br\\>") or text:match("&lt;br&gt;")
end

local function replace_br_with_marker(text)
  local result = text
  -- Replace all forms of <br>
  result = result:gsub("\\<br\\>", "###BR###")
  result = result:gsub("<br>", "###BR###")
  result = result:gsub("&lt;br&gt;", "###BR###")
  return result
end

-- Convert marker back to LaTeX newline
local function marker_to_latex(text)
  return text:gsub("###BR###", "\\\\")
end

-- Byte-level sanitization for LaTeX
local function clean_tex(s)
  local t = {}
  for i = 1, #s do
    local b = s:byte(i)
    if b < 32 then
      table.insert(t, " ")
    else
      table.insert(t, string.char(b))
    end
  end
  return table.concat(t)
end

-- Process inline elements recursively
local function process_inlines(inlines)
  local new_inlines = pandoc.List()
  local modified = false
  
  for _, el in ipairs(inlines) do
    if el.t == "Str" and is_br_tag(el.text) then
      -- Split by BR markers
      local text = replace_br_with_marker(el.text)
      local parts = {}
      for part in string.gmatch(text .. "###BR###", "(.-)" .. "###BR###") do
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
    elseif el.t == "RawInline" and el.format == "html" then
      -- Handle HTML <br> tags that Pandoc parsed as RawInline
      local text = el.text
      if text:match("<br") or text:match("<%s*br") then
        -- Convert HTML br to LaTeX newline
        new_inlines:insert(pandoc.RawInline("latex", "\\\\"))
        modified = true
      else
        new_inlines:insert(el)
      end
    elseif el.t == "Strong" and el.content then
      -- Handle <br> inside bold text
      local new_content, was_modified = process_inlines(el.content)
      if was_modified then
        new_inlines:insert(pandoc.Strong(new_content))
        modified = true
      else
        new_inlines:insert(el)
      end
    elseif el.t == "Emph" and el.content then
      -- Handle <br> inside italic text
      local new_content, was_modified = process_inlines(el.content)
      if was_modified then
        new_inlines:insert(pandoc.Emph(new_content))
        modified = true
      else
        new_inlines:insert(el)
      end
    elseif el.t == "Underline" and el.content then
      -- Handle <br> inside underline text
      local new_content, was_modified = process_inlines(el.content)
      if was_modified then
        new_inlines:insert(pandoc.Underline(new_content))
        modified = true
      else
        new_inlines:insert(el)
      end
    elseif el.t == "Link" and el.content then
      -- Handle <br> inside links
      local new_content, was_modified = process_inlines(el.content)
      if was_modified then
        el.content = new_content
        new_inlines:insert(el)
        modified = true
      else
        new_inlines:insert(el)
      end
    elseif el.t == "Span" and el.content then
      -- Handle <br> inside spans (including highlight spans)
      local new_content, was_modified = process_inlines(el.content)
      if was_modified then
        el.content = new_content
        new_inlines:insert(el)
        modified = true
      else
        new_inlines:insert(el)
      end
    else
      new_inlines:insert(el)
    end
  end
  
  return new_inlines, modified
end

-- Handler for RawInline to convert HTML <br> to LaTeX \\
local function RawInline(el)
  if FORMAT:match("latex") and el.format == "html" then
    if el.text:match("<br") or el.text:match("<%s*br") then
      return pandoc.RawInline("latex", "\\\\")
    end
  end
  return el
end

-- Table handler with makecell  
local function Table(el)
  local function process_rows(rows)
    for _, row in ipairs(rows) do
      for i, cell in ipairs(row.cells) do
        local has_br = false
        pandoc.walk_block(pandoc.Div(cell.contents), {
          Str = function(e) 
            if is_br_tag(e.text) then 
              has_br = true 
            end 
          end,
          RawInline = function(e)
            if e.format == "html" and (e.text:match("<br") or e.text:match("<%s*br")) then
              has_br = true
            end
          end
        })
        
        if has_br then
          local processed_blocks = pandoc.walk_block(pandoc.Div(cell.contents), {
            Str = function(e)
              if is_br_tag(e.text) then
                local text = replace_br_with_marker(e.text)
                local parts = {}
                for part in string.gmatch(text .. "###BR###", "(.-)###BR###") do
                  table.insert(parts, part)
                end
                local result = pandoc.List()
                for j, part in ipairs(parts) do
                  if part ~= "" then result:insert(pandoc.Str(part)) end
                  if j < #parts then result:insert(pandoc.RawInline("latex", "\\\\")) end
                end
                return result
              end
            end,
            RawInline = function(e)
              if e.format == "html" and (e.text:match("<br") or e.text:match("<%s*br")) then
                return pandoc.RawInline("latex", "\\\\")
              end
            end
          }).content
          
          local tex = pandoc.write(pandoc.Pandoc(processed_blocks), "latex")
          tex = clean_tex(tex)
          cell.contents = { pandoc.RawBlock("latex", "\\makecell[l]{" .. tex .. "}") }
        end
      end
    end
  end
  
  if el.head then process_rows(el.head.rows) end
  for _, body in ipairs(el.bodies) do process_rows(body.body) end
  if el.foot then process_rows(el.foot.rows) end
  return el
end

-- BlockQuote handler (for lawquote which becomes blockquote)
local function BlockQuote(el)
  local has_br = false
  pandoc.walk_block(el, {
    Str = function(e) if is_br_tag(e.text) then has_br = true end end
  })
  
  if has_br then
    local new_content = pandoc.walk_block(el, {
      Para = function(p)
        local new_inlines, modified = process_inlines(p.content)
        if modified then
          return pandoc.Para(new_inlines)
        end
      end,
      Plain = function(p)
        local new_inlines, modified = process_inlines(p.content)
        if modified then
          return pandoc.Plain(new_inlines)
        end
      end
    })
    return new_content
  end
  return el
end

-- Header handler
local function Header(el)
  local new_content, modified = process_inlines(el.content)
  if modified then
    el.content = new_content
  end
  return el
end

-- Para handler (general paragraphs)
local function Para(el)
  local new_content, modified = process_inlines(el.content)
  if modified then
    return pandoc.Para(new_content)
  end
  return el
end

-- Plain handler
local function Plain(el)
  local new_content, modified = process_inlines(el.content)
  if modified then
    return pandoc.Plain(new_content)
  end
  return el
end

-- Div handler (for custom environments like lawquote)
local function Div(el)
  local has_br = false
  pandoc.walk_block(el, {
    Str = function(e) if is_br_tag(e.text) then has_br = true end end
  })
  
  if has_br then
    return pandoc.walk_block(el, {
      Para = Para,
      Plain = Plain,
      Header = Header,
      BlockQuote = BlockQuote
    })
  end
  return el
end

return {
  { Table = Table },
  { RawInline = RawInline },
  { BlockQuote = BlockQuote },
  { Div = Div },
  { Header = Header },
  { Para = Para },
  { Plain = Plain }
}
