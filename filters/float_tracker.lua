-- float_tracker.lua
-- Pandoc filter to track figure/table publication pages in PDF
-- Inserts \FloatPageRef markers for actual page tracking
--
-- Usage: pandoc --lua-filter=float_tracker.lua input.md -o output.tex

local float_counter = 0

-- Generate unique ID for figures and tables
function generate_float_id(float_type)
  float_counter = float_counter + 1
  return string.format("%s-%d", float_type, float_counter)
end

-- Process figures
function Figure(el)
  local fig_id = el.identifier or generate_float_id("fig")

  -- For PDF output, insert the float page reference marker
  if FORMAT:match("latex") then
    local marker = pandoc.RawInline(
      "latex",
      string.format("\\FloatPageRef{%s}{figure}", fig_id)
    )
    -- Insert marker before the figure
    return pandoc.Blocks({pandoc.Plain({marker}), el})
  end

  return el
end

-- Process tables
function Table(el)
  local tbl_id = el.identifier or generate_float_id("tbl")

  -- For PDF output, insert the float page reference marker
  if FORMAT:match("latex") then
    local marker = pandoc.RawInline(
      "latex",
      string.format("\\FloatPageRef{%s}{table}", tbl_id)
    )
    -- Insert marker before the table
    return pandoc.Blocks({pandoc.Plain({marker}), el})
  end

  return el
end

-- Also process Div elements with figure or table classes
-- (Quarto sometimes wraps figures in Divs)
function Div(el)
  if el.classes:includes("figure") or el.classes:includes("table") then
    local float_type = el.classes:includes("figure") and "fig" or "tbl"
    local float_id = el.identifier or generate_float_id(float_type)

    if FORMAT:match("latex") then
      local marker = pandoc.RawInline(
        "latex",
        string.format("\\FloatPageRef{%s}{%s}", float_id, float_type == "fig" and "figure" or "table")
      )
      -- Insert marker at the beginning of the div
      table.insert(el.content, 1, pandoc.Plain({marker}))
    end
  end

  return el
end

return {
  { Figure = Figure },
  { Table = Table },
  { Div = Div }
}
