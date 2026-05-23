import React from 'react';
import styles from './InternalLink.module.css';
import { useUIStore } from '@/store/useUIStore';
import { useToast } from '@/hooks/use-toast';
import { isInternalLink } from './internalLinkUtils';

interface InternalLinkProps {
    href: string;
    children: React.ReactNode;
    className?: string;
    onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

const ExternalLinkIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg
        className={`${styles.icon} ${styles.externalIcon} ${className}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"
        />
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"
        />
    </svg>
);

const InternalLinkIcon: React.FC<{ className?: string }> = ({ className = '' }) => (
    <svg
        className={`${styles.icon} ${styles.internalIcon} ${className}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
    >
        <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z"
        />
    </svg>
);

export const InternalLink: React.FC<InternalLinkProps> = ({
    href,
    children,
    className = '',
    onClick
}) => {
    const scrollToLine = useUIStore(state => state.scrollToLine);
    const { toast } = useToast();
    const isInternal = isInternalLink(href);

    const handleInternalLinkClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
        e.preventDefault();

        // Extract heading ID from href (e.g., "#heading-id" -> "heading-id")
        const headingId = href.startsWith('#') ? href.slice(1) : href;

        // Find the heading element in the editor by its data-id attribute
        const headingElement = document.querySelector(`[data-heading-id="${headingId}"]`);

        if (headingElement) {
            // Get the line number from data-source-line attribute
            const sourceLine = headingElement.getAttribute('data-source-line');
            if (sourceLine) {
                const lineNumber = parseInt(sourceLine, 10);

                // Set scroll signal to scroll editor to the heading
                scrollToLine(lineNumber);

                toast({
                    title: "ナビゲーション",
                    description: `${headingId}に移動しました`,
                });
            }
        } else {
            toast({
                title: "見出しが見つかりません",
                description: "指定された見出しはこのドキュメントに存在しません",
                variant: "destructive",
            });
        }

        // Call custom onClick if provided
        if (onClick) {
            onClick(e);
        }
    };

    const getTextContent = (node: React.ReactNode): string => {
        if (typeof node === 'string') return node;
        if (Array.isArray(node)) return node.map(getTextContent).join('');
        if (React.isValidElement(node)) {
            const children = (node.props as { children?: React.ReactNode }).children;
            return getTextContent(children);
        }
        return '';
    };

    const linkText = getTextContent(children);
    const ariaLabel = isInternal
        ? `内部リンク: ${linkText}`
        : `外部リンク: ${linkText}`;

    if (isInternal) {
        return (
            <a
                href={href}
                className={`${styles.internalLink} ${className}`}
                onClick={handleInternalLinkClick}
                aria-label={ariaLabel}
                role="link"
            >
                <InternalLinkIcon />
                {children}
            </a>
        );
    }

    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`${styles.externalLink} ${className}`}
            onClick={onClick}
            aria-label={ariaLabel}
            role="link"
        >
            {children}
            <ExternalLinkIcon />
        </a>
    );
};
