import { StMap } from '../shared/map.ts';
import { Type } from '../shared/type.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { isArray, isFunction } from 'is-what';
import { plainToClass } from '../node-libs/class-transformer.ts';
import { isKeyof } from '../shared/util.ts';
import { camelCase } from 'case';

export type MapTransformer<T, ToType = any> = ((entity: T) => ToType) | undefined;

export class MapProfile<From, To> {
  constructor(fromEntity: Type<From>, toEntity: Type<To>, fromMetadata: EntityMetadata, toMetadata: EntityMetadata) {
    this.#fromEntity = fromEntity;
    this.#fromMetadata = fromMetadata;
    this.#toEntity = toEntity;
    this.#toMetadata = toMetadata;
    this.includeDefault();
  }

  #fromMetadata: EntityMetadata;
  readonly #fromEntity: Type<From>;
  #toMetadata: EntityMetadata;
  readonly #toEntity: Type<To>;

  #properties = new StMap<string, MapTransformer<From>>();
  #flatten: ((from: From, to: To) => To)[] = [];

  private includeDefault(): void {
    const fromProperties = Object.values(this.#fromMetadata.columnProperties!);
    const toProperties = Object.values(this.#toMetadata.columnProperties!);
    const intersection = fromProperties.filter(from => toProperties.includes(from));
    for (const prop of intersection) {
      this.#properties.set(prop, entity => (entity as any)[prop]);
    }
    this.updateStore();
  }

  for<KeyTo extends keyof To, KeyFrom extends keyof From>(
    callback: (entity: To) => To[KeyTo],
    operator: MapTransformer<From>
  ): this;
  for<KeyTo extends keyof To, KeyFrom extends keyof From>(to: KeyTo, from: KeyFrom): this;
  for<KeyTo extends keyof To, KeyFrom extends keyof From>(
    to: ((entity: To) => To[KeyTo]) | KeyTo,
    from: MapTransformer<From> | KeyFrom
  ): this {
    const toProp = (isFunction(to) ? to(this.#toMetadata.columnProperties as any) : to) as string;
    const fromCallback = isKeyof<From>(from) ? (entity: From) => entity[from as KeyFrom] : from;
    this.#properties.set(toProp, fromCallback);
    return this.updateStore();
  }

  flatten<KeyFrom extends keyof From>(callback: (entity: From) => From[KeyFrom]): this {
    this.#flatten.push((from, to) => {
      const fromName = callback(this.#fromMetadata.relationProperties as any);
      const prop = callback(from);
      if (prop) {
        to = {
          ...to,
          ...Object.entries(prop).reduce((acc, [key, value]) => {
            return {
              ...acc,
              [camelCase(`${key}_${fromName}`)]: value,
            };
          }, {} as To),
        };
      }
      return to;
    });
    return this;
  }

  map(value: From): To;
  map(value: From[]): To[];
  map(value: From | From[]): To | To[] {
    if (isArray(value)) {
      return value.map(v => this._mapOne(v));
    } else {
      return this._mapOne(value);
    }
  }

  private _mapOne(value: From): To {
    let plain = this.#properties.reduce((acc, [key, transform]) => {
      if (transform) {
        return { ...acc, [key]: transform(value) };
      }
      return acc;
    }, {});
    for (const flat of this.#flatten) {
      plain = flat(value, plain as To);
    }
    return plainToClass(this.#toEntity, plain);
  }

  private updateStore(): this {
    mapperStore.upsert(this.#toEntity, state => {
      return state.upsert(this.#fromEntity, this);
    });
    return this;
  }
}

export const mapperStore = new StMap<Type, StMap<Type, MapProfile<any, any>>>(() => new StMap());
