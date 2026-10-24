import { Redirect } from 'expo-router';

import { useSelectedExam } from '@/features/exam/service';
import { ErrorView, Loading, Screen } from '@/ui/primitives';

/** 启动入口：没选过考试（含从 v0.1.1 升级上来的用户）先去选考试，选过就进这门考试的首页 */
export default function Index() {
  const { data, error, loading, reload } = useSelectedExam();
  if (error)
    return (
      <Screen>
        <ErrorView message={error} onRetry={reload} />
      </Screen>
    );
  if (loading && !data)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  return <Redirect href={data ? '/home' : '/choose-exam'} />;
}
