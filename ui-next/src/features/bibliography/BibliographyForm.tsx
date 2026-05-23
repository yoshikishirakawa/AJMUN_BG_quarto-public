import React, { useState } from 'react';
import {
    BibliographyEntry,
    BibliographyType,
    BIBLIOGRAPHY_TYPES,
    FIELDS_BY_TYPE
} from './types';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

interface BibliographyFormProps {
    initialEntry?: BibliographyEntry;
    onSave: (entry: BibliographyEntry) => void;
    onCancel: () => void;
}

import { useTranslation } from "@/lib/i18n";

export const BibliographyForm: React.FC<BibliographyFormProps> = ({
    initialEntry,
    onSave,
    onCancel,
}) => {
    const { t } = useTranslation();
    // If Editing, keep ID read-only? No, allow change but maybe warn.
    const [entry, setEntry] = useState<Partial<BibliographyEntry>>(initialEntry || { type: 'book' });
    const [selectedType, setSelectedType] = useState<BibliographyType>(initialEntry?.type || 'book');

    const handleTypeChange = (newType: BibliographyType) => {
        setSelectedType(newType);
        setEntry(prev => ({ ...prev, type: newType }));
    };

    const handleChange = (field: keyof BibliographyEntry, value: string) => {
        setEntry(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = () => {
        if (!entry.id) {
            alert(t("error") + ": " + t("error_id_required"));
            return;
        }
        const allowedFields = FIELDS_BY_TYPE[selectedType];
        const cleanEntry: any = { id: entry.id, type: selectedType };

        allowedFields.forEach(field => {
            if (entry[field] !== undefined && entry[field] !== "") {
                cleanEntry[field] = entry[field];
            }
        });

        onSave(cleanEntry as BibliographyEntry);
    };

    const fieldsToShow = FIELDS_BY_TYPE[selectedType];

    return (
        <Card className="w-full max-w-2xl mx-auto">
            <CardHeader>
                <CardTitle>{initialEntry ? t("edit_reference") : t("add_reference")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>{t("reference_type")}</Label>
                        <Select
                            value={selectedType}
                            onValueChange={(val) => handleTypeChange(val as BibliographyType)}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={t("select_type")} />
                            </SelectTrigger>
                            <SelectContent>
                                {BIBLIOGRAPHY_TYPES.map(tType => (
                                    <SelectItem key={tType.value} value={tType.value}>{tType.label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-2">
                        <Label>{t("citation_key")}</Label>
                        <Input
                            value={entry.id || ''}
                            onChange={e => handleChange('id', e.target.value)}
                            placeholder={t("citation_key_placeholder")}
                        />
                    </div>
                </div>

                <div className="space-y-4 border-t pt-4">
                    {fieldsToShow.includes('title') && (
                        <div className="space-y-2">
                            <Label>{t("title")}</Label>
                            <Input
                                value={entry.title || ''}
                                onChange={e => handleChange('title', e.target.value)}
                            />
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        {fieldsToShow.includes('author') && (
                            <div className="space-y-2">
                                <Label>{t("author")}</Label>
                                <Input
                                    value={entry.author || ''}
                                    onChange={e => handleChange('author', e.target.value)}
                                    placeholder={t("author_placeholder")}
                                />
                            </div>
                        )}
                        {fieldsToShow.includes('year') && (
                            <div className="space-y-2">
                                <Label>{t("year")}</Label>
                                <Input
                                    value={entry.year?.toString() || ''}
                                    onChange={e => handleChange('year', e.target.value)}
                                />
                            </div>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {fieldsToShow.map(field => {
                            if (['id', 'type', 'title', 'author', 'year', 'note', 'url'].includes(field)) return null;
                            return (
                                <div key={field} className="space-y-2">
                                    <Label className="capitalize">{field}</Label>
                                    <Input
                                        value={entry[field]?.toString() || ''}
                                        onChange={e => handleChange(field, e.target.value)}
                                    />
                                </div>
                            );
                        })}
                    </div>

                    {fieldsToShow.includes('url') && (
                        <div className="space-y-2">
                            <Label>{t("url")}</Label>
                            <Input
                                value={entry.url || ''}
                                onChange={e => handleChange('url', e.target.value)}
                            />
                        </div>
                    )}
                    {fieldsToShow.includes('note') && (
                        <div className="space-y-2">
                            <Label>{t("note")}</Label>
                            <Textarea
                                value={entry.note || ''}
                                onChange={e => handleChange('note', e.target.value)}
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4">
                    <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
                    <Button onClick={handleSave}>{t("save_reference")}</Button>
                </div>
            </CardContent>
        </Card>
    );
};
