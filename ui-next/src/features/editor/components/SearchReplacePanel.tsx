import React, { useState, useCallback, useEffect } from 'react';
import { EditorView } from '@codemirror/view';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Search, Replace, X, ChevronUp, ChevronDown,
    Code, Type
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchReplacePanelProps {
    viewRef: React.RefObject<EditorView | null>;
    onClose?: () => void;
    className?: string;
}

interface SearchResult {
    from: number;
    to: number;
    text: string;
    line: number;
    col: number;
}

// Search history management
const searchHistory = {
    searches: new Set<string>(),
    replacements: new Set<string>(),
    maxHistory: 20,

    addSearch(term: string) {
        if (term && term.length > 0) {
            this.searches.add(term);
            if (this.searches.size > this.maxHistory) {
                const first = this.searches.values().next().value;
                if (first) this.searches.delete(first);
            }
        }
    },

    addReplacement(term: string) {
        if (term && term.length > 0) {
            this.replacements.add(term);
            if (this.replacements.size > this.maxHistory) {
                const first = this.replacements.values().next().value;
                if (first) this.replacements.delete(first);
            }
        }
    },

    getSearches(): string[] {
        return Array.from(this.searches).reverse();
    },

    getReplacements(): string[] {
        return Array.from(this.replacements).reverse();
    }
};

export const SearchReplacePanel: React.FC<SearchReplacePanelProps> = ({
    viewRef,
    onClose,
    className
}) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [replaceTerm, setReplaceTerm] = useState('');
    const [useRegex, setUseRegex] = useState(false);
    const [caseSensitive, setCaseSensitive] = useState(false);
    const [wholeWord, setWholeWord] = useState(false);
    const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
    const [totalMatches, setTotalMatches] = useState(0);
    const [matches, setMatches] = useState<SearchResult[]>([]);
    const [isReplaceMode, setIsReplaceMode] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const view = viewRef?.current;

    // Calculate matches
    useEffect(() => {
        if (!view || !searchTerm) {
            setMatches([]);
            setTotalMatches(0);
            setCurrentMatchIndex(0);
            setErrorMsg(null);
            return;
        }

        try {
            const doc = view.state.doc;
            const text = doc.toString();
            const foundMatches: SearchResult[] = [];

            let searchRegex: RegExp;
            try {
                const flags = caseSensitive ? 'g' : 'gi';
                const pattern = useRegex ? searchTerm : searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

                if (wholeWord) {
                    searchRegex = new RegExp(`\\b${pattern}\\b`, flags);
                } else {
                    searchRegex = new RegExp(pattern, flags);
                }
            } catch (e) {
                setErrorMsg(e instanceof Error ? e.message : 'Invalid regex');
                return;
            }

            setErrorMsg(null);

            let match;
            while ((match = searchRegex.exec(text)) !== null) {
                const line = doc.lineAt(match.index);
                foundMatches.push({
                    from: match.index,
                    to: match.index + match[0].length,
                    text: match[0],
                    line: line.number,
                    col: match.index - line.from + 1
                });

                // Prevent infinite loop for zero-length matches
                if (match[0].length === 0) {
                    searchRegex.lastIndex++;
                }
            }

            setMatches(foundMatches);
            setTotalMatches(foundMatches.length);
            setCurrentMatchIndex(foundMatches.length > 0 ? 0 : -1);
        } catch (e) {
            console.error('Search error:', e);
            setErrorMsg('Search error occurred');
        }
    }, [view, searchTerm, caseSensitive, wholeWord, useRegex]);

    // Navigate to specific match
    const goToMatch = useCallback((index: number) => {
        if (!view || matches.length === 0) return;

        const safeIndex = Math.max(0, Math.min(index, matches.length - 1));
        const match = matches[safeIndex];

        view.dispatch({
            selection: { anchor: match.from, head: match.to },
            scrollIntoView: true
        });

        setCurrentMatchIndex(safeIndex);
    }, [view, matches]);

    // Navigate to next match
    const goToNext = useCallback(() => {
        const nextIndex = currentMatchIndex + 1 >= matches.length ? 0 : currentMatchIndex + 1;
        goToMatch(nextIndex);
    }, [currentMatchIndex, matches.length, goToMatch]);

    // Navigate to previous match
    const goToPrev = useCallback(() => {
        const prevIndex = currentMatchIndex - 1 < 0 ? matches.length - 1 : currentMatchIndex - 1;
        goToMatch(prevIndex);
    }, [currentMatchIndex, matches.length, goToMatch]);

    // Replace current match
    const replaceCurrent = useCallback(() => {
        if (!view || currentMatchIndex < 0 || matches.length === 0) return;

        const match = matches[currentMatchIndex];
        let replacement = replaceTerm;

        // Handle regex backreferences
        if (useRegex) {
            const selectedText = view.state.sliceDoc(match.from, match.to);
            try {
                replacement = selectedText.replace(new RegExp(searchTerm, caseSensitive ? '' : 'i'), replaceTerm);
            } catch (e) {
                console.error('Replace error:', e);
                return;
            }
        }

        view.dispatch({
            changes: {
                from: match.from,
                to: match.to,
                insert: replacement
            }
        });

        searchHistory.addReplacement(replaceTerm);

        // Move to next match after replacement
        if (matches.length > 1) {
            goToNext();
        }
    }, [view, currentMatchIndex, matches, replaceTerm, searchTerm, useRegex, caseSensitive, goToNext]);

    // Replace all matches
    const replaceAll = useCallback(() => {
        if (!view || matches.length === 0) return;

        const changes: { from: number; to: number; insert: string }[] = [];

        // Process matches in reverse order to maintain positions
        for (let i = matches.length - 1; i >= 0; i--) {
            const match = matches[i];
            let replacement = replaceTerm;

            if (useRegex) {
                const selectedText = view.state.sliceDoc(match.from, match.to);
                try {
                    replacement = selectedText.replace(new RegExp(searchTerm, caseSensitive ? '' : 'i'), replaceTerm);
                } catch (e) {
                    console.error('Replace all error:', e);
                    continue;
                }
            }

            changes.push({ from: match.from, to: match.to, insert: replacement });
        }

        view.dispatch({ changes });

        searchHistory.addReplacement(replaceTerm);
        setMatches([]);
        setTotalMatches(0);
        setCurrentMatchIndex(-1);
    }, [view, matches, replaceTerm, searchTerm, useRegex, caseSensitive]);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                goToNext();
            } else if (e.key === 'Enter' && e.shiftKey) {
                e.preventDefault();
                goToPrev();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [goToNext, goToPrev]);

    // Add search to history when searchTerm changes
    useEffect(() => {
        if (searchTerm) {
            searchHistory.addSearch(searchTerm);
        }
    }, [searchTerm]);

    return (
        <div className={cn(
            "bg-background border rounded-lg shadow-lg p-3 space-y-3",
            className
        )}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">検索・置換</span>
                </div>
                <div className="flex items-center gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setIsReplaceMode(!isReplaceMode)}
                        title={isReplaceMode ? "検索モード" : "置換モード"}
                    >
                        {isReplaceMode ? <Search className="h-3.5 w-3.5" /> : <Replace className="h-3.5 w-3.5" />}
                    </Button>
                    {onClose && (
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={onClose}
                        >
                            <X className="h-3.5 w-3.5" />
                        </Button>
                    )}
                </div>
            </div>

            {/* Search Input */}
            <div className="space-y-2">
                <div className="relative">
                    <Input
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="検索..."
                        className={cn(
                            "pr-20",
                            errorMsg && "border-destructive focus:border-destructive"
                        )}
                        autoFocus
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
                        {totalMatches > 0 && (
                            <span className="text-xs text-muted-foreground mr-1">
                                {currentMatchIndex + 1}/{totalMatches}
                            </span>
                        )}
                        <div className="flex bg-muted rounded">
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                disabled={matches.length === 0}
                                onClick={goToPrev}
                                title="前を検索 (Shift+Enter)"
                            >
                                <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                disabled={matches.length === 0}
                                onClick={goToNext}
                                title="次を検索 (Enter)"
                            >
                                <ChevronDown className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Search Options */}
                <div className="flex items-center gap-2 flex-wrap">
                    <button
                        className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                            useRegex ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/50"
                        )}
                        onClick={() => setUseRegex(!useRegex)}
                        title="正規表現"
                    >
                        <Code className="h-3 w-3" />
                        <span>.*</span>
                    </button>
                    <button
                        className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                            caseSensitive ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/50"
                        )}
                        onClick={() => setCaseSensitive(!caseSensitive)}
                        title="大文字・小文字を区別"
                    >
                        <Type className="h-3 w-3" />
                        <span>Aa</span>
                    </button>
                    <button
                        className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                            wholeWord ? "bg-secondary text-secondary-foreground" : "hover:bg-secondary/50"
                        )}
                        onClick={() => setWholeWord(!wholeWord)}
                        title="単語全体"
                    >
                        <span className="h-3 w-3 flex items-center justify-center font-serif">W</span>
                        <span>" "</span>
                    </button>
                </div>

                {errorMsg && (
                    <p className="text-xs text-destructive">{errorMsg}</p>
                )}
            </div>

            {/* Replace Section */}
            {isReplaceMode && (
                <div className="space-y-2 pt-2 border-t">
                    <div className="relative">
                        <Input
                            value={replaceTerm}
                            onChange={(e) => setReplaceTerm(e.target.value)}
                            placeholder="置換..."
                            className="pr-8"
                        />
                    </div>

                    <div className="flex gap-1">
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs"
                            disabled={matches.length === 0}
                            onClick={replaceCurrent}
                        >
                            置換
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 text-xs"
                            disabled={matches.length === 0}
                            onClick={replaceAll}
                        >
                            すべて置換
                        </Button>
                    </div>
                </div>
            )}

            {/* Results List */}
            {matches.length > 0 && (
                <div className="border rounded max-h-40 overflow-y-auto">
                    <div className="text-xs text-muted-foreground px-2 py-1 border-b bg-muted/50">
                        検索結果 ({totalMatches}件)
                    </div>
                    <div className="divide-y max-h-32 overflow-y-auto">
                        {matches.slice(0, 50).map((match, idx) => (
                            <button
                                key={idx}
                                className={cn(
                                    "w-full text-left px-2 py-1.5 text-xs hover:bg-secondary/50 transition-colors",
                                    currentMatchIndex === idx && "bg-secondary"
                                )}
                                onClick={() => goToMatch(idx)}
                            >
                                <div className="flex items-start gap-2">
                                    <span className="text-muted-foreground shrink-0">
                                        {match.line}:{match.col}
                                    </span>
                                    <span className="truncate font-mono">
                                        {match.text.length > 50
                                            ? match.text.slice(0, 50) + '...'
                                            : match.text}
                                    </span>
                                </div>
                            </button>
                        ))}
                        {matches.length > 50 && (
                            <div className="px-2 py-1 text-xs text-muted-foreground text-center">
                                ... さらに {matches.length - 50} 件
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// Floating variant for use in editor
export const SearchReplaceFloating: React.FC<SearchReplacePanelProps> = (props) => {
    return (
        <div className="absolute top-2 right-16 z-20 w-80">
            <SearchReplacePanel {...props} />
        </div>
    );
};

// Command to toggle search panel from keyboard
export const SEARCH_SHORTCUT = 'Cmd-F';
export const REPLACE_SHORTCUT = 'Cmd-H';
