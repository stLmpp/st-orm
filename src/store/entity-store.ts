import { EntityMetadata } from '../entity/entity.ts';
import { ColumnMetadata } from '../entity/column.ts';
import { isFunction, isString } from 'is-what';
import { Injectable } from '../injector/injectable.ts';
import { injector } from '../injector/injector.ts';
import { IndexMetadata } from '../entity/indexes.ts';
import { RelationMetadata, RelationType } from '../entity/relation.ts';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { Type } from '../shared/type.ts';

@Injectable()
export class EntityStore {
  #state = new Map<any, EntityMetadata>();

  get(target: any): EntityMetadata | undefined {
    return this.#state.get(target);
  }

  set(target: any, metadata: EntityMetadata): EntityMetadata {
    this.#state.set(target, metadata);
    return this.#state.get(target)!;
  }

  getOrCreate(target: any): EntityMetadata {
    let meta = this.get(target);
    if (!meta) {
      meta = this.set(target, { columnsMetadata: new Map(), relationsMetadata: new Map() });
    }
    return meta;
  }

  upsert(target: any, callback: (meta: EntityMetadata) => EntityMetadata): void;
  upsert(target: any, partial: Partial<EntityMetadata>): void;
  upsert(target: any, partialOrCallback: Partial<EntityMetadata> | ((meta: EntityMetadata) => EntityMetadata)): void {
    const callback: (meta: EntityMetadata) => EntityMetadata = isFunction(partialOrCallback)
      ? partialOrCallback
      : entity => ({ ...entity, ...partialOrCallback });
    const meta = this.getOrCreate(target);
    this.#state.set(target, callback(meta));
  }

  private addColumn(target: any, metadata: ColumnMetadata): void {
    if (!metadata.propertyKey) {
      throw new Error('Property key is required');
    }
    this.upsert(target, entity => {
      return {
        ...entity,
        columnsMetadata: entity.columnsMetadata.set(metadata.propertyKey!, metadata),
      };
    });
  }

  private updateColumn(
    target: any,
    propertyKey: string,
    partial: Partial<ColumnMetadata> | ((columnMetadata: ColumnMetadata | undefined) => ColumnMetadata)
  ): void {
    const callback: (columnMetadata: ColumnMetadata | undefined) => ColumnMetadata = isFunction(partial)
      ? partial
      : c => ({ ...c, ...partial });
    this.upsert(target, entity => {
      const columnMeta = entity.columnsMetadata.get(propertyKey);
      const newMeta = callback(columnMeta);
      const newMap = entity.columnsMetadata.set(propertyKey, newMeta);
      return {
        ...entity,
        columnsMetadata: newMap,
      };
    });
  }

  upsertColumn(
    target: any,
    propertyKey: string,
    metadata:
      | ColumnMetadata
      | Partial<ColumnMetadata>
      | ((columnMetadata: ColumnMetadata | undefined) => ColumnMetadata)
  ): void {
    const targetMeta = this.getOrCreate(target);
    let columnMeta = targetMeta.columnsMetadata.get(propertyKey);
    if (isFunction(metadata)) {
      columnMeta = metadata(columnMeta);
    } else {
      columnMeta = { ...columnMeta, ...metadata };
    }
    if (columnMeta.unique) {
      this.addUniqueIndex(target, propertyKey);
    }
    if (targetMeta.columnsMetadata.has(propertyKey)) {
      this.updateColumn(target, propertyKey, metadata);
    } else {
      this.addColumn(target, isFunction(metadata) ? metadata({ propertyKey }) : metadata);
    }
  }

  addIndex(target: any, metadata: IndexMetadata, propertyKey?: string): void {
    if (metadata.columns) {
      this.upsert(target, entity => {
        return {
          ...entity,
          indexes: [...(entity?.indexes ?? []), metadata],
        };
      });
    } else if (propertyKey) {
      this.upsertColumn(target, propertyKey, columnMetadata => {
        return {
          ...columnMetadata,
          indexes: [...(columnMetadata?.indexes ?? []), metadata],
        };
      });
    }
  }

  addUniqueIndex(target: any, propertyKey: string): void {
    const columnMeta = this.get(target)?.columnsMetadata.get(propertyKey);
    if (!columnMeta?.indexes?.some(index => index.unique)) {
      this.upsertColumn(target, propertyKey, columnMetadata => {
        return {
          ...columnMetadata,
          indexes: [...(columnMetadata?.indexes ?? []), { unique: true }],
        };
      });
    }
  }

  upsertRelation(target: any, propertyKey: string, metadata: RelationMetadata | Partial<RelationMetadata>): void {
    const targetMeta = this.getOrCreate(target);
    const relationMeta = targetMeta.relationsMetadata.get(propertyKey);
    if (!relationMeta) {
      if (!metadata.propertyKey) {
        throw new Error(`propertyKey is required on ${target.name} - ${metadata.type} - ${metadata.reference}`);
      }
      this.upsert(target, entity => {
        return {
          ...entity,
          relationsMetadata: entity.relationsMetadata.set(propertyKey, metadata as RelationMetadata),
          relationProperties: { ...entity.relationProperties, [propertyKey]: propertyKey },
        };
      });
    } else {
      this.upsert(target, entity => {
        return {
          ...entity,
          relationsMetadata: entity.relationsMetadata.set(propertyKey, { ...relationMeta, ...metadata }),
          relationProperties: { ...entity.relationProperties, [propertyKey]: propertyKey },
        };
      });
    }
  }

  getEntitiesConnection(connection = 'default'): Map<any, EntityMetadata> {
    const map = new Map<any, EntityMetadata>();
    for (const [entity, meta] of this.#state) {
      if (meta.connection === connection) {
        map.set(entity, meta);
      }
    }
    return map;
  }

  private resolveJoinReference(
    entitiesMap: Map<any, EntityMetadata>,
    namingStrategy: NamingStrategy,
    name: string
  ): Type | undefined {
    return [...entitiesMap.entries()].find(([, entity]) => namingStrategy.tableName(entity.name!) === name)?.[0];
  }

  updateDefaults(connection: string, namingStrategy: NamingStrategy): void {
    const entitiesMap1 = this.getEntitiesConnection(connection);
    for (const [targetKey, target] of entitiesMap1) {
      for (let [relationKey, relation] of target.relationsMetadata) {
        let hasUpdate = false;
        if (!relation.reference && relation.referenceFn) {
          const reference = relation.referenceFn(undefined);
          if (!reference) {
            throw new Error(`Could not resolve reference type for ${targetKey.name} - ${relation.propertyKey}`);
          }
          relation = {
            ...relation,
            reference,
            referenceType: reference,
          };
          hasUpdate = true;
        } else {
          if (isString(relation.reference)) {
            relation = {
              ...relation,
              referenceType: this.resolveJoinReference(entitiesMap1, namingStrategy, relation.reference),
            };
            hasUpdate = true;
          } else {
            relation = {
              ...relation,
              referenceType: relation.reference,
            };
            hasUpdate = true;
          }
        }
        if (relation.joinColumns?.length) {
          relation = {
            ...relation,
            joinColumns: relation.joinColumns.map(joinColumn => ({
              name: joinColumn.name ?? namingStrategy.joinColumnName(relation.propertyKey, 'id'),
              referencedColumn: joinColumn.referencedColumn ?? 'id',
              ...joinColumn,
            })),
          };
          hasUpdate = true;
        }
        if (hasUpdate) {
          this.upsertRelation(targetKey, relationKey, relation);
        }
      }
    }
    const entitiesMap2 = this.getEntitiesConnection(connection);
    for (const [targetKey, target] of entitiesMap2) {
      for (let [relationKey, relation] of target.relationsMetadata) {
        let hasUpdate = false;
        const inverseMeta = this.get(relation.referenceType);
        if (inverseMeta) {
          const inversePropertyKey = relation.inverse?.(inverseMeta.relationProperties);
          if (inversePropertyKey) {
            const inverseRelationMeta = inverseMeta.relationsMetadata.get(inversePropertyKey);
            if (inverseRelationMeta?.owner) {
              relation = {
                ...relation,
                joinColumns: inverseRelationMeta.joinColumns!.map(({ referencedColumn, name }) => ({
                  referencedColumn: name,
                  name: referencedColumn,
                })),
              };
              hasUpdate = true;
            }
          }
        }
        if (hasUpdate) {
          this.upsertRelation(targetKey, relationKey, relation);
        }
      }
    }
    const entitiesMap3 = this.getEntitiesConnection(connection);
    for (const [targetKey, target] of entitiesMap3) {
      for (const [, relation] of target.relationsMetadata) {
        if (relation.owner) {
          if (relation.joinColumns?.length) {
            const inverseMeta = this.get(relation.referenceType);
            for (const joinColumn of relation.joinColumns) {
              let column = target.columnsMetadata.get(joinColumn.name!);
              if (!column && inverseMeta) {
                const inverseColumn = inverseMeta.columnsMetadata.get(joinColumn.referencedColumn!);
                if (inverseColumn) {
                  column = {
                    ...inverseColumn,
                    propertyKey: joinColumn.name,
                    name: joinColumn.name,
                    select: false,
                    comment: `Auto generated from relation between ${namingStrategy.tableName(
                      target.name!
                    )} and ${namingStrategy.tableName(inverseMeta!.name!)}`,
                    primary: false,
                    generated: undefined,
                  };
                }
              }
              if (column) {
                this.upsertColumn(targetKey, column.propertyKey!, {
                  ...column,
                  nullable: relation.nullable,
                  unique: relation.type === RelationType.oneToOne,
                });
              }
            }
          }
        }
      }
    }
  }
}

export const entityStore = injector.resolve(EntityStore);
