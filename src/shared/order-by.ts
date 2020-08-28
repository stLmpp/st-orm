import { OrderByDirection } from '../query-builder/query-builder.ts';
import { isArray, isNullOrUndefined, isString } from 'is-what';

type Comparator<T = any> = (valueA: T, valueB: T) => number;

const COMPARATOR = {
  string(valueA: string, valueB: string): number {
    return valueA.toString().localeCompare(valueB.toString());
  },
  number(valueA: number, valueB: number): number {
    return valueA - valueB;
  },
  date(valueA: Date, valueB: Date): number {
    return +valueA - +valueB;
  },
  boolean(valueA: boolean, valueB: boolean): number {
    return +valueA - +valueB;
  },
  default(valueA: any, valueB: any): number {
    return valueA.toString().localeCompare(valueB.toString());
  },
};

type Swapper = (valueA: any, valueB: any) => [any, any];

function swapperFactory(order?: OrderByDirection): Swapper {
  return order === OrderByDirection.desc
    ? (valueA: any, valueB: any) => [valueB, valueA]
    : (valueA: any, valueB: any) => [valueA, valueB];
}

function comparatorFactory(sample: any, order?: OrderByDirection): Comparator {
  const type = typeof sample;
  const swapper = swapperFactory(order);
  if (type in COMPARATOR) {
    return (valueA: any, valueB: any) => {
      if (isNullOrUndefined(valueA)) return 1;
      if (isNullOrUndefined(valueB)) return -1;
      const [a, b] = swapper(valueA, valueB);
      return (COMPARATOR as any)[type](a, b);
    };
  } else {
    return (valueA: any, valueB: any) => {
      if (isNullOrUndefined(valueA)) return 1;
      if (isNullOrUndefined(valueB)) return -1;
      const [a, b] = swapper(valueA, valueB);
      return COMPARATOR.default(a, b);
    };
  }
}

export function getSample<T, K extends keyof T>(array: T[], key: K, until = 10): T[K] | undefined {
  if (!isNullOrUndefined(array[0][key])) {
    return array[0][key];
  }
  const len = array.length > until ? until : array.length;
  for (let i = 0; i < len; i++) {
    if (!isNullOrUndefined(array[i][key])) {
      return array[i][key];
    }
  }
  return undefined;
}

export function orderBy<T, K extends keyof T>(array: T[], key: K, order?: OrderByDirection): T[];
export function orderBy<T, K extends keyof T>(array: T[], keys: K[], orders?: OrderByDirection[]): T[];
export function orderBy<T, K extends keyof T>(
  array: T[],
  key: K | K[],
  order?: OrderByDirection | OrderByDirection[]
): T[];
export function orderBy<T, K extends keyof T>(
  array: T[],
  key: K | K[],
  order?: OrderByDirection | OrderByDirection[]
): T[] {
  if (!array?.length || !key) {
    return array;
  }
  array = [...array];
  if (isString(key) && (isString(order) || isNullOrUndefined(order))) {
    const sample = getSample(array, key as keyof T);
    const comparator = comparatorFactory(sample, order);
    return array.sort((valueA, valueB) => {
      return comparator(valueA[key as keyof T], valueB[key as keyof T]);
    });
  } else if (isArray(key) && (isArray(order) || isNullOrUndefined(order))) {
    if (!key.length) {
      return array;
    }
    key = [...new Set(key)];
    const newOrder = order ?? [];
    const multiple: [keyof T, Comparator][] = key.map((k, i) => {
      const sample = getSample(array, k as keyof T);
      const comparator = comparatorFactory(sample, newOrder[i]);
      return [k, comparator];
    });
    return array.sort((valueA, valueB) => {
      for (const [k, comparator] of multiple) {
        if (valueA[k] !== valueB[k]) {
          return comparator(valueA[k], valueB[k]);
        }
      }
      return 0;
    });
  } else {
    return array.sort();
  }
}
