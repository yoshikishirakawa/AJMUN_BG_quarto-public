import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useProjectStore } from '@/store/useProjectStore'
import { publicSampleUrl } from '@/lib/public-demo'

export function PublicDemoDashboardPage() {
  const { project } = useProjectStore()
  return (
    <div className="p-8 h-full overflow-y-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold">ダッシュボード</h1>
        <p className="text-muted-foreground mt-2">公開サンプルの編集画面構成を確認するための静的デモです。</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{project?.metadata.title || 'AJMUN BG Editor Sample'}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>著者: {project?.metadata.author || '-'}</p>
            <p>章数: {project?.chapters.length || 0}</p>
            <p>この画面の内容は fixture data から表示しています。</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>公開済み出力</CardTitle><CardDescription>レビュー済みのサンプルを開きます。</CardDescription></CardHeader>
          <CardContent className="flex gap-3">
            <Button asChild variant="outline"><a href={publicSampleUrl('html/index.html')} target="_blank" rel="noreferrer">HTML 版</a></Button>
            <Button asChild variant="outline"><a href={publicSampleUrl('pdf/平和への課題：補遺.pdf')} target="_blank" rel="noreferrer">PDF 版</a></Button>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle>運用機能</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Build status、Google Docs 同期、activity log、画像管理は公開デモでは接続されません。
        </CardContent>
      </Card>
    </div>
  )
}

export function PublicDemoBuildPage() {
  return (
    <div className="container mx-auto p-6 h-full overflow-y-auto space-y-6">
      <h1 className="text-3xl font-bold">ビルドと出力</h1>
      <Card>
        <CardHeader><CardTitle>ビルド操作</CardTitle><CardDescription>公開デモでは実行できません。</CardDescription></CardHeader>
        <CardContent className="flex gap-3">
          <Button disabled>HTML / PDF を生成</Button>
          <Button disabled variant="outline">生成物を削除</Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>レビュー済みサンプル</CardTitle></CardHeader>
        <CardContent className="flex gap-3">
          <Button asChild variant="outline"><a href={publicSampleUrl('html/index.html')} target="_blank" rel="noreferrer">HTML を開く</a></Button>
          <Button asChild variant="outline"><a href={publicSampleUrl('pdf/平和への課題：補遺.pdf')} target="_blank" rel="noreferrer">PDF を開く</a></Button>
        </CardContent>
      </Card>
    </div>
  )
}

export function PublicDemoBibliographyPage() {
  return (
    <div className="p-6 h-full overflow-y-auto space-y-6">
      <h1 className="text-2xl font-bold">参考文献管理</h1>
      <Card>
        <CardHeader><CardTitle>参考文献データ</CardTitle><CardDescription>この機能は画面確認のみです。</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <Button disabled>参考文献を追加</Button>
          <div className="rounded-md border p-6 text-sm text-muted-foreground">公開デモでは文献ファイルの取得と更新を行いません。</div>
        </CardContent>
      </Card>
    </div>
  )
}

export function PublicDemoSettingsPage() {
  return (
    <div className="container mx-auto p-6 h-full overflow-y-auto space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">プロジェクト設定</h1>
        <p className="text-muted-foreground">設定画面の構成例です。変更は保存されません。</p>
      </div>
      <Card>
        <CardHeader><CardTitle>無効化された設定領域</CardTitle></CardHeader>
        <CardContent className="grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
          <div className="rounded-md border p-4">書誌情報と章構成</div>
          <div className="rounded-md border p-4">PDF / HTML スタイル</div>
          <div className="rounded-md border p-4">Google Docs 連携</div>
          <div className="rounded-md border p-4">認証とアクセス制御</div>
        </CardContent>
      </Card>
      <Button disabled>設定を保存</Button>
    </div>
  )
}
