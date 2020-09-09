import { isArray, isPlainObject, isFunction } from 'is-what';

export interface FlattenObjectOptions {
  separator: string;
  parent: string;
  exclude?: string[] | ((key: string, value: any) => boolean);
  include?: string[] | ((key: string, value: any) => boolean);
}

export const FLATTEN_OBJECT_DEFAULT_OPTIONS: FlattenObjectOptions = {
  separator: '.',
  parent: '',
  exclude: [],
  include: [],
};

export function flattenObject(object: any, options?: Partial<FlattenObjectOptions>): Record<string, any> {
  if (!object || !isPlainObject(object)) {
    return object;
  }
  options = { ...FLATTEN_OBJECT_DEFAULT_OPTIONS, ...options };
  const { parent, separator, include, exclude } = options;
  return Object.entries(object).reduce((acc: Record<any, any>, [key, value]) => {
    const newKey = `${parent ? parent + separator : ''}${key}`;
    if (
      (isFunction(exclude) && exclude(key, value)) ||
      (isFunction(include) && !include(key, value)) ||
      (isArray(exclude) && exclude.length && exclude.includes(key)) ||
      (isArray(include) && include.length && !include.includes(key))
    ) {
      return { ...acc, [newKey]: value };
    }
    if (isPlainObject(value)) {
      acc = { ...acc, ...flattenObject(value, { ...options, parent: newKey }) };
    } else if (isArray(value)) {
      acc[newKey] = value.map(val => flattenObject(val, { ...options, parent: newKey }));
    } else {
      acc[newKey] = value;
    }
    return acc;
  }, {});
}
