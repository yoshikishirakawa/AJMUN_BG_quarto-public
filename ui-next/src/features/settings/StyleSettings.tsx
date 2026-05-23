import React, { useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useProjectStore } from '@/store/useProjectStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

// Schema for Style Settings
const styleSchema = z.object({
    primaryColor: z.string(),
    typography: z.object({
        fontSize: z.number().min(8).max(32),
        lineHeight: z.number().min(1.0).max(3.0),
        letterSpacing: z.number().min(-0.1).max(1.0),
        headingScale: z.number().min(1.0).max(3.0),
        fontFamilyMincho: z.string(),
        fontFamilyGothic: z.string(),
    }),
    layout: z.object({
        paperSize: z.string(),
        columns: z.number().min(1).max(2),
        sidebar: z.boolean(),
        margins: z.object({
            top: z.number(),
            bottom: z.number(),
            left: z.number(),
            right: z.number(),
        }),
    }),
    paragraph: z.object({
        indent: z.boolean(),
        indentSize: z.number(),
        spacing: z.number(),
        justify: z.boolean(),
    }),
    visuals: z.object({
        blockquoteStyle: z.string(),
        linkColor: z.string(),
        codeBlockTheme: z.string(),
    }),
    pdf: z.object({
        documentclass: z.string(),
        classoption: z.string(),
        geometry: z.string(),
        mainfont: z.string(),
        sansfont: z.string(),
    }),
    html: z.object({
        toc: z.boolean(),
        numberSections: z.boolean(),
        codeFold: z.boolean(),
        theme: z.string(),
    }),
});

type StyleFormValues = z.infer<typeof styleSchema>;

import { useTranslation } from "@/lib/i18n";

export const StyleSettings: React.FC = () => {
    const { project, updateStyle, fetchProject, isLoading } = useProjectStore();
    const { t } = useTranslation();

    // Fetch project if not loaded
    useEffect(() => {
        if (!project && !isLoading) {
            fetchProject();
        }
    }, [project, isLoading, fetchProject]);

    // Helper to convert array to string
    const listToString = (list: string[]) => list.join(', ');
    const stringToList = (str: string) => str.split(',').map(s => s.trim()).filter(Boolean);

    const form = useForm<StyleFormValues>({
        resolver: zodResolver(styleSchema),
        defaultValues: {
            primaryColor: project?.style?.primaryColor || "#1a73e8",
            typography: {
                fontSize: project?.style?.typography?.fontSize || 16,
                lineHeight: project?.style?.typography?.lineHeight || 1.6,
                letterSpacing: project?.style?.typography?.letterSpacing || 0.05,
                headingScale: project?.style?.typography?.headingScale || 1.2,
                fontFamilyMincho: project?.style?.typography?.fontFamilyMincho || "BIZ UDPMincho",
                fontFamilyGothic: project?.style?.typography?.fontFamilyGothic || "BIZ UDPGothic",
            },
            layout: {
                paperSize: project?.style?.layout?.paperSize || "a4",
                columns: project?.style?.layout?.columns || 1,
                sidebar: project?.style?.layout?.sidebar ?? true,
                margins: {
                    top: project?.style?.layout?.margins?.top ?? 30,
                    bottom: project?.style?.layout?.margins?.bottom ?? 25,
                    left: project?.style?.layout?.margins?.left ?? 25,
                    right: project?.style?.layout?.margins?.right ?? 25,
                },
            },
            paragraph: {
                indent: project?.style?.paragraph?.indent ?? true,
                indentSize: project?.style?.paragraph?.indentSize ?? 1.0,
                spacing: project?.style?.paragraph?.spacing ?? 0.8,
                justify: project?.style?.paragraph?.justify ?? true,
            },
            visuals: {
                blockquoteStyle: project?.style?.visuals?.blockquoteStyle || "left-border",
                linkColor: project?.style?.visuals?.linkColor || "#1a73e8",
                codeBlockTheme: project?.style?.visuals?.codeBlockTheme || "github",
            },
            pdf: {
                documentclass: project?.style?.pdf?.documentclass || "scrreprt",
                classoption: listToString(project?.style?.pdf?.classoption || []),
                geometry: listToString(project?.style?.pdf?.geometry || ["top=30mm", "left=25mm", "height=230mm"]),
                mainfont: project?.style?.pdf?.mainfont || "Harano Aji Mincho",
                sansfont: project?.style?.pdf?.sansfont || "Harano Aji Gothic",
            },
            html: {
                toc: project?.style?.html?.toc ?? true,
                numberSections: project?.style?.html?.numberSections ?? true,
                codeFold: project?.style?.html?.codeFold ?? true,
                theme: project?.style?.html?.theme || "cosmo",
            }
        },
        mode: "onChange",
    });

    // Reset form when project loads or is refreshed after an explicit save.
    useEffect(() => {
        if (project) {
            form.reset({
                primaryColor: project.style?.primaryColor || "#1a73e8",
                typography: project.style?.typography || {},
                layout: project.style?.layout || {},
                paragraph: project.style?.paragraph || {},
                visuals: project.style?.visuals || {},
                pdf: {
                    ...(project.style?.pdf || {}),
                    classoption: listToString(project.style?.pdf?.classoption || []),
                    geometry: listToString(project.style?.pdf?.geometry || []),
                },
                html: project.style?.html || {},
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project?.createdAt, project?.updatedAt, form]);

    const onSubmit = useCallback(async (data: StyleFormValues) => {
        if (!project) return;

        // Transform back to API format
        const apiStyle = {
            ...data,
            pdf: {
                ...data.pdf,
                classoption: stringToList(data.pdf.classoption),
                geometry: stringToList(data.pdf.geometry),
            }
        };

        await updateStyle(apiStyle);
    }, [project, updateStyle]);

    if (isLoading) return <div>{t("loading")}</div>;
    if (!project) return <div>Project not found.</div>;

    return (
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight">{t("style_output")}</h2>
                <div className="flex gap-2"> {/* Added status indicator or something? */}
                    <Button type="submit">{t("save_update_preview")}</Button>
                </div>
            </div>

            <Tabs defaultValue="typography" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                    <TabsTrigger value="typography">{t("typography")}</TabsTrigger>
                    <TabsTrigger value="layout">{t("layout")}</TabsTrigger>
                    <TabsTrigger value="paragraph">{t("paragraph")}</TabsTrigger>
                    <TabsTrigger value="visuals">{t("visuals")}</TabsTrigger>
                    <TabsTrigger value="pdf">{t("pdf_html")}</TabsTrigger>
                </TabsList>

                <TabsContent value="typography" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader><CardTitle>{t("typography")}</CardTitle></CardHeader>
                        <CardContent className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <Label>{t("base_font_size")} ({form.watch("typography.fontSize")}px)</Label>
                                <input type="range" min={8} max={32} step={1} className="w-full accent-primary" {...form.register("typography.fontSize", { valueAsNumber: true })} />

                                <Label>{t("line_height")} ({form.watch("typography.lineHeight")})</Label>
                                <input type="range" min={1.0} max={3.0} step={0.1} className="w-full accent-primary" {...form.register("typography.lineHeight", { valueAsNumber: true })} />

                                <Label>{t("heading_scale")} ({form.watch("typography.headingScale")}x)</Label>
                                <input type="range" min={1.0} max={3.0} step={0.1} className="w-full accent-primary" {...form.register("typography.headingScale", { valueAsNumber: true })} />
                            </div>
                            <div className="space-y-4">
                                <div className="grid gap-2">
                                    <Label>{t("mincho_font")}</Label>
                                    <Input {...form.register("typography.fontFamilyMincho")} placeholder="BIZ UDPMincho" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>{t("gothic_font")}</Label>
                                    <Input {...form.register("typography.fontFamilyGothic")} placeholder="BIZ UDPGothic" />
                                </div>
                                <div className="grid gap-2">
                                    <Label>{t("letter_spacing")} (em)</Label>
                                    <Input type="number" step={0.01} {...form.register("typography.letterSpacing", { valueAsNumber: true })} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="paragraph" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader><CardTitle>{t("paragraph")}</CardTitle></CardHeader>
                        <CardContent className="space-y-6">
                            <div className="flex items-center justify-between">
                                <Label>{t("indent")}</Label>
                                <Switch checked={form.watch("paragraph.indent")} onCheckedChange={(c) => form.setValue("paragraph.indent", c)} />
                            </div>
                            {form.watch("paragraph.indent") && (
                                <div className="grid gap-2">
                                    <Label>{t("indent_size")} (em) - {form.watch("paragraph.indentSize")}</Label>
                                    <input type="range" min={0} max={3} step={0.5} className="w-full accent-primary" {...form.register("paragraph.indentSize", { valueAsNumber: true })} />
                                </div>
                            )}
                            <Separator />
                            <div className="grid gap-2">
                                <Label>{t("paragraph_spacing")} ({form.watch("paragraph.spacing")}rem)</Label>
                                <input type="range" min={0} max={3} step={0.1} className="w-full accent-primary" {...form.register("paragraph.spacing", { valueAsNumber: true })} />
                            </div>
                            <div className="flex items-center justify-between">
                                <Label>{t("justify")}</Label>
                                <Switch checked={form.watch("paragraph.justify")} onCheckedChange={(c) => form.setValue("paragraph.justify", c)} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="layout" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader><CardTitle>{t("layout")}</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label>{t("paper_size")}</Label>
                                    <Select onValueChange={(v) => form.setValue("layout.paperSize", v)} defaultValue={form.watch("layout.paperSize")}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="a4">{t("paper_a4")}</SelectItem>
                                            <SelectItem value="b5">{t("paper_b5")}</SelectItem>
                                            <SelectItem value="letter">{t("paper_letter")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="grid gap-2">
                                    <Label>{t("columns")}</Label>
                                    <Select onValueChange={(v) => form.setValue("layout.columns", Number(v))} defaultValue={String(form.watch("layout.columns"))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="1">{t("col_1")}</SelectItem>
                                            <SelectItem value="2">{t("col_2")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Separator />
                            <Label>{t("margins")}</Label>
                            <div className="grid grid-cols-4 gap-2">
                                <div><Label className="text-xs">{t("top")}</Label><Input type="number" {...form.register("layout.margins.top", { valueAsNumber: true })} /></div>
                                <div><Label className="text-xs">{t("bottom")}</Label><Input type="number" {...form.register("layout.margins.bottom", { valueAsNumber: true })} /></div>
                                <div><Label className="text-xs">{t("left")}</Label><Input type="number" {...form.register("layout.margins.left", { valueAsNumber: true })} /></div>
                                <div><Label className="text-xs">{t("right")}</Label><Input type="number" {...form.register("layout.margins.right", { valueAsNumber: true })} /></div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="visuals" className="space-y-4 pt-4">
                    <Card>
                        <CardHeader><CardTitle>{t("visuals")}</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid gap-2">
                                <Label>{t("primary_theme_color")}</Label>
                                <div className="flex gap-2">
                                    <Input id="primaryColor" {...form.register("primaryColor")} type="color" className="w-12 p-1 h-9" />
                                    <Input {...form.register("primaryColor")} className="flex-1" />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label>{t("blockquote_style")}</Label>
                                <Select onValueChange={(v) => form.setValue("visuals.blockquoteStyle", v)} defaultValue={form.watch("visuals.blockquoteStyle")}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="left-border">{t("left_border")}</SelectItem>
                                        <SelectItem value="framed">{t("framed")}</SelectItem>
                                        <SelectItem value="none">{t("none")}</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="grid gap-2">
                                <Label>{t("link_color")}</Label>
                                <div className="flex gap-2">
                                    <Input type="color" {...form.register("visuals.linkColor")} className="w-12 p-1 h-9" />
                                    <Input {...form.register("visuals.linkColor")} className="flex-1" />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="pdf" className="space-y-4 pt-4">
                    {/* Existing PDF/HTML Settings */}
                    <Card>
                        <CardHeader><CardTitle>{t("backend_html_themes")}</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <Label>{t("html_theme")}</Label>
                            <Select onValueChange={(v) => form.setValue("html.theme", v)} defaultValue={form.watch("html.theme")}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="cosmo">Cosmo</SelectItem>
                                    <SelectItem value="flatly">Flatly</SelectItem>
                                    <SelectItem value="journal">Journal</SelectItem>
                                    <SelectItem value="lumen">Lumen</SelectItem>
                                    <SelectItem value="sandstone">Sandstone</SelectItem>
                                    <SelectItem value="simplex">Simplex</SelectItem>
                                    <SelectItem value="yeti">Yeti</SelectItem>
                                </SelectContent>
                            </Select>
                            <Separator />
                            <Label>{t("pdf_document_class")}</Label>
                            <Select onValueChange={(v) => form.setValue("pdf.documentclass", v)} defaultValue={form.watch("pdf.documentclass")}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="scrreprt">{t("doc_class_scrreprt")}</SelectItem>
                                    <SelectItem value="scrbook">{t("doc_class_scrbook")}</SelectItem>
                                    <SelectItem value="bxjsreport">{t("doc_class_bxjsreport")}</SelectItem>
                                </SelectContent>
                            </Select>
                            <Input {...form.register("pdf.classoption")} placeholder={t("class_options_placeholder")} />
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </form>
    );
};
