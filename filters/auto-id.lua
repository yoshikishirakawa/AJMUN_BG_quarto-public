-- auto-id.lua
-- Automatically assign IDs to block elements to enable precise scroll restoration.
-- Wraps Para and BlockQuote in Divs since they don't support attributes directly.

local counts = {
  Para = 0,
  Table = 0,
  BlockQuote = 0,
  CodeBlock = 0,
  Header = 0
}

function Para(el)
  counts.Para = counts.Para + 1
  local id = "p-" .. tostring(counts.Para)
  -- Wrap Para in a Div with the ID
  return pandoc.Div({el}, pandoc.Attr(id, {"auto-id-para"}))
end

function Table(el)
  counts.Table = counts.Table + 1
  if el.identifier == "" then
    el.identifier = "tbl-auto-" .. tostring(counts.Table)
  end
  return el
end

function BlockQuote(el)
  counts.BlockQuote = counts.BlockQuote + 1
  local id = "bq-" .. tostring(counts.BlockQuote)
  -- Wrap BlockQuote in a Div with the ID
  return pandoc.Div({el}, pandoc.Attr(id, {"auto-id-bq"}))
end

function CodeBlock(el)
  counts.CodeBlock = counts.CodeBlock + 1
  if el.identifier == "" then
    el.identifier = "cb-" .. tostring(counts.CodeBlock)
  end
  return el
end

function Header(el)
  if el.identifier == "" then
    counts.Header = counts.Header + 1
    el.identifier = "hd-" .. tostring(counts.Header)
  end
  return el
end
