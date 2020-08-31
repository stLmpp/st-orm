import { Client } from 'mysql';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { Connection, ConnectionConfigInternal } from '../connection/connection.ts';
import { columnHasChanged, ColumnMetadata, resolveColumn } from '../entity/column.ts';
import { indexHasChanged, IndexMetadata, resolveIndex } from '../entity/indices.ts';
import { SelectQueryBuilder } from '../query-builder/select-query-builder.ts';
import { InformationSchemaService } from '../information-schema/information-schema.service.ts';
import { replaceParams } from 'sql-builder';
import { Tables } from '../information-schema/tables.entity.ts';
import { relationHasChanged, RelationMetadata, resolveRelation } from '../entity/relation.ts';
import { Columns } from '../information-schema/columns.entity.ts';
import Ask from 'ask';
import { StMap } from '../shared/map.ts';
import { groupBy, isArrayEqual } from '../shared/util.ts';
import { Statistics } from '../information-schema/statistics.entity.ts';
import { TableConstraints } from '../information-schema/table-constraints.entity.ts';
import { ExecuteResult, Statement, Type } from '../shared/type.ts';
import { UpdateQueryBuilder } from '../query-builder/update-query-builder.ts';
import { DeleteQueryBuilder } from '../query-builder/delete-query-builder.ts';
import { InsertQueryBuilder } from '../query-builder/insert-query-builder.ts';
import { TransactionProcessor } from 'https://deno.land/x/mysql@v2.4.0/src/client.ts';

export class Driver {
  constructor(
    private client: Client,
    public options: ConnectionConfigInternal,
    public entitiesMap: StMap<any, EntityMetadata>,
    private informationSchemaConnection?: Connection
  ) {
    this.namingStrategy = options.namingStrategy!;
    if (this.informationSchemaConnection) {
      this.informationSchemaService = new InformationSchemaService(informationSchemaConnection!, options);
    }
  }

  private namingStrategy: NamingStrategy;
  informationSchemaService!: InformationSchemaService;

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async query<U = any>(query: string, params?: any[]): Promise<U[]> {
    return this.client.query(query, params);
  }

  async execute(sql: string, params?: any[]): Promise<ExecuteResult> {
    return this.client.execute(sql, params);
  }

  async transaction<T>(processor: TransactionProcessor<T>): Promise<T> {
    return this.client.transaction<T>(connection => processor(connection));
  }

  createSelectQueryBuilder(): SelectQueryBuilder<any> {
    return new SelectQueryBuilder(this, this.entitiesMap);
  }

  createUpdateQueryBuilder<T>(entity: Type<T>, alias?: string): UpdateQueryBuilder<any> {
    const entityMetadata = this.entitiesMap.get(entity);
    if (!entityMetadata) {
      throw new Error(`Could not find metadata for ${entity?.name ?? entity}`);
    }
    return new UpdateQueryBuilder<T>(this, entityMetadata, alias ?? entityMetadata.dbName!);
  }

  createDeleteQueryByulder<T>(entity: Type<T>, alias?: string): DeleteQueryBuilder<T> {
    const entityMetadata = this.entitiesMap.get(entity);
    if (!entityMetadata) {
      throw new Error(`Could not find metadata for ${entity?.name ?? entity}`);
    }
    return new DeleteQueryBuilder<T>(this, entityMetadata, alias ?? entityMetadata.dbName!);
  }

  createInsertQueryBuilder<T>(entity: Type<T>): InsertQueryBuilder<T> {
    const entityMetadata = this.entitiesMap.get(entity);
    if (!entityMetadata) {
      throw new Error(`Could not find metadata for ${entity?.name ?? entity}`);
    }
    return new InsertQueryBuilder<T>(this, entityMetadata);
  }

  async confirmDb(statements: Statement[]): Promise<boolean> {
    for (const [sql, params] of statements) {
      // TODO LOGGER
      // eslint-disable-next-line no-console
      console.log(replaceParams(sql + ';', params));
    }
    if (this.options.syncOptions?.askBeforeSync) {
      const ask = new Ask();
      const { confirmed } = await ask.confirm({
        name: 'confirmed',
        accept: 'Y',
        deny: 'N',
        default: 'N',
        message: 'Apply the changes above in the database?',
      });
      if (confirmed) {
        for (const [sql, params] of statements) {
          await this.client.execute(sql, params);
        }
        return true;
      } else {
        // TODO LOGGER
        // eslint-disable-next-line no-console
        console.log('Did I made a mistake? :(\nReport this on https://github.com/stLmpp/st-orm/issues/new');
      }
    } else {
      for (const [sql, params] of statements) {
        await this.client.execute(sql, params);
      }
      return true;
    }
    return false;
  }

  async sync(): Promise<void> {
    let statements: Statement[] = [];
    let tables = await this.informationSchemaService.getAllTables();
    if (this.options.syncOptions?.dropSchema && tables.length) {
      for (const table of tables) {
        statements.push([`DROP TABLE IF EXISTS ??.??`, [this.options.db, table.TABLE_NAME]]);
      }
      this.client.execute('SET FOREIGN_KEY_CHECKS = 0');
      const confirmed = await this.confirmDb(statements);
      this.client.execute('SET FOREIGN_KEY_CHECKS = 1');
      statements = [];
      if (confirmed) {
        tables = [];
      }
    }
    if (this.options.syncOptions?.dropUnknownTables) {
      statements.push(...(await this.checkForUnknownTables(tables)));
    }
    for (const [, entity] of this.entitiesMap) {
      if (entity.sync) {
        const tableDb = tables.find(table => table.TABLE_NAME === entity.dbName!);
        const tableStatements = await this.getTableStatement(entity, tableDb);
        statements.push(...tableStatements);
      }
    }
    if (statements.length) {
      await this.confirmDb(statements);
    }
  }

  private async checkForUnknownTables(tables: Tables[]): Promise<Statement[]> {
    const statements: Statement[] = [];
    const entities = [...this.entitiesMap.values()];
    for (const table of tables) {
      const entity = entities.find(({ dbName }) => dbName === table.TABLE_NAME);
      if (!entity) {
        statements.push(['DROP TABLE IF EXISTS ??.??', [this.options.db, table.TABLE_NAME]]);
      }
    }
    return statements;
  }

  private async checkForUnknownColumns(
    tableName: string,
    columnsMetadataMap: StMap<string, ColumnMetadata>,
    columnsDb: Columns[]
  ): Promise<Statement[]> {
    const statements: Statement[] = [];
    const columns = [...columnsMetadataMap.values()].map(({ dbName }) => dbName);
    for (const colDb of columnsDb) {
      if (!columns.includes(colDb.COLUMN_NAME)) {
        statements.push(['ALTER TABLE ??.?? DROP COLUMN ??', [this.options.db, tableName, colDb.COLUMN_NAME]]);
      }
    }
    return statements;
  }

  private async getTableStatement(entityMetadata: EntityMetadata, tableDb?: Tables): Promise<Statement[]> {
    const { columnsMetadata, dbName, relationsMetadata, comment, primaries } = entityMetadata;
    const statements: Statement[] = [];
    const name = dbName!;
    if (!tableDb) {
      let statement = `CREATE TABLE ??.?? (`;
      const params = [];
      params.push(this.options.db, name);
      for (let [columnName, columnMeta] of columnsMetadata) {
        columnName = columnMeta.dbName!;
        const [columnQuery, queryParams] = resolveColumn[columnMeta.type!]({ ...columnMeta, name: columnName });
        statement += `${columnQuery},`;
        params.push(...queryParams);
      }
      if (primaries?.length) {
        statement += ` PRIMARY KEY(${primaries.map(() => '??').join(',')}),`;
        params.push(...primaries);
      }
      statement = statement.slice(0, -1) + ') ENGINE = InnoDB';
      if (comment) {
        statement += ' COMMENT ?';
        params.push(comment);
      }
      statement += ` CHARACTER SET ${this.options.charset} COLLATE ${this.options.collation}`;
      statements.push([statement, params]);
    } else {
      if ((tableDb.TABLE_COMMENT || undefined) !== comment) {
        statements.push(['ALTER TABLE ??.?? COMMENT = ?', [this.options.db, name, comment]]);
      }
      if (this.options.syncOptions?.dropUnknownColumns) {
        statements.push(...(await this.checkForUnknownColumns(name, columnsMetadata, tableDb.columns)));
      }
      for (let [columnName, columnMeta] of columnsMetadata) {
        columnName = columnMeta.dbName!;
        const columnDb = tableDb.columns.find(colDb => {
          return colDb.COLUMN_NAME === columnName;
        });
        if (columnDb && !columnHasChanged(columnDb, columnMeta)) {
          continue;
        }
        let statement = `ALTER TABLE ??.?? ${columnDb ? 'MODIFY' : 'ADD'} `;
        const params = [this.options.db, tableDb.TABLE_NAME];
        const [columnStatement, columnParams] = resolveColumn[columnMeta.type!]({ ...columnMeta, name: columnName });
        statement += columnStatement;
        params.push(...columnParams);
        statements.push([statement, params]);
      }
      const primariesDb = tableDb.getPrimaries().sort();
      const newPrimaries = [...(primaries ?? [])].sort();
      if (!isArrayEqual(primariesDb, newPrimaries)) {
        statements.push([`ALTER TABLE ??.?? DROP PRIMARY KEY`, [this.options.db, name]]);
        statements.push(['-- You might want to check the order of execution', []]);
        if (newPrimaries.length) {
          const primariesParams = newPrimaries.map(() => '??').join(',');
          statements.push([
            `ALTER TABLE ??.?? ADD PRIMARY KEY(${primariesParams})`,
            [this.options.db, name, ...newPrimaries],
          ]);
        }
      }
    }
    const indexStatements = await this.getIndicesStatements(entityMetadata, tableDb);
    statements.push(...indexStatements);
    const relationStatements = await this.getRelationStatements(name, relationsMetadata, tableDb?.constraints ?? []);
    statements.push(...relationStatements);
    return statements;
  }

  private async getIndicesStatements(entityMetadata: EntityMetadata, tableDb?: Tables): Promise<Statement[]> {
    const statements: Statement[] = [];
    let tableIndices = entityMetadata.indices ?? [];
    let indices = entityMetadata.columnsMetadata.reduce(
      (acc: IndexMetadata[], [, columnMetadata]) =>
        columnMetadata.indices?.length ? [...acc, ...columnMetadata.indices] : acc,
      []
    );
    let indicesDb = (tableDb?.columns ?? []).reduce(
      (acc: Statistics[], item) => (item.indices?.length ? [...acc, ...item.indices] : acc),
      []
    );
    const indicesDbGrouped = groupBy(indicesDb, 'INDEX_NAME');
    for (const [indexName, indicesGroup] of indicesDbGrouped) {
      if (indicesGroup.length > 1) {
        const indexExists = tableIndices.findIndex(index =>
          index.columns!.some(col => indicesGroup.some(idxGroup => idxGroup.COLUMN_NAME === col))
        );
        if (indexExists > -1) {
          const columnDb = indicesGroup.map(({ COLUMN_NAME }) => COLUMN_NAME).sort();
          const newColumns = [...tableIndices[indexExists].columns!].sort();
          if (!isArrayEqual(columnDb, newColumns)) {
            statements.push(['DROP INDEX ?? ON ??.??', [indexName, this.options.db, entityMetadata.dbName]]);
          } else {
            tableIndices = tableIndices.filter((_, index) => index !== indexExists);
          }
          indicesDb = indicesDb.filter(idx => idx.INDEX_NAME !== indexName);
        }
      } else {
        const indexDb = indicesGroup[0];
        const newIndex = indices.findIndex(index => index.columnName === indexDb.COLUMN_NAME);
        if (newIndex > -1) {
          if (indexHasChanged(indexDb, indices[newIndex])) {
            statements.push(['DROP INDEX ?? ON ??.??', [indexDb.INDEX_NAME, this.options.db, entityMetadata.dbName]]);
          } else {
            indices = indices.filter((_, index) => index !== newIndex);
          }
          indicesDb = indicesDb.filter(idx => idx.INDEX_NAME !== indexName);
        }
      }
    }
    for (const indexMetadata of [...tableIndices, ...indices]) {
      statements.push([...resolveIndex(this.options.db!, entityMetadata.dbName!, indexMetadata)]);
    }
    if (this.options.syncOptions?.dropUnknownIndices) {
      for (const indexDb of indicesDb) {
        statements.push(['DROP INDEX ?? ON ??.??', [indexDb.INDEX_NAME, this.options.db, entityMetadata.dbName]]);
      }
    }
    return statements;
  }

  private async getRelationStatements(
    tableName: string,
    relationsMetadata: StMap<string, RelationMetadata>,
    constraintsDb: TableConstraints[]
  ): Promise<Statement[]> {
    const statements: Statement[] = [];
    for (const [, relationMeta] of relationsMetadata) {
      if (relationMeta.owner) {
        const referencedTableName = this.entitiesMap.get(relationMeta.referenceType)!.dbName!;
        const constraintDbIndex = constraintsDb.findIndex(
          fk => fk.TABLE_NAME === tableName && fk.REFERENCED_TABLE_NAME === referencedTableName
        );
        if (constraintDbIndex > -1) {
          const oldRelation = constraintsDb[constraintDbIndex];
          constraintsDb = constraintsDb.filter((_, index) => index !== constraintDbIndex);
          if (relationHasChanged(oldRelation, relationMeta)) {
            statements.push([
              'ALTER TABLE ??.?? DROP FOREIGN KEY ??',
              [this.options.db, tableName, oldRelation.CONSTRAINT_NAME],
            ]);
          } else {
            continue;
          }
        }
        const columns = relationMeta.joinColumns!.map(j => j.name!);
        const referencedColumns = relationMeta.joinColumns!.map(j => j.referencedColumn!);
        const relationName = this.namingStrategy.foreignKeyName({
          tableName,
          columns,
          referencedTableName,
          referencedColumns,
          options: relationMeta,
        });
        statements.push(resolveRelation(this.options.db!, tableName, relationName, referencedTableName, relationMeta));
      }
    }
    if (this.options.syncOptions?.dropUnknownRelations) {
      for (const fk of constraintsDb) {
        statements.push(['ALTER TABLE ??.?? DROP FOREIGN KEY ??', [this.options.db, tableName, fk.CONSTRAINT_NAME]]);
      }
    }
    return statements;
  }
}
