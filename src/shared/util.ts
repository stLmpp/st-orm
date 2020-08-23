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
