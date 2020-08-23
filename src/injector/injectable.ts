import { injector, Injector } from './injector.ts';

export function Injectable(): ClassDecorator {
  return target => {
    if (Injector.isInjectable(target)) {
      throw new Error(`Class "${target.name}" is already an injectable`);
    }
    Injector.injectables.set(target, true);
    injector.addProvider({
      provide: target,
      class: target as any,
    });
  };
}
