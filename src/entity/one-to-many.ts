import { createRelationDecorator, RelationOptions, RelationType } from './relation.ts';
import { Type } from '../shared/type.ts';

export function OneToMany(type: string, options?: RelationOptions): PropertyDecorator;
export function OneToMany<T>(type: (type: any) => Type<T>, options?: RelationOptions): PropertyDecorator;
export function OneToMany(type: string, inverse: string | ((type: any) => any)): PropertyDecorator;
export function OneToMany<T, K extends keyof T>(
  type: (type: any) => Type<T>,
  inverse: keyof T | string | ((type: T) => T[K]),
  options?: RelationOptions
): PropertyDecorator;
export function OneToMany<T, K extends keyof T>(
  type: string | ((type: any) => Type<T>),
  inverseOrOptions?: keyof T | string | ((type: T) => T[K]) | RelationOptions,
  options?: RelationOptions
): PropertyDecorator {
  if (!type) {
    throw new Error(`OneToMany relation must have a type`);
  }
  return createRelationDecorator<T, K>(RelationType.oneToMany, type, inverseOrOptions, options);
}
