-- Index category styling for PDF
-- Converts index-related headers to styled LaTeX output
-- Handles both main sections (文書集索引/事項索引) and category headers

function Header(el)
    if not FORMAT:match("latex") then
        return nil
    end
    
    local text = pandoc.utils.stringify(el)
    
    -- Check if this header has the index-category class (H3 category headers)
    local has_index_category = false
    local has_unlisted = false
    for _, class in ipairs(el.classes) do
        if class == "index-category" then
            has_index_category = true
        end
        if class == "unlisted" then
            has_unlisted = true
        end
    end
    
    -- H2 with .unlisted: Main section headers (文書集索引, 事項索引)
    if el.level == 2 and has_unlisted then
        local latex = string.format([[
\vspace{1.2em}
{\noindent\LARGE\bfseries\color{titleblue}%s}
\vspace{0.5em}
\nopagebreak
]], text)
        return pandoc.RawBlock("latex", latex)
    end
    
    -- H3 with .index-category: Category headers (安保理決議, etc.)
    if has_index_category then
        local latex = string.format([[
\vspace{0.8em}
{\noindent\large\bfseries\color{titleblue}%s}
\vspace{0.3em}
\nopagebreak
]], text)
        return pandoc.RawBlock("latex", latex)
    end

    
    return nil
end

return {
    {Header = Header}
}
