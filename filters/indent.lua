-- Indentation Filter
-- Converts Divs with class 'indent' to proper indentation
--
-- Usage:
-- :::indent
-- Content to be indented
-- :::

function Div(el)
  if el.classes:includes('indent') then
    if FORMAT:match 'latex' then
      -- Use 'quote' environment for indentation in LaTeX
      -- or define a custom 'indentblock' in styles if generic quote is too much
      local latex_begin = pandoc.RawBlock('latex', '\\begin{quote}')
      local latex_end = pandoc.RawBlock('latex', '\\end{quote}')
      
      local new_content = pandoc.List()
      new_content:insert(latex_begin)
      new_content:extend(el.content)
      new_content:insert(latex_end)
      
      return pandoc.Div(new_content)
    elseif FORMAT:match 'html' then
      -- For HTML, ensure the class is there (it likely is)
      -- The styling is handled by CSS
      return el
    end
  end
end
