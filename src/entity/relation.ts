import { Type } from '../shared/type.ts';
import { JoinColumnOptions } from './join-column.ts';
import { ReflectMetadata, ReflectMetadataTypes } from '../store/meta.ts';
import { entityStore } from '../store/entity.store.ts';
import { isAnyObject, isArray, isFunction, isNumber, isString } from 'is-what';
import { JoinTableMetadata } from './join-table.ts';
import { TableConstraints } from '../information-schema/table-constraints.entity.ts';
import { orderBy } from '../shared/order-by.ts';

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
  delete,
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
  joinTable?: JoinTableMetadata;
  owner?: boolean;
  cascadeOptions: Record<RelationCascade, boolean>;
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
    const cascadeOptions = Object.values(RelationCascade)
      .filter(isNumber)
      .reduce((acc, item) => ({ ...acc, [item]: options?.cascade === true }), {} as Record<RelationCascade, boolean>);
    if (options?.cascade && isArray(options?.cascade)) {
      for (const cascade of options.cascade) {
        cascadeOptions[cascade] = true;
      }
    }
    const metadata: RelationMetadata = {
      propertyKey: propertyKey.toString(),
      type: relationType,
      reference: isString(type) ? type : type(undefined),
      inverse: isString(inverse) ? value => value[inverse] : inverse,
      referenceFn: isFunction(type) ? type : undefined,
      cascadeOptions,
    };
    entityStore.upsertRelation(target.constructor, propertyKey.toString(), metadata);
  };
}

export function resolveRelation(
  databaseName: string,
  tableName: string,
  name: string,
  referencedTableName: string,
  relationMetadata: RelationMetadata
): [string, any[]] {
  let statement = 'ALTER TABLE ??.?? ADD CONSTRAINT ?? ';
  const params: any[] = [databaseName, tableName, name];
  if (relationMetadata.joinColumns?.length) {
    let foreignKeyStatement = 'FOREIGN KEY(';
    const fkParams = [];
    let referencesStatement = 'REFERENCES ??.??(';
    const refParams: any[] = [databaseName, referencedTableName];
    for (const joinColumn of relationMetadata.joinColumns) {
      foreignKeyStatement += '??,';
      fkParams.push(joinColumn.name);
      referencesStatement += '??,';
      refParams.push(joinColumn.referencedColumn);
    }
    foreignKeyStatement = foreignKeyStatement.slice(0, -1) + ') ';
    referencesStatement = referencesStatement.slice(0, -1) + ') ';
    statement += foreignKeyStatement;
    params.push(...fkParams);
    statement += referencesStatement;
    params.push(...refParams);
  }
  if (relationMetadata.onDelete || relationMetadata.cascadeOptions[RelationCascade.delete]) {
    statement += ` ON DELETE ${relationMetadata.onDelete}`;
  }
  if (relationMetadata.onUpdate) {
    statement += ` ON UPDATE ${relationMetadata.onUpdate}`;
  }
  return [statement, params];
}

export function relationHasChanged(oldRelation: TableConstraints, newRelation: RelationMetadata): boolean {
  let oldJoinColumns = oldRelation.getJoinColumns();
  let newJoinColumns = newRelation.joinColumns ?? [];
  const joinColumnsHasChanged = (): boolean => {
    oldJoinColumns = orderBy(oldJoinColumns, ['name', 'referencedColumn']);
    newJoinColumns = orderBy(newJoinColumns, ['name', 'referencedColumn']);
    return oldJoinColumns.some((oldJoinColumn, index) => {
      const newJoinColumn = newJoinColumns[index];
      return (
        oldJoinColumn.name !== newJoinColumn.name || oldJoinColumn.referencedColumn !== newJoinColumn.referencedColumn
      );
    });
  };
  return oldJoinColumns.length !== newJoinColumns.length || joinColumnsHasChanged();
}
