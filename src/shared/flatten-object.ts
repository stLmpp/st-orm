import { isArray, isDate, isPlainObject, isPrimitive } from 'is-what';

export function flattenObject(object: any, separator = '.', parent = ''): any {
  if (!object || !isPlainObject(object)) {
    return object;
  }
  return Object.entries(object).reduce((acc: Record<any, any>, [key, value]) => {
    const newKey = `${parent ? parent + separator : ''}${key}`;
    if (isPlainObject(value)) {
      acc = { ...acc, ...flattenObject(value, separator, newKey) };
    } else if (isArray(value)) {
      acc[newKey] = value.map(val => flattenObject(val, separator, newKey));
    } else if (isPrimitive(value)) {
      acc[newKey] = value;
    } else if (isDate(value)) {
      acc[newKey] = value;
    }
    return acc;
  }, {});
}
