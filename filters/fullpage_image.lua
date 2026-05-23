-- Fullpage Image Filter
-- フルページ画像挿入のためのフィルタ
-- .fullpage-image クラスが付いた画像をHTML/PDFで適切に処理する

local utils = pandoc.utils
local List = pandoc.List

-- デフォルト値
local DEFAULT_WIDTH = "a4"
local DEFAULT_FIT = "stretch"
local DEFAULT_POSITION = "center"

-- 画像サイズ（mm）の定義
local SIZES = {
  a4 = { width = 210, height = 297 },
  a3 = { width = 297, height = 420 },
  a5 = { width = 148, height = 210 },
  letter = { width = 216, height = 279 },
}

-- 文字列トリム
local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- Pandoc Attr から属性値を取得
local function get_attr(attr, key, default)
  if attr and attr.attributes and attr.attributes[key] then
    return trim(attr.attributes[key])
  end
  return default
end

-- width 属性をパースして mm 単位の数値に変換
local function parse_width(width_str)
  if not width_str or width_str == "" then
    return SIZES[DEFAULT_WIDTH]
  end

  width_str = width_str:lower()
  width_str = trim(width_str)

  -- 定義済みサイズ
  if SIZES[width_str] then
    return SIZES[width_str]
  end

  -- パーセント（A4基準）
  local pct = width_str:match("^(%d+)%%$")
  if pct then
    local ratio = tonumber(pct) / 100
    return {
      width = SIZES.a4.width * ratio,
      height = SIZES.a4.height * ratio
    }
  end

  -- mm単位の数値（例: "200" or "200mm"）
  local mm = width_str:match("^(%d+%.?%d*)mm?$")
  if mm then
    return {
      width = tonumber(mm),
      height = SIZES.a4.height -- アスペクト比維持時に使用
    }
  end

  -- デフォルト
  return SIZES[DEFAULT_WIDTH]
end

-- PDF出力用のフルページ画像コマンドを生成（TikZ使用で余白なし）
local function make_fullpage_pdf(src, width, fit, position)
  if not src or trim(src) == "" then
    return pandoc.Null()
  end

  -- LaTeXでは先頭の"/"は絶対パス扱いになるため除去
  if src:sub(1, 1) == "/" then
    src = src:sub(2)
  end
  local size = parse_width(width)
  local fit_mode = fit or DEFAULT_FIT
  local pos = position or DEFAULT_POSITION
  local is_pdf = src:lower():match("%.pdf$") ~= nil

  -- TikZ配置位置のマッピング
  local anchor_map = {
    center = "center",
    top = "north",
    bottom = "south"
  }
  local anchor = anchor_map[pos] or "center"

  -- fitモードに応じたサイズ指定
  local size_spec
  if fit_mode == "stretch" then
    -- 強制引き伸ばし: ページサイズに合わせる
    if is_pdf then
      size_spec = string.format("page=1, width=\\paperwidth, height=\\paperheight")
    else
      size_spec = string.format("width=\\paperwidth, height=\\paperheight")
    end
  else
    -- contain: アスペクト比維持、ページ内に収める
    if is_pdf then
      size_spec = string.format("page=1, width=%dmm, height=%dmm, keepaspectratio", size.width, size.height)
    else
      size_spec = string.format("width=%dmm, height=%dmm, keepaspectratio", size.width, size.height)
    end
  end

  -- TikZでフルページ画像を配置
  -- Start each full-page asset on a fresh page. Do not force a trailing page
  -- break because the last tail image may otherwise leave an empty pending page
  -- at \end{document}.
  local latex_code = string.format([[
\clearpage
\thispagestyle{empty}
\null
\begin{tikzpicture}[remember picture, overlay]
  \node[anchor=%s] at (current page.%s) {
    \includegraphics[%s]{%s}
  };
\end{tikzpicture}
\par
]], anchor, anchor, size_spec, src)

  return pandoc.RawBlock("latex", latex_code)
end

-- HTML出力用の Div を生成
local function make_fullpage_html_div(img, width, fit, position)
  local size = parse_width(width)
  local fit_mode = fit or DEFAULT_FIT
  local pos = position or DEFAULT_POSITION

  -- 外側のコンテナ（フルページ）
  local container_classes = { "fullpage-image-container" }
  local container_attr = pandoc.Attr("", container_classes, {})

  -- 画像用のラッパー
  local wrapper_classes = { "fullpage-image-wrapper" }
  local wrapper_attr = pandoc.Attr("", wrapper_classes, {
    ["data-width"] = width,
    ["data-fit"] = fit_mode,
    ["data-position"] = pos
  })

  local wrapper = pandoc.Div(List({ img }), wrapper_attr)
  return pandoc.Div(List({ wrapper }), container_attr)
end

-- Para要素がフルページ画像のみで構成されているか判定
local function is_fullpage_image_para(para)
  if not para.content or #para.content ~= 1 then
    return false
  end
  local el = para.content[1]
  if el.t ~= "Image" then
    return false
  end
  -- .fullpage-image クラスの確認
  return el.classes and el.classes:includes("fullpage-image")
end

-- Para要素の処理
function Para(el)
  if is_fullpage_image_para(el) then
    local img = el.content[1]
    local src = img.src or ""
    local width = get_attr(img.attr, "width", DEFAULT_WIDTH)
    local fit = get_attr(img.attr, "fit", DEFAULT_FIT)
    local position = get_attr(img.attr, "position", DEFAULT_POSITION)

    -- PDF出力
    if FORMAT:match("latex") then
      return make_fullpage_pdf(src, width, fit, position)
    end

    -- HTML出力
    if FORMAT:match("html") then
      return make_fullpage_html_div(img, width, fit, position)
    end
  end

  return nil
end

-- Div要素の処理（複数画像対応）
function Div(el)
  if el.classes:includes("fullpage-image") then
    -- 複数の画像を含むDivの場合
    local width = get_attr(el.attr, "width", DEFAULT_WIDTH)
    local fit = get_attr(el.attr, "fit", DEFAULT_FIT)
    local position = get_attr(el.attr, "position", DEFAULT_POSITION)

    -- PDF出力：各画像に対して \includepdf を生成
    if FORMAT:match("latex") then
      local blocks = List()
      for _, item in ipairs(el.content) do
        if item.t == "Para" and #item.content == 1 and item.content[1].t == "Image" then
          local img = item.content[1]
          local src = img.src or ""
          blocks:insert(make_fullpage_pdf(src, width, fit, position))
        else
          blocks:insert(item)
        end
      end
      return blocks
    end

    -- HTML出力：各画像をフルページDivでラップ
    if FORMAT:match("html") then
      local blocks = List()
      for _, item in ipairs(el.content) do
        if item.t == "Para" and #item.content == 1 and item.content[1].t == "Image" then
          local img = item.content[1]
          blocks:insert(make_fullpage_html_div(img, width, fit, position))
        else
          blocks:insert(item)
        end
      end
      return blocks
    end
  end

  return nil
end

-- ドキュメントメタデータの処理（空タイトル警告回避）
function Meta(meta)
  if meta.title then
    local title_val = meta.title[1] or meta.title
    if pandoc.utils.stringify(title_val) == "" then
      -- 空タイトルの場合はダミーを設定（警告回避用）
      meta.title = pandoc.MetaInlines({ pandoc.Str("") })
    end
  end
  return meta
end

return {
  { Para = Para, Div = Div, Meta = Meta }
}
