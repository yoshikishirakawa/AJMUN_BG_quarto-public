-- Paragraph ID Filter
-- Inserts unique IDs for each paragraph to enable PDF-HTML page correspondence
-- Paragraph IDs: p-1, p-2, p-3, etc.

local paragraph_counter = 0

function Para(el)
  paragraph_counter = paragraph_counter + 1
  local para_id = "p-" .. paragraph_counter
  
  -- Create a Span with the ID at the beginning of the paragraph
  local marker = pandoc.Span({}, pandoc.Attr(para_id, {"pdf-para-marker"}, {}))
  
  -- Insert the marker at the beginning
  local new_content = pandoc.List({marker})
  new_content:extend(el.content)
  el.content = new_content
  
  return el
end

-- For PDF output, also add LaTeX label for page reference
function Span(el)
  if el.classes:includes("pdf-para-marker") then
    if FORMAT:match("latex") then
      -- Insert phantomsection and label for page reference
      local label_cmd = string.format("\\phantomsection\\label{%s}", el.identifier)
      return pandoc.RawInline("latex", label_cmd)
    else
      -- For HTML, keep the span with ID
      return el
    end
  end
  return el
end

return {
  { Para = Para },
  { Span = Span }
}
