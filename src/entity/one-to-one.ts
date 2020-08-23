import { Type } from '../shared/type.ts';
import { createRelationDecorator, RelationOptions, RelationType } from './relation.ts';

export function OneToOne(type: string, options?: RelationOptions): PropertyDecorator;
export function OneToOne<T>(type: (type: any) => Type<T>, options?: RelationOptions): PropertyDecorator;
export function OneToOne(type: string, inverse: string | ((type: any) => any)): PropertyDecorator;
export function OneToOne<T, K extends keyof T>(
  type: (type: any) => Type<T>,
  inverse: keyof T | string | ((type: T) => T[K]),
  options?: RelationOptions
): PropertyDecorator;
export function OneToOne<T, K extends keyof T>(
  type: string | ((type: any) => Type<T>),
  inverseOrOptions?: keyof T | string | ((type: T) => T[K]) | RelationOptions,
  options?: RelationOptions
): PropertyDecorator {
  return createRelationDecorator<T, K>(RelationType.oneToOne, type, inverseOrOptions, options);
}
