import { MapTransformer } from './mapper.store.ts';

export function ignore<T>(): MapTransformer<T> {
  return undefined;
}

export function mapFrom<T>(callback: (entity: T) => any): MapTransformer<T> {
  return callback;
}
