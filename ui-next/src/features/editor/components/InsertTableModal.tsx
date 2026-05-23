import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';

interface InsertTableModalProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (markdown: string) => void;
}

export const InsertTableModal: React.FC<InsertTableModalProps> = ({ isOpen, onClose, onInsert }) => {
    const [rows, setRows] = useState(3);
    const [cols, setCols] = useState(3);
    const [headerRows, setHeaderRows] = useState(1);
    const [headerCols, setHeaderCols] = useState(0);
    const [colWidths, setColWidths] = useState(''); // e.g., "1,3"
    const [vlines, setVlines] = useState(true);
    const [hlines, setHlines] = useState(true);
    const [booktabs, setBooktabs] = useState(true);

    const generateMarkdown = () => {
        let md = '';

        // Open Div
        const attrs = [];
        if (colWidths) attrs.push(`cols="${colWidths}"`);
        if (headerCols > 0) attrs.push(`header-cols="${headerCols}"`);
        if (headerRows !== 1) attrs.push(`header-rows="${headerRows}"`);
        if (!vlines) attrs.push('vlines="false"');
        if (!hlines) attrs.push('hlines="false"');
        if (!booktabs) attrs.push('booktabs="false"');

        const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
        md += `::: {.colmin${attrStr}}\n`;

        // Header
        const headerCells = Array(cols).fill('Header');
        md += `| ${headerCells.join(' | ')} |\n`;

        // Separator
        const separatorCells = Array(cols).fill('---');
        md += `| ${separatorCells.join(' | ')} |\n`;

        // Body
        // We subtract 1 because we manually added the first header row above.
        // If headerRows > 1, the user has to fill them in the body area for markdown table syntax standard.
        // Pandoc usually takes the first row as header.
        // Our 'header-rows' attribute tells the filter to move more rows to header.
        // So we just generate `rows` number of rows.
        for (let i = 0; i < rows; i++) {
            const bodyCells = Array(cols).fill('Data');
            md += `| ${bodyCells.join(' | ')} |\n`;
        }

        md += ':::\n';
        return md;
    };

    const handleInsert = () => {
        onInsert(generateMarkdown());
        onClose();
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Insert Custom Table</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="rows">Rows</Label>
                            <Input id="rows" type="number" value={rows} onChange={(e) => setRows(Number(e.target.value))} min={1} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="cols">Columns</Label>
                            <Input id="cols" type="number" value={cols} onChange={(e) => setCols(Number(e.target.value))} min={1} />
                        </div>
                    </div>

                    <div className="grid gap-2">
                        <Label htmlFor="colWidths">Column Widths (comma separated ratios, e.g. "1,3")</Label>
                        <Input id="colWidths" value={colWidths} onChange={(e) => setColWidths(e.target.value)} placeholder="e.g. 1, 3" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                            <Label htmlFor="headerRows">Header Rows</Label>
                            <Input id="headerRows" type="number" value={headerRows} onChange={(e) => setHeaderRows(Number(e.target.value))} min={0} />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="headerCols">Header columns (Bold from left)</Label>
                            <Input id="headerCols" type="number" value={headerCols} onChange={(e) => setHeaderCols(Number(e.target.value))} min={0} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="flex items-center space-x-2">
                            <Checkbox id="vlines" checked={vlines} onChange={(e) => setVlines(e.target.checked)} />
                            <Label htmlFor="vlines">Vertical Lines</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="hlines" checked={hlines} onChange={(e) => setHlines(e.target.checked)} />
                            <Label htmlFor="hlines">Horizontal Lines</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                            <Checkbox id="booktabs" checked={booktabs} onChange={(e) => setBooktabs(e.target.checked)} />
                            <Label htmlFor="booktabs">PDF Booktabs</Label>
                        </div>
                    </div>

                    <div className="gap-2">
                        <Label>Preview Syntax</Label>
                        <Textarea className="font-mono text-xs h-24" readOnly value={generateMarkdown()} />
                    </div>
                </div>
                <DialogFooter>
                    <Button type="submit" onClick={handleInsert}>Insert Table</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
