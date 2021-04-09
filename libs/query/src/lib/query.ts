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
import { Observable, Subject } from 'rxjs';
import { switchMap } from 'rxjs/operators';

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
  update$: Subject<Promise<Value>>;
  runningRequest?: Promise<Value>;
}

const queryRegistry = atom(() => new Map<string, QueryState<unknown>>());

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
  config: {
    initialData?: Value;
    ttl: number;
  },
) {
  const queries = useAtomRaw(queryRegistry)[0];

  let queryState = queries.get(key) as QueryState<Value> | undefined;

  if (!queryState) {
    const update$ = new Subject<Promise<Value>>();

    const value$: Observable<QueryResult<Value>> = update$.pipe(
      switchMap((promise) => {
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

    const querySelector = createQuerySelector(value$, key, config.initialData);

    queryState = { selector: querySelector, update$ };
    queries.set(key, queryState as QueryState<unknown>);
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
  config: {
    initialData?: Value;
    ttl: number;
  } = { ttl: 5000 },
): QueryRawResult<Value> {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, refetch } = useQueryState(key, fetcher, config);

  const [queryValue] = useAtomRaw(queryState.selector);

  useEffect(() => {
    startRequestIfNecessary(refetch, queryState, queryValue, config.ttl);
  }, [config.ttl, queryState, queryValue, refetch]);

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
  config: {
    initialData?: Value;
    ttl: number;
  } = { ttl: 5000 },
): [value: Value, refetch: () => Promise<Value>] {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, refetch } = useQueryState(key, fetcher, config);

  try {
    const [queryValue] = useAtom(queryState.selector);
    startRequestIfNecessary(refetch, queryState, queryValue, config.ttl);

    if (queryValue.error) {
      throw queryValue.error;
    }

    return [queryValue.value, refetch];
  } catch (promiseOrError) {
    if (promiseOrError instanceof Promise) {
      startRequestIfNecessary(refetch, queryState, EMPTY_VALUE, config.ttl);
    }
    throw promiseOrError;
  }
}
