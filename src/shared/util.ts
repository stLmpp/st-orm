import { ReflectMetadata } from '../store/meta.ts';
import { createHash } from 'hash';
import { Type } from './type.ts';
import { isFunction, isAnyObject } from 'is-what';

export function applyDecorators(...decorators: Array<PropertyDecorator | MethodDecorator>): any {
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
