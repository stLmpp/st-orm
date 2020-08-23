import { Client } from 'mysql';
import { NamingStrategy } from '../shared/naming-strategy.ts';
import { EntityMetadata } from '../entity/entity.ts';
import { Connection, ConnectionConfig } from '../connection/connection.ts';
import { resolveColumn } from '../entity/column.ts';
import { indexHasChanged, IndexMetadata, resolveIndex } from '../entity/indexes.ts';
import { SelectQueryBuilder } from '../query-builder/query-builder.ts';
import { InformationSchemaService } from '../information-schema/information-schema.service.ts';
import { replaceParams } from 'sql-builder';
import { Tables } from '../information-schema/tables.entity.ts';

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
    /*const indexes = await this.informationSchemaService.getIndexes(['perfil', 'user']);
    for (const index of uniqBy(indexes, (o: any) => o.INDEX_NAME)) {
      await this.client.execute('drop index ?? on ??', [index.INDEX_NAME, index.TABLE_NAME]);
    }*/
    const tables = await this.informationSchemaService.getAllTables(true);
    if (this.options.sync && this.options.syncOptions?.deleteTablesWithoutEntityDefinition) {
      statements.push(...(await this.checkForTablesWithoutEntityDefinition(tables)));
    }
    for (const [, entity] of this.entitiesMap) {
      if (entity.sync) {
        const tableStatements = await this.getTableStatement(entity);
        statements.push(...tableStatements);
      }
    }
    for (const [sql, params] of statements) {
      console.log(replaceParams(sql, params));
    }
    /*await this.client.execute(replaceParams(statements, params));*/
  }

  private async checkForTablesWithoutEntityDefinition(tables: Tables[]): Promise<[string, any[]][]> {
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

  private async getTableStatement({
    columnsMetadata,
    name,
    indexes,
    relationsMetadata,
    comment,
  }: EntityMetadata): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    name = this.namingStrategy.tableName(name!);
    const columnIndexes: [string, IndexMetadata[]][] = [];
    // statements.push([`DROP TABLE IF EXISTS ??.??`, [this.options.db, name]]);
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
    const indexStatements = await this.getIndexesStatement(name, columnIndexes, indexes);
    statements.push(...indexStatements);
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

  private async getRelationStatements(): Promise<[string, any[]][]> {
    const statements: [string, any[]][] = [];
    return [];
  }
}
