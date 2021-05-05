import { atom, EMPTY_TYPE, EMPTY_VALUE, useAtom } from '@rx-recoil/core';
import { useCallback, useState, useEffect } from 'react';

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
  refetch: () => Promise<Value>;
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
      cleanUp();
      onChange?.(value);
      queryState.result = { value, timestamp: Date.now() };
      notifyListeners(queryState);

      return value;
    })
    .catch((error: Error) => {
      cleanUp();
      queryState.result = { error, timestamp: Date.now() };
      notifyListeners(queryState);
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
    const newQueryState: QueryState<Value> = {
      result: EMPTY_VALUE,
      lastTimestamp: 0,
      listeners: new Set(),
      refetch: () => {
        if (newQueryState.runningRequest) {
          return newQueryState.runningRequest;
        }

        return connectPromiseToState(newQueryState, fetcher(key), onChange);
      },
    } as QueryState<Value>;
    queryState = newQueryState;
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
      } else {
        newQueryState.refetch();
      }
    }
  }

  useEffect(() => {
    queryState?.listeners.add(forceRender);

    return () => {
      queryState?.listeners.delete(forceRender);
    };
  }, [forceRender, queryState?.listeners]);

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
      refreshing: boolean;
    }
  | {
      data: undefined;
      error: Error;
      loading: false;
      refetch: () => Promise<Value | Error>;
      refreshing: boolean;
    }
  | {
      data: undefined;
      error: undefined;
      loading: true;
      refetch: () => Promise<Value | Error>;
      refreshing: boolean;
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

  useEffect(() => {
    startRequestIfNecessary(queryState.refetch, queryState, ttl);
  }, [ttl, queryState, queryState.refetch]);

  const refreshing = queryState.runningRequest != null;

  if (queryValue === EMPTY_VALUE) {
    return {
      refetch: queryState.refetch,
      data: undefined,
      loading: true,
      error: undefined,
      refreshing,
    };
  }

  return {
    data: queryValue.value,
    error: queryValue.error,
    loading: false,
    refetch: queryState.refetch,
    refreshing,
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
): [value: Value, refetch: () => Promise<Value | Error>, refreshing: boolean] {
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

  return [
    queryValue.value,
    queryState.refetch,
    queryState.runningRequest != null,
  ];
}

export function usePrefetchCallback<Value = unknown>(
  fetcher: (key: string) => Promise<Value>,
  { forceRevalidate = false }: { forceRevalidate?: boolean } = {},
) {
  const [prefetchPromises] = useAtom(prefetchRegistry);
  const [queries] = useAtom(queryRegistry);

  return useCallback(
    async (
      queryId: string | (() => string),
      ttl = DEFAULT_CACHE_TIME,
    ): Promise<Value | Error> => {
      const key = typeof queryId !== 'string' ? queryId() : queryId;
      const prefetched = prefetchPromises.get(key);
      const query = queries.get(key) as QueryState<Value> | undefined;

      if (query) {
        if (forceRevalidate || query.result === EMPTY_VALUE) {
          return query.runningRequest ?? query.refetch();
        } else {
          return query.result.error ?? (query.result.value as Value);
        }
      }

      if (prefetched && Date.now() - prefetched.ts < ttl) {
        return prefetched.p as Promise<Value>;
      }
      const p = fetcher(key);
      prefetchPromises.set(key, { p, ts: Date.now() });
      return p;
    },
    [fetcher, forceRevalidate, prefetchPromises, queries],
  );
}
