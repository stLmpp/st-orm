import { EntityMetadata } from '../entity/entity.ts';
import { ColumnMetadata, ColumnType, isStringType } from '../entity/column.ts';
import { isString } from 'is-what';
import { Injectable } from '../injector/injectable.ts';
import { injector } from '../injector/injector.ts';
import { IndexMetadata } from '../entity/indices.ts';
import { RelationCascade, RelationMetadata, RelationType } from '../entity/relation.ts';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { Type } from '../shared/type.ts';
import { StMap } from '../shared/map.ts';
import { ConnectionConfigInternal } from '../connection/connection.ts';
import { FormulaFn } from '../entity/formula.ts';

@Injectable()
export class EntityStore {
  #state = new StMap<any, EntityMetadata>(() => ({
    columnsMetadata: new StMap(),
    relationsMetadata: new StMap(),
    formulas: new StMap(),
  }));

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
          indices: [...(entity?.indices ?? []), metadata],
        };
      });
    } else if (propertyKey) {
      this.upsertColumn(target, propertyKey, columnMetadata => {
        return {
          ...columnMetadata,
          indices: [...(columnMetadata?.indices ?? []), metadata],
        };
      });
    }
  }

  addUniqueIndex(target: any, propertyKey: string): void {
    const columnMeta = this.get(target)?.columnsMetadata.get(propertyKey);
    if (!columnMeta?.indices?.some(index => index.unique)) {
      this.upsertColumn(target, propertyKey, columnMetadata => {
        return {
          ...columnMetadata,
          indices: [...(columnMetadata?.indices ?? []), { unique: true }],
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

  upsertFormula(target: any, propertyKey: string, formula: FormulaFn): void {
    this.#state.upsert(target, entity => {
      return {
        ...entity,
        formulas: entity.formulas.upsert(propertyKey, formula),
      };
    });
  }

  getEntitiesConnection(connection = 'default'): StMap<any, EntityMetadata> {
    return this.#state.filter((_, entityMetadata) => entityMetadata.connection === connection);
  }

  private resolveJoinReference(entitiesMap: StMap<any, EntityMetadata>, name: string): Type | undefined {
    return entitiesMap.find((_, entity) => entity.dbName! === name)?.[0];
  }

  private updateNames(entity: Type, entityMetadata: EntityMetadata, namingStrategy: NamingStrategy): void {
    const entityUpdate: Partial<EntityMetadata> = {};
    entityUpdate.dbName = namingStrategy.tableName(entityMetadata.name!);
    entityUpdate.columnsMetadata = new StMap();
    entityUpdate.indices = (entityMetadata.indices ?? []).map(index => ({
      ...index,
      dbName: namingStrategy.indexName(entityUpdate.dbName!, index.columns!, index),
      tableName: entityUpdate.dbName,
    }));
    for (let [columnProperty, columnMetadata] of entityMetadata.columnsMetadata) {
      const columnDbName = namingStrategy.columnName(columnMetadata.name!);
      columnMetadata = {
        ...columnMetadata,
        dbName: columnDbName,
        indices: (columnMetadata.indices ?? []).map(index => {
          return {
            ...index,
            dbName: namingStrategy.indexName(entityUpdate.dbName!, [columnDbName], index),
            columnName: columnDbName,
            tableName: entityUpdate.dbName,
          };
        }),
      };
      entityUpdate.columnsMetadata.set(columnProperty, columnMetadata);
    }
    this.upsert(entity, entityUpdate);
  }

  private updateColumnsCharset(entity: Type, entityMetadata: EntityMetadata, collation: string): void {
    for (const [columnKey, columnMetadata] of entityMetadata.columnsMetadata) {
      if (isStringType(columnMetadata.type!) && !columnMetadata.collation) {
        this.upsertColumn(entity, columnKey, { collation });
      }
    }
  }

  updateDefaults({ name: connection, collation }: ConnectionConfigInternal, namingStrategy: NamingStrategy): void {
    const entitiesMap0 = this.getEntitiesConnection(connection);
    for (const [entity, entityMetadata] of entitiesMap0) {
      this.updateNames(entity, entityMetadata, namingStrategy);
    }
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
              referenceType: this.resolveJoinReference(entitiesMap1, relation.reference),
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
              name: joinColumn.name ?? namingStrategy.joinColumnName(this.get(relation.referenceType)!.dbName!, 'id'),
              referencedColumn: joinColumn.referencedColumn ?? 'id',
              ...joinColumn,
            })),
          };
          hasUpdate = true;
        } else if (relation.joinTable) {
          const ownerTableName = target.dbName!;
          const referenceMeta = this.get(relation.referenceType)!;
          const tableName = referenceMeta.dbName!;
          let { name, inverseJoinColumns, joinColumns } = relation.joinTable;
          joinColumns = joinColumns.map(joinColumn => ({
            name: joinColumn.name ?? namingStrategy.joinColumnName(ownerTableName, 'id'),
            referencedColumn: joinColumn.referencedColumn ?? 'id',
            ...joinColumn,
          }));
          inverseJoinColumns = inverseJoinColumns.map(joinColumn => ({
            name: joinColumn.name ?? namingStrategy.joinColumnName(tableName, 'id'),
            referencedColumn: joinColumn.referencedColumn ?? 'id',
            ...joinColumn,
          }));
          const ownerColumns = joinColumns.reduce(
            (acc: string[], item) => [...acc, item.name!, item.referencedColumn!],
            []
          );
          const columns = inverseJoinColumns.reduce(
            (acc: string[], item) => [...acc, item.name!, item.referencedColumn!],
            []
          );
          if (!name) {
            name = namingStrategy.joinTableName(ownerTableName, tableName, ownerColumns, columns);
          } else {
            name = namingStrategy.tableName(name);
          }
          const columnsMetadata: StMap<string, ColumnMetadata> = new StMap();
          for (const joinColumn of [...joinColumns, ...inverseJoinColumns]) {
            columnsMetadata.set(joinColumn.name!, {
              type: ColumnType.int,
              propertyKey: joinColumn.name,
              name: joinColumn.name,
              primary: true,
              dbName: joinColumn.name,
            });
          }
          const relationsMetadata = new StMap<string, RelationMetadata>()
            .set(ownerTableName, {
              reference: targetKey,
              referenceType: targetKey,
              propertyKey: ownerTableName,
              type: RelationType.manyToOne,
              cascadeOptions: {
                [RelationCascade.delete]: false,
                [RelationCascade.insert]: false,
                [RelationCascade.update]: false,
              },
              owner: true,
              joinColumns,
            })
            .set(tableName, {
              reference: relation.reference,
              referenceType: relation.referenceType,
              propertyKey: tableName,
              type: RelationType.manyToOne,
              cascadeOptions: {
                [RelationCascade.delete]: false,
                [RelationCascade.insert]: false,
                [RelationCascade.update]: false,
              },
              owner: true,
              joinColumns: inverseJoinColumns,
            });
          const relationProperties = [...relationsMetadata.keys()].reduce(
            (acc, item) => ({ ...acc, [item]: item }),
            {}
          );
          const primaries = columnsMetadata.reduce(
            (acc: string[], [, columnMetada]) => (columnMetada.primary ? [...acc, columnMetada.dbName!] : acc),
            []
          );
          const joinEntity: EntityMetadata = {
            connection: target.connection,
            name,
            dbName: name,
            comment: `Table auto generated from relation between "${target.dbName}" and "${referenceMeta.dbName}"`,
            columnsMetadata,
            relationsMetadata,
            relationProperties,
            primaries,
            sync: true,
            formulas: new StMap(),
          };
          const clazz = class {}; // TODO HERE
          this.upsert(clazz, joinEntity);
          /*this.upsertRelation(targetKey, name, {
            inverse: type => type[ownerTableName],
            propertyKey: ownerTableName,
            type: RelationType.oneToMany,
            reference: clazz,
            referenceType: clazz,
            joinColumns: joinColumns.map(joinColumn => ({
              name: joinColumn.referencedColumn,
              referencedColumn: joinColumn.name,
            })),
            cascadeOptions: {
              [RelationCascade.delete]: false,
              [RelationCascade.insert]: false,
              [RelationCascade.update]: false,
            },
          });
          this.upsertRelation(relation.referenceType, name, {
            inverse: type => type[tableName],
            propertyKey: ownerTableName,
            type: RelationType.oneToMany,
            referenceType: clazz,
            reference: clazz,
            joinColumns: inverseJoinColumns.map(joinColumn => ({
              name: joinColumn.referencedColumn,
              referencedColumn: joinColumn.name,
            })),
            cascadeOptions: {
              [RelationCascade.delete]: false,
              [RelationCascade.insert]: false,
              [RelationCascade.update]: false,
            },
          });*/
          relation = {
            ...relation,
            joinTable: {
              ...relation.joinTable,
              name,
              inverseJoinColumns,
              joinColumns,
              type: clazz,
            },
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
                joinColumns: inverseRelationMeta.joinColumns!.map(({ referencedColumn, name }) => ({
                  referencedColumn: name,
                  name: referencedColumn,
                })),
                ...relation,
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
                    comment: `Auto generated from relation between ${target.name} and ${inverseMeta.name}`,
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
    const entitiesMap4 = this.getEntitiesConnection(connection);
    for (const [entity, entityMetadata] of entitiesMap4) {
      const primaries = entityMetadata.columnsMetadata.reduce(
        (acc: string[], [, columnMetadata]) => (columnMetadata.primary ? [...acc, columnMetadata.dbName!] : acc),
        []
      );
      this.upsert(entity, { primaries });
      this.updateNames(entity, entityMetadata, namingStrategy);
      this.updateColumnsCharset(entity, entityMetadata, collation!);
    }
  }
}

export const entityStore = injector.resolve(EntityStore);
