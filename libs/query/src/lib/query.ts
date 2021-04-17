import {
  atom,
  EMPTY_TYPE,
  EMPTY_VALUE,
  useAtom,
  useIsomorphicLayoutEffect,
} from '@rx-recoil/core';
import { useCallback, useState } from 'react';

interface ValidResult<Value> {
  value: Value;
  timestamp: number;
  error?: undefined;
}
interface ErrorResult {
  value?: undefined;
  timestamp: number;
  error: Error;
}
type QueryResult<Value> = ValidResult<Value> | ErrorResult;

interface Query<Value> {
  lastTimestamp: number;
  refetch: () => Promise<Value | Error>;
  listeners: Set<() => void>;
}

interface EmptyQueryState<Value> extends Query<Value> {
  result: EMPTY_TYPE;
  runningRequest: Promise<Value | Error>;
}
interface ResolvedQueryState<Value> extends Query<Value> {
  result: QueryResult<Value>;
  runningRequest?: Promise<Value | Error>;
}

type QueryState<Value> = EmptyQueryState<Value> | ResolvedQueryState<Value>;

const queryRegistry = atom(() => new Map<string, QueryState<unknown>>());
const prefetchRegistry = atom(
  () => new Map<string, { p: Promise<unknown>; ts: number }>(),
);

const DEFAULT_CACHE_TIME = 60000;

function useForceUpdate(): () => void {
  const [, dispatch] = useState<unknown>(Object.create(null));

  // Turn dispatch(required_parameter) into dispatch().
  const memoizedDispatch = useCallback((): void => {
    dispatch(Object.create(null));
  }, [dispatch]);
  return memoizedDispatch;
}

function notifyListeners(queryState: QueryState<unknown>) {
  for (const listener of queryState.listeners) {
    listener();
  }
}

const connectPromiseToState = <Value>(
  queryState: QueryState<Value>,
  promise: Promise<Value>,
  onChange?: (value: Value) => void,
) => {
  function cleanUp() {
    queryState.lastTimestamp = Date.now();
    queryState.runningRequest = undefined;
  }

  const runningPromise: Promise<Value | Error> = promise
    .then((value) => {
      if (runningPromise === queryState.runningRequest) {
        cleanUp();
        onChange?.(value);
        queryState.result = { value, timestamp: Date.now() };
        notifyListeners(queryState);
      }

      if (queryState.result === EMPTY_VALUE) {
        return queryState.runningRequest;
      }
      if (queryState.runningRequest) {
        return queryState.runningRequest;
      }

      return queryState.result.value!;
    })
    .catch((error: Error) => {
      if (runningPromise === queryState.runningRequest) {
        cleanUp();
        queryState.result = { error, timestamp: Date.now() };
        notifyListeners(queryState);
      }
      return error;
    });

  queryState.runningRequest = runningPromise;
  queryState.lastTimestamp = Date.now();

  return runningPromise;
};

function useQueryState<Value>(
  key: string,
  fetcher: (key: string) => Promise<Value>,
  ttl: number,
  initialData?: Value | EMPTY_TYPE | Promise<Value | EMPTY_TYPE>,
  onChange?: (value: Value) => void,
) {
  const forceRender = useForceUpdate();
  const queries = useAtom(queryRegistry)[0];
  const [prefetchPromises] = useAtom(prefetchRegistry);

  let queryState = queries.get(key) as QueryState<Value> | undefined;

  const fresh = queryState === undefined;

  if (!queryState) {
    queryState = {
      result: EMPTY_VALUE,
      lastTimestamp: 0,
      listeners: new Set(),
    } as QueryState<Value>;
    queries.set(key, queryState as QueryState<unknown>);

    if (initialData && initialData !== EMPTY_VALUE) {
      if (initialData instanceof Promise) {
        connectPromiseToState(
          queryState,
          initialData.then((value) => {
            if (value === EMPTY_VALUE) {
              return fetcher(key);
            }
            return value;
          }),
          onChange,
        );
      }
    } else {
      const prefetched = prefetchPromises.get(key);
      if (prefetched && Date.now() - prefetched.ts < ttl) {
        connectPromiseToState(
          queryState,
          prefetched.p as Promise<Value>,
          onChange,
        );
        queryState.lastTimestamp = prefetched.ts;
      }
    }
    queryState.refetch = () => {
      if (queryState!.runningRequest) {
        return queryState!.runningRequest;
      }

      return connectPromiseToState(queryState!, fetcher(key), onChange);
    };
  }

  useIsomorphicLayoutEffect(() => {
    queryState?.listeners.add(forceRender);

    return () => {
      queryState?.listeners.delete(forceRender);
    };
  }, [forceRender]);

  if (fresh && !queryState.runningRequest) {
    queryState.runningRequest = queryState.refetch();
  }

  return {
    queryState,
  };
}

function shouldFetch(
  runningRequest: Promise<unknown> | undefined,
  timestamp: number | undefined,
  ttl: number,
) {
  if (!!runningRequest || (timestamp && Date.now() - timestamp < ttl)) {
    return false;
  }

  return true;
}

function startRequestIfNecessary<Value>(
  refetch: () => void,
  queryState: QueryState<Value>,
  ttl: number,
) {
  if (shouldFetch(queryState.runningRequest, queryState.lastTimestamp, ttl)) {
    refetch();
  }
}

type QueryRawResult<Value> =
  | {
      data: Value;
      error: undefined;
      loading: false;
      refetch: () => Promise<Value | Error>;
    }
  | {
      data: undefined;
      error: Error;
      loading: false;
      refetch: () => Promise<Value | Error>;
    }
  | {
      data: undefined;
      error: undefined;
      loading: true;
      refetch: () => Promise<Value | Error>;
    };

interface UseQueryProps<Value> {
  initialData?: (
    key: string,
  ) => Value | EMPTY_TYPE | Promise<Value | EMPTY_TYPE>;
  ttl?: number;
  onChange?: (value: Value) => void;
}

export function useQueryRaw<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  {
    initialData,
    ttl = DEFAULT_CACHE_TIME,
    onChange,
  }: UseQueryProps<Value> = {},
): QueryRawResult<Value> {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState } = useQueryState(
    key,
    fetcher,
    ttl,
    initialData?.(key),
    onChange,
  );

  const queryValue = queryState.result;

  useIsomorphicLayoutEffect(() => {
    startRequestIfNecessary(queryState.refetch, queryState, ttl);
  }, [ttl, queryState, queryState.refetch]);

  if (queryValue === EMPTY_VALUE) {
    return {
      refetch: queryState.refetch,
      data: undefined,
      loading: true,
      error: undefined,
    };
  }

  return {
    data: queryValue.value,
    error: queryValue.error,
    loading: false,
    refetch: queryState.refetch,
  } as QueryRawResult<Value>;
}

export function useQuery<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  {
    initialData,
    ttl = DEFAULT_CACHE_TIME,
    onChange,
  }: UseQueryProps<Value> = {},
): [value: Value, refetch: () => Promise<Value | Error>] {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState } = useQueryState(
    key,
    fetcher,
    ttl,
    initialData?.(key),
    onChange,
  );
  startRequestIfNecessary(queryState.refetch, queryState, ttl);
  const queryValue = queryState.result;

  if (queryValue === EMPTY_VALUE) {
    throw queryState.runningRequest;
  }

  if (queryValue.error) {
    throw queryValue.error;
  }

  return [queryValue.value, queryState.refetch];
}

export function usePrefetchCallback(
  fetcher: (key: string) => Promise<unknown>,
  { forceRevalidate = false }: { forceRevalidate?: boolean } = {},
) {
  const [prefetchPromises] = useAtom(prefetchRegistry);
  const [queries] = useAtom(queryRegistry);

  return useCallback(
    (queryId: string | (() => string), ttl = DEFAULT_CACHE_TIME) => {
      const key = typeof queryId !== 'string' ? queryId() : queryId;
      const prefetched = prefetchPromises.get(key);
      const query = queries.get(key);

      if (query || (prefetched && Date.now() - prefetched.ts < ttl)) {
        if (forceRevalidate) {
          query?.refetch();
        }

        return;
      }
      prefetchPromises.set(key, { p: fetcher(key), ts: Date.now() });
    },
    [fetcher, forceRevalidate, prefetchPromises, queries],
  );
}
