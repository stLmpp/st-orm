import { ReflectMetadata } from '../store/meta.ts';

export const PARAM_INDEX_METADATA = '__PARAM_INDEX_METADATA__';

export function Inject(token: any): ParameterDecorator {
  return (target, propertyKey, parameterIndex) => {
    let meta = ReflectMetadata.getMetadata(PARAM_INDEX_METADATA, target) ?? {};
    meta = {
      ...meta,
      [parameterIndex]: token,
    };
    ReflectMetadata.defineMetadata(PARAM_INDEX_METADATA, meta, target);
  };
}
