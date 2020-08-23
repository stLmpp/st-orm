import { Type } from '../shared/type.ts';
import { isFunction } from 'is-what';

export type ForwardRefFn = () => Type;

export function forwardRef(callback: ForwardRefFn): ForwardRefFn {
  (callback as any).$__forwardRef__$ = true;
  return callback;
}

export function isForwardRef(value: any): value is ForwardRefFn {
  return isFunction(value) && value.$__forwardRef__$;
}

// TODO implement logic for circular dep
