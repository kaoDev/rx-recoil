import {
  atom,
  EMPTY_TYPE,
  EMPTY_VALUE,
  selector,
  SelectorDefinition,
  useAtom,
  useAtomRaw,
} from '@rx-recoil/core';
import { useCallback, useEffect } from 'react';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { filter, mergeMap } from 'rxjs/operators';

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
interface QueryState<Value> {
  selector: SelectorDefinition<QueryResult<Value> | EMPTY_TYPE>;
  update$: Subject<Promise<Value> | undefined>;
  runningRequest?: Promise<Value>;
}

const queryRegistry = atom(() => new Map<string, QueryState<unknown>>());
const prefetchRegistry = atom(
  () => new Map<string, { p: Promise<unknown>; ts: number }>(),
);

const DEFAULT_CACHE_TIME = 60000;

function createQuerySelector<Value>(
  value$: Observable<QueryResult<Value>>,
  key: string,
  initialData?: Value,
): SelectorDefinition<QueryResult<Value> | EMPTY_TYPE> {
  const initialValue = initialData
    ? { value: initialData, timestamp: 0 }
    : undefined;

  return selector<QueryResult<Value>>(() => value$, {
    volatile: true,
    debugKey: key,
    initialValue,
  });
}

function useQueryState<Value>(
  key: string,
  fetcher: (key: string) => Promise<Value>,
  ttl: number,
  initialData?: Value,
) {
  const queries = useAtomRaw(queryRegistry)[0];
  const [prefetchPromises] = useAtom(prefetchRegistry);

  let queryState = queries.get(key) as QueryState<Value> | undefined;

  if (!queryState) {
    const update$ = new BehaviorSubject<Promise<Value> | undefined>(undefined);

    const value$: Observable<QueryResult<Value>> = update$.pipe(
      filter((promise): promise is Promise<Value> => promise !== undefined),
      mergeMap((promise) => {
        function cleanUp() {
          if (queryState?.runningRequest === promise) {
            queryState.runningRequest = undefined;
          }
        }

        return promise
          .then((value) => {
            cleanUp();
            return { value, timestamp: Date.now() };
          })
          .catch((error: Error) => {
            cleanUp();
            return { error, timestamp: Date.now() };
          });
      }),
    );

    const querySelector = createQuerySelector(value$, key, initialData);

    queryState = { selector: querySelector, update$ };
    queries.set(key, queryState as QueryState<unknown>);

    const prefetched = prefetchPromises.get(key);
    if (prefetched && prefetched.ts - Date.now() < ttl) {
      queryState.runningRequest = prefetched.p as Promise<Value>;
      queryState!.update$.next(prefetched.p as Promise<Value>);
    }
  }

  const refetch = useCallback(() => {
    const fetchPromise = fetcher(key);
    queryState!.runningRequest = fetchPromise;
    queryState!.update$.next(fetchPromise);

    return fetchPromise;
  }, [queryState, fetcher, key]);

  return {
    queryState,
    refetch,
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
  queryValue: QueryResult<Value> | EMPTY_TYPE,
  ttl: number,
) {
  const timestamp =
    queryValue === EMPTY_VALUE ? undefined : queryValue.timestamp;

  if (shouldFetch(queryState.runningRequest, timestamp, ttl)) {
    refetch();
  }
}

type QueryRawResult<Value> =
  | {
      data: Value;
      error: undefined;
      loading: false;
      refetch: () => Promise<Value>;
    }
  | {
      data: undefined;
      error: Error;
      loading: false;
      refetch: () => Promise<Value>;
    }
  | {
      data: undefined;
      error: undefined;
      loading: true;
      refetch: () => Promise<Value>;
    };

export function useQueryRaw<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  {
    initialData,
    ttl = DEFAULT_CACHE_TIME,
  }: {
    initialData?: Value;
    ttl?: number;
  } = {},
): QueryRawResult<Value> {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, refetch } = useQueryState(key, fetcher, ttl, initialData);

  const [queryValue] = useAtomRaw(queryState.selector);

  useEffect(() => {
    startRequestIfNecessary(refetch, queryState, queryValue, ttl);
  }, [ttl, queryState, queryValue, refetch]);

  if (queryValue === EMPTY_VALUE) {
    return { refetch, data: undefined, loading: true, error: undefined };
  }

  return {
    data: queryValue.value,
    error: queryValue.error,
    loading: false,
    refetch,
  } as QueryRawResult<Value>;
}

export function useQuery<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  {
    initialData,
    ttl = DEFAULT_CACHE_TIME,
  }: {
    initialData?: Value;
    ttl?: number;
  } = {},
): [value: Value, refetch: () => Promise<Value>] {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, refetch } = useQueryState(key, fetcher, ttl, initialData);

  try {
    const [queryValue] = useAtom(queryState.selector);
    startRequestIfNecessary(refetch, queryState, queryValue, ttl);

    if (queryValue.error) {
      throw queryValue.error;
    }

    return [queryValue.value, refetch];
  } catch (promiseOrError) {
    if (promiseOrError instanceof Promise) {
      startRequestIfNecessary(refetch, queryState, EMPTY_VALUE, ttl);
    }
    throw promiseOrError;
  }
}

export function usePrefetchCallback(
  fetcher: (key: string) => Promise<unknown>,
) {
  const [prefetchPromises] = useAtom(prefetchRegistry);

  return useCallback(
    (queryId: string | (() => string)) => {
      const key = typeof queryId !== 'string' ? queryId() : queryId;
      prefetchPromises.set(key, { p: fetcher(key), ts: Date.now() });
    },
    [fetcher, prefetchPromises],
  );
}
