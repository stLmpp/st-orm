export const ReflectMetadata: ReflectMetadata = Reflect as any;

interface ReflectMetadata {
  decorate(decorators: ClassDecorator[], target: any): any;
  decorate(
    decorators: (PropertyDecorator | MethodDecorator)[],
    target: any,
    targetKey: string | symbol,
    descriptor?: PropertyDescriptor
  ): PropertyDescriptor;
  metadata(
    metadataKey: any,
    metadataValue: any
  ): { (target: any): void; (target: any, targetKey: string | symbol): void };
  defineMetadata(metadataKey: any, metadataValue: any, target: any): void;
  defineMetadata(metadataKey: any, metadataValue: any, target: any, targetKey: string | symbol): void;
  hasMetadata(metadataKey: any, target: any): boolean;
  hasMetadata(metadataKey: any, target: any, targetKey: string | symbol): boolean;
  hasOwnMetadata(metadataKey: any, target: any): boolean;
  hasOwnMetadata(metadataKey: any, target: any, targetKey: string | symbol): boolean;
  getMetadata(metadataKey: any, target: any): any;
  getMetadata(metadataKey: any, target: any, targetKey: string | symbol): any;
  getOwnMetadata(metadataKey: any, target: any): any;
  getOwnMetadata(metadataKey: any, target: any, targetKey: string | symbol): any;
  getMetadataKeys(target: any): any[];
  getMetadataKeys(target: any, targetKey: string | symbol): any[];
  getOwnMetadataKeys(target: any): any[];
  getOwnMetadataKeys(target: any, targetKey: string | symbol): any[];
  deleteMetadata(metadataKey: any, target: any): boolean;
  deleteMetadata(metadataKey: any, target: any, targetKey: string | symbol): boolean;
}

export enum ReflectMetadataTypes {
  designType = 'design:type',
  paramTypes = 'design:paramtypes',
  returnType = 'design:returntype',
}
