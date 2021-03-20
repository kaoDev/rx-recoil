import {
  atom,
  AtomDefinition,
  EMPTY_TYPE,
  EMPTY_VALUE,
  useAtomicState,
  useAtomRaw,
} from '@rx-recoil/core';
import { useEffect } from 'react';

interface ValidResult<Value> {
  value: Value;
  error?: undefined;
}
interface ErrorResult {
  value?: undefined;
  error: Error;
}
type QueryResult<Value> = ValidResult<Value> | ErrorResult | EMPTY_TYPE;
interface QueryState<Value> {
  result: QueryResult<Value>;
  timestamp: number;
  runningRequest?: Promise<Value>;
}

function createQueryAtom<Value>(key: string, initialValue?: Value) {
  return atom<QueryState<Value>, QueryState<Value>>(
    {
      result: initialValue ? { value: initialValue } : EMPTY_VALUE,
      timestamp: 0,
    },
    {
      volatile: true,
      debugKey: key,
    },
  );
}

type QueryAtom<Value> = AtomDefinition<QueryState<Value>, QueryState<Value>>;

const queryRegistry = atom(() => new Map<string, QueryAtom<unknown>>());

function useQueryState<Value>(
  key: string,
  config: {
    initialData?: Value;
    ttl: number;
  },
) {
  const queries = useAtomRaw(queryRegistry)[0];

  let queryAtom = queries.get(key) as QueryAtom<Value> | undefined;
  if (!queryAtom) {
    queryAtom = createQueryAtom<Value>(key, config.initialData);
    queries.set(key, queryAtom as QueryAtom<unknown>);
  }

  const queryStateHolder = useAtomicState(queryAtom);

  const queryState = queryStateHolder.useValue();

  return {
    queryState,
    dispatchUpdate: queryStateHolder.dispatchUpdate,
  };
}

function shouldFetch(queryState: QueryState<unknown>, ttl: number) {
  console.log('shouldFetch', !!queryState.runningRequest);
  if (!!queryState.runningRequest || Date.now() - queryState.timestamp < ttl) {
    return false;
  }

  return true;
}

function startRequestIfNecessary<Value>(
  key: string,
  fetcher: (key: string) => Promise<Value>,
  dispatchUpdate: (value: QueryState<Value>) => void,
  queryState: QueryState<Value>,
  ttl: number,
) {
  if (shouldFetch(queryState, ttl)) {
    const freshRequest = fetcher(key);
    queryState.runningRequest = freshRequest;

    dispatchUpdate({
      ...queryState,
    });

    freshRequest.then(
      (value) => {
        queryState.result = { value };
        queryState.timestamp = Date.now();
        queryState.runningRequest = undefined;
        dispatchUpdate({ ...queryState });
      },
      (error) => {
        queryState.result = { error };
        queryState.timestamp = Date.now();
        queryState.runningRequest = undefined;
        dispatchUpdate({ ...queryState });
      },
    );
  }
}

export function useQueryRaw<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  config: {
    initialData?: Value;
    ttl: number;
  } = { ttl: 5000 },
) {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, dispatchUpdate } = useQueryState(key, config);

  useEffect(() => {
    startRequestIfNecessary(
      key,
      fetcher,
      dispatchUpdate,
      queryState,
      config.ttl,
    );
  }, [
    config.ttl,
    fetcher,
    key,
    queryState,
    queryState.runningRequest,
    dispatchUpdate,
  ]);

  if (queryState.result === EMPTY_VALUE) {
    return { data: undefined, loading: true, error: undefined };
  }

  return {
    data: queryState.result.value,
    loading: false,
    error: queryState.result.error,
  };
}

export function useQuery<Value>(
  queryId: string | (() => string),
  fetcher: (key: string) => Promise<Value>,
  config: {
    initialData?: Value;
    ttl: number;
  } = { ttl: 5000 },
) {
  const key = typeof queryId !== 'string' ? queryId() : queryId;
  const { queryState, dispatchUpdate } = useQueryState(key, config);

  if (!queryState.runningRequest) {
    startRequestIfNecessary(
      key,
      fetcher,
      dispatchUpdate,
      queryState,
      config.ttl,
    );
  }

  if (queryState.result === EMPTY_VALUE) {
    console.log('empty');
    if (queryState.runningRequest) {
      console.log('throw running request');
      throw queryState.runningRequest;
    }

    throw new Error('Failed to start request');
  }

  if (queryState.result.error) {
    throw queryState.result.error;
  }

  return queryState.result.value;
}
