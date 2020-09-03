import { ReflectMetadata } from '../store/meta.ts';
import { createHash } from 'hash';
import { Type } from './type.ts';
import { isAnyObject, isFunction, isPlainObject, isString } from 'is-what';
import { StMap } from './map.ts';

export function applyDecorators(...decorators: any[]): any {
  return (target: any, propertyKey: string | symbol, arg2: any) => {
    ReflectMetadata.decorate(decorators, target, propertyKey, arg2);
  };
}

export function sha1(str: string): string {
  const hash = createHash('sha1');
  hash.update(str);
  return hash.toString();
}

export function isType(value: any): value is Type {
  return isFunction(value) && /^class /.test(Function.prototype.toString.call(value));
}

export function isEqualObject(objA: any, objB: any): boolean {
  return Object.entries(objA).every(([key, value]) => objB[key] === value);
}

export function isObjectEmpty(value: any): value is Record<never, never> {
  return isAnyObject(value) && !Object.keys(value).length;
}

export function isArrayEqual(valueA: any[] | undefined, valueB: any[] | undefined): boolean {
  if (!valueA || !valueB || valueA?.length !== valueB?.length) {
    return false;
  }
  return valueA.every((val, index) => val === valueB[index]);
}

export function uniqWith<T>(array: T[], comparator: (valueA: T, valueB: T) => boolean): T[] {
  if (!array?.length) {
    return [];
  }
  const set = new Set<number>();
  const len = array.length;
  for (let i = 0; i < len; i++) {
    for (let j = i + 1; j < len; j++) {
      const valueA = array[i];
      const valueB = array[j];
      if (comparator(valueA, valueB)) {
        set.add(i);
        break;
      }
    }
  }
  return array.filter((_, index) => !set.has(index));
}

export function groupBy<T, K extends keyof T>(array: T[], key: K): StMap<T[K], T[]> {
  return array.reduce(
    (acc, item) => {
      return acc.upsert(item[key], items => {
        return [...(items ?? []), item];
      });
    },
    new StMap<T[K], T[]>(() => [])
  );
}

export function groupWith<T>(array: T[], callback: (entry: T) => any): StMap<any, T[]> {
  return array.reduce(
    (acc, item) => {
      return acc.upsert(callback(item), items => [...(items ?? []), item]);
    },
    new StMap<any, T[]>(() => [])
  );
}

export function isKeyof<T>(value: any): value is keyof T {
  return isString(value);
}

export function random(max = 0, min = 0): number {
  return Math.random() * (max - min) + min;
}

export function cloneArrayShallow<T>(array: T[]): T[] {
  if (!array?.length) {
    return array;
  }
  const isObject = isPlainObject(array[0]);
  array = [...array];
  if (isObject) {
    return array.map(value => ({ ...value }));
  } else {
    return array;
  }
}

export function takeRight<T>(array: T[], n = 1): T[] {
  if (!array?.length) {
    return [];
  }
  n = array.length - n;
  return array.slice(n < 0 ? 0 : n, array.length);
}
