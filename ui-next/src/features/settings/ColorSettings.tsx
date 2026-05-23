import React, { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { settingsApi, ColorPreset, ColorsSettings } from "@/lib/api";
import { Loader2, Palette, Save, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Color category definitions for organization
const COLOR_CATEGORIES = {
    basic: {
        name: "基本色",
        colors: ["titleblue", "headerblue", "linkblue"]
    },
    law: {
        name: "国際法引用",
        colors: ["lawheaderbg", "lawheadertext", "lawbodybg", "lawborder"]
    },
    rail: {
        name: "レールナビ",
        colors: ["railactive", "railinactive", "railcursor"]
    },
    highlight: {
        name: "ハイライト",
        colors: ["hlyellow", "hlgreen", "hlred", "hlblue", "hlpurple", "blockquotebg"]
    }
};

// Default color presets (same as in settings.json)
const DEFAULT_PRESETS: Record<string, ColorPreset> = {
    default: {
        name: "デフォルト（青）",
        colors: {
            titleblue: "#0d47a1",
            headerblue: "#0097a7",
            linkblue: "#1a73e8",
            lawheaderbg: "#3d5a80",
            lawheadertext: "#ffffff",
            lawbodybg: "#e8f0f8",
            lawborder: "#b8c8d8",
            railactive: "#2C5070",
            railinactive: "#E5E5E5",
            railcursor: "#C04020",
            hlyellow: "#fff2cc",
            hlgreen: "#d9ead3",
            hlred: "#fce8e6",
            hlblue: "#e8f0fe",
            hlpurple: "#f3e8fd",
            blockquotebg: "#f0f8ff",
        }
    },
    blue: {
        name: "ブルー",
        colors: {
            titleblue: "#1565c0",
            headerblue: "#1976d2",
            linkblue: "#2196f3",
            lawheaderbg: "#0d47a1",
            lawheadertext: "#ffffff",
            lawbodybg: "#e3f2fd",
            lawborder: "#90caf9",
            railactive: "#1565c0",
            railinactive: "#e3f2fd",
            railcursor: "#ff6f00",
            hlyellow: "#fff9c4",
            hlgreen: "#c8e6c9",
            hlred: "#ffcdd2",
            hlblue: "#bbdefb",
            hlpurple: "#e1bee7",
            blockquotebg: "#e3f2fd",
        }
    },
    green: {
        name: "グリーン",
        colors: {
            titleblue: "#2e7d32",
            headerblue: "#388e3c",
            linkblue: "#4caf50",
            lawheaderbg: "#1b5e20",
            lawheadertext: "#ffffff",
            lawbodybg: "#e8f5e9",
            lawborder: "#a5d6a7",
            railactive: "#2e7d32",
            railinactive: "#e8f5e9",
            railcursor: "#ff6f00",
            hlyellow: "#fff9c4",
            hlgreen: "#c8e6c9",
            hlred: "#ffcdd2",
            hlblue: "#bbdefb",
            hlpurple: "#e1bee7",
            blockquotebg: "#e8f5e9",
        }
    },
    warm: {
        name: "ウォーム",
        colors: {
            titleblue: "#bf360c",
            headerblue: "#e65100",
            linkblue: "#ff6f00",
            lawheaderbg: "#bf360c",
            lawheadertext: "#ffffff",
            lawbodybg: "#fbe9e7",
            lawborder: "#ffcc80",
            railactive: "#bf360c",
            railinactive: "#fbe9e7",
            railcursor: "#1a237e",
            hlyellow: "#fff9c4",
            hlgreen: "#c8e6c9",
            hlred: "#ffcdd2",
            hlblue: "#bbdefb",
            hlpurple: "#e1bee7",
            blockquotebg: "#fbe9e7",
        }
    }
};

interface ColorInputProps {
    label: string;
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}

const ColorInput: React.FC<ColorInputProps> = ({ label, value, onChange, disabled }) => {
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <div className="flex gap-1 mt-1">
                    <Input
                        type="color"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        className="w-10 h-8 p-0.5 cursor-pointer"
                    />
                    <Input
                        type="text"
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        disabled={disabled}
                        className="flex-1 font-mono text-xs"
                        placeholder="#000000"
                    />
                </div>
            </div>
        </div>
    );
};

export const ColorSettings: React.FC = () => {
    const [settings, setSettings] = useState<ColorsSettings | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const { toast } = useToast();

    const loadSettings = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await settingsApi.getAll();
            setSettings(response.data.pdf.colors);
        } catch (error) {
            console.error("Failed to load settings:", error);
            toast({
                title: "エラー",
                description: "設定の読み込みに失敗しました",
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    }, [toast]);

    // Load settings on mount
    useEffect(() => {
        loadSettings();
    }, [loadSettings]);

    const saveSettings = async () => {
        if (!settings) return;
        setIsSaving(true);
        try {
            await settingsApi.updateColors(settings);
            await settingsApi.syncToYml();
            setHasChanges(false);
            toast({
                title: "保存完了",
                description: "カラー設定を保存し、_quarto.ymlを更新しました",
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

    const handlePresetChange = (presetName: string) => {
        if (!settings) return;
        const preset = settings.presets?.[presetName] || DEFAULT_PRESETS[presetName];
        if (preset) {
            setSettings({
                ...settings,
                preset: presetName,
                custom: { ...preset.colors }
            });
            setHasChanges(true);
        }
    };

    const handleColorChange = (colorKey: string, value: string) => {
        if (!settings) return;
        setSettings({
            ...settings,
            custom: {
                ...settings.custom,
                [colorKey]: value
            }
        });
        setHasChanges(true);
    };

    const resetToPreset = () => {
        if (!settings) return;
        const preset = settings.presets?.[settings.preset] || DEFAULT_PRESETS[settings.preset];
        if (preset) {
            setSettings({
                ...settings,
                custom: { ...preset.colors }
            });
            setHasChanges(true);
        }
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

    const isCustom = settings.preset === "custom";

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Palette className="h-5 w-5" />
                                カラー設定
                            </CardTitle>
                            <CardDescription>
                                PDFの配色をプリセットから選択するか、カスタムカラーを設定します
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={resetToPreset}
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
                    {/* Preset Selection */}
                    <div className="space-y-2">
                        <Label>カラープリセット</Label>
                        <Select value={settings.preset} onValueChange={handlePresetChange}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(DEFAULT_PRESETS).map(([key, preset]) => (
                                    <SelectItem key={key} value={key}>
                                        {preset.name}
                                    </SelectItem>
                                ))}
                                <SelectItem value="custom">
                                    カスタム...
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        {!isCustom && (
                            <p className="text-xs text-muted-foreground">
                                選択したプリセットの色が適用されます。カスタマイズするには「カスタム」を選択してください
                            </p>
                        )}
                    </div>

                    <Separator />

                    {/* Color Categories */}
                    <Tabs defaultValue="basic" className="w-full">
                        <TabsList className="grid w-full grid-cols-4">
                            {Object.entries(COLOR_CATEGORIES).map(([key, cat]) => (
                                <TabsTrigger key={key} value={key}>
                                    {cat.name}
                                </TabsTrigger>
                            ))}
                        </TabsList>

                        {Object.entries(COLOR_CATEGORIES).map(([categoryKey, category]) => (
                            <TabsContent key={categoryKey} value={categoryKey} className="space-y-4 pt-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {category.colors.map((colorKey) => {
                                        const labelMap: Record<string, string> = {
                                            titleblue: "タイトル色",
                                            headerblue: "ヘッダー色",
                                            linkblue: "リンク色",
                                            lawheaderbg: "法引用ヘッダー背景",
                                            lawheadertext: "法引用ヘッダー文字",
                                            lawbodybg: "法引用本文背景",
                                            lawborder: "法引用ボーダー",
                                            railactive: "レールアクティブ",
                                            railinactive: "レール非アクティブ",
                                            railcursor: "レールカーソル",
                                            hlyellow: "ハイライト黄",
                                            hlgreen: "ハイライト緑",
                                            hlred: "ハイライト赤",
                                            hlblue: "ハイライト青",
                                            hlpurple: "ハイライト紫",
                                            blockquotebg: "引用背景",
                                        };
                                        return (
                                            <ColorInput
                                                key={colorKey}
                                                label={labelMap[colorKey] || colorKey}
                                                value={(settings.custom?.[colorKey as keyof typeof settings.custom] as string) || "#000000"}
                                                onChange={(value) => handleColorChange(colorKey, value)}
                                            />
                                        );
                                    })}
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>

                    {/* Preview Colors */}
                    <Separator />
                    <div className="space-y-2">
                        <Label>プレビュー</Label>
                        <div className="flex flex-wrap gap-2">
                            {Object.entries(COLOR_CATEGORIES).map(([catKey, cat]) => (
                                <div key={catKey} className="flex gap-1">
                                    {cat.colors.slice(0, 3).map((colorKey) => (
                                        <div
                                            key={colorKey}
                                            className="w-8 h-8 rounded border border-muted"
                                            style={{
                                                backgroundColor: (settings.custom?.[colorKey as keyof typeof settings.custom] as string) || "#000"
                                            }}
                                            title={colorKey}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};
