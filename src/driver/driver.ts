import { Client } from 'mysql';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { Connection, ConnectionConfig } from '../connection/connection.ts';
import { columnHasChanged, ColumnMetadata, resolveColumn } from '../entity/column.ts';
import { indexHasChanged, IndexMetadata, resolveIndex } from '../entity/indexes.ts';
import { SelectQueryBuilder } from '../query-builder/query-builder.ts';
import { InformationSchemaService } from '../information-schema/information-schema.service.ts';
import { replaceParams } from 'sql-builder';
import { Tables } from '../information-schema/tables.entity.ts';
import { RelationMetadata, resolveRelation } from '../entity/relation.ts';
import { Columns } from '../information-schema/columns.entity.ts';
import Ask from 'ask';

export class Driver {
  constructor(
    private options: ConnectionConfig,
    private namingStrategy: NamingStrategy,
    private entitiesMap: Map<any, EntityMetadata>,
    private informationSchemaConnection?: Connection
  ) {
    if (this.informationSchemaConnection) {
      this.informationSchemaService = new InformationSchemaService(informationSchemaConnection!, options);
    }
  }

  informationSchemaService!: InformationSchemaService;
  client!: Client;

  async connect(): Promise<Client> {
    const client = await new Client().connect(this.options);
    this.client = client;
    return client;
  }

  async disconnect(): Promise<void> {
    await this.client.close();
  }

  async query<U = any>(query: string, params?: any[]): Promise<U[]> {
    return await this.client.query(query, params);
  }

  createQueryBuilder(): SelectQueryBuilder<any> {
    return new SelectQueryBuilder(this, this.entitiesMap, this.namingStrategy);
  }

  async sync(): Promise<void> {
    const statements: [string, any[]][] = [];
    const tables = await this.informationSchemaService.getAllTables(true, true);
    if (this.options.syncOptions?.dropUnknownTables) {
      statements.push(...(await this.checkForUnknownTables(tables)));
    }
    for (const [, entity] of this.entitiesMap) {
      if (entity.sync) {
        const tableDb = tables.find(table => table.TABLE_NAME === this.namingStrategy.tableName(entity.name!));
        const tableStatements = await this.getTableStatement(entity, tableDb);
        statements.push(...tableStatements);
      }
    }
    if (this.options.syncOptions?.askBeforeSync) {
      for (const [sql, params] of statements) {
        // TODO LOGGER
        // eslint-disable-next-line no-console
        console.log(replaceParams(sql, params));
      }
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
          // TODO APPLY CHANGES DB
          // await this.client.execute(sql, params);
        }
      }
    } else {
      for (const [sql, params] of statements) {
        // TODO LOGGER
        // eslint-disable-next-line no-console
        console.log(replaceParams(sql, params));
        // TODO APPLY CHANGES DB
        // await this.client.execute(sql, params);
      }
    }
  }

  private async checkForUnknownTables(tables: Tables[]): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    const entities = [...this.entitiesMap.values()];
    for (const table of tables) {
      const entity = entities.find(e => this.namingStrategy.tableName(e.name!) === table.TABLE_NAME);
      if (!entity) {
        statements.push(['DROP TABLE IF EXISTS ??.??', [this.options.db, table.TABLE_NAME]]);
      }
    }
    return statements;
  }

  private async checkForUnknownColumns(
    tableName: string,
    columnsMetadataMap: Map<string, ColumnMetadata>,
    columnsDb: Columns[]
  ): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    const columns = [...columnsMetadataMap.values()].map(col => this.namingStrategy.columnName(col.name!));
    for (const colDb of columnsDb) {
      if (!columns.includes(colDb.COLUMN_NAME)) {
        statements.push(['ALTER TABLE ??.?? DROP COLUMN ??', [this.options.db, tableName, colDb.COLUMN_NAME]]);
      }
    }
    return statements;
  }

  private async getTableStatement(
    { columnsMetadata, name, indexes, relationsMetadata, comment }: EntityMetadata,
    tableDb?: Tables
  ): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    name = this.namingStrategy.tableName(name!);
    const columnIndexes: [string, IndexMetadata[]][] = [];
    if (!tableDb) {
      let statement = `CREATE TABLE ??.?? (`;
      const params = [];
      params.push(this.options.db, name);
      for (let [columnName, columnMeta] of columnsMetadata) {
        columnName = this.namingStrategy.columnName(columnMeta.name!);
        const [columnQuery, queryParams] = resolveColumn[columnMeta.type!]({ ...columnMeta, name: columnName });
        statement += `${columnQuery},`;
        params.push(...queryParams);
        if (columnMeta.indexes?.length) {
          columnIndexes.push([columnName, columnMeta.indexes]);
        }
      }
      statement = statement.slice(0, -1) + ')';
      if (comment) {
        statement += ' COMMENT ?';
        params.push(comment);
      }
      statements.push([statement, params]);
    } else {
      if ((tableDb.TABLE_COMMENT || undefined) !== comment) {
        statements.push(['ALTER TABLE ??.?? COMMENT = ?', [this.options.db, name, comment]]);
      }
      if (this.options.syncOptions?.dropUnkownColumns) {
        statements.push(...(await this.checkForUnknownColumns(name, columnsMetadata, tableDb.columns)));
      }
      for (let [columnName, columnMeta] of columnsMetadata) {
        columnName = this.namingStrategy.columnName(columnMeta.name!);
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
        if (columnMeta.indexes?.length) {
          columnIndexes.push([columnName, columnMeta.indexes]);
        }
      }
    }
    const indexStatements = await this.getIndexesStatement(name, columnIndexes, indexes);
    statements.push(...indexStatements);
    const relationStatements = await this.getRelationStatements(name, relationsMetadata);
    statements.push(...relationStatements);
    return statements;
  }

  private async getIndexesStatement(
    tableName: string,
    columnIndexes: [string, IndexMetadata[]][],
    tableIndexes?: IndexMetadata[]
  ): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    const indexesDb = await this.informationSchemaService.getIndexesByTable(tableName);
    if (columnIndexes.length) {
      for (const [columnName, indexOptions] of columnIndexes) {
        for (const option of indexOptions) {
          const idxDb = indexesDb.find(idx => idx.COLUMN_NAME === columnName);
          const idxName = this.namingStrategy.indexName(tableName, [columnName], option);
          const [index, indexParams] = resolveIndex(this.options.db!, tableName, idxName, option, columnName);
          if (!idxDb) {
            statements.push([index, indexParams]);
          } else if (indexHasChanged(idxDb, option)) {
            statements.push(['DROP INDEX ?? ON ??.??', [idxDb.INDEX_NAME, this.options.db, tableName]]);
            statements.push([index, indexParams]);
          }
        }
      }
    }
    if (tableIndexes?.length) {
      for (const indexOptions of tableIndexes) {
        if (indexOptions.columns?.length) {
          const idxName = this.namingStrategy.indexName(tableName, indexOptions.columns!, indexOptions);
          const [index, indexParams] = resolveIndex(this.options.db!, tableName, idxName, indexOptions);
          const idxDb = indexOptions.columns.map(col => indexesDb.find(db => db.COLUMN_NAME === col));
          if (!idxDb.length) {
            statements.push([index, indexParams]);
          } else {
            if (idxDb.length !== indexOptions.columns.length) {
              statements.push(['DROP INDEX ?? ON ??.??', [idxDb[0]!.INDEX_NAME, this.options.db, tableName]]);
              statements.push([index, indexParams]);
            } else {
              const idxDbCols = [...idxDb.filter(Boolean).map(idx => idx!.COLUMN_NAME)].sort();
              const idxCols = [...indexOptions.columns].sort();
              if (idxCols.some((col, i) => col !== idxDbCols[i])) {
                statements.push(['DROP INDEX ?? ON ??.??', [idxDb[0]!.INDEX_NAME, this.options.db, tableName]]);
                statements.push([index, indexParams]);
              }
            }
          }
        }
      }
    }
    return statements;
  }

  private async getRelationStatements(
    tableName: string,
    relationsMetadata: Map<string, RelationMetadata>
  ): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    for (const [, relationMeta] of relationsMetadata) {
      if (relationMeta.owner) {
        const referencedTableName = this.namingStrategy.tableName(
          this.entitiesMap.get(relationMeta.referenceType)!.name!
        );
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
    return statements;
  }
}
