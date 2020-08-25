import { EntityMetadata } from '../entity/entity.ts';
import { ColumnMetadata } from '../entity/column.ts';
import { isString } from 'is-what';
import { Injectable } from '../injector/injectable.ts';
import { injector } from '../injector/injector.ts';
import { IndexMetadata } from '../entity/indexes.ts';
import { RelationMetadata, RelationType } from '../entity/relation.ts';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { Type } from '../shared/type.ts';
import { StMap } from '../shared/map.ts';

@Injectable()
export class EntityStore {
  #state = new StMap<any, EntityMetadata>(() => ({ columnsMetadata: new StMap(), relationsMetadata: new StMap() }));

  get(target: any): EntityMetadata | undefined {
    return this.#state.get(target);
  }

  set(target: any, metadata: EntityMetadata): EntityMetadata {
    this.#state.set(target, metadata);
    return this.#state.get(target)!;
  }

  upsert(target: any, callback: (meta: EntityMetadata) => EntityMetadata): void;
  upsert(target: any, partial: Partial<EntityMetadata>): void;
  upsert(target: any, partialOrCallback: Partial<EntityMetadata> | ((meta: EntityMetadata) => EntityMetadata)): void {
    this.#state.upsert(target, partialOrCallback);
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
    this.#state.upsert(target, entity => {
      return {
        ...entity,
        columnsMetadata: entity.columnsMetadata.update(propertyKey, partial),
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
    this.#state.upsert(target, entity => {
      return {
        ...entity,
        columnsMetadata: entity.columnsMetadata.upsert(propertyKey, metadata),
      };
    });
    const targetMeta = this.#state.get(target)!;
    const columnMeta = targetMeta.columnsMetadata.get(propertyKey)!;
    if (columnMeta.unique) {
      this.addUniqueIndex(target, propertyKey);
    }
  }

  addIndex(target: any, metadata: IndexMetadata, propertyKey?: string): void {
    if (metadata.columns) {
      this.#state.upsert(target, entity => {
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
    this.#state.upsert(target, entity => {
      return {
        ...entity,
        relationsMetadata: entity.relationsMetadata.upsert(propertyKey, { ...metadata, propertyKey }),
        relationProperties: { ...entity.relationProperties, [propertyKey]: propertyKey },
      };
    });
  }

  getEntitiesConnection(connection = 'default'): StMap<any, EntityMetadata> {
    return this.#state.filter((_, entityMetadata) => entityMetadata.connection === connection);
  }

  private resolveJoinReference(
    entitiesMap: StMap<any, EntityMetadata>,
    namingStrategy: NamingStrategy,
    name: string
  ): Type | undefined {
    return entitiesMap.find((_, entity) => namingStrategy.tableName(entity.name!) === name)?.[0];
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
