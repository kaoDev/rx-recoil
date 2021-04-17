import { Subject } from 'rxjs';
import { distinctUntilChanged, scan, skipUntil } from 'rxjs/operators';
import { atom, EMPTY_TYPE, EMPTY_VALUE, AtomDefinition } from '@rx-recoil/core';

type StoredValue = string | null;

type ErrorReporter = (error: Error) => void;

const reportError = (report?: ErrorReporter) => (
  error: unknown,
  fallbackMessage: string,
) => {
  if (error instanceof Error) {
    report?.(error);
    return;
  }
  report?.(new Error(fallbackMessage));
};

interface PersistedValue {
  version: number;
  value: string;
}

function DEFAULT_PERSISTENCE_SERIALIZE<V>(value: V) {
  return JSON.stringify(value);
}
function DEFAULT_PERSISTENCE_DESERIALIZE<V>(value: string) {
  return JSON.parse(value) as V;
}

export interface StorageAccess {
  getItem(key: string): StoredValue | Promise<StoredValue>;

  setItem(key: string, value: string): void | Promise<void>;
}

export interface PersistentCache<Value> {
  getItem(): Value | Promise<Value>;
  setItem(value: Value): void;
}

export interface PersistentCacheConfig<Value> {
  key: string;
  storage: StorageAccess;
  version: number;
  fallbackValue: Value;
  serialize?: (value: Value) => string;
  deserialize?: (serialized: string, version: number) => Value;
  debugKey?: string;
  persistencePrefix?: string;
  report?: ErrorReporter;
}

export function createPersistentCache<Value>({
  key,
  storage,
  fallbackValue,
  version,
  deserialize = DEFAULT_PERSISTENCE_DESERIALIZE,
  serialize = DEFAULT_PERSISTENCE_SERIALIZE,
  persistencePrefix = '__RX_RECOIL_STATE',
  report,
}: PersistentCacheConfig<Value>): PersistentCache<Value> {
  const storageKey = `${persistencePrefix}:${key}`;

  let state: Value | EMPTY_TYPE = EMPTY_VALUE;

  function setItem(newValue: Value) {
    try {
      const nextSerialized = serialize(newValue);
      const valueToSave: PersistedValue = {
        version,
        value: nextSerialized,
      };
      state = newValue;
      return storage.setItem(storageKey, JSON.stringify(valueToSave));
    } catch (error) {
      reportError(report)(error, `failed to store value for ${key}`);
    }
  }

  function getItem() {
    if (state !== EMPTY_VALUE) {
      return state;
    }

    return Promise.all([storage.getItem(storageKey)]).then(([rawString]) => {
      if (rawString != null) {
        const rawValue: PersistedValue = JSON.parse(rawString);
        return deserialize(rawValue.value, rawValue.version);
      }

      return fallbackValue;
    });
  }

  return { getItem, setItem };
}

export interface PersistenceOptions<Value>
  extends PersistentCacheConfig<Value> {
  debugKey?: string;
}

export function persistedAtom<Value>(
  config: PersistenceOptions<Value>,
): AtomDefinition<Value | EMPTY_TYPE, Value> {
  const storageAccess = createPersistentCache(config);

  return persistedAtomFromStoreAccess(storageAccess, config);
}

export function persistedAtomFromStoreAccess<Value>(
  storageAccess: PersistentCache<Value>,
  config?: {
    debugKey?: string;
    report?: ErrorReporter;
    fallbackValue?: Value;
  },
): AtomDefinition<Value | EMPTY_TYPE, Value> {
  const mounted$ = new Subject<void>();
  const persistQueue = new Subject<Value>();

  const state = atom<Value | EMPTY_TYPE, Value>(EMPTY_VALUE, {
    update: (_, newValue) => {
      persistQueue.next(newValue);
      return newValue;
    },
    debugKey: config?.debugKey,
  });

  state.onMount = async ({ set }) => {
    const persistenceSubscription = persistQueue
      .pipe(
        distinctUntilChanged(),
        scan((_, nextValue) => nextValue),
        skipUntil(mounted$),
      )
      .subscribe(storageAccess.setItem);

    try {
      const initialValue = await storageAccess.getItem();

      set(state, initialValue);
    } catch (error) {
      reportError(config?.report)(
        error,
        'failed to initialize persisted state from storage',
      );
      if (config?.fallbackValue) {
        set(state, config.fallbackValue);
      }
    }

    mounted$.next();
    return () => {
      persistenceSubscription.unsubscribe();
    };
  };

  return state;
}
