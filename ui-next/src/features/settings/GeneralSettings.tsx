import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Slider } from "@/components/ui/slider";
import { useUIStore } from "@/store/useUIStore";
import { useTranslation } from "@/lib/i18n";

export const GeneralSettings: React.FC = () => {
    const { t } = useTranslation();
    const { language, setLanguage, editorFontSize, setEditorFontSize } = useUIStore();

    return (
        <Card>
            <CardHeader>
                <CardTitle>{t("general_settings")}</CardTitle>
                <CardDescription>{t("general_settings_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
                <div className="space-y-4">
                    <Label className="text-base">{t("language_select_label")}</Label>
                    <RadioGroup
                        defaultValue={language}
                        onValueChange={(val) => setLanguage(val as 'en' | 'ja')}
                        className="flex flex-col space-y-2"
                    >
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="en" id="lang-en" />
                            <Label htmlFor="lang-en" className="font-normal cursor-pointer">
                                English
                            </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <RadioGroupItem value="ja" id="lang-ja" />
                            <Label htmlFor="lang-ja" className="font-normal cursor-pointer">
                                日本語 (Japanese)
                            </Label>
                        </div>
                    </RadioGroup>
                    <p className="text-sm text-muted-foreground">
                        {t("language_select_help")}
                    </p>
                </div>

                <div className="space-y-4">
                    <Label className="text-base">エディタ・プレビューの文字サイズ</Label>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-muted-foreground w-12">小</span>
                        <Slider
                            value={[editorFontSize]}
                            onValueChange={(values) => setEditorFontSize(values[0])}
                            min={10}
                            max={24}
                            step={1}
                            className="flex-1"
                        />
                        <span className="text-sm text-muted-foreground w-12">大</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <span className="text-sm font-mono bg-muted px-2 py-1 rounded">
                            {editorFontSize}px
                        </span>
                        <p className="text-sm text-muted-foreground">
                            エディタとプレビューの基本文字サイズを設定します
                        </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        ※ 出力設定（PDF/HTML）の文字サイズには影響しません。プレビューでは出力設定の相対的なサイズ関係（見出しの比率など）は維持されます。
                    </p>
                </div>
            </CardContent>
        </Card>
    );
};
