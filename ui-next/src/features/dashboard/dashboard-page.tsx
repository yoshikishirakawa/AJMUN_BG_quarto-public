import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { useProjectStore } from "@/store/useProjectStore";
import { useEffect } from "react";

export const Dashboard: React.FC = () => {
  const { project, fetchProject } = useProjectStore();

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Chapters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{project?.chapters?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Project Metadata</CardTitle>
          <CardDescription>
            Basic information about your background guide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-md overflow-auto text-sm">
            {JSON.stringify(project?.metadata, null, 2)}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
