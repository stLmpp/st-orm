import { isArray, isPlainObject } from 'is-what';

export function flattenObject(object: any, separator = '.', parent = ''): Record<string, any> {
  if (!object || !isPlainObject(object)) {
    return object;
  }
  return Object.entries(object).reduce((acc: Record<any, any>, [key, value]) => {
    const newKey = `${parent ? parent + separator : ''}${key}`;
    if (isPlainObject(value)) {
      acc = { ...acc, ...flattenObject(value, separator, newKey) };
    } else if (isArray(value)) {
      acc[newKey] = value.map(val => flattenObject(val, separator, newKey));
    } else {
      acc[newKey] = value;
    }
    return acc;
  }, {});
}
