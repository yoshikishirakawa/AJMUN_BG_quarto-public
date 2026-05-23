--
-- 方針:
--   * HTML 出力時のみ有効。
--   * 本文段落への適用はメタデータ / 環境変数で明示的に有効化する。
--     - 見出し (Header)
--     - 表のヘッダ・セル (Table 内のテキスト)
--     - 脚注本体 (Note)
--   * 形態素解析器 mecab を使って単語境界でトークン化し、
--     各トークンの間に <wbr> を挿入してブラウザ側で自然な折り返しを許可する。
--   * URL (http/https) は解析対象から除外し、そのまま残す。
--
-- 前提:
--   * 環境に mecab コマンドがインストールされていること。
--     - 見つからない場合は元のテキストをそのまま出力（ビルドは失敗しない）。

local List = require 'pandoc.List'
local stringify = pandoc.utils and pandoc.utils.stringify or tostring

local config = {
  apply_body = false,
  break_mode = 'lenient', -- lenient: 形態素単位以外の制約を付けない
}

local function is_html_format()
  if FORMAT == nil then
    return false
  end
  return FORMAT:match('html') ~= nil
end

-- HTML 以外のフォーマットでは何もしない
if not is_html_format() then
  return {}
end

local function normalize_bool(value)
  if value == nil then
    return nil
  end
  if type(value) == 'boolean' then
    return value
  end
  if type(value) == 'number' then
    return value ~= 0
  end
  if type(value) == 'string' then
    local lowered = value:lower()
    if lowered == 'true' or lowered == 'yes' or lowered == 'on' or lowered == '1' then
      return true
    end
    if lowered == 'false' or lowered == 'no' or lowered == 'off' or lowered == '0' then
      return false
    end
  end
  return nil
end

local function bool_from_meta(meta_value)
  if not meta_value then
    return nil
  end
  local value_type = type(meta_value)
  if value_type == 'boolean' then
    return meta_value
  end
  if value_type == 'number' then
    return meta_value ~= 0
  end
  if value_type == 'string' then
    return normalize_bool(meta_value)
  end
  if value_type == 'table' and meta_value.t then
    if meta_value.t == 'MetaBool' then
      return meta_value.boolean
    end
    if meta_value.t == 'MetaString' then
      return normalize_bool(meta_value.text)
    end
    return normalize_bool(stringify(meta_value))
  end
  return nil
end

local function string_from_meta(meta_value)
  if not meta_value then
    return nil
  end
  local value_type = type(meta_value)
  if value_type == 'string' then
    return meta_value
  end
  if value_type == 'table' and meta_value.t then
    if meta_value.t == 'MetaString' then
      return meta_value.text
    end
    return stringify(meta_value)
  end
  return tostring(meta_value)
end

local function read_env_bool(...)
  local keys = { ... }
  for i = 1, #keys do
    local val = normalize_bool(os.getenv(keys[i]))
    if val ~= nil then
      return val
    end
  end
  return nil
end

local function read_env_string(...)
  local keys = { ... }
  for i = 1, #keys do
    local val = os.getenv(keys[i])
    if val and val ~= '' then
      return val
    end
  end
  return nil
end

-- 日本語っぽい文字を含むかを簡易判定
local function has_japanese(text)
  if not text or text == '' then
    return false
  end
  -- おおまかな範囲: 漢字 + ひらがな + カタカナ + 長音符など
  return text:match('[一-龠ぁ-ゔァ-ヴー々〆〤]') ~= nil
end

-- URL 部分を検出して分割する
local function split_by_url(text)
  local parts = {}
  local last = 1
  -- http / https のみを対象とする（メールアドレス等は対象外）
  for s, e in text:gmatch('()https?://[%w%p%%#@:_/?=&~+-]+()') do
    if s > last then
      parts[#parts + 1] = { kind = 'text', value = text:sub(last, s - 1) }
    end
    parts[#parts + 1] = { kind = 'url', value = text:sub(s, e - 1) }
    last = e
  end
  if last <= #text then
    parts[#parts + 1] = { kind = 'text', value = text:sub(last) }
  end
  return parts
end

local MECAB_AVAILABLE = nil
local segment_cache = {}

local function ensure_mecab_available()
  if MECAB_AVAILABLE ~= nil then
    return MECAB_AVAILABLE
  end
  -- mecab の存在チェック（空入力で試す）
  local ok = pcall(pandoc.pipe, 'mecab', { '-Owakati' }, '')
  MECAB_AVAILABLE = ok
  return MECAB_AVAILABLE
end

-- mecab で分かち書きし、トークンの配列を返す
local function tokenize_with_mecab(text)
  if segment_cache[text] then
    return segment_cache[text]
  end

  if not ensure_mecab_available() then
    segment_cache[text] = { text }
    return segment_cache[text]
  end

  local ok, out = pcall(pandoc.pipe, 'mecab', { '-Owakati' }, text)
  if not ok or not out or out == '' then
    segment_cache[text] = { text }
    return segment_cache[text]
  end

  -- 行末の空白を削除し、空白区切りでトークンに分割
  out = out:gsub('%s+$', '')
  local tokens = {}
  for tok in out:gmatch('%S+') do
    tokens[#tokens + 1] = tok
  end
  if #tokens == 0 then
    tokens[1] = text
  end

  segment_cache[text] = tokens
  return tokens
end

local function should_segment_text(text)
  if not text or text == '' then
    return false
  end
  if not text:match('%S') then
    return false
  end
  if has_japanese(text) then
    return true
  end
  return config.break_mode == 'lenient'
end

-- 文字列を <wbr> 付きの Inlines に変換
local function segment_text(text)
  if not should_segment_text(text) then
    return List{ pandoc.Str(text) }
  end

  local parts = split_by_url(text)
  if #parts == 0 then
    return List{ pandoc.Str(text) }
  end

  local out = List{}

  for _, part in ipairs(parts) do
    if part.kind == 'url' then
      -- URL はそのまま 1 トークンとして出力
      out:insert(pandoc.Str(part.value))
    else
      local chunk = part.value
      if chunk ~= '' then
        if should_segment_text(chunk) then
          local tokens = tokenize_with_mecab(chunk)
          for i, tok in ipairs(tokens) do
            if tok ~= '' then
              out:insert(pandoc.Str(tok))
            end
            if i < #tokens then
              -- トークン間に手動改行ヒントを挿入
              out:insert(pandoc.RawInline('html', '<wbr>'))
            end
          end
        else
          -- 対象外はそのまま
          out:insert(pandoc.Str(chunk))
        end
      end
    end
  end

  return out
end

-- Inlines（インライン要素のリスト）を再帰的に変換
local function transform_inlines(inlines)
  if not inlines or #inlines == 0 then
    return inlines
  end
  local result = List{}
  for i = 1, #inlines do
    local inline = inlines[i]
    if inline.t == 'Str' then
      local segs = segment_text(inline.text or '')
      for j = 1, #segs do
        result:insert(segs[j])
      end
    elseif inline.content and type(inline.content) == 'table' then
      -- Emph, Strong, Span, Link など入れ子のインラインコンテナ
      inline.content = transform_inlines(inline.content)
      result:insert(inline)
    else
      result:insert(inline)
    end
  end
  return result
end

-- Para / Plain ブロック内のテキストを変換
local function transform_block(el)
  if (el.t == 'Para' or el.t == 'Plain') and el.content then
    el.content = transform_inlines(el.content)
    return el
  end
  return nil
end

-- Header 内のインラインにのみ適用
function Header(el)
  el.content = transform_inlines(el.content)
  return el
end

-- Table 内のヘッダ・セルに含まれるインラインに適用
function Table(el)
  -- Table 全体を walk して、Para / Plain のみ変換
  return pandoc.walk_block(el, { Para = transform_block, Plain = transform_block })
end

-- 脚注本体 (Note) の中だけを処理
function Note(el)
  -- el.content は Blocks（複数ブロックのリスト）なので、
  -- 個々の Block に対して walk_block を適用する。
  if type(el.content) == 'table' then
    for i = 1, #el.content do
      el.content[i] = pandoc.walk_block(el.content[i], { Para = transform_block, Plain = transform_block })
    end
  end
  return el
end

local function handle_body_block(el)
  if not config.apply_body then
    return nil
  end
  return transform_block(el)
end

function Meta(meta)
  local body_keys = { 'jp-linebreak-body', 'jp_linebreak_body', 'jpLinebreakBody' }
  for _, key in ipairs(body_keys) do
    local flag = bool_from_meta(meta[key])
    if flag ~= nil then
      config.apply_body = flag
      break
    end
  end

  if config.apply_body == false then
    local env_flag = read_env_bool('JP_LINEBREAK_BODY', 'JP_LINEBREAK_APPLY_BODY')
    if env_flag ~= nil then
      config.apply_body = env_flag
    end
  end

  local mode_keys = { 'jp-linebreak-mode', 'jp_linebreak_mode', 'jpLinebreakMode' }
  local mode_value = nil
  for _, key in ipairs(mode_keys) do
    local val = string_from_meta(meta[key])
    if val and val ~= '' then
      mode_value = val
      break
    end
  end
  if not mode_value then
    mode_value = read_env_string('JP_LINEBREAK_MODE')
  end

  if mode_value then
    local lowered = mode_value:lower()
    if lowered == 'lenient' or lowered == 'strict' then
      config.break_mode = lowered
    end
  end

  return meta
end

function Para(el)
  return handle_body_block(el)
end

function Plain(el)
  return handle_body_block(el)
end

return {
  {
    Meta = Meta,
    Header = Header,
    Table = Table,
    Note = Note,
    Para = Para,
    Plain = Plain,
  },
}
