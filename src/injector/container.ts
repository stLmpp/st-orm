import { Injector } from './injector.ts';
import { StMap } from '../shared/map.ts';

export class Container {
  static constainers = new StMap<any, Container>();

  static create(key: any): Container {
    return Container.constainers.setAndGet(key, new Container());
  }

  static get(key: any): Container {
    return Container.constainers.getOrFail(key);
  }

  constructor() {
    this.#injector = new Injector();
    this.#injector.addProvider({
      provide: Injector,
      value: this.#injector,
    });
  }

  readonly #injector: Injector;

  get injector(): Injector {
    return this.#injector;
  }
}
