import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useProjectStore } from '@/store/useProjectStore';

const metadataSchema = z.object({
    title: z.string().min(1, "Title is required"),
    author: z.string().min(1, "Author is required"),
    date: z.string().optional(),
    version: z.string().default("1.0.0"),
});

type MetadataFormValues = z.infer<typeof metadataSchema>;

export const MetadataEditor: React.FC = () => {
    const { project, updateMetadata } = useProjectStore();

    const form = useForm<MetadataFormValues>({
        resolver: zodResolver(metadataSchema) as any,
        defaultValues: {
            title: project?.metadata?.title || "",
            author: project?.metadata?.author || "",
            date: project?.metadata?.date || new Date().toISOString().split('T')[0],
            version: project?.metadata?.version || "1.0.0",
        },
        values: project?.metadata
            ? {
                title: project.metadata.title,
                author: project.metadata.author,
                date: project.metadata.date || undefined,
                version: project.metadata.version || "1.0.0",
            }
            : undefined
    });

    const onSubmit = (values: MetadataFormValues) => {
        if (!project) return;
        updateMetadata(values);
        console.log("Metadata updated:", values);
    };

    if (!project) {
        return <div className="p-4 text-muted-foreground">No project loaded.</div>;
    }

    return (
        <div className="p-6 max-w-lg mx-auto bg-card rounded-lg border shadow-sm">
            <h2 className="text-xl font-semibold mb-6">Project Settings</h2>

            <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                    <FormField
                        control={form.control}
                        name="title"
                        render={({ field }: { field: any }) => (
                            <FormItem>
                                <FormLabel>Project Title</FormLabel>
                                <FormControl>
                                    <Input placeholder="AJMUN Background Guide" {...field} />
                                </FormControl>
                                <FormDescription>
                                    The main title of your document.
                                </FormDescription>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <FormField
                        control={form.control}
                        name="author"
                        render={({ field }: { field: any }) => (
                            <FormItem>
                                <FormLabel>Author(s)</FormLabel>
                                <FormControl>
                                    <Input placeholder="Director Name" {...field} />
                                </FormControl>
                                <FormMessage />
                            </FormItem>
                        )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                            control={form.control}
                            name="date"
                            render={({ field }: { field: any }) => (
                                <FormItem>
                                    <FormLabel>Date</FormLabel>
                                    <FormControl>
                                        <Input type="date" {...field} value={field.value || ''} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="version"
                            render={({ field }: { field: any }) => (
                                <FormItem>
                                    <FormLabel>Version</FormLabel>
                                    <FormControl>
                                        <Input placeholder="1.0.0" {...field} />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button type="submit">Save Changes</Button>
                    </div>
                </form>
            </Form>
        </div>
    );
};
