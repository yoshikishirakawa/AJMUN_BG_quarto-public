-- Add vertical rules to LaTeX tables (tabular/longtable)
-- PDF/LaTeX only: rewrites column specs to include leading, trailing,
-- and inter-column vertical bars while preserving column definitions.

local function is_latex()
  return FORMAT:match("latex") ~= nil
end

local function trim_spaces(spec)
  return spec:gsub("%s+", "")
end

local function with_vertical_lines(spec)
  spec = trim_spaces(spec)
  local out = {"|"}
  local i = 1
  local indent_inserted = false
  
  local function skip_braces(s, idx)
    if s:sub(idx, idx) ~= "{" then return idx end
    local depth = 1
    local j = idx + 1
    while j <= #s and depth > 0 do
      local c = s:sub(j, j)
      if c == "{" then depth = depth + 1
      elseif c == "}" then depth = depth - 1 end
      j = j + 1
    end
    return j
  end

  while i <= #spec do
    local char = spec:sub(i, i)
    
    if char == ">" or char == "<" or char == "@" or char == "!" then
      -- Check for following brace
      if spec:sub(i+1, i+1) == "{" then
        local j = skip_braces(spec, i+1)
        table.insert(out, spec:sub(i, j-1))
        i = j
      else
        table.insert(out, char)
        i = i + 1
      end
      
    elseif char == "p" or char == "m" or char == "b" then
      if not indent_inserted then
        -- Use hangindent to apply indent to all lines in wrapped cells
        -- hangafter=1 means start hanging from line 1 (first line is also indented via hspace)
        table.insert(out, ">{\\raggedright\\hangindent=2mm\\hangafter=0\\arraybackslash\\hspace{2mm}}")
        indent_inserted = true
      end
      if spec:sub(i+1, i+1) == "{" then
        local j = skip_braces(spec, i+1)
        table.insert(out, spec:sub(i, j-1))
        table.insert(out, "|")
        i = j
      else
        table.insert(out, char)
        table.insert(out, "|")
        i = i + 1
      end

    elseif char:match("[lcr]") then
      if not indent_inserted then
        -- Use hangindent to apply indent to all lines in wrapped cells
        -- hangafter=1 means start hanging from line 1 (first line is also indented via hspace)
        table.insert(out, ">{\\raggedright\\hangindent=2mm\\hangafter=0\\arraybackslash\\hspace{2mm}}")
        indent_inserted = true
      end
      table.insert(out, char)
      table.insert(out, "|")
      i = i + 1
      
    elseif char == "|" then
      table.insert(out, char)
      i = i + 1
      
    else
      table.insert(out, char)
      i = i + 1
    end
  end
  

  
  local res = table.concat(out):gsub("|+", "|")
  if res:sub(-1) ~= "|" then
    res = res .. "|"
  end
  
  -- Add 5mm indent to the first column
  -- Inject >{\hspace{5mm}} after the first vertical line
  
  return res
end

local function rewrite_tables(latex)
  local function repl(env)
    return function(spec)
      return "\\begin{" .. env .. "}{" .. with_vertical_lines(spec) .. "}"
    end
  end
  latex = latex:gsub("(\\begin{longtable}.-)(%b{})", function(prefix, spec_braced)
    local spec = spec_braced:sub(2, -2) -- remove outer braces
    return prefix .. "{" .. with_vertical_lines(spec) .. "}"
  end)
  latex = latex:gsub("\\begin{tabular}(%*?)%s*(%b[])?%s*(%b{})", function(star, opt, spec_braced)
    local spec = spec_braced:sub(2, -2)
    return "\\begin{tabular}" .. star .. (opt or "") .. "{" .. with_vertical_lines(spec) .. "}"
  end)
  return latex
end

function Table(tbl)
  if not is_latex() then
    return nil
  end
  
  -- Check attributes (set by colmin_pdf.lua or manual)
  -- Default vlines to true unless explicitly disabled
  -- Default hlines to true (show horizontal lines by default)
  local vlines = tbl.attributes["vlines"] ~= "false"
  local hlines = tbl.attributes["hlines"] ~= "false"
  
  -- Header handling: if 'header-rows' is not specified (nil or "0"), move header to body
  -- If 'header-rows' is specified and > 0, keep header as-is
  local header_rows_attr = tbl.attributes["header-rows"]
  local should_have_header = header_rows_attr and tonumber(header_rows_attr) and tonumber(header_rows_attr) > 0
  
  if not should_have_header and tbl.head and #tbl.head.rows > 0 then
    -- Move header rows to the beginning of the first body
    if #tbl.bodies > 0 then
      for i = #tbl.head.rows, 1, -1 do
        tbl.bodies[1].body:insert(1, tbl.head.rows[i])
      end
      tbl.head.rows = pandoc.List()
    end
  end
  
  -- Pre-process table: Replace LineBreak with \newline.
  -- This prevents Pandoc from generating "\\" for line breaks within cells,
  -- which would confuse the regex-based \hline insertion below (it interprets "\\" as end-of-row).
  tbl = pandoc.walk_block(tbl, {
    LineBreak = function()
      return pandoc.RawInline("latex", "\\newline")
    end
  })
  
  -- Generate LaTeX
  local latex = pandoc.write(pandoc.Pandoc({tbl}), "latex")
  
  if vlines then
    latex = rewrite_tables(latex)
  end
  
  if hlines then
    -- Add \hline after every row (except special longtable commands)
    -- Match \\ that is not followed by special commands like \endhead, \endfoot, etc.
    local lines = {}
    for line in latex:gmatch("[^\r\n]+") do
      table.insert(lines, line)
    end
    
    local result = {}
    for i, line in ipairs(lines) do
      table.insert(result, line)
      -- Check if line ends with \\ and add \hline unless it's already an hline or special command
      if line:match("\\\\%s*$") and 
         not line:match("\\hline") and
         not line:match("\\toprule") and
         not line:match("\\midrule") and
         not line:match("\\bottomrule") and
         not line:match("\\endhead") and
         not line:match("\\endfoot") and
         not line:match("\\endfirsthead") and
         not line:match("\\endlastfoot") then
        table.insert(result, "\\hline")
      end
    end
    latex = table.concat(result, "\n")
    
    -- Clean up: remove double \hline
    latex = latex:gsub("\\hline%s*\\hline", "\\hline")
    
    -- Remove \hline right before \bottomrule or \end{longtable}/\end{tabular}
    latex = latex:gsub("\\hline%s*\\bottomrule", "\\bottomrule")
    latex = latex:gsub("\\hline%s*\\end%.longtable", "\\end{longtable")
    latex = latex:gsub("\\hline%s*\\end%.tabular", "\\end{tabular")
  end
  
  return pandoc.RawBlock("latex", latex)
end

return {
  {Table = Table},
}
