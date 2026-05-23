-- table_rules_pdf.lua
-- PDFテーブルに横罫線を追加するフィルタ

-- This filter modifies table output to ensure horizontal rules are displayed
-- by using the standard LaTeX tabular with booktabs rules

function Table(el)
  if not FORMAT:match("latex") then
    return nil
  end
  
  -- Process table to add rules
  -- We'll insert raw LaTeX for rules in the table structure
  
  -- Add midrule after header row
  if el.head and #el.head.rows > 0 then
    -- Mark that header exists for rule insertion
    el.attributes = el.attributes or {}
    el.attributes["has-header"] = "true"
  end
  
  return el
end

-- Use RawBlock to inject midrule after table header
function Pandoc(doc)
  if not FORMAT:match("latex") then
    return nil
  end
  
  local new_blocks = pandoc.List()
  
  for _, block in ipairs(doc.blocks) do
    if block.t == "Table" then
      -- Convert table to simpler format with explicit rules
      local caption = pandoc.utils.stringify(block.caption.long)
      
      -- Build LaTeX table manually with booktabs
      local cols = {}
      for i, colspec in ipairs(block.colspecs) do
        local align = colspec[1]
        if align == pandoc.AlignLeft then
          table.insert(cols, "l")
        elseif align == pandoc.AlignRight then
          table.insert(cols, "r")
        elseif align == pandoc.AlignCenter then
          table.insert(cols, "c")
        else
          table.insert(cols, "l")
        end
      end
      
      local colspec = table.concat(cols, " ")
      local tex_lines = {}
      
      -- Start table
      table.insert(tex_lines, "\\begin{table}[htbp]")
      table.insert(tex_lines, "\\centering")
      table.insert(tex_lines, "\\begin{tabular}{" .. colspec .. "}")
      table.insert(tex_lines, "\\toprule")
      
      -- Header rows
      if block.head and #block.head.rows > 0 then
        for _, row in ipairs(block.head.rows) do
          local cells = {}
          for _, cell in ipairs(row.cells) do
            local content = pandoc.utils.stringify(cell.contents)
            table.insert(cells, content)
          end
          table.insert(tex_lines, table.concat(cells, " & ") .. " \\\\")
        end
        table.insert(tex_lines, "\\midrule")
      end
      
      -- Body rows
      for _, body in ipairs(block.bodies) do
        for _, row in ipairs(body.body) do
          local cells = {}
          for _, cell in ipairs(row.cells) do
            local content = pandoc.utils.stringify(cell.contents)
            table.insert(cells, content)
          end
          table.insert(tex_lines, table.concat(cells, " & ") .. " \\\\")
        end
      end
      
      -- End table
      table.insert(tex_lines, "\\bottomrule")
      table.insert(tex_lines, "\\end{tabular}")
      
      if caption ~= "" then
        table.insert(tex_lines, "\\caption{" .. caption .. "}")
      end
      
      table.insert(tex_lines, "\\end{table}")
      
      new_blocks:insert(pandoc.RawBlock("latex", table.concat(tex_lines, "\n")))
    else
      new_blocks:insert(block)
    end
  end
  
  return pandoc.Pandoc(new_blocks, doc.meta)
end

return {
  { Pandoc = Pandoc }
}
