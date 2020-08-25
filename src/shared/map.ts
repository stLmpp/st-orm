import { isFunction } from 'is-what';

export class StMap<S, T> extends Map<S, T> {
  static defaultMerger = (a: any, b: any): any => ({ ...a, ...b });

  constructor(
    private _defaultValueFactory: () => T = () => ({} as any),
    private _merger: (oldEntry: T, newEntry: T | Partial<T>) => T = StMap.defaultMerger
  ) {
    super();
  }

  getOrCreate(key: S): T {
    if (!this.has(key)) {
      this.set(key, this._defaultValueFactory());
      return this.get(key)!;
    } else {
      return this.get(key)!;
    }
  }

  update(key: S, value: Partial<T>): this;
  update(key: S, callback: (entry: T) => T): this;
  update(key: S, valueOrCallback: Partial<T> | ((entry: T) => T)): this;
  update(key: S, valueOrCallback: Partial<T> | ((entry: T) => T)): this {
    if (!this.has(key)) {
      return this;
    }
    const callback = isFunction(valueOrCallback) ? valueOrCallback : (entry: T) => this._merger(entry, valueOrCallback);
    const entry = this.getOrCreate(key);
    const newEntry = callback(entry);
    this.set(key, newEntry);
    return this;
  }

  upsert(key: S, value: T): this;
  upsert(key: S, partial: Partial<T>): this;
  upsert(key: S, callback: (entry: T) => T): this;
  upsert(key: S, valueOrPartialOrCallback: T | Partial<T> | ((entry: T) => T)): this;
  upsert(key: S, valueOrPartialOrCallback: T | Partial<T> | ((entry: T) => T)): this {
    if (!this.has(key)) {
      const callback = isFunction(valueOrPartialOrCallback)
        ? valueOrPartialOrCallback
        : (entry: T) => this._merger(entry, valueOrPartialOrCallback);
      const entry = this.getOrCreate(key);
      const newEntry = callback(entry);
      this.set(key, newEntry);
    } else {
      this.update(key, valueOrPartialOrCallback);
    }
    return this;
  }

  filter(callback: (key: S, entity: T) => boolean): StMap<S, T> {
    const stMap = new StMap<S, T>(this._defaultValueFactory, this._merger);
    for (const [key, entity] of this) {
      if (callback(key, entity)) {
        stMap.set(key, entity);
      }
    }
    return stMap;
  }

  map(callback: (key: S, entity: T) => T): StMap<S, T> {
    const stMap = new StMap<S, T>(this._defaultValueFactory, this._merger);
    for (const [key, entity] of this) {
      stMap.set(key, callback(key, entity));
    }
    return stMap;
  }

  find(callback: (key: S, entry: T) => boolean): [S, T] | undefined {
    for (const [key, entry] of this) {
      if (callback(key, entry)) {
        return [key, entry];
      }
    }
    return undefined;
  }

  some(callback: (key: S, entry: T) => boolean): boolean {
    for (const [key, entry] of this) {
      if (callback(key, entry)) {
        return true;
      }
    }
    return false;
  }

  every(callback: (key: S, entry: T) => boolean): boolean {
    for (const [key, entry] of this) {
      if (!callback(key, entry)) {
        return false;
      }
    }
    return true;
  }

  reduce<R>(callback: (accumulator: R, item: [S, T]) => R, initialValue: R): R {
    let acc = initialValue;
    for (const pair of this) {
      acc = callback(acc, pair);
    }
    return acc;
  }

  first(): [S, T] | undefined {
    return [...this.entries()]?.[0];
  }

  last(): [S, T] | undefined {
    return [...this.entries()]?.[this.size - 1];
  }
}
