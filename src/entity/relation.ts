import { Type } from '../shared/type.ts';
import { JoinColumnOptions } from './join-column.ts';
import { ReflectMetadata, ReflectMetadataTypes } from '../store/meta.ts';
import { entityStore } from '../store/entity-store.ts';
import { isAnyObject, isString, isFunction } from 'is-what';
import { JoinTableOptions } from './join-table.ts';

export enum RelationDefinition {
  restrict = 'reference',
  cascade = 'cascade',
  setNull = 'set null',
  noAction = 'no action',
  setDefault = 'set default',
}

export enum RelationCascade {
  insert,
  update,
  remove,
}

export interface RelationOptions {
  onDelete?: RelationDefinition;
  onUpdate?: RelationDefinition;
  nullable?: boolean;
  lazy?: boolean;
  eager?: boolean;
  persist?: boolean;
  primary?: boolean;
  cascade?: boolean | RelationCascade[];
}

export enum RelationType {
  oneToOne,
  manyToOne,
  oneToMany,
  manyToMany,
}

export interface RelationMetadata extends RelationOptions {
  propertyKey: string;
  type: RelationType;
  reference: string | Type;
  referenceFn?: (type: any) => Type;
  referenceType?: Type;
  inverse?: (type: any) => any;
  joinColumns?: JoinColumnOptions[];
  joinTables?: JoinTableOptions[];
  owner?: boolean;
}

export function createRelationDecorator<T, K extends keyof T>(
  relationType: RelationType,
  type?: string | ((type: any) => Type<T>),
  inverseOrOptions?: keyof T | string | ((type: T) => T[K]) | RelationOptions,
  options?: RelationOptions
): PropertyDecorator {
  options = { ...options };
  return (target, propertyKey) => {
    let inverse: any;
    if (isAnyObject(inverseOrOptions)) {
      options = { ...options, ...inverseOrOptions };
    } else if (inverseOrOptions) {
      inverse = inverseOrOptions;
    }
    if (!type) {
      type = ReflectMetadata.getMetadata(ReflectMetadataTypes.designType, target, propertyKey);
      if (!type || Array === (type as any)) {
        throw new Error(
          `Could not figure out the type, please specify type of relation ${
            target.constructor.name
          } - ${propertyKey.toString()}`
        );
      }
    }
    const metadata: RelationMetadata = {
      propertyKey: propertyKey.toString(),
      type: relationType,
      reference: isString(type) ? type : type(undefined),
      inverse: isString(inverse) ? value => value[inverse] : inverse,
      referenceFn: isFunction(type) ? type : undefined,
    };
    entityStore.upsertRelation(target.constructor, propertyKey.toString(), metadata);
  };
}
