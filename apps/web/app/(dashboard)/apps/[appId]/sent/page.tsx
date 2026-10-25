import { SentView } from '@/components/sent/sent-view';

export default async function AppSentPage({
  params,
}: {
  params: Promise<{ appId: string }>;
}) {
  const { appId } = await params;
  return <SentView appId={appId} />;
}
