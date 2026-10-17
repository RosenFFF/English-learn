import { useCallback, useEffect, useState } from 'react';

import { getDatabases } from '../../db/open';
import { errorMessage } from '../shared';

/** 启动时打开数据库、跑迁移、导入词库 */
export function useAppReady() {
  const [state, setState] = useState<{ ready: boolean; error: string | null }>({
    ready: false,
    error: null,
  });
  const open = useCallback(() => {
    getDatabases().then(
      () => setState({ ready: true, error: null }),
      (e: unknown) => setState({ ready: false, error: errorMessage(e) }),
    );
  }, []);
  useEffect(open, [open]);
  const retry = useCallback(() => {
    setState({ ready: false, error: null });
    open();
  }, [open]);
  return { ...state, retry };
}
