import React from 'react';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface PreviewDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    url: string | null;
    filename: string;
}

export const PreviewDialog: React.FC<PreviewDialogProps> = ({
    open,
    onOpenChange,
    url,
    filename,
}) => {
    if (!url) return null;

    const fullUrl = new URL(url, window.location.origin).toString();

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-[90vw] h-[90vh] flex flex-col p-0 gap-0">
                <DialogHeader className="p-4 border-b flex flex-row items-center justify-between space-y-0">
                    <DialogTitle className="flex items-center gap-2">
                        Preview: {filename}
                        <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                            <a href={fullUrl} target="_blank" rel="noreferrer" title="Open in new tab">
                                <ExternalLink className="h-4 w-4" />
                            </a>
                        </Button>
                    </DialogTitle>
                    {/* Close button is handled by DialogPrimitive but we can add custom header actions if needed */}
                </DialogHeader>

                <div className="flex-1 bg-muted/20 w-full h-full overflow-hidden relative">
                    <iframe
                        src={fullUrl}
                        className="w-full h-full border-none"
                        title={filename}
                    />
                </div>
            </DialogContent>
        </Dialog>
    );
};
