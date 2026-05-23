import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { settingsApi } from "@/lib/api";
import { Loader2, Save, RefreshCw, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Slider } from "@/components/ui/slider";

interface PDFSettings {
    pageSize: string;
    fontSize: number;
    margins: {
        top: string;
        left: string;
        height: string;
    };
    fonts: {
        main: string;
        sans: string;
    };
    footer_text?: string;
}

const PAGE_SIZE_OPTIONS = [
    { value: "a4", label: "A4", dimensions: "210 x 297 mm" },
    { value: "a5", label: "A5", dimensions: "148 x 210 mm" },
    { value: "b5", label: "B5", dimensions: "176 x 250 mm" },
    { value: "letter", label: "Letter", dimensions: "8.5 x 11 in" },
    { value: "legal", label: "Legal", dimensions: "8.5 x 14 in" },
];

const FONT_OPTIONS = [
    { value: "Harano Aji Mincho", label: "Harano Aji Mincho" },
    { value: "Harano Aji Gothic", label: "Harano Aji Gothic" },
    { value: "Noto Sans CJK JP", label: "Noto Sans CJK JP" },
    { value: "Noto Serif CJK JP", label: "Noto Serif CJK JP" },
    { value: "IPAMincho", label: "IPA Mincho" },
    { value: "IPAGothic", label: "IPA Gothic" },
];

const MarginInput: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    suffix?: string;
}> = ({ label, value, onChange, suffix = "mm" }) => {
    // Extract numeric value
    const numericValue = value.replace(/[^\d.]/g, '');
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        // Only allow numbers and decimal point
        if (/^\d*\.?\d*$/.test(val)) {
            onChange(val + suffix);
        }
    };

    return (
        <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{label}</Label>
            <div className="flex items-center gap-1">
                <Input
                    type="text"
                    value={numericValue}
                    onChange={handleChange}
                    className="w-20 h-8"
                />
                <span className="text-xs text-muted-foreground w-8">{suffix}</span>
            </div>
        </div>
    );
};

export const PDFSettings: React.FC = () => {
    const [settings, setSettings] = useState<PDFSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [isSavingFooter, setIsSavingFooter] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const { toast } = useToast();

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await settingsApi.getAll();
            setSettings(response.data.pdf);
        } catch (error) {
            console.error("Failed to load settings:", error);
            toast({
                title: "エラー",
                description: "PDF設定の読み込みに失敗しました",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const saveSettings = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await settingsApi.updatePdf({
                page_size: settings.pageSize,
                font_size: settings.fontSize,
                margins: settings.margins,
                fonts: settings.fonts,
            });
            await settingsApi.syncToYml();
            setHasChanges(false);
            toast({
                title: "保存完了",
                description: "PDF設定を保存し、_quarto.ymlを更新しました",
            });
        } catch (error) {
            console.error("Failed to save settings:", error);
            toast({
                title: "エラー",
                description: "設定の保存に失敗しました",
                variant: "destructive",
            });
        } finally {
            setIsSaving(false);
        }
    };

    const saveFooterText = async (footerText: string) => {
        setIsSavingFooter(true);
        try {
            await settingsApi.updateFooterText(footerText);
            await settingsApi.syncToYml();
            toast({
                title: "保存完了",
                description: "フッター文字を保存しました",
            });
        } catch (error) {
            console.error("Failed to save footer text:", error);
            toast({
                title: "エラー",
                description: "フッター文字の保存に失敗しました",
                variant: "destructive",
            });
        } finally {
            setIsSavingFooter(false);
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

    const updateSetting = <K extends keyof PDFSettings>(key: K, value: PDFSettings[K]) => {
        if (!settings) return;
        setSettings({ ...settings, [key]: value });
        setHasChanges(true);
    };

    const updateMargin = (key: keyof PDFSettings['margins'], value: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            margins: { ...settings.margins, [key]: value }
        });
        setHasChanges(true);
    };

    const updateFont = (key: keyof PDFSettings['fonts'], value: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            fonts: { ...settings.fonts, [key]: value }
        });
        setHasChanges(true);
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-muted-foreground">読み込み中...</span>
            </div>
        );
    }

    if (!settings) {
        return <div>設定を読み込めませんでした</div>;
    }

    const selectedPageSize = PAGE_SIZE_OPTIONS.find(p => p.value === settings.pageSize);

    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <FileText className="h-5 w-5" />
                            PDF出力設定
                        </CardTitle>
                        <CardDescription>
                            ページサイズ、余白、フォントなどのPDF出力設定を管理します
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
                        <Button
                            size="sm"
                            onClick={saveSettings}
                            disabled={!hasChanges || isSaving}
                        >
                            {isSaving ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4 mr-1" />
                            )}
                            保存
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Page Size */}
                <div className="space-y-3">
                    <Label>ページサイズ</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Select value={settings.pageSize} onValueChange={(v) => updateSetting("pageSize", v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {PAGE_SIZE_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {selectedPageSize && (
                                <p className="text-xs text-muted-foreground">
                                    {selectedPageSize.dimensions}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Font Size */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <Label>フォントサイズ ({settings.fontSize}pt)</Label>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-xs text-muted-foreground w-8">8pt</span>
                        <Slider
                            value={[settings.fontSize]}
                            onValueChange={([v]) => updateSetting("fontSize", v)}
                            min={8}
                            max={14}
                            step={1}
                            className="flex-1"
                        />
                        <span className="text-xs text-muted-foreground w-8">14pt</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        本文の基本フォントサイズを設定します
                    </p>
                </div>

                <Separator />

                {/* Margins */}
                <div className="space-y-3">
                    <Label>余白</Label>
                    <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                        <MarginInput
                            label="上余白"
                            value={settings.margins.top}
                            onChange={(v) => updateMargin("top", v)}
                        />
                        <MarginInput
                            label="左余白"
                            value={settings.margins.left}
                            onChange={(v) => updateMargin("left", v)}
                        />
                        <MarginInput
                            label="本文高さ"
                            value={settings.margins.height}
                            onChange={(v) => updateMargin("height", v)}
                        />
                    </div>
                    <p className="text-xs text-muted-foreground">
                        ※「本文高さ」は用紙の高さから上下余白を引いた値です
                    </p>
                </div>

                <Separator />

                {/* Fonts */}
                <div className="space-y-4">
                    <Label>フォント</Label>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label className="text-sm">明朝体（本文）</Label>
                            <Select value={settings.fonts.main} onValueChange={(v) => updateFont("main", v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FONT_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label className="text-sm">ゴシック体（見出し）</Label>
                            <Select value={settings.fonts.sans} onValueChange={(v) => updateFont("sans", v)}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {FONT_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>

                {/* Footer Text */}
                <Separator />
                <div className="space-y-3">
                    <Label>フッター文字</Label>
                    <div className="space-y-2">
                        <Input
                            type="text"
                            value={settings.footer_text || ""}
                            onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
                            placeholder="フッターに表示する文字を入力..."
                            className="w-full"
                        />
                        <div className="flex justify-end">
                            <Button
                                size="sm"
                                onClick={() => saveFooterText(settings.footer_text || "")}
                                disabled={isSavingFooter}
                            >
                                {isSavingFooter ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                    <Save className="h-4 w-4 mr-1" />
                                )}
                                フッターを保存
                            </Button>
                        </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        PDFの各ページ下部に表示されるフッター文字を設定します
                    </p>
                </div>

                {/* Preview */}
                <Separator />
                <div className="space-y-2">
                    <Label>プレビュー</Label>
                    <div className="flex items-center justify-center p-8 border border-dashed rounded-lg bg-muted/30">
                        <div
                            className="bg-white shadow-sm border flex items-center justify-center"
                            style={{
                                width: selectedPageSize?.value === "a4" ? "210px" : selectedPageSize?.value === "a5" ? "148px" : "216px",
                                height: selectedPageSize?.value === "a4" ? "297px" : selectedPageSize?.value === "a5" ? "210px" : "279px",
                                position: "relative",
                            }}
                        >
                            <div
                                className="border border-red-200 bg-red-50/50 flex items-center justify-center text-xs text-red-400"
                                style={{
                                    position: "absolute",
                                    top: settings.margins.top.replace("mm", "") + "px",
                                    left: settings.margins.left.replace("mm", "") + "px",
                                    width: `calc(100% - ${Number(settings.margins.left.replace("mm", "")) * 2}px)`,
                                    height: settings.margins.height.replace("mm", "") + "px",
                                }}
                            >
                                本文エリア
                            </div>
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
};
