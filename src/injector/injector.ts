import { Type } from '../shared/type.ts';
import { ReflectMetadata, ReflectMetadataTypes } from '../store/meta.ts';
import { isFunction } from 'is-what';
import { PARAM_INDEX_METADATA } from './inject.ts';
import { Provider } from './provider.ts';

export const CLASS_INJECTABLE_METADATA = '__CLASS_INJECTABLE_METADATA__';

export class Injector {
  static injectables = new Map<any, boolean>();

  static isInjectable(target: any): boolean {
    return Injector.injectables.has(target);
  }

  private _providers = new Map<any, Provider>();
  private _cache = new Map<any, any>();

  private resolveClass<T>(target: Type<T>): T {
    let params: Type[] = ReflectMetadata.getMetadata(ReflectMetadataTypes.paramTypes, target);
    const metaParams: { [key: number]: any } = ReflectMetadata.getMetadata(PARAM_INDEX_METADATA, target) ?? {};
    if (!params?.length) {
      const instance = new target();
      this._cache.set(target, instance);
      return instance;
    }
    params = params.map((param, index) => {
      return metaParams[index] ? metaParams[index] : param;
    });
    const injections = params.map(token => this.resolve(token));
    const instance = new target(...injections);
    this._cache.set(target, instance);
    return instance;
  }

  resolve<T>(target: Type<T>): T {
    if (this._cache.has(target)) {
      return this._cache.get(target);
    }
    const provider = this._providers.get(target);
    if (!provider) {
      throw new Error(
        `Can't inject ${target?.name ?? target} because there's no provider\nDid you forget to add the @Injectable()?`
      );
    }
    if (provider.class) {
      return this.resolveClass(provider.class);
    } else if (provider.value) {
      return provider.value;
    } else if (provider.factory) {
      if (!isFunction(provider.factory)) {
        throw new Error(`Provider for ${target?.name ?? target} uses a factory and it's not function`);
      }
      let injections: any[] = [];
      if (provider.deps?.length) {
        injections = provider.deps.map(token => this.resolve(token));
      }
      return provider.factory(...injections);
    }
    throw new Error(`Provider for ${target?.name ?? target} must have one of the 3 (factory, class or value)`);
  }

  get<T>(target: any): T {
    return this._cache.get(target);
  }

  addProvider(provider: Provider): this {
    if (this._providers.has(provider.provide)) {
      return this;
    }
    this._providers.set(provider.provide, provider);
    return this;
  }
}

export const injector = new Injector();

injector.addProvider({
  provide: Injector,
  value: injector,
});
