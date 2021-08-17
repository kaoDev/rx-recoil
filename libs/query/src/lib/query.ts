import {
  atom,
  EMPTY_TYPE,
  EMPTY_VALUE,
  useAtom,
  useObservable,
} from '@rx-recoil/core';
import { useCallback, useEffect } from 'react';
import { Subject } from 'rxjs';

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
  reset: () => void;
  value$: Subject<QueryResult<Value> | EMPTY_TYPE>;
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

const connectPromiseToState = <Value>(
  queryState: QueryState<Value>,
  requestPromise: Promise<Value>,
  onlyApplySuccess = false
) => {
  function cleanUp() {
    queryState.lastTimestamp = Date.now();
    queryState.runningRequest = undefined;
  }

  const runningPromise: Promise<Value | Error> = requestPromise
    .then((value) => {
      if (queryState.runningRequest === runningPromise) {
        cleanUp();
        queryState.result = { value, timestamp: Date.now() };
        queryState.value$.next(queryState.result);
      }

      return value;
    })
    .catch((error: Error) => {
      if (!onlyApplySuccess  && queryState.runningRequest === runningPromise) {
        cleanUp();
        queryState.result = { error, timestamp: Date.now() };
        queryState.value$.next(queryState.result);
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
): {
  queryState: QueryState<Value>;
  queryValue: EMPTY_TYPE | QueryResult<Value>;
} {
  const queries = useAtom(queryRegistry)[0];
  const [prefetchPromises] = useAtom(prefetchRegistry);

  let queryState = queries.get(key) as QueryState<Value> | undefined;

  const fresh = queryState === undefined;

  if (!queryState) {
    const newQueryState: QueryState<Value> = {
      result: EMPTY_VALUE,
      lastTimestamp: 0,
      value$: new Subject(),
      refetch: () => {
        if (newQueryState.runningRequest) {
          return newQueryState.runningRequest;
        }

        return connectPromiseToState(newQueryState, fetcher(key));
      },
      reset: () => {
        newQueryState.runningRequest = undefined;
        newQueryState.lastTimestamp = 0;
        newQueryState.result = EMPTY_VALUE;
        newQueryState.value$.next(EMPTY_VALUE);
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
        );
      }
    } else {
      const prefetched = prefetchPromises.get(key);
      if (prefetched && Date.now() - prefetched.ts < ttl) {
        connectPromiseToState(queryState, prefetched.p as Promise<Value>);
        queryState.lastTimestamp = prefetched.ts;
      } else {
        newQueryState.refetch();
      }
    }
  }

  const queryValue = useObservable<EMPTY_TYPE | QueryResult<Value>>(
    queryState.value$,
    queryState.result,
  );

  if (fresh && !queryState.runningRequest) {
    queryState.runningRequest = queryState.refetch();
  }

  return {
    queryState,
    queryValue,
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
      reset: () => void;
      refreshing: boolean;
    }
  | {
      data: undefined;
      error: Error;
      loading: false;
      refetch: () => Promise<Value | Error>;
      reset: () => void;
      refreshing: boolean;
    }
  | {
      data: undefined;
      error: undefined;
      loading: true;
      refetch: () => Promise<Value | Error>;
      reset: () => void;
      refreshing: boolean;
    };

interface UseQueryProps<Value> {
  initialData?: (
    key: string,
  ) => Value | EMPTY_TYPE | Promise<Value | EMPTY_TYPE>;
  ttl?: number;
}

export function useQueryRaw<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  { initialData, ttl = DEFAULT_CACHE_TIME }: UseQueryProps<Value> = {},
): QueryRawResult<Value> {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState } = useQueryState(key, fetcher, ttl, initialData?.(key));

  const queryValue = queryState.result;

  useEffect(() => {
    startRequestIfNecessary(queryState.refetch, queryState, ttl);
  }, [ttl, queryState, queryState.refetch]);

  const refreshing = queryState.runningRequest != null;
  const { refetch, reset } = queryState;

  if (queryValue === EMPTY_VALUE) {
    return {
      refetch,
      reset,
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
    refetch,
    reset,
    refreshing,
  } as QueryRawResult<Value>;
}

export function useQuery<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  { initialData, ttl = DEFAULT_CACHE_TIME }: UseQueryProps<Value> = {},
): [
  value: Value,
  refetch: () => Promise<Value | Error>,
  refreshing: boolean,
  reset: () => void,
] {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, queryValue } = useQueryState(
    key,
    fetcher,
    ttl,
    initialData?.(key),
  );
  startRequestIfNecessary(queryState.refetch, queryState, ttl);

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
    queryState.reset,
  ];
}

type Mutator<Payload, Value> = (parameters: {
  payload: Payload;
  optimisticUpdate?: Value;
}) => Promise<Value | Error>;

type MutableQueryRawResult<Payload, Value> =
  | {
      data: Value;
      error: undefined;
      loading: false;
      refetch: () => Promise<Value | Error>;
      reset: () => void;
      mutate: Mutator<Payload, Value>;
      refreshing: boolean;
    }
  | {
      data: undefined;
      error: Error;
      loading: false;
      refetch: () => Promise<Value | Error>;
      reset: () => void;
      mutate: Mutator<Payload, Value>;
      refreshing: boolean;
    }
  | {
      data: undefined;
      error: undefined;
      loading: true;
      refetch: () => Promise<Value | Error>;
      reset: () => void;
      mutate: Mutator<Payload, Value>;
      refreshing: boolean;
    };

export function useMutableQueryRaw<Payload, Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  mutator: (payload: Payload) => Promise<Value>,
  { initialData, ttl = DEFAULT_CACHE_TIME }: UseQueryProps<Value> = {},
): MutableQueryRawResult<Payload, Value> {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState } = useQueryState(key, fetcher, ttl, initialData?.(key));

  const queryValue = queryState.result;

  useEffect(() => {
    startRequestIfNecessary(queryState.refetch, queryState, ttl);
  }, [ttl, queryState, queryState.refetch]);

  const refreshing = queryState.runningRequest != null;
  const mutate: Mutator<Payload, Value> = useMutator<Value, Payload>(
    queryState,
    mutator,
  );
  const { refetch, reset } = queryState;
  if (queryValue === EMPTY_VALUE) {
    return {
      refetch,
      reset,
      mutate,
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
    refetch,
    reset,
    mutate,
    refreshing,
  } as MutableQueryRawResult<Payload, Value>;
}
export function useMutableQuery<Payload, Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  mutate: (payload: Payload) => Promise<Value>,
  { initialData, ttl = DEFAULT_CACHE_TIME }: UseQueryProps<Value> = {},
): [
  value: Value,
  refetch: () => Promise<Value | Error>,
  refreshing: boolean,
  mutate: Mutator<Payload, Value>,
  reset: () => void,
] {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, queryValue } = useQueryState(
    key,
    fetcher,
    ttl,
    initialData?.(key),
  );
  startRequestIfNecessary(queryState.refetch, queryState, ttl);

  const mutator: Mutator<Payload, Value> = useMutator<Value, Payload>(
    queryState,
    mutate,
  );

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
    mutator,
    queryState.reset,
  ];
}

function useMutator<Value, Payload>(
  queryState: QueryState<Value>,
  mutate: (payload: Payload) => Promise<Value>,
): Mutator<Payload, Value> {
  return useCallback(
    (paramters) => {
      const currentValue = queryState.result;
      if (paramters.optimisticUpdate) {
        queryState.value$.next({
          timestamp: Date.now(),
          value: paramters.optimisticUpdate,
        });
      }

      const catchedMutate: typeof mutate = async payload => {
        try {
          return await mutate(payload);
        } catch(error) {
          queryState.value$.next(currentValue)
          queryState.result = currentValue
          throw error
        }
      }

      return connectPromiseToState(queryState, catchedMutate(paramters.payload), true);
    },
    [mutate, queryState],
  );
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
