import { Container } from './container.ts';
import { ROOT_CONTAINER_KEY } from '../config.ts';

export interface InjectableOptions {
  providedIn?: any;
}

export const INJECTABLE_OPTIONS_DEFAULT: InjectableOptions = {
  providedIn: ROOT_CONTAINER_KEY,
};

export function Injectable(options?: InjectableOptions): ClassDecorator {
  options = {
    ...INJECTABLE_OPTIONS_DEFAULT,
    ...options,
  };
  const container = Container.get(options.providedIn);
  return target => {
    if (container.injector.isInjectable(target)) {
      throw new Error(`Class "${target.name}" is already an injectable`);
    }
    container.injector.addProvider({
      provide: target,
      class: target as any,
    });
  };
}
