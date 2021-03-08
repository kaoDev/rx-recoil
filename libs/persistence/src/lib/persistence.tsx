import { Subject } from 'rxjs';
import { distinctUntilChanged, scan, skipUntil } from 'rxjs/operators';
import { atom, EMPTY_TYPE, EMPTY_VALUE } from '@rx-recoil/core';
import type { AtomDefinition } from '@rx-recoil/core';

type StoredValue = string | null;

type ErrorReporter = (error: Error) => void;

const reportError = (report?: ErrorReporter) => (
  error: unknown,
  fallbackMessage: string
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

export interface Storage {
  getItem(key: string): StoredValue | Promise<StoredValue>;

  setItem(key: string, value: string): void | Promise<void>;

  removeItem(key: string): void | Promise<void>;
}

export interface PersistenceOptions<Value> {
  key: string;
  storage: Storage;
  version: number;
  fallbackValue: Value;
  serialize?: (value: Value) => string;
  deserialize?: (serialized: string, version: number) => Value;
  debugKey?: string;
  persistencePrefix?: string;
  report?: ErrorReporter;
}

export function persistedAtom<Value>({
  key,
  storage,
  fallbackValue,
  version,
  deserialize = DEFAULT_PERSISTENCE_DESERIALIZE,
  serialize = DEFAULT_PERSISTENCE_SERIALIZE,
  persistencePrefix = '__RX_RECOIL_STATE',
  report,
  debugKey,
}: PersistenceOptions<Value>): AtomDefinition<
  Value | typeof EMPTY_VALUE,
  Value
> {
  const storageKey = `${persistencePrefix}:${key}`;

  async function writeValueToStorage(newValue: Value) {
    try {
      const nextSerialized = serialize(newValue);
      const valueToSave: PersistedValue = {
        version,
        value: nextSerialized,
      };
      await storage.setItem(storageKey, JSON.stringify(valueToSave));
    } catch (error) {
      reportError(report)(error, `failed to store value for ${key}`);
    }
  }

  const mounted$ = new Subject<void>();
  const persistQueue = new Subject<Value>();

  const state = atom<Value | EMPTY_TYPE, Value>(EMPTY_VALUE, {
    update: (_, newValue) => {
      persistQueue.next(newValue);
      return newValue;
    },
    debugKey: `${debugKey}:state`,
  });

  state.onMount = async ({ set, get }) => {
    const persistenceSubscription = persistQueue
      .pipe(
        distinctUntilChanged(),
        scan((_, nextValue) => nextValue),
        skipUntil(mounted$)
      )
      .subscribe(writeValueToStorage);

    try {
      const rawString = await storage.getItem(storageKey);
      const currentValue = get(state);

      if (rawString != null) {
        const rawValue: PersistedValue = JSON.parse(rawString);
        const parsedValue = deserialize(rawValue.value, rawValue.version);
        set(state, parsedValue);
      } else if (currentValue === EMPTY_VALUE) {
        set(state, fallbackValue);
      }
    } catch (error) {
      reportError(report)(
        error,
        'failed to initialize persisted state from storage'
      );
      set(state, fallbackValue);
    }

    mounted$.next();

    return () => {
      persistenceSubscription.unsubscribe();
    };
  };

  return state;
}
