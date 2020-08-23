import { createRelationDecorator, RelationOptions, RelationType } from './relation.ts';
import { Type } from '../shared/type.ts';

export function ManyToOne(type: string, options?: RelationOptions): PropertyDecorator;
export function ManyToOne<T>(type: (type: any) => Type<T>, options?: RelationOptions): PropertyDecorator;
export function ManyToOne(type: string, inverse: string | ((type: any) => any)): PropertyDecorator;
export function ManyToOne<T, K extends keyof T>(
  type: (type: any) => Type<T>,
  inverse: keyof T | string | ((type: T) => T[K]),
  options?: RelationOptions
): PropertyDecorator;
export function ManyToOne<T, K extends keyof T>(
  type: string | ((type: any) => Type<T>),
  inverseOrOptions?: keyof T | string | ((type: T) => T[K]) | RelationOptions,
  options?: RelationOptions
): PropertyDecorator {
  return createRelationDecorator<T, K>(RelationType.manyToOne, type, inverseOrOptions, options);
}
