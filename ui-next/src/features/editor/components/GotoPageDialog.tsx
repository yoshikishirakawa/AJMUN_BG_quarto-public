import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePageMapping, parsePageInput } from '../hooks/usePageMapping';

interface GotoPageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGoto: (page: number, position?: 'top' | 'bottom' | 'middle') => void;
  containerElement?: HTMLElement | null;
}

/**
 * Dialog for jumping to a specific PDF page
 * Supports inputs like:
 *   - "57" - go to page 57
 *   - "57 bottom" - go to bottom of page 57
 *   - "xii" - go to roman numeral page (TODO)
 */
export const GotoPageDialog: React.FC<GotoPageDialogProps> = ({
  open,
  onOpenChange,
  onGoto
}) => {
  const { mapping, loading } = usePageMapping(null);
  const [pageInput, setPageInput] = useState('');
  const [error, setError] = useState<string>('');
  const [selectedPosition, setSelectedPosition] = useState<'top' | 'middle' | 'bottom'>('top');

  // Reset input when dialog opens
  useEffect(() => {
    if (open) {
      setPageInput('');
      setError('');
      setSelectedPosition('top');
    }
  }, [open]);

  const handleSubmit = () => {
    if (!mapping) {
      setError('Page mapping not available');
      return;
    }

    const parsedPage = parsePageInput(pageInput, mapping.totalPages);

    if (parsedPage === null) {
      setError(`Invalid page. Enter 1-${mapping.totalPages}${pageInput.includes('bottom') ? ' (bottom modifier supported)' : ''}`);
      return;
    }

    // Check for "bottom" modifier
    const wantBottom = pageInput.trim().toLowerCase().endsWith(' bottom');
    const position = wantBottom ? 'bottom' : selectedPosition;

    onGoto(parsedPage, position);
    onOpenChange(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  // Quick page buttons (first, last, +10, -10)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[350px]">
        <DialogHeader>
          <DialogTitle>Go to Page</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {loading ? (
            <p className="text-sm text-gray-500">Loading page data...</p>
          ) : !mapping ? (
            <p className="text-sm text-gray-500">Page mapping not available. Build the PDF first.</p>
          ) : (
            <>
              <div className="space-y-2">
                <Input
                  type="text"
                  value={pageInput}
                  onChange={(e) => {
                    setPageInput(e.target.value);
                    setError('');
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={`1-${mapping.totalPages}`}
                  autoFocus
                  className={error ? 'border-red-500' : ''}
                />
                {error && (
                  <p className="text-xs text-red-500">{error}</p>
                )}
                <p className="text-xs text-gray-500">
                  Document has {mapping.totalPages} pages.
                  Try &quot;57&quot; or &quot;57 bottom&quot;
                </p>
              </div>

              {/* Position selector */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={selectedPosition === 'top' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedPosition('top')}
                >
                  Top
                </Button>
                <Button
                  type="button"
                  variant={selectedPosition === 'middle' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedPosition('middle')}
                >
                  Middle
                </Button>
                <Button
                  type="button"
                  variant={selectedPosition === 'bottom' ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1"
                  onClick={() => setSelectedPosition('bottom')}
                >
                  Bottom
                </Button>
              </div>

              {/* Quick actions */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onGoto(1, 'top');
                    onOpenChange(false);
                  }}
                >
                  First (1)
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    onGoto(mapping.totalPages, 'bottom');
                    onOpenChange(false);
                  }}
                >
                  Last ({mapping.totalPages})
                </Button>
              </div>

              <div className="flex justify-end pt-2">
                <Button onClick={handleSubmit}>
                  Go
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

interface GotoPageButtonProps {
  onGoto: (page: number, position?: 'top' | 'bottom' | 'middle') => void;
  containerElement?: HTMLElement | null;
}

/**
 * Simple button that opens the Goto Page dialog
 */
export const GotoPageButton: React.FC<GotoPageButtonProps> = ({ onGoto, containerElement }) => {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-2"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Go to Page
      </Button>
      <GotoPageDialog
        open={open}
        onOpenChange={setOpen}
        onGoto={onGoto}
        containerElement={containerElement}
      />
    </>
  );
};
