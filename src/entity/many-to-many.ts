import { createRelationDecorator, RelationOptions, RelationType } from './relation.ts';
import { Type } from '../shared/type.ts';

export function ManyToMany(type: string, options?: RelationOptions): PropertyDecorator;
export function ManyToMany<T>(type: (type: any) => Type<T>, options?: RelationOptions): PropertyDecorator;
export function ManyToMany(type: string, inverse: string | ((type: any) => any)): PropertyDecorator;
export function ManyToMany<T, K extends keyof T>(
  type: (type: any) => Type<T>,
  inverse: keyof T | string | ((type: T) => T[K]),
  options?: RelationOptions
): PropertyDecorator;
export function ManyToMany<T, K extends keyof T>(
  type: string | ((type: any) => Type<T>),
  inverseOrOptions?: keyof T | string | ((type: T) => T[K]) | RelationOptions,
  options?: RelationOptions
): PropertyDecorator {
  if (!type) {
    throw new Error(`ManyToMany relation must have a type`);
  }
  return createRelationDecorator<T, K>(RelationType.manyToMany, type, inverseOrOptions, options);
}
