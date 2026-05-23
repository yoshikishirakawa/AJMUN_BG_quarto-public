import React, { useState, useEffect, useRef } from 'react';
import { EditorView } from '@codemirror/view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Trash2,
    CornerUpLeft,
    CornerUpRight,
    Split,
    Check
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TableCell {
    content: string;
    rowSpan?: number;
    colSpan?: number;
    isHeader?: boolean;
    align?: 'left' | 'center' | 'right';
}

interface TableData {
    rows: TableCell[][];
    caption?: string;
    align?: 'left' | 'center' | 'right';
}

interface TableEditorProps {
    isOpen: boolean;
    onClose: () => void;
    onInsert: (markdown: string) => void;
    viewRef?: React.RefObject<EditorView | null>;
}

// Parse Markdown table to TableData
const parseMarkdownTable = (markdown: string): TableData | null => {
    const lines = markdown.trim().split('\n').filter(line => line.trim());
    if (lines.length < 2) return null;

    // Check if it's a table (has separator line)
    const separatorIndex = lines.findIndex(line => /^[\|\s\:\-]+$/.test(line));
    if (separatorIndex === -1) return null;

    const rows: TableCell[][] = [];
    const headerLine = lines[0];

    // Parse a table line
    const parseLine = (line: string, isHeader = false): TableCell[] => {
        // Remove leading/trailing pipes and split
        const cleaned = line.replace(/^\||\|$/g, '');
        const cells = cleaned.split('|').map(c => c.trim());
        return cells.map(content => ({
            content,
            isHeader
        }));
    };

    // Parse header
    const headerCells = parseLine(headerLine, true);
    rows.push(headerCells);

    // Parse body rows (skip separator)
    for (let i = 1; i < lines.length; i++) {
        if (i === separatorIndex) continue;
        rows.push(parseLine(lines[i]));
    }

    return { rows };
};

// Generate Markdown from TableData
const generateMarkdown = (table: TableData): string => {
    if (table.rows.length === 0) return '';

    const maxCols = Math.max(...table.rows.map(row => row.length));

    // Pad rows to equal length
    const paddedRows = table.rows.map(row => {
        while (row.length < maxCols) {
            row.push({ content: '' });
        }
        return row;
    });

    // Generate separator
    const separator = '|' + paddedRows[0].map(() => '---').join('|') + '|';

    // Generate rows
    const markdown = paddedRows.map((row) => {
        const cells = row.map(cell => cell.content || '');
        return `|${cells.join('|')}|`;
    });

    return [markdown[0], separator, ...markdown.slice(1)].join('\n');
};

export const TableEditor: React.FC<TableEditorProps> = ({
    isOpen,
    onClose,
    onInsert,
    viewRef
}) => {
    const [table, setTable] = useState<TableData>({
        rows: [
            [{ content: 'ヘッダー1', isHeader: true }, { content: 'ヘッダー2', isHeader: true }, { content: 'ヘッダー3', isHeader: true }],
            [{ content: '' }, { content: '' }, { content: '' }],
            [{ content: '' }, { content: '' }, { content: '' }],
        ]
    });
    const [selectedCell, setSelectedCell] = useState<{ row: number; col: number } | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState('');
    const editInputRef = useRef<HTMLInputElement>(null);

    // Initialize from existing table if provided
    useEffect(() => {
        if (viewRef?.current && isOpen) {
            const view = viewRef.current;
            const selection = view.state.selection.main;

            // Check if cursor is within a table
            const line = view.state.doc.lineAt(selection.from);

            // Look for table boundaries
            let startLine = line.number - 1;
            let endLine = line.number - 1;
            const lines = view.state.doc.toString().split('\n');

            // Find table start
            while (startLine > 0 && lines[startLine - 1].includes('|')) {
                startLine--;
            }

            // Find table end
            while (endLine < lines.length - 1 && lines[endLine + 1].includes('|')) {
                endLine++;
            }

            const tableText = lines.slice(startLine, endLine + 1).join('\n');
            const parsedTable = parseMarkdownTable(tableText);

            if (parsedTable) {
                setTable(parsedTable);
            }
        }
    }, [isOpen, viewRef]);

    // Focus edit input when editing starts
    useEffect(() => {
        if (isEditing && editInputRef.current) {
            editInputRef.current.focus();
            editInputRef.current.select();
        }
    }, [isEditing]);

    const handleCellClick = (rowIndex: number, colIndex: number) => {
        setSelectedCell({ row: rowIndex, col: colIndex });
        setEditValue(table.rows[rowIndex][colIndex]?.content || '');
        setIsEditing(true);
    };

    const handleCellChange = (value: string) => {
        if (!selectedCell) return;

        setTable(prev => {
            const newRows = prev.rows.map((row, rIdx) =>
                rIdx === selectedCell.row
                    ? row.map((cell, cIdx) =>
                        cIdx === selectedCell.col
                            ? { ...cell, content: value }
                            : cell
                    )
                    : row
            );
            return { ...prev, rows: newRows };
        });
    };

    const addRow = (position: 'top' | 'bottom' | 'above' | 'below') => {
        setTable(prev => {
            const newRows = [...prev.rows];
            const emptyRow = Array.from({ length: prev.rows[0]?.length || 3 }, () => ({ content: '' }));

            if (position === 'top') {
                newRows.unshift(emptyRow);
            } else if (position === 'bottom') {
                newRows.push(emptyRow);
            } else if (selectedCell) {
                if (position === 'above') {
                    newRows.splice(selectedCell.row, 0, emptyRow);
                } else {
                    newRows.splice(selectedCell.row + 1, 0, emptyRow);
                }
            }

            return { ...prev, rows: newRows };
        });
    };

    const addColumn = (position: 'left' | 'right') => {
        setTable(prev => {
            const newRows = prev.rows.map(row => {
                const newRow = [...row];
                const emptyCell = { content: '' };

                if (selectedCell) {
                    if (position === 'left') {
                        newRow.splice(selectedCell.col, 0, emptyCell);
                    } else {
                        newRow.splice(selectedCell.col + 1, 0, emptyCell);
                    }
                } else {
                    newRow.push(emptyCell);
                }

                return newRow;
            });

            return { ...prev, rows: newRows };
        });
    };

    const deleteRow = () => {
        if (!selectedCell || table.rows.length <= 1) return;

        setTable(prev => ({
            ...prev,
            rows: prev.rows.filter((_, idx) => idx !== selectedCell.row)
        }));
        setSelectedCell(null);
    };

    const deleteColumn = () => {
        if (!selectedCell || table.rows[0].length <= 1) return;

        setTable(prev => ({
            ...prev,
            rows: prev.rows.map(row => row.filter((_, idx) => idx !== selectedCell.col))
        }));
        setSelectedCell(null);
    };

    const toggleHeader = () => {
        if (!selectedCell) return;

        setTable(prev => {
            const newRows = prev.rows.map((row, rIdx) =>
                rIdx === selectedCell.row
                    ? row.map((cell, cIdx) =>
                        cIdx === selectedCell.col
                            ? { ...cell, isHeader: !cell.isHeader }
                            : cell
                    )
                    : row
            );
            return { ...prev, rows: newRows };
        });
    };

    const handleInsert = () => {
        const markdown = generateMarkdown(table);
        onInsert(markdown);
        handleClose();
    };

    const handleClose = () => {
        setIsEditing(false);
        setSelectedCell(null);
        onClose();
    };

    const maxCols = table.rows.length > 0 ? table.rows[0].length : 3;

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle>テーブルエディタ</DialogTitle>
                    <DialogDescription>
                        テーブルを視覚的に編集できます。クリックしてセルを編集、ドラッグで選択できます。
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-auto">
                    {/* Toolbar */}
                    <div className="flex items-center gap-2 mb-4 p-2 bg-muted rounded-lg">
                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addRow('top')}
                                title="上に行を追加"
                            >
                                <CornerUpLeft className="h-4 w-4" />
                                上に追加
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addRow('bottom')}
                                title="下に行を追加"
                            >
                                <CornerUpRight className="h-4 w-4" />
                                下に追加
                            </Button>
                        </div>

                        <div className="w-px h-6 bg-border" />

                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addColumn('left')}
                                disabled={!selectedCell}
                                title="左に列を追加"
                            >
                                左に追加
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => addColumn('right')}
                                disabled={!selectedCell}
                                title="右に列を追加"
                            >
                                右に追加
                            </Button>
                        </div>

                        <div className="w-px h-6 bg-border" />

                        <div className="flex items-center gap-1">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={deleteRow}
                                disabled={!selectedCell}
                                title="行を削除"
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                行削除
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={deleteColumn}
                                disabled={!selectedCell}
                                title="列を削除"
                            >
                                <Trash2 className="h-4 w-4 mr-1" />
                                列削除
                            </Button>
                        </div>

                        <div className="w-px h-6 bg-border" />

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={toggleHeader}
                            disabled={!selectedCell}
                            title="ヘッダー切り替え"
                        >
                            <Split className="h-4 w-4 mr-1" />
                            ヘッダー
                        </Button>
                    </div>

                    {/* Table */}
                    <div className="border rounded-lg overflow-hidden">
                        <table className="w-full border-collapse">
                            <tbody>
                                {table.rows.map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                        {Array.from({ length: maxCols }).map((_, colIndex) => {
                                            const cell = row[colIndex];
                                            const isSelected = selectedCell?.row === rowIndex && selectedCell?.col === colIndex;

                                            return (
                                                <td
                                                    key={colIndex}
                                                    onClick={() => handleCellClick(rowIndex, colIndex)}
                                                    className={cn(
                                                        "border min-w-[100px] h-10 p-1 relative cursor-pointer transition-colors",
                                                        cell?.isHeader && "bg-secondary/50 font-medium",
                                                        isSelected && "ring-2 ring-primary ring-inset",
                                                        !isSelected && "hover:bg-muted/50"
                                                    )}
                                                >
                                                    {isEditing && isSelected ? (
                                                        <Input
                                                            ref={editInputRef}
                                                            value={editValue}
                                                            onChange={(e) => {
                                                                setEditValue(e.target.value);
                                                                handleCellChange(e.target.value);
                                                            }}
                                                            onBlur={() => setIsEditing(false)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') {
                                                                    setIsEditing(false);
                                                                    // Move to next cell
                                                                    if (colIndex < maxCols - 1) {
                                                                        handleCellClick(rowIndex, colIndex + 1);
                                                                    } else if (rowIndex < table.rows.length - 1) {
                                                                        handleCellClick(rowIndex + 1, 0);
                                                                    }
                                                                } else if (e.key === 'Tab') {
                                                                    e.preventDefault();
                                                                    setIsEditing(false);
                                                                    if (colIndex < maxCols - 1) {
                                                                        handleCellClick(rowIndex, colIndex + 1);
                                                                    }
                                                                } else if (e.key === 'Escape') {
                                                                    setIsEditing(false);
                                                                }
                                                            }}
                                                            className="h-8 text-sm"
                                                        />
                                                    ) : (
                                                        <span className="text-sm block truncate">
                                                            {cell?.content || <span className="text-muted-foreground/30">空</span>}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Caption input */}
                    <div className="mt-4 space-y-2">
                        <Label htmlFor="caption">キャプション（オプション）</Label>
                        <Input
                            id="caption"
                            value={table.caption || ''}
                            onChange={(e) => setTable(prev => ({ ...prev, caption: e.target.value }))}
                            placeholder="Table: キャプション"
                            className="text-sm"
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={handleClose}>
                        キャンセル
                    </Button>
                    <Button onClick={handleInsert}>
                        <Check className="h-4 w-4 mr-2" />
                        挿入
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
