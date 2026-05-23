-- 汎用画像挿入フィルタ（\\image{file}{opts}）
-- HTML ではレイアウト用の Div + Image を生成し、
-- PDF などその他のフォーマットではシンプルな画像として扱う。

local utils = pandoc.utils
local List = pandoc.List

-- 文字列トリム
local function trim(s)
  return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

-- オプション文字列 "key=val key2=val2" をテーブルに変換
local function parse_options(optstr)
  local opts = {}
  if not optstr or optstr == "" then
    return opts
  end
  -- カンマをスペース扱いに
  optstr = optstr:gsub(",", " ")
  for token in optstr:gmatch("%S+") do
    local k, v = token:match("^([%w_-]+)=(.+)$")
    if k and v then
      opts[k] = v
    else
      -- key のみ（boolean フラグ扱い）
      token = trim(token)
      if token ~= "" then
        opts[token] = "true"
      end
    end
  end
  return opts
end

-- RawInline / RawBlock から \\image{file}{opts} をパース
-- （raw.format に "tex" / "latex" を持ち、text にコマンド本体を含むもの）
local function parse_image_command(raw)
  if not raw then
    return nil
  end
  local format = raw.format or ""
  if format ~= "tex" and format ~= "latex" then
    return nil
  end
  local text = raw.text or ""
  if not text:match("\\image") then
    return nil
  end
  -- file 部分
  local file = text:match("\\image%s*{([^}]*)}")
  if not file or trim(file) == "" then
    return nil
  end
  file = trim(file)
  -- opts 部分（存在しない場合もある）
  local opt_body = text:match("\\image%s*{[^}]*}%s*{([^}]*)}") or ""
  opt_body = trim(opt_body)
  local opts = parse_options(opt_body)
  return {
    file = file,
    opts = opts,
  }
end

-- 画像パス解決（プロジェクトルート基準のパスを返す）
local function resolve_src_base(spec)
  local opts = spec.opts or {}

  -- 明示的なパス指定があればそれを優先
  if opts.path and opts.path ~= "" then
    return opts.path
  end

  -- 絶対URL / 絶対パスはそのまま返す
  if spec.file:match("^https?://") or spec.file:match("^/") then
    return spec.file
  end

  -- パスにディレクトリを含んでいればそのまま、それ以外は assets/ を付ける
  if spec.file:match("/") then
    return spec.file
  else
    return "assets/" .. spec.file
  end
end

-- width オプションから CSS 変数を生成
local function build_style_from_opts(opts)
  local parts = {}
  local width = opts.width or opts["w"]
  if width then
    width = tostring(width):gsub("%%$", "")
    table.insert(parts, string.format("--img-width: %s%%;", width))
  end
  local edge = opts["gradient-edge"] or opts["gradient_edge"] or opts["edge"]
  if edge then
    edge = tostring(edge):gsub("%%$", "")
    table.insert(parts, string.format("--img-gradient-edge: %s%%;", edge))
  end
  if #parts == 0 then
    return nil
  end
  return table.concat(parts, " ")
end

-- Alt テキスト生成
local function build_alt(spec)
  local opts = spec.opts or {}
  if opts.alt and opts.alt ~= "" then
    return opts.alt
  end
  -- 拡張子を除いたファイル名をデフォルト alt にする
  local base = spec.file:match("([^/]+)$") or spec.file
  base = base:gsub("%.[%w]+$", "")
  return base
end

-- シンプルな pandoc.Image 要素を生成
-- HTML の場合は data-asset にルート基準パスを埋め込み、
-- 実際の src 解決は UI スクリプトの resolveAssetPath に委ねる。
local function make_image_inline(spec)
  local base = resolve_src_base(spec)
  local alt = build_alt(spec)
  local attr = pandoc.Attr("", {}, {})

  -- HTML: 相対パスの資源は data-asset に入れて JS で解決
  if FORMAT and FORMAT:match("html") then
    -- 絶対URL/パスはそのまま使う
    if base:match("^https?://") or base:match("^/") then
      return pandoc.Image({ pandoc.Str(alt) }, base, "", attr)
    else
      attr.attributes["data-asset"] = base
      -- src は空で出力し、クライアント側で resolveAssetPath(base) に差し替える
      return pandoc.Image({ pandoc.Str(alt) }, "", "", attr)
    end
  end

  -- 非HTML（PDFなど）は Pandoc/TeX に任せる
  return pandoc.Image({ pandoc.Str(alt) }, base, "", attr)
end

-- ブロック画像（中央配置）Div を生成
local function make_block_image(spec)
  local opts = spec.opts or {}
  local img = make_image_inline(spec)

  local classes = { "q-image-block", "pos-center" }
  -- グラデーションオプション
  if opts.gradient or opts["gradient-edge"] or opts["gradient_edge"] or opts["edge"] then
    table.insert(classes, "q-image-gradient")
  end

  local attr = pandoc.Attr("", classes, {})
  local style = build_style_from_opts(opts)
  if style then
    attr.attributes["style"] = style
  end

  return pandoc.Div(List({ img }), attr)
end

-- テキスト + 画像の左右レイアウト Div を生成
local function make_layout_block(spec, text_inlines)
  local opts = spec.opts or {}
  local pos = (opts.pos or opts.position or "right"):lower()
  if pos ~= "left" and pos ~= "right" then
    pos = "right"
  end

  local img = make_image_inline(spec)

  local outer_classes = { "q-image-layout", "pos-" .. pos }
  local outer_attr = pandoc.Attr("", outer_classes, {})
  local style = build_style_from_opts(opts)
  if style then
    outer_attr.attributes["style"] = style
  end

  -- テキスト部分
  local text_para = pandoc.Para(text_inlines)
  local text_div = pandoc.Div(List({ text_para }), pandoc.Attr("", { "q-image-col", "q-image-text" }, {}))

  -- 画像部分
  local img_classes = { "q-image-col", "q-image-img" }
  if opts.gradient or opts["gradient-edge"] or opts["gradient_edge"] or opts["edge"] then
    table.insert(img_classes, "q-image-gradient")
  end
  local img_div = pandoc.Div(List({ img }), pandoc.Attr("", img_classes, {}))

  -- テキストと画像の順序は CSS の flex-direction で制御
  return pandoc.Div(List({ text_div, img_div }), outer_attr)
end

-- インラインリスト内で最初の非空要素の位置
local function first_non_space_index(inlines)
  for i = 1, #inlines do
    local t = inlines[i].t
    if t ~= "Space" and t ~= "SoftBreak" and t ~= "LineBreak" then
      return i
    end
  end
  return nil
end

-- インラインリストが「スペース系 + 対象画像コマンド + スペース系」だけか判定
local function is_only_image(inlines, idx)
  for i = 1, #inlines do
    local t = inlines[i].t
    if i == idx then
      -- ここは対象 RawInline なので OK
    else
      if t ~= "Space" and t ~= "SoftBreak" and t ~= "LineBreak" then
        return false
      end
    end
  end
  return true
end

-- 先頭の Space / SoftBreak / LineBreak を取り除く
local function trim_leading_spaces(inlines)
  local result = List{}
  local started = false
  for i = 1, #inlines do
    local el = inlines[i]
    if not started then
      local t = el.t
      if t == "Space" or t == "SoftBreak" or t == "LineBreak" then
        -- skip
      else
        started = true
        result:insert(el)
      end
    else
      result:insert(el)
    end
  end
  return result
end

-- Para / Plain を処理
local function handle_block(el)
  local inlines = el.content
  if not inlines or #inlines == 0 then
    return nil
  end

  -- 最初に見つかった image コマンドを探す
  local image_idx = nil
  local image_spec = nil
  for i = 1, #inlines do
    local parsed = parse_image_command(inlines[i])
    if parsed then
      image_idx = i
      image_spec = parsed
      break
    end
  end

  if not image_idx then
    return nil
  end

  -- フォーマット別の扱い：HTML 以外はシンプル画像にフォールバック
  if not FORMAT:match("html") then
    local new_inlines = List(inlines)
    new_inlines[image_idx] = make_image_inline(image_spec)
    el.content = new_inlines
    return el
  end

  -- 1) 段落全体が画像コマンドのみ → ブロック画像
  if is_only_image(inlines, image_idx) then
    return make_block_image(image_spec)
  end

  -- 2) 段落先頭が画像で、pos=left/right かつ後続テキストあり → レイアウトブロック
  local first_idx = first_non_space_index(inlines)
  local pos = (image_spec.opts.pos or image_spec.opts.position or "center"):lower()
  if first_idx == image_idx and (pos == "left" or pos == "right") then
    -- 画像以降のインラインをテキストとして使用
    local tail = List{}
    for i = image_idx + 1, #inlines do
      tail:insert(inlines[i])
    end
    local text_inlines = trim_leading_spaces(tail)
    return make_layout_block(image_spec, text_inlines)
  end

  -- 3) それ以外 → インライン画像に置き換えるだけ
  local new_inlines = List{}
  for i = 1, #inlines do
    if i == image_idx then
      new_inlines:insert(make_image_inline(image_spec))
    else
      new_inlines:insert(inlines[i])
    end
  end
  el.content = new_inlines
  return el
end

-- 段落内（インライン）
function Para(el)
  local res = handle_block(el)
  if res then
    return res
  end
  return el
end

function Plain(el)
  local res = handle_block(el)
  if res then
    return res
  end
  return el
end

-- 単独行に書かれたブロックレベルの \\image{...}{...}
function RawBlock(el)
  local spec = parse_image_command(el)
  if not spec then
    return nil
  end

  -- HTML 以外ではシンプルな画像段落として出力
  if not FORMAT:match("html") then
    return pandoc.Para({ make_image_inline(spec) })
  end

  return make_block_image(spec)
end

return {
  { Para = Para, Plain = Plain, RawBlock = RawBlock },
}
