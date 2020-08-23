import * as _classTransformer from 'https://dev.jspm.io/class-transformer';
import { Type } from '../shared/type.ts';
const classTransformer = _classTransformer.default as any;

export interface TargetMap {
  target: any;
  properties: { [key: string]: any };
}

export interface ClassTransformOptions {
  strategy?: 'excludeAll' | 'exposeAll';
  excludeExtraneousValues?: boolean;
  groups?: string[];
  version?: number;
  excludePrefixes?: string[];
  ignoreDecorators?: boolean;
  targetMaps?: TargetMap[];
  enableCircularCheck?: boolean;
  enableImplicitConversion?: boolean;
  exposeDefaultValues?: boolean;
}

export function classToPlain<T>(object: T, options?: ClassTransformOptions): Record<string, any>;
export function classToPlain<T>(object: T[], options?: ClassTransformOptions): Record<string, any>[];
export function classToPlain<T>(
  object: T | T[],
  options?: ClassTransformOptions
): Record<string, any> | Record<string, any>[] {
  return classTransformer.classToPlain(object, options);
}
export function classToPlainFromExist<T>(
  object: T,
  plainObject: Record<string, any>,
  options?: ClassTransformOptions
): Record<string, any>;
export function classToPlainFromExist<T>(
  object: T,
  plainObjects: Record<string, any>[],
  options?: ClassTransformOptions
): Record<string, any>[];
export function classToPlainFromExist<T>(
  object: T,
  plainObject: Record<string, any> | Record<string, any>[],
  options?: ClassTransformOptions
): Record<string, any> | Record<string, any>[] {
  return classTransformer.classToPlainFromExist(object, plainObject, options);
}
export function plainToClass<T, V>(cls: Type<T>, plain: V[], options?: ClassTransformOptions): T[];
export function plainToClass<T, V>(cls: Type<T>, plain: V, options?: ClassTransformOptions): T;
export function plainToClass<T, V>(cls: Type<T>, plain: V | V[], options?: ClassTransformOptions): T | T[] {
  return classTransformer.plainToClass(cls, plain as any, options);
}
export function plainToClassFromExist<T, V>(clsObject: T[], plain: V[], options?: ClassTransformOptions): T[];
export function plainToClassFromExist<T, V>(clsObject: T, plain: V, options?: ClassTransformOptions): T;
export function plainToClassFromExist<T, V>(clsObject: T, plain: V | V[], options?: ClassTransformOptions): T | T[] {
  return classTransformer.plainToClassFromExist(clsObject, plain, options);
}
export function classToClass<T>(object: T, options?: ClassTransformOptions): T;
export function classToClass<T>(object: T[], options?: ClassTransformOptions): T[];
export function classToClass<T>(object: T | T[], options?: ClassTransformOptions): T | T[] {
  return classTransformer.classToClass(object, options);
}
export function classToClassFromExist<T>(object: T, fromObject: T, options?: ClassTransformOptions): T;
export function classToClassFromExist<T>(object: T, fromObjects: T[], options?: ClassTransformOptions): T[];
export function classToClassFromExist<T>(object: T, fromObject: T | T[], options?: ClassTransformOptions): T | T[] {
  return classTransformer.classToClassFromExist(object, fromObject, options);
}
