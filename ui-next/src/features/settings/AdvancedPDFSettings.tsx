import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { settingsApi, TypographySettings, LayoutSettings, TOCSettings, RuleSettings, ImageSettings, FootnoteSettings, QuoteSettings, CodeBlockSettings, HeadingSettings } from "@/lib/api";
import { Loader2, Save, RefreshCw, FileText, Type, Layout, List, Ruler, Image as ImageIcon, Quote, Code, Heading } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface PDFAdvancedSettings {
    typography?: TypographySettings;
    layout?: LayoutSettings;
    toc?: TOCSettings;
    rules?: RuleSettings;
    images?: ImageSettings;
    footnotes?: FootnoteSettings;
    quotes?: QuoteSettings;
    codeBlocks?: CodeBlockSettings;
    headings?: HeadingSettings;
}

const DEFAULT_SETTINGS: PDFAdvancedSettings = {
    typography: {
        lineSpacing: 1.7,
        paragraphSpacing: 0.3,
        indentFirstLine: true,
        indentSize: 1.0,
        justify: true,
    },
    layout: {
        columns: 1,
        pageNumberStyle: 'arabic',
        pageNumberPosition: 'center',
        pageNumberStart: 1,
        showPageNumberFirst: true,
        headerStyle: 'simple',
    },
    toc: {
        maxLevel: 3,
        dotLeader: true,
        includeChapters: true,
        includeSections: true,
        includeSubsections: true,
    },
    rules: {
        showPageBorder: false,
        showChapterDivider: true,
        chapterDividerStyle: 'line',
        tableVerticalLines: true,
    },
    images: {
        defaultAlign: 'center',
        captionStyle: 'bold',
        captionPosition: 'bottom',
        margin: 0.5,
    },
    footnotes: {
        markStyle: 'asterisk',
        placement: 'bottom',
        fontScale: 0.8,
    },
    quotes: {
        style: 'left-border',
        indent: 1.0,
        borderStyle: 'solid',
        background: false,
    },
    codeBlocks: {
        theme: 'monokai',
        fontFamily: 'inconsolata',
        background: true,
        border: true,
    },
    headings: {
        baseFontSize: 10.5,
        chapter: {
            fontSize: 16.0,
            fontFamily: 'mincho',
            alignment: 'center',
            color: 'titleblue',
            bold: true,
            spacingBefore: 0,
            spacingAfter: 20,
        },
        section: {
            fontSize: 14.0,
            fontFamily: 'mincho',
            alignment: 'left',
            color: 'titleblue',
            bold: true,
            leftBorderStyle: 'thick',
            leftBorderWidth: 2.0,
            spacingBefore: 12,
            spacingAfter: 6,
        },
        subsection: {
            fontSize: 12.0,
            fontFamily: 'mincho',
            alignment: 'left',
            color: 'black',
            bold: true,
            leftBorderStyle: 'none',
            leftBorderWidth: 1.0,
            spacingBefore: 10,
            spacingAfter: 5,
        },
        subsubsection: {
            fontSize: 10.5,
            fontFamily: 'gothic',
            alignment: 'left',
            color: 'gray',
            bold: true,
            leftBorderStyle: 'double',
            leftBorderWidth: 1.0,
            spacingBefore: 8,
            spacingAfter: 4,
        },
    },
};

// Typography Section
const TypographySection: React.FC<{
    settings: TypographySettings;
    onChange: (settings: TypographySettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">組版設定</Label>
            </div>

            {/* Line Spacing */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">行間隔 ({settings.lineSpacing || 1.7})</Label>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">1.0</span>
                    <Slider
                        value={[settings.lineSpacing || 1.7]}
                        onValueChange={([v]) => onChange({ ...settings, lineSpacing: v })}
                        min={1.0}
                        max={2.5}
                        step={0.1}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">2.5</span>
                </div>
            </div>

            {/* Paragraph Spacing */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">段落間隔 ({settings.paragraphSpacing || 0.3}em)</Label>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">0</span>
                    <Slider
                        value={[settings.paragraphSpacing || 0.3]}
                        onValueChange={([v]) => onChange({ ...settings, paragraphSpacing: v })}
                        min={0}
                        max={1.0}
                        step={0.05}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">1.0</span>
                </div>
            </div>

            {/* Indent First Line */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">行頭一字下げ</Label>
                    <p className="text-xs text-muted-foreground">段落の最初を1文字分下げる</p>
                </div>
                <Switch
                    checked={settings.indentFirstLine ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, indentFirstLine: v })}
                />
            </div>

            {/* Indent Size */}
            {settings.indentFirstLine && (
                <div className="space-y-2 ml-4">
                    <Label className="text-sm">字下げ量 ({settings.indentSize || 1.0}em)</Label>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground w-12">0.5</span>
                        <Slider
                            value={[settings.indentSize || 1.0]}
                            onValueChange={([v]) => onChange({ ...settings, indentSize: v })}
                            min={0.5}
                            max={2.0}
                            step={0.1}
                            className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-12">2.0</span>
                    </div>
                </div>
            )}

            {/* Justify */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">両端揃え</Label>
                    <p className="text-xs text-muted-foreground">行末を揃えて整形する</p>
                </div>
                <Switch
                    checked={settings.justify ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, justify: v })}
                />
            </div>
        </div>
    );
};

// Layout Section
const LayoutSection: React.FC<{
    settings: LayoutSettings;
    onChange: (settings: LayoutSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Layout className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">レイアウト設定</Label>
            </div>

            {/* Columns */}
            <div className="space-y-2">
                <Label className="text-sm">段組み</Label>
                <Select value={String(settings.columns ?? 1)} onValueChange={(v) => onChange({ ...settings, columns: parseInt(v) })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="1">1段組</SelectItem>
                        <SelectItem value="2">2段組</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Page Number Style */}
            <div className="space-y-2">
                <Label className="text-sm">ノンブルスタイル</Label>
                <Select value={settings.pageNumberStyle || 'arabic'} onValueChange={(v) => onChange({ ...settings, pageNumberStyle: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="arabic">算用数字 (1, 2, 3...)</SelectItem>
                        <SelectItem value="roman">ローマ数字小文字 (i, ii, iii...)</SelectItem>
                        <SelectItem value="ROMAN">ローマ数字大文字 (I, II, III...)</SelectItem>
                        <SelectItem value="chinese">漢数字 (一、二、三...)</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Page Number Position */}
            <div className="space-y-2">
                <Label className="text-sm">ノンブル位置</Label>
                <Select value={settings.pageNumberPosition || 'center'} onValueChange={(v) => onChange({ ...settings, pageNumberPosition: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="left">左</SelectItem>
                        <SelectItem value="center">中央</SelectItem>
                        <SelectItem value="right">右</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Page Number Start */}
            <div className="space-y-2">
                <Label className="text-sm">開始ページ番号</Label>
                <Input
                    type="number"
                    value={settings.pageNumberStart ?? 1}
                    onChange={(e) => onChange({ ...settings, pageNumberStart: parseInt(e.target.value) || 1 })}
                    className="w-20"
                    min={1}
                />
            </div>

            {/* Show Page Number First */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">最初のページにノンブルを表示</Label>
                </div>
                <Switch
                    checked={settings.showPageNumberFirst ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, showPageNumberFirst: v })}
                />
            </div>

            {/* Header Style */}
            <div className="space-y-2">
                <Label className="text-sm">柱スタイル</Label>
                <Select value={settings.headerStyle || 'simple'} onValueChange={(v) => onChange({ ...settings, headerStyle: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="simple">シンプル（章タイトルのみ）</SelectItem>
                        <SelectItem value="detailed">詳細（章+節）</SelectItem>
                        <SelectItem value="none">なし</SelectItem>
                    </SelectContent>
                </Select>
            </div>
        </div>
    );
};

// TOC Section
const TOCSection: React.FC<{
    settings: TOCSettings;
    onChange: (settings: TOCSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <List className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">目次設定</Label>
            </div>

            {/* Max Level */}
            <div className="space-y-2">
                <Label className="text-sm">最大見出しレベル: {settings.maxLevel || 3}</Label>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">1</span>
                    <Slider
                        value={[settings.maxLevel || 3]}
                        onValueChange={([v]) => onChange({ ...settings, maxLevel: v })}
                        min={1}
                        max={5}
                        step={1}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">5</span>
                </div>
                <p className="text-xs text-muted-foreground">目次に含める見出しの最大階層</p>
            </div>

            {/* Dot Leader */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">ドットリーダー</Label>
                    <p className="text-xs text-muted-foreground">見出しとページ番号の間に点を表示</p>
                </div>
                <Switch
                    checked={settings.dotLeader ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, dotLeader: v })}
                />
            </div>

            {/* Include Chapters */}
            <div className="flex items-center justify-between">
                <Label className="text-sm">章を含める</Label>
                <Switch
                    checked={settings.includeChapters ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, includeChapters: v })}
                />
            </div>

            {/* Include Sections */}
            <div className="flex items-center justify-between">
                <Label className="text-sm">節を含める</Label>
                <Switch
                    checked={settings.includeSections ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, includeSections: v })}
                />
            </div>

            {/* Include Subsections */}
            <div className="flex items-center justify-between">
                <Label className="text-sm">小節を含める</Label>
                <Switch
                    checked={settings.includeSubsections ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, includeSubsections: v })}
                />
            </div>
        </div>
    );
};

// Rules Section
const RulesSection: React.FC<{
    settings: RuleSettings;
    onChange: (settings: RuleSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">罫線・ルール設定</Label>
            </div>

            {/* Show Page Border */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">ページ枠を表示</Label>
                    <p className="text-xs text-muted-foreground">ページ周囲に枠線を表示</p>
                </div>
                <Switch
                    checked={settings.showPageBorder ?? false}
                    onCheckedChange={(v) => onChange({ ...settings, showPageBorder: v })}
                />
            </div>

            {/* Show Chapter Divider */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">章区切りを表示</Label>
                    <p className="text-xs text-muted-foreground">章の間に区切り線を表示</p>
                </div>
                <Switch
                    checked={settings.showChapterDivider ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, showChapterDivider: v })}
                />
            </div>

            {/* Chapter Divider Style */}
            {settings.showChapterDivider && (
                <div className="space-y-2 ml-4">
                    <Label className="text-sm">区切りスタイル</Label>
                    <Select value={settings.chapterDividerStyle || 'line'} onValueChange={(v) => onChange({ ...settings, chapterDividerStyle: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="line">直線</SelectItem>
                            <SelectItem value="dashed">破線</SelectItem>
                            <SelectItem value="dotted">点線</SelectItem>
                            <SelectItem value="double">二重線</SelectItem>
                            <SelectItem value="blank">空白</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Table Vertical Lines */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">表の縦線を表示</Label>
                    <p className="text-xs text-muted-foreground">表の縦罫線を表示する</p>
                </div>
                <Switch
                    checked={settings.tableVerticalLines ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, tableVerticalLines: v })}
                />
            </div>
        </div>
    );
};

// Images Section
const ImagesSection: React.FC<{
    settings: ImageSettings;
    onChange: (settings: ImageSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">画像設定</Label>
            </div>

            {/* Default Align */}
            <div className="space-y-2">
                <Label className="text-sm">デフォルト配置</Label>
                <Select value={settings.defaultAlign || 'center'} onValueChange={(v) => onChange({ ...settings, defaultAlign: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="left">左寄せ</SelectItem>
                        <SelectItem value="center">中央</SelectItem>
                        <SelectItem value="right">右寄せ</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Caption Style */}
            <div className="space-y-2">
                <Label className="text-sm">キャプションスタイル</Label>
                <Select value={settings.captionStyle || 'bold'} onValueChange={(v) => onChange({ ...settings, captionStyle: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bold">太字</SelectItem>
                        <SelectItem value="normal">標準</SelectItem>
                        <SelectItem value="italic">斜体</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Caption Position */}
            <div className="space-y-2">
                <Label className="text-sm">キャプション位置</Label>
                <Select value={settings.captionPosition || 'bottom'} onValueChange={(v) => onChange({ ...settings, captionPosition: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="top">上</SelectItem>
                        <SelectItem value="bottom">下</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Margin */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">周囲の余白: {settings.margin || 0.5}em</Label>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">0</span>
                    <Slider
                        value={[settings.margin || 0.5]}
                        onValueChange={([v]) => onChange({ ...settings, margin: v })}
                        min={0}
                        max={2.0}
                        step={0.1}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">2.0</span>
                </div>
            </div>
        </div>
    );
};

// Footnotes Section
const FootnotesSection: React.FC<{
    settings: FootnoteSettings;
    onChange: (settings: FootnoteSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">脚注設定</Label>
            </div>

            {/* Mark Style */}
            <div className="space-y-2">
                <Label className="text-sm">注釈記号スタイル</Label>
                <Select value={settings.markStyle || 'asterisk'} onValueChange={(v) => onChange({ ...settings, markStyle: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="asterisk">アスタリスク (*)</SelectItem>
                        <SelectItem value="number">数字 (1, 2, 3...)</SelectItem>
                        <SelectItem value="symbol">記号 (†, ‡, §...)</SelectItem>
                        <SelectItem value="continuous">連番</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Placement */}
            <div className="space-y-2">
                <Label className="text-sm">配置</Label>
                <Select value={settings.placement || 'bottom'} onValueChange={(v) => onChange({ ...settings, placement: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bottom">ページ下部</SelectItem>
                        <SelectItem value="end">文書末尾</SelectItem>
                        <SelectItem value="section">節末尾</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Font Scale */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">フォントサイズ: {Math.round((settings.fontScale || 0.8) * 100)}%</Label>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">50%</span>
                    <Slider
                        value={[settings.fontScale || 0.8]}
                        onValueChange={([v]) => onChange({ ...settings, fontScale: v })}
                        min={0.5}
                        max={1.0}
                        step={0.05}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">100%</span>
                </div>
            </div>
        </div>
    );
};

// Quotes Section
const QuotesSection: React.FC<{
    settings: QuoteSettings;
    onChange: (settings: QuoteSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Quote className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">引用ブロック設定</Label>
            </div>

            {/* Style */}
            <div className="space-y-2">
                <Label className="text-sm">スタイル</Label>
                <Select value={settings.style || 'left-border'} onValueChange={(v) => onChange({ ...settings, style: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="left-border">左ボーダー</SelectItem>
                        <SelectItem value="box">ボックス</SelectItem>
                        <SelectItem value="indented">インデントのみ</SelectItem>
                        <SelectItem value="blockquote">引用記号付き</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Indent */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">インデント: {settings.indent || 1.0}em</Label>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">0</span>
                    <Slider
                        value={[settings.indent || 1.0]}
                        onValueChange={([v]) => onChange({ ...settings, indent: v })}
                        min={0}
                        max={3.0}
                        step={0.1}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">3.0</span>
                </div>
            </div>

            {/* Border Style */}
            {settings.style !== 'indented' && (
                <div className="space-y-2">
                    <Label className="text-sm">ボーダースタイル</Label>
                    <Select value={settings.borderStyle || 'solid'} onValueChange={(v) => onChange({ ...settings, borderStyle: v })}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="solid">直線</SelectItem>
                            <SelectItem value="dashed">破線</SelectItem>
                            <SelectItem value="dotted">点線</SelectItem>
                            <SelectItem value="double">二重線</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            )}

            {/* Background */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">背景色</Label>
                    <p className="text-xs text-muted-foreground">引用ブロックに背景色を付ける</p>
                </div>
                <Switch
                    checked={settings.background ?? false}
                    onCheckedChange={(v) => onChange({ ...settings, background: v })}
                />
            </div>
        </div>
    );
};

// Code Blocks Section
const CodeBlocksSection: React.FC<{
    settings: CodeBlockSettings;
    onChange: (settings: CodeBlockSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-2">
                <Code className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">コードブロック設定</Label>
            </div>

            {/* Theme */}
            <div className="space-y-2">
                <Label className="text-sm">テーマ</Label>
                <Select value={settings.theme || 'monokai'} onValueChange={(v) => onChange({ ...settings, theme: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="monokai">Monokai</SelectItem>
                        <SelectItem value="github">GitHub Light</SelectItem>
                        <SelectItem value="nord">Nord</SelectItem>
                        <SelectItem value="dracula">Dracula</SelectItem>
                        <SelectItem value="solarized">Solarized</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Font Family */}
            <div className="space-y-2">
                <Label className="text-sm">フォントファミリー</Label>
                <Select value={settings.fontFamily || 'inconsolata'} onValueChange={(v) => onChange({ ...settings, fontFamily: v })}>
                    <SelectTrigger>
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="inconsolata">Inconsolata</SelectItem>
                        <SelectItem value="fira-code">Fira Code</SelectItem>
                        <SelectItem value="source-code-pro">Source Code Pro</SelectItem>
                        <SelectItem value="jetbrains-mono">JetBrains Mono</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Background */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">背景色</Label>
                    <p className="text-xs text-muted-foreground">コードブロックに背景色を付ける</p>
                </div>
                <Switch
                    checked={settings.background ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, background: v })}
                />
            </div>

            {/* Border */}
            <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                    <Label className="text-sm">ボーダー</Label>
                    <p className="text-xs text-muted-foreground">コードブロックに枠線を表示</p>
                </div>
                <Switch
                    checked={settings.border ?? true}
                    onCheckedChange={(v) => onChange({ ...settings, border: v })}
                />
            </div>
        </div>
    );
};

// Headings Section
const HeadingsSection: React.FC<{
    settings: HeadingSettings;
    onChange: (settings: HeadingSettings) => void;
}> = ({ settings, onChange }) => {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-2">
                <Heading className="h-4 w-4 text-muted-foreground" />
                <Label className="text-base font-medium">見出しスタイル設定</Label>
            </div>

            {/* 本文基本フォントサイズ */}
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <Label className="text-sm">本文基本フォントサイズ: {settings.baseFontSize || 10.5}pt</Label>
                </div>
                <div className="flex items-center gap-4">
                    <span className="text-xs text-muted-foreground w-12">9pt</span>
                    <Slider
                        value={[settings.baseFontSize || 10.5]}
                        onValueChange={([v]) => onChange({ ...settings, baseFontSize: v })}
                        min={9}
                        max={14}
                        step={0.5}
                        className="flex-1"
                    />
                    <span className="text-xs text-muted-foreground w-12">14pt</span>
                </div>
                <p className="text-xs text-muted-foreground">本文の基本フォントサイズ（見出しの相対サイズに影響）</p>
            </div>

            <Separator />

            {/* 章 (Chapter) */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">章 (Chapter)</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* フォントサイズ */}
                    <div className="space-y-2">
                        <Label className="text-sm">フォントサイズ: {settings.chapter?.fontSize || 16}pt</Label>
                        <Slider
                            value={[settings.chapter?.fontSize || 16]}
                            onValueChange={([v]) => onChange({ ...settings, chapter: { ...settings.chapter, fontSize: v } })}
                            min={12}
                            max={24}
                            step={0.5}
                            className="flex-1"
                        />
                    </div>

                    {/* フォントファミリー */}
                    <div className="space-y-2">
                        <Label className="text-sm">フォント</Label>
                        <Select value={settings.chapter?.fontFamily || 'mincho'} onValueChange={(v) => onChange({ ...settings, chapter: { ...settings.chapter, fontFamily: v as 'mincho' | 'gothic' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mincho">明朝体</SelectItem>
                                <SelectItem value="gothic">ゴシック体</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    {/* 配置 */}
                    <div className="space-y-2">
                        <Label className="text-sm">配置</Label>
                        <Select value={settings.chapter?.alignment || 'center'} onValueChange={(v) => onChange({ ...settings, chapter: { ...settings.chapter, alignment: v as 'left' | 'center' | 'right' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">左寄せ</SelectItem>
                                <SelectItem value="center">中央揃え</SelectItem>
                                <SelectItem value="right">右寄せ</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* 色 */}
                    <div className="space-y-2">
                        <Label className="text-sm">色</Label>
                        <Select value={settings.chapter?.color || 'titleblue'} onValueChange={(v) => onChange({ ...settings, chapter: { ...settings.chapter, color: v } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="titleblue">タイトルブルー（既定義）</SelectItem>
                                <SelectItem value="black">黒</SelectItem>
                                <SelectItem value="gray">グレー</SelectItem>
                                <SelectItem value="#000000">黒 (#000000)</SelectItem>
                                <SelectItem value="#37474f">ダークグレー (#37474f)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* 太字 */}
                <div className="flex items-center justify-between">
                    <Label className="text-sm">太字</Label>
                    <Switch
                        checked={settings.chapter?.bold ?? true}
                        onCheckedChange={(v) => onChange({ ...settings, chapter: { ...settings.chapter, bold: v } })}
                    />
                </div>

                {/* 前後余白 */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">前余白: {settings.chapter?.spacingBefore || 0}pt</Label>
                        <Slider
                            value={[settings.chapter?.spacingBefore || 0]}
                            onValueChange={([v]) => onChange({ ...settings, chapter: { ...settings.chapter, spacingBefore: v } })}
                            min={-10}
                            max={30}
                            step={1}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">後余白: {settings.chapter?.spacingAfter || 20}pt</Label>
                        <Slider
                            value={[settings.chapter?.spacingAfter || 20]}
                            onValueChange={([v]) => onChange({ ...settings, chapter: { ...settings.chapter, spacingAfter: v } })}
                            min={0}
                            max={40}
                            step={1}
                        />
                    </div>
                </div>
            </div>

            {/* 節 (Section) */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">節 (Section)</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">フォントサイズ: {settings.section?.fontSize || 14}pt</Label>
                        <Slider
                            value={[settings.section?.fontSize || 14]}
                            onValueChange={([v]) => onChange({ ...settings, section: { ...settings.section, fontSize: v } })}
                            min={10}
                            max={18}
                            step={0.5}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">フォント</Label>
                        <Select value={settings.section?.fontFamily || 'mincho'} onValueChange={(v) => onChange({ ...settings, section: { ...settings.section, fontFamily: v as 'mincho' | 'gothic' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mincho">明朝体</SelectItem>
                                <SelectItem value="gothic">ゴシック体</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">配置</Label>
                        <Select value={settings.section?.alignment || 'left'} onValueChange={(v) => onChange({ ...settings, section: { ...settings.section, alignment: v as 'left' | 'center' | 'right' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">左寄せ</SelectItem>
                                <SelectItem value="center">中央揃え</SelectItem>
                                <SelectItem value="right">右寄せ</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">色</Label>
                        <Select value={settings.section?.color || 'titleblue'} onValueChange={(v) => onChange({ ...settings, section: { ...settings.section, color: v } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="titleblue">タイトルブルー</SelectItem>
                                <SelectItem value="black">黒</SelectItem>
                                <SelectItem value="gray">グレー</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm">太字</Label>
                        <Switch
                            checked={settings.section?.bold ?? true}
                            onCheckedChange={(v) => onChange({ ...settings, section: { ...settings.section, bold: v } })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">左罫線</Label>
                        <Select value={settings.section?.leftBorderStyle || 'thick'} onValueChange={(v) => onChange({ ...settings, section: { ...settings.section, leftBorderStyle: v as 'none' | 'single' | 'double' | 'thick' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">なし</SelectItem>
                                <SelectItem value="single">細線</SelectItem>
                                <SelectItem value="thick">太線</SelectItem>
                                <SelectItem value="double">二重線</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {settings.section?.leftBorderStyle && settings.section?.leftBorderStyle !== 'none' && (
                    <div className="space-y-2">
                        <Label className="text-sm">罫線太さ: {settings.section?.leftBorderWidth || 2}pt</Label>
                        <Slider
                            value={[settings.section?.leftBorderWidth || 2]}
                            onValueChange={([v]) => onChange({ ...settings, section: { ...settings.section, leftBorderWidth: v } })}
                            min={0.5}
                            max={5}
                            step={0.5}
                        />
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">前余白: {settings.section?.spacingBefore || 12}pt</Label>
                        <Slider
                            value={[settings.section?.spacingBefore || 12]}
                            onValueChange={([v]) => onChange({ ...settings, section: { ...settings.section, spacingBefore: v } })}
                            min={0}
                            max={30}
                            step={1}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">後余白: {settings.section?.spacingAfter || 6}pt</Label>
                        <Slider
                            value={[settings.section?.spacingAfter || 6]}
                            onValueChange={([v]) => onChange({ ...settings, section: { ...settings.section, spacingAfter: v } })}
                            min={0}
                            max={20}
                            step={1}
                        />
                    </div>
                </div>
            </div>

            {/* 項 (Subsection) */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">項 (Subsection)</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">フォントサイズ: {settings.subsection?.fontSize || 12}pt</Label>
                        <Slider
                            value={[settings.subsection?.fontSize || 12]}
                            onValueChange={([v]) => onChange({ ...settings, subsection: { ...settings.subsection, fontSize: v } })}
                            min={9}
                            max={16}
                            step={0.5}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">フォント</Label>
                        <Select value={settings.subsection?.fontFamily || 'mincho'} onValueChange={(v) => onChange({ ...settings, subsection: { ...settings.subsection, fontFamily: v as 'mincho' | 'gothic' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mincho">明朝体</SelectItem>
                                <SelectItem value="gothic">ゴシック体</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">配置</Label>
                        <Select value={settings.subsection?.alignment || 'left'} onValueChange={(v) => onChange({ ...settings, subsection: { ...settings.subsection, alignment: v as 'left' | 'center' | 'right' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">左寄せ</SelectItem>
                                <SelectItem value="center">中央揃え</SelectItem>
                                <SelectItem value="right">右寄せ</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">色</Label>
                        <Select value={settings.subsection?.color || 'black'} onValueChange={(v) => onChange({ ...settings, subsection: { ...settings.subsection, color: v } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="titleblue">タイトルブルー</SelectItem>
                                <SelectItem value="black">黒</SelectItem>
                                <SelectItem value="gray">グレー</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm">太字</Label>
                        <Switch
                            checked={settings.subsection?.bold ?? true}
                            onCheckedChange={(v) => onChange({ ...settings, subsection: { ...settings.subsection, bold: v } })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">左罫線</Label>
                        <Select value={settings.subsection?.leftBorderStyle || 'none'} onValueChange={(v) => onChange({ ...settings, subsection: { ...settings.subsection, leftBorderStyle: v as 'none' | 'single' | 'double' | 'thick' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">なし</SelectItem>
                                <SelectItem value="single">細線</SelectItem>
                                <SelectItem value="thick">太線</SelectItem>
                                <SelectItem value="double">二重線</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">前余白: {settings.subsection?.spacingBefore || 10}pt</Label>
                        <Slider
                            value={[settings.subsection?.spacingBefore || 10]}
                            onValueChange={([v]) => onChange({ ...settings, subsection: { ...settings.subsection, spacingBefore: v } })}
                            min={0}
                            max={20}
                            step={1}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">後余白: {settings.subsection?.spacingAfter || 5}pt</Label>
                        <Slider
                            value={[settings.subsection?.spacingAfter || 5]}
                            onValueChange={([v]) => onChange({ ...settings, subsection: { ...settings.subsection, spacingAfter: v } })}
                            min={0}
                            max={15}
                            step={1}
                        />
                    </div>
                </div>
            </div>

            {/* 小項 (Subsubsection) */}
            <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">小項 (Subsubsection)</span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">フォントサイズ: {settings.subsubsection?.fontSize || 10.5}pt</Label>
                        <Slider
                            value={[settings.subsubsection?.fontSize || 10.5]}
                            onValueChange={([v]) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, fontSize: v } })}
                            min={8}
                            max={14}
                            step={0.5}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">フォント</Label>
                        <Select value={settings.subsubsection?.fontFamily || 'gothic'} onValueChange={(v) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, fontFamily: v as 'mincho' | 'gothic' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="mincho">明朝体</SelectItem>
                                <SelectItem value="gothic">ゴシック体</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">配置</Label>
                        <Select value={settings.subsubsection?.alignment || 'left'} onValueChange={(v) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, alignment: v as 'left' | 'center' | 'right' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="left">左寄せ</SelectItem>
                                <SelectItem value="center">中央揃え</SelectItem>
                                <SelectItem value="right">右寄せ</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">色</Label>
                        <Select value={settings.subsubsection?.color || 'gray'} onValueChange={(v) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, color: v } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="titleblue">タイトルブルー</SelectItem>
                                <SelectItem value="black">黒</SelectItem>
                                <SelectItem value="gray">グレー</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between">
                        <Label className="text-sm">太字</Label>
                        <Switch
                            checked={settings.subsubsection?.bold ?? true}
                            onCheckedChange={(v) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, bold: v } })}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-sm">左罫線</Label>
                        <Select value={settings.subsubsection?.leftBorderStyle || 'double'} onValueChange={(v) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, leftBorderStyle: v as 'none' | 'single' | 'double' | 'thick' } })}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="none">なし</SelectItem>
                                <SelectItem value="single">細線</SelectItem>
                                <SelectItem value="thick">太線</SelectItem>
                                <SelectItem value="double">二重線</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-sm">前余白: {settings.subsubsection?.spacingBefore || 8}pt</Label>
                        <Slider
                            value={[settings.subsubsection?.spacingBefore || 8]}
                            onValueChange={([v]) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, spacingBefore: v } })}
                            min={0}
                            max={20}
                            step={1}
                        />
                    </div>
                    <div className="space-y-2">
                        <Label className="text-sm">後余白: {settings.subsubsection?.spacingAfter || 4}pt</Label>
                        <Slider
                            value={[settings.subsubsection?.spacingAfter || 4]}
                            onValueChange={([v]) => onChange({ ...settings, subsubsection: { ...settings.subsubsection, spacingAfter: v } })}
                            min={0}
                            max={15}
                            step={1}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

// Collapsible Section Wrapper
const CollapsibleSection: React.FC<{
    title: string;
    icon: React.ReactNode;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, icon, defaultOpen = true, children }) => {
    const [isOpen, setIsOpen] = React.useState(defaultOpen);

    return (
        <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <div className="border rounded-lg p-4 space-y-4">
                <CollapsibleTrigger className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                        {icon}
                        <span className="font-medium">{title}</span>
                    </div>
                    <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "transform rotate-180")} />
                </CollapsibleTrigger>
                <CollapsibleContent>
                    <Separator className="mb-4" />
                    {children}
                </CollapsibleContent>
            </div>
        </Collapsible>
    );
};

// Main Component
export const AdvancedPDFSettings: React.FC = () => {
    const [settings, setSettings] = useState<PDFAdvancedSettings>(DEFAULT_SETTINGS);
    const [isLoading, setIsLoading] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);
    const [savingSection, setSavingSection] = useState<string | null>(null);
    const { toast } = useToast();

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await settingsApi.getAll();
            const pdfData = response.data.pdf || {};
            setSettings({
                typography: { ...DEFAULT_SETTINGS.typography, ...pdfData.typography },
                layout: { ...DEFAULT_SETTINGS.layout, ...pdfData.layout },
                toc: { ...DEFAULT_SETTINGS.toc, ...pdfData.toc },
                rules: { ...DEFAULT_SETTINGS.rules, ...pdfData.rules },
                images: { ...DEFAULT_SETTINGS.images, ...pdfData.images },
                footnotes: { ...DEFAULT_SETTINGS.footnotes, ...pdfData.footnotes },
                quotes: { ...DEFAULT_SETTINGS.quotes, ...pdfData.quotes },
                codeBlocks: { ...DEFAULT_SETTINGS.codeBlocks, ...pdfData.codeBlocks },
                headings: { ...DEFAULT_SETTINGS.headings, ...pdfData.headings },
            });
        } catch (error) {
            console.error("Failed to load settings:", error);
            toast({
                title: "エラー",
                description: "詳細設定の読み込みに失敗しました",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const saveSection = async (section: keyof PDFAdvancedSettings, data: any) => {
        setSavingSection(section);
        try {
            switch (section) {
                case 'typography':
                    await settingsApi.updateTypography(data as TypographySettings);
                    break;
                case 'layout':
                    await settingsApi.updateLayout(data as LayoutSettings);
                    break;
                case 'toc':
                    await settingsApi.updateToc(data as TOCSettings);
                    break;
                case 'rules':
                    await settingsApi.updateRules(data as RuleSettings);
                    break;
                case 'images':
                    await settingsApi.updateImages(data as ImageSettings);
                    break;
                case 'footnotes':
                    await settingsApi.updateFootnotes(data as FootnoteSettings);
                    break;
                case 'quotes':
                    await settingsApi.updateQuotes(data as QuoteSettings);
                    break;
                case 'codeBlocks':
                    await settingsApi.updateCodeBlocks(data as CodeBlockSettings);
                    break;
                case 'headings':
                    await settingsApi.updateHeadings(data as HeadingSettings);
                    break;
            }
            await settingsApi.syncToYml();
            setHasChanges(false);
            toast({
                title: "保存完了",
                description: "設定を保存し、_quarto.ymlを更新しました",
            });
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast({
                title: "エラー",
                description: "設定の保存に失敗しました",
                variant: "destructive",
            });
        } finally {
            setSavingSection(null);
        }
    };

    const handleReset = async () => {
        await loadSettings();
        setHasChanges(false);
        toast({
            title: "リセット完了",
            description: "変更を破棄しました",
        });
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">読み込み中...</span>
            </div>
        );
    }

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            PDF詳細設定
                        </CardTitle>
                        <CardDescription>
                            組版、レイアウト、目次、罫線、画像、脚注、引用、コードブロック、見出しスタイルの詳細設定
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleReset}
                            disabled={!hasChanges}
                        >
                            <RefreshCw className="h-4 w-4 mr-1" />
                            リセット
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <CollapsibleSection
                    title="組版設定"
                    icon={<Type className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={true}
                >
                    <TypographySection
                        settings={settings.typography!}
                        onChange={(s) => {
                            setSettings({ ...settings, typography: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('typography', settings.typography)}
                            disabled={savingSection === 'typography'}
                        >
                            {savingSection === 'typography' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="レイアウト設定"
                    icon={<Layout className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <LayoutSection
                        settings={settings.layout!}
                        onChange={(s) => {
                            setSettings({ ...settings, layout: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('layout', settings.layout)}
                            disabled={savingSection === 'layout'}
                        >
                            {savingSection === 'layout' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="目次設定"
                    icon={<List className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <TOCSection
                        settings={settings.toc!}
                        onChange={(s) => {
                            setSettings({ ...settings, toc: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('toc', settings.toc)}
                            disabled={savingSection === 'toc'}
                        >
                            {savingSection === 'toc' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="罫線・ルール設定"
                    icon={<Ruler className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <RulesSection
                        settings={settings.rules!}
                        onChange={(s) => {
                            setSettings({ ...settings, rules: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('rules', settings.rules)}
                            disabled={savingSection === 'rules'}
                        >
                            {savingSection === 'rules' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="画像設定"
                    icon={<ImageIcon className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <ImagesSection
                        settings={settings.images!}
                        onChange={(s) => {
                            setSettings({ ...settings, images: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('images', settings.images)}
                            disabled={savingSection === 'images'}
                        >
                            {savingSection === 'images' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="脚注設定"
                    icon={<FileText className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <FootnotesSection
                        settings={settings.footnotes!}
                        onChange={(s) => {
                            setSettings({ ...settings, footnotes: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('footnotes', settings.footnotes)}
                            disabled={savingSection === 'footnotes'}
                        >
                            {savingSection === 'footnotes' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="引用ブロック設定"
                    icon={<Quote className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <QuotesSection
                        settings={settings.quotes!}
                        onChange={(s) => {
                            setSettings({ ...settings, quotes: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('quotes', settings.quotes)}
                            disabled={savingSection === 'quotes'}
                        >
                            {savingSection === 'quotes' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="コードブロック設定"
                    icon={<Code className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <CodeBlocksSection
                        settings={settings.codeBlocks!}
                        onChange={(s) => {
                            setSettings({ ...settings, codeBlocks: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('codeBlocks', settings.codeBlocks)}
                            disabled={savingSection === 'codeBlocks'}
                        >
                            {savingSection === 'codeBlocks' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>

                <CollapsibleSection
                    title="見出しスタイル設定"
                    icon={<Heading className="h-4 w-4 text-muted-foreground" />}
                    defaultOpen={false}
                >
                    <HeadingsSection
                        settings={settings.headings!}
                        onChange={(s) => {
                            setSettings({ ...settings, headings: s });
                            setHasChanges(true);
                        }}
                    />
                    <div className="flex justify-end pt-2">
                        <Button
                            size="sm"
                            onClick={() => saveSection('headings', settings.headings)}
                            disabled={savingSection === 'headings'}
                        >
                            {savingSection === 'headings' ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </CollapsibleSection>
            </CardContent>
        </Card>
    );
};
