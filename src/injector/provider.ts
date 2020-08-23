import { Type } from '../shared/type.ts';

export interface Provider {
  provide: any;
  factory?: (...args: any[]) => any;
  class?: Type;
  value?: any;
  deps?: any[];
}
