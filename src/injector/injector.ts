import { Type } from '../shared/type.ts';
import { ReflectMetadata, ReflectMetadataTypes } from '../store/meta.ts';
import { isFunction } from 'is-what';
import { PARAM_INDEX_METADATA } from './inject.ts';
import { Provider } from './provider.ts';
import { StMap } from '../shared/map.ts';

export class Injector {
  #providers = new StMap<any, Provider>();
  #cache = new StMap<any, any>();

  private resolveClass<T>(target: Type<T>): T {
    let params: Type[] = ReflectMetadata.getMetadata(ReflectMetadataTypes.paramTypes, target);
    const metaParams: { [key: number]: any } = ReflectMetadata.getMetadata(PARAM_INDEX_METADATA, target) ?? {};
    if (!params?.length) {
      const instance = new target();
      this.#cache.set(target, instance);
      return instance;
    }
    params = params.map((param, index) => {
      return metaParams[index] ? metaParams[index] : param;
    });
    const injections = params.map(token => this.resolve(token));
    const instance = new target(...injections);
    this.#cache.set(target, instance);
    return instance;
  }

  resolve<T>(target: Type<T>): T;
  resolve<T>(target: any): T;
  resolve<T>(target: Type<T> | any): T {
    if (this.#cache.has(target)) {
      return this.#cache.get(target);
    }
    const provider = this.#providers.get(target);
    if (!provider) {
      throw new Error(
        `Can't inject ${target?.name ?? target} because there's no provider\nDid you forget to add the @Injectable()?`
      );
    }
    if (provider.class) {
      return this.resolveClass(provider.class);
    } else if (provider.value) {
      this.#cache.set(target, provider.value);
      return provider.value;
    } else if (provider.factory) {
      if (!isFunction(provider.factory)) {
        throw new Error(`Provider for ${target?.name ?? target} uses a factory and it's not function`);
      }
      let injections: any[] = [];
      if (provider.deps?.length) {
        injections = provider.deps.map(token => this.resolve(token));
      }
      const instance = provider.factory(...injections);
      this.#cache.set(target, instance);
      return instance;
    }
    throw new Error(`Provider for ${target?.name ?? target} must have one of the 3 (factory, class or value)`);
  }

  get<T>(target: Type<T>): T {
    return this.#cache.get(target);
  }

  addProvider(provider: Provider): this {
    if (this.#providers.has(provider.provide)) {
      return this;
    }
    this.#providers.set(provider.provide, provider);
    return this;
  }

  isInjectable(key: any): boolean {
    return this.#providers.has(key);
  }
}
