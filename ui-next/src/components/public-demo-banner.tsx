import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

export function PublicDemoBanner() {
  return (
    <Alert className="rounded-none border-x-0 border-t-0 border-amber-500/40 bg-amber-500/10">
      <AlertTitle>公開用の読み取り専用デモ</AlertTitle>
      <AlertDescription>
        本文の入力とプレビューは一時的に試せますが、保存、ビルド、認証、Google Docs 連携、アップロードは利用できません。再読み込みで初期状態に戻ります。
      </AlertDescription>
    </Alert>
  )
}

