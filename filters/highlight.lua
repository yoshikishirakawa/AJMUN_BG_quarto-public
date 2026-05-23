--[[
  highlight.lua - Text highlighting filter
  
  This filter processes Span elements with `.hl-yellow` or `.hl-green` classes
  and adds appropriate styling for visual highlighting.
  
  Usage in Markdown:
    [highlighted text]{.hl-yellow}
    [highlighted text]{.hl-green}
]]

function Span(el)
  -- Check if span has hl-yellow or hl-green class
  local has_hl_yellow = el.classes:includes('hl-yellow')
  local has_hl_green = el.classes:includes('hl-green')
  
  if not (has_hl_yellow or has_hl_green) then
    return nil
  end
  
  -- PDF/LaTeX output
  if FORMAT:match('latex') then
    -- Use bold colored text (orange/green) using switch syntax for page break robustness
    -- Also preserve inner structure (italics, footnotes, etc.) by not stringifying
    local color = 'hlyellow'
    if has_hl_yellow then color = 'hlyellow'
    elseif has_hl_green then color = 'hlgreen'
    elseif el.classes:includes('hl-red') then color = 'hlred'
    elseif el.classes:includes('hl-blue') then color = 'hlblue'
    elseif el.classes:includes('hl-purple') then color = 'hlpurple'
    end
    
    local new_content = { pandoc.RawInline('latex', '{\\bfseries\\color{' .. color .. '}') }
    for _, item in ipairs(el.content) do
      table.insert(new_content, item)
    end
    table.insert(new_content, pandoc.RawInline('latex', '}'))
    
    return new_content
  end
  
  -- HTML output
  if FORMAT:match('html') then
    -- Add base highlight class if not already present
    if not el.classes:includes('aj-highlight') then
      el.classes:insert('aj-highlight')
    end
    
    -- Add color-specific class
    if has_hl_yellow and not el.classes:includes('aj-highlight--yellow') then
      el.classes:insert('aj-highlight--yellow')
    end
    if has_hl_green and not el.classes:includes('aj-highlight--green') then
      el.classes:insert('aj-highlight--green')
    end
    
    return el
  end
  
  return nil
end
