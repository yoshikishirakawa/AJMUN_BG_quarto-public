-- Small Block Filter
-- Converts Divs with class 'small-block' to LaTeX 'smallblock' environment

function Div(el)
  if el.classes:includes('small-block') then
    if FORMAT:match 'latex' then
      local latex_begin = pandoc.RawBlock('latex', '\\begin{smallblock}')
      local latex_end = pandoc.RawBlock('latex', '\\end{smallblock}')
      
      local new_content = pandoc.List()
      new_content:insert(latex_begin)
      new_content:extend(el.content)
      new_content:insert(latex_end)
      
      return pandoc.Div(new_content)
    end
    -- For HTML, the class 'small-block' is preserved and handled by CSS
  end
end
