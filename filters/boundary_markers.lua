-- boundary_markers.lua
-- Pandoc filter to insert chunk markers at page boundary paragraphs
-- This runs after Pass 1, using the detected boundary paragraph list
--
-- Usage: pandoc --lua-filter=boundary_markers.lua input.md -o output.md

local boundary_paragraphs = {}
local chunk_size = 15  -- Split boundary paragraphs into 15-character chunks

-- Load boundary paragraph list from file
function load_boundary_paragraphs()
  local txt_path = os.getenv("BOUNDARY_PARAGRAPHS_TXT") or "out/assets/boundary-paragraphs.txt"
  local f = io.open(txt_path, "r")
  if f then
    for line in f:lines() do
      if line:match("^p%-%d+$") then
        boundary_paragraphs[line] = true
      end
    end
    f:close()
  end
end

-- Check if a paragraph ID is a boundary paragraph
function is_boundary_paragraph(para_id)
  return boundary_paragraphs[para_id] or false
end

-- Split a string into chunks of approximately equal size
-- Tries to split at word boundaries when possible
function split_text_into_chunks(text, size)
  local chunks = {}
  local current = ""
  local words = {}

  -- Split into words (Japanese and English)
  for word in text:gmatch("[%w%p]+[\128-\255]*[%w%p]*") do
    table.insert(words, word)
  end

  -- Build chunks
  for i, word in ipairs(words) do
    local test = current == "" and word or current .. " " .. word
    if #test <= size then
      current = test
    else
      if current ~= "" then
        table.insert(chunks, current)
      end
      -- If single word is longer than chunk size, force split
      if #word > size then
        for j = 1, #word, size do
          table.insert(chunks, word:sub(j, j + size - 1))
        end
        current = ""
      else
        current = word
      end
    end
  end

  if current ~= "" then
    table.insert(chunks, current)
  end

  return chunks
end

-- Insert chunk markers into a boundary paragraph
function insert_chunk_markers(para, para_id)
  -- Extract plain text from paragraph
  local text = pandoc.utils.stringify(para.content)
  if #text < chunk_size * 2 then
    -- Paragraph too short, don't split
    return nil
  end

  -- Split into chunks
  local chunks = split_text_into_chunks(text, chunk_size)

  -- Build new content with chunk markers
  local new_content = pandoc.List({})
  local char_offset = 0
  local para_num = para_id:match("^p%-(%d+)$")

  for i, chunk_text in ipairs(chunks) do
    local chunk_id = string.format("c-%s-%d", para_num, i)

    -- Add LaTeX chunk marker (for PDF)
    if FORMAT:match("latex") then
      local marker = pandoc.RawInline(
        "latex",
        string.format("\\ChunkMarker{%s}{%s}{%d}", para_id, chunk_id, char_offset)
      )
      new_content:insert(marker)
    end

    -- Add the chunk text
    new_content:insert(pandoc.Str(chunk_text))

    -- Add space between chunks (except last)
    if i < #chunks then
      new_content:insert(pandoc.Str(" "))
    end

    char_offset = char_offset + #chunk_text + 1
  end

  -- Create new paragraph with chunk markers
  para.content = new_content
  return para
end

-- Process paragraphs
function Para(el)
  -- Check if this paragraph has a paragraph ID marker
  local has_para_marker = false
  local para_id = nil

  -- Look for pdf-para-marker span at the beginning
  if #el.content > 0 then
    local first = el.content[1]
    if first.t == "Span" and first.classes:includes("pdf-para-marker") then
      has_para_marker = true
      para_id = first.identifier
    end
  end

  -- If this is a boundary paragraph, insert chunk markers
  if has_para_marker and para_id and is_boundary_paragraph(para_id) then
    return insert_chunk_markers(el, para_id)
  end

  return el
end

-- Load boundary list at startup
function Pandoc(doc)
  load_boundary_paragraphs()
  return doc
end

return {
  { Para = Para },
  { Pandoc = Pandoc }
}
